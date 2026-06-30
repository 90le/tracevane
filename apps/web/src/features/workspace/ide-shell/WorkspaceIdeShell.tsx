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
  Plus,
  RotateCcw,
  RotateCw,
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
type WorkbenchRecipeId = "classic" | "ai-pair" | "terminal-debug" | "review";
type EditorGroupId = "primary" | "secondary";
type EditorSplitMode = "single" | "vertical" | "horizontal";
interface EditorTab {
  path: string;
  rootId: string;
}
type EditorGroupTabs = Record<EditorGroupId, EditorTab[]>;
type DockSplitMode = "single" | "vertical" | "horizontal";
type DockSizePreset = "compact" | "balanced" | "expanded";
type DockSplitModes = Record<PanePlacement, DockSplitMode>;
type DockSplitRatios = Record<PanePlacement, number>;
type DockPaneRole = "primary" | "secondary";
type DockDropEdge = "top" | "right" | "bottom" | "left";
type DockEdgeDropTarget = { placement: PanePlacement; edge: DockDropEdge } | null;
type ActiveDockFocus = { placement: PanePlacement; role: DockPaneRole; paneId: PaneId } | null;
type DockPaneSelections = Record<PanePlacement, Partial<Record<DockPaneRole, PaneId>>>;
type MobilePanel = "editor" | "top" | "left" | "right" | "bottom";
type MobilePanelDirection = "next" | "previous";
type IdeFocusRegion = "top" | "left" | "center" | "right" | "bottom";

const DOCK_PLACEMENTS = ["top", "left", "right", "bottom"] as const satisfies readonly PanePlacement[];
const MOBILE_PANEL_ORDER = ["editor", "top", "left", "right", "bottom"] as const satisfies readonly MobilePanel[];

interface IdePaneSizes {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

interface WorkbenchLayoutRecipe {
  id: WorkbenchRecipeId;
  label: string;
  description: string;
  shortcut?: string;
  layoutPreset: LayoutPreset;
  paneSizes: IdePaneSizes;
  open: Record<PanePlacement, boolean>;
  panePlacements: IdePanePlacements;
  paneOrder: PaneOrder;
  dockSplitModes: DockSplitModes;
  dockPaneSelections: DockPaneSelections;
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
const IDE_DOCK_SNAPSHOTS_STORAGE_KEY = "tracevane.workspace.ide-shell.dock-snapshots.v1";
const IDE_EDITOR_GROUP_SNAPSHOTS_STORAGE_KEY = "tracevane.workspace.ide-shell.editor-group-snapshots.v1";
const MAX_LAYOUT_SNAPSHOTS = 8;
const MAX_DOCK_SNAPSHOTS = 16;
const MAX_EDITOR_GROUP_SNAPSHOTS = 12;
const MAX_LAYOUT_HISTORY = 32;

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
const DOCK_SIZE_PRESETS = ["compact", "balanced", "expanded"] as const satisfies readonly DockSizePreset[];
const DEFAULT_DOCK_SPLIT_MODES: DockSplitModes = { top: "single", left: "single", right: "single", bottom: "single" };
const DEFAULT_DOCK_SPLIT_RATIOS: DockSplitRatios = { top: 50, left: 50, right: 50, bottom: 50 };
const DEFAULT_DOCK_PANE_SELECTIONS: DockPaneSelections = { top: {}, left: {}, right: {}, bottom: {} };
const CLASSIC_IDE_PANE_PLACEMENTS: IdePanePlacements = { ...DEFAULT_PANE_PLACEMENTS };
const CLASSIC_IDE_PANE_ORDER: PaneOrder = { ...DEFAULT_PANE_ORDER };
const AI_PAIR_PANE_PLACEMENTS: IdePanePlacements = {
  explorer: "left",
  search: "left",
  git: "left",
  terminal: "bottom",
  problems: "bottom",
  output: "bottom",
  ai: "right",
  outline: "right",
  extensions: "right",
};
const AI_PAIR_PANE_ORDER: PaneOrder = {
  top: [],
  left: ["explorer", "search", "git"],
  right: ["ai", "outline", "extensions"],
  bottom: ["terminal", "problems", "output"],
};
const TERMINAL_DEBUG_PANE_PLACEMENTS: IdePanePlacements = {
  explorer: "left",
  search: "left",
  git: "left",
  terminal: "bottom",
  problems: "bottom",
  output: "bottom",
  ai: "right",
  outline: "right",
  extensions: "right",
};
const TERMINAL_DEBUG_PANE_ORDER: PaneOrder = {
  top: [],
  left: ["explorer", "git", "search"],
  right: ["ai", "outline", "extensions"],
  bottom: ["terminal", "problems", "output"],
};
const REVIEW_PANE_PLACEMENTS: IdePanePlacements = {
  explorer: "left",
  search: "top",
  git: "left",
  terminal: "bottom",
  problems: "bottom",
  output: "bottom",
  ai: "right",
  outline: "right",
  extensions: "right",
};
const REVIEW_PANE_ORDER: PaneOrder = {
  top: ["search"],
  left: ["git", "explorer"],
  right: ["ai", "outline", "extensions"],
  bottom: ["problems", "output", "terminal"],
};
const WORKBENCH_LAYOUT_RECIPES: WorkbenchLayoutRecipe[] = [
  {
    id: "classic",
    label: "经典 IDE",
    description: "文件树在左、AI/大纲在右、终端在底部，适合作为默认完整 Workbench。",
    shortcut: "⌘⌥⇧1",
    layoutPreset: "balanced",
    paneSizes: DEFAULT_PANE_SIZES,
    open: { top: false, left: true, right: true, bottom: true },
    panePlacements: CLASSIC_IDE_PANE_PLACEMENTS,
    paneOrder: CLASSIC_IDE_PANE_ORDER,
    dockSplitModes: DEFAULT_DOCK_SPLIT_MODES,
    dockPaneSelections: {
      top: {},
      left: { primary: "explorer", secondary: "search" },
      right: { primary: "ai", secondary: "outline" },
      bottom: { primary: "terminal", secondary: "problems" },
    },
  },
  {
    id: "ai-pair",
    label: "AI Pair",
    description: "右侧拆成 AI 与大纲双组，底部保留终端，适合 AI 编程与上下文审阅。",
    shortcut: "⌘⌥⇧2",
    layoutPreset: "balanced",
    paneSizes: { top: 150, left: 300, right: 420, bottom: 240 },
    open: { top: false, left: true, right: true, bottom: true },
    panePlacements: AI_PAIR_PANE_PLACEMENTS,
    paneOrder: AI_PAIR_PANE_ORDER,
    dockSplitModes: { top: "single", left: "single", right: "vertical", bottom: "single" },
    dockPaneSelections: {
      top: {},
      left: { primary: "explorer", secondary: "search" },
      right: { primary: "ai", secondary: "outline" },
      bottom: { primary: "terminal", secondary: "problems" },
    },
  },
  {
    id: "terminal-debug",
    label: "终端调试",
    description: "底部上下/左右组合终端与问题面板，右侧可收起，适合运行、测试和修复。",
    shortcut: "⌘⌥⇧3",
    layoutPreset: "terminal",
    paneSizes: TERMINAL_PANE_SIZES,
    open: { top: false, left: true, right: false, bottom: true },
    panePlacements: TERMINAL_DEBUG_PANE_PLACEMENTS,
    paneOrder: TERMINAL_DEBUG_PANE_ORDER,
    dockSplitModes: { top: "single", left: "single", right: "single", bottom: "horizontal" },
    dockPaneSelections: {
      top: {},
      left: { primary: "explorer", secondary: "git" },
      right: { primary: "ai", secondary: "outline" },
      bottom: { primary: "terminal", secondary: "problems" },
    },
  },
  {
    id: "review",
    label: "审阅/搜索",
    description: "顶部放搜索，左侧 Git，底部问题/输出，适合代码审阅、全局搜索与变更检查。",
    shortcut: "⌘⌥⇧4",
    layoutPreset: "code",
    paneSizes: { top: 190, left: 310, right: 360, bottom: 220 },
    open: { top: true, left: true, right: true, bottom: true },
    panePlacements: REVIEW_PANE_PLACEMENTS,
    paneOrder: REVIEW_PANE_ORDER,
    dockSplitModes: { top: "single", left: "single", right: "vertical", bottom: "vertical" },
    dockPaneSelections: {
      top: { primary: "search" },
      left: { primary: "git", secondary: "explorer" },
      right: { primary: "ai", secondary: "outline" },
      bottom: { primary: "problems", secondary: "output" },
    },
  },
];
const DEFAULT_EDITOR_SPLIT_RATIO = 50;
const SPLIT_RATIO_PRESETS = [33, 50, 67] as const;
type SplitRatioPreset = (typeof SPLIT_RATIO_PRESETS)[number];
const SPLIT_RATIO_LIMITS = { min: 25, max: 75 };
const EDITOR_SPLIT_RATIO_LIMITS = SPLIT_RATIO_LIMITS;

interface IdeLayoutState {
  activeEditorGroup?: EditorGroupId;
  activePath?: string;
  activePathRootId?: string;
  secondaryPath?: string;
  secondaryPathRootId?: string;
  editorGroupTabs?: EditorGroupTabs;
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
  pinnedPanes?: PaneId[];
  layoutLocked?: boolean;
}

interface IdeLayoutSnapshot {
  id: string;
  name: string;
  createdAt: string;
  state: IdeLayoutState;
}

interface IdeDockSnapshot {
  id: string;
  name: string;
  createdAt: string;
  placement: PanePlacement;
  paneIds: PaneId[];
  hiddenPaneIds: PaneId[];
  pinnedPaneIds: PaneId[];
  splitMode: DockSplitMode;
  splitRatio: number;
  paneSelection: Partial<Record<DockPaneRole, PaneId>>;
  open: boolean;
  size: number;
}

interface IdeEditorGroupSnapshot {
  id: string;
  name: string;
  createdAt: string;
  activeEditorGroup: EditorGroupId;
  activePath?: string;
  activePathRootId?: string;
  secondaryPath?: string;
  secondaryPathRootId?: string;
  editorGroupTabs: EditorGroupTabs;
  editorSplitMode: EditorSplitMode;
  editorSplitRatio: number;
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
  const [dockSnapshots, setDockSnapshots] = React.useState<IdeDockSnapshot[]>(() => loadIdeDockSnapshots());
  const [editorGroupSnapshots, setEditorGroupSnapshots] = React.useState<IdeEditorGroupSnapshot[]>(() => loadIdeEditorGroupSnapshots());
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
  const [pinnedPanes, setPinnedPanes] = React.useState<PaneId[]>(layoutState.pinnedPanes ?? []);
  const [activeEditorGroup, setActiveEditorGroup] = React.useState<EditorGroupId>(layoutState.activeEditorGroup ?? "primary");
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState<MobilePanel>("editor");
  const [layoutLocked, setLayoutLocked] = React.useState(layoutState.layoutLocked ?? false);
  const [layoutHistoryPast, setLayoutHistoryPast] = React.useState<IdeLayoutState[]>([]);
  const [layoutHistoryFuture, setLayoutHistoryFuture] = React.useState<IdeLayoutState[]>([]);
  const [rootId, setRootId] = React.useState(defaultRootId);
  const [activePath, setActivePath] = React.useState<string | undefined>(layoutState.activePath);
  const [activePathRootId, setActivePathRootId] = React.useState(layoutState.activePathRootId ?? "");
  const [secondaryPath, setSecondaryPath] = React.useState<string | undefined>(layoutState.secondaryPath);
  const [secondaryPathRootId, setSecondaryPathRootId] = React.useState(layoutState.secondaryPathRootId ?? "");
  const [editorGroupTabs, setEditorGroupTabs] = React.useState<EditorGroupTabs>(() => sanitizeEditorGroupTabs(layoutState.editorGroupTabs));
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
  const [edgeDropTarget, setEdgeDropTarget] = React.useState<DockEdgeDropTarget>(null);
  const [activeDockFocus, setActiveDockFocus] = React.useState<ActiveDockFocus>(null);
  const searchSignalRef = React.useRef(0);
  const topDockRef = React.useRef<HTMLElement | null>(null);
  const leftDockRef = React.useRef<HTMLElement | null>(null);
  const centerPaneRef = React.useRef<HTMLElement | null>(null);
  const rightDockRef = React.useRef<HTMLElement | null>(null);
  const bottomDockRef = React.useRef<HTMLElement | null>(null);
  const lastLayoutHistoryStateRef = React.useRef<IdeLayoutState | null>(null);
  const lastLayoutHistoryKeyRef = React.useRef("");
  const applyingLayoutHistoryRef = React.useRef(false);

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
    const nextLayoutState = currentIdeLayoutState();
    storeIdeLayoutState(nextLayoutState);

    const nextHistoryKey = serializeIdeLayoutHistoryState(nextLayoutState);
    if (!lastLayoutHistoryStateRef.current || !lastLayoutHistoryKeyRef.current) {
      lastLayoutHistoryStateRef.current = nextLayoutState;
      lastLayoutHistoryKeyRef.current = nextHistoryKey;
      return;
    }
    if (lastLayoutHistoryKeyRef.current === nextHistoryKey) return;

    if (applyingLayoutHistoryRef.current) {
      applyingLayoutHistoryRef.current = false;
      lastLayoutHistoryStateRef.current = nextLayoutState;
      lastLayoutHistoryKeyRef.current = nextHistoryKey;
      return;
    }

