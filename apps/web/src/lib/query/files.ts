import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  archiveFiles,
  browseFiles,
  chmodFiles,
  cleanFilesContentIndex,
  copyFile,
  createDirectory,
  createFile,
  deleteFiles,
  getFilesContentIndexRecords,
  getFilesContentIndexStats,
  getFilesSummary,
  getFilesTrash,
  getFileVersions,
  readFileVersion,
  restoreFileVersion,
  deleteFileVersion,
  moveFile,
  purgeFilesTrash,
  readFile,
  rebuildFilesContentIndex,
  renameFile,
  restoreFilesTrash,
  scanFilesContentIndex,
  searchFiles,
  transferFiles,
  unarchiveFile,
  uploadFiles,
  writeFileContent,
} from "../api/files";
import type {
  FilesBrowseParams,
  FilesReadParams,
  FilesSearchParams,
} from "../api/files";
import type { FilesContentIndexRecordsParams } from "../../../../../types/files";
import type { ApiError } from "../api/errors";
import type {
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSearchPayload,
  FilesVersionReadPayload,
  FilesVersionsPayload,
  FilesSummaryPayload,
  FilesTrashPayload,
} from "../../../../../types/files";

/**
 * TanStack Query hooks for the shared Files data layer consumed by File Manager, Workspace, and Chat file surfaces.
 *
 * Query keys are namespaced under `["files", ...]` via {@link filesKeys}.
 * Read hooks wrap the read slice (`summary` / `browse` / `read` / `search`).
 *
 * Mutation hooks (File Manager/Workspace) wrap the write transport in
 * `../api/files.ts`. Each mutation returns the shared `FilesMutationResponse`
 * envelope; every successful mutation invalidates {@link filesKeys.all} so
 * browse/summary/search/read caches refresh automatically. The git panel
 * invalidates its own keys separately.
 */

export const FILES_GLOBAL_SCOPE_ID = "global";

export const filesKeys = {
  all: ["files"] as const,
  summary: () => ["files", "summary"] as const,
  browse: (params: {
    rootId: string;
    path?: string;
    hidden?: boolean;
    page?: number;
    pageSize?: number;
    sortKey?: string;
    sortDirection?: string;
  }) =>
    [
      "files",
      "browse",
      params.rootId,
      params.path ?? "",
      params.hidden ?? null,
      params.page ?? 1,
      params.pageSize ?? null,
      params.sortKey ?? "name",
      params.sortDirection ?? "asc",
    ] as const,
  read: (
    rootId: string,
    path: string,
    offset?: number | null,
    limit?: number | null,
  ) => ["files", "read", rootId, path, offset ?? 0, limit ?? null] as const,
  versions: (rootId: string, path: string) =>
    ["files", "versions", rootId, path] as const,
  versionRead: (rootId: string, path: string, versionId: string) =>
    ["files", "versions", "read", rootId, path, versionId] as const,
  search: (params: {
    rootId: string;
    path?: string;
    query: string;
    recursive?: boolean;
    hidden?: boolean;
    caseSensitive?: boolean;
    regex?: boolean;
    limit?: number;
  }) =>
    [
      "files",
      "search",
      params.rootId,
      params.path ?? "",
      params.query,
      params.recursive ?? true,
      params.hidden ?? true,
      params.caseSensitive ?? false,
      params.regex ?? false,
      params.limit ?? null,
    ] as const,
  contentIndex: (rootId: string) => ["files", "content-index", rootId] as const,
  trash: (rootId: string) => ["files", "trash", rootId] as const,
  contentIndexRecords: (params: FilesContentIndexRecordsParams) =>
    [
      "files",
      "content-index-records",
      params.rootId,
      params.status ?? "all",
      params.query ?? "",
      params.offset ?? 0,
      params.limit ?? null,
    ] as const,
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
    queryKey: filesKeys.browse({
      rootId: params?.rootId ?? "",
      path: params?.path ?? "",
      hidden: params?.hidden,
      page: params?.page,
      pageSize: params?.pageSize,
      sortKey: params?.sortKey,
      sortDirection: params?.sortDirection,
    }),
    staleTime: 5_000,
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
    queryKey: filesKeys.read(
      params?.rootId ?? "",
      params?.path ?? "",
      params?.offset,
      params?.limit,
    ),
    queryFn: ({ signal }) => readFile(params as FilesReadParams, signal),
    enabled:
      Boolean(params?.rootId && params?.path) && (options?.enabled ?? true),
    ...options,
  });
}

/** Server-side historical versions for one editable file. */
export function useFileVersionsQuery(
  rootId: string | null,
  path: string | null,
  options?: QueryOpts<FilesVersionsPayload>,
) {
  return useQuery<FilesVersionsPayload, ApiError>({
    queryKey: filesKeys.versions(rootId ?? "", path ?? ""),
    queryFn: ({ signal }) =>
      getFileVersions(rootId as string, path as string, signal),
    enabled: Boolean(rootId && path) && (options?.enabled ?? true),
    ...options,
  });
}

/** Read one server-side historical version content. */
export function useFileVersionReadQuery(
  rootId: string | null,
  path: string | null,
  versionId: string | null,
  options?: QueryOpts<FilesVersionReadPayload>,
) {
  return useQuery<FilesVersionReadPayload, ApiError>({
    queryKey: filesKeys.versionRead(rootId ?? "", path ?? "", versionId ?? ""),
    queryFn: ({ signal }) =>
      readFileVersion(
        rootId as string,
        path as string,
        versionId as string,
        signal,
      ),
    enabled: Boolean(rootId && path && versionId) && (options?.enabled ?? true),
    ...options,
  });
}

