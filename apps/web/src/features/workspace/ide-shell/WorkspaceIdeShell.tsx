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

type ActivityId = "explorer" | "search" | "git" | "terminal" | "ai" | "extensions";
type RightPanelId = "ai" | "outline" | "extensions";
type BottomPanelId = "terminal" | "problems" | "output";
type SaveState = "idle" | "dirty" | "saving" | "saved";
type MaximizedPane = "left" | "center" | "right" | "bottom" | null;
type LayoutPreset = "balanced" | "code" | "terminal";
type EditorGroupId = "primary" | "secondary";
type EditorSplitMode = "single" | "vertical" | "horizontal";

interface IdePaneSizes {
  left: number;
  right: number;
  bottom: number;
}

interface ActivityDescriptor {
  id: ActivityId;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  shortcut: string;
}

const ACTIVITIES: ActivityDescriptor[] = [
  { id: "explorer", label: "文件", icon: Files, shortcut: "⌘1" },
  { id: "search", label: "搜索", icon: Search, shortcut: "⌘2" },
  { id: "git", label: "Git", icon: GitBranch, shortcut: "⌘3" },
  { id: "terminal", label: "终端", icon: TerminalSquare, shortcut: "⌘4" },
  { id: "ai", label: "AI", icon: Bot, shortcut: "⌘5" },
  { id: "extensions", label: "扩展", icon: Braces, shortcut: "⌘6" },
];

const RIGHT_PANELS: Array<{ id: RightPanelId; label: string }> = [
  { id: "ai", label: "AI 上下文" },
  { id: "outline", label: "符号大纲" },
  { id: "extensions", label: "插件" },
];

const BOTTOM_PANELS: Array<{ id: BottomPanelId; label: string }> = [
  { id: "terminal", label: "终端" },
  { id: "problems", label: "问题" },
  { id: "output", label: "输出" },
];

const IDE_LAYOUT_STORAGE_KEY = "tracevane.workspace.ide-shell.layout.v1";

const DEFAULT_PANE_SIZES: IdePaneSizes = { left: 320, right: 340, bottom: 260 };
const CODE_PANE_SIZES: IdePaneSizes = { left: 280, right: 300, bottom: 190 };
const TERMINAL_PANE_SIZES: IdePaneSizes = { left: 300, right: 300, bottom: 380 };
const PANE_SIZE_LIMITS: Record<keyof IdePaneSizes, { min: number; max: number }> = {
  left: { min: 220, max: 560 },
  right: { min: 240, max: 560 },
  bottom: { min: 160, max: 520 },
};
const KEYBOARD_RESIZE_STEP = 16;
const KEYBOARD_RESIZE_LARGE_STEP = 40;
const DEFAULT_EDITOR_SPLIT_RATIO = 50;
const EDITOR_SPLIT_RATIO_LIMITS = { min: 25, max: 75 };

interface IdeLayoutState {
  leftOpen?: boolean;
  rightOpen?: boolean;
  bottomOpen?: boolean;
  maximizedPane?: MaximizedPane;
  layoutPreset?: LayoutPreset;
  paneSizes?: Partial<IdePaneSizes>;
  editorSplitMode?: EditorSplitMode;
  editorSplitRatio?: number;
}

