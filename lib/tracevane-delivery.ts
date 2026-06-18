import type { ChatAttachmentKind, ChatInlineResourceDisplay } from '../types/chat.js';

export type TracevaneDeliveryTextBlock = { type: 'text'; text: string };
export type TracevaneDeliveryCardResourceBlock = { type: 'resource'; resourceId: string; display?: 'card' };
export type TracevaneDeliveryInlineTextSegment = { type: 'text'; text: string };
export type TracevaneDeliveryInlineResourceSegment = {
  type: 'resource';
  resourceId: string;
  display: ChatInlineResourceDisplay;
};
export type TracevaneDeliveryInlineSegment = TracevaneDeliveryInlineTextSegment | TracevaneDeliveryInlineResourceSegment;
export type TracevaneDeliveryParagraphBlock = {
  type: 'paragraph';
  segments: TracevaneDeliveryInlineSegment[];
};
export type TracevaneDeliveryBlock = TracevaneDeliveryTextBlock | TracevaneDeliveryParagraphBlock | TracevaneDeliveryCardResourceBlock;
export type TracevaneDeliveryV1Block = TracevaneDeliveryTextBlock | { type: 'resource'; resourceId: string };
export type TracevaneDeliveryV2Block = TracevaneDeliveryParagraphBlock | { type: 'resource'; resourceId: string; display: 'card' };

export interface TracevaneDeliveryResource {
  id: string;
  kind: ChatAttachmentKind;
  fileName: string;
  mimeType?: string | null;
  path?: string;
  filePath?: string;
  media?: string;
  buffer?: string;
  contentType?: string | null;
  caption?: string;
}

export interface TracevaneDeliveryResultV1 {
  type: 'tracevane_delivery';
  version: 1;
  blocks: TracevaneDeliveryV1Block[];
  resources: TracevaneDeliveryResource[];
}

export interface TracevaneDeliveryResultV2 {
  type: 'tracevane_delivery';
  version: 2;
  blocks: TracevaneDeliveryV2Block[];
  resources: TracevaneDeliveryResource[];
}

export type TracevaneDeliveryResult = TracevaneDeliveryResultV1 | TracevaneDeliveryResultV2;

export interface TracevaneDeliveryToolInput {
  version?: 1 | 2;
  blocks?: unknown[];
  resources?: TracevaneDeliveryResource[];
}

export interface TracevaneDeliveryNormalizationResult {
  ok: boolean;
  payload: TracevaneDeliveryResult | null;
  error: string | null;
}

type NormalizedInlineSegmentResult = {
  segment: TracevaneDeliveryInlineSegment | null;
  hadTextIntent: boolean;
  error: string | null;
};

type NormalizedBlockResult = {
  block: TracevaneDeliveryBlock | null;
  hadTextIntent: boolean;
  usesV2Features: boolean;
  error: string | null;
};

function normalizeString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readNonEmptyText(value: unknown, preserveWhitespace = false): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  if (!value.trim()) {
    return null;
  }
  const normalized = value.replace(/\r\n?/g, '\n');
  return preserveWhitespace ? normalized : normalized.trim();
}

function normalizeVersion(value: unknown): 1 | 2 | null {
  return value === 1 || value === 2 ? value : null;
}

function normalizeInlineDisplay(value: unknown): ChatInlineResourceDisplay | null {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  return normalized === 'inline-image'
    || normalized === 'inline-video'
    || normalized === 'inline-chip'
    || normalized === 'break-image'
    || normalized === 'break-video'
    || normalized === 'break-chip'
    ? normalized
    : null;
}

function normalizeResourceBlockDisplay(value: unknown): 'card' | null {
  const normalized = normalizeString(value)?.toLowerCase() || null;
  return normalized === 'card' ? 'card' : null;
}

function normalizeTextLikeValue(
  record: Record<string, unknown>,
  options: { preserveWhitespace?: boolean } = {},
): string | null {
  const preserveWhitespace = options.preserveWhitespace === true;
  return readNonEmptyText(record.text, preserveWhitespace)
    || readNonEmptyText(record.content, preserveWhitespace)
    || readNonEmptyText(record.message, preserveWhitespace);
}

