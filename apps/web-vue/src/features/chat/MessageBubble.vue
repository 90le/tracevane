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
import './message-bubble.css';
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
