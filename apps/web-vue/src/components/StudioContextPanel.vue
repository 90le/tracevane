<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="shell-context-panel__overlay" />
      <DialogContent class="studio-context-panel shell-context-panel" :aria-label="panelLabel" @open-auto-focus.prevent @close-auto-focus.prevent>
        <header class="studio-context-panel__header">
          <div>
            <p class="studio-context-panel__eyebrow">{{ panelEyebrow }}</p>
            <h2 class="studio-context-panel__title">{{ title || panelTitle }}</h2>
            <p v-if="description" class="studio-context-panel__description">{{ description }}</p>
          </div>
          <button
            type="button"
            class="studio-context-panel__close"
            :aria-label="text('关闭上下文面板', 'Close context panel')"
            :title="text('关闭上下文面板', 'Close context panel')"
            @click="emit('update:open', false)"
          >
            ×
          </button>
        </header>

        <section class="studio-context-panel__section">
          <h3>{{ alertsTitle }}</h3>
          <ul class="studio-context-panel__list">
            <li v-for="alert in alerts" :key="alert.label" class="studio-context-panel__item">
              <StatusPill :label="alert.label" :tone="alert.tone" />
            </li>
          </ul>
        </section>

        <section class="studio-context-panel__section">
          <h3>{{ pendingTitle }}</h3>
          <ul class="studio-context-panel__pending-list">
            <li
              v-for="item in pendingItems"
              :key="item.id"
              class="studio-context-panel__pending-item"
            >
              <RouterLink class="studio-context-panel__pending-link" :to="item.to">
                <strong>{{ item.title }}</strong>
                <span>{{ item.detail }}</span>
              </RouterLink>
            </li>
          </ul>
        </section>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import StatusPill from './StatusPill.vue';
import { useLocalePreference } from '../shared/locale';

type StatusTone = 'neutral' | 'accent' | 'sage' | 'danger';

defineProps<{
  open: boolean;
  title?: string;
  description?: string;
  alertsTitle: string;
  pendingTitle: string;
  alerts: Array<{
    label: string;
    tone: StatusTone;
  }>;
  pendingItems: Array<{
    id: string;
    to: string;
    title: string;
    detail: string;
  }>;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

const { text } = useLocalePreference();

const panelLabel = computed(() => text('上下文面板', 'Studio context panel'));
const panelEyebrow = computed(() => text('上下文', 'Context'));
const panelTitle = computed(() => text('工作台上下文', 'Studio Context'));
</script>
