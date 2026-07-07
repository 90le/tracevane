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
  allowToolCalls: boolean;
  legacyFunctionCalls: boolean;
}

export interface ChatResponsesRequestAdapterOptions {
  allowStreaming?: boolean;
}

export interface ResponsesChatResponseAdapterOptions {
  preserveMcpToolCalls?: boolean;
  stopSequences?: Iterable<string>;
  allowToolCalls?: boolean;
  legacyFunctionCalls?: boolean;
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

  const responsesInput = mapChatMessagesToResponsesInput(request.messages);
  const toolCompatibilityText = chatToolCompatibilityNotesToResponsesText(request.tools);
  if (toolCompatibilityText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: toolCompatibilityText }] });
  }
  const unsupportedToolsText = chatUnsupportedToolsToResponsesText(request.tools);
  if (unsupportedToolsText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: unsupportedToolsText }] });
  }
  const rawToolChoice = request.tool_choice !== undefined
    ? request.tool_choice
    : mapLegacyChatFunctionCallToToolChoice(request.function_call);
  const unsupportedToolChoiceText = chatUnsupportedToolChoiceToResponsesText(rawToolChoice, {
    tools: request.tools,
    functions: request.functions,
    webSearchOptions: request.web_search_options,
  });
  if (unsupportedToolChoiceText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: unsupportedToolChoiceText }] });
  }
  const unsupportedResponseFormatText = chatUnsupportedResponseFormatToResponsesText(request.response_format);
  if (unsupportedResponseFormatText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: unsupportedResponseFormatText }] });
  }
  const unsupportedRequestControlsText = chatUnsupportedRequestControlsToResponsesText(request);
  if (unsupportedRequestControlsText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: unsupportedRequestControlsText }] });
  }
  const metadataContextText = chatMetadataContextToResponsesText(request.metadata);
  if (metadataContextText) {
    responsesInput.push({ role: "user", content: [{ type: "input_text", text: metadataContextText }] });
  }

  const responsesRequest: JsonRecord = {
    model,
    input: responsesInput,
    stream,
  };

  const instructions = extractInstructions(request.messages);
  if (instructions) responsesRequest.instructions = instructions;

  // Do not forward Chat/Claude metadata through adapter-generated Responses
  // requests. The Codex account Responses endpoint rejects it as an unsupported
  // parameter, which breaks Claude Code CLI compatibility.
  // Also strip Chat-only sampling controls rejected by the Codex account
  // Responses endpoint: frequency_penalty, presence_penalty and seed. Keep
  // top_logprobs for generic Responses providers because the Responses API
  // supports it; Codex account request normalization strips it later.
  copyScalarFields(request, responsesRequest, [
    "background",
    "context_management",
    "conversation",
    "include",
    "max_tool_calls",
    "parallel_tool_calls",
    "previous_response_id",
    "prompt",
    "prompt_cache_key",
    "prompt_cache_retention",
    "safety_identifier",
    "service_tier",
    "store",
    "stream_options",
    "temperature",
    "top_logprobs",
    "top_p",
    "truncation",
    "user",
  ]);

  if (request.max_completion_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_completion_tokens;
  } else if (request.max_tokens !== undefined) {
    responsesRequest.max_output_tokens = request.max_tokens;
  }
  applyChatLogprobControlsToResponses(responsesRequest, request);
  // Do not forward Chat/Claude stop sequences through adapter-generated
  // Responses requests. The Codex account Responses endpoint rejects `stop` as
  // unsupported, which breaks Claude Code CLI compatibility.

  const tools = [
    ...mapChatToolsToResponses(request.tools),
    ...mapChatFunctionsToResponses(request.functions),
  ];
  mergeChatWebSearchOptionsIntoResponsesTools(tools, request.web_search_options);
  if (tools.length) responsesRequest.tools = tools;

  const toolChoice = mapChatToolChoiceToResponses(rawToolChoice, {
    tools: request.tools,
    functions: request.functions,
    webSearchOptions: request.web_search_options,
  });
  if (toolChoice !== undefined) responsesRequest.tool_choice = toolChoice;
  if (responsesRequest.parallel_tool_calls === undefined) {
    const parallelToolCalls = mapChatToolChoiceParallelToolUseToResponses(request.tool_choice);
    if (parallelToolCalls !== undefined) responsesRequest.parallel_tool_calls = parallelToolCalls;
  }

  const textFormat = mapChatResponseFormatToResponsesText(request.response_format);
  if (textFormat !== undefined) responsesRequest.text = { format: textFormat };
  applyChatVerbosityToResponsesText(responsesRequest, request.verbosity);

  applyResponsesReasoningOptions(responsesRequest, request);

  return {
    responsesRequest,
    model,
    stream,
    stopSequences: normalizeStopSequences(request.stop),
    allowToolCalls: Array.isArray(responsesRequest.tools) && responsesRequest.tools.length > 0,
    legacyFunctionCalls: usesLegacyChatFunctions(request),
  };
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
  const refusal = collectResponseRefusalText(output);
  const mcpToolBlocks = options.preserveMcpToolCalls
    ? collectResponseMcpToolBlocks(output)
    : [];
  const text = truncateAtStopSequence(
    collectResponseOutputText(response, output, { skipMcpToolCalls: mcpToolBlocks.length > 0 }),
    options.stopSequences,
  ).text;
  const allowToolCalls = options.allowToolCalls !== false;
  const toolCalls = allowToolCalls
    ? output
      .map(mapResponsesFunctionCallToChatToolCall)
      .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall))
    : [];
  const malformedToolCallText = output
    .map((item) => responsesFunctionCallFallbackToChatText(item, allowToolCalls))
    .filter(Boolean)
    .join("\n");
  const messageText = [text, malformedToolCallText].filter(Boolean).join("\n");
  const message: JsonRecord = {
    role: "assistant",
    content: messageText || (toolCalls.length ? null : ""),
  };
  const reasoningText = collectResponseReasoningText(output);
  const reasoningDetails = collectResponseReasoningDetails(output);
  if (reasoningText) message.reasoning_content = reasoningText;
  if (reasoningDetails.length) message.reasoning_details = reasoningDetails;
  if (mcpToolBlocks.length) message.mcp_tool_blocks = mcpToolBlocks;
  const annotations = collectResponseOutputAnnotations(output);
  if (annotations.length) message.annotations = annotations;
  if (refusal) message.refusal = refusal;
  const legacyFunctionCall = options.legacyFunctionCalls ? chatToolCallToLegacyFunctionCall(toolCalls[0]) : null;
  if (legacyFunctionCall) {
    message.function_call = legacyFunctionCall;
  } else if (toolCalls.length) {
    message.tool_calls = toolCalls;
  }

  const choice: JsonRecord = {
    index: 0,
    message,
    finish_reason: mapResponsesFinishReasonToChat(response, toolCalls.length > 0, Boolean(refusal), Boolean(legacyFunctionCall)),
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
  const serviceTier = stringOrNull(response.service_tier) || serviceTierFromUsage(response.usage);
  if (serviceTier) chatCompletion.service_tier = serviceTier;
  return chatCompletion;
}

