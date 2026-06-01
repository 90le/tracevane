<template>
  <div
    ref="root"
    class="chat-markdown"
    :class="{
      'has-mermaid': renderReady && rendered.hasMermaid,
      'chat-markdown--deferred': !renderReady,
    }"
    @click="handleClick"
  >
    <div
      v-if="renderReady"
      v-html="rendered.html"
    ></div>
    <button
      v-else
      type="button"
      class="chat-markdown-deferred-card"
      @click.stop="ensureMarkdownRenderReady"
    >
      <strong>Large message</strong>
      <span>{{ deferredPreviewText }}</span>
    </button>
  </div>

  <DialogRoot :open="Boolean(livePreview)" @update:open="handleLivePreviewOpenChange">
    <DialogPortal>
      <DialogOverlay
        class="chat-live-preview-mask"
        @mousemove="handlePreviewMouseMove"
        @mouseup="handlePreviewMouseUp"
      />
      <DialogContent
        as-child
        @open-auto-focus="handleLivePreviewOpenAutoFocus"
        @close-auto-focus="handleLivePreviewCloseAutoFocus"
        @escape-key-down="handleLivePreviewEscapeKeyDown"
      >
        <div
          ref="livePreviewDialog"
          class="chat-live-preview-dialog"
          :aria-label="livePreview?.title || 'Fullscreen preview'"
          tabindex="-1"
        >
        <header class="chat-live-preview-head">
          <div class="chat-live-preview-copy">
            <strong>{{ livePreview?.title || 'Preview' }}</strong>
            <span>{{ livePreview?.loading ? 'Rendering fullscreen preview…' : 'Fullscreen preview' }}</span>
          </div>

          <div class="chat-live-preview-actions">
            <template v-if="canAdjustLivePreviewZoom">
              <button
                type="button"
                class="chat-live-preview-ghost"
                :class="{ 'is-active': livePreviewZoomFit }"
                @click="setLivePreviewZoom('fit')"
              >
                Fit
              </button>
              <button
                type="button"
                class="chat-live-preview-ghost"
                :class="{ 'is-active': !livePreviewZoomFit && livePreviewScale === 1 }"
                @click="setLivePreviewZoom('100')"
              >
                100%
              </button>
              <button
                type="button"
                class="chat-live-preview-ghost"
                :class="{ 'is-active': !livePreviewZoomFit && livePreviewScale === 1.5 }"
                @click="setLivePreviewZoom('150')"
              >
                150%
              </button>
              <button
                type="button"
                class="chat-live-preview-ghost"
                :class="{ 'is-active': !livePreviewZoomFit && livePreviewScale === 2 }"
                @click="setLivePreviewZoom('200')"
              >
                200%
              </button>
            </template>
            <button
              v-if="livePreview"
              type="button"
              class="chat-live-preview-ghost"
              @click="saveLivePreviewImage"
            >
              Save image
            </button>
            <button
              v-if="canToggleFullscreen"
              type="button"
              class="chat-live-preview-ghost"
              @click="toggleLivePreviewFullscreen"
            >
              {{ previewIsFullscreen ? 'Exit fullscreen' : 'Enter fullscreen' }}
            </button>
            <button
              type="button"
              class="chat-live-preview-ghost"
              @click="copyLivePreviewSource"
            >
              {{ livePreviewCopied ? 'Copied source' : 'Copy source' }}
            </button>
            <DialogClose as-child>
              <button
                type="button"
                class="chat-live-preview-close"
                aria-label="Close preview"
              >
                <X class="drawer-close-icon" aria-hidden="true" />
              </button>
            </DialogClose>
          </div>
        </header>

        <section
          ref="livePreviewBody"
          class="chat-live-preview-body"
          @wheel.prevent="handlePreviewWheel"
          @mousedown="handlePreviewMouseDown"
          @contextmenu.prevent
          @dblclick="handlePreviewDblClick"
        >
          <iframe
            v-if="livePreview?.srcdoc"
            class="chat-live-preview-frame is-modal"
            :class="{ 'is-loading': livePreview.loading }"
            :style="livePreviewZoomFit ? undefined : livePreviewZoomStyle"
            sandbox="allow-scripts allow-forms"
            scrolling="no"
            :data-preview-id="livePreview.previewId || null"
            :srcdoc="livePreview.srcdoc"
          ></iframe>
          <div
            v-else-if="livePreview?.renderedMarkup"
            class="chat-live-preview-canvas"
            :class="{ 'is-fit': livePreviewZoomFit }"
            :style="livePreviewCanvasStyle"
          >
            <div
              ref="livePreviewScaleWrap"
              class="chat-live-preview-scale-wrap"
              :style="livePreviewRenderedMarkupStyle"
              v-html="livePreview.renderedMarkup"
            ></div>
          </div>
          <div v-else class="chat-live-preview-empty">
            <strong>{{ livePreview?.error ? 'Preview unavailable' : 'Preparing preview' }}</strong>
            <span>{{ livePreview?.error ? 'Showing source below.' : 'Rendering the content for fullscreen view.' }}</span>
          </div>
        </section>

        <details class="chat-live-preview-source" :open="Boolean(livePreview?.error)">
          <summary>Source</summary>
          <pre>{{ livePreview?.source || '' }}</pre>
        </details>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import './markdown-block.css';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import { X } from '@lucide/vue';
import type { ChatResourceItem } from '../../../../../types/chat';
import {
  buildHtmlPreviewDocument,
  type HtmlPreviewMessage,
  type HtmlPreviewThemeTokens,
  renderChatMarkdownResult,
  renderHighlightedCodeHtml,
  sanitizeMermaidSvg,
  sanitizeSvgPreviewMarkup,
} from './markdown.ts';
import {
  listenInlinePreviewPreferenceChange,
  readGlobalSanitizeLevel,
  readEffectiveRoleAwareInlinePreviewPreferences,
  type InlinePreviewKind,
  type RenderingRole,
  type SanitizeLevel,
  writeGlobalInlinePreviewPreference,
  writeSessionInlinePreviewOverride,
} from './inline-preview-preferences';
import { COPIED_FOR_MS, ERROR_FOR_MS, copyTextToClipboard } from './markdown-copy';
import { createUuid } from '../../shared/uuid';
import {
  mergeChatResourceItems,
  resolveMissingStudioResourcesForMarkdown,
} from './chat-resource-resolver';

const props = defineProps<{
  source: string;
  sessionKey?: string | null;
  role?: RenderingRole | null;
  resources?: ChatResourceItem[];
  forceEagerRender?: boolean;
}>();

const MARKDOWN_LAZY_RENDER_MIN_CHARS = 1600;
const MARKDOWN_LAZY_RENDER_HEAVY_LINE_COUNT = 18;
const MARKDOWN_LAZY_RENDER_PREVIEW_LIMIT = 220;
const MARKDOWN_LAZY_RENDER_ROOT_MARGIN = '900px 0px';
const MARKDOWN_LAZY_RENDER_IDLE_TIMEOUT_MS = 220;

type PreviewKind = 'mermaid' | 'html' | 'svg';

