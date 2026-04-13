<template>
  <section class="system-event-filter-bar">
    <select
      class="system-event-filter-select"
      :value="severity"
      @change="emit('update:severity', ($event.target as HTMLSelectElement).value)"
    >
      <option value="all">{{ text('全部严重性', 'All severities') }}</option>
      <option value="error">{{ text('错误', 'Error') }}</option>
      <option value="warning">{{ text('警告', 'Warning') }}</option>
      <option value="info">{{ text('信息', 'Info') }}</option>
      <option value="success">{{ text('成功', 'Success') }}</option>
    </select>

    <select
      class="system-event-filter-select"
      :value="category"
      @change="emit('update:category', ($event.target as HTMLSelectElement).value)"
    >
      <option value="all">{{ text('全部分类', 'All categories') }}</option>
      <option value="operations">{{ text('运维', 'Operations') }}</option>
      <option value="audit">{{ text('审计', 'Audit') }}</option>
      <option value="recovery">{{ text('恢复', 'Recovery') }}</option>
      <option value="alerts">{{ text('告警', 'Alerts') }}</option>
    </select>
  </section>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../../shared/locale';

defineProps<{
  severity: string;
  category: string;
}>();

const emit = defineEmits<{
  'update:severity': [value: string];
  'update:category': [value: string];
}>();

const { text } = useLocalePreference();
</script>
