import * as React from "react";
import {
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Command,
  FileCode2,
  FileText,
  GitBranch,
  PanelBottom,
  PenLine,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  TimerReset,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";

import { WorkspaceEvidenceResponsiveLauncher } from "./WorkspaceEvidenceResponsiveLauncher";
import { WorkspaceSeasonOneFrame } from "./WorkspaceSeasonOneFrame";
import {
  createWorkspaceSeasonOnePreviewModel,
  type WorkspaceSeasonOneIconKey,
  type WorkspaceSeasonOneInsightCard,
  type WorkspaceSeasonOneProductModel,
} from "./WorkspaceSeasonOneProductModel";

const iconByKey: Record<WorkspaceSeasonOneIconKey, LucideIcon> = {
  ai: Bot,
  code: Braces,
  command: Command,
  evidence: ShieldCheck,
  files: FileText,
  git: GitBranch,
  panel: PanelBottom,
  run: Play,
  search: Search,
  stage: FileCode2,
  terminal: Terminal,
  timer: TimerReset,
  writing: PenLine,
};

const insightToneClass: Record<WorkspaceSeasonOneInsightCard["tone"], string> =
  {
    amber: "text-amber-500",
    cyan: "text-cyan-500",
    violet: "text-violet-500",
  };

export interface WorkspaceSeasonOneFramePreviewProps {
  model?: WorkspaceSeasonOneProductModel;
}

export function WorkspaceSeasonOneFramePreview({
  model = createWorkspaceSeasonOnePreviewModel(),
}: WorkspaceSeasonOneFramePreviewProps) {
  return (
    <WorkspaceSeasonOneFrame
      topbar={<SeasonOneTopbar model={model} />}
      activityRail={<SeasonOneActivityRail model={model} />}
      resources={<SeasonOneResources model={model} />}
      stage={<SeasonOnePrimaryStage model={model} />}
      contextRail={<SeasonOneContextRail model={model} />}
      bottomPanel={<SeasonOneBottomPanel model={model} />}
      statusBar={<SeasonOneStatusBar model={model} />}
      mobileSwitcher={<SeasonOneMobileSwitcher model={model} />}
    />
  );
}

function SeasonOneTopbar({ model }: { model: WorkspaceSeasonOneProductModel }) {
  return (
    <div
      className="flex min-h-14 items-center gap-3 px-3 text-sm"
      data-season-one-command-center
      data-season-one-redesign-manifest
    >
      <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-cyan-200/20 bg-cyan-200/10 px-3 py-2 shadow-[0_0_56px_rgba(34,211,238,0.16)]">
        <Boxes className="size-4 text-cyan-200" aria-hidden="true" />
        <span className="font-semibold text-white">{model.identity.title}</span>
        <span className="rounded-full bg-cyan-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-slate-950">
          Rebuild Studio
        </span>
      </div>
      <div className="hidden min-w-0 items-center gap-2 text-slate-400 md:flex">
        <span>{model.identity.rootLabel}</span>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span className="text-cyan-200">{model.identity.modeLabel}</span>
        <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-amber-100">
          Legacy shell replacement
        </span>
      </div>
      <span className="min-w-0 truncate rounded-full border border-amber-200/25 bg-amber-200/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100 md:hidden">
        Legacy shell replacement · Command Deck
      </span>
      <div className="hidden min-w-0 flex-1 justify-center lg:flex">
        <div className="flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-cyan-200/15 bg-black/38 px-3 py-2 text-slate-400 shadow-inner">
          <Command className="size-4 text-slate-500" aria-hidden="true" />
          <span className="truncate">
            Command Deck · {model.identity.commandPlaceholder}
          </span>
          <kbd className="ml-auto rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-500">
            ⌘K
          </kbd>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" aria-label="Open command center">
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">Command</span>
        </Button>
        <Button size="sm" variant="primary" aria-label="Start AI handoff">
          <Bot aria-hidden="true" />
          <span className="hidden sm:inline">
            {model.identity.primaryActionLabel}
          </span>
        </Button>
      </div>
    </div>
  );
}

function SeasonOneActivityRail({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <div className="grid justify-items-center gap-3 p-2 text-slate-400">
      {model.activityItems.map((item) => {
        const Icon = iconByKey[item.icon];
        return (
          <button
            key={item.id}
            type="button"
            className={[
              "grid size-10 place-items-center rounded-2xl border transition",
              item.active
                ? "border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.18)]"
                : "border-white/10 bg-white/[0.04] hover:border-cyan-300/40 hover:text-cyan-100",
            ].join(" ")}
            aria-label={`Workspace activity: ${item.label}`}
            aria-current={item.active ? "page" : undefined}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function SeasonOneResources({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] text-sm"
      data-season-one-resource-map
    >
      <header className="border-b border-white/10 p-3">
        <Badge
          variant="outline"
          className="border-cyan-300/25 bg-cyan-300/10 text-cyan-100"
        >
          Resources
        </Badge>
        <h2 className="mt-2 font-semibold text-white">Task context map</h2>
        <p className="mt-1 text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">
          One task, every artifact, no page maze
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          Files, prompts, tests and approvals are grouped by the current job,
          not by legacy page type.
        </p>
      </header>
      <div className="min-h-0 overflow-auto p-3">
        <div className="mb-3 rounded-2xl border border-amber-300/25 bg-amber-300/10 p-3 text-amber-50">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
            <CircleDot className="size-3" aria-hidden="true" />
            {model.mission.currentLabel}
          </div>
          <p className="mt-2 text-sm leading-5">{model.mission.currentBody}</p>
        </div>
        {model.resources.map((item) => (
          <div
            key={item.id}
            className="mb-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-slate-200"
          >
            <div className="flex items-center gap-2">
              <FileText className="size-4 text-slate-500" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.label}
              </span>
              <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[10px] text-slate-400">
                {item.state}
              </span>
            </div>
            <p className="mt-1 truncate pl-6 text-xs text-slate-500">
              {item.meta}
            </p>
          </div>
        ))}
      </div>
      <footer className="border-t border-white/10 p-3 text-xs text-slate-400">
        {model.mission.resourceSummary}
      </footer>
    </div>
  );
}

function SeasonOnePrimaryStage({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <article
      className="mx-auto grid w-full max-w-7xl gap-5 p-4 sm:p-6 lg:p-8"
      data-season-one-primary-workstage
    >
      <section className="overflow-hidden rounded-[2.25rem] border border-cyan-200/20 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.18)] dark:border-cyan-200/12 dark:bg-slate-950/72">
        <div className="border-b border-slate-200 bg-[linear-gradient(90deg,rgba(14,165,233,0.12),rgba(99,102,241,0.08),transparent)] px-5 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="info">Primary Stage</Badge>
            <Badge variant="outline">Season One Rebuild Active</Badge>
            <Badge variant="outline">Writing + Code</Badge>
            <Badge variant="outline">Evidence gated</Badge>
            <Badge variant="outline">Responsive first</Badge>
          </div>
        </div>
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.04fr)_minmax(360px,0.96fr)]">
          <div className="p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
              {model.mission.eyebrow} · desktop / tablet / phone
            </p>
            <div
              className="mt-4 grid gap-2 sm:grid-cols-3"
              data-season-one-viewport-manifest
            >
              {[
                "Desktop command deck",
                "Tablet split studio",
                "Phone focus stack",
              ].map((label) => (
                <div
                  key={label}
                  className="rounded-2xl border border-cyan-200/20 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-900 dark:bg-cyan-300/10 dark:text-cyan-100"
                >
                  {label}
                </div>
              ))}
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-[-0.06em] text-slate-950 sm:text-5xl lg:text-6xl dark:text-white">
              {model.mission.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              {model.mission.body}
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {model.phases.map((phase) => (
                <section
                  key={phase.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <span
                      className={[
                        "size-2 rounded-full",
                        phase.status === "done"
                          ? "bg-emerald-400"
                          : phase.status === "active"
                            ? "bg-cyan-400"
                            : "bg-slate-400",
                      ].join(" ")}
                    />
                    {phase.label}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    {phase.copy}
                  </p>
                </section>
              ))}
            </div>
          </div>
          <div className="border-t border-slate-200 bg-slate-950 p-4 text-slate-100 lg:border-l lg:border-t-0 dark:border-white/10">
            <div
              className="rounded-[1.75rem] border border-cyan-200/20 bg-black/62 shadow-[0_0_70px_rgba(34,211,238,0.10)]"
              data-season-one-ai-copilot
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <Sparkles className="size-4 text-cyan-300" aria-hidden="true" />
                <span className="font-semibold">{model.aiPartner.title}</span>
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                  review-gated
                </span>
                <Badge
                  variant="outline"
                  className="ml-auto border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
                >
                  {model.aiPartner.badge}
                </Badge>
              </div>
              <div className="space-y-3 p-4 text-sm leading-6 text-slate-300">
                <p>“{model.aiPartner.quote}”</p>
                <div className="grid gap-2 text-xs">
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="text-slate-500">
                      {model.aiPartner.contextLabel}
                    </span>
                    <p className="mt-1 text-slate-200">
                      {model.aiPartner.contextValue}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
                    <span className="text-slate-500">
                      {model.aiPartner.nextActionLabel}
                    </span>
                    <p className="mt-1 text-slate-200">
                      {model.aiPartner.nextActionValue}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]"
        data-season-one-work-canvas
      >
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm dark:border-cyan-200/12 dark:bg-slate-950/74">
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-sm dark:border-white/10">
            <FileCode2 className="size-4 text-cyan-500" aria-hidden="true" />
            <span className="font-semibold">{model.canvas.fileName}</span>
            <Badge variant="outline" className="ml-auto">
              {model.canvas.badge}
            </Badge>
          </div>
          <div className="grid min-h-72 gap-0 md:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-slate-200 p-4 md:border-b-0 md:border-r dark:border-white/10">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <PenLine className="size-3.5" aria-hidden="true" />
                {model.canvas.writingLabel}
              </div>
              <p className="text-sm leading-7 text-slate-600 dark:text-slate-300">
                {model.canvas.writingBody}
              </p>
            </div>
            <pre className="min-h-0 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-6 text-cyan-100">
              {model.canvas.codeSample}
            </pre>
          </div>
        </div>

        <div className="grid gap-3">
          {model.insightCards.map((card) => {
            const Icon = iconByKey[card.icon];
            return (
              <section
                key={card.id}
                className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-900/80"
              >
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Icon
                    className={`size-4 ${insightToneClass[card.tone]}`}
                    aria-hidden="true"
                  />
                  {card.label}
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {card.body}
                </p>
              </section>
            );
          })}
        </div>
      </section>
    </article>
  );
}

function SeasonOneContextRail({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <div
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      data-season-one-evidence-rail
    >
      <header className="border-b border-white/10 p-3">
        <Badge
          variant="outline"
          className="border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        >
          {model.evidence.badge}
        </Badge>
        <h2 className="mt-2 font-semibold text-white">
          {model.evidence.title}
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-400">
          {model.evidence.body}
        </p>
      </header>
      <div className="min-h-0 overflow-auto p-3">
        <WorkspaceEvidenceResponsiveLauncher />
      </div>
    </div>
  );
}

function SeasonOneBottomPanel({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <div
      className="grid min-h-44 grid-rows-[auto_minmax(0,1fr)] text-sm"
      data-season-one-run-panel
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-slate-300">
        <PanelBottom className="size-4 text-slate-500" aria-hidden="true" />
        <span className="font-medium text-slate-200">
          {model.runPanel.title}
        </span>
        <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
          terminal · tests · evidence
        </span>
        <Badge
          variant="outline"
          className="border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
        >
          {model.runPanel.badge}
        </Badge>
        <span className="ml-auto hidden text-xs text-slate-500 sm:inline">
          {model.runPanel.subtitle}
        </span>
      </div>
      <pre className="min-h-0 overflow-auto p-3 font-mono text-xs leading-6 text-emerald-300">
        {model.runPanel.transcript}
      </pre>
    </div>
  );
}

function SeasonOneStatusBar({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <div className="flex min-h-7 items-center gap-3 px-3 text-xs font-semibold">
      <GitBranch className="size-3.5" aria-hidden="true" />
      <span>{model.status.branch}</span>
      <CheckCircle2 className="size-3.5" aria-hidden="true" />
      <span>{model.status.health}</span>
      <span className="hidden sm:inline">{model.status.viewportCoverage}</span>
      <span className="ml-auto">{model.status.label}</span>
    </div>
  );
}

function SeasonOneMobileSwitcher({
  model,
}: {
  model: WorkspaceSeasonOneProductModel;
}) {
  return (
    <nav
      aria-label="Workspace mobile task switcher"
      className="grid grid-cols-5 border-t border-white/10 bg-slate-950 text-[11px] text-slate-300"
      data-season-one-mobile-navigation
    >
      {model.mobileTasks.map((task) => {
        const TaskIcon = iconByKey[task.icon];
        return (
          <button
            key={task.id}
            type="button"
            className="grid justify-items-center gap-1 px-1 py-2"
          >
            <TaskIcon className="size-4" aria-hidden="true" />
            <span>{task.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
