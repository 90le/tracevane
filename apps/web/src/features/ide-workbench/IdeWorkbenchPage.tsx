import * as React from "react";
import { useParams } from "react-router-dom";
import type { SerializedDockview } from "dockview-react";
import {
  AlertCircle,
  Bug,
  Command,
  Files,
  GitBranch,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Package,
  PanelBottomOpen,
  PanelRightOpen,
  Play,
  RotateCcw,
  Search,
  Terminal,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/design/ui/dialog";
import { useFilesSummaryQuery } from "@/lib/query/files";
import { editorDocumentId, editorTitleForPath } from "@/shared/editor-core";
import type { EditorSaveState } from "@/shared/editor-core";
import { isExplorerPathInside, joinExplorerPath, normalizeExplorerPath } from "@/shared/explorer-core";
import type { ExplorerEntry } from "@/shared/explorer-core";
import { EditorDock } from "./editor";
import { IdeCommandPalette } from "./command-palette";
import { saveIdeEditorTab } from "./editor/ideEditorRuntime";
import { IdeExplorerView } from "./explorer";
import { IdeSearchView, type IdeSearchResultOpenRequest } from "./search";
import { IdeSourceControlView, type IdeGitDecoratedChange, useIdeGitStatus } from "./git";
import { IdeProblemsPanel, appendWorkbenchProblem, removeWorkbenchProblem, type WorkbenchProblem } from "./problems";
import { IdeOutputPanel, appendWorkbenchOutput } from "./output";
import { DebugConsolePanel, DebugGatewayBridge, IdeDebugView, useIdeDebugSnapshot } from "./debug";
import { TerminalPanel } from "./terminal";
import type { IdeExplorerPathEvent } from "./explorer";
import { useIdeWorkbenchLayoutState } from "./layoutState";
import { useWorkbenchFileEvents, type WorkbenchFileEvent } from "./watcher";
import type {
  IdeWorkbenchEditorFileMetadata,
  IdeWorkbenchEditorRevealRange,
  IdeWorkbenchEditorTab,
  WorkbenchActivityId,
  WorkbenchPanelId,
  WorkbenchPanelPlacement,
} from "./types";
import type { GitStatusPayload } from "../../../../../types/git";
import { IDE_ACTIVITY_LABELS, IDE_PANEL_LABELS } from "./types";

const ACTIVITY_ITEMS: Array<{
  id: WorkbenchActivityId;
  icon: React.ReactNode;
  disabled?: boolean;
}> = [
  { id: "explorer", icon: <Files /> },
  { id: "search", icon: <Search /> },
  { id: "git", icon: <GitBranch /> },
  { id: "run", icon: <Play /> },
  { id: "extensions", icon: <Package />, disabled: true },
];

const PANEL_ICONS: Record<WorkbenchPanelId, React.ReactNode> = {
  terminal: <Terminal />,
  problems: <AlertCircle />,
  output: <ListChecks />,
  debugConsole: <Bug />,
};

interface IdeEditorCloseRequest {
  tabIds: string[];
  dirtyTabs: IdeWorkbenchEditorTab[];
}

export function IdeWorkbenchPage() {
  const { workspaceId } = useParams();
  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];
  const routeRoot = workspaceId ? decodeURIComponent(workspaceId) : "";
  const rootId = roots.some((root) => root.id === routeRoot)
    ? routeRoot
    : summary.data?.defaultRootId ?? roots[0]?.id ?? routeRoot;
  const root = roots.find((entry) => entry.id === rootId) ?? null;
  const layoutApi = useIdeWorkbenchLayoutState(rootId || "pending-root");
  const { layout } = layoutApi;
  const directoryPath = layout.explorer.directoryPath;
  const gitStatus = useIdeGitStatus(rootId, directoryPath);
  const [closeRequest, setCloseRequest] = React.useState<IdeEditorCloseRequest | null>(null);
  const [closeSaving, setCloseSaving] = React.useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const debugSnapshot = useIdeDebugSnapshot();

  const openFilePath = React.useCallback(
    (fileRef: { rootId: string; path: string }, options: { pinned?: boolean; reveal?: IdeWorkbenchEditorRevealRange } = {}) => {
      const pinned = Boolean(options.pinned);
      const tab: IdeWorkbenchEditorTab = {
        id: editorDocumentId({ rootId: fileRef.rootId, path: fileRef.path }),
        ref: { rootId: fileRef.rootId, path: fileRef.path },
        title: editorTitleForPath(fileRef.path),
        preview: !pinned,
        pinned,
        dirty: false,
        reveal: options.reveal ?? null,
      };
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) => {
          if (group.id !== current.activeEditorGroupId) return group;
          const existing = group.tabs.find((item) => item.id === tab.id);
          if (existing) {
            return {
              ...group,
              activeTabId: existing.id,
              tabs: pinned
                ? group.tabs.map((item) => item.id === existing.id ? { ...item, preview: false, pinned: true, reveal: options.reveal ?? item.reveal ?? null } : item)
                : group.tabs.map((item) => item.id === existing.id ? { ...item, reveal: options.reveal ?? item.reveal ?? null } : item),
            };
          }

          if (pinned) {
            return {
              ...group,
              activeTabId: tab.id,
              tabs: [...group.tabs, tab],
            };
          }

          const previewIndex = group.tabs.findIndex(
            (item) => item.preview && !item.pinned && !item.dirty,
          );
          const tabs = previewIndex >= 0
            ? group.tabs.map((item, index) => (index === previewIndex ? tab : item))
            : [...group.tabs, tab];
          return {
            ...group,
            activeTabId: tab.id,
            tabs,
          };
        }),
      }));
    },
    [layoutApi],
  );

  const openEntry = React.useCallback(
    (entry: ExplorerEntry, options: { pinned?: boolean } = {}) => {
      if (entry.kind === "directory") {
        layoutApi.setExplorerDirectoryPath(entry.path);
        return;
      }
      openFilePath({ rootId: entry.rootId, path: entry.path }, options);
    },
    [layoutApi, openFilePath],
  );

  const openSearchResult = React.useCallback((request: IdeSearchResultOpenRequest) => {
    if (request.kind === "directory") {
      layoutApi.setExplorerDirectoryPath(request.path);
      layoutApi.setActiveActivityId("explorer");
      return;
    }
    openFilePath({ rootId: request.rootId, path: request.path }, {
      pinned: true,
      reveal: request.lineNumber
        ? { lineNumber: request.lineNumber, column: request.column ?? 1 }
        : undefined,
    });
  }, [layoutApi, openFilePath]);

  const openGitChangeDiff = React.useCallback((request: { rootId: string; change: IdeGitDecoratedChange }) => {
    const { change } = request;
    const diffTabId = `${editorDocumentId({ rootId: request.rootId, path: change.rootPath })}::git-diff::${change.staged ? "staged" : "working"}`;
    const tab: IdeWorkbenchEditorTab = {
      id: diffTabId,
      ref: { rootId: request.rootId, path: change.rootPath },
      title: `${editorTitleForPath(change.rootPath)} (diff)`,
      mode: "git-diff",
      gitDiff: {
        directoryPath,
        repoPath: change.path,
        previousPath: change.previousPath,
        rootPath: change.rootPath,
        staged: change.staged && !change.unstaged,
        untracked: change.kind === "untracked",
      },
      preview: false,
      pinned: true,
      dirty: false,
    };
    layoutApi.setLayout((current) => ({
      ...current,
      editorGroups: current.editorGroups.map((group) => {
        if (group.id !== current.activeEditorGroupId) return group;
        const existing = group.tabs.find((item) => item.id === tab.id);
        if (existing) {
          return {
            ...group,
            activeTabId: existing.id,
            tabs: group.tabs.map((item) => item.id === existing.id ? { ...item, gitDiff: tab.gitDiff, title: tab.title } : item),
          };
        }
        return { ...group, activeTabId: tab.id, tabs: [...group.tabs, tab] };
      }),
    }));
  }, [directoryPath, layoutApi]);

  const openProblem = React.useCallback((problem: WorkbenchProblem) => {
    if (!problem.path) return;
    openFilePath(
      { rootId: problem.rootId, path: problem.path },
      {
        pinned: true,
        reveal: problem.startLine ? { lineNumber: problem.startLine, column: problem.startColumn } : undefined,
      },
    );
  }, [openFilePath]);

  const openCommandPalette = React.useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = React.useCallback(() => setCommandPaletteOpen(false), []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isEditable = Boolean(target?.isContentEditable || tagName === "input" || tagName === "textarea" || tagName === "select");
      const wantsPalette = event.key === "F1" || ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "p");
      if (!wantsPalette) return;
      if (isEditable && event.key !== "F1") return;
      event.preventDefault();
      openCommandPalette();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCommandPalette]);

  const openDebugLocation = React.useCallback((location: { rootId: string; path: string; lineNumber: number; column?: number | null }) => {
    openFilePath(
      { rootId: location.rootId, path: location.path },
      {
        pinned: true,
        reveal: { lineNumber: location.lineNumber, column: location.column ?? 1 },
      },
    );
  }, [openFilePath]);

  const lastDebugRevealKeyRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const location = debugSnapshot.activeStoppedLocation;
    if (!location) return;
    const key = `${location.sessionId}:${location.rootId}:${location.path}:${location.lineNumber}:${location.column ?? 1}`;
    if (lastDebugRevealKeyRef.current === key) return;
    lastDebugRevealKeyRef.current = key;
    openDebugLocation(location);
  }, [debugSnapshot.activeStoppedLocation, openDebugLocation]);

  const editorGroupsRef = React.useRef(layout.editorGroups);
  React.useEffect(() => {
    editorGroupsRef.current = layout.editorGroups;
  }, [layout.editorGroups]);

  const activeGroup = layout.editorGroups.find(
    (group) => group.id === layout.activeEditorGroupId,
  ) ?? layout.editorGroups[0];

  const setDockviewLayout = React.useCallback(
    (dockviewLayout: typeof layout.dockviewLayout) => {
      layoutApi.setLayout((current) => ({ ...current, dockviewLayout }));
    },
    [layoutApi],
  );

  const setActiveEditorTab = React.useCallback(
    (tabId: string | null) => {
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) =>
          group.id === current.activeEditorGroupId
            ? { ...group, activeTabId: tabId }
            : group,
        ),
      }));
    },
    [layoutApi],
  );

  const pinEditorTab = React.useCallback(
    (tabId: string) => {
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) => ({
          ...group,
          tabs: group.tabs.map((tab) =>
            tab.id === tabId ? { ...tab, preview: false, pinned: true } : tab,
          ),
        })),
      }));
    },
    [layoutApi],
  );
  const updateEditorTabDirty = React.useCallback(
    (tabId: string, dirty: boolean) => {
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) => ({
          ...group,
          tabs: group.tabs.map((tab) =>
            tab.id === tabId
              ? { ...tab, dirty, saveState: dirty ? "dirty" : "clean", saveError: dirty ? null : tab.saveError ?? null }
              : tab,
          ),
        })),
      }));
    },
    [layoutApi],
  );

  const updateEditorTabSaveState = React.useCallback(
    (tabId: string, saveState: EditorSaveState, message: string | null = null) => {
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) => ({
          ...group,
          tabs: group.tabs.map((tab) =>
            tab.id === tabId
              ? {
                  ...tab,
                  saveState,
                  dirty: saveState === "dirty" || saveState === "saving" || saveState === "error" ? tab.dirty || saveState === "error" : false,
                  saveError: message,
                  externalState: saveState === "saved" || saveState === "clean" ? undefined : tab.externalState,
                  externalMessage: saveState === "saved" || saveState === "clean" ? null : tab.externalMessage,
                }
              : tab,
          ),
        })),
      }));
    },
    [layoutApi],
  );

  const updateEditorTabMetadata = React.useCallback(
    (tabId: string, metadata: IdeWorkbenchEditorFileMetadata) => {
      layoutApi.setLayout((current) => {
        let changed = false;
        const editorGroups = current.editorGroups.map((group) => {
          const tabs = group.tabs.map((tab) => {
            if (tab.id !== tabId) return tab;
            if (sameEditorFileMetadata(tab.metadata, metadata)) return tab;
            changed = true;
            return { ...tab, metadata };
          });
          return changed ? { ...group, tabs } : group;
        });
        return changed ? { ...current, editorGroups } : current;
      });
    },
    [layoutApi],
  );

  const closeEditorTabsNow = React.useCallback((tabIds: string[]) => {
    const targets = new Set(tabIds);
    if (!targets.size) return;
    layoutApi.setLayout((current) => ({
      ...current,
      dockviewLayout: removeDockviewPanels(current.dockviewLayout, targets),
      editorGroups: current.editorGroups.map((group) => {
        const tabs = group.tabs.filter((tab) => !targets.has(tab.id));
        const activeTabId = group.activeTabId && !targets.has(group.activeTabId)
          ? group.activeTabId
          : tabs.at(-1)?.id ?? null;
        return { ...group, tabs, activeTabId };
      }),
    }));
  }, [layoutApi]);

  const requestCloseEditorTabs = React.useCallback((tabIds: string[]) => {
    const ids = [...new Set(tabIds)].filter(Boolean);
    if (!ids.length) return;
    const tabsById = new Map(editorGroupsRef.current.flatMap((group) => group.tabs.map((tab) => [tab.id, tab] as const)));
    const targetTabs = ids.map((id) => tabsById.get(id)).filter((tab): tab is IdeWorkbenchEditorTab => Boolean(tab));
    const dirtyTabs = targetTabs.filter((tab) => tab.dirty && !tab.deleted);
    if (!dirtyTabs.length) {
      closeEditorTabsNow(ids);
      return;
    }
    setCloseRequest({ tabIds: ids, dirtyTabs });
  }, [closeEditorTabsNow]);

  const resolveCloseRequest = React.useCallback(async (mode: "save" | "discard" | "cancel") => {
    const request = closeRequest;
    if (!request) return;
    if (mode === "cancel") {
      setCloseRequest(null);
      return;
    }
    if (mode === "discard") {
      closeEditorTabsNow(request.tabIds);
      setCloseRequest(null);
      return;
    }
    setCloseSaving(true);
    try {
      for (const tab of request.dirtyTabs) {
        const ok = await saveIdeEditorTab(tab.id);
        if (!ok) return;
      }
      closeEditorTabsNow(request.tabIds);
      setCloseRequest(null);
    } finally {
      setCloseSaving(false);
    }
  }, [closeEditorTabsNow, closeRequest]);


  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  ) ?? null;

  const saveActiveEditorTab = React.useCallback(() => {
    if (!activeTab) return;
    void saveIdeEditorTab(activeTab.id);
  }, [activeTab]);

  const closeActiveEditorTab = React.useCallback(() => {
    if (!activeTab) return;
    requestCloseEditorTabs([activeTab.id]);
  }, [activeTab, requestCloseEditorTabs]);

  const openTabs = React.useMemo(
    () =>
      layout.editorGroups.flatMap((group) =>
        group.tabs.map((tab) => ({
          rootId: tab.ref.rootId,
          path: tab.ref.path,
          dirty: tab.dirty,
          deleted: tab.deleted,
        })),
      ),
    [layout.editorGroups],
  );

  const handleExplorerPathEvent = React.useCallback((event: IdeExplorerPathEvent) => {
    layoutApi.setLayout((current) => {
      let replacements: Array<{ oldId: string; nextTab: IdeWorkbenchEditorTab }> = [];
      const editorGroups = current.editorGroups.map((group) => {
        let activeTabId = group.activeTabId;
        const tabs = group.tabs.map((tab) => {
          const nextTab = syncTabForPathEvent(tab, event);
          if (nextTab.id !== tab.id) {
            replacements.push({ oldId: tab.id, nextTab });
            if (activeTabId === tab.id) activeTabId = nextTab.id;
          }
          return nextTab;
        });
        return { ...group, activeTabId, tabs };
      });
      return {
        ...current,
        editorGroups,
        dockviewLayout: syncDockviewLayoutForTabReplacements(current.dockviewLayout, replacements),
      };
    });
  }, [layoutApi]);

  const handleWorkbenchFileEvent = React.useCallback((event: WorkbenchFileEvent) => {
    appendWorkbenchOutput({
      channel: { id: "watcher", label: "Watcher", kind: "watcher" },
      level: event.type === "deleted" ? "warn" : "info",
      text: `${event.type} ${event.kind}: ${event.path}`,
    });
    if (event.type === "deleted") {
      appendWorkbenchProblem({
        id: `watcher:deleted:${event.rootId}:${event.path}`,
        rootId: event.rootId,
        path: event.kind === "file" ? event.path : undefined,
        severity: "warning",
        source: "watcher",
        message: `文件已在磁盘上删除：${event.path}`,
      });
    } else if (event.type === "changed" && event.kind === "file") {
      removeWorkbenchProblem(`watcher:deleted:${event.rootId}:${event.path}`);
    }
    layoutApi.setLayout((current) => {
      let changed = false;
      const editorGroups = current.editorGroups.map((group) => {
        const tabs = group.tabs.map((tab) => {
          if (tab.ref.rootId !== event.rootId || tab.ref.path !== event.path) return tab;
          if (event.type === "deleted") {
            changed = true;
            if (tab.dirty) {
              return {
                ...tab,
                externalState: "deleted" as const,
                externalMessage: "文件已在磁盘上删除；未保存内容仍保留在编辑器中。",
              };
            }
            return {
              ...tab,
              deleted: true,
              externalState: "deleted" as const,
              externalMessage: "文件已在磁盘上删除。",
            };
          }
          if (event.type === "changed" && event.kind === "file") {
            changed = true;
            return {
              ...tab,
              externalState: "changed" as const,
              externalMessage: tab.dirty
                ? "文件已在磁盘上变更；当前未保存内容不会被自动覆盖。"
                : "文件已在磁盘上变更；请确认后重新读取。",
            };
          }
          return tab;
        });
        return changed ? { ...group, tabs } : group;
      });
      return changed ? { ...current, editorGroups } : current;
    });
  }, [layoutApi]);

  useWorkbenchFileEvents({
    rootId,
    directoryPath,
    enabled: Boolean(rootId),
    onEvent: handleWorkbenchFileEvent,
  });

  return (
    <div className="grid h-dvh min-h-0 w-screen max-w-full grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-canvas text-ink" data-ide-workbench>
      <DebugGatewayBridge rootId={rootId} cwd={directoryPath} enabled={Boolean(rootId)} />
      <WorkbenchHeader
        rootLabel={(root?.labelZh ?? root?.labelEn ?? rootId) || "未选择工作区"}
        rootPath={root?.absolutePath ?? "等待文件根目录加载"}
        onResetLayout={layoutApi.resetLayout}
        panelCollapsed={layout.panel.collapsed}
        panelPlacement={layout.panel.placement}
        onTogglePanel={layoutApi.togglePanel}
        onOpenCommandPalette={openCommandPalette}
      />
      <div className="grid min-h-0 min-w-0 grid-cols-[44px_minmax(0,1fr)] border-b border-line" data-ide-main-area>
        <ActivityBar
          activeActivityId={layout.activeActivityId}
          onSelect={(activityId) => {
            if (activityId === "explorer" && layout.activeActivityId === "explorer") {
              layoutApi.toggleSidebar();
              return;
            }
            layoutApi.setActiveActivityId(activityId);
          }}
        />
        <div
          className="relative grid min-h-0 min-w-0"
          style={{
            gridTemplateColumns: layout.sideBar.collapsed
              ? "0px minmax(0,1fr)"
              : `clamp(220px, ${layout.sideBar.width}px, calc(100vw - 44px)) minmax(0,1fr)`,
          }}
        >
          {layout.activeActivityId === "search" ? (
            <IdeSearchView
              hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
              rootId={rootId}
              rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
              directoryPath={directoryPath}
              onOpenResult={openSearchResult}
            />
          ) : layout.activeActivityId === "git" ? (
            <IdeSourceControlView
              hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
              rootId={rootId}
              rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
              git={gitStatus}
              onOpenDiff={openGitChangeDiff}
            />
          ) : layout.activeActivityId === "run" ? (
            <IdeDebugView
              hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
              rootId={rootId}
              cwd={directoryPath}
              activeFile={activeTab && activeTab.mode !== "git-diff" ? activeTab.ref : null}
              onOpenDebugConsole={() => layoutApi.setActivePanelId("debugConsole")}
              onOpenLocation={openDebugLocation}
            />
          ) : layout.activeActivityId === "explorer" ? (
            <IdeExplorerView
              hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
              rootId={rootId}
              rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
              rootAbsolutePath={root?.absolutePath}
              directoryPath={directoryPath}
              activeRootId={activeTab?.ref.rootId}
              activePath={activeTab?.ref.path}
              openTabs={openTabs}
              gitDecorations={gitStatus.byPath}
              onDirectoryPathChange={layoutApi.setExplorerDirectoryPath}
              onOpenEntry={openEntry}
              onPathEvent={(event) => {
                handleExplorerPathEvent(event);
                gitStatus.refresh();
              }}
            />
          ) : (
            <IdePendingActivityView
              hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
              title={IDE_ACTIVITY_LABELS[layout.activeActivityId]}
            />
          )}
          {!layout.sideBar.collapsed && layout.sideBar.visible ? (
            <SidebarResizeHandle
              left={layout.sideBar.width}
              width={layout.sideBar.width}
              onResize={layoutApi.setSidebarWidth}
            />
          ) : null}
          <div
            className={cn(
              "col-start-2 row-start-1 grid min-h-0 min-w-0 overflow-hidden",
              layout.panel.collapsed || layout.panel.maximized
                ? "grid-rows-[minmax(0,1fr)]"
                : layout.panel.placement === "right"
                  ? "grid-cols-[minmax(0,1fr)_minmax(0,var(--ide-panel-right-width))]"
                  : "grid-rows-[minmax(0,1fr)_auto]",
            )}
            style={{
              "--ide-panel-right-width": `${Math.max(240, layout.panel.rightWidth)}px`,
            } as React.CSSProperties}
            data-ide-editor-panel-stack
            data-ide-panel-stack-placement={layout.panel.placement}
          >
            {!layout.panel.maximized && (
              <EditorDock
                tabs={activeGroup?.tabs ?? []}
                activeTabId={activeGroup?.activeTabId ?? null}
                dockviewLayout={layout.dockviewLayout}
                onDockviewLayoutChange={setDockviewLayout}
                onActiveTabChange={setActiveEditorTab}
                onPinTab={pinEditorTab}
                onDirtyChange={updateEditorTabDirty}
                onSaveStateChange={updateEditorTabSaveState}
                onFileMetadataChange={updateEditorTabMetadata}
                onRequestCloseTabs={requestCloseEditorTabs}
                gitDecorations={gitStatus.byPath}
              />
            )}
            <PanelArea
              panel={layout.panel}
              rootId={rootId}
              rootAbsolutePath={root?.absolutePath}
              directoryPath={directoryPath}
              onTogglePanel={layoutApi.togglePanel}
              onToggleMaximized={layoutApi.togglePanelMaximized}
              onActivePanelChange={layoutApi.setActivePanelId}
              onResizePanel={layoutApi.setPanelSize}
              onPanelPlacementChange={layoutApi.setPanelPlacement}
              onOpenProblem={openProblem}
            />
          </div>
        </div>
      </div>
      <IdeCommandPalette
        open={commandPaletteOpen}
        rootId={rootId}
        rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
        directoryPath={directoryPath}
        activeTab={activeTab}
        onClose={closeCommandPalette}
        onOpenActivity={layoutApi.setActiveActivityId}
        onSaveActiveTab={saveActiveEditorTab}
        onCloseActiveTab={closeActiveEditorTab}
        onOpenSymbol={(request) => openFilePath({ rootId: request.rootId, path: request.path }, { pinned: true, reveal: request.reveal })}
      />
      <IdeEditorCloseConfirmDialog
        request={closeRequest}
        saving={closeSaving}
        onResolve={resolveCloseRequest}
      />
      <WorkbenchStatusBar
        rootId={rootId}
        directoryPath={directoryPath}
        sideBarCollapsed={layout.sideBar.collapsed}
        panelCollapsed={layout.panel.collapsed}
        activePanelId={layout.panel.activePanelId}
        activeTab={activeTab}
        git={gitStatus.status}
      />
    </div>
  );
}

