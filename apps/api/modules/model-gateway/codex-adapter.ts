import type { ModelGatewayProviderReasoning } from "../../../../types/model-gateway.js";

type JsonRecord = Record<string, unknown>;

export class CodexResponsesChatAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "CodexResponsesChatAdapterError";
  }
}

export interface CodexResponsesChatRequestAdapterResult {
  chatRequest: JsonRecord;
  model: string | null;
  stream: boolean;
}

export interface CodexResponsesChatRequestAdapterOptions {
  allowStreaming?: boolean;
  reasoning?: ModelGatewayProviderReasoning | null;
}

export function isCodexResponsesToChatAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return (
    decision.routeId === "openai_responses"
    || decision.routeId === "openai_responses_compact"
  ) && decision.provider?.apiFormat === "openai_chat";
}

export function isCodexResponsesStreamingRequest(bodyText: string | undefined): boolean {
  try {
    return parseJsonObject(bodyText).stream === true;
  } catch {
    return false;
  }
}

export function adaptCodexResponsesRequestToChat(
  bodyText: string | undefined,
  options: CodexResponsesChatRequestAdapterOptions = {},
): CodexResponsesChatRequestAdapterResult {
  const request = parseJsonObject(bodyText);
  const stream = request.stream === true;
  if (stream && !options.allowStreaming) {
    throw new CodexResponsesChatAdapterError(
      "model_gateway_codex_responses_streaming_adapter_required",
      "Codex Responses streaming to OpenAI Chat streaming is not implemented yet.",
      501,
    );
  }

  const messages: JsonRecord[] = [];
  const instructions = contentToText(request.instructions);
  if (instructions) {
    messages.push({ role: "system", content: instructions });
  }
  appendResponsesInputMessages(request.input ?? request.messages, messages);
  if (!messages.length) {
    messages.push({ role: "user", content: "" });
  }
  const collapsedMessages = collapseSystemMessagesToHead(messages);

  const chatRequest: JsonRecord = {
    messages: collapsedMessages,
    stream,
  };

  const model = stringOrNull(request.model);
  if (model) chatRequest.model = model;

  copyScalarFields(request, chatRequest, [
    "frequency_penalty",
    "logit_bias",
    "metadata",
    "parallel_tool_calls",
    "presence_penalty",
    "response_format",
    "seed",
    "stop",
    "stream_options",
    "temperature",
    "top_p",
    "user",
  ]);

  if (request.max_output_tokens !== undefined) {
    chatRequest.max_tokens = request.max_output_tokens;
  } else if (request.max_tokens !== undefined) {
    chatRequest.max_tokens = request.max_tokens;
  }

  const tools = mapResponsesToolsToChat(request.tools);
  if (tools.length) chatRequest.tools = tools;

  const toolChoice = mapResponsesToolChoiceToChat(request.tool_choice);
  if (toolChoice !== undefined) chatRequest.tool_choice = toolChoice;

  applyReasoningOptions(chatRequest, request, options.reasoning || null);

  if (stream) ensureStreamUsageOption(chatRequest);

  return {
    chatRequest,
    model,
    stream,
  };
}

export function adaptChatCompletionToCodexResponse(chatCompletion: unknown, fallbackModel: string | null): JsonRecord {
  if (!isRecord(chatCompletion)) {
    throw new CodexResponsesChatAdapterError(
      "model_gateway_codex_chat_response_invalid",
      "OpenAI Chat upstream returned a non-object response.",
      502,
    );
  }

  const choice = firstChoice(chatCompletion);
  const message = isRecord(choice?.message) ? choice.message : {};
  const text = contentToText(message.content);
  const reasoningText = extractReasoningText(message);
  const generatedSuffix = Date.now().toString(36);
  const output: JsonRecord[] = [];
  if (reasoningText) {
    output.push({
      type: "reasoning",
      id: `reasoning_${generatedSuffix}`,
      status: "completed",
      summary: [{ type: "summary_text", text: reasoningText }],
    });
  }
  if (text || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    output.push({
      type: "message",
      id: `msg_${generatedSuffix}`,
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }

  for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const mapped = mapChatToolCallToResponses(toolCall, reasoningText);
    if (mapped) output.push(mapped);
  }

  return {
    id: stringOrNull(chatCompletion.id) || `resp_${generatedSuffix}`,
    object: "response",
    created_at: numberOrNull(chatCompletion.created) || Math.floor(Date.now() / 1_000),
    model: stringOrNull(chatCompletion.model) || fallbackModel,
    status: "completed",
    output,
    usage: mapChatUsageToResponses(chatCompletion.usage),
  };
}

function parseJsonObject(bodyText: string | undefined): JsonRecord {
  if (!bodyText || !bodyText.trim()) {
    throw new CodexResponsesChatAdapterError(
      "model_gateway_codex_responses_body_required",
      "Codex Responses adapter requires a JSON request body.",
      400,
    );
  }
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to the shared error below.
  }
  throw new CodexResponsesChatAdapterError(
    "model_gateway_codex_responses_body_invalid",
    "Codex Responses adapter requires a JSON object request body.",
    400,
  );
}

