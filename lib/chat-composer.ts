import type { ChatAttachmentKind, ChatResourceItem } from '../types/chat.js';

export type ChatComposerUploadState = 'uploading' | 'ready' | 'failed';

export interface ChatComposerAttachmentLike {
  id: string;
  type: ChatAttachmentKind;
  fileName?: string;
  mimeType: string;
  dataUrl: string;
  downloadUrl?: string | null;
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
      fileName: attachment.fileName || `file-${attachment.id}`,
      mimeType: attachment.mimeType || null,
      relativePath: attachment.relativePath || undefined,
      originalPath: attachment.relativePath || undefined,
      source: 'user_upload',
      status: 'ready',
      placement: 'append',
    }));
}
