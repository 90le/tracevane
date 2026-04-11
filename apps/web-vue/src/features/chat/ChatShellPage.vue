<template>
  <section class="page-shell chat-shell-page" :class="[`mode-${props.shellMode}`, { 'inspect-mode': inspectPinned }]">
    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <div class="chat-shell-layout">
      <aside class="chat-shell-sidebar">
        <SessionListPanel
          :primary-sessions="studioManagedSessions"
          :observed-sessions="inspectPinned ? observedSessions : []"
          :selected-session-key="selectedSessionKey"
          :loading="sessionsLoading || agentsLoading"
          :inspect-mode="inspectPinned"
          :inspect-pinned="inspectPinned"
          :agents="agentRows"
          @select-session="openSession"
          @new-chat="newChatOpen = true"
          @toggle-inspect="toggleInspectRoute"
          @session-action="handleSessionAction"
        />
      </aside>

      <main class="chat-shell-main">
        <ConversationPane
          :selected-session="selectedSession"
          :title="conversationTitle"
          :subtitle="conversationSubtitle"
          :agent-name="agentName"
          :agent-avatar="agentAvatar"
          :agent-emoji="agentEmoji"
          :agent-initial="agentInitial"
          :message-groups="messageGroups"
          :history-loading="historyLoading"
          :history-error-message="historyErrorMessage"
          :access-error="accessError"
          :gateway-warning="gatewayWarning"
          :draft="composerDraft"
          :placeholder="composerPlaceholder"
          :composer-disabled="composerDisabled"
          :can-send="canSend"
          :can-abort="canAbort"
          :can-reset="canReset"
          :send-busy="sendBusy"
          :abort-busy="abortBusy"
          :inspect-open="inspectPinned"
          :inspect-pinned="inspectPinned"
          :active-run-id="activeRuntime?.activeRunId || null"
          :inline-tools="inlineTools"
          @update:draft="composerDraft = $event"
          @send="sendMessage"
          @abort="abortCurrentRun"
          @reset="resetCurrentSession"
          @new-chat="newChatOpen = true"
          @toggle-inspect="toggleInspectRoute"
          @open-session-list="mobileSessionDrawerOpen = true"
          @composer-keydown="handleComposerKeydown"
        />
      </main>
    </div>

    <Teleport to="body">
      <div v-if="mobileSessionDrawerOpen" class="surface-drawer-mask" @click.self="mobileSessionDrawerOpen = false">
        <aside class="surface-drawer chat-shell-mobile-drawer">
          <SessionListPanel
            :primary-sessions="studioManagedSessions"
            :observed-sessions="inspectPinned ? observedSessions : []"
            :selected-session-key="selectedSessionKey"
            :loading="sessionsLoading || agentsLoading"
            :inspect-mode="inspectPinned"
            :inspect-pinned="inspectPinned"
            :agents="agentRows"
            @select-session="selectSessionFromMobile"
            @new-chat="openNewChatFromMobile"
            @toggle-inspect="toggleInspectFromMobile"
          />
        </aside>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="inspectPinned && inspectorDrawerOpen" class="chat-shell-inspector-mask" @click="closeInspectorDrawer">
        <aside class="chat-shell-inspector-sheet" @click.stop>
          <InspectorPanel
            :tab="inspectorTab"
            :inspect-pinned="inspectPinned"
            :runtime="activeRuntime"
            :diagnostics="activeDiagnostics"
            :observability="activeObservability"
            @close="closeInspectorDrawer"
            @update:tab="inspectorTab = $event"
          />
        </aside>
      </div>
    </Teleport>

    <NewChatAgentPicker
      :open="newChatOpen"
      :creating="sessionCreating"
      :agents="agentRows"
      @close="newChatOpen = false"
      @select="createSessionForAgent"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AgentSummary } from '../../../../../types/agents';
import type {
  ChatActivityItem,
  ChatDiagnostics,
  ChatHistoryPayload,
  ChatLifecycleSignal,
  ChatMessageItem,
  ChatObservabilityState,
  ChatRuntimeState,
  ChatSessionKind,
  ChatSessionRow,
  ChatStreamEvent,
  ChatToolCard,
  ChatUsageSummary,
} from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';
import { getWebSocketBasePath } from '../../shared/api';
import { isChatRealtimeEnabled } from '../../shared/runtime-config';
import {
  abortChatRun,
  createChatSession,
  fetchAgentsSummary,
  fetchChatHealth,
  fetchChatHistory,
  fetchChatSessions,
  resetChatSession,
  sendChatMessage,
} from './api';
import ConversationPane from './ConversationPane.vue';
import InspectorPanel from './InspectorPanel.vue';
import NewChatAgentPicker from './NewChatAgentPicker.vue';
import SessionListPanel from './SessionListPanel.vue';
import { buildChatMessageGroups } from './message-groups';
import { decodeChatSessionRef, deriveAgentIdFromChatSessionKey, encodeChatSessionRef, isChatSessionRef } from './session-ref';
import { readLastChatSessionKey, rememberLastChatAgentId, rememberLastChatSessionKey } from './storage';
import { deriveChatSessionTitle } from './display-adapter';

type NoticeMessage = {
  kind: 'success' | 'error';
  text: string;
};

