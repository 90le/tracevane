import {
  applyAnthropicReasoningOptions,
  mapReasoningEffort,
  reasoningEffort,
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
  preserveMcpServers?: boolean;
  preserveMetadata?: boolean;
  preserveServiceTier?: boolean;
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

  const anthropicRequest: JsonRecord = {
    model,
    max_tokens: numberOrNull(request.max_tokens)
      ?? numberOrNull(request.max_completion_tokens)
      ?? 1024,
    messages: mapChatMessagesToAnthropic(request.messages),
  };
  if (stream) anthropicRequest.stream = true;

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

  const toolChoice = applyChatParallelToolChoiceToAnthropic(
    mapChatToolChoiceToAnthropic(request.tool_choice),
    request.parallel_tool_calls,
  );
  if (toolChoice !== undefined) anthropicRequest.tool_choice = toolChoice;

  applyAnthropicReasoningOptions(anthropicRequest, request);

  return { anthropicRequest, model, stream };
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

  const messages = mapAnthropicMessagesToChat(request);
  const chatRequest: JsonRecord = {
    model,
    messages,
    stream: request.stream === true,
  };

  if (request.max_tokens !== undefined) chatRequest.max_tokens = request.max_tokens;
  if (request.stop_sequences !== undefined) chatRequest.stop = request.stop_sequences;

  copyScalarFields(request, chatRequest, [
    "temperature",
    "top_p",
  ]);
  if (options.preserveMetadata && request.metadata !== undefined) chatRequest.metadata = request.metadata;
  const metadataUserId = anthropicMetadataUserId(request.metadata);
  if (metadataUserId && chatRequest.user === undefined) chatRequest.user = metadataUserId;
  if (options.preserveServiceTier) {
    const serviceTier = mapAnthropicServiceTierToOpenAI(request.service_tier);
    if (serviceTier) chatRequest.service_tier = serviceTier;
  }

  const tools = mapAnthropicToolsToChat(request.tools);
  if (options.preserveMcpServers) tools.push(...mapAnthropicMcpServersToResponsesTools(request.mcp_servers));
  if (tools.length) chatRequest.tools = tools;

  const toolChoice = mapAnthropicToolChoiceToChat(request.tool_choice);
  if (toolChoice !== undefined) chatRequest.tool_choice = toolChoice;

  const parallelToolCalls = mapAnthropicParallelToolUseToChat(request.tool_choice);
  if (parallelToolCalls !== undefined) chatRequest.parallel_tool_calls = parallelToolCalls;

  const effort = reasoningEffort(request);
  const mappedEffort = effort ? mapReasoningEffort(effort, "passthrough") : null;
  if (mappedEffort) chatRequest.reasoning_effort = mappedEffort;

  return {
    chatRequest,
    model,
    stream: request.stream === true,
  };
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
  const message: JsonRecord = {
    role: "assistant",
    content: text || (toolCalls.length ? null : ""),
  };
  if (reasoningText) message.reasoning_content = reasoningText;
  if (reasoningDetails.length) message.reasoning_details = reasoningDetails;
  if (mcpToolBlocks.length) message.mcp_tool_blocks = mcpToolBlocks;
  const annotations = collectAnthropicTextCitations(content);
  if (annotations.length) message.annotations = annotations;
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
    usage: mapChatUsageToAnthropic(response.usage),
  };
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
    if (!toolUseId) return [];
    return [{
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: toolUseId,
        content: chatToolResultContentToAnthropicContent(message.content),
      }],
    }];
  }

  const role = message.role === "assistant" ? "assistant" : "user";
  const content = chatMessageContentToAnthropicBlocks(message);
  return [{ role, content: content.length === 1 && content[0]?.type === "text" ? content[0].text : content }];
}

function chatMessageContentToAnthropicBlocks(message: JsonRecord): JsonRecord[] {
  const blocks = [
    ...chatReasoningDetailsToAnthropicBlocks(message.reasoning_details),
    ...chatContentToAnthropicBlocks(message.content),
  ];
  if (Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      const mapped = mapChatToolCallToAnthropicToolUse(toolCall);
      if (mapped) blocks.push(mapped);
    }
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
  return null;
}

function chatContentPartIsTextLike(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (!isRecord(part)) return false;
  const type = stringOrNull(part.type);
  if (type === null) return Boolean(chatContentPartToText(part));
  return type === "text" || type === "input_text" || type === "output_text" || type === "refusal";
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
      continue;
    }
    if (type === "file" || type === "input_file") {
      const document = chatFilePartToAnthropicDocument(part);
      if (document) blocks.push(document);
    }
  }
  return blocks;
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

function mapAnthropicMessagesToChat(request: JsonRecord): JsonRecord[] {
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
    messages.push(...mapAnthropicMessageToChat(message));
  }

  return messages.length ? messages : [{ role: "user", content: "" }];
}