    const previousLayoutState = lastLayoutHistoryStateRef.current;
    setLayoutHistoryPast((history) => [...history, previousLayoutState].slice(-MAX_LAYOUT_HISTORY));
    setLayoutHistoryFuture([]);
    lastLayoutHistoryStateRef.current = nextLayoutState;
    lastLayoutHistoryKeyRef.current = nextHistoryKey;
  }, [activeEditorGroup, activePath, activePathRootId, bottomOpen, dockPaneSelections, dockSplitModes, dockSplitRatios, editorGroupTabs, editorSplitMode, editorSplitRatio, hiddenPanes, pinnedPanes, layoutLocked, layoutPreset, leftOpen, maximizedPane, paneOrder, panePlacements, paneSizes, rightOpen, secondaryPath, secondaryPathRootId, topOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === "Escape") {
        if (draggingPane || dropTarget || edgeDropTarget) {
          event.preventDefault();
          clearPaneDragState();
          return;
        }
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
        if (event.shiftKey && key === "l") {
          event.preventDefault();
          setLayoutLocked((locked) => !locked);
          return;
        }
        if (key === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redoIdeLayoutChange();
          } else {
            undoIdeLayoutChange();
          }
          return;
        }
        if (!event.shiftKey && key === "p") {
          event.preventDefault();
          toggleActiveDockPanePinned();
          return;
        }
        if (!event.shiftKey && event.key === "PageDown") {
          event.preventDefault();
          selectAdjacentWorkbenchPane("next");
          return;
        }
        if (!event.shiftKey && event.key === "PageUp") {
          event.preventDefault();
          selectAdjacentWorkbenchPane("previous");
          return;
        }
        if (event.key === "\\") {
          event.preventDefault();
          if (activeDockFocus) {
            openDockPlacement(activeDockFocus.placement);
            setDockSplitMode(activeDockFocus.placement, event.shiftKey ? "horizontal" : "vertical");
          }
          return;
        }
        if (!event.shiftKey && event.key === "0") {
          event.preventDefault();
          if (activeDockFocus) mergeDockSplitGroups(activeDockFocus.placement, activeDockFocus.role);
          return;
        }
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
        if (!event.shiftKey && key === "m") {
          event.preventDefault();
          if (activeDockFocus) {
            openDockPlacement(activeDockFocus.placement);
            toggleMaximizedPane(activeDockFocus.placement);
          }
          return;
        }
        if (!event.shiftKey && key === "h") {
          event.preventDefault();
          if (activeDockFocus) closeDockPlacement(activeDockFocus.placement);
          return;
        }
        if (event.shiftKey && key === "r") {
          event.preventDefault();
          if (activeDockFocus) resetDockComposition(activeDockFocus.placement);
          return;
        }
        if (event.shiftKey && event.key === "0") {
          event.preventDefault();
          if (activeDockFocus) resetDockSize(activeDockFocus.placement);
          return;
        }
        if (event.shiftKey && key === "a") {
          event.preventDefault();
          openAllDocks();
          return;
        }
        if (event.shiftKey && key === "e") {
          event.preventDefault();
          focusEditorOnlyLayout();
          return;
        }
        if (event.shiftKey && key === "m") {
          event.preventDefault();
          closeAllDockSplits();
          return;
        }
        if (event.shiftKey && event.key === "5") {
          event.preventDefault();
          resetAllDockSplitRatios();
          return;
        }
        if (event.shiftKey && ["1", "2", "3", "4"].includes(key)) {
          event.preventDefault();
          const recipe = WORKBENCH_LAYOUT_RECIPES.find((item) => item.shortcut?.endsWith(key));
          if (recipe) applyWorkbenchRecipe(recipe.id);
          return;
        }
        if (event.shiftKey && event.key === "PageDown") {
          event.preventDefault();
          cycleMobilePanel("next");
          return;
        }
        if (event.shiftKey && event.key === "PageUp") {
          event.preventDefault();
          cycleMobilePanel("previous");
          return;
        }
        if (event.shiftKey && event.key === "]") {
          event.preventDefault();
          moveActiveEditorFileToOtherGroup();
          focusIdeRegion("center");
          return;
        }
        if (event.key === "PageDown") {
          event.preventDefault();
          if (event.shiftKey) {
            selectAdjacentDockPane("next");
          } else {
            selectAdjacentEditorTab("next");
          }
          return;
        }
        if (event.key === "PageUp") {
          event.preventDefault();
          if (event.shiftKey) {
            selectAdjacentDockPane("previous");
          } else {
            selectAdjacentEditorTab("previous");
          }
          return;
        }
        if (!event.shiftKey && event.key === "[") {
          event.preventDefault();
          focusEditorGroup("primary");
          focusIdeRegion("center");
          return;
        }
        if (!event.shiftKey && event.key === "]") {
          event.preventDefault();
          if (editorSplitMode === "single") splitEditor("vertical");
          focusEditorGroup("secondary");
          focusIdeRegion("center");
          return;
        }
        if (!event.shiftKey && key === "s") {
          event.preventDefault();
          swapEditorGroups();
          return;
        }
        if (event.shiftKey && event.key === ",") {
          event.preventDefault();
          reorderActiveDockPane("previous");
          return;
        }
        if (event.shiftKey && event.key === ".") {
          event.preventDefault();
          reorderActiveDockPane("next");
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
        if (activeDockFocus) {
          hideActiveDockPane();
        } else {
          closeActiveEditorTab();
        }
        return;
      }
      if (!event.shiftKey && key === "b") {
        event.preventDefault();
        if (!layoutLocked) setLeftOpen((open) => !open);
        return;
      }
      if (!event.shiftKey && key === "j") {
        event.preventDefault();
        if (!layoutLocked) {
          setBottomOpen((open) => !open);
          if (!bottomOpen) setMobilePanel("bottom");
        }
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
        rememberEditorTab("secondary", path, targetRootId);
      } else {
        setActivePath(path);
        setActivePathRootId(targetRootId);
        rememberEditorTab("primary", path, targetRootId);
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
    const nextRootId = tabRootId || activePathRootId || rootId;
    setActivePath((current) => (current === path ? current : path));
    if (tabRootId) {
      setActivePathRootId((current) => (current === tabRootId ? current : tabRootId));
    }
    rememberEditorTab("primary", path, nextRootId);
  }, [activePathRootId, rootId]);

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
        disabled: layoutLocked,
        run: () => {
          if (!layoutLocked) setTopOpen((open) => !open);
        },
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
        disabled: layoutLocked,
        run: () => {
          if (!layoutLocked) setLeftOpen((open) => !open);
        },
      },
      {
        id: "ide.layout.toggle-right",
        group: "布局",
        label: rightOpen ? "收起右侧插件窗格" : "打开右侧插件窗格",
        description: "切换 AI/Outline/扩展右侧组合窗格",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        disabled: layoutLocked,
        run: () => {
          if (!layoutLocked) setRightOpen((open) => !open);
        },
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
        disabled: layoutLocked,
        run: () => {
          if (!layoutLocked) {
            setBottomOpen((open) => !open);
            if (!bottomOpen) setMobilePanel("bottom");
          }
        },
      },
      {
        id: "ide.layout.maximize-center",
        group: "布局",
        label: maximizedPane === "center" ? "恢复组合布局" : "最大化编辑器",
        description: "在全局窗格组合和编辑器聚焦模式之间切换",
        risk: "safe",
        surface: "layout",
        icon: <Maximize2 />,
        disabled: layoutLocked,
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
        disabled: layoutLocked,
        run: () => {
          if (layoutLocked) return;
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
        disabled: layoutLocked,
        run: () => {
          if (layoutLocked) return;
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
        disabled: layoutLocked,
        run: () => {
          if (layoutLocked) return;
          setBottomOpen(true);
          toggleMaximizedPane("bottom");
        },
      },
      {
        id: "ide.layout.open-all-docks",
        group: "布局",
        label: "打开全部核心 Dock",
        description: "同时打开顶部、左侧、右侧和底部 Dock，恢复完整 IDE Workbench 框架",
        shortcut: "⌘⌥⇧A",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        run: openAllDocks,
      },
      {
        id: "ide.layout.focus-editor-only",
        group: "布局",
        label: "编辑器专注：收起全部 Dock",
        description: "收起顶部、左侧、右侧和底部辅助 Dock，只保留编辑器工作区；窗格组合状态仍会保留",
        shortcut: "⌘⌥⇧E",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: focusEditorOnlyLayout,
      },
      ...WORKBENCH_LAYOUT_RECIPES.map((recipe) => ({
        id: `ide.workbench.recipe.${recipe.id}`,
        group: "布局" as const,
        label: `工作台组合：${recipe.label}`,
        description: recipe.description,
        shortcut: recipe.shortcut,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        run: () => applyWorkbenchRecipe(recipe.id),
      })),
      {
        id: "ide.layout.history.undo",
        group: "布局",
        label: "撤销上一次 IDE 布局变更",
        description: "恢复到上一个窗格开合、尺寸、拆分、停靠、顺序和编辑器分组状态",
        shortcut: "⌘⌥Z",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        disabled: layoutHistoryPast.length === 0,
        run: undoIdeLayoutChange,
      },
      {
        id: "ide.layout.history.redo",
        group: "布局",
        label: "重做 IDE 布局变更",
        description: "重新应用刚刚撤销的窗格布局状态",
        shortcut: "⌘⌥⇧Z",
        risk: "safe",
        surface: "layout",
        icon: <RotateCw />,
        disabled: layoutHistoryFuture.length === 0,
        run: redoIdeLayoutChange,
      },
      {
        id: "ide.layout.toggle-lock",
        group: "布局",
        label: layoutLocked ? "解锁 IDE 布局" : "锁定 IDE 布局",
        description: layoutLocked ? "允许拖拽、拆分、移动、隐藏和 resize 等布局修改" : "保护当前窗格组合，阻止误拖、误拆分、误隐藏和误 resize",
        shortcut: "⌘⌥⇧L",
        risk: "safe",
        surface: "layout",
        icon: <Settings2 />,
        run: () => setLayoutLocked((locked) => !locked),
      },
      {
        id: "ide.dock.close-all-splits",
        group: "窗格",
        label: "合并全部 Dock 拆分",
        description: "把顶部、左侧、右侧和底部 Dock 都恢复为单窗格组，但保留每个 Dock 的当前主 Pane 和标签顺序",
        shortcut: "⌘⌥⇧M",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: closeAllDockSplits,
      },
      {
        id: "ide.dock.reset-all-split-ratios",
        group: "窗格",
        label: "重置全部 Dock 拆分比例",
        description: "把所有 Dock 的主副组比例恢复为 50/50，不改变拆分方向、Pane 组合或可见性",
        shortcut: "⌘⌥⇧5",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: resetAllDockSplitRatios,
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
        description: "恢复单编辑器组，并把主/副编辑器组标签合并到主组",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: closeEditorSplit,
      },
      {
        id: "ide.editor.merge-split-to-secondary",
        group: "布局",
        label: "合并编辑器到副组",
        description: "恢复单编辑器组，并优先保留副编辑器组的活动文件和标签顺序",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        disabled: editorSplitMode === "single",
        run: () => mergeEditorSplitToGroup("secondary"),
      },
      {
        id: "ide.editor.swap-groups",
        group: "布局",
        label: "交换主副编辑器组",
        description: "交换主编辑器和副编辑器组中打开的文件，保留当前拆分方向和比例",
        shortcut: "⌘⌥S",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        disabled: editorSplitMode === "single",
        run: swapEditorGroups,
      },
      {
        id: "ide.editor.close-active-tab",
        group: "编辑器",
        label: "关闭当前编辑器标签",
        description: "关闭当前聚焦编辑器组里的活动文件标签，并切回同组最近标签",
        shortcut: "⌘W",
        risk: "safe",
        surface: "tab-lifecycle",
        icon: <Trash2 />,
        disabled: !activeEditorTab(),
        run: closeActiveEditorTab,
      },
      {
        id: "ide.editor.next-tab",
        group: "编辑器",
        label: "切到下一个编辑器标签",
        description: "在当前编辑器组内循环切到下一个已打开文件标签",
        shortcut: "⌘⌥PageDown",
        risk: "safe",
        surface: "tab-lifecycle",
        icon: <PanelRight />,
        disabled: !canNavigateEditorTabs(),
        run: () => selectAdjacentEditorTab("next"),
      },
      {
        id: "ide.editor.previous-tab",
        group: "编辑器",
        label: "切到上一个编辑器标签",
        description: "在当前编辑器组内循环切到上一个已打开文件标签",
        shortcut: "⌘⌥PageUp",
        risk: "safe",
        surface: "tab-lifecycle",
        icon: <PanelLeft />,
        disabled: !canNavigateEditorTabs(),
        run: () => selectAdjacentEditorTab("previous"),
      },
      {
        id: "ide.editor.move-active-other-group",
        group: "布局",
        label: "移动当前文件到另一编辑器组",
        description: "把当前编辑器组打开的文件移到另一组；未拆分时先创建副编辑器组",
        shortcut: "⌘⌥⇧]",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        disabled: !activeEditorTab(),
        run: moveActiveEditorFileToOtherGroup,
      },
      ...SPLIT_RATIO_PRESETS.map((ratio) => ({
        id: `ide.editor.split-ratio.${ratio}`,
        group: "布局" as const,
        label: `编辑器拆分比例：${ratio}/${100 - ratio}`,
        description: `把主编辑器组设置为 ${ratio}%，副编辑器组设置为 ${100 - ratio}%；未拆分时先向右拆分`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        run: () => setEditorSplitRatioPreset(ratio),
      })),
      {
        id: "ide.editor.focus-primary",
        group: "布局",
        label: "聚焦主编辑器组",
        description: "后续打开文件进入主编辑器组",
        shortcut: "⌘⌥[",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => focusEditorGroup("primary"),
      },
      {
        id: "ide.editor.focus-secondary",
        group: "布局",
        label: "聚焦副编辑器组",
        description: "后续打开文件进入副编辑器组；未拆分时先向右拆分",
        shortcut: "⌘⌥]",
        risk: "safe",
        surface: "layout",
        icon: <Code2 />,
        run: () => {
          if (editorSplitMode === "single") splitEditor("vertical");
          focusEditorGroup("secondary");
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
    [bottomOpen, dockSplitModes, dockSplitRatios, editorSplitMode, layoutHistoryFuture.length, layoutHistoryPast.length, layoutLocked, leftOpen, maximizedPane, rightOpen, topOpen],
  );

  const paneVisibilityCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.pane.hide-active",
        group: "窗格" as const,
        label: "隐藏当前聚焦 Pane",
        description: activeDockFocus ? `隐藏当前聚焦的 ${paneLabel(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId)} Pane` : "先聚焦一个 Dock Pane，再隐藏它",
        shortcut: "Dock 焦点：⌘W",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus || Boolean(activeDockPaneId() && pinnedPanes.includes(activeDockPaneId() as PaneId)),
        run: hideActiveDockPane,
      },
      {
        id: "ide.pane.pin-active",
        group: "窗格" as const,
        label: "固定当前聚焦 Pane",
        description: activeDockFocus ? `固定当前聚焦的 ${paneLabel(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId)} Pane，防止误隐藏或误移动` : "先聚焦一个 Dock Pane，再固定它",
        shortcut: "Dock 焦点：⌘⌥P",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        disabled: !activeDockFocus,
        run: pinActiveDockPane,
      },
      {
        id: "ide.pane.unpin-active",
        group: "窗格" as const,
        label: "取消固定当前聚焦 Pane",
        description: activeDockFocus ? `取消固定当前聚焦的 ${paneLabel(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId)} Pane` : "先聚焦一个 Dock Pane，再取消固定",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        disabled: !activeDockFocus,
        run: unpinActiveDockPane,
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
      {
        id: "ide.pane.restore-active-dock-hidden",
        group: "窗格" as const,
        label: "恢复当前 Dock 隐藏 Pane",
        description: activeDockFocus ? `恢复 ${hiddenPanesForPlacement(activeDockFocus.placement).length} 个隐藏在${placementLabel(activeDockFocus.placement)} Dock 的 Pane` : "先聚焦一个 Dock，再恢复该 Dock 隐藏 Pane",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus || hiddenPanesForPlacement(activeDockFocus.placement).length === 0,
        run: () => {
          if (!activeDockFocus) return;
          restoreHiddenPanesForPlacement(activeDockFocus.placement);
        },
      },
      ...DOCK_PLACEMENTS.map((placement) => ({
        id: `ide.pane.restore-hidden.${placement}`,
        group: "窗格" as const,
        label: `恢复${placementLabel(placement)} Dock 隐藏 Pane`,
        description: `恢复 ${hiddenPanesForPlacement(placement).length} 个隐藏在${placementLabel(placement)} Dock 的 Pane`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: hiddenPanesForPlacement(placement).length === 0,
        run: () => restoreHiddenPanesForPlacement(placement),
      })),
      ...PANE_REGISTRY.flatMap((pane) => {
        const hidden = hiddenPanes.includes(pane.id);
        const pinned = pinnedPanes.includes(pane.id);
        return [
          {
            id: `ide.pane.${pinned ? "unpin" : "pin"}.${pane.id}`,
            group: "窗格" as const,
            label: `${pinned ? "取消固定" : "固定"} ${pane.label} Pane`,
            description: pinned ? `${pane.label} Pane 已允许移动和隐藏` : `保护 ${pane.label} Pane，避免误拖动、误移动或误隐藏`,
            risk: "safe" as const,
            surface: "layout" as const,
            icon: React.createElement(pane.icon),
            run: () => togglePanePinned(pane.id),
          },
          {
            id: `ide.pane.${hidden ? "show" : "hide"}.${pane.id}`,
            group: "窗格" as const,
            label: `${hidden ? "恢复" : "隐藏"} ${pane.label} Pane`,
            description: hidden ? `把 ${pane.label} Pane 恢复到${placementLabel(panePlacements[pane.id])} Dock` : `从当前 IDE 布局中隐藏 ${pane.label} Pane，可随时从命令面板恢复`,
            risk: "safe" as const,
            surface: "layout" as const,
            icon: React.createElement(pane.icon),
            disabled: !hidden && pinned,
            run: () => (hidden ? restorePane(pane.id) : hidePane(pane.id)),
          },
        ];
      }),
    ],
    [activeDockFocus, hiddenPanes, panePlacements, pinnedPanes],
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
        icon: dockPlacementIcon(placement),
        disabled: !activeDockFocus,
        run: () => moveActiveDockPaneToPlacement(placement),
      })),
    [activeDockFocus, activeBottomPane, activeLeftPane, activeRightPane, activeTopPane],
  );

  const activeDockExactGroupMoveCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      DOCK_PLACEMENTS.flatMap((placement) =>
        (["primary", "secondary"] as const).map((role) => ({
          id: `ide.dock.active.move-pane.${placement}.${role}`,
          group: "窗格" as const,
          label: `移动当前 Pane 到${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}组`,
          description: activeDockFocus
            ? `把当前聚焦 Pane 精确移动到${placementLabel(placement)} Dock 的${role === "primary" ? "主" : "副"}窗格组；移动到副组时会自动建立拆分布局`
            : "先聚焦一个 Dock Pane，再选择目标 Dock 与主/副组",
          risk: "safe" as const,
          surface: "layout" as const,
          icon: dockPlacementIcon(placement),
          disabled: !activeDockFocus,
          run: () => moveActiveDockPaneToPlacementGroup(placement, role),
        })),
      ),
    [activeDockFocus, activeBottomPane, activeLeftPane, activeRightPane, activeTopPane],
  );

  const dockPlacementLayoutCommands = React.useMemo<WorkspaceCommand[]>(
    () =>
      DOCK_PLACEMENTS.flatMap((placement) => [
        {
          id: `ide.dock.open.${placement}`,
          group: "布局" as const,
          label: `打开${placementLabel(placement)} Dock`,
          description: `恢复并聚焦${placementLabel(placement)} Dock，不改变窗格组合、拆分方向或当前 Pane`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: dockPlacementIcon(placement),
          run: () => focusIdeRegion(placement),
        },
        {
          id: `ide.dock.close.${placement}`,
          group: "布局" as const,
          label: `收起${placementLabel(placement)} Dock`,
          description: `只收起${placementLabel(placement)} Dock，保留 Pane 停靠、顺序、主副组和拆分比例`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: dockPlacementIcon(placement),
          run: () => closeDockPlacement(placement),
        },
        {
          id: `ide.dock.maximize.${placement}`,
          group: "布局" as const,
          label: `最大化${placementLabel(placement)} Dock`,
          description: `聚焦${placementLabel(placement)} Dock 为当前主工作区，便于全屏查看终端、Git、搜索或 AI Pane`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <Maximize2 />,
          run: () => {
            openDockPlacement(placement);
            toggleMaximizedPane(placement);
          },
        },
        {
          id: `ide.dock.reset-size.${placement}`,
          group: "布局" as const,
          label: `重置${placementLabel(placement)} Dock 尺寸`,
          description: `把${placementLabel(placement)} Dock 尺寸恢复到默认设计尺寸，其他 Dock 不受影响`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          run: () => resetDockSize(placement),
        },
        {
          id: `ide.dock.reset-composition.${placement}`,
          group: "窗格" as const,
          label: `恢复${placementLabel(placement)} Dock 默认组合`,
          description: `只恢复${placementLabel(placement)} Dock 的默认 Pane、顺序、主副选择和拆分状态，不影响其他 Dock 的用户布局`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          run: () => resetDockComposition(placement),
        },
      ]),
    [],
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
      {
        id: "ide.mobile.panel.next",
        group: "布局",
        label: "手机面板：下一个 IDE 区域",
        description: "在编辑器、顶部、左侧、右侧和底部 Dock 之间循环，适合手机端单手切换真实 IDE 区域",
        shortcut: "⌘⌥⇧PageDown",
        risk: "safe",
        surface: "layout",
        icon: <PanelRight />,
        run: () => cycleMobilePanel("next"),
      },
      {
        id: "ide.mobile.panel.previous",
        group: "布局",
        label: "手机面板：上一个 IDE 区域",
        description: "反向循环手机端 IDE 区域，保留每个 Dock 的窗格组合与拆分状态",
        shortcut: "⌘⌥⇧PageUp",
        risk: "safe",
        surface: "layout",
        icon: <PanelLeft />,
        run: () => cycleMobilePanel("previous"),
      },
    ],
    [mobilePanel],
  );

  const activeDockLayoutCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.dock.active.split-right",
        group: "窗格",
        label: "当前 Dock 左右拆分",
        description: activeDockFocus ? `把当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 变成左右窗格组` : "先聚焦一个 Dock 窗格组，再拆分当前 Dock",
        shortcut: "⌘⌥\\",
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
        shortcut: "⌘⌥⇧\\",
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
        shortcut: "⌘⌥0",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          mergeDockSplitGroups(activeDockFocus.placement, activeDockFocus.role);
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
        shortcut: "⌘⌥⇧PageDown",
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
        shortcut: "⌘⌥⇧PageUp",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelLeft />,
        disabled: !canNavigateActiveDockGroup(),
        run: () => selectAdjacentDockPane("previous"),
      },
      {
        id: "ide.workbench.next-pane",
        group: "窗格",
        label: "工作台切到下一个 Pane",
        description: "按顶部、左侧、右侧、底部 Dock 顺序跨区域切换到下一个可见 Pane",
        shortcut: "⌘⌥PageDown",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelRight />,
        disabled: !canNavigateWorkbenchPanes(),
        run: () => selectAdjacentWorkbenchPane("next"),
      },
      {
        id: "ide.workbench.previous-pane",
        group: "窗格",
        label: "工作台切到上一个 Pane",
        description: "按顶部、左侧、右侧、底部 Dock 顺序跨区域切换到上一个可见 Pane",
        shortcut: "⌘⌥PageUp",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelLeft />,
        disabled: !canNavigateWorkbenchPanes(),
        run: () => selectAdjacentWorkbenchPane("previous"),
      },
      {
        id: "ide.dock.active.reorder-previous",
        group: "窗格",
        label: "当前 Pane 在 Dock 内前移",
        description: activeDockFocus ? `把当前聚焦的 Pane 在${placementLabel(activeDockFocus.placement)} Dock 标签顺序中向前移动一位` : "先聚焦一个 Dock Pane，再调整它在同一 Dock 内的标签顺序",
        shortcut: "⌘⌥⇧,",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelLeft />,
        disabled: !canReorderActiveDockPane("previous"),
        run: () => reorderActiveDockPane("previous"),
      },
      {
        id: "ide.dock.active.reorder-next",
        group: "窗格",
        label: "当前 Pane 在 Dock 内后移",
        description: activeDockFocus ? `把当前聚焦的 Pane 在${placementLabel(activeDockFocus.placement)} Dock 标签顺序中向后移动一位` : "先聚焦一个 Dock Pane，再调整它在同一 Dock 内的标签顺序",
        shortcut: "⌘⌥⇧.",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <PanelRight />,
        disabled: !canReorderActiveDockPane("next"),
        run: () => reorderActiveDockPane("next"),
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
      ...SPLIT_RATIO_PRESETS.map((ratio) => ({
        id: `ide.dock.active.split-ratio.${ratio}`,
        group: "窗格" as const,
        label: `当前 Dock 拆分比例：${ratio}/${100 - ratio}`,
        description: activeDockFocus ? `把当前${placementLabel(activeDockFocus.placement)} Dock 主窗格组设置为 ${ratio}%` : "先聚焦一个已拆分 Dock，再设置主/副窗格比例",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Columns3 />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          setDockSplitRatioPreset(activeDockFocus.placement, ratio);
        },
      })),
      {
        id: "ide.dock.active.reset-size",
        group: "布局",
        label: "重置当前 Dock 尺寸",
        description: activeDockFocus ? `把当前聚焦的${placementLabel(activeDockFocus.placement)} Dock 尺寸恢复到默认值` : "先聚焦一个 Dock，再重置它的尺寸",
        shortcut: "⌘⌥⇧0",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          resetDockSize(activeDockFocus.placement);
        },
      },
      {
        id: "ide.dock.active.reset-composition",
        group: "窗格",
        label: "恢复当前 Dock 默认组合",
        description: activeDockFocus ? `只恢复当前${placementLabel(activeDockFocus.placement)} Dock 的默认 Pane、顺序、主副选择和拆分状态` : "先聚焦一个 Dock，再恢复该 Dock 的默认组合",
        shortcut: "⌘⌥⇧R",
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        disabled: !activeDockFocus,
        run: () => {
          if (!activeDockFocus) return;
          resetDockComposition(activeDockFocus.placement);
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
        shortcut: "⌘⌥M",
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
        shortcut: "⌘⌥H",
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
          description: `合并${placementLabel(placement)} Dock 的主副窗格组，并把当前主组保留为单一活动组`,
          risk: "safe" as const,
          surface: "layout" as const,
          icon: <RotateCcw />,
          run: () => mergeDockSplitGroups(placement),
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
      {
        id: "ide.layout.snapshot.export",
        group: "布局",
        label: "导出 IDE 布局快照 JSON",
        description: "把当前保存的 IDE 布局快照复制到剪贴板并下载 JSON 文件，便于备份或迁移到另一设备",
        risk: "safe",
        surface: "layout",
        icon: <Settings2 />,
        disabled: layoutSnapshots.length === 0,
        run: exportLayoutSnapshots,
      },
      {
        id: "ide.layout.snapshot.import",
        group: "布局",
        label: "导入 IDE 布局快照 JSON",
        description: "从 JSON 文本导入 IDE 布局快照；导入内容会通过布局 schema 清洗后再保存",
        risk: "safe",
        surface: "layout",
        icon: <Settings2 />,
        run: importLayoutSnapshots,
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
        id: `ide.layout.snapshot.update.${snapshot.id}`,
        group: "布局" as const,
        label: `用当前布局覆盖快照：${snapshot.name}`,
        description: `把当前 Dock 开合、尺寸、拆分、Pane 停靠和标签状态写回 ${snapshot.name}，作为可维护的自定义 IDE 组合`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        run: () => updateLayoutSnapshot(snapshot.id),
      })),
      ...layoutSnapshots.map((snapshot) => ({
        id: `ide.layout.snapshot.rename.${snapshot.id}`,
        group: "布局" as const,
        label: `重命名布局快照：${snapshot.name}`,
        description: `重命名 ${formatSnapshotTime(snapshot.createdAt)} 保存的 IDE 布局快照，不改变其中保存的窗格状态`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        run: () => renameLayoutSnapshot(snapshot.id),
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
    [layoutSnapshots, bottomOpen, dockPaneSelections, dockSplitModes, dockSplitRatios, editorGroupTabs, editorSplitMode, editorSplitRatio, hiddenPanes, layoutPreset, leftOpen, maximizedPane, paneOrder, panePlacements, paneSizes, rightOpen, topOpen],
  );

  const dockSnapshotCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      ...DOCK_PLACEMENTS.map((placement) => ({
        id: `ide.dock.snapshot.save.${placement}`,
        group: "布局" as const,
        label: `保存${placementLabel(placement)} Dock 组合快照`,
        description: `只保存${placementLabel(placement)} Dock 的 Pane 顺序、隐藏/固定状态、拆分方向、比例、尺寸和开合状态`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        run: () => saveDockSnapshot(placement),
      })),
      ...dockSnapshots.map((snapshot) => ({
        id: `ide.dock.snapshot.restore.${snapshot.id}`,
        group: "布局" as const,
        label: `恢复${placementLabel(snapshot.placement)} Dock 组合：${snapshot.name}`,
        description: `恢复 ${formatSnapshotTime(snapshot.createdAt)} 保存的${placementLabel(snapshot.placement)} Dock 组合，不覆盖其它 Dock`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        run: () => restoreDockSnapshot(snapshot),
      })),
      ...dockSnapshots.map((snapshot) => ({
        id: `ide.dock.snapshot.update.${snapshot.id}`,
        group: "布局" as const,
        label: `用当前${placementLabel(snapshot.placement)} Dock 覆盖组合：${snapshot.name}`,
        description: `把当前${placementLabel(snapshot.placement)} Dock 的组合状态写回该 Dock 快照`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        run: () => updateDockSnapshot(snapshot.id),
      })),
      ...dockSnapshots.map((snapshot) => ({
        id: `ide.dock.snapshot.delete.${snapshot.id}`,
        group: "布局" as const,
        label: `删除${placementLabel(snapshot.placement)} Dock 组合：${snapshot.name}`,
        description: `删除 ${formatSnapshotTime(snapshot.createdAt)} 保存的${placementLabel(snapshot.placement)} Dock 组合快照`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Trash2 />,
        run: () => deleteDockSnapshot(snapshot.id),
      })),
    ],
    [dockSnapshots, dockPaneSelections, dockSplitModes, dockSplitRatios, hiddenPanes, paneOrder, paneSizes, pinnedPanes, topOpen, leftOpen, rightOpen, bottomOpen],
  );

  const editorGroupSnapshotCommands = React.useMemo<WorkspaceCommand[]>(
    () => [
      {
        id: "ide.editor-groups.snapshot.save",
        group: "编辑器",
        label: "保存当前编辑器组布局",
        description: "只保存主/副编辑器组、拆分方向、比例、活动组和标签组，不覆盖其它 Dock 布局",
        risk: "safe",
        surface: "layout",
        icon: <Columns3 />,
        run: saveEditorGroupSnapshot,
      },
      ...editorGroupSnapshots.map((snapshot) => ({
        id: `ide.editor-groups.snapshot.restore.${snapshot.id}`,
        group: "编辑器" as const,
        label: `恢复编辑器组布局：${snapshot.name}`,
        description: `恢复 ${formatSnapshotTime(snapshot.createdAt)} 保存的编辑器拆分与标签组`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <RotateCcw />,
        run: () => restoreEditorGroupSnapshot(snapshot),
      })),
      ...editorGroupSnapshots.map((snapshot) => ({
        id: `ide.editor-groups.snapshot.update.${snapshot.id}`,
        group: "编辑器" as const,
        label: `用当前编辑器组覆盖布局：${snapshot.name}`,
        description: `把当前主/副编辑器组、拆分方向、比例和标签组写回 ${snapshot.name}`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Settings2 />,
        run: () => updateEditorGroupSnapshot(snapshot.id),
      })),
      ...editorGroupSnapshots.map((snapshot) => ({
        id: `ide.editor-groups.snapshot.delete.${snapshot.id}`,
        group: "编辑器" as const,
        label: `删除编辑器组布局：${snapshot.name}`,
        description: `删除 ${formatSnapshotTime(snapshot.createdAt)} 保存的编辑器组布局快照`,
        risk: "safe" as const,
        surface: "layout" as const,
        icon: <Trash2 />,
        run: () => deleteEditorGroupSnapshot(snapshot.id),
      })),
    ],
    [activeEditorGroup, activePath, activePathRootId, editorGroupSnapshots, editorGroupTabs, editorSplitMode, editorSplitRatio, secondaryPath, secondaryPathRootId],
  );

  const commands = React.useMemo(
    () => [...layoutCommands, ...dockPlacementLayoutCommands, ...layoutSnapshotCommands, ...dockSnapshotCommands, ...editorGroupSnapshotCommands, ...focusRegionCommands, ...mobilePanelCommands, ...paneVisibilityCommands, ...panePlacementCommands, ...activeDockGroupCommands, ...activeDockMoveCommands, ...activeDockExactGroupMoveCommands, ...activeDockLayoutCommands, ...dockSplitCommands, ...editorCommands, ...searchCommands, ...gitCommands, ...terminalCommands],
    [activeDockExactGroupMoveCommands, activeDockGroupCommands, activeDockLayoutCommands, activeDockMoveCommands, dockPlacementLayoutCommands, dockSnapshotCommands, dockSplitCommands, editorCommands, editorGroupSnapshotCommands, focusRegionCommands, gitCommands, layoutCommands, layoutSnapshotCommands, mobilePanelCommands, panePlacementCommands, paneVisibilityCommands, searchCommands, terminalCommands],
  );

  function applyLayoutPreset(preset: LayoutPreset) {
    if (layoutLocked) return;
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


  function applyWorkbenchRecipe(recipeId: WorkbenchRecipeId) {
    if (layoutLocked) return;
    const recipe = WORKBENCH_LAYOUT_RECIPES.find((item) => item.id === recipeId);
    if (!recipe) return;
    const nextGroups = groupPanesByPlacement(recipe.panePlacements, recipe.paneOrder, []);
    setLayoutPreset(recipe.layoutPreset);
    setMaximizedPane(null);
    setPaneSizes(recipe.paneSizes);
    setPanePlacements(recipe.panePlacements);
    setPaneOrder(recipe.paneOrder);
    setHiddenPanes([]);
    setDockSplitModes(recipe.dockSplitModes);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections(mergeDockPaneSelections(recipe.dockPaneSelections));
    setTopOpen(recipe.open.top);
    setLeftOpen(recipe.open.left);
    setRightOpen(recipe.open.right);
    setBottomOpen(recipe.open.bottom);
    setTopPanel(nextGroups.top[0] ?? "output");
    setActivity(nextGroups.left[0] ?? "explorer");
    setRightPanel(nextGroups.right[0] ?? "ai");
    setBottomPanel(nextGroups.bottom[0] ?? "terminal");
    setActiveDockFocus(null);
    setMobilePanel("editor");
  }

  function openAllDocks() {
    if (layoutLocked) return;
    setTopOpen(true);
    setLeftOpen(true);
    setRightOpen(true);
    setBottomOpen(true);
    setMaximizedPane(null);
    setMobilePanel("editor");
  }

  function focusEditorOnlyLayout() {
    if (layoutLocked) return;
    setTopOpen(false);
    setLeftOpen(false);
    setRightOpen(false);
    setBottomOpen(false);
    setMaximizedPane(null);
    setActiveDockFocus(null);
    setMobilePanel("editor");
    focusIdeRegionNode("center");
  }

  function closeAllDockSplits() {
    if (layoutLocked) return;
    setDockSplitModes(DEFAULT_DOCK_SPLIT_MODES);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections((current) => ({
      top: { ...current.top, secondary: secondaryDockPane(topPaneIds, activeTopPane) },
      left: { ...current.left, secondary: secondaryDockPane(leftPaneIds, activeLeftPane) },
      right: { ...current.right, secondary: secondaryDockPane(rightPaneIds, activeRightPane) },
      bottom: { ...current.bottom, secondary: secondaryDockPane(bottomPaneIds, activeBottomPane) },
    }));
    setActiveDockFocus((current) => (current ? { ...current, role: "primary" } : current));
  }

  function resetAllDockSplitRatios() {
    if (layoutLocked) return;
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
  }

  function resetLayout() {
    if (layoutLocked) return;
    setLayoutPreset("balanced");
    setPaneSizes(DEFAULT_PANE_SIZES);
    setDockSplitModes(DEFAULT_DOCK_SPLIT_MODES);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections(DEFAULT_DOCK_PANE_SELECTIONS);
    setMaximizedPane(null);
    closeEditorSplit();
    resetPanePlacements();
  }

  function resetDockSize(placement: PanePlacement) {
    if (layoutLocked) return;
    setPaneSizes((current) => ({ ...current, [placement]: DEFAULT_PANE_SIZES[placement] }));
    setLayoutPreset("balanced");
  }

  function resetDockComposition(placement: PanePlacement) {
    if (layoutLocked) return;
    const defaultPaneIds = defaultPaneIdsForPlacement(placement);
    setPanePlacements((current) => {
      const next = { ...current };
      for (const paneId of defaultPaneIds) next[paneId] = placement;
      return next;
    });
    setPaneOrder((current) => ({ ...current, [placement]: defaultPaneIds }));
    setDockSplitModes((current) => ({ ...current, [placement]: DEFAULT_DOCK_SPLIT_MODES[placement] }));
    setDockSplitRatios((current) => ({ ...current, [placement]: DEFAULT_DOCK_SPLIT_RATIOS[placement] }));
    setDockPaneSelections((current) => ({
      ...current,
      [placement]: normalizeDockPaneSelection({ ...DEFAULT_DOCK_PANE_SELECTIONS[placement] }, defaultPaneIds),
    }));
    setHiddenPanes((current) => current.filter((paneId) => !defaultPaneIds.includes(paneId)));
    setMaximizedPane((current) => (current === placement ? null : current));
    const firstPane = defaultPaneIds[0];
    if (firstPane) {
      setPrimaryDockPanel(placement, firstPane);
      openDockPlacement(placement);
      focusDockPane(placement, "primary", firstPane);
    }
  }

  function resetPanePlacements() {
    if (layoutLocked) return;
    setPanePlacements(DEFAULT_PANE_PLACEMENTS);
    setPaneOrder(DEFAULT_PANE_ORDER);
    setDockSplitModes(DEFAULT_DOCK_SPLIT_MODES);
    setDockSplitRatios(DEFAULT_DOCK_SPLIT_RATIOS);
    setDockPaneSelections(DEFAULT_DOCK_PANE_SELECTIONS);
    setHiddenPanes([]);
    setPinnedPanes([]);
    setActiveDockFocus(null);
    setMaximizedPane(null);
    setMobilePanel("editor");
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

  function isDockOpen(placement: PanePlacement): boolean {
    if (placement === "top") return topOpen;
    if (placement === "left") return leftOpen;
    if (placement === "right") return rightOpen;
    return bottomOpen;
  }

  function setDockOpen(placement: PanePlacement, open: boolean) {
    if (placement === "top") setTopOpen(open);
    if (placement === "left") setLeftOpen(open);
    if (placement === "right") setRightOpen(open);
    if (placement === "bottom") setBottomOpen(open);
  }

  function isolateDockPlacement(placement: PanePlacement) {
    if (layoutLocked) return;
    setTopOpen(placement === "top");
    setLeftOpen(placement === "left");
    setRightOpen(placement === "right");
    setBottomOpen(placement === "bottom");
    setMaximizedPane(null);
    openDockPlacement(placement);
    setMobilePanel(placement);
  }

  function restoreDockPlacement(placement: PanePlacement) {
    if (layoutLocked) return;
    setDockOpen(placement, true);
    setMaximizedPane(null);
    setMobilePanel(placement);
  }

  function cycleMobilePanel(direction: MobilePanelDirection) {
    const currentIndex = Math.max(0, MOBILE_PANEL_ORDER.indexOf(mobilePanel));
    const offset = direction === "next" ? 1 : -1;
    const nextIndex = (currentIndex + offset + MOBILE_PANEL_ORDER.length) % MOBILE_PANEL_ORDER.length;
    showMobilePanel(MOBILE_PANEL_ORDER[nextIndex]);
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
      activeEditorGroup,
      activePath,
      activePathRootId: activePathRootId || "",
      secondaryPath,
      secondaryPathRootId: secondaryPathRootId || "",
      editorSplitMode,
      editorSplitRatio,
      panePlacements,
      paneOrder,
      dockSplitModes,
      dockSplitRatios,
      dockPaneSelections,
      editorGroupTabs,
      hiddenPanes,
      pinnedPanes,
      layoutLocked,
    };
  }

  function undoIdeLayoutChange() {
    if (layoutHistoryPast.length === 0) return;
    const previousLayoutState = layoutHistoryPast[layoutHistoryPast.length - 1];
    const currentLayoutState = currentIdeLayoutState();
    applyingLayoutHistoryRef.current = true;
    setLayoutHistoryPast((history) => history.slice(0, -1));
    setLayoutHistoryFuture((history) => [currentLayoutState, ...history].slice(0, MAX_LAYOUT_HISTORY));
    applyIdeLayoutState(previousLayoutState);
  }

  function redoIdeLayoutChange() {
    if (layoutHistoryFuture.length === 0) return;
    const nextLayoutState = layoutHistoryFuture[0];
    const currentLayoutState = currentIdeLayoutState();
    applyingLayoutHistoryRef.current = true;
    setLayoutHistoryFuture((history) => history.slice(1));
    setLayoutHistoryPast((history) => [...history, currentLayoutState].slice(-MAX_LAYOUT_HISTORY));
    applyIdeLayoutState(nextLayoutState);
  }

  function saveLayoutSnapshot() {
    const createdAt = new Date().toISOString();
    const defaultName = `工作台布局 ${layoutSnapshots.length + 1}`;
    const requestedName = typeof window !== "undefined" ? window.prompt("命名当前 IDE 布局快照", defaultName) : defaultName;
    const snapshot: IdeLayoutSnapshot = {
      id: `layout-${Date.now()}`,
      name: sanitizeSnapshotName(requestedName, defaultName),
      createdAt,
      state: currentIdeLayoutState(),
    };
    const nextSnapshots = [snapshot, ...layoutSnapshots].slice(0, MAX_LAYOUT_SNAPSHOTS);
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function updateLayoutSnapshot(snapshotId: string) {
    const nextSnapshots = layoutSnapshots.map((snapshot) => (
      snapshot.id === snapshotId
        ? { ...snapshot, createdAt: new Date().toISOString(), state: currentIdeLayoutState() }
        : snapshot
    ));
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function exportLayoutSnapshots() {
    const payload = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), snapshots: sanitizeIdeLayoutSnapshots(layoutSnapshots) }, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(payload).catch(ignoreWorkspaceCommands);
    }
    if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return;
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tracevane-ide-layout-snapshots.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importLayoutSnapshots() {
    const raw = typeof window !== "undefined" ? window.prompt("粘贴 IDE 布局快照 JSON") : null;
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const imported = sanitizeImportedLayoutSnapshots(parsed);
      if (imported.length === 0) return;
      const nextSnapshots = mergeLayoutSnapshots(imported, layoutSnapshots);
      setLayoutSnapshots(nextSnapshots);
      storeIdeLayoutSnapshots(nextSnapshots);
    } catch {
      if (typeof window !== "undefined") window.alert("无法导入 IDE 布局快照：JSON 无效或不符合布局 schema");
    }
  }

  function renameLayoutSnapshot(snapshotId: string) {
    const snapshot = layoutSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return;
    const requestedName = typeof window !== "undefined" ? window.prompt("重命名 IDE 布局快照", snapshot.name) : snapshot.name;
    const nextName = sanitizeSnapshotName(requestedName, snapshot.name);
    const nextSnapshots = layoutSnapshots.map((item) => (item.id === snapshotId ? { ...item, name: nextName } : item));
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function restoreLayoutSnapshot(snapshot: IdeLayoutSnapshot) {
    if (layoutLocked) return;
    applyIdeLayoutState(snapshot.state);
  }

  function restoreLatestLayoutSnapshot() {
    const snapshot = layoutSnapshots[0];
    if (snapshot) restoreLayoutSnapshot(snapshot);
  }

  function deleteLayoutSnapshot(snapshotId: string) {
    const nextSnapshots = layoutSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setLayoutSnapshots(nextSnapshots);
    storeIdeLayoutSnapshots(nextSnapshots);
  }

  function currentDockSnapshotState(placement: PanePlacement, name: string, id = `dock-${placement}-${Date.now()}`): IdeDockSnapshot {
    const paneIds = paneOrder[placement].filter((paneId) => (panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement) === placement);
    const hiddenPaneIds = hiddenPanes.filter((paneId) => (panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement) === placement);
    return {
      id,
      name,
      createdAt: new Date().toISOString(),
      placement,
      paneIds,
      hiddenPaneIds,
      pinnedPaneIds: pinnedPanes.filter((paneId) => paneIds.includes(paneId) || hiddenPaneIds.includes(paneId)),
      splitMode: dockSplitModes[placement],
      splitRatio: dockSplitRatios[placement],
      paneSelection: dockPaneSelections[placement],
      open: isDockOpen(placement),
      size: paneSizes[placement],
    };
  }

  function saveDockSnapshot(placement: PanePlacement) {
    const defaultName = `${placementLabel(placement)} Dock 组合 ${dockSnapshots.filter((snapshot) => snapshot.placement === placement).length + 1}`;
    const requestedName = typeof window !== "undefined" ? window.prompt(`命名${placementLabel(placement)} Dock 组合快照`, defaultName) : defaultName;
    const snapshot = currentDockSnapshotState(placement, sanitizeSnapshotName(requestedName, defaultName));
    const nextSnapshots = [snapshot, ...dockSnapshots].slice(0, MAX_DOCK_SNAPSHOTS);
    setDockSnapshots(nextSnapshots);
    storeIdeDockSnapshots(nextSnapshots);
  }

  function updateDockSnapshot(snapshotId: string) {
    const snapshot = dockSnapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return;
    const nextSnapshots = dockSnapshots.map((item) => (
      item.id === snapshotId ? currentDockSnapshotState(item.placement, item.name, item.id) : item
    ));
    setDockSnapshots(nextSnapshots);
    storeIdeDockSnapshots(nextSnapshots);
  }

  function deleteDockSnapshot(snapshotId: string) {
    const nextSnapshots = dockSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setDockSnapshots(nextSnapshots);
    storeIdeDockSnapshots(nextSnapshots);
  }

  function restoreDockSnapshot(snapshot: IdeDockSnapshot) {
    if (layoutLocked) return;
    const sanitized = sanitizeIdeDockSnapshot(snapshot);
    if (!sanitized) return;
    const placement = sanitized.placement;
    const paneSet = new Set([...sanitized.paneIds, ...sanitized.hiddenPaneIds]);
    setPanePlacements((current) => {
      const next = { ...current };
      for (const paneId of paneSet) next[paneId] = placement;
      return next;
    });
    setPaneOrder((current) => ({ ...current, [placement]: sanitized.paneIds }));
    setHiddenPanes((current) => [
      ...current.filter((paneId) => (panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement) !== placement && !paneSet.has(paneId)),
      ...sanitized.hiddenPaneIds,
    ]);
    setPinnedPanes((current) => [
      ...current.filter((paneId) => !paneSet.has(paneId)),
      ...sanitized.pinnedPaneIds,
    ]);
    setDockSplitModes((current) => ({ ...current, [placement]: sanitized.splitMode }));
    setDockSplitRatios((current) => ({ ...current, [placement]: sanitized.splitRatio }));
    setDockPaneSelections((current) => ({ ...current, [placement]: normalizeDockPaneSelection(sanitized.paneSelection, sanitized.paneIds) }));
    setPaneSizes((current) => ({ ...current, [placement]: sanitized.size }));
    setDockOpen(placement, sanitized.open);
    if (sanitized.open) setMobilePanel(placement);
  }

  function currentEditorGroupSnapshotState(name: string, id = `editor-groups-${Date.now()}`): IdeEditorGroupSnapshot {
    return {
      id,
      name,
      createdAt: new Date().toISOString(),
      activeEditorGroup,
      activePath,
      activePathRootId: activePathRootId || "",
      secondaryPath,
      secondaryPathRootId: secondaryPathRootId || "",
      editorGroupTabs,
      editorSplitMode,
      editorSplitRatio,
    };
  }

  function saveEditorGroupSnapshot() {
    const defaultName = `编辑器组 ${editorGroupSnapshots.length + 1}`;
    const requestedName = typeof window !== "undefined" ? window.prompt("命名当前编辑器组布局", defaultName) : defaultName;
    const snapshot = currentEditorGroupSnapshotState(sanitizeSnapshotName(requestedName, defaultName));
    const nextSnapshots = [snapshot, ...editorGroupSnapshots].slice(0, MAX_EDITOR_GROUP_SNAPSHOTS);
    setEditorGroupSnapshots(nextSnapshots);
    storeIdeEditorGroupSnapshots(nextSnapshots);
  }

  function updateEditorGroupSnapshot(snapshotId: string) {
    const nextSnapshots = editorGroupSnapshots.map((snapshot) => (
      snapshot.id === snapshotId ? currentEditorGroupSnapshotState(snapshot.name, snapshot.id) : snapshot
    ));
    setEditorGroupSnapshots(nextSnapshots);
    storeIdeEditorGroupSnapshots(nextSnapshots);
  }

  function deleteEditorGroupSnapshot(snapshotId: string) {
    const nextSnapshots = editorGroupSnapshots.filter((snapshot) => snapshot.id !== snapshotId);
    setEditorGroupSnapshots(nextSnapshots);
    storeIdeEditorGroupSnapshots(nextSnapshots);
  }

  function restoreEditorGroupSnapshot(snapshot: IdeEditorGroupSnapshot) {
    if (layoutLocked) return;
    const sanitized = sanitizeIdeEditorGroupSnapshot(snapshot);
    if (!sanitized) return;
    setActiveEditorGroup(sanitized.activeEditorGroup);
    setActivePath(sanitized.activePath);
    setActivePathRootId(sanitized.activePathRootId ?? "");
    setSecondaryPath(sanitized.secondaryPath);
    setSecondaryPathRootId(sanitized.secondaryPathRootId ?? "");
    setEditorGroupTabs(sanitized.editorGroupTabs);
    setEditorSplitMode(sanitized.editorSplitMode);
    setEditorSplitRatio(sanitized.editorSplitRatio);
    setMobilePanel("editor");
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
    const nextPinnedPanes = sanitized.pinnedPanes ?? [];
    const nextGroups = groupPanesByPlacement(nextPanePlacements, nextPaneOrder, nextHiddenPanes);
    setPanePlacements(nextPanePlacements);
    setPaneOrder(nextPaneOrder);
    setDockSplitModes({ ...DEFAULT_DOCK_SPLIT_MODES, ...sanitized.dockSplitModes });
    setDockSplitRatios({ ...DEFAULT_DOCK_SPLIT_RATIOS, ...sanitized.dockSplitRatios });
    setDockPaneSelections(mergeDockPaneSelections(sanitized.dockPaneSelections));
    setHiddenPanes(nextHiddenPanes);
    setPinnedPanes(nextPinnedPanes);
    setLayoutLocked(sanitized.layoutLocked ?? false);
    setTopOpen(sanitized.topOpen ?? false);
    setLeftOpen(sanitized.leftOpen ?? true);
    setRightOpen(sanitized.rightOpen ?? true);
    setBottomOpen(sanitized.bottomOpen ?? true);
    setMaximizedPane(sanitized.maximizedPane ?? null);
    setLayoutPreset(sanitized.layoutPreset ?? "balanced");
    setPaneSizes({ ...DEFAULT_PANE_SIZES, ...sanitized.paneSizes });
    setActivePath(sanitized.activePath);
    setActivePathRootId(sanitized.activePathRootId ?? "");
    setSecondaryPath(sanitized.secondaryPath);
    setSecondaryPathRootId(sanitized.secondaryPathRootId ?? "");
    setActiveEditorGroup(sanitized.activeEditorGroup ?? "primary");
    setEditorSplitMode(sanitized.editorSplitMode ?? "single");
    setEditorSplitRatio(sanitized.editorSplitRatio ?? DEFAULT_EDITOR_SPLIT_RATIO);
    setEditorGroupTabs(sanitizeEditorGroupTabs(sanitized.editorGroupTabs));
    setActiveDockFocus(null);
    setMobilePanel("editor");
    setTopPanel(nextGroups.top[0] ?? "output");
    setActivity(nextGroups.left[0] ?? "explorer");
    setRightPanel(nextGroups.right[0] ?? "ai");
    setBottomPanel(nextGroups.bottom[0] ?? "terminal");
  }

  function startPaneResize(pane: keyof IdePaneSizes, event: React.PointerEvent) {
    if (layoutLocked) return;
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

  function resizeDockPlacement(placement: PanePlacement, delta: number) {
    if (layoutLocked) return;
    const { min, max } = getPaneSizeLimits(placement);
    setPaneSizes((current) => ({
      ...current,
      [placement]: clamp(current[placement] + delta, min, max),
    }));
    setLayoutPreset("balanced");
    openDockPlacement(placement);
  }

  function setDockPlacementSize(placement: PanePlacement, size: number) {
    if (layoutLocked) return;
    const { min, max } = getPaneSizeLimits(placement);
    setPaneSizes((current) => ({ ...current, [placement]: clamp(size, min, max) }));
    setLayoutPreset("balanced");
    openDockPlacement(placement);
  }

  function setDockPlacementSizePreset(placement: PanePlacement, preset: DockSizePreset) {
    if (layoutLocked) return;
    const { min, max } = getPaneSizeLimits(placement);
    const nextSize = preset === "compact" ? min : preset === "expanded" ? max : Math.round((min + max) / 2);
    setDockPlacementSize(placement, nextSize);
  }

  function resizeActiveDockPlacement(delta: number) {
    if (!activeDockFocus) return;
    const pane = activeDockFocus.placement;
    resizeDockPlacement(pane, delta);
  }

  function startEditorSplitResize(event: React.PointerEvent) {
    if (layoutLocked) return;
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
    if (layoutLocked) return;
    const baseStep = event.shiftKey ? 8 : 3;
    const delta = editorSplitKeyboardDelta(editorSplitMode, event.key, baseStep);
    if (delta === 0) return;
    event.preventDefault();
    setEditorSplitRatio((current) => clamp(current + delta, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max));
  }

  function startDockSplitResize(placement: PanePlacement, mode: DockSplitMode, event: React.PointerEvent) {
    if (layoutLocked) return;
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
    if (layoutLocked) return;
    const baseStep = event.shiftKey ? 8 : 3;
    const delta = splitKeyboardDelta(mode, event.key, baseStep);
    if (delta === 0) return;
    event.preventDefault();
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: clamp(current[placement] + delta, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max),
    }));
  }

  function rememberEditorTab(group: EditorGroupId, path: string, tabRootId: string) {
    setEditorGroupTabs((current) => ({
      ...current,
      [group]: upsertEditorTab(current[group], { path, rootId: tabRootId }),
    }));
  }

  function focusEditorGroup(group: EditorGroupId) {
    setActiveEditorGroup(group);
    setActiveDockFocus(null);
    setMobilePanel("editor");
  }

  function activeEditorGroupId(): EditorGroupId {
    return activeEditorGroup === "secondary" && editorSplitMode !== "single" ? "secondary" : "primary";
  }

  function activeEditorTab(): EditorTab | null {
    if (activeEditorGroup === "secondary" && editorSplitMode !== "single" && secondaryPath) {
      return { path: secondaryPath, rootId: secondaryPathRootId || activePathRootId || rootId };
    }
    if (activePath) return { path: activePath, rootId: activePathRootId || rootId };
    return null;
  }

  function closeActiveEditorTab() {
    const tab = activeEditorTab();
    if (!tab) return;
    closeEditorTab(activeEditorGroupId(), tab);
  }

  function canNavigateEditorTabs() {
    return editorGroupTabs[activeEditorGroupId()].length > 1;
  }

  function selectAdjacentEditorTab(direction: "next" | "previous") {
    const group = activeEditorGroupId();
    const tabs = editorGroupTabs[group];
    if (tabs.length < 2) return;
    const currentTab = activeEditorTab();
    const currentIndex = Math.max(0, tabs.findIndex((tab) => currentTab && tab.path === currentTab.path && tab.rootId === currentTab.rootId));
    const nextIndex = direction === "next" ? (currentIndex + 1) % tabs.length : (currentIndex - 1 + tabs.length) % tabs.length;
    selectEditorTab(group, tabs[nextIndex]);
  }

  function selectEditorTab(group: EditorGroupId, tab: EditorTab) {
    if (group === "primary") {
      setActivePath(tab.path);
      setActivePathRootId(tab.rootId);
    } else {
      if (editorSplitMode === "single") splitEditor("vertical");
      setSecondaryPath(tab.path);
      setSecondaryPathRootId(tab.rootId);
    }
    focusEditorGroup(group);
    focusIdeRegion("center");
  }

  function closeEditorTab(group: EditorGroupId, tab: EditorTab) {
    const currentTabs = editorGroupTabs[group];
    const nextTabs = currentTabs.filter((item) => item.path !== tab.path || item.rootId !== tab.rootId);
    setEditorGroupTabs((current) => ({ ...current, [group]: nextTabs }));
    const isActiveTab = group === "primary" ? activePath === tab.path && (activePathRootId || rootId) === tab.rootId : (secondaryPath ?? activePath) === tab.path && (secondaryPathRootId || activePathRootId || rootId) === tab.rootId;
    if (!isActiveTab) return;
    const nextActiveTab = nextTabs.at(-1);
    if (group === "primary") {
      setActivePath(nextActiveTab?.path);
      setActivePathRootId(nextActiveTab?.rootId ?? "");
    } else {
      setSecondaryPath(nextActiveTab?.path);
      setSecondaryPathRootId(nextActiveTab?.rootId ?? "");
    }
  }

  function clearEditorGroupTabs(group: EditorGroupId) {
    if (layoutLocked) return;
    setEditorGroupTabs((current) => ({ ...current, [group]: [] }));
    if (group === "primary") {
      setActivePath(undefined);
      setActivePathRootId("");
    } else {
      setSecondaryPath(undefined);
      setSecondaryPathRootId("");
    }
    focusEditorGroup(group);
  }

  function duplicateEditorGroupTabs(sourceGroup: EditorGroupId, targetGroup: EditorGroupId) {
    if (layoutLocked) return;
    const sourceTabs = editorGroupTabs[sourceGroup];
    if (sourceTabs.length === 0) return;
    if (targetGroup === "secondary" && editorSplitMode === "single") splitEditor("vertical");
    setEditorGroupTabs((current) => ({
      ...current,
      [targetGroup]: mergeEditorTabs(current[targetGroup], sourceTabs),
    }));
    const nextActiveTab = sourceTabs.at(-1);
    if (nextActiveTab) selectEditorTab(targetGroup, nextActiveTab);
  }

  function beginEditorTabDrag(group: EditorGroupId, tab: EditorTab, event: React.DragEvent) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tracevane-editor-tab", JSON.stringify({ group, ...tab }));
  }

  function reorderEditorTab(group: EditorGroupId, draggedTab: EditorTab, beforeTab: EditorTab) {
    setEditorGroupTabs((current) => ({
      ...current,
      [group]: reorderEditorTabs(current[group], draggedTab, beforeTab),
    }));
  }

  function dropEditorTabBefore(group: EditorGroupId, beforeTab: EditorTab, event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    const payload = parseEditorTabDragPayload(event.dataTransfer.getData("application/x-tracevane-editor-tab"));
    if (!payload) return;
    if (payload.group === group) {
      reorderEditorTab(group, payload, beforeTab);
    } else {
      moveEditorTabToGroup(payload.group, group, payload, beforeTab);
    }
  }

  function dropEditorTabAtEnd(group: EditorGroupId, event: React.DragEvent) {
    event.preventDefault();
    const payload = parseEditorTabDragPayload(event.dataTransfer.getData("application/x-tracevane-editor-tab"));
    if (!payload) return;
    moveEditorTabToGroupEnd(payload.group, group, payload);
  }

  function moveEditorTabToGroup(sourceGroup: EditorGroupId, targetGroup: EditorGroupId, tab: EditorTab, beforeTab: EditorTab) {
    setEditorGroupTabs((current) => ({
      ...current,
      [sourceGroup]: current[sourceGroup].filter((item) => item.path !== tab.path || item.rootId !== tab.rootId),
      [targetGroup]: insertEditorTabBefore(current[targetGroup], tab, beforeTab),
    }));
    selectEditorTab(targetGroup, tab);
  }

  function moveEditorTabToGroupEnd(sourceGroup: EditorGroupId, targetGroup: EditorGroupId, tab: EditorTab) {
    setEditorGroupTabs((current) => ({
      ...current,
      [sourceGroup]: current[sourceGroup].filter((item) => item.path !== tab.path || item.rootId !== tab.rootId),
      [targetGroup]: upsertEditorTab(current[targetGroup], tab),
    }));
    selectEditorTab(targetGroup, tab);
  }

  function splitEditor(mode: Exclude<EditorSplitMode, "single">) {
    if (layoutLocked) return;
    const nextSecondaryPath = secondaryPath ?? activePath;
    const nextSecondaryRootId = secondaryPathRootId || activePathRootId || rootId;
    setEditorSplitMode(mode);
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    setSecondaryPath(nextSecondaryPath);
    setSecondaryPathRootId(nextSecondaryRootId);
    if (nextSecondaryPath && nextSecondaryRootId) {
      setEditorGroupTabs((current) => ({
        ...current,
        secondary: upsertEditorTab(current.secondary, { path: nextSecondaryPath, rootId: nextSecondaryRootId }),
      }));
    }
    focusEditorGroup("secondary");
  }

  function swapEditorGroups() {
    if (layoutLocked) return;
    if (editorSplitMode === "single") return;
    const nextPrimaryPath = secondaryPath ?? activePath;
    const nextPrimaryRootId = secondaryPathRootId || activePathRootId || rootId;
    setSecondaryPath(activePath);
    setSecondaryPathRootId(activePathRootId || rootId);
    setActivePath(nextPrimaryPath);
    setActivePathRootId(nextPrimaryRootId);
    setEditorGroupTabs((current) => ({ primary: current.secondary, secondary: current.primary }));
    setActiveEditorGroup((group) => (group === "primary" ? "secondary" : "primary"));
  }

  function moveActiveEditorFileToOtherGroup() {
    if (layoutLocked) return;
    const tab = activeEditorTab();
    if (!tab) return;
    const sourceGroup = activeEditorGroupId();
    const targetGroup: EditorGroupId = sourceGroup === "primary" ? "secondary" : "primary";
    if (editorSplitMode === "single") {
      setEditorSplitMode("vertical");
      setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    }
    setEditorGroupTabs((current) => {
      const nextSourceTabs = current[sourceGroup].filter((item) => item.path !== tab.path || item.rootId !== tab.rootId);
      return {
        ...current,
        [sourceGroup]: nextSourceTabs,
        [targetGroup]: upsertEditorTab(current[targetGroup], tab),
      };
    });
    const fallbackSourceTab = editorGroupTabs[sourceGroup].filter((item) => item.path !== tab.path || item.rootId !== tab.rootId).at(-1);
    if (sourceGroup === "primary") {
      setActivePath(fallbackSourceTab?.path);
      setActivePathRootId(fallbackSourceTab?.rootId ?? "");
      setSecondaryPath(tab.path);
      setSecondaryPathRootId(tab.rootId);
    } else {
      setSecondaryPath(fallbackSourceTab?.path);
      setSecondaryPathRootId(fallbackSourceTab?.rootId ?? "");
      setActivePath(tab.path);
      setActivePathRootId(tab.rootId);
    }
    focusEditorGroup(targetGroup);
  }

  function setDockSplitMode(placement: PanePlacement, mode: DockSplitMode) {
    if (layoutLocked) return;
    setDockSplitModes((current) => ({ ...current, [placement]: mode }));
    if (mode !== "single") {
      setDockSplitRatios((current) => ({ ...current, [placement]: current[placement] ?? DEFAULT_DOCK_SPLIT_RATIOS[placement] }));
    }
  }

  function selectDockPane(placement: PanePlacement, role: DockPaneRole, paneId: PaneId) {
    const oppositeRole: DockPaneRole = role === "primary" ? "secondary" : "primary";
    setDockPaneSelections((current) => {
      const currentSelection = current[placement];
      const nextSelection = {
        ...currentSelection,
        [role]: paneId,
      };
      if (nextSelection[oppositeRole] === paneId) {
        const previousRolePane = currentSelection[role];
        nextSelection[oppositeRole] = previousRolePane && previousRolePane !== paneId
          ? previousRolePane
          : secondaryDockPane(dockPaneIdsForPlacement(placement), paneId);
      }
      return {
        ...current,
        [placement]: nextSelection,
      };
    });
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

  function canFocusOppositeDockGroup(placement = activeDockFocus?.placement, role = activeDockFocus?.role) {
    if (!placement || !role || dockSplitModes[placement] === "single") return false;
    return Boolean(activeDockPaneForPlacement(placement, role === "primary" ? "secondary" : "primary"));
  }

  function focusOppositeDockGroup(placement = activeDockFocus?.placement, role = activeDockFocus?.role) {
    if (!placement || !role || dockSplitModes[placement] === "single") return;
    const nextRole: DockPaneRole = role === "primary" ? "secondary" : "primary";
    const nextPane = activeDockPaneForPlacement(placement, nextRole);
    if (!nextPane) return;
    focusDockPane(placement, nextRole, nextPane);
  }

  function canMoveActiveDockPaneToOppositeGroup() {
    return Boolean(activeDockFocus && dockSplitModes[activeDockFocus.placement] !== "single");
  }

  function moveActiveDockPaneToOppositeGroup() {
    if (layoutLocked) return;
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

  function workbenchPaneNavigationItems(): Array<{ placement: PanePlacement; paneId: PaneId }> {
    return DOCK_PLACEMENTS.flatMap((placement) => dockPaneIdsForPlacement(placement).map((paneId) => ({ placement, paneId })));
  }

  function canNavigateWorkbenchPanes() {
    return workbenchPaneNavigationItems().length > 1;
  }

  function selectAdjacentWorkbenchPane(direction: "next" | "previous") {
    const items = workbenchPaneNavigationItems();
    if (items.length === 0) return;
    const currentPaneId = activeDockPaneId();
    const currentPlacement = activeDockFocus?.placement;
    const currentIndex = items.findIndex((item) => item.paneId === currentPaneId && item.placement === currentPlacement);
    const fallbackIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = direction === "next" ? (fallbackIndex + 1) % items.length : (fallbackIndex - 1 + items.length) % items.length;
    const next = items[nextIndex];
    selectDockPane(next.placement, "primary", next.paneId);
    focusIdeRegion(next.placement);
  }

  function canReorderActiveDockPane(direction: "next" | "previous") {
    if (!activeDockFocus) return false;
    const paneIds = dockPaneIdsForPlacement(activeDockFocus.placement);
    const paneId = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    const index = paneIds.indexOf(paneId);
    if (index < 0) return false;
    return direction === "previous" ? index > 0 : index < paneIds.length - 1;
  }

  function reorderActiveDockPane(direction: "next" | "previous") {
    if (layoutLocked) return;
    if (!activeDockFocus || !canReorderActiveDockPane(direction)) return;
    const { placement, role } = activeDockFocus;
    const paneId = activeDockPaneForPlacement(placement, role) ?? activeDockFocus.paneId;
    setPaneOrder((current) => reorderPaneWithinPlacement(current, paneId, placement, direction));
    openDockPlacement(placement);
    focusDockPane(placement, role, paneId);
  }

  function canSwapDockSplit(placement: PanePlacement) {
    return dockSplitModes[placement] !== "single" && Boolean(activeDockPaneForPlacement(placement, "primary") && activeDockPaneForPlacement(placement, "secondary"));
  }

  function swapDockSplitPanes(placement: PanePlacement) {
    if (layoutLocked) return;
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

  function mergeDockSplitGroups(placement: PanePlacement, preferredRole: DockPaneRole = "primary") {
    if (layoutLocked) return;
    const primaryPane = activeDockPaneForPlacement(placement, "primary");
    const secondaryPane = activeDockPaneForPlacement(placement, "secondary");
    const mergedPane = preferredRole === "secondary" ? secondaryPane ?? primaryPane : primaryPane ?? secondaryPane;
    setDockSplitMode(placement, "single");
    if (!mergedPane) return;
    setDockPaneSelections((current) => ({
      ...current,
      [placement]: {
        ...current[placement],
        primary: mergedPane,
        secondary: mergedPane === secondaryPane ? primaryPane : secondaryPane,
      },
    }));
    setPrimaryDockPanel(placement, mergedPane);
    openDockPlacement(placement);
    focusDockPane(placement, "primary", mergedPane);
  }

  function resetDockSplitRatio(placement: PanePlacement) {
    if (layoutLocked) return;
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: DEFAULT_DOCK_SPLIT_RATIOS[placement],
    }));
  }

  function setDockSplitRatioPreset(placement: PanePlacement, ratio: SplitRatioPreset) {
    if (layoutLocked) return;
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: ratio,
    }));
  }

  function setEditorSplitRatioPreset(ratio: SplitRatioPreset) {
    if (layoutLocked) return;
    if (editorSplitMode === "single") splitEditor("vertical");
    setEditorSplitRatio(ratio);
  }

  function setEditorSplitRatioFromManager(ratio: number) {
    if (layoutLocked) return;
    if (editorSplitMode === "single") splitEditor("vertical");
    setEditorSplitRatio(clamp(ratio, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max));
  }

  function resizeEditorSplitFromManager(delta: number) {
    if (layoutLocked) return;
    if (editorSplitMode === "single") splitEditor("vertical");
    setEditorSplitRatio((current) => clamp(current + delta, EDITOR_SPLIT_RATIO_LIMITS.min, EDITOR_SPLIT_RATIO_LIMITS.max));
  }

  function resizeDockSplitGroup(placement: PanePlacement, role: DockPaneRole, direction: "grow" | "shrink") {
    if (layoutLocked) return;
    const signedStep = direction === "grow" ? 5 : -5;
    const roleStep = role === "primary" ? signedStep : -signedStep;
    setDockSplitRatios((current) => ({
      ...current,
      [placement]: clamp(current[placement] + roleStep, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max),
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
    if (layoutLocked) return;
    if (placement === "top") setTopOpen(false);
    if (placement === "left") setLeftOpen(false);
    if (placement === "right") setRightOpen(false);
    if (placement === "bottom") setBottomOpen(false);
    setActiveDockFocus((current) => (current?.placement === placement ? null : current));
    setMaximizedPane((current) => (current === placement ? null : current));
    if (mobilePanel === placement) setMobilePanel("editor");
  }

  function closeEditorSplit() {
    mergeEditorSplitToGroup("primary");
  }

  function mergeEditorSplitToGroup(preferredGroup: EditorGroupId) {
    if (layoutLocked) return;
    const fallbackPrimaryTab = activePath ? null : editorGroupTabs.secondary.at(-1);
    const fallbackSecondaryTab = secondaryPath ? null : editorGroupTabs.primary.at(-1);
    setEditorGroupTabs((current) => ({
      primary: preferredGroup === "secondary" ? mergeEditorTabs(current.secondary, current.primary) : mergeEditorTabs(current.primary, current.secondary),
      secondary: [],
    }));
    if (preferredGroup === "secondary") {
      const nextPrimaryTab = secondaryPath
        ? { path: secondaryPath, rootId: secondaryPathRootId || activePathRootId || rootId }
        : fallbackSecondaryTab;
      setActivePath(nextPrimaryTab?.path);
      setActivePathRootId(nextPrimaryTab?.rootId ?? "");
    } else if (fallbackPrimaryTab) {
      setActivePath(fallbackPrimaryTab.path);
      setActivePathRootId(fallbackPrimaryTab.rootId);
    }
    setSecondaryPath(undefined);
    setSecondaryPathRootId("");
    setEditorSplitMode("single");
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    focusEditorGroup("primary");
  }

  function toggleMaximizedPane(pane: NonNullable<MaximizedPane>) {
    if (layoutLocked) return;
    setMaximizedPane((current) => (current === pane ? null : pane));
  }

  function isPanePinned(paneId: PaneId) {
    return pinnedPanes.includes(paneId);
  }

  function pinPane(paneId: PaneId) {
    setPinnedPanes((current) => (current.includes(paneId) ? current : [...current, paneId]));
  }

  function unpinPane(paneId: PaneId) {
    setPinnedPanes((current) => current.filter((pinnedPane) => pinnedPane !== paneId));
  }

  function togglePanePinned(paneId: PaneId) {
    setPinnedPanes((current) => (current.includes(paneId) ? current.filter((pinnedPane) => pinnedPane !== paneId) : [...current, paneId]));
  }

  function activeDockPaneId() {
    if (!activeDockFocus) return undefined;
    return activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
  }

  function toggleActiveDockPanePinned() {
    const paneId = activeDockPaneId();
    if (!paneId) return;
    togglePanePinned(paneId);
  }

  function pinActiveDockPane() {
    const paneId = activeDockPaneId();
    if (!paneId) return;
    pinPane(paneId);
  }

  function unpinActiveDockPane() {
    const paneId = activeDockPaneId();
    if (!paneId) return;
    unpinPane(paneId);
  }

  function hidePane(paneId: PaneId) {
    if (layoutLocked || isPanePinned(paneId)) return;
    setHiddenPanes((current) => (current.includes(paneId) ? current : [...current, paneId]));
    setActiveDockFocus((current) => (current?.paneId === paneId ? null : current));
  }

  function hideActiveDockPane() {
    if (layoutLocked || !activeDockFocus) return;
    hidePane(activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId);
  }

  function restoreAllHiddenPanes() {
    if (layoutLocked) return;
    const panesToRestore = hiddenPanes;
    setHiddenPanes([]);
    for (const paneId of panesToRestore) {
      movePaneToPlacement(paneId, panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement);
    }
  }

  function hiddenPanesForPlacement(placement: PanePlacement) {
    return hiddenPanes.filter((paneId) => (panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement) === placement);
  }

  function restoreHiddenPanesForPlacement(placement: PanePlacement) {
    if (layoutLocked) return;
    const panesToRestore = hiddenPanesForPlacement(placement);
    if (panesToRestore.length === 0) return;
    const restoreSet = new Set(panesToRestore);
    setHiddenPanes((current) => current.filter((paneId) => !restoreSet.has(paneId)));
    for (const paneId of panesToRestore) {
      movePaneToPlacement(paneId, panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement);
    }
  }

  function restorePane(paneId: PaneId) {
    if (layoutLocked) return;
    setHiddenPanes((current) => current.filter((hiddenPane) => hiddenPane !== paneId));
    movePaneToPlacement(paneId, panePlacements[paneId] ?? paneDescriptor(paneId).defaultPlacement);
  }

  function moveActiveDockPaneToPlacement(placement: PanePlacement) {
    if (layoutLocked) return;
    if (!activeDockFocus) return;
    const paneId = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    movePaneToPlacement(paneId, placement);
  }

  function moveActiveDockPaneToPlacementGroup(placement: PanePlacement, role: DockPaneRole) {
    if (layoutLocked) return;
    if (!activeDockFocus) return;
    const paneId = activeDockPaneForPlacement(activeDockFocus.placement, activeDockFocus.role) ?? activeDockFocus.paneId;
    if (role === "secondary" && dockSplitModes[placement] === "single") {
      setDockSplitMode(placement, placement === "top" || placement === "bottom" ? "horizontal" : "vertical");
    }
    movePaneToPlacement(paneId, placement, undefined, role);
  }

  function movePaneToPlacement(paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role: DockPaneRole = "primary") {
    if (layoutLocked || isPanePinned(paneId)) return;
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
    if (layoutLocked || isPanePinned(paneId)) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tracevane-pane", paneId);
    event.dataTransfer.setData("text/plain", paneLabel(paneId));
    setDraggingPane(paneId);
  }

  function clearPaneDragState() {
    setDraggingPane(null);
    setDropTarget(null);
    setEdgeDropTarget(null);
  }

  function dragPaneOverDock(placement: PanePlacement, event: React.DragEvent) {
    if (layoutLocked) return;
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
    if (layoutLocked) return;
    event.preventDefault();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId)) {
      movePaneToPlacement(paneId, placement, beforePaneId, role);
    }
    clearPaneDragState();
  }

  function dropPaneOnDockGroup(placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) {
    if (layoutLocked) return;
    event.preventDefault();
    event.stopPropagation();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId)) {
      movePaneToPlacement(paneId, placement, undefined, role);
    }
    clearPaneDragState();
  }

  function dragPaneOverDockEdge(placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) {
    if (layoutLocked) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropTarget(placement);
    setEdgeDropTarget({ placement, edge });
  }

  function leavePaneDockEdge(placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) {
    const nextTarget = event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (nextTarget && event.currentTarget.contains(nextTarget)) return;
    setEdgeDropTarget((current) => (current?.placement === placement && current.edge === edge ? null : current));
  }

  function dropPaneOnDockEdge(placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) {
    if (layoutLocked) return;
    event.preventDefault();
    event.stopPropagation();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId)) {
      const nextSplitMode: DockSplitMode = edge === "left" || edge === "right" ? "vertical" : "horizontal";
      const nextRole: DockPaneRole = edge === "right" || edge === "bottom" ? "secondary" : "primary";
      setDockSplitMode(placement, nextSplitMode);
      movePaneToPlacement(paneId, placement, undefined, nextRole);
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
      data-ide-edge-drop-target={edgeDropTarget ? `${edgeDropTarget.placement}:${edgeDropTarget.edge}` : ""}
      data-ide-mobile-panel={mobilePanel}
      data-ide-layout-locked={layoutLocked ? "true" : "false"}
      data-ide-layout-history={`${layoutHistoryPast.length}:${layoutHistoryFuture.length}`}
      data-ide-pinned-panes={pinnedPanes.join("|")}
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
        <div className="workspace-ide-shell__layout-presets" aria-label="IDE 工作台组合预案" data-ide-workbench-recipes>
          {WORKBENCH_LAYOUT_RECIPES.map((recipe) => (
            <button key={recipe.id} type="button" onClick={() => applyWorkbenchRecipe(recipe.id)} title={recipe.description} data-ide-workbench-recipe={recipe.id}>
              {recipe.label}
            </button>
          ))}
        </div>
        <div className="workspace-ide-shell__layout-snapshots" aria-label="IDE 布局快照">
          <button type="button" onClick={saveLayoutSnapshot} data-ide-layout-snapshot-save>保存布局</button>
          <button type="button" onClick={exportLayoutSnapshots} disabled={layoutSnapshots.length === 0} data-ide-layout-snapshot-export>导出</button>
          <button type="button" onClick={importLayoutSnapshots} data-ide-layout-snapshot-import>导入</button>
          {layoutSnapshots.slice(0, 3).map((snapshot) => (
            <span key={snapshot.id} className="workspace-ide-shell__layout-snapshot" data-ide-layout-snapshot={snapshot.id}>
              <button type="button" onClick={() => restoreLayoutSnapshot(snapshot)} title={`恢复 ${snapshot.name}`}>
                {snapshot.name}
              </button>
              <button type="button" aria-label={`用当前布局覆盖快照 ${snapshot.name}`} onClick={() => updateLayoutSnapshot(snapshot.id)} data-ide-layout-snapshot-update={snapshot.id}>
                ↻
              </button>
              <button type="button" aria-label={`重命名布局快照 ${snapshot.name}`} onClick={() => renameLayoutSnapshot(snapshot.id)} data-ide-layout-snapshot-rename={snapshot.id}>
                ✎
              </button>
              <button type="button" aria-label={`删除布局快照 ${snapshot.name}`} onClick={() => deleteLayoutSnapshot(snapshot.id)}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="workspace-ide-shell__layout-snapshots" aria-label="IDE Dock 组合快照">
          {DOCK_PLACEMENTS.map((placement) => (
            <button key={placement} type="button" onClick={() => saveDockSnapshot(placement)} data-ide-dock-snapshot-save={placement}>
              保存{placementLabel(placement)}Dock
            </button>
          ))}
          {dockSnapshots.slice(0, 4).map((snapshot) => (
            <span key={snapshot.id} className="workspace-ide-shell__layout-snapshot" data-ide-dock-snapshot={snapshot.id} data-ide-dock-snapshot-placement={snapshot.placement}>
              <button type="button" onClick={() => restoreDockSnapshot(snapshot)} title={`恢复 ${snapshot.name}`}>
                {placementShortLabel(snapshot.placement)} · {snapshot.name}
              </button>
              <button type="button" aria-label={`用当前${placementLabel(snapshot.placement)} Dock 覆盖组合 ${snapshot.name}`} onClick={() => updateDockSnapshot(snapshot.id)} data-ide-dock-snapshot-update={snapshot.id}>
                ↻
              </button>
              <button type="button" aria-label={`删除${placementLabel(snapshot.placement)} Dock 组合 ${snapshot.name}`} onClick={() => deleteDockSnapshot(snapshot.id)} data-ide-dock-snapshot-delete={snapshot.id}>
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="workspace-ide-shell__layout-snapshots" aria-label="IDE 编辑器组快照">
          <button type="button" onClick={saveEditorGroupSnapshot} data-ide-editor-group-snapshot-save>保存编辑器组</button>
          {editorGroupSnapshots.slice(0, 4).map((snapshot) => (
            <span key={snapshot.id} className="workspace-ide-shell__layout-snapshot" data-ide-editor-group-snapshot={snapshot.id}>
              <button type="button" onClick={() => restoreEditorGroupSnapshot(snapshot)} title={`恢复 ${snapshot.name}`}>
                {snapshot.editorSplitMode} · {snapshot.name}
              </button>
              <button type="button" aria-label={`用当前编辑器组覆盖布局 ${snapshot.name}`} onClick={() => updateEditorGroupSnapshot(snapshot.id)} data-ide-editor-group-snapshot-update={snapshot.id}>
                ↻
              </button>
              <button type="button" aria-label={`删除编辑器组布局 ${snapshot.name}`} onClick={() => deleteEditorGroupSnapshot(snapshot.id)} data-ide-editor-group-snapshot-delete={snapshot.id}>
                ×
              </button>
            </span>
          ))}
        </div>
        <EditorLayoutManager
          editorSplitMode={editorSplitMode}
          editorSplitRatio={editorSplitRatio}
          editorGroupTabs={editorGroupTabs}
          activeEditorGroup={activeEditorGroup}
          maximizedPane={maximizedPane}
          layoutLocked={layoutLocked}
          editorGroupSnapshots={editorGroupSnapshots}
          editorGroupSnapshotCount={editorGroupSnapshots.length}
          onSplitEditor={splitEditor}
          onSetEditorSplitRatioPreset={setEditorSplitRatioPreset}
          onSetEditorSplitRatio={setEditorSplitRatioFromManager}
          onResizeEditorSplit={resizeEditorSplitFromManager}
          onSelectEditorTab={selectEditorTab}
          onMoveEditorTabToGroup={moveEditorTabToGroupEnd}
          onReorderEditorTab={reorderEditorTab}
          onClearEditorGroup={clearEditorGroupTabs}
          onDuplicateEditorGroup={duplicateEditorGroupTabs}
          onCloseEditorTab={closeEditorTab}
          onFocusEditorGroup={focusEditorGroup}
          onSwapEditorGroups={swapEditorGroups}
          onMergeEditorGroups={mergeEditorSplitToGroup}
          onSaveEditorGroupSnapshot={saveEditorGroupSnapshot}
          onRestoreEditorGroupSnapshot={restoreEditorGroupSnapshot}
          onUpdateEditorGroupSnapshot={updateEditorGroupSnapshot}
          onDeleteEditorGroupSnapshot={deleteEditorGroupSnapshot}
          onFocusEditorOnly={focusEditorOnlyLayout}
          onToggleCenterMaximized={() => toggleMaximizedPane("center")}
        />
        <DockLayoutManager
          panesByPlacement={panesByPlacement}
          open={{ top: topOpen, left: leftOpen, right: rightOpen, bottom: bottomOpen }}
          splitModes={dockSplitModes}
          splitRatios={dockSplitRatios}
          dockPaneSelections={dockPaneSelections}
          pinnedPanes={pinnedPanes}
          paneSizes={paneSizes}
          maximizedPane={maximizedPane}
          mobilePanel={mobilePanel}
          hiddenPanes={hiddenPanes}
          hiddenPanesByPlacement={{ top: hiddenPanesForPlacement("top"), left: hiddenPanesForPlacement("left"), right: hiddenPanesForPlacement("right"), bottom: hiddenPanesForPlacement("bottom") }}
          layoutLocked={layoutLocked}
          layoutSnapshotCount={layoutSnapshots.length}
          layoutHistoryCounts={{ past: layoutHistoryPast.length, future: layoutHistoryFuture.length }}
          canUndoLayout={layoutHistoryPast.length > 0}
          canRedoLayout={layoutHistoryFuture.length > 0}
          hasLayoutSnapshots={layoutSnapshots.length > 0}
          layoutSnapshots={layoutSnapshots}
          dockSnapshots={dockSnapshots}
          onRestoreLayoutSnapshot={restoreLayoutSnapshot}
          onUpdateLayoutSnapshot={updateLayoutSnapshot}
          onRenameLayoutSnapshot={renameLayoutSnapshot}
          onDeleteLayoutSnapshot={deleteLayoutSnapshot}
          onSaveDockSnapshot={saveDockSnapshot}
          onRestoreDockSnapshot={restoreDockSnapshot}
          onUpdateDockSnapshot={updateDockSnapshot}
          onDeleteDockSnapshot={deleteDockSnapshot}
          onUndoLayout={undoIdeLayoutChange}
          onRedoLayout={redoIdeLayoutChange}
          onSaveLayoutSnapshot={saveLayoutSnapshot}
          onRestoreLatestLayoutSnapshot={restoreLatestLayoutSnapshot}
          onApplyWorkbenchRecipe={applyWorkbenchRecipe}
          onOpenAllDocks={openAllDocks}
          onFocusEditorOnly={focusEditorOnlyLayout}
          onToggleLayoutLock={() => setLayoutLocked((locked) => !locked)}
          onShowMobilePanel={showMobilePanel}
          onHidePane={hidePane}
          onRestorePane={restorePane}
          onRestoreAllHiddenPanes={restoreAllHiddenPanes}
          onRestoreHiddenPanesForPlacement={restoreHiddenPanesForPlacement}
          onToggleDockOpen={(placement) => setDockOpen(placement, !isDockOpen(placement))}
          onIsolateDock={isolateDockPlacement}
          onRestoreDock={restoreDockPlacement}
          onSetDockSplitMode={setDockSplitMode}
          onResizeDock={resizeDockPlacement}
          onSetDockSize={setDockPlacementSize}
          onSetDockSizePreset={setDockPlacementSizePreset}
          onSetSplitRatioPreset={setDockSplitRatioPreset}
          onMovePaneToGroup={movePaneToPlacement}
          onSwapDockGroups={swapDockSplitPanes}
          onMergeDockGroups={mergeDockSplitGroups}
          onResetDockComposition={resetDockComposition}
          onToggleMaximizedDock={toggleMaximizedPane}
          onFocusRegion={focusIdeRegion}
        />
        <div className="workspace-ide-shell__top-actions">
          <Button size="sm" variant={layoutLocked ? "outline" : "ghost"} onClick={() => setLayoutLocked((locked) => !locked)} data-ide-layout-lock-toggle>
            <Settings2 className="mr-2 h-4 w-4" />{layoutLocked ? "已锁" : "锁定"}
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutHistoryPast.length === 0} onClick={undoIdeLayoutChange} data-ide-layout-history-undo>
            <RotateCcw className="mr-2 h-4 w-4" />撤销布局
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutHistoryFuture.length === 0} onClick={redoIdeLayoutChange} data-ide-layout-history-redo>
            <RotateCw className="mr-2 h-4 w-4" />重做布局
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutLocked} onClick={() => setTopOpen((value) => !value)}>
            <PanelBottom className="mr-2 h-4 w-4 rotate-180" />顶部
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutLocked} onClick={() => setLeftOpen((value) => !value)}>
            <PanelLeft className="mr-2 h-4 w-4" />左栏
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutLocked} onClick={() => setBottomOpen((value) => !value)}>
            <PanelBottom className="mr-2 h-4 w-4" />终端
          </Button>
          <Button size="sm" variant="ghost" disabled={layoutLocked} onClick={() => setRightOpen((value) => !value)}>
            <PanelRight className="mr-2 h-4 w-4" />插件
          </Button>
        </div>
        <div className="workspace-ide-shell__mobile-switcher" aria-label="手机工作区面板切换" data-ide-mobile-panel-order={MOBILE_PANEL_ORDER.join("|")}>
          <button type="button" aria-label="上一个手机 IDE 面板" onClick={() => cycleMobilePanel("previous")} data-ide-mobile-panel-cycle="previous">‹</button>
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
          <button type="button" aria-label="下一个手机 IDE 面板" onClick={() => cycleMobilePanel("next")} data-ide-mobile-panel-cycle="next">›</button>
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
                  onMergeDockGroups={mergeDockSplitGroups}
                  onFocusOtherGroup={focusOppositeDockGroup}
                  canFocusOtherGroup={canFocusOppositeDockGroup("left", activeDockFocus?.placement === "left" ? activeDockFocus.role : "primary")}
                  onBeginDrag={beginPaneDrag}
                  onEndDrag={clearPaneDragState}
                  onHidePane={hidePane}
                  pinnedPanes={pinnedPanes}
                  onTogglePanePinned={togglePanePinned}
                  onCloseDock={() => setLeftOpen(false)}
                />
                <DockPaneFrame
                  placement="left"
                  paneIds={leftPaneIds}
                  splitMode={dockSplitModes.left}
                  splitRatio={dockSplitRatios.left}
                  primaryPane={activeLeftPane}
                  secondaryPane={secondaryLeftPane}
                  activeFocus={activeDockFocus}
                  workspaceDirectory={workspaceDirectory}
                  onTerminalCommandsChange={setTerminalCommands}
                  onRestore={resetPanePlacements}
                  onRestoreHidden={() => restoreHiddenPanesForPlacement("left")}
                  hiddenRestoreCount={hiddenPanesForPlacement("left").length}
                  onStartSplitResize={startDockSplitResize}
                  onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                  onFocusPane={focusDockPane}
                  onHidePane={hidePane}
                  isMaximized={maximizedPane === "left"}
                  onFocusOtherGroup={focusOppositeDockGroup}
                  onToggleMaximized={toggleMaximizedPane}
                  onCloseDock={closeDockPlacement}
                  onResetSplitRatio={resetDockSplitRatio}
                  onResizeSplitGroup={resizeDockSplitGroup}
                  onSetSplitRatioPreset={setDockSplitRatioPreset}
                  onMovePaneToGroup={movePaneToPlacement}
                  onSwapGroups={swapDockSplitPanes}
                  onMergeGroups={mergeDockSplitGroups}
                  onDropPaneOnGroup={dropPaneOnDockGroup}
                  edgeDropTarget={edgeDropTarget}
                  onDragPaneOverEdge={dragPaneOverDockEdge}
                  onLeavePaneEdge={leavePaneDockEdge}
                  onDropPaneOnEdge={dropPaneOnDockEdge}
                  onBeginDrag={beginPaneDrag}
                  onEndDrag={clearPaneDragState}
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
              <EmptyDockPane placement="left" hiddenRestoreCount={hiddenPanesForPlacement("left").length} onRestoreHidden={() => restoreHiddenPanesForPlacement("left")} onRestore={resetPanePlacements} />
            )}
          </section>
        ) : null}
        {!leftOpen ? (
          <CollapsedDockDropTarget
            placement="left"
            paneCount={leftPaneIds.length}
            active={dropTarget === "left"}
            onOpen={openDockPlacement}
            onDragOver={dragPaneOverDock}
            onDragLeave={leavePaneDock}
            onDrop={dropPaneOnDock}
          />
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
          className={cn("workspace-ide-shell__center", !topOpen && "workspace-ide-shell__center--top-closed", !bottomOpen && "workspace-ide-shell__center--bottom-closed")}
          data-testid="workspace-ide-center-pane"
          data-ide-focus-region="center"
          data-ide-pane="center"
          tabIndex={-1}
        >
          {!topOpen ? (
            <CollapsedDockDropTarget
              placement="top"
              paneCount={topPaneIds.length}
              active={dropTarget === "top"}
              onOpen={openDockPlacement}
              onDragOver={dragPaneOverDock}
              onDragLeave={leavePaneDock}
              onDrop={dropPaneOnDock}
            />
          ) : null}
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
                      onMergeDockGroups={mergeDockSplitGroups}
                      onFocusOtherGroup={focusOppositeDockGroup}
                      canFocusOtherGroup={canFocusOppositeDockGroup("top", activeDockFocus?.placement === "top" ? activeDockFocus.role : "primary")}
                      onBeginDrag={beginPaneDrag}
                      onEndDrag={clearPaneDragState}
                      onHidePane={hidePane}
                      pinnedPanes={pinnedPanes}
                      onTogglePanePinned={togglePanePinned}
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
                paneIds={topPaneIds}
                splitMode={dockSplitModes.top}
                splitRatio={dockSplitRatios.top}
                primaryPane={activeTopPane}
                secondaryPane={secondaryTopPane}
                activeFocus={activeDockFocus}
                workspaceDirectory={workspaceDirectory}
                onTerminalCommandsChange={setTerminalCommands}
                onRestore={resetPanePlacements}
                onRestoreHidden={() => restoreHiddenPanesForPlacement("top")}
                hiddenRestoreCount={hiddenPanesForPlacement("top").length}
                onStartSplitResize={startDockSplitResize}
                onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                onFocusPane={focusDockPane}
                onHidePane={hidePane}
                isMaximized={maximizedPane === "top"}
                onFocusOtherGroup={focusOppositeDockGroup}
                onToggleMaximized={toggleMaximizedPane}
                onCloseDock={closeDockPlacement}
                onResetSplitRatio={resetDockSplitRatio}
                onResizeSplitGroup={resizeDockSplitGroup}
                onSetSplitRatioPreset={setDockSplitRatioPreset}
                onMovePaneToGroup={movePaneToPlacement}
                onSwapGroups={swapDockSplitPanes}
                onMergeGroups={mergeDockSplitGroups}
                onDropPaneOnGroup={dropPaneOnDockGroup}
                edgeDropTarget={edgeDropTarget}
                onDragPaneOverEdge={dragPaneOverDockEdge}
                onLeavePaneEdge={leavePaneDockEdge}
                onDropPaneOnEdge={dropPaneOnDockEdge}
                onBeginDrag={beginPaneDrag}
                onEndDrag={clearPaneDragState}
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
              tabs={editorGroupTabs.primary}
              splitMode={editorSplitMode}
              onSelectTab={selectEditorTab}
              onCloseTab={closeEditorTab}
              onBeginTabDrag={beginEditorTabDrag}
              onDropTabBefore={dropEditorTabBefore}
              onDropTabAtEnd={dropEditorTabAtEnd}
              onFocus={() => focusEditorGroup("primary")}
                  onSplitRight={() => splitEditor("vertical")}
                  onSplitDown={() => splitEditor("horizontal")}
                  onSwapGroups={swapEditorGroups}
                  onMergeToPrimary={closeEditorSplit}
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
                  onDoubleClick={() => setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO)}
                />
                <SplitRatioPresetStrip
                  label="编辑器拆分比例预设"
                  value={editorSplitRatio}
                  onSelect={setEditorSplitRatioPreset}
                  dataAttribute="editor"
                />
                <EditorGroupFrame
                  group="secondary"
                  title="副编辑器组"
                  active={activeEditorGroup === "secondary"}
                  filePath={secondaryPath ?? activePath}
                  tabs={editorGroupTabs.secondary}
                  splitMode={editorSplitMode}
                  onSelectTab={selectEditorTab}
                  onCloseTab={closeEditorTab}
                  onBeginTabDrag={beginEditorTabDrag}
                  onDropTabBefore={dropEditorTabBefore}
                  onDropTabAtEnd={dropEditorTabAtEnd}
                  onFocus={() => focusEditorGroup("secondary")}
                  onSplitRight={() => splitEditor("vertical")}
                  onSplitDown={() => splitEditor("horizontal")}
                  onSwapGroups={swapEditorGroups}
                  onMergeToPrimary={closeEditorSplit}
                  onMergeToSecondary={() => mergeEditorSplitToGroup("secondary")}
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
                      const nextRootId = tabRootId || secondaryPathRootId || activePathRootId || rootId;
                      setSecondaryPath(path);
                      if (tabRootId) setSecondaryPathRootId(tabRootId);
                      rememberEditorTab("secondary", path, nextRootId);
                    }}
                  />
                </EditorGroupFrame>
              </>
            ) : null}
          </div>
          {!bottomOpen ? (
            <CollapsedDockDropTarget
              placement="bottom"
              paneCount={bottomPaneIds.length}
              active={dropTarget === "bottom"}
              onOpen={openDockPlacement}
              onDragOver={dragPaneOverDock}
              onDragLeave={leavePaneDock}
              onDrop={dropPaneOnDock}
            />
          ) : null}
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
                      onMergeDockGroups={mergeDockSplitGroups}
                      onFocusOtherGroup={focusOppositeDockGroup}
                      canFocusOtherGroup={canFocusOppositeDockGroup("bottom", activeDockFocus?.placement === "bottom" ? activeDockFocus.role : "primary")}
                      onBeginDrag={beginPaneDrag}
                      onEndDrag={clearPaneDragState}
                      onHidePane={hidePane}
                      pinnedPanes={pinnedPanes}
                      onTogglePanePinned={togglePanePinned}
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
                paneIds={bottomPaneIds}
                splitMode={dockSplitModes.bottom}
                splitRatio={dockSplitRatios.bottom}
                primaryPane={activeBottomPane}
                secondaryPane={secondaryBottomPane}
                activeFocus={activeDockFocus}
                workspaceDirectory={workspaceDirectory}
                onTerminalCommandsChange={setTerminalCommands}
                onRestore={resetPanePlacements}
                onRestoreHidden={() => restoreHiddenPanesForPlacement("bottom")}
                hiddenRestoreCount={hiddenPanesForPlacement("bottom").length}
                onStartSplitResize={startDockSplitResize}
                onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
                onFocusPane={focusDockPane}
                onHidePane={hidePane}
                isMaximized={maximizedPane === "bottom"}
                onFocusOtherGroup={focusOppositeDockGroup}
                onToggleMaximized={toggleMaximizedPane}
                onCloseDock={closeDockPlacement}
                onResetSplitRatio={resetDockSplitRatio}
                onResizeSplitGroup={resizeDockSplitGroup}
                onSetSplitRatioPreset={setDockSplitRatioPreset}
                onMovePaneToGroup={movePaneToPlacement}
                onSwapGroups={swapDockSplitPanes}
                onMergeGroups={mergeDockSplitGroups}
                onDropPaneOnGroup={dropPaneOnDockGroup}
                edgeDropTarget={edgeDropTarget}
                onDragPaneOverEdge={dragPaneOverDockEdge}
                onLeavePaneEdge={leavePaneDockEdge}
                onDropPaneOnEdge={dropPaneOnDockEdge}
                onBeginDrag={beginPaneDrag}
                onEndDrag={clearPaneDragState}
              />
            </section>
          ) : null}
        </section>

        {!rightOpen ? (
          <CollapsedDockDropTarget
            placement="right"
            paneCount={rightPaneIds.length}
            active={dropTarget === "right"}
            onOpen={openDockPlacement}
            onDragOver={dragPaneOverDock}
            onDragLeave={leavePaneDock}
            onDrop={dropPaneOnDock}
          />
        ) : null}
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
                    onMergeDockGroups={mergeDockSplitGroups}
                    onFocusOtherGroup={focusOppositeDockGroup}
                    canFocusOtherGroup={canFocusOppositeDockGroup("right", activeDockFocus?.placement === "right" ? activeDockFocus.role : "primary")}
                    onBeginDrag={beginPaneDrag}
                    onEndDrag={clearPaneDragState}
                    onHidePane={hidePane}
                    pinnedPanes={pinnedPanes}
                    onTogglePanePinned={togglePanePinned}
                    onCloseDock={() => setRightOpen(false)}
                  />
                </div>
              ))}
            </div>
            <DockPaneFrame
              placement="right"
              paneIds={rightPaneIds}
              splitMode={dockSplitModes.right}
              splitRatio={dockSplitRatios.right}
              primaryPane={activeRightPane}
              secondaryPane={secondaryRightPane}
              activeFocus={activeDockFocus}
              workspaceDirectory={workspaceDirectory}
              onTerminalCommandsChange={setTerminalCommands}
              onRestore={resetPanePlacements}
              onRestoreHidden={() => restoreHiddenPanesForPlacement("right")}
              hiddenRestoreCount={hiddenPanesForPlacement("right").length}
              onStartSplitResize={startDockSplitResize}
              onResizeSplitFromKeyboard={resizeDockSplitFromKeyboard}
              onFocusPane={focusDockPane}
              onHidePane={hidePane}
              isMaximized={maximizedPane === "right"}
              onFocusOtherGroup={focusOppositeDockGroup}
              onToggleMaximized={toggleMaximizedPane}
              onCloseDock={closeDockPlacement}
              onResetSplitRatio={resetDockSplitRatio}
              onResizeSplitGroup={resizeDockSplitGroup}
              onSetSplitRatioPreset={setDockSplitRatioPreset}
              onMovePaneToGroup={movePaneToPlacement}
              onSwapGroups={swapDockSplitPanes}
              onMergeGroups={mergeDockSplitGroups}
              onDropPaneOnGroup={dropPaneOnDockGroup}
              edgeDropTarget={edgeDropTarget}
              onDragPaneOverEdge={dragPaneOverDockEdge}
              onLeavePaneEdge={leavePaneDockEdge}
              onDropPaneOnEdge={dropPaneOnDockEdge}
              onBeginDrag={beginPaneDrag}
              onEndDrag={clearPaneDragState}
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
        <span>布局锁: {layoutLocked ? "locked" : "open"}</span>
        <span>布局历史: {layoutHistoryPast.length}/{layoutHistoryFuture.length}</span>
        <span>固定 Pane: {pinnedPanes.length}</span>
        <span>快照: {layoutSnapshots.length}</span>
        <span>Dock组合: {dockSnapshots.length}</span>
        <span>编辑器组: {editorGroupSnapshots.length}</span>
        <span>移动面板: {mobilePanel} ({MOBILE_PANEL_ORDER.indexOf(mobilePanel) + 1}/{MOBILE_PANEL_ORDER.length})</span>
        <span>尺寸: {paneSizes.top}/{paneSizes.left}/{paneSizes.right}/{paneSizes.bottom}</span>
        <span>编辑器: {editorSplitMode}/{Math.round(editorSplitRatio)}%</span>
        <div className="workspace-ide-shell__dock-status-strip" aria-label="IDE Dock 布局状态">
          <DockStatusChip placement="top" open={topOpen} splitMode={dockSplitModes.top} ratio={dockSplitRatios.top} size={paneSizes.top} paneCount={topPaneIds.length} active={activeDockFocus?.placement === "top"} onOpen={focusIdeRegion} />
          <DockStatusChip placement="left" open={leftOpen} splitMode={dockSplitModes.left} ratio={dockSplitRatios.left} size={paneSizes.left} paneCount={leftPaneIds.length} active={activeDockFocus?.placement === "left"} onOpen={focusIdeRegion} />
          <DockStatusChip placement="right" open={rightOpen} splitMode={dockSplitModes.right} ratio={dockSplitRatios.right} size={paneSizes.right} paneCount={rightPaneIds.length} active={activeDockFocus?.placement === "right"} onOpen={focusIdeRegion} />
          <DockStatusChip placement="bottom" open={bottomOpen} splitMode={dockSplitModes.bottom} ratio={dockSplitRatios.bottom} size={paneSizes.bottom} paneCount={bottomPaneIds.length} active={activeDockFocus?.placement === "bottom"} onOpen={focusIdeRegion} />
        </div>
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

