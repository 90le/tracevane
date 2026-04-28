import type {
  ChatAttachmentKind,
  ChatComposerDocument,
  ChatComposerNode,
  ChatComposerResourceDisplay,
  ChatComposerResourceRefNode,
  ChatComposerTextNode,
  ChatInlineSegment,
  ChatMessageBlock,
  ChatMessageParagraphBlock,
  ChatSendFileRef,
} from '../types/chat.js';
import {
  buildStudioResourceRefFromRelativePath,
  formatMarkdownResourceDestination,
} from './studio-resource-refs.js';

export interface ChatComposerAttachmentRefLike {
  id: string;
  type?: ChatAttachmentKind;
  kind?: ChatAttachmentKind;
  fileName?: string;
  mimeType?: string | null;
  relativePath?: string | null;
}

function randomId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRelativePath(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim().replace(/\\/g, '/');
  return trimmed ? trimmed : null;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/');
  return parts[parts.length - 1] || normalized;
}

function isComposerDisplay(value: string): value is ChatComposerResourceDisplay {
  return value === 'inline-image'
    || value === 'inline-video'
    || value === 'inline-chip'
    || value === 'break-image'
    || value === 'break-video'
    || value === 'break-chip';
}

function buildTextNode(text: string): ChatComposerTextNode {
  return {
    type: 'text',
    id: randomId('composer-text'),
    text,
  };
}

function buildCaretTextNode(): ChatComposerTextNode {
  return buildTextNode('');
}

function normalizeTextNode(node: Partial<ChatComposerTextNode>): ChatComposerTextNode {
  return {
    type: 'text',
    id: typeof node.id === 'string' && node.id.trim() ? node.id.trim() : randomId('composer-text'),
    text: typeof node.text === 'string' ? node.text : '',
  };
}

function normalizeResourceNode(node: Partial<ChatComposerResourceRefNode>): ChatComposerResourceRefNode | null {
  const attachmentId = typeof node.attachmentId === 'string' ? node.attachmentId.trim() : '';
  if (!attachmentId) {
    return null;
  }
  const display = typeof node.display === 'string' && isComposerDisplay(node.display)
    ? node.display
    : 'inline-chip';
  return {
    type: 'resource-ref',
    id: typeof node.id === 'string' && node.id.trim() ? node.id.trim() : randomId('composer-ref'),
    attachmentId,
    display,
  };
}

function mergeTextBuffer(
  next: ChatComposerNode[],
  textBuffer: string,
): void {
  if (!textBuffer && next.length > 0) {
    return;
  }
  if (!textBuffer && next.length === 0) {
    next.push(buildCaretTextNode());
    return;
  }
  const last = next[next.length - 1];
  if (last?.type === 'text') {
    last.text += textBuffer;
    return;
  }
  next.push(buildTextNode(textBuffer));
}

function composeAttachmentLabel(attachment: ChatComposerAttachmentRefLike): string {
  const preferredName = typeof attachment.fileName === 'string' && attachment.fileName.trim()
    ? attachment.fileName.trim()
    : null;
  if (preferredName) {
    return preferredName;
  }
  const relativePath = normalizeRelativePath(attachment.relativePath);
  if (relativePath) {
    return basename(relativePath);
  }
  return attachment.id;
}

export function composeComposerAttachmentMentionLabel(attachment: ChatComposerAttachmentRefLike): string {
  const base = composeAttachmentLabel(attachment).replace(/^@+/, '');
  return `@${base}`;
}

