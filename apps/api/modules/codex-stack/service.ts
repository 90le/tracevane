import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  CcConnectConfig,
  CcConnectPlatform,
  CcConnectProject,
  CcConnectProvider,
  CodexStackChannel,
  CodexStackCheckItem,
  CodexStackCheckResponse,
  CodexStackCcConnectConfigPatchRequest,
  CodexStackComponentSummary,
  CodexStackConfigPatchRequest,
  CodexStackFinalizeRequest,
  CodexStackInstallRequest,
  CodexStackInstallerSource,
  CodexStackJob,
  CodexStackJobResponse,
  CodexStackLogResponse,
  CodexStackManagementAccess,
  CodexStackModelSource,
  CodexStackMutationResponse,
  CodexStackProfile,
  CodexStackRepairRequest,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackServiceStatus,
  CodexStackStatus,
  CodexStackSummaryPayload,
} from "../../../../types/codex-stack.js";
import { isStudioGatewayHttpAuthorized } from "../../gateway-http-auth.js";
import { readJsonFile } from "../../core/state.js";

const execFileAsync = promisify(execFile);

const OFFICIAL_CPA_PORT = 8317;
const DMWORK_CPA_PORT = 18795;
const DEFAULT_COMPACT_PORT = 18796;
const OFFICIAL_DEFAULT_MODEL = "glm-5.1";
const DMWORK_DEFAULT_MODEL = "kimi-k2.6";

function defaultCpaPort(channel?: CodexStackChannel): number {
  return channel === "dmwork" ? DMWORK_CPA_PORT : OFFICIAL_CPA_PORT;
}
function defaultModel(channel?: CodexStackChannel): string {
  return channel === "dmwork" ? DMWORK_DEFAULT_MODEL : OFFICIAL_DEFAULT_MODEL;
}
const DEFAULT_CPA_PROXY_KEY = "openclaw-cpa-key";
const DEFAULT_CC_CONNECT_PROJECT = "main";
const JOB_TAIL_CHARS = 12_000;

const SERVICE_IDS = [
  "cli-proxy-api.service",
  "cpa-compact-proxy.service",
  "cc-connect.service",
  "codex-stack-watchdog.timer",
] as const satisfies readonly CodexStackServiceId[];

const SERVICE_ACTIONS = ["restart", "start", "stop", "enable"] as const satisfies readonly CodexStackServiceAction[];

const FALLBACK_LOG_FILES: Record<CodexStackServiceId, string[]> = {
  "cli-proxy-api.service": ["/tmp/cpa.log"],
  "cpa-compact-proxy.service": ["/tmp/cpa-compact-proxy.log"],
  "cc-connect.service": ["/tmp/cc-connect.log"],
  "codex-stack-watchdog.timer": [],
};

interface CodexStackModelDiscovery {
  available: string[];
  source: CodexStackModelSource;
  endpoint: string;
  live: boolean;
  refreshedAt: string;
  error: string | null;
}

/** Detect the port a systemd user service is actually listening on by parsing ss output. */
async function detectLivePort(patterns: string[]): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync("ss", ["-tlnp"], { timeout: 5_000 });
    for (const pattern of patterns) {
      const re = new RegExp(`(?:${pattern}).*:(\\d+)\\s`, "i");
      const match = stdout.match(re);
      if (match?.[1]) {
        const port = Number(match[1]);
        if (Number.isFinite(port) && port > 0 && port <= 65535) return port;
      }
    }
    // Fallback: look for any LISTEN entry on candidate ports
    for (const pattern of patterns) {
      const lines = stdout.split("\n");
      for (const line of lines) {
        if (line.toLowerCase().includes(pattern.toLowerCase())) {
          const portMatch = line.match(/:(\\d+)\\s/);
          if (portMatch?.[1]) {
            const port = Number(portMatch[1]);
            if (Number.isFinite(port) && port > 0) return port;
          }
        }
      }
    }
  } catch {
    // ss not available or failed - non-fatal
  }
  return null;
}

const INSTALL_ENV_KEYS = [
  "CODEX_MODEL",
  "CPA_PORT",
  "COMPACT_PORT",
  "CPA_PROXY_KEY",
  "OPENCLAW_UPSTREAM_BASE_URL",
  "OPENCLAW_UPSTREAM_API_KEY",
] as const;

const REPAIR_ACTIONS = [
  "restart-cpa",
  "restart-compact-proxy",
  "restart-watchdog",
  "restart-cc-connect",
  "disable-conflicting-units",
  "rerun-install-no-start",
] as const;

type RepairAction = (typeof REPAIR_ACTIONS)[number];

export class CodexStackServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CodexStackServiceError";
  }

  toShape(): { code: string; message: string; statusCode: number } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
    };
  }
}

export function isCodexStackServiceError(error: unknown): error is CodexStackServiceError {
  return error instanceof CodexStackServiceError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizePort(value: unknown, fallback: number): number {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port <= 65535 ? Math.floor(port) : fallback;
}

function pathExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function isSocket(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isSocket();
  } catch {
    return false;
  }
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonSecure(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort on filesystems that do not support chmod.
  }
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function readFileTailLines(filePath: string, lines: number): string {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return "";
    const maxBytes = Math.min(stat.size, Math.max(JOB_TAIL_CHARS, lines * 320));
    const start = Math.max(0, stat.size - maxBytes);
    const fd = fs.openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(maxBytes);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      return buffer.toString("utf8").split(/\r?\n/).slice(-lines).join("\n").trim();
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return "";
  }
}

function backupAndWrite(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  if (pathExists(filePath)) {
    const stamp = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
    fs.copyFileSync(filePath, `${filePath}.bak.${stamp}`);
  }
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, content, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function maskSecret(value: string): { masked: string; length: number } {
  const trimmed = value.trim();
  if (trimmed.length <= 8) {
    return { masked: `${trimmed.slice(0, 2)}...`, length: trimmed.length };
  }
  return {
    masked: `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`,
    length: trimmed.length,
  };
}

function normalizeTomlMultiline(source: string): string {
  const normalized = source.replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseTomlScalar(valueSource: string): string {
  const trimmed = valueSource.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    const match = trimmed.match(/^"((?:\\.|[^"\\])*)"/);
    if (match?.[1] !== undefined) {
      try {
        return JSON.parse(`"${match[1]}"`) as string;
      } catch {
        return match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      }
    }
  }
  if (trimmed.startsWith("'")) {
    const endIndex = trimmed.indexOf("'", 1);
    return endIndex >= 0 ? trimmed.slice(1, endIndex) : trimmed.slice(1);
  }
  return trimmed.replace(/\s+#.*$/g, "").trim();
}

function parseTomlHeader(line: string): { name: string; array: boolean } | null {
  const trimmed = line.trim();
  const arrayMatch = trimmed.match(/^\[\[\s*([^\]]+?)\s*\]\]$/);
  if (arrayMatch?.[1]) {
    return { name: arrayMatch[1].trim(), array: true };
  }
  const tableMatch = trimmed.match(/^\[\s*([^\]]+?)\s*\]$/);
  if (tableMatch?.[1]) {
    return { name: tableMatch[1].trim(), array: false };
  }
  return null;
}

function parseTomlAssignment(line: string): { key: string; value: string } | null {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
  if (!match?.[1] || !match[2]) return null;
  return {
    key: match[1].trim(),
    value: parseTomlScalar(match[2]),
  };
}

function emptyCcConnectProvider(): CcConnectProvider {
  return {
    name: "",
    apiKey: "",
    baseUrl: "",
    codexEnvKey: "",
  };
}

function emptyCcConnectProject(): CcConnectProject {
  return {
    name: "",
    adminFrom: "",
    agentType: "",
    agentOptions: {
      workDir: "",
      mode: "",
      model: "",
    },
    platforms: [],
  };
}

function emptyCcConnectPlatform(): CcConnectPlatform {
  return {
    type: "",
    options: {},
  };
}

