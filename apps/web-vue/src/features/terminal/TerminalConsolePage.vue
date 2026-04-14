<template>
  <section class="page-shell terminal-page">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">Terminal</p>
        <h2 class="page-title">{{ text('维护终端', 'Maintenance Terminal') }}</h2>
        <p class="page-copy">
          {{
            text(
              '维护页只保留一个持久终端。刷新页面或切换页面时复用当前会话，只有点“结束终端”或“新建终端”才会重置成新的终端。',
              'This maintenance page keeps only one persistent terminal. Refreshing or navigating reuses the current session, and only End/New terminal resets it.'
            )
          }}
        </p>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="statusLoading || installBusy" @click="refreshStatus">
          {{ text('重新检测', 'Refresh checks') }}
        </button>
      </div>
    </header>

    <div v-if="noticeMessage" class="status-banner" :class="noticeMessage.kind === 'error' ? 'status-banner-error' : 'status-banner-success'">
      {{ noticeMessage.text }}
    </div>

    <div class="terminal-layout">
      <aside class="terminal-sidebar">
        <section class="terminal-card terminal-card-runtime">
          <div class="terminal-card-head">
            <h3>{{ text('运行状态', 'Runtime') }}</h3>
          </div>

          <div v-if="status" class="terminal-overview-grid">
            <div class="terminal-overview-item">
              <span>{{ text('PTY', 'PTY') }}</span>
              <strong>{{ status.ptyAvailable ? text('可用', 'Available') : text('不可用', 'Unavailable') }}</strong>
            </div>
            <div class="terminal-overview-item">
              <span>{{ text('连接', 'Socket') }}</span>
              <strong>{{ connected ? text('已连接', 'Connected') : text('未连接', 'Disconnected') }}</strong>
            </div>
            <div class="terminal-overview-item">
              <span>{{ text('当前终端', 'Active shell') }}</span>
              <strong>{{ activeCliLabel }}</strong>
            </div>
            <div class="terminal-overview-item">
              <span>{{ text('当前会话', 'Session') }}</span>
              <strong>{{ sessionPreview }}</strong>
            </div>
          </div>
        </section>

        <section class="terminal-card terminal-card-cli">
          <div class="terminal-card-head">
            <h3>{{ text('Agent CLI', 'Agent CLI') }}</h3>
            <span class="terminal-card-chip">{{ agentInstalledCount }} / {{ agentCliBinaries.length }}</span>
          </div>

          <div class="terminal-card-subhead">
            {{ text('直接启动 Claude / Codex / OpenCode / Shell。缺失的 CLI 可以在这里安装。', 'Launch Claude / Codex / OpenCode / shell directly. Missing CLIs can be installed here.') }}
          </div>

          <div class="terminal-cli-list">
            <article
              v-for="binary in agentCliBinaries"
              :key="binary.id"
              class="terminal-cli-item"
            >
              <div class="terminal-cli-copy">
                <strong>{{ binary.label }}</strong>
                <span>{{ binary.path || binary.binary }}</span>
              </div>

              <div class="terminal-cli-actions">
                <span class="status-pill" :class="binary.installed ? 'tone-sage' : 'tone-accent'">
                  <span class="status-pill-dot"></span>
                  <span>{{ binary.installed ? text('已安装', 'Installed') : text('未安装', 'Missing') }}</span>
                </span>

                <button
                  v-if="!binary.installed && binary.installSupported"
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="installBusy"
                  @click="installCli(binary.id)"
                >
                  {{ installingTarget === binary.id ? text('安装中…', 'Installing...') : text('安装', 'Install') }}
                </button>
              </div>
            </article>
          </div>

          <div class="terminal-launch-grid">
            <button
              type="button"
              class="primary-button"
              :disabled="!canLaunch('claude')"
              @click="launchCli('claude')"
            >
              {{ text('启动 Claude', 'Launch Claude') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="!canLaunch('codex')"
              @click="launchCli('codex')"
            >
              {{ text('启动 Codex', 'Launch Codex') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="!canLaunch('opencode')"
              @click="launchCli('opencode')"
            >
              {{ text('启动 OpenCode', 'Launch OpenCode') }}
            </button>
            <button
              type="button"
              class="secondary-button"
              :disabled="!canLaunch('bash')"
              @click="launchCli('bash')"
            >
              {{ text('普通 Shell', 'Plain shell') }}
            </button>
          </div>
        </section>

        <section class="terminal-card terminal-card-skills">
          <div class="terminal-card-head">
            <h3>{{ text('Skills 工具链', 'Skills Tooling') }}</h3>
            <span class="terminal-card-chip">{{ marketplaceInstalledCount }} / {{ marketplaceCliBinaries.length }}</span>
          </div>

          <div v-if="status" class="terminal-overview-grid terminal-overview-grid-compact">
            <div class="terminal-overview-item">
              <span>{{ text('待补技能', 'Needs setup') }}</span>
              <strong>{{ status.skills.needsSetupCount }}</strong>
            </div>
            <div class="terminal-overview-item">
              <span>{{ text('缺失命令', 'Missing bins') }}</span>
              <strong>{{ status.skills.missingBinaryCount }}</strong>
            </div>
          </div>

          <div class="terminal-cli-list">
            <article
              v-for="binary in marketplaceCliBinaries"
              :key="binary.id"
              class="terminal-cli-item"
            >
              <div class="terminal-cli-copy">
                <strong>{{ binary.label }}</strong>
                <span>{{ binary.path || binary.binary }}</span>
              </div>

              <div class="terminal-cli-actions">
                <span class="status-pill" :class="binary.installed ? 'tone-sage' : 'tone-accent'">
                  <span class="status-pill-dot"></span>
                  <span>{{ binary.installed ? text('已安装', 'Installed') : text('未安装', 'Missing') }}</span>
                </span>

                <button
                  v-if="!binary.installed && binary.installSupported"
                  type="button"
                  class="secondary-button compact-button"
                  :disabled="installBusy"
                  @click="installCli(binary.id)"
                >
                  {{ installingTarget === binary.id ? text('安装中…', 'Installing...') : text('安装', 'Install') }}
                </button>
              </div>
            </article>
          </div>

          <div v-if="status?.skills.missingBinaries.length" class="terminal-missing-block">
            <div class="terminal-block-head">
              <h4>{{ text('Skills 缺失命令', 'Missing skill binaries') }}</h4>
              <button
                type="button"
                class="secondary-button compact-button"
                @click="goToSkills"
              >
                {{ text('去 Skills', 'Open Skills') }}
              </button>
            </div>

            <div class="terminal-chip-list">
              <span
                v-for="item in status.skills.missingBinaries"
                :key="item.binary"
                class="terminal-chip"
              >
                {{ item.binary }} · {{ item.skills.length }}
              </span>
            </div>
          </div>
        </section>

        <section v-if="installMessage || installLog" class="terminal-card">
          <div class="terminal-card-head">
            <h3>{{ text('安装日志', 'Install log') }}</h3>
            <div class="terminal-card-actions" v-if="installLog">
              <button
                type="button"
                class="secondary-button compact-button"
                @click="copyInstallLog"
              >
                {{ text('复制', 'Copy') }}
              </button>
              <button
                type="button"
                class="secondary-button compact-button"
                @click="downloadInstallLog"
              >
                {{ text('下载', 'Download') }}
              </button>
            </div>
          </div>

          <p v-if="installMessage" class="terminal-install-message" :class="{ error: installError }">
            {{ installMessage }}
          </p>

          <pre v-if="installLog" class="code-block terminal-log">{{ installLog }}</pre>
        </section>
      </aside>

      <section class="terminal-main">
        <header class="terminal-toolbar">
          <div class="terminal-toolbar-left">
            <span class="status-pill" :class="connected ? 'tone-sage' : 'tone-neutral'">
              <span class="status-pill-dot"></span>
              <span>{{ connected ? text('终端已连接', 'Terminal connected') : text('终端未连接', 'Terminal disconnected') }}</span>
            </span>
            <span class="terminal-toolbar-chip">{{ text('当前终端', 'Active shell') }} · {{ activeCliLabel }}</span>
            <span class="terminal-toolbar-chip">{{ text('会话', 'Session') }} · {{ sessionPreview }}</span>
          </div>

          <div class="terminal-toolbar-actions">
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
          </div>
        </header>

        <div ref="termContainer" class="terminal-container"></div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { IDisposable, Terminal as XTermTerminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';
import type {
  TerminalGatewayAttachResponse,
  TerminalGatewayEvent,
  TerminalInstallRequestId,
  TerminalInstallStreamEvent,
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
import { copyTextToClipboard } from '../../shared/clipboard';
import {
  endTerminalSession,
  fetchTerminalLaunch,
  fetchTerminalStatus,
  streamTerminalInstall,
} from './api';

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const termContainer = ref<HTMLElement | null>(null);
const status = ref<TerminalStatusPayload | null>(null);
const statusLoading = ref(false);
const connected = ref(false);
const activeCliLabel = ref(text('普通 Shell', 'Plain shell'));
const installMessage = ref('');
const installError = ref(false);
const installLog = ref('');
const installingTarget = ref<TerminalInstallRequestId | ''>('');
const endingTerminal = ref(false);
const noticeMessage = ref<{ kind: 'success' | 'error'; text: string } | null>(null);

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

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';
const TERMINAL_RUNTIME_STORAGE_KEY = 'openclaw-studio.terminal.runtime';

const installBusy = computed(() => Boolean(installingTarget.value));
const termReady = ref(false);
const sessionPreview = computed(() => {
  if (!terminalSessionId.value) return text('未初始化', 'Uninitialized');
  return terminalSessionId.value.length <= 18
    ? terminalSessionId.value
    : `${terminalSessionId.value.slice(0, 8)}...${terminalSessionId.value.slice(-6)}`;
});
const agentCliBinaries = computed(() => (status.value?.binaries || []).filter((item) => item.category === 'agent'));
const marketplaceCliBinaries = computed(() => (status.value?.binaries || []).filter((item) => item.category === 'marketplace'));
const agentInstalledCount = computed(() => agentCliBinaries.value.filter((item) => item.installed).length);
const marketplaceInstalledCount = computed(() => marketplaceCliBinaries.value.filter((item) => item.installed).length);

function setNotice(kind: 'success' | 'error', message: string): void {
  noticeMessage.value = { kind, text: message };
}

async function copyInstallLog(): Promise<void> {
  if (!installLog.value) return;
  try {
    const copied = await copyTextToClipboard(installLog.value);
    if (!copied) {
      throw new Error(text('当前环境不支持复制到剪贴板。', 'Clipboard copy is not available in this environment.'));
    }
    setNotice('success', text('安装日志已复制。', 'Install log copied.'));
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('复制安装日志失败。', 'Failed to copy install log.'));
  }
}

function downloadInstallLog(): void {
  if (!installLog.value || typeof document === 'undefined') return;
  const blob = new Blob([installLog.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `terminal-install-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function generateSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `term-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isInvalidSessionId(value: unknown): boolean {
  const normalized = String(value || '').trim();
  return !normalized
    || normalized === '[object Object]'
    || normalized === 'objectObject'
    || normalized.toLowerCase() === 'objectobject';
}

function saveRuntime(): void {
  try {
    sessionStorage.setItem(TERMINAL_RUNTIME_STORAGE_KEY, JSON.stringify({
      instanceId: terminalInstanceId,
      outputSeq: lastOutputSeq,
      activeCliLabel: activeCliLabel.value,
    }));
  } catch {
    // ignore
  }
}

function clearRuntime(): void {
  terminalInstanceId = '';
  lastOutputSeq = 0;
  activeCliLabel.value = text('普通 Shell', 'Plain shell');
  try {
    sessionStorage.removeItem(TERMINAL_RUNTIME_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function restoreRuntime(): void {
  try {
    const raw = sessionStorage.getItem(TERMINAL_RUNTIME_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    terminalInstanceId = typeof parsed.instanceId === 'string' ? parsed.instanceId : '';
    lastOutputSeq = typeof parsed.outputSeq === 'number' ? parsed.outputSeq : 0;
    if (typeof parsed.activeCliLabel === 'string') {
      activeCliLabel.value = parsed.activeCliLabel;
    }
  } catch {
    // ignore
  }
}

function getSessionId(): string {
  if (terminalSessionId.value) return terminalSessionId.value;
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

function setSessionId(nextId: string): void {
  terminalSessionId.value = isInvalidSessionId(nextId) ? generateSessionId() : nextId;
  try {
    sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, terminalSessionId.value);
  } catch {
    // ignore
  }
}

async function refreshStatus(): Promise<void> {
  statusLoading.value = true;
  try {
    status.value = await fetchTerminalStatus();
  } catch (error) {
    setNotice('error', error instanceof Error ? error.message : text('读取终端状态失败。', 'Failed to load terminal status.'));
  } finally {
    statusLoading.value = false;
  }
}

function canLaunch(cli: TerminalLaunchCli): boolean {
  if (cli === 'bash') return connected.value;
  const binary = status.value?.binaries.find((item) => item.id === cli);
  return connected.value && Boolean(binary?.installed);
}

async function installCli(target: TerminalInstallRequestId): Promise<void> {
  if (installBusy.value) return;
  installingTarget.value = target;
  installMessage.value = '';
  installError.value = false;
  installLog.value = '';

  try {
    await streamTerminalInstall(target, (event: TerminalInstallStreamEvent) => {
      if (event.type === 'start') {
        installMessage.value = event.message || '';
        return;
      }

      if (event.type === 'attempt') {
        const lines = [
          event.command ? `$ ${event.command}` : '',
          event.message || '',
        ].filter(Boolean);
        installLog.value = `${installLog.value}${installLog.value ? '\n\n' : ''}${lines.join('\n')}`;
        return;
      }

      if (event.type === 'result') {
        const lines = [
          event.message || '',
          event.output || '',
          event.stderr || '',
          event.error ? `ERROR: ${event.error}` : '',
        ].filter(Boolean);
        installLog.value = `${installLog.value}${installLog.value ? '\n\n' : ''}${lines.join('\n')}`;
        return;
      }

      if (event.type === 'done' && event.response) {
        installError.value = !event.response.success;
        installMessage.value = event.response.message;
        status.value = event.response.status;
        return;
      }

      if (event.type === 'error') {
        installError.value = true;
        installMessage.value = event.message || text('安装失败。', 'Install failed.');
      }
    });
  } catch (error) {
    installError.value = true;
    installMessage.value = error instanceof Error ? error.message : text('安装失败。', 'Install failed.');
  } finally {
    installingTarget.value = '';
  }
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
  const response = await requestGatewayTerminal<TerminalGatewayAttachResponse>(
    STUDIO_TERMINAL_GATEWAY_METHODS.attach,
    {
      sid: getSessionId(),
      lastSeq: lastOutputSeq || undefined,
      instanceId: terminalInstanceId || undefined,
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
    instanceId: `studio-terminal-${getSessionId()}`,
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

function sendTerminalInput(data: string): void {
  if (usesGatewayRpc()) {
    if (!gatewayClient?.connected) return;
    void requestGatewayTerminal(
      STUDIO_TERMINAL_GATEWAY_METHODS.input,
      {
        sid: getSessionId(),
        data,
      },
    ).catch(() => {
      recoverGatewayAttachment();
    });
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(data);
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
  const params = new URLSearchParams({ sid: getSessionId() });
  if (lastOutputSeq > 0) params.set('lastSeq', String(lastOutputSeq));
  if (terminalInstanceId) params.set('instanceId', terminalInstanceId);

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
  setSessionId(generateSessionId());
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
}

function goToSkills(): void {
  void router.push('/skills');
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

  termInstance = term;
  termReady.value = true;
  resizeObserver = new ResizeObserver(() => syncTerminalSize());
  resizeObserver.observe(termContainer.value);

  term.onResize(({ cols, rows }) => {
    sendTerminalResize(cols, rows);
  });

  termDataDisposable = term.onData((data) => {
    sendTerminalInput(data);
  });

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

onMounted(async () => {
  intentionalClose = false;
  getSessionId();
  restoreRuntime();
  void refreshStatus();
  await initTerminal();
  document.addEventListener('visibilitychange', handleVisibility);
  window.addEventListener('focus', handleFocus);
  window.addEventListener('online', handleFocus);
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
});
</script>

<style scoped>
.terminal-page {
  gap: 16px;
  min-height: calc(100dvh - 180px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.terminal-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 14px;
  height: 100%;
  min-height: 0;
  align-items: stretch;
}

.terminal-sidebar {
  display: grid;
  gap: 10px;
  align-content: start;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}

.terminal-card {
  padding: 12px;
  border-radius: 10px;
  background: var(--glass-bg), var(--glass-accent);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-soft);
  display: grid;
  gap: 10px;
}

.terminal-card-runtime {
  border-color: rgba(111, 211, 255, 0.18);
}

.terminal-card-cli {
  border-color: rgba(109, 240, 207, 0.18);
}

.terminal-card-skills {
  border-color: rgba(255, 127, 143, 0.16);
}

.terminal-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.terminal-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.terminal-card-head h3,
.terminal-block-head h4 {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.terminal-card-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 10px;
}

.terminal-card-subhead {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}

.terminal-overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.terminal-overview-grid-compact {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.terminal-overview-item {
  display: grid;
  gap: 5px;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.terminal-overview-item span {
  color: var(--muted);
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.terminal-overview-item strong {
  color: var(--text);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.terminal-cli-list {
  display: grid;
  gap: 8px;
}

.terminal-cli-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 9px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.terminal-cli-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.terminal-cli-copy strong {
  color: var(--text);
  font-size: 12px;
}

.terminal-cli-copy span {
  color: var(--muted);
  font-size: 10px;
  line-height: 1.35;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.terminal-cli-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.terminal-launch-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.terminal-launch-grid .primary-button,
.terminal-launch-grid .secondary-button {
  min-height: 0;
  padding: 8px 9px;
  font-size: 11px;
}

.terminal-missing-block {
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 190, 122, 0.08);
  border: 1px solid rgba(255, 190, 122, 0.14);
}

.terminal-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.terminal-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.terminal-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--line);
  color: var(--text-soft);
  font-size: 11px;
}

.terminal-install-message {
  margin: 0;
  color: var(--mint);
  font-size: 12px;
  line-height: 1.55;
}

.terminal-install-message.error {
  color: var(--danger);
}

.terminal-log {
  max-height: 180px;
  overflow: auto;
  margin: 0;
}

.terminal-main {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #0f1419;
  box-shadow: var(--shadow-soft);
}

.terminal-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: rgba(15, 20, 25, 0.9);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.terminal-toolbar .secondary-button {
  background: rgba(255, 255, 255, 0.08);
  color: #eff9ff;
  border-color: rgba(255, 255, 255, 0.12);
}

.terminal-toolbar .secondary-button:hover {
  border-color: rgba(255, 190, 122, 0.24);
}

.terminal-toolbar-left,
.terminal-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.terminal-toolbar-chip {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #e6e1cf;
  font-size: 11px;
}

.terminal-container {
  min-height: 0;
  height: 100%;
  overflow: hidden;
  padding: 0 6px 6px;
}

.terminal-container :deep(.xterm),
.terminal-container :deep(.xterm-screen),
.terminal-container :deep(.xterm-viewport) {
  height: 100%;
}

.terminal-container :deep(.xterm-viewport) {
  overflow-y: auto !important;
}

:global(html[data-theme="light"]) .terminal-main {
  background: linear-gradient(180deg, #112233, #0f1419 18%, #0f1419 100%);
}

:global(html[data-theme="light"]) .terminal-toolbar {
  background: rgba(246, 250, 253, 0.96);
  border-bottom: 1px solid rgba(19, 32, 49, 0.1);
}

:global(html[data-theme="light"]) .terminal-toolbar-chip {
  background: rgba(19, 32, 49, 0.06);
  color: #16324b;
  border: 1px solid rgba(19, 32, 49, 0.1);
}

:global(html[data-theme="light"]) .terminal-toolbar .secondary-button {
  background: rgba(255, 255, 255, 0.92);
  color: #16324b;
  border-color: rgba(19, 32, 49, 0.12);
  box-shadow: none;
}

:global(html[data-theme="light"]) .terminal-toolbar .secondary-button:hover {
  background: rgba(255, 255, 255, 1);
  border-color: rgba(22, 185, 150, 0.24);
  color: #10233a;
}

@media (max-width: 1120px) {
  .terminal-layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
    min-height: 0;
  }

  .terminal-page {
    min-height: 0;
    overflow: visible;
  }

  .terminal-launch-grid,
  .terminal-overview-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .terminal-overview-grid,
  .terminal-cli-item,
  .terminal-launch-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .terminal-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .terminal-block-head,
  .terminal-card-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
