import { explorerDirname, joinExplorerPath, normalizeExplorerPath } from "@/shared/explorer-core";
import type { GitFileChange, GitFileChangeKind, GitStatusPayload } from "../../../../../../types/git";

export interface IdeGitDecoration {
  path: string;
  kind: GitFileChangeKind;
  status: string;
  staged: boolean;
  unstaged: boolean;
  aggregate: boolean;
  label: string;
  tone: "added" | "modified" | "deleted" | "renamed" | "conflicted" | "untracked" | "unknown";
  change?: GitFileChange;
}

export interface IdeGitDecoratedChange extends GitFileChange {
  rootPath: string;
  label: string;
  tone: IdeGitDecoration["tone"];
}

export interface IdeGitDecorationSnapshot {
  status: GitStatusPayload | null;
  repoRootPath: string;
  changes: IdeGitDecoratedChange[];
  byPath: Map<string, IdeGitDecoration>;
}

export function buildIdeGitDecorations(status: GitStatusPayload | null): IdeGitDecorationSnapshot {
  const repoRootPath = gitRepositoryRootPath(status);
  const byPath = new Map<string, IdeGitDecoration>();
  const decoratedChanges = (status?.changes ?? []).map((change) => decorateChange(change, repoRootPath));

  for (const change of decoratedChanges) {
    const direct = decorationForChange(change, false);
    setPreferredDecoration(byPath, change.rootPath, direct);

    let parent = explorerDirname(change.rootPath);
    while (parent) {
      setPreferredDecoration(byPath, parent, decorationForChange(change, true, parent));
      parent = explorerDirname(parent);
    }
  }

  return {
    status,
    repoRootPath,
    changes: decoratedChanges,
    byPath,
  };
}

export function gitRepositoryRootPath(status: GitStatusPayload | null): string {
  if (!status?.available) return "";
  const directoryPath = normalizeExplorerPath(status.directoryPath);
  const repositoryRelativePath = normalizeExplorerPath(status.repositoryRelativePath);
  if (!repositoryRelativePath) return directoryPath;
  if (directoryPath === repositoryRelativePath) return "";
  if (directoryPath.endsWith(`/${repositoryRelativePath}`)) {
    return normalizeExplorerPath(directoryPath.slice(0, -repositoryRelativePath.length));
  }
  return directoryPath;
}

function decorateChange(change: GitFileChange, repoRootPath: string): IdeGitDecoratedChange {
  const rootPath = normalizeExplorerPath(joinExplorerPath(repoRootPath, change.path));
  return {
    ...change,
    rootPath,
    label: labelForGitKind(change.kind),
    tone: toneForGitKind(change.kind),
  };
}

function decorationForChange(change: IdeGitDecoratedChange, aggregate: boolean, path = change.rootPath): IdeGitDecoration {
  return {
    path,
    kind: change.kind,
    status: change.status,
    staged: change.staged,
    unstaged: change.unstaged,
    aggregate,
    label: aggregate ? "•" : change.label,
    tone: change.tone,
    change,
  };
}

function setPreferredDecoration(map: Map<string, IdeGitDecoration>, path: string, decoration: IdeGitDecoration) {
  const normalized = normalizeExplorerPath(path);
  const current = map.get(normalized);
  if (!current || priority(decoration.kind) < priority(current.kind) || (current.aggregate && !decoration.aggregate)) {
    map.set(normalized, { ...decoration, path: normalized });
  }
}

function priority(kind: GitFileChangeKind): number {
  switch (kind) {
    case "conflicted": return 0;
    case "deleted": return 1;
    case "renamed": return 2;
    case "added": return 3;
    case "modified": return 4;
    case "untracked": return 5;
    case "copied": return 6;
    default: return 7;
  }
}

export function labelForGitKind(kind: GitFileChangeKind): string {
  switch (kind) {
    case "added": return "A";
    case "modified": return "M";
    case "deleted": return "D";
    case "renamed": return "R";
    case "copied": return "C";
    case "untracked": return "U";
    case "conflicted": return "!";
    default: return "?";
  }
}

export function toneForGitKind(kind: GitFileChangeKind): IdeGitDecoration["tone"] {
  switch (kind) {
    case "added": return "added";
    case "modified": return "modified";
    case "deleted": return "deleted";
    case "renamed": return "renamed";
    case "untracked": return "untracked";
    case "conflicted": return "conflicted";
    default: return "unknown";
  }
}
