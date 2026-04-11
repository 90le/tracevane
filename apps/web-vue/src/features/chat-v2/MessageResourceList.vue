<template>
  <div v-if="items.length" class="chat-resource-list" :class="{ 'is-user': isUser }">
    <template v-for="item in items" :key="item.id">
      <button
        v-if="isPreviewable(item)"
        type="button"
        class="chat-resource-card"
        :class="[item.kind, { missing: isMissing(item) }]"
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
import type { ChatAttachmentKind, ChatResourceItem } from '../../../../../types/chat';
import { joinApiPath } from '../../shared/api';
import { useLocalePreference } from '../../shared/locale';

const props = defineProps<{
  items: ChatResourceItem[];
  isUser?: boolean;
}>();

const emit = defineEmits<{
  preview: [{ src: string; alt: string; kind: 'image' | 'video' }];
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

function emitPreview(item: ChatResourceItem): void {
  if (!isPreviewable(item)) {
    return;
  }
  emit('preview', {
    src: resourceUrl(item),
    alt: resourceAlt(item),
    kind: item.kind,
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

<style scoped>
.chat-resource-list {
  display: grid;
  gap: 10px;
}

.chat-resource-card {
  width: min(100%, 420px);
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 88%, transparent);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.chat-resource-list.is-user .chat-resource-card {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.18);
}

.chat-resource-card.image,
.chat-resource-card.video {
  appearance: none;
  cursor: zoom-in;
  text-align: left;
}

.chat-resource-card.image {
  background:
    radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--chat-assistant-bubble-soft) 94%, white 4%), color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent));
}

.chat-resource-card.video {
  background:
    radial-gradient(circle at top right, rgba(236, 72, 153, 0.08), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--chat-assistant-bubble-soft) 94%, white 4%), color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent));
}

.chat-resource-card.file {
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.05), transparent 42%),
    color-mix(in srgb, var(--chat-assistant-bubble-soft) 90%, transparent);
}

.chat-resource-card.image:hover,
.chat-resource-card.image:focus-visible,
.chat-resource-card.video:hover,
.chat-resource-card.video:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.1);
}

.chat-resource-card.missing {
  border-style: dashed;
  background: color-mix(in srgb, #dc2626 8%, var(--chat-assistant-bubble-soft));
}

.chat-resource-list.is-user .chat-resource-card.missing {
  background: rgba(220, 38, 38, 0.12);
  border-color: rgba(255, 255, 255, 0.22);
}

.chat-resource-image {
  display: block;
  width: 100%;
  max-height: 260px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  object-fit: cover;
}

.chat-resource-video {
  display: block;
  width: 100%;
  max-height: 260px;
  border-radius: 12px;
  background: #000;
  object-fit: cover;
}

.chat-resource-meta,
.chat-resource-file-copy {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.chat-resource-meta strong,
.chat-resource-file-copy strong {
  color: var(--chat-text);
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.chat-resource-meta span,
.chat-resource-file-copy span,
.chat-resource-missing-note {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.chat-resource-list.is-user .chat-resource-meta strong,
.chat-resource-list.is-user .chat-resource-file-copy strong {
  color: #fff;
}

.chat-resource-list.is-user .chat-resource-meta span,
.chat-resource-list.is-user .chat-resource-file-copy span,
.chat-resource-list.is-user .chat-resource-missing-note {
  color: rgba(248, 251, 255, 0.82);
}

.chat-resource-file-badge {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  height: 22px;
  padding: 0 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.12));
  color: var(--chat-text);
  font-size: 11px;
  font-weight: 700;
}

.chat-resource-file-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-resource-file-actions a {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 84%, transparent);
  color: var(--chat-text);
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
}

.chat-resource-file-actions a:hover,
.chat-resource-file-actions a:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: var(--chat-hover);
}

.chat-resource-list.is-user .chat-resource-file-actions a {
  border-color: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.chat-resource-list.is-user .chat-resource-file-actions a:hover,
.chat-resource-list.is-user .chat-resource-file-actions a:focus-visible {
  border-color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.12);
}
</style>
