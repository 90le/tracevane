<template>
  <div
    class="chat-composer-shell"
    :class="{ 'chat-composer-drag-active': isFileDragOver }"
    :style="{ '--chat-composer-keyboard-offset': composerKeyboardOffsetStyle }"
    @dragover.prevent="handleShellDragOver"
    @dragleave.prevent="handleShellDragLeave"
    @drop.prevent="handleShellDrop"
  >
    <div v-if="isFileDragOver" class="chat-composer-drag-overlay">
      {{ text('释放以上传文件', 'Drop to upload files') }}
    </div>

    <PopoverRoot :open="!isCompactViewport && slashMenuOpen" @update:open="handleSlashMenuOpenChange">
      <PopoverAnchor as-child>
        <div class="chat-composer-frame">
          <button
            type="button"
            class="chat-composer-attachment"
            :disabled="disabled"
            :title="text('上传文件', 'Upload files')"
            @click="openFilePicker"
          >
            <Paperclip class="chat-composer-attachment-icon" aria-hidden="true" />
          </button>

          <input
            ref="fileInput"
            class="chat-composer-file-input"
            type="file"
            accept="*/*"
            multiple
            @change="handleFileSelection"
          >

          <div class="chat-composer-editor-wrap">
            <div
              ref="editorRef"
              class="chat-composer-editor"
              :class="{
                disabled,
                empty: isEditorEmpty,
                'drag-target': isEditorResourceDragOver,
              }"
              :contenteditable="!disabled"
              :data-placeholder="placeholder"
              spellcheck="true"
              @beforeinput="handleBeforeInput"
              @input="handleEditorInput"
              @keydown="handleEditorKeydown"
              @keyup="rememberSelection"
              @mouseup="rememberSelection"
              @click="rememberSelection"
              @focus="handleEditorFocus"
              @blur="handleEditorBlur"
              @compositionstart="handleCompositionStart"
              @compositionend="handleCompositionEnd"
              @paste="handlePaste"
              @dragover.prevent="handleEditorDragOver"
              @dragleave.prevent="handleEditorDragLeave"
              @drop.prevent="handleEditorDrop"
            ></div>
          </div>

          <div class="chat-composer-actions">
            <button
              v-if="canAbort"
              type="button"
              class="chat-composer-stop"
              :aria-label="text('停止', 'Stop')"
              :title="text('停止', 'Stop')"
              @click="$emit('abort')"
            >
              <span class="chat-composer-stop-icon">■</span>
            </button>

            <button
              type="button"
              class="chat-composer-send"
              :disabled="!canActuallySend"
              :aria-label="sendControlLabel"
              :title="sendControlLabel"
              @click="handleSendClick"
            >
              <span class="chat-composer-send-icon">↑</span>
            </button>
          </div>
        </div>
      </PopoverAnchor>

      <PopoverTrigger as-child>
        <button
          type="button"
          tabindex="-1"
          aria-hidden="true"
          class="chat-slash-menu-anchor"
        ></button>
      </PopoverTrigger>

      <PopoverPortal>
        <PopoverContent
          v-if="!isCompactViewport && slashMenuOpen"
          class="chat-slash-menu-popover"
          side="top"
          align="start"
          :side-offset="10"
          :collision-padding="16"
          @open-auto-focus.prevent
          @close-auto-focus.prevent
        >
          <SlashCommandMenu
            v-if="slashMenuOpen"
            :items="slashMenuItems"
            :active-index="slashMenuIndex"
            :mode="slashMenuMode"
            :active-command="slashMenuCommand"
            :argument-items="slashMenuArgItems"
            @hover-command="slashMenuIndex = $event"
            @select-command="selectSlashCommand"
            @hover-argument="slashMenuIndex = $event"
            @select-argument="selectSlashArgument"
          />
        </PopoverContent>
      </PopoverPortal>
    </PopoverRoot>

    <DialogRoot :open="Boolean(isCompactViewport && slashMenuOpen)" @update:open="handleSlashMenuOpenChange">
      <DialogPortal>
        <DialogOverlay class="chat-slash-sheet-mask" />
        <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
          <div
            v-if="isCompactViewport && slashMenuOpen"
            class="chat-slash-sheet"
            :style="{ '--chat-composer-keyboard-offset': composerKeyboardOffsetStyle }"
          >
            <header class="chat-slash-sheet__head">
              <div class="chat-slash-sheet__copy">
                <DialogTitle as-child>
                  <strong>{{ text('斜杠命令', 'Slash commands') }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span>{{ text('输入命令、浏览参数并直接补全到输入框。', 'Browse commands, inspect arguments, and insert them back into the composer.') }}</span>
                </DialogDescription>
              </div>
              <DialogClose as-child>
                <button
                  type="button"
                  class="chat-slash-sheet__close"
                  :aria-label="text('关闭命令菜单', 'Close slash menu')"
                >
                  <X class="drawer-close-icon" aria-hidden="true" />
                </button>
              </DialogClose>
            </header>

            <div class="chat-slash-sheet__body">
              <SlashCommandMenu
                :items="slashMenuItems"
                :active-index="slashMenuIndex"
                :mode="slashMenuMode"
                :active-command="slashMenuCommand"
                :argument-items="slashMenuArgItems"
                @hover-command="slashMenuIndex = $event"
                @select-command="selectSlashCommand"
                @hover-argument="slashMenuIndex = $event"
                @select-argument="selectSlashArgument"
              />
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <div v-if="attachments.length" class="chat-composer-resource-pool">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="chat-composer-pool-item"
        :class="{
          ready: attachmentState(attachment) === 'ready',
          uploading: attachmentState(attachment) === 'uploading',
          failed: attachmentState(attachment) === 'failed',
        }"
        :draggable="isAttachmentInsertable(attachment)"
        @dragstart="handlePoolDragStart($event, attachment)"
        @dragend="isEditorResourceDragOver = false"
      >
        <button
          type="button"
          class="chat-composer-pool-chip"
          :class="[`kind-${attachment.type}`]"
          :title="previewTitle(attachment)"
          :disabled="attachmentState(attachment) === 'failed'"
          @mousedown.prevent="prepareToolbarAction"
          @click="openAttachmentPreview(attachment)"
        >
          <span class="chat-composer-pool-preview">
            <img
              v-if="attachment.type === 'image'"
              class="chat-composer-pool-image"
              :src="attachment.dataUrl"
              :alt="attachment.fileName || text('图片', 'Image')"
            >
            <video
              v-else-if="attachment.type === 'video'"
              class="chat-composer-pool-image"
              :src="attachment.dataUrl"
              muted
              playsinline
              preload="metadata"
            ></video>
            <span v-else class="chat-composer-pool-file-icon">
              {{ getFileIcon(attachment) }}
            </span>
          </span>
          <span class="chat-composer-pool-copy">
            <span class="chat-composer-pool-name">{{ attachmentLabel(attachment, attachment.id) }}</span>
            <span class="chat-composer-pool-meta">{{ attachmentMetaLabel(attachment) }}</span>
          </span>
        </button>

        <span
          v-if="referenceCount(attachment.id) > 0"
          class="chat-composer-pool-refcount"
          :title="referenceCountLabel(referenceCount(attachment.id))"
        >
          {{ referenceCount(attachment.id) }}x
        </span>

        <span
          v-if="attachmentState(attachment) !== 'ready'"
          class="chat-composer-pool-status"
          :class="attachmentState(attachment)"
          :title="attachmentState(attachment) === 'uploading'
            ? text('上传中', 'Uploading')
            : text('上传失败，可重试或移除', 'Upload failed. Retry or remove it.')"
        >
          {{ attachmentState(attachment) === 'uploading' ? '…' : '!' }}
        </span>

        <div class="chat-composer-pool-actions">
          <button
            v-if="attachmentState(attachment) === 'failed'"
            type="button"
            class="chat-composer-pool-retry"
            :title="text('重新上传', 'Retry upload')"
            @mousedown.prevent="prepareToolbarAction"
            @click="handleRetryAttachment(attachment.id)"
          >
            <RefreshCcw class="chat-composer-action-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="chat-composer-pool-insert"
            :disabled="!isAttachmentInsertable(attachment)"
            :title="text('插入正文', 'Insert into message')"
            @mousedown.prevent="prepareToolbarAction"
            @click="insertAttachmentReference(attachment)"
          >
            <Plus class="chat-composer-action-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="chat-composer-attachment-remove"
            :aria-label="text('移除附件', 'Remove attachment')"
            :title="text('移除附件', 'Remove attachment')"
            @mousedown.prevent="prepareToolbarAction"
            @click="handleRemoveAttachment(attachment.id)"
          >
            <X class="chat-composer-action-icon" aria-hidden="true" />
          </button>
        </div>

        <div
          v-if="attachment.progress !== undefined && attachment.progress < 100"
          class="chat-composer-progress-bar"
        >
          <div class="chat-composer-progress-fill" :style="{ width: `${attachment.progress}%` }"></div>
        </div>
      </div>
    </div>

    <div class="chat-composer-footnote">
      <span>{{ text('Ctrl/Cmd+Enter 发送', 'Ctrl/Cmd+Enter to send') }}</span>
      <span>{{ text('输入 / 打开命令菜单', 'Type / to open command menu') }}</span>
      <span
        v-if="attachmentUploadSummary.total"
        class="chat-composer-footnote-status"
        :class="{ blocked: attachmentUploadSummary.hasBlocking }"
      >
        {{ attachmentUploadSummaryLabel }}
      </span>
    </div>
  </div>

  <DialogRoot :open="Boolean(attachmentPreview)" @update:open="handleAttachmentPreviewOpenChange">
    <DialogPortal>
      <DialogOverlay class="chat-composer-preview-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <div class="chat-composer-preview-dialog" :aria-label="attachmentPreview?.alt || text('附件预览', 'Attachment preview')">
          <DialogTitle as-child>
            <span class="sr-only">{{ attachmentPreview?.alt || text('附件预览', 'Attachment preview') }}</span>
          </DialogTitle>
          <DialogDescription as-child>
            <span class="sr-only">{{ text('预览当前聊天附件，可关闭后继续编辑消息。', 'Preview the current chat attachment, then close to continue editing.') }}</span>
          </DialogDescription>
          <DialogClose as-child>
            <button
              type="button"
              class="chat-composer-preview-close"
              :aria-label="text('关闭预览', 'Close preview')"
            >
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </DialogClose>

          <img
            v-if="attachmentPreview?.kind === 'image'"
            class="chat-composer-preview-image"
            :src="attachmentPreview.src"
            :alt="attachmentPreview.alt"
          >
          <video
            v-else-if="attachmentPreview?.kind === 'video'"
            class="chat-composer-preview-video"
            :src="attachmentPreview.src"
            controls
            autoplay
            playsinline
          ></video>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import './composer-bar.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Paperclip, Plus, RefreshCcw, X } from '@lucide/vue';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  PopoverAnchor,
  PopoverContent,
  PopoverPortal,
  PopoverRoot,
  PopoverTrigger,
} from 'reka-ui';
import type {
  ChatAttachmentKind,
  ChatComposerDocument,
  ChatComposerNode,
  ChatComposerResourceDisplay,
  ChatComposerResourceRefNode,
} from '../../../../../types/chat';
import {
  composerDocumentUnitLength,
  composeComposerAttachmentMentionLabel,
  createEmptyComposerDocument,
  extractComposerPlainText,
  hasComposerDocumentContent,
  insertComposerResourceNodeAtOffset,
  normalizeComposerDocument,
  removeComposerAttachmentReferences,
} from '../../../../../lib/composer-model';
import {
  canSendComposerDraft,
  deriveComposerAttachmentUploadState,
  summarizeComposerAttachmentUploadStates,
  type ChatComposerUploadState,
} from '../../../../../lib/chat-composer';
import { useLocalePreference } from '../../shared/locale';
import SlashCommandMenu from './SlashCommandMenu.vue';
import {
  filterStudioSlashCommandArgOptionDetails,
  getStudioSlashCommandArgOptions,
  getStudioSlashCommandCompletions,
  parseStudioSlashCommand,
  type StudioSlashArgOptionDetail,
  type StudioSlashCommandDef,
} from './slash-commands';

