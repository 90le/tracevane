import type {
  ChatMessageItem,
  ChatRunOverlay,
  ChatRuntimeState,
  ChatSessionRow,
} from '../../../../../types/chat.js';
import {
  areChatMessagesEquivalent,
  buildRunOverlayRecord,
  mergeCanonicalMessageLedger,
  mergeRuntimeOverlay,
  normalizeMessageLedger,
} from '../../../../../lib/chat-runtime-state.js';

const MESSAGE_WINDOW_MAX = 300;

export interface WindowEvictionResult {
  evictedTop: number;
  evictedBottom: number;
}

export interface ChatSessionAssistantPhase {
  id: string;
  kind: 'assistant';
  baseText: string;
  message: ChatMessageItem;
}

export interface ChatSessionProcessPhase {
  id: string;
  kind: 'process';
  overlay: ChatRunOverlay;
}

export type ChatSessionLivePhase = ChatSessionAssistantPhase | ChatSessionProcessPhase;

export interface ChatSessionTransientRunState {
  runId: string;
  phases: ChatSessionLivePhase[];
  activePhaseId: string | null;
  activePhaseKind: 'assistant' | 'process' | null;
  lastAccumulatedAssistantText: string;
  nextPhaseIndex: number;
}

export interface ChatSessionRuntimeMachineState {
  sessionKey: string | null;
  canonicalVersion: string | null;
  canonicalMessageLedger: ChatMessageItem[];
  transientRunState: Record<string, ChatSessionTransientRunState>;
  processLedger: Record<string, ChatRunOverlay>;
}

export interface ChatSessionRuntimeRenderModel {
  messages: ChatMessageItem[];
  overlays: ChatRunOverlay[];
}

export interface ChatRuntimeSummary {
  activeRuntime: ChatRuntimeState | null;
  conversationTitle: string;
  conversationSubtitle: string;
  gatewayWarning: string;
}

export interface ChatOverlaySummary {
  overlays: ChatRunOverlay[];
  overlayToolCallIds: string[];
}

function runtimeTimestamp(runtime: ChatRuntimeState | null | undefined): number {
  if (!runtime) {
    return 0;
  }
  return Math.max(
    Date.parse(runtime.lastEventAt || '') || 0,
    Date.parse(runtime.lastAckAt || '') || 0,
  );
}

function isRuntimeActive(runtime: ChatRuntimeState | null | undefined): boolean {
  if (!runtime) {
    return false;
  }
  return Boolean(runtime.activeRunId) || runtime.state === 'running' || runtime.state === 'streaming';
}

function pickPreferredRuntime(
  historyRuntime: ChatRuntimeState | null | undefined,
  sessionRuntime: ChatRuntimeState | null | undefined,
): ChatRuntimeState | null {
  if (!historyRuntime && !sessionRuntime) {
    return null;
  }
  if (!historyRuntime) {
    return sessionRuntime || null;
  }
  if (!sessionRuntime) {
    return historyRuntime;
  }

  const historyActive = isRuntimeActive(historyRuntime);
  const sessionActive = isRuntimeActive(sessionRuntime);
  if (historyActive !== sessionActive) {
    return sessionActive ? sessionRuntime : historyRuntime;
  }

  const historyTs = runtimeTimestamp(historyRuntime);
  const sessionTs = runtimeTimestamp(sessionRuntime);
  if (historyTs !== sessionTs) {
    return sessionTs > historyTs ? sessionRuntime : historyRuntime;
  }

  return sessionRuntime;
}

