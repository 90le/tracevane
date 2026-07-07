import {
  applyAnthropicReasoningOptions,
  mapReasoningEffort,
  reasoningEffort,
  reasoningEffortOrThinkingBudget,
} from "./reasoning-options.js";

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
  stream: boolean;
  legacyFunctionCalls: boolean;
}

export interface AnthropicChatRequestAdapterResult {
  chatRequest: JsonRecord;
  model: string | null;
  stream: boolean;
}

export interface ChatAnthropicRequestAdapterOptions {
  allowStreaming?: boolean;
}

export interface AnthropicChatRequestAdapterOptions {
  preserveContextManagement?: boolean;
  preserveMcpServers?: boolean;
  preserveMetadata?: boolean;
  preserveServiceTier?: boolean;
  preserveToolResultContent?: boolean;
  preserveToolResultError?: boolean;
}

export interface AnthropicChatResponseAdapterOptions {
  legacyFunctionCalls?: boolean;
}

export interface ChatAnthropicResponseAdapterOptions {
  stopSequences?: Iterable<string>;
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

export function isAnthropicMessagesToChatAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return decision.routeId === "anthropic_messages"
    && decision.provider?.apiFormat === "openai_chat";
}

export function isAnthropicMessagesToOpenAIResponsesAdapterTarget(decision: {
  routeId: string | null;
  provider: { apiFormat: string } | null;
}): boolean {
  return decision.routeId === "anthropic_messages"
    && decision.provider?.apiFormat === "openai_responses";
}

export function isAnthropicMessagesStreamingRequest(bodyText: string | undefined): boolean {
  try {
    return parseJsonObject(
      bodyText,
      "model_gateway_anthropic_chat",
      "Anthropic Messages to OpenAI Chat adapter",
    ).stream === true;
  } catch {
    return false;
  }
}

export function ensureAnthropicMessagesHeaders(headers: Headers): void {
  if (!headers.has("anthropic-version")) {
    headers.set("anthropic-version", DEFAULT_ANTHROPIC_VERSION);
  }
}

export function adaptChatCompletionRequestToAnthropicMessages(
  bodyText: string | undefined,
  options: ChatAnthropicRequestAdapterOptions = {},
): ChatAnthropicRequestAdapterResult {
  const request = parseJsonObject(
    bodyText,
    "model_gateway_chat_anthropic",
    "OpenAI Chat to Anthropic Messages adapter",
  );
  const stream = request.stream === true;
  if (stream && !options.allowStreaming) {
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

  const anthropicMessages = mapChatMessagesToAnthropic(request.messages);
  const unsupportedToolsText = chatUnsupportedToolsToAnthropicText(request.tools);
  if (unsupportedToolsText) anthropicMessages.push({ role: "user", content: unsupportedToolsText });
  const rawToolChoice = request.tool_choice !== undefined
    ? request.tool_choice
    : mapLegacyChatFunctionCallToToolChoice(request.function_call);
  const unsupportedToolChoiceText = chatUnsupportedToolChoiceToAnthropicText(rawToolChoice, {
    tools: request.tools,
    functions: request.functions,
    webSearchOptions: request.web_search_options,
  });
  if (unsupportedToolChoiceText) anthropicMessages.push({ role: "user", content: unsupportedToolChoiceText });
  const unsupportedResponseFormatText = chatUnsupportedResponseFormatToAnthropicText(request.response_format);
  if (unsupportedResponseFormatText) anthropicMessages.push({ role: "user", content: unsupportedResponseFormatText });
  const unsupportedRequestControlsText = chatUnsupportedRequestControlsToAnthropicText(request);
  if (unsupportedRequestControlsText) anthropicMessages.push({ role: "user", content: unsupportedRequestControlsText });
  const metadataContextText = chatMetadataContextToAnthropicText(request.metadata);
  if (metadataContextText) anthropicMessages.push({ role: "user", content: metadataContextText });

  const anthropicRequest: JsonRecord = {
    model,
    max_tokens: numberOrNull(request.max_completion_tokens)
      ?? numberOrNull(request.max_tokens)
      ?? 1024,
    messages: anthropicMessages,
  };
  if (stream) anthropicRequest.stream = true;

  const system = extractSystemPrompt(request.messages);
  if (system) anthropicRequest.system = system;

  copyScalarFields(request, anthropicRequest, [
    "temperature",
    "top_p",
    "service_tier",
  ]);
  const metadata = mapOpenAIChatMetadataToAnthropicMetadata(request.metadata, request.user);
  if (metadata) anthropicRequest.metadata = metadata;
  const verbosity = verbosityOrNull(request.verbosity);
  if (verbosity) anthropicRequest.verbosity = verbosity;

  if (request.stop !== undefined) anthropicRequest.stop_sequences = request.stop;
  const outputFormat = mapChatResponseFormatToAnthropicOutputFormat(request.response_format);
  if (outputFormat !== undefined) anthropicRequest.output_config = { format: outputFormat };

  const tools = [
    ...mapChatToolsToAnthropic(request.tools),
    ...mapChatFunctionsToAnthropic(request.functions),
  ];
  mergeChatWebSearchOptionsIntoAnthropicTools(tools, request.web_search_options);
  if (tools.length) anthropicRequest.tools = tools;

  const toolChoice = applyChatParallelToolChoiceToAnthropic(
    mapChatToolChoiceToAnthropic(
      rawToolChoice,
      { tools: request.tools, functions: request.functions, webSearchOptions: request.web_search_options },
    ),
    request.parallel_tool_calls,
  );
  if (toolChoice !== undefined) anthropicRequest.tool_choice = toolChoice;

  applyAnthropicReasoningOptions(anthropicRequest, request);

  return { anthropicRequest, model, stream, legacyFunctionCalls: usesLegacyChatFunctions(request) };
}

export function adaptAnthropicMessagesRequestToChatCompletion(
  bodyText: string | undefined,
  options: AnthropicChatRequestAdapterOptions = {},
): AnthropicChatRequestAdapterResult {
  const request = parseJsonObject(
    bodyText,
    "model_gateway_anthropic_chat",
    "Anthropic Messages to OpenAI Chat adapter",
  );
  const model = stringOrNull(request.model);
  if (!model) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_anthropic_chat_model_required",
      "Anthropic Messages to OpenAI Chat adapter requires a model.",
      400,
    );
  }

  const messages = mapAnthropicMessagesToChat(request, options);
  if (!options.preserveMcpServers) {
    messages.push(...mapAnthropicMcpServersToChatContextMessages(request.mcp_servers, request.tools));
  }
  const unsupportedToolContextText = anthropicUnsupportedToolContextToChatText(request.tools);
  if (unsupportedToolContextText) messages.push({ role: "user", content: unsupportedToolContextText });
  const unsupportedRequestContextText = anthropicUnsupportedRequestContextToChatText(request, options);
  if (unsupportedRequestContextText) messages.push({ role: "user", content: unsupportedRequestContextText });
  const metadataContextText = anthropicMetadataContextToChatText(request.metadata);
  if (metadataContextText) messages.push({ role: "user", content: metadataContextText });
  const unsupportedOutputFormatText = anthropicUnsupportedOutputFormatToChatText(request.output_config);
  if (unsupportedOutputFormatText) messages.push({ role: "user", content: unsupportedOutputFormatText });
  const chatRequest: JsonRecord = {
    model,
    messages,
    stream: request.stream === true,
  };

  applyAnthropicMaxTokensToChat(chatRequest, request);
  if (request.stop_sequences !== undefined) chatRequest.stop = request.stop_sequences;

  copyScalarFields(request, chatRequest, [
    "temperature",
    "top_p",
  ]);
  const verbosity = verbosityOrNull(request.verbosity);
  if (verbosity) chatRequest.verbosity = verbosity;
  const responseFormat = mapAnthropicOutputConfigToChatResponseFormat(request.output_config);
  if (responseFormat !== undefined) chatRequest.response_format = responseFormat;
  if (options.preserveMetadata && request.metadata !== undefined) chatRequest.metadata = request.metadata;
  const metadataUserId = anthropicMetadataUserId(request.metadata);
  if (metadataUserId && chatRequest.user === undefined) chatRequest.user = metadataUserId;
  if (options.preserveServiceTier) {
    const serviceTier = mapAnthropicServiceTierToOpenAI(request.service_tier);
    if (serviceTier) chatRequest.service_tier = serviceTier;
  }
  if (options.preserveContextManagement && request.context_management !== undefined) {
    chatRequest.context_management = request.context_management;
  }

  const tools = mapAnthropicToolsToChat(request.tools);
  if (options.preserveMcpServers) tools.push(...mapAnthropicMcpServersToResponsesTools(request.mcp_servers, request.tools));
  if (tools.length) chatRequest.tools = tools;

  const toolChoice = mapAnthropicToolChoiceToChat(
    request.tool_choice,
    options.preserveMcpServers
      ? { mcpServers: request.mcp_servers, mcpToolsets: request.tools, chatTools: tools }
      : undefined,
  );
  if (toolChoice !== undefined) chatRequest.tool_choice = toolChoice;

  const parallelToolCalls = mapAnthropicParallelToolUseToChat(request.tool_choice);
  if (parallelToolCalls !== undefined) chatRequest.parallel_tool_calls = parallelToolCalls;

  const effort = reasoningEffortOrThinkingBudget(request);
  const mappedEffort = effort ? mapReasoningEffort(effort, "passthrough") : null;
  if (mappedEffort) chatRequest.reasoning_effort = mappedEffort;

  return {
    chatRequest,
    model,
    stream: request.stream === true,
  };
}

