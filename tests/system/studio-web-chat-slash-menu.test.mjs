import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ComposerBar.vue'),
  'utf8',
);
const slashCommandMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SlashCommandMenu.vue'),
  'utf8',
);

test('composer bar wires a slash command menu with bilingual discoverability', () => {
  assert.match(composerBar, /import SlashCommandMenu from '\.\/SlashCommandMenu\.vue'/);
  assert.match(composerBar, /DialogDescription/);
  assert.match(composerBar, /DialogTitle/);
  assert.match(composerBar, /PopoverAnchor/);
  assert.match(composerBar, /PopoverContent/);
  assert.match(composerBar, /PopoverPortal/);
  assert.match(composerBar, /PopoverRoot/);
  assert.match(composerBar, /PopoverTrigger/);
  assert.match(composerBar, /<SlashCommandMenu/);
  assert.match(composerBar, /<PopoverRoot :open="!isCompactViewport && slashMenuOpen" @update:open="handleSlashMenuOpenChange">/);
  assert.match(composerBar, /<PopoverAnchor as-child>/);
  assert.match(composerBar, /class="chat-slash-menu-popover"/);
  assert.match(composerBar, /class="chat-slash-sheet-mask"/);
  assert.match(composerBar, /class="chat-slash-sheet"/);
  assert.match(composerBar, /compactViewportMediaQuery = window\.matchMedia\('\(max-width: 760px\)'\)/);
  assert.match(composerBar, /slashMenuOpen/);
  assert.match(composerBar, /Ctrl\/Cmd\+Enter 发送/);
  assert.match(composerBar, /输入 \/ 打开命令菜单/);
  assert.match(composerBar, /filterStudioSlashCommandArgOptionDetails/);
  assert.match(composerBar, /locale\.value/);
});

test('slash command menu exposes accessible command and argument listboxes', () => {
  assert.match(slashCommandMenu, /role="listbox"/);
  assert.match(slashCommandMenu, /role="option"/);
  assert.match(slashCommandMenu, /commandMode/);
  assert.match(slashCommandMenu, /argumentMode/);
  assert.match(slashCommandMenu, /item\.description/);
  assert.match(slashCommandMenu, /item\.label/);
  assert.match(slashCommandMenu, /\.chat-slash-menu\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandMenu, /\.chat-slash-menu-item\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandMenu, /\.chat-slash-menu-badge\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.doesNotMatch(slashCommandMenu, /position:\s*absolute;/);
});
