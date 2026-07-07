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
}

export interface OpenAIResponsesCompatibilityResult {
  bodyText: string | undefined;
  removedFields: string[];
}

const STRICT_CHAT_INCOMPATIBLE_FIELDS = ["metadata"] as const;
const STRICT_RESPONSES_INCOMPATIBLE_FIELDS = ["metadata"] as const;
const TOOL_REASONING_INCOMPATIBLE_FIELDS = ["reasoning_effort", "reasoningEffort"] as const;

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
