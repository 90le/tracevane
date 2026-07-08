import type { ModelGatewayProviderReasoning } from "../../../../types/model-gateway.js";
import { applyChatReasoningOptions } from "./reasoning-options.js";

type JsonRecord = Record<string, unknown>;

export interface OpenAIChatCompatibilityOptions {
  allowMetadata?: boolean;
  reasoning?: ModelGatewayProviderReasoning | null;
}

export interface OpenAIChatCompatibilityResult {
  bodyText: string | undefined;
  removedFields: string[];
}

export interface OpenAIResponsesCompatibilityOptions {
  allowMetadata?: boolean;
  preserveMetadataAsInputContext?: boolean;
}

export interface OpenAIResponsesCompatibilityResult {
  bodyText: string | undefined;
  removedFields: string[];
}

export interface AnthropicMessagesCompatibilityOptions {
  allowMetadata?: boolean;
}

export interface AnthropicMessagesCompatibilityResult {
  bodyText: string | undefined;
  removedFields: string[];
}

const STRICT_CHAT_INCOMPATIBLE_FIELDS = ["metadata"] as const;
const STRICT_RESPONSES_INCOMPATIBLE_FIELDS = ["metadata"] as const;
const STRICT_ANTHROPIC_MESSAGES_INCOMPATIBLE_FIELDS = ["metadata"] as const;
const TOOL_REASONING_INCOMPATIBLE_FIELDS = ["reasoning_effort", "reasoningEffort"] as const;

export function sanitizeAnthropicMessagesUpstreamBody(
  bodyText: string | undefined,
  options: AnthropicMessagesCompatibilityOptions = {},
): AnthropicMessagesCompatibilityResult {
  if (!bodyText) return { bodyText, removedFields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { bodyText, removedFields: [] };
  }
  if (!isRecord(parsed)) return { bodyText, removedFields: [] };

  const sanitized: JsonRecord = { ...parsed };
  const removedFields: string[] = [];
  for (const field of STRICT_ANTHROPIC_MESSAGES_INCOMPATIBLE_FIELDS) {
    if (field === "metadata" && options.allowMetadata) continue;
    if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
      delete sanitized[field];
      removedFields.push(field);
    }
  }

  const nextBodyText = JSON.stringify(sanitized);
  return {
    bodyText: nextBodyText !== bodyText ? nextBodyText : bodyText,
    removedFields,
  };
}

export function sanitizeOpenAIResponsesUpstreamBody(
  bodyText: string | undefined,
  options: OpenAIResponsesCompatibilityOptions = {},
): OpenAIResponsesCompatibilityResult {
  if (!bodyText) return { bodyText, removedFields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { bodyText, removedFields: [] };
  }
  if (!isRecord(parsed)) return { bodyText, removedFields: [] };

  const sanitized: JsonRecord = { ...parsed };
  const removedFields: string[] = [];
  for (const field of STRICT_RESPONSES_INCOMPATIBLE_FIELDS) {
    if (field === "metadata" && options.allowMetadata) continue;
    if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
      if (field === "metadata" && options.preserveMetadataAsInputContext) {
        appendResponsesMetadataContext(sanitized, sanitized[field]);
      }
      delete sanitized[field];
      removedFields.push(field);
    }
  }

  const nextBodyText = JSON.stringify(sanitized);
  return {
    bodyText: nextBodyText !== bodyText ? nextBodyText : bodyText,
    removedFields,
  };
}

export function sanitizeOpenAIChatUpstreamBody(
  bodyText: string | undefined,
  options: OpenAIChatCompatibilityOptions = {},
): OpenAIChatCompatibilityResult {
  if (!bodyText) return { bodyText, removedFields: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { bodyText, removedFields: [] };
  }
  if (!isRecord(parsed)) return { bodyText, removedFields: [] };

  const sanitized: JsonRecord = { ...parsed };
  normalizeModernChatTokenLimit(sanitized);
  applyChatReasoningOptions(sanitized, sanitized, options.reasoning || null);
  const removedFields: string[] = [];
  for (const field of STRICT_CHAT_INCOMPATIBLE_FIELDS) {
    if (field === "metadata" && options.allowMetadata) continue;
    if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
      delete sanitized[field];
      removedFields.push(field);
    }
  }
  if (hasFunctionTools(sanitized.tools)) {
    const keepReasoningWithTools = shouldKeepToolReasoningFields(sanitized, options.reasoning || null);
    if (!keepReasoningWithTools) {
      for (const field of TOOL_REASONING_INCOMPATIBLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(sanitized, field)) {
          delete sanitized[field];
          removedFields.push(field);
        }
      }
    }
  }

  const nextBodyText = JSON.stringify(sanitized);
  return {
    bodyText: nextBodyText !== bodyText ? nextBodyText : bodyText,
    removedFields,
  };
}


function appendResponsesMetadataContext(request: JsonRecord, metadata: unknown): void {
  const safe = safeMetadataRecord(metadata);
  if (!safe) return;
  const text = `[OpenAI Responses metadata omitted for upstream compatibility: ${JSON.stringify(safe)}]`;
  const contextItem = {
    type: "message",
    role: "developer",
    content: [{ type: "input_text", text }],
  };
  if (Array.isArray(request.input)) {
    request.input = [...request.input, contextItem];
    return;
  }
  if (typeof request.input === "string") {
    request.input = [
      { role: "user", content: [{ type: "input_text", text: request.input }] },
      contextItem,
    ];
    return;
  }
  request.input = [contextItem];
}

function safeMetadataRecord(metadata: unknown): JsonRecord | null {
  if (!isRecord(metadata)) return null;
  const safe: JsonRecord = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/api[_-]?key|authorization|bearer|cookie|credential|password|secret|token/i.test(key)) continue;
    if (value === undefined) continue;
    safe[key] = value;
  }
  return Object.keys(safe).length ? safe : null;
}

function normalizeModernChatTokenLimit(request: JsonRecord): void {
  if (request.max_tokens === undefined) return;
  if (!usesModernChatCompletionTokenLimit(request.model)) return;
  if (request.max_completion_tokens === undefined) request.max_completion_tokens = request.max_tokens;
  delete request.max_tokens;
}

function usesModernChatCompletionTokenLimit(model: unknown): boolean {
  const name = typeof model === "string" ? model.trim() : "";
  return /^gpt-5(?:\.|-|$|_)/i.test(name) || /^o[1-9](?:\.|-|$|_)/i.test(name);
}

function hasFunctionTools(value: unknown): boolean {
  return Array.isArray(value) && value.some((tool) =>
    isRecord(tool) && (tool.type === "function" || isRecord(tool.function))
  );
}

function shouldKeepToolReasoningFields(
  request: JsonRecord,
  config: ModelGatewayProviderReasoning | null,
): boolean {
  if (config?.supportsEffort === true) return true;
  const model = typeof request.model === "string" ? request.model.trim() : "";
  return /^glm[-_]?5(?:\.|$|[-_:/\s\[])/i.test(model);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
