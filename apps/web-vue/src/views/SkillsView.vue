<template>
  <SkillsControlPage :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { SkillsControlPage } from '../features/skills';
import { useLocalePreference } from '../shared/locale';
import { buildDefaultSkillsOverviewRecipe } from '../features/skills/skills-overview-recipe';

const { text } = useLocalePreference();
const overviewRecipe = buildDefaultSkillsOverviewRecipe(text);
</script>
