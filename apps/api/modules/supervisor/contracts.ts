import type {
  TracevaneServiceAction,
  TracevaneSupervisorKind,
} from "../../../../types/supervisor.js";

export interface ServiceDefinition {
  id: "model-gateway" | "channel-connectors" | "openclaw-recovery";
  displayName: string;
  serviceName: string;
  windowsTaskName: string;
  launchdLabel: string;
  entryPath: string;
  workingDirectory: string;
  configPath: string;
  runtimePath: string;
  logPath: string;
  healthUrl: string;
  args: string[];
}

export interface SupervisorCommand {
  label: string;
  command: string;
  args: string[];
  kind?: "windows-task-status";
}

export interface CreateSupervisorPlanOptions {
  windowsUserId?: string;
}

export interface SupervisorPlan {
  platform: NodeJS.Platform;
  supervisor: TracevaneSupervisorKind;
  serviceName: string;
  configPath: string;
  template: string;
  commands: Partial<Record<TracevaneServiceAction, SupervisorCommand[]>>;
  fingerprint: string;
}