function appendResponsesInputMessages(input: unknown, messages: JsonRecord[]): void {
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
    return;
  }
  const items = Array.isArray(input)
    ? input
    : isRecord(input)
      ? [input]
      : [];
  if (!items.length) return;

  const pendingToolCalls: JsonRecord[] = [];
  let pendingReasoning: string | null = null;
  let lastAssistantIndex: number | null = null;
  for (const item of items) {
    if (isRecord(item) && item.type === "function_call") {
      pendingReasoning = appendReasoningText(pendingReasoning, extractResponsesReasoningText(item), true);
      const toolCall = mapResponsesFunctionCallToChatToolCall(item);
      if (toolCall) pendingToolCalls.push(toolCall);
      continue;
    }
    if (isRecord(item) && item.type === "reasoning") {
      const reasoning = extractResponsesReasoningText(item);
      if (pendingToolCalls.length) {
        pendingReasoning = appendReasoningText(pendingReasoning, reasoning);
      } else if (!attachReasoningToAssistant(messages, lastAssistantIndex, reasoning)) {
        pendingReasoning = appendReasoningText(pendingReasoning, reasoning);
      }
      continue;
    }
    flushPendingToolCalls(messages, pendingToolCalls, () => {
      const reasoning = pendingReasoning;
      pendingReasoning = null;
      return reasoning;
    });
    const message = mapResponsesInputItemToChatMessage(item);
    if (message) {
      if (message.role === "assistant") {
        pendingReasoning = appendReasoningText(pendingReasoning, isRecord(item) ? extractResponsesReasoningText(item) : null);
        attachReasoningToMessage(message, pendingReasoning);
        pendingReasoning = null;
        lastAssistantIndex = messages.length;
      } else if (message.role !== "tool") {
        pendingReasoning = null;
        lastAssistantIndex = null;
      }
      messages.push(message);
    }
  }
  flushPendingToolCalls(messages, pendingToolCalls, () => {
    const reasoning = pendingReasoning;
    pendingReasoning = null;
    return reasoning;
  });
  backfillToolCallReasoning(messages);
}

function mapResponsesInputItemToChatMessage(item: unknown): JsonRecord | null {
  if (typeof item === "string") return { role: "user", content: item };
  if (!isRecord(item)) return null;

  if (item.type === "function_call_output") {
    const output = canonicalizeJsonStringIfParseable(contentToText(item.output));
    return {
      role: "tool",
      content: output,
      tool_call_id: stringOrNull(item.call_id) || stringOrNull(item.id) || undefined,
    };
  }

  if (item.type === "message" || typeof item.role === "string" || item.content !== undefined) {
    const role = mapResponsesRoleToChat(item.role);
    const message: JsonRecord = {
      role,
      content: contentToText(item.content),
    };
    const toolCallId = stringOrNull(item.tool_call_id) || stringOrNull(item.call_id);
    if (role === "tool" && toolCallId) message.tool_call_id = toolCallId;
    return message;
  }

  const text = contentToText(item);
  return text ? { role: "user", content: text } : null;
}

function mapResponsesRoleToChat(role: unknown): string {
  if (role === "assistant" || role === "tool") return role;
  if (role === "system" || role === "developer") return "system";
  return "user";
}

function mapResponsesFunctionCallToChatToolCall(item: JsonRecord): JsonRecord | null {
  const callId = stringOrNull(item.call_id) || stringOrNull(item.id);
  const name = stringOrNull(item.name);
  if (!callId || !name) return null;
  return {
    id: callId,
    type: "function",
    function: {
      name,
      arguments: canonicalizeToolArguments(item.arguments),
    },
  };
}

function flushPendingToolCalls(
  messages: JsonRecord[],
  pendingToolCalls: JsonRecord[],
  takeReasoning: () => string | null,
): void {
  if (!pendingToolCalls.length) return;
  const message: JsonRecord = {
    role: "assistant",
    content: null,
    tool_calls: pendingToolCalls.splice(0),
  };
  attachReasoningToMessage(message, takeReasoning() || "tool call");
  messages.push(message);
}

