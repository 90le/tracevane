import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  OpenClawRecoveryCommandSnapshot,
  OpenClawRecoveryLastRepair,
  OpenClawRecoveryPolicy,
  OpenClawRecoveryTrigger,
} from "../../../../types/openclaw-recovery.js";
import {
  resolveSecretInputString,
  type OpenClawSecretRef,
} from "../../core/secret-ref.js";
import { readOpenClawConfig, writeJsonFile } from "../../core/state.js";
import { repairSystemBootstrap } from "../system/bootstrap.js";
import { ensureOpenClawCliAvailable } from "./cli-bootstrap.js";
import {
  assessOpenClawGatewayServiceStatus,
  parseOpenClawGatewayStatus,
  type OpenClawGatewayServiceRepairAssessment,
} from "./gateway-service.js";
import { takeoverOpenClawGatewayListeners } from "./gateway-runtime.js";
import { resolveOpenClawRecoveryPaths } from "./paths.js";
import {
  probeOpenClawGatewayDeep,
  type OpenClawGatewayDeepProbeResult,
} from "./probe.js";
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

interface OpenClawDoctorFinding extends OpenClawConfigValidationIssue {
  checkId?: unknown;
  severity?: unknown;
  pluginId?: unknown;
  id?: unknown;
}

const REPAIR_ALREADY_RUNNING_ERROR = "Recovery repair is already running";
const REPAIR_LOCK_STALE_MS = 30 * 60 * 1000;
const GATEWAY_AUTH_ENV_KEY = "OPENCLAW_GATEWAY_TOKEN";
const DISCORD_BOT_TOKEN_ENV_KEY = "OPENCLAW_DISCORD_BOT_TOKEN";
const CANONICAL_GATEWAY_AUTH_REF: OpenClawSecretRef = {
  source: "env",
  provider: "default",
  id: GATEWAY_AUTH_ENV_KEY,
};
const DEPRECATED_OPENCLAW_PLUGIN_IDS = new Set(["acpx", "discord"]);
const RUNTIME_BACKUP_ENV_LABEL = "env";
const RUNTIME_BACKUP_SYSTEMD_ENV_LABEL = "gateway-systemd-env";
const RUNTIME_BACKUP_TRACEVANE_LOCAL_SECRETS_LABEL = "tracevane-local-secrets";

export interface TracevaneWebBundleInspection {
  ok: boolean;
  webDistDir: string;
  indexPath: string;
  assetsDir: string;
  assetCount: number;
  missing: string[];
}

export function createOpenClawConfigBackup(config: TracevaneServerConfig): string | null {
  if (!fs.existsSync(config.openclawConfigFile)) return null;
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.backupsDir, { recursive: true });
  const backupPath = path.join(
    paths.backupsDir,
    `openclaw-${compactTimestamp()}.json`,
  );
  fs.copyFileSync(config.openclawConfigFile, backupPath);
  createRuntimeSidecarBackups(config, backupPath);
  return backupPath;
}

function runtimeSidecarBackupPath(configBackupPath: string, label: string): string {
  const parsed = path.parse(configBackupPath);
  return path.join(parsed.dir, `${parsed.name}.${label}${parsed.ext}`);
}

function tracevaneLocalSecretFilePath(openclawConfig: Record<string, unknown>): string {
  const providers = isRecord(openclawConfig.secrets)
    && isRecord(openclawConfig.secrets.providers)
    ? openclawConfig.secrets.providers
    : {};
  const provider = isRecord(providers["tracevane-local"]) ? providers["tracevane-local"] : null;
  const filePath = typeof provider?.path === "string" ? provider.path.trim() : "";
  if (!filePath || provider?.source !== "file" || provider?.mode !== "json") return "";
  return filePath;
}

function createRuntimeSidecarBackups(
  config: TracevaneServerConfig,
  configBackupPath: string,
): void {
  const openclawConfig = readOpenClawConfig(config);
  const targets = [
    {
      label: RUNTIME_BACKUP_ENV_LABEL,
      path: path.join(config.openclawRoot, ".env"),
    },
    {
      label: RUNTIME_BACKUP_SYSTEMD_ENV_LABEL,
      path: path.join(config.openclawRoot, "gateway.systemd.env"),
    },
    {
      label: RUNTIME_BACKUP_TRACEVANE_LOCAL_SECRETS_LABEL,
      path: tracevaneLocalSecretFilePath(openclawConfig),
    },
  ];
  for (const target of targets) {
    if (!target.path || !fs.existsSync(target.path)) continue;
    fs.copyFileSync(
      target.path,
      runtimeSidecarBackupPath(configBackupPath, target.label),
    );
  }
}

function restoreRuntimeSidecarBackup(
  sourceBackupPath: string,
  destinationPath: string,
  label: string,
): void {
  if (!destinationPath) return;
  const sidecarBackupPath = runtimeSidecarBackupPath(sourceBackupPath, label);
  if (!fs.existsSync(sidecarBackupPath)) return;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sidecarBackupPath, destinationPath);
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

function parseDoctorFindings(
  commandResult: OpenClawRecoveryCommandSnapshot,
): OpenClawDoctorFinding[] {
  try {
    const parsed = JSON.parse(commandResult.stdout || "{}") as {
      findings?: OpenClawDoctorFinding[];
    };
    return Array.isArray(parsed.findings) ? parsed.findings : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function unquoteEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\""))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseEnvAssignment(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const body = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
  const separator = body.indexOf("=");
  if (separator <= 0) return null;
  const key = body.slice(0, separator).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;
  return {
    key,
    value: unquoteEnvValue(body.slice(separator + 1)),
  };
}

