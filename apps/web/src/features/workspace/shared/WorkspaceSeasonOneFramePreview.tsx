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
  const [editorMode, setEditorMode] = React.useState<
    "source" | "draft" | "diff"
  >("source");
  const [draftText, setDraftText] = React.useState(model.canvas.codeSample);

  React.useEffect(() => {
    setDraftText(model.canvas.codeSample);
    setEditorMode("source");
  }, [model.canvas.codeSample]);

  const isDraftDirty = draftText !== model.canvas.codeSample;
  const editorValue =
    editorMode === "diff"
      ? createSeasonOneDraftDiffPreview(model.canvas.codeSample, draftText)
      : editorMode === "draft"
        ? draftText
        : model.canvas.codeSample;
  const editorReadOnly = editorMode !== "draft";
  const dirtyStateLabel = isDraftDirty
    ? "Draft has unsaved changes"
    : "Draft matches live file";
  const evidenceCountLabel =
    model.mission.resourceSummary.match(/\d+ evidence items?/)?.[0] ??
    "evidence required";

  return (
    <article
      className="grid h-full min-h-0 gap-3 p-3 sm:p-4"
      data-season-one-primary-workstage
      data-season-one-real-ide-stage
      data-season-one-work-canvas
    >
      <section className="grid min-h-0 min-w-0 overflow-hidden rounded-[1.5rem] border border-cyan-200/16 bg-slate-950/82 shadow-[0_24px_80px_rgba(0,0,0,0.24)] 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)]">
          <header className="flex min-h-11 items-center gap-2 border-b border-white/10 bg-black/28 px-3 text-xs">
            <Badge variant="info">IDE Stage</Badge>
            <span className="truncate font-semibold text-slate-100">
              {model.canvas.fileName}
            </span>
            <Badge
              variant="outline"
              className="border-cyan-300/20 text-cyan-100"
            >
              {model.canvas.badge}
            </Badge>
            <div
              className="ml-auto hidden items-center gap-2 text-slate-500 sm:flex"
              data-season-one-editor-capabilities
            >
              <span>真实文件</span>
              <span>可编辑草稿</span>
              <span>AI 审查</span>
              <span>证据门禁</span>
            </div>
          </header>

          <div
            className="grid min-h-0 min-w-0 2xl:grid-cols-[minmax(240px,0.42fr)_minmax(0,0.58fr)]"
            data-season-one-editor-grid
          >
            <section className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] border-b border-white/10 bg-slate-900/72 2xl:border-b-0 2xl:border-r">
              <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-400">
                <PenLine
                  className="size-3.5 text-cyan-300"
                  aria-hidden="true"
                />
                <span className="font-semibold text-slate-200">
                  {model.canvas.writingLabel}
                </span>
                <span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em]">
                  reader
                </span>
              </div>
              <div className="min-h-0 overflow-auto p-4">
                <p className="text-sm leading-7 text-slate-300">
                  {model.canvas.writingBody}
                </p>
                <div
                  className="mt-4 rounded-2xl border border-cyan-300/15 bg-cyan-300/10 p-3 text-xs leading-5 text-cyan-50"
                  data-season-one-workbench-banner
                >
                  <strong>Season One is now the default IDE workbench.</strong>{" "}
                  Product notes stay secondary; the primary surface is the live
                  file, AI review, evidence and run state.
                </div>
              </div>
            </section>

            <section
              className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-[#050816]"
              data-season-one-live-editor
            >
              <div
                className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-xs text-slate-400"
                data-season-one-editor-toolbar
              >
                <FileCode2
                  className="size-3.5 text-cyan-300"
                  aria-hidden="true"
                />
                <span className="font-semibold text-slate-200">
                  Live file editor
                </span>
                <div className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1">
                  {([
                    ["source", "Source"],
                    ["draft", "Draft"],
                    ["diff", "Diff"],
                  ] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      className={[
                        "rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] transition",
                        editorMode === mode
                          ? "bg-cyan-300 text-slate-950"
                          : "text-slate-400 hover:bg-white/10 hover:text-cyan-100",
                      ].join(" ")}
                      aria-pressed={editorMode === mode}
                      data-season-one-editor-mode={mode}
                      onClick={() => setEditorMode(mode)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)]">
                <div className="flex items-center gap-2 border-b border-white/10 bg-black/18 px-3 py-2 text-[11px] text-slate-500">
                  <span
                    className={[
                      "size-2 rounded-full",
                      isDraftDirty ? "bg-amber-300" : "bg-emerald-300",
                    ].join(" ")}
                    aria-hidden="true"
                  />
                  <span data-season-one-dirty-state>{dirtyStateLabel}</span>
                  <span
                    className="ml-auto rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200"
                    data-season-one-evidence-count
                  >
                    {evidenceCountLabel}
                  </span>
                  <span className="hidden sm:inline">
                    {editorMode === "draft"
                      ? "Edit buffer is local until evidence approval."
                      : editorMode === "diff"
                        ? "Review exact intent before apply."
                        : "Source is the live file snapshot."}
                  </span>
                </div>
                <textarea
                  className="min-h-0 resize-none overflow-auto border-0 bg-[#050816] p-4 font-mono text-xs leading-6 text-cyan-100 outline-none placeholder:text-slate-600 read-only:cursor-default read-only:text-cyan-100/82"
                  aria-label={`${model.canvas.fileName} Season One edit buffer`}
                  data-season-one-edit-buffer
                  data-season-one-edit-mode={editorMode}
                  data-season-one-edit-dirty={isDraftDirty ? "true" : "false"}
                  readOnly={editorReadOnly}
                  spellCheck={false}
                  value={editorValue}
                  onChange={(event) => setDraftText(event.target.value)}
                />
              </div>
              <div
                className="grid gap-2 border-t border-white/10 p-3 text-xs md:grid-cols-3"
                data-season-one-draft-diff-gate
              >
                <section className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3 text-cyan-50">
                  <div className="font-black uppercase tracking-[0.18em] text-cyan-200">
                    Draft
                  </div>
                  <p className="mt-2 leading-5 text-cyan-50/80">
                    AI or human edits land in the local draft buffer before
                    touching the file.
                  </p>
                  <Button
                    className="mt-3 w-full border-cyan-300/20 bg-cyan-300/10 text-cyan-50 hover:bg-cyan-300/15"
                    size="sm"
                    variant="outline"
                    data-season-one-open-draft
                    onClick={() => setEditorMode("draft")}
                  >
                    Open draft buffer
                  </Button>
                </section>
                <section className="rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-50">
                  <div className="font-black uppercase tracking-[0.18em] text-amber-200">
                    Diff
                  </div>
                  <p className="mt-2 leading-5 text-amber-50/80">
                    Every proposal needs exact intent, command evidence and
                    rollback notes.
                  </p>
                  <Button
                    className="mt-3 w-full border-amber-300/20 bg-amber-300/10 text-amber-50 hover:bg-amber-300/15"
                    size="sm"
                    variant="outline"
                    data-season-one-open-diff
                    onClick={() => setEditorMode("diff")}
                  >
                    Review diff
                  </Button>
                </section>
                <section
                  className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-emerald-50"
                  data-season-one-apply-guard
                >
                  <div className="font-black uppercase tracking-[0.18em] text-emerald-200">
                    Apply gate
                  </div>
                  <p className="mt-2 leading-5 text-emerald-50/80">
                    Apply stays locked until evidence and human approval are
                    attached.
                  </p>
                  <Button
                    className="mt-3 w-full border-emerald-300/20 bg-emerald-300/10 text-emerald-50"
                    size="sm"
                    variant="outline"
                    disabled
                    data-season-one-apply-disabled
                  >
                    Apply locked
                  </Button>
                </section>
              </div>
            </section>
          </div>
        </div>

        <aside
          className="hidden min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] border-t border-white/10 bg-black/42 2xl:grid 2xl:border-l 2xl:border-t-0"
          data-season-one-ai-copilot
        >
          <header className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
            <Sparkles className="size-4 text-cyan-300" aria-hidden="true" />
            <span className="font-semibold text-white">
              {model.aiPartner.title}
            </span>
            <Badge
              variant="outline"
              className="ml-auto border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
            >
              {model.aiPartner.badge}
            </Badge>
          </header>
          <div className="min-h-0 space-y-3 overflow-auto p-4 text-sm leading-6 text-slate-300">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {model.aiPartner.contextLabel}
              </span>
              <p className="mt-2 text-slate-200">
                {model.aiPartner.contextValue}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                {model.aiPartner.nextActionLabel}
              </span>
              <p className="mt-2 text-slate-200">
                {model.aiPartner.nextActionValue}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-emerald-50">
              <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-200">
                Review guard
              </div>
              <p className="mt-2 text-xs leading-5 text-emerald-50/80">
                No agent write applies without selected context, diff preview,
                command/test evidence and explicit approval.
              </p>
            </div>
          </div>
          <footer className="border-t border-white/10 p-3 text-xs text-slate-500">
            {model.mission.resourceSummary}
          </footer>
        </aside>
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

function createSeasonOneDraftDiffPreview(source: string, draft: string) {
  if (source === draft) {
    return [
      "// Draft diff preview",
      "// No draft changes yet. Open Draft, edit the buffer, then review exact intent here before apply.",
    ].join("\n");
  }

  const sourceLines = source.split(/\r\n|\r|\n/);
  const draftLines = draft.split(/\r\n|\r|\n/);
  const maxLines = Math.max(sourceLines.length, draftLines.length);
  const changed: string[] = ["// Draft diff preview", "// - live snapshot", "// + draft buffer"];

  for (let index = 0; index < maxLines && changed.length < 42; index += 1) {
    const before = sourceLines[index] ?? "";
    const after = draftLines[index] ?? "";
    if (before === after) continue;
    changed.push(`@@ line ${index + 1} @@`);
    if (before) changed.push(`- ${before}`);
    if (after) changed.push(`+ ${after}`);
  }

  if (changed.length === 3) {
    changed.push("// Whitespace-only draft delta detected.");
  }

  return changed.join("\n");
}
