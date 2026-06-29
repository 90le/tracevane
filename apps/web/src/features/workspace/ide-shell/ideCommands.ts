import type * as React from "react";

export type WorkspaceCommandGroup =
  | "导航"
  | "布局"
  | "Git"
  | "终端"
  | "编辑器"
  | "证据"
  | "AI";
export type WorkspaceCommandRisk = "safe" | "mutating" | "destructive";
export type WorkspaceCommandSurface =
  | "navigation"
  | "layout"
  | "files"
  | "search"
  | "git"
  | "terminal"
  | "editor"
  | "evidence"
  | "ai-handoff"
  | "file-write"
  | "tab-lifecycle"
  | "clipboard"
  | "explorer"
  | "replace-plan"
  | "input"
  | "session";

export interface WorkspaceCommand {
  id: string;
  group: WorkspaceCommandGroup;
  label: string;
  description: string;
  shortcut?: string;
  risk?: WorkspaceCommandRisk;
  surface?: WorkspaceCommandSurface;
  icon: React.ReactNode;
  disabled?: boolean;
  run: () => void;
}

export const WORKSPACE_COMMAND_GROUPS: readonly WorkspaceCommandGroup[] = [
  "导航",
  "布局",
  "Git",
  "终端",
  "编辑器",
  "证据",
  "AI",
];
