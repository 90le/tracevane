import { computed, type ComputedRef, type Ref } from "vue";
import { buildChatRenderableTimeline } from "../../../../../lib/chat-run-overlay";
import {
  buildTimelineVersion,
  coalesceAssistantDeliveryMessages,
} from "../../../../../lib/chat-runtime-state";
import {
  resolveObservedSessionsForRail,
  sortChatSessionsByUpdatedAt,
} from "../../../../../lib/chat-session-catalog";
import type { AgentSummary } from "../../../../../types/agents";
import type {
  ChatDiagnostics,
  ChatHistoryPayload,
  ChatMessageItem,
  ChatObservabilityState,
  ChatRunOverlay,
  ChatSessionRow,
} from "../../../../../types/chat";
import { isChatRealtimeEnabled } from "../../shared/runtime-config";
import { deriveAgentIdFromChatSessionKey } from "../chat/session-ref";
import { deriveChatSessionTitle } from "./display-adapter";
import {
  buildChatOverlaySummary,
  buildChatRuntimeSummary,
} from "./chat-session-runtime-machine";

type ReadonlyRef<T> = Ref<T> | ComputedRef<T>;
type TextFn = (chinese: string, english: string) => string;

function sortSessions(left: ChatSessionRow, right: ChatSessionRow): number {
  return sortChatSessionsByUpdatedAt(left, right);
}

function sortArchivedSessions(
  left: ChatSessionRow,
  right: ChatSessionRow,
): number {
  const leftTs =
    Date.parse(left.presentation.archivedAt || left.updatedAt || "") || 0;
  const rightTs =
    Date.parse(right.presentation.archivedAt || right.updatedAt || "") || 0;
  return rightTs - leftTs;
}