function mapAnthropicMessageToChat(message: unknown): JsonRecord[] {
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
    const chatMessage: JsonRecord = {
      role,
      content: text || (toolCalls.length ? null : ""),
    };
    if (reasoningText) chatMessage.reasoning_content = reasoningText;
    if (reasoningDetails.length) chatMessage.reasoning_details = reasoningDetails;
    if (mcpToolBlocks.length) chatMessage.mcp_tool_blocks = mcpToolBlocks;
    if (toolCalls.length) chatMessage.tool_calls = toolCalls;
    return [chatMessage];
  }

  const chatMessages = mapAnthropicUserBlocksToChatMessages(blocks);
  if (!chatMessages.length) chatMessages.push({ role: "user", content: "" });
  return chatMessages;
}

function mapAnthropicUserBlocksToChatMessages(blocks: JsonRecord[]): JsonRecord[] {
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
    if (!toolCallId) continue;
    chatMessages.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: anthropicToolResultContentToChatContent(block.content),
    });
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
      return imageUrl ? [{ type: "image_url", image_url: { url: imageUrl } }] : [];
    }
    if (block.type === "document") {
      const filePart = anthropicDocumentToChatFilePart(block);
      return filePart ? [filePart] : [];
    }
    const text = anthropicContentToText(block);
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

function anthropicToolResultContentToChatContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
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

function mapAnthropicMcpServersToResponsesTools(mcpServers: unknown): JsonRecord[] {
  if (!Array.isArray(mcpServers)) return [];
  return mcpServers.flatMap((server) => {
    if (!isRecord(server)) return [];
    if (server.type !== "url") return [];
    const serverLabel = stringOrNull(server.name) || stringOrNull(server.server_label);
    const serverUrl = stringOrNull(server.url) || stringOrNull(server.server_url);
    if (!serverLabel || !serverUrl) return [];

    const toolConfiguration = isRecord(server.tool_configuration) ? server.tool_configuration : null;
    if (toolConfiguration?.enabled === false) return [];

    const tool: JsonRecord = {
      type: "mcp",
      server_label: serverLabel,
      server_url: serverUrl,
    };
    const description = stringOrNull(server.description) || stringOrNull(server.server_description);
    if (description) tool.server_description = description;
    const authorization = stringOrNull(server.authorization_token) || stringOrNull(server.authorization);
    if (authorization) tool.authorization = authorization;
    const allowedToolsSource = Array.isArray(toolConfiguration?.allowed_tools)
      ? toolConfiguration.allowed_tools
      : Array.isArray(server.allowed_tools)
        ? server.allowed_tools
        : [];
    const allowedTools = allowedToolsSource.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
    if (allowedTools.length) tool.allowed_tools = allowedTools;

    const requireApproval = server.require_approval ?? toolConfiguration?.require_approval;
    if (requireApproval !== undefined) tool.require_approval = requireApproval;

    const deferLoading = typeof server.defer_loading === "boolean"
      ? server.defer_loading
      : typeof toolConfiguration?.defer_loading === "boolean"
        ? toolConfiguration.defer_loading
        : undefined;
    if (deferLoading !== undefined) tool.defer_loading = deferLoading;
    return [tool];
  });
}

function mapAnthropicToolChoiceToChat(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none") return toolChoice;
  if (!isRecord(toolChoice)) return toolChoice;
  if (toolChoice.type === "auto" || toolChoice.type === "none") return toolChoice.type;
  if (toolChoice.type === "any") return "required";
  if (toolChoice.type === "tool") {
    const name = stringOrNull(toolChoice.name);
    return name ? { type: "function", function: { name } } : toolChoice;
  }
  return toolChoice;
}

function mapAnthropicParallelToolUseToChat(toolChoice: unknown): boolean | undefined {
  if (!isRecord(toolChoice)) return undefined;
  return toolChoice.disable_parallel_tool_use === true ? false : undefined;
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

function mapChatFinishReasonToAnthropic(finishReason: unknown, hasToolUses: boolean): string {
  if (hasToolUses) return "tool_use";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "stop" || finishReason === "content_filter") return "end_turn";
  return "end_turn";
}

function mapAnthropicStopReasonToChat(stopReason: unknown, hasToolCalls: boolean): string {
  if (hasToolCalls) return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  if (stopReason === "end_turn" || stopReason === "stop_sequence") return "stop";
  return "stop";
}

function mapChatUsageToAnthropic(usage: unknown): JsonRecord {
  if (!isRecord(usage)) return { input_tokens: 0, output_tokens: 0 };
  const inputTokens = numberOrNull(usage.prompt_tokens) ?? 0;
  const outputTokens = numberOrNull(usage.completion_tokens) ?? 0;
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const mapped: JsonRecord = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
  };
  const cachedTokens = numberOrNull(promptDetails.cached_tokens);
  if (cachedTokens !== null) mapped.cache_read_input_tokens = cachedTokens;
  return mapped;
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

function chatMessageText(message: JsonRecord): string {
  return chatContentToText(message.content) || stringOrNull(message.refusal) || "";
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
    || "";
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

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
