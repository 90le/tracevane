import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const picker = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/NewChatAgentPicker.vue'),
  'utf8',
);

test('new chat agent picker uses reka dialog primitives instead of a hand-rolled teleported mask', () => {
  assert.match(picker, /from 'reka-ui'/);
  assert.match(picker, /DialogRoot/);
  assert.match(picker, /DialogPortal/);
  assert.match(picker, /DialogOverlay/);
  assert.match(picker, /DialogContent/);
  assert.match(picker, /DialogClose/);
  assert.match(picker, /<DialogRoot :open="open" @update:open="handleOpenChange">/);
  assert.match(picker, /<DialogOverlay class="chat-agent-picker-mask"\s*\/>/);
  assert.match(picker, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.doesNotMatch(picker, /<Teleport to="body">/);
  assert.doesNotMatch(picker, /@click\.self="\$emit\('close'\)"/);
});

test('new chat agent picker closes through a controlled open handler', () => {
  assert.match(picker, /function handleOpenChange\(nextOpen: boolean\): void \{/);
  assert.match(picker, /if \(!nextOpen\) \{\s*emit\('close'\);\s*\}/);
});
