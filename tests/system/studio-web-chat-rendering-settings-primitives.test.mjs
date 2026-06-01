import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ConversationPane.vue'),
  'utf8',
);

test('rendering settings use reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(conversationPane, /from 'reka-ui'/);
  assert.match(conversationPane, /DialogRoot/);
  assert.match(conversationPane, /DialogPortal/);
  assert.match(conversationPane, /DialogOverlay/);
  assert.match(conversationPane, /DialogContent/);
  assert.match(conversationPane, /DialogClose/);
  assert.match(conversationPane, /DialogTitle/);
  assert.match(conversationPane, /DialogDescription/);
  assert.match(conversationPane, /<DialogRoot v-model:open="renderingSettingsOpen">/);
  assert.match(conversationPane, /<DialogPortal>/);
  assert.match(conversationPane, /<DialogOverlay class="chat-rendering-settings-mask"\s*\/>/);
  assert.match(conversationPane, /<DialogContent as-child @close-auto-focus\.prevent>/);
  assert.doesNotMatch(conversationPane, /<Teleport to="body">/);
  assert.doesNotMatch(conversationPane, /role="dialog"/);
});