const props = withDefaults(defineProps<{
  shellMode?: 'chat' | 'inspect';
}>(), {
  shellMode: 'chat',
});

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const agentRows = ref<AgentSummary[]>([]);
const sessionRows = ref<ChatSessionRow[]>([]);
const selectedSessionKey = ref('');
const historyPayload = ref<ChatHistoryPayload | null>(null);
const chatHealth = ref<ChatDiagnostics | null>(null);
const agentsLoading = ref(false);
const sessionsLoading = ref(false);
const historyLoading = ref(false);
const sessionCreating = ref(false);
const sendBusy = ref(false);
const abortBusy = ref(false);
const resetBusy = ref(false);
const composerDraft = ref('');
const errorMessage = ref('');
const historyErrorMessage = ref('');
const noticeMessage = ref<NoticeMessage | null>(null);
const streamMessages = ref<ChatMessageItem[]>([]);
const wsConnected = ref(false);
const newChatOpen = ref(false);
const mobileSessionDrawerOpen = ref(false);
const inspectorTab = ref<'overview' | 'tools' | 'activity' | 'diagnostics'>('overview');
const inspectorDrawerOpen = ref(true);

let chatSocket: WebSocket | null = null;
let chatSocketSessionKey = '';
let historyLoadVersion = 0;
let sessionsLoadVersion = 0;
const suppressedRunIds = new Set<string>();
const toolObservedRunIds = new Set<string>();

const inspectPinned = computed(() => props.shellMode === 'inspect');

const routeSessionKey = computed(() => {
  const paramRef = typeof route.params.sessionRef === 'string' ? route.params.sessionRef : '';
  if (paramRef) return decodeChatSessionRef(paramRef);

  const querySessionRef = typeof route.query.sessionRef === 'string' ? route.query.sessionRef : '';
  if (querySessionRef && isChatSessionRef(querySessionRef)) return decodeChatSessionRef(querySessionRef);

  const legacyQuerySession = typeof route.query.session === 'string' ? route.query.session : '';
  return legacyQuerySession || null;
});

const selectedSession = computed(() => sessionRows.value.find((row) => row.key === selectedSessionKey.value) || null);
const studioManagedSessions = computed(() => {
  return sessionRows.value
    .filter((row) => row.permissions.visibleInFrontend && row.kind === 'studio_managed')
    .sort(sortSessions);
});
const observedSessions = computed(() => {
  return sessionRows.value
    .filter((row) => row.permissions.visibleInFrontend && row.kind !== 'studio_managed')
    .sort(sortSessions);
});
const activeRuntime = computed<ChatRuntimeState | null>(() => historyPayload.value?.runtime || selectedSession.value?.runtime || null);
const activeDiagnostics = computed<ChatDiagnostics | null>(() => historyPayload.value?.diagnostics || chatHealth.value || null);
const activeObservability = computed<ChatObservabilityState>(() => {
  return historyPayload.value?.observability || {
    lifecycle: null,
    toolCards: [],
    usage: null,
    timeline: [],
  };
});
const displayMessages = computed<ChatMessageItem[]>(() => [...(historyPayload.value?.messages || []), ...streamMessages.value]);
const messageGroups = computed(() => buildChatMessageGroups(displayMessages.value));
const selectedAgentId = computed(() => selectedSession.value?.agentId || (routeSessionKey.value ? deriveAgentIdFromChatSessionKey(routeSessionKey.value) : null));
const selectedAgent = computed(() => agentRows.value.find((agent) => agent.id === selectedAgentId.value) || null);
const agentName = computed(() => selectedAgent.value?.name || selectedAgent.value?.identity.name || selectedAgentId.value || text('助手', 'Assistant'));
const agentAvatar = computed(() => selectedAgent.value?.identity.avatar || '');
const agentEmoji = computed(() => selectedAgent.value?.identity.emoji || '');
const agentInitial = computed(() => (agentName.value || 'A').trim().charAt(0).toUpperCase() || 'A');

const conversationTitle = computed(() => {
  if (!selectedSession.value) return text('Chat', 'Chat');
  return deriveChatSessionTitle(selectedSession.value, agentName.value);
});
const conversationSubtitle = computed(() => {
  if (!selectedSession.value) {
    return text(
      '左侧固定显示你的会话列表；新建会话时再选择 Agent。',
      'Your conversations stay pinned on the left; choose an agent only when you start a new chat.'
    );
  }
  if (inspectPinned.value) {
    return text(
      '这是辅助调试视图。主聊天页保持轻量，详细 runtime / tools / diagnostics 收纳在这里。',
      'This is the auxiliary debug view. The main chat stays lightweight while runtime, tools, and diagnostics live here.'
    );
  }
  return text(
    '右侧专注当前会话，左侧随时切换历史对话。',
    'The right side stays focused on the active conversation while the left side remains your persistent chat list.'
  );
});

const gatewayWarning = computed(() => {
  if (!isChatRealtimeEnabled() && selectedSession.value?.permissions.writable) {
    return text(
      '当前部署模式已挂到 Gateway，但聊天实时链路还未启用。历史和 HTTP 操作可用，实时消息流暂不可用。',
      'This deployment is mounted behind the Gateway, but chat realtime is not enabled yet. History and HTTP actions still work, but the live stream is unavailable.',
    );
  }
  if (activeDiagnostics.value?.gatewayReachable === false) {
    return text('当前 Gateway 不可达，历史仍可读，但新的会话操作可能失败。', 'The Gateway is unreachable. History remains readable, but new session actions may fail.');
  }
  if (!wsConnected.value && selectedSession.value?.permissions.writable) {
    return text('实时连接正在恢复，消息和工具过程可能短暂延迟。', 'Realtime connection is recovering. Messages and tool progress may briefly lag.');
  }
  return '';
});

const accessError = computed(() => {
  if (!selectedSession.value) return '';
  if (!inspectPinned.value && selectedSession.value.kind !== 'studio_managed') {
    return text(
      '这个会话属于 observed_external / system_internal，不应直接进入开放聊天面。请切换到 Inspect 模式查看。',
      'This session belongs to observed_external / system_internal and should not open directly in the public chat surface. Switch to inspect mode instead.'
    );
  }
  return '';
});

