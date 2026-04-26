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
                ×
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
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { DialogClose, DialogContent, DialogOverlay, DialogPortal, DialogRoot } from 'reka-ui';
import type { ChatResourceItem } from '../../../../../types/chat';
import {
  buildHtmlPreviewDocument,
  type HtmlPreviewMessage,
  renderChatMarkdownResult,
  renderHighlightedCodeHtml,
  sanitizeMermaidSvg,
  sanitizeSvgPreviewMarkup,
} from '../chat/markdown.ts';
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
const rendered = computed(() =>
  renderReady.value || !shouldLazyRender.value
    ? renderChatMarkdownResult(props.source, {
      interactive: true,
      inlineHtml: inlinePreviewPrefs.value.inlineHtml,
      inlineSvg: inlinePreviewPrefs.value.inlineSvg,
      inlineScript: inlinePreviewPrefs.value.inlineScript,
      sanitizeLevel: sanitizeLevel.value,
      resources: props.resources,
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
  return buildHtmlPreviewDocument(normalized, currentTheme());
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

async function exportSvgToPng(svgElement: SVGSVGElement, filename: string): Promise<void> {
  // Primary: use html-to-image which handles foreignObject correctly
  try {
    const { toPng } = await import('html-to-image');
    const dataUrl = await toPng(svgElement, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
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
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:16px;';
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

<style scoped>
.chat-markdown :deep(.chat-inline-preview-shell) {
  position: relative;
  min-width: 0;
  max-width: 100%;
}

.chat-markdown--deferred {
  display: block;
}

.chat-markdown-deferred-card {
  display: block;
  width: 100%;
  border: 1px dashed rgba(148, 163, 184, 0.36);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.03);
  padding: 12px 14px;
  text-align: left;
  color: inherit;
  cursor: pointer;
}

.chat-markdown-deferred-card strong {
  display: block;
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  opacity: 0.72;
}

.chat-markdown-deferred-card span {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.5;
  opacity: 0.82;
  word-break: break-word;
}

.chat-markdown :deep(.chat-inline-overflow-viewport) {
  min-width: 0;
  max-width: 100%;
}

.chat-markdown :deep(.chat-inline-preview-toolbar) {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: wrap;
  max-width: calc(100% - 12px);
  padding: 4px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--chat-line) 58%, transparent);
  background: color-mix(in srgb, var(--chat-modal-bg) 92%, transparent);
  backdrop-filter: blur(10px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.chat-markdown :deep(.chat-inline-preview-trigger) {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--chat-line) 60%, transparent);
  background: color-mix(in srgb, var(--chat-modal-bg) 92%, transparent);
  color: var(--chat-text-soft);
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  backdrop-filter: blur(10px);
}

.chat-markdown :deep(.chat-inline-preview-shell:hover > .chat-inline-preview-toolbar),
.chat-markdown :deep(.chat-inline-preview-trigger:focus-visible) {
  opacity: 1;
  pointer-events: auto;
}

.chat-markdown :deep(.chat-inline-preview-trigger:hover),
.chat-markdown :deep(.chat-inline-preview-trigger:focus-visible) {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-hover) 72%, transparent);
  color: var(--chat-text);
}

@media (hover: none), (pointer: coarse) {
  .chat-markdown :deep(.chat-inline-preview-shell) {
    display: grid;
    gap: 8px;
  }

  .chat-markdown :deep(.chat-inline-preview-toolbar) {
    position: static;
    justify-content: flex-end;
    flex-wrap: wrap;
    opacity: 1;
    pointer-events: auto;
  }

  .chat-markdown :deep(.chat-inline-preview-trigger) {
    min-height: 30px;
    padding: 5px 10px;
  }
}


.chat-live-preview-mask {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 8, 15, 0.8);
  backdrop-filter: blur(12px);
}

.chat-live-preview-mask[data-state='open'] {
  animation: chat-live-preview-mask-in 0.2s ease;
}

.chat-live-preview-dialog {
  position: fixed;
  z-index: 1251;
  top: 50%;
  left: 50%;
  width: min(96vw, 1480px);
  max-height: calc(100vh - 40px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  padding: 18px;
  box-sizing: border-box;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: var(--chat-modal-bg);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.22);
  overflow: hidden;
  transform: translate(-50%, -50%);
}

