import type {
  ChannelAccountInput,
  ChannelAccountSummary,
  ChannelCatalogEntry,
  ChannelFieldDescriptor,
  ChannelFieldGroupId,
  ChannelSettingsInput,
  ChannelSummary,
  ChannelThreadBindingSummary,
} from '../../../../../types/channels';

export type ChannelTextFn = (zh: string, en: string) => string;
export interface ChannelSelectOption {
  value: string;
  label: string;
}

export interface ChannelIssue {
  id: string;
  title: string;
  description: string;
  accountId?: string;
  action: 'account' | 'credentials' | 'access' | 'pairing';
  actionLabel: string;
}

export interface ChannelDraftState extends ChannelSettingsInput {
  configWritesMode: string;
  healthMonitorMode: string;
  dmJson: string;
  groupsJson: string;
  guildsJson: string;
  execApprovalsJson: string;
}

export interface AccountDraftState extends ChannelAccountInput {
  configWritesMode: string;
  healthMonitorMode: string;
  dmJson: string;
  groupsJson: string;
  guildsJson: string;
  execApprovalsJson: string;
  credentialValues: Record<string, string>;
}

export function titleCaseLabel(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

export function toBooleanSelectValue(value: boolean | null | undefined): string {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

export function fromBooleanSelectValue(value: string): boolean | null {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

export function stringifyOptionalJson(value: Record<string, unknown> | null | undefined): string {
  return value ? JSON.stringify(value, null, 2) : '';
}

function sortForStableJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForStableJson);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortForStableJson(nested)]),
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForStableJson(value));
}

export function parseOptionalJsonObject(label: string, raw: string, text: ChannelTextFn): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(text(`字段“${label}”不是合法 JSON`, `Field "${label}" is not valid JSON`));
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(text(`字段“${label}”必须是 JSON 对象`, `Field "${label}" must be a JSON object`));
  }

  return parsed as Record<string, unknown>;
}

export function buildDefaultThreadBindings(): ChannelThreadBindingSummary {
  return {
    enabled: false,
    idleHours: 24,
    maxAgeHours: 0,
    spawnSubagentSessions: false,
    spawnAcpSessions: false,
  };
}

export function createBlankChannelDraft(): ChannelDraftState {
  return {
    enabled: true,
    defaultAccount: '',
    dmPolicy: '',
    groupPolicy: '',
    contextVisibility: '',
    streaming: '',
    proxy: '',
    connectionMode: '',
    renderMode: '',
    domain: '',
    responsePrefix: '',
    configWritesMode: '',
    healthMonitorMode: '',
    dmJson: '',
    groupsJson: '',
    guildsJson: '',
    execApprovalsJson: '',
    threadBindings: buildDefaultThreadBindings(),
  };
}

export function createBlankAccountDraft(): AccountDraftState {
  return {
    id: '',
    enabled: true,
    fieldValues: {},
    dmPolicy: '',
    groupPolicy: '',
    contextVisibility: '',
    streaming: '',
    proxy: '',
    connectionMode: '',
    renderMode: '',
    domain: '',
    responsePrefix: '',
    configWritesMode: '',
    healthMonitorMode: '',
    dmJson: '',
    groupsJson: '',
    guildsJson: '',
    execApprovalsJson: '',
    credentialValues: {},
  };
}

export function normalizeDraftFieldValue(field: ChannelFieldDescriptor, value: unknown): string | number {
  if (field.input === 'boolean') return toBooleanSelectValue(value as boolean | null | undefined);
  if (field.input === 'number') return typeof value === 'number' ? value : '';
  if (field.input === 'stringList') {
    if (Array.isArray(value)) return value.join('\n');
    return typeof value === 'string' ? value : '';
  }
  return typeof value === 'string' ? value : '';
}

export function resetDynamicAccountDraft(
  draft: AccountDraftState,
  catalog: ChannelCatalogEntry | null,
  account: ChannelAccountSummary | null = null,
): void {
  draft.credentialValues = {};
  draft.fieldValues = {};

  for (const field of catalog?.credentialFields || []) {
    draft.credentialValues[field.key] = '';
  }

  for (const field of catalog?.accountFields || []) {
    draft.fieldValues[field.key] = normalizeDraftFieldValue(field, account?.fieldValues?.[field.key]);
  }
}

