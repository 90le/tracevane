import type http from "node:http";

type JsonRecord = Record<string, unknown>;

export interface CodexStreamingAdapterResult {
  responseId: string;
  model: string | null;
  outputText: string;
}

interface TextState {
  added: boolean;
  done: boolean;
  itemId: string;
  outputIndex: number;
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
  text: TextState;
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
    text: {
      added: false,
      done: false,
      itemId: `${responseId}_msg`,
      outputIndex: 0,
      text: "",
    },
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
  }
  const model = stringOrNull(chunk.model);
  if (model) state.model = model;
  if (typeof chunk.created === "number") state.createdAt = chunk.created;
  if (isRecord(chunk.usage)) state.usage = mapChatUsageToResponses(chunk.usage);

  ensureResponseStarted(state, res);

  const choice = firstChoice(chunk);
  if (!choice) return;
  const delta = isRecord(choice.delta) ? choice.delta : {};
  const content = stringOrNull(delta.content);
  if (content) pushTextDelta(content, state, res);
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

function pushTextDelta(delta: string, state: StreamingState, res: http.ServerResponse): void {
  if (!state.text.added) {
    state.text.added = true;
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

function finalizeResponse(state: StreamingState, res: http.ServerResponse): void {
  if (state.completed) return;
  ensureResponseStarted(state, res);
  const output: JsonRecord[] = [];

  if (state.text.added && !state.text.done) {
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
      output_index: state.text.outputIndex,
      content_index: 0,
      text: state.text.text,
    });
    writeSseEvent(res, "response.content_part.done", {
      type: "response.content_part.done",
      item_id: state.text.itemId,
      output_index: state.text.outputIndex,
      content_index: 0,
      part: item.content[0],
    });
    writeSseEvent(res, "response.output_item.done", {
      type: "response.output_item.done",
      output_index: state.text.outputIndex,
      item,
    });
  }

  const status = state.finishReason === "length" ? "incomplete" : "completed";
  const response = baseResponse(state, status, output);
  if (status === "incomplete") response.incomplete_details = { reason: "max_output_tokens" };
  writeSseEvent(res, "response.completed", {
    type: "response.completed",
    response,
  });
  res.write("data: [DONE]\n\n");
  state.completed = true;
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

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
