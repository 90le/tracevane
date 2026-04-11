export type TerminalBinaryId = 'claude' | 'codex' | 'opencode' | 'clawhub' | 'skillhub' | 'bash';
export type TerminalInstallRequestId = TerminalBinaryId | 'all' | 'all-missing';
export type TerminalLaunchCli = 'claude' | 'codex' | 'opencode' | 'bash';

export interface TerminalBinaryStatus {
  id: TerminalBinaryId;
  label: string;
  binary: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  packageName: string | null;
  installSupported: boolean;
  category: 'agent' | 'marketplace' | 'shell';
}

export interface TerminalInstallTarget {
  id: TerminalBinaryId;
  label: string;
  packageName: string | null;
  installHint: string;
  category: 'agent' | 'marketplace' | 'shell';
}

export interface TerminalRuntimeConfig {
  model: string;
  provider: string;
}

export interface TerminalSkillDependencySummary {
  needsSetupCount: number;
  blockedCount: number;
  missingBinaryCount: number;
  missingBinaries: Array<{
    binary: string;
    skills: string[];
  }>;
  marketplaceCli: {
    clawhubInstalled: boolean;
    skillhubInstalled: boolean;
  };
}

export interface TerminalStatusPayload {
  checkedAt: string;
  ptyAvailable: boolean;
  sessionCount: number;
  binaries: TerminalBinaryStatus[];
  config: TerminalRuntimeConfig;
  installTargets: TerminalInstallTarget[];
  skills: TerminalSkillDependencySummary;
}

export interface TerminalInstallAttemptLog {
  stage: string;
  command: string;
  success: boolean;
  output: string;
  stderr: string;
  error: string;
}

export interface TerminalInstallResult {
  cli: TerminalBinaryId;
  label: string;
  success: boolean;
  alreadyInstalled: boolean;
  packageName: string | null;
  packageManager: string | null;
  path: string | null;
  command: string | null;
  output: string;
  stderr: string;
  error: string;
  attempts: TerminalInstallAttemptLog[];
}

export interface TerminalInstallResponse {
  success: boolean;
  requested: TerminalInstallRequestId;
  installedNow: string[];
  failed: Array<{
    cli: TerminalBinaryId;
    error: string;
  }>;
  message: string;
  results: TerminalInstallResult[];
  status: TerminalStatusPayload;
}

export interface TerminalLaunchPayload {
  cli: TerminalLaunchCli;
  model?: string;
}

export interface TerminalLaunchResponse {
  cli: TerminalLaunchCli;
  command: string;
  label: string;
}

export interface TerminalEndPayload {
  sid: string;
}

export interface TerminalEndResponse {
  success: boolean;
  sid: string;
  ended: boolean;
}

export interface TerminalInstallStreamEvent {
  type: 'start' | 'attempt' | 'result' | 'done' | 'error';
  message?: string;
  cli?: string;
  stage?: string;
  command?: string;
  success?: boolean;
  output?: string;
  stderr?: string;
  error?: string;
  response?: TerminalInstallResponse;
}

export interface TerminalGatewayAttachPayload {
  sid?: string | null;
  lastSeq?: number | null;
  instanceId?: string | null;
}

export interface TerminalGatewayInputPayload {
  sid: string;
  data: string;
}

export interface TerminalGatewayResizePayload {
  sid: string;
  cols: number;
  rows: number;
}

export interface TerminalGatewayHeartbeatPayload {
  sid: string;
}

export interface TerminalGatewayDetachPayload {
  sid?: string | null;
}

export interface TerminalGatewaySessionEvent {
  type: 'session';
  sid: string;
  instanceId: string;
  outputSeq: number;
}

export interface TerminalGatewayResetEvent {
  type: 'reset';
  sid: string;
  instanceId: string;
  reason: 'session_recreated';
}

export interface TerminalGatewayOutputEvent {
  type: 'output';
  sid: string;
  seq: number;
  data: string;
}

export interface TerminalGatewayClosedEvent {
  type: 'closed';
  sid: string;
  reason: 'session_ended' | 'session_exited';
}

export interface TerminalGatewayErrorEvent {
  type: 'error';
  sid: string;
  message: string;
}

export type TerminalGatewayEvent =
  | TerminalGatewaySessionEvent
  | TerminalGatewayResetEvent
  | TerminalGatewayOutputEvent
  | TerminalGatewayClosedEvent
  | TerminalGatewayErrorEvent;

export interface TerminalGatewayAttachResponse {
  sid: string;
  leaseTtlMs: number;
  events: TerminalGatewayEvent[];
}

export interface TerminalGatewayAckResponse {
  ok: true;
  sid: string;
}

export const STUDIO_TERMINAL_GATEWAY_EVENT = 'studio.terminal';

export const STUDIO_TERMINAL_GATEWAY_METHODS = {
  attach: 'studio.terminal.attach',
  input: 'studio.terminal.input',
  resize: 'studio.terminal.resize',
  heartbeat: 'studio.terminal.heartbeat',
  detach: 'studio.terminal.detach',
} as const;
