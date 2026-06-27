import * as React from "react";
import {
  Box,
  Command as CommandIcon,
  FileCode2,
  Files,
  GitBranch,
  RotateCcw,
  Search,
  TerminalSquare,
} from "lucide-react";
import { DockviewReact, type DockviewReadyEvent } from "dockview-react";
import type { DockviewApi } from "dockview";

import "dockview-react/dist/styles/dockview.css";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { useFilesSummaryQuery } from "@/lib/query/files";

import {
  WorkspaceEditorStage,
  type WorkspaceEditorSearchRequest,
} from "../editor";
import {
  WorkspaceExplorer,
  WorkspaceSearchPanel,
  type WorkspaceDirectoryContext,
  type WorkspaceOpenFileOptions,
} from "../files";
import { WorkspaceGitPanel } from "../git";
import { WorkspaceCommandPalette } from "./WorkspaceCommandPalette";
import { runWorkspaceShortcutCommand } from "./workspaceCommandShortcuts";
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
type DockPanel = "editor" | "terminal";
type SaveState = "idle" | "dirty" | "saving" | "saved";
interface WorkspaceEditorDockContextValue {
  activePath?: string;
  searchRequest: WorkspaceEditorSearchRequest | null;
  rootId: string;
  onSaveStateChange: (state: SaveState) => void;
  workspaceDirectory: WorkspaceDirectoryContext | null;
  onTerminalCommandsChange: (commands: WorkspaceCommand[]) => void;
  onEditorCommandsChange: (commands: WorkspaceCommand[]) => void;
}

