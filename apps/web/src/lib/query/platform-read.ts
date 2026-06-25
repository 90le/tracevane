import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import {
  getOpenClawConfigSummary,
  getSkillsSummary,
  getSystemDiagnostics,
} from "../api/platform-read";
import type { ApiError } from "../api/errors";
import type { ConfigSummaryPayload } from "../../../../../types/config";
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
  skills: () => ["platform-read", "skills"] as const,
  diagnostics: () => ["platform-read", "diagnostics"] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
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
export function useSkillsSummaryQuery(options?: QueryOpts<SkillsSummaryPayload>) {
  return useQuery<SkillsSummaryPayload, ApiError>({
    queryKey: platformReadKeys.skills(),
    queryFn: ({ signal }) => getSkillsSummary(signal),
    ...options,
  });
}

/** Tracevane local HTTP bridge diagnostics. */
export function useSystemDiagnosticsQuery(
  options?: QueryOpts<SystemDiagnosticsPayload>,
) {
  return useQuery<SystemDiagnosticsPayload, ApiError>({
    queryKey: platformReadKeys.diagnostics(),
    queryFn: ({ signal }) => getSystemDiagnostics(signal),
    ...options,
  });
}
