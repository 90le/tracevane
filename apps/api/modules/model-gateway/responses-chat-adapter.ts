import {
  chatMcpToolBlocksToResponsesItems,
  responsesMcpCallToAnthropicToolBlocks,
  responsesMcpOutputItemToText,
} from "./mcp-translation.js";
import { applyResponsesReasoningOptions } from "./reasoning-options.js";
import { responsesBuiltinToolOutputItemToText } from "./responses-output-items.js";

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
  stopSequences: string[];
}

export interface ChatResponsesRequestAdapterOptions {
  allowStreaming?: boolean;
}

export interface ResponsesChatResponseAdapterOptions {
  preserveMcpToolCalls?: boolean;
  stopSequences?: Iterable<string>;
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

  // Do not forward Chat/Claude metadata through adapter-generated Responses
  // requests. The Codex account Responses endpoint rejects it as an unsupported
  // parameter, which breaks Claude Code CLI compatibility.
  // Also strip Chat-only sampling/logprob controls rejected by the Codex
  // account Responses endpoint: frequency_penalty, presence_penalty, seed and
  // top_logprobs.
  copyScalarFields(request, responsesRequest, [
    "background",
    "conversation",
    "include",
    "max_tool_calls",
    "parallel_tool_calls",
    "previous_response_id",
    "prompt",
    "prompt_cache_key",
    "safety_identifier",
    "service_tier",
    "store",
    "stream_options",
    "temperature",
    "top_p",
    "truncation",
    "user",
  ]);

  if (request.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_tokens;
  } else if (request.max_completion_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_completion_tokens;
  }
  // Do not forward Chat/Claude stop sequences through adapter-generated
  // Responses requests. The Codex account Responses endpoint rejects `stop` as
  // unsupported, which breaks Claude Code CLI compatibility.

  const tools = mapChatToolsToResponses(request.tools);
  if (tools.length) responsesRequest.tools = tools;

  const toolChoice = mapChatToolChoiceToResponses(request.tool_choice);
  if (toolChoice !== undefined) responsesRequest.tool_choice = toolChoice;
  if (responsesRequest.parallel_tool_calls === undefined) {
    const parallelToolCalls = mapChatToolChoiceParallelToolUseToResponses(request.tool_choice);
    if (parallelToolCalls !== undefined) responsesRequest.parallel_tool_calls = parallelToolCalls;
  }

  const textFormat = mapChatResponseFormatToResponsesText(request.response_format);
  if (textFormat !== undefined) responsesRequest.text = { format: textFormat };

  applyResponsesReasoningOptions(responsesRequest, request);

  return { responsesRequest, model, stream, stopSequences: normalizeStopSequences(request.stop) };
}

export function adaptResponsesToChatCompletion(
  response: unknown,
  fallbackModel: string | null,
  options: ResponsesChatResponseAdapterOptions = {},
): JsonRecord {
  if (!isRecord(response)) {
    throw new OpenAIResponsesChatAdapterError(
      "model_gateway_responses_chat_response_invalid",
      "OpenAI Responses upstream returned a non-object response.",
      502,
    );
  }

  const output = Array.isArray(response.output) ? response.output : [];
  const mcpToolBlocks = options.preserveMcpToolCalls
    ? collectResponseMcpToolBlocks(output)
    : [];
  const text = truncateAtStopSequence(
    collectResponseOutputText(response, output, { skipMcpToolCalls: mcpToolBlocks.length > 0 }),
    options.stopSequences,
  ).text;
  const toolCalls = output
    .map(mapResponsesFunctionCallToChatToolCall)
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  const message: JsonRecord = {
    role: "assistant",
    content: text || (toolCalls.length ? null : ""),
  };
  const reasoningText = collectResponseReasoningText(output);
  const reasoningDetails = collectResponseReasoningDetails(output);
  if (reasoningText) message.reasoning_content = reasoningText;
  if (reasoningDetails.length) message.reasoning_details = reasoningDetails;
  if (mcpToolBlocks.length) message.mcp_tool_blocks = mcpToolBlocks;
  const annotations = collectResponseOutputAnnotations(output);
  if (annotations.length) message.annotations = annotations;
  if (toolCalls.length) message.tool_calls = toolCalls;

  const choice: JsonRecord = {
    index: 0,
    message,
    finish_reason: mapResponsesFinishReasonToChat(response, toolCalls.length > 0),
  };
  const logprobs = collectResponseOutputLogprobs(output);
  if (logprobs.length) choice.logprobs = { content: logprobs };

  const chatCompletion: JsonRecord = {
    id: stringOrNull(response.id) || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created: numberOrNull(response.created_at) || Math.floor(Date.now() / 1_000),
    model: stringOrNull(response.model) || fallbackModel,
    choices: [choice],
    usage: mapResponsesUsageToChat(response.usage),
  };
  if (response.service_tier !== undefined) chatCompletion.service_tier = response.service_tier;
  return chatCompletion;
}

