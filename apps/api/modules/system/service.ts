import fs from "node:fs";
import os from "node:os";
import net from "node:net";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  SystemBootstrapPayload,
  SystemBootstrapRepairResponse,
  SystemDeviceTrustApproveRequest,
  SystemDeviceTrustApproveResponse,
  SystemCommandSnapshot,
  SystemDiagnosticsPayload,
  SystemDeviceTrustPayload,
  SystemDeviceTrustRepairResponse,
  SystemDeviceTrustSettingsPatchRequest,
  SystemDeviceTrustSettingsPatchResponse,
  SystemEventSummaryPayload,
  SystemEventRecord,
  SystemGatewaySnapshot,
  SystemHealthPayload,
  SystemServiceSnapshot,
  SystemTracevaneReleasePayload,
  SystemTracevaneUpgradeRequest,
  SystemTracevaneUpgradeResponse,
  SystemTracevaneUpgradeStatusPayload,
  SystemStatusSummary,
  SystemRuntimeSummaryPayload,
  SystemTerminalActionSuggestion,
} from "../../../../types/system.js";
import { readJsonFile, readOpenClawConfig } from "../../core/state.js";
import {
  applySafeTracevaneBootstrapDefaults,
  getSystemBootstrapSnapshot,
  repairSystemBootstrap,
} from "./bootstrap.js";
import {
  approveDeviceTrustRequest,
  ensureDefaultDeviceTrustSettings,
  getDeviceTrustSnapshot,
  maybeAutoApproveTracevaneHelperPairing,
  patchDeviceTrustSettings,
  repairTracevaneHelperDeviceTrust,
  syncTracevaneHelperTokenCacheIfNeeded,
} from "./device-trust.js";
import {
  buildSystemActionEvents,
} from "./event-normalizer.js";
import { buildSystemEventSummaryCards } from "./event-summary.js";
import { createSystemEventWriter } from "./event-writer.js";
import { buildSystemRuntimeSummary } from "./runtime-summary.js";
import { buildSystemTerminalActionSuggestions } from "./terminal-handoff.js";
import { runSystemOpenClawCommand } from "./openclaw-command.js";
// seam import marker: from './runtime-summary.js'
// seam import marker: from './terminal-handoff.js'

const COMMAND_CACHE_MS = 15_000;
const TRACEVANE_UPDATE_TIMEOUT_MS = 4_500;
const TRACEVANE_UPDATE_SITE_BASE = (
  process.env.TRACEVANE_UPDATE_SITE_BASE || "https://tracevane.90le.cn"
).replace(/\/+$/g, "");
const TRACEVANE_UPDATE_MANIFEST_PATHS = [
  "/tracevane-latest.json",
  "/tracevane-version.json",
  "/version.json",
];
const TRACEVANE_UPGRADE_STATE_RELATIVE_PATH = path.join(
  "tracevane",
  "upgrade-status.json",
);
const TRACEVANE_UPGRADE_LOG_RELATIVE_PATH = path.join("tracevane", "upgrade.log");

interface CachedCommandResult {
  expiresAt: number;
  value: SystemCommandSnapshot;
}

function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeVersionCandidate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().replace(/^v/i, "");
  return normalized || null;
}

function compareVersionSegments(left: string, right: string): number {
  const leftSegments = (left.match(/\d+/g) || []).map(Number);
  const rightSegments = (right.match(/\d+/g) || []).map(Number);
  const size = Math.max(leftSegments.length, rightSegments.length);
  for (let index = 0; index < size; index += 1) {
    const a = leftSegments[index] ?? 0;
    const b = rightSegments[index] ?? 0;
    if (a > b) return 1;
    if (a < b) return -1;
  }
  return 0;
}

function tracevaneUpgradeTargetInstalled(
  config: TracevaneServerConfig,
  status: SystemTracevaneUpgradeStatusPayload,
): boolean {
  const currentVersion = normalizeVersionCandidate(config.version);
  const targetVersion = normalizeVersionCandidate(status.targetVersion);
  return !!currentVersion && !!targetVersion
    && compareVersionSegments(currentVersion, targetVersion) >= 0;
}

function withTimeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  controller.signal.addEventListener("abort", () => clearTimeout(timer), {
    once: true,
  });
  return controller.signal;
}

async function fetchJsonWithTimeout(
  target: string,
  timeoutMs: number,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "tracevane/system-release-check",
      },
      signal: withTimeoutSignal(timeoutMs),
    });
    if (!response.ok) {
      return null;
    }
    const payload = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function fetchTextWithTimeout(
  target: string,
  timeoutMs: number,
): Promise<string> {
  try {
    const response = await fetch(target, {
      method: "GET",
      headers: {
        Accept: "text/html,text/plain;q=0.9,*/*;q=0.8",
        "User-Agent": "tracevane/system-release-check",
      },
      signal: withTimeoutSignal(timeoutMs),
    });
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } catch {
    return "";
  }
}

