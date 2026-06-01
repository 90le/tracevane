import type { ChatSessionRow } from "../../../../../types/chat.js";

export interface ChatStageHeader {
  title: string;
  subtitle: string;
  agentName: string;
}

export function buildChatStageHeader(params: {
  conversationTitle: string;
  conversationSubtitle: string;
  agentName: string;
}): ChatStageHeader {
  return {
    title: params.conversationTitle,
    subtitle: params.conversationSubtitle,
    agentName: params.agentName,
  };
}

export interface ChatHistoryStateSummary {
  historyMode: "history" | "search";
  selectedSessionKey: string;
  hasSelectedSession: boolean;
  selectedSessionKind: ChatSessionRow["kind"] | null;
  selectedSessionWritable: boolean;
  selectedSessionCanSend: boolean;
  selectedSessionHasActiveRun: boolean;
  viewingHistoricalPosition: boolean;
}

export function buildChatHistoryStateSummary(params: {
  historyMode: "history" | "search";
  selectedSessionKey: string;
  selectedSession: ChatSessionRow | null;
  activeRunId: string | null;
  viewingHistoricalPosition: boolean;
}): ChatHistoryStateSummary {
  return {
    historyMode: params.historyMode,
    selectedSessionKey: params.selectedSessionKey,
    hasSelectedSession: Boolean(params.selectedSession),
    selectedSessionKind: params.selectedSession?.kind || null,
    selectedSessionWritable: Boolean(
      params.selectedSession?.permissions.writable,
    ),
    selectedSessionCanSend: Boolean(
      params.selectedSession?.permissions.canSend,
    ),
    selectedSessionHasActiveRun: Boolean(params.activeRunId),
    viewingHistoricalPosition: params.viewingHistoricalPosition,
  };
}
