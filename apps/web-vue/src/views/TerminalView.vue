<template>
  <section class="terminal-view-route">
    <TerminalWorkspacePage />
  </section>
</template>

<script setup lang="ts">
import { TerminalWorkspacePage } from '../features/terminal';
</script>

<style scoped>
.terminal-view-route {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.terminal-view-route > * {
  min-width: 0;
  min-height: 0;
}
</style>
