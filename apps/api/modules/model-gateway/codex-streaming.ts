import type http from "node:http";

type JsonRecord = Record<string, unknown>;

export interface CodexStreamingAdapterResult {
  responseId: string;
  model: string | null;
  outputText: string;
  output: JsonRecord[];
}

interface TextState {
  added: boolean;
  done: boolean;
  itemId: string;
  outputIndex: number | null;
  text: string;
}

interface FunctionCallState {
  added: boolean;
  done: boolean;
  itemId: string;
  outputIndex: number;
  callId: string;
  name: string;
  arguments: string;
  reasoningContent: string | null;
}

interface ReasoningState {
  added: boolean;
  done: boolean;
  itemId: string;
  outputIndex: number | null;
  text: string;
}

interface StreamingState {
  responseStarted: boolean;
  completed: boolean;
  responseId: string;
  model: string | null;
  createdAt: number;
  finishReason: string | null;
  usage: JsonRecord | null;
  nextOutputIndex: number;
  inlineThinkActive: boolean;
  completedOutput: JsonRecord[];
  reasoning: ReasoningState;
  text: TextState;
  functionCalls: Map<number, FunctionCallState>;
}

export async function writeCodexResponsesSseFromChatSse(
  upstreamBody: ReadableStream<Uint8Array>,
  res: http.ServerResponse,
  fallbackModel: string | null,
): Promise<CodexStreamingAdapterResult> {
  const reader = upstreamBody.getReader();
  const decoder = new TextDecoder();
  const state = createStreamingState(fallbackModel);
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      buffer = consumeSseBlocks(buffer, state, res);
    }
    if (done) break;
  }

  if (buffer.trim()) {
    consumeSseBlock(buffer, state, res);
  }
  finalizeResponse(state, res);

  return {
    responseId: state.responseId,
    model: state.model,
    outputText: state.text.text,
    output: state.completedOutput,
  };
}

function createStreamingState(fallbackModel: string | null): StreamingState {
  const responseId = `resp_${Date.now().toString(36)}`;
  return {
    responseStarted: false,
    completed: false,
    responseId,
    model: fallbackModel,
    createdAt: Math.floor(Date.now() / 1_000),
    finishReason: null,
    usage: null,
    nextOutputIndex: 0,
    inlineThinkActive: false,
    completedOutput: [],
    reasoning: {
      added: false,
      done: false,
      itemId: `${responseId}_reasoning`,
      outputIndex: null,
      text: "",
    },
    text: {
      added: false,
      done: false,
      itemId: `${responseId}_msg`,
      outputIndex: null,
      text: "",
    },
    functionCalls: new Map(),
  };
}

function consumeSseBlocks(buffer: string, state: StreamingState, res: http.ServerResponse): string {
  let rest = buffer;
  for (;;) {
    const normalized = rest.replace(/\r\n/g, "\n");
    const index = normalized.indexOf("\n\n");
    if (index < 0) return rest;
    const block = normalized.slice(0, index);
    rest = normalized.slice(index + 2);
    consumeSseBlock(block, state, res);
  }
}

function consumeSseBlock(block: string, state: StreamingState, res: http.ServerResponse): void {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n")
    .trim();
  if (!data) return;
  if (data === "[DONE]") {
    finalizeResponse(state, res);
    return;
  }

  let chunk: JsonRecord;
  try {
    const parsed = JSON.parse(data) as unknown;
    if (!isRecord(parsed)) return;
    chunk = parsed;
  } catch {
    return;
  }

  handleChatChunk(chunk, state, res);
}