function attachmentKind(attachment: ChatComposerAttachmentRefLike): ChatAttachmentKind {
  return attachment.type || attachment.kind || 'file';
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function attachmentHref(attachment: ChatComposerAttachmentRefLike): string | null {
  return buildStudioResourceRefFromRelativePath(attachment.relativePath);
}

function attachmentMap(
  attachments: ChatComposerAttachmentRefLike[],
): Map<string, ChatComposerAttachmentRefLike> {
  return new Map(
    attachments
      .filter((item) => typeof item.id === 'string' && item.id.trim())
      .map((item) => [item.id.trim(), item] as const),
  );
}

export function createEmptyComposerDocument(): ChatComposerDocument {
  return [buildCaretTextNode()];
}

export function normalizeComposerDocument(
  document: ChatComposerDocument | undefined | null,
  options: { editorSurface?: boolean } = {},
): ChatComposerDocument {
  const next: ChatComposerNode[] = [];
  let textBuffer = '';

  for (const node of document || []) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (node.type === 'text') {
      const normalized = normalizeTextNode(node);
      textBuffer += normalized.text;
      continue;
    }

    const normalized = normalizeResourceNode(node);
    if (!normalized) {
      continue;
    }
    mergeTextBuffer(next, textBuffer);
    textBuffer = '';
    next.push(normalized);
  }

  mergeTextBuffer(next, textBuffer);

  const minimal = next.filter((node, index, nodes) => {
    if (node.type !== 'text') {
      return true;
    }
    if (node.text) {
      return true;
    }
    if (!options.editorSurface) {
      return false;
    }
    const prev = nodes[index - 1];
    const following = nodes[index + 1];
    return !prev || !following || (prev.type === 'resource-ref' && following.type === 'resource-ref');
  });

  if (!options.editorSurface) {
    return minimal;
  }

  const editorNodes: ChatComposerNode[] = [];
  for (const node of minimal) {
    const last = editorNodes[editorNodes.length - 1];
    if (!last) {
      if (node.type !== 'text') {
        editorNodes.push(buildCaretTextNode());
      }
      editorNodes.push(node);
      continue;
    }
    if (last.type === 'resource-ref' && node.type === 'resource-ref') {
      editorNodes.push(buildCaretTextNode());
    }
    editorNodes.push(node);
  }

  if (!editorNodes.length) {
    return createEmptyComposerDocument();
  }
  if (editorNodes[0]?.type !== 'text') {
    editorNodes.unshift(buildCaretTextNode());
  }
  if (editorNodes[editorNodes.length - 1]?.type !== 'text') {
    editorNodes.push(buildCaretTextNode());
  }
  return editorNodes;
}

export function extractComposerPlainText(document: ChatComposerDocument | undefined | null): string {
  return normalizeComposerDocument(document).reduce((result, node) => {
    if (node.type === 'text') {
      return `${result}${node.text}`;
    }
    return result;
  }, '');
}

export function hasComposerDocumentContent(document: ChatComposerDocument | undefined | null): boolean {
  return normalizeComposerDocument(document).some((node) => {
    if (node.type === 'text') {
      return Boolean(node.text.trim());
    }
    return true;
  });
}

export function countComposerAttachmentReferences(
  document: ChatComposerDocument | undefined | null,
  attachmentId: string,
): number {
  const normalizedAttachmentId = typeof attachmentId === 'string' ? attachmentId.trim() : '';
  if (!normalizedAttachmentId) {
    return 0;
  }
  return normalizeComposerDocument(document).filter((node) => {
    return node.type === 'resource-ref' && node.attachmentId === normalizedAttachmentId;
  }).length;
}

export function collectReferencedComposerAttachmentIds(
  document: ChatComposerDocument | undefined | null,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const node of normalizeComposerDocument(document)) {
    if (node.type !== 'resource-ref' || seen.has(node.attachmentId)) {
      continue;
    }
    seen.add(node.attachmentId);
    ids.push(node.attachmentId);
  }
  return ids;
}

export function composerDocumentUnitLength(document: ChatComposerDocument | undefined | null): number {
  return normalizeComposerDocument(document, { editorSurface: true }).reduce((count, node) => {
    if (node.type === 'text') {
      return count + node.text.length;
    }
    return count + 1;
  }, 0);
}

export function insertComposerResourceNodeAtOffset(
  document: ChatComposerDocument | undefined | null,
  attachmentId: string,
  display: ChatComposerResourceDisplay,
  offset: number,
): ChatComposerDocument {
  const normalizedAttachmentId = typeof attachmentId === 'string' ? attachmentId.trim() : '';
  if (!normalizedAttachmentId) {
    return normalizeComposerDocument(document, { editorSurface: true });
  }

  const input = normalizeComposerDocument(document, { editorSurface: true });
  const boundedOffset = Math.max(0, Math.min(Number.isFinite(offset) ? Math.floor(offset) : 0, composerDocumentUnitLength(input)));
  const token: ChatComposerResourceRefNode = {
    type: 'resource-ref',
    id: randomId('composer-ref'),
    attachmentId: normalizedAttachmentId,
    display,
  };

  const next: ChatComposerNode[] = [];
  let cursor = boundedOffset;
  let inserted = false;

  for (const node of input) {
    if (inserted) {
      next.push(node);
      continue;
    }
    if (node.type === 'text') {
      const textLength = node.text.length;
      if (cursor <= textLength) {
        const left = node.text.slice(0, cursor);
        const right = node.text.slice(cursor);
        next.push({ ...node, text: left });
        next.push(token);
        next.push(buildTextNode(right));
        inserted = true;
        continue;
      }
      cursor -= textLength;
      next.push(node);
      continue;
    }

    if (cursor === 0) {
      next.push(token);
      next.push(node);
      inserted = true;
      continue;
    }

    cursor -= 1;
    next.push(node);
  }

  if (!inserted) {
    next.push(token);
  }

  return normalizeComposerDocument(next, { editorSurface: true });
}