function readEnvFileValue(filePath: string, key: string): string {
  try {
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const assignment = parseEnvAssignment(line);
      if (assignment?.key === key) return assignment.value.trim();
    }
  } catch {
    return "";
  }
  return "";
}

function serializeEnvValue(value: string): string {
  return value.replace(/\r?\n/g, "").trim();
}

function rewriteOpenClawEnvFile(
  filePath: string,
  options: {
    label: string;
    gatewayAuthToken: string;
    removeKeys: string[];
  },
): string[] {
  const original = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
  const inputLines = original ? original.split(/\r?\n/) : [];
  if (inputLines.at(-1) === "") inputLines.pop();

  const outputLines: string[] = [];
  const changedKeys: string[] = [];
  let gatewayWritten = false;
  let gatewayChanged = false;
  let removedDiscordToken = false;
  const removeKeySet = new Set(options.removeKeys);

  for (const line of inputLines) {
    const assignment = parseEnvAssignment(line);
    if (assignment && removeKeySet.has(assignment.key)) {
      removedDiscordToken = true;
      continue;
    }
    if (assignment?.key === GATEWAY_AUTH_ENV_KEY) {
      if (gatewayWritten) {
        gatewayChanged = true;
        continue;
      }
      const nextLine = `${GATEWAY_AUTH_ENV_KEY}=${serializeEnvValue(options.gatewayAuthToken)}`;
      outputLines.push(nextLine);
      gatewayWritten = true;
      if (assignment.value !== options.gatewayAuthToken || line !== nextLine) {
        gatewayChanged = true;
      }
      continue;
    }
    outputLines.push(line);
  }

  if (options.gatewayAuthToken && !gatewayWritten) {
    outputLines.push(`${GATEWAY_AUTH_ENV_KEY}=${serializeEnvValue(options.gatewayAuthToken)}`);
    gatewayChanged = true;
  }

  if (gatewayChanged || removedDiscordToken) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${outputLines.join("\n")}\n`, "utf8");
  }
  if (gatewayChanged) changedKeys.push(`${options.label}.${GATEWAY_AUTH_ENV_KEY}`);
  if (removedDiscordToken) changedKeys.push(`${options.label}.${DISCORD_BOT_TOKEN_ENV_KEY}`);
  return changedKeys;
}

function readTracevaneLocalGatewayAuthToken(openclawConfig: Record<string, unknown>): string {
  const filePath = tracevaneLocalSecretFilePath(openclawConfig);
  if (!filePath) return "";
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    return isRecord(parsed) && typeof parsed.gatewayAuthToken === "string"
      ? parsed.gatewayAuthToken.trim()
      : "";
  } catch {
    return "";
  }
}

function removeTracevaneLocalGatewayAuthToken(openclawConfig: Record<string, unknown>): boolean {
  const filePath = tracevaneLocalSecretFilePath(openclawConfig);
  if (!filePath) return false;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
    if (!isRecord(parsed) || !Object.prototype.hasOwnProperty.call(parsed, "gatewayAuthToken")) {
      return false;
    }
    delete parsed.gatewayAuthToken;
    writeJsonFile(filePath, parsed);
    return true;
  } catch {
    return false;
  }
}

function gatewayAuthTokenCandidate(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, unknown>,
): string {
  const envPath = path.join(config.openclawRoot, ".env");
  const systemdEnvPath = path.join(config.openclawRoot, "gateway.systemd.env");
  const tokenInput = isRecord(openclawConfig.gateway)
    && isRecord(openclawConfig.gateway.auth)
    ? openclawConfig.gateway.auth.token
    : undefined;
  return [
    resolveSecretInputString(openclawConfig, tokenInput, { envFilePath: envPath }),
    readEnvFileValue(envPath, GATEWAY_AUTH_ENV_KEY),
    readEnvFileValue(systemdEnvPath, GATEWAY_AUTH_ENV_KEY),
    readTracevaneLocalGatewayAuthToken(openclawConfig),
  ].map((candidate) => candidate.trim()).find(Boolean) || "";
}

function canonicalGatewayAuthRefEquals(value: unknown): boolean {
  return isRecord(value)
    && value.source === CANONICAL_GATEWAY_AUTH_REF.source
    && value.provider === CANONICAL_GATEWAY_AUTH_REF.provider
    && value.id === CANONICAL_GATEWAY_AUTH_REF.id
    && Object.keys(value).length === 3;
}

export function repairOpenClawGatewayAuthSecretRefDrift(
  config: TracevaneServerConfig,
): string[] {
  const openclawConfig = readOpenClawConfig(config);
  const changedKeys: string[] = [];
  const token = gatewayAuthTokenCandidate(config, openclawConfig);
  const envPath = path.join(config.openclawRoot, ".env");
  const systemdEnvPath = path.join(config.openclawRoot, "gateway.systemd.env");

  if (token) {
    openclawConfig.gateway = isRecord(openclawConfig.gateway) ? openclawConfig.gateway : {};
    openclawConfig.gateway.auth = isRecord(openclawConfig.gateway.auth)
      ? openclawConfig.gateway.auth
      : {};
    if (!canonicalGatewayAuthRefEquals(openclawConfig.gateway.auth.token)) {
      openclawConfig.gateway.auth.token = { ...CANONICAL_GATEWAY_AUTH_REF };
      changedKeys.push("gateway.auth.token");
    }
  }

  const envChangedKeys = [
    ...rewriteOpenClawEnvFile(envPath, {
      label: "env",
      gatewayAuthToken: token,
      removeKeys: [DISCORD_BOT_TOKEN_ENV_KEY],
    }),
    ...rewriteOpenClawEnvFile(systemdEnvPath, {
      label: "gateway.systemd.env",
      gatewayAuthToken: token,
      removeKeys: [DISCORD_BOT_TOKEN_ENV_KEY],
    }),
  ];
  changedKeys.push(...envChangedKeys);

  if (token && removeTracevaneLocalGatewayAuthToken(openclawConfig)) {
    changedKeys.push("secrets.providers.tracevane-local.gatewayAuthToken");
  }
  if (changedKeys.includes("gateway.auth.token")) {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
  }
  return [...new Set(changedKeys)];
}

function bindingReferencesDeprecatedOpenClawPlugin(binding: unknown): boolean {
  if (!isRecord(binding)) return false;
  const match = isRecord(binding.match) ? binding.match : {};
  const acp = isRecord(binding.acp) ? binding.acp : {};
  const channel = normalizeString(match.channel);
  const backend = normalizeString(acp.backend || binding.backend);
  return DEPRECATED_OPENCLAW_PLUGIN_IDS.has(channel)
    || DEPRECATED_OPENCLAW_PLUGIN_IDS.has(backend);
}

function archiveLegacyOpenClawPluginInstallIndex(config: TracevaneServerConfig): string[] {
  const indexPath = path.join(config.openclawRoot, "plugins", "installs.json");
  if (!fs.existsSync(indexPath)) return [];
  let raw = "";
  try {
    raw = fs.readFileSync(indexPath, "utf8");
  } catch {
    return [];
  }
  if (!/"(?:acpx|discord)"/i.test(raw)) {
    return [];
  }
  const backupDir = path.join(config.openclawRoot, "plugins", "legacy-backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `installs-${compactTimestamp()}.json.bak`,
  );
  fs.renameSync(indexPath, backupPath);
  return ["plugins.installs.legacyIndex"];
}

export function pruneDeprecatedOpenClawPluginResidue(
  config: TracevaneServerConfig,
): string[] {
  const openclawConfig = readOpenClawConfig(config);
  const changedKeys: string[] = [];
  let configChanged = false;

  const plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
  if (Array.isArray(plugins.allow)) {
    const before = normalizeStringList(plugins.allow);
    const after = before.filter((pluginId) => !DEPRECATED_OPENCLAW_PLUGIN_IDS.has(pluginId));
    if (after.length !== before.length) {
      plugins.allow = after;
      openclawConfig.plugins = plugins;
      configChanged = true;
      changedKeys.push("plugins.allow");
    }
  }

  if (isRecord(plugins.entries)) {
    for (const pluginId of DEPRECATED_OPENCLAW_PLUGIN_IDS) {
      if (!Object.prototype.hasOwnProperty.call(plugins.entries, pluginId)) continue;
      delete plugins.entries[pluginId];
      configChanged = true;
      changedKeys.push(`plugins.entries.${pluginId}`);
    }
  }

  const channels = isRecord(openclawConfig.channels) ? openclawConfig.channels : {};
  if (Object.prototype.hasOwnProperty.call(channels, "discord")) {
    delete channels.discord;
    openclawConfig.channels = channels;
    configChanged = true;
    changedKeys.push("channels.discord");
  }

  if (Array.isArray(openclawConfig.bindings)) {
    const before = openclawConfig.bindings.length;
    openclawConfig.bindings = openclawConfig.bindings.filter(
      (binding: unknown) => !bindingReferencesDeprecatedOpenClawPlugin(binding),
    );
    if (openclawConfig.bindings.length !== before) {
      configChanged = true;
      changedKeys.push("bindings.deprecatedPlugin");
    }
  }

  if (configChanged) {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
  }
  changedKeys.push(...archiveLegacyOpenClawPluginInstallIndex(config));
  return [...new Set(changedKeys)];
}

function pluginIdFromFinding(finding: OpenClawDoctorFinding): string {
  const direct =
    typeof finding.pluginId === "string"
      ? finding.pluginId
      : typeof finding.id === "string"
        ? finding.id
        : "";
  if (direct) return direct.trim();

  const segments = pathSegments(normalizeIssuePath(finding));
  if (segments[0] === "plugins" && segments[1] === "entries" && segments[2]) {
    return segments[2];
  }

  const text = `${String(finding.checkId || "")}\n${String(finding.message || "")}`;
  const pathMatch = text.match(/plugins\.entries\.([A-Za-z0-9_-]+)/);
  if (pathMatch?.[1]) return pathMatch[1];
  const pluginMatch = text.match(/plugin\s+["'`]([A-Za-z0-9_-]+)["'`]/i);
  return pluginMatch?.[1] || "";
}

