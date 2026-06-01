<template>
  <Teleport to="body" v-if="open">
    <CascadeMenu
      :open="open"
      :x="x"
      :y="y"
      :items="items"
      :z-index="1610"
      @close="$emit('close')"
      @select="$emit('select', $event)"
    />
  </Teleport>
</template>

<script setup lang="ts">
import CascadeMenu from './CascadeMenu.vue';
import type { CascadeMenuItem } from './cascade-menu.types';

export interface FolderPickerItem extends CascadeMenuItem {}

defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: FolderPickerItem[];
}>();

defineEmits<{
  (event: 'close'): void;
  (event: 'select', itemId: string): void;
}>();
</script>