export function buildDynamicFieldPayload(draft: AccountDraftState, catalog: ChannelCatalogEntry | null): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of catalog?.accountFields || []) {
    const rawValue = draft.fieldValues?.[field.key];
    if (field.input === 'boolean') {
      values[field.key] = fromBooleanSelectValue(String(rawValue ?? ''));
      continue;
    }
    values[field.key] = rawValue ?? '';
  }

  for (const field of catalog?.credentialFields || []) {
    values[field.key] = draft.credentialValues?.[field.key] ?? '';
  }

  return values;
}

export function assignChannelDraft(draft: ChannelDraftState, channel: ChannelSummary): void {
  draft.enabled = channel.enabled;
  draft.defaultAccount = channel.defaultAccount || '';
  draft.dmPolicy = channel.dmPolicy || '';
  draft.groupPolicy = channel.groupPolicy || '';
  draft.contextVisibility = channel.contextVisibility || '';
  draft.streaming = channel.streaming || '';
  draft.proxy = channel.proxy || '';
  draft.connectionMode = channel.connectionMode || '';
  draft.renderMode = channel.renderMode || '';
  draft.domain = channel.domain || '';
  draft.responsePrefix = channel.responsePrefix || '';
  draft.configWritesMode = toBooleanSelectValue(channel.configWrites);
  draft.healthMonitorMode = toBooleanSelectValue(channel.healthMonitor);
  draft.dmJson = stringifyOptionalJson(channel.dmConfig);
  draft.groupsJson = stringifyOptionalJson(channel.groupsConfig);
  draft.guildsJson = stringifyOptionalJson(channel.guildsConfig);
  draft.execApprovalsJson = stringifyOptionalJson(channel.execApprovalsConfig);
  draft.threadBindings = channel.threadBindings
    ? {
      enabled: channel.threadBindings.enabled,
      idleHours: channel.threadBindings.idleHours,
      maxAgeHours: channel.threadBindings.maxAgeHours,
      spawnSubagentSessions: channel.threadBindings.spawnSubagentSessions,
      spawnAcpSessions: channel.threadBindings.spawnAcpSessions,
    }
    : buildDefaultThreadBindings();
}

export function assignAccountDraft(
  draft: AccountDraftState,
  account: ChannelAccountSummary,
  catalog: ChannelCatalogEntry | null,
): void {
  draft.id = account.id;
  draft.enabled = account.enabled;
  draft.dmPolicy = account.dmPolicy || '';
  draft.groupPolicy = account.groupPolicy || '';
  draft.contextVisibility = account.contextVisibility || '';
  draft.streaming = account.streaming || '';
  draft.proxy = account.proxy || '';
  draft.connectionMode = account.connectionMode || '';
  draft.renderMode = account.renderMode || '';
  draft.domain = account.domain || '';
  draft.responsePrefix = account.responsePrefix || '';
  draft.configWritesMode = toBooleanSelectValue(account.configWrites);
  draft.healthMonitorMode = toBooleanSelectValue(account.healthMonitor);
  draft.dmJson = stringifyOptionalJson(account.dmConfig);
  draft.groupsJson = stringifyOptionalJson(account.groupsConfig);
  draft.guildsJson = stringifyOptionalJson(account.guildsConfig);
  draft.execApprovalsJson = stringifyOptionalJson(account.execApprovalsConfig);
  resetDynamicAccountDraft(draft, catalog, account);
}

export function buildDmPolicyOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('继承默认值', 'Inherit default') },
    { value: 'pairing', label: text('配对批准', 'Pairing approval') },
    { value: 'allowlist', label: text('白名单', 'Allowlist') },
    { value: 'open', label: text('完全开放', 'Open') },
    { value: 'disabled', label: text('禁用私聊', 'Disabled') },
  ];
}

export function buildGroupPolicyOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('继承默认值', 'Inherit default') },
    { value: 'allowlist', label: text('白名单群组', 'Allowlist') },
    { value: 'open', label: text('开放群组', 'Open') },
    { value: 'disabled', label: text('禁用群组', 'Disabled') },
  ];
}

export function buildContextVisibilityOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('继承默认值', 'Inherit default') },
    { value: 'all', label: text('全部上下文', 'All context') },
    { value: 'allowlist', label: text('仅白名单上下文', 'Allowlist context') },
    { value: 'allowlist_quote', label: text('白名单 + 引用', 'Allowlist + quoted') },
  ];
}

