import type http from "node:http";

import {
  isResponsesMcpOutputItem,
  responsesMcpCallToAnthropicToolBlocks,
  responsesMcpOutputItemToText,
} from "./mcp-translation.js";
import {
  isResponsesBuiltinToolOutputItem,
  responsesBuiltinToolOutputItemToText,
} from "./responses-output-items.js";

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
  stopSequences?: Iterable<string>;
  allowToolCalls?: boolean;
  legacyFunctionCalls?: boolean;
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

interface PendingToolDelta {
  id?: string;
  name?: string;
  arguments: string;
}

interface StopSequenceFilter {
  sequences: string[];
  pending: string;
  matched: string | null;
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
    pendingToolDeltas: new Map<number, PendingToolDelta>(),
    usage: { input_tokens: 0, output_tokens: 0 } as JsonRecord,
  };
  let sawFinishReason = false;

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
        if (!sawFinishReason) {
          const error = missingChatFinishReasonError();
          if (state.started) {
            failAnthropicStream(state, res, error);
            throw new ModelGatewayStreamAdapterError(error);
          }
          throw new Error(error.message);
        }
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
      const content = stringOrNull(delta.content) || stringOrNull(delta.refusal);
      if (content) pushAnthropicTextDeltaFromChat(state, res, content);
      if (Array.isArray(delta.tool_calls)) {
        for (const toolDelta of delta.tool_calls) pushAnthropicToolDeltaFromChat(state, res, toolDelta);
      }
      if (!Array.isArray(delta.tool_calls) && isRecord(delta.function_call)) {
        pushAnthropicToolDeltaFromChat(state, res, legacyChatFunctionCallDeltaToToolCall(delta.function_call));
      }
      const finishReason = stringOrNull(choice.finish_reason);
      if (finishReason) {
        sawFinishReason = true;
        state.stopReason = mapChatFinishReasonToAnthropic(finishReason, state.tools.size > 0);
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

  if (!sawFinishReason) {
    const error = missingChatFinishReasonError();
    if (state.started) {
      failAnthropicStream(state, res, error);
      throw new ModelGatewayStreamAdapterError(error);
    }
    throw new Error(error.message);
  }
  finalizeAnthropicFromChat(state, res);
  return { id: state.messageId, model: state.model, outputText: state.text };
}

export async function writeChatCompletionsSseFromAnthropicMessagesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
  options: StreamAdapterOptions = {},
): Promise<StreamResult> {
  const state = createChatStreamState(fallbackModel);
  const toolBlocks = new Map<number, ToolStreamBlock>();
  const legacyFunctionCalls = Boolean(options.legacyFunctionCalls);
  let sawMessageStop = false;

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
        if (isUsableAnthropicToolUseBlock(block)) {
          const tool = ensureToolBlock(toolBlocks, sourceIndex, {
            id: stringOrNull(block.id) || undefined,
            name: stringOrNull(block.name) || undefined,
          });
          if (!tool) return;
          writeChatToolCallStart(state, res, tool, legacyFunctionCalls);
          const inputJson = serializeToolInput(block.input);
          if (inputJson) {
            tool.inputJson += inputJson;
            writeChatToolCallArguments(state, res, tool, inputJson, legacyFunctionCalls);
          }
          return;
        }
        const fallbackText = anthropicStreamingContentBlockToText(block, "Chat");
        if (fallbackText) writeChatTextDelta(state, res, fallbackText);
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
          if (!toolBlocks.has(sourceIndex)) {
            const partialJson = stringOrNull(delta.partial_json) || "";
            if (partialJson) {
              writeChatTextDelta(
                state,
                res,
                `Anthropic Messages input_json_delta without usable tool_use for Chat at index ${sourceIndex}: ${partialJson}`,
              );
            }
            return;
          }
          const tool = ensureToolBlock(toolBlocks, sourceIndex, {});
          if (!tool) return;
          const partialJson = stringOrNull(delta.partial_json) || "";
          tool.inputJson += partialJson;
          writeChatToolCallArguments(state, res, tool, partialJson, legacyFunctionCalls);
        }
        return;
      }
      if (event.event === "message_delta") {
        if (isRecord(event.json.delta)) {
          state.finishReason = mapAnthropicStopReasonToChat(event.json.delta.stop_reason, toolBlocks.size > 0, legacyFunctionCalls);
        }
        if (isRecord(event.json.usage)) {
          state.usage = {
            ...state.usage,
            completion_tokens: numberOrNull(event.json.usage.output_tokens) ?? numberOrNull(state.usage.completion_tokens) ?? 0,
          };
          copyServerToolUse(event.json.usage, state.usage);
          state.usage.total_tokens = (numberOrNull(state.usage.prompt_tokens) ?? 0)
            + (numberOrNull(state.usage.completion_tokens) ?? 0);
        }
        return;
      }
      if (event.event === "message_stop") {
        sawMessageStop = true;
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

  if (!sawMessageStop) {
    const error = missingAnthropicMessageStopError();
    if (state.started) {
      failChatStream(state, res, error);
      throw new ModelGatewayStreamAdapterError(error);
    }
    throw new Error(error.message);
  }
  finalizeChatStream(state, res);
  return { id: state.id, model: state.model, outputText: state.outputText };
}

export async function writeChatCompletionsSseFromResponsesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
  options: StreamAdapterOptions = {},
): Promise<StreamResult> {
  const state = createChatStreamState(fallbackModel);
  const toolBlocks = new Map<number, ToolStreamBlock>();
  const toolIndexByItemId = new Map<string, number>();
  const emittedMcpItemKeys = new Set<string>();
  const emittedBuiltinToolItemKeys = new Set<string>();
  const emittedUnknownItemKeys = new Set<string>();
  const stopFilter = createStopSequenceFilter(options.stopSequences);
  const allowToolCalls = options.allowToolCalls !== false;
  const legacyFunctionCalls = Boolean(options.legacyFunctionCalls);
  let sawCompleted = false;

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (event.done) {
        if (!sawCompleted) {
          const error = missingResponsesCompletedError();
          if (state.started) {
            failChatStream(state, res, error);
            throw new ModelGatewayStreamAdapterError(error);
          }
          throw new Error(error.message);
        }
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
        throw new ModelGatewayStreamAdapterError(error);
      }
      const response = isRecord(event.json.response) ? event.json.response : event.json;
      const id = stringOrNull(response.id);
      if (id) state.id = id;
      const model = stringOrNull(response.model);
      if (model) state.model = model;
      if (event.event === "response.reasoning_summary_text.delta") {
        const delta = stringOrNull(event.json.delta) || stringOrNull(event.json.text);
        if (delta) {
          ensureChatStreamStart(state, res);
          writeChatReasoningDelta(state, res, delta);
        }
        return;
      }
      if (event.event === "response.output_text.delta" || event.event === "response.refusal.delta") {
        const delta = stringOrNull(event.json.delta) || stringOrNull(event.json.refusal);
        const isRefusal = event.event === "response.refusal.delta";
        if (delta) {
          const filtered = applyStopSequenceFilter(stopFilter, delta);
          if (filtered.delta) {
            ensureChatStreamStart(state, res);
            if (isRefusal) {
              writeChatRefusalDelta(state, res, filtered.delta);
            } else {
              writeChatTextDelta(state, res, filtered.delta);
            }
          }
          if (filtered.stopSequence) state.finishReason = "stop";
        }
        if (isRefusal && !stopFilter?.matched) state.finishReason = "content_filter";
        return;
      }
      if (event.event === "response.output_item.added" && isRecord(event.json.item)) {
        if (allowToolCalls && isUsableResponsesToolCallItem(event.json.item)) {
          const tool = ensureResponsesToolBlock(event.json, event.json.item, toolBlocks, toolIndexByItemId);
          if (!tool) return;
          ensureChatStreamStart(state, res);
          writeChatToolCallStart(state, res, tool, legacyFunctionCalls);
          state.finishReason = chatToolFinishReason(legacyFunctionCalls);
        }
        return;
      }
      if (event.event === "response.function_call_arguments.delta") {
        const delta = stringOrNull(event.json.delta) || "";
        if (!allowToolCalls || (!hasExistingResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId)
          && !hasResponsesToolIdentity(event.json, null))) {
          return;
        }
        const tool = ensureResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId);
        if (!tool) return;
        if (delta) {
          tool.inputJson += delta;
          ensureChatStreamStart(state, res);
          writeChatToolCallArguments(state, res, tool, delta, legacyFunctionCalls);
        }
        state.finishReason = chatToolFinishReason(legacyFunctionCalls);
        return;
      }
      if (event.event === "response.function_call_arguments.done") {
        if (!allowToolCalls || (!hasExistingResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId)
          && !hasResponsesToolIdentity(event.json, null))) {
          return;
        }
        const tool = ensureResponsesToolBlock(event.json, null, toolBlocks, toolIndexByItemId);
        if (!tool) return;
        const remaining = remainingToolArgumentsDelta(tool, event.json.arguments);
        if (remaining) {
          tool.inputJson += remaining;
          ensureChatStreamStart(state, res);
          writeChatToolCallArguments(state, res, tool, remaining, legacyFunctionCalls);
        }
        state.finishReason = chatToolFinishReason(legacyFunctionCalls);
        return;
      }
      if (event.event === "response.output_item.done" && isRecord(event.json.item)) {
        if (isResponsesMcpOutputItem(event.json.item)) {
          const text = responsesMcpOutputItemToText(event.json.item);
          if (text) {
            emittedMcpItemKeys.add(responsesMcpOutputItemKey(event.json, event.json.item));
            ensureChatStreamStart(state, res);
            writeChatTextDelta(state, res, text);
          }
          return;
        }
        if (isResponsesBuiltinToolOutputItem(event.json.item)) {
          const text = responsesBuiltinToolOutputItemToText(event.json.item);
          if (text) {
            emittedBuiltinToolItemKeys.add(responsesOutputItemKey(event.json, event.json.item));
            ensureChatStreamStart(state, res);
            writeChatTextDelta(state, res, text);
          }
          return;
        }
        if (allowToolCalls && isUsableResponsesToolCallItem(event.json.item)) {
          const tool = ensureResponsesToolBlock(event.json, event.json.item, toolBlocks, toolIndexByItemId);
          if (!tool) return;
          const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(event.json.item));
          ensureChatStreamStart(state, res);
          writeChatToolCallStart(state, res, tool, legacyFunctionCalls);
          if (remaining) {
            tool.inputJson += remaining;
            writeChatToolCallArguments(state, res, tool, remaining, legacyFunctionCalls);
          }
          state.finishReason = chatToolFinishReason(legacyFunctionCalls);
          return;
        }
        const unknownText = responsesUnknownOutputItemToText(event.json.item, { target: "Chat", allowToolCalls });
        if (unknownText) {
          emittedUnknownItemKeys.add(responsesOutputItemKey(event.json, event.json.item));
          ensureChatStreamStart(state, res);
          writeChatTextDelta(state, res, unknownText);
        }
        return;
      }
      if (event.event === "response.completed") {
        sawCompleted = true;
        if (isRecord(response.usage)) {
          state.usage = mapResponsesUsageToChat(response.usage);
          copyServiceTier(response.service_tier, state.usage);
        }
        if (allowToolCalls) {
          emitMissingChatToolCallsFromResponsesOutput(state, res, response.output, toolBlocks, toolIndexByItemId, legacyFunctionCalls);
        }
        emitMissingChatMcpOutputsFromResponsesOutput(state, res, response.output, emittedMcpItemKeys);
        emitMissingChatBuiltinToolOutputsFromResponsesOutput(state, res, response.output, emittedBuiltinToolItemKeys);
        emitMissingChatUnknownResponsesOutput(state, res, response.output, emittedUnknownItemKeys, allowToolCalls);
        const pending = flushStopSequenceFilter(stopFilter);
        if (pending) {
          ensureChatStreamStart(state, res);
          writeChatTextDelta(state, res, pending);
        }
        if (!stopFilter?.matched && state.finishReason !== "content_filter") {
          state.finishReason = response.status === "incomplete" ? "length" : "stop";
        }
        if (toolBlocks.size > 0 && state.finishReason === "stop") state.finishReason = chatToolFinishReason(legacyFunctionCalls);
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

  if (!sawCompleted) {
    const error = missingResponsesCompletedError();
    if (state.started) {
      failChatStream(state, res, error);
      throw new ModelGatewayStreamAdapterError(error);
    }
    throw new Error(error.message);
  }
  finalizeChatStream(state, res);
  return { id: state.id, model: state.model, outputText: state.outputText };
}

