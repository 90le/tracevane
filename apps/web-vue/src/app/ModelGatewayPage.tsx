import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  BarChart3,
  Bot,
  Box,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Coins,
  CopyCheck,
  Gauge,
  Globe,
  Info,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Minus,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  RouteOff,
  ScanSearch,
  Search,
  Send,
  Settings2,
  Star,
  Tag,
  Terminal,
  Timer,
  Trash2,
  Users,
  X,
  ZapOff,
  createIcons,
} from "lucide";
import { apiJson } from "./api-client";
import { useShell } from "./shell-context";

type AnyRecord = Record<string, unknown>;
type GatewayView = "overview" | "providers" | "models" | "usage" | "accounts" | "apps";
type ProviderDialogMode = "create" | "edit";
type ProviderFilter = "all" | "online" | "degraded" | "account";
type ProviderConfigSection = "base" | "endpoints" | "models" | "advanced";
type ProviderCreateStep = "preset" | "form";

interface ProviderEndpointDraft {
  localId: string;
  id: string;
  name: string;
  baseUrl: string;
  apiFormat: string;
  authStrategy: string;
  enabled: boolean;
}

interface ProviderModelDraft {
  localId: string;
  id: string;
  label: string;
  aliasesText: string;
  contextWindow: string;
  maxOutputTokens: string;
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
  pricing: AnyRecord;
}

interface ProviderDraft {
  id: string;
  name: string;
  enabled: boolean;
  category: string;
  sourceType: string;
  baseUrl: string;
  apiFormat: string;
  authStrategy: string;
  defaultModel: string;
  models: ProviderModelDraft[];
  endpointProfiles: ProviderEndpointDraft[];
  appScopes: Record<string, boolean>;
  apiKey: string;
  timeoutMs: string;
  firstByteTimeoutMs: string;
  idleTimeoutMs: string;
  proxyUrl: string;
  tlsVerify: boolean;
  supportsThinking: boolean;
  supportsEffort: boolean;
  thinkingParam: string;
  effortParam: string;
  website: string;
  tagsText: string;
  notes: string;
}

interface ProviderCreatePreset {
  id: string;
  title: string;
  desc: string;
  icon: string;
  providerId: string;
  name: string;
  baseUrl: string;
  apiFormat: string;
  authStrategy: string;
  category: string;
  sourceType: string;
  endpointName: string;
  modelId: string;
  aliasesText: string;
  appScopes: string[];
  tagsText: string;
  supportsThinking?: boolean;
  supportsEffort?: boolean;
  thinkingParam?: string;
  effortParam?: string;
}

const gatewayQueries = {
  status: "/api/model-gateway/status",
  runtime: "/api/model-gateway/runtime",
  providers: "/api/model-gateway/providers",
  appConnections: "/api/model-gateway/app-connections",
  usage: "/api/model-gateway/usage",
} as const;

const modelGatewayIcons = {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  BarChart3,
  Bot,
  Box,
  Brain,
  Check,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDot,
  Coins,
  CopyCheck,
  Gauge,
  Globe,
  Info,
  KeyRound,
  LayoutDashboard,
  LogIn,
  LogOut,
  Minus,
  Pencil,
  Plug,
  PlugZap,
  Plus,
  RefreshCw,
  RotateCcw,
  Route,
  RouteOff,
  ScanSearch,
  Search,
  Send,
  Settings2,
  Star,
  Tag,
  Terminal,
  Timer,
  Trash2,
  Users,
  X,
  ZapOff,
};

const appScopeOptions = [
  ["codex", "Codex"],
  ["claude-code", "Claude Code"],
  ["opencode", "OpenCode"],
  ["openclaw", "OpenClaw"],
] as const;

const apiFormatOptions = [
  ["openai_chat", "OpenAI Chat（聊天）"],
  ["openai_responses", "OpenAI Responses（响应）"],
  ["anthropic_messages", "Anthropic Messages"],
  ["gemini_native", "Gemini 原生"],
] as const;

function apiFormatLabel(value: unknown): string {
  const text = String(value ?? "");
  return apiFormatOptions.find(([id]) => id === text)?.[1]?.replace(/（.*$/, "") || text || "自定义协议";
}

const authStrategyOptions = [
  ["bearer", "Bearer 密钥"],
  ["anthropic_api_key", "Anthropic API Key"],
  ["openrouter", "OpenRouter"],
  ["oauth_proxy", "OAuth 代理"],
  ["none", "无鉴权"],
] as const;

const categoryOptions = [
  ["official", "官方"],
  ["openai-compatible", "OpenAI 兼容"],
  ["aggregator", "聚合平台"],
  ["local", "本地"],
  ["custom", "自定义"],
] as const;

const sourceTypeOptions = [
  ["api-key", "密钥"],
  ["account-backed", "账号池"],
  ["external-relay", "外部转发"],
] as const;

const thinkingParamOptions = [
  ["none", "不透传"],
  ["thinking", "thinking"],
  ["enable_thinking", "enable_thinking"],
  ["reasoning_split", "reasoning_split"],
] as const;

const effortParamOptions = [
  ["none", "不透传"],
  ["reasoning_effort", "reasoning_effort"],
  ["reasoning.effort", "reasoning.effort"],
] as const;

const providerFilterOptions: Array<[ProviderFilter, string]> = [
  ["all", "全部"],
  ["online", "在线"],
  ["degraded", "降级"],
  ["account", "账号制"],
];

const providerConfigSections: Array<[ProviderConfigSection, string, string]> = [
  ["base", "基础", "名称、协议、鉴权和密钥"],
  ["endpoints", "Endpoint", "端点地址和协议覆盖"],
  ["models", "模型", "模型 ID、alias 和默认模型"],
  ["advanced", "高级", "网络、推理、元数据和危险操作"],
];

const providerCreatePresets: ProviderCreatePreset[] = [
  {
    id: "glm-coding-openai",
    title: "GLM 编程端点 · OpenAI Chat",
    desc: "用于 Codex、OpenCode、Cline 等 OpenAI Chat Completions 兼容客户端。",
    icon: "route",
    providerId: "glm-coding-openai",
    name: "GLM Coding OpenAI",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    category: "official",
    sourceType: "api-key",
    endpointName: "OpenAI Chat 编程端点",
    modelId: "glm-5.2",
    aliasesText: "glm, coding",
    appScopes: ["codex", "opencode", "openclaw"],
    tagsText: "glm, coding, openai-compatible",
    supportsThinking: true,
    supportsEffort: true,
  },
  {
    id: "glm-coding-anthropic",
    title: "GLM 编程端点 · Anthropic Messages",
    desc: "用于 Claude Code、Goose 等 Anthropic Messages 兼容客户端。",
    icon: "bot",
    providerId: "glm-coding-anthropic",
    name: "GLM Coding Anthropic",
    baseUrl: "https://open.bigmodel.cn/api/anthropic",
    apiFormat: "anthropic_messages",
    authStrategy: "anthropic_api_key",
    category: "official",
    sourceType: "api-key",
    endpointName: "Anthropic Messages 编程端点",
    modelId: "glm-5.2",
    aliasesText: "glm-claude, coding",
    appScopes: ["claude-code", "openclaw"],
    tagsText: "glm, coding, anthropic-compatible",
    supportsThinking: true,
    supportsEffort: true,
  },
  {
    id: "openai-compatible",
    title: "OpenAI 兼容 API",
    desc: "用于第三方聚合平台、本地代理或任何 /v1/chat/completions 兼容服务。",
    icon: "plug-zap",
    providerId: "openai-compatible",
    name: "OpenAI Compatible",
    baseUrl: "https://api.example.com/v1",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    category: "openai-compatible",
    sourceType: "api-key",
    endpointName: "主 endpoint",
    modelId: "model-id",
    aliasesText: "",
    appScopes: ["codex", "claude-code", "opencode", "openclaw"],
    tagsText: "openai-compatible",
  },
  {
    id: "blank",
    title: "空白自定义",
    desc: "只给出最小必填骨架，适合本地模型、代理网关或暂未归类的 Provider。",
    icon: "settings-2",
    providerId: "",
    name: "",
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    category: "custom",
    sourceType: "api-key",
    endpointName: "主 endpoint",
    modelId: "model-id",
    aliasesText: "",
    appScopes: ["codex", "claude-code", "opencode", "openclaw"],
    tagsText: "",
  },
];

function asRecord(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as AnyRecord : {};
}

function listAt(value: unknown, path: string[]): unknown[] {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return Array.isArray(current) ? current : [];
}

function recordAt(value: unknown, path: string[]): AnyRecord {
  let current: unknown = value;
  for (const key of path) current = asRecord(current)[key];
  return asRecord(current);
}

function textAt(value: unknown, keys: string[], fallback = "-"): string {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "string" && direct.trim()) return direct;
    if (typeof direct === "number" || typeof direct === "boolean") return String(direct);
  }
  return fallback;
}

function numberAt(value: unknown, keys: string[], fallback = 0): number {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  }
  return fallback;
}

function boolAt(value: unknown, keys: string[], fallback = false): boolean {
  const record = asRecord(value);
  for (const key of keys) {
    const direct = record[key];
    if (typeof direct === "boolean") return direct;
  }
  return fallback;
}