function IdeEditorCloseConfirmDialog({
  request,
  saving,
  onResolve,
}: {
  request: IdeEditorCloseRequest | null;
  saving: boolean;
  onResolve: (mode: "save" | "discard" | "cancel") => void;
}) {
  const dirtyCount = request?.dirtyTabs.length ?? 0;
  return (
    <Dialog open={Boolean(request)} onOpenChange={(open) => { if (!open && !saving) onResolve("cancel"); }}>
      <DialogContent showClose={false} data-ide-editor-close-confirm>
        <DialogHeader>
          <DialogTitle>保存对文件的更改？</DialogTitle>
          <DialogDescription>
            {dirtyCount > 1
              ? `有 ${dirtyCount} 个文件包含未保存更改。`
              : `文件 ${request?.dirtyTabs[0]?.title ?? ""} 包含未保存更改。`}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="max-h-40 overflow-auto rounded-md border border-line bg-canvas p-2 text-xs text-muted">
            {(request?.dirtyTabs ?? []).map((tab) => (
              <div key={tab.id} className="truncate font-mono" data-ide-editor-close-confirm-path>
                {tab.ref.path}
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onResolve("cancel")} disabled={saving} data-ide-editor-close-cancel>
            取消
          </Button>
          <Button variant="outline" onClick={() => onResolve("discard")} disabled={saving} data-ide-editor-close-discard>
            不保存
          </Button>
          <Button onClick={() => onResolve("save")} disabled={saving} data-ide-editor-close-save>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkbenchHeader({
  rootLabel,
  rootPath,
  onResetLayout,
  panelCollapsed,
  panelPlacement,
  onTogglePanel,
  onOpenCommandPalette,
}: {
  rootLabel: string;
  rootPath: string;
  onResetLayout: () => void;
  panelCollapsed: boolean;
  panelPlacement: WorkbenchPanelPlacement;
  onTogglePanel: () => void;
  onOpenCommandPalette: () => void;
}) {
  return (
    <header className="flex min-h-[50px] min-w-0 items-center gap-3 border-b border-line bg-panel px-3" data-ide-header>
      <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-semibold text-primary-ink">
        IDE
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-strong">
          Tracevane IDE Workbench
        </div>
        <div className="truncate text-xs text-subtle">
          {rootLabel} · {rootPath}
        </div>
      </div>
      {panelCollapsed ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onTogglePanel}
          aria-label="展开底部/右侧面板"
          title={panelPlacement === "right" ? "展开右侧面板" : "展开底部面板"}
          data-ide-panel-restore-button
        >
          {panelPlacement === "right" ? <PanelRightOpen /> : <PanelBottomOpen />}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="sm"
        onClick={onOpenCommandPalette}
        title="命令面板（F1 / Ctrl+Shift+P）"
        aria-label="打开命令面板"
        data-ide-command-palette-button
      >
        <Command />
        <span className="hidden sm:inline">命令</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={onResetLayout}>
        <RotateCcw />
        <span className="hidden sm:inline">重置布局</span>
      </Button>
    </header>
  );
}

function SidebarResizeHandle({
  left,
  width,
  onResize,
}: {
  left: number;
  width: number;
  onResize: (width: number) => void;
}) {
  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const containerWidth = event.currentTarget.parentElement?.clientWidth ?? 0;
    const maxWidth = containerWidth > 0 ? Math.floor(containerWidth * 0.75) : 1600;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      onResize(clampNumber(startWidth + moveEvent.clientX - startX, 220, maxWidth));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [onResize, width]);

  return (
    <div
      role="separator"
      aria-label="调整资源管理器宽度"
      aria-orientation="vertical"
      className="absolute bottom-0 top-0 z-20 w-2 -translate-x-1 cursor-col-resize touch-none bg-transparent outline-none transition-colors hover:bg-primary-soft/70 focus-visible:bg-primary-soft focus-visible:shadow-[var(--ring)]"
      style={{ left }}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      data-ide-sidebar-resize-handle
    />
  );
}

function ActivityBar({
  activeActivityId,
  onSelect,
}: {
  activeActivityId: WorkbenchActivityId;
  onSelect: (id: WorkbenchActivityId) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col items-center gap-1 border-r border-line bg-panel-2 py-2" data-ide-activity-bar>
      {ACTIVITY_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={item.disabled}
          aria-label={IDE_ACTIVITY_LABELS[item.id]}
          title={
            item.disabled
              ? `${IDE_ACTIVITY_LABELS[item.id]}（后续阶段）`
              : IDE_ACTIVITY_LABELS[item.id]
          }
          onClick={() => onSelect(item.id)}
          className={cn(
            "grid size-9 place-items-center rounded-sm border border-transparent text-muted outline-none transition-colors focus-visible:shadow-[var(--ring)] [&_svg]:size-4",
            activeActivityId === item.id &&
              "border-primary-line bg-primary-soft text-primary",
            !item.disabled && "hover:border-line hover:bg-panel hover:text-ink",
            item.disabled && "cursor-not-allowed opacity-45",
          )}
        >
          {item.icon}
        </button>
      ))}
    </aside>
  );
}

function IdePendingActivityView({ hidden, title }: { hidden: boolean; title: string }) {
  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" data-ide-sidebar-hidden />;
  return (
    <aside className="grid min-h-0 min-w-0 place-items-center border-r border-line bg-panel p-4" data-ide-sidebar data-ide-pending-activity>
      <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-3 text-center text-sm text-muted">
        <div className="font-semibold text-ink-strong">{title}</div>
        <div className="mt-1 text-xs">该视图将在后续阶段接入。</div>
      </div>
    </aside>
  );
}

function PanelArea({
  panel,
  rootId,
  rootAbsolutePath,
  directoryPath,
  className,
  onTogglePanel,
  onToggleMaximized,
  onActivePanelChange,
  onResizePanel,
  onPanelPlacementChange,
  onOpenProblem,
}: {
  panel: {
    placement: WorkbenchPanelPlacement;
    collapsed: boolean;
    size: number;
    bottomSize: number;
    rightWidth: number;
    maximized: boolean;
    activePanelId: WorkbenchPanelId;
  };
  rootId: string;
  rootAbsolutePath?: string;
  directoryPath: string;
  className?: string;
  onTogglePanel: () => void;
  onToggleMaximized: () => void;
  onActivePanelChange: (id: WorkbenchPanelId) => void;
  onResizePanel: (size: number) => void;
  onPanelPlacementChange: (placement: WorkbenchPanelPlacement) => void;
  onOpenProblem: (problem: WorkbenchProblem) => void;
}) {
  const isRight = panel.placement === "right";
  const panelStyle = panel.maximized
    ? { width: "100%", height: "100%" }
    : isRight
      ? { width: "100%", maxWidth: "100%" }
      : { height: panel.bottomSize, maxHeight: "100%" };

  if (panel.collapsed) {
    return null;
  }

  return (
    <section
      data-ide-panel
      data-ide-panel-placement={panel.placement}
      data-ide-panel-maximized={panel.maximized ? "true" : "false"}
      className={cn(
        "relative grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] bg-panel",
        isRight ? "border-l border-line" : "border-t border-line",
        className,
      )}
      style={panelStyle}
    >
      {!panel.maximized ? (
        <PanelResizeHandle placement={panel.placement} size={panel.size} onResize={onResizePanel} />
      ) : null}
      <div className="flex min-h-9 min-w-0 items-center gap-1 border-b border-line bg-panel-2 px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {(Object.keys(IDE_PANEL_LABELS) as WorkbenchPanelId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onActivePanelChange(id)}
              className={cn(
                "inline-flex min-h-7 shrink-0 items-center gap-1.5 rounded-sm border border-transparent px-2 text-sm text-muted outline-none focus-visible:shadow-[var(--ring)] [&_svg]:size-3.5",
                panel.activePanelId === id &&
                  "border-primary-line bg-primary-soft text-ink-strong",
              )}
            >
              {PANEL_ICONS[id]}
              {IDE_PANEL_LABELS[id]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {isRight ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPanelPlacementChange("bottom")}
              aria-label="Move Panel Bottom"
              title="Move Panel Bottom"
            >
              <PanelBottomOpen />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onPanelPlacementChange("right")}
              aria-label="Move Panel Right"
              title="Move Panel Right"
            >
              <PanelRightOpen />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMaximized}
            aria-label={panel.maximized ? "恢复 Panel 大小" : "最大化 Panel"}
            title={panel.maximized ? "向下恢复面板大小" : "向上最大化面板"}
          >
            {panel.maximized ? <ChevronDown /> : <ChevronUp />}
          </Button>
          <Button variant="ghost" size="icon" onClick={onTogglePanel} aria-label="关闭 Panel" title="关闭面板">
            <X />
          </Button>
        </div>
      </div>
      {panel.activePanelId === "terminal" ? (
        <TerminalPanel rootId={rootId} rootAbsolutePath={rootAbsolutePath} cwd={directoryPath} active placement={panel.placement} />
      ) : panel.activePanelId === "problems" ? (
        <IdeProblemsPanel rootId={rootId} onOpenProblem={onOpenProblem} />
      ) : panel.activePanelId === "output" ? (
        <IdeOutputPanel />
      ) : (
        <DebugConsolePanel />
      )}
    </section>
  );
}

