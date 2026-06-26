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
});