function parseCcConnectConfigSource(source: string): CcConnectConfig {
  const config: CcConnectConfig = {
    language: "",
    providers: [],
    projects: [],
    raw: source,
  };
  let currentSection = "";
  let currentProvider: CcConnectProvider | null = null;
  let currentProject: CcConnectProject | null = null;
  let currentPlatform: CcConnectPlatform | null = null;

  for (const line of source.replace(/\r\n/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const header = parseTomlHeader(trimmed);
    if (header) {
      currentSection = header.name;
      if (header.array && header.name === "providers") {
        currentProvider = emptyCcConnectProvider();
        config.providers.push(currentProvider);
      } else if (header.array && header.name === "projects") {
        currentProject = emptyCcConnectProject();
        config.projects.push(currentProject);
        currentPlatform = null;
      } else if (header.array && header.name === "projects.platforms") {
        if (!currentProject) {
          currentProject = emptyCcConnectProject();
          config.projects.push(currentProject);
        }
        currentPlatform = emptyCcConnectPlatform();
        currentProject.platforms.push(currentPlatform);
      }
      continue;
    }

    const assignment = parseTomlAssignment(trimmed);
    if (!assignment) continue;
    const { key, value } = assignment;
    if (!currentSection && key === "language") {
      config.language = value;
      continue;
    }
    if (currentSection === "providers" && currentProvider) {
      if (key === "name") currentProvider.name = value;
      if (key === "api_key") currentProvider.apiKey = value;
      if (key === "base_url") currentProvider.baseUrl = value;
      if (key === "codex_env_key") currentProvider.codexEnvKey = value;
      continue;
    }
    if (currentSection === "projects" && currentProject) {
      if (key === "name") currentProject.name = value;
      if (key === "admin_from") currentProject.adminFrom = value;
      continue;
    }
    if (currentSection === "projects.agent" && currentProject) {
      if (key === "type") currentProject.agentType = value;
      continue;
    }
    if (currentSection === "projects.agent.options" && currentProject) {
      if (key === "work_dir") currentProject.agentOptions.workDir = value;
      if (key === "mode") currentProject.agentOptions.mode = value;
      if (key === "model") currentProject.agentOptions.model = value;
      continue;
    }
    if (currentSection === "projects.platforms" && currentPlatform) {
      if (key === "type") currentPlatform.type = value;
      continue;
    }
    if (currentSection === "projects.platforms.options" && currentPlatform) {
      currentPlatform.options[key] = value;
    }
  }

  return config;
}

function serializeCcConnectProviders(providers: CcConnectProvider[]): string {
  const blocks = providers
    .map((provider) => {
      const lines = [
        "[[providers]]",
        `name = "${escapeTomlString(provider.name || "")}"`,
        `api_key = "${escapeTomlString(provider.apiKey || "")}"`,
        `base_url = "${escapeTomlString(provider.baseUrl || "")}"`,
        `codex_env_key = "${escapeTomlString(provider.codexEnvKey || "")}"`,
      ];
      return lines.join("\n");
    });
  return blocks.join("\n\n").trim();
}

function serializeCcConnectProjects(projects: CcConnectProject[]): string {
  const blocks = projects.map((project) => {
    const lines = [
      "[[projects]]",
      `name = "${escapeTomlString(project.name || "")}"`,
      `admin_from = "${escapeTomlString(project.adminFrom || "")}"`,
      "",
      "[projects.agent]",
      `type = "${escapeTomlString(project.agentType || "")}"`,
      "",
      "[projects.agent.options]",
      `work_dir = "${escapeTomlString(project.agentOptions.workDir || "")}"`,
      `mode = "${escapeTomlString(project.agentOptions.mode || "")}"`,
      `model = "${escapeTomlString(project.agentOptions.model || "")}"`,
    ];

    for (const platform of project.platforms || []) {
      lines.push(
        "",
        "[[projects.platforms]]",
        `type = "${escapeTomlString(platform.type || "")}"`,
        "",
        "[projects.platforms.options]",
      );
      for (const [key, value] of Object.entries(platform.options || {})) {
        lines.push(`${key} = "${escapeTomlString(value || "")}"`);
      }
    }

    return lines.join("\n");
  });
  return blocks.join("\n\n").trim();
}

function replaceOrAppendTopLevelTomlString(source: string, key: string, value: string): string {
  const escaped = escapeTomlString(value);
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim().startsWith("[") && line.trim().endsWith("]")) break;
    if (new RegExp(`^\\s*${key}\\s*=`).test(line)) {
      lines[index] = `${key} = "${escaped}"`;
      return lines.join("\n");
    }
  }
  const insertAt = lines.findIndex((line) => line.trim().startsWith("["));
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, `${key} = "${escaped}"`, "");
    return lines.join("\n");
  }
  return `${source.replace(/\s+$/g, "")}${source.trim() ? "\n" : ""}${key} = "${escaped}"\n`;
}

function stripTomlManagedSections(source: string, prefixes: string[]): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let skipping = false;
  for (const line of lines) {
    const header = parseTomlHeader(line);
    if (header) {
      skipping = prefixes.some((prefix) => header.name === prefix || header.name.startsWith(`${prefix}.`));
      if (!skipping) kept.push(line);
      continue;
    }
    if (skipping) continue;
    kept.push(line);
  }
  return kept.join("\n");
}

function appendTomlSection(source: string, block: string): string {
  if (!block.trim()) return source;
  const base = source.replace(/\s+$/g, "");
  return `${base}${base ? "\n\n" : ""}${block.trim()}\n`;
}

function patchCcConnectStructuredToml(
  source: string,
  payload: Omit<CodexStackCcConnectConfigPatchRequest, "raw">,
): string {
  const current = parseCcConnectConfigSource(source);
  const nextConfig: CcConnectConfig = {
    language: payload.language ?? current.language,
    providers: payload.providers ?? current.providers,
    projects: payload.projects ?? current.projects,
    raw: current.raw,
  };

  let next = source;
  if (payload.language !== undefined) {
    next = replaceOrAppendTopLevelTomlString(next, "language", nextConfig.language || "");
  }
  if (payload.providers !== undefined) {
    next = appendTomlSection(stripTomlManagedSections(next, ["providers"]), serializeCcConnectProviders(nextConfig.providers));
  }
  if (payload.projects !== undefined) {
    next = appendTomlSection(stripTomlManagedSections(next, ["projects"]), serializeCcConnectProjects(nextConfig.projects));
  }

  if (!source.trim()) {
    const blocks = [
      nextConfig.language ? `language = "${escapeTomlString(nextConfig.language)}"` : "",
      serializeCcConnectProviders(nextConfig.providers),
      serializeCcConnectProjects(nextConfig.projects),
    ].filter(Boolean);
    next = blocks.join("\n\n");
  }

  return normalizeTomlMultiline(next);
}

function extractTomlString(source: string, key: string): string {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, "m"));
  return match?.[1]?.trim() || "";
}

function replaceTomlString(source: string, key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"(\\s*)$`, "m");
  if (pattern.test(source)) {
    return source.replace(pattern, `$1"${escaped}"$2`);
  }
  return `${source.replace(/\s+$/g, "")}\n${key} = "${escaped}"\n`;
}

function replaceYamlNumber(source: string, key: string, value: number): string {
  const pattern = new RegExp(`^(\\s*${key}:\\s*).*$`, "m");
  return pattern.test(source) ? source.replace(pattern, `$1${value}`) : `${source.replace(/\s+$/g, "")}\n${key}: ${value}\n`;
}

function replaceFirstYamlListSecret(source: string, value: string): string {
  const escaped = JSON.stringify(value);
  const pattern = /^(\s*api-keys:\s*\n\s*-\s*).+$/m;
  return pattern.test(source) ? source.replace(pattern, `$1${escaped}`) : source;
}

function replaceEnvLine(source: string, key: string, value: string | number): string {
  const pattern = new RegExp(`^(Environment=${key}=).*$`, "m");
  return pattern.test(source) ? source.replace(pattern, `$1${String(value)}`) : `${source.replace(/\s+$/g, "")}\nEnvironment=${key}=${String(value)}\n`;
}

function resolveHomeDir(config: StudioServerConfig): string {
  const envHome = normalizeString(process.env.OPENCLAW_STUDIO_CODEX_STACK_HOME);
  if (envHome) return envHome;
  if (path.basename(config.openclawRoot) === ".openclaw") {
    return path.dirname(config.openclawRoot);
  }
  return os.homedir();
}

