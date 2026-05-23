<template>
  <article
    ref="bubbleRoot"
    v-if="groupHasVisibleBubble"
    :id="'msg-' + (group?.messages[0]?.id || '')"
    class="chat-message-group"
    :class="[`role-${displayGroup.role}`, { 'is-overlay-continuation': isOverlayContinuation }]"
  >
    <div class="chat-message-avatar" aria-hidden="true">
      <AgentAvatarContent
        v-if="displayGroup.role === 'assistant'"
        :avatar="agentAvatar"
        :emoji="agentEmoji"
        :fallback="agentInitial"
        :alt="agentName"
      />
      <template v-else>{{ avatarLabel }}</template>
    </div>

    <div class="chat-message-stack">
      <header v-if="!isOverlayContinuation" class="chat-message-meta">
        <strong>{{ senderLabel }}</strong>
        <span>{{ timeLabel }}</span>
      </header>

      <div v-if="!bubbleBodyReady && canDeferBubbleBody" class="chat-message-bubble-stack">
        <section
          class="chat-message-bubble chat-message-bubble-deferred"
          :class="{ user: displayGroup.role === 'user' }"
        >
          <p class="chat-message-bubble-deferred__summary">{{ deferredBubbleSummary }}</p>
        </section>
      </div>

      <div v-else class="chat-message-bubble-stack">
        <template v-for="(message, messageIndex) in displayGroup.messages" :key="message.id">
          <section
            v-if="shouldRenderBubble(message, messageIndex)"
            class="chat-message-bubble"
            :class="bubbleClass(message, messageIndex)"
            :data-chat-message-id="message.id"
          >
            <details
              v-if="shouldRenderProcessBlocks(messageIndex)"
              class="chat-inline-thinking"
              :open="shouldOpenProcessDetails(message, messageIndex)"
            >
              <summary class="chat-inline-thinking-summary">
                <MoreHorizontal class="chat-inline-thinking-pill" aria-hidden="true" />
                <span>{{ processSummary(messageIndex) }}</span>
                <span v-if="isProcessStreaming(message)" class="chat-inline-thinking-summary-meta">
                  {{ text('正在思考', 'Thinking') }}
                </span>
              </summary>
              <div
                v-if="isProcessStreaming(message)"
                class="chat-inline-thinking-live"
                role="status"
                aria-live="polite"
              >
                <span class="chat-inline-thinking-live-dot" aria-hidden="true"></span>
                <span>{{ text('正在思考，回复会在下方继续生成。', 'Thinking. The reply will continue below.') }}</span>
              </div>
              <div class="chat-inline-thinking-list">
                <section
                  v-for="(block, blockIndex) in displayAt(messageIndex).processBlocks"
                  :key="`${message.id}-process-${block.id}-${blockIndex}`"
                  class="chat-inline-thinking-item"
                >
                  <header class="chat-inline-thinking-head">
                    <strong>{{ processKindLabel(block.kind) }}</strong>
                  </header>
                  <div class="chat-inline-thinking-body">
                    <MarkdownBlock
                      :source="block.text"
                      :session-key="sessionKey"
                      :role="markdownRole"
                      :resources="displayAt(messageIndex).resourceItems"
                      :force-eager-render="forceEagerRender"
                    />
                  </div>
                </section>
              </div>
            </details>

            <div v-if="displayAt(messageIndex).blocks.length" class="chat-message-blocks">
              <template v-for="(block, blockIndex) in displayAt(messageIndex).blocks" :key="`${message.id}-${blockIndex}`">
                <div
                  v-if="block.type === 'markdown'"
                  class="chat-message-bubble-body"
                  @click="handleBubbleBodyClick"
                >
                  <MarkdownBlock
                    :source="block.markdownSource"
                    :session-key="sessionKey"
                    :role="markdownRole"
                    :resources="displayAt(messageIndex).resourceItems"
                    :force-eager-render="forceEagerRender"
                  />
                </div>

                <div
                  v-else-if="block.type === 'paragraph'"
                  class="chat-message-paragraph"
                  :class="{ 'is-user': displayGroup.role === 'user' }"
                >
                  <template v-for="(run, runIndex) in block.runs" :key="`${message.id}-${blockIndex}-run-${runIndex}`">
                    <span
                      v-if="run.type === 'inline-run'"
                      class="chat-message-paragraph-inline-run"
                    >
                      <template v-for="(segment, segmentIndex) in run.segments" :key="`${message.id}-${blockIndex}-${runIndex}-${segmentIndex}`">
                        <span
                          v-if="segment.type === 'text'"
                          class="chat-message-paragraph-text"
                        >{{ segment.text }}</span>

                        <button
                          v-else-if="isImageDisplay(segment.display) && isInlinePreviewable(segment.item)"
                          type="button"
                          class="chat-inline-resource chat-inline-resource-image"
                          :title="inlineResourceTitle(segment.item)"
                          @click="openInlineResourcePreview(segment.item)"
                        >
                          <img
                            class="chat-inline-resource-media"
                            :src="inlinePreviewSrc(segment.item)"
                            :alt="segment.item.alt"
                            loading="lazy"
                            decoding="async"
                            fetchpriority="low"
                          >
                          <span class="chat-inline-resource-caption">{{ inlineDisplayLabel(segment.item) }}</span>
                        </button>

                        <span
                          v-else-if="isImageDisplay(segment.display)"
                          class="chat-inline-resource chat-inline-resource-image missing"
                        >
                          <span class="chat-inline-resource-missing">{{ inlineMissingLabel(segment.item) }}</span>
                        </span>

                        <button
                          v-else-if="isVideoDisplay(segment.display) && isInlinePreviewable(segment.item)"
                          type="button"
                          class="chat-inline-resource chat-inline-resource-video"
                          :title="inlineResourceTitle(segment.item)"
                          @click="openInlineResourcePreview(segment.item)"
                        >
                          <video
                            class="chat-inline-resource-media"
                            :src="inlinePreviewSrc(segment.item)"
                            muted
                            playsinline
                            preload="none"
                          ></video>
                          <span class="chat-inline-resource-caption">{{ inlineDisplayLabel(segment.item) }}</span>
                        </button>

                        <span
                          v-else-if="isVideoDisplay(segment.display)"
                          class="chat-inline-resource chat-inline-resource-video missing"
                        >
                          <span class="chat-inline-resource-missing">{{ inlineMissingLabel(segment.item) }}</span>
                        </span>

                        <a
                          v-else-if="inlineResourceHref(segment.item)"
                          class="chat-inline-chip"
                          :class="[segment.item.kind, { missing: isInlineResourceMissing(segment.item) }]"
                          :href="inlineResourceHref(segment.item)"
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <span class="chat-inline-chip-badge">{{ inlineChipBadge(segment.item) }}</span>
                          <span class="chat-inline-chip-label">{{ inlineDisplayLabel(segment.item) }}</span>
                        </a>

                        <span
                          v-else
                          class="chat-inline-chip missing"
                          :class="segment.item.kind"
                        >
                          <span class="chat-inline-chip-badge">{{ inlineChipBadge(segment.item) }}</span>
                          <span class="chat-inline-chip-label">{{ inlineMissingLabel(segment.item) }}</span>
                        </span>
                      </template>
                    </span>

                    <div
                      v-else
                      class="chat-message-paragraph-break-run"
                      :class="breakRunClass(run.segment)"
                    >
                      <button
                        v-if="isImageDisplay(run.segment.display) && isInlinePreviewable(run.segment.item)"
                        type="button"
                        class="chat-inline-resource chat-inline-resource-image chat-break-resource"
                        :title="inlineResourceTitle(run.segment.item)"
                        @click="openInlineResourcePreview(run.segment.item)"
                      >
                        <img
                          class="chat-inline-resource-media"
                          :src="inlinePreviewSrc(run.segment.item)"
                          :alt="run.segment.item.alt"
                          loading="lazy"
                          decoding="async"
                          fetchpriority="low"
                        >
                        <span class="chat-inline-resource-caption">{{ inlineDisplayLabel(run.segment.item) }}</span>
                      </button>

                      <span
                        v-else-if="isImageDisplay(run.segment.display)"
                        class="chat-inline-resource chat-inline-resource-image chat-break-resource missing"
                      >
                        <span class="chat-inline-resource-missing">{{ inlineMissingLabel(run.segment.item) }}</span>
                      </span>

                      <button
                        v-else-if="isVideoDisplay(run.segment.display) && isInlinePreviewable(run.segment.item)"
                        type="button"
                        class="chat-inline-resource chat-inline-resource-video chat-break-resource"
                        :title="inlineResourceTitle(run.segment.item)"
                        @click="openInlineResourcePreview(run.segment.item)"
                      >
                        <video
                          class="chat-inline-resource-media"
                          :src="inlinePreviewSrc(run.segment.item)"
                          muted
                          playsinline
                          preload="none"
                        ></video>
                        <span class="chat-inline-resource-caption">{{ inlineDisplayLabel(run.segment.item) }}</span>
                      </button>

                      <span
                        v-else-if="isVideoDisplay(run.segment.display)"
                        class="chat-inline-resource chat-inline-resource-video chat-break-resource missing"
                      >
                        <span class="chat-inline-resource-missing">{{ inlineMissingLabel(run.segment.item) }}</span>
                      </span>

                      <a
                        v-else-if="inlineResourceHref(run.segment.item)"
                        class="chat-inline-chip chat-break-chip"
                        :class="[run.segment.item.kind, { missing: isInlineResourceMissing(run.segment.item) }]"
                        :href="inlineResourceHref(run.segment.item)"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        <span class="chat-inline-chip-badge">{{ inlineChipBadge(run.segment.item) }}</span>
                        <span class="chat-inline-chip-label">{{ inlineDisplayLabel(run.segment.item) }}</span>
                      </a>

                      <span
                        v-else
                        class="chat-inline-chip chat-break-chip missing"
                        :class="run.segment.item.kind"
                      >
                        <span class="chat-inline-chip-badge">{{ inlineChipBadge(run.segment.item) }}</span>
                        <span class="chat-inline-chip-label">{{ inlineMissingLabel(run.segment.item) }}</span>
                      </span>
                    </div>
                  </template>
                </div>

                <div
                  v-else
                  class="chat-message-media-list"
                >
                  <MessageResourceList
                    :items="[block.item]"
                    :is-user="displayGroup.role === 'user'"
                    @preview="openResourcePreview"
                  />
                </div>
              </template>
            </div>

            <details
              v-if="shouldRenderToolHints(message, messageIndex)"
              class="chat-inline-process"
              :open="message.source === 'stream'"
            >
              <summary class="chat-inline-process-summary">
                <Braces class="chat-inline-process-pill" aria-hidden="true" />
                <span>{{ toolSummary() }}</span>
                <span class="chat-inline-process-summary-meta">
                  <span v-if="toolCounts().running">{{ text('进行中', 'Running') }} {{ toolCounts().running }}</span>
                  <span v-if="toolCounts().completed">{{ text('完成', 'Done') }} {{ toolCounts().completed }}</span>
                  <span v-if="toolCounts().error">{{ text('失败', 'Error') }} {{ toolCounts().error }}</span>
                </span>
              </summary>

              <div class="chat-inline-process-list">
                <details
                  v-if="groupedProcessBlocks.length"
                  class="chat-inline-process-thinking"
                  :open="shouldOpenGroupedProcessDetails(message)"
                >
                  <summary class="chat-inline-process-thinking__head">
                    <strong>{{ text('思考 / 判定', 'Thinking / reasoning') }}</strong>
                    <span class="chat-inline-process-thinking__meta">{{ groupedProcessSummary() }}</span>
                  </summary>
                  <div
                    v-if="isProcessStreaming(message)"
                    class="chat-inline-process-thinking__live"
                    role="status"
                    aria-live="polite"
                  >
                    <span class="chat-inline-thinking-live-dot" aria-hidden="true"></span>
                    <span>{{ text('正在推理，工具步骤会继续更新。', 'Reasoning. Tool steps will keep updating.') }}</span>
                  </div>
                  <div class="chat-inline-process-thinking__list">
                    <section
                      v-for="(block, blockIndex) in groupedProcessBlocks"
                      :key="`${message.id}-tool-process-${block.id}-${blockIndex}`"
                      class="chat-inline-process-thinking__item"
                    >
                      <header class="chat-inline-process-thinking__item-head">
                        <strong>{{ processKindLabel(block.kind) }}</strong>
                      </header>
                      <div class="chat-inline-process-thinking__item-body">
                        <MarkdownBlock
                          :source="block.text"
                          :session-key="sessionKey"
                          :role="markdownRole"
                          :force-eager-render="forceEagerRender"
                        />
                      </div>
                    </section>
                  </div>
                </details>

                <details
                  v-for="(tool, toolIndex) in groupedToolHints"
                  :key="tool.id"
                  class="chat-inline-process-item"
                  :class="`status-${tool.status}`"
                  :open="shouldOpenToolDetails(tool, toolIndex)"
                >
                  <summary class="chat-inline-process-head">
                    <div class="chat-inline-process-head-main">
                      <div class="chat-inline-process-head-title">
                        <span class="chat-inline-process-step">{{ toolIndex + 1 }}</span>
                        <strong>{{ tool.name }}</strong>
                      </div>
                      <span v-if="tool.summary" class="chat-inline-process-head-summary">{{ tool.summary }}</span>
                    </div>
                    <span class="chat-inline-process-head-state" :class="`status-${tool.status}`">{{ toolStatusLabel(tool.status) }}</span>
                  </summary>
                  <div
                    v-if="tool.status === 'running'"
                    class="chat-inline-process-live"
                    role="status"
                    aria-live="polite"
                  >
                    <span class="chat-inline-process-live-dot" aria-hidden="true"></span>
                    <span>{{ text('正在执行，工具输出会实时更新。', 'Executing. Tool output updates live.') }}</span>
                  </div>
                  <div v-if="tool.argsPreview || tool.resultPreview || shouldRenderToolOutputPlaceholder(tool)" class="chat-inline-process-detail">
                    <section v-if="tool.argsPreview" class="chat-inline-process-block">
                      <div class="chat-inline-process-block-head">
                        <span>{{ text('工具输入', 'Tool input') }}</span>
                        <button
                          type="button"
                          class="chat-inline-process-copy"
                          :data-copied="toolCopyState[toolCopyKey(tool, 'input')] === 'copied' ? '1' : null"
                          :data-error="toolCopyState[toolCopyKey(tool, 'input')] === 'error' ? '1' : null"
                          :aria-label="toolCopyTitle(tool, 'input')"
                          :title="toolCopyTitle(tool, 'input')"
                          @click="copyToolPreview(tool, 'input')"
                        >
                          <span class="chat-inline-process-copy__idle">{{ text('复制', 'Copy') }}</span>
                          <span class="chat-inline-process-copy__done">{{ text('已复制', 'Copied') }}</span>
                          <span class="chat-inline-process-copy__error">{{ text('失败', 'Failed') }}</span>
                        </button>
                      </div>
                      <pre>{{ tool.argsPreview }}</pre>
                    </section>
                    <section v-if="tool.resultPreview" class="chat-inline-process-block">
                      <div class="chat-inline-process-block-head">
                        <span>{{ toolOutputLabel(tool.status) }}</span>
                        <button
                          type="button"
                          class="chat-inline-process-copy"
                          :data-copied="toolCopyState[toolCopyKey(tool, 'output')] === 'copied' ? '1' : null"
                          :data-error="toolCopyState[toolCopyKey(tool, 'output')] === 'error' ? '1' : null"
                          :aria-label="toolCopyTitle(tool, 'output')"
                          :title="toolCopyTitle(tool, 'output')"
                          @click="copyToolPreview(tool, 'output')"
                        >
                          <span class="chat-inline-process-copy__idle">{{ text('复制', 'Copy') }}</span>
                          <span class="chat-inline-process-copy__done">{{ text('已复制', 'Copied') }}</span>
                          <span class="chat-inline-process-copy__error">{{ text('失败', 'Failed') }}</span>
                        </button>
                      </div>
                      <pre>{{ tool.resultPreview }}</pre>
                    </section>
                    <section v-else-if="shouldRenderToolOutputPlaceholder(tool)" class="chat-inline-process-block chat-inline-process-block-placeholder">
                      <span>{{ text('工具输出', 'Tool output') }}</span>
                      <p>{{ text('等待工具输出…', 'Waiting for tool output...') }}</p>
                    </section>
                  </div>
                  <div v-if="tool.artifacts?.length" class="chat-inline-process-artifacts">
                    <span class="chat-inline-process-artifacts__label">{{ text('资源', 'Artifacts') }}</span>
                    <MessageResourceList
                      :items="tool.artifacts"
                      :is-user="false"
                      @preview="openResourcePreview"
                    />
                  </div>
                </details>
              </div>
            </details>

            <footer
              v-if="shouldRenderFooter(message, messageIndex)"
              class="chat-message-bubble-foot"
              :class="{ 'with-copy': canCopyMarkdown(messageIndex) }"
            >
              <span v-if="message.source === 'stream' && activeRunId === message.runId">{{ text('生成中', 'Streaming') }}</span>
              <span v-if="message.aborted">{{ text('已中止', 'Aborted') }}</span>
              <span v-if="message.omitted">{{ text('历史省略', 'Omitted') }}</span>
              <span v-else-if="message.truncated">{{ text('已截断', 'Truncated') }}</span>
              <button
                v-if="canCopyMarkdown(messageIndex)"
                type="button"
                class="chat-bubble-copy"
                :data-copied="bubbleCopyState[message.id] === 'copied' ? '1' : null"
                :data-error="bubbleCopyState[message.id] === 'error' ? '1' : null"
                :title="bubbleCopyTitle(message.id, messageIndex)"
                :aria-label="bubbleCopyTitle(message.id, messageIndex)"
                @click="copyBubbleMarkdown(messageIndex)"
              >
                <span class="chat-bubble-copy__idle">{{ bubbleCopyIdleLabel(messageIndex) }}</span>
                <span class="chat-bubble-copy__done">{{ text('已复制', 'Copied') }}</span>
                <span class="chat-bubble-copy__error">{{ text('复制失败', 'Copy failed') }}</span>
              </button>
            </footer>
          </section>
        </template>
      </div>
    </div>
  </article>

  <DialogRoot :open="Boolean(mediaPreview)" @update:open="handleMediaPreviewOpenChange">
    <DialogPortal>
      <DialogOverlay class="chat-image-preview-mask" />
      <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
        <div class="chat-image-preview-dialog" :aria-label="mediaPreview?.alt || text('资源预览', 'Media preview')">
          <DialogClose as-child>
            <button
              type="button"
              class="chat-image-preview-close"
              :aria-label="text('关闭资源预览', 'Close media preview')"
            >
              <X class="drawer-close-icon" aria-hidden="true" />
            </button>
          </DialogClose>

          <img
            v-if="mediaPreview?.kind === 'image'"
            class="chat-image-preview-image"
            :src="mediaPreview.src"
            :alt="mediaPreview.alt"
            decoding="async"
          >
          <video
            v-else-if="mediaPreview?.kind === 'video'"
            class="chat-image-preview-video"
            :src="mediaPreview.src"
            controls
            autoplay
            playsinline
            preload="metadata"
          ></video>

          <div v-if="mediaPreview" class="chat-image-preview-meta">
            <span>{{ mediaPreview.alt }}</span>
            <a :href="mediaPreview.src" target="_blank" rel="noreferrer noopener">
              {{ text('新标签打开', 'Open in new tab') }}
            </a>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { Braces, MoreHorizontal, X } from '@lucide/vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { useLocalePreference } from '../../shared/locale';
