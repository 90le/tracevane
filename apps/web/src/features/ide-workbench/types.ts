import type { SerializedDockview } from "dockview-react";
import type { EditorDocumentId, EditorFileRef, EditorSaveState } from "@/shared/editor-core";

export type WorkbenchActivityId =
  | "explorer"
  | "search"
  | "git"
  | "run"
  | "extensions";

export type WorkbenchPanelId =
  | "terminal"
  | "problems"
  | "output"
  | "debugConsole";

export type WorkbenchViewId = WorkbenchActivityId | WorkbenchPanelId;
export type WorkbenchPlacement =
  | "primary-sidebar"
  | "secondary-sidebar"
  | "panel";

export interface WorkbenchViewPlacement {
  viewId: WorkbenchViewId;
  placement: WorkbenchPlacement;
  order: number;
  visible: boolean;
}

export interface WorkbenchSideBarState {
  placement: "left" | "right";
  visible: boolean;
  collapsed: boolean;
  width: number;
}

export type WorkbenchPanelPlacement = "bottom" | "right";

export interface WorkbenchPanelState {
  placement: WorkbenchPanelPlacement;
  visible: boolean;
  collapsed: boolean;
  /** Current primary size for the active placement. Kept for backward-compatible layout persistence. */
  size: number;
  bottomSize: number;
  rightWidth: number;
  maximized: boolean;
  activePanelId: WorkbenchPanelId;
}

export interface IdeWorkbenchEditorTab {
  id: EditorDocumentId;
  ref: EditorFileRef;
  title: string;
  mode?: "file" | "git-diff";
  gitDiff?: IdeWorkbenchGitDiffRequest;
  preview: boolean;
  pinned: boolean;
  dirty: boolean;
  saveState?: EditorSaveState;
  saveError?: string | null;
  deleted?: boolean;
  externalState?: "changed" | "deleted";
  externalMessage?: string | null;
  metadata?: IdeWorkbenchEditorFileMetadata;
  reveal?: IdeWorkbenchEditorRevealRange | null;
}

export interface IdeWorkbenchGitDiffRequest {
  directoryPath: string;
  repoPath: string;
  previousPath?: string | null;
  rootPath: string;
  staged: boolean;
  untracked: boolean;
}

export interface IdeWorkbenchEditorRevealRange {
  lineNumber: number;
  column?: number;
}

export interface IdeWorkbenchEditorFileMetadata {
  language?: string | null;
  mimeType?: string | null;
  size?: number | null;
  readonly?: boolean;
  previewKind?: "text" | "image" | "video" | "audio" | "pdf" | "binary";
}

export interface IdeWorkbenchEditorGroup {
  id: string;
  activeTabId: EditorDocumentId | null;
  tabs: IdeWorkbenchEditorTab[];
}

export interface IdeWorkbenchExplorerState {
  directoryPath: string;
}

export interface IdeWorkbenchLayoutState {
  layoutVersion: 1;
  activeActivityId: WorkbenchActivityId;
  sideBar: WorkbenchSideBarState;
  secondarySideBar: WorkbenchSideBarState;
  explorer: IdeWorkbenchExplorerState;
  panel: WorkbenchPanelState;
  viewPlacements: WorkbenchViewPlacement[];
  editorGroups: IdeWorkbenchEditorGroup[];
  activeEditorGroupId: string;
  dockviewLayout: SerializedDockview | null;
}

export const IDE_WORKBENCH_LAYOUT_VERSION = 1;
export const IDE_DEFAULT_EDITOR_GROUP_ID = "main";

export const IDE_PANEL_LABELS: Record<WorkbenchPanelId, string> = {
  terminal: "Terminal",
  problems: "Problems",
  output: "Output",
  debugConsole: "Debug Console",
};

export const IDE_ACTIVITY_LABELS: Record<WorkbenchActivityId, string> = {
  explorer: "Explorer",
  search: "Search",
  git: "Source Control",
  run: "Run and Debug",
  extensions: "Extensions",
};
