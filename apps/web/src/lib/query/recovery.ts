import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  getOpenClawRecoveryBackupsPage,
  getOpenClawRecoveryEventsPage,
  getOpenClawRecoveryStatus,
  manageOpenClawRecoveryDaemonService,
  restoreOpenClawRecoveryBackup,
  runOpenClawRecovery,
} from "../api/recovery";
import type { ApiError } from "../api/errors";
import type {
  OpenClawRecoveryBackupsPayload,
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryDaemonServiceResponse,
  OpenClawRecoveryEventsPayload,
  OpenClawRecoveryRestoreBackupRequest,
  OpenClawRecoveryRestoreBackupResponse,
  OpenClawRecoveryRunRequest,
  OpenClawRecoveryRunResponse,
  OpenClawRecoveryStatusPayload,
} from "../../features/recovery/types";
import type { TracevaneServiceMode } from "../../../../../types/supervisor";

/**
 * TanStack Query hooks for the Recovery (System Guard) data layer.
 *
 * Query keys are namespaced under `["recovery", ...]` so mutations can
 * invalidate coherent slices. Errors surface as the normalized {@link ApiError}
 * from the transport layer.
 *
 * Reuse note: the runtime health snapshot (`/api/system/health`) is owned by
 * the dashboard data layer — consume `useSystemHealthQuery` from
 * `@/lib/query/dashboard`; it is NOT re-bound here.
 */

export const recoveryKeys = {
  all: ["recovery"] as const,
  status: () => ["recovery", "status"] as const,
  events: (page: number, pageSize: number) =>
    ["recovery", "events", page, pageSize] as const,
  backups: (page: number, pageSize: number) =>
    ["recovery", "backups", page, pageSize] as const,
  daemonServices: () => ["recovery", "daemon-service"] as const,
  daemonService: (mode: TracevaneServiceMode) =>
    [...recoveryKeys.daemonServices(), mode] as const,
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

/** Recovery daemon / probe / repair snapshot (`/api/openclaw-recovery/status`). */
export function useRecoveryStatusQuery(
  options?: QueryOpts<OpenClawRecoveryStatusPayload>,
) {
  return useQuery<OpenClawRecoveryStatusPayload, ApiError>({
    queryKey: recoveryKeys.status(),
    queryFn: ({ signal }) => getOpenClawRecoveryStatus(signal),
    ...options,
  });
}

/** Paged recovery event log (`/api/openclaw-recovery/events`). */
export function useRecoveryEventsQuery(
  page: number,
  pageSize: number,
  options?: QueryOpts<OpenClawRecoveryEventsPayload>,
) {
  return useQuery<OpenClawRecoveryEventsPayload, ApiError>({
    queryKey: recoveryKeys.events(page, pageSize),
    queryFn: ({ signal }) => getOpenClawRecoveryEventsPage(page, pageSize, signal),
    ...options,
  });
}

/** Paged config backups (`/api/openclaw-recovery/backups`). */
export function useRecoveryBackupsQuery(
  page: number,
  pageSize: number,
  options?: QueryOpts<OpenClawRecoveryBackupsPayload>,
) {
  return useQuery<OpenClawRecoveryBackupsPayload, ApiError>({
    queryKey: recoveryKeys.backups(page, pageSize),
    queryFn: ({ signal }) => getOpenClawRecoveryBackupsPage(page, pageSize, signal),
    ...options,
  });
}

/** Mode-aware recovery daemon inspection through the read-only lifecycle status action. */
export function useRecoveryDaemonServiceQuery(
  mode: TracevaneServiceMode = "session",
  options?: QueryOpts<OpenClawRecoveryDaemonServiceResponse["service"]>,
) {
  return useQuery<OpenClawRecoveryDaemonServiceResponse["service"], ApiError>({
    queryKey: recoveryKeys.daemonService(mode),
    queryFn: async ({ signal }) => {
      const response = await manageOpenClawRecoveryDaemonService(
        { action: "status", mode, apply: true },
        signal,
      );
      return response.service;
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Invalidate the recovery surface a config/service write can affect. */
function useInvalidateRecoverySurface() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: recoveryKeys.status() });
    void queryClient.invalidateQueries({ queryKey: recoveryKeys.all });
    // The dashboard cockpit aggregates the same status slice.
    void queryClient.invalidateQueries({ queryKey: ["dashboard", "recovery-status"] });
  };
}

/**
 * The recovery action runner. `action: "probe"` is a safe diagnostic; the
 * other actions (`repair` / `config-repair`) rewrite config/service state and
 * must be invoked only behind a strong confirmation in the view. A successful
 * run refreshes the recovery surface (state + events) since the server appends
 * events and may rotate backups.
 */
export function useRunRecoveryMutation(
  options?: MutationOpts<OpenClawRecoveryRunResponse, OpenClawRecoveryRunRequest>,
) {
  const invalidate = useInvalidateRecoverySurface();
  return useMutation<OpenClawRecoveryRunResponse, ApiError, OpenClawRecoveryRunRequest>({
    mutationFn: (payload) => runOpenClawRecovery(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Restore a named config backup. DESTRUCTIVE: overwrites the live config. Only
 * invoke behind a strong confirmation. A successful restore refreshes the
 * recovery surface (the server backs up the current config first and appends a
 * restore event).
 */
export function useRestoreRecoveryBackupMutation(
  options?: MutationOpts<
    OpenClawRecoveryRestoreBackupResponse,
    OpenClawRecoveryRestoreBackupRequest
  >,
) {
  const invalidate = useInvalidateRecoverySurface();
  return useMutation<
    OpenClawRecoveryRestoreBackupResponse,
    ApiError,
    OpenClawRecoveryRestoreBackupRequest
  >({
    mutationFn: (payload) => restoreOpenClawRecoveryBackup(payload),
    ...options,
    onSuccess: (...args) => {
      invalidate();
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Recovery daemon service lifecycle. `action: "status"` is a safe refresh; the
 * lifecycle actions (`restart` / `stop` / `start` / `install`) touch the
 * service unit and must be invoked only behind a confirmation in the view.
 */
export function useManageRecoveryDaemonServiceMutation(
  options?: MutationOpts<
    OpenClawRecoveryDaemonServiceResponse,
    OpenClawRecoveryDaemonServiceRequest | void
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    OpenClawRecoveryDaemonServiceResponse,
    ApiError,
    OpenClawRecoveryDaemonServiceRequest | void
  >({
    mutationFn: (payload) => manageOpenClawRecoveryDaemonService(payload ?? {}),
    ...options,
    onSuccess: (...args) => {
      const [result, variables] = args;
      const mode = variables?.mode ?? "session";
      if (result.service.manager.mode === mode) {
        queryClient.setQueryData(recoveryKeys.daemonService(mode), result.service);
      } else {
        void queryClient.invalidateQueries({ queryKey: recoveryKeys.daemonService(mode) });
      }
      void queryClient.invalidateQueries({ queryKey: recoveryKeys.status() });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", "recovery-status"] });
      options?.onSuccess?.(...args);
    },
  });
}
