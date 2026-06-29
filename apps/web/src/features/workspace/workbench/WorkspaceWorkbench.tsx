import * as React from "react";
import {
  Box,
  ChevronDown,
  ChevronLeft,
  Command as CommandIcon,
  Expand,
  Menu,
  ExternalLink,
  FileCode2,
  Files,
  FolderTree,
  GitBranch,
  LayoutPanelTop,
  RotateCcw,
  Search,
  X,
  TerminalSquare,
} from "lucide-react";
import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import type { DockviewApi } from "dockview";

import "dockview-react/dist/styles/dockview.css";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { toast } from "@/design/ui/sonner";
import { navItemsByGroup } from "@/app/navigation";
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
import { WorkspaceCommandPalette } from "./WorkspaceCommandPalette";
import { runWorkspaceShortcutCommand } from "./workspaceCommandShortcuts";
import { deriveWorkspaceLayoutMode } from "./workbenchLayoutController";
import {
  createWorkspaceCommandRegistry,
  type WorkspaceCommand,
} from "./workspaceCommands";
import {
  applyWorkspaceKeymap,
  getWorkspaceKeybindingConflicts,
  loadWorkspaceKeymapOverrides,
  storeWorkspaceKeymapOverrides,
  type WorkspaceKeybindingOverride,
} from "./workspaceKeymap";
import "./workspace-workbench.css";

type SidePanel = "explorer" | "search" | "git";
type DockPanel = "editor" | "terminal" | SidePanel;
type SaveState = "idle" | "dirty" | "saving" | "saved";
interface WorkspaceTerminalInputRequest {
  id: string;
  value: string;
  label?: string;
}
interface WorkspaceEditorDockContextValue {
  activePath?: string;
  gitDiffTarget: WorkspaceGitDiffTarget | null;
  searchRequest: WorkspaceEditorSearchRequest | null;
  rootId: string;
  workspaceRootId: string;
  onSaveStateChange: (state: SaveState) => void;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  onTerminalCommandsChange: (commands: WorkspaceCommand[]) => void;
  onEditorCommandsChange: (commands: WorkspaceCommand[]) => void;
  onGitCommandsChange: (commands: WorkspaceCommand[]) => void;
  onSearchCommandsChange: (commands: WorkspaceCommand[]) => void;
  onRevealInExplorer: (path: string) => void;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onOpenDiff: (target: WorkspaceGitDiffTarget) => void;
  onChangeRoot: (rootId: string) => void;
  onWorkspaceDirectoryChange: (directory: WorkspaceDirectoryContext) => void;
  explorerRevealRequest: WorkspaceExplorerRevealRequest | null;
  onSplitTab: (path: string, direction: "right" | "down") => void;
  onMoveTabToGroup: (path: string) => void;
  terminalMaximized: boolean;
  terminalBrowserFullscreen: boolean;
  browserFullscreenAvailable: boolean;
  onToggleTerminalMaximize: () => void;
  onToggleTerminalBrowserFullscreen: () => void;
  terminalInputRequest: WorkspaceTerminalInputRequest | null;
}

const DEFAULT_SIDE_PANEL_WIDTH = 320;
const MIN_SIDE_PANEL_WIDTH = 240;
const DEFAULT_MOBILE_PANEL_HEIGHT = 42;
const MIN_MOBILE_PANEL_HEIGHT = 24;
const MAX_MOBILE_PANEL_HEIGHT = 100;
const FULLSCREEN_MOBILE_PANEL_HEIGHT = 96;
const MOBILE_PANEL_SNAP_POINTS = [30, 42, 58, 76, 100] as const;
const MOBILE_PANEL_DRAG_UPDATE_THRESHOLD = 0.6;
const WORKSPACE_LAYOUT_STORAGE_KEY = "tracevane.workspace.dockview.v2";
const WORKSPACE_SESSION_STORAGE_KEY = "tracevane.workspace.session.v1";
const WORKSPACE_PANEL_SIZE_STORAGE_KEY = "tracevane.workspace.panel-sizes.v1";
const WORKSPACE_DOCK_CONTROLS_COLLAPSED_STORAGE_KEY =
  "tracevane.workspace.dock-controls-collapsed.v1";
const WorkspaceEditorDockContext =
  React.createContext<WorkspaceEditorDockContextValue | null>(null);

const LazyWorkspaceTerminal = React.lazy(() =>
  import("../terminal/WorkspaceTerminal").then((module) => ({
    default: module.WorkspaceTerminal,
  })),
);

interface WorkspaceSessionState {
  rootId?: string;
  activePath?: string;
  activePathRootId?: string;
  gitDiffTarget?: WorkspaceGitDiffTarget | null;
  activeSidePanel?: SidePanel;
  sideOpen?: boolean;
}

interface WorkspacePanelSizeState {
  sidePanelWidth: number;
  mobilePanelHeightVh: number;
}

