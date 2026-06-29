export const WORKSPACE_OWNERS = [
  "files",
  "editor",
  "inspect",
  "terminal",
  "git",
] as const;

export type WorkspaceOwner = (typeof WORKSPACE_OWNERS)[number];

export type WorkspaceActivity = "files" | "search" | "git" | "terminal";
export type WorkspaceMobileMode = "files" | "edit" | "terminal" | "inspect";
export type WorkspaceModeParam = WorkspaceActivity | WorkspaceMobileMode;

export interface WorkspaceOwnerBoundaryRule {
  owner: WorkspaceOwner;
  owns: string[];
  mustNotOwn: string[];
}

export const WORKSPACE_OWNER_BOUNDARIES: WorkspaceOwnerBoundaryRule[] = [
  {
    owner: "files",
    owns: ["browse", "file lifecycle", "batch operations", "upload/download", "archive"],
    mustNotOwn: ["PTY lifecycle", "CLI Agent run lifecycle", "provider secrets"],
  },
  {
    owner: "terminal",
    owns: ["shell session", "process output", "resize", "reconnect", "ports/logs"],
    mustNotOwn: ["file CRUD UI", "batch file operations", "CLI Agent readiness"],
  },
  {
    owner: "editor",
    owns: ["tabs", "buffers", "dirty state", "save/revert", "diff/review modes"],
    mustNotOwn: ["batch file lifecycle", "terminal sessions"],
  },
  {
    owner: "inspect",
    owns: ["file inspection", "readonly adapters", "metadata/evidence refs"],
    mustNotOwn: ["editor dirty state", "file batch operations", "rich rendering policy"],
  },
  {
    owner: "git",
    owns: ["changes", "diff", "stage/unstage", "commit", "revert"],
    mustNotOwn: ["generic file CRUD", "terminal session lifecycle"],
  },
];