function PanelResizeHandle({
  placement,
  size,
  onResize,
}: {
  placement: WorkbenchPanelPlacement;
  size: number;
  onResize: (size: number) => void;
}) {
  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = size;
    const stack = event.currentTarget.closest<HTMLElement>("[data-ide-editor-panel-stack]");
    const stackSize = placement === "right"
      ? stack?.clientWidth ?? window.innerWidth
      : stack?.clientHeight ?? window.innerHeight;
    const maxSize = Math.max(placement === "right" ? 320 : 140, Math.floor(stackSize));
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextSize = placement === "right"
        ? startSize + startX - moveEvent.clientX
        : startSize + startY - moveEvent.clientY;
      onResize(clampNumber(nextSize, placement === "right" ? 240 : 140, maxSize));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [onResize, placement, size]);

  if (placement === "right") {
    return (
      <div
        role="separator"
        aria-label="调整右侧面板宽度"
        aria-orientation="vertical"
        className="absolute bottom-0 left-0 top-0 z-20 w-2 -translate-x-1 cursor-col-resize touch-none bg-transparent outline-none transition-colors hover:bg-primary-soft/70 focus-visible:bg-primary-soft focus-visible:shadow-[var(--ring)]"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        data-ide-panel-resize-handle
      />
    );
  }

  return (
    <div
      role="separator"
      aria-label="调整底部面板高度"
      aria-orientation="horizontal"
      className="absolute left-0 right-0 top-0 z-20 h-2 -translate-y-1 cursor-row-resize touch-none bg-transparent outline-none transition-colors hover:bg-primary-soft/70 focus-visible:bg-primary-soft focus-visible:shadow-[var(--ring)]"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      data-ide-panel-resize-handle
    />
  );
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(min, Math.round(value)), Math.max(min, max));
}