type MermaidRenderResult = {
  svg: string;
};

type MermaidModule = {
  initialize(config: Record<string, unknown>): void;
  render(id: string, source: string): Promise<MermaidRenderResult | string>;
};

type KatexApi = {
  renderToString(source: string, options: {
    displayMode: boolean;
    throwOnError: boolean;
    strict: 'ignore';
    trust: boolean;
    output: 'htmlAndMathml';
  }): string;
};

type HtmlPreviewPayload = {
  previewId: string;
  srcdoc: string;
};

type PreviewRenderResult = {
  renderedMarkup: string;
  srcdoc: string;
  previewId: string;
};

type LivePreviewState = {
  token: string;
  kind: PreviewKind;
  title: string;
  source: string;
  renderedMarkup: string;
  srcdoc: string;
  previewId: string;
  loading: boolean;
  error: boolean;
};

const root = ref<HTMLElement | null>(null);
const livePreviewDialog = ref<HTMLElement | null>(null);
const livePreviewBody = ref<HTMLElement | null>(null);
const livePreviewScaleWrap = ref<HTMLElement | null>(null);
const renderReady = ref(false);
const renderReadyPending = ref(false);
function isHeavyMarkdownSource(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) {
    return false;
  }
  if (normalized.length >= MARKDOWN_LAZY_RENDER_MIN_CHARS) {
    return true;
  }
  if (/```/.test(normalized)) {
    return true;
  }
  if (/<(?:table|svg|iframe|pre|code|details|summary|article|section|div)\b/i.test(normalized)) {
    return true;
  }
  if (
    /^\s*\|.+\|\s*$/m.test(normalized)
    && /^\s*\|?[\s:-]+\|[\s|:-]*$/m.test(normalized)
  ) {
    return true;
  }
  return normalized.split(/\r?\n/).length >= MARKDOWN_LAZY_RENDER_HEAVY_LINE_COUNT;
}
const shouldLazyRender = computed(() => !props.forceEagerRender && isHeavyMarkdownSource(props.source));
const deferredPreviewText = computed(() => {
  const normalized = props.source.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return 'Tap to render';
  }
  return normalized.length > MARKDOWN_LAZY_RENDER_PREVIEW_LIMIT
    ? `${normalized.slice(0, MARKDOWN_LAZY_RENDER_PREVIEW_LIMIT - 1)}…`
    : normalized;
});
const resolvedStudioResources = ref<ChatResourceItem[]>([]);
const effectiveRenderResources = computed(() => mergeChatResourceItems(props.resources, resolvedStudioResources.value));
const rendered = computed(() =>
  renderReady.value || !shouldLazyRender.value
    ? renderChatMarkdownResult(props.source, {
      interactive: true,
      inlineHtml: inlinePreviewPrefs.value.inlineHtml,
      inlineSvg: inlinePreviewPrefs.value.inlineSvg,
      inlineScript: inlinePreviewPrefs.value.inlineScript,
      sanitizeLevel: sanitizeLevel.value,
      resources: effectiveRenderResources.value,
    })
    : {
      html: '',
      hasMermaid: false,
      hasMath: false,
      hasPreviewBlocks: false,
    }
);
const livePreview = ref<LivePreviewState | null>(null);
const livePreviewCopied = ref(false);
const previewIsFullscreen = ref(false);
const livePreviewZoomFit = ref(true);
const livePreviewScale = ref(1);
const livePreviewNaturalSize = ref({
  width: 0,
  height: 0,
});
const isDragging = ref(false);
const dragStart = ref({
  x: 0,
  y: 0,
  scrollLeft: 0,
  scrollTop: 0,
});
const inlinePreviewPrefs = ref<Record<InlinePreviewKind, boolean>>({
  mermaid: true,
  html: true,
  svg: true,
  inlineHtml: true,
  inlineSvg: true,
  inlineScript: false,
});
const sanitizeLevel = ref<SanitizeLevel>('strict');

let themeObserver: MutationObserver | null = null;
let mermaidLoader: Promise<MermaidModule> | null = null;
let previewCopyTimer: number | null = null;
let previousBodyOverflow = '';
let bodyOverflowLocked = false;
let stopInlinePreviewPrefListener: (() => void) | null = null;
let enhanceDebounceTimer: number | null = null;
let livePreviewReturnFocusTarget: HTMLElement | null = null;
let renderVisibilityObserver: IntersectionObserver | null = null;
let renderReadyTimer: number | null = null;
let renderReadyIdleHandle: number | null = null;
let katexLoader: Promise<KatexApi> | null = null;
let resourceResolveSerial = 0;

function refreshInlinePreviewPrefs(): void {
  inlinePreviewPrefs.value = readEffectiveRoleAwareInlinePreviewPreferences(props.role, props.sessionKey);
  sanitizeLevel.value = readGlobalSanitizeLevel();
}

function debouncedEnhanceMarkdown(): void {
  if (!renderReady.value) {
    return;
  }
  if (enhanceDebounceTimer != null) {
    window.clearTimeout(enhanceDebounceTimer);
  }
  enhanceDebounceTimer = window.setTimeout(() => {
    enhanceDebounceTimer = null;
    void enhanceMarkdown();
  }, 80);
}

const canToggleFullscreen = typeof document !== 'undefined'
  && typeof document.documentElement.requestFullscreen === 'function';
const canAdjustLivePreviewZoom = computed(() => {
  return livePreview.value != null;
});
const livePreviewUsesTransformScale = computed(() => {
  const preview = livePreview.value;
  return Boolean(
    preview
      && !livePreviewZoomFit.value
      && preview.renderedMarkup
      && (preview.kind === 'mermaid' || preview.kind === 'svg'),
  );
});
const livePreviewZoomStyle = computed<Record<string, string> | undefined>(() => {
  if (livePreviewZoomFit.value) {
    return undefined;
  }
  return {
    zoom: String(livePreviewScale.value),
    transformOrigin: 'top left',
  };
});
const livePreviewCanvasStyle = computed<Record<string, string> | undefined>(() => {
  if (!livePreviewUsesTransformScale.value) {
    return undefined;
  }
  const { width, height } = livePreviewNaturalSize.value;
  if (!width || !height) {
    return undefined;
  }
  const scaledWidth = Math.ceil(width * livePreviewScale.value) + 36;
  const scaledHeight = Math.ceil(height * livePreviewScale.value) + 36;
  return {
    width: `${scaledWidth}px`,
    minWidth: `${scaledWidth}px`,
    height: `${scaledHeight}px`,
    minHeight: `${scaledHeight}px`,
  };
});
const livePreviewRenderedMarkupStyle = computed<Record<string, string> | undefined>(() => {
  if (livePreviewZoomFit.value) {
    return undefined;
  }
  if (!livePreviewUsesTransformScale.value) {
    return livePreviewZoomStyle.value;
  }
  const { width, height } = livePreviewNaturalSize.value;
  const style: Record<string, string> = {
    transform: `scale(${livePreviewScale.value})`,
    transformOrigin: 'top left',
  };
  if (width > 0) {
    style.width = `${width}px`;
  }
  if (height > 0) {
    style.height = `${height}px`;
  }
  return style;
});

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function readCssToken(names: string[], fallback: string): string {
  const host = livePreviewDialog.value || root.value || document.documentElement;
  const computed = getComputedStyle(host);
  for (const name of names) {
    const value = computed.getPropertyValue(name).trim();
    if (value) return value;
  }
  return fallback;
}

function readHtmlPreviewThemeTokens(): HtmlPreviewThemeTokens {
  return {
    background: readCssToken(['--modal-panel-bg', '--chat-modal-bg', '--surface-base'], 'Canvas'),
    text: readCssToken(['--text', '--mono-ink', '--text-primary'], 'CanvasText'),
    border: readCssToken(['--line', '--mono-line', '--border-subtle'], 'ButtonBorder'),
  };
}

function unbindMarkdownVisibilityObserver(): void {
  renderVisibilityObserver?.disconnect();
  renderVisibilityObserver = null;
}

function clearScheduledMarkdownRenderReady(): void {
  if (renderReadyTimer != null) {
    window.clearTimeout(renderReadyTimer);
    renderReadyTimer = null;
  }
  if (
    renderReadyIdleHandle != null
    && typeof window !== 'undefined'
    && 'cancelIdleCallback' in window
  ) {
    window.cancelIdleCallback(renderReadyIdleHandle);
    renderReadyIdleHandle = null;
  }
  renderReadyPending.value = false;
}

function ensureMarkdownRenderReady(): void {
  if (renderReady.value) {
    return;
  }
  clearScheduledMarkdownRenderReady();
  renderReady.value = true;
  unbindMarkdownVisibilityObserver();
}

function scheduleMarkdownRenderReady(): void {
  if (renderReady.value || renderReadyPending.value) {
    return;
  }
  renderReadyPending.value = true;
  const run = () => {
    renderReadyTimer = null;
    renderReadyIdleHandle = null;
    renderReadyPending.value = false;
    ensureMarkdownRenderReady();
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    renderReadyIdleHandle = window.requestIdleCallback(() => {
      run();
    }, { timeout: MARKDOWN_LAZY_RENDER_IDLE_TIMEOUT_MS });
    return;
  }
  renderReadyTimer = window.setTimeout(run, 80);
}

function bindMarkdownVisibilityObserver(): void {
  if (
    renderReady.value
    || !shouldLazyRender.value
    || typeof IntersectionObserver === 'undefined'
  ) {
    renderReady.value = true;
    return;
  }
  unbindMarkdownVisibilityObserver();
  const element = root.value;
  if (!element) {
    return;
  }
  renderVisibilityObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry?.isIntersecting) {
      return;
    }
    scheduleMarkdownRenderReady();
  }, {
    root: null,
    rootMargin: MARKDOWN_LAZY_RENDER_ROOT_MARGIN,
    threshold: 0,
  });
  renderVisibilityObserver.observe(element);
}

function currentMermaidTheme(): string {
  return currentTheme() === 'light' ? 'default' : 'dark';
}

function mermaidRenderConfig(): Record<string, unknown> {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: currentMermaidTheme(),
    themeVariables: {
      fontFamily: '"Avenir Next", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
      fontSize: '14px',
    },
    flowchart: {
      useMaxWidth: true,
      // Use pure SVG text instead of foreignObject HTML labels.
      // This avoids bubble/page CSS leaking into Mermaid node labels.
      htmlLabels: false,
    },
  };
}

function nextPreviewToken(): string {
  return createUuid('preview');
}

function nextMermaidRenderId(): string {
  return `openclaw-studio-mermaid-${nextPreviewToken()}`;
}

function isInlinePreviewEnabled(kind: PreviewKind): boolean {
  return inlinePreviewPrefs.value[kind];
}

function syncInlinePreviewToggleButtons(container: ParentNode): void {
  const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('.chat-live-preview-toggle-button'));
  buttons.forEach((button) => {
    const kind = button.dataset.previewKind;
    if (kind !== 'html' && kind !== 'svg' && kind !== 'inlineScript') {
      return;
    }
    const enabled = inlinePreviewPrefs.value[kind];
    if (kind === 'inlineScript') {
      button.textContent = enabled ? 'Script on' : 'Script off';
      button.title = enabled ? 'Disable inline <script> tags' : 'Enable inline <script> tags';
    } else {
      button.textContent = enabled ? 'Preview on' : 'Preview off';
      button.title = enabled ? 'Disable inline preview for this session' : 'Enable inline preview for this session';
    }
    button.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    button.classList.toggle('is-active', enabled);
  });
}

function setLivePreviewZoom(mode: 'fit' | '100' | '150' | '200'): void {
  if (mode === 'fit') {
    livePreviewZoomFit.value = true;
    livePreviewScale.value = 1;
  } else {
    livePreviewZoomFit.value = false;
    livePreviewScale.value = mode === '100' ? 1 : mode === '150' ? 1.5 : 2;
  }
}

function resetLivePreviewViewport(): void {
  const body = livePreviewBody.value;
  if (!body) {
    return;
  }
  body.scrollLeft = 0;
  body.scrollTop = 0;
  body.classList.remove('is-panning');
}

function resetLivePreviewNaturalSize(): void {
  livePreviewNaturalSize.value = {
    width: 0,
    height: 0,
  };
}

function rememberLivePreviewFocus(): void {
  if (typeof document === 'undefined') {
    livePreviewReturnFocusTarget = null;
    return;
  }
  const activeElement = document.activeElement;
  livePreviewReturnFocusTarget = activeElement instanceof HTMLElement ? activeElement : null;
}

function restoreLivePreviewFocus(): void {
  if (typeof document === 'undefined') {
    livePreviewReturnFocusTarget = null;
    return;
  }

  const dialog = livePreviewDialog.value;
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && dialog?.contains(activeElement)) {
    activeElement.blur();
  }

  const restoreTarget = livePreviewReturnFocusTarget;
  livePreviewReturnFocusTarget = null;
  window.setTimeout(() => {
    if (restoreTarget && restoreTarget.isConnected) {
      restoreTarget.focus({ preventScroll: true });
      return;
    }

    const fallback = root.value;
    if (!fallback) {
      return;
    }

    const hadTabindex = fallback.hasAttribute('tabindex');
    if (!hadTabindex) {
      fallback.setAttribute('tabindex', '-1');
    }
    fallback.focus({ preventScroll: true });
    if (!hadTabindex) {
      window.setTimeout(() => {
        if (fallback.isConnected && fallback.getAttribute('tabindex') === '-1') {
          fallback.removeAttribute('tabindex');
        }
      }, 0);
    }
  }, 0);
}

function focusLivePreviewSurface(): void {
  livePreviewDialog.value?.focus({ preventScroll: true });
}

function readLivePreviewSvgNaturalSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox?.baseVal;
  if (
    viewBox
    && Number.isFinite(viewBox.width)
    && Number.isFinite(viewBox.height)
    && viewBox.width > 0
    && viewBox.height > 0
  ) {
    return {
      width: Math.ceil(viewBox.width),
      height: Math.ceil(viewBox.height),
    };
  }

  try {
    const box = svg.getBBox();
    if (Number.isFinite(box.width) && Number.isFinite(box.height) && box.width > 0 && box.height > 0) {
      return {
        width: Math.ceil(box.width),
        height: Math.ceil(box.height),
      };
    }
  } catch {
    // Ignore browsers that cannot resolve SVG boxes during transitions.
  }

  const rect = svg.getBoundingClientRect();
  return {
    width: Math.max(1, Math.ceil(rect.width)),
    height: Math.max(1, Math.ceil(rect.height)),
  };
}

function syncLivePreviewNaturalSize(): void {
  const wrap = livePreviewScaleWrap.value;
  if (!wrap) {
    resetLivePreviewNaturalSize();
    return;
  }

  const svg = wrap.querySelector('svg');
  if (svg instanceof SVGSVGElement) {
    livePreviewNaturalSize.value = readLivePreviewSvgNaturalSize(svg);
    return;
  }

  const width = Math.ceil(wrap.scrollWidth || wrap.getBoundingClientRect().width || 0);
  const height = Math.ceil(wrap.scrollHeight || wrap.getBoundingClientRect().height || 0);
  livePreviewNaturalSize.value = {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

async function syncLivePreviewNaturalSizeAfterRender(): Promise<void> {
  await nextTick();
  syncLivePreviewNaturalSize();
}

function syncPreviewFullscreenState(): void {
  const dialog = livePreviewDialog.value;
  previewIsFullscreen.value = Boolean(dialog && document.fullscreenElement === dialog);
}

async function exitPreviewFullscreen(): Promise<void> {
  if (!previewIsFullscreen.value || document.fullscreenElement !== livePreviewDialog.value) {
    return;
  }

  try {
    await document.exitFullscreen();
  } catch {
    previewIsFullscreen.value = false;
  }
}

async function toggleLivePreviewFullscreen(): Promise<void> {
  const dialog = livePreviewDialog.value;
  if (!dialog) {
    return;
  }

  if (document.fullscreenElement === dialog) {
    await exitPreviewFullscreen();
    return;
  }

  try {
    await dialog.requestFullscreen();
  } catch {
    previewIsFullscreen.value = false;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`Preview render timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function resetPreviewCanvas(block: HTMLElement, message = 'Rendering preview…'): void {
  const canvas = block.querySelector<HTMLElement>('.chat-mermaid-canvas');
  const status = block.querySelector<HTMLElement>('.chat-mermaid-status');
  if (!canvas || !status) {
    return;
  }

  canvas.replaceChildren();
  const placeholder = document.createElement('div');
  placeholder.className = 'chat-mermaid-placeholder';
  placeholder.textContent = 'Preview';
  const nextStatus = document.createElement('div');
  nextStatus.className = 'chat-mermaid-status';
  nextStatus.textContent = message;
  canvas.append(placeholder, nextStatus);
}

function readPreviewSource(block: HTMLElement): string {
  const code = block.querySelector<HTMLElement>('.chat-mermaid-source code');
  return code?.textContent?.trim() || '';
}

function readPreviewTitle(block: HTMLElement): string {
  return block.querySelector<HTMLElement>('.chat-mermaid-label')?.textContent?.trim() || 'Preview';
}

function readPreviewKind(block: HTMLElement): PreviewKind {
  if (block.classList.contains('preview-kind-html')) {
    return 'html';
  }
  if (block.classList.contains('preview-kind-svg')) {
    return 'svg';
  }
  return 'mermaid';
}

function resolveCopySource(button: HTMLButtonElement): string {
  const direct = button.dataset.copySource ?? button.dataset.code ?? '';
  if (direct) {
    return direct;
  }

  const previewBlock = button.closest<HTMLElement>('.chat-live-preview-block, .chat-mermaid-block');
  if (previewBlock) {
    return readPreviewSource(previewBlock);
  }

  const codeContainer = button.closest<HTMLElement>('.code-block-wrapper, .json-collapse');
  const code = codeContainer?.querySelector<HTMLElement>('pre code');
  return code?.textContent || '';
}

async function getMermaid(): Promise<MermaidModule> {
  if (!mermaidLoader) {
    mermaidLoader = import('mermaid').then((module) => (module.default ?? module) as MermaidModule);
  }
  return mermaidLoader;
}

async function getKatex(): Promise<KatexApi> {
  if (!katexLoader) {
    katexLoader = Promise.all([
      import('katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([module]) => {
      const loaded = module as typeof import('katex') & { default?: KatexApi };
      return loaded.default ?? loaded;
    });
  }
  return katexLoader;
}

async function renderMathBlocks(container: HTMLElement): Promise<void> {
  const targets = Array.from(container.querySelectorAll<HTMLElement>('.chat-math:not([data-math-rendered="1"])'));
  if (!targets.length) {
    return;
  }

  let katex: KatexApi;
  try {
    katex = await getKatex();
  } catch (error) {
    console.warn('[chat] failed to load KaTeX renderer:', error);
    return;
  }

  targets.forEach((target) => {
    const source = target.dataset.mathSource?.trim() || target.textContent?.trim() || '';
    if (!source) {
      return;
    }
    const displayMode = target.dataset.mathDisplay === 'block';
    try {
      target.innerHTML = katex.renderToString(source, {
        displayMode,
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml',
      });
      target.dataset.mathRendered = '1';
      delete target.dataset.mathError;
    } catch (error) {
      console.warn('[chat] failed to render math:', error);
      target.dataset.mathError = '1';
    }
  });
}

async function renderMermaidSvg(source: string): Promise<string> {
  const mermaid = await getMermaid();
  mermaid.initialize(mermaidRenderConfig());

  const renderId = nextMermaidRenderId();
  const renderResult = await withTimeout(mermaid.render(renderId, source), 8000);
  const svg = typeof renderResult === 'string' ? renderResult : renderResult.svg;
  const sanitizedSvg = sanitizeMermaidSvg(svg).trim();
  if (!sanitizedSvg) {
    throw new Error('Empty Mermaid render result');
  }

  return sanitizedSvg;
}

function renderSvgMarkup(source: string): string {
  const sanitized = sanitizeSvgPreviewMarkup(source).trim();
  if (!sanitized) {
    throw new Error('Empty SVG preview result');
  }
  return `<div class="chat-live-preview-svg">${sanitized}</div>`;
}

function renderHtmlSrcdoc(source: string): HtmlPreviewPayload {
  const normalized = source.trim();
  if (!normalized) {
    throw new Error('Empty HTML preview result');
  }
  return buildHtmlPreviewDocument(normalized, currentTheme(), readHtmlPreviewThemeTokens());
}

async function renderPreviewResult(kind: PreviewKind, source: string): Promise<PreviewRenderResult> {
  if (kind === 'mermaid') {
    return {
      renderedMarkup: await renderMermaidSvg(source),
      srcdoc: '',
      previewId: '',
    };
  }

  if (kind === 'svg') {
    return {
      renderedMarkup: renderSvgMarkup(source),
      srcdoc: '',
      previewId: '',
    };
  }

  const htmlPreview = renderHtmlSrcdoc(source);
  return {
    renderedMarkup: '',
    srcdoc: htmlPreview.srcdoc,
    previewId: htmlPreview.previewId,
  };
}

function applyHtmlFrameHeight(previewId: string, height: number): void {
  if (!previewId || !Number.isFinite(height)) {
    return;
  }

  const frames = document.querySelectorAll<HTMLIFrameElement>(`iframe[data-preview-id="${previewId}"]`);
  frames.forEach((frame) => {
    frame.style.height = `${Math.max(48, Math.ceil(height))}px`;
    frame.classList.remove('is-loading');
    frame.dataset.loaded = '1';
  });
}

function applyPreviewToCanvas(block: HTMLElement, kind: PreviewKind, result: PreviewRenderResult): void {
  const canvas = block.querySelector<HTMLElement>('.chat-mermaid-canvas');
  if (!canvas) {
    return;
  }

  canvas.replaceChildren();

  if (result.srcdoc) {
    const frame = document.createElement('iframe');
    frame.className = 'chat-live-preview-frame is-bubble is-loading';
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.setAttribute('scrolling', 'no');
    frame.dataset.previewId = result.previewId;
    frame.style.height = '120px';
    frame.srcdoc = result.srcdoc;
    canvas.appendChild(frame);
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = kind === 'svg' ? 'chat-live-preview-svg' : 'chat-mermaid-svg';
  wrapper.innerHTML = result.renderedMarkup;
  canvas.appendChild(wrapper);
}

function applyCodeFallbackToCanvas(block: HTMLElement, kind: PreviewKind, source: string): void {
  const canvas = block.querySelector<HTMLElement>('.chat-mermaid-canvas');
  if (!canvas) {
    return;
  }

  canvas.replaceChildren();
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block-wrapper chat-inline-code-fallback';
  wrapper.innerHTML = renderHighlightedCodeHtml(source, kind);
  canvas.appendChild(wrapper);
}

async function renderPreviewBlock(block: HTMLElement): Promise<void> {
  const source = readPreviewSource(block);
  if (!source) {
    return;
  }

  const kind = readPreviewKind(block);
  const sourceDetails = block.querySelector<HTMLDetailsElement>('.chat-mermaid-source');

  syncInlinePreviewToggleButtons(block);

  if (!isInlinePreviewEnabled(kind)) {
    delete block.dataset.rendered;
    delete block.dataset.rendering;
    delete block.dataset.error;
    block.dataset.inlineDisabled = '1';
    if (kind === 'mermaid' || kind === 'html' || kind === 'svg') {
      applyCodeFallbackToCanvas(block, kind, source);
    } else {
      resetPreviewCanvas(block, 'Inline preview off');
    }
    if (sourceDetails) {
      sourceDetails.open = false;
    }
    return;
  }

  if (block.dataset.rendered === '1' || block.dataset.rendering === '1') {
    return;
  }

  block.dataset.rendering = '1';
  const status = block.querySelector<HTMLElement>('.chat-mermaid-status');
  if (status) {
    status.textContent = kind === 'mermaid' ? 'Rendering diagram…' : 'Rendering preview…';
  }

  try {
    const result = await renderPreviewResult(kind, source);
    applyPreviewToCanvas(block, kind, result);
    block.dataset.rendered = '1';
    block.dataset.seamless = '1';
    delete block.dataset.inlineDisabled;
    delete block.dataset.error;
    const nextStatus = block.querySelector<HTMLElement>('.chat-mermaid-status');
    if (nextStatus) {
      nextStatus.textContent = 'Preview';
    }
  } catch {
    block.dataset.error = '1';
    resetPreviewCanvas(block, 'Source preview');
    if (sourceDetails) {
      sourceDetails.open = true;
    }
  } finally {
    delete block.dataset.rendering;
  }
}

async function renderPreviewBlocks(container: HTMLElement): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.chat-live-preview-block, .chat-mermaid-block'));
  if (!blocks.length) {
    return;
  }
  syncInlinePreviewToggleButtons(container);
  await Promise.allSettled(blocks.map((block) => renderPreviewBlock(block)));
}

function shouldWrapStandaloneSvg(target: SVGSVGElement): boolean {
  if (
    target.closest('[data-inline-html-root="1"]')
    || target.closest('[data-inline-preview-shell="1"]')
    || target.closest('.chat-live-preview-block')
    || target.closest('.chat-mermaid-block')
    || target.closest('p, li, a, button, summary, th, td')
  ) {
    return false;
  }
  return true;
}

function buildInlinePreviewToolbar(kind: PreviewKind): HTMLDivElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'chat-inline-preview-toolbar';

  const actions: Array<{ action: 'preview' | 'copy' | 'save'; label: string }> = [
    { action: 'preview', label: 'Preview' },
    { action: 'copy', label: 'Copy' },
    { action: 'save', label: 'Save' },
  ];

  actions.forEach((item) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-inline-preview-trigger';
    button.dataset.inlinePreviewButton = '1';
    button.dataset.inlinePreviewAction = item.action;
    button.dataset.inlinePreviewKind = kind;
    button.setAttribute('aria-label', `${item.label} ${kind.toUpperCase()} block`);
    button.textContent = item.label;
    toolbar.appendChild(button);
  });

  return toolbar;
}