type ComposerAttachment = {
  id: string;
  type: ChatAttachmentKind;
  fileName?: string;
  mimeType: string;
  dataUrl: string;
  downloadUrl?: string | null;
  size?: number;
  progress?: number;
  relativePath?: string | null;
  uploadState?: ChatComposerUploadState;
};

const RESOURCE_DRAG_MIME = 'application/x-openclaw-studio-composer-resource';

const props = defineProps<{
  document: ChatComposerDocument;
  attachments: ComposerAttachment[];
  placeholder: string;
  disabled: boolean;
  canSend: boolean;
  canAbort: boolean;
  sendBusy: boolean;
  abortBusy: boolean;
  slashArgOptionsOverrides: Record<string, string[]>;
}>();

const emit = defineEmits<{
  (event: 'update:document', value: ChatComposerDocument): void;
  (event: 'send', value: ChatComposerDocument): void;
  (event: 'abort'): void;
  (event: 'select-files', payload: File[]): void;
  (event: 'remove-attachment', attachmentId: string): void;
  (event: 'retry-attachment', attachmentId: string): void;
  (event: 'keydown', payload: KeyboardEvent): void;
  (event: 'viewport-lift', value: number): void;
}>();

const { locale, text } = useLocalePreference();
const fileInput = ref<HTMLInputElement | null>(null);
const editorRef = ref<HTMLElement | null>(null);
const isFileDragOver = ref(false);
const isEditorResourceDragOver = ref(false);
const pendingSelectionOffset = ref<number | null>(null);
const isComposing = ref(false);
const localDocument = shallowRef<ChatComposerDocument>(normalizeComposerDocument(props.document, { editorSurface: true }));
const isEditorEmpty = ref(!hasComposerDocumentContent(localDocument.value));
const hasLocalContent = ref(hasComposerDocumentContent(localDocument.value));
const attachmentReferenceCounts = ref<Record<string, number>>({});
const attachmentPreview = ref<null | {
  src: string;
  alt: string;
  kind: 'image' | 'video';
}>(null);
const slashMenuOpen = ref(false);
const slashMenuMode = ref<'command' | 'args'>('command');
const slashMenuItems = ref<StudioSlashCommandDef[]>([]);
const slashMenuIndex = ref(0);
const slashMenuCommand = ref<StudioSlashCommandDef | null>(null);
const slashMenuArgItems = ref<StudioSlashArgOptionDetail[]>([]);
const isCompactViewport = ref(false);
const keyboardLiftPx = ref(0);
const composerKeyboardOffsetStyle = computed(() => `${keyboardLiftPx.value}px`);
let isSyncingEditorDom = false;
let deferredExternalDocument: ChatComposerDocument | null = null;
let suppressNextBlurSync = false;
let compactViewportMediaQuery: MediaQueryList | null = null;
let compactViewportListener: ((event: MediaQueryListEvent) => void) | null = null;
let viewportKeyboardListener: (() => void) | null = null;
const attachmentUploadSummary = computed(() => summarizeComposerAttachmentUploadStates(props.attachments));
const canActuallySend = computed(() => canSendComposerDraft({
  canSend: props.canSend,
  hasContent: hasLocalContent.value,
  attachments: props.attachments,
}));
const sendControlLabel = computed(() => {
  if (props.sendBusy) {
    return text('发送中...', 'Sending...');
  }
  if (attachmentUploadSummary.value.uploading > 0) {
    return text(
      `还有 ${attachmentUploadSummary.value.uploading} 个附件上传中`,
      `${attachmentUploadSummary.value.uploading} attachment(s) still uploading`,
    );
  }
  if (attachmentUploadSummary.value.failed > 0) {
    return text(
      `${attachmentUploadSummary.value.failed} 个附件上传失败，请重试或移除`,
      `${attachmentUploadSummary.value.failed} attachment(s) failed. Retry or remove them.`,
    );
  }
  if (!props.canSend || props.disabled) {
    return text('当前不能发送', 'Cannot send right now');
  }
  if (!hasLocalContent.value && props.attachments.length === 0) {
    return text('输入消息或添加附件后发送', 'Type a message or attach a file first');
  }
  return text('发送', 'Send');
});
const attachmentUploadSummaryLabel = computed(() => {
  const summary = attachmentUploadSummary.value;
  if (summary.uploading > 0) {
    return text(
      `附件上传中 ${summary.uploading}/${summary.total}`,
      `Uploading attachments ${summary.uploading}/${summary.total}`,
    );
  }
  if (summary.failed > 0) {
    return text(
      `附件失败 ${summary.failed}/${summary.total}`,
      `Failed attachments ${summary.failed}/${summary.total}`,
    );
  }
  return text(
    `附件就绪 ${summary.ready}/${summary.total}`,
    `Attachments ready ${summary.ready}/${summary.total}`,
  );
});
const attachmentLookup = computed(() => new Map(props.attachments.map((attachment) => [attachment.id, attachment] as const)));

