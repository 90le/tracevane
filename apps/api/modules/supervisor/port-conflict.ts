import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import type { ServiceDefinition } from "./contracts.js";

const execFileAsync = promisify(execFile);

export interface PortHolder {
  pid: number;
  cmdline: string;
}

export interface PortConflictOutcome {
  /** The daemon port was already occupied. */
  conflict: boolean;
  /** The occupying process was identified as this daemon's own (stale) process. */
  owned: boolean;
  /** The port is free for a fresh start after resolution. */
  resolved: boolean;
  holderPid: number | null;
  holderDescription: string | null;
  detail: string | null;
}

export interface ResolveDaemonPortConflictOptions {
  platform?: NodeJS.Platform;
  /** Pids that legitimately own the port right now (e.g. a live session child). */
  excludePids?: number[];
  processIsAlive?: (pid: number) => boolean;
  connect?: (host: string, port: number) => Promise<boolean>;
  listHolders?: (port: number) => Promise<PortHolder[]>;
  terminate?: (pid: number) => Promise<boolean>;
  removeRuntimeMetadata?: (runtimePath: string, pid: number) => void;
  redact?: string[];
}

const NO_CONFLICT: PortConflictOutcome = {
  conflict: false,
  owned: false,
  resolved: true,
  holderPid: null,
  holderDescription: null,
  detail: null,
};

export function parseHealthUrlTarget(
  healthUrl: string,
): { host: string; port: number } | null {
  try {
    const parsed = new URL(healthUrl);
    const port = parsed.port
      ? Number(parsed.port)
      : parsed.protocol === "https:"
        ? 443
        : 80;
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) return null;
    return { host: parsed.hostname.replace(/^\[|\]$/g, ""), port };
  } catch {
    return null;
  }
}

function defaultConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 400 });
    const finish = (connected: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(connected);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

/** Parse /proc/net/tcp(6) content and return socket inodes LISTENing on the port. */
export function parseProcNetTcpListeners(content: string, port: number): Set<string> {
  const inodes = new Set<string>();
  const hexPort = port.toString(16).toUpperCase().padStart(4, "0");
  for (const line of content.split("\n").slice(1)) {
    const columns = line.trim().split(/\s+/);
    if (columns.length < 10) continue;
    const localAddress = columns[1];
    const state = columns[3];
    if (state !== "0A") continue; // LISTEN
    if (localAddress.split(":")[1] !== hexPort) continue;
    inodes.add(columns[9]);
  }
  return inodes;
}

function linuxSocketInodes(port: number): Set<string> {
  const inodes = new Set<string>();
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    let content: string;
    try {
      content = fs.readFileSync(table, "utf8");
    } catch {
      continue;
    }
    for (const inode of parseProcNetTcpListeners(content, port)) {
      inodes.add(inode);
    }
  }
  return inodes;
}

function linuxPidsForSocketInodes(inodes: Set<string>): number[] {
  const pids = new Set<number>();
  if (inodes.size === 0) return [];
  let entries: string[];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return [];
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const fdDir = `/proc/${entry}/fd`;
    let fds: string[];
    try {
      fds = fs.readdirSync(fdDir);
    } catch {
      continue;
    }
    for (const fd of fds) {
      let target: string;
      try {
        target = fs.readlinkSync(`${fdDir}/${fd}`);
      } catch {
        continue;
      }
      const match = /^socket:\[(\d+)\]$/.exec(target);
      if (match && inodes.has(match[1])) {
        pids.add(Number(entry));
        break;
      }
    }
  }
  return [...pids];
}

function readProcessCmdline(pid: number, platform: NodeJS.Platform): string {
  if (platform === "linux") {
    try {
      return fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim();
    } catch {
      return "";
    }
  }
  return "";
}

async function findDarwinHolders(port: number): Promise<PortHolder[]> {
  let stdout: string;
  try {
    const result = await execFileAsync(
      "lsof",
      ["-nP", `-tiTCP:${port}`, "-sTCP:LISTEN"],
      { timeout: 3_000 },
    );
    stdout = result.stdout;
  } catch {
    return [];
  }
  const holders: PortHolder[] = [];
  for (const token of stdout.split(/\s+/)) {
    const pid = Number(token);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    let cmdline = "";
    try {
      const ps = await execFileAsync(
        "ps",
        ["-p", String(pid), "-o", "command="],
        { timeout: 3_000 },
      );
      cmdline = ps.stdout.trim();
    } catch {
      cmdline = "";
    }
    holders.push({ pid, cmdline });
  }
  return holders;
}

async function findPortHolders(
  port: number,
  platform: NodeJS.Platform,
): Promise<PortHolder[]> {
  if (platform === "darwin") return findDarwinHolders(port);
  if (platform !== "linux") return [];
  const pids = linuxPidsForSocketInodes(linuxSocketInodes(port));
  return pids.map((pid) => ({ pid, cmdline: readProcessCmdline(pid, platform) }));
}

