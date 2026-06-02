import fs from "node:fs";
import path from "node:path";
import type {
  AgentBindingInput,
  AgentBindingMutationResponse,
  AgentBindingSummary,
  AgentBindingTargetOption,
  AgentCreatePayload,
  AgentDefaultsSummary,
  AgentDeletePayload,
  AgentDeletionResult,
  AgentDetailPayload,
  AgentDocName,
  AgentDocumentPayload,
  AgentDocumentSavePayload,
  AgentDocumentSaveResponse,
  AgentDocumentSummary,
  AgentEditorPayload,
  AgentIdentitySummary,
  AgentSessionMutationResponse,
  AgentSessionSummary,
  AgentsMutationResponse,
  AgentsSummaryPayload,
  AgentSessionStats,
  AgentSummary,
  AgentUpdatePayload,
} from "../../../../types/agents.js";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  ensureDir,
  readJsonFile,
  readOpenClawConfig,
  writeJsonFile,
} from "../../core/state.js";

interface AgentDocMeta {
  name: AgentDocName;
  title: string;
  description: string;
}

interface AgentServiceErrorShape {
  statusCode: number;
  code: string;
  message: string;
}

const AGENT_DOCS: AgentDocMeta[] = [
  {
    name: "IDENTITY.md",
    title: "Identity",
    description: "Identity, emoji, role, tone, and mission.",
  },
  {
    name: "SOUL.md",
    title: "Soul",
    description: "Core behavior, tone, and long-term boundaries.",
  },
  {
    name: "AGENTS.md",
    title: "Agents",
    description: "Delegation rules, routing, and multi-agent collaboration.",
  },
  {
    name: "USER.md",
    title: "User",
    description: "User preferences, context, and interaction notes.",
  },
  {
    name: "TOOLS.md",
    title: "Tools",
    description: "Tool preferences, guardrails, and workflow hints.",
  },
  {
    name: "HEARTBEAT.md",
    title: "Heartbeat",
    description: "Periodic review or proactive check instructions.",
  },
  {
    name: "MEMORY.md",
    title: "Memory",
    description: "Long-lived memory outside the rolling session context.",
  },
];

const DEFAULT_IDENTITY: AgentIdentitySummary = {
  name: "",
  emoji: "",
  role: "",
  style: "",
  theme: "",
  avatar: "",
  mission: "",
};

const DEFAULT_RUNTIME = {
  type: "default" as const,
  backend: "",
  agent: "",
  mode: "",
  cwd: "",
};

const VALID_TOOLS_PROFILES = new Set([
  "minimal",
  "coding",
  "messaging",
  "full",
]);
const VALID_THINKING_DEFAULTS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "adaptive",
]);
const VALID_VERBOSE_DEFAULTS = new Set(["off", "on", "full"]);
const VALID_REASONING_DEFAULTS = new Set(["off", "on", "stream"]);

class AgentServiceError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  toShape(): AgentServiceErrorShape {
    return {
      statusCode: this.statusCode,
      code: this.code,
      message: this.message,
    };
  }
}

function normalizeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeNonEmptyString(value: unknown, fallback = ""): string {
  const normalized = normalizeString(value, "");
  return normalized || fallback;
}

function normalizeToolsProfile(
  value: unknown,
  fallback: unknown = "full",
): string {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "standard") return "full";
  if (VALID_TOOLS_PROFILES.has(normalized)) return normalized;

  const normalizedFallback = normalizeString(fallback, "full").toLowerCase();
  if (normalizedFallback === "standard") return "full";
  if (VALID_TOOLS_PROFILES.has(normalizedFallback)) return normalizedFallback;

  return "full";
}

function normalizeOptionalString(value: unknown): string {
  return normalizeString(value, "");
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => normalizeOptionalString(item)).filter(Boolean)),
  );
}

function cloneJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeOptionalString(item)).filter(Boolean);
}

function buildModelDisplay(value: unknown, fallback: unknown = ""): string {
  const direct = normalizeOptionalString(value);
  if (direct) return direct;

  const fromObject =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const primary = normalizeOptionalString(fromObject?.primary);
  if (primary) {
    const fallbacks = Array.isArray(fromObject?.fallbacks)
      ? fromObject?.fallbacks.filter(Boolean)
      : [];
    return fallbacks.length ? `${primary} (+${fallbacks.length})` : primary;
  }

  const directFallback = normalizeOptionalString(fallback);
  if (directFallback) return directFallback;

  const fallbackObject =
    fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? (fallback as Record<string, unknown>)
      : null;
  const fallbackPrimary = normalizeOptionalString(fallbackObject?.primary);
  if (!fallbackPrimary) return "";
  const fallbackFallbacks = Array.isArray(fallbackObject?.fallbacks)
    ? fallbackObject?.fallbacks.filter(Boolean)
    : [];
  return fallbackFallbacks.length
    ? `${fallbackPrimary} (+${fallbackFallbacks.length})`
    : fallbackPrimary;
}

function normalizeModelRaw(value: unknown): Record<string, unknown> | null {
  return cloneJsonObject(value);
}

function writeOptionalJsonObject(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) return;
  const nextValue = cloneJsonObject(value);
  if (nextValue) target[key] = nextValue;
  else delete target[key];
}

function writeOptionalStringArray(
  target: Record<string, any>,
  key: string,
  value: unknown,
): void {
  if (value === undefined) return;
  const nextValue = cloneStringArray(value);
  if (nextValue.length) target[key] = nextValue;
  else delete target[key];
}

function normalizeThinkingDefault(value: unknown, fallback = ""): string {
  const normalized = normalizeString(value).toLowerCase();
  if (VALID_THINKING_DEFAULTS.has(normalized)) return normalized;
  const normalizedFallback = normalizeString(fallback).toLowerCase();
  return VALID_THINKING_DEFAULTS.has(normalizedFallback)
    ? normalizedFallback
    : "";
}

function normalizeVerboseDefault(value: unknown, fallback = ""): string {
  const normalized = normalizeString(value).toLowerCase();
  if (VALID_VERBOSE_DEFAULTS.has(normalized)) return normalized;
  const normalizedFallback = normalizeString(fallback).toLowerCase();
  return VALID_VERBOSE_DEFAULTS.has(normalizedFallback)
    ? normalizedFallback
    : "";
}

function normalizeReasoningDefault(value: unknown, fallback = ""): string {
  const normalized = normalizeString(value).toLowerCase();
  if (VALID_REASONING_DEFAULTS.has(normalized)) return normalized;
  const normalizedFallback = normalizeString(fallback).toLowerCase();
  return VALID_REASONING_DEFAULTS.has(normalizedFallback)
    ? normalizedFallback
    : "";
}