export function WorkspaceWorkbench() {
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

  const [sessionStateLoaded] = React.useState(() =>
    loadWorkspaceSessionState(),
  );
  const [rootId, setRootId] = React.useState(
    () => sessionStateLoaded.rootId ?? defaultRootId,
  );
  const [activePath, setActivePath] = React.useState<string | undefined>(
    () => sessionStateLoaded.activePath,
  );
  const [activePathRootId, setActivePathRootId] = React.useState<string>(
    () =>
      sessionStateLoaded.activePathRootId ?? sessionStateLoaded.rootId ?? "",
  );
  const [gitDiffTarget, setGitDiffTarget] =
    React.useState<WorkspaceGitDiffTarget | null>(
      () => sessionStateLoaded.gitDiffTarget ?? null,
    );
  const [searchRequest, setSearchRequest] =
    React.useState<WorkspaceEditorSearchRequest | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [workspaceDirectory, setWorkspaceDirectory] =
    React.useState<WorkspaceDirectoryContext | null>(null);
  const [explorerRevealRequest, setExplorerRevealRequest] =
    React.useState<WorkspaceExplorerRevealRequest | null>(null);
  const [activeSidePanel, setActiveSidePanel] = React.useState<SidePanel>(
    () => sessionStateLoaded.activeSidePanel ?? "explorer",
  );
  const [sideOpen, setSideOpen] = React.useState(
    () => sessionStateLoaded.sideOpen ?? true,
  );
  const [panelSizes, setPanelSizes] = React.useState<WorkspacePanelSizeState>(
    () => loadWorkspacePanelSizes(),
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [maximizedDockPanel, setMaximizedDockPanel] =
    React.useState<DockPanel | null>(null);
  const [gitCommands, setGitCommands] = React.useState<WorkspaceCommand[]>([]);
  const [searchCommands, setSearchCommands] = React.useState<WorkspaceCommand[]>([]);
  const [terminalCommands, setTerminalCommands] = React.useState<
    WorkspaceCommand[]
  >([]);
  const [editorCommands, setEditorCommands] = React.useState<
    WorkspaceCommand[]
  >([]);
  const [keymapOverrides, setKeymapOverrides] = React.useState<
    WorkspaceKeybindingOverride[]
  >(() => loadWorkspaceKeymapOverrides());
  const isMobileWorkbench = useMediaQuery("(max-width: 768px)");
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const [browserFullscreenPanel, setBrowserFullscreenPanel] =
    React.useState<DockPanel | null>(null);
  const [terminalDockOpen, setTerminalDockOpen] = React.useState(false);
  const [terminalInputRequest, setTerminalInputRequest] =
    React.useState<WorkspaceTerminalInputRequest | null>(null);
  const apiRef = React.useRef<DockviewApi | null>(null);
  const preMaximizeLayoutRef = React.useRef<ReturnType<
    DockviewApi["toJSON"]
  > | null>(null);
  const maximizedDockPanelRef = React.useRef<DockPanel | null>(null);
  const searchSignalRef = React.useRef(0);

  React.useEffect(() => {
    maximizedDockPanelRef.current = maximizedDockPanel;
  }, [maximizedDockPanel]);

  React.useEffect(() => {
    const syncFullscreenState = () => {
      if (document.fullscreenElement === shellRef.current) return;
      setBrowserFullscreenPanel(null);
    };
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("fullscreenerror", syncFullscreenState);
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("fullscreenerror", syncFullscreenState);
    };
  }, []);

  React.useEffect(() => {
    const onInsertTerminalInput = (event: Event) => {
      const detail = (event as CustomEvent<Partial<WorkspaceTerminalInputRequest>>)
        .detail;
      if (!detail?.value) return;
      setTerminalInputRequest({
        id:
          detail.id ||
          `terminal-input-${Date.now().toString(36)}-${Math.random()
            .toString(36)
            .slice(2, 8)}`,
        value: detail.value,
        label: detail.label,
      });
      ensureDockPanel(apiRef.current, "terminal")?.api.setActive();
      setTerminalDockOpen(true);
      setSideOpen(false);
    };
    window.addEventListener(
      "tracevane:workspace-terminal-insert-input",
      onInsertTerminalInput,
    );
    return () =>
      window.removeEventListener(
        "tracevane:workspace-terminal-insert-input",
        onInsertTerminalInput,
      );
  }, []);

  React.useEffect(() => {
    if (!roots.length) return;
    const savedRootAvailable = roots.some((item) => item.id === rootId);
    if (!rootId || !savedRootAvailable) {
      setRootId(defaultRootId);
      if (!savedRootAvailable) {
        setActivePath(undefined);
        setActivePathRootId(defaultRootId);
      }
    }
  }, [defaultRootId, rootId, roots]);

  React.useEffect(() => {
    storeWorkspaceSessionState({
      rootId,
      activePath,
      gitDiffTarget,
      activePathRootId,
      activeSidePanel,
      sideOpen,
    });
  }, [
    activePath,
    activePathRootId,
    activeSidePanel,
    gitDiffTarget,
    rootId,
    sideOpen,
  ]);

  React.useEffect(() => {
    const name = activePath?.split("/").pop() || "Editor";
    apiRef.current?.getPanel("editor")?.api.setTitle(name);
  }, [activePath]);

  React.useEffect(() => {
    storeWorkspacePanelSizes(panelSizes);
  }, [panelSizes]);

  const openFile = React.useCallback(
    (path: string, options?: WorkspaceOpenFileOptions) => {
      setGitDiffTarget(null);
      setActivePath(path);
      setActivePathRootId(options?.rootId ?? rootId);
      if (options?.initialSearch?.query) {
        setSearchRequest({
          path,
          query: options.initialSearch.query,
          caseSensitive: options.initialSearch.caseSensitive,
          regex: options.initialSearch.regex,
          signal: (searchSignalRef.current += 1),
        });
      }
      ensureDockPanel(apiRef.current, "editor")?.api.setActive();
    },
    [rootId],
  );

  const openDiff = React.useCallback(
    (target: WorkspaceGitDiffTarget) => {
      setGitDiffTarget(target);
      setActivePath(target.path);
      setActivePathRootId(rootId);
      ensureDockPanel(apiRef.current, "editor")?.api.setActive();
    },
    [rootId],
  );

  const revealInExplorer = React.useCallback((path: string) => {
    if (!path) return;
    setActiveSidePanel("explorer");
    setSideOpen(true);
    setExplorerRevealRequest({
      path,
      signal: Date.now(),
    });
  }, []);
  const splitEditorTab = React.useCallback(
    (path: string, direction: "right" | "down") => {
      if (!path) return;
      window.dispatchEvent(
        new CustomEvent("tracevane:workspace-editor-tab-split", {
          detail: { path, direction },
        }),
      );
      ensureDockPanel(apiRef.current, "editor")?.api.setActive();
      toast.info(
        direction === "right"
          ? "编辑器右侧拆分入口已预留"
          : "编辑器下方拆分入口已预留",
        {
          description:
            "后续会接入 Dockview editor group；当前已记录拆分意图，标签仍保留在当前编辑区。",
        },
      );
    },
    [],
  );

  const moveEditorTabToGroup = React.useCallback((path: string) => {
    if (!path) return;
    window.dispatchEvent(
      new CustomEvent("tracevane:workspace-editor-tab-move-to-group", {
        detail: { path },
      }),
    );
    ensureDockPanel(apiRef.current, "editor")?.api.setActive();
    toast.info("移动到新编辑组入口已预留", {
      description:
        "后续会接入 Dockview editor group；当前已记录移动意图，避免丢失标签上下文。",
    });
  }, []);

  const registerGitCommands = React.useCallback(
    (commands: WorkspaceCommand[]) => {
      setGitCommands(commands);
    },
    [],
  );

  const registerTerminalCommands = React.useCallback(
    (commands: WorkspaceCommand[]) => {
      setTerminalCommands(commands);
    },
    [],
  );

  const registerEditorCommands = React.useCallback(
    (commands: WorkspaceCommand[]) => {
      setEditorCommands(commands);
    },
    [],
  );

  const registerSearchCommands = React.useCallback(
    (commands: WorkspaceCommand[]) => {
      setSearchCommands(commands);
    },
    [],
  );

  const dockComponents = React.useMemo(
    () => ({
      editor: WorkspaceEditorDockPanel,
      terminal: WorkspaceTerminalDockPanel,
      explorer: WorkspaceExplorerDockPanel,
      search: WorkspaceSearchDockPanel,
      git: WorkspaceGitDockPanel,
    }),
    [],
  );

  const onReady = React.useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    const restored = restoreLayout(event.api);
    if (!restored) createDefaultLayout(event.api);
    const syncDockPresence = () => {
      setTerminalDockOpen(Boolean(event.api.getPanel("terminal")));
    };
    syncDockPresence();
    event.api.onDidLayoutChange(() => {
      syncDockPresence();
      if (!maximizedDockPanelRef.current) persistLayout(event.api);
    });
  }, []);

  const openSidePanel = React.useCallback(
    (panel: SidePanel) => {
      setSideOpen((open) => (activeSidePanel === panel ? !open : true));
      setActiveSidePanel(panel);
    },
    [activeSidePanel],
  );

  const showSidePanel = React.useCallback((panel: SidePanel) => {
    setActiveSidePanel(panel);
    setSideOpen(true);
  }, []);

  const openDockPanel = React.useCallback((panel: DockPanel) => {
    if (maximizedDockPanelRef.current) {
      restoreDockLayout(apiRef.current, preMaximizeLayoutRef, () =>
        setMaximizedDockPanel(null),
      );
    }
    ensureDockPanel(apiRef.current, panel)?.api.setActive();
    if (panel === "terminal") setTerminalDockOpen(true);
    if (isSideDockPanel(panel)) setActiveSidePanel(panel);
  }, []);

  const dockSidePanel = React.useCallback((panel: SidePanel) => {
    if (maximizedDockPanelRef.current) {
      restoreDockLayout(apiRef.current, preMaximizeLayoutRef, () =>
        setMaximizedDockPanel(null),
      );
    }
    ensureDockPanel(apiRef.current, panel)?.api.setActive();
    setActiveSidePanel(panel);
    setSideOpen(false);
    toast.success(`${sidePanelTitle(panel)} 已停靠到工作区`, {
      description: "可继续与编辑器、终端拆分组合，固定侧栏已收起以减少遮挡。",
    });
  }, []);

  const closeDockPanel = React.useCallback((panel: DockPanel) => {
    apiRef.current?.getPanel(panel)?.api.close();
    if (panel === "terminal") setTerminalDockOpen(false);
    setMaximizedDockPanel((current) => (current === panel ? null : current));
    setBrowserFullscreenPanel((current) =>
      current === panel ? null : current,
    );
    if (document.fullscreenElement === shellRef.current) {
      void document.exitFullscreen().catch(() => {
        // Browser fullscreen can already be leaving; keep local state cleared.
      });
    }
  }, []);

  const toggleMaximizedDockPanel = React.useCallback((panel: DockPanel) => {
    const api = apiRef.current;
    if (!api) return;
    if (maximizedDockPanelRef.current === panel) {
      restoreDockLayout(api, preMaximizeLayoutRef, () =>
        setMaximizedDockPanel(null),
      );
      return;
    }
    if (!preMaximizeLayoutRef.current) {
      preMaximizeLayoutRef.current = api.toJSON();
    }
    api.clear();
    api.addPanel(standaloneDockPanelSpec(panel)).api.setActive();
    setMaximizedDockPanel(panel);
  }, []);

  const exitDockImmersiveMode = React.useCallback(async () => {
    restoreDockLayout(apiRef.current, preMaximizeLayoutRef, () =>
      setMaximizedDockPanel(null),
    );
    if (document.fullscreenElement === shellRef.current) {
      try {
        await document.exitFullscreen();
      } catch {
        // Browser fullscreen can fail when the UA already left fullscreen.
      }
    }
    setBrowserFullscreenPanel(null);
  }, []);

  const toggleBrowserFullscreenDockPanel = React.useCallback(
    async (panel: DockPanel) => {
      const shell = shellRef.current;
      if (!shell || !document.fullscreenEnabled) {
        toggleMaximizedDockPanel(panel);
        return;
      }
      if (
        document.fullscreenElement === shell &&
        browserFullscreenPanel === panel
      ) {
        await exitDockImmersiveMode();
        return;
      }
      try {
        await shell.requestFullscreen({ navigationUI: "hide" });
        setBrowserFullscreenPanel(panel);
      } catch {
        setBrowserFullscreenPanel(null);
      }
    },
    [browserFullscreenPanel, exitDockImmersiveMode, toggleMaximizedDockPanel],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !maximizedDockPanelRef.current) return;
      event.preventDefault();
      void exitDockImmersiveMode();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [exitDockImmersiveMode]);

  const focusDockPanel = React.useCallback(
    (panel: DockPanel) => {
      openDockPanel(panel);
      if (isMobileWorkbench) setSideOpen(false);
    },
    [isMobileWorkbench, openDockPanel],
  );

  const toggleMobileTerminalPanel = React.useCallback(() => {
    const terminalPanel = apiRef.current?.getPanel("terminal");
    if (terminalDockOpen || terminalPanel) {
      closeDockPanel("terminal");
      return;
    }
    focusDockPanel("terminal");
  }, [closeDockPanel, focusDockPanel, terminalDockOpen]);

  const focusMobileEditorCanvas = React.useCallback(() => {
    setSideOpen(false);
    if (terminalDockOpen || apiRef.current?.getPanel("terminal")) {
      closeDockPanel("terminal");
    }
    focusDockPanel("editor");
  }, [closeDockPanel, focusDockPanel, terminalDockOpen]);

  const resetLayout = React.useCallback(() => {
    window.localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    window.localStorage.removeItem(WORKSPACE_PANEL_SIZE_STORAGE_KEY);
    setPanelSizes(defaultWorkspacePanelSizes());
    const api = apiRef.current;
    if (!api) return;
    api.clear();
    createDefaultLayout(api);
    persistLayout(api);
  }, []);
  const resizeSidePanel = React.useCallback((width: number) => {
    setPanelSizes((current) => ({
      ...current,
      sidePanelWidth: Math.max(width, MIN_SIDE_PANEL_WIDTH),
    }));
  }, []);
  const resizeMobilePanel = React.useCallback((heightVh: number) => {
    setPanelSizes((current) => ({
      ...current,
      mobilePanelHeightVh: clamp(
        heightVh,
        MIN_MOBILE_PANEL_HEIGHT,
        MAX_MOBILE_PANEL_HEIGHT,
      ),
    }));
  }, []);
  const resetKeymap = React.useCallback(() => {
    setKeymapOverrides([]);
    storeWorkspaceKeymapOverrides([]);
  }, []);
  const editorDockContext = React.useMemo<WorkspaceEditorDockContextValue>(
    () => ({
      activePath,
      gitDiffTarget,
      searchRequest,
      rootId: activePathRootId || rootId,
      workspaceRootId: rootId,
      onSaveStateChange: setSaveState,
      workspaceDirectory,
      onTerminalCommandsChange: registerTerminalCommands,
      onEditorCommandsChange: registerEditorCommands,
      onGitCommandsChange: registerGitCommands,
      onSearchCommandsChange: registerSearchCommands,
      onOpenFile: openFile,
      onOpenDiff: openDiff,
      onChangeRoot: setRootId,
      onWorkspaceDirectoryChange: setWorkspaceDirectory,
      explorerRevealRequest,
      onRevealInExplorer: revealInExplorer,
      onSplitTab: splitEditorTab,
      onMoveTabToGroup: moveEditorTabToGroup,
      terminalMaximized: maximizedDockPanel === "terminal",
      terminalBrowserFullscreen: browserFullscreenPanel === "terminal",
      browserFullscreenAvailable: Boolean(document.fullscreenEnabled),
      terminalInputRequest,
      onToggleTerminalMaximize: () => toggleMaximizedDockPanel("terminal"),
      onToggleTerminalBrowserFullscreen: () =>
        void toggleBrowserFullscreenDockPanel("terminal"),
    }),
    [
      activePath,
      gitDiffTarget,
      activePathRootId,
      explorerRevealRequest,
      openDiff,
      openFile,
      registerGitCommands,
      registerTerminalCommands,
      registerEditorCommands,
      registerSearchCommands,
      moveEditorTabToGroup,
      revealInExplorer,
      rootId,
      searchRequest,
      splitEditorTab,
      workspaceDirectory,
      maximizedDockPanel,
      browserFullscreenPanel,
      terminalInputRequest,
      toggleMaximizedDockPanel,
      toggleBrowserFullscreenDockPanel,
    ],
  );

  const defaultKeybindingConflicts = React.useMemo(
    () =>
      getWorkspaceKeybindingConflicts(
        createWorkspaceCommandRegistry({
          activePath,
          sideOpen,
          openSidePanel: showSidePanel,
          dockSidePanel,
          openDockPanel: focusDockPanel,
          closeDockPanel,
          toggleMaximizedDockPanel,
          closeSidePanel: () => setSideOpen(false),
          resetLayout,
          resetKeymap,
          keybindingOverrideCount: keymapOverrides.length,
          extensionCommands: [
            ...gitCommands,
            ...searchCommands,
            ...terminalCommands,
            ...editorCommands,
          ],
        }),
      ),
    [
      activePath,
      editorCommands,
      dockSidePanel,
      focusDockPanel,
      gitCommands,
      keymapOverrides.length,
      searchCommands,
      resetKeymap,
      resetLayout,
      closeDockPanel,
      toggleMaximizedDockPanel,
      showSidePanel,
      sideOpen,
      terminalCommands,
    ],
  );

  const defaultWorkspaceCommands = React.useMemo(
    () =>
      createWorkspaceCommandRegistry({
        activePath,
        sideOpen,
        openSidePanel: showSidePanel,
        dockSidePanel,
        openDockPanel: focusDockPanel,
        closeDockPanel,
        toggleMaximizedDockPanel,
        closeSidePanel: () => setSideOpen(false),
        resetLayout,
        resetKeymap,
        keybindingOverrideCount: keymapOverrides.length,
        keybindingConflictCount: defaultKeybindingConflicts.length,
        extensionCommands: [
          ...gitCommands,
          ...searchCommands,
          ...terminalCommands,
          ...editorCommands,
        ],
      }),
    [
      activePath,
      editorCommands,
      dockSidePanel,
      focusDockPanel,
      gitCommands,
      keymapOverrides.length,
      defaultKeybindingConflicts.length,
      searchCommands,
      resetKeymap,
      resetLayout,
      closeDockPanel,
      toggleMaximizedDockPanel,
      showSidePanel,
      sideOpen,
      terminalCommands,
    ],
  );
  const workspaceCommands = React.useMemo(
    () => applyWorkspaceKeymap(defaultWorkspaceCommands, keymapOverrides),
    [defaultWorkspaceCommands, keymapOverrides],
  );
  const keybindingConflicts = React.useMemo(
    () => getWorkspaceKeybindingConflicts(workspaceCommands),
    [workspaceCommands],
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && event.shiftKey && key === "p") {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
        return;
      }
      runWorkspaceShortcutCommand(event, workspaceCommands);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [workspaceCommands]);

  const sidePanelNode = sideOpen ? (
    <WorkbenchSidePanel
      panel={activeSidePanel}
      rootId={rootId}
      activePath={activePath}
      onOpenFile={openFile}
      onOpenDiff={openDiff}
      onChangeRoot={setRootId}
      onWorkspaceDirectoryChange={setWorkspaceDirectory}
      onGitCommandsChange={registerGitCommands}
      onSearchCommandsChange={registerSearchCommands}
      onRevealInExplorer={revealInExplorer}
      explorerRevealRequest={explorerRevealRequest}
    />
  ) : null;
  const mobilePanelFullscreen =
    isMobileWorkbench &&
    sideOpen &&
    panelSizes.mobilePanelHeightVh >= FULLSCREEN_MOBILE_PANEL_HEIGHT;
  const mobileSidePanelOverTerminal =
    isMobileWorkbench &&
    sideOpen &&
    (maximizedDockPanel === "terminal" || browserFullscreenPanel === "terminal");
  const layoutMode = deriveWorkspaceLayoutMode({
    browserFullscreenPanel,
    isMobileWorkbench,
    maximizedDockPanel,
    mobilePanelFullscreen,
  });

  return (
    <div
      ref={shellRef}
      className={cn(
        "grid h-dvh w-screen overflow-hidden bg-canvas text-ink",
        layoutMode.shellImmersive && "workspace-shell-immersive",
        layoutMode.mobileBrowserFullscreen &&
          "workspace-mobile-browser-fullscreen",
        isMobileWorkbench
          ? "grid-rows-[40px_minmax(0,1fr)_auto]"
          : "grid-rows-[40px_minmax(0,1fr)_24px]",
      )}
      data-workspace-responsive-shell
      data-workspace-mobile={isMobileWorkbench ? "true" : "false"}
      data-workspace-browser-fullscreen-panel={browserFullscreenPanel ?? ""}
      data-workspace-layout-controller="unified-v1"
      data-workspace-layout-mode={layoutMode.shellMode}
      data-workspace-mobile-panel-nav-reserved={
        layoutMode.reserveMobileNav ? "true" : "false"
      }
      style={
        isMobileWorkbench
          ? ({
              "--workspace-mobile-nav-height":
                "calc(3.75rem + env(safe-area-inset-bottom))",
            } as React.CSSProperties)
          : undefined
      }
    >
      <WorkbenchTopBar
        rootId={rootId}
        activePath={activePath}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onResetLayout={resetLayout}
      />
      <div
        className={cn(
          "relative grid min-h-0 overflow-hidden",
          maximizedDockPanel && "workspace-dock-maximized",
          isMobileWorkbench &&
            (sideOpen
              ? "grid-rows-[minmax(0,1fr)_minmax(0,var(--workspace-mobile-panel-height))]"
              : "grid-rows-[minmax(0,1fr)]"),
        )}
        style={
          isMobileWorkbench
            ? ({
                "--workspace-mobile-panel-height": `${panelSizes.mobilePanelHeightVh}dvh`,
              } as React.CSSProperties)
            : {
                gridTemplateColumns: `48px ${
                  sideOpen ? `${panelSizes.sidePanelWidth}px` : "0px"
                } minmax(0,1fr)`,
              }
        }
        data-workspace-main-stage
        data-workspace-maximized-dock={maximizedDockPanel ?? ""}
        data-workspace-immersive-panel={maximizedDockPanel ?? ""}
        data-workspace-mobile-inline-panels={
          isMobileWorkbench ? "bottom-drawer" : "desktop-side-panel"
        }
      >
        {!isMobileWorkbench ? (
          <WorkbenchActivityBar
            activeSidePanel={activeSidePanel}
            sideOpen={sideOpen}
            onOpenSide={openSidePanel}
            onDockSide={dockSidePanel}
            onOpenDock={focusDockPanel}
          />
        ) : null}
        {!isMobileWorkbench ? (
          <div
            className={cn(
              "min-h-0 min-w-0 overflow-hidden border-r border-line bg-panel transition-[width,opacity] duration-150",
              !sideOpen && "pointer-events-none opacity-0",
            )}
            aria-hidden={!sideOpen}
          >
            {sidePanelNode}
          </div>
        ) : null}
        {!isMobileWorkbench && sideOpen ? (
          <WorkbenchSidePanelResizeHandle
            width={panelSizes.sidePanelWidth}
            onResize={resizeSidePanel}
          />
        ) : null}
        <WorkspaceEditorDockContext.Provider value={editorDockContext}>
          <div className="tracevane-dockview dockview-theme-light relative min-h-0 min-w-0">
            {layoutMode.showDockQuickControls &&
            maximizedDockPanel !== "terminal" &&
            browserFullscreenPanel !== "terminal" ? (
              <WorkbenchDockQuickControls
                maximizedDockPanel={maximizedDockPanel}
                browserFullscreenPanel={browserFullscreenPanel}
                browserFullscreenAvailable={Boolean(document.fullscreenEnabled)}
                activeSidePanel={activeSidePanel}
                sideOpen={sideOpen}
                terminalDockOpen={terminalDockOpen}
                onToggleMaximized={toggleMaximizedDockPanel}
                onToggleBrowserFullscreen={toggleBrowserFullscreenDockPanel}
                onToggleSidePanel={openSidePanel}
                onDockSidePanel={dockSidePanel}
                onToggleTerminal={() => focusDockPanel("terminal")}
                onCloseDock={closeDockPanel}
                onExitImmersive={() => void exitDockImmersiveMode()}
              />
            ) : null}
            <DockviewReact
              components={dockComponents}
              onReady={onReady}
              className="h-full w-full"
              disableFloatingGroups={false}
              singleTabMode="default"
            />
          </div>
        </WorkspaceEditorDockContext.Provider>
        {isMobileWorkbench && sideOpen ? (
          <WorkbenchMobilePanelDock
            id={mobileSidePanelDockId(activeSidePanel)}
            title={sidePanelTitle(activeSidePanel)}
            heightVh={panelSizes.mobilePanelHeightVh}
            overTerminal={mobileSidePanelOverTerminal}
            onResize={resizeMobilePanel}
            onClose={() => setSideOpen(false)}
          >
            {sidePanelNode}
          </WorkbenchMobilePanelDock>
        ) : null}
      </div>
      <WorkspaceCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={workspaceCommands}
        keybindingConflicts={keybindingConflicts}
      />
      {isMobileWorkbench ? (
        <WorkbenchMobileNav
          activeSidePanel={activeSidePanel}
          sideOpen={sideOpen}
          onOpenSide={openSidePanel}
          onDockSide={dockSidePanel}
          onFocusEditor={focusMobileEditorCanvas}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onToggleTerminal={toggleMobileTerminalPanel}
          terminalOpen={terminalDockOpen}
          overlay={layoutMode.mobileNavOverlay}
          mobilePanelHeightVh={panelSizes.mobilePanelHeightVh}
          onSetMobilePanelHeight={resizeMobilePanel}
          onCloseSidePanel={() => setSideOpen(false)}
          mobileSidePanelId={
            sideOpen ? mobileSidePanelDockId(activeSidePanel) : undefined
          }
        />
      ) : (
        <WorkbenchStatusBar
          rootId={rootId}
          activePath={activePath}
          saveState={saveState}
        />
      )}
    </div>
  );
}

