import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.join(process.cwd(), 'apps/web/src/features/chat/ChatWorkbenchPage.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');
const sharedSource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/features/chat/_shared.ts'), 'utf8');

test('ChatWorkbenchPage reports send success so the composer can preserve failed drafts', () => {
  assert.match(source, /const handleSend = React\.useCallback\(async \(payload: ChatSendRequest\): Promise<boolean>/);
  assert.match(source, /await sendMutation\.mutateAsync/);
  assert.match(source, /return true/);
  assert.match(source, /catch \(error\)/);
  assert.match(source, /toast\.error\("发送失败"/);
  assert.match(source, /return false/);
});


test('ChatWorkbenchPage accepts legacy sessionRef deep links without exposing raw encoded keys', () => {
  assert.match(source, /function decodeSessionRef\(value: string \| null\): string \| null/);
  assert.match(source, /raw\?\.startsWith\("r1_"\)/);
  assert.match(source, /window\.atob\(padded\)/);
  assert.match(source, /new TextDecoder\(\)\.decode\(bytes\)/);
  assert.match(source, /searchParams\.get\("session"\) \?\? decodeSessionRef\(searchParams\.get\("sessionRef"\)\)/);
});

test('ChatWorkbenchPage surfaces IM delivery source detail in the conversation header', () => {
  assert.match(sharedSource, /export function sessionSourceDetail/);
  assert.match(sharedSource, /deliveryContext/);
  assert.match(sharedSource, /`账号 \$\{delivery\.accountId\}`/);
  assert.match(sharedSource, /`目标 \$\{delivery\.to\}`/);
  assert.match(sharedSource, /`线程 \$\{delivery\.threadId\}`/);
  assert.match(source, /sessionSourceDetail/);
  assert.match(source, /const selectedSourceDetail = selectedSession/);
  assert.match(source, /title=\{selectedSourceDetail\}/);
});

test('ChatWorkbenchPage passes backend diagnostics into the session runtime picker', () => {
  assert.match(source, new RegExp('const diagnostics =[\\s\\S]*history\\?\\.diagnostics \\?\\? bootstrap\\.data\\?\\.diagnostics \\?\\? null'));
  assert.match(source, /<SessionListView/);
  assert.match(source, /diagnostics=\{diagnostics\}/);
});

test('ChatWorkbenchPage passes backend file capability into the conversation composer', () => {
  assert.match(source, /fileCapability=\{diagnostics\?\.fileCapability \?\? null\}/);
});


test('ChatWorkbenchPage settles immediate native CLI acknowledgements without waiting for a legacy final event', () => {
  assert.match(source, /function isTerminalRuntimeState\(state: string \| null \| undefined\): boolean/);
  assert.match(source, /case "ack": \{/);
  assert.match(source, /case "runtime":/);
  assert.match(source, /case "runtime\.state": \{/);
  assert.match(source, /isTerminalRuntimeState\(event\.runtime\.state\)/);
  assert.match(source, /isTerminalRuntimeState\(ack\.runtime\.state\)/);
  assert.match(source, /ack\.status === "duplicate_completed" \|\| isTerminalRuntimeState\(ack\.runtime\.state\)/);
  assert.match(source, /toast\.error\("Agent 运行失败"/);
});

test('ChatWorkbenchPage routes native permission events into live turns and resolve mutations', () => {
  assert.match(source, /useResolveChatPermissionMutation/);
  assert.match(source, /case "agent_permission"/);
  assert.match(source, /base\.permissions\.findIndex/);
  assert.match(source, /handleResolvePermission/);
  assert.match(source, /payload: \{ decision \}/);
  assert.match(source, /onResolvePermission=\{handleResolvePermission\}/);
  assert.match(source, /resolvingPermission=\{resolvePermissionMutation\.isPending\}/);
});


test('ChatWorkbenchPage keeps side-result events in the live turn instead of losing process replies', () => {
  assert.match(source, /sideResults: \[\]/);
  assert.match(source, /case "side_result"/);
  assert.match(source, /\.\.\.base\.sideResults, event\.result/);
  assert.match(source, /slice\(-5\)/);
});
