<template>
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <div class="terminal-workspace-body" :class="{ 'terminal-workspace-body--stage-only': compactInspectorMode }">
      <section class="terminal-workspace-stage">
        <TerminalSessionPane
          v-if="workspaceHydrated"
          :tabs="workspace.tabs.value"
          :active-session-id="workspace.activeSessionId.value"
          :active-session="workspace.sessions.value[workspace.activeSessionId.value || ''] || null"
          :queued-command="workspace.queuedCommand.value"
          @consume-queued-command="workspace.consumeQueuedCommand($event)"
          @select-session="handleSessionSelect"
          @close-session="handleSessionClose"
          @create-session="createSession"
          @rename-session="renameSession"
          @end-session="endSession"
          @delete-session="deleteSession"
          @session-attached="handleSessionAttached"
        />
        <div v-else class="terminal-workspace-stage-loading terminal-empty-state">
          {{ text('正在恢复终端会话…', 'Restoring terminal session...') }}
        </div>
      </section>

      <TerminalInspectorDrawer v-if="!compactInspectorMode" class="terminal-inspector-drawer" :open="true">
        <div class="terminal-inspector-rail-scroll">
          <TerminalInspectorContent
            :compact-mode="compactInspectorMode"
            :summary-expanded="inspectorSummaryExpanded"
            :inspector-busy="inspectorBusy"
            :active-session-title="activeSessionTitle"
            :session-count="terminalStatus?.sessionCount ?? 0"
            :missing-binary-count="terminalStatus?.skills?.missingBinaryCount ?? 0"
            :needs-setup-count="terminalStatus?.skills?.needsSetupCount ?? 0"
            :blocked-count="terminalStatus?.skills?.blockedCount ?? 0"
            :runtime-model-label="runtimeModelLabel"
            :launchable-cli-ids="launchableCliIds"
            :inspector-sections="inspectorSections"
            :inspector-section="inspectorSection"
            :visible-binaries="visibleBinaries"
            :openable-binary-ids="openableBinaryIds"
            :installable-binary-ids="installableBinaryIds"
            :missing-dependency-rows="missingDependencyRows"
            :install-feedback="installFeedback"
            :action-layers="actionLayers"
            :open-sessions="workspace.openSessions.value"
            :recent-sessions="workspace.recentSessions.value"
            :ended-sessions="workspace.endedSessions.value"
            :active-session-id="workspace.activeSessionId.value"
            :active-session-status="activeSession?.status || null"
            :recent-output="activeSessionRecentOutput"
            :recent-output-label="activeSessionRecentOutputLabel"
            :history-busy="sessionHistoryBusy"
            :history-entries="sessionHistoryEntries"
            :replay-command="replayCommand"
            @toggle-summary="toggleInspectorSummary"
            @refresh="refreshInspectorStatus"
            @select-section="inspectorSection = $event"
            @launch-cli="handleLaunchCli"
            @open-binary="handleOpenBinary"
            @install-binary="handleInstallBinary"
            @trigger-action="handleInspectorActionTrigger"
            @select-session="handleInspectorSessionSelect"
            @end-session="handleInspectorSessionEnd"
            @delete-session="handleInspectorSessionDelete"
            @replay-last-command="handleReplayLastCommand"
          />
        </div>
      </TerminalInspectorDrawer>
    </div>

    <button
      v-if="compactInspectorMode && !mobileInspectorOpen"
      type="button"
      class="terminal-mobile-inspector-trigger"
      @click="mobileInspectorOpen = true"
    >
      <span>{{ text('终端面板', 'Terminal Panel') }}</span>
      <strong>{{ activeInspectorSummary }}</strong>
    </button>

    <DialogRoot v-if="compactInspectorMode" v-model:open="mobileInspectorOpen">
      <DialogPortal>
        <DialogOverlay class="terminal-mobile-sheet-mask" />
        <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
          <section v-if="mobileInspectorOpen" class="terminal-mobile-sheet">
            <header class="terminal-mobile-sheet__head">
              <div class="terminal-mobile-sheet__copy">
                <DialogTitle as-child>
                  <strong>{{ text('终端面板', 'Terminal Panel') }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span>{{ text('把工具、依赖、动作和会话收进底部面板，优先给终端留出可视空间。', 'Move tools, dependencies, actions, and sessions into a bottom sheet so the terminal keeps more visible space.') }}</span>
                </DialogDescription>
              </div>
              <button
                type="button"
                class="terminal-mobile-sheet__close"
                :aria-label="text('关闭终端面板', 'Close terminal panel')"
                @click="mobileInspectorOpen = false"
              >
                ×
              </button>
            </header>

            <div class="terminal-mobile-sheet__body">
              <TerminalInspectorContent
                :compact-mode="compactInspectorMode"
                :summary-expanded="inspectorSummaryExpanded"
                :inspector-busy="inspectorBusy"
                :active-session-title="activeSessionTitle"
                :session-count="terminalStatus?.sessionCount ?? 0"
                :missing-binary-count="terminalStatus?.skills?.missingBinaryCount ?? 0"
                :needs-setup-count="terminalStatus?.skills?.needsSetupCount ?? 0"
                :blocked-count="terminalStatus?.skills?.blockedCount ?? 0"
                :runtime-model-label="runtimeModelLabel"
                :launchable-cli-ids="launchableCliIds"
                :inspector-sections="inspectorSections"
                :inspector-section="inspectorSection"
                :visible-binaries="visibleBinaries"
                :openable-binary-ids="openableBinaryIds"
                :installable-binary-ids="installableBinaryIds"
                :missing-dependency-rows="missingDependencyRows"
                :install-feedback="installFeedback"
                :action-layers="actionLayers"
                :open-sessions="workspace.openSessions.value"
                :recent-sessions="workspace.recentSessions.value"
                :ended-sessions="workspace.endedSessions.value"
                :active-session-id="workspace.activeSessionId.value"
                :active-session-status="activeSession?.status || null"
                :recent-output="activeSessionRecentOutput"
                :recent-output-label="activeSessionRecentOutputLabel"
                :history-busy="sessionHistoryBusy"
                :history-entries="sessionHistoryEntries"
                :replay-command="replayCommand"
                @toggle-summary="toggleInspectorSummary"
                @refresh="refreshInspectorStatus"
                @select-section="inspectorSection = $event"
                @launch-cli="handleLaunchCli"
                @open-binary="handleOpenBinary"
                @install-binary="handleInstallBinary"
                @trigger-action="handleInspectorActionTrigger"
                @select-session="handleInspectorSessionSelect"
                @end-session="handleInspectorSessionEnd"
                @delete-session="handleInspectorSessionDelete"
                @replay-last-command="handleReplayLastCommand"
              />
            </div>
          </section>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import type {
  TerminalBinaryId,
  TerminalLaunchCli,
  TerminalRecentOutputSummary,
} from '../../../../../types/terminal';
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import type { TerminalActionItem, TerminalActionLayer } from './terminal-action-catalog';
import TerminalInspectorContent from './TerminalInspectorContent.vue';
import TerminalInspectorDrawer from './TerminalInspectorDrawer.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import { buildTerminalSessionDisplayTitle } from './terminal-session-selectors';
import {
  deleteTerminalSession,
  endTerminalSession,
  fetchPersistedTerminalSessions,
  fetchPersistedTerminalSessionDescriptor,
  fetchPersistedTerminalSessionLedger,
  fetchTerminalActions,
  fetchTerminalLaunch,
  fetchTerminalStatus,
  renameTerminalSession,
} from './api';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { buildTerminalSessionHistory, type TerminalSessionHistoryEntry } from './terminal-session-history';
import { bindTerminalRouteSync } from './terminal-route-sync';
import { createTerminalWorkspaceState } from './terminal-workspace-state';
import './terminal-workspace.css';

type InspectorSectionKey = 'tools' | 'dependencies' | 'actions' | 'sessions';

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';

const workspace = createTerminalWorkspaceState();
const localActionLayers = buildTerminalActionLayers();
const actionLayers = ref<TerminalActionLayer[]>(localActionLayers);
const terminalStatus = ref<Awaited<ReturnType<typeof fetchTerminalStatus>> | null>(null);
const inspectorBusy = ref(false);
const inspectorSection = ref<InspectorSectionKey>('tools');
const compactInspectorMode = ref(false);
const inspectorSummaryExpanded = ref(true);
const mobileInspectorOpen = ref(false);
const workspaceHydrated = ref(false);
const sessionHistoryBusy = ref(false);
const sessionHistoryEntries = ref<TerminalSessionHistoryEntry[]>([]);
const installFeedback = ref<{
  kind: 'info' | 'success' | 'error';
  message: string;
  logs: string[];
}>({
  kind: 'info',
  message: '',
  logs: [],
});
let resolveWorkspaceReady: (() => void) | null = null;
const workspaceReady = new Promise<void>((resolve) => {
  resolveWorkspaceReady = resolve;
});

const activeSession = computed(() => workspace.sessions.value[workspace.activeSessionId.value || ''] || null);
const activeSessionTitle = computed(() => {
  if (!activeSession.value) {
    return text('未激活', 'Inactive');
  }
  const displayTitle = buildTerminalSessionDisplayTitle({
    title: activeSession.value.title,
    sessionId: activeSession.value.sessionId,
  });
  return text(displayTitle.labelZh, displayTitle.labelEn);
});
const activeSessionRecentOutput = computed<TerminalRecentOutputSummary | null>(() => {
  const summary = activeSession.value?.recentOutputSummary;
  if (!summary?.tailText) return null;
  return summary;
});
const replayCommand = computed(() => activeSession.value?.recentOutputSummary?.lastCommandHint || null);
const activeSessionRecentOutputLabel = computed(() => {
  if (!activeSessionRecentOutput.value) return '';
  if (activeSession.value?.status === 'completed') return text('最近输出（已完成）', 'Recent Output (Completed)');
  if (activeSession.value?.status === 'failed') return text('最近输出（失败）', 'Recent Output (Failed)');
  return text('最近输出', 'Recent Output');
});
const runtimeModelLabel = computed(() => {
  const provider = String(terminalStatus.value?.config?.provider || '').trim();
  const model = String(terminalStatus.value?.config?.model || '').trim();
  if (provider && model) return `${provider} / ${model}`;
  return model || text('未配置', 'Not configured');
});
const visibleBinaries = computed(() =>
  (terminalStatus.value?.binaries || []).filter((binary) => binary.id !== 'bash'),
);
const missingDependencyRows = computed(() => {
  const binaries = terminalStatus.value?.binaries || [];
  const installTargets = terminalStatus.value?.installTargets || [];
  return (terminalStatus.value?.skills?.missingBinaries || []).map((item) => {
    const matchedBinary = binaries.find((binary) => binary.binary === item.binary || binary.id === item.binary);
    const binaryId = matchedBinary?.id || null;
    return {
      binary: item.binary,
      label: matchedBinary?.label || item.binary,
      binaryId,
      skills: [...item.skills].sort((left, right) => left.localeCompare(right)),
    };
  });
});
const inspectorSections = computed(() => [
  {
    key: 'tools' as const,
    label: text('工具', 'Tools'),
    count: visibleBinaries.value.length,
  },
  {
    key: 'dependencies' as const,
    label: text('依赖', 'Deps'),
    count: missingDependencyRows.value.length,
  },
  {
    key: 'actions' as const,
    label: text('动作', 'Actions'),
    count: actionLayers.value.reduce((total, layer) => total + layer.items.length, 0),
  },
  {
    key: 'sessions' as const,
    label: text('会话', 'Sessions'),
    count:
      workspace.openSessions.value.length +
      workspace.recentSessions.value.length +
      workspace.endedSessions.value.length,
  },
]);
const showExpandedInspectorSummary = computed(
  () => !compactInspectorMode.value || inspectorSummaryExpanded.value,
);
const launchableCliIds = computed<TerminalLaunchCli[]>(() =>
  (['claude', 'codex', 'opencode', 'bash'] as TerminalLaunchCli[]).filter((cli) => canLaunch(cli)),
);
const openableBinaryIds = computed<TerminalBinaryId[]>(() =>
  (visibleBinaries.value || [])
    .filter((binary) => canQueueBinaryCommand(binary.id))
    .map((binary) => binary.id),
);
const installableBinaryIds = computed<TerminalBinaryId[]>(() =>
  (visibleBinaries.value || [])
    .filter((binary) => shouldShowInstall(binary.id))
    .map((binary) => binary.id),
);
const activeInspectorSummary = computed(() => {
  const current = inspectorSections.value.find((item) => item.key === inspectorSection.value);
  if (!current) return '';
  return `${current.label} ${current.count}`;
});
let historyRequestSeq = 0;

function syncCompactInspectorMode(): void {
  const nextCompactMode =
    typeof window !== 'undefined' && window.innerWidth <= 720;
  compactInspectorMode.value = nextCompactMode;
  if (!nextCompactMode) {
    inspectorSummaryExpanded.value = true;
    mobileInspectorOpen.value = false;
  }
}

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

async function loadSessionHistory(sessionId: string | null | undefined): Promise<void> {
  const normalizedSessionId = String(sessionId || '').trim();
  const requestSeq = ++historyRequestSeq;
  if (!normalizedSessionId) {
    sessionHistoryEntries.value = [];
    sessionHistoryBusy.value = false;
    return;
  }

  sessionHistoryBusy.value = true;
  try {
    const events = await fetchPersistedTerminalSessionLedger(normalizedSessionId);
    if (requestSeq !== historyRequestSeq) return;
    sessionHistoryEntries.value = buildTerminalSessionHistory(events, { limit: 60 });
    if (
      activeSession.value &&
      activeSession.value.status !== 'running' &&
      activeSession.value.status !== 'detached' &&
      sessionHistoryEntries.value.length &&
      inspectorSection.value !== 'sessions'
    ) {
      inspectorSection.value = 'sessions';
    }
  } catch {
    if (requestSeq !== historyRequestSeq) return;
    sessionHistoryEntries.value = [];
  } finally {
    if (requestSeq === historyRequestSeq) {
      sessionHistoryBusy.value = false;
    }
  }
}

function refreshSessionHistoryLater(
  sessionId: string | null | undefined,
  delayMs = 1200,
): void {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;
  globalThis.setTimeout(() => {
    void loadSessionHistory(normalizedSessionId);
  }, delayMs);
}

function toggleInspectorSummary(): void {
  inspectorSummaryExpanded.value = !inspectorSummaryExpanded.value;
}

function closeMobileInspectorIfCompact(): void {
  if (compactInspectorMode.value) {
    mobileInspectorOpen.value = false;
  }
}

function buildTerminalRoutePath(sessionId: string | null | undefined): string {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return '/terminal';
  }
  return `/terminal/${encodeURIComponent(normalizedSessionId)}`;
}

