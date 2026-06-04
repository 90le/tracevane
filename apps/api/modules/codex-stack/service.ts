import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS,
} from "../../../../types/codex-stack.js";
import {
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
} from "../../../../types/model-gateway.js";
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
  CodexStackContextMode,
  CodexStackFinalizeRequest,
  CodexStackInstallRequest,
  CodexStackInstallerSource,
  CodexStackJob,
  CodexStackJobResponse,
  CodexStackJobStatus,
  CodexStackLogResponse,
  CodexStackManagementAccess,
  CodexStackManualServiceId,
  CodexStackModelSource,
  CodexStackMutationResponse,
  CodexStackProfile,
  CodexStackRepairRequest,
  CodexStackRunReadinessCheck,
  CodexStackServiceAction,
  CodexStackServiceId,
  CodexStackServiceStatus,
  CodexStackSmokeCheckId,
  CodexStackSmokeCheckResult,
  CodexStackSmokeMatrixResult,
  CodexStackSmokeModelResult,
  CodexStackStatus,
  CodexStackSummaryPayload,
} from "../../../../types/codex-stack.js";
import { isStudioGatewayHttpAuthorized } from "../../gateway-http-auth.js";
import { readJsonFile } from "../../core/state.js";
import { createModelGatewayDaemonServicePlan } from "../model-gateway/supervisor.js";

const execFileAsync = promisify(execFile);

const OFFICIAL_CPA_PORT = 8317;
const DMWORK_CPA_PORT = 18795;
const DEFAULT_COMPACT_PORT = 18796;
const GPT_55_MODEL = "gpt-5.5";
const GPT_55_CONTEXT_TOKENS = 1_050_000;
const DEFAULT_CONTEXT_TOKENS = 20_000;
const MAX_CONTEXT_TOKENS = GPT_55_CONTEXT_TOKENS;
const CPA_LATEST_VERSION = "v7.1.17";
const CPA_MANAGEMENT_PANEL_REPOSITORY = "https://github.com/router-for-me/Cli-Proxy-API-Management-Center";
const OFFICIAL_DEFAULT_MODEL = "glm-5.1";
const DMWORK_DEFAULT_MODEL = "kimi-k2.6";
const REQUIRED_CPA_SMOKE_CHECKS = CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS;
const SMOKE_MATRIX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function isDmworkFamily(channel?: CodexStackChannel): boolean {
  return channel === "dmwork" || channel === "octo";
}
function defaultCpaPort(channel?: CodexStackChannel): number {
  return isDmworkFamily(channel) ? DMWORK_CPA_PORT : OFFICIAL_CPA_PORT;
}
const DEFAULT_CPA_PROXY_KEY = "studio";
const DEFAULT_CC_CONNECT_PROJECT = "main";
const JOB_TAIL_CHARS = 12_000;

const SERVICE_IDS = [
  "cli-proxy-api.service",
  "cli-proxy-api-healthcheck.timer",
  "cpa-compact-proxy.service",
  "cc-connect.service",
  "codex-stack-watchdog.timer",
] as const satisfies readonly CodexStackServiceId[];

const MANUAL_SERVICE_IDS = [
  "cli-proxy-api.service",
  "cpa-compact-proxy.service",
  "cc-connect.service",
] as const satisfies readonly CodexStackManualServiceId[];

const SERVICE_ACTIONS = ["restart", "start", "stop", "enable"] as const satisfies readonly CodexStackServiceAction[];

const FALLBACK_LOG_FILES: Record<CodexStackServiceId, string[]> = {
  "cli-proxy-api.service": ["/tmp/cpa.log"],
  "cli-proxy-api-healthcheck.timer": [],
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
  "CODEX_CONTEXT_MODE",
  "CODEX_CONTEXT_WINDOW",
  "OPENCLAW_UPSTREAM_BASE_URL",
  "OPENCLAW_UPSTREAM_API_KEY",
  "OPENCLAW_PROVIDER_PROXY_URL",
  "OPENCLAW_NO_PROXY",
] as const;

const REPAIR_ACTIONS = [
  "pause-stack",
  "resume-stack",
  "restart-cpa",
  "restart-compact-proxy",
  "restart-watchdog",
  "restart-cc-connect",
  "repair-auth-json",
  "repair-cpa-management",
  "repair-codex-transport",
  "repair-no-proxy-loopback",
  "disable-legacy-healthcheck",
  "run-smoke-matrix",
  "apply-codex-studio-after-smoke",
  "restore-official-chatgpt",
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

function normalizeContextMode(value: unknown, fallback: CodexStackContextMode = "default"): CodexStackContextMode {
  return value === "default" || value === "codex-1m" || value === "custom" ? value : fallback;
}

function normalizeContextTokens(value: unknown, fallback: number | null = DEFAULT_CONTEXT_TOKENS): number | null {
  if (value === null) return null;
  const tokens = Number(value);
  if (!Number.isFinite(tokens) || tokens <= 0) return fallback;
  return Math.max(1_000, Math.min(MAX_CONTEXT_TOKENS, Math.floor(tokens)));
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

function removeFileIfExists(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    fs.rmSync(filePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

function readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function systemctlOutputHasState(output: string, expected: string): boolean {
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .some((line) => line === expected);
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

function writeTextAtomic(filePath: string, content: string, mode = 0o644): void {
  ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, content, { mode });
  fs.renameSync(tempPath, filePath);
  try {
    fs.chmodSync(filePath, mode);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
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

function parseTomlStringArray(valueSource: string): string[] {
  const trimmed = valueSource.trim();
  if (!trimmed.startsWith("[") || !trimmed.includes("]")) return [];
  const body = trimmed.slice(1, trimmed.indexOf("]"));
  return body.split(",")
    .map((entry) => parseTomlScalar(entry.trim()))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTomlAssignment(line: string): { key: string; value: string; rawValue: string } | null {
  const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*=\s*(.+?)\s*$/);
  if (!match?.[1] || !match[2]) return null;
  return {
    key: match[1].trim(),
    value: parseTomlScalar(match[2]),
    rawValue: match[2],
  };
}

function emptyCcConnectProvider(): CcConnectProvider {
  return {
    name: "",
    apiKey: "",
    baseUrl: "",
    codexEnvKey: "",
    model: "",
    models: [],
    agentTypes: [],
    endpoints: {},
    agentModels: {},
    codex: {
      envKey: "",
      wireApi: "",
      httpHeaders: {},
    },
  };
}

function emptyCcConnectProject(): CcConnectProject {
  return {
    name: "",
    adminFrom: "",
    agentType: "",
    providerRefs: [],
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
  let currentProviderModel: NonNullable<CcConnectProvider["models"]>[number] | null = null;
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
        currentProviderModel = null;
        config.providers.push(currentProvider);
      } else if (header.array && header.name === "providers.models") {
        if (!currentProvider) {
          currentProvider = emptyCcConnectProvider();
          config.providers.push(currentProvider);
        }
        currentProvider.models ||= [];
        currentProviderModel = { model: "", alias: "" };
        currentProvider.models.push(currentProviderModel);
      } else if (header.array && header.name === "projects") {
        currentProject = emptyCcConnectProject();
        config.projects.push(currentProject);
        currentPlatform = null;
        currentProviderModel = null;
      } else if (header.array && header.name === "projects.platforms") {
        if (!currentProject) {
          currentProject = emptyCcConnectProject();
          config.projects.push(currentProject);
        }
        currentPlatform = emptyCcConnectPlatform();
        currentProject.platforms.push(currentPlatform);
        currentProviderModel = null;
      } else {
        currentProviderModel = null;
      }
      continue;
    }

    const assignment = parseTomlAssignment(trimmed);
    if (!assignment) continue;
    const { key, value, rawValue } = assignment;
    if (!currentSection && key === "language") {
      config.language = value;
      continue;
    }
    if (currentSection === "providers" && currentProvider) {
      if (key === "name") currentProvider.name = value;
      if (key === "api_key") currentProvider.apiKey = value;
      if (key === "base_url") currentProvider.baseUrl = value;
      if (key === "model") currentProvider.model = value;
      if (key === "agent_types") currentProvider.agentTypes = parseTomlStringArray(rawValue);
      if (key === "codex_env_key" || key === "codex.env_key") currentProvider.codexEnvKey = value;
      if (key === "codex.wire_api") {
        currentProvider.codex ||= {};
        currentProvider.codex.wireApi = value;
      }
      continue;
    }
    if (currentSection === "providers.models" && currentProviderModel) {
      if (key === "model") currentProviderModel.model = value;
      if (key === "alias") currentProviderModel.alias = value;
      continue;
    }
    if (currentSection === "providers.endpoints" && currentProvider) {
      currentProvider.endpoints ||= {};
      currentProvider.endpoints[key] = value;
      continue;
    }
    if (currentSection === "providers.agent_models" && currentProvider) {
      currentProvider.agentModels ||= {};
      currentProvider.agentModels[key] = value;
      continue;
    }
    if (currentSection === "providers.codex" && currentProvider) {
      currentProvider.codex ||= {};
      if (key === "env_key") currentProvider.codex.envKey = value;
      if (key === "wire_api") currentProvider.codex.wireApi = value;
      continue;
    }
    if (currentSection === "providers.codex.http_headers" && currentProvider) {
      currentProvider.codex ||= {};
      currentProvider.codex.httpHeaders ||= {};
      currentProvider.codex.httpHeaders[key] = value;
      continue;
    }
    if (currentSection === "projects" && currentProject) {
      if (key === "name") currentProject.name = value;
      if (key === "admin_from") currentProject.adminFrom = value;
      continue;
    }
    if (currentSection === "projects.agent" && currentProject) {
      if (key === "type") currentProject.agentType = value;
      if (key === "provider_refs") currentProject.providerRefs = parseTomlStringArray(rawValue);
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
      const models = (provider.models || []).filter((model) => model.model || model.alias);
      const agentTypes = (provider.agentTypes || []).map((item) => item.trim()).filter(Boolean);
      const endpoints = Object.entries(provider.endpoints || {}).filter(([key, value]) => key.trim() && value.trim());
      const agentModels = Object.entries(provider.agentModels || {}).filter(([key, value]) => key.trim() && value.trim());
      const codex = provider.codex || {};
      const codexEnvKey = provider.codexEnvKey || codex.envKey || "";
      const codexWireApi = codex.wireApi || "";
      const lines = [
        "[[providers]]",
        `name = "${escapeTomlString(provider.name || "")}"`,
        `api_key = "${escapeTomlString(provider.apiKey || "")}"`,
        `base_url = "${escapeTomlString(provider.baseUrl || "")}"`,
        provider.model ? `model = "${escapeTomlString(provider.model)}"` : "",
        agentTypes.length ? `agent_types = [${agentTypes.map((item) => `"${escapeTomlString(item)}"`).join(", ")}]` : "",
        `codex.env_key = "${escapeTomlString(codexEnvKey)}"`,
        codexWireApi ? `codex.wire_api = "${escapeTomlString(codexWireApi)}"` : "",
      ];
      if (endpoints.length) {
        lines.push("", "[providers.endpoints]");
        for (const [key, value] of endpoints) {
          lines.push(`${key.trim()} = "${escapeTomlString(value.trim())}"`);
        }
      }
      if (agentModels.length) {
        lines.push("", "[providers.agent_models]");
        for (const [key, value] of agentModels) {
          lines.push(`${key.trim()} = "${escapeTomlString(value.trim())}"`);
        }
      }
      for (const model of models) {
        lines.push(
          "",
          "[[providers.models]]",
          `model = "${escapeTomlString(model.model || "")}"`,
          model.alias ? `alias = "${escapeTomlString(model.alias)}"` : "",
        );
      }
      return lines.filter((line) => line !== "").join("\n");
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
      (project.providerRefs || []).length
        ? `provider_refs = [${(project.providerRefs || []).map((ref) => `"${escapeTomlString(ref)}"`).join(", ")}]`
        : "",
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

    return lines.filter((line, index, list) => line !== "" || (list[index - 1] !== "" && list[index + 1] !== "")).join("\n");
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

function extractTopLevelTomlString(source: string, key: string): string {
  const firstSection = source.search(/^\s*\[[^\]]+\]\s*$/m);
  const topLevel = firstSection === -1 ? source : source.slice(0, firstSection);
  return extractTomlString(topLevel, key);
}

function extractTomlSection(source: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "m"));
  if (!match || match.index === undefined) return "";
  const start = match.index + match[0].length;
  const rest = source.slice(start);
  const nextSection = rest.search(/^\s*\[[^\]]+\]\s*$/m);
  return nextSection === -1 ? rest : rest.slice(0, nextSection);
}

function extractCpaProviderBaseUrl(source: string): string {
  return extractTomlString(extractTomlSection(source, "model_providers.cpa"), "base_url")
    || extractTopLevelTomlString(source, "base_url")
    || extractTopLevelTomlString(source, "openai_base_url");
}

function extractLocalCompactPortFromCodexConfig(source: string): number | null {
  const match = extractCpaProviderBaseUrl(source).match(/127\.0\.0\.1:(\d+)/);
  return match?.[1] ? normalizePort(match[1], 0) || null : null;
}

function codexConfigUsesLocalCompact(source: string, compactPort: number): boolean {
  if (extractTopLevelTomlString(source, "model_provider") === "cpa") return true;
  const topLevelBaseUrl = extractTopLevelTomlString(source, "base_url")
    || extractTopLevelTomlString(source, "openai_base_url");
  if (!topLevelBaseUrl) return false;
  return new RegExp(`^(?:https?://)?(?:127\\.0\\.0\\.1|localhost):${compactPort}(?:/|$)`).test(topLevelBaseUrl);
}

function extractTomlNumber(source: string, key: string): number | null {
  const match = source.match(new RegExp(`^\\s*${key}\\s*=\\s*([0-9][0-9_]*)`, "m"));
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/_/g, ""));
  return Number.isFinite(value) ? value : null;
}

function replaceTomlString(source: string, key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const pattern = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"(\\s*)$`, "m");
  if (pattern.test(source)) {
    return source.replace(pattern, `$1"${escaped}"$2`);
  }
  return `${source.replace(/\s+$/g, "")}\n${key} = "${escaped}"\n`;
}

function upsertTopLevelTomlString(source: string, key: string, value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const firstSection = source.search(/^\s*\[[^\]]+\]\s*$/m);
  const topLevel = firstSection === -1 ? source : source.slice(0, firstSection);
  const rest = firstSection === -1 ? "" : source.slice(firstSection);
  const pattern = new RegExp(`^(\\s*${key}\\s*=\\s*)"[^"]*"(\\s*)$`, "m");
  if (pattern.test(topLevel)) return `${topLevel.replace(pattern, `$1"${escaped}"$2`)}${rest}`;
  return `${topLevel.replace(/\s+$/g, "")}\n${key} = "${escaped}"\n\n${rest.replace(/^\s+/, "")}`;
}

function replaceTomlNumber(source: string, key: string, value: number): string {
  const pattern = new RegExp(`^(\\s*${key}\\s*=\\s*)[0-9][0-9_]*(\\s*)$`, "m");
  if (pattern.test(source)) {
    return source.replace(pattern, `$1${value}$2`);
  }
  return `${source.replace(/\s+$/g, "")}\n${key} = ${value}\n`;
}

function removeTopLevelTomlKey(source: string, key: string): string {
  const pattern = new RegExp(`^\\s*${key}\\s*=.*\\n?`, "m");
  return source.replace(pattern, "");
}

function removeTopLevelTomlStringValue(source: string, key: string, value: string): string {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*${key}\\s*=\\s*"${escapedValue}"\\s*\\n?`, "m");
  return source.replace(pattern, "");
}

function upsertTomlSection(source: string, header: string, body: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^\\s*\\[${escaped}\\]\\s*$`, "m");
  const rendered = `[${header}]\n${body.replace(/\s+$/g, "")}\n`;
  const match = source.match(pattern);
  if (match && match.index !== undefined) {
    const start = match.index;
    const sectionBodyStart = match.index + match[0].length;
    const rest = source.slice(sectionBodyStart);
    const nextSection = rest.search(/^\s*\[[^\]]+\]\s*$/m);
    const end = nextSection === -1 ? source.length : sectionBodyStart + nextSection;
    return `${source.slice(0, start).replace(/\s+$/g, "")}\n\n${rendered}\n${source.slice(end).replace(/^\s+/, "")}`.replace(/^\s+/, "");
  }
  const features = source.match(/^\s*\[features\]\s*$/m);
  if (features?.index !== undefined) {
    return `${source.slice(0, features.index).replace(/\s+$/g, "")}\n\n${rendered}\n${source.slice(features.index).replace(/^\s+/, "")}`;
  }
  return `${source.replace(/\s+$/g, "")}\n\n${rendered}`;
}

function applyCodexCpaProviderSection(source: string, baseUrl: string, proxyKey: string): string {
  const managedKeys = new Set(["name", "base_url", "wire_api", "supports_websockets", "experimental_bearer_token"]);
  const preserved = extractTomlSection(source, "model_providers.cpa")
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      return key ? !managedKeys.has(key) : Boolean(line.trim());
    });
  return upsertTomlSection(source, "model_providers.cpa", [
    'name = "CPA"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    "supports_websockets = false",
    `experimental_bearer_token = ${JSON.stringify(proxyKey)}`,
    ...preserved,
  ].join("\n"));
}

function modelGatewayDaemonBaseUrl(): string {
  return `http://${MODEL_GATEWAY_DEFAULT_HOST}:${MODEL_GATEWAY_DEFAULT_PORT}/v1`;
}

