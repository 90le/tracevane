/**
 * Workspace files feature types.
 *
 * Workspace files owns browsing, selection, preview metadata and file lifecycle
 * view-model types. Evidence/artifact views should depend on their own owner
 * types.
 *
 * Wire contracts are reused from the repo-level `types/*.ts`; we re-export the
 * pieces the views need plus the small view-routing/view-model types the page
 * synthesizes.
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

// --- Git (status / diff) ----------------------------------------------------
export type {
  GitStatusPayload,
  GitDiffPayload,
  GitFileChange,
  GitFileChangeKind,
  GitCommitSummary,
} from "../../../../../../types/git";

// ---------------------------------------------------------------------------
// View-model types synthesized by the page
// ---------------------------------------------------------------------------

/** Readiness tone vocabulary (mirrors the other feature surfaces). */
export type EvidenceTone = "ok" | "warn" | "bad" | "info" | "mute";

/** The rows-column source mode: browse the project tree, or show search hits. */
export const FILES_BROWSE_MODES = ["tree", "search"] as const;
export type FilesBrowseMode = (typeof FILES_BROWSE_MODES)[number];

/** Preview mode for the selected file. */
export type FilesPreviewMode = "content" | "diff";

/** A file selected for inspection (path + display metadata). */
export interface FilesSelection {
  path: string;
  name: string;
  ext: string | null;
  /** True when the entry is known to be text-previewable (from browse/search). */
  textLike: boolean;
  /** True when the entry is a directory (not previewable). */
  isDirectory: boolean;
}
