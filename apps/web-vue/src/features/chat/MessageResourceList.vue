<template>
  <div v-if="items.length" class="chat-resource-list" :class="{ 'is-user': isUser }">
    <template v-for="item in items" :key="item.id">
      <button
        v-if="isPreviewable(item)"
        type="button"
        class="chat-resource-card"
        :class="[item.kind, { missing: isMissing(item) }]"
        :data-chat-media-preview-source-key="mediaPreviewSourceKey(item)"
        @click="emitPreview(item)"
      >
        <img
          v-if="item.kind === 'image'"
          class="chat-resource-image"
          :src="resourceUrl(item)"
          :alt="resourceAlt(item)"
        >
        <video
          v-else
          class="chat-resource-video"
          :src="resourceUrl(item)"
          muted
          playsinline
          preload="metadata"
        ></video>
        <span class="chat-resource-meta">
          <strong>{{ item.fileName }}</strong>
          <span>{{ item.mimeType || mediaKindLabel(item.kind) }}</span>
        </span>
      </button>

      <div
        v-else
        class="chat-resource-card file"
        :class="{ missing: isMissing(item) }"
      >
        <div class="chat-resource-file-copy">
          <span class="chat-resource-file-badge">
            {{ isMissing(item) ? text('缺失', 'Missing') : text('文件', 'File') }}
          </span>
          <strong>{{ item.fileName }}</strong>
          <span>{{ fileMeta(item) }}</span>
        </div>

        <div v-if="isMissing(item)" class="chat-resource-missing-note">
          {{ missingLabel(item) }}
        </div>

        <div v-else class="chat-resource-file-actions">
          <a v-if="item.url" :href="resourceUrl(item)" target="_blank" rel="noreferrer noopener">
            {{ text('打开', 'Open') }}
          </a>
          <a v-if="item.downloadUrl" :href="resourceDownloadUrl(item)" download>
            {{ text('下载', 'Download') }}
          </a>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import './message-resources.css';
import type { ChatAttachmentKind, ChatResourceItem } from '../../../../../types/chat';
import { joinApiPath } from '../../shared/api';
import { useLocalePreference } from '../../shared/locale';

const props = defineProps<{
  items: ChatResourceItem[];
  isUser?: boolean;
}>();

const emit = defineEmits<{
  preview: [{ src: string; alt: string; kind: 'image' | 'video'; sourceKey: string }];
}>();

const { text } = useLocalePreference();

function isMissing(item: ChatResourceItem): boolean {
  return item.status === 'missing' || (!item.url && !item.downloadUrl);
}

function isPreviewable(item: ChatResourceItem): boolean {
  return (item.kind === 'image' || item.kind === 'video') && !isMissing(item) && Boolean(item.url);
}

function resourceUrl(item: ChatResourceItem): string {
  return joinApiPath(item.url || '');
}

function resourceDownloadUrl(item: ChatResourceItem): string {
  return joinApiPath(item.downloadUrl || '');
}

function resourceAlt(item: ChatResourceItem): string {
  return item.fileName || (item.kind === 'image' ? text('图片预览', 'Image preview') : text('视频预览', 'Video preview'));
}

function mediaPreviewSourceKey(item: ChatResourceItem): string {
  return item.id || item.url || item.downloadUrl || item.fileName || item.relativePath || item.originalPath || '';
}

function emitPreview(item: ChatResourceItem): void {
  if (!isPreviewable(item)) {
    return;
  }
  emit('preview', {
    src: resourceUrl(item),
    alt: resourceAlt(item),
    kind: item.kind,
    sourceKey: mediaPreviewSourceKey(item),
  });
}

function mediaKindLabel(kind: ChatAttachmentKind): string {
  if (kind === 'image') return text('图片', 'Image');
  if (kind === 'video') return text('视频', 'Video');
  return text('文件', 'File');
}

function fileMeta(item: ChatResourceItem): string {
  if (isMissing(item)) {
    return item.relativePath || item.originalPath || item.mimeType || text('资源不存在', 'Resource missing');
  }
  return item.mimeType || 'application/octet-stream';
}

function missingLabel(item: ChatResourceItem): string {
  const target = item.relativePath || item.originalPath || item.fileName;
  if (item.kind === 'image') return text(`图片不存在: ${target}`, `Image missing: ${target}`);
  if (item.kind === 'video') return text(`视频不存在: ${target}`, `Video missing: ${target}`);
  return text(`文件不存在: ${target}`, `File missing: ${target}`);
}
</script>
