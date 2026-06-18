<template>
  <section
    class="terminal-console-surface"
    :class="{ 'terminal-console-surface-embedded': props.embedded }"
    data-testid="terminal-console-surface"
    data-context-policy="none"
  >
    <section class="terminal-console-main">
      <div
        class="terminal-console-frame"
        :aria-label="terminalConsoleFrameLabel"
        :title="terminalConsoleFrameLabel"
      >
        <div ref="termContainer" class="terminal-container"></div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { IDisposable, ITheme, Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  TerminalGatewayAckResponse,
  TerminalGatewayAttachResponse,
  TerminalGatewayEvent,
} from '../../../../../types/terminal';
import {
  TRACEVANE_TERMINAL_GATEWAY_EVENT,
  TRACEVANE_TERMINAL_GATEWAY_METHODS,
} from '../../../../../types/terminal';
import { useLocalePreference } from '../../shared/locale';
import { getWebSocketBasePath, resolveTracevaneGatewayClientAuth } from '../../shared/api';
import { GatewayBrowserClient, type GatewayEventFrame } from '../../shared/gateway-client';
import {
  getTracevaneRealtimeTransport,
  getTracevaneTerminalDirectWebSocketUrl,
  isTerminalRealtimeEnabled,
} from '../../shared/runtime-config';
import {
  buildTerminalStreamUrl,
  fetchPersistedTerminalSessionLedger,
} from './api';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import { buildTerminalSessionReplayTranscript } from './terminal-session-history';
import {
  buildTerminalSocketUrl,
  resolveTerminalTransportPlan,
} from './terminal-transport';
import {
  isResizeTerminalControlPayload,
  parseTerminalControlPayloads,
} from './terminal-control-payload';
import {
  readPendingTerminalLaunchMetadata,
  removePendingTerminalLaunchMetadata,
} from './terminal-launch-metadata';
import './terminal-workspace.css';
import type { TerminalQueuedCommand } from './terminal-workspace-state';

const props = withDefaults(defineProps<{
  sessionId?: string;
  queuedCommand?: TerminalQueuedCommand | null;
  sessionDescriptor?: TerminalSessionDescriptor | null;
  embedded?: boolean;
  restoreTranscript?: boolean;
  terminalTheme?: string;
}>(), {
  sessionId: '',
  queuedCommand: null,
  sessionDescriptor: null,
  embedded: false,
  restoreTranscript: true,
  terminalTheme: 'default',
});

const route = useRoute();
const { text } = useLocalePreference();

const emit = defineEmits<{
  (e: 'consumeQueuedCommand'): void;
  (e: 'sessionAttached', session: TerminalSessionDescriptor): void;
}>();

const termContainer = ref<HTMLElement | null>(null);
const connected = ref(false);
const terminalFocused = ref(false);
const terminalProgress = ref<{ state: 'running' | 'error' | 'paused' | 'indeterminate'; value: number | null } | null>(null);
const terminalStatusHint = ref('');
const terminalScreenMode = ref<'normal' | 'alternate'>('normal');
const terminalRenderer = ref<'dom' | 'webgl'>('dom');
const terminalSyncState = ref<'live' | 'syncing' | 'reconnecting' | 'degraded'>('syncing');
const terminalLastOutputAt = ref<number>(0);
const terminalLastInputAt = ref<number>(0);
const terminalLastAckAt = ref<number>(0);
const terminalLastHeartbeatAt = ref<number>(0);
const terminalInputAckLatencyMs = ref<number | null>(null);
const terminalOutputLatencyMs = ref<number | null>(null);

let termInstance: XTermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let gatewayClient: GatewayBrowserClient | null = null;
let terminalStreamSource: EventSource | null = null;
let resizeObserver: ResizeObserver | null = null;
let termDataDisposable: IDisposable | null = null;
let writeParsedDisposable: IDisposable | null = null;
let oscProgressDisposable: IDisposable | null = null;
let bufferChangeDisposable: IDisposable | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let gatewayInputRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let gatewayInputRecoverySeq = 0;
let terminalStatusFrame: number | null = null;
let terminalOutputTimer: ReturnType<typeof setTimeout> | null = null;
let terminalOutputFrame: number | null = null;
let terminalOutputQueue = '';
let intentionalClose = false;
const terminalSessionId = ref('');
let terminalInstanceId = '';
let lastOutputSeq = 0;
let lastSentResizeCols = 0;
let lastSentResizeRows = 0;
let terminalFitFrame: number | null = null;
let terminalPostLayoutFitFrame: number | null = null;
let terminalFitRetryTimer: ReturnType<typeof setTimeout> | null = null;
let terminalFitRetryAttempts = 0;
let terminalResizeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTerminalResize: TerminalResizeDimensions | null = null;
let terminalRenderRefreshFrame: number | null = null;
let appliedTerminalTheme = '';
let appliedTerminalFontSize: number | null = null;
let appliedTerminalLineHeight: number | null = null;
let transcriptRestoreAttemptedSessionId = '';
let transcriptRestoreRequestSeq = 0;
let terminalDirectSocketActive = false;
let terminalDirectSocketFailed = false;
let terminalHttpStreamActive = false;
let terminalHttpStreamFailed = false;

type TerminalThemeColorProperty = 'color' | 'backgroundColor';

function resolveTerminalThemeColor(
  cssVariable: string,
  fallback: string,
  property: TerminalThemeColorProperty = 'color',
): string {
  const scope = termContainer.value || document.documentElement;
  const probe = document.createElement('span');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';
  probe.style.width = '1px';
  probe.style.height = '1px';
  probe.style.pointerEvents = 'none';
  probe.style[property] = `var(${cssVariable}, ${fallback})`;
  scope.appendChild(probe);
  const resolved = window.getComputedStyle(probe)[property].trim();
  probe.remove();
  return resolved || fallback;
}

function buildTerminalTheme(): ITheme {
  const color = (cssVariable: string, fallback: string) => resolveTerminalThemeColor(cssVariable, fallback);
  const background = (cssVariable: string, fallback: string) => resolveTerminalThemeColor(cssVariable, fallback, 'backgroundColor');

  return {
    background: background('--terminal-xterm-bg', 'black'),
    foreground: color('--terminal-xterm-fg', 'white'),
    cursor: color('--terminal-xterm-cursor', 'white'),
    selectionBackground: background('--terminal-xterm-selection', 'gray'),
    black: color('--terminal-xterm-black', 'black'),
    red: color('--terminal-xterm-red', 'red'),
    green: color('--terminal-xterm-green', 'green'),
    yellow: color('--terminal-xterm-yellow', 'yellow'),
    blue: color('--terminal-xterm-blue', 'blue'),
    magenta: color('--terminal-xterm-magenta', 'magenta'),
    cyan: color('--terminal-xterm-cyan', 'cyan'),
    white: color('--terminal-xterm-white', 'white'),
    brightBlack: color('--terminal-xterm-bright-black', 'gray'),
    brightRed: color('--terminal-xterm-bright-red', 'red'),
    brightGreen: color('--terminal-xterm-bright-green', 'green'),
    brightYellow: color('--terminal-xterm-bright-yellow', 'yellow'),
    brightBlue: color('--terminal-xterm-bright-blue', 'blue'),
    brightMagenta: color('--terminal-xterm-bright-magenta', 'magenta'),
    brightCyan: color('--terminal-xterm-bright-cyan', 'cyan'),
    brightWhite: color('--terminal-xterm-bright-white', 'white'),
  };
}

function resolveTerminalViewportWidth(): number {
  return termContainer.value?.getBoundingClientRect().width || window.innerWidth || 0;
}

function resolveTerminalFontSize(): number {
  const width = resolveTerminalViewportWidth();
  if (width > 0 && width <= 380) return 8.5;
  if (width > 0 && width <= 430) return 9;
  if (width > 0 && width <= 540) return 9.5;
  if (width > 0 && width <= 720) return 10.5;
  return 14;
}