export function buildChatRuntimeSummary(params: {
  historyRuntime: ChatRuntimeState | null | undefined;
  sessionRuntime: ChatRuntimeState | null | undefined;
  selectedSession: ChatSessionRow | null;
  selectedSessionTitle: string;
  agentName: string;
  chatRealtimeEnabled: boolean;
  gatewayReachable: boolean | null | undefined;
  wsConnected: boolean;
  text: (chinese: string, english: string) => string;
}): ChatRuntimeSummary {
  const activeRuntime = pickPreferredRuntime(params.historyRuntime, params.sessionRuntime);
  const conversationTitle = params.selectedSession
    ? params.selectedSessionTitle
    : params.text('开始聊天', 'Start chatting');
  const conversationSubtitle = !params.selectedSession
    ? params.text(
      '左侧始终保留你的会话列表；点击“新建会话”后再选择 Agent。',
      'Your chat list always stays on the left; choose an agent only when you start a new chat.',
    )
    : params.selectedSession.permissions.writable
      ? params.text(`正在和 ${params.agentName} 对话`, `Chatting with ${params.agentName}`)
      : params.text(`只读观察 · ${params.agentName}`, `Read-only · ${params.agentName}`);

  let gatewayWarning = '';
  if (!params.chatRealtimeEnabled && params.selectedSession?.permissions.writable) {
    gatewayWarning = params.text(
      '当前部署模式已挂到 Gateway，但聊天实时链路还未启用。历史和 HTTP 操作可用，实时消息流暂不可用。',
      'This deployment is mounted behind the Gateway, but chat realtime is not enabled yet. History and HTTP actions still work, but the live stream is unavailable.',
    );
  } else if (params.gatewayReachable === false) {
    gatewayWarning = params.text(
      '当前 Gateway 不可达，历史仍可读，但新的会话操作可能失败。',
      'The Gateway is unreachable. History remains readable, but new session actions may fail.',
    );
  } else if (!params.wsConnected && params.selectedSession?.permissions.writable) {
    gatewayWarning = params.text(
      '实时连接正在恢复，消息和工具过程可能短暂延迟。',
      'Realtime connection is recovering. Messages and tool progress may briefly lag.',
    );
  }

  return {
    activeRuntime,
    conversationTitle,
    conversationSubtitle,
    gatewayWarning,
  };
}

export function buildChatOverlaySummary(params: {
  overlays: ChatRunOverlay[];
}): ChatOverlaySummary {
  return {
    overlays: params.overlays,
    overlayToolCallIds: params.overlays
      .flatMap((overlay) => (
        overlay.toolCalls.map((toolCall) => toolCall.toolCallId).filter(Boolean)
      )),
  };
}

function cloneTransientRunState(
  state: ChatSessionRuntimeMachineState['transientRunState'],
): ChatSessionRuntimeMachineState['transientRunState'] {
  return Object.fromEntries(
    Object.entries(state).map(([runId, value]) => [
      runId,
      {
        runId: value.runId,
        phases: value.phases.map((phase) => (
          phase.kind === 'assistant'
            ? {
              ...phase,
              message: { ...phase.message },
            }
            : {
              ...phase,
              overlay: { ...phase.overlay, toolCalls: phase.overlay.toolCalls.map((item) => ({ ...item })) },
            }
        )),
        activePhaseId: value.activePhaseId,
        activePhaseKind: value.activePhaseKind,
        lastAccumulatedAssistantText: value.lastAccumulatedAssistantText,
        nextPhaseIndex: value.nextPhaseIndex,
      },
    ]),
  );
}

function overlaySort(left: ChatRunOverlay, right: ChatRunOverlay): number {
  const sequenceDelta = (left.sequence || 0) - (right.sequence || 0);
  if (sequenceDelta !== 0) {
    return sequenceDelta;
  }
  return String(left.startedAt || '').localeCompare(String(right.startedAt || ''));
}

function isTerminalOverlayLifecycle(lifecycle: ChatRunOverlay['lifecycle'] | null | undefined): boolean {
  return lifecycle === 'completed' || lifecycle === 'aborted' || lifecycle === 'error';
}

function isTerminalToolStatus(
  status: ChatRunOverlay['toolCalls'][number]['status'] | null | undefined,
): boolean {
  return status === 'completed' || status === 'error';
}

function isSettledOverlay(overlay: ChatRunOverlay | null | undefined): boolean {
  if (!overlay || !isTerminalOverlayLifecycle(overlay.lifecycle)) {
    return false;
  }
  if (overlay.lifecycle === 'completed') {
    return !overlay.toolCalls.length || overlay.toolCalls.every((toolCall) => isTerminalToolStatus(toolCall.status));
  }
  return true;
}

