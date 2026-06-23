import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { getAgentDetail, getAgentsSummary } from "../api/agents";
import type { ApiError } from "../api/errors";
import type {
  AgentDetailPayload,
  AgentsSummaryPayload,
} from "../../features/cli-agents/types";

/**
 * TanStack Query hooks for the read surfaces of the Agents API consumed by the
 * CLI Agent Workbench (`/cli-agents`).
 *
 * Query keys are namespaced under `["cli-agents", "agents", ...]`. Only the
 * read endpoints the workbench needs are bound — persona authoring stays in the
 * owning domain.
 */

export const agentsKeys = {
  all: ["cli-agents", "agents"] as const,
  summary: () => ["cli-agents", "agents", "summary"] as const,
  detail: (id: string) => ["cli-agents", "agents", "detail", id] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

/** Persona agent roster + roll-up (`/api/agents`). */
export function useAgentsSummaryQuery(options?: QueryOpts<AgentsSummaryPayload>) {
  return useQuery<AgentsSummaryPayload, ApiError>({
    queryKey: agentsKeys.summary(),
    queryFn: ({ signal }) => getAgentsSummary(signal),
    ...options,
  });
}

/**
 * Full persona detail (`/api/agents/:id`) — profile, runtime, bindings, recent
 * sessions. Disabled until an agent id is selected.
 */
export function useAgentDetailQuery(
  id: string | null,
  options?: QueryOpts<AgentDetailPayload>,
) {
  return useQuery<AgentDetailPayload, ApiError>({
    queryKey: agentsKeys.detail(id ?? "__none__"),
    queryFn: ({ signal }) => getAgentDetail(id as string, signal),
    enabled: id != null && id.length > 0,
    ...options,
  });
}
