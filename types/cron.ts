export type CronScheduleKind = 'cron' | 'every' | 'at';
export type CronPayloadKind = 'agentTurn' | 'systemEvent';
export type CronSessionTargetMode = 'isolated' | 'main' | 'existing-session';
export type CronDeliveryMode = 'silent' | 'announce' | 'webhook';
export type CronDeliveryTargetType = 'channelBinding' | 'legacyChannel' | 'directSession' | 'webhook';

export interface CronAgentOption {
  id: string;
  name: string;
  model: string;
}

export interface CronTargetOption {
  ref: string;
  type: CronDeliveryTargetType;
  label: string;
  description: string;
}

export interface CronFailureAlertSummary {
  enabled: boolean;
  mode: 'announce' | 'webhook';
  channel: string;
  accountId: string;
  to: string;
  after: number | null;
  cooldownMs: number | null;
}

export interface CronFailureDestinationSummary {
  enabled: boolean;
  mode: 'announce' | 'webhook';
  channel: string;
  accountId: string;
  to: string;
}

export interface CronSessionOption {
  key: string;
  label: string;
  agentId: string;
  updatedAt: string | null;
}

export interface CronScheduleSummary {
  kind: CronScheduleKind;
  label: string;
  expr: string;
  everyMs: number | null;
  at: string | null;
  timezone: string | null;
  staggerMs: number | null;
}

export interface CronPayloadSummary {
  kind: CronPayloadKind;
  message: string;
  systemEvent: string;
  thinking: string;
  timeoutSeconds: number | null;
  model: string;
  lightContext: boolean;
  expectFinal: boolean;
}

export interface CronDeliverySummary {
  mode: CronDeliveryMode;
  targetType: CronDeliveryTargetType | '';
  targetRef: string;
  label: string;
  bestEffort: boolean;
  failureDestination: CronFailureDestinationSummary;
}

export interface CronStateSummary {
  lastStatus: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  consecutiveErrors: number;
  lastDurationMs: number | null;
  lastDeliveryStatus: string | null;
}

export interface CronJobSummary {
  id: string;
  name: string;
  description: string;
  agentId: string;
  enabled: boolean;
  schedule: CronScheduleSummary;
  sessionTargetMode: CronSessionTargetMode;
  sessionTargetRef: string;
  sessionTargetLabel: string;
  wakeMode: string;
  payload: CronPayloadSummary;
  delivery: CronDeliverySummary;
  failureAlert: CronFailureAlertSummary;
  deleteAfterRun: boolean;
  state: CronStateSummary;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CronRunSummary {
  ts: string | null;
  action: string;
  status: string;
  error: string;
  summary: string;
  summaryPreview: string;
  deliveryStatus: string;
  sessionId: string;
  sessionKey: string;
  runAt: string | null;
  durationMs: number | null;
  nextRunAt: string | null;
  model: string;
  provider: string;
  totalTokens: number | null;
}

export interface CronSchedulerSummary {
  enabled: boolean;
  storePath: string;
  maxConcurrentRuns: number | null;
  runLogDir: string;
  sessionRetention: string;
  runLogMaxBytes: number | null;
  runLogKeepLines: number | null;
  failureWebhook: string;
  failureWebhookTokenConfigured: boolean;
  defaultFailureAlert: CronFailureAlertSummary;
  defaultFailureDestination: CronFailureDestinationSummary;
  live: {
    source: 'cli' | 'derived';
    jobs: number | null;
    nextWakeAt: string | null;
    error: string;
  };
}

export interface CronSummaryPayload {
  checkedAt: string;
  count: number;
  enabledCount: number;
  disabledCount: number;
  scheduler: CronSchedulerSummary;
  agents: CronAgentOption[];
  deliveryTargets: CronTargetOption[];
  sessionTargets: CronSessionOption[];
  jobs: CronJobSummary[];
}

export interface CronDetailPayload {
  checkedAt: string;
  scheduler: CronSchedulerSummary;
  agents: CronAgentOption[];
  deliveryTargets: CronTargetOption[];
  sessionTargets: CronSessionOption[];
  job: CronJobSummary;
  runs: CronRunSummary[];
}

export interface CronJobInput {
  name: string;
  description?: string;
  agentId?: string;
  enabled?: boolean;
  scheduleKind: CronScheduleKind;
  cronExpr?: string;
  timezone?: string;
  every?: string;
  at?: string;
  stagger?: string;
  sessionTargetMode?: CronSessionTargetMode;
  sessionTargetRef?: string;
  wakeMode?: string;
  payloadKind?: CronPayloadKind;
  message?: string;
  systemEvent?: string;
  thinking?: string;
  timeoutSeconds?: number | null;
  model?: string;
  lightContext?: boolean;
  expectFinal?: boolean;
  deliveryMode?: CronDeliveryMode;
  deliveryTargetType?: CronDeliveryTargetType | '';
  deliveryTargetRef?: string;
  deliveryBestEffort?: boolean;
  failureDestinationEnabled?: boolean;
  failureDestinationMode?: 'announce' | 'webhook';
  failureDestinationChannel?: string;
  failureDestinationAccountId?: string;
  failureDestinationTo?: string;
  failureAlertEnabled?: boolean;
  failureAlertMode?: 'announce' | 'webhook';
  failureAlertChannel?: string;
  failureAlertAccountId?: string;
  failureAlertTo?: string;
  failureAlertAfter?: number | null;
  failureAlertCooldown?: string;
  deleteAfterRun?: boolean;
}

export interface CronMutationResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  summary: CronSummaryPayload;
  detail?: CronDetailPayload;
}

export interface CronRunResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  output: string;
}
