<template>
  <article class="panel-card system-handoff-panel">
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

<style scoped>
.system-handoff-panel {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-soft);
}

.system-handoff-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.system-handoff-title {
  margin: 0;
  color: var(--text);
}

.system-handoff-route {
  margin: 10px 0 0 0;
  color: var(--text-soft);
  font-size: 12px;
  font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
}
</style>
