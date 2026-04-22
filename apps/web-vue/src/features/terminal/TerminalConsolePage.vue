<template>
  <section
    class="terminal-console-surface"
    :class="{ 'terminal-console-surface-embedded': props.embedded }"
    data-testid="terminal-console-surface"
    data-context-policy="none"
  >
    <div v-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <section class="terminal-console-main">
      <header v-if="props.showToolbar" class="terminal-console-header">
        <div class="terminal-console-header-left">
          <span class="status-pill" :class="connected ? 'tone-sage' : 'tone-neutral'">
            <span class="status-pill-dot"></span>
            <span>{{ connected ? text('终端已连接', 'Terminal connected') : text('终端未连接', 'Terminal disconnected') }}</span>
          </span>
          <span class="terminal-console-header-chip">{{ text('当前终端', 'Active shell') }} · {{ activeCliLabel }}</span>
          <span class="terminal-console-header-chip">{{ text('会话', 'Session') }} · {{ sessionPreview }}</span>
        </div>

        <div class="terminal-console-header-actions">
          <button type="button" class="secondary-button compact-button" :disabled="endingTerminal || !connected" @click="resetTerminal('terminal ended; new terminal ready')">
            {{ endingTerminal ? text('处理中…', 'Processing...') : text('结束终端', 'End terminal') }}
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="endingTerminal" @click="resetTerminal('new terminal created')">
            {{ text('新建终端', 'New terminal') }}
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="endingTerminal || !termReady" @click="reconnect">
            {{ text('重连', 'Reconnect') }}
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="!termReady" @click="clearTerminal">
            {{ text('清屏', 'Clear') }}
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('claude')" @click="launchCli('claude')">
            Claude
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('codex')" @click="launchCli('codex')">
            Codex
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('opencode')" @click="launchCli('opencode')">
            OpenCode
          </button>
          <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('bash')" @click="launchCli('bash')">
            Shell
          </button>
        </div>
      </header>

      <div ref="termContainer" class="terminal-container"></div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  TerminalGatewayAttachResponse,
  TerminalGatewayEvent,
  TerminalLaunchCli,
  TerminalStatusPayload,
} from '../../../../../types/terminal';
import {
  STUDIO_TERMINAL_GATEWAY_EVENT,
  STUDIO_TERMINAL_GATEWAY_METHODS,
} from '../../../../../types/terminal';
import { useLocalePreference } from '../../shared/locale';
import { getWebSocketBasePath, resolveStudioGatewayClientAuth } from '../../shared/api';
import { GatewayBrowserClient, type GatewayEventFrame } from '../../shared/gateway-client';
import { getStudioRealtimeTransport, isTerminalRealtimeEnabled } from '../../shared/runtime-config';
import {
  endTerminalSession,
  fetchPersistedTerminalSessionLedger,
  fetchTerminalLaunch,
  fetchTerminalStatus,
} from './api';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import { buildTerminalSessionReplayTranscript } from './terminal-session-history';
import type { TerminalQueuedCommand } from './terminal-workspace-state';

const props = withDefaults(defineProps<{
  sessionId?: string;
  queuedCommand?: TerminalQueuedCommand | null;
  showToolbar?: boolean;
  embedded?: boolean;
}>(), {
  sessionId: '',
  queuedCommand: null,
  showToolbar: true,
  embedded: false,
});

const route = useRoute();
const { text } = useLocalePreference();

const emit = defineEmits<{
  (e: 'consumeQueuedCommand'): void;
  (e: 'sessionAttached', session: TerminalSessionDescriptor): void;
}>();

const termContainer = ref<HTMLElement | null>(null);
const status = ref<TerminalStatusPayload | null>(null);
const connected = ref(false);
const activeCliLabel = ref(text('普通 Shell', 'Plain shell'));
const endingTerminal = ref(false);
const noticeMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null);
const terminalFocused = ref(false);

