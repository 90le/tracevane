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
          <span class="terminal-console-header-chip">{{ terminalRendererLabel }}</span>
          <span v-if="terminalScreenModeLabel" class="terminal-console-header-chip terminal-console-header-chip--mode">{{ terminalScreenModeLabel }}</span>
          <span class="terminal-console-header-chip">{{ text('当前终端', 'Active shell') }} · {{ activeCliLabel }}</span>
          <span class="terminal-console-header-chip">{{ text('会话', 'Session') }} · {{ sessionPreview }}</span>
          <span v-if="terminalTitleLabel" class="terminal-console-header-chip">{{ text('标题', 'Title') }} · {{ terminalTitleLabel }}</span>
          <span v-if="terminalProgressLabel" class="terminal-console-header-chip" :class="terminalProgressChipClass">{{ terminalProgressLabel }}</span>
          <span v-if="terminalStatusLabel" class="terminal-console-header-chip terminal-console-header-chip--status">{{ terminalStatusLabel }}</span>
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

      <div v-else-if="hasTerminalTelemetry" class="terminal-console-meta-strip">
        <span class="terminal-console-header-chip">{{ terminalRendererLabel }}</span>
        <span v-if="terminalScreenModeLabel" class="terminal-console-header-chip terminal-console-header-chip--mode">{{ terminalScreenModeLabel }}</span>
        <span v-if="terminalTitleLabel" class="terminal-console-header-chip">{{ text('标题', 'Title') }} · {{ terminalTitleLabel }}</span>
        <span v-if="terminalProgressLabel" class="terminal-console-header-chip" :class="terminalProgressChipClass">{{ terminalProgressLabel }}</span>
        <span v-if="terminalStatusLabel" class="terminal-console-header-chip terminal-console-header-chip--status">{{ terminalStatusLabel }}</span>
      </div>

      <div class="terminal-console-frame">
        <div v-if="hasTerminalWorkbenchTelemetry" class="terminal-console-workbench-bar" data-testid="terminal-console-workbench-bar">
          <div class="terminal-console-cli-state">
            <span class="terminal-console-cli-state__dot" :class="`terminal-console-cli-state__dot--${terminalCliState.state}`"></span>
            <span class="terminal-console-cli-state__label">{{ terminalCliStateLabel }}</span>
            <span v-if="terminalCliDetailLabel" class="terminal-console-cli-state__detail">{{ terminalCliDetailLabel }}</span>
          </div>
          <div class="terminal-console-cli-progress" :class="`terminal-console-cli-progress--${terminalCliState.state}`">
            <span :class="terminalCliProgressClass" :style="terminalCliProgressStyle"></span>
          </div>
          <div class="terminal-console-link-state">
            <span>{{ terminalConnectionLabel }}</span>
            <span v-if="terminalLatencyLabel">{{ terminalLatencyLabel }}</span>
            <span>{{ terminalRendererLabel }}</span>
            <span v-if="terminalScreenModeLabel">{{ terminalScreenModeLabel }}</span>
          </div>
        </div>

        <div ref="termContainer" class="terminal-container"></div>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  TerminalGatewayAckResponse,
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
import {
  getStudioRealtimeTransport,
  getStudioTerminalDirectWebSocketUrl,
  isTerminalRealtimeEnabled,
} from '../../shared/runtime-config';
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
  restoreTranscript?: boolean;
}>(), {
  sessionId: '',
  queuedCommand: null,
  showToolbar: true,
  embedded: false,
  restoreTranscript: true,
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
const terminalTitle = ref('');
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
let resizeObserver: ResizeObserver | null = null;
let termDataDisposable: IDisposable | null = null;
let titleChangeDisposable: IDisposable | null = null;
let writeParsedDisposable: IDisposable | null = null;
let oscProgressDisposable: IDisposable | null = null;
let bufferChangeDisposable: IDisposable | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let statusPollTimer: ReturnType<typeof setInterval> | null = null;
let gatewayInputRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
let gatewayInputRecoverySeq = 0;
let terminalStatusFrame: number | null = null;
let terminalOutputTimer: ReturnType<typeof setTimeout> | null = null;
let terminalOutputQueue = '';
let intentionalClose = false;
const terminalSessionId = ref('');
let terminalInstanceId = '';
let lastOutputSeq = 0;
let transcriptRestoreAttemptedSessionId = '';
let transcriptRestoreRequestSeq = 0;
let terminalDirectSocketActive = false;
let terminalDirectSocketFailed = false;

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';
const TERMINAL_IMMEDIATE_OUTPUT_LIMIT = 8 * 1024;
const TERMINAL_BULK_OUTPUT_FLUSH_MS = 4;

const termReady = ref(false);
const sessionPreview = computed(() => {
  if (!terminalSessionId.value) return text('未初始化', 'Uninitialized');
  return terminalSessionId.value.length <= 18
    ? terminalSessionId.value
    : `${terminalSessionId.value.slice(0, 8)}...${terminalSessionId.value.slice(-6)}`;
});
const terminalTitleLabel = computed(() => terminalTitle.value.trim());
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
const terminalProgressChipClass = computed(() => {
  const progress = terminalProgress.value;
  if (!progress) return '';
  return `terminal-console-header-chip--progress-${progress.state}`;
});
const hasTerminalTelemetry = computed(() =>
  Boolean(terminalTitleLabel.value || terminalProgressLabel.value || terminalStatusLabel.value),
);
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
  if (terminalLastHeartbeatAt.value) {
    parts.push(text('心跳 · 正常', 'Heartbeat · OK'));
  }
  return parts.join(' · ');
});
const terminalCliState = computed(() => deriveTerminalCliState({
  title: terminalTitle.value,
  status: terminalStatusHint.value,
  progress: terminalProgress.value,
  screenMode: terminalScreenMode.value,
  connected: connected.value,
}));
const terminalCliStateLabel = computed(() => {
  const state = terminalCliState.value;
  return text(`${state.tool} · ${state.labelZh}`, `${state.tool} · ${state.labelEn}`);
});
const terminalCliDetailLabel = computed(() => {
  const state = terminalCliState.value;
  const parts = [
    state.detail,
    state.progressLabel,
    state.elapsedLabel,
    state.interruptible ? text('Esc 可中断', 'Esc interrupts') : '',
  ].filter(Boolean);
  return parts.join(' · ');
});
const terminalCliProgressStyle = computed(() => {
  const ratio = terminalCliState.value.progressRatio;
  if (ratio === null) return { width: '100%' };
  return { width: `${Math.max(3, Math.min(100, Math.round(ratio * 100)))}%` };
});
const terminalCliProgressClass = computed(() =>
  `terminal-console-cli-progress__fill terminal-console-cli-progress__fill--${terminalCliState.value.state}`,
);
const hasTerminalWorkbenchTelemetry = computed(() =>
  Boolean(termReady.value || connected.value || terminalCliDetailLabel.value || terminalLatencyLabel.value || terminalScreenModeLabel.value),
);