function buildInlineOverflowViewport(kind: 'html' | 'svg'): HTMLDivElement {
  const viewport = document.createElement('div');
  viewport.className = `chat-inline-overflow-viewport kind-${kind}`;
  viewport.dataset.inlineOverflowViewport = '1';
  return viewport;
}

function stripInlinePreviewRuntimeArtifacts(node: Element): void {
  node.removeAttribute('data-inline-preview-target');
  node.removeAttribute('data-inline-html-root');
  node.removeAttribute('data-inline-svg-root');
  node.removeAttribute('data-inline-overflow-viewport');
  node.removeAttribute('data-inline-preview-shell');

  const className = node.getAttribute('class');
  if (className) {
    const nextClassName = className
      .split(/\s+/)
      .filter((token) => token && token !== 'chat-inline-svg-root')
      .join(' ');
    if (nextClassName) {
      node.setAttribute('class', nextClassName);
    } else {
      node.removeAttribute('class');
    }
  }

  Array.from(node.children).forEach((child) => {
    stripInlinePreviewRuntimeArtifacts(child);
  });
}

function serializeInlinePreviewMarkup(target: Element): string {
  const clone = target.cloneNode(true);
  if (!(clone instanceof Element)) {
    return target.outerHTML;
  }
  stripInlinePreviewRuntimeArtifacts(clone);
  if (clone instanceof SVGSVGElement && !clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  return clone.outerHTML;
}

function installTableOverflowGuards(container: HTMLElement): void {
  const tables = Array.from(container.querySelectorAll<HTMLTableElement>('table'));
  tables.forEach((table) => {
    if (
      table.closest('.chat-markdown-table-wrap')
      || table.closest('.chat-live-preview-block')
      || table.closest('.chat-mermaid-block')
      || table.closest('.chat-mermaid-source')
      || table.closest('th, td')
    ) {
      return;
    }

    const viewport = document.createElement('div');
    viewport.className = 'chat-markdown-table-wrap';
    viewport.dataset.inlineOverflowViewport = '1';
    table.replaceWith(viewport);
    viewport.append(table);
  });
}

function installInlinePreviewAffordances(container: HTMLElement): void {
  const htmlRoots = Array.from(container.querySelectorAll<HTMLElement>('[data-inline-html-root="1"]'));
  htmlRoots.forEach((target) => {
    if (target.closest('[data-inline-preview-shell="1"]')) {
      return;
    }
    target.dataset.inlinePreviewTarget = '1';
    const shell = document.createElement('div');
    shell.className = 'chat-inline-preview-shell kind-html';
    shell.dataset.inlinePreviewShell = '1';
    shell.dataset.inlinePreviewKind = 'html';
    const viewport = buildInlineOverflowViewport('html');

    target.replaceWith(shell);
    shell.append(viewport, buildInlinePreviewToolbar('html'));
    viewport.append(target);
  });

  const svgRoots = Array.from(container.querySelectorAll<SVGSVGElement>('svg[data-inline-svg-root="1"]'));
  svgRoots.forEach((target) => {
    if (!shouldWrapStandaloneSvg(target)) {
      return;
    }
    target.dataset.inlinePreviewTarget = '1';
    const shell = document.createElement('div');
    shell.className = 'chat-inline-preview-shell kind-svg';
    shell.dataset.inlinePreviewShell = '1';
    shell.dataset.inlinePreviewKind = 'svg';
    const viewport = buildInlineOverflowViewport('svg');

    target.replaceWith(shell);
    shell.append(viewport, buildInlinePreviewToolbar('svg'));
    viewport.append(target);
  });
}

async function enhanceMarkdown(): Promise<void> {
  if (!renderReady.value) {
    return;
  }
  await nextTick();
  const container = root.value;
  if (!container) {
    return;
  }
  if (rendered.value.hasMath) {
    await renderMathBlocks(container);
  }
  installTableOverflowGuards(container);
  installInlinePreviewAffordances(container);
  if (!rendered.value.hasPreviewBlocks) {
    return;
  }
  await renderPreviewBlocks(container);
}

async function rerenderPreviewBlocksForTheme(): Promise<void> {
  await nextTick();
  const container = root.value;
  if (!container || !rendered.value.hasPreviewBlocks) {
    return;
  }

  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.chat-live-preview-block, .chat-mermaid-block'));
  blocks.forEach((block) => {
    delete block.dataset.rendered;
    delete block.dataset.rendering;
    delete block.dataset.error;
    resetPreviewCanvas(block);
  });
  await renderPreviewBlocks(container);

  const current = livePreview.value;
  if (!current) {
    return;
  }

  const refreshedState: LivePreviewState = {
    ...current,
    token: nextPreviewToken(),
    renderedMarkup: '',
    srcdoc: '',
    previewId: '',
    loading: true,
    error: false,
  };
  livePreview.value = refreshedState;

  try {
    const result = await renderPreviewResult(refreshedState.kind, refreshedState.source);
    if (livePreview.value?.token !== refreshedState.token) {
      return;
    }
    livePreview.value = {
      ...refreshedState,
      renderedMarkup: result.renderedMarkup,
      srcdoc: result.srcdoc,
      previewId: result.previewId,
      loading: false,
      error: false,
    };
  } catch {
    if (livePreview.value?.token !== refreshedState.token) {
      return;
    }
    livePreview.value = {
      ...refreshedState,
      loading: false,
      error: true,
    };
  }
}

function applyCopyFeedback(button: HTMLButtonElement, copied: boolean): void {
  if (copied) {
    delete button.dataset.error;
    button.classList.add('copied');
    window.setTimeout(() => {
      button.classList.remove('copied');
    }, COPIED_FOR_MS);
    return;
  }

  button.dataset.error = '1';
  window.setTimeout(() => {
    delete button.dataset.error;
  }, ERROR_FOR_MS);
}

function resetPreviewCopyState(): void {
  livePreviewCopied.value = false;
  if (previewCopyTimer != null) {
    window.clearTimeout(previewCopyTimer);
    previewCopyTimer = null;
  }
}

async function openLivePreview(block: HTMLElement): Promise<void> {
  const source = readPreviewSource(block);
  if (!source) {
    return;
  }

  rememberLivePreviewFocus();
  const state: LivePreviewState = {
    token: nextPreviewToken(),
    kind: readPreviewKind(block),
    title: readPreviewTitle(block),
    source,
    renderedMarkup: '',
    srcdoc: '',
    previewId: '',
    loading: true,
    error: false,
  };
  livePreview.value = state;
  resetPreviewCopyState();
  resetLivePreviewNaturalSize();
  livePreviewZoomFit.value = true;
  livePreviewScale.value = 1;
  await nextTick();
  resetLivePreviewViewport();

  try {
    const result = await renderPreviewResult(state.kind, state.source);
    if (livePreview.value?.token !== state.token) {
      return;
    }
    livePreview.value = {
      ...state,
      renderedMarkup: result.renderedMarkup,
      srcdoc: result.srcdoc,
      previewId: result.previewId,
      loading: false,
      error: false,
    };
  } catch {
    if (livePreview.value?.token !== state.token) {
      return;
    }
    livePreview.value = {
      ...state,
      loading: false,
      error: true,
    };
  }
}

async function openStandalonePreview(
  kind: PreviewKind,
  source: string,
  title: string,
): Promise<void> {
  if (!source.trim()) {
    return;
  }

  rememberLivePreviewFocus();
  const state: LivePreviewState = {
    token: nextPreviewToken(),
    kind,
    title,
    source,
    renderedMarkup: '',
    srcdoc: '',
    previewId: '',
    loading: true,
    error: false,
  };
  livePreview.value = state;
  resetPreviewCopyState();
  resetLivePreviewNaturalSize();
  livePreviewZoomFit.value = true;
  livePreviewScale.value = 1;
  await nextTick();
  resetLivePreviewViewport();

  try {
    const result = await renderPreviewResult(state.kind, state.source);
    if (livePreview.value?.token !== state.token) {
      return;
    }
    livePreview.value = {
      ...state,
      renderedMarkup: result.renderedMarkup,
      srcdoc: result.srcdoc,
      previewId: result.previewId,
      loading: false,
      error: false,
    };
  } catch {
    if (livePreview.value?.token !== state.token) {
      return;
    }
    livePreview.value = {
      ...state,
      loading: false,
      error: true,
    };
  }
}

function closeLivePreview(): void {
  void exitPreviewFullscreen();
  livePreview.value = null;
  resetPreviewCopyState();
  resetLivePreviewNaturalSize();
  livePreviewZoomFit.value = true;
  livePreviewScale.value = 1;
  isDragging.value = false;
  resetLivePreviewViewport();
}

function handleLivePreviewOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    closeLivePreview();
  }
}