function syncTabForPathEvent(
  tab: IdeWorkbenchEditorTab,
  event: IdeExplorerPathEvent,
): IdeWorkbenchEditorTab {
  if (tab.ref.rootId !== event.rootId) return tab;
  if (event.type === "deleted") {
    if (!pathTouchesTarget(event.path, event.targetKind, tab.ref.path)) return tab;
    return { ...tab, deleted: true };
  }
  const nextPath = rebasePathForMove(event.oldPath, event.newPath, event.targetKind, tab.ref.path);
  if (!nextPath) return tab;
  const nextRef = { rootId: tab.ref.rootId, path: nextPath };
  return {
    ...tab,
    id: editorDocumentId(nextRef),
    ref: nextRef,
    title: editorTitleForPath(nextPath),
    deleted: false,
    externalState: undefined,
    externalMessage: null,
  };
}

function sameEditorFileMetadata(
  left: IdeWorkbenchEditorFileMetadata | undefined,
  right: IdeWorkbenchEditorFileMetadata | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.language === right.language &&
    left.mimeType === right.mimeType &&
    left.size === right.size &&
    left.readonly === right.readonly &&
    left.previewKind === right.previewKind
  );
}

function pathTouchesTarget(
  targetPath: string,
  targetKind: IdeExplorerPathEvent["targetKind"],
  candidatePath: string,
): boolean {
  const target = normalizeExplorerPath(targetPath);
  const candidate = normalizeExplorerPath(candidatePath);
  if (targetKind === "directory") return isExplorerPathInside(target, candidate);
  return candidate === target;
}