function collapseSystemMessagesToHead(messages: JsonRecord[]): JsonRecord[] {
  const systemChunks: string[] = [];
  const rest: JsonRecord[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      const content = contentToText(message.content).trim();
      if (content) systemChunks.push(content);
      continue;
    }
    rest.push(message);
  }
  return systemChunks.length
    ? [{ role: "system", content: systemChunks.join("\n\n") }, ...rest]
    : rest;
}

function backfillToolCallReasoning(messages: JsonRecord[]): void {
  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) continue;
    if (!stringOrNull(message.reasoning_content)) {
      attachReasoningToMessage(message, "tool call");
    }
  }
}

function attachReasoningToAssistant(messages: JsonRecord[], index: number | null, reasoning: string | null): boolean {
  if (!reasoning) return true;
  if (index === null) return false;
  const message = messages[index];
  if (!message || message.role !== "assistant") return false;
  attachReasoningToMessage(message, reasoning);
  return true;
}

function attachReasoningToMessage(message: JsonRecord, reasoning: string | null): void {
  const text = reasoning?.trim();
  if (!text) return;
  const existing = stringOrNull(message.reasoning_content);
  if (!existing) {
    message.reasoning_content = text;
  } else if (!existing.includes(text)) {
    message.reasoning_content = `${existing}\n\n${text}`;
  }
}

function appendReasoningText(existing: string | null, next: string | null, unique = false): string | null {
  const text = next?.trim();
  if (!text) return existing;
  if (!existing) return text;
  if (unique && existing.includes(text)) return existing;
  return `${existing}\n\n${text}`;
}

function extractResponsesReasoningText(item: JsonRecord): string | null {
  for (const key of ["reasoning_content", "reasoning"] as const) {
    const direct = stringOrNull(item[key]);
    if (direct) return direct;
  }
  return extractReasoningSummaryText(item.summary)
    || extractReasoningSummaryText(item.reasoning_details)
    || null;
}

function extractReasoningSummaryText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const text = value
      .map(extractReasoningSummaryText)
      .filter((item): item is string => Boolean(item))
      .join("\n\n");
    return text || null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["text", "content", "summary"] as const) {
    const direct = stringOrNull(value[key]);
    if (direct) return direct;
  }
  return extractReasoningSummaryText(value.parts);
}

function canonicalizeToolArguments(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() ? canonicalizeJsonStringIfParseable(value) : "{}";
  }
  if (value === undefined || value === null) return "{}";
  return canonicalJsonString(value);
}

function canonicalizeJsonStringIfParseable(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  try {
    return canonicalJsonString(JSON.parse(trimmed) as unknown);
  } catch {
    return value;
  }
}

function canonicalJsonString(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonString).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJsonString(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? {});
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content.map(contentPartToText).filter(Boolean).join("");
  }
  return contentPartToText(content);
}

function contentPartToText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!isRecord(part)) return "";
  const text = stringOrNull(part.text) || stringOrNull(part.output_text) || stringOrNull(part.input_text);
  if (text) return text;
  if (Array.isArray(part.content)) return contentToText(part.content);
  return "";
}

function mapResponsesToolsToChat(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    const mapped = mapResponsesToolToChat(tool);
    return mapped ? [mapped] : [];
  });
}

function mapResponsesToolToChat(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (tool.type !== "function") return null;
  const source = isRecord(tool.function) ? tool.function : tool;
  const name = stringOrNull(source.name);
  if (!name) return null;

  const fn: JsonRecord = { name };
  if (typeof source.description === "string") fn.description = source.description;
  if (source.parameters !== undefined) fn.parameters = source.parameters;
  if (typeof source.strict === "boolean") fn.strict = source.strict;
  return {
    type: "function",
    function: fn,
  };
}

function mapResponsesToolChoiceToChat(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "function") {
    const name = stringOrNull(toolChoice.name) || (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null);
    return name ? { type: "function", function: { name } } : toolChoice;
  }
  return toolChoice;
}

