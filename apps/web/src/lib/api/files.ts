import { apiRequest } from "./client";
import type {
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSearchPayload,
  FilesSummaryPayload,
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
 * NOT bound here (out of scope — the Workspace IDE write track):
 *  - tree / download / archive routes (browse + search cover the read surfaces)
 *  - every mutating route (create/write/rename/copy/move/delete/upload/archive)
 *    — editing, writing, and committing belong to the future write track and are
 *    deliberately not surfaced here.
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
