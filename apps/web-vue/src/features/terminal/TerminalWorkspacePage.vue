<template>
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <div class="terminal-workspace-body">
      <section class="terminal-workspace-stage">
        <TerminalSessionPane
          :tabs="workspace.tabs.value"
          :active-session-id="workspace.activeSessionId.value"
          :active-session="workspace.sessions.value[workspace.activeSessionId.value || ''] || null"
          :header-controls="headerControls"
          :queued-command="workspace.queuedCommand.value"
          @consume-queued-command="workspace.consumeQueuedCommand"
          @select-session="workspace.setActiveSession"
          @close-session="workspace.closeTab"
          @create-session="createSession"
          @rename-session="renameSession"
          @end-session="endSession"
          @delete-session="deleteSession"
          @session-attached="handleSessionAttached"
        />
      </section>

      <TerminalInspectorDrawer class="terminal-inspector-drawer" :open="true">
        <div class="terminal-inspector-rail-scroll">
          <section class="terminal-inspector-tooling">
            <h3>Agent CLI / Skills</h3>

            <div class="terminal-inspector-tooling-summary">
              <span>会话：{{ workspace.activeSessionId.value || '未激活' }}</span>
              <span>终端实例：{{ terminalStatus?.sessionCount ?? 0 }}</span>
              <span>缺失依赖：{{ terminalStatus?.skills?.missingBinaryCount ?? 0 }}</span>
            </div>

            <div class="terminal-inspector-tooling-actions">
              <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('claude')" @click="launchCli('claude')">Claude</button>
              <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('codex')" @click="launchCli('codex')">Codex</button>
              <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('opencode')" @click="launchCli('opencode')">OpenCode</button>
              <button type="button" class="secondary-button compact-button" :disabled="!canLaunch('bash')" @click="launchCli('bash')">Shell</button>
              <button type="button" class="secondary-button compact-button" :disabled="inspectorBusy" @click="refreshInspectorStatus">刷新状态</button>
            </div>

            <ul v-if="terminalStatus?.binaries?.length" class="terminal-tooling-status-list terminal-inspector-tooling-grid">
              <li
                v-for="binary in terminalStatus.binaries"
                :key="binary.id"
                class="terminal-tooling-status-item"
              >
                <div class="terminal-tooling-status-main">
                  <strong>{{ binary.label }}</strong>
                  <span class="terminal-tooling-status-chip" :data-installed="binary.installed ? 'true' : 'false'">
                    {{ binary.installed ? '已安装' : '未安装' }}
                  </span>
                </div>
                <div class="terminal-tooling-status-meta">
                  <span v-if="binary.path">路径：{{ binary.path }}</span>
                  <span v-else>命令：{{ binary.binary }}</span>
                  <span v-if="binary.version">版本：{{ binary.version }}</span>
                  <span v-if="binary.packageName">包：{{ binary.packageName }}</span>
                </div>
                <div class="terminal-tooling-status-actions">
                  <button
                    v-if="binary.id !== 'bash'"
                    type="button"
                    class="secondary-button compact-button"
                    :disabled="!canQueueBinaryCommand(binary.id)"
                    @click="queueBinaryCommand(binary.id)"
                  >
                    打开
                  </button>
                  <button
                    v-if="shouldShowInstall(binary.id)"
                    type="button"
                    class="secondary-button compact-button"
                    :disabled="!canInstall(binary.id)"
                    @click="queueInstallCommand(binary.id)"
                  >
                    安装（注入终端）
                  </button>
                </div>
              </li>
            </ul>

            <div class="terminal-inspector-tooling-detection">
              <div>ClawHub：{{ terminalStatus?.skills?.marketplaceCli?.clawhubInstalled ? '已安装' : '未安装' }}</div>
              <div>SkillHub：{{ terminalStatus?.skills?.marketplaceCli?.skillhubInstalled ? '已安装' : '未安装' }}</div>
            </div>

            <div v-if="activeSessionRecentOutput" class="terminal-inspector-recent-output">
              <strong>{{ activeSessionRecentOutputLabel }}</strong>
              <pre>{{ activeSessionRecentOutput.tailText }}</pre>
              <div v-if="activeSessionRecentOutput.lastError">最近错误：{{ activeSessionRecentOutput.lastError }}</div>
              <div v-if="activeSessionRecentOutput.lastCommandHint">最近命令：{{ activeSessionRecentOutput.lastCommandHint }}</div>
              <div v-if="activeSessionRecentOutput.exitSummary">退出摘要：{{ activeSessionRecentOutput.exitSummary }}</div>
            </div>

            <div v-if="installFeedback.message || installFeedback.logs.length" class="terminal-install-feedback" :data-kind="installFeedback.kind">
              <strong>{{ installFeedback.message }}</strong>
              <pre v-if="installFeedback.logs.length">{{ installFeedback.logs.join('\n') }}</pre>
            </div>
          </section>
          <TerminalActionPanel :action-layers="actionLayers" @trigger="handleActionTrigger" />
        </div>
      </TerminalInspectorDrawer>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  TerminalBinaryId,
  TerminalLaunchCli,
  TerminalRecentOutputSummary,
} from '../../../../../types/terminal';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import type { TerminalActionLayer } from './terminal-action-catalog';
import TerminalActionPanel from './TerminalActionPanel.vue';
import TerminalInspectorDrawer from './TerminalInspectorDrawer.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import {
  deleteTerminalSession,
  endTerminalSession,
  fetchPersistedTerminalSessions,
  fetchTerminalActions,
  fetchTerminalStatus,
  renameTerminalSession,
} from './api';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { bindTerminalRouteSync } from './terminal-route-sync';
import { createTerminalWorkspaceState } from './terminal-workspace-state';
import './terminal-workspace.css';

