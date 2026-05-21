<template>
  <div class="cs-install-shell" :class="{ 'cs-install-shell-busy': busy }">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  busy: boolean;
}>();
</script>

<style>
.cs-install-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.cs-install-shell-busy > *:not(.cs-install-overlay) {
  opacity: 0.42;
}
</style>