function isAssistantPhase(phase: ChatSessionLivePhase): phase is ChatSessionAssistantPhase {
  return phase.kind === 'assistant';
}

function isProcessPhase(phase: ChatSessionLivePhase): phase is ChatSessionProcessPhase {
  return phase.kind === 'process';
}

function canonicalAssistantMatchesPhase(
  phase: ChatSessionAssistantPhase,
  message: ChatMessageItem,
): boolean {
  if (areChatMessagesEquivalent(phase.message, message)) {
    return true;
  }
  if (!phase.baseText || !phase.message.text || !message.text) {
    return false;
  }
  return `${phase.baseText}${phase.message.text}` === message.text;
}

function buildFallbackAssistantDraft(params: {
  id?: string;
  runId: string;
  text: string;
  emittedAt: string;
}): ChatMessageItem | null {
  const normalizedText = String(params.text || '');
  if (!normalizedText.trim()) {
    return null;
  }
  return {
    id: params.id || `stream-${params.runId}`,
    role: 'assistant',
    text: normalizedText,
    createdAt: params.emittedAt,
    source: 'stream',
    runId: params.runId,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
  };
}

function createTransientRunState(runId: string): ChatSessionTransientRunState {
  return {
    runId,
    phases: [],
    activePhaseId: null,
    activePhaseKind: null,
    lastAccumulatedAssistantText: '',
    nextPhaseIndex: 0,
  };
}

function removeTransientRunStateByTerminalOverlays(
  transient: ChatSessionRuntimeMachineState['transientRunState'],
  overlays: ChatRunOverlay[],
): ChatSessionRuntimeMachineState['transientRunState'] {
  const terminalRunIds = new Set(
    overlays
      .filter((overlay) => isSettledOverlay(overlay))
      .map((overlay) => overlay.runId)
      .filter(Boolean),
  );
  if (!terminalRunIds.size) {
    return transient;
  }
  const cloned = cloneTransientRunState(transient);
  for (const runId of terminalRunIds) {
    delete cloned[runId];
  }
  return cloned;
}

function nextPhaseId(state: ChatSessionTransientRunState, kind: 'assistant' | 'process'): string {
  return `${state.runId}:${kind}:${state.nextPhaseIndex + 1}`;
}

function ensureTransientRunState(
  state: ChatSessionRuntimeMachineState,
  runId: string,
): {
  nextState: ChatSessionRuntimeMachineState;
  transient: ChatSessionTransientRunState;
} {
  const cloned = cloneTransientRunState(state.transientRunState);
  const transient = cloned[runId] || createTransientRunState(runId);
  cloned[runId] = transient;
  return {
    nextState: {
      ...state,
      transientRunState: cloned,
    },
    transient,
  };
}

function assistantPhaseText(params: {
  transient: ChatSessionTransientRunState;
  fullText: string;
  deltaText?: string | null;
  baseText: string;
}): string {
  const normalizedFullText = String(params.fullText || '');
  if (normalizedFullText && params.baseText && normalizedFullText.startsWith(params.baseText)) {
    return normalizedFullText.slice(params.baseText.length);
  }
  if (normalizedFullText && !params.baseText) {
    return normalizedFullText;
  }
  return String(params.deltaText || '');
}

