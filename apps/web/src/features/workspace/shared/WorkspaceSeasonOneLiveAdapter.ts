import {
  createWorkspaceSeasonOnePreviewModel,
  type WorkspaceSeasonOneActivityItem,
  type WorkspaceSeasonOneProductModel,
  type WorkspaceSeasonOneResourceItem,
} from "./WorkspaceSeasonOneProductModel";

export interface WorkspaceSeasonOneLiveAdapterInput {
  rootLabel?: string;
  activePath?: string | null;
  openFiles?: string[];
  gitChanges?: number;
  evidenceItems?: number;
  terminalState?: "idle" | "running" | "failed" | "passed";
  agentState?: "idle" | "drafting" | "waiting-review" | "approved";
  lastRunLabel?: string;
  viewportCoverage?: string;
}

export function createWorkspaceSeasonOneLiveModel(
  input: WorkspaceSeasonOneLiveAdapterInput = {},
): WorkspaceSeasonOneProductModel {
  const base = createWorkspaceSeasonOnePreviewModel();
  const activePath = normalizeValue(input.activePath) ?? base.canvas.fileName;
  const openFiles = normalizeList(input.openFiles);
  const gitChanges = clampCount(input.gitChanges);
  const evidenceItems = clampCount(input.evidenceItems);
  const terminalState = input.terminalState ?? "idle";
  const agentState = input.agentState ?? "idle";
  const terminalSummary = describeTerminalState(terminalState, input.lastRunLabel);
  const agentSummary = describeAgentState(agentState, evidenceItems);

  return {
    ...base,
    identity: {
      ...base.identity,
      rootLabel: normalizeValue(input.rootLabel) ?? base.identity.rootLabel,
    },
    mission: {
      ...base.mission,
      currentBody: activePath
        ? `Focus on ${activePath} with files, AI, run state and evidence bound to one task stage.`
        : base.mission.currentBody,
      resourceSummary: describeResourceSummary({
        openFileCount: openFiles.length,
        gitChanges,
        evidenceItems,
      }),
    },
    activityItems: createLiveActivityItems({ gitChanges, evidenceItems, terminalState }),
    resources: createLiveResources({
      activePath,
      openFiles,
      gitChanges,
      evidenceItems,
      terminalSummary,
      agentSummary,
    }),
    aiPartner: {
      ...base.aiPartner,
      badge: agentState === "approved" ? "approved" : evidenceItems > 0 ? "cited" : "needs evidence",
      contextValue: [activePath, `${openFiles.length} open files`, `${evidenceItems} evidence items`]
        .filter(Boolean)
        .join(" · "),
      nextActionValue: agentSummary,
    },
    canvas: {
      ...base.canvas,
      fileName: activePath,
      badge: openFiles.includes(activePath) ? "open" : "focused",
      writingBody: `Season One live adapter is focused on ${activePath}. The shell should keep writing, code, run output and evidence visible as one coherent workspace task.`,
      codeSample: `<WorkspaceSeasonOneFramePreview
  model={createWorkspaceSeasonOneLiveModel({
    rootLabel: ${JSON.stringify(input.rootLabel ?? base.identity.rootLabel)},
    activePath: ${JSON.stringify(activePath)},
    gitChanges: ${gitChanges},
    evidenceItems: ${evidenceItems},
    terminalState: ${JSON.stringify(terminalState)}
  })}
/>`,
    },
    evidence: {
      ...base.evidence,
      title: evidenceItems > 0 ? "Evidence cockpit" : "Evidence required",
      body:
        evidenceItems > 0
          ? `${evidenceItems} evidence item${evidenceItems === 1 ? "" : "s"} attached to this workspace task.`
          : "No evidence is attached yet; AI apply actions should stay gated until proof exists.",
    },
    runPanel: {
      ...base.runPanel,
      badge: terminalState,
      transcript: terminalSummary,
    },
    status: {
      ...base.status,
      health: createStatusHealth({ terminalState, evidenceItems, agentState }),
      viewportCoverage: input.viewportCoverage ?? base.status.viewportCoverage,
      label: "Season One Live Adapter",
    },
  };
}

