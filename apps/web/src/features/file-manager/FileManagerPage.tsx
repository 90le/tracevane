import * as React from "react";
import { Search, Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import {
  filesKeys,
  useFilesBrowseQuery,
  useFilesSummaryQuery,
} from "@/lib/query/files";
import { toast } from "@/design/ui/sonner";
import {
  OperationHistoryPanel,
  createOperationRecord,
  loadFileOperationRecords,
  storeFileOperationRecords,
  MAX_OPERATION_RECORDS,
  type FileOperationRecord,
} from "./OperationHistoryPanel";
import {
  createUploadBatch,
  type UploadBatchHandle,
  type UploadJob,
} from "@/features/file-manager/file-tools/uploadManager";
import {
  collectUploadFilesFromDataTransfer,
  hasFileDrag,
  mergeUploadFiles,
  uploadFilesClipboardFingerprint,
} from "@/features/file-manager/file-tools/uploadInputs";
import {
  FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY,
  loadUploadTaskSnapshots,
  saveUploadTaskSnapshots,
  snapshotsFromUploadJobs,
} from "@/features/file-manager/file-tools/uploadTaskSnapshots";
import {
  FileManagerHeader,
  FileManagerNavigationBar,
  type FileManagerBookmarkItem,
  type FileManagerDirectoryTab,
  type FileManagerLocation,
  type FileManagerViewMode,
} from "./FileManagerChrome";
import { FilePropertiesDialog } from "./FilePropertiesDialog";
import type { FileManagerDialog } from "./FileManagerActionDialog";
import { FileManagerSearchPanel } from "./FileManagerSearchPanel";
import type { FileSearchResult } from "../../../../../types/files";

const LazyContentIndexManager = React.lazy(() =>
  import("./ContentIndexManager").then((module) => ({
    default: module.ContentIndexManager,
  })),
);
const LazyTrashManager = React.lazy(() =>
  import("./TrashManager").then((module) => ({ default: module.TrashManager })),
);
const LazyFileOnlineEditorDialog = React.lazy(() =>
  import("./online-editor/FileOnlineEditorDialog").then((module) => ({
    default: module.FileOnlineEditorDialog,
  })),
);
const LazyUploadManagerDialog = React.lazy(() =>
  import("@/features/file-manager/file-tools/UploadManagerDialog").then(
    (module) => ({
      default: module.UploadManagerDialog,
    }),
  ),
);
const LazyFileManagerActionDialog = React.lazy(() =>
  import("./FileManagerActionDialog").then((module) => ({
    default: module.FileManagerActionDialog,
  })),
);
import {
  BulkActionBar,
  FILE_MANAGER_DEFAULT_COLUMN_WIDTHS,
  FILE_MANAGER_DEFAULT_COLUMNS,
  FileListPanel,
  sortFileEntries,
  type FileManagerColumnWidths,
  type FileManagerDisplayMode,
  type FileManagerListColumn,
  type FileManagerListDensity,
  type FileManagerSortState,
} from "./FileManagerList";
import {
  FileActionsMenu,
  type FileActionsMenuTarget,
} from "@/features/file-manager/file-tools/FileActionsMenu";
import { UploadTaskStrip } from "@/features/file-manager/file-tools/UploadTaskStrip";
import { useFileOperations } from "@/features/file-manager/file-tools/fileOperations";
import type {
  FileEntrySummary,
  FilesUploadConflictPolicy,
} from "@/features/file-manager/file-tools/types";
import { createFileOnlineEditorTab } from "./online-editor/FileOnlineEditorDialog";
import type {
  FileOnlineEditorReadMetadata,
  FileOnlineEditorTab,
  FileOnlineEditorWindowMode,
} from "./online-editor/FileOnlineEditorDialog";
import type { CodeEditorViewState } from "./code-editor/CodeEditor";

const PAGE_SIZE = 240;
const RECENT_PATHS_STORAGE_KEY = "tracevane:file-manager:recent-paths";
const FAVORITE_PATHS_STORAGE_KEY = "tracevane:file-manager:favorite-paths";
const DIRECTORY_TABS_STORAGE_KEY = "tracevane:file-manager:directory-tabs:v2";
const VIEW_PREFERENCES_STORAGE_KEY = "tracevane:file-manager:view-preferences";
const FILE_MANAGER_SESSION_STORAGE_KEY =
  "tracevane:file-manager:session-state:v1";
const MAX_RECENT_PATHS = 8;
const MAX_FAVORITE_BOOKMARK_ITEMS = 200;
const MAX_DIRECTORY_TABS = 12;
const MAX_PATH_SUGGESTIONS = 8;

interface FileManagerViewPreferences {
  sort: FileManagerSortState;
  density: FileManagerListDensity;
  columns: FileManagerListColumn[];
  displayMode: FileManagerDisplayMode;
  columnWidths: FileManagerColumnWidths;
}

interface FileManagerSessionState {
  rootId?: string;
  directoryPath?: string;
  activeDirectoryTabId?: string;
  showHidden?: boolean;
  viewMode?: FileManagerViewMode;
  filterText?: string;
}

interface UploadDialogState {
  open: boolean;
  targetDirectory: string;
  files: File[];
  conflictPolicy: FilesUploadConflictPolicy;
}

interface FileClipboardState {
  operation: "copy" | "move";
  paths: string[];
}

export function FileManagerPage() {
  const queryClient = useQueryClient();
  const ops = useFileOperations();
  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];
  const defaultRootId = summary.data?.defaultRootId ?? roots[0]?.id ?? "";
  const [sessionStateLoaded] = React.useState(() =>
    loadFileManagerSessionState(),
  );
  const initialTabSeed = React.useMemo(
    () => createInitialDirectoryTab(sessionStateLoaded, defaultRootId),
    [defaultRootId, sessionStateLoaded],
  );
  const [activeDirectoryTabId, setActiveDirectoryTabId] = React.useState(
    () => sessionStateLoaded.activeDirectoryTabId ?? initialTabSeed.id,
  );
  const [rootId, setRootId] = React.useState(() => initialTabSeed.rootId);
  const [directoryPath, setDirectoryPath] = React.useState(
    () => initialTabSeed.directoryPath,
  );
  const [pathInput, setPathInput] = React.useState("");
  const [selectedPath, setSelectedPath] = React.useState<string | undefined>();
  const [selectedPaths, setSelectedPaths] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [lastSelectedPath, setLastSelectedPath] = React.useState<
    string | undefined
  >();
  const [showHidden, setShowHidden] = React.useState(
    () => sessionStateLoaded.showHidden ?? false,
  );
  const [page, setPage] = React.useState(1);
  const [entries, setEntries] = React.useState<FileEntrySummary[]>([]);
  const [filterText, setFilterText] = React.useState(
    () => sessionStateLoaded.filterText ?? "",
  );
  const [viewPreferences, setViewPreferences] =
    React.useState<FileManagerViewPreferences>(() =>
      loadFileManagerViewPreferences(),
    );
  const [viewMode, setViewMode] = React.useState<FileManagerViewMode>(
    () => sessionStateLoaded.viewMode ?? "files",
  );
  const [menu, setMenu] = React.useState<{
    x: number;
    y: number;
    target: FileActionsMenuTarget | null;
  } | null>(null);
  const [onlineEditorTabs, setOnlineEditorTabs] = React.useState<FileOnlineEditorTab[]>([]);
  const [activeOnlineEditorTabId, setActiveOnlineEditorTabId] = React.useState<
    string | undefined
  >();
  const [onlineEditorOpen, setOnlineEditorOpen] = React.useState(false);
  const [onlineEditorWindowMode, setOnlineEditorWindowMode] =
    React.useState<FileOnlineEditorWindowMode>("normal");
  const [onlineEditorDrafts, setOnlineEditorDrafts] = React.useState<Record<string, string>>({});
  const [onlineEditorViewStates, setOnlineEditorViewStates] = React.useState<
    Record<string, CodeEditorViewState>
  >({});
  const [onlineEditorReadMetadata, setOnlineEditorReadMetadata] = React.useState<
    Record<string, FileOnlineEditorReadMetadata>
  >({});
  React.useEffect(() => {
    setOnlineEditorDrafts((current) => {
      const liveIds = new Set(onlineEditorTabs.map((tab) => tab.id));
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, content] of Object.entries(current)) {
        if (liveIds.has(id)) next[id] = content;
        else changed = true;
      }
      return changed ? next : current;
    });
    setOnlineEditorViewStates((current) => {
      const liveIds = new Set(onlineEditorTabs.map((tab) => tab.id));
      let changed = false;
      const next: Record<string, CodeEditorViewState> = {};
      for (const [id, viewState] of Object.entries(current)) {
        if (liveIds.has(id)) next[id] = viewState;
        else changed = true;
      }
      return changed ? next : current;
    });
    setOnlineEditorReadMetadata((current) => {
      const liveIds = new Set(onlineEditorTabs.map((tab) => tab.id));
      let changed = false;
      const next: Record<string, FileOnlineEditorReadMetadata> = {};
      for (const [id, metadata] of Object.entries(current)) {
        if (liveIds.has(id)) next[id] = metadata;
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [onlineEditorTabs]);

  React.useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(onlineEditorDrafts).length === 0) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [onlineEditorDrafts]);

  const [propertiesTarget, setPropertiesTarget] = React.useState<
    FileEntrySummary | undefined
  >();
  const [dialog, setDialog] = React.useState<FileManagerDialog>(null);
  const [fileClipboard, setFileClipboard] =
    React.useState<FileClipboardState | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const uploadHandleRef = React.useRef<UploadBatchHandle | null>(null);
  const [uploadJobs, setUploadJobs] = React.useState<UploadJob[]>([]);
  const [uploadSnapshots, setUploadSnapshots] = React.useState(() =>
    loadUploadTaskSnapshots(FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY),
  );
  const [uploadDialog, setUploadDialog] = React.useState<UploadDialogState>({
    open: false,
    targetDirectory: "",
    files: [],
    conflictPolicy: "rename",
  });
  const [recentLocations, setRecentLocations] = React.useState<
    FileManagerLocation[]
  >(() => loadRecentFileManagerLocations());
  const [favoriteTree, setFavoriteTree] = React.useState<
    FileManagerBookmarkItem[]
  >(() => loadFavoriteBookmarkTree());
  const [directoryTabs, setDirectoryTabs] = React.useState<
    FileManagerDirectoryTab[]
  >(() => loadDirectoryTabLocations(initialTabSeed));
  const [pathSuggestionsOpen, setPathSuggestionsOpen] = React.useState(false);
  const [activePathSuggestionIndex, setActivePathSuggestionIndex] =
    React.useState(0);
  const [operationRecords, setOperationRecords] = React.useState<
    FileOperationRecord[]
  >(() => loadFileOperationRecords());
  const [dragUploadActive, setDragUploadActive] = React.useState(false);
  const dragDepthRef = React.useRef(0);
  const lastGoodLocationRef = React.useRef<FileManagerLocation | null>(null);
  const quickPasteUploadRef = React.useRef<{ key: string; at: number } | null>(
    null,
  );
  const fileManagerFilterRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (!roots.length) return;
    const savedRootAvailable = roots.some((item) => item.id === rootId);
    if (!rootId || !savedRootAvailable) {
      setRootId(defaultRootId);
      setDirectoryPath("");
      setDirectoryTabs((prev) => {
        const repaired = normalizeDirectoryTabs(prev).map((tab) =>
          tab.id === activeDirectoryTabId
            ? {
                ...tab,
                rootId: defaultRootId,
                directoryPath: "",
                label: labelForDirectoryTab(roots, defaultRootId, ""),
              }
            : tab,
        );
        storeDirectoryTabLocations(repaired);
        return repaired;
      });
    }
  }, [activeDirectoryTabId, defaultRootId, rootId, roots]);

  React.useEffect(() => {
    storeFileManagerSessionState({
      rootId,
      directoryPath,
      activeDirectoryTabId,
      showHidden,
      viewMode,
      filterText,
    });
  }, [
    activeDirectoryTabId,
    directoryPath,
    filterText,
    rootId,
    showHidden,
    viewMode,
  ]);

  React.useEffect(() => {
    const normalized = normalizeDirectoryTabs(directoryTabs);
    const active = normalized.find((tab) => tab.id === activeDirectoryTabId);
    if (active) return;
    const fallback =
      normalized[0] ?? createDirectoryTab(defaultRootId || rootId, "", roots);
    setDirectoryTabs([fallback]);
    storeDirectoryTabLocations([fallback]);
    setActiveDirectoryTabId(fallback.id);
    setRootId(fallback.rootId);
    setDirectoryPath(fallback.directoryPath);
  }, [activeDirectoryTabId, defaultRootId, directoryTabs, rootId, roots]);

  React.useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  React.useEffect(() => {
    if (!uploadJobs.length) return;
    const snapshots = snapshotsFromUploadJobs(uploadJobs);
    setUploadSnapshots(snapshots);
    saveUploadTaskSnapshots(FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY, snapshots);
  }, [uploadJobs]);

  React.useEffect(() => {
    setPage(1);
    setEntries([]);
    setSelectedPaths(new Set());
    setSelectedPath(undefined);
    setLastSelectedPath(undefined);
    setPropertiesTarget(undefined);
  }, [rootId, directoryPath, showHidden]);

  const browse = useFilesBrowseQuery(
    rootId
      ? {
          rootId,
          path: directoryPath,
          hidden: showHidden,
          page,
          pageSize: PAGE_SIZE,
        }
      : null,
  );

  React.useEffect(() => {
    if (!browse.data) return;
    const nextLocation = {
      rootId: browse.data.rootId,
      directoryPath: browse.data.directoryPath,
      label: browse.data.absolutePath,
    };
    lastGoodLocationRef.current = nextLocation;
    if (browse.data.pagination.page <= 1) {
      setRecentLocations((prev) =>
        rememberFileManagerLocation(prev, nextLocation),
      );
    }
    setEntries((prev) => {
      if (browse.data.pagination.page <= 1) return browse.data.entries;
      const seen = new Set(prev.map((entry) => entry.path));
      return [
        ...prev,
        ...browse.data.entries.filter((entry) => !seen.has(entry.path)),
      ];
    });
  }, [browse.data]);

  const refresh = React.useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: filesKeys.all });
  }, [queryClient]);

  const pushOperationRecord = React.useCallback(
    (record: FileOperationRecord) => {
      setOperationRecords((prev) => {
        const next = [record, ...prev].slice(0, MAX_OPERATION_RECORDS);
        storeFileOperationRecords(next);
        return next;
      });
    },
    [],
  );

  const root = roots.find((entry) => entry.id === rootId);
  const displayPath = React.useMemo(
    () => absoluteDisplayPath(root?.absolutePath, directoryPath),
    [directoryPath, root?.absolutePath],
  );
  const pagination = browse.data?.pagination;
  const counts = browse.data?.counts;
  const breadcrumbs = browse.data?.breadcrumbs ?? [{ path: "", label: "root" }];
  const parentPath = browse.data?.parentPath ?? null;
  const canLoadMore = Boolean(
    pagination && pagination.page < pagination.totalPages,
  );

  React.useEffect(() => {
    setPathInput(displayPath);
  }, [displayPath]);

  const filteredEntries = React.useMemo(() => {
    const query = filterText.trim().toLowerCase();
    const visibleEntries = query
      ? entries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(query) ||
            entry.path.toLowerCase().includes(query),
        )
      : entries;
    return sortFileEntries(visibleEntries, viewPreferences.sort);
  }, [entries, filterText, viewPreferences.sort]);

  const allVisibleSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((entry) => selectedPaths.has(entry.path));

  const updateViewPreferences = React.useCallback(
    (patch: Partial<FileManagerViewPreferences>) => {
      setViewPreferences((prev) => {
        const next = { ...prev, ...patch };
        storeFileManagerViewPreferences(next);
        return next;
      });
    },
    [],
  );
  const currentLocation = React.useMemo<FileManagerLocation>(
    () => ({ rootId, directoryPath, label: displayPath }),
    [directoryPath, displayPath, rootId],
  );
  const favoriteBookmarkLocations = React.useMemo(
    () => flattenFavoriteBookmarkLocations(favoriteTree),
    [favoriteTree],
  );
  const favoriteCount = React.useMemo(
    () => countFavoriteBookmarks(favoriteTree),
    [favoriteTree],
  );
  const quickLocations = React.useMemo(
    () => buildQuickLocations(favoriteBookmarkLocations, recentLocations),
    [favoriteBookmarkLocations, recentLocations],
  );
  const quickLocationViews = React.useMemo(
    () =>
      quickLocations.map((location) => ({
        ...location,
        favorited: favoriteBookmarkLocations.some((item) =>
          sameLocation(item, location),
        ),
      })),
    [favoriteBookmarkLocations, quickLocations],
  );
  const recentLocationViews = React.useMemo(
    () =>
      recentLocations
        .filter(
          (location) =>
            !favoriteBookmarkLocations.some((favorite) =>
              sameLocation(favorite, location),
            ),
        )
        .slice(0, MAX_RECENT_PATHS)
        .map((location) => ({ ...location, favorited: false })),
    [favoriteBookmarkLocations, recentLocations],
  );
  const pathSuggestions = React.useMemo(
    () =>
      buildPathSuggestions({
        input: pathInput,
        rootId,
        entries,
        quickLocations,
        rootAbsolutePath: root?.absolutePath,
      }),
    [entries, pathInput, quickLocations, root?.absolutePath, rootId],
  );
  const currentLocationFavorited = React.useMemo(
    () =>
      favoriteBookmarkLocations.some((item) =>
        sameLocation(item, currentLocation),
      ),
    [currentLocation, favoriteBookmarkLocations],
  );
  const directoryTabViews = React.useMemo(
    () => normalizeDirectoryTabs(directoryTabs),
    [directoryTabs],
  );

  React.useEffect(() => {
    setActivePathSuggestionIndex((index) =>
      Math.max(0, Math.min(index, pathSuggestions.length - 1)),
    );
  }, [pathSuggestions.length]);

  const updateActiveDirectoryTab = React.useCallback(
    (patch: Pick<FileManagerLocation, "rootId" | "directoryPath">) => {
      const nextRootId = patch.rootId;
      const nextDirectoryPath = normalizeRelativePathForUi(patch.directoryPath);
      setRootId(nextRootId);
      setDirectoryPath(nextDirectoryPath);
      setDirectoryTabs((prev) => {
        const normalized = normalizeDirectoryTabs(prev);
        const next = normalized.map((tab) =>
          tab.id === activeDirectoryTabId
            ? {
                ...tab,
                rootId: nextRootId,
                directoryPath: nextDirectoryPath,
                label: labelForDirectoryTab(
                  roots,
                  nextRootId,
                  nextDirectoryPath,
                ),
              }
            : tab,
        );
        const stable = next.length
          ? next
          : [createDirectoryTab(nextRootId, nextDirectoryPath, roots)];
        storeDirectoryTabLocations(stable);
        return stable;
      });
      setSelectedPath(undefined);
      setSelectedPaths(new Set());
      setLastSelectedPath(undefined);
    },
    [activeDirectoryTabId, roots],
  );

  const navigateToLocation = React.useCallback(
    (location: FileManagerLocation) => {
      updateActiveDirectoryTab({
        rootId: location.rootId,
        directoryPath: location.directoryPath,
      });
    },
    [updateActiveDirectoryTab],
  );

  const openLocationInDirectoryTab = React.useCallback(
    (location: FileManagerLocation) => {
      const normalizedPath = normalizeRelativePathForUi(location.directoryPath);
      const existingTab = normalizeDirectoryTabs(directoryTabs).find(
        (tab) => tab.rootId === location.rootId && tab.directoryPath === normalizedPath,
      );
      const targetTab =
        existingTab ??
        createDirectoryTab(location.rootId, normalizedPath, roots);
      setDirectoryTabs((prev) => {
        const normalized = normalizeDirectoryTabs(prev);
        const next = existingTab
          ? normalized
          : [...normalized, targetTab].slice(-MAX_DIRECTORY_TABS);
        storeDirectoryTabLocations(next);
        return next;
      });
      setActiveDirectoryTabId(targetTab.id);
      setRootId(targetTab.rootId);
      setDirectoryPath(targetTab.directoryPath);
      setSelectedPath(undefined);
      setSelectedPaths(new Set());
      setLastSelectedPath(undefined);
    },
    [directoryTabs, roots],
  );

  const addCurrentFavoriteToFolder = React.useCallback(
    (parentId: string | undefined, title?: string) => {
      const bookmarkTitle =
        title?.trim() || displayNameForFavoriteLocation(currentLocation);
      setFavoriteTree((prev) => {
        const next = addFavoriteBookmarkItem(
          prev,
          parentId,
          createFavoriteBookmark(currentLocation, bookmarkTitle),
        );
        storeFavoriteBookmarkTree(next);
        return next;
      });
      toast.success("已收藏当前位置", { description: bookmarkTitle });
    },
    [currentLocation],
  );

  const toggleFavoriteCurrentLocation = React.useCallback(() => {
    setFavoriteTree((prev) => {
      const next = currentLocationFavorited
        ? removeFavoriteBookmarksMatchingLocation(prev, currentLocation)
        : addFavoriteBookmarkItem(
            prev,
            undefined,
            createFavoriteBookmark(
              currentLocation,
              displayNameForFavoriteLocation(currentLocation),
            ),
          );
      storeFavoriteBookmarkTree(next);
      return next;
    });
  }, [currentLocation, currentLocationFavorited]);

  const openFavoriteItem = React.useCallback(
    (itemId: string) => {
      const item = findFavoriteBookmarkItem(favoriteTree, itemId);
      if (item?.type !== "bookmark" || !item.location) return;
      openLocationInDirectoryTab(item.location);
      setPathSuggestionsOpen(false);
      setActivePathSuggestionIndex(0);
    },
    [favoriteTree, openLocationInDirectoryTab],
  );

  const addFavoriteFolder = React.useCallback(
    (parentId: string | undefined, title: string) => {
      if (!title.trim()) return;
      setFavoriteTree((prev) => {
        const next = addFavoriteBookmarkItem(
          prev,
          parentId,
          createFavoriteFolder(title.trim()),
        );
        storeFavoriteBookmarkTree(next);
        return next;
      });
    },
    [],
  );

  const renameFavoriteItem = React.useCallback(
    (itemId: string, title: string) => {
      if (!title.trim()) return;
      setFavoriteTree((prev) => {
        const next = updateFavoriteBookmarkItem(prev, itemId, (current) => ({
          ...current,
          title: title.trim(),
        }));
        storeFavoriteBookmarkTree(next);
        return next;
      });
    },
    [],
  );

  const removeFavoriteItem = React.useCallback((itemId: string) => {
    setFavoriteTree((prev) => {
      const next = removeFavoriteBookmarkItem(prev, itemId);
      storeFavoriteBookmarkTree(next);
      return next;
    });
  }, []);

  const moveFavoriteItem = React.useCallback(
    (
      itemId: string,
      targetParentId: string | undefined,
      targetIndex: number,
    ) => {
      setFavoriteTree((prev) => {
        const next = moveFavoriteBookmarkItem(
          prev,
          itemId,
          targetParentId,
          targetIndex,
        );
        storeFavoriteBookmarkTree(next);
        return next;
      });
    },
    [],
  );

  const selectDirectoryTab = React.useCallback(
    (tabId: string) => {
      const tab = directoryTabs.find((item) => item.id === tabId);
      if (!tab) return;
      setActiveDirectoryTabId(tab.id);
      setRootId(tab.rootId);
      setDirectoryPath(tab.directoryPath);
      setSelectedPath(undefined);
      setSelectedPaths(new Set());
      setLastSelectedPath(undefined);
    },
    [directoryTabs],
  );

  const addCurrentDirectoryTab = React.useCallback(() => {
    const nextTab = createDirectoryTab(defaultRootId || rootId, "", roots);
    setDirectoryTabs((prev) => {
      const next = [...normalizeDirectoryTabs(prev), nextTab].slice(
        -MAX_DIRECTORY_TABS,
      );
      storeDirectoryTabLocations(next);
      return next;
    });
    setActiveDirectoryTabId(nextTab.id);
    setRootId(nextTab.rootId);
    setDirectoryPath(nextTab.directoryPath);
    setSelectedPath(undefined);
    setSelectedPaths(new Set());
    setLastSelectedPath(undefined);
  }, [defaultRootId, rootId, roots]);

  const closeDirectoryTab = React.useCallback(
    (tabId: string) => {
      setDirectoryTabs((prev) => {
        const normalized = normalizeDirectoryTabs(prev);
        if (normalized.length <= 1) return normalized;
        const closingIndex = normalized.findIndex((item) => item.id === tabId);
        const next = normalized.filter((item) => item.id !== tabId);
        storeDirectoryTabLocations(next);
        if (tabId === activeDirectoryTabId) {
          const fallback = next[Math.max(0, closingIndex - 1)] ?? next[0];
          if (fallback) {
            setActiveDirectoryTabId(fallback.id);
            setRootId(fallback.rootId);
            setDirectoryPath(fallback.directoryPath);
          }
        }
        return next;
      });
    },
    [activeDirectoryTabId],
  );

  const clearRecentLocations = React.useCallback(() => {
    setRecentLocations([]);
    storeRecentFileManagerLocations([]);
    toast.success("最近路径已清空");
  }, []);

  const navigateToDirectory = React.useCallback(
    (nextPath: string) => {
      updateActiveDirectoryTab({ rootId, directoryPath: nextPath });
    },
    [rootId, updateActiveDirectoryTab],
  );

  const jumpToPathInput = React.useCallback(() => {
    const resolved = resolvePathInput(pathInput, roots, rootId);
    updateActiveDirectoryTab({
      rootId: resolved.rootId,
      directoryPath: resolved.directoryPath,
    });
    setPathSuggestionsOpen(false);
    setActivePathSuggestionIndex(0);
  }, [pathInput, rootId, roots, updateActiveDirectoryTab]);

  const copyPathToClipboard = React.useCallback(
    (path: string, successTitle = "路径已复制") => {
      void copyTextToClipboard(path)
        .then(() => {
          toast.success(successTitle, {
            description: path,
          });
        })
        .catch((error) => {
          toast.error("复制路径失败", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [],
  );

  const copyCurrentPath = React.useCallback(() => {
    copyPathToClipboard(displayPath);
  }, [copyPathToClipboard, displayPath]);

  const openFileOnlineEditor = React.useCallback(
    (entry: FileEntrySummary, targetRootId?: string) => {
      const nextRootId = targetRootId ?? rootId;
      const tab = createFileOnlineEditorTab(nextRootId, entry);
      setOnlineEditorTabs((current) => {
        const existing = current.find((item) => item.id === tab.id);
        if (existing) {
          return current.map((item) =>
            item.id === tab.id ? { ...item, entry, rootId: nextRootId } : item,
          );
        }
        return [...current, tab];
      });
      setSelectedPath(entry.path);
      setActiveOnlineEditorTabId(tab.id);
      setOnlineEditorOpen(true);
    },
    [rootId],
  );

  const openFileSurface = React.useCallback(
    (entry: FileEntrySummary, targetRootId?: string) => {
      openFileOnlineEditor(entry, targetRootId);
    },
    [openFileOnlineEditor],
  );

  const selectOnlineEditorTab = React.useCallback(
    (tabId: string) => {
      const tab = onlineEditorTabs.find((item) => item.id === tabId);
      setActiveOnlineEditorTabId(tabId);
      if (tab) setSelectedPath(tab.entry.path);
    },
    [onlineEditorTabs],
  );

  const closeOnlineEditorTab = React.useCallback(
    (tabId: string) => {
      const closingIndex = onlineEditorTabs.findIndex((tab) => tab.id === tabId);
      const nextTabs = onlineEditorTabs.filter((tab) => tab.id !== tabId);
      setOnlineEditorDrafts((current) => {
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setOnlineEditorViewStates((current) => {
        if (current[tabId] == null) return current;
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setOnlineEditorReadMetadata((current) => {
        if (current[tabId] == null) return current;
        const next = { ...current };
        delete next[tabId];
        return next;
      });
      setOnlineEditorTabs(nextTabs);
      if (nextTabs.length === 0) {
        setOnlineEditorOpen(false);
        setOnlineEditorWindowMode("normal");
      }
      if (activeOnlineEditorTabId === tabId) {
        const fallback = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0];
        setActiveOnlineEditorTabId(fallback?.id);
        if (fallback) setSelectedPath(fallback.entry.path);
      }
    },
    [activeOnlineEditorTabId, onlineEditorTabs],
  );

  const closeOnlineEditorWindow = React.useCallback(() => {
    setOnlineEditorOpen(false);
  }, []);

  const closeOtherOnlineEditorTabs = React.useCallback((tabId: string) => {
    const tab = onlineEditorTabs.find((item) => item.id === tabId);
    if (!tab) return;
    setOnlineEditorTabs((current) => current.filter((tab) => tab.id === tabId));
    setOnlineEditorDrafts((current) => {
      if (Object.keys(current).every((id) => id === tabId)) return current;
      const next: Record<string, string> = {};
      if (current[tabId] != null) next[tabId] = current[tabId];
      return next;
    });
    setOnlineEditorViewStates((current) => {
      const viewState = current[tabId];
      return viewState ? { [tabId]: viewState } : {};
    });
    setOnlineEditorReadMetadata((current) => {
      const metadata = current[tabId];
      return metadata ? { [tabId]: metadata } : {};
    });
    setActiveOnlineEditorTabId(tabId);
    setSelectedPath(tab.entry.path);
  }, [onlineEditorTabs]);

  const closeSavedOnlineEditorTabs = React.useCallback(() => {
    const nextTabs = onlineEditorTabs.filter((tab) => onlineEditorDrafts[tab.id] != null);
    const nextIds = new Set(nextTabs.map((tab) => tab.id));
    setOnlineEditorTabs(nextTabs);
    setOnlineEditorViewStates((current) => {
      const next: Record<string, CodeEditorViewState> = {};
      for (const [id, viewState] of Object.entries(current)) {
        if (nextIds.has(id)) next[id] = viewState;
      }
      return next;
    });
    setOnlineEditorReadMetadata((current) => {
      const next: Record<string, FileOnlineEditorReadMetadata> = {};
      for (const [id, metadata] of Object.entries(current)) {
        if (nextIds.has(id)) next[id] = metadata;
      }
      return next;
    });
    if (nextTabs.length === 0) {
      setActiveOnlineEditorTabId(undefined);
      setOnlineEditorOpen(false);
      setOnlineEditorWindowMode("normal");
      return;
    }
    if (!activeOnlineEditorTabId || !nextIds.has(activeOnlineEditorTabId)) {
      const fallback = nextTabs[0];
      setActiveOnlineEditorTabId(fallback?.id);
      if (fallback) setSelectedPath(fallback.entry.path);
    }
  }, [activeOnlineEditorTabId, onlineEditorDrafts, onlineEditorTabs]);

  const closeAllOnlineEditorTabs = React.useCallback(() => {
    setOnlineEditorTabs([]);
    setOnlineEditorDrafts({});
    setOnlineEditorViewStates({});
    setOnlineEditorReadMetadata({});
    setActiveOnlineEditorTabId(undefined);
    setOnlineEditorOpen(false);
    setOnlineEditorWindowMode("normal");
  }, []);

  const updateOnlineEditorViewState = React.useCallback(
    (tabId: string, viewState: CodeEditorViewState | null) => {
      setOnlineEditorViewStates((current) => {
        if (!viewState) {
          if (current[tabId] == null) return current;
          const next = { ...current };
          delete next[tabId];
          return next;
        }
        return { ...current, [tabId]: viewState };
      });
    },
    [],
  );

  const updateOnlineEditorReadMetadata = React.useCallback(
    (tabId: string, metadata: FileOnlineEditorReadMetadata | null) => {
      setOnlineEditorReadMetadata((current) => {
        if (!metadata) {
          if (current[tabId] == null) return current;
          const next = { ...current };
          delete next[tabId];
          return next;
        }
        const previous = current[tabId];
        if (previous?.modifiedAt === metadata.modifiedAt && previous?.size === metadata.size) {
          return current;
        }
        return { ...current, [tabId]: metadata };
      });
    },
    [],
  );

  const openFileProperties = React.useCallback((entry: FileEntrySummary) => {
    setSelectedPath(entry.path);
    setPropertiesTarget(entry);
  }, []);

  const openEntry = React.useCallback(
    (entry: FileEntrySummary) => {
      if (entry.kind === "directory") {
        navigateToDirectory(entry.path);
        return;
      }
      openFileSurface(entry);
    },
    [navigateToDirectory, openFileSurface],
  );

  const selectEntry = React.useCallback(
    (
      entry: FileEntrySummary,
      options: { range?: boolean; additive?: boolean } = {},
    ) => {
      setSelectedPath(entry.path);
      if (options.range && lastSelectedPath) {
        const range = getEntryRange(
          filteredEntries,
          lastSelectedPath,
          entry.path,
        );
        setSelectedPaths((prev) => {
          const next = new Set(options.additive ? prev : []);
          for (const item of range) next.add(item.path);
          return next;
        });
      } else if (options.additive) {
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(entry.path)) next.delete(entry.path);
          else next.add(entry.path);
          return next;
        });
        setLastSelectedPath(entry.path);
      } else {
        setLastSelectedPath(entry.path);
      }
    },
    [filteredEntries, lastSelectedPath],
  );

  const togglePath = React.useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setLastSelectedPath(path);
  }, []);

  const selectMarqueePaths = React.useCallback(
    (paths: string[], options: { additive?: boolean } = {}) => {
      const normalizedPaths = paths.filter(Boolean);
      if (!normalizedPaths.length) {
        if (!options.additive) setSelectedPaths(new Set());
        return;
      }
      setSelectedPaths((prev) => {
        const next = new Set(options.additive ? prev : []);
        for (const path of normalizedPaths) next.add(path);
        return next;
      });
      const lastPath = normalizedPaths[normalizedPaths.length - 1];
      setSelectedPath(lastPath);
      setLastSelectedPath(lastPath);
    },
    [],
  );

  const clearSelection = React.useCallback(() => {
    setSelectedPaths(new Set());
    setSelectedPath(undefined);
    setLastSelectedPath(undefined);
  }, []);

  const focusRelativeEntry = React.useCallback(
    (delta: number) => {
      if (!filteredEntries.length) return;
      const currentIndex = selectedPath
        ? filteredEntries.findIndex((entry) => entry.path === selectedPath)
        : -1;
      const nextIndex = Math.max(
        0,
        Math.min(
          filteredEntries.length - 1,
          currentIndex < 0 ? 0 : currentIndex + delta,
        ),
      );
      setSelectedPath(filteredEntries[nextIndex].path);
    },
    [filteredEntries, selectedPath],
  );

  const toggleAllVisible = React.useCallback(() => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const entry of filteredEntries) next.delete(entry.path);
      } else {
        for (const entry of filteredEntries) next.add(entry.path);
      }
      return next;
    });
  }, [allVisibleSelected, filteredEntries]);

  const selectAllVisible = React.useCallback(() => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      for (const entry of filteredEntries) next.add(entry.path);
      return next;
    });
    const lastEntry = filteredEntries[filteredEntries.length - 1];
    if (lastEntry) {
      setSelectedPath(lastEntry.path);
      setLastSelectedPath(lastEntry.path);
    }
  }, [filteredEntries]);

  const openUploadManager = React.useCallback(
    (targetDirectory = directoryPath) => {
      setUploadDialog({
        open: true,
        targetDirectory,
        files: [],
        conflictPolicy: "rename",
      });
      setUploadJobs([]);
    },
    [directoryPath],
  );

  const queueUploadFiles = React.useCallback(
    (files: File[], targetDirectory = directoryPath) => {
      if (!files.length) return;
      setUploadDialog({
        open: true,
        targetDirectory,
        files,
        conflictPolicy: "rename",
      });
      setUploadJobs([]);
    },
    [directoryPath],
  );

  const startUpload = React.useCallback(
    async (
      files: File[],
      targetDirectory: string,
      conflictPolicy: FilesUploadConflictPolicy,
    ) => {
      if (!rootId || files.length === 0) return;
      uploadHandleRef.current?.cancel();
      const handle = createUploadBatch({
        rootId,
        directoryPath: targetDirectory,
        files,
        conflictPolicy,
        onJobsChange: setUploadJobs,
      });
      uploadHandleRef.current = handle;
      try {
        await handle.done;
        refresh();
        const failed = handle.jobs.filter(
          (job) => job.status === "error",
        ).length;
        const skipped = handle.jobs.filter(
          (job) => job.status === "skipped",
        ).length;
        pushOperationRecord(
          createOperationRecord({
            title: "上传文件",
            status: failed ? "partial" : "success",
            itemCount: files.length,
            successCount: files.length - failed - skipped,
            failureCount: failed,
            affectedPaths: handle.jobs
              .map((job) => job.targetPath)
              .filter((targetPath): targetPath is string =>
                Boolean(targetPath),
              ),
            errorMessages: handle.jobs
              .filter((job) => job.status === "error")
              .map((job) => `${job.fileName}: ${job.error ?? "上传失败"}`),
          }),
        );
        if (failed) {
          toast.error("上传未完成", {
            description: `${failed} 个文件失败，可在上传面板中继续处理。`,
          });
        } else {
          toast.success("上传完成", {
            description: `${files.length - skipped} 个文件已上传${skipped ? `，${skipped} 个已跳过` : ""}`,
          });
        }
      } catch (error) {
        toast.error("上传失败", {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [pushOperationRecord, refresh, rootId],
  );

  const queueQuickPasteUpload = React.useCallback(
    (files: File[], targetDirectory: string) => {
      const normalizedFiles = mergeUploadFiles([], files);
      if (!normalizedFiles.length) return;
      const fingerprint = [
        rootId,
        targetDirectory,
        uploadFilesClipboardFingerprint(normalizedFiles),
      ].join("\u0001");
      const now = Date.now();
      const recentPaste = quickPasteUploadRef.current;
      if (recentPaste?.key === fingerprint && now - recentPaste.at < 1000) {
        toast.info("已忽略重复粘贴", {
          description: "相同文件已在上传队列中。",
        });
        return;
      }
      quickPasteUploadRef.current = { key: fingerprint, at: now };
      void startUpload(normalizedFiles, targetDirectory, "rename");
    },
    [rootId, startUpload],
  );

  const onUploadChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (!files.length) return;
      setUploadDialog((state) => ({
        ...state,
        open: true,
        files: mergeUploadFiles(state.files, files),
      }));
    },
    [],
  );

  const resumeUpload = React.useCallback(async () => {
    const handle = uploadHandleRef.current;
    if (!handle) return;
    try {
      await handle.resume();
      refresh();
    } catch (error) {
      toast.error("续传失败", {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  }, [refresh]);

  const activeUpload = uploadJobs.some(
    (job) =>
      job.status === "preparing" ||
      job.status === "uploading" ||
      job.status === "queued",
  );
  const selectedList = React.useMemo(
    () => entries.filter((entry) => selectedPaths.has(entry.path)),
    [entries, selectedPaths],
  );
  const selectedPathList = React.useMemo(
    () => Array.from(selectedPaths),
    [selectedPaths],
  );
  const selectedArchiveEntry = React.useMemo(
    () =>
      selectedList.length === 1 &&
      selectedList[0].kind === "file" &&
      isSupportedArchiveName(selectedList[0].name)
        ? selectedList[0]
        : null,
    [selectedList],
  );
  const selectedEntry = React.useMemo(
    () => entries.find((entry) => entry.path === selectedPath),
    [entries, selectedPath],
  );
  const afterFileMutation = React.useCallback(
    (record: FileOperationRecord) => {
      pushOperationRecord(record);
      setDialog(null);
      setSelectedPaths(new Set());
      refresh();
    },
    [pushOperationRecord, refresh],
  );

  const revealOperationPath = React.useCallback(
    (path: string, targetRootId?: string) => {
      if (targetRootId && targetRootId !== rootId) setRootId(targetRootId);
      const cleanPath = normalizeOperationPath(path);
      const maybeEntry = entries.find((entry) => entry.path === cleanPath);
      if (maybeEntry?.kind === "directory") {
        navigateToDirectory(maybeEntry.path);
        return;
      }
      const parentPath = parentOf(cleanPath);
      if (parentPath !== directoryPath) navigateToDirectory(parentPath);
      setSelectedPath(cleanPath);
      setSelectedPaths(new Set([cleanPath]));
      setLastSelectedPath(cleanPath);
    },
    [directoryPath, entries, navigateToDirectory, rootId],
  );

  const handleFileManagerPaste = React.useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (uploadDialog.open) return;
      const dataTransfer = event.clipboardData;
      if (!dataTransfer?.files?.length && !dataTransfer?.items?.length) return;
      event.preventDefault();
      void collectUploadFilesFromDataTransfer(dataTransfer)
        .then((files) => queueQuickPasteUpload(files, directoryPath))
        .catch((error) => {
          toast.error("读取剪贴板文件失败", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [directoryPath, queueQuickPasteUpload, uploadDialog.open],
  );

  const handleDragEnter = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragUploadActive(true);
    },
    [],
  );

  const handleDragOver = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragUploadActive(true);
    },
    [],
  );

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setDragUploadActive(false);
    },
    [],
  );

  const handleDrop = React.useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!hasFileDrag(event.dataTransfer)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragUploadActive(false);
      void collectUploadFilesFromDataTransfer(event.dataTransfer, {
        includeDirectoryEntries: true,
      })
        .then((files) => {
          if (!files.length) return;
          queueUploadFiles(files, directoryPath);
          toast.success("已加入上传队列", {
            description: `${files.length} 个文件将上传到 ${displayDir(directoryPath)}`,
          });
        })
        .catch((error) => {
          toast.error("读取拖拽文件失败", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [directoryPath, queueUploadFiles],
  );

  const copySelectionToFileClipboard = React.useCallback(
    (operation: "copy" | "move") => {
      const paths =
        selectedPathList.length > 0
          ? selectedPathList
          : selectedEntry
            ? [selectedEntry.path]
            : [];
      if (!paths.length) return false;
      setFileClipboard({ operation, paths });
      toast.success(
        operation === "copy" ? "已复制到文件剪贴板" : "已剪切到文件剪贴板",
        {
          description: `${paths.length} 个项目，按 Ctrl/⌘+V 粘贴到当前目录。`,
        },
      );
      return true;
    },
    [selectedEntry, selectedPathList],
  );

  const pasteFileClipboardToCurrentDirectory = React.useCallback(() => {
    if (!fileClipboard?.paths.length) return false;
    setSelectedPath(fileClipboard.paths[0]);
    setSelectedPaths(new Set(fileClipboard.paths));
    setLastSelectedPath(fileClipboard.paths[0]);
    setDialog({
      kind: fileClipboard.operation,
      initialDirectoryPath: directoryPath,
    });
    return true;
  }, [directoryPath, fileClipboard]);

  const handleDropUploadToDirectory = React.useCallback(
    (targetDirectory: FileEntrySummary, event: React.DragEvent) => {
      void collectUploadFilesFromDataTransfer(event.dataTransfer, {
        includeDirectoryEntries: true,
      })
        .then((files) => {
          if (!files.length) return;
          queueUploadFiles(files, targetDirectory.path);
          toast.success("已加入上传队列", {
            description: `${files.length} 个文件将上传到 ${displayDir(targetDirectory.path)}`,
          });
        })
        .catch((error) => {
          toast.error("读取拖拽文件失败", {
            description: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [queueUploadFiles],
  );

  const handleDropTransfer = React.useCallback(
    (
      targetDirectory: FileEntrySummary,
      sourcePaths: string[],
      operation: "copy" | "move",
    ) => {
      const safeSources = sourcePaths.filter(
        (path) =>
          path !== targetDirectory.path &&
          !targetDirectory.path.startsWith(`${path}/`),
      );
      if (!safeSources.length) {
        toast.error("无法投放到该目录", {
          description: "不能把目录移动/复制到自身或其子目录。",
        });
        return;
      }
      setSelectedPath(safeSources[0]);
      setSelectedPaths(new Set(safeSources));
      setLastSelectedPath(safeSources[0]);
      setDialog({
        kind: operation,
        initialDirectoryPath: targetDirectory.path,
      });
    },
    [],
  );

  const handleFileManagerKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditorShortcutTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.altKey && event.key === "ArrowUp") {
        event.preventDefault();
        navigateToDirectory(parentPath ?? "");
        return;
      }
      if (event.key === "F3") {
        event.preventDefault();
        fileManagerFilterRef.current?.focus();
        fileManagerFilterRef.current?.select();
        return;
      }
      if (mod && event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDialog({ kind: "newDir" });
        return;
      }
      if (mod && !event.shiftKey && event.key.toLowerCase() === "n") {
        event.preventDefault();
        setDialog({ kind: "newFile" });
        return;
      }
      if (mod && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectedPaths(new Set(filteredEntries.map((entry) => entry.path)));
        return;
      }
      if (mod && event.key.toLowerCase() === "c") {
        if (copySelectionToFileClipboard("copy")) event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "x") {
        if (copySelectionToFileClipboard("move")) event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "v") {
        if (pasteFileClipboardToCurrentDirectory()) event.preventDefault();
        return;
      }
      if (mod && event.key.toLowerCase() === "u") {
        event.preventDefault();
        openUploadManager(directoryPath);
        return;
      }
      if (mod && event.key === "Enter" && selectedEntry?.kind === "file") {
        event.preventDefault();
        openFileSurface(selectedEntry);
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        refresh();
        return;
      }
      if (
        event.key === " " &&
        selectedEntry?.kind === "file" &&
        !isInteractiveShortcutTarget(event.target)
      ) {
        event.preventDefault();
        openFileSurface(selectedEntry);
        return;
      }
      if (event.altKey && event.key === "Enter" && selectedEntry) {
        event.preventDefault();
        openFileProperties(selectedEntry);
        return;
      }
      if (event.key === "F2" && selectedEntry) {
        event.preventDefault();
        setSelectedPaths(new Set([selectedEntry.path]));
        setDialog({ kind: "rename" });
        return;
      }
      if (
        (event.key === "Delete" || event.key === "Backspace") &&
        (selectedList.length > 0 || selectedEntry)
      ) {
        event.preventDefault();
        if (selectedList.length === 0 && selectedEntry)
          setSelectedPaths(new Set([selectedEntry.path]));
        setDialog({ kind: "delete" });
      }
    },
    [
      copySelectionToFileClipboard,
      directoryPath,
      filteredEntries,
      navigateToDirectory,
      openFileSurface,
      openFileProperties,
      openUploadManager,
      parentPath,
      pasteFileClipboardToCurrentDirectory,
      refresh,
      selectedEntry,
      selectedList.length,
    ],
  );

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-col outline-none"
      tabIndex={0}
      data-file-manager-shell="true"
      onPaste={handleFileManagerPaste}
      onKeyDown={handleFileManagerKeyDown}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dragUploadActive ? (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center rounded-lg border-2 border-dashed border-primary bg-primary-soft/80 text-primary shadow-lg">
          <div className="rounded-lg border border-primary-line bg-panel px-5 py-4 text-center shadow-sm">
            <Upload className="mx-auto mb-2 size-6" />
            <div className="text-sm font-semibold">拖拽上传到当前目录</div>
            <div className="mt-1 text-xs text-muted">
              支持文件、批量文件和文件夹；松开后进入上传管理器。
            </div>
          </div>
        </div>
      ) : null}
      <section className="grid min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-panel">
        <header className="border-b border-line bg-panel-2">
          <FileManagerHeader
            rootId={rootId}
            roots={roots}
            rootAbsolutePath={root?.absolutePath}
            directoryPath={directoryPath}
            viewMode={viewMode}
            onChangeRoot={(nextRootId) => {
              setRootId(nextRootId);
              setDirectoryPath("");
              setSelectedPath(undefined);
              setSelectedPaths(new Set());
            }}
            onNewFile={() => setDialog({ kind: "newFile" })}
            onNewDirectory={() => setDialog({ kind: "newDir" })}
            onUpload={() => openUploadManager(directoryPath)}
            onChangeViewMode={setViewMode}
            onRefresh={refresh}
            showHidden={showHidden}
            onToggleShowHidden={() => setShowHidden((value) => !value)}
          />
          <FileManagerNavigationBar
            roots={roots}
            onChangeRoot={(nextRootId) => {
              setRootId(nextRootId);
              setDirectoryPath("");
              setSelectedPath(undefined);
              setSelectedPaths(new Set());
            }}
            directoryPath={directoryPath}
            parentPath={parentPath}
            breadcrumbs={breadcrumbs}
            pathInput={pathInput}
            displayPath={displayPath}
            pathSuggestions={pathSuggestions}
            pathSuggestionsOpen={pathSuggestionsOpen}
            activePathSuggestionIndex={activePathSuggestionIndex}
            quickLocations={quickLocationViews}
            favoriteTree={favoriteTree}
            favoriteCount={favoriteCount}
            recentLocations={recentLocationViews}
            directoryTabs={directoryTabViews}
            activeDirectoryTabId={activeDirectoryTabId}
            filterText={filterText}
            showHidden={showHidden}
            currentLocationFavorited={currentLocationFavorited}
            onNavigateToDirectory={navigateToDirectory}
            onNavigateToLocation={(location) => {
              navigateToLocation(location);
              setPathSuggestionsOpen(false);
              setActivePathSuggestionIndex(0);
            }}
            onSelectDirectoryTab={selectDirectoryTab}
            onAddDirectoryTab={addCurrentDirectoryTab}
            onCloseDirectoryTab={closeDirectoryTab}
            onPathInputFocus={() => {
              setPathSuggestionsOpen(true);
              setActivePathSuggestionIndex(0);
            }}
            onPathInputBlur={() =>
              window.setTimeout(() => setPathSuggestionsOpen(false), 120)
            }
            onPathInputChange={(value) => {
              setPathInput(value);
              setPathSuggestionsOpen(true);
              setActivePathSuggestionIndex(0);
            }}
            onPathInputJump={jumpToPathInput}
            onCopyCurrentPath={copyCurrentPath}
            onPathInputRestore={() => {
              setPathInput(displayPath);
              setPathSuggestionsOpen(false);
              setActivePathSuggestionIndex(0);
            }}
            onPathSuggestionActiveChange={setActivePathSuggestionIndex}
            onAcceptPathSuggestion={(location) => {
              navigateToLocation(location);
              setPathSuggestionsOpen(false);
              setActivePathSuggestionIndex(0);
            }}
            onToggleFavoriteCurrent={toggleFavoriteCurrentLocation}
            onOpenFavoriteItem={openFavoriteItem}
            onAddFavoriteFolder={addFavoriteFolder}
            onAddCurrentFavoriteToFolder={addCurrentFavoriteToFolder}
            onRenameFavoriteItem={renameFavoriteItem}
            onRemoveFavoriteItem={removeFavoriteItem}
            onMoveFavoriteItem={moveFavoriteItem}
            onClearRecentLocations={clearRecentLocations}
            filterInputRef={fileManagerFilterRef}
            onFilterTextChange={setFilterText}
            onToggleShowHidden={() => setShowHidden((value) => !value)}
            rootId={rootId}
            viewMode={viewMode}
            onNewFile={() => setDialog({ kind: "newFile" })}
            onNewDirectory={() => setDialog({ kind: "newDir" })}
            onUpload={() => openUploadManager(directoryPath)}
            onChangeViewMode={setViewMode}
            onRefresh={refresh}
            currentLocation={currentLocation}
          />
        </header>

        {viewMode === "files" ? (
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col",
              selectedList.length > 0 && "pb-32 sm:pb-0",
            )}
          >
            {browse.error ? (
              <div
                className="flex flex-wrap items-center gap-2 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                data-file-manager-path-error-recovery
              >
                <span className="font-medium">路径不可访问：</span>
                <span className="min-w-0 flex-1 truncate">{displayPath}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const lastGood = lastGoodLocationRef.current;
                    if (lastGood) navigateToLocation(lastGood);
                    else navigateToDirectory("");
                  }}
                >
                  返回上个可用目录
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateToDirectory("")}
                >
                  回到根目录
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    copyPathToClipboard(displayPath, "失败路径已复制")
                  }
                >
                  复制失败路径
                </Button>
              </div>
            ) : null}
            <BulkActionBar
              selectedEntries={selectedList}
              onEdit={() => {
                const entry = selectedList[0];
                if (entry?.kind === "file" && entry.textLike) {
                  openFileSurface(entry);
                }
              }}
              canEdit={
                selectedList.length === 1 &&
                selectedList[0]?.kind === "file" &&
                Boolean(selectedList[0]?.textLike)
              }
              onRename={() => setDialog({ kind: "rename" })}
              canRename={selectedList.length === 1}
              onArchive={() => setDialog({ kind: "archive" })}
              onChmod={() => setDialog({ kind: "chmod" })}
              onUnarchive={() =>
                selectedArchiveEntry && setDialog({ kind: "unarchive" })
              }
              canUnarchive={Boolean(selectedArchiveEntry)}
              onCopy={() => setDialog({ kind: "copy" })}
              onMove={() => setDialog({ kind: "move" })}
              onDownload={() =>
                downloadSelectedArchive(rootId, selectedPathList)
              }
              onDelete={() => setDialog({ kind: "delete" })}
              onClear={clearSelection}
            />
            <FileManagerSecondaryDock
              rootId={rootId}
              directoryPath={directoryPath}
              showHidden={showHidden}
              counts={counts}
              selectedCount={selectedPaths.size}
              loadedCount={entries.length}
              totalCount={pagination?.totalEntries ?? entries.length}
              onRevealPath={revealOperationPath}
              onOpenDirectory={navigateToDirectory}
              onOpenFile={(entry) => {
                openFileSurface(entry);
              }}
            />
            <FileListPanel
              rootId={rootId}
              browse={browse}
              entries={entries}
              filteredEntries={filteredEntries}
              selectedPath={selectedPath}
              selectedPaths={selectedPaths}
              allVisibleSelected={allVisibleSelected}
              sort={viewPreferences.sort}
              density={viewPreferences.density}
              columns={viewPreferences.columns}
              displayMode={viewPreferences.displayMode}
              columnWidths={viewPreferences.columnWidths}
              canLoadMore={canLoadMore}
              isFetching={browse.isFetching}
              pagination={pagination}
              onRefetch={() => void browse.refetch()}
              onLoadMore={() => setPage((value) => value + 1)}
              onOpen={openEntry}
              onEdit={openFileOnlineEditor}
              onSelect={selectEntry}
              onMarqueeSelect={selectMarqueePaths}
              onTogglePath={togglePath}
              onClearSelection={clearSelection}
              onFocusRelative={focusRelativeEntry}
              onToggleAllVisible={toggleAllVisible}
              onSelectAllVisible={selectAllVisible}
              onSortChange={(sort) => updateViewPreferences({ sort })}
              onDensityChange={(density) => updateViewPreferences({ density })}
              onColumnsChange={(columns) => updateViewPreferences({ columns })}
              onDisplayModeChange={(displayMode) =>
                updateViewPreferences({ displayMode })
              }
              onColumnWidthsChange={(columnWidths) =>
                updateViewPreferences({ columnWidths })
              }
              onContextMenu={(event, entry) => {
                event.preventDefault();
                setMenu({
                  x: event.clientX,
                  y: event.clientY,
                  target: {
                    path: entry.path,
                    name: entry.name,
                    kind: entry.kind,
                    textLike: entry.textLike,
                  },
                });
              }}
              onOpenContextMenu={(x, y, entry) => {
                setMenu({
                  x,
                  y,
                  target: {
                    path: entry.path,
                    name: entry.name,
                    kind: entry.kind,
                    textLike: entry.textLike,
                  },
                });
              }}
              onDropTransfer={handleDropTransfer}
              onDropUploadToDirectory={handleDropUploadToDirectory}
            />
            <OperationHistoryPanel
              records={operationRecords}
              onRevealPath={revealOperationPath}
              onClear={() => {
                storeFileOperationRecords([]);
                setOperationRecords([]);
              }}
            />
          </div>
        ) : viewMode === "index" ? (
          <React.Suspense
            fallback={
              <FileManagerLazyPanelLoading label="内容索引管理加载中…" />
            }
          >
            <LazyContentIndexManager
              rootId={rootId}
              rootLabel={root?.labelZh ?? rootId}
              onRevealPath={revealOperationPath}
              onOpenFile={(entry) => {
                openFileSurface(entry);
              }}
            />
          </React.Suspense>
        ) : (
          <React.Suspense
            fallback={<FileManagerLazyPanelLoading label="回收站加载中…" />}
          >
            <LazyTrashManager
              rootId={rootId}
              rootLabel={root?.labelZh ?? rootId}
              onRevealPath={revealOperationPath}
              onRecord={pushOperationRecord}
            />
          </React.Suspense>
        )}
      </section>

      {menu ? (
        <FileActionsMenu
          open
          x={menu.x}
          y={menu.y}
          rootId={rootId}
          target={menu.target}
          onClose={() => setMenu(null)}
          onAfterMutation={refresh}
          onUploadRequest={openUploadManager}
          onPreviewRequest={(target) => {
            const entry = entries.find(
              (item) => item.path === target.path && item.kind === "file",
            );
            openFileSurface(entry ?? fileEntryFromMenuTarget(target));
          }}
          onEditRequest={(target) => {
            const entry = entries.find(
              (item) => item.path === target.path && item.kind === "file",
            );
            openFileSurface(
              entry ?? fileEntryFromMenuTarget({ ...target, textLike: true }),
            );
          }}
          onPropertiesRequest={(target) => {
            const entry = entries.find((item) => item.path === target.path);
            openFileProperties(entry ?? fileEntryFromMenuTarget(target));
          }}
        />
      ) : null}

      {!onlineEditorOpen && onlineEditorTabs.length > 0 ? (
        <div
          className="fixed bottom-4 right-4 z-40 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-panel px-3 py-2 text-xs shadow-xl"
          data-file-online-editor-minimized-dock
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => setOnlineEditorOpen(true)}
              aria-label="恢复在线编辑器"
            >
              <div className="font-medium text-ink-strong">在线编辑器驻留中</div>
              <div className="max-w-72 truncate text-muted">
                {onlineEditorTabs.length} 个标签 · {onlineEditorTabs.find((tab) => tab.id === activeOnlineEditorTabId)?.entry.path ?? onlineEditorTabs[0]?.entry.path}
              </div>
            </button>
            <Button variant="outline" size="sm" onClick={() => setOnlineEditorOpen(true)}>
              恢复
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const dirtyCount = Object.keys(onlineEditorDrafts).length;
                if (dirtyCount > 0 && !window.confirm(`有 ${dirtyCount} 个文件存在未保存修改，确定关闭全部并放弃修改吗？`)) return;
                closeAllOnlineEditorTabs();
              }}
            >
              关闭全部
            </Button>
          </div>
        </div>
      ) : null}

      {onlineEditorOpen && onlineEditorTabs.length > 0 ? (
        <FileManagerModalErrorBoundary
          resetKey={activeOnlineEditorTabId ?? "online-editor"}
          title="在线编辑器加载失败"
          description="在线编辑器代码加载异常，已阻止前端进入空白页。请关闭后重试。"
          onDismiss={closeOnlineEditorWindow}
        >
          <React.Suspense
            fallback={<FileManagerModalLoading label="在线编辑器加载中…" />}
          >
            <LazyFileOnlineEditorDialog
              tabs={onlineEditorTabs}
              activeTabId={activeOnlineEditorTabId}
              windowMode={onlineEditorWindowMode}
              onWindowModeChange={setOnlineEditorWindowMode}
              onSelectTab={selectOnlineEditorTab}
              onCloseTab={closeOnlineEditorTab}
              onCloseOtherTabs={closeOtherOnlineEditorTabs}
              onCloseSavedTabs={closeSavedOnlineEditorTabs}
              onCloseAllTabs={closeAllOnlineEditorTabs}
              onOpenChange={(open) => {
                if (!open) closeOnlineEditorWindow();
              }}
              drafts={onlineEditorDrafts}
              viewStates={onlineEditorViewStates}
              readMetadata={onlineEditorReadMetadata}
              onDraftChange={(tabId, content) =>
                setOnlineEditorDrafts((current) => ({ ...current, [tabId]: content }))
              }
              onDraftClear={(tabId) =>
                setOnlineEditorDrafts((current) => {
                  const next = { ...current };
                  delete next[tabId];
                  return next;
                })
              }
              onViewStateChange={updateOnlineEditorViewState}
              onReadMetadataChange={updateOnlineEditorReadMetadata}
            />
          </React.Suspense>
        </FileManagerModalErrorBoundary>
      ) : null}

      <FilePropertiesDialog
        entry={propertiesTarget}
        rootLabel={root?.labelZh ?? rootId}
        displayPath={
          propertiesTarget
            ? absoluteDisplayPath(root?.absolutePath, propertiesTarget.path)
            : ""
        }
        onOpenChange={(open) => {
          if (!open) setPropertiesTarget(undefined);
        }}
      />

      {!uploadDialog.open &&
      (uploadJobs.length > 0 || uploadSnapshots.length > 0) ? (
        <UploadTaskStrip
          jobs={uploadJobs}
          snapshots={uploadSnapshots}
          onOpen={() => setUploadDialog((state) => ({ ...state, open: true }))}
          onPause={() => uploadHandleRef.current?.pause()}
          onResume={() => void resumeUpload()}
          onCancel={() => uploadHandleRef.current?.cancel()}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onUploadChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onUploadChange}
      />
      {dialog ? (
        <React.Suspense
          fallback={<FileManagerModalLoading label="文件操作面板加载中…" />}
        >
          <LazyFileManagerActionDialog
            dialog={dialog}
            rootId={rootId}
            directoryPath={directoryPath}
            selectedEntries={selectedList}
            selectedPaths={selectedPathList}
            selectedArchivePath={selectedArchiveEntry?.path}
            ops={ops}
            onClose={() => setDialog(null)}
            onDone={afterFileMutation}
          />
        </React.Suspense>
      ) : null}
      {uploadDialog.open ? (
        <React.Suspense
          fallback={<FileManagerModalLoading label="上传管理器加载中…" />}
        >
          <LazyUploadManagerDialog
            open={uploadDialog.open}
            targetDirectory={uploadDialog.targetDirectory}
            files={uploadDialog.files}
            jobs={uploadJobs}
            activeUpload={activeUpload}
            conflictPolicy={uploadDialog.conflictPolicy}
            onChangeConflictPolicy={(conflictPolicy) =>
              setUploadDialog((state) => ({ ...state, conflictPolicy }))
            }
            onChangeTargetDirectory={(targetDirectory) =>
              setUploadDialog((state) => ({ ...state, targetDirectory }))
            }
            onChooseFiles={() => fileInputRef.current?.click()}
            onChooseFolder={() => folderInputRef.current?.click()}
            onPasteFiles={(files) =>
              setUploadDialog((state) => ({
                ...state,
                files: mergeUploadFiles(state.files, files),
              }))
            }
            onClear={() => {
              uploadHandleRef.current?.cancel();
              setUploadJobs([]);
              setUploadSnapshots([]);
              saveUploadTaskSnapshots(
                FILE_MANAGER_UPLOAD_TASK_SNAPSHOT_KEY,
                [],
              );
              setUploadDialog((state) => ({ ...state, files: [] }));
            }}
            onRemoveFile={(index) =>
              setUploadDialog((state) => ({
                ...state,
                files: state.files.filter(
                  (_, fileIndex) => fileIndex !== index,
                ),
              }))
            }
            onStart={() =>
              void startUpload(
                uploadDialog.files,
                uploadDialog.targetDirectory,
                uploadDialog.conflictPolicy,
              )
            }
            onPause={() => uploadHandleRef.current?.pause()}
            onResume={() => void resumeUpload()}
            onCancelUpload={() => uploadHandleRef.current?.cancel()}
            onOpenChange={(open) =>
              setUploadDialog((state) => ({ ...state, open }))
            }
          />
        </React.Suspense>
      ) : null}
    </div>
  );
}

