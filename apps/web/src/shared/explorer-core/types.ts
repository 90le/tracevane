import type {
  FileBreadcrumb,
  FileEntrySummary,
  FileRootSummary,
  FilesDirectoryPayload,
  FilesMutationResponse,
} from "../../../../../types/files";
import type { EditorFileRef } from "@/shared/editor-core";

export type ExplorerPath = string;
export type ExplorerRootId = string;

export interface ExplorerLocation {
  rootId: ExplorerRootId;
  directoryPath: ExplorerPath;
}

export type ExplorerFileRef = EditorFileRef;

export interface ExplorerEntry extends FileEntrySummary {
  rootId: ExplorerRootId;
  parentPath: ExplorerPath;
  id: string;
  documentId: string;
}

export type ExplorerSortKey =
  | "name"
  | "size"
  | "modified"
  | "type"
  | "permissions"
  | "owner";

export type ExplorerSortDirection = "asc" | "desc";

export interface ExplorerSortState {
  key: ExplorerSortKey;
  direction: ExplorerSortDirection;
}

export interface ExplorerDirectoryOptions extends Partial<ExplorerLocation> {
  hidden?: boolean;
  page?: number;
  pageSize?: number;
  sort?: ExplorerSortState;
  enabled?: boolean;
}

export interface ExplorerDirectoryResult {
  location: ExplorerLocation;
  root: FileRootSummary | null;
  absolutePath: string;
  parentPath: ExplorerPath | null;
  breadcrumbs: FileBreadcrumb[];
  counts: FilesDirectoryPayload["counts"] | null;
  pagination: FilesDirectoryPayload["pagination"] | null;
  entries: ExplorerEntry[];
  checkedAt: string | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refresh: () => Promise<unknown>;
  raw: FilesDirectoryPayload | null;
}

export type ExplorerEntryKind = FileEntrySummary["kind"];

export type ExplorerFileType =
  | "directory"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "archive"
  | "code"
  | "text"
  | "document"
  | "binary";

export type ExplorerNodeKey = string;

export interface ExplorerTreeStateOptions {
  initialExpandedKeys?: Iterable<ExplorerNodeKey>;
  initialSelectedKeys?: Iterable<ExplorerNodeKey>;
  initialActiveKey?: ExplorerNodeKey | null;
}

export interface ExplorerTreeState {
  expandedKeys: ReadonlySet<ExplorerNodeKey>;
  selectedKeys: ReadonlySet<ExplorerNodeKey>;
  activeKey: ExplorerNodeKey | null;
  isExpanded: (key: ExplorerNodeKey) => boolean;
  isSelected: (key: ExplorerNodeKey) => boolean;
  expand: (key: ExplorerNodeKey) => void;
  collapse: (key: ExplorerNodeKey) => void;
  toggleExpanded: (key: ExplorerNodeKey) => void;
  setExpandedKeys: (keys: Iterable<ExplorerNodeKey>) => void;
  select: (key: ExplorerNodeKey, options?: { additive?: boolean }) => void;
  clearSelection: () => void;
  setActiveKey: (key: ExplorerNodeKey | null) => void;
  revealPath: (location: ExplorerLocation) => void;
  reset: () => void;
}

export interface ExplorerOpenTarget extends ExplorerFileRef {
  entry?: ExplorerEntry | FileEntrySummary;
}

export interface ExplorerTransferTarget {
  destinationRootId: ExplorerRootId;
  destinationDirectoryPath?: ExplorerPath;
  nextName?: string;
  overwrite?: boolean;
}

export interface ExplorerCommandOptions {
  onOpenFile?: (target: ExplorerOpenTarget) => void | Promise<void>;
  onAfterMutation?: (result: FilesMutationResponse) => void | Promise<void>;
}

export interface ExplorerCommands {
  openFile: (target: ExplorerOpenTarget) => Promise<void>;
  createDirectory: (
    location: ExplorerLocation,
    name: string,
  ) => Promise<FilesMutationResponse>;
  createFile: (
    location: ExplorerLocation,
    name: string,
    content?: string,
  ) => Promise<FilesMutationResponse>;
  rename: (
    target: ExplorerFileRef,
    nextName: string,
  ) => Promise<FilesMutationResponse>;
  copy: (
    target: ExplorerFileRef,
    destination: ExplorerTransferTarget,
  ) => Promise<FilesMutationResponse>;
  move: (
    target: ExplorerFileRef,
    destination: ExplorerTransferTarget,
  ) => Promise<FilesMutationResponse>;
  remove: (input: {
    rootId: ExplorerRootId;
    paths: ExplorerPath[];
    permanent?: boolean;
  }) => Promise<FilesMutationResponse>;
}
