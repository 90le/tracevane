import * as React from "react";
import {
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  FileText,
  GitBranch,
  LayoutPanelTop,
  Play,
  Search,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";

import { WorkspaceEvidenceResponsiveLauncher } from "./WorkspaceEvidenceResponsiveLauncher";
import { WorkspaceSeasonOneFrame } from "./WorkspaceSeasonOneFrame";

export function WorkspaceSeasonOneFramePreview() {
  return (
    <WorkspaceSeasonOneFrame
      topbar={<SeasonOneTopbar />}
      activityRail={<SeasonOneActivityRail />}
      resources={<SeasonOneResources />}
      stage={<SeasonOnePrimaryStage />}
      contextRail={<SeasonOneContextRail />}
      bottomPanel={<SeasonOneBottomPanel />}
      statusBar={<SeasonOneStatusBar />}
      mobileSwitcher={<SeasonOneMobileSwitcher />}
    />
  );
}

function SeasonOneTopbar() {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 text-sm">
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">
        <Boxes className="size-4 text-cyan-200" aria-hidden="true" />
        <span className="font-semibold text-white">Tracevane Season One</span>
      </div>
      <div className="hidden min-w-0 items-center gap-2 text-slate-400 md:flex">
        <span>project-root</span>
        <span>/</span>
        <span className="text-cyan-200">AI coding + writing studio</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Open command center">
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">Command</span>
        </Button>
        <Button size="sm" variant="primary" aria-label="Start AI handoff">
          <Bot aria-hidden="true" />
          <span className="hidden sm:inline">AI Handoff</span>
        </Button>
      </div>
    </div>
  );
}

function SeasonOneActivityRail() {
  const items = [FileText, Search, GitBranch, Terminal, ShieldCheck];
  return (
    <div className="grid justify-items-center gap-3 p-2 text-slate-400">
      {items.map((Icon, index) => (
        <button
          key={index}
          type="button"
          className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] hover:border-cyan-300/40 hover:text-cyan-100"
          aria-label={`Workspace activity ${index + 1}`}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

function SeasonOneResources() {
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] text-sm">
      <header className="border-b border-white/10 p-3">
        <Badge variant="outline" className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100">
          Resources
        </Badge>
        <h2 className="mt-2 font-semibold text-white">Task context</h2>
      </header>
      <div className="min-h-0 overflow-auto p-3">
        {['DESIGN.md', 'apps/web', 'Evidence packet', 'Terminal run', 'Git diff'].map((item) => (
          <div key={item} className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-200">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function SeasonOnePrimaryStage() {
  return (
    <article className="mx-auto grid w-full max-w-5xl gap-5 p-4 sm:p-6 lg:p-8">
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="info">Primary Stage</Badge>
          <Badge variant="outline">Writing + Code</Badge>
          <Badge variant="outline">Evidence gated</Badge>
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
          Redesign the Workspace around a single task stage.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          The new frame makes the editor or writing canvas dominant. Files, terminal, Git, AI, and evidence become task context instead of competing page chrome.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        {['Draft', 'Review', 'Apply'].map((step) => (
          <section key={step} className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80">
            <LayoutPanelTop className="mb-3 size-5 text-cyan-500" aria-hidden="true" />
            <h3 className="font-semibold">{step}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
              Keep every AI writing or coding move tied to visible context and reviewable evidence.
            </p>
          </section>
        ))}
      </div>
    </article>
  );
}

function SeasonOneContextRail() {
  return (
    <div className="h-full min-h-0 overflow-auto p-3">
      <WorkspaceEvidenceResponsiveLauncher />
    </div>
  );
}

function SeasonOneBottomPanel() {
  return (
    <div className="grid min-h-40 grid-rows-[auto_minmax(0,1fr)] text-sm">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-slate-300">
        <Terminal className="size-4 text-emerald-300" aria-hidden="true" />
        <span>Run panel</span>
        <span className="ml-auto text-xs text-slate-500">terminal · tests · agent runs</span>
      </div>
      <pre className="min-h-0 overflow-auto p-3 font-mono text-xs text-emerald-300">
        binbin@tracevane:~/workspace$ npm run verify:workspace-season-one
      </pre>
    </div>
  );
}

function SeasonOneStatusBar() {
  return (
    <div className="flex min-h-7 items-center gap-3 px-3 text-xs">
      <GitBranch className="size-3.5" aria-hidden="true" />
      <span>main</span>
      <CheckCircle2 className="size-3.5" aria-hidden="true" />
      <span>evidence ready</span>
      <span className="ml-auto">Season One Frame Preview</span>
    </div>
  );
}

function SeasonOneMobileSwitcher() {
  return (
    <nav aria-label="Workspace mobile task switcher" className="grid grid-cols-5 border-t border-white/10 bg-slate-950 text-[11px] text-slate-300">
      {[
        ['Files', FileText],
        ['Stage', Braces],
        ['AI', Bot],
        ['Evidence', ShieldCheck],
        ['Run', Play],
      ].map(([label, Icon]) => {
        const TaskIcon = Icon as React.ComponentType<{ className?: string }>;
        return (
          <button key={label as string} type="button" className="grid justify-items-center gap-1 px-1 py-2">
            <TaskIcon className="size-4" aria-hidden="true" />
            <span>{label as string}</span>
          </button>
        );
      })}
    </nav>
  );
}