export async function writeAnthropicMessagesSseFromResponsesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
  options: StreamAdapterOptions = {},
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
    thinkingBlockIndex: null as number | null,
    thinkingBlockStopped: false,
    thinkingText: "",
    citations: [] as JsonRecord[],
    nextContentIndex: 0,
    tools: new Map<number, ToolStreamBlock>(),
    toolIndexByItemId: new Map<string, number>(),
    usage: { input_tokens: 0, output_tokens: 0 } as JsonRecord,
    stopSequence: null as string | null,
  };
  const emittedMcpItemKeys = new Set<string>();
  const emittedBuiltinToolItemKeys = new Set<string>();
  const emittedUnknownItemKeys = new Set<string>();
  const stopFilter = createStopSequenceFilter(options.stopSequences);
  let sawCompleted = false;

  try {
    await readSseEvents(upstreamBody, (event) => {
      if (state.completed) return;
      if (event.done) {
        if (!sawCompleted) {
          const error = missingResponsesCompletedError();
          if (state.started) {
            failAnthropicStream(state, res, error);
            throw new ModelGatewayStreamAdapterError(error);
          }
          throw new Error(error.message);
        }
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
        throw new ModelGatewayStreamAdapterError(error);
      }
      const response = isRecord(event.json.response) ? event.json.response : event.json;
      const id = stringOrNull(response.id);
      if (id && !state.started) state.messageId = id.startsWith("msg_") ? id : `msg_${id}`;
      const model = stringOrNull(response.model);
      if (model) state.model = model;
      if (event.event === "response.reasoning_summary_text.delta") {
        const delta = stringOrNull(event.json.delta) || stringOrNull(event.json.text);
        if (delta) {
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicThinkingDelta(state, res, delta);
        }
        return;
      }
      if (event.event === "response.output_text.delta" || event.event === "response.refusal.delta") {
        const delta = stringOrNull(event.json.delta) || stringOrNull(event.json.refusal);
        const isRefusal = event.event === "response.refusal.delta";
        if (delta) {
          const filtered = applyStopSequenceFilter(stopFilter, delta);
          if (filtered.delta) {
            closeAnthropicThinkingBlock(state, res);
            ensureAnthropicTextMessageStart(state, res);
            pushAnthropicTextDelta(state, res, filtered.delta);
          }
          if (filtered.stopSequence) {
            state.stopReason = "stop_sequence";
            state.stopSequence = filtered.stopSequence;
          }
        }
        if (isRefusal && !state.stopSequence) state.stopReason = "refusal";
        return;
      }
      if (event.event === "response.output_text.annotation.added" && isRecord(event.json.annotation)) {
        closeAnthropicThinkingBlock(state, res);
        ensureAnthropicTextMessageStart(state, res);
        pushAnthropicCitationDelta(state, res, event.json.annotation);
        return;
      }
      if (event.event === "response.output_item.added" && isRecord(event.json.item)) {
        if (isUsableResponsesToolCallItem(event.json.item)) {
          closeAnthropicThinkingBlock(state, res);
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          const tool = ensureResponsesToolBlock(event.json, event.json.item, state.tools, state.toolIndexByItemId);
          if (!tool) return;
          pushAnthropicToolDeltaFromResponses(state, res, tool, "");
          state.stopReason = "tool_use";
        }
        return;
      }
      if (event.event === "response.function_call_arguments.delta") {
        const delta = stringOrNull(event.json.delta) || "";
        if (!hasExistingResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId)
          && !hasResponsesToolIdentity(event.json, null)) {
          return;
        }
        const tool = ensureResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId);
        if (!tool) return;
        if (delta) {
          closeAnthropicThinkingBlock(state, res);
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicToolDeltaFromResponses(state, res, tool, delta);
        }
        state.stopReason = "tool_use";
        return;
      }
      if (event.event === "response.function_call_arguments.done") {
        if (!hasExistingResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId)
          && !hasResponsesToolIdentity(event.json, null)) {
          return;
        }
        const tool = ensureResponsesToolBlock(event.json, null, state.tools, state.toolIndexByItemId);
        if (!tool) return;
        const remaining = remainingToolArgumentsDelta(tool, event.json.arguments);
        if (remaining) {
          closeAnthropicThinkingBlock(state, res);
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
        }
        stopAnthropicToolBlock(res, tool);
        state.stopReason = "tool_use";
        return;
      }
      if (event.event === "response.output_item.done" && isRecord(event.json.item)) {
        if (isResponsesMcpOutputItem(event.json.item)) {
          const emitted = emitAnthropicMcpOutputFromResponsesItem(state, res, event.json.item);
          if (emitted) emittedMcpItemKeys.add(responsesMcpOutputItemKey(event.json, event.json.item));
          return;
        }
        if (isResponsesBuiltinToolOutputItem(event.json.item)) {
          const emitted = emitAnthropicBuiltinToolOutputFromResponsesItem(state, res, event.json.item);
          if (emitted) emittedBuiltinToolItemKeys.add(responsesOutputItemKey(event.json, event.json.item));
          return;
        }
        if (isUsableResponsesToolCallItem(event.json.item)) {
          closeAnthropicThinkingBlock(state, res);
          closeAnthropicTextBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          const tool = ensureResponsesToolBlock(event.json, event.json.item, state.tools, state.toolIndexByItemId);
          if (!tool) return;
          const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(event.json.item));
          pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
          stopAnthropicToolBlock(res, tool);
          state.stopReason = "tool_use";
          return;
        }
        const unknownText = responsesUnknownOutputItemToText(event.json.item, { target: "Anthropic Messages", allowToolCalls: true });
        if (unknownText) {
          emittedUnknownItemKeys.add(responsesOutputItemKey(event.json, event.json.item));
          closeAnthropicThinkingBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicTextDelta(state, res, unknownText);
        }
        return;
      }
      if (event.event === "response.completed") {
        sawCompleted = true;
        if (isRecord(response.usage)) {
          state.usage = mapResponsesUsageToAnthropic(response.usage);
          copyServiceTier(response.service_tier, state.usage);
        }
        closeAnthropicThinkingBlock(state, res);
        emitMissingAnthropicToolUsesFromResponsesOutput(state, res, response.output);
        emitMissingAnthropicMcpOutputsFromResponsesOutput(state, res, response.output, emittedMcpItemKeys);
        emitMissingAnthropicBuiltinToolOutputsFromResponsesOutput(state, res, response.output, emittedBuiltinToolItemKeys);
        emitMissingAnthropicUnknownResponsesOutput(state, res, response.output, emittedUnknownItemKeys);
        const pending = flushStopSequenceFilter(stopFilter);
        if (pending) {
          closeAnthropicThinkingBlock(state, res);
          ensureAnthropicTextMessageStart(state, res);
          pushAnthropicTextDelta(state, res, pending);
        }
        if (!state.stopSequence && state.stopReason !== "refusal") {
          state.stopReason = response.status === "incomplete" ? "max_tokens" : "end_turn";
        }
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

  if (!sawCompleted) {
    const error = missingResponsesCompletedError();
    if (state.started) {
      failAnthropicStream(state, res, error);
      throw new ModelGatewayStreamAdapterError(error);
    }
    throw new Error(error.message);
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
    annotations: [] as JsonRecord[],
    nextOutputIndex: 0,
    tools: new Map<number, ToolStreamBlock>(),
    customToolNames: new Set(options.customToolNames || []),
    completedOutput: [] as JsonRecord[],
    usage: null as JsonRecord | null,
    status: "completed",
  };
  state.textItemId = `${state.responseId}_msg`;
  let sawMessageStop = false;

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
        if (isUsableAnthropicToolUseBlock(block)) {
          const sourceIndex = numberOrNull(event.json.index) ?? state.tools.size;
          const tool = ensureToolBlock(state.tools, sourceIndex, {
            id: stringOrNull(block.id) || undefined,
            name: stringOrNull(block.name) || undefined,
            custom: state.customToolNames.has(stringOrNull(block.name) || ""),
          });
          if (!tool) return;
          ensureResponsesToolAdded(state, res, tool);
          const inputJson = serializeToolInput(block.input);
          if (inputJson) pushResponsesToolArgumentsDelta(res, tool, inputJson);
          return;
        }
        const fallbackText = anthropicStreamingContentBlockToText(block, "OpenAI Responses");
        if (fallbackText) pushResponsesTextDelta(state, res, fallbackText);
        return;
      }
      if (event.event === "content_block_delta" && isRecord(event.json.delta)) {
        const delta = event.json.delta;
        if (delta.type === "text_delta") {
          const text = stringOrNull(delta.text);
          if (text) pushResponsesTextDelta(state, res, text);
          return;
        }
        if (delta.type === "citations_delta" && isRecord(delta.citation)) {
          pushResponsesAnnotationDelta(state, res, delta.citation);
          return;
        }
        if (delta.type === "input_json_delta") {
          const sourceIndex = numberOrNull(event.json.index) ?? state.tools.size;
          if (!state.tools.has(sourceIndex)) {
            const partialJson = stringOrNull(delta.partial_json) || "";
            if (partialJson) {
              pushResponsesTextDelta(
                state,
                res,
                `Anthropic Messages input_json_delta without usable tool_use for OpenAI Responses at index ${sourceIndex}: ${partialJson}`,
              );
            }
            return;
          }
          const tool = ensureToolBlock(state.tools, sourceIndex, {});
          if (!tool) return;
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
          copyServerToolUse(event.json.usage, state.usage);
        }
        return;
      }
      if (event.event === "message_stop") {
        sawMessageStop = true;
        finalizeResponsesStream(state, res);
      }
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

  if (!sawMessageStop) {
    const error = missingAnthropicMessageStopError();
    if (state.responseStarted) {
      failResponsesStream(state, res, error);
      throw new ModelGatewayStreamAdapterError(error);
    }
    throw new Error(error.message);
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
    ? response.output
      .filter((item): item is JsonRecord => isRecord(item))
      .map(normalizeResponsesOutputItemAnnotations)
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
        const fallbackText = responsesSyntheticUnknownContentPartText(part);
        if (part.type !== "output_text" && part.type !== "refusal" && !fallbackText) return;
        const isRefusal = part.type === "refusal";
        const text = fallbackText || stringOrNull(isRefusal ? part.refusal : part.text) || "";
        const eventPart = fallbackText
          ? { type: "output_text", text: "", annotations: [] }
          : isRefusal ? { type: "refusal", refusal: "" } : { type: "output_text", text: "", annotations: [] };
        const donePart = fallbackText
          ? { type: "output_text", text, annotations: [] }
          : part;
        outputText += text;
        writeSseEvent(res, "response.content_part.added", {
          type: "response.content_part.added",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          part: eventPart,
        });
        if (text) {
          writeSseEvent(res, isRefusal ? "response.refusal.delta" : "response.output_text.delta", {
            type: isRefusal ? "response.refusal.delta" : "response.output_text.delta",
            item_id: itemId,
            output_index: outputIndex,
            content_index: contentIndex,
            delta: text,
          });
        }
        if (!isRefusal && Array.isArray(part.annotations)) {
          part.annotations.filter(isRecord).forEach((annotation, annotationIndex) => {
            writeSseEvent(res, "response.output_text.annotation.added", {
              type: "response.output_text.annotation.added",
              item_id: itemId,
              output_index: outputIndex,
              content_index: contentIndex,
              annotation_index: annotationIndex,
              annotation,
            });
          });
        }
        writeSseEvent(res, isRefusal ? "response.refusal.done" : "response.output_text.done", {
          type: isRefusal ? "response.refusal.done" : "response.output_text.done",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          ...(isRefusal ? { refusal: text } : { text }),
        });
        writeSseEvent(res, "response.content_part.done", {
          type: "response.content_part.done",
          item_id: itemId,
          output_index: outputIndex,
          content_index: contentIndex,
          part: donePart,
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

function responsesSyntheticUnknownContentPartText(part: JsonRecord): string {
  const type = stringOrNull(part.type);
  if (!type || type === "output_text" || type === "refusal") return "";
  return `OpenAI Responses unrecognized message content part for Responses SSE: ${stringifyCompact(part)}`;
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

function missingChatFinishReasonError(): StreamErrorEnvelope {
  return {
    message: "Chat stream ended without finish_reason.",
    type: "stream_error",
    code: "model_gateway_chat_stream_missing_finish_reason",
  };
}

function missingAnthropicMessageStopError(): StreamErrorEnvelope {
  return {
    message: "Anthropic stream ended without message_stop.",
    type: "stream_error",
    code: "model_gateway_anthropic_stream_missing_message_stop",
  };
}

function missingResponsesCompletedError(): StreamErrorEnvelope {
  return {
    message: "Responses stream ended without response.completed.",
    type: "stream_error",
    code: "model_gateway_responses_stream_missing_completed",
  };
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
  const usage: JsonRecord = {
    input_tokens: numberOrNull(state.usage.input_tokens) ?? 0,
    output_tokens: 0,
  };
  copyServerToolUse(state.usage, usage);
  copyServiceTier(state.usage.service_tier, usage);
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
      usage,
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

function pushAnthropicThinkingDelta(
  state: {
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    thinkingText?: string;
    nextContentIndex: number;
  },
  res: http.ServerResponse,
  delta: string,
): void {
  if (state.thinkingBlockIndex === undefined) return;
  if (state.thinkingBlockIndex === null) {
    state.thinkingBlockIndex = state.nextContentIndex;
    state.nextContentIndex += 1;
    state.thinkingBlockStopped = false;
    writeSseEvent(res, "content_block_start", {
      type: "content_block_start",
      index: state.thinkingBlockIndex,
      content_block: { type: "thinking", thinking: "" },
    });
  }
  state.thinkingText = `${state.thinkingText || ""}${delta}`;
  writeSseEvent(res, "content_block_delta", {
    type: "content_block_delta",
    index: state.thinkingBlockIndex,
    delta: { type: "thinking_delta", thinking: delta },
  });
}

function pushAnthropicCitationDelta(
  state: {
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    nextContentIndex: number;
    citations?: JsonRecord[];
  },
  res: http.ServerResponse,
  annotation: JsonRecord,
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
  const citation = mapResponsesAnnotationToAnthropicCitation(annotation);
  state.citations?.push(citation);
  writeSseEvent(res, "content_block_delta", {
    type: "content_block_delta",
    index: state.textBlockIndex,
    delta: { type: "citations_delta", citation },
  });
}

function pushAnthropicToolDeltaFromChat(
  state: {
    nextContentIndex: number;
    tools: Map<number, ToolStreamBlock>;
    pendingToolDeltas: Map<number, PendingToolDelta>;
  },
  res: http.ServerResponse,
  toolDelta: unknown,
): void {
  if (!isRecord(toolDelta)) return;
  const upstreamIndex = numberOrNull(toolDelta.index) ?? state.tools.size;
  const fn = isRecord(toolDelta.function) ? toolDelta.function : {};
  const id = stringOrNull(toolDelta.id) || undefined;
  const name = stringOrNull(fn.name) || undefined;
  const args = typeof fn.arguments === "string" ? fn.arguments : "";
  const existing = state.tools.get(upstreamIndex);
  let pending = state.pendingToolDeltas.get(upstreamIndex);
  if (!existing) {
    if (id || name || args) {
      pending = pending || { arguments: "" };
      if (id) pending.id = id;
      if (name) pending.name = name;
      pending.arguments += args;
      state.pendingToolDeltas.set(upstreamIndex, pending);
    }
    if (!pending?.id || !pending.name) {
      return;
    }
  }
  const tool = ensureToolBlock(state.tools, upstreamIndex, {
    id: id || pending?.id,
    name: name || pending?.name,
  });
  if (!tool) return;
  state.pendingToolDeltas.delete(upstreamIndex);
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
  const argumentsToEmit = existing
    ? `${pending?.arguments || ""}${args}`
    : pending?.arguments || args;
  if (argumentsToEmit) {
    tool.inputJson += argumentsToEmit;
    writeSseEvent(res, "content_block_delta", {
      type: "content_block_delta",
      index: tool.index,
      delta: {
        type: "input_json_delta",
        partial_json: argumentsToEmit,
      },
    });
  }
}

function legacyChatFunctionCallDeltaToToolCall(functionCall: JsonRecord): JsonRecord {
  const name = stringOrNull(functionCall.name);
  return {
    index: 0,
    ...(name ? { id: legacyChatFunctionCallId(name) } : {}),
    type: "function",
    function: {
      ...(name ? { name } : {}),
      arguments: typeof functionCall.arguments === "string" ? functionCall.arguments : "",
    },
  };
}

function legacyChatFunctionCallId(name: string | null): string {
  if (!name) return "call_legacy_function";
  return `call_${name.replace(/[^A-Za-z0-9_-]/g, "_") || "legacy_function"}`;
}

function finalizeAnthropicFromChat(
  state: {
    started: boolean;
    completed: boolean;
    messageId: string;
    model: string | null;
    stopReason: string;
    stopSequence?: string | null;
    text: string;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    nextContentIndex: number;
    tools: Map<number, ToolStreamBlock>;
    pendingToolDeltas: Map<number, PendingToolDelta>;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureAnthropicMessageStart(state, res);
  flushPendingAnthropicToolDeltasAsText(state, res);
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
  const usage: JsonRecord = {
    output_tokens: numberOrNull(state.usage.output_tokens) ?? 0,
  };
  copyServerToolUse(state.usage, usage);
  copyServiceTier(state.usage.service_tier, usage);
  writeSseEvent(res, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: state.stopReason,
      stop_sequence: state.stopSequence || null,
    },
    usage,
  });
  writeSseEvent(res, "message_stop", { type: "message_stop" });
  state.completed = true;
}

function flushPendingAnthropicToolDeltasAsText(
  state: {
    textBlockIndex: number | null;
    nextContentIndex: number;
    text: string;
    pendingToolDeltas: Map<number, PendingToolDelta>;
  },
  res: http.ServerResponse,
): void {
  const pendingText = [...state.pendingToolDeltas.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, pending]) => pendingToolDeltaToText(index, pending))
    .filter(Boolean)
    .join("\n");
  state.pendingToolDeltas.clear();
  if (pendingText) pushAnthropicTextDelta(state, res, pendingText);
}

function pendingToolDeltaToText(index: number, pending: PendingToolDelta): string {
  if (!pending.id && !pending.name && !pending.arguments) return "";
  return `OpenAI Chat streaming orphan tool_call delta for Anthropic Messages at index ${index}: ${stringifyCompact({
    id: pending.id,
    name: pending.name,
    arguments: pending.arguments,
  })}`;
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
    stopSequence?: string | null;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    usage: JsonRecord;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureAnthropicMessageStart(state, res);
  closeAnthropicThinkingBlock(state, res);
  if (state.textBlockIndex !== null && !state.textBlockStopped) {
    writeSseEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index: state.textBlockIndex,
    });
    state.textBlockStopped = true;
  }
  const usage: JsonRecord = {
    output_tokens: numberOrNull(state.usage.output_tokens) ?? 0,
  };
  copyServerToolUse(state.usage, usage);
  copyServiceTier(state.usage.service_tier, usage);
  writeSseEvent(res, "message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: state.stopReason,
      stop_sequence: state.stopSequence || null,
    },
    usage,
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

function writeChatRefusalDelta(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  delta: string,
): void {
  state.outputText += delta;
  writeChatChunk(state, res, { refusal: delta }, null);
}

function writeChatReasoningDelta(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  delta: string,
): void {
  writeChatChunk(state, res, { reasoning_content: delta }, null);
}

function writeChatToolCallStart(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  tool: ToolStreamBlock,
  legacyFunctionCalls = false,
): void {
  if (tool.sentChatStart) return;
  tool.sentChatStart = true;
  if (legacyFunctionCalls) {
    writeChatChunk(state, res, {
      function_call: {
        name: tool.name,
        arguments: "",
      },
    }, null);
    return;
  }
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
  legacyFunctionCalls = false,
): void {
  writeChatToolCallStart(state, res, tool, legacyFunctionCalls);
  if (!partialJson) return;
  if (legacyFunctionCalls) {
    writeChatChunk(state, res, {
      function_call: { arguments: partialJson },
    }, null);
    return;
  }
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
    annotations?: JsonRecord[];
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

function pushResponsesAnnotationDelta(
  state: {
    responseStarted: boolean;
    responseId: string;
    model: string | null;
    createdAt: number;
    outputText: string;
    textItemId: string;
    textAdded: boolean;
    textOutputIndex: number | null;
    annotations?: JsonRecord[];
    nextOutputIndex: number;
  },
  res: http.ServerResponse,
  citation: JsonRecord,
): void {
  pushResponsesTextDelta(state, res, "");
  const annotation = mapAnthropicCitationToResponsesAnnotation(citation);
  const annotationIndex = state.annotations?.length ?? 0;
  state.annotations?.push(annotation);
  writeSseEvent(res, "response.output_text.annotation.added", {
    type: "response.output_text.annotation.added",
    item_id: state.textItemId,
    output_index: state.textOutputIndex,
    content_index: 0,
    annotation_index: annotationIndex,
    annotation,
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
    annotations?: JsonRecord[];
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
      content: [{ type: "output_text", text: state.outputText, annotations: state.annotations || [] }],
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
): ToolStreamBlock | null {
  let block = blocks.get(sourceIndex);
  if (!block) {
    if (!patch.id || !patch.name) return null;
    block = {
      id: patch.id,
      index: sourceIndex,
      name: patch.name,
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
): ToolStreamBlock | null {
  const itemId = stringOrNull(item?.id) || stringOrNull(payload.item_id);
  const sourceIndex = itemId && itemIdToIndex.has(itemId)
    ? itemIdToIndex.get(itemId)!
    : numberOrNull(payload.output_index) ?? blocks.size;
  const callId = stringOrNull(item?.call_id) || stringOrNull(payload.call_id) || undefined;
  const name = stringOrNull(item?.name) || stringOrNull(payload.name) || undefined;
  const tool = ensureToolBlock(blocks, sourceIndex, {
    id: callId,
    name,
    custom: item?.type === "custom_tool_call",
  });
  if (!tool) return null;
  if (itemId) itemIdToIndex.set(itemId, sourceIndex);
  return tool;
}


function anthropicStreamingContentBlockToText(block: JsonRecord, target: "Chat" | "OpenAI Responses"): string {
  const type = stringOrNull(block.type);
  if (!type) return "";
  if (type === "text") return stringOrNull(block.text) || "";
  if (type === "thinking" || type === "redacted_thinking") return "";
  if (type === "tool_use") {
    if (!stringOrNull(block.id) && !stringOrNull(block.name) && !serializeToolInput(block.input)) return "";
    return `Anthropic Messages malformed tool_use for ${target}: ${stringifyCompact(block)}`;
  }
  if (type === "mcp_tool_use") {
    return isUsableAnthropicMcpToolUseBlock(block)
      ? `Anthropic Messages mcp_tool_use preserved for ${target}: ${stringifyCompact(block)}`
      : `Anthropic Messages malformed mcp_tool_use for ${target}: ${stringifyCompact(block)}`;
  }
  if (type === "mcp_tool_result") {
    return stringOrNull(block.tool_use_id)
      ? `Anthropic Messages mcp_tool_result preserved for ${target}: ${stringifyCompact(block)}`
      : `Anthropic Messages malformed mcp_tool_result for ${target}: ${stringifyCompact(block)}`;
  }
  return `Anthropic Messages unrecognized content block for ${target}: ${stringifyCompact(block)}`;
}

function isUsableAnthropicMcpToolUseBlock(block: JsonRecord): boolean {
  return block.type === "mcp_tool_use"
    && Boolean(stringOrNull(block.id) && stringOrNull(block.name) && (stringOrNull(block.server_name) || stringOrNull(block.server_label)));
}

function isResponsesToolCallItem(item: JsonRecord): boolean {
  return item.type === "function_call" || item.type === "custom_tool_call";
}

function isUsableAnthropicToolUseBlock(block: JsonRecord): boolean {
  return block.type === "tool_use" && Boolean(stringOrNull(block.id) && stringOrNull(block.name));
}

function isUsableResponsesToolCallItem(item: JsonRecord): boolean {
  return isResponsesToolCallItem(item) && hasResponsesToolIdentity({}, item);
}

function hasResponsesToolIdentity(payload: JsonRecord, item: JsonRecord | null): boolean {
  return Boolean(
    (stringOrNull(item?.call_id) || stringOrNull(payload.call_id))
    && (stringOrNull(item?.name) || stringOrNull(payload.name)),
  );
}

function hasExistingResponsesToolBlock(
  payload: JsonRecord,
  item: JsonRecord | null,
  blocks: Map<number, ToolStreamBlock>,
  itemIdToIndex: Map<string, number>,
): boolean {
  const itemId = stringOrNull(item?.id) || stringOrNull(payload.item_id);
  if (itemId && itemIdToIndex.has(itemId)) return true;
  const sourceIndex = numberOrNull(payload.output_index);
  return sourceIndex !== null && blocks.has(sourceIndex);
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
  legacyFunctionCalls = false,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isUsableResponsesToolCallItem(item)) continue;
    const tool = ensureResponsesToolBlock({ output_index: index }, item, blocks, itemIdToIndex);
    if (!tool) continue;
    const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(item));
    ensureChatStreamStart(state, res);
    writeChatToolCallStart(state, res, tool, legacyFunctionCalls);
    if (remaining) {
      tool.inputJson += remaining;
      writeChatToolCallArguments(state, res, tool, remaining, legacyFunctionCalls);
    }
  }
}

function emitMissingChatMcpOutputsFromResponsesOutput(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesMcpOutputItem(item)) continue;
    const key = responsesMcpOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    const text = responsesMcpOutputItemToText(item);
    if (!text) continue;
    emittedKeys.add(key);
    ensureChatStreamStart(state, res);
    writeChatTextDelta(state, res, text);
  }
}

function emitMissingChatBuiltinToolOutputsFromResponsesOutput(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesBuiltinToolOutputItem(item)) continue;
    const key = responsesOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    const text = responsesBuiltinToolOutputItemToText(item);
    if (!text) continue;
    emittedKeys.add(key);
    ensureChatStreamStart(state, res);
    writeChatTextDelta(state, res, text);
  }
}