export function adaptAnthropicMessagesResponseToChatCompletion(
  response: unknown,
  fallbackModel: string | null,
  options: AnthropicChatResponseAdapterOptions = {},
): JsonRecord {
  if (!isRecord(response)) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_anthropic_chat_response_invalid",
      "Anthropic Messages upstream returned a non-object response.",
      502,
    );
  }

  const content = Array.isArray(response.content) ? response.content : [];
  const reasoningText = content
    .map((part) => isRecord(part) && part.type === "thinking" ? stringOrNull(part.thinking) : null)
    .filter((part): part is string => Boolean(part))
    .join("");
  const reasoningDetails = anthropicThinkingBlocksToChatReasoningDetails(content);
  const mcpToolBlocks = anthropicMcpToolBlocks(content);
  const text = content
    .map((part) => isRecord(part) && part.type === "text" ? stringOrNull(part.text) : null)
    .filter((part): part is string => Boolean(part))
    .join("");
  const toolCalls = content
    .map(mapAnthropicToolUseToChatToolCall)
    .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
  const malformedToolUseText = content
    .map(anthropicMalformedToolUseToChatText)
    .filter(Boolean)
    .join("\n");
  const unknownContentBlockText = content
    .map(anthropicUnknownContentBlockToChatText)
    .filter(Boolean)
    .join("\n");
  const messageText = [text, malformedToolUseText, unknownContentBlockText].filter(Boolean).join("\n");
  const message: JsonRecord = {
    role: "assistant",
    content: messageText || (toolCalls.length ? null : ""),
  };
  if (response.stop_reason === "refusal") message.refusal = text || "";
  if (reasoningText) message.reasoning_content = reasoningText;
  if (reasoningDetails.length) message.reasoning_details = reasoningDetails;
  if (mcpToolBlocks.length) message.mcp_tool_blocks = mcpToolBlocks;
  const annotations = collectAnthropicTextCitations(content);
  if (annotations.length) message.annotations = annotations;
  const legacyFunctionCall = options.legacyFunctionCalls ? chatToolCallToLegacyFunctionCall(toolCalls[0]) : null;
  if (legacyFunctionCall) {
    message.function_call = legacyFunctionCall;
  } else if (toolCalls.length) {
    message.tool_calls = toolCalls;
  }

  const created = Math.floor(Date.now() / 1_000);
  const model = stringOrNull(response.model) || fallbackModel;
  const chatCompletion: JsonRecord = {
    id: stringOrNull(response.id) || `chatcmpl_${Date.now().toString(36)}`,
    object: "chat.completion",
    created,
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: mapAnthropicStopReasonToChat(response.stop_reason, toolCalls.length > 0, Boolean(legacyFunctionCall)),
    }],
    usage: mapAnthropicUsageToChat(response.usage),
  };
  const serviceTier = serviceTierFromUsage(response.usage);
  if (serviceTier) chatCompletion.service_tier = serviceTier;
  return chatCompletion;
}

