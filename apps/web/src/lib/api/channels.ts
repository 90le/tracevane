import { apiRequest } from "./client";
import type { ChannelsSummaryPayload } from "../../../../../types/channels";

/** GET /api/channels — OpenClaw native channel catalog/accounts/bindings summary. */
export function getChannelsSummary(signal?: AbortSignal): Promise<ChannelsSummaryPayload> {
  return apiRequest<ChannelsSummaryPayload>("/api/channels", { signal });
}
