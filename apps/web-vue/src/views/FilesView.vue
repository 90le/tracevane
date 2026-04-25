<template>
  <FilesControlPage :page-eyebrow="managementEntry.label" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { FilesControlPage } from "../features/files";
import { getManagementDomainEntry } from "../features/management/management-domain-manifest";

const managementEntry = computed(() => getManagementDomainEntry("files"));
</script>