function normalizeFastModeDefault(value: unknown, fallback = ""): string {
  if (value === true) return "on";
  if (value === false) return "off";
  if (fallback === "on" || fallback === "off") return fallback;
  return "";
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

function validateAgentId(agentId: string): string {
  const normalized = normalizeString(agentId);
  if (!normalized || !/^[a-z0-9_-]+$/.test(normalized)) {
    throw new AgentServiceError(
      400,
      "invalid_agent_id",
      "Agent ID must contain only lowercase letters, numbers, hyphens, and underscores",
    );
  }
  return normalized;
}

function getDefaultWorkspace(
  config: StudioServerConfig,
  agentId: string,
): string {
  return agentId === "main"
    ? path.join(config.openclawRoot, "workspace")
    : path.join(config.openclawRoot, `workspace-${agentId}`);
}

function resolveAgentRoot(config: StudioServerConfig, agentId: string): string {
  return path.join(config.openclawRoot, "agents", agentId);
}

function resolveAgentDir(
  config: StudioServerConfig,
  agentId: string,
  rawAgent: Record<string, any>,
): string {
  return normalizeString(
    rawAgent.agentDir,
    path.join(resolveAgentRoot(config, agentId), "agent"),
  );
}

function resolveWorkspace(
  config: StudioServerConfig,
  agentId: string,
  rawAgent: Record<string, any>,
  defaults: Record<string, any>,
): string {
  return normalizeNonEmptyString(
    rawAgent.workspace,
    normalizeNonEmptyString(
      defaults.workspace,
      getDefaultWorkspace(config, agentId),
    ),
  );
}

function isSafeDescendantPath(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget || resolvedTarget === resolvedRoot) return false;
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return (
    Boolean(relative) &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

function deletePathIfRequested(
  openclawRoot: string,
  targetPath: string,
  kind: AgentDeletionResult["kind"],
  id: string,
): AgentDeletionResult {
  const resolvedTarget = path.resolve(targetPath);
  if (!isSafeDescendantPath(openclawRoot, resolvedTarget)) {
    return {
      id,
      kind,
      path: resolvedTarget,
      deleted: false,
      reason: "outside_openclaw_root",
    };
  }

  if (!fs.existsSync(resolvedTarget)) {
    return {
      id,
      kind,
      path: resolvedTarget,
      deleted: false,
      reason: "not_found",
    };
  }

  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: false });
    return {
      id,
      kind,
      path: resolvedTarget,
      deleted: true,
    };
  } catch (error) {
    return {
      id,
      kind,
      path: resolvedTarget,
      deleted: false,
      reason: error instanceof Error ? error.message : "delete_failed",
    };
  }
}

function buildModelOptions(openclawConfig: Record<string, any>): string[] {
  const models: string[] = [];
  const addModel = (value: unknown): void => {
    const normalized = normalizeOptionalString(value);
    if (normalized && !models.includes(normalized)) models.push(normalized);
  };
  const addModelConfig = (value: unknown): void => {
    if (typeof value === "string") {
      addModel(value);
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const model = value as Record<string, any>;
    addModel(model.primary);
    if (Array.isArray(model.fallbacks)) {
      for (const fallback of model.fallbacks) addModel(fallback);
    }
  };

  for (const [providerId, provider] of Object.entries(
    openclawConfig.models?.providers || {},
  )) {
    const providerModels = Array.isArray(
      (provider as Record<string, any>).models,
    )
      ? (provider as Record<string, any>).models
      : [];
    for (const model of providerModels) {
      const id = normalizeString(
        typeof model === "string" ? model : (model as Record<string, any>).id,
      );
      if (!id) continue;
      const ref = `${providerId}/${id}`;
      addModel(ref);
    }
  }

  const defaults = openclawConfig.agents?.defaults || {};
  for (const key of [
    "model",
    "imageModel",
    "imageGenerationModel",
    "videoGenerationModel",
    "musicGenerationModel",
    "pdfModel",
  ]) {
    addModelConfig(defaults[key]);
  }
  for (const modelRef of Object.keys(defaults.models || {})) {
    addModel(modelRef);
  }
  for (const agent of Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
    : []) {
    addModelConfig((agent as Record<string, any>).model);
  }

  return models.sort((left, right) => left.localeCompare(right));
}

function getDefaultAgentId(openclawConfig: Record<string, any>): string | null {
  const list = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
    : [];
  const main = list.find(
    (agent: Record<string, any>) => normalizeString(agent.id) === "main",
  );
  if (main) return "main";
  const first = list[0];
  return first ? normalizeString(first.id) : null;
}

function createSyntheticDefaultRawAgent(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
): Record<string, any> {
  const defaults = openclawConfig.agents?.defaults || {};
  const agentId = getDefaultAgentId(openclawConfig) || "main";
  const workspace = resolveWorkspace(config, agentId, {}, defaults);
  return {
    id: agentId,
    name: normalizeString(defaults.identity?.name, agentId),
    workspace,
    agentDir: path.join(resolveAgentRoot(config, agentId), "agent"),
    identity: cloneJsonObject(defaults.identity) || undefined,
    sandbox: cloneJsonObject(defaults.sandbox) || undefined,
    tools: cloneJsonObject(defaults.tools) || undefined,
  };
}

function readTextFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function parseIdentity(
  content: string,
  fallbackName: string,
): AgentIdentitySummary {
  const parsed = { ...DEFAULT_IDENTITY, name: fallbackName };
  if (!content.trim()) return parsed;

  const fieldMap: Record<string, keyof AgentIdentitySummary> = {
    name: "name",
    emoji: "emoji",
    role: "role",
    style: "style",
    theme: "theme",
    avatar: "avatar",
  };

  const lines = content.split(/\r?\n/);
  const missionLines: string[] = [];
  let missionMode = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const fieldMatch = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
    if (fieldMatch) {
      const key = fieldMatch[1].trim().toLowerCase();
      const mapped = fieldMap[key];
      if (mapped) parsed[mapped] = fieldMatch[2].trim();
      missionMode = false;
      continue;
    }

    if (/^##\s+mission/i.test(line)) {
      missionMode = true;
      continue;
    }

    if (missionMode) {
      if (/^##\s+/.test(line)) {
        missionMode = false;
      } else if (line) {
        missionLines.push(line);
      }
    }
  }

  if (missionLines.length) parsed.mission = missionLines.join("\n");
  return parsed;
}

function formatIdentityMarkdown(identity: AgentIdentitySummary): string {
  const lines = [
    "# IDENTITY.md",
    "",
    `- **Name:** ${identity.name || ""}`,
    `- **Role:** ${identity.role || ""}`,
    `- **Emoji:** ${identity.emoji || ""}`,
    `- **Style:** ${identity.style || ""}`,
  ];

  if (identity.theme) lines.push(`- **Theme:** ${identity.theme}`);
  if (identity.avatar) lines.push(`- **Avatar:** ${identity.avatar}`);

  lines.push("", "## Mission", "", identity.mission || "");
  return `${lines.join("\n").trimEnd()}\n`;
}

function buildIdentitySummary(
  workspace: string,
  rawAgent: Record<string, any>,
): AgentIdentitySummary {
  const content = readTextFile(path.join(workspace, "IDENTITY.md"));
  return parseIdentity(
    content,
    normalizeString(rawAgent.name, normalizeString(rawAgent.id)),
  );
}

function buildRuntime(rawAgent: Record<string, any>): AgentSummary["runtime"] {
  if (rawAgent.runtime?.type === "acp") {
    return {
      type: "acp",
      backend: normalizeOptionalString(rawAgent.runtime?.acp?.backend),
      agent: normalizeOptionalString(rawAgent.runtime?.acp?.agent),
      mode: normalizeOptionalString(rawAgent.runtime?.acp?.mode),
      cwd: normalizeOptionalString(rawAgent.runtime?.acp?.cwd),
    };
  }

  return { ...DEFAULT_RUNTIME };
}

function normalizeStoredRuntime(
  runtime: unknown,
): Record<string, any> | undefined {
  if (!runtime || typeof runtime !== "object") return undefined;
  const rawRuntime = runtime as Record<string, any>;
  const type = normalizeString(rawRuntime.type).toLowerCase();

  if (!type || type === "default" || type === "embedded") return undefined;
  if (type !== "acp") return undefined;

  return {
    type: "acp",
    acp: {
      agent: normalizeOptionalString(rawRuntime.acp?.agent),
      backend: normalizeOptionalString(rawRuntime.acp?.backend),
      mode: normalizeOptionalString(rawRuntime.acp?.mode),
      cwd: normalizeOptionalString(rawRuntime.acp?.cwd),
    },
  };
}