function WorkspaceEditorDockPanel() {
  const context = React.useContext(WorkspaceEditorDockContext);
  if (!context) return null;
  return (
    <WorkspaceEditorStage
      openFile={context.activePath}
      gitDiffTarget={context.gitDiffTarget}
      searchRequest={context.searchRequest}
      rootId={context.rootId}
      workspaceRootId={context.workspaceRootId}
      workspaceRootAbsolutePath={context.workspaceDirectory?.rootAbsolutePath ?? ""}
      onSaveStateChange={context.onSaveStateChange}
      onCommandsChange={context.onEditorCommandsChange}
      onRevealInExplorer={context.onRevealInExplorer}
      onSplitTab={context.onSplitTab}
      onMoveTabToGroup={context.onMoveTabToGroup}
    />
  );
}

function WorkspaceExplorerDockPanel() {
  return <WorkspaceSideDockPanel panel="explorer" />;
}

function WorkspaceSearchDockPanel() {
  return <WorkspaceSideDockPanel panel="search" />;
}

function WorkspaceGitDockPanel() {
  return <WorkspaceSideDockPanel panel="git" />;
}

function WorkspaceSideDockPanel({ panel }: { panel: SidePanel }) {
  const context = React.useContext(WorkspaceEditorDockContext);
  if (!context) return null;
  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-panel"
      data-workspace-side-dock-panel={panel}
    >
      <WorkbenchSidePanel
        panel={panel}
        rootId={context.workspaceRootId}
        activePath={context.activePath}
        onOpenFile={context.onOpenFile}
        onOpenDiff={context.onOpenDiff}
        onChangeRoot={context.onChangeRoot}
        onWorkspaceDirectoryChange={context.onWorkspaceDirectoryChange}
        onGitCommandsChange={context.onGitCommandsChange}
        onSearchCommandsChange={context.onSearchCommandsChange}
        onRevealInExplorer={context.onRevealInExplorer}
        explorerRevealRequest={context.explorerRevealRequest}
      />
    </div>
  );
}