function resolveTracevaneUpgradeStatePath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, TRACEVANE_UPGRADE_STATE_RELATIVE_PATH);
}

function resolveTracevaneUpgradeLogPath(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, TRACEVANE_UPGRADE_LOG_RELATIVE_PATH);
}

function buildDefaultTracevaneUpgradeStatus(
  config: TracevaneServerConfig,
): SystemTracevaneUpgradeStatusPayload {
  return {
    checkedAt: new Date().toISOString(),
    status: "idle",
    running: false,
    pid: null,
    mode: null,
    targetVersion: null,
    startedAt: null,
    finishedAt: null,
    logFile: resolveTracevaneUpgradeLogPath(config),
    lastError: "",
  };
}

function readTracevaneUpgradeStatus(
  config: TracevaneServerConfig,
): SystemTracevaneUpgradeStatusPayload {
  const filePath = resolveTracevaneUpgradeStatePath(config);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<SystemTracevaneUpgradeStatusPayload>;
    return {
      checkedAt: normalizeDate(parsed.checkedAt) || new Date().toISOString(),
      status:
        parsed.status === "running" ||
        parsed.status === "succeeded" ||
        parsed.status === "failed"
          ? parsed.status
          : "idle",
      running: parsed.running === true,
      pid: Number.isFinite(Number(parsed.pid)) ? Number(parsed.pid) : null,
      mode:
        parsed.mode === "gateway" || parsed.mode === "standalone"
          ? parsed.mode
          : null,
      targetVersion: normalizeString(parsed.targetVersion) || null,
      startedAt: normalizeDate(parsed.startedAt),
      finishedAt: normalizeDate(parsed.finishedAt),
      logFile:
        normalizeString(parsed.logFile) || resolveTracevaneUpgradeLogPath(config),
      lastError: normalizeString(parsed.lastError),
    };
  } catch {
    return buildDefaultTracevaneUpgradeStatus(config);
  }
}

function writeTracevaneUpgradeStatus(
  config: TracevaneServerConfig,
  payload: SystemTracevaneUpgradeStatusPayload,
): void {
  const statePath = resolveTracevaneUpgradeStatePath(config);
  ensureDirectory(path.dirname(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function isPidAlive(pid: number | null): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readTail(filePath: string, maxBytes = 12_000): string {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) {
      return "";
    }
    const length = Math.min(maxBytes, stat.size);
    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(filePath, "r");
    try {
      fs.readSync(fd, buffer, 0, length, Math.max(0, stat.size - length));
    } finally {
      fs.closeSync(fd);
    }
    return buffer.toString("utf-8");
  } catch {
    return "";
  }
}

function resolveConfiguredTracevaneMode(config: TracevaneServerConfig): {
  mode: "standalone" | "gateway";
  apiPort: number;
  basePath: string;
} {
  const openclawConfig = readOpenClawConfig(config);
  const entry = openclawConfig.plugins?.entries?.tracevane;
  const tracevaneConfig =
    entry && typeof entry === "object" && !Array.isArray(entry)
      ? ((entry as Record<string, unknown>).config as
          | Record<string, unknown>
          | undefined)
      : undefined;
  const transport =
    tracevaneConfig?.transport && typeof tracevaneConfig.transport === "object"
      ? (tracevaneConfig.transport as Record<string, unknown>)
      : {};
  const standalone =
    transport.standalone && typeof transport.standalone === "object"
      ? (transport.standalone as Record<string, unknown>)
      : {};
  const gateway =
    transport.gateway && typeof transport.gateway === "object"
      ? (transport.gateway as Record<string, unknown>)
      : {};
  const gatewayEnabled = gateway.enabled === true;
  const standaloneEnabled = standalone.enabled !== false;
  const preferredMode = normalizeString(
    transport.preferredMode ||
      tracevaneConfig?.preferredMode ||
      tracevaneConfig?.mode,
  ).toLowerCase();
  const mode: "standalone" | "gateway" =
    preferredMode === "gateway" && gatewayEnabled
      ? "gateway"
      : preferredMode === "standalone"
        ? "standalone"
        : gatewayEnabled && !standaloneEnabled
          ? "gateway"
          : "standalone";
  const apiPort = Number(
    tracevaneConfig?.apiPort || standalone.port || config.port,
  );
  const basePath =
    normalizeString(
      gateway.basePath,
      config.transport.gateway.basePath || "/tracevane",
    ) || "/tracevane";
  return {
    mode,
    apiPort:
      Number.isFinite(apiPort) && apiPort > 0 ? Math.floor(apiPort) : 3760,
    basePath: basePath.startsWith("/") ? basePath : `/${basePath}`,
  };
}

function appendUpgradeLog(logPath: string, line: string): void {
  ensureDirectory(path.dirname(logPath));
  fs.appendFileSync(logPath, `${line}\n`, "utf-8");
}

function resolvePackageUrl(siteBase: string, version: string): string {
  return `${siteBase}/tracevane-${version}.tar.gz`;
}

async function checkGatewayConnection(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const finish = (value: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.once("timeout", () => finish(false));
  });
}

