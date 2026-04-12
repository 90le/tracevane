import type {
  ChatDiagnostics,
  ChatRuntimeState,
} from "../../../../types/chat.js";

export interface ChatSessionRuntimeSummary {
  state: ChatRuntimeState["state"];
  hasActiveRun: boolean;
  activeRunId: string | null;
  gatewayConnected: boolean;
  sessionWritable: boolean;
  lastEventAt: string | null;
  lastAckAt: string | null;
  lastErrorCode: ChatRuntimeState["lastErrorCode"];
}

export interface ChatDiagnosticsSummary {
  gatewayReachable: boolean;
  historyTruncated: boolean;
  truncationMode: ChatDiagnostics["truncationMode"];
  noteCount: number;
  hasIssues: boolean;
}

export function buildChatSessionRuntimeSummary(
  runtime: ChatRuntimeState,
): ChatSessionRuntimeSummary {
  return {
    state: runtime.state,
    hasActiveRun: Boolean(runtime.activeRunId),
    activeRunId: runtime.activeRunId,
    gatewayConnected: runtime.gatewayConnected,
    sessionWritable: runtime.sessionWritable,
    lastEventAt: runtime.lastEventAt,
    lastAckAt: runtime.lastAckAt,
    lastErrorCode: runtime.lastErrorCode,
  };
}

export function buildChatDiagnosticsSummary(
  diagnostics: ChatDiagnostics,
): ChatDiagnosticsSummary {
  return {
    gatewayReachable: diagnostics.gatewayReachable,
    historyTruncated: diagnostics.historyTruncated,
    truncationMode: diagnostics.truncationMode,
    noteCount: diagnostics.notes.length,
    hasIssues: !diagnostics.gatewayReachable || diagnostics.historyTruncated,
  };
}
