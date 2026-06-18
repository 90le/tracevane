import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const markdownBlock = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/MarkdownBlock.vue'),
  'utf8',
);
const markdownBlockCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/markdown-block.css'),
  'utf8',
);
const markdownRenderer = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/markdown.ts'),
  'utf8',
);

test('markdown live preview uses reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(markdownBlock, /import '\.\/markdown-block\.css';/);
  assert.doesNotMatch(markdownBlock, /<style scoped>/);
  assert.match(markdownBlock, /from 'reka-ui'/);
  assert.match(markdownBlock, /DialogRoot/);
  assert.match(markdownBlock, /DialogPortal/);
  assert.match(markdownBlock, /DialogOverlay/);
  assert.match(markdownBlock, /DialogContent/);
  assert.match(markdownBlock, /DialogClose/);
  assert.match(markdownBlock, /DialogTitle/);
  assert.match(markdownBlock, /DialogDescription/);
  assert.match(markdownBlock, /<DialogRoot :open="Boolean\(livePreview\)" @update:open="handleLivePreviewOpenChange">/);
  assert.match(markdownBlock, /<DialogOverlay[\s\S]*class="chat-live-preview-mask"[\s\S]*@mousemove="handlePreviewMouseMove"[\s\S]*@mouseup="handlePreviewMouseUp"[\s\S]*\/>/);
  assert.match(markdownBlock, /<DialogContent[\s\S]*as-child[\s\S]*@open-auto-focus="handleLivePreviewOpenAutoFocus"[\s\S]*@close-auto-focus="handleLivePreviewCloseAutoFocus"/);
  assert.match(markdownBlock, /<DialogTitle as-child>[\s\S]*<span class="sr-only">\{\{ livePreview\?\.title \|\| 'Fullscreen preview' \}\}<\/span>/);
  assert.match(markdownBlock, /<DialogDescription as-child>[\s\S]*<span class="sr-only">\{\{ livePreview\?\.loading \? 'Rendering fullscreen preview\.' : 'Preview rendered Markdown content fullscreen\.' \}\}<\/span>/);
  assert.doesNotMatch(markdownBlock, /<Teleport to="body">/);
  assert.doesNotMatch(markdownBlock, /role="dialog"/);
  assert.doesNotMatch(markdownBlock, /@click\.self="closeLivePreview"/);
});

