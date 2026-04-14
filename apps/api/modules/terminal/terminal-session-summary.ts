export interface TerminalRecentOutputSummary {
  tailText: string;
  lastError: string | null;
  lastCommandHint: string | null;
  exitSummary: string | null;
  updatedAt: string;
}

export interface TerminalRecentOutputSummaryEvent {
  type?: string;
  detail?: Record<string, unknown> | null;
  timestamp?: string;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractCommandHint(text: string): string | null {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] || "";
    if (!line.startsWith("$")) {
      continue;
    }
    return line.replace(/^\$+\s*/, "").trim() || null;
  }
  return null;
}

function summarizeExit(
  detail: Record<string, unknown> | null | undefined,
): string | null {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  if (typeof detail.code === "number") {
    return `exit code ${detail.code}`;
  }
  const signal = asString(detail.signal);
  if (signal) {
    return `exit signal ${signal}`;
  }
  return null;
}

export function buildTerminalRecentOutputSummary(
  events: TerminalRecentOutputSummaryEvent[],
): TerminalRecentOutputSummary {
  let tailText = "";
  let lastError: string | null = null;
  let lastCommandHint: string | null = null;
  let exitSummary: string | null = null;
  let updatedAt = new Date().toISOString();

  for (const event of events || []) {
    if (event?.timestamp) {
      updatedAt = event.timestamp;
    }

    const detail =
      event?.detail && typeof event.detail === "object" ? event.detail : null;

    if (event?.type === "output") {
      const data = typeof detail?.data === "string" ? detail.data : null;
      if (data) {
        tailText = data;
        const hint = extractCommandHint(data);
        if (hint) {
          lastCommandHint = hint;
        }
      }
    }

    if (event?.type === "error") {
      const message = asString(detail?.message);
      if (message) {
        lastError = message;
      }
    }

    if (event?.type === "exit") {
      const summary = summarizeExit(detail);
      if (summary) {
        exitSummary = summary;
      }
    }
  }

  return {
    tailText,
    lastError,
    lastCommandHint,
    exitSummary,
    updatedAt,
  };
}
