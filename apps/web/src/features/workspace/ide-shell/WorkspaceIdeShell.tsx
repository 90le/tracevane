import * as React from "react";
import {
  Bot,
  Braces,
  Code2,
  Files,
  GitBranch,
  Columns3,
  Maximize2,
  PanelBottom,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Search,
  Settings2,
  TerminalSquare,
  Trash2,
} from "lucide-react";

import { Button } from "@/design/ui/button";
import { cn } from "@/design/lib/utils";
import { useFilesSummaryQuery } from "@/lib/query/files";

import {
  WorkspaceEditorStage,
  type WorkspaceEditorSearchRequest,
} from "../editor";
import {
  WorkspaceExplorer,
  WorkspaceSearchPanel,
  type WorkspaceDirectoryContext,
  type WorkspaceExplorerRevealRequest,
  type WorkspaceOpenFileOptions,
} from "../files";
import { WorkspaceGitPanel, type WorkspaceGitDiffTarget } from "../git";
import { IdeCommandPalette } from "./IdeCommandPalette";
import type { WorkspaceCommand } from "./ideCommands";
import "./workspace-ide-shell.css";

type PaneId = "explorer" | "search" | "git" | "terminal" | "ai" | "outline" | "extensions" | "problems" | "output";
type PanePlacement = "top" | "left" | "right" | "bottom";
type SaveState = "idle" | "dirty" | "saving" | "saved";
type MaximizedPane = "top" | "left" | "center" | "right" | "bottom" | null;
type LayoutPreset = "balanced" | "code" | "terminal";
type EditorGroupId = "primary" | "secondary";
type EditorSplitMode = "single" | "vertical" | "horizontal";
type DockSplitMode = "single" | "vertical" | "horizontal";
type DockSplitModes = Record<PanePlacement, DockSplitMode>;
type DockSplitRatios = Record<PanePlacement, number>;
type DockPaneRole = "primary" | "secondary";
type ActiveDockFocus = { placement: PanePlacement; role: DockPaneRole; paneId: PaneId } | null;
type DockPaneSelections = Record<PanePlacement, Partial<Record<DockPaneRole, PaneId>>>;
type MobilePanel = "editor" | "top" | "left" | "right" | "bottom";
type IdeFocusRegion = "top" | "left" | "center" | "right" | "bottom";

const DOCK_PLACEMENTS = ["top", "left", "right", "bottom"] as const satisfies readonly PanePlacement[];

