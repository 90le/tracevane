import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import type { ApiError } from "../api/errors";
import {
  createWorkspaceIdeProviderSession,
  getWorkspaceIdeProviderSessions,
  getWorkspaceIdeProviders,
  stopWorkspaceIdeProviderSession,
  type CreateWorkspaceIdeProviderSessionPayload,
  type WorkspaceIdeProviderKind,
  type WorkspaceIdeProviderSessionResponse,
  type WorkspaceIdeProviderSessionsResponse,
  type WorkspaceIdeProvidersResponse,
} from "../api/workspace-ide";

export const workspaceIdeKeys = {
  all: ["workspace", "ide-provider"] as const,
  providers: () => ["workspace", "ide-provider", "providers"] as const,
  sessions: () => ["workspace", "ide-provider", "sessions"] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;

type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

export function useWorkspaceIdeProvidersQuery(
  options?: QueryOpts<WorkspaceIdeProvidersResponse>,
) {
  return useQuery<WorkspaceIdeProvidersResponse, ApiError>({
    queryKey: workspaceIdeKeys.providers(),
    queryFn: ({ signal }) => getWorkspaceIdeProviders(signal),
    ...options,
  });
}

export function useWorkspaceIdeProviderSessionsQuery(
  options?: QueryOpts<WorkspaceIdeProviderSessionsResponse>,
) {
  return useQuery<WorkspaceIdeProviderSessionsResponse, ApiError>({
    queryKey: workspaceIdeKeys.sessions(),
    queryFn: ({ signal }) => getWorkspaceIdeProviderSessions(signal),
    ...options,
  });
}

export function useCreateWorkspaceIdeProviderSessionMutation(
  options?: MutationOpts<
    WorkspaceIdeProviderSessionResponse,
    { kind: WorkspaceIdeProviderKind; payload?: CreateWorkspaceIdeProviderSessionPayload }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    WorkspaceIdeProviderSessionResponse,
    ApiError,
    { kind: WorkspaceIdeProviderKind; payload?: CreateWorkspaceIdeProviderSessionPayload }
  >({
    mutationFn: ({ kind, payload }) =>
      createWorkspaceIdeProviderSession(kind, payload),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: workspaceIdeKeys.sessions() });
      options?.onSuccess?.(...args);
    },
  });
}

export function useStopWorkspaceIdeProviderSessionMutation(
  options?: MutationOpts<WorkspaceIdeProviderSessionResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<WorkspaceIdeProviderSessionResponse, ApiError, string>({
    mutationFn: (sessionId) => stopWorkspaceIdeProviderSession(sessionId),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: workspaceIdeKeys.sessions() });
      options?.onSuccess?.(...args);
    },
  });
}