function applyCodexStudioProviderSection(source: string, baseUrl = modelGatewayDaemonBaseUrl()): string {
  const managedKeys = new Set(["name", "base_url", "wire_api", "supports_websockets", "experimental_bearer_token"]);
  const preserved = extractTomlSection(source, "model_providers.studio")
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)?.[1];
      return key ? !managedKeys.has(key) : Boolean(line.trim());
    });
  return upsertTomlSection(source, "model_providers.studio", [
    'name = "OpenClaw Studio Model Gateway"',
    `base_url = ${JSON.stringify(baseUrl)}`,
    'wire_api = "responses"',
    "supports_websockets = false",
    'experimental_bearer_token = "PROXY_MANAGED"',
    ...preserved,
  ].join("\n"));
}

function applyCodexStudioActiveProvider(source: string, model: string, baseUrl = modelGatewayDaemonBaseUrl()): string {
  let next = applyCodexStudioProviderSection(applyCodexStableTransport(source), baseUrl);
  next = upsertTopLevelTomlString(next, "model_provider", "studio");
  next = upsertTopLevelTomlString(next, "model", model);
  return removeTopLevelLocalCompactBaseUrls(next);
}

function applyOfficialChatGptRoute(source: string): string {
  let next = removeTopLevelTomlStringValue(source, "model_provider", "cpa");
  next = upsertTopLevelTomlString(next, "model", GPT_55_MODEL);
  return removeTopLevelLocalCompactBaseUrls(next);
}

function isOfficialChatGptModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized.startsWith("gpt-") || normalized.startsWith("o1") || normalized.startsWith("o3") || normalized.startsWith("o4");
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

function replaceOrAppendYamlString(source: string, key: string, value: string): string {
  const escaped = JSON.stringify(value);
  const pattern = new RegExp(`^(\\s*${key}:\\s*).*$`, "m");
  return pattern.test(source) ? source.replace(pattern, `$1${escaped}`) : `${source.replace(/\s+$/g, "")}\n${key}: ${escaped}\n`;
}

function readYamlStringEntry(source: string, key: string): { present: boolean; value: string } {
  const match = source.match(new RegExp(`^\\s*${key}:\\s*(.*?)\\s*$`, "m"));
  return {
    present: Boolean(match),
    value: match?.[1] !== undefined ? parseTomlScalar(match[1]) : "",
  };
}

function readYamlString(source: string, key: string): string {
  return readYamlStringEntry(source, key).value;
}

function firstOpenaiCompatibilityProviderBounds(lines: string[]): { start: number; end: number } | null {
  const header = lines.findIndex((line) => /^openai-compatibility:\s*$/.test(line));
  if (header < 0) return null;
  let start = header + 1;
  while (start < lines.length && !lines[start]?.trim()) start += 1;
  if (!/^- \S/.test(lines[start] || "")) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end] || "";
    if (/^- \S/.test(line) || /^[A-Za-z0-9_-]+:\s*/.test(line)) break;
    end += 1;
  }
  return { start, end };
}

