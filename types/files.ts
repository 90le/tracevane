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
  mode: string;
  permissions: string;
  uid: number | null;
  gid: number | null;
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
  contentOffset: number;
  contentBytes: number;
  readLimitBytes: number;
  content: string | null;
  mode: string;
  permissions: string;
  uid: number | null;
  gid: number | null;
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
  caseSensitive?: boolean;
  regex?: boolean;
  error?: string;
  index?: {
    used: boolean;
    candidateCount: number;
    resultCount: number;
  };
  limit?: number;
  truncated?: boolean;
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

export interface FilesVersionItem {
  id: string;
  rootId: string;
  path: string;
  name: string;
  size: number;
  createdAt: string;
  sourceModifiedAt: string | null;
}

export interface FilesVersionsPayload {
  checkedAt: string;
  rootId: string;
  path: string;
  versions: FilesVersionItem[];
}

export interface FilesVersionReadPayload extends FilesVersionItem {
  content: string;
}

export interface FilesVersionRestorePayload {
  rootId: string;
  path: string;
  versionId: string;
}

export interface FilesVersionDeletePayload {
  rootId: string;
  path: string;
  versionId: string;
}


export interface FilesTransferPayload {
  sourceRootId: string;
  sourcePath: string;
  destinationRootId: string;
  destinationDirectoryPath?: string;
  nextName?: string;
  overwrite?: boolean;
}

export type FilesTransferConflictPolicy = "fail" | "overwrite" | "skip" | "rename";

export interface FilesTransferDryRunPayload {
  operation: "copy" | "move";
  sourceRootId: string;
  sourcePaths: string[];
  destinationRootId: string;
  destinationDirectoryPath?: string;
  /** Optional explicit destination basename. Only valid for a single source path. */
  nextName?: string;
  conflictPolicy?: FilesTransferConflictPolicy;
}

export interface FilesTransferDryRunItem {
  sourcePath: string;
  destinationPath: string | null;
  sourceKind: FileEntryKind | null;
  status: "ready" | "conflict" | "overwrite" | "skip" | "rename" | "error";
  message?: string;
}

export interface FilesTransferDryRunResponse {
  checkedAt: string;
  operation: "copy" | "move";
  sourceRootId: string;
  destinationRootId: string;
  destinationDirectoryPath: string;
  conflictPolicy: FilesTransferConflictPolicy;
  counts: {
    total: number;
    ready: number;
    conflicts: number;
    overwrite: number;
    skip: number;
    rename: number;
    errors: number;
  };
  items: FilesTransferDryRunItem[];
}

export interface FilesDeletePayload {
  rootId: string;
  paths: string[];
  /** Permanently remove instead of moving to the root recycle bin. */
  permanent?: boolean;
}



export interface FilesChmodPayload {
  rootId: string;
  paths: string[];
  mode: string;
  recursive?: boolean;
}

export interface FilesChmodDryRunItem {
  path: string;
  kind: FileEntryKind;
  currentMode: string;
  nextMode: string;
}

export interface FilesChmodDryRunResponse {
  checkedAt: string;
  rootId: string;
  mode: string;
  recursive: boolean;
  truncated: boolean;
  counts: {
    total: number;
    files: number;
    directories: number;
  };
  items: FilesChmodDryRunItem[];
}

export interface FilesTrashItem {
  id: string;
  rootId: string;
  originalPath: string;
  trashPath: string;
  name: string;
  kind: FileEntryKind;
  size: number | null;
  deletedAt: string;
  metadataPath: string;
}

export interface FilesTrashPayload {
  checkedAt: string;
  rootId: string;
  trashDirectoryPath: string;
  items: FilesTrashItem[];
}

export interface FilesTrashRestorePayload {
  rootId: string;
  trashPath: string;
  conflictPolicy?: FilesTransferConflictPolicy;
}