function emitMissingChatUnknownResponsesOutput(
  state: ReturnType<typeof createChatStreamState>,
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
  allowToolCalls: boolean,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item)) continue;
    const key = responsesOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    const text = responsesUnknownOutputItemToText(item, { target: "Chat", allowToolCalls });
    if (!text) continue;
    emittedKeys.add(key);
    ensureChatStreamStart(state, res);
    writeChatTextDelta(state, res, text);
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
    if (!isRecord(item) || !isUsableResponsesToolCallItem(item)) continue;
    closeAnthropicTextBlock(state, res);
    const tool = ensureResponsesToolBlock({ output_index: index }, item, state.tools, state.toolIndexByItemId);
    if (!tool) continue;
    const remaining = remainingToolArgumentsDelta(tool, responsesToolArguments(item));
    pushAnthropicToolDeltaFromResponses(state, res, tool, remaining);
    stopAnthropicToolBlock(res, tool);
    state.stopReason = "tool_use";
  }
}

function emitMissingAnthropicBuiltinToolOutputsFromResponsesOutput(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesBuiltinToolOutputItem(item)) continue;
    const key = responsesOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    const emitted = emitAnthropicBuiltinToolOutputFromResponsesItem(state, res, item);
    if (emitted) emittedKeys.add(key);
  }
}

