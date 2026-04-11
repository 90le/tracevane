import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applySafeDreamingBootstrapRepair,
  inspectDreamingConfig,
} from '../../dist/apps/api/modules/system/dreaming-shared.js';

test('dreaming config inspection detects half-enabled memory-core after 4.8 to 4.9 upgrade', () => {
  const snapshot = inspectDreamingConfig({
    plugins: {
      slots: {
        memory: 'none',
      },
      entries: {
        'memory-core': {
          config: {
            dreaming: {
              enabled: true,
            },
          },
        },
      },
    },
  });

  assert.equal(snapshot.slotDisabled, true);
  assert.equal(snapshot.memoryCoreDreamingEnabled, true);
  assert.equal(snapshot.bootstrapRepairNeeded, true);
  assert.equal(snapshot.bootstrapRepairable, true);
  assert.equal(snapshot.bootstrapRepairTarget, 'memory-core');
});

test('safe dreaming bootstrap repair promotes memory-core into the active slot', () => {
  const config = {
    plugins: {
      slots: {
        memory: 'none',
      },
      entries: {
        'memory-core': {
          enabled: false,
          config: {
            dreaming: {
              enabled: true,
            },
          },
        },
      },
    },
  };

  const repaired = applySafeDreamingBootstrapRepair(config);

  assert.equal(repaired.changed, true);
  assert.deepEqual(repaired.changedKeys, [
    'plugins.slots.memory',
    'plugins.entries.memory-core.enabled',
  ]);
  assert.equal(config.plugins.slots.memory, 'memory-core');
  assert.equal(config.plugins.entries['memory-core'].enabled, true);
  assert.equal(repaired.snapshot.slotValue, 'memory-core');
  assert.equal(repaired.snapshot.slotDisabled, false);
});

test('safe dreaming bootstrap repair does not auto-enable memory-lancedb when slot is none', () => {
  const config = {
    plugins: {
      slots: {
        memory: 'none',
      },
      entries: {
        'memory-lancedb': {
          enabled: false,
          config: {
            dreaming: {
              enabled: true,
            },
          },
        },
      },
    },
  };

  const repaired = applySafeDreamingBootstrapRepair(config);

  assert.equal(repaired.changed, false);
  assert.equal(repaired.snapshot.bootstrapRepairNeeded, false);
  assert.ok(repaired.snapshot.issues.some((issue) => issue.includes('memory-lancedb')));
});
