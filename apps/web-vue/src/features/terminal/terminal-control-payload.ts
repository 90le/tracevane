export interface TerminalControlPayload {
  type?: unknown;
  cols?: unknown;
  rows?: unknown;
}

export const TERMINAL_CONTROL_BATCH_LIMIT = 32;
export const TERMINAL_CONTROL_BATCH_MAX_LENGTH = 4096;

export function parseTerminalControlPayloads(
  rawPayload: string | null | undefined,
): TerminalControlPayload[] | null {
  const normalized = String(rawPayload || '').trim();
  if (!normalized || normalized.length > TERMINAL_CONTROL_BATCH_MAX_LENGTH) {
    return null;
  }

  const payloads: TerminalControlPayload[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    while (cursor < normalized.length && /\s/.test(normalized[cursor] || '')) {
      cursor += 1;
    }
    if (cursor >= normalized.length) break;
    if (normalized[cursor] !== '{') return null;

    const payloadEnd = findTerminalControlPayloadEnd(normalized, cursor);
    if (payloadEnd < 0) return null;

    try {
      const payload = JSON.parse(
        normalized.slice(cursor, payloadEnd),
      ) as TerminalControlPayload;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      payloads.push(payload);
      if (payloads.length > TERMINAL_CONTROL_BATCH_LIMIT) return null;
    } catch {
      return null;
    }

    cursor = payloadEnd;
  }

  return payloads.length ? payloads : null;
}

export function findTerminalControlPayloadEnd(
  value: string,
  startIndex: number,
): number {
  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === '\\') {
        escaping = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return index + 1;
      if (depth < 0) return -1;
    }
  }

  return -1;
}

export function isResizeTerminalControlPayload(
  payload: TerminalControlPayload,
): boolean {
  return payload.type === 'resize';
}