function positiveIntegerOrUndefined(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function formatCompact(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  if (Math.abs(number) >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (Math.abs(number) >= 1_000) return `${(number / 1_000).toFixed(1)}k`;
  return String(number);
}

function formatMs(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : null;
  return number === null ? "-" : `${Math.round(number)}ms`;
}

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function compactList(values: unknown[], fallback = "-"): string {
  const cleaned = values.map((value) => String(value ?? "").trim()).filter(Boolean);
  return cleaned.length ? cleaned.join(" · ") : fallback;
}

function formatTokens(value: unknown): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "-";
  if (number >= 1000) return `${Math.round(number / 1000)}k tokens`;
  return `${number} tokens`;
}

function formatPricing(value: unknown, currency = "¥"): string {
  const number = typeof value === "number" && Number.isFinite(value) ? value : null;
  return number === null ? "-" : `${currency}${number} / 1M`;
}

function accountStateLabel(value: unknown): string {
  const text = String(value ?? "");
  if (text === "ready") return "正常";
  if (text === "cooldown") return "冷却";
  if (text === "needs-login") return "需登录";
  if (text === "refreshing") return "刷新中";
  if (text === "disabled") return "停用";
  if (text === "error") return "异常";
  return text || "未知";
}

function formatRelativeFuture(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "-";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) return "可重试";
  const minutes = Math.ceil(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.ceil(minutes / 60)}h`;
}

function providerEndpointDraft(
  endpoint: AnyRecord,
  provider: AnyRecord,
  index: number,
): ProviderEndpointDraft {
  const fallbackId = index === 0 ? "primary" : `endpoint-${index + 1}`;
  const id = textAt(endpoint, ["id"], fallbackId);
  return {
    localId: `${id}-${index}`,
    id,
    name: textAt(endpoint, ["name"], index === 0 ? "主 endpoint" : `Endpoint ${index + 1}`),
    baseUrl: textAt(endpoint, ["baseUrl"], textAt(provider, ["baseUrl"], "")),
    apiFormat: textAt(endpoint, ["apiFormat"], textAt(provider, ["apiFormat"], "openai_chat")),
    authStrategy: textAt(endpoint, ["authStrategy"], textAt(provider, ["authStrategy"], "bearer")),
    enabled: endpoint.enabled !== false,
  };
}

function newProviderEndpointDraft(baseUrl: string, apiFormat: string, authStrategy: string, index: number): ProviderEndpointDraft {
  const id = index === 0 ? "primary" : `endpoint-${index + 1}`;
  return {
    localId: `${id}-${Date.now().toString(36)}`,
    id,
    name: index === 0 ? "主 endpoint" : `Endpoint ${index + 1}`,
    baseUrl,
    apiFormat,
    authStrategy,
    enabled: true,
  };
}

function providerModelDraft(model: AnyRecord, index: number): ProviderModelDraft {
  const id = textAt(model, ["id"], index === 0 ? "model-id" : `model-${index + 1}`);
  const features = recordAt(model, ["features"]);
  return {
    localId: `${id}-${index}`,
    id,
    label: textAt(model, ["label"], ""),
    aliasesText: listAt(model, ["aliases"]).map(String).join(", "),
    contextWindow: numberAt(model, ["contextWindow"], 0) > 0 ? String(numberAt(model, ["contextWindow"], 0)) : "",
    maxOutputTokens: numberAt(model, ["maxOutputTokens"], 0) > 0 ? String(numberAt(model, ["maxOutputTokens"], 0)) : "",
    streaming: boolAt(features, ["streaming"], true),
    tools: boolAt(features, ["tools"], false),
    vision: boolAt(features, ["vision"], false),
    reasoning: boolAt(features, ["reasoning"], false),
    pricing: recordAt(model, ["pricing"]),
  };
}

function newProviderModelDraft(index: number): ProviderModelDraft {
  const id = index === 0 ? "model-id" : `model-${index + 1}`;
  return {
    localId: `${id}-${Date.now().toString(36)}`,
    id,
    label: "",
    aliasesText: "",
    contextWindow: "",
    maxOutputTokens: "",
    streaming: true,
    tools: true,
    vision: false,
    reasoning: true,
    pricing: {},
  };
}

function emptyProviderDraft(): ProviderDraft {
  return {
    id: "",
    name: "",
    enabled: true,
    category: "custom",
    sourceType: "api-key",
    baseUrl: "",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    defaultModel: "",
    models: [],
    endpointProfiles: [],
    appScopes: Object.fromEntries(appScopeOptions.map(([scope]) => [scope, true])),
    apiKey: "",
    timeoutMs: "30000",
    firstByteTimeoutMs: "8000",
    idleTimeoutMs: "60000",
    proxyUrl: "",
    tlsVerify: true,
    supportsThinking: true,
    supportsEffort: true,
    thinkingParam: "thinking",
    effortParam: "reasoning_effort",
    website: "",
    tagsText: "",
    notes: "",
  };
}

function draftFromCreatePreset(preset: ProviderCreatePreset): ProviderDraft {
  const model = {
    ...newProviderModelDraft(0),
    id: preset.modelId,
    label: preset.modelId,
    aliasesText: preset.aliasesText,
    reasoning: preset.supportsThinking ?? true,
  };
  return {
    ...emptyProviderDraft(),
    id: preset.providerId,
    name: preset.name,
    category: preset.category,
    sourceType: preset.sourceType,
    baseUrl: preset.baseUrl,
    apiFormat: preset.apiFormat,
    authStrategy: preset.authStrategy,
    defaultModel: preset.modelId,
    models: [model],
    endpointProfiles: [{
      ...newProviderEndpointDraft(preset.baseUrl, preset.apiFormat, preset.authStrategy, 0),
      name: preset.endpointName,
    }],
    appScopes: Object.fromEntries(appScopeOptions.map(([scope]) => [scope, preset.appScopes.includes(scope)])),
    supportsThinking: preset.supportsThinking ?? true,
    supportsEffort: preset.supportsEffort ?? true,
    thinkingParam: preset.thinkingParam ?? "thinking",
    effortParam: preset.effortParam ?? "reasoning_effort",
    tagsText: preset.tagsText,
  };
}

function draftFromProvider(provider: AnyRecord | null): ProviderDraft {
  if (!provider) return emptyProviderDraft();
  const modelsPayload = recordAt(provider, ["models"]);
  const modelRows = listAt(modelsPayload, ["models"]).map(asRecord);
  const endpointRows = listAt(provider, ["endpointProfiles"]).map(asRecord);
  const network = recordAt(provider, ["network"]);
  const reasoning = recordAt(provider, ["reasoning"]);
  const metadata = recordAt(provider, ["metadata"]);
  return {
    id: textAt(provider, ["id"], ""),
    name: textAt(provider, ["name"], ""),
    enabled: provider.enabled !== false,
    category: textAt(provider, ["category"], "custom"),
    sourceType: textAt(provider, ["sourceType"], "api-key"),
    baseUrl: textAt(provider, ["baseUrl"], ""),
    apiFormat: textAt(provider, ["apiFormat"], "openai_chat"),
    authStrategy: textAt(provider, ["authStrategy"], "bearer"),
    defaultModel: textAt(modelsPayload, ["defaultModel"], ""),
    models: modelRows.map((model, index) => providerModelDraft(model, index)),
    endpointProfiles: endpointRows.map((endpoint, index) => providerEndpointDraft(endpoint, provider, index)),
    appScopes: Object.fromEntries(appScopeOptions.map(([scope]) => [scope, listAt(provider, ["appScopes"]).map(String).includes(scope)])),
    apiKey: "",
    timeoutMs: String(numberAt(network, ["timeoutMs"], 30000)),
    firstByteTimeoutMs: String(numberAt(network, ["streamingFirstByteTimeoutMs"], 8000)),
    idleTimeoutMs: String(numberAt(network, ["streamingIdleTimeoutMs"], 60000)),
    proxyUrl: textAt(network, ["proxyUrl"], ""),
    tlsVerify: boolAt(network, ["tlsVerify"], true),
    supportsThinking: boolAt(reasoning, ["supportsThinking"], true),
    supportsEffort: boolAt(reasoning, ["supportsEffort"], true),
    thinkingParam: textAt(reasoning, ["thinkingParam"], "thinking"),
    effortParam: textAt(reasoning, ["effortParam"], "reasoning_effort"),
    website: textAt(metadata, ["website"], ""),
    tagsText: listAt(metadata, ["tags"]).map(String).join(", "),
    notes: textAt(metadata, ["notes"], ""),
  };
}

function modelCatalogFromDraft(draft: ProviderDraft): AnyRecord {
  const rows = draft.models
    .map((model) => ({ ...model, id: model.id.trim() }))
    .filter((model) => model.id);
  const ids = Array.from(new Set(rows.map((model) => model.id)));
  const aliases: Record<string, string> = {};
  const models = rows
    .filter((model, index) => rows.findIndex((row) => row.id === model.id) === index)
    .map((model) => {
      const modelAliases = Array.from(new Set(model.aliasesText.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean)));
      for (const alias of modelAliases) aliases[alias] = model.id;
      return {
        id: model.id,
        label: model.label.trim() || undefined,
        aliases: modelAliases,
        contextWindow: positiveIntegerOrUndefined(model.contextWindow),
        maxOutputTokens: positiveIntegerOrUndefined(model.maxOutputTokens),
        features: {
          streaming: model.streaming,
          tools: model.tools,
          vision: model.vision,
          reasoning: model.reasoning,
        },
        pricing: Object.keys(model.pricing).length ? model.pricing : undefined,
      };
    });
  return {
    defaultModel: draft.defaultModel.trim() || ids[0] || null,
    models,
    aliases,
  };
}

function endpointProfilesFromDraft(draft: ProviderDraft): AnyRecord[] | undefined {
  const rows = draft.endpointProfiles.filter((endpoint) => (
    endpoint.id.trim() || endpoint.name.trim() || endpoint.baseUrl.trim()
  ));
  if (!rows.length) return undefined;
  return rows.map((endpoint, index) => {
    return {
      id: endpoint.id.trim() || `endpoint-${index + 1}`,
      name: endpoint.name.trim() || endpoint.id.trim() || `Endpoint ${index + 1}`,
      baseUrl: endpoint.baseUrl.trim() || draft.baseUrl.trim(),
      apiFormat: endpoint.apiFormat || draft.apiFormat,
      authStrategy: endpoint.authStrategy || draft.authStrategy,
      enabled: endpoint.enabled,
      appScopes: appScopeOptions.filter(([scope]) => draft.appScopes[scope]).map(([scope]) => scope),
      models: null,
      network: {
        timeoutMs: positiveIntegerOrUndefined(draft.timeoutMs),
        streamingFirstByteTimeoutMs: positiveIntegerOrUndefined(draft.firstByteTimeoutMs),
        streamingIdleTimeoutMs: positiveIntegerOrUndefined(draft.idleTimeoutMs),
        proxyUrl: draft.proxyUrl.trim() || null,
        tlsVerify: draft.tlsVerify,
      },
      reasoning: {
        supportsThinking: draft.supportsThinking,
        supportsEffort: draft.supportsEffort,
        thinkingParam: draft.supportsThinking ? draft.thinkingParam : "none",
        effortParam: draft.supportsEffort ? draft.effortParam : "none",
      },
    };
  });
}

function providerInputFromDraft(draft: ProviderDraft): AnyRecord {
  const endpointProfiles = endpointProfilesFromDraft(draft);
  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    enabled: draft.enabled,
    category: draft.category,
    sourceType: draft.sourceType,
    appScopes: appScopeOptions.filter(([scope]) => draft.appScopes[scope]).map(([scope]) => scope),
    baseUrl: draft.baseUrl.trim(),
    apiFormat: draft.apiFormat,
    authStrategy: draft.authStrategy,
    models: modelCatalogFromDraft(draft),
    network: {
      timeoutMs: positiveIntegerOrUndefined(draft.timeoutMs),
      streamingFirstByteTimeoutMs: positiveIntegerOrUndefined(draft.firstByteTimeoutMs),
      streamingIdleTimeoutMs: positiveIntegerOrUndefined(draft.idleTimeoutMs),
      proxyUrl: draft.proxyUrl.trim() || null,
      tlsVerify: draft.tlsVerify,
    },
    reasoning: {
      supportsThinking: draft.supportsThinking,
      supportsEffort: draft.supportsEffort,
      thinkingParam: draft.supportsThinking ? draft.thinkingParam : "none",
      effortParam: draft.supportsEffort ? draft.effortParam : "none",
    },
    metadata: {
      website: draft.website.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      tags: draft.tagsText.split(",").map((value) => value.trim()).filter(Boolean),
    },
    ...(endpointProfiles ? { endpointProfiles } : {}),
  };
}

function validateProviderDraft(draft: ProviderDraft): string | null {
  const id = draft.id.trim();
  const name = draft.name.trim();
  if (!id || !name) return "Provider ID 和名称不能为空";
  const invalidEndpoint = draft.endpointProfiles.find((endpoint) => (
    !endpoint.id.trim() || !endpoint.name.trim() || !endpoint.baseUrl.trim()
  ));
  if (invalidEndpoint) return "Endpoint 的 ID、名称和 baseUrl 都不能为空";
  const modelIds = draft.models.map((model) => model.id.trim()).filter(Boolean);
  if (!modelIds.length) return "至少需要一个模型 ID";
  if (new Set(modelIds).size !== modelIds.length) return "模型 ID 不能重复";
  const defaultModel = draft.defaultModel.trim();
  if (defaultModel && !modelIds.includes(defaultModel)) return "默认模型必须来自模型目录";
  const aliases = draft.models.flatMap((model) => model.aliasesText.split(/\r?\n|,/).map((value) => value.trim()).filter(Boolean));
  if (new Set(aliases).size !== aliases.length) return "模型 alias 不能重复";
  return null;
}

function stateTone(value: unknown): "ok" | "warn" | "bad" | "info" {
  const text = String(value ?? "").toLowerCase();
  if (/(healthy|running|active|ok|ready|closed|success|online|applied|configured|fixed|auto|fallback)/.test(text)) return "ok";
  if (/(failed|error|invalid|offline|open|missing|disabled|stopped|false)/.test(text)) return "bad";
  if (/(degraded|warning|warn|stale|half-open|pending|adapter-required|unsupported)/.test(text)) return "warn";
  return "info";
}

function StatusTag({ value }: { value: unknown }) {
  const tone = stateTone(value);
  return <span className={`tag ${tone === "bad" ? "bad" : tone === "warn" ? "warn" : tone === "ok" ? "ok" : "info"}`}>{String(value ?? "unknown")}</span>;
}

function ProviderStatusDot({ value }: { value: unknown }) {
  const tone = stateTone(value);
  const cls = tone === "bad" ? "s-bad" : tone === "warn" ? "s-warn" : "s-ok";
  return <span className={`status-dot ${cls}`}><i />{String(value ?? "unknown")}</span>;
}

function QueryNotice({ query, label }: { query: { isLoading: boolean; isError: boolean; error: unknown }; label: string }) {
  if (query.isLoading) return <div className="statebox"><span className="spinner" /><strong>{label} 加载中</strong></div>;
  if (query.isError) {
    const message = query.error instanceof Error ? query.error.message : "加载失败";
    return <div className="statebox error"><span className="si"><i data-lucide="circle-alert" /></span><strong>{label} 不可用</strong><span>{message}</span></div>;
  }
  return null;
}

function Metric({ icon, label, value, sub }: { icon: string; label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="hero-stat">
      <span className="lab"><i data-lucide={icon} />{label}</span>
      <span className="val">{value}</span>
      <span className="trend flat"><i data-lucide="minus" />{sub}</span>
    </div>
  );
}

function providerSearchText(provider: AnyRecord): string {
  const models = listAt(provider, ["models", "models"]).map(asRecord).map((model) => textAt(model, ["id", "label"], ""));
  const endpoints = listAt(provider, ["endpointProfiles"]).map(asRecord).map((endpoint) => compactList([textAt(endpoint, ["name", "id"], ""), textAt(endpoint, ["apiFormat"], ""), textAt(endpoint, ["baseUrl"], "")], ""));
  return [
    textAt(provider, ["id"], ""),
    textAt(provider, ["name"], ""),
    textAt(provider, ["apiFormat"], ""),
    textAt(provider, ["category"], ""),
    textAt(provider, ["sourceType"], ""),
    compactList(listAt(provider, ["appScopes"]), ""),
    ...models,
    ...endpoints,
  ].join(" ").toLowerCase();
}

function providerMatchesFilter(provider: AnyRecord, filter: ProviderFilter): boolean {
  if (filter === "all") return true;
  if (filter === "account") return Boolean(provider.accountProvider) || textAt(provider, ["authStrategy"], "").toLowerCase().includes("account");
  const health = recordAt(provider, ["health"]);
  const state = provider.enabled === false ? "disabled" : textAt(health, ["circuitState"], "enabled");
  const tone = stateTone(state);
  if (filter === "online") return tone === "ok";
  return tone === "warn" || tone === "bad";
}

function routeScopeLabel(value: unknown): string {
  const scope = String(value ?? "");
  if (scope === "codex") return "Codex";
  if (scope === "claude-code") return "Claude Code";
  if (scope === "opencode") return "OpenCode";
  if (scope === "openclaw") return "OpenClaw";
  if (scope === "default") return "默认 / 其他客户端";
  return scope || "未命名客户端";
}

function routeScopeIcon(value: unknown): string {
  const scope = String(value ?? "");
  return scope === "default" || scope === "openclaw" ? "globe" : "terminal";
}

function routeScopeTone(index: number): string {
  return ["ico-teal", "ico-violet", "ico-primary", "r-green"][index % 4] || "ico-primary";
}

function GatewayProviderTableRow({
  provider,
  selected,
  onSelect,
  onEdit,
  onTest,
  onAccounts,
}: {
  provider: AnyRecord;
  selected: boolean;
  onSelect: () => void;
  onEdit: (provider: AnyRecord) => void;
  onTest: (provider: AnyRecord) => void;
  onAccounts: (provider: AnyRecord) => void;
}) {
  const health = recordAt(provider, ["health"]);
  const models = listAt(provider, ["models", "models"]);
  const endpointProfiles = listAt(provider, ["endpointProfiles"]);
  const accountProvider = asRecord(provider.accountProvider);
  const icon = provider.accountProvider ? "bot" : endpointProfiles.length > 1 ? "route" : "plug-zap";
  const status = provider.enabled ? textAt(health, ["circuitState"], "enabled") : "disabled";
  const defaultModel = textAt(recordAt(provider, ["models"]), ["defaultModel"], "");
  const providerKind = accountProvider.kind ? "Codex 账号" : apiFormatLabel(textAt(provider, ["apiFormat"], ""));

  return (
    <div
      className={`trow ${selected ? "sel" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span className="cell-main">
        <span className="rico ico-primary"><i data-lucide={icon} /></span>
        <span className="c-copy">
          <strong>{textAt(provider, ["name", "id"], "Provider")}</strong>
          <span>{compactList([defaultModel || "未设默认模型", `${models.length} models`, endpointProfiles.length ? `${endpointProfiles.length} endpoint` : "基础 endpoint"])}</span>
        </span>
      </span>
      <span><span className="tag info">{providerKind}</span></span>
      <span><ProviderStatusDot value={status} /></span>
      <span className="route-acts provider-row-actions">
        <button className="btn-primary btn-sm" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); onEdit(provider); }}><i data-lucide="settings-2" />配置</button>
        {accountProvider.kind ? <button className="btn-ghost btn-sm" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); onAccounts(provider); }}><i data-lucide="users" />账号池</button> : null}
        <button className="btn-ghost btn-sm" type="button" onClick={(event) => { event.stopPropagation(); onSelect(); onTest(provider); }}><i data-lucide="activity" />检查</button>
      </span>
    </div>
  );
}