const composerPlaceholder = computed(() => {
  if (!selectedSession.value) {
    return text('先从左侧选择一个会话，或者新建一个会话。', 'Choose a conversation from the left, or create a new one first.');
  }
  if (accessError.value || !selectedSession.value.permissions.canSend) {
    return text('当前会话只读，不允许发送消息。', 'This session is read-only and cannot send messages.');
  }
  return text('输入消息，继续这段对话…', 'Type a message to continue the conversation...');
});
const composerDisabled = computed(() => !selectedSession.value || Boolean(accessError.value) || !selectedSession.value.permissions.canSend || sendBusy.value || resetBusy.value);
const canSend = computed(() => Boolean(selectedSession.value?.permissions.canSend && composerDraft.value.trim() && !sendBusy.value && wsConnected.value && !accessError.value));
const canAbort = computed(() => Boolean(selectedSession.value?.permissions.canAbort && activeRuntime.value?.activeRunId && !abortBusy.value && !accessError.value));
const canReset = computed(() => Boolean(selectedSession.value?.permissions.canReset && !resetBusy.value && !accessError.value));

const inlineTools = computed(() => {
  const cards = activeObservability.value.toolCards || [];
  const activeRunId = activeRuntime.value?.activeRunId;
  if (activeRunId) {
    const activeCards = cards.filter((item) => item.runId === activeRunId);
    if (activeCards.length) return activeCards.slice(0, 2);
  }
  return cards.slice(0, 2);
});

function sortSessions(left: ChatSessionRow, right: ChatSessionRow): number {
  const leftTs = Date.parse(left.updatedAt || '') || 0;
  const rightTs = Date.parse(right.updatedAt || '') || 0;
  return rightTs - leftTs;
}

function setNotice(kind: NoticeMessage['kind'], message: string): void {
  noticeMessage.value = { kind, text: message };
}

function clearNotice(): void {
  noticeMessage.value = null;
}

function syncSessionRow(sessionKey: string, patch: Partial<ChatSessionRow>): void {
  const index = sessionRows.value.findIndex((row) => row.key === sessionKey);
  if (index === -1) return;
  const current = sessionRows.value[index];
  sessionRows.value[index] = {
    ...current,
    ...patch,
    runtime: patch.runtime || current.runtime,
    source: patch.source || current.source,
    deliveryContext: patch.deliveryContext || current.deliveryContext,
    permissions: patch.permissions || current.permissions,
  };
}

function resetStreamState(): void {
  streamMessages.value = [];
}

function upsertStreamMessage(message: ChatMessageItem): void {
  const index = streamMessages.value.findIndex((item) => item.id === message.id || (message.runId && item.runId === message.runId));
  if (index === -1) {
    streamMessages.value.push(message);
    return;
  }
  streamMessages.value[index] = message;
}

function removeStreamRun(runId: string | null): void {
  if (!runId) return;
  streamMessages.value = streamMessages.value.filter((item) => item.runId !== runId);
}

function collectCurrentRunIds(): string[] {
  const runIds = new Set<string>();
  if (activeRuntime.value?.activeRunId) runIds.add(activeRuntime.value.activeRunId);
  for (const message of historyPayload.value?.messages || []) {
    if (message.runId) runIds.add(message.runId);
  }
  for (const message of streamMessages.value) {
    if (message.runId) runIds.add(message.runId);
  }
  return [...runIds];
}

function suppressRunIds(runIds: string[]): void {
  for (const runId of runIds) suppressedRunIds.add(runId);
}

function unsuppressRunIds(runIds: string[]): void {
  for (const runId of runIds) suppressedRunIds.delete(runId);
}

function rememberToolObserved(runId: string | null): void {
  if (!runId) return;
  toolObservedRunIds.add(runId);
}

function consumeToolObserved(runId: string | null): boolean {
  if (!runId) return false;
  const had = toolObservedRunIds.has(runId);
  toolObservedRunIds.delete(runId);
  return had;
}

function applyRuntime(runtime: ChatRuntimeState): void {
  if (!selectedSession.value) return;
  syncSessionRow(selectedSession.value.key, { runtime });
  if (historyPayload.value?.session.key === selectedSession.value.key) {
    historyPayload.value = {
      ...historyPayload.value,
      runtime,
      session: {
        ...historyPayload.value.session,
        runtime,
      },
    };
  }
}

function createEmptyObservability(): ChatObservabilityState {
  return {
    lifecycle: null,
    toolCards: [],
    usage: null,
    timeline: [],
  };
}

function ensureObservabilityState(): ChatObservabilityState {
  const current = historyPayload.value?.observability;
  return current
    ? {
      lifecycle: current.lifecycle ? { ...current.lifecycle } : null,
      toolCards: current.toolCards.map((item) => ({ ...item })),
      usage: current.usage ? { ...current.usage } : null,
      timeline: current.timeline.map((item) => ({ ...item })),
    }
    : createEmptyObservability();
}

function applyObservability(next: ChatObservabilityState): void {
  if (!historyPayload.value || !selectedSession.value) return;
  historyPayload.value = {
    ...historyPayload.value,
    observability: next,
  };
}

function upsertToolCard(cards: ChatToolCard[], card: ChatToolCard): ChatToolCard[] {
  const next = cards.slice();
  const index = next.findIndex((item) => item.toolCallId === card.toolCallId);
  if (index === -1) next.unshift(card);
  else next[index] = { ...next[index], ...card };
  return next
    .sort((left, right) => (right.updatedAt || right.startedAt || '').localeCompare(left.updatedAt || left.startedAt || ''))
    .slice(0, 12);
}

