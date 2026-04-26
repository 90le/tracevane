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
          <span>{{ summaryExpanded
            ? text('收起后仍可继续编辑待发送项。', 'Collapse to keep the queued items compact while preserving edits.')
            : text('默认折叠，点开查看待发送消息。', 'Collapsed by default. Open to review queued messages.') }}</span>
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
import { ref, watch } from 'vue';
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

<style scoped>
.chat-queue-rail {
  display: grid;
  gap: 0.6rem;
  padding: 0.72rem 0.82rem;
  border: 1px solid color-mix(in srgb, var(--chat-accent) 18%, var(--chat-line));
  border-radius: 12px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-thread-bg) 92%, transparent), color-mix(in srgb, var(--chat-thread-bg) 98%, transparent)),
    radial-gradient(circle at top right, color-mix(in srgb, var(--chat-accent) 14%, transparent), transparent 46%);
}

.chat-queue-rail__summary-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 0;
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-thread-bg) 78%, transparent);
  color: inherit;
  padding: 0.72rem 0.82rem;
  cursor: pointer;
  text-align: left;
}

.chat-queue-rail__summary-copy {
  min-width: 0;
  display: grid;
  gap: 0.14rem;
}

.chat-queue-rail__summary-copy strong {
  font-size: 0.95rem;
  color: var(--chat-text);
}

.chat-queue-rail__summary-copy span,
.chat-queue-rail__hint,
.chat-queue-rail__editor-hint {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--chat-text-soft);
}

.chat-queue-rail__summary-state {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 4.5rem;
  padding: 0.34rem 0.56rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-accent) 16%, var(--chat-thread-bg));
  color: var(--chat-accent);
  font-size: 0.75rem;
  font-weight: 600;
}

.chat-queue-rail.expanded {
  border-color: color-mix(in srgb, var(--chat-accent) 24%, var(--chat-line));
}

.chat-queue-rail__panel {
  display: grid;
  gap: 0.68rem;
}

.chat-queue-rail__list {
  display: grid;
  gap: 0.68rem;
}

.chat-queue-rail__item {
  display: grid;
  gap: 0.65rem;
  padding: 0.8rem 0.85rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 78%, transparent);
  background: color-mix(in srgb, var(--chat-thread-bg) 84%, transparent);
}

.chat-queue-rail__item.blocked {
  border-color: rgba(248, 113, 113, 0.32);
  background: color-mix(in srgb, rgba(239, 68, 68, 0.14) 80%, var(--chat-thread-bg));
}

.chat-queue-rail__item-head,
.chat-queue-rail__meta,
.chat-queue-rail__actions,
.chat-queue-rail__editor-actions {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.chat-queue-rail__item-head {
  justify-content: space-between;
}

.chat-queue-rail__position,
.chat-queue-rail__status,
.chat-queue-rail__asset-count {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.52rem;
  border-radius: 8px;
  font-size: 0.73rem;
  background: color-mix(in srgb, var(--chat-thread-bg) 82%, var(--chat-line));
  color: var(--chat-text-soft);
}

.chat-queue-rail__status.queued {
  background: color-mix(in srgb, var(--chat-accent) 16%, var(--chat-thread-bg));
  color: var(--chat-accent);
}

.chat-queue-rail__status.blocked {
  background: rgba(127, 29, 29, 0.44);
  color: rgba(254, 202, 202, 0.98);
}

.chat-queue-rail__ghost,
.chat-queue-rail__save {
  border: 1px solid color-mix(in srgb, var(--chat-line) 72%, transparent);
  background: color-mix(in srgb, var(--chat-thread-bg) 72%, transparent);
  color: var(--chat-text);
  border-radius: 10px;
  padding: 0.42rem 0.7rem;
  font-size: 0.77rem;
  cursor: pointer;
}

.chat-queue-rail__ghost.danger {
  color: rgba(254, 202, 202, 0.96);
  border-color: rgba(248, 113, 113, 0.24);
}

.chat-queue-rail__save {
  background: color-mix(in srgb, var(--chat-accent) 16%, var(--chat-thread-bg));
  border-color: color-mix(in srgb, var(--chat-accent) 36%, var(--chat-line));
}

.chat-queue-rail__ghost:disabled,
.chat-queue-rail__save:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-queue-rail__body,
.chat-queue-rail__editor {
  display: grid;
  gap: 0.55rem;
}

.chat-queue-rail__text,
.chat-queue-rail__blocked-reason {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-queue-rail__text {
  color: var(--chat-text);
  font-size: 0.88rem;
  line-height: 1.6;
}

.chat-queue-rail__blocked-reason {
  color: rgba(254, 202, 202, 0.9);
  font-size: 0.77rem;
  line-height: 1.5;
}

.chat-queue-rail__textarea {
  width: 100%;
  min-height: 5.6rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 74%, transparent);
  background: color-mix(in srgb, var(--chat-thread-bg) 72%, transparent);
  color: var(--chat-text);
  padding: 0.75rem 0.8rem;
  resize: vertical;
  font: inherit;
}

@media (max-width: 760px) {
  .chat-queue-rail {
    padding: 0.68rem;
  }

  .chat-queue-rail__summary-trigger {
    padding: 0.68rem 0.72rem;
  }

  .chat-queue-rail__item {
    padding: 0.72rem;
  }
}
</style>
