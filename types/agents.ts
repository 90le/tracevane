export type AgentDocName =
  | "IDENTITY.md"
  | "SOUL.md"
  | "AGENTS.md"
  | "USER.md"
  | "TOOLS.md"
  | "HEARTBEAT.md"
  | "MEMORY.md";

export interface AgentIdentitySummary {
  name: string;
  emoji: string;
  role: string;
  style: string;
  theme: string;
  avatar: string;
  mission: string;
}

export interface AgentRuntimeSummary {
  type: "default" | "acp";
  backend: string;
  agent: string;
  mode: string;
  cwd: string;
}

export type AgentJsonObject = Record<string, unknown>;

export interface AgentSessionStats {
  count: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  lastActiveAt: string | null;
  hottestSessionId: string;
  lastRoute: string;
}

export interface AgentDocumentSummary {
  name: AgentDocName;
  title: string;
  description: string;
  path: string;
  exists: boolean;
  size: number;
  updatedAt: string | null;
}

export interface AgentBindingSummary {
  id: string;
  ref: string;
  type: "route" | "acp";
  channel: string;
  accountId: string;
  peerKind: string;
  peerId: string;
  guildId: string;
  teamId: string;
  roles: string[];
  description: string;
  comment: string;
  backend: string;
  mode: string;
  cwd: string;
  label: string;
}

export interface AgentBindingInput {
  type: "route" | "acp";
  channel: string;
  accountId?: string | null;
  comment?: string | null;
  peerKind?: string | null;
  peerId?: string | null;
  guildId?: string | null;
  teamId?: string | null;
  roles?: string[];
  backend?: string | null;
  mode?: string | null;
  cwd?: string | null;
  label?: string | null;
}

export interface AgentBindingTargetOption {
  channel: string;
  label: string;
  accounts: Array<{
    id: string;
    label: string;
  }>;
}

export interface AgentSessionSummary {
  id: string;
  sessionId: string;
  routeKey: string;
  lastRoute: string;
  model: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheRead: number;
  cacheWrite: number;
  updatedAt: string | null;
  chatType: string;
  sessionFile: string;
}

export interface AgentSummary {
  id: string;
  name: string;
  model: string;
  workspace: string;
  agentDir: string;
  enabled: boolean;
  isDefault: boolean;
  sessionCount: number;
  totalTokens: number;
  lastActiveAt: string | null;
  sandboxMode: string;
  workspaceAccess: string;
  toolsProfile: string;
  fsWorkspaceOnly: boolean;
  thinkingDefault: string;
  verboseDefault: string;
  reasoningDefault: string;
  fastModeDefault: string;
  bindingCount: number;
  docCount: number;
  identity: AgentIdentitySummary;
  runtime: AgentRuntimeSummary;
}

export interface AgentEditorPayload {
  name: string;
  model: string;
  modelRaw: AgentJsonObject | null;
  workspace: string;
  enabled: boolean;
  sandboxMode: string;
  workspaceAccess: string;
  toolsProfile: string;
  fsWorkspaceOnly: boolean;
  thinkingDefault: string;
  verboseDefault: string;
  reasoningDefault: string;
  fastModeDefault: string;
  systemPromptOverride: string;
  skills: string[];
  sandboxRaw: AgentJsonObject | null;
  toolsRaw: AgentJsonObject | null;
  memorySearch: AgentJsonObject | null;
  humanDelay: AgentJsonObject | null;
  heartbeat: AgentJsonObject | null;
  groupChat: AgentJsonObject | null;
  subagents: AgentJsonObject | null;
  params: AgentJsonObject | null;
  runtime: AgentRuntimeSummary;
  identity: AgentIdentitySummary;
}

export interface AgentDefaultsSummary {
  model: string;
  workspace: string;
  sandboxMode: string;
  workspaceAccess: string;
  toolsProfile: string;
  thinkingDefault: string;
  verboseDefault: string;
}

export interface AgentDetailPayload {
  checkedAt: string;
  agent: AgentSummary;
  editor: AgentEditorPayload;
  defaults: AgentDefaultsSummary;
  rawConfig: Record<string, unknown>;
  docs: AgentDocumentSummary[];
  bindings: AgentBindingSummary[];
  bindingTargets: AgentBindingTargetOption[];
  sessions: AgentSessionStats;
  recentSessions: AgentSessionSummary[];
}

export interface AgentsSummaryPayload {
  checkedAt: string;
  count: number;
  defaultAgentId: string | null;
  availableModels: string[];
  agents: AgentSummary[];
}

export type AgentRuntimeRunSource = "terminal" | "im-channel";

export type AgentRuntimeRunStatus =
  | "running"
  | "idle"
  | "detached"
  | "completed"
  | "failed"
  | "lost"
  | "aborted"
  | "unknown";