function WorkspaceTerminalDockPanel() {
  const context = React.useContext(WorkspaceEditorDockContext);
  return (
    <React.Suspense fallback={<TerminalLoadingState />}>
      <LazyWorkspaceTerminal
        workspaceDirectory={context?.workspaceDirectory ?? undefined}
        onCommandsChange={context?.onTerminalCommandsChange}
        maximized={context?.terminalMaximized ?? false}
        browserFullscreen={context?.terminalBrowserFullscreen ?? false}
        browserFullscreenAvailable={
          context?.browserFullscreenAvailable ?? false
        }
        onToggleMaximize={context?.onToggleTerminalMaximize}
        onToggleBrowserFullscreen={context?.onToggleTerminalBrowserFullscreen}
        inputRequest={context?.terminalInputRequest ?? null}
      />
    </React.Suspense>
  );
}

function WorkbenchTopBar({
  rootId,
  activePath,
  onOpenCommandPalette,
  onResetLayout,
}: {
  rootId: string;
  activePath?: string;
  onOpenCommandPalette: () => void;
  onResetLayout: () => void;
}) {
  const [projectNavOpen, setProjectNavOpen] = React.useState(false);
  return (
    <header className="relative flex min-w-0 items-center gap-2 border-b border-line bg-panel px-2">
      <button
        type="button"
        className="flex h-7 items-center gap-2 rounded-md border border-line bg-panel-2 px-2 text-xs font-semibold text-ink-strong outline-none hover:bg-panel-3 focus-visible:shadow-[var(--ring)]"
        onClick={() => setProjectNavOpen((open) => !open)}
        aria-expanded={projectNavOpen}
        aria-haspopup="menu"
        data-workspace-project-navigation-trigger
        title="打开 Tracevane 项目导航"
      >
        <Menu className="size-3.5 text-muted" />
        <Box className="size-4 text-primary" />
        <span className="hidden sm:inline">Tracevane Workspace</span>
        <span className="sm:hidden">Workspace</span>
        <ChevronDown className="size-3 text-subtle" />
      </button>
      {projectNavOpen ? (
        <WorkspaceProjectNavigationMenu
          onClose={() => setProjectNavOpen(false)}
        />
      ) : null}
      <div className="mx-1 hidden h-5 w-px bg-line md:block" />
      <div className="min-w-0 flex-1 truncate text-xs text-muted">
        <span className="font-semibold text-ink-strong">
          {rootId || "workspace"}
        </span>
        {activePath ? (
          <span className="ml-2 text-primary">{activePath}</span>
        ) : (
          <span className="ml-2">选择左侧文件开始编辑</span>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7"
        onClick={onOpenCommandPalette}
        data-workspace-command-palette-trigger
      >
        <CommandIcon className="size-3.5" />
        命令
        <span className="hidden font-mono text-[11px] text-subtle md:inline">
          ⌘⇧P
        </span>
      </Button>
      <Button variant="ghost" size="sm" className="h-7" onClick={onResetLayout}>
        <RotateCcw className="size-3.5" />
        重置布局
      </Button>
    </header>
  );
}

function WorkspaceProjectNavigationMenu({ onClose }: { onClose: () => void }) {
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="absolute left-2 top-9 z-50 w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-xl border border-line bg-panel shadow-2xl"
      role="menu"
      aria-label="Tracevane 项目导航"
      data-workspace-project-navigation-menu
      data-workspace-project-navigation-dismissable
    >
      <div className="border-b border-line bg-panel-2 px-3 py-2 text-xs font-semibold text-ink-strong">
        Tracevane 功能域
      </div>
      <div className="max-h-[70dvh] overflow-auto p-2">
        {navItemsByGroup().map((group) => (
          <div key={group.group} className="mb-2 last:mb-0">
            <div className="px-2 py-1 text-2xs font-semibold uppercase tracking-wide text-subtle">
              {group.group}
            </div>
            {group.items
              .filter((item) => item.status === "ready")
              .map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.path}
                    href={`#${item.path}`}
                    role="menuitem"
                    className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
                    onClick={onClose}
                    data-workspace-project-navigation-link={item.path}
                  >
                    {Icon ? (
                      <Icon className="size-4 shrink-0 text-primary" />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {item.subtitle}
                      </span>
                    </span>
                    {item.path !== "/workspace" ? (
                      <ExternalLink className="size-3.5 shrink-0 text-subtle" />
                    ) : null}
                  </a>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkbenchActivityBar({
  activeSidePanel,
  sideOpen,
  onOpenSide,
  onDockSide,
  onOpenDock,
}: {
  activeSidePanel: SidePanel;
  sideOpen: boolean;
  onOpenSide: (panel: SidePanel) => void;
  onDockSide: (panel: SidePanel) => void;
  onOpenDock: (panel: DockPanel) => void;
}) {
  return (
    <nav
      aria-label="Workspace 活动"
      className="flex flex-col items-center gap-1 border-r border-line bg-panel-2 py-2"
    >
      <ActivityButton
        label="资源管理器"
        icon={<Files />}
        onClick={() => onOpenSide("explorer")}
        onContextMenu={() => onDockSide("explorer")}
        active={sideOpen && activeSidePanel === "explorer"}
      />
      <ActivityButton
        label="搜索"
        icon={<Search />}
        onClick={() => onOpenSide("search")}
        onContextMenu={() => onDockSide("search")}
        active={sideOpen && activeSidePanel === "search"}
      />
      <ActivityButton
        label="Git"
        icon={<GitBranch />}
        onClick={() => onOpenSide("git")}
        onContextMenu={() => onDockSide("git")}
        active={sideOpen && activeSidePanel === "git"}
      />
      <div className="my-1 h-px w-7 bg-line" />
      <ActivityButton
        label="编辑器"
        icon={<FileCode2 />}
        onClick={() => onOpenDock("editor")}
      />
      <ActivityButton
        label="终端"
        icon={<TerminalSquare />}
        onClick={() => onOpenDock("terminal")}
      />
    </nav>
  );
}

function ActivityButton({
  label,
  icon,
  onClick,
  onContextMenu,
  active = false,
}: {
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  onClick: () => void;
  onContextMenu?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        onContextMenu();
      }}
      data-workspace-activity-dock-context={onContextMenu ? "true" : undefined}
      className={cn(
        "relative grid size-9 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "bg-primary-soft text-primary",
      )}
    >
      {React.cloneElement(icon, { className: "size-[18px]" })}
      {active ? (
        <span
          aria-hidden
          className="absolute left-[-6px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r bg-primary"
        />
      ) : null}
    </button>
  );
}

function WorkbenchSidePanel({
  panel,
  rootId,
  activePath,
  onOpenFile,
  onOpenDiff,
  onChangeRoot,
  onWorkspaceDirectoryChange,
  onGitCommandsChange,
  onSearchCommandsChange,
  onRevealInExplorer,
  explorerRevealRequest,
}: {
  panel: SidePanel;
  rootId: string;
  activePath?: string;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onOpenDiff: (target: WorkspaceGitDiffTarget) => void;
  onChangeRoot: (rootId: string) => void;
  onWorkspaceDirectoryChange: (directory: WorkspaceDirectoryContext) => void;
  onGitCommandsChange: (commands: WorkspaceCommand[]) => void;
  onSearchCommandsChange: (commands: WorkspaceCommand[]) => void;
  onRevealInExplorer: (path: string) => void;
  explorerRevealRequest?: WorkspaceExplorerRevealRequest | null;
}) {
  if (panel === "search") {
    return (
      <WorkspaceSearchPanel
        rootId={rootId}
        onOpenFile={onOpenFile}
        onCommandsChange={onSearchCommandsChange}
      />
    );
  }
  if (panel === "git") {
    return (
      <WorkspaceGitPanel
        rootId={rootId}
        onOpenDiff={onOpenDiff}
        onOpenFile={onOpenFile}
        onRevealInExplorer={onRevealInExplorer}
        onCommandsChange={onGitCommandsChange}
      />
    );
  }
  return (
    <WorkspaceExplorer
      rootId={rootId}
      selectedPath={activePath}
      onSelectFile={onOpenFile}
      onChangeRoot={onChangeRoot}
      onWorkspaceDirectoryChange={onWorkspaceDirectoryChange}
      revealRequest={explorerRevealRequest}
    />
  );
}

function WorkbenchSidePanelResizeHandle({
  width,
  onResize,
}: {
  width: number;
  onResize: (width: number) => void;
}) {
  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    const move = (moveEvent: PointerEvent) => {
      onResize(startWidth + moveEvent.clientX - startX);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };

  return (
    <button
      type="button"
      aria-label="调整侧边面板宽度"
      title="拖拽调整侧边面板宽度"
      className="absolute bottom-0 top-0 z-20 w-2 -translate-x-1 cursor-col-resize bg-transparent outline-none transition-colors hover:bg-primary-soft focus-visible:bg-primary-soft"
      style={{ left: 48 + width }}
      onPointerDown={startDrag}
      data-workspace-side-panel-resizer
    />
  );
}

function WorkbenchDockQuickControls({
  maximizedDockPanel,
  browserFullscreenPanel,
  browserFullscreenAvailable,
  activeSidePanel,
  sideOpen,
  terminalDockOpen,
  onToggleMaximized,
  onToggleBrowserFullscreen,
  onToggleSidePanel,
  onDockSidePanel,
  onToggleTerminal,
  onCloseDock,
  onExitImmersive,
}: {
  maximizedDockPanel: DockPanel | null;
  browserFullscreenPanel: DockPanel | null;
  browserFullscreenAvailable: boolean;
  activeSidePanel: SidePanel;
  sideOpen: boolean;
  terminalDockOpen: boolean;
  onToggleMaximized: (panel: DockPanel) => void;
  onToggleBrowserFullscreen: (panel: DockPanel) => void;
  onToggleSidePanel: (panel: SidePanel) => void;
  onDockSidePanel: (panel: SidePanel) => void;
  onToggleTerminal: () => void;
  onCloseDock: (panel: DockPanel) => void;
  onExitImmersive: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(() =>
    loadWorkspaceDockControlsCollapsed(),
  );
  const setDockControlsCollapsed = React.useCallback((next: boolean) => {
    setCollapsed(next);
    storeWorkspaceDockControlsCollapsed(next);
  }, []);
  if (collapsed) {
    return (
      <button
        type="button"
        className={cn(
          "pointer-events-auto absolute right-0 top-2 z-30 flex h-9 items-center gap-1 rounded-l-full border border-r-0 border-line bg-panel/90 px-2 text-xs font-medium text-primary shadow-lg backdrop-blur outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
          maximizedDockPanel &&
            "right-0 top-[max(0.75rem,env(safe-area-inset-top))]",
        )}
        onClick={() => setDockControlsCollapsed(false)}
        aria-label="展开工作台悬浮控件"
        title="展开工作台悬浮控件"
        data-workspace-dock-quick-controls
        data-workspace-dock-controls-collapsed="true"
        data-workspace-dock-controls-edge-toggle="collapsed"
      >
        <ChevronLeft className="size-3.5" />
        工作台
      </button>
    );
  }
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-0 top-2 z-30 flex items-center gap-1 rounded-l-lg border border-r-0 border-line bg-panel/85 p-1 shadow-lg backdrop-blur",
        maximizedDockPanel &&
          "right-0 top-[max(0.75rem,env(safe-area-inset-top))]",
      )}
      data-workspace-dock-quick-controls
      data-workspace-dock-controls-collapsed="false"
      data-workspace-immersive-controls={maximizedDockPanel ?? ""}
    >
      <DockQuickButton
        label="收起工作台悬浮控件"
        onClick={() => setDockControlsCollapsed(true)}
        dataAttr="collapse-controls"
      >
        <ChevronLeft className="rotate-180" />
      </DockQuickButton>
      {maximizedDockPanel ? (
        <span className="pointer-events-auto hidden px-2 text-xs font-medium text-muted sm:inline">
          沉浸模式 · Esc 退出
        </span>
      ) : null}
      <span className="pointer-events-auto flex items-center gap-1 border-r border-line pr-1">
        <DockQuickButton
          label={`将${sidePanelTitle(activeSidePanel)}停靠到工作区`}
          onClick={() => onDockSidePanel(activeSidePanel)}
          dataAttr="side-panel-compose"
        >
          <FolderTree />
        </DockQuickButton>
        <DockQuickButton
          label={terminalDockOpen ? "聚焦终端" : "打开终端组合"}
          onClick={onToggleTerminal}
          active={terminalDockOpen}
          dataAttr="terminal-compose"
        >
          <LayoutPanelTop />
        </DockQuickButton>
      </span>
      <DockQuickButton
        label={
          maximizedDockPanel === "editor"
            ? "恢复编辑/预览区"
            : "最大化编辑/预览区"
        }
        onClick={() =>
          maximizedDockPanel === "editor"
            ? onExitImmersive()
            : onToggleMaximized("editor")
        }
        active={maximizedDockPanel === "editor"}
      >
        <Expand />
      </DockQuickButton>
      <DockQuickButton
        label={
          maximizedDockPanel === "terminal" ? "恢复终端区" : "最大化终端区"
        }
        onClick={() =>
          maximizedDockPanel === "terminal"
            ? onExitImmersive()
            : onToggleMaximized("terminal")
        }
        active={maximizedDockPanel === "terminal"}
      >
        <TerminalSquare />
      </DockQuickButton>
      <DockQuickButton
        label={
          browserFullscreenPanel
            ? "退出浏览器全屏"
            : browserFullscreenAvailable
              ? "浏览器全屏当前区域"
              : "当前浏览器不支持全屏，使用沉浸模式"
        }
        onClick={() =>
          onToggleBrowserFullscreen(maximizedDockPanel ?? "editor")
        }
        active={Boolean(browserFullscreenPanel)}
        dataAttr="browser-fullscreen"
      >
        <Expand />
      </DockQuickButton>
      <DockQuickButton
        label={maximizedDockPanel ? "退出沉浸模式" : "关闭终端面板"}
        onClick={
          maximizedDockPanel ? onExitImmersive : () => onCloseDock("terminal")
        }
      >
        <X />
      </DockQuickButton>
    </div>
  );
}

function DockQuickButton({
  label,
  onClick,
  onContextMenu,
  active = false,
  dataAttr,
  children,
}: {
  label: string;
  onClick: () => void;
  onContextMenu?: () => void;
  active?: boolean;
  dataAttr?: string;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        onContextMenu();
      }}
      data-workspace-activity-dock-context={onContextMenu ? "true" : undefined}
      className={cn(
        "pointer-events-auto grid size-7 place-items-center rounded-md text-muted outline-none transition-colors hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "bg-primary-soft text-primary",
      )}
      data-workspace-dock-quick-button={dataAttr}
    >
      {React.cloneElement(children, { className: "size-3.5" })}
    </button>
  );
}

function WorkbenchMobilePanelDock({
  id,
  title,
  children,
  heightVh,
  overTerminal = false,
  onResize,
  onClose,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  heightVh: number;
  overTerminal?: boolean;
  onResize: (heightVh: number) => void;
  onClose: () => void;
}) {
  const [dragging, setDragging] = React.useState(false);
  const fullscreen = heightVh >= FULLSCREEN_MOBILE_PANEL_HEIGHT;

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
    const startY = event.clientY;
    const startHeight = heightVh;
    const viewportHeight = Math.max(
      window.visualViewport?.height ?? window.innerHeight,
      1,
    );
    let frame = 0;
    let pendingHeight = startHeight;
    let lastCommittedHeight = startHeight;
    const commitPendingHeight = () => {
      frame = 0;
      if (
        Math.abs(pendingHeight - lastCommittedHeight) <
        MOBILE_PANEL_DRAG_UPDATE_THRESHOLD
      ) {
        return;
      }
      lastCommittedHeight = pendingHeight;
      onResize(pendingHeight);
    };
    const move = (moveEvent: PointerEvent) => {
      const deltaVh = ((startY - moveEvent.clientY) / viewportHeight) * 100;
      pendingHeight = clamp(
        startHeight + deltaVh,
        MIN_MOBILE_PANEL_HEIGHT,
        MAX_MOBILE_PANEL_HEIGHT,
      );
      if (!frame) frame = window.requestAnimationFrame(commitPendingHeight);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      if (frame) window.cancelAnimationFrame(frame);
      onResize(snapMobilePanelHeight(pendingHeight));
      setDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.touchAction = "";
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", stop, { once: true });
    window.addEventListener("pointercancel", stop, { once: true });
  };

  return (
    <section
      className={cn(
        "relative min-h-0 overflow-hidden border-t border-primary-line bg-panel shadow-[0_-18px_42px_rgba(15,23,42,0.12)]",
        fullscreen &&
          "fixed inset-x-0 top-0 bottom-[var(--workspace-mobile-nav-height)] z-[80] h-auto rounded-none border-0 shadow-none",
        overTerminal && "z-[110]",
        fullscreen && overTerminal && "z-[120]",
        overTerminal && "workspace-mobile-panel-over-terminal",
        dragging && "workspace-mobile-panel-resizing",
      )}
      id={id}
      data-workspace-mobile-panel-dock
      data-workspace-mobile-panel-height={heightVh}
      data-workspace-mobile-panel-resizing={dragging ? "true" : "false"}
      data-workspace-mobile-panel-fullscreen={fullscreen ? "true" : "false"}
      data-workspace-mobile-panel-over-terminal={overTerminal ? "true" : "false"}
      data-workspace-mobile-panel-reserves-nav={fullscreen ? "true" : "false"}
      aria-label={title}
    >
      <button
        type="button"
        aria-label="调整底部工作面板高度"
        title="上下拖拽调整高度，或点击下方档位快速切换"
        className="absolute inset-x-0 top-0 z-20 flex h-10 -translate-y-3 cursor-row-resize touch-none select-none items-start justify-center bg-transparent pt-2 outline-none focus-visible:bg-primary-soft"
        onPointerDown={startDrag}
        data-workspace-mobile-panel-resizer
      >
        <span className="h-1.5 w-20 rounded-full bg-line-2 shadow-sm" />
      </button>
      <div
        className="pointer-events-auto absolute right-3 top-2 z-30 flex items-center gap-1 rounded-full border border-line bg-panel/90 p-1 shadow-sm backdrop-blur"
        data-workspace-mobile-panel-snap-controls
      >
        {MOBILE_PANEL_SNAP_POINTS.map((point) => (
          <button
            key={point}
            type="button"
            className={cn(
              "h-5 min-w-7 rounded-full px-1.5 text-[10px] font-medium text-subtle outline-none transition-colors",
              "hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
              Math.abs(heightVh - point) < 2 && "bg-primary-soft text-primary",
            )}
            onClick={() => onResize(point)}
            aria-label={
              point >= FULLSCREEN_MOBILE_PANEL_HEIGHT
                ? "将当前工作面板拉到顶部全屏"
                : `设置底部工作面板高度为 ${point}%`
            }
            data-workspace-mobile-panel-snap={point}
          >
            {point}
          </button>
        ))}
      </div>
      <div className="flex h-10 items-center justify-between border-b border-line bg-panel-2 px-3 pr-36 text-sm font-semibold text-ink-strong">
        <span className="truncate">{title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label="收起当前工作面板"
        >
          ×
        </Button>
      </div>
      <div
        className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden"
        data-workspace-mobile-panel-content
      >
        {children}
      </div>
    </section>
  );
}

function WorkbenchMobileNav({
  activeSidePanel,
  sideOpen,
  onOpenSide,
  onDockSide,
  onFocusEditor,
  onOpenCommandPalette,
  onToggleTerminal,
  terminalOpen,
  overlay,
  mobileSidePanelId,
  mobilePanelHeightVh,
  onSetMobilePanelHeight,
  onCloseSidePanel,
}: {
  activeSidePanel: SidePanel;
  sideOpen: boolean;
  onOpenSide: (panel: SidePanel) => void;
  onDockSide: (panel: SidePanel) => void;
  onFocusEditor: () => void;
  onOpenCommandPalette: () => void;
  onToggleTerminal: () => void;
  terminalOpen: boolean;
  overlay?: boolean;
  mobileSidePanelId?: string;
  mobilePanelHeightVh: number;
  onSetMobilePanelHeight: (heightVh: number) => void;
  onCloseSidePanel: () => void;
}) {
  const [actionPanel, setActionPanel] = React.useState<SidePanel | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);

  const closeActionMenu = React.useCallback(() => setActionPanel(null), []);
  const openMobileSidePanel = React.useCallback(
    (panel: SidePanel) => {
      closeActionMenu();
      onOpenSide(panel);
    },
    [closeActionMenu, onOpenSide],
  );
  const dockMobileSidePanel = React.useCallback(
    (panel: SidePanel) => {
      closeActionMenu();
      onDockSide(panel);
    },
    [closeActionMenu, onDockSide],
  );
  const setMobilePanelSnap = React.useCallback(
    (panel: SidePanel, heightVh: number) => {
      closeActionMenu();
      onSetMobilePanelHeight(heightVh);
      onOpenSide(panel);
    },
    [closeActionMenu, onOpenSide, onSetMobilePanelHeight],
  );
  const closeMobileSidePanel = React.useCallback(() => {
    closeActionMenu();
    onCloseSidePanel();
  }, [closeActionMenu, onCloseSidePanel]);
  const activateEditorNav = React.useCallback(() => {
    if (!sideOpen && !terminalOpen) {
      onOpenCommandPalette();
      return;
    }
    onFocusEditor();
  }, [onFocusEditor, onOpenCommandPalette, sideOpen, terminalOpen]);

  React.useEffect(() => {
    if (!actionPanel) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      closeActionMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeActionMenu();
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [actionPanel, closeActionMenu]);

  return (
    <nav
      aria-label="Workspace 移动端导航"
      className={cn(
        "relative grid grid-cols-5 gap-1 border-t border-line bg-panel px-2 pb-[calc(0.375rem+env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-16px_40px_rgba(15,23,42,0.08)]",
        overlay &&
          "fixed inset-x-0 bottom-0 z-[90] border-t-primary-line bg-panel/95 backdrop-blur",
      )}
      data-workspace-mobile-nav
      data-workspace-mobile-nav-overlay={overlay ? "true" : "false"}
    >
      <MobileNavButton
        label="文件"
        icon={<Files />}
        active={sideOpen && activeSidePanel === "explorer"}
        controls={mobileSidePanelId}
        expanded={sideOpen && activeSidePanel === "explorer"}
        onClick={() => onOpenSide("explorer")}
        onContextMenu={() => setActionPanel("explorer")}
      />
      <MobileNavButton
        label="搜索"
        icon={<Search />}
        active={sideOpen && activeSidePanel === "search"}
        controls={mobileSidePanelId}
        expanded={sideOpen && activeSidePanel === "search"}
        onClick={() => onOpenSide("search")}
        onContextMenu={() => setActionPanel("search")}
      />
      <MobileNavButton
        label="Git"
        icon={<GitBranch />}
        active={sideOpen && activeSidePanel === "git"}
        controls={mobileSidePanelId}
        expanded={sideOpen && activeSidePanel === "git"}
        onClick={() => onOpenSide("git")}
        onContextMenu={() => setActionPanel("git")}
      />
      <MobileNavButton
        label={!sideOpen && !terminalOpen ? "命令" : "编辑"}
        icon={<FileCode2 />}
        active={!sideOpen && !terminalOpen}
        onClick={activateEditorNav}
        titleOverride={
          !sideOpen && !terminalOpen ? "打开命令面板" : "返回编辑器工作区"
        }
        dataAttr="editor-command-or-focus"
      />
      <MobileNavButton
        label={terminalOpen ? "收起" : "终端"}
        icon={<TerminalSquare />}
        active={terminalOpen}
        onClick={onToggleTerminal}
      />
      {actionPanel ? (
        <MobileNavActionMenu
          ref={menuRef}
          panel={actionPanel}
          expanded={sideOpen && activeSidePanel === actionPanel}
          heightVh={mobilePanelHeightVh}
          onOpen={() => openMobileSidePanel(actionPanel)}
          onDock={() => dockMobileSidePanel(actionPanel)}
          onHalf={() => setMobilePanelSnap(actionPanel, 58)}
          onFullscreen={() => setMobilePanelSnap(actionPanel, 100)}
          onClosePanel={closeMobileSidePanel}
          onClose={closeActionMenu}
        />
      ) : null}
    </nav>
  );
}

const MobileNavActionMenu = React.forwardRef<
  HTMLDivElement,
  {
    panel: SidePanel;
    onOpen: () => void;
    onDock: () => void;
    onClose: () => void;
    expanded: boolean;
    heightVh: number;
    onHalf: () => void;
    onFullscreen: () => void;
    onClosePanel: () => void;
  }
>(function MobileNavActionMenu(
  {
    panel,
    expanded,
    heightVh,
    onOpen,
    onDock,
    onHalf,
    onFullscreen,
    onClosePanel,
    onClose,
  },
  ref,
) {
  const title = sidePanelTitle(panel);
  const isFullscreen = expanded && heightVh >= FULLSCREEN_MOBILE_PANEL_HEIGHT;
  return (
    <div
      ref={ref}
      className="absolute inset-x-2 bottom-[calc(100%+0.5rem)] z-[95] overflow-hidden rounded-2xl border border-line bg-panel/95 p-1 shadow-2xl backdrop-blur"
      role="menu"
      aria-label={`${title} 触屏操作`}
      data-workspace-mobile-nav-action-menu
      data-workspace-mobile-nav-action-panel={panel}
    >
      <div className="flex items-center justify-between border-b border-line px-3 py-2 text-xs font-semibold text-ink-strong">
        <span>{title}</span>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-muted outline-none hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]"
          onClick={onClose}
          aria-label="关闭触屏操作菜单"
        >
          ×
        </button>
      </div>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
        onClick={onOpen}
        role="menuitem"
        data-workspace-mobile-nav-action="open"
      >
        <FolderTree className="size-4 text-primary" />
        <span>打开底部面板</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
        onClick={onDock}
        role="menuitem"
        data-workspace-mobile-nav-action="dock"
      >
        <LayoutPanelTop className="size-4 text-primary" />
        <span>停靠到工作区</span>
      </button>
      <div className="my-1 h-px bg-line" />
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
        onClick={onHalf}
        role="menuitem"
        data-workspace-mobile-nav-action="half"
      >
        <LayoutPanelTop className="size-4 text-primary" />
        <span>半屏查看</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
        onClick={onFullscreen}
        role="menuitem"
        aria-checked={isFullscreen}
        data-workspace-mobile-nav-action="fullscreen"
      >
        <Expand className="size-4 text-primary" />
        <span>{isFullscreen ? "已是全屏面板" : "拉到顶部全屏"}</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm text-ink outline-none hover:bg-panel-2 focus-visible:shadow-[var(--ring)]"
        onClick={onClosePanel}
        role="menuitem"
        data-workspace-mobile-nav-action="close-panel"
      >
        <X className="size-4 text-danger" />
        <span>关闭当前面板</span>
      </button>
    </div>
  );
});

function MobileNavButton({
  label,
  icon,
  onClick,
  onContextMenu,
  active = false,
  controls,
  expanded,
  titleOverride,
  dataAttr,
}: {
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  onClick: () => void;
  onContextMenu?: () => void;
  active?: boolean;
  controls?: string;
  expanded?: boolean;
  titleOverride?: string;
  dataAttr?: string;
}) {
  const longPressTimerRef = React.useRef<number | null>(null);
  const longPressTriggeredRef = React.useRef(false);

  const clearLongPressTimer = React.useCallback(() => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }, []);

  const startLongPress = React.useCallback(() => {
    if (!onContextMenu) return;
    longPressTriggeredRef.current = false;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      onContextMenu();
    }, 520);
  }, [clearLongPressTimer, onContextMenu]);

  React.useEffect(() => clearLongPressTimer, [clearLongPressTimer]);

  return (
    <button
      type="button"
      onClick={(event) => {
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
          return;
        }
        onClick();
      }}
      onContextMenu={(event) => {
        if (!onContextMenu) return;
        event.preventDefault();
        clearLongPressTimer();
        onContextMenu();
      }}
      onPointerDown={startLongPress}
      onPointerMove={clearLongPressTimer}
      onPointerCancel={clearLongPressTimer}
      onPointerLeave={clearLongPressTimer}
      onPointerUp={clearLongPressTimer}
      aria-current={active ? "page" : undefined}
      aria-controls={controls}
      aria-expanded={expanded}
      title={
        titleOverride ??
        (onContextMenu
          ? active
            ? `${label}（当前打开，长按打开操作菜单）`
            : `${label}（长按打开操作菜单）`
          : active
            ? `${label}（当前打开）`
            : label)
      }
      data-workspace-mobile-nav-button-active={active ? "true" : "false"}
      data-workspace-mobile-nav-button={dataAttr}
      data-workspace-mobile-nav-long-press-menu={
        onContextMenu ? "true" : undefined
      }
      className={cn(
        "grid min-w-0 touch-manipulation justify-items-center gap-0.5 rounded-xl px-1.5 py-1 text-[11px] text-muted outline-none transition-colors",
        "hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "bg-primary-soft text-primary",
      )}
    >
      {React.cloneElement(icon, { className: "size-4" })}
      <span className="truncate">{label}</span>
    </button>
  );
}

