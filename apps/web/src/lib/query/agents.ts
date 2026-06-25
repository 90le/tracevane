import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { createAgent, deleteAgent, getAgentDetail, getAgentRuntimeRuns, getAgentsSummary, updateAgent } from "../api/agents";
import type { ApiError } from "../api/errors";
import type {
  AgentDetailPayload,
  AgentRuntimeRunsResponse,
  AgentsSummaryPayload,
} from "../../features/cli-agents/types";
import type { AgentCreatePayload, AgentDeletePayload, AgentUpdatePayload } from "../../../../../types/agents";

/**
 * TanStack Query hooks for the read surfaces of the Agents API consumed by the
 * CLI Agent Workbench (`/cli-agents`).
 *
 * Query keys are namespaced under `["cli-agents", "agents", ...]` for legacy
 * cache compatibility. OpenClaw platform pages use these typed mutations for
 * native agent CRUD; CLI runtime/session management stays separate.
 */

export const agentsKeys = {
  all: ["cli-agents", "agents"] as const,
  summary: () => ["cli-agents", "agents", "summary"] as const,
  runtimeRuns: () => ["cli-agents", "agents", "runs"] as const,
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

/** Unified Agent Run projection (`/api/agents/runs`). */
export function useAgentRuntimeRunsQuery(options?: QueryOpts<AgentRuntimeRunsResponse>) {
  return useQuery<AgentRuntimeRunsResponse, ApiError>({
    queryKey: agentsKeys.runtimeRuns(),
    queryFn: ({ signal }) => getAgentRuntimeRuns(signal),
    ...options,
  });
}


export function useCreateAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AgentCreatePayload) => createAgent(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentsKeys.summary() }),
  });
}

export function useUpdateAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: AgentUpdatePayload }) => updateAgent(id, payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: agentsKeys.summary() });
      void queryClient.invalidateQueries({ queryKey: agentsKeys.detail(vars.id) });
    },
  });
}

export function useDeleteAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: AgentDeletePayload }) => deleteAgent(id, payload ?? {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: agentsKeys.summary() }),
  });
}
