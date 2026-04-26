import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chatShellPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/ChatShellPage.vue'),
  'utf8',
);
const slashStatusDialog = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/chat-v2/SlashStatusDialog.vue'),
  'utf8',
);

test('chat shell wires a local slash status dialog', () => {
  assert.match(chatShellPage, /defineAsyncComponent\(\(\) => import\('\.\/SlashStatusDialog\.vue'\)\)/);
  assert.match(chatShellPage, /<SlashStatusDialog/);
  assert.match(chatShellPage, /<SlashStatusDialog\s+v-if="slashStatusOpen"/);
  assert.match(chatShellPage, /openSlashStatusDialog/);
  assert.match(chatShellPage, /case 'status':/);
});

test('slash status dialog uses reka dialog primitives for the current-status surface', () => {
  assert.match(slashStatusDialog, /from 'reka-ui'/);
  assert.match(slashStatusDialog, /DialogRoot/);
  assert.match(slashStatusDialog, /DialogPortal/);
  assert.match(slashStatusDialog, /DialogOverlay/);
  assert.match(slashStatusDialog, /DialogContent/);
  assert.match(slashStatusDialog, /DialogClose/);
  assert.match(slashStatusDialog, /<DialogRoot :open="open" @update:open="handleOpenChange">/);
  assert.match(slashStatusDialog, /<DialogOverlay class="chat-slash-status-mask"\s*\/>/);
  assert.match(slashStatusDialog, /<DialogContent as-child @open-auto-focus\.prevent @close-auto-focus\.prevent>/);
  assert.match(slashStatusDialog, /Current status/);
  assert.match(slashStatusDialog, /Queue/);
  assert.match(slashStatusDialog, /Runtime/);
  assert.match(slashStatusDialog, /\.chat-slash-status-dialog\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashStatusDialog, /\.chat-slash-status-mask\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-slash-status-mask-in 0\.2s ease;/);
  assert.match(slashStatusDialog, /\.chat-slash-status-dialog\[data-state='open'\]\s*\{[\s\S]*animation:\s*chat-slash-status-dialog-in 0\.24s cubic-bezier\(0\.22,\s*1,\s*0\.36,\s*1\);/);
  assert.match(slashStatusDialog, /\.chat-slash-status-card\s*\{[\s\S]*border-radius:\s*12px;/);
  assert.match(slashStatusDialog, /\.chat-slash-status-warning\s*\{[\s\S]*border-radius:\s*10px;/);
  assert.match(slashStatusDialog, /@keyframes chat-slash-status-mask-in/);
  assert.match(slashStatusDialog, /@keyframes chat-slash-status-dialog-in/);
  assert.match(slashStatusDialog, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(slashStatusDialog, /border-radius:\s*12px 12px 10px 10px;/);
  assert.doesNotMatch(slashStatusDialog, /<Teleport to="body">/);
  assert.doesNotMatch(slashStatusDialog, /role="dialog"/);
  assert.doesNotMatch(slashStatusDialog, /@click\.self="\$emit\('close'\)"/);
});