import type { ChatInlineResourceDisplay, ChatMessageItem, ChatProcessBlock, ChatRunOverlay, ChatToolStatus } from '../../../../../types/chat';
import type { ChatMessageGroup } from './message-groups';
import type { ChatDisplayMessage, ChatDisplayResourceItem } from './display-adapter';
import MarkdownBlock from './MarkdownBlock.vue';
import MessageResourceList from './MessageResourceList.vue';
import AgentAvatarContent from '../../shared/components/AgentAvatarContent.vue';
import { COPIED_FOR_MS, ERROR_FOR_MS, copyTextToClipboard } from './markdown-copy';
import { joinApiPath } from '../../shared/api';
import type { RenderingRole } from './inline-preview-preferences';
import { deriveChatDisplayMessage } from './display-adapter';
import { applyChatProcessVisibility } from '../../../../../lib/chat-process-visibility';
import { filterMainChatToolItems } from '../../../../../lib/chat-tool-visibility';
import { isStudioMarkdownCompiledUrl, stripStudioMarkdownMediaMeta } from '../../../../../lib/studio-markdown-media';

const props = defineProps<{
  group: ChatMessageGroup | null;
  overlay?: ChatRunOverlay | null;
  overlayAnchorMessageIds?: string[];
  overlayProcessBlocks?: ChatProcessBlock[];
  coveredToolCallIds?: string[];
  showToolPreviews: boolean;
  showThinkingBlocks: boolean;
  agentName: string;
  agentAvatar: string;
  agentEmoji: string;
  agentInitial: string;
  activeRunId: string | null;
  activeStreamingMessageId: string | null;
  sessionKey: string | null;
  forceEagerRender: boolean;
}>();

const { text } = useLocalePreference();

const EMPTY_DISPLAY: ChatDisplayMessage = {
  blocks: [],
  markdownSource: '',
  copySource: '',
  plainTextFallback: '',
  renderMode: 'empty',
  toolHints: [],
  processBlocks: [],
  resourceItems: [],
  hasStructuredBlocks: false,
};
type ChatDisplayToolHint = ChatDisplayMessage['toolHints'][number];
type ToolPreviewKind = 'input' | 'output';

const messageDisplayCache = new WeakMap<ChatMessageItem, ChatDisplayMessage>();
const bubbleCopyState = reactive<Record<string, 'copied' | 'error' | undefined>>({});
const bubbleCopyTimers = new Map<string, number>();
const toolCopyState = reactive<Record<string, 'copied' | 'error' | undefined>>({});
const toolCopyTimers = new Map<string, number>();
const mediaPreview = ref<{ src: string; alt: string; kind: 'image' | 'video' } | null>(null);
const bubbleRoot = ref<HTMLElement | null>(null);
const bubbleBodyReady = ref(false);
const bubbleBodyReadyPending = ref(false);
let previousBodyOverflow = '';
let bodyOverflowLocked = false;
let bubbleVisibilityObserver: IntersectionObserver | null = null;
let bubbleBodyReadyTimer: number | null = null;
let bubbleBodyReadyIdleHandle: number | null = null;

