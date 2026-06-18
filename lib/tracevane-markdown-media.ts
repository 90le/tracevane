import type { ChatAttachmentKind, ChatInlineResourceDisplay } from '../types/chat.js';

export type TracevaneMarkdownMediaDisplay = ChatInlineResourceDisplay | 'card';
export type TracevaneMarkdownMediaRef =
  | { kind: 'workspace'; path: string }
  | { kind: 'uploads'; path: string }
  | { kind: 'tracevane-file'; path: string };

const TRACEVANE_MARKDOWN_DISPLAY_SET = new Set<TracevaneMarkdownMediaDisplay>([
  'inline-image',
  'inline-video',
  'inline-chip',
  'break-image',
  'break-video',
  'break-chip',
  'card',
]);

const HASH_KIND_KEY = 'oc-tracevane-kind';
const HASH_NAME_KEY = 'oc-tracevane-name';

function isAbsoluteLikePath(value: string): boolean {
  return /^[\\/]/.test(value) || /^[a-z]:[\\/]/i.test(value);
}

function hasGenericUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function normalizeTracevaneMarkdownRelativeRefPath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }
  if (/^\/\//.test(trimmed)) {
    return null;
  }
  if (hasGenericUrlScheme(trimmed)) {
    return null;
  }
  if (isAbsoluteLikePath(trimmed)) {
    return null;
  }
  return trimmed;
}

export function parseTracevaneMarkdownMediaTitle(value: string | null | undefined): TracevaneMarkdownMediaDisplay | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized.startsWith('tracevane:')) {
    return null;
  }
  const candidate = normalized.slice('tracevane:'.length) as TracevaneMarkdownMediaDisplay;
  return TRACEVANE_MARKDOWN_DISPLAY_SET.has(candidate) ? candidate : null;
}

export function parseTracevaneMarkdownMediaRef(value: string | null | undefined): TracevaneMarkdownMediaRef | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }

  const match = /^(workspace|uploads|tracevane-file):/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const scheme = match[1]?.toLowerCase();
  const refPath = trimmed.slice(match[0].length).trim();
  if (!refPath) {
    return null;
  }

  if (scheme === 'workspace' || scheme === 'uploads') {
    const normalizedPath = normalizeTracevaneMarkdownRelativeRefPath(refPath);
    if (!normalizedPath) {
      return null;
    }
    return {
      kind: scheme,
      path: normalizedPath,
    };
  }

  if (refPath.startsWith('#')) {
    return null;
  }

  return {
    kind: 'tracevane-file',
    path: refPath,
  };
}

export function isTracevaneMarkdownCompiledUrl(value: string | null | undefined): boolean {
  const normalized = stripTracevaneMarkdownMediaMeta(value || '').url;
  if (!normalized) {
    return false;
  }
  return /^\/api\/chat\/sessions\/[^/]+\/media\//.test(normalized)
    || /^https?:\/\/[^?#]+\/api\/chat\/sessions\/[^/]+\/media\//i.test(normalized);
}

export function appendTracevaneMarkdownMediaMeta(
  url: string,
  meta: { kind: ChatAttachmentKind; fileName: string },
): string {
  const normalized = typeof url === 'string' ? url.trim() : '';
  if (!normalized) {
    return normalized;
  }
  const base = normalized.split('#', 1)[0] || normalized;
  const params = new URLSearchParams();
  params.set(HASH_KIND_KEY, meta.kind);
  params.set(HASH_NAME_KEY, meta.fileName);
  return `${base}#${params.toString()}`;
}

export function stripTracevaneMarkdownMediaMeta(value: string): {
  url: string;
  kind: ChatAttachmentKind | null;
  fileName: string | null;
} {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return {
      url: '',
      kind: null,
      fileName: null,
    };
  }

  const [base, hash = ''] = trimmed.split('#', 2);
  if (!hash.includes(HASH_KIND_KEY) && !hash.includes(HASH_NAME_KEY)) {
    return {
      url: trimmed,
      kind: null,
      fileName: null,
    };
  }

  const params = new URLSearchParams(hash);
  const kindValue = params.get(HASH_KIND_KEY);
  const fileName = params.get(HASH_NAME_KEY);
  return {
    url: base || trimmed,
    kind: kindValue === 'image' || kindValue === 'video' || kindValue === 'file' ? kindValue : null,
    fileName: typeof fileName === 'string' && fileName.trim() ? fileName.trim() : null,
  };
}

export function buildTracevaneMarkdownMediaDownloadUrl(value: string): string {
  const { url } = stripTracevaneMarkdownMediaMeta(value);
  if (!url) {
    return '';
  }
  if (/[?&]download=1(?:&|$)/.test(url)) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

export function inferTracevaneMarkdownMediaKind(
  display: TracevaneMarkdownMediaDisplay,
  fallbackKind: ChatAttachmentKind | null = null,
): ChatAttachmentKind | null {
  if (display === 'inline-image' || display === 'break-image') {
    return 'image';
  }
  if (display === 'inline-video' || display === 'break-video') {
    return 'video';
  }
  if (display === 'inline-chip' || display === 'break-chip') {
    return fallbackKind || 'file';
  }
  return fallbackKind;
}

export function isTracevaneMarkdownExplicitLocalRef(value: string | null | undefined): boolean {
  return Boolean(
    typeof value === 'string'
    && normalizeTracevaneMarkdownRelativeRefPath(value),
  );
}
