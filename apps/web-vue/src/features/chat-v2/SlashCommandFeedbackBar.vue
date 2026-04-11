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
      ×
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useLocalePreference } from '../../shared/locale';
import {
  describeStudioSlashExecutionFeedback,
  type StudioSlashExecutionFeedback,
} from './slash-feedback';

const props = defineProps<{
  feedback: StudioSlashExecutionFeedback | null;
}>();

defineEmits<{
  (event: 'dismiss'): void;
}>();

const { locale, text } = useLocalePreference();

const descriptor = computed(() => props.feedback
  ? describeStudioSlashExecutionFeedback(props.feedback, locale.value)
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

<style scoped>
.chat-slash-feedback {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 82%, transparent);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-panel) 86%, transparent), color-mix(in srgb, var(--chat-panel) 96%, transparent));
  box-shadow: 0 14px 28px rgba(11, 19, 32, 0.08);
  overflow: hidden;
}

.chat-slash-feedback::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 3px;
  background: color-mix(in srgb, var(--chat-accent) 72%, transparent);
}

.chat-slash-feedback.is-running::after,
.chat-slash-feedback.is-pending::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--chat-accent) 84%, white), transparent);
  transform: translateX(-100%);
  animation: chat-slash-feedback-progress 1.6s linear infinite;
}

.chat-slash-feedback.tone-success::before {
  background: color-mix(in srgb, #1f9d68 78%, transparent);
}

.chat-slash-feedback.tone-warning::before {
  background: color-mix(in srgb, #d5891c 80%, transparent);
}

.chat-slash-feedback.tone-error::before {
  background: color-mix(in srgb, #d14f5c 84%, transparent);
}

.chat-slash-feedback__content {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-slash-feedback__meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.chat-slash-feedback__phase {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-hover) 88%, transparent);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.chat-slash-feedback__command {
  min-width: 0;
  padding: 2px 8px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-modal-row) 84%, transparent);
  color: var(--chat-text);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chat-slash-feedback__title {
  color: var(--chat-text);
  font-size: 14px;
  line-height: 1.45;
}

.chat-slash-feedback__detail {
  margin: 0;
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.55;
}

.chat-slash-feedback__dismiss {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: inline-grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 76%, transparent);
  background: color-mix(in srgb, var(--chat-modal-row) 74%, transparent);
  color: var(--chat-text-soft);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
}

.chat-slash-feedback__dismiss:hover,
.chat-slash-feedback__dismiss:focus-visible {
  outline: none;
  color: var(--chat-text);
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-hover) 70%, transparent);
}

@keyframes chat-slash-feedback-progress {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(100%);
  }
}

@media (max-width: 720px) {
  .chat-slash-feedback {
    padding: 10px 12px;
    gap: 10px;
  }

  .chat-slash-feedback__command {
    max-width: 100%;
  }
}
</style>