function snapMobilePanelHeight(heightVh: number): number {
  const clamped = clamp(
    heightVh,
    MIN_MOBILE_PANEL_HEIGHT,
    MAX_MOBILE_PANEL_HEIGHT,
  );
  const closeSnap = MOBILE_PANEL_SNAP_POINTS.find(
    (point) => Math.abs(point - clamped) <= 4,
  );
  return closeSnap ?? clamped;
}

function mobileSidePanelDockId(panel: SidePanel): string {
  return `workspace-mobile-${panel}-panel`;
}

function sidePanelTitle(panel: SidePanel): string {
  switch (panel) {
    case "search":
      return "搜索";
    case "git":
      return "源代码管理";
    case "explorer":
    default:
      return "资源管理器";
  }
}

function WorkbenchStatusBar({
  rootId,
  activePath,
  saveState,
}: {
  rootId: string;
  activePath?: string;
  saveState: SaveState;
}) {
  return (
    <footer className="flex items-center gap-4 border-t border-primary-line bg-primary px-3 text-xs text-primary-ink">
      <span className="font-medium">main</span>
      <span>
        {saveState === "dirty"
          ? "● 未保存"
          : saveState === "saving"
            ? "保存中…"
            : "✓ 已保存"}
      </span>
      <span className="ml-auto truncate opacity-90">
        {activePath ?? rootId}
      </span>
      <span>UTF-8</span>
      <span>LF</span>
    </footer>
  );
}

