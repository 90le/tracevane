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
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ComposerBar.vue'),
  'utf8',
);
const slashCommands = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/slash-commands.ts'),
  'utf8',
);

test('chat shell derives slash model candidates from config summary and passes them downward', () => {
  assert.match(chatShellPage, /const slashArgOptionsOverrides = ref<Record<string, string\[]>>\(\{\}\)/);
  assert.match(chatShellPage, /deriveSlashModelOptionsFromConfigSummary/);
  assert.match(chatShellPage, /fetchConfigSummary\(\)/);
  assert.match(chatShellPage, /:slash-arg-options-overrides="slashArgOptionsOverrides"/);
});

test('conversation pane and composer bar plumb slash arg option overrides into the slash menu', () => {
  assert.match(conversationPane, /slashArgOptionsOverrides: Record<string, string\[]>/);
  assert.match(conversationPane, /:slash-arg-options-overrides="slashArgOptionsOverrides"/);
  assert.match(composerBar, /slashArgOptionsOverrides: Record<string, string\[]>/);
  assert.match(composerBar, /getStudioSlashCommandArgOptions/);
});

test('slash command helpers expose a dynamic arg-option resolver', () => {
  assert.match(slashCommands, /export function getStudioSlashCommandArgOptions\(/);
  assert.match(slashCommands, /overrideOptions/);
});
