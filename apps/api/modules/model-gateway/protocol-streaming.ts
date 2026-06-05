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
}

interface ToolStreamBlock {
  id: string;
  index: number;
  name: string;
  inputJson: string;
  started: boolean;
  stopped: boolean;
  sentChatStart: boolean;
  chatIndex: number;
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

  await readSseEvents(upstreamBody, (event) => {
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

  await readSseEvents(upstreamBody, (event) => {
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

  await readSseEvents(upstreamBody, (event) => {
    if (event.done) {
      finalizeChatStream(state, res);
      return;
    }
    if (!event.json) return;
    if (event.event === "response.failed") {
      throw new Error(extractResponsesFailedMessage(event.json));
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
      if (event.json.item.type === "function_call") {
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
      if (event.json.item.type === "function_call") {
        const tool = ensureResponsesToolBlock(event.json, event.json.item, toolBlocks, toolIndexByItemId);
        const remaining = remainingToolArgumentsDelta(tool, event.json.item.arguments);
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

  await readSseEvents(upstreamBody, (event) => {
    if (event.done) {
      finalizeAnthropicTextStream(state, res);
      return;
    }
    if (!event.json) return;
    if (event.event === "response.failed") {
      throw new Error(extractResponsesFailedMessage(event.json));
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
      if (event.json.item.type === "function_call") {
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
      if (event.json.item.type === "function_call") {
        closeAnthropicTextBlock(state, res);
        ensureAnthropicTextMessageStart(state, res);
        const tool = ensureResponsesToolBlock(event.json, event.json.item, state.tools, state.toolIndexByItemId);
        const remaining = remainingToolArgumentsDelta(tool, event.json.item.arguments);
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

  finalizeAnthropicTextStream(state, res);
  return { id: state.messageId, model: state.model, outputText: state.text };
}

export async function writeCodexResponsesSseFromAnthropicMessagesSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
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
    usage: null as JsonRecord | null,
    status: "completed",
  };
  state.textItemId = `${state.responseId}_msg`;

  await readSseEvents(upstreamBody, (event) => {
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
    if (event.event === "content_block_delta" && isRecord(event.json.delta)) {
      const delta = event.json.delta;
      if (delta.type === "text_delta") {
        const text = stringOrNull(delta.text);
        if (text) pushResponsesTextDelta(state, res, text);
      }
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

  finalizeResponsesStream(state, res);
  return { id: state.responseId, model: state.model, outputText: state.outputText };
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

function extractResponsesFailedMessage(payload: JsonRecord): string {
  const response = isRecord(payload.response) ? payload.response : payload;
  const error = isRecord(response.error) ? response.error : isRecord(payload.error) ? payload.error : null;
  return stringOrNull(error?.message)
    || stringOrNull(response.error)
    || stringOrNull(payload.message)
    || "response.failed event received";
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
  },
  res: http.ServerResponse,
  delta: string,
): void {
  ensureResponsesStreamStart(state, res);
  if (!state.textAdded) {
    state.textAdded = true;
    writeSseEvent(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: 0,
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
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    });
  }
  state.outputText += delta;
  writeSseEvent(res, "response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: state.textItemId,
    output_index: 0,
    content_index: 0,
    delta,
  });
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
    usage: JsonRecord | null;
    status: string;
  },
  res: http.ServerResponse,
): void {
  if (state.completed) return;
  ensureResponsesStreamStart(state, res);
  const output: JsonRecord[] = [];
  if (state.textAdded && !state.textDone) {
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
      output_index: 0,
      content_index: 0,
      text: state.outputText,
    });
    writeSseEvent(res, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: state.textItemId,
      output_index: 0,
      content_index: 0,
      part: item.content[0],
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: 0,
      item,
    });
    state.textDone = true;
  }
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
  patch: { id?: string; name?: string },
): ToolStreamBlock {
  let block = blocks.get(sourceIndex);
  if (!block) {
    block = {
      id: patch.id || `call_${Date.now().toString(36)}_${sourceIndex}`,
      index: sourceIndex,
      name: patch.name || "tool",
      inputJson: "",
      started: false,
      stopped: false,
      sentChatStart: false,
      chatIndex: blocks.size,
    };
    blocks.set(sourceIndex, block);
    return block;
  }
  if (patch.id) block.id = patch.id;
  if (patch.name) block.name = patch.name;
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
  const tool = ensureToolBlock(blocks, sourceIndex, { id: callId, name });
  if (itemId) itemIdToIndex.set(itemId, sourceIndex);
  return tool;
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
    if (!isRecord(item) || item.type !== "function_call") continue;
    const tool = ensureResponsesToolBlock({ output_index: index }, item, blocks, itemIdToIndex);
    const remaining = remainingToolArgumentsDelta(tool, item.arguments);
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
    if (!isRecord(item) || item.type !== "function_call") continue;
    closeAnthropicTextBlock(state, res);
    const tool = ensureResponsesToolBlock({ output_index: index }, item, state.tools, state.toolIndexByItemId);
    const remaining = remainingToolArgumentsDelta(tool, item.arguments);
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