let termInstance: XTermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let ws: WebSocket | null = null;
let gatewayClient: GatewayBrowserClient | null = null;
let resizeObserver: ResizeObserver | null = null;
let termDataDisposable: IDisposable | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let intentionalClose = false;
const terminalSessionId = ref('');
let terminalInstanceId = '';
let lastOutputSeq = 0;
let transcriptRestoreAttemptedSessionId = '';
let transcriptRestoreRequestSeq = 0;

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';

const termReady = ref(false);
const sessionPreview = computed(() => {
  if (!terminalSessionId.value) return text('未初始化', 'Uninitialized');
  return terminalSessionId.value.length <= 18
    ? terminalSessionId.value
    : `${terminalSessionId.value.slice(0, 8)}...${terminalSessionId.value.slice(-6)}`;
});

function normalizeSessionId(value: unknown): string {
  return String(value || '').trim();
}

function setNotice(kind: 'success' | 'error', message: string): void {
  noticeMessage.value = { kind, text: message };
}

function focusTerminal(): void {
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

function emitSessionAttached(sessionId: string): void {
  const normalizedSessionId = normalizeSessionId(sessionId);
  if (!normalizedSessionId) return;

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

function schedulePostLayoutFitSync(): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      syncTerminalSize();
    });
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
  transcriptRestoreAttemptedSessionId = '';
  activeCliLabel.value = text('普通 Shell', 'Plain shell');
}

function restoreRuntime(): void {
  terminalInstanceId = '';
  lastOutputSeq = 0;
  transcriptRestoreAttemptedSessionId = '';
}

async function restorePersistedTranscriptIfNeeded(sessionId: string): Promise<boolean> {
  const normalizedSessionId = normalizeSessionId(sessionId);
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
    termInstance.clear();
    termInstance.write(transcript);
    return true;
  } catch {
    return false;
  }
}

function setSessionId(nextId: string): void {
  terminalSessionId.value = isInvalidSessionId(nextId) ? generateSessionId() : nextId;
  try {
    sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, terminalSessionId.value);
  } catch {
    // ignore
  }
  emitSessionAttached(terminalSessionId.value);
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

async function refreshStatus(): Promise<void> {
  try {
    status.value = await fetchTerminalStatus();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('读取终端状态失败。', 'Failed to load terminal status.'));
  }
}

function canLaunch(cli: TerminalLaunchCli): boolean {
  if (cli === 'bash') return connected.value;
  const binary = status.value?.binaries.find((item) => item.id === cli);
  return connected.value && Boolean(binary?.installed);
}

async function launchCli(cli: TerminalLaunchCli): Promise<void> {
  try {
    const result = await fetchTerminalLaunch({ cli });
    sendTerminalInput(`${result.command}\n`);
    activeCliLabel.value = result.label;
    saveRuntime();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('启动终端命令失败。', 'Failed to launch CLI command.'));
  }
}

function fitTerminal() {
  if (!fitAddon) return null;
  try {
    fitAddon.fit();
    return fitAddon.proposeDimensions();
  } catch {
    return null;
  }
}

function usesGatewayRpc(): boolean {
  return getStudioRealtimeTransport() === 'gateway-rpc';
}

function handleTerminalRealtimeEvent(payload: Record<string, unknown> | TerminalGatewayEvent): void {
  if (payload.type === 'error') {
    setNotice('error', String(payload.message || 'terminal_error'));
    return;
  }
  if (payload.type === 'session') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      setSessionId(payload.sid);
    }
    terminalInstanceId = String(payload.instanceId || '');
    if (typeof payload.outputSeq === 'number' && payload.outputSeq > lastOutputSeq) {
      lastOutputSeq = payload.outputSeq;
    }
    saveRuntime();
    return;
  }
  if (payload.type === 'reset') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      setSessionId(payload.sid);
    }
    terminalInstanceId = String(payload.instanceId || '');
    lastOutputSeq = 0;
    saveRuntime();
    termInstance?.clear();
    return;
  }
  if (payload.type === 'output') {
    const seq = typeof payload.seq === 'number' ? payload.seq : 0;
    if (seq && seq <= lastOutputSeq) return;
    if (seq) lastOutputSeq = seq;
    if (typeof payload.data === 'string') {
      termInstance?.write(payload.data);
    }
    saveRuntime();
    return;
  }
  if (payload.type === 'closed') {
    connected.value = false;
    setNotice(
      'error',
      text(
        '终端会话已结束，请重新连接。',
        'Terminal session ended. Reconnect to continue.',
      ),
    );
  }
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

