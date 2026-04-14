import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
  'utf8',
);

test('conversation pane uses reka dropdown primitives for the session actions menu', () => {
  assert.match(conversationPane, /from 'reka-ui'/);
  assert.match(conversationPane, /DropdownMenuRoot/);
  assert.match(conversationPane, /DropdownMenuTrigger/);
  assert.match(conversationPane, /DropdownMenuPortal/);
  assert.match(conversationPane, /DropdownMenuContent/);
  assert.match(conversationPane, /DropdownMenuItem/);
  assert.match(conversationPane, /<DropdownMenuRoot v-model:open="conversationMenuOpen">/);
  assert.match(conversationPane, /<DropdownMenuTrigger as-child>/);
  assert.match(conversationPane, /class="chat-session-menu-popover"/);
  assert.doesNotMatch(conversationPane, /<details ref="conversationMenu"/);
  assert.doesNotMatch(conversationPane, /<summary class="chat-conversation-pane__ghost">/);
});

test('conversation pane closes menu surfaces via reactive open state instead of HTML details state', () => {
  assert.match(conversationPane, /const conversationMenuOpen = ref\(false\);/);
  assert.match(conversationPane, /function closeMenu\(\): void \{[\s\S]*conversationMenuOpen\.value = false;[\s\S]*mobileActionSheetOpen\.value = false;[\s\S]*\}/);
});
