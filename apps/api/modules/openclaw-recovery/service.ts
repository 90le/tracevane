import fs from "node:fs";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import {
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  type OpenClawRecoveryBackupSummary,
  type OpenClawRecoveryCommandSnapshot,
  type OpenClawRecoveryDaemonServiceSnapshot,
  type OpenClawRecoveryDaemonServiceRequest,
  type OpenClawRecoveryDaemonServiceResponse,
  type OpenClawRecoveryEvent,
  type OpenClawRecoveryRestoreBackupRequest,
  type OpenClawRecoveryRestoreBackupResponse,
  type OpenClawRecoveryRunRequest,
  type OpenClawRecoveryRunResponse,
  type OpenClawRecoveryState,
} from "../../../../types/openclaw-recovery.js";
import type {
  TracevaneServiceAction,
  TracevaneServiceManagerStatus,
  TracevaneServiceMode,
} from "../../../../types/supervisor.js";
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
  createOpenClawRecoveryDaemonServicePlan,
  createOpenClawRecoveryServiceDefinition,
} from "./supervisor.js";
import { captureOpenClawRecoveryInstallManifest } from "./cli-bootstrap.js";
import { resolveRecoveryHome } from "./paths.js";
import { probeOpenClawGateway } from "./probe.js";
import {
  createServiceManager,
  type ManageServiceResponse,
  type ServiceManager,
} from "../supervisor/index.js";
import type { SupervisorCommandResult } from "../supervisor/command-runner.js";

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