async function attachGatewayTerminal(): Promise<void> {
  if (!gatewayClient) return;
  const sid = getSessionId();
  if (!sid) return;
  const skipReplay = await restorePersistedTranscriptIfNeeded(sid);
  const response = await requestGatewayTerminal<TerminalGatewayAttachResponse>(
    STUDIO_TERMINAL_GATEWAY_METHODS.attach,
    {
      sid,
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      skipReplay: skipReplay || undefined,
      handoffContext: readRouteHandoffContext(),
    },
  );
  connected.value = true;
  if (response.sid) {
    setSessionId(response.sid);
  }
  for (const event of response.events || []) {
    handleTerminalRealtimeEvent(event);
  }
  saveRuntime();
  syncTerminalSize();
  schedulePostLayoutFitSync();
  void refreshStatus();
}

function disconnectGatewayClient(): void {
  gatewayClient?.stop();
  gatewayClient = null;
}

function recoverGatewayAttachment(): void {
  connected.value = false;
  if (intentionalClose) return;
  if (!gatewayClient?.connected) return;
  void attachGatewayTerminal().catch(() => {
    connected.value = false;
  });
}

function connectGatewayClient(options: { force?: boolean } = {}): void {
  const auth = resolveStudioGatewayClientAuth();
  if (!auth.gatewayUrl) {
    connected.value = false;
    setNotice(
      'error',
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
        setNotice('error', error instanceof Error ? error.message : text('终端重连失败。', 'Failed to reattach terminal.'));
      });
    }
    return;
  }

  disconnectGatewayClient();

  const client = new GatewayBrowserClient({
    url: auth.gatewayUrl,
    token: auth.token,
    password: auth.password,
    clientVersion: 'openclaw-studio-terminal',
    mode: 'webchat',
    instanceId: `studio-terminal-${normalizeSessionId(getSessionId()) || 'pending'}`,
    onHello: () => {
      if (gatewayClient !== client) return;
      clearReconnectTimer();
      startHeartbeat();
      void attachGatewayTerminal().catch((error) => {
        connected.value = false;
        setNotice('error', error instanceof Error ? error.message : text('终端附着失败。', 'Failed to attach terminal.'));
      });
    },
    onEvent: (event: GatewayEventFrame) => {
      if (gatewayClient !== client) return;
      if (event.event !== STUDIO_TERMINAL_GATEWAY_EVENT) return;
      if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) return;
      handleTerminalRealtimeEvent(event.payload as Record<string, unknown>);
    },
    onClose: () => {
      if (gatewayClient !== client) return;
      connected.value = false;
      stopHeartbeat();
    },
    onGap: () => {
      if (gatewayClient !== client) return;
      void attachGatewayTerminal().catch(() => {
        connected.value = false;
      });
    },
  });

  gatewayClient = client;
  client.start();
}

function sendTerminalResize(cols: number, rows: number): void {
  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return;
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.resize,
      {
        sid: getSessionId(),
        cols,
        rows,
      },
    ).catch(() => {
      recoverGatewayAttachment();
    });
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: 'resize', cols, rows }));
}

