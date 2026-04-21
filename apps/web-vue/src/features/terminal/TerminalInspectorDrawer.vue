<template>
  <aside v-if="open" class="terminal-inspector-drawer" aria-label="Terminal inspector drawer">
    <slot />
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  open: boolean;
}>();
</script>
