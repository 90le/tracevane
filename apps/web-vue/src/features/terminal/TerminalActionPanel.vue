<template>
  <aside class="terminal-action-panel" aria-label="Terminal actions">
    <section v-for="layer in actionLayers" :key="layer.key" class="terminal-action-layer">
      <h3>{{ layer.titleZh }}</h3>
      <ul>
        <li v-for="item in layer.items" :key="item.key">
          <button type="button" class="terminal-action-item" @click="$emit('trigger', item.key)">
            {{ item.labelZh }}
          </button>
        </li>
      </ul>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { TerminalActionLayer } from './terminal-action-catalog';

defineProps<{
  actionLayers: TerminalActionLayer[];
}>();

defineEmits<{
  (e: 'trigger', actionKey: string): void;
}>();
</script>