function sendTerminalInput(data: string): boolean {
  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return false;
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.input,
      {
        sid: getSessionId(),
        data,
      },
    ).catch(() => {
      recoverGatewayAttachment();
    });
    return true;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  ws.send(data);
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
  if (!dims) return;
  sendTerminalResize(dims.cols, dims.rows);
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
        STUDIO_TERMINAL_GATEWAY_METHODS.heartbeat,
        { sid: getSessionId() },
      ).catch(() => {
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
    setNotice(
      'error',
      text(
        '当前部署模式已挂到 Gateway，但终端实时链路还未启用。',
        'This deployment is mounted behind the Gateway, but terminal realtime is not enabled yet.',
      ),
    );
    return;
  }
  if (usesGatewayRpc()) {
    connectGatewayClient(options);
    return;
  }
  if (!options.force && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const basePath = getWebSocketBasePath();
  const wsPath = basePath ? `${basePath}/ws/terminal` : '/ws/terminal';
  const params = new URLSearchParams({ sid });
  if (lastOutputSeq > 0) params.set('lastSeq', String(lastOutputSeq));
  if (terminalInstanceId) params.set('instanceId', terminalInstanceId);
  if (skipReplay) params.set('skipReplay', '1');

  const socket = new WebSocket(`${protocol}//${window.location.host}${wsPath}?${params.toString()}`);
  ws = socket;

  socket.onopen = () => {
    if (ws !== socket) return;
    connected.value = true;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    startHeartbeat();
    syncTerminalSize();
    schedulePostLayoutFitSync();
    void refreshStatus();
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
      termInstance?.write(event.data);
    }
  };

  socket.onclose = () => {
    if (ws !== socket) return;
    ws = null;
    connected.value = false;
    stopHeartbeat();
    if (!intentionalClose) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    if (ws !== socket) return;
    connected.value = false;
    try { socket.close(); } catch {
      // ignore
    }
  };
}

function reconnect(): void {
  intentionalClose = false;
  stopHeartbeat();
  connected.value = false;
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

async function resetTerminal(message: string): Promise<void> {
  if (endingTerminal.value) return;
  endingTerminal.value = true;
  intentionalClose = true;
  stopHeartbeat();
  connected.value = false;
  clearReconnectTimer();

  if (ws) {
    try { ws.close(); } catch {
      // ignore
    }
    ws = null;
  }
  if (gatewayClient?.connected) {
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.detach,
      { sid: getSessionId() },
    ).catch(() => {
      // ignore
    });
  }
  disconnectGatewayClient();

  try {
    await endTerminalSession({ sid: getSessionId() });
  } catch {
    // ignore
  }

  clearRuntime();
  const lockedSessionId = normalizeSessionId(props.sessionId);
  if (lockedSessionId && !isInvalidSessionId(lockedSessionId)) {
    setSessionId(lockedSessionId);
  } else {
    setSessionId(generateSessionId());
  }
  termInstance?.clear();
  if (message) {
    termInstance?.write(`\r\n\x1b[33m[${message}]\x1b[0m\r\n`);
  }

  intentionalClose = false;
  if (usesGatewayRpc()) {
    connectGatewayClient({ force: true });
  } else {
    connectWs({ force: true });
  }
  void refreshStatus();
  endingTerminal.value = false;
}

function clearTerminal(): void {
  termInstance?.clear();
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

function shouldCaptureTerminalShortcut(event: KeyboardEvent): boolean {
  if (!terminalFocused.value || !termReady.value) return false;
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
    fontSize: 14,
    fontFamily: '"Cascadia Code", "JetBrains Mono", Menlo, Monaco, monospace',
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    theme: {
      background: '#0f1419',
      foreground: '#e6e1cf',
      cursor: '#7fdbca',
      selectionBackground: '#1a3a4a',
      black: '#0f1419',
      red: '#ff6666',
      green: '#7fdbca',
      yellow: '#ffd580',
      blue: '#82aaff',
      magenta: '#c792ea',
      cyan: '#89ddff',
      white: '#e6e1cf',
      brightBlack: '#575f66',
      brightRed: '#ff6666',
      brightGreen: '#7fdbca',
      brightYellow: '#ffd580',
      brightBlue: '#82aaff',
      brightMagenta: '#c792ea',
      brightCyan: '#89ddff',
      brightWhite: '#ffffff',
    },
  });

  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());

  await nextTick();
  if (!termContainer.value) return;
  term.open(termContainer.value);
  fitTerminal();
  schedulePostLayoutFitSync();

  termInstance = term;
  termReady.value = true;
  resizeObserver = new ResizeObserver(() => schedulePostLayoutFitSync());
  resizeObserver.observe(termContainer.value);

  term.onResize(({ cols, rows }) => {
    sendTerminalResize(cols, rows);
  });

  termDataDisposable = term.onData((data) => {
    sendTerminalInput(data);
  });
  termContainer.value.addEventListener('focusin', handleTerminalFocusIn);
  termContainer.value.addEventListener('focusout', handleTerminalFocusOut);
  termContainer.value.addEventListener('mousedown', focusTerminal);

  connectWs();
}