function extractJsonFromMixedOutput(text: string): Record<string, any> | null {
  const lines = text.split(/\r?\n/);
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trimStart();
    const first = trimmed[0];
    const second = trimmed[1] || "";
    const looksLikeObject = first === "{";
    const looksLikeArray =
      first === "[" &&
      [
        "{",
        "[",
        '"',
        "]",
        "-",
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
      ].includes(second);

    if (looksLikeObject || looksLikeArray) {
      const candidate = text.slice(offset + line.indexOf(trimmed)).trim();
      try {
        const parsed = JSON.parse(candidate);
        return parsed && typeof parsed === "object"
          ? (parsed as Record<string, any>)
          : null;
      } catch {
        // try later lines
      }
    }

    offset += line.length + 1;
  }

  return null;
}

function clipText(value: string, max = 10_000): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n... [truncated ${value.length - max} chars]`;
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return new Date(value).toISOString();
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function emptyCommandSnapshot(error = ""): SystemCommandSnapshot {
  return {
    ok: false,
    durationMs: 0,
    error,
    stdout: "",
    stderr: "",
    parsedJson: null,
  };
}

function readServiceSnapshot(): SystemServiceSnapshot {
  try {
    const output = requireCommandSync("systemctl", [
      "--user",
      "show",
      "openclaw-gateway.service",
      "--property=ActiveState,SubState,UnitFileState,ExecMainPID,FragmentPath",
      "--no-pager",
    ]);

    const lines = output.stdout.split(/\r?\n/).filter(Boolean);
    const map = Object.fromEntries(
      lines.map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
    );

    return {
      activeState: normalizeString(map.ActiveState, "unknown"),
      subState: normalizeString(map.SubState, "unknown"),
      unitFileState: normalizeString(map.UnitFileState, "unknown"),
      execMainPid: Number.isFinite(Number(map.ExecMainPID))
        ? Number(map.ExecMainPID)
        : null,
      fragmentPath: normalizeString(map.FragmentPath),
    };
  } catch {
    return {
      activeState: "unknown",
      subState: "unknown",
      unitFileState: "unknown",
      execMainPid: null,
      fragmentPath: "",
    };
  }
}

function requireCommandSync(
  command: string,
  args: string[],
): { stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: 2_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (
    result.status &&
    result.status !== 0 &&
    !result.stdout &&
    !result.stderr
  ) {
    throw new Error(`${command} exited with ${result.status}`);
  }
  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function buildHostSnapshot() {
  return {
    hostname: os.hostname(),
    arch: process.arch,
    cpus: os.cpus().length,
    loadavg: os.loadavg(),
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
  };
}

function buildGatewaySnapshot(
  gatewayStatus: SystemCommandSnapshot,
): SystemGatewaySnapshot {
  const parsed = gatewayStatus.parsedJson || {};
  return {
    bindMode: normalizeString(parsed.gateway?.bindMode),
    bindHost: normalizeString(parsed.gateway?.bindHost),
    probeUrl: normalizeString(parsed.gateway?.probeUrl),
    version: normalizeString(parsed.gateway?.version || parsed.rpc?.version),
    rpcOk: parsed.rpc?.ok === true,
    rpcUrl: normalizeString(parsed.rpc?.url),
    portStatus: normalizeString(parsed.port?.status),
    portHints: Array.isArray(parsed.port?.hints)
      ? parsed.port.hints.map(String)
      : [],
  };
}

function buildStatusSummary(
  statusCommand: SystemCommandSnapshot,
): SystemStatusSummary {
  const parsed = statusCommand.parsedJson || {};
  return {
    runtimeVersion: normalizeString(parsed.runtimeVersion),
    gatewayReachable: parsed.gateway?.reachable === true,
    gatewayUrl: normalizeString(parsed.gateway?.url),
    gatewayError: normalizeString(parsed.gateway?.error),
    gatewayServiceLabel: normalizeString(parsed.gatewayService?.label),
    gatewayServiceRuntime: normalizeString(parsed.gatewayService?.runtimeShort),
    agentsDefaultId: normalizeString(parsed.agents?.defaultId),
    agentCount: Number(parsed.agents?.agents?.length || 0),
    sessionCount: Number(
      parsed.agents?.totalSessions || parsed.sessions?.count || 0,
    ),
    bootstrapPendingCount: Number(parsed.agents?.bootstrapPendingCount || 0),
    securityCritical: Number(parsed.securityAudit?.summary?.critical || 0),
    securityWarn: Number(parsed.securityAudit?.summary?.warn || 0),
    securityInfo: Number(parsed.securityAudit?.summary?.info || 0),
    updateLatestVersion: normalizeString(
      parsed.update?.registry?.latestVersion,
    ),
    updateInstallKind: normalizeString(parsed.update?.installKind),
    updatePackageManager: normalizeString(parsed.update?.packageManager),
  };
}

function parseTracevaneVersionFromIndexHtml(html: string): {
  latestVersion: string | null;
  minOpenClawVersion: string | null;
} {
  const versionMatch = html.match(
    /const\s+TRACEVANE_VERSION\s*=\s*["']([^"']+)["']/i,
  );
  const minOpenClawMatch = html.match(
    /const\s+OPENCLAW_MIN_VERSION\s*=\s*["']([^"']+)["']/i,
  );
  return {
    latestVersion: normalizeVersionCandidate(versionMatch?.[1]),
    minOpenClawVersion: normalizeVersionCandidate(minOpenClawMatch?.[1]),
  };
}

function extractReleaseFromManifest(
  payload: Record<string, unknown>,
  siteBase: string,
): {
  latestVersion: string | null;
  packageUrl: string | null;
  minOpenClawVersion: string | null;
} {
  const latestVersion = normalizeVersionCandidate(
    payload.latestVersion ||
      payload.version ||
      (payload.tracevane &&
        typeof payload.tracevane === "object" &&
        (payload.tracevane as Record<string, unknown>).version) ||
      (payload.release &&
        typeof payload.release === "object" &&
        (payload.release as Record<string, unknown>).version),
  );
  const packageUrlRaw =
    normalizeString(payload.packageUrl) ||
    normalizeString((payload as Record<string, unknown>).tarballUrl) ||
    normalizeString((payload as Record<string, unknown>).downloadUrl) ||
    "";
  const packageUrl = packageUrlRaw
    ? /^https?:\/\//i.test(packageUrlRaw)
      ? packageUrlRaw
      : `${siteBase}/${packageUrlRaw.replace(/^\/+/, "")}`
    : latestVersion
      ? resolvePackageUrl(siteBase, latestVersion)
      : null;
  const minOpenClawVersion = normalizeVersionCandidate(
    payload.minOpenClawVersion ||
      payload.minHostVersion ||
      (payload.openclaw &&
        typeof payload.openclaw === "object" &&
        (payload.openclaw as Record<string, unknown>).minHostVersion),
  );
  return {
    latestVersion,
    packageUrl,
    minOpenClawVersion,
  };
}

async function queryTracevaneRelease(
  currentVersion: string,
): Promise<SystemTracevaneReleasePayload> {
  const checkedAt = new Date().toISOString();
  const notes: string[] = [];

  for (const manifestPath of TRACEVANE_UPDATE_MANIFEST_PATHS) {
    const target = `${TRACEVANE_UPDATE_SITE_BASE}${manifestPath}`;
    const payload = await fetchJsonWithTimeout(
      target,
      TRACEVANE_UPDATE_TIMEOUT_MS,
    );
    if (!payload) {
      continue;
    }
    const extracted = extractReleaseFromManifest(
      payload,
      TRACEVANE_UPDATE_SITE_BASE,
    );
    if (!extracted.latestVersion) {
      notes.push(`Manifest missing latest version: ${target}`);
      continue;
    }
    return {
      checkedAt,
      currentVersion,
      latestVersion: extracted.latestVersion,
      updateAvailable:
        compareVersionSegments(extracted.latestVersion, currentVersion) > 0,
      source: target,
      packageUrl: extracted.packageUrl,
      minOpenClawVersion: extracted.minOpenClawVersion,
      notes,
    };
  }

  const indexHtml = await fetchTextWithTimeout(
    `${TRACEVANE_UPDATE_SITE_BASE}/`,
    TRACEVANE_UPDATE_TIMEOUT_MS,
  );
  if (indexHtml) {
    const parsed = parseTracevaneVersionFromIndexHtml(indexHtml);
    if (parsed.latestVersion) {
      return {
        checkedAt,
        currentVersion,
        latestVersion: parsed.latestVersion,
        updateAvailable:
          compareVersionSegments(parsed.latestVersion, currentVersion) > 0,
        source: `${TRACEVANE_UPDATE_SITE_BASE}/`,
        packageUrl: resolvePackageUrl(
          TRACEVANE_UPDATE_SITE_BASE,
          parsed.latestVersion,
        ),
        minOpenClawVersion: parsed.minOpenClawVersion,
        notes: [...notes, "Version parsed from index.html fallback"],
      };
    }
  }

  return {
    checkedAt,
    currentVersion,
    latestVersion: null,
    updateAvailable: false,
    source: null,
    packageUrl: null,
    minOpenClawVersion: null,
    notes: [...notes, "No release metadata available from tracevane.90le.cn"],
  };
}

export interface SystemService {
  getHealth(): Promise<SystemHealthPayload>;
  getDiagnostics(options?: { includeCommands?: boolean }): Promise<SystemDiagnosticsPayload>;
  getBootstrap(): Promise<SystemBootstrapPayload>;
  repairBootstrap(): Promise<SystemBootstrapRepairResponse>;
  getTracevaneRelease(): Promise<SystemTracevaneReleasePayload>;
  getTracevaneUpgradeStatus(): Promise<SystemTracevaneUpgradeStatusPayload>;
  startTracevaneUpgrade(
    payload: SystemTracevaneUpgradeRequest,
  ): Promise<SystemTracevaneUpgradeResponse>;
  getRuntimeSummary(): Promise<SystemRuntimeSummaryPayload>;
  getTerminalActionSuggestions(): Promise<SystemTerminalActionSuggestion[]>;
  getDeviceTrust(): Promise<SystemDeviceTrustPayload>;
  approveDeviceTrust(
    payload: SystemDeviceTrustApproveRequest,
  ): Promise<SystemDeviceTrustApproveResponse>;
  repairDeviceTrustHelper(): Promise<SystemDeviceTrustRepairResponse>;
  patchDeviceTrustSettings(
    payload: SystemDeviceTrustSettingsPatchRequest,
  ): Promise<SystemDeviceTrustSettingsPatchResponse>;
  listEvents(limit?: number): Promise<SystemEventRecord[]>;
  getEventSummary(limit?: number): Promise<SystemEventSummaryPayload>;
}

export function createSystemService(
  config: TracevaneServerConfig,
  getSseConnections: () => number,
): SystemService {
  ensureDefaultDeviceTrustSettings(config);
  let bootstrapAutoApplied = false;
  void Promise.resolve().then(() => {
    try {
      bootstrapAutoApplied = applySafeTracevaneBootstrapDefaults(config);
    } catch {
      // best-effort bootstrap defaults
    }
    try {
      syncTracevaneHelperTokenCacheIfNeeded(config);
    } catch {
      // best-effort helper self-heal
    }
    try {
      void maybeAutoApproveTracevaneHelperPairing(config).catch(() => {
        // best-effort helper pairing self-heal
      });
    } catch {
      // best-effort helper pairing self-heal
    }
  });
  const commandCache = new Map<string, CachedCommandResult>();
  const systemEventWriter = createSystemEventWriter({
    stateDir: path.join(config.openclawRoot, "system"),
    maxRecords: 500,
    maxAgeDays: 7,
  });

  async function runCachedCommand(
    cacheKey: string,
    args: string[],
    timeout = 10_000,
  ): Promise<SystemCommandSnapshot> {
    const now = Date.now();
    const cached = commandCache.get(cacheKey);
    if (cached && cached.expiresAt > now) return cached.value;

    const startedAt = Date.now();
    try {
      const result = await runSystemOpenClawCommand(args, {
        timeoutMs: timeout,
        maxOutputBytes: 8 * 1024 * 1024,
      });
      const rawStdout = String(result.stdout || "");
      const rawStderr = String(result.stderr || "");
      const value: SystemCommandSnapshot = {
        ok: result.ok,
        durationMs: result.durationMs,
        error: result.error,
        stdout: clipText(rawStdout),
        stderr: clipText(rawStderr),
        parsedJson: extractJsonFromMixedOutput(rawStdout),
      };
      commandCache.set(cacheKey, { expiresAt: now + COMMAND_CACHE_MS, value });
      return value;
    } catch (error) {
      const cast = error as {
        stdout?: string;
        stderr?: string;
        message?: string;
      };
      const rawStdout = String(cast.stdout || "");
      const rawStderr = String(cast.stderr || "");
      const value: SystemCommandSnapshot = {
        ok: false,
        durationMs: Date.now() - startedAt,
        error: cast.message || "openclaw failed",
        stdout: clipText(rawStdout),
        stderr: clipText(rawStderr),
        parsedJson: extractJsonFromMixedOutput(rawStdout),
      };
      commandCache.set(cacheKey, { expiresAt: now + COMMAND_CACHE_MS, value });
      return value;
    }
  }

  function refreshTracevaneUpgradeStatus(): SystemTracevaneUpgradeStatusPayload {
    const checkedAt = new Date().toISOString();
    const current = readTracevaneUpgradeStatus(config);
    if (!current.running) {
      if (current.status === "failed" && tracevaneUpgradeTargetInstalled(config, current)) {
        const recovered: SystemTracevaneUpgradeStatusPayload = {
          ...current,
          checkedAt,
          running: false,
          pid: null,
          status: "succeeded",
          finishedAt: normalizeDate(current.finishedAt) || checkedAt,
          lastError: "",
        };
        writeTracevaneUpgradeStatus(config, recovered);
        return recovered;
      }
      return {
        ...current,
        checkedAt,
      };
    }
    if (isPidAlive(current.pid)) {
      return {
        ...current,
        checkedAt,
      };
    }

    const logTail = readTail(current.logFile);
    const succeeded =
      /=== Tracevane 安装完成 ===/.test(logTail) ||
      tracevaneUpgradeTargetInstalled(config, current);
    const next: SystemTracevaneUpgradeStatusPayload = {
      ...current,
      checkedAt,
      running: false,
      pid: null,
      status: succeeded ? "succeeded" : "failed",
      finishedAt: normalizeDate(current.finishedAt) || checkedAt,
      lastError: succeeded
        ? ""
        : normalizeString(current.lastError) ||
          normalizeString(logTail.split(/\r?\n/).slice(-8).join("\n")),
    };
    writeTracevaneUpgradeStatus(config, next);
    return next;
  }

  async function buildTracevaneReleaseSnapshot(): Promise<SystemTracevaneReleasePayload> {
    return queryTracevaneRelease(config.version);
  }

  async function runTracevaneUpgrade(
    payload: SystemTracevaneUpgradeRequest,
  ): Promise<SystemTracevaneUpgradeResponse> {
    const current = refreshTracevaneUpgradeStatus();
    if (current.running) {
      return {
        ok: false,
        status: current,
      };
    }

    const configured = resolveConfiguredTracevaneMode(config);
    const mode: "standalone" | "gateway" =
      payload.mode === "gateway" || payload.mode === "standalone"
        ? payload.mode
        : configured.mode;
    if (process.platform === "win32") {
      const checkedAt = new Date().toISOString();
      const failed: SystemTracevaneUpgradeStatusPayload = {
        ...current,
        checkedAt,
        status: "failed",
        running: false,
        pid: null,
        mode,
        targetVersion:
          normalizeVersionCandidate(payload.version)
          || normalizeVersionCandidate(config.version),
        startedAt: null,
        finishedAt: checkedAt,
        lastError:
          "Tracevane self-upgrade is not supported on Windows; install a Windows release without the POSIX installer.",
      };
      writeTracevaneUpgradeStatus(config, failed);
      return {
        ok: false,
        status: failed,
      };
    }

    const installerPath = path.join(
      config.projectRoot,
      "install-tracevane.sh",
    );
    if (!fs.existsSync(installerPath)) {
      const failed: SystemTracevaneUpgradeStatusPayload = {
        ...current,
        checkedAt: new Date().toISOString(),
        status: "failed",
        running: false,
        finishedAt: new Date().toISOString(),
        lastError: `Installer not found: ${installerPath}`,
      };
      writeTracevaneUpgradeStatus(config, failed);
      return {
        ok: false,
        status: failed,
      };
    }

    const siteBaseRaw =
      normalizeString(payload.siteBase) || TRACEVANE_UPDATE_SITE_BASE;
    const siteBase = siteBaseRaw.replace(/\/+$/g, "");
    const basePathRaw =
      normalizeString(payload.basePath) || configured.basePath;
    const basePath = basePathRaw.startsWith("/")
      ? basePathRaw
      : `/${basePathRaw}`;
    const apiPortRaw = Number(payload.apiPort);
    const apiPort =
      Number.isFinite(apiPortRaw) && apiPortRaw > 0
        ? Math.floor(apiPortRaw)
        : configured.apiPort;
    let targetVersion = normalizeVersionCandidate(payload.version);
    if (!targetVersion) {
      const latest = await buildTracevaneReleaseSnapshot();
      targetVersion = latest.latestVersion || config.version;
    }
    if (!targetVersion) {
      targetVersion = config.version;
    }

    const logPath = resolveTracevaneUpgradeLogPath(config);
    ensureDirectory(path.dirname(logPath));
    appendUpgradeLog(
      logPath,
      `\n[${new Date().toISOString()}] tracevane upgrade requested`,
    );

    const args = [
      installerPath,
      "--mode",
      mode,
      "--version",
      targetVersion,
      "--site-base",
      siteBase,
      "--api-port",
      String(apiPort),
      "--base-path",
      basePath,
    ];
    if (payload.skipUpgrade === true) {
      args.push("--skip-upgrade");
    }

    let logFd: number | null = null;
    try {
      logFd = fs.openSync(logPath, "a");
      const child = spawn("bash", args, {
        cwd: config.projectRoot,
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: {
          ...process.env,
          TRACEVANE_MODE: mode,
          TRACEVANE_API_PORT: String(apiPort),
          TRACEVANE_GATEWAY_BASE_PATH: basePath,
        },
      });
      child.unref();

      const running: SystemTracevaneUpgradeStatusPayload = {
        checkedAt: new Date().toISOString(),
        status: "running",
        running: true,
        pid: Number.isFinite(Number(child.pid)) ? Number(child.pid) : null,
        mode,
        targetVersion,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        logFile: logPath,
        lastError: "",
      };
      writeTracevaneUpgradeStatus(config, running);
      return {
        ok: true,
        status: running,
      };
    } catch (error) {
      const failed: SystemTracevaneUpgradeStatusPayload = {
        checkedAt: new Date().toISOString(),
        status: "failed",
        running: false,
        pid: null,
        mode,
        targetVersion,
        startedAt: null,
        finishedAt: new Date().toISOString(),
        logFile: logPath,
        lastError:
          error instanceof Error ? error.message : "Failed to spawn installer",
      };
      writeTracevaneUpgradeStatus(config, failed);
      return {
        ok: false,
        status: failed,
      };
    } finally {
      if (logFd !== null) {
        try {
          fs.closeSync(logFd);
        } catch {
          // no-op
        }
      }
    }
  }

  function appendActionEvent(
    action: Parameters<typeof buildSystemActionEvents>[0]["action"],
    ok: boolean,
  ): void {
    const [event] = buildSystemActionEvents({ action, ok });
    systemEventWriter.persistActionEvent(event as any);
  }

  return {
    async getHealth(): Promise<SystemHealthPayload> {
      const gatewayConnected = await checkGatewayConnection(config.gatewayPort);
      const host = buildHostSnapshot();
      const service = readServiceSnapshot();
      return {
        checkedAt: new Date().toISOString(),
        gateway: gatewayConnected ? "online" : "offline",
        gatewayConnected,
        pid: process.pid,
        version: config.version,
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        hostname: host.hostname,
        uptime: process.uptime(),
        port: config.port,
        gatewayPort: config.gatewayPort,
        sseConnections: getSseConnections(),
        serviceState: service.activeState,
        serviceSubState: service.subState,
        cpus: host.cpus,
        loadavg: host.loadavg,
        totalMemoryBytes: host.totalMemoryBytes,
        freeMemoryBytes: host.freeMemoryBytes,
      };
    },

    async getDiagnostics(options = {}): Promise<SystemDiagnosticsPayload> {
      const openclawConfig = readOpenClawConfig(config);
      const host = buildHostSnapshot();
      const service = readServiceSnapshot();
      const deviceTrust = getDeviceTrustSnapshot(config);
      const bootstrap = getSystemBootstrapSnapshot(
        config,
        bootstrapAutoApplied,
      );
      const includeCommands = options.includeCommands !== false;
      const skippedCommand = (label: string): SystemCommandSnapshot => ({
        ok: false,
        durationMs: 0,
        error: `${label} skipped for fast diagnostics`,
        stdout: "",
        stderr: "",
        parsedJson: null,
      });
      const [gatewayStatus, status, doctor] = includeCommands
        ? await Promise.all([
            runCachedCommand(
              "gateway-status",
              ["gateway", "status", "--json"],
              12_000,
            ),
            runCachedCommand(
              "status-all",
              ["status", "--json"],
              12_000,
            ),
            runCachedCommand("doctor", ["doctor"], 18_000),
          ])
        : [
            skippedCommand("gateway-status"),
            skippedCommand("status-all"),
            skippedCommand("doctor"),
          ];
      const channels = Object.keys(openclawConfig.channels || {}).length;
      const bindings = Array.isArray(openclawConfig.bindings)
        ? openclawConfig.bindings.length
        : 0;
      const agents = Array.isArray(openclawConfig.agents?.list)
        ? openclawConfig.agents.list.length
        : 0;
      const cronJobs = readJsonFile<{ jobs?: Array<unknown> }>(
        path.join(config.openclawRoot, "cron", "jobs.json"),
        { jobs: [] },
      );

      return {
        checkedAt: new Date().toISOString(),
        config: {
          pluginId: config.pluginId,
          pluginName: config.pluginName,
          version: config.version,
          port: config.port,
          autoStart: config.autoStart,
          openclawRoot: config.openclawRoot,
          openclawConfigFile: config.openclawConfigFile,
          projectRoot: config.projectRoot,
          webDistDir: config.webDistDir,
          gatewayPort: config.gatewayPort,
          gatewayWsUrl: config.gatewayWsUrl,
          gatewayControlUiBasePath: config.gatewayControlUiBasePath,
          transport: {
            preferredMode:
              config.transport.preferredMode ||
              (config.transport.gateway.enabled && !config.transport.standalone.enabled
                ? "gateway"
                : "standalone"),
            standalone: {
              enabled: config.transport.standalone.enabled,
              port: config.transport.standalone.port,
            },
            gateway: {
              enabled: config.transport.gateway.enabled,
              basePath: config.transport.gateway.basePath,
            },
          },
        },
        runtime: {
          cwd: process.cwd(),
          pid: process.pid,
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          hostname: host.hostname,
          uptime: process.uptime(),
          sseConnections: getSseConnections(),
          cpus: host.cpus,
          loadavg: host.loadavg,
          totalMemoryBytes: host.totalMemoryBytes,
          freeMemoryBytes: host.freeMemoryBytes,
        },
        counts: {
          agents,
          channels,
          bindings,
          cronJobs: Array.isArray(cronJobs.jobs) ? cronJobs.jobs.length : 0,
          skills: Object.keys(openclawConfig.skills?.entries || {}).length,
        },
        service,
        gateway: buildGatewaySnapshot(gatewayStatus),
        status: buildStatusSummary(status),
        commands: {
          gatewayStatus,
          status,
          doctor,
        },
        deviceTrust,
        bootstrap,
      };
    },

    async getBootstrap(): Promise<SystemBootstrapPayload> {
      return getSystemBootstrapSnapshot(config, bootstrapAutoApplied);
    },

    async repairBootstrap(): Promise<SystemBootstrapRepairResponse> {
      const response = repairSystemBootstrap(config);
      if (response.changed) {
        bootstrapAutoApplied = true;
      }
      appendActionEvent("bootstrap-repair", response.ok);
      return response;
    },

    async getTracevaneRelease(): Promise<SystemTracevaneReleasePayload> {
      return buildTracevaneReleaseSnapshot();
    },

    async getTracevaneUpgradeStatus(): Promise<SystemTracevaneUpgradeStatusPayload> {
      return refreshTracevaneUpgradeStatus();
    },

    async startTracevaneUpgrade(
      payload: SystemTracevaneUpgradeRequest,
    ): Promise<SystemTracevaneUpgradeResponse> {
      const response = await runTracevaneUpgrade(payload);
      appendActionEvent("upgrade", response.ok);
      return response;
    },

    async getRuntimeSummary(): Promise<SystemRuntimeSummaryPayload> {
      const checkedAt = new Date().toISOString();
      const [health, bootstrap, upgradeStatus, deviceTrust] =
        await Promise.all([
          this.getHealth(),
          this.getBootstrap(),
          this.getTracevaneUpgradeStatus(),
          this.getDeviceTrust(),
        ]);
      const bootstrapPendingCount = bootstrap.checks.filter(
        (check) => check.level !== "ok",
      ).length;
      return buildSystemRuntimeSummary({
        checkedAt,
        gatewayConnected: health.gatewayConnected,
        bootstrapPendingCount,
        updateLatestVersion: "",
        updateAvailable: false,
        tracevaneUpgradeRunning: upgradeStatus.running,
        helperRepairPending: deviceTrust.helper.metadataRepairPending,
      });
    },

    async getTerminalActionSuggestions(): Promise<
      SystemTerminalActionSuggestion[]
    > {
      const [bootstrap, deviceTrust] = await Promise.all([
        this.getBootstrap(),
        this.getDeviceTrust(),
      ]);
      return buildSystemTerminalActionSuggestions({
        bootstrapRepairNeeded: !bootstrap.ready,
        helperPendingRepair:
          deviceTrust.helper.metadataRepairPending ||
          deviceTrust.helper.pendingRepair,
      });
    },

    async getDeviceTrust(): Promise<SystemDeviceTrustPayload> {
      return getDeviceTrustSnapshot(config);
    },

    async approveDeviceTrust(
      payload: SystemDeviceTrustApproveRequest,
    ): Promise<SystemDeviceTrustApproveResponse> {
      const response = await approveDeviceTrustRequest(config, payload);
      appendActionEvent("device-trust-approve", response.ok);
      return response;
    },

    async repairDeviceTrustHelper(): Promise<SystemDeviceTrustRepairResponse> {
      const response = await repairTracevaneHelperDeviceTrust(config);
      appendActionEvent("helper-repair", response.ok);
      return response;
    },

    async patchDeviceTrustSettings(
      payload: SystemDeviceTrustSettingsPatchRequest,
    ): Promise<SystemDeviceTrustSettingsPatchResponse> {
      return patchDeviceTrustSettings(config, payload);
    },

    async listEvents(limit = 100): Promise<SystemEventRecord[]> {
      return systemEventWriter.listPersistedEvents(limit);
    },

    async getEventSummary(limit = 100): Promise<SystemEventSummaryPayload> {
      return buildSystemEventSummaryCards(
        systemEventWriter.listPersistedEvents(limit),
      );
    },
  };
}
