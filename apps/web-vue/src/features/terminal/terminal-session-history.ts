import type { TerminalSessionLedgerEvent } from "../../../../../types/terminal";

export interface TerminalSessionHistoryEntry {
  id: string;
  kind: "command" | "output" | "error" | "system";
  text: string;
  timestamp: string;
}

const ANSI_ESCAPE_RE = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;
const OSC_ESCAPE_RE = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;

function stripTerminalControl(text: string): string {
  return String(text || "")
    .replace(OSC_ESCAPE_RE, "")
    .replace(ANSI_ESCAPE_RE, "")
    .replace(/\r/g, "")
    .replace(/\u0007/g, "");
}

function normalizeCommandChunk(text: string): string | null {
  const raw = String(text || "");
  if (!raw) return null;

  let buffer = "";
  for (const char of raw) {
    if (char === "\u007f" || char === "\b") {
      buffer = buffer.slice(0, -1);
      continue;
    }
    if (char === "\r" || char === "\n") {
      continue;
    }
    if (char >= " ") {
      buffer += char;
    }
  }

  const normalized = buffer.trim();
  return normalized || null;
}

function normalizeOutputChunk(text: string): string | null {
  const normalized = stripTerminalControl(text)
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  return normalized || null;
}

function pushEntry(
  list: TerminalSessionHistoryEntry[],
  next: TerminalSessionHistoryEntry,
): void {
  const previous = list[list.length - 1];
  if (
    previous &&
    previous.kind === next.kind &&
    next.kind === "output" &&
    previous.text.length < 4000
  ) {
    previous.text = `${previous.text}\n${next.text}`.trim();
    previous.timestamp = next.timestamp;
    return;
  }
  list.push(next);
}

function buildSystemMessage(
  event: TerminalSessionLedgerEvent,
): string | null {
  const detail = event.detail || {};
  if (event.type === "exit") {
    if (typeof detail.code === "number") {
      return `exit code ${detail.code}`;
    }
    if (typeof detail.signal === "string" && detail.signal.trim()) {
      return `exit signal ${detail.signal.trim()}`;
    }
  }
  if (event.type === "ended") {
    return typeof detail.reason === "string" ? detail.reason.trim() : null;
  }
  if (event.type === "attach" || event.type === "detach") {
    return event.type;
  }
  return null;
}

function pushTranscriptChunk(
  chunks: string[],
  next: string,
  maxChars: number,
): void {
  if (!next) return;
  chunks.push(next);
  let total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  while (chunks.length > 1 && total > maxChars) {
    total -= chunks.shift()?.length || 0;
  }
  if (chunks.length === 1 && chunks[0].length > maxChars) {
    chunks[0] = chunks[0].slice(-maxChars);
  }
}

function eventsSinceLastClear(
  events: TerminalSessionLedgerEvent[],
): TerminalSessionLedgerEvent[] {
  let startIndex = 0;
  for (let index = 0; index < (events || []).length; index += 1) {
    if (events[index]?.type === "clear") {
      startIndex = index + 1;
    }
  }
  return (events || []).slice(startIndex);
}

export function buildTerminalSessionHistory(
  events: TerminalSessionLedgerEvent[],
  options: { limit?: number } = {},
): TerminalSessionHistoryEntry[] {
  const limit = Number.isFinite(options.limit) ? Math.max(1, Number(options.limit)) : 80;
  const entries: TerminalSessionHistoryEntry[] = [];
  let bufferedCommand = "";
  let bufferedTimestamp = "";

  for (const event of eventsSinceLastClear(events)) {
    const timestamp = String(event.timestamp || new Date().toISOString());
    if (event.type === "input") {
      const data = typeof event.detail?.data === "string" ? event.detail.data : "";
      if (!data) continue;
      bufferedCommand += data;
      bufferedTimestamp = timestamp;
      if (!data.includes("\r") && !data.includes("\n")) {
        continue;
      }
      const normalizedCommand = normalizeCommandChunk(bufferedCommand);
      if (normalizedCommand) {
        pushEntry(entries, {
          id: event.eventId,
          kind: "command",
          text: normalizedCommand,
          timestamp: bufferedTimestamp || timestamp,
        });
      }
      bufferedCommand = "";
      bufferedTimestamp = "";
      continue;
    }

    if (event.type === "output") {
      const output = normalizeOutputChunk(
        typeof event.detail?.data === "string" ? event.detail.data : "",
      );
      if (!output) continue;
      pushEntry(entries, {
        id: event.eventId,
        kind: "output",
        text: output,
        timestamp,
      });
      continue;
    }

    if (event.type === "error") {
      const message = typeof event.detail?.message === "string"
        ? event.detail.message.trim()
        : "";
      if (!message) continue;
      pushEntry(entries, {
        id: event.eventId,
        kind: "error",
        text: message,
        timestamp,
      });
      continue;
    }

    const systemMessage = buildSystemMessage(event);
    if (systemMessage) {
      pushEntry(entries, {
        id: event.eventId,
        kind: "system",
        text: systemMessage,
        timestamp,
      });
    }
  }

  return entries.slice(-limit);
}

export function buildTerminalSessionReplayTranscript(
  events: TerminalSessionLedgerEvent[],
  options: { maxChars?: number } = {},
): string {
  const maxChars = Number.isFinite(options.maxChars)
    ? Math.max(512, Number(options.maxChars))
    : 64_000;
  const chunks: string[] = [];

  for (const event of eventsSinceLastClear(events)) {
    if (event.type === "output") {
      const data =
        typeof event.detail?.data === "string" ? event.detail.data : "";
      if (!data) continue;
      pushTranscriptChunk(chunks, data, maxChars);
      continue;
    }

    if (event.type === "error") {
      const message =
        typeof event.detail?.message === "string"
          ? event.detail.message.trim()
          : "";
      if (!message) continue;
      pushTranscriptChunk(chunks, `\r\n${message}\r\n`, maxChars);
      continue;
    }

    if (event.type === "exit") {
      const detail = event.detail || {};
      const summary =
        typeof detail.code === "number"
          ? `exit code ${detail.code}`
          : typeof detail.signal === "string" && detail.signal.trim()
            ? `exit signal ${detail.signal.trim()}`
            : "";
      if (!summary) continue;
      pushTranscriptChunk(chunks, `\r\n[${summary}]\r\n`, maxChars);
      continue;
    }

    if (event.type === "ended") {
      const reason =
        typeof event.detail?.reason === "string"
          ? event.detail.reason.trim()
          : "";
      if (!reason) continue;
      pushTranscriptChunk(chunks, `\r\n[${reason}]\r\n`, maxChars);
    }
  }

  if (chunks.length) {
    return chunks.join("");
  }

  return buildTerminalSessionHistory(eventsSinceLastClear(events), { limit: 80 })
    .map((entry) => `${entry.text}\r\n`)
    .join("");
}
