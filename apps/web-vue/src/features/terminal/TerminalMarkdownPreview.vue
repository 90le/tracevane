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
      @blur="handleEditableBlur"
      @click="handlePreviewClick"
      @keydown.meta.s.prevent="emit('save')"
      @keydown.ctrl.s.prevent="emit('save')"
    ></article>
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
  }>(),
  {
    title: 'Markdown Preview',
    dark: false,
    editable: false,
    readOnly: false,
  },
);

const emit = defineEmits<{
  (e: 'update:source', value: string): void;
  (e: 'save'): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const documentRef = ref<HTMLElement | null>(null);
const renderedHtml = ref(renderTerminalMarkdownDocument(props.source));
let mermaidLoader: Promise<MermaidModule> | null = null;
let katexLoader: Promise<KatexApi> | null = null;
let markdownRenderTimer: number | null = null;
let markdownRenderIdleHandle: number | null = null;
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

function handleEditableBlur(): void {
  if (!props.editable || props.readOnly) return;
  scheduleTerminalMarkdownRender();
}

function handlePreviewClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest<HTMLButtonElement>('button[data-terminal-code-copy]');
  const root = rootRef.value;
  if (!button || !root || !root.contains(button)) return;

  event.preventDefault();
  event.stopPropagation();
  void copyPreviewCodeBlock(button);
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
    const label = normalizeEditableInline(node) || node.getAttribute('href') || '';
    const href = node.getAttribute('href') || '';
    return href ? `[${label}](${href})` : label;
  }
  if (tagName === 'img') {
    const alt = node.getAttribute('alt') || '';
    const src = node.getAttribute('src') || '';
    return src ? `![${alt}](${src})` : '';
  }
  if (node.classList.contains('terminal-doc-math')) {
    const source = node.dataset.mathSource?.trim() || normalizeEditableText(node.textContent || '');
    return source ? `$${source}$` : '';
  }
  return normalizeEditableInline(node);
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
  }
  activeCopyStatusTimers.clear();
  markdownRenderSerial += 1;
  enhanceSerial += 1;
});
</script>