export interface AgentRuntimeRunEvidenceRef {
  kind: "terminal-session" | "im-session" | "event";
  label: string;
  href: string | null;
}

export interface AgentRuntimeRunSummary {
  id: string;
  source: AgentRuntimeRunSource;
  /** Human-readable source label, e.g. 终端 / 飞书私聊 / 本地对话. */
  sourceLabel: string;
  originId: string;
  /** Operator-facing title; raw ids are kept in metadata instead of the title. */
  title: string;
  agentId: string | null;
  cli: string | null;
  model: string | null;
  providerId: string | null;
  routeScope: string | null;
  workspace: string | null;
  status: AgentRuntimeRunStatus;
  statusLabel: string;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
  lastErrorSummary: string | null;
  /** Primary owning page for this run; write actions still stay in that owner. */
  primaryHref: string | null;
  canOpen: boolean;
  canStop: boolean;
  canDelete: boolean;
  /** Short operator-facing action summary for the current owner boundary. */
  actionLabel: string;
  /** Explains why the run can or cannot be controlled from CLI Agents. */
  actionReason: string;
  metadata: Record<string, string | number | boolean | null>;
  evidenceRefs: AgentRuntimeRunEvidenceRef[];
}

export interface AgentRuntimeRunsResponse {
  checkedAt: string;
  runs: AgentRuntimeRunSummary[];
  totals: {
    total: number;
    running: number;
    failed: number;
    terminal: number;
    imChannel: number;
  };
}

export interface AgentDocumentPayload {
  checkedAt: string;
  agentId: string;
  doc: AgentDocumentSummary;
  content: string;
}

export interface AgentIdentityInput {
  name?: string;
  emoji?: string;
  role?: string;
  style?: string;
  theme?: string;
  avatar?: string;
  mission?: string;
}

export interface AgentRuntimeInput {
  type?: "default" | "acp";
  backend?: string;
  agent?: string;
  mode?: string;
  cwd?: string;
}

export interface AgentCreatePayload {
  id: string;
  name?: string;
  model?: string;
  modelRaw?: AgentJsonObject | null;
  workspace?: string;
  enabled?: boolean;
  sandboxMode?: string;
  workspaceAccess?: string;
  toolsProfile?: string;
  fsWorkspaceOnly?: boolean;
  thinkingDefault?: string;
  verboseDefault?: string;
  reasoningDefault?: string;
  fastModeDefault?: string;
  systemPromptOverride?: string;
  skills?: string[];
  sandboxRaw?: AgentJsonObject | null;
  toolsRaw?: AgentJsonObject | null;
  memorySearch?: AgentJsonObject | null;
  humanDelay?: AgentJsonObject | null;
  heartbeat?: AgentJsonObject | null;
  groupChat?: AgentJsonObject | null;
  subagents?: AgentJsonObject | null;
  params?: AgentJsonObject | null;
  runtime?: AgentRuntimeInput;
  identity?: AgentIdentityInput;
}

export interface AgentUpdatePayload {
  name?: string;
  model?: string;
  modelRaw?: AgentJsonObject | null;
  workspace?: string;
  enabled?: boolean;
  sandboxMode?: string;
  workspaceAccess?: string;
  toolsProfile?: string;
  fsWorkspaceOnly?: boolean;
  thinkingDefault?: string;
  verboseDefault?: string;
  reasoningDefault?: string;
  fastModeDefault?: string;
  systemPromptOverride?: string;
  skills?: string[];
  sandboxRaw?: AgentJsonObject | null;
  toolsRaw?: AgentJsonObject | null;
  memorySearch?: AgentJsonObject | null;
  humanDelay?: AgentJsonObject | null;
  heartbeat?: AgentJsonObject | null;
  groupChat?: AgentJsonObject | null;
  subagents?: AgentJsonObject | null;
  params?: AgentJsonObject | null;
  runtime?: AgentRuntimeInput;
  identity?: AgentIdentityInput;
}

export interface AgentDeletePayload {
  deleteWorkspace?: boolean;
  deleteAgentDir?: boolean;
}

export interface AgentDeletionResult {
  id: string;
  kind: "workspace" | "agentDir" | "agentRoot" | "stateDir";
  path: string;
  deleted: boolean;
  reason?: string;
}

export interface AgentsMutationResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  agent?: AgentSummary;
  detail?: AgentDetailPayload;
  deletion?: {
    options: Required<AgentDeletePayload>;
    results: AgentDeletionResult[];
  };
}

export interface AgentDocumentSavePayload {
  content: string;
}

export interface AgentDocumentSaveResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  doc: AgentDocumentSummary;
}

export interface AgentBindingMutationResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  detail?: AgentDetailPayload;
}

export interface AgentSessionMutationResponse {
  checkedAt: string;
  success: boolean;
  message: string;
  detail?: AgentDetailPayload;
}