export function isOwnedDaemonProcess(
  definition: ServiceDefinition,
  cmdline: string,
): boolean {
  if (!cmdline) return false;
  const normalized = cmdline.replaceAll("\\", "/");
  const entryPath = definition.entryPath.replaceAll("\\", "/");
  if (entryPath && normalized.includes(entryPath)) return true;
  const basename = path.posix.basename(entryPath);
  // channel-connectors launches as the generic "daemon.js"; its basename alone
  // is not distinctive enough, so also match the module directory pattern.
  if (basename && basename !== "daemon.js" && normalized.includes(basename)) {
    return true;
  }
  if (definition.serviceName && normalized.includes(definition.serviceName)) {
    return true;
  }
  if (normalized.includes(`${definition.id}-daemon`)) return true;
  if (normalized.includes(`${definition.id}/daemon`)) return true;
  return false;
}

function defaultProcessIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true; // EPERM etc.: the process exists but is not ours
  }
}

async function waitForExit(
  pid: number,
  processIsAlive: (pid: number) => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return !processIsAlive(pid);
}

async function terminateProcessTree(
  pid: number,
  processIsAlive: (pid: number) => boolean,
): Promise<boolean> {
  const signal = (sig: NodeJS.Signals): boolean => {
    try {
      process.kill(pid, sig);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return code === "ESRCH";
    }
  };
  if (!signal("SIGTERM")) return !processIsAlive(pid);
  if (await waitForExit(pid, processIsAlive, 3_000)) return true;
  if (!signal("SIGKILL")) return !processIsAlive(pid);
  return waitForExit(pid, processIsAlive, 2_000);
}

function defaultRemoveRuntimeMetadata(runtimePath: string, pid: number): void {
  try {
    const raw = fs.readFileSync(runtimePath, "utf8");
    const parsed = JSON.parse(raw) as { pid?: unknown };
    if (parsed?.pid !== pid) return;
    fs.unlinkSync(runtimePath);
  } catch {
    // best effort
  }
}

function redactText(value: string, secrets: string[]): string {
  let redacted = value;
  for (const secret of secrets) {
    if (secret) redacted = redacted.replaceAll(secret, "[REDACTED]");
  }
  return redacted;
}

/**
 * Detects and resolves a port conflict before (re)starting a daemon.
 * A stale Tracevane daemon process holding the port is terminated; a foreign
 * process is reported and never killed.
 */
export async function resolveDaemonPortConflict(
  definition: ServiceDefinition,
  options: ResolveDaemonPortConflictOptions = {},
): Promise<PortConflictOutcome> {
  const platform = options.platform ?? process.platform;
  if (platform !== "linux" && platform !== "darwin") return NO_CONFLICT;
  const target = parseHealthUrlTarget(definition.healthUrl);
  if (!target) return NO_CONFLICT;
  const connect = options.connect ?? defaultConnect;
  if (!(await connect(target.host, target.port))) return NO_CONFLICT;

  const listHolders = options.listHolders ??
    ((port: number) => findPortHolders(port, platform));
  const exclude = new Set(options.excludePids ?? []);
  const holders = (await listHolders(target.port)).filter(
    (holder) => !exclude.has(holder.pid),
  );
  const secrets = options.redact?.filter(Boolean) ?? [];
  if (holders.length === 0) {
    return {
      conflict: true,
      owned: false,
      resolved: false,
      holderPid: null,
      holderDescription: null,
      detail:
        `Port ${target.port} is in use but the owning process could not be identified (insufficient permissions or holder outside this user).`,
    };
  }

  const holder = holders[0];
  const holderDescription = redactText(holder.cmdline.slice(0, 200), secrets);
  if (!isOwnedDaemonProcess(definition, holder.cmdline)) {
    return {
      conflict: true,
      owned: false,
      resolved: false,
      holderPid: holder.pid,
      holderDescription: holderDescription || null,
      detail:
        `Port ${target.port} is held by an unrelated process (pid ${holder.pid}); it was left running. Stop it manually or reconfigure the daemon port.`,
    };
  }

  const processIsAlive = options.processIsAlive ?? defaultProcessIsAlive;
  const terminate = options.terminate ??
    ((pid: number) => terminateProcessTree(pid, processIsAlive));
  const terminated = await terminate(holder.pid);
  if (!terminated) {
    return {
      conflict: true,
      owned: true,
      resolved: false,
      holderPid: holder.pid,
      holderDescription: holderDescription || null,
      detail:
        `A stale ${definition.displayName} process (pid ${holder.pid}) holds port ${target.port} and could not be terminated.`,
    };
  }
  (options.removeRuntimeMetadata ?? defaultRemoveRuntimeMetadata)(
    definition.runtimePath,
    holder.pid,
  );
  const stillOccupied = await connect(target.host, target.port);
  return {
    conflict: true,
    owned: true,
    resolved: !stillOccupied,
    holderPid: holder.pid,
    holderDescription: holderDescription || null,
    detail: stillOccupied
      ? `A stale ${definition.displayName} process (pid ${holder.pid}) was terminated but port ${target.port} is still occupied.`
      : `A stale ${definition.displayName} process (pid ${holder.pid}) holding port ${target.port} was terminated.`,
  };
}
