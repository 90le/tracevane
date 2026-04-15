<template>
  <ChatShellPageV2 :shell-mode="props.shellMode" />
</template>

<script setup lang="ts">
import ChatShellPageV2 from '../chat-v2/ChatShellPage.vue';

const props = withDefaults(defineProps<{
  shellMode?: 'chat' | 'inspect';
}>(), {
  shellMode: 'chat',
});
</script>
