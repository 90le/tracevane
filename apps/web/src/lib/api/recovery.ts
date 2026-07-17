import { apiRequest } from "./client";
import type {
  OpenClawRecoveryBackupsPayload,
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryDaemonServiceResponse,
  OpenClawRecoveryEventsPayload,
  OpenClawRecoveryRestoreBackupRequest,
  OpenClawRecoveryRestoreBackupResponse,
  OpenClawRecoveryRunRequest,
  OpenClawRecoveryRunResponse,
  OpenClawRecoveryStatusPayload,
} from "../../features/recovery/types";

/**
 * Typed transport bindings for the OpenClaw Recovery (System Guard) HTTP API.
 *
 * One function per browser-facing backend route in
 * `apps/api/modules/openclaw-recovery/routes.ts`. Response shapes come from the
 * shared contract (`types/openclaw-recovery.ts`).
 *
 * SAFETY: `runRecovery` with `action: "probe"` is a safe read/diagnostic
 * probe. The other `run` actions (`repair` / `config-repair`) and
 * `restoreRecoveryBackup` REWRITE config/service state — they are bound here
 * but MUST be invoked only behind a strong confirmation in the views, never
 * one-click.
 *
 * The read-only `GET /status` binding intentionally lives in the dashboard
 * data layer (`getOpenClawRecoveryStatus`) and is re-exported via the recovery
 * query module so the cockpit and System Guard share one cache slice.
 */

const BASE = "/api/openclaw-recovery";

function jsonBody(value: unknown): string {
  return JSON.stringify(value ?? {});
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/** GET /api/openclaw-recovery/status — recovery daemon / probe / repair snapshot. */
export function getOpenClawRecoveryStatus(
  signal?: AbortSignal,
): Promise<OpenClawRecoveryStatusPayload> {
  return apiRequest<OpenClawRecoveryStatusPayload>(`${BASE}/status`, { signal });
}

// ---------------------------------------------------------------------------
// Events (paged, read-only)
// ---------------------------------------------------------------------------

/** GET /api/openclaw-recovery/events?page&pageSize — paged recovery event log. */
export function getOpenClawRecoveryEventsPage(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<OpenClawRecoveryEventsPayload> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<OpenClawRecoveryEventsPayload>(
    `${BASE}/events?${search.toString()}`,
    { signal },
  );
}

// ---------------------------------------------------------------------------
// Backups (paged, read-only)
// ---------------------------------------------------------------------------

/** GET /api/openclaw-recovery/backups?page&pageSize — paged config backups. */
export function getOpenClawRecoveryBackupsPage(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<OpenClawRecoveryBackupsPayload> {
  const search = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  return apiRequest<OpenClawRecoveryBackupsPayload>(
    `${BASE}/backups?${search.toString()}`,
    { signal },
  );
}

// ---------------------------------------------------------------------------
// Daemon service (GET status + POST lifecycle)
// ---------------------------------------------------------------------------

/** GET /api/openclaw-recovery/daemon-service — recovery service snapshot. */
export function getOpenClawRecoveryDaemonService(
  signal?: AbortSignal,
): Promise<OpenClawRecoveryDaemonServiceResponse["service"]> {
  return apiRequest<OpenClawRecoveryDaemonServiceResponse["service"]>(
    `${BASE}/daemon-service`,
    { signal },
  );
}

/**
 * POST /api/openclaw-recovery/daemon-service — lifecycle action
 * (`status` | `install` | `start` | `stop` | `restart`). `status` is a safe
 * refresh; the lifecycle actions touch the service unit and are guarded in the
 * view.
 */
export function manageOpenClawRecoveryDaemonService(
  payload: OpenClawRecoveryDaemonServiceRequest = {},
  signal?: AbortSignal,
): Promise<OpenClawRecoveryDaemonServiceResponse> {
  return apiRequest<OpenClawRecoveryDaemonServiceResponse>(`${BASE}/daemon-service`, {
    method: "POST",
    body: jsonBody(payload),
    signal,
  });
}

// ---------------------------------------------------------------------------
// Run actions (probe = safe; repair / config-repair = config/service rewrite)
// ---------------------------------------------------------------------------

/**
 * POST /api/openclaw-recovery/run — the recovery action runner.
 *
 * Accepts `action: "probe" | "config-repair" | "repair" | "diagnostics"`. The
 * server defaults a missing action to `"repair"`, so callers MUST always send
 * an explicit action. Only `"probe"` is safe to call directly; the others
 * rewrite config/service state and the response carries the evidence
 * (`repair.commands[]` with stdout/stderr/ok, `changedKeys`, `backupPath`).
 */
export function runOpenClawRecovery(
  payload: OpenClawRecoveryRunRequest,
): Promise<OpenClawRecoveryRunResponse> {
  return apiRequest<OpenClawRecoveryRunResponse>(`${BASE}/run`, {
    method: "POST",
    body: jsonBody(payload),
  });
}

/**
 * POST /api/openclaw-recovery/restore-backup — overwrite the current config
 * with a named backup. DESTRUCTIVE: rewrites live config. Returns 404 when the
 * backup id is unknown (surfaced as an {@link import("./errors").ApiError}).
 */
export function restoreOpenClawRecoveryBackup(
  payload: OpenClawRecoveryRestoreBackupRequest,
): Promise<OpenClawRecoveryRestoreBackupResponse> {
  return apiRequest<OpenClawRecoveryRestoreBackupResponse>(`${BASE}/restore-backup`, {
    method: "POST",
    body: jsonBody(payload),
  });
}