function createDefaultLayout(api: DockviewApi) {
  api.addPanel({ id: "editor", component: "editor", title: "Editor" });
}

function TerminalLoadingState() {
  return (
    <div className="grid h-full min-h-0 place-items-center bg-black p-4 text-xs text-white/70">
      <div className="grid justify-items-center gap-2">
        <span className="size-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <span>正在加载终端引擎…</span>
      </div>
    </div>
  );
}

function ensureDockPanel(api: DockviewApi | null, panel: DockPanel) {
  if (!api) return undefined;
  const existing = api.getPanel(panel);
  if (existing) return existing;
  const spec = dockPanelSpec(panel);
  return api.addPanel(spec);
}

function dockPanelSpec(
  panel: DockPanel,
): Parameters<DockviewApi["addPanel"]>[0] {
  switch (panel) {
    case "terminal":
      return {
        id: "terminal",
        component: "terminal",
        title: "Terminal",
        position: { direction: "below", referencePanel: "editor" },
        initialHeight: 260,
      };
    case "explorer":
      return {
        id: "explorer",
        component: "explorer",
        title: "Files",
        position: { direction: "left", referencePanel: "editor" },
        initialWidth: 320,
      };
    case "search":
      return {
        id: "search",
        component: "search",
        title: "Search",
        position: { direction: "left", referencePanel: "editor" },
        initialWidth: 340,
      };
    case "git":
      return {
        id: "git",
        component: "git",
        title: "Git",
        position: { direction: "left", referencePanel: "editor" },
        initialWidth: 340,
      };
    case "editor":
    default:
      return { id: "editor", component: "editor", title: "Editor" };
  }
}

