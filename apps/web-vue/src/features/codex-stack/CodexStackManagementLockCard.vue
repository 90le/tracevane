<template>
  <section class="panel-card cs-management-lock-card">
    <div>
      <h3>{{ title }}</h3>
      <p>{{ copy }}</p>
    </div>
    <div class="cs-actions">
      <button type="button" class="primary-button" :disabled="busy" @click="$emit('enable')">
        {{ actionLabel }}
      </button>
      <p v-if="busy && busyDisabledHelp" class="cs-disabled-help">
        {{ busyDisabledHelp }}
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  copy: string;
  actionLabel: string;
  busy: boolean;
  busyDisabledHelp: string;
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

.cs-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.cs-disabled-help {
  max-width: 280px;
  margin: 0;
  color: var(--warning);
  font-size: 0.84rem;
  line-height: 1.45;
  text-align: right;
}

@media (max-width: 960px) {
  .cs-management-lock-card {
    flex-direction: column;
    align-items: stretch;
  }

  .cs-actions {
    align-items: stretch;
  }

  .cs-disabled-help {
    max-width: none;
    text-align: left;
  }
}
</style>
