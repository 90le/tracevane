import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  applyChannelConnectorsV3Config,
  cancelFeishuAppRegistration,
  getChannelConnectorAccountSecrets,
  getChannelConnectorsAgentSessions,
  getChannelConnectorsDaemonConfig,
  getChannelConnectorsDaemonLogs,
  getChannelConnectorsDaemonService,
  getChannelConnectorsStatus,
  getChannelConnectorsV3Config,
  getFeishuAppRegistration,
  manageChannelConnectorsAgentSessions,
  manageChannelConnectorsDaemonService,
  planChannelConnectorsV3Config,
  previewChannelConnectorV3Routing,
  runChannelConnectorsCommandAction,
  runFeishuTransportSmoke,
  runOctoTransportSmoke,
  startFeishuAppRegistration,
} from "../api/channel-connectors";
import type { ApiError } from "../api/errors";
import type {
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorAccountSecretsResponse,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsV3ConfigResponse,
  ChannelConnectorsV3ConfigPlanRequest,
  ChannelConnectorsV3ConfigPlanResponse,
  ChannelConnectorsV3ConfigApplyRequest,
  ChannelConnectorsV3ConfigApplyResponse,
  ChannelConnectorV3RoutingPreviewRequest,
  ChannelConnectorV3RoutingPreviewResponse,
  ChannelConnectorsStatusResponse,
} from "../../features/channel-connectors/types";

/**
 * TanStack Query hooks for the Channel Connectors data layer.
 *
 * Query keys are namespaced under `["channel-connectors", ...]` so mutations
 * can invalidate coherent slices. Errors surface as the normalized
 * {@link ApiError} from the transport layer.
 */

