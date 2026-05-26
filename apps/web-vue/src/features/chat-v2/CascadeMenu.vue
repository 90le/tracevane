<template>
  <DropdownMenuRoot :open="open" :modal="false" @update:open="handleOpenChange">
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        tabindex="-1"
        aria-hidden="true"
        class="cascade-menu-anchor"
        :style="anchorStyle"
      ></button>
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="cascade-menu"
        side="bottom"
        align="start"
        :side-offset="0"
        :avoid-collisions="false"
        position-strategy="fixed"
        :style="{ zIndex: String(zIndex) }"
        @close-auto-focus.prevent
      >
        <CascadeMenuNode
          :items="items"
          :padding="padding"
          :z-index="zIndex"
          @select="emit('select', $event)"
        />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import './overlay-surfaces.css';
import { computed, onBeforeUnmount, watch } from 'vue';
import {
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui';
import { clampSessionContextMenuPosition } from '../../../../../lib/chat-session-catalog';
import CascadeMenuNode from './CascadeMenuNode.vue';
import type { CascadeMenuItem } from './cascade-menu.types';

const props = withDefaults(defineProps<{
  open: boolean;
  x: number;
  y: number;
  items: CascadeMenuItem[];
  width?: number;
  itemHeight?: number;
  padding?: number;
  zIndex?: number;
}>(), {
  width: 248,
  itemHeight: 40,
  padding: 12,
  zIndex: 72,
});

const emit = defineEmits<{
  (event: 'close'): void;
  (event: 'select', itemId: string): void;
}>();

function clampMenu(point: { x: number; y: number }, itemCount: number): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return point;
  }
  return clampSessionContextMenuPosition(
    point,
    { width: window.innerWidth, height: window.innerHeight },
    {
      width: props.width,
      height: Math.min(360, itemCount * props.itemHeight + 16),
      padding: props.padding,
    },
  );
}

const anchorPoint = computed(() => clampMenu({ x: props.x, y: props.y }, props.items.length));

const anchorStyle = computed(() => ({
  left: `${anchorPoint.value.x}px`,
  top: `${anchorPoint.value.y}px`,
}));

function handleOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    emit('close');
  }
}

function handleViewportShift(): void {
  emit('close');
}

function bindViewportListeners(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.addEventListener('resize', handleViewportShift);
  window.addEventListener('scroll', handleViewportShift, true);
}

function unbindViewportListeners(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.removeEventListener('resize', handleViewportShift);
  window.removeEventListener('scroll', handleViewportShift, true);
}

watch(() => props.open, (nextOpen) => {
  if (nextOpen) {
    bindViewportListeners();
    return;
  }
  unbindViewportListeners();
}, { immediate: true });

onBeforeUnmount(() => {
  unbindViewportListeners();
});
</script>
