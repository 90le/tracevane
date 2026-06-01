import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slashCommandsSource = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/slash-commands.ts'),
  'utf8',
);
const chatShellPageSource = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ChatShellPage.vue'),
  'utf8',
);

function collectLocalActions(source) {
  const matches = [...source.matchAll(/localAction:\s*'([^']+)'/g)];
  return [...new Set(matches.map((match) => match[1]).filter(Boolean))].sort();
}

test('slash command catalog no longer exposes executeMode=send entries', () => {
  assert.doesNotMatch(slashCommandsSource, /executeMode:\s*'send'/);
});

test('every slash localAction is wired into the chat shell local dispatcher', () => {
  const localActions = collectLocalActions(slashCommandsSource);
  for (const action of localActions) {
    assert.match(
      chatShellPageSource,
      new RegExp(`case '${action}':`),
      `Missing localAction dispatch case for '${action}' in ChatShellPage.vue`,
    );
  }
});