function emitMissingAnthropicMcpOutputsFromResponsesOutput(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item) || !isResponsesMcpOutputItem(item)) continue;
    const key = responsesMcpOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    if (emitAnthropicMcpOutputFromResponsesItem(state, res, item)) emittedKeys.add(key);
  }
}


function emitMissingAnthropicUnknownResponsesOutput(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  output: unknown,
  emittedKeys: Set<string>,
): void {
  if (!Array.isArray(output)) return;
  for (let index = 0; index < output.length; index += 1) {
    const item = output[index];
    if (!isRecord(item)) continue;
    const key = responsesOutputItemKey({ output_index: index }, item);
    if (emittedKeys.has(key)) continue;
    const text = responsesUnknownOutputItemToText(item, { target: "Anthropic Messages", allowToolCalls: true });
    if (!text) continue;
    emittedKeys.add(key);
    closeAnthropicThinkingBlock(state, res);
    ensureAnthropicTextMessageStart(state, res);
    pushAnthropicTextDelta(state, res, text);
  }
}

function responsesUnknownOutputItemToText(
  item: JsonRecord,
  options: { target: "Chat" | "Anthropic Messages"; allowToolCalls: boolean },
): string {
  if (item.type === "message") return responsesUnknownMessageContentToText(item.content, options.target);
  if (item.type === "function_call" || item.type === "custom_tool_call") {
    if (!options.allowToolCalls) return `OpenAI Responses ${item.type} omitted for ${options.target}: ${stringifyCompact(item)}`;
    return isUsableResponsesToolCallItem(item) ? "" : `OpenAI Responses malformed ${item.type} for ${options.target}: ${stringifyCompact(item)}`;
  }
  if (!stringOrNull(item.type)) return "";
  if (item.type === "output_text" || item.type === "refusal" || item.type === "reasoning") return "";
  if (isResponsesMcpOutputItem(item) || isResponsesBuiltinToolOutputItem(item)) return "";
  return `OpenAI Responses unrecognized output item for ${options.target}: ${stringifyCompact(item)}`;
}

