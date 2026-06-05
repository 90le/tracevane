import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  OpenClawRecoveryBackupSummary,
  OpenClawRecoveryDaemonServiceSnapshot,
  OpenClawRecoveryEvent,
  OpenClawRecoveryPagination,
  OpenClawRecoveryPolicy,
  OpenClawRecoveryState,
} from "../../../../types/openclaw-recovery.js";
import type { SystemPersistedEventRecord } from "../../../../types/system.js";
import { createSystemEventLogStore } from "../system/event-log-store.js";
import { resolveOpenClawRecoveryPaths } from "./paths.js";

export const DEFAULT_RECOVERY_POLICY: OpenClawRecoveryPolicy = {
  enabled: true,
  checkIntervalMs: 30_000,
  probeTimeoutMs: 500,
  failureThresholdMs: 180_000,
  repairCooldownMs: 300_000,
  runDoctorFix: false,
  maxBackups: 20,
  allowCliReinstall: true,
  cliReinstallTimeoutMs: 300_000,
  allowGatewayProcessTakeover: true,
  gatewayProcessTakeoverTimeoutMs: 5_000,
};

function nowIso(): string {
  return new Date().toISOString();
}

function safeReadJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function defaultServiceSnapshot(): OpenClawRecoveryDaemonServiceSnapshot {
  return {
    supervisor: "unknown",
    serviceName: "openclaw-recovery-daemon",
    configPath: "",
    installed: false,
    activeState: "unknown",
    enabledState: "unknown",
    lastCheckedAt: null,
  };
}

export function buildDefaultRecoveryState(
  config: StudioServerConfig,
): OpenClawRecoveryState {
  return {
    checkedAt: nowIso(),
    status: "unknown",
    daemon: {
      pid: null,
      startedAt: null,
      heartbeatAt: null,
      version: config.version,
    },
    probe: {
      gatewayReachable: null,
      checkedAt: null,
      failureStartedAt: null,
      failureDurationMs: 0,
      nextCheckAt: null,
    },
    policy: { ...DEFAULT_RECOVERY_POLICY },
    lastRepair: null,
    service: defaultServiceSnapshot(),
    notes: ["Recovery daemon has not written state yet."],
  };
}

export function readRecoveryState(config: StudioServerConfig): OpenClawRecoveryState {
  const paths = resolveOpenClawRecoveryPaths(config);
  const fallback = buildDefaultRecoveryState(config);
  const stored = safeReadJson<Partial<OpenClawRecoveryState>>(
    paths.statePath,
    fallback,
  );
  return {
    ...fallback,
    ...stored,
    daemon: { ...fallback.daemon, ...(stored.daemon || {}) },
    probe: { ...fallback.probe, ...(stored.probe || {}) },
    policy: { ...DEFAULT_RECOVERY_POLICY, ...(stored.policy || {}) },
    service: { ...fallback.service, ...(stored.service || {}) },
    notes: Array.isArray(stored.notes) ? stored.notes.map(String) : fallback.notes,
  };
}

export function writeRecoveryState(
  config: StudioServerConfig,
  state: OpenClawRecoveryState,
): OpenClawRecoveryState {
  const paths = resolveOpenClawRecoveryPaths(config);
  const next = {
    ...state,
    checkedAt: nowIso(),
  };
  writeJsonAtomic(paths.statePath, next);
  return next;
}

function toSystemEvent(
  event: OpenClawRecoveryEvent,
): SystemPersistedEventRecord {
  return {
    id: `recovery-${event.id}`,
    kind: event.kind,
    category: "recovery",
    severity: event.severity,
    occurredAt: event.occurredAt,
    title: event.title,
    summary: event.summary,
    status: event.status,
    sourceModule: "openclaw-recovery",
    dedupeKey: `recovery:${event.kind}`,
    persistedAt: event.occurredAt,
    sourceEntity: "openclaw-recovery",
    details: event.details,
    action: event.kind,
  };
}

export function appendRecoveryEvent(
  config: StudioServerConfig,
  event: OpenClawRecoveryEvent,
): void {
  const paths = resolveOpenClawRecoveryPaths(config);
  fs.mkdirSync(paths.rootDir, { recursive: true });
  fs.appendFileSync(paths.eventsPath, `${JSON.stringify(event)}\n`, "utf8");
  const systemStore = createSystemEventLogStore({
    stateDir: path.join(config.openclawRoot, "system"),
  });
  systemStore.append([toSystemEvent(event)]);
}

