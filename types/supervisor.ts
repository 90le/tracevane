export type TracevaneSupervisorKind = "systemd-user" | "launchd-user" | "scheduled-task" | "session" | "none" | "unknown";
export type TracevaneServiceMode = "session" | "persistent";
export type TracevaneServiceState = "not-installed" | "stopped" | "starting" | "running" | "degraded" | "failed" | "stale-config" | "unknown";
export type TracevaneServiceAction = "preview" | "install" | "ensure-running" | "start" | "stop" | "restart" | "repair" | "uninstall" | "status";
export type TracevaneSupervisorErrorCode = "task-not-found" | "permission-denied" | "command-not-found" | "command-timeout" | "template-invalid" | "runtime-not-ready" | "stale-config" | "unsupported-platform" | "unknown";

export interface TracevaneServiceManagerStatus {
  mode: TracevaneServiceMode;
  supervisor: TracevaneSupervisorKind;
  installed: boolean;
  enabled: boolean | null;
  active: boolean | null;
  state: TracevaneServiceState;
  configCurrent: boolean;
  checkedAt: string;
  errorCode: TracevaneSupervisorErrorCode | null;
  errorMessage: string | null;
}
