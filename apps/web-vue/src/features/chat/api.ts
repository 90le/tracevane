import { fetchStudioResponse, getApiBase, resolveStudioAuthorizationHeader } from '../../shared/api';

function joinChatPath(path: string): string {
  const base = getApiBase();
  if (!base || path.startsWith(base)) return path;
  return `${base}${path}`;
}

async function requestChatJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchStudioResponse(joinChatPath(path), init);
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const contractMessage = payload?.error?.message;
    throw new Error(contractMessage || `${response.status} ${response.statusText}`);
  }

  return payload as T;
}

export interface ChatSlashGatewayRequest {
  method: string;
  params?: Record<string, unknown>;
}

import type { AgentsSummaryPayload } from '../../../../../types/agents';
import type {
  ChatHistorySearchContentFilter,
  ChatHistorySearchRoleFilter,
  ChatAbortResponse,
  ChatAssignSessionsToFolderRequest,
  ChatAssignSessionsToFolderResponse,
  ChatCreateSessionRequest,
  ChatCreateOrganizerFolderRequest,
  ChatCreateOrganizerFolderResponse,
  ChatCreateSessionResponse,
  ChatDeleteSessionResponse,
  ChatDeleteOrganizerFolderResponse,
  ChatFileUploadRequest,
  ChatFileUploadResponse,
  ChatHistoryDatesPayload,
  ChatHealthPayload,
  ChatHistoryPayload,
  ChatHistorySearchPayload,
  ChatOrganizerPayload,
  ChatPatchQueueEntryRequest,
  ChatPatchOrganizerFolderRequest,
  ChatPatchOrganizerFolderResponse,
  ChatPatchSessionRequest,
  ChatPatchSessionControlsRequest,
  ChatPatchSessionResponse,
  ChatQueuePayload,
  ChatResetResponse,
  ChatSendAck,
  ChatSendRequest,
  ChatSessionControlsPayload,
  ChatSessionsPayload,
} from '../../../../../types/chat';

export function fetchAgentsSummary(): Promise<AgentsSummaryPayload> {
  return requestChatJson<AgentsSummaryPayload>('/api/agents');
}

export function fetchChatHealth(): Promise<ChatHealthPayload> {
  return requestChatJson<ChatHealthPayload>('/api/chat/health');
}

export function fetchChatOrganizer(): Promise<ChatOrganizerPayload> {
  return requestChatJson<ChatOrganizerPayload>('/api/chat/organizer');
}

export function fetchChatSessions(agentId: string): Promise<ChatSessionsPayload> {
  return requestChatJson<ChatSessionsPayload>(`/api/chat/agents/${encodeURIComponent(agentId)}/sessions`);
}

export function fetchChatHistoryPage(
  sessionKey: string,
  options: {
    before?: string | null;
    after?: string | null;
    anchor?: string | null;
    limit?: number;
    day?: string | null;
  } = {},
): Promise<ChatHistoryPayload> {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/history`, window.location.origin);
  if (options.before) url.searchParams.set('before', options.before);
  if (options.after) url.searchParams.set('after', options.after);
  if (options.anchor) url.searchParams.set('anchor', options.anchor);
  if (options.day) url.searchParams.set('day', options.day);
  url.searchParams.set('limit', String(options.limit || 50));
  return requestChatJson<ChatHistoryPayload>(`${url.pathname}${url.search}`);
}

export function fetchChatHistory(sessionKey: string): Promise<ChatHistoryPayload> {
  return fetchChatHistoryPage(sessionKey, { limit: 50 });
}

export function searchChatHistory(
  sessionKey: string,
  options: {
    query: string;
    role?: ChatHistorySearchRoleFilter;
    content?: ChatHistorySearchContentFilter;
    day?: string | null;
    before?: string | null;
    limit?: number;
  },
): Promise<ChatHistorySearchPayload> {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/search`, window.location.origin);
  url.searchParams.set('q', options.query);
  url.searchParams.set('role', options.role || 'all');
  url.searchParams.set('content', options.content || 'all');
  if (options.day) url.searchParams.set('day', options.day);
  if (options.before) url.searchParams.set('before', options.before);
  url.searchParams.set('limit', String(options.limit || 50));
  return requestChatJson<ChatHistorySearchPayload>(`${url.pathname}${url.search}`);
}

export function fetchChatHistoryDates(sessionKey: string): Promise<ChatHistoryDatesPayload> {
  return requestChatJson<ChatHistoryDatesPayload>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/dates`);
}

export function buildChatStreamUrl(sessionKey: string): string {
  return joinChatPath(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/stream`);
}