const SIDE_PANEL_WIDTH = 320;
const WORKSPACE_LAYOUT_STORAGE_KEY = "tracevane.workspace.dockview.v2";
const WORKSPACE_SESSION_STORAGE_KEY = "tracevane.workspace.session.v1";
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
  activeSidePanel?: SidePanel;
  sideOpen?: boolean;
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
  const [searchRequest, setSearchRequest] =
    React.useState<WorkspaceEditorSearchRequest | null>(null);
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [workspaceDirectory, setWorkspaceDirectory] =
    React.useState<WorkspaceDirectoryContext | null>(null);
  const [activeSidePanel, setActiveSidePanel] = React.useState<SidePanel>(
    () => sessionStateLoaded.activeSidePanel ?? "explorer",
  );
  const [sideOpen, setSideOpen] = React.useState(
    () => sessionStateLoaded.sideOpen ?? true,
  );
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [gitCommands, setGitCommands] = React.useState<WorkspaceCommand[]>([]);
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
  const apiRef = React.useRef<DockviewApi | null>(null);
  const searchSignalRef = React.useRef(0);

  React.useEffect(() => {
    if (!roots.length) return;
    const savedRootAvailable = roots.some((item) => item.id === rootId);
    if (!rootId || !savedRootAvailable) {
      setRootId(defaultRootId);
      if (!savedRootAvailable) setActivePath(undefined);
    }
  }, [defaultRootId, rootId, roots]);

  React.useEffect(() => {
    storeWorkspaceSessionState({
      rootId,
      activePath,
      activeSidePanel,
      sideOpen,
    });
  }, [activePath, activeSidePanel, rootId, sideOpen]);

  React.useEffect(() => {
    const name = activePath?.split("/").pop() || "Editor";
    apiRef.current?.getPanel("editor")?.api.setTitle(name);
  }, [activePath]);

  const openFile = React.useCallback(
    (path: string, options?: WorkspaceOpenFileOptions) => {
      setActivePath(path);
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
    [],
  );

  const openDiff = React.useCallback((path: string) => {
    setActivePath(path);
    ensureDockPanel(apiRef.current, "editor")?.api.setActive();
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

  const editorDockContext = React.useMemo<WorkspaceEditorDockContextValue>(
    () => ({
      activePath,
      searchRequest,
      rootId,
      onSaveStateChange: setSaveState,
      workspaceDirectory,
      onTerminalCommandsChange: registerTerminalCommands,
      onEditorCommandsChange: registerEditorCommands,
    }),
    [
      activePath,
      registerTerminalCommands,
      registerEditorCommands,
      rootId,
      searchRequest,
      workspaceDirectory,
    ],
  );

  const dockComponents = React.useMemo(
    () => ({
      editor: WorkspaceEditorDockPanel,
      terminal: WorkspaceTerminalDockPanel,
    }),
    [],
  );

  const onReady = React.useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    const restored = restoreLayout(event.api);
    if (!restored) createDefaultLayout(event.api);
    event.api.onDidLayoutChange(() => persistLayout(event.api));
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
    ensureDockPanel(apiRef.current, panel)?.api.setActive();
  }, []);

  const focusDockPanel = React.useCallback(
    (panel: DockPanel) => {
      openDockPanel(panel);
      if (isMobileWorkbench) setSideOpen(false);
    },
    [isMobileWorkbench, openDockPanel],
  );

  const resetLayout = React.useCallback(() => {
    window.localStorage.removeItem(WORKSPACE_LAYOUT_STORAGE_KEY);
    const api = apiRef.current;
    if (!api) return;
    api.clear();
    createDefaultLayout(api);
    persistLayout(api);
  }, []);
  const resetKeymap = React.useCallback(() => {
    setKeymapOverrides([]);
    storeWorkspaceKeymapOverrides([]);
  }, []);
  const defaultKeybindingConflicts = React.useMemo(
    () =>
      getWorkspaceKeybindingConflicts(
        createWorkspaceCommandRegistry({
          activePath,
          sideOpen,
          openSidePanel: showSidePanel,
          openDockPanel: focusDockPanel,
          closeSidePanel: () => setSideOpen(false),
          resetLayout,
          resetKeymap,
          keybindingOverrideCount: keymapOverrides.length,
          extensionCommands: [
            ...gitCommands,
            ...terminalCommands,
            ...editorCommands,
          ],
        }),
      ),
    [
      activePath,
      editorCommands,
      focusDockPanel,
      gitCommands,
      keymapOverrides.length,
      resetKeymap,
      resetLayout,
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
        openDockPanel: focusDockPanel,
        closeSidePanel: () => setSideOpen(false),
        resetLayout,
        resetKeymap,
        keybindingOverrideCount: keymapOverrides.length,
        keybindingConflictCount: defaultKeybindingConflicts.length,
        extensionCommands: [
          ...gitCommands,
          ...terminalCommands,
          ...editorCommands,
        ],
      }),
    [
      activePath,
      editorCommands,
      focusDockPanel,
      gitCommands,
      keymapOverrides.length,
      defaultKeybindingConflicts.length,
      resetKeymap,
      resetLayout,
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
    />
  ) : null;

  return (
    <div
      className={cn(
        "grid h-dvh w-screen overflow-hidden bg-canvas text-ink",
        isMobileWorkbench
          ? "grid-rows-[40px_minmax(0,1fr)_52px]"
          : "grid-rows-[40px_minmax(0,1fr)_24px]",
      )}
      data-workspace-responsive-shell
      data-workspace-mobile={isMobileWorkbench ? "true" : "false"}
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
          isMobileWorkbench &&
            (sideOpen
              ? "grid-rows-[minmax(0,1fr)_minmax(0,42dvh)]"
              : "grid-rows-[minmax(0,1fr)]"),
        )}
        style={
          isMobileWorkbench
            ? undefined
            : {
                gridTemplateColumns: `48px ${
                  sideOpen ? `${SIDE_PANEL_WIDTH}px` : "0px"
                } minmax(0,1fr)`,
              }
        }
        data-workspace-main-stage
        data-workspace-mobile-inline-panels={
          isMobileWorkbench ? "bottom-drawer" : "desktop-side-panel"
        }
      >
        {!isMobileWorkbench ? (
          <WorkbenchActivityBar
            activeSidePanel={activeSidePanel}
            sideOpen={sideOpen}
            onOpenSide={openSidePanel}
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
        <WorkspaceEditorDockContext.Provider value={editorDockContext}>
          <div className="tracevane-dockview dockview-theme-light min-h-0 min-w-0">
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
            title={sidePanelTitle(activeSidePanel)}
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
          onOpenDock={focusDockPanel}
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
      searchRequest={context.searchRequest}
      rootId={context.rootId}
      onSaveStateChange={context.onSaveStateChange}
      onCommandsChange={context.onEditorCommandsChange}
    />
  );
}