function createLiveActivityItems({
  gitChanges,
  evidenceItems,
  terminalState,
}: {
  gitChanges: number;
  evidenceItems: number;
  terminalState: NonNullable<WorkspaceSeasonOneLiveAdapterInput["terminalState"]>;
}): WorkspaceSeasonOneActivityItem[] {
  return [
    { id: "files", label: "Files", icon: "files", active: true },
    { id: "search", label: "Search", icon: "search" },
    { id: "git", label: gitChanges > 0 ? `Git ${gitChanges}` : "Git", icon: "git" },
    { id: "run", label: terminalState === "running" ? "Running" : "Run", icon: "terminal" },
    {
      id: "evidence",
      label: evidenceItems > 0 ? `Evidence ${evidenceItems}` : "Evidence",
      icon: "evidence",
    },
  ];
}

function createLiveResources({
  activePath,
  openFiles,
  gitChanges,
  evidenceItems,
  terminalSummary,
  agentSummary,
}: {
  activePath: string;
  openFiles: string[];
  gitChanges: number;
  evidenceItems: number;
  terminalSummary: string;
  agentSummary: string;
}): WorkspaceSeasonOneResourceItem[] {
  const primaryFiles = [activePath, ...openFiles.filter((path) => path !== activePath)].slice(0, 3);
  const fileResources = primaryFiles.map((path, index) => ({
    id: `file-${index}`,
    label: path,
    meta: index === 0 ? "focused artifact" : "open artifact",
    state: index === 0 ? "active" : "open",
  }));

  return [
    ...fileResources,
    {
      id: "git-live",
      label: gitChanges > 0 ? `${gitChanges} Git changes` : "Git clean",
      meta: "change review scope",
      state: gitChanges > 0 ? "review" : "clean",
    },
    {
      id: "evidence-live",
      label: evidenceItems > 0 ? `${evidenceItems} evidence items` : "Evidence required",
      meta: "approval gate",
      state: evidenceItems > 0 ? "ready" : "blocked",
    },
    {
      id: "terminal-live",
      label: "Terminal run",
      meta: terminalSummary.split("\n")[0] ?? "terminal state",
      state: "live",
    },
    {
      id: "agent-live",
      label: "AI handoff",
      meta: agentSummary,
      state: "tracked",
    },
  ];
}

function describeResourceSummary({
  openFileCount,
  gitChanges,
  evidenceItems,
}: {
  openFileCount: number;
  gitChanges: number;
  evidenceItems: number;
}) {
  return `${openFileCount} open file${openFileCount === 1 ? "" : "s"} · ${gitChanges} Git change${gitChanges === 1 ? "" : "s"} · ${evidenceItems} evidence item${evidenceItems === 1 ? "" : "s"}`;
}

function describeTerminalState(
  state: NonNullable<WorkspaceSeasonOneLiveAdapterInput["terminalState"]>,
  lastRunLabel?: string,
) {
  const label = normalizeValue(lastRunLabel) ?? "workspace verification";
  if (state === "running") return `${label}\n… running inside the Season One run panel`;
  if (state === "failed") return `${label}\n✕ failed — keep apply gated and inspect evidence`;
  if (state === "passed") return `${label}\n✓ passed — ready for review evidence`;
  return `${label}\n• idle — no active terminal run`;
}

function describeAgentState(
  state: NonNullable<WorkspaceSeasonOneLiveAdapterInput["agentState"]>,
  evidenceItems: number,
) {
  if (state === "drafting") return "AI is drafting a proposal against the focused task context.";
  if (state === "waiting-review") return "AI proposal is waiting for human review and evidence approval.";
  if (state === "approved") return "AI proposal is approved and ready for staged apply.";
  if (evidenceItems > 0) return "Attach evidence to the next AI handoff before staged apply.";
  return "Collect evidence before allowing AI apply actions.";
}

function createStatusHealth({
  terminalState,
  evidenceItems,
  agentState,
}: {
  terminalState: NonNullable<WorkspaceSeasonOneLiveAdapterInput["terminalState"]>;
  evidenceItems: number;
  agentState: NonNullable<WorkspaceSeasonOneLiveAdapterInput["agentState"]>;
}) {
  if (terminalState === "failed") return "run failed";
  if (agentState === "approved" && evidenceItems > 0) return "approved";
  if (evidenceItems > 0) return "evidence ready";
  return "needs evidence";
}

function normalizeList(values?: string[]) {
  if (!values) return [];
  return values.map((value) => value.trim()).filter(Boolean);
}

function normalizeValue(value?: string | null) {
  const normalized = value?.trim();
  return normalized || undefined;
}

function clampCount(value?: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}
