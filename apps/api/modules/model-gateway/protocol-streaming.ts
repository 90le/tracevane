import type http from "node:http";

type JsonRecord = Record<string, unknown>;

interface ParsedSseEvent {
  event: string | null;
  data: string;
  json: JsonRecord | null;
  done: boolean;
}

interface StreamResult {
  id: string;
  model: string | null;
  outputText: string;
  output?: JsonRecord[];
}

export interface StreamAdapterOptions {
  customToolNames?: Iterable<string>;
}

export interface StreamErrorEnvelope {
  message: string;
  type: string | null;
  code: string | null;
}

export class ModelGatewayStreamAdapterError extends Error {
  readonly streamError: StreamErrorEnvelope;

  constructor(streamError: StreamErrorEnvelope) {
    super(streamError.message);
    this.name = "ModelGatewayStreamAdapterError";
    this.streamError = streamError;
  }
}

interface ToolStreamBlock {
  id: string;
  index: number;
  name: string;
  inputJson: string;
  custom: boolean;
  started: boolean;
  stopped: boolean;
  sentChatStart: boolean;
  chatIndex: number;
  outputIndex: number | null;
}

export async function writeAnthropicMessagesSseFromChatSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
): Promise<StreamResult> {
  const state = {
    started: false,
    completed: false,
    messageId: `msg_${Date.now().toString(36)}`,
    model: fallbackModel,
    stopReason: "end_turn",
    text: "",
    textBlockIndex: null as number | null,
    textBlockStopped: false,
    nextContentIndex: 0,
    tools: new Map<number, ToolStreamBlock>(),
    usage: { input_tokens: 0, output_tokens: 0 } as JsonRecord,
  };

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (isStreamErrorEvent(event)) {
        const error = extractStreamError(event.json || {});
        if (state.started) {
          failAnthropicStream(state, res, error);
          throw new ModelGatewayStreamAdapterError(error);
        }
        throw new Error(error.message);
      }
      if (event.done) {
        finalizeAnthropicFromChat(state, res);
        return;
      }
      if (!event.json) return;
      const id = stringOrNull(event.json.id);
      if (id && !state.started) state.messageId = id.startsWith("msg_") ? id : `msg_${id}`;
      const model = stringOrNull(event.json.model);
      if (model) state.model = model;
      if (isRecord(event.json.usage)) state.usage = mapChatUsageToAnthropic(event.json.usage);
      ensureAnthropicMessageStart(state, res);

      const choice = firstChoice(event.json);
      if (!choice) return;
      const delta = isRecord(choice.delta) ? choice.delta : {};
      const content = stringOrNull(delta.content);
      if (content) pushAnthropicTextDeltaFromChat(state, res, content);
      if (Array.isArray(delta.tool_calls)) {
        for (const toolDelta of delta.tool_calls) pushAnthropicToolDeltaFromChat(state, res, toolDelta);
      }
      const finishReason = stringOrNull(choice.finish_reason);
      if (finishReason) state.stopReason = mapChatFinishReasonToAnthropic(finishReason, state.tools.size > 0);
    });
  } catch (error) {
    if (state.started) {
      const streamError = errorFromThrown(error);
      failAnthropicStream(state, res, streamError);
      throw new ModelGatewayStreamAdapterError(streamError);
    } else {
      throw error;
    }
  }

  finalizeAnthropicFromChat(state, res);
  return { id: state.messageId, model: state.model, outputText: state.text };
}

export async function writeChatCompletionsSseFromAnthropicMessagesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
): Promise<StreamResult> {
  const state = createChatStreamState(fallbackModel);
  const toolBlocks = new Map<number, ToolStreamBlock>();

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (isStreamErrorEvent(event)) {
        const error = extractStreamError(event.json || {});
        if (state.started) {
          failChatStream(state, res, error);
          throw new ModelGatewayStreamAdapterError(error);
        }
        throw new Error(error.message);
      }
      if (!event.json) return;
      if (event.event === "message_start" && isRecord(event.json.message)) {
        const message = event.json.message;
        const id = stringOrNull(message.id);
        if (id) state.id = id;
        const model = stringOrNull(message.model);
        if (model) state.model = model;
        if (isRecord(message.usage)) state.usage = mapAnthropicUsageToChat(message.usage);
        ensureChatStreamStart(state, res);
        return;
      }
      if (event.event === "content_block_start" && isRecord(event.json.content_block)) {
        ensureChatStreamStart(state, res);
        const sourceIndex = numberOrNull(event.json.index) ?? toolBlocks.size;
        const block = event.json.content_block;
        if (block.type === "tool_use") {
          const tool = ensureToolBlock(toolBlocks, sourceIndex, {
            id: stringOrNull(block.id) || undefined,
            name: stringOrNull(block.name) || undefined,
          });
          writeChatToolCallStart(state, res, tool);
        }
        return;
      }
      if (event.event === "content_block_delta" && isRecord(event.json.delta)) {
        ensureChatStreamStart(state, res);
        const delta = event.json.delta;
        if (delta.type === "text_delta") {
          const text = stringOrNull(delta.text);
          if (text) writeChatTextDelta(state, res, text);
          return;
        }
        if (delta.type === "input_json_delta") {
          const sourceIndex = numberOrNull(event.json.index) ?? toolBlocks.size;
          const tool = ensureToolBlock(toolBlocks, sourceIndex, {});
          const partialJson = stringOrNull(delta.partial_json) || "";
          tool.inputJson += partialJson;
          writeChatToolCallArguments(state, res, tool, partialJson);
        }
        return;
      }
      if (event.event === "message_delta") {
        if (isRecord(event.json.delta)) {
          state.finishReason = mapAnthropicStopReasonToChat(event.json.delta.stop_reason, toolBlocks.size > 0);
        }
        if (isRecord(event.json.usage)) {
          state.usage = {
            ...state.usage,
            completion_tokens: numberOrNull(event.json.usage.output_tokens) ?? numberOrNull(state.usage.completion_tokens) ?? 0,
          };
          state.usage.total_tokens = (numberOrNull(state.usage.prompt_tokens) ?? 0)
            + (numberOrNull(state.usage.completion_tokens) ?? 0);
        }
        return;
      }
      if (event.event === "message_stop") finalizeChatStream(state, res);
    });
  } catch (error) {
    if (state.started) {
      const streamError = errorFromThrown(error);
      failChatStream(state, res, streamError);
      throw new ModelGatewayStreamAdapterError(streamError);
    } else {
      throw error;
    }
  }

  finalizeChatStream(state, res);
  return { id: state.id, model: state.model, outputText: state.outputText };
}

export async function writeChatCompletionsSseFromResponsesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
): Promise<StreamResult> {
  const state = createChatStreamState(fallbackModel);
  const toolBlocks = new Map<number, ToolStreamBlock>();
  const toolIndexByItemId = new Map<string, number>();

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (event.done) {
        finalizeChatStream(state, res);
        return;
      }
      if (!event.json) return;
      if (event.event === "response.failed") {
        const error = extractResponsesFailedError(event.json);
        if (state.started) {
          failChatStream(state, res, error);
          throw new ModelGatewayStreamAdapterError(error);
        }
        throw new Error(error.message);
      }
      const response = isRecord(event.json.response) ? event.json.response : event.json;
      const id = stringOrNull(response.id);
      if (id) state.id = id;
      const model = stringOrNull(response.model);
      if (model) state.model = model;
      if (event.event === "response.output_text.delta") {
        const delta = stringOrNull(event.json.delta);
        if (delta) {
          ensureChatStreamStart(state, res);
          writeChatTextDelta(state, res, delta);
        }
        return;
      }
      if (event.event === "response.output_item.added" && isRecord(event.json.item)) {
        if (isResponsesToolCallItem(event.json.item)) {
          const tool = ensureResponsesToolBlock(event.json, event.json.item, toolBlocks, toolIndexByItemId);
          ensureChatStreamStart(state, res);
          writeChatToolCallStart(state, res, tool);
          state.finishReason = "tool_calls";
        }
        return;
      }
      if (event.event === "response.function_call_arguments.delta") {
        const tool = ensureResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId);
        const delta = stringOrNull(event.json.delta) || "";
        if (delta) {
          tool.inputJson += delta;
          ensureChatStreamStart(state, res);
          writeChatToolCallArguments(state, res, tool, delta);
        }
        state.finishReason = "tool_calls";
        return;
      }
      if (event.event === "response.function_call_arguments.done") {
        const tool = ensureResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId);
        const remaining = remainingToolArgumentsDelta(tool, event.json.arguments);
        if (remaining) {
          tool.inputJson += remaining;
          ensureChatStreamStart(state, res);
          writeChatToolCallArguments(state, res, tool, remaining);
        }
        state.finishReason = "tool_calls";
        return;
      }
      if (event.event === "response.output_item.done" && isRecord(event.json.item)) {
        if (isResponsesToolCallItem(event.json.item)) {
          const tool = ensureResponsesToolBlock(event.json, event.json.item, toolBlocks, toolIndexByItemId);
          const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(event.json.item));
          ensureChatStreamStart(state, res);
          writeChatToolCallStart(state, res, tool);
          if (remaining) {
            tool.inputJson += remaining;
            writeChatToolCallArguments(state, res, tool, remaining);
          }
          state.finishReason = "tool_calls";
        }
        return;
      }
      if (event.event === "response.completed") {
        if (isRecord(response.usage)) state.usage = mapResponsesUsageToChat(response.usage);
        emitMissingChatToolCallsFromResponsesOutput(state, res, response.output, toolBlocks, toolIndexByItemId);
        state.finishReason = response.status === "incomplete" ? "length" : "stop";
        if (toolBlocks.size > 0 && state.finishReason === "stop") state.finishReason = "tool_calls";
        finalizeChatStream(state, res);
      }
    });
  } catch (error) {
    if (state.started) {
      const streamError = errorFromThrown(error);
      failChatStream(state, res, streamError);
      throw new ModelGatewayStreamAdapterError(streamError);
    } else {
      throw error;
    }
  }

  finalizeChatStream(state, res);
  return { id: state.id, model: state.model, outputText: state.outputText };
}

export async function writeAnthropicMessagesSseFromResponsesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
): Promise<StreamResult> {
  const state = {
    started: false,
    completed: false,
    messageId: `msg_${Date.now().toString(36)}`,
    model: fallbackModel,
    stopReason: "end_turn",
    text: "",
    textBlockIndex: null as number | null,
    textBlockStopped: false,
    nextContentIndex: 0,
    tools: new Map<number, ToolStreamBlock>(),
    toolIndexByItemId: new Map<string, number>(),
    usage: { input_tokens: 0, output_tokens: 0 } as JsonRecord,
  };

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (event.done) {
        finalizeAnthropicTextStream(state, res);
        return;
      }
      if (!event.json) return;
      if (event.event === "response.failed") {
        const error = extractResponsesFailedError(event.json);
        if (state.started) {
          failAnthropicStream(state, res, error);
          throw new ModelGatewayStreamAdapterError(error);
        }
        throw new Error(error.message);
      }
      const response = isRecord(event.json.response) ? event.json.response : event.json;
      const id = stringOrNull(response.id);
      if (id && !state.started) state.messageId = id.startsWith("msg_") ? id : `msg_${id}`;
      const model = stringOrNull(response.model);
      if (model) state.model = model;
      if (event.event === "response.output_text.delta") {
        const delta = stringOrNull(event.json.delta);
        if (delta) {
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicTextDelta(state, res, delta);
        }
        return;
      }
      if (event.event === "response.output_item.added" && isRecord(event.json.item)) {
        if (isResponsesToolCallItem(event.json.item)) {
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          const tool = ensureResponsesToolBlock(event.json, event.json.item, state.tools, state.toolIndexByItemId);
          pushAnthropicToolDeltaFromResponses(state, res, tool, "");
          state.stopReason = "tool_use";
        }
        return;
      }
      if (event.event === "response.function_call_arguments.delta") {
        const tool = ensureResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId);
        const delta = stringOrNull(event.json.delta) || "";
        if (delta) {
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicToolDeltaFromResponses(state, res, tool, delta);
        }
        state.stopReason = "tool_use";
        return;
      }
      if (event.event === "response.function_call_arguments.done") {
        const tool = ensureResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId);
        const remaining = remainingToolArgumentsDelta(tool, event.json.arguments);
        if (remaining) {
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
        }
        stopAnthropicToolBlock(res, tool);
        state.stopReason = "tool_use";
        return;
      }
      if (event.event === "response.output_item.done" && isRecord(event.json.item)) {
        if (isResponsesToolCallItem(event.json.item)) {
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          const tool = ensureResponsesToolBlock(event.json, event.json.item, state.tools, state.toolIndexByItemId);
          const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(event.json.item));
          pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
          stopAnthropicToolBlock(res, tool);
          state.stopReason = "tool_use";
        }
        return;
      }
      if (event.event === "response.completed") {
        if (isRecord(response.usage)) state.usage = mapResponsesUsageToAnthropic(response.usage);
        emitMissingAnthropicToolUsesFromResponsesOutput(state, res, response.output);
        state.stopReason = response.status === "incomplete" ? "max_tokens" : "end_turn";
        if (state.tools.size > 0 && state.stopReason === "end_turn") state.stopReason = "tool_use";
        finalizeAnthropicTextStream(state, res);
      }
    });
  } catch (error) {
    if (state.started) {
      const streamError = errorFromThrown(error);
      failAnthropicStream(state, res, streamError);
      throw new ModelGatewayStreamAdapterError(streamError);
    } else {
      throw error;
    }
  }

  finalizeAnthropicTextStream(state, res);
  return { id: state.messageId, model: state.model, outputText: state.text };
}