function clearSlashMenuState(): void {
  slashMenuOpen.value = false;
  slashMenuMode.value = 'command';
  slashMenuItems.value = [];
  slashMenuIndex.value = 0;
  slashMenuCommand.value = null;
  slashMenuArgItems.value = [];
}

function handleSlashMenuOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    clearSlashMenuState();
  }
}

function syncCompactViewport(): void {
  if (!compactViewportMediaQuery) {
    isCompactViewport.value = false;
    setKeyboardLift(0);
    return;
  }
  isCompactViewport.value = compactViewportMediaQuery.matches;
  syncKeyboardLiftFromViewport();
}

function bindCompactViewport(): void {
  if (typeof window === 'undefined') {
    return;
  }
  compactViewportMediaQuery = window.matchMedia('(max-width: 760px)');
  compactViewportListener = () => {
    syncCompactViewport();
  };
  syncCompactViewport();
  if ('addEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.addEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.addListener(compactViewportListener);
  }
}

function unbindCompactViewport(): void {
  if (!compactViewportMediaQuery || !compactViewportListener) {
    return;
  }
  if ('removeEventListener' in compactViewportMediaQuery) {
    compactViewportMediaQuery.removeEventListener('change', compactViewportListener);
  } else {
    compactViewportMediaQuery.removeListener(compactViewportListener);
  }
  compactViewportMediaQuery = null;
  compactViewportListener = null;
}

