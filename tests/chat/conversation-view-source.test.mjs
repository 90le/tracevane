import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'apps/web/src/features/chat/views/ConversationView.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

test('ConversationView exposes a workspace file picker backed by the Files API', () => {
  assert.match(source, /useFilesSummaryQuery/);
  assert.match(source, /useFilesBrowseQuery/);
  assert.match(source, /workspaceRootId/);
  assert.match(source, /@ 工作区文件/);
  assert.match(source, /attachWorkspaceFile/);
  assert.match(source, /const resourceRef = `workspace:\$\{filePath\}`/);
  assert.match(source, /resourceRef,/);
});


test('ConversationView keeps composer file refs structured and removable across upload states', () => {
  assert.match(source, /type ComposerFileRefItem = ChatSendFileRef &/);
  assert.match(source, /status: "uploading" \| "ready" \| "failed"/);
  assert.match(source, /source: "upload" \| "workspace"/);
  assert.match(source, /readyFileRefs/);
  assert.match(source, /hasPendingFileRefs/);
  assert.match(source, /hasFailedFileRefs/);
  assert.match(source, /chat-composer-pool-item chat-composer-attachment/);
  assert.match(source, /chat-composer-attachment-remove/);
  assert.match(source, /chat-composer-file-input/);
  assert.match(source, /chat-composer-send/);
  assert.match(source, /cancelledUploadIdsRef/);
  assert.match(source, /结构化 fileRef/);
});


test('ConversationView uses Files roots explicitly and only sends workspace-root refs', () => {
  assert.match(source, /const filesRoots = filesSummary\.data\?\.roots \?\? \[\]/);
  assert.match(source, /workspacePickerRootId/);
  assert.match(source, /effectiveWorkspacePickerRootId/);
  assert.match(source, /selectedRootCanAttach/);
  assert.match(source, /aria-label="选择文件根"/);
  assert.match(source, /disabled=\{!selectedRootCanAttach\}/);
  assert.match(source, /当前 Agent 只能直接附加项目工作区文件/);
  assert.match(source, /只有项目工作区文件会转换为 workspace: 引用/);
});