export async function writeCodexResponsesSseFromAnthropicMessagesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
  options: StreamAdapterOptions = {},
): Promise<StreamResult> {
  const state = {
    responseStarted: false,
    completed: false,
    responseId: `resp_${Date.now().toString(36)}`,
    model: fallbackModel,
    createdAt: Math.floor(Date.now() / 1_000),
    outputText: "",
    textItemId: "",
    textAdded: false,
    textDone: false,
    textOutputIndex: null as number | null,
    nextOutputIndex: 0,
    tools: new Map<number, ToolStreamBlock>(),
    customToolNames: new Set(options.customToolNames || []),
    completedOutput: [] as JsonRecord[],
    usage: null as JsonRecord | null,
    status: "completed",
  };
  state.textItemId = `${state.responseId}_msg`;

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (isStreamErrorEvent(event)) {
        const error = extractStreamError(event.json || {});
        if (state.responseStarted) {
          failResponsesStream(state, res, error);
          throw new ModelGatewayStreamAdapterError(error);
        }
        throw new Error(error.message);
      }
      if (!event.json) return;
      if (event.event === "message_start" && isRecord(event.json.message)) {
        const message = event.json.message;
        const id = stringOrNull(message.id);
        if (id) {
          state.responseId = id;
          if (!state.textAdded) state.textItemId = `${id}_msg`;
        }
        const model = stringOrNull(message.model);
        if (model) state.model = model;
        if (isRecord(message.usage)) state.usage = mapAnthropicUsageToResponses(message.usage);
        ensureResponsesStreamStart(state, res);
        return;
      }
      if (event.event === "content_block_start" && isRecord(event.json.content_block)) {
        ensureResponsesStreamStart(state, res);
        const block = event.json.content_block;
        if (block.type === "tool_use") {
          const sourceIndex = numberOrNull(event.json.index) ?? state.tools.size;
          const tool = ensureToolBlock(state.tools, sourceIndex, {
            id: stringOrNull(block.id) || undefined,
            name: stringOrNull(block.name) || undefined,
            custom: state.customToolNames.has(stringOrNull(block.name) || ""),
          });
          ensureResponsesToolAdded(state, res, tool);
          const inputJson = serializeToolInput(block.input);
          if (inputJson) pushResponsesToolArgumentsDelta(res, tool, inputJson);
        }
        return;
      }
      if (event.event === "content_block_delta" && isRecord(event.json.delta)) {
        const delta = event.json.delta;
        if (delta.type === "text_delta") {
          const text = stringOrNull(delta.text);
          if (text) pushResponsesTextDelta(state, res, text);
          return;
        }
        if (delta.type === "input_json_delta") {
          const sourceIndex = numberOrNull(event.json.index) ?? state.tools.size;
          const tool = ensureToolBlock(state.tools, sourceIndex, {});
          ensureResponsesToolAdded(state, res, tool);
          pushResponsesToolArgumentsDelta(res, tool, stringOrNull(delta.partial_json) || "");
        }
        return;
      }
      if (event.event === "content_block_stop") {
        const sourceIndex = numberOrNull(event.json.index);
        const tool = sourceIndex === null ? null : state.tools.get(sourceIndex);
        if (tool) stopResponsesToolBlock(state, res, tool);
        return;
      }
      if (event.event === "message_delta") {
        if (isRecord(event.json.delta) && event.json.delta.stop_reason === "max_tokens") state.status = "incomplete";
        if (isRecord(event.json.usage)) {
          state.usage = {
            ...(state.usage || {}),
            output_tokens: numberOrNull(event.json.usage.output_tokens) ?? 0,
          };
        }
        return;
      }
      if (event.event === "message_stop") finalizeResponsesStream(state, res);
    });
  } catch (error) {
    if (state.responseStarted) {
      const streamError = errorFromThrown(error);
      failResponsesStream(state, res, streamError);
      throw new ModelGatewayStreamAdapterError(streamError);
    } else {
      throw error;
    }
  }

  finalizeResponsesStream(state, res);
  return {
    id: state.responseId,
    model: state.model,
    outputText: state.outputText,
    output: state.completedOutput,
  };
}