function mapResponsesFinishReasonToChat(response: JsonRecord, hasToolCalls: boolean): string {
  if (hasToolCalls) return "tool_calls";
  if (response.status === "incomplete") return "length";
  return "stop";
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
    const callId = stringOrNull(message.tool_call_id) || stringOrNull(message.id);
    if (!callId) return [];
    return [{
      type: "function_call_output",
      call_id: callId,
      output: chatToolOutputToResponsesOutput(message.content),
    }];
  }

  const items: JsonRecord[] = [];
  const role = message.role === "assistant" ? "assistant" : "user";
  if (role === "assistant") {
    items.push(...chatMessageReasoningToResponsesItems(message));
    items.push(...chatMcpToolBlocksToResponsesItems(message.mcp_tool_blocks));
  }
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

function chatMessageReasoningToResponsesItems(message: JsonRecord): JsonRecord[] {
  const detailItems = chatReasoningDetailsToResponsesItems(message.reasoning_details);
  if (detailItems.length) return detailItems;
  const reasoningText = extractChatReasoningText(message);
  return reasoningText ? [responsesReasoningTextItem(reasoningText)] : [];
}

function chatReasoningDetailsToResponsesItems(details: unknown): JsonRecord[] {
  if (!Array.isArray(details)) return [];
  const items: JsonRecord[] = [];
  const textParts: string[] = [];
  for (const detail of details) {
    if (typeof detail === "string") {
      if (detail) textParts.push(detail);
      continue;
    }
    if (!isRecord(detail)) continue;
    if (detail.type === "reasoning") {
      items.push(stripReasoningTransportFields(detail));
      continue;
    }
    const encryptedContent = stringOrNull(detail.encrypted_content);
    if (encryptedContent) {
      items.push({ type: "reasoning", encrypted_content: encryptedContent });
      continue;
    }
    const text = reasoningDetailToText(detail);
    if (text) textParts.push(text);
  }
  if (textParts.length) items.push(responsesReasoningTextItem(textParts.join("")));
  return items;
}

function stripReasoningTransportFields(detail: JsonRecord): JsonRecord {
  const { output_index: _outputIndex, content_index: _contentIndex, annotation_index: _annotationIndex, ...rest } = detail;
  return { ...rest, type: "reasoning" };
}

function responsesReasoningTextItem(text: string): JsonRecord {
  return {
    type: "reasoning",
    summary: [{ type: "summary_text", text }],
  };
}

function extractChatReasoningText(message: JsonRecord): string {
  const direct = stringOrNull(message.reasoning_content);
  if (direct) return direct;
  const reasoning = isRecord(message.reasoning) ? message.reasoning : null;
  if (reasoning) {
    for (const key of ["content", "text", "summary"] as const) {
      const value = stringOrNull(reasoning[key]);
      if (value) return value;
    }
  }
  const details = Array.isArray(message.reasoning_details) ? message.reasoning_details : [];
  return details.map((part) => typeof part === "string" ? part : isRecord(part) ? reasoningDetailToText(part) : "").filter(Boolean).join("");
}

function reasoningDetailToText(detail: JsonRecord): string {
  const summary = Array.isArray(detail.summary) ? detail.summary : [];
  const summaryText = summary
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return stringOrNull(part.text)
        || stringOrNull(part.summary_text)
        || stringOrNull(part.output_text)
        || "";
    })
    .filter(Boolean)
    .join("");
  return summaryText
    || stringOrNull(detail.text)
    || stringOrNull(detail.content)
    || stringOrNull(detail.summary_text)
    || stringOrNull(detail.thinking)
    || "";
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
      if (imageUrl) {
        const imagePart: JsonRecord = { type: "input_image", image_url: imageUrl };
        const detail = stringOrNull(part.image_url.detail) || stringOrNull(part.detail);
        if (detail) imagePart.detail = detail;
        parts.push(imagePart);
      }
      continue;
    }
    if (type === "input_image" && role !== "assistant") {
      const imagePart = chatInputImagePartToResponsesInputImage(part);
      if (imagePart) parts.push(imagePart);
      continue;
    }
    if ((type === "file" || type === "input_file") && role !== "assistant") {
      const filePart = chatFilePartToResponsesInputFile(part);
      if (filePart) parts.push(filePart);
      continue;
    }
    if (type === "refusal" && role === "assistant") {
      const refusal = stringOrNull(part.refusal) || stringOrNull(part.text);
      if (refusal) parts.push({ type: "refusal", refusal });
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

function chatInputImagePartToResponsesInputImage(part: JsonRecord): JsonRecord | null {
  const mapped: JsonRecord = { type: "input_image" };
  for (const key of ["image_url", "file_id", "detail"] as const) {
    if (part[key] !== undefined) mapped[key] = part[key];
  }
  if (mapped.image_url === undefined && part.url !== undefined) mapped.image_url = part.url;
  return Object.keys(mapped).length > 1 ? mapped : null;
}

function chatFilePartToResponsesInputFile(part: JsonRecord): JsonRecord | null {
  const file = isRecord(part.file) ? part.file : part;
  const mapped: JsonRecord = { type: "input_file" };
  for (const key of ["file_id", "file_url", "filename", "file_data"] as const) {
    if (file[key] !== undefined) mapped[key] = file[key];
  }
  if (mapped.file_url === undefined && file.url !== undefined) mapped.file_url = file.url;
  if (mapped.filename === undefined && file.name !== undefined) mapped.filename = file.name;
  return Object.keys(mapped).length > 1 ? mapped : null;
}

function mapChatToolsToResponses(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    const mapped = mapChatToolToResponses(tool);
    return mapped ? [mapped] : [];
  });
}