export function ModelGatewayPage() {
  const shell = useShell();
  const [view, setView] = useState<GatewayView>("overview");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [providerSearch, setProviderSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState<ProviderFilter>("all");
  const [providerDialogMode, setProviderDialogMode] = useState<ProviderDialogMode | null>(null);
  const [providerDraft, setProviderDraft] = useState<ProviderDraft>(() => emptyProviderDraft());
  const [providerBusy, setProviderBusy] = useState(false);
  const [providerCreateStep, setProviderCreateStep] = useState<ProviderCreateStep>("preset");
  const [providerConfigSection, setProviderConfigSection] = useState<ProviderConfigSection>("base");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [modelSearch, setModelSearch] = useState("");
  const [editingAliasKey, setEditingAliasKey] = useState("");
  const [modelAliasDraft, setModelAliasDraft] = useState("");

  const status = useQuery({ queryKey: ["model-gateway", "status"], queryFn: () => apiJson(gatewayQueries.status), retry: false });
  const runtime = useQuery({ queryKey: ["model-gateway", "runtime"], queryFn: () => apiJson(gatewayQueries.runtime), retry: false });
  const providers = useQuery({ queryKey: ["model-gateway", "providers"], queryFn: () => apiJson(gatewayQueries.providers), retry: false });
  const appConnections = useQuery({ queryKey: ["model-gateway", "app-connections"], queryFn: () => apiJson(gatewayQueries.appConnections), retry: false });
  const usage = useQuery({ queryKey: ["model-gateway", "usage"], queryFn: () => apiJson(gatewayQueries.usage), retry: false });

  useEffect(() => {
    shell.refreshIcons();
  }, [shell, view, providerSearch, providerFilter, modelSearch, status.data, runtime.data, providers.data, appConnections.data, usage.data]);

  const providerRows = listAt(providers.data, ["providers"]).map(asRecord);
  const activeRoutes = listAt(providers.data, ["activeRoutes"]).map(asRecord);
  const activeRouteAlerts = listAt(providers.data, ["activeRouteAlerts"]);
  const connectionRows = listAt(appConnections.data, ["connections"]).map(asRecord);
  const usageModels = listAt(usage.data, ["models"]).map(asRecord);
  const usageTotals = recordAt(usage.data, ["totals"]);
  const healthSummary = recordAt(status.data, ["healthSummary"]);
  const runtimeUsage = recordAt(status.data, ["runtime", "usageSummary"]);
  const latency = recordAt(runtimeUsage, ["latency"]);
  const selectedProvider = useMemo(() => {
    if (!providerRows.length) return null;
    return providerRows.find((provider) => textAt(provider, ["id"], "") === selectedProviderId) ?? providerRows[0];
  }, [providerRows, selectedProviderId]);
  const selectedProviderHealth = selectedProvider ? recordAt(selectedProvider, ["health"]) : {};
  const filteredProviders = useMemo(() => {
    const needle = providerSearch.trim().toLowerCase();
    return providerRows.filter((provider) => providerMatchesFilter(provider, providerFilter) && (!needle || providerSearchText(provider).includes(needle)));
  }, [providerRows, providerFilter, providerSearch]);

  useEffect(() => {
    if (!selectedProviderId && providerRows.length) setSelectedProviderId(textAt(providerRows[0], ["id"], ""));
  }, [providerRows, selectedProviderId]);

  const refetchGatewayData = async () => {
    await Promise.all([
      status.refetch(),
      providers.refetch(),
      appConnections.refetch(),
      usage.refetch(),
    ]);
  };

  const openProviderEdit = (provider: AnyRecord) => {
    setProviderDraft(draftFromProvider(provider));
    setProviderCreateStep("form");
    setProviderConfigSection("base");
    setProviderDialogMode("edit");
  };

  const openProviderCreate = () => {
    setProviderDraft(emptyProviderDraft());
    setProviderCreateStep("preset");
    setProviderConfigSection("base");
    setProviderDialogMode("create");
  };

  const selectProviderCreatePreset = (preset: ProviderCreatePreset) => {
    setProviderDraft(draftFromCreatePreset(preset));
    setProviderCreateStep("form");
    setProviderConfigSection("base");
  };

  const updateEndpointDraft = (index: number, patch: Partial<ProviderEndpointDraft>) => {
    setProviderDraft((draft) => ({
      ...draft,
      endpointProfiles: draft.endpointProfiles.map((endpoint, itemIndex) => (
        itemIndex === index ? { ...endpoint, ...patch } : endpoint
      )),
    }));
  };

  const addEndpointDraft = () => {
    setProviderDraft((draft) => ({
      ...draft,
      endpointProfiles: [
        ...draft.endpointProfiles,
        newProviderEndpointDraft(draft.baseUrl.trim(), draft.apiFormat, draft.authStrategy, draft.endpointProfiles.length),
      ],
    }));
  };

  const removeEndpointDraft = (index: number) => {
    setProviderDraft((draft) => ({
      ...draft,
      endpointProfiles: draft.endpointProfiles.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const updateModelDraft = (index: number, patch: Partial<ProviderModelDraft>) => {
    setProviderDraft((draft) => ({
      ...draft,
      models: draft.models.map((model, itemIndex) => (
        itemIndex === index ? { ...model, ...patch } : model
      )),
    }));
  };

  const addModelDraft = () => {
    setProviderDraft((draft) => ({
      ...draft,
      models: [...draft.models, newProviderModelDraft(draft.models.length)],
    }));
  };

  const removeModelDraft = (index: number) => {
    setProviderDraft((draft) => {
      const models = draft.models.filter((_, itemIndex) => itemIndex !== index);
      const defaultModelStillExists = models.some((model) => model.id.trim() === draft.defaultModel.trim());
      return {
        ...draft,
        models,
        defaultModel: defaultModelStillExists ? draft.defaultModel : models[0]?.id.trim() ?? "",
      };
    });
  };

  const setDefaultModelFromDraft = (modelId: string) => {
    setProviderDraft((draft) => ({
      ...draft,
      defaultModel: modelId.trim(),
    }));
  };

  const saveProviderDraft = async () => {
    const id = providerDraft.id.trim();
    const validation = validateProviderDraft(providerDraft);
    if (validation) {
      shell.toast(validation, "warn");
      return;
    }
    setProviderBusy(true);
    try {
      await apiJson(providerDialogMode === "create" ? "/api/model-gateway/providers" : `/api/model-gateway/providers/${encodeURIComponent(id)}`, {
        method: providerDialogMode === "create" ? "POST" : "PUT",
        body: {
          provider: providerInputFromDraft(providerDraft),
          secret: providerDraft.apiKey.trim() ? { apiKey: providerDraft.apiKey.trim() } : undefined,
        },
      });
      setSelectedProviderId(id);
      setProviderDialogMode(null);
      setProviderCreateStep("preset");
      setProviderDraft(emptyProviderDraft());
      shell.toast("Provider 已保存", "ok");
      await refetchGatewayData();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "Provider 保存失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const updateProviderFromDraft = async (draft: ProviderDraft, successMessage: string) => {
    const id = draft.id.trim();
    if (!id) return;
    const validation = validateProviderDraft(draft);
    if (validation) {
      shell.toast(validation, "warn");
      return;
    }
    setProviderBusy(true);
    try {
      await apiJson(`/api/model-gateway/providers/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: { provider: providerInputFromDraft(draft) },
      });
      shell.toast(successMessage, "ok");
      await refetchGatewayData();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "Provider 更新失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const updateProviderModelCatalog = async (
    providerId: string,
    mutate: (draft: ProviderDraft) => ProviderDraft,
    successMessage: string,
  ) => {
    const provider = providerRows.find((row) => textAt(row, ["id"], "") === providerId);
    if (!provider) {
      shell.toast("未找到 Provider", "warn");
      return;
    }
    await updateProviderFromDraft(mutate(draftFromProvider(provider)), successMessage);
  };

  const setProviderDefaultModel = (provider: AnyRecord, modelId: string) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId || !modelId.trim()) return;
    void updateProviderModelCatalog(
      providerId,
      (draft) => ({ ...draft, defaultModel: modelId.trim() }),
      "默认模型已更新",
    );
  };

  const startModelAliasEdit = (rowKey: string, aliases: string[]) => {
    setEditingAliasKey(rowKey);
    setModelAliasDraft(aliases.join(", "));
  };

  const cancelModelAliasEdit = () => {
    setEditingAliasKey("");
    setModelAliasDraft("");
  };

  const saveModelAlias = async (row: { key: string; providerId: string; model: AnyRecord }) => {
    const modelId = textAt(row.model, ["id"], "");
    if (!modelId) return;
    await updateProviderModelCatalog(
      row.providerId,
      (draft) => ({
        ...draft,
        models: draft.models.map((model) => (
          model.id.trim() === modelId ? { ...model, aliasesText: modelAliasDraft } : model
        )),
      }),
      "模型 alias 已保存",
    );
    cancelModelAliasEdit();
  };

  const toggleProviderEnabled = (provider: AnyRecord) => {
    const draft = draftFromProvider(provider);
    void updateProviderFromDraft({ ...draft, enabled: !draft.enabled }, draft.enabled ? "Provider 已停用" : "Provider 已启用");
  };

  const setActiveProvider = async (scope: string, provider: AnyRecord) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId) return;
    setProviderBusy(true);
    try {
      await apiJson("/api/model-gateway/active-provider", {
        method: "POST",
        body: { scope, providerId },
      });
      shell.toast(`${scope} 路由已指向 ${textAt(provider, ["name"], providerId)}`, "ok");
      await providers.refetch();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "默认路由更新失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const testProvider = async (provider: AnyRecord) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId) return;
    setProviderBusy(true);
    try {
      const models = recordAt(provider, ["models"]);
      const result = await apiJson<AnyRecord>(`/api/model-gateway/providers/${encodeURIComponent(providerId)}/test`, {
        method: "POST",
        body: {
          kind: "protocol",
          model: textAt(models, ["defaultModel"], ""),
          timeoutMs: 30000,
        },
      });
      shell.openSheet({
        title: "Provider 连通检查",
        sub: textAt(provider, ["name", "id"], providerId),
        status: result.ok ? "ok" : "failed",
        owner: "Model Gateway",
        action: "provider test",
        note: JSON.stringify(result, null, 2).slice(0, 3000),
      });
      await providers.refetch();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "连通检查失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const detectSelectedProvider = async () => {
    if (!selectedProvider) return;
    const models = recordAt(selectedProvider, ["models"]);
    setProviderBusy(true);
    try {
      const result = await apiJson<AnyRecord>("/api/model-gateway/detect-provider", {
        method: "POST",
        body: {
          baseUrl: textAt(selectedProvider, ["baseUrl"], ""),
          model: textAt(models, ["defaultModel"], ""),
          timeoutMs: 30000,
        },
      });
      shell.openSheet({
        title: "Provider 探测结果",
        sub: textAt(selectedProvider, ["name", "id"], "Provider"),
        status: "ok",
        owner: "Model Gateway",
        action: "provider detect",
        note: JSON.stringify(result, null, 2).slice(0, 5000),
      });
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "Provider 探测失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const testRouteProvider = (route: AnyRecord) => {
    const providerId = textAt(route, ["resolvedProviderId", "providerId"], "");
    const routeProvider = providerRows.find((provider) => textAt(provider, ["id"], "") === providerId);
    if (routeProvider) {
      void testProvider(routeProvider);
      return;
    }
    shell.toast("该路由尚未解析到可检查的 Provider", "warn");
  };

  const confirmDeleteProvider = (provider: AnyRecord) => {
    const providerId = textAt(provider, ["id"], "");
    if (!providerId) return;
    shell.openDialog({
      title: `删除 Provider：${textAt(provider, ["name"], providerId)}`,
      body: "会从 Gateway Provider registry 中删除该 Provider。请确认没有客户端 scope 仍依赖它。",
      tone: "danger",
      icon: "trash-2",
      okLabel: "删除",
      onConfirm: () => {
        void (async () => {
          setProviderBusy(true);
          try {
            await apiJson(`/api/model-gateway/providers/${encodeURIComponent(providerId)}`, { method: "DELETE" });
            shell.toast("Provider 已删除", "ok");
            setSelectedProviderId("");
            await refetchGatewayData();
          } catch (error) {
            shell.toast(error instanceof Error ? error.message : "Provider 删除失败", "warn");
          } finally {
            setProviderBusy(false);
          }
        })();
      },
    });
  };

  const updateProviderAccount = async (account: AnyRecord, payload: AnyRecord, message: string) => {
    const providerId = textAt(selectedProvider, ["id"], "");
    const accountId = textAt(account, ["id"], "");
    if (!providerId || !accountId) return;
    setProviderBusy(true);
    try {
      await apiJson(`/api/model-gateway/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}`, {
        method: "POST",
        body: payload,
      });
      shell.toast(message, "ok");
      await providers.refetch();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "账号更新失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const refreshProviderAccount = async (account: AnyRecord) => {
    const providerId = textAt(selectedProvider, ["id"], "");
    const accountId = textAt(account, ["id"], "");
    if (!providerId || !accountId) return;
    setProviderBusy(true);
    try {
      await apiJson(`/api/model-gateway/providers/${encodeURIComponent(providerId)}/accounts/${encodeURIComponent(accountId)}/refresh`, {
        method: "POST",
      });
      shell.toast("账号刷新完成", "ok");
      await providers.refetch();
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "账号刷新失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const startCodexAccountLogin = async (provider: AnyRecord | null = selectedProvider) => {
    const accountProvider = asRecord(provider?.accountProvider);
    const targetProvider = accountProvider.kind === "codex" ? provider : null;
    const providerId = textAt(targetProvider, ["id"], "codex-account");
    setProviderBusy(true);
    try {
      const result = await apiJson<AnyRecord>("/api/model-gateway/account-providers/codex/login/start", {
        method: "POST",
        body: {
          providerId,
          providerName: textAt(targetProvider, ["name"], "Codex 账号"),
          setActiveScopes: ["codex"],
        },
      });
      shell.openSheet({
        title: "登录新账号",
        sub: "Codex 账号池",
        status: "pending",
        owner: "Model Gateway",
        action: "codex account login",
        note: [
          `打开：${textAt(result, ["verificationUrl"], "-")}`,
          `输入代码：${textAt(result, ["userCode"], "-")}`,
          `loginId：${textAt(result, ["loginId"], "-")}`,
          "完成浏览器授权后，重新进入账号池或刷新 Provider 列表查看账号状态。",
        ].join("\n"),
      });
    } catch (error) {
      shell.toast(error instanceof Error ? error.message : "账号登录启动失败", "warn");
    } finally {
      setProviderBusy(false);
    }
  };

  const previewAppConnection = (connection: AnyRecord) => {
    const preview = recordAt(connection, ["preview"]);
    const targetPath = appConnectionTargetPath(connection);
    shell.openSheet({
      title: `${textAt(connection, ["label", "id"], "客户端")} 配置预览`,
      sub: targetPath,
      status: "pending",
      owner: "Model Gateway",
      action: "app connection preview",
      note: [
        `targetPath：${targetPath}`,
        "",
        textAt(preview, ["content"], "暂无预览内容"),
      ].join("\n").slice(0, 5000),
    });
  };

  const appConnectionTargetPath = (connection: AnyRecord) => {
    const preview = recordAt(connection, ["preview"]);
    return textAt(recordAt(connection, ["target"]), ["path"], textAt(preview, ["targetPath"], "目标配置文件"));
  };

  const appConnectionEvidenceNote = (result: AnyRecord, fallbackTargetPath: string) => {
    const resultConnection = recordAt(result, ["connection"]);
    const resultTarget = recordAt(resultConnection, ["target"]);
    const targetPath = textAt(resultTarget, ["path"], fallbackTargetPath);
    return [
      `targetPath：${targetPath}`,
      `backupPath：${textAt(result, ["backupPath"], "未生成")}`,
      `restoredFrom：${textAt(result, ["restoredFrom"], "不适用")}`,
      "",
      JSON.stringify(result, null, 2),
    ].join("\n").slice(0, 3200);
  };

  const applyAppConnection = (connection: AnyRecord) => {
    const appId = textAt(connection, ["id"], "");
    if (!appId) return;
    const targetPath = appConnectionTargetPath(connection);
    shell.openDialog({
      title: `应用客户端接入：${textAt(connection, ["label"], appId)}`,
      body: `将写入 ${targetPath}。后端会先备份当前文件，再写入 Gateway 路由配置；成功后会返回 backupPath 和最新预览证据。`,
      tone: "info",
      icon: "terminal",
      okLabel: "应用",
      onConfirm: () => {
        void (async () => {
          setProviderBusy(true);
          try {
            const result = await apiJson<AnyRecord>(`/api/model-gateway/app-connections/${encodeURIComponent(appId)}/apply`, {
              method: "POST",
              body: {},
            });
            shell.toast("客户端接入已应用", "ok");
            shell.openSheet({
              title: "客户端接入已应用",
              sub: targetPath,
              status: "ok",
              owner: "Model Gateway",
              action: "app connection apply",
              note: appConnectionEvidenceNote(result, targetPath),
            });
            await Promise.all([appConnections.refetch(), providers.refetch()]);
          } catch (error) {
            shell.toast(error instanceof Error ? error.message : "客户端接入应用失败", "warn");
          } finally {
            setProviderBusy(false);
          }
        })();
      },
    });
  };

  const rollbackAppConnection = (connection: AnyRecord) => {
    const appId = textAt(connection, ["id"], "");
    if (!appId) return;
    const targetPath = appConnectionTargetPath(connection);
    shell.openDialog({
      title: `回滚客户端接入：${textAt(connection, ["label"], appId)}`,
      body: `将把 ${targetPath} 从最近一次备份恢复。后端会先备份当前文件，再执行恢复；成功后会返回 restoredFrom、backupPath 和最新预览证据。`,
      tone: "danger",
      icon: "rotate-ccw",
      okLabel: "回滚",
      onConfirm: () => {
        void (async () => {
          setProviderBusy(true);
          try {
            const result = await apiJson<AnyRecord>(`/api/model-gateway/app-connections/${encodeURIComponent(appId)}/rollback`, {
              method: "POST",
              body: {},
            });
            shell.toast("客户端接入已回滚", "ok");
            shell.openSheet({
              title: "客户端接入已回滚",
              sub: targetPath,
              status: "ok",
              owner: "Model Gateway",
              action: "app connection rollback",
              note: appConnectionEvidenceNote(result, targetPath),
            });
            await Promise.all([appConnections.refetch(), providers.refetch()]);
          } catch (error) {
            shell.toast(error instanceof Error ? error.message : "客户端接入回滚失败", "warn");
          } finally {
            setProviderBusy(false);
          }
        })();
      },
    });
  };

  const modelCatalog = useMemo(() => {
    const rows: Array<{ key: string; provider: string; providerId: string; model: AnyRecord; health: string }> = [];
    for (const provider of providerRows) {
      const models = listAt(provider, ["models", "models"]).map(asRecord);
      const health = textAt(recordAt(provider, ["health"]), ["circuitState"], "unknown");
      const providerId = textAt(provider, ["id"], "provider");
      for (const model of models) {
        const modelId = textAt(model, ["id"], "model");
        rows.push({ key: `${providerId}:${modelId}`, provider: textAt(provider, ["name", "id"], "provider"), providerId, model, health });
      }
    }
    return rows;
  }, [providerRows]);

  const filteredModelCatalog = useMemo(() => {
    const needle = modelSearch.trim().toLowerCase();
    if (!needle) return modelCatalog;
    return modelCatalog.filter((row) => [
      row.provider,
      row.providerId,
      textAt(row.model, ["id"], ""),
      textAt(row.model, ["label"], ""),
      listAt(row.model, ["aliases"]).join(" "),
    ].join(" ").toLowerCase().includes(needle));
  }, [modelCatalog, modelSearch]);
  const selectedModel = filteredModelCatalog.find((row) => row.key === selectedModelKey) ?? filteredModelCatalog[0] ?? modelCatalog[0] ?? null;
  const selectedModelUsage = selectedModel
    ? usageModels.find((row) => textAt(row, ["model"], "") === textAt(selectedModel.model, ["id"], ""))
    : null;

  useEffect(() => {
    if (!selectedModelKey && filteredModelCatalog[0]) setSelectedModelKey(filteredModelCatalog[0].key);
  }, [filteredModelCatalog, selectedModelKey]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const root = document.querySelector(".model-gateway-page");
      if (root) createIcons({ icons: modelGatewayIcons, root });
    });
    return () => cancelAnimationFrame(frame);
  }, [view, providerDialogMode, providerConfigSection, providerSearch, providerFilter, selectedProviderId, providerRows.length, filteredProviders.length, modelCatalog.length, selectedModelKey]);

  const gatewayState = numberAt(healthSummary, ["openCircuits"]) > 0
    ? "degraded"
    : numberAt(healthSummary, ["degradedProviders"]) > 0
      ? "degraded"
      : status.isError
        ? "error"
        : "healthy";
  const routeIssueRows = activeRouteAlerts.map(asRecord);
  const providerIssueRows = providerRows.filter((provider) => stateTone(provider.enabled === false ? "disabled" : textAt(recordAt(provider, ["health"]), ["circuitState"], "closed")) !== "ok");
  const pendingConnectionRows = connectionRows.filter((connection) => !connection.configured);

  const renderOverview = () => (
    <div data-view="overview" className="on">
      <section className="panel gateway-summary">
        <div className="panel-head">
          <div className="htitle">
            <h3>网关状态</h3>
            <span className="sub">只显示影响接入和路由的当前事实。</span>
          </div>
          <div className="row-actions">
            <button className="btn-ghost btn-sm" type="button" onClick={() => setView("providers")}><i data-lucide="route" />Provider</button>
            <button className="btn-ghost btn-sm" type="button" onClick={() => setView("apps")}><i data-lucide="terminal" />客户端接入</button>
          </div>
        </div>
        <div className="panel-body gateway-status-strip">
          <div>
            <ProviderStatusDot value={gatewayState} />
            <strong>{stateTone(gatewayState) === "ok" ? "可用" : "需要处理"}</strong>
            <span>{numberAt(healthSummary, ["okProviders"])} / {numberAt(status.data, ["registry", "providerCount"])} Provider 可路由</span>
          </div>
          <div>
            <span className="cell-mono">{textAt(status.data, ["listener"], "loopback")}</span>
            <span>{formatTime(textAt(status.data, ["checkedAt"], ""))}</span>
          </div>
        </div>
      </section>
      <div className="grid-main gateway-overview-grid" style={{ marginTop: 18 }}>
        <section className="panel">
          <div className="panel-head"><div className="htitle"><h3>当前路由</h3><span className="sub">客户端实际会打到哪里。</span></div></div>
          <div className="panel-body" style={{ padding: 6 }}>
            <QueryNotice query={providers} label="路由" />
            {!providers.isLoading && !providers.isError ? activeRoutes.map((route, index) => {
              const scope = textAt(route, ["scope"], "");
              const warningText = textAt(route, ["warning"], "");
              const providerName = textAt(route, ["resolvedProviderName", "resolvedProviderId"], "未解析 Provider");
              const modelName = textAt(route, ["resolvedModel"], "未指定模型");
              const endpoint = textAt(route, ["resolvedEndpointProfileName", "resolvedEndpointProfileId"], "");
              return (
                <div className="route-row" key={scope || index}>
                  <span className={`rico ${routeScopeTone(index)}`}><i data-lucide={routeScopeIcon(scope)} /></span>
                  <span className="route-copy"><strong>{routeScopeLabel(scope)}</strong><span>{compactList([providerName, endpoint, modelName])}</span></span>
                  <StatusTag value={warningText ? "warning" : "ready"} />
                  <span className="route-acts"><button className="btn-ghost btn-sm" type="button" disabled={providerBusy} onClick={() => testRouteProvider(route)}><i data-lucide="activity" />检查</button></span>
                </div>
              );
            }) : null}
            {!providers.isLoading && !providers.isError && activeRoutes.length === 0 ? (
              <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>暂无活动路由</strong><span>先配置 Provider 和客户端接入。</span></div>
            ) : null}
          </div>
        </section>
        <aside className="panel">
          <div className="panel-head"><div className="htitle"><h3>需要处理</h3><span className="sub">只列异常、未接入和告警。</span></div></div>
          <div className="panel-body" style={{ padding: "10px 14px" }}>
            <QueryNotice query={providers} label="Provider" />
            {routeIssueRows.slice(0, 3).map((alert, index) => <div className="switch-row" key={`route-alert-${index}`}><span className="sc"><strong>{textAt(alert, ["scope", "code"], "路由告警")}</strong><span>{textAt(alert, ["message", "warning"], "需要检查路由")}</span></span><span className="tag warn">告警</span></div>)}
            {providerIssueRows.slice(0, 3).map((provider) => <div className="switch-row" key={textAt(provider, ["id"], "provider")}><span className="sc"><strong>{textAt(provider, ["name", "id"], "Provider")}</strong><span>{textAt(recordAt(provider, ["health"]), ["lastError"], "Provider 状态异常或停用")}</span></span><button className="btn-ghost btn-sm" type="button" onClick={() => { setSelectedProviderId(textAt(provider, ["id"], "")); openProviderEdit(provider); }}>处理</button></div>)}
            {pendingConnectionRows.slice(0, 3).map((connection) => <div className="switch-row" key={textAt(connection, ["id"], "client")}><span className="sc"><strong>{textAt(connection, ["label", "id"], "客户端")}</strong><span>尚未应用 Gateway 接入</span></span><button className="btn-ghost btn-sm" type="button" onClick={() => setView("apps")}>接入</button></div>)}
            {!providers.isLoading && !providers.isError && routeIssueRows.length === 0 && providerIssueRows.length === 0 && pendingConnectionRows.length === 0 ? (
              <div className="statebox empty"><span className="si"><i data-lucide="check" /></span><strong>暂无待处理项</strong><span>当前 Provider、路由和客户端接入没有返回阻塞告警。</span></div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );

  const renderProviders = () => (
    <div data-view="providers" className="on">
      <div className="page-head provider-page-head">
        <div className="htitle">
          <h2>Provider</h2>
          <p>列表优先。普通 API Provider 走配置子页，Codex 账号走专用登录流程。</p>
        </div>
        <div className="provider-primary-actions">
          <button className="btn-ghost" type="button" disabled={providerBusy} onClick={() => void startCodexAccountLogin(null)}><i data-lucide="log-in" /><span>登录 Codex</span></button>
          <button className="btn-primary" type="button" disabled={providerBusy} onClick={openProviderCreate}><i data-lucide="plus" /><span>新建 API Provider</span></button>
        </div>
      </div>
      <div className="provider-filterbar">
        <span className="search-input">
          <i data-lucide="search" />
          <input value={providerSearch} onChange={(event) => setProviderSearch(event.target.value)} placeholder="搜索 Provider / 模型 / 协议" />
        </span>
        <div className="seg">
          {providerFilterOptions.map(([id, label]) => (
            <button key={id} className={providerFilter === id ? "on" : ""} type="button" onClick={() => setProviderFilter(id)}>{label}</button>
          ))}
        </div>
        <button className="btn-ghost" type="button" disabled={!selectedProvider || providerBusy} onClick={() => void detectSelectedProvider()}><i data-lucide="scan-search" /><span>探测选中 Provider</span></button>
      </div>
      <section className="tablewrap provider-table" aria-label="Provider 列表">
        <div className="thead"><span>Provider</span><span>类型</span><span>状态</span><span>动作</span></div>
        <div>
          <QueryNotice query={providers} label="Provider" />
          {!providers.isLoading && !providers.isError ? filteredProviders.map((provider) => (
            <GatewayProviderTableRow
              key={textAt(provider, ["id"], "provider")}
              provider={provider}
              selected={textAt(provider, ["id"], "") === textAt(selectedProvider, ["id"], "")}
              onSelect={() => {
                setSelectedProviderId(textAt(provider, ["id"], ""));
              }}
              onEdit={openProviderEdit}
              onTest={testProvider}
              onAccounts={() => setView("accounts")}
            />
          )) : null}
          {!providers.isLoading && !providers.isError && filteredProviders.length === 0 ? <div className="statebox empty"><span className="si"><i data-lucide="route-off" /></span><strong>没有匹配的 Provider</strong><span>调整搜索或筛选；新增 Provider 后续进入专门创建流程。</span></div> : null}
        </div>
      </section>
    </div>
  );

  const closeProviderConfig = () => {
    setProviderDialogMode(null);
    setProviderCreateStep("preset");
    setView("providers");
  };

  const renderProviderConfig = () => {
    const isCreatingProvider = providerDialogMode === "create";
    if (isCreatingProvider && providerCreateStep === "preset") {
      return (
        <div data-view="providercfg" className="on">
          <div className="subpage">
            <div className="subpage-head">
              <button className="btn-icon btn-ghost back" type="button" title="返回" disabled={providerBusy} onClick={closeProviderConfig}><i data-lucide="arrow-left" /></button>
              <div className="htitle"><h2>选择 Provider 类型</h2><p>先选择协议和端点模板，再进入基础、Endpoint、模型和高级分段配置。Codex 账号请使用 Provider 页的“登录 Codex”。</p></div>
            </div>
            <div className="provider-preset-grid">
              {providerCreatePresets.map((preset) => (
                <button className="provider-preset" type="button" key={preset.id} onClick={() => selectProviderCreatePreset(preset)}>
                  <span className="rico ico-primary"><i data-lucide={preset.icon} /></span>
                  <span className="preset-copy">
                    <strong>{preset.title}</strong>
                    <span>{preset.desc}</span>
                    <small>{compactList([apiFormatLabel(preset.apiFormat), preset.baseUrl || "手动填写 baseUrl", preset.modelId], "")}</small>
                  </span>
                  <i data-lucide="chevron-right" />
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }
    const providerConfigTitle = isCreatingProvider
      ? `新建 · ${providerDraft.name.trim() || "Provider"}`
      : `配置 · ${providerDraft.name || textAt(selectedProvider, ["name", "id"], "Provider")}`;
    return (
      <div data-view="providercfg" className="on">
        <div className="subpage">
          <div className="subpage-head">
            <button className="btn-icon btn-ghost back" type="button" title="返回" disabled={providerBusy} onClick={closeProviderConfig}><i data-lucide="arrow-left" /></button>
            <div className="htitle"><h2>{providerConfigTitle}</h2><p>baseUrl / endpoint / 模型目录 / 网络 / 推理。保存前内联校验，危险变更需确认。</p></div>
            {isCreatingProvider ? (
              <button className="btn-ghost btn-sm provider-repick" type="button" disabled={providerBusy} onClick={() => setProviderCreateStep("preset")}><i data-lucide="rotate-ccw" />重新选择类型</button>
            ) : null}
          </div>
          <div className="provider-config-sections" role="tablist" aria-label="Provider 配置分段">
            {providerConfigSections.map(([id, label, desc]) => (
              <button key={id} className={providerConfigSection === id ? "on" : ""} type="button" role="tab" aria-selected={providerConfigSection === id} onClick={() => setProviderConfigSection(id)}>
                <strong>{label}</strong>
                <span>{desc}</span>
              </button>
            ))}
          </div>
          <div className="provider-config-flow">
            <div>
              {providerConfigSection === "base" ? (
                <>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="info" /></span><strong>基础</strong><span className="sub">必填</span></div>
                <div className="cfg-body">
                  <div className="form-row2">
                    <div className="fieldset"><label>Provider ID</label><input className="input" value={providerDraft.id} disabled={providerDialogMode === "edit"} onChange={(event) => setProviderDraft((draft) => ({ ...draft, id: event.target.value }))} placeholder="my-provider" /></div>
                    <div className="fieldset"><label>名称</label><input className="input" value={providerDraft.name} onChange={(event) => setProviderDraft((draft) => ({ ...draft, name: event.target.value }))} placeholder="主力模型服务" /></div>
                  </div>
                  <div className="form-row2">
                    <div className="fieldset"><label>分类</label><div className="seg-radio">{categoryOptions.map(([value, label]) => <button key={value} className={providerDraft.category === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, category: value }))}>{label}</button>)}</div></div>
                    <div className="fieldset"><label>来源</label><div className="seg-radio">{sourceTypeOptions.map(([value, label]) => <button key={value} className={providerDraft.sourceType === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, sourceType: value }))}>{label}</button>)}</div></div>
                  </div>
                  <div className="fieldset"><label>默认 baseUrl</label><input className="input" value={providerDraft.baseUrl} onChange={(event) => setProviderDraft((draft) => ({ ...draft, baseUrl: event.target.value }))} placeholder="https://api.example.com/v1" /></div>
                  <div className="fieldset"><label>API 格式</label><div className="seg-radio">{apiFormatOptions.map(([value, label]) => <button key={value} className={providerDraft.apiFormat === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, apiFormat: value }))}>{label}</button>)}</div></div>
                  <div className="fieldset"><label>鉴权方式</label><div className="seg-radio">{authStrategyOptions.map(([value, label]) => <button key={value} className={providerDraft.authStrategy === value ? "on" : ""} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, authStrategy: value }))}>{label}</button>)}</div></div>
                  <div className="switch-row"><span className="sc"><strong>启用 Provider</strong><span>关闭后客户端 scope 不应再路由到该 Provider</span></span><button className={`toggle ${providerDraft.enabled ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, enabled: !draft.enabled }))} /></div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="key-round" /></span><strong>密钥</strong><span className="sub">仅引用，不存明文</span></div>
                <div className="cfg-body">
                  <div className="fieldset"><label>API key</label><input className="input" type="password" value={providerDraft.apiKey} onChange={(event) => setProviderDraft((draft) => ({ ...draft, apiKey: event.target.value }))} placeholder={isCreatingProvider ? "可选：保存时写入密钥库" : "留空则不修改"} /><span className="help-text">{isCreatingProvider ? "填写后随 Provider 一起保存到服务端密钥库；浏览器不会回显明文。" : "填写后随“保存配置”更新；留空不会修改已保存密钥引用。"}</span></div>
                </div>
              </div>
                </>
              ) : null}
              {providerConfigSection === "endpoints" ? (
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="plug" /></span><strong>Endpoint</strong><span className="sub">多端点</span></div>
                <div className="cfg-body">
                  <div className="endpoint-editor">
                    {providerDraft.endpointProfiles.map((endpoint, index) => (
                      <div className="endpoint-edit-row" key={endpoint.localId}>
                        <div className="endpoint-edit-head">
                          <span className="rico r-primary"><i data-lucide="plug" /></span>
                          <span className="sc"><strong>{endpoint.name || endpoint.id || `Endpoint ${index + 1}`}</strong><span>{endpoint.enabled ? "已启用" : "已停用"}</span></span>
                          <button className={`toggle ${endpoint.enabled ? "on" : ""}`} type="button" title="启用 / 停用 endpoint" onClick={() => updateEndpointDraft(index, { enabled: !endpoint.enabled })} />
                        </div>
                        <div className="endpoint-edit-grid">
                          <div className="fieldset"><label>ID</label><input className="input" value={endpoint.id} onChange={(event) => updateEndpointDraft(index, { id: event.target.value })} placeholder="primary" /></div>
                          <div className="fieldset"><label>名称</label><input className="input" value={endpoint.name} onChange={(event) => updateEndpointDraft(index, { name: event.target.value })} placeholder="主 endpoint" /></div>
                          <div className="fieldset endpoint-url"><label>baseUrl</label><input className="input" value={endpoint.baseUrl} onChange={(event) => updateEndpointDraft(index, { baseUrl: event.target.value })} placeholder={providerDraft.baseUrl || "https://api.example.com/v1"} /></div>
                          <div className="fieldset"><label>API 格式</label><select className="input select" value={endpoint.apiFormat} onChange={(event) => updateEndpointDraft(index, { apiFormat: event.target.value })}>{apiFormatOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                          <div className="fieldset"><label>鉴权</label><select className="input select" value={endpoint.authStrategy} onChange={(event) => updateEndpointDraft(index, { authStrategy: event.target.value })}>{authStrategyOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                        </div>
                        <div className="row-actions">
                          <button className="btn-ghost btn-sm" type="button" onClick={() => updateEndpointDraft(index, {
                            baseUrl: providerDraft.baseUrl,
                            apiFormat: providerDraft.apiFormat,
                            authStrategy: providerDraft.authStrategy,
                          })}><i data-lucide="copy-check" />同步基础配置</button>
                          <button className="btn-ghost btn-sm danger-text" type="button" onClick={() => removeEndpointDraft(index)} disabled={providerDraft.endpointProfiles.length <= 1}><i data-lucide="trash-2" />移除 endpoint</button>
                        </div>
                      </div>
                    ))}
                    {!providerDraft.endpointProfiles.length ? <div className="statebox empty"><span className="si"><i data-lucide="plug-zap" /></span><strong>暂无 endpoint</strong><span>新增 endpoint 后才能保存多端点配置。</span></div> : null}
                  </div>
                  <button className="btn-ghost btn-sm" type="button" onClick={addEndpointDraft}><i data-lucide="plus" />新增 endpoint</button>
                </div>
              </div>
              ) : null}
              {providerConfigSection === "models" ? (
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="box" /></span><strong>模型目录</strong><span className="sub">alias / 能力</span></div>
                <div className="cfg-body">
                  <div className="model-catalog-editor">
                    {providerDraft.models.map((model, index) => {
                      const modelId = model.id.trim();
                      const isDefault = modelId && modelId === providerDraft.defaultModel.trim();
                      return (
                        <div className="model-edit-row" key={model.localId}>
                          <div className="model-edit-head">
                            <span className="rico r-primary"><i data-lucide="box" /></span>
                            <span className="sc"><strong>{model.id || `模型 ${index + 1}`}</strong><span>{model.aliasesText || "未设置 alias"}</span></span>
                            <span className="route-acts">
                              {isDefault ? <span className="tag info">默认</span> : <button className="btn-ghost btn-sm" type="button" disabled={!modelId} onClick={() => setDefaultModelFromDraft(modelId)}><i data-lucide="star" />默认</button>}
                              <button className="btn-ghost btn-sm danger-text" type="button" disabled={providerDraft.models.length <= 1} onClick={() => removeModelDraft(index)}><i data-lucide="trash-2" />移除</button>
                            </span>
                          </div>
                          <div className="model-edit-grid simple">
                            <div className="fieldset"><label>模型 ID</label><input className="input" value={model.id} onChange={(event) => updateModelDraft(index, { id: event.target.value })} placeholder="gpt-5.4" /></div>
                            <div className="fieldset model-aliases"><label>alias</label><input className="input" value={model.aliasesText} onChange={(event) => updateModelDraft(index, { aliasesText: event.target.value })} placeholder="逗号分隔，例如 fast, default" /></div>
                          </div>
                        </div>
                      );
                    })}
                    {!providerDraft.models.length ? <div className="statebox empty"><span className="si"><i data-lucide="box" /></span><strong>暂无模型</strong><span>新增模型后才能保存 Provider。</span></div> : null}
                  </div>
                  <div className="row-actions">
                    <button className="btn-ghost btn-sm" type="button" onClick={addModelDraft}><i data-lucide="plus" />新增模型</button>
                    <span className="help-text">只编辑常用项。上下文、输出和能力 flags 后续进入高级设置，不堆在创建页。</span>
                  </div>
                </div>
              </div>
              ) : null}
              {providerConfigSection === "advanced" ? (
                <>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="settings-2" /></span><strong>网络</strong><span className="sub">高级</span></div>
                <div className="cfg-body">
                  <div className="form-row2">
                    <div className="fieldset"><label>请求超时 (ms)</label><input className="input" inputMode="numeric" value={providerDraft.timeoutMs} onChange={(event) => setProviderDraft((draft) => ({ ...draft, timeoutMs: event.target.value }))} /></div>
                    <div className="fieldset"><label>首字节超时 (ms)</label><input className="input" inputMode="numeric" value={providerDraft.firstByteTimeoutMs} onChange={(event) => setProviderDraft((draft) => ({ ...draft, firstByteTimeoutMs: event.target.value }))} /></div>
                  </div>
                  <div className="form-row2">
                    <div className="fieldset"><label>流空闲超时 (ms)</label><input className="input" inputMode="numeric" value={providerDraft.idleTimeoutMs} onChange={(event) => setProviderDraft((draft) => ({ ...draft, idleTimeoutMs: event.target.value }))} /></div>
                    <div className="fieldset"><label>代理 (proxyUrl)</label><input className="input" value={providerDraft.proxyUrl} onChange={(event) => setProviderDraft((draft) => ({ ...draft, proxyUrl: event.target.value }))} placeholder="可留空" /></div>
                  </div>
                  <div className="switch-row"><span className="sc"><strong>TLS 校验</strong><span>关闭仅用于本地自签证书</span></span><button className={`toggle ${providerDraft.tlsVerify ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, tlsVerify: !draft.tlsVerify }))} /></div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="brain" /></span><strong>推理能力</strong><span className="sub">thinking / effort</span></div>
                <div className="cfg-body">
                  <div className="switch-row"><span className="sc"><strong>支持 thinking</strong><span>透传思考过程参数</span></span><button className={`toggle ${providerDraft.supportsThinking ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, supportsThinking: !draft.supportsThinking }))} /></div>
                  <div className="switch-row"><span className="sc"><strong>支持 effort 等级</strong><span>low / medium / high</span></span><button className={`toggle ${providerDraft.supportsEffort ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, supportsEffort: !draft.supportsEffort }))} /></div>
                  <div className="form-row2">
                    <div className="fieldset"><label>thinking 参数名</label><select className="input select" value={providerDraft.thinkingParam} onChange={(event) => setProviderDraft((draft) => ({ ...draft, thinkingParam: event.target.value }))}>{thinkingParamOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                    <div className="fieldset"><label>effort 参数名</label><select className="input select" value={providerDraft.effortParam} onChange={(event) => setProviderDraft((draft) => ({ ...draft, effortParam: event.target.value }))}>{effortParamOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                  </div>
                </div>
              </div>
              <div className="cfg">
                <div className="cfg-head"><span className="ci"><i data-lucide="tag" /></span><strong>元数据</strong></div>
                <div className="cfg-body">
                  <div className="fieldset"><label>网站</label><input className="input" value={providerDraft.website} onChange={(event) => setProviderDraft((draft) => ({ ...draft, website: event.target.value }))} placeholder="https://example.com" /></div>
                  <div className="fieldset"><label>客户端范围</label><div className="chips">{appScopeOptions.map(([scope, label]) => <button key={scope} className={`chip ${providerDraft.appScopes[scope] ? "on" : ""}`} type="button" onClick={() => setProviderDraft((draft) => ({ ...draft, appScopes: { ...draft.appScopes, [scope]: !draft.appScopes[scope] } }))}>{label}</button>)}</div></div>
                  <div className="fieldset"><label>标签</label><input className="input" value={providerDraft.tagsText} onChange={(event) => setProviderDraft((draft) => ({ ...draft, tagsText: event.target.value }))} placeholder="国产, native, fast" /></div>
                  <div className="fieldset"><label>备注</label><input className="input" value={providerDraft.notes} onChange={(event) => setProviderDraft((draft) => ({ ...draft, notes: event.target.value }))} placeholder="可选" /></div>
                </div>
                <div className="save-bar"><span className="dirty"><i data-lucide="circle-dot" />有未保存改动</span><span className="filler" /><button className="btn-ghost" type="button" disabled={providerBusy} onClick={closeProviderConfig}>取消</button><button className="btn-primary" type="button" disabled={providerBusy} onClick={() => void saveProviderDraft()}><i data-lucide="check" />{providerBusy ? "保存中..." : "保存配置"}</button></div>
              </div>
              {!isCreatingProvider ? (
                <div className="cfg danger-zone">
                  <div className="cfg-head"><span className="ci"><i data-lucide="trash-2" /></span><strong>危险操作</strong><span className="sub">二次确认</span></div>
                  <div className="cfg-body">
                    <div className="switch-row">
                      <span className="sc"><strong>删除该 Provider</strong><span>删除前请确认没有客户端 scope 仍依赖它。</span></span>
                      <button className="btn-ghost btn-sm danger-text" type="button" disabled={providerBusy} onClick={() => selectedProvider && confirmDeleteProvider(selectedProvider)}><i data-lucide="trash-2" />删除</button>
                    </div>
                  </div>
                </div>
              ) : null}
                </>
              ) : null}
              {providerConfigSection !== "advanced" ? (
                <div className="save-bar provider-save-bar"><span className="dirty"><i data-lucide="circle-dot" />有未保存改动</span><span className="filler" /><button className="btn-ghost" type="button" disabled={providerBusy} onClick={closeProviderConfig}>取消</button><button className="btn-primary" type="button" disabled={providerBusy} onClick={() => void saveProviderDraft()}><i data-lucide="check" />{providerBusy ? "保存中..." : "保存配置"}</button></div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderAccounts = () => {
    const accountProvider = asRecord(selectedProvider?.accountProvider);
    const routing = recordAt(accountProvider, ["routing"]);
    const accountRows = listAt(accountProvider, ["accounts"]).map(asRecord);
    const title = `账号池 · ${textAt(selectedProvider, ["name"], "Codex 账号")}`;
    const routingStrategy = textAt(routing, ["strategy"], "round-robin");
    if (!accountProvider.kind) {
      return (
        <div data-view="accounts" className="on">
          <div className="subpage-head">
            <button className="btn-icon btn-ghost back" type="button" title="返回 Provider" onClick={() => setView("providers")}><i data-lucide="arrow-left" /></button>
            <div className="htitle"><h2>账号池</h2><p>账号池只属于账号制 Provider。普通 API Provider 不显示账号管理。</p></div>
          </div>
          <div className="statebox empty" style={{ marginTop: 14 }}><span className="si"><i data-lucide="users" /></span><strong>当前 Provider 不是账号制</strong><span>返回 Provider 列表，选择 Codex 账号等账号制 Provider 后再进入账号池。</span></div>
        </div>
      );
    }
    return (
      <div data-view="accounts" className="on">
        <div className="page-head">
          <div className="htitle"><h2>{title}</h2><p>账号制 Provider 的多账号轮换、配额、登录与刷新。路由策略影响请求如何在账号间分配。</p></div>
          <div className="toolbar">
            <div className="seg">
              <button className={routingStrategy === "round-robin" ? "on" : ""} type="button">轮换 round-robin</button>
              <button className={boolAt(routing, ["sessionAffinity"], true) ? "on" : ""} type="button">会话粘性</button>
              <button className={routingStrategy === "fill-first" ? "on" : ""} type="button">最少负载</button>
            </div>
            <button className="btn-primary" type="button" disabled={providerBusy} onClick={() => void startCodexAccountLogin()}><i data-lucide="log-in" /><span>登录新账号</span></button>
          </div>
        </div>
        <div className="acct-grid">
          {accountRows.map((account, index) => {
            const state = textAt(account, ["state"], "unknown");
            const enabled = account.enabled !== false && state !== "disabled";
            const isCooldown = state === "cooldown";
            const statusLabel = accountStateLabel(state);
            const barTone = stateTone(statusLabel) === "warn" ? "warn" : stateTone(statusLabel) === "bad" ? "bad" : "ok";
            return (
              <div className="acct" key={textAt(account, ["id"], `account-${index}`)}>
                <div className="acct-top">
                  <span className="av" style={index % 2 ? { background: "var(--violet-soft)", color: "var(--violet)" } : undefined}>{String.fromCharCode(65 + index)}</span>
                  <span className="ai"><strong>{textAt(account, ["emailMasked", "accountHash"], textAt(account, ["id"], "account"))}</strong><span>{compactList([textAt(account, ["plan"], "账号"), enabled ? "已启用" : "已停用"])}</span></span>
                  <ProviderStatusDot value={statusLabel} />
                </div>
                <div className="acct-meta">
                  <div className="mm"><span>最近成功</span><strong>{formatTime(textAt(account, ["lastSuccessAt"], ""))}</strong></div>
                  <div className="mm"><span>{isCooldown ? "冷却至" : "有效期"}</span><strong>{isCooldown ? formatRelativeFuture(textAt(account, ["cooldownUntil"], "")) : formatTime(textAt(account, ["expiresAt"], ""))}</strong></div>
                </div>
                <div className={`bar ${barTone}`}><i style={{ width: isCooldown ? "40%" : enabled ? "78%" : "18%" }} /></div>
                <div className="row-actions">
                  <button className="btn-ghost btn-sm" type="button" disabled={providerBusy || !enabled} onClick={() => void refreshProviderAccount(account)}><i data-lucide="refresh-cw" />刷新</button>
                  {isCooldown ? <button className="btn-ghost btn-sm" type="button" disabled={providerBusy} onClick={() => void updateProviderAccount(account, { clearCooldown: true }, "账号冷却已清除")}><i data-lucide="rotate-ccw" />清冷却</button> : null}
                  <button className={`btn-ghost btn-sm ${enabled ? "danger-text" : ""}`} type="button" disabled={providerBusy} onClick={() => void updateProviderAccount(account, { enabled: !enabled }, enabled ? "账号已停用" : "账号已启用")}><i data-lucide={enabled ? "log-out" : "log-in"} />{enabled ? "停用" : "启用"}</button>
                </div>
              </div>
            );
          })}
          {!accountRows.length ? (
            <div className="statebox empty"><span className="si"><i data-lucide="users" /></span><strong>暂无账号</strong><span>使用“登录新账号”把账号加入该 Provider 的账号池。</span></div>
          ) : null}
        </div>
      </div>
    );
  };

  const renderModels = () => (
    <div data-view="models" className="on">
      <div className="page-head">
        <div className="htitle"><h2>模型</h2><p>所有 Provider 暴露的模型、alias、推理能力与定价。行内编辑 alias，点击查看能力。</p></div>
        <div className="toolbar"><span className="search-input"><i data-lucide="search" /><input value={modelSearch} onChange={(event) => setModelSearch(event.target.value)} placeholder="搜索模型 / alias" /></span></div>
      </div>
      <div className="tablewrap">
        <div className="thead" style={{ gridTemplateColumns: "1.6fr 1fr 1fr auto" }}><span>模型 / alias</span><span>Provider</span><span>能力</span><span>24h</span></div>
        <QueryNotice query={providers} label="模型目录" />
        {!providers.isLoading && !providers.isError ? filteredModelCatalog.slice(0, 80).map((row) => {
          const { key, provider, model } = row;
          const features = asRecord(model.features);
          const featureNames = Object.entries(features).filter(([, value]) => Boolean(value)).map(([key]) => key).slice(0, 2);
          const modelId = textAt(model, ["id"], "model");
          const modelUsage = usageModels.find((row) => textAt(row, ["model"], "") === modelId);
          const aliases = listAt(model, ["aliases"]).map(String);
          const isEditingAlias = editingAliasKey === key;
          return (
            <div className={`trow ${selectedModel?.key === key ? "sel" : ""}`} style={{ gridTemplateColumns: "1.6fr 1fr 1fr auto" }} key={key} role="button" tabIndex={0} onClick={() => setSelectedModelKey(key)} onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedModelKey(key);
              }
            }}>
              <span className="cell-main"><span className="rico ico-primary"><i data-lucide="box" /></span><span className="c-copy"><strong>{textAt(model, ["label", "id"], "model")}</strong>
                {isEditingAlias ? (
                  <span className="alias-editor" onClick={(event) => event.stopPropagation()}>
                    <input
                      className="input"
                      aria-label={`${modelId} alias`}
                      value={modelAliasDraft}
                      onChange={(event) => setModelAliasDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveModelAlias(row);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelModelAliasEdit();
                        }
                      }}
                      placeholder="alias，逗号分隔"
                    />
                    <button className="btn-ghost btn-sm" type="button" disabled={providerBusy} onClick={() => void saveModelAlias(row)}><i data-lucide="check" />保存 alias</button>
                    <button className="btn-ghost btn-sm" type="button" disabled={providerBusy} onClick={cancelModelAliasEdit}><i data-lucide="x" />取消</button>
                  </span>
                ) : (
                  <button className="inline-edit alias-trigger" type="button" onClick={(event) => {
                    event.stopPropagation();
                    startModelAliasEdit(key, aliases);
                  }}>
                    <span className="val">alias {aliases.length ? aliases.join(", ") : "未设置"}</span><i data-lucide="pencil" className="pen" />
                  </button>
                )}
              </span></span>
              <span className="cell-mono">{provider}</span>
              <span><span className="tag info">{featureNames.join(" / ") || "text"}</span></span>
              <span className="cell-mono">{formatCompact(numberAt(modelUsage, ["requestCount"]))}</span>
            </div>
          );
        }) : null}
      </div>
      <div className="cfg" style={{ marginTop: 16 }}>
        <div className="cfg-head"><span className="ci"><i data-lucide="box" /></span><strong>{selectedModel ? textAt(selectedModel.model, ["id"], "模型") : "模型"} · 能力与定价</strong><span className="sub">点击模型行查看</span></div>
        <div className="cfg-body">
          <div className="cap-grid">
            <div className="cap"><span className="ct">上下文窗口</span><span className="cv">{selectedModel ? formatTokens(numberAt(selectedModel.model, ["contextWindow"])) : "-"}</span></div>
            <div className="cap"><span className="ct">最大输出</span><span className="cv">{selectedModel ? formatTokens(numberAt(selectedModel.model, ["maxOutputTokens"])) : "-"}</span></div>
            <div className="cap"><span className="ct">输入价</span><span className="cv">{formatPricing(numberAt(recordAt(selectedModel?.model, ["pricing"]), ["inputPer1M"], NaN), textAt(recordAt(selectedModel?.model, ["pricing"]), ["currency"], "¥"))}</span></div>
            <div className="cap"><span className="ct">输出价</span><span className="cv">{formatPricing(numberAt(recordAt(selectedModel?.model, ["pricing"]), ["outputPer1M"], NaN), textAt(recordAt(selectedModel?.model, ["pricing"]), ["currency"], "¥"))}</span></div>
            <div className="cap"><span className="ct">推理</span><span className="cv">{boolAt(recordAt(selectedModel?.model, ["features"]), ["reasoning"], false) ? "reasoning" : "text"}</span></div>
            <div className="cap"><span className="ct">流式</span><span className="cv">{boolAt(recordAt(selectedModel?.model, ["features"]), ["streaming"], true) ? "支持" : "未标记"}</span></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderUsage = () => (
    <div data-view="usage" className="on">
      <div className="page-head">
        <div className="htitle"><h2>用量</h2><p>请求、token、延迟分布，按 Provider / 模型 / 账号拆分。</p></div>
        <div className="toolbar"><div className="seg"><button className="on" type="button">24 小时</button><button type="button">7 天</button><button type="button">30 天</button></div></div>
      </div>
      <div className="kpi-grid">
        <div className="kpi"><span className="lab"><i data-lucide="send" />请求</span><span className="num">{formatCompact(numberAt(usageTotals, ["requestCount"]))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="coins" />tokens</span><span className="num">{formatCompact(numberAt(usageTotals, ["totalTokens"]))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="arrow-down-to-line" />输入</span><span className="num">{formatCompact(numberAt(usageTotals, ["inputTokens"]))}</span></div>
        <div className="kpi"><span className="lab"><i data-lucide="arrow-up-from-line" />输出</span><span className="num">{formatCompact(numberAt(usageTotals, ["outputTokens"]))}</span></div>
      </div>
      <div className="grid-main" style={{ marginTop: 16 }}>
        <section className="panel">
          <div className="panel-head"><div className="htitle"><h3>按模型分布</h3><span className="sub">请求占比</span></div></div>
          <div className="panel-body" style={{ padding: 16 }}>
            <QueryNotice query={usage} label="用量" />
            <div className="dist">
              {!usage.isLoading && !usage.isError ? usageModels.slice(0, 6).map((row) => {
                const requestCount = numberAt(row, ["requestCount"]);
                const total = Math.max(numberAt(usageTotals, ["requestCount"]), 1);
                const percent = Math.max(3, Math.min(100, Math.round((requestCount / total) * 100)));
                return (
                  <div className="dist-row" key={textAt(row, ["model"], "model")}>
                    <span className="nm"><i className="d" style={{ background: "var(--primary)" }} />{textAt(row, ["model"], "unknown model")}</span>
                    <span className="bar"><i style={{ width: `${percent}%` }} /></span>
                    <span className="vv">{formatCompact(requestCount)}</span>
                  </div>
                );
              }) : null}
            </div>
            {!usage.isLoading && !usage.isError && usageModels.length === 0 ? (
              <div className="statebox empty"><span className="si"><i data-lucide="coins" /></span><strong>暂无用量记录</strong><span>Gateway 还没有返回模型请求或 token 统计。</span></div>
            ) : null}
          </div>
        </section>
        <aside className="panel">
          <div className="panel-head"><div className="htitle"><h3>延迟分布</h3><span className="sub">全部路由</span></div></div>
          <div className="panel-body" style={{ padding: 16 }}>
            <div className="lat"><div className="l"><span>p50</span><strong>{formatMs(numberAt(latency, ["p50Ms"], NaN))}</strong></div><div className="l"><span>p95</span><strong>{formatMs(numberAt(latency, ["p95Ms"], NaN))}</strong></div><div className="l"><span>p99</span><strong>{formatMs(numberAt(latency, ["p99Ms"], NaN))}</strong></div></div>
            <div className="dist" style={{ marginTop: 14 }}>
              <div className="dist-row"><span className="nm">首字节 p95</span><span className="bar"><i style={{ width: numberAt(latency, ["firstByteP95Ms"]) ? "55%" : "0%" }} /></span><span className="vv">{formatMs(numberAt(latency, ["firstByteP95Ms"], NaN))}</span></div>
              <div className="dist-row"><span className="nm">完成 p95</span><span className="bar warn"><i style={{ width: numberAt(latency, ["p95Ms"]) ? "82%" : "0%" }} /></span><span className="vv">{formatMs(numberAt(latency, ["p95Ms"], NaN))}</span></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );

  const renderApps = () => (
    <div data-view="apps" className="on">
      <div className="subpage-head app-connection-head">
        <button className="btn-icon btn-ghost back" type="button" title="返回概览" disabled={providerBusy} onClick={() => setView("overview")}><i data-lucide="arrow-left" /></button>
        <div className="htitle"><h2>客户端接入</h2><p>把 Gateway 路由写入本地 CLI 客户端。这里只管<strong>路由如何接入</strong>；Agent 工作目录、persona、权限和会话在 CLI Agents 管理。</p></div>
      </div>
      <div className="app-connection-summary">
        <div className="cap"><span className="ct">已接入</span><span className="cv">{connectionRows.filter((connection) => connection.configured).length}</span></div>
        <div className="cap"><span className="ct">待应用</span><span className="cv">{pendingConnectionRows.length}</span></div>
        <div className="cap"><span className="ct">写入策略</span><span className="cv">预览 + 确认 + 备份</span></div>
      </div>
      <div className="tablewrap app-connection-table">
        <div className="thead"><span>客户端</span><span>路由 Profile</span><span>状态</span><span>动作</span></div>
        <QueryNotice query={appConnections} label="客户端接入" />
        {(!appConnections.isLoading && !appConnections.isError ? connectionRows : []).map((connection) => {
          const label = textAt(connection, ["label", "id"], "客户端");
          const appId = textAt(connection, ["id"], "");
          const configured = Boolean(connection.configured);
          const iconTone = appId === "codex" ? "ico-teal" : appId === "claude-code" ? "ico-violet" : "ico-primary";
          return (
            <div className="trow" style={{ cursor: "default" }} key={label}>
              <span className="cell-main"><span className={`rico ${iconTone}`}><i data-lucide="terminal" /></span><span className="c-copy"><strong>{label}</strong><span>{textAt(recordAt(connection, ["target"]), ["path"], "-")}</span></span></span>
              <span className="cell-mono">{compactList([textAt(connection, ["model"], textAt(recordAt(appConnections.data, ["profile"]), ["model"], "")), textAt(connection, ["protocol"], "")], configured ? "default → Gateway" : "未应用")}</span>
              <span><ProviderStatusDot value={configured ? "已应用" : "pending"} /></span>
              <span className="route-acts">
                <button className="btn-ghost btn-sm" type="button" onClick={() => previewAppConnection(connection)}>预览</button>
                {configured ? (
                  <button className="btn-ghost btn-sm" type="button" disabled={providerBusy || connection.canRollback === false} onClick={() => rollbackAppConnection(connection)}>回滚</button>
                ) : (
                  <button className="btn-primary btn-sm" type="button" disabled={providerBusy || connection.canApply === false} onClick={() => applyAppConnection(connection)}>应用</button>
                )}
              </span>
            </div>
          );
        })}
        {!appConnections.isLoading && !appConnections.isError && connectionRows.length === 0 ? (
          <div className="statebox empty"><span className="si"><i data-lucide="terminal" /></span><strong>暂无客户端接入</strong><span>后端未返回可管理客户端。</span></div>
        ) : null}
      </div>
    </div>
  );

  const content = providerDialogMode
    ? renderProviderConfig
    : {
        overview: renderOverview,
        providers: renderProviders,
        models: renderModels,
        usage: renderUsage,
        accounts: renderAccounts,
        apps: renderApps,
      }[view];

  return (
    <div id="stage" className="page-stage" role="main" aria-live="polite" tabIndex={-1}>
      <div className="wrap model-gateway-page">
        <div className="viewbar" role="tablist" aria-label="模型网关视图">
          {[
            ["overview", "layout-dashboard", "概览"],
            ["providers", "route", "Provider"],
            ["models", "box", "模型"],
            ["usage", "bar-chart-3", "用量"],
          ].map(([id, icon, label]) => (
            <button key={id} className={view === id ? "on" : ""} role="tab" aria-selected={view === id} onClick={() => setView(id as GatewayView)}>
              <i data-lucide={icon} />{label}
            </button>
          ))}
        </div>
        {content()}
      </div>
    </div>
  );
}