function upsertAssistantPhase(params: {
  transient: ChatSessionTransientRunState;
  emittedAt: string;
  fullText: string;
  deltaText?: string | null;
  message?: ChatMessageItem | null;
}): void {
  const phase = params.transient.activePhaseKind === 'assistant'
    ? params.transient.phases.find((entry): entry is ChatSessionAssistantPhase => (
      entry.id === params.transient.activePhaseId && isAssistantPhase(entry)
    )) || null
    : null;

  if (!phase) {
    const id = nextPhaseId(params.transient, 'assistant');
    const baseText = params.transient.lastAccumulatedAssistantText;
    const phaseText = assistantPhaseText({
      transient: params.transient,
      fullText: params.fullText,
      deltaText: params.deltaText,
      baseText,
    });
    const message = params.message
      ? {
        ...params.message,
        id,
        createdAt: params.emittedAt,
        source: 'stream' as const,
        runId: params.transient.runId,
        text: phaseText || params.message.text || '',
      }
      : buildFallbackAssistantDraft({
        id,
        runId: params.transient.runId,
        text: phaseText,
        emittedAt: params.emittedAt,
      });
    if (!message) {
      params.transient.lastAccumulatedAssistantText = params.fullText || params.transient.lastAccumulatedAssistantText;
      return;
    }
    params.transient.phases.push({
      id,
      kind: 'assistant',
      baseText,
      message,
    });
    params.transient.activePhaseId = id;
    params.transient.activePhaseKind = 'assistant';
    params.transient.nextPhaseIndex += 1;
    params.transient.lastAccumulatedAssistantText = params.fullText || params.transient.lastAccumulatedAssistantText;
    return;
  }

  const nextText = assistantPhaseText({
    transient: params.transient,
    fullText: params.fullText,
    deltaText: params.deltaText,
    baseText: phase.baseText,
  });
  phase.message = params.message
    ? {
      ...phase.message,
      ...params.message,
      id: phase.id,
      createdAt: phase.message.createdAt || params.emittedAt,
      source: 'stream' as const,
      runId: params.transient.runId,
      text: nextText || params.message.text || phase.message.text,
    } satisfies ChatMessageItem
    : {
      ...phase.message,
      text: nextText || phase.message.text,
    } satisfies ChatMessageItem;
  params.transient.lastAccumulatedAssistantText = params.fullText || params.transient.lastAccumulatedAssistantText;
}

function createProcessOverlay(params: {
  runId: string;
  phaseId: string;
  emittedAt: string;
  overlay?: ChatRunOverlay;
  toolCall?: ChatRunOverlay['toolCalls'][number];
}): ChatRunOverlay {
  if (params.overlay) {
    return {
      ...params.overlay,
      runId: params.phaseId,
      startedAt: params.overlay.firstToolStartedAt || params.overlay.startedAt || params.emittedAt,
      updatedAt: params.overlay.updatedAt || params.emittedAt,
      finalMessageId: null,
      finalCreatedAt: null,
      firstAssistantSeenAt: null,
      sequence: params.overlay.sequence || 0,
    };
  }
  return {
    runId: params.phaseId,
    startedAt: params.toolCall?.startedAt || params.emittedAt,
    updatedAt: params.toolCall?.updatedAt || params.emittedAt,
    lifecycle: params.toolCall?.status === 'completed'
      ? 'completed'
      : params.toolCall?.status === 'error'
        ? 'error'
        : 'running',
    previewText: '',
    toolCalls: params.toolCall ? [{ ...params.toolCall }] : [],
    finalMessageId: null,
    finalCreatedAt: null,
    firstAssistantSeenAt: null,
    firstToolStartedAt: params.toolCall?.startedAt || params.emittedAt,
    sequence: parseInt(String(Date.parse(params.toolCall?.startedAt || params.emittedAt) || 0), 10),
  };
}

function upsertProcessPhase(params: {
  transient: ChatSessionTransientRunState;
  emittedAt: string;
  overlay?: ChatRunOverlay;
  toolCall?: ChatRunOverlay['toolCalls'][number];
}): void {
  const phase = params.transient.activePhaseKind === 'process'
    ? params.transient.phases.find((entry): entry is ChatSessionProcessPhase => (
      entry.id === params.transient.activePhaseId && isProcessPhase(entry)
    )) || null
    : null;
  if (!phase) {
    const id = nextPhaseId(params.transient, 'process');
    params.transient.phases.push({
      id,
      kind: 'process',
      overlay: createProcessOverlay({
        runId: params.transient.runId,
        phaseId: id,
        emittedAt: params.emittedAt,
        overlay: params.overlay,
        toolCall: params.toolCall,
      }),
    });
    params.transient.activePhaseId = id;
    params.transient.activePhaseKind = 'process';
    params.transient.nextPhaseIndex += 1;
    return;
  }
  phase.overlay = params.overlay
    ? mergeRuntimeOverlay(phase.overlay, {
      ...params.overlay,
      runId: phase.id,
      finalMessageId: null,
      finalCreatedAt: null,
      firstAssistantSeenAt: null,
    })
    : mergeRuntimeOverlay(phase.overlay, createProcessOverlay({
      runId: params.transient.runId,
      phaseId: phase.id,
      emittedAt: params.emittedAt,
      toolCall: params.toolCall,
    }));
}

