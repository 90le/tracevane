import * as React from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Bug,
  Files,
  FolderOpen,
  GitBranch,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Package,
  PanelBottomOpen,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RefreshCcw,
  RotateCcw,
  Search,
  Terminal,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { useFilesSummaryQuery } from "@/lib/query/files";
import { editorDocumentId, editorTitleForPath } from "@/shared/editor-core";
import { useExplorerDirectory, useExplorerTreeState } from "@/shared/explorer-core";
import type { ExplorerEntry } from "@/shared/explorer-core";
import {
  ExplorerEmptyState,
  ExplorerErrorState,
  ExplorerLoadingState,
  ExplorerToolbarBase,
  ExplorerTree,
} from "@/shared/explorer-ui";
import { EditorDock } from "./editor";
import { useIdeWorkbenchLayoutState } from "./layoutState";
import type {
  IdeWorkbenchEditorTab,
  WorkbenchActivityId,
  WorkbenchPanelId,
} from "./types";
import { IDE_ACTIVITY_LABELS, IDE_PANEL_LABELS } from "./types";

const ACTIVITY_ITEMS: Array<{
  id: WorkbenchActivityId;
  icon: React.ReactNode;
  disabled?: boolean;
}> = [
  { id: "explorer", icon: <Files /> },
  { id: "search", icon: <Search />, disabled: true },
  { id: "git", icon: <GitBranch />, disabled: true },
  { id: "run", icon: <Play />, disabled: true },
  { id: "extensions", icon: <Package />, disabled: true },
];

