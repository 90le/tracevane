import { apiRequest } from "./client";
import type {
  ChatAbortResponse,
  ChatBootstrapPayload,
  ChatHistoryPayload,
  ChatPatchSessionControlsRequest,
  ChatQueuePayload,
  ChatQueuedMessageItem,
  ChatResetResponse,
  ChatSendAck,
  ChatSendRequest,
  ChatSessionControlsPayload,
} from "../../../../../types/chat";

/**
 * Typed transport bindings for the Chat (Agent operations) HTTP API.
 *
 * One function per browser-consumed route in `apps/api/modules/chat/routes.ts`.
 * Server-to-server / media-bridge routes (media bytes, resource resolve,
 * multipart upload internals) are not part of the control workbench surface and
 * are intentionally not bound here. The SSE stream is consumed directly in the
 * query layer via `fetch` (see `lib/query/chat.ts`), not through `apiRequest`,
 * because it is a long-lived `text/event-stream` rather than a JSON response.
 *
 * Response shapes come from the shared contract (`types/chat.ts`).
 */

const BASE = "/api/chat";

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

/** Encode a session key for use in a path segment (keys contain `:` etc.). */
export function encodeSessionKey(sessionKey: string): string {
  return encodeURIComponent(sessionKey);
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * GET /api/chat/bootstrap — session roster + organizer + selected session
 * history / queue / controls / diagnostics in one shot.
 */
export function getChatBootstrap(
  params: { sessionKey?: string | null; recentLimit?: number; historyLimit?: number } = {},
  signal?: AbortSignal,
): Promise<ChatBootstrapPayload> {
  const query = new URLSearchParams({
    recentLimit: String(params.recentLimit ?? 40),
    historyLimit: String(params.historyLimit ?? 30),
  });
  if (params.sessionKey) query.set("sessionKey", params.sessionKey);
  return apiRequest<ChatBootstrapPayload>(`${BASE}/bootstrap?${query}`, { signal });
}

/** GET /api/chat/sessions/:key/history — paged transcript + runtime + overlays. */
export function getChatHistory(
  sessionKey: string,
  params: { limit?: number; before?: string; after?: string; day?: string } = {},
  signal?: AbortSignal,
): Promise<ChatHistoryPayload> {
  const query = new URLSearchParams({ limit: String(params.limit ?? 50) });
  if (params.before) query.set("before", params.before);
  if (params.after) query.set("after", params.after);
  if (params.day) query.set("day", params.day);
  return apiRequest<ChatHistoryPayload>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/history?${query}`,
    { signal },
  );
}

/** GET /api/chat/sessions/:key/queue — pending / blocked outbound messages. */
export function getChatQueue(
  sessionKey: string,
  signal?: AbortSignal,
): Promise<ChatQueuePayload> {
  return apiRequest<ChatQueuePayload>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/queue`,
    { signal },
  );
}

/** GET /api/chat/sessions/:key/controls — per-session policy (host exec). */
export function getChatControls(
  sessionKey: string,
  signal?: AbortSignal,
): Promise<ChatSessionControlsPayload> {
  return apiRequest<ChatSessionControlsPayload>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/controls`,
    { signal },
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** POST /api/chat/sessions/:key/send — start a run with a user turn. */
export function sendChatMessage(
  sessionKey: string,
  payload: ChatSendRequest,
): Promise<ChatSendAck> {
  return apiRequest<ChatSendAck>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/send`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** POST /api/chat/sessions/:key/abort — stop the active run. */
export function abortChatSession(sessionKey: string): Promise<ChatAbortResponse> {
  return apiRequest<ChatAbortResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/abort`,
    { method: "POST", body: jsonBody({}) },
  );
}

/** POST /api/chat/sessions/:key/reset — clear/reset the session transcript. */
export function resetChatSession(sessionKey: string): Promise<ChatResetResponse> {
  return apiRequest<ChatResetResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/reset`,
    { method: "POST", body: jsonBody({}) },
  );
}

/** POST /api/chat/sessions/:key/queue — enqueue a message for later delivery. */
export function enqueueChatMessage(
  sessionKey: string,
  payload: ChatSendRequest,
): Promise<ChatQueuedMessageItem> {
  return apiRequest<ChatQueuedMessageItem>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/queue`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** DELETE /api/chat/sessions/:key/queue/:entryId — remove a queued message. */
export function deleteChatQueueEntry(
  sessionKey: string,
  entryId: string,
): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/queue/${encodeURIComponent(entryId)}`,
    { method: "DELETE" },
  );
}

/** PATCH /api/chat/sessions/:key/controls — update the session policy. */
export function patchChatControls(
  sessionKey: string,
  payload: ChatPatchSessionControlsRequest,
): Promise<ChatSessionControlsPayload> {
  return apiRequest<ChatSessionControlsPayload>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/controls`,
    { method: "PATCH", body: jsonBody(payload) },
  );
}

/** Resolve the same-origin URL for the SSE stream endpoint. */
export function chatStreamUrl(sessionKey: string): string {
  return `${BASE}/sessions/${encodeSessionKey(sessionKey)}/stream`;
}
