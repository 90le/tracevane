import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  createAgent,
  deleteAgent,
  getAgentDetail,
  getAgentsSummary,
  updateAgent,
} from "../api/agents";
import type { ApiError } from "../api/errors";
import type {
  AgentDetailPayload,
  AgentsSummaryPayload,
} from "../../features/cli-agents/types";
import type {
  AgentCreatePayload,
  AgentDeletePayload,
  AgentUpdatePayload,
} from "../../../../../types/agents";

/**
 * TanStack Query hooks for the read surfaces of the Agents API consumed by the
 * OpenClaw platform pages use these typed mutations for native agent CRUD;
 * CLI runtime/session management stays separate.
 *
 * Query keys keep the legacy `["cli-agents", "agents", ...]` namespace so
 * existing cache invalidation remains stable during the domain split.
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
export function useAgentsSummaryQuery(
  options?: QueryOpts<AgentsSummaryPayload>,
) {
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

export function useCreateAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: AgentCreatePayload) => createAgent(payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: agentsKeys.summary() }),
  });
}

export function useUpdateAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: AgentUpdatePayload;
    }) => updateAgent(id, payload),
    onSuccess: (_data, vars) => {
      void queryClient.invalidateQueries({ queryKey: agentsKeys.summary() });
      void queryClient.invalidateQueries({
        queryKey: agentsKeys.detail(vars.id),
      });
    },
  });
}

export function useDeleteAgentMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload?: AgentDeletePayload;
    }) => deleteAgent(id, payload ?? {}),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: agentsKeys.summary() }),
  });
}
