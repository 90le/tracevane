import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cascadeMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/CascadeMenu.vue'),
  'utf8',
);
const cascadeMenuNode = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/CascadeMenuNode.vue'),
  'utf8',
);

test('cascade menu uses reka dropdown primitives instead of a hand-rolled teleported menu tree', () => {
  assert.match(cascadeMenu, /from 'reka-ui'/);
  assert.match(cascadeMenu, /DropdownMenuRoot/);
  assert.match(cascadeMenu, /DropdownMenuTrigger/);
  assert.match(cascadeMenu, /DropdownMenuPortal/);
  assert.match(cascadeMenu, /DropdownMenuContent/);
  assert.match(cascadeMenu, /<DropdownMenuRoot :open="open" :modal="false" @update:open="handleOpenChange">/);
  assert.match(cascadeMenu, /<DropdownMenuTrigger as-child>/);
  assert.match(cascadeMenu, /class="cascade-menu-anchor"/);
  assert.match(cascadeMenu, /class="cascade-menu"/);
  assert.doesNotMatch(cascadeMenu, /<Teleport to="body">/);
  assert.doesNotMatch(cascadeMenu, /window\.addEventListener\('mousedown'/);
  assert.doesNotMatch(cascadeMenu, /window\.addEventListener\('contextmenu'/);
});

test('cascade menu renders nested submenu items through reka sub-menu primitives', () => {
  assert.match(cascadeMenuNode, /from 'reka-ui'/);
  assert.match(cascadeMenuNode, /DropdownMenuItem/);
  assert.match(cascadeMenuNode, /DropdownMenuSub/);
  assert.match(cascadeMenuNode, /DropdownMenuSubContent/);
  assert.match(cascadeMenuNode, /DropdownMenuSubTrigger/);
  assert.match(cascadeMenuNode, /<DropdownMenuSub>/);
  assert.match(cascadeMenuNode, /<DropdownMenuSubTrigger/);
  assert.match(cascadeMenuNode, /<DropdownMenuSubContent/);
});
