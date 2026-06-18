import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sessionCatalog = fs.readFileSync(
  path.join(rootDir, 'lib/chat-session-catalog.ts'),
  'utf8',
);

test('session ordering prioritizes active runtime work before plain recency for recent-chat ergonomics', () => {
  assert.match(sessionCatalog, /function sessionRuntimeSortRank\(session: ChatSessionRow\): number \{/);
  assert.match(sessionCatalog, /runtime\.state === 'streaming'/);
  assert.match(sessionCatalog, /runtime\.state === 'running'/);
  assert.match(sessionCatalog, /runtime\.state === 'error'/);
  assert.match(sessionCatalog, /return sessionRuntimeSortRank\(left\) - sessionRuntimeSortRank\(right\)/);
  assert.match(sessionCatalog, /left\.key\.localeCompare\(right\.key\)/);
});
