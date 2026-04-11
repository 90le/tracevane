import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const conversationPane = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ConversationPane.vue'),
  'utf8',
);
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ComposerBar.vue'),
  'utf8',
);
const slashCommands = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/slash-commands.ts'),
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
