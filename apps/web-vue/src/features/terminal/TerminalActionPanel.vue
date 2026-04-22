<template>
  <section class="terminal-action-panel" aria-label="Terminal actions">
    <section v-for="layer in actionLayers" :key="layer.key" class="terminal-action-layer">
      <h3>{{ text(layer.titleZh, layer.titleEn) }}</h3>
      <p class="terminal-action-layer__description">{{ text(layer.descriptionZh, layer.descriptionEn) }}</p>
      <ul>
        <li v-for="item in layer.items" :key="item.key">
          <button type="button" class="terminal-action-item" @click="$emit('trigger', item.key)">
            <span class="terminal-action-item__title-row">
              <strong>{{ text(item.labelZh, item.labelEn) }}</strong>
              <span class="terminal-action-item__badge">{{ item.runMode === 'new-session' ? text('新标签', 'New Tab') : text('当前会话', 'Current Tab') }}</span>
            </span>
            <span class="terminal-action-item__description">{{ text(item.descriptionZh, item.descriptionEn) }}</span>
            <code class="terminal-action-item__command">{{ item.command }}</code>
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';
import type { TerminalActionLayer } from './terminal-action-catalog';

const { text } = useLocalePreference();

defineProps<{
  actionLayers: TerminalActionLayer[];
}>();

defineEmits<{
  (e: 'trigger', actionKey: string): void;
}>();
</script>
