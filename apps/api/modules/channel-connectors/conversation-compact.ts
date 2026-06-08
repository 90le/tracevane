import {
  clearChannelConnectorAgentSessionsForConversation,
} from "./agent-session-store.js";
import type {
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import {
  compactChannelConnectorConversationHistory,
  getChannelConnectorConversationHistory,
} from "./conversation-history-store.js";

export const CHANNEL_CONNECTOR_COMPACT_HISTORY_LIMIT = 40;
const CHANNEL_CONNECTOR_COMPACT_PROMPT_MAX_RUNES = 24_000;
const CHANNEL_CONNECTOR_COMPACT_TIMEOUT_MS = 45_000;

export interface ChannelConnectorConversationCompactResult {
  ok: boolean;
  beforeEntries: number;
  afterEntries: number;
  sessionsCleared: number;
  summaryText: string | null;
  error: string | null;
}

export interface ChannelConnectorConversationCompactInput {
  historyPath: string;
  agentSessionsPath: string;
  gatewayEndpoint: string;
  gatewayClientKey: string | null;
  bindingId: string;
  sessionKey: string;
  project: ChannelConnectorRuntimeProject;
  now?: Date;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shortMessage(value: unknown, maxLength = 260): string {
  const raw = value instanceof Error ? value.message : String(value || "");
  const redacted = raw
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-***")
    .trim();
  if (!redacted) return "unknown error";
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 1)}...` : redacted;
}

export function channelConnectorCompactGatewayUrl(endpoint: string): string {
  return `${normalizeString(endpoint).replace(/\/+$/, "")}/responses/compact`;
}

function responseTextParts(value: unknown): string[] {
  if (typeof value === "string") {
    const normalized = normalizeString(value);
    return normalized ? [normalized] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => responseTextParts(item));
  }
  if (!isRecord(value)) return [];
  const direct = normalizeString(value.output_text)
    || normalizeString(value.text)
    || normalizeString(value.content);
  if (direct) return [direct];
  const parts: string[] = [];
  if ("message" in value) parts.push(...responseTextParts(value.message));
  if ("content" in value) parts.push(...responseTextParts(value.content));
  if ("output" in value) parts.push(...responseTextParts(value.output));
  if ("choices" in value) parts.push(...responseTextParts(value.choices));
  return parts;
}

export function channelConnectorGatewayCompactResponseText(raw: unknown): string | null {
  const text = responseTextParts(raw).join("\n").trim();
  return text || null;
}

export function channelConnectorCompactHistoryPrompt(input: {
  project: ChannelConnectorRuntimeProject;
  history: ReturnType<typeof getChannelConnectorConversationHistory>;
}): string {
  const lines = [
    "Summarize this Studio IM conversation for future CLI Agent context.",
    "Keep user goals, decisions, constraints, important files/directories, errors, tool results, and unresolved next steps.",
    "Do not invent facts. Keep it concise but operational.",
    "",
    `Agent: ${input.project.id} (${input.project.agent})`,
    `Model: ${input.project.model || "default"}`,
    `WorkDir: ${input.project.workDir}`,
    "",
    "Conversation:",
  ];
  input.history.forEach((entry, index) => {
    const role = entry.status === "compact-summary" ? "compact-summary" : entry.role;
    const status = entry.status ? ` status=${entry.status}` : "";
    const text = normalizeString(entry.text) || "(no text)";
    const attachments = entry.attachmentSummaries.length
      ? `\nattachments: ${entry.attachmentSummaries.join("; ")}`
      : "";
    lines.push(`${index + 1}. ${role}${status} @ ${entry.createdAt}\n${text}${attachments}`);
  });
  const prompt = lines.join("\n");
  const runes = Array.from(prompt);
  return runes.length > CHANNEL_CONNECTOR_COMPACT_PROMPT_MAX_RUNES
    ? runes.slice(runes.length - CHANNEL_CONNECTOR_COMPACT_PROMPT_MAX_RUNES).join("")
    : prompt;
}

export async function requestChannelConnectorGatewayCompactSummary(input: {
  endpoint: string;
  clientKey: string | null;
  project: ChannelConnectorRuntimeProject;
  prompt: string;
}): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CHANNEL_CONNECTOR_COMPACT_TIMEOUT_MS);
  try {
    const payload: Record<string, unknown> = {
      input: input.prompt,
      stream: false,
      max_output_tokens: 1000,
      metadata: {
        studio_channel_compact: true,
        agent: input.project.agent,
        project_id: input.project.id,
      },
    };
    if (input.project.model) payload.model = input.project.model;
    const response = await fetch(channelConnectorCompactGatewayUrl(input.endpoint), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(input.clientKey ? { authorization: `Bearer ${input.clientKey}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const rawText = await response.text();
    let body: unknown = rawText;
    try {
      body = rawText ? JSON.parse(rawText) as unknown : {};
    } catch {
      body = rawText;
    }
    if (!response.ok) {
      throw new Error(`Gateway compact failed with HTTP ${response.status}: ${shortMessage(rawText || response.statusText)}`);
    }
    const summary = channelConnectorGatewayCompactResponseText(body);
    if (!summary) throw new Error("Gateway compact response did not contain summary text.");
    return summary;
  } finally {
    clearTimeout(timer);
  }
}

export async function compactChannelConnectorConversation(
  input: ChannelConnectorConversationCompactInput,
): Promise<ChannelConnectorConversationCompactResult> {
  const lookup = {
    bindingId: input.bindingId,
    sessionKey: input.sessionKey,
  };
  const history = getChannelConnectorConversationHistory(
    input.historyPath,
    lookup,
    CHANNEL_CONNECTOR_COMPACT_HISTORY_LIMIT,
  );
  if (!history.length) {
    return {
      ok: false,
      beforeEntries: 0,
      afterEntries: 0,
      sessionsCleared: 0,
      summaryText: null,
      error: "当前 IM 会话没有可压缩的 history。",
    };
  }
  try {
    const summaryText = await requestChannelConnectorGatewayCompactSummary({
      endpoint: input.project.gatewayEndpoint || input.gatewayEndpoint,
      clientKey: input.gatewayClientKey,
      project: input.project,
      prompt: channelConnectorCompactHistoryPrompt({ project: input.project, history }),
    });
    const compacted = compactChannelConnectorConversationHistory(input.historyPath, {
      ...lookup,
      messageId: `compact:${(input.now || new Date()).getTime()}`,
      summaryText,
      now: input.now,
    });
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(input.agentSessionsPath, lookup);
    return {
      ok: true,
      beforeEntries: compacted.beforeEntries,
      afterEntries: compacted.afterEntries,
      sessionsCleared,
      summaryText,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      beforeEntries: history.length,
      afterEntries: history.length,
      sessionsCleared: 0,
      summaryText: null,
      error: `Studio compact 失败：${shortMessage(error)}`,
    };
  }
}
