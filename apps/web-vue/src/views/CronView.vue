<template>
  <CronControlPage :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CronControlPage } from '../features/cron';
import { useLocalePreference } from '../shared/locale';
import { buildDefaultCronOverviewRecipe } from '../features/cron/cron-overview-recipe';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const { text } = useLocalePreference();
const managementEntry = computed(() => getManagementDomainEntry('cron'));
const overviewRecipe = computed(() => {
  const entry = managementEntry.value;
  return {
    ...buildDefaultCronOverviewRecipe(text),
    pageEyebrow: entry.label,
  };
});
</script>
