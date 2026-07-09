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
  sanitizeAnthropicMessagesMalformedToolHistory(sanitized, removedFields);

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
  sanitizeOpenAIChatMalformedToolHistory(sanitized, removedFields);

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

function sanitizeAnthropicMessagesMalformedToolHistory(
  request: JsonRecord,
  removedFields: string[],
): void {
  if (!Array.isArray(request.messages)) return;
  let changed = false;
  const messages = request.messages.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) return message;
    const role = typeof message.role === "string" ? message.role : "";
    let contentChanged = false;
    const content = message.content.map((part) => {
      if (!isRecord(part)) return part;
      const type = typeof part.type === "string" ? part.type : "";
      if (type === "tool_use") {
        if (role === "assistant" && nonEmptyString(part.id) && nonEmptyString(part.name)) return part;
        contentChanged = true;
        return textBlock(`Anthropic Messages malformed tool_use for Anthropic Messages: ${stringifyCompact(part)}`);
      }
      if (type === "tool_result") {
        if (role === "user" && nonEmptyString(part.tool_use_id)) return part;
        contentChanged = true;
        return textBlock(`Anthropic Messages malformed tool_result for Anthropic Messages: ${stringifyCompact(part)}`);
      }
      if (type === "mcp_tool_use") {
        if (role === "assistant" && nonEmptyString(part.id) && nonEmptyString(part.name)) return part;
        contentChanged = true;
        return textBlock(`Anthropic Messages malformed mcp_tool_use for Anthropic Messages: ${stringifyCompact(part)}`);
      }
      if (type === "mcp_tool_result") {
        if (role === "user" && nonEmptyString(part.tool_use_id)) return part;
        contentChanged = true;
        return textBlock(`Anthropic Messages malformed mcp_tool_result for Anthropic Messages: ${stringifyCompact(part)}`);
      }
      return part;
    });
    if (!contentChanged) return message;
    changed = true;
    return { ...message, content };
  });
  if (!changed) return;
  request.messages = messages;
  pushOnce(removedFields, "messages.malformed_tool_history");
}

function sanitizeOpenAIChatMalformedToolHistory(
  request: JsonRecord,
  removedFields: string[],
): void {
  if (!Array.isArray(request.messages)) return;
  let changed = false;
  const messages = request.messages.map((message) => {
    if (!isRecord(message)) return message;
    const role = typeof message.role === "string" ? message.role : "";
    if (role === "tool" && !nonEmptyString(message.tool_call_id)) {
      changed = true;
      return {
        role: "user",
        content: `OpenAI Chat tool message missing tool_call_id for Chat Completions: ${stringifyCompact(message)}`,
      };
    }
    if (role === "function" && !nonEmptyString(message.name)) {
      changed = true;
      return {
        role: "user",
        content: `OpenAI Chat function message missing name for Chat Completions: ${stringifyCompact(message)}`,
      };
    }
    if (role !== "assistant") return message;

    const nextMessage: JsonRecord = { ...message };
    const notes: string[] = [];
    if (isRecord(nextMessage.function_call) && !isValidChatFunctionCall(nextMessage.function_call)) {
      notes.push(`OpenAI Chat malformed function_call for Chat Completions: ${stringifyCompact(nextMessage.function_call)}`);
      delete nextMessage.function_call;
    }
    if (Array.isArray(nextMessage.tool_calls)) {
      const validToolCalls = nextMessage.tool_calls.filter((toolCall) => {
        if (isValidChatToolCall(toolCall)) return true;
        notes.push(`OpenAI Chat malformed tool_call for Chat Completions: ${stringifyCompact(toolCall)}`);
        return false;
      });
      if (validToolCalls.length) {
        nextMessage.tool_calls = validToolCalls;
      } else {
        delete nextMessage.tool_calls;
      }
    }
    if (!notes.length) return message;
    nextMessage.content = appendChatContentNotes(nextMessage.content, notes);
    changed = true;
    return nextMessage;
  });
  if (!changed) return;
  request.messages = messages;
  pushOnce(removedFields, "messages.malformed_tool_history");
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

function appendChatContentNotes(content: unknown, notes: string[]): unknown {
  if (!notes.length) return content;
  if (typeof content === "string" && content) return [content, ...notes].join("\n");
  if (typeof content === "string") return notes.join("\n");
  if (Array.isArray(content)) return [
    ...content,
    ...notes.map((text) => ({ type: "text", text })),
  ];
  if (content === null || content === undefined) return notes.join("\n");
  return [stringifyCompact(content), ...notes].join("\n");
}

function isValidChatFunctionCall(value: unknown): boolean {
  return isRecord(value) && nonEmptyString(value.name);
}

function isValidChatToolCall(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!nonEmptyString(value.id)) return false;
  if (value.type !== undefined && value.type !== "function") return false;
  if (!isRecord(value.function)) return false;
  return nonEmptyString(value.function.name) && typeof value.function.arguments === "string";
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushOnce(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function stringifyCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function textBlock(text: string): JsonRecord {
  return { type: "text", text };
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
