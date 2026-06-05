import fs from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, unknown>;

const MAX_CODEX_HISTORY_RESPONSES = 512;

interface CodexHistoryResponseEntry {
  responseId: string;
  createdAt: string;
  updatedAt: string;
  input: JsonRecord[];
  output: JsonRecord[];
}

interface CodexHistoryState {
  version: 1;
  updatedAt: string;
  order: string[];
  responses: Record<string, CodexHistoryResponseEntry>;
}

export interface CodexHistoryEnrichmentResult {
  bodyText: string | undefined;
  previousResponseId: string | null;
  restoredCalls: number;
}

interface CodexHistoryRecordOptions {
  requestBodyText?: string;
}

interface RestoredCodexCall {
  input: JsonRecord[];
  output: JsonRecord;
}

export class CodexChatHistoryStore {
  constructor(private readonly filePath: string) {}

  enrichRequest(bodyText: string | undefined): CodexHistoryEnrichmentResult {
    const request = parseJsonObject(bodyText);
    const previousResponseId = stringOrNull(request?.previous_response_id);
    if (!request) {
      return { bodyText, previousResponseId: null, restoredCalls: 0 };
    }

    const input = request.input;
    const inputItems = normalizeInputItems(input);
    if (!inputItems.length) {
      return { bodyText, previousResponseId, restoredCalls: 0 };
    }

    const existingCallIds = new Set(inputItems
      .filter((item) => item.type === "function_call")
      .map(responseItemCallId)
      .filter((callId): callId is string => Boolean(callId)));
    const outputCallIds = inputItems
      .filter((item) => item.type === "function_call_output")
      .map(responseItemCallId)
      .filter((callId): callId is string => Boolean(callId));
    const missingCallIds = outputCallIds.filter((callId) => !existingCallIds.has(callId));
    if (!missingCallIds.length) {
      return { bodyText, previousResponseId, restoredCalls: 0 };
    }

    const state = this.readState();
    const restoredByCallId = this.lookupCalls(state, previousResponseId, missingCallIds);
    if (!restoredByCallId.size) {
      return { bodyText, previousResponseId, restoredCalls: 0 };
    }

    const restoredOnce = new Set<string>();
    const nextInput: JsonRecord[] = [];
    let restoredInputInserted = false;
    let restoredCalls = 0;
    for (const item of inputItems) {
      const callId = item.type === "function_call_output" ? responseItemCallId(item) : null;
      const restored = callId && !existingCallIds.has(callId) && !restoredOnce.has(callId)
        ? restoredByCallId.get(callId)
        : null;
      if (callId && restored) {
        if (!restoredInputInserted && nextInput.length === 0) {
          for (const inputItem of restored.input) {
            nextInput.push(cloneRecord(inputItem));
          }
          restoredInputInserted = true;
        }
        nextInput.push(cloneRecord(restored.output));
        restoredOnce.add(callId);
        restoredCalls += 1;
      }
      nextInput.push(item);
    }

    if (!restoredCalls) {
      return { bodyText, previousResponseId, restoredCalls: 0 };
    }
    request.input = nextInput;
    return {
      bodyText: JSON.stringify(request),
      previousResponseId,
      restoredCalls,
    };
  }

  recordResponse(response: unknown, options: CodexHistoryRecordOptions = {}): number {
    if (!isRecord(response)) return 0;
    const responseId = stringOrNull(response.id);
    if (!responseId) return 0;

    const output = Array.isArray(response.output)
      ? response.output
        .filter(isRecord)
        .filter((item) => item.type === "function_call" && responseItemCallId(item))
        .map(cloneRecord)
      : [];
    if (!output.length) return 0;

    const input = replayInputFromRequestBody(options.requestBodyText);
    const state = this.readState();
    const stamp = nowIso();
    state.responses[responseId] = {
      responseId,
      createdAt: state.responses[responseId]?.createdAt || stamp,
      updatedAt: stamp,
      input,
      output,
    };
    state.order = [
      ...state.order.filter((id) => id !== responseId),
      responseId,
    ].slice(-MAX_CODEX_HISTORY_RESPONSES);
    const keep = new Set(state.order);
    for (const id of Object.keys(state.responses)) {
      if (!keep.has(id)) delete state.responses[id];
    }
    this.writeState(state);
    return output.length;
  }

