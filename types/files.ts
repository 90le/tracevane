export type FileEntryKind = "file" | "directory";

export interface FileRootSummary {
  id: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  absolutePath: string;
  preferred?: boolean;
}

export interface FileBreadcrumb {
  path: string;
  label: string;
}

export interface FileEntrySummary {
  path: string;
  name: string;
  kind: FileEntryKind;
  ext: string | null;
  size: number | null;
  modifiedAt: string | null;
  hidden: boolean;
  textLike: boolean;
  imageLike: boolean;
}

export interface FilesSummaryPayload {
  checkedAt: string;
  roots: FileRootSummary[];
  defaultRootId: string;
}

export interface FilesDirectoryPayload {
  checkedAt: string;
  rootId: string;
  root: FileRootSummary;
  directoryPath: string;
  absolutePath: string;
  parentPath: string | null;
  breadcrumbs: FileBreadcrumb[];
  counts: {
    directories: number;
    files: number;
    hidden: number;
    total: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
    totalEntries: number;
    startIndex: number;
    endIndex: number;
  };
  entries: FileEntrySummary[];
}

export interface FileTreeNodePayload {
  path: string;
  name: string;
}

export interface FilesTreePayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  children: FileTreeNodePayload[];
}

export interface FilesReadPayload {
  checkedAt: string;
  rootId: string;
  path: string;
  absolutePath: string;
  name: string;
  ext: string | null;
  size: number;
  modifiedAt: string | null;
  mimeType: string;
  textLike: boolean;
  imageLike: boolean;
  editable: boolean;
  truncated: boolean;
  content: string | null;
}

export interface FileSearchResult extends FileEntrySummary {
  directoryPath: string;
  matchKind?: "name" | "content";
  snippet?: string | null;
}

export interface FilesSearchPayload {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  query: string;
  recursive: boolean;
  results: FileSearchResult[];
}

export interface FilesCreateDirectoryPayload {
  rootId: string;
  directoryPath?: string;
  name: string;
}

export interface FilesCreateFilePayload {
  rootId: string;
  directoryPath?: string;
  name: string;
  content?: string;
  overwrite?: boolean;
}

export interface FilesWritePayload {
  rootId: string;
  path: string;
  content: string;
}

export interface FilesRenamePayload {
  rootId: string;
  path: string;
  nextName: string;
}

export interface FilesTransferPayload {
  sourceRootId: string;
  sourcePath: string;
  destinationRootId: string;
  destinationDirectoryPath?: string;
  nextName?: string;
  overwrite?: boolean;
}

export interface FilesDeletePayload {
  rootId: string;
  paths: string[];
}

export interface FilesUploadItemPayload {
  fileName: string;
  relativePath?: string;
  dataBase64: string;
  overwrite?: boolean;
}

export interface FilesUploadPayload {
  rootId: string;
  directoryPath?: string;
  files: FilesUploadItemPayload[];
}

export interface FilesArchivePayload {
  rootId: string;
  directoryPath?: string;
  paths: string[];
  name: string;
}

export interface FilesUnarchivePayload {
  rootId: string;
  archivePath: string;
  directoryPath?: string;
  destinationDirectoryPath?: string;
}

export interface FilesArchiveDownloadPayload {
  rootId: string;
  paths: string[];
  name?: string;
}

export interface FilesMutationResponse {
  success: boolean;
  action:
    | "create-directory"
    | "create-file"
    | "archive"
    | "unarchive"
    | "write"
    | "rename"
    | "copy"
    | "move"
    | "delete"
    | "upload";
  message: string;
  affectedPaths: string[];
}