function standaloneDockPanelSpec(
  panel: DockPanel,
): Parameters<DockviewApi["addPanel"]>[0] {
  const spec = dockPanelSpec(panel);
  return {
    ...spec,
    position: undefined,
    initialHeight: undefined,
    title: `${dockPanelTitle(panel)} · Immersive`,
  };
}

function isSideDockPanel(panel: DockPanel): panel is SidePanel {
  return panel === "explorer" || panel === "search" || panel === "git";
}

function dockPanelTitle(panel: DockPanel): string {
  switch (panel) {
    case "terminal":
      return "Terminal";
    case "explorer":
      return "Files";
    case "search":
      return "Search";
    case "git":
      return "Git";
    case "editor":
    default:
      return "Editor";
  }
}

function restoreDockLayout(
  api: DockviewApi | null,
  layoutRef: React.MutableRefObject<ReturnType<DockviewApi["toJSON"]> | null>,
  onRestored: () => void,
): void {
  if (!api) return;
  const previous = layoutRef.current;
  layoutRef.current = null;
  api.clear();
  if (previous) {
    try {
      api.fromJSON(previous, { reuseExistingPanels: false });
      persistLayout(api);
      onRestored();
      return;
    } catch {
      window.localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    }
  }
  createDefaultLayout(api);
  persistLayout(api);
  onRestored();
}

