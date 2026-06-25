import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { createChannel, createChannelAccount, createChannelBinding, deleteChannel, deleteChannelAccount, deleteChannelBinding, getChannelsSummary, updateChannel, updateChannelAccount, updateChannelBinding } from "../api/channels";
import type { ApiError } from "../api/errors";
import type { ChannelAccountInput, ChannelBindingInput, ChannelSettingsInput, ChannelsSummaryPayload } from "../../../../../types/channels";

export const channelsKeys = {
  all: ["channels"] as const,
  summary: () => ["channels", "summary"] as const,
};

type QueryOpts<TData> = Omit<UseQueryOptions<TData, ApiError, TData>, "queryKey" | "queryFn">;

/** OpenClaw native channel summary (`/api/channels`). */
export function useChannelsSummaryQuery(options?: QueryOpts<ChannelsSummaryPayload>) {
  return useQuery<ChannelsSummaryPayload, ApiError>({
    queryKey: channelsKeys.summary(),
    queryFn: ({ signal }) => getChannelsSummary(signal),
    ...options,
  });
}


export function useCreateChannelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, enabled }: { type: string; enabled?: boolean }) => createChannel(type, enabled ?? true),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useUpdateChannelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload: ChannelSettingsInput }) => updateChannel(type, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useDeleteChannelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (type: string) => deleteChannel(type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useCreateChannelAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, payload }: { type: string; payload: ChannelAccountInput }) => createChannelAccount(type, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useUpdateChannelAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, accountId, payload }: { type: string; accountId: string; payload: ChannelAccountInput }) => updateChannelAccount(type, accountId, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useDeleteChannelAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, accountId }: { type: string; accountId: string }) => deleteChannelAccount(type, accountId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useCreateChannelBindingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ChannelBindingInput) => createChannelBinding(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useUpdateChannelBindingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ChannelBindingInput }) => updateChannelBinding(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}

export function useDeleteChannelBindingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteChannelBinding(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: channelsKeys.summary() }),
  });
}