function sanitizeAgentRuntimes(openclawConfig: Record<string, any>): void {
  if (!Array.isArray(openclawConfig.agents?.list)) return;
  for (const rawAgent of openclawConfig.agents.list) {
    if (!rawAgent || typeof rawAgent !== "object") continue;
    const normalizedRuntime = normalizeStoredRuntime(
      (rawAgent as Record<string, any>).runtime,
    );
    if (normalizedRuntime)
      (rawAgent as Record<string, any>).runtime = normalizedRuntime;
    else delete (rawAgent as Record<string, any>).runtime;
  }
}

function buildEditorPayload(
  config: StudioServerConfig,
  rawAgent: Record<string, any>,
  defaults: Record<string, any>,
  identity: AgentIdentitySummary,
): AgentEditorPayload {
  const agentId = normalizeString(rawAgent.id);
  return {
    name: normalizeString(rawAgent.name, identity.name || agentId),
    model:
      typeof rawAgent.model === "string"
        ? normalizeOptionalString(rawAgent.model)
        : "",
    modelRaw: normalizeModelRaw(rawAgent.model),
    workspace: resolveWorkspace(config, agentId, rawAgent, defaults),
    enabled: true,
    sandboxMode: normalizeString(
      rawAgent.sandbox?.mode,
      normalizeString(defaults.sandbox?.mode, "off"),
    ),
    workspaceAccess: normalizeString(
      rawAgent.sandbox?.workspaceAccess,
      normalizeString(defaults.sandbox?.workspaceAccess, "rw"),
    ),
    toolsProfile: normalizeToolsProfile(
      rawAgent.tools?.profile,
      defaults.tools?.profile,
    ),
    fsWorkspaceOnly: normalizeBoolean(
      rawAgent.tools?.fs?.workspaceOnly,
      normalizeBoolean(defaults.tools?.fs?.workspaceOnly, false),
    ),
    thinkingDefault: normalizeThinkingDefault(rawAgent.thinkingDefault),
    verboseDefault: normalizeVerboseDefault(rawAgent.verboseDefault),
    reasoningDefault: normalizeReasoningDefault(rawAgent.reasoningDefault),
    fastModeDefault: normalizeFastModeDefault(rawAgent.fastModeDefault),
    systemPromptOverride: normalizeOptionalString(
      rawAgent.systemPromptOverride,
    ),
    skills: cloneStringArray(rawAgent.skills),
    sandboxRaw: cloneJsonObject(rawAgent.sandbox),
    toolsRaw: cloneJsonObject(rawAgent.tools),
    memorySearch: cloneJsonObject(rawAgent.memorySearch),
    humanDelay: cloneJsonObject(rawAgent.humanDelay),
    heartbeat: cloneJsonObject(rawAgent.heartbeat),
    groupChat: cloneJsonObject(rawAgent.groupChat),
    subagents: cloneJsonObject(rawAgent.subagents),
    params: cloneJsonObject(rawAgent.params),
    runtime: buildRuntime(rawAgent),
    identity,
  };
}

function buildDefaultsSummary(
  openclawConfig: Record<string, any>,
): AgentDefaultsSummary {
  const defaults = openclawConfig.agents?.defaults || {};
  return {
    model: buildModelDisplay(defaults.model),
    workspace: normalizeString(defaults.workspace),
    sandboxMode: normalizeString(defaults.sandbox?.mode, "off"),
    workspaceAccess: normalizeString(defaults.sandbox?.workspaceAccess, "rw"),
    toolsProfile: normalizeToolsProfile(openclawConfig.tools?.profile),
    thinkingDefault: normalizeThinkingDefault(defaults.thinkingDefault),
    verboseDefault: normalizeVerboseDefault(defaults.verboseDefault),
  };
}

function buildLastRoute(session: Record<string, any>): string {
  const parts = [
    normalizeOptionalString(session.lastChannel),
    normalizeOptionalString(session.lastAccountId),
    normalizeOptionalString(session.lastTo),
  ].filter(Boolean);
  return parts.join(" · ");
}

function summarizeSessions(agentRoot: string): AgentSessionStats {
  const sessionsPath = path.join(agentRoot, "sessions", "sessions.json");
  const sessions = readJsonFile<Record<string, any>>(sessionsPath, {});

  let totalTokens = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheRead = 0;
  let cacheWrite = 0;
  let hottestSessionId = "";
  let lastRoute = "";
  let lastActiveAt: string | null = null;
  let hottestUpdatedAt = 0;

  for (const entry of Object.values(sessions)) {
    const record = entry as Record<string, any>;
    totalTokens += Number(record.totalTokens || 0);
    inputTokens += Number(record.inputTokens || 0);
    outputTokens += Number(record.outputTokens || 0);
    cacheRead += Number(record.cacheRead || 0);
    cacheWrite += Number(record.cacheWrite || 0);

    const updatedAtMs = Number(
      record.updatedAtMs || record.updatedAt || record.lastMessageAtMs || 0,
    );
    if (Number.isFinite(updatedAtMs) && updatedAtMs > hottestUpdatedAt) {
      hottestUpdatedAt = updatedAtMs;
      hottestSessionId = normalizeOptionalString(record.sessionId);
      lastActiveAt = normalizeDate(updatedAtMs);
      lastRoute = buildLastRoute(record);
    }
  }

  return {
    count: Object.keys(sessions).length,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheRead,
    cacheWrite,
    lastActiveAt,
    hottestSessionId,
    lastRoute,
  };
}

function statFile(filePath: string): {
  exists: boolean;
  size: number;
  updatedAt: string | null;
} {
  try {
    const stat = fs.statSync(filePath);
    return {
      exists: true,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      exists: false,
      size: 0,
      updatedAt: null,
    };
  }
}

function getDocMeta(docName: AgentDocName): AgentDocMeta {
  const match = AGENT_DOCS.find((doc) => doc.name === docName);
  if (!match) {
    throw new AgentServiceError(
      400,
      "invalid_doc_name",
      `Unsupported document '${docName}'`,
    );
  }
  return match;
}

function buildDocuments(workspace: string): AgentDocumentSummary[] {
  return AGENT_DOCS.map((doc) => {
    const filePath = path.join(workspace, doc.name);
    const stat = statFile(filePath);
    return {
      name: doc.name,
      title: doc.title,
      description: doc.description,
      path: filePath,
      exists: stat.exists,
      size: stat.size,
      updatedAt: stat.updatedAt,
    };
  });
}

function buildBindingTargets(
  openclawConfig: Record<string, any>,
): AgentBindingTargetOption[] {
  const channels =
    openclawConfig.channels && typeof openclawConfig.channels === "object"
      ? (openclawConfig.channels as Record<string, any>)
      : {};

  return Object.entries(channels)
    .filter(([, value]) => Boolean(value) && typeof value === "object")
    .map(([channel, value]) => {
      const accounts =
        value &&
        typeof value === "object" &&
        value.accounts &&
        typeof value.accounts === "object"
          ? (value.accounts as Record<string, any>)
          : {};
      const accountIds = Object.keys(accounts).sort((left, right) => {
        if (left === "default") return -1;
        if (right === "default") return 1;
        return left.localeCompare(right);
      });
      return {
        channel,
        label: channel,
        accounts: accountIds.map((accountId) => ({
          id: accountId,
          label: accountId === "default" ? "default" : accountId,
        })),
      };
    })
    .sort((left, right) => left.channel.localeCompare(right.channel));
}

