<template>
  <ChannelsWorkspaceLayout :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { ChannelsWorkspaceLayout } from '../features/channels';
import { useLocalePreference } from '../shared/locale';
import { buildChannelsOverviewRecipe } from '../features/channels/channels-overview-recipe';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const { text } = useLocalePreference();
const managementEntry = computed(() => getManagementDomainEntry('channels'));
const overviewRecipe = computed(() => {
  const entry = managementEntry.value;
  return {
    ...buildChannelsOverviewRecipe(text),
    providerHeadline: text(`${entry.label}工作区`, `${entry.label} workspace`),
  };
});
</script>