function resolvePaths(config: StudioServerConfig) {
  const homeDir = resolveHomeDir(config);
  return {
    homeDir,
    openclawJson: config.openclawConfigFile,
    codexConfig: path.join(homeDir, ".codex", "config.toml"),
    cpaConfig: path.join(homeDir, ".cli-proxy-api", "config.yaml"),
    ccConnectConfig: path.join(homeDir, ".cc-connect", "config.toml"),
    ccConnectSocket: path.join(homeDir, ".cc-connect", "run", "api.sock"),
    cliProxyApi: path.join(homeDir, ".local", "bin", "cli-proxy-api"),
    compactProxy: path.join(homeDir, ".local", "bin", "cpa-compact-proxy.mjs"),
    compactService: path.join(homeDir, ".config", "systemd", "user", "cpa-compact-proxy.service"),
    profile: path.join(config.openclawRoot, "studio", "codex-stack", "profile.json"),
    jobsDir: path.join(config.openclawRoot, "studio", "codex-stack", "jobs"),
  };
}

function readStudioCodexStackConfig(config: StudioServerConfig): Record<string, unknown> {
  const openclaw = readJsonFile<Record<string, unknown>>(config.openclawConfigFile, {});
  const plugins = isRecord(openclaw.plugins) ? openclaw.plugins : {};
  const entries = isRecord(plugins.entries) ? plugins.entries : {};
  const studio = isRecord(entries.studio) ? entries.studio : {};
  const studioConfig = isRecord(studio.config) ? studio.config : {};
  const codexStack = isRecord(studioConfig.codexStack) ? studioConfig.codexStack : {};
  return codexStack;
}

function ensureRecordChild(parent: Record<string, unknown>, key: string): Record<string, unknown> {
  const current = parent[key];
  if (isRecord(current)) return current;
  const next: Record<string, unknown> = {};
  parent[key] = next;
  return next;
}

function patchStudioCodexStackConfig(config: StudioServerConfig, patch: Record<string, unknown>): void {
  const openclaw = readJsonFile<Record<string, unknown>>(config.openclawConfigFile, {});
  const plugins = ensureRecordChild(openclaw, "plugins");
  const entries = ensureRecordChild(plugins, "entries");
  const studio = ensureRecordChild(entries, "studio");
  const studioConfig = ensureRecordChild(studio, "config");
  studioConfig.codexStack = {
    ...(isRecord(studioConfig.codexStack)
      ? studioConfig.codexStack
      : {}),
    ...patch,
  };
  writeJsonSecure(config.openclawConfigFile, openclaw);
}

function isLoopbackRequest(req?: http.IncomingMessage): boolean {
  const remote = String(req?.socket?.remoteAddress || "").trim();
  if (!remote) return true;
  return remote === "127.0.0.1"
    || remote === "::1"
    || remote === "::ffff:127.0.0.1"
    || remote === "localhost";
}

function collectGenericSecrets(source: string): string[] {
  const secrets = new Set<string>();
  const patterns = [
    /(?:api[_-]?key|token|password|authorization|bearer)[\s:=]+"?([A-Za-z0-9._~+/=-]{8,})"?/gi,
    /experimental_bearer_token\s*=\s*"([^"]{4,})"/gi,
    /^\s*-\s*"([^"]{8,})"\s*$/gm,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      if (match[1]) secrets.add(match[1]);
    }
  }
  return Array.from(secrets);
}

function redactText(input: string, secrets: string[]): string {
  let output = input;
  const uniqueSecrets = Array.from(new Set(secrets.map((value) => value.trim()).filter((value) => value.length >= 4)));
  for (const secret of uniqueSecrets) {
    output = output.split(secret).join("[REDACTED]");
  }
  output = output.replace(/(Authorization:\s*Bearer\s+)[^\s"'`]+/gi, "$1[REDACTED]");
  output = output.replace(/((?:api[_-]?key|token|password)\s*[:=]\s*)["']?[^"'\s]+["']?/gi, "$1[REDACTED]");
  return output;
}

function parseCpaPort(source: string): number {
  const match = source.match(/^port:\s*["']?(\d+)/m);
  return normalizePort(match?.[1], DMWORK_CPA_PORT);
}

function parseModels(source: string): string[] {
  const models = new Set<string>();
  const patterns = [
    /^\s*-\s*name:\s*"?([^"\n]+)"?/gm,
    /^\s*alias:\s*"?([^"\n]+)"?/gm,
    /^\s*model\s*=\s*"([^"]+)"/gm,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source))) {
      const value = normalizeString(match[1]);
      if (value && !["bigmodel", "manual", "mlamp", "openclaw"].includes(value)) {
        models.add(value);
      }
    }
  }
  for (const preferred of [DMWORK_DEFAULT_MODEL, OFFICIAL_DEFAULT_MODEL, "gpt-5.5", "gpt-5.4", "kimi-k2.6", "deepseek-v4-flash"]) {
    if (source.includes(preferred)) models.add(preferred);
  }
  return Array.from(models).sort((left, right) => left.localeCompare(right));
}

function normalizeModelId(value: unknown): string {
  if (typeof value === "string") return normalizeString(value);
  if (!isRecord(value)) return "";
  for (const key of ["id", "name", "model", "alias"]) {
    const candidate = normalizeString(value[key]);
    if (candidate) return candidate;
  }
  return "";
}

function parseModelListPayload(payload: unknown): string[] {
  const candidates: unknown[] = [];
  if (Array.isArray(payload)) {
    candidates.push(...payload);
  } else if (isRecord(payload)) {
    for (const key of ["data", "models", "available", "items"]) {
      const value = payload[key];
      if (Array.isArray(value)) candidates.push(...value);
    }
  }
  return Array.from(new Set(candidates.map(normalizeModelId).filter(Boolean)))
    .sort((left, right) => left.localeCompare(right));
}

