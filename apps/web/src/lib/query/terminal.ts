import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  deleteTerminalSession,
  endTerminalSession,
  getTerminalSession,
  getTerminalSessions,
  launchTerminal,
} from "../api/terminal";
import type { ApiError } from "../api/errors";
import type {
  TerminalEndPayload,
  TerminalEndResponse,
  TerminalLaunchPayload,
  TerminalLaunchResponse,
  TerminalSessionDescriptor,
  TerminalSessionSummaryResponse,
} from "../../features/cli-agents/types";

/**
 * TanStack Query hooks for the Terminal session control surface consumed by the
 * CLI Agent Workbench (`/cli-agents`).
 *
 * Query keys are namespaced under `["cli-agents", "terminal", ...]` so the
 * launch / end / delete mutations can invalidate the session roster coherently.
 *
 * NOT bound here: `/api/terminal/status` — reused via `useTerminalStatusQuery`
 * from the Dashboard data layer (`@/lib/query/dashboard`).
 */

export const terminalKeys = {
  all: ["cli-agents", "terminal"] as const,
  sessions: () => ["cli-agents", "terminal", "sessions"] as const,
  session: (id: string) => ["cli-agents", "terminal", "session", id] as const,
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

/** Persisted terminal session roster (`/api/terminal/sessions`). */
export function useTerminalSessionsQuery(
  options?: QueryOpts<TerminalSessionSummaryResponse>,
) {
  return useQuery<TerminalSessionSummaryResponse, ApiError>({
    queryKey: terminalKeys.sessions(),
    queryFn: ({ signal }) => getTerminalSessions(signal),
    ...options,
  });
}

/** Single persisted session descriptor (`/api/terminal/sessions/:id`). */
export function useTerminalSessionQuery(
  id: string | null,
  options?: QueryOpts<TerminalSessionDescriptor>,
) {
  return useQuery<TerminalSessionDescriptor, ApiError>({
    queryKey: terminalKeys.session(id ?? "__none__"),
    queryFn: ({ signal }) => getTerminalSession(id as string, signal),
    enabled: id != null && id.length > 0,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Mutations (dangerous writes — always confirmed + evidenced in the UI)
// ---------------------------------------------------------------------------

/**
 * Resolve a CLI launch command (`POST /api/terminal/launch`). Read-only on the
 * server (returns the resolved command), so it does not invalidate the roster.
 */
export function useLaunchTerminalMutation(
  options?: MutationOpts<TerminalLaunchResponse, TerminalLaunchPayload>,
) {
  return useMutation<TerminalLaunchResponse, ApiError, TerminalLaunchPayload>({
    mutationFn: (payload) => launchTerminal(payload),
    ...options,
  });
}

/** End a live session by sid (`POST /api/terminal/end`). Invalidates the roster. */
export function useEndTerminalSessionMutation(
  options?: MutationOpts<TerminalEndResponse, TerminalEndPayload>,
) {
  const queryClient = useQueryClient();
  return useMutation<TerminalEndResponse, ApiError, TerminalEndPayload>({
    mutationFn: (payload) => endTerminalSession(payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: terminalKeys.sessions() });
      options?.onSuccess?.(...args);
    },
  });
}

/**
 * Delete a persisted session (`POST /api/terminal/sessions/:id/delete`).
 * Invalidates the roster. The server rejects (409) an active session.
 */
export function useDeleteTerminalSessionMutation(
  options?: MutationOpts<{ success: boolean; reason?: string }, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<{ success: boolean; reason?: string }, ApiError, string>({
    mutationFn: (sessionId) => deleteTerminalSession(sessionId),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: terminalKeys.sessions() });
      options?.onSuccess?.(...args);
    },
  });
}
