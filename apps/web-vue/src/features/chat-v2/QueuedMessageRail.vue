<template>
  <section v-if="items.length" class="chat-queue-rail" :class="{ expanded: summaryExpanded }">
    <header v-if="presentationMode === 'rail'" class="chat-queue-rail__summary">
      <button
        type="button"
        class="chat-queue-rail__summary-trigger"
        :aria-expanded="String(summaryExpanded)"
        @click="handleSummaryClick"
      >
        <span class="chat-queue-rail__summary-copy">
          <strong>{{ text(`待发送 ${items.length}`, `Queued ${items.length}`) }}</strong>
          <span>{{ summaryDetail }}</span>
        </span>
        <span class="chat-queue-rail__summary-state">
          {{ compactViewport
            ? text('查看', 'Open sheet')
            : summaryExpanded
              ? text('收起', 'Collapse')
              : text('展开', 'Expand') }}
        </span>
      </button>
    </header>

    <div v-if="summaryExpanded || presentationMode === 'sheet'" class="chat-queue-rail__panel">
      <p class="chat-queue-rail__hint">
        {{ text('上一条结束后会按顺序自动发送。', 'They send automatically after the current run settles.') }}
      </p>

      <div class="chat-queue-rail__list">
        <article
          v-for="(item, index) in items"
          :key="item.id"
          class="chat-queue-rail__item"
          :class="{ blocked: item.status === 'blocked' }"
        >
          <div class="chat-queue-rail__item-head">
            <div class="chat-queue-rail__meta">
              <span class="chat-queue-rail__position">#{{ index + 1 }}</span>
              <span class="chat-queue-rail__status" :class="item.status">
                {{ item.status === 'blocked' ? text('阻塞', 'Blocked') : text('排队中', 'Queued') }}
              </span>
              <span v-if="item.fileRefs?.length || item.attachments?.length" class="chat-queue-rail__asset-count">
                {{
                  text(
                    `附件 ${Number(item.fileRefs?.length || 0) + Number(item.attachments?.length || 0)}`,
                    `Assets ${Number(item.fileRefs?.length || 0) + Number(item.attachments?.length || 0)}`,
                  )
                }}
              </span>
            </div>

            <div class="chat-queue-rail__actions">
              <button
                v-if="item.status === 'blocked'"
                type="button"
                class="chat-queue-rail__ghost"
                :disabled="mutatingEntryId === item.id"
                @click="$emit('retry-item', item.id)"
              >
                {{ text('重试', 'Retry') }}
              </button>
              <button
                type="button"
                class="chat-queue-rail__ghost"
                :disabled="mutatingEntryId === item.id"
                @click="startEdit(item)"
              >
                {{ text('编辑', 'Edit') }}
              </button>
              <button
                type="button"
                class="chat-queue-rail__ghost danger"
                :disabled="mutatingEntryId === item.id"
                @click="$emit('delete-item', item.id)"
              >
                {{ text('删除', 'Delete') }}
              </button>
            </div>
          </div>

          <div v-if="editingId === item.id" class="chat-queue-rail__editor">
            <textarea
              v-model="editingText"
              class="chat-queue-rail__textarea"
              rows="4"
              :placeholder="text('编辑待发送内容', 'Edit queued message')"
            />
            <div class="chat-queue-rail__editor-actions">
              <button
                type="button"
                class="chat-queue-rail__save"
                :disabled="!canSaveEdit(item) || mutatingEntryId === item.id"
                @click="submitEdit(item.id)"
              >
                {{ text('保存', 'Save') }}
              </button>
              <button
                type="button"
                class="chat-queue-rail__ghost"
                :disabled="mutatingEntryId === item.id"
                @click="cancelEdit"
              >
                {{ text('取消', 'Cancel') }}
              </button>
            </div>
            <p v-if="item.fileRefs?.length || item.attachments?.length" class="chat-queue-rail__editor-hint">
              {{ text('本次编辑只修改文本，原有附件与文件引用会继续保留。', 'This edit changes only the text. Existing attachments and file references are kept.') }}
            </p>
          </div>

          <div v-else class="chat-queue-rail__body">
            <p class="chat-queue-rail__text">{{ item.previewText || item.text || text('无预览文本', 'No preview text') }}</p>
            <p v-if="item.status === 'blocked' && item.blockedReason" class="chat-queue-rail__blocked-reason">
              {{ item.blockedReason }}
            </p>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import './queue-rail.css';