function fileEntryFromMenuTarget(
  target: FileActionsMenuTarget,
): FileEntrySummary {
  return {
    path: target.path,
    name: target.name,
    kind: target.kind,
    ext: target.kind === "file" ? extensionOf(target.name) : null,
    size: null,
    modifiedAt: null,
    hidden: target.name.startsWith("."),
    textLike: Boolean(target.textLike),
    imageLike: false,
    mode: "",
    permissions: "",
    uid: null,
    gid: null,
  };
}

function FileManagerLazyPanelLoading({ label }: { label: string }) {
  return (
    <div className="grid min-h-[360px] place-items-center p-6 text-sm text-muted">
      <div className="grid justify-items-center gap-2">
        <span className="size-6 animate-spin rounded-full border-2 border-line border-t-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

function FileManagerModalLoading({ label }: { label: string }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 text-sm text-muted backdrop-blur-sm"
      data-file-manager-modal-loading
    >
      <div className="grid min-w-[220px] justify-items-center gap-2 rounded-lg border border-line bg-panel px-5 py-4 shadow-xl">
        <span className="size-6 animate-spin rounded-full border-2 border-line border-t-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}

class FileManagerModalErrorBoundary extends React.Component<
  {
    resetKey: string;
    title: string;
    description: string;
    onDismiss?: () => void;
    children: React.ReactNode;
  },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previousProps: { resetKey: string }) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error) {
    console.error("Tracevane file manager modal crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4 text-sm text-muted backdrop-blur-sm"
        data-file-manager-modal-error-boundary
        role="alert"
      >
        <div className="grid w-full max-w-lg gap-3 rounded-lg border border-danger/30 bg-panel px-5 py-4 text-center shadow-xl">
          <div className="text-base font-semibold text-danger">
            {this.props.title}
          </div>
          <p className="text-xs leading-5 text-muted">
            {this.props.description}
          </p>
          <pre className="max-h-32 overflow-auto rounded border border-danger/20 bg-danger/5 p-2 text-left font-mono text-2xs text-danger">
            {this.state.error.message}
          </pre>
          <div className="flex justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => this.setState({ error: null })}
            >
              重试
            </Button>
            {this.props.onDismiss ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={this.props.onDismiss}
              >
                关闭
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }
}

function FileManagerSecondaryDock({
  rootId,
  directoryPath,
  showHidden,
  counts,
  selectedCount,
  loadedCount,
  totalCount,
  onRevealPath,
  onOpenDirectory,
  onOpenFile,
}: {
  rootId: string;
  directoryPath: string;
  showHidden: boolean;
  counts:
    | { directories: number; files: number; hidden: number; total: number }
    | undefined;
  selectedCount: number;
  loadedCount: number;
  totalCount: number;
  onRevealPath: (path: string) => void;
  onOpenDirectory: (path: string) => void;
  onOpenFile: (entry: FileSearchResult) => void;
}) {
  return (
    <aside className="grid min-w-0" data-file-manager-secondary-dock>
      <details
        className="group border-b border-line bg-panel text-xs"
        data-file-manager-search-and-stats-dock
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 px-3 py-1.5 marker:hidden">
          <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-ink-strong">
            <Search className="size-3.5 shrink-0 text-subtle" />
            搜索与统计
          </span>
          <FileManagerStatsInline
            counts={counts}
            selectedCount={selectedCount}
            loadedCount={loadedCount}
            totalCount={totalCount}
          />
        </summary>
        <div
          className="hidden gap-3 border-t border-line p-2 group-open:grid xl:grid-cols-[minmax(0,1fr)_260px]"
          data-file-manager-search-and-stats-body
        >
          <FileManagerSearchPanel
            rootId={rootId}
            directoryPath={directoryPath}
            showHidden={showHidden}
            onRevealPath={onRevealPath}
            onOpenDirectory={onOpenDirectory}
            onOpenFile={onOpenFile}
          />
          <FileManagerStats
            counts={counts}
            selectedCount={selectedCount}
            loadedCount={loadedCount}
            totalCount={totalCount}
          />
        </div>
      </details>
    </aside>
  );
}

function FileManagerStatsInline({
  counts,
  selectedCount,
  loadedCount,
  totalCount,
}: {
  counts:
    | { directories: number; files: number; hidden: number; total: number }
    | undefined;
  selectedCount: number;
  loadedCount: number;
  totalCount: number;
}) {
  return (
    <span
      className="min-w-0 truncate text-right text-2xs font-normal text-subtle"
      data-file-manager-stats-inline
    >
      {counts?.total ?? totalCount} 项 · 目录 {counts?.directories ?? "—"} ·
      文件 {counts?.files ?? "—"}
      {selectedCount ? ` · 已选 ${selectedCount}` : ""}
      {loadedCount < totalCount ? ` · ${loadedCount}/${totalCount}` : ""}
    </span>
  );
}

function FileManagerStats({
  counts,
  selectedCount,
  loadedCount,
  totalCount,
}: {
  counts:
    | { directories: number; files: number; hidden: number; total: number }
    | undefined;
  selectedCount: number;
  loadedCount: number;
  totalCount: number;
}) {
  const items = [
    ["目录", counts?.directories ?? "—"],
    ["文件", counts?.files ?? "—"],
    ["隐藏", counts?.hidden ?? "—"],
    ["已选", selectedCount],
    ["已加载", `${loadedCount}/${totalCount}`],
  ];
  return (
    <div
      className="flex min-h-8 min-w-0 items-center gap-3 rounded-md border border-line bg-panel px-3 py-1.5 text-xs text-muted"
      data-file-manager-stats
    >
      <div
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1"
        data-file-manager-stats-desktop
      >
        {items.map(([label, value]) => (
          <span key={label} className="whitespace-nowrap text-subtle">
            {label}{" "}
            <strong className="font-semibold text-ink-strong">{value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const copied = document.execCommand("copy");
    if (!copied) throw new Error("浏览器拒绝访问剪贴板");
  } finally {
    textarea.remove();
  }
}

function isEditorShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    target.isContentEditable ||
    Boolean(
      target.closest(
        '[data-editor-shortcuts="ignore"],[data-code-editor="monaco-direct"],.monaco-editor,.find-widget,.suggest-widget,.context-view,.monaco-menu,.monaco-hover',
      ),
    )
  );
}

function isInteractiveShortcutTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("button,a,label,[role='button'],[role='menuitem']"),
  );
}

function getEntryRange(
  entries: FileEntrySummary[],
  fromPath: string,
  toPath: string,
): FileEntrySummary[] {
  const fromIndex = entries.findIndex((entry) => entry.path === fromPath);
  const toIndex = entries.findIndex((entry) => entry.path === toPath);
  if (fromIndex < 0 || toIndex < 0)
    return entries.filter((entry) => entry.path === toPath);
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return entries.slice(start, end + 1);
}

function downloadSelectedArchive(
  rootId: string,
  selectedPaths: string[],
): void {
  if (!rootId || selectedPaths.length === 0) return;
  const params = new URLSearchParams({ rootId, name: defaultArchiveName() });
  for (const selectedPath of selectedPaths) params.append("path", selectedPath);
  window.open(
    `/api/files/download-archive?${params.toString()}`,
    "_blank",
    "noopener,noreferrer",
  );
}

function loadFileManagerSessionState(): FileManagerSessionState {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FILE_MANAGER_SESSION_STORAGE_KEY) || "{}",
    ) as Partial<FileManagerSessionState>;
    return {
      rootId: typeof parsed.rootId === "string" ? parsed.rootId : undefined,
      directoryPath:
        typeof parsed.directoryPath === "string"
          ? parsed.directoryPath
          : undefined,
      activeDirectoryTabId:
        typeof parsed.activeDirectoryTabId === "string"
          ? parsed.activeDirectoryTabId
          : undefined,
      showHidden:
        typeof parsed.showHidden === "boolean" ? parsed.showHidden : undefined,
      viewMode:
        parsed.viewMode === "files" ||
        parsed.viewMode === "index" ||
        parsed.viewMode === "trash"
          ? parsed.viewMode
          : undefined,
      filterText:
        typeof parsed.filterText === "string" ? parsed.filterText : undefined,
    };
  } catch {
    return {};
  }
}

