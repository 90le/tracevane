import { apiRequest } from "./client";
import type {
  GitCommitDetailPayload,
  GitDiffPayload,
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
 *
 * Bound here (write POST — all return the refreshed `GitStatusPayload`):
 *  - POST /api/git/stage     → stage paths (empty `paths` = `git add -A`)
 *  - POST /api/git/unstage   → unstage paths (empty `paths` = restore all)
 *  - POST /api/git/commit    → commit staged changes with a message
 *  - POST /api/git/branches  → create a branch (optionally checkout, from ref)
 *  - POST /api/git/checkout  → checkout a branch/ref (optionally detached)
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

/** Shared remote/ref selector for pull/push/sync. Empty remote+branch means upstream. */
export interface GitRemoteActionParams extends GitMutationParams {
  remote?: string;
  branch?: string;
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
