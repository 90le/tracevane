import { joinApiPath, requestJson } from "../../shared/api";
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
  FilesTreePayload,
  FilesUnarchivePayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../../types/files";

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const raw = search.toString();
  return raw ? `?${raw}` : "";
}

export function fetchFilesSummary(): Promise<FilesSummaryPayload> {
  return requestJson<FilesSummaryPayload>("/api/files/summary");
}

export function browseDirectory(
  rootId: string,
  directoryPath = "",
  showHidden = true,
  options: {
    page?: number;
    pageSize?: number;
    sortKey?: "name" | "size" | "modifiedAt";
    sortDirection?: "asc" | "desc";
  } = {},
): Promise<FilesDirectoryPayload> {
  return requestJson<FilesDirectoryPayload>(
    `/api/files/browse${buildQuery({
      rootId,
      path: directoryPath,
      hidden: showHidden,
      page: options.page,
      pageSize: options.pageSize,
      sortKey: options.sortKey,
      sortDirection: options.sortDirection,
    })}`,
  );
}

export function fetchDirectoryTree(
  rootId: string,
  directoryPath = "",
  showHidden = true,
): Promise<FilesTreePayload> {
  return requestJson<FilesTreePayload>(
    `/api/files/tree${buildQuery({ rootId, path: directoryPath, hidden: showHidden })}`,
  );
}

export function readFileContent(rootId: string, filePath: string): Promise<FilesReadPayload> {
  return requestJson<FilesReadPayload>(
    `/api/files/read${buildQuery({ rootId, path: filePath })}`,
  );
}

export function searchFiles(
  rootId: string,
  query: string,
  directoryPath = "",
  recursive = true,
  showHidden = true,
): Promise<FilesSearchPayload> {
  return requestJson<FilesSearchPayload>(
    `/api/files/search${buildQuery({
      rootId,
      q: query,
      path: directoryPath,
      recursive,
      hidden: showHidden,
    })}`,
  );
}

export function createDirectory(payload: FilesCreateDirectoryPayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/directories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createFile(payload: FilesCreateFilePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function saveFileContent(payload: FilesWritePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/content", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function renamePath(payload: FilesRenamePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function copyPath(payload: FilesTransferPayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function movePath(payload: FilesTransferPayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deletePaths(payload: FilesDeletePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function uploadFiles(payload: FilesUploadPayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function archivePaths(payload: FilesArchivePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function unarchiveFile(payload: FilesUnarchivePayload): Promise<FilesMutationResponse> {
  return requestJson<FilesMutationResponse>("/api/files/unarchive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function buildFileDownloadUrl(
  rootId: string,
  filePath: string,
  options: { download?: boolean } = {},
): string {
  return joinApiPath(`/api/files/download${buildQuery({
    rootId,
    path: filePath,
    download: options.download ? 1 : undefined,
  })}`);
}

export function buildArchiveDownloadUrl(
  rootId: string,
  paths: string[],
  name?: string,
): string {
  const search = new URLSearchParams();
  if (rootId) search.set("rootId", rootId);
  for (const entryPath of paths) {
    if (entryPath) search.append("path", entryPath);
  }
  if (name) search.set("name", name);
  const raw = search.toString();
  return joinApiPath(`/api/files/download-archive${raw ? `?${raw}` : ""}`);
}