.chat-live-preview-dialog[data-state='open'] {
  animation: chat-live-preview-dialog-in 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes chat-live-preview-mask-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes chat-live-preview-dialog-in {
  from {
    opacity: 0;
    transform: translate(-50%, calc(-50% + 12px)) scale(0.985);
  }
  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

.chat-live-preview-dialog:fullscreen {
  top: 0;
  left: 0;
  transform: none;
  width: 100vw;
  max-width: none;
  max-height: none;
  height: 100vh;
  border-radius: 0;
  padding: 20px;
  border: none;
}

.chat-live-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  min-width: 0;
}

.chat-live-preview-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.chat-live-preview-copy strong {
  color: var(--chat-text);
  font-size: 18px;
}

.chat-live-preview-copy span {
  color: var(--chat-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.chat-live-preview-actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.chat-live-preview-ghost,
.chat-live-preview-close {
  appearance: none;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 88%, transparent);
  color: var(--chat-text);
  cursor: pointer;
}

.chat-live-preview-ghost {
  height: 38px;
  padding: 0 14px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.chat-live-preview-close {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  border-radius: 10px;
  font-size: 24px;
  line-height: 1;
}

.chat-live-preview-ghost:hover,
.chat-live-preview-ghost:focus-visible,
.chat-live-preview-close:hover,
.chat-live-preview-close:focus-visible {
  outline: none;
  border-color: color-mix(in srgb, var(--chat-accent) 34%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-modal-row) 70%, var(--chat-hover));
}

.chat-live-preview-ghost.is-active {
  border-color: color-mix(in srgb, var(--chat-accent) 38%, var(--chat-line));
  background: color-mix(in srgb, var(--chat-accent) 14%, transparent);
  color: var(--chat-text);
}

.chat-live-preview-body {
  min-height: 0;
  border-radius: 12px;
  border: 1px solid var(--chat-line);
  background: color-mix(in srgb, var(--chat-modal-row) 82%, transparent);
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}

.chat-live-preview-body.is-panning {
  cursor: grabbing;
  user-select: none;
}

.chat-live-preview-frame {
  display: block;
  width: 100%;
  min-height: 48px;
  border: none;
  box-sizing: border-box;
  background: #ffffff;
  overflow: hidden;
}

.chat-live-preview-frame.is-loading {
  background:
    linear-gradient(90deg, rgba(148, 163, 184, 0.08), rgba(148, 163, 184, 0.18), rgba(148, 163, 184, 0.08)),
    #ffffff;
  background-size: 240px 100%, auto;
  animation: chat-preview-frame-shimmer 1.4s linear infinite;
}

.chat-live-preview-frame.is-modal {
  min-height: 120px;
}

.chat-live-preview-canvas {
  width: max-content;
  min-width: 100%;
  min-height: 0;
  padding: 18px;
  box-sizing: border-box;
}

.chat-live-preview-scale-wrap {
  width: max-content;
  min-width: max-content;
  margin: 0;
}

.chat-live-preview-canvas.is-fit .chat-live-preview-scale-wrap {
  width: 100%;
  min-width: 100%;
}

.chat-live-preview-canvas :deep(svg) {
  display: block;
  width: auto;
  max-width: none;
  height: auto;
  margin: 0;
}

.chat-live-preview-canvas.is-fit :deep(svg) {
  max-width: 100%;
}

.chat-live-preview-empty {
  min-height: 240px;
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 32px 20px;
  text-align: center;
}

.chat-live-preview-empty strong {
  color: var(--chat-text);
  font-size: 16px;
}

.chat-live-preview-empty span {
  color: var(--chat-text-soft);
  font-size: 13px;
  line-height: 1.5;
}

.chat-live-preview-source {
  display: grid;
  gap: 8px;
}

.chat-live-preview-source summary {
  cursor: pointer;
  list-style: none;
  color: var(--chat-text-soft);
  font-size: 12px;
  user-select: none;
}

.chat-live-preview-source summary::-webkit-details-marker {
  display: none;
}

.chat-live-preview-source pre {
  margin: 0;
  overflow: auto;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--chat-code-bg, #020817);
  color: var(--chat-code-text, #d8e4f8);
  font-size: 12px;
  line-height: 1.6;
}

@media (max-width: 760px) {
  .chat-live-preview-mask {
    padding: 12px;
  }

  .chat-live-preview-dialog {
    width: min(100vw - 24px, 100%);
    max-height: calc(100dvh - 24px);
    padding: 14px;
    box-sizing: border-box;
    border-radius: 12px;
  }

  .chat-live-preview-head {
    flex-direction: column;
    gap: 10px;
  }

  .chat-live-preview-actions {
    width: 100%;
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 6px;
  }

  .chat-live-preview-ghost {
    height: 34px;
    padding: 0 12px;
  }

  .chat-live-preview-close {
    width: 34px;
    height: 34px;
    margin-left: auto;
    font-size: 22px;
  }

  .chat-live-preview-canvas {
    padding: 12px;
  }

  .chat-live-preview-source pre {
    max-height: 28vh;
    font-size: 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .chat-live-preview-mask[data-state='open'],
  .chat-live-preview-dialog[data-state='open'] {
    animation: none;
  }
}

@keyframes chat-preview-frame-shimmer {
  from {
    background-position: -240px 0, 0 0;
  }
  to {
    background-position: 240px 0, 0 0;
  }
}
</style>