const MESSAGE_BUBBLE_DEFER_MIN_CHARS = 480;
const MESSAGE_BUBBLE_DEFER_ROOT_MARGIN = '1200px 0px';
const MESSAGE_BUBBLE_DEFER_IDLE_TIMEOUT_MS = 220;

function clipBubblePreview(value: string, limit = 220): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

function buildOverlayGroup(overlay: ChatRunOverlay | null | undefined): ChatMessageGroup {
  const normalizedOverlay = overlay || {
    runId: 'overlay',
    startedAt: null,
    updatedAt: null,
    lifecycle: 'running',
    previewText: '',
    toolCalls: [],
    finalMessageId: null,
    finalCreatedAt: null,
    firstAssistantSeenAt: null,
    firstToolStartedAt: null,
    sequence: 0,
  };
  return {
    id: `run-overlay:${normalizedOverlay.runId}`,
    role: 'assistant',
    runId: normalizedOverlay.runId,
    messages: [
      {
        id: `run-overlay-message:${normalizedOverlay.runId}`,
        role: 'assistant',
        text: props.overlayAnchorMessageIds?.length ? '' : (normalizedOverlay.previewText || ''),
        createdAt: normalizedOverlay.updatedAt || normalizedOverlay.startedAt || null,
        source: normalizedOverlay.lifecycle === 'completed' ? 'history' : 'stream',
        runId: normalizedOverlay.runId,
        truncated: false,
        omitted: false,
        aborted: normalizedOverlay.lifecycle === 'aborted',
        stopReason: null,
        toolCalls: normalizedOverlay.toolCalls,
        processBlocks: props.overlayProcessBlocks?.length ? props.overlayProcessBlocks.map((item) => ({ ...item })) : undefined,
      },
    ],
  };
}

const displayGroup = computed<ChatMessageGroup>(() => props.group || buildOverlayGroup(props.overlay));
const isOverlayContinuation = computed(() => Boolean(props.overlay && props.overlayAnchorMessageIds?.length));
const coveredToolCallIdSet = computed(() => new Set((props.coveredToolCallIds || []).filter(Boolean)));
const shouldForceBubbleBody = computed(() => {
  if (props.forceEagerRender) {
    return true;
  }
  if (props.overlay && (props.overlay.lifecycle === 'running' || props.overlay.lifecycle === 'queued')) {
    return true;
  }
  return displayGroup.value.messages.some((message) => (
    message.source === 'stream'
    || (props.activeRunId && message.runId === props.activeRunId)
  ));
});

const canDeferBubbleBody = computed(() => {
  if (shouldForceBubbleBody.value) {
    return false;
  }
  if (props.overlay) {
    return true;
  }
  return displayGroup.value.messages.some((message) => {
    const text = String(message.text || '');
    return text.length >= MESSAGE_BUBBLE_DEFER_MIN_CHARS
      || /```/.test(text)
      || /<(?:table|svg|iframe|pre|code|details|summary|article|section|div)\b/i.test(text)
      || Boolean(message.toolCalls?.length || message.processBlocks?.length || message.resources?.length || message.media?.length);
  });
});

const markdownRole = computed<RenderingRole | null>(() => {
  const role = displayGroup.value.role;
  return role === 'user' || role === 'assistant' ? role : null;
});

const senderLabel = computed(() => {
  if (displayGroup.value.role === 'assistant') return props.agentName;
  if (displayGroup.value.role === 'user') return text('你', 'You');
  if (displayGroup.value.role === 'system') return text('系统', 'System');
  if (displayGroup.value.role === 'tool') return text('工具', 'Tool');
  return text('消息', 'Message');
});

const avatarLabel = computed(() => {
  if (displayGroup.value.role === 'assistant') return props.agentInitial;
  if (displayGroup.value.role === 'user') return '你';
  if (displayGroup.value.role === 'tool') return 'T';
  if (displayGroup.value.role === 'system') return 'S';
  return '·';
});

const timeLabel = computed(() => {
  const last = displayGroup.value.messages[displayGroup.value.messages.length - 1]?.createdAt || null;
  if (!last) return text('刚刚', 'Just now');
  try {
    return new Date(last).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return last;
  }
});

function toolHintStatusRank(status: string | null | undefined): number {
  if (status === 'error') return 3;
  if (status === 'completed') return 2;
  return 1;
}

function mergeToolHint(list: ChatDisplayMessage['toolHints'], hint: ChatDisplayMessage['toolHints'][number]): void {
  const sameIdIndex = list.findIndex((item) => item.id === hint.id);
  if (sameIdIndex >= 0) {
    const current = list[sameIdIndex];
    const mergedStatus = toolHintStatusRank(hint.status) >= toolHintStatusRank(current.status)
      ? hint.status
      : current.status;
    list[sameIdIndex] = {
      ...current,
      ...hint,
      status: mergedStatus,
      summary: hint.summary || current.summary,
      argsPreview: current.argsPreview || hint.argsPreview,
      resultPreview: hint.resultPreview || current.resultPreview,
      artifacts: hint.artifacts?.length ? hint.artifacts : current.artifacts,
    };
    return;
  }
  list.push(hint);
}

function displayFor(message: ChatMessageGroup['messages'][number]): ChatDisplayMessage {
  const cached = messageDisplayCache.get(message);
  const base = cached || (() => {
    const next = deriveChatDisplayMessage(message);
    messageDisplayCache.set(message, next);
    return next;
  })();
  const filteredToolHints = props.overlay
    ? base.toolHints
    : base.toolHints.filter((hint) => !coveredToolCallIdSet.value.has(hint.id));
  const visibleProcess = applyChatProcessVisibility({
    toolHints: filterMainChatToolItems(filteredToolHints),
    processBlocks: base.processBlocks,
    visibility: {
      showToolPreviews: props.showToolPreviews,
      showThinkingBlocks: props.showThinkingBlocks,
    },
  });
  return {
    ...base,
    toolHints: visibleProcess.toolHints,
    processBlocks: visibleProcess.processBlocks,
  };
}

const groupDisplays = computed(() => (
  bubbleBodyReady.value || !canDeferBubbleBody.value
    ? displayGroup.value.messages.map((message) => displayFor(message))
    : []
));

const groupedToolHints = computed(() => {
  const merged: ChatDisplayMessage['toolHints'] = [];
  for (const display of groupDisplays.value) {
    for (const hint of display.toolHints) {
      mergeToolHint(merged, hint);
    }
  }
  return merged;
});

const groupedProcessBlocks = computed(() => {
  const merged: ChatProcessBlock[] = [];
  const seen = new Set<string>();
  for (const display of groupDisplays.value) {
    for (const block of display.processBlocks) {
      const key = `${block.kind}:${block.id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      merged.push({ ...block });
    }
  }
  return merged;
});

const deferredBubbleSummary = computed(() => {
  if (props.overlay) {
    const preview = clipBubblePreview(props.overlay.previewText || '', 200);
    if (preview) {
      return preview;
    }
    if (props.overlay.toolCalls.length) {
      return text(`工具过程 ${props.overlay.toolCalls.length} 项`, `${props.overlay.toolCalls.length} tool updates`);
    }
    return text('离屏运行摘要已折叠，靠近视口时会自动展开。', 'Offscreen run details are collapsed and expand near the viewport.');
  }
  const rawText = displayGroup.value.messages
    .map((message) => clipBubblePreview(String(message.text || ''), 120))
    .filter(Boolean)
    .join(' · ');
  if (rawText) {
    return rawText;
  }
  const resourceCount = displayGroup.value.messages.reduce((count, message) => count + (message.resources?.length || 0) + (message.media?.length || 0), 0);
  if (resourceCount > 0) {
    return text(`包含 ${resourceCount} 个资源项`, `${resourceCount} attached resources`);
  }
  if (displayGroup.value.messages.some((message) => message.toolCalls?.length || message.processBlocks?.length)) {
    return text('包含工具过程与思考块，靠近视口时再展开。', 'Contains tool/process details and expands near the viewport.');
  }
  return text('离屏消息已折叠，靠近视口时会自动展开。', 'Offscreen messages are collapsed and expand near the viewport.');
});

function displayAt(index: number): ChatDisplayMessage {
  return groupDisplays.value[index] || EMPTY_DISPLAY;
}

const groupHasVisibleBubble = computed(() => (
  (!bubbleBodyReady.value && canDeferBubbleBody.value)
  || displayGroup.value.messages.some((message, index) => shouldRenderBubble(message, index))
));

function shouldRenderProcessBlocks(index: number): boolean {
  if (displayAt(index).processBlocks.length === 0) {
    return false;
  }
  if (toolCarrierIndex() === index && groupedToolHints.value.length > 0) {
    return false;
  }
  return true;
}

function toolCarrierIndex(): number {
  for (let index = displayGroup.value.messages.length - 1; index >= 0; index -= 1) {
    if (displayAt(index).toolHints.length) return index;
  }
  return -1;
}

function shouldRenderToolHints(message: ChatMessageGroup['messages'][number], index: number): boolean {
  if (!props.showToolPreviews) return false;
  if (displayGroup.value.role === 'user') return false;
  if (!groupedToolHints.value.length) return false;
  if (isOverlayContinuation.value) {
    return toolCarrierIndex() === index;
  }
  return toolCarrierIndex() === index;
}

function toolSummary(): string {
  const hints = groupedToolHints.value;
  const count = hints.length;
  const names = [...new Set(hints.map((tool) => tool.name))];
  if (!names.length) {
    return count === 1 ? text('工具调用', 'Tool call') : text(`${count} 个工具调用`, `${count} tool calls`);
  }
  const compactNames = names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  if (count === 1) return text(`调用 ${compactNames}`, `Calling ${compactNames}`);
  return text(`调用 ${count} 个工具 · ${compactNames}`, `${count} tool calls · ${compactNames}`);
}

function toolCounts(): { running: number; completed: number; error: number } {
  return groupedToolHints.value.reduce(
    (acc, tool) => {
      if (tool.status === 'running') acc.running += 1;
      else if (tool.status === 'completed') acc.completed += 1;
      else acc.error += 1;
      return acc;
    },
    { running: 0, completed: 0, error: 0 },
  );
}

function processSummary(index: number): string {
  const count = displayAt(index).processBlocks.length;
  if (count <= 1) {
    return text('思考块', 'Thinking block');
  }
  return text(`${count} 个思考块`, `${count} thinking blocks`);
}

function isProcessStreaming(message: ChatMessageGroup['messages'][number]): boolean {
  return message.source === 'stream' || Boolean(props.activeRunId && message.runId === props.activeRunId);
}

function shouldOpenProcessDetails(message: ChatMessageGroup['messages'][number], index: number): boolean {
  if (isProcessStreaming(message)) {
    return true;
  }
  const totalLength = displayAt(index).processBlocks.reduce((sum, block) => sum + block.text.length, 0);
  return totalLength > 0 && totalLength <= 360;
}

function shouldOpenGroupedProcessDetails(message: ChatMessageGroup['messages'][number]): boolean {
  if (isProcessStreaming(message)) {
    return true;
  }
  const totalLength = groupedProcessBlocks.value.reduce((sum, block) => sum + block.text.length, 0);
  return totalLength > 0 && totalLength <= 360;
}

function groupedProcessSummary(): string {
  const count = groupedProcessBlocks.value.length;
  if (count <= 1) {
    return text('1 条', '1 item');
  }
  return text(`${count} 条`, `${count} items`);
}

function processKindLabel(kind: 'thinking' | 'reasoning'): string {
  return kind === 'reasoning'
    ? text('推理', 'Reasoning')
    : text('思考', 'Thinking');
}

function canCopyMarkdown(index: number): boolean {
  return Boolean(displayAt(index).copySource);
}

function clearBubbleCopyTimer(messageId: string): void {
  const timer = bubbleCopyTimers.get(messageId);
  if (timer != null) {
    window.clearTimeout(timer);
    bubbleCopyTimers.delete(messageId);
  }
}

function setBubbleCopyState(messageId: string, state: 'copied' | 'error'): void {
  bubbleCopyState[messageId] = state;
  clearBubbleCopyTimer(messageId);
  const duration = state === 'copied' ? COPIED_FOR_MS : ERROR_FOR_MS;
  const timer = window.setTimeout(() => {
    delete bubbleCopyState[messageId];
    bubbleCopyTimers.delete(messageId);
  }, duration);
  bubbleCopyTimers.set(messageId, timer);
}

async function copyBubbleMarkdown(index: number): Promise<void> {
  const message = displayGroup.value.messages[index];
  const source = displayAt(index).copySource;
  if (!message || !source) {
    return;
  }
  const copied = await copyTextToClipboard(source);
  setBubbleCopyState(message.id, copied ? 'copied' : 'error');
}

function bubbleCopyIdleLabel(index: number): string {
  return displayAt(index).renderMode === 'markdown'
    ? text('复制 Markdown', 'Copy markdown')
    : text('复制内容', 'Copy content');
}

function bubbleCopyTitle(messageId: string, index: number): string {
  const state = bubbleCopyState[messageId];
  if (state === 'copied') return text('已复制', 'Copied');
  if (state === 'error') return text('复制失败', 'Copy failed');
  return displayAt(index).renderMode === 'markdown'
    ? text('复制 Markdown 原文', 'Copy markdown source')
    : text('复制消息内容', 'Copy message content');
}

function toolCopyKey(tool: ChatDisplayToolHint, kind: ToolPreviewKind): string {
  return `${tool.id}:${kind}`;
}

function toolPreviewSource(tool: ChatDisplayToolHint, kind: ToolPreviewKind): string {
  return kind === 'input'
    ? String(tool.argsPreview || '')
    : String(tool.resultPreview || '');
}

function clearToolCopyTimer(key: string): void {
  const timer = toolCopyTimers.get(key);
  if (timer != null) {
    window.clearTimeout(timer);
    toolCopyTimers.delete(key);
  }
}

function setToolCopyState(key: string, state: 'copied' | 'error'): void {
  toolCopyState[key] = state;
  clearToolCopyTimer(key);
  const duration = state === 'copied' ? COPIED_FOR_MS : ERROR_FOR_MS;
  const timer = window.setTimeout(() => {
    delete toolCopyState[key];
    toolCopyTimers.delete(key);
  }, duration);
  toolCopyTimers.set(key, timer);
}

async function copyToolPreview(tool: ChatDisplayToolHint, kind: ToolPreviewKind): Promise<void> {
  const source = toolPreviewSource(tool, kind);
  if (!source) {
    return;
  }
  const key = toolCopyKey(tool, kind);
  const copied = await copyTextToClipboard(source);
  setToolCopyState(key, copied ? 'copied' : 'error');
}

function toolCopyTitle(tool: ChatDisplayToolHint, kind: ToolPreviewKind): string {
  const state = toolCopyState[toolCopyKey(tool, kind)];
  if (state === 'copied') return text('已复制', 'Copied');
  if (state === 'error') return text('复制失败', 'Copy failed');
  return kind === 'input'
    ? text('复制工具输入', 'Copy tool input')
    : text('复制工具输出', 'Copy tool output');
}

function isInlineResourceMissing(item: ChatDisplayResourceItem): boolean {
  return item.status === 'missing' || (!item.url && !item.downloadUrl);
}

function isInlinePreviewable(item: ChatDisplayResourceItem): boolean {
  return !isInlineResourceMissing(item) && (item.kind === 'image' || item.kind === 'video') && Boolean(item.url);
}

function isImageDisplay(display: ChatInlineResourceDisplay): boolean {
  return display === 'inline-image' || display === 'break-image';
}

function isVideoDisplay(display: ChatInlineResourceDisplay): boolean {
  return display === 'inline-video' || display === 'break-video';
}

function inlineResourceHref(item: ChatDisplayResourceItem): string {
  return joinApiPath(item.downloadUrl || item.url || '');
}

function inlinePreviewSrc(item: ChatDisplayResourceItem): string {
  return joinApiPath(item.url || '');
}

function inlineDisplayLabel(item: ChatDisplayResourceItem): string {
  const label = item.fileName || item.relativePath || item.originalPath || item.id;
  if (displayGroup.value.role !== 'user') {
    return label;
  }
  return `@${label.replace(/^@+/, '')}`;
}

function inlineMissingLabel(item: ChatDisplayResourceItem): string {
  const label = item.relativePath || item.originalPath || item.fileName;
  if (!label) {
    return '';
  }
  if (displayGroup.value.role !== 'user') {
    return label;
  }
  return `@${label.replace(/^@+/, '')}`;
}

function inlineChipBadge(item: ChatDisplayResourceItem): string {
  if (item.kind === 'image') return text('图片', 'Image');
  if (item.kind === 'video') return text('视频', 'Video');
  return text('文件', 'File');
}

function inlineResourceTitle(item: ChatDisplayResourceItem): string {
  if (item.kind === 'image') {
    return text(`预览图片 ${inlineDisplayLabel(item)}`, `Preview image ${inlineDisplayLabel(item)}`);
  }
  return text(`预览视频 ${inlineDisplayLabel(item)}`, `Preview video ${inlineDisplayLabel(item)}`);
}

function openInlineResourcePreview(item: ChatDisplayResourceItem): void {
  if (!isInlinePreviewable(item)) {
    return;
  }
  openResourcePreview({
    src: inlinePreviewSrc(item),
    alt: item.alt,
    kind: item.kind === 'image' ? 'image' : 'video',
  });
}

function breakRunClass(segment: { display: ChatInlineResourceDisplay; item: ChatDisplayResourceItem }): Array<string> {
  return [
    segment.display,
    `kind-${segment.item.kind}`,
  ];
}

function handleBubbleBodyClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const studioPreviewTrigger = target.closest<HTMLElement>('[data-studio-preview-src][data-studio-preview-kind]');
  if (studioPreviewTrigger) {
    const src = studioPreviewTrigger.dataset.studioPreviewSrc?.trim() || '';
    const kind = studioPreviewTrigger.dataset.studioPreviewKind === 'video' ? 'video' : 'image';
    if (!src) {
      return;
    }
    event.preventDefault();
    openResourcePreview({
      src,
      alt: studioPreviewTrigger.dataset.studioPreviewAlt?.trim() || text('资源预览', 'Media preview'),
      kind,
    });
    return;
  }

  const image = target.closest('img');
  if (image instanceof HTMLImageElement) {
    const compiledMeta = stripStudioMarkdownMediaMeta(image.currentSrc || image.src || '');
    if (image.classList.contains('markdown-inline-image') || isStudioMarkdownCompiledUrl(compiledMeta.url)) {
      event.preventDefault();
      mediaPreview.value = {
        src: compiledMeta.url || image.currentSrc || image.src,
        alt: image.alt?.trim() || compiledMeta.fileName || text('图片预览', 'Image preview'),
        kind: 'image',
      };
      return;
    }
  }

  const video = target.closest('video');
  if (video instanceof HTMLVideoElement) {
    const compiledMeta = stripStudioMarkdownMediaMeta(video.currentSrc || video.src || '');
    if (isStudioMarkdownCompiledUrl(compiledMeta.url)) {
      event.preventDefault();
      mediaPreview.value = {
        src: compiledMeta.url || video.currentSrc || video.src,
        alt: video.getAttribute('data-studio-preview-alt')?.trim() || compiledMeta.fileName || text('视频预览', 'Video preview'),
        kind: 'video',
      };
      return;
    }
  }

  if (!(image instanceof HTMLImageElement)) {
    return;
  }
}

