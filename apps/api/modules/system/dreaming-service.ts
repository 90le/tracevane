import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { StudioServerConfig } from '../../../../types/api.js';
import type {
  DreamingActionKind,
  DreamingActionResponse,
  DreamingActionStats,
  DreamingConfigSnapshot,
  DreamingDeepPhaseSnapshot,
  DreamingDiaryPayload,
  DreamingMemoryCompatibilityApplyResponse,
  DreamingMemoryCompatibilityEntry,
  DreamingMemoryCompatibilityPayload,
  DreamingGroundedPreviewFile,
  DreamingLightPhaseSnapshot,
  DreamingRemHarnessMode,
  DreamingRemHarnessPayload,
  DreamingRemPhaseSnapshot,
  DreamingRepairResponse,
  DreamingSceneEntry,
  DreamingSnapshotPayload,
  DreamingStatusPayload,
  DreamingToggleRequest,
  DreamingToggleResponse,
} from '../../../../types/dreaming.js';
import { readOpenClawConfig } from '../../core/state.js';
import { requestGateway } from '../chat/gateway-request.js';
import { inspectDreamingConfig } from './dreaming-shared.js';

const execFileAsync = promisify(execFile);
const DEFAULT_DREAMING_PLUGIN_ID = 'memory-core';
const DEFAULT_DREAM_DIARY_PATH = 'DREAMS.md';
const DAILY_MEMORY_FILE_NAME_RE = /^\d{4}-\d{2}-\d{2}\.md$/;
const LEGACY_DAILY_MEMORY_FILE_NAME_RE = /^(\d{4}-\d{2}-\d{2})-(.+)\.md$/;

type GatewayConfigSnapshot = {
  hash?: string | null;
  config?: Record<string, unknown> | null;
};

type GatewayConfigSchemaLookupResult = {
  children?: Array<{
    key?: string | null;
  }> | null;
  schema?: {
    additionalProperties?: boolean | null;
  } | null;
};

type GatewayDoctorMemoryStatusPayload = {
  dreaming?: unknown;
};

type GatewayDoctorMemoryDreamDiaryPayload = {
  found?: unknown;
  path?: unknown;
  content?: unknown;
  updatedAtMs?: unknown;
};

type GatewayDoctorMemoryActionPayload = {
  action?: unknown;
  agentId?: unknown;
  path?: unknown;
  found?: unknown;
  scannedFiles?: unknown;
  written?: unknown;
  replaced?: unknown;
  removedEntries?: unknown;
  removedShortTermEntries?: unknown;
};

type CliRemHarnessPayload = {
  workspaceDir?: unknown;
  sourcePath?: unknown;
  sourceFiles?: unknown;
  historicalImport?: unknown;
  rem?: unknown;
  grounded?: unknown;
  deep?: unknown;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeFiniteInt(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.floor(value));
}

function normalizeFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function normalizeFiniteScore(value: unknown, fallback = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function normalizeStorageMode(value: unknown): DreamingStatusPayload['storageMode'] {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === 'inline' || normalized === 'separate' || normalized === 'both') {
    return normalized;
  }
  return 'inline';
}

function normalizePhaseBase(record: Record<string, unknown> | null) {
  return {
    enabled: normalizeBoolean(record?.enabled, false),
    cron: normalizeString(record?.cron),
    managedCronPresent: normalizeBoolean(record?.managedCronPresent, false),
    nextRunAtMs: normalizeFiniteNumberOrNull(record?.nextRunAtMs),
  };
}

function normalizeLightPhase(record: Record<string, unknown> | null): DreamingLightPhaseSnapshot {
  return {
    ...normalizePhaseBase(record),
    lookbackDays: normalizeFiniteInt(record?.lookbackDays, 0),
    limit: normalizeFiniteInt(record?.limit, 0),
  };
}

