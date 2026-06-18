import { fetchTracevaneResponse, getApiBase, resolveTracevaneAuthorizationHeader } from '../../shared/api';

function joinChatPath(path: string): string {
  const base = getApiBase();
  if (!base || path.startsWith(base)) return path;
  return `${base}${path}`;
}

async function requestChatJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchTracevaneResponse(joinChatPath(path), init);
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
  ChatBootstrapPayload,
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
  ChatResourceResolveRequest,
  ChatResourceResolveResponse,
  ChatSendAck,
  ChatSendRequest,
  ChatSessionControlsPayload,
  ChatSessionsPayload,
} from '../../../../../types/chat';

type ChatFileUploadBrowserRequest = ChatFileUploadRequest & {
  file?: File | Blob | null;
};

function buildChatUploadFormData(payload: ChatFileUploadBrowserRequest): FormData {
  const form = new FormData();
  form.append('fileName', payload.fileName);
  if (payload.mimeType) {
    form.append('mimeType', payload.mimeType);
  }
  if (payload.file) {
    form.append('file', payload.file, payload.fileName);
  }
  return form;
}

export function fetchAgentsSummary(): Promise<AgentsSummaryPayload> {
  return requestChatJson<AgentsSummaryPayload>('/api/agents');
}

export function fetchChatHealth(): Promise<ChatHealthPayload> {
  return requestChatJson<ChatHealthPayload>('/api/chat/health');
}

export function fetchChatBootstrap(options: {
  sessionKey?: string | null;
  recentLimit?: number;
  historyLimit?: number;
} = {}): Promise<ChatBootstrapPayload> {
  const url = new URL('/api/chat/bootstrap', window.location.origin);
  if (options.sessionKey) {
    url.searchParams.set('sessionKey', options.sessionKey);
  }
  if (typeof options.recentLimit === 'number' && Number.isFinite(options.recentLimit)) {
    url.searchParams.set('recentLimit', String(Math.max(1, Math.trunc(options.recentLimit))));
  }
  if (typeof options.historyLimit === 'number' && Number.isFinite(options.historyLimit)) {
    url.searchParams.set('historyLimit', String(Math.max(1, Math.trunc(options.historyLimit))));
  }
  return requestChatJson<ChatBootstrapPayload>(`${url.pathname}${url.search}`);
}

export function fetchChatOrganizer(): Promise<ChatOrganizerPayload> {
  return requestChatJson<ChatOrganizerPayload>('/api/chat/organizer');
}

export function fetchChatSessions(
  agentId: string,
  options: {
    limit?: number;
    includeDerivedTitles?: boolean;
    includeLastMessage?: boolean;
    localOnly?: boolean;
  } = {},
): Promise<ChatSessionsPayload> {
  const url = new URL(`/api/chat/agents/${encodeURIComponent(agentId)}/sessions`, window.location.origin);
  if (typeof options.limit === 'number' && Number.isFinite(options.limit)) {
    url.searchParams.set('limit', String(Math.max(1, Math.trunc(options.limit))));
  }
  if (typeof options.includeDerivedTitles === 'boolean') {
    url.searchParams.set('includeDerivedTitles', options.includeDerivedTitles ? '1' : '0');
  }
  if (typeof options.includeLastMessage === 'boolean') {
    url.searchParams.set('includeLastMessage', options.includeLastMessage ? '1' : '0');
  }
  if (typeof options.localOnly === 'boolean') {
    url.searchParams.set('localOnly', options.localOnly ? '1' : '0');
  }
  return requestChatJson<ChatSessionsPayload>(`${url.pathname}${url.search}`);
}

export function fetchChatHistoryPage(
  sessionKey: string,
  options: {
    before?: string | null;
    after?: string | null;
    anchor?: string | null;
    limit?: number;
    day?: string | null;
    signal?: AbortSignal;
  } = {},
): Promise<ChatHistoryPayload> {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/history`, window.location.origin);
  if (options.before) url.searchParams.set('before', options.before);
  if (options.after) url.searchParams.set('after', options.after);
  if (options.anchor) url.searchParams.set('anchor', options.anchor);
  if (options.day) url.searchParams.set('day', options.day);
  url.searchParams.set('limit', String(options.limit || 50));
  return requestChatJson<ChatHistoryPayload>(`${url.pathname}${url.search}`, {
    signal: options.signal,
  });
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
    signal?: AbortSignal;
  },
): Promise<ChatHistorySearchPayload> {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/search`, window.location.origin);
  url.searchParams.set('q', options.query);
  url.searchParams.set('role', options.role || 'all');
  url.searchParams.set('content', options.content || 'all');
  if (options.day) url.searchParams.set('day', options.day);
  if (options.before) url.searchParams.set('before', options.before);
  url.searchParams.set('limit', String(options.limit || 50));
  return requestChatJson<ChatHistorySearchPayload>(`${url.pathname}${url.search}`, {
    signal: options.signal,
  });
}

export function fetchChatHistoryDates(sessionKey: string, signal?: AbortSignal): Promise<ChatHistoryDatesPayload> {
  return requestChatJson<ChatHistoryDatesPayload>(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/dates`, {
    signal,
  });
}

export function buildChatStreamUrl(
  sessionKey: string,
  options: {
    bootstrapSnapshot?: boolean;
    lastStreamSeq?: number | null;
  } = {},
): string {
  const url = new URL(`/api/chat/sessions/${encodeURIComponent(sessionKey)}/stream`, window.location.origin);
  url.searchParams.set('bootstrapSnapshot', options.bootstrapSnapshot ? '1' : '0');
  if (typeof options.lastStreamSeq === 'number' && Number.isFinite(options.lastStreamSeq)) {
    url.searchParams.set('lastStreamSeq', String(Math.max(0, Math.floor(options.lastStreamSeq))));
  }
  return joinChatPath(`${url.pathname}${url.search}`);
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
  payload: ChatFileUploadBrowserRequest
): Promise<ChatFileUploadResponse> {
  if (payload.file) {
    return requestChatJson<ChatFileUploadResponse>(
      `/api/chat/sessions/${encodeURIComponent(sessionKey)}/upload`,
      {
        method: 'POST',
        body: buildChatUploadFormData(payload),
      },
    );
  }
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

export function resolveChatResources(
  sessionKey: string,
  payload: ChatResourceResolveRequest,
): Promise<ChatResourceResolveResponse> {
  return requestChatJson<ChatResourceResolveResponse>(
    `/api/chat/sessions/${encodeURIComponent(sessionKey)}/resources/resolve`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );
}

export function uploadChatFileWithProgress(
  sessionKey: string,
  payload: ChatFileUploadBrowserRequest,
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
    const authorization = resolveTracevaneAuthorizationHeader();
    if (authorization) {
      xhr.setRequestHeader('Authorization', authorization);
    }
    if (payload.file) {
      xhr.send(buildChatUploadFormData(payload));
      return;
    }
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(JSON.stringify(payload));
  });
}
