type JsonRecord = Record<string, unknown>;

export class OpenAIResponsesChatAdapterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
    this.name = "OpenAIResponsesChatAdapterError";
  }
}

export interface ChatResponsesRequestAdapterResult {
  responsesRequest: JsonRecord;
  model: string | null;
  stream: boolean;
}

export interface ChatResponsesRequestAdapterOptions {
  allowStreaming?: boolean;
}

export function isChatToOpenAIResponsesAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return decision.routeId === "openai_chat_completions"
    && decision.provider?.apiFormat === "openai_responses";
}

export function adaptChatCompletionRequestToResponses(
  bodyText: string | undefined,
  options: ChatResponsesRequestAdapterOptions = {},
): ChatResponsesRequestAdapterResult {
  const request = parseJsonObject(bodyText);
  const stream = request.stream === true;
  if (stream && !options.allowStreaming) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_chat_responses_streaming_adapter_required",
      "OpenAI Chat streaming to OpenAI Responses streaming is not implemented yet.",
      501,
    );
  }

  const model = stringOrNull(request.model);
  if (!model) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_chat_responses_model_required",
      "OpenAI Chat to Responses adapter requires a model.",
      400,
    );
  }

  const responsesRequest: JsonRecord = {
    model,
    input: mapChatMessagesToResponsesInput(request.messages),
    stream,
  };

  const instructions = extractInstructions(request.messages);
  if (instructions) responsesRequest.instructions = instructions;

  copyScalarFields(request, responsesRequest, [
    "frequency_penalty",
    "metadata",
    "parallel_tool_calls",
    "presence_penalty",
    "response_format",
    "seed",
    "temperature",
    "top_p",
    "user",
  ]);

  if (request.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_tokens;
  } else if (request.max_completion_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_completion_tokens;
  }
  if (request.stop !== undefined) responsesRequest.stop = request.stop;

  const tools = mapChatToolsToResponses(request.tools);
  if (tools.length) responsesRequest.tools = tools;

  const toolChoice = mapChatToolChoiceToResponses(request.tool_choice);
  if (toolChoice !== undefined) responsesRequest.tool_choice = toolChoice;

  return { responsesRequest, model, stream };
}

export function adaptResponsesToChatCompletion(response: unknown, fallbackModel: string | null): JsonRecord {
  if (!isRecord(response)) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_responses_chat_response_invalid",
      "OpenAI Responses upstream returned a non-object response.",
      502,
    );
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const text = collectResponseOutputText(response, output);
  const toolCalls = output
    .map(mapResponsesFunctionCallToChatToolCall)
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  const message: JsonRecord = {
    role: "assistant",
    content: text || (toolCalls.length ? null : ""),
  };
  if (toolCalls.length) message.tool_calls = toolCalls;

  return {
    id: stringOrNull(response.id) || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created: numberOrNull(response.created_at) || Math.floor(Date.now() / 1_000),
    model: stringOrNull(response.model) || fallbackModel,
    choices: [{
      index: 0,
      message,
      finish_reason: toolCalls.length ? "tool_calls" : "stop",
    }],
    usage: mapResponsesUsageToChat(response.usage),
  };
}

function parseJsonObject(bodyText: string | undefined): JsonRecord {
  if (!bodyText || !bodyText.trim()) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_chat_responses_body_required",
      "OpenAI Chat to Responses adapter requires a JSON request body.",
      400,
    );
  }
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (isRecord(parsed)) return parsed;
  } catch {
    // Fall through to the shared error below.
  }
  throw new OpenAIResponsesChatAdapterError(
    "model_gateway_chat_responses_body_invalid",
    "OpenAI Chat to Responses adapter requires a JSON object request body.",
    400,
  );
}

function extractInstructions(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  return messages
    .filter((message): message is JsonRecord => isRecord(message))
    .filter((message) => message.role === "system" || message.role === "developer")
    .map((message) => chatContentToText(message.content))
    .filter(Boolean)
    .join("\n\n");
}

function mapChatMessagesToResponsesInput(messages: unknown): unknown[] {
  if (!Array.isArray(messages)) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_chat_responses_messages_required",
      "OpenAI Chat to Responses adapter requires a messages array.",
      400,
    );
  }

  const input = messages.flatMap((message) => mapChatMessageToResponsesInput(message));
  return input.length ? input : [{ role: "user", content: "" }];
}