function rebasePathForMove(
  oldPath: string,
  newPath: string,
  targetKind: IdeExplorerPathEvent["targetKind"],
  candidatePath: string,
): string | null {
  const oldNormalized = normalizeExplorerPath(oldPath);
  const newNormalized = normalizeExplorerPath(newPath);
  const candidate = normalizeExplorerPath(candidatePath);
  if (targetKind !== "directory") return candidate === oldNormalized ? newNormalized : null;
  if (candidate === oldNormalized) return newNormalized;
  if (!candidate.startsWith(`${oldNormalized}/`)) return null;
  return joinExplorerPath(newNormalized, candidate.slice(oldNormalized.length + 1));
}

function removeDockviewPanels(
  layout: SerializedDockview | null,
  panelIds: Set<string>,
): SerializedDockview | null {
  if (!layout || panelIds.size === 0) return layout;
  const cloned = structuredClone(layout) as NonNullable<typeof layout>;
  const dockviewPanelIds = new Set<string>();
  for (const [panelId, panel] of Object.entries(cloned.panels)) {
    const tabId = serializedDockviewPanelTabId(panel, panelId);
    if (panelIds.has(panelId) || (tabId && panelIds.has(tabId))) {
      dockviewPanelIds.add(panelId);
    }
  }
  for (const id of dockviewPanelIds) delete cloned.panels[id];
  return removeDockviewPanelIds(cloned, dockviewPanelIds);
}

