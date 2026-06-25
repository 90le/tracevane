/**
 * Chat (Agent operations) workbench (`/chat`) feature types.
 *
 * The wire contracts live in the repo-level `types/chat.ts` (the same file the
 * backend imports). We re-export the pieces the workbench data layer + views
 * consume, plus the small derived view-model + streaming view types the page
 * synthesizes from the live SSE stream.
 */

export type {
  ChatAbortResponse,
  ChatBootstrapPayload,
  ChatContractError,
  ChatCreateSessionRequest,
  ChatCreateSessionResponse,
  ChatDeleteSessionResponse,
  ChatDiagnostics,
  ChatHistoryPayload,
  ChatMessageItem,
  ChatMessageRole,
  ChatMessageToolCallItem,
  ChatObservabilityState,
  ChatProcessBlock,
  ChatQueuePayload,
  ChatQueuedMessageItem,
  ChatResetResponse,
  ChatRunOverlay,
  ChatRunState,
  ChatRuntimeState,
  ChatSendAck,
  ChatSendRequest,
  ChatSessionControlState,
  ChatSessionControlsPayload,
  ChatSessionPermissions,
  ChatSessionRow,
  ChatStreamEvent,
  ChatToolCard,
  ChatToolStatus,
  ChatUsageSummary,
} from "../../../../../types/chat";

import type { ChatMessageItem, ChatToolCard } from "../../../../../types/chat";

// ---------------------------------------------------------------------------
// Derived view-model tones (mirrors the established feature tone vocabulary)
// ---------------------------------------------------------------------------

export type ChatTone = "ok" | "warn" | "bad" | "info" | "mute";

// ---------------------------------------------------------------------------
// Live streaming view-model
// ---------------------------------------------------------------------------

/**
 * The in-flight assistant turn assembled from the SSE stream. This is a
 * transient projection rendered while a run is active; on `final`/`aborted` the
 * authoritative history is refetched and this is cleared, so the stream is
 * never the persisted source of truth.
 */
export interface LiveAssistantTurn {
  runId: string | null;
  /** Accumulated assistant text as deltas arrive. */
  text: string;
  /** Tool cards keyed by toolCallId, in arrival order. */
  toolCards: ChatToolCard[];
  /** Whether the run has reached a terminal state on the stream. */
  done: boolean;
  /** Set when the stream reported an error for this turn. */
  error: string | null;
  /** Set when the run was aborted; carries the partial message if any. */
  aborted: boolean;
  /** The terminal message if the stream delivered one. */
  finalMessage: ChatMessageItem | null;
}

/** Center-pane view selector for the conversation column. */
export const CHAT_INSPECTOR_TABS = [
  "evidence",
  "queue",
  "controls",
  "diagnostics",
] as const;
export type ChatInspectorTab = (typeof CHAT_INSPECTOR_TABS)[number];