function mapResponsesFinishReasonToChat(response: JsonRecord, hasToolCalls: boolean, hasRefusal: boolean, legacyFunctionCall = false): string {
  if (hasToolCalls) return legacyFunctionCall ? "function_call" : "tool_calls";
  if (response.status === "incomplete") return "length";
  if (hasRefusal) return "content_filter";
  return "stop";
}

function usesLegacyChatFunctions(request: JsonRecord): boolean {
  return Array.isArray(request.functions) || request.function_call !== undefined;
}

function chatToolCallToLegacyFunctionCall(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : null;
  const name = stringOrNull(fn?.name);
  if (!fn || !name) return null;
  return {
    name,
    arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
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
    const callId = stringOrNull(message.tool_call_id) || stringOrNull(message.id);
    if (!callId) return [chatMessageContextToResponsesInput(
      "OpenAI Chat tool message missing tool_call_id for Responses",
      message,
    )];
    return [chatToolOutputMessageToResponsesItem(callId, message)];
  }
  if (message.role === "function") {
    const name = stringOrNull(message.name);
    if (!name) return [chatMessageContextToResponsesInput(
      "OpenAI Chat function message missing name for Responses",
      message,
    )];
    return [chatToolOutputMessageToResponsesItem(legacyFunctionCallId(name), message)];
  }

  const items: JsonRecord[] = [];
  const role = message.role === "assistant" ? "assistant" : "user";
  if (role === "assistant") {
    items.push(...chatMessageReasoningToResponsesItems(message));
    items.push(...chatMcpToolBlocksToResponsesItems(message.mcp_tool_blocks));
  }
  const content = chatContentToResponsesContent(message.content, role);
  const legacyFunctionCall = role === "assistant" ? mapLegacyChatFunctionCallMessageToResponses(message.function_call) : null;
  const hasToolCalls = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  if (content.length || (!hasToolCalls && !legacyFunctionCall)) {
    items.push({
      role,
      content,
    });
  }

  if (legacyFunctionCall) items.push(legacyFunctionCall);
  else if (message.function_call !== undefined) {
    items.push(chatMessageContextToResponsesInput(
      "OpenAI Chat malformed function_call for Responses",
      message.function_call,
      role,
    ));
  }

  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const mapped = mapChatToolCallToResponsesFunctionCall(toolCall);
      if (mapped) {
        items.push(mapped);
      } else {
        items.push(chatMessageContextToResponsesInput(
          "OpenAI Chat malformed tool_call for Responses",
          toolCall,
          role,
        ));
      }
    }
  }
  return items;
}

