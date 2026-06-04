type JsonRecord = Record<string, unknown>;

const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicMessagesChatAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "AnthropicMessagesChatAdapterError";
  }
}

export interface ChatAnthropicRequestAdapterResult {
  anthropicRequest: JsonRecord;
  model: string | null;
}

export function isChatToAnthropicMessagesAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return decision.routeId === "openai_chat_completions"
    && decision.provider?.apiFormat === "anthropic_messages";
}

export function isResponsesToAnthropicMessagesAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return (
    decision.routeId === "openai_responses"
    || decision.routeId === "openai_responses_compact"
  ) && decision.provider?.apiFormat === "anthropic_messages";
}

export function ensureAnthropicMessagesHeaders(headers: Headers): void {
  if (!headers.has("anthropic-version")) {
    headers.set("anthropic-version", DEFAULT_ANTHROPIC_VERSION);
  }
}

export function adaptChatCompletionRequestToAnthropicMessages(bodyText: string | undefined): ChatAnthropicRequestAdapterResult {
  const request = parseJsonObject(bodyText);
  if (request.stream === true) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_chat_anthropic_streaming_adapter_required",
      "OpenAI Chat streaming to Anthropic Messages streaming is not implemented yet.",
      501,
    );
  }

  const model = stringOrNull(request.model);
  if (!model) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_chat_anthropic_model_required",
      "OpenAI Chat to Anthropic Messages adapter requires a model.",
      400,
    );
  }

  const anthropicRequest: JsonRecord = {
    model,
    max_tokens: numberOrNull(request.max_tokens)
      ?? numberOrNull(request.max_completion_tokens)
      ?? 1024,
    messages: mapChatMessagesToAnthropic(request.messages),
  };

  const system = extractSystemPrompt(request.messages);
  if (system) anthropicRequest.system = system;

  copyScalarFields(request, anthropicRequest, [
    "temperature",
    "top_p",
    "metadata",
  ]);

  if (request.stop !== undefined) anthropicRequest.stop_sequences = request.stop;

  const tools = mapChatToolsToAnthropic(request.tools);
  if (tools.length) anthropicRequest.tools = tools;

  const toolChoice = mapChatToolChoiceToAnthropic(request.tool_choice);
  if (toolChoice !== undefined) anthropicRequest.tool_choice = toolChoice;

  return { anthropicRequest, model };
}

export function adaptAnthropicMessagesResponseToChatCompletion(response: unknown, fallbackModel: string | null): JsonRecord {
  if (!isRecord(response)) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_anthropic_chat_response_invalid",
      "Anthropic Messages upstream returned a non-object response.",
      502,
    );
  }

  const content = Array.isArray(response.content) ? response.content : [];
  const text = content
    .map((part) => isRecord(part) && part.type === "text" ? stringOrNull(part.text) : null)
    .filter((part): part is string => Boolean(part))
    .join("");
  const toolCalls = content
    .map(mapAnthropicToolUseToChatToolCall)
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  const message: JsonRecord = {
    role: "assistant",
    content: text || (toolCalls.length ? null : ""),
  };
  if (toolCalls.length) message.tool_calls = toolCalls;

  const created = Math.floor(Date.now() / 1_000);
  const model = stringOrNull(response.model) || fallbackModel;
  return {
    id: stringOrNull(response.id) || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created,
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: mapAnthropicStopReasonToChat(response.stop_reason, toolCalls.length > 0),
    }],
    usage: mapAnthropicUsageToChat(response.usage),
  };
}

function parseJsonObject(bodyText: string | undefined): JsonRecord {
  if (!bodyText || !bodyText.trim()) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_chat_anthropic_body_required",
      "OpenAI Chat to Anthropic Messages adapter requires a JSON request body.",
      400,
    );
  }
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to the shared error below.
  }
  throw new AnthropicMessagesChatAdapterError(
    "model_gateway_chat_anthropic_body_invalid",
    "OpenAI Chat to Anthropic Messages adapter requires a JSON object request body.",
    400,
  );
}

function extractSystemPrompt(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .filter((message): message is JsonRecord => isRecord(message))
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => chatContentToText(message.content))
    .filter(Boolean)
    .join("\n\n");
}

function mapChatMessagesToAnthropic(messages: unknown): JsonRecord[] {
  if (!Array.isArray(messages)) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_chat_anthropic_messages_required",
      "OpenAI Chat to Anthropic Messages adapter requires a messages array.",
      400,
    );
  }

  const mapped = messages.flatMap((message) => mapChatMessageToAnthropic(message));
  return mapped.length ? mapped : [{ role: "user", content: "" }];
}