function editorHasFocus(): boolean {
  return typeof document !== 'undefined' && document.activeElement === editorRef.value;
}

function setKeyboardLift(nextValue: number): void {
  nextValue = Math.max(0, Math.round(nextValue));
  if (keyboardLiftPx.value === nextValue) {
    return;
  }
  keyboardLiftPx.value = nextValue;
  emit('viewport-lift', nextValue);
}

function syncKeyboardLiftFromViewport(): void {
  if (
    typeof window === 'undefined'
    || !window.visualViewport
    || !isCompactViewport.value
    || !editorHasFocus()
  ) {
    setKeyboardLift(0);
    return;
  }
  const overlap = Math.max(
    0,
    Math.round(window.innerHeight - (window.visualViewport.height + window.visualViewport.offsetTop)),
  );
  const nextValue = overlap > 88 ? overlap : 0;
  setKeyboardLift(nextValue);
}

function bindViewportKeyboard(): void {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return;
  }
  viewportKeyboardListener = () => {
    syncKeyboardLiftFromViewport();
  };
  window.visualViewport.addEventListener('resize', viewportKeyboardListener);
  window.visualViewport.addEventListener('scroll', viewportKeyboardListener);
  window.addEventListener('orientationchange', viewportKeyboardListener);
}

function unbindViewportKeyboard(): void {
  if (typeof window === 'undefined' || !window.visualViewport || !viewportKeyboardListener) {
    return;
  }
  window.visualViewport.removeEventListener('resize', viewportKeyboardListener);
  window.visualViewport.removeEventListener('scroll', viewportKeyboardListener);
  window.removeEventListener('orientationchange', viewportKeyboardListener);
  viewportKeyboardListener = null;
}

function documentSupportsSlashMenu(document: ChatComposerDocument): boolean {
  return !normalizeComposerDocument(document).some((node) => node.type === 'resource-ref');
}

function filteredSlashArgOptionDetails(command: StudioSlashCommandDef, filter: string): StudioSlashArgOptionDetail[] {
  return filterStudioSlashCommandArgOptionDetails(
    command,
    filter,
    locale.value,
    props.slashArgOptionsOverrides,
  );
}

function updateSlashMenu(documentValue: ChatComposerDocument = localDocument.value): void {
  if (props.disabled || !documentSupportsSlashMenu(documentValue)) {
    clearSlashMenuState();
    return;
  }

  const plainText = extractComposerPlainText(documentValue).trim();
  if (!plainText.startsWith('/')) {
    clearSlashMenuState();
    return;
  }

  const parsed = parseStudioSlashCommand(plainText);
  const argOptions = parsed ? getStudioSlashCommandArgOptions(parsed.command, props.slashArgOptionsOverrides) : [];
  if (parsed && argOptions.length) {
    const filteredArgDetails = filteredSlashArgOptionDetails(parsed.command, parsed.args);
    if (filteredArgDetails.length > 0) {
      slashMenuOpen.value = true;
      slashMenuMode.value = 'args';
      slashMenuCommand.value = parsed.command;
      slashMenuArgItems.value = filteredArgDetails;
      slashMenuItems.value = [];
      slashMenuIndex.value = Math.min(slashMenuIndex.value, filteredArgDetails.length - 1);
      if (slashMenuIndex.value < 0) {
        slashMenuIndex.value = 0;
      }
      return;
    }
  }

  const commandMatch = plainText.match(/^\/(\S*)$/u);
  if (!commandMatch) {
    clearSlashMenuState();
    return;
  }

  const items = getStudioSlashCommandCompletions(commandMatch[1] || '');
  slashMenuOpen.value = items.length > 0;
  slashMenuMode.value = 'command';
  slashMenuItems.value = items;
  slashMenuCommand.value = null;
  slashMenuArgItems.value = [];
  slashMenuIndex.value = items.length ? Math.min(slashMenuIndex.value, items.length - 1) : 0;
}

function replaceComposerWithPlainText(value: string, options: { keepSlashMenu?: boolean } = {}): void {
  const nextDocument = normalizeComposerDocument([
    {
      type: 'text',
      id: `composer-slash-${Date.now()}`,
      text: value,
    },
  ], { editorSurface: true });
  pendingSelectionOffset.value = value.length;
  commitDocument(nextDocument, {
    render: true,
  });
  if (options.keepSlashMenu === false) {
    clearSlashMenuState();
  } else {
    updateSlashMenu(nextDocument);
  }
  scheduleEditorSelectionRestore(value.length);
}

function selectSlashCommand(command: StudioSlashCommandDef): void {
  const nextValue = command.args ? `/${command.name} ` : `/${command.name}`;
  replaceComposerWithPlainText(nextValue);
}

function selectSlashArgument(value: string): void {
  if (!value) {
    return;
  }
  const command = slashMenuCommand.value;
  if (!command) {
    return;
  }
  replaceComposerWithPlainText(`/${command.name} ${value}`, { keepSlashMenu: false });
}

function attachmentForNode(node: ChatComposerResourceRefNode): ComposerAttachment | null {
  return attachmentLookup.value.get(node.attachmentId) || null;
}

function attachmentLabel(attachment: ComposerAttachment | null, fallbackId: string): string {
  if (!attachment) {
    return `@${fallbackId.replace(/^@+/, '')}`;
  }
  return composeComposerAttachmentMentionLabel(attachment);
}

function referenceCount(attachmentId: string): number {
  return attachmentReferenceCounts.value[attachmentId] || 0;
}

function referenceCountLabel(count: number): string {
  return text(`已引用 ${count} 次`, `${count} refs`);
}

function formatAttachmentSize(size: number | undefined): string {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return '';
  }
  if (size < 1024) {
    return `${Math.round(size)} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 102.4) / 10} KB`;
  }
  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function attachmentState(attachment: ComposerAttachment): ChatComposerUploadState {
  return deriveComposerAttachmentUploadState(attachment);
}

