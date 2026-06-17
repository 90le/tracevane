<!-- components/studio/StudioButton.vue -->
<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'ghost' | 'icon';
    disabled?: boolean;
  }>(),
  { variant: 'ghost', disabled: false },
);
defineEmits<{ click: [event: MouseEvent] }>();
</script>

<template>
  <button
    :class="['studio-btn', `studio-btn--${variant}`, { 'is-disabled': disabled }]"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.studio-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: background 0.12s;
}
.studio-btn--primary {
  background: var(--accent);
  color: #fff;
  padding: 6px 14px;
  border-radius: var(--radius-pill);
}
.studio-btn--primary:hover {
  filter: brightness(1.08);
}
.studio-btn--ghost {
  background: var(--fill);
  color: var(--text-secondary);
  padding: 6px 12px;
}
.studio-btn--ghost:hover {
  background: var(--fill-strong);
  color: var(--text-primary);
}
.studio-btn--icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  background: transparent;
  color: var(--text-secondary);
}
.studio-btn--icon:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.is-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
