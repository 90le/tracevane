import type {
  ChatAttachmentKind,
  ChatComposerDocument,
  ChatMessageBlock,
  ChatResourceItem,
  ChatSendFileRef,
  ChatSendRequest,
} from '../types/chat.js';
import {
  buildComposerFileRefs,
  buildComposerMessageBlocks,
  normalizeComposerDocument,
  serializeComposerDocumentToMarkdown,
} from './composer-model.js';

export type ChatComposerUploadState = 'uploading' | 'ready' | 'failed';

export interface ChatComposerAttachmentLike {
  id: string;
  type: ChatAttachmentKind;
  fileName?: string;
  mimeType: string;
  content?: string | null;
  dataUrl: string;
  downloadUrl?: string | null;
  resourceRef?: string | null;
  relativePath?: string | null;
  uploadState?: ChatComposerUploadState;
}

export interface ChatComposerAttachmentUploadSummary {
  total: number;
  ready: number;
  uploading: number;
  failed: number;
  allReady: boolean;
  hasBlocking: boolean;
}

export interface ChatComposerSendPlan {
  document: ChatComposerDocument;
  text: string;
  previewText: string;
  blocks: ChatMessageBlock[];
  fileRefs: ChatSendFileRef[];
  resources: ChatResourceItem[] | undefined;
  inlineAttachments: NonNullable<ChatSendRequest['attachments']>;
  payload: ChatSendRequest;
}

export function deriveComposerAttachmentUploadState(
  attachment: Pick<ChatComposerAttachmentLike, 'uploadState' | 'relativePath'>,
): ChatComposerUploadState {
  if (attachment.uploadState === 'ready') {
    return attachment.relativePath ? 'ready' : 'failed';
  }
  if (attachment.uploadState === 'failed') {
    return 'failed';
  }
  return 'uploading';
}

export function areComposerAttachmentsReady(
  attachments: Array<Pick<ChatComposerAttachmentLike, 'uploadState' | 'relativePath'>>,
): boolean {
  return attachments.every((attachment) => deriveComposerAttachmentUploadState(attachment) === 'ready');
}

export function summarizeComposerAttachmentUploadStates(
  attachments: Array<Pick<ChatComposerAttachmentLike, 'uploadState' | 'relativePath'>>,
): ChatComposerAttachmentUploadSummary {
  let ready = 0;
  let uploading = 0;
  let failed = 0;

  for (const attachment of attachments) {
    const state = deriveComposerAttachmentUploadState(attachment);
    if (state === 'ready') {
      ready += 1;
    } else if (state === 'failed') {
      failed += 1;
    } else {
      uploading += 1;
    }
  }

  const total = attachments.length;
  const allReady = uploading === 0 && failed === 0;
  return {
    total,
    ready,
    uploading,
    failed,
    allReady,
    hasBlocking: !allReady,
  };
}

export function canSendComposerDraft(input: {
  canSend: boolean;
  hasContent: boolean;
  attachments: Array<Pick<ChatComposerAttachmentLike, 'uploadState' | 'relativePath'>>;
}): boolean {
  if (!input.canSend) {
    return false;
  }
  if (!input.hasContent && input.attachments.length === 0) {
    return false;
  }
  return summarizeComposerAttachmentUploadStates(input.attachments).allReady;
}

export async function runLimitedComposerUploadQueue<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void> | void,
): Promise<void> {
  if (!items.length) {
    return;
  }

  const workerCount = Math.max(1, Math.min(items.length, Math.floor(limit) || 1));
  let nextIndex = 0;

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex] as T, currentIndex);
    }
  }));
}

export function buildOptimisticResourcesFromComposerAttachments(
  attachments: ChatComposerAttachmentLike[],
): ChatResourceItem[] {
  return attachments
    .filter((attachment) => deriveComposerAttachmentUploadState(attachment) === 'ready')
    .map((attachment) => ({
      id: attachment.id,
      kind: attachment.type,
      url: attachment.dataUrl,
      downloadUrl: attachment.downloadUrl || attachment.dataUrl,
      resourceRef: attachment.resourceRef || attachment.relativePath || attachment.downloadUrl || attachment.dataUrl || null,
      fileName: attachment.fileName || `file-${attachment.id}`,
      mimeType: attachment.mimeType || null,
      relativePath: attachment.relativePath || undefined,
      originalPath: attachment.relativePath || undefined,
      source: 'user_upload',
      status: 'ready',
      placement: 'append',
    }));
}

export function buildComposerSendPlan(input: {
  document: ChatComposerDocument | undefined | null;
  attachments: ChatComposerAttachmentLike[];
  clientRequestId: string;
  flushWhenIdle?: boolean;
  normalizedDocument?: boolean;
}): ChatComposerSendPlan {
  const document = input.normalizedDocument
    ? (input.document || [])
    : normalizeComposerDocument(input.document);
  const attachments = input.attachments.slice();
  const text = serializeComposerDocumentToMarkdown(document, attachments, { normalizedDocument: true });
  const blocks = buildComposerMessageBlocks(document, attachments, { normalizedDocument: true });
  const fileRefs = buildComposerFileRefs(attachments);
  const resources = attachments.length
    ? buildOptimisticResourcesFromComposerAttachments(attachments)
    : undefined;
  const inlineAttachments = attachments
    .filter((attachment) => (
      attachment.type === 'image'
      && !attachment.relativePath
      && typeof attachment.content === 'string'
      && attachment.content.length > 0
    ))
    .map((attachment) => ({
      type: attachment.type,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
      content: attachment.content as string,
    }));

  const payload: ChatSendRequest = {
    text,
    clientRequestId: input.clientRequestId,
    composerDocument: document,
    fileRefs,
  };
  if (input.flushWhenIdle === true) {
    payload.flushWhenIdle = true;
  }
  if (inlineAttachments.length) {
    payload.attachments = inlineAttachments;
  }

  return {
    document,
    text,
    previewText: extractNormalizedComposerPlainText(document).trim(),
    blocks,
    fileRefs,
    resources,
    inlineAttachments,
    payload,
  };
}

function extractNormalizedComposerPlainText(document: ChatComposerDocument): string {
  let result = '';
  for (const node of document) {
    if (node.type === 'text') {
      result += node.text;
    }
  }
  return result;
}
