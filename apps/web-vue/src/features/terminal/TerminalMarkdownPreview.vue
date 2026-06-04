<template>
  <section
    ref="rootRef"
    class="terminal-doc-preview"
    :class="{
      'terminal-doc-preview--dark': dark,
      'terminal-doc-preview--editable': editable && !readOnly,
    }"
  >
    <article
      ref="documentRef"
      class="terminal-doc-preview__document"
      :contenteditable="editable && !readOnly ? 'true' : undefined"
      :aria-readonly="editable ? String(readOnly) : undefined"
      :spellcheck="editable && !readOnly ? 'true' : undefined"
      v-html="renderedHtml"
      @input="handleEditableInput"
      @change="handleEditableChange"
      @blur="handleEditableBlur"
      @click="handlePreviewClick"
      @dragover="handleMarkdownDragOver"
      @drop="handleMarkdownDrop"
      @paste="handleMarkdownPaste"
      @keydown.meta.s.prevent="emit('save')"
      @keydown.ctrl.s.prevent="emit('save')"
    ></article>
    <p
      v-if="mediaStatusMessage"
      class="terminal-doc-preview__media-status"
      :class="{ 'terminal-doc-preview__media-status--error': mediaStatusKind === 'error' }"
      role="status"
    >
      {{ mediaStatusMessage }}
    </p>
    <div
      v-if="lightbox"
      class="terminal-doc-lightbox"
      role="dialog"
      aria-modal="true"
      :aria-label="lightbox.title || props.title"
      tabindex="-1"
      @click.self="closeMarkdownLightbox"
      @keydown.esc.stop.prevent="closeMarkdownLightbox"
    >
      <div class="terminal-doc-lightbox__panel">
        <header class="terminal-doc-lightbox__bar">
          <strong>{{ lightbox.title || props.title }}</strong>
          <button type="button" @click="closeMarkdownLightbox">关闭</button>
        </header>
        <img
          v-if="lightbox.kind === 'image'"
          class="terminal-doc-lightbox__image"
          :src="lightbox.src"
          :alt="lightbox.alt || lightbox.title"
        />
        <video
          v-else-if="lightbox.kind === 'video'"
          class="terminal-doc-lightbox__video"
          :src="lightbox.src"
          controls
          playsinline
        ></video>
        <audio
          v-else
          class="terminal-doc-lightbox__audio"
          :src="lightbox.src"
          controls
        ></audio>
        <footer class="terminal-doc-lightbox__foot">
          <span>{{ lightbox.src }}</span>
          <a :href="lightbox.src" target="_blank" rel="noopener noreferrer">打开原文件</a>
        </footer>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import {
  renderHighlightedCodeHtml,
  sanitizeMermaidSvg,
  sanitizeSvgPreviewMarkup,
} from '../chat/markdown';
import { copyTextToClipboard } from '../../shared/clipboard';
import { buildFileDownloadUrl, uploadFiles } from '../files/api';
import {
  parseTerminalResourceTransfer,
  TERMINAL_RESOURCE_DRAG_MIME,
  type TerminalResourceTransferPayload,
} from './terminal-resource-transfer';

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

type TerminalPreviewPlaceholderKind = 'mermaid' | 'svg';

type TerminalPreviewPlaceholder = {
  kind: TerminalPreviewPlaceholderKind;
  source: string;
};

type TerminalMathPlaceholder = {
  displayMode: 'inline' | 'block';
  source: string;
};

type TerminalDocLightboxMediaKind = 'image' | 'video' | 'audio';

type TerminalDocLightboxState = {
  kind: TerminalDocLightboxMediaKind;
  src: string;
  title: string;
  alt: string;
};

type TerminalDocMediaSize = 'small' | 'medium' | 'large' | 'full';
type TerminalDocMediaAlign = 'left' | 'center' | 'right';

type TerminalDocMediaFragment = {
  kind: TerminalDocLightboxMediaKind | 'link';
  src: string;
  name: string;
  alt: string;
};

type TerminalMarkdownUploadItem = {
  fileName: string;
  relativePath: string;
  dataBase64: string;
};

const TERMINAL_MARKDOWN_RENDER_CACHE_LIMIT = 18;
const TERMINAL_MARKDOWN_RENDER_CACHE_MAX_SOURCE_LENGTH = 500_000;
const terminalMarkdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify, { allowDangerousHtml: true });
const terminalMarkdownRenderCache = new Map<string, string>();

const props = withDefaults(
  defineProps<{
    source: string;
    title?: string;
    dark?: boolean;
    editable?: boolean;
    readOnly?: boolean;
    assetRootId?: string;
    assetFilePath?: string;
  }>(),
  {
    title: 'Markdown Preview',
    dark: false,
    editable: false,
    readOnly: false,
    assetRootId: '',
    assetFilePath: '',
  },
);

const emit = defineEmits<{
  (e: 'update:source', value: string): void;
  (e: 'save'): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const documentRef = ref<HTMLElement | null>(null);
const renderedHtml = ref(renderTerminalMarkdownDocument(props.source));
const lightbox = ref<TerminalDocLightboxState | null>(null);
const mediaStatusMessage = ref('');
const mediaStatusKind = ref<'info' | 'error'>('info');
let mermaidLoader: Promise<MermaidModule> | null = null;
let katexLoader: Promise<KatexApi> | null = null;
let markdownRenderTimer: number | null = null;
let markdownRenderIdleHandle: number | null = null;
let mediaStatusTimer: number | null = null;
let markdownRenderSerial = 0;
let enhanceSerial = 0;
let lastEditableMarkdown = '';
const copyStatusTimersByButton = new WeakMap<HTMLButtonElement, number>();
const activeCopyStatusTimers = new Set<number>();

watch(
  () => props.source,
  (source) => {
    if (props.editable && !props.readOnly && source === lastEditableMarkdown) {
      return;
    }
    scheduleTerminalMarkdownRender();
  },
  { flush: 'post' },
);

watch(
  () => props.dark,
  () => {
    void enhancePreviewAfterRender(true);
  },
);

watch(
  () => [props.assetRootId, props.assetFilePath] as const,
  () => {
    void enhancePreviewAfterRender();
  },
  { flush: 'post' },
);

type TerminalRequestIdleCallback = (
  callback: () => void,
  options?: { timeout?: number },
) => number;
type TerminalCancelIdleCallback = (handle: number) => void;

function scheduleTerminalMarkdownRender(): void {
  const serial = ++markdownRenderSerial;
  clearScheduledTerminalMarkdownRender();
  if (typeof window === 'undefined') {
    renderedHtml.value = renderTerminalMarkdownDocument(props.source);
    return;
  }
  markdownRenderTimer = window.setTimeout(() => {
    markdownRenderTimer = null;
    requestTerminalMarkdownIdleRender(() => {
      if (serial !== markdownRenderSerial) return;
      renderedHtml.value = renderTerminalMarkdownDocument(props.source);
      void enhancePreviewAfterRender();
    });
  }, 80);
}

function requestTerminalMarkdownIdleRender(callback: () => void): void {
  if (typeof window === 'undefined') {
    callback();
    return;
  }
  const requestIdle = (window as Window & { requestIdleCallback?: TerminalRequestIdleCallback }).requestIdleCallback;
  if (requestIdle) {
    markdownRenderIdleHandle = requestIdle(() => {
      markdownRenderIdleHandle = null;
      callback();
    }, { timeout: 240 });
    return;
  }
  markdownRenderTimer = window.setTimeout(() => {
    markdownRenderTimer = null;
    callback();
  }, 16);
}

function clearScheduledTerminalMarkdownRender(): void {
  if (typeof window === 'undefined') return;
  if (markdownRenderTimer !== null) {
    window.clearTimeout(markdownRenderTimer);
    markdownRenderTimer = null;
  }
  if (markdownRenderIdleHandle !== null) {
    const cancelIdle = (window as Window & { cancelIdleCallback?: TerminalCancelIdleCallback }).cancelIdleCallback;
    if (cancelIdle) {
      cancelIdle(markdownRenderIdleHandle);
    }
    markdownRenderIdleHandle = null;
  }
}

function handleEditableInput(): void {
  if (!props.editable || props.readOnly) return;
  const documentElement = documentRef.value;
  if (!documentElement) return;
  lastEditableMarkdown = serializeEditableMarkdownDocument(documentElement);
  emit('update:source', lastEditableMarkdown);
}

function handleEditableChange(event: Event): void {
  if (!props.editable || props.readOnly) return;
  const target = event.target instanceof HTMLInputElement ? event.target : null;
  if (!target || target.type !== 'checkbox') return;
  if (!documentRef.value?.contains(target)) return;
  event.stopPropagation();
  syncEditableSourceFromDocument();
}

function handleEditableBlur(): void {
  if (!props.editable || props.readOnly) return;
  scheduleTerminalMarkdownRender();
}

function handlePreviewClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-terminal-code-copy]');
  const root = rootRef.value;
  if (button && root?.contains(button)) {
    event.preventDefault();
    event.stopPropagation();
    void copyPreviewCodeBlock(button);
    return;
  }

  const mediaAction = target?.closest<HTMLButtonElement>('button[data-terminal-media-action]');
  if (mediaAction && root?.contains(mediaAction)) {
    event.preventDefault();
    event.stopPropagation();
    applyMarkdownMediaAction(mediaAction);
    return;
  }

  const media = target?.closest<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>('img, video, audio');
  if (!media || !root?.contains(media) || media.closest('.terminal-doc-codeblock')) return;
  if (props.editable && !props.readOnly && !target?.closest('.terminal-doc-media-block__preview')) return;
  event.preventDefault();
  event.stopPropagation();
  openMarkdownMediaLightbox(media);
}

