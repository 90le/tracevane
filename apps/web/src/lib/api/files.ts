import { apiRequest } from "./client";
import type {
  FilesArchivePayload,
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesDirectoryPayload,
  FilesMutationResponse,
  FilesReadPayload,
  FilesRenamePayload,
  FilesSearchPayload,
  FilesSummaryPayload,
  FilesTransferPayload,
  FilesUnarchivePayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../../types/files";

/**
 * Typed transport bindings for the read slice of the Files HTTP API
 * (`apps/api/modules/files/routes.ts`) consumed by the read evidence surfaces:
 * the Workspace IDE read workbench (`/ide`) and the File & Git evidence browser
 * (`/files`).
 *
 * Bound here (read-only GET):
 *  - GET /api/files/summary  → file roots roster
 *  - GET /api/files/browse   → paged directory listing for one root + path
 *  - GET /api/files/read     → single file content (text-like only is useful)
 *  - GET /api/files/search   → recursive name/content search under a root
 *
 * Also bound here (write slice — Workspace IDE P1):
 *  - PUT  /api/files/content     → overwrite file content (IDE save)
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
}

/** GET /api/files/read — single file content + metadata. */
export function readFile(
  params: FilesReadParams,
  signal?: AbortSignal,
): Promise<FilesReadPayload> {
  const search = new URLSearchParams({ rootId: params.rootId, path: params.path });
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
  return apiRequest<FilesSearchPayload>(`${BASE}/search?${search.toString()}`, {
    signal,
  });
}

/**
 * Write bindings for the Files HTTP API. These let the Workspace IDE (and the
 * `/files` manager) perform real file CRUD against
 * `apps/api/modules/files/routes.ts`. Every mutation returns the shared
 * {@link FilesMutationResponse} envelope.
 *
 * Route paths are spelled out as full literals (not `${BASE}/...`) so that the
 * static source-assertion test in
 * `tests/system/web-files-api.test.mjs` can bind each function to its exact
 * HTTP contract by scanning this file.
 */

/** PUT /api/files/content — overwrite file content (IDE save). */
export function writeFileContent(
  payload: FilesWritePayload,
): Promise<FilesMutationResponse> {
  return apiRequest<FilesMutationResponse>("/api/files/content", {
    method: "PUT",
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
