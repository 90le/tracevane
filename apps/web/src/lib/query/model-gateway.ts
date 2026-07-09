import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  applyModelGatewayAppConnection,
  applyModelGatewayAppConnections,
  createModelGatewayProvider,
  deleteModelGatewayProvider,
  detectModelGatewayProvider,
  getAppConnectionBackup,
  getAppConnectionBackups,
  getModelGatewayClientAuth,
  getModelGatewayDaemonService,
  getModelGatewayModels,
  getModelGatewayProviderSecret,
  getModelGatewayRuntime,
  getModelGatewayStatus,
  getModelGatewayUsage,
  listModelGatewayAppConnections,
  listModelGatewayProviders,
  manageModelGatewayDaemonService,
  pollCodexAccountLogin,
  refreshModelGatewayProviderAccount,
  rollbackModelGatewayAppConnection,
  setModelGatewayActiveProvider,
  setModelGatewayProviderSecret,
  smokeModelGatewayActiveRoute,
  startCodexAccountLogin,
  testModelGatewayProvider,
  updateModelGatewayAppConnectionProfile,
  updateModelGatewayClientAuth,
  updateModelGatewayProvider,
  updateModelGatewayProviderAccount,
} from "../api/model-gateway";
import type { ApiError } from "../api/errors";
import type {
  ModelGatewayActiveRouteSmokeRequest,
  ModelGatewayApplyAppConnectionRequest,
  ModelGatewayApplyAppConnectionResponse,
  ModelGatewayApplyAppConnectionsResponse,
  ModelGatewayAppConnectionId,
  ModelGatewayAppConnectionsResponse,
  ModelGatewayAppConnectionBackupsResponse,
  ModelGatewayClientAuthResponse,
  ModelGatewayClientAuthUpdateRequest,
  ModelGatewayCodexAccountLoginPollRequest,
  ModelGatewayCodexAccountLoginPollResponse,
  ModelGatewayCodexAccountLoginStartRequest,
  ModelGatewayCodexAccountLoginStartResponse,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayDaemonServiceResponse,
  ModelGatewayModelListResponse,
  ModelGatewayProviderAccountRefreshResponse,
  ModelGatewayProviderAccountUpdateRequest,
  ModelGatewayProviderAccountUpdateResponse,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderDetectResponse,
  ModelGatewayProviderSecretResponse,
  ModelGatewayProviderTestRequest,
  ModelGatewayProviderTestResponse,
  ModelGatewayProvidersResponse,
  ModelGatewayRollbackAppConnectionRequest,
  ModelGatewayRollbackAppConnectionResponse,
  ModelGatewayRuntimeResponse,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewaySetProviderSecretRequest,
  ModelGatewayStatusResponse,
  ModelGatewayUpdateAppConnectionProfileRequest,
  ModelGatewayUpdateAppConnectionProfileResponse,
  ModelGatewayUpsertProviderRequest,
  ModelGatewayUpsertProviderResponse,
  ModelGatewayUsageLedgerResponse,
} from "../../features/model-gateway/types";

/**
 * TanStack Query hooks for the Model Gateway data layer.
 *
 * Query keys are namespaced under `["model-gateway", ...]` so mutations can
 * invalidate coherent slices. Errors surface as the normalized {@link ApiError}
 * from the transport layer.
 */