function buildAgentBindingId(rawBinding: Record<string, any>): string {
  return Buffer.from(
    JSON.stringify({
      type: rawBinding.type === "acp" ? "acp" : "agent",
      agentId: rawBinding.agentId || "",
      match: rawBinding.match || {},
      comment: rawBinding.comment || "",
      acp: rawBinding.acp || {},
    }),
  ).toString("base64url");
}

function buildBindings(
  openclawConfig: Record<string, any>,
  agentId: string,
): AgentBindingSummary[] {
  const bindings = Array.isArray(openclawConfig.bindings)
    ? openclawConfig.bindings
    : [];
  return bindings
    .map((binding: Record<string, any>) => ({ binding }))
    .filter(
      ({ binding }: { binding: Record<string, any> }) =>
        normalizeString(binding.agentId) === agentId,
    )
    .map(({ binding }: { binding: Record<string, any> }) => {
      const channel = normalizeOptionalString(binding.match?.channel);
      const accountId = normalizeOptionalString(binding.match?.accountId);
      const peerKind = normalizeOptionalString(binding.match?.peer?.kind);
      const peerId = normalizeOptionalString(binding.match?.peer?.id);
      const guildId = normalizeOptionalString(binding.match?.guildId);
      const teamId = normalizeOptionalString(binding.match?.teamId);
      const roles = normalizeStringList(binding.match?.roles);
      const type = binding.type === "acp" ? "acp" : "route";
      const descriptionParts = [
        channel || "default",
        accountId ? `account=${accountId}` : "",
        peerKind && peerId ? `${peerKind}:${peerId}` : "",
        guildId ? `guild=${guildId}` : "",
        teamId ? `team=${teamId}` : "",
        roles.length ? `roles=${roles.join(",")}` : "",
      ].filter(Boolean);

      return {
        id: buildAgentBindingId(binding),
        ref: [channel, accountId, peerKind, peerId, guildId, teamId]
          .concat(roles)
          .filter(Boolean)
          .join(":"),
        type,
        channel,
        accountId,
        peerKind,
        peerId,
        guildId,
        teamId,
        roles,
        description: descriptionParts.join(" · ") || "default route",
        comment: normalizeOptionalString(binding.comment),
        backend: normalizeOptionalString(binding.acp?.backend),
        mode: normalizeOptionalString(binding.acp?.mode),
        cwd: normalizeOptionalString(binding.acp?.cwd),
        label: normalizeOptionalString(binding.acp?.label),
      };
    });
}

function buildSessionRecord(
  routeKey: string,
  session: Record<string, any>,
): AgentSessionSummary {
  return {
    id: normalizeOptionalString(session.sessionId) || routeKey,
    sessionId: normalizeOptionalString(session.sessionId),
    routeKey,
    lastRoute: buildLastRoute(session),
    model: [
      normalizeOptionalString(session.modelProvider),
      normalizeOptionalString(session.model),
    ]
      .filter(Boolean)
      .join("/"),
    totalTokens: normalizeNumber(session.totalTokens),
    inputTokens: normalizeNumber(session.inputTokens),
    outputTokens: normalizeNumber(session.outputTokens),
    cacheRead: normalizeNumber(session.cacheRead),
    cacheWrite: normalizeNumber(session.cacheWrite),
    updatedAt: normalizeDate(
      session.updatedAtMs ||
        session.updatedAt ||
        session.lastMessageAtMs ||
        session.lastMessageAt,
    ),
    chatType: normalizeOptionalString(session.chatType),
    sessionFile: normalizeOptionalString(session.sessionFile),
  };
}

function buildRecentSessions(agentRoot: string): AgentSessionSummary[] {
  const sessionsPath = path.join(agentRoot, "sessions", "sessions.json");
  const sessions = readJsonFile<Record<string, any>>(sessionsPath, {});
  return Object.entries(sessions)
    .map(([routeKey, session]) =>
      buildSessionRecord(routeKey, session as Record<string, any>),
    )
    .sort((left, right) =>
      (right.updatedAt || "").localeCompare(left.updatedAt || ""),
    )
    .slice(0, 20);
}

function mapAgentSummary(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  rawAgent: Record<string, any>,
): AgentSummary {
  const defaults = openclawConfig.agents?.defaults || {};
  const agentId = normalizeString(rawAgent.id);
  const workspace = resolveWorkspace(config, agentId, rawAgent, defaults);
  const identity = buildIdentitySummary(workspace, rawAgent);
  const runtime = buildRuntime(rawAgent);
  const sessions = summarizeSessions(resolveAgentRoot(config, agentId));
  const bindings = buildBindings(openclawConfig, agentId);
  const docs = buildDocuments(workspace);
  const defaultAgentId = getDefaultAgentId(openclawConfig);

  return {
    id: agentId,
    name: normalizeString(rawAgent.name, identity.name || agentId),
    model: buildModelDisplay(rawAgent.model, defaults.model),
    workspace,
    agentDir: resolveAgentDir(config, agentId, rawAgent),
    enabled: true,
    isDefault: defaultAgentId === agentId,
    sessionCount: sessions.count,
    totalTokens: sessions.totalTokens,
    lastActiveAt: sessions.lastActiveAt,
    sandboxMode: normalizeString(
      rawAgent.sandbox?.mode,
      normalizeString(defaults.sandbox?.mode, "off"),
    ),
    workspaceAccess: normalizeString(
      rawAgent.sandbox?.workspaceAccess,
      normalizeString(defaults.sandbox?.workspaceAccess, "rw"),
    ),
    toolsProfile: normalizeToolsProfile(
      rawAgent.tools?.profile,
      openclawConfig.tools?.profile,
    ),
    fsWorkspaceOnly: normalizeBoolean(rawAgent.tools?.fs?.workspaceOnly, false),
    thinkingDefault: normalizeThinkingDefault(
      rawAgent.thinkingDefault,
      defaults.thinkingDefault,
    ),
    verboseDefault: normalizeVerboseDefault(
      rawAgent.verboseDefault,
      defaults.verboseDefault,
    ),
    reasoningDefault: normalizeReasoningDefault(rawAgent.reasoningDefault),
    fastModeDefault: normalizeFastModeDefault(rawAgent.fastModeDefault),
    bindingCount: bindings.length,
    docCount: docs.filter((doc) => doc.exists).length,
    identity,
    runtime,
  };
}

function findRawAgent(
  openclawConfig: Record<string, any>,
  agentId: string,
): Record<string, any> | null {
  const list = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
    : [];
  return (
    list.find(
      (agent: Record<string, any>) => normalizeString(agent.id) === agentId,
    ) || null
  );
}

function findOrCreateEffectiveRawAgent(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  agentId: string,
): Record<string, any> | null {
  const direct = findRawAgent(openclawConfig, agentId);
  if (direct) return direct;
  const defaultAgentId = getDefaultAgentId(openclawConfig) || "main";
  const list = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list
    : [];
  if (list.length === 0 && agentId === defaultAgentId) {
    return createSyntheticDefaultRawAgent(config, openclawConfig);
  }
  return null;
}