export function createRecoveryEvent(input: {
  kind: OpenClawRecoveryEvent["kind"];
  severity: OpenClawRecoveryEvent["severity"];
  title: string;
  summary: string;
  status: string;
  details?: Record<string, unknown>;
  occurredAt?: string;
}): OpenClawRecoveryEvent {
  const occurredAt = input.occurredAt || nowIso();
  return {
    id: `${input.kind}-${occurredAt}-${crypto.randomBytes(3).toString("hex")}`,
    kind: input.kind,
    severity: input.severity,
    occurredAt,
    title: input.title,
    summary: input.summary,
    status: input.status,
    details: input.details || {},
  };
}

function safeParseEvent(line: string): OpenClawRecoveryEvent | null {
  if (!line.trim()) return null;
  try {
    const parsed = JSON.parse(line) as OpenClawRecoveryEvent;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizePage(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : 1;
}

function normalizePageSize(value: number | undefined): number {
  const pageSize = Number.isFinite(value) && Number(value) > 0
    ? Math.floor(Number(value))
    : 10;
  return Math.max(1, Math.min(100, pageSize));
}

function paginateList<T>(
  items: T[],
  page: number | undefined,
  pageSize: number | undefined,
): { items: T[]; pagination: OpenClawRecoveryPagination } {
  const normalizedPageSize = normalizePageSize(pageSize);
  const totalEntries = items.length;
  const totalPages = Math.max(1, Math.ceil(totalEntries / normalizedPageSize));
  const normalizedPage = Math.min(normalizePage(page), totalPages);
  const startIndex = Math.min(
    totalEntries,
    (normalizedPage - 1) * normalizedPageSize,
  );
  const endIndex = Math.min(totalEntries, startIndex + normalizedPageSize);
  return {
    items: items.slice(startIndex, endIndex),
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalEntries,
      totalPages,
      startIndex,
      endIndex,
      hasPreviousPage: normalizedPage > 1,
      hasNextPage: normalizedPage < totalPages,
    },
  };
}

export function listRecoveryEvents(
  config: StudioServerConfig,
  limit = 100,
): OpenClawRecoveryEvent[] {
  const paths = resolveOpenClawRecoveryPaths(config);
  if (!fs.existsSync(paths.eventsPath)) return [];
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
  return fs
    .readFileSync(paths.eventsPath, "utf8")
    .split("\n")
    .map(safeParseEvent)
    .filter((event): event is OpenClawRecoveryEvent => Boolean(event))
    .sort(
      (left, right) =>
        Date.parse(right.occurredAt || "") -
        Date.parse(left.occurredAt || ""),
    )
    .slice(0, normalizedLimit);
}

export function listRecoveryEventsPage(
  config: StudioServerConfig,
  page = 1,
  pageSize = 10,
): { events: OpenClawRecoveryEvent[]; pagination: OpenClawRecoveryPagination } {
  const events = listRecoveryEvents(config, Number.MAX_SAFE_INTEGER);
  const paged = paginateList(events, page, pageSize);
  return {
    events: paged.items,
    pagination: paged.pagination,
  };
}

function backupCreatedAt(fileName: string, stat: fs.Stats): string {
  const match = fileName.match(/openclaw-(\d{8}T\d{6}\d{3}Z)\.json$/);
  if (!match) return stat.mtime.toISOString();
  const raw = match[1];
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}.${raw.slice(15, 18)}Z`;
}

export function listRecoveryBackups(
  config: StudioServerConfig,
): OpenClawRecoveryBackupSummary[] {
  const paths = resolveOpenClawRecoveryPaths(config);
  try {
    return fs
      .readdirSync(paths.backupsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => {
        const backupPath = path.join(paths.backupsDir, entry.name);
        const stat = fs.statSync(backupPath);
        return {
          id: entry.name,
          fileName: entry.name,
          path: backupPath,
          createdAt: backupCreatedAt(entry.name, stat),
          sizeBytes: stat.size,
          reason: "recovery",
        };
      })
      .sort(
        (left, right) =>
          Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""),
      );
  } catch {
    return [];
  }
}

export function listRecoveryBackupsPage(
  config: StudioServerConfig,
  page = 1,
  pageSize = 10,
): { backups: OpenClawRecoveryBackupSummary[]; pagination: OpenClawRecoveryPagination } {
  const paged = paginateList(listRecoveryBackups(config), page, pageSize);
  return {
    backups: paged.items,
    pagination: paged.pagination,
  };
}

export function ensureRecoveryToken(config: StudioServerConfig): string {
  const paths = resolveOpenClawRecoveryPaths(config);
  try {
    const existing = fs.readFileSync(paths.tokenPath, "utf8").trim();
    if (existing) return existing;
  } catch {
    // Generate below.
  }
  fs.mkdirSync(paths.rootDir, { recursive: true });
  const token = crypto.randomBytes(24).toString("base64url");
  fs.writeFileSync(paths.tokenPath, `${token}\n`, { mode: 0o600 });
  return token;
}
