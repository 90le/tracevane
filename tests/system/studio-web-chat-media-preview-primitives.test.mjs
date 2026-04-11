import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const messageBubble = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/MessageBubble.vue'),
  'utf8',
);

test('message media preview uses reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(messageBubble, /from 'reka-ui'/);
  assert.match(messageBubble, /DialogRoot/);
  assert.match(messageBubble, /DialogPortal/);
  assert.match(messageBubble, /DialogOverlay/);
  assert.match(messageBubble, /DialogContent/);
  assert.match(messageBubble, /DialogClose/);
  assert.match(messageBubble, /<DialogRoot :open="Boolean\(mediaPreview\)" @update:open="handleMediaPreviewOpenChange">/);
  assert.match(messageBubble, /<DialogOverlay class="chat-image-preview-mask"\s*\/>/);
  assert.match(messageBubble, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.doesNotMatch(messageBubble, /<Teleport to="body">/);
  assert.doesNotMatch(messageBubble, /role="dialog"/);
  assert.doesNotMatch(messageBubble, /@click\.self="closeMediaPreview"/);
});

test('message media preview closes through a controlled open handler', () => {
  assert.match(messageBubble, /function handleMediaPreviewOpenChange\(nextOpen: boolean\): void \{/);
  assert.match(messageBubble, /if \(!nextOpen\) \{\s*closeMediaPreview\(\);\s*\}/);
});

test('message media preview content is layered above its mask', () => {
  assert.match(messageBubble, /\.chat-image-preview-mask\s*\{[\s\S]*z-index:\s*1200;/);
  assert.match(messageBubble, /\.chat-image-preview-dialog\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(messageBubble, /\.chat-image-preview-dialog\s*\{[\s\S]*z-index:\s*1201;/);
});
