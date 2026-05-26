<template>
  <img
    v-if="display.kind === 'image'"
    class="agent-avatar-content agent-avatar-content-image"
    :src="display.src"
    :alt="altText"
    @error="handleImageError"
  />
  <span v-else class="agent-avatar-content agent-avatar-content-text">{{ display.text }}</span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import './avatar-components.css';

const props = withDefaults(defineProps<{
  avatar?: string | null;
  emoji?: string | null;
  fallback?: string | null;
  alt?: string | null;
}>(), {
  avatar: '',
  emoji: '',
  fallback: 'A',
  alt: '',
});

const imageFailed = ref(false);

watch(() => props.avatar, () => {
  imageFailed.value = false;
});

const IMAGE_AVATAR_RE = /^(https?:\/\/|data:image\/|\/)/i;

function trimValue(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isImageAvatar(value: string): boolean {
  return IMAGE_AVATAR_RE.test(value);
}

function looksLikeEmojiOrShortAvatar(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/\s/.test(trimmed) && trimmed.length <= 4) return true;
  if (trimmed.length > 16) return false;
  for (let index = 0; index < trimmed.length; index += 1) {
    if (trimmed.charCodeAt(index) > 127) return true;
  }
  return false;
}

function resolveFallbackInitial(value: string | null | undefined): string {
  const trimmed = trimValue(value);
  return trimmed ? trimmed.charAt(0).toUpperCase() : 'A';
}

const display = computed(() => {
  const avatar = trimValue(props.avatar);
  if (avatar && !imageFailed.value && isImageAvatar(avatar)) {
    return { kind: 'image' as const, src: avatar };
  }
  if (avatar && looksLikeEmojiOrShortAvatar(avatar)) {
    return { kind: 'text' as const, text: avatar };
  }

  const emoji = trimValue(props.emoji);
  if (emoji) {
    return { kind: 'text' as const, text: emoji };
  }

  return { kind: 'text' as const, text: resolveFallbackInitial(props.fallback) };
});

const altText = computed(() => trimValue(props.alt) || trimValue(props.fallback) || 'avatar');

function handleImageError(): void {
  imageFailed.value = true;
}
</script>
