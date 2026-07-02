export type TerminalBinaryId =
  "claude" | "codex" | "opencode" | "gemini" | "clawhub" | "skillhub" | "bash";
export type TerminalInstallRequestId = TerminalBinaryId | "all" | "all-missing";
export type TerminalAgentCliId = "claude" | "codex" | "opencode";
export type TerminalProfileKind =
  "shell" | "agent" | "marketplace" | "task" | "remote";
export type TerminalTargetKind = "local" | "ssh" | "container" | "kubernetes";

export interface TerminalProfileDescriptor {
  id: string;
  label: string;
  labelZh?: string;
  description: string;
  descriptionZh?: string;
  kind: TerminalProfileKind;
  targetKind: TerminalTargetKind;
  command: string;
  cwd: string | null;
  binaryId: TerminalBinaryId | null;
  installed: boolean;
  launchable: boolean;
  pinned: boolean;
  color: string;
}

export interface TerminalBinaryStatus {
  id: TerminalBinaryId;
  label: string;
  binary: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  packageName: string | null;
  installSupported: boolean;
  category: "agent" | "marketplace" | "shell";
}

export interface TerminalInstallTarget {
  id: TerminalBinaryId;
  label: string;
  packageName: string | null;
  installHint: string;
  category: "agent" | "marketplace" | "shell";
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

export type TerminalSessionStatus =
  "running" | "detached" | "completed" | "failed" | "lost";

export type TerminalSessionSource =
  "manual" | "system_action" | "linked_context" | "system-handoff";

export type TerminalSessionControlState = "controller" | "observer";

export interface TerminalHandoffContext {
  fromModule: string;
  fromRoute: string;
  triggerType: string;
  triggerLabel: string;
  targetEntity: string;
  recommendedCommand: string;
  relatedEventId: string | null;
}

export interface TerminalRecentOutputSummary {
  tailText: string;
  lastError: string | null;
  lastCommandHint: string | null;
  exitSummary: string | null;
  updatedAt: string;
}

export interface TerminalSessionLedgerEvent {
  eventId: string;
  sessionId: string;
  type: string;
  timestamp: string;
  actorClientId: string | null;
  detail: Record<string, unknown>;
}

export interface TerminalSessionDescriptor {
  sessionId: string;
  title: string;
  profileId?: string | null;
  targetKind?: TerminalTargetKind | null;
  cwd?: string | null;
  pinned?: boolean;
  source: TerminalSessionSource;
  sourceModule: string;
  sourceAction: string;
  originRoute: string;
  status: TerminalSessionStatus;
  controllerClientId: string | null;
  observerClientIds: string[];
  createdAt: string;
  lastActiveAt: string;
  lastAttachedAt: string | null;
  canResume: boolean;
  resumeKey: string | null;
  handoffContext: TerminalHandoffContext | null;
  recentOutputSummary: TerminalRecentOutputSummary | null;
  controlState: TerminalSessionControlState;
  observerCount: number;
  updatedAt: string;
}

export function isRecoverableTerminalStatus(
  status: TerminalSessionStatus,
): boolean {
  return status === "running" || status === "detached";
}

export interface TerminalSessionSummaryResponse {
  sessions: TerminalSessionDescriptor[];
}

export interface TerminalProfileCatalogResponse {
  profiles: TerminalProfileDescriptor[];
}

export interface TerminalActionDescriptor {
  key: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  command: string;
  recommendedTitle: string;
  runMode: "new-session" | "active-session";
}

export interface TerminalActionGroup {
  key: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  items: TerminalActionDescriptor[];
}

export interface TerminalActionCatalogResponse {
  groups: TerminalActionGroup[];
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
  type: "start" | "attempt" | "result" | "done" | "error";
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
  rootId?: string | null;
  workspaceId?: string | null;
  profileId?: string | null;
  targetKind?: TerminalTargetKind | null;
  cwd?: string | null;
  shell?: string | null;
  cols?: number | null;
  rows?: number | null;
  pinned?: boolean | null;
  lastSeq?: number | null;
  instanceId?: string | null;
  skipReplay?: boolean | null;
  resume?: boolean | null;
  outputMode?: "gateway" | "http-stream" | null;
  handoffContext?: TerminalHandoffContext | null;
}

export interface TerminalGatewayInputPayload {
  sid: string;
  data: string;
  lastSeq?: number | null;
  instanceId?: string | null;
  ackMode?: "full" | "none" | null;
}

export interface TerminalGatewayResizePayload {
  sid: string;
  cols: number;
  rows: number;
  lastSeq?: number | null;
  instanceId?: string | null;
}

export interface TerminalGatewayHeartbeatPayload {
  sid: string;
  lastSeq?: number | null;
  instanceId?: string | null;
}

export interface TerminalGatewayClearPayload {
  sid: string;
  lastSeq?: number | null;
  instanceId?: string | null;
}

export interface TerminalGatewayDetachPayload {
  sid?: string | null;
}

export interface TerminalGatewaySessionEvent {
  type: "session";
  sid: string;
  instanceId: string;
  outputSeq: number;
  descriptor?: TerminalSessionDescriptor;
}

export interface TerminalGatewayResetEvent {
  type: "reset";
  sid: string;
  instanceId: string;
  reason: "session_recreated" | "backlog_gap";
}

export interface TerminalGatewayOutputEvent {
  type: "output";
  sid: string;
  seq: number;
  data: string;
  emittedAtMs?: number;
}

export interface TerminalGatewayClearEvent {
  type: "clear";
  sid: string;
  instanceId: string;
  clearedThroughSeq: number;
}

export interface TerminalGatewayClosedEvent {
  type: "closed";
  sid: string;
  reason: "session_ended" | "session_exited";
}

export interface TerminalGatewayErrorEvent {
  type: "error";
  sid: string;
  message: string;
}

export type TerminalGatewayEvent =
  | TerminalGatewaySessionEvent
  | TerminalGatewayResetEvent
  | TerminalGatewayOutputEvent
  | TerminalGatewayClearEvent
  | TerminalGatewayClosedEvent
  | TerminalGatewayErrorEvent;

export interface TerminalGatewayAttachResponse {
  sid: string;
  descriptor?: TerminalSessionDescriptor;
  leaseTtlMs: number;
  events: TerminalGatewayEvent[];
}

export interface TerminalGatewayAckResponse {
  ok: true;
  sid: string;
  instanceId?: string;
  outputSeq?: number;
  leaseTtlMs?: number;
  events?: TerminalGatewayEvent[];
}

export const TRACEVANE_TERMINAL_GATEWAY_EVENT = "tracevane.terminal";

export const TRACEVANE_TERMINAL_GATEWAY_METHODS = {
  attach: "tracevane.terminal.attach",
  input: "tracevane.terminal.input",
  resize: "tracevane.terminal.resize",
  heartbeat: "tracevane.terminal.heartbeat",
  clear: "tracevane.terminal.clear",
  detach: "tracevane.terminal.detach",
} as const;
