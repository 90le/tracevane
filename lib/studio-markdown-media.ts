import type { ChatAttachmentKind, ChatInlineResourceDisplay } from '../types/chat.js';

export type StudioMarkdownMediaDisplay = ChatInlineResourceDisplay | 'card';
export type StudioMarkdownMediaRef =
  | { kind: 'workspace'; path: string }
  | { kind: 'uploads'; path: string }
  | { kind: 'studio-file'; path: string };

const STUDIO_MARKDOWN_DISPLAY_SET = new Set<StudioMarkdownMediaDisplay>([
  'inline-image',
  'inline-video',
  'inline-chip',
  'break-image',
  'break-video',
  'break-chip',
  'card',
]);

const HASH_KIND_KEY = 'oc-studio-kind';
const HASH_NAME_KEY = 'oc-studio-name';

function isAbsoluteLikePath(value: string): boolean {
  return /^[\\/]/.test(value) || /^[a-z]:[\\/]/i.test(value);
}

function hasGenericUrlScheme(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function normalizeStudioMarkdownRelativeRefPath(value: string): string | null {
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

export function parseStudioMarkdownMediaTitle(value: string | null | undefined): StudioMarkdownMediaDisplay | null {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized.startsWith('studio:')) {
    return null;
  }
  const candidate = normalized.slice('studio:'.length) as StudioMarkdownMediaDisplay;
  return STUDIO_MARKDOWN_DISPLAY_SET.has(candidate) ? candidate : null;
}

export function parseStudioMarkdownMediaRef(value: string | null | undefined): StudioMarkdownMediaRef | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return null;
  }

  const match = /^(workspace|uploads|studio-file):/i.exec(trimmed);
  if (!match) {
    return null;
  }

  const scheme = match[1]?.toLowerCase();
  const refPath = trimmed.slice(match[0].length).trim();
  if (!refPath) {
    return null;
  }

  if (scheme === 'workspace' || scheme === 'uploads') {
    const normalizedPath = normalizeStudioMarkdownRelativeRefPath(refPath);
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
    kind: 'studio-file',
    path: refPath,
  };
}

export function isStudioMarkdownCompiledUrl(value: string | null | undefined): boolean {
  const normalized = stripStudioMarkdownMediaMeta(value || '').url;
  if (!normalized) {
    return false;
  }
  return /^\/api\/chat\/sessions\/[^/]+\/media\//.test(normalized)
    || /^https?:\/\/[^?#]+\/api\/chat\/sessions\/[^/]+\/media\//i.test(normalized);
}

export function appendStudioMarkdownMediaMeta(
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

export function stripStudioMarkdownMediaMeta(value: string): {
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

export function buildStudioMarkdownMediaDownloadUrl(value: string): string {
  const { url } = stripStudioMarkdownMediaMeta(value);
  if (!url) {
    return '';
  }
  if (/[?&]download=1(?:&|$)/.test(url)) {
    return url;
  }
  return `${url}${url.includes('?') ? '&' : '?'}download=1`;
}

export function inferStudioMarkdownMediaKind(
  display: StudioMarkdownMediaDisplay,
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

export function isStudioMarkdownExplicitLocalRef(value: string | null | undefined): boolean {
  return Boolean(
    typeof value === 'string'
    && normalizeStudioMarkdownRelativeRefPath(value),
  );
}
