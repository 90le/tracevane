import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  checkoutBranch,
  commitFiles,
  createBranch,
  getGitDiff,
  getGitStatus,
  stageFiles,
  unstageFiles,
} from "../api/git";
import type {
  GitCheckoutParams,
  GitCommitParams,
  GitCreateBranchParams,
  GitDiffParams,
  GitStageParams,
  GitStatusParams,
  GitUnstageParams,
} from "../api/git";
import type { ApiError } from "../api/errors";
import type { GitDiffPayload, GitStatusPayload } from "../../../../../types/git";

/**
 * TanStack Query hooks for the Git data layer consumed by the Workspace IDE
 * workbench (`/ide`).
 *
 * Query keys are namespaced under `["ide", "git", ...]`. Read queries are
 * read-only; the mutation hooks (stage / unstage / commit / branch / checkout)
 * return the refreshed `GitStatusPayload` from the backend and invalidate the
 * git surface (status + diff slices) on success so the IDE panel updates.
 */

export const gitKeys = {
  all: ["ide", "git"] as const,
  status: (rootId: string, path: string) =>
    ["ide", "git", "status", rootId, path] as const,
  diff: (rootId: string, path: string, file: string, staged: boolean) =>
    ["ide", "git", "diff", rootId, path, file, staged] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

/** Invalidate the entire Git surface (status + all diff slices) for a root. */
function useInvalidateGitSurface() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: gitKeys.all });
  };
}

/** Branch / change list / recent commits for a root (`/api/git/status`). */
export function useGitStatusQuery(
  params: GitStatusParams | null,
  options?: QueryOpts<GitStatusPayload>,
) {
  return useQuery<GitStatusPayload, ApiError>({
    queryKey: gitKeys.status(params?.rootId ?? "", params?.path ?? ""),
    queryFn: ({ signal }) => getGitStatus(params as GitStatusParams, signal),
    enabled: Boolean(params?.rootId) && (options?.enabled ?? true),
    ...options,
  });
}

/** Unified diff for a single file (`/api/git/diff`). */
export function useGitDiffQuery(
  params: GitDiffParams | null,
  options?: QueryOpts<GitDiffPayload>,
) {
  return useQuery<GitDiffPayload, ApiError>({
    queryKey: gitKeys.diff(
      params?.rootId ?? "",
      params?.path ?? "",
      params?.file ?? "",
      params?.staged ?? false,
    ),
    queryFn: ({ signal }) => getGitDiff(params as GitDiffParams, signal),
    enabled: Boolean(params?.rootId && params?.file) && (options?.enabled ?? true),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Mutations (write track). Each hook's `onSuccess` refreshes the entire Git
// surface — `["ide", "git", ...]` — because every backend POST returns the
// refreshed `GitStatusPayload` and both status and diff slices must re-render.
// Callers may pass `options.onSuccess` to layer additional effects; the
// invalidate always runs first.
// ---------------------------------------------------------------------------

/**
 * Stage paths (`/api/git/stage`). Omit/empty `paths` to stage everything
 * (`git add -A`). On success, invalidates the Git surface.
 */
export function useStageFilesMutation(
  options?: MutationOpts<GitStatusPayload, GitStageParams>,
) {
  const invalidate = useInvalidateGitSurface();
  return useMutation<GitStatusPayload, ApiError, GitStageParams>({
    mutationFn: (payload) => stageFiles(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Unstage paths (`/api/git/unstage`). Omit/empty `paths` to unstage
 * everything. On success, invalidates the Git surface.
 */
export function useUnstageFilesMutation(
  options?: MutationOpts<GitStatusPayload, GitUnstageParams>,
) {
  const invalidate = useInvalidateGitSurface();
  return useMutation<GitStatusPayload, ApiError, GitUnstageParams>({
    mutationFn: (payload) => unstageFiles(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Commit staged changes (`/api/git/commit`). DESTRUCTIVE (history rewrite):
 * `message` is required. On success, invalidates the Git surface.
 */
export function useCommitFilesMutation(
  options?: MutationOpts<GitStatusPayload, GitCommitParams>,
) {
  const invalidate = useInvalidateGitSurface();
  return useMutation<GitStatusPayload, ApiError, GitCommitParams>({
    mutationFn: (payload) => commitFiles(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Create a branch (`/api/git/branches`). `checkout` defaults to `true` on the
 * server; set it to `false` to create-without-switch. `from` optionally sets a
 * start point. On success, invalidates the Git surface.
 */
export function useCreateBranchMutation(
  options?: MutationOpts<GitStatusPayload, GitCreateBranchParams>,
) {
  const invalidate = useInvalidateGitSurface();
  return useMutation<GitStatusPayload, ApiError, GitCreateBranchParams>({
    mutationFn: (payload) => createBranch(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Checkout a branch/ref/commit (`/api/git/checkout`). DESTRUCTIVE (working
 * tree update): invoke behind a confirmation when there are uncommitted
 * changes. `detach: true` checks out a detached HEAD. On success, invalidates
 * the Git surface.
 */
export function useCheckoutBranchMutation(
  options?: MutationOpts<GitStatusPayload, GitCheckoutParams>,
) {
  const invalidate = useInvalidateGitSurface();
  return useMutation<GitStatusPayload, ApiError, GitCheckoutParams>({
    mutationFn: (payload) => checkoutBranch(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}
