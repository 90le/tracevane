<template>
  <ConfigEditorPage :workspace-sections="workspaceSections" :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ConfigEditorPage } from '../features/config';
import { useLocalePreference } from '../shared/locale';
import { buildConfigOverviewRecipe } from '../features/config/config-overview-recipe';
import { buildConfigWorkspaceSections } from '../features/config/config-workspace-sections';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const { text } = useLocalePreference();
const managementEntry = computed(() => getManagementDomainEntry('config'));
const workspaceSections = computed(() => buildConfigWorkspaceSections(text));
const overviewRecipe = computed(() => {
  const entry = managementEntry.value;
  return {
    ...buildConfigOverviewRecipe(text),
    sidebarTitle: text(`${entry.label}域工作台`, `${entry.label} workspace`),
  };
});
</script>