function handleMarkdownDragOver(event: DragEvent): void {
  if (!canEditMarkdownDocument()) return;
  if (!canAcceptMarkdownInsertion(event.dataTransfer)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function handleMarkdownDrop(event: DragEvent): void {
  if (!canEditMarkdownDocument()) return;
  if (!canAcceptMarkdownInsertion(event.dataTransfer)) return;
  event.preventDefault();
  event.stopPropagation();
  void insertMarkdownMediaFromDrop(event);
}

function handleMarkdownPaste(event: ClipboardEvent): void {
  if (!canEditMarkdownDocument()) return;
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length) return;
  event.preventDefault();
  event.stopPropagation();
  void insertMarkdownUploadedFiles(files);
}

async function copyPreviewCodeBlock(button: HTMLButtonElement): Promise<void> {
  const code = button
    .closest<HTMLElement>('.terminal-doc-codeblock')
    ?.querySelector<HTMLElement>('pre code')
    ?.textContent || '';
  const copied = await copyTextToClipboard(code);
  setCodeCopyStatus(button, copied ? 'copied' : 'error');
}

function setCodeCopyStatus(button: HTMLButtonElement, state: 'copied' | 'error'): void {
  button.dataset.copyState = state;
  if (typeof window === 'undefined') return;
  const existingHandle = copyStatusTimersByButton.get(button);
  if (existingHandle != null) {
    window.clearTimeout(existingHandle);
    activeCopyStatusTimers.delete(existingHandle);
  }
  const handle = window.setTimeout(() => {
    activeCopyStatusTimers.delete(handle);
    if (copyStatusTimersByButton.get(button) === handle) {
      copyStatusTimersByButton.delete(button);
    }
    if (button.isConnected && copyStatusTimersByButton.get(button) == null) {
      delete button.dataset.copyState;
    }
  }, 1400);
  copyStatusTimersByButton.set(button, handle);
  activeCopyStatusTimers.add(handle);
}

function canEditMarkdownDocument(): boolean {
  return Boolean(props.editable && !props.readOnly);
}

function syncEditableSourceFromDocument(): void {
  if (!canEditMarkdownDocument()) return;
  const documentElement = documentRef.value;
  if (!documentElement) return;
  lastEditableMarkdown = serializeEditableMarkdownDocument(documentElement);
  emit('update:source', lastEditableMarkdown);
}

function canAcceptMarkdownInsertion(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  const types = Array.from(dataTransfer.types || []);
  return dataTransfer.files.length > 0
    || types.includes(TERMINAL_RESOURCE_DRAG_MIME)
    || types.includes('text/uri-list')
    || types.includes('text/plain');
}

async function insertMarkdownMediaFromDrop(event: DragEvent): Promise<void> {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;
  const files = Array.from(dataTransfer.files || []);
  if (files.length) {
    await insertMarkdownUploadedFiles(files);
    return;
  }
  const payload = parseTerminalResourceTransfer(dataTransfer.getData(TERMINAL_RESOURCE_DRAG_MIME) || '');
  if (payload) {
    insertMarkdownMediaFragments(
      collectMarkdownResourcePayloads(payload).map((item) => resourcePayloadToMarkdownFragment(item)),
    );
    return;
  }
  const pathText = dataTransfer.getData('text/uri-list') || dataTransfer.getData('text/plain') || '';
  const fragments = pathText
    .split(/\r?\n/)
    .map((line) => normalizeMarkdownDroppedPath(line))
    .filter(Boolean)
    .map((path) => pathToMarkdownMediaFragment(path));
  insertMarkdownMediaFragments(fragments);
}

async function insertMarkdownUploadedFiles(files: File[]): Promise<void> {
  if (!files.length) return;
  if (!props.assetRootId || !props.assetFilePath) {
    setMarkdownMediaStatus('error', '当前文件缺少工作区路径，无法把外部文件上传为知识库资源。');
    return;
  }

  try {
    setMarkdownMediaStatus('info', `正在导入 ${files.length} 个媒体资源…`, 0);
    const uploadItems: TerminalMarkdownUploadItem[] = [];
    for (const [index, file] of files.entries()) {
      const relativePath = createMarkdownUploadFileName(file, index);
      uploadItems.push({
        fileName: file.name || relativePath,
        relativePath,
        dataBase64: await readMarkdownFileAsDataUrl(file),
      });
    }
    await uploadFiles({
      rootId: props.assetRootId,
      directoryPath: markdownAssetDirectoryPath(),
      files: uploadItems.map((item) => ({
        fileName: item.fileName,
        relativePath: item.relativePath,
        dataBase64: item.dataBase64,
      })),
    });
    insertMarkdownMediaFragments(
      uploadItems.map((item) => pathToMarkdownMediaFragment(item.relativePath)),
    );
    setMarkdownMediaStatus('info', files.length > 1 ? `已插入 ${files.length} 个媒体资源` : '媒体资源已插入');
  } catch (error) {
    setMarkdownMediaStatus('error', error instanceof Error ? error.message : '媒体导入失败');
  }
}

function insertMarkdownMediaFragments(fragments: TerminalDocMediaFragment[]): void {
  const documentElement = documentRef.value;
  if (!canEditMarkdownDocument() || !documentElement || !fragments.length) return;
  documentElement.focus();
  const fragment = document.createDocumentFragment();
  for (const entry of fragments) {
    fragment.appendChild(createMarkdownMediaFragmentNode(entry));
  }
  insertNodeAtEditableSelection(documentElement, fragment);
  void enhancePreviewAfterRender();
  syncEditableSourceFromDocument();
}

function createMarkdownMediaFragmentNode(entry: TerminalDocMediaFragment): HTMLElement {
  if (entry.kind === 'link') {
    const paragraph = document.createElement('p');
    const link = document.createElement('a');
    link.href = entry.src;
    link.textContent = entry.name || entry.src;
    paragraph.appendChild(link);
    return paragraph;
  }

  const figure = document.createElement('figure');
  figure.className = `terminal-doc-media-block terminal-doc-media-block--${entry.kind}`;
  figure.dataset.mediaKind = entry.kind;
  figure.dataset.mediaAlign = 'center';
  figure.dataset.mediaSize = 'medium';
  figure.contentEditable = 'false';
  const media = document.createElement(entry.kind === 'image' ? 'img' : entry.kind) as HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
  media.setAttribute('src', entry.src);
  if (entry.kind === 'image') {
    media.setAttribute('alt', entry.alt || entry.name);
    media.setAttribute('loading', 'lazy');
  } else {
    media.setAttribute('controls', '');
  }
  figure.appendChild(media);
  ensureMarkdownMediaToolbar(figure);
  applyTerminalMediaFigurePresentation(figure);
  return figure;
}

function insertNodeAtEditableSelection(root: HTMLElement, fragment: DocumentFragment): void {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
  if (range && root.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    const lastNode = fragment.lastChild;
    range.insertNode(fragment);
    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    return;
  }
  root.appendChild(fragment);
}

function collectMarkdownResourcePayloads(
  payload: TerminalResourceTransferPayload,
): TerminalResourceTransferPayload[] {
  return payload.items?.length ? payload.items : [payload];
}

function resourcePayloadToMarkdownFragment(payload: TerminalResourceTransferPayload): TerminalDocMediaFragment {
  const targetPath = payload.rootId === props.assetRootId
    ? relativeMarkdownPathFromCurrentFile(payload.path)
    : (payload.absolutePath || payload.path);
  return pathToMarkdownMediaFragment(targetPath, payload.name);
}

function pathToMarkdownMediaFragment(path: string, name = ''): TerminalDocMediaFragment {
  const cleanPath = normalizeMarkdownDroppedPath(path);
  const title = name || cleanPath.split('/').pop() || cleanPath;
  const kind = detectMarkdownMediaKind(title || cleanPath);
  return {
    kind: kind || 'link',
    src: cleanPath,
    name: title,
    alt: title.replace(/\.[^.]+$/, ''),
  };
}

function normalizeMarkdownDroppedPath(path: string): string {
  const trimmed = String(path || '').trim().replace(/^['"]|['"]$/g, '');
  if (!trimmed || trimmed.startsWith('#')) return '';
  if (!/^file:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return decodeURIComponent(url.pathname || trimmed);
  } catch {
    return trimmed;
  }
}

function detectMarkdownMediaKind(value: string): TerminalDocLightboxMediaKind | null {
  const normalized = String(value || '').toLowerCase().split(/[?#]/)[0] || '';
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|bmp|ico)$/i.test(normalized)) return 'image';
  if (/\.(?:mp4|webm|ogv|mov|m4v|mkv)$/i.test(normalized)) return 'video';
  if (/\.(?:mp3|wav|ogg|m4a|flac|aac|opus)$/i.test(normalized)) return 'audio';
  return null;
}

function rewriteMarkdownAssetUrls(root: HTMLElement): void {
  const documentElement = root.querySelector<HTMLElement>('.terminal-doc-preview__document') || root;
  documentElement.querySelectorAll<HTMLElement>('[src]').forEach((node) => {
    rewriteMarkdownAssetAttribute(node, 'src', 'data-terminal-markdown-original-src');
  });
  documentElement.querySelectorAll<HTMLElement>('[href]').forEach((node) => {
    rewriteMarkdownAssetAttribute(node, 'href', 'data-terminal-markdown-original-href');
  });
  documentElement.querySelectorAll<HTMLElement>('[poster]').forEach((node) => {
    rewriteMarkdownAssetAttribute(node, 'poster', 'data-terminal-markdown-original-poster');
  });
  documentElement.querySelectorAll<HTMLElement>('[srcset]').forEach((node) => {
    const original = node.getAttribute('data-terminal-markdown-original-srcset') || node.getAttribute('srcset') || '';
    if (!original) return;
    const rewritten = rewriteMarkdownAssetSrcset(original);
    if (!rewritten) {
      if (node.hasAttribute('data-terminal-markdown-original-srcset')) node.setAttribute('srcset', original);
      return;
    }
    node.setAttribute('data-terminal-markdown-original-srcset', original);
    node.setAttribute('srcset', rewritten);
  });
}

function rewriteMarkdownAssetAttribute(node: HTMLElement, attribute: string, originalAttribute: string): void {
  const original = node.getAttribute(originalAttribute) || node.getAttribute(attribute) || '';
  if (!original) return;
  const rewritten = resolveMarkdownAssetUrl(original);
  if (!rewritten) {
    if (node.hasAttribute(originalAttribute)) node.setAttribute(attribute, original);
    return;
  }
  node.setAttribute(originalAttribute, original);
  node.setAttribute(attribute, rewritten);
}

function rewriteMarkdownAssetSrcset(value: string): string {
  return String(value || '')
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return '';
      const [url = '', ...descriptor] = trimmed.split(/\s+/);
      const rewritten = resolveMarkdownAssetUrl(url) || url;
      return [rewritten, ...descriptor].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function resolveMarkdownAssetUrl(rawUrl: string): string {
  const normalizedUrl = String(rawUrl || '').trim();
  if (!normalizedUrl || isExternalMarkdownAssetUrl(normalizedUrl) || !props.assetRootId) return '';
  const resourcePath = markdownAssetUrlPath(normalizedUrl);
  const normalizedPath = normalizeMarkdownAssetPath(resourcePath, props.assetFilePath);
  return normalizedPath ? buildFileDownloadUrl(props.assetRootId, normalizedPath) : '';
}

function isExternalMarkdownAssetUrl(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function markdownAssetUrlPath(value: string): string {
  return String(value || '').split('#', 1)[0]?.split('?', 1)[0] || '';
}

function normalizeMarkdownAssetPath(resourcePath: string, filePath: string): string {
  const decodedPath = safeDecodeMarkdownAssetPath(resourcePath);
  const normalizedResourcePath = decodedPath.replace(/\\/g, '/').trim();
  if (!normalizedResourcePath) return '';
  const baseSegments = normalizedResourcePath.startsWith('/')
    ? []
    : String(filePath || '').replace(/\\/g, '/').split('/').slice(0, -1);
  const output: string[] = [];
  for (const segment of [...baseSegments, ...normalizedResourcePath.split('/')]) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join('/');
}

function safeDecodeMarkdownAssetPath(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function markdownAssetDirectoryPath(): string {
  return String(props.assetFilePath || '').replace(/\\/g, '/').split('/').slice(0, -1).join('/');
}

function relativeMarkdownPathFromCurrentFile(targetPath: string): string {
  const fromSegments = markdownAssetDirectoryPath().split('/').filter(Boolean);
  const toSegments = String(targetPath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  while (fromSegments.length && toSegments.length && fromSegments[0] === toSegments[0]) {
    fromSegments.shift();
    toSegments.shift();
  }
  return [...fromSegments.map(() => '..'), ...toSegments].join('/') || targetPath;
}

function createMarkdownUploadFileName(file: File, index: number): string {
  const rawName = String(file.name || '').trim() || `media-${index + 1}${extensionForMarkdownMime(file.type)}`;
  const safeName = rawName
    .replace(/[\\/]+/g, '-')
    .replace(/[^\w.\-\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '') || `media-${index + 1}${extensionForMarkdownMime(file.type)}`;
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `media/${stamp}-${index + 1}-${safeName}`;
}

function extensionForMarkdownMime(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'audio/mpeg') return '.mp3';
  return '';
}

function readMarkdownFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error || new Error('Failed to read media file'));
    reader.readAsDataURL(file);
  });
}

function setMarkdownMediaStatus(kind: 'info' | 'error', message: string, timeout = 2200): void {
  mediaStatusKind.value = kind;
  mediaStatusMessage.value = message;
  if (typeof window === 'undefined') return;
  if (mediaStatusTimer !== null) {
    window.clearTimeout(mediaStatusTimer);
    mediaStatusTimer = null;
  }
  if (!timeout) return;
  mediaStatusTimer = window.setTimeout(() => {
    mediaStatusTimer = null;
    mediaStatusMessage.value = '';
  }, timeout);
}

function applyMarkdownMediaAction(button: HTMLButtonElement): void {
  const action = button.dataset.terminalMediaAction || '';
  const figure = button.closest<HTMLElement>('.terminal-doc-media-block');
  if (!figure) return;
  if (action === 'open') {
    const media = figure.querySelector<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>('img, video, audio');
    if (media) openMarkdownMediaLightbox(media);
    return;
  }
  if (!canEditMarkdownDocument()) return;
  if (action.startsWith('align-')) {
    figure.dataset.mediaAlign = normalizeMediaAlign(action.replace('align-', ''));
  } else if (action.startsWith('size-')) {
    figure.dataset.mediaSize = normalizeMediaSize(action.replace('size-', ''));
  } else {
    return;
  }
  figure.dataset.mediaCustomized = '1';
  applyTerminalMediaFigurePresentation(figure);
  updateMarkdownMediaToolbarState(figure);
  syncEditableSourceFromDocument();
}

function openMarkdownMediaLightbox(media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement): void {
  const tagName = media.tagName.toLowerCase();
  const src = media.currentSrc || media.getAttribute('src') || '';
  const kind: TerminalDocLightboxMediaKind = tagName === 'video'
    ? 'video'
    : tagName === 'audio'
      ? 'audio'
      : 'image';
  if (!src) return;
  lightbox.value = {
    kind,
    src,
    title: media.getAttribute('title') || media.getAttribute('alt') || src.split('/').pop() || props.title,
    alt: media.getAttribute('alt') || '',
  };
  void nextTick(() => rootRef.value?.querySelector<HTMLElement>('.terminal-doc-lightbox')?.focus());
}

function closeMarkdownLightbox(): void {
  lightbox.value = null;
}

function syncEditableTaskControls(root: HTMLElement): void {
  root.querySelectorAll<HTMLInputElement>('.terminal-doc-preview__document input[type="checkbox"]').forEach((checkbox) => {
    if (checkbox.closest('.terminal-doc-codeblock')) return;
    checkbox.classList.add('terminal-doc-task-checkbox');
    checkbox.contentEditable = 'false';
    checkbox.disabled = !canEditMarkdownDocument();
    checkbox.setAttribute('aria-label', '切换任务状态');
  });
}

function enhanceMarkdownMediaBlocks(root: HTMLElement): void {
  if (canEditMarkdownDocument()) {
    root.querySelectorAll<HTMLImageElement | HTMLVideoElement | HTMLAudioElement>(
      '.terminal-doc-preview__document img, .terminal-doc-preview__document video, .terminal-doc-preview__document audio',
    ).forEach((media) => {
      if (media.closest('.terminal-doc-codeblock, .terminal-doc-lightbox, .terminal-doc-media-block')) return;
      const figure = wrapMarkdownEditableMedia(media);
      if (!figure) return;
      ensureMarkdownMediaToolbar(figure);
      applyTerminalMediaFigurePresentation(figure);
    });
    root.querySelectorAll<HTMLElement>('.terminal-doc-media-block').forEach((figure) => {
      ensureMarkdownMediaToolbar(figure);
      applyTerminalMediaFigurePresentation(figure);
    });
    return;
  }

  root.querySelectorAll<HTMLImageElement>('.terminal-doc-preview__document img').forEach((image) => {
    if (!image.closest('.terminal-doc-codeblock, .terminal-doc-lightbox')) {
      image.loading = 'lazy';
    }
  });
}

function wrapMarkdownEditableMedia(
  media: HTMLImageElement | HTMLVideoElement | HTMLAudioElement,
): HTMLElement | null {
  const rawKind = media.tagName.toLowerCase();
  const kind: TerminalDocLightboxMediaKind = rawKind === 'video'
    ? 'video'
    : rawKind === 'audio'
      ? 'audio'
      : 'image';
  const paragraph = media.parentElement?.tagName.toLowerCase() === 'p'
    && Array.from(media.parentElement.childNodes).every((node) =>
      node === media || (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()))
    ? media.parentElement
    : null;
  const figure = document.createElement('figure');
  figure.className = `terminal-doc-media-block terminal-doc-media-block--${kind}`;
  figure.dataset.mediaKind = kind;
  figure.dataset.mediaAlign = inferMediaAlign(media);
  figure.dataset.mediaSize = inferMediaSize(media);
  if (kind !== 'image' || media.hasAttribute('style') || media.hasAttribute('width')) {
    figure.dataset.mediaCustomized = '1';
  }
  figure.contentEditable = 'false';
  if (kind === 'image') {
    media.setAttribute('loading', 'lazy');
  } else {
    media.setAttribute('controls', '');
  }
  if (paragraph) {
    paragraph.replaceWith(figure);
  } else {
    media.replaceWith(figure);
  }
  figure.appendChild(media);
  return figure;
}

function ensureMarkdownMediaToolbar(figure: HTMLElement): void {
  if (figure.querySelector('.terminal-doc-media-block__tools')) {
    updateMarkdownMediaToolbarState(figure);
    return;
  }
  const toolbar = document.createElement('div');
  toolbar.className = 'terminal-doc-media-block__tools';
  toolbar.contentEditable = 'false';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', '媒体布局工具');
  [
    ['open', '预览'],
    ['align-left', '左'],
    ['align-center', '中'],
    ['align-right', '右'],
    ['size-small', '小'],
    ['size-medium', '中'],
    ['size-large', '大'],
    ['size-full', '满'],
  ].forEach(([action, label]) => {
    const control = document.createElement('button');
    control.type = 'button';
    control.dataset.terminalMediaAction = action;
    control.textContent = label;
    control.title = action === 'open' ? '打开灯箱预览' : `设置媒体${label}`;
    if (action !== 'open' && !canEditMarkdownDocument()) control.disabled = true;
    toolbar.appendChild(control);
  });
  figure.prepend(toolbar);
  updateMarkdownMediaToolbarState(figure);
}

function updateMarkdownMediaToolbarState(figure: HTMLElement): void {
  const align = normalizeMediaAlign(figure.dataset.mediaAlign);
  const size = normalizeMediaSize(figure.dataset.mediaSize);
  figure.querySelectorAll<HTMLButtonElement>('button[data-terminal-media-action]').forEach((button) => {
    const action = button.dataset.terminalMediaAction || '';
    const selected = action === `align-${align}` || action === `size-${size}`;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
    if (action !== 'open') button.disabled = !canEditMarkdownDocument();
  });
}

function applyTerminalMediaFigurePresentation(figure: HTMLElement): void {
  const align = normalizeMediaAlign(figure.dataset.mediaAlign);
  const size = normalizeMediaSize(figure.dataset.mediaSize);
  figure.dataset.mediaAlign = align;
  figure.dataset.mediaSize = size;
  figure.classList.toggle('terminal-doc-media-block--align-left', align === 'left');
  figure.classList.toggle('terminal-doc-media-block--align-center', align === 'center');
  figure.classList.toggle('terminal-doc-media-block--align-right', align === 'right');
  figure.classList.toggle('terminal-doc-media-block--size-small', size === 'small');
  figure.classList.toggle('terminal-doc-media-block--size-medium', size === 'medium');
  figure.classList.toggle('terminal-doc-media-block--size-large', size === 'large');
  figure.classList.toggle('terminal-doc-media-block--size-full', size === 'full');
  const media = figure.querySelector<HTMLElement>('img, video, audio');
  if (!media) return;
  media.style.width = mediaWidthForSize(size);
  media.style.maxWidth = '100%';
  media.style.height = 'auto';
  media.style.display = 'block';
  media.style.marginLeft = align === 'right' || align === 'center' ? 'auto' : '0';
  media.style.marginRight = align === 'left' || align === 'center' ? 'auto' : '0';
}

function normalizeMediaAlign(value: string | undefined): TerminalDocMediaAlign {
  return value === 'left' || value === 'right' || value === 'center' ? value : 'center';
}

function normalizeMediaSize(value: string | undefined): TerminalDocMediaSize {
  return value === 'small' || value === 'large' || value === 'full' || value === 'medium' ? value : 'medium';
}

function inferMediaSize(media: HTMLElement): TerminalDocMediaSize {
  const width = media.style.width || media.getAttribute('width') || '';
  if (/100%|full/i.test(width)) return 'full';
  if (/8[0-9]%|9[0-9]%/.test(width)) return 'large';
  if (/[1-4][0-9]%/.test(width)) return 'small';
  return 'medium';
}

function inferMediaAlign(media: HTMLElement): TerminalDocMediaAlign {
  const marginLeft = media.style.marginLeft;
  const marginRight = media.style.marginRight;
  const align = media.getAttribute('align') || '';
  if (align === 'left' || (marginLeft === '0px' && marginRight === 'auto')) return 'left';
  if (align === 'right' || (marginLeft === 'auto' && marginRight === '0px')) return 'right';
  return 'center';
}

function mediaWidthForSize(size: TerminalDocMediaSize): string {
  if (size === 'small') return '38%';
  if (size === 'large') return '82%';
  if (size === 'full') return '100%';
  return '62%';
}

function mediaStyleForMarkdown(size: TerminalDocMediaSize, align: TerminalDocMediaAlign): string {
  const marginLeft = align === 'right' || align === 'center' ? 'auto' : '0';
  const marginRight = align === 'left' || align === 'center' ? 'auto' : '0';
  return `display: block; width: ${mediaWidthForSize(size)}; max-width: 100%; height: auto; margin-left: ${marginLeft}; margin-right: ${marginRight};`;
}

function serializeEditableMarkdownDocument(root: HTMLElement): string {
  const blocks = Array.from(root.childNodes)
    .map((node) => serializeEditableMarkdownNode(node, 0).trimEnd())
    .filter(Boolean);
  return normalizeEditableMarkdownSpacing(blocks.join('\n\n'));
}

function serializeEditableMarkdownNode(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return normalizeEditableText(node.textContent || '');
  }
  if (!(node instanceof HTMLElement)) return '';

  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (node.classList.contains('terminal-doc-mermaid')) {
    const source = node.dataset.mermaidSource?.trim() || '';
    return source ? `\`\`\`mermaid\n${source}\n\`\`\`` : '';
  }
  if (node.classList.contains('terminal-doc-svg')) {
    const source = node.querySelector('svg')?.outerHTML.trim() || '';
    return source ? `\`\`\`svg\n${source}\n\`\`\`` : '';
  }
  if (node.classList.contains('terminal-doc-codeblock')) {
    const codeElement = node.querySelector<HTMLElement>('pre code');
    const code = codeElement?.textContent || '';
    const language = codeElement ? readCodeLanguage(codeElement) : '';
    return `\`\`\`${language}\n${code.replace(/\n+$/, '')}\n\`\`\``;
  }
  if (node.classList.contains('terminal-doc-math')) {
    const source = node.dataset.mathSource?.trim() || normalizeEditableInline(node);
    if (!source) return '';
    return node.dataset.mathDisplay === 'block' ? `$$\n${source}\n$$` : `$${source}$`;
  }
  if (node.classList.contains('terminal-doc-media-block')) {
    return serializeEditableMarkdownMediaBlock(node);
  }

  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1)) || 1;
    return `${'#'.repeat(level)} ${normalizeEditableInline(node)}`;
  }
  if (tagName === 'p') {
    return normalizeEditableInline(node);
  }
  if (tagName === 'blockquote') {
    const quote = serializeEditableMarkdownChildren(node, depth).trim();
    return quote
      .split('\n')
      .map((line) => `> ${line}`.trimEnd())
      .join('\n');
  }
  if (tagName === 'pre') {
    const code = node.querySelector('code')?.textContent || node.textContent || '';
    const codeElement = node.querySelector<HTMLElement>('code') || node;
    const language = readCodeLanguage(codeElement);
    return `\`\`\`${language}\n${code.replace(/\n+$/, '')}\n\`\`\``;
  }
  if (tagName === 'ul' || tagName === 'ol') {
    return serializeEditableMarkdownList(node, tagName === 'ol', depth);
  }
  if (tagName === 'li') {
    return normalizeEditableInline(node);
  }
  if (tagName === 'table') {
    return serializeEditableMarkdownTable(node);
  }
  if (tagName === 'hr') {
    return '---';
  }
  if (tagName === 'figure') {
    return serializeEditableMarkdownChildren(node, depth).trim();
  }
  if (tagName === 'img' || tagName === 'video' || tagName === 'audio') {
    return serializeEditableMarkdownMediaElement(node, null);
  }
  if (tagName === 'details') {
    const summary = normalizeEditableInline(node.querySelector('summary'));
    const body = Array.from(node.childNodes)
      .filter((child) => !(child instanceof HTMLElement && child.tagName.toLowerCase() === 'summary'))
      .map((child) => serializeEditableMarkdownNode(child, depth).trim())
      .filter(Boolean)
      .join('\n\n');
    return summary ? `### ${summary}\n\n${body}`.trim() : body;
  }
  if (tagName === 'div' && node.childElementCount === 0) {
    return normalizeEditableInline(node);
  }
  return serializeEditableMarkdownChildren(node, depth).trim();
}

