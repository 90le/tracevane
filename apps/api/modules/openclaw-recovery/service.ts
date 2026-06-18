import fs from "node:fs";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  OpenClawRecoveryBackupSummary,
  OpenClawRecoveryDaemonServiceSnapshot,
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryDaemonServiceResponse,
  OpenClawRecoveryEvent,
  OpenClawRecoveryRestoreBackupRequest,
  OpenClawRecoveryRestoreBackupResponse,
  OpenClawRecoveryRunRequest,
  OpenClawRecoveryRunResponse,
  OpenClawRecoveryState,
} from "../../../../types/openclaw-recovery.js";
import {
  appendRecoveryEvent,
  createRecoveryEvent,
  listRecoveryBackupsPage,
  listRecoveryBackups,
  listRecoveryEventsPage,
  listRecoveryEvents,
  readRecoveryState,
  writeRecoveryState,
} from "./store.js";
import {
  restoreOpenClawRecoveryBackup,
  runOpenClawRecoveryConfigRepair,
  runOpenClawRecoveryRepair,
} from "./repair.js";
import {
  applyRecoveryDaemonServiceAction,
  getRecoveryDaemonServiceSnapshot,
} from "./supervisor.js";
import { probeOpenClawGateway } from "./probe.js";

export interface OpenClawRecoveryService {
  getStatus(): Promise<OpenClawRecoveryState>;
  listEvents(limit?: number): Promise<OpenClawRecoveryEvent[]>;
  listEventsPage(page?: number, pageSize?: number): Promise<{
    ok: true;
    checkedAt: string;
    events: OpenClawRecoveryEvent[];
    pagination: ReturnType<typeof listRecoveryEventsPage>["pagination"];
  }>;
  listBackups(): Promise<OpenClawRecoveryBackupSummary[]>;
  listBackupsPage(page?: number, pageSize?: number): Promise<{
    ok: true;
    checkedAt: string;
    backups: OpenClawRecoveryBackupSummary[];
    pagination: ReturnType<typeof listRecoveryBackupsPage>["pagination"];
  }>;
  runRecovery(payload?: OpenClawRecoveryRunRequest): Promise<OpenClawRecoveryRunResponse>;
  restoreBackup(payload: OpenClawRecoveryRestoreBackupRequest): Promise<OpenClawRecoveryRestoreBackupResponse>;
  getDaemonService(): Promise<OpenClawRecoveryState["service"]>;
  applyDaemonServiceAction(payload: OpenClawRecoveryDaemonServiceRequest): Promise<OpenClawRecoveryDaemonServiceResponse>;
}

function findBackupPath(
  config: TracevaneServerConfig,
  backupId: string,
): { id: string; path: string } | null {
  const backup = listRecoveryBackups(config).find(
    (item) => item.id === backupId || item.fileName === backupId,
  );
  if (!backup) return null;
  const resolvedBackup = path.resolve(backup.path);
  const allowedDir = path.resolve(
    config.openclawRoot,
    "tracevane",
    "recovery",
    "backups",
  );
  if (!resolvedBackup.startsWith(`${allowedDir}${path.sep}`)) return null;
  return { id: backup.id, path: resolvedBackup };
}

function addMs(date: Date, ms: number): string {
  return new Date(date.getTime() + ms).toISOString();
}

function msSince(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : Math.max(0, Date.now() - parsed);
}

function mergeStoredServiceSnapshot(
  snapshot: OpenClawRecoveryDaemonServiceSnapshot,
  stored: OpenClawRecoveryDaemonServiceSnapshot,
): OpenClawRecoveryDaemonServiceSnapshot {
  const sameSupervisor = stored.supervisor === snapshot.supervisor;
  const sameService = stored.serviceName === snapshot.serviceName;
  const sameConfig = !stored.configPath || stored.configPath === snapshot.configPath;
  const hasStoredState = Boolean(stored.lastCheckedAt);

  if (!sameSupervisor || !sameService || !sameConfig || !hasStoredState) {
    return snapshot;
  }

  return {
    ...snapshot,
    activeState: stored.activeState || snapshot.activeState,
    enabledState: stored.enabledState || snapshot.enabledState,
    lastCheckedAt: stored.lastCheckedAt || snapshot.lastCheckedAt,
  };
}