function findingLooksPluginRelated(finding: OpenClawDoctorFinding): boolean {
  const pathText = normalizeIssuePath(finding);
  const checkText = String(finding.checkId || "");
  const message = String(finding.message || "");
  return (
    pathText.startsWith("plugins.") ||
    /plugin/i.test(checkText) ||
    /plugin/i.test(message)
  );
}

export function repairOpenClawPluginConfigFromFindings(
  config: TracevaneServerConfig,
  findings: OpenClawDoctorFinding[],
): string[] {
  const openclawConfig = readOpenClawConfig(config);
  const plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
  const entries = isRecord(plugins.entries) ? plugins.entries : {};
  const changedKeys: string[] = [];

  for (const finding of findings) {
    if (!findingLooksPluginRelated(finding)) continue;
    const pluginId = pluginIdFromFinding(finding);
    if (!pluginId || pluginId === "tracevane") continue;
    const entry = isRecord(entries[pluginId]) ? entries[pluginId] : null;
    if (!entry || entry.enabled === false) continue;
    entry.enabled = false;
    changedKeys.push(`plugins.entries.${pluginId}.enabled`);
  }

  if (changedKeys.length > 0) {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
  }
  return [...new Set(changedKeys)];
}

export function pruneMissingOpenClawPluginLoadPaths(
  config: TracevaneServerConfig,
): string[] {
  const openclawConfig = readOpenClawConfig(config);
  const plugins = isRecord(openclawConfig.plugins) ? openclawConfig.plugins : {};
  const load = isRecord(plugins.load) ? plugins.load : {};
  const loadPaths = normalizeStringList(load.paths);
  if (!loadPaths.length) return [];

  const kept = loadPaths.filter((loadPath) => {
    if (!path.isAbsolute(loadPath)) return true;
    return fs.existsSync(loadPath);
  });
  if (kept.length === loadPaths.length) return [];

  load.paths = kept;
  plugins.load = load;
  openclawConfig.plugins = plugins;
  writeJsonFile(config.openclawConfigFile, openclawConfig);
  return ["plugins.load.paths"];
}

