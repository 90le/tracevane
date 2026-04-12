<template>
  <SkillsControlPage :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { SkillsControlPage } from '../features/skills';
import { useLocalePreference } from '../shared/locale';
import { buildSkillsOverviewRecipe } from '../features/skills/skills-overview-recipe';

const { text } = useLocalePreference();
const overviewRecipe = buildSkillsOverviewRecipe(text);
</script>