async function runManualProbe(
  config: TracevaneServerConfig,
  state: OpenClawRecoveryState,
): Promise<OpenClawRecoveryRunResponse> {
  const checkedAt = new Date();
  const gatewayReachable = await probeOpenClawGateway(
    config.gatewayPort,
    state.policy.probeTimeoutMs,
  );
  const failureStartedAt = gatewayReachable
    ? null
    : state.probe.failureStartedAt || checkedAt.toISOString();
  const failureDurationMs = gatewayReachable ? 0 : msSince(failureStartedAt);
  const nextState = writeRecoveryState(config, {
    ...state,
    status: gatewayReachable
      ? "healthy"
      : failureDurationMs >= state.policy.failureThresholdMs
        ? "failed"
        : "degraded",
    probe: {
      gatewayReachable,
      checkedAt: checkedAt.toISOString(),
      failureStartedAt,
      failureDurationMs,
      nextCheckAt: addMs(checkedAt, state.policy.checkIntervalMs),
    },
    notes: gatewayReachable
      ? ["Manual recovery probe succeeded."]
      : ["Manual recovery probe could not reach the gateway."],
  });

  appendRecoveryEvent(
    config,
    createRecoveryEvent({
      kind: gatewayReachable ? "probe_succeeded" : "probe_failed",
      severity: gatewayReachable ? "success" : "warning",
      title: gatewayReachable
        ? "OpenClaw gateway 轻量探测成功"
        : "OpenClaw gateway 轻量探测失败",
      summary: gatewayReachable
        ? "Manual loopback probe reached the gateway."
        : "Manual loopback probe could not reach the gateway.",
      status: gatewayReachable ? "succeeded" : "failed",
      details: { gatewayPort: config.gatewayPort },
    }),
  );

  return {
    ok: gatewayReachable,
    state: nextState,
    repair: null,
  };
}

export function createOpenClawRecoveryService(
  config: TracevaneServerConfig,
): OpenClawRecoveryService {
  return {
    async getStatus(): Promise<OpenClawRecoveryState> {
      const state = readRecoveryState(config);
      const service = await getRecoveryDaemonServiceSnapshot(config, {
        includeTemplate: true,
        probe: false,
      });
      return {
        ...state,
        service: mergeStoredServiceSnapshot(service, state.service),
      };
    },

    async listEvents(limit = 100): Promise<OpenClawRecoveryEvent[]> {
      return listRecoveryEvents(config, limit);
    },

    async listEventsPage(page = 1, pageSize = 10) {
      const paged = listRecoveryEventsPage(config, page, pageSize);
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        ...paged,
      };
    },

    async listBackups(): Promise<OpenClawRecoveryBackupSummary[]> {
      return listRecoveryBackups(config);
    },

    async listBackupsPage(page = 1, pageSize = 10) {
      const paged = listRecoveryBackupsPage(config, page, pageSize);
      return {
        ok: true,
        checkedAt: new Date().toISOString(),
        ...paged,
      };
    },

    async runRecovery(
      payload: OpenClawRecoveryRunRequest = {},
    ): Promise<OpenClawRecoveryRunResponse> {
      const state = readRecoveryState(config);
      const action = payload.action || "repair";
      if (action === "probe") {
        return runManualProbe(config, state);
      }
      const policy = {
        ...state.policy,
        runDoctorFix: payload.runDoctorFix ?? state.policy.runDoctorFix,
      };
      const repair = action === "config-repair"
        ? await runOpenClawRecoveryConfigRepair(config, {
            trigger: payload.trigger || "manual",
            policy,
          })
        : await runOpenClawRecoveryRepair(config, {
            trigger: payload.trigger || "manual",
            policy,
          });
      return {
        ok: repair.ok,
        state: readRecoveryState(config),
        repair,
      };
    },

    async restoreBackup(
      payload: OpenClawRecoveryRestoreBackupRequest,
    ): Promise<OpenClawRecoveryRestoreBackupResponse> {
      const backup = findBackupPath(config, String(payload?.backupId || ""));
      if (!backup || !fs.existsSync(backup.path)) {
        return {
          ok: false,
          restoredBackup: null,
          state: readRecoveryState(config),
          error: "Backup not found",
        };
      }
      try {
        restoreOpenClawRecoveryBackup(config, backup.path);
        const restored =
          listRecoveryBackups(config).find((item) => item.id === backup.id) ||
          null;
        appendRecoveryEvent(
          config,
          createRecoveryEvent({
            kind: "backup_restored",
            severity: "success",
            title: "OpenClaw 配置备份已恢复",
            summary: backup.id,
            status: "succeeded",
            details: { backupId: backup.id },
          }),
        );
        return {
          ok: true,
          restoredBackup: restored,
          state: readRecoveryState(config),
          error: "",
        };
      } catch (error) {
        return {
          ok: false,
          restoredBackup: null,
          state: readRecoveryState(config),
          error: error instanceof Error ? error.message : "Restore failed",
        };
      }
    },

    async getDaemonService() {
      return getRecoveryDaemonServiceSnapshot(config, {
        includeTemplate: true,
        probe: false,
      });
    },

    async applyDaemonServiceAction(
      payload: OpenClawRecoveryDaemonServiceRequest,
    ): Promise<OpenClawRecoveryDaemonServiceResponse> {
      const action = payload?.action || "status";
      if (!["install", "start", "stop", "restart", "status"].includes(action)) {
        return {
          ok: false,
          service: await getRecoveryDaemonServiceSnapshot(config, {
            includeTemplate: true,
            probe: false,
          }),
          commands: [],
          error: "Unsupported daemon service action",
        };
      }
      const result = await applyRecoveryDaemonServiceAction(config, action);
      const state = readRecoveryState(config);
      writeRecoveryState(config, {
        ...state,
        service: result.service,
      });
      return {
        ok: !result.error,
        service: result.service,
        commands: result.commands,
        error: result.error,
      };
    },
  };
}