function handleLivePreviewOpenAutoFocus(event: Event): void {
  event.preventDefault();
  void nextTick(() => {
    focusLivePreviewSurface();
  });
}

function handleLivePreviewCloseAutoFocus(event: Event): void {
  event.preventDefault();
  restoreLivePreviewFocus();
}

function handleLivePreviewEscapeKeyDown(event: Event): void {
  if (previewIsFullscreen.value) {
    event.preventDefault();
  }
}

async function copyLivePreviewSource(): Promise<void> {
  const source = livePreview.value?.source || '';
  if (!source) {
    return;
  }

  const copied = await copyTextToClipboard(source);
  if (!copied) {
    return;
  }

  livePreviewCopied.value = true;
  if (previewCopyTimer != null) {
    window.clearTimeout(previewCopyTimer);
  }
  previewCopyTimer = window.setTimeout(() => {
    livePreviewCopied.value = false;
    previewCopyTimer = null;
  }, COPIED_FOR_MS);
}

/* ── Preview zoom/drag event handlers ── */

function handlePreviewWheel(event: WheelEvent): void {
  const delta = event.deltaY > 0 ? -0.15 : 0.15;
  livePreviewScale.value = Math.max(0.25, Math.min(4, livePreviewScale.value + delta));
  livePreviewZoomFit.value = false;
}