export const modelGatewayKeys = {
  all: ["model-gateway"] as const,
  status: () => ["model-gateway", "status"] as const,
  runtime: () => ["model-gateway", "runtime"] as const,
  usage: (filters?: { range?: "week" | "all" | "custom" | null; dateFrom?: string | null; dateTo?: string | null }) => [
    "model-gateway",
    "usage",
    filters?.range ?? "week",
    filters?.dateFrom ?? null,
    filters?.dateTo ?? null,
  ] as const,
  models: () => ["model-gateway", "models"] as const,
  clientAuth: () => ["model-gateway", "client-auth"] as const,
  providers: () => ["model-gateway", "providers"] as const,
  providerSecret: (providerId: string) =>
    ["model-gateway", "providers", providerId, "secret"] as const,
  appConnections: () => ["model-gateway", "app-connections"] as const,
  appConnectionBackups: (appId: string) =>
    ["model-gateway", "app-connections", appId, "backups"] as const,
  daemonService: () => ["model-gateway", "daemon-service"] as const,
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

export function useModelGatewayStatusQuery(
  options?: QueryOpts<ModelGatewayStatusResponse>,
) {
  return useQuery<ModelGatewayStatusResponse, ApiError>({
    queryKey: modelGatewayKeys.status(),
    queryFn: ({ signal }) => getModelGatewayStatus(signal),
    ...options,
  });
}

export function useModelGatewayRuntimeQuery(
  options?: QueryOpts<ModelGatewayRuntimeResponse>,
) {
  return useQuery<ModelGatewayRuntimeResponse, ApiError>({
    queryKey: modelGatewayKeys.runtime(),
    queryFn: ({ signal }) => getModelGatewayRuntime(signal),
    ...options,
  });
}

export function useModelGatewayUsageQuery(
  filters?: { range?: "week" | "all" | "custom" | null; dateFrom?: string | null; dateTo?: string | null },
  options?: QueryOpts<ModelGatewayUsageLedgerResponse>,
) {
  return useQuery<ModelGatewayUsageLedgerResponse, ApiError>({
    queryKey: modelGatewayKeys.usage(filters),
    queryFn: ({ signal }) => getModelGatewayUsage(filters, signal),
    ...options,
  });
}

export function useModelGatewayModelsQuery(
  options?: QueryOpts<ModelGatewayModelListResponse>,
) {
  return useQuery<ModelGatewayModelListResponse, ApiError>({
    queryKey: modelGatewayKeys.models(),
    queryFn: ({ signal }) => getModelGatewayModels(signal),
    ...options,
  });
}

export function useModelGatewayClientAuthQuery(
  options?: QueryOpts<ModelGatewayClientAuthResponse>,
) {
  return useQuery<ModelGatewayClientAuthResponse, ApiError>({
    queryKey: modelGatewayKeys.clientAuth(),
    queryFn: ({ signal }) => getModelGatewayClientAuth(signal),
    ...options,
  });
}

export function useModelGatewayProvidersQuery(
  options?: QueryOpts<ModelGatewayProvidersResponse>,
) {
  return useQuery<ModelGatewayProvidersResponse, ApiError>({
    queryKey: modelGatewayKeys.providers(),
    queryFn: ({ signal }) => listModelGatewayProviders(signal),
    ...options,
  });
}

export function useModelGatewayProviderSecretQuery(
  providerId: string,
  options?: QueryOpts<ModelGatewayProviderSecretResponse>,
) {
  return useQuery<ModelGatewayProviderSecretResponse, ApiError>({
    queryKey: modelGatewayKeys.providerSecret(providerId),
    queryFn: ({ signal }) => getModelGatewayProviderSecret(providerId, signal),
    enabled: Boolean(providerId),
    ...options,
  });
}

export function useModelGatewayAppConnectionsQuery(
  options?: QueryOpts<ModelGatewayAppConnectionsResponse>,
) {
  return useQuery<ModelGatewayAppConnectionsResponse, ApiError>({
    queryKey: modelGatewayKeys.appConnections(),
    queryFn: ({ signal }) => listModelGatewayAppConnections(signal),
    ...options,
  });
}

/**
 * Backup-version list for a single app connection (newest-first). Enabled only
 * when an app is selected/expanded so we don't fetch backups for every client
 * up front.
 */
export function useAppConnectionBackupsQuery(
  appId: ModelGatewayAppConnectionId | null,
  options?: QueryOpts<ModelGatewayAppConnectionBackupsResponse>,
) {
  return useQuery<ModelGatewayAppConnectionBackupsResponse, ApiError>({
    queryKey: modelGatewayKeys.appConnectionBackups(appId ?? "__none__"),
    queryFn: ({ signal }) => getAppConnectionBackups(appId as ModelGatewayAppConnectionId, signal),
    enabled: Boolean(appId),
    ...options,
  });
}

/**
 * Imperative lazy fetch for a single backup's redacted content. Backups are
 * read on demand (when a version is selected for diff) rather than prefetched,
 * so this is a thin re-export of the api binding instead of a standing query.
 */
export { getAppConnectionBackup };

export function useModelGatewayDaemonServiceQuery(
  options?: QueryOpts<ModelGatewayDaemonServiceResponse>,
) {
  return useQuery<ModelGatewayDaemonServiceResponse, ApiError>({
    queryKey: modelGatewayKeys.daemonService(),
    queryFn: ({ signal }) => getModelGatewayDaemonService(signal),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Invalidate every slice that a provider/active-route change can affect. */
function useInvalidateProviderSurface() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.providers() });
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.models() });
  };
}

