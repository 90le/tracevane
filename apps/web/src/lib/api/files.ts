import { apiRequest } from "./client";
import { ApiError, normalizeApiError } from "./errors";
import type {
  FilesArchivePayload,
  FilesArchiveDryRunResponse,
  FilesChmodDryRunResponse,
  FilesChmodPayload,
  FilesContentIndexActionPayload,
  FilesContentIndexActionResponse,
  FilesContentIndexRecordsParams,
  FilesContentIndexRecordsPayload,
  FilesContentIndexRebuildResponse,
  FilesContentIndexRebuildJobPayload,
  FilesContentIndexStatsPayload,
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesDirectoryPayload,
  FilesMutationResponse,
  FilesReadPayload,
  FilesRenamePayload,
  FilesSearchPayload,
  FilesSummaryPayload,
  FilesTransferDryRunPayload,
  FilesTransferDryRunResponse,
  FilesTransferPayload,
  FilesVersionDeletePayload,
  FilesVersionReadPayload,
  FilesVersionRestorePayload,
  FilesVersionsPayload,
  FilesTrashPayload,
  FilesTrashPurgePayload,
  FilesTrashRestorePayload,
  FilesUploadCancelPayload,
  FilesUploadCompletePayload,
  FilesUnarchiveDryRunResponse,
  FilesUploadInitPayload,
  FilesUploadInitResponse,
  FilesUnarchivePayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../../types/files";

/**
 * Typed transport bindings for the read slice of the Files HTTP API
 * (`apps/api/modules/files/routes.ts`) consumed by File Manager, Workspace, and Chat file surfaces.
 *
 * Bound here (read-only GET):
 *  - GET /api/files/summary  → file roots roster
 *  - GET /api/files/browse   → paged directory listing for one root + path
 *  - GET /api/files/read     → single file content (text-like only is useful)
 *  - GET /api/files/search   → recursive name/content search under a root
 *
 * Also bound here (write slice — File Manager / Workspace):
 *  - PUT  /api/files/content     → overwrite file content
 *  - POST /api/files/directories → create directory
 *  - POST /api/files/files       → create file
 *  - POST /api/files/rename      → rename path
 *  - POST /api/files/copy        → copy path
 *  - POST /api/files/move        → move path
 *  - DELETE /api/files           → delete paths
 *  - POST /api/files/archive     → archive paths
 *  - POST /api/files/unarchive   → unarchive a single archive
 * All mutation endpoints return {@link FilesMutationResponse}.
 *
 * Response shapes come from the shared contract (`types/files.ts`).
 */

const BASE = "/api/files";

/** GET /api/files/summary — file roots roster + default root id. */
export function getFilesSummary(
  signal?: AbortSignal,
): Promise<FilesSummaryPayload> {
  return apiRequest<FilesSummaryPayload>(`${BASE}/summary`, { signal });
}

export interface FilesBrowseParams {
  rootId: string;
  /** Directory path relative to the root (empty = root). */
  path?: string;
  /** Include dotfiles / hidden entries (defaults to backend default). */
  hidden?: boolean;
  page?: number;
  pageSize?: number;
  sortKey?: "name" | "size" | "modifiedAt";
  sortDirection?: "asc" | "desc";
}

/** GET /api/files/browse — paged directory listing for a root + path. */
export function browseFiles(
  params: FilesBrowseParams,
  signal?: AbortSignal,
): Promise<FilesDirectoryPayload> {
  const search = new URLSearchParams({ rootId: params.rootId });
  if (params.path) search.set("path", params.path);
  if (params.hidden != null) search.set("hidden", params.hidden ? "true" : "false");
  if (params.page != null) search.set("page", String(params.page));
  if (params.pageSize != null) search.set("pageSize", String(params.pageSize));
  if (params.sortKey) search.set("sortKey", params.sortKey);
  if (params.sortDirection) search.set("sortDirection", params.sortDirection);
  return apiRequest<FilesDirectoryPayload>(`${BASE}/browse?${search.toString()}`, {
    signal,
  });
}

export interface FilesReadParams {
  rootId: string;
  /** File path relative to the root. */
  path: string;
  /** Byte offset for large text preview slices. */
  offset?: number;
  /** Max bytes to read for this slice. */
  limit?: number;
}

/** GET /api/files/read — single file content + metadata. */
export function readFile(
  params: FilesReadParams,
  signal?: AbortSignal,
): Promise<FilesReadPayload> {
  const search = new URLSearchParams({ rootId: params.rootId, path: params.path });
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.limit != null) search.set("limit", String(params.limit));
  return apiRequest<FilesReadPayload>(`${BASE}/read?${search.toString()}`, {
    signal,
  });
}