function attachmentMetaLabel(attachment: ComposerAttachment): string {
  const state = attachmentState(attachment);
  if (state === 'uploading') {
    const progress = typeof attachment.progress === 'number' && Number.isFinite(attachment.progress)
      ? Math.max(0, Math.min(100, Math.round(attachment.progress)))
      : null;
    return progress == null
      ? text('上传中', 'Uploading')
      : text(`上传 ${progress}%`, `Uploading ${progress}%`);
  }
  if (state === 'failed') {
    return text('上传失败', 'Upload failed');
  }
  const size = formatAttachmentSize(attachment.size);
  return size
    ? text(`已就绪 · ${size}`, `Ready · ${size}`)
    : text('已就绪', 'Ready');
}

function defaultDisplay(type: ChatAttachmentKind): ChatComposerResourceDisplay {
  if (type === 'image') {
    return 'inline-image';
  }
  if (type === 'video') {
    return 'inline-video';
  }
  return 'inline-chip';
}

function tokenBadge(type: ChatAttachmentKind): string {
  if (type === 'image') return 'IMG';
  if (type === 'video') return 'VID';
  return 'FILE';
}

function isAttachmentInsertable(attachment: ComposerAttachment): boolean {
  return !props.disabled && attachmentState(attachment) === 'ready';
}

function previewTitle(attachment: ComposerAttachment): string {
  const label = attachmentLabel(attachment, attachment.id);
  if (attachment.type === 'image') {
    return text(`预览图片 ${label}`, `Preview image ${label}`);
  }
  if (attachment.type === 'video') {
    return text(`预览视频 ${label}`, `Preview video ${label}`);
  }
  return text(`打开文件 ${label}`, `Open file ${label}`);
}

function openFilePicker(): void {
  if (props.disabled) {
    return;
  }
  fileInput.value?.click();
}

function handleFileSelection(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const files = input?.files ? Array.from(input.files) : [];
  if (files.length) {
    emit('select-files', files);
  }
  if (input) {
    input.value = '';
  }
}

function handleShellDragOver(event: DragEvent): void {
  if (props.disabled) return;
  if (event.dataTransfer?.types.includes('Files') && !event.dataTransfer.types.includes(RESOURCE_DRAG_MIME)) {
    isFileDragOver.value = true;
  }
}

function handleShellDragLeave(event: DragEvent): void {
  if (event.relatedTarget && (event.currentTarget as HTMLElement)?.contains(event.relatedTarget as Node)) {
    return;
  }
  isFileDragOver.value = false;
}

function handleShellDrop(event: DragEvent): void {
  isFileDragOver.value = false;
  if (props.disabled) return;
  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (files.length) {
    emit('select-files', files);
  }
}

function openAttachmentPreview(attachment: ComposerAttachment): void {
  if (attachmentState(attachment) === 'failed') {
    return;
  }
  const label = attachmentLabel(attachment, attachment.id);
  if (attachment.type === 'image') {
    attachmentPreview.value = {
      src: attachment.dataUrl,
      alt: label,
      kind: 'image',
    };
    return;
  }
  if (attachment.type === 'video') {
    attachmentPreview.value = {
      src: attachment.dataUrl,
      alt: label,
      kind: 'video',
    };
    return;
  }
  if (typeof window !== 'undefined') {
    window.open(attachment.downloadUrl || attachment.dataUrl, '_blank', 'noopener,noreferrer');
  }
}

function closeAttachmentPreview(): void {
  attachmentPreview.value = null;
}

function handleAttachmentPreviewOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    closeAttachmentPreview();
  }
}

function prepareToolbarAction(): void {
  suppressNextBlurSync = true;
  rememberSelection();
}

function pushTextNode(
  nodes: ChatComposerNode[],
  textValue: string,
  id?: string,
): void {
  if (!textValue) {
    return;
  }
  const normalizedId = typeof id === 'string' && id.trim() ? id.trim() : '';
  const last = nodes[nodes.length - 1];
  if (!normalizedId && last?.type === 'text') {
    last.text += textValue;
    return;
  }
  nodes.push({
    type: 'text',
    id: normalizedId || `composer-text-${Math.random().toString(36).slice(2, 10)}`,
    text: textValue,
  });
}

function documentSignature(document: ChatComposerDocument | undefined | null): string {
  return normalizeComposerDocument(document, { editorSurface: true })
    .map((node) => {
      if (node.type === 'text') {
        return `t:${node.id}:${node.text}`;
      }
      return `r:${node.id}:${node.attachmentId}:${node.display}`;
    })
    .join('|');
}

function deriveAttachmentReferenceCounts(document: ChatComposerDocument): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of normalizeComposerDocument(document)) {
    if (node.type !== 'resource-ref') {
      continue;
    }
    counts[node.attachmentId] = (counts[node.attachmentId] || 0) + 1;
  }
  return counts;
}

function updateEditorDerivedState(document: ChatComposerDocument): void {
  const normalized = normalizeComposerDocument(document, { editorSurface: true });
  hasLocalContent.value = hasComposerDocumentContent(normalized);
  isEditorEmpty.value = !normalized.some((node) => node.type === 'resource-ref' || Boolean(node.text));
  attachmentReferenceCounts.value = deriveAttachmentReferenceCounts(normalized);
}

function updateEditorVisualStateFromDom(): void {
  const root = editorRef.value;
  if (!root) {
    hasLocalContent.value = hasComposerDocumentContent(localDocument.value);
    isEditorEmpty.value = !hasLocalContent.value;
    return;
  }
  const hasResource = Boolean(root.querySelector('[data-composer-node-type="resource"]'));
  const textValue = root.textContent || '';
  hasLocalContent.value = hasResource || Boolean(textValue.trim());
  isEditorEmpty.value = !hasResource && !textValue;
}

function snapshotDocumentFromEditorDom(): ChatComposerDocument {
  const nextDocument = parseEditorDom(editorRef.value);
  localDocument.value = nextDocument;
  updateEditorDerivedState(nextDocument);
  return nextDocument;
}