export function useUpdateModelGatewayClientAuthMutation(
  options?: MutationOpts<ModelGatewayClientAuthResponse, ModelGatewayClientAuthUpdateRequest>,
) {
  const queryClient = useQueryClient();
  return useMutation<ModelGatewayClientAuthResponse, ApiError, ModelGatewayClientAuthUpdateRequest>({
    mutationFn: (payload) => updateModelGatewayClientAuth(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.clientAuth() });
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useCreateModelGatewayProviderMutation(
  options?: MutationOpts<ModelGatewayUpsertProviderResponse, ModelGatewayUpsertProviderRequest>,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<ModelGatewayUpsertProviderResponse, ApiError, ModelGatewayUpsertProviderRequest>({
    mutationFn: (payload) => createModelGatewayProvider(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useUpdateModelGatewayProviderMutation(
  options?: MutationOpts<
    ModelGatewayUpsertProviderResponse,
    { providerId: string; payload: ModelGatewayUpsertProviderRequest }
  >,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<
    ModelGatewayUpsertProviderResponse,
    ApiError,
    { providerId: string; payload: ModelGatewayUpsertProviderRequest }
  >({
    mutationFn: ({ providerId, payload }) => updateModelGatewayProvider(providerId, payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useDeleteModelGatewayProviderMutation(
  options?: MutationOpts<ModelGatewayProvidersResponse, string>,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<ModelGatewayProvidersResponse, ApiError, string>({
    mutationFn: (providerId) => deleteModelGatewayProvider(providerId),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useSetModelGatewayActiveProviderMutation(
  options?: MutationOpts<ModelGatewayProvidersResponse, ModelGatewaySetActiveProviderRequest>,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<ModelGatewayProvidersResponse, ApiError, ModelGatewaySetActiveProviderRequest>({
    mutationFn: (payload) => setModelGatewayActiveProvider(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useDetectModelGatewayProviderMutation(
  options?: MutationOpts<ModelGatewayProviderDetectResponse, ModelGatewayProviderDetectRequest>,
) {
  // Read-only probe: no cache invalidation.
  return useMutation<ModelGatewayProviderDetectResponse, ApiError, ModelGatewayProviderDetectRequest>({
    mutationFn: (payload) => detectModelGatewayProvider(payload),
    ...options,
  });
}

export function useSetModelGatewayProviderSecretMutation(
  options?: MutationOpts<
    ModelGatewayUpsertProviderResponse,
    { providerId: string; payload: ModelGatewaySetProviderSecretRequest }
  >,
) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateProviderSurface();
  return useMutation<
    ModelGatewayUpsertProviderResponse,
    ApiError,
    { providerId: string; payload: ModelGatewaySetProviderSecretRequest }
  >({
    mutationFn: ({ providerId, payload }) => setModelGatewayProviderSecret(providerId, payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      const [, vars] = args;
      void queryClient.invalidateQueries({
        queryKey: modelGatewayKeys.providerSecret(vars.providerId),
      });
      options?.onSuccess?.(...args);
    },
  });
}

export function useTestModelGatewayProviderMutation(
  options?: MutationOpts<
    ModelGatewayProviderTestResponse,
    { providerId: string; payload?: ModelGatewayProviderTestRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ModelGatewayProviderTestResponse,
    ApiError,
    { providerId: string; payload?: ModelGatewayProviderTestRequest }
  >({
    mutationFn: ({ providerId, payload }) => testModelGatewayProvider(providerId, payload),
    ...options,
    onSuccess: (...args) => {
      // A probe records health/runtime; refresh provider + status views.
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.providers() });
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useSmokeModelGatewayActiveRouteMutation(
  options?: MutationOpts<ModelGatewayProviderTestResponse, ModelGatewayActiveRouteSmokeRequest | void>,
) {
  const queryClient = useQueryClient();
  return useMutation<ModelGatewayProviderTestResponse, ApiError, ModelGatewayActiveRouteSmokeRequest | void>({
    mutationFn: (payload) => smokeModelGatewayActiveRoute(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.providers() });
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.runtime() });
      options?.onSuccess?.(...args);
    },
  });
}

// --- Account providers -----------------------------------------------------

export function useStartCodexAccountLoginMutation(
  options?: MutationOpts<
    ModelGatewayCodexAccountLoginStartResponse,
    ModelGatewayCodexAccountLoginStartRequest | void
  >,
) {
  return useMutation<
    ModelGatewayCodexAccountLoginStartResponse,
    ApiError,
    ModelGatewayCodexAccountLoginStartRequest | void
  >({
    mutationFn: (payload) => startCodexAccountLogin(payload ?? {}),
    ...options,
  });
}

export function usePollCodexAccountLoginMutation(
  options?: MutationOpts<
    ModelGatewayCodexAccountLoginPollResponse,
    ModelGatewayCodexAccountLoginPollRequest
  >,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<
    ModelGatewayCodexAccountLoginPollResponse,
    ApiError,
    ModelGatewayCodexAccountLoginPollRequest
  >({
    mutationFn: (payload) => pollCodexAccountLogin(payload),
    ...options,
    onSuccess: (...args) => {
      // Completing a login materializes a provider; refresh provider surface.
      const [data] = args;
      if (data.status === "completed") invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Per-account update: enable/disable, proxy override, and clear-cooldown all
 * flow through this single route (fields on the request body).
 */
export function useUpdateModelGatewayProviderAccountMutation(
  options?: MutationOpts<
    ModelGatewayProviderAccountUpdateResponse,
    { providerId: string; accountId: string; payload: ModelGatewayProviderAccountUpdateRequest }
  >,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<
    ModelGatewayProviderAccountUpdateResponse,
    ApiError,
    { providerId: string; accountId: string; payload: ModelGatewayProviderAccountUpdateRequest }
  >({
    mutationFn: ({ providerId, accountId, payload }) =>
      updateModelGatewayProviderAccount(providerId, accountId, payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useRefreshModelGatewayProviderAccountMutation(
  options?: MutationOpts<
    ModelGatewayProviderAccountRefreshResponse,
    { providerId: string; accountId: string }
  >,
) {
  const invalidate = useInvalidateProviderSurface();
  return useMutation<
    ModelGatewayProviderAccountRefreshResponse,
    ApiError,
    { providerId: string; accountId: string }
  >({
    mutationFn: ({ providerId, accountId }) =>
      refreshModelGatewayProviderAccount(providerId, accountId),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

// --- App connections -------------------------------------------------------

function useInvalidateAppConnectionSurface() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.appConnections() });
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.providers() });
    void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
  };
}

export function useUpdateModelGatewayAppConnectionProfileMutation(
  options?: MutationOpts<
    ModelGatewayUpdateAppConnectionProfileResponse,
    ModelGatewayUpdateAppConnectionProfileRequest
  >,
) {
  const invalidate = useInvalidateAppConnectionSurface();
  return useMutation<
    ModelGatewayUpdateAppConnectionProfileResponse,
    ApiError,
    ModelGatewayUpdateAppConnectionProfileRequest
  >({
    mutationFn: (payload) => updateModelGatewayAppConnectionProfile(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useApplyModelGatewayAppConnectionsMutation(
  options?: MutationOpts<
    ModelGatewayApplyAppConnectionsResponse,
    ModelGatewayApplyAppConnectionRequest | void
  >,
) {
  const invalidate = useInvalidateAppConnectionSurface();
  return useMutation<
    ModelGatewayApplyAppConnectionsResponse,
    ApiError,
    ModelGatewayApplyAppConnectionRequest | void
  >({
    mutationFn: (payload) => applyModelGatewayAppConnections(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useApplyModelGatewayAppConnectionMutation(
  options?: MutationOpts<
    ModelGatewayApplyAppConnectionResponse,
    { appId: ModelGatewayAppConnectionId; payload?: Omit<ModelGatewayApplyAppConnectionRequest, "appId"> }
  >,
) {
  const invalidate = useInvalidateAppConnectionSurface();
  return useMutation<
    ModelGatewayApplyAppConnectionResponse,
    ApiError,
    { appId: ModelGatewayAppConnectionId; payload?: Omit<ModelGatewayApplyAppConnectionRequest, "appId"> }
  >({
    mutationFn: ({ appId, payload }) => applyModelGatewayAppConnection(appId, payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

export function useRollbackModelGatewayAppConnectionMutation(
  options?: MutationOpts<
    ModelGatewayRollbackAppConnectionResponse,
    { appId: ModelGatewayAppConnectionId; payload?: Omit<ModelGatewayRollbackAppConnectionRequest, "appId"> }
  >,
) {
  const invalidate = useInvalidateAppConnectionSurface();
  return useMutation<
    ModelGatewayRollbackAppConnectionResponse,
    ApiError,
    { appId: ModelGatewayAppConnectionId; payload?: Omit<ModelGatewayRollbackAppConnectionRequest, "appId"> }
  >({
    mutationFn: ({ appId, payload }) => rollbackModelGatewayAppConnection(appId, payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

// --- Daemon service --------------------------------------------------------

export function useManageModelGatewayDaemonServiceMutation(
  options?: MutationOpts<ModelGatewayDaemonServiceResponse, ModelGatewayDaemonServiceRequest | void>,
) {
  const queryClient = useQueryClient();
  return useMutation<ModelGatewayDaemonServiceResponse, ApiError, ModelGatewayDaemonServiceRequest | void>({
    mutationFn: (payload) => manageModelGatewayDaemonService(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.daemonService() });
      void queryClient.invalidateQueries({ queryKey: modelGatewayKeys.status() });
      options?.onSuccess?.(...args);
    },
  });
}