import { computed, ref, watch } from 'vue';
import type { ChatQueuedMessageItem } from '../../../../../types/chat';
import { useLocalePreference } from '../../shared/locale';

const props = withDefaults(defineProps<{
  items: ChatQueuedMessageItem[];
  mutatingEntryId: string | null;
  summaryExpanded: boolean;
  compactViewport: boolean;
  presentationMode?: 'rail' | 'sheet';
}>(), {
  presentationMode: 'rail',
});

const emit = defineEmits<{
  (event: 'update:summary-expanded', value: boolean): void;
  (event: 'open-sheet'): void;
  (event: 'patch-item', payload: { entryId: string; text: string }): void;
  (event: 'retry-item', entryId: string): void;
  (event: 'delete-item', entryId: string): void;
}>();

const { text } = useLocalePreference();
const editingId = ref('');
const editingText = ref('');

const summaryDetail = computed(() => {
  const firstItem = props.items[0] || null;
  if (!firstItem) {
    return text('队列为空。', 'The queue is empty.');
  }
  const assetCount = queuedAssetCount(firstItem);
  if (firstItem.status === 'blocked' && firstItem.blockedReason) {
    return text(
      `首条阻塞：${compactQueuePreview(firstItem.blockedReason)}`,
      `First blocked: ${compactQueuePreview(firstItem.blockedReason)}`,
    );
  }
  const preview = compactQueuePreview(firstItem.previewText || firstItem.text || '');
  if (preview && assetCount > 0) {
    return text(`首条：${preview} · 附件 ${assetCount}`, `Next: ${preview} · Assets ${assetCount}`);
  }
  if (preview) {
    return text(`首条：${preview}`, `Next: ${preview}`);
  }
  if (assetCount > 0) {
    return text(`首条为附件消息 · 附件 ${assetCount}`, `Next queued item contains assets · ${assetCount}`);
  }
  return props.summaryExpanded
    ? text('收起后仍可继续编辑待发送项。', 'Collapse to keep queued items compact while preserving edits.')
    : text('默认折叠，点开查看待发送消息。', 'Collapsed by default. Open to review queued messages.');
});

watch(
  [() => props.items, () => props.mutatingEntryId] as const,
  ([items, mutatingEntryId]) => {
    if (!editingId.value) {
      return;
    }
    const current = items.find((item) => item.id === editingId.value) || null;
    if (!current) {
      cancelEdit();
      return;
    }
    if (!mutatingEntryId && (current.text || '') === editingText.value) {
      cancelEdit();
    }
  },
  { deep: true },
);

function handleSummaryClick(): void {
  if (props.presentationMode === 'sheet') {
    return;
  }
  if (props.compactViewport) {
    emit('open-sheet');
    return;
  }
  emit('update:summary-expanded', !props.summaryExpanded);
}

function compactQueuePreview(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 96) {
    return normalized;
  }
  return `${normalized.slice(0, 95)}…`;
}

function queuedAssetCount(item: ChatQueuedMessageItem): number {
  return Number(item.fileRefs?.length || 0) + Number(item.attachments?.length || 0);
}

function startEdit(item: ChatQueuedMessageItem): void {
  editingId.value = item.id;
  editingText.value = item.text || item.previewText || '';
}

function cancelEdit(): void {
  editingId.value = '';
  editingText.value = '';
}

function canSaveEdit(item: ChatQueuedMessageItem): boolean {
  const trimmed = editingText.value.trim();
  if (trimmed) {
    return true;
  }
  return Boolean((item.fileRefs && item.fileRefs.length) || (item.attachments && item.attachments.length));
}

function submitEdit(entryId: string): void {
  emit('patch-item', {
    entryId,
    text: editingText.value,
  });
}
</script>