export interface FilesSearchParams {
  rootId: string;
  /** Free-text query (matched against name + content by the backend). */
  query: string;
  /** Directory path to scope the search under (empty = root). */
  path?: string;
  /** Recurse into subdirectories (defaults to backend default = true). */
  recursive?: boolean;
  /** Include dotfiles / hidden entries (defaults to backend default). */
  hidden?: boolean;
  /** Match case exactly for name/content search. */
  caseSensitive?: boolean;
  /** Treat query as a JavaScript regular expression. */
  regex?: boolean;
  /** Safe result limit for this search request. */
  limit?: number;
}

/** GET /api/files/search — recursive name/content search under a root. */
export function searchFiles(
  params: FilesSearchParams,
  signal?: AbortSignal,
): Promise<FilesSearchPayload> {
  const search = new URLSearchParams({ rootId: params.rootId, q: params.query });
  if (params.path) search.set("path", params.path);
  if (params.recursive != null) search.set("recursive", params.recursive ? "true" : "false");
  if (params.hidden != null) search.set("hidden", params.hidden ? "true" : "false");
  if (params.caseSensitive != null) search.set("caseSensitive", params.caseSensitive ? "true" : "false");
  if (params.regex != null) search.set("regex", params.regex ? "true" : "false");
  if (params.limit != null) search.set("limit", String(params.limit));
  return apiRequest<FilesSearchPayload>(`${BASE}/search?${search.toString()}`, {
    signal,
  });
}


/** GET /api/files/content-index — content index stats for one root. */
export function getFilesContentIndexStats(
  rootId: string,
  signal?: AbortSignal,
): Promise<FilesContentIndexStatsPayload> {
  const search = new URLSearchParams({ rootId });
  return apiRequest<FilesContentIndexStatsPayload>(`${BASE}/content-index?${search.toString()}`, { signal });
}

/** GET /api/files/content-index/records — paged content index records for one root. */
export function getFilesContentIndexRecords(
  params: FilesContentIndexRecordsParams,
  signal?: AbortSignal,
): Promise<FilesContentIndexRecordsPayload> {
  const search = new URLSearchParams({ rootId: params.rootId });
  if (params.status) search.set("status", params.status);
  if (params.query) search.set("query", params.query);
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.cursor) search.set("cursor", params.cursor);
  return apiRequest<FilesContentIndexRecordsPayload>(`${BASE}/content-index/records?${search.toString()}`, { signal });
}

