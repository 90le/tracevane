<template>
  <aside class="studio-context-panel" :aria-label="text('上下文面板', 'Studio context panel')">
    <header class="studio-context-panel__header">
      <p class="studio-context-panel__eyebrow">{{ text('上下文', 'Context') }}</p>
      <h2 class="studio-context-panel__title">{{ text('工作台上下文', 'Studio Context') }}</h2>
    </header>
    <div class="studio-context-panel__body">
      <p class="studio-context-panel__placeholder">
        {{ text('上下文面板脚手架', 'Context panel scaffold') }}
      </p>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useLocalePreference } from '../shared/locale';

const { text } = useLocalePreference();
</script>