function storeFileManagerSessionState(state: FileManagerSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FILE_MANAGER_SESSION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Session persistence is convenience-only.
  }
}

function loadRecentFileManagerLocations(): FileManagerLocation[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(RECENT_PATHS_STORAGE_KEY) || "[]",
    ) as FileManagerLocation[];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item) =>
              typeof item?.rootId === "string" &&
              typeof item?.directoryPath === "string" &&
              typeof item?.label === "string",
          )
          .slice(0, MAX_RECENT_PATHS)
      : [];
  } catch {
    return [];
  }
}

function storeRecentFileManagerLocations(
  locations: FileManagerLocation[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENT_PATHS_STORAGE_KEY,
      JSON.stringify(locations.slice(0, MAX_RECENT_PATHS)),
    );
  } catch {
    // Ignore storage quota/private-mode failures; navigation should keep working.
  }
}

function loadFavoriteBookmarkTree(): FileManagerBookmarkItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FAVORITE_PATHS_STORAGE_KEY) || "[]",
    ) as unknown;
    return normalizeFavoriteBookmarkTree(parsed).slice(
      0,
      MAX_FAVORITE_BOOKMARK_ITEMS,
    );
  } catch {
    return [];
  }
}

function storeFavoriteBookmarkTree(tree: FileManagerBookmarkItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FAVORITE_PATHS_STORAGE_KEY,
      JSON.stringify(trimFavoriteBookmarkTree(tree)),
    );
  } catch {
    // Favorites are convenience-only; storage failures must not block file access.
  }
}