function upsertTimelineItem(items: ChatActivityItem[], item: ChatActivityItem): ChatActivityItem[] {
  const next = items.slice();
  const index = next.findIndex((entry) => entry.id === item.id);
  if (index === -1) next.push(item);
  else next[index] = item;
  next.sort((left, right) => {
    const leftTs = Date.parse(left.emittedAt || '') || 0;
    const rightTs = Date.parse(right.emittedAt || '') || 0;
    if (leftTs !== rightTs) return leftTs - rightTs;
    return left.id.localeCompare(right.id);
  });
  return next.slice(-40);
}

function handleStreamEvent(event: ChatStreamEvent): void {
  if (event.runId && suppressedRunIds.has(event.runId) && event.kind !== 'ack') {
    return;
  }
  const isSelectedSession = selectedSession.value?.key === event.sessionKey;

  if (event.kind === 'ack') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    if (isSelectedSession) {
      applyRuntime(event.runtime);
      setNotice('success', text('消息已发送。', 'Message sent.'));
    }
    return;
  }

  if (event.kind === 'delta') {
    const currentRuntime = activeRuntime.value;
    const runtime = {
      ...(currentRuntime || {}),
      gatewayConnected: true,
      sessionWritable: Boolean(selectedSession.value?.permissions.writable),
      activeRunId: event.runId,
      state: 'streaming',
      lastEventAt: event.emittedAt,
      lastAckAt: currentRuntime?.lastAckAt || null,
      lastErrorCode: null,
      lastErrorMessage: null,
    } as ChatRuntimeState;
    syncSessionRow(event.sessionKey, { runtime });
    if (isSelectedSession) {
      applyRuntime(runtime);
      upsertStreamMessage({
        id: `stream-${event.runId}`,
        role: 'assistant',
        text: event.accumulatedText,
        createdAt: event.emittedAt,
        source: 'stream',
        runId: event.runId,
        truncated: false,
        omitted: false,
        aborted: false,
        stopReason: null,
      });
    }
    return;
  }

  if (event.kind === 'final') {
    syncSessionRow(event.sessionKey, {
      runtime: event.runtime,
      updatedAt: event.message.createdAt,
      lastMessagePreview: event.message.text.slice(0, 160),
    });
    if (isSelectedSession && historyPayload.value) {
      removeStreamRun(event.runId);
      historyPayload.value = {
        ...historyPayload.value,
        messages: [...historyPayload.value.messages, event.message],
        runtime: event.runtime,
        session: {
          ...historyPayload.value.session,
          runtime: event.runtime,
          updatedAt: event.message.createdAt,
          lastMessagePreview: event.message.text.slice(0, 160),
        },
      };
      if (event.usage) {
        const observability = ensureObservabilityState();
        observability.usage = event.usage;
        observability.timeline = upsertTimelineItem(observability.timeline, {
          id: `usage-${event.runId}`,
          kind: 'usage',
          runId: event.runId,
          toolCallId: null,
          emittedAt: event.emittedAt,
          title: text(`Usage · ${event.usage.totalTokens} tokens`, `Usage · ${event.usage.totalTokens} tokens`),
          detail: text(`输入 ${event.usage.inputTokens} / 输出 ${event.usage.outputTokens}`, `in ${event.usage.inputTokens} / out ${event.usage.outputTokens}`),
          level: 'info',
        });
        applyObservability(observability);
      }
      if (consumeToolObserved(event.runId) || !event.usage) {
        void loadHistory(event.sessionKey);
      }
    }
    return;
  }

  if (event.kind === 'aborted') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    if (isSelectedSession) {
      removeStreamRun(event.runId);
      if (event.partialMessage && historyPayload.value) {
        historyPayload.value = {
          ...historyPayload.value,
          messages: [...historyPayload.value.messages, event.partialMessage],
          runtime: event.runtime,
          session: {
            ...historyPayload.value.session,
            runtime: event.runtime,
          },
        };
      }
      applyRuntime(event.runtime);
      setNotice('success', text('当前运行已中止。', 'The current run has been aborted.'));
    }
    return;
  }

  if (event.kind === 'error') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    if (isSelectedSession) {
      removeStreamRun(event.runId);
      applyRuntime(event.runtime);
      setNotice('error', event.error.message);
    }
    return;
  }

  if (event.kind === 'runtime') {
    syncSessionRow(event.sessionKey, { runtime: event.runtime });
    if (isSelectedSession) applyRuntime(event.runtime);
    return;
  }

  if (!isSelectedSession) return;

  if (event.kind === 'agent_lifecycle') {
    const observability = ensureObservabilityState();
    observability.lifecycle = event.lifecycle;
    observability.timeline = upsertTimelineItem(observability.timeline, {
      id: `lifecycle-${event.runId || 'none'}-${event.lifecycle.phase}-${event.emittedAt}`,
      kind: 'lifecycle',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text(`Lifecycle · ${event.lifecycle.phase}`, `Lifecycle · ${event.lifecycle.phase}`),
      detail: event.lifecycle.errorMessage,
      level: event.lifecycle.phase === 'error' ? 'error' : event.lifecycle.phase === 'end' ? 'success' : 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_assistant') {
    const observability = ensureObservabilityState();
    observability.timeline = upsertTimelineItem(observability.timeline, {
      id: `assistant-${event.runId}`,
      kind: 'assistant',
      runId: event.runId,
      toolCallId: null,
      emittedAt: event.emittedAt,
      title: text('Assistant stream', 'Assistant stream'),
      detail: event.textPreview,
      level: 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_tool_call') {
    rememberToolObserved(event.runId);
    const observability = ensureObservabilityState();
    observability.toolCards = upsertToolCard(observability.toolCards, event.tool);
    observability.timeline = upsertTimelineItem(observability.timeline, {
      id: `tool-call-${event.tool.toolCallId}-${event.emittedAt}`,
      kind: 'tool_call',
      runId: event.runId,
      toolCallId: event.tool.toolCallId,
      emittedAt: event.emittedAt,
      title: text(`Tool start · ${event.tool.name}`, `Tool start · ${event.tool.name}`),
      detail: event.tool.argsPreview,
      level: 'info',
    });
    applyObservability(observability);
    return;
  }

  if (event.kind === 'agent_tool_result') {
    rememberToolObserved(event.runId);
    const observability = ensureObservabilityState();
    observability.toolCards = upsertToolCard(observability.toolCards, event.tool);
    if (!event.partial) {
      observability.timeline = upsertTimelineItem(observability.timeline, {
        id: `tool-result-${event.tool.toolCallId}-${event.emittedAt}`,
        kind: 'tool_result',
        runId: event.runId,
        toolCallId: event.tool.toolCallId,
        emittedAt: event.emittedAt,
        title: text(`Tool result · ${event.tool.name}`, `Tool result · ${event.tool.name}`),
        detail: event.tool.resultPreview,
        level: event.tool.isError ? 'error' : 'success',
      });
    }
    applyObservability(observability);
  }
}

function connectChatSocket(sessionKey: string): void {
  if (!isChatRealtimeEnabled()) {
    wsConnected.value = false;
    return;
  }
  if (
    chatSocket
    && chatSocketSessionKey === sessionKey
    && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
    wsConnected.value = false;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = getWebSocketBasePath();
  const wsPath = basePath ? `${basePath}/ws/chat` : '/ws/chat';
  const socket = new WebSocket(`${protocol}//${window.location.host}${wsPath}?sessionKey=${encodeURIComponent(sessionKey)}`);
  chatSocket = socket;
  chatSocketSessionKey = sessionKey;

  socket.onopen = () => {
    if (chatSocket !== socket) return;
    wsConnected.value = true;
  };
  socket.onclose = () => {
    if (chatSocket !== socket) return;
    wsConnected.value = false;
  };
  socket.onerror = () => {
    if (chatSocket !== socket) return;
    wsConnected.value = false;
  };
  socket.onmessage = (raw) => {
    if (chatSocket !== socket) return;
    try {
      handleStreamEvent(JSON.parse(String(raw.data)) as ChatStreamEvent);
    } catch (error) {
      setNotice('error', error instanceof Error ? error.message : text('无法解析 stream 事件。', 'Failed to parse stream event.'));
    }
  };
}

function forceCloseChatSocketForTest(): void {
  if (!chatSocket) return;
  try { chatSocket.close(); } catch {}
  chatSocket = null;
  chatSocketSessionKey = '';
  wsConnected.value = false;
}

async function loadAgents(): Promise<void> {
  agentsLoading.value = true;
  try {
    const payload = await fetchAgentsSummary();
    agentRows.value = payload.agents || [];
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('读取 Agent 失败。', 'Failed to load agents.');
  } finally {
    agentsLoading.value = false;
  }
}

async function loadHealth(): Promise<void> {
  try {
    chatHealth.value = await fetchChatHealth();
  } catch {
    // keep shell usable without health details
  }
}

async function loadSessions(): Promise<void> {
  const loadVersion = ++sessionsLoadVersion;
  sessionsLoading.value = true;
  try {
    const agents = agentRows.value.slice();
    const payloads = await Promise.all(
      agents.map(async (agent) => {
        try {
          return await fetchChatSessions(agent.id);
        } catch {
          return null;
        }
      }),
    );
    if (loadVersion !== sessionsLoadVersion) return;
    const merged = new Map<string, ChatSessionRow>();
    for (const payload of payloads) {
      if (!payload) continue;
      for (const session of payload.sessions || []) {
        const existing = merged.get(session.key);
        if (!existing || sortSessions(session, existing) < 0) {
          merged.set(session.key, session);
        }
      }
    }
    sessionRows.value = [...merged.values()].sort(sortSessions);
  } finally {
    if (loadVersion === sessionsLoadVersion) {
      sessionsLoading.value = false;
    }
  }
}

async function loadHistory(sessionKey: string): Promise<void> {
  const loadVersion = ++historyLoadVersion;
  historyLoading.value = true;
  historyErrorMessage.value = '';
  resetStreamState();
  try {
    const payload = await fetchChatHistory(sessionKey);
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) return;
    historyPayload.value = payload;
    rememberLastChatSessionKey(sessionKey);
    rememberLastChatAgentId(payload.session.agentId);
  } catch (error) {
    if (loadVersion !== historyLoadVersion || sessionKey !== selectedSessionKey.value) return;
    historyPayload.value = null;
    historyErrorMessage.value = error instanceof Error ? error.message : text('读取对话失败。', 'Failed to load conversation.');
  } finally {
    if (loadVersion === historyLoadVersion) {
      historyLoading.value = false;
    }
  }
}

function resolveFallbackSessionKey(): string {
  const candidates = inspectPinned.value ? [...studioManagedSessions.value, ...observedSessions.value] : studioManagedSessions.value;
  const stored = readLastChatSessionKey();
  if (stored && candidates.some((session) => session.key === stored)) return stored;
  return candidates[0]?.key || '';
}

function selectSessionKeyLocally(nextKey: string): void {
  selectedSessionKey.value = nextKey;
  if (nextKey) {
    rememberLastChatSessionKey(nextKey);
    rememberLastChatAgentId(deriveAgentIdFromChatSessionKey(nextKey));
  }
}

function buildChatRoute(sessionKey: string | null, mode: 'chat' | 'inspect' = props.shellMode): { path: string; query?: Record<string, string> } {
  if (mode === 'inspect') {
    const query: Record<string, string> = {};
    if (sessionKey) query.sessionRef = encodeChatSessionRef(sessionKey);
    return { path: '/chat/workbench', query };
  }
  if (route.path === '/chat') {
    return { path: '/chat' };
  }
  if (!sessionKey) return { path: '/chat' };
  return { path: `/chat/s/${encodeChatSessionRef(sessionKey)}` };
}

function openSession(sessionKey: string, mode: 'chat' | 'inspect' = props.shellMode): void {
  selectSessionKeyLocally(sessionKey);
  mobileSessionDrawerOpen.value = false;
  const target = buildChatRoute(sessionKey, mode);
  if (route.path === target.path && JSON.stringify(route.query) === JSON.stringify(target.query || {})) {
    return;
  }
  router.push(target);
}

function closeInspectRoute(): void {
  inspectorDrawerOpen.value = false;
  if (!inspectPinned.value) return;
  if (selectedSession.value?.kind === 'studio_managed') {
    router.push(buildChatRoute(selectedSession.value.key, 'chat'));
    return;
  }
  router.push('/chat');
}

function closeInspectorDrawer(): void {
  inspectorDrawerOpen.value = false;
}

function toggleInspectRoute(): void {
  if (inspectPinned.value) {
    if (inspectorDrawerOpen.value) {
      closeInspectorDrawer();
      return;
    }
    inspectorDrawerOpen.value = true;
    return;
  }
  if (selectedSession.value) {
    router.push(buildChatRoute(selectedSession.value.key, 'inspect'));
    return;
  }
  router.push('/chat/workbench');
}

function selectSessionFromMobile(sessionKey: string): void {
  mobileSessionDrawerOpen.value = false;
  openSession(sessionKey);
}

function openNewChatFromMobile(): void {
  mobileSessionDrawerOpen.value = false;
  newChatOpen.value = true;
}

function toggleInspectFromMobile(): void {
  mobileSessionDrawerOpen.value = false;
  toggleInspectRoute();
}

async function createSessionForAgent(agentId: string): Promise<void> {
  sessionCreating.value = true;
  clearNotice();
  try {
    const payload = await createChatSession(agentId, {});
    await loadSessions();
    newChatOpen.value = false;
    openSession(payload.session.key, 'chat');
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('创建会话失败。', 'Failed to create chat.'));
  } finally {
    sessionCreating.value = false;
  }
}

async function sendMessage(): Promise<void> {
  if (!selectedSession.value?.permissions.canSend || !composerDraft.value.trim() || accessError.value) return;
  sendBusy.value = true;
  clearNotice();
  try {
    const textValue = composerDraft.value.trim();
    const ack = await sendChatMessage(selectedSession.value.key, {
      text: textValue,
      clientRequestId: `ui-${Date.now()}`,
    });
    if (historyPayload.value) {
      historyPayload.value = {
        ...historyPayload.value,
        messages: [
          ...historyPayload.value.messages,
          {
            id: `ui-user-${ack.requestId}`,
            role: 'user',
            text: textValue,
            createdAt: new Date().toISOString(),
            source: 'history',
            runId: ack.runId,
            truncated: false,
            omitted: false,
            aborted: false,
            stopReason: null,
          },
        ],
      };
    }
    composerDraft.value = '';
    applyRuntime(ack.runtime);
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('发送失败。', 'Failed to send message.'));
  } finally {
    sendBusy.value = false;
  }
}

async function abortCurrentRun(): Promise<void> {
  if (!selectedSession.value?.permissions.canAbort || accessError.value) return;
  abortBusy.value = true;
  clearNotice();
  try {
    const payload = await abortChatRun(selectedSession.value.key);
    applyRuntime(payload.runtime);
    if (!payload.hadActiveRun) {
      setNotice('error', text('当前没有可中止的运行。', 'There is no active run to abort.'));
    }
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('停止失败。', 'Failed to stop the run.'));
  } finally {
    abortBusy.value = false;
  }
}