/** Recursive name/content search under a root (`/api/files/search`). */
export function useFilesSearchQuery(
  params: FilesSearchParams | null,
  options?: QueryOpts<FilesSearchPayload>,
) {
  return useQuery<FilesSearchPayload, ApiError>({
    queryKey: filesKeys.search({
      rootId: params?.rootId ?? "",
      path: params?.path ?? "",
      query: params?.query ?? "",
      recursive: params?.recursive,
      hidden: params?.hidden,
      caseSensitive: params?.caseSensitive,
      regex: params?.regex,
      limit: params?.limit,
    }),
    queryFn: ({ signal }) => searchFiles(params as FilesSearchParams, signal),
    enabled:
      Boolean(params?.rootId && params?.query?.trim()) &&
      (options?.enabled ?? true),
    ...options,
  });
}

/** Content index stats for one root (`/api/files/content-index`). */
export function useFilesContentIndexQuery(
  rootId: string | null,
  options?: QueryOpts<
    import("../../../../../types/files").FilesContentIndexStatsPayload
  >,
) {
  const scopeRootId = rootId || FILES_GLOBAL_SCOPE_ID;
  return useQuery<
    import("../../../../../types/files").FilesContentIndexStatsPayload,
    ApiError
  >({
    queryKey: filesKeys.contentIndex(scopeRootId),
    queryFn: ({ signal }) => getFilesContentIndexStats(scopeRootId, signal),
    staleTime: 60_000,
    enabled: options?.enabled ?? true,
    ...options,
  });
}

/** Paged content index records for one root (`/api/files/content-index/records`). */
export function useFilesContentIndexRecordsQuery(
  params: FilesContentIndexRecordsParams | null,
  options?: QueryOpts<
    import("../../../../../types/files").FilesContentIndexRecordsPayload
  >,
) {
  const scopedParams = params
    ? { ...params, rootId: params.rootId || FILES_GLOBAL_SCOPE_ID }
    : null;
  return useQuery<
    import("../../../../../types/files").FilesContentIndexRecordsPayload,
    ApiError
  >({
    queryKey: filesKeys.contentIndexRecords(
      scopedParams ?? {
        rootId: FILES_GLOBAL_SCOPE_ID,
        status: "all",
        query: "",
        offset: 0,
      },
    ),
    queryFn: ({ signal }) =>
      getFilesContentIndexRecords(
        scopedParams as FilesContentIndexRecordsParams,
        signal,
      ),
    staleTime: 30_000,
    enabled: Boolean(scopedParams?.rootId) && (options?.enabled ?? true),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Write hooks (File Manager / Workspace).
// Each wraps one transport fn from `../api/files.ts` and invalidates the whole
// `filesKeys` tree on success so browse/summary/search/read refresh.
// ---------------------------------------------------------------------------

/** Recycle-bin items for one root (`/api/files/trash`). */
export function useFilesTrashQuery(
  rootId: string | null,
  options?: QueryOpts<FilesTrashPayload>,
) {
  const scopeRootId = rootId || FILES_GLOBAL_SCOPE_ID;
  return useQuery<FilesTrashPayload, ApiError>({
    queryKey: filesKeys.trash(scopeRootId),
    queryFn: ({ signal }) => getFilesTrash(scopeRootId, signal),
    staleTime: 30_000,
    enabled: options?.enabled ?? true,
    ...options,
  });
}

/** PUT /api/files/content — overwrite file content (Workspace save). */
export function useWriteFileContentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: writeFileContent,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/versions/restore — restore one server-side file version. */
export function useRestoreFileVersionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreFileVersion,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** DELETE /api/files/versions — delete one server-side file version. */
export function useDeleteFileVersionMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteFileVersion,
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

/** POST /api/files/chmod — change POSIX permissions. */
export function useChmodFilesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: chmodFiles,
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

/** POST /api/files/transfer — execute a batch copy/move after dry-run. */
export function useTransferFilesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: transferFiles,
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

/** POST /api/files/trash/restore — restore one recycle-bin item. */
export function useRestoreFilesTrashMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: restoreFilesTrash,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** DELETE /api/files/trash — permanently remove selected recycle-bin items, or all when omitted. */
export function usePurgeFilesTrashMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: purgeFilesTrash,
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

/** POST /api/files/upload — upload one or more files (base64 bodies). */
export function useUploadFilesMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: uploadFiles,
    onSuccess: () => qc.invalidateQueries({ queryKey: filesKeys.all }),
  });
}

/** POST /api/files/content-index/scan — scan content-index validity. */
export function useScanFilesContentIndexMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: scanFilesContentIndex,
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: filesKeys.contentIndex(data.rootId),
      });
      void qc.invalidateQueries({ queryKey: filesKeys.all });
    },
  });
}

/** POST /api/files/content-index/clean — remove stale content-index records. */
export function useCleanFilesContentIndexMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cleanFilesContentIndex,
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: filesKeys.contentIndex(data.rootId),
      });
      void qc.invalidateQueries({ queryKey: filesKeys.all });
    },
  });
}

/** POST /api/files/content-index/rebuild — rebuild content-index records from real files under one root. */
export function useRebuildFilesContentIndexMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: rebuildFilesContentIndex,
    onSuccess: (data) => {
      void qc.invalidateQueries({
        queryKey: filesKeys.contentIndex(data.rootId),
      });
      void qc.invalidateQueries({ queryKey: filesKeys.all });
    },
  });
}