export interface FilesTrashPurgePayload {
  rootId: string;
  trashPaths?: string[];
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

export type FilesUploadConflictPolicy = "fail" | "overwrite" | "skip" | "rename";

export interface FilesUploadInitPayload {
  rootId: string;
  directoryPath?: string;
  fileName: string;
  relativePath?: string;
  size: number;
  chunkSize: number;
  overwrite?: boolean;
  conflictPolicy?: FilesUploadConflictPolicy;
  sha256?: string;
}

export interface FilesUploadInitResponse {
  uploadId: string;
  chunkSize: number;
  chunkCount: number;
  uploadedChunks: number[];
  targetPath: string;
  skipped?: boolean;
  instant?: boolean;
  conflictPolicy?: FilesUploadConflictPolicy;
}

export interface FilesUploadCompletePayload {
  uploadId: string;
}

export interface FilesUploadCancelPayload {
  uploadId: string;
}

export interface FilesArchivePayload {
  rootId: string;
  directoryPath?: string;
  paths: string[];
  name: string;
}

export interface FilesArchiveDryRunItem {
  sourcePath: string;
  sourceKind: FileEntryKind | null;
  status: "ready" | "error";
  message?: string;
}

export interface FilesArchiveDryRunResponse {
  checkedAt: string;
  rootId: string;
  directoryPath: string;
  archiveName: string;
  archivePath: string;
  archiveFormat: "zip" | "tar" | "gztar" | "bztar" | "xztar";
  destinationExists: boolean;
  counts: {
    total: number;
    ready: number;
    errors: number;
  };
  items: FilesArchiveDryRunItem[];
}

export interface FilesUnarchivePayload {
  rootId: string;
  archivePath: string;
  directoryPath?: string;
  destinationDirectoryPath?: string;
  conflictPolicy?: "fail" | "overwrite" | "skip" | "rename";
  overwriteConfirm?: string;
}

export interface FilesUnarchiveDryRunItem {
  entryPath: string;
  destinationPath: string | null;
  kind: FileEntryKind | null;
  status: "ready" | "conflict" | "overwrite" | "skip" | "rename" | "error";
  message?: string;
}

export interface FilesUnarchiveDryRunResponse {
  checkedAt: string;
  rootId: string;
  archivePath: string;
  destinationDirectoryPath: string;
  conflictPolicy: "fail" | "overwrite" | "skip" | "rename";
  counts: {
    total: number;
    ready: number;
    conflicts: number;
    overwrite: number;
    skip: number;
    rename: number;
    errors: number;
  };
  items: FilesUnarchiveDryRunItem[];
}

export interface FilesArchiveDownloadPayload {
  rootId: string;
  paths: string[];
  name?: string;
}



export interface FilesContentIndexRecordPreview {
  path: string;
  sha256: string;
  size: number;
  indexedAt: string | null;
  status: "valid" | "stale";
}


export interface FilesContentIndexRecordsParams {
  rootId: string;
  status?: "all" | "valid" | "stale";
  query?: string;
  offset?: number;
  limit?: number;
}

export interface FilesContentIndexRecordsPayload {
  checkedAt: string;
  rootId: string;
  status: "all" | "valid" | "stale";
  query: string;
  offset: number;
  limit: number;
  totalRecordCount: number;
  returnedRecordCount: number;
  hasMore: boolean;
  records: FilesContentIndexRecordPreview[];
}

export interface FilesContentIndexStatsPayload {
  checkedAt: string;
  rootId: string;
  shardCount: number;
  hashCount: number;
  recordCount: number;
  validRecordCount: number;
  staleRecordCount: number;
  indexedBytes: number;
  staleBytes: number;
  newestIndexedAt: string | null;
  storageDirectory: string;
  previewLimit: number;
  recordsPreview: FilesContentIndexRecordPreview[];
}

export interface FilesContentIndexActionPayload {
  rootId: string;
}

export interface FilesContentIndexActionResponse extends FilesContentIndexStatsPayload {
  cleanedRecordCount?: number;
}

export interface FilesContentIndexRebuildResponse extends FilesContentIndexActionResponse {
  scannedFileCount: number;
  rebuiltRecordCount: number;
  skippedFileCount: number;
  truncated: boolean;
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
    | "transfer"
    | "delete"
    | "chmod"
    | "restore-trash"
    | "purge-trash"
    | "restore-version"
    | "delete-version"
    | "upload";
  message: string;
  affectedPaths: string[];
}