async function resetCurrentSession(): Promise<void> {
  if (!selectedSession.value?.permissions.canReset || accessError.value) return;
  const currentSession = selectedSession.value;
  const previousHistoryPayload = historyPayload.value
    ? JSON.parse(JSON.stringify(historyPayload.value)) as ChatHistoryPayload
    : null;
  const previousSessionRow = JSON.parse(JSON.stringify(currentSession)) as ChatSessionRow;
  const suppressedIds = collectCurrentRunIds();
  const now = new Date().toISOString();
  resetBusy.value = true;
  clearNotice();
  try {
    suppressRunIds(suppressedIds);
    const optimisticRuntime: ChatRuntimeState = {
      gatewayConnected: activeRuntime.value?.gatewayConnected ?? chatHealth.value?.gatewayReachable ?? false,
      sessionWritable: true,
      activeRunId: null,
      state: 'idle',
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    };
    syncSessionRow(currentSession.key, {
      updatedAt: now,
      lastMessagePreview: null,
      runtime: optimisticRuntime,
    });
    historyPayload.value = {
      checkedAt: now,
      session: {
        ...currentSession,
        updatedAt: now,
        lastMessagePreview: null,
        runtime: optimisticRuntime,
      },
      messages: [],
      overlays: [],
      runtime: optimisticRuntime,
      observability: createEmptyObservability(),
      diagnostics: historyPayload.value?.diagnostics || activeDiagnostics.value || {
        gatewayReachable: false,
        gatewayWsUrl: '',
        transport: 'studio_bff',
        authMode: 'studio_backend_token',
        rawGatewayFramesExposed: false,
        rawGatewayMethodsExposed: false,
        sameOriginRequired: true,
        historyTruncated: false,
        truncationMode: 'none',
        notes: [],
      },
      pageInfo: { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null },
      day: null,
    };
    resetStreamState();

    const payload = await resetChatSession(currentSession.key);
    syncSessionRow(payload.session.key, payload.session);
    historyPayload.value = {
      checkedAt: new Date().toISOString(),
      session: payload.session,
      messages: [],
      overlays: [],
      runtime: payload.runtime,
      observability: createEmptyObservability(),
      diagnostics: historyPayload.value?.diagnostics || activeDiagnostics.value || {
        gatewayReachable: false,
        gatewayWsUrl: '',
        transport: 'studio_bff',
        authMode: 'studio_backend_token',
        rawGatewayFramesExposed: false,
        rawGatewayMethodsExposed: false,
        sameOriginRequired: true,
        historyTruncated: false,
        truncationMode: 'none',
        notes: [],
      },
      pageInfo: { hasMoreBefore: false, beforeCursor: null, hasMoreAfter: false, afterCursor: null },
      day: null,
    };
    setNotice('success', text('Session 已重置。', 'Session reset.'));
  } catch (error) {
    unsuppressRunIds(suppressedIds);
    syncSessionRow(previousSessionRow.key, previousSessionRow);
    historyPayload.value = previousHistoryPayload;
    setNotice('error', error instanceof Error ? error.message : text('重置失败。', 'Failed to reset session.'));
  } finally {
    resetBusy.value = false;
  }
}

