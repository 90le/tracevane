import * as React from "react";
import { useSearchParams } from "react-router-dom";
import {
  ChevronLeft,
  Columns3,
  Eye,
  Files,
  GitBranch,
  Maximize2,
  PanelRightClose,
  PanelRightOpen,
  TerminalSquare,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { useFilesSummaryQuery } from "@/lib/query/files";

import { IdeExplorer } from "@/features/ide/explorer/IdeExplorer";
import { GitPanel } from "@/features/ide/explorer/GitPanel";
import { EditorArea } from "@/features/ide/panels/EditorArea";
import { Preview } from "@/features/ide/panels/Preview";
import { StatusBar, type SaveState } from "@/features/ide/panels/StatusBar";
import { IdeTerminal } from "@/features/ide/terminal/IdeTerminal";
import { useWorkspaceLayout, type WorkspaceLayoutMode } from "./layout/useWorkspaceLayout";

type WorkspaceActivity = "files" | "git";
type MobileMode = "files" | "edit" | "terminal" | "preview";
type WorkspaceModeParam = WorkspaceActivity | MobileMode;

const ACTIVITIES: Array<{ id: WorkspaceActivity; label: string; icon: typeof Files }> = [
  { id: "files", label: "文件", icon: Files },
  { id: "git", label: "Git", icon: GitBranch },
];

const MOBILE_MODES: Array<{ id: MobileMode; label: string; icon: typeof Files }> = [
  { id: "files", label: "文件", icon: Files },
  { id: "edit", label: "编辑", icon: Columns3 },
  { id: "terminal", label: "终端", icon: TerminalSquare },
  { id: "preview", label: "预览", icon: Eye },
];

/**
 * Workspace Shell — Phase 1 responsive workbench.
 *
 * This is intentionally a new shell instead of another patch on `IdeShell`:
 * - desktop/wide: multi-pane local workbench;
 * - tablet: keeps the same objects but narrows the inspector;
 * - mobile: single-stage mode switching through bottom navigation.
 *
 * Only real implemented surfaces are visible in Phase 1: Files, Git, Editor,
 * Preview and Terminal. Search/Problems/Agent placeholders are deliberately not
 * shown until backed by working data and actions.
 */
export function WorkspaceShell() {
  const layoutMode = useWorkspaceLayout();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialMode = normalizeWorkspaceMode(searchParams.get("mode"));
  const [activity, setActivityState] = React.useState<WorkspaceActivity>(
    initialMode === "git" ? "git" : "files",
  );
  const [mobileMode, setMobileModeState] = React.useState<MobileMode>(
    toMobileMode(initialMode),
  );
  const [inspectorOpen, setInspectorOpen] = React.useState(true);
  const [terminalOpen, setTerminalOpen] = React.useState(true);

  const setModeParam = React.useCallback(
    (mode: WorkspaceModeParam) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (mode === "files") next.delete("mode");
        else next.set("mode", mode);
        return next;
      }, { replace: true });
    },
    [setSearchParams],
  );

  const setActivity = React.useCallback((next: WorkspaceActivity) => {
    setActivityState(next);
    setModeParam(next);
  }, [setModeParam]);

  const setMobileMode = React.useCallback((next: MobileMode) => {
    setMobileModeState(next);
    setModeParam(next);
  }, [setModeParam]);

  React.useEffect(() => {
    const mode = normalizeWorkspaceMode(searchParams.get("mode"));
    setActivityState(mode === "git" ? "git" : "files");
    setMobileModeState(toMobileMode(mode));
  }, [searchParams]);

  const [openFile, setOpenFile] = React.useState<string | undefined>();
  const [activeContent, setActiveContent] = React.useState<string>("");
  const [saveState, setSaveState] = React.useState<SaveState>("idle");
  const [, setDiffFile] = React.useState<string | undefined>();

  const summary = useFilesSummaryQuery();
  const roots = summary.data?.roots ?? [];
  const defaultRootId = React.useMemo(() => {
    if (roots.length === 0) return "";
    return (
      roots.find((r) => r.id === "project-root")?.id ||
      roots.find((r) => r.preferred === true)?.id ||
      roots.find((r) => r.id === summary.data?.defaultRootId)?.id ||
      roots[0].id
    );
  }, [roots, summary.data?.defaultRootId]);
  const [rootId, setRootId] = React.useState<string>(defaultRootId);

  React.useEffect(() => {
    if (defaultRootId && !rootId) setRootId(defaultRootId);
  }, [defaultRootId, rootId]);

  const selectFile = React.useCallback((path: string) => {
    setOpenFile(path);
    setMobileMode("edit");
    setInspectorOpen(true);
  }, []);

  const openDiff = React.useCallback((path: string) => {
    setDiffFile(path);
    setOpenFile(path);
    setMobileMode("edit");
  }, []);

  if (layoutMode === "mobile") {
    return (
      <MobileWorkspace
        rootId={rootId}
        selectedPath={openFile}
        mode={mobileMode}
        saveState={saveState}
        content={activeContent}
        onModeChange={setMobileMode}
        onChangeRoot={setRootId}
        onSelectFile={selectFile}
        onOpenDiff={openDiff}
        onSaveStateChange={setSaveState}
        onActiveContentChange={setActiveContent}
      />
    );
  }

  return (
    <DesktopWorkspace
      layoutMode={layoutMode}
      rootId={rootId}
      selectedPath={openFile}
      activity={activity}
      inspectorOpen={inspectorOpen}
      terminalOpen={terminalOpen}
      saveState={saveState}
      content={activeContent}
      onActivityChange={setActivity}
      onChangeRoot={setRootId}
      onSelectFile={selectFile}
      onOpenDiff={openDiff}
      onToggleInspector={() => setInspectorOpen((v) => !v)}
      onToggleTerminal={() => setTerminalOpen((v) => !v)}
      onSaveStateChange={setSaveState}
      onActiveContentChange={setActiveContent}
    />
  );
}