function openResourcePreview(payload: { src: string; alt: string; kind: 'image' | 'video' }): void {
  mediaPreview.value = payload;
}

function closeMediaPreview(): void {
  mediaPreview.value = null;
}

function handleMediaPreviewOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    closeMediaPreview();
  }
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !mediaPreview.value) {
    return;
  }

  event.preventDefault();
  closeMediaPreview();
}

function shouldRenderFooter(message: ChatMessageGroup['messages'][number], index: number): boolean {
  return Boolean(
    canCopyMarkdown(index)
    || (message.source === 'stream' && props.activeRunId === message.runId)
    || message.aborted
    || message.omitted
    || message.truncated,
  );
}

function shouldRenderBubble(message: ChatMessageGroup['messages'][number], index: number): boolean {
  if (!bubbleBodyReady.value && canDeferBubbleBody.value) {
    return false;
  }
  if (shouldRenderToolHints(message, index)) return true;
  const display = displayAt(index);
  if (display.blocks.length) return true;
  if (display.processBlocks.length) return true;
  if (message.source === 'stream' && props.activeRunId === message.runId) return true;
  if (message.aborted || message.omitted || message.truncated) return true;
  return false;
}

function disconnectBubbleVisibilityObserver(): void {
  bubbleVisibilityObserver?.disconnect();
  bubbleVisibilityObserver = null;
}

function clearScheduledBubbleBodyReady(): void {
  if (bubbleBodyReadyTimer != null) {
    window.clearTimeout(bubbleBodyReadyTimer);
    bubbleBodyReadyTimer = null;
  }
  if (
    bubbleBodyReadyIdleHandle != null
    && typeof window !== 'undefined'
    && 'cancelIdleCallback' in window
  ) {
    window.cancelIdleCallback(bubbleBodyReadyIdleHandle);
    bubbleBodyReadyIdleHandle = null;
  }
  bubbleBodyReadyPending.value = false;
}

function ensureBubbleBodyReady(): void {
  if (bubbleBodyReady.value) {
    return;
  }
  clearScheduledBubbleBodyReady();
  bubbleBodyReady.value = true;
  disconnectBubbleVisibilityObserver();
}

function scheduleBubbleBodyReady(): void {
  if (bubbleBodyReady.value || bubbleBodyReadyPending.value) {
    return;
  }
  bubbleBodyReadyPending.value = true;
  const run = () => {
    bubbleBodyReadyTimer = null;
    bubbleBodyReadyIdleHandle = null;
    bubbleBodyReadyPending.value = false;
    ensureBubbleBodyReady();
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    bubbleBodyReadyIdleHandle = window.requestIdleCallback(() => {
      run();
    }, { timeout: MESSAGE_BUBBLE_DEFER_IDLE_TIMEOUT_MS });
    return;
  }
  bubbleBodyReadyTimer = window.setTimeout(run, 80);
}

