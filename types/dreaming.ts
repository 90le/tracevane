export type DreamingStorageMode = 'inline' | 'separate' | 'both';
export type DreamingActionKind = 'backfill' | 'reset-diary' | 'clear-grounded';
export type DreamingRemHarnessMode = 'live' | 'grounded';

export interface DreamingPhaseSnapshot {
  enabled: boolean;
  cron: string;
  managedCronPresent: boolean;
  nextRunAtMs: number | null;
}

export interface DreamingLightPhaseSnapshot extends DreamingPhaseSnapshot {
  lookbackDays: number;
  limit: number;
}

export interface DreamingDeepPhaseSnapshot extends DreamingPhaseSnapshot {
  limit: number;
  minScore: number;
  minRecallCount: number;
  minUniqueQueries: number;
  recencyHalfLifeDays: number;
  maxAgeDays: number | null;
}

export interface DreamingRemPhaseSnapshot extends DreamingPhaseSnapshot {
  lookbackDays: number;
  limit: number;
  minPatternStrength: number;
}

export interface DreamingSceneEntry {
  key: string;
  path: string;
  startLine: number;
  endLine: number;
  snippet: string;
  recallCount: number;
  dailyCount: number;
  groundedCount: number;
  totalSignalCount: number;
  lightHits: number;
  remHits: number;
  phaseHitCount: number;
  promotedAt: string | null;
  lastRecalledAt: string | null;
}

export interface DreamingStatusPayload {
  enabled: boolean;
  timezone: string | null;
  verboseLogging: boolean;
  storageMode: DreamingStorageMode;
  separateReports: boolean;
  shortTermCount: number;
  recallSignalCount: number;
  dailySignalCount: number;
  groundedSignalCount: number;
  totalSignalCount: number;
  phaseSignalCount: number;
  lightPhaseHitCount: number;
  remPhaseHitCount: number;
  promotedTotal: number;
  promotedToday: number;
  storePath: string | null;
  phaseSignalPath: string | null;
  storeError: string | null;
  phaseSignalError: string | null;
  shortTermEntries: DreamingSceneEntry[];
  signalEntries: DreamingSceneEntry[];
  promotedEntries: DreamingSceneEntry[];
  phases: {
    light: DreamingLightPhaseSnapshot;
    deep: DreamingDeepPhaseSnapshot;
    rem: DreamingRemPhaseSnapshot;
  };
}

export interface DreamingConfigSnapshot {
  slotValue: string | null;
  slotDisabled: boolean;
  selectedPluginId: string | null;
  resolvedPluginId: string;
  resolvedFromFallback: boolean;
  selectedEntryEnabled: boolean;
  selectedDreamingEnabled: boolean;
  memoryCoreDreamingEnabled: boolean;
  memoryLancedbDreamingEnabled: boolean;
  bootstrapRepairNeeded: boolean;
  bootstrapRepairable: boolean;
  bootstrapRepairTarget: string | null;
  issues: string[];
  notes: string[];
}

export interface DreamingSnapshotPayload {
  checkedAt: string;
  configPath: string;
  config: DreamingConfigSnapshot;
  status: DreamingStatusPayload | null;
  statusError: string;
}

export interface DreamingDiaryPayload {
  checkedAt: string;
  found: boolean;
  path: string;
  content: string | null;
  updatedAtMs: number | null;
  error: string;
}

export interface DreamingToggleRequest {
  enabled: boolean;
}

export interface DreamingToggleResponse {
  ok: boolean;
  changed: boolean;
  changedPaths: string[];
  snapshot: DreamingSnapshotPayload;
}

export interface DreamingRepairResponse {
  ok: boolean;
  changed: boolean;
  changedKeys: string[];
  snapshot: DreamingSnapshotPayload;
}

export interface DreamingActionStats {
  agentId: string | null;
  path: string | null;
  found: boolean | null;
  scannedFiles: number;
  written: number;
  replaced: number;
  removedEntries: number;
  removedShortTermEntries: number;
}

export interface DreamingActionResponse {
  ok: boolean;
  action: DreamingActionKind;
  stats: DreamingActionStats;
  snapshot: DreamingSnapshotPayload;
  diary: DreamingDiaryPayload;
}

export interface DreamingGroundedPreviewFile {
  path: string;
  factCount: number;
  reflectionCount: number;
  memoryImplicationCount: number;
  candidateCount: number;
  renderedMarkdown: string;
}

export interface DreamingRemHarnessResult {
  mode: DreamingRemHarnessMode;
  ok: boolean;
  workspaceDir: string | null;
  sourcePath: string | null;
  sourceFiles: string[];
  importedFileCount: number;
  importedSignalCount: number;
  skippedPaths: string[];
  remSourceEntryCount: number;
  remReflections: string[];
  remCandidateTruthCount: number;
  remCandidateKeys: string[];
  remBodyLines: string[];
  deepCandidateCount: number;
  groundedScannedFiles: number;
  groundedFiles: DreamingGroundedPreviewFile[];
  error: string;
}

export interface DreamingRemHarnessPayload {
  checkedAt: string;
  live: DreamingRemHarnessResult;
  grounded: DreamingRemHarnessResult;
}

export interface DreamingMemoryCompatibilityEntry {
  date: string;
  aliasPath: string;
  strictPath: string | null;
  legacyPaths: string[];
  aliasNeeded: boolean;
}

export interface DreamingMemoryCompatibilityPayload {
  checkedAt: string;
  workspaceDir: string | null;
  memoryDir: string;
  strictFileCount: number;
  legacyFileCount: number;
  aliasNeededCount: number;
  entries: DreamingMemoryCompatibilityEntry[];
  error: string;
}

export interface DreamingMemoryCompatibilityApplyResponse {
  ok: boolean;
  changed: boolean;
  createdFiles: string[];
  compatibility: DreamingMemoryCompatibilityPayload;
  preview: DreamingRemHarnessPayload;
}
