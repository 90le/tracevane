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
import { useRoute, useRouter } from 'vue-router';
import TerminalActionPanel from './TerminalActionPanel.vue';
import TerminalRecentSessionRail from './TerminalRecentSessionRail.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { bindTerminalRouteSync } from './terminal-route-sync';
import { createTerminalWorkspaceState } from './terminal-workspace-state';
import './terminal-workspace.css';

const route = useRoute();
const router = useRouter();

const workspace = createTerminalWorkspaceState();
const actionLayers = buildTerminalActionLayers();

bindTerminalRouteSync({
  activeSessionId: workspace.activeSessionId,
  route,
  router,
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
