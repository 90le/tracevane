import { apiRequest } from "./client";
import type { GitDiffPayload, GitStatusPayload } from "../../../../../types/git";

/**
 * Typed transport bindings for the read slice of the Git HTTP API
 * (`apps/api/modules/git/routes.ts`) consumed by the Workspace IDE read
 * workbench (`/ide`).
 *
 * Bound here (read-only GET):
 *  - GET /api/git/status  → branch / changes / commits roll-up for a root
 *  - GET /api/git/diff    → unified diff for one file (working tree or staged)
 *
 * NOT bound here (out of scope — the Workspace IDE write track):
 *  - commit-detail (read) is not needed by the workbench's current views
 *  - every mutating route (init/stage/unstage/commit/branches/checkout) — staging
 *    and committing belong to the future write track and are deliberately not
 *    surfaced here.
 *
 * Response shapes come from the shared contract (`types/git.ts`).
 */

const BASE = "/api/git";

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
  const search = new URLSearchParams({ rootId: params.rootId });
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
  const search = new URLSearchParams({ rootId: params.rootId, file: params.file });
  if (params.path) search.set("path", params.path);
  if (params.staged) search.set("staged", "true");
  if (params.untracked) search.set("untracked", "true");
  return apiRequest<GitDiffPayload>(`${BASE}/diff?${search.toString()}`, {
    signal,
  });
}