export function adaptChatCompletionResponseToAnthropicMessages(
  response: unknown,
  fallbackModel: string | null,
  options: ChatAnthropicResponseAdapterOptions = {},
): JsonRecord {
  if (!isRecord(response)) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_chat_anthropic_response_invalid",
      "OpenAI Chat upstream returned a non-object response.",
      502,
    );
  }

  const choice = firstChoice(response);
  const message = isRecord(choice?.message) ? choice.message : {};
  const stopResult = truncateAtStopSequence(chatMessageText(message), options.stopSequences);
  const text = stopResult.text;
  const toolUses = Array.isArray(message.tool_calls)
    ? message.tool_calls
      .map(mapChatToolCallToAnthropicToolUse)
      .filter((toolUse): toolUse is JsonRecord => Boolean(toolUse))
    : [];
  const legacyFunctionToolUse = mapLegacyChatFunctionCallMessageToAnthropic(message.function_call);
  if (legacyFunctionToolUse) toolUses.push(legacyFunctionToolUse);
  const content: JsonRecord[] = [];
  const reasoningBlocks = chatReasoningDetailsToAnthropicBlocks(message.reasoning_details);
  if (reasoningBlocks.length) {
    content.push(...reasoningBlocks);
  } else {
    const reasoningText = extractChatReasoningText(message);
    if (reasoningText) content.push({ type: "thinking", thinking: reasoningText });
  }
  content.push(...chatMcpToolBlocksToAnthropicBlocks(message.mcp_tool_blocks));
  if (text) {
    const textBlock: JsonRecord = { type: "text", text };
    if (Array.isArray(message.annotations) && message.annotations.length) {
      const citations = message.annotations.filter(isRecord).map(mapChatAnnotationToAnthropicCitation);
      if (citations.length) textBlock.citations = citations;
    }
    content.push(textBlock);
  }
  const additionalChoicesText = chatAdditionalChoicesToAnthropicText(response);
  if (additionalChoicesText) content.push({ type: "text", text: additionalChoicesText });
  content.push(...toolUses);

  return {
    id: stringOrNull(response.id) || `msg_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    model: stringOrNull(response.model) || fallbackModel,
    content,
    stop_reason: stopResult.stopSequence
      ? "stop_sequence"
      : mapChatFinishReasonToAnthropic(choice?.finish_reason, toolUses.length > 0),
    stop_sequence: stopResult.stopSequence,
    usage: mapChatUsageToAnthropic(response.usage, response.service_tier),
  };
}

function chatAdditionalChoicesToAnthropicText(response: JsonRecord): string {
  if (!Array.isArray(response.choices) || response.choices.length <= 1) return "";
  return response.choices
    .slice(1)
    .filter(isRecord)
    .map((choice) => `OpenAI Chat additional choice preserved for Anthropic Messages: ${stringifyCompact(choice)}`)
    .join("\n");
}

function mapChatAnnotationToAnthropicCitation(annotation: JsonRecord): JsonRecord {
  if (annotation.type === "url_citation") {
    const mapped: JsonRecord = { type: "web_search_result_location" };
    if (annotation.url !== undefined) mapped.url = annotation.url;
    if (annotation.title !== undefined) mapped.title = annotation.title;
    if (annotation.start_index !== undefined) mapped.start_char_index = annotation.start_index;
    if (annotation.end_index !== undefined) mapped.end_char_index = annotation.end_index;
    return { ...annotation, ...mapped };
  }
  if (annotation.type === "file_citation" || annotation.type === "container_file_citation") {
    const mapped: JsonRecord = { type: "page_location" };
    if (annotation.file_id !== undefined) mapped.file_id = annotation.file_id;
    if (annotation.filename !== undefined) mapped.document_title = annotation.filename;
    if (annotation.index !== undefined) mapped.document_index = annotation.index;
    return { ...annotation, ...mapped };
  }
  return { ...annotation };
}

function collectAnthropicTextCitations(content: JsonRecord[]): JsonRecord[] {
  let textIndex = 0;
  return content.flatMap((part): JsonRecord[] => {
    if (part.type !== "text") return [];
    const contentIndex = textIndex;
    textIndex += 1;
    if (!Array.isArray(part.citations)) return [];
    return part.citations
      .filter(isRecord)
      .map((citation) => ({ ...mapAnthropicCitationToChatAnnotation(citation), content_index: contentIndex }));
  });
}

function mapAnthropicCitationToChatAnnotation(citation: JsonRecord): JsonRecord {
  if (citation.type === "web_search_result_location") {
    return withoutUndefined({
      ...stripCitationTransportFields(citation),
      type: "url_citation",
      url: citation.url,
      title: citation.title,
      start_index: citation.start_char_index,
      end_index: citation.end_char_index,
    });
  }
  if (citation.type === "page_location" || citation.type === "char_location" || citation.type === "content_block_location") {
    return withoutUndefined({
      ...stripCitationTransportFields(citation),
      type: "file_citation",
      file_id: citation.file_id,
      filename: citation.document_title,
      index: citation.document_index,
      start_index: citation.start_char_index,
      end_index: citation.end_char_index,
    });
  }
  return { ...citation };
}

function stripCitationTransportFields(citation: JsonRecord): JsonRecord {
  const {
    start_char_index: _startCharIndex,
    end_char_index: _endCharIndex,
    document_title: _documentTitle,
    document_index: _documentIndex,
    ...rest
  } = citation;
  return rest;
}

function withoutUndefined(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function anthropicThinkingBlocksToChatReasoningDetails(content: JsonRecord[]): JsonRecord[] {
  return content.flatMap((part): JsonRecord[] => {
    if (part.type === "thinking" && stringOrNull(part.thinking) && stringOrNull(part.signature)) return [{ ...part }];
    if (part.type === "redacted_thinking" && stringOrNull(part.data)) return [{ ...part }];
    return [];
  });
}

function anthropicMcpToolBlocks(content: JsonRecord[]): JsonRecord[] {
  return content.flatMap((part): JsonRecord[] => {
    if (part.type === "mcp_tool_use") {
      const id = stringOrNull(part.id);
      const name = stringOrNull(part.name);
      const serverName = stringOrNull(part.server_name) || stringOrNull(part.server_label);
      if (!id || !name || !serverName) return [];
      return [{
        type: "mcp_tool_use",
        id,
        name,
        server_name: serverName,
        input: isRecord(part.input) || Array.isArray(part.input) ? part.input : {},
      }];
    }
    if (part.type === "mcp_tool_result") {
      const toolUseId = stringOrNull(part.tool_use_id);
      if (!toolUseId) return [];
      return [{
        type: "mcp_tool_result",
        tool_use_id: toolUseId,
        is_error: part.is_error === true,
        content: anthropicMcpResultContent(part.content),
      }];
    }
    return [];
  });
}

function anthropicMcpResultContent(content: unknown): unknown {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.filter(isRecord);
  if (isRecord(content)) return [content];
  return [];
}

function chatMcpToolBlocksToAnthropicBlocks(blocks: unknown): JsonRecord[] {
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((block): JsonRecord[] => {
    if (!isRecord(block)) return [];
    if (block.type === "mcp_tool_use") {
      const id = stringOrNull(block.id);
      const name = stringOrNull(block.name);
      const serverName = stringOrNull(block.server_name) || stringOrNull(block.server_label);
      if (!id || !name || !serverName) return [];
      return [{
        type: "mcp_tool_use",
        id,
        name,
        server_name: serverName,
        input: isRecord(block.input) || Array.isArray(block.input) ? block.input : {},
      }];
    }
    if (block.type === "mcp_tool_result") {
      const toolUseId = stringOrNull(block.tool_use_id);
      if (!toolUseId) return [];
      return [{
        type: "mcp_tool_result",
        tool_use_id: toolUseId,
        is_error: block.is_error === true,
        content: anthropicMcpResultContent(block.content),
      }];
    }
    return [];
  });
}

function parseJsonObject(bodyText: string | undefined, codePrefix: string, context: string): JsonRecord {
  if (!bodyText || !bodyText.trim()) {
    throw new AnthropicMessagesChatAdapterError(
      `${codePrefix}_body_required`,
      `${context} requires a JSON request body.`,
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
    `${codePrefix}_body_invalid`,
    `${context} requires a JSON object request body.`,
    400,
  );
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
    const toolUseId = stringOrNull(message.tool_call_id) || stringOrNull(message.id);
    if (!toolUseId) return [chatMessageContextToAnthropic(
      "OpenAI Chat tool message missing tool_call_id for Anthropic Messages",
      message,
    )];
    return [{
      role: "user",
      content: [chatToolResultMessageToAnthropicBlock(toolUseId, message)],
    }];
  }
  if (message.role === "function") {
    const name = stringOrNull(message.name);
    if (!name) return [chatMessageContextToAnthropic(
      "OpenAI Chat function message missing name for Anthropic Messages",
      message,
    )];
    return [{
      role: "user",
      content: [chatToolResultMessageToAnthropicBlock(legacyFunctionCallId(name), message)],
    }];
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  const content = chatMessageContentToAnthropicBlocks(message);
  return [{ role, content: content.length === 1 && content[0]?.type === "text" ? content[0].text : content }];
}

function chatMessageContextToAnthropic(label: string, value: unknown, role = "user"): JsonRecord {
  const mappedRole = role === "assistant" ? "assistant" : "user";
  return {
    role: mappedRole,
    content: `${label}: ${stringifyCompact(value)}`,
  };
}

function chatToolResultMessageToAnthropicBlock(toolUseId: string, message: JsonRecord): JsonRecord {
  const block: JsonRecord = {
    type: "tool_result",
    tool_use_id: toolUseId,
    content: chatToolResultContentToAnthropicContent(message.content),
  };
  if (message.is_error === true) block.is_error = true;
  return block;
}

function chatMessageContentToAnthropicBlocks(message: JsonRecord): JsonRecord[] {
  const blocks = [
    ...chatReasoningDetailsToAnthropicBlocks(message.reasoning_details),
    ...chatContentToAnthropicBlocks(message.content),
  ];
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const mapped = mapChatToolCallToAnthropicToolUse(toolCall);
      if (mapped) {
        blocks.push(mapped);
      } else {
        blocks.push({
          type: "text",
          text: `OpenAI Chat malformed tool_call for Anthropic Messages: ${stringifyCompact(toolCall)}`,
        });
      }
    }
  }
  const legacyFunctionCall = mapLegacyChatFunctionCallMessageToAnthropic(message.function_call);
  if (legacyFunctionCall) blocks.push(legacyFunctionCall);
  else if (message.function_call !== undefined) {
    blocks.push({
      type: "text",
      text: `OpenAI Chat malformed function_call for Anthropic Messages: ${stringifyCompact(message.function_call)}`,
    });
  }
  return blocks.length ? blocks : [{ type: "text", text: "" }];
}

function chatReasoningDetailsToAnthropicBlocks(details: unknown): JsonRecord[] {
  if (!Array.isArray(details)) return [];
  return details.flatMap((detail): JsonRecord[] => {
    if (!isRecord(detail)) return [];
    if (detail.type === "thinking" && stringOrNull(detail.thinking) && stringOrNull(detail.signature)) return [{ ...detail }];
    if (detail.type === "redacted_thinking" && stringOrNull(detail.data)) return [{ ...detail }];
    return [];
  });
}

function chatToolResultContentToAnthropicContent(content: unknown): string | JsonRecord[] {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    const text = content.map(chatContentPartToText).filter(Boolean).join("");
    if (content.every(chatContentPartIsTextLike)) return text;
    const blocks = content
      .map(chatContentPartToAnthropicToolResultBlock)
      .filter((block): block is JsonRecord => Boolean(block));
    return blocks.length === content.length ? blocks : stringifyCompact(content);
  }
  const text = chatContentPartToText(content);
  return text || stringifyCompact(content);
}

function chatContentPartToAnthropicToolResultBlock(part: unknown): JsonRecord | null {
  if (typeof part === "string") return part ? { type: "text", text: part } : null;
  if (!isRecord(part)) return null;
  const type = stringOrNull(part.type);
  if (type === "text" || type === "input_text" || type === "output_text" || type === "refusal") {
    const text = chatContentPartToText(part);
    return text ? { type: "text", text } : null;
  }
  if (type === "image_url" && isRecord(part.image_url)) {
    return imageUrlToAnthropicBlock(stringOrNull(part.image_url.url));
  }
  if (type === "input_image") {
    return imageUrlToAnthropicBlock(stringOrNull(part.image_url));
  }
  const text = chatContentPartToText(part);
  return text ? { type: "text", text } : null;
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
    if (type === "text" || type === "input_text" || type === "output_text" || type === "refusal") {
      const text = chatContentPartToText(part);
      blocks.push({ type: "text", text: text || chatContentPartFallbackToAnthropicText(part) });
      continue;
    }
    if (type === "image_url") {
      const imageUrl = isRecord(part.image_url) ? stringOrNull(part.image_url.url) : null;
      const image = imageUrlToAnthropicBlock(imageUrl);
      blocks.push(image || { type: "text", text: chatContentPartFallbackToAnthropicText(part) });
      continue;
    }
    if (type === "file" || type === "input_file") {
      const document = chatFilePartToAnthropicDocument(part);
      blocks.push(document || { type: "text", text: chatContentPartFallbackToAnthropicText(part) });
      continue;
    }
    if (type) {
      const text = chatContentPartToText(part);
      blocks.push({ type: "text", text: text || chatContentPartFallbackToAnthropicText(part) });
    }
  }
  return blocks;
}

function chatContentPartFallbackToAnthropicText(part: JsonRecord): string {
  return `OpenAI Chat unrecognized content part for Anthropic Messages: ${stringifyCompact(part)}`;
}

function chatFilePartToAnthropicDocument(part: JsonRecord): JsonRecord | null {
  const file = isRecord(part.file) ? part.file : part;
  const fileId = stringOrNull(file.file_id);
  const fileUrl = stringOrNull(file.file_url) || stringOrNull(file.url);
  const fileData = stringOrNull(file.file_data) || stringOrNull(file.data);
  const filename = stringOrNull(file.filename) || stringOrNull(file.name);
  let source: JsonRecord | null = null;
  if (fileId) source = { type: "file", file_id: fileId };
  else if (fileUrl) source = { type: "url", url: fileUrl };
  else if (fileData) {
    source = {
      type: "base64",
      media_type: stringOrNull(file.media_type) || stringOrNull(file.mime_type) || "application/octet-stream",
      data: stripDataUrlPrefix(fileData),
    };
  }
  if (!source) return null;
  const document: JsonRecord = { type: "document", source };
  if (filename) document.title = filename;
  return document;
}

function stripDataUrlPrefix(value: string): string {
  const match = /^data:[^;,]+;base64,(.+)$/u.exec(value);
  return match ? match[1] : value;
}

function imageUrlToAnthropicBlock(url: string | null): JsonRecord | null {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return {
      type: "image",
      source: { type: "url", url },
    };
  }
  if (!url.startsWith("data:")) return null;
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

function mapChatFunctionsToAnthropic(functions: unknown): JsonRecord[] {
  if (!Array.isArray(functions)) return [];
  return functions.flatMap((fn) => {
    if (!isRecord(fn)) return [];
    const name = stringOrNull(fn.name);
    if (!name) return [];
    const mapped: JsonRecord = {
      name,
      input_schema: isRecord(fn.parameters) ? fn.parameters : {},
    };
    const description = descriptionWithOpenAIStrictMode(fn.description, fn.strict);
    if (description) mapped.description = description;
    return [mapped];
  });
}

function mapChatToolToAnthropic(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (isOpenAIWebSearchToolType(tool.type)) {
    const mapped: JsonRecord = {
      type: "web_search_20250305",
      name: "web_search",
    };
    copyScalarFields(tool, mapped, [
      "allowed_callers",
      "allowed_domains",
      "blocked_domains",
      "defer_loading",
      "max_uses",
      "strict",
      "user_location",
    ]);
    return mapped;
  }
  if (tool.type === "custom") return mapChatCustomToolToAnthropic(tool);
  if (tool.type !== "function") return null;
  const fn = isRecord(tool.function) ? tool.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;

  const mapped: JsonRecord = {
    name,
    input_schema: isRecord(fn.parameters) ? fn.parameters : {},
  };
  const description = descriptionWithOpenAIStrictMode(fn.description, fn.strict);
  if (description) mapped.description = description;
  return mapped;
}

function mergeChatWebSearchOptionsIntoAnthropicTools(tools: JsonRecord[], webSearchOptions: unknown): void {
  const mappedOptions = mapChatWebSearchOptionsToAnthropicTool(webSearchOptions);
  if (!mappedOptions) return;
  const existing = tools.find((tool) => isAnthropicWebSearchTool(tool));
  if (!existing) {
    tools.push(mappedOptions);
    return;
  }
  if (existing.user_location === undefined && mappedOptions.user_location !== undefined) {
    existing.user_location = mappedOptions.user_location;
  }
}

function mapChatWebSearchOptionsToAnthropicTool(webSearchOptions: unknown): JsonRecord | null {
  if (!isRecord(webSearchOptions)) return null;
  const mapped: JsonRecord = {
    type: "web_search_20250305",
    name: "web_search",
  };
  const userLocation = mapChatWebSearchLocationToAnthropic(webSearchOptions.user_location);
  if (userLocation !== undefined) mapped.user_location = userLocation;
  return mapped;
}

function mapChatWebSearchLocationToAnthropic(userLocation: unknown): unknown {
  if (!isRecord(userLocation)) return userLocation;
  if (userLocation.type === "approximate" && userLocation.approximate !== undefined) {
    const approximate = userLocation.approximate;
    if (!isRecord(approximate)) return userLocation;
    return { type: "approximate", ...approximate };
  }
  return userLocation;
}

function mapChatCustomToolToAnthropic(tool: JsonRecord): JsonRecord | null {
  const source = isRecord(tool.function) ? tool.function : tool;
  const name = stringOrNull(source.name);
  if (!name) return null;
  const mapped: JsonRecord = {
    name,
    input_schema: {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    },
  };
  const description = descriptionWithOpenAIStrictMode(source.description, source.strict);
  if (description) mapped.description = description;
  return mapped;
}

function descriptionWithOpenAIStrictMode(description: unknown, strict: unknown): string | null {
  const parts: string[] = [];
  if (typeof description === "string" && description.trim()) parts.push(description);
  if (typeof strict === "boolean") {
    parts.push(`OpenAI strict function-calling mode requested: ${strict}.`);
  }
  return parts.length ? parts.join(" ") : null;
}

function mapLegacyChatFunctionCallToToolChoice(functionCall: unknown): unknown {
  if (functionCall === undefined) return undefined;
  if (functionCall === "auto" || functionCall === "none") return functionCall;
  if (!isRecord(functionCall)) return functionCall;
  const name = stringOrNull(functionCall.name);
  return name ? { type: "function", name } : functionCall;
}

function mapChatToolChoiceToAnthropic(
  toolChoice: unknown,
  context: { tools?: unknown; functions?: unknown; webSearchOptions?: unknown } = {},
): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return { type: toolChoice };
  if (toolChoice === "required") return chatAnthropicCompatibleToolCount(context) > 0 ? { type: "any" } : undefined;
  if (!isRecord(toolChoice)) return undefined;
  if (isOpenAIWebSearchToolType(toolChoice.type)) {
    return chatOpenAIWebSearchAvailable(context) ? { type: "tool", name: "web_search" } : undefined;
  }
  if (toolChoice.type === "function") {
    const name = (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null)
      || stringOrNull(toolChoice.name);
    return name && chatToolChoiceFunctionNameAvailable(name, context) ? { type: "tool", name } : undefined;
  }
  if (toolChoice.type === "custom") {
    const name = (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null)
      || stringOrNull(toolChoice.name);
    return name && chatToolChoiceCustomNameAvailable(name, context.tools) ? { type: "tool", name } : undefined;
  }
  if (toolChoice.type === "tool") {
    const name = stringOrNull(toolChoice.name);
    if (name === "web_search" && chatOpenAIWebSearchAvailable(context)) return { type: "tool", name: "web_search" };
    return name && chatToolChoiceFunctionNameAvailable(name, context) ? { type: "tool", name } : undefined;
  }
  return undefined;
}

function isOpenAIWebSearchToolType(type: unknown): boolean {
  return type === "web_search_preview" || type === "web_search_preview_2025_03_11";
}

function chatUnsupportedToolsToAnthropicText(tools: unknown): string {
  if (!Array.isArray(tools)) return "";
  const unsupported = tools.filter((tool) => isRecord(tool) && !mapChatToolToAnthropic(tool));
  if (!unsupported.length) return "";
  return `OpenAI Chat unsupported tools for Anthropic Messages: ${stringifyCompact(unsupported)}`;
}

function chatUnsupportedToolChoiceToAnthropicText(
  toolChoice: unknown,
  context: { tools?: unknown; functions?: unknown; webSearchOptions?: unknown } = {},
): string {
  if (toolChoice === undefined) return "";
  if (mapChatToolChoiceToAnthropic(toolChoice, context) !== undefined) return "";
  return `OpenAI Chat unsupported tool_choice for Anthropic Messages: ${stringifyCompact(toolChoice)}`;
}

function chatUnsupportedResponseFormatToAnthropicText(responseFormat: unknown): string {
  if (responseFormat === undefined) return "";
  if (mapChatResponseFormatToAnthropicOutputFormat(responseFormat) !== undefined) return "";
  return `OpenAI Chat unsupported response_format for Anthropic Messages: ${stringifyCompact(responseFormat)}`;
}

function chatMetadataContextToAnthropicText(metadata: unknown): string {
  if (!isRecord(metadata)) return "";
  const notes = Object.keys(metadata)
    .filter((field) => field !== "user_id")
    .filter((field) => !isSensitiveMetadataField(field))
    .map((field) => `${field}=${stringifyCompact(metadata[field])}`);
  return notes.length
    ? `OpenAI Chat metadata preserved for Anthropic Messages: ${notes.join(" ")}`
    : "";
}

function isSensitiveMetadataField(field: string): boolean {
  return /(?:authorization|token|secret|api[_-]?key|headers?)/i.test(field);
}

function chatUnsupportedRequestControlsToAnthropicText(request: JsonRecord): string {
  const unsupportedFields = [
    "audio",
    "frequency_penalty",
    "logit_bias",
    "logprobs",
    "n",
    "prediction",
    "presence_penalty",
    "prompt_cache_key",
    "prompt_cache_retention",
    "safety_identifier",
    "seed",
    "store",
    "stream_options",
    "tool_resources",
    "web_search_options",
    "extra_body",
    "top_logprobs",
  ];
  const notes = unsupportedFields
    .filter((field) => request[field] !== undefined)
    .map((field) => `${field}=${stringifyCompact(request[field])}`);
  if (request.modalities !== undefined && !chatModalitiesAreTextOnly(request.modalities)) {
    notes.push(`modalities=${stringifyCompact(request.modalities)}`);
  }
  return notes.length
    ? `OpenAI Chat request controls preserved for Anthropic Messages: ${notes.join(" ")}`
    : "";
}


function chatModalitiesAreTextOnly(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((item) => stringOrNull(item)?.toLowerCase() === "text");
}

function chatAnthropicCompatibleToolCount(context: { tools?: unknown; functions?: unknown; webSearchOptions?: unknown }): number {
  const toolsCount = Array.isArray(context.tools)
    ? context.tools.filter((tool) => mapChatToolToAnthropic(tool)).length
    : 0;
  const webSearchOptionsCount = isRecord(context.webSearchOptions) && !chatToolsIncludeOpenAIWebSearch(context.tools) ? 1 : 0;
  const functionsCount = Array.isArray(context.functions)
    ? context.functions.filter((fn) => {
      if (!isRecord(fn)) return false;
      return Boolean(stringOrNull(fn.name));
    }).length
    : 0;
  return toolsCount + webSearchOptionsCount + functionsCount;
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

function chatToolsIncludeOpenAIWebSearch(tools: unknown): boolean {
  return Array.isArray(tools)
    && tools.some((tool) => isRecord(tool) && isOpenAIWebSearchToolType(tool.type));
}

function chatOpenAIWebSearchAvailable(context: { tools?: unknown; webSearchOptions?: unknown }): boolean {
  return chatToolsIncludeOpenAIWebSearch(context.tools) || isRecord(context.webSearchOptions);
}

function applyChatParallelToolChoiceToAnthropic(toolChoice: unknown, parallelToolCalls: unknown): unknown {
  if (parallelToolCalls !== false) return toolChoice;
  const choice = toolChoice === undefined ? { type: "auto" } : toolChoice;
  if (isRecord(choice)) {
    return {
      ...choice,
      disable_parallel_tool_use: true,
    };
  }
  if (choice === "auto" || choice === "none") {
    return { type: choice, disable_parallel_tool_use: true };
  }
  if (choice === "required") {
    return { type: "any", disable_parallel_tool_use: true };
  }
  return choice;
}

function applyAnthropicMaxTokensToChat(chatRequest: JsonRecord, request: JsonRecord): void {
  if (request.max_tokens === undefined) return;
  if (usesModernChatCompletionTokenLimit(chatRequest.model)) {
    chatRequest.max_completion_tokens = request.max_tokens;
  } else {
    chatRequest.max_tokens = request.max_tokens;
  }
}

function usesModernChatCompletionTokenLimit(model: unknown): boolean {
  const name = stringOrNull(model) || "";
  return /^gpt-5(?:\.|-|$|_)/i.test(name) || /^o[1-9](?:\.|-|$|_)/i.test(name);
}

function mapAnthropicMessagesToChat(request: JsonRecord, options: AnthropicChatRequestAdapterOptions = {}): JsonRecord[] {
  const messages: JsonRecord[] = [];
  const system = anthropicSystemToText(request.system);
  if (system) messages.push({ role: "system", content: system });

  if (!Array.isArray(request.messages)) {
    throw new AnthropicMessagesChatAdapterError(
      "model_gateway_anthropic_chat_messages_required",
      "Anthropic Messages to OpenAI Chat adapter requires a messages array.",
      400,
    );
  }

  for (const message of request.messages) {
    messages.push(...mapAnthropicMessageToChat(message, options));
  }

  return messages.length ? messages : [{ role: "user", content: "" }];
}

function mapAnthropicMessageToChat(message: unknown, options: AnthropicChatRequestAdapterOptions = {}): JsonRecord[] {
  if (!isRecord(message)) return [];
  const role = message.role === "assistant" ? "assistant" : "user";
  const blocks = anthropicContentBlocks(message.content);
  if (role === "assistant") {
    const text = blocks
      .filter((block) => block.type === "text")
      .map((block) => stringOrNull(block.text) || "")
      .filter(Boolean)
      .join("");
    const reasoningText = blocks
      .filter((block) => block.type === "thinking")
      .map((block) => stringOrNull(block.thinking) || "")
      .filter(Boolean)
      .join("");
    const reasoningDetails = anthropicThinkingBlocksToChatReasoningDetails(blocks);
    const mcpToolBlocks = anthropicMcpToolBlocks(blocks);
    const toolCalls = blocks
      .filter((block) => block.type === "tool_use")
      .map(mapAnthropicToolUseToChatToolCall)
      .filter((toolCall): toolCall is JsonRecord => Boolean(toolCall));
    const malformedToolUseText = blocks
      .map(anthropicMalformedToolUseToChatText)
      .filter(Boolean)
      .join("\n");
    const unknownContentBlockText = blocks
      .map(anthropicUnknownContentBlockToChatText)
      .filter(Boolean)
      .join("\n");
    const messageText = [text, malformedToolUseText, unknownContentBlockText].filter(Boolean).join("\n");
    const chatMessage: JsonRecord = {
      role,
      content: messageText || (toolCalls.length ? null : ""),
    };
    if (reasoningText) chatMessage.reasoning_content = reasoningText;
    if (reasoningDetails.length) chatMessage.reasoning_details = reasoningDetails;
    if (mcpToolBlocks.length) chatMessage.mcp_tool_blocks = mcpToolBlocks;
    if (toolCalls.length) chatMessage.tool_calls = toolCalls;
    return [chatMessage];
  }

  const chatMessages = mapAnthropicUserBlocksToChatMessages(blocks, options);
  if (!chatMessages.length) chatMessages.push({ role: "user", content: "" });
  return chatMessages;
}

function mapAnthropicUserBlocksToChatMessages(
  blocks: JsonRecord[],
  options: AnthropicChatRequestAdapterOptions = {},
): JsonRecord[] {
  const chatMessages: JsonRecord[] = [];
  let userContentBlocks: JsonRecord[] = [];

  const flushUserContent = () => {
    if (!userContentBlocks.length) return;
    chatMessages.push({
      role: "user",
      content: anthropicBlocksToChatContent(userContentBlocks),
    });
    userContentBlocks = [];
  };

  for (const block of blocks) {
    if (block.type !== "tool_result") {
      userContentBlocks.push(block);
      continue;
    }
    flushUserContent();
    const toolCallId = stringOrNull(block.tool_use_id);
    if (!toolCallId) {
      chatMessages.push({
        role: "user",
        content: `Anthropic Messages tool_result missing tool_use_id for Chat Completions: ${stringifyCompact(block)}`,
      });
      continue;
    }
    const chatMessage: JsonRecord = {
      role: "tool",
      tool_call_id: toolCallId,
      content: options.preserveToolResultContent
        ? anthropicToolResultContentToChatContent(block.content, { preserveStructuredContent: true })
        : anthropicToolResultContentToChatContent(block.content),
    };
    if (options.preserveToolResultError && block.is_error === true) chatMessage.is_error = true;
    chatMessages.push(chatMessage);
  }
  flushUserContent();
  return chatMessages;
}

function anthropicSystemToText(system: unknown): string {
  if (typeof system === "string") return system;
  return anthropicContentToText(system);
}

function anthropicContentBlocks(content: unknown): JsonRecord[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord);
}

function anthropicBlocksToChatContent(blocks: JsonRecord[]): unknown {
  const parts: JsonRecord[] = blocks.flatMap((block): JsonRecord[] => {
    if (block.type === "text") {
      const text = stringOrNull(block.text);
      return text ? [{ type: "text", text }] : [];
    }
    if (block.type === "image") {
      const imageUrl = anthropicImageSourceToChatImageUrl(block.source);
      if (imageUrl) return [{ type: "image_url", image_url: { url: imageUrl } }];
      return [{ type: "text", text: anthropicUnknownContentBlockToChatText(block) }];
    }
    if (block.type === "document") {
      const filePart = anthropicDocumentToChatFilePart(block);
      return filePart ? [filePart] : [{ type: "text", text: anthropicUnknownContentBlockToChatText(block) }];
    }
    if (block.type === "container_upload") {
      const filePart = anthropicContainerUploadToChatFilePart(block);
      return filePart ? [filePart] : [{ type: "text", text: anthropicUnknownContentBlockToChatText(block) }];
    }
    const text = anthropicContentToText(block) || anthropicUnknownContentBlockToChatText(block);
    return text ? [{ type: "text", text }] : [];
  });
  if (!parts.length) return "";
  if (parts.every((part) => part.type === "text")) {
    return parts.map((part) => stringOrNull(part.text) || "").join("");
  }
  return parts;
}

function anthropicDocumentToChatFilePart(block: JsonRecord): JsonRecord | null {
  const source = isRecord(block.source) ? block.source : {};
  const file: JsonRecord = {};
  if (source.type === "file") {
    const fileId = stringOrNull(source.file_id);
    if (fileId) file.file_id = fileId;
  } else if (source.type === "url") {
    const url = stringOrNull(source.url);
    if (url) file.file_url = url;
  } else if (source.type === "base64") {
    const data = stringOrNull(source.data);
    if (data) file.file_data = data;
    const mediaType = stringOrNull(source.media_type);
    if (mediaType) file.media_type = mediaType;
  }
  const title = stringOrNull(block.title) || stringOrNull(block.name);
  if (title) file.filename = title;
  if (!Object.keys(file).length) return null;
  return { type: "file", file };
}

function anthropicContainerUploadToChatFilePart(block: JsonRecord): JsonRecord | null {
  const fileId = stringOrNull(block.file_id);
  if (!fileId) return null;
  const file: JsonRecord = { file_id: fileId };
  const filename = stringOrNull(block.filename) || stringOrNull(block.name) || stringOrNull(block.title);
  if (filename) file.filename = filename;
  return { type: "file", file };
}

function anthropicImageSourceToChatImageUrl(source: unknown): string | null {
  if (!isRecord(source)) return null;
  if (source.type === "url") return stringOrNull(source.url);
  if (source.type === "base64") {
    const mediaType = stringOrNull(source.media_type);
    const data = stringOrNull(source.data);
    return mediaType && data ? `data:${mediaType};base64,${data}` : null;
  }
  return null;
}

function anthropicToolResultContentToChatContent(
  content: unknown,
  options: { preserveStructuredContent?: boolean } = {},
): unknown {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (options.preserveStructuredContent && Array.isArray(content)) return anthropicBlocksToChatContent(content.filter(isRecord));
  if (Array.isArray(content)) {
    const text = content.map(anthropicContentPartToText).filter(Boolean).join("");
    return content.every(anthropicContentPartIsTextLike) ? text : stringifyCompact(content);
  }
  const text = anthropicContentPartToText(content);
  return text || stringifyCompact(content);
}

function anthropicContentPartIsTextLike(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (!isRecord(part)) return false;
  const type = stringOrNull(part.type);
  if (type === null) return Boolean(anthropicContentPartToText(part));
  return type === "text";
}

function anthropicContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content.map(anthropicContentPartToText).filter(Boolean).join("");
  }
  return anthropicContentPartToText(content);
}

function anthropicContentPartToText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!isRecord(part)) return "";
  if (part.type === "text") return stringOrNull(part.text) || "";
  return stringOrNull(part.text)
    || stringOrNull(part.content)
    || "";
}

function mapAnthropicToolsToChat(tools: unknown): JsonRecord[] {
  if (!Array.isArray(tools)) return [];
  return tools.flatMap((tool) => {
    if (!isRecord(tool)) return [];
    if (isAnthropicWebSearchTool(tool)) return [mapAnthropicWebSearchToolToChat(tool)];
    const name = stringOrNull(tool.name);
    if (!name) return [];
    const fn: JsonRecord = {
      name,
      parameters: isRecord(tool.input_schema) ? tool.input_schema : {},
    };
    if (typeof tool.description === "string") fn.description = tool.description;
    return [{ type: "function", function: fn }];
  });
}

function mapAnthropicWebSearchToolToChat(tool: JsonRecord): JsonRecord {
  const mapped: JsonRecord = { type: "web_search_preview" };
  copyScalarFields(tool, mapped, [
    "allowed_callers",
    "allowed_domains",
    "blocked_domains",
    "defer_loading",
    "max_uses",
    "strict",
    "user_location",
  ]);
  return mapped;
}

function isAnthropicWebSearchTool(tool: JsonRecord): boolean {
  const type = stringOrNull(tool.type);
  const name = stringOrNull(tool.name);
  return name === "web_search" && (type === "web_search_20250305" || type === "web_search_20260209");
}

function mapAnthropicOutputConfigToChatResponseFormat(outputConfig: unknown): unknown {
  if (!isRecord(outputConfig) || !isRecord(outputConfig.format)) return undefined;
  const format = outputConfig.format;
  if (format.type === "json_schema") {
    const jsonSchema: JsonRecord = {};
    for (const key of ["name", "schema", "strict", "description"] as const) {
      if (format[key] !== undefined) jsonSchema[key] = format[key];
    }
    return { type: "json_schema", json_schema: jsonSchema };
  }
  if (format.type === "json_object" || format.type === "text") {
    return { type: format.type };
  }
  return undefined;
}

function anthropicUnsupportedOutputFormatToChatText(outputConfig: unknown): string {
  if (!isRecord(outputConfig) || outputConfig.format === undefined) return "";
  if (mapAnthropicOutputConfigToChatResponseFormat(outputConfig) !== undefined) return "";
  return `Anthropic Messages unsupported output_config.format for Chat: ${stringifyCompact(outputConfig.format)}`;
}

function anthropicUnsupportedToolContextToChatText(tools: unknown): string {
  if (!Array.isArray(tools)) return "";
  const notes = tools.flatMap((tool, index): string[] => {
    if (!isRecord(tool)) return [];
    if (stringOrNull(tool.type) === "mcp_toolset") return [];
    const supported = anthropicSupportedToolFields(tool);
    const fields = Object.keys(tool)
      .filter((field) => !supported.has(field))
      .filter((field) => !isSensitiveAnthropicToolField(field))
      .map((field) => `${field}=${stringifyCompact(tool[field])}`);
    if (!fields.length) return [];
    const name = stringOrNull(tool.name) || `tools[${index}]`;
    return [`${name} ${fields.join(" ")}`];
  });
  return notes.length
    ? `Anthropic Messages tool fields preserved for Chat adapters: ${notes.join("; ")}`
    : "";
}

function anthropicSupportedToolFields(tool: JsonRecord): Set<string> {
  if (isAnthropicWebSearchTool(tool)) {
    return new Set([
      "type",
      "name",
      "allowed_callers",
      "allowed_domains",
      "blocked_domains",
      "defer_loading",
      "max_uses",
      "strict",
      "user_location",
    ]);
  }
  return new Set(["name", "description", "input_schema"]);
}

function isSensitiveAnthropicToolField(field: string): boolean {
  return /(?:authorization|token|secret|api[_-]?key|headers?)/i.test(field);
}

function anthropicMetadataContextToChatText(metadata: unknown): string {
  if (!isRecord(metadata)) return "";
  const notes = Object.keys(metadata)
    .filter((field) => field !== "user_id")
    .filter((field) => !isSensitiveMetadataField(field))
    .map((field) => `${field}=${stringifyCompact(metadata[field])}`);
  return notes.length
    ? `Anthropic Messages metadata preserved for Chat adapters: ${notes.join(" ")}`
    : "";
}

function anthropicUnsupportedRequestContextToChatText(
  request: JsonRecord,
  options: AnthropicChatRequestAdapterOptions = {},
): string {
  const unsupportedFields = [
    "cache_control",
    "inference_geo",
    "speed",
    "top_k",
  ];
  const notes = unsupportedFields
    .filter((field) => request[field] !== undefined)
    .map((field) => `${field}=${stringifyCompact(request[field])}`);
  if (request.service_tier !== undefined
    && (!options.preserveServiceTier || !mapAnthropicServiceTierToOpenAI(request.service_tier))) {
    notes.push(`service_tier=${stringifyCompact(request.service_tier)}`);
  }
  notes.push(...collectAnthropicContentCacheControlNotes(request));
  if (request.container !== undefined) {
    notes.push(`container=${stringifyCompact(request.container)}`);
  }
  if (!options.preserveContextManagement && request.context_management !== undefined) {
    notes.push(`context_management=${stringifyCompact(request.context_management)}`);
  }
  return notes.length
    ? `Anthropic Messages request context preserved for Chat adapters: ${notes.join(" ")}`
    : "";
}

function collectAnthropicContentCacheControlNotes(request: JsonRecord): string[] {
  const notes: string[] = [];
  notes.push(...collectCacheControlNotesAt(request.system, "system"));
  if (Array.isArray(request.messages)) {
    request.messages.forEach((message, messageIndex) => {
      if (!isRecord(message)) return;
      notes.push(...collectCacheControlNotesAt(message.content, `messages[${messageIndex}].content`));
    });
  }
  return notes;
}

function collectCacheControlNotesAt(value: unknown, path: string): string[] {
  if (isRecord(value)) {
    const notes: string[] = [];
    if (value.cache_control !== undefined) {
      notes.push(`${path}.cache_control=${stringifyCompact(value.cache_control)}`);
    }
    if (Array.isArray(value.content)) {
      notes.push(...collectCacheControlNotesAt(value.content, `${path}.content`));
    }
    return notes;
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => collectCacheControlNotesAt(item, `${path}[${index}]`));
}

function mapChatResponseFormatToAnthropicOutputFormat(responseFormat: unknown): unknown {
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
  return undefined;
}

function mapOpenAIChatMetadataToAnthropicMetadata(metadata: unknown, user: unknown): JsonRecord | null {
  const userId = isRecord(metadata)
    ? stringOrNull(metadata.user_id) || stringOrNull(user)
    : stringOrNull(user);
  return userId ? { user_id: userId } : null;
}

function anthropicMetadataUserId(metadata: unknown): string | null {
  if (!isRecord(metadata)) return null;
  return stringOrNull(metadata.user_id);
}

function mapAnthropicServiceTierToOpenAI(value: unknown): string | null {
  const tier = stringOrNull(value);
  if (!tier) return null;
  if (tier === "standard_only") return "default";
  if (tier === "auto" || tier === "default" || tier === "flex" || tier === "priority") return tier;
  return null;
}

function mapAnthropicMcpServersToResponsesTools(mcpServers: unknown, mcpToolsetsSource?: unknown): JsonRecord[] {
  if (!Array.isArray(mcpServers)) return [];
  const mcpToolsets = anthropicMcpToolsetsByServerName(mcpToolsetsSource);
  const hasToolsets = mcpToolsets.size > 0;
  return mcpServers.flatMap((server) => {
    if (!isRecord(server)) return [];
    if (server.type !== "url") return [];
    const serverLabel = stringOrNull(server.name) || stringOrNull(server.server_label);
    const serverUrl = stringOrNull(server.url) || stringOrNull(server.server_url);
    if (!serverLabel || !serverUrl) return [];
    const mcpToolset = mcpToolsets.get(serverLabel) || null;
    if (hasToolsets && !mcpToolset) return [];

    const toolConfiguration = isRecord(server.tool_configuration) ? server.tool_configuration : null;
    const toolsetDefaultConfig = isRecord(mcpToolset?.default_config) ? mcpToolset.default_config : null;
    if (!mcpToolset && toolConfiguration?.enabled === false) return [];

    const tool: JsonRecord = {
      type: "mcp",
      server_label: serverLabel,
      server_url: serverUrl,
    };
    const description = stringOrNull(server.description) || stringOrNull(server.server_description);
    if (description) tool.server_description = description;
    const authorization = stringOrNull(server.authorization_token) || stringOrNull(server.authorization);
    if (authorization) tool.authorization = authorization;
    const allowedTools = mcpToolset
      ? anthropicMcpToolsetAllowedTools(mcpToolset)
      : anthropicStringArray(Array.isArray(toolConfiguration?.allowed_tools)
        ? toolConfiguration.allowed_tools
        : Array.isArray(server.allowed_tools)
          ? server.allowed_tools
          : []);
    if (allowedTools.length) tool.allowed_tools = allowedTools;

    const requireApproval = server.require_approval ?? toolConfiguration?.require_approval;
    if (requireApproval !== undefined) tool.require_approval = requireApproval;

    const deferLoading = typeof toolsetDefaultConfig?.defer_loading === "boolean"
      ? toolsetDefaultConfig.defer_loading
      : typeof server.defer_loading === "boolean"
        ? server.defer_loading
        : typeof toolConfiguration?.defer_loading === "boolean"
          ? toolConfiguration.defer_loading
          : undefined;
    if (deferLoading !== undefined) tool.defer_loading = deferLoading;
    return [tool];
  });
}

function mapAnthropicMcpServersToChatContextMessages(mcpServers: unknown, mcpToolsetsSource?: unknown): JsonRecord[] {
  const contexts = mapAnthropicMcpServersToChatContext(mcpServers, mcpToolsetsSource);
  return contexts.length ? [{ role: "user", content: contexts.join("\n") }] : [];
}

function mapAnthropicMcpServersToChatContext(mcpServers: unknown, mcpToolsetsSource?: unknown): string[] {
  if (!Array.isArray(mcpServers)) return [];
  const mcpToolsets = anthropicMcpToolsetsByServerName(mcpToolsetsSource);
  const hasToolsets = mcpToolsets.size > 0;
  return mcpServers.flatMap((server) => {
    if (!isRecord(server)) return [];
    if (server.type !== "url") return [];
    const toolConfiguration = isRecord(server.tool_configuration) ? server.tool_configuration : null;
    const serverLabel = stringOrNull(server.name) || stringOrNull(server.server_label);
    const serverUrl = stringOrNull(server.url) || stringOrNull(server.server_url);
    if (!serverLabel || !serverUrl) return [];
    const mcpToolset = mcpToolsets.get(serverLabel) || null;
    if (hasToolsets && !mcpToolset) return [];
    if (!mcpToolset && toolConfiguration?.enabled === false) return [];
    const toolsetDefaultConfig = isRecord(mcpToolset?.default_config) ? mcpToolset.default_config : null;

    const details = [`server_label=${serverLabel}`, `server_url=${serverUrl}`];
    const description = stringOrNull(server.description) || stringOrNull(server.server_description);
    if (description) details.push(`description=${description}`);
    const allowedTools = mcpToolset
      ? anthropicMcpToolsetAllowedTools(mcpToolset)
      : anthropicStringArray(Array.isArray(toolConfiguration?.allowed_tools)
        ? toolConfiguration.allowed_tools
        : Array.isArray(server.allowed_tools)
          ? server.allowed_tools
          : []);
    if (allowedTools.length) details.push(`allowed_tools=${allowedTools.join(",")}`);
    const disabledTools = mcpToolset ? anthropicMcpToolsetDisabledTools(mcpToolset) : [];
    if (disabledTools.length) details.push(`disabled_tools=${disabledTools.join(",")}`);
    const requireApproval = server.require_approval ?? toolConfiguration?.require_approval;
    if (requireApproval !== undefined) details.push(`require_approval=${stringifyCompact(requireApproval)}`);
    const deferLoading = typeof toolsetDefaultConfig?.defer_loading === "boolean"
      ? toolsetDefaultConfig.defer_loading
      : typeof server.defer_loading === "boolean"
        ? server.defer_loading
        : typeof toolConfiguration?.defer_loading === "boolean"
          ? toolConfiguration.defer_loading
          : undefined;
    if (deferLoading !== undefined) details.push(`defer_loading=${String(deferLoading)}`);
    return [`[Anthropic MCP server ${details.join(" ")}]`];
  });
}

function mapAnthropicToolChoiceToChat(
  toolChoice: unknown,
  context?: { mcpServers?: unknown; mcpToolsets?: unknown; chatTools?: unknown },
): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return toolChoice;
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "auto" || toolChoice.type === "none") return toolChoice.type;
  if (toolChoice.type === "any") return "required";
  if (toolChoice.type === "tool") {
    const name = stringOrNull(toolChoice.name);
    if (name === "web_search") return { type: "web_search_preview" };
    const mcpServerLabel = name ? anthropicMcpToolChoiceServerLabel(name, context) : null;
    if (mcpServerLabel) return { type: "mcp", server_label: mcpServerLabel, name };
    return name ? { type: "function", function: { name } } : toolChoice;
  }
  return toolChoice;
}

function anthropicMcpToolsetsByServerName(tools: unknown): Map<string, JsonRecord> {
  const result = new Map<string, JsonRecord>();
  if (!Array.isArray(tools)) return result;
  for (const tool of tools) {
    if (!isRecord(tool) || tool.type !== "mcp_toolset") continue;
    const serverName = stringOrNull(tool.mcp_server_name);
    if (serverName && !result.has(serverName)) result.set(serverName, tool);
  }
  return result;
}

function anthropicMcpToolsetAllowedTools(toolset: JsonRecord): string[] {
  const defaultConfig = isRecord(toolset.default_config) ? toolset.default_config : null;
  const configs = isRecord(toolset.configs) ? toolset.configs : null;
  if (defaultConfig?.enabled !== false || !configs) return [];
  return Object.entries(configs)
    .filter(([, config]) => isRecord(config) && config.enabled === true)
    .map(([name]) => name)
    .filter((name) => name.length > 0);
}

function anthropicMcpToolsetDisabledTools(toolset: JsonRecord): string[] {
  const defaultConfig = isRecord(toolset.default_config) ? toolset.default_config : null;
  const configs = isRecord(toolset.configs) ? toolset.configs : null;
  if (defaultConfig?.enabled === false || !configs) return [];
  return Object.entries(configs)
    .filter(([, config]) => isRecord(config) && config.enabled === false)
    .map(([name]) => name)
    .filter((name) => name.length > 0);
}

function anthropicMcpToolChoiceServerLabel(
  toolName: string,
  context?: { mcpServers?: unknown; mcpToolsets?: unknown; chatTools?: unknown },
): string | null {
  if (!context || anthropicChatToolsContainFunction(context.chatTools, toolName)) return null;
  const serverLabels = anthropicMcpServerLabels(context.mcpServers);
  if (!serverLabels.length) return null;
  const toolsets = anthropicMcpToolsetsByServerName(context.mcpToolsets);
  const explicitMatches = [...toolsets.entries()]
    .filter(([serverLabel]) => serverLabels.includes(serverLabel))
    .filter(([, toolset]) => anthropicMcpToolsetAllowedTools(toolset).includes(toolName))
    .map(([serverLabel]) => serverLabel);
  if (explicitMatches.length === 1) return explicitMatches[0];
  if (explicitMatches.length > 1) return null;
  if (serverLabels.length === 1) return serverLabels[0];
  return null;
}

function anthropicMcpServerLabels(mcpServers: unknown): string[] {
  if (!Array.isArray(mcpServers)) return [];
  return mcpServers.flatMap((server): string[] => {
    if (!isRecord(server) || server.type !== "url") return [];
    const toolConfiguration = isRecord(server.tool_configuration) ? server.tool_configuration : null;
    if (toolConfiguration?.enabled === false) return [];
    const serverLabel = stringOrNull(server.name) || stringOrNull(server.server_label);
    return serverLabel ? [serverLabel] : [];
  });
}

function anthropicChatToolsContainFunction(tools: unknown, toolName: string): boolean {
  if (!Array.isArray(tools)) return false;
  return tools.some((tool) => {
    if (!isRecord(tool) || tool.type !== "function") return false;
    const fn = isRecord(tool.function) ? tool.function : {};
    return stringOrNull(fn.name) === toolName || stringOrNull(tool.name) === toolName;
  });
}

function anthropicStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function mapAnthropicParallelToolUseToChat(toolChoice: unknown): boolean | undefined {
  if (!isRecord(toolChoice)) return undefined;
  return toolChoice.disable_parallel_tool_use === true ? false : undefined;
}

function mapLegacyChatFunctionCallMessageToAnthropic(functionCall: unknown): JsonRecord | null {
  if (!isRecord(functionCall)) return null;
  const name = stringOrNull(functionCall.name);
  if (!name) return null;
  return {
    type: "tool_use",
    id: legacyFunctionCallId(name),
    name,
    input: parseToolArguments(functionCall.arguments),
  };
}

function legacyFunctionCallId(name: string): string {
  return `call_${name}`;
}

function mapChatToolCallToAnthropicToolUse(toolCall: unknown): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  const id = stringOrNull(toolCall.id);
  if (!name || !id) return null;
  return {
    type: "tool_use",
    id,
    name,
    input: parseToolArguments(fn.arguments),
  };
}

function firstChoice(response: JsonRecord): JsonRecord | null {
  if (!Array.isArray(response.choices)) return null;
  const [choice] = response.choices;
  return isRecord(choice) ? choice : null;
}

function mapAnthropicToolUseToChatToolCall(part: unknown): JsonRecord | null {
  if (!isRecord(part) || part.type !== "tool_use") return null;
  const name = stringOrNull(part.name);
  const id = stringOrNull(part.id);
  if (!name || !id) return null;
  return {
    id,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(part.input ?? {}),
    },
  };
}

function anthropicMalformedToolUseToChatText(part: unknown): string {
  if (!isRecord(part) || part.type !== "tool_use") return "";
  return mapAnthropicToolUseToChatToolCall(part)
    ? ""
    : `Anthropic Messages malformed tool_use for Chat: ${stringifyCompact(part)}`;
}

function anthropicUnknownContentBlockToChatText(part: unknown): string {
  if (!isRecord(part)) return "";
  const type = stringOrNull(part.type);
  if (!type || type === "text" || type === "thinking" || type === "redacted_thinking") return "";
  if (type === "tool_use") return "";
  if (type === "mcp_tool_use" || type === "mcp_tool_result") {
    return anthropicMcpToolBlocks([part]).length
      ? ""
      : `Anthropic Messages malformed ${type} for Chat: ${stringifyCompact(part)}`;
  }
  return `Anthropic Messages unrecognized content block for Chat: ${stringifyCompact(part)}`;
}

function mapChatFinishReasonToAnthropic(finishReason: unknown, hasToolUses: boolean): string {
  if (hasToolUses) return "tool_use";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "content_filter") return "refusal";
  if (finishReason === "stop") return "end_turn";
  return "end_turn";
}

function mapAnthropicStopReasonToChat(stopReason: unknown, hasToolCalls: boolean, legacyFunctionCall = false): string {
  if (hasToolCalls) return legacyFunctionCall ? "function_call" : "tool_calls";
  if (stopReason === "max_tokens") return "length";
  if (stopReason === "refusal") return "content_filter";
  if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
  return "stop";
}

function mapChatUsageToAnthropic(usage: unknown, fallbackServiceTier?: unknown): JsonRecord {
  if (!isRecord(usage)) {
    const mapped: JsonRecord = { input_tokens: 0, output_tokens: 0 };
    copyServiceTier(fallbackServiceTier, mapped);
    return mapped;
  }
  const inputTokens = numberOrNull(usage.prompt_tokens) ?? 0;
  const outputTokens = numberOrNull(usage.completion_tokens) ?? 0;
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const mapped: JsonRecord = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
  const cachedTokens = numberOrNull(promptDetails.cached_tokens);
  if (cachedTokens !== null) mapped.cache_read_input_tokens = cachedTokens;
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier ?? fallbackServiceTier, mapped);
  return mapped;
}

function mapAnthropicUsageToChat(usage: unknown): JsonRecord | null {
  if (!isRecord(usage)) return null;
  const promptTokens = numberOrNull(usage.input_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? 0;
  const cachedTokens = numberOrNull(usage.cache_read_input_tokens)
    ?? numberOrNull(usage.cache_creation_input_tokens)
    ?? 0;
  const mapped: JsonRecord = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    prompt_tokens_details: {
      cached_tokens: cachedTokens,
    },
  };
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

function parseToolArguments(value: unknown): unknown {
  if (typeof value !== "string") return isRecord(value) ? value : {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function chatMessageText(message: JsonRecord): string {
  return chatOutputContentToText(message.content) || stringOrNull(message.refusal) || "";
}

function chatOutputContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content.map(chatOutputContentPartToText).filter(Boolean).join("");
  }
  return chatOutputContentPartToText(content);
}

function chatOutputContentPartToText(part: unknown): string {
  const text = chatContentPartToText(part);
  if (text || !isRecord(part)) return text;
  const type = stringOrNull(part.type);
  if (!type || type === "text" || type === "input_text" || type === "output_text" || type === "refusal") return "";
  return `OpenAI Chat unrecognized message content part for Anthropic Messages: ${stringifyCompact(part)}`;
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
  return details
    .map((part) => {
      if (typeof part === "string") return part;
      if (!isRecord(part)) return "";
      return stringOrNull(part.text)
        || stringOrNull(part.content)
        || stringOrNull(part.summary)
        || "";
    })
    .filter(Boolean)
    .join("");
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

function stringifyCompact(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
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
