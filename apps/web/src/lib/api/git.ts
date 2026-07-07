import { apiRequest } from "./client";
import type {
  GitCommitDetailPayload,
  GitBlamePayload,
  GitDiffPayload,
  GitGraphPayload,
  GitStashListPayload,
  GitStatusPayload,
} from "../../../../../types/git";

/**
 * Typed transport bindings for the Git HTTP API
 * (`apps/api/modules/git/routes.ts`) consumed by Workspace Git/editor surfaces.
 *
 * Bound here (read GET):
 *  - GET /api/git/status  → branch / changes / commits roll-up for a root
 *  - GET /api/git/diff    → unified diff for one file (working tree or staged)
 *  - GET /api/git/commit-detail → metadata/body/parents for a commit
 *  - GET /api/git/graph  → read-only commit graph/log list
 *  - GET /api/git/blame  → read-only line blame for one file
 *
 * Bound here (write POST — all return the refreshed `GitStatusPayload`):
 *  - POST /api/git/stage     → stage paths (empty `paths` = `git add -A`)
 *  - POST /api/git/unstage   → unstage paths (empty `paths` = restore all)
 *  - POST /api/git/commit    → commit staged changes with a message
 *  - POST /api/git/branches  → create a branch (optionally checkout, from ref)
 *  - POST /api/git/checkout  → checkout a branch/ref (optionally detached)
 *  - POST /api/git/fetch     → fetch upstream/remote tracking refs
 *  - POST /api/git/pull      → fast-forward pull from upstream/remote
 *  - POST /api/git/push      → push to upstream/remote
 *  - POST /api/git/sync      → fast-forward pull, then push
 *  - POST /api/git/publish   → push -u current branch to a remote
 *
 * The `init` route (POST /api/git/init) is intentionally left unbound for now;
 * it has no UI surface in the workbench. Response shapes come from the shared
 * contract (`types/git.ts`).
 */

const BASE = "/api/git";

function gitApiRootId(rootId: string): string {
  return rootId === "openclaw-root" ? "system-root" : rootId;
}

export interface GitStatusParams {
  rootId: string;
  /** Directory path relative to the root (empty = root). */
  path?: string;
}

/** GET /api/git/status — branch / change list / recent commits for a root. */
export function getGitStatus(
  params: GitStatusParams,
  signal?: AbortSignal,
): Promise<GitStatusPayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId) });
  if (params.path) search.set("path", params.path);
  return apiRequest<GitStatusPayload>(`${BASE}/status?${search.toString()}`, {
    signal,
  });
}

export interface GitDiffParams {
  rootId: string;
  path?: string;
  /** Repo-relative file path to diff. */
  file: string;
  /** Previous repo-relative path for renamed/copied files. */
  previousFile?: string | null;
  /** Diff the staged (index) version instead of the working tree. */
  staged?: boolean;
  /** Treat the file as untracked (diff against /dev/null). */
  untracked?: boolean;
}

/** GET /api/git/diff — unified diff for a single file. */
export function getGitDiff(
  params: GitDiffParams,
  signal?: AbortSignal,
): Promise<GitDiffPayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId), file: params.file });
  if (params.path) search.set("path", params.path);
  if (params.previousFile) search.set("previousFile", params.previousFile);
  if (params.staged) search.set("staged", "true");
  if (params.untracked) search.set("untracked", "true");
  return apiRequest<GitDiffPayload>(`${BASE}/diff?${search.toString()}`, {
    signal,
  });
}


export interface GitCommitDetailParams {
  rootId: string;
  path?: string;
  /** Commit hash or ref to inspect. */
  hash: string;
}

/** GET /api/git/commit-detail — metadata/body/parents for one commit. */
export function getGitCommitDetail(
  params: GitCommitDetailParams,
  signal?: AbortSignal,
): Promise<GitCommitDetailPayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId), hash: params.hash });
  if (params.path) search.set("path", params.path);
  return apiRequest<GitCommitDetailPayload>(
    `${BASE}/commit-detail?${search.toString()}`,
    { signal },
  );
}


