import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryLastRepair,
  OpenClawRecoveryPolicy,
  OpenClawRecoveryTrigger,
} from "../../../../types/openclaw-recovery.js";
import { readOpenClawConfig, writeJsonFile } from "../../core/state.js";
import { repairSystemBootstrap } from "../system/bootstrap.js";
import { resolveOpenClawRecoveryPaths } from "./paths.js";
import { probeOpenClawGateway } from "./probe.js";
import {
  appendRecoveryEvent,
  createRecoveryEvent,
  readRecoveryState,
  writeRecoveryState,
} from "./store.js";

function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:.]/g, "");
}

interface OpenClawConfigValidationIssue {
  path?: unknown;
  message?: unknown;
  keyword?: unknown;
  params?: unknown;
}

export function createOpenClawConfigBackup(config: StudioServerConfig): string | null {
  if (!fs.existsSync(config.openclawConfigFile)) return null;
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const backupPath = path.join(
    paths.backupsDir,
    `openclaw-${compactTimestamp()}.json`,
  );
  fs.copyFileSync(config.openclawConfigFile, backupPath);
  return backupPath;
}

function normalizeIssuePath(issue: OpenClawConfigValidationIssue): string {
  const rawPath = typeof issue.path === "string" ? issue.path.trim() : "";
  const params =
    issue.params && typeof issue.params === "object" && !Array.isArray(issue.params)
      ? issue.params as Record<string, unknown>
      : {};
  const additionalProperty =
    typeof params.additionalProperty === "string"
      ? params.additionalProperty
      : "";
  if (additionalProperty && rawPath && !rawPath.endsWith(`.${additionalProperty}`)) {
    return `${rawPath}.${additionalProperty}`;
  }
  return additionalProperty || rawPath;
}

function issueLooksRepairable(issue: OpenClawConfigValidationIssue): boolean {
  const message = String(issue.message || "");
  const keyword = String(issue.keyword || "");
  return (
    keyword === "additionalProperties" ||
    /additional propert|unknown|unrecognized|not allowed|cannot be combined|unsupported/i.test(message)
  );
}

function pathSegments(dotPath: string): string[] {
  return dotPath
    .split(".")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function isProtectedExtensionPath(segments: string[]): boolean {
  if (segments[0] === "channels") return true;
  if (segments[0] === "env" && segments[1] === "vars") return true;
  if (segments[0] === "plugins" && segments[1] === "providerParams") return true;
  if (segments[0] === "plugins" && segments[1] === "entries" && segments[3] === "config") {
    return true;
  }
  return false;
}

function deleteConfigPath(target: Record<string, unknown>, segments: string[]): boolean {
  if (!segments.length) return false;
  let cursor: unknown = target;
  for (const segment of segments.slice(0, -1)) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return false;
  const last = segments[segments.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, last)) return false;
  delete (cursor as Record<string, unknown>)[last];
  return true;
}

function parseValidationIssues(
  commandResult: OpenClawRecoveryCommandSnapshot,
): OpenClawConfigValidationIssue[] {
  try {
    const parsed = JSON.parse(commandResult.stdout || "{}") as {
      issues?: OpenClawConfigValidationIssue[];
    };
    return Array.isArray(parsed.issues) ? parsed.issues : [];
  } catch {
    return [];
  }
}

