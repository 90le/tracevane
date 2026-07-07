import type { ModelGatewayProviderReasoning } from "../../../../types/model-gateway.js";
import { applyChatReasoningOptions } from "./reasoning-options.js";
import { isResponsesBuiltinToolItem, responsesBuiltinToolItemToText } from "./responses-output-items.js";

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
  customToolNames: string[];
  model: string | null;
  stream: boolean;
}

export interface CodexResponsesChatRequestAdapterOptions {
  allowStreaming?: boolean;
  preserveReasoningEffort?: boolean;
  preserveToolOutputContent?: boolean;
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
  appendResponsesInputMessages(request.input ?? request.messages, messages, options);
  const unsupportedToolChoiceText = responsesUnsupportedToolChoiceToText(request.tool_choice);
  if (unsupportedToolChoiceText) {
    messages.push({ role: "user", content: unsupportedToolChoiceText });
  }
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

  // Do not forward Responses metadata to Chat-compatible upstreams. Some common
  // providers, including BigModel Chat, reject the extra field with 400/1210.
  copyScalarFields(request, chatRequest, [
    "frequency_penalty",
    "logit_bias",
    "parallel_tool_calls",
    "presence_penalty",
    "prompt_cache_key",
    "prompt_cache_retention",
    "safety_identifier",
    "seed",
    "service_tier",
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
  const customToolNames = collectResponsesCustomToolNames(request.tools);

  const toolChoice = mapResponsesToolChoiceToChat(request.tool_choice);
  if (toolChoice !== undefined) chatRequest.tool_choice = toolChoice;

  const responseFormat = mapResponsesTextFormatToChatResponseFormat(request.text) ?? request.response_format;
  if (responseFormat !== undefined) chatRequest.response_format = responseFormat;
  const verbosity = responsesTextVerbosity(request.text) ?? verbosityOrNull(request.verbosity);
  if (verbosity) chatRequest.verbosity = verbosity;

  applyChatReasoningOptions(chatRequest, request, options.reasoning || null, {
    preserveEffort: options.preserveReasoningEffort,
  });

  if (stream) ensureStreamUsageOption(chatRequest);

  return {
    chatRequest,
    customToolNames,
    model,
    stream,
  };
}

export function adaptChatCompletionToCodexResponse(
  chatCompletion: unknown,
  fallbackModel: string | null,
  options: { customToolNames?: Iterable<string> } = {},
): JsonRecord {
  if (!isRecord(chatCompletion)) {
    throw new CodexResponsesChatAdapterError(
      "model_gateway_codex_chat_response_invalid",
      "OpenAI Chat upstream returned a non-object response.",
      502,
    );
  }

  const choice = firstChoice(chatCompletion);
  const message = isRecord(choice?.message) ? choice.message : {};
  const messageContent = chatMessageToResponsesOutputContent(message, choice?.logprobs);
  const reasoningText = extractReasoningText(message);
  const generatedSuffix = Date.now().toString(36);
  const output: JsonRecord[] = [];
  const reasoningItems = chatReasoningDetailsToResponsesReasoningItems(message.reasoning_details);
  if (reasoningItems.length) {
    output.push(...reasoningItems);
  } else if (reasoningText) {
    output.push({
      type: "reasoning",
      id: `reasoning_${generatedSuffix}`,
      status: "completed",
      summary: [{ type: "summary_text", text: reasoningText }],
    });
  }
  if (messageContent.length || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) {
    output.push({
      type: "message",
      id: `msg_${generatedSuffix}`,
      status: "completed",
      role: "assistant",
      content: messageContent.length ? messageContent : [{ type: "output_text", text: "" }],
    });
  }

  const customToolNames = new Set(options.customToolNames || []);
  for (const toolCall of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    const mapped = mapChatToolCallToResponses(toolCall, reasoningText, customToolNames);
    if (mapped) output.push(mapped);
  }

  const response: JsonRecord = {
    id: stringOrNull(chatCompletion.id) || `resp_${generatedSuffix}`,
    object: "response",
    created_at: numberOrNull(chatCompletion.created) || Math.floor(Date.now() / 1_000),
    model: stringOrNull(chatCompletion.model) || fallbackModel,
    status: "completed",
    output,
    usage: mapChatUsageToResponses(chatCompletion.usage),
  };
  if (chatCompletion.service_tier !== undefined) response.service_tier = chatCompletion.service_tier;
  return response;
}

function chatMessageToResponsesOutputContent(message: JsonRecord, choiceLogprobs: unknown): JsonRecord[] {
  const content = message.content;
  if (Array.isArray(content)) {
    const parts: JsonRecord[] = [];
    for (const part of content) {
      const mapped = chatContentPartToResponsesOutputPart(part);
      if (mapped) parts.push(mapped);
    }
    const outputText = parts.find((part): part is JsonRecord => part.type === "output_text");
    if (outputText) {
      const messageAnnotations = chatAnnotationsToResponsesAnnotations(message.annotations);
      if (messageAnnotations.length) {
        outputText.annotations = [
          ...messageAnnotations,
          ...(Array.isArray(outputText.annotations) ? outputText.annotations.filter(isRecord) : []),
        ];
      }
      attachChatLogprobs(outputText, choiceLogprobs);
    }
    return parts;
  }

  const text = stripTrailingPlaceholderText(contentToText(content));
  if (text) {
    const outputText: JsonRecord = { type: "output_text", text };
    const annotations = chatAnnotationsToResponsesAnnotations(message.annotations);
    if (annotations.length) outputText.annotations = annotations;
    attachChatLogprobs(outputText, choiceLogprobs);
    return [outputText];
  }

  const refusal = stringOrNull(message.refusal);
  return refusal ? [{ type: "refusal", refusal }] : [];
}

function chatContentPartToResponsesOutputPart(part: unknown): JsonRecord | null {
  if (typeof part === "string") {
    const text = stripTrailingPlaceholderText(part);
    return text ? { type: "output_text", text } : null;
  }
  if (!isRecord(part)) return null;
  if (part.type === "refusal") {
    const refusal = stringOrNull(part.refusal) || stringOrNull(part.text);
    return refusal ? { type: "refusal", refusal } : null;
  }
  const text = stripTrailingPlaceholderText(
    stringOrNull(part.text)
      || stringOrNull(part.output_text)
      || stringOrNull(part.input_text)
      || "",
  );
  if (!text) return null;
  const outputText: JsonRecord = { type: "output_text", text };
  const annotations = chatAnnotationsToResponsesAnnotations(part.annotations);
  if (annotations.length) outputText.annotations = annotations;
  if (Array.isArray(part.logprobs)) outputText.logprobs = part.logprobs.filter(isRecord);
  return outputText;
}

function attachChatLogprobs(outputText: JsonRecord, choiceLogprobs: unknown): void {
  if (outputText.logprobs !== undefined) return;
  const contentLogprobs = isRecord(choiceLogprobs) && Array.isArray(choiceLogprobs.content)
    ? choiceLogprobs.content.filter(isRecord)
    : [];
  if (contentLogprobs.length) outputText.logprobs = contentLogprobs;
}

function chatAnnotationsToResponsesAnnotations(annotations: unknown): JsonRecord[] {
  if (!Array.isArray(annotations)) return [];
  return annotations.filter(isRecord).map(mapChatAnnotationToResponsesAnnotation);
}

function mapChatAnnotationToResponsesAnnotation(annotation: JsonRecord): JsonRecord {
  const type = stringOrNull(annotation.type);
  if (type === "web_search_result_location") {
    return withoutUndefined({
      ...stripAnnotationTransportFields(annotation),
      type: "url_citation",
      url: stringOrNull(annotation.url) || undefined,
      title: stringOrNull(annotation.title) || undefined,
      start_index: numberOrNull(annotation.start_index)
        ?? numberOrNull(annotation.start_char_index)
        ?? undefined,
      end_index: numberOrNull(annotation.end_index)
        ?? numberOrNull(annotation.end_char_index)
        ?? undefined,
    });
  }
  if (type === "page_location" || type === "char_location" || type === "content_block_location") {
    return withoutUndefined({
      ...stripAnnotationTransportFields(annotation),
      type: "file_citation",
      file_id: stringOrNull(annotation.file_id) || undefined,
      filename: stringOrNull(annotation.filename)
        || stringOrNull(annotation.document_title)
        || undefined,
      index: numberOrNull(annotation.index)
        ?? numberOrNull(annotation.document_index)
        ?? undefined,
    });
  }
  return stripAnnotationTransportFields(annotation);
}

function stripAnnotationTransportFields(annotation: JsonRecord): JsonRecord {
  const {
    content_index: _contentIndex,
    output_index: _outputIndex,
    annotation_index: _annotationIndex,
    start_char_index: _startCharIndex,
    end_char_index: _endCharIndex,
    document_index: _documentIndex,
    document_title: _documentTitle,
    ...rest
  } = annotation;
  return { ...rest };
}

function withoutUndefined(record: JsonRecord): JsonRecord {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
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

function appendResponsesInputMessages(
  input: unknown,
  messages: JsonRecord[],
  options: CodexResponsesChatRequestAdapterOptions = {},
): void {
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
  const pendingReasoningItems: JsonRecord[] = [];
  let pendingReasoningText = "";
  for (const item of items) {
    if (isRecord(item) && item.type === "reasoning") {
      pendingReasoningItems.push(stripReasoningTransportFields(item));
      pendingReasoningText = joinTextParts(pendingReasoningText, responsesReasoningItemToText(item));
      continue;
    }
    if (isRecord(item) && isResponsesToolCallItem(item)) {
      const toolCall = mapResponsesToolCallToChatToolCall(item);
      if (toolCall) pendingToolCalls.push(toolCall);
      continue;
    }
    const flushedToolCalls = pendingToolCalls.length > 0;
    flushPendingToolCalls(messages, pendingToolCalls, pendingReasoningText, pendingReasoningItems);
    if (flushedToolCalls) {
      pendingReasoningText = "";
      pendingReasoningItems.length = 0;
    }
    const message = mapResponsesInputItemToChatMessage(item, options);
    if (message) {
      if (message.role === "assistant") {
        if (pendingReasoningText && message.reasoning_content === undefined) message.reasoning_content = pendingReasoningText;
        if (pendingReasoningItems.length && message.reasoning_details === undefined) message.reasoning_details = pendingReasoningItems.splice(0);
        pendingReasoningText = "";
      }
      messages.push(message);
    }
  }
  flushPendingToolCalls(messages, pendingToolCalls, pendingReasoningText, pendingReasoningItems);
}

function mapResponsesInputItemToChatMessage(
  item: unknown,
  options: CodexResponsesChatRequestAdapterOptions = {},
): JsonRecord | null {
  if (typeof item === "string") return { role: "user", content: item };
  if (!isRecord(item)) return null;

  if (isResponsesToolOutputItem(item)) {
    const toolCallId = stringOrNull(item.call_id) || stringOrNull(item.id);
    if (!toolCallId) return null;
    const output = options.preserveToolOutputContent
      ? contentToChatContent(item.output, "user")
      : canonicalizeJsonStringIfParseable(responsesToolOutputToChatContent(item.output));
    return {
      role: "tool",
      content: output,
      tool_call_id: toolCallId,
    };
  }

  if (isResponsesBuiltinToolItem(item)) {
    const text = responsesBuiltinToolItemToText(item);
    return text ? { role: "user", content: text } : null;
  }

  if (item.type === "message" || typeof item.role === "string" || item.content !== undefined) {
    const role = mapResponsesRoleToChat(item.role);
    const message: JsonRecord = {
      role,
      content: contentToChatContent(item.content, role),
    };
    const reasoningContent = stringOrNull(item.reasoning_content);
    if (role === "assistant" && reasoningContent) message.reasoning_content = reasoningContent;
    const toolCallId = stringOrNull(item.tool_call_id) || stringOrNull(item.call_id);
    if (role === "tool" && toolCallId) message.tool_call_id = toolCallId;
    if (role === "tool" && !toolCallId) return null;
    return message;
  }

  const text = contentToText(item);
  return text ? { role: "user", content: text } : null;
}

function responsesReasoningItemToText(item: JsonRecord): string {
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
  return summaryText
    || stringOrNull(item.text)
    || contentToText(item.content)
    || "";
}

function joinTextParts(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return `${left}\n${right}`;
}

function mapResponsesRoleToChat(role: unknown): string {
  if (role === "assistant" || role === "tool") return role;
  if (role === "system" || role === "developer") return "system";
  return "user";
}

function mapResponsesToolCallToChatToolCall(item: JsonRecord): JsonRecord | null {
  const callId = stringOrNull(item.call_id) || stringOrNull(item.id);
  const name = stringOrNull(item.name);
  if (!callId || !name) return null;
  return {
    id: callId,
    type: "function",
    function: {
      name,
      arguments: item.type === "custom_tool_call"
        ? canonicalizeCustomToolInput(item.input)
        : canonicalizeToolArguments(item.arguments),
    },
  };
}

function isResponsesToolCallItem(item: JsonRecord): boolean {
  return item.type === "function_call" || item.type === "custom_tool_call";
}

function isResponsesToolOutputItem(item: JsonRecord): boolean {
  return item.type === "function_call_output" || item.type === "custom_tool_call_output";
}

function flushPendingToolCalls(
  messages: JsonRecord[],
  pendingToolCalls: JsonRecord[],
  reasoningText = "",
  reasoningItems: JsonRecord[] = [],
): void {
  if (!pendingToolCalls.length) return;
  const message: JsonRecord = {
    role: "assistant",
    content: null,
    tool_calls: pendingToolCalls.splice(0),
  };
  if (reasoningText) message.reasoning_content = reasoningText;
  if (reasoningItems.length) message.reasoning_details = reasoningItems.splice(0);
  messages.push(message);
}

function chatReasoningDetailsToResponsesReasoningItems(details: unknown): JsonRecord[] {
  if (!Array.isArray(details)) return [];
  const items: JsonRecord[] = [];
  const textParts: string[] = [];
  for (const detail of details) {
    if (typeof detail === "string") {
      if (detail && !isPlaceholderReasoningText(detail)) textParts.push(detail);
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
    const text = extractReasoningDetailsText(detail);
    if (text) textParts.push(text);
  }
  if (textParts.length) {
    items.push({
      type: "reasoning",
      status: "completed",
      summary: [{ type: "summary_text", text: textParts.join("\n\n") }],
    });
  }
  return items;
}

function stripReasoningTransportFields(detail: JsonRecord): JsonRecord {
  const { output_index: _outputIndex, content_index: _contentIndex, annotation_index: _annotationIndex, ...rest } = detail;
  return { ...rest, type: "reasoning" };
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

function canonicalizeToolArguments(value: unknown): string {
  if (typeof value === "string") {
    return value.trim() ? canonicalizeJsonStringIfParseable(value) : "{}";
  }
  if (value === undefined || value === null) return "{}";
  return canonicalJsonString(value);
}

function canonicalizeCustomToolInput(value: unknown): string {
  if (typeof value === "string") return canonicalJsonString({ input: value });
  if (value === undefined || value === null) return canonicalJsonString({ input: "" });
  return canonicalJsonString({ input: contentToText(value) || JSON.stringify(value) });
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

function responsesToolOutputToChatContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    const text = content.map(contentPartToText).filter(Boolean).join("");
    return content.every(contentPartIsTextLike) ? text : stringifyCompact(content);
  }
  const text = contentPartToText(content);
  return text || stringifyCompact(content);
}

function contentPartIsTextLike(part: unknown): boolean {
  if (typeof part === "string") return true;
  if (!isRecord(part)) return false;
  const type = stringOrNull(part.type);
  if (type === null) return Boolean(contentPartToText(part));
  return type === "text" || type === "input_text" || type === "output_text" || type === "refusal";
}

function stringifyCompact(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";
  if (Array.isArray(content)) {
    return content.map(contentPartToText).filter(Boolean).join("");
  }
  return contentPartToText(content);
}

function stripTrailingPlaceholderText(value: string): string {
  if (!value) return value;
  if (isPlaceholderText(value)) return "";
  return value
    .replace(/(?:\r?\n){2,}[ \t]*(?:[.\u2026]+[ \t]*(?:\r?\n[ \t]*)*)+$/u, "");
}

function contentToChatContent(content: unknown, role: string): string | JsonRecord[] {
  if (role !== "user") return contentToText(content);
  const parts = contentToChatParts(content);
  if (!parts.some((part) => part.type === "image_url" || part.type === "file")) return contentToText(content);
  return parts;
}

function contentToChatParts(content: unknown): JsonRecord[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (content === null || content === undefined) return [];
  if (Array.isArray(content)) return content.flatMap(contentPartToChatParts);
  return contentPartToChatParts(content);
}

function contentPartToChatParts(part: unknown): JsonRecord[] {
  if (typeof part === "string") return part ? [{ type: "text", text: part }] : [];
  if (!isRecord(part)) return [];
  const imageUrl = imageUrlFromResponsesPart(part);
  if (imageUrl) {
    const image: JsonRecord = { url: imageUrl };
    const detail = stringOrNull(part.detail);
    if (detail) image.detail = detail;
    return [{ type: "image_url", image_url: image }];
  }
  const filePart = inputFilePartFromResponsesPart(part);
  if (filePart) return [filePart];
  const text = stringOrNull(part.text) || stringOrNull(part.output_text) || stringOrNull(part.input_text);
  if (text) return [{ type: "text", text }];
  if (Array.isArray(part.content)) return contentToChatParts(part.content);
  return [];
}

function imageUrlFromResponsesPart(part: JsonRecord): string | null {
  const type = stringOrNull(part.type);
  if (type !== "input_image" && type !== "image_url") return null;
  if (typeof part.image_url === "string") return part.image_url.trim() || null;
  if (isRecord(part.image_url)) return stringOrNull(part.image_url.url);
  return stringOrNull(part.url);
}

function inputFilePartFromResponsesPart(part: JsonRecord): JsonRecord | null {
  if (stringOrNull(part.type) !== "input_file") return null;
  const file: JsonRecord = {};
  for (const key of ["file_id", "file_url", "filename", "file_data"] as const) {
    if (part[key] !== undefined) file[key] = part[key];
  }
  const text = inputFileReferenceFromResponsesPart(part);
  if (text) file.text = text;
  return Object.keys(file).length ? { type: "file", file } : null;
}

function inputFileReferenceFromResponsesPart(part: JsonRecord): string | null {
  if (stringOrNull(part.type) !== "input_file") return null;
  const fields: string[] = [];
  const fileId = stringOrNull(part.file_id);
  const fileUrl = stringOrNull(part.file_url);
  const filename = stringOrNull(part.filename);
  if (fileId) fields.push(`file_id=${fileId}`);
  if (fileUrl) fields.push(`file_url=${fileUrl}`);
  if (filename) fields.push(`filename=${filename}`);
  if (!fields.length) return "[OpenAI Responses input_file]";
  return `[OpenAI Responses input_file: ${fields.join(" ")}]`;
}

function contentPartToText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!isRecord(part)) return "";
  const fileReference = inputFileReferenceFromResponsesPart(part);
  if (fileReference) return fileReference;
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

function collectResponsesCustomToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  return tools
    .filter((tool): tool is JsonRecord => isRecord(tool) && tool.type === "custom")
    .map((tool) => stringOrNull(tool.name) || (isRecord(tool.function) ? stringOrNull(tool.function.name) : null))
    .filter((name): name is string => Boolean(name));
}

function mapResponsesToolToChat(tool: unknown): JsonRecord | null {
  if (!isRecord(tool)) return null;
  if (tool.type !== "function" && tool.type !== "custom") {
    return typeof tool.type === "string" ? { ...tool } : null;
  }
  const source = isRecord(tool.function) ? tool.function : tool;
  const name = stringOrNull(source.name);
  if (!name) return null;

  const fn: JsonRecord = { name };
  if (typeof source.description === "string") fn.description = source.description;
  if (source.parameters !== undefined) {
    fn.parameters = source.parameters;
  } else if (tool.type === "custom") {
    fn.parameters = {
      type: "object",
      properties: {
        input: { type: "string" },
      },
      required: ["input"],
    };
  }
  if (typeof source.strict === "boolean") fn.strict = source.strict;
  return {
    type: "function",
    function: fn,
  };
}

function mapResponsesTextFormatToChatResponseFormat(text: unknown): unknown {
  if (!isRecord(text) || !isRecord(text.format)) return undefined;
  const format = text.format;
  if (format.type === "json_schema") {
    const jsonSchema: JsonRecord = {};
    for (const key of ["name", "schema", "strict", "description"] as const) {
      if (format[key] !== undefined) jsonSchema[key] = format[key];
    }
    return { type: "json_schema", json_schema: jsonSchema };
  }
  if (format.type === "json_object") return { type: "json_object" };
  return undefined;
}

function responsesTextVerbosity(text: unknown): "low" | "medium" | "high" | null {
  return isRecord(text) ? verbosityOrNull(text.verbosity) : null;
}

function mapResponsesToolChoiceToChat(toolChoice: unknown): unknown {
  if (toolChoice === undefined) return undefined;
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (!isRecord(toolChoice)) return undefined;
  if (isOpenAIWebSearchToolType(toolChoice.type)) return { type: toolChoice.type };
  if (toolChoice.type === "function") {
    const name = stringOrNull(toolChoice.name) || (isRecord(toolChoice.function) ? stringOrNull(toolChoice.function.name) : null);
    return name ? { type: "function", function: { name } } : undefined;
  }
  if (toolChoice.type === "custom") {
    const name = stringOrNull(toolChoice.name);
    return name ? { type: "function", function: { name } } : undefined;
  }
  return undefined;
}

function responsesUnsupportedToolChoiceToText(toolChoice: unknown): string {
  if (toolChoice === undefined) return "";
  if (toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return "";
  if (!isRecord(toolChoice)) return "";
  if (toolChoice.type === "function" || toolChoice.type === "custom" || isOpenAIWebSearchToolType(toolChoice.type)) return "";
  return `[OpenAI Responses tool_choice ${stringifyCompact(toolChoice)}]`;
}

function isOpenAIWebSearchToolType(type: unknown): boolean {
  return type === "web_search_preview" || type === "web_search_preview_2025_03_11";
}

function mapChatToolCallToResponses(
  toolCall: unknown,
  reasoningText: string | null,
  customToolNames: Set<string> = new Set(),
): JsonRecord | null {
  if (!isRecord(toolCall)) return null;
  const fn = isRecord(toolCall.function) ? toolCall.function : {};
  const name = stringOrNull(fn.name);
  if (!name) return null;
  const id = stringOrNull(toolCall.id) || `call_${Date.now().toString(36)}`;
  if (customToolNames.has(name)) {
    const item: JsonRecord = {
      type: "custom_tool_call",
      id,
      call_id: id,
      status: "completed",
      name,
      input: customToolInputFromChatArguments(fn.arguments),
    };
    if (reasoningText) item.reasoning_content = reasoningText;
    return item;
  }
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

function customToolInputFromChatArguments(value: unknown): string {
  const text = stringOrNull(value);
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const input = parsed.input;
      if (typeof input === "string") return input;
    }
  } catch {
    // Fall through to raw text.
  }
  return text;
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

  const mapped: JsonRecord = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    input_tokens_details: isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : chatPromptDetailsToResponsesInputDetails(promptDetails),
    output_tokens_details: isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : chatCompletionDetailsToResponsesOutputDetails(completionDetails),
  };
  copyServerToolUse(usage, mapped);
  return mapped;
}

function chatPromptDetailsToResponsesInputDetails(promptDetails: JsonRecord): JsonRecord {
  const mapped: JsonRecord = { cached_tokens: numberOrNull(promptDetails.cached_tokens) || 0 };
  copyNumericField(promptDetails, mapped, "audio_tokens");
  return mapped;
}

function chatCompletionDetailsToResponsesOutputDetails(completionDetails: JsonRecord): JsonRecord {
  const mapped: JsonRecord = { reasoning_tokens: numberOrNull(completionDetails.reasoning_tokens) || 0 };
  for (const field of ["audio_tokens", "accepted_prediction_tokens", "rejected_prediction_tokens"] as const) {
    copyNumericField(completionDetails, mapped, field);
  }
  return mapped;
}

function copyServerToolUse(source: JsonRecord, target: JsonRecord): void {
  if (isRecord(source.server_tool_use)) target.server_tool_use = { ...source.server_tool_use };
}

function copyNumericField(source: JsonRecord, target: JsonRecord, field: string): void {
  const value = numberOrNull(source[field]);
  if (value !== null) target[field] = value;
}

function extractReasoningText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  for (const key of ["reasoning_content", "reasoning"] as const) {
    const direct = stringOrNull(value[key]);
    if (direct && !isPlaceholderReasoningText(direct)) return direct;
  }

