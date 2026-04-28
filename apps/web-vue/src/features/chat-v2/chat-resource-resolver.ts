import type { ChatResourceItem } from '../../../../../types/chat';
import { parseStudioMarkdownMediaRef } from '../../../../../lib/studio-markdown-media';
import { resolveChatResources } from '../chat/api';

const MAX_STUDIO_RESOURCE_REFS_PER_MESSAGE = 48;
const READY_RESOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const MISSING_RESOURCE_CACHE_TTL_MS = 10 * 1000;

type CachedResolvedResource = {
  expiresAt: number;
  resource: ChatResourceItem | null;
};

const resolvedResourceCache = new Map<string, CachedResolvedResource>();

function stripMarkdownCodeRegions(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function normalizeStudioResourceRef(value: string): string | null {
  const trimmed = value.trim().replace(/^<([\s\S]+)>$/, '$1').trim();
  const parsed = parseStudioMarkdownMediaRef(trimmed);
  if (!parsed) {
    return null;
  }
  return `${parsed.kind}:${parsed.path}`;
}

export function extractStudioResourceRefs(source: string): string[] {
  const cleanSource = stripMarkdownCodeRegions(String(source || ''));
  if (!cleanSource) {
    return [];
  }

  const refs: string[] = [];
  const seen = new Set<string>();
  const record = (value: string): void => {
    const normalized = normalizeStudioResourceRef(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    refs.push(normalized);
  };

  const angleRefPattern = /<((?:workspace|uploads|studio-file):[^>\r\n]+)>/gi;
  const directSource = cleanSource.replace(angleRefPattern, ' ');
  angleRefPattern.lastIndex = 0;
  let angleMatch: RegExpExecArray | null;
  while ((angleMatch = angleRefPattern.exec(cleanSource))) {
    record(angleMatch[1] || '');
  }

  const directRefPattern = /\b(?:workspace|uploads|studio-file):[^\s)"'<>]+/gi;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directRefPattern.exec(directSource))) {
    record(directMatch[0] || '');
  }

  return refs.slice(0, MAX_STUDIO_RESOURCE_REFS_PER_MESSAGE);
}

function refCandidateValues(ref: string): Set<string> {
  const values = new Set<string>([ref]);
  const parsed = parseStudioMarkdownMediaRef(ref);
  if (!parsed) {
    return values;
  }
  values.add(`${parsed.kind}:${parsed.path}`);
  values.add(parsed.path);
  if (parsed.kind === 'uploads') {
    values.add(`uploads/${parsed.path}`);
  }
  return values;
}

export function hasResourceForRef(resources: ChatResourceItem[] | undefined, ref: string): boolean {
  const candidates = refCandidateValues(ref);
  return Boolean((resources || []).some((item) => (
    candidates.has(item.originalPath || '')
    || candidates.has(item.relativePath || '')
    || candidates.has(item.fileName || '')
  )));
}

function isMissingResource(item: ChatResourceItem): boolean {
  return item.status === 'missing' || (!item.url && !item.downloadUrl);
}

function isReadyResource(item: ChatResourceItem): boolean {
  return !isMissingResource(item);
}

function resourceMatchesRef(item: ChatResourceItem, ref: string): boolean {
  const candidates = refCandidateValues(ref);
  return candidates.has(item.originalPath || '')
    || candidates.has(item.relativePath || '')
    || candidates.has(item.fileName || '');
}

export function hasReadyResourceForRef(resources: ChatResourceItem[] | undefined, ref: string): boolean {
  return Boolean((resources || []).some((item) => resourceMatchesRef(item, ref) && isReadyResource(item)));
}

function resourceIdentity(item: ChatResourceItem): string {
  return item.originalPath
    || item.relativePath
    || item.url
    || item.downloadUrl
    || item.id;
}

export function mergeChatResourceItems(
  baseResources: ChatResourceItem[] | undefined,
  extraResources: ChatResourceItem[] | undefined,
): ChatResourceItem[] | undefined {
  const base = baseResources || [];
  const extras = extraResources || [];
  if (!base.length && !extras.length) {
    return undefined;
  }

  const merged: ChatResourceItem[] = [];
  const seen = new Set<string>();
  for (const item of [...base, ...extras]) {
    const key = resourceIdentity(item);
    if (key && seen.has(key)) {
      const existingIndex = merged.findIndex((entry) => resourceIdentity(entry) === key);
      const existing = existingIndex >= 0 ? merged[existingIndex] : null;
      if (existing && isMissingResource(existing) && isReadyResource(item)) {
        merged[existingIndex] = item;
      }
      continue;
    }
    if (key) {
      seen.add(key);
    }
    merged.push(item);
  }
  return merged;
}

function cacheKey(sessionKey: string, ref: string): string {
  return `${sessionKey}\n${ref}`;
}

function readCachedResource(sessionKey: string, ref: string): ChatResourceItem | null | undefined {
  const key = cacheKey(sessionKey, ref);
  const cached = resolvedResourceCache.get(key);
  if (!cached) {
    return undefined;
  }
  if (cached.expiresAt <= Date.now()) {
    resolvedResourceCache.delete(key);
    return undefined;
  }
  return cached.resource;
}

function writeCachedResource(sessionKey: string, ref: string, resource: ChatResourceItem | null): void {
  resolvedResourceCache.set(cacheKey(sessionKey, ref), {
    resource,
    expiresAt: Date.now() + (resource?.status === 'missing' || !resource ? MISSING_RESOURCE_CACHE_TTL_MS : READY_RESOURCE_CACHE_TTL_MS),
  });
}

export async function resolveMissingStudioResourcesForMarkdown(
  sessionKey: string | null | undefined,
  source: string,
  baseResources: ChatResourceItem[] | undefined,
): Promise<ChatResourceItem[]> {
  const normalizedSessionKey = String(sessionKey || '').trim();
  if (!normalizedSessionKey) {
    return [];
  }

  const refs = extractStudioResourceRefs(source)
    .filter((ref) => !hasReadyResourceForRef(baseResources, ref));
  if (!refs.length) {
    return [];
  }

  const resolved: ChatResourceItem[] = [];
  const refsToFetch: string[] = [];
  for (const ref of refs) {
    const cached = readCachedResource(normalizedSessionKey, ref);
    if (cached === undefined) {
      refsToFetch.push(ref);
      continue;
    }
    if (cached) {
      resolved.push(cached);
    }
  }

  if (!refsToFetch.length) {
    return resolved;
  }

  const response = await resolveChatResources(normalizedSessionKey, { refs: refsToFetch });
  for (const item of response.resources) {
    writeCachedResource(normalizedSessionKey, item.ref, item.resource);
    if (item.resource) {
      resolved.push(item.resource);
    }
  }
  return resolved;
}