export function buildStreamingOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('继承默认值', 'Inherit default') },
    { value: 'off', label: text('关闭', 'Off') },
    { value: 'partial', label: text('分段流式', 'Partial') },
    { value: 'block', label: text('块级流式', 'Block') },
    { value: 'progress', label: text('进度流式', 'Progress') },
  ];
}

export function buildBooleanInheritOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('继承默认值', 'Inherit default') },
    { value: 'true', label: text('启用', 'Enabled') },
    { value: 'false', label: text('禁用', 'Disabled') },
  ];
}

export function buildConnectionModeOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('未指定', 'Unset') },
    { value: 'websocket', label: 'WebSocket' },
    { value: 'webhook', label: 'Webhook' },
  ];
}

export function buildRenderModeOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('未指定', 'Unset') },
    { value: 'card', label: text('富文本块', 'Rich block') },
    { value: 'text', label: text('纯文本', 'Text') },
    { value: 'markdown', label: 'Markdown' },
    { value: 'interactive', label: text('交互式', 'Interactive') },
  ];
}

export function buildBindingTypeOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: 'agent', label: text('普通 Agent 绑定', 'Standard agent binding') },
    { value: 'acp', label: text('ACP 持久绑定', 'ACP binding') },
  ];
}

export function buildPeerKindOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: '', label: text('未指定', 'Unset') },
    { value: 'dm', label: 'DM' },
    { value: 'direct', label: text('Direct', 'Direct') },
    { value: 'group', label: text('群组', 'Group') },
    { value: 'channel', label: text('频道', 'Channel') },
    { value: 'thread', label: text('线程', 'Thread') },
    { value: 'topic', label: text('话题', 'Topic') },
  ];
}

export function buildAcpModeOptions(text: ChannelTextFn): ChannelSelectOption[] {
  return [
    { value: 'persistent', label: text('持久会话', 'Persistent') },
    { value: 'ephemeral', label: text('临时会话', 'Ephemeral') },
  ];
}

export function accountFieldPlaceholder(field: ChannelFieldDescriptor, text: ChannelTextFn): string {
  if (field.placeholder) return field.placeholder;
  if (field.semantic === 'url') {
    const example = field.key.toLowerCase().startsWith('ws') ? 'wss://example.com' : 'https://example.com';
    return text(`填写 ${field.label}，例如 ${example}`, `Enter ${field.label}, for example ${example}`);
  }
  if (field.semantic === 'file') return text(`填写 ${field.label} 文件路径`, `Enter the file path for ${field.label}`);
  if (field.semantic === 'directory') return text(`填写 ${field.label} 目录路径`, `Enter the directory path for ${field.label}`);
  if (field.semantic === 'path') return text(`填写 ${field.label} 路径`, `Enter the path for ${field.label}`);
  if (field.input === 'select') return text(`选择 ${field.label}`, `Select ${field.label}`);
  if (field.input === 'stringList') return text(`填写 ${field.label}，每行一项`, `Enter ${field.label}, one item per line`);
  return text(`填写 ${field.label}，留空则不写入`, `Enter ${field.label} and leave blank to omit it`);
}

export function accountFieldOptions(field: ChannelFieldDescriptor): ChannelSelectOption[] {
  return field.options?.map((option) => ({ value: option.value, label: option.label })) || [];
}

export function accountFieldInputType(field: ChannelFieldDescriptor): 'text' | 'url' {
  return field.semantic === 'url' ? 'url' : 'text';
}

export function accountFieldGroupLabel(groupId: ChannelFieldGroupId | '', text: ChannelTextFn): string {
  switch (groupId) {
    case 'connection':
      return text('连接与接入', 'Connection and Transport');
    case 'identity':
      return text('身份与目标', 'Identity and Targeting');
    case 'files':
      return text('文件与路径', 'Files and Paths');
    case 'media':
      return text('媒体能力', 'Media Capabilities');
    case 'behavior':
      return text('行为与策略', 'Behavior and Policy');
    case 'credentials':
      return text('凭据', 'Credentials');
    default:
      return text('其它字段', 'Other Fields');
  }
}

