import { apiRequest } from "./client";
import type { ChannelAccountInput, ChannelBindingInput, ChannelSettingsInput, ChannelsMutationResponse, ChannelsSummaryPayload } from "../../../../../types/channels";

/** GET /api/channels — OpenClaw native channel catalog/accounts/bindings summary. */
export function getChannelsSummary(signal?: AbortSignal): Promise<ChannelsSummaryPayload> {
  return apiRequest<ChannelsSummaryPayload>("/api/channels", { signal });
}


export function createChannel(type: string, enabled = true): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>("/api/channels", { method: "POST", body: JSON.stringify({ type, enabled }) });
}

export function updateChannel(type: string, payload: ChannelSettingsInput): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(type)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteChannel(type: string): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(type)}`, { method: "DELETE" });
}

export function createChannelAccount(type: string, payload: ChannelAccountInput): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(type)}/accounts`, { method: "POST", body: JSON.stringify(payload) });
}

export function updateChannelAccount(type: string, accountId: string, payload: ChannelAccountInput): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(type)}/accounts/${encodeURIComponent(accountId)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteChannelAccount(type: string, accountId: string): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/${encodeURIComponent(type)}/accounts/${encodeURIComponent(accountId)}`, { method: "DELETE" });
}

export function createChannelBinding(payload: ChannelBindingInput): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>("/api/channels/bindings", { method: "POST", body: JSON.stringify(payload) });
}

export function updateChannelBinding(bindingId: string, payload: ChannelBindingInput): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/bindings/${encodeURIComponent(bindingId)}`, { method: "PUT", body: JSON.stringify(payload) });
}

export function deleteChannelBinding(bindingId: string): Promise<ChannelsMutationResponse> {
  return apiRequest<ChannelsMutationResponse>(`/api/channels/bindings/${encodeURIComponent(bindingId)}`, { method: "DELETE" });
}
