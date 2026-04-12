<template>
  <SkillsControlPage :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { SkillsControlPage } from '../features/skills';
import { useLocalePreference } from '../shared/locale';
import { buildDefaultSkillsOverviewRecipe } from '../features/skills/skills-overview-recipe';
import { getManagementDomainEntry } from '../features/management/management-domain-manifest';

const { text } = useLocalePreference();
const managementEntry = computed(() => getManagementDomainEntry('skills'));
const overviewRecipe = computed(() => {
  const entry = managementEntry.value;
  return {
    ...buildDefaultSkillsOverviewRecipe(text),
    pageEyebrow: entry.label,
  };
});
</script>