function chatMessageContextToResponsesInput(label: string, value: unknown, role = "user"): JsonRecord {
  const mappedRole = role === "assistant" ? "assistant" : "user";
  return {
    role: mappedRole,
    content: [{
      type: mappedRole === "assistant" ? "output_text" : "input_text",
      text: `${label}: ${stringifyCompact(value)}`,
    }],
  };
}

function chatToolOutputMessageToResponsesItem(callId: string, message: JsonRecord): JsonRecord {
  const item: JsonRecord = {
    type: "function_call_output",
    call_id: callId,
    output: chatToolOutputToResponsesOutput(message.content),
  };
  if (message.is_error === true) item.status = "incomplete";
  return item;
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
    if (type === "image_url" && role !== "assistant") {
      const image = isRecord(part.image_url) ? part.image_url : null;
      const imageUrl = image ? stringOrNull(image.url) : null;
      if (imageUrl) {
        const imagePart: JsonRecord = { type: "input_image", image_url: imageUrl };
        const detail = stringOrNull(image?.detail) || stringOrNull(part.detail);
        if (detail) imagePart.detail = detail;
        parts.push(imagePart);
        appendChatCacheControlNoteForResponses(parts, part, textType);
      } else {
        parts.push(chatContentPartFallbackToResponsesText(part, textType));
      }
      continue;
    }
    if (type === "input_image" && role !== "assistant") {
      const imagePart = chatInputImagePartToResponsesInputImage(part);
      if (imagePart) {
        parts.push(imagePart);
        appendChatCacheControlNoteForResponses(parts, part, textType);
      } else {
        parts.push(chatContentPartFallbackToResponsesText(part, textType));
      }
      continue;
    }
    if ((type === "file" || type === "input_file") && role !== "assistant") {
      const fileParts = chatFilePartToResponsesInputParts(part);
      if (fileParts.length) {
        parts.push(...fileParts);
        appendChatCacheControlNoteForResponses(parts, part, textType);
      } else {
        parts.push(chatContentPartFallbackToResponsesText(part, textType));
      }
      continue;
    }
    if (type === "refusal" && role === "assistant") {
      const refusal = stringOrNull(part.refusal) || stringOrNull(part.text);
      if (refusal) parts.push({ type: "refusal", refusal });
      else parts.push(chatContentPartFallbackToResponsesText(part, textType));
      continue;
    }
    const text = chatContentPartToText(part);
    if (text) {
      parts.push({ type: textType, text });
      appendChatCacheControlNoteForResponses(parts, part, textType);
    } else if (type) {
      parts.push(chatContentPartFallbackToResponsesText(part, textType));
    }
  }
  return parts;
}

function chatContentPartFallbackToResponsesText(part: JsonRecord, textType: string): JsonRecord {
  return {
    type: textType,
    text: `OpenAI Chat unrecognized content part for Responses: ${stringifyCompact(part)}`,
  };
}

function appendChatCacheControlNoteForResponses(parts: JsonRecord[], part: JsonRecord, textType: string): void {
  if (part.cache_control === undefined) return;
  parts.push({
    type: textType,
    text: `OpenAI Chat content part cache_control preserved for Responses: ${stringifyCompact(part.cache_control)}`,
  });
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

function chatFilePartToResponsesInputParts(part: JsonRecord): JsonRecord[] {
  const filePart = chatFilePartToResponsesInputFile(part);
  if (!filePart) return [];
  const file = isRecord(part.file) ? part.file : part;
  const mediaType = stringOrNull(file.media_type) || stringOrNull(file.mime_type);
  if (!mediaType) return [filePart];
  return [
    filePart,
    {
      type: "input_text",
      text: `OpenAI Chat file media_type preserved for Responses input: ${mediaType}`,
    },
  ];
}

function mapChatToolsToResponses(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    const mapped = mapChatToolToResponses(tool);
    return mapped ? [mapped] : [];
  });
}

