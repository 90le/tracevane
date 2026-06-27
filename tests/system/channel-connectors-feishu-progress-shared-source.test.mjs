import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const daemonSource = fs.readFileSync(path.join(process.cwd(), 'apps/api/modules/channel-connectors/daemon.ts'), 'utf8');
const progressSource = fs.readFileSync(path.join(process.cwd(), 'lib/agent-progress-timeline.ts'), 'utf8');

test('Feishu progress cards reuse shared Agent progress helpers', () => {
  assert.match(daemonSource, /from "\.\.\/\.\.\/\.\.\/\.\.\/lib\/agent-progress-timeline\.js"/);
  assert.match(daemonSource, /createAgentProgressFingerprint/);
  assert.match(daemonSource, /normalizeAgentProgressEntryLimit\(entryLimit, 8\)/);
  assert.match(daemonSource, /trimAgentProgressEntries\(cardState\.entries, cardState\.entryLimit\)/);
  assert.doesNotMatch(daemonSource, /cardState\.entries\.slice\(-cardState\.entryLimit\)/);
  assert.doesNotMatch(daemonSource, /entryLimit: clampNumber\(Math\.floor\(entryLimit\), 1, 30\)/);
});

test('shared Agent progress helpers expose Feishu-compatible primitives', () => {
  assert.match(progressSource, /AGENT_PROGRESS_ENTRY_LIMIT_MAX = 30/);
  assert.match(progressSource, /function normalizeAgentProgressEntryLimit/);
  assert.match(progressSource, /function trimAgentProgressEntries<T>/);
  assert.match(progressSource, /function createAgentProgressFingerprint/);
  assert.match(progressSource, /input\.rawType \|\| ''/);
  assert.match(progressSource, /input\.toolCallId \|\| ''/);
});
