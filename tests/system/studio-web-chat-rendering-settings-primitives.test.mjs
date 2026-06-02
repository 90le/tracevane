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
  assert.doesNotMatch(conversationPane, /<div[^>]*role="dialog"[^>]*class="chat-rendering-settings-dialog"|class="chat-rendering-settings-dialog"[^>]*role="dialog"/);
});

test('rendering settings restore focus to the stable menu trigger after close', () => {
  assert.match(conversationPane, /ref="conversationMenuTrigger"/);
  assert.match(conversationPane, /ref="mobileActionSheetTrigger"/);
  assert.match(conversationPane, /const conversationMenuTrigger = ref<HTMLButtonElement \| null>\(null\);/);
  assert.match(conversationPane, /const mobileActionSheetTrigger = ref<HTMLButtonElement \| null>\(null\);/);
  assert.match(conversationPane, /const renderingSettingsReturnFocus = ref<HTMLElement \| null>\(null\);/);
  assert.match(conversationPane, /function renderingSettingsFallbackTrigger\(\): HTMLButtonElement \| null \{/);
  assert.match(conversationPane, /isCompactViewport\.value \? mobileActionSheetTrigger\.value : conversationMenuTrigger\.value/);
  assert.match(conversationPane, /function rememberRenderingSettingsReturnFocus\(\): void \{/);
  assert.match(conversationPane, /active\?\.closest\('\.chat-session-menu-popover, \.chat-conversation-pane__mobile-sheet'\)/);
  assert.match(conversationPane, /function restoreRenderingSettingsReturnFocus\(\): void \{/);
  assert.match(conversationPane, /returnTarget\.focus\(\{ preventScroll: true \}\);/);
  assert.match(conversationPane, /renderingSettingsFallbackTrigger\(\)\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(conversationPane, /function openRenderingSettings\(\): void \{[\s\S]*rememberRenderingSettingsReturnFocus\(\);[\s\S]*closeMenu\(\);/);
  assert.match(conversationPane, /watch\(renderingSettingsOpen, \(open, previousOpen\) => \{[\s\S]*restoreRenderingSettingsReturnFocus\(\);/);
});
