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
