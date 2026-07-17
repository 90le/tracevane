/**
 * File manager feature types.
 *
 * File Manager owns browsing, selection and file lifecycle operations.
 * Wire contracts are reused from the repo-level `types/*.ts`; we re-export the
 * pieces the file-manager surfaces need.
 */

// --- Files (roots / directory listing / file content / search) -------------
export type {
  FileRootSummary,
  FileEntrySummary,
  FileEntryKind,
  FileBreadcrumb,
  FileSearchResult,
  FilesSummaryPayload,
  FilesDirectoryPayload,
  FilesMutationResponse,
  FilesReadPayload,
  FilesSearchPayload,
  FilesUploadItemPayload,
  FilesUploadConflictPolicy,
} from "../../../../../../types/files";