function resolveTerminalLineHeight(): number {
  const width = resolveTerminalViewportWidth();
  if (width > 0 && width <= 430) return 1.04;
  if (width > 0 && width <= 720) return 1.08;
  return 1.15;
}

function isMobileTerminalRenderingEnvironment(): boolean {
  const userAgent = navigator.userAgent || '';
  if (/\b(Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini)\b/i.test(userAgent)) {
    return true;
  }
  const coarsePointer = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  return navigator.maxTouchPoints > 1 && coarsePointer;
}

function shouldUseTerminalWebglRenderer(): boolean {
  return !isMobileTerminalRenderingEnvironment();
}

function applyTerminalFontSizeCss(fontSize: number): void {
  termContainer.value?.style.setProperty('--terminal-xterm-font-size', `${fontSize}px`);
}

function applyTerminalAppearance(options: { forceTheme?: boolean; postLayout?: boolean } = {}): void {
  if (!termInstance) return;
  const fontSize = resolveTerminalFontSize();
  const lineHeight = resolveTerminalLineHeight();
  const themeKey = String(props.terminalTheme || 'default');
  applyTerminalFontSizeCss(fontSize);
  if (options.forceTheme || appliedTerminalTheme !== themeKey) {
    termInstance.options.theme = buildTerminalTheme();
    appliedTerminalTheme = themeKey;
  }
  if (appliedTerminalFontSize !== fontSize) {
    termInstance.options.fontSize = fontSize;
    appliedTerminalFontSize = fontSize;
  }
  if (appliedTerminalLineHeight !== lineHeight) {
    termInstance.options.lineHeight = lineHeight;
    appliedTerminalLineHeight = lineHeight;
  }
  scheduleTerminalFit({ postLayout: options.postLayout ?? true });
  scheduleTerminalRenderRefresh({ postLayout: options.postLayout ?? true });
}

const TERMINAL_SESSION_STORAGE_KEY = 'tracevane.terminal.sid';
const TERMINAL_OUTPUT_FRAME_BATCH_LIMIT = 64 * 1024;
const TERMINAL_OUTPUT_MAX_LATENCY_MS = 16;
const TERMINAL_GATEWAY_COMMAND_RECOVERY_MS = 1_200;
const TERMINAL_VISIBLE_MIN_SIZE = 8;
const TERMINAL_LAYOUT_RETRY_MS = 80;
const TERMINAL_LAYOUT_RETRY_MAX = 10;
const TERMINAL_RESIZE_SEND_DEBOUNCE_MS = 48;

const termReady = ref(false);
const terminalStatusLabel = computed(() => terminalStatusHint.value.trim());
const terminalScreenModeLabel = computed(() =>
  terminalScreenMode.value === 'alternate'
    ? text('TUI 模式', 'TUI mode')
    : '',
);
const terminalRendererLabel = computed(() =>
  terminalRenderer.value === 'webgl'
    ? text('渲染 · GPU', 'Render · GPU')
    : text('渲染 · 标准', 'Render · Standard'),
);
const terminalProgressLabel = computed(() => {
  const progress = terminalProgress.value;
  if (!progress) return '';
  if (progress.state === 'error') {
    return text('进度 · 错误', 'Progress · Error');
  }
  if (progress.state === 'paused') {
    return progress.value === null
      ? text('进度 · 已暂停', 'Progress · Paused')
      : text(`进度 · 已暂停 ${progress.value}%`, `Progress · Paused ${progress.value}%`);
  }
  if (progress.state === 'indeterminate') {
    return text('进度 · 进行中', 'Progress · Running');
  }
  return progress.value === null
    ? text('进度 · 运行中', 'Progress · Running')
    : text(`进度 · ${progress.value}%`, `Progress · ${progress.value}%`);
});
const terminalConnectionLabel = computed(() => {
  if (!connected.value) {
    return terminalSyncState.value === 'reconnecting'
      ? text('链路 · 重连中', 'Link · Reconnecting')
      : text('链路 · 未连接', 'Link · Offline');
  }
  if (terminalSyncState.value === 'syncing') return text('链路 · 同步中', 'Link · Syncing');
  if (terminalSyncState.value === 'degraded') return text('链路 · 补发保护', 'Link · Recovery');
  if (!terminalLastOutputAt.value) return text('链路 · 已连接', 'Link · Connected');
  return text('链路 · 实时', 'Link · Live');
});
const terminalLatencyLabel = computed(() => {
  const parts: string[] = [];
  if (terminalInputAckLatencyMs.value !== null) {
    parts.push(text(`输入 · ${terminalInputAckLatencyMs.value}ms`, `Input · ${terminalInputAckLatencyMs.value}ms`));
  }
  if (terminalOutputLatencyMs.value !== null) {
    parts.push(text(`输出 · ${terminalOutputLatencyMs.value}ms`, `Output · ${terminalOutputLatencyMs.value}ms`));
  }
  return parts.join(' · ');
});
const terminalConsoleFrameLabel = computed(() =>
  [
    terminalConnectionLabel.value,
    terminalLatencyLabel.value,
    terminalRendererLabel.value,
    terminalScreenModeLabel.value,
    terminalProgressLabel.value,
    terminalStatusLabel.value,
  ].filter(Boolean).join(' · '),
);

type TerminalProgressState = {
  state: 'running' | 'error' | 'paused' | 'indeterminate';
  value: number | null;
};

interface TerminalResizeDimensions {
  cols: number;
  rows: number;
}

const TERMINAL_STATUS_KEYWORDS = [
  'starting',
  'loading',
  'thinking',
  'running',
  'processing',
  'connecting',
  'installing',
  'compacting',
  'indexing',
  'interrupt',
  'mcp',
  '正在',
  '启动',
  '连接',
  '处理中',
  '加载',
  '进度',
];

function normalizeSessionId(value: unknown): string {
  return String(value || '').trim();
}

function setTerminalStatusMessage(message: string): void {
  terminalStatusHint.value = String(message || '').trim();
}

function refreshTerminalLayout(): void {
  if (!termInstance) return;
  terminalFitRetryAttempts = 0;
  const fontSize = resolveTerminalFontSize();
  const lineHeight = resolveTerminalLineHeight();
  if (fontSize !== appliedTerminalFontSize || lineHeight !== appliedTerminalLineHeight) {
    applyTerminalAppearance({ postLayout: true });
    return;
  }
  schedulePostLayoutFitSync();
  scheduleTerminalRenderRefresh({ postLayout: true });
}

function focusTerminal(): void {
  refreshTerminalLayout();
  termInstance?.focus();
}

function handleTerminalFocusIn(): void {
  terminalFocused.value = true;
}

function handleTerminalFocusOut(event: FocusEvent): void {
  const nextTarget = event.relatedTarget as Node | null;
  if (nextTarget && termContainer.value?.contains(nextTarget)) {
    return;
  }
  terminalFocused.value = false;
}

function emitSessionAttached(
  sessionId: string,
  descriptor?: TerminalSessionDescriptor | null,
): void {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) return;

  if (descriptor?.sessionId) {
    emit('sessionAttached', {
      ...descriptor,
      sessionId: normalizedSessionId,
      handoffContext: descriptor.handoffContext || readRouteHandoffContext(),
    });
    return;
  }

  emit('sessionAttached', {
    sessionId: normalizedSessionId,
    title: normalizedSessionId,
    status: connected.value ? 'running' : 'detached',
    source: 'manual',
    canResume: true,
    controlState: 'controller',
    updatedAt: new Date().toISOString(),
    handoffContext: readRouteHandoffContext(),
    recentOutputSummary: null,
  });
}

function cancelScheduledTerminalFit(): void {
  if (terminalFitFrame !== null) {
    window.cancelAnimationFrame(terminalFitFrame);
    terminalFitFrame = null;
  }
  if (terminalPostLayoutFitFrame !== null) {
    window.cancelAnimationFrame(terminalPostLayoutFitFrame);
    terminalPostLayoutFitFrame = null;
  }
}