export function createEmptyChatSessionRuntimeMachineState(
  sessionKey: string | null = null,
): ChatSessionRuntimeMachineState {
  return {
    sessionKey,
    canonicalVersion: null,
    canonicalMessageLedger: [],
    transientRunState: {},
    processLedger: {},
  };
}

export function resetChatSessionRuntimeMachine(
  sessionKey: string | null = null,
): ChatSessionRuntimeMachineState {
  return createEmptyChatSessionRuntimeMachineState(sessionKey);
}

export function replaceChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  messages: ChatMessageItem[],
  options: {
    preserveLocalMessages?: boolean;
  } = {},
): ChatSessionRuntimeMachineState {
  return {
    ...state,
    canonicalMessageLedger: mergeCanonicalMessageLedger(
      state.canonicalMessageLedger,
      messages,
      'replace',
      options,
    ),
    transientRunState: {},
  };
}

export function syncChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  messages: ChatMessageItem[],
  options: {
    preserveLocalMessages?: boolean;
  } = {},
): ChatSessionRuntimeMachineState {
  return {
    ...state,
    canonicalMessageLedger: mergeCanonicalMessageLedger(
      state.canonicalMessageLedger,
      messages,
      'replace',
      options,
    ),
  };
}

export function prependChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  messages: ChatMessageItem[],
): { state: ChatSessionRuntimeMachineState; eviction: WindowEvictionResult } {
  const merged = mergeCanonicalMessageLedger(
    state.canonicalMessageLedger,
    messages,
    'prepend',
  );
  const nextState: ChatSessionRuntimeMachineState = {
    ...state,
    canonicalMessageLedger: merged,
  };
  const eviction = windowChatSessionCanonicalMessageLedger(nextState, 'prepend');
  return { state: nextState, eviction };
}

export function appendChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  messages: ChatMessageItem[],
  overlays: ChatRunOverlay[],
): { state: ChatSessionRuntimeMachineState; eviction: WindowEvictionResult } {
  const merged = mergeCanonicalMessageLedger(
    state.canonicalMessageLedger,
    messages,
    'append',
  );
  const nextProcessLedger = overlays.length
    ? { ...state.processLedger, ...buildRunOverlayRecord(overlays) }
    : state.processLedger;
  const nextState: ChatSessionRuntimeMachineState = {
    ...state,
    canonicalMessageLedger: merged,
    processLedger: nextProcessLedger,
  };
  const eviction = windowChatSessionCanonicalMessageLedger(nextState, 'append');
  return { state: nextState, eviction };
}

export function anchorChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  messages: ChatMessageItem[],
  overlays: ChatRunOverlay[],
): ChatSessionRuntimeMachineState {
  return {
    ...state,
    canonicalMessageLedger: mergeCanonicalMessageLedger(
      state.canonicalMessageLedger,
      messages,
      'replace',
    ),
    processLedger: overlays.length
      ? { ...state.processLedger, ...buildRunOverlayRecord(overlays) }
      : state.processLedger,
    transientRunState: {},
  };
}

export function windowChatSessionCanonicalMessageLedger(
  state: ChatSessionRuntimeMachineState,
  direction: 'prepend' | 'append',
): WindowEvictionResult {
  const ledger = state.canonicalMessageLedger;
  const result: WindowEvictionResult = { evictedTop: 0, evictedBottom: 0 };

  if (ledger.length <= MESSAGE_WINDOW_MAX) {
    return result;
  }

  const excess = ledger.length - MESSAGE_WINDOW_MAX;

  // Collect runIds that are currently streaming (in transientRunState)
  // so we never evict messages belonging to an active stream.
  const activeRunIds = new Set(Object.keys(state.transientRunState));

  if (direction === 'append') {
    // Evict from the top (oldest messages)
    let evicted = 0;
    while (evicted < excess) {
      const msg = ledger[evicted];
      if (msg?.runId && activeRunIds.has(msg.runId)) break;
      evicted++;
    }
    if (evicted > 0) {
      state.canonicalMessageLedger = ledger.slice(evicted);
      result.evictedTop = evicted;
    }
  } else {
    // Evict from the bottom (newest messages)
    let evicted = 0;
    while (evicted < excess) {
      const msg = ledger[ledger.length - 1 - evicted];
      if (msg?.runId && activeRunIds.has(msg.runId)) break;
      evicted++;
    }
    if (evicted > 0) {
      state.canonicalMessageLedger = ledger.slice(0, ledger.length - evicted);
      result.evictedBottom = evicted;
    }
  }

  return result;
}