function handlePreviewMouseDown(event: MouseEvent): void {
  if (event.button !== 2) return;
  const body = livePreviewBody.value;
  if (!body) {
    return;
  }
  event.preventDefault();
  isDragging.value = true;
  dragStart.value = {
    x: event.clientX,
    y: event.clientY,
    scrollLeft: body.scrollLeft,
    scrollTop: body.scrollTop,
  };
  body.classList.add('is-panning');
}

function handlePreviewMouseMove(event: MouseEvent): void {
  if (!isDragging.value) return;
  const body = livePreviewBody.value;
  if (!body) {
    return;
  }
  event.preventDefault();
  const deltaX = event.clientX - dragStart.value.x;
  const deltaY = event.clientY - dragStart.value.y;
  body.scrollLeft = dragStart.value.scrollLeft - deltaX;
  body.scrollTop = dragStart.value.scrollTop - deltaY;
}

function handlePreviewMouseUp(): void {
  isDragging.value = false;
  livePreviewBody.value?.classList.remove('is-panning');
}

function handlePreviewDblClick(): void {
  livePreviewScale.value = 1;
  resetLivePreviewViewport();
}

/* ── Save as image export ── */

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function readLivePreviewExportBackground(): string {
  return readCssToken(['--modal-panel-bg', '--chat-modal-bg', '--surface-base'], 'Canvas');
}