function bindBubbleVisibilityObserver(): void {
  if (
    bubbleBodyReady.value
    || !canDeferBubbleBody.value
    || shouldForceBubbleBody.value
    || typeof IntersectionObserver === 'undefined'
  ) {
    bubbleBodyReady.value = true;
    return;
  }
  disconnectBubbleVisibilityObserver();
  const element = bubbleRoot.value;
  if (!element) {
    return;
  }
  bubbleVisibilityObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) {
      return;
    }
    scheduleBubbleBodyReady();
  }, {
    root: null,
    rootMargin: MESSAGE_BUBBLE_DEFER_ROOT_MARGIN,
    threshold: 0,
  });
  bubbleVisibilityObserver.observe(element);
}

function toolStatusLabel(status: ChatToolStatus): string {
  if (status === 'running') return text('执行中', 'Running');
  if (status === 'completed') return text('已完成', 'Completed');
  return text('错误', 'Error');
}

function toolOutputLabel(status: ChatToolStatus): string {
  if (status === 'running') return text('实时输出', 'Live output');
  if (status === 'completed') return text('工具输出', 'Tool output');
  return text('错误输出', 'Error output');
}

function shouldRenderToolOutputPlaceholder(tool: ChatDisplayMessage['toolHints'][number]): boolean {
  return tool.status === 'running' && !tool.resultPreview;
}

function shouldOpenToolDetails(tool: ChatDisplayToolHint, _index: number): boolean {
  return tool.status === 'error';
}

function bubbleClass(message: ChatMessageGroup['messages'][number], index: number): Record<string, boolean> {
  const display = displayAt(index);
  return {
    streaming: message.source === 'stream' && props.activeRunId === message.runId && props.activeStreamingMessageId === message.id,
    user: displayGroup.value.role === 'user',
    'tool-message': display.toolHints.length > 0 && !display.markdownSource,
    'process-message': display.processBlocks.length > 0,
    'structured-message': display.hasStructuredBlocks,
  };
}

watch(mediaPreview, (value) => {
  if (typeof document === 'undefined') {
    return;
  }

  if (value) {
    if (!bodyOverflowLocked) {
      previousBodyOverflow = document.body.style.overflow;
      bodyOverflowLocked = true;
    }
    document.body.style.overflow = 'hidden';
    return;
  }

  if (bodyOverflowLocked) {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = '';
    bodyOverflowLocked = false;
  }
});

onMounted(() => {
  bubbleBodyReady.value = !canDeferBubbleBody.value || shouldForceBubbleBody.value;
  if (!bubbleBodyReady.value) {
    bindBubbleVisibilityObserver();
  }
  window.addEventListener('keydown', handleWindowKeydown);
});

watch(
  [canDeferBubbleBody, shouldForceBubbleBody],
  async ([canDefer, forced]) => {
    if (forced || !canDefer) {
      ensureBubbleBodyReady();
      return;
    }
    if (bubbleBodyReady.value) {
      return;
    }
    clearScheduledBubbleBodyReady();
    bubbleBodyReady.value = false;
    await nextTick();
    bindBubbleVisibilityObserver();
  },
  { immediate: false },
);

onBeforeUnmount(() => {
  clearScheduledBubbleBodyReady();
  disconnectBubbleVisibilityObserver();
  for (const timer of bubbleCopyTimers.values()) {
    window.clearTimeout(timer);
  }
  bubbleCopyTimers.clear();
  for (const timer of toolCopyTimers.values()) {
    window.clearTimeout(timer);
  }
  toolCopyTimers.clear();
  window.removeEventListener('keydown', handleWindowKeydown);
  if (bodyOverflowLocked && typeof document !== 'undefined') {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = '';
    bodyOverflowLocked = false;
  }
});
</script>

<style scoped>
.chat-message-group {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  width: 100%;
}

.chat-message-group.is-overlay-continuation {
  margin-top: -2px;
}

.chat-message-group.role-user {
  flex-direction: row-reverse;
}

.chat-message-stack {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: fit-content;
  max-width: min(100%, 1120px);
}

.chat-message-group.role-user .chat-message-stack {
  justify-items: end;
}

.chat-message-avatar {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--chat-avatar-bg);
  color: var(--chat-avatar-text);
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-message-group.is-overlay-continuation .chat-message-avatar {
  visibility: hidden;
}

.chat-message-group.role-user .chat-message-avatar {
  background: var(--chat-user-bubble);
  color: var(--chat-user-bubble-text);
}

.chat-message-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-message-meta strong {
  color: var(--chat-text);
  font-size: 13px;
}

.chat-message-group.role-user .chat-message-meta {
  justify-content: flex-end;
}

.chat-message-bubble-stack {
  display: grid;
  gap: 8px;
  justify-items: start;
}

.chat-message-group.is-overlay-continuation .chat-message-bubble-stack {
  gap: 6px;
}

.chat-message-group.role-user .chat-message-bubble-stack {
  justify-items: end;
}

.chat-message-bubble {
  width: fit-content;
  max-width: 100%;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--chat-assistant-bubble);
  border: 1px solid var(--chat-line);
  color: var(--chat-text);
  box-shadow: 0 2px 8px rgba(8, 15, 26, 0.04);
  transition: box-shadow 0.18s ease;
}

.chat-message-bubble:hover {
  box-shadow: 0 4px 16px rgba(8, 15, 26, 0.08);
}

.chat-message-bubble-deferred {
  min-width: min(320px, 100%);
  max-width: min(560px, 100%);
  border-style: dashed;
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 82%, transparent);
  box-shadow: none;
}

.chat-message-bubble-deferred__summary {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--chat-text-soft);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message-group.is-overlay-continuation .chat-message-bubble {
  border-top-left-radius: 8px;
  box-shadow: none;
}

.chat-message-bubble.user {
  background: var(--chat-user-bubble);
  color: var(--chat-user-bubble-text);
  border-color: transparent;
  padding: 10px 14px;
}

.chat-message-group.role-user .chat-message-bubble {
  background: var(--chat-user-bubble);
  color: var(--chat-user-bubble-text);
  border-color: transparent;
  padding: 10px 14px;
  border-top-right-radius: 5px;
}

.chat-message-bubble.streaming {
  border-color: color-mix(in srgb, var(--chat-accent) 56%, var(--chat-line));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--chat-accent) 18%, transparent), 0 4px 16px rgba(37, 99, 235, 0.08);
  animation: streaming-glow 2s ease-in-out infinite;
}

@keyframes streaming-glow {
  0%, 100% {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--chat-accent) 18%, transparent), 0 4px 16px rgba(37, 99, 235, 0.08);
  }
  50% {
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--chat-accent) 28%, transparent), 0 6px 24px rgba(37, 99, 235, 0.14);
  }
}

.chat-message-bubble.tool-message {
  background: var(--chat-assistant-bubble-soft);
}

.chat-message-bubble.process-message {
  background: color-mix(in srgb, var(--chat-assistant-bubble) 86%, white 14%);
}

.chat-message-media-list {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
}

.chat-message-blocks {
  display: grid;
  gap: 10px;
}

.chat-message-paragraph {
  color: inherit;
  line-height: 1.75;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message-paragraph-text {
  white-space: pre-wrap;
}

.chat-message-paragraph-inline-run {
  display: inline;
}

.chat-message-paragraph-break-run {
  display: block;
  margin: 10px 0;
}

.chat-message-paragraph-break-run:first-child {
  margin-top: 0;
}

.chat-message-paragraph-break-run:last-child {
  margin-bottom: 0;
}

.chat-inline-resource {
  display: inline-flex;
  vertical-align: middle;
  align-items: center;
  gap: 8px;
  max-width: min(190px, 100%);
  min-height: 34px;
  margin: 0 0.35em 0.12em 0;
  padding: 4px 10px 4px 4px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: var(--chat-muted-chip);
  text-align: left;
  cursor: zoom-in;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.chat-inline-resource:hover,
.chat-inline-resource:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.chat-inline-resource.missing {
  border-style: dashed;
  cursor: default;
  box-shadow: none;
  transform: none;
}

.chat-inline-resource-media {
  display: block;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  object-fit: cover;
  flex-shrink: 0;
}

.chat-inline-resource-video .chat-inline-resource-media {
  background: #000;
}

.chat-inline-resource-caption,
.chat-inline-resource-missing {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-break-resource {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: min(320px, 100%);
  margin: 0;
  min-height: 0;
  padding: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent);
}

.chat-break-resource .chat-inline-resource-media {
  width: 100%;
  height: auto;
  max-height: 148px;
  border-radius: 10px;
}

.chat-break-resource .chat-inline-resource-caption,
.chat-break-resource .chat-inline-resource-missing {
  font-size: 11px;
  line-height: 1.45;
  overflow: visible;
  text-overflow: initial;
  white-space: normal;
  word-break: break-word;
}

.chat-inline-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 34px;
  margin: 0 0.35em 0.12em 0;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: var(--chat-muted-chip);
  color: var(--chat-text);
  text-decoration: none;
  vertical-align: middle;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.chat-inline-chip:hover,
.chat-inline-chip:focus-visible {
  outline: none;
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 10%, var(--chat-muted-chip));
}

.chat-inline-chip.missing {
  border-style: dashed;
  transform: none;
}

.chat-inline-chip-badge {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 8px;
  background: rgba(15, 23, 42, 0.08);
  color: var(--chat-text-soft);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-inline-chip-label {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.chat-break-chip {
  margin: 0;
}

.chat-message-group.role-user .chat-inline-resource {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.18);
}

.chat-message-group.role-user .chat-inline-resource-caption,
.chat-message-group.role-user .chat-inline-resource-missing {
  color: rgba(248, 251, 255, 0.82);
}

.chat-message-group.role-user .chat-break-resource {
  background: rgba(255, 255, 255, 0.1);
}

.chat-message-group.role-user .chat-inline-chip {
  border-color: rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.chat-message-group.role-user .chat-inline-chip-badge {
  background: rgba(255, 255, 255, 0.14);
  color: rgba(248, 251, 255, 0.82);
}

.chat-message-group.role-user .chat-break-resource,
.chat-message-group.role-user .chat-break-chip {
  margin: 0;
}

.chat-message-bubble-body :deep(.chat-md-break-resource-wrap),
.chat-message-bubble-body :deep(.chat-md-card-resource-wrap) {
  display: block;
  margin: 10px 0;
}

.chat-message-bubble-body :deep(.chat-md-break-resource-wrap:first-child),
.chat-message-bubble-body :deep(.chat-md-card-resource-wrap:first-child) {
  margin-top: 0;
}

.chat-message-bubble-body :deep(.chat-md-break-resource-wrap:last-child),
.chat-message-bubble-body :deep(.chat-md-card-resource-wrap:last-child) {
  margin-bottom: 0;
}

.chat-message-bubble-body :deep(.chat-inline-resource) {
  display: inline-flex;
  vertical-align: middle;
  align-items: center;
  gap: 8px;
  max-width: min(190px, 100%);
  min-height: 34px;
  margin: 0 0.35em 0.12em 0;
  padding: 4px 10px 4px 4px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(236, 72, 153, 0.05)),
    var(--chat-muted-chip);
  text-align: left;
  cursor: zoom-in;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}

.chat-message-bubble-body :deep(.chat-inline-resource:hover),
.chat-message-bubble-body :deep(.chat-inline-resource:focus-visible) {
  outline: none;
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.12);
}

.chat-message-bubble-body :deep(.chat-inline-resource.missing) {
  cursor: default;
  border-style: dashed;
  box-shadow: none;
  transform: none;
}

.chat-message-bubble-body :deep(.chat-inline-resource-media) {
  display: block;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  object-fit: cover;
  flex-shrink: 0;
}

.chat-message-bubble-body :deep(.chat-inline-resource-video .chat-inline-resource-media) {
  background: #000;
}

.chat-message-bubble-body :deep(.chat-inline-resource-caption),
.chat-message-bubble-body :deep(.chat-inline-resource-missing) {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.35;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-break-resource) {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: min(320px, 100%);
  margin: 0;
  min-height: 0;
  padding: 8px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent);
}

