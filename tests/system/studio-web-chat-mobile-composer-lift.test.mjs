import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ComposerBar.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ConversationPane.vue'),
  'utf8',
);

const conversationPaneCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/conversation-pane.css'),
  'utf8',
);
test('composer bar tracks compact-viewport keyboard lift from visualViewport', () => {
  assert.match(composerBar, /window\.visualViewport/);
  assert.match(composerBar, /const keyboardLiftPx = ref\(0\)/);
  assert.match(composerBar, /function syncKeyboardLiftFromViewport\(\): void \{/);
  assert.match(composerBar, /emit\('viewport-lift', nextValue\)/);
  assert.match(composerBar, /@focus="handleEditorFocus"/);
  assert.match(composerBar, /--chat-composer-keyboard-offset/);
});

test('conversation pane lifts the mobile footer chrome with the composer keyboard offset', () => {
  assert.match(conversationPane, /@viewport-lift="handleComposerViewportLift"/);
  assert.match(conversationPane, /const mobileComposerLift = ref\(0\)/);
  assert.match(conversationPane, /'--chat-mobile-composer-lift':/);
  assert.match(conversationPaneCss, /--chat-mobile-composer-lift:\s*0px;/);
  assert.match(conversationPaneCss, /transform:\s*translateY\(calc\(var\(--chat-mobile-composer-lift, 0px\) \* -1\)\);/);
});