function buildDetail(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  rawAgent: Record<string, any>,
): AgentDetailPayload {
  const agent = mapAgentSummary(config, openclawConfig, rawAgent);
  const defaults = openclawConfig.agents?.defaults || {};
  const docs = buildDocuments(agent.workspace);
  const sessions = summarizeSessions(resolveAgentRoot(config, agent.id));
  const bindings = buildBindings(openclawConfig, agent.id);
  const bindingTargets = buildBindingTargets(openclawConfig);
  const recentSessions = buildRecentSessions(
    resolveAgentRoot(config, agent.id),
  );

  return {
    checkedAt: new Date().toISOString(),
    agent,
    editor: buildEditorPayload(config, rawAgent, defaults, agent.identity),
    defaults: buildDefaultsSummary(openclawConfig),
    rawConfig: JSON.parse(JSON.stringify(rawAgent)) as Record<string, unknown>,
    docs,
    bindings,
    bindingTargets,
    sessions,
    recentSessions,
  };
}

function seedWorkspaceDocs(
  workspace: string,
  identity: AgentIdentitySummary,
  agentId: string,
): void {
  ensureDir(workspace);

  const identityFile = path.join(workspace, "IDENTITY.md");
  if (!fs.existsSync(identityFile)) {
    fs.writeFileSync(identityFile, formatIdentityMarkdown(identity), "utf-8");
  }

  const starterFiles: Array<[string, string]> = [
    [
      "AGENTS.md",
      `# AGENTS.md\n\n- Define delegation, routing, and collaboration rules for \`${agentId}\`.\n`,
    ],
    [
      "SOUL.md",
      `# SOUL.md\n\n- Describe the core behavior, tone, and values of \`${identity.name || agentId}\`.\n`,
    ],
    [
      "TOOLS.md",
      "# TOOLS.md\n\n- Document tool preferences, constraints, and execution notes here.\n",
    ],
    [
      "USER.md",
      "# USER.md\n\n- Capture user preferences, expectations, and delivery style here.\n",
    ],
    [
      "HEARTBEAT.md",
      "# HEARTBEAT.md\n\n- Add periodic review or proactive work instructions here.\n",
    ],
  ];

  for (const [name, content] of starterFiles) {
    const filePath = path.join(workspace, name);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, content, "utf-8");
  }
}

function applyRuntimeInput(
  input: AgentUpdatePayload["runtime"],
): Record<string, any> | undefined {
  if (!input) return undefined;
  if (!input.type || input.type === "default") return undefined;

  return {
    type: "acp",
    acp: {
      agent: normalizeOptionalString(input.agent),
      backend: normalizeOptionalString(input.backend),
      mode: normalizeOptionalString(input.mode),
      cwd: normalizeOptionalString(input.cwd),
    },
  };
}

function buildIdentityFromInput(
  next:
    | AgentUpdatePayload["identity"]
    | AgentCreatePayload["identity"]
    | undefined,
  fallbackName: string,
  existing: AgentIdentitySummary,
): AgentIdentitySummary {
  return {
    name: normalizeString(next?.name, existing.name || fallbackName),
    emoji: normalizeOptionalString(next?.emoji) || existing.emoji,
    role: normalizeOptionalString(next?.role) || existing.role,
    style: normalizeOptionalString(next?.style) || existing.style,
    theme: normalizeOptionalString(next?.theme) || existing.theme,
    avatar: normalizeOptionalString(next?.avatar) || existing.avatar,
    mission: normalizeOptionalString(next?.mission) || existing.mission,
  };
}

function saveIdentityDoc(
  workspace: string,
  identity: AgentIdentitySummary,
): void {
  ensureDir(workspace);
  fs.writeFileSync(
    path.join(workspace, "IDENTITY.md"),
    formatIdentityMarkdown(identity),
    "utf-8",
  );
}

function stripLegacyAgentEnabledKeys(
  openclawConfig: Record<string, any>,
): void {
  if (!Array.isArray(openclawConfig.agents?.list)) return;
  for (const agent of openclawConfig.agents.list) {
    if (agent && typeof agent === "object" && Object.hasOwn(agent, "enabled")) {
      delete (agent as Record<string, any>).enabled;
    }
  }
}

function readAgentSessionsStore(
  config: StudioServerConfig,
  agentId: string,
): Record<string, any> {
  return readJsonFile<Record<string, any>>(
    path.join(resolveAgentRoot(config, agentId), "sessions", "sessions.json"),
    {},
  );
}

function writeAgentSessionsStore(
  config: StudioServerConfig,
  agentId: string,
  value: Record<string, any>,
): void {
  writeJsonFile(
    path.join(resolveAgentRoot(config, agentId), "sessions", "sessions.json"),
    value,
  );
}

function findBindingIndex(
  openclawConfig: Record<string, any>,
  agentId: string,
  bindingId: string,
): number {
  const bindings = Array.isArray(openclawConfig.bindings)
    ? openclawConfig.bindings
    : [];
  const bindingIndex = bindings.findIndex(
    (binding: Record<string, any>) =>
      normalizeString(binding.agentId) === agentId &&
      buildAgentBindingId(binding) === bindingId,
  );
  if (bindingIndex < 0) {
    throw new AgentServiceError(
      404,
      "binding_not_found",
      `Binding '${bindingId}' not found`,
    );
  }
  return bindingIndex;
}

function validateBindingInput(
  openclawConfig: Record<string, any>,
  payload: AgentBindingInput,
): Record<string, any> {
  const channel = normalizeString(payload.channel);
  if (!channel) {
    throw new AgentServiceError(
      400,
      "invalid_binding_channel",
      "Binding channel is required",
    );
  }

  const channels =
    openclawConfig.channels && typeof openclawConfig.channels === "object"
      ? (openclawConfig.channels as Record<string, any>)
      : {};
  const channelConfig = channels[channel];
  if (!channelConfig || typeof channelConfig !== "object") {
    throw new AgentServiceError(
      400,
      "invalid_binding_channel",
      `Channel '${channel}' is not configured`,
    );
  }

  const accountId = normalizeOptionalString(payload.accountId);
  const accounts =
    channelConfig.accounts && typeof channelConfig.accounts === "object"
      ? (channelConfig.accounts as Record<string, any>)
      : {};
  if (accountId && !Object.hasOwn(accounts, accountId)) {
    throw new AgentServiceError(
      400,
      "invalid_binding_account",
      `Account '${accountId}' does not exist for channel '${channel}'`,
    );
  }

  const teamId = normalizeOptionalString(payload.teamId);
  const roles = normalizeStringList(payload.roles);

  return {
    comment: normalizeOptionalString(payload.comment),
    match: {
      channel,
      ...(accountId ? { accountId } : {}),
      ...(normalizeOptionalString(payload.peerKind) &&
      normalizeOptionalString(payload.peerId)
        ? {
            peer: {
              kind: normalizeOptionalString(payload.peerKind),
              id: normalizeOptionalString(payload.peerId),
            },
          }
        : {}),
      ...(normalizeOptionalString(payload.guildId)
        ? { guildId: normalizeOptionalString(payload.guildId) }
        : {}),
      ...(teamId ? { teamId } : {}),
      ...(roles.length ? { roles } : {}),
    },
    ...(payload.type === "acp"
      ? {
          type: "acp",
          acp: {
            backend: normalizeOptionalString(payload.backend),
            mode: normalizeOptionalString(payload.mode),
            cwd: normalizeOptionalString(payload.cwd),
            label: normalizeOptionalString(payload.label),
          },
        }
      : {}),
  };
}

