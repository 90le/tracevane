import { apiRequest } from "./client";
import type {
  AgentDetailPayload,
  AgentRuntimeRunsResponse,
  AgentsSummaryPayload,
} from "../../features/cli-agents/types";
import type { AgentCreatePayload, AgentDeletePayload, AgentUpdatePayload, AgentsMutationResponse } from "../../../../../types/agents";

/**
 * Typed transport bindings for the read surfaces of the Agents HTTP API
 * (`apps/api/modules/agents/routes.ts`) that the CLI Agent Workbench consumes.
 *
 * The CLI Agent domain consumes runtime/evidence reads from this module. The
 * OpenClaw platform domain also uses the native create/update/delete endpoints
 * for upstream OpenClaw agent definitions. Runtime sessions stay separate.
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


export function createAgent(payload: AgentCreatePayload): Promise<AgentsMutationResponse> {
  return apiRequest<AgentsMutationResponse>(BASE, { method: "POST", body: JSON.stringify(payload) });
}

export function updateAgent(id: string, payload: AgentUpdatePayload): Promise<AgentsMutationResponse> {
  return apiRequest<AgentsMutationResponse>(`${BASE}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteAgent(id: string, payload: AgentDeletePayload = {}): Promise<AgentsMutationResponse> {
  return apiRequest<AgentsMutationResponse>(`${BASE}/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify(payload) });
}