function buildResourceTokenElement(node: ChatComposerResourceRefNode): HTMLSpanElement {
  const element = document.createElement('span');
  const attachment = attachmentForNode(node);
  element.className = `chat-composer-token display-${node.display} kind-${attachment?.type || 'file'}`;
  element.dataset.composerNodeType = 'resource';
  element.dataset.nodeId = node.id;
  element.dataset.attachmentId = node.attachmentId;
  element.dataset.display = node.display;
  element.contentEditable = 'false';

  if (attachment?.type === 'image') {
    const image = document.createElement('img');
    image.className = 'chat-composer-token-media';
    image.src = attachment.dataUrl;
    image.alt = attachment.fileName || text('图片', 'Image');
    element.appendChild(image);
  } else if (attachment?.type === 'video') {
    const video = document.createElement('video');
    video.className = 'chat-composer-token-media';
    video.src = attachment.dataUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    element.appendChild(video);
  } else {
    const badge = document.createElement('span');
    badge.className = 'chat-composer-token-badge';
    badge.textContent = tokenBadge(attachment?.type || 'file');
    element.appendChild(badge);
  }

  const label = document.createElement('span');
  label.className = 'chat-composer-token-label';
  label.textContent = attachmentLabel(attachment, node.attachmentId);
  element.appendChild(label);
  return element;
}

function renderEditorDom(
  documentValue: ChatComposerDocument,
  options: {
    restoreOffset?: number | null;
    focus?: boolean;
  } = {},
): void {
  const root = editorRef.value;
  if (!root) {
    return;
  }

  isSyncingEditorDom = true;
  root.replaceChildren();
  for (const node of normalizeComposerDocument(documentValue, { editorSurface: true })) {
    if (node.type === 'text') {
      const element = document.createElement('span');
      element.className = 'chat-composer-editor-text';
      element.dataset.composerNodeType = 'text';
      element.dataset.nodeId = node.id;
      element.textContent = node.text;
      root.appendChild(element);
      continue;
    }
    root.appendChild(buildResourceTokenElement(node));
  }
  isSyncingEditorDom = false;

  if (options.focus) {
    root.focus();
  }
  if (options.restoreOffset != null) {
    restoreSelection(options.restoreOffset);
  }
}

function commitDocument(
  nextDocument: ChatComposerDocument,
  options: {
    restoreOffset?: number | null;
    focus?: boolean;
    emitChange?: boolean;
    render?: boolean;
  } = {},
): void {
  const normalized = normalizeComposerDocument(nextDocument, { editorSurface: true });
  localDocument.value = normalized;
  updateEditorDerivedState(normalized);
  if (options.render !== false) {
    renderEditorDom(normalized, {
      restoreOffset: options.restoreOffset ?? null,
      focus: options.focus === true,
    });
  }
  if (options.emitChange !== false) {
    emit('update:document', normalized);
  }
}

function parseEditorDom(root: HTMLElement | null): ChatComposerDocument {
  if (!root) {
    return createEmptyComposerDocument();
  }

  const next: ChatComposerNode[] = [];

  const visit = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      pushTextNode(next, node.textContent || '');
      return;
    }

    if (!(node instanceof HTMLElement)) {
      return;
    }

    const nodeType = node.dataset.composerNodeType;
    if (nodeType === 'text') {
      pushTextNode(next, node.textContent || '', node.dataset.nodeId);
      return;
    }
    if (nodeType === 'resource') {
      const attachmentId = node.dataset.attachmentId?.trim() || '';
      const display = node.dataset.display?.trim();
      if (!attachmentId) {
        return;
      }
      next.push({
        type: 'resource-ref',
        id: node.dataset.nodeId?.trim() || `composer-ref-${Math.random().toString(36).slice(2, 10)}`,
        attachmentId,
        display: display === 'inline-image'
          || display === 'inline-video'
          || display === 'inline-chip'
          || display === 'break-image'
          || display === 'break-video'
          || display === 'break-chip'
          ? display
          : 'inline-chip',
      });
      return;
    }

    if (node.tagName === 'BR') {
      pushTextNode(next, '\n');
      return;
    }

    const isBlock = node !== root && (node.tagName === 'DIV' || node.tagName === 'P');
    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
    if (isBlock) {
      const last = next[next.length - 1];
      if (last?.type !== 'text' || !last.text.endsWith('\n')) {
        pushTextNode(next, '\n');
      }
    }
  };

  for (const child of Array.from(root.childNodes)) {
    visit(child);
  }

  return normalizeComposerDocument(next, { editorSurface: true });
}

function selectionInsideEditor(): Selection | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    return null;
  }
  const root = editorRef.value;
  if (!root) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) {
    return null;
  }
  return selection;
}

function directChildOffsetLength(child: Node): number {
  if (child instanceof HTMLElement && child.dataset.composerNodeType === 'resource') {
    return 1;
  }
  return child.textContent?.length || 0;
}

function nodeContains(container: Node, target: Node): boolean {
  return container === target || (container instanceof HTMLElement && container.contains(target));
}

function resolveSelectionOffset(defaultToEnd = false): number {
  const root = editorRef.value;
  if (!root) {
    return 0;
  }
  const selection = selectionInsideEditor();
  if (!selection) {
    return defaultToEnd ? composerDocumentUnitLength(localDocument.value) : 0;
  }

  const range = selection.getRangeAt(0);
  let offset = 0;

  if (range.startContainer === root) {
    const directIndex = Math.min(range.startOffset, root.childNodes.length);
    for (let index = 0; index < directIndex; index += 1) {
      offset += directChildOffsetLength(root.childNodes[index] as Node);
    }
    return offset;
  }

  for (const child of Array.from(root.childNodes)) {
    if (child instanceof HTMLElement && child.dataset.composerNodeType === 'resource') {
      if (child === range.startContainer || child.contains(range.startContainer)) {
        return offset + (range.startOffset > 0 ? 1 : 0);
      }
      offset += 1;
      continue;
    }

    if (nodeContains(child, range.startContainer)) {
      const textRange = document.createRange();
      textRange.selectNodeContents(child);
      textRange.setEnd(range.startContainer, range.startOffset);
      return offset + textRange.toString().length;
    }

    offset += child.textContent?.length || 0;
  }

  return offset;
}