async function discoverModelsFromCompact(
  endpoint: string,
  token: string,
  fallbackModels: string[],
  fallbackSource: CodexStackModelSource,
): Promise<CodexStackModelDiscovery> {
  const refreshedAt = new Date().toISOString();
  const fallback = Array.from(new Set(fallbackModels.filter(Boolean))).sort((left, right) => left.localeCompare(right));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1800);
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(endpoint, { headers, signal: controller.signal });
    if (!response.ok) {
      return {
        available: fallback,
        source: fallbackSource,
        endpoint,
        live: false,
        refreshedAt,
        error: `/v1/models returned HTTP ${response.status}`,
      };
    }
    const payload = await response.json() as unknown;
    const available = parseModelListPayload(payload);
    if (!available.length) {
      return {
        available: fallback,
        source: fallbackSource,
        endpoint,
        live: false,
        refreshedAt,
        error: "/v1/models did not return model ids",
      };
    }
    return {
      available,
      source: "live",
      endpoint,
      live: true,
      refreshedAt,
      error: null,
    };
  } catch (error) {
    return {
      available: fallback,
      source: fallbackSource,
      endpoint,
      live: false,
      refreshedAt,
      error: error instanceof Error ? error.message : "/v1/models request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

function chooseDefaultModel(models: string[], current = ""): string {
  if (current) return current;
  const envOverride = normalizeString(process.env.CODEX_MODEL);
  if (envOverride) return envOverride;
  for (const preferred of [DMWORK_DEFAULT_MODEL, OFFICIAL_DEFAULT_MODEL, "gpt-5.5", "gpt-5.4", "deepseek-v4-flash"]) {
    if (models.includes(preferred)) return preferred;
  }
  return models[0] || DMWORK_DEFAULT_MODEL;
}

function detectCcConnectBinding(source: string): boolean {
  return parseCcConnectConfigSource(source).projects.some((project) => project.platforms.length > 0);
}

function readCcConnectProject(source: string): string {
  return parseCcConnectConfigSource(source).projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT;
}

async function execText(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
): Promise<{ ok: boolean; output: string; code: number | null }> {
  try {
    const result = await execFileAsync(command, args, {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout || 12_000,
      maxBuffer: 6 * 1024 * 1024,
    });
    return {
      ok: true,
      output: [result.stdout, result.stderr].filter(Boolean).join("\n").trim(),
      code: 0,
    };
  } catch (error) {
    const cast = error as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      ok: false,
      output: [cast.stderr, cast.stdout, cast.message].filter(Boolean).join("\n").trim(),
      code: typeof cast.code === "number" ? cast.code : null,
    };
  }
}

async function probeUrl(url: string, token = ""): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface CodexStackService {
  getSummary(req?: http.IncomingMessage): Promise<CodexStackSummaryPayload>;
  getCcConnectConfig(): Promise<CcConnectConfig>;
  enableManagement(req?: http.IncomingMessage): Promise<CodexStackMutationResponse>;
  runCheck(): Promise<CodexStackCheckResponse>;
  startInstall(req: http.IncomingMessage | undefined, payload: CodexStackInstallRequest): Promise<CodexStackJobResponse>;
  startRepair(req: http.IncomingMessage | undefined, payload: CodexStackRepairRequest): Promise<CodexStackJobResponse>;
  finalizeCcConnect(req: http.IncomingMessage | undefined, payload: CodexStackFinalizeRequest): Promise<CodexStackJobResponse>;
  controlService(req: http.IncomingMessage | undefined, serviceId: string, action: string): Promise<CodexStackMutationResponse>;
  patchConfig(req: http.IncomingMessage | undefined, payload: CodexStackConfigPatchRequest): Promise<CodexStackMutationResponse>;
  patchCcConnectConfig(req: http.IncomingMessage | undefined, payload: CodexStackCcConnectConfigPatchRequest): Promise<CodexStackMutationResponse>;
  getJob(jobId: string): CodexStackJob | null;
  readLogs(unitId: string, lines?: number): Promise<CodexStackLogResponse>;
}

export function createCodexStackService(config: StudioServerConfig): CodexStackService {
  const paths = () => resolvePaths(config);

  function profilePath(): string {
    return paths().profile;
  }

  function readProfile(): CodexStackProfile {
    const currentPaths = paths();
    const codex = readText(currentPaths.codexConfig);
    const cpa = readText(currentPaths.cpaConfig);
    const cc = readText(currentPaths.ccConnectConfig);
    const ccParsed = parseCcConnectConfigSource(cc);
    const models = parseModels(`${cpa}\n${codex}\n${cc}`);
    return {
      updatedAt: new Date().toISOString(),
      cpaPort: parseCpaPort(cpa),
      compactPort: normalizePort(
        extractTomlString(codex, "base_url").match(/127\.0\.0\.1:(\d+)/)?.[1],
        DEFAULT_COMPACT_PORT,
      ),
      defaultModel: chooseDefaultModel(models, extractTomlString(codex, "model") || ccParsed.projects[0]?.agentOptions.model),
      ccConnectProject: ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT,
      hasCpaProxyKey: Boolean(extractTomlString(codex, "experimental_bearer_token")),
      channel: "dmwork" as CodexStackChannel,
      ...readJsonFile<Partial<CodexStackProfile>>(profilePath(), {}),
    };
  }

  function writeProfile(profile: CodexStackProfile): void {
    writeJsonSecure(profilePath(), {
      ...profile,
      updatedAt: new Date().toISOString(),
    });
  }

  function resolveChannel(): CodexStackChannel {
    const profile = readJsonFile<Partial<CodexStackProfile>>(profilePath(), {});
    return profile.channel || "dmwork";
  }

  function resolveInstallerSource(channel?: CodexStackChannel): CodexStackInstallerSource {
    const activeChannel = channel || resolveChannel();
    const pluginConfig = readStudioCodexStackConfig(config);
    const configured = normalizeString(pluginConfig.installerPath);
    const candidates: Array<{ kind: CodexStackInstallerSource["kind"]; root: string }> = [];
    if (configured) candidates.push({ kind: "configured", root: configured });

    const subDir = activeChannel === "dmwork" ? "codex-docs-dmwork" : "codex-docs";
    candidates.push({ kind: "bundled", root: path.join(config.projectRoot, "resources", "codex-stack", subDir) });
    candidates.push({ kind: "development-fallback", root: path.join(config.openclawRoot, "codex-docs") });

    const requiredOfficial = [
      "resources/scripts/auto-setup.sh",
      "resources/scripts/health-check.sh",
      "resources/scripts/finish-cc-connect-setup.sh",
      "resources/bin/cli-proxy-api",
      "resources/cpa-config-templates/compact-proxy.mjs",
    ];
    const requiredDmwork = [
      "resources/scripts/auto-setup.sh",
      "resources/scripts/health-check.sh",
      "resources/bin/cli-proxy-api",
      "resources/cpa-config-templates/compact-proxy.mjs",
    ];
    const required = activeChannel === "dmwork" ? requiredDmwork : requiredOfficial;

    for (const candidate of candidates) {
      const missing = required.filter((relative) => !pathExists(path.join(candidate.root, relative)));
      if (missing.length === 0) {
        const scriptsDir = path.join(candidate.root, "resources", "scripts");
        return {
          channel: activeChannel,
          kind: candidate.kind,
          root: candidate.root,
          version: readText(path.join(candidate.root, "VERSION")).trim() || null,
          scripts: {
            autoSetup: path.join(scriptsDir, "auto-setup.sh"),
            healthCheck: path.join(scriptsDir, "health-check.sh"),
            ccConnectFinalizer: pathExists(path.join(scriptsDir, "finish-cc-connect-setup.sh"))
              ? path.join(scriptsDir, "finish-cc-connect-setup.sh") : null,
          },
          requiredFilesPresent: true,
          missingFiles: [],
        };
      }
    }
    const fallbackRoot = configured || path.join(config.projectRoot, "resources", "codex-stack", subDir);
    const missing = required.filter((relative) => !pathExists(path.join(fallbackRoot, relative)));
    return {
      channel: activeChannel,
      kind: "missing",
      root: fallbackRoot,
      version: null,
      scripts: { autoSetup: null, healthCheck: null, ccConnectFinalizer: null },
      requiredFilesPresent: false,
      missingFiles: missing,
    };
  }

  function managementAccess(req?: http.IncomingMessage): CodexStackManagementAccess {
    const pluginConfig = readStudioCodexStackConfig(config);
    const flagEnabled = pluginConfig.allowManagementActions === true;
    const loopback = isLoopbackRequest(req);
    const gatewayAuthorized = req ? isStudioGatewayHttpAuthorized(config, req) : true;
    const trusted = loopback || gatewayAuthorized;
    let reason: CodexStackManagementAccess["reason"] = "enabled";
    if (!trusted) reason = gatewayAuthorized ? "not-loopback" : "gateway-auth-required";
    if (!flagEnabled) reason = "disabled";
    return {
      enabled: flagEnabled && trusted,
      reason,
      loopback,
      gatewayAuthorized,
      configPath: config.openclawConfigFile,
    };
  }

  function requireManagement(req?: http.IncomingMessage): void {
    const access = managementAccess(req);
    if (access.enabled) return;
    throw new CodexStackServiceError(
      "codex_stack_management_locked",
      "Codex Stack management actions are disabled or the request is outside the trusted local/Gateway boundary.",
      403,
    );
  }

  function secretSources(extra: string[] = []): string[] {
    const currentPaths = paths();
    return [
      ...extra,
      ...collectGenericSecrets(readText(config.openclawConfigFile)),
      ...collectGenericSecrets(readText(currentPaths.codexConfig)),
      ...collectGenericSecrets(readText(currentPaths.cpaConfig)),
      ...collectGenericSecrets(readText(currentPaths.ccConnectConfig)),
    ];
  }

  function redact(input: string, extra: string[] = []): string {
    return redactText(input, secretSources(extra));
  }

  function jobsDir(): string {
    return paths().jobsDir;
  }

  function jobPath(jobId: string): string {
    return path.join(jobsDir(), `${jobId}.json`);
  }

  function readLogTail(logPath: string): string {
    try {
      const stat = fs.statSync(logPath);
      const start = Math.max(0, stat.size - JOB_TAIL_CHARS);
      const fd = fs.openSync(logPath, "r");
      const buffer = Buffer.alloc(stat.size - start);
      fs.readSync(fd, buffer, 0, buffer.length, start);
      fs.closeSync(fd);
      return buffer.toString("utf8");
    } catch {
      return "";
    }
  }

  function writeJob(job: CodexStackJob): void {
    const next: CodexStackJob = {
      ...job,
      logTail: readLogTail(job.logPath),
      updatedAt: new Date().toISOString(),
    };
    writeJsonSecure(jobPath(job.id), next);
  }

  function createJob(kind: CodexStackJob["kind"], commandLabel: string): CodexStackJob {
    ensureDir(jobsDir());
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const job: CodexStackJob = {
      id,
      kind,
      status: "queued",
      startedAt: now,
      updatedAt: now,
      finishedAt: null,
      pid: null,
      commandLabel,
      logPath: path.join(jobsDir(), `${id}.log`),
      logTail: "",
      error: null,
    };
    writeJob(job);
    return job;
  }

  function appendJobLog(job: CodexStackJob, chunk: string, extraSecrets: string[] = []): void {
    ensureDir(path.dirname(job.logPath));
    fs.appendFileSync(job.logPath, redact(chunk, extraSecrets), "utf8");
    writeJob(job);
  }

  function recoverJobs(): void {
    ensureDir(jobsDir());
    for (const entry of fs.readdirSync(jobsDir()).filter((name) => name.endsWith(".json"))) {
      const filePath = path.join(jobsDir(), entry);
      const job = readJsonFile<CodexStackJob | null>(filePath, null);
      if (!job || job.status !== "running") continue;
      const next: CodexStackJob = {
        ...job,
        status: "interrupted",
        finishedAt: new Date().toISOString(),
        error: "Studio restarted before this job reported completion. Re-run the action if the summary still shows drift.",
      };
      writeJob(next);
    }
  }

  async function readServiceStatus(id: CodexStackServiceId): Promise<CodexStackServiceStatus> {
    const unit = await execText("systemctl", ["--user", "list-unit-files", id], { timeout: 4_000 });
    const enabled = await execText("systemctl", ["--user", "is-enabled", id], { timeout: 4_000 });
    const active = await execText("systemctl", ["--user", "is-active", id], { timeout: 4_000 });
    const installed = unit.ok && !/0 unit files listed/i.test(unit.output);
    return {
      id,
      installed,
      enabled: enabled.ok && enabled.output.includes("enabled"),
      active: active.ok && active.output.includes("active"),
      rawEnabledState: enabled.output || (installed ? "unknown" : "missing"),
      rawActiveState: active.output || (installed ? "unknown" : "missing"),
    };
  }

  async function versionOf(command: string, args = ["--version"]): Promise<string | null> {
    const result = await execText(command, args, { timeout: 4_000 });
    return result.ok ? result.output.split(/\r?\n/)[0] || "installed" : null;
  }

  function buildComponents(params: {
    codexVersion: string | null;
    omxVersion: string | null;
    ccVersion: string | null;
    services: CodexStackServiceStatus[];
    cpaHealthy: boolean;
    compactHealthy: boolean;
  }): CodexStackComponentSummary[] {
    const currentPaths = paths();
    const serviceById = new Map(params.services.map((service) => [service.id, service]));
    const codexConfigExists = pathExists(currentPaths.codexConfig);
    const cpaConfigExists = pathExists(currentPaths.cpaConfig);
    const ccConfigExists = pathExists(currentPaths.ccConnectConfig);
    return [
      {
        id: "codex",
        label: "Codex CLI",
        status: params.codexVersion && codexConfigExists ? "ok" : "missing",
        installed: Boolean(params.codexVersion),
        version: params.codexVersion,
        notes: [params.omxVersion ? `omx ${params.omxVersion}` : "omx not detected"].filter(Boolean),
        paths: { config: currentPaths.codexConfig },
      },
      {
        id: "cpa",
        label: "CPA",
        status: pathExists(currentPaths.cliProxyApi) && cpaConfigExists && serviceById.get("cli-proxy-api.service")?.active && params.cpaHealthy ? "ok" : "degraded",
        installed: pathExists(currentPaths.cliProxyApi) || cpaConfigExists,
        version: null,
        notes: params.cpaHealthy ? ["healthz ok"] : ["healthz not reachable"],
        paths: { binary: currentPaths.cliProxyApi, config: currentPaths.cpaConfig },
      },
      {
        id: "compact-proxy",
        label: "Compact Proxy",
        status: pathExists(currentPaths.compactProxy) && serviceById.get("cpa-compact-proxy.service")?.active && params.compactHealthy ? "ok" : "degraded",
        installed: pathExists(currentPaths.compactProxy),
        version: null,
        notes: params.compactHealthy ? ["/v1/models ok"] : ["/v1/models not reachable"],
        paths: { script: currentPaths.compactProxy },
      },
      {
        id: "cc-connect",
        label: "cc-connect",
        status: ccConfigExists && detectCcConnectBinding(readText(currentPaths.ccConnectConfig))
          ? (serviceById.get("cc-connect.service")?.active ? "ok" : "degraded")
          : (ccConfigExists ? "degraded" : "missing"),
        installed: Boolean(params.ccVersion) || ccConfigExists,
        version: params.ccVersion,
        notes: ccConfigExists && !detectCcConnectBinding(readText(currentPaths.ccConnectConfig)) ? ["binding required"] : [],
        paths: { config: currentPaths.ccConnectConfig, socket: currentPaths.ccConnectSocket },
      },
      {
        id: "watchdog",
        label: "Codex Stack Watchdog",
        status: serviceById.get("codex-stack-watchdog.timer")?.active ? "ok" : "degraded",
        installed: serviceById.get("codex-stack-watchdog.timer")?.installed === true,
        version: null,
        notes: [],
        paths: { unit: "codex-stack-watchdog.timer" },
      },
    ];
  }

  function classifyOverall(components: CodexStackComponentSummary[], jobs: CodexStackJob[], ccBindingPresent: boolean): CodexStackStatus {
    if (jobs.some((job) => job.status === "running" || job.status === "queued")) return "running-action";
    const required = components.filter((component) => component.id !== "cc-connect");
    if (required.some((component) => !component.installed || component.status === "missing")) return "needs-setup";
    if (!ccBindingPresent) return "binding-required";
    if (components.some((component) => component.status === "failed")) return "failed";
    if (components.some((component) => component.status === "degraded")) return "degraded";
    return "ready";
  }

  function listJobs(): CodexStackJob[] {
    ensureDir(jobsDir());
    return fs.readdirSync(jobsDir())
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJsonFile<CodexStackJob | null>(path.join(jobsDir(), name), null))
      .filter((job): job is CodexStackJob => Boolean(job))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  async function getCcConnectConfig(): Promise<CcConnectConfig> {
    const currentPaths = paths();
    return parseCcConnectConfigSource(readText(currentPaths.ccConnectConfig));
  }

  async function getSummary(req?: http.IncomingMessage): Promise<CodexStackSummaryPayload> {
    const currentPaths = paths();
    const codexConfig = readText(currentPaths.codexConfig);
    const cpaConfig = readText(currentPaths.cpaConfig);
    const ccConfig = readText(currentPaths.ccConnectConfig);
    const ccParsed = parseCcConnectConfigSource(ccConfig);
    const configCpaPort = parseCpaPort(cpaConfig);
    const configCompactPort = normalizePort(extractTomlString(codexConfig, "base_url").match(/127\.0\.0\.1:(\d+)/)?.[1], DEFAULT_COMPACT_PORT);
    const [liveCpaPort, liveCompactPort] = await Promise.all([
      detectLivePort(["cli-proxy-api", "cpa"]),
      detectLivePort(["compact-proxy", "cpa-compact"]),
    ]);
    const cpaPort = liveCpaPort ?? configCpaPort;
    const compactPort = liveCompactPort ?? configCompactPort;
    const cpaProxyKey = extractTomlString(codexConfig, "experimental_bearer_token");
    const parsedModels = parseModels(`${cpaConfig}\n${codexConfig}\n${ccConfig}`);
    const profile = readProfile();
    const currentModel = extractTomlString(codexConfig, "model") || ccParsed.projects[0]?.agentOptions.model || profile.defaultModel;
    const fallbackModels = Array.from(new Set([
      currentModel,
      defaultModel(resolveChannel()),
      ...parsedModels,
    ].filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const modelsEndpoint = `http://127.0.0.1:${compactPort}/v1/models`;
    const services = await Promise.all(SERVICE_IDS.map((id) => readServiceStatus(id)));
    const [codexVersion, omxVersion, ccVersion, cpaHealthy, modelDiscovery] = await Promise.all([
      versionOf("codex"),
      versionOf("omx"),
      versionOf("cc-connect"),
      probeUrl(`http://127.0.0.1:${cpaPort}/healthz`),
      discoverModelsFromCompact(
        modelsEndpoint,
        cpaProxyKey || DEFAULT_CPA_PROXY_KEY,
        fallbackModels,
        parsedModels.length || currentModel ? "config" : "fallback",
      ),
    ]);
    const compactHealthy = modelDiscovery.live;
    const ccBindingPresent = ccParsed.projects.some((project) => project.platforms.length > 0);
    const components = buildComponents({
      codexVersion,
      omxVersion,
      ccVersion,
      services,
      cpaHealthy,
      compactHealthy,
    });
    const warnings: string[] = [];
    const installer = resolveInstallerSource();
    const ccConnectFinalizerAvailable = Boolean(installer.scripts.ccConnectFinalizer);
    if (installer.kind === "development-fallback") warnings.push("Using development codex-docs checkout as installer source.");
    if (installer.kind === "missing") warnings.push("Bundled Codex Stack installer assets are missing.");
    if (ccConfig && !ccBindingPresent) warnings.push("cc-connect is installed/configured but still needs Feishu or Weixin QR binding.");
    if (!modelDiscovery.live && modelDiscovery.error) warnings.push(`模型列表未能从 /v1/models 读取，已使用本地配置回退：${modelDiscovery.error}`);
    return {
      checkedAt: new Date().toISOString(),
      overallStatus: classifyOverall(components, listJobs(), ccBindingPresent),
      homeDir: currentPaths.homeDir,
      profilePath: currentPaths.profile,
      profile: {
        ...profile,
        cpaPort,
        compactPort,
        defaultModel: currentModel || profile.defaultModel,
        ccConnectProject: ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT,
        hasCpaProxyKey: Boolean(cpaProxyKey),
      },
      installer,
      management: managementAccess(req),
      components,
      services,
      ports: { cpa: cpaPort, compact: compactPort, detectedCpa: liveCpaPort, detectedCompact: liveCompactPort },
      models: {
        current: currentModel || defaultModel(resolveChannel()),
        defaultModel: chooseDefaultModel(modelDiscovery.available, currentModel),
        available: Array.from(new Set([
          currentModel,
          defaultModel(resolveChannel()),
          ...modelDiscovery.available,
        ].filter(Boolean))).sort((left, right) => left.localeCompare(right)),
        source: modelDiscovery.source,
        endpoint: modelDiscovery.endpoint,
        live: modelDiscovery.live,
        refreshedAt: modelDiscovery.refreshedAt,
        error: modelDiscovery.error,
      },
      secrets: {
        cpaProxyKey: cpaProxyKey
          ? { hasSecret: true, ...maskSecret(cpaProxyKey), source: currentPaths.codexConfig }
          : { hasSecret: false, masked: null, source: null, length: null },
        upstreamKeys: collectGenericSecrets(cpaConfig).map((secret) => ({
          hasSecret: true,
          ...maskSecret(secret),
          source: currentPaths.cpaConfig,
        })),
      },
      ccConnect: {
        installed: Boolean(ccVersion) || pathExists(currentPaths.ccConnectConfig),
        configured: pathExists(currentPaths.ccConnectConfig),
        project: ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT,
        bindingPresent: ccBindingPresent,
        socketPath: currentPaths.ccConnectSocket,
        socketPresent: isSocket(currentPaths.ccConnectSocket),
        setupCommands: [
          `cc-connect feishu setup --project ${ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT}`,
          `cc-connect weixin setup --project ${ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT}`,
        ],
        finalizerAvailable: ccConnectFinalizerAvailable,
        canFinalize: ccBindingPresent && ccConnectFinalizerAvailable,
      },
      warnings,
    };
  }

  async function restartCcConnectIfRunning(): Promise<boolean> {
    const status = await readServiceStatus("cc-connect.service");
    if (!status.active) return false;
    const result = await execText("systemctl", ["--user", "restart", "cc-connect.service"], { timeout: 30_000 });
    if (!result.ok) {
      throw new CodexStackServiceError(
        "codex_stack_service_action_failed",
        redact(result.output || "cc-connect.service restart failed"),
        500,
      );
    }
    return true;
  }

  async function enableManagement(req?: http.IncomingMessage): Promise<CodexStackMutationResponse> {
    const loopback = isLoopbackRequest(req);
    const gatewayAuthorized = req ? isStudioGatewayHttpAuthorized(config, req) : true;
    if (!loopback && !gatewayAuthorized) {
      throw new CodexStackServiceError("codex_stack_management_untrusted", "Management can only be enabled from loopback or an authenticated Gateway request.", 403);
    }
    patchStudioCodexStackConfig(config, { allowManagementActions: true });
    return {
      ok: true,
      message: "Codex Stack management actions enabled for Studio.",
      summary: await getSummary(req),
    };
  }

  async function runCheck(): Promise<CodexStackCheckResponse> {
    const installer = resolveInstallerSource();
    const currentPaths = paths();
    const script = installer.scripts.healthCheck;
    if (!script || !pathExists(script)) {
      throw new CodexStackServiceError("codex_stack_health_check_missing", "health-check.sh is not available in the resolved installer source.", 404);
    }
    const result = await execText("bash", [script], {
      timeout: 45_000,
      env: {
        ...process.env,
        HOME: currentPaths.homeDir,
        OPENCLAW_JSON: currentPaths.openclawJson,
      },
    });
    const output = redact(result.output);
    const items: CodexStackCheckItem[] = output.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (/FAIL/i.test(line)) return { level: "fail", message: line };
        if (/WARN/i.test(line)) return { level: "warn", message: line };
        if (/OK/i.test(line)) return { level: "ok", message: line };
        return { level: "info", message: line };
      });
    const profile = readProfile();
    writeProfile({ ...profile, lastCheckAt: new Date().toISOString() });
    return {
      checkedAt: new Date().toISOString(),
      ok: result.ok,
      items,
      outputTail: output.slice(-JOB_TAIL_CHARS),
    };
  }

  function normalizeInstallPayload(payload: CodexStackInstallRequest): {
    env: Record<string, string>;
    flags: string[];
    secrets: string[];
    profilePatch: Partial<CodexStackProfile>;
  } {
    const envInput = isRecord(payload.env) ? payload.env : {};
    const unknownEnv = Object.keys(envInput).filter((key) => !(INSTALL_ENV_KEYS as readonly string[]).includes(key));
    if (unknownEnv.length) {
      throw new CodexStackServiceError("codex_stack_invalid_install_env", `Unsupported install env keys: ${unknownEnv.join(", ")}`);
    }
    const env: Record<string, string> = {};
    const secrets: string[] = [];
    for (const key of INSTALL_ENV_KEYS) {
      const value = envInput[key as keyof typeof envInput];
      if (value === undefined || value === null || value === "") continue;
      env[key] = String(value);
      if (key.includes("KEY")) secrets.push(String(value));
    }
    const flags: string[] = [];
    if (payload.flags?.skipNpm === true) flags.push("--skip-npm");
    if (payload.flags?.skipCcConnect === true) flags.push("--skip-cc-connect");
    if (payload.flags?.noStart === true) flags.push("--no-start");
    if (payload.flags?.skipExisting === true) flags.push("--skip-existing");
    if (payload.flags?.forceReinstall === true) flags.push("--force-reinstall");
    const skipList = payload.flags?.skipComponents?.filter(Boolean).join(",");
    if (skipList) flags.push(`--skip=${skipList}`);
    const forceList = payload.flags?.forceReinstallComponents?.filter(Boolean).join(",");
    if (forceList) flags.push(`--force=${forceList}`);
    return {
      env,
      flags,
      secrets,
      profilePatch: {
        cpaPort: normalizePort(env.CPA_PORT, defaultCpaPort(resolveChannel())),
        compactPort: normalizePort(env.COMPACT_PORT, DEFAULT_COMPACT_PORT),
        defaultModel: normalizeString(env.CODEX_MODEL, defaultModel(resolveChannel())),
        hasCpaProxyKey: Boolean(env.CPA_PROXY_KEY),
        upstreamOverride: {
          hasBaseUrl: Boolean(env.OPENCLAW_UPSTREAM_BASE_URL),
          hasApiKey: Boolean(env.OPENCLAW_UPSTREAM_API_KEY),
        },
      },
    };
  }

  async function startInstall(req: http.IncomingMessage | undefined, payload: CodexStackInstallRequest): Promise<CodexStackJobResponse> {
    requireManagement(req);
    const channel = payload.flags?.channel || resolveChannel();
    const installer = resolveInstallerSource(channel);
    if (!installer.requiredFilesPresent || !installer.scripts.autoSetup || !installer.root) {
      throw new CodexStackServiceError("codex_stack_installer_missing", "Codex Stack installer assets are missing.", 404);
    }
    const normalized = normalizeInstallPayload(payload || {});
    const currentPaths = paths();
    const job = createJob("install", "bash auto-setup.sh");
    job.status = "running";
    writeJob(job);
    const child = spawn("bash", [installer.scripts.autoSetup, ...normalized.flags], {
      cwd: installer.root,
      env: {
        ...process.env,
        ...normalized.env,
        HOME: currentPaths.homeDir,
        OPENCLAW_JSON: currentPaths.openclawJson,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    job.pid = Number.isFinite(child.pid) ? child.pid || null : null;
    writeJob(job);
    child.stdout?.on("data", (chunk) => appendJobLog(job, String(chunk), normalized.secrets));
    child.stderr?.on("data", (chunk) => appendJobLog(job, String(chunk), normalized.secrets));
    child.on("error", (error) => {
      job.status = "failed";
      job.error = error.message;
      job.finishedAt = new Date().toISOString();
      appendJobLog(job, `\n[studio] ${error.message}\n`, normalized.secrets);
      writeJob(job);
    });
    child.on("close", (code) => {
      job.status = code === 0 ? "succeeded" : "failed";
      job.error = code === 0 ? null : `Installer exited with code ${code ?? "unknown"}`;
      job.finishedAt = new Date().toISOString();
      appendJobLog(job, `\n[studio] install ${job.status}\n`, normalized.secrets);
      const profile = readProfile();
      writeProfile({
        ...profile,
        ...normalized.profilePatch,
        installerSource: installer.root,
        ccConnectProject: profile.ccConnectProject || DEFAULT_CC_CONNECT_PROJECT,
        channel: installer.channel,
        lastInstallAt: new Date().toISOString(),
      });
      writeJob(job);
    });
    return { ok: true, job: { ...job, logTail: readLogTail(job.logPath) } };
  }

  async function runNodeJob(
    kind: CodexStackJob["kind"],
    commandLabel: string,
    task: (job: CodexStackJob) => Promise<void>,
  ): Promise<CodexStackJobResponse> {
    const job = createJob(kind, commandLabel);
    job.status = "running";
    writeJob(job);
    void (async () => {
      try {
        await task(job);
        job.status = "succeeded";
        job.error = null;
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : "Job failed";
        appendJobLog(job, `\n[studio] ${job.error}\n`);
      } finally {
        job.finishedAt = new Date().toISOString();
        writeJob(job);
      }
    })();
    return { ok: true, job };
  }

  async function startRepair(req: http.IncomingMessage | undefined, payload: CodexStackRepairRequest): Promise<CodexStackJobResponse> {
    requireManagement(req);
    const actions = Array.isArray(payload.actions) ? payload.actions : [];
    const unknown = actions.filter((action) => !(REPAIR_ACTIONS as readonly string[]).includes(action));
    if (unknown.length) {
      throw new CodexStackServiceError("codex_stack_invalid_repair_action", `Unsupported repair actions: ${unknown.join(", ")}`);
    }
    if (!actions.length) {
      throw new CodexStackServiceError("codex_stack_empty_repair", "At least one repair action is required.");
    }
    return runNodeJob("repair", `repair: ${actions.join(", ")}`, async (job) => {
      const installer = resolveInstallerSource();
      const currentPaths = paths();
      const runSystemctl = async (...args: string[]) => {
        appendJobLog(job, `\n$ systemctl --user ${args.join(" ")}\n`);
        const result = await execText("systemctl", ["--user", ...args], { timeout: 30_000 });
        appendJobLog(job, `${result.output}\n`);
        if (!result.ok) throw new Error(`systemctl --user ${args.join(" ")} failed`);
      };
      for (const action of actions as RepairAction[]) {
        if (action === "restart-cpa") await runSystemctl("restart", "cli-proxy-api.service");
        if (action === "restart-compact-proxy") await runSystemctl("restart", "cpa-compact-proxy.service");
        if (action === "restart-watchdog") await runSystemctl("restart", "codex-stack-watchdog.timer");
        if (action === "restart-cc-connect") await runSystemctl("restart", "cc-connect.service");
        if (action === "disable-conflicting-units") {
          await execText("systemctl", ["--user", "disable", "--now", "cpa.service"], { timeout: 30_000 });
          await execText("systemctl", ["--user", "disable", "--now", "cliproxyapi.service"], { timeout: 30_000 });
          appendJobLog(job, "Disabled old conflicting units if they existed.\n");
        }
        if (action === "rerun-install-no-start") {
          if (!installer.scripts.autoSetup || !installer.root || !pathExists(installer.scripts.autoSetup)) {
            throw new Error("auto-setup.sh is missing");
          }
          const result = await execText("bash", [installer.scripts.autoSetup, "--skip-npm", "--no-start"], {
            cwd: installer.root,
            timeout: 180_000,
            env: {
              ...process.env,
              HOME: currentPaths.homeDir,
              OPENCLAW_JSON: currentPaths.openclawJson,
            },
          });
          appendJobLog(job, `${result.output}\n`);
          if (!result.ok) throw new Error("auto-setup repair failed");
        }
      }
      const profile = readProfile();
      writeProfile({ ...profile, lastRepairAt: new Date().toISOString() });
    });
  }

  async function finalizeCcConnect(req: http.IncomingMessage | undefined, payload: CodexStackFinalizeRequest): Promise<CodexStackJobResponse> {
    requireManagement(req);
    const currentPaths = paths();
    const ccConfig = readText(currentPaths.ccConnectConfig);
    if (!detectCcConnectBinding(ccConfig)) {
      throw new CodexStackServiceError("codex_stack_cc_connect_unbound", "Run cc-connect Feishu/Weixin QR binding before finalizing the daemon.", 409);
    }
    const installer = resolveInstallerSource();
    const script = installer.scripts.ccConnectFinalizer;
    if (!script || !pathExists(script)) {
      throw new CodexStackServiceError("codex_stack_finalizer_missing", "finish-cc-connect-setup.sh is not available.", 404);
    }
    const project = normalizeString(payload.project, readCcConnectProject(ccConfig));
    const args = [script, "--project", project];
    if (payload.noAdminAll === true) args.push("--no-admin-all");
    return runNodeJob("finalize", "finish cc-connect setup", async (job) => {
      const result = await execText("bash", args, {
        timeout: 120_000,
        env: {
          ...process.env,
          HOME: currentPaths.homeDir,
          CC_CONNECT_CONFIG: currentPaths.ccConnectConfig,
          CC_CONNECT_PROJECT: project,
        },
      });
      appendJobLog(job, `${result.output}\n`);
      if (!result.ok) throw new Error("cc-connect finalizer failed");
    });
  }

  async function controlService(
    req: http.IncomingMessage | undefined,
    serviceId: string,
    action: string,
  ): Promise<CodexStackMutationResponse> {
    requireManagement(req);
    if (!(SERVICE_IDS as readonly string[]).includes(serviceId)) {
      throw new CodexStackServiceError("codex_stack_invalid_service", `Unsupported service id: ${serviceId}`);
    }
    if (!(SERVICE_ACTIONS as readonly string[]).includes(action)) {
      throw new CodexStackServiceError("codex_stack_invalid_service_action", `Unsupported service action: ${action}`);
    }
    const result = await execText("systemctl", ["--user", action, serviceId], { timeout: 30_000 });
    if (!result.ok) {
      throw new CodexStackServiceError("codex_stack_service_action_failed", redact(result.output || `systemctl ${action} failed`), 500);
    }
    return {
      ok: true,
      message: `${serviceId} ${action} requested.`,
      summary: await getSummary(req),
    };
  }

  async function patchConfig(
    req: http.IncomingMessage | undefined,
    payload: CodexStackConfigPatchRequest,
  ): Promise<CodexStackMutationResponse> {
    requireManagement(req);
    const allowed = ["defaultModel", "cpaPort", "compactPort", "cpaProxyKey", "ccConnectProject"];
    const unknown = Object.keys(payload || {}).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      throw new CodexStackServiceError("codex_stack_invalid_config_patch", `Unsupported config fields: ${unknown.join(", ")}`);
    }
    const currentPaths = paths();
    const restartRequired = new Set<CodexStackServiceId>();
    const model = normalizeString(payload.defaultModel);
    const ccProject = normalizeString(payload.ccConnectProject);
    const cpaPort = payload.cpaPort === undefined ? null : normalizePort(payload.cpaPort, 0);
    const compactPort = payload.compactPort === undefined ? null : normalizePort(payload.compactPort, 0);
    const cpaKey = normalizeString(payload.cpaProxyKey);
    if (payload.cpaPort !== undefined && !cpaPort) throw new CodexStackServiceError("codex_stack_invalid_port", "cpaPort must be between 1 and 65535.");
    if (payload.compactPort !== undefined && !compactPort) throw new CodexStackServiceError("codex_stack_invalid_port", "compactPort must be between 1 and 65535.");

    const codex = readText(currentPaths.codexConfig);
    if (codex) {
      let next = codex;
      if (model) {
        next = replaceTomlString(next, "model", model);
        restartRequired.add("cpa-compact-proxy.service");
      }
      if (compactPort) {
        next = replaceTomlString(next, "base_url", `http://127.0.0.1:${compactPort}/v1`);
        next = next.replace(/(base_url\s*=\s*")http:\/\/127\.0\.0\.1:\d+\/v1(")/g, `$1http://127.0.0.1:${compactPort}/v1$2`);
        restartRequired.add("cpa-compact-proxy.service");
      }
      if (cpaKey) {
        next = replaceTomlString(next, "experimental_bearer_token", cpaKey);
        restartRequired.add("cpa-compact-proxy.service");
      }
      if (next !== codex) backupAndWrite(currentPaths.codexConfig, next);
    }

    const cc = readText(currentPaths.ccConnectConfig);
    if (cc) {
      const parsedCc = parseCcConnectConfigSource(cc);
      if (!parsedCc.projects.length) {
        parsedCc.projects.push(emptyCcConnectProject());
      }
      if (model) parsedCc.projects[0].agentOptions.model = model;
      if (ccProject) parsedCc.projects[0].name = ccProject;
      const next = patchCcConnectStructuredToml(cc, { projects: parsedCc.projects });
      if (next !== cc) {
        backupAndWrite(currentPaths.ccConnectConfig, next);
        restartRequired.add("cc-connect.service");
      }
    }

    const cpa = readText(currentPaths.cpaConfig);
    if (cpa) {
      let next = cpa;
      if (cpaPort) {
        next = replaceYamlNumber(next, "port", cpaPort);
        restartRequired.add("cli-proxy-api.service");
      }
      if (cpaKey) next = replaceFirstYamlListSecret(next, cpaKey);
      if (next !== cpa) backupAndWrite(currentPaths.cpaConfig, next);
    }

    const compactUnit = readText(currentPaths.compactService);
    if (compactUnit) {
      let next = compactUnit;
      if (cpaPort) next = replaceEnvLine(next, "CPA_PORT", cpaPort);
      if (compactPort) next = replaceEnvLine(next, "LISTEN_PORT", compactPort);
      if (model) next = replaceEnvLine(next, "COMPACT_DEFAULT_MODEL", model);
      if (next !== compactUnit) {
        backupAndWrite(currentPaths.compactService, next);
        restartRequired.add("cpa-compact-proxy.service");
      }
    }

    const profile = readProfile();
    writeProfile({
      ...profile,
      cpaPort: cpaPort || profile.cpaPort,
      compactPort: compactPort || profile.compactPort,
      defaultModel: model || profile.defaultModel,
      ccConnectProject: ccProject || profile.ccConnectProject,
      hasCpaProxyKey: cpaKey ? true : profile.hasCpaProxyKey,
    });

    return {
      ok: true,
      message: "Codex Stack config updated. Restart listed services to apply runtime changes.",
      restartRequiredUnits: Array.from(restartRequired),
      summary: await getSummary(req),
    };
  }

  async function patchCcConnectConfig(
    req: http.IncomingMessage | undefined,
    payload: CodexStackCcConnectConfigPatchRequest,
  ): Promise<CodexStackMutationResponse> {
    requireManagement(req);
    const allowed = ["raw", "language", "providers", "projects"];
    const patch = isRecord(payload) ? payload : {};
    const unknown = Object.keys(patch).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      throw new CodexStackServiceError("codex_stack_invalid_cc_connect_patch", `Unsupported cc-connect config fields: ${unknown.join(", ")}`);
    }

    const currentPaths = paths();
    const currentRaw = readText(currentPaths.ccConnectConfig);
    const hasRawPatch = Object.prototype.hasOwnProperty.call(patch, "raw");
    const hasStructuredPatch = Object.keys(patch).some((key) => key !== "raw");
    if (hasRawPatch && hasStructuredPatch) {
      throw new CodexStackServiceError(
        "codex_stack_invalid_cc_connect_patch",
        "Provide either raw TOML or structured cc-connect patch fields, not both.",
      );
    }

    let nextRaw = currentRaw;
    if (hasRawPatch) {
      if (typeof patch.raw !== "string") {
        throw new CodexStackServiceError("codex_stack_invalid_cc_connect_patch", "raw must be a string.");
      }
      nextRaw = normalizeTomlMultiline(patch.raw);
    } else {
      nextRaw = patchCcConnectStructuredToml(currentRaw, {
        language: typeof patch.language === "string" ? patch.language : undefined,
        providers: Array.isArray(patch.providers) ? patch.providers : undefined,
        projects: Array.isArray(patch.projects) ? patch.projects : undefined,
      });
    }

    const changed = nextRaw !== currentRaw;
    let restarted = false;
    if (changed) {
      backupAndWrite(currentPaths.ccConnectConfig, nextRaw);
      restarted = await restartCcConnectIfRunning();
    }

    return {
      ok: true,
      message: changed
        ? (restarted ? "cc-connect config updated and service restarted." : "cc-connect config updated.")
        : "cc-connect config unchanged.",
      restartRequiredUnits: changed && !restarted ? ["cc-connect.service"] : [],
      summary: await getSummary(req),
    };
  }

  function getJob(jobId: string): CodexStackJob | null {
    const normalized = jobId.replace(/[^A-Za-z0-9_.-]/g, "");
    if (!normalized || normalized !== jobId) return null;
    const job = readJsonFile<CodexStackJob | null>(jobPath(normalized), null);
    return job ? { ...job, logTail: readLogTail(job.logPath) } : null;
  }

  async function readLogs(unitId: string, lines = 160): Promise<CodexStackLogResponse> {
    if (!(SERVICE_IDS as readonly string[]).includes(unitId)) {
      throw new CodexStackServiceError("codex_stack_invalid_service", `Unsupported log unit: ${unitId}`);
    }
    const serviceId = unitId as CodexStackServiceId;
    const boundedLines = Math.max(20, Math.min(500, Math.floor(Number(lines) || 160)));
    const sections: Array<{
      kind: "journal" | "file";
      label: string;
      path?: string;
      output: string;
    }> = [];
    const result = await execText("journalctl", ["--user", "-u", serviceId, "-n", String(boundedLines), "--no-pager"], { timeout: 10_000 });
    sections.push({
      kind: "journal",
      label: `journalctl --user -u ${serviceId}`,
      output: redact(result.output),
    });

    for (const filePath of FALLBACK_LOG_FILES[serviceId] || []) {
      if (!pathExists(filePath)) continue;
      const fileOutput = redact(readFileTailLines(filePath, boundedLines));
      sections.push({
        kind: "file",
        label: path.basename(filePath),
        path: filePath,
        output: fileOutput,
      });
    }

    const joined = sections
      .map((section) => [
        `===== ${section.label}${section.path ? ` (${section.path})` : ""} =====`,
        section.output || "(no output)",
      ].join("\n"))
      .join("\n\n");
    const output = joined.slice(-JOB_TAIL_CHARS);
    const returnedLines = output ? output.split(/\r?\n/).length : 0;
    return {
      unitId: serviceId,
      output,
      sources: sections.map((section) => ({
        kind: section.kind,
        label: section.label,
        path: section.path,
      })),
      requestedLines: boundedLines,
      returnedLines,
      truncated: joined.length > output.length,
      fetchedAt: new Date().toISOString(),
    };
  }

  recoverJobs();

  return {
    getSummary,
    getCcConnectConfig,
    enableManagement,
    runCheck,
    startInstall,
    startRepair,
    finalizeCcConnect,
    controlService,
    patchConfig,
    patchCcConnectConfig,
    getJob,
    readLogs,
  };
}