export function policyLabel(value: string | null | undefined, scope: 'dm' | 'group', text: ChannelTextFn): string {
  const normalized = value?.trim() || '';
  if (!normalized) return text('未指定', 'Unset');
  const dmMap: Record<string, [string, string]> = {
    pairing: ['配对批准', 'Pairing'],
    allowlist: ['白名单', 'Allowlist'],
    open: ['开放', 'Open'],
    disabled: ['禁用', 'Disabled'],
  };
  const groupMap: Record<string, [string, string]> = {
    allowlist: ['白名单', 'Allowlist'],
    open: ['开放', 'Open'],
    disabled: ['禁用', 'Disabled'],
  };
  const pair = (scope === 'dm' ? dmMap : groupMap)[normalized];
  return pair ? text(pair[0], pair[1]) : normalized;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function configuredCredentialLabels(
  account: ChannelAccountSummary,
  labelFor: (key: string) => string,
): string[] {
  return account.credentialStates.filter((credential) => credential.configured).map((credential) => labelFor(credential.key));
}

export function buildAccountMutationInput(
  account: ChannelAccountSummary,
  overrides: Partial<ChannelAccountInput> = {},
): ChannelAccountInput {
  const { fieldValues: overrideFieldValues, ...restOverrides } = overrides;

  const nextFieldValues = overrideFieldValues
    ? {
      ...account.fieldValues,
      ...overrideFieldValues,
    }
    : {
      ...account.fieldValues,
    };

  return {
    id: account.id,
    enabled: account.enabled,
    dmPolicy: account.dmPolicy || '',
    groupPolicy: account.groupPolicy || '',
    contextVisibility: account.contextVisibility || '',
    streaming: account.streaming || '',
    proxy: account.proxy || '',
    connectionMode: account.connectionMode || '',
    renderMode: account.renderMode || '',
    domain: account.domain || '',
    responsePrefix: account.responsePrefix || '',
    configWrites: account.configWrites,
    healthMonitor: account.healthMonitor,
    dm: account.dmConfig || null,
    groups: account.groupsConfig || null,
    guilds: account.guildsConfig || null,
    execApprovals: account.execApprovalsConfig || null,
    fieldValues: nextFieldValues,
    ...restOverrides,
  };
}

export function buildChannelIssues(channel: ChannelSummary | null, text: ChannelTextFn): ChannelIssue[] {
  if (!channel) return [];
  const issues: ChannelIssue[] = [];

  for (const account of channel.accounts) {
    const configuredCredentialCount = account.credentialStates.filter((credential) => credential.configured).length;
    if (configuredCredentialCount === 0) {
      issues.push({
        id: `${account.id}:credentials`,
        accountId: account.id,
        title: text('账号缺少凭据', 'Account has no credentials'),
        description: text(`账号 ${account.id} 还没有配置任何凭据。`, `Account ${account.id} does not have any configured credentials yet.`),
        action: 'credentials',
        actionLabel: text('配置凭据', 'Configure credentials'),
      });
    }
    if (account.dmPolicy === 'allowlist' && account.allowFromCount === 0) {
      issues.push({
        id: `${account.id}:allowFrom`,
        accountId: account.id,
        title: text('私聊白名单为空', 'DM allowlist is empty'),
        description: text(`账号 ${account.id} 使用白名单私聊策略，但目前没有允许对象。`, `Account ${account.id} uses allowlist DM policy but has no allowed peers.`),
        action: 'access',
        actionLabel: text('管理权限', 'Manage access'),
      });
    }
    if (account.groupPolicy === 'allowlist' && account.groupAllowFromCount === 0) {
      issues.push({
        id: `${account.id}:groupAllowFrom`,
        accountId: account.id,
        title: text('群组白名单为空', 'Group allowlist is empty'),
        description: text(`账号 ${account.id} 使用群组白名单策略，但目前没有允许对象。`, `Account ${account.id} uses group allowlist policy but has no allowed groups yet.`),
        action: 'access',
        actionLabel: text('管理权限', 'Manage access'),
      });
    }
    if (account.pairingPendingCount > 0) {
      issues.push({
        id: `${account.id}:pairing`,
        accountId: account.id,
        title: text('存在待审批配对请求', 'Pending pairing requests'),
        description: text(`账号 ${account.id} 当前有 ${account.pairingPendingCount} 条待审批配对请求。`, `Account ${account.id} currently has ${account.pairingPendingCount} pending pairing requests.`),
        action: 'pairing',
        actionLabel: text('处理配对', 'Review pairing'),
      });
    }
  }

  return issues;
}