function parsePluginListFindings(
  commandResult: OpenClawRecoveryCommandSnapshot,
): OpenClawDoctorFinding[] {
  try {
    const parsed = JSON.parse(commandResult.stdout || "{}") as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.entries)
        ? parsed.entries
        : isRecord(parsed) && Array.isArray(parsed.plugins)
          ? parsed.plugins
          : [];
    return rows
      .filter(isRecord)
      .filter((row) =>
        row.ok === false ||
        row.valid === false ||
        row.status === "error" ||
        typeof row.error === "string" ||
        typeof row.loadError === "string",
      )
      .map((row) => ({
        pluginId:
          typeof row.id === "string"
            ? row.id
            : typeof row.pluginId === "string"
              ? row.pluginId
              : "",
        message: String(row.error || row.loadError || row.status || "plugin load failed"),
      }));
  } catch {
    return [];
  }
}

export function pruneInvalidOpenClawConfigFromValidation(
  config: TracevaneServerConfig,
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

export function inspectTracevaneWebBundle(
  config: TracevaneServerConfig,
): TracevaneWebBundleInspection {
  const indexPath = path.join(config.webDistDir, "index.html");
  const assetsDir = path.join(config.webDistDir, "assets");
  const missing: string[] = [];
  if (!fs.existsSync(config.webDistDir)) missing.push("webDistDir");
  if (!fs.existsSync(indexPath)) missing.push("index.html");
  if (!fs.existsSync(assetsDir)) missing.push("assets");
  const assetCount = fs.existsSync(assetsDir)
    ? fs
        .readdirSync(assetsDir)
        .filter((fileName) => /\.(js|css)$/i.test(fileName)).length
    : 0;
  if (fs.existsSync(assetsDir) && assetCount === 0) {
    missing.push("assets.js-css");
  }

  return {
    ok: missing.length === 0,
    webDistDir: config.webDistDir,
    indexPath,
    assetsDir,
    assetCount,
    missing,
  };
}

function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  cwd?: string,
): Promise<OpenClawRecoveryCommandSnapshot> {
  const startedAt = Date.now();
  const label = `${command} ${args.join(" ")}`.trim();
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
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
  config: TracevaneServerConfig,
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

async function runInstallIntegrityChecks(
  config: TracevaneServerConfig,
  policy: OpenClawRecoveryPolicy,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<{ error: string; changedKeys: string[] }> {
  const cli = await ensureOpenClawCliAvailable(config, policy, commands);
  if (!cli.ok) {
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "cli_reinstall_failed",
        severity: "error",
        title: "OpenClaw CLI 自愈失败",
        summary: cli.error || "OpenClaw CLI could not be restored.",
        status: "failed",
        details: { action: cli.action },
      }),
    );
    return { error: cli.error, changedKeys: [] };
  }

  const changedKeys: string[] = [];
  if (cli.action === "shim" || cli.action === "reinstall") {
    changedKeys.push(`cli.${cli.action}`);
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "cli_reinstall_succeeded",
        severity: "success",
        title: cli.action === "shim" ? "OpenClaw CLI shim 已恢复" : "OpenClaw CLI 已重装",
        summary: cli.action === "shim"
          ? "Recovery daemon restored a local OpenClaw CLI shim from the install manifest."
          : "Recovery daemon reinstalled OpenClaw CLI from the recorded package manifest.",
        status: "succeeded",
        details: {
          action: cli.action,
          packageSpec: cli.manifest?.packageSpec || "",
        },
      }),
    );
  }

  commands.push(
    await runCommand("openclaw", ["update", "status", "--json"], 15_000),
  );
  return { error: "", changedKeys };
}