function serializeEditableMarkdownChildren(root: HTMLElement, depth: number): string {
  return Array.from(root.childNodes)
    .map((node) => serializeEditableMarkdownNode(node, depth))
    .filter(Boolean)
    .join('');
}

function serializeEditableMarkdownList(list: HTMLElement, ordered: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  const items = Array.from(list.children).filter((child) => child.tagName.toLowerCase() === 'li');
  return items.map((item, index) => {
    const nestedLists = Array.from(item.children).filter((child) => {
      const tagName = child.tagName.toLowerCase();
      return tagName === 'ul' || tagName === 'ol';
    });
    const checkbox = item.querySelector<HTMLInputElement>(':scope > input[type="checkbox"]');
    const marker = ordered ? `${index + 1}.` : '-';
    const taskPrefix = checkbox ? `[${checkbox.checked ? 'x' : ' '}] ` : '';
    const inline = Array.from(item.childNodes)
      .filter((child) => {
        if (child instanceof HTMLInputElement && child.type === 'checkbox') return false;
        if (child instanceof HTMLElement) {
          const tagName = child.tagName.toLowerCase();
          return tagName !== 'ul' && tagName !== 'ol';
        }
        return true;
      })
      .map((child) => child instanceof HTMLElement ? normalizeEditableInline(child) : normalizeEditableText(child.textContent || ''))
      .join('')
      .trim();
    const nested = nestedLists
      .map((child) => serializeEditableMarkdownList(child as HTMLElement, child.tagName.toLowerCase() === 'ol', depth + 1))
      .filter(Boolean)
      .join('\n');
    return [`${indent}${marker} ${taskPrefix}${inline}`.trimEnd(), nested].filter(Boolean).join('\n');
  }).join('\n');
}