export interface OpenClawRecoveryServiceOptions {
  runtimeHost?: "tracevane-api" | "local-daemon";
  homeDir?: string;
  controlPort?: number;
  daemonServiceManager?: ServiceManager;
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

const DAEMON_SERVICE_ACTIONS = new Set<TracevaneServiceAction>([
  "preview",
  "install",
  "ensure-running",
  "start",
  "stop",
  "restart",
  "repair",
  "uninstall",
  "status",
]);

function normalizeDaemonServiceAction(
  value: unknown,
): TracevaneServiceAction | null {
  return DAEMON_SERVICE_ACTIONS.has(value as TracevaneServiceAction)
    ? value as TracevaneServiceAction
    : value === undefined
      ? "status"
      : null;
}

function normalizeDaemonServiceMode(value: unknown): TracevaneServiceMode {
  return value === "persistent" ? "persistent" : "session";
}

function normalizeDaemonServiceApply(
  payload: OpenClawRecoveryDaemonServiceRequest,
): boolean {
  return payload.apply === true || payload.runCommands === true;
}

function legacyActiveState(manager: TracevaneServiceManagerStatus): string {
  if (manager.active === true) return "active";
  if (manager.active === false) return "inactive";
  return manager.state === "unknown" ? "unknown" : manager.state;
}

function legacyEnabledState(manager: TracevaneServiceManagerStatus): string {
  if (manager.enabled === true) return "enabled";
  if (manager.enabled === false) return "disabled";
  return "unknown";
}

function compatibilityCommandResult(
  result: SupervisorCommandResult,
): OpenClawRecoveryCommandSnapshot {
  return {
    label: result.label,
    command: result.command,
    args: [...result.args],
    ok: result.ok,
    status: result.exitCode,
    durationMs: result.durationMs,
    stdout: result.stdout,
    stderr: result.stderr,
    error: result.errorMessage || "",
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
  options: OpenClawRecoveryServiceOptions = {},
): OpenClawRecoveryService {
  const runtimeHost = options.runtimeHost ?? "tracevane-api";
  const homeDir = options.homeDir ?? resolveRecoveryHome(config);
  const controlPort = options.controlPort ?? OPENCLAW_RECOVERY_DEFAULT_PORT;
  const daemonServiceManager = options.daemonServiceManager
    ?? createServiceManager({
      homeDir,
      redact: [...new Set(
        Object.entries(process.env)
          .filter(([key, value]) =>
            /^(?:https?|all|no)_proxy$/i.test(key) && Boolean(value?.trim()))
          .map(([, value]) => value!.trim()),
      )],
    });
  const daemonServicePlan = createOpenClawRecoveryDaemonServicePlan(config, {
    homeDir,
    port: controlPort,
  });

  function serviceSnapshot(
    manager: TracevaneServiceManagerStatus,
  ): OpenClawRecoveryDaemonServiceSnapshot {
    return {
      manager,
      supervisor: daemonServicePlan.supervisor,
      serviceName: daemonServicePlan.serviceName,
      configPath: daemonServicePlan.selectedTemplate.configPath,
      installed: manager.installed,
      activeState: legacyActiveState(manager),
      enabledState: legacyEnabledState(manager),
      lastCheckedAt: manager.checkedAt,
      template: daemonServicePlan.selectedTemplate,
    };
  }

  async function daemonServiceResponse(
    mode: TracevaneServiceMode,
    apply: boolean,
    managed: ManageServiceResponse,
  ): Promise<OpenClawRecoveryDaemonServiceResponse> {
    const commands = managed.commands.map(compatibilityCommandResult);
    if (
      mode === "persistent"
      && apply
      && managed.templateWritten
      && (managed.action === "install" || managed.action === "ensure-running")
    ) {
      try {
        await captureOpenClawRecoveryInstallManifest(config, commands);
      } catch (error) {
        commands.push({
          label: "Capture OpenClaw install manifest",
          command: "openclaw",
          args: ["--version"],
          ok: false,
          status: null,
          durationMs: 0,
          stdout: "",
          stderr: "",
          error: error instanceof Error
            ? error.message.slice(0, 800)
            : "OpenClaw install manifest capture failed.",
        });
      }
    }
    const failedCommand = managed.commands.find((command) => !command.ok);
    return {
      ok: managed.ok,
      service: serviceSnapshot(managed.manager),
      commands,
      error: managed.manager.errorMessage
        || failedCommand?.errorMessage
        || "",
    };
  }

  async function executeDaemonService(
    payload: OpenClawRecoveryDaemonServiceRequest = {},
  ): Promise<OpenClawRecoveryDaemonServiceResponse> {
    const action = normalizeDaemonServiceAction(payload.action);
    const mode = normalizeDaemonServiceMode(payload.mode);
    const apply = normalizeDaemonServiceApply(payload);
    if (action === null) {
      const definition = createOpenClawRecoveryServiceDefinition(config, {
        mode: "session",
        port: controlPort,
      });
      const status = await daemonServiceManager.manage(definition, {
        action: "status",
        mode: "session",
        apply: false,
      });
      const response = await daemonServiceResponse("session", false, status);
      return {
        ...response,
        ok: false,
        error: "Unsupported daemon service action",
      };
    }
    if (
      runtimeHost === "local-daemon"
      && mode === "session"
      && (action === "start"
        || action === "restart"
        || action === "ensure-running")
    ) {
      return daemonServiceResponse(mode, false, {
        ok: false,
        action,
        manager: {
          mode: "session",
          supervisor: "session",
          installed: false,
          enabled: null,
          active: null,
          state: "degraded",
          configCurrent: true,
          checkedAt: new Date().toISOString(),
          errorCode: "runtime-not-ready",
          errorMessage:
            "A local Recovery daemon cannot create another session owner.",
        },
        commands: [],
        templateWritten: false,
        configCurrent: true,
      });
    }
    const definition = createOpenClawRecoveryServiceDefinition(config, {
      mode,
      port: controlPort,
    });
    const managed = await daemonServiceManager.manage(definition, {
      action,
      mode,
      apply,
    });
    return daemonServiceResponse(mode, apply, managed);
  }

  return {
    async getStatus(): Promise<OpenClawRecoveryState> {
      const state = readRecoveryState(config);
      const service = await executeDaemonService({
        action: "status",
        mode: "session",
        apply: false,
      });
      return {
        ...state,
        service: service.service,
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
      return (await executeDaemonService({
        action: "status",
        mode: "session",
        apply: false,
      })).service;
    },

    async applyDaemonServiceAction(
      payload: OpenClawRecoveryDaemonServiceRequest,
    ): Promise<OpenClawRecoveryDaemonServiceResponse> {
      const result = await executeDaemonService(payload);
      const state = readRecoveryState(config);
      writeRecoveryState(config, {
        ...state,
        service: result.service,
      });
      return result;
    },
  };
}