export interface GitGraphParams {
  rootId: string;
  path?: string;
  limit?: number;
  all?: boolean;
  file?: string;
}

/** GET /api/git/graph — read-only commit graph/log list. */
export function getGitGraph(
  params: GitGraphParams,
  signal?: AbortSignal,
): Promise<GitGraphPayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId) });
  if (params.path) search.set("path", params.path);
  if (params.limit) search.set("limit", String(params.limit));
  if (params.all) search.set("all", "true");
  if (params.file) search.set("file", params.file);
  return apiRequest<GitGraphPayload>(`${BASE}/graph?${search.toString()}`, { signal });
}

export interface GitBlameParams {
  rootId: string;
  path?: string;
  file: string;
}

/** GET /api/git/blame — read-only line blame for one file. */
export function getGitBlame(
  params: GitBlameParams,
  signal?: AbortSignal,
): Promise<GitBlamePayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId), file: params.file });
  if (params.path) search.set("path", params.path);
  return apiRequest<GitBlamePayload>(`${BASE}/blame?${search.toString()}`, { signal });
}

// ---------------------------------------------------------------------------
// Write bindings (POST). All return the refreshed GitStatusPayload. Field
// names mirror the backend's shared contract in `types/git.ts`
// (GitPathActionRequest / GitCommitRequest / GitCreateBranchRequest /
// GitCheckoutRequest) read by `apps/api/modules/git/routes.ts`.
// ---------------------------------------------------------------------------

/** Shared root/dir selector for every mutating route. */
export interface GitMutationParams {
  rootId: string;
  /** Directory path relative to the root (empty = root). */
  path?: string;
}

/** POST /api/git/stage — stage paths (omitted/empty `paths` → `git add -A`). */
export interface GitStageParams extends GitMutationParams {
  paths?: string[];
}
export function stageFiles(params: GitStageParams): Promise<GitStatusPayload> {
  const { rootId, path, paths } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/stage`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", paths: paths ?? [] }),
  });
}

/** POST /api/git/unstage — unstage paths (omitted/empty `paths` → restore all). */
export interface GitUnstageParams extends GitMutationParams {
  paths?: string[];
}
export function unstageFiles(params: GitUnstageParams): Promise<GitStatusPayload> {
  const { rootId, path, paths } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/unstage`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", paths: paths ?? [] }),
  });
}

/** POST /api/git/commit — commit staged changes with a message (required). */
export interface GitCommitParams extends GitMutationParams {
  message: string;
}
export function commitFiles(params: GitCommitParams): Promise<GitStatusPayload> {
  const { rootId, path, message } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/commit`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", message }),
  });
}

/** POST /api/git/branches — create a branch (defaults to `checkout: true`). */
export interface GitCreateBranchParams extends GitMutationParams {
  /** New branch name (required). */
  name: string;
  /** Also checkout the new branch. Defaults to `true` server-side. */
  checkout?: boolean;
  /** Optional start point (ref/commit); defaults to HEAD. */
  from?: string;
}
export function createBranch(params: GitCreateBranchParams): Promise<GitStatusPayload> {
  const { rootId, path, name, checkout, from } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/branches`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", name, checkout, from }),
  });
}

/** POST /api/git/checkout — checkout a branch/ref (or detached HEAD). */
export interface GitCheckoutParams extends GitMutationParams {
  /** Branch/ref/commit to checkout (required). */
  target: string;
  /** Detach HEAD at the target. Defaults to `false` server-side. */
  detach?: boolean;
}
export function checkoutBranch(params: GitCheckoutParams): Promise<GitStatusPayload> {
  const { rootId, path, target, detach } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/checkout`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", target, detach }),
  });
}


/** POST /api/git/branches/delete — guarded local branch delete. */
export interface GitDeleteBranchParams extends GitMutationParams {
  name: string;
  force?: boolean;
}
export function deleteBranch(params: GitDeleteBranchParams): Promise<GitStatusPayload> {
  const { rootId, path, name, force } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/branches/delete`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", name, force }),
  });
}