export function injectChatSessionOptimisticMessage(
  state: ChatSessionRuntimeMachineState,
  message: ChatMessageItem,
): ChatSessionRuntimeMachineState {
  return {
    ...state,
    canonicalMessageLedger: mergeCanonicalMessageLedger(
      state.canonicalMessageLedger,
      [{
        ...message,
        source: 'inject',
      }],
      'append',
    ),
  };
}

export function replaceChatSessionProcessLedger(
  state: ChatSessionRuntimeMachineState,
  overlays: ChatRunOverlay[],
): ChatSessionRuntimeMachineState {
  return {
    ...state,
    transientRunState: removeTransientRunStateByTerminalOverlays(state.transientRunState, overlays),
    processLedger: buildRunOverlayRecord(overlays),
  };
}

export function upsertChatSessionProcessLedgerOverlay(
  state: ChatSessionRuntimeMachineState,
  overlay: ChatRunOverlay,
): ChatSessionRuntimeMachineState {
  const current = state.processLedger[overlay.runId];
  const merged = mergeRuntimeOverlay(current, overlay);
  const nextTransient = isSettledOverlay(merged)
    ? removeTransientRunStateByTerminalOverlays(state.transientRunState, [merged])
    : state.transientRunState;
  return {
    ...state,
    transientRunState: nextTransient,
    processLedger: {
      ...state.processLedger,
      [overlay.runId]: merged,
    },
  };
}

export function applyChatSessionDeltaEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    accumulatedText: string;
    emittedAt: string;
    textDelta?: string | null;
    message?: ChatMessageItem | null;
  },
): ChatSessionRuntimeMachineState {
  const canonicalAssistantDraft = params.message
    ? {
      ...params.message,
      source: 'stream' as const,
      runId: params.runId,
      createdAt: params.emittedAt,
      text: params.accumulatedText || params.message.text || '',
    }
    : buildFallbackAssistantDraft({
      runId: params.runId,
      text: params.accumulatedText,
      emittedAt: params.emittedAt,
    });
  if (canonicalAssistantDraft && state.canonicalMessageLedger.some((message) => (
    message.role === 'assistant'
    && areChatMessagesEquivalent(canonicalAssistantDraft, message)
  ))) {
    return state;
  }
  const { nextState, transient } = ensureTransientRunState(state, params.runId);
  upsertAssistantPhase({
    transient,
    emittedAt: params.emittedAt,
    fullText: params.accumulatedText,
    deltaText: params.textDelta,
    message: params.message,
  });
  return nextState;
}

export function applyChatSessionTemporaryAssistantEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    emittedAt: string;
    textDelta: string;
    accumulatedText: string;
  },
): ChatSessionRuntimeMachineState {
  return applyChatSessionDeltaEvent(state, {
    runId: params.runId,
    emittedAt: params.emittedAt,
    textDelta: params.textDelta,
    accumulatedText: params.accumulatedText,
  });
}

export function applyChatSessionFinalEvent(
  state: ChatSessionRuntimeMachineState,
  message: ChatMessageItem,
): ChatSessionRuntimeMachineState {
  const nextTransient = cloneTransientRunState(state.transientRunState);
  if (message.runId) {
    delete nextTransient[message.runId];
  }
  return {
    ...state,
    canonicalMessageLedger: mergeCanonicalMessageLedger(
      state.canonicalMessageLedger,
      [message],
      'append',
    ),
    transientRunState: nextTransient,
  };
}

