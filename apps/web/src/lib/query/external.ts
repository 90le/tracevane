import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import {
  getOpenClawConfigSummary,
  getSkillsSummary,
  getSystemDiagnostics,
} from "../api/external";
import type { ApiError } from "../api/errors";
import type {
  ConfigSummaryPayload,
  SkillsSummaryPayload,
  SystemDiagnosticsPayload,
} from "../../features/external/types";

/**
 * TanStack Query hooks for the External Connections aggregation sources that
 * are NOT already covered by another feature's data layer.
 *
 * Reused from their owning modules (NOT re-bound here):
 *  - `useModelGatewayAppConnectionsQuery` (`@/lib/query/model-gateway`)
 *  - `useChannelConnectorsStatusQuery`    (`@/lib/query/channel-connectors`)
 *
 * Query keys are namespaced under `["external", ...]`.
 */

export const externalKeys = {
  all: ["external"] as const,
  config: () => ["external", "config"] as const,
  skills: () => ["external", "skills"] as const,
  diagnostics: () => ["external", "diagnostics"] as const,
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
    queryKey: externalKeys.config(),
    queryFn: ({ signal }) => getOpenClawConfigSummary(signal),
    ...options,
  });
}

/** Managed skills + local tool capability summary. */
export function useSkillsSummaryQuery(options?: QueryOpts<SkillsSummaryPayload>) {
  return useQuery<SkillsSummaryPayload, ApiError>({
    queryKey: externalKeys.skills(),
    queryFn: ({ signal }) => getSkillsSummary(signal),
    ...options,
  });
}

/** Tracevane local HTTP bridge diagnostics. */
export function useSystemDiagnosticsQuery(
  options?: QueryOpts<SystemDiagnosticsPayload>,
) {
  return useQuery<SystemDiagnosticsPayload, ApiError>({
    queryKey: externalKeys.diagnostics(),
    queryFn: ({ signal }) => getSystemDiagnostics(signal),
    ...options,
  });
}