function serializeEditableMarkdownTable(table: HTMLElement): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.children).map((cell) => normalizeEditableInline(cell as HTMLElement).replace(/\|/g, '\\|')),
  );
  if (!rows.length) return '';
  const header = rows[0] || [];
  const width = Math.max(...rows.map((row) => row.length), 1);
  const paddedHeader = padEditableTableRow(header, width);
  const divider = Array.from({ length: width }, () => '---');
  const body = rows.slice(1).map((row) => padEditableTableRow(row, width));
  return [paddedHeader, divider, ...body]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function padEditableTableRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_item, index) => row[index] || '');
}

function normalizeEditableInline(root: HTMLElement | null): string {
  if (!root) return '';
  return Array.from(root.childNodes)
    .map((node) => serializeEditableInlineNode(node))
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function serializeEditableInlineNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeEditableText(node.textContent || '');
  if (!(node instanceof HTMLElement)) return '';
  const tagName = node.tagName.toLowerCase();
  if (tagName === 'br') return '\n';
  if (tagName === 'code') return `\`${normalizeEditableText(node.textContent || '').replace(/`/g, '\\`')}\``;
  if (tagName === 'strong' || tagName === 'b') return `**${normalizeEditableInline(node)}**`;
  if (tagName === 'em' || tagName === 'i') return `*${normalizeEditableInline(node)}*`;
  if (tagName === 's' || tagName === 'del') return `~~${normalizeEditableInline(node)}~~`;
  if (tagName === 'a') {
    const label = normalizeEditableInline(node) || readOriginalMarkdownAssetAttribute(node, 'href') || '';
    const href = readOriginalMarkdownAssetAttribute(node, 'href');
    return href ? `[${label}](${href})` : label;
  }
  if (tagName === 'img') {
    return serializeEditableMarkdownMediaElement(node, null);
  }
  if (tagName === 'video' || tagName === 'audio') {
    return serializeEditableMarkdownMediaElement(node, null);
  }
  if (node.classList.contains('terminal-doc-math')) {
    const source = node.dataset.mathSource?.trim() || normalizeEditableText(node.textContent || '');
    return source ? `$${source}$` : '';
  }
  return normalizeEditableInline(node);
}