test('markdown live preview closes through a controlled open handler', () => {
  assert.match(markdownBlock, /function handleLivePreviewOpenChange\(nextOpen: boolean\): void \{/);
  assert.match(markdownBlock, /if \(!nextOpen\) \{\s*closeLivePreview\(\);\s*\}/);
});

test('markdown live preview content is layered above its mask', () => {
  assert.match(markdownBlockCss, /\.chat-live-preview-mask\s*\{[\s\S]*z-index:\s*1250;/);
  assert.match(markdownBlockCss, /\.chat-live-preview-dialog\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(markdownBlockCss, /\.chat-live-preview-dialog\s*\{[\s\S]*z-index:\s*1251;/);
  assert.doesNotMatch(markdownBlockCss, /:global|:deep/);
});

test('markdown live preview pans by scrolling the viewport instead of a dead offset transform', () => {
  assert.match(markdownBlock, /ref="livePreviewBody"/);
  assert.match(markdownBlock, /const livePreviewBody = ref<HTMLElement \| null>\(null\);/);
  assert.match(markdownBlock, /const dragStart = ref\(\{\s*x:\s*0,\s*y:\s*0,\s*scrollLeft:\s*0,\s*scrollTop:\s*0,\s*}\);/);
  assert.match(markdownBlock, /function handlePreviewMouseDown\(event: MouseEvent\): void \{[\s\S]*if \(event.button !== 2\) return;[\s\S]*const body = livePreviewBody\.value;[\s\S]*dragStart\.value = \{[\s\S]*scrollLeft:\s*body\.scrollLeft,[\s\S]*scrollTop:\s*body\.scrollTop,[\s\S]*\};/);
  assert.match(markdownBlock, /function handlePreviewMouseMove\(event: MouseEvent\): void \{[\s\S]*const body = livePreviewBody\.value;[\s\S]*body\.scrollLeft = dragStart\.value\.scrollLeft - deltaX;[\s\S]*body\.scrollTop = dragStart\.value\.scrollTop - deltaY;/);
  assert.doesNotMatch(markdownBlock, /const livePreviewOffset = ref/);
  assert.doesNotMatch(markdownBlock, /livePreviewOffset\.value/);
});

test('markdown live preview empty state tolerates a null preview during close transitions', () => {
  assert.match(markdownBlock, /\{\{\s*livePreview\?\.error \? 'Preview unavailable' : 'Preparing preview'\s*\}\}/);
  assert.match(markdownBlock, /\{\{\s*livePreview\?\.error \? 'Showing source below\.' : 'Rendering the content for fullscreen view\.'\s*\}\}/);
  assert.doesNotMatch(markdownBlock, /\{\{\s*livePreview\.error \?/);
});

test('markdown live preview restores focus explicitly on close instead of leaving a focused button under aria-hidden', () => {
  assert.match(markdownBlock, /let livePreviewReturnFocusTarget: HTMLElement \| null = null;/);
  assert.match(markdownBlock, /function rememberLivePreviewFocus\(\): void \{[\s\S]*document\.activeElement[\s\S]*livePreviewReturnFocusTarget = activeElement instanceof HTMLElement \? activeElement : null;/);
  assert.match(markdownBlock, /function handleLivePreviewOpenAutoFocus\(event: Event\): void \{[\s\S]*event\.preventDefault\(\);[\s\S]*focusLivePreviewSurface\(\);[\s\S]*\}/);
  assert.match(markdownBlock, /function focusLivePreviewSurface\(\): void \{[\s\S]*livePreviewDialog\.value\?\.focus\(\{ preventScroll: true \}\);[\s\S]*\}/);
  assert.match(markdownBlock, /tabindex="-1"/);
  assert.match(markdownBlock, /function handleLivePreviewCloseAutoFocus\(event: Event\): void \{[\s\S]*event\.preventDefault\(\);[\s\S]*restoreLivePreviewFocus\(\);[\s\S]*\}/);
  assert.match(markdownBlock, /function restoreLivePreviewFocus\(\): void \{[\s\S]*if \(activeElement instanceof HTMLElement && dialog\?\.contains\(activeElement\)\) \{[\s\S]*activeElement\.blur\(\);[\s\S]*\}[\s\S]*restoreTarget\.focus\(\{ preventScroll: true \}\);/);
});

test('markdown live preview scales rendered svg markup with explicit canvas bounds instead of wrapper zoom', () => {
  assert.match(markdownBlock, /const livePreviewScaleWrap = ref<HTMLElement \| null>\(null\);/);
  assert.match(markdownBlock, /const livePreviewNaturalSize = ref\(\{\s*width:\s*0,\s*height:\s*0,\s*}\);/);
  assert.match(markdownBlock, /const livePreviewCanvasStyle = computed<Record<string, string> \| undefined>\(\(\) => \{/);
  assert.match(markdownBlock, /const livePreviewRenderedMarkupStyle = computed<Record<string, string> \| undefined>\(\(\) => \{/);
  assert.match(markdownBlock, /function readLivePreviewSvgNaturalSize\(svg: SVGSVGElement\): \{ width: number; height: number } \{/);
  assert.match(markdownBlock, /function syncLivePreviewNaturalSize\(\): void \{[\s\S]*const wrap = livePreviewScaleWrap\.value;[\s\S]*const svg = wrap\.querySelector\('svg'\);/);
  assert.match(markdownBlock, /transform:\s*`scale\(\$\{livePreviewScale\.value\}\)`/);
  assert.match(markdownBlock, /:style="livePreviewCanvasStyle"/);
  assert.match(markdownBlock, /:style="livePreviewRenderedMarkupStyle"/);
  assert.doesNotMatch(markdownBlock, /class="chat-live-preview-scale-wrap"[\s\S]*:style="livePreviewZoomFit \? undefined : livePreviewZoomStyle"/);
});

test('markdown live preview image export uses theme tokens instead of a hardcoded white canvas', () => {
  assert.match(markdownBlock, /HtmlPreviewThemeTokens/);
  assert.match(markdownBlock, /function readCssToken\(names: string\[\], fallback: string\): string \{/);
  assert.match(markdownBlock, /function readHtmlPreviewThemeTokens\(\): HtmlPreviewThemeTokens \{/);
  assert.match(markdownBlock, /getPropertyValue\(name\)/);
  assert.match(markdownBlock, /'--text'/);
  assert.match(markdownBlock, /'--line'/);
  assert.match(markdownBlock, /function readLivePreviewExportBackground\(\): string \{/);
  assert.match(markdownBlock, /'--modal-panel-bg'/);
  assert.match(markdownBlock, /'--chat-modal-bg'/);
  assert.match(markdownBlock, /'--surface-base'/);
  assert.match(markdownBlock, /renderer\.buildHtmlPreviewDocument\(normalized, currentTheme\(\), readHtmlPreviewThemeTokens\(\)\)/);
  assert.match(markdownBlock, /function prepareOffscreenPreviewContainer\(container: HTMLElement\): void \{/);
  assert.match(markdownBlock, /backgroundColor:\s*readLivePreviewExportBackground\(\)/);
  assert.match(markdownBlock, /prepareOffscreenPreviewContainer\(container\);/);
  assert.doesNotMatch(markdownBlock, /backgroundColor:\s*['"]#ffffff['"]/);
  assert.doesNotMatch(markdownBlock, /background:\s*#fff/);
  assert.doesNotMatch(markdownBlock, /style\.cssText\s*=/);
  assert.match(markdownRenderer, /interface HtmlPreviewThemeTokens/);
  assert.match(markdownRenderer, /themeTokens\?: Partial<HtmlPreviewThemeTokens>/);
  assert.doesNotMatch(markdownRenderer, /#08111c|#142235|rgba\(20,\s*34,\s*53|rgba\(255,\s*255,\s*255/);
});

test('markdown media markup defaults to lazy image decode and non-eager video preload', () => {
  assert.match(markdownRenderer, /loading="lazy"/);
  assert.match(markdownRenderer, /decoding="async"/);
  assert.match(markdownRenderer, /fetchpriority="low"/);
  assert.match(markdownRenderer, /preload="none"/);
});