function normalizeInlineSegment(value: unknown): NormalizedInlineSegmentResult {
  if (!value || typeof value !== 'object') {
    return { segment: null, hadTextIntent: false, error: null };
  }

  const record = value as Record<string, unknown>;
  const type = normalizeString(record.type)?.toLowerCase() || null;
  const hadTextIntent = type === 'text'
    || type === 'markdown'
    || typeof record.text === 'string'
    || typeof record.content === 'string'
    || typeof record.message === 'string';

  if (type === 'text' || type === 'markdown') {
    const text = normalizeTextLikeValue(record, { preserveWhitespace: true });
    return {
      segment: text ? { type: 'text', text } : null,
      hadTextIntent,
      error: null,
    };
  }

  if (type === 'resource') {
    const resourceId = normalizeString(record.resourceId);
    const display = normalizeInlineDisplay(record.display);
    if (!resourceId) {
      return {
        segment: null,
        hadTextIntent: false,
        error: 'tracevane_delivery inline resource segments require a non-empty resourceId.',
      };
    }
    if (!display) {
      return {
        segment: null,
        hadTextIntent: false,
        error: 'tracevane_delivery inline resource segments require display "inline-image", "inline-video", "inline-chip", "break-image", "break-video", or "break-chip".',
      };
    }
    return {
      segment: {
        type: 'resource',
        resourceId,
        display,
      },
      hadTextIntent: false,
      error: null,
    };
  }

  return { segment: null, hadTextIntent, error: null };
}

function normalizeTracevaneDeliveryBlock(value: unknown): NormalizedBlockResult {
  if (!value || typeof value !== 'object') {
    return { block: null, hadTextIntent: false, usesV2Features: false, error: null };
  }

  const record = value as Record<string, unknown>;
  const type = normalizeString(record.type)?.toLowerCase() || null;
  const hadTextIntent = type === 'text'
    || type === 'markdown'
    || typeof record.text === 'string'
    || typeof record.content === 'string'
    || typeof record.message === 'string';

  if (type === 'text' || type === 'markdown') {
    const text = normalizeTextLikeValue(record);
    return {
      block: text ? { type: 'text', text } : null,
      hadTextIntent,
      usesV2Features: false,
      error: null,
    };
  }

  if (type === 'paragraph') {
    if (!Array.isArray(record.segments)) {
      return {
        block: null,
        hadTextIntent: false,
        usesV2Features: true,
        error: 'tracevane_delivery paragraph blocks require a segments array.',
      };
    }
    const segmentResults = record.segments.map((segment) => normalizeInlineSegment(segment));
    const segments = segmentResults
      .map((result) => result.segment)
      .filter((segment): segment is TracevaneDeliveryInlineSegment => Boolean(segment));
    if (!segments.length) {
      const firstError = segmentResults.find((result) => result.error)?.error || null;
      return {
        block: null,
        hadTextIntent: segmentResults.some((result) => result.hadTextIntent),
        usesV2Features: true,
        error: firstError || 'tracevane_delivery paragraph.segments must contain at least one valid segment.',
      };
    }
    return {
      block: {
        type: 'paragraph',
        segments,
      },
      hadTextIntent: segmentResults.some((result) => result.hadTextIntent),
      usesV2Features: true,
      error: segmentResults.find((result) => result.error)?.error || null,
    };
  }

  if (type === 'resource') {
    const resourceId = normalizeString(record.resourceId);
    if (!resourceId) {
      return {
        block: null,
        hadTextIntent: false,
        usesV2Features: false,
        error: 'tracevane_delivery resource blocks require a non-empty resourceId.',
      };
    }
    const display = record.display == null ? null : normalizeResourceBlockDisplay(record.display);
    if (record.display != null && !display) {
      return {
        block: null,
        hadTextIntent: false,
        usesV2Features: true,
        error: 'tracevane_delivery top-level resource blocks only support display "card".',
      };
    }
    return {
      block: {
        type: 'resource',
        resourceId,
        ...(display ? { display } : {}),
      },
      hadTextIntent: false,
      usesV2Features: display === 'card',
      error: null,
    };
  }

  return { block: null, hadTextIntent, usesV2Features: false, error: null };
}