function serializeEditableMarkdownMediaBlock(root: HTMLElement): string {
  const media = root.querySelector<HTMLElement>('img, video, audio');
  if (!media) return '';
  return serializeEditableMarkdownMediaElement(media, root);
}

function serializeEditableMarkdownMediaElement(
  media: HTMLElement,
  figure: HTMLElement | null,
): string {
  const tagName = media.tagName.toLowerCase();
  const src = readOriginalMarkdownAssetAttribute(media, 'src');
  if (!src) return '';
  const alt = tagName === 'img' ? media.getAttribute('alt') || '' : '';
  const customized = figure?.dataset.mediaCustomized === '1';
  if (tagName === 'img' && !customized) {
    return `![${escapeMarkdownLabel(alt)}](${escapeMarkdownDestination(src)})`;
  }
  const align = normalizeMediaAlign(figure?.dataset.mediaAlign);
  const size = normalizeMediaSize(figure?.dataset.mediaSize);
  const style = mediaStyleForMarkdown(size, align);
  if (tagName === 'img') {
    return `<img src="${escapeAttribute(src)}" alt="${escapeAttribute(alt)}" style="${escapeAttribute(style)}" />`;
  }
  const controls = tagName === 'video' || tagName === 'audio' ? ' controls' : '';
  const playsInline = tagName === 'video' ? ' playsinline' : '';
  return `<${tagName} src="${escapeAttribute(src)}" style="${escapeAttribute(style)}"${controls}${playsInline}></${tagName}>`;
}