function responsesUnknownMessageContentToText(content: unknown, target: "Chat" | "Anthropic Messages"): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part) || !stringOrNull(part.type)) return "";
      const transcript = stringOrNull(part.transcript);
      if (transcript) return transcript;
      if (part.type === "output_text" || part.type === "refusal") return "";
      return `OpenAI Responses unrecognized message content part for ${target}: ${stringifyCompact(part)}`;
    })
    .filter(Boolean)
    .join("");
}

function emitAnthropicBuiltinToolOutputFromResponsesItem(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  item: JsonRecord,
): boolean {
  const text = responsesBuiltinToolOutputItemToText(item);
  if (!text) return false;
  closeAnthropicThinkingBlock(state, res);
  ensureAnthropicTextMessageStart(state, res);
  pushAnthropicTextDelta(state, res, text);
  return true;
}

function emitAnthropicMcpOutputFromResponsesItem(
  state: {
    started: boolean;
    messageId: string;
    model: string | null;
    usage: JsonRecord;
    textBlockIndex: number | null;
    textBlockStopped: boolean;
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
    nextContentIndex: number;
    text: string;
  },
  res: http.ServerResponse,
  item: JsonRecord,
): boolean {
  if (item.type === "mcp_call") {
    closeAnthropicThinkingBlock(state, res);
    closeAnthropicTextBlock(state, res);
    ensureAnthropicTextMessageStart(state, res);
    return emitAnthropicMcpToolBlocksFromResponsesCall(state, res, item);
  }

  const text = responsesMcpOutputItemToText(item);
  if (!text) return false;
  closeAnthropicThinkingBlock(state, res);
  ensureAnthropicTextMessageStart(state, res);
  pushAnthropicTextDelta(state, res, text);
  return true;
}

