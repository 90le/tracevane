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