function normalizeWorkspaceMode(value: string | null): WorkspaceModeParam {
  if (value === "git" || value === "terminal" || value === "preview" || value === "edit") {
    return value;
  }
  return "files";
}

function toMobileMode(mode: WorkspaceModeParam): MobileMode {
  if (mode === "terminal" || mode === "preview" || mode === "edit") return mode;
  return "files";
}

interface SharedWorkspaceProps {
  rootId: string;
  selectedPath?: string;
  content: string;
  saveState: SaveState;
  onChangeRoot: (rootId: string) => void;
  onSelectFile: (path: string) => void;
  onOpenDiff: (path: string) => void;
  onSaveStateChange: (state: SaveState) => void;
  onActiveContentChange: (content: string) => void;
}

interface DesktopWorkspaceProps extends SharedWorkspaceProps {
  layoutMode: Exclude<WorkspaceLayoutMode, "mobile">;
  activity: WorkspaceActivity;
  inspectorOpen: boolean;
  terminalOpen: boolean;
  onActivityChange: (activity: WorkspaceActivity) => void;
  onToggleInspector: () => void;
  onToggleTerminal: () => void;
}

function DesktopWorkspace({
  layoutMode,
  rootId,
  selectedPath,
  activity,
  inspectorOpen,
  terminalOpen,
  saveState,
  content,
  onActivityChange,
  onChangeRoot,
  onSelectFile,
  onOpenDiff,
  onToggleInspector,
  onToggleTerminal,
  onSaveStateChange,
  onActiveContentChange,
}: DesktopWorkspaceProps) {
  const compact = layoutMode === "tablet";
  return (
    <div
      className={cn(
        "grid h-dvh w-screen overflow-hidden bg-canvas text-ink",
        "grid-cols-[52px_minmax(220px,var(--workspace-side,280px))_minmax(0,1fr)]",
        inspectorOpen && !compact && "xl:grid-cols-[52px_minmax(240px,var(--workspace-side,292px))_minmax(0,1fr)_minmax(300px,var(--workspace-inspector,360px))]",
        inspectorOpen && compact && "lg:grid-cols-[52px_minmax(220px,260px)_minmax(0,1fr)_minmax(260px,300px)]",
      )}
    >
      <WorkspaceActivityRail activity={activity} onChange={onActivityChange} />
      <WorkspaceSidePanel
        activity={activity}
        rootId={rootId}
        selectedPath={selectedPath}
        onSelectFile={onSelectFile}
        onChangeRoot={onChangeRoot}
        onOpenDiff={onOpenDiff}
      />
      <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden">
        <WorkspaceTopBar
          selectedPath={selectedPath}
          inspectorOpen={inspectorOpen}
          terminalOpen={terminalOpen}
          onToggleInspector={onToggleInspector}
          onToggleTerminal={onToggleTerminal}
        />
        <EditorArea
          openFile={selectedPath}
          rootId={rootId}
          onSaveStateChange={onSaveStateChange}
          onActiveContentChange={onActiveContentChange}
        />
        {terminalOpen ? <WorkspaceTerminalPanel /> : null}
        <StatusBar rootId={rootId} selectedPath={selectedPath} saveState={saveState} />
      </main>
      {inspectorOpen ? <WorkspaceInspector path={selectedPath} content={content} /> : null}
    </div>
  );
}

