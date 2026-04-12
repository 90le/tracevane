<template>
  <ChannelsWorkspaceLayout :overview-recipe="overviewRecipe" />
</template>

<script setup lang="ts">
import { ChannelsWorkspaceLayout } from '../features/channels';
import { useLocalePreference } from '../shared/locale';
import { buildChannelsOverviewRecipe } from '../features/channels/channels-overview-recipe';

const { text } = useLocalePreference();
const overviewRecipe = buildChannelsOverviewRecipe(text);
</script>