function DockStatusChip({
  placement,
  open,
  splitMode,
  ratio,
  size,
  paneCount,
  active,
  onOpen,
}: {
  placement: PanePlacement;
  open: boolean;
  splitMode: DockSplitMode;
  ratio: number;
  size: number;
  paneCount: number;
  active: boolean;
  onOpen: (placement: PanePlacement) => void;
}) {
  return (
    <button
      type="button"
      className={cn("workspace-ide-shell__dock-status-chip", active && "is-active")}
      data-ide-dock-status-chip={placement}
      data-ide-dock-status-open={open ? "true" : "false"}
      data-ide-dock-status-split={splitMode}
      aria-label={`${open ? "聚焦" : "打开"}${placementLabel(placement)} Dock：${paneCount} 个 Pane，${splitMode}，${Math.round(ratio)}%，${size}px`}
      onClick={() => onOpen(placement)}
    >
      <span>{placementShortLabel(placement)}</span>
      <span>{open ? "开" : "关"}</span>
      <span>{splitMode === "single" ? "单" : splitMode === "vertical" ? "左右" : "上下"}</span>
      <span>{Math.round(ratio)}%</span>
      <span>{paneCount}</span>
    </button>
  );
}

function CollapsedDockDropTarget({
  placement,
  paneCount,
  active,
  onOpen,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  placement: PanePlacement;
  paneCount: number;
  active: boolean;
  onOpen: (placement: PanePlacement) => void;
  onDragOver: (placement: PanePlacement, event: React.DragEvent) => void;
  onDragLeave: (placement: PanePlacement, event: React.DragEvent) => void;
  onDrop: (placement: PanePlacement, event: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      className={cn("workspace-ide-shell__collapsed-dock-target", active && "is-drop-target")}
      data-ide-collapsed-dock-target={placement}
      data-ide-dock-placement={placement}
      data-ide-collapsed-dock-pane-count={paneCount}
      aria-label={`恢复${placementLabel(placement)} Dock，或把 Pane 拖放到这里`}
      onClick={() => onOpen(placement)}
      onDragOver={(event) => onDragOver(placement, event)}
      onDragLeave={(event) => onDragLeave(placement, event)}
      onDrop={(event) => onDrop(placement, event)}
    >
      <Plus className="h-3.5 w-3.5" aria-hidden={true} />
      <span>{placementLabel(placement)} Dock</span>
      <span>{paneCount} Pane</span>
    </button>
  );
}

function EditorLayoutManager({
  editorSplitMode,
  editorSplitRatio,
  editorGroupTabs,
  activeEditorGroup,
  maximizedPane,
  layoutLocked,
  editorGroupSnapshots,
  editorGroupSnapshotCount,
  onSplitEditor,
  onSetEditorSplitRatioPreset,
  onSetEditorSplitRatio,
  onResizeEditorSplit,
  onSelectEditorTab,
  onMoveEditorTabToGroup,
  onReorderEditorTab,
  onClearEditorGroup,
  onDuplicateEditorGroup,
  onCloseEditorTab,
  onFocusEditorGroup,
  onSwapEditorGroups,
  onMergeEditorGroups,
  onSaveEditorGroupSnapshot,
  onRestoreEditorGroupSnapshot,
  onUpdateEditorGroupSnapshot,
  onDeleteEditorGroupSnapshot,
  onFocusEditorOnly,
  onToggleCenterMaximized,
}: {
  editorSplitMode: EditorSplitMode;
  editorSplitRatio: number;
  editorGroupTabs: EditorGroupTabs;
  activeEditorGroup: EditorGroupId;
  maximizedPane: MaximizedPane;
  layoutLocked: boolean;
  editorGroupSnapshots: IdeEditorGroupSnapshot[];
  editorGroupSnapshotCount: number;
  onSplitEditor: (mode: Exclude<EditorSplitMode, "single">) => void;
  onSetEditorSplitRatioPreset: (ratio: SplitRatioPreset) => void;
  onSetEditorSplitRatio: (ratio: number) => void;
  onResizeEditorSplit: (delta: number) => void;
  onSelectEditorTab: (group: EditorGroupId, tab: EditorTab) => void;
  onMoveEditorTabToGroup: (sourceGroup: EditorGroupId, targetGroup: EditorGroupId, tab: EditorTab) => void;
  onReorderEditorTab: (group: EditorGroupId, draggedTab: EditorTab, beforeTab: EditorTab) => void;
  onClearEditorGroup: (group: EditorGroupId) => void;
  onDuplicateEditorGroup: (sourceGroup: EditorGroupId, targetGroup: EditorGroupId) => void;
  onCloseEditorTab: (group: EditorGroupId, tab: EditorTab) => void;
  onFocusEditorGroup: (group: EditorGroupId) => void;
  onSwapEditorGroups: () => void;
  onMergeEditorGroups: (preferredGroup: EditorGroupId) => void;
  onSaveEditorGroupSnapshot: () => void;
  onRestoreEditorGroupSnapshot: (snapshot: IdeEditorGroupSnapshot) => void;
  onUpdateEditorGroupSnapshot: (snapshotId: string) => void;
  onDeleteEditorGroupSnapshot: (snapshotId: string) => void;
  onFocusEditorOnly: () => void;
  onToggleCenterMaximized: () => void;
}) {
  const splitActive = editorSplitMode !== "single";
  const primaryCount = editorGroupTabs.primary.length;
  const secondaryCount = editorGroupTabs.secondary.length;

  return (
    <section className="workspace-ide-shell__editor-layout-manager" aria-label="编辑器组布局管理器" data-ide-editor-layout-manager>
      <div className="workspace-ide-shell__editor-layout-manager-head">
        <span>Editor 布局管理器</span>
        <span data-ide-editor-layout-summary>
          {editorSplitMode === "single" ? "单组" : editorSplitMode === "vertical" ? "左右拆分" : "上下拆分"} · 主 {Math.round(editorSplitRatio)}% · 副 {100 - Math.round(editorSplitRatio)}% · 快照 {editorGroupSnapshotCount}
        </span>
        <button type="button" disabled={layoutLocked} onClick={onFocusEditorOnly} data-ide-editor-layout-focus-only>
          编辑器专注
        </button>
        <button type="button" disabled={layoutLocked} onClick={onToggleCenterMaximized} data-ide-editor-layout-maximize-center data-active={maximizedPane === "center" ? "true" : "false"} aria-pressed={maximizedPane === "center"}>
          {maximizedPane === "center" ? "退出最大化" : "最大化编辑器"}
        </button>
        <button type="button" disabled={layoutLocked} onClick={onSaveEditorGroupSnapshot} data-ide-editor-layout-save-snapshot>
          保存编辑器布局
        </button>
      </div>
      <div className="workspace-ide-shell__editor-layout-grid">
        {(["primary", "secondary"] as const).map((group) => {
          const tabs = editorGroupTabs[group];
          const targetGroup: EditorGroupId = group === "primary" ? "secondary" : "primary";
          return (
            <article key={group} className="workspace-ide-shell__editor-layout-card" data-ide-editor-layout-card={group} data-active={activeEditorGroup === group ? "true" : "false"}>
              <header>
                <button type="button" disabled={group === "secondary" && !splitActive} onClick={() => onFocusEditorGroup(group)} data-ide-editor-layout-focus={group}>
                  {group === "primary" ? "主编辑器组" : "副编辑器组"}
                </button>
                <span>{tabs.length} tabs</span>
              </header>
              {group === "primary" ? (
                <div className="workspace-ide-shell__editor-layout-group-actions">
                  <button type="button" disabled={layoutLocked} onClick={() => onSplitEditor("vertical")} data-ide-editor-layout-split-vertical>
                    右侧拆分
                  </button>
                  <button type="button" disabled={layoutLocked} onClick={() => onSplitEditor("horizontal")} data-ide-editor-layout-split-horizontal>
                    下方拆分
                  </button>
                </div>
              ) : (
                <div className="workspace-ide-shell__editor-layout-group-actions">
                  <button type="button" disabled={layoutLocked || !splitActive} onClick={onSwapEditorGroups} data-ide-editor-layout-swap-groups>
                    交换主副
                  </button>
                  <button type="button" disabled={layoutLocked || !splitActive} onClick={() => onMergeEditorGroups("primary")} data-ide-editor-layout-merge-primary>
                    合并到主组
                  </button>
                  <button type="button" disabled={layoutLocked || !splitActive} onClick={() => onMergeEditorGroups("secondary")} data-ide-editor-layout-merge-secondary>
                    合并到副组
                  </button>
                </div>
              )}
              <div className="workspace-ide-shell__editor-layout-bulk-actions" data-ide-editor-layout-bulk-actions={group}>
                <button type="button" disabled={layoutLocked || tabs.length === 0} onClick={() => onDuplicateEditorGroup(group, targetGroup)} data-ide-editor-layout-duplicate-group={group} data-ide-editor-layout-duplicate-target={targetGroup}>
                  复制到{targetGroup === "primary" ? "主组" : "副组"}
                </button>
                <button type="button" disabled={layoutLocked || tabs.length === 0} onClick={() => onClearEditorGroup(group)} data-ide-editor-layout-clear-group={group}>
                  清空本组
                </button>
              </div>
              <div className="workspace-ide-shell__editor-layout-tabs" data-ide-editor-layout-tabs={group}>
                {tabs.length === 0 ? <span data-ide-editor-layout-empty-tabs={group}>无打开文件</span> : null}
                {tabs.map((tab, tabIndex) => (
                  <div key={`${tab.rootId}:${tab.path}`} className="workspace-ide-shell__editor-layout-tab-row" data-ide-editor-layout-tab={tab.path} data-ide-editor-layout-tab-group={group}>
                    <button type="button" onClick={() => onSelectEditorTab(group, tab)} title={tab.path} data-ide-editor-layout-tab-focus={tab.path}>
                      {editorTabLabel(tab.path)}
                    </button>
                    <div className="workspace-ide-shell__editor-layout-tab-order" data-ide-editor-layout-tab-order={tab.path}>
                      <button type="button" disabled={layoutLocked || tabIndex === 0} onClick={() => onReorderEditorTab(group, tab, tabs[tabIndex - 1])} data-ide-editor-layout-tab-order-up={tab.path} aria-label={`上移 ${editorTabLabel(tab.path)}`}>
                        ↑
                      </button>
                      <button type="button" disabled={layoutLocked || tabIndex === tabs.length - 1} onClick={() => onReorderEditorTab(group, tab, tabs[tabIndex + 2] ?? tab)} data-ide-editor-layout-tab-order-down={tab.path} aria-label={`下移 ${editorTabLabel(tab.path)}`}>
                        ↓
                      </button>
                    </div>
                    <button type="button" disabled={layoutLocked} onClick={() => onMoveEditorTabToGroup(group, targetGroup, tab)} data-ide-editor-layout-tab-move={tab.path} data-ide-editor-layout-tab-target={targetGroup}>
                      移到{targetGroup === "primary" ? "主组" : "副组"}
                    </button>
                    <button type="button" disabled={layoutLocked} onClick={() => onCloseEditorTab(group, tab)} data-ide-editor-layout-tab-close={tab.path} aria-label={`关闭 ${editorTabLabel(tab.path)}`}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
        <div className="workspace-ide-shell__editor-layout-orientation" data-ide-editor-layout-orientation>
          <span>拆分方向</span>
          <button type="button" disabled={layoutLocked} data-active={editorSplitMode === "vertical" ? "true" : "false"} onClick={() => onSplitEditor("vertical")} data-ide-editor-layout-orientation-vertical>
            主｜副
          </button>
          <button type="button" disabled={layoutLocked} data-active={editorSplitMode === "horizontal" ? "true" : "false"} onClick={() => onSplitEditor("horizontal")} data-ide-editor-layout-orientation-horizontal>
            主／副
          </button>
          <button type="button" disabled={layoutLocked || !splitActive} onClick={() => onMergeEditorGroups("primary")} data-ide-editor-layout-orientation-single>
            收回单组
          </button>
        </div>
        <div className="workspace-ide-shell__editor-layout-ratio" data-ide-editor-layout-ratio>
          <button type="button" disabled={layoutLocked} onClick={() => onResizeEditorSplit(-KEYBOARD_RESIZE_LARGE_STEP)} data-ide-editor-layout-ratio-decrease aria-label="缩小主编辑器组">
            −
          </button>
          <span data-ide-editor-layout-ratio-value>主 {Math.round(editorSplitRatio)}% / 副 {100 - Math.round(editorSplitRatio)}%</span>
          <button type="button" disabled={layoutLocked} onClick={() => onResizeEditorSplit(KEYBOARD_RESIZE_LARGE_STEP)} data-ide-editor-layout-ratio-increase aria-label="放大主编辑器组">
            ＋
          </button>
          <input
            type="range"
            min={EDITOR_SPLIT_RATIO_LIMITS.min}
            max={EDITOR_SPLIT_RATIO_LIMITS.max}
            step={1}
            value={editorSplitRatio}
            disabled={layoutLocked}
            aria-label="编辑器组拆分比例"
            data-ide-editor-layout-ratio-slider
            onChange={(event) => onSetEditorSplitRatio(Number(event.currentTarget.value))}
          />
        </div>
        <SplitRatioPresetStrip
          label="编辑器组拆分比例"
          value={editorSplitRatio}
          disabled={layoutLocked || !splitActive}
          onSelect={onSetEditorSplitRatioPreset}
          dataAttribute="manager-editor"
        />
        <div className="workspace-ide-shell__editor-layout-snapshots" data-ide-editor-layout-snapshots>
          <span>编辑器组快照 · {editorGroupSnapshotCount}</span>
          {editorGroupSnapshots.length === 0 ? <small data-ide-editor-layout-empty-snapshots>暂无快照</small> : null}
          {editorGroupSnapshots.slice(0, 4).map((snapshot) => (
            <div key={snapshot.id} className="workspace-ide-shell__editor-layout-snapshot-row" data-ide-editor-layout-snapshot={snapshot.id}>
              <button type="button" disabled={layoutLocked} onClick={() => onRestoreEditorGroupSnapshot(snapshot)} title={`恢复 ${snapshot.name}`} data-ide-editor-layout-snapshot-restore={snapshot.id}>
                {snapshot.editorSplitMode} · {snapshot.name}
              </button>
              <button type="button" onClick={() => onUpdateEditorGroupSnapshot(snapshot.id)} aria-label={`用当前编辑器组覆盖 ${snapshot.name}`} data-ide-editor-layout-snapshot-update={snapshot.id}>
                ↻
              </button>
              <button type="button" onClick={() => onDeleteEditorGroupSnapshot(snapshot.id)} aria-label={`删除编辑器组快照 ${snapshot.name}`} data-ide-editor-layout-snapshot-delete={snapshot.id}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function DockLayoutManager({
  panesByPlacement,
  open,
  splitModes,
  splitRatios,
  dockPaneSelections,
  pinnedPanes,
  paneSizes,
  maximizedPane,
  mobilePanel,
  hiddenPanes,
  hiddenPanesByPlacement,
  layoutLocked,
  layoutSnapshotCount,
  layoutHistoryCounts,
  canUndoLayout,
  canRedoLayout,
  hasLayoutSnapshots,
  layoutSnapshots,
  dockSnapshots,
  onUndoLayout,
  onRedoLayout,
  onSaveLayoutSnapshot,
  onRestoreLatestLayoutSnapshot,
  onRestoreLayoutSnapshot,
  onUpdateLayoutSnapshot,
  onRenameLayoutSnapshot,
  onDeleteLayoutSnapshot,
  onSaveDockSnapshot,
  onRestoreDockSnapshot,
  onUpdateDockSnapshot,
  onDeleteDockSnapshot,
  onApplyWorkbenchRecipe,
  onOpenAllDocks,
  onFocusEditorOnly,
  onToggleLayoutLock,
  onShowMobilePanel,
  onHidePane,
  onRestorePane,
  onRestoreAllHiddenPanes,
  onRestoreHiddenPanesForPlacement,
  onToggleDockOpen,
  onIsolateDock,
  onRestoreDock,
  onSetDockSplitMode,
  onResizeDock,
  onSetDockSize,
  onSetDockSizePreset,
  onSetSplitRatioPreset,
  onMovePaneToGroup,
  onSwapDockGroups,
  onMergeDockGroups,
  onResetDockComposition,
  onToggleMaximizedDock,
  onFocusRegion,
}: {
  panesByPlacement: PaneOrder;
  open: Record<PanePlacement, boolean>;
  splitModes: DockSplitModes;
  splitRatios: DockSplitRatios;
  dockPaneSelections: DockPaneSelections;
  pinnedPanes: PaneId[];
  paneSizes: IdePaneSizes;
  maximizedPane: MaximizedPane;
  mobilePanel: MobilePanel;
  hiddenPanes: PaneId[];
  hiddenPanesByPlacement: PaneOrder;
  layoutLocked: boolean;
  layoutSnapshotCount: number;
  layoutHistoryCounts: { past: number; future: number };
  canUndoLayout: boolean;
  canRedoLayout: boolean;
  hasLayoutSnapshots: boolean;
  layoutSnapshots: IdeLayoutSnapshot[];
  dockSnapshots: IdeDockSnapshot[];
  onUndoLayout: () => void;
  onRedoLayout: () => void;
  onSaveLayoutSnapshot: () => void;
  onRestoreLatestLayoutSnapshot: () => void;
  onRestoreLayoutSnapshot: (snapshot: IdeLayoutSnapshot) => void;
  onUpdateLayoutSnapshot: (snapshotId: string) => void;
  onRenameLayoutSnapshot: (snapshotId: string) => void;
  onDeleteLayoutSnapshot: (snapshotId: string) => void;
  onSaveDockSnapshot: (placement: PanePlacement) => void;
  onRestoreDockSnapshot: (snapshot: IdeDockSnapshot) => void;
  onUpdateDockSnapshot: (snapshotId: string) => void;
  onDeleteDockSnapshot: (snapshotId: string) => void;
  onApplyWorkbenchRecipe: (recipeId: WorkbenchRecipeId) => void;
  onOpenAllDocks: () => void;
  onFocusEditorOnly: () => void;
  onToggleLayoutLock: () => void;
  onShowMobilePanel: (panel: MobilePanel) => void;
  onHidePane: (paneId: PaneId) => void;
  onRestorePane: (paneId: PaneId) => void;
  onRestoreAllHiddenPanes: () => void;
  onRestoreHiddenPanesForPlacement: (placement: PanePlacement) => void;
  onToggleDockOpen: (placement: PanePlacement) => void;
  onIsolateDock: (placement: PanePlacement) => void;
  onRestoreDock: (placement: PanePlacement) => void;
  onSetDockSplitMode: (placement: PanePlacement, mode: DockSplitMode) => void;
  onResizeDock: (placement: PanePlacement, delta: number) => void;
  onSetDockSize: (placement: PanePlacement, size: number) => void;
  onSetDockSizePreset: (placement: PanePlacement, preset: DockSizePreset) => void;
  onSetSplitRatioPreset: (placement: PanePlacement, ratio: SplitRatioPreset) => void;
  onMovePaneToGroup: (paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role?: DockPaneRole) => void;
  onSwapDockGroups: (placement: PanePlacement) => void;
  onMergeDockGroups: (placement: PanePlacement, preferredRole?: DockPaneRole) => void;
  onResetDockComposition: (placement: PanePlacement) => void;
  onToggleMaximizedDock: (placement: PanePlacement) => void;
  onFocusRegion: (region: IdeFocusRegion) => void;
}) {
  const [dragTarget, setDragTarget] = React.useState<{ placement: PanePlacement; role: DockPaneRole } | null>(null);
  const openDockCount = DOCK_PLACEMENTS.filter((placement) => open[placement]).length;

  function beginManagerPaneDrag(paneId: PaneId, event: React.DragEvent) {
    if (layoutLocked || pinnedPanes.includes(paneId)) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-tracevane-pane", paneId);
    event.dataTransfer.setData("text/plain", paneLabel(paneId));
  }

  function dragManagerPaneOverGroup(placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) {
    if (layoutLocked) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragTarget({ placement, role });
  }

  function dropManagerPaneOnGroup(placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) {
    if (layoutLocked) return;
    event.preventDefault();
    const paneId = event.dataTransfer.getData("application/x-tracevane-pane");
    if (isPaneId(paneId) && !pinnedPanes.includes(paneId)) {
      if (role === "secondary" && splitModes[placement] === "single") {
        onSetDockSplitMode(placement, "vertical");
      }
      onMovePaneToGroup(paneId, placement, undefined, role);
    }
    setDragTarget(null);
  }

  return (
    <section className="workspace-ide-shell__dock-layout-manager" aria-label="IDE Pane 布局管理器" data-ide-pane-layout-manager>
      <div className="workspace-ide-shell__dock-layout-manager-head">
        <span>Pane 布局管理器</span>
        <span>开合 · 拆分 · 比例 · 主/副组</span>
        <div className="workspace-ide-shell__dock-layout-summary" data-ide-pane-layout-summary>
          <span data-ide-pane-layout-summary-open>打开 {openDockCount}/4</span>
          <span data-ide-pane-layout-summary-max>{maximizedPane ? `最大化 ${maximizedPane === "center" ? "编辑器" : placementLabel(maximizedPane)}` : "未最大化"}</span>
          <span data-ide-pane-layout-summary-hidden>隐藏 {hiddenPanes.length}</span>
          <span data-ide-pane-layout-summary-lock>{layoutLocked ? "布局已锁" : "布局可编辑"}</span>
          <span data-ide-pane-layout-summary-snapshots>快照 {layoutSnapshotCount}</span>
          <span data-ide-pane-layout-summary-history>历史 {layoutHistoryCounts.past}/{layoutHistoryCounts.future}</span>
          <button type="button" onClick={onToggleLayoutLock} data-ide-pane-layout-lock-toggle data-active={layoutLocked ? "true" : "false"} aria-pressed={layoutLocked}>
            {layoutLocked ? "解锁布局" : "锁定布局"}
          </button>
          <button type="button" disabled={layoutLocked || hiddenPanes.length === 0} onClick={onRestoreAllHiddenPanes} data-ide-pane-layout-restore-all-hidden>
            恢复隐藏
          </button>
        </div>
        <div className="workspace-ide-shell__dock-layout-switchboard" aria-label="Dock 开关矩阵" data-ide-pane-layout-switchboard>
          {DOCK_PLACEMENTS.map((placement) => {
            const isMaximized = maximizedPane === placement;
            return (
              <button
                key={placement}
                type="button"
                disabled={layoutLocked}
                data-ide-pane-layout-switch={placement}
                data-ide-pane-layout-switch-open={open[placement] ? "true" : "false"}
                data-ide-pane-layout-switch-maximized={isMaximized ? "true" : "false"}
                aria-pressed={open[placement]}
                onClick={() => onToggleDockOpen(placement)}
                onDoubleClick={() => onToggleMaximizedDock(placement)}
              >
                <strong>{placementLabel(placement)}</strong>
                <span>{open[placement] ? "已打开" : "已收起"}{isMaximized ? " · 最大化" : ""}</span>
              </button>
            );
          })}
        </div>
        <div className="workspace-ide-shell__dock-layout-mobile-rail" aria-label="移动端 Dock 激活条" data-ide-pane-layout-mobile-rail>
          <button type="button" disabled={layoutLocked} data-active={mobilePanel === "editor" ? "true" : "false"} data-ide-pane-layout-mobile-panel="editor" onClick={() => onShowMobilePanel("editor")}>
            编辑器
          </button>
          {DOCK_PLACEMENTS.map((placement) => (
            <button
              key={placement}
              type="button"
              disabled={layoutLocked}
              data-active={mobilePanel === placement ? "true" : "false"}
              data-ide-pane-layout-mobile-panel={placement}
              data-ide-pane-layout-mobile-open={open[placement] ? "true" : "false"}
              onClick={() => onShowMobilePanel(placement)}
            >
              {placementLabel(placement)}
            </button>
          ))}
        </div>
        <div className="workspace-ide-shell__dock-layout-recipes" aria-label="工作台组合预案" data-ide-pane-layout-recipes>
          {WORKBENCH_LAYOUT_RECIPES.map((recipe) => (
            <button key={recipe.id} type="button" disabled={layoutLocked} onClick={() => onApplyWorkbenchRecipe(recipe.id)} title={recipe.description} data-ide-pane-layout-recipe={recipe.id}>
              {recipe.label}
            </button>
          ))}
        </div>
        <button type="button" disabled={layoutLocked || !canUndoLayout} onClick={onUndoLayout} data-ide-pane-layout-undo>
          撤销
        </button>
        <button type="button" disabled={layoutLocked || !canRedoLayout} onClick={onRedoLayout} data-ide-pane-layout-redo>
          重做
        </button>
        <button type="button" disabled={layoutLocked} onClick={onSaveLayoutSnapshot} data-ide-pane-layout-save-snapshot>
          保存布局
        </button>
        <button type="button" disabled={layoutLocked || !hasLayoutSnapshots} onClick={onRestoreLatestLayoutSnapshot} data-ide-pane-layout-restore-latest>
          恢复最近
        </button>
        <button type="button" disabled={layoutLocked} onClick={onOpenAllDocks} data-ide-pane-layout-open-all>
          打开全部
        </button>
        <button type="button" disabled={layoutLocked} onClick={onFocusEditorOnly} data-ide-pane-layout-editor-only>
          编辑器专注
        </button>
      </div>
      <div className="workspace-ide-shell__dock-layout-workbench-snapshots" aria-label="布局管理器内的 IDE 全局快照" data-ide-pane-layout-snapshots>
        <span>全局布局快照 · {layoutSnapshots.length}</span>
        <button type="button" disabled={layoutLocked} onClick={onSaveLayoutSnapshot} data-ide-pane-layout-snapshot-save>保存当前布局</button>
        {layoutSnapshots.length === 0 ? <small data-ide-pane-layout-snapshot-empty>暂无布局快照</small> : null}
        {layoutSnapshots.slice(0, 4).map((snapshot) => (
          <div key={snapshot.id} className="workspace-ide-shell__dock-layout-workbench-snapshot-row" data-ide-pane-layout-snapshot={snapshot.id}>
            <button type="button" disabled={layoutLocked} onClick={() => onRestoreLayoutSnapshot(snapshot)} title={`恢复 ${snapshot.name}`} data-ide-pane-layout-snapshot-restore={snapshot.id}>
              {snapshot.name}
            </button>
            <button type="button" disabled={layoutLocked} onClick={() => onUpdateLayoutSnapshot(snapshot.id)} aria-label={`用当前布局覆盖 ${snapshot.name}`} data-ide-pane-layout-snapshot-update={snapshot.id}>↻</button>
            <button type="button" onClick={() => onRenameLayoutSnapshot(snapshot.id)} aria-label={`重命名布局 ${snapshot.name}`} data-ide-pane-layout-snapshot-rename={snapshot.id}>✎</button>
            <button type="button" onClick={() => onDeleteLayoutSnapshot(snapshot.id)} aria-label={`删除布局 ${snapshot.name}`} data-ide-pane-layout-snapshot-delete={snapshot.id}>×</button>
          </div>
        ))}
      </div>
      <div className="workspace-ide-shell__dock-layout-manager-grid">
        {DOCK_PLACEMENTS.map((placement) => {
          const paneIds = panesByPlacement[placement];
          const sizeLimits = getPaneSizeLimits(placement);
          const isMaximized = maximizedPane === placement;
          const placementDockSnapshots = dockSnapshots.filter((snapshot) => snapshot.placement === placement);
          return (
            <article
              key={placement}
              className="workspace-ide-shell__dock-layout-card"
              data-ide-pane-layout-card={placement}
              data-ide-pane-layout-open={open[placement] ? "true" : "false"}
              data-ide-pane-layout-split={splitModes[placement]}
            >
              <header>
                <button type="button" onClick={() => onFocusRegion(placement)} data-ide-pane-layout-focus={placement}>
                  {placementLabel(placement)} Dock
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onToggleDockOpen(placement)} data-ide-pane-layout-toggle-open={placement}>
                  {open[placement] ? "收起" : "打开"}
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onIsolateDock(placement)} data-ide-pane-layout-isolate={placement}>
                  独占
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onToggleMaximizedDock(placement)} data-ide-pane-layout-maximize={placement} data-active={isMaximized ? "true" : "false"} aria-pressed={isMaximized}>
                  {isMaximized ? "还原" : "最大化"}
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onResetDockComposition(placement)} data-ide-pane-layout-reset={placement}>
                  重置
                </button>
              </header>
              <div className="workspace-ide-shell__dock-layout-visibility" data-ide-pane-layout-visibility={placement}>
                <span>可见性</span>
                <button type="button" disabled={layoutLocked || !open[placement]} onClick={() => onToggleDockOpen(placement)} data-ide-pane-layout-minimize={placement}>
                  最小化
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onIsolateDock(placement)} data-ide-pane-layout-focus-only={placement}>
                  专注
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onToggleMaximizedDock(placement)} data-ide-pane-layout-visibility-maximize={placement} data-active={isMaximized ? "true" : "false"} aria-pressed={isMaximized}>
                  {isMaximized ? "退出最大化" : "最大化"}
                </button>
                <button type="button" disabled={layoutLocked} onClick={() => onRestoreDock(placement)} data-ide-pane-layout-restore-dock={placement}>
                  恢复
                </button>
              </div>
              <div className="workspace-ide-shell__dock-layout-modes" data-ide-pane-layout-modes={placement}>
                {(["single", "vertical", "horizontal"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={layoutLocked}
                    data-ide-pane-layout-mode={mode}
                    data-active={splitModes[placement] === mode ? "true" : "false"}
                    onClick={() => onSetDockSplitMode(placement, mode)}
                  >
                    {mode === "single" ? "单组" : mode === "vertical" ? "左右" : "上下"}
                  </button>
                ))}
              </div>
              <div className="workspace-ide-shell__dock-layout-size" data-ide-pane-layout-size={placement}>
                <button type="button" disabled={layoutLocked} onClick={() => onResizeDock(placement, -KEYBOARD_RESIZE_LARGE_STEP)} data-ide-pane-layout-size-decrease={placement} aria-label={`缩小${placementLabel(placement)} Dock`}>
                  −
                </button>
                <span>{paneSizes[placement]}px</span>
                <button type="button" disabled={layoutLocked} onClick={() => onResizeDock(placement, KEYBOARD_RESIZE_LARGE_STEP)} data-ide-pane-layout-size-increase={placement} aria-label={`放大${placementLabel(placement)} Dock`}>
                  ＋
                </button>
                <div className="workspace-ide-shell__dock-layout-size-presets" data-ide-pane-layout-size-presets={placement}>
                  {DOCK_SIZE_PRESETS.map((preset) => (
                    <button key={preset} type="button" disabled={layoutLocked} onClick={() => onSetDockSizePreset(placement, preset)} data-ide-pane-layout-size-preset={preset}>
                      {preset === "compact" ? (placement === "top" || placement === "bottom" ? "低" : "窄") : preset === "expanded" ? (placement === "top" || placement === "bottom" ? "高" : "宽") : "中"}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={sizeLimits.min}
                  max={sizeLimits.max}
                  step={KEYBOARD_RESIZE_STEP}
                  value={paneSizes[placement]}
                  disabled={layoutLocked}
                  aria-label={`${placementLabel(placement)} Dock 尺寸`}
                  data-ide-pane-layout-size-slider={placement}
                  onChange={(event) => onSetDockSize(placement, Number(event.currentTarget.value))}
                />
              </div>
              <SplitRatioPresetStrip
                label={`${placementLabel(placement)} Dock 拆分比例`}
                value={splitRatios[placement]}
                disabled={layoutLocked || splitModes[placement] === "single"}
                onSelect={(ratio) => onSetSplitRatioPreset(placement, ratio)}
                dataAttribute={`manager-${placement}`}
              />
              <div className="workspace-ide-shell__dock-layout-combine" data-ide-pane-layout-combine={placement}>
                <button type="button" disabled={layoutLocked || splitModes[placement] === "single"} onClick={() => onSwapDockGroups(placement)} data-ide-pane-layout-swap-groups={placement}>
                  交换主副
                </button>
                <button type="button" disabled={layoutLocked || splitModes[placement] === "single"} onClick={() => onMergeDockGroups(placement, "primary")} data-ide-pane-layout-merge-primary={placement}>
                  合到主组
                </button>
                <button type="button" disabled={layoutLocked || splitModes[placement] === "single"} onClick={() => onMergeDockGroups(placement, "secondary")} data-ide-pane-layout-merge-secondary={placement}>
                  合到副组
                </button>
              </div>
              <div className="workspace-ide-shell__dock-layout-orientation" data-ide-pane-layout-orientation={placement}>
                <span>拆分方向</span>
                <button
                  type="button"
                  disabled={layoutLocked}
                  data-ide-pane-layout-orientation-vertical={placement}
                  data-active={splitModes[placement] === "vertical" ? "true" : "false"}
                  onClick={() => onSetDockSplitMode(placement, "vertical")}
                >
                  主｜副
                </button>
                <button
                  type="button"
                  disabled={layoutLocked}
                  data-ide-pane-layout-orientation-horizontal={placement}
                  data-active={splitModes[placement] === "horizontal" ? "true" : "false"}
                  onClick={() => onSetDockSplitMode(placement, "horizontal")}
                >
                  主／副
                </button>
                <button
                  type="button"
                  disabled={layoutLocked || splitModes[placement] === "single"}
                  data-ide-pane-layout-orientation-single={placement}
                  onClick={() => onSetDockSplitMode(placement, "single")}
                >
                  收回单组
                </button>
              </div>
              <div className="workspace-ide-shell__dock-layout-hidden" data-ide-pane-layout-hidden={placement}>
                <span>隐藏 Pane</span>
                <button type="button" disabled={layoutLocked || hiddenPanesByPlacement[placement].length === 0} onClick={() => onRestoreHiddenPanesForPlacement(placement)} data-ide-pane-layout-restore-hidden={placement}>
                  恢复本 Dock
                </button>
                {hiddenPanesByPlacement[placement].map((paneId) => (
                  <button key={paneId} type="button" disabled={layoutLocked} onClick={() => onRestorePane(paneId)} data-ide-pane-layout-hidden-pane={paneId}>
                    {paneLabel(paneId)}
                  </button>
                ))}
              </div>
              <div className="workspace-ide-shell__dock-layout-snapshots" data-ide-pane-layout-dock-snapshots={placement}>
                <span>{placementLabel(placement)} Dock 组合 · {placementDockSnapshots.length}</span>
                <button type="button" disabled={layoutLocked} onClick={() => onSaveDockSnapshot(placement)} data-ide-pane-layout-dock-snapshot-save={placement}>
                  保存当前组合
                </button>
                {placementDockSnapshots.length === 0 ? <small data-ide-pane-layout-dock-snapshot-empty={placement}>暂无组合快照</small> : null}
                {placementDockSnapshots.slice(0, 4).map((snapshot) => (
                  <div key={snapshot.id} className="workspace-ide-shell__dock-layout-snapshot-row" data-ide-pane-layout-dock-snapshot={snapshot.id} data-ide-pane-layout-dock-snapshot-placement={snapshot.placement}>
                    <button type="button" disabled={layoutLocked} onClick={() => onRestoreDockSnapshot(snapshot)} title={`恢复 ${snapshot.name}`} data-ide-pane-layout-dock-snapshot-restore={snapshot.id}>
                      {snapshot.name}
                    </button>
                    <button type="button" disabled={layoutLocked} onClick={() => onUpdateDockSnapshot(snapshot.id)} aria-label={`用当前${placementLabel(snapshot.placement)} Dock 覆盖 ${snapshot.name}`} data-ide-pane-layout-dock-snapshot-update={snapshot.id}>
                      ↻
                    </button>
                    <button type="button" onClick={() => onDeleteDockSnapshot(snapshot.id)} aria-label={`删除${placementLabel(snapshot.placement)} Dock 组合 ${snapshot.name}`} data-ide-pane-layout-dock-snapshot-delete={snapshot.id}>
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="workspace-ide-shell__dock-layout-groups" data-ide-pane-layout-groups={placement}>
                {(["primary", "secondary"] as const).map((role) => (
                  <div
                    key={role}
                    className="workspace-ide-shell__dock-layout-group"
                    data-ide-pane-layout-group={role}
                    data-ide-pane-layout-drop-active={dragTarget?.placement === placement && dragTarget.role === role ? "true" : "false"}
                    onDragOver={(event) => dragManagerPaneOverGroup(placement, role, event)}
                    onDragLeave={() => setDragTarget(null)}
                    onDrop={(event) => dropManagerPaneOnGroup(placement, role, event)}
                  >
                    <span>{role === "primary" ? "主组" : "副组"}</span>
                    {paneIds.map((paneId, paneIndex) => {
                      const selected = dockPaneSelections[placement][role] === paneId;
                      const pinned = pinnedPanes.includes(paneId);
                      return (
                        <div
                          key={`${role}-${paneId}`}
                          className="workspace-ide-shell__dock-layout-pane-row"
                          data-ide-pane-layout-pane-row={paneId}
                        >
                          <button
                            type="button"
                            disabled={layoutLocked || pinned || (role === "secondary" && splitModes[placement] === "single")}
                            data-ide-pane-layout-assign={paneId}
                            data-ide-pane-layout-assign-placement={placement}
                            data-ide-pane-layout-assign-role={role}
                            data-active={selected ? "true" : "false"}
                            draggable={!layoutLocked && !pinned}
                            onDragStart={(event) => beginManagerPaneDrag(paneId, event)}
                            onDragEnd={() => setDragTarget(null)}
                            onClick={() => onMovePaneToGroup(paneId, placement, undefined, role)}
                          >
                            {paneLabel(paneId)}{pinned ? " · 固定" : ""}
                          </button>
                          <span className="workspace-ide-shell__dock-layout-order" aria-label={`${paneLabel(paneId)} 顺序`}>
                            <button
                              type="button"
                              disabled={layoutLocked || pinned || paneIndex === 0 || (role === "secondary" && splitModes[placement] === "single")}
                              data-ide-pane-layout-order-up={paneId}
                              aria-label={`上移 ${paneLabel(paneId)}`}
                              onClick={() => onMovePaneToGroup(paneId, placement, paneIds[paneIndex - 1], role)}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={layoutLocked || pinned || paneIndex === paneIds.length - 1 || (role === "secondary" && splitModes[placement] === "single")}
                              data-ide-pane-layout-order-down={paneId}
                              aria-label={`下移 ${paneLabel(paneId)}`}
                              onClick={() => onMovePaneToGroup(paneId, placement, paneIds[paneIndex + 2], role)}
                            >
                              ↓
                            </button>
                          </span>
                          <button
                            type="button"
                            disabled={layoutLocked || pinned}
                            data-ide-pane-layout-hide-pane={paneId}
                            aria-label={`隐藏 ${paneLabel(paneId)} Pane`}
                            onClick={() => onHidePane(paneId)}
                          >
                            隐藏
                          </button>
                          <span className="workspace-ide-shell__dock-layout-role-switch" aria-label={`${paneLabel(paneId)} 主副组`}>
                            {(["primary", "secondary"] as const).map((targetRole) => (
                              <button
                                key={targetRole}
                                type="button"
                                disabled={layoutLocked || pinned}
                                data-ide-pane-layout-role-switch={targetRole}
                                data-ide-pane-layout-role-switch-pane={paneId}
                                data-active={role === targetRole ? "true" : "false"}
                                aria-label={`移动 ${paneLabel(paneId)} 到 ${targetRole === "primary" ? "主组" : "副组"}`}
                                onClick={() => {
                                  if (targetRole === "secondary" && splitModes[placement] === "single") onSetDockSplitMode(placement, "vertical");
                                  onMovePaneToGroup(paneId, placement, undefined, targetRole);
                                }}
                              >
                                {targetRole === "primary" ? "主组" : "副组"}
                              </button>
                            ))}
                          </span>
                          <span className="workspace-ide-shell__dock-layout-destinations" aria-label={`${paneLabel(paneId)} Dock 目的地`}>
                            {DOCK_PLACEMENTS.map((targetPlacement) => (
                              <button
                                key={targetPlacement}
                                type="button"
                                disabled={layoutLocked || pinned || (role === "secondary" && splitModes[targetPlacement] === "single")}
                                data-ide-pane-layout-destination={targetPlacement}
                                data-ide-pane-layout-destination-pane={paneId}
                                data-active={placement === targetPlacement ? "true" : "false"}
                                aria-label={`移动 ${paneLabel(paneId)} 到 ${placementLabel(targetPlacement)} Dock`}
                                onClick={() => onMovePaneToGroup(paneId, targetPlacement, undefined, role)}
                              >
                                {placementLabel(targetPlacement)}
                              </button>
                            ))}
                          </span>
                        </div>
                      );
                    })}
                    {paneIds.length === 0 ? <em>空 Dock</em> : null}
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
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
  onMergeDockGroups,
  onFocusOtherGroup,
  canFocusOtherGroup = false,
  onHidePane,
  onBeginDrag,
  onEndDrag,
  onCloseDock,
  pinnedPanes = [],
  onTogglePanePinned,
}: {
  paneId: PaneId;
  placement: PanePlacement;
  compact?: boolean;
  splitMode?: DockSplitMode;
  onMovePane: (paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role?: DockPaneRole) => void;
  onSetDockSplitMode?: (placement: PanePlacement, mode: DockSplitMode) => void;
  onSwapDockGroups?: (placement: PanePlacement) => void;
  onMergeDockGroups?: (placement: PanePlacement) => void;
  onFocusOtherGroup?: () => void;
  canFocusOtherGroup?: boolean;
  onHidePane: (paneId: PaneId) => void;
  onBeginDrag: (paneId: PaneId, event: React.DragEvent) => void;
  onEndDrag: () => void;
  onCloseDock: () => void;
  pinnedPanes?: PaneId[];
  onTogglePanePinned?: (paneId: PaneId) => void;
}) {
  const canAssignToSplitGroup = splitMode && splitMode !== "single";
  const pinned = pinnedPanes.includes(paneId);

  return (
    <div
      className={cn("workspace-ide-shell__pane-dock-controls", compact && "is-compact")}
      data-ide-pane-dock-controls={paneId}
      data-ide-pane-draggable={paneId}
      data-ide-pane-pinned={pinned ? "true" : "false"}
      draggable={!pinned}
      onDragStart={(event) => onBeginDrag(paneId, event)}
      onDragEnd={onEndDrag}
    >
      {DOCK_PLACEMENTS.map((target) => (
        <button
          key={target}
          type="button"
          disabled={target === placement || pinned}
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
        disabled={!canAssignToSplitGroup || pinned}
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
              {onMergeDockGroups ? (
                <button
                  type="button"
                  data-ide-dock-merge-groups={placement}
                  disabled={splitMode === "single"}
                  aria-label={`合并${placementLabel(placement)} Dock 主副窗格组`}
                  onClick={() => onMergeDockGroups(placement)}
                >
                  合组
                </button>
              ) : null}
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
      <button type="button" data-ide-pane-pin={paneId} aria-pressed={pinned} aria-label={`${pinned ? "取消固定" : "固定"} ${paneLabel(paneId)} Pane`} onClick={() => onTogglePanePinned?.(paneId)}>
        {pinned ? "固✓" : "固定"}
      </button>
      <button type="button" disabled={pinned} aria-label={`隐藏 ${paneLabel(paneId)} Pane`} onClick={() => onHidePane(paneId)}>
        隐
      </button>
      <button type="button" aria-label={`关闭${placementLabel(placement)} Dock`} onClick={onCloseDock}>
        ×
      </button>
    </div>
  );
}

function EmptyDockPane({ placement, hiddenRestoreCount, onRestoreHidden, onRestore }: { placement: PanePlacement; hiddenRestoreCount: number; onRestoreHidden: () => void; onRestore: () => void }) {
  return (
    <div className="workspace-ide-shell__empty-dock" data-ide-empty-dock={placement}>
      <div className="workspace-ide-shell__empty-dock-mark" aria-hidden={true}>
        {placementShortLabel(placement)}
      </div>
      <h2>{placementLabel(placement)} Dock 为空</h2>
      <p>当前没有窗格停靠在这里。你可以恢复隐藏在该 Dock 的 Pane，或只恢复这个 Dock 的默认 IDE 窗格组合。</p>
      <div className="workspace-ide-shell__empty-dock-actions">
        <Button size="sm" variant="outline" disabled={hiddenRestoreCount === 0} onClick={onRestoreHidden} data-ide-restore-hidden-dock={placement}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden={true} />
          恢复本 Dock 隐藏 Pane{hiddenRestoreCount > 0 ? ` · ${hiddenRestoreCount}` : ""}
        </Button>
        <Button size="sm" onClick={onRestore} data-ide-reset-dock-composition={placement}>
          <RotateCcw className="mr-2 h-4 w-4" aria-hidden={true} />
          恢复本 Dock 默认组合
        </Button>
      </div>
    </div>
  );
}

function EditorGroupFrame({
  group,
  title,
  active,
  filePath,
  tabs,
  splitMode,
  children,
  onSelectTab,
  onCloseTab,
  onBeginTabDrag,
  onDropTabBefore,
  onDropTabAtEnd,
  onFocus,
  onSplitRight,
  onSplitDown,
  onSwapGroups,
  onMergeToPrimary,
  onMergeToSecondary,
  onClose,
}: {
  group: EditorGroupId;
  title: string;
  active: boolean;
  filePath?: string;
  tabs: EditorTab[];
  splitMode: EditorSplitMode;
  children: React.ReactNode;
  onSelectTab: (group: EditorGroupId, tab: EditorTab) => void;
  onCloseTab: (group: EditorGroupId, tab: EditorTab) => void;
  onBeginTabDrag: (group: EditorGroupId, tab: EditorTab, event: React.DragEvent) => void;
  onDropTabBefore: (group: EditorGroupId, beforeTab: EditorTab, event: React.DragEvent) => void;
  onDropTabAtEnd: (group: EditorGroupId, event: React.DragEvent) => void;
  onFocus: () => void;
  onSplitRight: () => void;
  onSplitDown: () => void;
  onSwapGroups?: () => void;
  onMergeToPrimary?: () => void;
  onMergeToSecondary?: () => void;
  onClose?: () => void;
}) {
  const [tabDropTarget, setTabDropTarget] = React.useState<{ group: EditorGroupId; path?: string } | null>(null);

  function markTabDropTarget(groupId: EditorGroupId, event: React.DragEvent, path?: string) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setTabDropTarget({ group: groupId, path });
  }

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
        <div
          className="workspace-ide-shell__editor-tabs"
          data-ide-editor-tabs={group}
          data-ide-editor-tab-drop-zone={group}
          data-ide-editor-tab-drop-active={tabDropTarget?.group === group && !tabDropTarget.path ? "true" : "false"}
          onDragOver={(event) => markTabDropTarget(group, event)}
          onDragLeave={() => setTabDropTarget(null)}
          onDrop={(event) => {
            setTabDropTarget(null);
            onDropTabAtEnd(group, event);
          }}
        >
          {tabs.map((tab) => (
            <span
              key={`${tab.rootId}:${tab.path}`}
              className={cn("workspace-ide-shell__editor-tab", filePath === tab.path && "is-active")}
              data-ide-editor-tab={tab.path}
              data-ide-editor-tab-drop-active={tabDropTarget?.group === group && tabDropTarget.path === tab.path ? "true" : "false"}
              title={tab.path}
              draggable
              onDragStart={(event) => onBeginTabDrag(group, tab, event)}
              onDragOver={(event) => markTabDropTarget(group, event, tab.path)}
              onDragLeave={() => setTabDropTarget(null)}
              onDrop={(event) => {
                setTabDropTarget(null);
                onDropTabBefore(group, tab, event);
              }}
            >
              <button type="button" className="workspace-ide-shell__editor-tab-label" onClick={() => onSelectTab(group, tab)}>
                {editorTabLabel(tab.path)}
              </button>
              <button
                type="button"
                className="workspace-ide-shell__editor-tab-close"
                data-ide-editor-tab-close={tab.path}
                aria-label={`关闭 ${editorTabLabel(tab.path)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTab(group, tab);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <button type="button" onClick={onSplitRight} aria-label="向右拆分编辑器">
          右拆
        </button>
        <button type="button" onClick={onSplitDown} aria-label="向下拆分编辑器">
          下拆
        </button>
        {splitMode !== "single" && onSwapGroups ? (
          <button type="button" onClick={onSwapGroups} data-ide-editor-swap-groups aria-label="交换主副编辑器组">
            交换
          </button>
        ) : null}
        {splitMode !== "single" && onMergeToPrimary ? (
          <button type="button" onClick={onMergeToPrimary} data-ide-editor-merge-primary aria-label="合并编辑器到主组">
            合主
          </button>
        ) : null}
        {splitMode !== "single" && onMergeToSecondary ? (
          <button type="button" onClick={onMergeToSecondary} data-ide-editor-merge-secondary aria-label="合并编辑器到副组">
            合副
          </button>
        ) : null}
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
  onDoubleClick,
}: {
  mode: Exclude<EditorSplitMode, "single">;
  value: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDoubleClick: () => void;
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
      onDoubleClick={onDoubleClick}
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
  paneIds,
  splitMode,
  splitRatio,
  primaryPane,
  secondaryPane,
  activeFocus,
  isMaximized,
  workspaceDirectory,
  onTerminalCommandsChange,
  onRestore,
  onRestoreHidden,
  hiddenRestoreCount,
  onStartSplitResize,
  onResizeSplitFromKeyboard,
  onFocusPane,
  onHidePane,
  onFocusOtherGroup,
  onToggleMaximized,
  onCloseDock,
  onResetSplitRatio,
  onResizeSplitGroup,
  onSetSplitRatioPreset,
  onMovePaneToGroup,
  onSwapGroups,
  onMergeGroups,
  edgeDropTarget,
  onDropPaneOnGroup,
  onDragPaneOverEdge,
  onLeavePaneEdge,
  onDropPaneOnEdge,
  onBeginDrag,
  onEndDrag,
  renderPane,
}: {
  placement: PanePlacement;
  paneIds: PaneId[];
  splitMode: DockSplitMode;
  splitRatio: number;
  primaryPane?: PaneId;
  secondaryPane?: PaneId;
  activeFocus: ActiveDockFocus;
  isMaximized: boolean;
  edgeDropTarget: DockEdgeDropTarget;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  onTerminalCommandsChange: (commands: WorkspaceCommand[]) => void;
  onRestore: () => void;
  onRestoreHidden: () => void;
  hiddenRestoreCount: number;
  onStartSplitResize: (placement: PanePlacement, mode: DockSplitMode, event: React.PointerEvent) => void;
  onResizeSplitFromKeyboard: (placement: PanePlacement, mode: DockSplitMode, event: React.KeyboardEvent) => void;
  onFocusPane: (placement: PanePlacement, role: DockPaneRole, paneId: PaneId) => void;
  onHidePane: (paneId: PaneId) => void;
  onFocusOtherGroup: (placement?: PanePlacement, role?: DockPaneRole) => void;
  onToggleMaximized: (pane: NonNullable<MaximizedPane>) => void;
  onCloseDock: (placement: PanePlacement) => void;
  onResetSplitRatio: (placement: PanePlacement) => void;
  onResizeSplitGroup: (placement: PanePlacement, role: DockPaneRole, direction: "grow" | "shrink") => void;
  onSetSplitRatioPreset: (placement: PanePlacement, ratio: SplitRatioPreset) => void;
  onMovePaneToGroup: (paneId: PaneId, placement: PanePlacement, beforePaneId?: PaneId, role?: DockPaneRole) => void;
  onSwapGroups: (placement: PanePlacement) => void;
  onMergeGroups: (placement: PanePlacement, preferredRole?: DockPaneRole) => void;
  onDropPaneOnGroup: (placement: PanePlacement, role: DockPaneRole, event: React.DragEvent) => void;
  onDragPaneOverEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
  onLeavePaneEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
  onDropPaneOnEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
  onBeginDrag: (paneId: PaneId, event: React.DragEvent) => void;
  onEndDrag: () => void;
  renderPane?: (paneId: PaneId, role: "primary" | "secondary") => React.ReactNode;
}) {
  if (!primaryPane) return <EmptyDockPane placement={placement} hiddenRestoreCount={hiddenRestoreCount} onRestoreHidden={onRestoreHidden} onRestore={onRestore} />;
  const shouldSplit = splitMode !== "single" && Boolean(secondaryPane);
  const style = shouldSplit ? ({ "--ide-dock-primary-size": `${splitRatio}%` } as React.CSSProperties) : undefined;
  const stopGroupAction = (event: React.SyntheticEvent) => event.stopPropagation();
  const oppositeRole = (role: DockPaneRole): DockPaneRole => (role === "primary" ? "secondary" : "primary");
  const groupPaneIds = (role: DockPaneRole) => {
    const selectedPane = role === "primary" ? primaryPane : secondaryPane;
    return selectedPane ? [selectedPane, ...paneIds.filter((paneId) => paneId !== selectedPane)] : paneIds;
  };
  const renderGroupTabs = (role: DockPaneRole, selectedPane: PaneId) => (
    <div className="workspace-ide-shell__dock-split-group-tabs" data-ide-dock-split-group-tabs={role}>
      {groupPaneIds(role).map((tabPaneId) => (
        <button
          key={tabPaneId}
          type="button"
          className={cn("workspace-ide-shell__dock-split-group-tab", tabPaneId === selectedPane && "is-active")}
          data-ide-dock-split-group-tab={tabPaneId}
          data-ide-dock-split-group-tab-role={role}
          draggable
          onPointerDown={stopGroupAction}
          onClick={(event) => {
            event.stopPropagation();
            onFocusPane(placement, role, tabPaneId);
          }}
          onDragStart={(event) => onBeginDrag(tabPaneId, event)}
          onDragEnd={onEndDrag}
          onDragOver={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            event.stopPropagation();
            const droppedPaneId = event.dataTransfer.getData("application/x-tracevane-pane");
            if (isPaneId(droppedPaneId)) onMovePaneToGroup(droppedPaneId, placement, tabPaneId, role);
          }}
        >
          {paneLabel(tabPaneId)}
        </button>
      ))}
      <button
        type="button"
        className="workspace-ide-shell__dock-split-group-tab-add"
        aria-label={`把 Pane 拖到${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}窗格组末尾`}
        onPointerDown={stopGroupAction}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => onDropPaneOnGroup(placement, role, event)}
      >
        +
      </button>
    </div>
  );
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
        {renderGroupTabs(role, paneId)}
        <div className="workspace-ide-shell__dock-split-pane-toolbar" data-ide-dock-split-pane-toolbar={role}>
          <span className="workspace-ide-shell__dock-split-pane-badge">
            {role === "primary" ? "主" : "副"} · {paneLabel(paneId)}
          </span>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            aria-label={isMaximized ? `恢复${placementLabel(placement)} Dock 组合布局` : `最大化${placementLabel(placement)} Dock`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onToggleMaximized(placement);
            }}
          >
            ⛶
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            aria-label={`收起${placementLabel(placement)} Dock`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onCloseDock(placement);
            }}
          >
            −
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`聚焦${placementLabel(placement)} Dock 另一个窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onFocusOtherGroup(placement, role);
            }}
          >
            ⇄
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`放大${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onResizeSplitGroup(placement, role, "grow");
            }}
          >
            大
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`缩小${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onResizeSplitGroup(placement, role, "shrink");
            }}
          >
            小
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`重置${placementLabel(placement)} Dock 拆分比例`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onResetSplitRatio(placement);
            }}
          >
            50
          </button>
          <SplitRatioPresetStrip
            label={`${placementLabel(placement)} Dock 拆分比例预设`}
            value={splitRatio}
            disabled={!shouldSplit}
            onSelect={(ratio) => onSetSplitRatioPreset(placement, ratio)}
            dataAttribute={`${placement}-${role}`}
            onPointerDown={stopGroupAction}
          />
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`移动 ${paneLabel(paneId)} 到${placementLabel(placement)} Dock ${role === "primary" ? "副" : "主"}窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onMovePaneToGroup(paneId, placement, undefined, oppositeRole(role));
            }}
          >
            移
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`交换${placementLabel(placement)} Dock 主副窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onSwapGroups(placement);
            }}
          >
            ↔
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            disabled={!shouldSplit}
            aria-label={`合并${placementLabel(placement)} Dock，并保留${role === "primary" ? "主" : "副"}窗格组`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onMergeGroups(placement, role);
            }}
          >
            合
          </button>
          <button
            type="button"
            className="workspace-ide-shell__dock-split-pane-action"
            aria-label={`隐藏${placementLabel(placement)} Dock ${role === "primary" ? "主" : "副"}窗格组的 ${paneLabel(paneId)} Pane`}
            onPointerDown={stopGroupAction}
            onClick={(event) => {
              event.stopPropagation();
              onHidePane(paneId);
            }}
          >
            ×
          </button>
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
      <DockEdgeDropZones
        placement={placement}
        edgeDropTarget={edgeDropTarget}
        onDragPaneOverEdge={onDragPaneOverEdge}
        onLeavePaneEdge={onLeavePaneEdge}
        onDropPaneOnEdge={onDropPaneOnEdge}
      />
      {render(primaryPane, "primary")}
      {shouldSplit && secondaryPane ? (
        <>
          <DockSplitHandle
            placement={placement}
            mode={splitMode}
            value={splitRatio}
            onPointerDown={(event) => onStartSplitResize(placement, splitMode, event)}
            onKeyDown={(event) => onResizeSplitFromKeyboard(placement, splitMode, event)}
            onDoubleClick={() => onResetSplitRatio(placement)}
          />
          {render(secondaryPane, "secondary")}
        </>
      ) : null}
    </div>
  );
}


function SplitRatioPresetStrip({
  label,
  value,
  disabled = false,
  onSelect,
  dataAttribute,
  onPointerDown,
}: {
  label: string;
  value: number;
  disabled?: boolean;
  onSelect: (ratio: SplitRatioPreset) => void;
  dataAttribute: string;
  onPointerDown?: (event: React.SyntheticEvent) => void;
}) {
  return (
    <div className="workspace-ide-shell__split-ratio-presets" aria-label={label} data-ide-split-ratio-presets={dataAttribute}>
      {SPLIT_RATIO_PRESETS.map((ratio) => (
        <button
          key={ratio}
          type="button"
          className="workspace-ide-shell__dock-split-pane-action"
          disabled={disabled}
          data-ide-split-ratio-preset={ratio}
          data-active={Math.round(value) === ratio ? "true" : "false"}
          aria-label={`${label}: ${ratio}/${100 - ratio}`}
          onPointerDown={onPointerDown}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(ratio);
          }}
        >
          {ratio}
        </button>
      ))}
    </div>
  );
}

function DockEdgeDropZones({
  placement,
  edgeDropTarget,
  onDragPaneOverEdge,
  onLeavePaneEdge,
  onDropPaneOnEdge,
}: {
  placement: PanePlacement;
  edgeDropTarget: DockEdgeDropTarget;
  onDragPaneOverEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
  onLeavePaneEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
  onDropPaneOnEdge: (placement: PanePlacement, edge: DockDropEdge, event: React.DragEvent) => void;
}) {
  const edges: DockDropEdge[] = ["top", "right", "bottom", "left"];
  return (
    <>
      {edges.map((edge) => {
        const active = edgeDropTarget?.placement === placement && edgeDropTarget.edge === edge;
        return (
          <div
            key={edge}
            className="workspace-ide-shell__dock-edge-drop-zone"
            data-ide-dock-edge-drop-zone={edge}
            data-ide-dock-edge-placement={placement}
            data-ide-dock-edge-drop-active={active ? "true" : "false"}
            aria-label={`${placementLabel(placement)} Dock ${dockDropEdgeLabel(edge)}拆分落点`}
            onDragOver={(event) => onDragPaneOverEdge(placement, edge, event)}
            onDragLeave={(event) => onLeavePaneEdge(placement, edge, event)}
            onDrop={(event) => onDropPaneOnEdge(placement, edge, event)}
          />
        );
      })}
    </>
  );
}

function dockDropEdgeLabel(edge: DockDropEdge): string {
  if (edge === "top") return "上侧";
  if (edge === "right") return "右侧";
  if (edge === "bottom") return "下侧";
  return "左侧";
}

function DockSplitHandle({
  placement,
  mode,
  value,
  onPointerDown,
  onKeyDown,
  onDoubleClick,
}: {
  placement: PanePlacement;
  mode: DockSplitMode;
  value: number;
  onPointerDown: (event: React.PointerEvent) => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  onDoubleClick: () => void;
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
      onDoubleClick={onDoubleClick}
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
    top: normalizeDockPaneSelection({ ...DEFAULT_DOCK_PANE_SELECTIONS.top, ...value?.top }, defaultPaneIdsForPlacement("top")),
    left: normalizeDockPaneSelection({ ...DEFAULT_DOCK_PANE_SELECTIONS.left, ...value?.left }, defaultPaneIdsForPlacement("left")),
    right: normalizeDockPaneSelection({ ...DEFAULT_DOCK_PANE_SELECTIONS.right, ...value?.right }, defaultPaneIdsForPlacement("right")),
    bottom: normalizeDockPaneSelection({ ...DEFAULT_DOCK_PANE_SELECTIONS.bottom, ...value?.bottom }, defaultPaneIdsForPlacement("bottom")),
  };
}

function normalizeDockPaneSelection(selection: Partial<Record<DockPaneRole, PaneId>>, paneIds: PaneId[]): Partial<Record<DockPaneRole, PaneId>> {
  if (selection.primary && selection.secondary === selection.primary) {
    return {
      ...selection,
      secondary: secondaryDockPane(paneIds, selection.primary),
    };
  }
  return selection;
}

function defaultPaneIdsForPlacement(placement: PanePlacement): PaneId[] {
  return PANE_REGISTRY.filter((pane) => pane.defaultPlacement === placement).map((pane) => pane.id);
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

function reorderPaneWithinPlacement(current: PaneOrder, paneId: PaneId, placement: PanePlacement, direction: "next" | "previous"): PaneOrder {
  const target = [...current[placement]];
  const index = target.indexOf(paneId);
  if (index < 0) return reorderPane(current, paneId, placement);
  const nextIndex = direction === "previous" ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= target.length) return current;
  [target[index], target[nextIndex]] = [target[nextIndex], target[index]];
  return { ...current, [placement]: target };
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

function dockPlacementIcon(placement: PanePlacement) {
  if (placement === "left") return <PanelLeft />;
  if (placement === "right") return <PanelRight />;
  return <PanelBottom />;
}

function upsertEditorTab(tabs: EditorTab[], tab: EditorTab): EditorTab[] {
  const withoutDuplicate = tabs.filter((item) => item.path !== tab.path || item.rootId !== tab.rootId);
  return [...withoutDuplicate, tab].slice(-8);
}

function mergeEditorTabs(primaryTabs: EditorTab[], secondaryTabs: EditorTab[]): EditorTab[] {
  return secondaryTabs.reduce((tabs, tab) => upsertEditorTab(tabs, tab), primaryTabs);
}

function reorderEditorTabs(tabs: EditorTab[], draggedTab: EditorTab, beforeTab: EditorTab): EditorTab[] {
  return insertEditorTabBefore(tabs, draggedTab, beforeTab);
}

function insertEditorTabBefore(tabs: EditorTab[], draggedTab: EditorTab, beforeTab: EditorTab): EditorTab[] {
  const withoutDragged = tabs.filter((item) => item.path !== draggedTab.path || item.rootId !== draggedTab.rootId);
  const targetIndex = withoutDragged.findIndex((item) => item.path === beforeTab.path && item.rootId === beforeTab.rootId);
  if (targetIndex < 0) return upsertEditorTab(tabs, draggedTab);
  const nextTabs = [...withoutDragged];
  nextTabs.splice(targetIndex, 0, draggedTab);
  return nextTabs;
}

function parseEditorTabDragPayload(value: string): (EditorTab & { group: EditorGroupId }) | null {
  try {
    const parsed = JSON.parse(value) as Partial<EditorTab & { group: EditorGroupId }>;
    if ((parsed.group === "primary" || parsed.group === "secondary") && typeof parsed.path === "string" && typeof parsed.rootId === "string") return { group: parsed.group, path: parsed.path, rootId: parsed.rootId };
  } catch {
    return null;
  }
  return null;
}

function editorTabLabel(path: string) {
  return path.split(/[\\\/]/).filter(Boolean).pop() ?? path;
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

function serializeIdeLayoutHistoryState(state: IdeLayoutState): string {
  return JSON.stringify(sanitizeIdeLayoutState(state));
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

function loadIdeDockSnapshots(): IdeDockSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IDE_DOCK_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as IdeDockSnapshot[];
    return sanitizeIdeDockSnapshots(value);
  } catch {
    return [];
  }
}

function storeIdeDockSnapshots(snapshots: IdeDockSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_DOCK_SNAPSHOTS_STORAGE_KEY, JSON.stringify(sanitizeIdeDockSnapshots(snapshots)));
  } catch {
    // Dock snapshots are local preferences; storage denial must not break the IDE shell.
  }
}

function loadIdeEditorGroupSnapshots(): IdeEditorGroupSnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(IDE_EDITOR_GROUP_SNAPSHOTS_STORAGE_KEY);
    if (!raw) return [];
    const value = JSON.parse(raw) as IdeEditorGroupSnapshot[];
    return sanitizeIdeEditorGroupSnapshots(value);
  } catch {
    return [];
  }
}

function storeIdeEditorGroupSnapshots(snapshots: IdeEditorGroupSnapshot[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_EDITOR_GROUP_SNAPSHOTS_STORAGE_KEY, JSON.stringify(sanitizeIdeEditorGroupSnapshots(snapshots)));
  } catch {
    // Editor group snapshots are local preferences; storage denial must not break the IDE shell.
  }
}

function sanitizeImportedLayoutSnapshots(value: unknown): IdeLayoutSnapshot[] {
  if (Array.isArray(value)) return sanitizeIdeLayoutSnapshots(value);
  if (value && typeof value === "object" && Array.isArray((value as { snapshots?: unknown }).snapshots)) {
    return sanitizeIdeLayoutSnapshots((value as { snapshots: unknown[] }).snapshots);
  }
  return [];
}

function mergeLayoutSnapshots(imported: IdeLayoutSnapshot[], current: IdeLayoutSnapshot[]): IdeLayoutSnapshot[] {
  const seen = new Set<string>();
  const merged: IdeLayoutSnapshot[] = [];
  for (const snapshot of [...imported, ...current]) {
    const id = snapshot.id || `layout-${Date.now()}-${merged.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push({ ...snapshot, id });
  }
  return sanitizeIdeLayoutSnapshots(merged).slice(0, MAX_LAYOUT_SNAPSHOTS);
}

function storeIdeLayoutState(state: IdeLayoutState) {
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
      name: sanitizeSnapshotName(snapshot.name, "工作台布局"),
      createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : new Date().toISOString(),
      state: sanitizeIdeLayoutState(snapshot.state ?? {}),
    }))
    .slice(0, MAX_LAYOUT_SNAPSHOTS);
}

function sanitizeIdeDockSnapshots(value: unknown): IdeDockSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((snapshot) => sanitizeIdeDockSnapshot(snapshot))
    .filter((snapshot): snapshot is IdeDockSnapshot => Boolean(snapshot))
    .slice(0, MAX_DOCK_SNAPSHOTS);
}

function sanitizeIdeDockSnapshot(value: unknown): IdeDockSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<IdeDockSnapshot>;
  if (!isPanePlacement(snapshot.placement)) return null;
  const placement = snapshot.placement;
  const paneIds = sanitizePaneIdList(snapshot.paneIds) ?? [];
  const hiddenPaneIds = sanitizePaneIdList(snapshot.hiddenPaneIds) ?? [];
  return {
    id: typeof snapshot.id === "string" ? snapshot.id : `dock-${placement}-${Date.now()}`,
    name: sanitizeSnapshotName(snapshot.name, `${placementLabel(placement)} Dock 组合`),
    createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : new Date().toISOString(),
    placement,
    paneIds,
    hiddenPaneIds,
    pinnedPaneIds: sanitizePaneIdList(snapshot.pinnedPaneIds)?.filter((paneId) => paneIds.includes(paneId) || hiddenPaneIds.includes(paneId)) ?? [],
    splitMode: isDockSplitMode(snapshot.splitMode) ? snapshot.splitMode : DEFAULT_DOCK_SPLIT_MODES[placement],
    splitRatio: typeof snapshot.splitRatio === "number" ? clamp(snapshot.splitRatio, SPLIT_RATIO_LIMITS.min, SPLIT_RATIO_LIMITS.max) : DEFAULT_DOCK_SPLIT_RATIOS[placement],
    paneSelection: normalizeDockPaneSelection(snapshot.paneSelection ?? {}, paneIds),
    open: typeof snapshot.open === "boolean" ? snapshot.open : true,
    size: sanitizePaneSize(placement, snapshot.size) ?? DEFAULT_PANE_SIZES[placement],
  };
}

function sanitizeIdeEditorGroupSnapshots(value: unknown): IdeEditorGroupSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((snapshot) => sanitizeIdeEditorGroupSnapshot(snapshot))
    .filter((snapshot): snapshot is IdeEditorGroupSnapshot => Boolean(snapshot))
    .slice(0, MAX_EDITOR_GROUP_SNAPSHOTS);
}

function sanitizeIdeEditorGroupSnapshot(value: unknown): IdeEditorGroupSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const snapshot = value as Partial<IdeEditorGroupSnapshot>;
  const editorSplitMode = isEditorSplitMode(snapshot.editorSplitMode) ? snapshot.editorSplitMode : "single";
  const splitEditorActive = editorSplitMode === "vertical" || editorSplitMode === "horizontal";
  return {
    id: typeof snapshot.id === "string" ? snapshot.id : `editor-groups-${Date.now()}`,
    name: sanitizeSnapshotName(snapshot.name, "编辑器组布局"),
    createdAt: typeof snapshot.createdAt === "string" ? snapshot.createdAt : new Date().toISOString(),
    activeEditorGroup: splitEditorActive && isEditorGroupId(snapshot.activeEditorGroup) ? snapshot.activeEditorGroup : "primary",
    activePath: sanitizeLayoutPath(snapshot.activePath),
    activePathRootId: sanitizeLayoutPath(snapshot.activePathRootId),
    secondaryPath: splitEditorActive ? sanitizeLayoutPath(snapshot.secondaryPath) : undefined,
    secondaryPathRootId: splitEditorActive ? sanitizeLayoutPath(snapshot.secondaryPathRootId) : undefined,
    editorGroupTabs: sanitizeEditorGroupTabs(snapshot.editorGroupTabs),
    editorSplitMode,
    editorSplitRatio: sanitizeEditorSplitRatio(snapshot.editorSplitRatio) ?? DEFAULT_EDITOR_SPLIT_RATIO,
  };
}

function sanitizeSnapshotName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 48) : "";
  return name || fallback;
}

function sanitizeIdeLayoutState(value: IdeLayoutState): IdeLayoutState {
  const editorSplitMode = isEditorSplitMode(value.editorSplitMode) ? value.editorSplitMode : undefined;
  const splitEditorActive = editorSplitMode === "vertical" || editorSplitMode === "horizontal";
  const activeEditorGroup = splitEditorActive && isEditorGroupId(value.activeEditorGroup) ? value.activeEditorGroup : "primary";
  return {
    topOpen: typeof value.topOpen === "boolean" ? value.topOpen : undefined,
    leftOpen: typeof value.leftOpen === "boolean" ? value.leftOpen : undefined,
    rightOpen: typeof value.rightOpen === "boolean" ? value.rightOpen : undefined,
    bottomOpen: typeof value.bottomOpen === "boolean" ? value.bottomOpen : undefined,
    maximizedPane: isMaximizedPane(value.maximizedPane) ? value.maximizedPane : undefined,
    layoutPreset: isLayoutPreset(value.layoutPreset) ? value.layoutPreset : undefined,
    activeEditorGroup,
    activePath: sanitizeLayoutPath(value.activePath),
    activePathRootId: sanitizeLayoutPath(value.activePathRootId),
    secondaryPath: splitEditorActive ? sanitizeLayoutPath(value.secondaryPath) : undefined,
    secondaryPathRootId: splitEditorActive ? sanitizeLayoutPath(value.secondaryPathRootId) : undefined,
    paneSizes: sanitizePaneSizes(value.paneSizes),
    editorSplitMode,
    editorSplitRatio: sanitizeEditorSplitRatio(value.editorSplitRatio),
    panePlacements: sanitizePanePlacements(value.panePlacements),
    paneOrder: sanitizePaneOrder(value.paneOrder),
    dockSplitModes: sanitizeDockSplitModes(value.dockSplitModes),
    dockSplitRatios: sanitizeDockSplitRatios(value.dockSplitRatios),
    dockPaneSelections: sanitizeDockPaneSelections(value.dockPaneSelections),
    editorGroupTabs: sanitizeEditorGroupTabs(value.editorGroupTabs),
    hiddenPanes: sanitizeHiddenPanes(value.hiddenPanes),
    pinnedPanes: sanitizePaneIdList(value.pinnedPanes),
    layoutLocked: typeof value.layoutLocked === "boolean" ? value.layoutLocked : undefined,
  };
}

function sanitizeLayoutPath(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isEditorGroupId(value: unknown): value is EditorGroupId {
  return value === "primary" || value === "secondary";
}

function sanitizeEditorGroupTabs(value: unknown): EditorGroupTabs {
  if (!value || typeof value !== "object") return { primary: [], secondary: [] };
  const tabs = value as Partial<EditorGroupTabs>;
  return {
    primary: sanitizeEditorTabs(tabs.primary),
    secondary: sanitizeEditorTabs(tabs.secondary),
  };
}

function sanitizeEditorTabs(value: unknown): EditorTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tabs: EditorTab[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const tab = item as Partial<EditorTab>;
    if (typeof tab.path !== "string" || typeof tab.rootId !== "string" || !tab.path || !tab.rootId) continue;
    const key = `${tab.rootId}:${tab.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    tabs.push({ path: tab.path, rootId: tab.rootId });
  }
  return tabs.slice(-12);
}

function sanitizeHiddenPanes(value: PaneId[] | undefined): PaneId[] | undefined {
  return sanitizePaneIdList(value);
}

function sanitizePaneIdList(value: PaneId[] | undefined): PaneId[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((paneId, index, panes) => isPaneId(paneId) && panes.indexOf(paneId) === index);
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
    selections[placement] = normalizeDockPaneSelection(nextSelection, defaultPaneIdsForPlacement(placement));
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