function prepareOffscreenPreviewContainer(container: HTMLElement): void {
  Object.assign(container.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: '800px',
    background: readLivePreviewExportBackground(),
    padding: '16px',
  });
}

async function exportSvgToPng(svgElement: SVGSVGElement, filename: string): Promise<void> {
  // Primary: use html-to-image which handles foreignObject correctly
  try {
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(svgElement, {
      pixelRatio: 2,
      backgroundColor: readLivePreviewExportBackground(),
    });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, filename);
    return;
  } catch {
    // Fallback: download as .svg
    const clone = svgElement.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const svgString = new XMLSerializer().serializeToString(clone);
    const svgFilename = filename.replace(/\.png$/, '.svg');
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    downloadBlob(blob, svgFilename);
  }
}

async function exportHtmlToPng(htmlSource: string, filename: string): Promise<void> {
  const { toPng } = await import('html-to-image');
  const container = document.createElement('div');
  prepareOffscreenPreviewContainer(container);
  container.innerHTML = htmlSource;
  document.body.appendChild(container);
  try {
    const dataUrl = await toPng(container, { pixelRatio: 2 });
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    downloadBlob(blob, filename);
  } finally {
    document.body.removeChild(container);
  }
}

async function saveLivePreviewImage(): Promise<void> {
  const preview = livePreview.value;
  if (!preview) return;

  const filename = `openclaw-${preview.kind}-${Date.now()}.png`;

  if (preview.kind === 'html') {
    await exportHtmlToPng(preview.source, filename);
    return;
  }

  const body = livePreviewDialog.value?.querySelector('.chat-live-preview-body');
  const svg = body?.querySelector('svg');
  if (svg) {
    await exportSvgToPng(svg as SVGSVGElement, filename);
  }
}

