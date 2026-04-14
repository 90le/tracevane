import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
  'utf8',
);

test('chat shell tracks a selected slash feedback state and passes it into the conversation pane', () => {
  assert.match(chatShellPage, /selectedSlashFeedback/);
  assert.match(chatShellPage, /@dismiss-slash-feedback=/);
  assert.match(chatShellPage, /:slash-feedback="selectedSlashFeedback"/);
});

test('conversation pane renders a dedicated slash feedback bar above the thread body', () => {
  assert.match(conversationPane, /SlashCommandFeedbackBar/);
  assert.match(conversationPane, /chat-conversation-pane__slash-feedback/);
  assert.match(conversationPane, /@dismiss="\$emit\('dismiss-slash-feedback'\)"/);
});
