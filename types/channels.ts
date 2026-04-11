export type ChannelFieldInputType = 'text' | 'textarea' | 'number' | 'boolean' | 'stringList' | 'select';
export type ChannelFieldGroupId = 'credentials' | 'connection' | 'files' | 'identity' | 'behavior' | 'media';
export type ChannelFieldSemanticType = 'url' | 'file' | 'directory' | 'path';

export interface ChannelFieldOption {
  value: string;
  label: string;
}

export interface ChannelFieldDescriptor {
  key: string;
  label: string;
  input: ChannelFieldInputType;
  group?: ChannelFieldGroupId;
  semantic?: ChannelFieldSemanticType;
  placeholder?: string;
  helpText?: string;
  options?: ChannelFieldOption[];
  secret?: boolean;
  legacyKeys?: string[];
}

export interface ChannelCatalogEntry {
  type: string;
  label: string;
  icon: string;
  pairingSupported: boolean;
  supportsDefaultAccount: boolean;
  supportsNamedAccounts: boolean;
  defaultAccountConfigScope: 'channel' | 'account';
  supportsThreadBindings: boolean;
  channelSettings: string[];
  accountSettings: string[];
  credentialFields: ChannelFieldDescriptor[];
  accountFields: ChannelFieldDescriptor[];
}

export interface ChannelCredentialState {
  key: string;
  configured: boolean;
}

export interface ChannelThreadBindingSummary {
  enabled: boolean;
  idleHours: number;
  maxAgeHours: number;
  spawnSubagentSessions: boolean;
  spawnAcpSessions: boolean;
}

export interface ChannelAccountSummary {
  id: string;
  kind: 'default' | 'named';
  enabled: boolean;
  credentialStates: ChannelCredentialState[];
  fieldValues: Record<string, unknown>;
  dmPolicy: string | null;
  groupPolicy: string | null;
  contextVisibility: string | null;
  streaming: string | null;
  proxy: string | null;
  connectionMode: string | null;
  renderMode: string | null;
  domain: string | null;
  responsePrefix: string | null;
  configWrites: boolean | null;
  healthMonitor: boolean | null;
  dmConfig: Record<string, unknown> | null;
  groupsConfig: Record<string, unknown> | null;
  guildsConfig: Record<string, unknown> | null;
  execApprovalsConfig: Record<string, unknown> | null;
  allowFromCount: number;
  groupAllowFromCount: number;
  pairingPendingCount: number;
  settings: string[];
}

export interface ChannelSummary {
  type: string;
  enabled: boolean;
  accountCount: number;
  profileCount: number;
  bindingCount: number;
  defaultAccount: string | null;
  dmPolicy: string | null;
  groupPolicy: string | null;
  contextVisibility: string | null;
  streaming: string | null;
  proxy: string | null;
  connectionMode: string | null;
  renderMode: string | null;
  domain: string | null;
  responsePrefix: string | null;
  configWrites: boolean | null;
  healthMonitor: boolean | null;
  dmConfig: Record<string, unknown> | null;
  groupsConfig: Record<string, unknown> | null;
  guildsConfig: Record<string, unknown> | null;
  execApprovalsConfig: Record<string, unknown> | null;
  threadBindings: ChannelThreadBindingSummary | null;
  accounts: ChannelAccountSummary[];
}

export interface ChannelAgentOption {
  id: string;
  name: string;
  model: string;
  enabled: boolean;
}

export interface ChannelBindingMatchSummary {
  channel: string;
  accountId: string | null;
  peerKind: string | null;
  peerId: string | null;
  guildId: string | null;
  teamId: string | null;
  roles: string[];
}

export interface ChannelBindingSummary {
  id: string;
  ref: string;
  type: 'agent' | 'acp';
  channel: string;
  accountId: string | null;
  agentId: string;
  comment: string | null;
  match: ChannelBindingMatchSummary;
  acp: {
    mode: string | null;
    label: string | null;
    cwd: string | null;
    backend: string | null;
  } | null;
}

export interface ChannelPairingRequestSummary {
  code: string;
  requester: string | null;
  peerId: string | null;
  accountId: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  note: string | null;
}

export interface ChannelPairingPayload {
  checkedAt: string;
  channelType: string;
  accountId: string | null;
  supported: boolean;
  source: 'cli' | 'file';
  requests: ChannelPairingRequestSummary[];
  error: string | null;
}

export interface ChannelAccountAccessPayload {
  checkedAt: string;
  channelType: string;
  accountId: string;
  dmPolicy: string | null;
  groupPolicy: string | null;
  allowFrom: string[];
  groupAllowFrom: string[];
  pairing: ChannelPairingPayload;
}

export interface ChannelAccountCredentialsPayload {
  checkedAt: string;
  channelType: string;
  accountId: string;
  values: Record<string, string>;
}

export interface ChannelsSummaryPayload {
  checkedAt: string;
  counts: {
    channels: number;
    accounts: number;
    profiles: number;
    bindings: number;
    pairingPending: number;
  };
  catalog: ChannelCatalogEntry[];
  agents: ChannelAgentOption[];
  channels: ChannelSummary[];
  bindings: ChannelBindingSummary[];
}

export interface ChannelSettingsInput {
  enabled: boolean;
  defaultAccount?: string | null;
  dmPolicy?: string | null;
  groupPolicy?: string | null;
  contextVisibility?: string | null;
  streaming?: string | null;
  proxy?: string | null;
  connectionMode?: string | null;
  renderMode?: string | null;
  domain?: string | null;
  responsePrefix?: string | null;
  configWrites?: boolean | null;
  healthMonitor?: boolean | null;
  dm?: Record<string, unknown> | null;
  groups?: Record<string, unknown> | null;
  guilds?: Record<string, unknown> | null;
  execApprovals?: Record<string, unknown> | null;
  threadBindings?: ChannelThreadBindingSummary | null;
}

export interface ChannelAccountInput extends ChannelSettingsInput {
  id: string;
  fieldValues?: Record<string, unknown>;
  token?: string;
  appId?: string;
  appSecret?: string;
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  verificationToken?: string;
}

export interface ChannelBindingInput {
  type: 'agent' | 'acp';
  agentId: string;
  channel: string;
  accountId?: string | null;
  comment?: string | null;
  peerKind?: string | null;
  peerId?: string | null;
  guildId?: string | null;
  teamId?: string | null;
  roles?: string[];
  acpMode?: string | null;
  acpLabel?: string | null;
  acpCwd?: string | null;
  acpBackend?: string | null;
}

export interface ChannelAccessUpdatePayload {
  allowFrom: string[];
  groupAllowFrom: string[];
}

export interface ChannelPairingApprovePayload {
  accountId?: string | null;
  code: string;
  notify?: boolean;
}

export interface ChannelsMutationResponse {
  success: boolean;
  message: string;
  summary: ChannelsSummaryPayload;
}

export interface ChannelAccessMutationResponse {
  success: boolean;
  message: string;
  access: ChannelAccountAccessPayload;
}

export interface ChannelPairingApproveResponse {
  success: boolean;
  message: string;
  pairing: ChannelPairingPayload;
}
