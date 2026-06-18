import type {
  ChatResourceItem,
  ChatResourceResolveRequest,
  ChatResourceResolveResponse,
} from '../../../../../types/chat';
import { parseTracevaneMarkdownMediaRef } from '../../../../../lib/tracevane-markdown-media';
import { resolveChatResources } from './api';

const MAX_TRACEVANE_RESOURCE_REFS_PER_MESSAGE = 48;
const MAX_TRACEVANE_RESOURCE_REFS_PER_BATCH = 100;
const RESOURCE_RESOLVE_BATCH_DELAY_MS = 8;
const RESOLVED_RESOURCE_CACHE_LIMIT = 800;
const READY_RESOURCE_CACHE_TTL_MS = 5 * 60 * 1000;
const MISSING_RESOURCE_CACHE_TTL_MS = 10 * 1000;

type ChatResourceResolveTransport = (
  sessionKey: string,
  payload: ChatResourceResolveRequest,
) => Promise<ChatResourceResolveResponse>;

type CachedResolvedResource = {
  expiresAt: number;
  resource: ChatResourceItem | null;
};

type PendingResourceWaiter = {
  resolve: (resource: ChatResourceItem | null) => void;
  reject: (error: unknown) => void;
};

type PendingResourceResolveBatch = {
  refs: Set<string>;
  waiters: Map<string, PendingResourceWaiter[]>;
  timer: ReturnType<typeof setTimeout> | null;
};

const resolvedResourceCache = new Map<string, CachedResolvedResource>();
const pendingResolveBatches = new Map<string, PendingResourceResolveBatch>();
const pendingResourcePromises = new Map<string, Promise<ChatResourceItem | null>>();
let chatResourceResolveTransport: ChatResourceResolveTransport = resolveChatResources;

function stripMarkdownCodeRegions(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
}

function normalizeTracevaneResourceRef(value: string): string | null {
  const trimmed = value.trim().replace(/^<([\s\S]+)>$/, '$1').trim();
  const parsed = parseTracevaneMarkdownMediaRef(trimmed);
  if (!parsed) {
    return null;
  }
  return `${parsed.kind}:${parsed.path}`;
}

export function extractTracevaneResourceRefs(source: string): string[] {
  const cleanSource = stripMarkdownCodeRegions(String(source || ''));
  if (!cleanSource) {
    return [];
  }

  const refs: string[] = [];
  const seen = new Set<string>();
  const record = (value: string): void => {
    const normalized = normalizeTracevaneResourceRef(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    refs.push(normalized);
  };

  const angleRefPattern = /<((?:workspace|uploads|tracevane-file):[^>\r\n]+)>/gi;
  const directSource = cleanSource.replace(angleRefPattern, ' ');
  angleRefPattern.lastIndex = 0;
  let angleMatch: RegExpExecArray | null;
  while ((angleMatch = angleRefPattern.exec(cleanSource))) {
    record(angleMatch[1] || '');
  }

  const directRefPattern = /\b(?:workspace|uploads|tracevane-file):[^\s)"'<>]+/gi;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directRefPattern.exec(directSource))) {
    record(directMatch[0] || '');
  }

  return refs.slice(0, MAX_TRACEVANE_RESOURCE_REFS_PER_MESSAGE);
}

function refCandidateValues(ref: string): Set<string> {
  const values = new Set<string>([ref]);
  const parsed = parseTracevaneMarkdownMediaRef(ref);
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
  resolvedResourceCache.delete(key);
  resolvedResourceCache.set(key, cached);
  return cached.resource;
}

function pruneResolvedResourceCache(now = Date.now()): void {
  for (const [key, item] of resolvedResourceCache.entries()) {
    if (item.expiresAt <= now) {
      resolvedResourceCache.delete(key);
    }
  }
  while (resolvedResourceCache.size > RESOLVED_RESOURCE_CACHE_LIMIT) {
    const oldest = resolvedResourceCache.keys().next().value;
    if (!oldest) {
      return;
    }
    resolvedResourceCache.delete(oldest);
  }
}

function writeCachedResource(sessionKey: string, ref: string, resource: ChatResourceItem | null): void {
  const key = cacheKey(sessionKey, ref);
  if (resolvedResourceCache.has(key)) {
    resolvedResourceCache.delete(key);
  }
  resolvedResourceCache.set(key, {
    resource,
    expiresAt: Date.now() + (resource?.status === 'missing' || !resource ? MISSING_RESOURCE_CACHE_TTL_MS : READY_RESOURCE_CACHE_TTL_MS),
  });
  pruneResolvedResourceCache();
}

function chunkRefs(refs: string[]): string[][] {
  const chunks: string[][] = [];
  for (let index = 0; index < refs.length; index += MAX_TRACEVANE_RESOURCE_REFS_PER_BATCH) {
    chunks.push(refs.slice(index, index + MAX_TRACEVANE_RESOURCE_REFS_PER_BATCH));
  }
  return chunks;
}