function restoreLayout(api: DockviewApi): boolean {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    if (!raw) return false;
    api.fromJSON(JSON.parse(raw), { reuseExistingPanels: false });
    return true;
  } catch {
    window.localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    return false;
  }
}

function persistLayout(api: DockviewApi) {
  try {
    window.localStorage.setItem(
      WORKSPACE_LAYOUT_STORAGE_KEY,
      JSON.stringify(api.toJSON()),
    );
  } catch {
    // Ignore quota/private-mode failures. Layout persistence is a convenience.
  }
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    )
      return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, [query]);

  return matches;
}

function loadWorkspaceDockControlsCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.localStorage.getItem(
        WORKSPACE_DOCK_CONTROLS_COLLAPSED_STORAGE_KEY,
      ) === "true"
    );
  } catch {
    return false;
  }
}

function storeWorkspaceDockControlsCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_DOCK_CONTROLS_COLLAPSED_STORAGE_KEY,
      collapsed ? "true" : "false",
    );
  } catch {
    // Dock controls collapsed state is convenience-only.
  }
}

function loadWorkspaceSessionState(): WorkspaceSessionState {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY) || "{}",
    ) as Partial<WorkspaceSessionState>;
    return {
      rootId: typeof parsed.rootId === "string" ? parsed.rootId : undefined,
      activePath:
        typeof parsed.activePath === "string" ? parsed.activePath : undefined,
      activePathRootId:
        typeof parsed.activePathRootId === "string"
          ? parsed.activePathRootId
          : undefined,
      gitDiffTarget: isWorkspaceGitDiffTarget(parsed.gitDiffTarget)
        ? parsed.gitDiffTarget
        : null,
      activeSidePanel:
        parsed.activeSidePanel === "explorer" ||
        parsed.activeSidePanel === "search" ||
        parsed.activeSidePanel === "git"
          ? parsed.activeSidePanel
          : undefined,
      sideOpen:
        typeof parsed.sideOpen === "boolean" ? parsed.sideOpen : undefined,
    };
  } catch {
    return {};
  }
}

function isWorkspaceGitDiffTarget(
  value: unknown,
): value is WorkspaceGitDiffTarget {
  if (!value || typeof value !== "object") return false;
  const target = value as Partial<WorkspaceGitDiffTarget>;
  return (
    typeof target.path === "string" &&
    typeof target.staged === "boolean" &&
    typeof target.untracked === "boolean" &&
    typeof target.kind === "string"
  );
}

function storeWorkspaceSessionState(state: WorkspaceSessionState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_SESSION_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Workspace session persistence is convenience-only.
  }
}

function defaultWorkspacePanelSizes(): WorkspacePanelSizeState {
  return {
    sidePanelWidth: DEFAULT_SIDE_PANEL_WIDTH,
    mobilePanelHeightVh: DEFAULT_MOBILE_PANEL_HEIGHT,
  };
}

function loadWorkspacePanelSizes(): WorkspacePanelSizeState {
  if (typeof window === "undefined") return defaultWorkspacePanelSizes();
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(WORKSPACE_PANEL_SIZE_STORAGE_KEY) || "{}",
    ) as Partial<WorkspacePanelSizeState>;
    const defaults = defaultWorkspacePanelSizes();
    return {
      sidePanelWidth: Math.max(
        typeof parsed.sidePanelWidth === "number"
          ? parsed.sidePanelWidth
          : defaults.sidePanelWidth,
        MIN_SIDE_PANEL_WIDTH,
      ),
      mobilePanelHeightVh: clamp(
        typeof parsed.mobilePanelHeightVh === "number"
          ? parsed.mobilePanelHeightVh
          : defaults.mobilePanelHeightVh,
        MIN_MOBILE_PANEL_HEIGHT,
        MAX_MOBILE_PANEL_HEIGHT,
      ),
    };
  } catch {
    return defaultWorkspacePanelSizes();
  }
}

function storeWorkspacePanelSizes(state: WorkspacePanelSizeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      WORKSPACE_PANEL_SIZE_STORAGE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Panel size persistence is convenience-only.
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export default WorkspaceWorkbench;
