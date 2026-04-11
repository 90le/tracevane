import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  applyDreamingDailyAliasesInDirectory,
  inspectDreamingMemoryCompatibility,
  normalizeDreamingRemHarnessResult,
  normalizeDreamingActionStats,
  normalizeDreamingStatus,
} from '../../dist/apps/api/modules/system/dreaming-service.js';

test('normalizeDreamingStatus preserves grounded counts and scene entries from gateway payload', () => {
  const snapshot = normalizeDreamingStatus({
    enabled: true,
    groundedSignalCount: 3,
    shortTermEntries: [
      {
        key: 'router vlan',
        path: 'memory/2026-04-01.md',
        startLine: 14,
        endLine: 22,
        snippet: 'Tracked the VLAN split after the hardware reset.',
        recallCount: 2,
        dailyCount: 1,
        groundedCount: 2,
        totalSignalCount: 3,
        lightHits: 1,
        remHits: 1,
        phaseHitCount: 2,
      },
    ],
    signalEntries: [],
    promotedEntries: [
      {
        key: 'dreaming rollout',
        path: 'MEMORY.md',
        startLine: 88,
        endLine: 94,
        snippet: 'Studio dreaming now exposes grounded replay controls.',
        recallCount: 5,
        dailyCount: 3,
        groundedCount: 1,
        totalSignalCount: 6,
        lightHits: 2,
        remHits: 2,
        phaseHitCount: 4,
        promotedAt: '2026-04-09T21:00:00.000Z',
      },
    ],
    phases: {
      light: {},
      deep: {},
      rem: {},
    },
  });

  assert.equal(snapshot?.groundedSignalCount, 3);
  assert.equal(snapshot?.shortTermEntries.length, 1);
  assert.equal(snapshot?.promotedEntries.length, 1);
  assert.equal(snapshot?.shortTermEntries[0]?.groundedCount, 2);
  assert.equal(snapshot?.shortTermEntries[0]?.path, 'memory/2026-04-01.md');
  assert.equal(snapshot?.promotedEntries[0]?.promotedAt, '2026-04-09T21:00:00.000Z');
});

test('normalizeDreamingActionStats maps grounded diary backfill counters', () => {
  const result = normalizeDreamingActionStats({
    action: 'backfill',
    agentId: 'main',
    path: 'DREAMS.md',
    found: true,
    scannedFiles: 9,
    written: 4,
    replaced: 1,
  });

  assert.deepEqual(result, {
    agentId: 'main',
    path: 'DREAMS.md',
    found: true,
    scannedFiles: 9,
    written: 4,
    replaced: 1,
    removedEntries: 0,
    removedShortTermEntries: 0,
  });
});

test('normalizeDreamingActionStats maps grounded short-term reset counters', () => {
  const result = normalizeDreamingActionStats({
    action: 'resetGroundedShortTerm',
    agentId: 'main',
    removedShortTermEntries: 7,
  });

  assert.deepEqual(result, {
    agentId: 'main',
    path: null,
    found: null,
    scannedFiles: 0,
    written: 0,
    replaced: 0,
    removedEntries: 0,
    removedShortTermEntries: 7,
  });
});

