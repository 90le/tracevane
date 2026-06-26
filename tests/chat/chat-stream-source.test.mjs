import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const querySource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/lib/query/chat.ts'), 'utf8');
const apiSource = fs.readFileSync(path.join(process.cwd(), 'apps/web/src/lib/api/chat.ts'), 'utf8');
const contractSource = fs.readFileSync(path.join(process.cwd(), 'apps/api/modules/chat/contract.ts'), 'utf8');

test('Chat stream resumes after disconnect using stream sequence replay', () => {
  assert.match(apiSource, /chatStreamUrl\(\s*sessionKey: string,\s*options: \{ lastStreamSeq\?: number \| null \} = \{\}/);
  assert.match(apiSource, /query\.set\("lastStreamSeq"/);
  assert.match(querySource, /const lastStreamSeqRef = React\.useRef<number \| null>\(null\)/);
  assert.match(querySource, /chatStreamUrl\(sessionKey, \{ lastStreamSeq: lastStreamSeqRef\.current \}\)/);
  assert.match(querySource, /lastStreamSeqRef\.current = Math\.max/);
  assert.match(querySource, /setReconnectToken\(\(value\) => value \+ 1\)/);
});

test('Chat contract declares permission route and stream event kind', () => {
  assert.match(contractSource, /permissionByRun: '\/api\/chat\/sessions\/:sessionKey\/runs\/:runId\/permissions\/:requestId'/);
  assert.match(contractSource, /'agent_permission'/);
  assert.match(contractSource, /'agent_process'/);
  assert.match(contractSource, /'reasoning'/);
  assert.match(contractSource, /'thinking'/);
});


test('Chat attach events replay pending native permission cards', () => {
  const serviceSource = fs.readFileSync(path.join(process.cwd(), 'apps/api/modules/chat/service.ts'), 'utf8');
  assert.match(serviceSource, /function buildPendingPermissionEvents/);
  assert.match(serviceSource, /nativePendingPermissions\.entries\(\)/);
  assert.match(serviceSource, /entry\.card\.status === 'pending'/);
  assert.match(serviceSource, /kind: 'agent_permission' as const/);
  assert.match(serviceSource, /sendSequencedSseEvent\(res, sessionKey, permissionEvent\)/);
  assert.match(serviceSource, /sendSequencedWebSocketEvent\(ws, sessionKey, permissionEvent\)/);
  assert.match(serviceSource, /events\.push\(\.\.\.buildPendingPermissionEvents\(sessionKey, emittedAt\)\)/);
});
