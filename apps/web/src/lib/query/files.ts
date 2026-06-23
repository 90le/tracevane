import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { browseFiles, getFilesSummary, readFile } from "../api/files";
import type { FilesBrowseParams, FilesReadParams } from "../api/files";
import type { ApiError } from "../api/errors";
import type {
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSummaryPayload,
} from "../../../../../types/files";

/**
 * TanStack Query hooks for the Files read data layer consumed by the Workspace
 * IDE read workbench (`/ide`).
 *
 * Query keys are namespaced under `["ide", "files", ...]`. All queries are
 * read-only; there are no mutations in this slice (editing/writing belong to
 * the future Workspace IDE write track).
 */

export const filesKeys = {
  all: ["ide", "files"] as const,
  summary: () => ["ide", "files", "summary"] as const,
  browse: (rootId: string, path: string) =>
    ["ide", "files", "browse", rootId, path] as const,
  read: (rootId: string, path: string) =>
    ["ide", "files", "read", rootId, path] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

/** File roots roster (`/api/files/summary`). */
export function useFilesSummaryQuery(options?: QueryOpts<FilesSummaryPayload>) {
  return useQuery<FilesSummaryPayload, ApiError>({
    queryKey: filesKeys.summary(),
    queryFn: ({ signal }) => getFilesSummary(signal),
    ...options,
  });
}

/** Paged directory listing for a root + path (`/api/files/browse`). */
export function useFilesBrowseQuery(
  params: FilesBrowseParams | null,
  options?: QueryOpts<FilesDirectoryPayload>,
) {
  return useQuery<FilesDirectoryPayload, ApiError>({
    queryKey: filesKeys.browse(params?.rootId ?? "", params?.path ?? ""),
    queryFn: ({ signal }) => browseFiles(params as FilesBrowseParams, signal),
    enabled: Boolean(params?.rootId) && (options?.enabled ?? true),
    ...options,
  });
}

/** Single file content (`/api/files/read`). */
export function useFileReadQuery(
  params: FilesReadParams | null,
  options?: QueryOpts<FilesReadPayload>,
) {
  return useQuery<FilesReadPayload, ApiError>({
    queryKey: filesKeys.read(params?.rootId ?? "", params?.path ?? ""),
    queryFn: ({ signal }) => readFile(params as FilesReadParams, signal),
    enabled:
      Boolean(params?.rootId && params?.path) && (options?.enabled ?? true),
    ...options,
  });
}
