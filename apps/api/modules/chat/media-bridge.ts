import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TracevaneServerConfig } from '../../../../types/api.js';
import type {
  ChatAttachmentKind,
  ChatInlineSegment,
  ChatMessageBlock,
  ChatMessageItem,
  ChatMessageToolCallItem,
  ChatResourceItem,
  ChatSendAttachment,
  ChatSendFileRef,
  ChatToolArtifactItem,
} from '../../../../types/chat.js';
import type { ChannelConnectorInboundAttachment } from '../../../../types/channel-connectors.js';
import { buildContentDisposition } from '../../core/http.js';
import { readOpenClawConfig } from '../../core/state.js';
import { extractTracevaneDeliveryPayload, summarizeTracevaneDeliveryText, type TracevaneDeliveryResult, type TracevaneDeliveryResource } from '../../../../lib/tracevane-delivery.js';
import {
  appendTracevaneMarkdownMediaMeta,
  isTracevaneMarkdownExplicitLocalRef,
  parseTracevaneMarkdownMediaRef,
  type TracevaneMarkdownMediaRef,
} from '../../../../lib/tracevane-markdown-media.js';
import {
  buildTracevaneFilesResourceRef,
  buildTracevaneResourceRefFromRelativePath,
  parseTracevaneFilesResourceRef,
} from '../../../../lib/tracevane-resource-refs.js';
import { compileAssistantMarkdownMedia, type CompileAssistantMarkdownMediaResult } from './assistant-markdown-media.js';
import { deriveAgentIdFromSessionKey } from './session-model.js';
import { resolveFilesServiceExistingFilePath } from '../files/service.js';

type MediaTokenPayload = {
  v: 1;
  sessionKey: string;
  filePath: string;
  fileName: string;
  mimeType: string | null;
  kind: ChatAttachmentKind;
};

type VerifiedMediaToken = {
  payload: MediaTokenPayload;
  verified: boolean;
};

export type ResolvedChatMedia = {
  absolutePath: string;
  fileName: string;
  mimeType: string;
  kind: ChatAttachmentKind;
  size: number;
};

type CollectResourceContext = {
  sessionKey: string;
  config: TracevaneServerConfig;
  signToken: (payload: MediaTokenPayload) => string;
};

type CollectUnknownContext = CollectResourceContext & {
  seenKeys: Set<string>;
  items: ChatResourceItem[];
};

const DATA_URL_RE = /^data:([^;,]+)?(?:;base64)?,/i;
const DATA_IMAGE_RE = /^data:(image\/[a-z0-9.+-]+);base64,/i;
const HTTP_URL_RE = /^https?:\/\//i;
const FILE_URL_RE = /^file:\/\//i;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const TRAILING_PUNCTUATION_RE = /[),.;:!?]+$/;
const MEDIA_TOKEN_SECRET_RELATIVE_PATH = path.join('tracevane', 'media-token-secret.json');

const MIME_BY_EXTENSION: Record<string, string> = {
  '.apng': 'image/apng',
  '.bmp': 'image/bmp',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.tar': 'application/x-tar',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.zip': 'application/zip',
};

function tryRealPathSync(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function toPortableRelativePath(value: string): string {
  return value.split(path.sep).join('/');
}

function normalizeMimeType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.split(';')[0]?.trim().toLowerCase() || '';
  return normalized || null;
}

function looksLikeImageMimeType(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith('image/');
}

function looksLikeVideoMimeType(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith('video/');
}

function mimeTypeFromPath(filePath: string): string | null {
  return MIME_BY_EXTENSION[path.extname(filePath).toLowerCase()] || null;
}

function inferMediaKind(fileName: string, mimeType?: string | null): ChatAttachmentKind {
  if (looksLikeImageMimeType(mimeType)) {
    return 'image';
  }
  if (looksLikeVideoMimeType(mimeType)) {
    return 'video';
  }
  const normalizedPathMime = mimeTypeFromPath(fileName);
  if (looksLikeImageMimeType(normalizedPathMime)) {
    return 'image';
  }
  if (looksLikeVideoMimeType(normalizedPathMime)) {
    return 'video';
  }
  return 'file';
}

function fileNameFromUrl(value: string): string {
  try {
    const url = new URL(value);
    const baseName = path.posix.basename(url.pathname);
    return baseName || 'media';
  } catch {
    return 'media';
  }
}

function isRemoteUrl(value: string): boolean {
  return HTTP_URL_RE.test(value);
}

function trimCandidateRef(value: string): string {
  return value.trim().replace(TRAILING_PUNCTUATION_RE, '');
}

function normalizeRemoteRef(value: string): string | null {
  const trimmed = trimCandidateRef(value);
  return isRemoteUrl(trimmed) ? trimmed : null;
}

function looksLikeMediaUrl(value: string): boolean {
  const fileName = fileNameFromUrl(value);
  return Boolean(path.extname(fileName) && mimeTypeFromPath(fileName));
}

function normalizeDataImageRef(value: string): { url: string; mimeType: string } | null {
  const trimmed = value.trim();
  const match = DATA_IMAGE_RE.exec(trimmed);
  if (!match) return null;
  return {
    url: trimmed,
    mimeType: normalizeMimeType(match[1]) || 'image/png',
  };
}

function normalizeDataUrlRef(value: string): { url: string; mimeType: string } | null {
  const trimmed = value.trim();
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return null;
  return {
    url: trimmed,
    mimeType: normalizeMimeType(match[1]) || 'application/octet-stream',
  };
}

export function safeStatSync(filePath: string): fs.Stats | null {
  try {
    return fs.statSync(filePath);
  } catch {
    return null;
  }
}

function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function normalizeOpenClawPath(value: string): string {
  return value.replace(/\0/g, '');
}

function readPersistedMediaTokenSecret(config: TracevaneServerConfig): string | null {
  try {
    const secretPath = path.join(config.openclawRoot, MEDIA_TOKEN_SECRET_RELATIVE_PATH);
    const raw = fs.readFileSync(secretPath, 'utf-8');
    const parsed = JSON.parse(raw) as { secret?: unknown };
    const secret = typeof parsed.secret === 'string' ? parsed.secret.trim() : '';
    return secret || null;
  } catch {
    return null;
  }
}