async function saveInlinePreviewImage(block: HTMLElement, kind: PreviewKind): Promise<void> {
  const filename = `openclaw-${kind}-${Date.now()}.png`;

  if (kind === 'html') {
    const source = readPreviewSource(block);
    await exportHtmlToPng(source, filename);
    return;
  }

  const svg = block.querySelector('svg');
  if (svg) {
    await exportSvgToPng(svg as SVGSVGElement, filename);
  }
}

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target as HTMLElement | null;

  const inlinePreviewButton = target?.closest<HTMLButtonElement>('[data-inline-preview-button="1"]');
  if (inlinePreviewButton && root.value?.contains(inlinePreviewButton)) {
    const shell = inlinePreviewButton.closest<HTMLElement>('[data-inline-preview-shell="1"]');
    const previewTarget = shell?.querySelector<HTMLElement>('[data-inline-preview-target="1"]');
    const kind = (inlinePreviewButton.dataset.inlinePreviewKind || shell?.dataset.inlinePreviewKind) as PreviewKind | undefined;
    const action = inlinePreviewButton.dataset.inlinePreviewAction || 'preview';
    if (!previewTarget || !kind) {
      return;
    }

    if (action === 'copy') {
      const source = serializeInlinePreviewMarkup(previewTarget);
      inlinePreviewButton.disabled = true;
      const copied = await copyTextToClipboard(source);
      if (inlinePreviewButton.isConnected) {
        inlinePreviewButton.disabled = false;
        applyCopyFeedback(inlinePreviewButton, copied);
      }
      return;
    }

    if (action === 'save') {
      try {
        const source = serializeInlinePreviewMarkup(previewTarget);
        if (kind === 'html') {
          await exportHtmlToPng(source, `openclaw-${kind}-${Date.now()}.png`);
        } else if (previewTarget instanceof SVGSVGElement) {
          const container = document.createElement('div');
          container.innerHTML = source;
          const svg = container.querySelector('svg');
          if (svg instanceof SVGSVGElement) {
            await exportSvgToPng(svg, `openclaw-${kind}-${Date.now()}.png`);
          }
        }
      } catch (error) {
        console.warn('[MarkdownBlock] Failed to save inline preview image:', error);
      }
      return;
    }

    if (kind === 'html') {
      await openStandalonePreview('html', serializeInlinePreviewMarkup(previewTarget), 'HTML');
      return;
    }
    if (previewTarget instanceof SVGSVGElement && kind === 'svg') {
      await openStandalonePreview('svg', serializeInlinePreviewMarkup(previewTarget), 'SVG');
      return;
    }
  }

  const saveButton = target?.closest<HTMLButtonElement>('.chat-preview-save-button');
  if (saveButton && root.value?.contains(saveButton)) {
    const previewBlock = saveButton.closest<HTMLElement>('.chat-live-preview-block, .chat-mermaid-block');
    if (previewBlock) {
      const kind = readPreviewKind(previewBlock);
      try {
        await saveInlinePreviewImage(previewBlock, kind);
      } catch (e) {
        console.warn('[MarkdownBlock] Failed to save preview image:', e);
      }
    }
    return;
  }

  const toggleButton = target?.closest<HTMLButtonElement>('.chat-live-preview-toggle-button');
  if (toggleButton && root.value?.contains(toggleButton)) {
    const kind = toggleButton.dataset.previewKind;
    if (kind === 'html' || kind === 'svg' || kind === 'inlineScript') {
      const nextEnabled = !inlinePreviewPrefs.value[kind];
      if (props.sessionKey) {
        writeSessionInlinePreviewOverride(props.sessionKey, kind, nextEnabled);
      } else {
        writeGlobalInlinePreviewPreference(kind, nextEnabled);
      }
    }
    return;
  }

  const button = target?.closest<HTMLButtonElement>('.chat-md-copy-button, .code-block-copy');
  if (button && root.value?.contains(button)) {
    const text = resolveCopySource(button);
    if (!text || button.disabled) {
      return;
    }

    button.disabled = true;
    const copied = await copyTextToClipboard(text);
    if (!button.isConnected) {
      return;
    }

    button.disabled = false;
    applyCopyFeedback(button, copied);
    return;
  }

  if (target?.closest('.chat-mermaid-source')) {
    return;
  }

  if (target?.closest('.chat-inline-code-fallback')) {
    return;
  }

  const expandTrigger = target?.closest<HTMLElement>('.chat-mermaid-expand-button, .chat-mermaid-canvas');
  if (!expandTrigger || !root.value?.contains(expandTrigger)) {
    return;
  }

  const previewBlock = expandTrigger.closest<HTMLElement>('.chat-live-preview-block, .chat-mermaid-block');
  if (!previewBlock) {
    return;
  }

  await openLivePreview(previewBlock);
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !livePreview.value) {
    return;
  }

  if (previewIsFullscreen.value) {
    return;
  }

  event.preventDefault();
  closeLivePreview();
}