async function runPluginRepairLayer(
  config: TracevaneServerConfig,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<string[]> {
  const changedKeys: string[] = [];
  changedKeys.push(...pruneMissingOpenClawPluginLoadPaths(config));

  const doctorLint = await runCommand(
    "openclaw",
    ["doctor", "--lint", "--json", "--severity-min", "warning"],
    20_000,
  );
  commands.push(doctorLint);
  changedKeys.push(
    ...repairOpenClawPluginConfigFromFindings(
      config,
      parseDoctorFindings(doctorLint),
    ),
  );

  commands.push(await runCommand("openclaw", ["plugins", "doctor"], 20_000));
  const pluginList = await runCommand(
    "openclaw",
    ["plugins", "list", "--json", "--verbose"],
    20_000,
  );
  commands.push(pluginList);
  changedKeys.push(
    ...repairOpenClawPluginConfigFromFindings(
      config,
      parsePluginListFindings(pluginList),
    ),
  );

  return [...new Set(changedKeys)];
}

function runLocalRuntimeConfigDriftRepairLayer(config: TracevaneServerConfig): string[] {
  return [
    ...repairOpenClawGatewayAuthSecretRefDrift(config),
    ...pruneDeprecatedOpenClawPluginResidue(config),
  ];
}

async function runTracevaneWebBundleRepairLayer(
  config: TracevaneServerConfig,
  policy: OpenClawRecoveryPolicy,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<{ changedKeys: string[]; error: string; repaired: boolean }> {
  const inspection = inspectTracevaneWebBundle(config);
  if (inspection.ok) {
    return { changedKeys: [], error: "", repaired: false };
  }

  const details = {
    inspection,
    projectRoot: config.projectRoot,
  };
  if (!policy.allowTracevaneWebRebuild) {
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "tracevane_web_bundle_rebuild_skipped",
        severity: "warning",
        title: "Tracevane 静态包重建已跳过",
        summary: `Tracevane web bundle is incomplete: ${inspection.missing.join(", ")}.`,
        status: "skipped",
        details,
      }),
    );
    return { changedKeys: [], error: "", repaired: false };
  }

  const packagePath = path.join(config.projectRoot, "package.json");
  const webPackagePath = path.join(config.projectRoot, "apps", "web", "package.json");
  if (!fs.existsSync(packagePath) || !fs.existsSync(webPackagePath)) {
    const error = "Tracevane source package is missing; web bundle cannot be rebuilt automatically";
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "tracevane_web_bundle_rebuild_failed",
        severity: "error",
        title: "Tracevane 静态包重建失败",
        summary: error,
        status: "failed",
        details,
      }),
    );
    return { changedKeys: [], error, repaired: false };
  }

  const rebuild = await runCommand(
    "npm",
    ["run", "build:web"],
    policy.tracevaneWebRebuildTimeoutMs,
    config.projectRoot,
  );
  commands.push(rebuild);
  const nextInspection = inspectTracevaneWebBundle(config);
  if (!rebuild.ok || !nextInspection.ok) {
    const error =
      commandErrorSummary(rebuild) ||
      `Tracevane web bundle is still incomplete: ${nextInspection.missing.join(", ")}.`;
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "tracevane_web_bundle_rebuild_failed",
        severity: "error",
        title: "Tracevane 静态包重建失败",
        summary: error,
        status: "failed",
        details: { ...details, nextInspection },
      }),
    );
    return { changedKeys: [], error, repaired: false };
  }

  const changedKeys = ["tracevane.webDist.rebuild"];
  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: "tracevane_web_bundle_rebuild_succeeded",
      severity: "success",
      title: "Tracevane 静态包已重建",
      summary: `Rebuilt Tracevane web bundle with ${nextInspection.assetCount} JS/CSS asset(s).`,
      status: "succeeded",
      details: { ...details, nextInspection },
    }),
  );
  return { changedKeys, error: "", repaired: true };
}

function commandErrorSummary(commandResult: OpenClawRecoveryCommandSnapshot): string {
  return [
    commandResult.error,
    commandResult.stderr,
    commandResult.stdout,
  ].filter(Boolean).join("\n").trim().slice(0, 800);
}

function commandLooksLikeUnsupportedSafeRestart(
  commandResult: OpenClawRecoveryCommandSnapshot,
): boolean {
  const text = `${commandResult.error}\n${commandResult.stderr}\n${commandResult.stdout}`;
  return /unknown option|unrecognized option|invalid option|unexpected argument/i.test(text)
    && /--safe|safe/i.test(text);
}

async function restartOpenClawGatewayForRepair(
  commands: OpenClawRecoveryCommandSnapshot[],
  timeoutMs: number,
): Promise<OpenClawRecoveryCommandSnapshot> {
  const safeRestart = await runCommand(
    "openclaw",
    ["gateway", "restart", "--safe"],
    timeoutMs,
  );
  commands.push(safeRestart);
  if (safeRestart.ok || !commandLooksLikeUnsupportedSafeRestart(safeRestart)) {
    return safeRestart;
  }

  const legacyRestart = await runCommand(
    "openclaw",
    ["gateway", "restart"],
    timeoutMs,
  );
  commands.push(legacyRestart);
  return legacyRestart;
}

function gatewayDeepProbeSummary(
  probe: OpenClawGatewayDeepProbeResult,
): string {
  return probe.error
    ? `Gateway deep probe failed: ${probe.error}`
    : "Gateway deep probe failed after repair";
}

