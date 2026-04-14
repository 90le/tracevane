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

test('folder and chat deletion actions reuse a Studio destructive confirm dialog instead of window.confirm', () => {
  const folderDeleteBlock = chatShellPage.match(/async function handleFolderAction[\s\S]*?\n}\n\nasync function handleAssignSessions/);
  const batchDeleteBlock = chatShellPage.match(/async function handleBatchAction[\s\S]*?\n}\n\nasync function handleSessionAction/);
  const sessionDeleteBlock = chatShellPage.match(/async function handleSessionAction[\s\S]*?\n}\n\nfunction handleComposerKeydown/);

  assert.match(chatShellPage, /const destructiveConfirmOpen = ref\(false\);/);
  assert.match(chatShellPage, /const destructiveConfirmState = ref<ChatConfirmDialogState \| null>\(null\);/);
  assert.match(chatShellPage, /function openDestructiveConfirm\(options:/);
  assert.match(chatShellPage, /async function confirmDestructiveAction\(\): Promise<void> \{/);
  assert.match(chatShellPage, /<DialogRoot :open="destructiveConfirmOpen" @update:open="handleDestructiveConfirmOpenChange">/);
  assert.match(chatShellPage, /destructiveConfirmState\.confirmLabel/);
  assert.ok(folderDeleteBlock);
  assert.ok(batchDeleteBlock);
  assert.ok(sessionDeleteBlock);
  assert.match(folderDeleteBlock[0], /openDestructiveConfirm\(\{/);
  assert.match(batchDeleteBlock[0], /openDestructiveConfirm\(\{/);
  assert.match(sessionDeleteBlock[0], /openDestructiveConfirm\(\{/);
  assert.doesNotMatch(folderDeleteBlock[0], /window\.confirm/);
  assert.doesNotMatch(batchDeleteBlock[0], /window\.confirm/);
  assert.doesNotMatch(sessionDeleteBlock[0], /window\.confirm/);
});
