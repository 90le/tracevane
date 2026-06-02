<template>
  <section class="terminal-view-route">
    <TerminalWorkspacePage @request-shell-navigation="emit('requestShellNavigation')" />
  </section>
</template>

<script setup lang="ts">
import { TerminalWorkspacePage } from '../features/terminal';
import '../features/terminal/terminal-workspace.css';

const emit = defineEmits<{
  (event: 'requestShellNavigation'): void;
}>();
</script>