function handleChatChunk(chunk: JsonRecord, state: StreamingState, res: http.ServerResponse): void {
  const id = stringOrNull(chunk.id);
  if (id) {
    state.responseId = id;
    if (!state.text.added) state.text.itemId = `${id}_msg`;
    if (!state.reasoning.added) state.reasoning.itemId = `${id}_reasoning`;
  }
  const model = stringOrNull(chunk.model);
  if (model) state.model = model;
  if (typeof chunk.created === "number") state.createdAt = chunk.created;
  if (isRecord(chunk.usage)) state.usage = mapChatUsageToResponses(chunk.usage);

  ensureResponseStarted(state, res);

  const choice = firstChoice(chunk);
  if (!choice) return;
  const delta = isRecord(choice.delta) ? choice.delta : {};
  const reasoningDelta = extractReasoningDelta(delta);
  if (reasoningDelta) pushReasoningDelta(reasoningDelta, state, res);
  const content = stringOrNull(delta.content);
  if (content) {
    const parts = splitContentAndInlineReasoning(content, state);
    if (parts.reasoning) pushReasoningDelta(parts.reasoning, state, res);
    if (parts.text) pushTextDelta(parts.text, state, res);
  }
  if (Array.isArray(delta.tool_calls)) {
    for (const toolCallDelta of delta.tool_calls) {
      pushFunctionCallDelta(toolCallDelta, state, res);
    }
  }
  const finishReason = stringOrNull(choice.finish_reason);
  if (finishReason) state.finishReason = finishReason;
}

function ensureResponseStarted(state: StreamingState, res: http.ServerResponse): void {
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

function pushReasoningDelta(delta: string, state: StreamingState, res: http.ServerResponse): void {
  if (!state.reasoning.added) {
    state.reasoning.added = true;
    state.reasoning.outputIndex = state.nextOutputIndex;
    state.nextOutputIndex += 1;
    writeSseEvent(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.reasoning.outputIndex,
      item: reasoningItem(state, "in_progress"),
    });
    writeSseEvent(res, "response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      item_id: state.reasoning.itemId,
      output_index: state.reasoning.outputIndex,
      summary_index: 0,
      part: {
        type: "summary_text",
        text: "",
      },
    });
  }

  state.reasoning.text += delta;
  writeSseEvent(res, "response.reasoning_summary_text.delta", {
    type: "response.reasoning_summary_text.delta",
    item_id: state.reasoning.itemId,
    output_index: state.reasoning.outputIndex,
    summary_index: 0,
    delta,
  });
}

function pushTextDelta(delta: string, state: StreamingState, res: http.ServerResponse): void {
  if (!state.text.added) {
    state.text.added = true;
    state.text.outputIndex = state.nextOutputIndex;
    state.nextOutputIndex += 1;
    writeSseEvent(res, "response.output_item.added", {
      type: "response.output_item.added",
      output_index: state.text.outputIndex,
      item: {
        id: state.text.itemId,
        type: "message",
        status: "in_progress",
        role: "assistant",
        content: [],
      },
    });
    writeSseEvent(res, "response.content_part.added", {
      type: "response.content_part.added",
      item_id: state.text.itemId,
      output_index: state.text.outputIndex,
      content_index: 0,
      part: {
        type: "output_text",
        text: "",
        annotations: [],
      },
    });
  }

  state.text.text += delta;
  writeSseEvent(res, "response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: state.text.itemId,
    output_index: state.text.outputIndex,
    content_index: 0,
    delta,
  });
}

function pushFunctionCallDelta(toolCallDelta: unknown, state: StreamingState, res: http.ServerResponse): void {
  if (!isRecord(toolCallDelta)) return;
  const sourceIndex = numberOrNull(toolCallDelta.index) ?? state.functionCalls.size;
  const fn = isRecord(toolCallDelta.function) ? toolCallDelta.function : {};
  const tool = ensureFunctionCall(sourceIndex, state, {
    id: stringOrNull(toolCallDelta.id) || undefined,
    name: stringOrNull(fn.name) || undefined,
  });
  if (state.reasoning.text.trim() && !tool.reasoningContent) {
    tool.reasoningContent = state.reasoning.text.trim();
  }
  ensureFunctionCallAdded(tool, res);

  const argumentsDelta = typeof fn.arguments === "string" ? fn.arguments : "";
  if (argumentsDelta) {
    tool.arguments += argumentsDelta;
    writeSseEvent(res, "response.function_call_arguments.delta", {
      type: "response.function_call_arguments.delta",
      item_id: tool.itemId,
      output_index: tool.outputIndex,
      delta: argumentsDelta,
    });
  }
}