async function probeGatewayControlPlane(
  config: TracevaneServerConfig,
  policy: OpenClawRecoveryPolicy,
): Promise<OpenClawGatewayDeepProbeResult> {
  return probeOpenClawGatewayDeep({
    port: config.gatewayPort,
    timeoutMs: policy.probeTimeoutMs,
    controlUiBasePath: config.gatewayControlUiBasePath,
  });
}

async function waitForGatewayControlPlane(
  config: TracevaneServerConfig,
  policy: OpenClawRecoveryPolicy,
  maxWaitMs: number,
): Promise<OpenClawGatewayDeepProbeResult> {
  const deadline = Date.now() + Math.max(policy.probeTimeoutMs, maxWaitMs);
  let latest = await probeGatewayControlPlane(config, policy);
  while (!latest.ok && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    latest = await probeGatewayControlPlane(config, policy);
  }
  return latest;
}

function appendGatewayDeepProbeFailedEvent(
  config: TracevaneServerConfig,
  probe: OpenClawGatewayDeepProbeResult,
): void {
  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: "gateway_deep_probe_failed",
      severity: probe.connected ? "warning" : "error",
      title: "OpenClaw gateway 深探测失败",
      summary: gatewayDeepProbeSummary(probe),
      status: "failed",
      details: {
        port: config.gatewayPort,
        controlUiBasePath: config.gatewayControlUiBasePath,
        connected: probe.connected,
        checks: probe.checks,
      },
    }),
  );
}

async function runGatewayServiceRepairLayer(
  config: TracevaneServerConfig,
  policy: OpenClawRecoveryPolicy,
  commands: OpenClawRecoveryCommandSnapshot[],
): Promise<{
  changedKeys: string[];
  repaired: boolean;
  error: string;
  assessment: OpenClawGatewayServiceRepairAssessment;
}> {
  const statusCommand = await runCommand(
    "openclaw",
    ["gateway", "status", "--json"],
    policy.gatewayServiceRepairTimeoutMs,
  );
  commands.push(statusCommand);
  const status = parseOpenClawGatewayStatus(statusCommand.stdout);
  const assessment = assessOpenClawGatewayServiceStatus(status, {
    expectedPort: config.gatewayPort,
    sourcePathExists: status?.serviceSourcePath
      ? fs.existsSync(status.serviceSourcePath)
      : null,
  });

  if (!assessment.needsRepair) {
    return { changedKeys: [], repaired: false, error: "", assessment };
  }

  const details = {
    port: config.gatewayPort,
    statusCommandOk: statusCommand.ok,
    assessment,
    status: status
      ? {
          loaded: status.loaded,
          runtimeStatus: status.runtimeStatus,
          runtimeState: status.runtimeState,
          runtimeSubState: status.runtimeSubState,
          runtimePid: status.runtimePid,
          serviceSourcePath: status.serviceSourcePath,
          configAuditOk: status.configAuditOk,
          configAuditIssues: status.configAuditIssues,
          rpcOk: status.rpcOk,
          gatewayPort: status.gatewayPort,
        }
      : null,
  };

  if (!policy.allowGatewayServiceRepair) {
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "gateway_service_repair_skipped",
        severity: "warning",
        title: "OpenClaw gateway 服务修复已跳过",
        summary: assessment.summary,
        status: "skipped",
        details,
      }),
    );
    return { changedKeys: [], repaired: false, error: "", assessment };
  }

  const changedKeys: string[] = [];
  if (assessment.shouldInstall) {
    const install = await runCommand(
      "openclaw",
      ["gateway", "install", "--force", "--port", String(config.gatewayPort), "--json"],
      policy.gatewayServiceRepairTimeoutMs,
    );
    commands.push(install);
    if (!install.ok) {
      const error = commandErrorSummary(install) || "OpenClaw gateway service install failed";
      appendRecoveryEvent(
        config,
        createRecoveryEvent({
          kind: "gateway_service_repair_failed",
          severity: "error",
          title: "OpenClaw gateway 服务安装失败",
          summary: error,
          status: "failed",
          details,
        }),
      );
      return { changedKeys, repaired: false, error, assessment };
    }
    changedKeys.push("gateway.service.install");
  }

  if (assessment.shouldStart) {
    const serviceAction =
      assessment.reasons.includes("gateway_rpc_failed") && !assessment.shouldInstall
        ? "restart"
        : "start";
    const start = await runCommand(
      "openclaw",
      ["gateway", serviceAction],
      policy.gatewayServiceRepairTimeoutMs,
    );
    commands.push(start);
    if (!start.ok) {
      const error = commandErrorSummary(start) || `OpenClaw gateway service ${serviceAction} failed`;
      appendRecoveryEvent(
        config,
        createRecoveryEvent({
          kind: "gateway_service_repair_failed",
          severity: "error",
          title: "OpenClaw gateway 服务启动失败",
          summary: error,
          status: "failed",
          details: { ...details, serviceAction },
        }),
      );
      return { changedKeys, repaired: false, error, assessment };
    }
    changedKeys.push(`gateway.service.${serviceAction}`);
  }

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: "gateway_service_repair_succeeded",
      severity: "warning",
      title: "OpenClaw gateway 服务托管已修复",
      summary: assessment.summary,
      status: "succeeded",
      details: { ...details, changedKeys },
    }),
  );
  return {
    changedKeys: [...new Set(changedKeys)],
    repaired: changedKeys.length > 0,
    error: "",
    assessment,
  };
}

