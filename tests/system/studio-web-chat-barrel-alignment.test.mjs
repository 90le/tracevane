import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const legacyChatIndex = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/index.ts'),
  'utf8',
);
const legacyChatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);
const legacyChatHomePage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatHomePage.vue'),
  'utf8',
);
const legacyChatSessionPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatSessionPage.vue'),
  'utf8',
);
const legacyChatWorkbenchPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatWorkbenchPage.vue'),
  'utf8',
);
const chatV2Index = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/index.ts'),
  'utf8',
);

test('legacy chat barrel re-exports the canonical chat-v2 surface instead of local duplicate pages', () => {
  assert.match(chatV2Index, /export \{ default as ChatShellPage \} from '\.\/ChatShellPage\.vue';/);
  assert.match(legacyChatIndex, /from '\.\.\/chat-v2';/);
  assert.doesNotMatch(legacyChatIndex, /from '\.\/ChatShellPage\.vue';/);
  assert.doesNotMatch(legacyChatIndex, /from '\.\/ChatHomePage\.vue';/);
  assert.doesNotMatch(legacyChatIndex, /from '\.\/ChatSessionPage\.vue';/);
  assert.doesNotMatch(legacyChatIndex, /from '\.\/ChatWorkbenchPage\.vue';/);
});

test('legacy chat page files proxy into chat-v2 so old imports cannot drift onto stale implementations', () => {
  assert.match(legacyChatShellPage, /import ChatShellPageV2 from '\.\.\/chat-v2\/ChatShellPage\.vue';/);
  assert.match(legacyChatShellPage, /<ChatShellPageV2 :shell-mode="props\.shellMode" \/>/);
  assert.match(legacyChatHomePage, /<ChatShellPageV2 shell-mode="chat" \/>/);
  assert.match(legacyChatSessionPage, /<ChatShellPageV2 shell-mode="chat" \/>/);
  assert.match(legacyChatWorkbenchPage, /<ChatShellPageV2 shell-mode="inspect" \/>/);
});