/** POST /api/git/branches/rename — guarded local branch rename. */
export interface GitRenameBranchParams extends GitMutationParams {
  oldName: string;
  newName: string;
}
export function renameBranch(params: GitRenameBranchParams): Promise<GitStatusPayload> {
  const { rootId, path, oldName, newName } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/branches/rename`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", oldName, newName }),
  });
}

/** POST /api/git/branches/upstream — guarded upstream set/unset. */
export interface GitSetBranchUpstreamParams extends GitMutationParams {
  branch: string;
  upstream?: string;
  unset?: boolean;
}
export function setBranchUpstream(params: GitSetBranchUpstreamParams): Promise<GitStatusPayload> {
  const { rootId, path, branch, upstream, unset } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/branches/upstream`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", branch, upstream, unset }),
  });
}

/** Shared remote/ref selector for pull/push/sync. Empty remote+branch means upstream. */
export interface GitRemoteActionParams extends GitMutationParams {
  remote?: string;
  branch?: string;
}
export function fetchBranch(params: GitRemoteActionParams): Promise<GitStatusPayload> {
  const { rootId, path, remote, branch } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/fetch`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", remote, branch }),
  });
}

export function pullBranch(params: GitRemoteActionParams): Promise<GitStatusPayload> {
  const { rootId, path, remote, branch } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/pull`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", remote, branch }),
  });
}

export function pushBranch(params: GitRemoteActionParams): Promise<GitStatusPayload> {
  const { rootId, path, remote, branch } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/push`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", remote, branch }),
  });
}

export function syncBranch(params: GitRemoteActionParams): Promise<GitStatusPayload> {
  const { rootId, path, remote, branch } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/sync`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", remote, branch }),
  });
}

/** Publish a branch to a remote and set upstream (`git push --set-upstream`). */
export interface GitPublishBranchParams extends GitMutationParams {
  remote?: string;
  branch?: string;
}
export function publishBranch(
  params: GitPublishBranchParams,
): Promise<GitStatusPayload> {
  const { rootId, path, remote, branch } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/publish`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", remote, branch }),
  });
}

export interface GitStashListParams extends GitMutationParams {}
export function getGitStashes(
  params: GitStashListParams,
  signal?: AbortSignal,
): Promise<GitStashListPayload> {
  const search = new URLSearchParams({ rootId: gitApiRootId(params.rootId) });
  if (params.path) search.set("path", params.path);
  return apiRequest<GitStashListPayload>(`${BASE}/stashes?${search.toString()}`, {
    signal,
  });
}

export interface GitStashSaveParams extends GitMutationParams {
  message?: string;
  includeUntracked?: boolean;
}
export function saveGitStash(params: GitStashSaveParams): Promise<GitStatusPayload> {
  const { rootId, path, message, includeUntracked } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/stashes`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", message, includeUntracked }),
  });
}

export interface GitStashActionParams extends GitMutationParams {
  ref?: string;
}
export function applyGitStash(params: GitStashActionParams): Promise<GitStatusPayload> {
  const { rootId, path, ref } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/stashes/apply`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", ref }),
  });
}

export function popGitStash(params: GitStashActionParams): Promise<GitStatusPayload> {
  const { rootId, path, ref } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/stashes/pop`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", ref }),
  });
}

export function dropGitStash(params: GitStashActionParams): Promise<GitStatusPayload> {
  const { rootId, path, ref } = params;
  return apiRequest<GitStatusPayload>(`${BASE}/stashes/drop`, {
    method: "POST",
    body: JSON.stringify({ rootId: gitApiRootId(rootId), path: path ?? "", ref }),
  });
}