.chat-message-bubble-body :deep(.chat-break-resource .chat-inline-resource-media) {
  width: 100%;
  height: auto;
  max-height: 148px;
  border-radius: 10px;
}

.chat-message-bubble-body :deep(.chat-break-resource .chat-inline-resource-caption) {
  font-size: 11px;
  line-height: 1.45;
  overflow: visible;
  text-overflow: initial;
  white-space: normal;
  word-break: break-word;
}

.chat-message-bubble-body :deep(.chat-break-resource .chat-inline-resource-missing) {
  font-size: 11px;
  line-height: 1.45;
  overflow: visible;
  text-overflow: initial;
  white-space: normal;
  word-break: break-word;
}

.chat-message-bubble-body :deep(.chat-inline-chip) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  min-height: 34px;
  margin: 0 0.35em 0.12em 0;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background:
    linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(245, 158, 11, 0.05)),
    var(--chat-muted-chip);
  color: var(--chat-text);
  text-decoration: none;
  vertical-align: middle;
  transition: border-color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.chat-message-bubble-body :deep(.chat-inline-chip:hover),
.chat-message-bubble-body :deep(.chat-inline-chip:focus-visible) {
  outline: none;
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 10%, var(--chat-muted-chip));
}

.chat-message-bubble-body :deep(.chat-inline-chip.missing) {
  border-style: dashed;
  transform: none;
}

.chat-message-bubble-body :deep(.chat-inline-chip-badge) {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 8px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(236, 72, 153, 0.12));
  color: var(--chat-text);
  font-size: 10px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-message-bubble-body :deep(.chat-inline-chip-label) {
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}

.chat-message-bubble-body :deep(.chat-break-chip) {
  margin: 0;
}

.chat-message-bubble-body :deep(.chat-resource-card) {
  width: min(100%, 420px);
  display: grid;
  gap: 10px;
  padding: 10px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 88%, transparent);
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.06);
}

.chat-message-bubble-body :deep(.chat-resource-card.image),
.chat-message-bubble-body :deep(.chat-resource-card.video) {
  appearance: none;
  cursor: zoom-in;
  text-align: left;
}

.chat-message-bubble-body :deep(.chat-resource-card.image) {
  background:
    radial-gradient(circle at top right, rgba(99, 102, 241, 0.08), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--chat-assistant-bubble-soft) 94%, white 4%), color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent));
}

.chat-message-bubble-body :deep(.chat-resource-card.video) {
  background:
    radial-gradient(circle at top right, rgba(236, 72, 153, 0.08), transparent 42%),
    linear-gradient(180deg, color-mix(in srgb, var(--chat-assistant-bubble-soft) 94%, white 4%), color-mix(in srgb, var(--chat-assistant-bubble-soft) 84%, transparent));
}

.chat-message-bubble-body :deep(.chat-resource-card.file) {
  background:
    linear-gradient(135deg, rgba(245, 158, 11, 0.05), transparent 42%),
    color-mix(in srgb, var(--chat-assistant-bubble-soft) 90%, transparent);
}

.chat-message-bubble-body :deep(.chat-resource-card.missing) {
  border-style: dashed;
  box-shadow: none;
}

.chat-message-bubble-body :deep(.chat-resource-card.image:hover),
.chat-message-bubble-body :deep(.chat-resource-card.image:focus-visible),
.chat-message-bubble-body :deep(.chat-resource-card.video:hover),
.chat-message-bubble-body :deep(.chat-resource-card.video:focus-visible) {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.1);
}

.chat-message-bubble-body :deep(.chat-resource-image) {
  display: block;
  width: 100%;
  max-height: 260px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  object-fit: cover;
}

.chat-message-bubble-body :deep(.chat-resource-video) {
  display: block;
  width: 100%;
  max-height: 260px;
  border-radius: 12px;
  background: #000;
  object-fit: cover;
}

.chat-message-bubble-body :deep(.chat-resource-meta),
.chat-message-bubble-body :deep(.chat-resource-file-copy) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.chat-message-bubble-body :deep(.chat-resource-meta strong),
.chat-message-bubble-body :deep(.chat-resource-file-copy strong) {
  color: var(--chat-text);
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
}

.chat-message-bubble-body :deep(.chat-resource-meta span),
.chat-message-bubble-body :deep(.chat-resource-file-copy span) {
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.chat-message-bubble-body :deep(.chat-resource-file-badge) {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  height: 22px;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--chat-muted-chip);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
}

.chat-message-bubble-body :deep(.chat-resource-file-actions) {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.chat-message-bubble-body :deep(.chat-resource-file-actions a) {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  color: var(--chat-text);
  text-decoration: none;
  font-size: 12px;
  font-weight: 600;
}

.chat-message-bubble-body :deep(.chat-resource-file-actions a:hover),
.chat-message-bubble-body :deep(.chat-resource-file-actions a:focus-visible) {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: var(--chat-hover);
}

.chat-inline-process {
  margin-bottom: 10px;
  min-width: 0;
  max-width: 100%;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-inline-thinking {
  margin-bottom: 10px;
}

.chat-inline-thinking-summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  color: var(--chat-text-soft);
  font-size: 12px;
  cursor: pointer;
}

.chat-inline-thinking-summary::-webkit-details-marker {
  display: none;
}

.chat-inline-thinking-pill {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--chat-muted-chip);
  color: var(--chat-text);
  font-size: 11px;
}

.chat-inline-thinking-summary-meta {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 8%, var(--chat-muted-chip));
  color: var(--chat-accent);
  font-size: 11px;
  font-weight: 700;
}

.chat-inline-thinking-live,
.chat-inline-process-thinking__live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  max-width: 100%;
  margin-top: 8px;
  padding: 5px 8px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--chat-accent) 8%, transparent);
  color: var(--chat-text-soft);
  font-size: 11px;
  line-height: 1.35;
}

.chat-inline-thinking-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--chat-accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 36%, transparent);
  animation: chat-thinking-live-pulse 1.5s ease-out infinite;
  flex-shrink: 0;
}

@keyframes chat-thinking-live-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 36%, transparent);
  }

  70% {
    box-shadow: 0 0 0 8px transparent;
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.chat-inline-thinking-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.chat-inline-thinking-item {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 62%, transparent);
}

.chat-inline-thinking-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-inline-thinking-body {
  min-width: 0;
  max-height: min(220px, 36vh);
  overflow: auto;
}

.chat-inline-process-summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
  max-width: 100%;
  color: var(--chat-text-soft);
  font-size: 12px;
  cursor: pointer;
}

.chat-inline-process-summary::-webkit-details-marker {
  display: none;
}

.chat-inline-process-pill {
  width: 18px;
  height: 18px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--chat-muted-chip);
  color: var(--chat-text);
  font-size: 11px;
}

.chat-inline-process-summary-meta {
  display: inline-flex;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
  font-size: 11px;
}

.chat-inline-process-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
  min-width: 0;
  max-width: 100%;
}

.chat-inline-process-thinking {
  display: grid;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 12px;
  border: 1px dashed color-mix(in srgb, var(--chat-line) 84%, var(--chat-accent) 16%);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--chat-accent) 4%, transparent), transparent 48%),
    color-mix(in srgb, var(--chat-assistant-bubble) 78%, var(--chat-modal-row) 22%);
}

.chat-inline-process-thinking__head {
  list-style: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}

.chat-inline-process-thinking__head::-webkit-details-marker {
  display: none;
}

.chat-inline-process-thinking__head::before {
  content: '...';
  width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-accent) 12%, var(--chat-muted-chip));
  color: var(--chat-accent);
  font-size: 11px;
}

.chat-inline-process-thinking__meta {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: color-mix(in srgb, var(--chat-text-soft) 88%, var(--chat-accent) 12%);
}

.chat-inline-process-thinking__list {
  display: grid;
  gap: 10px;
}

.chat-inline-process-thinking__item {
  position: relative;
  display: grid;
  gap: 8px;
  padding: 12px 14px 12px 16px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 86%, var(--chat-accent) 14%);
  background: color-mix(in srgb, var(--chat-assistant-bubble) 68%, white 32%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

.chat-inline-process-thinking__item::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--chat-accent) 58%, var(--chat-line));
}

.chat-inline-process-thinking__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.chat-inline-process-thinking__item-body {
  min-width: 0;
  max-height: min(220px, 36vh);
  overflow: auto;
  color: var(--chat-text);
}

.chat-inline-process-item {
  display: grid;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--chat-inline-tool-bg);
  border: 1px solid var(--chat-line);
}

.chat-inline-process-item.status-running {
  background: var(--chat-tool-running);
}

.chat-inline-process-item.status-completed {
  background: var(--chat-tool-success);
}

.chat-inline-process-item.status-error {
  background: var(--chat-tool-error);
}

.chat-inline-process-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  color: var(--chat-text);
  font-size: 12px;
  cursor: pointer;
  list-style: none;
}

.chat-inline-process-head::-webkit-details-marker {
  display: none;
}

.chat-inline-process-head-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.chat-inline-process-head-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
  flex-wrap: wrap;
}

.chat-inline-process-step {
  width: 22px;
  height: 22px;
  display: inline-grid;
  place-items: center;
  border-radius: 8px;
  background: var(--chat-muted-chip);
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.chat-inline-process-head-summary {
  min-width: 0;
  max-width: 100%;
  color: var(--chat-text-soft);
  font-size: 11px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-inline-process-head-state {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  background: var(--chat-muted-chip);
  font-size: 11px;
  font-weight: 700;
}

.chat-inline-process-head-state.status-running {
  color: var(--chat-accent);
}

.chat-inline-process-head-state.status-completed {
  color: var(--chat-success);
}

.chat-inline-process-head-state.status-error {
  color: #dc2626;
}

.chat-inline-process-live {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  width: fit-content;
  max-width: 100%;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 9px;
  background: color-mix(in srgb, var(--chat-accent) 9%, transparent);
  color: var(--chat-text-soft);
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-inline-process-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--chat-accent);
  box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 38%, transparent);
  animation: chat-tool-live-pulse 1.4s ease-out infinite;
  flex-shrink: 0;
}

@keyframes chat-tool-live-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--chat-accent) 38%, transparent);
  }

  70% {
    box-shadow: 0 0 0 8px transparent;
  }

  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}

.chat-inline-process-item p {
  margin: 0;
  padding-top: 2px;
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
}

.chat-inline-process-detail {
  display: grid;
  gap: 10px;
  min-width: 0;
  max-width: 100%;
  padding-top: 4px;
}

.chat-inline-process-block {
  display: grid;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.chat-inline-process-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}