function mapChatMessageToAnthropic(message: unknown): JsonRecord[] {
  if (!isRecord(message)) return [];
  if (message.role === "system" || message.role === "developer") return [];

  if (message.role === "tool") {
    return [{
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: stringOrNull(message.tool_call_id) || stringOrNull(message.id) || "",
        content: chatContentToText(message.content),
      }],
    }];
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  const content = chatMessageContentToAnthropicBlocks(message);
  return [{ role, content: content.length === 1 && content[0]?.type === "text" ? content[0].text : content }];
}

function chatMessageContentToAnthropicBlocks(message: JsonRecord): JsonRecord[] {
  const blocks = chatContentToAnthropicBlocks(message.content);
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const mapped = mapChatToolCallToAnthropicToolUse(toolCall);
      if (mapped) blocks.push(mapped);
    }
  }
  return blocks.length ? blocks : [{ type: "text", text: "" }];
}

function chatContentToAnthropicBlocks(content: unknown): JsonRecord[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (content === null || content === undefined) return [];
  if (!Array.isArray(content)) {
    const text = chatContentToText(content);
    return text ? [{ type: "text", text }] : [];
  }

  const blocks: JsonRecord[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      if (part) blocks.push({ type: "text", text: part });
      continue;
    }
    if (!isRecord(part)) continue;
    const type = stringOrNull(part.type);
    if (type === "text" || type === "input_text") {
      const text = stringOrNull(part.text);
      if (text) blocks.push({ type: "text", text });
      continue;
    }
    if (type === "image_url" && isRecord(part.image_url)) {
      const imageUrl = stringOrNull(part.image_url.url);
      const image = imageUrlToAnthropicBlock(imageUrl);
      if (image) blocks.push(image);
    }
  }
  return blocks;
}

function imageUrlToAnthropicBlock(url: string | null): JsonRecord | null {
  if (!url?.startsWith("data:")) return null;
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(url);
  if (!match) return null;
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: match[1],
      data: match[2],
    },
  };
}

function mapChatToolsToAnthropic(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    const mapped = mapChatToolToAnthropic(tool);
    return mapped ? [mapped] : [];
  });
}

function mapChatToolToAnthropic(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (tool.type !== "function") return null;
  const fn = isRecord(tool.function) ? tool.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;

  const mapped: JsonRecord = {
    name,
    input_schema: isRecord(fn.parameters) ? fn.parameters : {},
  };
  if (typeof fn.description === "string") mapped.description = fn.description;
  return mapped;
}

function mapChatToolChoiceToAnthropic(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return { type: toolChoice };
  if (toolChoice === "required") return { type: "any" };
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "function") {
    const name = isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null;
    return name ? { type: "tool", name } : toolChoice;
  }
  return toolChoice;
}

function mapChatToolCallToAnthropicToolUse(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;
  const id = stringOrNull(toolCall.id) || `call_${Date.now().toString(36)}`;
  return {
    type: "tool_use",
    id,
    name,
    input: parseToolArguments(fn.arguments),
  };
}

function mapAnthropicToolUseToChatToolCall(part: unknown): JsonRecord | null {
  if (!isRecord(part) || part.type !== "tool_use") return null;
  const name = stringOrNull(part.name);
  if (!name) return null;
  return {
    id: stringOrNull(part.id) || `call_${Date.now().toString(36)}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(part.input ?? {}),
    },
  };
}

function mapAnthropicStopReasonToChat(stopReason: unknown, hasToolCalls: boolean): string {
  if (stopReason === "tool_use" || hasToolCalls) return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
  return "stop";
}

function mapAnthropicUsageToChat(usage: unknown): JsonRecord | null {
  if (!isRecord(usage)) return null;
  const promptTokens = numberOrNull(usage.input_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? 0;
  const cachedTokens = numberOrNull(usage.cache_read_input_tokens)
    ?? numberOrNull(usage.cache_creation_input_tokens)
    ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: cachedTokens,
    },
  };
}

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return isRecord(value) ? value : {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function chatContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content.map(chatContentPartToText).filter(Boolean).join("");
  }
  return chatContentPartToText(content);
}

function chatContentPartToText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!isRecord(part)) return "";
  return stringOrNull(part.text)
    || stringOrNull(part.input_text)
    || stringOrNull(part.output_text)
    || stringOrNull(part.refusal)
    || "";
}

function copyScalarFields(source: JsonRecord, target: JsonRecord, fields: string[]): void {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = source[field];
  }
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