function handleSessionAction(payload: { action: 'rename' | 'archive' | 'delete'; sessionKey: string }): void {
  if (payload.action === 'rename') {
    setNotice('success', text('重命名入口已接入 UI，后端能力暂未开放。', 'Rename is now wired in UI; backend support is not available yet.'));
    return;
  }
  if (payload.action === 'archive') {
    setNotice('success', text('归档入口已接入 UI，后端能力暂未开放。', 'Archive is now wired in UI; backend support is not available yet.'));
    return;
  }
  setNotice('error', text('删除入口已接入 UI，当前阶段仍未连接后端删除接口。', 'Delete is now wired in UI, but backend deletion is not connected in this phase.'));
}

function handleComposerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
}

async function refreshAll(): Promise<void> {
  clearNotice();
  errorMessage.value = '';
  await Promise.all([loadAgents(), loadHealth()]);
  await loadSessions();
}

watch(
  [routeSessionKey, () => props.shellMode, studioManagedSessions, observedSessions],
  async () => {
    const requested = routeSessionKey.value;
    const available = inspectPinned.value
      ? [...studioManagedSessions.value, ...observedSessions.value]
      : studioManagedSessions.value;

    if (requested) {
      selectSessionKeyLocally(requested);
      return;
    }

    const fallback = resolveFallbackSessionKey();
    if (!selectedSessionKey.value || !available.some((session) => session.key === selectedSessionKey.value)) {
      selectedSessionKey.value = fallback;
    }
  },
  { immediate: true },
);