function readOriginalMarkdownAssetAttribute(node: HTMLElement, attribute: string): string {
  return node.getAttribute(`data-terminal-markdown-original-${attribute}`) || node.getAttribute(attribute) || '';
}

function escapeMarkdownLabel(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/]/g, '\\]');
}

function escapeMarkdownDestination(value: string): string {
  return encodeURI(String(value || '').replace(/\)/g, '%29'));
}

function normalizeEditableText(value: string): string {
  return value.replace(/\u00a0/g, ' ');
}

function normalizeEditableMarkdownSpacing(value: string): string {
  return value
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function renderTerminalMarkdownDocument(source: string): string {
  const normalized = String(source || '').trim();
  if (!normalized) return '<p></p>';
  const cachedHtml = readTerminalMarkdownRenderCache(normalized);
  if (cachedHtml != null) return cachedHtml;

  const previews = extractTerminalPreviewPlaceholders(normalized);
  const math = extractTerminalMathPlaceholders(previews.text);
  try {
    const file = terminalMarkdownProcessor.processSync(math.text);
    const withMath = restoreTerminalMathPlaceholders(String(file), math.placeholders);
    const withPreviews = restoreTerminalPreviewPlaceholders(withMath, previews.placeholders);
    const html = upgradeTerminalMarkdownDocumentHtml(withPreviews);
    writeTerminalMarkdownRenderCache(normalized, html);
    return html;
  } catch (error) {
    console.warn('[TerminalMarkdownPreview] markdown render failed:', error);
    return `<pre><code>${escapeHtml(normalized)}</code></pre>`;
  }
}

function readTerminalMarkdownRenderCache(source: string): string | null {
  if (!canCacheTerminalMarkdownRender(source)) return null;
  const cached = terminalMarkdownRenderCache.get(source);
  if (cached == null) return null;
  terminalMarkdownRenderCache.delete(source);
  terminalMarkdownRenderCache.set(source, cached);
  return cached;
}

function writeTerminalMarkdownRenderCache(source: string, html: string): void {
  if (!canCacheTerminalMarkdownRender(source)) return;
  terminalMarkdownRenderCache.set(source, html);
  while (terminalMarkdownRenderCache.size > TERMINAL_MARKDOWN_RENDER_CACHE_LIMIT) {
    const oldestKey = terminalMarkdownRenderCache.keys().next().value;
    if (!oldestKey) break;
    terminalMarkdownRenderCache.delete(oldestKey);
  }
}

function canCacheTerminalMarkdownRender(source: string): boolean {
  return typeof document !== 'undefined'
    && source.length <= TERMINAL_MARKDOWN_RENDER_CACHE_MAX_SOURCE_LENGTH;
}

function extractTerminalPreviewPlaceholders(text: string): {
  text: string;
  placeholders: Map<string, TerminalPreviewPlaceholder>;
} {
  const placeholders = new Map<string, TerminalPreviewPlaceholder>();
  const output = text.replace(
    /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g,
    (match, prefix: string, fence: string, rawInfo: string, rawSource: string) => {
      const language = normalizeCodeLanguage(rawInfo);
      const kind: TerminalPreviewPlaceholderKind | null =
        language === 'mermaid'
          ? 'mermaid'
          : language === 'svg'
            ? 'svg'
            : null;
      if (!kind) return match;
      const key = `OPENCLAW_TERMINAL_PREVIEW_${placeholders.size}`;
      placeholders.set(key, {
        kind,
        source: String(rawSource || '').replace(/\n$/, ''),
      });
      return `${prefix}<div data-terminal-preview-placeholder="${key}"></div>`;
    },
  );
  return { text: output, placeholders };
}

function extractTerminalMathPlaceholders(text: string): {
  text: string;
  placeholders: Map<string, TerminalMathPlaceholder>;
} {
  const placeholders = new Map<string, TerminalMathPlaceholder>();
  let output = '';
  let cursor = 0;
  let protectedStart = -1;
  let fenceMarker = '';
  let fenceLength = 0;
  const linePattern = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text))) {
    const line = match[0];
    if (!line) break;
    const lineStart = match.index;
    const lineEnd = lineStart + line.length;
    const fence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);

    if (protectedStart >= 0) {
      if (fence && fence[1]?.startsWith(fenceMarker) && fence[1].length >= fenceLength) {
        output += text.slice(protectedStart, lineEnd);
        cursor = lineEnd;
        protectedStart = -1;
        fenceMarker = '';
        fenceLength = 0;
      }
      continue;
    }

    if (fence) {
      output += replaceTerminalMathInPlainMarkdown(text.slice(cursor, lineStart), placeholders);
      protectedStart = lineStart;
      fenceMarker = fence[1]?.charAt(0) || '';
      fenceLength = fence[1]?.length || 0;
      cursor = lineStart;
    }
  }

  if (protectedStart >= 0) {
    output += text.slice(protectedStart);
  } else {
    output += replaceTerminalMathInPlainMarkdown(text.slice(cursor), placeholders);
  }
  return { text: output, placeholders };
}