export function writeCodexResponsesSseFromResponse(
  responseValue: unknown,
  res: http.ServerResponse,
  fallbackModel: string | null,
): StreamResult {
  const response = isRecord(responseValue) ? responseValue : {};
  const responseId = stringOrNull(response.id) || `resp_${Date.now().toString(36)}`;
  const model = stringOrNull(response.model) || fallbackModel;
  const createdAt = numberOrNull(response.created_at) || Math.floor(Date.now() / 1_000);
  const output = Array.isArray(response.output)
    ? response.output.filter((item): item is JsonRecord => isRecord(item))
    : [];
  const usage = isRecord(response.usage) ? response.usage : null;
  const status = stringOrNull(response.status) || "completed";
  const base = {
    id: responseId,
    object: "response",
    created_at: createdAt,
    model,
    status: "in_progress",
    output: [],
    usage: null,
  };
  writeSseEvent(res, "response.created", {
    type: "response.created",
    response: base,
  });
  writeSseEvent(res, "response.in_progress", {
    type: "response.in_progress",
    response: base,
  });

  let outputText = "";
  output.forEach((item, outputIndex) => {
    const itemId = stringOrNull(item.id) || `${responseId}_item_${outputIndex}`;
    const itemType = stringOrNull(item.type);
    if (itemType === "message") {
      const content = Array.isArray(item.content)
        ? item.content.filter((part): part is JsonRecord => isRecord(part))
        : [];
      writeSseEvent(res, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: outputIndex,
        item: {
          ...item,
          id: itemId,
          status: "in_progress",
          content: [],
        },
      });
      content.forEach((part, contentIndex) => {
        if (part.type !== "output_text") return;
        const text = stringOrNull(part.text) || "";
        outputText += text;
        writeSseEvent(res, "response.content_part.added", {
          type: "response.content_part.added",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          part: { type: "output_text", text: "", annotations: [] },
        });
        if (text) {
          writeSseEvent(res, "response.output_text.delta", {
            type: "response.output_text.delta",
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            delta: text,
          });
        }
        writeSseEvent(res, "response.output_text.done", {
          type: "response.output_text.done",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          text,
        });
        writeSseEvent(res, "response.content_part.done", {
          type: "response.content_part.done",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          part,
        });
      });
      writeSseEvent(res, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: outputIndex,
        item: {
          ...item,
          id: itemId,
          status: stringOrNull(item.status) || "completed",
        },
      });
      return;
    }
    if (itemType === "function_call" || itemType === "custom_tool_call") {
      const argumentsText = itemType === "custom_tool_call"
        ? stringOrNull(item.input) || ""
        : stringOrNull(item.arguments) || "{}";
      writeSseEvent(res, "response.output_item.added", {
        type: "response.output_item.added",
        output_index: outputIndex,
        item: {
          ...item,
          id: itemId,
          status: "in_progress",
          ...(itemType === "custom_tool_call" ? { input: "" } : { arguments: "" }),
        },
      });
      if (argumentsText) {
        writeSseEvent(res, "response.function_call_arguments.delta", {
          type: "response.function_call_arguments.delta",
          item_id: itemId,
          output_index: outputIndex,
          delta: argumentsText,
        });
      }
      writeSseEvent(res, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: itemId,
        output_index: outputIndex,
        arguments: argumentsText,
      });
      writeSseEvent(res, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: outputIndex,
        item: {
          ...item,
          id: itemId,
          status: stringOrNull(item.status) || "completed",
        },
      });
      return;
    }
    writeSseEvent(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: outputIndex,
      item: { ...item, id: itemId },
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item: { ...item, id: itemId },
    });
  });

  const completedResponse = {
    ...response,
    id: responseId,
    object: stringOrNull(response.object) || "response",
    created_at: createdAt,
    model,
    status,
    output,
    usage: normalizeResponsesUsage(usage),
  };
  writeSseEvent(res, "response.completed", {
    type: "response.completed",
    response: completedResponse,
  });
  res.write("data: [DONE]\n\n");
  return { id: responseId, model, outputText, output };
}

async function readSseEvents(
  upstreamBody: ReadableStream<Uint8Array>,
  onEvent: (event: ParsedSseEvent) => void,
): Promise<void> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      buffer = consumeSseBlocks(buffer, onEvent);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    const event = parseSseBlock(buffer);
    if (event) onEvent(event);
  }
}

function consumeSseBlocks(buffer: string, onEvent: (event: ParsedSseEvent) => void): string {
  let rest = buffer.replace(/\r\n/g, "\n");
  for (;;) {
    const index = rest.indexOf("\n\n");
    if (index < 0) return rest;
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    const event = parseSseBlock(block);
    if (event) onEvent(event);
  }
}

function parseSseBlock(block: string): ParsedSseEvent | null {
  const lines = block.split("\n");
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim() || null;
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();
  if (!data) return null;
  if (data === "[DONE]") return { event, data, json: null, done: true };
  try {
    const parsed = JSON.parse(data) as unknown;
    return { event, data, json: isRecord(parsed) ? parsed : null, done: false };
  } catch {
    return { event, data, json: null, done: false };
  }
}

function isStreamErrorEvent(event: ParsedSseEvent): boolean {
  return event.event === "error" || event.json?.error !== undefined;
}

function extractResponsesFailedError(payload: JsonRecord): StreamErrorEnvelope {
  const response = isRecord(payload.response) ? payload.response : payload;
  const error = isRecord(response.error) ? response.error : isRecord(payload.error) ? payload.error : null;
  const message = stringOrNull(error?.message)
    || stringOrNull(response.error)
    || stringOrNull(payload.message)
    || "response.failed event received";
  const type = stringOrNull(error?.type) || stringOrNull(payload.type) || null;
  const code = stringOrNull(error?.code) || null;
  return { message, type, code };
}

function extractResponsesFailedMessage(payload: JsonRecord): string {
  return extractResponsesFailedError(payload).message;
}

function extractStreamError(payload: JsonRecord): StreamErrorEnvelope {
  const response = isRecord(payload.response) ? payload.response : null;
  const source = response || payload;
  const rawError = isRecord(source.error)
    ? source.error
    : isRecord(payload.error)
      ? payload.error
      : null;
  const message = stringOrNull(rawError?.message)
    || stringOrNull(rawError?.detail)
    || stringOrNull(source.message)
    || stringOrNull(payload.message)
    || (typeof source.error === "string" ? source.error : null)
    || JSON.stringify(rawError || source);
  const type = stringOrNull(rawError?.type)
    || stringOrNull(source.type)
    || stringOrNull(payload.type)
    || stringOrNull(rawError?.code)
    || null;
  const code = stringOrNull(rawError?.code) || stringOrNull(source.code) || null;
  return { message, type, code };
}