  const reasoning = isRecord(value.reasoning) ? value.reasoning : null;
  if (reasoning) {
    for (const key of ["content", "text", "summary"] as const) {
      const text = stringOrNull(reasoning[key]);
      if (text && !isPlaceholderReasoningText(text)) return text;
    }
  }

  const detailsText = extractReasoningDetailsText(value.reasoning_details);
  return detailsText || null;
}

function extractReasoningDetailsText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return isPlaceholderReasoningText(value) ? null : value;
  if (Array.isArray(value)) {
    const text = value
      .map(extractReasoningDetailsText)
      .filter((item): item is string => Boolean(item))
      .join("\n\n");
    return text || null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["text", "content", "summary_text", "thinking"] as const) {
    const text = stringOrNull(value[key]);
    if (text && !isPlaceholderReasoningText(text)) return text;
  }
  const summaryText = extractReasoningDetailsText(value.summary);
  if (summaryText) return summaryText;
  return extractReasoningDetailsText(value.parts);
}

function isPlaceholderReasoningText(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (/^[.\u2026\s]+$/u.test(normalized)) return true;
  return /^(?:tool\s+)?call(?:\s+(?:tool\s+)?call)*$/iu.test(normalized.replace(/\s+/g, " "));
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

function verbosityOrNull(value: unknown): "low" | "medium" | "high" | null {
  return value === "low" || value === "medium" || value === "high" ? value : null;
}

function isPlaceholderText(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && /^[.\u2026\s]+$/u.test(normalized);
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