async function navigateToSession(sessionId: string | null | undefined): Promise<void> {
  const targetPath = buildTerminalRoutePath(sessionId);
  if (router.currentRoute.value.path === targetPath) {
    return;
  }
  try {
    await router.push({ path: targetPath });
  } catch {
    // ignore navigation duplication or transient route failures
  }
}

async function syncRouteToWorkspaceActiveSession(): Promise<void> {
  await navigateToSession(workspace.activeSessionId.value);
}

async function syncRouteLockedSession(sessionId: string | null | undefined): Promise<void> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId || !workspaceHydrated.value) return;

  const fallbackSession = workspace.sessions.value[normalizedSessionId] || null;
  let descriptor = fallbackSession;
  if (!descriptor || descriptor.title === normalizedSessionId) {
    try {
      descriptor = await fetchPersistedTerminalSessionDescriptor(normalizedSessionId);
    } catch {
      descriptor = fallbackSession;
    }
  }

  if (descriptor) {
    workspace.registerSession({
      ...descriptor,
      sessionId: normalizedSessionId,
    });
  }
  workspace.setActiveSession(normalizedSessionId);
}

onMounted(async () => {
  syncCompactInspectorMode();
  window.addEventListener('resize', syncCompactInspectorMode);

  const normalizedSessionId = String(route.params.sessionId || '').trim();
  if (normalizedSessionId && typeof globalThis.sessionStorage?.setItem === 'function') {
    globalThis.sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId);
  }

  try {
    const summary = await fetchPersistedTerminalSessions();
    workspace.hydrateSessions(summary.sessions || []);
    if (normalizedSessionId) {
      await syncRouteLockedSession(normalizedSessionId);
    }
  } catch {
    // keep route/local workspace as-is when persisted descriptors are unavailable
  } finally {
    workspaceHydrated.value = true;
    resolveWorkspaceReady?.();
    resolveWorkspaceReady = null;
  }

  await refreshInspectorStatus();

  try {
    const summary = await fetchTerminalActions();
    if (Array.isArray(summary.groups) && summary.groups.length) {
      actionLayers.value = summary.groups.map((group) => ({
        key: group.key,
        titleZh: group.titleZh,
        titleEn: group.titleEn,
        descriptionZh: group.descriptionZh,
        descriptionEn: group.descriptionEn,
        items: group.items.map((item) => ({
          key: item.key,
          labelZh: item.labelZh,
          labelEn: item.labelEn,
          descriptionZh: item.descriptionZh,
          descriptionEn: item.descriptionEn,
          command: item.command,
          recommendedTitle: item.recommendedTitle,
          runMode: item.runMode,
        })),
      }));
    }
  } catch {
    actionLayers.value = localActionLayers;
  }
});

