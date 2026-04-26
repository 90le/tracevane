import createDOMPurify, { type WindowLike } from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import plaintext from 'highlight.js/lib/languages/plaintext';
import powershell from 'highlight.js/lib/languages/powershell';
import python from 'highlight.js/lib/languages/python';
import r from 'highlight.js/lib/languages/r';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import vbnet from 'highlight.js/lib/languages/vbnet';
import vbscript from 'highlight.js/lib/languages/vbscript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import type { SanitizeLevel } from '../chat-v2/inline-preview-preferences';
import type { ChatResourceItem } from '../../../../../types/chat';
import { joinApiPath } from '../../shared/api';
import {
  buildStudioMarkdownMediaDownloadUrl,
  inferStudioMarkdownMediaKind,
  isStudioMarkdownCompiledUrl,
  parseStudioMarkdownMediaRef,
  parseStudioMarkdownMediaTitle,
  stripStudioMarkdownMediaMeta,
  type StudioMarkdownMediaDisplay,
} from '../../../../../lib/studio-markdown-media';

// ---------------------------------------------------------------------------
// DOMPurify / unified / markdown runtime configuration
// ---------------------------------------------------------------------------

const allowedTags = [
  'a',
  'blockquote',
  'br',
  'button',
  'code',
  'del',
  'details',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'picture',
  'pre',
  'source',
  'span',
  'strong',
  'summary',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
  'video',
];

const allowedAttrs = [
  'alt',
  'aria-label',
  'class',
  'controls',
  'download',
  'href',
  'muted',
  'playsinline',
  'poster',
  'preload',
  'rel',
  'sizes',
  'src',
  'srcset',
  'style',
  'target',
  'title',
  'type',
];

const sanitizeOptions = {
  ALLOWED_TAGS: allowedTags,
  ALLOWED_ATTR: allowedAttrs,
  ADD_ATTR: [
    'data-code',
    'data-copy-source',
    'data-math-display',
    'data-math-source',
    'data-mermaid-source',
    'data-preview-kind',
    'data-studio-display',
    'data-studio-preview-alt',
    'data-studio-preview-kind',
    'data-studio-preview-src',
  ],
  ADD_DATA_URI_TAGS: ['img'],
};

function resolveDomPurifyWindow(): WindowLike {
  if (typeof window !== 'undefined' && window) {
    return window as unknown as WindowLike;
  }
  return globalThis as unknown as WindowLike;
}

const DOMPurify = createDOMPurify(resolveDomPurifyWindow());

const MARKDOWN_CHAR_LIMIT = 140_000;
const MARKDOWN_PARSE_LIMIT = 40_000;
const MARKDOWN_CACHE_LIMIT = 200;
const MARKDOWN_CACHE_MAX_CHARS = 50_000;
const markdownCache = new Map<string, ChatMarkdownRenderResult>();
let hooksInstalled = false;

type PreviewPlaceholderKind = 'mermaid' | 'html' | 'svg';

type PreviewPlaceholderEntry = {
  kind: PreviewPlaceholderKind;
  source: string;
};

type MathPlaceholderEntry = {
  displayMode: 'inline' | 'block';
  source: string;
};

// ---------------------------------------------------------------------------
// unified pipeline: fenced preview placeholder extraction / restoration
// ---------------------------------------------------------------------------

function extractPreviewPlaceholders(text: string): {
  text: string;
  placeholders: Map<string, PreviewPlaceholderEntry>;
} {
  const placeholders = new Map<string, PreviewPlaceholderEntry>();
  let index = 0;
  const replaced = text.replace(/```(mermaid|html|htm|svg)\n([\s\S]*?)```/gi, (_match, rawLang, rawSource) => {
    const lang = normalizeCodeLanguage(rawLang);
    const kind: PreviewPlaceholderKind = lang === 'mermaid'
      ? 'mermaid'
      : isSvgPreviewLanguage(lang)
        ? 'svg'
        : 'html';
    const key = `OPENCLAW_PREVIEW_${index++}`;
    placeholders.set(key, {
      kind,
      source: String(rawSource || '').replace(/\n$/, ''),
    });
    return `<div data-openclaw-preview-placeholder="${key}"></div>`;
  });
  return { text: replaced, placeholders };
}

function renderPreviewPlaceholder(entry: PreviewPlaceholderEntry, interactive: boolean): string {
  if (entry.kind === 'mermaid') return renderMermaidBlock(entry.source, interactive);
  if (entry.kind === 'svg') return renderSvgPreviewBlock(entry.source, interactive);
  return renderHtmlPreviewBlock(entry.source, interactive);
}

function restorePreviewPlaceholders(html: string, placeholders: Map<string, PreviewPlaceholderEntry>, interactive: boolean): string {
  let output = html;
  for (const [key, entry] of placeholders.entries()) {
    const marker = new RegExp(`<div[^>]*data-openclaw-preview-placeholder=["']${key}["'][^>]*><\/div>`, 'g');
    output = output.replace(marker, renderPreviewPlaceholder(entry, interactive));
  }
  return output;
}

function looksLikeMathSource(source: string): boolean {
  const normalized = source.trim();
  if (!normalized || normalized.length > 5000) {
    return false;
  }
  if (/\\[a-zA-Z]+/.test(normalized)) {
    return true;
  }
  if (/(?:^|[^\w])(?:[a-zA-Z]\s*[_^]|[a-zA-Z0-9)]\s*(?:=|:=|≤|≥|≠|≈|∈|∉|⊂|⊆|→|←|↔)|[=+\-*/^_]|∑|∏|√|∞)(?:[^\w]|$)/.test(normalized)) {
    return true;
  }
  return /[a-zA-Z0-9]\s*[+\-*/]\s*[a-zA-Z0-9]/.test(normalized);
}

