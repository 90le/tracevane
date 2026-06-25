import { apiRequest } from "./client";
import type {
  ChatAbortResponse,
  ChatBootstrapPayload,
  ChatAssignSessionsToFolderRequest,
  ChatAssignSessionsToFolderResponse,
  ChatCreateOrganizerFolderRequest,
  ChatCreateOrganizerFolderResponse,
  ChatCreateSessionRequest,
  ChatCreateSessionResponse,
  ChatDeleteOrganizerFolderResponse,
  ChatDeleteSessionResponse,
  ChatHistoryPayload,
  ChatPatchOrganizerFolderRequest,
  ChatPatchOrganizerFolderResponse,
  ChatPatchSessionRequest,
  ChatPatchSessionResponse,
  ChatQueuePayload,
  ChatQueuedMessageItem,
  ChatResetResponse,
  ChatFileUploadResponse,
  ChatSendAck,
  ChatSendRequest,
} from "../../../../../types/chat";

/**
 * Typed transport bindings for the Chat (Agent operations) HTTP API.
 *
 * One function per browser-consumed route in `apps/api/modules/chat/routes.ts`.
 * Server-to-server / media-bridge routes (media bytes, resource resolve) are not
 * part of the control workbench surface. User-selected Chat file upload is bound
 * here as multipart transport so the Composer can attach workspace-backed refs
 * without base64 expansion. The SSE stream is consumed directly in the
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
 * history / queue / diagnostics in one shot.
 */
export function getChatBootstrap(
  params: {
    sessionKey?: string | null;
    recentLimit?: number;
    historyLimit?: number;
  } = {},
  signal?: AbortSignal,
): Promise<ChatBootstrapPayload> {
  const query = new URLSearchParams({
    recentLimit: String(params.recentLimit ?? 40),
    historyLimit: String(params.historyLimit ?? 30),
  });
  if (params.sessionKey) query.set("sessionKey", params.sessionKey);
  return apiRequest<ChatBootstrapPayload>(`${BASE}/bootstrap?${query}`, {
    signal,
  });
}

/** GET /api/chat/sessions/:key/history — paged transcript + runtime + overlays. */
export function getChatHistory(
  sessionKey: string,
  params: {
    limit?: number;
    before?: string;
    after?: string;
    day?: string;
  } = {},
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


// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/** POST /api/chat/agents/:agentId/sessions — create a Tracevane-managed session. */
export function createChatSession(
  agentId: string,
  payload: ChatCreateSessionRequest,
): Promise<ChatCreateSessionResponse> {
  return apiRequest<ChatCreateSessionResponse>(
    `${BASE}/agents/${encodeURIComponent(agentId)}/sessions`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** PATCH /api/chat/sessions/:key — rename/archive a Tracevane-managed session. */
export function patchChatSession(
  sessionKey: string,
  payload: ChatPatchSessionRequest,
): Promise<ChatPatchSessionResponse> {
  return apiRequest<ChatPatchSessionResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}`,
    { method: "PATCH", body: jsonBody(payload) },
  );
}

/** DELETE /api/chat/sessions/:key — delete a Tracevane-managed session. */
export function deleteChatSession(
  sessionKey: string,
): Promise<ChatDeleteSessionResponse> {
  return apiRequest<ChatDeleteSessionResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}`,
    { method: "DELETE" },
  );
}


/** POST /api/chat/organizer/folders — create an organizer folder/subfolder. */
export function createChatOrganizerFolder(
  payload: ChatCreateOrganizerFolderRequest,
): Promise<ChatCreateOrganizerFolderResponse> {
  return apiRequest<ChatCreateOrganizerFolderResponse>(
    `${BASE}/organizer/folders`,
    { method: "POST", body: jsonBody(payload) },
  );
}

/** PATCH /api/chat/organizer/folders/:id — rename, sort, collapse, or move a folder. */
export function patchChatOrganizerFolder(
  folderId: string,
  payload: ChatPatchOrganizerFolderRequest,
): Promise<ChatPatchOrganizerFolderResponse> {
  return apiRequest<ChatPatchOrganizerFolderResponse>(
    `${BASE}/organizer/folders/${encodeURIComponent(folderId)}`,
    { method: "PATCH", body: jsonBody(payload) },
  );
}

/** DELETE /api/chat/organizer/folders/:id — delete a folder and return sessions to root. */
export function deleteChatOrganizerFolder(
  folderId: string,
): Promise<ChatDeleteOrganizerFolderResponse> {
  return apiRequest<ChatDeleteOrganizerFolderResponse>(
    `${BASE}/organizer/folders/${encodeURIComponent(folderId)}`,
    { method: "DELETE" },
  );
}

/** PATCH /api/chat/organizer/sessions — move sessions into a folder or back to root. */
export function assignChatSessionsToFolder(
  payload: ChatAssignSessionsToFolderRequest,
): Promise<ChatAssignSessionsToFolderResponse> {
  return apiRequest<ChatAssignSessionsToFolderResponse>(
    `${BASE}/organizer/sessions`,
    { method: "PATCH", body: jsonBody(payload) },
  );
}


/** POST /api/chat/sessions/:key/upload — upload a user file and receive a sendable fileRef/resource. */
export function uploadChatFile(
  sessionKey: string,
  file: File,
): Promise<ChatFileUploadResponse> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("fileName", file.name);
  if (file.type) form.append("mimeType", file.type);
  return apiRequest<ChatFileUploadResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/upload`,
    { method: "POST", body: form },
  );
}

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
export function abortChatSession(
  sessionKey: string,
): Promise<ChatAbortResponse> {
  return apiRequest<ChatAbortResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/abort`,
    { method: "POST", body: jsonBody({}) },
  );
}

/** POST /api/chat/sessions/:key/reset — clear/reset the session transcript. */
export function resetChatSession(
  sessionKey: string,
): Promise<ChatResetResponse> {
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


/** Resolve the same-origin URL for the SSE stream endpoint. */
export function chatStreamUrl(sessionKey: string): string {
  return `${BASE}/sessions/${encodeSessionKey(sessionKey)}/stream`;
}
