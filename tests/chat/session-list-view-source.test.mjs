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

test('SessionListView defaults new sessions to native CLI Codex instead of OpenClaw webchat', () => {
  assert.match(source, /const DEFAULT_RUNTIME_AGENT: ChatRuntimeAgentId = "codex"/);
  assert.match(source, /agent: "codex", binaryId: "codex", label: "Codex CLI"/);
  assert.match(source, /agent: "openclaw", binaryId: null, label: "OpenClaw 平台 Agent"/);
  assert.match(source, /setRuntimeAgent\(DEFAULT_RUNTIME_AGENT\)/);
});

test('SessionListView surfaces CLI binary readiness in runtime target choices', () => {
  assert.match(source, /useTerminalStatusQuery\(\{ staleTime: 30_000, retry: false \}\)/);
  assert.match(source, /binaryId: "codex"/);
  assert.match(source, /binaryId: "claude"/);
  assert.match(source, /binaryId: "opencode"/);
  assert.match(source, /模型列表加载失败，将使用模型网关默认路由/);
});


test('SessionListView persists chat list filters and folder scope in URL params', () => {
  assert.match(source, /useSearchParams\(\)/);
  assert.match(source, /chatView/);
  assert.match(source, /chatFolder/);
  assert.match(source, /chatQ/);
  assert.match(source, /folderFilterToParam/);
  assert.match(source, /parseFolderFilterParam/);
  assert.match(source, /setSearchParams\(/);
});

test('SessionListView recovers stale folder URL params instead of stranding the rail', () => {
  assert.match(source, /folderFilter\.startsWith\("folder:"\)/);
  assert.match(source, /!folderOptions\.some\(\(folder\) => folder\.id === folderId\)/);
  assert.match(source, /setFolderFilter\("all"\)/);
});


test('SessionListView gates new and edited sessions on CLI runtime readiness', () => {
  assert.match(source, /type ChatRuntimeOptionReadiness = \{/);
  assert.match(source, /selectable: boolean/);
  assert.match(source, /disabled=\{!readiness\.selectable\}/);
  assert.match(source, /readiness\.selectable && setRuntimeAgent\(option\.agent\)/);
  assert.match(source, /const ensureRuntimeSelectable = React\.useCallback/);
  assert.match(source, /当前 Agent 运行器不可用/);
  assert.match(source, /disabled=\{busy \|\| !selectedRuntimeReadiness\.selectable\}/);
});


test('SessionListView keeps stable Chat list selectors for browser acceptance helpers', () => {
  assert.match(source, /chat-shell-session-list/);
  assert.match(source, /chat-shell-session-row/);
  assert.match(source, /data-session-key=\{s\.key\}/);
  assert.match(source, /active bg-primary-soft/);
  assert.match(source, /chat-new-chat-trigger/);
  assert.match(source, /chat-agent-picker/);
  assert.match(source, /chat-agent-picker-option/);
});


test('SessionListView honors organizer folder and session ordering in the rail', () => {
  assert.match(source, /function orderSessionRowsByOrganizer/);
  assert.match(source, /function orderFolderOptionsByIds/);
  assert.match(source, /organizer\.folderOrder\?\.length/);
  assert.match(source, /organizer\.childFolderOrder\?\.\[folderId\]/);
  assert.match(source, /organizer\?\.rootSessionOrder/);
  assert.match(source, /organizer\?\.folderSessionOrder\?\.\[folderFilter\.slice\("folder:"\.length\)\]/);
});
