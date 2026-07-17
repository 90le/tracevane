import { spawnSync } from "node:child_process";
import path from "node:path";
import type {
  ConfigPatchPayload,
  ConfigProviderInput,
  ConfigProviderModelSummary,
  ConfigProviderSummary,
  ConfigChannelAccountSummary,
  ConfigSaveResponse,
  ConfigSummaryPayload,
  ConfigUpdatePayload,
} from "../../../../types/config.js";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import {
  readJsonFile,
  readOpenClawConfig,
  writeJsonFile,
} from "../../core/state.js";
import {
  cloneOpenClawSecretRef,
  hasConfiguredSecretInput,
} from "../../core/secret-ref.js";
import { diffConfigAuditChanges } from "./config-audit-diff.js";
import { buildConfigAuditEvents } from "./config-audit-events.js";
import { createSystemEventWriter } from "../system/event-writer.js";

const NON_DOCKER_SANDBOX_BACKENDS = new Set(["ssh", "openshell"]);
const SKILL_NODE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
const PROVIDER_MANAGED_KEYS = new Set(["api", "apiKey", "baseUrl", "models"]);
const PROVIDER_MODEL_MANAGED_KEYS = new Set([
  "contextWindow",
  "id",
  "input",
  "maxTokens",
  "reasoning",
]);
const AGENT_DEFAULT_MANAGED_KEYS = new Set([
  "blockStreamingBreak",
  "blockStreamingChunk",
  "blockStreamingCoalesce",
  "blockStreamingDefault",
  "bootstrapMaxChars",
  "bootstrapPromptTruncationWarning",
  "bootstrapTotalMaxChars",
  "cliBackends",
  "compaction",
  "contextInjection",
  "contextPruning",
  "contextTokens",
  "elevatedDefault",
  "embeddedAgent",
  "embeddedPi",
  "envelopeElapsed",
  "envelopeTimestamp",
  "envelopeTimezone",
  "heartbeat",
  "humanDelay",
  "imageGenerationModel",
  "imageMaxDimensionPx",
  "imageModel",
  "llm",
  "maxConcurrent",
  "mediaGenerationAutoProviderFallback",
  "mediaMaxMb",
  "memorySearch",
  "model",
  "models",
  "musicGenerationModel",
  "params",
  "pdfMaxBytesMb",
  "pdfMaxPages",
  "pdfModel",
  "repoRoot",
  "sandbox",
  "skills",
  "skipBootstrap",
  "subagents",
  "systemPromptOverride",
  "thinkingDefault",
  "timeFormat",
  "timeoutSeconds",
  "typingIntervalSeconds",
  "typingMode",
  "userTimezone",
  "verboseDefault",
  "videoGenerationModel",
  "workspace",
]);
const AGENT_DEFAULT_EXTRA_KEYS = new Set([
  "contextLimits",
  "experimental",
  "imageQuality",
  "promptOverlays",
  "reasoningDefault",
  "runRetries",
  "silentReply",
  "skipOptionalBootstrapFiles",
  "startupContext",
  "toolProgressDetail",
  "voiceModel",
]);
const GATEWAY_EXTRA_KEYS = new Set([
  "http",
  "nodes",
  "push",
  "reload",
  "remote",
  "tls",
]);
const ACP_EXTRA_KEYS = new Set(["fallbacks", "runtime", "stream"]);
const SESSION_EXTRA_KEYS = new Set([
  "agentToAgent",
  "idleMinutes",
  "identityLinks",
  "mainKey",
  "maintenance",
  "resetTriggers",
  "scope",
  "sendPolicy",
  "store",
  "typingIntervalSeconds",
  "typingMode",
  "writeLock",
]);
const MESSAGES_EXTRA_KEYS = new Set([
  "groupChat",
  "inbound",
  "messagePrefix",
  "statusReactions",
  "suppressToolErrors",
  "tts",
  "usageTemplate",
  "visibleReplies",
]);
const TOOLS_EXTRA_KEYS = new Set([
  "agentToAgent",
  "allow",
  "alsoAllow",
  "byProvider",
  "codeMode",
  "deny",
  "experimental",
  "links",
  "loopDetection",
  "media",
  "message",
  "sandbox",
  "sessions",
  "sessions_spawn",
  "subagents",
  "toolSearch",
  "toolsBySender",
  "web",
]);
const COMMAND_EXTRA_KEYS = new Set([
  "allowFrom",
  "ownerAllowFrom",
  "ownerDisplaySecret",
  "useAccessGroups",
]);
const GATEWAY_SCHEMA_KEYS = new Set([
  "allowRealIpFallback",
  "auth",
  "bind",
  "channelHealthCheckMinutes",
  "channelMaxRestartsPerHour",
  "channelStaleEventThresholdMinutes",
  "controlUi",
  "customBindHost",
  "handshakeTimeoutMs",
  "mode",
  "port",
  "tailscale",
  "tools",
  "trustedProxies",
  ...GATEWAY_EXTRA_KEYS,
]);
const ACP_SCHEMA_KEYS = new Set([
  "allowedAgents",
  "backend",
  "defaultAgent",
  "dispatch",
  "enabled",
  "maxConcurrentSessions",
  ...ACP_EXTRA_KEYS,
]);
const SESSION_SCHEMA_KEYS = new Set([
  "dmScope",
  "reset",
  "resetByChannel",
  "resetByType",
  "threadBindings",
  ...SESSION_EXTRA_KEYS,
]);
const MESSAGES_SCHEMA_KEYS = new Set([
  "ackReaction",
  "ackReactionScope",
  "queue",
  "removeAckAfterReply",
  "responsePrefix",
  ...MESSAGES_EXTRA_KEYS,
]);
const TOOLS_SCHEMA_KEYS = new Set([
  "elevated",
  "exec",
  "fs",
  "profile",
  ...TOOLS_EXTRA_KEYS,
]);
const COMMAND_SCHEMA_KEYS = new Set([
  "bash",
  "bashForegroundMs",
  "config",
  "debug",
  "mcp",
  "native",
  "nativeSkills",
  "ownerDisplay",
  "plugins",
  "restart",
  "text",
  ...COMMAND_EXTRA_KEYS,
]);
const ROOT_SCHEMA_KEYS = new Set([
  "$schema",
  "accessGroups",
  "acp",
  "agents",
  "approvals",
  "audio",
  "auth",
  "bindings",
  "broadcast",
  "browser",
  "channels",
  "cli",
  "commands",
  "commitments",
  "crestodian",
  "cron",
  "diagnostics",
  "discovery",
  "env",
  "gateway",
  "hooks",
  "logging",
  "mcp",
  "media",
  "memory",
  "messages",
  "meta",
  "models",
  "nodeHost",
  "plugins",
  "proxy",
  "secrets",
  "security",
  "session",
  "skills",
  "surfaces",
  "talk",
  "tools",
  "transcripts",
  "tui",
  "ui",
  "update",
  "web",
  "wizard",
]);
const OPENCLAW_EXTRA_DOMAIN_KEYS = new Set([
  "accessGroups",
  "approvals",
  "audio",
  "auth",
  "broadcast",
  "cli",
  "commitments",
  "crestodian",
  "cron",
  "diagnostics",
  "discovery",
  "env",
  "media",
  "memory",
  "nodeHost",
  "proxy",
  "secrets",
  "security",
  "surfaces",
  "talk",
  "transcripts",
  "tui",
  "ui",
  "update",
  "web",
  "wizard",
]);

const LEGACY_PROVIDER_API_ALIASES: Record<string, string> = {
  "azure-openai": "azure-openai-responses",
  "google-generative": "google-generative-ai",
};

const DEFAULT_PROVIDER_BASE_URL_BY_API: Record<string, string> = {
  "anthropic-messages": "https://api.anthropic.com",
  "google-generative-ai": "https://generativelanguage.googleapis.com",
  ollama: "http://127.0.0.1:11434",
};

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeProviderApi(value: unknown): string {
  const normalized = normalizeString(value);
  return LEGACY_PROVIDER_API_ALIASES[normalized] || normalized;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || items.includes(normalized)) continue;
    items.push(normalized);
  }
  return items;
}

function normalizeSkillNodeManager(value: unknown): "" | "npm" | "pnpm" | "yarn" | "bun" {
  const normalized = normalizeString(value);
  return SKILL_NODE_MANAGERS.has(normalized)
    ? normalized as "npm" | "pnpm" | "yarn" | "bun"
    : "";
}

function cloneJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneJsonObjectWithoutKeys(
  value: unknown,
  managedKeys: Set<string>,
): Record<string, unknown> | null {
  const cloned = cloneJsonObject(value);
  if (!cloned) return null;
  for (const key of managedKeys) {
    delete cloned[key];
  }
  return Object.keys(cloned).length ? cloned : null;
}

function cloneJsonValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function cloneJsonObjectWithKeys(
  value: unknown,
  allowedKeys: Set<string>,
): Record<string, unknown> | null {
  const cloned = cloneJsonObject(value);
  if (!cloned) return null;
  for (const key of Object.keys(cloned)) {
    if (!allowedKeys.has(key)) delete cloned[key];
  }
  return Object.keys(cloned).length ? cloned : null;
}

function readAgentDefaultExtra(
  defaults: Record<string, unknown>,
): Record<string, unknown> | null {
  const extra: Record<string, unknown> = {};
  for (const key of AGENT_DEFAULT_EXTRA_KEYS) {
    if (AGENT_DEFAULT_MANAGED_KEYS.has(key)) continue;
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue;
    extra[key] = cloneJsonValue(defaults[key]);
  }
  return Object.keys(extra).length ? extra : null;
}

function applyAgentDefaultExtra(
  defaults: Record<string, any>,
  value: unknown,
): void {
  for (const key of AGENT_DEFAULT_EXTRA_KEYS) {
    delete defaults[key];
  }
  const extra = cloneJsonObjectWithKeys(value, AGENT_DEFAULT_EXTRA_KEYS);
  if (!extra) return;
  for (const [key, entry] of Object.entries(extra)) {
    if (AGENT_DEFAULT_MANAGED_KEYS.has(key)) continue;
    defaults[key] = entry;
  }
}

function readSchemaExtra(
  value: unknown,
  allowedKeys: Set<string>,
): Record<string, unknown> | null {
  const source = cloneJsonObject(value);
  if (!source) return null;
  const extra: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;
    extra[key] = cloneJsonValue(source[key]);
  }
  return Object.keys(extra).length ? extra : null;
}

function applySchemaExtra(
  target: Record<string, any>,
  value: unknown,
  allowedKeys: Set<string>,
): void {
  for (const key of allowedKeys) {
    delete target[key];
  }
  const extra = cloneJsonObjectWithKeys(value, allowedKeys);
  if (!extra) return;
  for (const [key, entry] of Object.entries(extra)) {
    target[key] = entry;
  }
}

function readOpenClawExtraDomains(
  openclawConfig: Record<string, unknown>,
): Record<string, unknown> {
  const extraDomains: Record<string, unknown> = {};
  for (const key of OPENCLAW_EXTRA_DOMAIN_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(openclawConfig, key)) continue;
    extraDomains[key] = cloneJsonValue(openclawConfig[key]);
  }
  return extraDomains;
}

function applyOpenClawExtraDomains(
  openclawConfig: Record<string, any>,
  value: unknown,
): void {
  for (const key of OPENCLAW_EXTRA_DOMAIN_KEYS) {
    delete openclawConfig[key];
  }
  const extraDomains = cloneJsonObjectWithKeys(value, OPENCLAW_EXTRA_DOMAIN_KEYS);
  if (!extraDomains) return;
  for (const [key, entry] of Object.entries(extraDomains)) {
    openclawConfig[key] = entry;
  }
}

function pruneRecordToSchemaKeys(
  value: unknown,
  allowedKeys: Set<string>,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const target = value as Record<string, unknown>;
  for (const key of Object.keys(target)) {
    if (!allowedKeys.has(key)) delete target[key];
  }
}

function pruneCurrentSchemaDomains(openclawConfig: Record<string, any>): void {
  pruneRecordToSchemaKeys(openclawConfig, ROOT_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.gateway, GATEWAY_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.acp, ACP_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.session, SESSION_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.messages, MESSAGES_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.tools, TOOLS_SCHEMA_KEYS);
  pruneRecordToSchemaKeys(openclawConfig.commands, COMMAND_SCHEMA_KEYS);
}

function ensureRecordObject(
  target: Record<string, any>,
  key: string,
): Record<string, any> {
  const current = target[key];
  if (current && typeof current === "object" && !Array.isArray(current)) {
    return current as Record<string, any>;
  }
  const next: Record<string, any> = {};
  target[key] = next;
  return next;
}

function deleteRecordFieldIfEmpty(
  target: Record<string, any>,
  key: string,
): void {
  const current = target[key];
  if (!current || typeof current !== "object" || Array.isArray(current)) {
    return;
  }
  if (Object.keys(current).length === 0) {
    delete target[key];
  }
}

type AgentDefaultModelRegistryEntry = {
  alias?: string;
  params?: Record<string, unknown>;
  agentRuntime?: {
    id?: string;
  };
  streaming?: boolean;
};

function cloneAgentDefaultModelRegistry(
  value: unknown,
): Record<string, AgentDefaultModelRegistryEntry> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries: Array<[string, AgentDefaultModelRegistryEntry]> = [];
  for (const [modelId, rawEntry] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry))
      continue;
    const entry = rawEntry as Record<string, unknown>;
    const nextEntry: AgentDefaultModelRegistryEntry = {};
    if (typeof entry.alias === "string") {
      nextEntry.alias = entry.alias.trim();
    }
    const params = cloneJsonObject(entry.params);
    if (params) nextEntry.params = params;
    if (
      entry.agentRuntime &&
      typeof entry.agentRuntime === "object" &&
      !Array.isArray(entry.agentRuntime)
    ) {
      const agentRuntimeId = normalizeString(
        (entry.agentRuntime as Record<string, unknown>).id,
      );
      if (agentRuntimeId) {
        nextEntry.agentRuntime = { id: agentRuntimeId };
      }
    }
    if (typeof entry.streaming === "boolean") {
      nextEntry.streaming = entry.streaming;
    }
    entries.push([modelId, nextEntry]);
  }
  return Object.fromEntries(entries);
}

function normalizeAgentDefaultModelRegistry(
  value: unknown,
): Record<string, unknown> | undefined {
  const cloned = cloneAgentDefaultModelRegistry(value);
  return cloned || undefined;
}

function readModelConfig(value: unknown): {
  primary: string;
  fallbacks: string[];
} {
  if (typeof value === "string") {
    return { primary: value.trim(), fallbacks: [] };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { primary: "", fallbacks: [] };
  }
  const model = value as Record<string, unknown>;
  return {
    primary: normalizeString(model.primary),
    fallbacks: normalizeStringList(model.fallbacks),
  };
}