function normalizeDeepPhase(record: Record<string, unknown> | null): DreamingDeepPhaseSnapshot {
  return {
    ...normalizePhaseBase(record),
    limit: normalizeFiniteInt(record?.limit, 0),
    minScore: normalizeFiniteScore(record?.minScore, 0),
    minRecallCount: normalizeFiniteInt(record?.minRecallCount, 0),
    minUniqueQueries: normalizeFiniteInt(record?.minUniqueQueries, 0),
    recencyHalfLifeDays: normalizeFiniteInt(record?.recencyHalfLifeDays, 0),
    maxAgeDays: normalizeFiniteNumberOrNull(record?.maxAgeDays),
  };
}

function normalizeRemPhase(record: Record<string, unknown> | null): DreamingRemPhaseSnapshot {
  return {
    ...normalizePhaseBase(record),
    lookbackDays: normalizeFiniteInt(record?.lookbackDays, 0),
    limit: normalizeFiniteInt(record?.limit, 0),
    minPatternStrength: normalizeFiniteScore(record?.minPatternStrength, 0),
  };
}

function normalizeDreamingSceneEntry(raw: unknown): DreamingSceneEntry | null {
  const record = asRecord(raw);
  const key = normalizeString(record?.key);
  const path = normalizeString(record?.path);
  const snippet = normalizeString(record?.snippet);
  if (!key || !path || !snippet) {
    return null;
  }
  return {
    key,
    path,
    startLine: Math.max(1, normalizeFiniteInt(record?.startLine, 1)),
    endLine: Math.max(1, normalizeFiniteInt(record?.endLine, 1)),
    snippet,
    recallCount: normalizeFiniteInt(record?.recallCount, 0),
    dailyCount: normalizeFiniteInt(record?.dailyCount, 0),
    groundedCount: normalizeFiniteInt(record?.groundedCount, 0),
    totalSignalCount: normalizeFiniteInt(record?.totalSignalCount, 0),
    lightHits: normalizeFiniteInt(record?.lightHits, 0),
    remHits: normalizeFiniteInt(record?.remHits, 0),
    phaseHitCount: normalizeFiniteInt(record?.phaseHitCount, 0),
    promotedAt: normalizeOptionalString(record?.promotedAt),
    lastRecalledAt: normalizeOptionalString(record?.lastRecalledAt),
  };
}

function normalizeDreamingSceneEntries(raw: unknown): DreamingSceneEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => normalizeDreamingSceneEntry(entry))
    .filter((entry): entry is DreamingSceneEntry => entry !== null);
}

export function normalizeDreamingStatus(raw: unknown): DreamingStatusPayload | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const phases = asRecord(record.phases);
  return {
    enabled: normalizeBoolean(record.enabled, false),
    timezone: normalizeString(record.timezone) || null,
    verboseLogging: normalizeBoolean(record.verboseLogging, false),
    storageMode: normalizeStorageMode(record.storageMode),
    separateReports: normalizeBoolean(record.separateReports, false),
    shortTermCount: normalizeFiniteInt(record.shortTermCount, 0),
    recallSignalCount: normalizeFiniteInt(record.recallSignalCount, 0),
    dailySignalCount: normalizeFiniteInt(record.dailySignalCount, 0),
    groundedSignalCount: normalizeFiniteInt(record.groundedSignalCount, 0),
    totalSignalCount: normalizeFiniteInt(record.totalSignalCount, 0),
    phaseSignalCount: normalizeFiniteInt(record.phaseSignalCount, 0),
    lightPhaseHitCount: normalizeFiniteInt(record.lightPhaseHitCount, 0),
    remPhaseHitCount: normalizeFiniteInt(record.remPhaseHitCount, 0),
    promotedTotal: normalizeFiniteInt(record.promotedTotal, 0),
    promotedToday: normalizeFiniteInt(record.promotedToday, 0),
    storePath: normalizeString(record.storePath) || null,
    phaseSignalPath: normalizeString(record.phaseSignalPath) || null,
    storeError: normalizeString(record.storeError) || null,
    phaseSignalError: normalizeString(record.phaseSignalError) || null,
    shortTermEntries: normalizeDreamingSceneEntries(record.shortTermEntries),
    signalEntries: normalizeDreamingSceneEntries(record.signalEntries),
    promotedEntries: normalizeDreamingSceneEntries(record.promotedEntries),
    phases: {
      light: normalizeLightPhase(asRecord(phases?.light)),
      deep: normalizeDeepPhase(asRecord(phases?.deep)),
      rem: normalizeRemPhase(asRecord(phases?.rem)),
    },
  };
}

