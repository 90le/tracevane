import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ConversationPane.vue'),
  'utf8',
);
const slashFeedbackBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashCommandFeedbackBar.vue'),
  'utf8',
);
const slashCommandCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/slash-command.css'),
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

test('slash feedback bar owns behavior while shared css owns presentation', () => {
  assert.match(slashFeedbackBar, /describeStudioSlashExecutionFeedback/);
  assert.match(slashFeedbackBar, /phase === 'running'/);
  assert.match(slashFeedbackBar, /phase === 'accepted'/);
  assert.match(slashFeedbackBar, /import '\.\/slash-command\.css';/);
  assert.doesNotMatch(slashFeedbackBar, /<style scoped>/);
  assert.match(slashCommandCss, /\.chat-slash-feedback\s*\{[\s\S]*border-radius:\s*14px;/);
  assert.match(slashCommandCss, /\.chat-slash-feedback__dismiss\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(slashCommandCss, /@keyframes chat-slash-feedback-progress/);
});