const PANEL_ICONS: Record<WorkbenchPanelId, React.ReactNode> = {
  terminal: <Terminal />,
  problems: <AlertCircle />,
  output: <ListChecks />,
  debugConsole: <Bug />,
};

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
  const [directoryPath, setDirectoryPath] = React.useState("");

  const openEntry = React.useCallback(
    (entry: ExplorerEntry) => {
      if (entry.kind === "directory") {
        setDirectoryPath(entry.path);
        return;
      }
      const tab: IdeWorkbenchEditorTab = {
        id: editorDocumentId({ rootId: entry.rootId, path: entry.path }),
        ref: { rootId: entry.rootId, path: entry.path },
        title: editorTitleForPath(entry.path),
        preview: true,
        pinned: false,
        dirty: false,
      };
      layoutApi.setLayout((current) => ({
        ...current,
        editorGroups: current.editorGroups.map((group) => {
          if (group.id !== current.activeEditorGroupId) return group;
          const existing = group.tabs.find((item) => item.id === tab.id);
          if (existing) return { ...group, activeTabId: existing.id };

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

  return (
    <div className="grid h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-canvas text-ink">
      <WorkbenchHeader
        rootLabel={(root?.labelZh ?? root?.labelEn ?? rootId) || "未选择工作区"}
        rootPath={root?.absolutePath ?? "等待文件根目录加载"}
        onResetLayout={layoutApi.resetLayout}
      />
      <div className="grid min-h-0 min-w-0 grid-cols-[44px_minmax(0,1fr)] border-b border-line">
        <ActivityBar
          activeActivityId={layout.activeActivityId}
          onSelect={layoutApi.setActiveActivityId}
        />
        <div
          className="grid min-h-0 min-w-0"
          style={{
            gridTemplateColumns: layout.sideBar.collapsed
              ? "0px minmax(0,1fr)"
              : `${layout.sideBar.width}px minmax(0,1fr)`,
          }}
        >
          <IdeSideBar
            hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
            rootId={rootId}
            rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
            sideBarWidth={layout.sideBar.width}
            directoryPath={directoryPath}
            onDirectoryPathChange={setDirectoryPath}
            onToggleSidebar={layoutApi.toggleSidebar}
            onResizeSidebar={layoutApi.setSidebarWidth}
            onOpenEntry={openEntry}
          />
          <div
            className={cn(
              "grid min-h-0 min-w-0",
              layout.panel.maximized
                ? "grid-rows-[minmax(0,1fr)]"
                : "grid-rows-[minmax(0,1fr)_auto]",
            )}
          >
            {!layout.panel.maximized && (
              <EditorDock
                tabs={activeGroup?.tabs ?? []}
                activeTabId={activeGroup?.activeTabId ?? null}
                dockviewLayout={layout.dockviewLayout}
                onDockviewLayoutChange={setDockviewLayout}
                onActiveTabChange={setActiveEditorTab}
                onPinTab={pinEditorTab}
              />
            )}
            <PanelArea
              panel={layout.panel}
              onTogglePanel={layoutApi.togglePanel}
              onToggleMaximized={layoutApi.togglePanelMaximized}
              onActivePanelChange={layoutApi.setActivePanelId}
              onResizePanel={layoutApi.setPanelSize}
            />
          </div>
        </div>
      </div>
      <WorkbenchStatusBar
        rootId={rootId}
        directoryPath={directoryPath}
        sideBarCollapsed={layout.sideBar.collapsed}
        panelCollapsed={layout.panel.collapsed}
        activePanelId={layout.panel.activePanelId}
      />
      {layout.sideBar.collapsed && (
        <Button
          type="button"
          variant="default"
          size="sm"
          className="fixed left-[52px] top-[72px] z-10 rounded-full shadow-md"
          onClick={layoutApi.toggleSidebar}
          aria-label="展开 IDE 资源管理器"
          title="展开 IDE 资源管理器"
        >
          <PanelLeftOpen />
          Explorer
        </Button>
      )}
    </div>
  );
}

function WorkbenchHeader({
  rootLabel,
  rootPath,
  onResetLayout,
}: {
  rootLabel: string;
  rootPath: string;
  onResetLayout: () => void;
}) {
  return (
    <header className="flex min-h-[50px] min-w-0 items-center gap-3 border-b border-line bg-panel px-3">
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
      <Button variant="ghost" size="sm" onClick={onResetLayout}>
        <RotateCcw />
        重置布局
      </Button>
    </header>
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
    <aside className="flex min-h-0 flex-col items-center gap-1 border-r border-line bg-panel-2 py-2">
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

function IdeSideBar({
  hidden,
  rootId,
  rootLabel,
  sideBarWidth,
  directoryPath,
  onDirectoryPathChange,
  onToggleSidebar,
  onResizeSidebar,
  onOpenEntry,
}: {
  hidden: boolean;
  rootId: string;
  rootLabel: string;
  sideBarWidth: number;
  directoryPath: string;
  onDirectoryPathChange: (path: string) => void;
  onToggleSidebar: () => void;
  onResizeSidebar: (width: number) => void;
  onOpenEntry: (entry: ExplorerEntry) => void;
}) {
  const directory = useExplorerDirectory({
    rootId,
    directoryPath,
    enabled: Boolean(rootId) && !hidden,
  });
  const treeState = useExplorerTreeState();

  if (hidden) return <aside className="min-w-0 overflow-hidden" aria-hidden="true" />;

  return (
    <aside className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-r border-line bg-panel">
      <ExplorerToolbarBase
        title="资源管理器"
        description={rootLabel || "Workspace Explorer"}
        actions={[
          {
            id: "refresh",
            label: "刷新",
            icon: <RefreshCcw />,
            onSelect: () => void directory.refresh(),
          },
          {
            id: "narrow",
            label: "窄",
            onSelect: () => onResizeSidebar(sideBarWidth - 32),
          },
          {
            id: "wide",
            label: "宽",
            onSelect: () => onResizeSidebar(sideBarWidth + 32),
          },
          {
            id: "collapse",
            label: "收起",
            icon: <PanelLeftClose />,
            onSelect: onToggleSidebar,
          },
        ]}
      />
      <div className="min-h-0 overflow-hidden p-2">
        <div className="mb-2 flex min-w-0 items-center gap-2 text-xs text-muted">
          <FolderOpen className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate" title={directory.absolutePath}>
            {directory.location.directoryPath || "/"}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!directory.parentPath}
            onClick={() => onDirectoryPathChange(directory.parentPath ?? "")}
          >
            上级
          </Button>
        </div>
        {directory.isLoading ? (
          <ExplorerLoadingState title="正在加载工作区文件…" />
        ) : directory.isError ? (
          <ExplorerErrorState
            title="资源管理器加载失败"
            description={directory.error?.message ?? "请稍后重试。"}
            action={
              <Button type="button" variant="outline" size="sm" onClick={() => void directory.refresh()}>
                重试
              </Button>
            }
          />
        ) : (
          <ExplorerTree
            entries={directory.entries}
            expandedKeys={treeState.expandedKeys}
            selectedKeys={treeState.selectedKeys}
            activeKey={treeState.activeKey}
            treeLabel="IDE 资源管理器"
            emptyState={<ExplorerEmptyState title="目录为空" description="当前工作区目录没有文件。" />}
            onToggle={(item) => {
              if (item.kind === "directory") onDirectoryPathChange(item.path);
            }}
            onSelect={(item) => treeState.select(item.id)}
            onOpen={(item) => onOpenEntry(item)}
          />
        )}
      </div>
      <div className="border-t border-line p-2 text-xs text-subtle">
        M4：复用 explorer-core / explorer-ui；文件操作、完整右键菜单、reveal active file 后续迭代。
      </div>
    </aside>
  );
}

function PanelArea({
  panel,
  className,
  onTogglePanel,
  onToggleMaximized,
  onActivePanelChange,
  onResizePanel,
}: {
  panel: {
    collapsed: boolean;
    size: number;
    maximized: boolean;
    activePanelId: WorkbenchPanelId;
  };
  className?: string;
  onTogglePanel: () => void;
  onToggleMaximized: () => void;
  onActivePanelChange: (id: WorkbenchPanelId) => void;
  onResizePanel: (size: number) => void;
}) {
  if (panel.collapsed) {
    return (
      <div className={cn("border-t border-line bg-panel px-2 py-1", className)}>
        <Button variant="ghost" size="sm" onClick={onTogglePanel}>
          <PanelBottomOpen />
          展开 Panel
        </Button>
      </div>
    );
  }

  return (
    <section
      className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-line bg-panel", className)}
      style={{ height: panel.maximized ? undefined : panel.size }}
    >
      <div className="flex min-h-9 items-center gap-1 border-b border-line bg-panel-2 px-2">
        {(Object.keys(IDE_PANEL_LABELS) as WorkbenchPanelId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onActivePanelChange(id)}
            className={cn(
              "inline-flex min-h-7 items-center gap-1.5 rounded-sm border border-transparent px-2 text-sm text-muted outline-none focus-visible:shadow-[var(--ring)] [&_svg]:size-3.5",
              panel.activePanelId === id &&
                "border-primary-line bg-primary-soft text-ink-strong",
            )}
          >
            {PANEL_ICONS[id]}
            {IDE_PANEL_LABELS[id]}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {!panel.maximized && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onResizePanel(panel.size + 40)}>
                调高
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onResizePanel(panel.size - 40)}>
                调低
              </Button>
            </>
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
      <div className="grid min-h-0 place-items-center p-4 text-sm text-muted">
        <div className="rounded-md border border-dashed border-line bg-canvas px-4 py-3 text-center">
          <div className="font-medium text-ink-strong">{IDE_PANEL_LABELS[panel.activePanelId]} 占位</div>
          <div className="mt-1 max-w-lg">
            M4 只提供 Panel Area、固定 Tab、折叠/高度/最大化状态；真实 Terminal、Problems diagnostics、Output channel、Debug runtime 后置。
          </div>
        </div>
      </div>
    </section>
  );
}

function WorkbenchStatusBar({
  rootId,
  directoryPath,
  sideBarCollapsed,
  panelCollapsed,
  activePanelId,
}: {
  rootId: string;
  directoryPath: string;
  sideBarCollapsed: boolean;
  panelCollapsed: boolean;
  activePanelId: WorkbenchPanelId;
}) {
  return (
    <footer className="flex min-h-6 items-center gap-3 border-t border-line bg-panel-2 px-3 font-mono text-2xs text-muted">
      <span className="truncate">root: {rootId || "pending"}</span>
      <span className="truncate">path: /{directoryPath}</span>
      <span>sidebar: {sideBarCollapsed ? "collapsed" : "visible"}</span>
      <span>panel: {panelCollapsed ? "collapsed" : activePanelId}</span>
      <span className="ml-auto">M4 Workbench foundation</span>
    </footer>
  );
}