function normalizeFavoriteBookmarkTree(
  value: unknown,
): FileManagerBookmarkItem[] {
  if (!Array.isArray(value)) return [];
  const normalized = value.flatMap((item) =>
    normalizeFavoriteBookmarkItem(item),
  );
  return trimFavoriteBookmarkTree(normalized);
}

function normalizeFavoriteBookmarkItem(
  value: unknown,
): FileManagerBookmarkItem[] {
  if (!value || typeof value !== "object") return [];
  const candidate = value as Partial<FileManagerBookmarkItem> &
    Partial<FileManagerLocation>;
  if (candidate.type === "folder") {
    const title = sanitizeBookmarkTitle(candidate.title, "文件夹");
    return [
      {
        id:
          typeof candidate.id === "string" ? candidate.id : createBookmarkId(),
        type: "folder",
        title,
        children: normalizeFavoriteBookmarkTree(candidate.children),
      },
    ];
  }
  const location = normalizeFavoriteLocationCandidate(
    candidate.location ?? candidate,
  );
  if (!location) return [];
  return [
    createFavoriteBookmark(
      location,
      sanitizeBookmarkTitle(
        candidate.title ?? location.displayName,
        displayNameForFavoriteLocation(location),
      ),
      typeof candidate.id === "string" ? candidate.id : undefined,
    ),
  ];
}