interface MobileWorkspaceProps extends SharedWorkspaceProps {
  mode: MobileMode;
  onModeChange: (mode: MobileMode) => void;
}

function MobileWorkspace({
  rootId,
  selectedPath,
  mode,
  saveState,
  content,
  onModeChange,
  onChangeRoot,
  onSelectFile,
  onOpenDiff,
  onSaveStateChange,
  onActiveContentChange,
}: MobileWorkspaceProps) {
  return (
    <div className="grid h-dvh w-screen grid-rows-[auto_minmax(0,1fr)_auto_auto] overflow-hidden bg-canvas text-ink">
      <header className="flex h-11 items-center gap-2 border-b border-line bg-panel px-2.5">
        <a
          href="#/dashboard"
          className="grid size-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-panel-2 hover:text-ink"
          aria-label="返回总览"
        >
          <ChevronLeft className="size-4" />
        </a>
        <div className="min-w-0 flex-1">
          <strong className="block truncate text-sm text-ink-strong">Workspace</strong>
          <span className="block truncate font-mono text-2xs text-subtle">
            {selectedPath ?? rootId ?? "未选择文件"}
          </span>
        </div>
        <span className="rounded-sm border border-line bg-panel-2 px-2 py-1 text-2xs text-muted">
          {saveState === "dirty" ? "未保存" : saveState === "saving" ? "保存中" : "已保存"}
        </span>
      </header>

      <main className="min-h-0 min-w-0 overflow-hidden">
        {mode === "files" ? (
          <IdeExplorer
            rootId={rootId}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
            onChangeRoot={onChangeRoot}
          />
        ) : mode === "edit" ? (
          <EditorArea
            openFile={selectedPath}
            rootId={rootId}
            onSaveStateChange={onSaveStateChange}
            onActiveContentChange={onActiveContentChange}
          />
        ) : mode === "terminal" ? (
          <IdeTerminal />
        ) : (
          <Preview path={selectedPath} content={content} />
        )}
      </main>

      <MobileWorkspaceNav mode={mode} onChange={onModeChange} />
      <StatusBar rootId={rootId} selectedPath={selectedPath} saveState={saveState} />
      <span className="sr-only" aria-live="polite">
        {mode === "files" ? "文件" : mode === "edit" ? "编辑" : mode === "terminal" ? "终端" : "预览"}
      </span>
    </div>
  );
}

