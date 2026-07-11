import type {
  TracevaneServiceManagerStatus,
  TracevaneSupervisorKind,
} from "./supervisor.js";

export const OPENCLAW_RECOVERY_DEFAULT_HOST = "127.0.0.1";
export const OPENCLAW_RECOVERY_DEFAULT_PORT = 18797;
export const OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME =
  "tracevane-recovery.service";

export type OpenClawRecoverySupervisorKind = TracevaneSupervisorKind;

export type OpenClawRecoveryDaemonState =
  | "not-installed"
  | "running"
  | "stale"
  | "stopped"
  | "unknown";

export type OpenClawRecoveryStateKind =
  | "healthy"
  | "degraded"
  | "repairing"
  | "failed"
  | "unknown";

export type OpenClawRecoveryEventSeverity =
  | "info"
  | "warning"
  | "error"
  | "success";

export type OpenClawRecoveryEventKind =
  | "daemon_started"
  | "daemon_stopped"
  | "gateway_probe_failed"
  | "probe_succeeded"
  | "probe_failed"
  | "repair_started"
  | "repair_succeeded"
  | "repair_failed"
  | "config_repair_started"
  | "config_repair_succeeded"
  | "config_repair_failed"
  | "config_backup_created"
  | "backup_restored"
  | "backup_restore_requested"
  | "cli_manifest_updated"
  | "cli_reinstall_started"
  | "cli_reinstall_succeeded"
  | "cli_reinstall_failed"
  | "gateway_runtime_discovered"
  | "gateway_process_takeover_succeeded"
  | "gateway_process_takeover_skipped"
  | "gateway_deep_probe_failed"
  | "gateway_service_repair_succeeded"
  | "gateway_service_repair_skipped"
  | "gateway_service_repair_failed"
  | "tracevane_web_bundle_rebuild_succeeded"
  | "tracevane_web_bundle_rebuild_skipped"
  | "tracevane_web_bundle_rebuild_failed"
  | (string & {});

export type OpenClawRecoveryTrigger = "auto" | "manual";

export type OpenClawRecoveryRunAction =
  | "probe"
  | "config-repair"
  | "repair"
  | "diagnostics";

export type OpenClawRecoveryDaemonServiceAction =
  | "preview"
  | "install"
  | "start"
  | "stop"
  | "restart"
  | "status";

export interface OpenClawRecoveryPolicy {
  enabled: boolean;
  checkIntervalMs: number;
  probeTimeoutMs: number;
  failureThresholdMs: number;
  repairCooldownMs: number;
  runDoctorFix: boolean;
  maxBackups: number;
  allowCliReinstall: boolean;
  cliReinstallTimeoutMs: number;
  allowGatewayServiceRepair: boolean;
  gatewayServiceRepairTimeoutMs: number;
  allowGatewayProcessTakeover: boolean;
  gatewayProcessTakeoverTimeoutMs: number;
  allowTracevaneWebRebuild: boolean;
  tracevaneWebRebuildTimeoutMs: number;
}

export interface OpenClawRecoveryDaemonRuntime {
  pid: number | null;
  startedAt: string | null;
  heartbeatAt: string | null;
  version: string;
}

export interface OpenClawRecoveryProbeSnapshot {
  gatewayReachable: boolean | null;
  checkedAt: string | null;
  failureStartedAt: string | null;
  failureDurationMs: number;
  nextCheckAt: string | null;
}

export interface OpenClawRecoveryCommand {
  label: string;
  command: string;
  args: string[];
}

export type OpenClawRecoveryDaemonServiceCommand = OpenClawRecoveryCommand;

export interface OpenClawRecoveryCommandSnapshot
  extends OpenClawRecoveryCommand {
  ok: boolean;
  status: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  error: string;
}

export interface OpenClawRecoveryLastRepair {
  ok: boolean;
  trigger: OpenClawRecoveryTrigger;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  backupPath: string | null;
  changedKeys: string[];
  commands: OpenClawRecoveryCommandSnapshot[];
  error: string;
}

export interface OpenClawRecoveryRepairSnapshot {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  status: "idle" | "running" | "succeeded" | "failed";
  lastError: string | null;
  commandLog: OpenClawRecoveryCommandSnapshot[];
}

export interface OpenClawRecoveryMonitorSnapshot {
  state: OpenClawRecoveryStateKind;
  consecutiveFailures: number;
  failureStartedAt: string | null;
  lastProbeAt: string | null;
  lastProbeOk: boolean | null;
  lastProbeError: string | null;
  nextProbeAt: string | null;
  nextRepairAllowedAt: string | null;
  repairRunning: boolean;
}

