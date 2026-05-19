import type {
  ChatInlineResourceDisplay,
  ChatMessageBlock,
  ChatMessageItem,
  ChatMessageRole,
  ChatResourceItem,
  ChatSessionRow,
} from '../types/chat.js';
import { normalizeChatMessageBlocks } from './chat-blocks.js';
import { normalizeChatHistoryText, stripInboundMetadata } from './chat-history-normalization.js';

export interface ChatDisplayResourceItem extends ChatResourceItem {
  alt: string;
}

export type ChatDisplayParagraphSegment =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'resource';
    item: ChatDisplayResourceItem;
    display: ChatInlineResourceDisplay;
  };

export type ChatDisplayParagraphRun =
  | {
    type: 'inline-run';
    segments: ChatDisplayParagraphSegment[];
    copySource: string;
    plainText: string;
  }
  | {
    type: 'break-run';
    segment: Extract<ChatDisplayParagraphSegment, { type: 'resource' }>;
    copySource: string;
    plainText: string;
  };

export type ChatDisplayBlock =
  | {
    type: 'markdown';
    markdownSource: string;
    copySource: string;
  }
  | {
    type: 'paragraph';
    segments: ChatDisplayParagraphSegment[];
    runs: ChatDisplayParagraphRun[];
    copySource: string;
    plainText: string;
  }
  | {
    type: 'resource';
    item: ChatDisplayResourceItem;
    display: 'card';
  };

export type ChatDisplayRenderMode = 'markdown' | 'plain-text' | 'empty';

export interface BaseChatDisplayMessage {
  blocks: ChatDisplayBlock[];
  markdownSource: string;
  copySource: string;
  plainTextFallback: string;
  renderMode: ChatDisplayRenderMode;
  resourceItems: ChatDisplayResourceItem[];
  hasStructuredBlocks: boolean;
}

function previewText(value: unknown, max = 180): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return null;
    return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
  }
  if (Array.isArray(value)) {
    const joined = value
      .map((entry) => previewText(entry, max))
      .filter(Boolean)
      .join(' ');
    return joined ? previewText(joined, max) : null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'message', 'summary', 'content', 'result', 'output', 'error', 'status']) {
      const candidate = previewText(record[key], max);
      if (candidate) return candidate;
    }
  }
  return null;
}

/** Matches OpenClaw outbound directive tags (see projects/openclaw/src/utils/directive-tags.ts). */
const DIRECTIVE_REPLY_RE = /\[\[\s*(?:reply_to_current|reply_to\s*:\s*([^\]\n]+))\s*\]\]/gi;
const DIRECTIVE_AUDIO_RE = /\[\[\s*audio_as_voice\s*\]\]/gi;

function stripOpenClawInlineDirectives(value: string): string {
  return value.replace(DIRECTIVE_AUDIO_RE, '').replace(DIRECTIVE_REPLY_RE, '');
}

function stripAssistantInternalScaffolding(value: string): string {
  return stripInboundMetadata(stripOpenClawInlineDirectives(value))
    .replace(/<\s*think(?:ing)?\s*>[\s\S]*?<\s*\/\s*think(?:ing)?\s*>/gi, '')
    .replace(/<\s*final\s*>/gi, '')
    .replace(/<\s*\/\s*final\s*>/gi, '')
    .trim();
}

function preprocessMessageText(text: string, role: ChatMessageRole): string {
  const normalized = text.replace(/\r\n?/g, '\n');
  if (role === 'assistant') {
    return stripAssistantInternalScaffolding(normalized);
  }
  if (role === 'user') {
    return normalizeChatHistoryText(normalized, role);
  }
  return normalized.trim();
}