function removeDockviewPanelIds<T>(value: T, panelIds: Set<string>): T {
  if (typeof value === "string") return (panelIds.has(value) ? "" : value) as T;
  if (Array.isArray(value)) {
    return value
      .map((item) => removeDockviewPanelIds(item, panelIds))
      .filter((item) => item !== "") as T;
  }
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (panelIds.has(key)) continue;
    const next = removeDockviewPanelIds(child, panelIds);
    if (next !== "") output[key] = next;
  }
  return output as T;
}

function syncDockviewLayoutForTabReplacements(
  layout: SerializedDockview | null,
  replacements: Array<{ oldId: string; nextTab: IdeWorkbenchEditorTab }>,
): SerializedDockview | null {
  if (!layout || replacements.length === 0) return layout;
  const byOldId = new Map(replacements.map((item) => [item.oldId, item.nextTab]));
  const cloned = structuredClone(layout) as NonNullable<typeof layout>;
  for (const [oldId, nextTab] of byOldId) {
    const panel = cloned.panels[oldId];
    if (panel) {
      delete cloned.panels[oldId];
      cloned.panels[nextTab.id] = {
        ...panel,
        id: nextTab.id,
        title: `${nextTab.dirty ? "● " : ""}${nextTab.title}${nextTab.deleted ? " (deleted)" : ""}`,
        params: {
          ...panel.params,
          kind: "file",
          tab: nextTab,
          title: nextTab.title,
        },
      };
    }
    for (const [panelId, candidatePanel] of Object.entries(cloned.panels)) {
      if (panelId === nextTab.id) continue;
      if (serializedDockviewPanelTabId(candidatePanel, panelId) !== oldId) continue;
      cloned.panels[panelId] = {
        ...candidatePanel,
        title: `${nextTab.dirty ? "● " : ""}${nextTab.title}${nextTab.deleted ? " (deleted)" : ""}`,
        params: {
          ...candidatePanel.params,
          kind: "file",
          tab: nextTab,
          title: nextTab.title,
        },
      };
    }
  }
  return replaceDockviewPanelIds(cloned, byOldId);
}

