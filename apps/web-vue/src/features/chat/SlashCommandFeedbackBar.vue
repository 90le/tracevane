<template>
  <section
    v-if="feedback"
    class="chat-slash-feedback"
    :class="[
      `tone-${descriptor.tone}`,
      feedback.phase === 'running' ? 'is-running' : '',
      feedback.phase === 'accepted' ? 'is-pending' : '',
    ]"
    :data-phase="feedback.phase"
  >
    <div class="chat-slash-feedback__content">
      <div class="chat-slash-feedback__meta">
        <span class="chat-slash-feedback__phase">{{ phaseLabel }}</span>
        <code class="chat-slash-feedback__command">{{ descriptor.commandText }}</code>
      </div>
      <strong class="chat-slash-feedback__title">{{ descriptor.title }}</strong>
      <p class="chat-slash-feedback__detail">{{ descriptor.detail }}</p>
    </div>

    <button
      type="button"
      class="chat-slash-feedback__dismiss"
      :aria-label="text('关闭命令状态', 'Dismiss command status')"
      @click="$emit('dismiss')"
    >
      <X class="drawer-close-icon" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import './slash-command.css';
import { computed } from 'vue';
import { X } from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import {
  describeTracevaneSlashExecutionFeedback,
  type TracevaneSlashExecutionFeedback,
} from './slash-feedback';

const props = defineProps<{
  feedback: TracevaneSlashExecutionFeedback | null;
}>();

defineEmits<{
  (event: 'dismiss'): void;
}>();

const { locale, text } = useLocalePreference();

const descriptor = computed(() => props.feedback
  ? describeTracevaneSlashExecutionFeedback(props.feedback, locale.value)
  : {
    tone: 'info',
    title: '',
    detail: '',
    commandText: '',
  });

const phaseLabel = computed(() => {
  if (!props.feedback) {
    return '';
  }
  if (props.feedback.phase === 'accepted') {
    return text('已接收', 'Accepted');
  }
  if (props.feedback.phase === 'running') {
    return text('执行中', 'Running');
  }
  if (props.feedback.phase === 'completed') {
    return text('已完成', 'Done');
  }
  if (props.feedback.phase === 'aborted') {
    return text('已停止', 'Stopped');
  }
  return text('失败', 'Failed');
});
</script>