function WorkspaceTerminalDockPanel() {
  const context = React.useContext(WorkspaceEditorDockContext);
  return (
    <React.Suspense fallback={<TerminalLoadingState />}>
      <LazyWorkspaceTerminal
        workspaceDirectory={context?.workspaceDirectory ?? undefined}
        onCommandsChange={context?.onTerminalCommandsChange}
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
  return (
    <header className="flex min-w-0 items-center gap-2 border-b border-line bg-panel px-2">
      <div className="flex h-7 items-center gap-2 rounded-md border border-line bg-panel-2 px-2 text-xs font-semibold text-ink-strong">
        <Box className="size-4 text-primary" />
        Tracevane Workspace
      </div>
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

function WorkbenchActivityBar({
  activeSidePanel,
  sideOpen,
  onOpenSide,
  onOpenDock,
}: {
  activeSidePanel: SidePanel;
  sideOpen: boolean;
  onOpenSide: (panel: SidePanel) => void;
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
        active={sideOpen && activeSidePanel === "explorer"}
      />
      <ActivityButton
        label="搜索"
        icon={<Search />}
        onClick={() => onOpenSide("search")}
        active={sideOpen && activeSidePanel === "search"}
      />
      <ActivityButton
        label="Git"
        icon={<GitBranch />}
        onClick={() => onOpenSide("git")}
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
  active = false,
}: {
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
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
}: {
  panel: SidePanel;
  rootId: string;
  activePath?: string;
  onOpenFile: (path: string, options?: WorkspaceOpenFileOptions) => void;
  onOpenDiff: (path: string) => void;
  onChangeRoot: (rootId: string) => void;
  onWorkspaceDirectoryChange: (directory: WorkspaceDirectoryContext) => void;
  onGitCommandsChange: (commands: WorkspaceCommand[]) => void;
}) {
  if (panel === "search") {
    return <WorkspaceSearchPanel rootId={rootId} onOpenFile={onOpenFile} />;
  }
  if (panel === "git") {
    return (
      <WorkspaceGitPanel
        rootId={rootId}
        onOpenDiff={onOpenDiff}
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
    />
  );
}

function WorkbenchMobilePanelDock({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <section
      className="min-h-0 overflow-hidden border-t border-primary-line bg-panel shadow-[0_-18px_42px_rgba(15,23,42,0.12)]"
      data-workspace-mobile-panel-dock
      aria-label={title}
    >
      <div className="flex h-10 items-center justify-between border-b border-line bg-panel-2 px-3 text-sm font-semibold text-ink-strong">
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
      <div className="h-[calc(100%-2.5rem)] min-h-0 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function WorkbenchMobileNav({
  activeSidePanel,
  sideOpen,
  onOpenSide,
  onOpenDock,
}: {
  activeSidePanel: SidePanel;
  sideOpen: boolean;
  onOpenSide: (panel: SidePanel) => void;
  onOpenDock: (panel: DockPanel) => void;
}) {
  return (
    <nav
      aria-label="Workspace 移动端导航"
      className="grid grid-cols-5 gap-1 border-t border-line bg-panel px-2 py-1.5 shadow-[0_-16px_40px_rgba(15,23,42,0.08)]"
      data-workspace-mobile-nav
    >
      <MobileNavButton
        label="文件"
        icon={<Files />}
        active={sideOpen && activeSidePanel === "explorer"}
        onClick={() => onOpenSide("explorer")}
      />
      <MobileNavButton
        label="搜索"
        icon={<Search />}
        active={sideOpen && activeSidePanel === "search"}
        onClick={() => onOpenSide("search")}
      />
      <MobileNavButton
        label="Git"
        icon={<GitBranch />}
        active={sideOpen && activeSidePanel === "git"}
        onClick={() => onOpenSide("git")}
      />
      <MobileNavButton
        label="编辑"
        icon={<FileCode2 />}
        onClick={() => onOpenDock("editor")}
      />
      <MobileNavButton
        label="终端"
        icon={<TerminalSquare />}
        onClick={() => onOpenDock("terminal")}
      />
    </nav>
  );
}

function MobileNavButton({
  label,
  icon,
  onClick,
  active = false,
}: {
  label: string;
  icon: React.ReactElement<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "grid min-w-0 justify-items-center gap-0.5 rounded-xl px-1.5 py-1 text-[11px] text-muted outline-none transition-colors",
        "hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
        active && "bg-primary-soft text-primary",
      )}
    >
      {React.cloneElement(icon, { className: "size-4" })}
      <span className="truncate">{label}</span>
    </button>
  );
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
    case "editor":
    default:
      return { id: "editor", component: "editor", title: "Editor" };
  }
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

export default WorkspaceWorkbench;