function normalizeFavoriteLocationCandidate(
  value: unknown,
): FileManagerLocation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<FileManagerLocation>;
  if (
    typeof candidate.rootId !== "string" ||
    typeof candidate.directoryPath !== "string" ||
    typeof candidate.label !== "string"
  ) {
    return null;
  }
  return {
    rootId: candidate.rootId,
    directoryPath: normalizeRelativePathForUi(candidate.directoryPath),
    label: normalizeAbsolutePath(candidate.label),
    displayName:
      typeof candidate.displayName === "string" && candidate.displayName.trim()
        ? candidate.displayName.trim()
        : undefined,
  };
}

function trimFavoriteBookmarkTree(
  tree: FileManagerBookmarkItem[],
): FileManagerBookmarkItem[] {
  let remaining = MAX_FAVORITE_BOOKMARK_ITEMS;
  const visit = (
    items: FileManagerBookmarkItem[],
  ): FileManagerBookmarkItem[] => {
    const next: FileManagerBookmarkItem[] = [];
    for (const item of items) {
      if (remaining <= 0) break;
      remaining -= 1;
      if (item.type === "folder") {
        next.push({
          id: item.id || createBookmarkId(),
          type: "folder",
          title: sanitizeBookmarkTitle(item.title, "文件夹"),
          children: visit(item.children ?? []),
        });
      } else if (item.location) {
        next.push(
          createFavoriteBookmark(
            item.location,
            sanitizeBookmarkTitle(
              item.title,
              displayNameForFavoriteLocation(item.location),
            ),
            item.id,
          ),
        );
      }
    }
    return next;
  };
  return visit(tree);
}

