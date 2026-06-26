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