watch(
  () => activeSession.value?.sessionId,
  (sessionId) => {
    void loadSessionHistory(sessionId);
  },
  { immediate: true },
);

watch(
  () => inspectorSection.value,
  (section) => {
    if (section !== 'sessions') return;
    void loadSessionHistory(activeSession.value?.sessionId);
  },
);

watch(
  () => [workspaceHydrated.value, route.params.sessionId] as const,
  ([hydrated, sessionId]) => {
    if (!hydrated) return;
    void syncRouteLockedSession(String(sessionId || ''));
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncCompactInspectorMode);
});

function buildSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `term-${Date.now().toString(36)}`;
}

function buildUntitledSessionTitle(): string {
  const baseTitle = text('终端', 'Shell');
  const nextIndex = workspace.tabs.value.filter((session) => session.title.startsWith(baseTitle)).length + 1;
  if (nextIndex <= 1) {
    return baseTitle;
  }
  return `${baseTitle} ${nextIndex}`;
}

async function ensureWorkspaceReady(): Promise<void> {
  if (workspaceHydrated.value) return;
  await workspaceReady;
}

function ensureCommandLineBreak(command: string): string {
  const normalized = String(command || '');
  if (!normalized) return '';
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

async function openCommandSession(options: {
  title: string;
  command?: string;
  source?: TerminalSessionDescriptor['source'];
}): Promise<string> {
  await ensureWorkspaceReady();
  const sessionId = buildSessionId();
  workspace.registerSession({
    sessionId,
    title: String(options.title || text('终端', 'Shell')).trim() || text('终端', 'Shell'),
    status: 'running',
    source: options.source || 'manual',
    canResume: true,
    controlState: 'controller',
    updatedAt: new Date().toISOString(),
  });
  workspace.setActiveSession(sessionId);
  await navigateToSession(sessionId);
  if (options.command) {
    workspace.setQueuedCommand(sessionId, ensureCommandLineBreak(options.command));
    refreshSessionHistoryLater(sessionId);
  }
  return sessionId;
}

async function createSession(): Promise<string> {
  return openCommandSession({
    title: buildUntitledSessionTitle(),
    source: 'manual',
  });
}

function handleSessionAttached(session: TerminalSessionDescriptor): void {
  const sessionId = String(session?.sessionId || '').trim();
  if (!sessionId) return;
  const lockedRouteSessionId = String(route.params.sessionId || '').trim();
  if (lockedRouteSessionId && lockedRouteSessionId !== sessionId) {
    return;
  }
  const preserveRouteLockedActiveSession =
    Boolean(lockedRouteSessionId) &&
    lockedRouteSessionId !== sessionId;

  const existing = workspace.sessions.value[sessionId] || null;
  const preservedTitle =
    existing?.title && existing.title !== sessionId
      ? existing.title
      : session.title;

  workspace.registerSession({
    ...session,
    title: preservedTitle || session.title,
  });
  if (!preserveRouteLockedActiveSession) {
    workspace.setActiveSession(session.sessionId);
  }

  if (
    preservedTitle &&
    preservedTitle !== session.title &&
    preservedTitle !== sessionId
  ) {
    void renameTerminalSession(sessionId, preservedTitle).catch(() => {
      // ignore descriptor sync failures
    });
  }
}

function findActionItem(actionKey: string): TerminalActionItem | null {
  const normalizedKey = String(actionKey || '').trim();
  if (!normalizedKey) return null;

  for (const layer of actionLayers.value) {
    const item = layer.items.find((candidate) => candidate.key === normalizedKey);
    if (item) return item;
  }

  return null;
}

function resolveBinaryLabel(binaryId: TerminalBinaryId): string {
  if (binaryId === 'bash') {
    return text('终端', 'Shell');
  }
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  return binary?.label || binaryId;
}

function resolveCliTitle(cli: TerminalLaunchCli, backendLabel?: string): string {
  if (cli === 'bash') {
    return text('终端', 'Shell');
  }
  return String(backendLabel || resolveBinaryLabel(cli)).trim() || resolveBinaryLabel(cli);
}

async function handleActionTrigger(actionKey: string): Promise<void> {
  const item = findActionItem(actionKey);
  if (!item?.command) return;

  await openCommandSession({
    title: text(item.recommendedTitle || item.labelZh, item.labelEn),
    command: item.command,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}

function canLaunch(cli: TerminalLaunchCli): boolean {
  if (cli === 'bash') return true;
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === cli);
  return Boolean(binary?.installed);
}

async function launchCli(cli: TerminalLaunchCli): Promise<void> {
  if (!canLaunch(cli)) return;

  try {
    const result = await fetchTerminalLaunch({ cli });
    await openCommandSession({
      title: resolveCliTitle(cli, result.label),
      command: result.command,
      source: 'manual',
    });
    closeMobileInspectorIfCompact();
  } catch {
    const fallbackCommands: Record<TerminalLaunchCli, string> = {
      claude: 'claude',
      codex: 'codex',
      opencode: 'opencode',
      bash: 'bash',
    };
    await openCommandSession({
      title: resolveCliTitle(cli),
      command: fallbackCommands[cli],
      source: 'manual',
    });
    closeMobileInspectorIfCompact();
  }
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
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  return Boolean(binary?.installed);
}

async function queueBinaryCommand(binaryId: TerminalBinaryId): Promise<void> {
  const command = BINARY_COMMANDS[binaryId];
  if (!command || !canQueueBinaryCommand(binaryId)) {
    return;
  }
  await openCommandSession({
    title: resolveBinaryLabel(binaryId),
    command,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}

function shouldShowInstall(binaryId: TerminalBinaryId): boolean {
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  if (!binary || binary.installed || !binary.installSupported) {
    return false;
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

async function queueInstallCommand(binaryId: TerminalBinaryId): Promise<void> {
  if (!canInstall(binaryId)) return;
  const installCommand = getInstallCommand(binaryId);
  if (!installCommand) return;

  const label = resolveBinaryLabel(binaryId);
  await openCommandSession({
    title: `${text('安装', 'Install')} ${label}`,
    command: installCommand,
    source: 'manual',
  });
  installFeedback.value = {
    kind: 'info',
    message: text(`已在新标签注入 ${label} 的安装命令。`, `Injected the ${label} install command into a new tab.`),
    logs: [installCommand],
  };
  refreshStatusLater();
  closeMobileInspectorIfCompact();
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
  const wasActive = workspace.activeSessionId.value === normalized;

  try {
    await endTerminalSession({ sid: normalized });
  } catch {
    return;
  }

  workspace.endSession(normalized);
  if (wasActive) {
    await syncRouteToWorkspaceActiveSession();
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const wasActive = workspace.activeSessionId.value === normalized;

  try {
    await deleteTerminalSession(normalized);
  } catch {
    return;
  }

  workspace.deleteSession(normalized);
  if (wasActive) {
    await syncRouteToWorkspaceActiveSession();
  }
}

async function handleLaunchCli(cli: TerminalLaunchCli): Promise<void> {
  await launchCli(cli);
}

async function handleOpenBinary(binaryId: TerminalBinaryId): Promise<void> {
  await queueBinaryCommand(binaryId);
}

async function handleInstallBinary(binaryId: TerminalBinaryId): Promise<void> {
  await queueInstallCommand(binaryId);
}

async function handleInspectorActionTrigger(actionKey: string): Promise<void> {
  await handleActionTrigger(actionKey);
}

async function handleSessionSelect(sessionId: string): Promise<void> {
  workspace.openTab(sessionId);
  await navigateToSession(sessionId);
  void loadSessionHistory(sessionId);
}

function handleSessionClose(sessionId: string): void {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const wasActive = workspace.activeSessionId.value === normalized;
  workspace.closeTab(normalized);
  if (wasActive) {
    void syncRouteToWorkspaceActiveSession();
  }
}

async function handleInspectorSessionSelect(sessionId: string): Promise<void> {
  workspace.openTab(sessionId);
  await navigateToSession(sessionId);
  void loadSessionHistory(sessionId);
  closeMobileInspectorIfCompact();
}

async function handleInspectorSessionEnd(sessionId: string): Promise<void> {
  await endSession(sessionId);
}

async function handleInspectorSessionDelete(sessionId: string): Promise<void> {
  await deleteSession(sessionId);
}

async function handleReplayLastCommand(command: string): Promise<void> {
  const normalizedCommand = String(command || '').trim();
  if (!normalizedCommand) return;
  await openCommandSession({
    title: text('重放命令', 'Replay Command'),
    command: normalizedCommand,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}
</script>