function replaceTerminalMathInPlainMarkdown(
  text: string,
  placeholders: Map<string, TerminalMathPlaceholder>,
): string {
  let output = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, source) =>
      createTerminalMathPlaceholder(placeholders, String(source || ''), 'block'))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, source) =>
      createTerminalMathPlaceholder(placeholders, String(source || ''), 'block'))
    .replace(/\\\((.+?)\\\)/g, (_match, source) =>
      createTerminalMathPlaceholder(placeholders, String(source || ''), 'inline'));

  output = output.replace(/(^|[^\w$])\$([^\n$]+?)\$(?!\$)/g, (match, prefix, source) => {
    const mathSource = String(source || '').trim();
    if (!looksLikeTerminalMathSource(mathSource)) return match;
    return `${prefix}${createTerminalMathPlaceholder(placeholders, mathSource, 'inline')}`;
  });
  return output;
}

function looksLikeTerminalMathSource(source: string): boolean {
  if (!source || source.length > 5000) return false;
  return /\\[a-zA-Z]+/.test(source)
    || /(?:[a-zA-Z0-9)]\s*(?:=|:=|≤|≥|≠|≈|∈|∉|⊂|⊆|→|←|↔)|[=+\-*/^_]|∑|∏|√|∞)/.test(source);
}

function createTerminalMathPlaceholder(
  placeholders: Map<string, TerminalMathPlaceholder>,
  source: string,
  displayMode: TerminalMathPlaceholder['displayMode'],
): string {
  const key = `OPENCLAW_TERMINAL_MATH_${placeholders.size}`;
  placeholders.set(key, {
    displayMode,
    source: source.trim(),
  });
  return displayMode === 'block'
    ? `<div data-terminal-math-placeholder="${key}"></div>`
    : `<span data-terminal-math-placeholder="${key}"></span>`;
}

function restoreTerminalMathPlaceholders(
  html: string,
  placeholders: Map<string, TerminalMathPlaceholder>,
): string {
  let output = html;
  for (const [key, entry] of placeholders.entries()) {
    const tag = entry.displayMode === 'block' ? 'div' : 'span';
    const className = entry.displayMode === 'block'
      ? 'terminal-doc-math terminal-doc-math--block'
      : 'terminal-doc-math terminal-doc-math--inline';
    const replacement = `<${tag} class="${className}" data-math-source="${escapeAttribute(entry.source)}" data-math-display="${entry.displayMode}">${escapeHtml(entry.source)}</${tag}>`;
    const marker = new RegExp(`<${tag}[^>]*data-terminal-math-placeholder=["']${key}["'][^>]*><\\/${tag}>`, 'g');
    output = output.replace(marker, replacement);
  }
  return output;
}

function restoreTerminalPreviewPlaceholders(
  html: string,
  placeholders: Map<string, TerminalPreviewPlaceholder>,
): string {
  let output = html;
  for (const [key, entry] of placeholders.entries()) {
    const replacement = entry.kind === 'mermaid'
      ? renderTerminalMermaidPlaceholder(entry.source)
      : renderTerminalSvgPlaceholder(entry.source);
    const marker = new RegExp(`<div[^>]*data-terminal-preview-placeholder=["']${key}["'][^>]*><\\/div>`, 'g');
    output = output.replace(marker, replacement);
  }
  return output;
}

function renderTerminalMermaidPlaceholder(source: string): string {
  return [
    `<div class="terminal-doc-mermaid" data-mermaid-source="${escapeAttribute(source)}">`,
    '<div class="terminal-doc-mermaid__canvas"></div>',
    '</div>',
  ].join('');
}

function renderTerminalSvgPlaceholder(source: string): string {
  const svg = sanitizeSvgPreviewMarkup(source).trim();
  return svg
    ? `<div class="terminal-doc-svg">${svg}</div>`
    : '<div class="terminal-doc-svg"></div>';
}

