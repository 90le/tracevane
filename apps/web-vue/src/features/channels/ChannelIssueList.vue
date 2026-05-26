<template>
  <section v-if="issues.length" class="channel-issue-list">
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
import './channels-account.css';

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
