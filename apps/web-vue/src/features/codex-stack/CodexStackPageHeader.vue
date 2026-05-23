<template>
  <header class="page-header-row cs-page-header">
    <div>
      <p class="eyebrow">{{ eyebrow }}</p>
      <h2 class="page-title">{{ title }}</h2>
      <p class="cs-page-subtitle">
        {{ subtitle }}
      </p>
    </div>
    <div class="page-actions">
      <button type="button" class="secondary-button" :disabled="refreshDisabled" @click="$emit('refresh')">
        {{ refreshLabel }}
      </button>
      <p v-if="refreshDisabled && refreshDisabledHelp" class="cs-disabled-help">
        {{ refreshDisabledHelp }}
      </p>
    </div>
  </header>
</template>

<script setup lang="ts">
import "./codex-stack-workspace.css";

defineProps<{
  eyebrow: string;
  title: string;
  subtitle: string;
  refreshLabel: string;
  refreshDisabled: boolean;
  refreshDisabledHelp: string;
}>();

defineEmits<{
  refresh: [];
}>();
</script>
