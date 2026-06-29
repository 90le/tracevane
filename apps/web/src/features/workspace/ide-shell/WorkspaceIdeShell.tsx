import * as React from "react";
import {
  Bot,
  Braces,
  Code2,
  Files,
  GitBranch,
  LayoutPanelTop,
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

import "./workspace-ide-shell.css";

type ActivityId = "explorer" | "search" | "git" | "terminal" | "ai" | "extensions";
type CenterTabId = "welcome" | "editor" | "diff" | "provider";
type RightPanelId = "ai" | "outline" | "extensions";
type BottomPanelId = "terminal" | "problems" | "output";

interface ActivityDescriptor {
  id: ActivityId;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  shortcut: string;
}

interface CenterTabDescriptor {
  id: CenterTabId;
  label: string;
  dirty?: boolean;
}

const ACTIVITIES: ActivityDescriptor[] = [
  { id: "explorer", label: "文件", icon: Files, shortcut: "⌘1" },
  { id: "search", label: "搜索", icon: Search, shortcut: "⌘2" },
  { id: "git", label: "Git", icon: GitBranch, shortcut: "⌘3" },
  { id: "terminal", label: "终端", icon: TerminalSquare, shortcut: "⌘4" },
  { id: "ai", label: "AI", icon: Bot, shortcut: "⌘5" },
  { id: "extensions", label: "扩展", icon: Braces, shortcut: "⌘6" },
];

const CENTER_TABS: CenterTabDescriptor[] = [
  { id: "welcome", label: "project-root" },
  { id: "editor", label: "Editor.tsx", dirty: true },
  { id: "diff", label: "Git Diff" },
  { id: "provider", label: "VS Code Provider" },
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

export function WorkspaceIdeShell() {
  const [activity, setActivity] = React.useState<ActivityId>("explorer");
  const [activeTab, setActiveTab] = React.useState<CenterTabId>("editor");
  const [rightPanel, setRightPanel] = React.useState<RightPanelId>("ai");
  const [bottomPanel, setBottomPanel] = React.useState<BottomPanelId>("terminal");
  const [leftOpen, setLeftOpen] = React.useState(true);
  const [rightOpen, setRightOpen] = React.useState(true);
  const [bottomOpen, setBottomOpen] = React.useState(true);

  return (
    <main className="workspace-ide-shell" data-testid="workspace-ide-shell">
      <header className="workspace-ide-shell__topbar">
        <div className="workspace-ide-shell__brand">
          <Code2 className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          <span>Tracevane IDE</span>
          <span className="workspace-ide-shell__pill">IDE-first rebuild</span>
        </div>
        <div className="workspace-ide-shell__command" role="search">
          <span className="text-slate-500">⌘K</span>
          <span>命令、文件、符号、Git、终端、AI 上下文</span>
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

      <div className="workspace-ide-shell__body">
        <aside className="workspace-ide-shell__activity" aria-label="IDE activity rail">
          {ACTIVITIES.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={cn("workspace-ide-shell__activity-button", activity === item.id && "is-active")}
                onClick={() => {
                  setActivity(item.id);
                  setLeftOpen(true);
                }}
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
            <PaneHeader title={activityLabel(activity)} subtitle="插件化左侧工作区" />
            <LeftPane activity={activity} />
          </section>
        ) : null}

        <section className="workspace-ide-shell__center" data-testid="workspace-ide-center-pane">
          <div className="workspace-ide-shell__tabs" role="tablist" aria-label="Open editors">
            {CENTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.id}
                className={cn("workspace-ide-shell__tab", activeTab === tab.id && "is-active")}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}{tab.dirty ? <span className="workspace-ide-shell__dirty" /> : null}
              </button>
            ))}
          </div>
          <div className="workspace-ide-shell__editor-grid">
            <EditorSurface activeTab={activeTab} />
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
              <BottomPane panel={bottomPanel} />
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
            <RightPane panel={rightPanel} />
          </aside>
        ) : null}
      </div>

      <footer className="workspace-ide-shell__statusbar">
        <span>main</span>
        <span>0 Git 变更</span>
        <span>终端: idle</span>
        <span>AI: 需要证据</span>
        <span className="ml-auto">桌面 · 平板 · 手机自适应 IDE Shell</span>
      </footer>
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

