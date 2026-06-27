/**
 * Workspace feature shared types.
 *
 * This pass ships a read/evidence workbench: file explorer + viewer + a bottom
 * panel (Git changes / persisted terminal sessions). The write/run/PTY-attach/
 * AI-diff track is deliberately out of scope and documented in
 * `docs/Workspace重设计总纲.md`.
 *
 * Wire contracts are reused from the repo-level `types/*.ts`; we re-export the
 * pieces the views need plus the small view-routing/view-model types the page
 * synthesizes.
 */

// --- Files (roots / directory listing / file content) ----------------------
export type {
  FileRootSummary,
  FileEntrySummary,
  FileEntryKind,
  FileBreadcrumb,
  FilesSummaryPayload,
  FilesDirectoryPayload,
  FilesReadPayload,
} from "../../../../../../types/files";

// --- Git (status / diff) ----------------------------------------------------
export type {
  GitStatusPayload,
  GitDiffPayload,
  GitFileChange,
  GitFileChangeKind,
  GitCommitSummary,
  GitBranchSummary,
} from "../../../../../../types/git";

// --- Terminal (reused: persisted sessions + CLI status) --------------------
export type {
  TerminalStatusPayload,
  TerminalSessionDescriptor,
  TerminalSessionStatus,
  TerminalSessionSummaryResponse,
} from "../../../../../../types/terminal";

// ---------------------------------------------------------------------------
// Bottom panel tabs
// ---------------------------------------------------------------------------

/** The bottom-panel tab set. `terminal` is read-only session evidence. */
export const WORKSPACE_PANEL_TABS = ["git", "terminal"] as const;
export type WorkspacePanelTab = (typeof WORKSPACE_PANEL_TABS)[number];

/** The center viewer render mode for the selected file. */
export type WorkspaceViewerMode = "content" | "diff";

/** Readiness tone vocabulary (mirrors the other feature workbenches). */
export type WorkbenchTone = "ok" | "warn" | "bad" | "info" | "mute";