function mapChatFunctionsToResponses(functions: unknown): JsonRecord[] {
  if (!Array.isArray(functions)) return [];
  return functions.flatMap((fn) => {
    if (!isRecord(fn)) return [];
    const name = stringOrNull(fn.name);
    if (!name) return [];
    const mapped: JsonRecord = { type: "function", name };
    if (typeof fn.description === "string") mapped.description = fn.description;
    if (fn.parameters !== undefined) mapped.parameters = fn.parameters;
    if (typeof fn.strict === "boolean") mapped.strict = fn.strict;
    return [mapped];
  });
}

function mapChatToolToResponses(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (isOpenAIWebSearchToolType(tool.type)) return copyOpenAIWebSearchTool(tool);
  if (isAnthropicWebSearchTool(tool)) return copyAnthropicWebSearchToolToResponses(tool);
  if (tool.type === "mcp") return copyResponsesMcpTool(tool);
  if (tool.type === "custom") return mapChatCustomToolToResponses(tool);
  if (tool.type !== "function") return null;
  const fn = isRecord(tool.function) ? tool.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;

  const mapped: JsonRecord = { type: "function", name };
  if (typeof fn.description === "string") mapped.description = fn.description;
  if (fn.parameters !== undefined) mapped.parameters = fn.parameters;
  if (typeof fn.strict === "boolean") mapped.strict = fn.strict;
  return mapped;
}

function mergeChatWebSearchOptionsIntoResponsesTools(tools: JsonRecord[], webSearchOptions: unknown): void {
  const mappedOptions = mapChatWebSearchOptionsToResponsesTool(webSearchOptions);
  if (!mappedOptions) return;
  const existing = tools.find((tool) => isOpenAIWebSearchToolType(tool.type));
  if (!existing) {
    tools.push(mappedOptions);
    return;
  }
  for (const key of ["search_context_size", "user_location"] as const) {
    if (existing[key] === undefined && mappedOptions[key] !== undefined) existing[key] = mappedOptions[key];
  }
}

function mapChatWebSearchOptionsToResponsesTool(webSearchOptions: unknown): JsonRecord | null {
  if (!isRecord(webSearchOptions)) return null;
  const mapped: JsonRecord = { type: "web_search_preview" };
  if (webSearchOptions.search_context_size !== undefined) mapped.search_context_size = webSearchOptions.search_context_size;
  const userLocation = mapChatWebSearchLocationToResponses(webSearchOptions.user_location);
  if (userLocation !== undefined) mapped.user_location = userLocation;
  return mapped;
}

function mapChatWebSearchLocationToResponses(userLocation: unknown): unknown {
  if (!isRecord(userLocation)) return userLocation;
  if (userLocation.type === "approximate" && userLocation.approximate !== undefined) {
    const approximate = userLocation.approximate;
    if (!isRecord(approximate)) return userLocation;
    return { type: "approximate", ...approximate };
  }
  return userLocation;
}

function mapChatCustomToolToResponses(tool: JsonRecord): JsonRecord | null {
  const source = isRecord(tool.function) ? tool.function : tool;
  const name = stringOrNull(source.name);
  if (!name) return null;
  const mapped: JsonRecord = { type: "custom", name };
  if (typeof source.description === "string") mapped.description = source.description;
  if (source.input_format !== undefined) mapped.input_format = source.input_format;
  return mapped;
}

function copyOpenAIWebSearchTool(tool: JsonRecord): JsonRecord {
  const mapped: JsonRecord = { type: tool.type };
  for (const key of ["search_context_size", "user_location"] as const) {
    if (tool[key] !== undefined) mapped[key] = tool[key];
  }
  return mapped;
}

function copyAnthropicWebSearchToolToResponses(tool: JsonRecord): JsonRecord {
  const mapped: JsonRecord = { type: "web_search_preview" };
  if (tool.user_location !== undefined) mapped.user_location = tool.user_location;
  return mapped;
}

function chatToolCompatibilityNotesToResponsesText(tools: unknown): string {
  if (!Array.isArray(tools)) return "";
  const notes = tools.flatMap((tool): string[] => {
    if (!isRecord(tool) || !isAnthropicWebSearchTool(tool)) return [];
    const fields = ["allowed_callers", "allowed_domains", "blocked_domains", "defer_loading", "max_uses", "strict"]
      .filter((field) => tool[field] !== undefined)
      .map((field) => `${field}=${stringifyCompact(tool[field])}`);
    return fields.length ? [`web_search ${fields.join(" ")}`] : [];
  });
  return notes.length
    ? `Anthropic web_search fields preserved for OpenAI Responses context: ${notes.join("; ")}`
    : "";
}

