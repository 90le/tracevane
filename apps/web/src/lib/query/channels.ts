import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { getChannelsSummary } from "../api/channels";
import type { ApiError } from "../api/errors";
import type { ChannelsSummaryPayload } from "../../../../../types/channels";

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
