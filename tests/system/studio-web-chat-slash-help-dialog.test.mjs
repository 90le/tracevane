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
const slashHelpDialog = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/SlashCommandHelpDialog.vue'),
  'utf8',
);
const slashCommandCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat/slash-command.css'),
  'utf8',
);

test('chat shell wires a local slash help dialog for /help and /commands', () => {
  assert.match(chatShellPage, /defineAsyncComponent\(\(\) => import\('\.\/SlashCommandHelpDialog\.vue'\)\)/);
  assert.match(chatShellPage, /<SlashCommandHelpDialog/);
  assert.match(chatShellPage, /<SlashCommandHelpDialog\s+v-if="slashHelpOpen"/);
  assert.match(chatShellPage, /openSlashHelpDialog/);
  assert.match(chatShellPage, /case 'help':/);
});

test('slash help dialog uses reka dialog primitives for the command catalog surface', () => {
  assert.match(slashHelpDialog, /from 'reka-ui'/);
  assert.match(slashHelpDialog, /DialogRoot/);
  assert.match(slashHelpDialog, /DialogPortal/);
  assert.match(slashHelpDialog, /DialogOverlay/);
  assert.match(slashHelpDialog, /DialogContent/);
  assert.match(slashHelpDialog, /DialogClose/);
  assert.match(slashHelpDialog, /DialogTitle/);
  assert.match(slashHelpDialog, /DialogDescription/);
  assert.match(slashHelpDialog, /<DialogRoot :open="open" @update:open="handleOpenChange">/);
  assert.match(slashHelpDialog, /<DialogOverlay class="chat-slash-help-mask"\s*\/>/);
  assert.match(slashHelpDialog, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.match(slashHelpDialog, /<DialogTitle as-child>[\s\S]*<span class="sr-only">\{\{ text\('斜杠命令', 'Slash commands'\) \}\}<\/span>/);
  assert.match(slashHelpDialog, /<DialogDescription as-child>[\s\S]*<span class="sr-only">\{\{ text\('查看并插入 Studio Chat 支持的斜杠命令。', 'Review and insert slash commands supported by Studio Chat\.'\) \}\}<\/span>/);
  assert.match(slashHelpDialog, /Insert command/);
  assert.match(slashHelpDialog, /getStudioSlashCommandDescription/);
  assert.match(slashHelpDialog, /import '\.\/slash-command\.css';/);
  assert.doesNotMatch(slashHelpDialog, /<style scoped>/);
  assert.match(slashCommandCss, /\.chat-slash-help-dialog\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandCss, /\.chat-slash-help-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-slash-help-mask-in 0\.2s ease;/);
  assert.match(slashCommandCss, /\.chat-slash-help-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-slash-help-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/);
  assert.match(slashCommandCss, /\.chat-slash-help-row\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashCommandCss, /\.chat-slash-help-badge\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(slashCommandCss, /@keyframes chat-slash-help-mask-in/);
  assert.match(slashCommandCss, /@keyframes chat-slash-help-dialog-in/);
  assert.match(slashCommandCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(slashCommandCss, /border-radius:\s*12px 12px 10px 10px;/);
  assert.doesNotMatch(slashHelpDialog, /<Teleport to="body">/);
  assert.doesNotMatch(slashHelpDialog, /role="dialog"/);
  assert.doesNotMatch(slashHelpDialog, /@click\.self="\$emit\('close'\)"/);
});