function WorkspaceActivityRail({
  activity,
  onChange,
}: {
  activity: WorkspaceActivity;
  onChange: (activity: WorkspaceActivity) => void;
}) {
  return (
    <nav aria-label="Workspace 活动" className="flex flex-col items-center gap-1 border-r border-line bg-panel-2 px-[6px] py-2.5">
      {ACTIVITIES.map((item) => {
        const Icon = item.icon;
        const active = activity === item.id;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "relative grid size-9 place-items-center rounded-md text-muted outline-none transition-colors",
              "hover:bg-panel-3 hover:text-ink focus-visible:shadow-[var(--ring)]",
              active && "bg-primary-soft text-primary",
            )}
          >
            <Icon className="size-[18px]" />
            {active ? <span aria-hidden className="absolute -left-[6px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" /> : null}
          </button>
        );
      })}
    </nav>
  );
}

function WorkspaceSidePanel({
  activity,
  rootId,
  selectedPath,
  onSelectFile,
  onChangeRoot,
  onOpenDiff,
}: {
  activity: WorkspaceActivity;
  rootId: string;
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  onChangeRoot: (rootId: string) => void;
  onOpenDiff: (path: string) => void;
}) {
  return (
    <aside className="min-h-0 min-w-0 overflow-hidden border-r border-line bg-panel">
      {activity === "files" ? (
        <IdeExplorer rootId={rootId} selectedPath={selectedPath} onSelectFile={onSelectFile} onChangeRoot={onChangeRoot} />
      ) : (
        <GitPanel rootId={rootId} onOpenDiff={onOpenDiff} />
      )}
    </aside>
  );
}

function WorkspaceTopBar({
  selectedPath,
  inspectorOpen,
  terminalOpen,
  onToggleInspector,
  onToggleTerminal,
}: {
  selectedPath?: string;
  inspectorOpen: boolean;
  terminalOpen: boolean;
  onToggleInspector: () => void;
  onToggleTerminal: () => void;
}) {
  return (
    <header className="flex h-9 items-center gap-2 border-b border-line bg-panel px-2.5">
      <strong className="min-w-0 flex-1 truncate text-sm text-ink-strong">
        {selectedPath ? selectedPath.split("/").pop() || selectedPath : "Workspace"}
      </strong>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={onToggleTerminal}>
        <Maximize2 className="size-3.5" />
        {terminalOpen ? "隐藏终端" : "显示终端"}
      </Button>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-2xs" onClick={onToggleInspector}>
        {inspectorOpen ? <PanelRightClose className="size-3.5" /> : <PanelRightOpen className="size-3.5" />}
        {inspectorOpen ? "隐藏检视" : "显示检视"}
      </Button>
    </header>
  );
}

function WorkspaceInspector({ path, content }: { path?: string; content: string }) {
  if (!path) {
    return (
      <aside className="hidden min-h-0 min-w-0 border-l border-line bg-panel xl:grid xl:place-items-center xl:p-6">
        <div className="max-w-[240px] text-center text-sm text-muted">
          选择文件后显示预览、文件信息和后续证据。当前未固定空白预览，避免半成品占位。
        </div>
      </aside>
    );
  }
  return <Preview path={path} content={content} />;
}

function WorkspaceTerminalPanel() {
  return (
    <section className="grid min-h-[180px] max-h-[38dvh] grid-rows-[auto_minmax(0,1fr)] border-t border-line bg-panel">
      <div className="flex h-8 items-center gap-2 border-b border-line px-2.5">
        <TerminalSquare className="size-3.5 text-subtle" />
        <strong className="text-xs text-ink-strong">终端</strong>
        <span className="text-2xs text-subtle">Workspace shell session</span>
      </div>
      <div className="min-h-0 bg-canvas">
        <IdeTerminal />
      </div>
    </section>
  );
}

function MobileWorkspaceNav({ mode, onChange }: { mode: MobileMode; onChange: (mode: MobileMode) => void }) {
  return (
    <nav aria-label="Workspace 模式" className="grid grid-cols-4 border-t border-line bg-panel">
      {MOBILE_MODES.map((item) => {
        const Icon = item.icon;
        const active = mode === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={cn(
              "grid min-h-12 place-items-center gap-0.5 px-1 py-1 text-2xs outline-none transition-colors",
              "focus-visible:shadow-[var(--ring)]",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