export function createChatSession(
  agentId: string,
  payload: ChatCreateSessionRequest
): Promise<ChatCreateSessionResponse> {
  return requestChatJson<ChatCreateSessionResponse>(`/api/chat/agents/${encodeURIComponent(agentId)}/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function patchChatSession(
  sessionKey: string,
  payload: ChatPatchSessionRequest,
): Promise<ChatPatchSessionResponse> {
  return requestChatJson<ChatPatchSessionResponse>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function createChatFolder(
  payload: ChatCreateOrganizerFolderRequest,
): Promise<ChatCreateOrganizerFolderResponse> {
  return requestChatJson<ChatCreateOrganizerFolderResponse>('/api/chat/organizer/folders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function patchChatFolder(
  folderId: string,
  payload: ChatPatchOrganizerFolderRequest,
): Promise<ChatPatchOrganizerFolderResponse> {
  return requestChatJson<ChatPatchOrganizerFolderResponse>(`/api/chat/organizer/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function deleteChatFolder(folderId: string): Promise<ChatDeleteOrganizerFolderResponse> {
  return requestChatJson<ChatDeleteOrganizerFolderResponse>(`/api/chat/organizer/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
  });
}

export function assignChatSessionsToFolder(
  payload: ChatAssignSessionsToFolderRequest,
): Promise<ChatAssignSessionsToFolderResponse> {
  return requestChatJson<ChatAssignSessionsToFolderResponse>('/api/chat/organizer/sessions', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function sendChatMessage(sessionKey: string, payload: ChatSendRequest): Promise<ChatSendAck> {
  return requestChatJson<ChatSendAck>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function fetchChatQueue(sessionKey: string): Promise<ChatQueuePayload> {
  return requestChatJson<ChatQueuePayload>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/queue`);
}

export function enqueueChatMessage(sessionKey: string, payload: ChatSendRequest): Promise<ChatQueuePayload> {
  return requestChatJson<ChatQueuePayload>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/queue`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function patchChatQueueEntry(
  sessionKey: string,
  entryId: string,
  payload: ChatPatchQueueEntryRequest,
): Promise<ChatQueuePayload> {
  return requestChatJson<ChatQueuePayload>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/queue/${encodeURIComponent(entryId)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export function deleteChatQueueEntry(sessionKey: string, entryId: string): Promise<ChatQueuePayload> {
  return requestChatJson<ChatQueuePayload>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/queue/${encodeURIComponent(entryId)}`,
    {
      method: 'DELETE',
    },
  );
}

export function fetchChatSessionControls(sessionKey: string): Promise<ChatSessionControlsPayload> {
  return requestChatJson<ChatSessionControlsPayload>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/controls`,
  );
}

export function patchChatSessionControls(
  sessionKey: string,
  payload: ChatPatchSessionControlsRequest,
): Promise<ChatSessionControlsPayload> {
  return requestChatJson<ChatSessionControlsPayload>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/controls`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export function requestChatSlashGateway<T>(
  sessionKey: string,
  payload: ChatSlashGatewayRequest,
): Promise<T> {
  return requestChatJson<T>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/slash-gateway`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export function abortChatRun(sessionKey: string): Promise<ChatAbortResponse> {
  return requestChatJson<ChatAbortResponse>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/abort`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export function resetChatSession(sessionKey: string): Promise<ChatResetResponse> {
  return requestChatJson<ChatResetResponse>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
}

export function deleteChatSession(sessionKey: string): Promise<ChatDeleteSessionResponse> {
  return requestChatJson<ChatDeleteSessionResponse>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}`, {
    method: 'DELETE',
  });
}

export function uploadChatFile(
  sessionKey: string,
  payload: ChatFileUploadRequest
): Promise<ChatFileUploadResponse> {
  return requestChatJson<ChatFileUploadResponse>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/upload`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );
}

export function uploadChatFileWithProgress(
  sessionKey: string,
  payload: ChatFileUploadRequest,
  onProgress: (progress: number) => void
): Promise<ChatFileUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const apiBase = getApiBase();
    const path = `${apiBase}/api/chat/sessions/${encodeURIComponent(sessionKey)}/upload`;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = Math.round((event.loaded / event.total) * 100);
        onProgress(progress);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          resolve(response as ChatFileUploadResponse);
        } catch {
          reject(new Error('Invalid JSON response'));
        }
      } else {
        try {
          const errorResponse = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          const message = errorResponse?.error?.message || `${xhr.status} ${xhr.statusText}`;
          reject(new Error(message));
        } catch {
          reject(new Error(`${xhr.status} ${xhr.statusText}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error'));
    };

    xhr.open('POST', path, true);
    const authorization = resolveStudioAuthorizationHeader();
    if (authorization) {
      xhr.setRequestHeader('Authorization', authorization);
    }
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(payload));
  });
}