function errorFromThrown(error: unknown): StreamErrorEnvelope {
  if (error instanceof ModelGatewayStreamAdapterError) return error.streamError;
  return {
    message: error instanceof Error ? error.message : String(error),
    type: "stream_error",
    code: null,
  };
}

function ensureAnthropicMessageStart(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  if (state.started) return;
  state.started = true;
  writeSseEvent(res, "message_start", {
    type: "message_start",
    message: {
      id: state.messageId,
      type: "message",
      role: "assistant",
      model: state.model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: numberOrNull(state.usage.input_tokens) ?? 0,
        output_tokens: 0,
      },
    },
  });
}

function ensureAnthropicTextMessageStart(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  ensureAnthropicMessageStart(state, res);
}

function pushAnthropicTextDeltaFromChat(
  state: {
    textBlockIndex: number | null;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  delta: string,
): void {
  pushAnthropicTextDelta(state, res, delta);
}

function pushAnthropicTextDelta(
  state: {
    textBlockIndex: number | null;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  delta: string,
): void {
  if (state.textBlockIndex === null) {
    state.textBlockIndex = state.nextContentIndex;
    state.nextContentIndex += 1;
    writeSseEvent(res, "content_block_start", {
      type: "content_block_start",
      index: state.textBlockIndex,
      content_block: { type: "text", text: "" },
    });
  }
  state.text += delta;
  writeSseEvent(res, "content_block_delta", {
    type: "content_block_delta",
    index: state.textBlockIndex,
    delta: { type: "text_delta", text: delta },
  });
}

function pushAnthropicToolDeltaFromChat(
  state: {
    nextContentIndex: number;
    tools: Map<number, ToolStreamBlock>;
  },
  res: http.ServerResponse,
  toolDelta: unknown,
): void {
  if (!isRecord(toolDelta)) return;
  const upstreamIndex = numberOrNull(toolDelta.index) ?? state.tools.size;
  const fn = isRecord(toolDelta.function) ? toolDelta.function : {};
  const tool = ensureToolBlock(state.tools, upstreamIndex, {
    id: stringOrNull(toolDelta.id) || undefined,
    name: stringOrNull(fn.name) || undefined,
  });
  if (!tool.started) {
    tool.index = state.nextContentIndex;
    state.nextContentIndex += 1;
    tool.started = true;
    writeSseEvent(res, "content_block_start", {
      type: "content_block_start",
      index: tool.index,
      content_block: {
        type: "tool_use",
        id: tool.id,
        name: tool.name,
        input: {},
      },
    });
  }
  const args = typeof fn.arguments === "string" ? fn.arguments : "";
  if (args) {
    tool.inputJson += args;
    writeSseEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: tool.index,
      delta: {
        type: "input_json_delta",
        partial_json: args,
      },
    });
  }
}

function finalizeAnthropicFromChat(
  state: {
    started: boolean;
    completed: boolean;
    messageId: string;
    model: string | null;
    stopReason: string;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    tools: Map<number, ToolStreamBlock>;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureAnthropicMessageStart(state, res);
  if (state.textBlockIndex !== null && !state.textBlockStopped) {
    writeSseEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: state.textBlockIndex,
    });
    state.textBlockStopped = true;
  }
  for (const tool of state.tools.values()) {
    if (tool.started && !tool.stopped) {
      writeSseEvent(res, "content_block_stop", {
        type: "content_block_stop",
        index: tool.index,
      });
      tool.stopped = true;
    }
  }
  writeSseEvent(res, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: state.stopReason,
      stop_sequence: null,
    },
    usage: {
      output_tokens: numberOrNull(state.usage.output_tokens) ?? 0,
    },
  });
  writeSseEvent(res, "message_stop", { type: "message_stop" });
  state.completed = true;
}

function failAnthropicStream(
  state: { completed: boolean },
  res: http.ServerResponse,
  error: StreamErrorEnvelope,
): void {
  if (state.completed) return;
  writeSseEvent(res, "error", {
    type: "error",
    error: {
      type: error.type || error.code || "upstream_error",
      message: error.message,
      ...(error.code ? { code: error.code } : {}),
    },
  });
  state.completed = true;
}

function finalizeAnthropicTextStream(
  state: {
    started: boolean;
    completed: boolean;
    messageId: string;
    model: string | null;
    stopReason: string;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureAnthropicMessageStart(state, res);
  if (state.textBlockIndex !== null && !state.textBlockStopped) {
    writeSseEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: state.textBlockIndex,
    });
    state.textBlockStopped = true;
  }
  writeSseEvent(res, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: state.stopReason,
      stop_sequence: null,
    },
    usage: {
      output_tokens: numberOrNull(state.usage.output_tokens) ?? 0,
    },
  });
  writeSseEvent(res, "message_stop", { type: "message_stop" });
  state.completed = true;
}