test('normalizeDreamingRemHarnessResult preserves live and grounded preview data', () => {
  const result = normalizeDreamingRemHarnessResult({
    workspaceDir: '/tmp/openclaw-rem-harness-123',
    sourcePath: '/tmp/source-memory',
    sourceFiles: ['/tmp/source-memory/2026-03-24.md'],
    historicalImport: {
      importedFileCount: 1,
      importedSignalCount: 2,
      skippedPaths: ['/tmp/source-memory/skip.md'],
    },
    rem: {
      sourceEntryCount: 1,
      reflections: ['- Theme: `gateway` kept surfacing across 1 memories.'],
      candidateTruths: [{ snippet: 'Gateway resets recur', confidence: 0.82, evidence: 'memory/2026-03-24.md:3-5' }],
      candidateKeys: ['gateway'],
      bodyLines: ['### Reflections', '- Theme: `gateway` kept surfacing across 1 memories.'],
    },
    grounded: {
      workspaceDir: '/tmp/openclaw-rem-harness-123',
      scannedFiles: 1,
      files: [
        {
          path: 'memory/2026-03-24.md',
          facts: [],
          reflections: [],
          memoryImplications: [],
          candidates: [],
          renderedMarkdown: '## What Happened\n1. No grounded facts were extracted.',
        },
      ],
    },
    deep: {
      candidateCount: 1,
      candidates: [{ key: 'memory:memory/2026-03-24.md:3:5' }],
    },
  }, 'grounded');

  assert.equal(result.mode, 'grounded');
  assert.equal(result.ok, true);
  assert.equal(result.workspaceDir, '/tmp/openclaw-rem-harness-123');
  assert.equal(result.sourceFiles.length, 1);
  assert.equal(result.importedFileCount, 1);
  assert.equal(result.importedSignalCount, 2);
  assert.equal(result.skippedPaths.length, 1);
  assert.equal(result.remSourceEntryCount, 1);
  assert.equal(result.remReflections.length, 1);
  assert.equal(result.remCandidateTruthCount, 1);
  assert.equal(result.deepCandidateCount, 1);
  assert.equal(result.groundedScannedFiles, 1);
  assert.equal(result.groundedFiles.length, 1);
  assert.equal(result.groundedFiles[0]?.path, 'memory/2026-03-24.md');
});

test('normalizeDreamingRemHarnessResult converts command failure into a readable empty payload', () => {
  const result = normalizeDreamingRemHarnessResult(null, 'grounded', {
    error: 'Memory rem-harness found no YYYY-MM-DD.md files at ~/.openclaw/workspace/memory.',
    sourcePath: '/home/binbin/.openclaw/workspace/memory',
  });

  assert.equal(result.mode, 'grounded');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Memory rem-harness found no YYYY-MM-DD.md files at ~/.openclaw/workspace/memory.');
  assert.equal(result.sourcePath, '/home/binbin/.openclaw/workspace/memory');
  assert.equal(result.sourceFiles.length, 0);
  assert.equal(result.groundedFiles.length, 0);
});

test('inspectDreamingMemoryCompatibility groups legacy dated files and flags missing strict aliases', () => {
  const result = inspectDreamingMemoryCompatibility('/tmp/memory', [
    '2026-03-24-0135.md',
    '2026-03-24-short-hello.md',
    '2026-03-25.md',
    'studio-rendering.md',
  ]);

  assert.equal(result.memoryDir, '/tmp/memory');
  assert.equal(result.strictFileCount, 1);
  assert.equal(result.legacyFileCount, 2);
  assert.equal(result.aliasNeededCount, 1);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(result.entries[0], {
    date: '2026-03-24',
    aliasPath: '/tmp/memory/2026-03-24.md',
    strictPath: null,
    legacyPaths: [
      '/tmp/memory/2026-03-24-0135.md',
      '/tmp/memory/2026-03-24-short-hello.md',
    ],
    aliasNeeded: true,
  });
});

test('applyDreamingDailyAliasesInDirectory creates strict aliases without overwriting existing daily files', async () => {
  const memoryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dreaming-memory-'));
  await fs.writeFile(path.join(memoryDir, '2026-03-24-0135.md'), 'First source\n', 'utf8');
  await fs.writeFile(path.join(memoryDir, '2026-03-24-short-hello.md'), 'Second source\n', 'utf8');
  await fs.writeFile(path.join(memoryDir, '2026-03-25.md'), 'Existing strict file\n', 'utf8');

  const result = await applyDreamingDailyAliasesInDirectory(memoryDir);
  const aliasPath = path.join(memoryDir, '2026-03-24.md');
  const aliasContent = await fs.readFile(aliasPath, 'utf8');
  const existingStrict = await fs.readFile(path.join(memoryDir, '2026-03-25.md'), 'utf8');

  assert.equal(result.changed, true);
  assert.deepEqual(result.createdFiles, [aliasPath]);
  assert.match(aliasContent, /Generated by OpenClaw Studio/);
  assert.match(aliasContent, /2026-03-24-0135\.md/);
  assert.match(aliasContent, /2026-03-24-short-hello\.md/);
  assert.match(aliasContent, /First source/);
  assert.match(aliasContent, /Second source/);
  assert.equal(existingStrict, 'Existing strict file\n');
});
