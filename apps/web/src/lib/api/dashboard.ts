import { apiRequest } from "./client";
import type { DashboardSummaryPayload } from "../../../../../types/dashboard";
import type { SystemHealthPayload } from "../../../../../types/system";
import type { ChatBootstrapPayload } from "../../../../../types/chat";
import type { TerminalStatusPayload } from "../../../../../types/terminal";
import type { OpenClawRecoveryStatusPayload } from "../../../../../types/openclaw-recovery";

/**
 * Typed transport bindings for the read-only source APIs the Dashboard cockpit
 * AGGREGATES. These are the sources the old page consumed that are NOT already
 * wrapped by another feature's data layer.
 *
 * Reused from their owning feature modules (intentionally NOT re-bound here):
 *  - `/api/model-gateway/status`            → `useModelGatewayStatusQuery`
 *  - `/api/channel-connectors/status`       → `useChannelConnectorsStatusQuery`
 *  - `/api/channel-connectors/agent-sessions` → `useChannelConnectorsAgentSessionsQuery`
 *
 * Bound here (everything else the cockpit reads):
 *  - GET /api/dashboard/summary           → server-derived task/runtime summary
 *  - GET /api/system/health               → runtime health (version, gateway, service)
 *  - GET /api/chat/bootstrap              → conversation sessions + runtime states
 *  - GET /api/terminal/status            → CLI binaries / agent install state
 *  - GET /api/openclaw-recovery/status   → self-heal daemon / probe / repair state
 *
 * All are read-only GETs. The cockpit never writes through these — actions
 * deep-link to the owning domain.
 */

/** GET /api/dashboard/summary — server-derived task/runtime summary. */
export function getDashboardSummary(
  signal?: AbortSignal,
): Promise<DashboardSummaryPayload> {
  return apiRequest<DashboardSummaryPayload>("/api/dashboard/summary", { signal });
}

/** GET /api/system/health — runtime health snapshot. */
export function getSystemHealth(signal?: AbortSignal): Promise<SystemHealthPayload> {
  return apiRequest<SystemHealthPayload>("/api/system/health", { signal });
}

/**
 * GET /api/chat/bootstrap — conversation sessions + per-session runtime state.
 * The cockpit only needs the recent session list, so it requests a small
 * recent window and minimal history.
 */
export function getChatBootstrap(signal?: AbortSignal): Promise<ChatBootstrapPayload> {
  return apiRequest<ChatBootstrapPayload>(
    "/api/chat/bootstrap?recentLimit=12&historyLimit=1",
    { signal },
  );
}

/** GET /api/terminal/status — CLI binaries / agent install state. */
export function getTerminalStatus(
  signal?: AbortSignal,
): Promise<TerminalStatusPayload> {
  return apiRequest<TerminalStatusPayload>("/api/terminal/status", { signal });
}

/** GET /api/openclaw-recovery/status — self-heal daemon / probe / repair state. */
export function getOpenClawRecoveryStatus(
  signal?: AbortSignal,
): Promise<OpenClawRecoveryStatusPayload> {
  return apiRequest<OpenClawRecoveryStatusPayload>(
    "/api/openclaw-recovery/status",
    { signal },
  );
}