function mapChatToolToResponses(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (tool.type !== "function") {
    return typeof tool.type === "string" ? { ...tool } : null;
  }
  const fn = isRecord(tool.function) ? tool.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;

  const mapped: JsonRecord = { type: "function", name };
  if (typeof fn.description === "string") mapped.description = fn.description;
  if (fn.parameters !== undefined) mapped.parameters = fn.parameters;
  if (typeof fn.strict === "boolean") mapped.strict = fn.strict;
  return mapped;
}

function mapChatResponseFormatToResponsesText(responseFormat: unknown): unknown {
  if (!isRecord(responseFormat)) return undefined;
  if (responseFormat.type === "json_schema" && isRecord(responseFormat.json_schema)) {
    return {
      type: "json_schema",
      ...responseFormat.json_schema,
    };
  }
  if (responseFormat.type === "json_object" || responseFormat.type === "text") {
    return { type: responseFormat.type };
  }
  return responseFormat;
}

function mapChatToolChoiceToResponses(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "function") {
    const name = (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null)
      || stringOrNull(toolChoice.name);
    return name ? { type: "function", name } : toolChoice;
  }
  if (toolChoice.type === "tool") {
    const name = stringOrNull(toolChoice.name);
    return name ? { type: "function", name } : toolChoice;
  }
  return toolChoice;
}

function mapChatToolChoiceParallelToolUseToResponses(toolChoice: unknown): boolean | undefined {
  if (!isRecord(toolChoice)) return undefined;
  return toolChoice.disable_parallel_tool_use === true ? false : undefined;
}

function mapChatToolCallToResponsesFunctionCall(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  const callId = stringOrNull(toolCall.id);
  if (!name || !callId) return null;
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
  if (!isRecord(item) || (item.type !== "function_call" && item.type !== "custom_tool_call")) return null;
  const name = stringOrNull(item.name);
  const id = stringOrNull(item.call_id) || stringOrNull(item.id);
  if (!name || !id) return null;
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: item.type === "custom_tool_call"
        ? customToolArgumentsFromResponsesInput(item.input)
        : typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
    },
  };
}

function customToolArgumentsFromResponsesInput(input: unknown): string {
  if (isRecord(input)) return JSON.stringify(input);
  return JSON.stringify({ input: typeof input === "string" ? input : stringifyCompact(input ?? "") });
}

function collectResponseOutputText(
  response: JsonRecord,
  output: unknown[],
  options: { skipMcpToolCalls?: boolean } = {},
): string {
  const outputText = stringOrNull(response.output_text);
  if (outputText) return outputText;

  return output
    .map((item) => responseOutputItemToText(item, options))
    .filter(Boolean)
    .join("");
}

function responseOutputItemToText(item: unknown, options: { skipMcpToolCalls?: boolean } = {}): string {
  if (!isRecord(item)) return "";
  if (item.type === "message") return responseContentToText(item.content);
  if (item.type === "output_text") return stringOrNull(item.text) || "";
  if (item.type === "refusal") return stringOrNull(item.refusal) || "";
  if (item.type === "mcp_call" && options.skipMcpToolCalls) return "";
  const mcpText = responsesMcpOutputItemToText(item);
  if (mcpText) return mcpText;
  const builtinToolText = responsesBuiltinToolOutputItemToText(item);
  if (builtinToolText) return builtinToolText;
  return "";
}

function collectResponseMcpToolBlocks(output: unknown[]): JsonRecord[] {
  return output.flatMap((item): JsonRecord[] => (
    isRecord(item) ? responsesMcpCallToAnthropicToolBlocks(item) : []
  ));
}

