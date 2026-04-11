<template>
  <Teleport to="body" v-if="open">
    <CascadeMenu
      :open="open"
      :x="x"
      :y="y"
      :items="items"
      :z-index="1605"
      @close="$emit('close')"
      @select="$emit('action', $event)"
    />
  </Teleport>
</template>

<script setup lang="ts">
import CascadeMenu from './CascadeMenu.vue';
import type { CascadeMenuItem } from './cascade-menu.types';

export interface SessionContextMenuItem extends CascadeMenuItem {}

defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: SessionContextMenuItem[];
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'action', actionId: string): void;
}>();
</script>
