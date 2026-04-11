import type { ChatMessageItem, ChatSessionRow, ChatToolStatus } from '../../../../../types/chat';

export interface ChatDisplayToolHint {
  id: string;
  name: string;
  status: ChatToolStatus;
  detail: string | null;
}

export interface ChatDisplayMessage {
  text: string;
  toolHints: ChatDisplayToolHint[];
  structured: boolean;
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripMetadataPreamble(value: string): string {
  return value
    .replace(/^Sender\s+\(untrusted metadata\):\s*```json[\s\S]*?```\s*/i, '')
    .replace(/^Sender\s+\(untrusted metadata\):\s*/i, '')
    .trim();
}

function previewText(value: unknown, max = 160): string | null {
  if (value == null) return null;
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      const joined = value
        .map((entry) => previewText(entry, max))
        .filter(Boolean)
        .join(' ');
      return joined ? previewText(joined, max) : null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ['text', 'message', 'summary', 'content', 'output', 'result', 'status']) {
      const candidate = previewText(record[key], max);
      if (candidate) return candidate;
    }
    return null;
  }

  const text = String(value).replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function cleanText(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function looksLikeMetadataDump(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\{[\s\S]*\}$/.test(trimmed) || /^\[[\s\S]*\]$/.test(trimmed)) {
    const parsed = safeParseJson(trimmed);
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      return ['metadata', 'tool', 'toolCalls', 'tool_calls', 'thinking', 'raw'].some((key) => key in record);
    }
  }
  return false;
}

function extractToolName(block: Record<string, unknown>): string {
  const direct = block.name;
  if (typeof direct === 'string' && direct.trim()) return direct;
  const tool = block.tool;
  if (tool && typeof tool === 'object' && typeof (tool as Record<string, unknown>).name === 'string') {
    return String((tool as Record<string, unknown>).name);
  }
  return 'tool';
}

function extractToolDetail(block: Record<string, unknown>): string | null {
  return previewText(
    block.result
    ?? block.output
    ?? block.error
    ?? block.arguments
    ?? block.args
    ?? block.input
    ?? block.text
    ?? block.content,
    180,
  );
}

function normalizeToolStatus(type: string, block: Record<string, unknown>): ChatToolStatus {
  if (type.includes('result') || type.includes('output')) {
    return block.is_error || block.error ? 'error' : 'completed';
  }
  return 'running';
}

function pushToolHint(toolHints: ChatDisplayToolHint[], hint: ChatDisplayToolHint): void {
  if (toolHints.some((item) => item.id === hint.id)) return;
  toolHints.push(hint);
}

function extractStructuredFromBlocks(blocks: unknown[]): ChatDisplayMessage {
  const textParts: string[] = [];
  const toolHints: ChatDisplayToolHint[] = [];

  blocks.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const block = entry as Record<string, unknown>;
    const type = String(block.type || '').toLowerCase();

    if (type === 'thinking' || type === 'reasoning' || type === 'metadata') return;

    if (
      type === 'text'
      || type === 'output_text'
      || type === 'markdown'
      || type === 'message'
    ) {
      const text = typeof block.text === 'string'
        ? block.text
        : typeof block.content === 'string'
          ? block.content
          : null;
      if (text && text.trim() && !looksLikeMetadataDump(text)) textParts.push(cleanText(text));
      return;
    }

    if (type.includes('tool')) {
      pushToolHint(toolHints, {
        id: String(block.id || block.toolCallId || `${type}-${index}`),
        name: extractToolName(block),
        status: normalizeToolStatus(type, block),
        detail: extractToolDetail(block),
      });
    }
  });

  return {
    text: textParts.join('\n\n').trim(),
    toolHints,
    structured: true,
  };
}

function extractStructuredPayload(raw: string): ChatDisplayMessage | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const parsed = safeParseJson(candidate);
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  if (Array.isArray(record.content)) {
    return extractStructuredFromBlocks(record.content);
  }

  if ('tool' in record || 'status' in record || 'error' in record || 'toolCallId' in record) {
    const name = typeof record.tool === 'string' && record.tool.trim()
      ? record.tool
      : extractToolName(record);
    const status = String(record.status || '').toLowerCase() === 'error'
      ? 'error'
      : String(record.status || '').toLowerCase() === 'completed'
        ? 'completed'
        : String(record.status || '').toLowerCase() === 'running'
          ? 'running'
          : record.error
            ? 'error'
            : 'completed';
    return {
      text: previewText(record.message ?? record.summary, 320) || '',
      toolHints: [
        {
          id: String(record.id || record.toolCallId || `${name}-${status}`),
          name,
          status,
          detail: extractToolDetail(record),
        },
      ],
      structured: true,
    };
  }

  if (typeof record.text === 'string' && !looksLikeMetadataDump(record.text)) {
    return {
      text: cleanText(record.text),
      toolHints: [],
      structured: true,
    };
  }

  if (typeof record.content === 'string' && !looksLikeMetadataDump(record.content)) {
    return {
      text: cleanText(String(record.content)),
      toolHints: [],
      structured: true,
    };
  }

  return {
    text: '',
    toolHints: [],
    structured: true,
  };
}

export function deriveChatDisplayMessage(message: Pick<ChatMessageItem, 'text' | 'role' | 'runId'>): ChatDisplayMessage {
  const stripped = stripMetadataPreamble(message.text || '');
  const structured = extractStructuredPayload(stripped);
  if (structured) {
    return {
      text: structured.text,
      toolHints: structured.toolHints,
      structured: true,
    };
  }

  const text = cleanText(stripped || (message.text || '').trim());
  return {
    text: looksLikeMetadataDump(text) ? '' : text,
    toolHints: [],
    structured: false,
  };
}

export function deriveChatPreview(raw: string | null): string | null {
  if (!raw) return null;
  const structured = extractStructuredPayload(stripMetadataPreamble(raw));
  if (structured) {
    if (structured.text) return previewText(structured.text, 96);
    if (structured.toolHints.length) return previewText(`${structured.toolHints[0].name} · ${structured.toolHints[0].status}`, 96);
    return null;
  }
  const cleaned = cleanText(stripMetadataPreamble(raw));
  if (looksLikeMetadataDump(cleaned)) return null;
  return previewText(cleaned, 96);
}

export function deriveChatSessionTitle(session: ChatSessionRow, agentName: string): string {
  const candidates = session.kind === 'studio_managed'
    ? [session.presentation.customLabel, session.presentation.autoLabel, session.label]
    : [session.presentation.customLabel, session.derivedTitle, session.label];
  for (const candidate of candidates) {
    const next = deriveChatPreview(candidate || null);
    if (!next) continue;
    if (next.includes('{') || next.includes('metadata')) continue;
    return next;
  }
  return `Studio chat · ${agentName}`;
}
