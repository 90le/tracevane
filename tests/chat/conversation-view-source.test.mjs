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
  assert.match(source, /resourceRef: `workspace:\$\{filePath\}`/);
});
