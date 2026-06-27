/**
 * CLI Agent Workbench (`/cli-agents`) feature types.
 *
 * The wire contracts live in the repo-level `types/*.ts` (the same files the
 * backend imports). We re-export the pieces the workbench data layer + views
 * need, plus the small derived view-model + view-routing types the page
 * synthesizes.
 *
 * Reused contracts from other feature modules (NOT re-exported here):
 *  - Model Gateway status   → `@/features/model-gateway/types`
 *  - Channel Connectors     → `@/features/channel-connectors/types`
 *  - Chat bootstrap / terminal status → `@/features/dashboard/types`
 */

// --- Agents (legacy profile contracts; not a primary CLI Agents view) -------
export type {
  AgentSummary,
  AgentsSummaryPayload,
  AgentDetailPayload,
  AgentIdentitySummary,
  AgentRuntimeSummary,
  AgentBindingSummary,
  AgentSessionStats,
  AgentSessionSummary,
  AgentDocumentSummary,
  AgentRuntimeRunSource,
  AgentRuntimeRunStatus,
  AgentRuntimeRunEvidenceRef,
  AgentRuntimeRunSummary,
  AgentRuntimeRunsResponse,
} from "../../../../../types/agents";

// --- Terminal (CLI binary readiness + Agent Run evidence references) --------
export type {
  TerminalStatusPayload,
  TerminalBinaryStatus,
  TerminalSessionDescriptor,
  TerminalSessionStatus,
  TerminalSessionSummaryResponse,
  TerminalLaunchCli,
  TerminalLaunchPayload,
  TerminalLaunchResponse,
  TerminalInstallRequestId,
  TerminalInstallResponse,
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalGatewayAttachPayload,
} from "../../../../../types/terminal";

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------

/**
 * The `data-view` set for the workbench, driven from the URL (`?view=`):
 *  - runs      — primary Agent Run table across terminal / IM / chat sources
 *  - cli       — Codex / Claude Code / OpenCode readiness, install repair and launch handoff
 */
export const CLI_AGENTS_VIEWS = ["runs", "cli"] as const;

export type CliAgentsView = (typeof CLI_AGENTS_VIEWS)[number];

/** Navigation params a view can carry across a sub-view switch. */
export interface CliAgentsViewNavParams {
  /** Reserved for future deep-link params; currently unused after CLI/terminal scope reduction. */
  agent?: string;
}

/** Imperative navigation the page passes down to its views. */
export interface CliAgentsViewNavigation {
  goToView: (view: CliAgentsView, params?: CliAgentsViewNavParams) => void;
}

export interface CliAgentsViewProps extends CliAgentsViewNavigation {
  /** Reserved compatibility prop for view components; currently always null. */
  selectedAgent: string | null;
}

// ---------------------------------------------------------------------------
// Derived view-model tones (mirrors the dashboard readiness tone vocabulary)
// ---------------------------------------------------------------------------

export type WorkbenchTone = "ok" | "warn" | "bad" | "info" | "mute";