.chat-inline-process-block span {
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.chat-inline-process-copy {
  border: 1px solid var(--chat-line);
  border-radius: 8px;
  background: var(--chat-muted-chip);
  color: var(--chat-text-soft);
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 7px;
}

.chat-inline-process-copy:hover,
.chat-inline-process-copy:focus-visible {
  color: var(--chat-text);
  border-color: var(--chat-line-strong);
}

.chat-inline-process-copy__done,
.chat-inline-process-copy__error {
  display: none;
}

.chat-inline-process-copy[data-copied="1"] {
  color: var(--chat-success);
}

.chat-inline-process-copy[data-copied="1"] .chat-inline-process-copy__idle {
  display: none;
}

.chat-inline-process-copy[data-copied="1"] .chat-inline-process-copy__done {
  display: inline;
}

.chat-inline-process-copy[data-error="1"] {
  color: #dc2626;
}

.chat-inline-process-copy[data-error="1"] .chat-inline-process-copy__idle {
  display: none;
}

.chat-inline-process-copy[data-error="1"] .chat-inline-process-copy__error {
  display: inline;
}

.chat-inline-process-block pre {
  margin: 0;
  overflow: auto;
  overscroll-behavior: contain;
  max-height: min(260px, 42vh);
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--chat-code-bg);
  color: var(--chat-code-text);
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-inline-process-block-placeholder p {
  margin: 0;
  max-width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--chat-code-bg);
  color: var(--chat-text-soft);
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.chat-inline-process-artifacts {
  display: grid;
  gap: 8px;
  padding-top: 4px;
}

.chat-inline-process-artifacts__label {
  color: var(--chat-text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.chat-inline-process-artifacts__list {
  display: grid;
  gap: 8px;
}

.chat-message-bubble-body {
  min-width: 0;
}

.chat-message-bubble-body :deep(.chat-markdown) {
  min-width: 0;
  display: block;
  line-height: 1.7;
  color: inherit;
  word-break: break-word;
}

.chat-message-bubble-body :deep(h1),
.chat-message-bubble-body :deep(h2),
.chat-message-bubble-body :deep(h3),
.chat-message-bubble-body :deep(h4),
.chat-message-bubble-body :deep(h5),
.chat-message-bubble-body :deep(h6) {
  margin: 0 0 0.75em;
  color: inherit;
  line-height: 1.25;
}

.chat-message-bubble-body :deep(h1:last-child),
.chat-message-bubble-body :deep(h2:last-child),
.chat-message-bubble-body :deep(h3:last-child),
.chat-message-bubble-body :deep(h4:last-child),
.chat-message-bubble-body :deep(h5:last-child),
.chat-message-bubble-body :deep(h6:last-child) {
  margin-bottom: 0;
}

.chat-message-bubble-body :deep(h1) {
  font-size: 1.55rem;
}

.chat-message-bubble-body :deep(h2) {
  font-size: 1.32rem;
}

.chat-message-bubble-body :deep(h3) {
  font-size: 1.16rem;
}

.chat-message-bubble-body :deep(h4) {
  font-size: 1.03rem;
}

.chat-message-bubble-body :deep(h5) {
  font-size: 0.96rem;
}

.chat-message-bubble-body :deep(h6) {
  font-size: 0.9rem;
  color: var(--chat-text-soft);
}

.chat-message-bubble-body :deep(p) {
  margin: 0 0 0.9em;
}

.chat-message-bubble-body :deep(p:last-child) {
  margin-bottom: 0;
}

.chat-message-bubble-body :deep(ul),
.chat-message-bubble-body :deep(ol) {
  margin: 0 0 0.9em;
  padding-left: 1.35em;
  display: grid;
  gap: 0.35em;
}

.chat-message-bubble-body :deep(li) {
  padding-left: 0.1em;
}

.chat-message-bubble-body :deep(blockquote) {
  margin: 0 0 0.95em;
  padding: 10px 14px;
  border-left: 3px solid color-mix(in srgb, var(--chat-accent) 38%, var(--chat-line));
  border-radius: 0 16px 16px 0;
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 68%, transparent);
  color: var(--chat-text-soft);
}

.chat-message-group.role-user .chat-message-bubble-body :deep(blockquote) {
  background: rgba(255, 255, 255, 0.12);
  color: rgba(248, 251, 255, 0.9);
  border-left-color: rgba(255, 255, 255, 0.34);
}

.chat-message-bubble-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--chat-line);
  margin: 1em 0;
}

.chat-message-bubble-body :deep(a) {
  color: var(--chat-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(a) {
  color: #f8fbff;
}

.chat-message-bubble-body :deep(code) {
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  font-size: 0.92em;
}

.chat-message-bubble-body :deep(del) {
  color: var(--chat-text-soft);
  text-decoration-thickness: 1.5px;
}

.chat-message-bubble-body :deep(mark) {
  padding: 0.1em 0.35em;
  border-radius: 6px;
  background: rgba(250, 204, 21, 0.24);
  color: inherit;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(mark) {
  background: rgba(255, 255, 255, 0.22);
}

.chat-message-bubble-body :deep(:not(pre) > code) {
  display: inline-block;
  padding: 0.14em 0.45em;
  border-radius: 8px;
  background: color-mix(in srgb, var(--chat-muted-chip) 72%, transparent);
}

.chat-message-group.role-user .chat-message-bubble-body :deep(:not(pre) > code) {
  background: rgba(255, 255, 255, 0.14);
}

.chat-message-bubble-body :deep(pre) {
  margin: 0;
  overflow: auto;
  padding: 14px 16px;
  border-radius: 0 0 16px 16px;
  background: var(--chat-code-bg);
  color: var(--chat-code-text);
  max-width: 100%;
}

.chat-message-bubble-body :deep(pre code) {
  display: block;
  min-width: max-content;
  white-space: pre;
}

.chat-message-bubble-body :deep(.hljs) {
  color: var(--chat-code-text);
  background: transparent;
}

.chat-message-bubble-body :deep(.hljs-comment),
.chat-message-bubble-body :deep(.hljs-quote) {
  color: #7f8ea3;
  font-style: italic;
}

.chat-message-bubble-body :deep(.hljs-keyword),
.chat-message-bubble-body :deep(.hljs-selector-tag),
.chat-message-bubble-body :deep(.hljs-literal),
.chat-message-bubble-body :deep(.hljs-section),
.chat-message-bubble-body :deep(.hljs-link) {
  color: #ff7ab8;
}

.chat-message-bubble-body :deep(.hljs-string),
.chat-message-bubble-body :deep(.hljs-attr),
.chat-message-bubble-body :deep(.hljs-meta .hljs-string) {
  color: #9ae6b4;
}

.chat-message-bubble-body :deep(.hljs-number),
.chat-message-bubble-body :deep(.hljs-symbol),
.chat-message-bubble-body :deep(.hljs-bullet) {
  color: #f6bd60;
}

.chat-message-bubble-body :deep(.hljs-title),
.chat-message-bubble-body :deep(.hljs-title.function_),
.chat-message-bubble-body :deep(.hljs-built_in),
.chat-message-bubble-body :deep(.hljs-type) {
  color: #7dd3fc;
}

.chat-message-bubble-body :deep(.hljs-variable),
.chat-message-bubble-body :deep(.hljs-template-variable),
.chat-message-bubble-body :deep(.hljs-name) {
  color: #fda4af;
}

.chat-message-bubble-body :deep(.hljs-tag),
.chat-message-bubble-body :deep(.hljs-doctag),
.chat-message-bubble-body :deep(.hljs-attribute) {
  color: #93c5fd;
}

.chat-message-bubble-body :deep(.markdown-inline-image) {
  display: block;
  max-width: min(100%, 420px);
  max-height: 320px;
  width: auto;
  height: auto;
  margin: 0.9em 0;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 78%, transparent);
  object-fit: contain;
  cursor: zoom-in;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.chat-message-bubble-body :deep(.markdown-inline-image:hover) {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--chat-accent) 28%, var(--chat-line));
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
}

.chat-message-bubble-body :deep(.chat-markdown-image-fallback) {
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  background: var(--chat-muted-chip);
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-message-bubble-body :deep(.markdown-plain-text-fallback) {
  white-space: pre-wrap;
}

.chat-message-bubble-body :deep(.chat-markdown-table-wrap) {
  margin: 0 0 1em;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  box-sizing: border-box;
}

.chat-message-bubble-body :deep(.chat-math) {
  max-width: 100%;
  color: inherit;
}

.chat-message-bubble-body :deep(.chat-math-block) {
  display: block;
  margin: 0.35em 0 0.95em;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
  text-align: center;
  box-sizing: border-box;
}

.chat-message-bubble-body :deep(.chat-math-inline) {
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  vertical-align: -0.15em;
  -webkit-overflow-scrolling: touch;
}

.chat-message-bubble-body :deep(.chat-math-source) {
  font-family: 'SFMono-Regular', 'Consolas', monospace;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-math .katex) {
  font-size: 1.04em;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-inline-preview-shell.kind-html),
.chat-message-bubble-body :deep(.chat-inline-preview-shell.kind-svg) {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.chat-message-bubble-body :deep(.chat-inline-overflow-viewport) {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  box-sizing: border-box;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

.chat-message-bubble-body :deep(table) {
  max-width: none;
}

.chat-message-bubble-body :deep(.code-block-wrapper) {
  margin: 0 0 1em;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--chat-line) 54%, transparent);
  background: var(--chat-code-bg);
  box-sizing: border-box;
}

.chat-message-bubble-body :deep(.code-block-header),
.chat-message-bubble-body :deep(.chat-mermaid-header) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 12px;
  background: color-mix(in srgb, var(--chat-code-bg) 90%, white 4%);
  border-bottom: 1px solid color-mix(in srgb, var(--chat-line) 34%, transparent);
  color: var(--chat-code-text);
}

.chat-message-bubble-body :deep(.code-block-actions),
.chat-message-bubble-body :deep(.chat-mermaid-actions) {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  max-width: 100%;
}

.chat-message-bubble-body :deep(.code-block-lang),
.chat-message-bubble-body :deep(.chat-mermaid-label) {
  color: color-mix(in srgb, var(--chat-code-text) 72%, transparent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.chat-message-bubble-body :deep(.chat-md-copy-button),
.chat-message-bubble-body :deep(.chat-mermaid-expand-button),
.chat-message-bubble-body :deep(.chat-live-preview-toggle-button),
.chat-message-bubble-body :deep(.chat-preview-save-button) {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: color-mix(in srgb, var(--chat-code-text) 78%, transparent);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 5px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.18s ease, border-color 0.18s ease, color 0.18s ease;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-md-copy-button:hover),
.chat-message-bubble-body :deep(.chat-md-copy-button:focus-visible),
.chat-message-bubble-body :deep(.chat-mermaid-expand-button:hover),
.chat-message-bubble-body :deep(.chat-mermaid-expand-button:focus-visible),
.chat-message-bubble-body :deep(.chat-live-preview-toggle-button:hover),
.chat-message-bubble-body :deep(.chat-live-preview-toggle-button:focus-visible),
.chat-message-bubble-body :deep(.chat-preview-save-button:hover),
.chat-message-bubble-body :deep(.chat-preview-save-button:focus-visible) {
  border-color: color-mix(in srgb, var(--chat-code-text) 18%, transparent);
  background: color-mix(in srgb, var(--chat-code-text) 10%, transparent);
  color: var(--chat-code-text);
  outline: none;
}

.chat-message-bubble-body :deep(.chat-live-preview-toggle-button.is-active) {
  border-color: color-mix(in srgb, var(--chat-code-text) 18%, transparent);
  background: color-mix(in srgb, var(--chat-code-text) 12%, transparent);
  color: var(--chat-code-text);
}

.chat-message-bubble-body :deep(.chat-md-copy-button__done),
.chat-message-bubble-body :deep(.chat-md-copy-button__error) {
  display: none;
}

.chat-message-bubble-body :deep(.chat-md-copy-button.copied .chat-md-copy-button__idle) {
  display: none;
}

.chat-message-bubble-body :deep(.chat-md-copy-button.copied .chat-md-copy-button__done) {
  display: inline;
  color: var(--chat-success);
}

.chat-message-bubble-body :deep(.chat-md-copy-button[data-error="1"] .chat-md-copy-button__idle) {
  display: none;
}

.chat-message-bubble-body :deep(.chat-md-copy-button[data-error="1"] .chat-md-copy-button__error) {
  display: inline;
  color: #f97316;
}

.chat-message-bubble-body :deep(.json-collapse) {
  margin: 0 0 1em;
}

.chat-message-bubble-body :deep(.json-collapse summary),
.chat-message-bubble-body :deep(.chat-mermaid-source summary) {
  cursor: pointer;
  list-style: none;
  padding: 0 0 8px;
  color: var(--chat-text-soft);
  font-size: 12px;
  user-select: none;
}

.chat-message-bubble-body :deep(.json-collapse summary::-webkit-details-marker),
.chat-message-bubble-body :deep(.chat-mermaid-source summary::-webkit-details-marker) {
  display: none;
}

.chat-message-bubble-body :deep(.json-collapse summary:hover),
.chat-message-bubble-body :deep(.chat-mermaid-source summary:hover) {
  color: var(--chat-text);
}

.chat-message-bubble-body :deep(.chat-mermaid-block) {
  margin: 0 0 1em;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 58%, transparent);
  background: color-mix(in srgb, var(--chat-assistant-bubble-soft) 82%, transparent);
  overflow: hidden;
}

.chat-message-group.role-user .chat-message-bubble-body :deep(.chat-mermaid-block) {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.16);
}

.chat-message-bubble-body :deep(.chat-mermaid-canvas) {
  padding: 14px 14px 8px;
  min-height: 96px;
  display: grid;
  justify-items: stretch;
  align-items: start;
  gap: 8px;
  overflow: auto;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-rendered="1"] .chat-mermaid-canvas) {
  cursor: zoom-in;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-inline-disabled="1"] .chat-mermaid-canvas) {
  cursor: default;
}

