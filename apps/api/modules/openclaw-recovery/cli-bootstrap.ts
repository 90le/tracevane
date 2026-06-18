import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryInstallManifest,
  OpenClawRecoveryPolicy,
} from "../../../../types/openclaw-recovery.js";
import { resolveOpenClawRecoveryPaths } from "./paths.js";

export interface OpenClawCliAvailabilityResult {
  ok: boolean;
  action: "none" | "manifest" | "shim" | "reinstall";
  error: string;
  manifest: OpenClawRecoveryInstallManifest | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function pathEntries(): string[] {
  return String(process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function executableNames(commandName: string): string[] {
  if (process.platform !== "win32") return [commandName];
  const extensions = String(process.env.PATHEXT || ".EXE;.CMD;.BAT")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return extensions.map((extension) => `${commandName}${extension.toLowerCase()}`);
}

function findExecutableInPath(commandName: string): string {
  for (const entry of pathEntries()) {
    for (const candidateName of executableNames(commandName)) {
      const candidate = path.join(entry, candidateName);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

function safeRealPath(filePath: string): string {
  try {
    return fs.realpathSync(filePath);
  } catch {
    return filePath;
  }
}

function parseCliVersion(stdout: string): string {
  const match = stdout.match(/OpenClaw\s+([^\s]+)/i);
  return match?.[1] || "";
}

function inferInstallKind(realPath: string): OpenClawRecoveryInstallManifest["installKind"] {
  return realPath.includes(`${path.sep}node_modules${path.sep}openclaw${path.sep}`)
    ? "npm-global"
    : realPath
      ? "path"
      : "unknown";
}

function commandSummary(result: OpenClawRecoveryCommandSnapshot): string {
  return [result.error, result.stderr, result.stdout]
    .filter(Boolean)
    .join("\n")
    .trim()
    .slice(0, 800);
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function runOpenClawCliBootstrapCommand(
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

export function readOpenClawRecoveryInstallManifest(
  config: TracevaneServerConfig,
): OpenClawRecoveryInstallManifest | null {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(resolveOpenClawRecoveryPaths(config).installManifestPath, "utf8"),
    ) as OpenClawRecoveryInstallManifest;
    return parsed?.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeOpenClawRecoveryInstallManifest(
  config: TracevaneServerConfig,
  manifest: OpenClawRecoveryInstallManifest,
): OpenClawRecoveryInstallManifest {
  writeJsonAtomic(resolveOpenClawRecoveryPaths(config).installManifestPath, manifest);
  return manifest;
}

export async function captureOpenClawRecoveryInstallManifest(
  config: TracevaneServerConfig,
  commands?: OpenClawRecoveryCommandSnapshot[],
): Promise<OpenClawRecoveryInstallManifest | null> {
  const cliPath = findExecutableInPath("openclaw");
  const version = await runOpenClawCliBootstrapCommand(
    cliPath || "openclaw",
    ["--version"],
    5_000,
  );
  commands?.push(version);
  if (!version.ok) return null;

  const npmPrefix = await runOpenClawCliBootstrapCommand(
    "npm",
    ["prefix", "-g"],
    5_000,
  );
  if (npmPrefix.ok) commands?.push(npmPrefix);

  const cliRealPath = safeRealPath(cliPath || "openclaw");
  const cliVersion = parseCliVersion(version.stdout);
  const packageSpec = cliVersion ? `openclaw@${cliVersion}` : "openclaw@latest";
  return writeOpenClawRecoveryInstallManifest(config, {
    version: 1,
    updatedAt: nowIso(),
    cliPath,
    cliRealPath,
    cliVersion,
    nodePath: process.execPath,
    packageManager: findExecutableInPath("npm") ? "npm" : "unknown",
    packageName: "openclaw",
    packageSpec,
    npmPrefix: npmPrefix.ok ? npmPrefix.stdout.trim() : "",
    installKind: inferInstallKind(cliRealPath),
    projectRoot: config.projectRoot,
  });
}

function prependRecoveryBinToPath(config: TracevaneServerConfig): void {
  const paths = resolveOpenClawRecoveryPaths(config);
  const entries = pathEntries();
  if (!entries.includes(paths.binDir)) {
    process.env.PATH = [paths.binDir, ...entries].join(path.delimiter);
  }
}

export function createOpenClawCliShim(
  config: TracevaneServerConfig,
  manifest: OpenClawRecoveryInstallManifest,
): string {
  if (!manifest.cliRealPath || !fs.existsSync(manifest.cliRealPath)) return "";
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.binDir, { recursive: true });
  const targetUsesNode = /\.(c?js|mjs)$/i.test(manifest.cliRealPath);
  if (process.platform === "win32") {
    fs.writeFileSync(
      paths.cliShimPath,
      [
        "@echo off",
        targetUsesNode
          ? `"${manifest.nodePath || process.execPath}" "${manifest.cliRealPath}" %*`
          : `"${manifest.cliRealPath}" %*`,
        "",
      ].join("\r\n"),
      "utf8",
    );
  } else {
    fs.writeFileSync(
      paths.cliShimPath,
      [
        "#!/bin/sh",
        targetUsesNode
          ? `exec "${manifest.nodePath || process.execPath}" "${manifest.cliRealPath}" "$@"`
          : `exec "${manifest.cliRealPath}" "$@"`,
        "",
      ].join("\n"),
      { encoding: "utf8", mode: 0o755 },
    );
    fs.chmodSync(paths.cliShimPath, 0o755);
  }
  prependRecoveryBinToPath(config);
  return paths.cliShimPath;
}

export async function ensureOpenClawCliAvailable(
  config: TracevaneServerConfig,
  policy: Pick<OpenClawRecoveryPolicy, "allowCliReinstall" | "cliReinstallTimeoutMs">,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<OpenClawCliAvailabilityResult> {
  const initial = await runOpenClawCliBootstrapCommand("openclaw", ["--version"], 5_000);
  commands.push(initial);
  if (initial.ok) {
    const manifest = await captureOpenClawRecoveryInstallManifest(config);
    return { ok: true, action: "none", error: "", manifest };
  }

  const manifest = readOpenClawRecoveryInstallManifest(config);
  if (!manifest) {
    return {
      ok: false,
      action: "none",
      error: `OpenClaw CLI is unavailable and no recovery install manifest exists.\n${commandSummary(initial)}`,
      manifest: null,
    };
  }

  const shimPath = createOpenClawCliShim(config, manifest);
  if (shimPath) {
    const shimCheck = await runOpenClawCliBootstrapCommand("openclaw", ["--version"], 5_000);
    commands.push(shimCheck);
    if (shimCheck.ok) {
      return { ok: true, action: "shim", error: "", manifest };
    }
  }

  if (!policy.allowCliReinstall) {
    return {
      ok: false,
      action: shimPath ? "shim" : "none",
      error: `OpenClaw CLI is unavailable and CLI reinstall is disabled.\n${commandSummary(initial)}`,
      manifest,
    };
  }

  const packageManager = manifest.packageManager === "npm" ? "npm" : "";
  if (!packageManager) {
    return {
      ok: false,
      action: shimPath ? "shim" : "none",
      error: "OpenClaw CLI is unavailable and no supported package manager is recorded.",
      manifest,
    };
  }

  const install = await runOpenClawCliBootstrapCommand(
    packageManager,
    ["install", "-g", manifest.packageSpec || "openclaw@latest"],
    policy.cliReinstallTimeoutMs,
  );
  commands.push(install);
  if (!install.ok) {
    return {
      ok: false,
      action: "reinstall",
      error: commandSummary(install) || "OpenClaw CLI reinstall failed.",
      manifest,
    };
  }

  const finalCheck = await runOpenClawCliBootstrapCommand("openclaw", ["--version"], 5_000);
  commands.push(finalCheck);
  if (!finalCheck.ok) {
    return {
      ok: false,
      action: "reinstall",
      error: commandSummary(finalCheck) || "OpenClaw CLI is still unavailable after reinstall.",
      manifest,
    };
  }

  return {
    ok: true,
    action: "reinstall",
    error: "",
    manifest: await captureOpenClawRecoveryInstallManifest(config),
  };
}
