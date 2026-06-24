import { apiRequest } from "./client";
import type {
  AgentDetailPayload,
  AgentRuntimeRunsResponse,
  AgentsSummaryPayload,
} from "../../features/cli-agents/types";

/**
 * Typed transport bindings for the read surfaces of the Agents HTTP API
 * (`apps/api/modules/agents/routes.ts`) that the CLI Agent Workbench consumes.
 *
 * The workbench is a RUNTIME/EVIDENCE console: it surfaces persona profiles,
 * their bindings and recent sessions read-only. Persona authoring (create /
 * update / delete / doc editing / binding mutations) is the owning domain's job
 * and is intentionally NOT bound here — those edits deep-link out.
 *
 * Response shapes come from the shared contract (`types/agents.ts`).
 */

const BASE = "/api/agents";

/** GET /api/agents — persona agent roster + roll-up. */
export function getAgentsSummary(
  signal?: AbortSignal,
): Promise<AgentsSummaryPayload> {
  return apiRequest<AgentsSummaryPayload>(BASE, { signal });
}

/** GET /api/agents/runs — unified Agent Run projection across Terminal, IM and Chat. */
export function getAgentRuntimeRuns(
  signal?: AbortSignal,
): Promise<AgentRuntimeRunsResponse> {
  return apiRequest<AgentRuntimeRunsResponse>(`${BASE}/runs`, { signal });
}

/**
 * GET /api/agents/:id — full persona detail (profile, runtime, docs, bindings,
 * session stats + recent sessions). Returns `null` when the agent is unknown
 * (the route answers 404 for an unknown id).
 */
export async function getAgentDetail(
  id: string,
  signal?: AbortSignal,
): Promise<AgentDetailPayload> {
  return apiRequest<AgentDetailPayload>(`${BASE}/${encodeURIComponent(id)}`, {
    signal,
  });
}