function LeftPane({ activity }: { activity: ActivityId }) {
  if (activity === "explorer") {
    return <TreeList title="项目文件" items={["apps/", "apps/web/", "apps/api/", "tests/", "package.json"]} />;
  }
  if (activity === "search") {
    return <SearchPane />;
  }
  if (activity === "git") {
    return <TreeList title="Git 变更" items={["WorkspaceIdeShell.tsx", "workspace-ide-shell.css", "WorkspacePage.tsx"]} />;
  }
  if (activity === "terminal") {
    return <TreeList title="终端会话" items={["workspace · bash", "provider · code-server", "test · npm"]} />;
  }
  if (activity === "ai") {
    return <TreeList title="AI 上下文" items={["当前文件", "Git diff", "终端输出", "搜索结果"]} />;
  }
  return <TreeList title="插件组合" items={["Explorer", "Search", "Git", "Terminal", "AI Context", "Provider"]} />;
}

function EditorSurface({ activeTab }: { activeTab: CenterTabId }) {
  if (activeTab === "provider") {
    return (
      <div className="workspace-ide-shell__provider-card">
        <LayoutPanelTop className="h-10 w-10 text-cyan-300" aria-hidden="true" />
        <h2>VS Code / code-server Provider 插槽</h2>
        <p>这里是第三方 IDE provider 的主编辑区位置。Tracevane 顶栏、AI、审计、终端、Git 和窗格系统保留在外层。</p>
        <a href="/#/workspace?provider=ide&kind=openvscode-server">打开 provider POC</a>
      </div>
    );
  }
  if (activeTab === "diff") {
    return <CodePane title="Git Diff" lines={["- old workspace concept page", "+ IDE-first shell", "+ panes, tabs, status, terminal"]} />;
  }
  if (activeTab === "welcome") {
    return <CodePane title="project-root" lines={["Tracevane Workspace", "Files + Editor + Terminal + Git + Search + AI", "Provider-ready IDE shell"]} />;
  }
  return <CodePane title="Editor.tsx" lines={["export function Workbench() {", "  return <IdeShell panes={layout} plugins={extensions} />;", "}"]} />;
}

function RightPane({ panel }: { panel: RightPanelId }) {
  if (panel === "outline") return <TreeList title="符号大纲" items={["WorkspaceIdeShell", "LeftPane", "EditorSurface", "BottomPane"]} />;
  if (panel === "extensions") return <TreeList title="插件插槽" items={["Provider iframe", "AI context", "Git review", "Terminal tools"]} />;
  return <TreeList title="AI 工作上下文" items={["未自动执行命令", "等待用户选择证据", "可读取当前文件/终端/Git"]} />;
}

function BottomPane({ panel }: { panel: BottomPanelId }) {
  if (panel === "problems") return <CodePane title="Problems" lines={["0 errors", "0 warnings", "IDE shell layout ready"]} compact />;
  if (panel === "output") return <CodePane title="Output" lines={["Tracevane IDE shell mounted", "Provider slot available", "Terminal dock ready"]} compact />;
  return <CodePane title="Terminal" lines={["$ npm run dev", "workspace ready", "provider route: /#/workspace?provider=ide"]} compact />;
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

function SearchPane() {
  return (
    <div className="workspace-ide-shell__search-pane">
      <input placeholder="搜索文件、内容、符号" />
      <TreeList title="搜索结果" items={["WorkspacePage.tsx", "WorkspaceIdeShell.tsx", "WorkspaceTerminal.tsx"]} />
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