function normalizeAgentModelConfigInput(
  value: unknown,
  existing: unknown,
  fallbackPrimary = "",
): Record<string, unknown> | undefined {
  if (typeof value === "string" && !value.trim()) {
    return undefined;
  }
  const current =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? (existing as Record<string, unknown>)
      : {};
  const currentConfig = readModelConfig(current);
  const nextConfig = readModelConfig(value);
  const next: Record<string, unknown> = cloneJsonObject(current) || {};
  const primary = normalizeString(
    nextConfig.primary,
    currentConfig.primary || fallbackPrimary,
  );
  const fallbacks = normalizeStringList(nextConfig.fallbacks).filter(
    (model) => model !== primary,
  );
  if (!primary && fallbacks.length === 0) {
    return undefined;
  }
  if (primary) next.primary = primary;
  else delete next.primary;
  if (fallbacks.length > 0) next.fallbacks = fallbacks;
  else delete next.fallbacks;
  return next;
}

function resolveAgentModelFallbackInput(
  modelInput: unknown,
  legacyFallbackInput: unknown,
  primary: string,
): string[] {
  if (
    modelInput &&
    typeof modelInput === "object" &&
    !Array.isArray(modelInput)
  ) {
    const inlineFallbacks = normalizeStringList(
      (modelInput as Record<string, unknown>).fallbacks,
    );
    if (Object.prototype.hasOwnProperty.call(modelInput, "fallbacks")) {
      return inlineFallbacks.filter((model) => model !== primary);
    }
  }
  return normalizeStringList(legacyFallbackInput).filter(
    (model) => model !== primary,
  );
}

function normalizeOptionalNonNegativeNumberField(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    target[key] = Math.floor(value);
  } else {
    delete target[key];
  }
}

function setOptionalStringField(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  const normalized = normalizeString(value);
  if (normalized) target[key] = normalized;
  else delete target[key];
}

function setOptionalStringListField(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  const normalized = normalizeStringList(value);
  if (normalized.length) target[key] = normalized;
  else delete target[key];
}

function setOptionalPositiveNumberField(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    target[key] = Math.floor(value);
  } else {
    delete target[key];
  }
}

function setOptionalNonNegativeNumberField(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    target[key] = Math.floor(value);
  } else {
    delete target[key];
  }
}

function clampHour(value: unknown, fallback = 4): number {
  const parsed = normalizeNumber(value, fallback, 0);
  return Math.min(23, parsed);
}

function normalizePositiveNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return null;
}

