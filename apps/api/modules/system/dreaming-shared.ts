import type { DreamingConfigSnapshot } from '../../../../types/dreaming.js';

const DEFAULT_DREAMING_PLUGIN_ID = 'memory-core';

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isEnabled(value: unknown): boolean {
  return value === true;
}

export function inspectDreamingConfig(openclawConfig: Record<string, any>): DreamingConfigSnapshot {
  const plugins = asRecord(openclawConfig.plugins) || {};
  const slots = asRecord(plugins.slots) || {};
  const entries = asRecord(plugins.entries) || {};
  const slotValue = normalizeString(slots.memory) || null;
  const slotDisabled = !slotValue || slotValue.toLowerCase() === 'none';
  const selectedPluginId = slotDisabled ? null : slotValue;
  const resolvedPluginId = selectedPluginId || DEFAULT_DREAMING_PLUGIN_ID;
  const resolvedFromFallback = !selectedPluginId;

  const selectedEntry = asRecord(entries[resolvedPluginId]) || {};
  const selectedEntryEnabled = selectedEntry.enabled !== false;
  const selectedConfig = asRecord(selectedEntry.config) || {};
  const selectedDreaming = asRecord(selectedConfig.dreaming) || {};
  const selectedDreamingEnabled = isEnabled(selectedDreaming.enabled);

  const memoryCoreEntry = asRecord(entries['memory-core']) || {};
  const memoryCoreConfig = asRecord(memoryCoreEntry.config) || {};
  const memoryCoreDreaming = asRecord(memoryCoreConfig.dreaming) || {};
  const memoryCoreDreamingEnabled = isEnabled(memoryCoreDreaming.enabled);

  const memoryLancedbEntry = asRecord(entries['memory-lancedb']) || {};
  const memoryLancedbConfig = asRecord(memoryLancedbEntry.config) || {};
  const memoryLancedbDreaming = asRecord(memoryLancedbConfig.dreaming) || {};
  const memoryLancedbDreamingEnabled = isEnabled(memoryLancedbDreaming.enabled);

  const issues: string[] = [];
  const notes: string[] = [];
  let bootstrapRepairNeeded = false;
  let bootstrapRepairable = false;
  let bootstrapRepairTarget: string | null = null;

  if (slotDisabled && memoryCoreDreamingEnabled) {
    issues.push('Dreaming is enabled under memory-core, but plugins.slots.memory is unset or none.');
    notes.push('Bootstrap can safely promote memory-core into the active memory slot.');
    bootstrapRepairNeeded = true;
    bootstrapRepairable = true;
    bootstrapRepairTarget = 'memory-core';
  }

  if (
    selectedPluginId === 'memory-core'
    && memoryCoreEntry.enabled === false
  ) {
    issues.push('plugins.slots.memory selects memory-core, but plugins.entries.memory-core.enabled is false.');
    notes.push('Bootstrap can safely re-enable memory-core because it is the selected memory slot.');
    bootstrapRepairNeeded = true;
    bootstrapRepairable = true;
    bootstrapRepairTarget = 'memory-core';
  }

  if (slotDisabled && memoryLancedbDreamingEnabled) {
    issues.push('Dreaming is enabled under memory-lancedb, but the active memory slot is none.');
    notes.push('Bootstrap will not auto-select memory-lancedb because it may also require vector/embedding config.');
  }

  if (
    selectedPluginId
    && selectedPluginId !== 'memory-core'
    && selectedEntry.enabled === false
  ) {
    issues.push(`plugins.slots.memory selects ${selectedPluginId}, but plugins.entries.${selectedPluginId}.enabled is false.`);
    notes.push('Bootstrap leaves non-memory-core memory providers untouched to avoid enabling an incomplete custom setup.');
  }

  return {
    slotValue,
    slotDisabled,
    selectedPluginId,
    resolvedPluginId,
    resolvedFromFallback,
    selectedEntryEnabled,
    selectedDreamingEnabled,
    memoryCoreDreamingEnabled,
    memoryLancedbDreamingEnabled,
    bootstrapRepairNeeded,
    bootstrapRepairable,
    bootstrapRepairTarget,
    issues,
    notes,
  };
}

export function applySafeDreamingBootstrapRepair(openclawConfig: Record<string, any>): {
  changed: boolean;
  changedKeys: string[];
  snapshot: DreamingConfigSnapshot;
} {
  const changedKeys: string[] = [];
  const before = inspectDreamingConfig(openclawConfig);
  if (!before.bootstrapRepairNeeded || !before.bootstrapRepairable || before.bootstrapRepairTarget !== 'memory-core') {
    return {
      changed: false,
      changedKeys,
      snapshot: before,
    };
  }

  openclawConfig.plugins = openclawConfig.plugins && typeof openclawConfig.plugins === 'object'
    ? openclawConfig.plugins
    : {};
  openclawConfig.plugins.slots = openclawConfig.plugins.slots && typeof openclawConfig.plugins.slots === 'object'
    ? openclawConfig.plugins.slots
    : {};
  openclawConfig.plugins.entries = openclawConfig.plugins.entries && typeof openclawConfig.plugins.entries === 'object'
    ? openclawConfig.plugins.entries
    : {};
  openclawConfig.plugins.entries['memory-core'] = openclawConfig.plugins.entries['memory-core']
    && typeof openclawConfig.plugins.entries['memory-core'] === 'object'
    ? openclawConfig.plugins.entries['memory-core']
    : {};

  if (normalizeString(openclawConfig.plugins.slots.memory).toLowerCase() !== 'memory-core') {
    openclawConfig.plugins.slots.memory = 'memory-core';
    changedKeys.push('plugins.slots.memory');
  }

  if (openclawConfig.plugins.entries['memory-core'].enabled !== true) {
    openclawConfig.plugins.entries['memory-core'].enabled = true;
    changedKeys.push('plugins.entries.memory-core.enabled');
  }

  return {
    changed: changedKeys.length > 0,
    changedKeys,
    snapshot: inspectDreamingConfig(openclawConfig),
  };
}