function createChatStreamState(fallbackModel: string | null): {
  started: boolean;
  completed: boolean;
  id: string;
  model: string | null;
  created: number;
  outputText: string;
  finishReason: string;
  usage: JsonRecord;
} {
  return {
    started: false,
    completed: false,
    id: `chatcmpl_${Date.now().toString(36)}`,
    model: fallbackModel,
    created: Math.floor(Date.now() / 1_000),
    outputText: "",
    finishReason: "stop",
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

function ensureChatStreamStart(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
): void {
  if (state.started) return;
  state.started = true;
  writeChatChunk(state, res, { role: "assistant" }, null);
}

function writeChatTextDelta(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  delta: string,
): void {
  state.outputText += delta;
  writeChatChunk(state, res, { content: delta }, null);
}

function writeChatToolCallStart(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  tool: ToolStreamBlock,
): void {
  if (tool.sentChatStart) return;
  tool.sentChatStart = true;
  writeChatChunk(state, res, {
    tool_calls: [{
      index: tool.chatIndex,
      id: tool.id,
      type: "function",
      function: {
        name: tool.name,
        arguments: "",
      },
    }],
  }, null);
}

function writeChatToolCallArguments(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  tool: ToolStreamBlock,
  partialJson: string,
): void {
  writeChatToolCallStart(state, res, tool);
  if (!partialJson) return;
  writeChatChunk(state, res, {
    tool_calls: [{
      index: tool.chatIndex,
      function: { arguments: partialJson },
    }],
  }, null);
}

function finalizeChatStream(state: ReturnType<typeof createChatStreamState>, res: http.ServerResponse): void {
  if (state.completed) return;
  ensureChatStreamStart(state, res);
  writeChatChunk(state, res, {}, state.finishReason, state.usage);
  res.write("data: [DONE]\n\n");
  state.completed = true;
}

function failChatStream(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  error: StreamErrorEnvelope,
): void {
  if (state.completed) return;
  res.write("event: error\n");
  res.write(`data: ${JSON.stringify({
    error: {
      message: error.message,
      ...(error.type ? { type: error.type } : {}),
      ...(error.code ? { code: error.code } : {}),
    },
  })}\n\n`);
  res.write("data: [DONE]\n\n");
  state.completed = true;
}

function writeChatChunk(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  delta: JsonRecord,
  finishReason: string | null,
  usage?: JsonRecord,
): void {
  const chunk: JsonRecord = {
    id: state.id,
    object: "chat.completion.chunk",
    created: state.created,
    model: state.model,
    choices: [{
      index: 0,
      delta,
      finish_reason: finishReason,
    }],
  };
  if (usage) chunk.usage = usage;
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

function ensureResponsesStreamStart(
  state: {
    responseStarted: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
  },
  res: http.ServerResponse,
): void {
  if (state.responseStarted) return;
  state.responseStarted = true;
  writeSseEvent(res, "response.created", {
    type: "response.created",
    response: baseResponse(state, "in_progress", []),
  });
  writeSseEvent(res, "response.in_progress", {
    type: "response.in_progress",
    response: baseResponse(state, "in_progress", []),
  });
}

function pushResponsesTextDelta(
  state: {
    responseStarted: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
    outputText: string;
    textItemId: string;
    textAdded: boolean;
    textOutputIndex: number | null;
    nextOutputIndex: number;
  },
  res: http.ServerResponse,
  delta: string,
): void {
  ensureResponsesStreamStart(state, res);
  if (!state.textAdded) {
    state.textAdded = true;
    state.textOutputIndex = state.nextOutputIndex;
    state.nextOutputIndex += 1;
    writeSseEvent(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.textOutputIndex,
      item: {
        id: state.textItemId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    });
    writeSseEvent(res, "response.content_part.added", {
      type: "response.content_part.added",
      item_id: state.textItemId,
      output_index: state.textOutputIndex,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
  }
  state.outputText += delta;
  writeSseEvent(res, "response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: state.textItemId,
    output_index: state.textOutputIndex,
    content_index: 0,
    delta,
  });
}

function ensureResponsesToolAdded(
  state: {
    responseStarted: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
    nextOutputIndex: number;
  },
  res: http.ServerResponse,
  tool: ToolStreamBlock,
): void {
  ensureResponsesStreamStart(state, res);
  if (tool.started) return;
  tool.started = true;
  tool.outputIndex = state.nextOutputIndex;
  state.nextOutputIndex += 1;
  writeSseEvent(res, "response.output_item.added", {
    type: "response.output_item.added",
    output_index: tool.outputIndex,
    item: responsesFunctionCallItem(tool, "in_progress"),
  });
}

function pushResponsesToolArgumentsDelta(
  res: http.ServerResponse,
  tool: ToolStreamBlock,
  delta: string,
): void {
  if (!delta) return;
  tool.inputJson += delta;
  writeSseEvent(res, "response.function_call_arguments.delta", {
    type: "response.function_call_arguments.delta",
    item_id: responsesFunctionCallItemId(tool),
    output_index: tool.outputIndex,
    delta,
  });
}

function stopResponsesToolBlock(
  state: {
    completedOutput: JsonRecord[];
  },
  res: http.ServerResponse,
  tool: ToolStreamBlock,
): void {
  if (tool.stopped) return;
  const item = responsesFunctionCallItem(tool, "completed");
  writeSseEvent(res, "response.function_call_arguments.done", {
    type: "response.function_call_arguments.done",
    item_id: responsesFunctionCallItemId(tool),
    output_index: tool.outputIndex,
    arguments: tool.inputJson || "{}",
  });
  writeSseEvent(res, "response.output_item.done", {
    type: "response.output_item.done",
    output_index: tool.outputIndex,
    item,
  });
  state.completedOutput.push(item);
  tool.stopped = true;
}

function responsesFunctionCallItem(tool: ToolStreamBlock, status: string): JsonRecord {
  if (tool.custom) {
    return {
      id: responsesFunctionCallItemId(tool),
      type: "custom_tool_call",
      status,
      call_id: tool.id,
      name: tool.name,
      input: customToolInputFromJson(tool.inputJson),
    };
  }
  return {
    id: responsesFunctionCallItemId(tool),
    type: "function_call",
    status,
    call_id: tool.id,
    name: tool.name,
    arguments: tool.inputJson || "{}",
  };
}

function customToolInputFromJson(value: string): string {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value) as unknown;
    if (isRecord(parsed) && typeof parsed.input === "string") return parsed.input;
  } catch {
    // Fall through to raw text.
  }
  return value;
}

function responsesFunctionCallItemId(tool: ToolStreamBlock): string {
  return `fc_${tool.id}`;
}

function serializeToolInput(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (isRecord(value) && Object.keys(value).length === 0) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function finalizeResponsesStream(
  state: {
    responseStarted: boolean;
    completed: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
    outputText: string;
    textItemId: string;
    textAdded: boolean;
    textDone: boolean;
    textOutputIndex: number | null;
    tools: Map<number, ToolStreamBlock>;
    completedOutput: JsonRecord[];
    usage: JsonRecord | null;
    status: string;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureResponsesStreamStart(state, res);
  const output: JsonRecord[] = [...state.completedOutput];
  if (state.textAdded && !state.textDone) {
    const outputIndex = state.textOutputIndex ?? 0;
    const item = {
      id: state.textItemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: state.outputText, annotations: [] }],
    };
    output.push(item);
    writeSseEvent(res, "response.output_text.done", {
      type: "response.output_text.done",
      item_id: state.textItemId,
      output_index: outputIndex,
      content_index: 0,
      text: state.outputText,
    });
    writeSseEvent(res, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: state.textItemId,
      output_index: outputIndex,
      content_index: 0,
      part: item.content[0],
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item,
    });
    state.textDone = true;
  }
  for (const tool of [...state.tools.values()].sort((a, b) => (a.outputIndex ?? 0) - (b.outputIndex ?? 0))) {
    if (tool.started && !tool.stopped) {
      stopResponsesToolBlock(state, res, tool);
      output.push(state.completedOutput[state.completedOutput.length - 1]);
    }
  }
  output.sort((a, b) => responsesOutputIndex(a, state) - responsesOutputIndex(b, state));
  state.completedOutput = output;
  writeSseEvent(res, "response.completed", {
    type: "response.completed",
    response: {
      ...baseResponse(state, state.status, output),
      usage: normalizeResponsesUsage(state.usage),
    },
  });
  res.write("data: [DONE]\n\n");
  state.completed = true;
}

function failResponsesStream(
  state: {
    responseStarted: boolean;
    completed: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
    outputText: string;
    textItemId: string;
    textAdded: boolean;
    textDone: boolean;
    textOutputIndex: number | null;
    tools: Map<number, ToolStreamBlock>;
    completedOutput: JsonRecord[];
  },
  res: http.ServerResponse,
  error: StreamErrorEnvelope,
): void {
  if (state.completed) return;
  ensureResponsesStreamStart(state, res);
  const output = currentResponsesOutput(state);
  writeSseEvent(res, "response.failed", {
    type: "response.failed",
    response: {
      ...baseResponse(state, "failed", output),
      error: {
        message: error.message,
        ...(error.type ? { type: error.type } : {}),
        ...(error.code ? { code: error.code } : {}),
      },
    },
  });
  res.write("data: [DONE]\n\n");
  state.completed = true;
}

function currentResponsesOutput(
  state: {
    outputText: string;
    textItemId: string;
    textAdded: boolean;
    textDone: boolean;
    textOutputIndex: number | null;
    tools: Map<number, ToolStreamBlock>;
    completedOutput: JsonRecord[];
  },
): JsonRecord[] {
  const output = [...state.completedOutput];
  if (state.textAdded) {
    output.push({
      id: state.textItemId,
      type: "message",
      status: state.textDone ? "completed" : "in_progress",
      role: "assistant",
      content: [{ type: "output_text", text: state.outputText, annotations: [] }],
    });
  }
  for (const tool of [...state.tools.values()].sort((a, b) => (a.outputIndex ?? 0) - (b.outputIndex ?? 0))) {
    if (!tool.stopped) output.push(responsesFunctionCallItem(tool, tool.started ? "in_progress" : "completed"));
  }
  return output.sort((a, b) => responsesOutputIndex(a, state) - responsesOutputIndex(b, state));
}

function responsesOutputIndex(
  item: JsonRecord,
  state: {
    textItemId: string;
    textOutputIndex: number | null;
    tools: Map<number, ToolStreamBlock>;
  },
): number {
  if (item.id === state.textItemId) return state.textOutputIndex ?? 0;
  for (const tool of state.tools.values()) {
    if (item.id === responsesFunctionCallItemId(tool)) return tool.outputIndex ?? 0;
  }
  return 0;
}

function baseResponse(
  state: {
    responseId: string;
    model: string | null;
    createdAt: number;
  },
  status: string,
  output: JsonRecord[],
): JsonRecord {
  return {
    id: state.responseId,
    object: "response",
    created_at: state.createdAt,
    status,
    model: state.model,
    output,
    usage: null,
  };
}

function ensureToolBlock(
  blocks: Map<number, ToolStreamBlock>,
  sourceIndex: number,
  patch: { id?: string; name?: string; custom?: boolean },
): ToolStreamBlock {
  let block = blocks.get(sourceIndex);
  if (!block) {
    block = {
      id: patch.id || `call_${Date.now().toString(36)}_${sourceIndex}`,
      index: sourceIndex,
      name: patch.name || "tool",
      inputJson: "",
      custom: Boolean(patch.custom),
      started: false,
      stopped: false,
      sentChatStart: false,
      chatIndex: blocks.size,
      outputIndex: null,
    };
    blocks.set(sourceIndex, block);
    return block;
  }
  if (patch.id) block.id = patch.id;
  if (patch.name) block.name = patch.name;
  if (patch.custom) block.custom = true;
  return block;
}

function ensureResponsesToolBlock(
  payload: JsonRecord,
  item: JsonRecord | null,
  blocks: Map<number, ToolStreamBlock>,
  itemIdToIndex: Map<string, number>,
): ToolStreamBlock {
  const itemId = stringOrNull(item?.id) || stringOrNull(payload.item_id);
  const sourceIndex = itemId && itemIdToIndex.has(itemId)
    ? itemIdToIndex.get(itemId)!
    : numberOrNull(payload.output_index) ?? blocks.size;
  const callId = stringOrNull(item?.call_id) || stringOrNull(item?.id) || stringOrNull(payload.call_id) || itemId || undefined;
  const name = stringOrNull(item?.name) || stringOrNull(payload.name) || undefined;
  const tool = ensureToolBlock(blocks, sourceIndex, {
    id: callId,
    name,
    custom: item?.type === "custom_tool_call",
  });
  if (itemId) itemIdToIndex.set(itemId, sourceIndex);
  return tool;
}

function isResponsesToolCallItem(item: JsonRecord): boolean {
  return item.type === "function_call" || item.type === "custom_tool_call";
}

function responsesToolArguments(item: JsonRecord): string {
  if (item.type === "custom_tool_call") {
    return JSON.stringify({ input: typeof item.input === "string" ? item.input : "" });
  }
  return typeof item.arguments === "string" ? item.arguments : "";
}

function remainingToolArgumentsDelta(tool: ToolStreamBlock, argumentsValue: unknown): string {
  if (typeof argumentsValue !== "string" || !argumentsValue) return "";
  if (!tool.inputJson) return argumentsValue;
  if (argumentsValue.startsWith(tool.inputJson)) return argumentsValue.slice(tool.inputJson.length);
  if (tool.inputJson === argumentsValue) return "";
  return "";
}

function emitMissingChatToolCallsFromResponsesOutput(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  output: unknown,
  blocks: Map<number, ToolStreamBlock>,
  itemIdToIndex: Map<string, number>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesToolCallItem(item)) continue;
    const tool = ensureResponsesToolBlock({ output_index: index }, item, blocks, itemIdToIndex);
    const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(item));
    ensureChatStreamStart(state, res);
    writeChatToolCallStart(state, res, tool);
    if (remaining) {
      tool.inputJson += remaining;
      writeChatToolCallArguments(state, res, tool, remaining);
    }
  }
}

