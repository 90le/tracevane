import * as React from "react";
import { useParams } from "react-router-dom";
import type { SerializedDockview } from "dockview-react";
import {
  AlertCircle,
  Bug,
  Files,
  GitBranch,
  ListChecks,
  ChevronDown,
  ChevronUp,
  Package,
  PanelBottomOpen,
  Play,
  RotateCcw,
  Search,
  Terminal,
  X,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { useFilesSummaryQuery } from "@/lib/query/files";
import { editorDocumentId, editorTitleForPath } from "@/shared/editor-core";
import { isExplorerPathInside, joinExplorerPath, normalizeExplorerPath } from "@/shared/explorer-core";
import type { ExplorerEntry } from "@/shared/explorer-core";
import { EditorDock } from "./editor";
import { IdeExplorerView } from "./explorer";
import type { IdeExplorerPathEvent } from "./explorer";
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

  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  ) ?? null;

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

  return (
    <div className="grid h-dvh min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-canvas text-ink" data-ide-workbench>
      <WorkbenchHeader
        rootLabel={(root?.labelZh ?? root?.labelEn ?? rootId) || "未选择工作区"}
        rootPath={root?.absolutePath ?? "等待文件根目录加载"}
        onResetLayout={layoutApi.resetLayout}
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
              : `${layout.sideBar.width}px minmax(0,1fr)`,
          }}
        >
          <IdeExplorerView
            hidden={layout.sideBar.collapsed || !layout.sideBar.visible}
            rootId={rootId}
            rootLabel={root?.labelZh ?? root?.labelEn ?? rootId}
            rootAbsolutePath={root?.absolutePath}
            directoryPath={directoryPath}
            activeRootId={activeTab?.ref.rootId}
            activePath={activeTab?.ref.path}
            openTabs={openTabs}
            onDirectoryPathChange={setDirectoryPath}
            onOpenEntry={openEntry}
            onPathEvent={handleExplorerPathEvent}
          />
          {!layout.sideBar.collapsed && layout.sideBar.visible ? (
            <SidebarResizeHandle
              left={layout.sideBar.width}
              width={layout.sideBar.width}
              onResize={layoutApi.setSidebarWidth}
            />
          ) : null}
          <div
            className={cn(
              "grid min-h-0 min-w-0",
              layout.panel.maximized
                ? "grid-rows-[minmax(0,1fr)]"
                : "grid-rows-[minmax(0,1fr)_auto]",
            )}
            data-ide-editor-panel-stack
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
      <Button variant="ghost" size="sm" onClick={onResetLayout}>
        <RotateCcw />
        重置布局
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
      <div className={cn("border-t border-line bg-panel px-2 py-1", className)} data-ide-panel-collapsed>
        <Button variant="ghost" size="sm" onClick={onTogglePanel}>
          <PanelBottomOpen />
          展开 Panel
        </Button>
      </div>
    );
  }

  return (
    <section
      data-ide-panel
      data-ide-panel-maximized={panel.maximized ? "true" : "false"}
      className={cn("relative grid min-h-0 grid-rows-[auto_minmax(0,1fr)] border-t border-line bg-panel", className)}
      style={{ height: panel.maximized ? undefined : panel.size }}
    >
      {!panel.maximized ? <PanelResizeHandle height={panel.size} onResize={onResizePanel} /> : null}
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

function PanelResizeHandle({
  height,
  onResize,
}: {
  height: number;
  onResize: (height: number) => void;
}) {
  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const stack = event.currentTarget.closest<HTMLElement>("[data-ide-editor-panel-stack]");
    const maxHeight = stack?.clientHeight ?? 2400;
    const handlePointerMove = (moveEvent: PointerEvent) => {
      onResize(clampNumber(startHeight + startY - moveEvent.clientY, 140, maxHeight));
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }, [height, onResize]);

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
  };
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
  }
  return replaceDockviewPanelIds(cloned, byOldId);
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
}: {
  rootId: string;
  directoryPath: string;
  sideBarCollapsed: boolean;
  panelCollapsed: boolean;
  activePanelId: WorkbenchPanelId;
}) {
  return (
    <footer className="flex min-h-6 items-center gap-3 border-t border-line bg-panel-2 px-3 font-mono text-2xs text-muted" data-ide-status-bar>
      <span className="truncate">root: {rootId || "pending"}</span>
      <span className="truncate">path: /{directoryPath}</span>
      <span>sidebar: {sideBarCollapsed ? "collapsed" : "visible"}</span>
      <span>panel: {panelCollapsed ? "collapsed" : activePanelId}</span>
      <span className="ml-auto">M4 Workbench foundation</span>
    </footer>
  );
}