function restoreSelection(offset: number | null): void {
  const root = editorRef.value;
  if (!root || offset == null) {
    return;
  }
  const bounded = Math.max(0, Math.min(offset, composerDocumentUnitLength(localDocument.value)));
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const range = document.createRange();
  let remaining = bounded;
  let placed = false;

  for (const child of Array.from(root.childNodes)) {
    if (child instanceof HTMLElement && child.dataset.composerNodeType === 'resource') {
      if (remaining === 0) {
        range.setStartBefore(child);
        range.collapse(true);
        placed = true;
        break;
      }
      remaining -= 1;
      if (remaining === 0) {
        range.setStartAfter(child);
        range.collapse(true);
        placed = true;
        break;
      }
      continue;
    }

    const textLength = child.textContent?.length || 0;
    if (remaining <= textLength) {
      const textNode = child.firstChild || child;
      range.setStart(textNode, remaining);
      range.collapse(true);
      placed = true;
      break;
    }
    remaining -= textLength;
  }

  if (!placed) {
    if (root.childNodes.length) {
      range.setStartAfter(root.childNodes[root.childNodes.length - 1] as Node);
    } else {
      range.setStart(root, 0);
    }
    range.collapse(true);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}

function rememberSelection(): void {
  if (isSyncingEditorDom) {
    return;
  }
  pendingSelectionOffset.value = resolveSelectionOffset(true);
}

function syncDocumentToParent(): void {
  const documentValue = snapshotDocumentFromEditorDom();
  updateSlashMenu(documentValue);
  emit('update:document', normalizeComposerDocument(documentValue, { editorSurface: true }));
}

function handleEditorInput(): void {
  if (isSyncingEditorDom) {
    return;
  }
  if (isComposing.value) {
    return;
  }
  pendingSelectionOffset.value = resolveSelectionOffset(true);
  const documentValue = snapshotDocumentFromEditorDom();
  updateSlashMenu(documentValue);
}

function insertPlainTextAtSelection(value: string): void {
  const selection = selectionInsideEditor();
  if (!selection?.rangeCount) {
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const textNode = document.createTextNode(value);
  range.insertNode(textNode);
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  handleEditorInput();
}

function handleBeforeInput(event: InputEvent): void {
  if (props.disabled) {
    return;
  }
  if (isComposing.value) {
    return;
  }
  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    event.preventDefault();
    insertPlainTextAtSelection('\n');
  }
}

function handleEditorBlur(): void {
  if (suppressNextBlurSync) {
    suppressNextBlurSync = false;
    return;
  }
  setKeyboardLift(0);
  if (isComposing.value) {
    return;
  }
  syncDocumentToParent();
  clearSlashMenuState();
}

function handleEditorFocus(): void {
  rememberSelection();
  nextTick(() => {
    syncKeyboardLiftFromViewport();
    if (!isCompactViewport.value) {
      return;
    }
    window.setTimeout(() => {
      syncKeyboardLiftFromViewport();
      editorRef.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, 120);
  });
}

function handleEditorKeydown(event: KeyboardEvent): void {
  if (slashMenuOpen.value && slashMenuMode.value === 'args' && slashMenuArgItems.value.length > 0) {
    const total = slashMenuArgItems.value.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      slashMenuIndex.value = (slashMenuIndex.value + 1) % total;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      slashMenuIndex.value = (slashMenuIndex.value - 1 + total) % total;
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      selectSlashArgument(slashMenuArgItems.value[slashMenuIndex.value]?.value || slashMenuArgItems.value[0]?.value || '');
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      selectSlashArgument(slashMenuArgItems.value[slashMenuIndex.value]?.value || slashMenuArgItems.value[0]?.value || '');
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSlashMenuState();
      return;
    }
  }

  if (slashMenuOpen.value && slashMenuMode.value === 'command' && slashMenuItems.value.length > 0) {
    const total = slashMenuItems.value.length;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      slashMenuIndex.value = (slashMenuIndex.value + 1) % total;
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      slashMenuIndex.value = (slashMenuIndex.value - 1 + total) % total;
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      selectSlashCommand(slashMenuItems.value[slashMenuIndex.value] || slashMenuItems.value[0]);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      selectSlashCommand(slashMenuItems.value[slashMenuIndex.value] || slashMenuItems.value[0]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      clearSlashMenuState();
      return;
    }
  }

  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    handleSendClick();
    return;
  }
  emit('keydown', event);
}

function handleCompositionStart(): void {
  isComposing.value = true;
}

function handleCompositionEnd(): void {
  isComposing.value = false;
  pendingSelectionOffset.value = resolveSelectionOffset(true);
  const documentValue = snapshotDocumentFromEditorDom();
  updateSlashMenu(documentValue);
  if (deferredExternalDocument) {
    const nextDocument = deferredExternalDocument;
    deferredExternalDocument = null;
    commitDocument(nextDocument, { render: true, emitChange: false });
  }
}

function handleSendClick(): void {
  if (!canActuallySend.value) {
    return;
  }
  const documentValue = snapshotDocumentFromEditorDom();
  clearSlashMenuState();
  emit('update:document', normalizeComposerDocument(documentValue, { editorSurface: true }));
  emit('send', normalizeComposerDocument(documentValue, { editorSurface: true }));
}

function scheduleEditorSelectionRestore(offset: number): void {
  const run = () => {
    editorRef.value?.focus();
    restoreSelection(offset);
    suppressNextBlurSync = false;
  };
  if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return;
  }
  setTimeout(run, 0);
}

function insertAttachmentReference(attachment: ComposerAttachment): void {
  if (!isAttachmentInsertable(attachment)) {
    return;
  }
  const baseDocument = snapshotDocumentFromEditorDom();
  const currentOffset = pendingSelectionOffset.value ?? resolveSelectionOffset(true);
  const nextDocument = insertComposerResourceNodeAtOffset(
    baseDocument,
    attachment.id,
    defaultDisplay(attachment.type),
    currentOffset,
  );
  pendingSelectionOffset.value = currentOffset + 1;
  commitDocument(nextDocument, {
    render: true,
  });
  scheduleEditorSelectionRestore(currentOffset + 1);
}

function handleRemoveAttachment(attachmentId: string): void {
  const baseDocument = snapshotDocumentFromEditorDom();
  const nextDocument = removeComposerAttachmentReferences(baseDocument, attachmentId);
  const nextOffset = Math.min(
    pendingSelectionOffset.value ?? resolveSelectionOffset(true),
    composerDocumentUnitLength(nextDocument),
  );
  pendingSelectionOffset.value = nextOffset;
  commitDocument(nextDocument, {
    render: true,
  });
  if (typeof document !== 'undefined' && document.activeElement === editorRef.value) {
    scheduleEditorSelectionRestore(nextOffset);
  } else {
    suppressNextBlurSync = false;
  }
  emit('remove-attachment', attachmentId);
}