function removeTransientRunStateByCanonical(
  transient: ChatSessionRuntimeMachineState['transientRunState'],
  canonicalMessages: ChatMessageItem[],
): ChatSessionRuntimeMachineState['transientRunState'] {
  const canonicalAssistants = canonicalMessages.filter((message) => message.role === 'assistant');
  if (!canonicalAssistants.length) {
    return transient;
  }
  const cloned = cloneTransientRunState(transient);
  const nextEntries = Object.entries(cloned).flatMap(([runId, state]) => {
    if (canonicalAssistants.some((message) => message.runId && message.runId === runId)) {
      return [];
    }

    let lastMatchedAssistantIndex = -1;
    for (let index = 0; index < state.phases.length; index += 1) {
      const phase = state.phases[index];
      if (!phase || !isAssistantPhase(phase)) {
        continue;
      }
      if (canonicalAssistants.some((message) => canonicalAssistantMatchesPhase(phase, message))) {
        lastMatchedAssistantIndex = index;
      }
    }

    if (lastMatchedAssistantIndex < 0) {
      return [[runId, state] as const];
    }

    const remainingPhases = state.phases.slice(lastMatchedAssistantIndex + 1);
    if (!remainingPhases.length) {
      return [];
    }

    const activePhase = remainingPhases.find((phase) => phase.id === state.activePhaseId)
      || remainingPhases[remainingPhases.length - 1]
      || null;

    return [[runId, {
      ...state,
      phases: remainingPhases,
      activePhaseId: activePhase?.id || null,
      activePhaseKind: activePhase?.kind || null,
    }] as const];
  });
  return Object.fromEntries(nextEntries);
}

export function applyChatSessionCanonicalSnapshotEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    version: string;
    messages: ChatMessageItem[];
    overlays: ChatRunOverlay[];
  },
): ChatSessionRuntimeMachineState {
  const canonicalMessageLedger = mergeCanonicalMessageLedger(
    state.canonicalMessageLedger,
    params.messages,
    'replace',
    { preserveLocalMessages: true },
  );
  return {
    ...state,
    canonicalVersion: params.version,
    canonicalMessageLedger,
    transientRunState: removeTransientRunStateByTerminalOverlays(
      removeTransientRunStateByCanonical(state.transientRunState, canonicalMessageLedger),
      params.overlays,
    ),
    processLedger: buildRunOverlayRecord(params.overlays),
  };
}

export function applyChatSessionCanonicalMessageEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    version: string;
    message: ChatMessageItem;
    messageId: string;
    messageSeq: number;
  },
): ChatSessionRuntimeMachineState {
  const canonicalMessageLedger = mergeCanonicalMessageLedger(
    state.canonicalMessageLedger,
    [params.message],
    'append',
  );
  const nextTransient = cloneTransientRunState(state.transientRunState);
  if (params.message.runId) {
    delete nextTransient[params.message.runId];
  }
  return {
    ...state,
    canonicalVersion: params.version,
    canonicalMessageLedger,
    transientRunState: removeTransientRunStateByCanonical(nextTransient, canonicalMessageLedger),
  };
}

export function applyChatSessionAbortedEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    partialMessage?: ChatMessageItem | null;
  },
): ChatSessionRuntimeMachineState {
  const nextTransient = cloneTransientRunState(state.transientRunState);
  delete nextTransient[params.runId];
  return {
    ...state,
    canonicalMessageLedger: params.partialMessage
      ? mergeCanonicalMessageLedger(state.canonicalMessageLedger, [params.partialMessage], 'append')
      : state.canonicalMessageLedger,
    transientRunState: nextTransient,
  };
}

export function clearChatSessionTransientRun(
  state: ChatSessionRuntimeMachineState,
  runId: string,
): ChatSessionRuntimeMachineState {
  if (!runId || !state.transientRunState[runId]) {
    return state;
  }
  const nextTransient = cloneTransientRunState(state.transientRunState);
  delete nextTransient[runId];
  return {
    ...state,
    transientRunState: nextTransient,
  };
}

export function applyChatSessionAgentAssistantEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    emittedAt: string;
    text: string;
    deltaText?: string | null;
  },
): ChatSessionRuntimeMachineState {
  return applyChatSessionDeltaEvent(state, {
    runId: params.runId,
    emittedAt: params.emittedAt,
    accumulatedText: params.text,
    textDelta: params.deltaText,
  });
}

export function applyChatSessionToolEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    emittedAt: string;
    tool: ChatRunOverlay['toolCalls'][number];
  },
): ChatSessionRuntimeMachineState {
  const authoritativeOverlay = state.processLedger[params.runId];
  if (authoritativeOverlay) {
    if (isSettledOverlay(authoritativeOverlay)) {
      return state;
    }
    const authoritativeTool = authoritativeOverlay.toolCalls.find((item) => item.toolCallId === params.tool.toolCallId);
    if (authoritativeTool && isTerminalToolStatus(authoritativeTool.status)) {
      return state;
    }
  }
  const { nextState, transient } = ensureTransientRunState(state, params.runId);
  upsertProcessPhase({
    transient,
    emittedAt: params.emittedAt,
    toolCall: params.tool,
  });
  return nextState;
}

export function applyChatSessionTemporaryToolEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    emittedAt: string;
    partial: boolean;
    tool: ChatRunOverlay['toolCalls'][number];
  },
): ChatSessionRuntimeMachineState {
  return applyChatSessionToolEvent(state, {
    runId: params.runId,
    emittedAt: params.emittedAt,
    tool: params.tool,
  });
}

export function applyChatSessionLiveOverlayEvent(
  state: ChatSessionRuntimeMachineState,
  params: {
    runId: string;
    emittedAt: string;
    overlay: ChatRunOverlay;
    terminal?: boolean;
  },
): ChatSessionRuntimeMachineState {
  if (params.terminal && !state.transientRunState[params.runId]) {
    return state;
  }
  const { nextState, transient } = ensureTransientRunState(state, params.runId);
  upsertProcessPhase({
    transient,
    emittedAt: params.emittedAt,
    overlay: params.overlay,
  });
  return nextState;
}

export function listChatSessionRuntimeRunIds(state: ChatSessionRuntimeMachineState): string[] {
  const runIds = new Set<string>();
  for (const message of state.canonicalMessageLedger) {
    if (message.runId) {
      runIds.add(message.runId);
    }
  }
  for (const runId of Object.keys(state.transientRunState)) {
    if (runId) {
      runIds.add(runId);
    }
  }
  for (const overlay of Object.values(state.processLedger)) {
    if (overlay.runId) {
      runIds.add(overlay.runId);
    }
  }
  return [...runIds];
}

export function buildChatSessionRuntimeRenderModel(
  state: ChatSessionRuntimeMachineState,
): ChatSessionRuntimeRenderModel {
  const transientRunIds = new Set(Object.keys(state.transientRunState));
  const canonicalToolCallIds = new Set(
    state.canonicalMessageLedger
      .flatMap((message) => (message.toolCalls || []).map((toolCall) => toolCall.toolCallId))
      .filter(Boolean),
  );
  const draftMessages: ChatMessageItem[] = [];
  const liveProcessOverlays: ChatRunOverlay[] = [];
  for (const transient of Object.values(state.transientRunState)) {
    for (const phase of transient.phases) {
      if (phase.kind === 'assistant') {
        draftMessages.push({ ...phase.message });
      } else {
        liveProcessOverlays.push({
          ...phase.overlay,
          toolCalls: phase.overlay.toolCalls.map((item) => ({ ...item })),
        });
      }
    }
  }
  return {
    messages: normalizeMessageLedger([
      ...state.canonicalMessageLedger,
      ...draftMessages,
    ]),
    overlays: [
      ...Object.values(state.processLedger).filter((overlay) => (
        !transientRunIds.has(overlay.runId)
        && !overlay.toolCalls.every((toolCall) => canonicalToolCallIds.has(toolCall.toolCallId))
      )),
      ...liveProcessOverlays.filter((overlay) => (
        !overlay.toolCalls.every((toolCall) => canonicalToolCallIds.has(toolCall.toolCallId))
      )),
    ].sort(overlaySort),
  };
}
