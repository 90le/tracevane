import { useMutation, useQuery, useQueryClient, type UseMutationOptions, type UseQueryOptions } from "@tanstack/react-query";

import {
  getOpenClawConfigSummary,
  getSkillsSummary,
  patchOpenClawConfig,
  getSystemDiagnostics,
} from "../api/platform-read";
import type { ApiError } from "../api/errors";
import type { ConfigPatchPayload, ConfigSaveResponse, ConfigSummaryPayload } from "../../../../../types/config";
import type { SkillsSummaryPayload } from "../../../../../types/skills";
import type { SystemDiagnosticsPayload } from "../../../../../types/system";

/**
 * TanStack Query hooks for the Platform/OpenClaw shared read sources that
 * are NOT already covered by another feature's data layer.
 *
 * Reused from their owning modules (NOT re-bound here):
 *  - `useModelGatewayAppConnectionsQuery` (`@/lib/query/model-gateway`)
 *  - `useChannelConnectorsStatusQuery`    (`@/lib/query/channel-connectors`)
 *
 * Query keys are namespaced under `["platform-read", ...]` because `/external` no longer owns a feature surface.
 */

export const platformReadKeys = {
  all: ["platform-read"] as const,
  config: () => ["platform-read", "config"] as const,
  skills: (mode: "fast" | "full" = "full") => ["platform-read", "skills", mode] as const,
  diagnostics: (mode: "fast" | "full" = "full") => ["platform-read", "diagnostics", mode] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

/** OpenClaw config summary (MCP servers + command toggles). */
export function useOpenClawConfigSummaryQuery(
  options?: QueryOpts<ConfigSummaryPayload>,
) {
  return useQuery<ConfigSummaryPayload, ApiError>({
    queryKey: platformReadKeys.config(),
    queryFn: ({ signal }) => getOpenClawConfigSummary(signal),
    ...options,
  });
}

/** Managed skills + local tool capability summary. */
export function useSkillsSummaryQuery(
  options?: QueryOpts<SkillsSummaryPayload>,
  request: { fast?: boolean; refresh?: boolean } = {},
) {
  const mode = request.fast ? "fast" : "full";
  return useQuery<SkillsSummaryPayload, ApiError>({
    queryKey: platformReadKeys.skills(mode),
    queryFn: ({ signal }) => getSkillsSummary(signal, request),
    ...options,
  });
}

/** Tracevane local HTTP bridge diagnostics. */
export function useSystemDiagnosticsQuery(
  options?: QueryOpts<SystemDiagnosticsPayload>,
  request: { includeCommands?: boolean } = {},
) {
  const mode = request.includeCommands === false ? "fast" : "full";
  return useQuery<SystemDiagnosticsPayload, ApiError>({
    queryKey: platformReadKeys.diagnostics(mode),
    queryFn: ({ signal }) => getSystemDiagnostics(signal, request),
    ...options,
  });
}


/** PATCH OpenClaw config and refresh the shared Platform/OpenClaw read surface. */
export function usePatchOpenClawConfigMutation(
  options?: MutationOpts<ConfigSaveResponse, ConfigPatchPayload>,
) {
  const queryClient = useQueryClient();
  return useMutation<ConfigSaveResponse, ApiError, ConfigPatchPayload>({
    mutationFn: (payload) => patchOpenClawConfig(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: platformReadKeys.config() });
      void queryClient.invalidateQueries({ queryKey: platformReadKeys.diagnostics() });
      options?.onSuccess?.(...args);
    },
  });
}