/* ── Seamless preview: no border, floating hover toolbar, no source ── */
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"]) {
  position: relative;
  border: none;
  background: transparent;
  border-radius: 8px;
  transition: background 0.15s ease;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"]:hover) {
  background: color-mix(in srgb, var(--chat-hover) 40%, transparent);
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header) {
  display: flex;
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 2;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
  margin: 0;
  padding: 3px 6px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--chat-modal-bg) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--chat-line) 60%, transparent);
  backdrop-filter: blur(10px);
  gap: 4px;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-mermaid-label) {
  display: none;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"]:hover .chat-mermaid-header) {
  opacity: 1;
  pointer-events: auto;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-mermaid-actions) {
  gap: 2px;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-mermaid-expand-button),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-preview-save-button),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-live-preview-toggle-button),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-md-copy-button) {
  appearance: none;
  border: none;
  background: transparent;
  color: var(--chat-text-soft);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
  white-space: nowrap;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-mermaid-expand-button:hover),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-preview-save-button:hover),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-live-preview-toggle-button:hover),
.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-header .chat-md-copy-button:hover) {
  background: color-mix(in srgb, var(--chat-hover) 60%, transparent);
  color: var(--chat-text);
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-source) {
  display: none;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-mermaid-canvas) {
  padding: 4px 0;
  min-height: unset;
}

.chat-message-bubble-body :deep(.chat-mermaid-block[data-seamless="1"] .chat-live-preview-frame.is-bubble) {
  border-radius: 4px;
}

.chat-message-bubble-body :deep(.chat-live-preview-frame.is-bubble) {
  display: block;
  width: 100%;
  min-height: 48px;
  border: none;
  border-radius: 12px;
  background: #ffffff;
  pointer-events: none;
  overflow: hidden;
}

.chat-message-bubble-body :deep(.chat-inline-code-fallback) {
  width: 100%;
  margin: 0;
}

.chat-message-bubble-body :deep(.chat-inline-code-fallback pre) {
  border-radius: 12px;
}

.chat-message-bubble-body :deep(.chat-mermaid-placeholder) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: min(100%, 220px);
  min-height: 56px;
  padding: 0 16px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-muted-chip) 72%, transparent);
  color: var(--chat-text);
  font-size: 12px;
  font-weight: 600;
}

.chat-message-bubble-body :deep(.chat-mermaid-status) {
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-message-bubble-body :deep(.chat-mermaid-svg) {
  width: 100%;
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

.chat-message-bubble-body :deep(.chat-live-preview-svg) {
  width: 100%;
  max-width: 100%;
  margin: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior-x: contain;
}

.chat-message-bubble-body :deep(.chat-mermaid-source) {
  padding: 0 14px 14px;
}

.chat-message-bubble-body :deep(.chat-mermaid-source pre) {
  border-radius: 12px;
}

.chat-message-bubble-foot {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  margin-top: 10px;
  color: var(--chat-text-soft);
  font-size: 11px;
}

.chat-bubble-copy {
  margin-left: auto;
  appearance: none;
  border: 1px solid var(--chat-line);
  background: transparent;
  color: var(--chat-text-soft);
  border-radius: 8px;
  padding: 5px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.18s ease, background 0.18s ease, color 0.18s ease;
}

.chat-bubble-copy:hover,
.chat-bubble-copy:focus-visible {
  border-color: color-mix(in srgb, var(--chat-accent) 44%, var(--chat-line));
  background: var(--chat-hover);
  color: var(--chat-text);
  outline: none;
}

.chat-message-group.role-user .chat-bubble-copy {
  border-color: rgba(255, 255, 255, 0.18);
  color: rgba(248, 251, 255, 0.86);
}

.chat-message-group.role-user .chat-bubble-copy:hover,
.chat-message-group.role-user .chat-bubble-copy:focus-visible {
  border-color: rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.chat-bubble-copy__done,
.chat-bubble-copy__error {
  display: none;
}

.chat-bubble-copy[data-copied="1"] {
  border-color: color-mix(in srgb, var(--chat-success) 42%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-success) 18%, transparent);
  color: var(--chat-success);
}

.chat-bubble-copy[data-copied="1"] .chat-bubble-copy__idle {
  display: none;
}

.chat-bubble-copy[data-copied="1"] .chat-bubble-copy__done {
  display: inline;
}

.chat-bubble-copy[data-error="1"] {
  border-color: rgba(249, 115, 22, 0.35);
  background: rgba(249, 115, 22, 0.12);
  color: #f97316;
}

.chat-bubble-copy[data-error="1"] .chat-bubble-copy__idle {
  display: none;
}

.chat-bubble-copy[data-error="1"] .chat-bubble-copy__error {
  display: inline;
}

.chat-image-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgba(3, 8, 15, 0.78);
  backdrop-filter: blur(12px);
}

.chat-image-preview-mask[data-state='open'] {
  animation: chat-image-preview-mask-in 0.2s ease;
}

.chat-image-preview-dialog {
  position: fixed;
  z-index: 1201;
  top: 50%;
  left: 50%;
  width: min(92vw, 1180px);
  max-height: calc(100vh - 48px);
  display: grid;
  gap: 14px;
  padding: 20px;
  box-sizing: border-box;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: var(--chat-modal-bg);
  box-shadow: 0 20px 54px rgba(0, 0, 0, 0.22);
  overflow: auto;
  transform: translate(-50%, -50%);
}

.chat-image-preview-dialog[data-state='open'] {
  animation: chat-image-preview-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes chat-image-preview-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-image-preview-dialog-in {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.chat-image-preview-close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 40px;
  height: 40px;
  display: inline-grid;
  place-items: center;
  border-radius: 10px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.chat-image-preview-close:hover,
.chat-image-preview-close:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 32%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-modal-row) 70%, var(--chat-hover));
}

.chat-image-preview-image {
  display: block;
  max-width: 100%;
  max-height: calc(100vh - 170px);
  width: auto;
  height: auto;
  margin: 0 auto;
  box-sizing: border-box;
  border-radius: 12px;
  background: color-mix(in srgb, var(--chat-modal-row) 86%, transparent);
  object-fit: contain;
}

.chat-image-preview-video {
  display: block;
  width: min(100%, 1100px);
  max-height: calc(100vh - 170px);
  margin: 0 auto;
  box-sizing: border-box;
  border-radius: 12px;
  background: #000;
}

.chat-image-preview-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--chat-text-soft);
  font-size: 12px;
}

.chat-image-preview-meta span {
  min-width: 0;
  flex: 1 1 240px;
  word-break: break-word;
}

.chat-image-preview-meta a {
  color: var(--chat-accent);
  text-decoration: underline;
  text-underline-offset: 3px;
}

@media (max-width: 760px) {
  .chat-message-group {
    gap: 10px;
  }

  .chat-message-avatar {
    width: 34px;
    height: 34px;
  }

  .chat-message-bubble-body :deep(pre) {
    padding: 12px 14px;
  }

  .chat-message-bubble-body :deep(.chat-mermaid-canvas) {
    padding: 12px 12px 6px;
  }

  .chat-break-resource {
    width: min(100%, 280px);
  }

  .chat-message-bubble-body :deep(.chat-break-resource) {
    width: min(100%, 280px);
  }

  .chat-inline-resource-media {
    width: 28px;
    height: 28px;
  }

  .chat-message-bubble-body :deep(.chat-inline-resource-media) {
    width: 28px;
    height: 28px;
  }

  .chat-break-resource .chat-inline-resource-media {
    width: 100%;
    height: auto;
    max-height: 136px;
  }

  .chat-message-bubble-body :deep(.chat-break-resource .chat-inline-resource-media) {
    width: 100%;
    height: auto;
    max-height: 136px;
  }

  .chat-inline-chip {
    max-width: 100%;
    flex-wrap: wrap;
    padding: 8px 12px;
    min-height: 0;
  }

  .chat-message-bubble-body :deep(.chat-inline-chip) {
    max-width: 100%;
    flex-wrap: wrap;
    padding: 8px 12px;
    min-height: 0;
  }

  .chat-image-preview-mask {
    padding: 14px;
  }

  .chat-image-preview-dialog {
    width: min(100vw - 28px, 100%);
    max-height: calc(100dvh - 28px);
    padding: 16px;
    box-sizing: border-box;
    border-radius: 12px;
  }

  .chat-image-preview-image {
    max-height: calc(100dvh - 180px);
  }

  .chat-image-preview-video {
    max-height: calc(100dvh - 180px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-image-preview-mask[data-state='open'],
  .chat-image-preview-dialog[data-state='open'] {
    animation: none;
  }
}
</style>
