import { apiRequest } from "./client";
import type {
  DebugCreateSessionRequest,
  DebugSessionPayload,
  DebugSessionsPayload,
  DebugStatusPayload,
  DebugStopSessionRequest,
} from "../../../../../types/debug";

const DEBUG_API_BASE = "/api/debug";

export function getDebugStatus(signal?: AbortSignal): Promise<DebugStatusPayload> {
  return apiRequest<DebugStatusPayload>(`${DEBUG_API_BASE}/status`, { signal });
}

export function listDebugSessions(signal?: AbortSignal): Promise<DebugSessionsPayload> {
  return apiRequest<DebugSessionsPayload>(`${DEBUG_API_BASE}/sessions`, { signal });
}

export function createDebugSession(payload: DebugCreateSessionRequest): Promise<DebugSessionPayload> {
  return apiRequest<DebugSessionPayload>(`${DEBUG_API_BASE}/sessions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function stopDebugSession(payload: DebugStopSessionRequest): Promise<DebugSessionPayload> {
  return apiRequest<DebugSessionPayload>(`${DEBUG_API_BASE}/sessions/stop`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
