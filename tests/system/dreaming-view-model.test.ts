import test from 'node:test';
import assert from 'node:assert/strict';

import {
  deriveDreamingCurrentEmptyReason,
  summarizeDreamingRemHarness,
} from '../../apps/web-vue/src/features/dreaming/view-model';
import type { DreamingRemHarnessPayload } from '../../types/dreaming';

function text(chinese: string): string {
  return chinese;
}

function createPreview(overrides: Partial<DreamingRemHarnessPayload> = {}): DreamingRemHarnessPayload {
  return {
    checkedAt: '2026-04-10T09:12:00.000Z',
    live: {
      mode: 'live',
      ok: true,
      workspaceDir: '/home/binbin/.openclaw/workspace',
      sourcePath: '/home/binbin/.openclaw/workspace/memory',
      sourceFiles: ['/home/binbin/.openclaw/workspace/memory/2026-04-10.md'],
      importedFileCount: 1,
      importedSignalCount: 2,
      skippedPaths: [],
      remSourceEntryCount: 1,
      remReflections: ['- Theme: `gateway` kept surfacing across 1 memories.'],
      remCandidateTruthCount: 1,
      remCandidateKeys: ['gateway'],
      remBodyLines: ['### Reflections'],
      deepCandidateCount: 1,
      groundedScannedFiles: 0,
      groundedFiles: [],
      error: '',
    },
    grounded: {
      mode: 'grounded',
      ok: true,
      workspaceDir: '/home/binbin/.openclaw/workspace',
      sourcePath: '/home/binbin/.openclaw/workspace/memory',
      sourceFiles: ['/home/binbin/.openclaw/workspace/memory/2026-04-10.md'],
      importedFileCount: 1,
      importedSignalCount: 2,
      skippedPaths: [],
      remSourceEntryCount: 1,
      remReflections: ['- Theme: `gateway` kept surfacing across 1 memories.'],
      remCandidateTruthCount: 1,
      remCandidateKeys: ['gateway'],
      remBodyLines: ['### Reflections'],
      deepCandidateCount: 1,
      groundedScannedFiles: 1,
      groundedFiles: [
        {
          path: 'memory/2026-04-10.md',
          factCount: 1,
          reflectionCount: 1,
          memoryImplicationCount: 1,
          candidateCount: 1,
          renderedMarkdown: '## What Happened\n1. Gateway reset surfaced again.',
        },
      ],
      error: '',
    },
    ...overrides,
  };
}

test('deriveDreamingCurrentEmptyReason escalates grounded filename mismatch when preview explains why replay is empty', () => {
  const preview = createPreview({
    grounded: {
      mode: 'grounded',
      ok: false,
      workspaceDir: '/home/binbin/.openclaw/workspace',
      sourcePath: '/home/binbin/.openclaw/workspace/memory',
      sourceFiles: [],
      importedFileCount: 0,
      importedSignalCount: 0,
      skippedPaths: [],
      remSourceEntryCount: 0,
      remReflections: [],
      remCandidateTruthCount: 0,
      remCandidateKeys: [],
      remBodyLines: [],
      deepCandidateCount: 0,
      groundedScannedFiles: 0,
      groundedFiles: [],
      error: 'Memory rem-harness found no YYYY-MM-DD.md files at /home/binbin/.openclaw/workspace/memory.',
    },
  });

  const reason = deriveDreamingCurrentEmptyReason({
    snapshot: {
      checkedAt: '2026-04-10T09:12:00.000Z',
      configPath: '/home/binbin/.openclaw/openclaw.json',
      config: {
        slotValue: 'memory-core',
        slotDisabled: false,
        selectedPluginId: 'memory-core',
        resolvedPluginId: 'memory-core',
        resolvedFromFallback: false,
        selectedEntryEnabled: true,
        selectedDreamingEnabled: true,
        memoryCoreDreamingEnabled: true,
        memoryLancedbDreamingEnabled: false,
        bootstrapRepairNeeded: false,
        bootstrapRepairable: false,
        bootstrapRepairTarget: null,
        issues: [],
        notes: [],
      },
      status: {
        enabled: true,
        timezone: 'Asia/Shanghai',
        verboseLogging: false,
        storageMode: 'inline',
        separateReports: false,
        shortTermCount: 0,
        recallSignalCount: 0,
        dailySignalCount: 0,
        groundedSignalCount: 0,
        totalSignalCount: 0,
        phaseSignalCount: 0,
        lightPhaseHitCount: 0,
        remPhaseHitCount: 0,
        promotedTotal: 0,
        promotedToday: 0,
        storePath: null,
        phaseSignalPath: null,
        storeError: null,
        phaseSignalError: null,
        shortTermEntries: [],
        signalEntries: [],
        promotedEntries: [],
        phases: {
          light: {
            enabled: true,
            cron: '',
            managedCronPresent: false,
            nextRunAtMs: null,
            lookbackDays: 2,
            limit: 20,
          },
          deep: {
            enabled: true,
            cron: '',
            managedCronPresent: false,
            nextRunAtMs: null,
            limit: 20,
            minScore: 0.5,
            minRecallCount: 1,
            minUniqueQueries: 1,
            recencyHalfLifeDays: 7,
            maxAgeDays: null,
          },
          rem: {
            enabled: true,
            cron: '',
            managedCronPresent: false,
            nextRunAtMs: null,
            lookbackDays: 7,
            limit: 20,
            minPatternStrength: 0.5,
          },
        },
      },
      statusError: '',
    },
    dreamingEnabled: true,
    groundedLaneCount: 0,
    diaryEntryCount: 0,
    remHarnessPreview: preview,
    text,
  });

  assert.match(reason, /YYYY-MM-DD\.md/);
  assert.match(reason, /memory/);
});

test('summarizeDreamingRemHarness reports ready state when live and grounded previews resolve', () => {
  const summary = summarizeDreamingRemHarness(createPreview(), text);

  assert.equal(summary.stateTone, 'ready');
  assert.equal(summary.liveReflectionCount, 1);
  assert.equal(summary.liveCandidateTruthCount, 1);
  assert.equal(summary.groundedFileCount, 1);
  assert.equal(summary.groundedSourcePath, '/home/binbin/.openclaw/workspace/memory');
  assert.match(summary.message, /1/);
});
