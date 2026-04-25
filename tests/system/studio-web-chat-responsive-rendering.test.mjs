import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const messageBubble = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/MessageBubble.vue'),
  'utf8',
);
const markdownBlock = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/MarkdownBlock.vue'),
  'utf8',
);

function cssBlock(source, selector) {
  const match = source.match(selector);
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[0];
}

test('message bubbles constrain inline html/svg content and wrap control bars on narrow screens', () => {
  assert.match(messageBubble, /ref="bubbleRoot"/);
  assert.match(messageBubble, /const bubbleBodyReady = ref\(false\);/);
  assert.match(messageBubble, /const bubbleBodyReadyPending = ref\(false\);/);
  assert.match(messageBubble, /let bubbleVisibilityObserver: IntersectionObserver \| null = null;/);
  assert.match(messageBubble, /let bubbleBodyReadyTimer: number \| null = null;/);
  assert.match(messageBubble, /let bubbleBodyReadyIdleHandle: number \| null = null;/);
  assert.match(messageBubble, /const MESSAGE_BUBBLE_DEFER_MIN_CHARS = 480;/);
  assert.match(messageBubble, /const MESSAGE_BUBBLE_DEFER_ROOT_MARGIN = '1200px 0px';/);
  assert.match(messageBubble, /const MESSAGE_BUBBLE_DEFER_IDLE_TIMEOUT_MS = 220;/);
  assert.match(messageBubble, /const canDeferBubbleBody = computed\(\(\) => \{/);
  assert.match(messageBubble, /const deferredBubbleSummary = computed\(\(\) => \{/);
  assert.match(messageBubble, /function scheduleBubbleBodyReady\(\): void \{/);
  assert.match(messageBubble, /requestIdleCallback/);
  assert.match(messageBubble, /function bindBubbleVisibilityObserver\(\): void \{/);
  assert.match(messageBubble, /new IntersectionObserver\(/);
  assert.match(messageBubble, /class="chat-message-bubble chat-message-bubble-deferred"/);
  assert.match(messageBubble, /\.chat-message-bubble-deferred\s*\{/);
  assert.match(messageBubble, /loading="lazy"/);
  assert.match(messageBubble, /decoding="async"/);
  assert.match(messageBubble, /fetchpriority="low"/);
  assert.match(messageBubble, /preload="none"/);
  const groupBlock = cssBlock(messageBubble, /\.chat-message-group\s*\{[\s\S]*?\n\}/);
  const tableWrap = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-markdown-table-wrap\)\s*\{[\s\S]*?\n\}/);
  const htmlShell = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-inline-preview-shell\.kind-html\),[\s\S]*?\.chat-message-bubble-body :deep\(\.chat-inline-preview-shell\.kind-svg\)\s*\{[\s\S]*?\n\}/);
  const overflowViewport = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-inline-overflow-viewport\)\s*\{[\s\S]*?\n\}/);
  const tableBlock = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(table\)\s*\{[\s\S]*?\n\}/);
  const mermaidShell = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-mermaid-svg\)\s*\{[\s\S]*?\n\}/);
  const livePreviewSvg = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-live-preview-svg\)\s*\{[\s\S]*?\n\}/);

  assert.match(tableWrap, /width:\s*100%;/);
  assert.match(tableWrap, /overflow-x:\s*auto;/);
  assert.match(tableWrap, /box-sizing:\s*border-box;/);
  assert.doesNotMatch(tableWrap, /border:/);
  assert.doesNotMatch(tableWrap, /background:/);

  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(\[data-inline-html-root="1"\]\)\s*\{/);
  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(\.chat-inline-preview-shell\.kind-html > \[data-inline-html-root="1"\]\)\s*\{/);
  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(\[data-inline-html-root="1"\] > \*\)\s*\{/);
  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(\[data-inline-html-root="1"\] svg\),/);

  assert.match(htmlShell, /display:\s*block;/);
  assert.match(htmlShell, /width:\s*100%;/);
  assert.match(htmlShell, /max-width:\s*100%;/);
  assert.match(htmlShell, /min-width:\s*0;/);

  assert.match(overflowViewport, /display:\s*block;/);
  assert.match(overflowViewport, /width:\s*100%;/);
  assert.match(overflowViewport, /max-width:\s*100%;/);
  assert.match(overflowViewport, /overflow-x:\s*auto;/);
  assert.match(overflowViewport, /overflow-y:\s*hidden;/);
  assert.match(overflowViewport, /box-sizing:\s*border-box;/);

  assert.doesNotMatch(tableBlock, /width:\s*max-content;/);
  assert.doesNotMatch(tableBlock, /max-width:\s*100%;/);
  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(th\),/);
  assert.doesNotMatch(messageBubble, /\.chat-message-bubble-body :deep\(td\)\s*\{/);
  assert.match(mermaidShell, /width:\s*100%;/);
  assert.match(mermaidShell, /overflow-x:\s*auto;/);
  assert.match(livePreviewSvg, /width:\s*100%;/);
  assert.match(livePreviewSvg, /overflow-x:\s*auto;/);
  assert.doesNotMatch(messageBubble, /content-visibility:\s*auto;/);
  assert.doesNotMatch(messageBubble, /contain-intrinsic-size:/);
  assert.match(messageBubble, /if \(bubbleBodyReady\.value\) \{\s*return;\s*\}/);
  assert.match(groupBlock, /display:\s*flex;/);
  assert.match(messageBubble, /\.chat-message-bubble-body :deep\(\.code-block-header\),[\s\S]*flex-wrap:\s*wrap;/);
});