function emitMissingAnthropicToolUsesFromResponsesOutput(
  state: {
    nextContentIndex: number;
    tools: Map<number, ToolStreamBlock>;
    toolIndexByItemId: Map<string, number>;
    stopReason: string;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
  },
  res: http.ServerResponse,
  output: unknown,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesToolCallItem(item)) continue;
    closeAnthropicTextBlock(state, res);
    const tool = ensureResponsesToolBlock({ output_index: index }, item, state.tools, state.toolIndexByItemId);
    const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(item));
    pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
    stopAnthropicToolBlock(res, tool);
    state.stopReason = "tool_use";
  }
}

function pushAnthropicToolDeltaFromResponses(
  state: {
    nextContentIndex: number;
    tools: Map<number, ToolStreamBlock>;
  },
  res: http.ServerResponse,
  tool: ToolStreamBlock,
  argumentsDelta: string,
): void {
  if (!tool.started) {
    tool.index = state.nextContentIndex;
    state.nextContentIndex += 1;
    tool.started = true;
    writeSseEvent(res, "content_block_start", {
      type: "content_block_start",
      index: tool.index,
      content_block: {
        type: "tool_use",
        id: tool.id,
        name: tool.name,
        input: {},
      },
    });
  }
  if (argumentsDelta) {
    tool.inputJson += argumentsDelta;
    writeSseEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: tool.index,
      delta: {
        type: "input_json_delta",
        partial_json: argumentsDelta,
      },
    });
  }
}

