import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  applyChannelConnectorsConfig,
  cancelFeishuAppRegistration,
  getChannelConnectorBindingSecrets,
  getChannelConnectorsAgentSessions,
  getChannelConnectorsConfig,
  getChannelConnectorsDaemonConfig,
  getChannelConnectorsDaemonLogs,
  getChannelConnectorsDaemonService,
  getChannelConnectorsStatus,
  getFeishuAppRegistration,
  manageChannelConnectorsAgentSessions,
  manageChannelConnectorsDaemonService,
  runChannelConnectorsCommandAction,
  runFeishuTransportSmoke,
  runOctoTransportSmoke,
  saveChannelConnectorsConfig,
  startFeishuAppRegistration,
} from "../api/channel-connectors";
import type { ApiError } from "../api/errors";
import type {
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorAgentSessionDriverStatusResponse,
  ChannelConnectorBindingSecretsResponse,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorCommandActionResponse,
  ChannelConnectorFeishuAppRegistrationSessionResponse,
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorFeishuTransportSmokeResponse,
  ChannelConnectorOctoTransportSmokeRequest,
  ChannelConnectorOctoTransportSmokeResponse,
  ChannelConnectorsDaemonConfigResponse,
  ChannelConnectorsApplyNativeConfigRequest,
  ChannelConnectorsApplyNativeConfigResponse,
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsDaemonResponse,
  ChannelConnectorsLogsResponse,
  ChannelConnectorsNativeConfigResponse,
  ChannelConnectorsSaveNativeConfigRequest,
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
  config: () => ["channel-connectors", "config"] as const,
  bindingSecrets: (bindingId: string) =>
    ["channel-connectors", "binding-secrets", bindingId] as const,
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

export function useChannelConnectorsConfigQuery(
  options?: QueryOpts<ChannelConnectorsNativeConfigResponse>,
) {
  return useQuery<ChannelConnectorsNativeConfigResponse, ApiError>({
    queryKey: channelConnectorsKeys.config(),
    queryFn: ({ signal }) => getChannelConnectorsConfig(signal),
    ...options,
  });
}

export function useChannelConnectorBindingSecretsQuery(
  bindingId: string | null | undefined,
  options?: QueryOpts<ChannelConnectorBindingSecretsResponse>,
) {
  return useQuery<ChannelConnectorBindingSecretsResponse, ApiError>({
    queryKey: channelConnectorsKeys.bindingSecrets(bindingId ?? ""),
    queryFn: ({ signal }) => getChannelConnectorBindingSecrets(bindingId ?? "", signal),
    ...options,
    enabled: Boolean(bindingId) && (options?.enabled ?? true),
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

/**
 * Save the native config (bindings + agent profiles). Invalidates config plus
 * the status/daemon slices a binding change can affect.
 */
export function useSaveChannelConnectorsConfigMutation(
  options?: MutationOpts<
    ChannelConnectorsNativeConfigResponse,
    ChannelConnectorsSaveNativeConfigRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChannelConnectorsNativeConfigResponse,
    ApiError,
    ChannelConnectorsSaveNativeConfigRequest
  >({
    mutationFn: (payload) => saveChannelConnectorsConfig(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.config() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonConfig() });
      options?.onSuccess?.(...args);
    },
  });
}

/** Save native config and apply it to the daemon with server-side rollback. */
export function useApplyChannelConnectorsConfigMutation(
  options?: MutationOpts<
    ChannelConnectorsApplyNativeConfigResponse,
    ChannelConnectorsApplyNativeConfigRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChannelConnectorsApplyNativeConfigResponse,
    ApiError,
    ChannelConnectorsApplyNativeConfigRequest
  >({
    mutationFn: (payload) => applyChannelConnectorsConfig(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.config() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.status() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonConfig() });
      void queryClient.invalidateQueries({ queryKey: channelConnectorsKeys.daemonService() });
      options?.onSuccess?.(...args);
    },
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