function isEscapedAt(value: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && value.charAt(cursor) === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function isInlineDollarOpen(value: string, index: number): boolean {
  if (value.charAt(index) !== '$' || isEscapedAt(value, index)) {
    return false;
  }
  const previous = value.charAt(index - 1);
  const next = value.charAt(index + 1);
  if (!next || previous === '$' || next === '$' || /\s/.test(next)) {
    return false;
  }
  return true;
}

function isInlineDollarClose(value: string, index: number): boolean {
  if (value.charAt(index) !== '$' || isEscapedAt(value, index)) {
    return false;
  }
  const previous = value.charAt(index - 1);
  const next = value.charAt(index + 1);
  if (!previous || /\s/.test(previous) || next === '$') {
    return false;
  }
  return true;
}

function findInlineDollarMath(value: string, fromIndex: number): {
  start: number;
  end: number;
  source: string;
} | null {
  for (let start = fromIndex; start < value.length; start += 1) {
    if (!isInlineDollarOpen(value, start)) {
      continue;
    }

    for (let end = start + 1; end < value.length; end += 1) {
      const current = value.charAt(end);
      if (current === '\n' || current === '\r') {
        break;
      }
      if (!isInlineDollarClose(value, end)) {
        continue;
      }
      const source = value.slice(start + 1, end);
      if (looksLikeMathSource(source)) {
        return { start, end: end + 1, source };
      }
      break;
    }
  }
  return null;
}

function replaceInlineDollarMath(
  text: string,
  placeholders: Map<string, MathPlaceholderEntry>,
): string {
  let output = '';
  let cursor = 0;
  let searchFrom = 0;
  let match = findInlineDollarMath(text, searchFrom);

  while (match) {
    output += text.slice(cursor, match.start);
    output += createMathPlaceholder(placeholders, match.source, 'inline');
    cursor = match.end;
    searchFrom = match.end;
    match = findInlineDollarMath(text, searchFrom);
  }

  if (cursor < text.length) {
    output += text.slice(cursor);
  }
  return output;
}

function replaceOutsideInlineCode(
  text: string,
  replaceSegment: (segment: string) => string,
): string {
  let output = '';
  let cursor = 0;
  const inlineCodePattern = /(`+)([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;

  while ((match = inlineCodePattern.exec(text))) {
    output += replaceSegment(text.slice(cursor, match.index));
    output += match[0];
    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    output += replaceSegment(text.slice(cursor));
  }
  return output;
}

function createMathPlaceholder(
  placeholders: Map<string, MathPlaceholderEntry>,
  source: string,
  displayMode: MathPlaceholderEntry['displayMode'],
): string {
  const key = `OPENCLAW_MATH_${placeholders.size}`;
  placeholders.set(key, {
    displayMode,
    source: source.trim(),
  });
  return displayMode === 'block'
    ? `<div data-openclaw-math-placeholder="${key}"></div>`
    : `<span data-openclaw-math-placeholder="${key}"></span>`;
}

function replaceMathInUnprotectedMarkdown(
  text: string,
  placeholders: Map<string, MathPlaceholderEntry>,
): string {
  return replaceOutsideInlineCode(text, (segment) => replaceMathInPlainMarkdown(segment, placeholders));
}

function replaceMathInPlainMarkdown(
  text: string,
  placeholders: Map<string, MathPlaceholderEntry>,
): string {
  let output = text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_match, source) =>
      createMathPlaceholder(placeholders, String(source || ''), 'block'))
    .replace(/\$\$([\s\S]*?)\$\$/g, (_match, source) =>
      createMathPlaceholder(placeholders, String(source || ''), 'block'));

  output = output.replace(/(^|\n)([ \t]*)\[\s+([^\]\n]+?)\s+\](?=\n|$)/g, (match, prefix, indent, source) => {
    const mathSource = String(source || '');
    if (!looksLikeMathSource(mathSource)) {
      return match;
    }
    return `${prefix}${indent}${createMathPlaceholder(placeholders, mathSource, 'block')}`;
  });

  output = output
    .replace(/\\\((.+?)\\\)/g, (_match, source) =>
      createMathPlaceholder(placeholders, String(source || ''), 'inline'))
    .replace(/(^|[\s（(「『“"'])\[\s+([^\]\n]+?)\s+\](?!\()(?=$|[\s，。；：、.!?）)」』”"'])/g, (match, prefix, source) => {
      const mathSource = String(source || '');
      if (!looksLikeMathSource(mathSource)) {
        return match;
      }
      return `${prefix}${createMathPlaceholder(placeholders, mathSource, 'inline')}`;
    });

  return replaceInlineDollarMath(output, placeholders);
}

function extractMathPlaceholders(text: string): {
  text: string;
  placeholders: Map<string, MathPlaceholderEntry>;
} {
  const placeholders = new Map<string, MathPlaceholderEntry>();
  let output = '';
  let cursor = 0;
  let protectedStart = -1;
  let fenceMarker = '';
  let fenceLength = 0;
  const linePattern = /.*(?:\r?\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = linePattern.exec(text))) {
    const line = match[0];
    if (!line) {
      break;
    }
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
      output += replaceMathInUnprotectedMarkdown(text.slice(cursor, lineStart), placeholders);
      protectedStart = lineStart;
      fenceMarker = fence[1]?.charAt(0) || '';
      fenceLength = fence[1]?.length || 0;
      cursor = lineStart;
    }
  }

  if (protectedStart >= 0) {
    output += text.slice(protectedStart);
  } else {
    output += replaceMathInUnprotectedMarkdown(text.slice(cursor), placeholders);
  }

  return { text: output, placeholders };
}

function renderMathPlaceholder(entry: MathPlaceholderEntry): string {
  const display = entry.displayMode === 'block' ? 'block' : 'inline';
  const source = entry.source.trim();
  const content = escapeHtml(source);
  const attrs = [
    `class="chat-math chat-math-${display}"`,
    `data-math-source="${escapeAttribute(source)}"`,
    `data-math-display="${display}"`,
    `aria-label="${escapeAttribute(source)}"`,
  ].join(' ');

  if (display === 'block') {
    return `<div ${attrs}><span class="chat-math-source">${content}</span></div>`;
  }
  return `<span ${attrs}><span class="chat-math-source">${content}</span></span>`;
}

function restoreMathPlaceholders(html: string, placeholders: Map<string, MathPlaceholderEntry>): string {
  let output = html;
  for (const [key, entry] of placeholders.entries()) {
    const marker = new RegExp(`<(?:span|div)[^>]*data-openclaw-math-placeholder=["']${key}["'][^>]*><\\/(?:span|div)>`, 'g');
    output = output.replace(marker, renderMathPlaceholder(entry));
  }
  return output;
}

function hasMathMarkdown(value: string): boolean {
  return /\\\[|\\\(|\$\$/.test(value)
    || findInlineDollarMath(value, 0) != null
    || /(^|\n)\s*\[\s+[^\]\n]*(?:\\[a-zA-Z]+|:=|[=+\-*/^_]|≤|≥|≠|≈|∈|∉|⊂|⊆|→|←|↔)[^\]\n]*\s+\](?=\n|$)/.test(value)
    || /(^|[\s（(「『“"'])\[\s+[^\]\n]*(?:\\[a-zA-Z]+|:=|[=+\-*/^_]|≤|≥|≠|≈|∈|∉|⊂|⊆|→|←|↔)[^\]\n]*\s+\](?!\()(?=$|[\s，。；：、.!?）)」』”"'])/.test(value);
}

function renderMarkdownWithUnified(
  markdown: string,
  options: ChatMarkdownRenderOptions,
): string {
  const previewPrepared = extractPreviewPlaceholders(markdown);
  const mathPrepared = hasMathMarkdown(previewPrepared.text)
    ? extractMathPlaceholders(previewPrepared.text)
    : { text: previewPrepared.text, placeholders: new Map<string, MathPlaceholderEntry>() };
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .processSync(mathPrepared.text);

  const rendered = String(file);
  const mathRestored = mathPrepared.placeholders.size
    ? restoreMathPlaceholders(rendered, mathPrepared.placeholders)
    : rendered;
  return restorePreviewPlaceholders(mathRestored, previewPrepared.placeholders, options.interactive ?? false);
}

const INLINE_HTML_BLOCK_TAGS = new Set([
  'article',
  'aside',
  'blockquote',
  'div',
  'figure',
  'section',
]);
const INLINE_HTML_BLOCK_SELECTOR = Array.from(INLINE_HTML_BLOCK_TAGS).join(', ');
const PERMISSIVE_INLINE_EVENT_ATTRS = [
  'onclick',
  'ondblclick',
  'onmousedown',
  'onmouseup',
  'onmouseenter',
  'onmouseleave',
  'onmouseover',
  'onmouseout',
  'onmousemove',
  'onfocus',
  'onblur',
  'oninput',
  'onchange',
];

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('sh', bash);
hljs.registerLanguage('shell', bash);
hljs.registerLanguage('zsh', bash);
hljs.registerLanguage('console', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('diff', diff);
hljs.registerLanguage('go', go);
hljs.registerLanguage('golang', go);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('json', json);
hljs.registerLanguage('markdown', markdown);
hljs.registerLanguage('md', markdown);
hljs.registerLanguage('php', php);
hljs.registerLanguage('plaintext', plaintext);
hljs.registerLanguage('text', plaintext);
hljs.registerLanguage('powerquery', plaintext);
hljs.registerLanguage('power-query', plaintext);
hljs.registerLanguage('pq', plaintext);
hljs.registerLanguage('m', plaintext);
hljs.registerLanguage('powershell', powershell);
hljs.registerLanguage('ps', powershell);
hljs.registerLanguage('ps1', powershell);
hljs.registerLanguage('pwsh', powershell);
hljs.registerLanguage('python', python);
hljs.registerLanguage('py', python);
hljs.registerLanguage('r', r);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('dax', sql);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('vbnet', vbnet);
hljs.registerLanguage('vb', vbnet);
hljs.registerLanguage('vba', vbnet);
hljs.registerLanguage('vbscript', vbscript);
hljs.registerLanguage('vbs', vbscript);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('yaml', yaml);
hljs.registerLanguage('yml', yaml);

export interface ChatMarkdownRenderOptions {
  interactive?: boolean;
  inlineHtml?: boolean;
  inlineSvg?: boolean;
  inlineScript?: boolean;
  sanitizeLevel?: SanitizeLevel;
  resources?: ChatResourceItem[];
}

export interface ChatMarkdownRenderResult {
  html: string;
  hasMermaid: boolean;
  hasMath: boolean;
  hasPreviewBlocks: boolean;
}

const HTML_PREVIEW_RESIZE_EVENT = 'openclaw-html-preview-size';

export interface HtmlPreviewMessage {
  type: typeof HTML_PREVIEW_RESIZE_EVENT;
  previewId: string;
  height: number;
}

export interface HtmlPreviewDocument {
  previewId: string;
  srcdoc: string;
}

function truncateText(
  value: string,
  max: number,
): {
  text: string;
  truncated: boolean;
  total: number;
} {
  if (value.length <= max) {
    return { text: value, truncated: false, total: value.length };
  }
  return {
    text: value.slice(0, Math.max(0, max)),
    truncated: true,
    total: value.length,
  };
}

function getCacheKey(markdown: string, options: ChatMarkdownRenderOptions): string {
  return `${options.interactive ? 'i' : 's'}:${options.inlineHtml ? 'h' : ''}:${options.inlineSvg ? 'v' : ''}:${options.inlineScript ? 'x' : ''}:${options.sanitizeLevel || 'S'}:${markdown}`;
}

function getCachedMarkdown(key: string): ChatMarkdownRenderResult | null {
  const cached = markdownCache.get(key);
  if (!cached) {
    return null;
  }
  markdownCache.delete(key);
  markdownCache.set(key, cached);
  return cached;
}

function setCachedMarkdown(key: string, value: ChatMarkdownRenderResult): void {
  markdownCache.set(key, value);
  if (markdownCache.size <= MARKDOWN_CACHE_LIMIT) {
    return;
  }
  const oldest = markdownCache.keys().next().value;
  if (oldest) {
    markdownCache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// DOMPurify hooks and low-level sanitization helpers
// ---------------------------------------------------------------------------

function installHooks(): void {
  if (hooksInstalled) {
    return;
  }
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const isInsideSvgTree = typeof Element !== 'undefined'
      && node instanceof Element
      && Boolean(node.closest('svg, foreignObject, foreignobject'));

    if (node instanceof HTMLAnchorElement) {
      const href = node.getAttribute('href')?.trim() || '';
      if (!isSafeLinkUrl(href)) {
        node.removeAttribute('href');
        return;
      }
      node.setAttribute('rel', 'noreferrer noopener');
      node.setAttribute('target', '_blank');
    }

    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute('src')?.trim() || '';
      if (!isSafeImageUrl(src)) {
        node.remove();
        return;
      }
      const srcset = node.getAttribute('srcset')?.trim() || '';
      if (srcset) {
        const sanitizedSrcset = sanitizeSrcset(srcset, 'image');
        if (sanitizedSrcset) {
          node.setAttribute('srcset', sanitizedSrcset);
        } else {
          node.removeAttribute('srcset');
        }
      }
      const meta = stripStudioMarkdownMediaMeta(src);
      if (isStudioMarkdownCompiledUrl(meta.url)) {
        node.classList.add('markdown-inline-image');
        node.setAttribute('data-studio-preview-src', meta.url);
        node.setAttribute('data-studio-preview-kind', 'image');
        node.setAttribute('data-studio-preview-alt', node.getAttribute('alt')?.trim() || meta.fileName || 'image');
      }
    }

    if (node instanceof HTMLVideoElement || node instanceof HTMLSourceElement) {
      const src = node.getAttribute('src')?.trim() || '';
      if (!isSafeMediaUrl(src)) {
        node.removeAttribute('src');
        return;
      }
      const srcset = node.getAttribute('srcset')?.trim() || '';
      if (srcset) {
        const sanitizedSrcset = sanitizeSrcset(srcset, 'media');
        if (sanitizedSrcset) {
          node.setAttribute('srcset', sanitizedSrcset);
        } else {
          node.removeAttribute('srcset');
        }
      }
      const meta = stripStudioMarkdownMediaMeta(src);
      if (node instanceof HTMLVideoElement && isStudioMarkdownCompiledUrl(meta.url)) {
        node.setAttribute('data-studio-preview-src', meta.url);
        node.setAttribute('data-studio-preview-kind', 'video');
        node.setAttribute('data-studio-preview-alt', node.getAttribute('title')?.trim() || meta.fileName || 'video');
      }
    }

    if (typeof SVGSVGElement !== 'undefined' && node instanceof SVGSVGElement) {
      node.setAttribute('data-inline-svg-root', '1');
      const existingClass = node.getAttribute('class')?.trim() || '';
      node.setAttribute('class', existingClass ? `${existingClass} chat-inline-svg-root` : 'chat-inline-svg-root');
    }

    if (
      typeof HTMLElement !== 'undefined'
      && node instanceof HTMLElement
      && !isInsideSvgTree
      && INLINE_HTML_BLOCK_TAGS.has(node.tagName.toLowerCase())
      && !node.parentElement?.closest(INLINE_HTML_BLOCK_SELECTOR)
      && !node.closest('.chat-inline-resource, .chat-inline-chip, .chat-resource-card, .chat-mermaid-block, .chat-math, .code-block-wrapper, .json-collapse, .chat-mermaid-source, .chat-markdown-table-wrap')
    ) {
      node.setAttribute('data-inline-html-root', '1');
    }
  });
}

function isSafeRelativeUrl(value: string): boolean {
  return /^(\/(?!\/)|\.\/|\.\.\/|#)/.test(value);
}

function isSafeLinkUrl(value: string): boolean {
  if (!value) return false;
  return /^(https?:|mailto:|tel:)/i.test(value) || isSafeRelativeUrl(value);
}

function isSafeImageUrl(value: string): boolean {
  if (!value) return false;
  return /^(https?:\/\/|blob:|data:image\/[a-z0-9.+-]+;base64,)/i.test(value) || isSafeRelativeUrl(value);
}

function isSafeMediaUrl(value: string): boolean {
  if (!value) return false;
  return /^(https?:\/\/|blob:|data:(?:image|video)\/[a-z0-9.+-]+;base64,)/i.test(value) || isSafeRelativeUrl(value);
}

function parseSrcsetCandidates(value: string): Array<{ url: string; descriptor: string }> {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(/\s+/);
      return {
        url: parts.shift() || '',
        descriptor: parts.join(' '),
      };
    })
    .filter((entry) => Boolean(entry.url));
}

function rebuildSrcset(candidates: Array<{ url: string; descriptor: string }>): string {
  return candidates
    .map((entry) => (entry.descriptor ? `${entry.url} ${entry.descriptor}` : entry.url))
    .join(', ');
}

function sanitizeSrcset(value: string, kind: 'image' | 'media'): string {
  const candidates = parseSrcsetCandidates(value).filter((entry) => (
    kind === 'image' ? isSafeImageUrl(entry.url) : isSafeMediaUrl(entry.url)
  ));
  return rebuildSrcset(candidates);
}

function firstSrcsetUrl(value: string): string {
  return parseSrcsetCandidates(value)[0]?.url || '';
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

function renderEscapedPlainTextHtml(value: string): string {
  return `<div class="markdown-plain-text-fallback">${escapeHtml(value.replace(/\r\n?/g, '\n'))}</div>`;
}

function normalizeCodeLanguage(lang?: string | null): string {
  const trimmed = lang?.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0]?.toLowerCase() || '';
}

function isJsonCodeBlock(lang: string, value: string): boolean {
  if (lang === 'json') return true;
  if (lang) return false;
  const trimmed = value.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
    || (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function isSvgPreviewLanguage(lang: string): boolean {
  return lang === 'svg';
}

function highlightCode(text: string, lang: string): string {
  const normalizedLang = normalizeCodeLanguage(lang);
  try {
    if (normalizedLang && hljs.getLanguage(normalizedLang)) {
      return hljs.highlight(text, {
        language: normalizedLang,
        ignoreIllegals: true,
      }).value;
    }
    if (normalizedLang) {
      return hljs.highlightAuto(text, [normalizedLang]).value;
    }
    return hljs.highlightAuto(text).value;
  } catch {
    return escapeHtml(text);
  }
}

export function renderHighlightedCodeHtml(text: string, lang: string): string {
  const normalizedLang = normalizeCodeLanguage(lang);
  const resolvedLang = isJsonCodeBlock(normalizedLang, text) ? (normalizedLang || 'json') : normalizedLang;
  const highlightedText = highlightCode(text, resolvedLang);
  const langClass = resolvedLang
    ? ` class="hljs language-${escapeHtml(resolvedLang)}"`
    : ' class="hljs"';
  return `<pre><code${langClass}>${highlightedText}</code></pre>`;
}

// ---------------------------------------------------------------------------
// Preview block / code block rendering
// ---------------------------------------------------------------------------

function formatCodeBlockLabel(lang: string): string {
  const normalized = normalizeCodeLanguage(lang);
  if (!normalized) {
    return 'Code';
  }
  if (normalized === 'plaintext' || normalized === 'text') {
    return 'Plain Text';
  }
  if (normalized === 'bash' || normalized === 'sh' || normalized === 'shell') {
    return 'Shell';
  }
  if (normalized === 'js') {
    return 'JavaScript';
  }
  if (normalized === 'ts') {
    return 'TypeScript';
  }
  if (normalized === 'py') {
    return 'Python';
  }
  return normalized
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderCopyButton(copySource: string, label: string): string {
  const escaped = escapeAttribute(copySource);
  return [
    `<button type="button" class="chat-md-copy-button code-block-copy"`,
    ` data-code="${escaped}"`,
    ` data-copy-source="${escaped}"`,
    ` aria-label="${escapeHtml(label)}">`,
    '<span class="chat-md-copy-button__idle">Copy</span>',
    '<span class="chat-md-copy-button__done">Copied</span>',
    '<span class="chat-md-copy-button__error">Error</span>',
    '</button>',
  ].join('');
}

function renderCodeBlockHtml(
  source: string,
  lang: string,
  interactive: boolean,
): string {
  const label = formatCodeBlockLabel(lang);
  const copyButton = interactive ? renderCopyButton(source, `Copy ${label} block`) : '';
  const actions = interactive
    ? `<div class="code-block-actions">${copyButton}</div>`
    : '';

  return [
    '<div class="code-block-wrapper">',
    '<div class="code-block-header">',
    `<span class="code-block-lang">${escapeHtml(label)}</span>`,
    actions,
    '</div>',
    renderHighlightedCodeHtml(source, lang),
    '</div>',
  ].join('');
}

function renderPreviewBlock(
  source: string,
  kind: 'mermaid' | 'html' | 'svg',
  interactive: boolean,
): string {
  const copyLabel = kind === 'mermaid'
    ? 'Copy mermaid source'
    : kind === 'html'
      ? 'Copy HTML source'
      : 'Copy SVG source';
  const copyButton = interactive ? renderCopyButton(source, copyLabel) : '';
  const toggleButton = interactive && kind !== 'mermaid'
    ? `<button type="button" class="chat-live-preview-toggle-button" data-preview-kind="${kind}" aria-label="Toggle inline preview">Inline preview</button>`
    : '';
  const scriptToggleButton = interactive && kind !== 'mermaid'
    ? `<button type="button" class="chat-live-preview-toggle-button" data-preview-kind="inlineScript" aria-label="Toggle inline script">Script</button>`
    : '';
  const expandButton = interactive
    ? '<button type="button" class="chat-mermaid-expand-button" aria-label="Open diagram fullscreen">Full screen</button>'
    : '';
  const saveButton = interactive
    ? `<button type="button" class="chat-preview-save-button" data-preview-kind="${kind}" aria-label="Save as image">Save</button>`
    : '';
  const label = kind === 'mermaid' ? 'Mermaid' : kind === 'html' ? 'HTML' : 'SVG';
  const status = kind === 'mermaid' ? 'Rendering diagram…' : 'Rendering preview…';
  return [
    `<div class="chat-mermaid-block chat-live-preview-block preview-kind-${kind}" data-mermaid-source="${escapeAttribute(source)}">`,
    '<div class="chat-mermaid-header">',
    `<span class="chat-mermaid-label">${label}</span>`,
    `<div class="chat-mermaid-actions">${toggleButton}${scriptToggleButton}${saveButton}${expandButton}${copyButton}</div>`,
    '</div>',
    '<div class="chat-mermaid-canvas">',
    '<div class="chat-mermaid-placeholder">Diagram preview</div>',
    `<div class="chat-mermaid-status">${status}</div>`,
    '</div>',
    '<details class="chat-mermaid-source">',
    '<summary>Source</summary>',
    `<pre><code class="language-${escapeHtml(kind)}">${escapeHtml(source)}</code></pre>`,
    '</details>',
    '</div>',
  ].join('');
}

function renderMermaidBlock(source: string, interactive: boolean): string {
  return renderPreviewBlock(source, 'mermaid', interactive);
}

function renderHtmlPreviewBlock(source: string, interactive: boolean): string {
  return renderPreviewBlock(source, 'html', interactive);
}

function renderSvgPreviewBlock(source: string, interactive: boolean): string {
  return renderPreviewBlock(source, 'svg', interactive);
}

// ---------------------------------------------------------------------------
// Studio markdown media resolution and rendering
// ---------------------------------------------------------------------------

function chipBadge(kind: 'image' | 'video' | 'file'): string {
  if (kind === 'image') return 'Image';
  if (kind === 'video') return 'Video';
  return 'File';
}

function normalizeStudioResourceLabel(label: string | null | undefined, fallback: string | null | undefined): string {
  const normalized = typeof label === 'string' ? label.trim() : '';
  if (normalized) {
    return normalized;
  }
  const fallbackLabel = typeof fallback === 'string' ? fallback.trim() : '';
  return fallbackLabel || 'media';
}

function resolveStudioResourceFromRef(
  href: string,
  resources: ChatResourceItem[] | undefined,
): ChatResourceItem | null {
  const normalizedHref = String(href || '').trim();
  if (!normalizedHref) {
    return null;
  }

  const stripped = stripStudioMarkdownMediaMeta(normalizedHref);
  if (isStudioMarkdownCompiledUrl(stripped.url)) {
    const normalizedCompiledUrl = joinApiPath(stripped.url);
    const compiledMatch = (resources || []).find((item) => (
      item.url === stripped.url
      || item.downloadUrl === stripped.url
      || joinApiPath(item.url || '') === normalizedCompiledUrl
      || joinApiPath(item.downloadUrl || '') === normalizedCompiledUrl
    ));
    return compiledMatch || null;
  }

  const parsedRef = parseStudioMarkdownMediaRef(normalizedHref);
  const normalizedPath = parsedRef ? `${parsedRef.kind}:${parsedRef.path}` : normalizedHref;
  return (resources || []).find((item) => (
    item.originalPath === normalizedHref
    || item.originalPath === normalizedPath
    || item.relativePath === normalizedHref
    || item.fileName === normalizedHref
  )) || null;
}

function resolveStudioMediaHref(
  href: string,
  resources: ChatResourceItem[] | undefined,
): { url: string; kind: ChatResourceItem['kind'] | null; fileName: string | null } | null {
  const meta = stripStudioMarkdownMediaMeta(href);
  if (isStudioMarkdownCompiledUrl(meta.url)) {
    return {
      url: joinApiPath(meta.url),
      kind: meta.kind,
      fileName: meta.fileName,
    };
  }

  const resource = resolveStudioResourceFromRef(href, resources);
  if (!resource?.url) {
    return null;
  }
  return {
    url: joinApiPath(resource.url),
    kind: resource.kind,
    fileName: resource.fileName,
  };
}

function wrapBreakResourceHtml(html: string): string {
  return `<span class="chat-md-break-resource-wrap">${html}</span>`;
}

function wrapCardResourceHtml(html: string): string {
  return `<span class="chat-md-card-resource-wrap">${html}</span>`;
}

function renderStudioInlineMediaHtml(params: {
  display: Extract<StudioMarkdownMediaDisplay, 'inline-image' | 'inline-video' | 'break-image' | 'break-video'>;
  kind: 'image' | 'video';
  href: string;
  alt: string;
  label: string;
}): string {
  const isBreak = params.display.startsWith('break-');
  const baseClass = params.kind === 'image'
    ? 'chat-inline-resource chat-inline-resource-image'
    : 'chat-inline-resource chat-inline-resource-video';
  const className = isBreak ? `${baseClass} chat-break-resource` : baseClass;
  const mediaNode = params.kind === 'image'
    ? `<img class="chat-inline-resource-media" src="${escapeHtml(params.href)}" alt="${escapeHtml(params.alt)}" loading="lazy" decoding="async" fetchpriority="low">`
    : `<video class="chat-inline-resource-media" src="${escapeHtml(params.href)}" muted playsinline preload="none"></video>`;
  const html = [
    `<button type="button" class="${className}"`,
    ` data-studio-display="${escapeHtml(params.display)}"`,
    ` data-studio-preview-src="${escapeAttribute(params.href)}"`,
    ` data-studio-preview-kind="${params.kind}"`,
    ` data-studio-preview-alt="${escapeAttribute(params.alt)}"`,
    ` title="${escapeHtml(params.alt)}">`,
    mediaNode,
    `<span class="chat-inline-resource-caption">${escapeHtml(params.label)}</span>`,
    '</button>',
  ].join('');
  return isBreak ? wrapBreakResourceHtml(html) : html;
}

function renderStudioChipHtml(params: {
  display: Extract<StudioMarkdownMediaDisplay, 'inline-chip' | 'break-chip'>;
  kind: 'image' | 'video' | 'file';
  href: string;
  label: string;
}): string {
  const isBreak = params.display === 'break-chip';
  const className = isBreak ? 'chat-inline-chip chat-break-chip' : 'chat-inline-chip';
  const html = [
    `<a class="${className}" href="${escapeHtml(buildStudioMarkdownMediaDownloadUrl(params.href) || params.href)}"`,
    ` data-studio-display="${escapeHtml(params.display)}"`,
    ' target="_blank" rel="noreferrer noopener">',
    `<span class="chat-inline-chip-badge">${chipBadge(params.kind)}</span>`,
    `<span class="chat-inline-chip-label">${escapeHtml(params.label)}</span>`,
    '</a>',
  ].join('');
  return isBreak ? wrapBreakResourceHtml(html) : html;
}

function renderStudioCardHtml(params: {
  kind: 'image' | 'video' | 'file';
  href: string;
  label: string;
  alt: string;
  fileName: string;
}): string {
  if (params.kind === 'image' || params.kind === 'video') {
    const mediaNode = params.kind === 'image'
      ? `<img class="chat-resource-image" src="${escapeHtml(params.href)}" alt="${escapeHtml(params.alt)}" loading="lazy" decoding="async" fetchpriority="low">`
      : `<video class="chat-resource-video" src="${escapeHtml(params.href)}" muted playsinline preload="none"></video>`;
    return wrapCardResourceHtml([
      `<button type="button" class="chat-resource-card ${params.kind} chat-md-card-resource"`,
      ' data-studio-display="card"',
      ` data-studio-preview-src="${escapeAttribute(params.href)}"`,
      ` data-studio-preview-kind="${params.kind}"`,
      ` data-studio-preview-alt="${escapeAttribute(params.alt)}">`,
      mediaNode,
      '<span class="chat-resource-meta">',
      `<strong>${escapeHtml(params.label)}</strong>`,
      `<span>${escapeHtml(params.fileName)}</span>`,
      '</span>',
      '</button>',
    ].join(''));
  }

  const downloadUrl = buildStudioMarkdownMediaDownloadUrl(params.href);
  return wrapCardResourceHtml([
    '<div class="chat-resource-card file chat-md-card-resource" data-studio-display="card">',
    '<div class="chat-resource-file-copy">',
    '<span class="chat-resource-file-badge">File</span>',
    `<strong>${escapeHtml(params.label)}</strong>`,
    `<span>${escapeHtml(params.fileName)}</span>`,
    '</div>',
    '<div class="chat-resource-file-actions">',
    `<a href="${escapeHtml(params.href)}" target="_blank" rel="noreferrer noopener">Open</a>`,
    `<a href="${escapeHtml(downloadUrl || params.href)}" target="_blank" rel="noreferrer noopener" download>Download</a>`,
    '</div>',
    '</div>',
  ].join(''));
}

function renderStudioMarkdownMediaToken(params: {
  href: string;
  title: string | null | undefined;
  label: string;
  resources?: ChatResourceItem[];
}): string | null {
  const display = parseStudioMarkdownMediaTitle(params.title);
  if (!display) {
    return null;
  }

  const resolved = resolveStudioMediaHref(params.href, params.resources);
  if (!resolved) {
    return null;
  }

  const kind = inferStudioMarkdownMediaKind(display, resolved.kind);
  if (!kind) {
    return null;
  }

  if (
    (kind === 'image' && !isSafeImageUrl(resolved.url))
    || (kind === 'video' && !isSafeMediaUrl(resolved.url))
    || (kind === 'file' && !isSafeLinkUrl(resolved.url))
  ) {
    return null;
  }

  const fileName = resolved.fileName || params.label || 'media';
  const label = normalizeStudioResourceLabel(params.label, fileName);
  const alt = normalizeStudioResourceLabel(params.label, fileName);

  if (display === 'inline-image' || display === 'break-image') {
    if (kind !== 'image') {
      return null;
    }
    return renderStudioInlineMediaHtml({
      display,
      kind: 'image',
      href: resolved.url,
      alt,
      label,
    });
  }

  if (display === 'inline-video' || display === 'break-video') {
    if (kind !== 'video') {
      return null;
    }
    return renderStudioInlineMediaHtml({
      display,
      kind: 'video',
      href: resolved.url,
      alt,
      label,
    });
  }

  if (display === 'inline-chip' || display === 'break-chip') {
    return renderStudioChipHtml({
      display,
      kind,
      href: resolved.url,
      label,
    });
  }

  return renderStudioCardHtml({
    kind,
    href: resolved.url,
    label,
    alt,
    fileName,
  });
}

function parseStudioHtmlDisplay(value: string | null | undefined): StudioMarkdownMediaDisplay | null {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) {
    return null;
  }
  const direct = parseStudioMarkdownMediaTitle(normalized);
  if (direct) {
    return direct;
  }
  return parseStudioMarkdownMediaTitle(`studio:${normalized}`);
}

function resolveStudioHtmlMediaHref(element: HTMLAnchorElement | HTMLImageElement | HTMLVideoElement): string {
  if (element instanceof HTMLAnchorElement) {
    return element.getAttribute('href')?.trim() || '';
  }

  const direct = element.getAttribute('src')?.trim() || '';
  if (direct) {
    return direct;
  }

  const srcset = element.getAttribute('srcset')?.trim() || '';
  if (srcset) {
    return firstSrcsetUrl(srcset);
  }

  const childSource = element.querySelector('source[src], source[srcset]');
  if (!(childSource instanceof HTMLSourceElement)) {
    return '';
  }

  return childSource.getAttribute('src')?.trim()
    || firstSrcsetUrl(childSource.getAttribute('srcset')?.trim() || '');
}

function renderStudioHtmlMediaElement(element: HTMLAnchorElement | HTMLImageElement | HTMLVideoElement): string | null {
  const display = parseStudioHtmlDisplay(
    element.getAttribute('data-studio-display')
    || element.getAttribute('title')
    || '',
  );
  if (!display) {
    return null;
  }

  const href = resolveStudioHtmlMediaHref(element);
  if (!href) {
    return null;
  }

  const resolved = resolveStudioMediaHref(href, activeRenderResources);
  if (!resolved) {
    return null;
  }

  const fallbackKind = element instanceof HTMLImageElement
    ? 'image'
    : element instanceof HTMLVideoElement
      ? 'video'
      : resolved.kind;
  const kind = inferStudioMarkdownMediaKind(display, fallbackKind);
  if (!kind) {
    return null;
  }

  if (
    (kind === 'image' && !isSafeImageUrl(resolved.url))
    || (kind === 'video' && !isSafeMediaUrl(resolved.url))
    || (kind === 'file' && !isSafeLinkUrl(resolved.url))
  ) {
    return null;
  }

  const labelSource = element instanceof HTMLAnchorElement
    ? element.textContent?.trim() || ''
    : element.getAttribute('alt')?.trim()
      || element.getAttribute('aria-label')?.trim()
      || '';
  const fileName = resolved.fileName || labelSource || 'media';
  const label = normalizeStudioResourceLabel(labelSource, fileName);
  const alt = normalizeStudioResourceLabel(
    element.getAttribute('alt')?.trim()
      || element.getAttribute('aria-label')?.trim()
      || labelSource,
    fileName,
  );

  if (display === 'inline-image' || display === 'break-image') {
    if (kind !== 'image') {
      return null;
    }
    return renderStudioInlineMediaHtml({
      display,
      kind: 'image',
      href: resolved.url,
      alt,
      label,
    });
  }

  if (display === 'inline-video' || display === 'break-video') {
    if (kind !== 'video') {
      return null;
    }
    return renderStudioInlineMediaHtml({
      display,
      kind: 'video',
      href: resolved.url,
      alt,
      label,
    });
  }

  if (display === 'inline-chip' || display === 'break-chip') {
    return renderStudioChipHtml({
      display,
      kind,
      href: resolved.url,
      label,
    });
  }

  return renderStudioCardHtml({
    kind,
    href: resolved.url,
    label,
    alt,
    fileName,
  });
}

const MARKDOWN_MEDIA_TOKEN_RE = /(!)?\[([^\]]+)\]\(([^)\s]+)(?:\s+["'](studio:[^"']+)["'])?\)/g;
let activeRenderResources: ChatResourceItem[] | undefined;

// ---------------------------------------------------------------------------
// Post-processing: upgrade code blocks and studio media inside rendered HTML
// ---------------------------------------------------------------------------

function detectRenderedCodeBlockLanguage(code: HTMLElement): string {
  const className = code.getAttribute('class') || '';
  const match = className.match(/(?:^|\s)language-([a-z0-9_+-]+)/i);
  return normalizeCodeLanguage(match?.[1] || '');
}

function upgradeRenderedCodeBlocks(container: HTMLElement, interactive: boolean): void {
  const codeBlocks = Array.from(container.querySelectorAll<HTMLElement>('pre > code'));

  codeBlocks.forEach((code) => {
    const pre = code.parentElement;
    if (!(pre instanceof HTMLElement)) {
      return;
    }
    if (
      pre.closest('.code-block-wrapper')
      || pre.closest('.chat-mermaid-source')
      || pre.closest('.chat-live-preview-source')
      || pre.closest('.chat-live-preview-block')
      || pre.closest('.chat-mermaid-block')
      || pre.closest('.json-collapse')
    ) {
      return;
    }

    const source = code.textContent || '';
    const lang = detectRenderedCodeBlockLanguage(code);
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderCodeBlockHtml(source, lang, interactive);
    const replacement = wrapper.firstElementChild;
    if (replacement) {
      pre.replaceWith(replacement);
    }
  });
}

function upgradeMarkdownMediaTextNodes(container: HTMLElement): void {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) {
      const parent = current.parentElement;
      if (parent && !parent.closest('code, pre, script, style')) {
        nodes.push(current);
      }
    }
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    const text = node.textContent || '';
    MARKDOWN_MEDIA_TOKEN_RE.lastIndex = 0;
    if (!MARKDOWN_MEDIA_TOKEN_RE.test(text)) {
      return;
    }
    MARKDOWN_MEDIA_TOKEN_RE.lastIndex = 0;
    let cursor = 0;
    let changed = false;
    const fragment = document.createDocumentFragment();
    let match: RegExpExecArray | null;
    while ((match = MARKDOWN_MEDIA_TOKEN_RE.exec(text))) {
      const start = match.index;
      if (start > cursor) {
        fragment.append(document.createTextNode(text.slice(cursor, start)));
      }
      const richHtml = renderStudioMarkdownMediaToken({
        href: match[3] || '',
        title: match[4] || '',
        label: match[2] || '',
        resources: activeRenderResources,
      });
      if (richHtml) {
        const wrapper = document.createElement('span');
        wrapper.innerHTML = richHtml;
        while (wrapper.firstChild) {
          fragment.append(wrapper.firstChild);
        }
        changed = true;
      } else {
        fragment.append(document.createTextNode(match[0]));
      }
      cursor = start + match[0].length;
    }
    if (cursor < text.length) {
      fragment.append(document.createTextNode(text.slice(cursor)));
    }
    if (changed) {
      node.replaceWith(fragment);
    }
  });
}

function upgradeStudioHtmlResources(html: string): string {
  if (
    typeof document === 'undefined'
    || (!html.includes('studio:') && !html.includes('data-studio-display'))
  ) {
    return html;
  }

  const container = document.createElement('div');
  container.innerHTML = html;
  upgradeMarkdownMediaTextNodes(container);
  const candidates = Array.from(container.querySelectorAll('a, img, video'));
  for (const element of candidates) {
    if (
      element.closest('.chat-inline-resource')
      || element.closest('.chat-resource-card')
      || element.closest('.chat-inline-chip')
      || element.closest('.chat-md-card-resource')
    ) {
      continue;
    }
    if (
      !(element instanceof HTMLAnchorElement)
      && !(element instanceof HTMLImageElement)
      && !(element instanceof HTMLVideoElement)
    ) {
      continue;
    }
    const replacement = renderStudioHtmlMediaElement(element);
    if (!replacement) {
      continue;
    }
    const replaceTarget = element.closest('picture') || element;
    const wrapper = document.createElement('span');
    wrapper.innerHTML = replacement;
    const node = wrapper.firstChild;
    if (node) {
      replaceTarget.replaceWith(node);
    }
  }
  return container.innerHTML;
}

export function sanitizeMermaidSvg(svg: string): string {
  installHooks();
  return DOMPurify.sanitize(svg, {
    ADD_TAGS: ['foreignobject'],
    ADD_ATTR: ['dominant-baseline'],
    HTML_INTEGRATION_POINTS: {
      foreignobject: true,
    },
  });
}

export function sanitizeSvgPreviewMarkup(svg: string): string {
  installHooks();
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: {
      html: true,
      svg: true,
      svgFilters: true,
    },
    ADD_TAGS: ['style', 'foreignobject'],
    ADD_ATTR: ['dominant-baseline', 'style'],
    HTML_INTEGRATION_POINTS: {
      foreignobject: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Final whole-document sanitize policy
// ---------------------------------------------------------------------------

/**
 * Build the single DOMPurify config for the whole-document sanitization pass.
 *
 * Architecture: three tiers based on sanitizeLevel.
 *
 *   strict      — locked-down whitelist (no inlineHtml/inlineSvg).
 *                  Good for rendering untrusted markdown where HTML should
 *                  be inert. Uses ALLOWED_TAGS / ALLOWED_ATTR from the
 *                  static sanitizeOptions whitelist.
 *
 *   moderate    — USE_PROFILES { html, svg }.
 *                  Automatically allows ALL standard HTML & SVG attributes
 *                  (style, align, class, id, data-*, role, aria-*, etc.).
 *                  Only strips script / iframe / object / embed.
 *                  The right default when inlineHtml is ON — no more
 *                  per-attribute patches needed.
 *
 *   permissive  — Same as moderate but also allows <script> when
 *                  inlineScript is ON, and event handler attributes.
 *
 * Key rule: when the user enables inlineHtml, they trust the AI output.
 * The only real threats are <script> (code execution) and <iframe>
 * (embedded untrusted content). Everything else should pass through.
 */
function buildFinalSanitizeOptions(options: ChatMarkdownRenderOptions) {
  const sanitizeLevel = options.sanitizeLevel ?? 'strict';
  const inlineProfileEnabled = Boolean(options.inlineHtml || options.inlineSvg);
  const eventAttrs = sanitizeLevel === 'permissive' && options.inlineScript
    ? PERMISSIVE_INLINE_EVENT_ATTRS
    : [];

  // --- strict: whitelist mode (for untrusted / no-inline content) ---
  if (sanitizeLevel === 'strict') {
    if (!inlineProfileEnabled) {
      return sanitizeOptions;
    }
    // inlineHtml/SVG is ON but user chose strict — use profiles so all
    // standard attributes pass, but still forbid dangerous tags.
    return {
      USE_PROFILES: { html: true, svg: true, svgFilters: true } as const,
      ADD_ATTR: [...sanitizeOptions.ADD_ATTR, ...eventAttrs],
      FORBID_TAGS: options.inlineScript ? [] : ['script'],
    };
  }

  // --- moderate & permissive: profile-based (all attrs auto-allowed) ---
  const forbidTags = options.inlineScript
    ? ['iframe', 'object', 'embed']
    : ['script', 'iframe', 'object', 'embed'];

  return {
    USE_PROFILES: { html: true, svg: true, svgFilters: true } as const,
    ADD_TAGS: ['style', 'foreignobject'],
    ADD_ATTR: [...sanitizeOptions.ADD_ATTR, ...eventAttrs],
    FORBID_TAGS: forbidTags,
    HTML_INTEGRATION_POINTS: { foreignobject: true },
  };
}

// ---------------------------------------------------------------------------
// HTML preview document helpers and public render entrypoints
// ---------------------------------------------------------------------------

export function buildHtmlPreviewDocument(html: string, theme: 'light' | 'dark'): HtmlPreviewDocument {
  const previewId = `html-preview-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
  const background = theme === 'light' ? '#ffffff' : '#08111c';
  const text = theme === 'light' ? '#142235' : '#e8f0fb';
  const border = theme === 'light' ? 'rgba(20, 34, 53, 0.08)' : 'rgba(255, 255, 255, 0.08)';

  return {
    previewId,
    srcdoc: [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>',
    `:root { color-scheme: ${theme}; }`,
    `html, body { margin: 0; padding: 0; background: ${background}; color: ${text}; font-family: "Avenir Next", "Trebuchet MS", "PingFang SC", "Microsoft YaHei", sans-serif; overflow: hidden; }`,
    'body { padding: 16px; box-sizing: border-box; }',
    '* { box-sizing: border-box; }',
    'img, svg, canvas, video, iframe { max-width: 100%; height: auto; }',
    `table { border-collapse: collapse; border: 1px solid ${border}; max-width: 100%; }`,
    `td, th { border: 1px solid ${border}; padding: 8px 10px; }`,
    '</style>',
    '</head>',
    '<body>',
    html,
    '<script>',
    `const previewId = ${JSON.stringify(previewId)};`,
    `const eventType = ${JSON.stringify(HTML_PREVIEW_RESIZE_EVENT)};`,
    'let resizeRaf = 0;',
    'function readHeight() {',
    '  const root = document.documentElement;',
    '  const body = document.body;',
    '  return Math.max(',
    '    root.scrollHeight, root.offsetHeight, root.clientHeight,',
    '    body.scrollHeight, body.offsetHeight, body.clientHeight',
    '  );',
    '}',
    'function emitHeight() {',
    '  resizeRaf = 0;',
    '  const height = Math.max(48, Math.ceil(readHeight()));',
    '  parent.postMessage({ type: eventType, previewId, height }, "*");',
    '}',
    'function queueEmitHeight() {',
    '  if (resizeRaf) return;',
    '  resizeRaf = requestAnimationFrame(emitHeight);',
    '}',
    'window.addEventListener("load", queueEmitHeight);',
    'window.addEventListener("resize", queueEmitHeight);',
    'new MutationObserver(queueEmitHeight).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });',
    'if ("ResizeObserver" in window) {',
    '  const resizeObserver = new ResizeObserver(queueEmitHeight);',
    '  resizeObserver.observe(document.documentElement);',
    '  resizeObserver.observe(document.body);',
    '}',
    'if (document.fonts?.ready) { document.fonts.ready.then(queueEmitHeight).catch(() => {}); }',
    'queueEmitHeight();',
    '</script>',
    '</body>',
    '</html>',
    ].join(''),
  };
}

export function renderChatMarkdownResult(
  value: string,
  options: ChatMarkdownRenderOptions = {},
): ChatMarkdownRenderResult {
  const input = value.trim();
  if (!input) {
    return {
      html: '<p></p>',
      hasMermaid: false,
      hasMath: false,
      hasPreviewBlocks: false,
    };
  }

  installHooks();
  const normalizedOptions: ChatMarkdownRenderOptions = {
    interactive: options.interactive ?? false,
    inlineHtml: options.inlineHtml ?? false,
    inlineSvg: options.inlineSvg ?? false,
    inlineScript: options.inlineScript ?? false,
    sanitizeLevel: options.sanitizeLevel ?? 'strict',
    resources: options.resources,
  };

  const cacheKey = getCacheKey(input, normalizedOptions);
  if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
    const cached = getCachedMarkdown(cacheKey);
    if (cached) {
      return cached;
    }
  }

  const truncated = truncateText(input, MARKDOWN_CHAR_LIMIT);
  const suffix = truncated.truncated
    ? `\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`
    : '';

  activeRenderResources = normalizedOptions.resources;
  try {
    let renderedHtml: string;
    if (truncated.text.length > MARKDOWN_PARSE_LIMIT) {
      renderedHtml = renderEscapedPlainTextHtml(`${truncated.text}${suffix}`);
    } else {
      try {
        renderedHtml = renderMarkdownWithUnified(`${truncated.text}${suffix}`, normalizedOptions);
      } catch (error) {
        console.warn('[markdown] unified render failed, falling back to plain text:', error);
        renderedHtml = renderEscapedPlainTextHtml(`${truncated.text}${suffix}`);
      }
    }

    if (typeof document !== 'undefined' && renderedHtml.includes('<pre><code')) {
      const container = document.createElement('div');
      container.innerHTML = renderedHtml;
      upgradeRenderedCodeBlocks(container, Boolean(normalizedOptions.interactive));
      renderedHtml = container.innerHTML;
    }

    renderedHtml = upgradeStudioHtmlResources(renderedHtml);

    const result: ChatMarkdownRenderResult = {
      html: DOMPurify.sanitize(renderedHtml, buildFinalSanitizeOptions(normalizedOptions)),
      hasMermaid: /```mermaid[\s\S]*?```/i.test(input),
      hasMath: hasMathMarkdown(input),
      hasPreviewBlocks: /```(?:mermaid|html|htm|svg)\b[\s\S]*?```/i.test(input),
    };

    if (input.length <= MARKDOWN_CACHE_MAX_CHARS) {
      setCachedMarkdown(cacheKey, result);
    }

    return result;
  } finally {
    activeRenderResources = undefined;
  }
}

export function renderChatMarkdown(value: string, options: ChatMarkdownRenderOptions = {}): string {
  return renderChatMarkdownResult(value, options).html;
}
