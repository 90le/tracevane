import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/CascadeMenu.vue'),
  'utf8',
);
const sessionContextMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SessionContextMenu.vue'),
  'utf8',
);
const folderPickerMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/FolderPickerMenu.vue'),
  'utf8',
);

test('top-level chat context menu is positioned from the click point instead of being offset to the right', () => {
  assert.match(cascadeMenu, /<DropdownMenuContent[\s\S]*side="bottom"/);
  assert.match(cascadeMenu, /<DropdownMenuContent[\s\S]*align="start"/);
  assert.match(cascadeMenu, /<DropdownMenuContent[\s\S]*:avoid-collisions="false"/);
  assert.match(cascadeMenu, /<DropdownMenuContent[\s\S]*position-strategy="fixed"/);
  assert.doesNotMatch(cascadeMenu, /<DropdownMenuContent[\s\S]*side="right"/);
  assert.doesNotMatch(cascadeMenu, /transform:\s*translate\(-50%,\s*-50%\);/);
});

test('closed session context menus unmount instead of leaving a closed popper wrapper behind', () => {
  assert.match(sessionContextMenu, /<Teleport to="body" v-if="open">/);
  assert.match(folderPickerMenu, /<Teleport to="body" v-if="open">/);
});