function collectResponseReasoningDetails(output: unknown[]): JsonRecord[] {
  return output.flatMap((item): JsonRecord[] => {
    if (!isRecord(item) || item.type !== "reasoning") return [];
    return [{ ...item }];
  });
}

function collectResponseReasoningText(output: unknown[]): string {
  return output
    .map(responseOutputItemToReasoningText)
    .filter(Boolean)
    .join("");
}

function responseOutputItemToReasoningText(item: unknown): string {
  if (!isRecord(item) || item.type !== "reasoning") return "";
  const summary = Array.isArray(item.summary) ? item.summary : [];
  const summaryText = summary
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return stringOrNull(part.text)
        || stringOrNull(part.summary_text)
        || stringOrNull(part.output_text)
        || "";
    })
    .filter(Boolean)
    .join("");
  return summaryText || stringOrNull(item.text) || "";
}

function stringifyCompact(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeStopSequences(value: unknown): string[] {
  if (typeof value === "string" && value.length) return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function truncateAtStopSequence(text: string, stopSequences: Iterable<string> | undefined): {
  text: string;
  stopSequence: string | null;
} {
  let earliestIndex = -1;
  let matched: string | null = null;
  for (const stop of stopSequences || []) {
    if (!stop) continue;
    const index = text.indexOf(stop);
    if (index === -1) continue;
    if (earliestIndex === -1 || index < earliestIndex) {
      earliestIndex = index;
      matched = stop;
    }
  }
  return earliestIndex === -1
    ? { text, stopSequence: null }
    : { text: text.slice(0, earliestIndex), stopSequence: matched };
}

function collectResponseOutputLogprobs(output: unknown[]): JsonRecord[] {
  return output.flatMap((item): JsonRecord[] => {
    if (!isRecord(item)) return [];
    if (Array.isArray(item.logprobs)) return item.logprobs.filter(isRecord);
    if (item.type !== "message" || !Array.isArray(item.content)) return [];
    return item.content.flatMap((part): JsonRecord[] => (
      isRecord(part) && Array.isArray(part.logprobs) ? part.logprobs.filter(isRecord) : []
    ));
  });
}

function collectResponseOutputAnnotations(output: unknown[]): JsonRecord[] {
  return output.flatMap((item, outputIndex): JsonRecord[] => {
    if (!isRecord(item)) return [];
    if (item.type === "message") return responseContentAnnotations(item.content, outputIndex);
    if (item.type === "output_text") return annotationsFromPart(item, { output_index: outputIndex });
    return [];
  });
}

function responseContentAnnotations(content: unknown, outputIndex: number): JsonRecord[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((part, contentIndex): JsonRecord[] => (
    isRecord(part) ? annotationsFromPart(part, { output_index: outputIndex, content_index: contentIndex }) : []
  ));
}

function annotationsFromPart(part: JsonRecord, location: JsonRecord): JsonRecord[] {
  if (!Array.isArray(part.annotations)) return [];
  return part.annotations
    .filter(isRecord)
    .map((annotation) => ({ ...annotation, ...location }));
}

function responseContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return stringOrNull(part.text) || stringOrNull(part.output_text) || stringOrNull(part.refusal) || "";
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
  const outputDetails = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  const promptDetails: JsonRecord = {
    cached_tokens: numberOrNull(inputDetails.cached_tokens) || 0,
  };
  copyNumericField(inputDetails, promptDetails, "audio_tokens");

  const completionDetails = numericFields(outputDetails, [
    "reasoning_tokens",
    "audio_tokens",
    "accepted_prediction_tokens",
    "rejected_prediction_tokens",
  ]);

  const mapped: JsonRecord = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    prompt_tokens_details: promptDetails,
  };
  if (Object.keys(completionDetails).length) mapped.completion_tokens_details = completionDetails;
  return mapped;
}

function numericFields(source: JsonRecord, fields: string[]): JsonRecord {
  const mapped: JsonRecord = {};
  for (const field of fields) copyNumericField(source, mapped, field);
  return mapped;
}

function copyNumericField(source: JsonRecord, target: JsonRecord, field: string): void {
  const value = numberOrNull(source[field]);
  if (value !== null) target[field] = value;
}

function chatToolOutputToResponsesOutput(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    const text = content.map(chatContentPartToText).filter(Boolean).join("");
    return content.every(chatContentPartIsTextLike) ? text : stringifyCompact(content);
  }
  const text = chatContentPartToText(content);
  return text || stringifyCompact(content);
}

function chatContentPartIsTextLike(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (!isRecord(part)) return false;
  const type = stringOrNull(part.type);
  if (type === null) return Boolean(chatContentPartToText(part));
  return type === "text" || type === "input_text" || type === "output_text" || type === "refusal";
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