function copyResponsesMcpTool(tool: JsonRecord): JsonRecord | null {
  const serverLabel = stringOrNull(tool.server_label);
  const serverUrl = stringOrNull(tool.server_url);
  if (!serverLabel || !serverUrl) return null;
  const mapped: JsonRecord = {
    type: "mcp",
    server_label: serverLabel,
    server_url: serverUrl,
  };
  for (const key of [
    "allowed_tools",
    "authorization",
    "defer_loading",
    "headers",
    "require_approval",
    "server_description",
  ] as const) {
    if (tool[key] !== undefined) mapped[key] = tool[key];
  }
  return mapped;
}

function applyChatLogprobControlsToResponses(responsesRequest: JsonRecord, request: JsonRecord): void {
  if (request.logprobs !== true && request.top_logprobs === undefined) return;
  const include = Array.isArray(responsesRequest.include)
    ? responsesRequest.include.map((item) => stringOrNull(item)).filter(Boolean)
    : [];
  if (!include.includes("message.output_text.logprobs")) include.push("message.output_text.logprobs");
  responsesRequest.include = include;
}

function mapChatResponseFormatToResponsesText(responseFormat: unknown): unknown {
  if (!isRecord(responseFormat)) return undefined;
  if (responseFormat.type === "json_schema") {
    const direct = chatDirectJsonSchemaFormat(responseFormat);
    if (direct) return direct;
    if (isRecord(responseFormat.json_schema)) {
      return {
        type: "json_schema",
        ...responseFormat.json_schema,
      };
    }
  }
  if (responseFormat.type === "json_object" || responseFormat.type === "text") {
    return { type: responseFormat.type };
  }
  return undefined;
}

function chatDirectJsonSchemaFormat(responseFormat: JsonRecord): JsonRecord | null {
  if (!isRecord(responseFormat.schema)) return null;
  const mapped: JsonRecord = { type: "json_schema" };
  for (const key of ["name", "schema", "strict", "description"] as const) {
    if (responseFormat[key] !== undefined) mapped[key] = responseFormat[key];
  }
  return mapped;
}

function chatUnsupportedResponseFormatToResponsesText(responseFormat: unknown): string {
  if (responseFormat === undefined) return "";
  if (mapChatResponseFormatToResponsesText(responseFormat) !== undefined) return "";
  return `OpenAI Chat unsupported response_format for Responses: ${stringifyCompact(responseFormat)}`;
}

function chatUnsupportedRequestControlsToResponsesText(request: JsonRecord): string {
  const unsupportedFields = [
    "frequency_penalty",
    "logit_bias",
    "n",
    "prediction",
    "presence_penalty",
    "seed",
    "tool_resources",
    "extra_body",
  ];
  const notes = unsupportedFields
    .filter((field) => request[field] !== undefined)
    .map((field) => `${field}=${stringifyCompact(request[field])}`);
  if (request.audio !== undefined) {
    notes.push(`audio=${stringifyCompact(request.audio)}`);
  }
  if (request.modalities !== undefined && !chatModalitiesAreTextOnly(request.modalities)) {
    notes.push(`modalities=${stringifyCompact(request.modalities)}`);
  }
  return notes.length
    ? `OpenAI Chat request controls preserved for Responses: ${notes.join(" ")}`
    : "";
}

function chatModalitiesAreTextOnly(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => stringOrNull(item)?.toLowerCase() === "text");
}

function applyChatVerbosityToResponsesText(responsesRequest: JsonRecord, verbosityValue: unknown): void {
  const verbosity = verbosityOrNull(verbosityValue);
  if (!verbosity) return;
  const existingText = isRecord(responsesRequest.text) ? responsesRequest.text : {};
  responsesRequest.text = {
    ...existingText,
    verbosity,
  };
}

function mapLegacyChatFunctionCallToToolChoice(functionCall: unknown): unknown {
  if (functionCall === undefined) return undefined;
  if (functionCall === "auto" || functionCall === "none") return functionCall;
  if (!isRecord(functionCall)) return functionCall;
  const name = stringOrNull(functionCall.name);
  return name ? { type: "function", name } : functionCall;
}