function normalizeTracevaneDeliveryResource(value: unknown): TracevaneDeliveryResource | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const kind = normalizeString(record.kind);
  const fileName = normalizeString(record.fileName);
  if (!id || !fileName || (kind !== 'image' && kind !== 'video' && kind !== 'file')) {
    return null;
  }

  const pathValue = normalizeString(record.path) || undefined;
  const filePath = normalizeString(record.filePath) || undefined;
  const media = normalizeString(record.media) || undefined;
  const buffer = normalizeString(record.buffer) || undefined;
  if (!pathValue && !filePath && !media && !buffer) {
    return null;
  }

  return {
    id,
    kind,
    fileName,
    mimeType: normalizeString(record.mimeType),
    ...(pathValue ? { path: pathValue } : {}),
    ...(filePath ? { filePath } : {}),
    ...(media ? { media } : {}),
    ...(buffer ? { buffer } : {}),
    contentType: normalizeString(record.contentType),
    ...(normalizeString(record.caption) ? { caption: normalizeString(record.caption) || undefined } : {}),
  };
}

function buildTracevaneDeliveryResult(params: {
  version: 1 | 2;
  blocks: TracevaneDeliveryBlock[];
  resources: TracevaneDeliveryResource[];
}): TracevaneDeliveryNormalizationResult {
  const { version, blocks, resources } = params;
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource] as const));

  if (!blocks.length) {
    return {
      ok: false,
      payload: null,
      error: 'tracevane_delivery requires at least one valid block.',
    };
  }

  for (const block of blocks) {
    if (block.type === 'text') {
      continue;
    }

    if (block.type === 'resource') {
      if (!resourceMap.has(block.resourceId)) {
        return {
          ok: false,
          payload: null,
          error: 'tracevane_delivery requires every resource reference to point to an existing resources[].id entry.',
        };
      }
      continue;
    }

    if (!block.segments.length) {
      return {
        ok: false,
        payload: null,
        error: 'tracevane_delivery paragraph.segments must contain at least one segment.',
      };
    }

    for (const segment of block.segments) {
      if (segment.type === 'text') {
        continue;
      }
      const resource = resourceMap.get(segment.resourceId);
      if (!resource) {
        return {
          ok: false,
          payload: null,
          error: 'tracevane_delivery requires every resource reference to point to an existing resources[].id entry.',
        };
      }
      if ((segment.display === 'inline-image' || segment.display === 'break-image') && resource.kind !== 'image') {
        return {
          ok: false,
          payload: null,
          error: `tracevane_delivery ${segment.display} can only reference kind=image resources (received ${resource.kind} for ${segment.resourceId}).`,
        };
      }
      if ((segment.display === 'inline-video' || segment.display === 'break-video') && resource.kind !== 'video') {
        return {
          ok: false,
          payload: null,
          error: `tracevane_delivery ${segment.display} can only reference kind=video resources (received ${resource.kind} for ${segment.resourceId}).`,
        };
      }
    }
  }

  if (version === 1) {
    const blocksV1: TracevaneDeliveryV1Block[] = blocks
      .filter((block): block is Extract<TracevaneDeliveryBlock, { type: 'text' | 'resource' }> => block.type === 'text' || block.type === 'resource')
      .map((block) => (block.type === 'text'
        ? block
        : {
          type: 'resource',
          resourceId: block.resourceId,
        }));
    return {
      ok: true,
      payload: {
        type: 'tracevane_delivery',
        version: 1,
        blocks: blocksV1,
        resources,
      },
      error: null,
    };
  }

  const blocksV2: TracevaneDeliveryV2Block[] = blocks.map((block) => {
    if (block.type === 'paragraph') {
      return block;
    }
    if (block.type === 'text') {
      return {
        type: 'paragraph',
        segments: [
          {
            type: 'text',
            text: block.text,
          },
        ],
      };
    }
    return {
      type: 'resource',
      resourceId: block.resourceId,
      display: 'card',
    };
  });

  return {
    ok: true,
    payload: {
      type: 'tracevane_delivery',
      version: 2,
      blocks: blocksV2,
      resources,
    },
    error: null,
  };
}

