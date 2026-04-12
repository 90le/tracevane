<template>
  <ConfigEditorPage :workspace-sections="workspaceSections" :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { ConfigEditorPage } from '../features/config';
import { useLocalePreference } from '../shared/locale';
import { buildConfigOverviewRecipe } from '../features/config/config-overview-recipe';
import { buildConfigWorkspaceSections } from '../features/config/config-workspace-sections';

const { text } = useLocalePreference();
const workspaceSections = buildConfigWorkspaceSections(text);
const overviewRecipe = buildConfigOverviewRecipe(text);
</script>
