import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ComposerBar.vue'),
  'utf8',
);
const composerBarCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/composer-bar.css'),
  'utf8',
);

test('composer attachment preview uses reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(composerBar, /import '\.\/composer-bar\.css';/);
  assert.doesNotMatch(composerBar, /<style scoped>/);
  assert.match(composerBar, /from 'reka-ui'/);
  assert.match(composerBar, /DialogRoot/);
  assert.match(composerBar, /DialogPortal/);
  assert.match(composerBar, /DialogOverlay/);
  assert.match(composerBar, /DialogContent/);
  assert.match(composerBar, /DialogClose/);
  assert.match(composerBar, /<DialogRoot :open="Boolean\(attachmentPreview\)" @update:open="handleAttachmentPreviewOpenChange">/);
  assert.match(composerBar, /<DialogOverlay class="chat-composer-preview-mask"\s*\/>/);
  assert.match(composerBar, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.doesNotMatch(composerBar, /<Teleport to="body">/);
  assert.doesNotMatch(composerBar, /role="dialog"/);
  assert.doesNotMatch(composerBar, /@click\.self="closeAttachmentPreview"/);
});

test('composer attachment preview closes through a controlled open handler', () => {
  assert.match(composerBar, /function handleAttachmentPreviewOpenChange\(nextOpen: boolean\): void \{/);
  assert.match(composerBar, /if \(!nextOpen\) \{\s*closeAttachmentPreview\(\);\s*\}/);
});

test('composer attachment preview content is layered above its mask', () => {
  assert.match(composerBarCss, /\.chat-composer-preview-mask\s*\{[\s\S]*z-index:\s*80;/);
  assert.match(composerBarCss, /\.chat-composer-preview-dialog\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(composerBarCss, /\.chat-composer-preview-dialog\s*\{[\s\S]*z-index:\s*81;/);
  assert.doesNotMatch(composerBarCss, /:global|:deep/);
});