test('fullscreen preview dialog uses bounded mobile viewport and touch scrolling', () => {
  assert.match(markdownBlock, /\.chat-live-preview-dialog\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(markdownBlock, /\.chat-live-preview-dialog\s*\{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(markdownBlock, /\.chat-live-preview-dialog\s*\{[\s\S]*min-width:\s*0;/);
  assert.match(markdownBlock, /\.chat-live-preview-body\s*\{[\s\S]*overscroll-behavior:\s*contain;/);
  assert.match(markdownBlock, /\.chat-live-preview-body\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/);
  assert.match(markdownBlock, /\.chat-live-preview-frame\s*\{[\s\S]*box-sizing:\s*border-box;/);
  assert.match(markdownBlock, /\.chat-live-preview-scale-wrap\s*\{[\s\S]*min-width:\s*max-content;/);
  assert.match(markdownBlock, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-live-preview-dialog\s*\{[\s\S]*max-height:\s*calc\(100dvh - 24px\);/);
  assert.match(markdownBlock, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-live-preview-dialog\s*\{[\s\S]*box-sizing:\s*border-box;/);
});

test('touch devices keep inline preview actions discoverable without hover', () => {
  assert.match(markdownBlock, /const MARKDOWN_LAZY_RENDER_MIN_CHARS = 1600;/);
  assert.match(markdownBlock, /const MARKDOWN_LAZY_RENDER_HEAVY_LINE_COUNT = 18;/);
  assert.match(markdownBlock, /const MARKDOWN_LAZY_RENDER_IDLE_TIMEOUT_MS = 220;/);
  assert.match(markdownBlock, /const MARKDOWN_LAZY_RENDER_ROOT_MARGIN = '900px 0px';/);
  assert.match(markdownBlock, /const renderReady = ref\(false\);/);
  assert.match(markdownBlock, /const renderReadyPending = ref\(false\);/);
  assert.match(markdownBlock, /let renderVisibilityObserver: IntersectionObserver \| null = null;/);
  assert.match(markdownBlock, /let renderReadyTimer: number \| null = null;/);
  assert.match(markdownBlock, /let renderReadyIdleHandle: number \| null = null;/);
  assert.match(markdownBlock, /function isHeavyMarkdownSource\(value: string\): boolean \{/);
  assert.match(markdownBlock, /const shouldLazyRender = computed\(\(\) => !props\.forceEagerRender && isHeavyMarkdownSource\(props\.source\)\);/);
  assert.match(markdownBlock, /function ensureMarkdownRenderReady\(\): void \{/);
  assert.match(markdownBlock, /function scheduleMarkdownRenderReady\(\): void \{/);
  assert.match(markdownBlock, /requestIdleCallback/);
  assert.match(markdownBlock, /function bindMarkdownVisibilityObserver\(\): void \{/);
  assert.match(markdownBlock, /new IntersectionObserver\(/);
  assert.match(markdownBlock, /rootMargin: MARKDOWN_LAZY_RENDER_ROOT_MARGIN,/);
  assert.match(markdownBlock, /class="chat-markdown-deferred-card"/);
  assert.match(markdownBlock, /\.chat-markdown-deferred-card\s*\{/);
  assert.match(markdownBlock, /function buildInlineOverflowViewport\(kind:\s*'html'\s*\|\s*'svg'\): HTMLDivElement \{/);
  assert.match(markdownBlock, /viewport\.className = `chat-inline-overflow-viewport kind-\$\{kind\}`;/);
  assert.match(markdownBlock, /function installTableOverflowGuards\(container: HTMLElement\): void \{/);
  assert.match(markdownBlock, /viewport\.className = 'chat-markdown-table-wrap';/);
  assert.match(markdownBlock, /installTableOverflowGuards\(container\);\s*installInlinePreviewAffordances\(container\);/);
  assert.match(markdownBlock, /function serializeInlinePreviewMarkup\(target: Element\): string \{/);
  assert.match(markdownBlock, /const source = serializeInlinePreviewMarkup\(previewTarget\);/);
  assert.match(markdownBlock, /shell\.append\(viewport, buildInlinePreviewToolbar\('html'\)\);[\s\S]*viewport\.append\(target\);/);
  assert.match(markdownBlock, /shell\.append\(viewport, buildInlinePreviewToolbar\('svg'\)\);[\s\S]*viewport\.append\(target\);/);
  const shellBlock = cssBlock(markdownBlock, /\.chat-markdown :deep\(\.chat-inline-preview-shell\)\s*\{[\s\S]*?\n\}/);
  const viewportBlock = cssBlock(markdownBlock, /\.chat-markdown :deep\(\.chat-inline-overflow-viewport\)\s*\{[\s\S]*?\n\}/);
  assert.doesNotMatch(shellBlock, /margin:/);
  assert.match(viewportBlock, /max-width:\s*100%;/);
  assert.match(viewportBlock, /min-width:\s*0;/);
  assert.match(markdownBlock, /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{/);
  assert.match(markdownBlock, /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*\.chat-markdown :deep\(\.chat-inline-preview-toolbar\)\s*\{[\s\S]*position:\s*static;/);
  assert.match(markdownBlock, /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*\.chat-markdown :deep\(\.chat-inline-preview-toolbar\)\s*\{[\s\S]*opacity:\s*1;/);
  assert.match(markdownBlock, /@media \(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[\s\S]*\.chat-markdown :deep\(\.chat-inline-preview-toolbar\)\s*\{[\s\S]*pointer-events:\s*auto;/);
});

test('code block and live preview layout keep overflow inside dedicated viewports', () => {
  const codeBlock = cssBlock(messageBubble, /\.chat-message-bubble-body :deep\(\.code-block-wrapper\)\s*\{[\s\S]*?\n\}/);
  const previewFrame = cssBlock(markdownBlock, /\.chat-live-preview-frame\s*\{[\s\S]*?\n\}/);
  const previewBody = cssBlock(markdownBlock, /\.chat-live-preview-body\s*\{[\s\S]*?\n\}/);
  const previewCanvas = cssBlock(markdownBlock, /\.chat-live-preview-canvas\s*\{[\s\S]*?\n\}/);
  const previewScaleWrap = cssBlock(markdownBlock, /\.chat-live-preview-scale-wrap\s*\{[\s\S]*?\n\}/);

  assert.match(codeBlock, /max-width:\s*100%;/);
  assert.match(codeBlock, /min-width:\s*0;/);
  assert.match(codeBlock, /overflow:\s*hidden;/);
  assert.match(
    messageBubble,
    /\.chat-message-bubble-body :deep\(\.code-block-actions\),[\s\S]*?\.chat-message-bubble-body :deep\(\.chat-mermaid-actions\)\s*\{[\s\S]*flex-wrap:\s*wrap;/,
  );

  assert.match(previewFrame, /overflow:\s*hidden;/);
  assert.match(previewBody, /overflow:\s*auto;/);
  assert.doesNotMatch(previewCanvas, /overflow:\s*auto;/);
  assert.match(previewScaleWrap, /width:\s*max-content;/);
  assert.match(previewScaleWrap, /min-width:\s*max-content;/);
  assert.doesNotMatch(previewScaleWrap, /margin:\s*0 auto;/);
  assert.match(markdownBlock, /zoom:\s*String\(livePreviewScale\.value\)/);
});
