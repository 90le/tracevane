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


export interface GitGraphCommit extends GitCommitSummary {
  parents: string[];
}

export interface GitGraphPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string | null;
  available: boolean;
  message: string | null;
  commits: GitGraphCommit[];
}

export interface GitBlameLine {
  lineNumber: number;
  originalLineNumber: number;
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  authorTime: string;
  summary: string;
  content: string;
}

export interface GitBlamePayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string | null;
  available: boolean;
  message: string | null;
  path: string;
  lines: GitBlameLine[];
  truncated: boolean;
}

export interface GitCommitDetailPayload extends GitCommitSummary {
  checkedAt: string;
  body: string;
  message: string;
  parents: string[];
  files: GitFileChange[];
  diff: string;
  binary: boolean;
  truncated: boolean;
}

export interface GitDiffPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string;
  path: string;
  previousPath: string | null;
  originalPath: string | null;
  modifiedPath: string | null;
  staged: boolean;
  untracked: boolean;
  binary: boolean;
  truncated: boolean;
  diff: string;
  originalContent: string | null;
  modifiedContent: string | null;
  contentTruncated: boolean;
  message: string | null;
}


export interface GitStashEntry {
  ref: string;
  selector: string;
  branch: string;
  message: string;
}

export interface GitStashListPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  repositoryRoot: string | null;
  available: boolean;
  message: string | null;
  stashes: GitStashEntry[];
}

export interface GitStashSaveRequest extends GitRepositoryRequest {
  message?: string;
  includeUntracked?: boolean;
}

export interface GitStashActionRequest extends GitRepositoryRequest {
  ref?: string;
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
  previousFile?: string;
  staged?: boolean;
  untracked?: boolean;
}

export interface GitCommitDetailRequest extends GitRepositoryRequest {
  hash?: string;
}

export interface GitGraphRequest extends GitRepositoryRequest {
  limit?: number;
  all?: boolean;
  file?: string;
}

export interface GitBlameRequest extends GitRepositoryRequest {
  file?: string;
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

export interface GitDeleteBranchRequest extends GitRepositoryRequest {
  name?: string;
  /** M9-C intentionally rejects force delete; kept for explicit API guard messaging. */
  force?: boolean;
}

export interface GitRenameBranchRequest extends GitRepositoryRequest {
  oldName?: string;
  newName?: string;
}

export interface GitSetUpstreamRequest extends GitRepositoryRequest {
  branch?: string;
  upstream?: string;
  unset?: boolean;
}

export interface GitRemoteActionRequest extends GitRepositoryRequest {
  /** Optional remote name. When omitted, Git uses the current branch upstream. */
  remote?: string;
  /** Optional branch/ref name. When omitted, Git uses the current branch upstream. */
  branch?: string;
}

export interface GitPublishBranchRequest extends GitRepositoryRequest {
  /** Remote name to publish to. Defaults to origin. */
  remote?: string;
  /** Branch name to publish. Defaults to current branch. */
  branch?: string;
}