function createFavoriteFolder(title: string): FileManagerBookmarkItem {
  return {
    id: createBookmarkId(),
    type: "folder",
    title: sanitizeBookmarkTitle(title, "文件夹"),
    children: [],
  };
}

function createFavoriteBookmark(
  location: FileManagerLocation,
  title?: string,
  id?: string,
): FileManagerBookmarkItem {
  const normalized: FileManagerLocation = {
    rootId: location.rootId,
    directoryPath: normalizeRelativePathForUi(location.directoryPath),
    label: normalizeAbsolutePath(location.label),
    displayName: location.displayName,
  };
  return {
    id: id || createBookmarkId(),
    type: "bookmark",
    title: sanitizeBookmarkTitle(
      title,
      displayNameForFavoriteLocation(normalized),
    ),
    location: normalized,
  };
}

function createBookmarkId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `bookmark:${crypto.randomUUID()}`;
  }
  return `bookmark:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2)}`;
}

function sanitizeBookmarkTitle(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function displayNameForFavoriteLocation(location: FileManagerLocation): string {
  if (location.displayName?.trim()) return location.displayName.trim();
  const parts = (location.label || location.directoryPath || location.rootId)
    .split("/")
    .filter(Boolean);
  return parts.at(-1) || location.label || "root";
}

function flattenFavoriteBookmarkLocations(
  tree: FileManagerBookmarkItem[],
): FileManagerLocation[] {
  const locations: FileManagerLocation[] = [];
  const visit = (items: FileManagerBookmarkItem[]) => {
    for (const item of items) {
      if (item.type === "bookmark" && item.location)
        locations.push(item.location);
      if (item.type === "folder" && item.children) visit(item.children);
    }
  };
  visit(tree);
  return locations;
}

function countFavoriteBookmarks(tree: FileManagerBookmarkItem[]): number {
  return flattenFavoriteBookmarkLocations(tree).length;
}

function addFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  parentId: string | undefined,
  item: FileManagerBookmarkItem,
): FileManagerBookmarkItem[] {
  if (!parentId) return trimFavoriteBookmarkTree([...tree, item]);
  let inserted = false;
  const visit = (items: FileManagerBookmarkItem[]): FileManagerBookmarkItem[] =>
    items.map((current) => {
      if (current.type !== "folder") return current;
      if (current.id === parentId) {
        inserted = true;
        return {
          ...current,
          children: [...(current.children ?? []), item],
        };
      }
      return {
        ...current,
        children: visit(current.children ?? []),
      };
    });
  const next = visit(tree);
  return trimFavoriteBookmarkTree(inserted ? next : [...next, item]);
}

function updateFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  itemId: string,
  updater: (item: FileManagerBookmarkItem) => FileManagerBookmarkItem,
): FileManagerBookmarkItem[] {
  return tree.map((item) => {
    if (item.id === itemId) return updater(item);
    if (item.type === "folder") {
      return {
        ...item,
        children: updateFavoriteBookmarkItem(
          item.children ?? [],
          itemId,
          updater,
        ),
      };
    }
    return item;
  });
}

function removeFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  itemId: string,
): FileManagerBookmarkItem[] {
  return tree
    .filter((item) => item.id !== itemId)
    .map((item) =>
      item.type === "folder"
        ? {
            ...item,
            children: removeFavoriteBookmarkItem(item.children ?? [], itemId),
          }
        : item,
    );
}

function moveFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  itemId: string,
  targetParentId: string | undefined,
  targetIndex: number,
): FileManagerBookmarkItem[] {
  if (itemId === targetParentId) return tree;
  const extracted = extractFavoriteBookmarkItem(tree, itemId);
  if (!extracted.item) return tree;
  if (
    targetParentId &&
    favoriteBookmarkItemContains(extracted.item, targetParentId)
  ) {
    return tree;
  }
  const adjustedTargetIndex =
    extracted.parentId === targetParentId && extracted.index < targetIndex
      ? targetIndex - 1
      : targetIndex;
  const next = insertFavoriteBookmarkItem(
    extracted.tree,
    targetParentId,
    extracted.item,
    adjustedTargetIndex,
  );
  return trimFavoriteBookmarkTree(next);
}

function extractFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  itemId: string,
  parentId?: string,
): {
  item?: FileManagerBookmarkItem;
  tree: FileManagerBookmarkItem[];
  parentId?: string;
  index: number;
} {
  let found: FileManagerBookmarkItem | undefined;
  let foundParentId: string | undefined;
  let foundIndex = -1;
  const visit = (
    items: FileManagerBookmarkItem[],
    currentParentId?: string,
  ): FileManagerBookmarkItem[] =>
    items.flatMap((item, index) => {
      if (item.id === itemId) {
        found = item;
        foundParentId = currentParentId;
        foundIndex = index;
        return [];
      }
      if (item.type === "folder") {
        return [
          {
            ...item,
            children: visit(item.children ?? [], item.id),
          },
        ];
      }
      return [item];
    });
  const nextTree = visit(tree, parentId);
  return {
    item: found,
    tree: nextTree,
    parentId: foundParentId,
    index: foundIndex,
  };
}

function insertFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  parentId: string | undefined,
  item: FileManagerBookmarkItem,
  targetIndex: number,
): FileManagerBookmarkItem[] {
  if (!parentId) return insertAtIndex(tree, item, targetIndex);
  let inserted = false;
  const visit = (items: FileManagerBookmarkItem[]): FileManagerBookmarkItem[] =>
    items.map((current) => {
      if (current.type !== "folder") return current;
      if (current.id === parentId) {
        inserted = true;
        return {
          ...current,
          children: insertAtIndex(current.children ?? [], item, targetIndex),
        };
      }
      return {
        ...current,
        children: visit(current.children ?? []),
      };
    });
  const next = visit(tree);
  return inserted ? next : insertAtIndex(next, item, targetIndex);
}

function insertAtIndex(
  items: FileManagerBookmarkItem[],
  item: FileManagerBookmarkItem,
  index: number,
): FileManagerBookmarkItem[] {
  const next = [...items];
  const boundedIndex = Math.max(0, Math.min(index, next.length));
  next.splice(boundedIndex, 0, item);
  return next;
}

function favoriteBookmarkItemContains(
  item: FileManagerBookmarkItem,
  childId: string,
): boolean {
  if (item.id === childId) return true;
  if (item.type !== "folder") return false;
  return (item.children ?? []).some((child) =>
    favoriteBookmarkItemContains(child, childId),
  );
}

function removeFavoriteBookmarksMatchingLocation(
  tree: FileManagerBookmarkItem[],
  location: FileManagerLocation,
): FileManagerBookmarkItem[] {
  return tree
    .filter(
      (item) =>
        item.type !== "bookmark" ||
        !item.location ||
        !sameLocation(item.location, location),
    )
    .map((item) =>
      item.type === "folder"
        ? {
            ...item,
            children: removeFavoriteBookmarksMatchingLocation(
              item.children ?? [],
              location,
            ),
          }
        : item,
    );
}

function findFavoriteBookmarkItem(
  tree: FileManagerBookmarkItem[],
  itemId: string,
): FileManagerBookmarkItem | undefined {
  for (const item of tree) {
    if (item.id === itemId) return item;
    if (item.type === "folder") {
      const child = findFavoriteBookmarkItem(item.children ?? [], itemId);
      if (child) return child;
    }
  }
  return undefined;
}

function loadDirectoryTabLocations(
  fallback: FileManagerDirectoryTab,
): FileManagerDirectoryTab[] {
  if (typeof window === "undefined") return [fallback];
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(DIRECTORY_TABS_STORAGE_KEY) || "[]",
    ) as FileManagerLocation[];
    return Array.isArray(parsed)
      ? parsed
          .filter(
            (item) =>
              typeof item?.rootId === "string" &&
              typeof item?.directoryPath === "string" &&
              typeof item?.label === "string",
          )
          .map((item) => ({
            id:
              typeof (item as unknown as { id?: unknown }).id === "string"
                ? (item as unknown as { id: string }).id
                : createDirectoryTabId(),
            rootId: item.rootId,
            directoryPath: normalizeRelativePathForUi(item.directoryPath),
            label: normalizeAbsolutePath(item.label),
            displayName:
              typeof (item as unknown as { displayName?: unknown })
                .displayName === "string"
                ? (item as unknown as { displayName: string }).displayName
                : undefined,
          }))
          .slice(0, MAX_DIRECTORY_TABS)
      : [fallback];
  } catch {
    return [fallback];
  }
}

