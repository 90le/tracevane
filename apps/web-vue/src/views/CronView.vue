<template>
  <CronControlPage :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { CronControlPage } from '../features/cron';
import { useLocalePreference } from '../shared/locale';
import { buildCronOverviewRecipe } from '../features/cron/cron-overview-recipe';

const { text } = useLocalePreference();
const overviewRecipe = buildCronOverviewRecipe(text);
</script>