export interface AgentsService {
  getSummary(): AgentsSummaryPayload;
  getDetail(agentId: string): AgentDetailPayload | null;
  createAgent(payload: AgentCreatePayload): AgentsMutationResponse;
  updateAgent(
    agentId: string,
    payload: AgentUpdatePayload,
  ): AgentsMutationResponse;
  deleteAgent(
    agentId: string,
    payload?: AgentDeletePayload,
  ): AgentsMutationResponse;
  createBinding(
    agentId: string,
    payload: AgentBindingInput,
  ): AgentBindingMutationResponse;
  updateBinding(
    agentId: string,
    bindingId: string,
    payload: AgentBindingInput,
  ): AgentBindingMutationResponse;
  deleteBinding(
    agentId: string,
    bindingId: string,
  ): AgentBindingMutationResponse;
  deleteSession(
    agentId: string,
    sessionId: string,
  ): AgentSessionMutationResponse;
  clearSessions(agentId: string): AgentSessionMutationResponse;
  getDocument(agentId: string, docName: AgentDocName): AgentDocumentPayload;
  saveDocument(
    agentId: string,
    docName: AgentDocName,
    payload: AgentDocumentSavePayload,
  ): AgentDocumentSaveResponse;
}

export function createAgentsService(config: StudioServerConfig): AgentsService {
  return {
    getSummary(): AgentsSummaryPayload {
      const openclawConfig = readOpenClawConfig(config);
      const rawAgents = Array.isArray(openclawConfig.agents?.list)
        ? openclawConfig.agents.list
        : [];
      const agents = (
        rawAgents.length
          ? rawAgents
          : [createSyntheticDefaultRawAgent(config, openclawConfig)]
      )
        .map((rawAgent: Record<string, any>) =>
          mapAgentSummary(config, openclawConfig, rawAgent),
        )
        .sort((left: AgentSummary, right: AgentSummary) =>
          left.id.localeCompare(right.id),
        );

      return {
        checkedAt: new Date().toISOString(),
        count: agents.length,
        defaultAgentId: getDefaultAgentId(openclawConfig) || "main",
        availableModels: buildModelOptions(openclawConfig),
        agents,
      };
    },

    getDetail(agentId: string): AgentDetailPayload | null {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findOrCreateEffectiveRawAgent(
        config,
        openclawConfig,
        normalizedAgentId,
      );
      if (!rawAgent) return null;
      return buildDetail(config, openclawConfig, rawAgent);
    },

    createAgent(payload: AgentCreatePayload): AgentsMutationResponse {
      const openclawConfig = readOpenClawConfig(config);
      const agentId = validateAgentId(payload.id);
      const list = Array.isArray(openclawConfig.agents?.list)
        ? openclawConfig.agents.list
        : [];

      if (
        list.some(
          (agent: Record<string, any>) => normalizeString(agent.id) === agentId,
        )
      ) {
        throw new AgentServiceError(
          409,
          "agent_exists",
          `Agent '${agentId}' already exists`,
        );
      }

      openclawConfig.agents = openclawConfig.agents || {};
      openclawConfig.agents.list = list;

      const defaults = openclawConfig.agents.defaults || {};
      const workspace = normalizeNonEmptyString(
        payload.workspace,
        getDefaultWorkspace(config, agentId),
      );
      const identity = buildIdentityFromInput(
        payload.identity,
        normalizeString(payload.name, agentId),
        {
          ...DEFAULT_IDENTITY,
          name: normalizeString(payload.name, agentId),
        },
      );
      const sandbox = cloneJsonObject(payload.sandboxRaw) || {};
      const tools = cloneJsonObject(payload.toolsRaw) || {};
      const toolsFs =
        cloneJsonObject((tools as Record<string, unknown>).fs) || {};
      const nextAgent: Record<string, any> = {
        id: agentId,
        name: normalizeString(payload.name, identity.name || agentId),
        workspace,
        agentDir: path.join(resolveAgentRoot(config, agentId), "agent"),
        sandbox: {
          ...sandbox,
          mode: normalizeString(
            payload.sandboxMode,
            normalizeString(defaults.sandbox?.mode, "off"),
          ),
          workspaceAccess: normalizeString(
            payload.workspaceAccess,
            normalizeString(defaults.sandbox?.workspaceAccess, "rw"),
          ),
        },
        tools: {
          ...tools,
          profile: normalizeToolsProfile(
            payload.toolsProfile,
            openclawConfig.tools?.profile,
          ),
          fs: {
            ...toolsFs,
            workspaceOnly: payload.fsWorkspaceOnly === true,
          },
        },
      };

      const modelRaw = cloneJsonObject(payload.modelRaw);
      if (modelRaw) nextAgent.model = modelRaw;
      else {
        const model = normalizeOptionalString(payload.model);
        if (model) nextAgent.model = model;
      }
      const thinkingDefault = normalizeThinkingDefault(payload.thinkingDefault);
      if (thinkingDefault) nextAgent.thinkingDefault = thinkingDefault;
      const verboseDefault = normalizeVerboseDefault(payload.verboseDefault);
      if (verboseDefault) nextAgent.verboseDefault = verboseDefault;
      const reasoningDefault = normalizeReasoningDefault(
        payload.reasoningDefault,
      );
      if (reasoningDefault) nextAgent.reasoningDefault = reasoningDefault;
      const fastModeDefault = normalizeFastModeDefault(payload.fastModeDefault);
      if (fastModeDefault) nextAgent.fastModeDefault = fastModeDefault === "on";
      const systemPromptOverride = normalizeOptionalString(
        payload.systemPromptOverride,
      );
      if (systemPromptOverride)
        nextAgent.systemPromptOverride = systemPromptOverride;
      writeOptionalStringArray(nextAgent, "skills", payload.skills);
      writeOptionalJsonObject(nextAgent, "memorySearch", payload.memorySearch);
      writeOptionalJsonObject(nextAgent, "humanDelay", payload.humanDelay);
      writeOptionalJsonObject(nextAgent, "heartbeat", payload.heartbeat);
      writeOptionalJsonObject(nextAgent, "groupChat", payload.groupChat);
      writeOptionalJsonObject(nextAgent, "subagents", payload.subagents);
      writeOptionalJsonObject(nextAgent, "params", payload.params);

      const runtime = applyRuntimeInput(payload.runtime);
      if (runtime) nextAgent.runtime = runtime;

      stripLegacyAgentEnabledKeys(openclawConfig);
      sanitizeAgentRuntimes(openclawConfig);
      openclawConfig.agents.list.push(nextAgent);
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      ensureDir(path.join(resolveAgentRoot(config, agentId), "agent"));
      ensureDir(path.join(resolveAgentRoot(config, agentId), "sessions"));
      ensureDir(path.join(resolveAgentRoot(config, agentId), "logs"));
      seedWorkspaceDocs(workspace, identity, agentId);

      const detail = this.getDetail(agentId);
      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Agent '${agentId}' created`,
        agent: detail?.agent,
        detail: detail || undefined,
      };
    },

    updateAgent(
      agentId: string,
      payload: AgentUpdatePayload,
    ): AgentsMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      let rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        const defaultAgentId = getDefaultAgentId(openclawConfig) || "main";
        const list = Array.isArray(openclawConfig.agents?.list)
          ? openclawConfig.agents.list
          : [];
        if (normalizedAgentId !== defaultAgentId || list.length > 0) {
          throw new AgentServiceError(
            404,
            "agent_not_found",
            `Agent '${normalizedAgentId}' not found`,
          );
        }
        openclawConfig.agents = openclawConfig.agents || {};
        openclawConfig.agents.list = list;
        rawAgent = createSyntheticDefaultRawAgent(config, openclawConfig);
        openclawConfig.agents.list.push(rawAgent);
      }

      const defaults = openclawConfig.agents?.defaults || {};
      const currentWorkspace = resolveWorkspace(
        config,
        normalizedAgentId,
        rawAgent,
        defaults,
      );
      const currentIdentity = buildIdentitySummary(currentWorkspace, rawAgent);
      const nextName =
        payload.name !== undefined
          ? normalizeString(payload.name, normalizedAgentId)
          : normalizeString(
              rawAgent.name,
              currentIdentity.name || normalizedAgentId,
            );
      const nextWorkspace =
        payload.workspace !== undefined
          ? normalizeNonEmptyString(payload.workspace, currentWorkspace)
          : currentWorkspace;

      rawAgent.name = nextName;
      delete rawAgent.enabled;

      if (payload.modelRaw !== undefined) {
        const nextModelRaw = cloneJsonObject(payload.modelRaw);
        if (nextModelRaw) rawAgent.model = nextModelRaw;
        else delete rawAgent.model;
      } else if (payload.model !== undefined) {
        const nextModel = normalizeOptionalString(payload.model);
        if (nextModel) rawAgent.model = nextModel;
        else delete rawAgent.model;
      }

      if (payload.workspace !== undefined) {
        rawAgent.workspace = nextWorkspace;
      }
      if (payload.thinkingDefault !== undefined) {
        const nextThinkingDefault = normalizeThinkingDefault(
          payload.thinkingDefault,
        );
        if (nextThinkingDefault) rawAgent.thinkingDefault = nextThinkingDefault;
        else delete rawAgent.thinkingDefault;
      }
      if (payload.verboseDefault !== undefined) {
        const nextVerboseDefault = normalizeVerboseDefault(
          payload.verboseDefault,
        );
        if (nextVerboseDefault) rawAgent.verboseDefault = nextVerboseDefault;
        else delete rawAgent.verboseDefault;
      }
      if (payload.reasoningDefault !== undefined) {
        const nextReasoningDefault = normalizeReasoningDefault(
          payload.reasoningDefault,
        );
        if (nextReasoningDefault)
          rawAgent.reasoningDefault = nextReasoningDefault;
        else delete rawAgent.reasoningDefault;
      }
      if (payload.fastModeDefault !== undefined) {
        const nextFastModeDefault = normalizeFastModeDefault(
          payload.fastModeDefault,
        );
        if (nextFastModeDefault)
          rawAgent.fastModeDefault = nextFastModeDefault === "on";
        else delete rawAgent.fastModeDefault;
      }
      if (payload.systemPromptOverride !== undefined) {
        const nextSystemPromptOverride = normalizeOptionalString(
          payload.systemPromptOverride,
        );
        if (nextSystemPromptOverride)
          rawAgent.systemPromptOverride = nextSystemPromptOverride;
        else delete rawAgent.systemPromptOverride;
      }
      writeOptionalStringArray(rawAgent, "skills", payload.skills);
      writeOptionalJsonObject(rawAgent, "memorySearch", payload.memorySearch);
      writeOptionalJsonObject(rawAgent, "humanDelay", payload.humanDelay);
      writeOptionalJsonObject(rawAgent, "heartbeat", payload.heartbeat);
      writeOptionalJsonObject(rawAgent, "groupChat", payload.groupChat);
      writeOptionalJsonObject(rawAgent, "subagents", payload.subagents);
      writeOptionalJsonObject(rawAgent, "params", payload.params);

      if (payload.sandboxRaw !== undefined) {
        rawAgent.sandbox = cloneJsonObject(payload.sandboxRaw) || {};
      } else {
        rawAgent.sandbox = rawAgent.sandbox || {};
      }
      if (payload.sandboxMode !== undefined)
        rawAgent.sandbox.mode = normalizeString(
          payload.sandboxMode,
          normalizeString(defaults.sandbox?.mode, "off"),
        );
      if (payload.workspaceAccess !== undefined)
        rawAgent.sandbox.workspaceAccess = normalizeString(
          payload.workspaceAccess,
          normalizeString(defaults.sandbox?.workspaceAccess, "rw"),
        );

      if (payload.toolsRaw !== undefined) {
        rawAgent.tools = cloneJsonObject(payload.toolsRaw) || {};
      } else {
        rawAgent.tools = rawAgent.tools || {};
      }
      rawAgent.tools.fs = cloneJsonObject(rawAgent.tools.fs) || {};
      if (payload.toolsProfile !== undefined)
        rawAgent.tools.profile = normalizeToolsProfile(
          payload.toolsProfile,
          openclawConfig.tools?.profile,
        );
      if (payload.fsWorkspaceOnly !== undefined)
        rawAgent.tools.fs.workspaceOnly = payload.fsWorkspaceOnly === true;

      if (payload.runtime !== undefined) {
        const runtime = applyRuntimeInput(payload.runtime);
        if (runtime) rawAgent.runtime = runtime;
        else delete rawAgent.runtime;
      }

      const normalizedStoredRuntime = normalizeStoredRuntime(rawAgent.runtime);
      if (normalizedStoredRuntime) rawAgent.runtime = normalizedStoredRuntime;
      else delete rawAgent.runtime;

      stripLegacyAgentEnabledKeys(openclawConfig);
      sanitizeAgentRuntimes(openclawConfig);
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      ensureDir(nextWorkspace);
      const nextIdentity = buildIdentityFromInput(
        payload.identity,
        nextName || normalizedAgentId,
        currentIdentity,
      );
      saveIdentityDoc(nextWorkspace, nextIdentity);

      const detail = this.getDetail(normalizedAgentId);
      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Agent '${normalizedAgentId}' updated`,
        agent: detail?.agent,
        detail: detail || undefined,
      };
    },

    deleteAgent(
      agentId: string,
      payload?: AgentDeletePayload,
    ): AgentsMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const list = Array.isArray(openclawConfig.agents?.list)
        ? openclawConfig.agents.list
        : [];
      const rawAgent = list.find(
        (agent: Record<string, any>) =>
          normalizeString(agent.id) === normalizedAgentId,
      );
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const nextList = list.filter(
        (agent: Record<string, any>) =>
          normalizeString(agent.id) !== normalizedAgentId,
      );
      const deleteWorkspace = payload?.deleteWorkspace === true;
      const deleteAgentDir = payload?.deleteAgentDir === true;
      const options = { deleteWorkspace, deleteAgentDir };

      const resolvedWorkspace = resolveWorkspace(
        config,
        normalizedAgentId,
        rawAgent,
        openclawConfig.agents?.defaults || {},
      );
      const resolvedAgentDir = resolveAgentDir(
        config,
        normalizedAgentId,
        rawAgent,
      );
      const agentRoot = resolveAgentRoot(config, normalizedAgentId);

      openclawConfig.agents = openclawConfig.agents || {};
      openclawConfig.agents.list = nextList;
      if (Array.isArray(openclawConfig.bindings)) {
        openclawConfig.bindings = openclawConfig.bindings.filter(
          (binding: Record<string, any>) =>
            normalizeString(binding.agentId) !== normalizedAgentId,
        );
      }
      stripLegacyAgentEnabledKeys(openclawConfig);
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      const deletionResults: AgentDeletionResult[] = [];
      const statePaths = [
        path.join(agentRoot, "sessions"),
        path.join(agentRoot, "logs"),
      ];
      for (const statePath of statePaths) {
        deletionResults.push(
          deletePathIfRequested(
            config.openclawRoot,
            statePath,
            "stateDir",
            normalizedAgentId,
          ),
        );
      }

      if (deleteAgentDir) {
        deletionResults.push(
          deletePathIfRequested(
            config.openclawRoot,
            resolvedAgentDir,
            "agentDir",
            normalizedAgentId,
          ),
        );
      }
      if (deleteWorkspace) {
        deletionResults.push(
          deletePathIfRequested(
            config.openclawRoot,
            resolvedWorkspace,
            "workspace",
            normalizedAgentId,
          ),
        );
      }

      const remainingInRoot = fs.existsSync(agentRoot)
        ? fs.readdirSync(agentRoot).filter((name) => !name.startsWith("."))
        : [];
      if (remainingInRoot.length === 0) {
        deletionResults.push(
          deletePathIfRequested(
            config.openclawRoot,
            agentRoot,
            "agentRoot",
            normalizedAgentId,
          ),
        );
      } else {
        deletionResults.push({
          id: normalizedAgentId,
          kind: "agentRoot",
          path: path.resolve(agentRoot),
          deleted: false,
          reason: "not_empty",
        });
      }

      const deletedKinds = Array.from(
        new Set(
          deletionResults
            .filter((entry) => entry.deleted)
            .map((entry) => entry.kind),
        ),
      );
      const retainedKinds = [
        !deleteWorkspace ? "workspace" : "",
        !deleteAgentDir ? "agentDir" : "",
      ].filter(Boolean);

      const messageParts = [
        `Agent '${normalizedAgentId}' removed from config and bindings`,
      ];
      if (deletedKinds.length) {
        messageParts.push(`deleted: ${deletedKinds.join(", ")}`);
      }
      if (retainedKinds.length) {
        messageParts.push(`preserved: ${retainedKinds.join(", ")}`);
      }

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `${messageParts.join("; ")}.`,
        deletion: {
          options,
          results: deletionResults,
        },
      };
    },

    createBinding(
      agentId: string,
      payload: AgentBindingInput,
    ): AgentBindingMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const binding = validateBindingInput(openclawConfig, payload);
      openclawConfig.bindings = Array.isArray(openclawConfig.bindings)
        ? openclawConfig.bindings
        : [];
      openclawConfig.bindings.push({
        ...binding,
        agentId: normalizedAgentId,
        ...(binding.comment ? { comment: binding.comment } : {}),
      });
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Binding added for '${normalizedAgentId}'`,
        detail: buildDetail(config, openclawConfig, rawAgent),
      };
    },

    updateBinding(
      agentId: string,
      bindingId: string,
      payload: AgentBindingInput,
    ): AgentBindingMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const bindingIndex = findBindingIndex(
        openclawConfig,
        normalizedAgentId,
        bindingId,
      );
      const binding = validateBindingInput(openclawConfig, payload);
      openclawConfig.bindings[bindingIndex] = {
        ...binding,
        agentId: normalizedAgentId,
        ...(binding.comment ? { comment: binding.comment } : {}),
      };
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Binding '${bindingId}' updated`,
        detail: buildDetail(config, openclawConfig, rawAgent),
      };
    },

    deleteBinding(
      agentId: string,
      bindingId: string,
    ): AgentBindingMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const bindingIndex = findBindingIndex(
        openclawConfig,
        normalizedAgentId,
        bindingId,
      );
      openclawConfig.bindings.splice(bindingIndex, 1);
      writeJsonFile(config.openclawConfigFile, openclawConfig);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Binding '${bindingId}' removed`,
        detail: buildDetail(config, openclawConfig, rawAgent),
      };
    },

    deleteSession(
      agentId: string,
      sessionId: string,
    ): AgentSessionMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const sessions = readAgentSessionsStore(config, normalizedAgentId);
      const entry = Object.entries(sessions).find(([key, value]) => {
        const record = value as Record<string, any>;
        return (
          key === sessionId ||
          normalizeOptionalString(record.sessionId) === sessionId
        );
      });

      if (!entry) {
        throw new AgentServiceError(
          404,
          "session_not_found",
          `Session '${sessionId}' not found`,
        );
      }

      const [entryKey, entryValue] = entry;
      const record = entryValue as Record<string, any>;
      const sessionFile = normalizeOptionalString(record.sessionFile);
      if (sessionFile) {
        try {
          fs.rmSync(sessionFile, { force: true });
        } catch {
          // ignore file cleanup failure
        }
      }
      delete sessions[entryKey];
      writeAgentSessionsStore(config, normalizedAgentId, sessions);

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `Session '${normalizeOptionalString(record.sessionId) || entryKey}' removed`,
        detail: buildDetail(config, openclawConfig, rawAgent),
      };
    },

    clearSessions(agentId: string): AgentSessionMutationResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const sessions = readAgentSessionsStore(config, normalizedAgentId);
      for (const entry of Object.values(sessions)) {
        const sessionFile = normalizeOptionalString(
          (entry as Record<string, any>).sessionFile,
        );
        if (!sessionFile) continue;
        try {
          fs.rmSync(sessionFile, { force: true });
        } catch {
          // ignore file cleanup failure
        }
      }
      writeAgentSessionsStore(config, normalizedAgentId, {});

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `All sessions for '${normalizedAgentId}' were cleared`,
        detail: buildDetail(config, openclawConfig, rawAgent),
      };
    },

    getDocument(agentId: string, docName: AgentDocName): AgentDocumentPayload {
      const normalizedAgentId = validateAgentId(agentId);
      const docMeta = getDocMeta(docName);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const workspace = resolveWorkspace(
        config,
        normalizedAgentId,
        rawAgent,
        openclawConfig.agents?.defaults || {},
      );
      const doc = buildDocuments(workspace).find(
        (entry) => entry.name === docMeta.name,
      );
      if (!doc) {
        throw new AgentServiceError(
          404,
          "doc_not_found",
          `Document '${docMeta.name}' not found`,
        );
      }

      return {
        checkedAt: new Date().toISOString(),
        agentId: normalizedAgentId,
        doc,
        content: readTextFile(doc.path),
      };
    },

    saveDocument(
      agentId: string,
      docName: AgentDocName,
      payload: AgentDocumentSavePayload,
    ): AgentDocumentSaveResponse {
      const normalizedAgentId = validateAgentId(agentId);
      const openclawConfig = readOpenClawConfig(config);
      const rawAgent = findRawAgent(openclawConfig, normalizedAgentId);
      if (!rawAgent) {
        throw new AgentServiceError(
          404,
          "agent_not_found",
          `Agent '${normalizedAgentId}' not found`,
        );
      }

      const workspace = resolveWorkspace(
        config,
        normalizedAgentId,
        rawAgent,
        openclawConfig.agents?.defaults || {},
      );
      ensureDir(workspace);
      const docMeta = getDocMeta(docName);
      const filePath = path.join(workspace, docMeta.name);
      fs.writeFileSync(
        filePath,
        typeof payload.content === "string" ? payload.content : "",
        "utf-8",
      );

      const doc = buildDocuments(workspace).find(
        (entry) => entry.name === docMeta.name,
      );
      if (!doc) {
        throw new AgentServiceError(
          500,
          "doc_refresh_failed",
          `Failed to refresh '${docMeta.name}'`,
        );
      }

      return {
        checkedAt: new Date().toISOString(),
        success: true,
        message: `${docMeta.name} saved`,
        doc,
      };
    },
  };
}

export function isAgentsServiceError(
  error: unknown,
): error is AgentServiceError {
  return error instanceof AgentServiceError;
}