watch(selectedSessionKey, async (sessionKey, previousKey) => {
  if (!sessionKey) {
    historyPayload.value = null;
    historyErrorMessage.value = '';
    resetStreamState();
    if (chatSocket) {
      try { chatSocket.close(); } catch {}
      chatSocket = null;
      chatSocketSessionKey = '';
      wsConnected.value = false;
    }
    return;
  }
  if (sessionKey === previousKey && historyPayload.value?.session.key === sessionKey) return;
  await loadHistory(sessionKey);
  connectChatSocket(sessionKey);
});

watch(
  () => props.shellMode,
  () => {
    inspectorDrawerOpen.value = props.shellMode === 'inspect';
  },
  { immediate: true },
);

function handleGlobalKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    if (mobileSessionDrawerOpen.value) {
      mobileSessionDrawerOpen.value = false;
      return;
    }
    if (inspectPinned.value && inspectorDrawerOpen.value) {
      closeInspectorDrawer();
    }
  }
}

onMounted(async () => {
  if (typeof window !== 'undefined') {
    (window as Window & { __OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE?: () => void }).__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE = forceCloseChatSocketForTest;
    window.addEventListener('keydown', handleGlobalKeydown);
  }
  await refreshAll();
});

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    delete (window as Window & { __OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE?: () => void }).__OPENCLAW_STUDIO_CHAT_TEST_FORCE_WS_CLOSE;
    window.removeEventListener('keydown', handleGlobalKeydown);
  }
  if (chatSocket) {
    try { chatSocket.close(); } catch {}
    chatSocket = null;
    chatSocketSessionKey = '';
    wsConnected.value = false;
  }
});
</script>

