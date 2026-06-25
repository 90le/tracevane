import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync('apps/web/src/features/chat/views/SessionListView.tsx', 'utf-8');

test('SessionListView treats managed sessions as manageable using typed permission flags', () => {
  const canManageBody = source.match(/function canManage\(session: ChatSessionRow\): boolean \{([\s\S]*?)\n\}/)?.[1] || '';
  assert.match(canManageBody, /session\.kind === "tracevane_managed"/);
  assert.match(canManageBody, /permissions\?\.canSend === true/);
  assert.match(canManageBody, /permissions\?\.canDelete === true/);
  assert.doesNotMatch(canManageBody, /session\.permissions\?\.writable === true\s*\)\s*;/);
});

test('SessionListView separates all sessions from the unfiled folder scope', () => {
  assert.match(source, /if \(folderFilter === "all"\) return true;/);
  assert.match(source, /if \(folderFilter === "unfiled"\) return !assigned;/);
  assert.match(source, />全部会话</);
  assert.match(source, />未分组</);
});

test('SessionListView exposes runtime target editing for managed sessions', () => {
  assert.match(source, /kind: "edit-runtime"; session: ChatSessionRow/);
  assert.match(source, /编辑运行目标…/);
  assert.match(source, /保存运行目标/);
  assert.match(source, /runtimeTarget: \{/);
});