export function useChatRuntimeViewModel(params: {
  shellMode: ReadonlyRef<"chat" | "inspect">;
  sessionRows: ReadonlyRef<ChatSessionRow[]>;
  selectedSessionKey: ReadonlyRef<string>;
  historyPayload: ReadonlyRef<ChatHistoryPayload | null>;
  renderMessages: ReadonlyRef<ChatMessageItem[]>;
  renderOverlays: ReadonlyRef<ChatRunOverlay[]>;
  routeSessionKey: ReadonlyRef<string | null>;
  agentRows: ReadonlyRef<AgentSummary[]>;
  chatHealth: ReadonlyRef<ChatDiagnostics | null>;
  wsConnected: ReadonlyRef<boolean>;
  text: TextFn;
}) {
  const inspectPinned = computed(() => params.shellMode.value === "inspect");
  const selectedSession = computed(() => {
    const fromRows =
      params.sessionRows.value.find(
        (row) => row.key === params.selectedSessionKey.value,
      ) || null;
    if (fromRows) {
      return fromRows;
    }
    if (
      params.historyPayload.value?.session.key ===
      params.selectedSessionKey.value
    ) {
      return params.historyPayload.value.session;
    }
    return null;
  });
  const studioManagedSessions = computed(() =>
    params.sessionRows.value
      .filter(
        (row) =>
          row.permissions.visibleInFrontend && row.kind === "studio_managed",
      )
      .sort(sortSessions),
  );
  const activeStudioManagedSessions = computed(() =>
    studioManagedSessions.value.filter((row) => !row.presentation.archived),
  );
  const archivedStudioManagedSessions = computed(() =>
    studioManagedSessions.value
      .filter((row) => row.presentation.archived)
      .sort(sortArchivedSessions),
  );
  const observedSessions = computed(() =>
    resolveObservedSessionsForRail(
      params.sessionRows.value
        .filter(
          (row) =>
            row.permissions.visibleInFrontend && row.kind !== "studio_managed",
        )
        .sort(sortSessions),
      inspectPinned.value,
    ),
  );

  const activeDiagnostics = computed<ChatDiagnostics | null>(
    () =>
      params.historyPayload.value?.diagnostics ||
      params.chatHealth.value ||
      null,
  );
  const activeObservability = computed<ChatObservabilityState>(
    () =>
      params.historyPayload.value?.observability || {
        lifecycle: null,
        toolCards: [],
        usage: null,
        timeline: [],
      },
  );
  const selectedAgentId = computed(
    () =>
      selectedSession.value?.agentId ||
      (params.routeSessionKey.value
        ? deriveAgentIdFromChatSessionKey(params.routeSessionKey.value)
        : null),
  );
  const selectedAgent = computed(
    () =>
      params.agentRows.value.find(
        (agent) => agent.id === selectedAgentId.value,
      ) || null,
  );
  const agentName = computed(
    () =>
      selectedAgent.value?.name ||
      selectedAgent.value?.identity.name ||
      selectedAgentId.value ||
      params.text("助手", "Assistant"),
  );
  const agentAvatar = computed(
    () => selectedAgent.value?.identity.avatar || "",
  );
  const agentEmoji = computed(() => selectedAgent.value?.identity.emoji || "");
  const agentInitial = computed(
    () => (agentName.value || "A").trim().charAt(0).toUpperCase() || "A",
  );
  const selectedSessionTitle = computed(() =>
    selectedSession.value
      ? deriveChatSessionTitle(selectedSession.value, agentName.value)
      : "",
  );
  const runtimeSummary = computed(() =>
    buildChatRuntimeSummary({
      historyRuntime: params.historyPayload.value?.runtime,
      sessionRuntime: selectedSession.value?.runtime,
      selectedSession: selectedSession.value,
      selectedSessionTitle: selectedSessionTitle.value,
      agentName: agentName.value,
      chatRealtimeEnabled: isChatRealtimeEnabled(),
      gatewayReachable: activeDiagnostics.value?.gatewayReachable,
      wsConnected: params.wsConnected.value,
      text: params.text,
    }),
  );
  const activeRuntime = computed(() => runtimeSummary.value.activeRuntime);
  const overlaySummary = computed(() =>
    buildChatOverlaySummary({
      overlays: params.renderOverlays.value,
    }),
  );
  const effectiveOverlays = computed(() => overlaySummary.value.overlays);
  const overlayToolCallIds = computed(() =>
    renderTimelineItems.value.flatMap((item) =>
      item.type === "run_overlay"
        ? item.overlay.toolCalls
            .map((toolCall) => toolCall.toolCallId)
            .filter(Boolean)
        : [],
    ),
  );
  const conversationTitle = computed(
    () => runtimeSummary.value.conversationTitle,
  );
  const conversationSubtitle = computed(
    () => runtimeSummary.value.conversationSubtitle,
  );
  const gatewayWarning = computed(() => runtimeSummary.value.gatewayWarning);
  const accessError = computed(() => {
    if (!selectedSession.value) return "";
    if (
      !inspectPinned.value &&
      selectedSession.value.kind !== "studio_managed"
    ) {
      return params.text(
        "observed_external / system_internal 不应直接进入开放聊天面，请切换到调试模式查看。",
        "observed_external / system_internal should stay outside the public chat surface. Switch to inspect mode to view them.",
      );
    }
    return "";
  });
  const displayMessages = computed(() => {
    const source = [...params.renderMessages.value];
    return coalesceAssistantDeliveryMessages(
      source.filter((message) => message.role !== "tool"),
    );
  });
  const renderTimelineItems = computed(() =>
    buildChatRenderableTimeline({
      messages: displayMessages.value,
      overlays: effectiveOverlays.value,
    }),
  );
  const timelineVersion = computed(() =>
    buildTimelineVersion(renderTimelineItems.value),
  );

  return {
    inspectPinned,
    selectedSession,
    studioManagedSessions,
    activeStudioManagedSessions,
    archivedStudioManagedSessions,
    observedSessions,
    activeRuntime,
    activeDiagnostics,
    activeObservability,
    selectedAgentId,
    selectedAgent,
    agentName,
    agentAvatar,
    agentEmoji,
    agentInitial,
    effectiveOverlays,
    overlayToolCallIds,
    conversationTitle,
    conversationSubtitle,
    gatewayWarning,
    accessError,
    displayMessages,
    renderTimelineItems,
    timelineVersion,
  };
}