function storeDirectoryTabLocations(
  locations: FileManagerDirectoryTab[],
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      DIRECTORY_TABS_STORAGE_KEY,
      JSON.stringify(locations.slice(0, MAX_DIRECTORY_TABS)),
    );
  } catch {
    // Directory tabs are convenience-only; storage failures must not block file access.
  }
}

function loadFileManagerViewPreferences(): FileManagerViewPreferences {
  const fallback: FileManagerViewPreferences = {
    sort: { key: "name", direction: "asc" },
    density: "comfortable",
    columns: FILE_MANAGER_DEFAULT_COLUMNS,
    displayMode: "list",
    columnWidths: FILE_MANAGER_DEFAULT_COLUMN_WIDTHS,
  };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(VIEW_PREFERENCES_STORAGE_KEY) || "{}",
    ) as Partial<FileManagerViewPreferences>;
    return {
      sort: isValidSortState(parsed.sort) ? parsed.sort : fallback.sort,
      density:
        parsed.density === "compact" || parsed.density === "comfortable"
          ? parsed.density
          : fallback.density,
      columns: normalizeFileManagerColumns(parsed.columns),
      displayMode:
        parsed.displayMode === "grid" || parsed.displayMode === "list"
          ? parsed.displayMode
          : fallback.displayMode,
      columnWidths: normalizeFileManagerColumnWidths(parsed.columnWidths),
    };
  } catch {
    return fallback;
  }
}

function storeFileManagerViewPreferences(
  preferences: FileManagerViewPreferences,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VIEW_PREFERENCES_STORAGE_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // View preferences are user convenience only; file access must not depend on storage.
  }
}

function normalizeFileManagerColumns(value: unknown): FileManagerListColumn[] {
  if (!Array.isArray(value)) return FILE_MANAGER_DEFAULT_COLUMNS;
  const next = value
    .filter(
      (item): item is FileManagerListColumn =>
        item === "size" ||
        item === "modified" ||
        item === "type" ||
        item === "permissions" ||
        item === "owner",
    )
    .filter((item, index, list) => list.indexOf(item) === index);
  return next.length ? next : FILE_MANAGER_DEFAULT_COLUMNS;
}

function normalizeFileManagerColumnWidths(
  value: unknown,
): FileManagerColumnWidths {
  if (!value || typeof value !== "object")
    return FILE_MANAGER_DEFAULT_COLUMN_WIDTHS;
  const candidate = value as Partial<
    Record<keyof typeof FILE_MANAGER_DEFAULT_COLUMN_WIDTHS, unknown>
  >;
  return {
    name: normalizeColumnWidth(
      candidate.name,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.name,
      180,
      720,
    ),
    size: normalizeColumnWidth(
      candidate.size,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.size,
      88,
      220,
    ),
    modified: normalizeColumnWidth(
      candidate.modified,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.modified,
      132,
      300,
    ),
    type: normalizeColumnWidth(
      candidate.type,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.type,
      76,
      180,
    ),
    permissions: normalizeColumnWidth(
      candidate.permissions,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.permissions,
      116,
      220,
    ),
    owner: normalizeColumnWidth(
      candidate.owner,
      FILE_MANAGER_DEFAULT_COLUMN_WIDTHS.owner,
      92,
      180,
    ),
  };
}

function normalizeColumnWidth(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(Math.min(max, Math.max(min, value)))
    : fallback;
}

function isValidSortState(value: unknown): value is FileManagerSortState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<FileManagerSortState>;
  return (
    (candidate.key === "name" ||
      candidate.key === "size" ||
      candidate.key === "modified" ||
      candidate.key === "type" ||
      candidate.key === "permissions" ||
      candidate.key === "owner") &&
    (candidate.direction === "asc" || candidate.direction === "desc")
  );
}

function createDirectoryTabId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `tab:${crypto.randomUUID()}`;
  }
  return `tab:${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;
}

function createInitialDirectoryTab(
  session: FileManagerSessionState,
  defaultRootId: string,
): FileManagerDirectoryTab {
  const rootId = session.rootId || defaultRootId || "openclaw-root";
  const directoryPath = normalizeRelativePathForUi(session.directoryPath || "");
  return {
    id: session.activeDirectoryTabId || createDirectoryTabId(),
    rootId,
    directoryPath,
    label: directoryPath || "根目录",
  };
}

function createDirectoryTab(
  rootId: string,
  directoryPath: string,
  roots: Array<{ id: string; labelZh?: string; absolutePath: string }>,
): FileManagerDirectoryTab {
  const normalizedPath = normalizeRelativePathForUi(directoryPath);
  return {
    id: createDirectoryTabId(),
    rootId,
    directoryPath: normalizedPath,
    label: labelForDirectoryTab(roots, rootId, normalizedPath),
  };
}

function labelForDirectoryTab(
  roots: Array<{ id: string; labelZh?: string; absolutePath: string }>,
  rootId: string,
  directoryPath: string,
): string {
  const root = roots.find((item) => item.id === rootId);
  if (directoryPath)
    return directoryPath.split("/").filter(Boolean).at(-1) || directoryPath;
  return root?.labelZh || "根目录";
}

function normalizeDirectoryTabs(
  tabs: FileManagerDirectoryTab[],
): FileManagerDirectoryTab[] {
  const seen = new Set<string>();
  const normalized: FileManagerDirectoryTab[] = [];
  for (const tab of tabs) {
    const next = {
      ...tab,
      id: tab.id || createDirectoryTabId(),
      directoryPath: normalizeRelativePathForUi(tab.directoryPath),
      label: tab.label || tab.directoryPath || "根目录",
    };
    if (seen.has(next.id)) continue;
    seen.add(next.id);
    normalized.push(next);
  }
  return normalized.slice(-MAX_DIRECTORY_TABS);
}

function rememberFileManagerLocation(
  prev: FileManagerLocation[],
  location: FileManagerLocation,
): FileManagerLocation[] {
  const normalized: FileManagerLocation = {
    rootId: location.rootId,
    directoryPath: normalizeRelativePathForUi(location.directoryPath),
    label: normalizeAbsolutePath(location.label),
  };
  const next = [
    normalized,
    ...prev.filter(
      (item) =>
        item.rootId !== normalized.rootId ||
        normalizeRelativePathForUi(item.directoryPath) !==
          normalized.directoryPath,
    ),
  ].slice(0, MAX_RECENT_PATHS);
  storeRecentFileManagerLocations(next);
  return next;
}

function buildQuickLocations(
  favoriteLocations: FileManagerLocation[],
  recentLocations: FileManagerLocation[],
): FileManagerLocation[] {
  const seen = new Set<string>();
  const merged: FileManagerLocation[] = [];
  for (const location of [...favoriteLocations, ...recentLocations]) {
    const normalized = {
      ...location,
      directoryPath: normalizeRelativePathForUi(location.directoryPath),
    };
    const key = `${normalized.rootId}:${normalized.directoryPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(normalized);
  }
  return merged.slice(0, 12);
}

function buildPathSuggestions({
  input,
  rootId,
  rootAbsolutePath,
  entries,
  quickLocations,
}: {
  input: string;
  rootId: string;
  rootAbsolutePath: string | undefined;
  entries: FileEntrySummary[];
  quickLocations: FileManagerLocation[];
}): FileManagerLocation[] {
  const normalizedInput = normalizeAbsolutePath(input.trim());
  const query = normalizedInput.toLowerCase();
  const suggestions: FileManagerLocation[] = [];
  for (const location of quickLocations) {
    if (!query || location.label.toLowerCase().includes(query))
      suggestions.push(location);
    if (suggestions.length >= MAX_PATH_SUGGESTIONS) return suggestions;
  }
  const rootPath = normalizeAbsolutePath(rootAbsolutePath || "/");
  const tail = query.split("/").filter(Boolean).pop() || "";
  if (tail.length < 1) return suggestions;
  for (const entry of entries) {
    if (entry.kind !== "directory") continue;
    if (!entry.name.toLowerCase().startsWith(tail)) continue;
    const label =
      rootPath === "/"
        ? normalizeAbsolutePath(`/${entry.path}`)
        : normalizeAbsolutePath(`${rootPath}/${entry.path}`);
    suggestions.push({ rootId, directoryPath: entry.path, label });
    if (suggestions.length >= MAX_PATH_SUGGESTIONS) break;
  }
  return dedupeLocations(suggestions).slice(0, MAX_PATH_SUGGESTIONS);
}

function dedupeLocations(
  locations: FileManagerLocation[],
): FileManagerLocation[] {
  const seen = new Set<string>();
  return locations.filter((location) => {
    const key = `${location.rootId}:${normalizeRelativePathForUi(location.directoryPath)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sameLocation(
  left: FileManagerLocation,
  right: FileManagerLocation,
): boolean {
  return (
    left.rootId === right.rootId &&
    normalizeRelativePathForUi(left.directoryPath) ===
      normalizeRelativePathForUi(right.directoryPath)
  );
}

function normalizeRelativePathForUi(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/g, "");
}

const SUPPORTED_UNARCHIVE_EXTENSIONS = [
  ".tar.gz",
  ".tar.gzip",
  ".tgz",
  ".tar.bz2",
  ".tar.bzip2",
  ".tbz",
  ".tbz2",
  ".tb2",
  ".tar.xz",
  ".tar.lzma",
  ".txz",
  ".tlz",
  ".zip",
  ".tar",
];

function isSupportedArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return SUPPORTED_UNARCHIVE_EXTENSIONS.some((extension) =>
    lower.endsWith(extension),
  );
}

function normalizeOperationPath(value: string): string {
  return value
    .replace(/ \(已跳过\)$/u, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/g, "");
}

function parentOf(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function displayDir(dir: string): string {
  return dir || "/";
}

function absoluteDisplayPath(
  rootAbsolutePath: string | undefined,
  directoryPath: string,
): string {
  const rootPath = normalizeAbsolutePath(rootAbsolutePath || "/");
  return normalizeAbsolutePath(
    directoryPath ? `${rootPath}/${directoryPath}` : rootPath,
  );
}

function resolvePathInput(
  value: string,
  roots: Array<{ id: string; absolutePath: string }>,
  currentRootId: string,
): { rootId: string; directoryPath: string } {
  const input = value.trim();
  if (!input || input === "/") {
    const systemRoot = roots.find(
      (root) => normalizeAbsolutePath(root.absolutePath) === "/",
    );
    return { rootId: systemRoot?.id ?? currentRootId, directoryPath: "" };
  }
  if (input.startsWith("/")) {
    const normalizedInput = normalizeAbsolutePath(input);
    const candidates = roots
      .map((root) => ({
        ...root,
        normalized: normalizeAbsolutePath(root.absolutePath),
      }))
      .filter(
        (root) =>
          normalizedInput === root.normalized ||
          normalizedInput.startsWith(`${root.normalized.replace(/\/$/, "")}/`),
      )
      .sort((a, b) => b.normalized.length - a.normalized.length);
    const root =
      candidates[0] ??
      roots.find((entry) => entry.id === currentRootId) ??
      roots[0];
    const rootPath = normalizeAbsolutePath(root?.absolutePath || "/");
    const relative =
      rootPath === "/"
        ? normalizedInput.replace(/^\/+/, "")
        : normalizedInput.slice(rootPath.length).replace(/^\/+/, "");
    return { rootId: root?.id ?? currentRootId, directoryPath: relative };
  }
  return { rootId: currentRootId, directoryPath: input.replace(/^\/+/, "") };
}

function normalizeAbsolutePath(value: string): string {
  const normalized = value.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (!normalized || normalized === ".") return "/";
  return normalized.length > 1 ? normalized.replace(/\/$/, "") : normalized;
}

function extensionOf(name: string): string | null {
  const index = name.lastIndexOf(".");
  if (index <= 0 || index === name.length - 1) return null;
  return name.slice(index + 1).toLowerCase();
}

function defaultArchiveName(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  return `archive-${stamp}.zip`;
}

export default FileManagerPage;
