import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatFeatureDir = path.join(rootDir, 'apps/web-vue/src/features/chat');
const removedVersionedChatDirName = ['chat', 'v2'].join('-');
const chatIndex = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/index.ts'),
  'utf8',
);
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);
const chatHomePage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatHomePage.vue'),
  'utf8',
);
const chatSessionPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatSessionPage.vue'),
  'utf8',
);
const chatWorkbenchPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatWorkbenchPage.vue'),
  'utf8',
);
const canonicalImplementationFiles = [
  'ComposerBar.vue',
  'ConversationPane.vue',
  'NewChatAgentPicker.vue',
  'MessageBubble.vue',
  'InspectorPanel.vue',
  'SessionListPanel.vue',
  'display-adapter.ts',
  'message-groups.ts',
];

test('chat barrel exports the canonical chat surface from the unified feature folder', () => {
  assert.match(chatIndex, /export \{ default as ChatShellPage \} from '\.\/ChatShellPage\.vue';/);
  assert.match(chatIndex, /export \{ default as ChatHomePage \} from '\.\/ChatHomePage\.vue';/);
  assert.match(chatIndex, /export \{ default as ChatSessionPage \} from '\.\/ChatSessionPage\.vue';/);
  assert.match(chatIndex, /export \{ default as ChatWorkbenchPage \} from '\.\/ChatWorkbenchPage\.vue';/);
  assert.doesNotMatch(chatIndex, new RegExp(removedVersionedChatDirName));
  assert.doesNotMatch(chatIndex, /from '\.\.\/chat';/);
});

test('chat pages are real implementations instead of compatibility proxies', () => {
  for (const source of [chatShellPage, chatHomePage, chatSessionPage, chatWorkbenchPage]) {
    assert.doesNotMatch(source, new RegExp(`ChatShellPage${'V2'}`));
    assert.doesNotMatch(source, /\.\.\/chat\/ChatShellPage\.vue/);
  }
  assert.match(chatShellPage, /class="chat-shell"/);
  assert.match(chatHomePage, /<ChatShellPage shell-mode="chat" \/>/);
  assert.match(chatSessionPage, /<ChatShellPage shell-mode="chat" \/>/);
  assert.match(chatWorkbenchPage, /<ChatShellPage shell-mode="inspect" \/>/);
});

test('chat feature has one implementation folder and no versioned sibling', () => {
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features', removedVersionedChatDirName)),
    false,
  );
  for (const fileName of canonicalImplementationFiles) {
    assert.equal(
      fs.existsSync(path.join(chatFeatureDir, fileName)),
      true,
      `${fileName} should live in the unified chat implementation`,
    );
  }
});