function mapChatToolChoiceToResponses(
  toolChoice: unknown,
  context: { tools?: unknown; functions?: unknown; webSearchOptions?: unknown } = {},
): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (!isRecord(toolChoice)) return undefined;
  if (toolChoice.type === "any") return "required";
  if (isOpenAIWebSearchToolType(toolChoice.type)) return { type: toolChoice.type };
  if (toolChoice.type === "function") {
    const name = (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null)
      || stringOrNull(toolChoice.name);
    return name && chatToolChoiceFunctionNameAvailable(name, context) ? { type: "function", name } : undefined;
  }
  if (toolChoice.type === "tool") {
    const name = stringOrNull(toolChoice.name);
    if (name === "web_search" && chatWebSearchAvailable(context)) return { type: "web_search_preview" };
    return name && chatToolChoiceFunctionNameAvailable(name, context) ? { type: "function", name } : undefined;
  }
  if (toolChoice.type === "custom") {
    const name = stringOrNull(toolChoice.name);
    return name && chatToolChoiceCustomNameAvailable(name, context.tools) ? { type: "custom", name } : undefined;
  }
  if (toolChoice.type === "mcp") {
    const serverLabel = stringOrNull(toolChoice.server_label);
    const name = stringOrNull(toolChoice.name);
    return serverLabel && name ? { type: "mcp", server_label: serverLabel, name } : undefined;
  }
  return undefined;
}

function chatUnsupportedToolsToResponsesText(tools: unknown): string {
  if (!Array.isArray(tools)) return "";
  const unsupported = tools.filter((tool) => isRecord(tool) && !mapChatToolToResponses(tool));
  if (!unsupported.length) return "";
  return `OpenAI Chat unsupported tools for Responses: ${stringifyCompact(unsupported)}`;
}

function chatUnsupportedToolChoiceToResponsesText(
  toolChoice: unknown,
  context: { tools?: unknown; functions?: unknown; webSearchOptions?: unknown } = {},
): string {
  if (toolChoice === undefined) return "";
  if (mapChatToolChoiceToResponses(toolChoice, context) !== undefined) return "";
  return `OpenAI Chat unsupported tool_choice for Responses: ${stringifyCompact(toolChoice)}`;
}

function chatToolsIncludeWebSearch(tools: unknown): boolean {
  return Array.isArray(tools)
    && tools.some((tool) => isRecord(tool) && (isOpenAIWebSearchToolType(tool.type) || isAnthropicWebSearchTool(tool)));
}

function chatWebSearchAvailable(context: { tools?: unknown; webSearchOptions?: unknown }): boolean {
  return chatToolsIncludeWebSearch(context.tools) || isRecord(context.webSearchOptions);
}

function chatToolChoiceFunctionNameAvailable(
  name: string,
  context: { tools?: unknown; functions?: unknown },
): boolean {
  return chatToolsIncludeFunction(context.tools, name) || chatFunctionsIncludeName(context.functions, name);
}

function chatToolsIncludeFunction(tools: unknown, name: string): boolean {
  return Array.isArray(tools)
    && tools.some((tool) => {
      if (!isRecord(tool) || tool.type !== "function") return false;
      const fn = isRecord(tool.function) ? tool.function : null;
      return stringOrNull(fn?.name) === name;
    });
}

function chatFunctionsIncludeName(functions: unknown, name: string): boolean {
  return Array.isArray(functions)
    && functions.some((fn) => isRecord(fn) && stringOrNull(fn.name) === name);
}

function chatToolChoiceCustomNameAvailable(name: string, tools: unknown): boolean {
  return Array.isArray(tools)
    && tools.some((tool) => {
      if (!isRecord(tool) || tool.type !== "custom") return false;
      const source = isRecord(tool.function) ? tool.function : tool;
      return stringOrNull(source.name) === name;
    });
}

function isOpenAIWebSearchToolType(type: unknown): boolean {
  return type === "web_search_preview" || type === "web_search_preview_2025_03_11";
}

function isAnthropicWebSearchTool(tool: JsonRecord): boolean {
  const type = stringOrNull(tool.type);
  const name = stringOrNull(tool.name);
  return name === "web_search" && (type === "web_search_20250305" || type === "web_search_20260209");
}

function mapChatToolChoiceParallelToolUseToResponses(toolChoice: unknown): boolean | undefined {
  if (!isRecord(toolChoice)) return undefined;
  return toolChoice.disable_parallel_tool_use === true ? false : undefined;
}

function mapLegacyChatFunctionCallMessageToResponses(functionCall: unknown): JsonRecord | null {
  if (!isRecord(functionCall)) return null;
  const name = stringOrNull(functionCall.name);
  if (!name) return null;
  const callId = legacyFunctionCallId(name);
  return {
    type: "function_call",
    id: responsesFunctionCallItemId(callId),
    call_id: callId,
    status: "completed",
    name,
    arguments: typeof functionCall.arguments === "string" ? functionCall.arguments : JSON.stringify(functionCall.arguments ?? {}),
  };
}

