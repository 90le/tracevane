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

<style scoped>
.cascade-menu-anchor {
  position: fixed;
  width: 0;
  height: 0;
  padding: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.cascade-menu {
  width: 248px;
  max-height: 360px;
  overflow: auto;
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-menu-surface);
  box-shadow: 0 18px 44px rgba(3, 8, 14, 0.28);
  backdrop-filter: blur(24px) saturate(140%);
  transform-origin: var(--reka-dropdown-menu-content-transform-origin);
  animation: cascade-menu-enter 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

:deep(.cascade-menu-item) {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-text);
  padding: 9px 12px;
  font: inherit;
  outline: none;
  user-select: none;
  transition: background 0.18s ease, transform 0.18s ease;
}

:deep(.cascade-menu-item[data-highlighted]),
:deep(.cascade-menu-item[data-state='open']) {
  background: var(--chat-hover);
  transform: translateY(-1px);
}

:deep(.cascade-menu-item[data-disabled]),
:deep(.cascade-menu-item.disabled) {
  color: var(--chat-text-soft);
  opacity: 0.62;
}

:deep(.cascade-menu-item.danger) {
  color: #c2410c;
}

.cascade-menu__arrow {
  color: var(--chat-text-soft);
  font-size: 14px;
}

@keyframes cascade-menu-enter {
  from {
    opacity: 0;
    transform: translateY(6px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .cascade-menu {
    animation: none;
  }
}
</style>

<style>
.cascade-menu-anchor {
  position: fixed;
  width: 0;
  height: 0;
  padding: 0;
  border: none;
  opacity: 0;
  pointer-events: none;
}

.cascade-menu {
  width: 248px;
  max-height: 360px;
  overflow: auto;
  display: grid;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid var(--chat-line-strong);
  background: var(--chat-menu-surface);
  box-shadow: 0 18px 44px rgba(3, 8, 14, 0.28);
  backdrop-filter: blur(24px) saturate(140%);
  transform-origin: var(--reka-dropdown-menu-content-transform-origin);
  animation: cascade-menu-enter 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cascade-menu-item {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  text-align: left;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--chat-text);
  padding: 9px 12px;
  font: inherit;
  outline: none;
  user-select: none;
  transition: background 0.18s ease, transform 0.18s ease;
}

.cascade-menu-item[data-highlighted],
.cascade-menu-item[data-state='open'] {
  background: var(--chat-hover);
  transform: translateY(-1px);
}

.cascade-menu-item[data-disabled],
.cascade-menu-item.disabled {
  color: var(--chat-text-soft);
  opacity: 0.62;
}

.cascade-menu-item.danger {
  color: #c2410c;
}

.cascade-menu__arrow {
  color: var(--chat-text-soft);
  font-size: 14px;
}

@media (prefers-reduced-motion: reduce) {
  .cascade-menu {
    animation: none;
  }
}
</style>