function ensureFunctionCall(
  sourceIndex: number,
  state: StreamingState,
  patch: { id?: string; name?: string },
): FunctionCallState {
  let tool = state.functionCalls.get(sourceIndex);
  if (!tool) {
    const callId = patch.id || `call_${Date.now().toString(36)}_${sourceIndex}`;
    tool = {
      added: false,
      done: false,
      itemId: `fc_${callId}`,
      outputIndex: state.nextOutputIndex,
      callId,
      name: patch.name || "tool",
      arguments: "",
      reasoningContent: null,
    };
    state.nextOutputIndex += 1;
    state.functionCalls.set(sourceIndex, tool);
    return tool;
  }
  if (patch.id) {
    tool.callId = patch.id;
    tool.itemId = `fc_${patch.id}`;
  }
  if (patch.name) tool.name = patch.name;
  return tool;
}

function ensureFunctionCallAdded(tool: FunctionCallState, res: http.ServerResponse): void {
  if (tool.added) return;
  tool.added = true;
  writeSseEvent(res, "response.output_item.added", {
    type: "response.output_item.added",
    output_index: tool.outputIndex,
    item: functionCallItem(tool, "in_progress"),
  });
}

function finalizeResponse(state: StreamingState, res: http.ServerResponse): void {
  if (state.completed) return;
  ensureResponseStarted(state, res);
  const output: JsonRecord[] = [];

  if (state.reasoning.added && !state.reasoning.done) {
    const outputIndex = state.reasoning.outputIndex ?? state.nextOutputIndex;
    state.reasoning.outputIndex = outputIndex;
    const item = reasoningItem(state, "completed");
    output.push(item);
    state.reasoning.done = true;
    writeSseEvent(res, "response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      item_id: state.reasoning.itemId,
      output_index: outputIndex,
      summary_index: 0,
      text: state.reasoning.text,
    });
    writeSseEvent(res, "response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      item_id: state.reasoning.itemId,
      output_index: outputIndex,
      summary_index: 0,
      part: {
        type: "summary_text",
        text: state.reasoning.text,
      },
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item,
    });
  }

  if (state.text.added && !state.text.done) {
    const outputIndex = state.text.outputIndex ?? state.nextOutputIndex;
    state.text.outputIndex = outputIndex;
    const item = {
      id: state.text.itemId,
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{
        type: "output_text",
        text: state.text.text,
        annotations: [],
      }],
    };
    output.push(item);
    state.text.done = true;
    writeSseEvent(res, "response.output_text.done", {
      type: "response.output_text.done",
      item_id: state.text.itemId,
      output_index: outputIndex,
      content_index: 0,
      text: state.text.text,
    });
    writeSseEvent(res, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: state.text.itemId,
      output_index: outputIndex,
      content_index: 0,
      part: item.content[0],
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: outputIndex,
      item,
    });
  }

  for (const tool of [...state.functionCalls.values()].sort((a, b) => a.outputIndex - b.outputIndex)) {
    ensureFunctionCallAdded(tool, res);
    if (!tool.done) {
      writeSseEvent(res, "response.function_call_arguments.done", {
        type: "response.function_call_arguments.done",
        item_id: tool.itemId,
        output_index: tool.outputIndex,
        arguments: tool.arguments || "{}",
      });
      writeSseEvent(res, "response.output_item.done", {
        type: "response.output_item.done",
        output_index: tool.outputIndex,
        item: functionCallItem(tool, "completed"),
      });
      tool.done = true;
    }
    output.push(functionCallItem(tool, "completed"));
  }

  output.sort((a, b) => {
    return outputIndexForItem(a, state) - outputIndexForItem(b, state);
  });

  state.completedOutput = output;
  const status = state.finishReason === "length" ? "incomplete" : "completed";
  const response = baseResponse(state, status, output);
  if (status === "incomplete") response.incomplete_details = { reason: "max_output_tokens" };
  response.usage = normalizeResponsesUsage(state.usage);
  writeSseEvent(res, "response.completed", {
    type: "response.completed",
    response,
  });
  res.write("data: [DONE]\n\n");
  state.completed = true;
}

function functionCallItem(tool: FunctionCallState, status: string): JsonRecord {
  const item: JsonRecord = {
    id: tool.itemId,
    type: "function_call",
    status,
    call_id: tool.callId,
    name: tool.name,
    arguments: tool.arguments || "{}",
  };
  if (tool.reasoningContent) item.reasoning_content = tool.reasoningContent;
  return item;
}