function gatewayListenerSummary(input: {
  snapshot: { listeners: Array<{ pid: number; command: string; reason: string }> };
  terminatedPids: number[];
  skippedPids: number[];
}): string {
  if (input.terminatedPids.length > 0) {
    return `Terminated OpenClaw gateway listener pid(s): ${input.terminatedPids.join(", ")}.`;
  }
  if (input.snapshot.listeners.length > 0) {
    return `Gateway port listener(s) were discovered but not eligible for takeover: ${input.skippedPids.join(", ") || "none"}.`;
  }
  return "No gateway port listener was discovered for takeover.";
}

function processExists(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "EPERM";
  }
}

function parseRepairLock(raw: string): { pid: number | null; lockedAt: string | null } {
  const [pidLine = "", lockedAtLine = ""] = raw.split(/\r?\n/);
  const pid = Number(pidLine.trim());
  return {
    pid: Number.isFinite(pid) && pid > 0 ? Math.floor(pid) : null,
    lockedAt: lockedAtLine.trim() || null,
  };
}

function repairLockLooksStale(lockPath: string): boolean {
  try {
    const parsed = parseRepairLock(fs.readFileSync(lockPath, "utf8"));
    if (!parsed.pid || !processExists(parsed.pid)) return true;
    const lockedAtMs = parsed.lockedAt ? Date.parse(parsed.lockedAt) : Number.NaN;
    if (!Number.isNaN(lockedAtMs) && Date.now() - lockedAtMs > REPAIR_LOCK_STALE_MS) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

function acquireRepairLock(config: TracevaneServerConfig): number | null {
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.rootDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(paths.lockPath, "wx");
      fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`, "utf8");
      return fd;
    } catch {
      if (attempt > 0 || !repairLockLooksStale(paths.lockPath)) {
        return null;
      }
      try {
        fs.unlinkSync(paths.lockPath);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function releaseRepairLock(config: TracevaneServerConfig, fd: number): void {
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
  config: TracevaneServerConfig,
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
      error: REPAIR_ALREADY_RUNNING_ERROR,
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
  let finalConfigValid = true;
  let rollbackReason = "";

  try {
    const installCheck = await runInstallIntegrityChecks(config, options.policy, commands);
    changedKeys.push(...installCheck.changedKeys);
    if (installCheck.error) {
      error = installCheck.error;
      finalConfigValid = false;
      rollbackReason = "install_check_failed";
      throw new Error(error);
    }

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
    changedKeys.push(...runLocalRuntimeConfigDriftRepairLayer(config));
    changedKeys.push(...await runPluginRepairLayer(config, commands));
    const tracevaneWebBundle = await runTracevaneWebBundleRepairLayer(
      config,
      options.policy,
      commands,
    );
    changedKeys.push(...tracevaneWebBundle.changedKeys);
    if (tracevaneWebBundle.error) {
      error = tracevaneWebBundle.error;
    }

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

    const finalValidation = await runCommand(
      "openclaw",
      ["config", "validate", "--json"],
      10_000,
    );
    commands.push(finalValidation);
    finalConfigValid = finalValidation.ok;
    if (!finalConfigValid) {
      error = commandErrorSummary(finalValidation) || "OpenClaw config is still invalid after repair";
      rollbackReason = "config_validation_failed";
    } else {
      await restartOpenClawGatewayForRepair(commands, 20_000);
      let deepProbe = await waitForGatewayControlPlane(config, options.policy, 20_000);
      ok = deepProbe.ok;
      if (!ok) {
        appendGatewayDeepProbeFailedEvent(config, deepProbe);
        const serviceRepair = await runGatewayServiceRepairLayer(
          config,
          options.policy,
          commands,
        );
        changedKeys.push(...serviceRepair.changedKeys);
        if (serviceRepair.error) {
          error = serviceRepair.error;
        }
        if (serviceRepair.repaired) {
          deepProbe = await waitForGatewayControlPlane(
            config,
            options.policy,
            options.policy.gatewayServiceRepairTimeoutMs,
          );
          ok = deepProbe.ok;
        }
      }
      if (!ok && !deepProbe.connected) {
        const takeover = await takeoverOpenClawGatewayListeners(
          config.gatewayPort,
          {
            allow: options.policy.allowGatewayProcessTakeover,
            timeoutMs: options.policy.gatewayProcessTakeoverTimeoutMs,
          },
          commands,
        );
        if (takeover.terminatedPids.length > 0) {
          changedKeys.push("gateway.process.takeover");
          appendRecoveryEvent(
            config,
            createRecoveryEvent({
              kind: "gateway_process_takeover_succeeded",
              severity: "warning",
              title: "OpenClaw gateway 残留进程已接管",
              summary: gatewayListenerSummary(takeover),
              status: "succeeded",
              details: {
                port: config.gatewayPort,
                terminatedPids: takeover.terminatedPids,
                skippedPids: takeover.skippedPids,
              },
            }),
          );
          await restartOpenClawGatewayForRepair(commands, 20_000);
          deepProbe = await waitForGatewayControlPlane(config, options.policy, 20_000);
          ok = deepProbe.ok;
        } else if (takeover.snapshot.listeners.length > 0 || takeover.error) {
          appendRecoveryEvent(
            config,
            createRecoveryEvent({
              kind: "gateway_process_takeover_skipped",
              severity: "warning",
              title: "OpenClaw gateway 进程接管已跳过",
              summary: takeover.error || gatewayListenerSummary(takeover),
              status: "skipped",
              details: {
                port: config.gatewayPort,
                skippedPids: takeover.skippedPids,
                listeners: takeover.snapshot.listeners.map((listener) => ({
                  pid: listener.pid,
                  command: listener.command,
                  reason: listener.reason,
                })),
              },
            }),
          );
        }
      }
      if (!ok) {
        error = error || gatewayDeepProbeSummary(deepProbe);
      } else {
        error = "";
      }
    }
  } catch (repairError) {
    error =
      repairError instanceof Error
        ? repairError.message
        : "Recovery repair failed";
    finalConfigValid = false;
    rollbackReason = rollbackReason || "repair_exception";
  } finally {
    if (!ok && backupPath && changedKeys.length > 0 && !finalConfigValid) {
      try {
        restoreOpenClawRecoveryBackup(config, backupPath);
        changedKeys.push("rollback.openclawConfig");
        appendRecoveryEvent(
          config,
          createRecoveryEvent({
            kind: "backup_restored",
            severity: "warning",
            title: "OpenClaw 配置已自动回滚",
            summary: rollbackReason || "Recovery repair failed before config became valid.",
            status: "succeeded",
            details: { backupPath, reason: rollbackReason || "repair_failed" },
          }),
        );
      } catch (rollbackError) {
        error = [
          error,
          rollbackError instanceof Error
            ? `Rollback failed: ${rollbackError.message}`
            : "Rollback failed",
        ].filter(Boolean).join("\n");
      }
    }
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

export async function runOpenClawRecoveryConfigRepair(
  config: TracevaneServerConfig,
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
      error: REPAIR_ALREADY_RUNNING_ERROR,
    };
  }

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: "config_repair_started",
      severity: "info",
      title: "OpenClaw 配置立即修复已开始",
      summary: `Recovery started a ${options.trigger} config repair attempt.`,
      status: "running",
      details: { trigger: options.trigger },
    }),
  );

  const commands: OpenClawRecoveryCommandSnapshot[] = [];
  let backupPath: string | null = null;
  const changedKeys: string[] = [];
  let error = "";
  let ok = false;
  let finalConfigValid = true;
  let rollbackReason = "";

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
          details: { backupPath, action: "config-repair" },
        }),
      );
    }

    changedKeys.push(...await runDynamicConfigValidationRepair(config, commands));
    const bootstrap = repairSystemBootstrap(config);
    if (bootstrap.changed) changedKeys.push(...bootstrap.changedKeys);
    changedKeys.push(...runLocalRuntimeConfigDriftRepairLayer(config));

    const finalValidation = await runCommand(
      "openclaw",
      ["config", "validate", "--json"],
      10_000,
    );
    commands.push(finalValidation);
    finalConfigValid = finalValidation.ok;
    if (!finalConfigValid) {
      error = commandErrorSummary(finalValidation) || "OpenClaw config is still invalid after config repair";
      rollbackReason = "config_validation_failed";
    } else {
      const restart = await restartOpenClawGatewayForRepair(commands, 20_000);
      ok = restart.ok;
      if (!ok) {
        error = commandErrorSummary(restart) || "OpenClaw config is valid but gateway restart failed";
      }
    }
  } catch (repairError) {
    error =
      repairError instanceof Error
        ? repairError.message
        : "OpenClaw config repair failed";
    finalConfigValid = false;
    rollbackReason = rollbackReason || "config_repair_exception";
  } finally {
    if (!finalConfigValid && backupPath && changedKeys.length > 0) {
      try {
        restoreOpenClawRecoveryBackup(config, backupPath);
        changedKeys.push("rollback.openclawConfig");
        appendRecoveryEvent(
          config,
          createRecoveryEvent({
            kind: "backup_restored",
            severity: "warning",
            title: "OpenClaw 配置已自动回滚",
            summary: rollbackReason || "Config repair failed before config became valid.",
            status: "succeeded",
            details: { backupPath, reason: rollbackReason || "config_repair_failed" },
          }),
        );
      } catch (rollbackError) {
        error = [
          error,
          rollbackError instanceof Error
            ? `Rollback failed: ${rollbackError.message}`
            : "Rollback failed",
        ].filter(Boolean).join("\n");
      }
    }
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
    notes: ok
      ? ["Immediate config repair completed and gateway restart succeeded."]
      : [error || "Immediate config repair completed but gateway did not restart."],
  });

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: ok ? "config_repair_succeeded" : "config_repair_failed",
      severity: ok ? "success" : "error",
      title: ok ? "OpenClaw 配置立即修复成功" : "OpenClaw 配置立即修复失败",
      summary: ok
        ? "Config validation passed and gateway restart command completed."
        : error || "Config repair did not restore a restartable gateway.",
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
  config: TracevaneServerConfig,
  backupPath: string,
): void {
  fs.copyFileSync(backupPath, config.openclawConfigFile);
  const restoredConfig = readOpenClawConfig(config);
  restoreRuntimeSidecarBackup(
    backupPath,
    path.join(config.openclawRoot, ".env"),
    RUNTIME_BACKUP_ENV_LABEL,
  );
  restoreRuntimeSidecarBackup(
    backupPath,
    path.join(config.openclawRoot, "gateway.systemd.env"),
    RUNTIME_BACKUP_SYSTEMD_ENV_LABEL,
  );
  restoreRuntimeSidecarBackup(
    backupPath,
    tracevaneLocalSecretFilePath(restoredConfig),
    RUNTIME_BACKUP_TRACEVANE_LOCAL_SECRETS_LABEL,
  );
}
