<template>
  <div class="cs-loading-state">
    {{ message }}
  </div>
</template>

<script setup lang="ts">
import "./codex-stack-workspace.css";

defineProps<{
  message: string;
}>();
</script>