function handleWindowMessage(event: MessageEvent<HtmlPreviewMessage>): void {
  const data = event.data;
  if (!data || data.type !== 'openclaw-html-preview-size') {
    return;
  }
  applyHtmlFrameHeight(data.previewId, data.height);
}

watch(
  () => rendered.value.html,
  () => {
    if (!renderReady.value) {
      return;
    }
    void enhanceMarkdown();
  },
);

watch(
  () => [props.sessionKey, props.source, props.resources, renderReady.value, shouldLazyRender.value] as const,
  async () => {
    const serial = ++resourceResolveSerial;
    if (shouldLazyRender.value && !renderReady.value) {
      resolvedStudioResources.value = [];
      return;
    }
    try {
      const nextResources = await resolveMissingStudioResourcesForMarkdown(
        props.sessionKey,
        props.source,
        props.resources,
      );
      if (serial !== resourceResolveSerial) {
        return;
      }
      resolvedStudioResources.value = nextResources;
    } catch (error) {
      if (serial !== resourceResolveSerial) {
        return;
      }
      resolvedStudioResources.value = [];
      console.warn('[MarkdownBlock] Failed to resolve studio resources:', error);
    }
  },
  { immediate: true },
);

watch(
  () => props.forceEagerRender,
  (force) => {
    if (!force) {
      return;
    }
    ensureMarkdownRenderReady();
  },
);

watch(
  () => props.source,
  () => {
    clearScheduledMarkdownRenderReady();
    renderReady.value = !shouldLazyRender.value;
    if (!renderReady.value) {
      unbindMarkdownVisibilityObserver();
      void nextTick(() => {
        bindMarkdownVisibilityObserver();
      });
      return;
    }
    void enhanceMarkdown();
  },
);

watch(
  livePreview,
  (value) => {
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

watch(
  () => [
    livePreview.value?.token,
    livePreview.value?.kind,
    livePreview.value?.renderedMarkup,
  ],
  (value) => {
    if (!value[2]) {
      resetLivePreviewNaturalSize();
      return;
    }
    void syncLivePreviewNaturalSizeAfterRender();
  },
);

onMounted(() => {
  renderReady.value = !shouldLazyRender.value;
  refreshInlinePreviewPrefs();
  stopInlinePreviewPrefListener = listenInlinePreviewPreferenceChange(({ scope, sessionKey }) => {
    if (scope !== 'global' && sessionKey !== props.sessionKey) {
      return;
    }
    refreshInlinePreviewPrefs();
    if (root.value) {
      syncInlinePreviewToggleButtons(root.value);
    }
    debouncedEnhanceMarkdown();
  });
  themeObserver = new MutationObserver((records) => {
    const themeChanged = records.some((record) => record.attributeName === 'data-theme');
    if (themeChanged) {
      void rerenderPreviewBlocksForTheme();
    }
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  window.addEventListener('keydown', handleWindowKeydown);
  window.addEventListener('mousemove', handlePreviewMouseMove);
  window.addEventListener('mouseup', handlePreviewMouseUp);
  window.addEventListener('message', handleWindowMessage);
  document.addEventListener('fullscreenchange', syncPreviewFullscreenState);
  if (renderReady.value) {
    void enhanceMarkdown();
    return;
  }
  void nextTick(() => {
    bindMarkdownVisibilityObserver();
  });
});

watch(
  () => props.sessionKey,
  () => {
    refreshInlinePreviewPrefs();
    if (root.value) {
      syncInlinePreviewToggleButtons(root.value);
    }
    void enhanceMarkdown();
  },
);

watch(
  () => props.role,
  () => {
    refreshInlinePreviewPrefs();
    if (root.value) {
      syncInlinePreviewToggleButtons(root.value);
    }
    debouncedEnhanceMarkdown();
  },
);

onBeforeUnmount(() => {
  void exitPreviewFullscreen();
  resetPreviewCopyState();
  clearScheduledMarkdownRenderReady();
  unbindMarkdownVisibilityObserver();
  if (enhanceDebounceTimer != null) {
    window.clearTimeout(enhanceDebounceTimer);
    enhanceDebounceTimer = null;
  }
  stopInlinePreviewPrefListener?.();
  stopInlinePreviewPrefListener = null;
  window.removeEventListener('keydown', handleWindowKeydown);
  window.removeEventListener('mousemove', handlePreviewMouseMove);
  window.removeEventListener('mouseup', handlePreviewMouseUp);
  window.removeEventListener('message', handleWindowMessage);
  document.removeEventListener('fullscreenchange', syncPreviewFullscreenState);
  themeObserver?.disconnect();
  if (bodyOverflowLocked && typeof document !== 'undefined') {
    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = '';
    bodyOverflowLocked = false;
  }
});
</script>
