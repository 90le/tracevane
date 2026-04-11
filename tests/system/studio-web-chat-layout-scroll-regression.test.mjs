import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const styleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');
const appVue = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/App.vue'), 'utf8');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const sessionListPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionListPanel.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
  'utf8',
);

test('app shell uses a direct route host so chat is not boxed inside extra shell wrappers', () => {
  assert.match(appVue, /class="main-content shell-main" :class="\{ 'chat-surface-route': isChatSurface, 'shell-main-chat': isChatSurface \}"/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.doesNotMatch(appVue, /class="shell-stage-surface"/);
  assert.doesNotMatch(appVue, /class="shell-canvas"/);
});

test('chat route shell establishes an unbroken full-height chain without centered boxed canvases', () => {
  assert.match(styleCss, /\.main-content\.chat-surface-route\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/);
  assert.match(styleCss, /\.main-content\.chat-surface-route\s*\{[\s\S]*height:\s*100dvh;/);
  assert.match(styleCss, /\.main-content\.chat-surface-route\s*\{[\s\S]*overflow:\s*hidden;/);
  assert.match(styleCss, /\.main-content\.chat-surface-route\s+\.shell-route-stage\s*\{[\s\S]*display:\s*flex;[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/);
  assert.match(styleCss, /\.main-content\.chat-surface-route\s+\.shell-route-stage\s*>\s*\*\s*\{[\s\S]*flex:\s*1 1 auto;[\s\S]*min-height:\s*0;[\s\S]*height:\s*100%;/);
  assert.doesNotMatch(styleCss, /\.shell-stage-surface-chat\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-canvas-chat\s*\{/);
});

test('chat page keeps independent list and thread scrollers inside the full-height shell', () => {
  assert.match(chatShellPage, /\.chat-shell-layout\s*\{[\s\S]*height:\s*100%;[\s\S]*overflow:\s*hidden;/);
  assert.match(sessionListPanel, /\.chat-shell-session-list__body\s*\{[\s\S]*overflow:\s*auto;/);
  assert.match(conversationPane, /\.chat-conversation-thread\s*\{[\s\S]*overflow:\s*auto;/);
});