function serializedDockviewPanelTabId(panel: unknown, fallbackPanelId: string): string | null {
  if (!panel || typeof panel !== "object") return fallbackPanelId;
  const params = (panel as { params?: { kind?: string; tab?: { id?: string } } }).params;
  if (params?.kind === "file") return params.tab?.id ?? null;
  return fallbackPanelId;
}

function replaceDockviewPanelIds<T>(value: T, replacements: Map<string, IdeWorkbenchEditorTab>): T {
  if (typeof value === "string") return (replacements.get(value)?.id ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => replaceDockviewPanelIds(item, replacements)) as T;
  if (!value || typeof value !== "object") return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = replaceDockviewPanelIds(child, replacements);
  }
  return output as T;
}

function WorkbenchStatusBar({
  rootId,
  directoryPath,
  sideBarCollapsed,
  panelCollapsed,
  activePanelId,
  activeTab,
  git,
}: {
  rootId: string;
  rootAbsolutePath?: string;
  directoryPath: string;
  sideBarCollapsed: boolean;
  panelCollapsed: boolean;
  activePanelId: WorkbenchPanelId;
  activeTab: IdeWorkbenchEditorTab | null;
  git: GitStatusPayload | null;
}) {
  const fileState = activeTab?.deleted
    ? "deleted"
    : activeTab?.saveState ?? (activeTab?.dirty ? "dirty" : "clean");
  const metadata = activeTab?.metadata;
  const gitChangeCount = git?.available ? git.changes.length : 0;
  const gitSummary = git?.available ? formatGitStatusBar(git) : null;
  return (
    <footer className="flex min-h-6 items-center gap-3 overflow-hidden border-t border-line bg-panel-2 px-3 font-mono text-2xs text-muted" data-ide-status-bar>
      <span className="truncate">root: {rootId || "pending"}</span>
      <span className="truncate">path: /{directoryPath}</span>
      {git?.available ? (
        <span className="inline-flex max-w-[34vw] shrink-0 items-center gap-1 truncate text-primary" title={gitSummary ?? undefined} data-ide-status-git>
          <GitBranch className="size-3" aria-hidden />
          <span className="truncate" data-ide-status-git-branch>{git.branch || "HEAD"}</span>
          {git.upstream ? <span className="hidden truncate text-subtle sm:inline" data-ide-status-git-upstream>→ {git.upstream}</span> : null}
          {(git.ahead || git.behind) ? <span className="shrink-0" data-ide-status-git-ahead-behind>↑{git.ahead} ↓{git.behind}</span> : null}
          <span className="shrink-0 text-subtle" data-ide-status-git-change-count>{gitChangeCount}</span>
        </span>
      ) : null}
      <span className="shrink-0">sidebar: {sideBarCollapsed ? "collapsed" : "visible"}</span>
      <span className="shrink-0">panel: {panelCollapsed ? "collapsed" : activePanelId}</span>
      {activeTab ? (
        <span className="ml-auto inline-flex min-w-0 items-center gap-2" data-ide-status-active-file>
          <span className="truncate" data-ide-status-active-file-path>{activeTab.ref.path}</span>
          <span className="shrink-0" data-ide-editor-save-state>{fileState}</span>
          {metadata?.language ? <span className="shrink-0">{metadata.language}</span> : null}
          {metadata?.mimeType && metadata.previewKind !== "text" ? <span className="shrink-0">{metadata.mimeType}</span> : null}
          {typeof metadata?.size === "number" ? <span className="shrink-0">{formatStatusBytes(metadata.size)}</span> : null}
          {metadata?.readonly ? <span className="shrink-0 text-amber">readonly</span> : null}
          {activeTab.preview && !activeTab.pinned ? <span className="shrink-0">preview</span> : null}
        </span>
      ) : (
        <span className="ml-auto">IDE Workbench</span>
      )}
    </footer>
  );
}

function formatStatusBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}

function formatGitStatusBar(status: GitStatusPayload): string {
  const upstream = status.upstream ? ` → ${status.upstream}` : "";
  const tracking = status.ahead || status.behind ? ` ↑${status.ahead} ↓${status.behind}` : "";
  return `${status.branch || "HEAD"}${upstream}${tracking} · ${status.changes.length} change(s)`;
}