/** POST /api/files/content-index/scan — scan content index validity for one root. */
export function scanFilesContentIndex(
  payload: FilesContentIndexActionPayload,
): Promise<FilesContentIndexStatsPayload> {
  return apiRequest<FilesContentIndexStatsPayload>("/api/files/content-index/scan", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/content-index/clean — remove stale index records for one root. */
export function cleanFilesContentIndex(
  payload: FilesContentIndexActionPayload,
): Promise<FilesContentIndexActionResponse> {
  return apiRequest<FilesContentIndexActionResponse>("/api/files/content-index/clean", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/content-index/rebuild — rebuild the content index by scanning real files under one root. */
export function rebuildFilesContentIndex(
  payload: FilesContentIndexActionPayload,
): Promise<FilesContentIndexRebuildResponse> {
  return apiRequest<FilesContentIndexRebuildResponse>("/api/files/content-index/rebuild", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/content-index/rebuild-jobs — start a non-blocking rebuild job. */
export function startFilesContentIndexRebuildJob(
  payload: FilesContentIndexActionPayload,
): Promise<FilesContentIndexRebuildJobPayload> {
  return apiRequest<FilesContentIndexRebuildJobPayload>("/api/files/content-index/rebuild-jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** GET /api/files/content-index/rebuild-jobs — poll one rebuild job. */
export function getFilesContentIndexRebuildJob(jobId: string, signal?: AbortSignal): Promise<FilesContentIndexRebuildJobPayload> {
  const search = new URLSearchParams({ jobId });
  return apiRequest<FilesContentIndexRebuildJobPayload>(`/api/files/content-index/rebuild-jobs?${search.toString()}`, { signal });
}

/**
 * Write bindings for the Files HTTP API. These let File Manager and Workspace surfaces perform real file CRUD against
 * `apps/api/modules/files/routes.ts`. Every mutation returns the shared
 * {@link FilesMutationResponse} envelope.
 *
 * Route paths are spelled out as full literals (not `${BASE}/...`) so that the
 * static source-assertion test in
 * `tests/system/web-files-api.test.mjs` can bind each function to its exact
 * HTTP contract by scanning this file.
 */

/** PUT /api/files/content — overwrite file content (Workspace save). */
export function writeFileContent(
  payload: FilesWritePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/content", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** GET /api/files/versions — list server-side file versions for one file. */
export function getFileVersions(rootId: string, path: string, signal?: AbortSignal): Promise<FilesVersionsPayload> {
  const search = new URLSearchParams({ rootId, path });
  return apiRequest<FilesVersionsPayload>(`/api/files/versions?${search.toString()}`, { signal });
}

/** GET /api/files/versions/read — read one server-side file version content. */
export function readFileVersion(rootId: string, path: string, versionId: string, signal?: AbortSignal): Promise<FilesVersionReadPayload> {
  const search = new URLSearchParams({ rootId, path, versionId });
  return apiRequest<FilesVersionReadPayload>(`/api/files/versions/read?${search.toString()}`, { signal });
}

/** POST /api/files/versions/restore — restore one server-side file version to disk. */
export function restoreFileVersion(payload: FilesVersionRestorePayload): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/versions/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/files/versions — delete one server-side file version. */
export function deleteFileVersion(payload: FilesVersionDeletePayload): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/versions", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/directories — create a directory. */
export function createDirectory(
  payload: FilesCreateDirectoryPayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/directories", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/files — create a file. */
export function createFile(
  payload: FilesCreateFilePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/files", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/rename — rename a path. */
export function renameFile(
  payload: FilesRenamePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/rename", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


/** POST /api/files/chmod/dry-run — preview permission changes. */
export function dryRunChmodFiles(payload: FilesChmodPayload): Promise<FilesChmodDryRunResponse> {
  return apiRequest<FilesChmodDryRunResponse>("/api/files/chmod/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/chmod — change POSIX permissions for files/directories. */
export function chmodFiles(payload: FilesChmodPayload): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/chmod", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/copy — copy a path. */
export function dryRunFileTransfer(
  payload: FilesTransferDryRunPayload,
): Promise<FilesTransferDryRunResponse> {
  return apiRequest<FilesTransferDryRunResponse>("/api/files/transfer/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/transfer — execute bulk copy/move with the same conflict policy as dry-run. */
export function transferFiles(
  payload: FilesTransferDryRunPayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/transfer", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/copy — copy a path. */
export function copyFile(
  payload: FilesTransferPayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/copy", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/move — move a path. */
export function moveFile(
  payload: FilesTransferPayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/move", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/files — delete paths. */
export function deleteFiles(
  payload: FilesDeletePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}


/** GET /api/files/trash — list recycle-bin items for one root. */
export function getFilesTrash(
  rootId: string,
  signal?: AbortSignal,
  options?: { offset?: number; limit?: number; cursor?: string },
): Promise<FilesTrashPayload> {
  const search = new URLSearchParams({ rootId });
  if (options?.offset != null) search.set("offset", String(options.offset));
  if (options?.limit != null) search.set("limit", String(options.limit));
  if (options?.cursor) search.set("cursor", options.cursor);
  return apiRequest<FilesTrashPayload>(`/api/files/trash?${search.toString()}`, { signal });
}

export function maintainFilesSqlite(payload: { vacuum?: boolean }): Promise<import("../../../../../types/files").FilesSqliteMaintenancePayload> {
  return apiRequest<import("../../../../../types/files").FilesSqliteMaintenancePayload>("/api/files/sqlite/maintenance", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/trash/restore — restore one recycle-bin item. */
export function restoreFilesTrash(payload: FilesTrashRestorePayload): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/trash/restore", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** DELETE /api/files/trash — permanently remove selected recycle-bin items, or all when omitted. */
export function purgeFilesTrash(payload: FilesTrashPurgePayload): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/trash", {
    method: "DELETE",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/archive/dry-run — validate archive target and sources without writing. */
export function dryRunArchiveFiles(
  payload: FilesArchivePayload,
): Promise<FilesArchiveDryRunResponse> {
  return apiRequest<FilesArchiveDryRunResponse>("/api/files/archive/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/archive — archive paths into a single archive. */
export function archiveFiles(
  payload: FilesArchivePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/archive", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/unarchive — unarchive a single archive. */
export function dryRunUnarchiveFile(
  payload: FilesUnarchivePayload,
): Promise<FilesUnarchiveDryRunResponse> {
  return apiRequest<FilesUnarchiveDryRunResponse>("/api/files/unarchive/dry-run", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/unarchive — unarchive a single archive. */
export function unarchiveFile(
  payload: FilesUnarchivePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/unarchive", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/** POST /api/files/upload — upload one or more files (base64 bodies). */
export function uploadFiles(
  payload: FilesUploadPayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/upload", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface UploadFilesProgress {
  loaded: number;
  total: number;
}

export interface UploadChunkProgress {
  loaded: number;
  total: number;
}

/** POST /api/files/uploads/init — initialize a resumable binary upload. */
export function initFileUpload(
  payload: FilesUploadInitPayload,
  signal?: AbortSignal,
): Promise<FilesUploadInitResponse> {
  return apiRequest<FilesUploadInitResponse>("/api/files/uploads/init", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

/** GET /api/files/uploads/:uploadId — fetch resumable upload status. */
export function getFileUpload(uploadId: string): Promise<FilesUploadInitResponse> {
  return apiRequest<FilesUploadInitResponse>(
    `/api/files/uploads/${encodeURIComponent(uploadId)}`,
  );
}

/** PUT /api/files/uploads/:uploadId/chunks/:chunkIndex — upload one binary chunk. */
export function uploadFileChunk(
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  onProgress?: (progress: UploadChunkProgress) => void,
  signal?: AbortSignal,
): Promise<FilesUploadInitResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "PUT",
      `/api/files/uploads/${encodeURIComponent(uploadId)}/chunks/${chunkIndex}`,
    );
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        parsed = xhr.responseText;
      }
      const normalized = normalizeApiError(xhr.status, parsed);
      if (normalized) {
        reject(new ApiError(xhr.status, normalized));
        return;
      }
      resolve(parsed as FilesUploadInitResponse);
    };
    xhr.onerror = () => reject(new Error("Upload chunk network error"));
    xhr.onabort = () => reject(new DOMException("Upload chunk aborted", "AbortError"));
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", onAbort);
    xhr.send(chunk);
  });
}

/** POST /api/files/uploads/complete — finalize a resumable binary upload. */
export function completeFileUpload(
  payload: FilesUploadCompletePayload,
  signal?: AbortSignal,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/uploads/complete", {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
}

/** DELETE /api/files/uploads — cancel a resumable binary upload and remove temp chunks. */
export function cancelFileUpload(
  payload: FilesUploadCancelPayload,
  signal?: AbortSignal,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/uploads", {
    method: "DELETE",
    body: JSON.stringify(payload),
    signal,
  });
}

/** POST /api/files/upload with native XHR upload progress events. */
export function uploadFilesWithProgress(
  payload: FilesUploadPayload,
  onProgress?: (progress: UploadFilesProgress) => void,
  signal?: AbortSignal,
): Promise<FilesMutationResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const body = JSON.stringify(payload);
    xhr.open("POST", "/api/files/upload");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => {
      let parsed: unknown;
      try {
        parsed = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        parsed = xhr.responseText;
      }
      const normalized = normalizeApiError(xhr.status, parsed);
      if (normalized) {
        reject(new ApiError(xhr.status, normalized));
        return;
      }
      resolve(parsed as FilesMutationResponse);
    };
    xhr.onerror = () => reject(new Error("Upload network error"));
    xhr.onabort = () => reject(new DOMException("Upload aborted", "AbortError"));
    const onAbort = () => xhr.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener("abort", onAbort);
    xhr.send(body);
  });
}