function emitAnthropicMcpToolBlocksFromResponsesCall(
  state: { nextContentIndex: number },
  res: http.ServerResponse,
  item: JsonRecord,
): boolean {
  const blocks = responsesMcpCallToAnthropicToolBlocks(item);
  if (!blocks.length) return false;
  for (const block of blocks) {
    const index = state.nextContentIndex;
    state.nextContentIndex += 1;
    writeSseEvent(res, "content_block_start", {
      type: "content_block_start",
      index,
      content_block: block,
    });
    writeSseEvent(res, "content_block_stop", {
      type: "content_block_stop",
      index,
    });
  }
  return true;
}


function responsesMcpOutputItemKey(payload: JsonRecord, item: JsonRecord): string {
  return responsesOutputItemKey(payload, item);
}

function responsesOutputItemKey(payload: JsonRecord, item: JsonRecord): string {
  return stringOrNull(item.id)
    || stringOrNull(payload.item_id)
    || `${String(item.type || "output")}:${numberOrNull(payload.output_index) ?? "?"}`;
}

function createStopSequenceFilter(stopSequences: Iterable<string> | undefined): StopSequenceFilter | null {
  const sequences = Array.from(stopSequences || [])
    .filter((sequence): sequence is string => typeof sequence === "string" && sequence.length > 0);
  return sequences.length ? { sequences, pending: "", matched: null } : null;
}

function applyStopSequenceFilter(filter: StopSequenceFilter | null, delta: string): {
  delta: string;
  stopSequence: string | null;
} {
  if (!filter) return { delta, stopSequence: null };
  if (filter.matched) return { delta: "", stopSequence: filter.matched };

  const combined = filter.pending + delta;
  const stop = findEarliestStopSequence(combined, filter.sequences);
  if (stop) {
    filter.pending = "";
    filter.matched = stop.sequence;
    return { delta: combined.slice(0, stop.index), stopSequence: stop.sequence };
  }

  const keep = longestStopSequencePrefixSuffixLength(combined, filter.sequences);
  filter.pending = keep > 0 ? combined.slice(-keep) : "";
  return {
    delta: keep > 0 ? combined.slice(0, -keep) : combined,
    stopSequence: null,
  };
}

