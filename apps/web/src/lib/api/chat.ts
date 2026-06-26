import { apiRequest } from "./client";
import {
  cancelFileUpload,
  completeFileUpload,
  getFilesSummary,
  initFileUpload,
  uploadFileChunk,
} from "./files";
import { buildTracevaneFilesResourceRef } from "../../../../../lib/tracevane-resource-refs";
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
  ChatResolvePermissionRequest,
  ChatResolvePermissionResponse,
  ChatFileUploadResponse,
  ChatSendAck,
  ChatSendRequest,
} from "../../../../../types/chat";

/**
 * Typed transport bindings for the Chat (Agent operations) HTTP API.
 *
 * One function per browser-consumed route in `apps/api/modules/chat/routes.ts`.
 * Server-to-server / media-bridge routes (media bytes, resource resolve) are not
 * part of the control workbench surface. User-selected Chat file upload is
 * intentionally backed by the Files API (`/api/files/uploads/*`) so Chat,
 * Workspace, and File Manager share one directory/upload/preview contract. The
 * SSE stream is consumed directly in the
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


const CHAT_UPLOAD_CHUNK_SIZE = 2 * 1024 * 1024;
const CHAT_UPLOAD_DIRECTORY = ".tracevane/chat-uploads";
const CHAT_UPLOAD_MAX_HASH_BYTES = 512 * 1024 * 1024;

function selectChatUploadRoot(summary: Awaited<ReturnType<typeof getFilesSummary>>) {
  return (
    summary.roots.find((item) => item.id === "project-root") ||
    summary.roots.find((item) => item.id === summary.defaultRootId) ||
    summary.roots.find((item) => item.preferred) ||
    summary.roots[0]
  );
}

/**
 * Upload a user-selected Composer file through the Files API and return the
 * same fileRef/resource shape that `sendChatMessage` expects.
 *
 * Chat no longer posts bytes to `/api/chat/sessions/:key/upload`: that legacy
 * endpoint has been removed. New uploads go through
 * `/api/files/uploads/*`, which keeps file browsing, preview links, resumable
 * binary upload, and downstream `files:<rootId>:<path>` resource resolution on
 * the same contract as File Manager and Workspace.
 */
export async function uploadChatFile(
  sessionKey: string,
  file: File,
  signal?: AbortSignal,
): Promise<ChatFileUploadResponse> {
  const summary = await getFilesSummary(signal);
  const root = selectChatUploadRoot(summary);
  if (!root) {
    throw new Error("没有可用的文件根目录，无法上传聊天附件");
  }

  const relativePath = `${CHAT_UPLOAD_DIRECTORY}/${safePathSegment(sessionKey)}/${safeFileName(file.name)}`;
  const sha256 = await hashChatUploadFileIfUseful(file, signal);
  const init = await initFileUpload({
    rootId: root.id,
    directoryPath: "",
    fileName: file.name || "attachment",
    relativePath,
    size: file.size,
    chunkSize: CHAT_UPLOAD_CHUNK_SIZE,
    conflictPolicy: "rename",
    sha256,
  }, signal);

  const targetPath = init.targetPath || relativePath;
  if (!init.skipped && !init.instant) {
    try {
      for (let index = 0; index < init.chunkCount; index += 1) {
        if (init.uploadedChunks.includes(index)) continue;
        const start = index * init.chunkSize;
        const end = Math.min(file.size, start + init.chunkSize);
        await uploadFileChunk(init.uploadId, index, file.slice(start, end), undefined, signal);
      }
      await completeFileUpload({ uploadId: init.uploadId }, signal);
    } catch (error) {
      await cancelFileUpload({ uploadId: init.uploadId }).catch(() => undefined);
      throw error;
    }
  }

  const resourceRef = buildFilesResourceRef(root.id, targetPath);
  const previewUrl = buildFilesDownloadUrl(root.id, targetPath, false);
  const downloadUrl = buildFilesDownloadUrl(root.id, targetPath, true);
  const kind = inferChatAttachmentKind(file);

  return {
    ok: true,
    rootId: root.id,
    relativePath: targetPath,
    resourceRef,
    resource: {
      id: `chat-upload:${root.id}:${targetPath}`,
      kind,
      url: previewUrl,
      downloadUrl,
      fileName: file.name || targetPath.split("/").pop() || "attachment",
      mimeType: file.type || null,
      relativePath: targetPath,
      originalPath: resourceRef,
      source: "user_upload",
      status: "ready",
      placement: "append",
    },
    absolutePath: joinDisplayPath(root.absolutePath, targetPath),
    fileName: file.name || targetPath.split("/").pop() || "attachment",
    mimeType: file.type || null,
    kind,
    size: file.size,
  };
}


async function hashChatUploadFileIfUseful(file: File, signal?: AbortSignal): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  if (file.size <= 0 || file.size > CHAT_UPLOAD_MAX_HASH_BYTES) return undefined;
  if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
  try {
    const buffer = await file.arrayBuffer();
    if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
    const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Upload aborted", "AbortError");
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return undefined;
  }
}

function buildFilesResourceRef(rootId: string, relativePath: string): string {
  const ref = buildTracevaneFilesResourceRef(rootId, relativePath);
  if (!ref) {
    throw new Error("无法创建 Files 资源引用");
  }
  return ref;
}

function buildFilesDownloadUrl(rootId: string, relativePath: string, download: boolean): string {
  const query = new URLSearchParams({
    rootId,
    path: normalizePortablePath(relativePath),
  });
  if (download) query.set("download", "true");
  return `/api/files/download?${query.toString()}`;
}

function inferChatAttachmentKind(file: File): "file" | "image" | "video" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  return "file";
}

function normalizePortablePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").split("/").filter(Boolean).join("/");
}

function safePathSegment(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);
  return normalized || "session";
}

function safeFileName(value: string): string {
  const normalized = value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/[\u0000-\u001f<>:"|?*]+/g, "-")
    .replace(/^\.+$/, "")
    .trim();
  return normalized || "attachment";
}

function joinDisplayPath(rootPath: string, relativePath: string): string {
  const root = rootPath.replace(/[\\/]+$/g, "");
  return root ? `${root}/${normalizePortablePath(relativePath)}` : normalizePortablePath(relativePath);
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


/** POST /api/chat/sessions/:key/runs/:runId/permissions/:requestId — resolve a pending native CLI approval. */
export function resolveChatPermission(
  sessionKey: string,
  runId: string,
  requestId: string,
  payload: ChatResolvePermissionRequest,
): Promise<ChatResolvePermissionResponse> {
  return apiRequest<ChatResolvePermissionResponse>(
    `${BASE}/sessions/${encodeSessionKey(sessionKey)}/runs/${encodeURIComponent(runId)}/permissions/${encodeURIComponent(requestId)}`,
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
