<!-- components/AppShell.vue -->
<script setup lang="ts">
import GlobalNav from '@/components/nav/GlobalNav.vue';
import CommandPalette from '@/features/command-palette/CommandPalette.vue';
import { useUiStore } from '@/stores/ui-store';

const ui = useUiStore();
</script>

<template>
  <div class="app-shell">
    <GlobalNav />
    <main class="app-shell__content">
      <RouterView />
    </main>
    <button class="app-shell__theme" :title="ui.theme === 'dark' ? '切浅色' : '切深色'" @click="ui.toggleTheme(); ui.applyTheme()">◐</button>
    <CommandPalette />
  </div>
</template>

<style scoped>
.app-shell {
  display: grid;
  grid-template-columns: auto 1fr;
  height: 100vh;
  padding: 10px;
  gap: 10px;
}
.app-shell__content {
  background: var(--material-thick);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
  border: 0.5px solid var(--hairline);
  overflow: hidden;
  min-width: 0;
}
.app-shell__theme {
  position: fixed;
  top: 18px;
  right: 22px;
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: none;
  background: var(--material-floating);
  backdrop-filter: var(--blur-floating);
  color: var(--text-secondary);
  border-radius: var(--radius-control);
  cursor: pointer;
  box-shadow: var(--shadow-1);
  z-index: 20;
}
.app-shell__theme:hover {
  color: var(--text-primary);
}
</style>