export const channelConnectorsKeys = {
  all: ["channel-connectors"] as const,
  status: () => ["channel-connectors", "status"] as const,
  v3Config: () => ["channel-connectors", "config-v3"] as const,
  accountSecrets: (accountId: string) =>
    ["channel-connectors", "account-secrets", accountId] as const,
  feishuRegistration: (sessionId: string) =>
    ["channel-connectors", "feishu-registration", sessionId] as const,
  daemonConfig: () => ["channel-connectors", "daemon-config"] as const,
  daemonService: () => ["channel-connectors", "daemon-service"] as const,
  daemonLogs: () => ["channel-connectors", "daemon-logs"] as const,
  agentSessions: () => ["channel-connectors", "agent-sessions"] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useChannelConnectorsStatusQuery(
  options?: QueryOpts<ChannelConnectorsStatusResponse>,
) {
  return useQuery<ChannelConnectorsStatusResponse, ApiError>({
    queryKey: channelConnectorsKeys.status(),
    queryFn: ({ signal }) => getChannelConnectorsStatus(signal),
    ...options,
  });
}

export function useChannelConnectorsV3ConfigQuery(
  options?: QueryOpts<ChannelConnectorsV3ConfigResponse>,
) {
  return useQuery<ChannelConnectorsV3ConfigResponse, ApiError>({
    queryKey: channelConnectorsKeys.v3Config(),
    queryFn: ({ signal }) => getChannelConnectorsV3Config(signal),
    ...options,
  });
}

export function useChannelConnectorAccountSecretsQuery(
  accountId: string | null | undefined,
  options?: QueryOpts<ChannelConnectorAccountSecretsResponse>,
) {
  return useQuery<ChannelConnectorAccountSecretsResponse, ApiError>({
    queryKey: channelConnectorsKeys.accountSecrets(accountId ?? ""),
    queryFn: ({ signal }) => getChannelConnectorAccountSecrets(accountId ?? "", signal),
    ...options,
    enabled: Boolean(accountId) && (options?.enabled ?? true),
  });
}

export function useFeishuAppRegistrationQuery(
  sessionId: string | null | undefined,
  options?: QueryOpts<ChannelConnectorFeishuAppRegistrationSessionResponse>,
) {
  return useQuery<ChannelConnectorFeishuAppRegistrationSessionResponse, ApiError>({
    queryKey: channelConnectorsKeys.feishuRegistration(sessionId ?? ""),
    queryFn: ({ signal }) => getFeishuAppRegistration(sessionId ?? "", signal),
    ...options,
    enabled: Boolean(sessionId) && (options?.enabled ?? true),
  });
}

export function useChannelConnectorsDaemonConfigQuery(
  options?: QueryOpts<ChannelConnectorsDaemonConfigResponse>,
) {
  return useQuery<ChannelConnectorsDaemonConfigResponse, ApiError>({
    queryKey: channelConnectorsKeys.daemonConfig(),
    queryFn: ({ signal }) => getChannelConnectorsDaemonConfig(signal),
    ...options,
  });
}

export function useChannelConnectorsDaemonServiceQuery(
  options?: QueryOpts<ChannelConnectorsDaemonResponse>,
) {
  return useQuery<ChannelConnectorsDaemonResponse, ApiError>({
    queryKey: channelConnectorsKeys.daemonService(),
    queryFn: ({ signal }) => getChannelConnectorsDaemonService(signal),
    ...options,
  });
}

export function useChannelConnectorsDaemonLogsQuery(
  options?: QueryOpts<ChannelConnectorsLogsResponse>,
) {
  return useQuery<ChannelConnectorsLogsResponse, ApiError>({
    queryKey: channelConnectorsKeys.daemonLogs(),
    queryFn: ({ signal }) => getChannelConnectorsDaemonLogs(signal),
    ...options,
  });
}

export function useChannelConnectorsAgentSessionsQuery(
  options?: QueryOpts<ChannelConnectorAgentSessionDriverStatusResponse>,
) {
  return useQuery<ChannelConnectorAgentSessionDriverStatusResponse, ApiError>({
    queryKey: channelConnectorsKeys.agentSessions(),
    queryFn: ({ signal }) => getChannelConnectorsAgentSessions(signal),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function usePlanChannelConnectorsV3ConfigMutation(
  options?: MutationOpts<
    ChannelConnectorsV3ConfigPlanResponse,
    ChannelConnectorsV3ConfigPlanRequest
  >,
) {
  return useMutation<
    ChannelConnectorsV3ConfigPlanResponse,
    ApiError,
    ChannelConnectorsV3ConfigPlanRequest
  >({
    mutationFn: (payload) => planChannelConnectorsV3Config(payload),
    ...options,
  });
}

export function useApplyChannelConnectorsV3ConfigMutation(
  options?: MutationOpts<
    ChannelConnectorsV3ConfigApplyResponse,
    ChannelConnectorsV3ConfigApplyRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChannelConnectorsV3ConfigApplyResponse,
    ApiError,
    ChannelConnectorsV3ConfigApplyRequest
  >({
    mutationFn: (payload) => applyChannelConnectorsV3Config(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.v3Config() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonConfig() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonService() });
      options?.onSuccess?.(...args);
    },
  });
}

export function usePreviewChannelConnectorV3RoutingMutation(
  options?: MutationOpts<
    ChannelConnectorV3RoutingPreviewResponse,
    ChannelConnectorV3RoutingPreviewRequest
  >,
) {
  return useMutation<
    ChannelConnectorV3RoutingPreviewResponse,
    ApiError,
    ChannelConnectorV3RoutingPreviewRequest
  >({
    mutationFn: (payload) => previewChannelConnectorV3Routing(payload),
    ...options,
  });
}

export function useStartFeishuAppRegistrationMutation(
  options?: MutationOpts<
    ChannelConnectorFeishuAppRegistrationSessionResponse,
    ChannelConnectorFeishuAppRegistrationStartRequest | void
  >,
) {
  return useMutation<
    ChannelConnectorFeishuAppRegistrationSessionResponse,
    ApiError,
    ChannelConnectorFeishuAppRegistrationStartRequest | void
  >({
    mutationFn: (payload) => startFeishuAppRegistration(payload ?? {}),
    ...options,
  });
}

export function useCancelFeishuAppRegistrationMutation(
  options?: MutationOpts<ChannelConnectorFeishuAppRegistrationSessionResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChannelConnectorFeishuAppRegistrationSessionResponse, ApiError, string>({
    mutationFn: (sessionId) => cancelFeishuAppRegistration(sessionId),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({
        queryKey: channelConnectorsKeys.feishuRegistration(args[0].sessionId),
      });
      options?.onSuccess?.(...args);
    },
  });
}

/** Daemon service lifecycle (preview/install/start/stop/restart/status). */
export function useManageChannelConnectorsDaemonServiceMutation(
  options?: MutationOpts<ChannelConnectorsDaemonResponse, ChannelConnectorsDaemonRequest | void>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChannelConnectorsDaemonResponse, ApiError, ChannelConnectorsDaemonRequest | void>({
    mutationFn: (payload) => manageChannelConnectorsDaemonService(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonService() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}

/** Agent session management (status / reap-idle / kill). */
export function useManageChannelConnectorsAgentSessionsMutation(
  options?: MutationOpts<
    ChannelConnectorAgentSessionDriverStatusResponse,
    ChannelConnectorAgentSessionActionRequest | void
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChannelConnectorAgentSessionDriverStatusResponse,
    ApiError,
    ChannelConnectorAgentSessionActionRequest | void
  >({
    mutationFn: (payload) => manageChannelConnectorsAgentSessions(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.agentSessions() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Execute a command-surface action. The action mutates session state (e.g.
 * stop/reset), so we invalidate sessions + status on success.
 */
export function useRunChannelConnectorsCommandActionMutation(
  options?: MutationOpts<ChannelConnectorCommandActionResponse, ChannelConnectorCommandActionRequest>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChannelConnectorCommandActionResponse, ApiError, ChannelConnectorCommandActionRequest>({
    mutationFn: (payload) => runChannelConnectorsCommandAction(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.agentSessions() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}

/** Feishu transport smoke. Explicit action, no automatic retry. */
export function useRunFeishuTransportSmokeMutation(
  options?: MutationOpts<
    ChannelConnectorFeishuTransportSmokeResponse,
    ChannelConnectorFeishuTransportSmokeRequest
  >,
) {
  return useMutation<
    ChannelConnectorFeishuTransportSmokeResponse,
    ApiError,
    ChannelConnectorFeishuTransportSmokeRequest
  >({
    mutationFn: (payload) => runFeishuTransportSmoke(payload),
    ...options,
  });
}

/** Octo transport smoke. Explicit action, no automatic retry. */
export function useRunOctoTransportSmokeMutation(
  options?: MutationOpts<
    ChannelConnectorOctoTransportSmokeResponse,
    ChannelConnectorOctoTransportSmokeRequest
  >,
) {
  return useMutation<
    ChannelConnectorOctoTransportSmokeResponse,
    ApiError,
    ChannelConnectorOctoTransportSmokeRequest
  >({
    mutationFn: (payload) => runOctoTransportSmoke(payload),
    ...options,
  });
}