function mapChatMessageToResponsesInput(message: unknown): JsonRecord[] {
  if (!isRecord(message)) return [];
  if (message.role === "system" || message.role === "developer") return [];

  if (message.role === "tool") {
    return [{
      type: "function_call_output",
      call_id: stringOrNull(message.tool_call_id) || stringOrNull(message.id) || "",
      output: chatContentToText(message.content),
    }];
  }

  const items: JsonRecord[] = [];
  const role = message.role === "assistant" ? "assistant" : "user";
  const content = chatContentToResponsesContent(message.content, role);
  if (content.length || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    items.push({
      role,
      content,
    });
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const mapped = mapChatToolCallToResponsesFunctionCall(toolCall);
      if (mapped) items.push(mapped);
    }
  }
  return items;
}

function chatContentToResponsesContent(content: unknown, role: string): JsonRecord[] {
  const textType = role === "assistant" ? "output_text" : "input_text";
  if (typeof content === "string") return [{ type: textType, text: content }];
  if (content === null || content === undefined) return [];
  if (!Array.isArray(content)) {
    const text = chatContentToText(content);
    return text ? [{ type: textType, text }] : [];
  }

  const parts: JsonRecord[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push({ type: textType, text: part });
      continue;
    }
    if (!isRecord(part)) continue;
    const type = stringOrNull(part.type);
    if (type === "image_url" && role !== "assistant" && isRecord(part.image_url)) {
      const imageUrl = stringOrNull(part.image_url.url);
      if (imageUrl) parts.push({ type: "input_image", image_url: imageUrl });
      continue;
    }
    const text = stringOrNull(part.text)
      || stringOrNull(part.input_text)
      || stringOrNull(part.output_text)
      || stringOrNull(part.refusal);
    if (text) parts.push({ type: textType, text });
  }
  return parts;
}

function mapChatToolsToResponses(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    const mapped = mapChatToolToResponses(tool);
    return mapped ? [mapped] : [];
  });
}

function mapChatToolToResponses(tool: unknown): JsonRecord | null {
  if (!isRecord(tool) || tool.type !== "function") return null;
  const fn = isRecord(tool.function) ? tool.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;

  const mapped: JsonRecord = { type: "function", name };
  if (typeof fn.description === "string") mapped.description = fn.description;
  if (fn.parameters !== undefined) mapped.parameters = fn.parameters;
  if (typeof fn.strict === "boolean") mapped.strict = fn.strict;
  return mapped;
}

function mapChatToolChoiceToResponses(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "function") {
    const name = isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null;
    return name ? { type: "function", name } : toolChoice;
  }
  return toolChoice;
}

function mapChatToolCallToResponsesFunctionCall(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;
  const callId = stringOrNull(toolCall.id) || `call_${Date.now().toString(36)}`;
  return {
    type: "function_call",
    id: responsesFunctionCallItemId(callId),
    call_id: callId,
    status: "completed",
    name,
    arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
  };
}

function responsesFunctionCallItemId(callId: string): string {
  return callId.startsWith("fc") ? callId : `fc_${callId}`;
}

function mapResponsesFunctionCallToChatToolCall(item: unknown): JsonRecord | null {
  if (!isRecord(item) || item.type !== "function_call") return null;
  const name = stringOrNull(item.name);
  if (!name) return null;
  const id = stringOrNull(item.call_id) || stringOrNull(item.id) || `call_${Date.now().toString(36)}`;
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
    },
  };
}

function collectResponseOutputText(response: JsonRecord, output: unknown[]): string {
  const outputText = stringOrNull(response.output_text);
  if (outputText) return outputText;

  return output
    .map((item) => {
      if (!isRecord(item)) return "";
      if (item.type === "message") return responseContentToText(item.content);
      if (item.type === "output_text") return stringOrNull(item.text) || "";
      return "";
    })
    .filter(Boolean)
    .join("");
}

function responseContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return stringOrNull(part.text) || stringOrNull(part.output_text) || "";
    })
    .filter(Boolean)
    .join("");
}

function mapResponsesUsageToChat(usage: unknown): JsonRecord | null {
  if (!isRecord(usage)) return null;
  const promptTokens = numberOrNull(usage.input_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? 0;
  const totalTokens = numberOrNull(usage.total_tokens) ?? promptTokens + completionTokens;
  const inputDetails = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_tokens_details: {
      cached_tokens: numberOrNull(inputDetails.cached_tokens) || 0,
    },
  };
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