<style scoped>
.chat-shell-page {
  --chat-bg: #f4f7fb;
  --chat-bg-soft: #edf3f9;
  --chat-page-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.82), rgba(245, 248, 252, 0.95));
  --chat-sidebar-bg: linear-gradient(180deg, rgba(248, 250, 253, 0.98), rgba(242, 246, 251, 0.99));
  --chat-panel-bg: linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(247, 249, 252, 1));
  --chat-panel-strong: rgba(255, 255, 255, 1);
  --chat-thread-bg: linear-gradient(180deg, rgba(250, 252, 255, 0.98), rgba(245, 248, 252, 1));
  --chat-surface-muted: rgba(236, 241, 247, 1);
  --chat-surface-elevated: rgba(255, 255, 255, 1);
  --chat-border: rgba(28, 46, 72, 0.16);
  --chat-border-strong: rgba(28, 46, 72, 0.24);
  --chat-shadow: 0 18px 48px rgba(41, 63, 94, 0.12);
  --chat-shadow-strong: 0 22px 56px rgba(32, 49, 73, 0.18);
  --chat-text: #132238;
  --chat-text-soft: #4f6580;
  --chat-accent: #2563eb;
  --chat-accent-soft: rgba(37, 99, 235, 0.12);
  --chat-user-bubble: linear-gradient(135deg, #2f6df6, #4c8eff);
  --chat-user-bubble-soft: #f7fbff;
  --chat-assistant-bubble: rgba(255, 255, 255, 0.96);
  --chat-system-bubble: rgba(242, 245, 249, 0.96);
  --chat-tool-running: rgba(59, 130, 246, 0.1);
  --chat-tool-success: rgba(16, 185, 129, 0.1);
  --chat-tool-error: rgba(239, 68, 68, 0.1);
  --chat-input-bg: rgba(255, 255, 255, 0.98);
  --chat-input-border: rgba(28, 46, 72, 0.12);
  --chat-input-shadow: 0 10px 32px rgba(26, 45, 71, 0.12);
  max-width: none;
  margin: 0;
  display: grid;
  gap: 14px;
  min-height: calc(100vh - 32px);
  padding: 4px 0 0;
  color: var(--chat-text);
}

:global(html:not([data-theme='light'])) .chat-shell-page {
  --chat-bg: #08111d;
  --chat-bg-soft: #0d1826;
  --chat-page-bg: linear-gradient(180deg, rgba(9, 16, 27, 0.98), rgba(7, 13, 22, 1));
  --chat-sidebar-bg: linear-gradient(180deg, rgba(8, 15, 24, 1), rgba(10, 18, 29, 1));
  --chat-panel-bg: linear-gradient(180deg, rgba(10, 18, 29, 1), rgba(8, 15, 25, 1));
  --chat-panel-strong: rgba(11, 19, 31, 1);
  --chat-thread-bg: linear-gradient(180deg, rgba(8, 15, 24, 1), rgba(7, 13, 22, 1));
  --chat-surface-muted: rgba(18, 29, 43, 1);
  --chat-surface-elevated: rgba(14, 24, 39, 1);
  --chat-border: rgba(255, 255, 255, 0.1);
  --chat-border-strong: rgba(255, 255, 255, 0.18);
  --chat-shadow: 0 18px 44px rgba(0, 0, 0, 0.34);
  --chat-shadow-strong: 0 24px 60px rgba(0, 0, 0, 0.42);
  --chat-text: #eef4ff;
  --chat-text-soft: #a8bad1;
  --chat-accent: #73a8ff;
  --chat-accent-soft: rgba(115, 168, 255, 0.14);
  --chat-user-bubble: linear-gradient(135deg, #2d68f0, #4f88ff);
  --chat-user-bubble-soft: #edf4ff;
  --chat-assistant-bubble: rgba(17, 29, 46, 0.98);
  --chat-system-bubble: rgba(19, 31, 48, 0.96);
  --chat-tool-running: rgba(115, 168, 255, 0.12);
  --chat-tool-success: rgba(74, 222, 128, 0.12);
  --chat-tool-error: rgba(248, 113, 113, 0.14);
  --chat-input-bg: rgba(11, 20, 33, 0.98);
  --chat-input-border: rgba(255, 255, 255, 0.08);
  --chat-input-shadow: 0 14px 36px rgba(0, 0, 0, 0.3);
}

.chat-shell-layout {
  display: grid;
  grid-template-columns: minmax(320px, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  min-height: calc(100vh - 64px);
  height: calc(100vh - 64px);
  overflow: hidden;
}

.chat-shell-sidebar,
.chat-shell-main {
  min-height: calc(100vh - 64px);
  height: calc(100vh - 64px);
}

.chat-shell-sidebar {
  position: sticky;
  top: 12px;
  display: flex;
  flex-direction: column;
  padding: 14px;
  border: 1px solid var(--chat-border);
  border-radius: 24px;
  background: var(--chat-sidebar-bg);
  box-shadow: var(--chat-shadow);
  overflow: hidden;
}

.chat-shell-main {
  min-width: 0;
}

.chat-shell-mobile-drawer {
  padding: 14px;
  background: var(--chat-sidebar-bg);
}

.chat-shell-inspector-sheet {
  position: fixed;
  top: 72px;
  right: 14px;
  bottom: 14px;
  z-index: 1250;
  width: min(400px, calc(100vw - 28px));
  overflow: auto;
  border: 1px solid var(--chat-border);
  border-radius: 22px;
  background: var(--chat-panel-strong);
  box-shadow: var(--chat-shadow-strong);
}

.chat-shell-page.inspect-mode .chat-shell-sidebar {
  border-color: var(--chat-border-strong);
}

.chat-shell-page :deep(.status-banner) {
  border: 1px solid var(--chat-border);
  border-radius: 14px;
  box-shadow: none;
}

@media (max-width: 980px) {
  .chat-shell-layout {
    grid-template-columns: 1fr;
    min-height: auto;
  }

  .chat-shell-sidebar {
    display: none;
  }

  .chat-shell-main,
  .chat-shell-sidebar {
    min-height: auto;
  }

  .chat-shell-inspector-sheet {
    top: auto;
    left: 8px;
    right: 8px;
    bottom: 8px;
    width: auto;
    border-radius: 18px;
  }
}
</style>