export function normalizeDreamingActionStats(raw: unknown): DreamingActionStats {
  const record = asRecord(raw);
  const found = typeof record?.found === 'boolean' ? record.found : null;
  return {
    agentId: normalizeOptionalString(record?.agentId),
    path: normalizeOptionalString(record?.path),
    found,
    scannedFiles: normalizeFiniteInt(record?.scannedFiles, 0),
    written: normalizeFiniteInt(record?.written, 0),
    replaced: normalizeFiniteInt(record?.replaced, 0),
    removedEntries: normalizeFiniteInt(record?.removedEntries, 0),
    removedShortTermEntries: normalizeFiniteInt(record?.removedShortTermEntries, 0),
  };
}

function normalizeDreamingGroundedPreviewFile(raw: unknown): DreamingGroundedPreviewFile | null {
  const record = asRecord(raw);
  const previewPath = normalizeString(record?.path);
  if (!previewPath) {
    return null;
  }
  return {
    path: previewPath,
    factCount: Array.isArray(record?.facts) ? record.facts.length : 0,
    reflectionCount: Array.isArray(record?.reflections) ? record.reflections.length : 0,
    memoryImplicationCount: Array.isArray(record?.memoryImplications) ? record.memoryImplications.length : 0,
    candidateCount: Array.isArray(record?.candidates) ? record.candidates.length : 0,
    renderedMarkdown: normalizeString(record?.renderedMarkdown),
  };
}

function normalizeDreamingGroundedPreviewFiles(raw: unknown): DreamingGroundedPreviewFile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((entry) => normalizeDreamingGroundedPreviewFile(entry))
    .filter((entry): entry is DreamingGroundedPreviewFile => entry !== null);
}

function normalizeDreamingMemoryCompatibilityEntry(
  entry: DreamingMemoryCompatibilityEntry,
): DreamingMemoryCompatibilityEntry {
  return {
    date: entry.date,
    aliasPath: entry.aliasPath,
    strictPath: entry.strictPath,
    legacyPaths: [...entry.legacyPaths].sort((left, right) => left.localeCompare(right)),
    aliasNeeded: entry.aliasNeeded,
  };
}