export function removeComposerAttachmentReferences(
  document: ChatComposerDocument | undefined | null,
  attachmentId: string,
): ChatComposerDocument {
  const normalizedAttachmentId = typeof attachmentId === 'string' ? attachmentId.trim() : '';
  if (!normalizedAttachmentId) {
    return normalizeComposerDocument(document, { editorSurface: true });
  }
  return normalizeComposerDocument(
    normalizeComposerDocument(document, { editorSurface: true }).filter((node) => {
      return node.type !== 'resource-ref' || node.attachmentId !== normalizedAttachmentId;
    }),
    { editorSurface: true },
  );
}

export function serializeComposerDocumentToMarkdown(
  document: ChatComposerDocument | undefined | null,
  attachments: ChatComposerAttachmentRefLike[],
): string {
  const lookup = attachmentMap(attachments);
  let result = '';

  for (const node of normalizeComposerDocument(document)) {
    if (node.type === 'text') {
      result += node.text;
      continue;
    }
    const attachment = lookup.get(node.attachmentId);
    const href = attachment ? attachmentHref(attachment) : null;
    const label = attachment ? composeComposerAttachmentMentionLabel(attachment) : `@${node.attachmentId.replace(/^@+/, '')}`;
    if (!href) {
      result += label;
      continue;
    }
    result += `[${escapeMarkdownLabel(label)}](${formatMarkdownResourceDestination(href)} "studio:${node.display}")`;
  }

  return result;
}

function buildParagraphSegments(
  document: ChatComposerDocument,
  attachments: ChatComposerAttachmentRefLike[],
): ChatInlineSegment[] {
  const lookup = attachmentMap(attachments);
  const segments: ChatInlineSegment[] = [];

  for (const node of normalizeComposerDocument(document)) {
    if (node.type === 'text') {
      if (node.text) {
        segments.push({
          type: 'text',
          text: node.text,
        });
      }
      continue;
    }
    if (!lookup.has(node.attachmentId)) {
      continue;
    }
    segments.push({
      type: 'resource',
      resourceId: node.attachmentId,
      display: node.display,
    });
  }

  return segments;
}

export function buildComposerMessageBlocks(
  document: ChatComposerDocument | undefined | null,
  attachments: ChatComposerAttachmentRefLike[],
): ChatMessageBlock[] {
  const normalized = normalizeComposerDocument(document);
  const lookup = attachmentMap(attachments);
  const referencedAttachmentIds = new Set(
    normalized
      .filter((node): node is ChatComposerResourceRefNode => node.type === 'resource-ref' && lookup.has(node.attachmentId))
      .map((node) => node.attachmentId),
  );
  const blocks: ChatMessageBlock[] = [];

  if (referencedAttachmentIds.size > 0) {
    const segments = buildParagraphSegments(normalized, attachments);
    if (segments.length) {
      blocks.push({
        type: 'paragraph',
        segments,
      } satisfies ChatMessageParagraphBlock);
    }
  } else {
    const markdown = serializeComposerDocumentToMarkdown(normalized, attachments);
    if (markdown.trim()) {
      blocks.push({
        type: 'text',
        text: markdown,
      });
    }
  }

  for (const attachment of attachments) {
    if (!lookup.has(attachment.id) || referencedAttachmentIds.has(attachment.id)) {
      continue;
    }
    blocks.push({
      type: 'resource',
      resourceId: attachment.id,
      display: 'card',
    });
  }

  return blocks;
}

export function buildComposerFileRefs(
  attachments: ChatComposerAttachmentRefLike[],
): ChatSendFileRef[] {
  return attachments
    .map((attachment, index) => {
      const relativePath = normalizeRelativePath(attachment.relativePath);
      if (!relativePath) {
        return null;
      }
      const resourceRef = buildStudioResourceRefFromRelativePath(relativePath);
      const item: ChatSendFileRef = {
        id: attachment.id,
        relativePath,
        fileName: composeAttachmentLabel(attachment),
        kind: attachmentKind(attachment),
        mimeType: attachment.mimeType || null,
      };
      if (resourceRef) {
        item.resourceRef = resourceRef;
      }
      return item;
    })
    .filter((item): item is ChatSendFileRef => Boolean(item));
}