function applyReasoningOptions(
  chatRequest: JsonRecord,
  request: JsonRecord,
  config: ModelGatewayProviderReasoning | null,
): void {
  if (!config) return;
  const reasoningEnabled = reasoningRequested(request);
  if (reasoningEnabled === null) return;

  const supportsEffort = config.supportsEffort === true;
  const supportsThinking = config.supportsThinking === true || supportsEffort;
  if (supportsThinking) {
    const thinkingParam = config.thinkingParam || "thinking";
    if (thinkingParam === "thinking") {
      chatRequest.thinking = { type: reasoningEnabled ? "enabled" : "disabled" };
    } else if (thinkingParam === "enable_thinking") {
      chatRequest.enable_thinking = reasoningEnabled;
    } else if (thinkingParam === "reasoning_split") {
      chatRequest.reasoning_split = reasoningEnabled;
    }
  }

  const effortParam = config.effortParam || "reasoning_effort";
  if (!reasoningEnabled) {
    if (effortParam === "reasoning.effort") {
      chatRequest.reasoning = { effort: "none" };
    }
    return;
  }

  if (!supportsEffort) return;
  const effort = reasoningEffort(request);
  if (!effort) return;
  const mapped = mapReasoningEffort(effort, config.effortValueMode || "passthrough");
  if (!mapped) return;

  if (effortParam === "reasoning_effort") {
    chatRequest.reasoning_effort = mapped;
  } else if (effortParam === "reasoning.effort") {
    chatRequest.reasoning = { effort: mapped };
  }
}

function reasoningRequested(request: JsonRecord): boolean | null {
  const effort = reasoningEffort(request);
  if (effort) {
    return !["none", "off", "disabled"].includes(effort.trim().toLowerCase());
  }
  if (Object.prototype.hasOwnProperty.call(request, "reasoning")) {
    return request.reasoning !== null && request.reasoning !== undefined;
  }
  return null;
}

function reasoningEffort(request: JsonRecord): string | null {
  const reasoning = isRecord(request.reasoning) ? request.reasoning : null;
  return reasoning ? stringOrNull(reasoning.effort) : null;
}

function mapReasoningEffort(effort: string, mode: string): string | null {
  const normalized = effort.trim().toLowerCase();
  if (["none", "off", "disabled"].includes(normalized)) return null;

  if (mode === "deepseek") {
    return normalized === "max" || normalized === "xhigh" ? "max" : "high";
  }
  if (mode === "low_high") {
    return normalized === "minimal" || normalized === "low" ? "low" : "high";
  }
  if (mode === "openrouter") {
    if (normalized === "max" || normalized === "xhigh") return "xhigh";
    return ["high", "medium", "low", "minimal"].includes(normalized) ? normalized : null;
  }
  return ["minimal", "low", "medium", "high", "xhigh", "max"].includes(normalized)
    ? normalized
    : null;
}

function mapChatToolCallToResponses(toolCall: unknown, reasoningText: string | null): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;
  const id = stringOrNull(toolCall.id) || `call_${Date.now().toString(36)}`;
  const item: JsonRecord = {
    type: "function_call",
    id,
    call_id: id,
    status: "completed",
    name,
    arguments: stringOrNull(fn.arguments) || "{}",
  };
  if (reasoningText) item.reasoning_content = reasoningText;
  return item;
}

function mapChatUsageToResponses(usage: unknown): JsonRecord | null {
  if (!isRecord(usage)) return null;
  const inputTokens = numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens);
  const outputTokens = numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens);
  const totalTokens = numberOrNull(usage.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  if (inputTokens === null && outputTokens === null && totalTokens === null) return null;
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};

  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    input_tokens_details: isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : { cached_tokens: numberOrNull(promptDetails.cached_tokens) || 0 },
    output_tokens_details: isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : { reasoning_tokens: numberOrNull(completionDetails.reasoning_tokens) || 0 },
  };
}

function extractReasoningText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["reasoning_content", "reasoning"] as const) {
    const direct = stringOrNull(value[key]);
    if (direct) return direct;
  }

  const reasoning = isRecord(value.reasoning) ? value.reasoning : null;
  if (reasoning) {
    for (const key of ["content", "text", "summary"] as const) {
      const text = stringOrNull(reasoning[key]);
      if (text) return text;
    }
  }

  const detailsText = extractReasoningDetailsText(value.reasoning_details);
  return detailsText || null;
}

function extractReasoningDetailsText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const text = value
      .map(extractReasoningDetailsText)
      .filter((item): item is string => Boolean(item))
      .join("\n\n");
    return text || null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["text", "content", "summary"] as const) {
    const text = stringOrNull(value[key]);
    if (text) return text;
  }
  return extractReasoningDetailsText(value.parts);
}

function firstChoice(chatCompletion: JsonRecord): JsonRecord | null {
  if (!Array.isArray(chatCompletion.choices)) return null;
  const [choice] = chatCompletion.choices;
  return isRecord(choice) ? choice : null;
}

function copyScalarFields(source: JsonRecord, target: JsonRecord, fields: string[]): void {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = source[field];
  }
}

function ensureStreamUsageOption(chatRequest: JsonRecord): void {
  const streamOptions = isRecord(chatRequest.stream_options) ? chatRequest.stream_options : {};
  chatRequest.stream_options = {
    ...streamOptions,
    include_usage: true,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
