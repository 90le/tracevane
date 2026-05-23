<template>
  <article class="cs-recommendation-prompt">
    <p class="cs-section-kicker">{{ kicker }}</p>
    <h4>{{ title }}</h4>
    <p>{{ copy }}</p>
    <p v-if="primaryDisabled && disabledHelp" class="cs-disabled-help">{{ disabledHelp }}</p>
    <div class="cs-recommendation-actions">
      <button type="button" class="primary-button" :disabled="primaryDisabled" @click="$emit('primary')">
        {{ primaryLabel }}
      </button>
      <button type="button" class="secondary-button" @click="$emit('open-section')">
        {{ secondaryLabel }}
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
import "./codex-stack-dashboard.css";

defineProps<{
  kicker: string;
  title: string;
  copy: string;
  primaryLabel: string;
  secondaryLabel: string;
  primaryDisabled: boolean;
  disabledHelp: string;
}>();

defineEmits<{
  primary: [];
  "open-section": [];
}>();
</script>