function markdownToPlainText(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/```[\w-]*\n([\s\S]*?)```/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resourceAltText(item: ChatResourceItem): string {
  return item.fileName?.trim() || (item.kind === 'image' ? 'image' : 'file');
}

function normalizeDisplayResourceItems(items: ChatResourceItem[] | undefined): ChatDisplayResourceItem[] {
  const normalized: ChatDisplayResourceItem[] = [];
  const seen = new Set<string>();

  for (const item of items || []) {
    if (!item?.id) continue;
    const key = `${item.kind}:${item.url || 'missing'}:${item.downloadUrl || 'missing'}:${item.id}:${item.relativePath || item.fileName}:${item.source}:${item.status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({
      ...item,
      alt: resourceAltText(item),
    });
  }

  return normalized;
}

function isBreakDisplay(display: ChatInlineResourceDisplay): boolean {
  return display === 'break-image' || display === 'break-video' || display === 'break-chip';
}

function paragraphSegmentCopyText(segment: ChatDisplayParagraphSegment): string {
  if (segment.type === 'text') {
    return segment.text;
  }
  if (segment.display === 'inline-image' || segment.display === 'break-image') {
    return `[Image: ${segment.item.fileName}]`;
  }
  if (segment.display === 'inline-video' || segment.display === 'break-video') {
    return `[Video: ${segment.item.fileName}]`;
  }
  return segment.item.fileName;
}

function buildParagraphInlineRun(segments: ChatDisplayParagraphSegment[]): ChatDisplayParagraphRun | null {
  if (!segments.length) {
    return null;
  }
  const copySource = segments.map((segment) => paragraphSegmentCopyText(segment)).join('');
  return {
    type: 'inline-run',
    segments,
    copySource,
    plainText: copySource,
  };
}

function buildParagraphRuns(segments: ChatDisplayParagraphSegment[]): ChatDisplayParagraphRun[] {
  const runs: ChatDisplayParagraphRun[] = [];
  let inlineSegments: ChatDisplayParagraphSegment[] = [];

  for (const segment of segments) {
    if (segment.type === 'resource' && isBreakDisplay(segment.display)) {
      const inlineRun = buildParagraphInlineRun(inlineSegments);
      if (inlineRun) {
        runs.push(inlineRun);
      }
      runs.push({
        type: 'break-run',
        segment,
        copySource: paragraphSegmentCopyText(segment),
        plainText: paragraphSegmentCopyText(segment),
      });
      inlineSegments = [];
      continue;
    }
    inlineSegments.push(segment);
  }

  const trailingInlineRun = buildParagraphInlineRun(inlineSegments);
  if (trailingInlineRun) {
    runs.push(trailingInlineRun);
  }

  return runs;
}

function blockCopySource(block: ChatDisplayBlock): string {
  if (block.type === 'markdown') {
    return block.copySource;
  }
  if (block.type === 'paragraph') {
    return block.copySource;
  }
  return block.item.fileName;
}

function blockPlainText(block: ChatDisplayBlock): string {
  if (block.type === 'markdown') {
    return markdownToPlainText(block.copySource || block.markdownSource);
  }
  if (block.type === 'paragraph') {
    return block.plainText;
  }
  return block.item.fileName;
}

function finalizeDisplayBlocks(
  blocks: ChatDisplayBlock[],
  hasStructuredBlocks: boolean,
  resourceItems: ChatDisplayResourceItem[],
): BaseChatDisplayMessage {
  const markdownBlocks = blocks.filter((block): block is Extract<ChatDisplayBlock, { type: 'markdown' }> => block.type === 'markdown');
  const markdownSource = markdownBlocks.map((block) => block.markdownSource).join('\n\n').trim();
  const copySource = blocks
    .map((block) => blockCopySource(block))
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const plainTextFallback = blocks
    .map((block) => blockPlainText(block))
    .filter(Boolean)
    .join('\n\n')
    .trim();
  const renderMode: ChatDisplayRenderMode = blocks.some((block) => block.type === 'markdown')
    ? 'markdown'
    : blocks.length
      ? 'plain-text'
      : 'empty';

  return {
    blocks,
    markdownSource,
    copySource,
    plainTextFallback,
    renderMode,
    resourceItems,
    hasStructuredBlocks,
  };
}

function buildDisplayBlocksFromMessageBlocks(
  blocks: ChatMessageBlock[],
  resourceItems: ChatDisplayResourceItem[],
  role: ChatMessageRole,
): ChatDisplayBlock[] {
  const resourceMap = new Map(resourceItems.map((item) => [item.id, item]));
  const displayBlocks: ChatDisplayBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'text') {
      const text = preprocessMessageText(block.text || '', role).trim();
      if (!text) continue;
      displayBlocks.push({
        type: 'markdown',
        markdownSource: text,
        copySource: text,
      });
      continue;
    }

    if (block.type === 'paragraph') {
      const segments = block.segments
        .map((segment): ChatDisplayParagraphSegment | null => {
          if (segment.type === 'text') {
            const text = String(segment.text || '').replace(/\r\n?/g, '\n');
            return text ? { type: 'text', text } : null;
          }
          const resource = resourceMap.get(segment.resourceId);
          if (!resource) {
            return null;
          }
          return {
            type: 'resource',
            item: resource,
            display: segment.display,
          };
        })
        .filter((segment): segment is ChatDisplayParagraphSegment => Boolean(segment));
      if (!segments.length) {
        continue;
      }
      const runs = buildParagraphRuns(segments);
      const copySource = runs.map((run) => run.copySource).join('\n');
      const plainText = runs.map((run) => run.plainText).join('\n');
      displayBlocks.push({
        type: 'paragraph',
        segments,
        runs,
        copySource,
        plainText,
      });
      continue;
    }

    const resource = resourceMap.get(block.resourceId);
    if (resource) {
      displayBlocks.push({
        type: 'resource',
        item: resource,
        display: 'card',
      });
    }
  }

  return displayBlocks;
}

export function deriveChatDisplayMessage(
  message: Pick<ChatMessageItem, 'text' | 'role' | 'resources' | 'blocks'>,
): BaseChatDisplayMessage {
  const resourceItems = normalizeDisplayResourceItems(message.resources);
  const messageBlocks = normalizeChatMessageBlocks(message);
  const display = finalizeDisplayBlocks(
    buildDisplayBlocksFromMessageBlocks(messageBlocks, resourceItems, message.role),
    Boolean(message.blocks?.length),
    resourceItems,
  );
  if (message.role === 'assistant' && resourceItems.some((item) => item.source === 'assistant_markdown')) {
    const originalMarkdown = preprocessMessageText(message.text || '', message.role).trim();
    if (originalMarkdown) {
      display.copySource = originalMarkdown;
      display.plainTextFallback = markdownToPlainText(originalMarkdown) || display.plainTextFallback;
    }
  }
  return display;
}

export function deriveChatPreview(raw: string | null): string | null {
  if (!raw) return null;
  const normalized = deriveChatDisplayMessage({
    text: raw,
    role: 'assistant',
    resources: undefined,
    blocks: undefined,
  });
  if (normalized.markdownSource) return previewText(normalized.plainTextFallback || normalized.markdownSource, 92);
  if (normalized.resourceItems.length) {
    return previewText(normalized.resourceItems[0].fileName, 92);
  }
  return null;
}

export function deriveChatSessionTitle(session: ChatSessionRow, agentName: string): string {
  const candidates = session.kind === 'studio_managed'
    ? [
      session.presentation.customLabel,
      session.presentation.autoLabel,
      session.label,
      session.lastMessagePreview,
    ]
    : [
      session.presentation.customLabel,
      session.derivedTitle,
      session.label,
      session.lastMessagePreview,
    ];
  for (const candidate of candidates) {
    const preview = deriveChatPreview(candidate || null);
    if (!preview) continue;
    return preview;
  }
  return `Chat · ${agentName}`;
}