function cancelScheduledTerminalRenderRefresh(): void {
  if (terminalRenderRefreshFrame === null) return;
  window.cancelAnimationFrame(terminalRenderRefreshFrame);
  terminalRenderRefreshFrame = null;
}

function cancelScheduledTerminalResize(): void {
  pendingTerminalResize = null;
  if (terminalResizeTimer === null) return;
  window.clearTimeout(terminalResizeTimer);
  terminalResizeTimer = null;
}

function clearTerminalFitRetry(): void {
  terminalFitRetryAttempts = 0;
  if (terminalFitRetryTimer === null) return;
  window.clearTimeout(terminalFitRetryTimer);
  terminalFitRetryTimer = null;
}

function scheduleTerminalFitRetry(): void {
  if (terminalFitRetryTimer !== null) return;
  if (terminalFitRetryAttempts >= TERMINAL_LAYOUT_RETRY_MAX) return;
  terminalFitRetryAttempts += 1;
  terminalFitRetryTimer = window.setTimeout(() => {
    terminalFitRetryTimer = null;
    scheduleTerminalFit({ postLayout: true });
  }, TERMINAL_LAYOUT_RETRY_MS);
}

function scheduleTerminalFit(options: { postLayout?: boolean } = {}): void {
  if (terminalFitFrame !== null || terminalPostLayoutFitFrame !== null) return;
  const runFit = () => {
    terminalFitFrame = null;
    syncTerminalSize();
    scheduleTerminalRenderRefresh();
  };
  if (options.postLayout) {
    terminalPostLayoutFitFrame = window.requestAnimationFrame(() => {
      terminalPostLayoutFitFrame = null;
      terminalFitFrame = window.requestAnimationFrame(runFit);
    });
    return;
  }
  terminalFitFrame = window.requestAnimationFrame(runFit);
}

function schedulePostLayoutFitSync(): void {
  scheduleTerminalFit({ postLayout: true });
}

function scheduleTerminalRenderRefresh(options: { postLayout?: boolean } = {}): void {
  if (!termInstance || !isMobileTerminalRenderingEnvironment()) return;
  if (terminalRenderRefreshFrame !== null) return;

  const runRefresh = () => {
    terminalRenderRefreshFrame = null;
    const term = termInstance;
    if (!term || !isTerminalContainerRenderable()) return;
    term.refresh(0, Math.max(0, term.rows - 1));
  };

  terminalRenderRefreshFrame = window.requestAnimationFrame(() => {
    if (options.postLayout) {
      terminalRenderRefreshFrame = window.requestAnimationFrame(runRefresh);
      return;
    }
    runRefresh();
  });
}

function generateSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `term-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isInvalidSessionId(value: unknown): boolean {
  const normalized = normalizeSessionId(value);
  return !normalized
    || normalized === '[object Object]'
    || normalized === 'objectObject'
    || normalized.toLowerCase() === 'objectobject';
}

function saveRuntime(): void {
  // Keep replay cursor state in-memory only. Persisting it across remounts makes
  // a brand-new xterm buffer skip backlog replay after refresh/navigation.
}

function clearRuntime(): void {
  terminalInstanceId = '';
  lastOutputSeq = 0;
  lastSentResizeCols = 0;
  lastSentResizeRows = 0;
  cancelScheduledTerminalResize();
  cancelScheduledTerminalRenderRefresh();
  clearTerminalFitRetry();
  transcriptRestoreAttemptedSessionId = '';
  terminalProgress.value = null;
  terminalStatusHint.value = '';
  terminalScreenMode.value = 'normal';
  terminalRenderer.value = 'dom';
  terminalSyncState.value = 'syncing';
  terminalLastOutputAt.value = 0;
  terminalLastInputAt.value = 0;
  terminalLastAckAt.value = 0;
  terminalLastHeartbeatAt.value = 0;
  terminalInputAckLatencyMs.value = null;
  terminalOutputLatencyMs.value = null;
  terminalDirectSocketActive = false;
  terminalDirectSocketFailed = false;
  terminalHttpStreamFailed = false;
  disconnectTerminalHttpStream();
}

function restoreRuntime(): void {
  terminalInstanceId = '';
  lastOutputSeq = 0;
  lastSentResizeCols = 0;
  lastSentResizeRows = 0;
  cancelScheduledTerminalResize();
  cancelScheduledTerminalRenderRefresh();
  clearTerminalFitRetry();
  transcriptRestoreAttemptedSessionId = '';
  terminalDirectSocketActive = false;
  terminalHttpStreamFailed = false;
  disconnectTerminalHttpStream();
}

async function restorePersistedTranscriptIfNeeded(sessionId: string): Promise<boolean> {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!props.restoreTranscript) return false;
  if (!normalizedSessionId || !termInstance) return false;
  if (transcriptRestoreAttemptedSessionId === normalizedSessionId) return false;

  transcriptRestoreAttemptedSessionId = normalizedSessionId;
  const requestSeq = ++transcriptRestoreRequestSeq;

  try {
    const events = await fetchPersistedTerminalSessionLedger(normalizedSessionId);
    if (requestSeq !== transcriptRestoreRequestSeq) return false;
    if (!termInstance) return false;
    if (normalizeSessionId(getSessionId()) !== normalizedSessionId) return false;

    const transcript = buildTerminalSessionReplayTranscript(events, {
      maxChars: 64_000,
    });
    if (!transcript) return false;
    clearTerminalOutputQueue();
    termInstance.clear();
    termInstance.write(transcript);
    return true;
  } catch {
    return false;
  }
}

function setSessionId(
  nextId: string,
  options: {
    emitAttached?: boolean;
    descriptor?: TerminalSessionDescriptor | null;
  } = {},
): void {
  terminalSessionId.value = isInvalidSessionId(nextId) ? generateSessionId() : nextId;
  try {
    sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, terminalSessionId.value);
  } catch {
    // ignore
  }
  if (options.emitAttached) {
    removePendingTerminalLaunchMetadata(globalThis.sessionStorage, terminalSessionId.value);
    emitSessionAttached(terminalSessionId.value, options.descriptor);
  }
}

function getSessionId(): string {
  const preferred = normalizeSessionId(props.sessionId);
  if (preferred && !isInvalidSessionId(preferred)) {
    if (terminalSessionId.value !== preferred) {
      setSessionId(preferred);
    }
    return terminalSessionId.value;
  }

  if (terminalSessionId.value) return terminalSessionId.value;
  if (props.embedded) {
    return '';
  }
  try {
    const existing = sessionStorage.getItem(TERMINAL_SESSION_STORAGE_KEY);
    if (existing && !isInvalidSessionId(existing)) {
      terminalSessionId.value = existing;
      return terminalSessionId.value;
    }
  } catch {
    // ignore
  }
  terminalSessionId.value = generateSessionId();
  try {
    sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, terminalSessionId.value);
  } catch {
    // ignore
  }
  return terminalSessionId.value;
}

function isTerminalContainerRenderable(): boolean {
  const container = termContainer.value;
  if (!container?.isConnected) return false;
  const rect = container.getBoundingClientRect();
  return rect.width >= TERMINAL_VISIBLE_MIN_SIZE && rect.height >= TERMINAL_VISIBLE_MIN_SIZE;
}

function fitTerminal() {
  if (!fitAddon || !isTerminalContainerRenderable()) return null;
  try {
    fitAddon.fit();
    const dimensions = fitAddon.proposeDimensions();
    if (
      !dimensions
      || !normalizeTerminalDimension(dimensions.cols)
      || !normalizeTerminalDimension(dimensions.rows)
    ) {
      return null;
    }
    return dimensions;
  } catch {
    return null;
  }
}

function usesGatewayRpc(): boolean {
  return resolveCurrentTransportPlan().useGatewayRpc;
}

function canUseDirectTerminalSocket(): boolean {
  return resolveCurrentTransportPlan().useDirectSocket;
}

function canUseTerminalHttpStream(): boolean {
  return resolveCurrentTransportPlan().useHttpStream;
}

function resolveCurrentTransportPlan() {
  return resolveTerminalTransportPlan({
    realtimeTransport: getTracevaneRealtimeTransport(),
    realtimeEnabled: isTerminalRealtimeEnabled(),
    directSocketUrl: getTracevaneTerminalDirectWebSocketUrl(),
    directSocketActive: terminalDirectSocketActive,
    directSocketFailed: terminalDirectSocketFailed,
    httpStreamFailed: terminalHttpStreamFailed,
  });
}

function handleTerminalRealtimeEvent(payload: Record<string, unknown> | TerminalGatewayEvent): void {
  if (payload.type === 'error') {
    setTerminalStatusMessage(String(payload.message || 'terminal_error'));
    return;
  }
  if (payload.type === 'session') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      const descriptor = payload.descriptor && typeof payload.descriptor === 'object'
        ? payload.descriptor as TerminalSessionDescriptor
        : null;
      setSessionId(payload.sid, {
        emitAttached: true,
        descriptor,
      });
    }
    terminalInstanceId = String(payload.instanceId || '');
    // Do not advance lastOutputSeq from the session summary. Attach responses
    // include the summary before replayed output events; advancing here would
    // make those output events look stale and hide live terminal text until reload.
    saveRuntime();
    return;
  }
  if (payload.type === 'reset') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      setSessionId(payload.sid, { emitAttached: true });
    }
    terminalInstanceId = String(payload.instanceId || '');
    lastOutputSeq = 0;
    clearGatewayInputRecovery();
    clearTerminalOutputQueue();
    saveRuntime();
    termInstance?.clear();
    return;
  }
  if (payload.type === 'output') {
    const seq = typeof payload.seq === 'number' ? payload.seq : 0;
    if (seq && seq <= lastOutputSeq) return;
    if (seq) lastOutputSeq = seq;
    clearGatewayInputRecovery();
    const emittedAtMs = typeof payload.emittedAtMs === 'number' ? payload.emittedAtMs : 0;
    const outputLatencyMs = emittedAtMs > 0 ? Date.now() - emittedAtMs : Number.NaN;
    if (Number.isFinite(outputLatencyMs) && outputLatencyMs >= 0 && outputLatencyMs <= 60_000) {
      terminalOutputLatencyMs.value = Math.round(outputLatencyMs);
    }
    if (typeof payload.data === 'string') {
      enqueueTerminalOutput(payload.data);
    }
    saveRuntime();
    return;
  }
  if (payload.type === 'clear') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      setSessionId(payload.sid, { emitAttached: true });
    }
    terminalInstanceId = String(payload.instanceId || terminalInstanceId || '');
    const clearedThroughSeq = typeof payload.clearedThroughSeq === 'number'
      ? payload.clearedThroughSeq
      : lastOutputSeq;
    lastOutputSeq = Math.max(lastOutputSeq, clearedThroughSeq);
    clearGatewayInputRecovery();
    clearTerminalOutputQueue();
    terminalStatusHint.value = '';
    termInstance?.clear();
    saveRuntime();
    return;
  }
  if (payload.type === 'closed') {
    connected.value = false;
    terminalSyncState.value = 'reconnecting';
    clearGatewayInputRecovery();
    setTerminalStatusMessage(
      text(
        '终端会话已结束，请重新连接。',
        'Terminal session ended. Reconnect to continue.',
      ),
    );
  }
}

function clearGatewayInputRecovery(): void {
  if (!gatewayInputRecoveryTimer) return;
  window.clearTimeout(gatewayInputRecoveryTimer);
  gatewayInputRecoveryTimer = null;
}

function clearTerminalOutputQueue(): void {
  terminalOutputQueue = '';
  cancelScheduledTerminalOutputFlush();
}

function cancelScheduledTerminalOutputFlush(): void {
  if (terminalOutputFrame !== null) {
    window.cancelAnimationFrame(terminalOutputFrame);
    terminalOutputFrame = null;
  }
  if (terminalOutputTimer !== null) {
    window.clearTimeout(terminalOutputTimer);
    terminalOutputTimer = null;
  }
}

function flushTerminalOutputQueue(): void {
  cancelScheduledTerminalOutputFlush();
  if (!terminalOutputQueue || !termInstance) return;
  const output = terminalOutputQueue;
  terminalOutputQueue = '';
  termInstance.write(output);
  scheduleTerminalRenderRefresh();
  scheduleTerminalStatusHint();
}

function enqueueTerminalOutput(data: string): void {
  if (!data) return;
  terminalLastOutputAt.value = Date.now();
  terminalSyncState.value = 'live';
  if (!termInstance) {
    terminalOutputQueue += data;
    return;
  }
  terminalOutputQueue += data;
  if (terminalOutputQueue.length >= TERMINAL_OUTPUT_FRAME_BATCH_LIMIT) {
    flushTerminalOutputQueue();
    return;
  }
  scheduleTerminalOutputFlush();
}

function scheduleTerminalOutputFlush(): void {
  if (terminalOutputFrame === null && document.visibilityState === 'visible') {
    terminalOutputFrame = window.requestAnimationFrame(flushTerminalOutputQueue);
  }
  if (terminalOutputTimer === null) {
    terminalOutputTimer = window.setTimeout(flushTerminalOutputQueue, TERMINAL_OUTPUT_MAX_LATENCY_MS);
  }
}

function handleGatewayAckResponse(
  response: TerminalGatewayAckResponse,
  options: {
    inputStartedAt?: number;
    heartbeat?: boolean;
    adoptOutputSeq?: boolean;
    suppressGapRecovery?: boolean;
  } = {},
): void {
  const ackAt = Date.now();
  terminalLastAckAt.value = ackAt;
  if (options.heartbeat) {
    terminalLastHeartbeatAt.value = ackAt;
  }
  if (options.inputStartedAt) {
    terminalInputAckLatencyMs.value = Math.max(0, ackAt - options.inputStartedAt);
  }
  if (response.instanceId) {
    terminalInstanceId = response.instanceId;
  }
  for (const event of response.events || []) {
    handleTerminalRealtimeEvent(event);
  }
  if (options.adoptOutputSeq && typeof response.outputSeq === 'number') {
    lastOutputSeq = Math.max(lastOutputSeq, response.outputSeq);
  }
  if (
    typeof response.outputSeq === 'number' &&
    response.outputSeq > lastOutputSeq &&
    !options.suppressGapRecovery &&
    !(response.events || []).length
  ) {
    terminalSyncState.value = 'degraded';
    void attachGatewayTerminal().catch(() => {
      connected.value = false;
      terminalSyncState.value = 'reconnecting';
    });
  }
  saveRuntime();
}

function normalizeTerminalTelemetryText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function updateTerminalStatusHint(): void {
  const term = termInstance;
  if (!term) return;

  const buffer = term.buffer.active;
  const viewportBottom = Math.min(buffer.length - 1, buffer.viewportY + term.rows - 1);
  const candidates: number[] = [];
  for (let offset = 0; offset < Math.min(term.rows, 14); offset += 1) {
    const row = viewportBottom - offset;
    if (row < 0) break;
    candidates.push(row);
  }
  const cursorRow = buffer.baseY + buffer.cursorY;
  if (!candidates.includes(cursorRow)) {
    candidates.unshift(cursorRow);
  }

  let nextHint = '';
  for (const row of candidates) {
    const line = buffer.getLine(row);
    const textValue = normalizeTerminalTelemetryText(line?.translateToString(true) || '');
    if (!textValue) continue;
    if (/^(?:[>$#]|\$|❯|›)\s*$/.test(textValue)) continue;
    if (/^[a-z0-9._-]+@[^:]+:/.test(textValue.toLowerCase())) continue;
    const lower = textValue.toLowerCase();
    const looksLikeProgress = /\b\d+\/\d+\b/.test(textValue)
      || /\(\d+s\b/.test(textValue)
      || /%/.test(textValue)
      || /esc to interrupt/i.test(textValue)
      || /child_agents_md/i.test(textValue)
      || TERMINAL_STATUS_KEYWORDS.some((keyword) => lower.includes(keyword));
    if (!looksLikeProgress) continue;
    nextHint = textValue;
    break;
  }

  terminalStatusHint.value = nextHint;
}

function scheduleTerminalStatusHint(): void {
  if (terminalStatusFrame !== null) return;
  terminalStatusFrame = window.requestAnimationFrame(() => {
    terminalStatusFrame = null;
    updateTerminalStatusHint();
  });
}

function handleTerminalProgressOsc(data: string): boolean {
  const payload = String(data || '').trim();
  if (!payload.startsWith('4;')) {
    return false;
  }

  const [, stateRaw = '', valueRaw = ''] = payload.split(';');
  const state = Number.parseInt(stateRaw, 10);
  const nextValue = Number.isFinite(Number.parseInt(valueRaw, 10))
    ? Math.max(0, Math.min(100, Number.parseInt(valueRaw, 10)))
    : null;

  switch (state) {
    case 0:
      terminalProgress.value = null;
      return true;
    case 1:
      terminalProgress.value = { state: 'running', value: nextValue };
      return true;
    case 2:
      terminalProgress.value = { state: 'error', value: nextValue };
      return true;
    case 3:
      terminalProgress.value = { state: 'indeterminate', value: null };
      return true;
    case 4:
      terminalProgress.value = { state: 'paused', value: nextValue };
      return true;
    default:
      return false;
  }
}

function updateTerminalScreenMode(term: XTermTerminal): void {
  terminalScreenMode.value = term.buffer.active.type;
}

function clearReconnectTimer(): void {
  if (!reconnectTimer) return;
  window.clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

async function requestGatewayTerminal<T>(method: string, params: unknown): Promise<T> {
  const client = gatewayClient;
  if (!client) {
    throw new Error(text('终端 Gateway 连接尚未初始化。', 'Terminal Gateway client is not initialized.'));
  }
  return client.request<T>(method, params);
}

function readRouteHandoffContext() {
  const fromModule = typeof route.query.fromModule === 'string' ? route.query.fromModule.trim() : '';
  const fromRoute = typeof route.query.fromRoute === 'string' ? route.query.fromRoute.trim() : '';
  const triggerType = typeof route.query.triggerType === 'string' ? route.query.triggerType.trim() : '';
  const triggerLabel = typeof route.query.triggerLabel === 'string' ? route.query.triggerLabel.trim() : '';
  const targetEntity = typeof route.query.targetEntity === 'string' ? route.query.targetEntity.trim() : '';
  const recommendedCommand = typeof route.query.recommendedCommand === 'string' ? route.query.recommendedCommand.trim() : '';
  const relatedEventId = typeof route.query.relatedEventId === 'string' ? route.query.relatedEventId.trim() : '';
  if (!fromModule && !triggerLabel && !targetEntity) {
    return null;
  }
  return {
    fromModule: fromModule || 'system',
    fromRoute: fromRoute || '/system',
    triggerType: triggerType || 'system-handoff',
    triggerLabel: triggerLabel || 'System handoff',
    targetEntity: targetEntity || getSessionId(),
    recommendedCommand,
    relatedEventId: relatedEventId || null,
  };
}

function buildSessionAttachMetadata(sessionId: string) {
  const normalizedSessionId = normalizeSessionId(sessionId);
  const descriptor = normalizeSessionId(props.sessionDescriptor?.sessionId) === normalizedSessionId
    ? props.sessionDescriptor
    : null;
  const pendingMetadata = readPendingTerminalLaunchMetadata(
    globalThis.sessionStorage,
    normalizedSessionId,
  );
  const pendingPinned =
    typeof pendingMetadata?.pinned === 'boolean' ? pendingMetadata.pinned : null;
  return {
    profileId: pendingMetadata?.profileId || descriptor?.profileId || null,
    targetKind: pendingMetadata?.targetKind || descriptor?.targetKind || null,
    cwd: pendingMetadata?.cwd || descriptor?.cwd || null,
    pinned: pendingPinned ?? (
      typeof descriptor?.pinned === 'boolean' ? descriptor.pinned : null
    ),
  };
}

async function attachGatewayTerminal(): Promise<void> {
  if (!gatewayClient) return;
  const sid = getSessionId();
  if (!sid) return;
  clearGatewayInputRecovery();
  const skipReplay = await restorePersistedTranscriptIfNeeded(sid);
  const useHttpStream = canUseTerminalHttpStream();
  const response = await requestGatewayTerminal<TerminalGatewayAttachResponse>(
    TRACEVANE_TERMINAL_GATEWAY_METHODS.attach,
    {
      sid,
      ...buildSessionAttachMetadata(sid),
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      skipReplay: useHttpStream ? true : skipReplay || undefined,
      resume: props.embedded || undefined,
      outputMode: useHttpStream ? 'http-stream' : undefined,
      handoffContext: readRouteHandoffContext(),
    },
  );
  connected.value = true;
  terminalSyncState.value = 'syncing';
  if (response.sid) {
    setSessionId(response.sid, {
      emitAttached: true,
      descriptor: response.descriptor,
    });
  }
  const attachOutputSeq = response.events
    .filter((event) => event.type === 'session')
    .map((event) => event.outputSeq)
    .find((seq) => typeof seq === 'number' && seq >= 0);
  for (const event of response.events || []) {
    handleTerminalRealtimeEvent(event);
  }
  if (skipReplay && typeof attachOutputSeq === 'number' && attachOutputSeq > lastOutputSeq) {
    lastOutputSeq = attachOutputSeq;
  }
  if (useHttpStream) {
    startTerminalHttpStream({ skipReplay });
  }
  terminalSyncState.value = 'live';
  saveRuntime();
  lastSentResizeCols = 0;
  lastSentResizeRows = 0;
  scheduleTerminalFit();
  schedulePostLayoutFitSync();
}

function scheduleGatewayInputRecovery(lastSeenSeq: number, delayMs = 120): void {
  if (!usesGatewayRpc()) return;
  clearGatewayInputRecovery();
  const requestSeq = ++gatewayInputRecoverySeq;
  gatewayInputRecoveryTimer = window.setTimeout(() => {
    gatewayInputRecoveryTimer = null;
    if (requestSeq !== gatewayInputRecoverySeq) return;
    if (intentionalClose || !gatewayClient?.connected) return;
    if (lastOutputSeq !== lastSeenSeq) return;
    terminalSyncState.value = 'degraded';
    void attachGatewayTerminal().catch(() => {
      connected.value = false;
      terminalSyncState.value = 'reconnecting';
    });
  }, delayMs);
}

function shouldScheduleGatewayInputRecovery(data: string): boolean {
  if (!data) return false;
  if (data.includes('\r') || data.includes('\n')) return true;
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(data);
}

function disconnectTerminalHttpStream(): void {
  terminalHttpStreamActive = false;
  if (!terminalStreamSource) return;
  terminalStreamSource.close();
  terminalStreamSource = null;
}

function startTerminalHttpStream(options: { skipReplay?: boolean } = {}): void {
  const sid = getSessionId();
  if (!sid || !canUseTerminalHttpStream()) return;
  disconnectTerminalHttpStream();

  const source = new EventSource(
    buildTerminalStreamUrl(sid, {
      ...buildSessionAttachMetadata(sid),
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      skipReplay: options.skipReplay,
      resume: props.embedded,
    }),
    { withCredentials: true },
  );
  terminalStreamSource = source;
  terminalHttpStreamActive = true;

  source.addEventListener('terminal', (event) => {
    if (terminalStreamSource !== source) return;
    try {
      const payload = JSON.parse(event.data || '{}') as Record<string, unknown>;
      handleTerminalRealtimeEvent(payload);
    } catch {
      // Ignore malformed stream frames; Gateway recovery still remains active.
    }
  });
  source.addEventListener('ping', () => {
    if (terminalStreamSource !== source) return;
    terminalLastHeartbeatAt.value = Date.now();
  });
  source.onerror = () => {
    if (terminalStreamSource !== source) return;
    disconnectTerminalHttpStream();
    terminalHttpStreamFailed = true;
    if (intentionalClose || !gatewayClient?.connected) return;
    void attachGatewayTerminal().catch(() => {
      connected.value = false;
      terminalSyncState.value = 'reconnecting';
    });
  };
}

function disconnectGatewayClient(): void {
  clearGatewayInputRecovery();
  disconnectTerminalHttpStream();
  gatewayClient?.stop();
  gatewayClient = null;
}

function recoverGatewayAttachment(): void {
  connected.value = false;
  terminalSyncState.value = 'reconnecting';
  if (intentionalClose) return;
  if (!gatewayClient?.connected) return;
  void attachGatewayTerminal().catch(() => {
    connected.value = false;
  });
}

function connectGatewayClient(options: { force?: boolean } = {}): void {
  terminalDirectSocketActive = false;
  if (options.force) {
    terminalHttpStreamFailed = false;
  }
  const auth = resolveTracevaneGatewayClientAuth();
  if (!auth.gatewayUrl) {
    connected.value = false;
    setTerminalStatusMessage(
      text(
        '未找到 Gateway 鉴权配置，无法建立终端实时链路。',
        'No Gateway auth configuration was found for terminal realtime.',
      ),
    );
    return;
  }

  if (gatewayClient && !options.force) {
    if (gatewayClient.connected) {
      void attachGatewayTerminal().catch((error) => {
        connected.value = false;
        setTerminalStatusMessage(error instanceof Error ? error.message : text('终端重连失败。', 'Failed to reattach terminal.'));
      });
    }
    return;
  }

  disconnectGatewayClient();

  const client = new GatewayBrowserClient({
    url: auth.gatewayUrl,
    token: auth.token,
    password: auth.password,
    clientVersion: 'tracevane-terminal',
    mode: 'webchat',
    instanceId: `tracevane-terminal-${normalizeSessionId(getSessionId()) || 'pending'}`,
    connectDelayMs: 50,
    onHello: () => {
      if (gatewayClient !== client) return;
      clearReconnectTimer();
      terminalSyncState.value = 'syncing';
      startHeartbeat();
      void attachGatewayTerminal().catch((error) => {
        connected.value = false;
        setTerminalStatusMessage(error instanceof Error ? error.message : text('终端附着失败。', 'Failed to attach terminal.'));
      });
    },
    onEvent: (event: GatewayEventFrame) => {
      if (gatewayClient !== client) return;
      if (event.event !== TRACEVANE_TERMINAL_GATEWAY_EVENT) return;
      if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
      if (terminalHttpStreamActive && (event.payload as Record<string, unknown>).type === 'output') return;
      handleTerminalRealtimeEvent(event.payload as Record<string, unknown>);
    },
    onClose: () => {
      if (gatewayClient !== client) return;
      connected.value = false;
      terminalSyncState.value = 'reconnecting';
      stopHeartbeat();
    },
    onGap: () => {
      if (gatewayClient !== client) return;
      terminalSyncState.value = 'degraded';
      void attachGatewayTerminal().catch(() => {
        connected.value = false;
        terminalSyncState.value = 'reconnecting';
      });
    },
  });

  gatewayClient = client;
  client.start();
}

function normalizeTerminalDimension(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

function sendTerminalResize(cols: number, rows: number): boolean {
  const safeCols = normalizeTerminalDimension(cols);
  const safeRows = normalizeTerminalDimension(rows);
  if (!safeCols || !safeRows) return false;

  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return false;
    void requestGatewayTerminal(
      TRACEVANE_TERMINAL_GATEWAY_METHODS.resize,
      {
        sid: getSessionId(),
        cols: safeCols,
        rows: safeRows,
        lastSeq: lastOutputSeq || undefined,
        instanceId: terminalInstanceId || undefined,
      },
    )
      .then((response) => handleGatewayAckResponse(response as TerminalGatewayAckResponse))
      .catch(() => {
        recoverGatewayAttachment();
      });
    return true;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(JSON.stringify({ type: 'resize', cols: safeCols, rows: safeRows }));
  return true;
}

function queueTerminalResize(cols: number, rows: number): boolean {
  const safeCols = normalizeTerminalDimension(cols);
  const safeRows = normalizeTerminalDimension(rows);
  if (!safeCols || !safeRows) return false;
  if (safeCols === lastSentResizeCols && safeRows === lastSentResizeRows) return true;
  if (pendingTerminalResize?.cols === safeCols && pendingTerminalResize.rows === safeRows) return true;

  pendingTerminalResize = { cols: safeCols, rows: safeRows };
  if (terminalResizeTimer !== null) return true;
  terminalResizeTimer = window.setTimeout(flushQueuedTerminalResize, TERMINAL_RESIZE_SEND_DEBOUNCE_MS);
  return true;
}

function flushQueuedTerminalResize(): void {
  terminalResizeTimer = null;
  const pending = pendingTerminalResize;
  pendingTerminalResize = null;
  if (!pending) return;
  if (pending.cols === lastSentResizeCols && pending.rows === lastSentResizeRows) return;
  if (!sendTerminalResize(pending.cols, pending.rows)) return;
  lastSentResizeCols = pending.cols;
  lastSentResizeRows = pending.rows;
}

function sendTerminalInput(data: string): boolean {
  if (isLeakedTerminalControlPayload(data)) return true;

  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return false;
    const lastSeenSeq = lastOutputSeq;
    const inputStartedAt = Date.now();
    terminalLastInputAt.value = inputStartedAt;
    const sent = gatewayClient.notify(TRACEVANE_TERMINAL_GATEWAY_METHODS.input, {
      sid: getSessionId(),
      data,
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      ackMode: 'none',
    });
    if (sent) {
      terminalInputAckLatencyMs.value = 0;
      if (shouldScheduleGatewayInputRecovery(data)) {
        scheduleGatewayInputRecovery(lastSeenSeq, TERMINAL_GATEWAY_COMMAND_RECOVERY_MS);
      }
      return true;
    }

    void requestGatewayTerminal(
      TRACEVANE_TERMINAL_GATEWAY_METHODS.input,
      {
        sid: getSessionId(),
        data,
        lastSeq: lastOutputSeq || undefined,
        instanceId: terminalInstanceId || undefined,
      },
    )
      .then((response) => {
        handleGatewayAckResponse(response as TerminalGatewayAckResponse, { inputStartedAt });
        scheduleGatewayInputRecovery(lastSeenSeq);
      })
      .catch(() => {
        recoverGatewayAttachment();
      });
    return true;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  const inputStartedAt = Date.now();
  terminalLastInputAt.value = inputStartedAt;
  terminalInputAckLatencyMs.value = 0;
  ws.send(data);
  return true;
}

function isLeakedTerminalControlPayload(data: string): boolean {
  const payloads = parseTerminalControlPayloads(data);
  if (!payloads?.length) return false;
  if (!payloads.every(isResizeTerminalControlPayload)) return false;

  for (const payload of payloads) {
    const cols = normalizeTerminalDimension(Number(payload.cols));
    const rows = normalizeTerminalDimension(Number(payload.rows));
    if (!cols || !rows) continue;
    sendTerminalResize(cols, rows);
  }

  return true;
}

function dispatchQueuedCommandIfReady(): void {
  const normalizedSessionId = normalizeSessionId(props.sessionId);
  const queuedCommand = props.queuedCommand;
  if (!queuedCommand || queuedCommand.sessionId !== normalizedSessionId) return;
  if (!termReady.value || !connected.value) return;

  const normalizedCommand = String(queuedCommand.command || '');
  if (!normalizedCommand) return;

  if (!sendTerminalInput(normalizedCommand)) return;
  emit('consumeQueuedCommand');
}

function syncTerminalSize(): void {
  const dims = fitTerminal();
  if (!dims) {
    scheduleTerminalFitRetry();
    return;
  }
  clearTerminalFitRetry();
  if (dims.cols === lastSentResizeCols && dims.rows === lastSentResizeRows) return;
  queueTerminalResize(dims.cols, dims.rows);
}

function stopHeartbeat(): void {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function startHeartbeat(): void {
  stopHeartbeat();
  heartbeatTimer = window.setInterval(() => {
    if (usesGatewayRpc()) {
      if (!gatewayClient?.connected) return;
      void requestGatewayTerminal(
        TRACEVANE_TERMINAL_GATEWAY_METHODS.heartbeat,
        {
          sid: getSessionId(),
          lastSeq: lastOutputSeq || undefined,
          instanceId: terminalInstanceId || undefined,
        },
      )
        .then((response) => handleGatewayAckResponse(response as TerminalGatewayAckResponse, { heartbeat: true }))
        .catch(() => {
          recoverGatewayAttachment();
        });
      return;
    }

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 10_000);
}

function scheduleReconnect(): void {
  if (usesGatewayRpc()) return;
  if (reconnectTimer) window.clearTimeout(reconnectTimer);
  if (intentionalClose) return;
  reconnectTimer = window.setTimeout(() => {
    if (!connected.value && termInstance && !intentionalClose) {
      termInstance.write('\r\n\x1b[33m[auto reconnecting...]\x1b[0m\r\n');
      connectWs({ force: true });
    }
  }, 3_000);
}

async function connectWs(options: { force?: boolean } = {}): Promise<void> {
  if (!termInstance) return;
  const sid = getSessionId();
  if (!sid) return;
  const skipReplay = await restorePersistedTranscriptIfNeeded(sid);
  if (!isTerminalRealtimeEnabled()) {
    connected.value = false;
    terminalSyncState.value = 'degraded';
    setTerminalStatusMessage(
      text(
        '当前部署模式已挂到 Gateway，但终端实时链路还未启用。',
        'This deployment is mounted behind the Gateway, but terminal realtime is not enabled yet.',
      ),
    );
    return;
  }
  const useDirectTerminalSocket = canUseDirectTerminalSocket();
  if (getTracevaneRealtimeTransport() === 'gateway-rpc' && !useDirectTerminalSocket) {
    connectGatewayClient(options);
    return;
  }
  disconnectTerminalHttpStream();
  if (!options.force && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  terminalDirectSocketActive = useDirectTerminalSocket;
  const directSocketUrl = useDirectTerminalSocket
    ? getTracevaneTerminalDirectWebSocketUrl()
    : '';
  const socketUrl = buildTerminalSocketUrl({
    protocol: window.location.protocol === 'https:' ? 'wss:' : 'ws:',
    host: window.location.host,
    webSocketBasePath: getWebSocketBasePath(),
    directSocketUrl,
    sid,
    ...buildSessionAttachMetadata(sid),
    lastSeq: lastOutputSeq,
    instanceId: terminalInstanceId,
    skipReplay,
    resume: props.embedded,
  });
  const socket = new WebSocket(socketUrl);
  ws = socket;
  let directFallbackStarted = false;

  const fallbackFromDirectSocket = (): boolean => {
    if (!useDirectTerminalSocket || intentionalClose || directFallbackStarted) return false;
    directFallbackStarted = true;
    terminalDirectSocketActive = false;
    terminalDirectSocketFailed = true;
    connectGatewayClient({ force: true });
    return true;
  };

  socket.onopen = () => {
    if (ws !== socket) return;
    terminalDirectSocketFailed = false;
    connected.value = true;
    terminalSyncState.value = 'live';
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    startHeartbeat();
    lastSentResizeCols = 0;
    lastSentResizeRows = 0;
    scheduleTerminalFit();
    schedulePostLayoutFitSync();
  };

  socket.onmessage = (event) => {
    if (ws !== socket) return;
    if (typeof event.data === 'string' && event.data.startsWith('{')) {
      try {
        const payload = JSON.parse(event.data) as Record<string, unknown>;
        if (payload.type === 'pong') return;
        handleTerminalRealtimeEvent(payload);
        return;
      } catch {
        // fall through
      }
    }

    if (typeof event.data === 'string') {
      enqueueTerminalOutput(event.data);
    }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    if (useDirectTerminalSocket) {
      terminalDirectSocketActive = false;
    }
    connected.value = false;
    terminalSyncState.value = 'reconnecting';
    stopHeartbeat();
    if (fallbackFromDirectSocket()) return;
    if (!intentionalClose) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    if (ws !== socket) return;
    connected.value = false;
    terminalSyncState.value = 'reconnecting';
    try { socket.close(); } catch {
      // ignore
    }
  };
}

function reconnect(): void {
  intentionalClose = false;
  stopHeartbeat();
  connected.value = false;
  terminalSyncState.value = 'reconnecting';
  clearReconnectTimer();
  if (usesGatewayRpc()) {
    disconnectGatewayClient();
    connectGatewayClient({ force: true });
    return;
  }
  if (ws) {
    try { ws.close(); } catch {
      // ignore
    }
    ws = null;
  }
  connectWs({ force: true });
}

function clearTerminal(): void {
  clearTerminalOutputQueue();
  termInstance?.clear();
  terminalStatusHint.value = '';
  if (usesGatewayRpc()) {
    if (gatewayClient?.connected) {
      void requestGatewayTerminal(
        TRACEVANE_TERMINAL_GATEWAY_METHODS.clear,
        {
          sid: getSessionId(),
          lastSeq: lastOutputSeq || undefined,
          instanceId: terminalInstanceId || undefined,
        },
      )
        .then((response) => handleGatewayAckResponse(
          response as TerminalGatewayAckResponse,
          { adoptOutputSeq: true, suppressGapRecovery: true },
        ))
        .catch(() => {
          recoverGatewayAttachment();
        });
    }
  } else if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'clear' }));
  }
  focusTerminal();
}

function controlCharacterForKey(key: string): string | null {
  const normalized = String(key || '').trim().toUpperCase();
  if (!/^[A-Z]$/.test(normalized)) {
    return null;
  }
  return String.fromCharCode(normalized.charCodeAt(0) - 64);
}

function sendTerminalShortcut(key: string): boolean {
  const controlChar = controlCharacterForKey(key);
  if (!controlChar) return false;
  focusTerminal();
  return sendTerminalInput(controlChar);
}

async function pasteClipboard(): Promise<boolean> {
  try {
    const text = await navigator.clipboard?.readText?.();
    if (!text) return false;
    focusTerminal();
    return sendTerminalInput(formatTerminalPaste(text));
  } catch {
    return false;
  }
}

function insertTerminalText(value: string): boolean {
  const normalized = String(value || '');
  if (!normalized) return false;
  focusTerminal();
  return sendTerminalInput(formatTerminalPaste(normalized));
}

function formatTerminalPaste(value: string): string {
  if (!termInstance?.modes.bracketedPasteMode) {
    return value;
  }
  return `\x1b[200~${value.replace(/\r?\n/g, '\r')}\x1b[201~`;
}

function shouldCaptureTerminalShortcut(event: KeyboardEvent): boolean {
  if (!terminalFocused.value || !termReady.value) return false;
  if (event.ctrlKey && event.shiftKey && !event.metaKey && !event.altKey && event.key.toUpperCase() === 'V') {
    return true;
  }
  if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
    return false;
  }
  const controlChar = controlCharacterForKey(event.key);
  if (!controlChar) return false;

  const target = event.target as HTMLElement | null;
  const editableTarget = target?.closest('input, textarea, [contenteditable="true"]');
  if (editableTarget && !termContainer.value?.contains(editableTarget)) {
    return false;
  }

  return true;
}

function handleTerminalKeydown(event: KeyboardEvent): void {
  if (!shouldCaptureTerminalShortcut(event)) return;
  if (event.ctrlKey && event.shiftKey && event.key.toUpperCase() === 'V') {
    event.preventDefault();
    event.stopPropagation();
    void pasteClipboard();
    return;
  }
  if (!sendTerminalShortcut(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
}

async function initTerminal(): Promise<void> {
  const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
    import('@xterm/xterm'),
    import('@xterm/addon-fit'),
    import('@xterm/addon-web-links'),
  ]);
  await import('@xterm/xterm/css/xterm.css');

  const term = new Terminal({
    fontSize: resolveTerminalFontSize(),
    fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, monospace',
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    allowTransparency: true,
    altClickMovesCursor: true,
    convertEol: false,
    customGlyphs: true,
    drawBoldTextInBrightColors: true,
    fastScrollSensitivity: 8,
    ignoreBracketedPasteMode: false,
    lineHeight: resolveTerminalLineHeight(),
    macOptionIsMeta: true,
    macOptionClickForcesSelection: true,
    reflowCursorLine: true,
    rescaleOverlappingGlyphs: true,
    rightClickSelectsWord: true,
    scrollOnEraseInDisplay: true,
    scrollOnUserInput: true,
    scrollback: 10000,
    smoothScrollDuration: 0,
    minimumContrastRatio: 1,
    theme: buildTerminalTheme(),
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  if (shouldUseTerminalWebglRenderer()) {
    try {
      const { WebglAddon } = await import('@xterm/addon-webgl');
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
      terminalRenderer.value = 'webgl';
      webglAddon.onContextLoss(() => {
        terminalRenderer.value = 'dom';
        schedulePostLayoutFitSync();
      });
    } catch {
      terminalRenderer.value = 'dom';
    }
  } else {
    terminalRenderer.value = 'dom';
  }

  await nextTick();
  if (!termContainer.value) return;
  term.open(termContainer.value);
  termInstance = term;
  applyTerminalAppearance({ forceTheme: true, postLayout: true });
  schedulePostLayoutFitSync();

  termReady.value = true;
  flushTerminalOutputQueue();
  updateTerminalScreenMode(term);
  resizeObserver = new ResizeObserver(() => {
    const fontSize = resolveTerminalFontSize();
    const lineHeight = resolveTerminalLineHeight();
    if (fontSize !== appliedTerminalFontSize || lineHeight !== appliedTerminalLineHeight) {
      applyTerminalAppearance({ postLayout: true });
      return;
    }
    schedulePostLayoutFitSync();
  });
  resizeObserver.observe(termContainer.value);

  term.onResize(({ cols, rows }) => {
    queueTerminalResize(cols, rows);
    scheduleTerminalRenderRefresh();
    scheduleTerminalStatusHint();
  });

  termDataDisposable = term.onData((data) => {
    sendTerminalInput(data);
  });
  writeParsedDisposable = term.onWriteParsed(() => {
    scheduleTerminalStatusHint();
  });
  oscProgressDisposable = term.parser.registerOscHandler(9, (data) => handleTerminalProgressOsc(data));
  bufferChangeDisposable = term.buffer.onBufferChange(() => {
    updateTerminalScreenMode(term);
    scheduleTerminalStatusHint();
  });
  termContainer.value.addEventListener('focusin', handleTerminalFocusIn);
  termContainer.value.addEventListener('focusout', handleTerminalFocusOut);
  termContainer.value.addEventListener('mousedown', focusTerminal);

  connectWs();
}

function handleVisibility(): void {
  if (document.visibilityState !== 'visible') return;
  schedulePostLayoutFitSync();
  scheduleTerminalRenderRefresh({ postLayout: true });
  if (!connected.value) connectWs();
}

function handleFocus(): void {
  schedulePostLayoutFitSync();
  scheduleTerminalRenderRefresh({ postLayout: true });
  if (!connected.value) connectWs();
}

function handleTerminalViewportChange(): void {
  refreshTerminalLayout();
  scheduleTerminalRenderRefresh({ postLayout: true });
}

watch(
  () => props.sessionId,
  (nextSessionId) => {
    const normalized = normalizeSessionId(nextSessionId);
    if (!normalized || isInvalidSessionId(normalized)) {
      if (props.embedded) {
        terminalSessionId.value = '';
        clearRuntime();
        connected.value = false;
        return;
      }
      if (!terminalSessionId.value) {
        getSessionId();
        restoreRuntime();
      }
      return;
    }

    if (terminalSessionId.value === normalized) {
      return;
    }

    setSessionId(normalized);
    clearRuntime();
    clearTerminalOutputQueue();
    termInstance?.clear();
    if (termReady.value) {
      reconnect();
    }
  },
  { immediate: true },
);

watch(
  () => [props.queuedCommand, connected.value, termReady.value, props.sessionId],
  () => {
    dispatchQueuedCommandIfReady();
  },
  { immediate: true },
);

watch(
  () => props.terminalTheme,
  () => {
    applyTerminalAppearance({ forceTheme: true, postLayout: true });
  },
);

onMounted(async () => {
  intentionalClose = false;
  getSessionId();
  restoreRuntime();
  await initTerminal();
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleFocus);
  window.addEventListener('keydown', handleTerminalKeydown, true);
  window.visualViewport?.addEventListener('resize', handleTerminalViewportChange);
  window.visualViewport?.addEventListener('scroll', handleTerminalViewportChange);
});

onBeforeUnmount(() => {
  intentionalClose = true;
  stopHeartbeat();
  clearReconnectTimer();
  clearGatewayInputRecovery();
  clearTerminalOutputQueue();
  if (terminalStatusFrame !== null) {
    window.cancelAnimationFrame(terminalStatusFrame);
    terminalStatusFrame = null;
  }
  cancelScheduledTerminalFit();
  cancelScheduledTerminalResize();
  cancelScheduledTerminalRenderRefresh();
  clearTerminalFitRetry();
  resizeObserver?.disconnect();
  resizeObserver = null;
  termDataDisposable?.dispose();
  termDataDisposable = null;
  writeParsedDisposable?.dispose();
  writeParsedDisposable = null;
  oscProgressDisposable?.dispose();
  oscProgressDisposable = null;
  bufferChangeDisposable?.dispose();
  bufferChangeDisposable = null;
  terminalFocused.value = false;
  termContainer.value?.removeEventListener('focusin', handleTerminalFocusIn);
  termContainer.value?.removeEventListener('focusout', handleTerminalFocusOut);
  termContainer.value?.removeEventListener('mousedown', focusTerminal);
  if (gatewayClient?.connected) {
    void requestGatewayTerminal(
      TRACEVANE_TERMINAL_GATEWAY_METHODS.detach,
      { sid: getSessionId() },
    ).catch(() => {
      // ignore
    });
  }
  disconnectGatewayClient();
  if (ws) {
    try { ws.close(); } catch {
      // ignore
    }
  }
  ws = null;
  termInstance?.dispose();
  termInstance = null;
  termReady.value = false;
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('online', handleFocus);
  window.removeEventListener('keydown', handleTerminalKeydown, true);
  window.visualViewport?.removeEventListener('resize', handleTerminalViewportChange);
  window.visualViewport?.removeEventListener('scroll', handleTerminalViewportChange);
});

defineExpose({
  clearTerminal,
  focusTerminal,
  insertTerminalText,
  pasteClipboard,
  refreshTerminalLayout,
  sendTerminalShortcut,
});
</script>