function handleVisibility(): void {
  if (document.visibilityState !== 'visible') return;
  syncTerminalSize();
  if (!connected.value) connectWs();
}

function handleFocus(): void {
  syncTerminalSize();
  if (!connected.value) connectWs();
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

onMounted(async () => {
  intentionalClose = false;
  getSessionId();
  restoreRuntime();
  void refreshStatus();
  await initTerminal();
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleFocus);
  window.addEventListener('keydown', handleTerminalKeydown, true);
  statusPollTimer = window.setInterval(() => {
    void refreshStatus();
  }, 15_000);
});

onBeforeUnmount(() => {
  intentionalClose = true;
  stopHeartbeat();
  clearReconnectTimer();
  resizeObserver?.disconnect();
  resizeObserver = null;
  termDataDisposable?.dispose();
  termDataDisposable = null;
  terminalFocused.value = false;
  termContainer.value?.removeEventListener('focusin', handleTerminalFocusIn);
  termContainer.value?.removeEventListener('focusout', handleTerminalFocusOut);
  termContainer.value?.removeEventListener('mousedown', focusTerminal);
  if (gatewayClient?.connected) {
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.detach,
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
  if (statusPollTimer) window.clearInterval(statusPollTimer);
  statusPollTimer = null;
  document.removeEventListener('visibilitychange', handleVisibility);
  window.removeEventListener('focus', handleFocus);
  window.removeEventListener('online', handleFocus);
  window.removeEventListener('keydown', handleTerminalKeydown, true);
});

defineExpose({
  clearTerminal,
  focusTerminal,
  sendTerminalShortcut,
});
</script>

<style scoped>
.terminal-console-surface {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: 10px;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.terminal-console-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  border-radius: 10px;
  overflow: hidden;
  background: var(--surface-base);
  border: 1px solid var(--border-subtle);
}

.terminal-console-surface-embedded .terminal-console-main {
  border: 0;
  grid-template-rows: minmax(0, 1fr);
  border-radius: 0;
  background: transparent;
}

.terminal-console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--surface-base);
  border-bottom: 1px solid var(--border-subtle);
}

.terminal-console-header-left,
.terminal-console-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.terminal-console-header-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  color: var(--text-soft);
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
}

.terminal-container {
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  padding: 0 6px 6px;
  background: color-mix(in srgb, var(--surface-raised) 90%, rgba(5, 10, 18, 0.2));
}

.terminal-console-surface-embedded .terminal-container {
  padding: 0;
}

.terminal-container :deep(.xterm),
.terminal-container :deep(.xterm-screen),
.terminal-container :deep(.xterm-viewport) {
  height: 100%;
}

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:global(html[data-theme="light"]) .terminal-console-main {
  background: var(--surface-base);
}

:global(html[data-theme="light"]) .terminal-console-header {
  background: rgba(246, 250, 253, 0.96);
}

:global(html[data-theme="light"]) .terminal-console-header-chip {
  background: rgba(19, 32, 49, 0.06);
  color: #16324b;
  border: 1px solid rgba(19, 32, 49, 0.1);
}

:global(html[data-theme="light"]) .terminal-container {
  background: linear-gradient(180deg, #112233, #0f1419 18%, #0f1419 100%);
}

@media (max-width: 860px) {
  .terminal-console-header {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
