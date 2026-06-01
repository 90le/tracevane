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

const conversationPaneCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/conversation-pane.css'),
  'utf8',
);const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);

test('rendering settings dialog separates toolbar chrome from scrollable content', () => {
  assert.match(conversationPane, /DialogTitle/);
  assert.match(conversationPane, /DialogDescription/);
  assert.match(conversationPane, /class="chat-rendering-settings-toolbar"/);
  assert.match(conversationPane, /class="chat-rendering-settings-body"/);
});

test('rendering settings dialog constrains height and scrolls internally', () => {
  assert.match(conversationPaneCss, /\.chat-rendering-settings-dialog\s*\{[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\);/);
  assert.match(conversationPaneCss, /\.chat-rendering-settings-dialog\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(conversationPaneCss, /\.chat-rendering-settings-body\s*\{[\s\S]*min-height:\s*0;/);
  assert.match(conversationPaneCss, /\.chat-rendering-settings-body\s*\{[\s\S]*overflow-y:\s*auto;/);
});

test('rendering settings dialog keeps safe bottom space on narrow screens', () => {
  assert.match(conversationPaneCss, /@media \(max-width:\s*760px\)\s*\{[\s\S]*\.chat-rendering-settings-body\s*\{[\s\S]*safe-area-inset-bottom/);
});

test('rendering settings dialog exposes message sound cues with bilingual copy', () => {
  assert.match(conversationPane, /消息提示音/);
  assert.match(conversationPane, /Message sound cues/);
  assert.match(conversationPane, /发送成功和助手开始回复时播放短提示音/);
  assert.match(conversationPane, /Play a short cue when a message is sent and when the assistant starts replying/);
  assert.match(conversationPane, /Enabled by default and can be turned off anytime/);
  assert.match(conversationPane, /chat-rendering-settings-state-pill/);
  assert.match(conversationPane, /soundCuesEnabled/);
  assert.match(conversationPane, /toggle-sound-cues/);
});

test('chat shell wires persisted sound-cue preferences into the conversation pane', () => {
  assert.match(chatShellPage, /readChatSoundCuesEnabled/);
  assert.match(chatShellPage, /writeChatSoundCuesEnabled/);
  assert.match(chatShellPage, /:sound-cues-enabled="soundCuesEnabled"/);
  assert.match(chatShellPage, /@toggle-sound-cues="soundCuesEnabled = \$event"/);
  assert.match(chatShellPage, /playChatCueSafely\('sent'/);
  assert.match(chatShellPage, /playChatCueSafely\('received'/);
});