function readFirstOpenaiCompatibilityValue(source: string, key: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const bounds = firstOpenaiCompatibilityProviderBounds(lines);
  if (!bounds) return "";
  const pattern = new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`);
  for (let index = bounds.start; index < bounds.end; index += 1) {
    const match = lines[index]?.match(pattern);
    if (match?.[1]) return parseTomlScalar(match[1]);
  }
  return "";
}

function readFirstOpenaiCompatibilityApiKey(source: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const bounds = firstOpenaiCompatibilityProviderBounds(lines);
  if (!bounds) return "";
  for (let index = bounds.start; index < bounds.end; index += 1) {
    const match = lines[index]?.match(/^\s*-\s*api-key:\s*(.+?)\s*$/);
    if (match?.[1]) return parseTomlScalar(match[1]);
  }
  return "";
}

function ensureYamlListEntry(source: string, key: string, value: string): string {
  if (!value) return source;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const header = lines.findIndex((line) => new RegExp(`^\\s*${key}:\\s*$`).test(line));
  const escaped = JSON.stringify(value);
  if (header < 0) return `${source.replace(/\s+$/g, "")}\n${key}:\n  - ${escaped}\n`;
  let index = header + 1;
  let lastItem = header;
  let itemIndent = "  ";
  while (index < lines.length) {
    const line = lines[index] || "";
    const item = line.match(/^(\s*)-\s*(.+?)\s*$/);
    if (!item) break;
    itemIndent = item[1] || itemIndent;
    if (parseTomlScalar(item[2]) === value) return source;
    lastItem = index;
    index += 1;
  }
  lines.splice(lastItem + 1, 0, `${itemIndent}- ${escaped}`);
  return lines.join("\n");
}

function replaceOrInsertProviderValue(lines: string[], key: string, value: string, afterIndex: number): void {
  const bounds = firstOpenaiCompatibilityProviderBounds(lines);
  if (!bounds) return;
  const pattern = new RegExp(`^(\\s*${key}:\\s*).*$`);
  for (let index = bounds.start; index < bounds.end; index += 1) {
    if (pattern.test(lines[index] || "")) {
      lines[index] = (lines[index] || "").replace(pattern, `$1${JSON.stringify(value)}`);
      return;
    }
  }
  lines.splice(Math.min(afterIndex, bounds.end), 0, `  ${key}: ${JSON.stringify(value)}`);
}

function ensureFirstProviderApiKeyEntry(lines: string[], apiKey: string | null, proxyUrl: string | null): void {
  const bounds = firstOpenaiCompatibilityProviderBounds(lines);
  if (!bounds) return;
  let entriesIndex = -1;
  let apiKeyIndex = -1;
  for (let index = bounds.start; index < bounds.end; index += 1) {
    const line = lines[index] || "";
    if (/^\s*api-key-entries:\s*$/.test(line)) entriesIndex = index;
    if (/^\s*-\s*api-key:\s*/.test(line) && apiKeyIndex < 0) apiKeyIndex = index;
  }
  if (entriesIndex < 0) {
    const insertAt = bounds.start + 1;
    lines.splice(insertAt, 0, "  api-key-entries:");
    entriesIndex = insertAt;
    if (apiKeyIndex >= insertAt) apiKeyIndex += 1;
  }
  if (apiKey && apiKeyIndex >= 0) {
    lines[apiKeyIndex] = (lines[apiKeyIndex] || "").replace(/^(\s*-\s*api-key:\s*).*$/, `$1${JSON.stringify(apiKey)}`);
  } else if (apiKey && apiKeyIndex < 0) {
    lines.splice(entriesIndex + 1, 0, `  - api-key: ${JSON.stringify(apiKey)}`);
    apiKeyIndex = entriesIndex + 1;
  }
  if (proxyUrl !== null) {
    if (apiKeyIndex < 0) {
      lines.splice(entriesIndex + 1, 0, `  - api-key: ""`);
      apiKeyIndex = entriesIndex + 1;
    }
    let providerEnd = firstOpenaiCompatibilityProviderBounds(lines)?.end || lines.length;
    let insertAt = apiKeyIndex + 1;
    let proxyIndex = -1;
    for (let index = apiKeyIndex + 1; index < providerEnd; index += 1) {
      const line = lines[index] || "";
      if (/^\s*-\s*api-key:\s*/.test(line) || /^\s*models:\s*$/.test(line)) break;
      if (/^\s*proxy-url:\s*/.test(line)) {
        proxyIndex = index;
        break;
      }
      insertAt = index + 1;
    }
    if (proxyIndex >= 0) {
      lines[proxyIndex] = (lines[proxyIndex] || "").replace(/^(\s*proxy-url:\s*).*$/, `$1${JSON.stringify(proxyUrl)}`);
    } else {
      providerEnd = firstOpenaiCompatibilityProviderBounds(lines)?.end || lines.length;
      lines.splice(Math.min(insertAt, providerEnd), 0, `    proxy-url: ${JSON.stringify(proxyUrl)}`);
    }
  }
}

function patchFirstOpenaiCompatibilityProvider(
  source: string,
  patch: { baseUrl?: string | null; apiKey?: string | null; proxyUrl?: string | null },
): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const bounds = firstOpenaiCompatibilityProviderBounds(lines);
  if (!bounds) return source;
  if (Object.prototype.hasOwnProperty.call(patch, "baseUrl")) replaceOrInsertProviderValue(lines, "base-url", patch.baseUrl || "", bounds.start + 1);
  if (patch.apiKey || patch.proxyUrl !== undefined) ensureFirstProviderApiKeyEntry(lines, patch.apiKey || null, patch.proxyUrl ?? null);
  return lines.join("\n");
}

function ensureCpaRemoteManagementBlock(source: string, managementKey = DEFAULT_CPA_PROXY_KEY): string {
  const block = [
    "remote-management:",
    "  allow-remote: false",
    `  secret-key: ${JSON.stringify(managementKey)}`,
    "  disable-control-panel: false",
    `  panel-github-repository: ${JSON.stringify(CPA_MANAGEMENT_PANEL_REPOSITORY)}`,
  ].join("\n");
  const pattern = /^remote-management:\n(?:(?:[ \t].*|[ \t]*)\n?)*/m;
  if (pattern.test(source)) return source.replace(pattern, `${block}\n`);
  return `${source.replace(/\s+$/g, "")}\n\n${block}\n`;
}

function yamlBlock(source: string, key: string): string {
  const match = source.match(new RegExp(`^${key}:\\n((?:(?:[ \\t].*|[ \\t]*)\\n?)*)`, "m"));
  return match?.[1] || "";
}

function yamlBlockString(source: string, blockKey: string, key: string): string {
  const block = yamlBlock(source, blockKey);
  const match = block.match(new RegExp(`^\\s*${key}:\\s*['"]?([^'"\\n]*)['"]?\\s*$`, "m"));
  return match?.[1]?.trim() || "";
}

function yamlBlockBoolean(source: string, blockKey: string, key: string, fallback: boolean): boolean {
  const value = yamlBlockString(source, blockKey, key).toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

function readCodexAuthRecord(authPath: string): Record<string, unknown> {
  return readJsonFile<Record<string, unknown>>(authPath, {});
}

function readCodexAuth(authPath: string): { mode: string | null; key: string } {
  const auth = readCodexAuthRecord(authPath);
  return {
    mode: typeof auth.auth_mode === "string" ? auth.auth_mode : null,
    key: typeof auth.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY.trim() : "",
  };
}

function authRecordMode(auth: Record<string, unknown>): string | null {
  return typeof auth.auth_mode === "string" ? auth.auth_mode : null;
}

function representativeAuthSecret(auth: Record<string, unknown>): string {
  for (const key of ["refresh_token", "access_token", "id_token", "account_id", "OPENAI_API_KEY"]) {
    const value = auth[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function codexAuthHasMeaningfulLogin(auth: Record<string, unknown>): boolean {
  return Object.entries(auth).some(([key, value]) => {
    if (key === "auth_mode") return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (value && typeof value === "object") return Object.keys(value).length > 0;
    return value !== undefined && value !== null;
  });
}

function isOfficialChatGptCodexAuth(auth: Record<string, unknown>): boolean {
  const mode = typeof auth.auth_mode === "string" ? auth.auth_mode.trim().toLowerCase() : "";
  if (mode === "apikey") return false;
  if (mode === "chatgpt") return codexAuthHasMeaningfulLogin(auth);
  return ["refresh_token", "access_token", "id_token", "account_id"].some((key) => (
    typeof auth[key] === "string" && auth[key].trim().length > 0
  ));
}

function preserveOfficialCodexAuth(authPath: string, backupPath: string): void {
  if (!pathExists(authPath)) return;
  const auth = readCodexAuthRecord(authPath);
  if (!isOfficialChatGptCodexAuth(auth)) return;
  writeJsonSecure(backupPath, auth);
}

function writeCodexAuth(authPath: string, apiKey: string, backupPath?: string): void {
  if (!apiKey) return;
  if (backupPath) preserveOfficialCodexAuth(authPath, backupPath);
  const current = readCodexAuthRecord(authPath);
  writeJsonSecure(authPath, {
    ...current,
    auth_mode: "apikey",
    OPENAI_API_KEY: apiKey,
  });
}

function restoreOfficialCodexAuth(authPath: string, backupPath: string): boolean {
  if (!pathExists(backupPath)) return false;
  const backup = readCodexAuthRecord(backupPath);
  if (!isOfficialChatGptCodexAuth(backup)) return false;
  writeJsonSecure(authPath, backup);
  return true;
}

function readCodexContext(source: string): {
  mode: CodexStackContextMode;
  tokens: number | null;
  enabled: boolean;
} {
  const tokens = normalizeContextTokens(extractTomlNumber(source, "model_context_window"), null);
  if (!tokens) return { mode: "default", tokens: null, enabled: false };
  if (tokens >= 1_000_000) return { mode: "codex-1m", tokens, enabled: true };
  return { mode: "custom", tokens, enabled: false };
}

function applyCodexContext(
  source: string,
  mode: CodexStackContextMode,
  tokens: number | null,
): string {
  if (mode === "default") {
    return removeTopLevelTomlKey(removeTopLevelTomlKey(source, "model_context_window"), "model_auto_compact_token_limit");
  }
  const nextTokens = mode === "codex-1m" ? GPT_55_CONTEXT_TOKENS : normalizeContextTokens(tokens, DEFAULT_CONTEXT_TOKENS);
  if (!nextTokens) return source;
  let next = replaceTomlNumber(source, "model_context_window", nextTokens);
  const compactLimit = Math.floor(nextTokens * 0.9);
  next = replaceTomlNumber(next, "model_auto_compact_token_limit", compactLimit);
  return next;
}

function hasCodexResponsesWebSocketsEnabled(source: string): boolean {
  return /^\s*responses_websockets(?:_v2)?\s*=\s*true\s*$/m.test(source);
}

function hasCodexRequestCompressionEnabled(source: string): boolean {
  return /^\s*enable_request_compression\s*=\s*true\s*$/m.test(source);
}

function applyCodexStableTransport(source: string): string {
  const setExistingBoolean = (input: string, key: string, value: boolean): string => {
    const re = new RegExp(`^(\\s*${key}\\s*=\\s*)(true|false)(\\s*)$`, "gm");
    return input.replace(re, `$1${value ? "true" : "false"}$3`);
  };
  const ensureTopLevelBoolean = (input: string, key: string, value: boolean): string => {
    const rendered = `${key} = ${value ? "true" : "false"}`;
    const firstSection = input.search(/^\s*\[[^\]]+\]\s*$/m);
    if (firstSection === -1) return `${input.replace(/\s+$/g, "")}\n${rendered}\n`;
    const topLevel = input.slice(0, firstSection);
    const rest = input.slice(firstSection);
    if (new RegExp(`^\\s*${key}\\s*=`, "m").test(topLevel)) return input;
    return `${topLevel.replace(/\s+$/g, "")}\n${rendered}\n\n${rest.replace(/^\s+/, "")}`;
  };
  const ensureFeaturesBoolean = (input: string, key: string, value: boolean): string => {
    const rendered = `${key} = ${value ? "true" : "false"}`;
    const header = input.match(/^\s*\[features\]\s*$/m);
    if (!header || header.index === undefined) return `${input.replace(/\s+$/g, "")}\n\n[features]\n${rendered}\n`;
    const sectionStart = header.index + header[0].length;
    const afterHeader = input.slice(sectionStart);
    const nextSection = afterHeader.search(/^\s*\[[^\]]+\]\s*$/m);
    const sectionEnd = nextSection === -1 ? input.length : sectionStart + nextSection;
    const section = input.slice(sectionStart, sectionEnd);
    if (new RegExp(`^\\s*${key}\\s*=`, "m").test(section)) return input;
    return `${input.slice(0, sectionStart)}\n${rendered}${input.slice(sectionStart)}`;
  };
  let next = setExistingBoolean(source, "responses_websockets", false);
  next = setExistingBoolean(next, "responses_websockets_v2", false);
  next = setExistingBoolean(next, "enable_request_compression", false);
  next = ensureTopLevelBoolean(next, "responses_websockets", false);
  next = ensureTopLevelBoolean(next, "responses_websockets_v2", false);
  next = ensureFeaturesBoolean(next, "responses_websockets", false);
  next = ensureFeaturesBoolean(next, "responses_websockets_v2", false);
  next = ensureFeaturesBoolean(next, "enable_request_compression", false);
  return next;
}

function hasLocalCompactBaseUrl(source: string): boolean {
  return /^\s*(?:base_url|openai_base_url)\s*=\s*"http:\/\/127\.0\.0\.1:\d+\/v1"\s*$/m.test(source);
}

function replaceLocalCompactBaseUrls(source: string, baseUrl: string): string {
  return source.replace(
    /^(\s*(?:base_url|openai_base_url)\s*=\s*")http:\/\/127\.0\.0\.1:\d+\/v1("\s*)$/gm,
    `$1${baseUrl}$2`,
  );
}

function removeTopLevelLocalCompactBaseUrls(source: string): string {
  const firstSection = source.search(/^\s*\[[^\]]+\]\s*$/m);
  const topLevel = firstSection === -1 ? source : source.slice(0, firstSection);
  const rest = firstSection === -1 ? "" : source.slice(firstSection);
  return `${topLevel.replace(/^\s*(?:base_url|openai_base_url)\s*=\s*"http:\/\/127\.0\.0\.1:\d+\/v1"\s*\n?/gm, "")}${rest}`;
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
    codexAuth: path.join(homeDir, ".codex", "auth.json"),
    codexOfficialAuthBackup: path.join(homeDir, ".codex", "auth.chatgpt.backup.json"),
    cpaConfig: path.join(homeDir, ".cli-proxy-api", "config.yaml"),
    ccConnectConfig: path.join(homeDir, ".cc-connect", "config.toml"),
    ccConnectSocket: path.join(homeDir, ".cc-connect", "run", "api.sock"),
    cliProxyApi: path.join(homeDir, ".local", "bin", "cli-proxy-api"),
    compactProxy: path.join(homeDir, ".local", "bin", "cpa-compact-proxy.mjs"),
    legacyHealthcheckBin: path.join(homeDir, ".local", "bin", "cli-proxy-api-healthcheck"),
    cpaService: path.join(homeDir, ".config", "systemd", "user", "cli-proxy-api.service"),
    compactService: path.join(homeDir, ".config", "systemd", "user", "cpa-compact-proxy.service"),
    legacyHealthcheckService: path.join(homeDir, ".config", "systemd", "user", "cli-proxy-api-healthcheck.service"),
    legacyHealthcheckTimer: path.join(homeDir, ".config", "systemd", "user", "cli-proxy-api-healthcheck.timer"),
    legacyCpaAlwaysOnDropIn: path.join(homeDir, ".config", "systemd", "user", "cli-proxy-api.service.d", "10-always-on.conf"),
    legacyCompactAlwaysOnDropIn: path.join(homeDir, ".config", "systemd", "user", "cpa-compact-proxy.service.d", "10-always-on.conf"),
    ccConnectSource: path.join(config.projectRoot, "resources", "codex-stack", "cc-connect-source"),
    profile: path.join(config.openclawRoot, "studio", "codex-stack", "profile.json"),
    jobsDir: path.join(config.openclawRoot, "studio", "codex-stack", "jobs"),
  };
}

function writeModelGatewayDaemonServiceTemplate(config: StudioServerConfig): string {
  const plan = createModelGatewayDaemonServicePlan(config);
  writeTextAtomic(plan.selectedTemplate.configPath, plan.selectedTemplate.template);
  return plan.selectedTemplate.configPath;
}

function prepareCodexStudioGatewayProvider(codexConfigPath: string): boolean {
  const current = readText(codexConfigPath);
  if (!current) return false;
  const next = applyCodexStudioProviderSection(applyCodexStableTransport(current));
  if (next === current) return false;
  backupAndWrite(codexConfigPath, next);
  return true;
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

function parseCpaPort(source: string, fallback = DMWORK_CPA_PORT): number {
  const match = source.match(/^port:\s*["']?(\d+)/m);
  return normalizePort(match?.[1], fallback);
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
  for (const preferred of [GPT_55_MODEL, "gpt-5.4", DMWORK_DEFAULT_MODEL, OFFICIAL_DEFAULT_MODEL, "deepseek-v4-flash"]) {
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

function readOpenclawDefaultModel(configPath: string): string {
  const openclaw = readJsonFile<Record<string, unknown>>(configPath, {});
  const direct = normalizeModelId(openclaw.defaultModel);
  if (direct) return direct;
  const models = isRecord(openclaw.models) ? openclaw.models : {};
  const defaultModel = normalizeModelId(models.defaultModel ?? models.default);
  if (defaultModel) return defaultModel;
  return "";
}

function readOpenclawProviderModels(configPath: string): string[] {
  const openclaw = readJsonFile<Record<string, unknown>>(configPath, {});
  const models = isRecord(openclaw.models) ? openclaw.models : {};
  const providers = isRecord(models.providers) ? models.providers : {};
  const values: string[] = [];
  for (const provider of Object.values(providers)) {
    if (!isRecord(provider) || !Array.isArray(provider.models)) continue;
    for (const model of provider.models) {
      const modelId = normalizeModelId(model);
      if (modelId) values.push(modelId);
    }
  }
  return Array.from(new Set(values));
}

function readOpenclawPreferredModels(configPath: string): string[] {
  const preferred: string[] = [];
  const fallback = readOpenclawDefaultModel(configPath);
  if (fallback) preferred.push(fallback);
  preferred.push(...readOpenclawProviderModels(configPath));
  return Array.from(new Set(preferred));
}

function readOpenclawEnvValue(configPath: string, keys: string[]): { value: string; source: string | null } {
  const openclaw = readJsonFile<Record<string, unknown>>(configPath, {});
  const env = isRecord(openclaw.env) ? openclaw.env : {};
  for (const key of keys) {
    const direct = normalizeString(openclaw[key]);
    if (direct) return { value: direct, source: `openclaw.${key}` };
    const fromEnv = normalizeString(env[key]) || normalizeString(env[key.toLowerCase()]);
    if (fromEnv) return { value: fromEnv, source: `openclaw.env.${key}` };
  }
  for (const key of keys) {
    const value = normalizeString(process.env[key]);
    if (value) return { value, source: `process.env.${key}` };
  }
  return { value: "", source: null };
}

function patchOpenclawEnvValues(configPath: string, values: Record<string, string>): void {
  const openclaw = readJsonFile<Record<string, unknown>>(configPath, {});
  const env = isRecord(openclaw.env) ? { ...openclaw.env } : {};
  let changed = false;
  for (const [key, value] of Object.entries(values)) {
    if (env[key] === value) continue;
    env[key] = value;
    changed = true;
  }
  if (!changed) return;
  backupAndWrite(configPath, `${JSON.stringify({ ...openclaw, env }, null, 2)}\n`);
}

function collectCpaProxyUrls(source: string): string[] {
  const urls = new Set<string>();
  const pattern = /^\s*proxy-url:\s*["']?([^"'\n]+)["']?\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const value = normalizeString(match[1]);
    if (value) urls.add(value);
  }
  return Array.from(urls);
}

function noProxyLoopbackMissing(noProxy: string): string[] {
  const entries = new Set(noProxy
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry) => [entry, entry.replace(/^\[(.*)\]$/, "$1")]));
  const coversAll = entries.has("*");
  const missing: string[] = [];
  if (!coversAll && !entries.has("localhost") && !entries.has(".localhost")) missing.push("localhost");
  if (!coversAll && !entries.has("127.0.0.1") && !entries.has("127.0.0.0/8")) missing.push("127.0.0.1");
  if (!coversAll && !entries.has("::1")) missing.push("::1");
  return missing;
}

function ensureNoProxyLoopback(noProxy: string): string {
  const entries = noProxy.split(",").map((entry) => entry.trim()).filter(Boolean);
  const missing = noProxyLoopbackMissing(noProxy);
  if (!entries.length) return missing.join(",");
  return [...entries, ...missing].join(",");
}

function isSmokeMatrixStale(matrix: CodexStackSmokeMatrixResult | null | undefined): boolean {
  if (!matrix?.attachEligible) return false;
  const checkedAt = Date.parse(matrix.checkedAt);
  if (!Number.isFinite(checkedAt)) return true;
  return Date.now() - checkedAt > SMOKE_MATRIX_MAX_AGE_MS;
}

function normalizeSmokeModel(model: string | null | undefined): string {
  return (model || "").trim();
}

function smokeMatrixCoversTarget(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  const target = normalizeSmokeModel(targetModel);
  if (!target) return true;
  return Boolean(matrix?.requiredModels.some((model) => normalizeSmokeModel(model) === target));
}

function isSmokeMatrixComplete(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  if (!matrix?.attachEligible || matrix.status !== "passed") return false;
  const requiredModels = matrix.requiredModels.map((model) => normalizeSmokeModel(model)).filter(Boolean);
  if (!requiredModels.length) return false;
  if (!smokeMatrixCoversTarget(matrix, targetModel)) return false;
  const declaredRequired = new Set(requiredModels);
  const results = new Map(matrix.models.map((result) => [normalizeSmokeModel(result.model), result]));
  return requiredModels.every((model) => {
    if (!declaredRequired.has(model)) return false;
    const result = results.get(model);
    if (result?.status !== "passed") return false;
    const passedChecks = new Set(result.checks.filter((check) => check.status === "passed").map((check) => check.id));
    return REQUIRED_CPA_SMOKE_CHECKS.every((checkId) => passedChecks.has(checkId));
  });
}

function isSmokeMatrixFreshAndComplete(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): boolean {
  return isSmokeMatrixComplete(matrix, targetModel) && !isSmokeMatrixStale(matrix);
}

function smokeMatrixTargetMismatchDetail(matrix: CodexStackSmokeMatrixResult | null | undefined, targetModel = ""): string | null {
  const target = normalizeSmokeModel(targetModel);
  if (!target || !matrix?.attachEligible || smokeMatrixCoversTarget(matrix, target)) return null;
  const covered = matrix.requiredModels.map((model) => normalizeSmokeModel(model)).filter(Boolean).join("、") || "未记录模型";
  return `上次 smoke matrix 覆盖 ${covered}，但当前目标模型是 ${target}；请重新运行目标模型 smoke matrix。`;
}

function smokeMatrixFailureDetail(matrix: CodexStackSmokeMatrixResult | null | undefined): string | null {
  if (!matrix) return null;
  const failures = matrix.models
    .filter((model) => model.status === "failed" || model.checks.some((check) => check.status === "failed"))
    .map((model) => {
      const failedChecks = model.checks
        .filter((check) => check.status === "failed")
        .map((check) => check.label || check.id);
      const parts = [
        failedChecks.length ? `失败检查 ${failedChecks.join("、")}` : "",
        model.error || "",
      ].filter(Boolean);
      return `${model.model}: ${parts.join("；") || "模型 smoke 未通过"}`;
    });
  if (!failures.length && matrix.status === "failed") return "上次 smoke matrix 失败，但未记录具体失败检查；请重新运行当前默认 CPA 模型 smoke matrix。";
  if (!failures.length) return null;
  return `上次 smoke matrix 失败：${failures.join("；")}。`;
}

function readProxyPolicy(cpaConfig: string, openclawPath: string): CodexStackSummaryPayload["proxyPolicy"] {
  const cpaConfigProxyUrls = collectCpaProxyUrls(cpaConfig);
  const configuredProxy = cpaConfigProxyUrls.find((value) => value !== "direct") || "";
  const topLevelUpstreamBaseUrl = readYamlStringEntry(cpaConfig, "upstream_base_url");
  const topLevelUpstreamApiKey = readYamlStringEntry(cpaConfig, "upstream_api_key");
  const upstreamBaseUrl = topLevelUpstreamBaseUrl.present
    ? topLevelUpstreamBaseUrl.value
    : readFirstOpenaiCompatibilityValue(cpaConfig, "base-url");
  const upstreamApiKey = topLevelUpstreamApiKey.present
    ? topLevelUpstreamApiKey.value
    : readFirstOpenaiCompatibilityApiKey(cpaConfig);
  const fallbackProxy = readOpenclawEnvValue(openclawPath, [
    "OPENAI_PROXY_URL",
    "OPENCLAW_FOREIGN_PROXY_URL",
    "HTTPS_PROXY",
    "HTTP_PROXY",
  ]);
  const noProxy = readOpenclawEnvValue(openclawPath, ["NO_PROXY", "OPENCLAW_NO_PROXY"]).value || "localhost,127.0.0.1,::1";
  const missingLoopback = noProxyLoopbackMissing(noProxy);
  return {
    providerMode: configuredProxy ? "proxy" : "direct",
    providerProxyUrl: configuredProxy || fallbackProxy.value || null,
    providerProxySource: configuredProxy ? "cpa-config" : fallbackProxy.source,
    noProxy,
    noProxyLoopbackReady: missingLoopback.length === 0,
    noProxyLoopbackMissing: missingLoopback,
    cpaConfigProxyUrls,
    upstreamBaseUrl: upstreamBaseUrl || null,
    upstreamApiKeyConfigured: Boolean(upstreamApiKey),
  };
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

function chooseDefaultModel(models: string[], current = "", openclawDefault = ""): string {
  if (current) return current;
  const envOverride = normalizeString(process.env.CODEX_MODEL);
  if (envOverride) return envOverride;
  if (openclawDefault) return openclawDefault;
  for (const preferred of [GPT_55_MODEL, "gpt-5.4", "deepseek-v4-flash"]) {
    if (models.includes(preferred)) return preferred;
  }
  return models[0] || "";
}

function detectCcConnectBinding(source: string): boolean {
  return parseCcConnectConfigSource(source).projects.some((project) => project.platforms.some((platform) => {
    const type = platform.type.trim().toLowerCase();
    const values = Object.values(platform.options || {}).map((value) => value.trim()).filter(Boolean);
    if (!type || !values.length) return false;
    if (type === "feishu") {
      return Boolean(platform.options.app_id?.trim() && platform.options.app_secret?.trim());
    }
    if (type === "weixin" || type === "wechat") {
      return Boolean(platform.options.app_id?.trim() || platform.options.token?.trim() || platform.options.webhook_url?.trim());
    }
    return values.length > 0;
  }));
}

function readCcConnectProject(source: string): string {
  return parseCcConnectConfigSource(source).projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT;
}

function normalizeCcConnectBaseUrl(value: string): string {
  return normalizeString(value).replace(/\/+$/, "");
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

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseSseEvents(source: string): Array<{ event: string | null; data: string }> {
  return source.split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split(/\r?\n/);
      const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim() || null;
      const data = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return { event, data };
    });
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
  patchConfig(req: http.IncomingMessage | undefined, payload?: CodexStackConfigPatchRequest): Promise<CodexStackMutationResponse>;
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
    const openclawDefaultModel = readOpenclawDefaultModel(currentPaths.openclawJson);
    const openclawPreferredModels = readOpenclawPreferredModels(currentPaths.openclawJson);
    const context = readCodexContext(codex);
    const proxyPolicy = readProxyPolicy(cpa, currentPaths.openclawJson);
    const storedProfile = readJsonFile<Partial<CodexStackProfile>>(profilePath(), {});
    const hasExplicitProxyPolicy = proxyPolicy.cpaConfigProxyUrls.length > 0
      || Boolean(proxyPolicy.providerProxySource && !proxyPolicy.providerProxySource.startsWith("process.env."));
    const hasExplicitUpstreamPolicy = /(?:^|\n)\s*(?:upstream_base_url|upstream_api_key|openai-compatibility):/m.test(cpa);
    return {
      updatedAt: new Date().toISOString(),
      cpaPort: parseCpaPort(cpa, defaultCpaPort(resolveChannel())),
      compactPort: normalizePort(
        extractLocalCompactPortFromCodexConfig(codex),
        DEFAULT_COMPACT_PORT,
      ),
      defaultModel: chooseDefaultModel([...models, ...openclawPreferredModels], extractTomlString(codex, "model") || ccParsed.projects[0]?.agentOptions.model, openclawDefaultModel),
      contextMode: context.mode,
      contextWindowTokens: context.tokens,
      ccConnectProject: ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT,
      hasCpaProxyKey: Boolean(extractTomlString(codex, "experimental_bearer_token") || readCodexAuth(currentPaths.codexAuth).key),
      channel: "dmwork" as CodexStackChannel,
      ...storedProfile,
      upstreamOverride: {
        hasBaseUrl: hasExplicitUpstreamPolicy ? Boolean(proxyPolicy.upstreamBaseUrl) : Boolean(storedProfile.upstreamOverride?.hasBaseUrl),
        hasApiKey: hasExplicitUpstreamPolicy ? proxyPolicy.upstreamApiKeyConfigured : Boolean(storedProfile.upstreamOverride?.hasApiKey),
      },
      providerProxy: {
        mode: hasExplicitProxyPolicy ? proxyPolicy.providerMode : (storedProfile.providerProxy?.mode || proxyPolicy.providerMode),
        url: hasExplicitProxyPolicy ? proxyPolicy.providerProxyUrl : (storedProfile.providerProxy?.url || proxyPolicy.providerProxyUrl),
        source: hasExplicitProxyPolicy ? proxyPolicy.providerProxySource : (storedProfile.providerProxy?.source || proxyPolicy.providerProxySource),
      },
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
    return profile.channel || "dmwork";  // octo also valid; falls back to dmwork
  }

  function resolveInstallerSource(channel?: CodexStackChannel): CodexStackInstallerSource {
    const activeChannel = channel || resolveChannel();
    const pluginConfig = readStudioCodexStackConfig(config);
    const configured = normalizeString(pluginConfig.installerPath);
    const candidates: Array<{ kind: CodexStackInstallerSource["kind"]; root: string }> = [];
    if (configured) candidates.push({ kind: "configured", root: configured });

    const subDir = "codex-docs";
    candidates.push({ kind: "bundled", root: path.join(config.projectRoot, "resources", "codex-stack", subDir) });
    candidates.push({ kind: "development-fallback", root: path.join(config.openclawRoot, "codex-docs") });

    const required = [
      "resources/scripts/auto-setup.sh",
      "resources/scripts/health-check.sh",
      "resources/scripts/finish-cc-connect-setup.sh",
      "resources/bin/cli-proxy-api",
      "resources/cpa-config-templates/compact-proxy.mjs",
    ];

    for (const candidate of candidates) {
      const missing = required.filter((relative) => !pathExists(path.join(candidate.root, relative)));
      if (missing.length === 0) {
        const scriptsDir = path.join(candidate.root, "resources", "scripts");
        const cpaBinary = path.join(candidate.root, "resources", "bin", "cli-proxy-api");
        return {
          channel: activeChannel,
          kind: candidate.kind,
          root: candidate.root,
          version: readText(path.join(candidate.root, "VERSION")).trim() || null,
          cpaVersion: pathExists(cpaBinary) ? CPA_LATEST_VERSION : null,
          cpaLatestVersion: CPA_LATEST_VERSION,
          ccConnectSource: pathExists(paths().ccConnectSource) ? paths().ccConnectSource : null,
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
      cpaVersion: null,
      cpaLatestVersion: CPA_LATEST_VERSION,
      ccConnectSource: pathExists(paths().ccConnectSource) ? paths().ccConnectSource : null,
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

  async function postSmokeJson(label: string, url: string, token: string, body: unknown): Promise<unknown> {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }, 20_000);
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${label} failed with HTTP ${response.status}: ${text.slice(0, 800)}`);
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      if (isRecord(parsed) && isRecord(parsed.error)) {
        throw new Error(`${label} returned error: ${JSON.stringify(parsed.error).slice(0, 800)}`);
      }
      return parsed;
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`${label} returned invalid JSON: ${text.slice(0, 800)}`);
      throw error;
    }
  }

  function smokeChecks(ports: { cpa: number; compact: number }, token: string, model: string): Array<{
    id: CodexStackSmokeCheckId;
    label: string;
    run: () => Promise<void>;
  }> {
    const cpaBase = `http://127.0.0.1:${ports.cpa}`;
    const compactBase = `http://127.0.0.1:${ports.compact}`;
    return [
      {
        id: "cpa-health",
        label: "CPA health",
        run: async () => {
        if (!await probeUrl(`${cpaBase}/healthz`)) throw new Error("CPA /healthz is not reachable");
        },
      },
      {
        id: "compact-health",
        label: "Compact health",
        run: async () => {
        if (!await probeUrl(`${compactBase}/healthz`)) throw new Error("Compact /healthz is not reachable");
        },
      },
      {
        id: "cpa-chat",
        label: "CPA chat",
        run: async () => {
        await postSmokeJson("CPA chat", `${cpaBase}/v1/chat/completions`, token, {
          model,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 8,
          stream: false,
        });
        },
      },
      {
        id: "compact-non-stream",
        label: "Compact responses non-stream",
        run: async () => {
        const payload = await postSmokeJson("Compact responses non-stream", `${compactBase}/v1/responses`, token, {
          model,
          input: "ping",
          max_output_tokens: 8,
          stream: false,
        });
        if (!isRecord(payload) || payload.status === "failed") {
          throw new Error(`Compact non-stream returned failed response: ${JSON.stringify(payload).slice(0, 800)}`);
        }
        },
      },
      {
        id: "compact-stream",
        label: "Compact responses stream",
        run: async () => {
        const response = await fetchWithTimeout(`${compactBase}/v1/responses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            model,
            input: "ping",
            max_output_tokens: 8,
            stream: true,
          }),
        }, 30_000);
        const text = await response.text();
        if (!response.ok) throw new Error(`Compact stream failed with HTTP ${response.status}: ${text.slice(0, 800)}`);
        const events = parseSseEvents(text);
        const failed = events.find((event) => event.event === "response.failed");
        if (failed) throw new Error(`Compact stream emitted response.failed: ${failed.data.slice(0, 800)}`);
        if (!events.some((event) => event.event === "response.completed")) {
          throw new Error(`Compact stream did not emit response.completed: ${text.slice(0, 800)}`);
        }
        if (events.at(-1)?.data !== "[DONE]") throw new Error("Compact stream did not finish with [DONE]");
        },
      },
      {
        id: "compact-compact",
        label: "Compact compaction",
        run: async () => {
        const sentinel = compactSmokeSentinel(model);
        const payload = await postSmokeJson("Compact compaction", `${compactBase}/v1/responses/compact`, token, {
          model,
          input: buildCompactSmokeInput(model),
          thread_id: "studio-smoke",
        });
        if (!isRecord(payload) || payload.status === "failed") {
          throw new Error(`Compact compaction returned failed response: ${JSON.stringify(payload).slice(0, 800)}`);
        }
        const outputText = extractResponseOutputText(payload);
        if (!outputText.trim()) {
          throw new Error("Compact compaction returned an empty summary");
        }
        if (!outputText.includes(sentinel)) {
          throw new Error(`Compact compaction did not preserve sentinel ${sentinel}`);
        }
        },
      },
    ];
  }

  function compactSmokeSentinel(model: string): string {
    return `studio-compact-smoke-${model}`;
  }

  function extractResponseOutputText(payload: unknown): string {
    if (!isRecord(payload)) return "";
    const output = Array.isArray(payload.output) ? payload.output : [];
    const chunks: string[] = [];
    for (const item of output) {
      if (!isRecord(item)) continue;
      const content = Array.isArray(item.content) ? item.content : [];
      for (const part of content) {
        if (!isRecord(part)) continue;
        const text = typeof part.text === "string" ? part.text : "";
        if (text) chunks.push(text);
      }
    }
    return chunks.join("\n");
  }

  function buildCompactSmokeInput(model: string): Array<{ role: string; content: string }> {
    const sentinel = compactSmokeSentinel(model);
    return [
      {
        role: "system",
        content: "Compress this Codex CLI conversation into durable project state. Preserve model, routing, and failure markers.",
      },
      {
        role: "user",
        content: [
          `Model under test: ${model}.`,
          "CPA routes OpenAI-compatible requests.",
          "Compact adapts /v1/responses and /v1/responses/compact for Codex.",
          "watchdog must not restart a deliberately paused stack.",
        ].join(" "),
      },
      {
        role: "assistant",
        content: "Noted: preserve direct domestic gateway routing, proxy policy, context-window settings, and active job lock state.",
      },
      {
        role: "user",
        content: `Summarize the stable facts and include sentinel ${sentinel}.`,
      },
    ];
  }

  async function runSmokeChecksForModel(
    job: CodexStackJob,
    ports: { cpa: number; compact: number },
    token: string,
    model: string,
  ): Promise<CodexStackSmokeModelResult> {
    const modelStartedMs = Date.now();
    const startedAt = new Date().toISOString();
    const checks: CodexStackSmokeCheckResult[] = [];
    const errors: string[] = [];

    for (const check of smokeChecks(ports, token, model)) {
      const checkStartedMs = Date.now();
      const checkStartedAt = new Date().toISOString();
      appendJobLog(job, `Smoke gate (${model}): ${check.label}...\n`, [token]);
      try {
        await check.run();
        const checkFinishedMs = Date.now();
        checks.push({
          id: check.id,
          label: check.label,
          status: "passed",
          startedAt: checkStartedAt,
          finishedAt: new Date(checkFinishedMs).toISOString(),
          durationMs: Math.max(0, checkFinishedMs - checkStartedMs),
          error: null,
        });
        appendJobLog(job, `Smoke gate (${model}): ${check.label} passed.\n`, [token]);
      } catch (error) {
        const checkFinishedMs = Date.now();
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${check.label}: ${message}`);
        checks.push({
          id: check.id,
          label: check.label,
          status: "failed",
          startedAt: checkStartedAt,
          finishedAt: new Date(checkFinishedMs).toISOString(),
          durationMs: Math.max(0, checkFinishedMs - checkStartedMs),
          error: message,
        });
        appendJobLog(job, `Smoke gate (${model}): ${check.label} failed: ${message}\n`, [token]);
      }
    }

    const modelFinishedMs = Date.now();
    if (errors.length) {
      return {
        model,
        status: "failed",
        startedAt,
        finishedAt: new Date(modelFinishedMs).toISOString(),
        durationMs: Math.max(0, modelFinishedMs - modelStartedMs),
        checks,
        error: errors.join("; "),
      };
    }

    return {
      model,
      status: "passed",
      startedAt,
      finishedAt: new Date(modelFinishedMs).toISOString(),
      durationMs: Math.max(0, modelFinishedMs - modelStartedMs),
      checks,
      error: null,
    };
  }

  function chooseCpaAttachModel(currentModel: unknown, profileDefault: unknown, openclawDefault: unknown = ""): string {
    return normalizeString(profileDefault) || normalizeString(currentModel) || normalizeString(openclawDefault);
  }

  function requireCpaTargetModel(model: string): string {
    const target = normalizeString(model);
    if (target) return target;
    throw new CodexStackServiceError(
      "codex_stack_target_model_required",
      "请先在运行配置里选择 CPA 目标模型。Studio 不再把历史默认模型当作所有机器的必测兜底模型。",
      400,
    );
  }

  async function runCodexCpaSmokeMatrix(
    job: CodexStackJob,
    ports: { cpa: number; compact: number },
    token: string,
    models: string[],
  ): Promise<CodexStackSmokeMatrixResult> {
    const matrixStartedMs = Date.now();
    const fallbackModel = readOpenclawDefaultModel(paths().openclawJson) || readOpenclawPreferredModels(paths().openclawJson)[0] || "";
    const requiredModels = Array.from(new Set(models.map((model) => model.trim()).filter(Boolean)));
    if (!requiredModels.length) requiredModels.push(fallbackModel);
    if (!requiredModels.some(Boolean)) {
      throw new CodexStackServiceError(
        "codex_stack_target_model_required",
        "请先在运行配置里选择 CPA 目标模型，再运行 smoke matrix。",
        400,
      );
    }
    appendJobLog(job, `Smoke matrix: validating ${requiredModels.join(", ")} without switching Codex.\n`, [token]);
    const results: CodexStackSmokeModelResult[] = [];
    for (const model of requiredModels) {
      results.push(await runSmokeChecksForModel(job, ports, token, model));
    }
    const matrixFinishedMs = Date.now();
    const status = results.every((result) => result.status === "passed") ? "passed" : "failed";
    const matrix: CodexStackSmokeMatrixResult = {
      status,
      checkedAt: new Date(matrixFinishedMs).toISOString(),
      durationMs: Math.max(0, matrixFinishedMs - matrixStartedMs),
      requiredModels,
      models: results,
      attachEligible: status === "passed",
    };
    const profile = readProfile();
    writeProfile({ ...profile, lastSmokeMatrix: matrix });
    appendJobLog(job, `Smoke matrix ${status}; attachEligible=${matrix.attachEligible ? "true" : "false"}.\n`, [token]);
    return matrix;
  }

  async function runCodexStudioSmokeGate(job: CodexStackJob, model: string): Promise<void> {
    const baseUrl = `http://${MODEL_GATEWAY_DEFAULT_HOST}:${MODEL_GATEWAY_DEFAULT_PORT}`;
    appendJobLog(job, `Running Studio Model Gateway smoke at ${baseUrl} using ${model}.\n`);

    const statusResponse = await fetchWithTimeout(`${baseUrl}/gateway/status`, {
      method: "GET",
      headers: { "Accept": "application/json" },
    }, 10_000);
    const statusText = await statusResponse.text();
    if (!statusResponse.ok) {
      throw new Error(`Studio gateway status failed with HTTP ${statusResponse.status}: ${statusText.slice(0, 800)}`);
    }
    let status: unknown;
    try {
      status = JSON.parse(statusText) as unknown;
    } catch {
      throw new Error(`Studio gateway status returned invalid JSON: ${statusText.slice(0, 800)}`);
    }
    if (!isRecord(status) || !isRecord(status.lifecycle) || !isRecord(status.lifecycle.localDaemon)) {
      throw new Error(`Studio gateway status did not include localDaemon lifecycle: ${JSON.stringify(status).slice(0, 800)}`);
    }
    if (status.lifecycle.localDaemon.runtimeMode !== "local-daemon") {
      throw new Error(`Studio gateway localDaemon is not active: ${JSON.stringify(status.lifecycle.localDaemon).slice(0, 800)}`);
    }

    const response = await postSmokeJson("Studio gateway responses", `${baseUrl}/v1/responses`, "", {
      model,
      input: "ping",
      max_output_tokens: 8,
      stream: false,
    });
    if (!isRecord(response) || response.status === "failed") {
      throw new Error(`Studio gateway responses smoke returned failed response: ${JSON.stringify(response).slice(0, 800)}`);
    }

    const sentinel = compactSmokeSentinel(model);
    const compact = await postSmokeJson("Studio gateway compact", `${baseUrl}/v1/responses/compact`, "", {
      model,
      input: buildCompactSmokeInput(model),
      thread_id: "studio-gateway-smoke",
    });
    if (!isRecord(compact) || compact.status === "failed") {
      throw new Error(`Studio gateway compact smoke returned failed response: ${JSON.stringify(compact).slice(0, 800)}`);
    }
    const outputText = extractResponseOutputText(compact);
    if (!outputText.trim()) {
      throw new Error("Studio gateway compact smoke returned an empty summary");
    }
    if (!outputText.includes(sentinel)) {
      throw new Error(`Studio gateway compact smoke did not preserve sentinel ${sentinel}`);
    }

    appendJobLog(job, "Studio Model Gateway smoke gate passed.\n");
  }

  function recoverJobs(): void {
    ensureDir(jobsDir());
    for (const entry of fs.readdirSync(jobsDir()).filter((name) => name.endsWith(".json"))) {
      const filePath = path.join(jobsDir(), entry);
      const job = readJsonFile<CodexStackJob | null>(filePath, null);
      if (!job || (job.status !== "queued" && job.status !== "running")) continue;
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
      enabled: enabled.ok && systemctlOutputHasState(enabled.output, "enabled"),
      active: active.ok && systemctlOutputHasState(active.output, "active"),
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
    codexAuthOk: boolean;
    codexCpaActive: boolean;
    gateway: CodexStackSummaryPayload["gateway"];
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
        status: params.codexVersion && codexConfigExists
          ? (!params.codexCpaActive || params.codexAuthOk ? "ok" : "degraded")
          : "missing",
        installed: Boolean(params.codexVersion),
        version: params.codexVersion,
        notes: [
          params.omxVersion ? `omx ${params.omxVersion}` : "omx not detected",
          params.codexCpaActive
            ? (params.codexAuthOk ? "auth.json ok" : "auth.json missing or mismatched")
            : "official provider active; CPA auth checked before attach",
        ].filter(Boolean),
        paths: { config: currentPaths.codexConfig, auth: currentPaths.codexAuth },
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
        notes: params.compactHealthy ? ["healthz ok"] : ["healthz not reachable"],
        paths: { script: currentPaths.compactProxy },
      },
      {
        id: "agent-gateway",
        label: "Studio Agent Gateway",
        status: pathExists(currentPaths.compactProxy) && serviceById.get("cpa-compact-proxy.service")?.active && params.gateway.live ? "ok" : "degraded",
        installed: pathExists(currentPaths.compactProxy),
        version: params.gateway.serviceName,
        notes: [
          params.gateway.protocols.openaiChatCompletions ? "OpenAI Chat" : "",
          params.gateway.protocols.openaiResponses ? "OpenAI Responses" : "",
          params.gateway.protocols.openaiResponsesCompact ? "Responses compact" : "",
          params.gateway.protocols.anthropicMessages ? "Claude Messages" : "",
        ].filter(Boolean),
        paths: { status: params.gateway.statusEndpoint, script: currentPaths.compactProxy },
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
        label: "Background Watchdog",
        status: serviceById.get("codex-stack-watchdog.timer")?.active ? "ok" : "degraded",
        installed: serviceById.get("codex-stack-watchdog.timer")?.installed === true,
        version: null,
        notes: serviceById.get("codex-stack-watchdog.timer")?.active
          ? ["managed after CPA and Compact are healthy"]
          : ["use Resume CPA Stack or Recommended Repair; do not start directly"],
        paths: { unit: "codex-stack-watchdog.timer" },
      },
    ];
  }

  function gatewayChannelTemplates(projectName = DEFAULT_CC_CONNECT_PROJECT): CodexStackSummaryPayload["gateway"]["channelTemplates"] {
    return [
      {
        id: "dmwork",
        label: "DMWork",
        setupCommand: null,
        requiredOptions: ["bot_token", "api_url", "account_id"],
        optionalOptions: ["route_tag"],
      },
      {
        id: "octo",
        label: "Octo",
        setupCommand: null,
        requiredOptions: ["bot_token", "api_url", "account_id"],
        optionalOptions: ["route_tag"],
      },
      {
        id: "feishu",
        label: "Feishu",
        setupCommand: `cc-connect feishu setup --project ${projectName}`,
        requiredOptions: ["app_id", "app_secret"],
        optionalOptions: ["verification_token", "encrypt_key"],
      },
      {
        id: "weixin",
        label: "Weixin",
        setupCommand: `cc-connect weixin setup --project ${projectName}`,
        requiredOptions: ["app_id"],
        optionalOptions: ["app_secret", "token", "base_url", "cdn_base_url"],
      },
      {
        id: "wecom",
        label: "WeCom",
        setupCommand: null,
        requiredOptions: ["corp_id", "agent_id", "secret"],
        optionalOptions: ["api_base_url", "token", "aes_key"],
      },
      {
        id: "telegram",
        label: "Telegram",
        setupCommand: null,
        requiredOptions: ["token"],
        optionalOptions: ["proxy_url", "allowed_chat_ids"],
      },
      {
        id: "bridge",
        label: "Bridge",
        setupCommand: null,
        requiredOptions: ["url"],
        optionalOptions: ["token", "headers"],
      },
    ];
  }

  function providerAgentProtocols(provider: CcConnectProvider): string[] {
    const agentTypes = (provider.agentTypes || []).map((item) => item.trim().toLowerCase()).filter(Boolean);
    if (!agentTypes.length) return ["openai-responses", "anthropic-messages"];
    const protocols = new Set<string>();
    if (agentTypes.some((item) => item === "codex" || item === "opencode" || item === "openai")) protocols.add("openai-responses");
    if (agentTypes.some((item) => item === "claudecode" || item === "claude" || item === "claude-code")) protocols.add("anthropic-messages");
    if (!protocols.size) protocols.add("openai-responses");
    return [...protocols];
  }

  function listCcConnectSourceDirs(relative: "agent" | "platform"): string[] {
    const root = path.join(paths().ccConnectSource, relative);
    try {
      return fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  function buildGatewaySummary(
    compactPort: number,
    live: boolean,
    ccParsed: CcConnectConfig,
    discoveredModels: string[],
  ): CodexStackSummaryPayload["gateway"] {
    const baseUrl = `http://127.0.0.1:${compactPort}`;
    const projectName = ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT;
    const channelTemplates = gatewayChannelTemplates(projectName);
    const ccConnectSourcePath = paths().ccConnectSource;
    const ccConnectSourceAgentTypes = listCcConnectSourceDirs("agent");
    const ccConnectSourcePlatforms = listCcConnectSourceDirs("platform");
    const ccConnectSourceReady = pathExists(ccConnectSourcePath)
      && ccConnectSourceAgentTypes.includes("codex")
      && ccConnectSourceAgentTypes.includes("claudecode");
    const fallbackProvider: CcConnectProvider = {
      name: "studio-gateway",
      apiKey: "",
      baseUrl: `${baseUrl}/v1`,
      codexEnvKey: "OPENAI_API_KEY",
      model: discoveredModels[0] || "",
      models: discoveredModels.map((model) => ({ model })),
      agentTypes: ["codex", "claudecode"],
      endpoints: { codex: `${baseUrl}/v1`, claudecode: baseUrl },
      agentModels: {},
      codex: { envKey: "OPENAI_API_KEY", wireApi: "responses", httpHeaders: {} },
    };
    const routeProviders = ccParsed.providers.length ? ccParsed.providers : [fallbackProvider];
    const providerRoutes = routeProviders.map((provider) => {
      const agentTypes = (provider.agentTypes || []).filter(Boolean);
      const providerModels = (provider.models || []).filter((model) => model.model);
      const model = provider.model
        || provider.agentModels?.codex
        || provider.agentModels?.claudecode
        || providerModels[0]?.model
        || discoveredModels[0]
        || "";
      const protocols = providerAgentProtocols(provider);
      return {
        id: provider.name || "provider",
        label: provider.name || "provider",
        baseUrl: provider.endpoints?.codex || provider.baseUrl || `${baseUrl}/v1`,
        model,
        protocol: protocols.join(" + "),
        source: ccParsed.providers.length ? "cc-connect" as const : "gateway-default" as const,
        agentTypes: agentTypes.length ? agentTypes : ["codex", "claudecode"],
        modelCount: providerModels.length || (model ? 1 : 0),
        channelCount: ccParsed.projects.filter((project) => (
          !project.providerRefs?.length || project.providerRefs.includes(provider.name)
        )).reduce((total, project) => total + (project.platforms?.length || 0), 0),
        codexWireApi: provider.codex?.wireApi || null,
      };
    });
    const modelRoutes = routeProviders.flatMap((provider) => {
      const explicitModels = (provider.models || []).filter((model) => model.model);
      const models = explicitModels.length
        ? explicitModels
        : (provider.model ? [{ model: provider.model }] : discoveredModels.map((model) => ({ model })));
      return models.map((model) => ({
        id: `${provider.name || "provider"}:${model.model}`,
        label: model.model,
        provider: provider.name || "provider",
        protocol: providerAgentProtocols(provider).join(" + "),
        alias: model.alias || null,
      }));
    });
    return {
      serviceName: "studio-agent-gateway",
      baseUrl,
      statusEndpoint: `${baseUrl}/gateway/status`,
      live,
      protocols: {
        openaiChatCompletions: true,
        openaiResponses: true,
        openaiResponsesCompact: true,
        anthropicMessages: true,
        anthropicMessagesStreaming: true,
      },
      protocolCatalog: [
        {
          id: "openai-chat-completions",
          label: "OpenAI Chat Completions",
          endpoint: "/v1/chat/completions",
          upstream: "CPA /v1/chat/completions",
          adapter: "passthrough",
          streaming: true,
          clients: ["cc-connect", "OpenAI SDK"],
        },
        {
          id: "openai-responses",
          label: "OpenAI Responses",
          endpoint: "/v1/responses",
          upstream: "OpenAI Chat Completions",
          adapter: "chat-adapter",
          streaming: true,
          clients: ["Codex CLI"],
        },
        {
          id: "openai-responses-compact",
          label: "Responses Compact",
          endpoint: "/v1/responses/compact",
          upstream: "OpenAI Chat Completions",
          adapter: "local-compact",
          streaming: false,
          clients: ["Codex CLI compaction"],
        },
        {
          id: "anthropic-messages",
          label: "Claude Messages",
          endpoint: "/v1/messages",
          upstream: "OpenAI Chat Completions",
          adapter: "chat-adapter",
          streaming: true,
          clients: ["Claude CLI", "Claude Code"],
        },
      ],
      clientAdapters: [
        {
          id: "codex-cli",
          label: "Codex CLI",
          protocol: "openai-responses",
          baseUrl: `${baseUrl}/v1`,
          authEnv: "OPENAI_API_KEY",
          modelEnv: "CODEX_MODEL",
          notes: ["wire_api=responses", "supports_websockets=false"],
        },
        {
          id: "claude-cli",
          label: "Claude CLI",
          protocol: "anthropic-messages",
          baseUrl,
          authEnv: "ANTHROPIC_AUTH_TOKEN",
          modelEnv: "ANTHROPIC_MODEL",
          notes: ["uses /v1/messages", "streams Anthropic SSE events"],
        },
        {
          id: "cc-connect",
          label: "cc-connect",
          protocol: "provider-router",
          baseUrl: `${baseUrl}/v1`,
          authEnv: "OPENAI_API_KEY",
          modelEnv: "project.agent.options.model",
          notes: ["supports provider refs", "supports multi-platform projects"],
        },
      ],
      providerRoutes,
      modelRoutes,
      channelTemplates,
      integrations: {
        codexCliBaseUrl: `${baseUrl}/v1`,
        claudeCliBaseUrl: baseUrl,
        ccConnectProviderBaseUrl: `${baseUrl}/v1`,
        ccConnectSourcePath: ccConnectSourceReady ? ccConnectSourcePath : (pathExists(ccConnectSourcePath) ? ccConnectSourcePath : null),
        ccConnectSourceReady,
        ccConnectSourceAgentTypes,
        ccConnectSourcePlatforms,
        channelSurfaces: channelTemplates.map((channel) => channel.id),
      },
    };
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

  function buildRecommendation(params: {
    overallStatus: CodexStackStatus;
    warnings: string[];
    profile: CodexStackProfile;
    proxyPolicy: CodexStackSummaryPayload["proxyPolicy"];
    targetModel: string;
  }): CodexStackSummaryPayload["recommendation"] {
    const warningReasons = params.warnings.map((warning) => {
      if (warning.includes("国内网关不会继承系统代理")) return "system-proxy-direct-provider";
      if (warning.includes("NO_PROXY")) return "no-proxy-loopback-missing";
      if (warning.includes("smoke matrix failed")) return "smoke-matrix-failed";
      if (warning.includes("smoke matrix is older")) return "smoke-matrix-stale";
      if (warning.includes("does not cover selected target model")) return "smoke-matrix-target-mismatch";
      if (warning.includes("smoke matrix is incomplete")) return "smoke-matrix-incomplete";
      if (warning.includes("WebSocket")) return "codex-websocket-transport";
      if (warning.includes("request compression")) return "codex-request-compression";
      if (warning.includes("auth.json")) return "codex-auth-mismatch";
      if (warning.includes("cc-connect")) return "cc-connect-binding";
      return "warning";
    });
    const baseReasons = Array.from(new Set([params.overallStatus, ...warningReasons]));
    if (params.overallStatus === "running-action") {
      return {
        kind: "watch-job",
        severity: "info",
        section: "logs",
        primaryAction: "open-logs",
        requiresManagement: false,
        reasonCodes: baseReasons,
      };
    }
    if (params.overallStatus === "needs-setup") {
      return {
        kind: "install",
        severity: "warning",
        section: "install",
        primaryAction: "open-install",
        requiresManagement: false,
        reasonCodes: baseReasons,
      };
    }
    if (params.overallStatus === "binding-required") {
      return {
        kind: "bind-cc-connect",
        severity: "warning",
        section: "cc-connect",
        primaryAction: "open-cc-connect",
        requiresManagement: false,
        reasonCodes: baseReasons,
      };
    }
    if (params.overallStatus === "degraded" || params.overallStatus === "failed") {
      return {
        kind: "repair",
        severity: params.overallStatus === "failed" ? "danger" : "warning",
        section: "dashboard",
        primaryAction: "repair-recommended",
        requiresManagement: true,
        reasonCodes: baseReasons,
      };
    }
    if (!params.proxyPolicy.noProxyLoopbackReady) {
      return {
        kind: "review-proxy",
        severity: "warning",
        section: "settings",
        primaryAction: "open-settings",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([...baseReasons, "no-proxy-loopback-missing"])),
      };
    }
    if (!normalizeString(params.targetModel)) {
      return {
        kind: "review-smoke",
        severity: "warning",
        section: "settings",
        primaryAction: "open-settings",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([...baseReasons, "target-model-missing"])),
      };
    }
    if (params.profile.lastSmokeMatrix?.status === "failed") {
      return {
        kind: "review-smoke",
        severity: "warning",
        section: "install",
        primaryAction: "open-install",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([...baseReasons, "smoke-matrix-failed"])),
      };
    }
    if (isSmokeMatrixStale(params.profile.lastSmokeMatrix)) {
      return {
        kind: "review-smoke",
        severity: "warning",
        section: "install",
        primaryAction: "open-install",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([...baseReasons, "smoke-matrix-stale"])),
      };
    }
    if (
      params.profile.lastSmokeMatrix?.attachEligible
      && !isSmokeMatrixComplete(params.profile.lastSmokeMatrix, params.targetModel)
    ) {
      return {
        kind: "review-smoke",
        severity: "warning",
        section: "install",
        primaryAction: "open-install",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([
          ...baseReasons,
          smokeMatrixCoversTarget(params.profile.lastSmokeMatrix, params.targetModel)
            ? "smoke-matrix-incomplete"
            : "smoke-matrix-target-mismatch",
        ])),
      };
    }
    if (params.proxyPolicy.providerMode === "direct" && params.proxyPolicy.providerProxyUrl) {
      return {
        kind: "review-proxy",
        severity: "warning",
        section: "settings",
        primaryAction: "open-settings",
        requiresManagement: false,
        reasonCodes: Array.from(new Set([...baseReasons, "system-proxy-direct-provider"])),
      };
    }
    return {
      kind: "run-check",
      severity: "success",
      section: "dashboard",
      primaryAction: "run-check",
      requiresManagement: false,
      reasonCodes: baseReasons,
    };
  }

  function buildRunReadiness(params: {
    services: CodexStackServiceStatus[];
    jobs: CodexStackJob[];
    cpaHealthy: boolean;
    compactHealthy: boolean;
    codexAuthMatches: boolean | null;
    codexCpaActive: boolean;
    proxyPolicy: CodexStackSummaryPayload["proxyPolicy"];
    profile: CodexStackProfile;
    context: ReturnType<typeof readCodexContext>;
    codexConfig: string;
    ccParsed: CcConnectConfig;
    ccBindingPresent: boolean;
    ccConnectInstalled: boolean;
    ccConnectConfigured: boolean;
    compactPort: number;
    targetModel: string;
  }): CodexStackSummaryPayload["runReadiness"] {
    const serviceById = new Map(params.services.map((service) => [service.id, service]));
    const cpaActive = serviceById.get("cli-proxy-api.service")?.active === true;
    const compactActive = serviceById.get("cpa-compact-proxy.service")?.active === true;
    const watchdogActive = serviceById.get("codex-stack-watchdog.timer")?.active === true;
    const ccConnectActive = serviceById.get("cc-connect.service")?.active === true;
    const expectedCcProviderBaseUrl = `http://127.0.0.1:${params.compactPort}/v1`;
    const cpaProvider = params.ccParsed.providers.find((provider) => provider.name === "cpa");
    const cpaProviderBaseOk = normalizeCcConnectBaseUrl(cpaProvider?.baseUrl || "") === expectedCcProviderBaseUrl;
    const cpaProviderEnvKey = cpaProvider?.codexEnvKey || cpaProvider?.codex?.envKey || "";
    const cpaProviderEnvOk = !cpaProviderEnvKey || cpaProviderEnvKey === "OPENAI_API_KEY";
    const smokeMatrix = params.profile.lastSmokeMatrix;
    const targetModel = normalizeString(params.targetModel);
    const smokeFresh = Boolean(targetModel) && isSmokeMatrixFreshAndComplete(smokeMatrix, targetModel);
    const smokeFailureDetail = targetModel
      ? smokeMatrixTargetMismatchDetail(smokeMatrix, targetModel) || smokeMatrixFailureDetail(smokeMatrix)
      : "尚未选择 CPA 目标模型；请先在运行配置中选择本机实际可用的模型。";
    const hasActiveJob = params.jobs.some((job) => job.status === "queued" || job.status === "running");
    const websocketEnabled = hasCodexResponsesWebSocketsEnabled(params.codexConfig);
    const compressionEnabled = hasCodexRequestCompressionEnabled(params.codexConfig);
    const codexAuthReady = params.codexAuthMatches === true;
    const ccAgentTaskReady = params.ccConnectInstalled
      && params.ccConnectConfigured
      && params.ccBindingPresent
      && ccConnectActive
      && cpaProviderBaseOk
      && cpaProviderEnvOk;
    const ccAgentDetail = (() => {
      if (ccAgentTaskReady) return "cc-connect 已安装、已绑定、服务 active，并且 cpa provider 指向本地 Compact。";
      if (!params.ccConnectInstalled) return "cc-connect 未安装；IM/CC Agent 任务不可用，可执行完整安装或在安装页启用 cc-connect。";
      if (!params.ccConnectConfigured) return "cc-connect 配置缺失；请在 Agent 面板生成 provider/project 配置。";
      if (!params.ccBindingPresent) return "cc-connect 尚未完成 Feishu/Weixin QR 绑定；绑定后再运行 finalizer。";
      if (!ccConnectActive) return "cc-connect.service 未 active；请按顺序恢复或重启 cc-connect。";
      if (!cpaProviderBaseOk) return `cc-connect cpa provider 未指向本地 Compact ${expectedCcProviderBaseUrl}，Agent 任务可能绕过已验证链路。`;
      return "cc-connect cpa provider 的 codex.env_key 不是 OPENAI_API_KEY，Codex Agent 可能拿不到本地 CPA key。";
    })();
    const checks: CodexStackRunReadinessCheck[] = [
      {
        id: "service-order",
        label: "CPA / Compact / watchdog",
        status: cpaActive && compactActive && watchdogActive ? "pass" : "fail",
        detail: cpaActive && compactActive && watchdogActive
          ? "CPA、Compact 与 watchdog 均处于 active，长任务不会从已知暂停态开始。"
          : "CPA、Compact 或 watchdog 未全部 active；请使用 Resume CPA Stack 按顺序恢复。",
        section: "dashboard",
        actionHint: cpaActive && compactActive && watchdogActive
          ? { kind: "run-check", label: "运行健康检查" }
          : { kind: "repair", label: "按顺序恢复 CPA 栈", repairActions: ["resume-stack"] },
      },
      {
        id: "local-compact",
        label: "本机 Compact 模型目录",
        status: params.cpaHealthy && params.compactHealthy ? "pass" : "fail",
        detail: params.cpaHealthy && params.compactHealthy
          ? "CPA healthz 与 Compact /v1/models 均可访问。"
          : "CPA healthz 或 Compact /v1/models 不可访问；普通请求、流式请求和模型选择都需要先修复。",
        section: "dashboard",
        actionHint: params.cpaHealthy && params.compactHealthy
          ? { kind: "open-section", label: "查看链路", section: "dashboard" }
          : { kind: "repair", label: "重启 CPA/Compact", repairActions: ["restart-cpa", "restart-compact-proxy"] },
      },
      {
        id: "codex-provider",
        label: "Codex active provider",
        status: params.codexCpaActive ? "pass" : "warn",
        detail: params.codexCpaActive
          ? "Codex 当前 active provider 指向本地 Compact/CPA 链路。"
          : "Codex 当前保持官方 GPT 路径；通过 Studio Gateway smoke gate 后才会切换到自建 daemon。",
        section: params.codexCpaActive ? "settings" : "install",
        actionHint: params.codexCpaActive
          ? { kind: "open-section", label: "查看配置", section: "settings" }
          : { kind: "repair", label: "接管 Studio Gateway", repairActions: ["apply-codex-studio-after-smoke"] },
      },
      {
        id: "codex-auth",
        label: "Codex CLI 密钥",
        status: codexAuthReady ? "pass" : (params.codexCpaActive ? "fail" : "warn"),
        detail: codexAuthReady
          ? "~/.codex/auth.json 与 CPA proxy key 匹配。"
          : params.codexCpaActive
            ? "~/.codex/auth.json 未写入或与 CPA proxy key 不一致；Codex CLI 可能绕过本地 Compact。"
            : "当前 Codex 未接入 Studio Gateway；接管动作会在 daemon 和 smoke gate 通过后再写入本地 provider。",
        section: "settings",
        actionHint: codexAuthReady
          ? { kind: "open-section", label: "查看配置", section: "settings" }
          : params.codexCpaActive
            ? { kind: "repair", label: "修复 Codex auth", repairActions: ["repair-auth-json"] }
            : { kind: "repair", label: "接管 Studio Gateway", repairActions: ["apply-codex-studio-after-smoke"] },
      },
      {
        id: "proxy-loopback",
        label: "NO_PROXY loopback",
        status: params.proxyPolicy.noProxyLoopbackReady ? "pass" : "fail",
        detail: params.proxyPolicy.noProxyLoopbackReady
          ? "localhost、127.0.0.1 与 ::1 已绕过系统代理。"
          : `NO_PROXY 缺少 ${params.proxyPolicy.noProxyLoopbackMissing.join(", ")}；VPN 网卡/TUN 模式可能截获本机 CPA/Compact 请求。`,
        section: "settings",
        actionHint: params.proxyPolicy.noProxyLoopbackReady
          ? { kind: "open-section", label: "查看网络策略", section: "settings" }
          : { kind: "repair", label: "修复 NO_PROXY", repairActions: ["repair-no-proxy-loopback"] },
      },
      {
        id: "codex-transport",
        label: "Codex 请求格式",
        status: websocketEnabled || compressionEnabled ? "fail" : "pass",
        detail: websocketEnabled || compressionEnabled
          ? "Codex WebSocket 或 request compression 仍启用；第三方兼容端点经 Compact 转发时应使用 HTTP/SSE 且禁用压缩请求体。"
          : "Codex 传输保持 HTTP/SSE，未启用压缩请求体。",
        section: "settings",
        actionHint: websocketEnabled || compressionEnabled
          ? { kind: "repair", label: "修复 Codex 传输", repairActions: ["repair-codex-transport"] }
          : { kind: "open-section", label: "查看配置", section: "settings" },
      },
      {
        id: "smoke-matrix",
        label: "目标模型 smoke",
        status: smokeFresh ? "pass" : "warn",
        detail: smokeFresh
          ? "最近一次目标模型 smoke matrix 通过，允许接管 Studio Gateway。"
          : smokeFailureDetail || "尚无 24 小时内通过的目标模型 smoke matrix；切换 Codex 前必须重新验证。",
        section: "install",
        actionHint: smokeFresh
          ? { kind: "open-section", label: "查看 smoke gate", section: "install" }
          : { kind: "repair", label: "运行 smoke matrix", repairActions: ["run-smoke-matrix"] },
      },
      {
        id: "cc-agent-route",
        label: "cc-connect Agent 链路",
        status: ccAgentTaskReady ? "pass" : "warn",
        detail: ccAgentDetail,
        section: "cc-connect",
        actionHint: ccAgentTaskReady
          ? { kind: "open-section", label: "查看 Agent 配置", section: "cc-connect" }
          : !params.ccConnectInstalled
            ? { kind: "open-section", label: "安装 cc-connect", section: "install" }
            : !ccConnectActive && params.ccBindingPresent
              ? { kind: "repair", label: "重启 cc-connect", repairActions: ["restart-cc-connect"] }
              : { kind: "open-section", label: "修复 Agent 配置", section: "cc-connect" },
      },
      {
        id: "context-window",
        label: "上下文与压缩",
        status: params.context.tokens && params.context.tokens < DEFAULT_CONTEXT_TOKENS ? "warn" : "pass",
        detail: params.context.tokens && params.context.tokens < DEFAULT_CONTEXT_TOKENS
          ? `当前上下文窗口 ${params.context.tokens} tokens 偏小，长任务和压缩上下文前建议调高。`
          : `当前上下文策略 ${params.context.mode}，推荐窗口 ${DEFAULT_CONTEXT_TOKENS} tokens。`,
        section: "settings",
        actionHint: { kind: "open-section", label: "编辑上下文", section: "settings" },
      },
      {
        id: "job-lock",
        label: "后台任务锁",
        status: hasActiveJob ? "warn" : "pass",
        detail: hasActiveJob
          ? "安装/修复任务仍在运行；先等待结束再判断 Codex 对话和长任务稳定性。"
          : "没有正在运行的安装/修复任务。",
        section: "logs",
        actionHint: { kind: "open-section", label: hasActiveJob ? "查看任务日志" : "查看日志", section: "logs" },
      },
    ];
    const hasFail = checks.some((check) => check.status === "fail");
    const hasWarn = checks.some((check) => check.status === "warn");
    const level = hasFail ? "blocked" : hasWarn ? "attention" : "ready";
    const baseChecksReady = !hasFail;
    const codexAttachedReady = params.codexCpaActive && codexAuthReady;
    const chatReady = baseChecksReady && codexAttachedReady && smokeFresh;
    const longTaskReady = chatReady && !hasActiveJob && params.context.tokens !== null && params.context.tokens >= DEFAULT_CONTEXT_TOKENS;
    const compactionReady = chatReady && !compressionEnabled && params.context.mode !== "default";
    const chatBlockedDetail = !params.codexCpaActive
      ? "当前 Codex 保持官方 GPT 路径；通过 Studio Gateway smoke gate 后再运行本地 daemon 对话。"
      : !codexAuthReady
        ? "先修复 Codex auth，确保 CLI 使用本地 CPA proxy key。"
        : baseChecksReady
          ? "先重新运行目标 CPA 模型 smoke matrix，确认 CPA 普通和流式链路仍新鲜可用。"
          : "先修复失败检查项。";
    const ccAgentModeReady = ccAgentTaskReady && chatReady;
    const firstFailedCheck = checks.find((check) => check.status === "fail");
    const chatActionHint = !params.codexCpaActive
      ? { kind: "repair" as const, label: "接管 Studio Gateway", repairActions: ["apply-codex-studio-after-smoke" as const] }
      : !codexAuthReady
        ? { kind: "repair" as const, label: "修复 Codex auth", repairActions: ["repair-auth-json" as const] }
        : firstFailedCheck?.actionHint || (!smokeFresh
          ? { kind: "repair" as const, label: "运行 smoke matrix", repairActions: ["run-smoke-matrix" as const] }
          : { kind: "run-check" as const, label: "运行健康检查" });
    const longTaskActionHint = chatReady
      ? hasActiveJob
        ? { kind: "open-section" as const, label: "查看任务日志", section: "logs" as const }
        : params.context.tokens === null || params.context.tokens < DEFAULT_CONTEXT_TOKENS
          ? { kind: "open-section" as const, label: "编辑上下文", section: "settings" as const }
          : { kind: "run-check" as const, label: "运行健康检查" }
      : chatActionHint;
    const compactionActionHint = chatReady
      ? compressionEnabled
        ? { kind: "repair" as const, label: "修复 Codex 传输", repairActions: ["repair-codex-transport" as const] }
        : params.context.mode === "default"
          ? { kind: "open-section" as const, label: "编辑上下文", section: "settings" as const }
          : { kind: "run-check" as const, label: "运行健康检查" }
      : chatActionHint;
    const ccAgentActionHint = ccAgentTaskReady ? chatActionHint : checks.find((check) => check.id === "cc-agent-route")?.actionHint || chatActionHint;
    const dependencyFor = (id: string) => {
      const check = checks.find((item) => item.id === id);
      return check ? { checkId: check.id, label: check.label, status: check.status } : null;
    };
    const dependenciesFor = (ids: string[]) => ids
      .map((id) => dependencyFor(id))
      .filter((item): item is NonNullable<ReturnType<typeof dependencyFor>> => Boolean(item));
    const baseModeDependencies = [
      "service-order",
      "local-compact",
      "codex-provider",
      "codex-auth",
      "proxy-loopback",
      "codex-transport",
      "smoke-matrix",
    ];
    return {
      level,
      title: level === "ready"
        ? "Codex CPA 链路可运行"
        : level === "attention"
          ? "Codex CPA 链路需要复验"
          : "Codex CPA 链路暂不应接入",
      summary: level === "ready"
        ? "普通请求、流式请求、长任务和压缩上下文具备同一套已验证前置条件。"
        : level === "attention"
          ? "基础链路可用，但 smoke、上下文或后台任务状态需要处理后再执行长任务。"
          : "存在会影响 Codex CLI、Compact 转发或 loopback 访问的阻断项，保持官方 Codex 路径直到修复。",
      checks,
      modes: [
        {
          id: "chat",
          label: "普通/流式对话",
          ready: chatReady,
          detail: chatReady ? "基础 CPA/Compact 请求链路可用。" : chatBlockedDetail,
          actionHint: chatReady ? { kind: "run-check", label: "运行健康检查" } : chatActionHint,
          dependencies: dependenciesFor(baseModeDependencies),
        },
        {
          id: "long-task",
          label: "长任务",
          ready: longTaskReady,
          detail: longTaskReady ? "无后台安装锁且上下文窗口足够。" : "需要新鲜 smoke、无后台任务并保持足够上下文窗口。",
          actionHint: longTaskActionHint,
          dependencies: dependenciesFor([...baseModeDependencies, "context-window", "job-lock"]),
        },
        {
          id: "compaction",
          label: "压缩上下文",
          ready: compactionReady,
          detail: compactionReady ? "Codex 请求压缩未启用，context 策略已显式配置。" : "需要新鲜 smoke、禁用请求体压缩并确认 context 策略。",
          actionHint: compactionActionHint,
          dependencies: dependenciesFor([...baseModeDependencies, "context-window"]),
        },
        {
          id: "cc-agent-task",
          label: "CC/IM Agent 任务",
          ready: ccAgentModeReady,
          detail: ccAgentModeReady
            ? "cc-connect 任务会走本地 Compact/CPA 链路。"
            : ccAgentTaskReady && !chatReady ? chatBlockedDetail : ccAgentDetail,
          actionHint: ccAgentModeReady ? { kind: "open-section", label: "查看 Agent 配置", section: "cc-connect" } : ccAgentActionHint,
          dependencies: dependenciesFor([...baseModeDependencies, "cc-agent-route"]),
        },
      ],
    };
  }

  function listJobs(): CodexStackJob[] {
    ensureDir(jobsDir());
    return fs.readdirSync(jobsDir())
      .filter((name) => name.endsWith(".json"))
      .map((name) => readJsonFile<CodexStackJob | null>(path.join(jobsDir(), name), null))
      .filter((job): job is CodexStackJob => Boolean(job))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  }

  function activeJob(): CodexStackJob | null {
    return listJobs().find((job) => job.status === "queued" || job.status === "running") || null;
  }

  function requireNoActiveJob(): void {
    const job = activeJob();
    if (!job) return;
    throw new CodexStackServiceError(
      "codex_stack_job_already_running",
      `Codex Stack job ${job.id} (${job.commandLabel}) is still ${job.status}. Wait for it to finish before starting another install, repair, finalize, service, or config action.`,
      409,
    );
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
    const configCpaPort = parseCpaPort(cpaConfig, defaultCpaPort(resolveChannel()));
    const configCompactPort = normalizePort(extractLocalCompactPortFromCodexConfig(codexConfig), DEFAULT_COMPACT_PORT);
    const [liveCpaPort, liveCompactPort] = await Promise.all([
      detectLivePort(["cli-proxy-api", "cpa"]),
      detectLivePort(["compact-proxy", "cpa-compact"]),
    ]);
    const cpaPort = liveCpaPort ?? configCpaPort;
    const compactPort = liveCompactPort ?? configCompactPort;
    const codexToken = extractTomlString(codexConfig, "experimental_bearer_token");
    const codexAuth = readCodexAuth(currentPaths.codexAuth);
    const officialAuthBackup = readCodexAuthRecord(currentPaths.codexOfficialAuthBackup);
    const officialAuthBackupCredential = representativeAuthSecret(officialAuthBackup);
    const officialAuthBackupRestorable = pathExists(currentPaths.codexOfficialAuthBackup)
      && isOfficialChatGptCodexAuth(officialAuthBackup);
    const cpaProxyKey = codexToken || codexAuth.key;
    const codexAuthMatches = cpaProxyKey ? codexAuth.key === cpaProxyKey : null;
    const codexCpaActive = codexConfigUsesLocalCompact(codexConfig, compactPort);
    const context = readCodexContext(codexConfig);
    const openclawDefaultModel = readOpenclawDefaultModel(currentPaths.openclawJson);
    const openclawPreferredModels = readOpenclawPreferredModels(currentPaths.openclawJson);
    const managementSecret = yamlBlockString(cpaConfig, "remote-management", "secret-key");
    const remoteAllowed = yamlBlockBoolean(cpaConfig, "remote-management", "allow-remote", false);
    const controlPanelEnabled = !yamlBlockBoolean(cpaConfig, "remote-management", "disable-control-panel", true);
    const parsedModels = parseModels(`${cpaConfig}\n${codexConfig}\n${ccConfig}`);
    const profile = readProfile();
    const proxyPolicy = readProxyPolicy(cpaConfig, currentPaths.openclawJson);
    const configuredModel = extractTomlString(codexConfig, "model") || ccParsed.projects[0]?.agentOptions.model;
    const currentModel = configuredModel;
    const fallbackModels = Array.from(new Set([
      currentModel,
      profile.defaultModel,
      openclawDefaultModel,
      ...openclawPreferredModels,
      ...parsedModels,
    ].filter(Boolean))).sort((left, right) => left.localeCompare(right));
    const hasConfiguredModelFallback = Boolean(
      currentModel
      || profile.defaultModel
      || openclawDefaultModel
      || openclawPreferredModels.length
      || parsedModels.length,
    );
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
        hasConfiguredModelFallback ? "config" : "fallback",
      ),
    ]);
    const compactHealthy = modelDiscovery.live;
    const gateway = buildGatewaySummary(compactPort, compactHealthy, ccParsed, modelDiscovery.available);
    const selectedDefaultModel = chooseDefaultModel(modelDiscovery.available, configuredModel, openclawDefaultModel);
    const cpaTargetModel = chooseCpaAttachModel(currentModel, profile.defaultModel, openclawDefaultModel);
    const ccBindingPresent = detectCcConnectBinding(ccConfig);
    const components = buildComponents({
      codexVersion,
      omxVersion,
      ccVersion,
      services,
      cpaHealthy,
      compactHealthy,
      codexAuthOk: pathExists(currentPaths.codexAuth) && codexAuthMatches === true,
      codexCpaActive,
      gateway,
    });
    const warnings: string[] = [];
    const installer = resolveInstallerSource();
    const ccConnectFinalizerAvailable = Boolean(installer.scripts.ccConnectFinalizer);
    if (installer.kind === "development-fallback") warnings.push("Using development codex-docs checkout as installer source.");
    if (installer.kind === "missing") warnings.push("Bundled Codex Stack installer assets are missing.");
    if (ccConfig && !ccBindingPresent) warnings.push("cc-connect is installed/configured but still needs Feishu or Weixin QR binding.");
    if (!codexCpaActive && currentModel && !isOfficialChatGptModel(currentModel)) {
      warnings.push(`Codex is using the official ChatGPT route with unsupported model ${currentModel}; switch to official GPT or attach CPA before running Codex.`);
    }
    if (codexCpaActive && !pathExists(currentPaths.codexAuth)) warnings.push("~/.codex/auth.json is missing; Codex CLI may not read the local CPA key.");
    if (codexCpaActive && codexAuthMatches === false) warnings.push("~/.codex/auth.json OPENAI_API_KEY does not match the configured CPA proxy key.");
    if (hasCodexResponsesWebSocketsEnabled(codexConfig)) warnings.push("Codex Responses WebSocket transport is enabled; CPA-compatible providers should use HTTP/SSE to avoid slow reconnect fallback.");
    if (hasCodexRequestCompressionEnabled(codexConfig)) warnings.push("Codex request compression is enabled; CPA-compatible providers should disable it unless the local proxy decodes compressed request bodies.");
    if (!managementSecret) warnings.push("CPA remote-management.secret-key is empty; the management dashboard/API is disabled.");
    if (!controlPanelEnabled) warnings.push("CPA management control panel is disabled; /management.html will not load.");
    if (!modelDiscovery.live && modelDiscovery.error) warnings.push(`模型列表未能从 /v1/models 读取，已使用本地配置回退：${modelDiscovery.error}`);
    if (!cpaTargetModel) warnings.push("尚未选择目标模型；请在运行配置里选择本机实际可用模型后再运行 smoke 或接管 Studio Gateway。");
    {
      const expectedCcProviderBaseUrl = `http://127.0.0.1:${compactPort}/v1`;
      const cpaProvider = ccParsed.providers.find((provider) => provider.name === "cpa");
      if (cpaProvider?.baseUrl && normalizeCcConnectBaseUrl(cpaProvider.baseUrl) !== expectedCcProviderBaseUrl) {
        warnings.push(`cc-connect cpa provider base_url (${cpaProvider.baseUrl}) does not match local Compact ${expectedCcProviderBaseUrl}; cc-connect Codex agents may bypass the verified CPA/Compact chain.`);
      }
      const cpaProviderEnvKey = cpaProvider?.codexEnvKey || cpaProvider?.codex?.envKey || "";
      if (cpaProviderEnvKey && cpaProviderEnvKey !== "OPENAI_API_KEY") {
        warnings.push(`cc-connect cpa provider codex.env_key is ${cpaProviderEnvKey}; Codex agents should receive OPENAI_API_KEY for the local Compact provider.`);
      }
    }
    {
      const legacyHealthcheck = services.find((service) => service.id === "cli-proxy-api-healthcheck.timer");
      if (legacyHealthcheck?.active || legacyHealthcheck?.enabled) {
        warnings.push("检测到旧 cli-proxy-api-healthcheck.timer；它会按旧端口巡检并重启 CPA，可能抵消暂停操作。推荐修复会自动停用并删除旧巡检。");
      }
    }
    if (proxyPolicy.providerMode === "direct" && proxyPolicy.providerProxyUrl) {
      warnings.push("系统代理已设置，但 CPA provider proxy-url 全部为 direct；国内网关不会继承系统代理。若 direct smoke 出现 EOF/SSL_ERROR_SYSCALL，请关闭 VPN 网卡/TUN 模式或为国内网关配置 split tunnel 绕过。");
    }
    if (!proxyPolicy.noProxyLoopbackReady) {
      warnings.push(`NO_PROXY 缺少 ${proxyPolicy.noProxyLoopbackMissing.join(", ")}；系统代理或 VPN 网卡/TUN 模式可能截获本地 CPA/Compact loopback 请求。运行 Codex 对话、长任务或压缩上下文前，请保留 localhost,127.0.0.1,::1。`);
    }
    if (profile.lastSmokeMatrix?.status === "failed") warnings.push("Target-model smoke matrix failed last run; Codex will not switch until the selected target model passes.");
    if (isSmokeMatrixStale(profile.lastSmokeMatrix)) warnings.push("Target-model smoke matrix is older than 24 hours; re-run the selected target model checks before treating Studio Gateway takeover as ready.");
    if (
      profile.lastSmokeMatrix?.attachEligible
      && !isSmokeMatrixStale(profile.lastSmokeMatrix)
      && !isSmokeMatrixComplete(profile.lastSmokeMatrix, cpaTargetModel)
    ) {
      if (!smokeMatrixCoversTarget(profile.lastSmokeMatrix, cpaTargetModel)) {
        warnings.push(`Target-model smoke matrix does not cover selected target model ${cpaTargetModel}; re-run the selected target model checks before treating Studio Gateway takeover as ready.`);
      } else {
        warnings.push("Target-model smoke matrix is incomplete; re-run the selected target model checks so ordinary, streaming, non-streaming, and compaction probes are all current.");
      }
    }
    const jobs = listJobs();
    const overallStatus = classifyOverall(components, jobs, ccBindingPresent);
    const recommendation = buildRecommendation({ overallStatus, warnings, profile, proxyPolicy, targetModel: cpaTargetModel });
    const ccConnectInstalled = Boolean(ccVersion) || pathExists(currentPaths.ccConnectConfig);
    const ccConnectConfigured = pathExists(currentPaths.ccConnectConfig);
    const runReadiness = buildRunReadiness({
      services,
      jobs,
      cpaHealthy,
      compactHealthy,
      codexAuthMatches,
      codexCpaActive,
      proxyPolicy,
      profile,
      context,
      codexConfig,
      ccParsed,
      ccBindingPresent,
      ccConnectInstalled,
      ccConnectConfigured,
      compactPort,
      targetModel: cpaTargetModel,
    });
    return {
      checkedAt: new Date().toISOString(),
      overallStatus,
      homeDir: currentPaths.homeDir,
      profilePath: currentPaths.profile,
      profile: {
        ...profile,
        cpaPort,
        compactPort,
        defaultModel: cpaTargetModel,
        contextMode: context.mode,
        contextWindowTokens: context.tokens,
        ccConnectProject: ccParsed.projects[0]?.name || DEFAULT_CC_CONNECT_PROJECT,
        hasCpaProxyKey: Boolean(cpaProxyKey),
      },
      installer,
      management: managementAccess(req),
      components,
      services,
      ports: { cpa: cpaPort, compact: compactPort, detectedCpa: liveCpaPort, detectedCompact: liveCompactPort },
      proxyPolicy,
      models: {
        current: currentModel || selectedDefaultModel,
        defaultModel: selectedDefaultModel,
        recommendedFrontier: GPT_55_MODEL,
        available: Array.from(new Set([
          cpaTargetModel,
          currentModel,
          selectedDefaultModel,
          openclawDefaultModel,
          ...modelDiscovery.available,
        ].filter(Boolean))).sort((left, right) => left.localeCompare(right)),
        source: modelDiscovery.source,
        endpoint: modelDiscovery.endpoint,
        live: modelDiscovery.live,
        refreshedAt: modelDiscovery.refreshedAt,
        error: modelDiscovery.error,
      },
      codexRoute: {
        active: codexCpaActive ? "cpa" : "official-chatgpt",
        currentModel: currentModel || selectedDefaultModel,
        cpaTargetModel,
        officialModel: GPT_55_MODEL,
      },
      gateway,
      context: {
        mode: context.mode,
        tokens: context.tokens,
        codexOneMillionEnabled: context.enabled,
        recommendedTokens: DEFAULT_CONTEXT_TOKENS,
        maxTokens: MAX_CONTEXT_TOKENS,
        source: context.tokens ? currentPaths.codexConfig : null,
      },
      secrets: {
        cpaProxyKey: cpaProxyKey
          ? { hasSecret: true, ...maskSecret(cpaProxyKey), source: codexToken ? currentPaths.codexConfig : currentPaths.codexAuth }
          : { hasSecret: false, masked: null, source: null, length: null },
        codexAuth: codexAuth.key
          ? { hasSecret: true, ...maskSecret(codexAuth.key), source: currentPaths.codexAuth, mode: codexAuth.mode, matchesProxyKey: codexAuthMatches }
          : { hasSecret: false, masked: null, source: pathExists(currentPaths.codexAuth) ? currentPaths.codexAuth : null, length: null, mode: codexAuth.mode, matchesProxyKey: codexAuthMatches },
        officialChatGptAuthBackup: officialAuthBackupRestorable
          ? {
            hasSecret: true,
            ...(officialAuthBackupCredential ? maskSecret(officialAuthBackupCredential) : { masked: "present", length: null }),
            source: currentPaths.codexOfficialAuthBackup,
            mode: authRecordMode(officialAuthBackup),
            restorable: true,
          }
          : {
            hasSecret: false,
            masked: null,
            source: pathExists(currentPaths.codexOfficialAuthBackup) ? currentPaths.codexOfficialAuthBackup : null,
            length: null,
            mode: authRecordMode(officialAuthBackup),
            restorable: false,
          },
        cpaManagementKey: managementSecret
          ? { hasSecret: true, ...maskSecret(managementSecret), source: currentPaths.cpaConfig }
          : { hasSecret: false, masked: null, source: pathExists(currentPaths.cpaConfig) ? currentPaths.cpaConfig : null, length: null },
        upstreamKeys: collectGenericSecrets(cpaConfig).map((secret) => ({
          hasSecret: true,
          ...maskSecret(secret),
          source: currentPaths.cpaConfig,
        })),
      },
      ccConnect: {
        installed: ccConnectInstalled,
        configured: ccConnectConfigured,
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
      cpaManagement: {
        dashboardUrl: `http://127.0.0.1:${cpaPort}/management.html`,
        enabled: Boolean(managementSecret),
        controlPanelEnabled,
        remoteAllowed,
        secretConfigured: Boolean(managementSecret),
      },
      runReadiness,
      recommendation,
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

  function normalizeInstallPayload(payload: CodexStackInstallRequest, channel: CodexStackChannel): {
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
    const contextMode = normalizeContextMode(env.CODEX_CONTEXT_MODE, "default");
    const contextTokens = contextMode === "default"
      ? null
      : (contextMode === "codex-1m" ? GPT_55_CONTEXT_TOKENS : normalizeContextTokens(env.CODEX_CONTEXT_WINDOW, DEFAULT_CONTEXT_TOKENS));
    const currentPaths = paths();
    const openclawDefaultModel = readOpenclawDefaultModel(currentPaths.openclawJson);
    const openclawPreferredModels = readOpenclawPreferredModels(currentPaths.openclawJson);
    const storedProfile = readJsonFile<Partial<CodexStackProfile>>(profilePath(), {});
    const currentCodexModel = extractTomlString(readText(currentPaths.codexConfig), "model");
    const installDefaultModel = normalizeString(env.CODEX_MODEL)
      || openclawDefaultModel
      || normalizeString(storedProfile.defaultModel)
      || currentCodexModel
      || openclawPreferredModels[0]
      || "";
    if (installDefaultModel) env.CODEX_MODEL = installDefaultModel;
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
        cpaPort: normalizePort(env.CPA_PORT, defaultCpaPort(channel)),
        compactPort: normalizePort(env.COMPACT_PORT, DEFAULT_COMPACT_PORT),
        defaultModel: installDefaultModel,
        contextMode,
        contextWindowTokens: contextTokens,
        hasCpaProxyKey: true,
        upstreamOverride: {
          hasBaseUrl: Boolean(env.OPENCLAW_UPSTREAM_BASE_URL),
          hasApiKey: Boolean(env.OPENCLAW_UPSTREAM_API_KEY),
        },
        providerProxy: {
          mode: env.OPENCLAW_PROVIDER_PROXY_URL ? "proxy" : "direct",
          url: env.OPENCLAW_PROVIDER_PROXY_URL || null,
          source: env.OPENCLAW_PROVIDER_PROXY_URL ? "install-env" : null,
        },
      },
    };
  }

  async function startInstall(req: http.IncomingMessage | undefined, payload: CodexStackInstallRequest): Promise<CodexStackJobResponse> {
    requireManagement(req);
    requireNoActiveJob();
    const installPayload: CodexStackInstallRequest = isRecord(payload) ? payload as CodexStackInstallRequest : {};
    const channel = installPayload.flags?.channel || resolveChannel();
    const installer = resolveInstallerSource(channel);
    if (!installer.requiredFilesPresent || !installer.scripts.autoSetup || !installer.root) {
      throw new CodexStackServiceError("codex_stack_installer_missing", "Codex Stack installer assets are missing.", 404);
    }
    const normalized = normalizeInstallPayload(installPayload, channel);
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
      const finalStatus: CodexStackJobStatus = code === 0 ? "succeeded" : "failed";
      const finalError = code === 0 ? null : `Installer exited with code ${code ?? "unknown"}`;
      job.finishedAt = new Date().toISOString();
      appendJobLog(job, `\n[studio] install ${finalStatus}\n`, normalized.secrets);
      if (code === 0) {
        const proxyKey = normalized.env.CPA_PROXY_KEY || extractTomlString(readText(currentPaths.codexConfig), "experimental_bearer_token") || DEFAULT_CPA_PROXY_KEY;
        const daemonServicePath = writeModelGatewayDaemonServiceTemplate(config);
        appendJobLog(job, `Prepared Studio Model Gateway daemon service template: ${daemonServicePath}\n`);
        if (prepareCodexStudioGatewayProvider(currentPaths.codexConfig)) {
          appendJobLog(job, `Prepared inactive Codex Studio provider at ${modelGatewayDaemonBaseUrl()}.\n`);
        } else {
          appendJobLog(job, "Codex Studio provider was already prepared or Codex config is not present yet.\n");
        }
        writeCodexAuth(currentPaths.codexAuth, proxyKey, currentPaths.codexOfficialAuthBackup);
        const profile = readProfile();
        writeProfile({
          ...profile,
          ...normalized.profilePatch,
          installerSource: installer.root,
          ccConnectProject: profile.ccConnectProject || DEFAULT_CC_CONNECT_PROJECT,
          channel: installer.channel,
          lastInstallAt: new Date().toISOString(),
        });
      }
      job.status = finalStatus;
      job.error = finalError;
      writeJob(job);
    });
    return { ok: true, job: { ...job, logTail: readLogTail(job.logPath) } };
  }

  async function runNodeJob(
    kind: CodexStackJob["kind"],
    commandLabel: string,
    task: (job: CodexStackJob) => Promise<void>,
  ): Promise<CodexStackJobResponse> {
    requireNoActiveJob();
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
    requireNoActiveJob();
    const repairPayload: CodexStackRepairRequest = isRecord(payload) ? payload as CodexStackRepairRequest : { actions: [] };
    const actions = Array.isArray(repairPayload.actions) ? repairPayload.actions : [];
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
      const runOptionalSystemctl = async (...args: string[]) => {
        appendJobLog(job, `\n$ systemctl --user ${args.join(" ")}\n`);
        const result = await execText("systemctl", ["--user", ...args], { timeout: 30_000 });
        appendJobLog(job, `${result.output}\n`);
      };
      const waitForHealth = async (label: string, url: string): Promise<void> => {
        appendJobLog(job, `Waiting for ${label}: ${url}\n`);
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          if (await probeUrl(url)) {
            appendJobLog(job, `${label} is healthy.\n`);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
        throw new Error(`${label} did not become healthy: ${url}`);
      };
      const stackPorts = () => {
        const codex = readText(currentPaths.codexConfig);
        const cpa = readText(currentPaths.cpaConfig);
        const profile = readProfile();
        return {
          cpa: parseCpaPort(cpa, profile.cpaPort || defaultCpaPort(resolveChannel())),
          compact: normalizePort(extractLocalCompactPortFromCodexConfig(codex), profile.compactPort || DEFAULT_COMPACT_PORT),
        };
      };
      for (const action of actions as RepairAction[]) {
        if (action === "pause-stack") {
          await runOptionalSystemctl("disable", "--now", "cli-proxy-api-healthcheck.timer");
          await runOptionalSystemctl("stop", "cli-proxy-api-healthcheck.service");
          await runSystemctl("disable", "--now", "codex-stack-watchdog.timer");
          await runSystemctl("disable", "--now", "cpa-compact-proxy.service");
          await runSystemctl("disable", "--now", "cli-proxy-api.service");
          await runSystemctl("stop", "cpa-compact-proxy.service");
          await runSystemctl("stop", "cli-proxy-api.service");
          appendJobLog(job, "Paused CPA stack; legacy healthcheck, CPA, Compact, and watchdog are disabled so they will not relaunch automatically.\n");
        }
        if (action === "resume-stack") {
          const ports = stackPorts();
          await runOptionalSystemctl("disable", "--now", "cli-proxy-api-healthcheck.timer");
          await runSystemctl("enable", "--now", "cli-proxy-api.service");
          await waitForHealth("CPA", `http://127.0.0.1:${ports.cpa}/healthz`);
          await runSystemctl("enable", "--now", "cpa-compact-proxy.service");
          await waitForHealth("Compact Proxy", `http://127.0.0.1:${ports.compact}/healthz`);
          await runSystemctl("enable", "--now", "codex-stack-watchdog.timer");
          appendJobLog(job, "Resumed CPA stack; watchdog enabled only after CPA and Compact became healthy.\n");
        }
        if (action === "restart-cpa") await runSystemctl("restart", "cli-proxy-api.service");
        if (action === "restart-compact-proxy") await runSystemctl("restart", "cpa-compact-proxy.service");
        if (action === "restart-watchdog") await runSystemctl("restart", "codex-stack-watchdog.timer");
        if (action === "restart-cc-connect") await runSystemctl("restart", "cc-connect.service");
        if (action === "repair-auth-json") {
          const proxyKey = extractTomlString(readText(currentPaths.codexConfig), "experimental_bearer_token") || DEFAULT_CPA_PROXY_KEY;
          writeCodexAuth(currentPaths.codexAuth, proxyKey, currentPaths.codexOfficialAuthBackup);
          appendJobLog(job, `Rewrote ${currentPaths.codexAuth}.\n`, [proxyKey]);
        }
        if (action === "repair-cpa-management") {
          const cpa = readText(currentPaths.cpaConfig);
          if (!cpa) throw new Error("CPA config is missing");
          const next = ensureCpaRemoteManagementBlock(cpa, DEFAULT_CPA_PROXY_KEY);
          if (next !== cpa) {
            backupAndWrite(currentPaths.cpaConfig, next);
            appendJobLog(job, "Repaired CPA remote-management block and enabled control panel.\n");
          } else {
            appendJobLog(job, "CPA remote-management block already matched Studio defaults.\n");
          }
        }
        if (action === "repair-codex-transport") {
          const codex = readText(currentPaths.codexConfig);
          if (!codex) throw new Error("Codex config is missing");
          const effectiveCompactPort = normalizePort(extractLocalCompactPortFromCodexConfig(codex), readProfile().compactPort || DEFAULT_COMPACT_PORT);
          const compactBaseUrl = `http://127.0.0.1:${effectiveCompactPort}/v1`;
          const effectiveProxyKey = extractTomlString(codex, "experimental_bearer_token") || readCodexAuth(currentPaths.codexAuth).key || DEFAULT_CPA_PROXY_KEY;
          const stableCodex = removeTopLevelLocalCompactBaseUrls(
            removeTopLevelTomlStringValue(applyCodexStableTransport(codex), "model_provider", "cpa"),
          );
          const next = applyCodexCpaProviderSection(stableCodex, compactBaseUrl, effectiveProxyKey);
          if (next !== codex) {
            backupAndWrite(currentPaths.codexConfig, next);
            appendJobLog(job, "Updated inactive Codex CPA provider settings and disabled WebSocket/compressed transport; active Codex provider was not switched.\n", [effectiveProxyKey]);
          } else {
            appendJobLog(job, "Codex CPA HTTP/SSE transport settings were already configured; active Codex provider was not switched.\n");
          }
        }
        if (action === "repair-no-proxy-loopback") {
          const policy = readProxyPolicy(readText(currentPaths.cpaConfig), currentPaths.openclawJson);
          const noProxy = ensureNoProxyLoopback(policy.noProxy);
          const changedUnits: string[] = [];
          if (noProxy !== policy.noProxy || !policy.noProxyLoopbackReady) {
            patchOpenclawEnvValues(currentPaths.openclawJson, {
              NO_PROXY: noProxy,
              OPENCLAW_NO_PROXY: noProxy,
            });
            for (const [unitPath, unitName] of [
              [currentPaths.cpaService, "cli-proxy-api.service"],
              [currentPaths.compactService, "cpa-compact-proxy.service"],
            ] as const) {
              const unit = readText(unitPath);
              if (!unit) continue;
              let next = replaceEnvLine(unit, "NO_PROXY", noProxy);
              next = replaceEnvLine(next, "OPENCLAW_NO_PROXY", noProxy);
              if (next !== unit) {
                backupAndWrite(unitPath, next);
                changedUnits.push(unitName);
              }
            }
            appendJobLog(job, `Updated NO_PROXY loopback bypass to ${noProxy}; VPN 网卡/TUN 模式不应再截获本机 CPA/Compact 请求。\n`);
            if (changedUnits.length) {
              await runSystemctl("daemon-reload");
              for (const unitName of changedUnits) {
                await runSystemctl("try-restart", unitName);
              }
              appendJobLog(job, `Reloaded systemd and try-restarted ${changedUnits.join(", ")} so active services pick up NO_PROXY.\n`);
            }
          } else {
            appendJobLog(job, `NO_PROXY already contains localhost,127.0.0.1,::1 (${policy.noProxy}).\n`);
          }
        }
        if (action === "disable-legacy-healthcheck") {
          await runOptionalSystemctl("disable", "--now", "cli-proxy-api-healthcheck.timer");
          await runOptionalSystemctl("stop", "cli-proxy-api-healthcheck.service");
          const removed = [
            currentPaths.legacyHealthcheckTimer,
            currentPaths.legacyHealthcheckService,
            currentPaths.legacyHealthcheckBin,
            currentPaths.legacyCpaAlwaysOnDropIn,
            currentPaths.legacyCompactAlwaysOnDropIn,
          ].filter((filePath) => removeFileIfExists(filePath));
          await runOptionalSystemctl("daemon-reload");
          appendJobLog(
            job,
            removed.length
              ? `Removed legacy CPA healthcheck artifacts: ${removed.join(", ")}.\n`
              : "Legacy CPA healthcheck was already absent after systemd cleanup.\n",
          );
        }
        if (action === "apply-codex-studio-after-smoke") {
          const codex = readText(currentPaths.codexConfig);
          if (!codex) throw new Error("Codex config is missing");
          const profile = readProfile();
          const currentModel = extractTomlString(codex, "model");
          const attachModel = requireCpaTargetModel(chooseCpaAttachModel(
            currentModel,
            profile.defaultModel,
            readOpenclawDefaultModel(currentPaths.openclawJson),
          ));
          await runCodexStudioSmokeGate(job, attachModel);
          const next = applyCodexStudioActiveProvider(codex, attachModel);
          if (next !== codex) {
            backupAndWrite(currentPaths.codexConfig, next);
            appendJobLog(job, `Studio Model Gateway smoke gate passed; Codex active provider switched to studio using ${attachModel}.\n`);
          } else {
            appendJobLog(job, "Studio Model Gateway smoke gate passed; Codex active provider was already studio.\n");
          }
        }
        if (action === "restore-official-chatgpt") {
          const codex = readText(currentPaths.codexConfig);
          if (!codex) throw new Error("Codex config is missing");
          const next = applyOfficialChatGptRoute(codex);
          if (next !== codex) {
            backupAndWrite(currentPaths.codexConfig, next);
            appendJobLog(job, `Restored official ChatGPT Codex route using ${GPT_55_MODEL}; CPA provider remains configured but inactive.\n`);
          } else {
            appendJobLog(job, `Official ChatGPT Codex route already uses ${GPT_55_MODEL}.\n`);
          }
          if (restoreOfficialCodexAuth(currentPaths.codexAuth, currentPaths.codexOfficialAuthBackup)) {
            appendJobLog(job, "Restored preserved official ChatGPT auth.json backup.\n");
          } else {
            appendJobLog(job, "No preserved official ChatGPT auth backup found; Codex official route may require a fresh ChatGPT login.\n");
          }
        }
        if (action === "run-smoke-matrix") {
          const codex = readText(currentPaths.codexConfig);
          const ports = stackPorts();
          const effectiveProxyKey = extractTomlString(codex, "experimental_bearer_token") || readCodexAuth(currentPaths.codexAuth).key || DEFAULT_CPA_PROXY_KEY;
          const profile = readProfile();
          const attachModel = requireCpaTargetModel(chooseCpaAttachModel(
            extractTomlString(codex, "model"),
            profile.defaultModel,
            readOpenclawDefaultModel(currentPaths.openclawJson),
          ));
          const matrix = await runCodexCpaSmokeMatrix(job, ports, effectiveProxyKey, [attachModel]);
          if (!matrix.attachEligible) {
            const failed = matrix.models.find((result) => result.status === "failed");
            throw new Error(`Target-model smoke matrix failed${failed ? ` for ${failed.model}: ${failed.error}` : ""}`);
          }
        }
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
    requireNoActiveJob();
    const finalizePayload: CodexStackFinalizeRequest = isRecord(payload) ? payload as CodexStackFinalizeRequest : {};
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
    const project = normalizeString(finalizePayload.project, readCcConnectProject(ccConfig));
    const args = [script, "--project", project];
    if (finalizePayload.noAdminAll === true) args.push("--no-admin-all");
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
    if (!(MANUAL_SERVICE_IDS as readonly string[]).includes(serviceId)) {
      throw new CodexStackServiceError(
        "codex_stack_managed_service_control_blocked",
        `${serviceId} is auto-managed. Use install, pause stack, resume stack, or recommended repair so Studio applies the ordered recovery flow.`,
        409,
      );
    }
    requireNoActiveJob();
    if ((action === "start" || action === "restart" || action === "enable") && serviceId === "cpa-compact-proxy.service") {
      await requireActiveUnitForServiceAction("cli-proxy-api.service", "Start or resume CPA before starting Compact Proxy.");
    }
    const systemctlArgs = action === "enable"
      ? ["--user", "enable", "--now", serviceId]
      : ["--user", action, serviceId];
    const result = await execText("systemctl", systemctlArgs, { timeout: 30_000 });
    if (!result.ok) {
      throw new CodexStackServiceError("codex_stack_service_action_failed", redact(result.output || `systemctl ${action} failed`), 500);
    }
    return {
      ok: true,
      message: `${serviceId} ${action} requested.`,
      summary: await getSummary(req),
    };
  }

  async function requireActiveUnitForServiceAction(unit: CodexStackServiceId, message: string): Promise<void> {
    const active = await execText("systemctl", ["--user", "is-active", unit], { timeout: 4_000 });
    if (!active.ok || !systemctlOutputHasState(active.output, "active")) {
      throw new CodexStackServiceError(
        "codex_stack_service_lifecycle_guard",
        `${message} Use Resume CPA Stack so Studio starts CPA, waits for Compact, and enables watchdog in order.`,
        409,
      );
    }
  }

  async function patchConfig(
    req: http.IncomingMessage | undefined,
    payload: CodexStackConfigPatchRequest | undefined,
  ): Promise<CodexStackMutationResponse> {
    requireManagement(req);
    const patch: CodexStackConfigPatchRequest = isRecord(payload) ? payload as CodexStackConfigPatchRequest : {};
    const allowed = [
      "defaultModel",
      "contextMode",
      "contextWindowTokens",
      "cpaPort",
      "compactPort",
      "cpaProxyKey",
      "ccConnectProject",
      "upstreamBaseUrl",
      "upstreamApiKey",
      "providerProxyUrl",
      "noProxy",
    ];
    const unknown = Object.keys(patch).filter((key) => !allowed.includes(key));
    if (unknown.length) {
      throw new CodexStackServiceError("codex_stack_invalid_config_patch", `Unsupported config fields: ${unknown.join(", ")}`);
    }
    if (Object.keys(patch).length === 0) {
      return {
        ok: true,
        message: "Codex Stack config unchanged.",
        restartRequiredUnits: [],
        summary: await getSummary(req),
      };
    }
    const currentPaths = paths();
    const restartRequired = new Set<CodexStackManualServiceId>();
    const model = normalizeString(patch.defaultModel);
    const hasContextPatch = Object.prototype.hasOwnProperty.call(patch, "contextMode")
      || Object.prototype.hasOwnProperty.call(patch, "contextWindowTokens");
    const contextMode = hasContextPatch ? normalizeContextMode(patch.contextMode, patch.contextWindowTokens === null ? "default" : "custom") : null;
    const contextTokens = hasContextPatch
      ? (contextMode === "codex-1m" ? GPT_55_CONTEXT_TOKENS : normalizeContextTokens(patch.contextWindowTokens, DEFAULT_CONTEXT_TOKENS))
      : null;
    const ccProject = normalizeString(patch.ccConnectProject);
    const cpaPort = patch.cpaPort === undefined ? null : normalizePort(patch.cpaPort, 0);
    const compactPort = patch.compactPort === undefined ? null : normalizePort(patch.compactPort, 0);
    const cpaKey = normalizeString(patch.cpaProxyKey);
    const hasUpstreamBasePatch = Object.prototype.hasOwnProperty.call(patch, "upstreamBaseUrl");
    const hasUpstreamKeyPatch = Object.prototype.hasOwnProperty.call(patch, "upstreamApiKey");
    const hasProviderProxyPatch = Object.prototype.hasOwnProperty.call(patch, "providerProxyUrl");
    const hasNoProxyPatch = Object.prototype.hasOwnProperty.call(patch, "noProxy");
    const upstreamBaseUrl = hasUpstreamBasePatch ? normalizeString(patch.upstreamBaseUrl) : "";
    const upstreamApiKey = hasUpstreamKeyPatch ? normalizeString(patch.upstreamApiKey) : "";
    const providerProxyUrl = hasProviderProxyPatch ? normalizeString(patch.providerProxyUrl) : "";
    const providerProxyConfigValue = hasProviderProxyPatch ? (providerProxyUrl || "direct") : "";
    const noProxy = hasNoProxyPatch ? normalizeString(patch.noProxy, "localhost,127.0.0.1,::1") : "";
    if (patch.cpaPort !== undefined && !cpaPort) throw new CodexStackServiceError("codex_stack_invalid_port", "cpaPort must be between 1 and 65535.");
    if (patch.compactPort !== undefined && !compactPort) throw new CodexStackServiceError("codex_stack_invalid_port", "compactPort must be between 1 and 65535.");
    requireNoActiveJob();
    const invalidatesSmokeMatrix = Boolean(
      model
      || hasContextPatch
      || cpaPort
      || compactPort
      || cpaKey
      || hasUpstreamBasePatch
      || upstreamApiKey
      || hasProviderProxyPatch
      || hasNoProxyPatch,
    );

    const codex = readText(currentPaths.codexConfig);
    if (codex) {
      let next = codex;
      if (model) {
        next = replaceTomlString(next, "model", model);
        restartRequired.add("cpa-compact-proxy.service");
      }
      const effectiveCompactPort = compactPort || readProfile().compactPort || DEFAULT_COMPACT_PORT;
      const hasExistingLocalCompactBaseUrl = hasLocalCompactBaseUrl(next);
      if (hasExistingLocalCompactBaseUrl) {
        next = replaceLocalCompactBaseUrls(next, `http://127.0.0.1:${effectiveCompactPort}/v1`);
        restartRequired.add("cpa-compact-proxy.service");
      }
      if (cpaKey) {
        next = replaceTomlString(next, "experimental_bearer_token", cpaKey);
        restartRequired.add("cpa-compact-proxy.service");
      }
      if (hasContextPatch && contextMode) {
        next = applyCodexContext(next, contextMode, contextTokens);
      }
      next = removeTopLevelLocalCompactBaseUrls(applyCodexStableTransport(next));
      const compactBaseUrl = `http://127.0.0.1:${effectiveCompactPort}/v1`;
      const effectiveProxyKey = cpaKey || extractTomlString(next, "experimental_bearer_token") || readCodexAuth(currentPaths.codexAuth).key || DEFAULT_CPA_PROXY_KEY;
      next = applyCodexCpaProviderSection(next, compactBaseUrl, effectiveProxyKey);
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
      if (cpaKey || compactPort) {
        // 更新 cc-connect 配置中的 cpa provider，使 Codex 与 Agent 走同一个 Compact 入口。
        if (!parsedCc.providers) parsedCc.providers = [];
        let cpaProvider = parsedCc.providers.find(p => p.name === "cpa");
        const providerBaseUrl = `http://127.0.0.1:${compactPort || readProfile().compactPort || DEFAULT_COMPACT_PORT}/v1`;
        if (!cpaProvider) {
          cpaProvider = { name: "cpa", apiKey: cpaKey, baseUrl: providerBaseUrl, codexEnvKey: "OPENAI_API_KEY" };
          parsedCc.providers.push(cpaProvider);
        } else {
          if (cpaKey) cpaProvider.apiKey = cpaKey;
          if (compactPort) cpaProvider.baseUrl = providerBaseUrl;
          cpaProvider.codexEnvKey = cpaProvider.codexEnvKey || "OPENAI_API_KEY";
        }
      }
      const next = patchCcConnectStructuredToml(cc, { projects: parsedCc.projects, providers: parsedCc.providers });
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
      if (cpaKey) {
        next = replaceFirstYamlListSecret(next, cpaKey);
        next = replaceOrAppendYamlString(next, "experimental_bearer_token", cpaKey);
      }
      if (hasUpstreamBasePatch) {
        next = replaceOrAppendYamlString(next, "upstream_base_url", upstreamBaseUrl);
        next = patchFirstOpenaiCompatibilityProvider(next, { baseUrl: upstreamBaseUrl });
        restartRequired.add("cli-proxy-api.service");
      }
      if (upstreamApiKey) {
        next = replaceOrAppendYamlString(next, "upstream_api_key", upstreamApiKey);
        next = ensureYamlListEntry(next, "api-keys", upstreamApiKey);
        next = patchFirstOpenaiCompatibilityProvider(next, { apiKey: upstreamApiKey });
        restartRequired.add("cli-proxy-api.service");
      }
      if (hasProviderProxyPatch) {
        next = replaceOrAppendYamlString(next, "proxy-url", providerProxyConfigValue);
        next = patchFirstOpenaiCompatibilityProvider(next, { proxyUrl: providerProxyConfigValue });
        restartRequired.add("cli-proxy-api.service");
      }
      next = ensureCpaRemoteManagementBlock(next, DEFAULT_CPA_PROXY_KEY);
      if (next !== cpa) backupAndWrite(currentPaths.cpaConfig, next);
    }

    if (cpaKey) {
      writeCodexAuth(currentPaths.codexAuth, cpaKey, currentPaths.codexOfficialAuthBackup);
    }

    const openclawEnvPatch: Record<string, string> = {};
    if (hasUpstreamBasePatch) openclawEnvPatch.OPENCLAW_UPSTREAM_BASE_URL = upstreamBaseUrl;
    if (upstreamApiKey) openclawEnvPatch.OPENCLAW_UPSTREAM_API_KEY = upstreamApiKey;
    if (hasProviderProxyPatch) openclawEnvPatch.OPENCLAW_PROVIDER_PROXY_URL = providerProxyUrl;
    if (hasNoProxyPatch) {
      openclawEnvPatch.NO_PROXY = noProxy;
      openclawEnvPatch.OPENCLAW_NO_PROXY = noProxy;
    }
    if (Object.keys(openclawEnvPatch).length) patchOpenclawEnvValues(currentPaths.openclawJson, openclawEnvPatch);

    const compactUnit = readText(currentPaths.compactService);
    if (compactUnit) {
      let next = compactUnit;
      const effectiveCpaPort = cpaPort || readProfile().cpaPort || DMWORK_CPA_PORT;
      next = replaceEnvLine(next, "CPA_PORT", effectiveCpaPort);
      next = replaceEnvLine(next, "CPA_BASE_URL", `http://127.0.0.1:${effectiveCpaPort}`);
      if (compactPort) next = replaceEnvLine(next, "LISTEN_PORT", compactPort);
      if (model) next = replaceEnvLine(next, "COMPACT_DEFAULT_MODEL", model);
      if (hasNoProxyPatch) {
        next = replaceEnvLine(next, "NO_PROXY", noProxy);
        next = replaceEnvLine(next, "OPENCLAW_NO_PROXY", noProxy);
      }
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
      contextMode: contextMode || profile.contextMode,
      contextWindowTokens: hasContextPatch ? (contextMode === "default" ? null : contextTokens) : profile.contextWindowTokens,
      ccConnectProject: ccProject || profile.ccConnectProject,
      hasCpaProxyKey: cpaKey ? true : profile.hasCpaProxyKey,
      upstreamOverride: {
        hasBaseUrl: hasUpstreamBasePatch ? Boolean(upstreamBaseUrl) : Boolean(profile.upstreamOverride?.hasBaseUrl),
        hasApiKey: upstreamApiKey ? true : Boolean(profile.upstreamOverride?.hasApiKey),
      },
      providerProxy: {
        mode: hasProviderProxyPatch && providerProxyUrl ? "proxy" : (hasProviderProxyPatch ? "direct" : (profile.providerProxy?.mode || "direct")),
        url: hasProviderProxyPatch ? (providerProxyUrl || null) : (profile.providerProxy?.url || null),
        source: hasProviderProxyPatch ? (providerProxyUrl ? "studio-config" : null) : (profile.providerProxy?.source || null),
      },
      lastSmokeMatrix: invalidatesSmokeMatrix ? null : profile.lastSmokeMatrix,
    });

    const restartPending = new Set(restartRequired);
    if (restartRequired.size > 0) {
      await execText("systemctl", ["--user", "daemon-reload"], { timeout: 15_000 });
      for (const unit of restartRequired) {
        const status = await readServiceStatus(unit);
        if (!status.active) continue;
        const result = await execText("systemctl", ["--user", "restart", unit], { timeout: 30_000 });
        if (result.ok) restartPending.delete(unit);
      }
    }

    return {
      ok: true,
      message: restartRequired.size > 0
        ? (
          restartPending.size > 0
            ? `Codex Stack config updated. Restart required when ready: ${Array.from(restartPending).join(", ")}.`
            : `Codex Stack config updated. Restarted active services: ${Array.from(restartRequired).join(", ")}.`
        )
        : "Codex Stack config updated.",
      restartRequiredUnits: Array.from(restartPending),
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
    requireNoActiveJob();

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