interface IdePaneSizes {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface PaneDescriptor {
  id: PaneId;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  shortcut?: string;
  defaultPlacement: PanePlacement;
}

const PANE_REGISTRY: PaneDescriptor[] = [
  { id: "explorer", label: "文件", icon: Files, shortcut: "⌘1", defaultPlacement: "left" },
  { id: "search", label: "搜索", icon: Search, shortcut: "⌘2", defaultPlacement: "left" },
  { id: "git", label: "Git", icon: GitBranch, shortcut: "⌘3", defaultPlacement: "left" },
  { id: "terminal", label: "终端", icon: TerminalSquare, shortcut: "⌘4", defaultPlacement: "bottom" },
  { id: "ai", label: "AI", icon: Bot, shortcut: "⌘5", defaultPlacement: "right" },
  { id: "outline", label: "大纲", icon: Braces, defaultPlacement: "right" },
  { id: "extensions", label: "扩展", icon: Braces, shortcut: "⌘6", defaultPlacement: "right" },
  { id: "problems", label: "问题", icon: Braces, defaultPlacement: "bottom" },
  { id: "output", label: "输出", icon: Code2, defaultPlacement: "bottom" },
];

type IdePanePlacements = Record<PaneId, PanePlacement>;
type PaneOrder = Record<PanePlacement, PaneId[]>;

const DEFAULT_PANE_PLACEMENTS = PANE_REGISTRY.reduce((placements, pane) => {
  placements[pane.id] = pane.defaultPlacement;
  return placements;
}, {} as IdePanePlacements);

const DEFAULT_PANE_ORDER = PANE_REGISTRY.reduce(
  (order, pane) => {
    order[pane.defaultPlacement].push(pane.id);
    return order;
  },
  { top: [], left: [], right: [], bottom: [] } as PaneOrder,
);

const IDE_LAYOUT_STORAGE_KEY = "tracevane.workspace.ide-shell.layout.v1";
const IDE_LAYOUT_SNAPSHOTS_STORAGE_KEY = "tracevane.workspace.ide-shell.layout.snapshots.v1";
const MAX_LAYOUT_SNAPSHOTS = 8;

const DEFAULT_PANE_SIZES: IdePaneSizes = { top: 170, left: 320, right: 340, bottom: 260 };
const CODE_PANE_SIZES: IdePaneSizes = { top: 140, left: 280, right: 300, bottom: 190 };
const TERMINAL_PANE_SIZES: IdePaneSizes = { top: 170, left: 300, right: 300, bottom: 380 };
const PANE_SIZE_LIMITS: Record<keyof IdePaneSizes, { min: number; max: number }> = {
  top: { min: 120, max: 360 },
  left: { min: 220, max: 560 },
  right: { min: 240, max: 560 },
  bottom: { min: 160, max: 520 },
};
const KEYBOARD_RESIZE_STEP = 16;
const KEYBOARD_RESIZE_LARGE_STEP = 40;
const DEFAULT_DOCK_SPLIT_MODES: DockSplitModes = { top: "single", left: "single", right: "single", bottom: "single" };
const DEFAULT_DOCK_SPLIT_RATIOS: DockSplitRatios = { top: 50, left: 50, right: 50, bottom: 50 };
const DEFAULT_DOCK_PANE_SELECTIONS: DockPaneSelections = { top: {}, left: {}, right: {}, bottom: {} };
const DEFAULT_EDITOR_SPLIT_RATIO = 50;
const SPLIT_RATIO_LIMITS = { min: 25, max: 75 };
const EDITOR_SPLIT_RATIO_LIMITS = SPLIT_RATIO_LIMITS;

interface IdeLayoutState {
  topOpen?: boolean;
  leftOpen?: boolean;
  rightOpen?: boolean;
  bottomOpen?: boolean;
  maximizedPane?: MaximizedPane;
  layoutPreset?: LayoutPreset;
  paneSizes?: Partial<IdePaneSizes>;
  editorSplitMode?: EditorSplitMode;
  editorSplitRatio?: number;
  dockSplitModes?: Partial<DockSplitModes>;
  dockSplitRatios?: Partial<DockSplitRatios>;
  dockPaneSelections?: Partial<DockPaneSelections>;
  panePlacements?: Partial<IdePanePlacements>;
  paneOrder?: Partial<PaneOrder>;
  hiddenPanes?: PaneId[];
}

interface IdeLayoutSnapshot {
  id: string;
  name: string;
  createdAt: string;
  state: IdeLayoutState;
}

const LazyWorkspaceTerminal = React.lazy(() =>
  import("../terminal/WorkspaceTerminal").then((module) => ({
    default: module.WorkspaceTerminal,
  })),
);

const ignoreWorkspaceCommands = () => undefined;

export function WorkspaceIdeShell() {
  const filesSummary = useFilesSummaryQuery();
  const roots = filesSummary.data?.roots ?? [];
  const defaultRootId = React.useMemo(() => {
    if (roots.length === 0) return "";
    return (
      roots.find((root) => root.id === "project-root")?.id ||
      roots.find((root) => root.preferred)?.id ||
      roots.find((root) => root.id === filesSummary.data?.defaultRootId)?.id ||
      roots[0].id
    );
  }, [filesSummary.data?.defaultRootId, roots]);

  const [layoutState] = React.useState(() => loadIdeLayoutState());
  const [layoutSnapshots, setLayoutSnapshots] = React.useState<IdeLayoutSnapshot[]>(() => loadIdeLayoutSnapshots());
  const [activity, setActivity] = React.useState<PaneId>("explorer");
  const [topPanel, setTopPanel] = React.useState<PaneId>("output");
  const [rightPanel, setRightPanel] = React.useState<PaneId>("ai");
  const [bottomPanel, setBottomPanel] = React.useState<PaneId>("terminal");
  const [panePlacements, setPanePlacements] = React.useState<IdePanePlacements>(() => ({
    ...DEFAULT_PANE_PLACEMENTS,
    ...layoutState.panePlacements,
  }));
  const [paneOrder, setPaneOrder] = React.useState<PaneOrder>(() => ({
    top: layoutState.paneOrder?.top ?? DEFAULT_PANE_ORDER.top,
    left: layoutState.paneOrder?.left ?? DEFAULT_PANE_ORDER.left,
    right: layoutState.paneOrder?.right ?? DEFAULT_PANE_ORDER.right,
    bottom: layoutState.paneOrder?.bottom ?? DEFAULT_PANE_ORDER.bottom,
  }));
  const [topOpen, setTopOpen] = React.useState(layoutState.topOpen ?? false);
  const [leftOpen, setLeftOpen] = React.useState(layoutState.leftOpen ?? true);
  const [rightOpen, setRightOpen] = React.useState(layoutState.rightOpen ?? true);
  const [bottomOpen, setBottomOpen] = React.useState(layoutState.bottomOpen ?? true);
  const [maximizedPane, setMaximizedPane] = React.useState<MaximizedPane>(layoutState.maximizedPane ?? null);
  const [layoutPreset, setLayoutPreset] = React.useState<LayoutPreset>(layoutState.layoutPreset ?? "balanced");
  const [paneSizes, setPaneSizes] = React.useState<IdePaneSizes>(() => ({
    ...DEFAULT_PANE_SIZES,
    ...layoutState.paneSizes,
  }));
  const [editorSplitMode, setEditorSplitMode] = React.useState<EditorSplitMode>(layoutState.editorSplitMode ?? "single");
  const [dockSplitModes, setDockSplitModes] = React.useState<DockSplitModes>(() => ({
    ...DEFAULT_DOCK_SPLIT_MODES,
    ...layoutState.dockSplitModes,
  }));
  const [dockSplitRatios, setDockSplitRatios] = React.useState<DockSplitRatios>(() => ({
    ...DEFAULT_DOCK_SPLIT_RATIOS,
    ...layoutState.dockSplitRatios,
  }));
  const [editorSplitRatio, setEditorSplitRatio] = React.useState(layoutState.editorSplitRatio ?? DEFAULT_EDITOR_SPLIT_RATIO);
  const [dockPaneSelections, setDockPaneSelections] = React.useState<DockPaneSelections>(() => mergeDockPaneSelections(layoutState.dockPaneSelections));
  const [hiddenPanes, setHiddenPanes] = React.useState<PaneId[]>(layoutState.hiddenPanes ?? []);
  const [activeEditorGroup, setActiveEditorGroup] = React.useState<EditorGroupId>("primary");
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState<MobilePanel>("editor");
  const [rootId, setRootId] = React.useState(defaultRootId);
  const [activePath, setActivePath] = React.useState<string | undefined>();
  const [activePathRootId, setActivePathRootId] = React.useState("");
  const [secondaryPath, setSecondaryPath] = React.useState<string | undefined>();
  const [secondaryPathRootId, setSecondaryPathRootId] = React.useState("");
  const [gitDiffTarget, setGitDiffTarget] = React.useState<WorkspaceGitDiffTarget | null>(null);
  const [searchRequest, setSearchRequest] = React.useState<WorkspaceEditorSearchRequest | null>(null);
  const [workspaceDirectory, setWorkspaceDirectory] = React.useState<WorkspaceDirectoryContext | null>(null);
  const [explorerRevealRequest, setExplorerRevealRequest] = React.useState<WorkspaceExplorerRevealRequest | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [editorCommands, setEditorCommands] = React.useState<WorkspaceCommand[]>([]);
  const [searchCommands, setSearchCommands] = React.useState<WorkspaceCommand[]>([]);
  const [gitCommands, setGitCommands] = React.useState<WorkspaceCommand[]>([]);
  const [terminalCommands, setTerminalCommands] = React.useState<WorkspaceCommand[]>([]);
  const [draggingPane, setDraggingPane] = React.useState<PaneId | null>(null);
  const [dropTarget, setDropTarget] = React.useState<PanePlacement | null>(null);
  const [activeDockFocus, setActiveDockFocus] = React.useState<ActiveDockFocus>(null);
  const searchSignalRef = React.useRef(0);
  const topDockRef = React.useRef<HTMLElement | null>(null);
  const leftDockRef = React.useRef<HTMLElement | null>(null);
  const centerPaneRef = React.useRef<HTMLElement | null>(null);
  const rightDockRef = React.useRef<HTMLElement | null>(null);
  const bottomDockRef = React.useRef<HTMLElement | null>(null);

  const panesByPlacement = React.useMemo(() => groupPanesByPlacement(panePlacements, paneOrder, hiddenPanes), [hiddenPanes, paneOrder, panePlacements]);
  const topPaneIds = panesByPlacement.top;
  const leftPaneIds = panesByPlacement.left;
  const rightPaneIds = panesByPlacement.right;
  const bottomPaneIds = panesByPlacement.bottom;
  const activeTopPane = dockPaneSelection(topPaneIds, dockPaneSelections.top.primary, topPanel);
  const activeLeftPane = dockPaneSelection(leftPaneIds, dockPaneSelections.left.primary, activity);
  const activeRightPane = dockPaneSelection(rightPaneIds, dockPaneSelections.right.primary, rightPanel);
  const activeBottomPane = dockPaneSelection(bottomPaneIds, dockPaneSelections.bottom.primary, bottomPanel);
  const secondaryTopPane = dockPaneSelection(topPaneIds, dockPaneSelections.top.secondary, secondaryDockPane(topPaneIds, activeTopPane));
  const secondaryLeftPane = dockPaneSelection(leftPaneIds, dockPaneSelections.left.secondary, secondaryDockPane(leftPaneIds, activeLeftPane));
  const secondaryRightPane = dockPaneSelection(rightPaneIds, dockPaneSelections.right.secondary, secondaryDockPane(rightPaneIds, activeRightPane));
  const secondaryBottomPane = dockPaneSelection(bottomPaneIds, dockPaneSelections.bottom.secondary, secondaryDockPane(bottomPaneIds, activeBottomPane));

  React.useEffect(() => {
    if (!rootId && defaultRootId) {
      setRootId(defaultRootId);
      setActivePathRootId(defaultRootId);
      return;
    }
    if (rootId && roots.length > 0 && !roots.some((root) => root.id === rootId)) {
      setRootId(defaultRootId);
      setActivePath(undefined);
      setActivePathRootId(defaultRootId);
      setSecondaryPath(undefined);
      setSecondaryPathRootId(defaultRootId);
      setGitDiffTarget(null);
    }
  }, [defaultRootId, rootId, roots]);

  React.useEffect(() => {
    storeIdeLayoutState({
      topOpen,
      leftOpen,
      rightOpen,
      bottomOpen,
      maximizedPane,
      layoutPreset,
      paneSizes,
      editorSplitMode,
      editorSplitRatio,
      panePlacements,
      paneOrder,
      dockSplitModes,
      dockSplitRatios,
      dockPaneSelections,
      hiddenPanes,
    });
  }, [bottomOpen, dockPaneSelections, dockSplitModes, dockSplitRatios, editorSplitMode, editorSplitRatio, hiddenPanes, layoutPreset, leftOpen, maximizedPane, paneOrder, panePlacements, paneSizes, rightOpen, topOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (commandPaletteOpen) {
          event.preventDefault();
          setCommandPaletteOpen(false);
          return;
        }
        if (maximizedPane) {
          event.preventDefault();
          setMaximizedPane(null);
          return;
        }
      }
      if (mod && event.shiftKey && key === "p") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }
      if (mod && !event.altKey && key === "\\") {
        event.preventDefault();
        splitEditor(event.shiftKey ? "horizontal" : "vertical");
        return;
      }
      if (mod && event.altKey) {
        if (event.shiftKey && event.key === "Tab") {
          event.preventDefault();
          moveActiveDockPaneToOppositeGroup();
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          focusOppositeDockGroup();
          return;
        }
        if (!event.shiftKey && (event.key === "=" || event.key === "+")) {
          event.preventDefault();
          resizeActiveDockPlacement(KEYBOARD_RESIZE_LARGE_STEP);
          return;
        }
        if (!event.shiftKey && event.key === "-") {
          event.preventDefault();
          resizeActiveDockPlacement(-KEYBOARD_RESIZE_LARGE_STEP);
          return;
        }
        if (event.shiftKey && event.key === "ArrowLeft") {
          event.preventDefault();
          moveActiveDockPaneToPlacement("left");
          return;
        }
        if (event.shiftKey && event.key === "ArrowRight") {
          event.preventDefault();
          moveActiveDockPaneToPlacement("right");
          return;
        }
        if (event.shiftKey && event.key === "ArrowUp") {
          event.preventDefault();
          moveActiveDockPaneToPlacement("top");
          return;
        }
        if (event.shiftKey && event.key === "ArrowDown") {
          event.preventDefault();
          moveActiveDockPaneToPlacement("bottom");
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          focusIdeRegion("left");
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          focusIdeRegion("right");
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          focusIdeRegion("top");
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          focusIdeRegion("bottom");
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          focusIdeRegion("center");
          return;
        }
      }
      if (!mod || event.altKey) return;
      if (!event.shiftKey && key === "w") {
        event.preventDefault();
        hideActiveDockPane();
        return;
      }
      if (!event.shiftKey && key === "b") {
        event.preventDefault();
        setLeftOpen((open) => !open);
        return;
      }
      if (!event.shiftKey && key === "j") {
        event.preventDefault();
        setBottomOpen((open) => !open);
        if (!bottomOpen) setMobilePanel("bottom");
        return;
      }
      if (event.shiftKey) return;
      const nextActivity = activityByShortcut(event.key);
      if (!nextActivity) return;
      event.preventDefault();
      activateActivity(nextActivity);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const openFile = React.useCallback(
    (path: string, options?: WorkspaceOpenFileOptions) => {
      setGitDiffTarget(null);
      const targetRootId = options?.rootId ?? rootId;
      if (activeEditorGroup === "secondary" && editorSplitMode !== "single") {
        setSecondaryPath(path);
        setSecondaryPathRootId(targetRootId);
      } else {
        setActivePath(path);
        setActivePathRootId(targetRootId);
      }
      if (options?.initialSearch?.query) {
        setSearchRequest({
          path,
          query: options.initialSearch.query,
          caseSensitive: options.initialSearch.caseSensitive,
          regex: options.initialSearch.regex,
          signal: (searchSignalRef.current += 1),
        });
      }
    },
    [activeEditorGroup, editorSplitMode, rootId],
  );

  const openDiff = React.useCallback(
    (target: WorkspaceGitDiffTarget) => {
      setGitDiffTarget(target);
      setActivePath(target.path);
      setActivePathRootId(rootId);
    },
    [rootId],
  );

  const revealInExplorer = React.useCallback((path: string) => {
    setActivity("explorer");
    setLeftOpen(true);
    setExplorerRevealRequest({ path, signal: Date.now() });
  }, []);

  const syncActiveEditorFile = React.useCallback((path: string | null, tabRootId?: string) => {
    if (!path) return;
    setActivePath((current) => (current === path ? current : path));
    if (tabRootId) {
      setActivePathRootId((current) => (current === tabRootId ? current : tabRootId));
    }
  }, []);

  const layoutCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.layout.toggle-top",
        group: "布局",
        label: topOpen ? "收起顶部 Dock" : "打开顶部 Dock",
        description: "切换可停靠在编辑器上方的顶部 IDE Dock",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => setTopOpen((open) => !open),
      },
      {
        id: "ide.layout.toggle-left",
        group: "布局",
        label: leftOpen ? "收起左侧窗格" : "打开左侧窗格",
        description: "切换资源/搜索/Git/AI 等左侧 IDE 窗格",
        shortcut: "⌘B",
        risk: "safe",
        surface: "layout",
        icon: <PanelLeft />,
        run: () => setLeftOpen((open) => !open),
      },
      {
        id: "ide.layout.toggle-right",
        group: "布局",
        label: rightOpen ? "收起右侧插件窗格" : "打开右侧插件窗格",
        description: "切换 AI/Outline/扩展右侧组合窗格",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        run: () => setRightOpen((open) => !open),
      },
      {
        id: "ide.layout.toggle-bottom",
        group: "布局",
        label: bottomOpen ? "收起底部 Dock" : "打开底部 Dock",
        description: "切换终端/问题/输出底部组合窗格",
        shortcut: "⌘J",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => setBottomOpen((open) => !open),
      },
      {
        id: "ide.layout.maximize-center",
        group: "布局",
        label: maximizedPane === "center" ? "恢复组合布局" : "最大化编辑器",
        description: "在全局窗格组合和编辑器聚焦模式之间切换",
        risk: "safe",
        surface: "layout",
        icon: <Maximize2 />,
        run: () => toggleMaximizedPane("center"),
      },
      {
        id: "ide.layout.maximize-left",
        group: "布局",
        label: maximizedPane === "left" ? "恢复组合布局" : "最大化左侧窗格",
        description: "聚焦文件/搜索/Git/AI 左侧组合窗格",
        risk: "safe",
        surface: "layout",
        icon: <PanelLeft />,
        run: () => {
          setLeftOpen(true);
          toggleMaximizedPane("left");
        },
      },
      {
        id: "ide.layout.maximize-right",
        group: "布局",
        label: maximizedPane === "right" ? "恢复组合布局" : "最大化右侧插件窗格",
        description: "聚焦 AI 上下文、符号大纲或扩展窗格",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        run: () => {
          setRightOpen(true);
          toggleMaximizedPane("right");
        },
      },
      {
        id: "ide.layout.maximize-bottom",
        group: "布局",
        label: maximizedPane === "bottom" ? "恢复组合布局" : "最大化底部 Dock",
        description: "聚焦终端、问题或输出底部组合窗格",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => {
          setBottomOpen(true);
          toggleMaximizedPane("bottom");
        },
      },
      {
        id: "ide.editor.split-right",
        group: "布局",
        label: "向右拆分编辑器",
        description: "创建第二个编辑器组，形成左右代码分栏",
        shortcut: "⌘\\",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        run: () => splitEditor("vertical"),
      },
      {
        id: "ide.editor.split-down",
        group: "布局",
        label: "向下拆分编辑器",
        description: "创建第二个编辑器组，形成上下代码分栏",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => splitEditor("horizontal"),
      },
      {
        id: "ide.editor.close-split",
        group: "布局",
        label: "关闭编辑器拆分",
        description: "恢复单编辑器组，但保留已打开的主编辑器",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: closeEditorSplit,
      },
      {
        id: "ide.editor.focus-primary",
        group: "布局",
        label: "聚焦主编辑器组",
        description: "后续打开文件进入主编辑器组",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => setActiveEditorGroup("primary"),
      },
      {
        id: "ide.editor.focus-secondary",
        group: "布局",
        label: "聚焦副编辑器组",
        description: "后续打开文件进入副编辑器组；未拆分时先向右拆分",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => {
          if (editorSplitMode === "single") splitEditor("vertical");
          setActiveEditorGroup("secondary");
        },
      },
      {
        id: "ide.layout.preset-balanced",
        group: "布局",
        label: "布局预设：平衡",
        description: "恢复文件/编辑器/AI/终端的平衡工作台比例",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        run: () => applyLayoutPreset("balanced"),
      },
      {
        id: "ide.layout.preset-code",
        group: "布局",
        label: "布局预设：代码优先",
        description: "扩大编辑器，压缩辅助窗格和底部 Dock",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        run: () => applyLayoutPreset("code"),
      },
      {
        id: "ide.layout.preset-terminal",
        group: "布局",
        label: "布局预设：终端优先",
        description: "扩大底部终端，适合运行、调试和构建",
        risk: "safe",
        surface: "layout",
        icon: <TerminalSquare />,
        run: () => applyLayoutPreset("terminal"),
      },
      {
        id: "ide.layout.reset",
        group: "布局",
        label: "重置 IDE 布局",
        description: "恢复所有窗格、尺寸、拆分、停靠位置和最大化状态",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: resetLayout,
      },
      {
        id: "ide.pane.reset-placements",
        group: "窗格",
        label: "恢复默认窗格布局",
        description: "把文件/搜索/Git 放回左侧，AI/大纲/扩展放回右侧，终端/问题/输出放回底部",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: resetPanePlacements,
      },
    ],
    [bottomOpen, dockSplitModes, dockSplitRatios, editorSplitMode, leftOpen, maximizedPane, rightOpen, topOpen],
  );

  const paneVisibilityCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.pane.hide-active",
        group: "窗格" as const,
        label: "隐藏当前聚焦 Pane",
        description: activeDockFocus ? `隐藏当前聚焦的 ${paneLabel(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId)} Pane` : "先聚焦一个 Dock Pane，再隐藏它",
        shortcut: "⌘W",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: hideActiveDockPane,
      },
      {
        id: "ide.pane.restore-all-hidden",
        group: "窗格" as const,
        label: "恢复全部隐藏 Pane",
        description: hiddenPanes.length > 0 ? `恢复 ${hiddenPanes.length} 个隐藏 Pane 到各自 Dock` : "当前没有隐藏 Pane",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: hiddenPanes.length === 0,
        run: restoreAllHiddenPanes,
      },
      ...PANE_REGISTRY.flatMap((pane) => {
        const hidden = hiddenPanes.includes(pane.id);
        return [
          {
            id: `ide.pane.${hidden ? "show" : "hide"}.${pane.id}`,
            group: "窗格" as const,
            label: `${hidden ? "恢复" : "隐藏"} ${pane.label} Pane`,
            description: hidden ? `把 ${pane.label} Pane 恢复到${placementLabel(panePlacements[pane.id])} Dock` : `从当前 IDE 布局中隐藏 ${pane.label} Pane，可随时从命令面板恢复`,
            risk: "safe" as const,
            surface: "layout" as const,
            icon: React.createElement(pane.icon),
            run: () => (hidden ? restorePane(pane.id) : hidePane(pane.id)),
          },
        ];
      }),
    ],
    [activeDockFocus, hiddenPanes, panePlacements],
  );

  const panePlacementCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      PANE_REGISTRY.flatMap((pane) =>
        DOCK_PLACEMENTS.map((placement) => ({
          id: `ide.pane.move.${pane.id}.${placement}`,
          group: "窗格",
          label: `移动 ${pane.label} 到${placementLabel(placement)}`,
          description: "把 IDE 窗格移动到左侧、右侧或底部 Dock，形成自定义工作台组合",
          risk: "safe" as const,
          surface: "layout" as const,
          icon: React.createElement(pane.icon),
          run: () => movePaneToPlacement(pane.id, placement),
        })),
      ),
    [],
  );


  const activeDockGroupCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      PANE_REGISTRY.map((pane) => ({
        id: `ide.pane.move.${pane.id}.active-dock-group`,
        group: "窗格" as const,
        label: `移动 ${pane.label} 到当前聚焦窗格组`,
        description: activeDockFocus
          ? `移动到${placementLabel(activeDockFocus.placement)} Dock 的${activeDockFocus.role === "primary" ? "主" : "副"}窗格组`
          : "先点击或聚焦一个 Dock 主/副窗格组，再用此命令移动窗格",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: React.createElement(pane.icon),
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          movePaneToPlacement(pane.id, activeDockFocus.placement, undefined, activeDockFocus.role);
        },
      })),
    [activeDockFocus],
  );

  const activeDockMoveCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      DOCK_PLACEMENTS.map((placement) => ({
        id: `ide.dock.active.move-pane.${placement}`,
        group: "窗格" as const,
        label: `移动当前聚焦 Pane 到${placementLabel(placement)} Dock`,
        description: activeDockFocus
          ? `把当前聚焦的 ${paneLabel(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId)} 从${placementLabel(activeDockFocus.placement)} Dock 移到${placementLabel(placement)} Dock`
          : "先聚焦一个 Dock 主/副窗格组，再移动当前 Pane 到目标 Dock",
        shortcut: placement === "left" ? "⌘⌥⇧←" : placement === "right" ? "⌘⌥⇧→" : placement === "top" ? "⌘⌥⇧↑" : "⌘⌥⇧↓",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: placement === "left" ? <PanelLeft /> : placement === "right" ? <PanelRight /> : <PanelBottom />,
        disabled: !activeDockFocus,
        run: () => moveActiveDockPaneToPlacement(placement),
      })),
    [activeDockFocus, activeBottomPane, activeLeftPane, activeRightPane, activeTopPane],
  );

  const focusRegionCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.focus.left",
        group: "布局",
        label: "聚焦左侧 Dock",
        description: "打开并聚焦文件、搜索、Git 等左侧 IDE 区域",
        shortcut: "⌘⌥←",
        risk: "safe",
        surface: "layout",
        icon: <PanelLeft />,
        run: () => focusIdeRegion("left"),
      },
      {
        id: "ide.focus.center",
        group: "布局",
        label: "聚焦编辑器区域",
        description: "回到主编辑器组合区域，适合从 Dock/终端回到代码",
        shortcut: "⌘⌥↵",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => focusIdeRegion("center"),
      },
      {
        id: "ide.focus.right",
        group: "布局",
        label: "聚焦右侧 Dock",
        description: "打开并聚焦 AI、Outline、扩展等右侧 IDE 区域",
        shortcut: "⌘⌥→",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        run: () => focusIdeRegion("right"),
      },
      {
        id: "ide.focus.bottom",
        group: "布局",
        label: "聚焦底部 Dock",
        description: "打开并聚焦终端、问题、输出等底部 IDE 区域",
        shortcut: "⌘⌥↓",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => focusIdeRegion("bottom"),
      },
      {
        id: "ide.focus.top",
        group: "布局",
        label: "聚焦顶部 Dock",
        description: "打开并聚焦可停靠在编辑器上方的顶部 IDE 区域",
        shortcut: "⌘⌥↑",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => focusIdeRegion("top"),
      },
    ],
    [activeBottomPane, activeLeftPane, activeRightPane, activeTopPane],
  );

  const mobilePanelCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.mobile.panel.editor",
        group: "布局",
        label: "手机面板：编辑器",
        description: "在窄屏/手机布局中显示主编辑器区域",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => showMobilePanel("editor"),
      },
      {
        id: "ide.mobile.panel.top",
        group: "布局",
        label: "手机面板：顶部 Dock",
        description: "在窄屏/手机布局中显示顶部 Dock",
        risk: "safe",
        surface: "layout",
        icon: <PanelBottom />,
        run: () => showMobilePanel("top"),
      },
      {
        id: "ide.mobile.panel.left",
        group: "布局",
        label: "手机面板：左侧工具 Dock",
        description: "在窄屏/手机布局中显示文件、搜索、Git 等左侧工具",
        risk: "safe",
        surface: "layout",
        icon: <PanelLeft />,
        run: () => showMobilePanel("left"),
      },
      {
        id: "ide.mobile.panel.right",
        group: "布局",
        label: "手机面板：右侧 AI Dock",
        description: "在窄屏/手机布局中显示 AI、Outline、扩展等右侧区域",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        run: () => showMobilePanel("right"),
      },
      {
        id: "ide.mobile.panel.bottom",
        group: "布局",
        label: "手机面板：底部终端 Dock",
        description: "在窄屏/手机布局中显示终端、问题、输出等底部区域",
        risk: "safe",
        surface: "layout",
        icon: <TerminalSquare />,
        run: () => showMobilePanel("bottom"),
      },
    ],
    [],
  );

  const activeDockLayoutCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.dock.active.split-right",
        group: "窗格",
        label: "当前 Dock 左右拆分",
        description: activeDockFocus ? `把当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 变成左右窗格组` : "先聚焦一个 Dock 窗格组，再拆分当前 Dock",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          openDockPlacement(activeDockFocus.placement);
          setDockSplitMode(activeDockFocus.placement, "vertical");
        },
      },
      {
        id: "ide.dock.active.split-down",
        group: "窗格",
        label: "当前 Dock 上下拆分",
        description: activeDockFocus ? `把当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 变成上下窗格组` : "先聚焦一个 Dock 窗格组，再拆分当前 Dock",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelBottom />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          openDockPlacement(activeDockFocus.placement);
          setDockSplitMode(activeDockFocus.placement, "horizontal");
        },
      },
      {
        id: "ide.dock.active.swap-groups",
        group: "窗格",
        label: "交换当前 Dock 主副窗格组",
        description: activeDockFocus ? `交换当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 主副窗格组` : "先聚焦一个已拆分的 Dock 窗格组，再交换主副组",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus || !canSwapDockSplit(activeDockFocus.placement),
        run: () => {
          if (!activeDockFocus) return;
          swapDockSplitPanes(activeDockFocus.placement);
        },
      },
      {
        id: "ide.dock.active.close-split",
        group: "窗格",
        label: "关闭当前 Dock 拆分",
        description: activeDockFocus ? `恢复当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 为单一窗格组` : "先聚焦一个 Dock 窗格组，再关闭拆分",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          setDockSplitMode(activeDockFocus.placement, "single");
        },
      },
      {
        id: "ide.dock.active.focus-other-group",
        group: "窗格",
        label: "切换当前 Dock 主副窗格组焦点",
        description: activeDockFocus ? `在当前${placementLabel(activeDockFocus.placement)} Dock 的主/副拆分组之间移动焦点` : "先聚焦一个已拆分的 Dock 窗格组，再切换主/副组焦点",
        shortcut: "⌘⌥Tab",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        disabled: !canFocusOppositeDockGroup(),
        run: focusOppositeDockGroup,
      },
      {
        id: "ide.dock.active.move-pane-other-group",
        group: "窗格",
        label: "移动当前 Pane 到另一窗格组",
        description: activeDockFocus ? `把当前聚焦的 Pane 移到${placementLabel(activeDockFocus.placement)} Dock 的另一主/副拆分组` : "先聚焦一个已拆分的 Dock Pane，再移动到另一窗格组",
        shortcut: "⌘⌥⇧Tab",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        disabled: !canMoveActiveDockPaneToOppositeGroup(),
        run: moveActiveDockPaneToOppositeGroup,
      },
      {
        id: "ide.dock.active.next-pane",
        group: "窗格",
        label: "当前窗格组切到下一个 Pane",
        description: activeDockFocus ? `在当前聚焦的${placementLabel(activeDockFocus.placement)} Dock ${activeDockFocus.role === "primary" ? "主" : "副"}组内切换到下一个 Pane` : "先聚焦一个 Dock 主/副窗格组，再切换组内 Pane",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelRight />,
        disabled: !canNavigateActiveDockGroup(),
        run: () => selectAdjacentDockPane("next"),
      },
      {
        id: "ide.dock.active.previous-pane",
        group: "窗格",
        label: "当前窗格组切到上一个 Pane",
        description: activeDockFocus ? `在当前聚焦的${placementLabel(activeDockFocus.placement)} Dock ${activeDockFocus.role === "primary" ? "主" : "副"}组内切换到上一个 Pane` : "先聚焦一个 Dock 主/副窗格组，再切换组内 Pane",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelLeft />,
        disabled: !canNavigateActiveDockGroup(),
        run: () => selectAdjacentDockPane("previous"),
      },
      {
        id: "ide.dock.active.reset-ratio",
        group: "窗格",
        label: "重置当前 Dock 拆分比例",
        description: activeDockFocus ? `把当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 比例恢复为 50/50` : "先聚焦一个 Dock 窗格组，再重置比例",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          resetDockSplitRatio(activeDockFocus.placement);
        },
      },
      {
        id: "ide.dock.active.grow",
        group: "布局",
        label: "放大当前 Dock",
        description: activeDockFocus ? `扩大当前聚焦的${placementLabel(activeDockFocus.placement)} Dock` : "先聚焦一个 Dock，再扩大它的布局尺寸",
        shortcut: "⌘⌥=",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Maximize2 />,
        disabled: !activeDockFocus,
        run: () => resizeActiveDockPlacement(KEYBOARD_RESIZE_LARGE_STEP),
      },
      {
        id: "ide.dock.active.shrink",
        group: "布局",
        label: "缩小当前 Dock",
        description: activeDockFocus ? `缩小当前聚焦的${placementLabel(activeDockFocus.placement)} Dock` : "先聚焦一个 Dock，再缩小它的布局尺寸",
        shortcut: "⌘⌥-",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelLeft />,
        disabled: !activeDockFocus,
        run: () => resizeActiveDockPlacement(-KEYBOARD_RESIZE_LARGE_STEP),
      },
      {
        id: "ide.dock.active.maximize",
        group: "布局",
        label: "最大化当前 Dock",
        description: activeDockFocus ? `最大化当前聚焦的${placementLabel(activeDockFocus.placement)} Dock` : "先聚焦一个 Dock 窗格组，再最大化它所属的 Dock",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Maximize2 />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          openDockPlacement(activeDockFocus.placement);
          toggleMaximizedPane(activeDockFocus.placement);
        },
      },
      {
        id: "ide.dock.active.collapse",
        group: "布局",
        label: "收起当前 Dock",
        description: activeDockFocus ? `收起当前聚焦的${placementLabel(activeDockFocus.placement)} Dock` : "先聚焦一个 Dock 窗格组，再收起它所属的 Dock",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          closeDockPlacement(activeDockFocus.placement);
        },
      },
    ],
    [activeBottomPane, activeDockFocus, activeLeftPane, activeRightPane, activeTopPane, bottomPaneIds, dockSplitModes, leftPaneIds, rightPaneIds, secondaryBottomPane, secondaryLeftPane, secondaryRightPane, secondaryTopPane, topPaneIds],
  );

  const dockSplitCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      DOCK_PLACEMENTS.flatMap((placement) => [
        {
          id: `ide.dock.split.${placement}.right`,
          group: "窗格",
          label: `${placementLabel(placement)} Dock 左右拆分`,
          description: `把${placementLabel(placement)} Dock 变成左右窗格组，并保留当前布局比例`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <Columns3 />,
          run: () => {
            openDockPlacement(placement);
            setDockSplitMode(placement, "vertical");
          },
        },
        {
          id: `ide.dock.split.${placement}.down`,
          group: "窗格",
          label: `${placementLabel(placement)} Dock 上下拆分`,
          description: `把${placementLabel(placement)} Dock 变成上下窗格组，并保留当前布局比例`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <PanelBottom />,
          run: () => {
            openDockPlacement(placement);
            setDockSplitMode(placement, "horizontal");
          },
        },
        {
          id: `ide.dock.close-split.${placement}`,
          group: "窗格",
          label: `关闭${placementLabel(placement)} Dock 拆分`,
          description: `恢复${placementLabel(placement)} Dock 为单一窗格组`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          run: () => setDockSplitMode(placement, "single"),
        },
        {
          id: `ide.dock.reset-ratio.${placement}`,
          group: "窗格",
          label: `重置${placementLabel(placement)} Dock 拆分比例`,
          description: `把${placementLabel(placement)} Dock 的拆分比例恢复为 50/50`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          run: () => resetDockSplitRatio(placement),
        },
        {
          id: `ide.dock.swap-groups.${placement}`,
          group: "窗格",
          label: `交换${placementLabel(placement)} Dock 主副窗格组`,
          description: `交换${placementLabel(placement)} Dock 的主窗格组和副窗格组，保留拆分方向和比例`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          disabled: !canSwapDockSplit(placement),
          run: () => swapDockSplitPanes(placement),
        },
      ]),
    [activeBottomPane, activeLeftPane, activeRightPane, activeTopPane, dockPaneSelections, dockSplitModes, secondaryBottomPane, secondaryLeftPane, secondaryRightPane, secondaryTopPane],
  );

  const layoutSnapshotCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.layout.snapshot.save",
        group: "布局",
        label: "保存当前 IDE 布局快照",
        description: "保存当前窗格开合、尺寸、拆分、停靠位置和顺序，便于稍后恢复",
        risk: "safe",
        surface: "layout",
        icon: <Settings2 />,
        run: saveLayoutSnapshot,
      },
      ...layoutSnapshots.map((snapshot) => ({
        id: `ide.layout.snapshot.restore.${snapshot.id}`,
        group: "布局" as const,
        label: `恢复布局快照：${snapshot.name}`,
        description: `恢复 ${formatSnapshotTime(snapshot.createdAt)} 保存的 IDE 布局快照`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        run: () => restoreLayoutSnapshot(snapshot),
      })),
      ...layoutSnapshots.map((snapshot) => ({
        id: `ide.layout.snapshot.delete.${snapshot.id}`,
        group: "布局" as const,
        label: `删除布局快照：${snapshot.name}`,
        description: `删除 ${formatSnapshotTime(snapshot.createdAt)} 保存的 IDE 布局快照`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Trash2 />,
        run: () => deleteLayoutSnapshot(snapshot.id),
      })),
    ],
    [layoutSnapshots, bottomOpen, dockPaneSelections, dockSplitModes, dockSplitRatios, editorSplitMode, editorSplitRatio, layoutPreset, leftOpen, maximizedPane, paneOrder, panePlacements, paneSizes, rightOpen, topOpen],
  );

  const commands = React.useMemo(
    () => [...layoutCommands, ...layoutSnapshotCommands, ...focusRegionCommands, ...mobilePanelCommands, ...paneVisibilityCommands, ...panePlacementCommands, ...activeDockGroupCommands, ...activeDockMoveCommands, ...activeDockLayoutCommands, ...dockSplitCommands, ...editorCommands, ...searchCommands, ...gitCommands, ...terminalCommands],
    [activeDockGroupCommands, activeDockLayoutCommands, activeDockMoveCommands, dockSplitCommands, editorCommands, focusRegionCommands, gitCommands, layoutCommands, layoutSnapshotCommands, mobilePanelCommands, panePlacementCommands, paneVisibilityCommands, searchCommands, terminalCommands],
  );

  function applyLayoutPreset(preset: LayoutPreset) {
    setLayoutPreset(preset);
    setMaximizedPane(null);
    setTopOpen(preset === "terminal");
    setLeftOpen(true);
    setRightOpen(true);
    setBottomOpen(true);
    setPaneSizes(
      preset === "code"
        ? CODE_PANE_SIZES
        : preset === "terminal"
          ? TERMINAL_PANE_SIZES
          : DEFAULT_PANE_SIZES,
    );
  }

  function resetLayout() {
    setLayoutPreset("balanced");
    setPaneSizes(DEFAULT_PANE_SIZES);
    setDockSplitModes(DEFAULT_DOCK_SPLIT_MODES);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections(DEFAULT_DOCK_PANE_SELECTIONS);
    setMaximizedPane(null);
    closeEditorSplit();
    resetPanePlacements();
  }

  function resetPanePlacements() {
    setPanePlacements(DEFAULT_PANE_PLACEMENTS);
    setPaneOrder(DEFAULT_PANE_ORDER);
    setDockSplitModes(DEFAULT_DOCK_SPLIT_MODES);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections(DEFAULT_DOCK_PANE_SELECTIONS);
    setHiddenPanes([]);
    setActivity("explorer");
    setTopPanel("output");
    setRightPanel("ai");
    setBottomPanel("terminal");
    setTopOpen(false);
    setLeftOpen(true);
    setRightOpen(true);
    setBottomOpen(true);
  }

  function showMobilePanel(panel: MobilePanel) {
    if (panel === "top") setTopOpen(true);
    if (panel === "left") setLeftOpen(true);
    if (panel === "right") setRightOpen(true);
    if (panel === "bottom") setBottomOpen(true);
    setMobilePanel(panel);
  }

  function currentIdeLayoutState(): IdeLayoutState {
    return {
      topOpen,
      leftOpen,
      rightOpen,
      bottomOpen,
      maximizedPane,
      layoutPreset,
      paneSizes,
      editorSplitMode,
      editorSplitRatio,
      panePlacements,
      paneOrder,
      dockSplitModes,
      dockSplitRatios,
      dockPaneSelections,
      hiddenPanes,
    };
  }

  function saveLayoutSnapshot() {
    const createdAt = new Date().toISOString();
    const snapshot: IdeLayoutSnapshot = {
      id: `layout-${Date.now()}`,
      name: `工作台布局 ${layoutSnapshots.length + 1}`,
      createdAt,
      state: currentIdeLayoutState(),
    };
    const nextSnapshots = [snapshot, ...layoutSnapshots].slice(0, MAX_LAYOUT_SNAPSHOTS);
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function restoreLayoutSnapshot(snapshot: IdeLayoutSnapshot) {
    applyIdeLayoutState(snapshot.state);
  }

  function deleteLayoutSnapshot(snapshotId: string) {
    const nextSnapshots = layoutSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function applyIdeLayoutState(state: IdeLayoutState) {
    const sanitized = sanitizeIdeLayoutState(state);
    const nextPanePlacements = { ...DEFAULT_PANE_PLACEMENTS, ...sanitized.panePlacements };
    const nextPaneOrder = {
      top: sanitized.paneOrder?.top ?? DEFAULT_PANE_ORDER.top,
      left: sanitized.paneOrder?.left ?? DEFAULT_PANE_ORDER.left,
      right: sanitized.paneOrder?.right ?? DEFAULT_PANE_ORDER.right,
      bottom: sanitized.paneOrder?.bottom ?? DEFAULT_PANE_ORDER.bottom,
    };
    const nextHiddenPanes = sanitized.hiddenPanes ?? [];
    const nextGroups = groupPanesByPlacement(nextPanePlacements, nextPaneOrder, nextHiddenPanes);
    setPanePlacements(nextPanePlacements);
    setPaneOrder(nextPaneOrder);
    setDockSplitModes({ ...DEFAULT_DOCK_SPLIT_MODES, ...sanitized.dockSplitModes });
    setDockSplitRatios({ ...DEFAULT_DOCK_SPLIT_RATIOS, ...sanitized.dockSplitRatios });
    setDockPaneSelections(mergeDockPaneSelections(sanitized.dockPaneSelections));
    setHiddenPanes(nextHiddenPanes);
    setTopOpen(sanitized.topOpen ?? false);
    setLeftOpen(sanitized.leftOpen ?? true);
    setRightOpen(sanitized.rightOpen ?? true);
    setBottomOpen(sanitized.bottomOpen ?? true);
    setMaximizedPane(sanitized.maximizedPane ?? null);
    setLayoutPreset(sanitized.layoutPreset ?? "balanced");
    setPaneSizes({ ...DEFAULT_PANE_SIZES, ...sanitized.paneSizes });
    setEditorSplitMode(sanitized.editorSplitMode ?? "single");
    setEditorSplitRatio(sanitized.editorSplitRatio ?? DEFAULT_EDITOR_SPLIT_RATIO);
    setTopPanel(nextGroups.top[0] ?? "output");
    setActivity(nextGroups.left[0] ?? "explorer");
    setRightPanel(nextGroups.right[0] ?? "ai");
    setBottomPanel(nextGroups.bottom[0] ?? "terminal");
  }

  function startPaneResize(pane: keyof IdePaneSizes, event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = paneSizes[pane];
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = pane === "bottom" ? startY - moveEvent.clientY : pane === "top" ? moveEvent.clientY - startY : moveEvent.clientX - startX;
      const signedDelta = pane === "right" ? -delta : delta;
      const { min, max } = getPaneSizeLimits(pane);
      const next = clamp(startSize + signedDelta, min, max);
      setPaneSizes((current) => ({ ...current, [pane]: next }));
      setLayoutPreset("balanced");
    };
    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizePaneFromKeyboard(pane: keyof IdePaneSizes, event: React.KeyboardEvent) {
    const baseStep = event.shiftKey ? KEYBOARD_RESIZE_LARGE_STEP : KEYBOARD_RESIZE_STEP;
    const delta = keyboardResizeDelta(pane, event.key, baseStep);
    if (delta === 0) return;
    event.preventDefault();
    const { min, max } = getPaneSizeLimits(pane);
    setPaneSizes((current) => ({
      ...current,
      [pane]: clamp(current[pane] + delta, min, max),
    }));
    setLayoutPreset("balanced");
  }

  function resizeActiveDockPlacement(delta: number) {
    if (!activeDockFocus) return;
    const pane = activeDockFocus.placement;
    const { min, max } = getPaneSizeLimits(pane);
    setPaneSizes((current) => ({
      ...current,
      [pane]: clamp(current[pane] + delta, min, max),
    }));
    setLayoutPreset("balanced");
    openDockPlacement(pane);
  }

  function startEditorSplitResize(event: React.PointerEvent) {
    if (editorSplitMode === "single") return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRatio = editorSplitRatio;
    const host = event.currentTarget.parentElement;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = host?.getBoundingClientRect();
      const axisSize = editorSplitMode === "vertical" ? rect?.width : rect?.height;
      if (!axisSize) return;
      const delta = editorSplitMode === "vertical" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
      const nextRatio = startRatio + (delta / axisSize) * 100;
      setEditorSplitRatio(clamp(nextRatio, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max));
    };
    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizeEditorSplitFromKeyboard(event: React.KeyboardEvent) {
    const baseStep = event.shiftKey ? 8 : 3;
    const delta = editorSplitKeyboardDelta(editorSplitMode, event.key, baseStep);
    if (delta === 0) return;
    event.preventDefault();
    setEditorSplitRatio((current) => clamp(current + delta, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max));
  }

  function startDockSplitResize(placement: PanePlacement, mode: DockSplitMode, event: React.PointerEvent) {
    if (mode === "single") return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startRatio = dockSplitRatios[placement];
    const host = event.currentTarget.parentElement;
    const onPointerMove = (moveEvent: PointerEvent) => {
      const rect = host?.getBoundingClientRect();
      const axisSize = mode === "vertical" ? rect?.width : rect?.height;
      if (!axisSize) return;
      const delta = mode === "vertical" ? moveEvent.clientX - startX : moveEvent.clientY - startY;
      const nextRatio = startRatio + (delta / axisSize) * 100;
      setDockSplitRatios((current) => ({
        ...current,
        [placement]: clamp(nextRatio, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max),
      }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  function resizeDockSplitFromKeyboard(placement: PanePlacement, mode: DockSplitMode, event: React.KeyboardEvent) {
    const baseStep = event.shiftKey ? 8 : 3;
    const delta = splitKeyboardDelta(mode, event.key, baseStep);
    if (delta === 0) return;
    event.preventDefault();
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: clamp(current[placement] + delta, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max),
    }));
  }

  function splitEditor(mode: Exclude<EditorSplitMode, "single">) {
    setEditorSplitMode(mode);
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    setSecondaryPath((current) => current ?? activePath);
    setSecondaryPathRootId((current) => current || activePathRootId || rootId);
    setActiveEditorGroup("secondary");
  }

  function setDockSplitMode(placement: PanePlacement, mode: DockSplitMode) {
    setDockSplitModes((current) => ({ ...current, [placement]: mode }));
    if (mode !== "single") {
      setDockSplitRatios((current) => ({ ...current, [placement]: current[placement] ?? DEFAULT_DOCK_SPLIT_RATIOS[placement] }));
    }
  }

  function selectDockPane(placement: PanePlacement, role: DockPaneRole, paneId: PaneId) {
    setDockPaneSelections((current) => ({
      ...current,
      [placement]: {
        ...current[placement],
        [role]: paneId,
      },
    }));
    if (role === "primary") setPrimaryDockPanel(placement, paneId);
    openDockPlacement(placement);
    focusDockPane(placement, role, paneId);
  }

  function selectDockTab(placement: PanePlacement, paneId: PaneId) {
    const role = activeDockFocus?.placement === placement ? activeDockFocus.role : "primary";
    selectDockPane(placement, role, paneId);
  }

  function setPrimaryDockPanel(placement: PanePlacement, paneId: PaneId) {
    if (placement === "top") setTopPanel(paneId);
    if (placement === "left") setActivity(paneId);
    if (placement === "right") setRightPanel(paneId);
    if (placement === "bottom") setBottomPanel(paneId);
  }

  function focusDockPane(placement: PanePlacement, role: DockPaneRole, paneId: PaneId) {
    setActiveDockFocus({ placement, role, paneId });
  }

  function focusIdeRegion(region: IdeFocusRegion) {
    if (region === "center") {
      setMobilePanel("editor");
      setActiveDockFocus(null);
      focusIdeRegionNode(region);
      return;
    }
    openDockPlacement(region);
    const activePane = activeDockPaneForPlacement(region, "primary");
    if (activePane) focusDockPane(region, "primary", activePane);
    focusIdeRegionNode(region);
  }

  function focusIdeRegionNode(region: IdeFocusRegion) {
    requestAnimationFrame(() => {
      ideFocusRegionRef(region).current?.focus({ preventScroll: true });
    });
  }

  function ideFocusRegionRef(region: IdeFocusRegion) {
    if (region === "top") return topDockRef;
    if (region === "left") return leftDockRef;
    if (region === "right") return rightDockRef;
    if (region === "bottom") return bottomDockRef;
    return centerPaneRef;
  }

  function activeDockPaneForPlacement(placement: PanePlacement, role: DockPaneRole): PaneId | undefined {
    if (placement === "top") return role === "primary" ? activeTopPane : secondaryTopPane;
    if (placement === "left") return role === "primary" ? activeLeftPane : secondaryLeftPane;
    if (placement === "right") return role === "primary" ? activeRightPane : secondaryRightPane;
    return role === "primary" ? activeBottomPane : secondaryBottomPane;
  }

  function dockPaneIdsForPlacement(placement: PanePlacement): PaneId[] {
    if (placement === "top") return topPaneIds;
    if (placement === "left") return leftPaneIds;
    if (placement === "right") return rightPaneIds;
    return bottomPaneIds;
  }

  function canNavigateActiveDockGroup() {
    return Boolean(activeDockFocus && dockPaneIdsForPlacement(activeDockFocus.placement).length > 1);
  }

  function canFocusOppositeDockGroup() {
    if (!activeDockFocus || dockSplitModes[activeDockFocus.placement] === "single") return false;
    return Boolean(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role === "primary" ? "secondary" : "primary"));
  }

  function focusOppositeDockGroup() {
    if (!activeDockFocus || dockSplitModes[activeDockFocus.placement] === "single") return;
    const nextRole: DockPaneRole = activeDockFocus.role === "primary" ? "secondary" : "primary";
    const nextPane = activeDockPaneForPlacement(activeDockFocus.placement, nextRole);
    if (!nextPane) return;
    focusDockPane(activeDockFocus.placement, nextRole, nextPane);
  }

  function canMoveActiveDockPaneToOppositeGroup() {
    return Boolean(activeDockFocus && dockSplitModes[activeDockFocus.placement] !== "single");
  }

  function moveActiveDockPaneToOppositeGroup() {
    if (!activeDockFocus || dockSplitModes[activeDockFocus.placement] === "single") return;
    const paneId = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    const nextRole: DockPaneRole = activeDockFocus.role === "primary" ? "secondary" : "primary";
    movePaneToPlacement(paneId, activeDockFocus.placement, undefined, nextRole);
  }

  function selectAdjacentDockPane(direction: "next" | "previous") {
    if (!activeDockFocus) return;
    const paneIds = dockPaneIdsForPlacement(activeDockFocus.placement);
    if (paneIds.length < 2) return;
    const currentPane = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    const currentIndex = Math.max(0, paneIds.indexOf(currentPane));
    const nextIndex = direction === "next" ? (currentIndex + 1) % paneIds.length : (currentIndex - 1 + paneIds.length) % paneIds.length;
    selectDockPane(activeDockFocus.placement, activeDockFocus.role, paneIds[nextIndex]);
  }

  function canSwapDockSplit(placement: PanePlacement) {
    return dockSplitModes[placement] !== "single" && Boolean(activeDockPaneForPlacement(placement, "primary") && activeDockPaneForPlacement(placement, "secondary"));
  }

  function swapDockSplitPanes(placement: PanePlacement) {
    const primaryPane = activeDockPaneForPlacement(placement, "primary");
    const secondaryPane = activeDockPaneForPlacement(placement, "secondary");
    if (dockSplitModes[placement] === "single" || !primaryPane || !secondaryPane) return;
    setDockPaneSelections((current) => ({
      ...current,
      [placement]: {
        ...current[placement],
        primary: secondaryPane,
        secondary: primaryPane,
      },
    }));
    setPrimaryDockPanel(placement, secondaryPane);
    openDockPlacement(placement);
    focusDockPane(placement, "primary", secondaryPane);
  }

  function resetDockSplitRatio(placement: PanePlacement) {
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: DEFAULT_DOCK_SPLIT_RATIOS[placement],
    }));
  }

  function openDockPlacement(placement: PanePlacement) {
    if (placement === "top") {
      setTopOpen(true);
      setMobilePanel("top");
    }
    if (placement === "left") {
      setLeftOpen(true);
      setMobilePanel("left");
    }
    if (placement === "right") {
      setRightOpen(true);
      setMobilePanel("right");
    }
    if (placement === "bottom") {
      setBottomOpen(true);
      setMobilePanel("bottom");
    }
  }

  function closeDockPlacement(placement: PanePlacement) {
    if (placement === "top") setTopOpen(false);
    if (placement === "left") setLeftOpen(false);
    if (placement === "right") setRightOpen(false);
    if (placement === "bottom") setBottomOpen(false);
    setActiveDockFocus((current) => (current?.placement === placement ? null : current));
    setMaximizedPane((current) => (current === placement ? null : current));
    if (mobilePanel === placement) setMobilePanel("editor");
  }

  function closeEditorSplit() {
    setEditorSplitMode("single");
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    setActiveEditorGroup("primary");
  }

  function toggleMaximizedPane(pane: NonNullable<MaximizedPane>) {
    setMaximizedPane((current) => (current === pane ? null : pane));
  }

  function hidePane(paneId: PaneId) {
    setHiddenPanes((current) => (current.includes(paneId) ? current : [...current, paneId]));
    setActiveDockFocus((current) => (current?.paneId === paneId ? null : current));
  }

  function hideActiveDockPane() {
    if (!activeDockFocus) return;
    hidePane(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId);
  }

  function restoreAllHiddenPanes() {
    const panesToRestore = hiddenPanes;
    setHiddenPanes([]);
    for (const paneId of panesToRestore) {
      movePaneToPlacement(paneId, panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement);
    }
  }

  function restorePane(paneId: PaneId) {
    setHiddenPanes((current) => current.filter((hiddenPane) => hiddenPane !== paneId));
    movePaneToPlacement(paneId, panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement);
  }

  function moveActiveDockPaneToPlacement(placement: PanePlacement) {
    if (!activeDockFocus) return;
    const paneId = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    movePaneToPlacement(paneId, placement);
  }

  function movePaneToPlacement(paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role: DockPaneRole = "primary") {
    setPanePlacements((current) => ({ ...current, [paneId]: placement }));
    setPaneOrder((current) => reorderPane(current, paneId, placement, beforePaneId));
    selectDockPane(placement, role, paneId);
    if (placement === "top") {
      setTopPanel(paneId);
      setTopOpen(true);
      setMobilePanel("top");
    }
    if (placement === "left") {
      setActivity(paneId);
      setLeftOpen(true);
      setMobilePanel("left");
    }
    if (placement === "right") {
      setRightPanel(paneId);
      setRightOpen(true);
      setMobilePanel("right");
    }
    if (placement === "bottom") {
      setBottomPanel(paneId);
      setBottomOpen(true);
      setMobilePanel("bottom");
    }
  }

  function beginPaneDrag(paneId: PaneId, event: React.DragEvent) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tracevane-pane", paneId);
    event.dataTransfer.setData("text/plain", paneLabel(paneId));
    setDraggingPane(paneId);
  }

  function clearPaneDragState() {
    setDraggingPane(null);
    setDropTarget(null);
  }

  function dragPaneOverDock(placement: PanePlacement, event: React.DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(placement);
  }

  function leavePaneDock(placement: PanePlacement, event: React.DragEvent) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setDropTarget((current) => (current === placement ? null : current));
  }

  function dropPaneOnDock(placement: PanePlacement, event: React.DragEvent, beforePaneId?: PaneId, role: DockPaneRole = "primary") {
    event.preventDefault();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId)) {
      movePaneToPlacement(paneId, placement, beforePaneId, role);
    }
    clearPaneDragState();
  }

  function dropPaneOnDockGroup(placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId)) {
      movePaneToPlacement(paneId, placement, undefined, role);
    }
    clearPaneDragState();
  }

  function activateActivity(nextActivity: PaneId) {
    setActivity(nextActivity);
    const placement = panePlacements[nextActivity];
    if (placement === "top") {
      setTopPanel(nextActivity);
      selectDockPane("top", "primary", nextActivity);
      setTopOpen(true);
      setMobilePanel("top");
      return;
    }
    if (placement === "bottom") {
      setBottomPanel(nextActivity);
      selectDockPane("bottom", "primary", nextActivity);
      setBottomOpen(true);
      setMobilePanel("bottom");
      return;
    }
    if (placement === "right") {
      setRightPanel(nextActivity);
      selectDockPane("right", "primary", nextActivity);
      setRightOpen(true);
      setMobilePanel("right");
      return;
    }
    setLeftOpen(true);
    setMobilePanel("left");
    selectDockPane("left", "primary", nextActivity);
  }

  return (
    <main
      className="workspace-ide-shell"
      data-testid="workspace-ide-shell"
      data-ide-layout-preset={layoutPreset}
      data-ide-maximized-pane={maximizedPane ?? ""}
      data-ide-pane-size-state={`${paneSizes.top}:${paneSizes.left}:${paneSizes.right}:${paneSizes.bottom}`}
      data-ide-editor-split={editorSplitMode}
      data-ide-dragging-pane={draggingPane ?? ""}
      data-ide-drop-target={dropTarget ?? ""}
      data-ide-mobile-panel={mobilePanel}
      data-ide-dock-selection-state={dockSelectionState(dockPaneSelections)}
      style={{
        "--ide-top-height": `${paneSizes.top}px`,
        "--ide-left-width": `${paneSizes.left}px`,
        "--ide-right-width": `${paneSizes.right}px`,
        "--ide-bottom-height": `${paneSizes.bottom}px`,
      } as React.CSSProperties}
    >
      <header className="workspace-ide-shell__topbar">
        <div className="workspace-ide-shell__brand">
          <Code2 className="h-4 w-4 text-cyan-300" aria-hidden={true} />
          <span>Tracevane IDE</span>
          <span className="workspace-ide-shell__pill">IDE-first</span>
        </div>
        <button
          type="button"
          className="workspace-ide-shell__command"
          onClick={() => setCommandPaletteOpen(true)}
          data-workspace-command-palette-trigger
        >
          <span className="text-slate-500">⌘⇧P</span>
          <span>命令、文件、符号、Git、终端、AI 上下文</span>
        </button>
        <div className="workspace-ide-shell__layout-presets" aria-label="IDE 布局预设">
          <button type="button" data-active={layoutPreset === "balanced"} onClick={() => applyLayoutPreset("balanced")}>平衡</button>
          <button type="button" data-active={layoutPreset === "code"} onClick={() => applyLayoutPreset("code")}>代码</button>
          <button type="button" data-active={layoutPreset === "terminal"} onClick={() => applyLayoutPreset("terminal")}>终端</button>
        </div>
        <div className="workspace-ide-shell__layout-snapshots" aria-label="IDE 布局快照">
          <button type="button" onClick={saveLayoutSnapshot} data-ide-layout-snapshot-save>保存布局</button>
          {layoutSnapshots.slice(0, 3).map((snapshot) => (
            <span key={snapshot.id} className="workspace-ide-shell__layout-snapshot" data-ide-layout-snapshot={snapshot.id}>
              <button type="button" onClick={() => restoreLayoutSnapshot(snapshot)} title={`恢复 ${snapshot.name}`}>
                {snapshot.name}
              </button>
              <button type="button" aria-label={`删除布局快照 ${snapshot.name}`} onClick={() => deleteLayoutSnapshot(snapshot.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="workspace-ide-shell__top-actions">
          <Button size="sm" variant="ghost" onClick={() => setTopOpen((value) => !value)}>
            <PanelBottom className="mr-2 h-4 w-4 rotate-180" />顶部
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLeftOpen((value) => !value)}>
            <PanelLeft className="mr-2 h-4 w-4" />左栏
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setBottomOpen((value) => !value)}>
            <PanelBottom className="mr-2 h-4 w-4" />终端
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRightOpen((value) => !value)}>
            <PanelRight className="mr-2 h-4 w-4" />插件
          </Button>
        </div>
        <div className="workspace-ide-shell__mobile-switcher" aria-label="手机工作区面板切换">
          <button type="button" data-active={mobilePanel === "editor"} onClick={() => showMobilePanel("editor")}>编辑</button>
          <button
            type="button"
            data-active={mobilePanel === "top"}
            onClick={() => showMobilePanel("top")}
          >
            顶部
          </button>
          <button
            type="button"
            data-active={mobilePanel === "left"}
            onClick={() => showMobilePanel("left")}
          >
            工具
          </button>
          <button
            type="button"
            data-active={mobilePanel === "right"}
            onClick={() => showMobilePanel("right")}
          >
            AI
          </button>
          <button
            type="button"
            data-active={mobilePanel === "bottom"}
            onClick={() => showMobilePanel("bottom")}
          >
            终端
          </button>
        </div>
      </header>

      <div
        className={cn(
          "workspace-ide-shell__body",
          !leftOpen && "workspace-ide-shell__body--left-closed",
          !rightOpen && "workspace-ide-shell__body--right-closed",
          maximizedPane && `workspace-ide-shell__body--max-${maximizedPane}`,
          draggingPane && "workspace-ide-shell__body--dragging-pane",
        )}
      >
        <aside className="workspace-ide-shell__activity" aria-label="IDE activity rail">
          {leftPaneIds.map((paneId) => {
            const item = paneDescriptor(paneId);
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn("workspace-ide-shell__activity-button", activeLeftPane === item.id && "is-active")}
                onClick={() => selectDockTab("left", item.id)}
                title={`${item.label} ${item.shortcut ?? ""}`}
                data-ide-pane-draggable={item.id}
                draggable
                onDragStart={(event) => beginPaneDrag(item.id, event)}
                onDragEnd={clearPaneDragState}
                onDragOver={(event) => dragPaneOverDock("left", event)}
                onDrop={(event) => {
                  event.stopPropagation();
                  dropPaneOnDock("left", event, item.id);
                }}
              >
                <Icon className="h-5 w-5" aria-hidden={true} />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button type="button" className="workspace-ide-shell__activity-button mt-auto" title="设置">
            <Settings2 className="h-5 w-5" aria-hidden={true} />
            <span>设置</span>
          </button>
        </aside>

        {leftOpen ? (
          <section
            ref={(node) => { leftDockRef.current = node; }}
            className={cn("workspace-ide-shell__left-pane", dropTarget === "left" && "is-drop-target")}
            data-testid="workspace-ide-left-pane"
            data-ide-focus-region="left"
            data-ide-dock-placement="left"
            tabIndex={-1}
            onDragOver={(event) => dragPaneOverDock("left", event)}
            onDragLeave={(event) => leavePaneDock("left", event)}
            onDrop={(event) => dropPaneOnDock("left", event)}
          >
            {activeLeftPane ? (
              <>
                <PaneHeader title={paneLabel(activeLeftPane)} subtitle={leftPaneSubtitle(activeLeftPane)} />
                <PaneDockControls
                  paneId={activeLeftPane}
                  placement="left"
                  splitMode={dockSplitModes.left}
                  onMovePane={movePaneToPlacement}
                  onSetDockSplitMode={setDockSplitMode}
                  onSwapDockGroups={swapDockSplitPanes}
                  onFocusOtherGroup={focusOppositeDockGroup}
                  canFocusOtherGroup={canFocusOppositeDockGroup() && activeDockFocus?.placement === "left"}
                  onBeginDrag={beginPaneDrag}
                  onEndDrag={clearPaneDragState}
                  onHidePane={hidePane}
                  onCloseDock={() => setLeftOpen(false)}
                />
                <DockPaneFrame
                  placement="left"
                  splitMode={dockSplitModes.left}
                  splitRatio={dockSplitRatios.left}
                  primaryPane={activeLeftPane}
                  secondaryPane={secondaryLeftPane}
                  activeFocus={activeDockFocus}
                  workspaceDirectory={workspaceDirectory}
                  onTerminalCommandsChange={setTerminalCommands}
                  onRestore={resetPanePlacements}
                  onStartSplitResize={startDockSplitResize}
                  onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                  onFocusPane={focusDockPane}
                  onDropPaneOnGroup={dropPaneOnDockGroup}
                  renderPane={(paneId, role) => (
                    <LeftPane
                      activity={paneId}
                      rootId={rootId}
                      activePath={activePath}
                      workspaceDirectory={workspaceDirectory}
                      revealRequest={role === "primary" ? explorerRevealRequest : null}
                      onOpenFile={openFile}
                      onOpenDiff={openDiff}
                      onChangeRoot={setRootId}
                      onWorkspaceDirectoryChange={setWorkspaceDirectory}
                      onSearchCommandsChange={role === "primary" ? setSearchCommands : ignoreWorkspaceCommands}
                      onGitCommandsChange={role === "primary" ? setGitCommands : ignoreWorkspaceCommands}
                      onRevealInExplorer={revealInExplorer}
                      onFocusTerminal={() => {
                        setBottomPanel("terminal");
                        setBottomOpen(true);
                      }}
                    />
                  )}
                />
              </>
            ) : (
              <EmptyDockPane placement="left" onRestore={resetPanePlacements} />
            )}
          </section>
        ) : null}
        {leftOpen ? (
          <ResizeHandle
            pane="left"
            label="调整左侧窗格宽度"
            orientation="vertical"
            value={paneSizes.left}
            limits={getPaneSizeLimits("left")}
            onPointerDown={(event) => startPaneResize("left", event)}
            onKeyDown={(event) => resizePaneFromKeyboard("left", event)}
          />
        ) : null}

        <section
          ref={(node) => { centerPaneRef.current = node; }}
          className="workspace-ide-shell__center"
          data-testid="workspace-ide-center-pane"
          data-ide-focus-region="center"
          data-ide-pane="center"
          tabIndex={-1}
        >
          {topOpen ? (
            <section
              ref={(node) => { topDockRef.current = node; }}
              className={cn("workspace-ide-shell__top-dock", dropTarget === "top" && "is-drop-target")}
              data-testid="workspace-ide-top-pane"
              data-ide-focus-region="top"
              data-ide-pane="top"
              data-ide-dock-placement="top"
              tabIndex={-1}
              onDragOver={(event) => dragPaneOverDock("top", event)}
              onDragLeave={(event) => leavePaneDock("top", event)}
              onDrop={(event) => dropPaneOnDock("top", event)}
            >
              <div className="workspace-ide-shell__top-tabs">
                {topPaneIds.map((paneId) => (
                  <div
                    key={paneId}
                    className={cn("workspace-ide-shell__dock-tab", activeTopPane === paneId && "is-active")}
                    data-ide-dock-tab={paneId}
                    data-ide-pane-draggable={paneId}
                    draggable
                    onDragStart={(event) => beginPaneDrag(paneId, event)}
                    onDragEnd={clearPaneDragState}
                    onDragOver={(event) => dragPaneOverDock("top", event)}
                    onDrop={(event) => {
                      event.stopPropagation();
                      dropPaneOnDock("top", event, paneId);
                    }}
                  >
                    <button type="button" className="workspace-ide-shell__top-tab" onClick={() => selectDockTab("top", paneId)}>
                      {paneLabel(paneId)}
                    </button>
                    <PaneDockControls
                      paneId={paneId}
                      placement="top"
                      compact
                      splitMode={dockSplitModes.top}
                      onMovePane={movePaneToPlacement}
                      onSetDockSplitMode={setDockSplitMode}
                      onSwapDockGroups={swapDockSplitPanes}
                      onFocusOtherGroup={focusOppositeDockGroup}
                      canFocusOtherGroup={canFocusOppositeDockGroup() && activeDockFocus?.placement === "top"}
                      onBeginDrag={beginPaneDrag}
                      onEndDrag={clearPaneDragState}
                      onHidePane={hidePane}
                      onCloseDock={() => setTopOpen(false)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="workspace-ide-shell__panel-icon"
                  title={maximizedPane === "top" ? "恢复顶部 Dock" : "最大化顶部 Dock"}
                  onClick={() => toggleMaximizedPane("top")}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden={true} />
                </button>
              </div>
              <DockPaneFrame
                placement="top"
                splitMode={dockSplitModes.top}
                splitRatio={dockSplitRatios.top}
                primaryPane={activeTopPane}
                secondaryPane={secondaryTopPane}
                activeFocus={activeDockFocus}
                workspaceDirectory={workspaceDirectory}
                onTerminalCommandsChange={setTerminalCommands}
                onRestore={resetPanePlacements}
                onStartSplitResize={startDockSplitResize}
                onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                onFocusPane={focusDockPane}
                onDropPaneOnGroup={dropPaneOnDockGroup}
              />
              <ResizeHandle
                pane="top"
                label="调整顶部 Dock 高度"
                orientation="horizontal"
                value={paneSizes.top}
                limits={getPaneSizeLimits("top")}
                onPointerDown={(event) => startPaneResize("top", event)}
                onKeyDown={(event) => resizePaneFromKeyboard("top", event)}
              />
            </section>
          ) : null}
          <div
            className="workspace-ide-shell__editor-grid"
            data-ide-editor-split={editorSplitMode}
            style={{ "--ide-editor-primary-size": `${editorSplitRatio}%` } as React.CSSProperties}
          >
            <EditorGroupFrame
              group="primary"
              title="主编辑器组"
              active={activeEditorGroup === "primary"}
              filePath={activePath}
              splitMode={editorSplitMode}
              onFocus={() => setActiveEditorGroup("primary")}
              onSplitRight={() => splitEditor("vertical")}
              onSplitDown={() => splitEditor("horizontal")}
            >
              <WorkspaceEditorStage
                openFile={activePath}
                gitDiffTarget={gitDiffTarget}
                searchRequest={searchRequest}
                rootId={activePathRootId || rootId}
                workspaceRootId={rootId}
                workspaceRootAbsolutePath={workspaceDirectory?.rootAbsolutePath ?? ""}
                onSaveStateChange={setSaveState}
                onCommandsChange={setEditorCommands}
                onRevealInExplorer={revealInExplorer}
                onActiveFileChange={syncActiveEditorFile}
              />
            </EditorGroupFrame>
            {editorSplitMode !== "single" ? (
              <>
                <EditorSplitHandle
                  mode={editorSplitMode}
                  value={editorSplitRatio}
                  onPointerDown={startEditorSplitResize}
                  onKeyDown={resizeEditorSplitFromKeyboard}
                />
                <EditorGroupFrame
                  group="secondary"
                  title="副编辑器组"
                  active={activeEditorGroup === "secondary"}
                  filePath={secondaryPath ?? activePath}
                  splitMode={editorSplitMode}
                  onFocus={() => setActiveEditorGroup("secondary")}
                  onSplitRight={() => splitEditor("vertical")}
                  onSplitDown={() => splitEditor("horizontal")}
                  onClose={closeEditorSplit}
                >
                  <WorkspaceEditorStage
                    openFile={secondaryPath ?? activePath}
                    gitDiffTarget={null}
                    searchRequest={null}
                    rootId={secondaryPathRootId || activePathRootId || rootId}
                    workspaceRootId={rootId}
                    workspaceRootAbsolutePath={workspaceDirectory?.rootAbsolutePath ?? ""}
                    onSaveStateChange={() => undefined}
                    onCommandsChange={() => undefined}
                    onRevealInExplorer={revealInExplorer}
                    onActiveFileChange={(path, tabRootId) => {
                      if (!path) return;
                      setSecondaryPath(path);
                      if (tabRootId) setSecondaryPathRootId(tabRootId);
                    }}
                  />
                </EditorGroupFrame>
              </>
            ) : null}
          </div>
          {bottomOpen ? (
            <section
              ref={(node) => { bottomDockRef.current = node; }}
              className={cn("workspace-ide-shell__bottom", dropTarget === "bottom" && "is-drop-target")}
              data-testid="workspace-ide-bottom-pane"
              data-ide-focus-region="bottom"
              data-ide-pane="bottom"
              data-ide-dock-placement="bottom"
              tabIndex={-1}
              onDragOver={(event) => dragPaneOverDock("bottom", event)}
              onDragLeave={(event) => leavePaneDock("bottom", event)}
              onDrop={(event) => dropPaneOnDock("bottom", event)}
            >
              <ResizeHandle
                pane="bottom"
                label="调整底部 Dock 高度"
                orientation="horizontal"
                value={paneSizes.bottom}
                limits={getPaneSizeLimits("bottom")}
                onPointerDown={(event) => startPaneResize("bottom", event)}
                onKeyDown={(event) => resizePaneFromKeyboard("bottom", event)}
              />
              <div className="workspace-ide-shell__panel-tabs">
                {bottomPaneIds.map((paneId) => (
                  <div
                    key={paneId}
                    className={cn("workspace-ide-shell__dock-tab", activeBottomPane === paneId && "is-active")}
                    data-ide-dock-tab={paneId}
                    data-ide-pane-draggable={paneId}
                    draggable
                    onDragStart={(event) => beginPaneDrag(paneId, event)}
                    onDragEnd={clearPaneDragState}
                    onDragOver={(event) => dragPaneOverDock("bottom", event)}
                    onDrop={(event) => {
                      event.stopPropagation();
                      dropPaneOnDock("bottom", event, paneId);
                    }}
                  >
                    <button type="button" className="workspace-ide-shell__panel-tab" onClick={() => selectDockTab("bottom", paneId)}>
                      {paneLabel(paneId)}
                    </button>
                    <PaneDockControls
                      paneId={paneId}
                      placement="bottom"
                      compact
                      splitMode={dockSplitModes.bottom}
                      onMovePane={movePaneToPlacement}
                      onSetDockSplitMode={setDockSplitMode}
                      onSwapDockGroups={swapDockSplitPanes}
                      onFocusOtherGroup={focusOppositeDockGroup}
                      canFocusOtherGroup={canFocusOppositeDockGroup() && activeDockFocus?.placement === "bottom"}
                      onBeginDrag={beginPaneDrag}
                      onEndDrag={clearPaneDragState}
                      onHidePane={hidePane}
                      onCloseDock={() => setBottomOpen(false)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  className="workspace-ide-shell__panel-icon"
                  title={maximizedPane === "bottom" ? "恢复底部 Dock" : "最大化底部 Dock"}
                  onClick={() => toggleMaximizedPane("bottom")}
                >
                  <Maximize2 className="h-4 w-4" aria-hidden={true} />
                </button>
              </div>
              <DockPaneFrame
                placement="bottom"
                splitMode={dockSplitModes.bottom}
                splitRatio={dockSplitRatios.bottom}
                primaryPane={activeBottomPane}
                secondaryPane={secondaryBottomPane}
                activeFocus={activeDockFocus}
                workspaceDirectory={workspaceDirectory}
                onTerminalCommandsChange={setTerminalCommands}
                onRestore={resetPanePlacements}
                onStartSplitResize={startDockSplitResize}
                onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                onFocusPane={focusDockPane}
                onDropPaneOnGroup={dropPaneOnDockGroup}
              />
            </section>
          ) : null}
        </section>

        {rightOpen ? (
          <ResizeHandle
            pane="right"
            label="调整右侧窗格宽度"
            orientation="vertical"
            value={paneSizes.right}
            limits={getPaneSizeLimits("right")}
            onPointerDown={(event) => startPaneResize("right", event)}
            onKeyDown={(event) => resizePaneFromKeyboard("right", event)}
          />
        ) : null}
        {rightOpen ? (
          <aside
            ref={(node) => { rightDockRef.current = node; }}
            className={cn("workspace-ide-shell__right-pane", dropTarget === "right" && "is-drop-target")}
            data-testid="workspace-ide-right-pane"
            data-ide-focus-region="right"
            data-ide-pane="right"
            data-ide-dock-placement="right"
            tabIndex={-1}
            onDragOver={(event) => dragPaneOverDock("right", event)}
            onDragLeave={(event) => leavePaneDock("right", event)}
            onDrop={(event) => dropPaneOnDock("right", event)}
          >
            <div className="workspace-ide-shell__right-tabs">
              {rightPaneIds.map((paneId) => (
                <div
                  key={paneId}
                  className={cn("workspace-ide-shell__dock-tab", activeRightPane === paneId && "is-active")}
                  data-ide-dock-tab={paneId}
                  data-ide-pane-draggable={paneId}
                  draggable
                  onDragStart={(event) => beginPaneDrag(paneId, event)}
                  onDragEnd={clearPaneDragState}
                  onDragOver={(event) => dragPaneOverDock("right", event)}
                  onDrop={(event) => {
                    event.stopPropagation();
                    dropPaneOnDock("right", event, paneId);
                  }}
                >
                  <button type="button" className="workspace-ide-shell__right-tab" onClick={() => selectDockTab("right", paneId)}>
                    {paneLabel(paneId)}
                  </button>
                  <PaneDockControls
                    paneId={paneId}
                    placement="right"
                    compact
                    splitMode={dockSplitModes.right}
                    onMovePane={movePaneToPlacement}
                    onSetDockSplitMode={setDockSplitMode}
                    onSwapDockGroups={swapDockSplitPanes}
                    onFocusOtherGroup={focusOppositeDockGroup}
                    canFocusOtherGroup={canFocusOppositeDockGroup() && activeDockFocus?.placement === "right"}
                    onBeginDrag={beginPaneDrag}
                    onEndDrag={clearPaneDragState}
                    onHidePane={hidePane}
                    onCloseDock={() => setRightOpen(false)}
                  />
                </div>
              ))}
            </div>
            <DockPaneFrame
              placement="right"
              splitMode={dockSplitModes.right}
              splitRatio={dockSplitRatios.right}
              primaryPane={activeRightPane}
              secondaryPane={secondaryRightPane}
              activeFocus={activeDockFocus}
              workspaceDirectory={workspaceDirectory}
              onTerminalCommandsChange={setTerminalCommands}
              onRestore={resetPanePlacements}
              onStartSplitResize={startDockSplitResize}
              onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
              onFocusPane={focusDockPane}
              onDropPaneOnGroup={dropPaneOnDockGroup}
              renderPane={(paneId) => (
                <RightPane
                  panel={paneId}
                  rootId={rootId}
                  activePath={activePath}
                  saveState={saveState}
                  gitDiffTarget={gitDiffTarget}
                  commandCount={commands.length}
                />
              )}
            />
          </aside>
        ) : null}
      </div>

      <footer className="workspace-ide-shell__statusbar">
        <span>{rootId || "workspace"}</span>
        <span>{activePath || "未打开文件"}</span>
        <span>保存: {saveState}</span>
        <span>命令: {commands.length}</span>
        <span>布局: {layoutPreset}</span>
        <span>快照: {layoutSnapshots.length}</span>
        <span>移动面板: {mobilePanel}</span>
        <span>尺寸: {paneSizes.top}/{paneSizes.left}/{paneSizes.right}/{paneSizes.bottom}</span>
        <span>编辑器: {editorSplitMode}/{Math.round(editorSplitRatio)}%</span>
        <span>
          聚焦窗格: {activeDockFocus ? `${placementShortLabel(activeDockFocus.placement)}:${activeDockFocus.role}:${activeDockFocus.paneId}` : "无"}
        </span>
        <span>窗格: T{topPaneIds.length}/L{leftPaneIds.length}/R{rightPaneIds.length}/B{bottomPaneIds.length}</span>
        <span>顺序: {topPaneIds.join("|") || "-"}/{leftPaneIds.join("|") || "-"}/{rightPaneIds.join("|") || "-"}/{bottomPaneIds.join("|") || "-"}</span>
        <span className="ml-auto">桌面 · 平板 · 手机自适应 IDE</span>
      </footer>

      <IdeCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={commands}
      />
    </main>
  );
}

function PaneDockControls({
  paneId,
  placement,
  compact = false,
  splitMode,
  onMovePane,
  onSetDockSplitMode,
  onSwapDockGroups,
  onFocusOtherGroup,
  canFocusOtherGroup = false,
  onHidePane,
  onBeginDrag,
  onEndDrag,
  onCloseDock,
}: {
  paneId: PaneId;
  placement: PanePlacement;
  compact?: boolean;
  splitMode?: DockSplitMode;
  onMovePane: (paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role?: DockPaneRole) => void;
  onSetDockSplitMode?: (placement: PanePlacement, mode: DockSplitMode) => void;
  onSwapDockGroups?: (placement: PanePlacement) => void;
  onFocusOtherGroup?: () => void;
  canFocusOtherGroup?: boolean;
  onHidePane: (paneId: PaneId) => void;
  onBeginDrag: (paneId: PaneId, event: React.DragEvent) => void;
  onEndDrag: () => void;
  onCloseDock: () => void;
}) {
  const canAssignToSplitGroup = splitMode && splitMode !== "single";

  return (
    <div
      className={cn("workspace-ide-shell__pane-dock-controls", compact && "is-compact")}
      data-ide-pane-dock-controls={paneId}
      data-ide-pane-draggable={paneId}
      draggable
      onDragStart={(event) => onBeginDrag(paneId, event)}
      onDragEnd={onEndDrag}
    >
      {DOCK_PLACEMENTS.map((target) => (
        <button
          key={target}
          type="button"
          disabled={target === placement}
          aria-label={`移动 ${paneLabel(paneId)} 到${placementLabel(target)}`}
          onClick={() => onMovePane(paneId, target)}
        >
          {placementShortLabel(target)}
        </button>
      ))}
      <button
        type="button"
        data-ide-pane-assign-primary-group={paneId}
        aria-label={`把 ${paneLabel(paneId)} 放入${placementLabel(placement)} Dock 主窗格组`}
        onClick={() => onMovePane(paneId, placement, undefined, "primary")}
      >
        主组
      </button>
      <button
        type="button"
        data-ide-pane-assign-secondary-group={paneId}
        disabled={!canAssignToSplitGroup}
        aria-label={`把 ${paneLabel(paneId)} 放入${placementLabel(placement)} Dock 副窗格组`}
        onClick={() => onMovePane(paneId, placement, undefined, "secondary")}
      >
        副组
      </button>
      {onSetDockSplitMode ? (
        <>
          <button type="button" data-active={splitMode === "single"} aria-label={`取消${placementLabel(placement)} Dock 拆分`} onClick={() => onSetDockSplitMode(placement, "single")}>单</button>
          <button type="button" data-active={splitMode === "vertical"} aria-label={`${placementLabel(placement)} Dock 左右拆分`} onClick={() => onSetDockSplitMode(placement, "vertical")}>↔</button>
          <button type="button" data-active={splitMode === "horizontal"} aria-label={`${placementLabel(placement)} Dock 上下拆分`} onClick={() => onSetDockSplitMode(placement, "horizontal")}>↕</button>
          {onSwapDockGroups ? (
            <>
              <button
                type="button"
                data-ide-dock-swap-groups={placement}
                disabled={splitMode === "single"}
                aria-label={`交换${placementLabel(placement)} Dock 主副窗格组`}
                onClick={() => onSwapDockGroups(placement)}
              >
                ⇄组
              </button>
              {onFocusOtherGroup ? (
                <button
                  type="button"
                  data-ide-dock-focus-other-group={placement}
                  disabled={!canFocusOtherGroup}
                  aria-label={`切换${placementLabel(placement)} Dock 主副窗格组焦点`}
                  onClick={onFocusOtherGroup}
                >
                  焦组
                </button>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      <button type="button" aria-label={`隐藏 ${paneLabel(paneId)} Pane`} onClick={() => onHidePane(paneId)}>
        隐
      </button>
      <button type="button" aria-label={`关闭${placementLabel(placement)} Dock`} onClick={onCloseDock}>
        ×
      </button>
    </div>
  );
}

function EmptyDockPane({ placement, onRestore }: { placement: PanePlacement; onRestore: () => void }) {
  return (
    <div className="workspace-ide-shell__empty-dock" data-ide-empty-dock={placement}>
      <div className="workspace-ide-shell__empty-dock-mark" aria-hidden={true}>
        {placementShortLabel(placement)}
      </div>
      <h2>{placementLabel(placement)} Dock 为空</h2>
      <p>当前没有窗格停靠在这里。你可以继续保持空 Dock，或一键恢复默认 IDE 窗格组合。</p>
      <Button size="sm" onClick={onRestore}>
        <RotateCcw className="mr-2 h-4 w-4" aria-hidden={true} />
        恢复默认窗格布局
      </Button>
    </div>
  );
}

function EditorGroupFrame({
  group,
  title,
  active,
  filePath,
  splitMode,
  children,
  onFocus,
  onSplitRight,
  onSplitDown,
  onClose,
}: {
  group: EditorGroupId;
  title: string;
  active: boolean;
  filePath?: string;
  splitMode: EditorSplitMode;
  children: React.ReactNode;
  onFocus: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onClose?: () => void;
}) {
  return (
    <section
      className={cn("workspace-ide-shell__editor-group", active && "is-active")}
      data-ide-editor-group={group}
      data-ide-editor-group-active={active}
      onFocusCapture={onFocus}
    >
      <div className="workspace-ide-shell__editor-group-bar">
        <button type="button" className="workspace-ide-shell__editor-group-title" onClick={onFocus}>
          <span>{title}</span>
          <small>{filePath || "未打开文件"}</small>
        </button>
        <button type="button" onClick={onSplitRight} aria-label="向右拆分编辑器">
          右拆
        </button>
        <button type="button" onClick={onSplitDown} aria-label="向下拆分编辑器">
          下拆
        </button>
        {onClose ? (
          <button type="button" onClick={onClose} aria-label="关闭编辑器拆分">
            关闭
          </button>
        ) : (
          <span className="workspace-ide-shell__editor-group-mode">{splitMode === "single" ? "单组" : "已拆分"}</span>
        )}
      </div>
      <div className="workspace-ide-shell__editor-group-stage">{children}</div>
    </section>
  );
}

function EditorSplitHandle({
  mode,
  value,
  onPointerDown,
  onKeyDown,
}: {
  mode: Exclude<EditorSplitMode, "single">;
  value: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={mode === "vertical" ? "调整左右编辑器组比例" : "调整上下编辑器组比例"}
      aria-orientation={mode === "vertical" ? "vertical" : "horizontal"}
      aria-valuemin={EDITOR_SPLIT_RATIO_LIMITS.min}
      aria-valuemax={EDITOR_SPLIT_RATIO_LIMITS.max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="workspace-ide-shell__editor-split-handle"
      data-ide-editor-split-handle={mode}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function ResizeHandle({
  pane,
  label,
  orientation,
  value,
  limits,
  onPointerDown,
  onKeyDown,
}: {
  pane: keyof IdePaneSizes;
  label: string;
  orientation: "horizontal" | "vertical";
  value: number;
  limits: { min: number; max: number };
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={limits.min}
      aria-valuemax={limits.max}
      aria-valuenow={value}
      tabIndex={0}
      className="workspace-ide-shell__resize-handle"
      data-ide-resize-handle={pane}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function PaneHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="workspace-ide-shell__pane-header">
      <strong>{title}</strong>
      <span>{subtitle}</span>
    </div>
  );
}

function LeftPane({
  activity,
  rootId,
  activePath,
  workspaceDirectory,
  revealRequest,
  onOpenFile,
  onOpenDiff,
  onChangeRoot,
  onWorkspaceDirectoryChange,
  onSearchCommandsChange,
  onGitCommandsChange,
  onRevealInExplorer,
  onFocusTerminal,
}: {
  activity: PaneId;
  rootId: string;
  activePath?: string;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  revealRequest: WorkspaceExplorerRevealRequest | null;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onOpenDiff: (target: WorkspaceGitDiffTarget) => void;
  onChangeRoot: (rootId: string) => void;
  onWorkspaceDirectoryChange: (directory: WorkspaceDirectoryContext) => void;
  onSearchCommandsChange: (commands: WorkspaceCommand[]) => void;
  onGitCommandsChange: (commands: WorkspaceCommand[]) => void;
  onRevealInExplorer: (path: string) => void;
  onFocusTerminal: () => void;
}) {
  if (activity === "explorer") {
    return (
      <WorkspaceExplorer
        rootId={rootId}
        selectedPath={activePath}
        onSelectFile={onOpenFile}
        onChangeRoot={onChangeRoot}
        onWorkspaceDirectoryChange={onWorkspaceDirectoryChange}
        revealRequest={revealRequest}
      />
    );
  }
  if (activity === "search") {
    return <WorkspaceSearchPanel rootId={rootId} onOpenFile={onOpenFile} onCommandsChange={onSearchCommandsChange} />;
  }
  if (activity === "git") {
    return (
      <WorkspaceGitPanel
        rootId={rootId}
        onOpenDiff={onOpenDiff}
        onOpenFile={(path) => onOpenFile(path, { rootId })}
        onRevealInExplorer={onRevealInExplorer}
        onCommandsChange={onGitCommandsChange}
      />
    );
  }
  if (activity === "terminal") {
    return (
      <div className="workspace-ide-shell__utility-pane">
        <TerminalSquare className="h-8 w-8 text-cyan-300" aria-hidden={true} />
        <h2>终端停靠在底部</h2>
        <p>{workspaceDirectory?.absolutePath || "选择文件目录后，新终端会继承工作区目录。"}</p>
        <Button size="sm" onClick={onFocusTerminal}>聚焦终端</Button>
      </div>
    );
  }
  if (activity === "ai") {
    return <TreeList title="AI 上下文源" items={[activePath || "当前文件未选择", "搜索结果", "Git diff", "终端可见输出"]} />;
  }
  return <TreeList title="IDE 插件插槽" items={["文件树", "搜索", "Git", "终端", "AI Context", "Provider iframe"]} />;
}

function RightPane({
  panel,
  rootId,
  activePath,
  saveState,
  gitDiffTarget,
  commandCount,
}: {
  panel: PaneId;
  rootId: string;
  activePath?: string;
  saveState: SaveState;
  gitDiffTarget: WorkspaceGitDiffTarget | null;
  commandCount: number;
}) {
  if (panel === "outline") {
    return <TreeList title="符号大纲" items={[activePath ? `${activePath}` : "打开文件后显示符号", "编辑器选择", "搜索命中", "Git diff 上下文"]} />;
  }
  if (panel === "extensions") {
    return <TreeList title="插件组合" items={["OpenVSCode/code-server Provider", "AI context collector", "Git review panel", "Terminal tool bridge"]} />;
  }
  return (
    <TreeList
      title="AI 工作上下文"
      items={[
        `Root: ${rootId || "loading"}`,
        activePath ? `File: ${activePath}` : "File: 未选择",
        gitDiffTarget ? `Diff: ${gitDiffTarget.path}` : "Diff: 无",
        `Save: ${saveState}`,
        `Commands: ${commandCount}`,
      ]}
    />
  );
}


function DockPaneFrame({
  placement,
  splitMode,
  splitRatio,
  primaryPane,
  secondaryPane,
  activeFocus,
  workspaceDirectory,
  onTerminalCommandsChange,
  onRestore,
  onStartSplitResize,
  onResizeSplitFromKeyboard,
  onFocusPane,
  onDropPaneOnGroup,
  renderPane,
}: {
  placement: PanePlacement;
  splitMode: DockSplitMode;
  splitRatio: number;
  primaryPane?: PaneId;
  secondaryPane?: PaneId;
  activeFocus: ActiveDockFocus;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  onTerminalCommandsChange: (commands: WorkspaceCommand[]) => void;
  onRestore: () => void;
  onStartSplitResize: (placement: PanePlacement, mode: DockSplitMode, event: React.PointerEvent) => void;
  onResizeSplitFromKeyboard: (placement: PanePlacement, mode: DockSplitMode, event: React.KeyboardEvent) => void;
  onFocusPane: (placement: PanePlacement, role: DockPaneRole, paneId: PaneId) => void;
  onDropPaneOnGroup: (placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) => void;
  renderPane?: (paneId: PaneId, role: "primary" | "secondary") => React.ReactNode;
}) {
  if (!primaryPane) return <EmptyDockPane placement={placement} onRestore={onRestore} />;
  const shouldSplit = splitMode !== "single" && Boolean(secondaryPane);
  const style = shouldSplit ? ({ "--ide-dock-primary-size": `${splitRatio}%` } as React.CSSProperties) : undefined;
  const render = (paneId: PaneId, role: DockPaneRole) => {
    const isFocused = activeFocus?.placement === placement && activeFocus.role === role && activeFocus.paneId === paneId;
    return (
      <section
        className="workspace-ide-shell__dock-split-pane"
        data-ide-dock-split-pane={role}
        data-ide-dock-split-placement={placement}
        data-ide-dock-split-active={isFocused ? "true" : "false"}
        tabIndex={0}
        aria-label={`${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}窗格：${paneLabel(paneId)}`}
        onPointerDown={() => onFocusPane(placement, role, paneId)}
        onFocus={() => onFocusPane(placement, role, paneId)}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => onDropPaneOnGroup(placement, role, event)}
      >
        <div className="workspace-ide-shell__dock-split-pane-badge" aria-hidden={true}>
          {role === "primary" ? "主" : "副"} · {paneLabel(paneId)}
        </div>
        {renderPane ? (
          renderPane(paneId, role)
        ) : (
          <DockPaneContent panel={paneId} workspaceDirectory={workspaceDirectory} onTerminalCommandsChange={onTerminalCommandsChange} />
        )}
      </section>
    );
  };

  return (
    <div
      className="workspace-ide-shell__dock-split"
      data-ide-dock-split={shouldSplit ? splitMode : "single"}
      data-ide-dock-split-placement={placement}
      style={style}
    >
      {render(primaryPane, "primary")}
      {shouldSplit && secondaryPane ? (
        <>
          <DockSplitHandle
            placement={placement}
            mode={splitMode}
            value={splitRatio}
            onPointerDown={(event) => onStartSplitResize(placement, splitMode, event)}
            onKeyDown={(event) => onResizeSplitFromKeyboard(placement, splitMode, event)}
          />
          {render(secondaryPane, "secondary")}
        </>
      ) : null}
    </div>
  );
}

function DockSplitHandle({
  placement,
  mode,
  value,
  onPointerDown,
  onKeyDown,
}: {
  placement: PanePlacement;
  mode: DockSplitMode;
  value: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
}) {
  return (
    <div
      role="separator"
      aria-label={`调整${placementLabel(placement)} Dock 拆分比例`}
      aria-orientation={mode === "vertical" ? "vertical" : "horizontal"}
      aria-valuemin={SPLIT_RATIO_LIMITS.min}
      aria-valuemax={SPLIT_RATIO_LIMITS.max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="workspace-ide-shell__dock-split-divider"
      data-ide-dock-split-handle={mode}
      data-ide-dock-split-handle-placement={placement}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

function DockPaneContent({
  panel,
  workspaceDirectory,
  onTerminalCommandsChange,
}: {
  panel: PaneId;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  onTerminalCommandsChange: (commands: WorkspaceCommand[]) => void;
}) {
  if (panel === "terminal") {
    return (
      <React.Suspense fallback={<CodePane title="Terminal" lines={["terminal loading..."]} compact />}>
        <LazyWorkspaceTerminal workspaceDirectory={workspaceDirectory ?? undefined} onCommandsChange={onTerminalCommandsChange} />
      </React.Suspense>
    );
  }
  if (panel === "problems") return <CodePane title="Problems" lines={["0 errors", "0 warnings", "真实诊断面板将在 LSP 接入后替换此占位。"]} compact />;
  if (panel === "output") return <CodePane title="Output" lines={["Tracevane IDE shell mounted", "Explorer/Search/Git/Editor/Terminal are live components", "Provider route: /#/workspace?provider=ide"]} compact />;
  return <TreeList title={`${paneLabel(panel)} Dock`} items={["该窗格已移动到当前 Dock", "命令面板可再次移动到顶部、左侧、右侧或底部", "后续插件窗格可复用同一 placement contract"]} />;
}

function TreeList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="workspace-ide-shell__tree">
      <div className="workspace-ide-shell__tree-title">{title}</div>
      {items.map((item) => (
        <button key={item} type="button" className="workspace-ide-shell__tree-item">
          {item}
        </button>
      ))}
    </div>
  );
}

function CodePane({ title, lines, compact = false }: { title: string; lines: string[]; compact?: boolean }) {
  return (
    <div className={cn("workspace-ide-shell__code-pane", compact && "is-compact")}> 
      <div className="workspace-ide-shell__code-title">{title}</div>
      <pre>
        {lines.map((line, index) => `${String(index + 1).padStart(2, "0")}  ${line}`).join("\n")}
      </pre>
    </div>
  );
}

function isPaneId(value: string): value is PaneId {
  return PANE_REGISTRY.some((pane) => pane.id === value);
}

function paneDescriptor(paneId: PaneId): PaneDescriptor {
  return PANE_REGISTRY.find((pane) => pane.id === paneId) ?? PANE_REGISTRY[0];
}

function paneLabel(paneId: PaneId): string {
  return paneDescriptor(paneId).label;
}

function leftPaneSubtitle(activity: PaneId): string {
  if (activity === "explorer") return "真实文件树、目录、上传与文件操作";
  if (activity === "search") return "真实全文搜索与替换";
  if (activity === "git") return "真实 Git 状态、diff 与提交";
  if (activity === "terminal") return "真实 xterm 终端在底部 Dock 运行";
  if (activity === "ai") return "IDE 上下文与证据边界";
  return "后续可替换为插件市场和 provider 管理";
}

function activityByShortcut(key: string): PaneId | null {
  return PANE_REGISTRY.find((pane) => pane.shortcut?.endsWith(key))?.id ?? null;
}


function secondaryDockPane(panes: PaneId[], primaryPane?: PaneId): PaneId | undefined {
  if (!primaryPane) return panes[1];
  return panes.find((paneId) => paneId !== primaryPane);
}

function dockPaneSelection(panes: PaneId[], selectedPane?: PaneId, fallbackPane?: PaneId): PaneId | undefined {
  if (selectedPane && panes.includes(selectedPane)) return selectedPane;
  if (fallbackPane && panes.includes(fallbackPane)) return fallbackPane;
  return panes[0];
}

function dockSelectionState(selections: DockPaneSelections): string {
  return DOCK_PLACEMENTS.map((placement) => {
    const selection = selections[placement];
    return `${placement}:${selection.primary ?? "-"}:${selection.secondary ?? "-"}`;
  }).join("|");
}

function mergeDockPaneSelections(value: Partial<DockPaneSelections> | undefined): DockPaneSelections {
  return {
    top: { ...DEFAULT_DOCK_PANE_SELECTIONS.top, ...value?.top },
    left: { ...DEFAULT_DOCK_PANE_SELECTIONS.left, ...value?.left },
    right: { ...DEFAULT_DOCK_PANE_SELECTIONS.right, ...value?.right },
    bottom: { ...DEFAULT_DOCK_PANE_SELECTIONS.bottom, ...value?.bottom },
  };
}


function groupPanesByPlacement(placements: IdePanePlacements, order: PaneOrder, hiddenPanes: PaneId[] = []): PaneOrder {
  const hiddenPaneSet = new Set(hiddenPanes);
  const groups = PANE_REGISTRY.reduce(
    (nextGroups, pane) => {
      if (hiddenPaneSet.has(pane.id)) return nextGroups;
      nextGroups[placements[pane.id] ?? pane.defaultPlacement].push(pane.id);
      return nextGroups;
    },
    { top: [], left: [], right: [], bottom: [] } as PaneOrder,
  );
  return {
    top: orderPaneGroup(groups.top, order.top),
    left: orderPaneGroup(groups.left, order.left),
    right: orderPaneGroup(groups.right, order.right),
    bottom: orderPaneGroup(groups.bottom, order.bottom),
  };
}

function orderPaneGroup(panes: PaneId[], preferredOrder: PaneId[]): PaneId[] {
  const paneSet = new Set(panes);
  return [
    ...preferredOrder.filter((paneId) => paneSet.has(paneId)),
    ...panes.filter((paneId) => !preferredOrder.includes(paneId)),
  ];
}

function reorderPane(current: PaneOrder, paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId): PaneOrder {
  const next: PaneOrder = {
    top: current.top.filter((id) => id !== paneId),
    left: current.left.filter((id) => id !== paneId),
    right: current.right.filter((id) => id !== paneId),
    bottom: current.bottom.filter((id) => id !== paneId),
  };
  const target = [...next[placement]];
  const targetIndex = beforePaneId ? target.indexOf(beforePaneId) : -1;
  if (targetIndex >= 0 && beforePaneId !== paneId) {
    target.splice(targetIndex, 0, paneId);
  } else {
    target.push(paneId);
  }
  next[placement] = target;
  return next;
}

function placementLabel(placement: PanePlacement): string {
  if (placement === "top") return "顶部";
  if (placement === "left") return "左侧";
  if (placement === "right") return "右侧";
  return "底部";
}

function placementShortLabel(placement: PanePlacement): string {
  if (placement === "top") return "T";
  if (placement === "left") return "L";
  if (placement === "right") return "R";
  return "B";
}

function editorSplitKeyboardDelta(mode: EditorSplitMode, key: string, step: number): number {
  return splitKeyboardDelta(mode, key, step);
}

function splitKeyboardDelta(mode: DockSplitMode | EditorSplitMode, key: string, step: number): number {
  if (mode === "vertical") {
    if (key === "ArrowRight") return step;
    if (key === "ArrowLeft") return -step;
    return 0;
  }
  if (mode === "horizontal") {
    if (key === "ArrowDown") return step;
    if (key === "ArrowUp") return -step;
  }
  return 0;
}

function keyboardResizeDelta(pane: keyof IdePaneSizes, key: string, step: number): number {
  if (pane === "bottom") {
    if (key === "ArrowUp") return step;
    if (key === "ArrowDown") return -step;
    return 0;
  }
  if (pane === "top") {
    if (key === "ArrowDown") return step;
    if (key === "ArrowUp") return -step;
    return 0;
  }
  if (pane === "left") {
    if (key === "ArrowRight") return step;
    if (key === "ArrowLeft") return -step;
    return 0;
  }
  if (key === "ArrowLeft") return step;
  if (key === "ArrowRight") return -step;
  return 0;
}

function getPaneSizeLimits(pane: keyof IdePaneSizes): { min: number; max: number } {
  if ((pane === "bottom" || pane === "top") && typeof window !== "undefined") {
    return {
      min: PANE_SIZE_LIMITS[pane].min,
      max: Math.min(PANE_SIZE_LIMITS[pane].max, Math.round(window.innerHeight * 0.5)),
    };
  }
  return PANE_SIZE_LIMITS[pane];
}

function loadIdeLayoutState(): IdeLayoutState {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IDE_LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const value = JSON.parse(raw) as IdeLayoutState;
    return sanitizeIdeLayoutState(value);
  } catch {
    return {};
  }
}

function loadIdeLayoutSnapshots(): IdeLayoutSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IDE_LAYOUT_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as IdeLayoutSnapshot[];
    return sanitizeIdeLayoutSnapshots(value);
  } catch {
    return [];
  }
}

function storeIdeLayoutSnapshots(snapshots: IdeLayoutSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_LAYOUT_SNAPSHOTS_STORAGE_KEY, JSON.stringify(sanitizeIdeLayoutSnapshots(snapshots)));
  } catch {
    // Layout snapshots are local preferences; storage denial must not break the IDE shell.
  }
}

function storeIdeLayoutState(state: Required<IdeLayoutState>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_LAYOUT_STORAGE_KEY, JSON.stringify(sanitizeIdeLayoutState(state)));
  } catch {
    // Layout persistence is best-effort; private mode/storage denial must not break the IDE shell.
  }
}

function sanitizeIdeLayoutSnapshots(value: unknown): IdeLayoutSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((snapshot): snapshot is IdeLayoutSnapshot => Boolean(snapshot) && typeof snapshot === "object")
    .map((snapshot) => ({
      id: typeof snapshot.id === "string" ? snapshot.id : `layout-${Date.now()}`,
      name: typeof snapshot.name === "string" ? snapshot.name.slice(0, 48) : "工作台布局",
      createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : new Date().toISOString(),
      state: sanitizeIdeLayoutState(snapshot.state ?? {}),
    }))
    .slice(0, MAX_LAYOUT_SNAPSHOTS);
}

function sanitizeIdeLayoutState(value: IdeLayoutState): IdeLayoutState {
  return {
    topOpen: typeof value.topOpen === "boolean" ? value.topOpen : undefined,
    leftOpen: typeof value.leftOpen === "boolean" ? value.leftOpen : undefined,
    rightOpen: typeof value.rightOpen === "boolean" ? value.rightOpen : undefined,
    bottomOpen: typeof value.bottomOpen === "boolean" ? value.bottomOpen : undefined,
    maximizedPane: isMaximizedPane(value.maximizedPane) ? value.maximizedPane : undefined,
    layoutPreset: isLayoutPreset(value.layoutPreset) ? value.layoutPreset : undefined,
    paneSizes: sanitizePaneSizes(value.paneSizes),
    editorSplitMode: isEditorSplitMode(value.editorSplitMode) ? value.editorSplitMode : undefined,
    editorSplitRatio: sanitizeEditorSplitRatio(value.editorSplitRatio),
    panePlacements: sanitizePanePlacements(value.panePlacements),
    paneOrder: sanitizePaneOrder(value.paneOrder),
    dockSplitModes: sanitizeDockSplitModes(value.dockSplitModes),
    dockSplitRatios: sanitizeDockSplitRatios(value.dockSplitRatios),
    dockPaneSelections: sanitizeDockPaneSelections(value.dockPaneSelections),
    hiddenPanes: sanitizeHiddenPanes(value.hiddenPanes),
  };
}


function sanitizeHiddenPanes(value: PaneId[] | undefined): PaneId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((paneId, index, hidden) => isPaneId(paneId) && hidden.indexOf(paneId) === index);
}

function sanitizeDockPaneSelections(value: Partial<DockPaneSelections> | undefined): Partial<DockPaneSelections> | undefined {
  if (!value) return undefined;
  const selections: Partial<DockPaneSelections> = {};
  for (const placement of DOCK_PLACEMENTS) {
    const selection = value[placement];
    if (!selection) continue;
    const nextSelection: Partial<Record<DockPaneRole, PaneId>> = {};
    if (isPaneId(selection.primary ?? "")) nextSelection.primary = selection.primary;
    if (isPaneId(selection.secondary ?? "")) nextSelection.secondary = selection.secondary;
    selections[placement] = nextSelection;
  }
  return selections;
}

function sanitizeDockSplitModes(value: Partial<DockSplitModes> | undefined): Partial<DockSplitModes> | undefined {
  if (!value) return undefined;
  const modes: Partial<DockSplitModes> = {};
  for (const placement of DOCK_PLACEMENTS) {
    if (isDockSplitMode(value[placement])) modes[placement] = value[placement];
  }
  return modes;
}

function isDockSplitMode(value: unknown): value is DockSplitMode {
  return value === "single" || value === "vertical" || value === "horizontal";
}

function sanitizeDockSplitRatios(value: Partial<DockSplitRatios> | undefined): Partial<DockSplitRatios> | undefined {
  if (!value) return undefined;
  const ratios: Partial<DockSplitRatios> = {};
  for (const placement of DOCK_PLACEMENTS) {
    const ratio = value[placement];
    if (typeof ratio === "number" && !Number.isNaN(ratio)) {
      ratios[placement] = clamp(ratio, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max);
    }
  }
  return ratios;
}

function sanitizePaneOrder(value: Partial<PaneOrder> | undefined): Partial<PaneOrder> | undefined {
  if (!value) return undefined;
  return {
    top: sanitizePaneOrderGroup(value.top),
    left: sanitizePaneOrderGroup(value.left),
    right: sanitizePaneOrderGroup(value.right),
    bottom: sanitizePaneOrderGroup(value.bottom),
  };
}


function sanitizePaneOrderGroup(value: PaneId[] | undefined): PaneId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((paneId, index, order) => isPaneId(paneId) && order.indexOf(paneId) === index);
}

function sanitizePanePlacements(value: Partial<IdePanePlacements> | undefined): Partial<IdePanePlacements> | undefined {
  if (!value) return undefined;
  const placements: Partial<IdePanePlacements> = {};
  for (const pane of PANE_REGISTRY) {
    if (isPanePlacement(value[pane.id])) placements[pane.id] = value[pane.id];
  }
  return placements;
}

function sanitizePaneSizes(value: Partial<IdePaneSizes> | undefined): Partial<IdePaneSizes> | undefined {
  if (!value) return undefined;
  const sizes: Partial<IdePaneSizes> = {};
  const top = sanitizePaneSize("top", value.top);
  const left = sanitizePaneSize("left", value.left);
  const right = sanitizePaneSize("right", value.right);
  const bottom = sanitizePaneSize("bottom", value.bottom);
  if (top !== undefined) sizes.top = top;
  if (left !== undefined) sizes.left = left;
  if (right !== undefined) sizes.right = right;
  if (bottom !== undefined) sizes.bottom = bottom;
  return sizes;
}

function sanitizePaneSize(pane: keyof IdePaneSizes, value: number | undefined): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  const { min, max } = PANE_SIZE_LIMITS[pane];
  return clamp(value, min, max);
}

function isPanePlacement(value: unknown): value is PanePlacement {
  return value === "top" || value === "left" || value === "right" || value === "bottom";
}

function sanitizeEditorSplitRatio(value: number | undefined): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return clamp(value, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max);
}

function isEditorSplitMode(value: unknown): value is EditorSplitMode {
  return value === "single" || value === "vertical" || value === "horizontal";
}

function isLayoutPreset(value: unknown): value is LayoutPreset {
  return value === "balanced" || value === "code" || value === "terminal";
}

function isMaximizedPane(value: unknown): value is MaximizedPane {
  return value === null || value === "top" || value === "left" || value === "center" || value === "right" || value === "bottom";
}

function formatSnapshotTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