function renderTerminalCodeBlockHtml(source: string, language: string): string {
  const label = formatTerminalCodeLanguageLabel(language);
  return [
    '<div class="terminal-doc-codeblock">',
    '<div class="terminal-doc-codeblock__bar" contenteditable="false">',
    `<span class="terminal-doc-codeblock__language">${escapeHtml(label)}</span>`,
    '<button type="button" class="terminal-doc-codeblock__copy" data-terminal-code-copy contenteditable="false" aria-label="复制代码块">',
    '<span class="terminal-doc-codeblock__copy-idle">复制</span>',
    '<span class="terminal-doc-codeblock__copy-done">已复制</span>',
    '<span class="terminal-doc-codeblock__copy-error">失败</span>',
    '</button>',
    '</div>',
    renderHighlightedCodeHtml(source, language),
    '</div>',
  ].join('');
}

function formatTerminalCodeLanguageLabel(language: string): string {
  const normalized = normalizeCodeLanguage(language);
  if (!normalized) return 'Code';
  const labels: Record<string, string> = {
    bash: 'Shell',
    sh: 'Shell',
    shell: 'Shell',
    zsh: 'Shell',
    js: 'JavaScript',
    jsx: 'JavaScript JSX',
    ts: 'TypeScript',
    tsx: 'TypeScript TSX',
    py: 'Python',
    rb: 'Ruby',
    rs: 'Rust',
    go: 'Go',
    md: 'Markdown',
    markdown: 'Markdown',
    json: 'JSON',
    yml: 'YAML',
    yaml: 'YAML',
    html: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    vue: 'Vue',
    plaintext: 'Text',
    text: 'Text',
  };
  return labels[normalized] || normalized
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function upgradeTerminalMarkdownDocumentHtml(html: string): string {
  if (typeof document === 'undefined') return html;
  const host = document.createElement('div');
  host.innerHTML = html;

  host.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
    const pre = code.parentElement;
    if (!pre || pre.closest('.terminal-doc-mermaid, .terminal-doc-svg')) return;
    const language = readCodeLanguage(code);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderTerminalCodeBlockHtml(code.textContent || '', language);
    const nextNode = wrapper.firstElementChild;
    if (nextNode) pre.replaceWith(nextNode);
  });

  host.querySelectorAll<HTMLTableElement>('table').forEach((table) => {
    if (table.parentElement?.classList.contains('terminal-doc-table-wrap')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-doc-table-wrap';
    table.replaceWith(wrapper);
    wrapper.appendChild(table);
  });

  return host.innerHTML;
}

function readCodeLanguage(code: HTMLElement): string {
  const className = code.getAttribute('class') || '';
  return className.match(/language-([^\s]+)/)?.[1] || '';
}

function normalizeCodeLanguage(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized.split(/\s+/)[0] || '';
}

function currentMermaidTheme(): string {
  return props.dark ? 'dark' : 'base';
}

function mermaidRenderConfig(): Record<string, unknown> {
  return {
    startOnLoad: false,
    securityLevel: 'loose',
    suppressErrorRendering: true,
    theme: currentMermaidTheme(),
    themeVariables: {
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Arial, sans-serif',
      primaryColor: props.dark ? '#0f2433' : '#eff6ff',
      primaryTextColor: props.dark ? '#e5eef8' : '#0f172a',
      primaryBorderColor: '#38bdf8',
      lineColor: props.dark ? '#8aa4bd' : '#64748b',
      secondaryColor: props.dark ? '#162b22' : '#f0fdf4',
      tertiaryColor: props.dark ? '#2b2213' : '#fff7ed',
    },
    flowchart: {
      useMaxWidth: true,
      htmlLabels: false,
    },
  };
}

function nextRenderId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
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

async function renderMermaidBlocks(container: HTMLElement): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('.terminal-doc-mermaid:not([data-rendered="1"])'));
  if (!blocks.length) return;
  let mermaid: MermaidModule;
  try {
    mermaid = await getMermaid();
    mermaid.initialize(mermaidRenderConfig());
  } catch (error) {
    console.warn('[TerminalMarkdownPreview] failed to load Mermaid:', error);
    return;
  }

  await Promise.allSettled(blocks.map(async (block) => {
    const source = block.dataset.mermaidSource?.trim() || '';
    const canvas = block.querySelector<HTMLElement>('.terminal-doc-mermaid__canvas');
    if (!source || !canvas) return;
    try {
      const result = await mermaid.render(nextRenderId('terminal-doc-mermaid'), source);
      const svg = typeof result === 'string' ? result : result.svg;
      canvas.innerHTML = sanitizeMermaidSvg(svg).trim();
      block.dataset.rendered = '1';
      delete block.dataset.error;
    } catch (error) {
      console.warn('[TerminalMarkdownPreview] Mermaid render failed:', error);
      block.dataset.error = '1';
      canvas.textContent = '';
    }
  }));
}

async function renderMathBlocks(container: HTMLElement): Promise<void> {
  const targets = Array.from(container.querySelectorAll<HTMLElement>('.terminal-doc-math:not([data-math-rendered="1"])'));
  if (!targets.length) return;
  let katex: KatexApi;
  try {
    katex = await getKatex();
  } catch (error) {
    console.warn('[TerminalMarkdownPreview] failed to load KaTeX:', error);
    return;
  }
  targets.forEach((target) => {
    const source = target.dataset.mathSource?.trim() || target.textContent?.trim() || '';
    if (!source) return;
    try {
      target.innerHTML = katex.renderToString(source, {
        displayMode: target.dataset.mathDisplay === 'block',
        throwOnError: false,
        strict: 'ignore',
        trust: false,
        output: 'htmlAndMathml',
      });
      target.dataset.mathRendered = '1';
      delete target.dataset.mathError;
    } catch (error) {
      console.warn('[TerminalMarkdownPreview] math render failed:', error);
      target.dataset.mathError = '1';
    }
  });
}

async function enhancePreviewAfterRender(force = false): Promise<void> {
  const serial = ++enhanceSerial;
  await nextTick();
  const root = rootRef.value;
  if (!root || serial !== enhanceSerial) return;
  if (force) {
    root.querySelectorAll<HTMLElement>('.terminal-doc-mermaid[data-rendered="1"]').forEach((block) => {
      delete block.dataset.rendered;
      block.querySelector<HTMLElement>('.terminal-doc-mermaid__canvas')?.replaceChildren();
    });
    root.querySelectorAll<HTMLElement>('.terminal-doc-math[data-math-rendered="1"]').forEach((target) => {
      delete target.dataset.mathRendered;
      target.textContent = target.dataset.mathSource || target.textContent || '';
    });
  }
  syncEditableTaskControls(root);
  rewriteMarkdownAssetUrls(root);
  enhanceMarkdownMediaBlocks(root);
  await renderMathBlocks(root);
  await renderMermaidBlocks(root);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, '&#10;');
}

onMounted(() => {
  void enhancePreviewAfterRender();
});

onBeforeUnmount(() => {
  clearScheduledTerminalMarkdownRender();
  if (typeof window !== 'undefined') {
    activeCopyStatusTimers.forEach((handle) => window.clearTimeout(handle));
    if (mediaStatusTimer !== null) {
      window.clearTimeout(mediaStatusTimer);
      mediaStatusTimer = null;
    }
  }
  activeCopyStatusTimers.clear();
  markdownRenderSerial += 1;
  enhanceSerial += 1;
});
</script>
