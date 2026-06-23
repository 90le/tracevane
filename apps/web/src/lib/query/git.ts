import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { getGitDiff, getGitStatus } from "../api/git";
import type { GitDiffParams, GitStatusParams } from "../api/git";
import type { ApiError } from "../api/errors";
import type { GitDiffPayload, GitStatusPayload } from "../../../../../types/git";

/**
 * TanStack Query hooks for the Git read data layer consumed by the Workspace
 * IDE read workbench (`/ide`).
 *
 * Query keys are namespaced under `["ide", "git", ...]`. All queries are
 * read-only; staging/committing belong to the future Workspace IDE write track.
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