function getOrCreatePendingBatch(sessionKey: string): PendingResourceResolveBatch {
  const current = pendingResolveBatches.get(sessionKey);
  if (current) {
    return current;
  }
  const next: PendingResourceResolveBatch = {
    refs: new Set<string>(),
    waiters: new Map<string, PendingResourceWaiter[]>(),
    timer: null,
  };
  pendingResolveBatches.set(sessionKey, next);
  return next;
}

function resolveBatchWaiters(
  sessionKey: string,
  batch: PendingResourceResolveBatch,
  results: Map<string, ChatResourceItem | null>,
): void {
  for (const ref of batch.refs) {
    const waiters = batch.waiters.get(ref) || [];
    const resource = results.get(ref) ?? null;
    writeCachedResource(sessionKey, ref, resource);
    for (const waiter of waiters) {
      waiter.resolve(resource);
    }
  }
}

function rejectBatchWaiters(batch: PendingResourceResolveBatch, error: unknown): void {
  for (const waiters of batch.waiters.values()) {
    for (const waiter of waiters) {
      waiter.reject(error);
    }
  }
}

async function flushPendingResourceResolveBatch(sessionKey: string): Promise<void> {
  const batch = pendingResolveBatches.get(sessionKey);
  if (!batch) {
    return;
  }
  pendingResolveBatches.delete(sessionKey);
  batch.timer = null;

  const refs = [...batch.refs];
  const results = new Map<string, ChatResourceItem | null>();
  try {
    for (const chunk of chunkRefs(refs)) {
      const response = await chatResourceResolveTransport(sessionKey, { refs: chunk });
      for (const item of response.resources) {
        results.set(item.ref, item.resource);
        writeCachedResource(sessionKey, item.ref, item.resource);
        if (item.resourceRef && item.resourceRef !== item.ref) {
          writeCachedResource(sessionKey, item.resourceRef, item.resource);
        }
      }
    }
    resolveBatchWaiters(sessionKey, batch, results);
  } catch (error) {
    rejectBatchWaiters(batch, error);
  }
}

function scheduleResourceResolveBatch(sessionKey: string, batch: PendingResourceResolveBatch): void {
  if (batch.timer != null) {
    return;
  }
  batch.timer = setTimeout(() => {
    void flushPendingResourceResolveBatch(sessionKey);
  }, RESOURCE_RESOLVE_BATCH_DELAY_MS);
}

function resolveResourceRefBatched(sessionKey: string, ref: string): Promise<ChatResourceItem | null> {
  const key = cacheKey(sessionKey, ref);
  const pending = pendingResourcePromises.get(key);
  if (pending) {
    return pending;
  }

  const promise = new Promise<ChatResourceItem | null>((resolve, reject) => {
    const batch = getOrCreatePendingBatch(sessionKey);
    batch.refs.add(ref);
    const waiters = batch.waiters.get(ref) || [];
    waiters.push({ resolve, reject });
    batch.waiters.set(ref, waiters);
    scheduleResourceResolveBatch(sessionKey, batch);
  });
  pendingResourcePromises.set(key, promise);
  promise.then(
    () => pendingResourcePromises.delete(key),
    () => pendingResourcePromises.delete(key),
  );
  return promise;
}

export async function resolveMissingTracevaneResourcesForMarkdown(
  sessionKey: string | null | undefined,
  source: string,
  baseResources: ChatResourceItem[] | undefined,
): Promise<ChatResourceItem[]> {
  const normalizedSessionKey = String(sessionKey || '').trim();
  if (!normalizedSessionKey) {
    return [];
  }

  const refs = extractTracevaneResourceRefs(source)
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

  const fetched = await Promise.all(
    refsToFetch.map((ref) => resolveResourceRefBatched(normalizedSessionKey, ref)),
  );
  for (const item of fetched) {
    if (item) {
      resolved.push(item);
    }
  }
  return resolved;
}

export function resetChatResourceResolverForTest(): void {
  resolvedResourceCache.clear();
  pendingResourcePromises.clear();
  for (const batch of pendingResolveBatches.values()) {
    if (batch.timer != null) {
      clearTimeout(batch.timer);
    }
    rejectBatchWaiters(batch, new Error('Chat resource resolver reset'));
  }
  pendingResolveBatches.clear();
  chatResourceResolveTransport = resolveChatResources;
}

export function setChatResourceResolveTransportForTest(
  transport: ChatResourceResolveTransport,
): () => void {
  const previous = chatResourceResolveTransport;
  chatResourceResolveTransport = transport;
  return () => {
    chatResourceResolveTransport = previous;
  };
}