function legacyFunctionCallId(name: string): string {
  return `call_${name}`;
}

function mapChatToolCallToResponsesFunctionCall(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  const callId = stringOrNull(toolCall.id);
  if (!name || !callId) return null;
  const item: JsonRecord = {
    type: "function_call",
    id: responsesFunctionCallItemId(callId),
    call_id: callId,
    status: stringOrNull(toolCall.status) || "completed",
    name,
    arguments: typeof fn.arguments === "string" ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
  };
  if (toolCall.phase !== undefined) item.phase = toolCall.phase;
  return item;
}

function responsesFunctionCallItemId(callId: string): string {
  return callId.startsWith("fc") ? callId : `fc_${callId}`;
}

function mapResponsesFunctionCallToChatToolCall(item: unknown): JsonRecord | null {
  if (!isRecord(item) || (item.type !== "function_call" && item.type !== "custom_tool_call")) return null;
  const name = stringOrNull(item.name);
  const id = stringOrNull(item.call_id) || stringOrNull(item.id);
  if (!name || !id) return null;
  const toolCall: JsonRecord = {
    id,
    type: "function",
    function: {
      name,
      arguments: item.type === "custom_tool_call"
        ? customToolArgumentsFromResponsesInput(item.input)
        : typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
    },
  };
  const status = stringOrNull(item.status);
  if (status && status !== "completed") toolCall.status = status;
  return toolCall;
}

function responsesFunctionCallFallbackToChatText(item: unknown, allowToolCalls: boolean): string {
  if (!isRecord(item) || (item.type !== "function_call" && item.type !== "custom_tool_call")) return "";
  if (!allowToolCalls) return `OpenAI Responses ${item.type} omitted for Chat: ${stringifyCompact(item)}`;
  return mapResponsesFunctionCallToChatToolCall(item) ? "" : `OpenAI Responses malformed ${item.type} for Chat: ${stringifyCompact(item)}`;
}

function customToolArgumentsFromResponsesInput(input: unknown): string {
  if (isRecord(input)) return JSON.stringify(input);
  return JSON.stringify({ input: typeof input === "string" ? input : stringifyCompact(input ?? "") });
}

function collectResponseRefusalText(output: unknown[]): string {
  return output
    .map(responseOutputItemToRefusalText)
    .filter(Boolean)
    .join("");
}

function responseOutputItemToRefusalText(item: unknown): string {
  if (!isRecord(item)) return "";
  if (item.type === "message") return responseContentToRefusalText(item.content);
  if (item.type === "refusal") return stringOrNull(item.refusal) || "";
  return "";
}

function responseContentToRefusalText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part)) return "";
      return part.type === "refusal" ? stringOrNull(part.refusal) || "" : "";
    })
    .filter(Boolean)
    .join("");
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
  return responseUnknownOutputItemToText(item);
}

function responseUnknownOutputItemToText(item: JsonRecord): string {
  const type = stringOrNull(item.type);
  if (!type) return "";
  if (type === "reasoning" || type === "function_call" || type === "custom_tool_call") return "";
  return `OpenAI Responses unrecognized output item for Chat: ${stringifyCompact(item)}`;
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

function chatMetadataContextToResponsesText(metadata: unknown): string {
  if (!isRecord(metadata)) return "";
  const notes = Object.keys(metadata)
    .filter((field) => field !== "user_id")
    .filter((field) => !isSensitiveMetadataField(field))
    .map((field) => `${field}=${stringifyCompact(metadata[field])}`);
  return notes.length
    ? `OpenAI Chat metadata preserved for Responses: ${notes.join(" ")}`
    : "";
}

function isSensitiveMetadataField(field: string): boolean {
  return /(?:authorization|token|secret|api[_-]?key|headers?)/i.test(field);
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
      const text = responseContentPartText(part);
      if (text) return text;
      return stringOrNull(part.type)
        ? `OpenAI Responses unrecognized message content part for Chat: ${stringifyCompact(part)}`
        : "";
    })
    .filter(Boolean)
    .join("");
}

function responseContentPartText(part: JsonRecord): string {
  return stringOrNull(part.text)
    || stringOrNull(part.output_text)
    || stringOrNull(part.refusal)
    || stringOrNull(part.transcript)
    || "";
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
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}