export function pruneInvalidOpenClawConfigFromValidation(
  config: StudioServerConfig,
  issues: OpenClawConfigValidationIssue[],
): string[] {
  const openclawConfig = readOpenClawConfig(config);
  const changedKeys: string[] = [];
  for (const issue of issues) {
    if (!issueLooksRepairable(issue)) continue;
    const segments = pathSegments(normalizeIssuePath(issue));
    if (!segments.length || isProtectedExtensionPath(segments)) continue;
    if (deleteConfigPath(openclawConfig as Record<string, unknown>, segments)) {
      changedKeys.push(segments.join("."));
    }
  }
  if (changedKeys.length > 0) {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
  }
  return [...new Set(changedKeys)];
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<OpenClawRecoveryCommandSnapshot> {
  const startedAt = Date.now();
  const label = `${command} ${args.join(" ")}`.trim();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;
    let timeout: NodeJS.Timeout | null = setTimeout(() => {
      timeout = null;
      child.kill("SIGTERM");
      if (!settled) {
        settled = true;
        resolve({
          label,
          command,
          args,
          ok: false,
          status: null,
          durationMs: Date.now() - startedAt,
          stdout: Buffer.concat(stdout).toString("utf8"),
          stderr: Buffer.concat(stderr).toString("utf8"),
          error: "Command timed out",
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({
        label,
        command,
        args,
        ok: false,
        status: null,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: error.message,
      });
    });
    child.on("close", (status) => {
      if (timeout) clearTimeout(timeout);
      if (settled) return;
      settled = true;
      resolve({
        label,
        command,
        args,
        ok: status === 0,
        status,
        durationMs: Date.now() - startedAt,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: status === 0 ? "" : `Command exited with status ${status}`,
      });
    });
  });
}

async function runDynamicConfigValidationRepair(
  config: StudioServerConfig,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<string[]> {
  const changedKeys: string[] = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const validation = await runCommand(
      "openclaw",
      ["config", "validate", "--json"],
      10_000,
    );
    commands.push(validation);
    const issues = parseValidationIssues(validation);
    if (validation.ok || !issues.length) break;
    const pruned = pruneInvalidOpenClawConfigFromValidation(config, issues);
    if (!pruned.length) break;
    changedKeys.push(...pruned);
  }
  return [...new Set(changedKeys)];
}

function acquireRepairLock(config: StudioServerConfig): number | null {
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.rootDir, { recursive: true });
  try {
    const fd = fs.openSync(paths.lockPath, "wx");
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
    return fd;
  } catch {
    return null;
  }
}

function releaseRepairLock(config: StudioServerConfig, fd: number): void {
  const paths = resolveOpenClawRecoveryPaths(config);
  try {
    fs.closeSync(fd);
  } catch {
    // no-op
  }
  try {
    fs.unlinkSync(paths.lockPath);
  } catch {
    // no-op
  }
}

export async function runOpenClawRecoveryRepair(
  config: StudioServerConfig,
  options: {
    trigger: OpenClawRecoveryTrigger;
    policy: OpenClawRecoveryPolicy;
  },
): Promise<OpenClawRecoveryLastRepair> {
  const lockFd = acquireRepairLock(config);
  const startedAt = new Date().toISOString();
  if (lockFd === null) {
    return {
      ok: false,
      trigger: options.trigger,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: 0,
      backupPath: null,
      changedKeys: [],
      commands: [],
      error: "Recovery repair is already running",
    };
  }

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: "repair_started",
      severity: "info",
      title: "OpenClaw 自愈已开始",
      summary: `Recovery daemon started a ${options.trigger} repair attempt.`,
      status: "running",
      details: { trigger: options.trigger },
    }),
  );

  const commands: OpenClawRecoveryCommandSnapshot[] = [];
  let backupPath: string | null = null;
  const changedKeys: string[] = [];
  let error = "";
  let ok = false;

  try {
    backupPath = createOpenClawConfigBackup(config);
    if (backupPath) {
      appendRecoveryEvent(
        config,
        createRecoveryEvent({
          kind: "config_backup_created",
          severity: "success",
          title: "OpenClaw 配置备份已创建",
          summary: path.basename(backupPath),
          status: "succeeded",
          details: { backupPath },
        }),
      );
    }

    changedKeys.push(...await runDynamicConfigValidationRepair(config, commands));
    const bootstrap = repairSystemBootstrap(config);
    if (bootstrap.changed) changedKeys.push(...bootstrap.changedKeys);

    commands.push(await runCommand("openclaw", ["config", "validate", "--json"], 10_000));
    commands.push(await runCommand("openclaw", ["doctor", "--non-interactive"], 20_000));
    if (options.policy.runDoctorFix) {
      commands.push(
        await runCommand(
          "openclaw",
          ["doctor", "--fix", "--non-interactive"],
          30_000,
        ),
      );
    }
    commands.push(await runCommand("openclaw", ["gateway", "restart"], 20_000));

    ok = await probeOpenClawGateway(config.gatewayPort, options.policy.probeTimeoutMs);
    if (!ok) {
      error = "Gateway probe still failed after repair";
    }
  } catch (repairError) {
    error =
      repairError instanceof Error
        ? repairError.message
        : "Recovery repair failed";
  } finally {
    releaseRepairLock(config, lockFd);
  }

  const finishedAt = new Date().toISOString();
  const repair: OpenClawRecoveryLastRepair = {
    ok,
    trigger: options.trigger,
    startedAt,
    finishedAt,
    durationMs: Date.parse(finishedAt) - Date.parse(startedAt),
    backupPath,
    changedKeys: [...new Set(changedKeys)],
    commands,
    error,
  };

  const state = readRecoveryState(config);
  writeRecoveryState(config, {
    ...state,
    status: ok ? "healthy" : "failed",
    lastRepair: repair,
    probe: {
      ...state.probe,
      gatewayReachable: ok,
      checkedAt: finishedAt,
      failureStartedAt: ok ? null : state.probe.failureStartedAt,
      failureDurationMs: ok ? 0 : state.probe.failureDurationMs,
    },
    notes: ok
      ? ["Recovery repair completed and gateway probe succeeded."]
      : [error || "Recovery repair completed but gateway did not recover."],
  });

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: ok ? "repair_succeeded" : "repair_failed",
      severity: ok ? "success" : "error",
      title: ok ? "OpenClaw 自愈成功" : "OpenClaw 自愈失败",
      summary: ok
        ? "Gateway probe succeeded after repair."
        : error || "Gateway probe failed after repair.",
      status: ok ? "succeeded" : "failed",
      details: {
        trigger: options.trigger,
        backupPath,
        changedKeys: repair.changedKeys,
      },
    }),
  );

  return repair;
}

export function restoreOpenClawRecoveryBackup(
  config: StudioServerConfig,
  backupPath: string,
): void {
  fs.copyFileSync(backupPath, config.openclawConfigFile);
}
