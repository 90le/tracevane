<template>
  <article class="system-handoff-panel">
    <div class="system-handoff-head">
      <div>
        <p class="eyebrow">System → Terminal</p>
        <h3 class="system-handoff-title">{{ title }}</h3>
        <p class="panel-muted">{{ copy }}</p>
      </div>
      <button
        type="button"
        class="secondary-button compact-button"
        @click="emit('handoff')"
      >
        {{ actionLabel }}
      </button>
    </div>
    <p class="system-handoff-route">{{ routeLabel }} {{ routeTarget }}</p>
  </article>
</template>

<script setup lang="ts">
import './system-workspace.css';

const emit = defineEmits<{
  handoff: []
}>();

defineProps<{
  title: string;
  copy: string;
  actionLabel: string;
  routeLabel: string;
  routeTarget: string;
}>();
</script>
