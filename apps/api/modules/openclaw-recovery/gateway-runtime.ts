import type { OpenClawRecoveryCommandSnapshot } from "../../../../types/openclaw-recovery.js";
import { runOpenClawCliBootstrapCommand } from "./cli-bootstrap.js";

export interface OpenClawGatewayProcessInfo {
  pid: number;
  ppid: number | null;
  command: string;
  args: string;
}

export interface OpenClawGatewayPortListener {
  pid: number;
  command: string;
  address: string;
  process: OpenClawGatewayProcessInfo | null;
  safeToTerminate: boolean;
  reason: string;
}

export interface OpenClawGatewayRuntimeSnapshot {
  port: number;
  listeners: OpenClawGatewayPortListener[];
  safeListenerPids: number[];
  unsafeListenerPids: number[];
  notes: string[];
}

export interface OpenClawGatewayTakeoverResult {
  attempted: boolean;
  terminatedPids: number[];
  skippedPids: number[];
  snapshot: OpenClawGatewayRuntimeSnapshot;
  error: string;
}

function firstLine(value: string): string {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "";
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && value > 0))];
}

export function parseLsofListeners(stdout: string, port: number): Array<{ pid: number; command: string; address: string }> {
  return stdout
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\s+/);
      const pid = Number(parts[1]);
      const address = parts.slice(8).join(" ");
      return {
        pid: Number.isFinite(pid) ? pid : 0,
        command: parts[0] || "",
        address,
      };
    })
    .filter((listener) =>
      listener.pid > 0 &&
      listener.address.includes(`:${port}`) &&
      /\(LISTEN\)|LISTEN/i.test(listener.address),
    );
}

export function parseSsListeners(stdout: string, port: number): Array<{ pid: number; command: string; address: string }> {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(`:${port}`))
    .map((line) => {
      const pidMatch = line.match(/pid=(\d+)/);
      const commandMatch = line.match(/users:\(\("([^"]+)"/);
      return {
        pid: pidMatch ? Number(pidMatch[1]) : 0,
        command: commandMatch?.[1] || "",
        address: line,
      };
    })
    .filter((listener) => listener.pid > 0);
}

function parseProcessInfo(stdout: string): OpenClawGatewayProcessInfo | null {
  const line = firstLine(stdout);
  if (!line) return null;
  const parts = line.split(/\s+/);
  const pid = Number(parts[0]);
  const ppid = Number(parts[1]);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  return {
    pid,
    ppid: Number.isFinite(ppid) ? ppid : null,
    command: parts[2] || "",
    args: parts.slice(3).join(" "),
  };
}

export function isOpenClawGatewayProcess(input: {
  pid: number;
  command: string;
  process: OpenClawGatewayProcessInfo | null;
}): { safe: boolean; reason: string } {
  if (!input.pid || input.pid === process.pid) {
    return { safe: false, reason: "current-process" };
  }
  const text = [
    input.command,
    input.process?.command || "",
    input.process?.args || "",
  ].join(" ");
  if (!/openclaw/i.test(text)) {
    return { safe: false, reason: "not-openclaw" };
  }
  if (!/\bgateway\b/i.test(text)) {
    return { safe: false, reason: "not-gateway" };
  }
  return { safe: true, reason: "openclaw-gateway" };
}

async function readProcessInfo(
  pid: number,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<OpenClawGatewayProcessInfo | null> {
  const ps = await runOpenClawCliBootstrapCommand(
    "ps",
    ["-p", String(pid), "-o", "pid=", "-o", "ppid=", "-o", "comm=", "-o", "args="],
    2_000,
  );
  commands.push(ps);
  return ps.ok ? parseProcessInfo(ps.stdout) : null;
}

async function discoverRawListeners(
  port: number,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<Array<{ pid: number; command: string; address: string }>> {
  const lsof = await runOpenClawCliBootstrapCommand(
    "lsof",
    ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"],
    2_000,
  );
  commands.push(lsof);
  const lsofListeners = lsof.ok ? parseLsofListeners(lsof.stdout, port) : [];
  if (lsofListeners.length > 0) return lsofListeners;

  const ss = await runOpenClawCliBootstrapCommand(
    "ss",
    ["-ltnp"],
    2_000,
  );
  commands.push(ss);
  return ss.ok ? parseSsListeners(ss.stdout, port) : [];
}

export async function discoverOpenClawGatewayRuntime(
  port: number,
  commands: OpenClawRecoveryCommandSnapshot[] = [],
): Promise<OpenClawGatewayRuntimeSnapshot> {
  const rawListeners = await discoverRawListeners(port, commands);
  const listeners: OpenClawGatewayPortListener[] = [];
  for (const raw of rawListeners) {
    const processInfo = await readProcessInfo(raw.pid, commands);
    const safety = isOpenClawGatewayProcess({
      pid: raw.pid,
      command: raw.command,
      process: processInfo,
    });
    listeners.push({
      ...raw,
      process: processInfo,
      safeToTerminate: safety.safe,
      reason: safety.reason,
    });
  }

  const safeListenerPids = uniqueNumbers(
    listeners.filter((listener) => listener.safeToTerminate).map((listener) => listener.pid),
  );
  const unsafeListenerPids = uniqueNumbers(
    listeners.filter((listener) => !listener.safeToTerminate).map((listener) => listener.pid),
  );

  return {
    port,
    listeners,
    safeListenerPids,
    unsafeListenerPids,
    notes: listeners.length
      ? []
      : ["No gateway port listeners were discovered, or process details are unavailable."],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!processExists(pid)) return true;
    await sleep(100);
  }
  return !processExists(pid);
}

async function terminatePid(pid: number, timeoutMs: number): Promise<{ ok: boolean; error: string }> {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    return processExists(pid)
      ? { ok: false, error: error instanceof Error ? error.message : "SIGTERM failed" }
      : { ok: true, error: "" };
  }
  if (await waitForExit(pid, Math.max(500, Math.floor(timeoutMs / 2)))) {
    return { ok: true, error: "" };
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    return processExists(pid)
      ? { ok: false, error: error instanceof Error ? error.message : "SIGKILL failed" }
      : { ok: true, error: "" };
  }
  return await waitForExit(pid, Math.max(500, Math.floor(timeoutMs / 2)))
    ? { ok: true, error: "" }
    : { ok: false, error: "process did not exit after SIGKILL" };
}

export async function takeoverOpenClawGatewayListeners(
  port: number,
  options: {
    allow: boolean;
    timeoutMs: number;
  },
  commands: OpenClawRecoveryCommandSnapshot[] = [],
): Promise<OpenClawGatewayTakeoverResult> {
  const snapshot = await discoverOpenClawGatewayRuntime(port, commands);
  if (!options.allow || snapshot.safeListenerPids.length === 0) {
    return {
      attempted: false,
      terminatedPids: [],
      skippedPids: snapshot.listeners.map((listener) => listener.pid),
      snapshot,
      error: options.allow ? "" : "gateway process takeover is disabled",
    };
  }

  const terminatedPids: number[] = [];
  const errors: string[] = [];
  for (const pid of snapshot.safeListenerPids) {
    const result = await terminatePid(pid, options.timeoutMs);
    if (result.ok) {
      terminatedPids.push(pid);
    } else {
      errors.push(`${pid}: ${result.error}`);
    }
  }

  return {
    attempted: true,
    terminatedPids,
    skippedPids: snapshot.unsafeListenerPids,
    snapshot,
    error: errors.join("\n"),
  };
}