export function inspectDreamingMemoryCompatibility(
  memoryDir: string,
  fileNames: string[],
  options: {
    workspaceDir?: string | null;
    checkedAt?: string;
    error?: string;
  } = {},
): DreamingMemoryCompatibilityPayload {
  const entriesByDate = new Map<string, DreamingMemoryCompatibilityEntry>();
  let strictFileCount = 0;
  let legacyFileCount = 0;

  for (const rawName of fileNames) {
    const fileName = path.basename(normalizeString(rawName));
    if (!fileName) {
      continue;
    }

    if (DAILY_MEMORY_FILE_NAME_RE.test(fileName)) {
      strictFileCount += 1;
      const date = fileName.slice(0, 10);
      const current = entriesByDate.get(date) || {
        date,
        aliasPath: path.join(memoryDir, `${date}.md`),
        strictPath: null,
        legacyPaths: [],
        aliasNeeded: false,
      };
      current.strictPath = path.join(memoryDir, fileName);
      entriesByDate.set(date, current);
      continue;
    }

    const legacyMatch = LEGACY_DAILY_MEMORY_FILE_NAME_RE.exec(fileName);
    if (!legacyMatch) {
      continue;
    }
    legacyFileCount += 1;
    const date = legacyMatch[1];
    const current = entriesByDate.get(date) || {
      date,
      aliasPath: path.join(memoryDir, `${date}.md`),
      strictPath: null,
      legacyPaths: [],
      aliasNeeded: false,
    };
    current.legacyPaths.push(path.join(memoryDir, fileName));
    entriesByDate.set(date, current);
  }

  const entries = [...entriesByDate.values()]
    .map((entry) => normalizeDreamingMemoryCompatibilityEntry({
      ...entry,
      aliasNeeded: entry.strictPath === null && entry.legacyPaths.length > 0,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return {
    checkedAt: options.checkedAt || new Date().toISOString(),
    workspaceDir: options.workspaceDir ?? path.dirname(memoryDir),
    memoryDir,
    strictFileCount,
    legacyFileCount,
    aliasNeededCount: entries.filter((entry) => entry.aliasNeeded).length,
    entries,
    error: normalizeString(options.error),
  };
}

function renderDreamingDailyAliasContent(
  date: string,
  sourceFiles: Array<{ path: string; content: string }>,
): string {
  const lines = [
    '<!-- Generated by OpenClaw Studio dreaming compatibility. -->',
    `<!-- Date: ${date} -->`,
    '<!-- Sources:',
    ...sourceFiles.map((source) => `- ${path.basename(source.path)}`),
    '-->',
    '',
    `# ${date}`,
    '',
  ];

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const source = sourceFiles[index];
    lines.push(`## Source: ${path.basename(source.path)}`);
    lines.push('');
    lines.push(source.content.trimEnd());
    lines.push('');
    if (index < sourceFiles.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export async function applyDreamingDailyAliasesInDirectory(
  memoryDir: string,
): Promise<{
  changed: boolean;
  createdFiles: string[];
  compatibility: DreamingMemoryCompatibilityPayload;
}> {
  const fs = await import('node:fs/promises');
  const initialNames = await fs.readdir(memoryDir);
  const compatibility = inspectDreamingMemoryCompatibility(memoryDir, initialNames);
  const createdFiles: string[] = [];

  for (const entry of compatibility.entries) {
    if (!entry.aliasNeeded) {
      continue;
    }
    const sourceFiles = await Promise.all(entry.legacyPaths.map(async (sourcePath) => ({
      path: sourcePath,
      content: await fs.readFile(sourcePath, 'utf8'),
    })));
    const aliasContent = renderDreamingDailyAliasContent(entry.date, sourceFiles);
    await fs.writeFile(entry.aliasPath, aliasContent, { encoding: 'utf8', flag: 'wx' });
    createdFiles.push(entry.aliasPath);
  }

  const finalNames = await fs.readdir(memoryDir);
  return {
    changed: createdFiles.length > 0,
    createdFiles: createdFiles.sort((left, right) => left.localeCompare(right)),
    compatibility: inspectDreamingMemoryCompatibility(memoryDir, finalNames),
  };
}

export function normalizeDreamingRemHarnessResult(
  raw: unknown,
  mode: DreamingRemHarnessMode,
  fallback: { error?: string; sourcePath?: string | null; workspaceDir?: string | null } = {},
) {
  const record = asRecord(raw);
  const historicalImport = asRecord(record?.historicalImport);
  const rem = asRecord(record?.rem);
  const deep = asRecord(record?.deep);
  const grounded = asRecord(record?.grounded);
  return {
    mode,
    ok: record !== null,
    workspaceDir: normalizeOptionalString(record?.workspaceDir) ?? fallback.workspaceDir ?? null,
    sourcePath: normalizeOptionalString(record?.sourcePath) ?? fallback.sourcePath ?? null,
    sourceFiles: normalizeStringArray(record?.sourceFiles),
    importedFileCount: normalizeFiniteInt(historicalImport?.importedFileCount, 0),
    importedSignalCount: normalizeFiniteInt(historicalImport?.importedSignalCount, 0),
    skippedPaths: normalizeStringArray(historicalImport?.skippedPaths),
    remSourceEntryCount: normalizeFiniteInt(rem?.sourceEntryCount, 0),
    remReflections: normalizeStringArray(rem?.reflections),
    remCandidateTruthCount: Array.isArray(rem?.candidateTruths) ? rem.candidateTruths.length : 0,
    remCandidateKeys: normalizeStringArray(rem?.candidateKeys),
    remBodyLines: normalizeStringArray(rem?.bodyLines),
    deepCandidateCount: normalizeFiniteInt(deep?.candidateCount, 0),
    groundedScannedFiles: normalizeFiniteInt(grounded?.scannedFiles, 0),
    groundedFiles: normalizeDreamingGroundedPreviewFiles(grounded?.files),
    error: normalizeOptionalString(fallback.error) ?? '',
  };
}

function extractJsonFromMixedOutput(text: string): Record<string, unknown> | null {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (const line of lines) {
    const trimmed = line.trimStart();
    const first = trimmed[0];
    const second = trimmed[1] || '';
    const looksLikeObject = first === '{';
    const looksLikeArray = first === '[' && ['{', '[', '"', ']', '-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(second);
    if (looksLikeObject || looksLikeArray) {
      const candidate = text.slice(offset + line.indexOf(trimmed)).trim();
      try {
        const parsed = JSON.parse(candidate);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
      } catch {
        // continue
      }
    }
    offset += line.length + 1;
  }
  return null;
}

async function runRemHarnessCommand(args: string[]): Promise<CliRemHarnessPayload> {
  const result = await execFileAsync('openclaw', ['memory', 'rem-harness', '--json', ...args], {
    cwd: process.env.HOME || process.cwd(),
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = String(result.stdout || '');
  const parsed = extractJsonFromMixedOutput(stdout);
  if (!parsed) {
    throw new Error('Failed to parse rem-harness JSON output.');
  }
  return parsed as CliRemHarnessPayload;
}

async function listHistoricalDailyFiles(inputPath: string): Promise<string[]> {
  const fs = await import('node:fs/promises');
  const resolvedPath = path.resolve(inputPath);
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch (error: any) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  if (stat.isFile()) {
    return DAILY_MEMORY_FILE_NAME_RE.test(path.basename(resolvedPath)) ? [resolvedPath] : [];
  }
  if (!stat.isDirectory()) {
    return [];
  }
  const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && DAILY_MEMORY_FILE_NAME_RE.test(entry.name))
    .map((entry) => path.join(resolvedPath, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

async function resolveDreamingWorkspaceDir(config: StudioServerConfig): Promise<string> {
  try {
    const livePayload = await runRemHarnessCommand([]);
    const resolved = normalizeOptionalString(livePayload.workspaceDir);
    if (resolved) {
      return resolved;
    }
  } catch {
    // fall through to default workspace path
  }
  return path.join(config.openclawRoot, 'workspace');
}

export async function fetchDreamingMemoryCompatibility(
  config: StudioServerConfig,
): Promise<DreamingMemoryCompatibilityPayload> {
  const checkedAt = new Date().toISOString();
  const workspaceDir = await resolveDreamingWorkspaceDir(config);
  const memoryDir = path.join(workspaceDir, 'memory');
  const fs = await import('node:fs/promises');

  try {
    const names = await fs.readdir(memoryDir);
    return inspectDreamingMemoryCompatibility(memoryDir, names, {
      checkedAt,
      workspaceDir,
    });
  } catch (error) {
    return inspectDreamingMemoryCompatibility(memoryDir, [], {
      checkedAt,
      workspaceDir,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function getConfigSnapshot(config: StudioServerConfig): Promise<GatewayConfigSnapshot> {
  return await requestGateway<GatewayConfigSnapshot>(config, 'config.get', {});
}

function lookupIncludesDreamingProperty(value: GatewayConfigSchemaLookupResult | null): boolean {
  const children = Array.isArray(value?.children) ? value.children : [];
  return children.some((child) => normalizeString(child?.key) === 'dreaming');
}

function lookupDisallowsUnknownProperties(value: GatewayConfigSchemaLookupResult | null): boolean {
  return value?.schema?.additionalProperties === false;
}

async function ensureDreamingPathSupported(config: StudioServerConfig, pluginId: string): Promise<void> {
  const lookup = await requestGateway<GatewayConfigSchemaLookupResult>(
    config,
    'config.schema.lookup',
    { path: `plugins.entries.${pluginId}.config` },
  );
  if (lookupIncludesDreamingProperty(lookup)) {
    return;
  }
  if (lookupDisallowsUnknownProperties(lookup)) {
    throw new Error(`Selected memory plugin "${pluginId}" does not support dreaming settings.`);
  }
}

function hasDreamingEnabled(entry: Record<string, unknown> | null): boolean {
  const config = asRecord(entry?.config);
  const dreaming = asRecord(config?.dreaming);
  return dreaming?.enabled === true;
}

function buildCurrentConfigSnapshot(config: StudioServerConfig): DreamingConfigSnapshot {
  return inspectDreamingConfig(readOpenClawConfig(config));
}

export async function fetchDreamingSnapshot(config: StudioServerConfig): Promise<DreamingSnapshotPayload> {
  const checkedAt = new Date().toISOString();
  const configSnapshot = buildCurrentConfigSnapshot(config);
  try {
    const payload = await requestGateway<GatewayDoctorMemoryStatusPayload>(config, 'doctor.memory.status', {});
    return {
      checkedAt,
      configPath: config.openclawConfigFile,
      config: configSnapshot,
      status: normalizeDreamingStatus(payload?.dreaming),
      statusError: '',
    };
  } catch (error) {
    return {
      checkedAt,
      configPath: config.openclawConfigFile,
      config: configSnapshot,
      status: null,
      statusError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchDreamingDiary(config: StudioServerConfig): Promise<DreamingDiaryPayload> {
  const checkedAt = new Date().toISOString();
  try {
    const payload = await requestGateway<GatewayDoctorMemoryDreamDiaryPayload>(config, 'doctor.memory.dreamDiary', {});
    return {
      checkedAt,
      found: payload?.found === true,
      path: normalizeString(payload?.path) || DEFAULT_DREAM_DIARY_PATH,
      content: typeof payload?.content === 'string' ? payload.content : null,
      updatedAtMs: normalizeFiniteNumberOrNull(payload?.updatedAtMs),
      error: '',
    };
  } catch (error) {
    return {
      checkedAt,
      found: false,
      path: DEFAULT_DREAM_DIARY_PATH,
      content: null,
      updatedAtMs: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function fetchDreamingRemHarnessPreview(_config: StudioServerConfig): Promise<DreamingRemHarnessPayload> {
  const checkedAt = new Date().toISOString();
  let live = normalizeDreamingRemHarnessResult(null, 'live', {
    error: 'Live REM preview has not been loaded yet.',
  });
  let grounded = normalizeDreamingRemHarnessResult(null, 'grounded', {
    error: 'Grounded REM preview has not been loaded yet.',
  });

  try {
    const livePayload = await runRemHarnessCommand([]);
    live = normalizeDreamingRemHarnessResult(livePayload, 'live');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    live = normalizeDreamingRemHarnessResult(null, 'live', { error: message });
    grounded = normalizeDreamingRemHarnessResult(null, 'grounded', {
      error: 'Grounded preview skipped because live REM preview could not resolve the workspace.',
    });
    return { checkedAt, live, grounded };
  }

  const groundedSourcePath = live.workspaceDir ? path.join(live.workspaceDir, 'memory') : null;
  if (!groundedSourcePath) {
    grounded = normalizeDreamingRemHarnessResult(null, 'grounded', {
      error: 'Grounded preview requires a resolvable workspace directory.',
    });
    return { checkedAt, live, grounded };
  }

  const sourceFiles = await listHistoricalDailyFiles(groundedSourcePath);
  if (sourceFiles.length === 0) {
    grounded = normalizeDreamingRemHarnessResult(null, 'grounded', {
      error: `Memory rem-harness found no YYYY-MM-DD.md files at ${groundedSourcePath}.`,
      sourcePath: groundedSourcePath,
      workspaceDir: live.workspaceDir,
    });
    return { checkedAt, live, grounded };
  }

  try {
    const groundedPayload = await runRemHarnessCommand(['--grounded', '--path', groundedSourcePath]);
    grounded = normalizeDreamingRemHarnessResult(groundedPayload, 'grounded');
  } catch (error) {
    grounded = normalizeDreamingRemHarnessResult(null, 'grounded', {
      error: error instanceof Error ? error.message : String(error),
      sourcePath: groundedSourcePath,
      workspaceDir: live.workspaceDir,
    });
  }

  return { checkedAt, live, grounded };
}

export async function applyDreamingMemoryCompatibility(
  config: StudioServerConfig,
): Promise<DreamingMemoryCompatibilityApplyResponse> {
  const compatibilityBefore = await fetchDreamingMemoryCompatibility(config);
  const memoryDir = compatibilityBefore.memoryDir;
  let changed = false;
  let createdFiles: string[] = [];
  let compatibility = compatibilityBefore;

  if (!compatibilityBefore.error) {
    const result = await applyDreamingDailyAliasesInDirectory(memoryDir);
    changed = result.changed;
    createdFiles = result.createdFiles;
    compatibility = result.compatibility;
  }

  const preview = await fetchDreamingRemHarnessPreview(config);
  return {
    ok: true,
    changed,
    createdFiles,
    compatibility,
    preview,
  };
}

async function runDreamingGatewayAction(
  config: StudioServerConfig,
  method: 'doctor.memory.backfillDreamDiary' | 'doctor.memory.resetDreamDiary' | 'doctor.memory.resetGroundedShortTerm',
  action: DreamingActionKind,
): Promise<DreamingActionResponse> {
  const payload = await requestGateway<GatewayDoctorMemoryActionPayload>(config, method, {});
  const [snapshot, diary] = await Promise.all([
    fetchDreamingSnapshot(config),
    fetchDreamingDiary(config),
  ]);
  return {
    ok: true,
    action,
    stats: normalizeDreamingActionStats(payload),
    snapshot,
    diary,
  };
}

export async function backfillDreamingDiary(config: StudioServerConfig): Promise<DreamingActionResponse> {
  return runDreamingGatewayAction(config, 'doctor.memory.backfillDreamDiary', 'backfill');
}

export async function resetDreamingDiary(config: StudioServerConfig): Promise<DreamingActionResponse> {
  return runDreamingGatewayAction(config, 'doctor.memory.resetDreamDiary', 'reset-diary');
}

export async function resetGroundedShortTerm(config: StudioServerConfig): Promise<DreamingActionResponse> {
  return runDreamingGatewayAction(config, 'doctor.memory.resetGroundedShortTerm', 'clear-grounded');
}

function resolveTogglePluginId(
  inspection: DreamingConfigSnapshot,
  currentConfig: Record<string, unknown> | null,
  enabled: boolean,
): string {
  if (enabled) {
    return inspection.selectedPluginId || DEFAULT_DREAMING_PLUGIN_ID;
  }

  if (inspection.selectedPluginId) {
    return inspection.selectedPluginId;
  }

  const plugins = asRecord(currentConfig?.plugins);
  const entries = asRecord(plugins?.entries);
  if (hasDreamingEnabled(asRecord(entries?.['memory-core']))) {
    return 'memory-core';
  }
  if (hasDreamingEnabled(asRecord(entries?.['memory-lancedb']))) {
    return 'memory-lancedb';
  }
  return DEFAULT_DREAMING_PLUGIN_ID;
}

async function writeDreamingPatch(
  config: StudioServerConfig,
  params: {
    snapshot: GatewayConfigSnapshot;
    patch: Record<string, unknown>;
    note: string;
  },
): Promise<void> {
  const baseHash = normalizeString(params.snapshot.hash);
  if (!baseHash) {
    throw new Error('Config hash missing; refresh and retry.');
  }
  await requestGateway<Record<string, unknown>>(config, 'config.patch', {
    baseHash,
    raw: JSON.stringify(params.patch),
    note: params.note,
  });
}

export async function toggleDreaming(
  config: StudioServerConfig,
  payload: DreamingToggleRequest,
): Promise<DreamingToggleResponse> {
  const enabled = payload.enabled === true;
  const snapshot = await getConfigSnapshot(config);
  const inspection = inspectDreamingConfig((snapshot.config || {}) as Record<string, any>);
  const pluginId = resolveTogglePluginId(inspection, snapshot.config || null, enabled);
  await ensureDreamingPathSupported(config, pluginId);

  const plugins = asRecord(snapshot.config?.plugins);
  const entries = asRecord(plugins?.entries);
  const currentEntry = asRecord(entries?.[pluginId]);
  const currentDreamingEnabled = hasDreamingEnabled(currentEntry);
  const changedPaths: string[] = [];
  const entryPatch: Record<string, unknown> = {};
  const pluginsPatch: Record<string, unknown> = {};

  if (enabled && inspection.selectedPluginId === null && pluginId === DEFAULT_DREAMING_PLUGIN_ID) {
    pluginsPatch.slots = { memory: pluginId };
    changedPaths.push('plugins.slots.memory');
  }

  if (enabled && currentEntry?.enabled === false) {
    entryPatch.enabled = true;
    changedPaths.push(`plugins.entries.${pluginId}.enabled`);
  }

  if (currentDreamingEnabled !== enabled) {
    entryPatch.config = {
      dreaming: {
        enabled,
      },
    };
    changedPaths.push(`plugins.entries.${pluginId}.config.dreaming.enabled`);
  }

  if (Object.keys(entryPatch).length > 0) {
    pluginsPatch.entries = {
      [pluginId]: entryPatch,
    };
  }

  if (changedPaths.length === 0) {
    return {
      ok: true,
      changed: false,
      changedPaths,
      snapshot: await fetchDreamingSnapshot(config),
    };
  }

  await writeDreamingPatch(config, {
    snapshot,
    patch: {
      plugins: pluginsPatch,
    },
    note: enabled
      ? 'Dreaming enabled from OpenClaw Studio.'
      : 'Dreaming disabled from OpenClaw Studio.',
  });

  return {
    ok: true,
    changed: true,
    changedPaths,
    snapshot: await fetchDreamingSnapshot(config),
  };
}

export async function repairDreamingConfig(config: StudioServerConfig): Promise<DreamingRepairResponse> {
  const snapshot = await getConfigSnapshot(config);
  const inspection = inspectDreamingConfig((snapshot.config || {}) as Record<string, any>);
  if (!inspection.bootstrapRepairNeeded || !inspection.bootstrapRepairable || inspection.bootstrapRepairTarget !== 'memory-core') {
    return {
      ok: true,
      changed: false,
      changedKeys: [],
      snapshot: await fetchDreamingSnapshot(config),
    };
  }

  const patch = {
    plugins: {
      slots: {
        memory: 'memory-core',
      },
      entries: {
        'memory-core': {
          enabled: true,
        },
      },
    },
  };
  const changedKeys = [
    'plugins.slots.memory',
    'plugins.entries.memory-core.enabled',
  ];

  await writeDreamingPatch(config, {
    snapshot,
    patch,
    note: 'Repaired half-enabled dreaming memory slot from OpenClaw Studio.',
  });

  return {
    ok: true,
    changed: true,
    changedKeys,
    snapshot: await fetchDreamingSnapshot(config),
  };
}