export function normalizeTracevaneDeliveryInputDetailed(raw: unknown): TracevaneDeliveryNormalizationResult {
  if (!raw || typeof raw !== 'object') {
    return {
      ok: false,
      payload: null,
      error: 'tracevane_delivery requires an object payload with blocks/resources.',
    };
  }

  const record = raw as Record<string, unknown>;
  const requestedVersion = normalizeVersion(record.version);
  const rawBlocks = Array.isArray(record.blocks) ? record.blocks : [];
  const normalizedBlockResults = rawBlocks.map((entry) => normalizeTracevaneDeliveryBlock(entry));
  const firstBlockError = normalizedBlockResults.find((entry) => entry.error)?.error || null;
  const blocks = normalizedBlockResults
    .map((entry) => entry.block)
    .filter((entry): entry is TracevaneDeliveryBlock => Boolean(entry));
  const resources = (Array.isArray(record.resources) ? record.resources : [])
    .map((entry) => normalizeTracevaneDeliveryResource(entry))
    .filter((entry): entry is TracevaneDeliveryResource => Boolean(entry));

  const hadTextIntent = normalizedBlockResults.some((entry) => entry.hadTextIntent);
  const hasRenderableText = blocks.some((block) => {
    if (block.type === 'text') {
      return Boolean(block.text.trim());
    }
    return block.type === 'paragraph' && block.segments.some((segment) => segment.type === 'text' && segment.text.trim());
  });

  if (hadTextIntent && !hasRenderableText) {
    return {
      ok: false,
      payload: null,
      error: 'tracevane_delivery dropped all text-like blocks during normalization. Use non-empty text/content/message with type "text" or "markdown", or valid paragraph text segments.',
    };
  }

  if (firstBlockError) {
    return {
      ok: false,
      payload: null,
      error: firstBlockError,
    };
  }

  const usesV2Features = normalizedBlockResults.some((entry) => entry.usesV2Features);
  const version = requestedVersion ?? (usesV2Features ? 2 : 1);

  if (version === 1 && usesV2Features) {
    return {
      ok: false,
      payload: null,
      error: 'tracevane_delivery version 1 only supports legacy text/resource blocks. Use version 2 for paragraph and inline displays.',
    };
  }

  return buildTracevaneDeliveryResult({
    version,
    blocks,
    resources,
  });
}

export function normalizeTracevaneDeliveryInput(raw: unknown): TracevaneDeliveryResult | null {
  return normalizeTracevaneDeliveryInputDetailed(raw).payload;
}

export function extractTracevaneDeliveryPayload(raw: unknown): TracevaneDeliveryResult | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.type !== 'tracevane_delivery') {
    return null;
  }
  const version = normalizeVersion(record.version);
  if (!version) {
    return null;
  }
  return normalizeTracevaneDeliveryInput(record);
}

export function summarizeTracevaneDeliveryText(payload: Pick<TracevaneDeliveryResult, 'blocks' | 'resources'>): string {
  const resourceMap = new Map(payload.resources.map((resource) => [resource.id, resource] as const));
  const lines: string[] = [];

  for (const block of payload.blocks) {
    if (block.type === 'text') {
      const text = block.text.trim();
      if (text) {
        lines.push(text);
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const summary = block.segments
        .map((segment) => {
          if (segment.type === 'text') {
            return segment.text;
          }
          return resourceMap.get(segment.resourceId)?.fileName || '';
        })
        .join('')
        .trim();
      if (summary) {
        lines.push(summary);
      }
    }
  }

  return lines.join('\n');
}

export function isTracevaneManagedWebchatSession(params: {
  sessionKey?: string | null;
  messageChannel?: string | null;
}): boolean {
  const sessionKey = normalizeString(params.sessionKey);
  if (!sessionKey || !sessionKey.includes(':webchat:') || !sessionKey.includes(':tracevane-')) {
    return false;
  }
  const channel = normalizeString(params.messageChannel);
  return !channel || channel.toLowerCase() === 'webchat';
}