const route = useRoute();
const router = useRouter();

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';

const TERMINAL_ACTION_COMMANDS: Record<string, string> = {
  'health-check': 'studio health-check',
  'collect-diagnostics': 'studio diagnostics collect',
  'gateway-logs': 'npm run dev:api',
  'env-check': 'node scripts/start-standalone-api.mjs --help',
};

const workspace = createTerminalWorkspaceState();
const localActionLayers = buildTerminalActionLayers();
const actionLayers = ref<TerminalActionLayer[]>(localActionLayers);
const terminalStatus = ref<Awaited<ReturnType<typeof fetchTerminalStatus>> | null>(null);
const inspectorBusy = ref(false);
const installFeedback = ref<{
  kind: 'info' | 'success' | 'error';
  message: string;
  logs: string[];
}>({
  kind: 'info',
  message: '',
  logs: [],
});

const activeSession = computed(() => workspace.sessions.value[workspace.activeSessionId.value || ''] || null);
const activeSessionRecentOutput = computed<TerminalRecentOutputSummary | null>(() => {
  const summary = activeSession.value?.recentOutputSummary;
  if (!summary?.tailText) return null;
  return summary;
});
const activeSessionRecentOutputLabel = computed(() => {
  if (!activeSessionRecentOutput.value) return '';
  if (activeSession.value?.status === 'completed') return '最近输出（已完成）';
  if (activeSession.value?.status === 'failed') return '最近输出（失败）';
  return '最近输出';
});

const headerControls = computed(() => ({
  canLaunch,
  launchCli,
}));

bindTerminalRouteSync({
  activeSessionId: workspace.activeSessionId,
  setActiveSession: workspace.setActiveSession,
  registerSession: workspace.registerSession,
  route,
  router,
});

async function refreshInspectorStatus(): Promise<void> {
  inspectorBusy.value = true;
  try {
    terminalStatus.value = await fetchTerminalStatus();
  } catch {
    terminalStatus.value = null;
  } finally {
    inspectorBusy.value = false;
  }
}

function refreshStatusLater(delayMs = 1800): void {
  globalThis.setTimeout(() => {
    void refreshInspectorStatus();
  }, delayMs);
}

onMounted(async () => {
  const normalizedSessionId = String(route.params.sessionId || '').trim();
  if (normalizedSessionId && typeof globalThis.sessionStorage?.setItem === 'function') {
    globalThis.sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId);
  }

  try {
    const summary = await fetchPersistedTerminalSessions();
    workspace.hydrateSessions(summary.sessions || []);
  } catch {
    // keep route/local workspace as-is when persisted descriptors are unavailable
  }

  await refreshInspectorStatus();

  try {
    const summary = await fetchTerminalActions();
    if (Array.isArray(summary.groups) && summary.groups.length) {
      actionLayers.value = summary.groups.map((group) => ({
        key: group.key,
        titleZh: group.titleZh,
        titleEn: group.titleEn,
        items: group.items.map((item) => ({
          key: item.key,
          labelZh: item.labelZh,
          labelEn: item.labelEn,
          command: item.command,
        })),
      }));
    }
  } catch {
    actionLayers.value = localActionLayers;
  }
});

function createSession(): void {
  const sessionId = globalThis.crypto?.randomUUID?.() || `term-${Date.now().toString(36)}`;
  workspace.registerSession({
    sessionId,
    title: '新终端会话',
    status: 'running',
    source: 'manual',
    canResume: true,
    controlState: 'controller',
    updatedAt: new Date().toISOString(),
  });
  workspace.setActiveSession(sessionId);
}

