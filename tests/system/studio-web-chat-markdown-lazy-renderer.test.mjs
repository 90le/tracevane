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

function sourceBlock(startPattern) {
  const match = markdownBlock.match(startPattern);
  return match?.[0] || '';
}

test('chat markdown renderer is dynamically loaded after the message component mounts', () => {
  assert.match(markdownBlock, /import type \{[\s\S]*ChatMarkdownRenderResult[\s\S]*\} from '\.\/markdown';/);
  assert.match(markdownBlock, /type MarkdownRendererModule = typeof import\('\.\/markdown'\);/);
  assert.match(markdownBlock, /markdownRendererLoader = import\('\.\/markdown'\);/);
  assert.match(markdownBlock, /if \(!componentMounted\) \{[\s\S]*return;[\s\S]*let renderer: MarkdownRendererModule;/);
  assert.doesNotMatch(markdownBlock, /from '\.\/markdown\.ts';/);
  assert.doesNotMatch(markdownBlock, /renderChatMarkdownResult,\s*$/m);
  assert.doesNotMatch(markdownBlock, /renderHighlightedCodeHtml,\s*$/m);
});

test('chat markdown async fallback escapes source and keeps long text inside the bubble', () => {
  assert.match(markdownBlock, /function escapeHtml\(value: string\): string \{/);
  assert.match(markdownBlock, /\.replace\(\/\\n\/g, '<br>'\)/);
  assert.match(markdownBlock, /chat-markdown-loading-fallback/);
  assert.match(markdownBlockCss, /\.chat-markdown-loading-fallback\s*\{[\s\S]*overflow-wrap:\s*anywhere;/);
  assert.match(markdownBlockCss, /\.chat-markdown-loading-fallback\s*\{[\s\S]*white-space:\s*normal;/);
});

test('chat markdown preview globals are bound only while previews need them', () => {
  const mountedBlock = sourceBlock(/onMounted\(\(\) => \{[\s\S]*?\n\}\);/);
  const unmountedBlock = sourceBlock(/onBeforeUnmount\(\(\) => \{[\s\S]*?\n\}\);/);
  assert.match(markdownBlock, /let livePreviewWindowEventsBound = false;/);
  assert.match(markdownBlock, /let htmlPreviewMessageListenerBound = false;/);
  assert.match(markdownBlock, /let inlinePreviewPrefListenerBound = false;/);
  assert.match(markdownBlock, /function bindLivePreviewWindowEvents\(\): void \{/);
  assert.match(markdownBlock, /function bindHtmlPreviewMessageListener\(\): void \{/);
  assert.match(markdownBlock, /function bindInlinePreviewPreferenceListener\(\): void \{/);
  assert.match(markdownBlock, /function unbindInlinePreviewPreferenceListener\(\): void \{/);
  assert.match(markdownBlock, /function handleInlinePreviewPreferenceChange\(\{[\s\S]*scope,[\s\S]*sessionKey,/);
  assert.match(markdownBlock, /function bindPreviewThemeObserver\(\): void \{/);
  assert.match(markdownBlock, /function syncPreviewRuntimeBindings\(\): void \{[\s\S]*if \(livePreview\.value\) \{[\s\S]*bindLivePreviewWindowEvents\(\);[\s\S]*const needsPreviewRuntime = rendered\.value\.hasPreviewBlocks \|\| livePreview\.value;[\s\S]*if \(needsPreviewRuntime\) \{[\s\S]*bindHtmlPreviewMessageListener\(\);[\s\S]*bindPreviewThemeObserver\(\);[\s\S]*bindInlinePreviewPreferenceListener\(\);[\s\S]*\} else \{[\s\S]*unbindHtmlPreviewMessageListener\(\);[\s\S]*unbindPreviewThemeObserver\(\);[\s\S]*unbindInlinePreviewPreferenceListener\(\);/);
  assert.match(mountedBlock, /syncPreviewRuntimeBindings\(\);/);
  assert.doesNotMatch(mountedBlock, /window\.addEventListener\('keydown'/);
  assert.doesNotMatch(mountedBlock, /window\.addEventListener\('message'/);
  assert.doesNotMatch(mountedBlock, /listenInlinePreviewPreferenceChange/);
  assert.doesNotMatch(mountedBlock, /new MutationObserver/);
  assert.match(markdownBlock, /unbindLivePreviewWindowEvents\(\);[\s\S]*unbindHtmlPreviewMessageListener\(\);[\s\S]*unbindPreviewThemeObserver\(\);/);
  assert.match(unmountedBlock, /unbindInlinePreviewPreferenceListener\(\);/);
});
