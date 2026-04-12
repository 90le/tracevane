<template>
  <AgentsWorkspaceLayout :management-entry="managementEntry" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import AgentsWorkspaceLayout from '../features/agents/AgentsWorkspaceLayout.vue';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const managementEntry = computed(() => getManagementDomainEntry('agents'));
</script>
