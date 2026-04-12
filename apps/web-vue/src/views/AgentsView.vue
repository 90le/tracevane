<template>
  <AgentsWorkspaceLayout :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import AgentsWorkspaceLayout from '../features/agents/AgentsWorkspaceLayout.vue';
import { buildAgentsOverviewRecipe } from '../features/agents/agents-overview-recipe';

const overviewRecipe = buildAgentsOverviewRecipe();
</script>