type TerminalProgressState = {
  state: 'running' | 'error' | 'paused' | 'indeterminate';
  value: number | null;
};

type TerminalCliState = {
  tool: string;
  state: 'idle' | 'starting' | 'running' | 'waiting' | 'error';
  labelZh: string;
  labelEn: string;
  detail: string;
  progressLabel: string;
  elapsedLabel: string;
  progressRatio: number | null;
  interruptible: boolean;
};

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

const TELEMETRY_TOOL_LABELS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bcodex\b/i, label: 'Codex' },
  { pattern: /\bclaude\b/i, label: 'Claude' },
  { pattern: /\bopencode\b/i, label: 'OpenCode' },
];

function parseProgressParts(value: string): {
  current: number;
  total: number;
  label: string;
  ratio: number | null;
} | null {
  const match = value.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  if (!match) return null;
  const current = Number.parseInt(match[1], 10);
  const total = Number.parseInt(match[2], 10);
  if (!Number.isFinite(current) || !Number.isFinite(total) || total <= 0) return null;
  return {
    current,
    total,
    label: `${current}/${total}`,
    ratio: Math.max(0, Math.min(1, current / total)),
  };
}

function parseElapsedLabel(value: string): string {
  const secondsMatch = value.match(/\((\d+)s\b/i) || value.match(/\b(\d+)s\s*(?:•|$)/i);
  if (secondsMatch) return `${secondsMatch[1]}s`;
  const minutesMatch = value.match(/\((\d+)m\s*(\d+)?s?\b/i);
  if (!minutesMatch) return '';
  const minutes = Number.parseInt(minutesMatch[1], 10);
  const seconds = Number.parseInt(minutesMatch[2] || '0', 10);
  return `${minutes}m${seconds ? ` ${seconds}s` : ''}`;
}

function inferTelemetryTool(source: string): string {
  const normalized = normalizeTerminalTelemetryText(source);
  const match = TELEMETRY_TOOL_LABELS.find((item) => item.pattern.test(normalized));
  return match?.label || activeCliLabel.value || text('普通 Shell', 'Plain shell');
}

function deriveTerminalCliState(params: {
  title: string;
  status: string;
  progress: TerminalProgressState | null;
  screenMode: 'normal' | 'alternate';
  connected: boolean;
}): TerminalCliState {
  const source = normalizeTerminalTelemetryText(`${params.title} ${params.status}`);
  const tool = inferTelemetryTool(source);
  const progressParts = parseProgressParts(source);
  const elapsedLabel = parseElapsedLabel(source);
  const explicitProgressRatio =
    params.progress?.value !== null && params.progress?.value !== undefined
      ? Math.max(0, Math.min(1, params.progress.value / 100))
      : null;
  const progressRatio = progressParts?.ratio ?? explicitProgressRatio;
  const progressLabel =
    progressParts?.label ||
    (params.progress?.value !== null && params.progress?.value !== undefined
      ? `${params.progress.value}%`
      : '');
  const detail = params.status || params.title || '';
  const interruptible = /esc to interrupt|ctrl\+c|interrupt|可中断/i.test(source);

  if (!params.connected) {
    return {
      tool,
      state: 'waiting',
      labelZh: '等待连接',
      labelEn: 'Waiting for link',
      detail,
      progressLabel,
      elapsedLabel,
      progressRatio,
      interruptible: false,
    };
  }

  if (/panic|panicked|crashed|failed|error|exception|失败|错误|崩溃/i.test(source)) {
    return {
      tool,
      state: 'error',
      labelZh: '异常',
      labelEn: 'Error',
      detail,
      progressLabel,
      elapsedLabel,
      progressRatio,
      interruptible,
    };
  }

  if (/starting|loading|connecting|installing|indexing|启动|加载|连接|安装|索引|mcp/i.test(source)) {
    return {
      tool,
      state: 'starting',
      labelZh: '启动中',
      labelEn: 'Starting',
      detail,
      progressLabel,
      elapsedLabel,
      progressRatio,
      interruptible,
    };
  }

  if (
    params.progress ||
    params.screenMode === 'alternate' ||
    /thinking|running|processing|compacting|执行|处理中|思考|运行/i.test(source)
  ) {
    return {
      tool,
      state: 'running',
      labelZh: '运行中',
      labelEn: 'Running',
      detail,
      progressLabel,
      elapsedLabel,
      progressRatio,
      interruptible,
    };
  }

  return {
    tool,
    state: 'idle',
    labelZh: '就绪',
    labelEn: 'Ready',
    detail,
    progressLabel,
    elapsedLabel,
    progressRatio,
    interruptible,
  };
}

function normalizeSessionId(value: unknown): string {
  return String(value || '').trim();
}

function setNotice(kind: 'success' | 'error', message: string): void {
  noticeMessage.value = { kind, text: message };
}

function inferCliLabel(source: string): void {
  const textValue = normalizeTerminalTelemetryText(source);
  if (!textValue) return;
  const match = TELEMETRY_TOOL_LABELS.find((item) => item.pattern.test(textValue));
  if (!match) return;
  activeCliLabel.value = match.label;
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
  terminalTitle.value = '';
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
}

function restoreRuntime(): void {
  terminalInstanceId = '';
  lastOutputSeq = 0;
  transcriptRestoreAttemptedSessionId = '';
  terminalDirectSocketActive = false;
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
  options: { emitAttached?: boolean } = {},
): void {
  terminalSessionId.value = isInvalidSessionId(nextId) ? generateSessionId() : nextId;
  try {
    sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, terminalSessionId.value);
  } catch {
    // ignore
  }
  if (options.emitAttached) {
    emitSessionAttached(terminalSessionId.value);
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
  return getStudioRealtimeTransport() === 'gateway-rpc' && !terminalDirectSocketActive;
}

function canUseDirectTerminalSocket(): boolean {
  return getStudioRealtimeTransport() === 'gateway-rpc'
    && !terminalDirectSocketFailed
    && Boolean(getStudioTerminalDirectWebSocketUrl());
}

function handleTerminalRealtimeEvent(payload: Record<string, unknown> | TerminalGatewayEvent): void {
  if (payload.type === 'error') {
    setNotice('error', String(payload.message || 'terminal_error'));
    return;
  }
  if (payload.type === 'session') {
    if (typeof payload.sid === 'string' && payload.sid.trim()) {
      setSessionId(payload.sid, { emitAttached: true });
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
    setNotice(
      'error',
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
  if (terminalOutputTimer !== null) {
    window.clearTimeout(terminalOutputTimer);
    terminalOutputTimer = null;
  }
}

function flushTerminalOutputQueue(): void {
  terminalOutputTimer = null;
  if (!terminalOutputQueue || !termInstance) return;
  const output = terminalOutputQueue;
  terminalOutputQueue = '';
  termInstance.write(output);
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
  if (!terminalOutputQueue && data.length <= TERMINAL_IMMEDIATE_OUTPUT_LIMIT) {
    termInstance.write(data);
    scheduleTerminalStatusHint();
    return;
  }
  terminalOutputQueue += data;
  if (terminalOutputQueue.length >= TERMINAL_IMMEDIATE_OUTPUT_LIMIT * 4) {
    flushTerminalOutputQueue();
    return;
  }
  if (terminalOutputTimer !== null) return;
  terminalOutputTimer = window.setTimeout(flushTerminalOutputQueue, TERMINAL_BULK_OUTPUT_FLUSH_MS);
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
  inferCliLabel(nextHint);
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

async function attachGatewayTerminal(): Promise<void> {
  if (!gatewayClient) return;
  const sid = getSessionId();
  if (!sid) return;
  clearGatewayInputRecovery();
  const skipReplay = await restorePersistedTranscriptIfNeeded(sid);
  const response = await requestGatewayTerminal<TerminalGatewayAttachResponse>(
    STUDIO_TERMINAL_GATEWAY_METHODS.attach,
    {
      sid,
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      skipReplay: skipReplay || undefined,
      resume: props.embedded || undefined,
      handoffContext: readRouteHandoffContext(),
    },
  );
  connected.value = true;
  terminalSyncState.value = 'syncing';
  if (response.sid) {
    setSessionId(response.sid, { emitAttached: true });
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
  terminalSyncState.value = 'live';
  saveRuntime();
  syncTerminalSize();
  schedulePostLayoutFitSync();
  void refreshStatus();
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
  return /^[\x20-\x7e]+$/.test(data);
}

function disconnectGatewayClient(): void {
  clearGatewayInputRecovery();
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
    connectDelayMs: 50,
    onHello: () => {
      if (gatewayClient !== client) return;
      clearReconnectTimer();
      terminalSyncState.value = 'syncing';
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

function sendTerminalResize(cols: number, rows: number): void {
  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return;
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.resize,
      {
        sid: getSessionId(),
        cols,
        rows,
        lastSeq: lastOutputSeq || undefined,
        instanceId: terminalInstanceId || undefined,
      },
    )
      .then((response) => handleGatewayAckResponse(response as TerminalGatewayAckResponse))
      .catch(() => {
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
    const lastSeenSeq = lastOutputSeq;
    const inputStartedAt = Date.now();
    terminalLastInputAt.value = inputStartedAt;
    const sent = gatewayClient.notify(STUDIO_TERMINAL_GATEWAY_METHODS.input, {
      sid: getSessionId(),
      data,
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
      ackMode: 'none',
    });
    if (sent) {
      terminalInputAckLatencyMs.value = 0;
      if (shouldScheduleGatewayInputRecovery(data)) {
        scheduleGatewayInputRecovery(lastSeenSeq, 220);
      }
      return true;
    }

    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.input,
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
    setNotice(
      'error',
      text(
        '当前部署模式已挂到 Gateway，但终端实时链路还未启用。',
        'This deployment is mounted behind the Gateway, but terminal realtime is not enabled yet.',
      ),
    );
    return;
  }
  const useDirectTerminalSocket = canUseDirectTerminalSocket();
  if (getStudioRealtimeTransport() === 'gateway-rpc' && !useDirectTerminalSocket) {
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
  if (props.embedded) params.set('resume', '1');

  terminalDirectSocketActive = useDirectTerminalSocket;
  const directSocketUrl = useDirectTerminalSocket
    ? getStudioTerminalDirectWebSocketUrl()
    : '';
  const socketUrl = directSocketUrl
    ? `${directSocketUrl}?${params.toString()}`
    : `${protocol}//${window.location.host}${wsPath}?${params.toString()}`;
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

async function resetTerminal(message: string): Promise<void> {
  if (endingTerminal.value) return;
  endingTerminal.value = true;
  intentionalClose = true;
  stopHeartbeat();
  connected.value = false;
  terminalSyncState.value = 'reconnecting';
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
  clearTerminalOutputQueue();
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
  clearTerminalOutputQueue();
  termInstance?.clear();
  terminalStatusHint.value = '';
  if (usesGatewayRpc()) {
    if (gatewayClient?.connected) {
      void requestGatewayTerminal(
        STUDIO_TERMINAL_GATEWAY_METHODS.clear,
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
    fontSize: 14,
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
    lineHeight: 1.15,
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

  await nextTick();
  if (!termContainer.value) return;
  term.open(termContainer.value);
  fitTerminal();
  schedulePostLayoutFitSync();

  termInstance = term;
  termReady.value = true;
  flushTerminalOutputQueue();
  updateTerminalScreenMode(term);
  resizeObserver = new ResizeObserver(() => schedulePostLayoutFitSync());
  resizeObserver.observe(termContainer.value);

  term.onResize(({ cols, rows }) => {
    sendTerminalResize(cols, rows);
    scheduleTerminalStatusHint();
  });

  termDataDisposable = term.onData((data) => {
    sendTerminalInput(data);
  });
  titleChangeDisposable = term.onTitleChange((title) => {
    terminalTitle.value = normalizeTerminalTelemetryText(title);
    inferCliLabel(title);
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
  clearGatewayInputRecovery();
  clearTerminalOutputQueue();
  if (terminalStatusFrame !== null) {
    window.cancelAnimationFrame(terminalStatusFrame);
    terminalStatusFrame = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;
  termDataDisposable?.dispose();
  termDataDisposable = null;
  titleChangeDisposable?.dispose();
  titleChangeDisposable = null;
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
  pasteClipboard,
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
  grid-template-rows: auto minmax(0, 1fr);
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

.terminal-console-meta-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  padding: 8px 10px 0;
  background: transparent;
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

.terminal-console-header-chip--status {
  max-width: min(100%, 42rem);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-console-header-chip--mode {
  color: color-mix(in srgb, var(--text-primary) 82%, #82aaff);
  border: 1px solid color-mix(in srgb, #82aaff 24%, transparent);
}

.terminal-console-header-chip--progress-running,
.terminal-console-header-chip--progress-indeterminate {
  color: color-mix(in srgb, var(--text-primary) 82%, #7fdbca);
  border: 1px solid color-mix(in srgb, #7fdbca 28%, transparent);
}

.terminal-console-header-chip--progress-paused {
  color: color-mix(in srgb, var(--text-primary) 80%, #ffd580);
  border: 1px solid color-mix(in srgb, #ffd580 28%, transparent);
}

.terminal-console-header-chip--progress-error {
  color: color-mix(in srgb, var(--text-primary) 78%, #ff6666);
  border: 1px solid color-mix(in srgb, #ff6666 28%, transparent);
}

.terminal-console-frame {
  grid-row: 2;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}

.terminal-console-workbench-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(88px, 160px) auto;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 8px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-subtle) 80%, transparent);
  background: color-mix(in srgb, var(--surface-base) 88%, rgba(15, 20, 25, 0.5));
}

.terminal-console-cli-state,
.terminal-console-link-state {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  font-size: 11px;
  color: var(--text-soft);
}

.terminal-console-cli-state__dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #7fdbca;
  box-shadow: 0 0 0 3px color-mix(in srgb, #7fdbca 18%, transparent);
}

.terminal-console-cli-state__dot--starting,
.terminal-console-cli-state__dot--running {
  animation: terminal-pulse 1.25s ease-in-out infinite;
}

.terminal-console-cli-state__dot--waiting {
  background: #ffd580;
  box-shadow: 0 0 0 3px color-mix(in srgb, #ffd580 18%, transparent);
}

.terminal-console-cli-state__dot--error {
  background: #ff6666;
  box-shadow: 0 0 0 3px color-mix(in srgb, #ff6666 18%, transparent);
}

.terminal-console-cli-state__label {
  flex: 0 0 auto;
  color: var(--text-primary);
  font-weight: 600;
}

.terminal-console-cli-state__detail {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-console-link-state {
  justify-content: flex-end;
  white-space: nowrap;
}

.terminal-console-cli-progress {
  height: 4px;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-raised) 70%, transparent);
}

.terminal-console-cli-progress__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #7fdbca, #82aaff);
  transition: width 160ms ease;
}

.terminal-console-cli-progress__fill--idle {
  opacity: 0.45;
}

.terminal-console-cli-progress__fill--waiting {
  background: linear-gradient(90deg, #ffd580, #82aaff);
}

.terminal-console-cli-progress__fill--error {
  background: linear-gradient(90deg, #ff6666, #ffd580);
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

:global(html[data-theme="light"]) .terminal-console-meta-strip {
  background: transparent;
}

:global(html[data-theme="light"]) .terminal-console-header-chip {
  background: rgba(19, 32, 49, 0.06);
  color: #16324b;
  border: 1px solid rgba(19, 32, 49, 0.1);
}

:global(html[data-theme="light"]) .terminal-console-workbench-bar {
  background: rgba(246, 250, 253, 0.94);
}

:global(html[data-theme="light"]) .terminal-container {
  background: linear-gradient(180deg, #112233, #0f1419 18%, #0f1419 100%);
}

@keyframes terminal-pulse {
  0%,
  100% {
    transform: scale(0.92);
    opacity: 0.7;
  }
  50% {
    transform: scale(1.12);
    opacity: 1;
  }
}

@media (max-width: 860px) {
  .terminal-console-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .terminal-console-workbench-bar {
    grid-template-columns: minmax(0, 1fr);
  }

  .terminal-console-link-state {
    justify-content: flex-start;
    flex-wrap: wrap;
  }
}
</style>
