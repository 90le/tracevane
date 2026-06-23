import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  archiveFiles,
  browseFiles,
  copyFile,
  createDirectory,
  createFile,
  deleteFiles,
  getFilesSummary,
  moveFile,
  readFile,
  renameFile,
  searchFiles,
  unarchiveFile,
  writeFileContent,
} from "../api/files";
import type {
  FilesBrowseParams,
  FilesReadParams,
  FilesSearchParams,
} from "../api/files";
import type { ApiError } from "../api/errors";
import type {
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSearchPayload,
  FilesSummaryPayload,
} from "../../../../../types/files";

/**
 * TanStack Query hooks for the Files data layer consumed by the Workspace IDE
 * (`/ide`) and the File & Git evidence browser (`/files`).
 *
 * Query keys are namespaced under `["ide", "files", ...]` via {@link filesKeys}.
 * Read hooks wrap the read slice (`summary` / `browse` / `read` / `search`).
 *
 * Mutation hooks (Workspace IDE P1) wrap the write transport in
 * `../api/files.ts`. Each mutation returns the shared `FilesMutationResponse`
 * envelope; every successful mutation invalidates {@link filesKeys.all} so
 * browse/summary/search/read caches refresh automatically. The git panel
 * invalidates its own keys separately.
 */

export const filesKeys = {
  all: ["ide", "files"] as const,
  summary: () => ["ide", "files", "summary"] as const,
  browse: (rootId: string, path: string) =>
    ["ide", "files", "browse", rootId, path] as const,
  read: (rootId: string, path: string) =>
    ["ide", "files", "read", rootId, path] as const,
  search: (rootId: string, path: string, query: string) =>
    ["ide", "files", "search", rootId, path, query] as const,
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

/** Recursive name/content search under a root (`/api/files/search`). */
export function useFilesSearchQuery(
  params: FilesSearchParams | null,
  options?: QueryOpts<FilesSearchPayload>,
) {
  return useQuery<FilesSearchPayload, ApiError>({
    queryKey: filesKeys.search(
      params?.rootId ?? "",
      params?.path ?? "",
      params?.query ?? "",
    ),
    queryFn: ({ signal }) => searchFiles(params as FilesSearchParams, signal),
    enabled:
      Boolean(params?.rootId && params?.query?.trim()) &&
      (options?.enabled ?? true),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Write hooks (Workspace IDE P1).
// Each wraps one transport fn from `../api/files.ts` and invalidates the whole
// `filesKeys` tree on success so browse/summary/search/read refresh.
// ---------------------------------------------------------------------------

/** PUT /api/files/content — overwrite file content (IDE save). */
export function useWriteFileContentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: writeFileContent,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/directories — create a directory. */
export function useCreateDirectoryMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createDirectory,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/files — create a file. */
export function useCreateFileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/rename — rename a path. */
export function useRenameFileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: renameFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/copy — copy a path. */
export function useCopyFileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: copyFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/move — move a path. */
export function useMoveFileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: moveFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** DELETE /api/files — delete paths. */
export function useDeleteFilesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFiles,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/archive — archive paths into a single archive. */
export function useArchiveFilesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: archiveFiles,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/unarchive — unarchive a single archive. */
export function useUnarchiveFileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: unarchiveFile,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}