const LazyWorkspaceTerminal = React.lazy(() =>
  import("../terminal/WorkspaceTerminal").then((module) => ({
    default: module.WorkspaceTerminal,
  })),
);

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
  const [activity, setActivity] = React.useState<ActivityId>("explorer");
  const [rightPanel, setRightPanel] = React.useState<RightPanelId>("ai");
  const [bottomPanel, setBottomPanel] = React.useState<BottomPanelId>("terminal");
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
  const [editorSplitRatio, setEditorSplitRatio] = React.useState(layoutState.editorSplitRatio ?? DEFAULT_EDITOR_SPLIT_RATIO);
  const [activeEditorGroup, setActiveEditorGroup] = React.useState<EditorGroupId>("primary");
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
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
  const searchSignalRef = React.useRef(0);

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
      leftOpen,
      rightOpen,
      bottomOpen,
      maximizedPane,
      layoutPreset,
      paneSizes,
      editorSplitMode,
      editorSplitRatio,
    });
  }, [bottomOpen, editorSplitMode, editorSplitRatio, layoutPreset, leftOpen, maximizedPane, paneSizes, rightOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }
      if (!mod || event.shiftKey || event.altKey) return;
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
        description: "恢复所有窗格、尺寸和最大化状态",
        risk: "safe",
        surface: "layout",
        icon: <RotateCcw />,
        run: resetLayout,
      },
    ],
    [bottomOpen, editorSplitMode, leftOpen, maximizedPane, rightOpen],
  );

  const commands = React.useMemo(
    () => [...layoutCommands, ...editorCommands, ...searchCommands, ...gitCommands, ...terminalCommands],
    [editorCommands, gitCommands, layoutCommands, searchCommands, terminalCommands],
  );

  function applyLayoutPreset(preset: LayoutPreset) {
    setLayoutPreset(preset);
    setMaximizedPane(null);
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
    setLeftOpen(true);
    setRightOpen(true);
    setBottomOpen(true);
    setMaximizedPane(null);
    closeEditorSplit();
  }

  function startPaneResize(pane: keyof IdePaneSizes, event: React.PointerEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = paneSizes[pane];
    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = pane === "bottom" ? startY - moveEvent.clientY : moveEvent.clientX - startX;
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

  function splitEditor(mode: Exclude<EditorSplitMode, "single">) {
    setEditorSplitMode(mode);
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    setSecondaryPath((current) => current ?? activePath);
    setSecondaryPathRootId((current) => current || activePathRootId || rootId);
    setActiveEditorGroup("secondary");
  }

  function closeEditorSplit() {
    setEditorSplitMode("single");
    setEditorSplitRatio(DEFAULT_EDITOR_SPLIT_RATIO);
    setActiveEditorGroup("primary");
  }

  function toggleMaximizedPane(pane: NonNullable<MaximizedPane>) {
    setMaximizedPane((current) => (current === pane ? null : pane));
  }

  function activateActivity(nextActivity: ActivityId) {
    setActivity(nextActivity);
    if (nextActivity === "terminal") {
      setBottomPanel("terminal");
      setBottomOpen(true);
      return;
    }
    setLeftOpen(true);
  }

  return (
    <main
      className="workspace-ide-shell"
      data-testid="workspace-ide-shell"
      data-ide-layout-preset={layoutPreset}
      data-ide-maximized-pane={maximizedPane ?? ""}
      data-ide-pane-size-state={`${paneSizes.left}:${paneSizes.right}:${paneSizes.bottom}`}
      data-ide-editor-split={editorSplitMode}
      style={{
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
        <div className="workspace-ide-shell__top-actions">
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
      </header>

      <div
        className={cn(
          "workspace-ide-shell__body",
          !leftOpen && "workspace-ide-shell__body--left-closed",
          !rightOpen && "workspace-ide-shell__body--right-closed",
          maximizedPane && `workspace-ide-shell__body--max-${maximizedPane}`,
        )}
      >
        <aside className="workspace-ide-shell__activity" aria-label="IDE activity rail">
          {ACTIVITIES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn("workspace-ide-shell__activity-button", activity === item.id && "is-active")}
                onClick={() => activateActivity(item.id)}
                title={`${item.label} ${item.shortcut}`}
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
          <section className="workspace-ide-shell__left-pane" data-testid="workspace-ide-left-pane">
            <PaneHeader title={activityLabel(activity)} subtitle={leftPaneSubtitle(activity)} />
            <LeftPane
              activity={activity}
              rootId={rootId}
              activePath={activePath}
              workspaceDirectory={workspaceDirectory}
              revealRequest={explorerRevealRequest}
              onOpenFile={openFile}
              onOpenDiff={openDiff}
              onChangeRoot={setRootId}
              onWorkspaceDirectoryChange={setWorkspaceDirectory}
              onSearchCommandsChange={setSearchCommands}
              onGitCommandsChange={setGitCommands}
              onRevealInExplorer={revealInExplorer}
              onFocusTerminal={() => {
                setBottomPanel("terminal");
                setBottomOpen(true);
              }}
            />
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

        <section className="workspace-ide-shell__center" data-testid="workspace-ide-center-pane" data-ide-pane="center">
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
            <section className="workspace-ide-shell__bottom" data-testid="workspace-ide-bottom-pane" data-ide-pane="bottom">
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
                {BOTTOM_PANELS.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    className={cn("workspace-ide-shell__panel-tab", bottomPanel === panel.id && "is-active")}
                    onClick={() => setBottomPanel(panel.id)}
                  >
                    {panel.label}
                  </button>
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
              <BottomPane
                panel={bottomPanel}
                workspaceDirectory={workspaceDirectory}
                onTerminalCommandsChange={setTerminalCommands}
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
          <aside className="workspace-ide-shell__right-pane" data-testid="workspace-ide-right-pane" data-ide-pane="right">
            <div className="workspace-ide-shell__right-tabs">
              {RIGHT_PANELS.map((panel) => (
                <button
                  key={panel.id}
                  type="button"
                  className={cn("workspace-ide-shell__right-tab", rightPanel === panel.id && "is-active")}
                  onClick={() => setRightPanel(panel.id)}
                >
                  {panel.label}
                </button>
              ))}
            </div>
            <RightPane
              panel={rightPanel}
              rootId={rootId}
              activePath={activePath}
              saveState={saveState}
              gitDiffTarget={gitDiffTarget}
              commandCount={commands.length}
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
        <span>尺寸: {paneSizes.left}/{paneSizes.right}/{paneSizes.bottom}</span>
        <span>编辑器: {editorSplitMode}/{Math.round(editorSplitRatio)}%</span>
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
  activity: ActivityId;
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
  panel: RightPanelId;
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

function BottomPane({
  panel,
  workspaceDirectory,
  onTerminalCommandsChange,
}: {
  panel: BottomPanelId;
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
  return <CodePane title="Output" lines={["Tracevane IDE shell mounted", "Explorer/Search/Git/Editor/Terminal are live components", "Provider route: /#/workspace?provider=ide"]} compact />;
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

function activityLabel(activity: ActivityId): string {
  return ACTIVITIES.find((item) => item.id === activity)?.label ?? activity;
}

function leftPaneSubtitle(activity: ActivityId): string {
  if (activity === "explorer") return "真实文件树、目录、上传与文件操作";
  if (activity === "search") return "真实全文搜索与替换";
  if (activity === "git") return "真实 Git 状态、diff 与提交";
  if (activity === "terminal") return "真实 xterm 终端在底部 Dock 运行";
  if (activity === "ai") return "IDE 上下文与证据边界";
  return "后续可替换为插件市场和 provider 管理";
}

function activityByShortcut(key: string): ActivityId | null {
  if (key === "1") return "explorer";
  if (key === "2") return "search";
  if (key === "3") return "git";
  if (key === "4") return "terminal";
  if (key === "5") return "ai";
  if (key === "6") return "extensions";
  return null;
}

function editorSplitKeyboardDelta(mode: EditorSplitMode, key: string, step: number): number {
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
  if (pane === "bottom" && typeof window !== "undefined") {
    return {
      min: PANE_SIZE_LIMITS.bottom.min,
      max: Math.min(PANE_SIZE_LIMITS.bottom.max, Math.round(window.innerHeight * 0.64)),
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

function storeIdeLayoutState(state: Required<IdeLayoutState>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(IDE_LAYOUT_STORAGE_KEY, JSON.stringify(sanitizeIdeLayoutState(state)));
  } catch {
    // Layout persistence is best-effort; private mode/storage denial must not break the IDE shell.
  }
}

function sanitizeIdeLayoutState(value: IdeLayoutState): IdeLayoutState {
  return {
    leftOpen: typeof value.leftOpen === "boolean" ? value.leftOpen : undefined,
    rightOpen: typeof value.rightOpen === "boolean" ? value.rightOpen : undefined,
    bottomOpen: typeof value.bottomOpen === "boolean" ? value.bottomOpen : undefined,
    maximizedPane: isMaximizedPane(value.maximizedPane) ? value.maximizedPane : undefined,
    layoutPreset: isLayoutPreset(value.layoutPreset) ? value.layoutPreset : undefined,
    paneSizes: sanitizePaneSizes(value.paneSizes),
    editorSplitMode: isEditorSplitMode(value.editorSplitMode) ? value.editorSplitMode : undefined,
    editorSplitRatio: sanitizeEditorSplitRatio(value.editorSplitRatio),
  };
}

function sanitizePaneSizes(value: Partial<IdePaneSizes> | undefined): Partial<IdePaneSizes> | undefined {
  if (!value) return undefined;
  const sizes: Partial<IdePaneSizes> = {};
  const left = sanitizePaneSize("left", value.left);
  const right = sanitizePaneSize("right", value.right);
  const bottom = sanitizePaneSize("bottom", value.bottom);
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
  return value === null || value === "left" || value === "center" || value === "right" || value === "bottom";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