  private lookupCalls(
    state: CodexHistoryState,
    previousResponseId: string | null,
    callIds: string[],
  ): Map<string, RestoredCodexCall> {
    const selected = new Map<string, RestoredCodexCall>();
    const previous = previousResponseId ? state.responses[previousResponseId] : null;
    for (const callId of callIds) {
      const direct = previous?.output.find((item) => responseItemCallId(item) === callId);
      if (direct) {
        selected.set(callId, {
          input: previous?.input.map(cloneRecord) || [],
          output: direct,
        });
        continue;
      }
      const fallback = uniqueFallbackCall(state, callId);
      if (fallback) selected.set(callId, fallback);
    }
    return selected;
  }

  private readState(): CodexHistoryState {
    if (!fs.existsSync(this.filePath)) return createEmptyState();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8")) as unknown;
      if (!isRecord(parsed)) return createEmptyState();
      const responses: CodexHistoryState["responses"] = {};
      const rawResponses = isRecord(parsed.responses) ? parsed.responses : {};
      for (const [responseId, entry] of Object.entries(rawResponses)) {
        if (!isRecord(entry)) continue;
        const output = Array.isArray(entry.output)
          ? entry.output.filter(isRecord).filter((item) => item.type === "function_call")
          : [];
        if (!output.length) continue;
        responses[responseId] = {
          responseId,
          createdAt: stringOrNull(entry.createdAt) || nowIso(),
          updatedAt: stringOrNull(entry.updatedAt) || nowIso(),
          input: Array.isArray(entry.input)
            ? entry.input.filter(isRecord).map(cloneRecord)
            : [],
          output: output.map(cloneRecord),
        };
      }
      const order = Array.isArray(parsed.order)
        ? parsed.order.filter((id): id is string => typeof id === "string" && Boolean(responses[id]))
        : Object.keys(responses);
      return {
        version: 1,
        updatedAt: stringOrNull(parsed.updatedAt) || nowIso(),
        order: order.slice(-MAX_CODEX_HISTORY_RESPONSES),
        responses,
      };
    } catch {
      return createEmptyState();
    }
  }

  private writeState(state: CodexHistoryState): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    fs.writeFileSync(tmpPath, `${JSON.stringify({
      version: 1,
      updatedAt: nowIso(),
      order: state.order,
      responses: state.responses,
    }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmpPath, this.filePath);
    try {
      fs.chmodSync(this.filePath, 0o600);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
  }
}

function createEmptyState(): CodexHistoryState {
  return {
    version: 1,
    updatedAt: nowIso(),
    order: [],
    responses: {},
  };
}

function normalizeInputItems(input: unknown): JsonRecord[] {
  if (typeof input === "string") return [{ role: "user", content: input }];
  if (Array.isArray(input)) return input.filter(isRecord).map(cloneRecord);
  if (isRecord(input)) return [cloneRecord(input)];
  return [];
}

function replayInputFromRequestBody(bodyText: string | undefined): JsonRecord[] {
  const request = parseJsonObject(bodyText);
  if (!request) return [];
  return normalizeInputItems(request.input)
    .filter((item) => item.type !== "function_call_output")
    .map(cloneRecord);
}

function uniqueFallbackCall(state: CodexHistoryState, callId: string): RestoredCodexCall | null {
  let found: RestoredCodexCall | null = null;
  for (const responseId of state.order) {
    const entry = state.responses[responseId];
    const candidate = entry?.output.find((item) => responseItemCallId(item) === callId);
    if (!candidate) continue;
    if (found) return null;
    found = {
      input: entry?.input.map(cloneRecord) || [],
      output: candidate,
    };
  }
  return found;
}

function responseItemCallId(item: JsonRecord): string | null {
  return stringOrNull(item.call_id) || stringOrNull(item.id);
}

function parseJsonObject(bodyText: string | undefined): JsonRecord | null {
  if (!bodyText || !bodyText.trim()) return null;
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cloneRecord(record: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(record)) as JsonRecord;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
