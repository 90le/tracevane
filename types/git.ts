export type GitFileChangeKind =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted"
  | "unknown";

export interface GitFileChange {
  path: string;
  previousPath: string | null;
  status: string;
  kind: GitFileChangeKind;
  staged: boolean;
  unstaged: boolean;
}

export interface GitBranchSummary {
  name: string;
  current: boolean;
  upstream: string | null;
  shortHash: string;
  subject: string;
}

export interface GitCommitSummary {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  date: string;
  refs: string;
}

export interface GitCommitDetailPayload extends GitCommitSummary {
  checkedAt: string;
  body: string;
  message: string;
  parents: string[];
}

export interface GitDiffPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string;
  path: string;
  staged: boolean;
  untracked: boolean;
  binary: boolean;
  truncated: boolean;
  diff: string;
  message: string | null;
}

export interface GitStatusPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string | null;
  repositoryRelativePath: string;
  available: boolean;
  clean: boolean;
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  message: string | null;
  changes: GitFileChange[];
  branches: GitBranchSummary[];
  commits: GitCommitSummary[];
}

export interface GitRepositoryRequest {
  rootId?: string;
  path?: string;
}

export interface GitPathActionRequest extends GitRepositoryRequest {
  paths?: string[];
}

export interface GitDiffRequest extends GitRepositoryRequest {
  file?: string;
  staged?: boolean;
  untracked?: boolean;
}

export interface GitCommitDetailRequest extends GitRepositoryRequest {
  hash?: string;
}

export interface GitCommitRequest extends GitRepositoryRequest {
  message?: string;
}

export interface GitCreateBranchRequest extends GitRepositoryRequest {
  name?: string;
  checkout?: boolean;
  from?: string;
}

export interface GitCheckoutRequest extends GitRepositoryRequest {
  target?: string;
  detach?: boolean;
}
