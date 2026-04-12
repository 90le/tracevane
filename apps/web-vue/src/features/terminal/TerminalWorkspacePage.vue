<template>
  <section class="terminal-workspace-shell" data-testid="terminal-workspace-shell">
    <TerminalTabRail
      :tabs="workspace.tabs.value"
      :active-session-id="workspace.activeSessionId.value"
      @select="workspace.setActiveSession"
      @close="workspace.closeTab"
      @create="createSession"
    />

    <main class="terminal-workspace-main">
      <TerminalSessionPane :active-session-id="workspace.activeSessionId.value" />
      <TerminalActionPanel :action-layers="actionLayers" @trigger="handleActionTrigger" />
      <TerminalRecentSessionRail
        :sessions="workspace.recoverableSessions.value"
        :active-session-id="workspace.activeSessionId.value"
        @select="workspace.setActiveSession"
      />
    </main>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { TerminalActionLayer } from './terminal-action-catalog';
import TerminalActionPanel from './TerminalActionPanel.vue';
import TerminalRecentSessionRail from './TerminalRecentSessionRail.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { fetchTerminalActions, fetchTerminalSessions } from './api';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { bindTerminalRouteSync } from './terminal-route-sync';
import { createTerminalWorkspaceState } from './terminal-workspace-state';
import './terminal-workspace.css';

const route = useRoute();
const router = useRouter();

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';

const workspace = createTerminalWorkspaceState();
const localActionLayers = buildTerminalActionLayers();
const actionLayers = ref<TerminalActionLayer[]>(localActionLayers);

bindTerminalRouteSync({
  activeSessionId: workspace.activeSessionId,
  setActiveSession: workspace.setActiveSession,
  registerSession: workspace.registerSession,
  route,
  router,
});

onMounted(async () => {
  const normalizedSessionId = String(route.params.sessionId || '').trim();
  const sessionRouteKey = normalizedSessionId;
  if (normalizedSessionId && typeof globalThis.sessionStorage?.setItem === 'function') {
    globalThis.sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId);
  }

  try {
    const summary = await fetchTerminalSessions();
    workspace.hydrateSessions(summary.sessions || []);
  } catch {
    // keep route/local workspace as-is when backend summaries are unavailable
  }

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

function handleActionTrigger(_actionKey: string): void {
  if (!workspace.activeSessionId.value) {
    createSession();
  }
}
</script>