function flushStopSequenceFilter(filter: StopSequenceFilter | null): string {
  if (!filter || filter.matched) return "";
  const pending = filter.pending;
  filter.pending = "";
  return pending;
}

function findEarliestStopSequence(text: string, stopSequences: string[]): { index: number; sequence: string } | null {
  let best: { index: number; sequence: string } | null = null;
  for (const sequence of stopSequences) {
    const index = text.indexOf(sequence);
    if (index === -1) continue;
    if (!best || index < best.index) best = { index, sequence };
  }
  return best;
}

function longestStopSequencePrefixSuffixLength(text: string, stopSequences: string[]): number {
  let best = 0;
  for (const sequence of stopSequences) {
    const maxLength = Math.min(sequence.length - 1, text.length);
    for (let length = maxLength; length > best; length -= 1) {
      if (text.endsWith(sequence.slice(0, length))) {
        best = length;
        break;
      }
    }
  }
  return best;
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

function closeAnthropicThinkingBlock(
  state: {
    thinkingBlockIndex?: number | null;
    thinkingBlockStopped?: boolean;
  },
  res: http.ServerResponse,
): void {
  if (state.thinkingBlockIndex === undefined || state.thinkingBlockIndex === null || state.thinkingBlockStopped) return;
  writeSseEvent(res, "content_block_stop", {
    type: "content_block_stop",
    index: state.thinkingBlockIndex,
  });
  state.thinkingBlockIndex = null;
  state.thinkingBlockStopped = false;
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
  if (hasToolUses) return "tool_use";
  if (finishReason === "length") return "max_tokens";
  if (finishReason === "content_filter") return "refusal";
  return "end_turn";
}

function mapAnthropicStopReasonToChat(stopReason: unknown, hasToolCalls: boolean, legacyFunctionCalls = false): string {
  if (hasToolCalls) return chatToolFinishReason(legacyFunctionCalls);
  if (stopReason === "max_tokens") return "length";
  if (stopReason === "refusal") return "content_filter";
  return "stop";
}

function chatToolFinishReason(legacyFunctionCalls: boolean): string {
  return legacyFunctionCalls ? "function_call" : "tool_calls";
}

function mapChatUsageToAnthropic(usage: JsonRecord): JsonRecord {
  const mapped: JsonRecord = {
    input_tokens: numberOrNull(usage.prompt_tokens) ?? 0,
    output_tokens: numberOrNull(usage.completion_tokens) ?? 0,
  };
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}

function mapAnthropicUsageToChat(usage: JsonRecord): JsonRecord {
  const promptTokens = numberOrNull(usage.input_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? 0;
  const mapped: JsonRecord = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
  };
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}

function mapResponsesUsageToChat(usage: JsonRecord): JsonRecord {
  const promptTokens = numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens) ?? 0;
  const completionTokens = numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens) ?? 0;
  const totalTokens = numberOrNull(usage.total_tokens) ?? promptTokens + completionTokens;
  const mapped: JsonRecord = {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
  };
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}


function normalizeResponsesOutputItemAnnotations(item: JsonRecord): JsonRecord {
  if (!Array.isArray(item.content)) return item;
  const content = item.content.map((part) => {
    if (!isRecord(part) || !Array.isArray(part.annotations)) return part;
    return {
      ...part,
      annotations: part.annotations
        .filter(isRecord)
        .map(normalizeResponsesAnnotation),
    };
  });
  return { ...item, content };
}

function normalizeResponsesAnnotation(annotation: JsonRecord): JsonRecord {
  if (
    annotation.type === "web_search_result_location"
    || annotation.type === "page_location"
    || annotation.type === "char_location"
    || annotation.type === "content_block_location"
  ) {
    return mapAnthropicCitationToResponsesAnnotation(annotation);
  }
  return { ...annotation };
}

function mapResponsesAnnotationToAnthropicCitation(annotation: JsonRecord): JsonRecord {
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

function mapAnthropicCitationToResponsesAnnotation(citation: JsonRecord): JsonRecord {
  if (citation.type === "web_search_result_location") {
    const mapped: JsonRecord = { type: "url_citation" };
    if (citation.url !== undefined) mapped.url = citation.url;
    if (citation.title !== undefined) mapped.title = citation.title;
    if (citation.start_char_index !== undefined) mapped.start_index = citation.start_char_index;
    if (citation.end_char_index !== undefined) mapped.end_index = citation.end_char_index;
    return mapped;
  }
  if (citation.type === "page_location" || citation.type === "char_location" || citation.type === "content_block_location") {
    const mapped: JsonRecord = { type: "file_citation" };
    if (citation.file_id !== undefined) mapped.file_id = citation.file_id;
    if (citation.document_title !== undefined) mapped.filename = citation.document_title;
    if (citation.document_index !== undefined) mapped.index = citation.document_index;
    return mapped;
  }
  return { ...citation };
}

function mapResponsesUsageToAnthropic(usage: JsonRecord): JsonRecord {
  const mapped: JsonRecord = {
    input_tokens: numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens) ?? 0,
    output_tokens: numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens) ?? 0,
  };
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}

function mapAnthropicUsageToResponses(usage: JsonRecord): JsonRecord {
  const inputTokens = numberOrNull(usage.input_tokens) ?? 0;
  const outputTokens = numberOrNull(usage.output_tokens) ?? 0;
  const mapped: JsonRecord = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    input_tokens_details: { cached_tokens: numberOrNull(usage.cache_read_input_tokens) || 0 },
    output_tokens_details: { reasoning_tokens: 0 },
  };
  copyServerToolUse(usage, mapped);
  copyServiceTier(usage.service_tier, mapped);
  return mapped;
}

function copyServiceTier(value: unknown, target: JsonRecord): void {
  const serviceTier = stringOrNull(value);
  if (serviceTier) target.service_tier = serviceTier;
}

function copyServerToolUse(source: JsonRecord, target: JsonRecord): void {
  if (isRecord(source.server_tool_use)) target.server_tool_use = { ...source.server_tool_use };
}

function normalizeResponsesUsage(usage: JsonRecord | null): JsonRecord {
  const inputTokens = numberOrNull(usage?.input_tokens) ?? 0;
  const outputTokens = numberOrNull(usage?.output_tokens) ?? 0;
  const mapped: JsonRecord = {
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
  if (usage) {
    copyServerToolUse(usage, mapped);
    copyServiceTier(usage.service_tier, mapped);
  }
  return mapped;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringifyCompact(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