function closeAnthropicTextBlock(
  state: {
    textBlockIndex: number | null;
    textBlockStopped: boolean;
  },
  res: http.ServerResponse,
): void {
  if (state.textBlockIndex === null || state.textBlockStopped) return;
  writeSseEvent(res, "content_block_stop", {
    type: "content_block_stop",
    index: state.textBlockIndex,
  });
  state.textBlockIndex = null;
  state.textBlockStopped = false;
}

function stopAnthropicToolBlock(res: http.ServerResponse, tool: ToolStreamBlock): void {
  if (!tool.started || tool.stopped) return;
  writeSseEvent(res, "content_block_stop", {
    type: "content_block_stop",
    index: tool.index,
  });
  tool.stopped = true;
}

function writeSseEvent(res: http.ServerResponse, event: string, payload: JsonRecord): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function firstChoice(payload: JsonRecord): JsonRecord | null {
  if (!Array.isArray(payload.choices)) return null;
  const [choice] = payload.choices;
  return isRecord(choice) ? choice : null;
}

function mapChatFinishReasonToAnthropic(finishReason: unknown, hasToolUses: boolean): string {
  if (finishReason === "tool_calls" || hasToolUses) return "tool_use";
  if (finishReason === "length") return "max_tokens";
  return "end_turn";
}

function mapAnthropicStopReasonToChat(stopReason: unknown, hasToolCalls: boolean): string {
  if (stopReason === "tool_use" || hasToolCalls) return "tool_calls";
  if (stopReason === "max_tokens") return "length";
  return "stop";
}

function mapChatUsageToAnthropic(usage: JsonRecord): JsonRecord {
  return {
    input_tokens: numberOrNull(usage.prompt_tokens) ?? 0,
    output_tokens: numberOrNull(usage.completion_tokens) ?? 0,
  };
}

function mapAnthropicUsageToChat(usage: JsonRecord): JsonRecord {
  const promptTokens = numberOrNull(usage.input_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
}

function mapResponsesUsageToChat(usage: JsonRecord): JsonRecord {
  const promptTokens = numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens) ?? 0;
  const totalTokens = numberOrNull(usage.total_tokens) ?? promptTokens + completionTokens;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
}

function mapResponsesUsageToAnthropic(usage: JsonRecord): JsonRecord {
  return {
    input_tokens: numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens) ?? 0,
    output_tokens: numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens) ?? 0,
  };
}

function mapAnthropicUsageToResponses(usage: JsonRecord): JsonRecord {
  const inputTokens = numberOrNull(usage.input_tokens) ?? 0;
  const outputTokens = numberOrNull(usage.output_tokens) ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    input_tokens_details: { cached_tokens: numberOrNull(usage.cache_read_input_tokens) || 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
}

function normalizeResponsesUsage(usage: JsonRecord | null): JsonRecord {
  const inputTokens = numberOrNull(usage?.input_tokens) ?? 0;
  const outputTokens = numberOrNull(usage?.output_tokens) ?? 0;
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: numberOrNull(usage?.total_tokens) ?? inputTokens + outputTokens,
    input_tokens_details: isRecord(usage?.input_tokens_details)
      ? usage?.input_tokens_details
      : { cached_tokens: 0 },
    output_tokens_details: isRecord(usage?.output_tokens_details)
      ? usage?.output_tokens_details
      : { reasoning_tokens: 0 },
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
