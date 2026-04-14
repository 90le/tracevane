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

test('host-management exec toggle uses a custom chat dialog instead of browser confirm', () => {
  const toggleBlock = chatShellPage.match(
    /async function toggleSessionHostManagementExec[\s\S]*?\n}\n\nfunction handleHostManagementExecConfirmOpenChange/,
  );

  assert.match(chatShellPage, /DialogClose/);
  assert.match(chatShellPage, /DialogDescription/);
  assert.match(chatShellPage, /DialogTitle/);
  assert.match(chatShellPage, /hostManagementExecConfirmOpen/);
  assert.match(chatShellPage, /pendingHostManagementExecValue/);
  assert.match(chatShellPage, /confirmSessionHostManagementExec/);
  assert.match(chatShellPage, /<DialogRoot :open="hostManagementExecConfirmOpen" @update:open="handleHostManagementExecConfirmOpenChange">/);
  assert.match(chatShellPage, /<DialogOverlay class="chat-host-exec-confirm-mask" \/>/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-dialog"/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-actions"/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-primary"/);
  assert.match(chatShellPage, /class="chat-host-exec-confirm-secondary"/);
  assert.ok(toggleBlock);
  assert.doesNotMatch(toggleBlock[0], /window\.confirm/);
});
