import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  abortChatSession,
  assignChatSessionsToFolder,
  chatStreamUrl,
  createChatOrganizerFolder,
  createChatSession,
  deleteChatOrganizerFolder,
  deleteChatQueueEntry,
  deleteChatSession,
  enqueueChatMessage,
  getChatBootstrap,
  getChatHistory,
  getChatQueue,
  patchChatOrganizerFolder,
  patchChatSession,
  resetChatSession,
  sendChatMessage,
} from "../api/chat";
import type { ApiError } from "../api/errors";
import type {
  ChatAbortResponse,
  ChatAssignSessionsToFolderRequest,
  ChatAssignSessionsToFolderResponse,
  ChatBootstrapPayload,
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
  ChatSendAck,
  ChatSendRequest,
  ChatStreamEvent,
} from "../../../../../types/chat";

/**
 * TanStack Query hooks for the Chat (Agent operations) data layer plus a
 * dedicated SSE streaming hook (`useChatStream`).
 *
 * Query keys are namespaced under `["chat", ...]`. The bootstrap query owns the
 * session roster + the selected session's read snapshot; the write mutations
 * invalidate the affected slices. The streaming hook is intentionally NOT a
 * TanStack query — SSE is a long-lived `text/event-stream`, so it is consumed
 * via the streaming `fetch` reader below and surfaced through React state.
 */

export const chatKeys = {
  all: ["chat"] as const,
  bootstrap: (sessionKey: string | null) =>
    ["chat", "bootstrap", sessionKey] as const,
  history: (sessionKey: string) => ["chat", "history", sessionKey] as const,
  queue: (sessionKey: string) => ["chat", "queue", sessionKey] as const,
};

type QueryOpts<TData> = Omit<
  UseQueryOptions<TData, ApiError, TData>,
  "queryKey" | "queryFn"
>;
type MutationOpts<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  "mutationFn"
>;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Bootstrap query — session roster + organizer + the selected session's
 * history/queue snapshot. Reuses the same backend route the dashboard
 * cockpit reads, but with a full recent window and a selected session key.
 */
export function useChatBootstrapQuery(
  params: {
    sessionKey?: string | null;
    recentLimit?: number;
    historyLimit?: number;
  } = {},
  options?: QueryOpts<ChatBootstrapPayload>,
) {
  return useQuery<ChatBootstrapPayload, ApiError>({
    queryKey: chatKeys.bootstrap(params.sessionKey ?? null),
    queryFn: ({ signal }) => getChatBootstrap(params, signal),
    ...options,
  });
}

/** History query — used to refetch a session transcript after a run completes. */
export function useChatHistoryQuery(
  sessionKey: string | null,
  params: { limit?: number } = {},
  options?: QueryOpts<ChatHistoryPayload>,
) {
  return useQuery<ChatHistoryPayload, ApiError>({
    queryKey: chatKeys.history(sessionKey ?? ""),
    queryFn: ({ signal }) =>
      getChatHistory(sessionKey as string, params, signal),
    enabled: Boolean(sessionKey),
    ...options,
  });
}

/** Queue query — pending / blocked outbound messages for a session. */
export function useChatQueueQuery(
  sessionKey: string | null,
  options?: QueryOpts<ChatQueuePayload>,
) {
  return useQuery<ChatQueuePayload, ApiError>({
    queryKey: chatKeys.queue(sessionKey ?? ""),
    queryFn: ({ signal }) => getChatQueue(sessionKey as string, signal),
    enabled: Boolean(sessionKey),
    ...options,
  });
}


// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Create a Tracevane-managed chat session. */
export function useCreateChatSessionMutation(
  options?: MutationOpts<
    ChatCreateSessionResponse,
    { agentId: string; payload: ChatCreateSessionRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatCreateSessionResponse,
    ApiError,
    { agentId: string; payload: ChatCreateSessionRequest }
  >({
    mutationFn: ({ agentId, payload }) => createChatSession(agentId, payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Rename/archive/unarchive a Tracevane-managed session. */
export function usePatchChatSessionMutation(
  options?: MutationOpts<
    ChatPatchSessionResponse,
    { sessionKey: string; payload: ChatPatchSessionRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatPatchSessionResponse,
    ApiError,
    { sessionKey: string; payload: ChatPatchSessionRequest }
  >({
    mutationFn: ({ sessionKey, payload }) =>
      patchChatSession(sessionKey, payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Delete a Tracevane-managed session. Destructive — confirm at the call site. */
export function useDeleteChatSessionMutation(
  options?: MutationOpts<ChatDeleteSessionResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChatDeleteSessionResponse, ApiError, string>({
    mutationFn: (sessionKey) => deleteChatSession(sessionKey),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}


/** Create an organizer folder/subfolder. */
export function useCreateChatOrganizerFolderMutation(
  options?: MutationOpts<
    ChatCreateOrganizerFolderResponse,
    ChatCreateOrganizerFolderRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatCreateOrganizerFolderResponse,
    ApiError,
    ChatCreateOrganizerFolderRequest
  >({
    mutationFn: (payload) => createChatOrganizerFolder(payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Rename, sort, collapse, or move an organizer folder. */
export function usePatchChatOrganizerFolderMutation(
  options?: MutationOpts<
    ChatPatchOrganizerFolderResponse,
    { folderId: string; payload: ChatPatchOrganizerFolderRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatPatchOrganizerFolderResponse,
    ApiError,
    { folderId: string; payload: ChatPatchOrganizerFolderRequest }
  >({
    mutationFn: ({ folderId, payload }) =>
      patchChatOrganizerFolder(folderId, payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Delete a folder. Sessions are returned to root by the backend. */
export function useDeleteChatOrganizerFolderMutation(
  options?: MutationOpts<ChatDeleteOrganizerFolderResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChatDeleteOrganizerFolderResponse, ApiError, string>({
    mutationFn: (folderId) => deleteChatOrganizerFolder(folderId),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

/** Move sessions into a folder or back to the unfiled/root scope. */
export function useAssignChatSessionsToFolderMutation(
  options?: MutationOpts<
    ChatAssignSessionsToFolderResponse,
    ChatAssignSessionsToFolderRequest
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatAssignSessionsToFolderResponse,
    ApiError,
    ChatAssignSessionsToFolderRequest
  >({
    mutationFn: (payload) => assignChatSessionsToFolder(payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Send a user turn (starts a run). The caller drives the live stream + refetch. */
export function useSendChatMessageMutation(
  options?: MutationOpts<
    ChatSendAck,
    { sessionKey: string; payload: ChatSendRequest }
  >,
) {
  return useMutation<
    ChatSendAck,
    ApiError,
    { sessionKey: string; payload: ChatSendRequest }
  >({
    mutationFn: ({ sessionKey, payload }) =>
      sendChatMessage(sessionKey, payload),
    ...options,
  });
}

/** Abort the active run. Invalidates the session snapshot on success. */
export function useAbortChatSessionMutation(
  options?: MutationOpts<ChatAbortResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChatAbortResponse, ApiError, string>({
    mutationFn: (sessionKey) => abortChatSession(sessionKey),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

/** Reset (clear) the session. Destructive — confirm at the call site. */
export function useResetChatSessionMutation(
  options?: MutationOpts<ChatResetResponse, string>,
) {
  const queryClient = useQueryClient();
  return useMutation<ChatResetResponse, ApiError, string>({
    mutationFn: (sessionKey) => resetChatSession(sessionKey),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all });
      options?.onSuccess?.(...args);
    },
  });
}

/** Enqueue a message for later delivery. Invalidates the queue slice. */
export function useEnqueueChatMessageMutation(
  options?: MutationOpts<
    ChatQueuedMessageItem,
    { sessionKey: string; payload: ChatSendRequest }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    ChatQueuedMessageItem,
    ApiError,
    { sessionKey: string; payload: ChatSendRequest }
  >({
    mutationFn: ({ sessionKey, payload }) =>
      enqueueChatMessage(sessionKey, payload),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.queue(variables.sessionKey),
      });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

/** Delete a queued message. Destructive — confirm at the call site. */
export function useDeleteChatQueueEntryMutation(
  options?: MutationOpts<
    { ok: boolean },
    { sessionKey: string; entryId: string }
  >,
) {
  const queryClient = useQueryClient();
  return useMutation<
    { ok: boolean },
    ApiError,
    { sessionKey: string; entryId: string }
  >({
    mutationFn: ({ sessionKey, entryId }) =>
      deleteChatQueueEntry(sessionKey, entryId),
    ...options,
    onSuccess: (data, variables, ...rest) => {
      void queryClient.invalidateQueries({
        queryKey: chatKeys.queue(variables.sessionKey),
      });
      options?.onSuccess?.(data, variables, ...rest);
    },
  });
}

// ---------------------------------------------------------------------------
// SSE streaming
// ---------------------------------------------------------------------------

export type ChatStreamStatus =
  | "idle"
  | "connecting"
  | "open"
  | "closed"
  | "error";

export interface ChatStreamState {
  status: ChatStreamStatus;
  /** Most recent transport / event error message, if any. */
  error: string | null;
}

export interface UseChatStreamOptions {
  /** Called for every decoded `chat-stream` event in order. */
  onEvent?: (event: ChatStreamEvent) => void;
  /** Called when the `ready` control event arrives. */
  onReady?: () => void;
}

/**
 * Subscribe to a session's SSE event stream via a `fetch`-based reader.
 *
 * We use `fetch` + a `ReadableStream` reader (rather than `EventSource`) so we
 * can rely on the shared transport origin and abort cleanly on unmount /
 * session switch. The backend frames events as standard SSE
 * (`event: <name>\n` + one or more `data: <json>\n` lines + blank line); the
 * meaningful payloads arrive on the `chat-stream` event as a `ChatStreamEvent`.
 *
 * This hook does NOT synthesize completion — `status` only reaches `closed`
 * when the underlying stream actually ends, and `error` is set on a transport
 * failure. Consumers are expected to refetch authoritative history on a `final`
 * / `aborted` event rather than trust the stream as the source of truth.
 */
export function useChatStream(
  sessionKey: string | null,
  enabled: boolean,
  options: UseChatStreamOptions = {},
): ChatStreamState {
  const [state, setState] = React.useState<ChatStreamState>({
    status: "idle",
    error: null,
  });

  // Keep the latest callbacks in refs so toggling them doesn't reopen the stream.
  const onEventRef = React.useRef(options.onEvent);
  const onReadyRef = React.useRef(options.onReady);
  onEventRef.current = options.onEvent;
  onReadyRef.current = options.onReady;

  React.useEffect(() => {
    if (!sessionKey || !enabled) {
      setState({ status: "idle", error: null });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState({ status: "connecting", error: null });

    void (async () => {
      try {
        const response = await fetch(chatStreamUrl(sessionKey), {
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          if (!cancelled) {
            setState({
              status: "error",
              error: `stream HTTP ${response.status}`,
            });
          }
          return;
        }
        if (!cancelled) setState({ status: "open", error: null });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        // Process one complete SSE frame (event + data lines).
        const dispatchFrame = (frame: string) => {
          let eventName = "message";
          const dataLines: string[] = [];
          for (const rawLine of frame.split("\n")) {
            const line = rawLine.replace(/\r$/, "");
            if (line.startsWith(":")) continue; // comment / heartbeat
            if (line.startsWith("event:")) {
              eventName = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice("data:".length).replace(/^ /, ""));
            }
          }
          if (dataLines.length === 0) return;
          const payload = dataLines.join("\n");
          if (eventName === "ready") {
            onReadyRef.current?.();
            return;
          }
          if (eventName !== "chat-stream") return;
          try {
            onEventRef.current?.(JSON.parse(payload) as ChatStreamEvent);
          } catch {
            // Ignore malformed frames rather than tearing down the stream.
          }
        };

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let sep = buffer.indexOf("\n\n");
          while (sep !== -1) {
            const frame = buffer.slice(0, sep);
            buffer = buffer.slice(sep + 2);
            if (frame.trim()) dispatchFrame(frame);
            sep = buffer.indexOf("\n\n");
          }
        }
        if (!cancelled) setState({ status: "closed", error: null });
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "stream failed",
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sessionKey, enabled]);

  return state;
}
