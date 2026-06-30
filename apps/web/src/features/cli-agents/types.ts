/**
 * CLI Agent management page (`/cli-agents`) feature types.
 *
 * The wire contracts live in the repo-level `types/*.ts` (the same files the
 * backend imports). We re-export the pieces the workbench data layer + views
 * need, plus the small derived view-model + view-routing types the page
 * synthesizes.
 *
 * Reused contracts from other feature modules (NOT re-exported here):
 *  - Model Gateway status   → `@/features/model-gateway/types`
 *  - Channel Connectors     → `@/features/channel-connectors/types`
 *  - Terminal status → `@/features/dashboard/types`
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
} from "../../../../../types/agents";

// --- Terminal (CLI binary readiness + install/repair contracts) ------------
export type {
  TerminalStatusPayload,
  TerminalBinaryStatus,
  TerminalSessionDescriptor,
  TerminalSessionStatus,
  TerminalSessionSummaryResponse,
  TerminalAgentCliId,
  TerminalInstallRequestId,
  TerminalInstallTarget,
  TerminalInstallResponse,
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalGatewayAttachPayload,
} from "../../../../../types/terminal";

// ---------------------------------------------------------------------------
// Page scope
// ---------------------------------------------------------------------------

/**
 * CLI Agents is now a single management surface. It intentionally has no
 * secondary "runs" view: install/config/repair status must render first, then
 * async readiness data fills in per CLI.
 */
export const CLI_AGENT_MANAGEMENT_SCOPE = [
  "install",
  "configure",
  "reinstall",
  "repair",
] as const;

// ---------------------------------------------------------------------------
// Derived view-model tones (mirrors the dashboard readiness tone vocabulary)
// ---------------------------------------------------------------------------

export type WorkbenchTone = "ok" | "warn" | "bad" | "info" | "mute";