function resolveProviderBaseUrl(
  providerId: string,
  api: unknown,
  candidate: unknown,
): string {
  const explicit = normalizeString(candidate);
  if (explicit) return explicit;
  const normalizedProviderId = providerId.toLowerCase();
  if (normalizedProviderId === "openai") return "https://api.openai.com/v1";
  if (normalizedProviderId === "anthropic") return "https://api.anthropic.com";
  if (normalizedProviderId === "google" || normalizedProviderId === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  const apiKey = normalizeProviderApi(api).toLowerCase();
  const byApi = DEFAULT_PROVIDER_BASE_URL_BY_API[apiKey];
  if (byApi) return byApi;
  return "";
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return value === true ? true : value === false ? false : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function summarizeBooleanOrAuto(value: unknown, fallback = "auto"): string {
  if (value === true) return "true";
  if (value === false) return "false";
  const normalized = normalizeString(value, fallback);
  if (normalized === "true" || normalized === "on") return "true";
  if (normalized === "false" || normalized === "off") return "false";
  return normalized === "auto" ? "auto" : fallback;
}

function normalizeBooleanOrAuto(value: unknown, existing: unknown): boolean | "auto" {
  if (value === true || value === "true" || value === "on") return true;
  if (value === false || value === "false" || value === "off") return false;
  if (value === "auto") return "auto";
  return normalizeBooleanOrAuto(existing, "auto");
}

function hasDockerCommand(): boolean {
  const result = spawnSync("docker", ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

function normalizeSandboxBackend(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function sandboxNeedsDocker(
  sandboxConfig: Record<string, any> | null | undefined,
  inheritedBackend: unknown = "",
): boolean {
  const mode = normalizeString(sandboxConfig?.mode).toLowerCase();
  if (!mode || mode === "off") return false;
  const backend = normalizeSandboxBackend(
    sandboxConfig?.backend || inheritedBackend,
  );
  return !NON_DOCKER_SANDBOX_BACKENDS.has(backend);
}

function normalizeInputs(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((value) => String(value || "").trim()).filter(Boolean);
  }
  if (typeof input === "string" && input.trim()) {
    return input
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return [];
}

function maskToken(token: unknown): string {
  if (typeof token !== "string" || !token.trim()) return "";
  const trimmed = token.trim();
  if (trimmed.length <= 4) return "••••";
  return "••••••" + trimmed.slice(-4);
}

function normalizeResetMode(value: unknown): string {
  const normalized = normalizeString(value);
  return normalized === "daily" || normalized === "idle" ? normalized : "";
}

function summarizeResetOverrideMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const entries: Array<[string, string]> = [];
  for (const [key, config] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const mode =
      typeof config === "string"
        ? normalizeResetMode(config)
        : normalizeResetMode((config as Record<string, unknown>)?.mode);
    if (!mode) continue;
    entries.push([String(key), mode]);
  }
  return Object.fromEntries(entries);
}

function buildResetOverrideMap(
  value: unknown,
): Record<string, { mode: "daily" | "idle" }> {
  if (!value || typeof value !== "object") return {};
  const entries: Array<[string, { mode: "daily" | "idle" }]> = [];
  for (const [key, modeValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const mode = normalizeResetMode(modeValue);
    if (mode !== "daily" && mode !== "idle") continue;
    entries.push([String(key), { mode }]);
  }
  return Object.fromEntries(entries);
}

function mapChannelAccount(
  account: Record<string, unknown>,
): ConfigChannelAccountSummary {
  const token = account.token;
  const { token: _omit, ...rest } = account;
  return {
    ...rest,
    enabled: account.enabled !== false,
    hasToken: typeof token === "string" && token.trim().length > 0,
    maskedToken: maskToken(token),
  } as ConfigChannelAccountSummary;
}

function deepMerge(
  target: Record<string, any>,
  source: Record<string, any>,
): Record<string, any> {
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] !== null &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

function mapProviderModel(
  rawModel: unknown,
): ConfigProviderModelSummary | null {
  if (typeof rawModel === "string") {
    const id = rawModel.trim();
    if (!id) return null;
    return {
      id,
      input: [],
      reasoning: false,
      contextWindow: null,
      maxTokens: null,
      extra: null,
    };
  }

  if (!rawModel || typeof rawModel !== "object") return null;
  const model = rawModel as Record<string, unknown>;
  const id = String(model.id || "").trim();
  if (!id) return null;

  return {
    id,
    input: normalizeInputs(model.input),
    reasoning: model.reasoning === true,
    contextWindow: Number.isFinite(Number(model.contextWindow))
      ? Number(model.contextWindow)
      : null,
    maxTokens: Number.isFinite(Number(model.maxTokens))
      ? Number(model.maxTokens)
      : null,
    extra: cloneJsonObjectWithoutKeys(model, PROVIDER_MODEL_MANAGED_KEYS),
  };
}

function mapProvider(
  providerId: string,
  rawProvider: Record<string, unknown>,
): ConfigProviderSummary {
  const models = Array.isArray(rawProvider.models)
    ? rawProvider.models
        .map((model) => mapProviderModel(model))
        .filter((model): model is ConfigProviderModelSummary => model !== null)
    : [];

  return {
    id: providerId,
    api: typeof rawProvider.api === "string" ? rawProvider.api : null,
    baseUrl:
      typeof rawProvider.baseUrl === "string" ? rawProvider.baseUrl : null,
    hasApiKey:
      typeof rawProvider.apiKey === "string" &&
      rawProvider.apiKey.trim().length > 0,
    modelCount: models.length,
    models,
    extra: cloneJsonObjectWithoutKeys(rawProvider, PROVIDER_MANAGED_KEYS),
  };
}

function buildSummary(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload {
  const defaults = openclawConfig.agents?.defaults || {};
  const modelConfig = readModelConfig(defaults.model);
  const imageModelConfig = readModelConfig(defaults.imageModel);
  const imageGenerationModelConfig = readModelConfig(
    defaults.imageGenerationModel,
  );
  const videoGenerationModelConfig = readModelConfig(
    defaults.videoGenerationModel,
  );
  const musicGenerationModelConfig = readModelConfig(
    defaults.musicGenerationModel,
  );
  const pdfModelConfig = readModelConfig(defaults.pdfModel);
  const execApprovals = readJsonFile<Record<string, any>>(
    `${config.openclawRoot}/exec-approvals.json`,
    { socket: {}, defaults: {}, agents: {} },
  );
  const availableAgentIds = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
        .map((agent: Record<string, any>) => String(agent.id || "").trim())
        .filter(Boolean)
        .sort()
    : [];
  const providers = Object.entries(openclawConfig.models?.providers || {})
    .map(([providerId, provider]) =>
      mapProvider(providerId, provider as Record<string, unknown>),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
  const pluginEntries = Object.entries(openclawConfig.plugins?.entries || {})
    .map(([id, entry]) => ({
      id,
      enabled: (entry as Record<string, unknown>).enabled !== false,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    checkedAt: new Date().toISOString(),
    defaults: {
      model: modelConfig.primary,
      modelFallback: modelConfig.fallbacks,
      imageModel: imageModelConfig.primary,
      imageModelFallback: imageModelConfig.fallbacks,
      imageGenerationModel: imageGenerationModelConfig.primary,
      imageGenerationModelFallback: imageGenerationModelConfig.fallbacks,
      videoGenerationModel: videoGenerationModelConfig.primary,
      videoGenerationModelFallback: videoGenerationModelConfig.fallbacks,
      musicGenerationModel: musicGenerationModelConfig.primary,
      musicGenerationModelFallback: musicGenerationModelConfig.fallbacks,
      mediaGenerationAutoProviderFallback:
        defaults.mediaGenerationAutoProviderFallback !== false,
      pdfModel: pdfModelConfig.primary,
      pdfModelFallback: pdfModelConfig.fallbacks,
      thinking: String(defaults.thinkingDefault || "").trim(),
      verbose: String(defaults.verboseDefault || "").trim(),
      timeoutSeconds: Number(defaults.timeoutSeconds || 600),
      maxConcurrent: Number(defaults.maxConcurrent || 8),
      subagentMaxConcurrent: Number(defaults.subagents?.maxConcurrent || 16),
      subagentModel: String(defaults.subagents?.model || "").trim(),
      subagentThinking: String(defaults.subagents?.thinking || "").trim(),
      subagentRunTimeoutSeconds: Number.isFinite(
        Number(defaults.subagents?.runTimeoutSeconds),
      )
        ? Number(defaults.subagents?.runTimeoutSeconds)
        : null,
      subagentMaxSpawnDepth: Number.isFinite(
        Number(defaults.subagents?.maxSpawnDepth),
      )
        ? Number(defaults.subagents?.maxSpawnDepth)
        : null,
      subagentMaxChildrenPerAgent: Number.isFinite(
        Number(defaults.subagents?.maxChildrenPerAgent),
      )
        ? Number(defaults.subagents?.maxChildrenPerAgent)
        : null,
      subagentArchiveAfterMinutes: Number.isFinite(
        Number(defaults.subagents?.archiveAfterMinutes),
      )
        ? Number(defaults.subagents?.archiveAfterMinutes)
        : null,
      subagentAnnounceTimeoutMs: Number.isFinite(
        Number(defaults.subagents?.announceTimeoutMs),
      )
        ? Number(defaults.subagents?.announceTimeoutMs)
        : null,
      workspace: String(defaults.workspace || "").trim(),
      repoRoot: String(defaults.repoRoot || "").trim(),
      skipBootstrap: defaults.skipBootstrap === true,
      bootstrapMaxChars: Number.isFinite(Number(defaults.bootstrapMaxChars))
        ? Number(defaults.bootstrapMaxChars)
        : null,
      bootstrapTotalMaxChars: Number.isFinite(
        Number(defaults.bootstrapTotalMaxChars),
      )
        ? Number(defaults.bootstrapTotalMaxChars)
        : null,
      systemPromptOverride: String(defaults.systemPromptOverride || "").trim(),
      skills: Array.isArray(defaults.skills)
        ? defaults.skills
            .map(String)
            .map((value: string) => value.trim())
            .filter(Boolean)
        : [],
      contextInjection: String(defaults.contextInjection || "").trim(),
      bootstrapPromptTruncationWarning: String(
        defaults.bootstrapPromptTruncationWarning || "",
      ).trim(),
      userTimezone: String(defaults.userTimezone || "").trim(),
      timeFormat: String(defaults.timeFormat || "").trim(),
      envelopeTimezone: String(defaults.envelopeTimezone || "").trim(),
      envelopeTimestamp: String(defaults.envelopeTimestamp || "").trim(),
      envelopeElapsed: String(defaults.envelopeElapsed || "").trim(),
      contextTokens: Number.isFinite(Number(defaults.contextTokens))
        ? Number(defaults.contextTokens)
        : null,
      typingMode: String(defaults.typingMode || "").trim(),
      elevated: String(defaults.elevatedDefault || "").trim(),
      blockStreaming: String(defaults.blockStreamingDefault || "").trim(),
      blockStreamingBreak: String(defaults.blockStreamingBreak || "").trim(),
      blockStreamingChunk: cloneJsonObject(defaults.blockStreamingChunk),
      blockStreamingCoalesce: cloneJsonObject(defaults.blockStreamingCoalesce),
      mediaMaxMb: Number.isFinite(Number(defaults.mediaMaxMb))
        ? Number(defaults.mediaMaxMb)
        : null,
      imageMaxDimensionPx: Number.isFinite(Number(defaults.imageMaxDimensionPx))
        ? Number(defaults.imageMaxDimensionPx)
        : null,
      typingIntervalSeconds: Number.isFinite(
        Number(defaults.typingIntervalSeconds),
      )
        ? Number(defaults.typingIntervalSeconds)
        : null,
      pdfMaxBytesMb: Number.isFinite(Number(defaults.pdfMaxBytesMb))
        ? Number(defaults.pdfMaxBytesMb)
        : null,
      pdfMaxPages: Number.isFinite(Number(defaults.pdfMaxPages))
        ? Number(defaults.pdfMaxPages)
        : null,
      embeddedAgentProjectSettingsPolicy: String(
        defaults.embeddedAgent?.projectSettingsPolicy ||
          defaults.embeddedPi?.projectSettingsPolicy ||
          "sanitize",
      ).trim(),
      embeddedAgentExecutionContract: String(
        defaults.embeddedAgent?.executionContract || "default",
      ).trim(),
      memorySearch: cloneJsonObject(defaults.memorySearch),
      humanDelay: cloneJsonObject(defaults.humanDelay),
      heartbeat: cloneJsonObject(defaults.heartbeat),
      params: cloneJsonObject(defaults.params),
      cliBackends: cloneJsonObject(defaults.cliBackends),
      contextPruning: cloneJsonObject(defaults.contextPruning),
      models: cloneAgentDefaultModelRegistry(defaults.models) || {},
      extra: readAgentDefaultExtra(defaults),
    },
    compaction: {
      mode: String(defaults.compaction?.mode || "safeguard").trim(),
      reserveTokensFloor: Number(
        defaults.compaction?.reserveTokensFloor || 20000,
      ),
      identifierPolicy: String(
        defaults.compaction?.identifierPolicy || "strict",
      ).trim(),
      identifierInstructions: String(
        defaults.compaction?.identifierInstructions || "",
      ).trim(),
      postCompactionSections: Array.isArray(
        defaults.compaction?.postCompactionSections,
      )
        ? defaults.compaction.postCompactionSections.map(String)
        : [],
      model: String(defaults.compaction?.model || "").trim(),
      memoryFlush: {
        enabled: defaults.compaction?.memoryFlush?.enabled !== false,
        softThresholdTokens: Number(
          defaults.compaction?.memoryFlush?.softThresholdTokens || 4000,
        ),
      },
    },
    sandbox: {
      mode: String(defaults.sandbox?.mode || "off").trim(),
      workspaceAccess: String(defaults.sandbox?.workspaceAccess || "rw").trim(),
      scope: String(defaults.sandbox?.scope || "session").trim(),
      sessionToolsVisibility: String(
        defaults.sandbox?.sessionToolsVisibility || "spawned",
      ).trim(),
      prune: {
        idleHours: Number(defaults.sandbox?.prune?.idleHours || 24),
        maxAgeDays: Number(defaults.sandbox?.prune?.maxAgeDays || 7),
      },
    },
    tools: {
      profile: String(openclawConfig.tools?.profile || "full").trim(),
      elevatedEnabled: openclawConfig.tools?.elevated?.enabled !== false,
      execHost: String(openclawConfig.tools?.exec?.host || "auto").trim(),
      execMode: String(openclawConfig.tools?.exec?.mode || "").trim(),
      execNode: String(openclawConfig.tools?.exec?.node || "").trim(),
      execAsk: String(openclawConfig.tools?.exec?.ask || "off").trim(),
      execSecurity: String(
        openclawConfig.tools?.exec?.security || "full",
      ).trim(),
      execTimeoutSec: Number(openclawConfig.tools?.exec?.timeoutSec || 45),
      fsWorkspaceOnly: openclawConfig.tools?.fs?.workspaceOnly === true,
      extra: readSchemaExtra(openclawConfig.tools, TOOLS_EXTRA_KEYS),
    },
    execApprovals: {
      socketPath: String(execApprovals.socket?.path || "").trim(),
      availableAgentIds,
      defaults: {
        security: String(execApprovals.defaults?.security || "deny").trim(),
        ask: String(execApprovals.defaults?.ask || "on-miss").trim(),
        askFallback: String(
          execApprovals.defaults?.askFallback || "deny",
        ).trim(),
        autoAllowSkills: execApprovals.defaults?.autoAllowSkills === true,
      },
      agents: Object.entries(execApprovals.agents || {})
        .map(([agentId, agent]) => ({
          agentId,
          security: String(
            (agent as Record<string, any>).security || "",
          ).trim(),
          ask: String((agent as Record<string, any>).ask || "").trim(),
          askFallback: String(
            (agent as Record<string, any>).askFallback || "",
          ).trim(),
          autoAllowSkills:
            (agent as Record<string, any>).autoAllowSkills === true,
          allowlistCount: Array.isArray(
            (agent as Record<string, any>).allowlist,
          )
            ? (agent as Record<string, any>).allowlist.length
            : 0,
          allowlist: Array.isArray((agent as Record<string, any>).allowlist)
            ? (agent as Record<string, any>).allowlist.map(
                (entry: Record<string, any>) => ({
                  pattern: String(entry.pattern || "").trim(),
                  lastUsedAt: Number(entry.lastUsedAt || 0),
                  lastUsedCommand: String(entry.lastUsedCommand || "").trim(),
                  lastResolvedPath: String(entry.lastResolvedPath || "").trim(),
                }),
              )
            : [],
        }))
        .sort((left, right) => left.agentId.localeCompare(right.agentId)),
    },
    session: {
      dmScope: String(
        openclawConfig.session?.dmScope || "per-channel-peer",
      ).trim(),
      threadBindings: {
        enabled: openclawConfig.session?.threadBindings?.enabled === true,
        idleHours: Number(
          openclawConfig.session?.threadBindings?.idleHours || 24,
        ),
        maxAgeHours: Number(
          openclawConfig.session?.threadBindings?.maxAgeHours || 0,
        ),
      },
      extra: readSchemaExtra(openclawConfig.session, SESSION_EXTRA_KEYS),
    },
    messages: {
      responsePrefix: String(
        openclawConfig.messages?.responsePrefix || "",
      ).trim(),
      ackReaction: String(openclawConfig.messages?.ackReaction || "").trim(),
      ackReactionScope: String(
        openclawConfig.messages?.ackReactionScope || "group-mentions",
      ).trim(),
      removeAckAfterReply:
        openclawConfig.messages?.removeAckAfterReply === true,
      queue: {
        mode: String(openclawConfig.messages?.queue?.mode || "collect").trim(),
        debounceMs: Number(openclawConfig.messages?.queue?.debounceMs || 1000),
        cap: Number(openclawConfig.messages?.queue?.cap || 20),
        drop: String(
          openclawConfig.messages?.queue?.drop || "summarize",
        ).trim(),
        byChannel:
          typeof openclawConfig.messages?.queue?.byChannel === "object" &&
          openclawConfig.messages?.queue?.byChannel
            ? Object.fromEntries(
                Object.entries(openclawConfig.messages.queue.byChannel).map(
                  ([channelId, mode]) => [String(channelId), String(mode)],
                ),
              )
            : {},
      },
      extra: readSchemaExtra(openclawConfig.messages, MESSAGES_EXTRA_KEYS),
    },
    providers,
    pluginEntries,
    skillEntriesCount: Object.keys(openclawConfig.skills?.entries || {}).length,
    gateway: buildGatewaySummary(openclawConfig),
    channels: buildChannelsSummary(openclawConfig),
    sessionReset: buildSessionResetSummary(openclawConfig),
    hooks: buildHooksSummary(openclawConfig),
    commands: buildCommandsSummary(openclawConfig),
    mcp: buildMcpSummary(openclawConfig),
    skills: buildSkillsSummary(openclawConfig),
    acp: buildAcpSummary(openclawConfig),
    plugins: buildPluginsSummary(openclawConfig),
    browser: buildBrowserSummary(openclawConfig),
    logging: buildLoggingSummary(openclawConfig),
    openclaw: {
      extraDomains: readOpenClawExtraDomains(openclawConfig),
      extraDomainKeys: Array.from(OPENCLAW_EXTRA_DOMAIN_KEYS).sort(),
    },
  };
}

function buildGatewaySummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["gateway"] {
  const gw = openclawConfig.gateway || {};
  const auth = gw.auth || {};
  const rateLimit = auth.rateLimit || {};
  const controlUi = gw.controlUi || {};
  return {
    port: normalizeNumber(gw.port, 31879, 1),
    mode: normalizeString(gw.mode, "local"),
    bind: normalizeString(gw.bind, "loopback"),
    customBindHost: normalizeString(gw.customBindHost) || undefined,
    auth: {
      mode: normalizeString(auth.mode, "token"),
      hasToken: hasConfiguredSecretInput(auth.token),
      hasPassword:
        hasConfiguredSecretInput(auth.password),
      allowTailscale: auth.allowTailscale !== false,
      trustedProxy:
        auth.trustedProxy && typeof auth.trustedProxy === "object"
          ? {
              userHeader: normalizeString(auth.trustedProxy.userHeader),
              requiredHeaders: normalizeStringList(
                auth.trustedProxy.requiredHeaders,
              ),
              allowUsers: normalizeStringList(auth.trustedProxy.allowUsers),
            }
          : undefined,
      rateLimit: {
        maxAttempts: normalizeNumber(rateLimit.maxAttempts, 10, 1),
        windowMs: normalizeNumber(rateLimit.windowMs, 60000, 1000),
        lockoutMs: normalizeNumber(rateLimit.lockoutMs, 600000, 0),
        exemptLoopback: rateLimit.exemptLoopback !== false,
      },
    },
    controlUi: {
      enabled:
        controlUi.enabled != null ? controlUi.enabled !== false : undefined,
      basePath: normalizeString(controlUi.basePath) || undefined,
      root: normalizeString(controlUi.root) || undefined,
      embedSandbox: normalizeString(controlUi.embedSandbox) || undefined,
      allowExternalEmbedUrls:
        controlUi.allowExternalEmbedUrls != null
          ? controlUi.allowExternalEmbedUrls === true
          : undefined,
      chatMessageMaxWidth:
        normalizeString(controlUi.chatMessageMaxWidth) || undefined,
      allowedOrigins: normalizeStringList(controlUi.allowedOrigins),
      dangerouslyAllowHostHeaderOriginFallback:
        controlUi.dangerouslyAllowHostHeaderOriginFallback === true,
      allowInsecureAuth: controlUi.allowInsecureAuth === true,
      dangerouslyDisableDeviceAuth:
        controlUi.dangerouslyDisableDeviceAuth === true,
    },
    trustedProxies: normalizeStringList(gw.trustedProxies),
    allowRealIpFallback:
      gw.allowRealIpFallback != null
        ? gw.allowRealIpFallback === true
        : undefined,
    tools:
      gw.tools && typeof gw.tools === "object"
        ? {
            allow: normalizeStringList(gw.tools.allow),
            deny: normalizeStringList(gw.tools.deny),
          }
        : undefined,
    handshakeTimeoutMs:
      gw.handshakeTimeoutMs != null
        ? normalizeNumber(gw.handshakeTimeoutMs, 0, 1)
        : null,
    channelHealthCheckMinutes:
      gw.channelHealthCheckMinutes != null
        ? normalizeNumber(gw.channelHealthCheckMinutes, 0, 0)
        : null,
    channelStaleEventThresholdMinutes:
      gw.channelStaleEventThresholdMinutes != null
        ? normalizeNumber(gw.channelStaleEventThresholdMinutes, 0, 1)
        : null,
    channelMaxRestartsPerHour:
      gw.channelMaxRestartsPerHour != null
        ? normalizeNumber(gw.channelMaxRestartsPerHour, 0, 1)
        : null,
    tailscale: {
      mode: normalizeString(gw.tailscale?.mode, "off"),
    },
    extra: readSchemaExtra(gw, GATEWAY_EXTRA_KEYS),
  };
}

function buildChannelsSummary(
  openclawConfig: Record<string, any>,
): Record<string, any> {
  const channels = openclawConfig.channels || {};
  const result: Record<string, any> = {};
  for (const [channelId, channel] of Object.entries(channels)) {
    const ch = channel as Record<string, any>;
    const accounts: Record<string, ConfigChannelAccountSummary> = {};
    if (ch.accounts && typeof ch.accounts === "object") {
      for (const [accountId, account] of Object.entries(ch.accounts)) {
        accounts[accountId] = mapChannelAccount(
          account as Record<string, unknown>,
        );
      }
    }
    const { accounts: _omitAccounts, ...channelRest } = ch;
    const rawThreadBindings =
      ch.threadBindings &&
      typeof ch.threadBindings === "object" &&
      !Array.isArray(ch.threadBindings)
        ? (ch.threadBindings as Record<string, unknown>)
        : null;
    const threadBindingRest = rawThreadBindings
      ? (() => {
          const {
            spawnSubagentSessions: _legacySubagent,
            spawnAcpSessions: _legacyAcp,
            ...rest
          } = rawThreadBindings;
          return rest;
        })()
      : null;
    result[channelId] = {
      ...channelRest,
      enabled: ch.enabled !== false,
      groupPolicy: normalizeString(ch.groupPolicy, "allowlist"),
      streaming: normalizeString(ch.streaming, "partial"),
      ...(rawThreadBindings
        ? {
            threadBindings: {
              ...(threadBindingRest || {}),
              enabled: rawThreadBindings.enabled === true,
              idleHours: normalizeNumber(rawThreadBindings.idleHours, 24, 1),
              maxAgeHours: normalizeNumber(rawThreadBindings.maxAgeHours, 0, 0),
              spawnSessions:
                rawThreadBindings.spawnSessions === true ||
                rawThreadBindings.spawnSubagentSessions === true ||
                rawThreadBindings.spawnAcpSessions === true,
            },
          }
        : {}),
      accounts,
    };
  }
  return result;
}

function buildSessionResetSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["sessionReset"] {
  const session = openclawConfig.session || {};
  const reset = session.reset || {};
  const mode = normalizeResetMode(reset.mode) || "idle";
  const atHour =
    typeof reset.atHour === "number" && Number.isFinite(reset.atHour)
      ? clampHour(reset.atHour, 4)
      : null;
  const idleMinutes = normalizePositiveNumberOrNull(reset.idleMinutes);
  return {
    mode,
    atHour: mode === "daily" ? (atHour ?? 4) : null,
    idleMinutes: mode === "idle" ? (idleMinutes ?? 60) : null,
    resetByType: summarizeResetOverrideMap(session.resetByType),
    resetByChannel: summarizeResetOverrideMap(session.resetByChannel),
  };
}

function buildHooksSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["hooks"] {
  const hooks = openclawConfig.hooks || {};
  const internal = hooks.internal || {};
  const entries: Record<string, { enabled: boolean; [key: string]: unknown }> =
    {};
  if (internal.entries && typeof internal.entries === "object") {
    for (const [entryId, entry] of Object.entries(internal.entries)) {
      const e = entry as Record<string, unknown>;
      entries[entryId] = { ...e, enabled: e.enabled !== false };
    }
  }
  return {
    internal: {
      enabled: internal.enabled !== false,
      entries,
    },
  };
}

function buildCommandsSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["commands"] {
  const commands = openclawConfig.commands || {};
  return {
    native: summarizeBooleanOrAuto(commands.native, "auto"),
    nativeSkills: summarizeBooleanOrAuto(commands.nativeSkills, "auto"),
    text: commands.text === true,
    bash: commands.bash === true,
    bashForegroundMs: Number.isFinite(Number(commands.bashForegroundMs))
      ? Number(commands.bashForegroundMs)
      : null,
    config: commands.config === true,
    mcp: commands.mcp === true,
    plugins: commands.plugins === true,
    debug: commands.debug === true,
    restart: commands.restart !== false,
    ownerDisplay: normalizeString(commands.ownerDisplay, "raw"),
    extra: readSchemaExtra(commands, COMMAND_EXTRA_KEYS),
  };
}

function buildMcpSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["mcp"] {
  const mcp = openclawConfig.mcp;
  if (!mcp || typeof mcp !== "object") return undefined;
  return {
    sessionIdleTtlMs:
      mcp.sessionIdleTtlMs != null
        ? normalizeNumber(mcp.sessionIdleTtlMs, 0, 0)
        : null,
    servers:
      mcp.servers && typeof mcp.servers === "object" && !Array.isArray(mcp.servers)
        ? cloneJsonObject(mcp.servers) || {}
        : {},
  };
}

function buildSkillsSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["skills"] {
  const skills = openclawConfig.skills;
  if (!skills || typeof skills !== "object") return undefined;
  const load = skills.load && typeof skills.load === "object" ? skills.load : {};
  const install =
    skills.install && typeof skills.install === "object" ? skills.install : {};
  const limits =
    skills.limits && typeof skills.limits === "object" ? skills.limits : {};
  return {
    allowBundled: Array.isArray(skills.allowBundled)
      ? normalizeStringList(skills.allowBundled)
      : undefined,
    load: {
      extraDirs: normalizeStringList(load.extraDirs),
      watch: load.watch != null ? load.watch === true : undefined,
      watchDebounceMs:
        load.watchDebounceMs != null
          ? normalizeNumber(load.watchDebounceMs, 0, 0)
          : null,
      allowSymlinkTargets:
        load.allowSymlinkTargets != null
          ? load.allowSymlinkTargets === true
          : undefined,
    },
    install: {
      preferBrew:
        install.preferBrew != null ? install.preferBrew === true : undefined,
      nodeManager: normalizeSkillNodeManager(install.nodeManager) || undefined,
      allowUploadedArchives:
        install.allowUploadedArchives != null
          ? install.allowUploadedArchives === true
          : undefined,
    },
    limits: {
      maxCandidatesPerRoot:
        limits.maxCandidatesPerRoot != null
          ? normalizeNumber(limits.maxCandidatesPerRoot, 1, 1)
          : null,
      maxSkillsLoadedPerSource:
        limits.maxSkillsLoadedPerSource != null
          ? normalizeNumber(limits.maxSkillsLoadedPerSource, 1, 1)
          : null,
      maxSkillsInPrompt:
        limits.maxSkillsInPrompt != null
          ? normalizeNumber(limits.maxSkillsInPrompt, 0, 0)
          : null,
      maxSkillsPromptChars:
        limits.maxSkillsPromptChars != null
          ? normalizeNumber(limits.maxSkillsPromptChars, 0, 0)
          : null,
      maxSkillFileBytes:
        limits.maxSkillFileBytes != null
          ? normalizeNumber(limits.maxSkillFileBytes, 0, 0)
          : null,
    },
    entries:
      skills.entries && typeof skills.entries === "object" && !Array.isArray(skills.entries)
        ? cloneJsonObject(skills.entries) || {}
        : {},
  };
}

function buildAcpSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["acp"] {
  const acp = openclawConfig.acp;
  if (!acp || typeof acp !== "object") return undefined;
  return {
    enabled: acp.enabled === true,
    dispatch: acp.dispatch
      ? { enabled: acp.dispatch?.enabled === true }
      : undefined,
    backend: normalizeString(acp.backend) || undefined,
    defaultAgent: normalizeString(acp.defaultAgent) || undefined,
    allowedAgents: Array.isArray(acp.allowedAgents)
      ? normalizeStringList(acp.allowedAgents)
      : undefined,
    maxConcurrentSessions:
      acp.maxConcurrentSessions != null
        ? normalizeNumber(acp.maxConcurrentSessions, 1, 1)
        : undefined,
    extra: readSchemaExtra(acp, ACP_EXTRA_KEYS),
  };
}

function buildPluginsSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["plugins"] {
  const plugins = openclawConfig.plugins;
  if (!plugins || typeof plugins !== "object") return undefined;
  const entries: Record<
    string,
    { enabled?: boolean; config?: Record<string, unknown> }
  > = {};
  if (plugins.entries && typeof plugins.entries === "object") {
    for (const [entryId, entry] of Object.entries(plugins.entries)) {
      const e = entry as Record<string, unknown>;
      const config =
        e.config && typeof e.config === "object"
          ? Object.fromEntries(
              Object.entries(e.config as Record<string, unknown>).filter(
                ([key]) =>
                  !key.toLowerCase().includes("secret") &&
                  !key.toLowerCase().includes("token"),
              ),
            )
          : undefined;
      entries[entryId] = {
        enabled: e.enabled !== false,
        ...(config && Object.keys(config).length > 0 ? { config } : {}),
      };
    }
  }
  const installs =
    plugins.installs && typeof plugins.installs === "object"
      ? Object.entries(plugins.installs)
          .map(([id, entry]) => {
            const install = entry as Record<string, unknown>;
            return {
              id: String(id),
              source: normalizeString(install.source) || undefined,
              spec: normalizeString(install.spec) || undefined,
              installPath: normalizeString(install.installPath) || undefined,
              version: normalizeString(install.version) || undefined,
              resolvedName: normalizeString(install.resolvedName) || undefined,
              resolvedVersion:
                normalizeString(install.resolvedVersion) || undefined,
              resolvedSpec: normalizeString(install.resolvedSpec) || undefined,
              installedAt: normalizeString(install.installedAt) || undefined,
            };
          })
          .sort((left, right) => left.id.localeCompare(right.id))
      : undefined;
  return {
    enabled: plugins.enabled != null ? plugins.enabled !== false : undefined,
    allow: Array.isArray(plugins.allow)
      ? normalizeStringList(plugins.allow)
      : undefined,
    deny: Array.isArray(plugins.deny)
      ? normalizeStringList(plugins.deny)
      : undefined,
    loadPaths: Array.isArray(plugins.load?.paths)
      ? normalizeStringList(plugins.load.paths)
      : Array.isArray(plugins.loadPaths)
        ? normalizeStringList(plugins.loadPaths)
        : undefined,
    slots:
      plugins.slots && typeof plugins.slots === "object"
        ? {
            memory: normalizeString(plugins.slots.memory) || undefined,
            contextEngine:
              normalizeString(plugins.slots.contextEngine) || undefined,
          }
        : undefined,
    installs: installs && installs.length > 0 ? installs : undefined,
    entries: Object.keys(entries).length > 0 ? entries : undefined,
  };
}

function buildBrowserSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["browser"] {
  const browser = openclawConfig.browser;
  if (!browser || typeof browser !== "object") return undefined;
  const profiles =
    browser.profiles && typeof browser.profiles === "object"
      ? Object.entries(browser.profiles)
          .map(([id, entry]) => {
            const profile = entry as Record<string, unknown>;
            return {
              id,
              driver: normalizeString(profile.driver) || undefined,
              attachOnly: profile.attachOnly === true ? true : undefined,
              cdpPort:
                profile.cdpPort != null
                  ? normalizeNumber(profile.cdpPort, 0, 0)
                  : null,
              cdpUrl: normalizeString(profile.cdpUrl) || undefined,
              userDataDir: normalizeString(profile.userDataDir) || undefined,
              color: normalizeString(profile.color) || undefined,
            };
          })
          .sort((left, right) => left.id.localeCompare(right.id))
      : undefined;
  return {
    enabled: browser.enabled != null ? browser.enabled !== false : undefined,
    evaluateEnabled:
      browser.evaluateEnabled != null
        ? browser.evaluateEnabled !== false
        : undefined,
    cdpUrl: normalizeString(browser.cdpUrl) || undefined,
    remoteCdpTimeoutMs:
      browser.remoteCdpTimeoutMs != null
        ? normalizeNumber(browser.remoteCdpTimeoutMs, 0, 0)
        : null,
    remoteCdpHandshakeTimeoutMs:
      browser.remoteCdpHandshakeTimeoutMs != null
        ? normalizeNumber(browser.remoteCdpHandshakeTimeoutMs, 0, 0)
        : null,
    localLaunchTimeoutMs:
      browser.localLaunchTimeoutMs != null
        ? normalizeNumber(browser.localLaunchTimeoutMs, 0, 0)
        : null,
    localCdpReadyTimeoutMs:
      browser.localCdpReadyTimeoutMs != null
        ? normalizeNumber(browser.localCdpReadyTimeoutMs, 0, 0)
        : null,
    actionTimeoutMs:
      browser.actionTimeoutMs != null
        ? normalizeNumber(browser.actionTimeoutMs, 0, 0)
        : null,
    defaultProfile: normalizeString(browser.defaultProfile) || undefined,
    attachOnly:
      browser.attachOnly != null ? browser.attachOnly === true : undefined,
    cdpPortRangeStart:
      browser.cdpPortRangeStart != null
        ? normalizeNumber(browser.cdpPortRangeStart, 0, 1)
        : null,
    executablePath: normalizeString(browser.executablePath) || undefined,
    headless: browser.headless != null ? browser.headless !== false : undefined,
    noSandbox:
      browser.noSandbox != null ? browser.noSandbox === true : undefined,
    extraArgs: Array.isArray(browser.extraArgs)
      ? normalizeStringList(browser.extraArgs)
      : undefined,
    color: normalizeString(browser.color) || undefined,
    snapshotDefaults:
      browser.snapshotDefaults && typeof browser.snapshotDefaults === "object"
        ? {
            mode: normalizeString(browser.snapshotDefaults.mode) || undefined,
          }
        : undefined,
    tabCleanup:
      browser.tabCleanup && typeof browser.tabCleanup === "object"
        ? {
            enabled:
              browser.tabCleanup.enabled != null
                ? browser.tabCleanup.enabled !== false
                : undefined,
            idleMinutes:
              browser.tabCleanup.idleMinutes != null
                ? normalizeNumber(browser.tabCleanup.idleMinutes, 0, 0)
                : null,
            maxTabsPerSession:
              browser.tabCleanup.maxTabsPerSession != null
                ? normalizeNumber(browser.tabCleanup.maxTabsPerSession, 0, 1)
                : null,
            sweepMinutes:
              browser.tabCleanup.sweepMinutes != null
                ? normalizeNumber(browser.tabCleanup.sweepMinutes, 0, 0)
                : null,
          }
        : undefined,
    ssrfPolicy:
      browser.ssrfPolicy && typeof browser.ssrfPolicy === "object"
        ? {
            dangerouslyAllowPrivateNetwork:
              (browser.ssrfPolicy.dangerouslyAllowPrivateNetwork ??
                browser.ssrfPolicy.allowPrivateNetwork) !== false,
            hostnameAllowlist: normalizeStringList(
              browser.ssrfPolicy.hostnameAllowlist,
            ),
            allowedHostnames: normalizeStringList(
              browser.ssrfPolicy.allowedHostnames,
            ),
          }
        : undefined,
    profiles,
  };
}

function buildLoggingSummary(
  openclawConfig: Record<string, any>,
): ConfigSummaryPayload["logging"] {
  const logging = openclawConfig.logging;
  if (!logging || typeof logging !== "object") return undefined;
  return {
    level: normalizeString(logging.level) || undefined,
    file: normalizeString(logging.file) || undefined,
    maxFileBytes:
      logging.maxFileBytes != null
        ? normalizeNumber(logging.maxFileBytes, 0, 0)
        : undefined,
    consoleLevel: normalizeString(logging.consoleLevel) || undefined,
    consoleStyle: normalizeString(logging.consoleStyle) || undefined,
    redactSensitive: normalizeString(logging.redactSensitive) || undefined,
  };
}

function buildConfigAuditSnapshot(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
): Record<string, unknown> {
  const deviceTrust = readJsonFile<Record<string, unknown>>(
    path.join(config.openclawRoot, "tracevane", "device-trust.json"),
    {},
  );
  const resolvedBasePath = normalizeString(
    openclawConfig.gateway?.controlUi?.basePath,
    config.transport.gateway.basePath || "/tracevane",
  );

  return {
    transport: {
      gateway: {
        basePath: resolvedBasePath,
      },
    },
    deviceTrust: {
      autoApproveLocalHelper: deviceTrust.autoApproveLocalHelper !== false,
    },
  };
}

function normalizeProviderInput(
  provider: ConfigProviderInput,
  existing: Record<string, any> | undefined,
): Record<string, unknown> {
  const providerId = normalizeString(
    provider.id,
    normalizeString(existing?.id, "provider"),
  );
  const existingProvider = cloneJsonObject(existing) || {};
  const nextModels = Array.isArray(provider.models)
    ? provider.models.reduce<Array<Record<string, unknown>>>((items, model) => {
        const id = normalizeString(model.id);
        if (!id) return items;
        const input = normalizeStringList(model.input);
        const existingModel = Array.isArray(existing?.models)
          ? existing.models.find(
              (candidate: Record<string, unknown>) =>
                normalizeString(candidate.id) === id,
            )
          : null;
        const modelExtra =
          cloneJsonObjectWithoutKeys(
            (model as unknown as Record<string, unknown>).extra,
            PROVIDER_MODEL_MANAGED_KEYS,
          ) || {};
        const nextModel = {
          ...(cloneJsonObject(existingModel) || {}),
          ...modelExtra,
        };
        nextModel.id = id;
        const name = normalizeString(nextModel.name, id);
        nextModel.name = name || id;
        if (nextModel.api != null) {
          const normalizedModelApi = normalizeProviderApi(nextModel.api);
          if (normalizedModelApi) nextModel.api = normalizedModelApi;
          else delete nextModel.api;
        }
        if (nextModel.baseUrl != null && !normalizeString(nextModel.baseUrl)) {
          delete nextModel.baseUrl;
        }
        if (input.length > 0) nextModel.input = input;
        else delete nextModel.input;
        if (model.reasoning === true) nextModel.reasoning = true;
        else delete nextModel.reasoning;
        const contextWindow = normalizePositiveNumberOrNull(
          model.contextWindow,
        );
        if (contextWindow != null) nextModel.contextWindow = contextWindow;
        else delete nextModel.contextWindow;
        const maxTokens = normalizePositiveNumberOrNull(model.maxTokens);
        if (maxTokens != null) nextModel.maxTokens = maxTokens;
        else delete nextModel.maxTokens;
        items.push(nextModel);
        return items;
      }, [])
    : [];

  const apiKey = provider.apiKey;
  const providerExtra =
    cloneJsonObjectWithoutKeys(
      (provider as unknown as Record<string, unknown>).extra,
      PROVIDER_MANAGED_KEYS,
    ) || {};
  const nextProvider: Record<string, unknown> = {
    ...existingProvider,
    ...providerExtra,
  };
  const normalizedApi =
    normalizeProviderApi(provider.api) || normalizeProviderApi(existingProvider.api);
  if (normalizedApi) nextProvider.api = normalizedApi;
  else delete nextProvider.api;
  const resolvedBaseUrl = resolveProviderBaseUrl(
    providerId,
    normalizedApi,
    normalizeString(provider.baseUrl) || existingProvider.baseUrl,
  );
  if (resolvedBaseUrl) nextProvider.baseUrl = resolvedBaseUrl;
  else delete nextProvider.baseUrl;
  nextProvider.models = nextModels;

  if (typeof apiKey === "string") {
    const trimmed = apiKey.trim();
    if (trimmed) nextProvider.apiKey = trimmed;
  } else if (typeof existing?.apiKey === "string" && existing.apiKey.trim()) {
    nextProvider.apiKey = existing.apiKey;
  } else {
    delete nextProvider.apiKey;
  }

  return nextProvider;
}

function sanitizeCriticalConfigForHostSchema(
  openclawConfig: Record<string, any>,
): void {
  const defaults =
    openclawConfig.agents?.defaults &&
    typeof openclawConfig.agents.defaults === "object"
      ? (openclawConfig.agents.defaults as Record<string, any>)
      : null;
  if (defaults) {
    if (
      defaults.embeddedPi &&
      typeof defaults.embeddedPi === "object" &&
      !Array.isArray(defaults.embeddedPi)
    ) {
      defaults.embeddedAgent =
        defaults.embeddedAgent &&
        typeof defaults.embeddedAgent === "object" &&
        !Array.isArray(defaults.embeddedAgent)
          ? { ...defaults.embeddedPi, ...defaults.embeddedAgent }
          : { ...defaults.embeddedPi };
    }
    delete defaults.embeddedPi;
    delete defaults.llm;
  }

  const channels =
    openclawConfig.channels && typeof openclawConfig.channels === "object"
      ? (openclawConfig.channels as Record<string, any>)
      : {};
  for (const channel of Object.values(channels)) {
    if (!channel || typeof channel !== "object") continue;
    const threadBindings = (channel as Record<string, any>).threadBindings;
    if (
      threadBindings &&
      typeof threadBindings === "object" &&
      !Array.isArray(threadBindings)
    ) {
      if (
        threadBindings.spawnSessions === undefined &&
        (threadBindings.spawnSubagentSessions === true ||
          threadBindings.spawnAcpSessions === true)
      ) {
        threadBindings.spawnSessions = true;
      }
      delete threadBindings.spawnSubagentSessions;
      delete threadBindings.spawnAcpSessions;
    }
  }

  const models =
    openclawConfig.models && typeof openclawConfig.models === "object"
      ? openclawConfig.models
      : (openclawConfig.models = {});
  const providers =
    models.providers && typeof models.providers === "object"
      ? models.providers
      : (models.providers = {});
  for (const [providerId, rawProvider] of Object.entries(providers)) {
    const provider =
      rawProvider && typeof rawProvider === "object"
        ? (rawProvider as Record<string, any>)
        : {};
    providers[providerId] = provider;
    const normalizedProviderApi = normalizeProviderApi(provider.api);
    if (normalizedProviderApi) provider.api = normalizedProviderApi;
    else delete provider.api;
    const resolvedBaseUrl = resolveProviderBaseUrl(
      normalizeString(providerId, "provider"),
      provider.api,
      provider.baseUrl,
    );
    if (resolvedBaseUrl) provider.baseUrl = resolvedBaseUrl;
    else delete provider.baseUrl;
    if (!Array.isArray(provider.models)) {
      provider.models = [];
    } else {
      provider.models = provider.models
        .map((rawModel: unknown) => {
          if (typeof rawModel === "string") {
            const id = normalizeString(rawModel);
            if (!id) return null;
            return { id, name: id };
          }
          if (!rawModel || typeof rawModel !== "object") return null;
          const model = rawModel as Record<string, unknown>;
          const id = normalizeString(model.id);
          if (!id) return null;
          const nextModel: Record<string, unknown> = {
            ...model,
            id,
            name: normalizeString(model.name, id),
          };
          if (nextModel.api != null) {
            const normalizedModelApi = normalizeProviderApi(nextModel.api);
            if (normalizedModelApi) nextModel.api = normalizedModelApi;
            else delete nextModel.api;
          }
          if (nextModel.baseUrl != null && !normalizeString(nextModel.baseUrl)) {
            delete nextModel.baseUrl;
          }
          return nextModel;
        })
        .filter((model) => model !== null);
    }
  }

  const session =
    openclawConfig.session && typeof openclawConfig.session === "object"
      ? openclawConfig.session
      : (openclawConfig.session = {});
  const reset =
    session.reset && typeof session.reset === "object"
      ? session.reset
      : (session.reset = {});
  const resetMode = normalizeResetMode(reset.mode) || "idle";
  reset.mode = resetMode;
  if (resetMode === "daily") {
    reset.atHour = clampHour(reset.atHour, 4);
    delete reset.idleMinutes;
  } else {
    const normalizedIdle = normalizePositiveNumberOrNull(reset.idleMinutes);
    reset.idleMinutes = normalizedIdle != null ? normalizedIdle : 60;
    delete reset.atHour;
  }
  session.resetByType = buildResetOverrideMap(
    summarizeResetOverrideMap(session.resetByType),
  );
  session.resetByChannel = buildResetOverrideMap(
    summarizeResetOverrideMap(session.resetByChannel),
  );
  pruneCurrentSchemaDomains(openclawConfig);
}

function applyConfigUpdate(
  openclawConfig: Record<string, any>,
  payload: ConfigUpdatePayload,
): Record<string, any> {
  openclawConfig.agents = openclawConfig.agents || {};
  openclawConfig.agents.defaults = openclawConfig.agents.defaults || {};
  const defaults = openclawConfig.agents.defaults;

  defaults.model = normalizeAgentModelConfigInput(
    payload.defaults.model,
    defaults.model,
  );
  defaults.imageModel = normalizeAgentModelConfigInput(
    payload.defaults.imageModel,
    defaults.imageModel,
    defaults.model?.primary || "",
  );
  defaults.imageGenerationModel = normalizeAgentModelConfigInput(
    payload.defaults.imageGenerationModel,
    defaults.imageGenerationModel,
  );
  defaults.videoGenerationModel = normalizeAgentModelConfigInput(
    payload.defaults.videoGenerationModel,
    defaults.videoGenerationModel,
  );
  defaults.musicGenerationModel = normalizeAgentModelConfigInput(
    payload.defaults.musicGenerationModel,
    defaults.musicGenerationModel,
  );
  defaults.pdfModel = normalizeAgentModelConfigInput(
    payload.defaults.pdfModel,
    defaults.pdfModel,
    defaults.imageModel?.primary || defaults.model?.primary || "",
  );
  if (defaults.model) {
    defaults.model.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.model,
      payload.defaults.modelFallback,
      String(defaults.model.primary || ""),
    );
  }
  if (defaults.imageModel) {
    defaults.imageModel.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.imageModel,
      payload.defaults.imageModelFallback,
      String(defaults.imageModel.primary || ""),
    );
  }
  if (defaults.imageGenerationModel) {
    defaults.imageGenerationModel.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.imageGenerationModel,
      payload.defaults.imageGenerationModelFallback,
      String(defaults.imageGenerationModel.primary || ""),
    );
  }
  if (defaults.videoGenerationModel) {
    defaults.videoGenerationModel.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.videoGenerationModel,
      payload.defaults.videoGenerationModelFallback,
      String(defaults.videoGenerationModel.primary || ""),
    );
  }
  if (defaults.musicGenerationModel) {
    defaults.musicGenerationModel.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.musicGenerationModel,
      payload.defaults.musicGenerationModelFallback,
      String(defaults.musicGenerationModel.primary || ""),
    );
  }
  if (defaults.pdfModel) {
    defaults.pdfModel.fallbacks = resolveAgentModelFallbackInput(
      payload.defaults.pdfModel,
      payload.defaults.pdfModelFallback,
      String(defaults.pdfModel.primary || ""),
    );
  }
  defaults.mediaGenerationAutoProviderFallback =
    payload.defaults.mediaGenerationAutoProviderFallback !== false;
  defaults.thinkingDefault = normalizeString(
    payload.defaults.thinking,
    defaults.thinkingDefault || "high",
  );
  setOptionalStringField(defaults, "verboseDefault", payload.defaults.verbose);
  defaults.timeoutSeconds = normalizeNumber(
    payload.defaults.timeoutSeconds,
    defaults.timeoutSeconds || 600,
    1,
  );
  defaults.maxConcurrent = normalizeNumber(
    payload.defaults.maxConcurrent,
    defaults.maxConcurrent || 8,
    1,
  );
  defaults.subagents = ensureRecordObject(defaults, "subagents");
  defaults.subagents.maxConcurrent = normalizeNumber(
    payload.defaults.subagentMaxConcurrent,
    defaults.subagents.maxConcurrent || 16,
    1,
  );
  setOptionalStringField(
    defaults.subagents,
    "model",
    payload.defaults.subagentModel,
  );
  setOptionalStringField(
    defaults.subagents,
    "thinking",
    payload.defaults.subagentThinking,
  );
  setOptionalNonNegativeNumberField(
    defaults.subagents,
    "runTimeoutSeconds",
    payload.defaults.subagentRunTimeoutSeconds,
  );
  setOptionalPositiveNumberField(
    defaults.subagents,
    "maxSpawnDepth",
    payload.defaults.subagentMaxSpawnDepth,
  );
  setOptionalPositiveNumberField(
    defaults.subagents,
    "maxChildrenPerAgent",
    payload.defaults.subagentMaxChildrenPerAgent,
  );
  setOptionalNonNegativeNumberField(
    defaults.subagents,
    "archiveAfterMinutes",
    payload.defaults.subagentArchiveAfterMinutes,
  );
  setOptionalPositiveNumberField(
    defaults.subagents,
    "announceTimeoutMs",
    payload.defaults.subagentAnnounceTimeoutMs,
  );
  defaults.workspace = normalizeString(
    payload.defaults.workspace,
    defaults.workspace || "",
  );
  setOptionalStringField(defaults, "repoRoot", payload.defaults.repoRoot);
  if (payload.defaults.skipBootstrap === true) {
    defaults.skipBootstrap = true;
  } else {
    delete defaults.skipBootstrap;
  }
  setOptionalPositiveNumberField(
    defaults,
    "bootstrapMaxChars",
    payload.defaults.bootstrapMaxChars,
  );
  setOptionalPositiveNumberField(
    defaults,
    "bootstrapTotalMaxChars",
    payload.defaults.bootstrapTotalMaxChars,
  );
  setOptionalStringField(
    defaults,
    "systemPromptOverride",
    payload.defaults.systemPromptOverride,
  );
  setOptionalStringListField(defaults, "skills", payload.defaults.skills);
  setOptionalStringField(
    defaults,
    "contextInjection",
    payload.defaults.contextInjection,
  );
  setOptionalStringField(
    defaults,
    "bootstrapPromptTruncationWarning",
    payload.defaults.bootstrapPromptTruncationWarning,
  );
  setOptionalStringField(
    defaults,
    "userTimezone",
    payload.defaults.userTimezone,
  );
  setOptionalStringField(defaults, "timeFormat", payload.defaults.timeFormat);
  setOptionalStringField(
    defaults,
    "envelopeTimezone",
    payload.defaults.envelopeTimezone,
  );
  setOptionalStringField(
    defaults,
    "envelopeTimestamp",
    payload.defaults.envelopeTimestamp,
  );
  setOptionalStringField(
    defaults,
    "envelopeElapsed",
    payload.defaults.envelopeElapsed,
  );
  setOptionalPositiveNumberField(
    defaults,
    "contextTokens",
    payload.defaults.contextTokens,
  );
  setOptionalStringField(defaults, "typingMode", payload.defaults.typingMode);
  setOptionalStringField(
    defaults,
    "elevatedDefault",
    payload.defaults.elevated,
  );
  setOptionalStringField(
    defaults,
    "blockStreamingDefault",
    payload.defaults.blockStreaming,
  );
  setOptionalStringField(
    defaults,
    "blockStreamingBreak",
    payload.defaults.blockStreamingBreak,
  );
  if (
    payload.defaults.blockStreamingChunk &&
    typeof payload.defaults.blockStreamingChunk === "object" &&
    !Array.isArray(payload.defaults.blockStreamingChunk)
  ) {
    defaults.blockStreamingChunk = cloneJsonObject(
      payload.defaults.blockStreamingChunk,
    );
  } else {
    delete defaults.blockStreamingChunk;
  }
  if (
    payload.defaults.blockStreamingCoalesce &&
    typeof payload.defaults.blockStreamingCoalesce === "object" &&
    !Array.isArray(payload.defaults.blockStreamingCoalesce)
  ) {
    defaults.blockStreamingCoalesce = cloneJsonObject(
      payload.defaults.blockStreamingCoalesce,
    );
  } else {
    delete defaults.blockStreamingCoalesce;
  }
  setOptionalPositiveNumberField(
    defaults,
    "mediaMaxMb",
    payload.defaults.mediaMaxMb,
  );
  setOptionalPositiveNumberField(
    defaults,
    "imageMaxDimensionPx",
    payload.defaults.imageMaxDimensionPx,
  );
  setOptionalPositiveNumberField(
    defaults,
    "typingIntervalSeconds",
    payload.defaults.typingIntervalSeconds,
  );
  setOptionalPositiveNumberField(
    defaults,
    "pdfMaxBytesMb",
    payload.defaults.pdfMaxBytesMb,
  );
  setOptionalPositiveNumberField(
    defaults,
    "pdfMaxPages",
    payload.defaults.pdfMaxPages,
  );
  // llm.idleTimeoutSeconds is a legacy OpenClaw field (agents.defaults.llm)
  // that current OpenClaw versions flag as legacy and doctor --fix removes.
  // Always strip it during save to prevent gateway restart errors.
  delete defaults.llm;
  delete defaults.embeddedPi;
  defaults.embeddedAgent = ensureRecordObject(defaults, "embeddedAgent");
  setOptionalStringField(
    defaults.embeddedAgent,
    "projectSettingsPolicy",
    payload.defaults.embeddedAgentProjectSettingsPolicy,
  );
  {
    const executionContract = normalizeString(
      payload.defaults.embeddedAgentExecutionContract,
    );
    if (
      executionContract === "default" ||
      executionContract === "strict-agentic"
    ) {
      defaults.embeddedAgent.executionContract = executionContract;
    } else {
      delete defaults.embeddedAgent.executionContract;
    }
  }
  deleteRecordFieldIfEmpty(defaults, "embeddedAgent");
  if (
    payload.defaults.memorySearch &&
    typeof payload.defaults.memorySearch === "object" &&
    !Array.isArray(payload.defaults.memorySearch)
  ) {
    defaults.memorySearch = cloneJsonObject(payload.defaults.memorySearch);
  } else {
    delete defaults.memorySearch;
  }
  if (
    payload.defaults.humanDelay &&
    typeof payload.defaults.humanDelay === "object" &&
    !Array.isArray(payload.defaults.humanDelay)
  ) {
    defaults.humanDelay = cloneJsonObject(payload.defaults.humanDelay);
  } else {
    delete defaults.humanDelay;
  }
  if (
    payload.defaults.heartbeat &&
    typeof payload.defaults.heartbeat === "object" &&
    !Array.isArray(payload.defaults.heartbeat)
  ) {
    defaults.heartbeat = cloneJsonObject(payload.defaults.heartbeat);
  } else {
    delete defaults.heartbeat;
  }
  if (
    payload.defaults.params &&
    typeof payload.defaults.params === "object" &&
    !Array.isArray(payload.defaults.params)
  ) {
    defaults.params = cloneJsonObject(payload.defaults.params);
  } else {
    delete defaults.params;
  }
  if (
    payload.defaults.cliBackends &&
    typeof payload.defaults.cliBackends === "object" &&
    !Array.isArray(payload.defaults.cliBackends)
  ) {
    defaults.cliBackends = cloneJsonObject(payload.defaults.cliBackends);
  } else {
    delete defaults.cliBackends;
  }
  if (
    payload.defaults.contextPruning &&
    typeof payload.defaults.contextPruning === "object" &&
    !Array.isArray(payload.defaults.contextPruning)
  ) {
    defaults.contextPruning = cloneJsonObject(payload.defaults.contextPruning);
  } else {
    delete defaults.contextPruning;
  }
  const normalizedModelRegistry = normalizeAgentDefaultModelRegistry(
    payload.defaults.models,
  );
  if (normalizedModelRegistry) {
    defaults.models = normalizedModelRegistry;
  } else {
    delete defaults.models;
  }
  if (Object.hasOwn(payload.defaults as Record<string, unknown>, "extra")) {
    applyAgentDefaultExtra(defaults, payload.defaults.extra);
  }
  defaults.compaction = ensureRecordObject(defaults, "compaction");
  defaults.compaction.mode = normalizeString(
    payload.compaction.mode,
    defaults.compaction.mode || "safeguard",
  );
  defaults.compaction.reserveTokensFloor = normalizeNumber(
    payload.compaction.reserveTokensFloor,
    defaults.compaction.reserveTokensFloor || 20000,
    0,
  );
  defaults.compaction.identifierPolicy = normalizeString(
    payload.compaction.identifierPolicy,
    defaults.compaction.identifierPolicy || "strict",
  );
  defaults.compaction.identifierInstructions = normalizeString(
    payload.compaction.identifierInstructions,
    defaults.compaction.identifierInstructions || "",
  );
  defaults.compaction.postCompactionSections = normalizeStringList(
    payload.compaction.postCompactionSections,
  );
  defaults.compaction.model = normalizeString(
    payload.compaction.model,
    defaults.compaction.model || "",
  );
  defaults.compaction.memoryFlush = ensureRecordObject(
    defaults.compaction,
    "memoryFlush",
  );
  defaults.compaction.memoryFlush.enabled =
    payload.compaction.memoryFlush?.enabled !== false;
  defaults.compaction.memoryFlush.softThresholdTokens = normalizeNumber(
    payload.compaction.memoryFlush?.softThresholdTokens,
    defaults.compaction.memoryFlush.softThresholdTokens || 4000,
    0,
  );
  defaults.sandbox = ensureRecordObject(defaults, "sandbox");
  defaults.sandbox.mode = normalizeString(
    payload.sandbox.mode,
    defaults.sandbox.mode || "off",
  );
  defaults.sandbox.workspaceAccess = normalizeString(
    payload.sandbox.workspaceAccess,
    defaults.sandbox.workspaceAccess || "rw",
  );
  defaults.sandbox.scope = normalizeString(
    payload.sandbox.scope,
    defaults.sandbox.scope || "session",
  );
  defaults.sandbox.sessionToolsVisibility = normalizeString(
    payload.sandbox.sessionToolsVisibility,
    defaults.sandbox.sessionToolsVisibility || "spawned",
  );
  defaults.sandbox.prune = ensureRecordObject(defaults.sandbox, "prune");
  defaults.sandbox.prune.idleHours = normalizeNumber(
    payload.sandbox.prune?.idleHours,
    defaults.sandbox.prune.idleHours || 24,
    1,
  );
  defaults.sandbox.prune.maxAgeDays = normalizeNumber(
    payload.sandbox.prune?.maxAgeDays,
    defaults.sandbox.prune.maxAgeDays || 7,
    1,
  );
  if (
    defaults.sandbox.mode === "off" &&
    !hasDockerCommand() &&
    Array.isArray(openclawConfig.agents?.list)
  ) {
    const inheritedBackend = defaults.sandbox.backend;
    for (const rawAgent of openclawConfig.agents.list) {
      if (!rawAgent || typeof rawAgent !== "object") continue;
      const agentSandbox =
        rawAgent.sandbox && typeof rawAgent.sandbox === "object"
          ? (rawAgent.sandbox as Record<string, any>)
          : null;
      if (!sandboxNeedsDocker(agentSandbox, inheritedBackend)) continue;
      rawAgent.sandbox = agentSandbox || {};
      rawAgent.sandbox.mode = "off";
    }
  }

  openclawConfig.tools = openclawConfig.tools || {};
  openclawConfig.tools.profile = normalizeString(
    payload.tools.profile,
    openclawConfig.tools.profile || "full",
  );
  openclawConfig.tools.elevated = openclawConfig.tools.elevated || {};
  openclawConfig.tools.elevated.enabled =
    payload.tools.elevatedEnabled === true;
  openclawConfig.tools.exec = openclawConfig.tools.exec || {};
  openclawConfig.tools.exec.host = normalizeString(
    payload.tools.execHost,
    openclawConfig.tools.exec.host || "auto",
  );
  const execMode = normalizeString(payload.tools.execMode);
  if (execMode) {
    openclawConfig.tools.exec.mode = execMode;
    delete openclawConfig.tools.exec.ask;
    delete openclawConfig.tools.exec.security;
  } else {
    delete openclawConfig.tools.exec.mode;
    openclawConfig.tools.exec.ask = normalizeString(
      payload.tools.execAsk,
      openclawConfig.tools.exec.ask || "off",
    );
    openclawConfig.tools.exec.security = normalizeString(
      payload.tools.execSecurity,
      openclawConfig.tools.exec.security || "full",
    );
  }
  openclawConfig.tools.exec.node = normalizeString(
    payload.tools.execNode,
    openclawConfig.tools.exec.node || "",
  );
  openclawConfig.tools.exec.timeoutSec = normalizeNumber(
    payload.tools.execTimeoutSec,
    openclawConfig.tools.exec.timeoutSec || 45,
    1,
  );
  openclawConfig.tools.fs = openclawConfig.tools.fs || {};
  openclawConfig.tools.fs.workspaceOnly =
    payload.tools.fsWorkspaceOnly === true;
  if (Object.hasOwn(payload.tools as Record<string, unknown>, "extra")) {
    applySchemaExtra(openclawConfig.tools, payload.tools.extra, TOOLS_EXTRA_KEYS);
  }

  openclawConfig.session = openclawConfig.session || {};
  openclawConfig.session.dmScope = normalizeString(
    payload.session.dmScope,
    openclawConfig.session.dmScope || "per-channel-peer",
  );
  openclawConfig.session.threadBindings =
    openclawConfig.session.threadBindings || {};
  openclawConfig.session.threadBindings.enabled =
    payload.session.threadBindings?.enabled === true;
  openclawConfig.session.threadBindings.idleHours = normalizeNumber(
    payload.session.threadBindings?.idleHours,
    openclawConfig.session.threadBindings.idleHours || 24,
    0,
  );
  openclawConfig.session.threadBindings.maxAgeHours = normalizeNumber(
    payload.session.threadBindings?.maxAgeHours,
    openclawConfig.session.threadBindings.maxAgeHours || 0,
    0,
  );
  if (Object.hasOwn(payload.session as Record<string, unknown>, "extra")) {
    applySchemaExtra(
      openclawConfig.session,
      payload.session.extra,
      SESSION_EXTRA_KEYS,
    );
  }

  openclawConfig.messages = openclawConfig.messages || {};
  openclawConfig.messages.responsePrefix = normalizeString(
    payload.messages.responsePrefix,
    openclawConfig.messages.responsePrefix || "",
  );
  openclawConfig.messages.ackReaction = normalizeString(
    payload.messages.ackReaction,
    openclawConfig.messages.ackReaction || "",
  );
  openclawConfig.messages.ackReactionScope = normalizeString(
    payload.messages.ackReactionScope,
    openclawConfig.messages.ackReactionScope || "group-mentions",
  );
  openclawConfig.messages.removeAckAfterReply =
    payload.messages.removeAckAfterReply === true;
  openclawConfig.messages.queue = openclawConfig.messages.queue || {};
  openclawConfig.messages.queue.mode = normalizeString(
    payload.messages.queue?.mode,
    openclawConfig.messages.queue.mode || "collect",
  );
  openclawConfig.messages.queue.debounceMs = normalizeNumber(
    payload.messages.queue?.debounceMs,
    openclawConfig.messages.queue.debounceMs || 1000,
    0,
  );
  openclawConfig.messages.queue.cap = normalizeNumber(
    payload.messages.queue?.cap,
    openclawConfig.messages.queue.cap || 20,
    1,
  );
  openclawConfig.messages.queue.drop = normalizeString(
    payload.messages.queue?.drop,
    openclawConfig.messages.queue.drop || "summarize",
  );
  openclawConfig.messages.queue.byChannel = {};
  if (
    payload.messages.queue?.byChannel &&
    typeof payload.messages.queue.byChannel === "object"
  ) {
    for (const [channelId, mode] of Object.entries(
      payload.messages.queue.byChannel,
    )) {
      const normalizedChannelId = normalizeString(channelId);
      const normalizedMode = normalizeString(mode);
      if (!normalizedChannelId || !normalizedMode) continue;
      openclawConfig.messages.queue.byChannel[normalizedChannelId] =
        normalizedMode;
    }
  }
  if (Object.hasOwn(payload.messages as Record<string, unknown>, "extra")) {
    applySchemaExtra(
      openclawConfig.messages,
      payload.messages.extra,
      MESSAGES_EXTRA_KEYS,
    );
  }

  const existingProviders = openclawConfig.models?.providers || {};
  openclawConfig.models = openclawConfig.models || {};
  openclawConfig.models.providers = {};
  for (const provider of payload.providers || []) {
    const providerId = normalizeString(provider.id);
    if (!providerId) continue;
    openclawConfig.models.providers[providerId] = normalizeProviderInput(
      provider,
      existingProviders[providerId],
    );
  }

  if (payload.gateway) {
    openclawConfig.gateway = openclawConfig.gateway || {};
    const gw = openclawConfig.gateway;
    const pg = payload.gateway;
    if (pg.port != null)
      gw.port = normalizeNumber(pg.port, gw.port || 31879, 1);
    if (pg.mode != null) gw.mode = normalizeString(pg.mode, gw.mode || "local");
    if (pg.bind != null)
      gw.bind = normalizeString(pg.bind, gw.bind || "loopback");
    if (pg.customBindHost != null)
      gw.customBindHost = normalizeString(
        pg.customBindHost,
        gw.customBindHost || "",
      );
    if (pg.auth) {
      gw.auth = gw.auth || {};
      if (pg.auth.mode != null)
        gw.auth.mode = normalizeString(pg.auth.mode, gw.auth.mode || "token");
      if ((pg.auth as Record<string, unknown>).token != null) {
        const tokenInput = (pg.auth as Record<string, unknown>).token;
        const tokenRef = cloneOpenClawSecretRef(tokenInput);
        const token = normalizeString(tokenInput, "");
        if (tokenRef) gw.auth.token = tokenRef;
        else if (token) gw.auth.token = token;
      }
      if ((pg.auth as Record<string, unknown>).password != null) {
        const passwordInput = (pg.auth as Record<string, unknown>).password;
        const passwordRef = cloneOpenClawSecretRef(passwordInput);
        const password = normalizeString(passwordInput, "");
        if (passwordRef) gw.auth.password = passwordRef;
        else if (password) gw.auth.password = password;
      }
      if ((pg.auth as Record<string, unknown>).allowTailscale != null) {
        gw.auth.allowTailscale =
          (pg.auth as Record<string, unknown>).allowTailscale === true;
      }
      if (pg.auth.trustedProxy && typeof pg.auth.trustedProxy === "object") {
        gw.auth.trustedProxy = gw.auth.trustedProxy || {};
        if (
          (pg.auth.trustedProxy as Record<string, unknown>).userHeader != null
        ) {
          gw.auth.trustedProxy.userHeader = normalizeString(
            (pg.auth.trustedProxy as Record<string, unknown>).userHeader,
            gw.auth.trustedProxy.userHeader || "",
          );
        }
        if (
          (pg.auth.trustedProxy as Record<string, unknown>).requiredHeaders !=
          null
        ) {
          gw.auth.trustedProxy.requiredHeaders = normalizeStringList(
            (pg.auth.trustedProxy as Record<string, unknown>).requiredHeaders,
          );
        }
        if (
          (pg.auth.trustedProxy as Record<string, unknown>).allowUsers != null
        ) {
          gw.auth.trustedProxy.allowUsers = normalizeStringList(
            (pg.auth.trustedProxy as Record<string, unknown>).allowUsers,
          );
        }
      }
      if (pg.auth.rateLimit) {
        gw.auth.rateLimit = gw.auth.rateLimit || {};
        if (pg.auth.rateLimit.maxAttempts != null)
          gw.auth.rateLimit.maxAttempts = normalizeNumber(
            pg.auth.rateLimit.maxAttempts,
            gw.auth.rateLimit.maxAttempts || 10,
            1,
          );
        if (pg.auth.rateLimit.windowMs != null)
          gw.auth.rateLimit.windowMs = normalizeNumber(
            pg.auth.rateLimit.windowMs,
            gw.auth.rateLimit.windowMs || 60000,
            1000,
          );
        if (pg.auth.rateLimit.lockoutMs != null)
          gw.auth.rateLimit.lockoutMs = normalizeNumber(
            pg.auth.rateLimit.lockoutMs,
            gw.auth.rateLimit.lockoutMs || 600000,
            0,
          );
        if (pg.auth.rateLimit.exemptLoopback != null)
          gw.auth.rateLimit.exemptLoopback =
            pg.auth.rateLimit.exemptLoopback !== false;
      }
    }
    if (pg.controlUi) {
      gw.controlUi = gw.controlUi || {};
      if ((pg.controlUi as Record<string, unknown>).enabled != null)
        gw.controlUi.enabled =
          (pg.controlUi as Record<string, unknown>).enabled !== false;
      if ((pg.controlUi as Record<string, unknown>).basePath != null)
        gw.controlUi.basePath = normalizeString(
          (pg.controlUi as Record<string, unknown>).basePath,
          gw.controlUi.basePath || "",
        );
      if ((pg.controlUi as Record<string, unknown>).root != null)
        gw.controlUi.root = normalizeString(
          (pg.controlUi as Record<string, unknown>).root,
          gw.controlUi.root || "",
        );
      if ((pg.controlUi as Record<string, unknown>).embedSandbox != null) {
        const embedSandbox = normalizeString(
          (pg.controlUi as Record<string, unknown>).embedSandbox,
        );
        if (
          embedSandbox === "strict" ||
          embedSandbox === "scripts" ||
          embedSandbox === "trusted"
        ) {
          gw.controlUi.embedSandbox = embedSandbox;
        } else {
          delete gw.controlUi.embedSandbox;
        }
      }
      if ((pg.controlUi as Record<string, unknown>).allowExternalEmbedUrls != null)
        gw.controlUi.allowExternalEmbedUrls =
          (pg.controlUi as Record<string, unknown>)
            .allowExternalEmbedUrls === true;
      if ((pg.controlUi as Record<string, unknown>).chatMessageMaxWidth != null) {
        const chatMessageMaxWidth = normalizeString(
          (pg.controlUi as Record<string, unknown>).chatMessageMaxWidth,
        );
        if (chatMessageMaxWidth) {
          gw.controlUi.chatMessageMaxWidth = chatMessageMaxWidth;
        } else {
          delete gw.controlUi.chatMessageMaxWidth;
        }
      }
      if (pg.controlUi.allowedOrigins != null)
        gw.controlUi.allowedOrigins = normalizeStringList(
          pg.controlUi.allowedOrigins,
        );
      if (pg.controlUi.dangerouslyAllowHostHeaderOriginFallback != null)
        gw.controlUi.dangerouslyAllowHostHeaderOriginFallback =
          pg.controlUi.dangerouslyAllowHostHeaderOriginFallback === true;
      if (pg.controlUi.allowInsecureAuth != null)
        gw.controlUi.allowInsecureAuth =
          pg.controlUi.allowInsecureAuth === true;
      if (
        (pg.controlUi as Record<string, unknown>)
          .dangerouslyDisableDeviceAuth != null
      )
        gw.controlUi.dangerouslyDisableDeviceAuth =
          (pg.controlUi as Record<string, unknown>)
            .dangerouslyDisableDeviceAuth === true;
    }
    if (pg.trustedProxies != null)
      gw.trustedProxies = normalizeStringList(pg.trustedProxies);
    if ((pg as Record<string, unknown>).allowRealIpFallback != null)
      gw.allowRealIpFallback =
        (pg as Record<string, unknown>).allowRealIpFallback === true;
    if (
      (pg as Record<string, unknown>).tools &&
      typeof (pg as Record<string, unknown>).tools === "object"
    ) {
      gw.tools = gw.tools || {};
      if ((pg as Record<string, any>).tools.allow != null)
        gw.tools.allow = normalizeStringList(
          (pg as Record<string, any>).tools.allow,
        );
      if ((pg as Record<string, any>).tools.deny != null)
        gw.tools.deny = normalizeStringList(
          (pg as Record<string, any>).tools.deny,
        );
    }
    if (Object.hasOwn(pg as Record<string, unknown>, "handshakeTimeoutMs")) {
      if ((pg as Record<string, unknown>).handshakeTimeoutMs != null) {
        gw.handshakeTimeoutMs = normalizeNumber(
          (pg as Record<string, unknown>).handshakeTimeoutMs,
          gw.handshakeTimeoutMs || 0,
          1,
        );
      } else {
        delete gw.handshakeTimeoutMs;
      }
    }
    if ((pg as Record<string, unknown>).channelHealthCheckMinutes != null)
      gw.channelHealthCheckMinutes = normalizeNumber(
        (pg as Record<string, unknown>).channelHealthCheckMinutes,
        gw.channelHealthCheckMinutes || 0,
        0,
      );
    if (
      Object.hasOwn(
        pg as Record<string, unknown>,
        "channelStaleEventThresholdMinutes",
      )
    ) {
      if (
        (pg as Record<string, unknown>).channelStaleEventThresholdMinutes !=
        null
      ) {
        gw.channelStaleEventThresholdMinutes = normalizeNumber(
          (pg as Record<string, unknown>).channelStaleEventThresholdMinutes,
          gw.channelStaleEventThresholdMinutes || 0,
          1,
        );
      } else {
        delete gw.channelStaleEventThresholdMinutes;
      }
    }
    if (
      Object.hasOwn(pg as Record<string, unknown>, "channelMaxRestartsPerHour")
    ) {
      if ((pg as Record<string, unknown>).channelMaxRestartsPerHour != null) {
        gw.channelMaxRestartsPerHour = normalizeNumber(
          (pg as Record<string, unknown>).channelMaxRestartsPerHour,
          gw.channelMaxRestartsPerHour || 0,
          1,
        );
      } else {
        delete gw.channelMaxRestartsPerHour;
      }
    }
    if (pg.tailscale) {
      gw.tailscale = gw.tailscale || {};
      if (pg.tailscale.mode != null)
        gw.tailscale.mode = normalizeString(
          pg.tailscale.mode,
          gw.tailscale.mode || "off",
        );
    }
    if (Object.hasOwn(pg as Record<string, unknown>, "extra")) {
      applySchemaExtra(
        gw,
        (pg as Record<string, unknown>).extra,
        GATEWAY_EXTRA_KEYS,
      );
    }
  }

  if (payload.channels) {
    openclawConfig.channels = openclawConfig.channels || {};
    for (const [channelId, channelUpdate] of Object.entries(payload.channels)) {
      const cid = normalizeString(channelId);
      if (!cid) continue;
      openclawConfig.channels[cid] = openclawConfig.channels[cid] || {};
      deepMerge(
        openclawConfig.channels[cid],
        channelUpdate as Record<string, any>,
      );
    }
  }

  if (payload.sessionReset) {
    openclawConfig.session = openclawConfig.session || {};
    openclawConfig.session.reset = openclawConfig.session.reset || {};
    const session = openclawConfig.session;
    const reset = session.reset;
    const pr = payload.sessionReset;
    if (pr.mode != null)
      reset.mode =
        normalizeResetMode(pr.mode) || normalizeResetMode(reset.mode) || "idle";
    if (pr.atHour != null) reset.atHour = clampHour(pr.atHour, 4);
    if (pr.idleMinutes != null) {
      const normalizedIdle = normalizePositiveNumberOrNull(pr.idleMinutes);
      if (normalizedIdle != null) reset.idleMinutes = normalizedIdle;
    }
    const normalizedMode = normalizeResetMode(reset.mode) || "idle";
    reset.mode = normalizedMode;
    if (normalizedMode === "daily") {
      reset.atHour = clampHour(reset.atHour, 4);
      delete reset.idleMinutes;
    } else {
      const normalizedIdle = normalizePositiveNumberOrNull(reset.idleMinutes);
      reset.idleMinutes = normalizedIdle != null ? normalizedIdle : 60;
      delete reset.atHour;
    }
    if (pr.resetByType != null) {
      session.resetByType = buildResetOverrideMap(pr.resetByType);
    }
    if (pr.resetByChannel != null) {
      session.resetByChannel = buildResetOverrideMap(pr.resetByChannel);
    }
    delete reset.resetByType;
    delete reset.resetByChannel;
  }

  sanitizeCriticalConfigForHostSchema(openclawConfig);

  if (payload.hooks) {
    openclawConfig.hooks = openclawConfig.hooks || {};
    if (payload.hooks.internal) {
      openclawConfig.hooks.internal = openclawConfig.hooks.internal || {};
      const hi = openclawConfig.hooks.internal;
      const phi = payload.hooks.internal;
      if (phi.enabled != null) hi.enabled = phi.enabled !== false;
      if (phi.entries) {
        hi.entries = hi.entries || {};
        deepMerge(hi.entries, phi.entries as Record<string, any>);
      }
    }
  }

  if (payload.commands) {
    openclawConfig.commands = openclawConfig.commands || {};
    const cmd = openclawConfig.commands;
    const pc = payload.commands;
    if (pc.native != null)
      cmd.native = normalizeBooleanOrAuto(pc.native, cmd.native);
    if (pc.nativeSkills != null)
      cmd.nativeSkills = normalizeBooleanOrAuto(pc.nativeSkills, cmd.nativeSkills);
    if (pc.text != null) cmd.text = pc.text === true;
    if (pc.bash != null) cmd.bash = pc.bash === true;
    if (Object.hasOwn(pc as Record<string, unknown>, "bashForegroundMs")) {
      setOptionalNonNegativeNumberField(cmd, "bashForegroundMs", pc.bashForegroundMs);
    }
    if (pc.config != null) cmd.config = pc.config === true;
    if (pc.mcp != null) cmd.mcp = pc.mcp === true;
    if (pc.plugins != null) cmd.plugins = pc.plugins === true;
    if (pc.debug != null) cmd.debug = pc.debug === true;
    if (pc.restart != null) cmd.restart = pc.restart !== false;
    if (pc.ownerDisplay != null)
      cmd.ownerDisplay = normalizeString(
        pc.ownerDisplay,
        cmd.ownerDisplay || "raw",
      );
    if (Object.hasOwn(pc as Record<string, unknown>, "extra")) {
      applySchemaExtra(cmd, pc.extra, COMMAND_EXTRA_KEYS);
    }
  }

  if (payload.mcp) {
    openclawConfig.mcp = openclawConfig.mcp || {};
    const mcpPayload = payload.mcp as Record<string, any>;
    if (Object.hasOwn(mcpPayload, "sessionIdleTtlMs")) {
      setOptionalNonNegativeNumberField(
        openclawConfig.mcp,
        "sessionIdleTtlMs",
        mcpPayload.sessionIdleTtlMs,
      );
    }
    if (Object.hasOwn(mcpPayload, "servers")) {
      if (
        mcpPayload.servers &&
        typeof mcpPayload.servers === "object" &&
        !Array.isArray(mcpPayload.servers)
      ) {
        openclawConfig.mcp.servers = cloneJsonObject(mcpPayload.servers) || {};
      } else {
        delete openclawConfig.mcp.servers;
      }
    }
    deleteRecordFieldIfEmpty(openclawConfig, "mcp");
  }

  if (payload.skills) {
    openclawConfig.skills = openclawConfig.skills || {};
    const skillsPayload = payload.skills as Record<string, any>;
    if (Object.hasOwn(skillsPayload, "allowBundled")) {
      if (Array.isArray(skillsPayload.allowBundled)) {
        openclawConfig.skills.allowBundled = normalizeStringList(
          skillsPayload.allowBundled,
        );
      } else {
        delete openclawConfig.skills.allowBundled;
      }
    }
    if (skillsPayload.load && typeof skillsPayload.load === "object") {
      openclawConfig.skills.load = openclawConfig.skills.load || {};
      const loadPayload = skillsPayload.load as Record<string, unknown>;
      if (Object.hasOwn(loadPayload, "extraDirs")) {
        setOptionalStringListField(
          openclawConfig.skills.load,
          "extraDirs",
          loadPayload.extraDirs,
        );
      }
      if (Object.hasOwn(loadPayload, "watch")) {
        if (typeof loadPayload.watch === "boolean") {
          openclawConfig.skills.load.watch = loadPayload.watch;
        } else {
          delete openclawConfig.skills.load.watch;
        }
      }
      if (Object.hasOwn(loadPayload, "watchDebounceMs")) {
        setOptionalNonNegativeNumberField(
          openclawConfig.skills.load,
          "watchDebounceMs",
          loadPayload.watchDebounceMs,
        );
      }
      if (Object.hasOwn(loadPayload, "allowSymlinkTargets")) {
        if (typeof loadPayload.allowSymlinkTargets === "boolean") {
          openclawConfig.skills.load.allowSymlinkTargets =
            loadPayload.allowSymlinkTargets;
        } else {
          delete openclawConfig.skills.load.allowSymlinkTargets;
        }
      }
      deleteRecordFieldIfEmpty(openclawConfig.skills, "load");
    }
    if (skillsPayload.install && typeof skillsPayload.install === "object") {
      openclawConfig.skills.install = openclawConfig.skills.install || {};
      const installPayload = skillsPayload.install as Record<string, unknown>;
      if (installPayload.preferBrew != null) {
        openclawConfig.skills.install.preferBrew =
          installPayload.preferBrew === true;
      }
      if (installPayload.nodeManager != null) {
        const nodeManager = normalizeSkillNodeManager(installPayload.nodeManager);
        if (nodeManager) openclawConfig.skills.install.nodeManager = nodeManager;
        else delete openclawConfig.skills.install.nodeManager;
      }
      if (Object.hasOwn(installPayload, "allowUploadedArchives")) {
        if (typeof installPayload.allowUploadedArchives === "boolean") {
          openclawConfig.skills.install.allowUploadedArchives =
            installPayload.allowUploadedArchives;
        } else {
          delete openclawConfig.skills.install.allowUploadedArchives;
        }
      }
      deleteRecordFieldIfEmpty(openclawConfig.skills, "install");
    }
    if (skillsPayload.limits && typeof skillsPayload.limits === "object") {
      openclawConfig.skills.limits = openclawConfig.skills.limits || {};
      const limitsPayload = skillsPayload.limits as Record<string, unknown>;
      if (Object.hasOwn(limitsPayload, "maxCandidatesPerRoot")) {
        setOptionalPositiveNumberField(
          openclawConfig.skills.limits,
          "maxCandidatesPerRoot",
          limitsPayload.maxCandidatesPerRoot,
        );
      }
      if (Object.hasOwn(limitsPayload, "maxSkillsLoadedPerSource")) {
        setOptionalPositiveNumberField(
          openclawConfig.skills.limits,
          "maxSkillsLoadedPerSource",
          limitsPayload.maxSkillsLoadedPerSource,
        );
      }
      if (Object.hasOwn(limitsPayload, "maxSkillsInPrompt")) {
        setOptionalNonNegativeNumberField(
          openclawConfig.skills.limits,
          "maxSkillsInPrompt",
          limitsPayload.maxSkillsInPrompt,
        );
      }
      if (Object.hasOwn(limitsPayload, "maxSkillsPromptChars")) {
        setOptionalNonNegativeNumberField(
          openclawConfig.skills.limits,
          "maxSkillsPromptChars",
          limitsPayload.maxSkillsPromptChars,
        );
      }
      if (Object.hasOwn(limitsPayload, "maxSkillFileBytes")) {
        setOptionalNonNegativeNumberField(
          openclawConfig.skills.limits,
          "maxSkillFileBytes",
          limitsPayload.maxSkillFileBytes,
        );
      }
      deleteRecordFieldIfEmpty(openclawConfig.skills, "limits");
    }
    if (Object.hasOwn(skillsPayload, "entries")) {
      if (
        skillsPayload.entries &&
        typeof skillsPayload.entries === "object" &&
        !Array.isArray(skillsPayload.entries)
      ) {
        openclawConfig.skills.entries = cloneJsonObject(skillsPayload.entries) || {};
      } else {
        delete openclawConfig.skills.entries;
      }
    }
    deleteRecordFieldIfEmpty(openclawConfig, "skills");
  }

  if (payload.acp) {
    openclawConfig.acp = openclawConfig.acp || {};
    const acpPayload = payload.acp as Record<string, any>;
    const { extra: acpExtra, ...acpPatch } = acpPayload;
    deepMerge(openclawConfig.acp, acpPatch);
    if (Object.hasOwn(acpPayload, "extra")) {
      applySchemaExtra(openclawConfig.acp, acpExtra, ACP_EXTRA_KEYS);
    }
  }

  if (payload.plugins) {
    openclawConfig.plugins = openclawConfig.plugins || {};
    const pluginPayload = payload.plugins as Record<string, any>;
    if (pluginPayload.enabled != null) {
      openclawConfig.plugins.enabled = pluginPayload.enabled !== false;
    }
    if (pluginPayload.allow != null) {
      openclawConfig.plugins.allow = normalizeStringList(pluginPayload.allow);
    }
    if (pluginPayload.deny != null) {
      openclawConfig.plugins.deny = normalizeStringList(pluginPayload.deny);
    }
    if (pluginPayload.loadPaths != null) {
      openclawConfig.plugins.load = openclawConfig.plugins.load || {};
      openclawConfig.plugins.load.paths = normalizeStringList(
        pluginPayload.loadPaths,
      );
      delete openclawConfig.plugins.loadPaths;
    }
    if (pluginPayload.slots && typeof pluginPayload.slots === "object") {
      openclawConfig.plugins.slots = openclawConfig.plugins.slots || {};
      const nextSlots = pluginPayload.slots as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(nextSlots, "memory")) {
        setOptionalStringField(
          openclawConfig.plugins.slots,
          "memory",
          nextSlots.memory,
        );
      }
      if (Object.prototype.hasOwnProperty.call(nextSlots, "contextEngine")) {
        setOptionalStringField(
          openclawConfig.plugins.slots,
          "contextEngine",
          nextSlots.contextEngine,
        );
      }
      if (Object.keys(openclawConfig.plugins.slots).length === 0) {
        delete openclawConfig.plugins.slots;
      }
    }
    if (pluginPayload.entries && typeof pluginPayload.entries === "object") {
      openclawConfig.plugins.entries = openclawConfig.plugins.entries || {};
      deepMerge(
        openclawConfig.plugins.entries,
        pluginPayload.entries as Record<string, any>,
      );
    }
    const remainingPluginPayload = Object.fromEntries(
      Object.entries(pluginPayload).filter(
        ([key]) =>
          ![
            "enabled",
            "allow",
            "deny",
            "loadPaths",
            "slots",
            "entries",
            "installs",
          ].includes(key),
      ),
    );
    if (Object.keys(remainingPluginPayload).length > 0) {
      deepMerge(openclawConfig.plugins, remainingPluginPayload);
    }
  }

  if (payload.browser) {
    openclawConfig.browser = openclawConfig.browser || {};
    const browserPayload = payload.browser as Record<string, any>;
    deepMerge(openclawConfig.browser, browserPayload);
    if (browserPayload.cdpUrl != null) {
      openclawConfig.browser.cdpUrl = normalizeString(
        browserPayload.cdpUrl,
        openclawConfig.browser.cdpUrl || "",
      );
    }
    if (browserPayload.remoteCdpTimeoutMs != null) {
      openclawConfig.browser.remoteCdpTimeoutMs = normalizeNumber(
        browserPayload.remoteCdpTimeoutMs,
        openclawConfig.browser.remoteCdpTimeoutMs || 0,
        0,
      );
    }
    if (browserPayload.remoteCdpHandshakeTimeoutMs != null) {
      openclawConfig.browser.remoteCdpHandshakeTimeoutMs = normalizeNumber(
        browserPayload.remoteCdpHandshakeTimeoutMs,
        openclawConfig.browser.remoteCdpHandshakeTimeoutMs || 0,
        0,
      );
    }
    if (browserPayload.localLaunchTimeoutMs != null) {
      openclawConfig.browser.localLaunchTimeoutMs = normalizeNumber(
        browserPayload.localLaunchTimeoutMs,
        openclawConfig.browser.localLaunchTimeoutMs || 0,
        0,
      );
    }
    if (browserPayload.localCdpReadyTimeoutMs != null) {
      openclawConfig.browser.localCdpReadyTimeoutMs = normalizeNumber(
        browserPayload.localCdpReadyTimeoutMs,
        openclawConfig.browser.localCdpReadyTimeoutMs || 0,
        0,
      );
    }
    if (browserPayload.actionTimeoutMs != null) {
      openclawConfig.browser.actionTimeoutMs = normalizeNumber(
        browserPayload.actionTimeoutMs,
        openclawConfig.browser.actionTimeoutMs || 0,
        0,
      );
    }
    if (browserPayload.cdpPortRangeStart != null) {
      openclawConfig.browser.cdpPortRangeStart = normalizeNumber(
        browserPayload.cdpPortRangeStart,
        openclawConfig.browser.cdpPortRangeStart || 0,
        1,
      );
    }
    if (browserPayload.extraArgs != null) {
      openclawConfig.browser.extraArgs = normalizeStringList(
        browserPayload.extraArgs,
      );
    }
    if (
      browserPayload.snapshotDefaults &&
      typeof browserPayload.snapshotDefaults === "object"
    ) {
      openclawConfig.browser.snapshotDefaults =
        openclawConfig.browser.snapshotDefaults || {};
      if (browserPayload.snapshotDefaults.mode != null) {
        openclawConfig.browser.snapshotDefaults.mode = normalizeString(
          browserPayload.snapshotDefaults.mode,
          openclawConfig.browser.snapshotDefaults.mode || "efficient",
        );
      }
    }
    if (
      browserPayload.tabCleanup &&
      typeof browserPayload.tabCleanup === "object"
    ) {
      openclawConfig.browser.tabCleanup =
        openclawConfig.browser.tabCleanup || {};
      if (browserPayload.tabCleanup.enabled != null) {
        openclawConfig.browser.tabCleanup.enabled =
          browserPayload.tabCleanup.enabled !== false;
      }
      if (browserPayload.tabCleanup.idleMinutes != null) {
        openclawConfig.browser.tabCleanup.idleMinutes = normalizeNumber(
          browserPayload.tabCleanup.idleMinutes,
          openclawConfig.browser.tabCleanup.idleMinutes || 0,
          0,
        );
      }
      if (browserPayload.tabCleanup.maxTabsPerSession != null) {
        openclawConfig.browser.tabCleanup.maxTabsPerSession = normalizeNumber(
          browserPayload.tabCleanup.maxTabsPerSession,
          openclawConfig.browser.tabCleanup.maxTabsPerSession || 0,
          1,
        );
      }
      if (browserPayload.tabCleanup.sweepMinutes != null) {
        openclawConfig.browser.tabCleanup.sweepMinutes = normalizeNumber(
          browserPayload.tabCleanup.sweepMinutes,
          openclawConfig.browser.tabCleanup.sweepMinutes || 0,
          0,
        );
      }
      deleteRecordFieldIfEmpty(openclawConfig.browser, "tabCleanup");
    }
    if (
      browserPayload.ssrfPolicy &&
      typeof browserPayload.ssrfPolicy === "object"
    ) {
      openclawConfig.browser.ssrfPolicy =
        openclawConfig.browser.ssrfPolicy || {};
      if (browserPayload.ssrfPolicy.dangerouslyAllowPrivateNetwork != null) {
        openclawConfig.browser.ssrfPolicy.dangerouslyAllowPrivateNetwork =
          browserPayload.ssrfPolicy.dangerouslyAllowPrivateNetwork === true;
      }
      if (browserPayload.ssrfPolicy.hostnameAllowlist != null) {
        openclawConfig.browser.ssrfPolicy.hostnameAllowlist =
          normalizeStringList(browserPayload.ssrfPolicy.hostnameAllowlist);
      }
      if (browserPayload.ssrfPolicy.allowedHostnames != null) {
        openclawConfig.browser.ssrfPolicy.allowedHostnames =
          normalizeStringList(browserPayload.ssrfPolicy.allowedHostnames);
      }
      delete openclawConfig.browser.ssrfPolicy.allowPrivateNetwork;
    }
    if (Array.isArray(browserPayload.profiles)) {
      const nextProfiles = browserPayload.profiles.reduce<
        Record<string, Record<string, unknown>>
      >((items, rawProfile) => {
        if (!rawProfile || typeof rawProfile !== "object") return items;
        const profile = rawProfile as Record<string, unknown>;
        const id = normalizeString(profile.id);
        if (!id) return items;
        const nextProfile: Record<string, unknown> = {};
        const driver = normalizeString(profile.driver);
        if (driver) nextProfile.driver = driver;
        if (profile.attachOnly != null)
          nextProfile.attachOnly = normalizeBoolean(profile.attachOnly);
        if (profile.cdpPort != null) {
          const cdpPort = normalizeNumber(profile.cdpPort, 0, 1);
          if (cdpPort > 0) nextProfile.cdpPort = cdpPort;
        }
        const cdpUrl = normalizeString(profile.cdpUrl);
        if (cdpUrl) nextProfile.cdpUrl = cdpUrl;
        const userDataDir = normalizeString(profile.userDataDir);
        if (userDataDir) nextProfile.userDataDir = userDataDir;
        const color = normalizeString(profile.color);
        if (color) nextProfile.color = color;
        items[id] = nextProfile;
        return items;
      }, {});
      if (Object.keys(nextProfiles).length > 0) {
        openclawConfig.browser.profiles = nextProfiles;
      } else {
        delete openclawConfig.browser.profiles;
      }
    }
  }

  if (payload.logging) {
    openclawConfig.logging = openclawConfig.logging || {};
    deepMerge(openclawConfig.logging, payload.logging as Record<string, any>);
  }

  if (payload.openclaw) {
    const openclawPayload = payload.openclaw as Record<string, unknown>;
    if (Object.hasOwn(openclawPayload, "extraDomains")) {
      applyOpenClawExtraDomains(openclawConfig, openclawPayload.extraDomains);
    }
  }

  sanitizeCriticalConfigForHostSchema(openclawConfig);

  return openclawConfig;
}

function buildConfigUpdatePayloadFromSummary(
  summary: ConfigSummaryPayload,
): ConfigUpdatePayload {
  return {
    defaults: cloneJsonObject(
      summary.defaults,
    ) as ConfigSummaryPayload["defaults"],
    compaction: cloneJsonObject(
      summary.compaction,
    ) as ConfigSummaryPayload["compaction"],
    sandbox: cloneJsonObject(summary.sandbox) as ConfigSummaryPayload["sandbox"],
    tools: cloneJsonObject(summary.tools) as ConfigSummaryPayload["tools"],
    execApprovals: {
      defaults: cloneJsonObject(
        summary.execApprovals.defaults,
      ) as ConfigSummaryPayload["execApprovals"]["defaults"],
      agents: summary.execApprovals.agents.map((agent) => ({
        ...agent,
        allowlist: agent.allowlist.map((entry) => ({ ...entry })),
      })),
    },
    session: cloneJsonObject(
      summary.session,
    ) as ConfigSummaryPayload["session"],
    messages: cloneJsonObject(
      summary.messages,
    ) as ConfigSummaryPayload["messages"],
    providers: summary.providers.map((provider) => ({
      id: provider.id,
      api: provider.api,
      baseUrl: provider.baseUrl,
      models: provider.models.map((model) => ({ ...model })),
      extra: provider.extra,
    })),
  };
}

function resolveConfigPatchPayload(
  config: TracevaneServerConfig,
  openclawConfig: Record<string, any>,
  patch: ConfigPatchPayload,
): ConfigUpdatePayload {
  const basePayload = buildConfigUpdatePayloadFromSummary(
    buildSummary(config, openclawConfig),
  ) as Record<string, any>;
  const normalizedPatch = cloneJsonObject(patch) || {};
  return deepMerge(basePayload, normalizedPatch) as ConfigUpdatePayload;
}

export interface ConfigService {
  getSummary(): ConfigSummaryPayload;
  saveConfig(payload: ConfigUpdatePayload): ConfigSaveResponse;
  patchConfig(payload: ConfigPatchPayload): ConfigSaveResponse;
}

function normalizeApprovalAllowlistEntry(
  entry: {
    pattern: string;
    lastUsedAt: number;
    lastUsedCommand: string;
    lastResolvedPath: string;
  },
  existingEntries: Array<Record<string, any>>,
): Record<string, unknown> | null {
  const pattern = normalizeString(entry.pattern);
  if (!pattern) return null;
  const existing = existingEntries.find(
    (candidate) => String(candidate.pattern || "").trim() === pattern,
  );
  return {
    ...(existing?.id ? { id: existing.id } : {}),
    pattern,
    lastUsedAt: Number(existing?.lastUsedAt || entry.lastUsedAt || 0),
    lastUsedCommand: String(
      existing?.lastUsedCommand || entry.lastUsedCommand || "",
    ).trim(),
    lastResolvedPath: String(
      existing?.lastResolvedPath || entry.lastResolvedPath || "",
    ).trim(),
  };
}

export function createConfigService(config: TracevaneServerConfig): ConfigService {
  const systemEventWriter = createSystemEventWriter({
    stateDir: path.join(config.openclawRoot, "system"),
    maxRecords: 500,
    maxAgeDays: 7,
  });

  function persistConfigPayload(
    payload: ConfigUpdatePayload,
    beforeConfig = readOpenClawConfig(config),
  ): ConfigSaveResponse {
    const beforeAuditSnapshot = buildConfigAuditSnapshot(
      config,
      beforeConfig,
    );
    const openclawConfig = applyConfigUpdate(beforeConfig, payload);
    writeJsonFile(config.openclawConfigFile, openclawConfig);
    const approvalsFile = `${config.openclawRoot}/exec-approvals.json`;
    const approvals = readJsonFile<Record<string, any>>(approvalsFile, {
      socket: {},
      defaults: {},
      agents: {},
    });
    approvals.defaults = approvals.defaults || {};
    approvals.defaults.security = normalizeString(
      payload.execApprovals.defaults.security,
      approvals.defaults.security || "deny",
    );
    approvals.defaults.ask = normalizeString(
      payload.execApprovals.defaults.ask,
      approvals.defaults.ask || "on-miss",
    );
    approvals.defaults.askFallback = normalizeString(
      payload.execApprovals.defaults.askFallback,
      approvals.defaults.askFallback || "deny",
    );
    approvals.defaults.autoAllowSkills =
      payload.execApprovals.defaults.autoAllowSkills === true;
    approvals.agents = approvals.agents || {};

    const nextAgentIds = new Set(
      payload.execApprovals.agents.map((agent) => agent.agentId),
    );
    for (const agentId of Object.keys(approvals.agents)) {
      if (!nextAgentIds.has(agentId)) delete approvals.agents[agentId];
    }

    for (const agent of payload.execApprovals.agents) {
      const agentId = normalizeString(agent.agentId);
      if (!agentId) continue;

      const existingAgent = approvals.agents[agentId] || {};
      const existingAllowlist = Array.isArray(existingAgent.allowlist)
        ? existingAgent.allowlist
        : [];
      const normalizedAllowlist = agent.allowlist
        .map((entry) =>
          normalizeApprovalAllowlistEntry(entry, existingAllowlist),
        )
        .filter((entry): entry is Record<string, unknown> => entry !== null);

      approvals.agents[agentId] = {
        ...existingAgent,
        security: normalizeString(
          agent.security,
          existingAgent.security || "",
        ),
        ask: normalizeString(agent.ask, existingAgent.ask || ""),
        askFallback: normalizeString(
          agent.askFallback,
          existingAgent.askFallback || "",
        ),
        autoAllowSkills: agent.autoAllowSkills === true,
        allowlist: normalizedAllowlist,
      };

      if (!approvals.agents[agentId].security)
        delete approvals.agents[agentId].security;
      if (!approvals.agents[agentId].ask)
        delete approvals.agents[agentId].ask;
      if (!approvals.agents[agentId].askFallback)
        delete approvals.agents[agentId].askFallback;
      if (!approvals.agents[agentId].allowlist?.length)
        delete approvals.agents[agentId].allowlist;
      if (Object.keys(approvals.agents[agentId]).length === 0)
        delete approvals.agents[agentId];
    }

    writeJsonFile(approvalsFile, approvals);

    const afterAuditSnapshot = buildConfigAuditSnapshot(
      config,
      openclawConfig,
    );
    const auditChanges = diffConfigAuditChanges({
      before: beforeAuditSnapshot,
      after: afterAuditSnapshot,
    });
    const auditEvents = buildConfigAuditEvents({ changes: auditChanges });
    systemEventWriter.persistConfigAuditEvents(auditEvents as any);

    return {
      success: true,
      message: "配置已保存",
      config: buildSummary(config, openclawConfig),
    };
  }

  return {
    getSummary(): ConfigSummaryPayload {
      const openclawConfig = readOpenClawConfig(config);
      return buildSummary(config, openclawConfig);
    },

    saveConfig(payload: ConfigUpdatePayload): ConfigSaveResponse {
      return persistConfigPayload(payload);
    },

    patchConfig(payload: ConfigPatchPayload): ConfigSaveResponse {
      const beforeConfig = readOpenClawConfig(config);
      const resolvedPayload = resolveConfigPatchPayload(
        config,
        beforeConfig,
        payload,
      );
      return persistConfigPayload(resolvedPayload, beforeConfig);
    },
  };
}
