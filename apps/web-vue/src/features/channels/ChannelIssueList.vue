<template>
  <section v-if="issues.length" class="channel-issue-list panel-card">
    <header class="channel-issue-list__head">
      <div>
        <p class="eyebrow">{{ text('ATTENTION', 'ATTENTION') }}</p>
        <h3>{{ text('待处理问题', 'Needs attention') }}</h3>
      </div>
      <div class="channel-issue-list__controls">
        <button
          v-if="canToggle"
          type="button"
          class="secondary-button compact-button"
          @click="showAllIssues = !showAllIssues"
        >
          {{ showAllIssues ? text('收起', 'Show less') : text('查看全部', 'Show all') }}
        </button>
        <strong>{{ issues.length }}</strong>
      </div>
    </header>

    <article v-for="issue in visibleIssues" :key="issue.id" class="channel-issue-list__item">
      <div>
        <strong>{{ issue.title }}</strong>
        <p>{{ issue.description }}</p>
      </div>
      <button
        v-if="issue.accountId"
        type="button"
        class="secondary-button compact-button"
        @click="$emit('activate-issue', issue)"
      >
        {{ issue.actionLabel }}
      </button>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ChannelIssue } from './channel-ui';
import { useLocalePreference } from '../../shared/locale';

defineOptions({ name: 'ChannelIssueList' });

defineEmits<{
  (event: 'activate-issue', issue: ChannelIssue): void;
}>();

const props = defineProps<{
  issues: ChannelIssue[];
}>();

const { text } = useLocalePreference();
const showAllIssues = ref(false);
const canToggle = computed(() => props.issues.length > 4);
const visibleIssues = computed(() => {
  return showAllIssues.value ? props.issues : props.issues.slice(0, 4);
});

watch(
  () => props.issues.map((issue) => issue.id).join('|'),
  () => {
    showAllIssues.value = false;
  },
);
</script>

<style scoped>
.channel-issue-list {
  display: grid;
  gap: 12px;
}

.channel-issue-list__head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-end;
}

.channel-issue-list__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.channel-issue-list__head h3 {
  margin: 4px 0 0 0;
  color: var(--text);
}

.channel-issue-list__head strong {
  color: var(--text);
  font-size: 24px;
}

.channel-issue-list__item {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  align-items: center;
  padding: 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 190, 122, 0.18);
  background: color-mix(in srgb, var(--surface) 92%, rgba(255, 190, 122, 0.06));
}

.channel-issue-list__item strong {
  display: block;
  color: var(--text);
  font-size: 14px;
}

.channel-issue-list__item p {
  margin: 6px 0 0 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

@media (max-width: 920px) {
  .channel-issue-list__head {
    align-items: flex-start;
  }

  .channel-issue-list__controls {
    justify-content: flex-start;
  }

  .channel-issue-list__item {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