function reasoningItem(state: StreamingState, status: string): JsonRecord {
  return {
    id: state.reasoning.itemId,
    type: "reasoning",
    status,
    summary: [{
      type: "summary_text",
      text: state.reasoning.text,
    }],
  };
}

function outputIndexForItem(item: JsonRecord, state: StreamingState): number {
  if (item.id === state.reasoning.itemId) return state.reasoning.outputIndex ?? 0;
  if (item.id === state.text.itemId) return state.text.outputIndex ?? 0;
  for (const tool of state.functionCalls.values()) {
    if (item.id === tool.itemId) return tool.outputIndex;
  }
  return 0;
}

function baseResponse(state: StreamingState, status: string, output: JsonRecord[]): JsonRecord {
  return {
    id: state.responseId,
    object: "response",
    created_at: state.createdAt,
    status,
    model: state.model,
    output,
    usage: state.usage,
  };
}

function writeSseEvent(res: http.ServerResponse, event: string, payload: JsonRecord): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function firstChoice(chunk: JsonRecord): JsonRecord | null {
  if (!Array.isArray(chunk.choices)) return null;
  const [choice] = chunk.choices;
  return isRecord(choice) ? choice : null;
}

function extractReasoningDelta(delta: JsonRecord): string | null {
  for (const key of ["reasoning_content", "reasoning"] as const) {
    const direct = stringOrNull(delta[key]);
    if (direct) return direct;
  }

  const reasoning = isRecord(delta.reasoning) ? delta.reasoning : null;
  if (reasoning) {
    for (const key of ["content", "text", "summary"] as const) {
      const text = stringOrNull(reasoning[key]);
      if (text) return text;
    }
  }

  return extractReasoningDetailsText(delta.reasoning_details);
}

function extractReasoningDetailsText(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (Array.isArray(value)) {
    const text = value
      .map(extractReasoningDetailsText)
      .filter((item): item is string => Boolean(item))
      .join("\n\n");
    return text || null;
  }
  if (!isRecord(value)) return null;
  for (const key of ["text", "content", "summary"] as const) {
    const text = stringOrNull(value[key]);
    if (text) return text;
  }
  return extractReasoningDetailsText(value.parts);
}

function splitContentAndInlineReasoning(
  content: string,
  state: StreamingState,
): { reasoning: string; text: string } {
  const openTag = "<think>";
  const closeTag = "</think>";
  if (state.inlineThinkActive) {
    const closeIndex = content.indexOf(closeTag);
    if (closeIndex < 0) {
      return { reasoning: content, text: "" };
    }
    state.inlineThinkActive = false;
    return {
      reasoning: content.slice(0, closeIndex),
      text: content.slice(closeIndex + closeTag.length).replace(/^\s+/, ""),
    };
  }

  const openIndex = content.indexOf(openTag);
  if (openIndex < 0) return { reasoning: "", text: content };

  const before = content.slice(0, openIndex);
  const afterOpen = content.slice(openIndex + openTag.length);
  const closeIndex = afterOpen.indexOf(closeTag);
  if (closeIndex < 0) {
    state.inlineThinkActive = true;
    return {
      reasoning: afterOpen.replace(/^\s+/, ""),
      text: before,
    };
  }

  return {
    reasoning: afterOpen.slice(0, closeIndex).replace(/^\s+/, ""),
    text: `${before}${afterOpen.slice(closeIndex + closeTag.length)}`.replace(/^\s+/, ""),
  };
}

function mapChatUsageToResponses(usage: JsonRecord): JsonRecord {
  const inputTokens = numberOrNull(usage.input_tokens) ?? numberOrNull(usage.prompt_tokens);
  const outputTokens = numberOrNull(usage.output_tokens) ?? numberOrNull(usage.completion_tokens);
  const totalTokens = numberOrNull(usage.total_tokens)
    ?? (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null);
  const promptDetails = isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : {};
  const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : {};
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    input_tokens_details: isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : { cached_tokens: numberOrNull(promptDetails.cached_tokens) || 0 },
    output_tokens_details: isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : { reasoning_tokens: numberOrNull(completionDetails.reasoning_tokens) || 0 },
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
      ? usage.input_tokens_details
      : { cached_tokens: 0 },
    output_tokens_details: isRecord(usage?.output_tokens_details)
      ? usage.output_tokens_details
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