function handleSessionAttached(session: TerminalSessionDescriptor): void {
  const sessionId = String(session?.sessionId || '').trim();
  if (!sessionId) return;

  workspace.registerSession(session);
  workspace.setActiveSession(session.sessionId);
}

function resolveActionCommand(actionKey: string): string {
  const normalizedKey = String(actionKey || '').trim();
  if (!normalizedKey) return '';

  for (const layer of actionLayers.value) {
    const item = layer.items.find((candidate) => candidate.key === normalizedKey);
    if (item?.command) return item.command;
  }

  return TERMINAL_ACTION_COMMANDS[normalizedKey] || '';
}

function ensureActiveSession(): void {
  if (!workspace.activeSessionId.value) {
    createSession();
  }
}

function handleActionTrigger(actionKey: string): void {
  const command = resolveActionCommand(actionKey);
  if (!command) return;
  ensureActiveSession();
  workspace.setQueuedCommand(`${command}\n`);
}

function canLaunch(cli: TerminalLaunchCli): boolean {
  if (cli === 'bash') return true;
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === cli);
  return Boolean(binary?.installed);
}

function launchCli(cli: TerminalLaunchCli): void {
  const commandByCli: Record<TerminalLaunchCli, string> = {
    claude: 'claude',
    codex: 'codex',
    opencode: 'opencode',
    bash: 'bash',
  };
  ensureActiveSession();
  workspace.setQueuedCommand(`${commandByCli[cli]}\n`);
}

const BINARY_COMMANDS: Partial<Record<TerminalBinaryId, string>> = {
  claude: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  clawhub: 'clawhub',
  skillhub: 'skillhub',
};

function canQueueBinaryCommand(binaryId: TerminalBinaryId): boolean {
  const command = BINARY_COMMANDS[binaryId];
  if (!command) return false;
  if (binaryId === 'bash') return true;
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  return Boolean(binary?.installed);
}

function queueBinaryCommand(binaryId: TerminalBinaryId): void {
  const command = BINARY_COMMANDS[binaryId];
  if (!command || !canQueueBinaryCommand(binaryId)) {
    return;
  }
  ensureActiveSession();
  workspace.setQueuedCommand(`${command}\n`);
}

function shouldShowInstall(binaryId: TerminalBinaryId): boolean {
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  if (!binary || binary.installed || !binary.installSupported) {
    return false;
  }
  if (binary.id === 'clawhub') {
    return !Boolean(terminalStatus.value?.skills?.marketplaceCli?.clawhubInstalled);
  }
  if (binary.id === 'skillhub') {
    return !Boolean(terminalStatus.value?.skills?.marketplaceCli?.skillhubInstalled);
  }
  return Boolean(terminalStatus.value?.installTargets?.some((target) => target.id === binaryId));
}

function canInstall(binaryId: TerminalBinaryId): boolean {
  return !inspectorBusy.value && Boolean(getInstallCommand(binaryId));
}

function getInstallCommand(binaryId: TerminalBinaryId): string {
  const installTarget = terminalStatus.value?.installTargets?.find((target) => target.id === binaryId);
  return String(installTarget?.installHint || '').trim();
}

function queueInstallCommand(binaryId: TerminalBinaryId): void {
  if (!canInstall(binaryId)) return;
  const installCommand = getInstallCommand(binaryId);
  if (!installCommand) return;
  ensureActiveSession();
  workspace.setQueuedCommand(`${installCommand}\n`);
  installFeedback.value = {
    kind: 'info',
    message: `已发送安装命令到当前终端：${binaryId}`,
    logs: [installCommand],
  };
  refreshStatusLater();
}

async function renameSession(payload: { sessionId: string; title: string }): Promise<void> {
  const normalized = String(payload?.sessionId || '').trim();
  const normalizedTitle = String(payload?.title || '').trim();
  if (!normalized || !normalizedTitle) return;

  try {
    await renameTerminalSession(normalized, normalizedTitle);
  } catch {
    return;
  }

  workspace.renameSession(normalized, normalizedTitle);
}

async function endSession(sessionId: string): Promise<void> {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;

  try {
    await endTerminalSession({ sid: normalized });
  } catch {
    return;
  }

  workspace.endSession(normalized);
}

async function deleteSession(sessionId: string): Promise<void> {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;

  try {
    await deleteTerminalSession(normalized);
  } catch {
    return;
  }

  workspace.deleteSession(normalized);
}

</script>
