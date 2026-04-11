<template>
  <nav class="chat-shell-session-scope-tabs" :aria-label="text('会话范围切换', 'Chat scope tabs')">
    <button
      type="button"
      class="chat-shell-session-scope-tab"
      :class="{ active: modelValue === 'all' }"
      :aria-pressed="String(modelValue === 'all')"
      @click="$emit('update:modelValue', 'all')"
    >
      {{ text('全部', 'All') }}
    </button>
    <button
      type="button"
      class="chat-shell-session-scope-tab"
      :class="{ active: modelValue === 'folders' }"
      :aria-pressed="String(modelValue === 'folders')"
      @click="$emit('update:modelValue', 'folders')"
    >
      {{ text('文件夹', 'Folders') }}
    </button>
    <button
      type="button"
      class="chat-shell-session-scope-tab"
      :class="{ active: modelValue === 'archived' }"
      :aria-pressed="String(modelValue === 'archived')"
      @click="$emit('update:modelValue', 'archived')"
    >
      {{ text('归档', 'Archived') }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import type { SessionListScope } from './session-list-view-model';

defineProps<{
  modelValue: SessionListScope;
}>();

defineEmits<{
  (event: 'update:modelValue', value: SessionListScope): void;
}>();

const { text } = useLocalePreference();
</script>