export interface OpenClawRecoveryRuntimeState {
  version: 1;
  updatedAt: string;
  startedAt: string | null;
  pid: number | null;
  host: string;
  port: number;
  endpoint: string;
  supervisor: OpenClawRecoverySupervisorKind;
  serviceName: string;
  policy: OpenClawRecoveryPolicy;
  monitor: OpenClawRecoveryMonitorSnapshot;
  repair: OpenClawRecoveryRepairSnapshot;
}

export interface OpenClawRecoveryEvent {
  id: string;
  kind: OpenClawRecoveryEventKind;
  severity: OpenClawRecoveryEventSeverity;
  occurredAt: string;
  title: string;
  summary: string;
  status: string;
  details: Record<string, unknown>;
}

export type OpenClawRecoveryEventRecord = OpenClawRecoveryEvent;

export interface OpenClawRecoveryBackupSummary {
  id: string;
  fileName: string;
  path: string;
  createdAt: string;
  sizeBytes: number;
  reason: string;
}

export type OpenClawRecoveryBackupRecord = OpenClawRecoveryBackupSummary;

export interface OpenClawRecoveryPagination {
  page: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export type OpenClawRecoveryCliInstallKind =
  | "npm-global"
  | "path"
  | "unknown";

export interface OpenClawRecoveryInstallManifest {
  version: 1;
  updatedAt: string;
  cliPath: string;
  cliRealPath: string;
  cliVersion: string;
  nodePath: string;
  packageManager: "npm" | "unknown";
  packageName: string;
  packageSpec: string;
  npmPrefix: string;
  installKind: OpenClawRecoveryCliInstallKind;
  projectRoot: string;
}

export interface OpenClawRecoveryDaemonServiceTemplate {
  supervisor: OpenClawRecoverySupervisorKind;
  platform: NodeJS.Platform;
  serviceName: string;
  configPath: string;
  content: string;
  commands: Partial<
    Record<OpenClawRecoveryDaemonServiceAction, OpenClawRecoveryCommand[]>
  >;
}

export interface OpenClawRecoveryDaemonServicePlan {
  platform: string;
  supported: boolean;
  supervisor: OpenClawRecoverySupervisorKind;
  serviceName: string;
  nodePath: string;
  daemonEntry: string;
  stateDir: string;
  selectedTemplate: OpenClawRecoveryDaemonServiceTemplate;
  templates: OpenClawRecoveryDaemonServiceTemplate[];
  notes: string[];
}

export interface OpenClawRecoveryDaemonServiceSnapshot {
  manager?: TracevaneServiceManagerStatus;
  supervisor: OpenClawRecoverySupervisorKind;
  serviceName: string;
  configPath: string;
  installed: boolean;
  activeState: string;
  enabledState: string;
  lastCheckedAt: string | null;
  template?: OpenClawRecoveryDaemonServiceTemplate;
}

export interface OpenClawRecoveryDaemonServiceRequest {
  action?: OpenClawRecoveryDaemonServiceAction;
  apply?: boolean;
  runCommands?: boolean;
}

export interface OpenClawRecoveryDaemonServiceResponse {
  ok: boolean;
  service: OpenClawRecoveryDaemonServiceSnapshot;
  commands: OpenClawRecoveryCommandSnapshot[];
  error: string;
}

export interface OpenClawRecoveryState {
  checkedAt: string;
  status: OpenClawRecoveryStateKind;
  daemon: OpenClawRecoveryDaemonRuntime;
  probe: OpenClawRecoveryProbeSnapshot;
  policy: OpenClawRecoveryPolicy;
  lastRepair: OpenClawRecoveryLastRepair | null;
  service: OpenClawRecoveryDaemonServiceSnapshot;
  notes: string[];
}

export type OpenClawRecoveryStatusPayload = OpenClawRecoveryState;

export interface OpenClawRecoveryEventsPayload {
  ok: true;
  checkedAt: string;
  events: OpenClawRecoveryEvent[];
  pagination: OpenClawRecoveryPagination;
}

export interface OpenClawRecoveryBackupsPayload {
  ok: true;
  checkedAt: string;
  backups: OpenClawRecoveryBackupSummary[];
  pagination: OpenClawRecoveryPagination;
}

export interface OpenClawRecoveryRunRequest {
  action?: OpenClawRecoveryRunAction;
  trigger?: OpenClawRecoveryTrigger;
  reason?: string;
  force?: boolean;
  runDoctorFix?: boolean;
}

export interface OpenClawRecoveryRunResponse {
  ok: boolean;
  state: OpenClawRecoveryState;
  repair: OpenClawRecoveryLastRepair | null;
}

export interface OpenClawRecoveryRestoreBackupRequest {
  backupId?: string;
  backupPath?: string;
}

export interface OpenClawRecoveryRestoreBackupResponse {
  ok: boolean;
  restoredBackup: OpenClawRecoveryBackupSummary | null;
  state: OpenClawRecoveryState;
  error: string;
}
