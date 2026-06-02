import type {
  ChatAttachmentKind,
  ChatComposerDocument,
  ChatComposerNode,
} from '../types/chat.js';
import {
  hasComposerDocumentContent,
  normalizeComposerDocument,
} from './composer-model.js';
import {
  deriveComposerAttachmentUploadState,
  type ChatComposerAttachmentLike,
} from './chat-composer.js';

export interface ChatComposerPersistedDraftAttachment {
  id: string;
  type: ChatAttachmentKind;
  fileName?: string;
  mimeType: string;
  dataUrl: string;
  downloadUrl?: string | null;
  size?: number;
  relativePath: string;
  uploadState: 'ready';
}

export interface ChatComposerPersistedDraft {
  version: 1;
  updatedAt: string;
  document: ChatComposerDocument;
  attachments: ChatComposerPersistedDraftAttachment[];
}

interface ComposerDraftAttachmentLike extends ChatComposerAttachmentLike {
  size?: number;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isAttachmentKind(value: string): value is ChatAttachmentKind {
  return value === 'image' || value === 'video' || value === 'file';
}

function normalizeDraftAttachment(
  attachment: ComposerDraftAttachmentLike,
): ChatComposerPersistedDraftAttachment | null {
  const id = normalizeString(attachment.id);
  const relativePath = normalizeString(attachment.relativePath);
  const dataUrl = normalizeString(attachment.dataUrl);
  const mimeType = normalizeString(attachment.mimeType) || 'application/octet-stream';
  if (!id || !relativePath || !dataUrl) {
    return null;
  }
  if (deriveComposerAttachmentUploadState(attachment) !== 'ready') {
    return null;
  }
  if (dataUrl.startsWith('data:')) {
    return null;
  }

  const next: ChatComposerPersistedDraftAttachment = {
    id,
    type: attachment.type,
    mimeType,
    dataUrl,
    relativePath,
    uploadState: 'ready',
  };
  const fileName = normalizeString(attachment.fileName);
  if (fileName) {
    next.fileName = fileName;
  }
  const downloadUrl = normalizeString(attachment.downloadUrl);
  if (downloadUrl) {
    next.downloadUrl = downloadUrl;
  }
  if (typeof attachment.size === 'number' && Number.isFinite(attachment.size) && attachment.size > 0) {
    next.size = attachment.size;
  }
  return next;
}

function filterDocumentToAttachments(
  document: ChatComposerDocument | undefined | null,
  attachmentIds: Set<string>,
): ChatComposerDocument {
  const nodes = normalizeComposerDocument(document, { editorSurface: true })
    .filter((node): node is ChatComposerNode => (
      node.type === 'text' || attachmentIds.has(node.attachmentId)
    ));
  return normalizeComposerDocument(nodes, { editorSurface: true });
}

export function buildPersistableComposerDraft(input: {
  document: ChatComposerDocument | undefined | null;
  attachments: ComposerDraftAttachmentLike[];
  updatedAt?: string;
}): ChatComposerPersistedDraft | null {
  const attachments = input.attachments
    .map((attachment) => normalizeDraftAttachment(attachment))
    .filter((attachment): attachment is ChatComposerPersistedDraftAttachment => Boolean(attachment));
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const document = filterDocumentToAttachments(input.document, attachmentIds);
  if (!hasComposerDocumentContent(document) && attachments.length === 0) {
    return null;
  }
  return {
    version: 1,
    updatedAt: normalizeString(input.updatedAt) || new Date().toISOString(),
    document,
    attachments,
  };
}

function parseDraftAttachment(value: unknown): ChatComposerPersistedDraftAttachment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = normalizeString(record.id);
  const type = normalizeString(record.type);
  const mimeType = normalizeString(record.mimeType) || 'application/octet-stream';
  const dataUrl = normalizeString(record.dataUrl);
  const relativePath = normalizeString(record.relativePath);
  if (!id || !isAttachmentKind(type) || !dataUrl || !relativePath) {
    return null;
  }
  const next: ChatComposerPersistedDraftAttachment = {
    id,
    type,
    mimeType,
    dataUrl,
    relativePath,
    uploadState: 'ready',
  };
  const fileName = normalizeString(record.fileName);
  if (fileName) {
    next.fileName = fileName;
  }
  const downloadUrl = normalizeString(record.downloadUrl);
  if (downloadUrl) {
    next.downloadUrl = downloadUrl;
  }
  if (typeof record.size === 'number' && Number.isFinite(record.size) && record.size > 0) {
    next.size = record.size;
  }
  return next;
}

export function parsePersistedComposerDraft(value: unknown): ChatComposerPersistedDraft | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== 1) {
    return null;
  }
  const attachments = Array.isArray(record.attachments)
    ? record.attachments
      .map((attachment) => parseDraftAttachment(attachment))
      .filter((attachment): attachment is ChatComposerPersistedDraftAttachment => Boolean(attachment))
    : [];
  const attachmentIds = new Set(attachments.map((attachment) => attachment.id));
  const document = filterDocumentToAttachments(
    Array.isArray(record.document) ? record.document as ChatComposerDocument : null,
    attachmentIds,
  );
  if (!hasComposerDocumentContent(document) && attachments.length === 0) {
    return null;
  }
  return {
    version: 1,
    updatedAt: normalizeString(record.updatedAt) || new Date().toISOString(),
    document,
    attachments,
  };
}