function persistMediaTokenSecret(config: TracevaneServerConfig, secret: string): void {
  const secretPath = path.join(config.openclawRoot, MEDIA_TOKEN_SECRET_RELATIVE_PATH);
  ensureDirSync(path.dirname(secretPath));
  const body = JSON.stringify({
    version: 1,
    secret,
    updatedAt: new Date().toISOString(),
  }, null, 2);
  fs.writeFileSync(secretPath, `${body}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

function resolveMediaTokenSecret(config: TracevaneServerConfig): Buffer {
  const persisted = readPersistedMediaTokenSecret(config);
  if (persisted) {
    return Buffer.from(persisted);
  }
  const generated = crypto.randomBytes(32).toString('base64url');
  persistMediaTokenSecret(config, generated);
  return Buffer.from(generated);
}

function getDefaultAgentId(config: TracevaneServerConfig): string {
  const openclawConfig = readOpenClawConfig(config);
  const list = Array.isArray(openclawConfig.agents?.list) ? openclawConfig.agents.list : [];
  const markedDefault = list.find((item: Record<string, unknown>) => item?.default === true);
  const first = markedDefault || list[0];
  return typeof first?.id === 'string' && first.id.trim() ? first.id.trim() : 'main';
}

function resolveAgentWorkspaceDir(config: TracevaneServerConfig, agentId: string): string {
  const openclawConfig = readOpenClawConfig(config);
  const list = Array.isArray(openclawConfig.agents?.list) ? openclawConfig.agents.list : [];
  const entry = list.find((item: Record<string, unknown>) => typeof item?.id === 'string' && item.id.trim() === agentId);
  if (typeof entry?.workspace === 'string' && entry.workspace.trim()) {
    return tryRealPathSync(normalizeOpenClawPath(path.resolve(entry.workspace.trim().replace(/^~(?=$|\/|\\)/, os.homedir()))));
  }

  const defaultAgentId = getDefaultAgentId(config);
  if (agentId === defaultAgentId) {
    const defaultsWorkspace = openclawConfig.agents?.defaults?.workspace;
    if (typeof defaultsWorkspace === 'string' && defaultsWorkspace.trim()) {
      return tryRealPathSync(normalizeOpenClawPath(path.resolve(defaultsWorkspace.trim().replace(/^~(?=$|\/|\\)/, os.homedir()))));
    }
    return tryRealPathSync(path.join(config.openclawRoot, 'workspace'));
  }

  return tryRealPathSync(path.join(config.openclawRoot, `workspace-${agentId}`));
}

function allowedMediaRoots(config: TracevaneServerConfig, sessionKey: string): string[] {
  const agentId = deriveAgentIdFromSessionKey(sessionKey);
  return [
    config.projectRoot,
    config.openclawRoot,
    path.join(os.tmpdir(), 'openclaw'),
    resolveAgentWorkspaceDir(config, agentId),
  ].map((item) => tryRealPathSync(item));
}

function isWithinAllowedRoots(filePath: string, roots: readonly string[]): boolean {
  const normalizedPath = tryRealPathSync(filePath);
  return roots.some((root) => normalizedPath === root || normalizedPath.startsWith(`${root}${path.sep}`));
}

function resolveRelativeCandidates(config: TracevaneServerConfig, sessionKey: string, ref: string): string[] {
  const agentWorkspace = resolveAgentWorkspaceDir(config, deriveAgentIdFromSessionKey(sessionKey));
  return [
    path.resolve(agentWorkspace, ref),
    path.resolve(config.projectRoot, ref),
    path.resolve(config.openclawRoot, ref),
  ];
}

function resolveLocalFilePath(config: TracevaneServerConfig, sessionKey: string, ref: string): string | null {
  const trimmed = trimCandidateRef(ref);
  if (!trimmed || DATA_URL_RE.test(trimmed) || isRemoteUrl(trimmed)) {
    return null;
  }

  let candidates: string[] = [];

  if (FILE_URL_RE.test(trimmed)) {
    try {
      candidates = [fileURLToPath(trimmed)];
    } catch {
      return null;
    }
  } else if (path.isAbsolute(trimmed)) {
    candidates = [trimmed];
  } else if (!URL_SCHEME_RE.test(trimmed)) {
    candidates = resolveRelativeCandidates(config, sessionKey, trimmed);
  } else {
    return null;
  }

  const roots = allowedMediaRoots(config, sessionKey);

  for (const candidate of candidates) {
    const normalized = tryRealPathSync(candidate);
    const stat = safeStatSync(normalized);
    if (!stat?.isFile()) {
      continue;
    }
    if (!isWithinAllowedRoots(normalized, roots)) {
      continue;
    }
    return normalized;
  }

  return null;
}

function resolveScopedWorkspaceFilePath(
  config: TracevaneServerConfig,
  sessionKey: string,
  ref: string,
  scope: 'workspace' | 'uploads',
): string | null {
  const agentWorkspace = resolveAgentWorkspaceDir(config, deriveAgentIdFromSessionKey(sessionKey));
  const baseDir = scope === 'uploads'
    ? path.join(agentWorkspace, 'uploads')
    : agentWorkspace;
  const candidate = tryRealPathSync(normalizeOpenClawPath(path.resolve(baseDir, ref)));
  const stat = safeStatSync(candidate);
  if (!stat?.isFile()) {
    return null;
  }
  if (!isWithinAllowedRoots(candidate, [tryRealPathSync(baseDir)])) {
    return null;
  }
  return candidate;
}

function resolveFilesResourceFilePath(
  config: TracevaneServerConfig,
  rootId: string | null | undefined,
  ref: string | null | undefined,
): string | null {
  const normalizedRootId = typeof rootId === 'string' ? rootId.trim() : '';
  const normalizedRef = typeof ref === 'string' ? toPortableRelativePath(ref.trim()) : '';
  if (!normalizedRootId || !normalizedRef || !isSafeScopedResourceRefPath(normalizedRef)) {
    return null;
  }
  try {
    return resolveFilesServiceExistingFilePath(config, normalizedRootId, normalizedRef).absolutePath;
  } catch {
    return null;
  }
}

function isSafeScopedResourceRefPath(value: string): boolean {
  const normalized = toPortableRelativePath(value);
  return Boolean(normalized)
    && !path.isAbsolute(normalized)
    && !normalized.split('/').includes('..');
}

function resolveTracevaneMarkdownMediaFilePath(
  config: TracevaneServerConfig,
  sessionKey: string,
  ref: string,
  parsedRef: TracevaneMarkdownMediaRef | null,
): string | null {
  if (!parsedRef) {
    return resolveLocalFilePath(config, sessionKey, ref);
  }

  if (parsedRef.kind === 'workspace' || parsedRef.kind === 'uploads') {
    return resolveScopedWorkspaceFilePath(config, sessionKey, parsedRef.path, parsedRef.kind);
  }

  if (parsedRef.kind === 'files') {
    return resolveFilesResourceFilePath(config, parsedRef.rootId, parsedRef.path);
  }

  return resolveLocalFilePath(config, sessionKey, parsedRef.path);
}

function hashId(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 16);
}

function pushResourceItem(target: ChatResourceItem[], seenKeys: Set<string>, item: ChatResourceItem): void {
  const key = `${item.kind}:${item.url}:${item.downloadUrl}:${item.id}:${item.relativePath || item.fileName}:${item.source}:${item.status}`;
  if (seenKeys.has(key)) {
    return;
  }
  seenKeys.add(key);
  target.push(item);
}

function buildRemoteResourceItem(
  ref: string,
  source: ChatResourceItem['source'],
  toolCallId: string | null = null,
): ChatResourceItem {
  const fileName = fileNameFromUrl(ref);
  const mimeType = mimeTypeFromPath(fileName);
  const kind = inferMediaKind(fileName, mimeType);
  return {
    id: `resource-${hashId(ref)}`,
    kind,
    url: ref,
    downloadUrl: ref,
    fileName,
    mimeType,
    source,
    status: 'ready',
    placement: 'append',
    toolCallId,
  };
}

function buildInlineImageResourceItem(
  dataUrl: string,
  mimeType: string,
  fileName: string | undefined,
  source: ChatResourceItem['source'],
  toolCallId: string | null = null,
): ChatResourceItem {
  const normalizedMimeType = normalizeMimeType(mimeType) || 'image/png';
  const resolvedName = fileName?.trim() || `image.${normalizedMimeType.split('/')[1] || 'png'}`;
  return {
    id: `resource-${hashId(`${normalizedMimeType}:${resolvedName}:${dataUrl.slice(0, 128)}`)}`,
    kind: 'image',
    url: dataUrl,
    downloadUrl: dataUrl,
    fileName: resolvedName,
    mimeType: normalizedMimeType,
    source,
    status: 'ready',
    placement: 'append',
    toolCallId,
  };
}

function buildInlineDataResourceItem(
  dataUrl: string,
  mimeType: string,
  fileName: string | undefined,
  kind: ChatAttachmentKind,
  source: ChatResourceItem['source'],
  toolCallId: string | null = null,
): ChatResourceItem {
  if (kind === 'image') {
    return {
      ...buildInlineImageResourceItem(dataUrl, mimeType, fileName, source, toolCallId),
      kind,
    };
  }
  const normalizedMimeType = normalizeMimeType(mimeType) || 'application/octet-stream';
  const resolvedName = fileName?.trim() || `${kind}.${normalizedMimeType.split('/')[1] || 'bin'}`;
  return {
    id: `resource-${hashId(`${normalizedMimeType}:${resolvedName}:${dataUrl.slice(0, 128)}`)}`,
    kind,
    url: dataUrl,
    downloadUrl: dataUrl,
    fileName: resolvedName,
    mimeType: normalizedMimeType,
    source,
    status: 'ready',
    placement: 'append',
    toolCallId,
  };
}

function resolveWorkspaceRelativePath(ctx: CollectResourceContext, filePath: string): string | undefined {
  const agentWorkspace = resolveAgentWorkspaceDir(ctx.config, deriveAgentIdFromSessionKey(ctx.sessionKey));
  try {
    const normalizedFile = path.resolve(filePath);
    const normalizedWorkspace = path.resolve(agentWorkspace);
    if (normalizedFile.startsWith(`${normalizedWorkspace}${path.sep}`)) {
      return toPortableRelativePath(path.relative(normalizedWorkspace, normalizedFile));
    }
  } catch {
    // Ignore path resolution errors.
  }
  return undefined;
}

function buildFilesDownloadUrl(rootId: string, relativePath: string, download: boolean): string {
  const query = new URLSearchParams({
    rootId,
    path: toPortableRelativePath(relativePath),
  });
  if (download) query.set('download', 'true');
  return `/api/files/download?${query.toString()}`;
}

function buildFilesApiResourceItem(
  rootId: string,
  relativePath: string,
  options: {
    source: ChatResourceItem['source'];
    originalPath?: string;
    id?: string;
    fileName?: string | null;
    mimeType?: string | null;
    kind?: ChatAttachmentKind | null;
    toolCallId?: string | null;
  },
): ChatResourceItem {
  const normalizedPath = toPortableRelativePath(relativePath);
  const fileName = options.fileName || path.basename(normalizedPath) || 'file';
  const mimeType = normalizeMimeType(options.mimeType) || mimeTypeFromPath(fileName);
  const kind = options.kind || inferMediaKind(fileName, mimeType);
  const resourceRef = buildTracevaneFilesResourceRef(rootId, normalizedPath) || `files:${rootId}:${normalizedPath}`;
  return {
    id: options.id || `resource-${hashId(resourceRef)}`,
    kind,
    url: buildFilesDownloadUrl(rootId, normalizedPath, false),
    downloadUrl: buildFilesDownloadUrl(rootId, normalizedPath, true),
    fileName,
    mimeType,
    relativePath: normalizedPath,
    originalPath: options.originalPath || resourceRef,
    source: options.source,
    status: 'ready',
    placement: 'append',
    toolCallId: options.toolCallId || null,
  };
}

function buildLocalResourceItem(
  ctx: CollectResourceContext,
  filePath: string,
  options: {
    source: ChatResourceItem['source'];
    relativePath?: string;
    originalPath?: string;
    toolCallId?: string | null;
  },
): ChatResourceItem {
  const mimeType = mimeTypeFromPath(filePath);
  const fileName = path.basename(filePath);
  const kind = inferMediaKind(fileName, mimeType);
  const token = ctx.signToken({
    v: 1,
    sessionKey: ctx.sessionKey,
    filePath,
    fileName,
    mimeType,
    kind,
  });
  const baseUrl = `/api/chat/sessions/${encodeURIComponent(ctx.sessionKey)}/media/${encodeURIComponent(token)}`;

  return {
    id: `resource-${hashId(`${ctx.sessionKey}:${filePath}`)}`,
    kind,
    url: baseUrl,
    downloadUrl: `${baseUrl}?download=1`,
    fileName,
    mimeType,
    relativePath: options.relativePath || resolveWorkspaceRelativePath(ctx, filePath),
    originalPath: options.originalPath,
    source: options.source,
    status: 'ready',
    placement: 'append',
    toolCallId: options.toolCallId || null,
  };
}

function buildMissingResourceItem(
  ctx: CollectResourceContext,
  refPath: string,
  options: {
    source: ChatResourceItem['source'];
    relativePath?: string;
    originalPath?: string;
    toolCallId?: string | null;
  },
): ChatResourceItem {
  const fileName = path.basename(refPath) || refPath;
  const mimeType = mimeTypeFromPath(refPath) || 'application/octet-stream';
  const kind = inferMediaKind(fileName, mimeType);

  return {
    id: `resource-missing-${hashId(`${ctx.sessionKey}:${refPath}`)}`,
    kind,
    url: '',
    downloadUrl: '',
    fileName,
    mimeType,
    relativePath: options.relativePath || refPath,
    originalPath: options.originalPath || refPath,
    source: options.source,
    status: 'missing',
    placement: 'append',
    toolCallId: options.toolCallId || null,
  };
}

function buildAssistantMarkdownResourceItem(
  ctx: CollectResourceContext,
  ref: string,
  parsedRef: TracevaneMarkdownMediaRef | null,
): ChatResourceItem | null {
  const localFilePath = resolveTracevaneMarkdownMediaFilePath(ctx.config, ctx.sessionKey, ref, parsedRef);
  if (localFilePath) {
    if (parsedRef?.kind === 'files') {
      return buildFilesApiResourceItem(parsedRef.rootId, parsedRef.path, {
        source: 'assistant_markdown',
        originalPath: ref,
      });
    }
    return buildLocalResourceItem(ctx, localFilePath, {
      source: 'assistant_markdown',
      relativePath: resolveWorkspaceRelativePath(ctx, localFilePath),
      originalPath: ref,
    });
  }

  const isExplicitTracevaneRef = Boolean(parsedRef);
  const isLegacyRelativeRef = !parsedRef && isTracevaneMarkdownExplicitLocalRef(ref);
  if (!isExplicitTracevaneRef && !isLegacyRelativeRef) {
    return null;
  }

  const refPath = parsedRef?.path || ref;
  return buildMissingResourceItem(ctx, refPath, {
    source: 'assistant_markdown',
    relativePath: parsedRef?.kind === 'workspace' || parsedRef?.kind === 'uploads'
      ? parsedRef.path
      : undefined,
    originalPath: ref,
  });
}

function maybeAddResourceRef(
  ref: string,
  ctx: CollectUnknownContext,
  options: {
    source: ChatResourceItem['source'];
    toolCallId?: string | null;
    allowRemoteWithoutMediaExtension?: boolean;
    relativePath?: string;
    originalPath?: string;
  },
): void {
  const dataImage = normalizeDataImageRef(ref);
  if (dataImage) {
    pushResourceItem(
      ctx.items,
      ctx.seenKeys,
      buildInlineImageResourceItem(dataImage.url, dataImage.mimeType, undefined, options.source, options.toolCallId || null),
    );
    return;
  }

  const remoteUrl = normalizeRemoteRef(ref);
  if (remoteUrl) {
    if (!options.allowRemoteWithoutMediaExtension && !looksLikeMediaUrl(remoteUrl)) {
      return;
    }
    pushResourceItem(
      ctx.items,
      ctx.seenKeys,
      buildRemoteResourceItem(remoteUrl, options.source, options.toolCallId || null),
    );
    return;
  }

  const parsedScopedRef = parseTracevaneMarkdownMediaRef(ref);
  if (parsedScopedRef?.kind === 'files' && isSafeScopedResourceRefPath(parsedScopedRef.path)) {
    const filePath = resolveFilesResourceFilePath(ctx.config, parsedScopedRef.rootId, parsedScopedRef.path);
    if (filePath) {
      pushResourceItem(
        ctx.items,
        ctx.seenKeys,
        buildFilesApiResourceItem(parsedScopedRef.rootId, parsedScopedRef.path, {
          source: options.source,
          originalPath: options.originalPath || ref,
          toolCallId: options.toolCallId || null,
        }),
      );
      return;
    }
  }

  const localFilePath = resolveLocalFilePath(ctx.config, ctx.sessionKey, ref);
  if (localFilePath) {
    pushResourceItem(
      ctx.items,
      ctx.seenKeys,
      buildLocalResourceItem(ctx, localFilePath, {
        source: options.source,
        relativePath: options.relativePath,
        originalPath: options.originalPath,
        toolCallId: options.toolCallId || null,
      }),
    );
    return;
  }

  const trimmedRef = ref.trim();
  if (trimmedRef && (
    path.isAbsolute(trimmedRef)
    || trimmedRef.startsWith('./')
    || trimmedRef.startsWith('../')
    || FILE_URL_RE.test(trimmedRef)
  )) {
    pushResourceItem(
      ctx.items,
      ctx.seenKeys,
      buildMissingResourceItem(ctx, trimmedRef, {
        source: options.source,
        relativePath: options.relativePath,
        originalPath: options.originalPath,
        toolCallId: options.toolCallId || null,
      }),
    );
  }
}

function maybeWalkJsonString(
  value: string,
  onParsed: (parsed: unknown) => void,
): void {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 50_000 || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
    return;
  }
  try {
    onParsed(JSON.parse(trimmed));
  } catch {
    // Ignore malformed JSON fragments.
  }
}

function collectStructuredArtifactRecord(
  value: unknown,
  ctx: CollectUnknownContext,
  toolCallId: string | null = null,
): void {
  if (!value || typeof value !== 'object') {
    return;
  }
  const record = value as Record<string, unknown>;

  if (Array.isArray(record.artifacts)) {
    for (const item of record.artifacts) {
      collectStructuredArtifactRecord(item, ctx, toolCallId);
    }
  }
  if (record.artifact && typeof record.artifact === 'object') {
    collectStructuredArtifactRecord(record.artifact, ctx, toolCallId);
  }

  collectExplicitMediaFields(record, ctx, {
    source: 'tool_artifact',
    toolCallId,
    allowRemoteWithoutMediaExtension: true,
  });
}

function extractInlineImageFromBlock(
  block: Record<string, unknown>,
  source: ChatResourceItem['source'],
  toolCallId: string | null = null,
): ChatResourceItem | null {
  const type = String(block.type || '').toLowerCase();
  if (type !== 'image') {
    return null;
  }

  const sourceBlock = block.source;
  if (!sourceBlock || typeof sourceBlock !== 'object') {
    return null;
  }

  const record = sourceBlock as Record<string, unknown>;
  if (String(record.type || '').toLowerCase() !== 'base64') {
    return null;
  }

  const mimeType = typeof record.media_type === 'string' ? record.media_type : 'image/png';
  if (typeof record.data !== 'string') {
    return null;
  }

  const dataValue = record.data.trim();
  const dataUrl = DATA_IMAGE_RE.test(dataValue)
    ? dataValue
    : `data:${mimeType};base64,${dataValue}`;

  const fileName = typeof block.fileName === 'string' ? block.fileName : undefined;
  return buildInlineImageResourceItem(dataUrl, mimeType, fileName, source, toolCallId);
}

function extractUrlFromImageBlock(block: Record<string, unknown>): string | null {
  const type = String(block.type || '').toLowerCase();
  if (type === 'image' && typeof block.url === 'string') {
    return block.url.trim() || null;
  }
  if (type === 'image_url' && block.image_url && typeof block.image_url === 'object') {
    const candidate = (block.image_url as Record<string, unknown>).url;
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
  }
  return null;
}

function looksLikeExplicitArtifactRecord(record: Record<string, unknown>): boolean {
  const kind = String(record.kind || record.type || '').toLowerCase();
  if (kind.includes('image') || kind.includes('file') || kind.includes('media') || kind.includes('artifact')) {
    return true;
  }
  return (
    typeof record.mediaUrl === 'string'
    || (Array.isArray(record.mediaUrls) && record.mediaUrls.length > 0)
    || Array.isArray(record.artifacts)
    || Boolean(record.artifact && typeof record.artifact === 'object')
  );
}

function collectExplicitMediaFields(
  record: Record<string, unknown>,
  ctx: CollectUnknownContext,
  options: {
    source: ChatResourceItem['source'];
    toolCallId?: string | null;
    allowRemoteWithoutMediaExtension?: boolean;
  },
): void {
  const mediaUrl = typeof record.mediaUrl === 'string' ? record.mediaUrl.trim() : '';
  if (mediaUrl) {
    maybeAddResourceRef(mediaUrl, ctx, {
      source: options.source,
      toolCallId: options.toolCallId || null,
      allowRemoteWithoutMediaExtension: options.allowRemoteWithoutMediaExtension,
    });
  }

  const mediaUrls = Array.isArray(record.mediaUrls) ? record.mediaUrls : [];
  for (const entry of mediaUrls) {
    if (typeof entry === 'string' && entry.trim()) {
      maybeAddResourceRef(entry, ctx, {
        source: options.source,
        toolCallId: options.toolCallId || null,
        allowRemoteWithoutMediaExtension: options.allowRemoteWithoutMediaExtension,
      });
    }
  }

  if (!looksLikeExplicitArtifactRecord(record)) {
    return;
  }

  for (const key of ['url', 'path', 'filePath', 'media']) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      maybeAddResourceRef(candidate, ctx, {
        source: options.source,
        toolCallId: options.toolCallId || null,
        allowRemoteWithoutMediaExtension: options.allowRemoteWithoutMediaExtension,
      });
    }
  }
}

function collectMessageResourcesFromUnknown(value: unknown, ctx: CollectUnknownContext): void {
  if (typeof value === 'string') {
    maybeWalkJsonString(value, (parsed) => collectMessageResourcesFromUnknown(parsed, ctx));
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectMessageResourcesFromUnknown(entry, ctx);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  const inlineImage = extractInlineImageFromBlock(record, 'structured_message');
  if (inlineImage) {
    pushResourceItem(ctx.items, ctx.seenKeys, inlineImage);
    return;
  }

  const blockUrl = extractUrlFromImageBlock(record);
  if (blockUrl) {
    maybeAddResourceRef(blockUrl, ctx, {
      source: 'structured_message',
      allowRemoteWithoutMediaExtension: true,
    });
  }

  collectExplicitMediaFields(record, ctx, {
    source: 'structured_message',
    allowRemoteWithoutMediaExtension: true,
  });

  for (const [key, nested] of Object.entries(record)) {
    if (key === 'data' && typeof nested === 'string' && DATA_IMAGE_RE.test(nested)) {
      continue;
    }
    collectMessageResourcesFromUnknown(nested, ctx);
  }
}

function collectToolArtifactsFromUnknown(
  value: unknown,
  ctx: CollectUnknownContext,
  toolCallId: string | null = null,
): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectToolArtifactsFromUnknown(entry, ctx, toolCallId);
    }
    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  const record = value as Record<string, unknown>;
  collectStructuredArtifactRecord(record, ctx, toolCallId);
}

function buildUserUploadResourceFromRef(
  ctx: CollectResourceContext,
  ref: string,
  index: number,
  resourceId?: string,
): ChatResourceItem {
  const normalizedRef = ref.trim();
  const filePath = resolveLocalFilePath(ctx.config, ctx.sessionKey, normalizedRef);
  const fileName = path.basename(normalizedRef) || `file-${index + 1}`;
  const mimeType = mimeTypeFromPath(fileName);
  const kind = inferMediaKind(fileName, mimeType);
  if (filePath) {
    const item = buildLocalResourceItem(ctx, filePath, {
      source: 'user_upload',
      relativePath: toPortableRelativePath(normalizedRef),
      originalPath: normalizedRef,
    });
    return resourceId ? { ...item, id: resourceId } : item;
  }
  const missing = buildMissingResourceItem(ctx, normalizedRef, {
    source: 'user_upload',
    relativePath: toPortableRelativePath(normalizedRef),
    originalPath: normalizedRef,
    toolCallId: null,
  });
  return resourceId ? { ...missing, id: resourceId } : missing;
}

function buildUserUploadResourceFromSendFileRef(
  ctx: CollectResourceContext,
  fileRef: ChatSendFileRef,
  index: number,
): ChatResourceItem {
  const parsedFilesRef = parseTracevaneFilesResourceRef(fileRef.resourceRef);
  if (parsedFilesRef) {
    const filePath = resolveFilesResourceFilePath(ctx.config, parsedFilesRef.rootId, parsedFilesRef.path);
    const fileName = fileRef.fileName || path.basename(parsedFilesRef.path) || `file-${index + 1}`;
    if (filePath) {
      return buildFilesApiResourceItem(parsedFilesRef.rootId, parsedFilesRef.path, {
        source: 'user_upload',
        originalPath: fileRef.resourceRef || parsedFilesRef.path,
        id: fileRef.id,
        fileName,
        mimeType: fileRef.mimeType,
        kind: fileRef.kind,
      });
    }
    const missing = buildMissingResourceItem(ctx, fileName, {
      source: 'user_upload',
      relativePath: parsedFilesRef.path,
      originalPath: fileRef.resourceRef || parsedFilesRef.path,
      toolCallId: null,
    });
    return fileRef.id ? { ...missing, id: fileRef.id } : missing;
  }
  return buildUserUploadResourceFromRef(ctx, fileRef.relativePath, index, fileRef.id);
}

function buildTracevaneDeliveryResourceItem(
  ctx: CollectResourceContext,
  resource: TracevaneDeliveryResource,
): ChatResourceItem | null {
  const fileName = resource.fileName?.trim() || resource.id;
  const mimeType = normalizeMimeType(resource.mimeType) || normalizeMimeType(resource.contentType) || mimeTypeFromPath(fileName);
  const kind = resource.kind || inferMediaKind(fileName, mimeType);
  const inlineBuffer = typeof resource.buffer === 'string' && resource.buffer.trim()
    ? resource.buffer.trim()
    : '';
  if (inlineBuffer) {
    const normalizedMime = mimeType || 'application/octet-stream';
    const dataUrl = inlineBuffer.startsWith('data:')
      ? inlineBuffer
      : `data:${normalizedMime};base64,${inlineBuffer.replace(/^data:[^;]+;base64,/i, '')}`;
    return {
      ...buildInlineDataResourceItem(dataUrl, normalizedMime, fileName, kind, 'tracevane_delivery'),
      id: resource.id,
      kind,
      fileName,
      mimeType: normalizedMime,
    };
  }

  const ref = (resource.filePath || resource.path || resource.media || '').trim();
  if (!ref) {
    return null;
  }

  const dataUrlRef = normalizeDataUrlRef(ref);
  if (dataUrlRef) {
    return {
      ...buildInlineDataResourceItem(dataUrlRef.url, mimeType || dataUrlRef.mimeType, fileName, kind, 'tracevane_delivery'),
      id: resource.id,
      kind,
      fileName,
      mimeType: mimeType || dataUrlRef.mimeType,
    };
  }

  const remoteUrl = normalizeRemoteRef(ref);
  if (remoteUrl) {
    return {
      ...buildRemoteResourceItem(remoteUrl, 'tracevane_delivery'),
      id: resource.id,
      kind,
      fileName,
      mimeType,
      originalPath: ref,
    };
  }

  const localFilePath = resolveLocalFilePath(ctx.config, ctx.sessionKey, ref);
  if (localFilePath) {
    return {
      ...buildLocalResourceItem(ctx, localFilePath, {
        source: 'tracevane_delivery',
        relativePath: resolveWorkspaceRelativePath(ctx, localFilePath),
        originalPath: ref,
      }),
      id: resource.id,
      kind,
      fileName,
      mimeType,
    };
  }

  return {
    ...buildMissingResourceItem(ctx, ref, {
      source: 'tracevane_delivery',
      originalPath: ref,
    }),
    id: resource.id,
    kind,
    fileName,
    mimeType,
  };
}

function buildAssistantMessageFromTracevaneDeliveryPayload(
  ctx: CollectResourceContext,
  payload: TracevaneDeliveryResult,
  meta: {
    id: string;
    createdAt: string | null;
    source: ChatMessageItem['source'];
    runId: string | null;
  },
): ChatMessageItem | null {
  const resources = payload.resources
    .map((resource) => buildTracevaneDeliveryResourceItem(ctx, resource))
    .filter((resource): resource is ChatResourceItem => Boolean(resource));
  const resourceMap = new Map(resources.map((resource) => [resource.id, resource] as const));
  const blocks: ChatMessageBlock[] = [];

  for (const block of payload.blocks) {
    if (block.type === 'text') {
      if (typeof block.text === 'string' && block.text.trim()) {
        blocks.push({
          type: 'text',
          text: block.text,
        });
      }
      continue;
    }

    if (block.type === 'paragraph') {
      const segments = block.segments
        .map((segment) => {
          if (segment.type === 'text') {
            return typeof segment.text === 'string' && segment.text
              ? {
                type: 'text',
                text: segment.text,
              }
              : null;
          }

          const resource = resourceMap.get(segment.resourceId);
          if (!resource) {
            return null;
          }

          if ((segment.display === 'inline-image' || segment.display === 'break-image') && resource.kind !== 'image') {
            return null;
          }
          if ((segment.display === 'inline-video' || segment.display === 'break-video') && resource.kind !== 'video') {
            return null;
          }

          return {
            type: 'resource',
            resourceId: segment.resourceId,
            display: segment.display,
          };
        })
        .filter((segment): segment is ChatInlineSegment => Boolean(segment));
      if (segments.length) {
        blocks.push({
          type: 'paragraph',
          segments,
        });
      }
      continue;
    }

    if (!resourceMap.has(block.resourceId)) {
      continue;
    }

    blocks.push({
      type: 'resource',
      resourceId: block.resourceId,
      ...(payload.version === 2 || ('display' in block && block.display === 'card') ? { display: 'card' as const } : {}),
    });
  }

  if (!blocks.length && !resources.length) {
    return null;
  }

  return {
    id: meta.id,
    role: 'assistant',
    text: summarizeTracevaneDeliveryText(payload),
    createdAt: meta.createdAt,
    source: meta.source,
    runId: meta.runId,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
    blocks,
    resources,
  };
}

function rehydrateStoredResourceItem(
  ctx: CollectResourceContext,
  item: ChatResourceItem,
): ChatResourceItem {
  const originalPath = item.originalPath?.trim() || item.relativePath?.trim() || '';
  const remoteUrl = normalizeRemoteRef(item.url || item.downloadUrl || '');
  const dataUrlRef = normalizeDataUrlRef(item.url || item.downloadUrl || '');

  if (remoteUrl) {
    return {
      ...item,
      url: remoteUrl,
      downloadUrl: item.downloadUrl || remoteUrl,
      status: 'ready',
    };
  }

  if (dataUrlRef) {
    return {
      ...buildInlineDataResourceItem(item.url || item.downloadUrl, item.mimeType || dataUrlRef.mimeType, item.fileName, item.kind, item.source, item.toolCallId || null),
      id: item.id,
      relativePath: item.relativePath,
      originalPath: item.originalPath,
      status: 'ready',
    };
  }

  if (item.source === 'user_upload' && item.relativePath) {
    const rebuilt = buildUserUploadResourceFromRef(ctx, item.relativePath, 0, item.id);
    return {
      ...rebuilt,
      fileName: item.fileName || rebuilt.fileName,
      mimeType: item.mimeType || rebuilt.mimeType,
      toolCallId: item.toolCallId || null,
    };
  }

  if (originalPath) {
    const localFilePath = resolveLocalFilePath(ctx.config, ctx.sessionKey, originalPath);
    if (localFilePath) {
      return {
        ...buildLocalResourceItem(ctx, localFilePath, {
          source: item.source,
          relativePath: item.relativePath || resolveWorkspaceRelativePath(ctx, localFilePath),
          originalPath: item.originalPath || originalPath,
          toolCallId: item.toolCallId || null,
        }),
        id: item.id,
        kind: item.kind,
        fileName: item.fileName || path.basename(localFilePath),
        mimeType: item.mimeType || mimeTypeFromPath(localFilePath),
      };
    }
    return {
      ...buildMissingResourceItem(ctx, originalPath, {
        source: item.source,
        relativePath: item.relativePath,
        originalPath: item.originalPath || originalPath,
        toolCallId: item.toolCallId || null,
      }),
      id: item.id,
      kind: item.kind,
      fileName: item.fileName || path.basename(originalPath),
      mimeType: item.mimeType || mimeTypeFromPath(originalPath),
    };
  }

  return { ...item };
}

export { buildContentDisposition };

export function createTracevaneChatMediaBridge(config: TracevaneServerConfig) {
  const secret = resolveMediaTokenSecret(config);
  const legacyTokenFallbackEnabled = process.env.TRACEVANE_MEDIA_TOKEN_LEGACY !== '0';

  function signToken(payload: MediaTokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  function parseTokenPayload(sessionKey: string, encoded: string): MediaTokenPayload | null {
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as Partial<MediaTokenPayload>;
      if (payload.v !== 1 || payload.sessionKey !== sessionKey) {
        return null;
      }
      const filePath = typeof payload.filePath === 'string' ? payload.filePath.trim() : '';
      if (!filePath) {
        return null;
      }
      const fileName = typeof payload.fileName === 'string' && payload.fileName.trim()
        ? payload.fileName.trim()
        : path.basename(filePath);
      const kind = payload.kind === 'image' || payload.kind === 'video' || payload.kind === 'file'
        ? payload.kind
        : inferMediaKind(fileName, normalizeMimeType(typeof payload.mimeType === 'string' ? payload.mimeType : null));
      return {
        v: 1,
        sessionKey,
        filePath,
        fileName,
        mimeType: normalizeMimeType(typeof payload.mimeType === 'string' ? payload.mimeType : null),
        kind,
      };
    } catch {
      return null;
    }
  }

  function verifyToken(sessionKey: string, token: string): VerifiedMediaToken | null {
    const [encoded, signature] = token.split('.', 2);
    if (!encoded || !signature) {
      return null;
    }

    const payload = parseTokenPayload(sessionKey, encoded);
    if (!payload) {
      return null;
    }

    const expected = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
    const providedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (providedBuffer.length !== expectedBuffer.length) {
      if (legacyTokenFallbackEnabled) {
        return { payload, verified: false };
      }
      return null;
    }
    if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      if (legacyTokenFallbackEnabled) {
        return { payload, verified: false };
      }
      return null;
    }
    return { payload, verified: true };
  }

  return {
    shouldAttemptAssistantMarkdownStreamPreview(markdown: string): boolean {
      const normalized = typeof markdown === 'string' ? markdown : '';
      const hasLocalRef = normalized.includes('workspace:')
        || normalized.includes('uploads:')
        || normalized.includes('files:')
        || normalized.includes('tracevane-file:');
      if (!hasLocalRef) {
        return false;
      }
      return normalized.includes('tracevane:')
        || /<(?:img|video|source|a)\b/i.test(normalized);
    },

    compileAssistantMarkdown(
      sessionKey: string,
      markdown: string,
    ): CompileAssistantMarkdownMediaResult | null {
      const ctx = {
        sessionKey,
        config,
        signToken,
      };
      const compiled = compileAssistantMarkdownMedia({
        markdown,
        resolveResource(ref, parsedRef) {
          return buildAssistantMarkdownResourceItem(ctx, ref, parsedRef);
        },
        rewriteHref(resource) {
          if (resource.status === 'missing') {
            return resource.originalPath || resource.relativePath || resource.fileName;
          }
          return appendTracevaneMarkdownMediaMeta(resource.url, {
            kind: resource.kind,
            fileName: resource.fileName,
          });
        },
      });
      return compiled.changed ? compiled : null;
    },

    buildAssistantMarkdownMessage(
      sessionKey: string,
      markdown: string,
      meta: {
        id: string;
        createdAt: string | null;
        source: ChatMessageItem['source'];
        runId: string | null;
        stopReason?: string | null;
        aborted?: boolean;
      },
    ): ChatMessageItem | null {
      const compiled = this.compileAssistantMarkdown(sessionKey, markdown);
      if (!compiled) {
        return null;
      }
      return {
        id: meta.id,
        role: 'assistant',
        text: markdown,
        createdAt: meta.createdAt,
        source: meta.source,
        runId: meta.runId,
        truncated: false,
        omitted: false,
        aborted: meta.aborted === true,
        stopReason: meta.stopReason || null,
        blocks: [
          {
            type: 'text',
            text: compiled.markdown,
          },
        ],
        resources: compiled.resources,
      };
    },

    extractTracevaneDelivery(raw: unknown): TracevaneDeliveryResult | null {
      if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) {
          return null;
        }
        try {
          return this.extractTracevaneDelivery(JSON.parse(trimmed));
        } catch {
          return null;
        }
      }
      if (raw && typeof raw === 'object') {
        const direct = extractTracevaneDeliveryPayload(raw);
        if (direct) {
          return direct;
        }
        const record = raw as Record<string, unknown>;
        if (record.details && typeof record.details === 'object') {
          const fromDetails = extractTracevaneDeliveryPayload(record.details);
          if (fromDetails) {
            return fromDetails;
          }
        }
        if (record.message && typeof record.message === 'object') {
          const fromMessage = this.extractTracevaneDelivery(record.message);
          if (fromMessage) {
            return fromMessage;
          }
        }
        if (Array.isArray(record.content)) {
          for (const item of record.content) {
            if (!item || typeof item !== 'object') {
              continue;
            }
            const contentItem = item as Record<string, unknown>;
            const fromContent =
              this.extractTracevaneDelivery(contentItem)
              || this.extractTracevaneDelivery(contentItem.text)
              || this.extractTracevaneDelivery(contentItem.content);
            if (fromContent) {
              return fromContent;
            }
          }
        }
      }
      return null;
    },

    buildAssistantMessageFromTracevaneDelivery(
      sessionKey: string,
      payload: TracevaneDeliveryResult,
      meta: {
        id: string;
        createdAt: string | null;
        source: ChatMessageItem['source'];
        runId: string | null;
      },
    ): ChatMessageItem | null {
      return buildAssistantMessageFromTracevaneDeliveryPayload({
        sessionKey,
        config,
        signToken,
      }, payload, meta);
    },

    collectMessageResources(sessionKey: string, raw: unknown): ChatResourceItem[] {
      const items: ChatResourceItem[] = [];
      const seenKeys = new Set<string>();
      collectMessageResourcesFromUnknown(raw, {
        sessionKey,
        config,
        signToken,
        seenKeys,
        items,
      });
      return items;
    },

    collectToolArtifacts(sessionKey: string, raw: unknown, toolCallId: string | null = null): ChatToolArtifactItem[] {
      const items: ChatResourceItem[] = [];
      const seenKeys = new Set<string>();
      collectToolArtifactsFromUnknown(raw, {
        sessionKey,
        config,
        signToken,
        seenKeys,
        items,
      }, toolCallId);
      return items.map((item) => ({
        ...item,
        toolCallId,
      }));
    },

    normalizeSendFileRefs(fileRefs: ChatSendFileRef[] | undefined): ChatSendFileRef[] {
      return (
        fileRefs
          ?.map((fileRef, index) => {
            const relativePath = typeof fileRef.relativePath === 'string'
              ? toPortableRelativePath(fileRef.relativePath.trim())
              : '';
            if (!relativePath) {
              return null;
            }
            const incomingResourceRef = typeof fileRef.resourceRef === 'string' ? fileRef.resourceRef.trim() : '';
            const parsedFilesRef = parseTracevaneFilesResourceRef(incomingResourceRef);
            const rootId = parsedFilesRef?.rootId || (typeof fileRef.rootId === 'string' ? fileRef.rootId.trim() : null);
            const normalizedRelativePath = parsedFilesRef?.path || relativePath;
            const fileName = typeof fileRef.fileName === 'string' && fileRef.fileName.trim()
              ? fileRef.fileName.trim()
              : path.basename(normalizedRelativePath);
            const mimeType = normalizeMimeType(fileRef.mimeType) || mimeTypeFromPath(fileName);
            const kind = inferMediaKind(fileName, mimeType);
            const resourceRef = parsedFilesRef
              ? incomingResourceRef
              : rootId
                ? buildTracevaneFilesResourceRef(rootId, normalizedRelativePath)
                : buildTracevaneResourceRefFromRelativePath(normalizedRelativePath);
            const item: ChatSendFileRef = {
              id: typeof fileRef.id === 'string' && fileRef.id.trim()
                ? fileRef.id.trim()
                : `file-ref-${index + 1}`,
              rootId,
              relativePath: normalizedRelativePath,
              fileName,
              mimeType,
              kind,
            };
            if (resourceRef) {
              item.resourceRef = resourceRef;
            }
            return item;
          })
          .filter((item): item is ChatSendFileRef => Boolean(item)) ?? []
      );
    },

    buildUserUploadResource(sessionKey: string, relativePath: string, resourceId?: string): ChatResourceItem {
      const ctx = { sessionKey, config, signToken };
      return buildUserUploadResourceFromRef(ctx, relativePath, 0, resourceId);
    },

    resolveResourceRef(sessionKey: string, ref: string): {
      resourceRef: string | null;
      aiReadable: boolean;
      resource: ChatResourceItem | null;
    } {
      const normalizedRef = typeof ref === 'string' ? ref.trim() : '';
      if (!normalizedRef) {
        return {
          resourceRef: null,
          aiReadable: false,
          resource: null,
        };
      }

      const parsedRef = parseTracevaneMarkdownMediaRef(normalizedRef);
      const isLegacyRelativeRef = !parsedRef && isTracevaneMarkdownExplicitLocalRef(normalizedRef);
      const unsafeScopedRef = Boolean(
        parsedRef
        && (parsedRef.kind === 'workspace' || parsedRef.kind === 'uploads' || parsedRef.kind === 'files')
        && !isSafeScopedResourceRefPath(parsedRef.path),
      );
      if (unsafeScopedRef) {
        return {
          resourceRef: null,
          aiReadable: false,
          resource: null,
        };
      }
      if (!parsedRef && !isLegacyRelativeRef) {
        return {
          resourceRef: null,
          aiReadable: false,
          resource: null,
        };
      }

      const ctx = { sessionKey, config, signToken };
      const refPath = parsedRef?.path || normalizedRef;
      const localFilePath = resolveTracevaneMarkdownMediaFilePath(config, sessionKey, normalizedRef, parsedRef);
      const resourceRef = parsedRef
        ? parsedRef.kind === 'files'
          ? buildTracevaneFilesResourceRef(parsedRef.rootId, parsedRef.path)
          : `${parsedRef.kind}:${parsedRef.path}`
        : buildTracevaneResourceRefFromRelativePath(normalizedRef);
      const relativePath = parsedRef?.kind === 'workspace'
        ? parsedRef.path
        : parsedRef?.kind === 'uploads'
          ? `uploads/${parsedRef.path}`
          : parsedRef?.kind === 'files'
            ? parsedRef.path
          : undefined;

      const resource = localFilePath
        ? parsedRef?.kind === 'files'
          ? buildFilesApiResourceItem(parsedRef.rootId, parsedRef.path, {
            source: 'tracevane_resource',
            originalPath: normalizedRef,
          })
          : buildLocalResourceItem(ctx, localFilePath, {
            source: 'tracevane_resource',
            relativePath: resolveWorkspaceRelativePath(ctx, localFilePath) || relativePath,
            originalPath: normalizedRef,
          })
        : buildMissingResourceItem(ctx, refPath, {
          source: 'tracevane_resource',
          relativePath,
          originalPath: normalizedRef,
        });

      return {
        resourceRef: resourceRef || normalizedRef,
        aiReadable: resource.status === 'ready' && Boolean(resource.relativePath),
        resource,
      };
    },

    buildSendResources(
      sessionKey: string,
      fileRefs: ChatSendFileRef[] | undefined,
      attachments: ChatSendAttachment[] | undefined,
    ): ChatResourceItem[] {
      const items: ChatResourceItem[] = [];
      const seenKeys = new Set<string>();
      const ctx = { sessionKey, config, signToken };
      const normalizedFileRefs = this.normalizeSendFileRefs(fileRefs);

      for (let index = 0; index < normalizedFileRefs.length; index += 1) {
        const fileRef = normalizedFileRefs[index];
        pushResourceItem(items, seenKeys, buildUserUploadResourceFromSendFileRef(ctx, fileRef, index));
      }

      const fileRefPaths = new Set(normalizedFileRefs.map((item) => item.relativePath));
      for (const attachment of attachments || []) {
        const mimeType = normalizeMimeType(attachment.mimeType) || 'application/octet-stream';
        const fileName = attachment.fileName?.trim() || `file-${items.length + 1}`;
        const kind = inferMediaKind(fileName, mimeType);
        const relativePath = normalizedFileRefs.find((item) => item.fileName === fileName)?.relativePath;
        if (relativePath && fileRefPaths.has(relativePath)) {
          continue;
        }
        if (!attachment.content) {
          continue;
        }
        const dataUrl = DATA_IMAGE_RE.test(attachment.content)
          ? attachment.content
          : `data:${mimeType};base64,${attachment.content}`;
        pushResourceItem(
          items,
          seenKeys,
          {
            ...buildInlineImageResourceItem(dataUrl, mimeType, fileName, 'user_upload'),
            kind,
            fileName,
            mimeType,
          },
        );
      }

      return items;
    },

    buildNativeInboundAttachments(
      sessionKey: string,
      fileRefs: ChatSendFileRef[] | undefined,
      attachments: ChatSendAttachment[] | undefined,
    ): ChannelConnectorInboundAttachment[] {
      const items: ChannelConnectorInboundAttachment[] = [];
      const seenLocalPaths = new Set<string>();
      const normalizedFileRefs = this.normalizeSendFileRefs(fileRefs);

      for (const fileRef of normalizedFileRefs) {
        const parsedFilesRef = parseTracevaneFilesResourceRef(fileRef.resourceRef);
        const localPath = parsedFilesRef
          ? resolveFilesResourceFilePath(config, parsedFilesRef.rootId, parsedFilesRef.path)
          : resolveLocalFilePath(config, sessionKey, fileRef.relativePath);
        if (!localPath || seenLocalPaths.has(localPath)) {
          continue;
        }
        seenLocalPaths.add(localPath);
        const stat = safeStatSync(localPath);
        items.push({
          kind: fileRef.kind === 'image' || fileRef.kind === 'video' ? fileRef.kind : 'file',
          platform: 'octo',
          key: fileRef.id,
          fileName: fileRef.fileName || path.basename(localPath),
          mimeType: fileRef.mimeType || mimeTypeFromPath(localPath),
          size: stat?.size ?? null,
          localPath,
          stagedAt: new Date().toISOString(),
        });
      }

      for (let index = 0; index < (attachments || []).length; index += 1) {
        const attachment = (attachments || [])[index];
        const mimeType = normalizeMimeType(attachment.mimeType) || 'application/octet-stream';
        const fileName = attachment.fileName?.trim() || `inline-${index + 1}`;
        const kind = inferMediaKind(fileName, mimeType);
        items.push({
          kind: kind === 'image' || kind === 'video' ? kind : 'file',
          platform: 'octo',
          key: `inline-${index + 1}`,
          fileName,
          mimeType,
          size: attachment.content ? Buffer.byteLength(attachment.content, 'base64') : null,
          localPath: null,
          stagingError: 'Inline base64 Chat attachments are shown as message resources; attach uploaded/workspace files to provide a local path to native CLI agents.',
        });
      }

      return items;
    },

    buildInlineAttachmentResourceItem(attachment: ChatSendAttachment): ChatResourceItem {
      const mimeType = normalizeMimeType(attachment.mimeType) || 'application/octet-stream';
      const kind = inferMediaKind(attachment.fileName || '', mimeType);
      const dataUrl = DATA_IMAGE_RE.test(attachment.content)
        ? attachment.content
        : `data:${mimeType};base64,${attachment.content}`;

      const resolvedName = attachment.fileName?.trim() || `${kind}.${mimeType.split('/')[1] || 'bin'}`;
      return {
        ...buildInlineImageResourceItem(dataUrl, mimeType, resolvedName, 'user_upload'),
        kind,
        fileName: resolvedName,
        mimeType,
      };
    },

    rehydrateResources(sessionKey: string, resources: ChatResourceItem[] | undefined): ChatResourceItem[] | undefined {
      if (!resources?.length) {
        return undefined;
      }
      const items: ChatResourceItem[] = [];
      const seenKeys = new Set<string>();
      const ctx = { sessionKey, config, signToken };
      for (const item of resources) {
        pushResourceItem(items, seenKeys, rehydrateStoredResourceItem(ctx, item));
      }
      return items.length ? items : undefined;
    },

    rehydrateToolCalls(sessionKey: string, toolCalls: ChatMessageToolCallItem[] | undefined): ChatMessageToolCallItem[] | undefined {
      if (!toolCalls?.length) {
        return undefined;
      }
      const rehydrated = toolCalls.map((tool) => ({
        ...tool,
        artifacts: this.rehydrateResources(sessionKey, tool.artifacts) as ChatToolArtifactItem[] | undefined,
      }));
      return rehydrated.length ? rehydrated : undefined;
    },

    normalizeSendAttachments(attachments: ChatSendAttachment[] | undefined): ChatSendAttachment[] {
      return (
        attachments
          ?.map((attachment) => {
            const mime = normalizeMimeType(attachment.mimeType) || 'application/octet-stream';
            const kind = inferMediaKind(attachment.fileName || '', mime);
            return {
              type: kind,
              mimeType: mime,
              fileName: typeof attachment.fileName === 'string' && attachment.fileName.trim()
                ? attachment.fileName.trim()
                : undefined,
              content: typeof attachment.content === 'string'
                ? attachment.content.trim().replace(/^data:[^;]+;base64,/i, '')
                : '',
            };
          })
          .filter((attachment) => attachment.content) ?? []
      );
    },

    resolveMedia(sessionKey: string, token: string): ResolvedChatMedia | null {
      const verified = verifyToken(sessionKey, token);
      if (!verified) {
        return null;
      }
      const payload = verified.payload;

      const normalizedPath = tryRealPathSync(payload.filePath);
      const stat = safeStatSync(normalizedPath);
      if (!stat?.isFile()) {
        return null;
      }
      if (!isWithinAllowedRoots(normalizedPath, allowedMediaRoots(config, sessionKey))) {
        return null;
      }

      return {
        absolutePath: normalizedPath,
        fileName: payload.fileName || path.basename(normalizedPath),
        mimeType: normalizeMimeType(payload.mimeType) || mimeTypeFromPath(normalizedPath) || 'application/octet-stream',
        kind: payload.kind,
        size: stat.size,
      };
    },

  };
}
