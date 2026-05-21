<template>
  <section class="panel-card cs-management-lock-card">
    <div>
      <h3>{{ title }}</h3>
      <p>{{ copy }}</p>
    </div>
    <button type="button" class="primary-button" :disabled="busy" @click="$emit('enable')">
      {{ actionLabel }}
    </button>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  copy: string;
  actionLabel: string;
  busy: boolean;
}>();

defineEmits<{
  enable: [];
}>();
</script>

<style scoped>
.cs-management-lock-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.cs-management-lock-card p {
  color: var(--text-soft);
}

@media (max-width: 960px) {
  .cs-management-lock-card {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
