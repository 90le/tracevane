<template>
  <div ref="rootRef" class="glass-select" :class="{ open: isOpen, disabled, 'open-up': openDirection === 'up' }">
    <button
      type="button"
      class="glass-select-trigger"
      :class="{ placeholder: !selectedLabel }"
      :disabled="disabled"
      @click="toggleOpen"
    >
      <span class="glass-select-value">{{ selectedLabel || placeholder }}</span>
      <ChevronDown class="glass-select-chevron" aria-hidden="true" />
    </button>

    <Teleport v-if="teleport" to="body">
      <div v-if="isOpen" ref="menuRef" class="glass-select-menu glass-select-menu-portal" :style="menuStyle" @pointerdown.stop>
        <button
          v-for="option in options"
          :key="option.value"
          type="button"
          class="glass-select-option"
          :class="{ active: option.value === modelValue }"
          @pointerdown.prevent.stop="selectOption(option.value)"
          @click.prevent
        >
          <span>{{ option.label }}</span>
          <Check v-if="option.value === modelValue" class="glass-select-check" aria-hidden="true" />
        </button>
      </div>
    </Teleport>

    <div v-else-if="isOpen" ref="menuRef" class="glass-select-menu" @pointerdown.stop>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="glass-select-option"
        :class="{ active: option.value === modelValue }"
        @pointerdown.prevent.stop="selectOption(option.value)"
        @click.prevent
      >
        <span>{{ option.label }}</span>
        <Check v-if="option.value === modelValue" class="glass-select-check" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Check, ChevronDown } from '@lucide/vue';
import './glass-select.css';

export interface GlassSelectOption {
  value: string;
  label: string;
}

const props = withDefaults(defineProps<{
  modelValue: string;
  options: GlassSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  teleport?: boolean;
}>(), {
  placeholder: '请选择',
  disabled: false,
  teleport: true,
});

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const openDirection = ref<'down' | 'up'>('down');
const menuStyle = ref<Record<string, string>>({});

const selectedLabel = computed(() => {
  return props.options.find((option) => option.value === props.modelValue)?.label || '';
});

function closeMenu() {
  isOpen.value = false;
}

function updateMenuDirection() {
  if (!rootRef.value || !menuRef.value || typeof window === 'undefined') return;
  const rootRect = rootRef.value.getBoundingClientRect();
  const menuHeight = menuRef.value.offsetHeight || 240;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - rootRect.bottom;
  const spaceAbove = rootRect.top;
  openDirection.value = spaceBelow < menuHeight && spaceAbove > spaceBelow ? 'up' : 'down';
  if (!props.teleport) {
    menuStyle.value = {};
    return;
  }
  const top = openDirection.value === 'up'
    ? Math.max(8, rootRect.top - menuHeight - 8)
    : Math.min(viewportHeight - menuHeight - 8, rootRect.bottom + 8);
  menuStyle.value = {
    position: 'fixed',
    left: `${rootRect.left}px`,
    top: `${top}px`,
    width: `${rootRect.width}px`,
  };
}

function toggleOpen() {
  if (props.disabled) return;
  isOpen.value = !isOpen.value;
  if (isOpen.value) {
    openDirection.value = 'down';
    void nextTick(() => updateMenuDirection());
  }
}

function selectOption(value: string) {
  emit('update:modelValue', value);
  closeMenu();
}

function handlePointerDown(event: Event) {
  const target = event.target as Node | null;
  if (!rootRef.value) return;
  if (target && (rootRef.value.contains(target) || menuRef.value?.contains(target))) return;
  closeMenu();
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') closeMenu();
}

function handleViewportChange() {
  if (!isOpen.value) return;
  updateMenuDirection();
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown);
  document.addEventListener('keydown', handleEscape);
  window.addEventListener('resize', handleViewportChange);
  window.addEventListener('scroll', handleViewportChange, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown);
  document.removeEventListener('keydown', handleEscape);
  window.removeEventListener('resize', handleViewportChange);
  window.removeEventListener('scroll', handleViewportChange, true);
});
</script>