function handleRetryAttachment(attachmentId: string): void {
  suppressNextBlurSync = false;
  emit('retry-attachment', attachmentId);
}

function setSelectionFromPoint(clientX: number, clientY: number): void {
  const selection = window.getSelection();
  if (!selection) {
    return;
  }

  const anyDocument = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };

  if (typeof anyDocument.caretRangeFromPoint === 'function') {
    const range = anyDocument.caretRangeFromPoint(clientX, clientY);
    if (range && editorRef.value?.contains(range.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
  }

  if (typeof anyDocument.caretPositionFromPoint === 'function') {
    const position = anyDocument.caretPositionFromPoint(clientX, clientY);
    if (position && editorRef.value?.contains(position.offsetNode)) {
      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }
}

function handlePoolDragStart(event: DragEvent, attachment: ComposerAttachment): void {
  if (!isAttachmentInsertable(attachment) || !event.dataTransfer) {
    event.preventDefault();
    return;
  }
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData(RESOURCE_DRAG_MIME, JSON.stringify({
    attachmentId: attachment.id,
    display: defaultDisplay(attachment.type),
  }));
  event.dataTransfer.setData('text/plain', attachmentLabel(attachment, attachment.id));
}

function handleEditorDragOver(event: DragEvent): void {
  if (props.disabled) {
    return;
  }
  if (event.dataTransfer?.types.includes(RESOURCE_DRAG_MIME)) {
    isEditorResourceDragOver.value = true;
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleEditorDragLeave(event: DragEvent): void {
  if (event.relatedTarget && (event.currentTarget as HTMLElement)?.contains(event.relatedTarget as Node)) {
    return;
  }
  isEditorResourceDragOver.value = false;
}

function handleEditorDrop(event: DragEvent): void {
  isEditorResourceDragOver.value = false;
  if (props.disabled) {
    return;
  }
  if (event.dataTransfer?.types.includes(RESOURCE_DRAG_MIME)) {
    const raw = event.dataTransfer.getData(RESOURCE_DRAG_MIME);
    try {
      const parsed = JSON.parse(raw) as { attachmentId?: string; display?: ChatComposerResourceDisplay };
      const attachment = parsed.attachmentId ? attachmentLookup.value.get(parsed.attachmentId) : null;
      if (!attachment || !isAttachmentInsertable(attachment)) {
        return;
      }
      setSelectionFromPoint(event.clientX, event.clientY);
      rememberSelection();
      const baseDocument = snapshotDocumentFromEditorDom();
      const currentOffset = pendingSelectionOffset.value ?? resolveSelectionOffset(true);
      const nextDocument = insertComposerResourceNodeAtOffset(
        baseDocument,
        attachment.id,
        parsed.display || defaultDisplay(attachment.type),
        currentOffset,
      );
      pendingSelectionOffset.value = currentOffset + 1;
      commitDocument(nextDocument, {
        render: true,
      });
      scheduleEditorSelectionRestore(currentOffset + 1);
      return;
    } catch {
      return;
    }
  }

  const files = event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
  if (files.length) {
    emit('select-files', files);
  }
}

function handlePaste(event: ClipboardEvent): void {
  if (props.disabled) {
    return;
  }

  const clipboardFiles: File[] = [];
  const items = event.clipboardData?.items;
  if (items) {
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          clipboardFiles.push(file);
        }
      }
    }
  }

  if (clipboardFiles.length) {
    event.preventDefault();
    emit('select-files', clipboardFiles);
    return;
  }

  const textValue = event.clipboardData?.getData('text/plain') || '';
  if (textValue) {
    event.preventDefault();
    insertPlainTextAtSelection(textValue);
  }
}

function getFileIcon(attachment: { type: ChatAttachmentKind; mimeType: string; fileName?: string }): string {
  if (attachment.type === 'image') return 'IMG';
  if (attachment.type === 'video') return 'VID';

  const mime = attachment.mimeType.toLowerCase();
  const ext = attachment.fileName?.split('.').pop()?.toLowerCase() || '';

  if (mime.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'AUD';
  if (mime === 'application/pdf' || ext === 'pdf') return 'PDF';
  if (mime.includes('word') || mime.includes('document') || ['doc', 'docx'].includes(ext)) return 'DOC';
  if (mime.includes('excel') || mime.includes('spreadsheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'XLS';
  if (mime.includes('powerpoint') || mime.includes('presentation') || ['ppt', 'pptx'].includes(ext)) return 'PPT';
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('7z') ||
      ['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) return 'ZIP';
  if (mime.startsWith('text/') || ['txt', 'md', 'json', 'xml', 'yaml', 'yml'].includes(ext)) return 'TXT';
  if (mime.includes('code') || ['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb'].includes(ext)) return 'DEV';

  return 'FILE';
}

watch(
  () => props.document,
  (value) => {
    const normalized = normalizeComposerDocument(value, { editorSurface: true });
    if (documentSignature(normalized) === documentSignature(localDocument.value)) {
      return;
    }
    if (isComposing.value) {
      deferredExternalDocument = normalized;
      return;
    }
    commitDocument(normalized, {
      render: true,
      emitChange: false,
    });
    updateSlashMenu(normalized);
  },
  { deep: true, immediate: true },
);

watch(
  () => props.disabled,
  () => {
    if (props.disabled) {
      pendingSelectionOffset.value = null;
      setKeyboardLift(0);
      clearSlashMenuState();
    } else {
      nextTick(() => {
        renderEditorDom(localDocument.value);
        updateSlashMenu(localDocument.value);
      });
    }
  },
);

onMounted(() => {
  bindCompactViewport();
  bindViewportKeyboard();
  pendingSelectionOffset.value = composerDocumentUnitLength(localDocument.value);
  updateEditorDerivedState(localDocument.value);
  renderEditorDom(localDocument.value);
  updateSlashMenu(localDocument.value);
});

onBeforeUnmount(() => {
  setKeyboardLift(0);
  unbindCompactViewport();
  unbindViewportKeyboard();
});
</script>
