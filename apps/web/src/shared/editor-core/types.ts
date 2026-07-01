import type { FilesMutationResponse, FilesReadPayload } from "../../../../../types/files";

export type EditorDocumentId = string;

export interface EditorFileRef {
  rootId: string;
  path: string;
}

export type EditorSaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export interface EditorDocumentMetadata {
  name: string;
  language: string;
  readonly: boolean;
  textLike: boolean;
  truncated: boolean;
  size: number;
  modifiedAt: string | null;
  mimeType: string;
  permissions: string;
}

export interface EditorDocumentSnapshot {
  id: EditorDocumentId;
  ref: EditorFileRef;
  content: string;
  metadata: EditorDocumentMetadata;
  readAt: string;
}

export interface EditorDirtyState {
  saveState: EditorSaveState;
  dirty: boolean;
  lastSavedContent: string;
  lastSavedModifiedAt: string | null;
  error: string | null;
}

export interface EditorTabState {
  id: EditorDocumentId;
  ref: EditorFileRef;
  title: string;
  language: string;
  readonly: boolean;
  dirty: boolean;
  saveState: EditorSaveState;
  viewState?: unknown;
}

export interface EditorReadResult {
  snapshot: EditorDocumentSnapshot;
  raw: FilesReadPayload;
}

export interface EditorSaveRequest extends EditorFileRef {
  content: string;
}

export interface EditorSaveResult {
  ref: EditorFileRef;
  response: FilesMutationResponse;
  savedAt: string;
}
