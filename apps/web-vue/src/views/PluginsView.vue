<template>
  <PluginsControlPage :page-eyebrow="managementEntry.label" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PluginsControlPage } from '../features/plugins';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const managementEntry = computed(() => getManagementDomainEntry('plugins'));
</script>
