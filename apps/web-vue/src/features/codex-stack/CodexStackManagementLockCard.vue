<template>
  <section class="cs-management-lock-rail">
    <div>
      <h3>{{ title }}</h3>
      <p>{{ copy }}</p>
    </div>
    <div class="cs-lock-actions">
      <button type="button" class="primary-button" :disabled="busy" @click="$emit('enable')">
        {{ actionLabel }}
      </button>
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import "./codex-stack-workspace.css";

defineProps<{
  title: string;
  copy: string;
  actionLabel: string;
  busy: boolean;
  busyDisabledHelp: string;
}>();

defineEmits<{
  enable: [];
}>();
</script>
