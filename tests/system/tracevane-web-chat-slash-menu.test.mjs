import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const composerBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/ComposerBar.vue'),
  'utf8',
);
const slashCommandMenu = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashCommandMenu.vue'),
  'utf8',
);
const slashCommandFeedbackBar = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashCommandFeedbackBar.vue'),
  'utf8',
);
const slashCommandHelpDialog = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashCommandHelpDialog.vue'),
  'utf8',
);
const slashStatusDialog = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashStatusDialog.vue'),
  'utf8',
);
const slashCommandCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/slash-command.css'),
  'utf8',
);
const slashCommandMenuCss = slashCommandCss.split('/* Slash command feedback */')[0];

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
  assert.match(composerBar, /filterTracevaneSlashCommandArgOptionDetails/);
  assert.match(composerBar, /locale\.value/);
});

test('slash command menu exposes accessible command and argument listboxes', () => {
  assert.match(slashCommandMenu, /role="listbox"/);
  assert.match(slashCommandMenu, /role="option"/);
  assert.match(slashCommandMenu, /commandMode/);
  assert.match(slashCommandMenu, /argumentMode/);
  assert.match(slashCommandMenu, /item\.description/);
  assert.match(slashCommandMenu, /item\.label/);
  assert.match(slashCommandMenuCss, /\.chat-slash-menu\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandMenuCss, /\.chat-slash-menu-item\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandMenuCss, /\.chat-slash-menu-badge\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.doesNotMatch(slashCommandMenuCss, /position:\s*absolute;/);
});

test('slash command surfaces share one dedicated css module', () => {
  for (const source of [
    slashCommandMenu,
    slashCommandFeedbackBar,
    slashCommandHelpDialog,
    slashStatusDialog,
  ]) {
    assert.match(source, /import '\.\/slash-command\.css';/);
    assert.doesNotMatch(source, /<style scoped>/);
  }

  assert.match(slashCommandCss, /\.chat-slash-menu\b/);
  assert.match(slashCommandCss, /\.chat-slash-feedback\b/);
  assert.match(slashCommandCss, /\.chat-slash-feedback__dismiss\b/);
  assert.match(slashCommandCss, /\.chat-slash-help-dialog\b/);
  assert.match(slashCommandCss, /\.chat-slash-status-dialog\b/);
  assert.doesNotMatch(slashCommandCss, /:deep|:global/);
});
