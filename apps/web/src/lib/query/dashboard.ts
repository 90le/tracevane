import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import {
  getChatBootstrap,
  getDashboardSummary,
  getOpenClawRecoveryStatus,
  getSystemHealth,
  getTerminalStatus,
} from "../api/dashboard";
import type { ApiError } from "../api/errors";
import type {
  ChatBootstrapPayload,
  DashboardSummaryPayload,
  OpenClawRecoveryStatusPayload,
  SystemHealthPayload,
  TerminalStatusPayload,
} from "../../features/dashboard/types";

/**
 * TanStack Query hooks for the Dashboard cockpit aggregation sources that are
 * NOT already covered by another feature's data layer.
 *
 * Reused from their owning modules (NOT re-bound here):
 *  - `useModelGatewayStatusQuery`            (`@/lib/query/model-gateway`)
 *  - `useChannelConnectorsStatusQuery`       (`@/lib/query/channel-connectors`)
 *  - `useChannelConnectorsAgentSessionsQuery`(`@/lib/query/channel-connectors`)
 *
 * Query keys are namespaced under `["dashboard", ...]`.
 */

export const dashboardKeys = {
  all: ["dashboard"] as const,
  summary: () => ["dashboard", "summary"] as const,
  systemHealth: () => ["dashboard", "system-health"] as const,
  chatBootstrap: () => ["dashboard", "chat-bootstrap"] as const,
  terminalStatus: () => ["dashboard", "terminal-status"] as const,
  recoveryStatus: () => ["dashboard", "recovery-status"] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

/** Server-derived task / runtime summary (`/api/dashboard/summary`). */
export function useDashboardSummaryQuery(
  options?: QueryOpts<DashboardSummaryPayload>,
) {
  return useQuery<DashboardSummaryPayload, ApiError>({
    queryKey: dashboardKeys.summary(),
    queryFn: ({ signal }) => getDashboardSummary(signal),
    ...options,
  });
}

/** Runtime health snapshot (`/api/system/health`). */
export function useSystemHealthQuery(options?: QueryOpts<SystemHealthPayload>) {
  return useQuery<SystemHealthPayload, ApiError>({
    queryKey: dashboardKeys.systemHealth(),
    queryFn: ({ signal }) => getSystemHealth(signal),
    ...options,
  });
}

/** Conversation sessions + per-session runtime state (`/api/chat/bootstrap`). */
export function useChatBootstrapQuery(options?: QueryOpts<ChatBootstrapPayload>) {
  return useQuery<ChatBootstrapPayload, ApiError>({
    queryKey: dashboardKeys.chatBootstrap(),
    queryFn: ({ signal }) => getChatBootstrap(signal),
    ...options,
  });
}

/** CLI binaries / agent install state (`/api/terminal/status`). */
export function useTerminalStatusQuery(
  options?: QueryOpts<TerminalStatusPayload>,
) {
  return useQuery<TerminalStatusPayload, ApiError>({
    queryKey: dashboardKeys.terminalStatus(),
    queryFn: ({ signal }) => getTerminalStatus(signal),
    ...options,
  });
}

/** Self-heal daemon / probe / repair state (`/api/openclaw-recovery/status`). */
export function useOpenClawRecoveryStatusQuery(
  options?: QueryOpts<OpenClawRecoveryStatusPayload>,
) {
  return useQuery<OpenClawRecoveryStatusPayload, ApiError>({
    queryKey: dashboardKeys.recoveryStatus(),
    queryFn: ({ signal }) => getOpenClawRecoveryStatus(signal),
    ...options,
  });
}
