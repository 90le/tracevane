import * as React from "react";
import {
  Bot,
  Braces,
  Code2,
  Files,
  GitBranch,
  Maximize2,
  PanelBottom,
  PanelLeft,
  PanelRight,
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
import { WorkspaceCommandPalette } from "../workbench/WorkspaceCommandPalette";
import type { WorkspaceCommand } from "../workbench/workspaceCommands";
import "./workspace-ide-shell.css";

type ActivityId = "explorer" | "search" | "git" | "terminal" | "ai" | "extensions";
type RightPanelId = "ai" | "outline" | "extensions";
type BottomPanelId = "terminal" | "problems" | "output";
type SaveState = "idle" | "dirty" | "saving" | "saved";

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

  const [activity, setActivity] = React.useState<ActivityId>("explorer");
  const [rightPanel, setRightPanel] = React.useState<RightPanelId>("ai");
  const [bottomPanel, setBottomPanel] = React.useState<BottomPanelId>("terminal");
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [bottomOpen, setBottomOpen] = React.useState(true);
  const [commandPaletteOpen, setCommandPaletteOpen] = React.useState(false);
  const [rootId, setRootId] = React.useState(defaultRootId);
  const [activePath, setActivePath] = React.useState<string | undefined>();
  const [activePathRootId, setActivePathRootId] = React.useState("");
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
      setGitDiffTarget(null);
    }
  }, [defaultRootId, rootId, roots]);

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
    },
    [rootId],
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

  const commands = React.useMemo(
    () => [...editorCommands, ...searchCommands, ...gitCommands, ...terminalCommands],
    [editorCommands, gitCommands, searchCommands, terminalCommands],
  );

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
    <main className="workspace-ide-shell" data-testid="workspace-ide-shell">
      <header className="workspace-ide-shell__topbar">
        <div className="workspace-ide-shell__brand">
          <Code2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
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
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
          <button type="button" className="workspace-ide-shell__activity-button mt-auto" title="设置">
            <Settings2 className="h-5 w-5" aria-hidden="true" />
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

        <section className="workspace-ide-shell__center" data-testid="workspace-ide-center-pane">
          <div className="workspace-ide-shell__editor-grid">
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
          </div>
          {bottomOpen ? (
            <section className="workspace-ide-shell__bottom" data-testid="workspace-ide-bottom-pane">
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
                <button type="button" className="workspace-ide-shell__panel-icon" title="最大化终端">
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
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
          <aside className="workspace-ide-shell__right-pane" data-testid="workspace-ide-right-pane">
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
        <span className="ml-auto">桌面 · 平板 · 手机自适应 IDE</span>
      </footer>

      <WorkspaceCommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        commands={commands}
        keybindingConflicts={[]}
      />
    </main>
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
        <TerminalSquare className="h-8 w-8 text-cyan-300" aria-hidden="true" />
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