function serviceTierFromUsage(usage: unknown): string | null {
  return isRecord(usage) ? stringOrNull(usage.service_tier) : null;
}

function copyServiceTier(value: unknown, target: JsonRecord): void {
  const serviceTier = stringOrNull(value);
  if (serviceTier) target.service_tier = serviceTier;
}

function copyServerToolUse(source: JsonRecord, target: JsonRecord): void {
  if (isRecord(source.server_tool_use)) target.server_tool_use = { ...source.server_tool_use };
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

function chatToolOutputToResponsesOutput(content: unknown): string | JsonRecord[] {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    const outputPartsByInput = content.map(chatToolOutputPartToResponsesOutputParts);
    if (outputPartsByInput.every((parts) => parts.length > 0)) return outputPartsByInput.flat();
    const text = content.map(chatContentPartToText).filter(Boolean).join("");
    return content.every(chatContentPartIsTextLike) ? text : stringifyCompact(content);
  }
  const outputParts = chatToolOutputPartToResponsesOutputParts(content);
  if (outputParts.length) return outputParts;
  const text = chatContentPartToText(content);
  return text || stringifyCompact(content);
}

function chatToolOutputPartToResponsesOutputParts(part: unknown): JsonRecord[] {
  if (typeof part === "string") return part ? [{ type: "input_text", text: part }] : [];
  if (!isRecord(part)) return [];
  const type = stringOrNull(part.type);
  if (type === "text" || type === "input_text" || type === "output_text" || type === "refusal") {
    const text = chatContentPartToText(part);
    return text ? withChatToolOutputCacheControlNote([{ type: "input_text", text }], part) : [];
  }
  if (type === "image_url" && isRecord(part.image_url)) {
    const imageUrl = stringOrNull(part.image_url.url);
    if (!imageUrl) return [];
    const imagePart: JsonRecord = { type: "input_image", image_url: imageUrl };
    const detail = stringOrNull(part.image_url.detail) || stringOrNull(part.detail);
    if (detail) imagePart.detail = detail;
    return withChatToolOutputCacheControlNote([imagePart], part);
  }
  if (type === "input_image") {
    const imagePart = chatInputImagePartToResponsesInputImage(part);
    return imagePart ? withChatToolOutputCacheControlNote([imagePart], part) : [];
  }
  if (type === "file" || type === "input_file") return chatToolOutputFilePartToResponsesOutputParts(part);
  const text = chatContentPartToText(part);
  return text ? withChatToolOutputCacheControlNote([{ type: "input_text", text }], part) : [];
}

function withChatToolOutputCacheControlNote(parts: JsonRecord[], part: JsonRecord): JsonRecord[] {
  if (part.cache_control === undefined) return parts;
  return [
    ...parts,
    {
      type: "input_text",
      text: `OpenAI Chat tool output cache_control preserved for Responses: ${stringifyCompact(part.cache_control)}`,
    },
  ];
}

function chatToolOutputFilePartToResponsesOutputParts(part: JsonRecord): JsonRecord[] {
  const filePart = chatFilePartToResponsesInputFile(part);
  if (!filePart) return [];
  const file = isRecord(part.file) ? part.file : part;
  const mediaType = stringOrNull(file.media_type) || stringOrNull(file.mime_type);
  const parts: JsonRecord[] = [filePart];
  if (mediaType) {
    parts.push({
      type: "input_text",
      text: `OpenAI Chat file media_type preserved for Responses tool output: ${mediaType}`,
    });
  }
  return withChatToolOutputCacheControlNote(parts, part);
}

function chatContentPartIsTextLike(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (!isRecord(part)) return false;
  const type = stringOrNull(part.type);
  if (type === null) return Boolean(chatContentPartToText(part));
  return type === "text"
    || type === "input_text"
    || type === "output_text"
    || type === "refusal"
    || Boolean(chatContentPartToText(part));
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
    || stringOrNull(part.transcript)
    || chatContentPartAudioTranscript(part)
    || "";
}

function chatContentPartAudioTranscript(part: JsonRecord): string {
  const inputAudio = isRecord(part.input_audio) ? stringOrNull(part.input_audio.transcript) : null;
  if (inputAudio) return inputAudio;
  const outputAudio = isRecord(part.output_audio) ? stringOrNull(part.output_audio.transcript) : null;
  return outputAudio || "";
}

function copyScalarFields(source: JsonRecord, target: JsonRecord, fields: string[]): void {
  for (const field of fields) {
    if (source[field] !== undefined) target[field] = source[field];
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function verbosityOrNull(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
