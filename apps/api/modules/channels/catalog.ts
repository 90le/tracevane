import fs from 'node:fs';
import path from 'node:path';
import type {
  ChannelCatalogEntry,
  ChannelFieldDescriptor,
  ChannelFieldGroupId,
  ChannelFieldOption,
  ChannelFieldSemanticType,
} from '../../../../types/channels.js';

const DEFAULT_CHANNEL_SETTINGS = [
  'defaultAccount',
  'dmPolicy',
  'groupPolicy',
  'contextVisibility',
  'streaming',
  'proxy',
  'responsePrefix',
  'configWrites',
  'healthMonitor',
];

const DEFAULT_ACCOUNT_SETTINGS = [
  'enabled',
  'dmPolicy',
  'groupPolicy',
  'contextVisibility',
  'streaming',
  'proxy',
  'responsePrefix',
  'configWrites',
  'healthMonitor',
];

const FEISHU_CHANNEL_SETTINGS = [
  'defaultAccount',
  'dmPolicy',
  'groupPolicy',
  'contextVisibility',
  'streaming',
  'connectionMode',
  'renderMode',
  'domain',
  'responsePrefix',
  'configWrites',
  'healthMonitor',
];

const FEISHU_ACCOUNT_SETTINGS = [
  'enabled',
  'dmPolicy',
  'groupPolicy',
  'contextVisibility',
  'streaming',
  'connectionMode',
  'renderMode',
  'domain',
  'responsePrefix',
  'configWrites',
  'healthMonitor',
];

function deriveFieldGroup(key: string, overrides: Partial<ChannelFieldDescriptor> = {}): ChannelFieldGroupId {
  if (overrides.group) return overrides.group;
  if (overrides.secret) return 'credentials';

  const normalizedKey = key.trim().toLowerCase();

  const connectionKeys = new Set([
    'apiurl',
    'baseurl',
    'cdnurl',
    'homeserver',
    'host',
    'port',
    'serverurl',
    'webhookpath',
    'websocketpath',
    'wsurl',
  ]);
  if (connectionKeys.has(normalizedKey)) return 'connection';
  if (
    normalizedKey.endsWith('url')
    || normalizedKey.endsWith('uri')
    || normalizedKey.endsWith('host')
    || normalizedKey.endsWith('port')
    || normalizedKey.endsWith('webhook')
    || normalizedKey.startsWith('webhook')
    || normalizedKey.includes('proxy')
    || normalizedKey.includes('relay')
    || normalizedKey.includes('homeserver')
    || normalizedKey.includes('server')
    || normalizedKey.includes('endpoint')
    || normalizedKey.includes('websocket')
    || normalizedKey.includes('heartbeat')
    || normalizedKey.includes('pollinterval')
    || normalizedKey === 'tls'
  ) {
    return 'connection';
  }

  if (
    normalizedKey.endsWith('file')
    || normalizedKey.endsWith('dir')
    || normalizedKey.endsWith('filepath')
    || normalizedKey.endsWith('directory')
  ) {
    return 'files';
  }

  if (
    normalizedKey.includes('voice')
    || normalizedKey.includes('audio')
    || normalizedKey.includes('media')
    || normalizedKey.includes('stt')
    || normalizedKey.includes('tts')
    || normalizedKey.includes('uploadformat')
  ) {
    return 'media';
  }

  const identityKeys = new Set([
    'account',
    'appid',
    'audience',
    'audiencetype',
    'botuid',
    'channel',
    'channels',
    'clientid',
    'defaultto',
    'deviceid',
    'devicename',
    'domain',
    'nick',
    'profile',
    'realname',
    'userid',
    'username',
  ]);
  if (identityKeys.has(normalizedKey)) return 'identity';
  if (
    normalizedKey.endsWith('id')
    || normalizedKey.endsWith('name')
    || normalizedKey.endsWith('uid')
    || normalizedKey.includes('account')
    || normalizedKey.includes('tenant')
    || normalizedKey.includes('profile')
  ) {
    return 'identity';
  }

  return 'behavior';
}

function deriveFieldSemantic(
  key: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldSemanticType | undefined {
  if (overrides.semantic) return overrides.semantic;

  const normalizedKey = key.trim().toLowerCase();
  if (normalizedKey.endsWith('file') || normalizedKey.endsWith('filename')) {
    return 'file';
  }
  if (normalizedKey.endsWith('dir') || normalizedKey.endsWith('directory')) {
    return 'directory';
  }
  if (normalizedKey.endsWith('path') || normalizedKey === 'clipath') {
    return 'path';
  }
  if (normalizedKey.endsWith('url') || normalizedKey.endsWith('uri') || normalizedKey === 'proxy') {
    return 'url';
  }
  return undefined;
}

function withFieldGroup(
  key: string,
  field: ChannelFieldDescriptor,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  const group = field.group ?? deriveFieldGroup(key, { ...overrides, secret: field.secret ?? overrides.secret });
  const semantic = field.semantic ?? deriveFieldSemantic(key, overrides);
  if (group === field.group && semantic === field.semantic) return field;
  return {
    ...field,
    group,
    semantic,
  };
}

function textField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'text',
    ...overrides,
  }, overrides);
}

function textareaField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'textarea',
    ...overrides,
  }, overrides);
}

function secretField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: overrides.input ?? 'text',
    secret: true,
    ...overrides,
  }, overrides);
}

function numberField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'number',
    ...overrides,
  }, overrides);
}

function booleanField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'boolean',
    ...overrides,
  }, overrides);
}

function stringListField(
  key: string,
  label: string,
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'stringList',
    ...overrides,
  }, overrides);
}

function selectField(
  key: string,
  label: string,
  options: ChannelFieldOption[],
  overrides: Partial<ChannelFieldDescriptor> = {}
): ChannelFieldDescriptor {
  return withFieldGroup(key, {
    key,
    label,
    input: 'select',
    options,
    ...overrides,
  }, overrides);
}

const ALLOW_BOTS_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'false', label: 'Disabled' },
  { value: 'true', label: 'Enabled' },
  { value: 'mentions', label: 'Mentions only' },
];

const REPLY_TO_MODE_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'off', label: 'Off' },
  { value: 'first', label: 'First reply' },
  { value: 'all', label: 'All replies' },
  { value: 'batched', label: 'Batched replies' },
];

const STATUS_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'online', label: 'Online' },
  { value: 'dnd', label: 'Do Not Disturb' },
  { value: 'idle', label: 'Idle' },
  { value: 'invisible', label: 'Invisible' },
];

const ACK_REACTION_SCOPE_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'group-mentions', label: 'Group mentions' },
  { value: 'group-all', label: 'Group all' },
  { value: 'direct', label: 'Direct' },
  { value: 'all', label: 'All' },
  { value: 'off', label: 'Off' },
  { value: 'none', label: 'None' },
];

const REACTION_LEVEL_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'off', label: 'Off' },
  { value: 'ack', label: 'Ack' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'extensive', label: 'Extensive' },
];

const CHUNK_MODE_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'length', label: 'Length' },
  { value: 'newline', label: 'Newline' },
];

const ACK_REACTION_GROUP_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'always', label: 'Always' },
  { value: 'mentions', label: 'Mentions only' },
  { value: 'never', label: 'Never' },
];

const MARKDOWN_TABLE_MODE_OPTIONS: ChannelFieldOption[] = [
  { value: '', label: 'Unset' },
  { value: 'off', label: 'Off' },
  { value: 'bullets', label: 'Bullets' },
  { value: 'code', label: 'Code' },
  { value: 'block', label: 'Block' },
];

function makeCatalogEntry(
  type: string,
  label: string,
  overrides: Partial<ChannelCatalogEntry> = {}
): ChannelCatalogEntry {
  return {
    type,
    label,
    icon: overrides.icon ?? '◈',
    pairingSupported: overrides.pairingSupported === true,
    supportsDefaultAccount: overrides.supportsDefaultAccount !== false,
    supportsNamedAccounts: overrides.supportsNamedAccounts !== false,
    defaultAccountConfigScope: overrides.defaultAccountConfigScope ?? 'channel',
    supportsThreadBindings: overrides.supportsThreadBindings === true,
    channelSettings: overrides.channelSettings ?? DEFAULT_CHANNEL_SETTINGS,
    accountSettings: overrides.accountSettings ?? DEFAULT_ACCOUNT_SETTINGS,
    credentialFields: overrides.credentialFields ?? [],
    accountFields: overrides.accountFields ?? [],
  };
}

function titleCaseChannelType(channelType: string): string {
  return channelType
    .split(/[-_:/]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function titleCaseFieldKey(fieldKey: string): string {
  return fieldKey
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizePlaceholderValue(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value) && value.every((entry) => typeof entry === 'string' || typeof entry === 'number')) {
    return value.map((entry) => String(entry)).join('\n');
  }
  return undefined;
}

function deriveFieldOptions(schema: Record<string, any>): ChannelFieldOption[] | undefined {
  if (schema.type !== 'string' || !Array.isArray(schema.enum) || !schema.enum.every((entry) => typeof entry === 'string')) {
    return undefined;
  }

  const labels =
    Array.isArray(schema.enumNames) && schema.enumNames.length === schema.enum.length
      ? schema.enumNames
      : Array.isArray(schema['x-enumLabels']) && schema['x-enumLabels'].length === schema.enum.length
        ? schema['x-enumLabels']
        : null;

  return schema.enum.map((value: string, index: number) => ({
    value,
    label:
      typeof labels?.[index] === 'string' && labels[index].trim()
        ? labels[index].trim()
        : titleCaseFieldKey(value),
  }));
}

function deriveFieldDescriptorMetadata(
  key: string,
  schema: Record<string, any>,
  rootSchema: Record<string, any>
): Pick<ChannelFieldDescriptor, 'label' | 'placeholder' | 'helpText' | 'options'> {
  const normalizedSchema = normalizeSchema(schema, rootSchema) ?? schema;
  return {
    label: firstNonEmptyString(normalizedSchema.title) || titleCaseFieldKey(key),
    placeholder:
      firstNonEmptyString(normalizedSchema.placeholder, normalizedSchema['x-tracevane-placeholder'])
      || normalizePlaceholderValue(Array.isArray(normalizedSchema.examples) ? normalizedSchema.examples[0] : undefined)
      || normalizePlaceholderValue(normalizedSchema.default),
    helpText: firstNonEmptyString(normalizedSchema.description, normalizedSchema.markdownDescription),
    options: deriveFieldOptions(normalizedSchema),
  };
}

const STATIC_CHANNEL_CATALOG: Record<string, ChannelCatalogEntry> = {
  bluebubbles: makeCatalogEntry('bluebubbles', 'BlueBubbles', {
    icon: '🫧',
    credentialFields: [secretField('password', 'Password')],
    accountFields: [
      textField('serverUrl', 'Server URL', { legacyKeys: ['httpUrl'] }),
      textField('webhookPath', 'Webhook Path'),
    ],
  }),
  discord: makeCatalogEntry('discord', 'Discord', {
    icon: '◎',
    pairingSupported: true,
    supportsThreadBindings: true,
    channelSettings: [...DEFAULT_CHANNEL_SETTINGS, 'threadBindings'],
    credentialFields: [
      secretField('token', 'Bot Token'),
      secretField('pluralkit.token', 'PluralKit Token'),
    ],
    accountFields: [
      selectField('allowBots', 'Allow Bot Authored Messages', ALLOW_BOTS_OPTIONS),
      selectField('replyToMode', 'Reply To Mode', REPLY_TO_MODE_OPTIONS),
      numberField('textChunkLimit', 'Text Chunk Limit'),
      numberField('maxLinesPerMessage', 'Max Lines Per Message'),
      numberField('mediaMaxMb', 'Media Max MB'),
      numberField('historyLimit', 'History Limit'),
      numberField('dmHistoryLimit', 'DM History Limit'),
      textField('activity', 'Activity'),
      selectField('status', 'Status', STATUS_OPTIONS),
      numberField('activityType', 'Activity Type'),
      textField('activityUrl', 'Activity URL', { semantic: 'url' }),
      textField('ackReaction', 'Ack Reaction Emoji'),
      selectField('ackReactionScope', 'Ack Reaction Scope', ACK_REACTION_SCOPE_OPTIONS),
      selectField('markdown.tables', 'Markdown Tables', MARKDOWN_TABLE_MODE_OPTIONS),
      numberField('retry.attempts', 'Retry Attempts'),
      numberField('retry.minDelayMs', 'Retry Min Delay (ms)'),
      numberField('retry.maxDelayMs', 'Retry Max Delay (ms)'),
      numberField('retry.jitter', 'Retry Jitter'),
      booleanField('actions.reactions', 'Enable Reactions'),
      booleanField('actions.stickers', 'Enable Stickers'),
      booleanField('actions.polls', 'Enable Polls'),
      booleanField('actions.permissions', 'Enable Permissions'),
      booleanField('actions.messages', 'Enable Messages'),
      booleanField('actions.threads', 'Enable Threads'),
      booleanField('actions.pins', 'Enable Pins'),
      booleanField('actions.search', 'Enable Search'),
      booleanField('actions.memberInfo', 'Enable Member Info'),
      booleanField('actions.roleInfo', 'Enable Role Info'),
      booleanField('actions.roles', 'Enable Roles'),
      booleanField('actions.channelInfo', 'Enable Channel Info'),
      booleanField('actions.voiceStatus', 'Enable Voice Status'),
      booleanField('actions.events', 'Enable Events'),
      booleanField('actions.moderation', 'Enable Moderation'),
      booleanField('actions.emojiUploads', 'Enable Emoji Uploads'),
      booleanField('actions.stickerUploads', 'Enable Sticker Uploads'),
      booleanField('actions.channels', 'Enable Channel Actions'),
      booleanField('actions.presence', 'Enable Presence Actions'),
      booleanField('intents.presence', 'Guild Presences Intent'),
      booleanField('intents.guildMembers', 'Guild Members Intent'),
      booleanField('agentComponents.enabled', 'Enable Agent Components'),
      textField('ui.components.accentColor', 'Component Accent Color'),
      booleanField('slashCommand.ephemeral', 'Ephemeral Slash Replies'),
      booleanField('voice.enabled', 'Enable Voice Conversations'),
      booleanField('voice.daveEncryption', 'Enable DAVE Encryption'),
      numberField('voice.decryptionFailureTolerance', 'DAVE Decryption Failure Tolerance'),
      booleanField('pluralkit.enabled', 'Enable PluralKit'),
      booleanField('autoPresence.enabled', 'Enable Auto Presence'),
      numberField('autoPresence.intervalMs', 'Auto Presence Interval (ms)'),
      numberField('autoPresence.minUpdateIntervalMs', 'Auto Presence Min Update Interval (ms)'),
      textField('autoPresence.healthyText', 'Auto Presence Healthy Text'),
      textField('autoPresence.degradedText', 'Auto Presence Degraded Text'),
      textField('autoPresence.exhaustedText', 'Auto Presence Exhausted Text'),
      numberField('inboundWorker.runTimeoutMs', 'Inbound Worker Run Timeout (ms)'),
      numberField('eventQueue.listenerTimeout', 'Event Queue Listener Timeout (ms)'),
      numberField('eventQueue.maxQueueSize', 'Event Queue Max Size'),
      numberField('eventQueue.maxConcurrency', 'Event Queue Max Concurrency'),
    ],
  }),
  dmwork: makeCatalogEntry('dmwork', 'DMWork', {
    icon: '◍',
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [
      textField('apiUrl', 'API URL'),
      textField('wsUrl', 'WebSocket URL'),
      textField('cdnUrl', 'CDN URL'),
      numberField('pollIntervalMs', 'Poll Interval (ms)'),
      numberField('heartbeatIntervalMs', 'Heartbeat Interval (ms)'),
      booleanField('requireMention', 'Require Mention'),
      textField('botUid', 'Bot UID'),
      numberField('historyLimit', 'History Limit'),
      textareaField('historyPromptTemplate', 'History Prompt Template'),
    ],
  }),
  octo: makeCatalogEntry('octo', 'Octo', {
    icon: '●',
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [
      textField('apiUrl', 'API URL'),
      textField('wsUrl', 'WebSocket URL'),
      textField('cdnUrl', 'CDN URL'),
      numberField('pollIntervalMs', 'Poll Interval (ms)'),
      numberField('heartbeatIntervalMs', 'Heartbeat Interval (ms)'),
      booleanField('requireMention', 'Require Mention'),
      booleanField('ignoreMentionAll', 'Ignore Mention All'),
      textField('botUid', 'Bot UID'),
      numberField('historyLimit', 'History Limit'),
      textareaField('historyPromptTemplate', 'History Prompt Template'),
    ],
  }),
  feishu: makeCatalogEntry('feishu', 'Feishu', {
    icon: '◉',
    pairingSupported: true,
    channelSettings: FEISHU_CHANNEL_SETTINGS,
    accountSettings: FEISHU_ACCOUNT_SETTINGS,
    credentialFields: [
      textField('appId', 'App ID'),
      secretField('appSecret', 'App Secret'),
      secretField('encryptKey', 'Encrypt Key'),
      secretField('verificationToken', 'Verification Token'),
    ],
    accountFields: [textField('domain', 'Tenant Domain')],
  }),
  googlechat: makeCatalogEntry('googlechat', 'Google Chat', {
    icon: '💬',
    credentialFields: [
      secretField('serviceAccount', 'Service Account JSON', { input: 'textarea' }),
    ],
    accountFields: [
      textField('serviceAccountFile', 'Service Account File'),
      textField('audienceType', 'Audience Type'),
      textField('audience', 'Audience'),
      textField('webhookPath', 'Webhook Path'),
    ],
  }),
  imessage: makeCatalogEntry('imessage', 'iMessage', {
    icon: '✉',
    accountFields: [textField('cliPath', 'CLI Path')],
  }),
  irc: makeCatalogEntry('irc', 'IRC', {
    icon: '#',
    credentialFields: [secretField('password', 'Server Password', { legacyKeys: ['token'] })],
    accountFields: [
      textField('host', 'Host', { legacyKeys: ['httpHost'] }),
      numberField('port', 'Port', { legacyKeys: ['httpPort'] }),
      booleanField('tls', 'Use TLS'),
      textField('nick', 'Nick', { legacyKeys: ['userId'] }),
      textField('username', 'Username'),
      textField('realname', 'Real Name', { legacyKeys: ['deviceName'] }),
      stringListField('channels', 'Channels', { legacyKeys: ['groupChannels'] }),
      textField('passwordFile', 'Password File'),
    ],
  }),
  line: makeCatalogEntry('line', 'LINE', {
    icon: '☘',
    credentialFields: [
      secretField('channelAccessToken', 'Channel Access Token'),
      secretField('channelSecret', 'Channel Secret'),
    ],
    accountFields: [
      textField('tokenFile', 'Token File'),
      textField('secretFile', 'Secret File'),
    ],
  }),
  matrix: makeCatalogEntry('matrix', 'Matrix', {
    icon: '⬢',
    defaultAccountConfigScope: 'account',
    credentialFields: [
      secretField('accessToken', 'Access Token'),
      secretField('password', 'Password'),
    ],
    accountFields: [
      textField('homeserver', 'Homeserver'),
      textField('userId', 'User ID'),
      textField('deviceId', 'Device ID'),
      textField('deviceName', 'Device Name'),
      booleanField('encryption', 'Encryption'),
    ],
  }),
  mattermost: makeCatalogEntry('mattermost', 'Mattermost', {
    icon: '☰',
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [textField('baseUrl', 'Base URL')],
  }),
  msteams: makeCatalogEntry('msteams', 'Microsoft Teams', {
    icon: '⊞',
    supportsNamedAccounts: false,
    credentialFields: [
      textField('appId', 'App ID'),
      secretField('appPassword', 'App Password'),
      secretField('tenantId', 'Tenant ID'),
    ],
  }),
  'nextcloud-talk': makeCatalogEntry('nextcloud-talk', 'Nextcloud Talk', {
    icon: '☁',
    credentialFields: [
      secretField('botSecret', 'Bot Secret', { legacyKeys: ['token'] }),
      secretField('apiPassword', 'API Password', { legacyKeys: ['password'] }),
    ],
    accountFields: [
      textField('baseUrl', 'Base URL', { legacyKeys: ['httpUrl'] }),
      textField('apiUser', 'API User', { legacyKeys: ['userId'] }),
      textField('botSecretFile', 'Bot Secret File'),
      textField('apiPasswordFile', 'API Password File'),
      textField('webhookPath', 'Webhook Path'),
    ],
  }),
  nostr: makeCatalogEntry('nostr', 'Nostr', {
    icon: '⚡',
    supportsNamedAccounts: false,
    credentialFields: [secretField('privateKey', 'Private Key')],
    accountFields: [stringListField('relays', 'Relay URLs', { legacyKeys: ['relayUrls'] })],
  }),
  'qa-channel': makeCatalogEntry('qa-channel', 'QA Channel', {
    icon: '🧪',
  }),
  qqbot: makeCatalogEntry('qqbot', 'QQ Bot', {
    icon: 'Q',
    credentialFields: [
      textField('appId', 'App ID'),
      secretField('clientSecret', 'Client Secret'),
    ],
    accountFields: [textField('clientSecretFile', 'Client Secret File')],
  }),
  signal: makeCatalogEntry('signal', 'Signal', {
    icon: '✳',
    accountFields: [
      textField('cliPath', 'CLI Path'),
      textField('account', 'Signal Account / Number', { legacyKeys: ['signalNumber'] }),
      textField('httpUrl', 'HTTP URL'),
      booleanField('sendReadReceipts', 'Send Read Receipts'),
      textField('defaultTo', 'Default Target'),
    ],
  }),
  slack: makeCatalogEntry('slack', 'Slack', {
    icon: '⌘',
    pairingSupported: true,
    credentialFields: [
      secretField('botToken', 'Bot Token'),
      secretField('appToken', 'App Token'),
    ],
  }),
  'synology-chat': makeCatalogEntry('synology-chat', 'Synology Chat', {
    icon: '◌',
    credentialFields: [secretField('token', 'Token')],
    accountFields: [
      textField('incomingUrl', 'Incoming Webhook URL', { legacyKeys: ['url'] }),
      textField('webhookPath', 'Webhook Path'),
      stringListField('allowedUserIds', 'Allowed User IDs'),
      booleanField('dangerouslyAllowInheritedWebhookPath', 'Allow Inherited Webhook Path'),
    ],
  }),
  telegram: makeCatalogEntry('telegram', 'Telegram', {
    icon: '✈',
    pairingSupported: true,
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [
      textField('tokenFile', 'Token File'),
      textField('webhookPath', 'Webhook Path'),
      textField('defaultTo', 'Default Target'),
    ],
  }),
  tlon: makeCatalogEntry('tlon', 'Tlon', {
    icon: '⊙',
    credentialFields: [secretField('code', 'Code')],
    accountFields: [
      textField('ship', 'Ship'),
      textField('url', 'URL'),
    ],
  }),
  twitch: makeCatalogEntry('twitch', 'Twitch', {
    icon: '☉',
    credentialFields: [
      secretField('accessToken', 'Access Token'),
      secretField('clientSecret', 'Client Secret'),
      secretField('refreshToken', 'Refresh Token'),
    ],
    accountFields: [
      textField('username', 'Username'),
      textField('clientId', 'Client ID'),
      textField('channel', 'Channel'),
    ],
  }),
  whatsapp: makeCatalogEntry('whatsapp', 'WhatsApp', {
    icon: '◌',
    pairingSupported: true,
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [
      textField('authDir', 'Auth Directory'),
      textField('messagePrefix', 'Message Prefix'),
      textField('responsePrefix', 'Response Prefix'),
      textField('defaultTo', 'Default Target'),
      booleanField('sendReadReceipts', 'Send Read Receipts'),
      booleanField('selfChatMode', 'Self Chat Mode'),
      numberField('historyLimit', 'History Limit'),
      numberField('dmHistoryLimit', 'DM History Limit'),
      numberField('textChunkLimit', 'Text Chunk Limit'),
      selectField('chunkMode', 'Chunk Mode', CHUNK_MODE_OPTIONS),
      booleanField('blockStreaming', 'Block Streaming'),
      numberField('blockStreamingCoalesce.minChars', 'Block Streaming Coalesce Min Chars'),
      numberField('blockStreamingCoalesce.maxChars', 'Block Streaming Coalesce Max Chars'),
      numberField('blockStreamingCoalesce.idleMs', 'Block Streaming Coalesce Idle (ms)'),
      textField('ackReaction.emoji', 'Ack Reaction Emoji'),
      booleanField('ackReaction.direct', 'Ack Reaction Direct'),
      selectField('ackReaction.group', 'Ack Reaction Group', ACK_REACTION_GROUP_OPTIONS),
      selectField('reactionLevel', 'Reaction Level', REACTION_LEVEL_OPTIONS),
      numberField('debounceMs', 'Debounce (ms)'),
      numberField('mediaMaxMb', 'Media Max MB'),
      booleanField('actions.reactions', 'Enable Reactions'),
      booleanField('actions.sendMessage', 'Enable Send Message'),
      booleanField('actions.polls', 'Enable Polls'),
      selectField('markdown.tables', 'Markdown Tables', MARKDOWN_TABLE_MODE_OPTIONS),
    ],
  }),
  zalo: makeCatalogEntry('zalo', 'Zalo', {
    icon: 'ⓩ',
    credentialFields: [secretField('botToken', 'Bot Token')],
    accountFields: [textField('tokenFile', 'Token File')],
  }),
  zalouser: makeCatalogEntry('zalouser', 'Zalo User', {
    icon: '⒵',
    accountFields: [
      textField('profile', 'Profile'),
      booleanField('dangerouslyAllowNameMatching', 'Allow Name Matching'),
      numberField('historyLimit', 'History Limit'),
      textField('messagePrefix', 'Message Prefix'),
    ],
  }),
};

function safeReadJson(filePath: string): Record<string, any> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Record<string, any>;
  } catch {
    return null;
  }
}

type DiscoveredChannelManifest = {
  channelType: string;
  manifest: Record<string, any> | null;
};

function discoverChannelManifestsInExtensionsRoot(
  extensionsRoot: string
): Map<string, DiscoveredChannelManifest> {
  const discovered = new Map<string, DiscoveredChannelManifest>();
  if (!fs.existsSync(extensionsRoot)) return discovered;

  for (const entry of fs.readdirSync(extensionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const extensionRoot = path.join(extensionsRoot, entry.name);

    const pluginManifest = safeReadJson(path.join(extensionRoot, 'openclaw.plugin.json'));
    if (Array.isArray(pluginManifest?.channels)) {
      for (const channelType of pluginManifest.channels) {
        if (typeof channelType === 'string' && channelType.trim()) {
          discovered.set(channelType.trim(), {
            channelType: channelType.trim(),
            manifest: pluginManifest,
          });
        }
      }
    }

    const packageJson = safeReadJson(path.join(extensionRoot, 'package.json'));
    const packageChannelId = packageJson?.openclaw?.channel?.id;
    if (typeof packageChannelId === 'string' && packageChannelId.trim()) {
      const normalizedType = packageChannelId.trim();
      if (!discovered.has(normalizedType)) {
        discovered.set(normalizedType, {
          channelType: normalizedType,
          manifest: pluginManifest,
        });
      }
    }
  }

  return discovered;
}

function discoverLocalChannelManifests(openclawRoot: string): Map<string, DiscoveredChannelManifest> {
  return discoverChannelManifestsInExtensionsRoot(path.join(openclawRoot, 'extensions'));
}

function compareVersionDirectoryNames(left: string, right: string): number {
  const leftParts = left.match(/\d+/g)?.map((part) => Number(part)) || [];
  const rightParts = right.match(/\d+/g)?.map((part) => Number(part)) || [];
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftPart = leftParts[index] ?? 0;
    const rightPart = rightParts[index] ?? 0;
    if (leftPart !== rightPart) return rightPart - leftPart;
  }

  return right.localeCompare(left);
}

function discoverOfficialChannelManifests(openclawRoot: string): Map<string, DiscoveredChannelManifest> {
  const projectsRoot = path.join(openclawRoot, 'projects', 'openclaw');
  const discovered = new Map<string, DiscoveredChannelManifest>();
  if (!fs.existsSync(projectsRoot)) return discovered;

  const projectVersions = fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort(compareVersionDirectoryNames);

  for (const projectVersion of projectVersions) {
    const versionDiscovered = discoverChannelManifestsInExtensionsRoot(
      path.join(projectsRoot, projectVersion, 'extensions')
    );
    for (const [channelType, manifest] of versionDiscovered.entries()) {
      if (!discovered.has(channelType)) {
        discovered.set(channelType, manifest);
      }
    }
  }

  return discovered;
}

function discoverInstalledOfficialChannelManifests(
  openclawRoot: string
): Map<string, DiscoveredChannelManifest> {
  const discovered = new Map<string, DiscoveredChannelManifest>();
  const candidatePackageRoots = [
    path.join(openclawRoot, 'node_modules', 'openclaw'),
    path.join(openclawRoot, '.npm-global', 'lib', 'node_modules', 'openclaw'),
    path.join(path.dirname(openclawRoot), '.npm-global', 'lib', 'node_modules', 'openclaw'),
    ...(process.env.NPM_CONFIG_PREFIX ? [path.join(process.env.NPM_CONFIG_PREFIX, 'lib', 'node_modules', 'openclaw')] : []),
    ...(process.env.npm_config_prefix ? [path.join(process.env.npm_config_prefix, 'lib', 'node_modules', 'openclaw')] : []),
    '/usr/local/lib/node_modules/openclaw',
    '/usr/lib/node_modules/openclaw',
  ];
  const candidateExtensionsRoots = new Set<string>();

  for (const packageRoot of candidatePackageRoots) {
    if (!packageRoot) continue;
    candidateExtensionsRoots.add(path.join(packageRoot, 'dist', 'extensions'));
    candidateExtensionsRoots.add(path.join(packageRoot, 'extensions'));
  }

  for (const extensionsRoot of candidateExtensionsRoots) {
    const rootDiscovered = discoverChannelManifestsInExtensionsRoot(extensionsRoot);
    for (const [channelType, manifest] of rootDiscovered.entries()) {
      if (!discovered.has(channelType)) {
        discovered.set(channelType, manifest);
      }
    }
  }

  return discovered;
}

const CHANNEL_FIELD_SKIP_KEYS = new Set([
  'name',
  'enabled',
  'accounts',
  'defaultAccount',
  'allowFrom',
  'groupAllowFrom',
  'dmPolicy',
  'groupPolicy',
  'contextVisibility',
  'streaming',
  'blockStreaming',
  'proxy',
  'responsePrefix',
  'configWrites',
  'healthMonitor',
  'threadBindings',
  'dm',
  'groups',
  'guilds',
  'execApprovals',
  'markdown',
]);

function isSecretSchema(schema: Record<string, any> | null | undefined): boolean {
  if (!schema || typeof schema !== 'object') return false;
  if (typeof schema.$ref === 'string' && /secret/i.test(schema.$ref)) return true;
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf.some((entry) => isSecretSchema(entry));
  }
  if (Array.isArray(schema.oneOf)) {
    return schema.oneOf.some((entry) => isSecretSchema(entry));
  }
  if (typeof schema.type === 'string' && /secret/i.test(schema.type)) return true;
  return false;
}

function resolveLocalSchemaRef(
  rootSchema: Record<string, any>,
  ref: string,
  seenRefs: Set<string> = new Set()
): Record<string, any> | null {
  if (!ref.startsWith('#/')) return null;
  if (seenRefs.has(ref)) return null;
  seenRefs.add(ref);

  let current: any = rootSchema;
  for (const segment of ref.slice(2).split('/')) {
    const normalizedSegment = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
    current = current[normalizedSegment];
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) return null;
  if (typeof current.$ref === 'string') {
    return normalizeSchema(current, rootSchema, seenRefs);
  }
  return current as Record<string, any>;
}

function normalizeSchema(
  schema: Record<string, any> | null | undefined,
  rootSchema: Record<string, any>,
  seenRefs: Set<string> = new Set()
): Record<string, any> | null {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null;
  if (typeof schema.$ref !== 'string') return schema;

  const resolved = resolveLocalSchemaRef(rootSchema, schema.$ref, seenRefs);
  if (!resolved) return schema;

  const { $ref: _ref, ...overrides } = schema;
  return Object.keys(overrides).length ? { ...resolved, ...overrides } : resolved;
}

function getSchemaProperties(
  schema: Record<string, any> | null | undefined,
  rootSchema: Record<string, any>
): Record<string, any> {
  const normalizedSchema = normalizeSchema(schema, rootSchema);
  const properties = normalizedSchema?.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  return properties as Record<string, any>;
}

function getAccountProperties(rootSchema: Record<string, any>): Record<string, any> {
  const topLevelProperties = getSchemaProperties(rootSchema, rootSchema);
  const accountsSchema = topLevelProperties.accounts;
  if (!accountsSchema || typeof accountsSchema !== 'object' || Array.isArray(accountsSchema)) {
    return {};
  }

  const normalizedAccountsSchema = normalizeSchema(accountsSchema as Record<string, any>, rootSchema);
  const additionalProperties = normalizedAccountsSchema?.additionalProperties;
  if (!additionalProperties || typeof additionalProperties !== 'object' || Array.isArray(additionalProperties)) {
    return {};
  }

  return getSchemaProperties(additionalProperties as Record<string, any>, rootSchema);
}

function inferFieldDescriptor(
  key: string,
  schema: Record<string, any>,
  rootSchema: Record<string, any>
): ChannelFieldDescriptor | null {
  const metadata = deriveFieldDescriptorMetadata(key, schema, rootSchema);
  if (isSecretSchema(schema)) {
    return secretField(key, metadata.label, metadata);
  }

  const normalizedSchema = normalizeSchema(schema, rootSchema) ?? schema;

  if (normalizedSchema.type === 'boolean') {
    return booleanField(key, metadata.label, metadata);
  }

  if (normalizedSchema.type === 'number' || normalizedSchema.type === 'integer') {
    return numberField(key, metadata.label, metadata);
  }

  if (normalizedSchema.type === 'array' && normalizedSchema.items?.type === 'string') {
    return stringListField(key, metadata.label, metadata);
  }

  if (normalizedSchema.type === 'string') {
    if (metadata.options?.length) {
      return withFieldGroup(key, {
        key,
        label: metadata.label,
        input: 'select',
        placeholder: metadata.placeholder,
        helpText: metadata.helpText,
        options: metadata.options,
      });
    }
    return textField(key, metadata.label, metadata);
  }

  return null;
}

function extractManifestFieldDescriptors(manifest: Record<string, any> | null): {
  credentialFields: ChannelFieldDescriptor[];
  accountFields: ChannelFieldDescriptor[];
  supportsNamedAccounts: boolean;
} {
  const configSchema =
    manifest?.configSchema && typeof manifest.configSchema === 'object' && !Array.isArray(manifest.configSchema)
      ? (manifest.configSchema as Record<string, any>)
      : null;
  if (!configSchema) {
    return {
      credentialFields: [],
      accountFields: [],
      supportsNamedAccounts: false,
    };
  }

  const credentialFields: ChannelFieldDescriptor[] = [];
  const accountFields: ChannelFieldDescriptor[] = [];
  const fieldCoverage = new Set<string>();
  const addField = (field: ChannelFieldDescriptor) => {
    const aliases = [field.key, ...(field.legacyKeys || [])].filter((alias) => Boolean(alias && alias.trim()));
    if (!aliases.length) return;
    if (aliases.some((alias) => fieldCoverage.has(alias))) return;
    for (const alias of aliases) fieldCoverage.add(alias);
    if (field.secret) {
      credentialFields.push(field);
      return;
    }
    accountFields.push(field);
  };

  const applyProperties = (properties: Record<string, any>) => {
    for (const [key, rawSchema] of Object.entries(properties)) {
      if (CHANNEL_FIELD_SKIP_KEYS.has(key)) continue;
      if (!rawSchema || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) continue;
      const descriptor = inferFieldDescriptor(key, rawSchema as Record<string, any>, configSchema);
      if (descriptor) addField(descriptor);
    }
  };

  applyProperties(getSchemaProperties(configSchema, configSchema));
  const accountProperties = getAccountProperties(configSchema);
  applyProperties(accountProperties);

  return {
    credentialFields,
    accountFields,
    supportsNamedAccounts: Object.keys(accountProperties).length > 0,
  };
}

function getFieldCoverage(fields: ChannelFieldDescriptor[]): Set<string> {
  const coverage = new Set<string>();
  for (const field of fields) {
    for (const alias of [field.key, ...(field.legacyKeys || [])]) {
      if (typeof alias === 'string' && alias.trim()) coverage.add(alias);
    }
  }
  return coverage;
}

function fieldAliases(field: ChannelFieldDescriptor): string[] {
  return [field.key, ...(field.legacyKeys || [])].filter((alias) => Boolean(alias && alias.trim()));
}

function toEnvToken(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toUpperCase();
}

function envVarMatchScore(envVar: string, alias: string): number {
  const normalizedEnvVar = envVar.trim().toUpperCase();
  const envToken = toEnvToken(alias);
  if (!normalizedEnvVar || !envToken) return -1;
  if (normalizedEnvVar === envToken || normalizedEnvVar.endsWith(`_${envToken}`)) {
    return envToken.length;
  }
  return -1;
}

function findMatchingField(
  targetField: ChannelFieldDescriptor,
  discoveredFields: ChannelFieldDescriptor[]
): ChannelFieldDescriptor | null {
  const aliases = new Set(fieldAliases(targetField));
  for (const discoveredField of discoveredFields) {
    if (fieldAliases(discoveredField).some((alias) => aliases.has(alias))) {
      return discoveredField;
    }
  }
  return null;
}

function enrichExistingField(
  field: ChannelFieldDescriptor,
  discoveredFields: ChannelFieldDescriptor[]
): ChannelFieldDescriptor {
  const matchingField = findMatchingField(field, discoveredFields);
  if (!matchingField) return field;

  const nextInput =
    field.input === 'text' && matchingField.input === 'select' && matchingField.options?.length
      ? 'select'
      : field.input;
  const nextOptions =
    field.options?.length
      ? field.options
      : nextInput === 'select'
        ? matchingField.options
        : undefined;
  const nextPlaceholder = field.placeholder ?? matchingField.placeholder;
  const nextHelpText = field.helpText ?? matchingField.helpText;
  const nextSemantic = field.semantic ?? matchingField.semantic;

  if (
    nextInput === field.input &&
    nextOptions === field.options &&
    nextPlaceholder === field.placeholder &&
    nextHelpText === field.helpText &&
    nextSemantic === field.semantic
  ) {
    return field;
  }

  return {
    ...field,
    input: nextInput,
    options: nextOptions,
    placeholder: nextPlaceholder,
    helpText: nextHelpText,
    semantic: nextSemantic,
  };
}

function enrichExistingFields(
  fields: ChannelFieldDescriptor[],
  discoveredFields: ChannelFieldDescriptor[]
): ChannelFieldDescriptor[] {
  let changed = false;
  const enrichedFields = fields.map((field) => {
    const enrichedField = enrichExistingField(field, discoveredFields);
    if (enrichedField !== field) changed = true;
    return enrichedField;
  });
  return changed ? enrichedFields : fields;
}

function manifestEnvVarsForChannel(manifest: Record<string, any> | null, channelType: string): string[] {
  const channelEnvVars = manifest?.channelEnvVars;
  if (!channelEnvVars || typeof channelEnvVars !== 'object' || Array.isArray(channelEnvVars)) return [];

  const directMatch = channelEnvVars[channelType];
  if (Array.isArray(directMatch)) {
    return directMatch.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
  }

  if (Object.keys(channelEnvVars).length === 1) {
    const firstValue = Object.values(channelEnvVars)[0];
    if (Array.isArray(firstValue)) {
      return firstValue.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim());
    }
  }

  return [];
}

function mapFieldEnvVars(
  fields: ChannelFieldDescriptor[],
  envVars: string[]
): Map<string, string[]> {
  const envVarMap = new Map<string, string[]>();

  for (const envVar of envVars) {
    let bestField: ChannelFieldDescriptor | null = null;
    let bestScore = -1;

    for (const field of fields) {
      for (const alias of fieldAliases(field)) {
        const score = envVarMatchScore(envVar, alias);
        if (score > bestScore) {
          bestScore = score;
          bestField = field;
        }
      }
    }

    if (!bestField || bestScore < 0) continue;
    const fieldEnvVars = envVarMap.get(bestField.key) || [];
    if (!fieldEnvVars.includes(envVar)) fieldEnvVars.push(envVar);
    envVarMap.set(bestField.key, fieldEnvVars);
  }

  return envVarMap;
}

function formatEnvVarHelpText(envVars: string[]): string {
  if (envVars.length === 1) return `Supports env var: ${envVars[0]}.`;
  return `Supports env vars: ${envVars.join(', ')}.`;
}

function enrichFieldsWithEnvVars(
  fields: ChannelFieldDescriptor[],
  envVarMap: Map<string, string[]>
): ChannelFieldDescriptor[] {
  let changed = false;
  const enrichedFields = fields.map((field) => {
    const envVars = envVarMap.get(field.key);
    if (!envVars?.length) return field;

    const envVarHelpText = formatEnvVarHelpText(envVars);
    const nextHelpText = field.helpText
      ? field.helpText.includes(envVarHelpText)
        ? field.helpText
        : `${field.helpText} ${envVarHelpText}`
      : envVarHelpText;

    if (nextHelpText === field.helpText) return field;
    changed = true;
    return {
      ...field,
      helpText: nextHelpText,
    };
  });

  return changed ? enrichedFields : fields;
}

function mergeMissingFields(
  existingFields: ChannelFieldDescriptor[],
  discoveredFields: ChannelFieldDescriptor[],
  coverage: Set<string>
): ChannelFieldDescriptor[] {
  let mergedFields: ChannelFieldDescriptor[] | null = null;

  for (const field of discoveredFields) {
    const aliases = [field.key, ...(field.legacyKeys || [])].filter((alias) => Boolean(alias && alias.trim()));
    if (!aliases.length) continue;
    if (aliases.some((alias) => coverage.has(alias))) continue;
    if (!mergedFields) mergedFields = [...existingFields];
    mergedFields.push(field);
    for (const alias of aliases) coverage.add(alias);
  }

  return mergedFields || existingFields;
}

function enrichCatalogEntry(
  entry: ChannelCatalogEntry,
  manifest: Record<string, any> | null = null
): ChannelCatalogEntry {
  if (!manifest) return entry;

  const discoveredFields = extractManifestFieldDescriptors(manifest);
  const manifestEnvVars = manifestEnvVarsForChannel(manifest, entry.type);
  if (
    !discoveredFields.credentialFields.length &&
    !discoveredFields.accountFields.length &&
    !manifestEnvVars.length
  ) {
    return entry;
  }

  const credentialFieldsWithMetadata = enrichExistingFields(
    entry.credentialFields,
    discoveredFields.credentialFields
  );
  const accountFieldsWithMetadata = enrichExistingFields(
    entry.accountFields,
    discoveredFields.accountFields
  );
  const fieldCoverage = new Set([
    ...getFieldCoverage(credentialFieldsWithMetadata),
    ...getFieldCoverage(accountFieldsWithMetadata),
  ]);

  const credentialFields = mergeMissingFields(
    credentialFieldsWithMetadata,
    discoveredFields.credentialFields,
    fieldCoverage
  );
  const accountFields = mergeMissingFields(
    accountFieldsWithMetadata,
    discoveredFields.accountFields,
    fieldCoverage
  );
  const envVarMap = mapFieldEnvVars(
    [...credentialFields, ...accountFields],
    manifestEnvVars
  );
  const credentialFieldsWithEnvVars = enrichFieldsWithEnvVars(credentialFields, envVarMap);
  const accountFieldsWithEnvVars = enrichFieldsWithEnvVars(accountFields, envVarMap);

  if (
    credentialFieldsWithEnvVars === entry.credentialFields &&
    accountFieldsWithEnvVars === entry.accountFields
  ) {
    return entry;
  }

  return {
    ...entry,
    credentialFields: credentialFieldsWithEnvVars,
    accountFields: accountFieldsWithEnvVars,
  };
}

function buildFallbackEntry(
  channelType: string,
  manifest: Record<string, any> | null = null
): ChannelCatalogEntry {
  const extractedFields = extractManifestFieldDescriptors(manifest);

  return makeCatalogEntry(channelType, titleCaseChannelType(channelType), {
    icon: '◈',
    supportsNamedAccounts: extractedFields.supportsNamedAccounts,
    credentialFields: extractedFields.credentialFields,
    accountFields: extractedFields.accountFields,
  });
}

export function buildChannelCatalog(params: {
  openclawRoot: string;
  configuredTypes?: Iterable<string>;
}): ChannelCatalogEntry[] {
  const types = new Set<string>(Object.keys(STATIC_CHANNEL_CATALOG));
  const discoveredOfficialChannelManifests = discoverOfficialChannelManifests(params.openclawRoot);
  const discoveredInstalledOfficialChannelManifests = discoverInstalledOfficialChannelManifests(
    params.openclawRoot
  );
  const discoveredChannelManifests = discoverLocalChannelManifests(params.openclawRoot);

  for (const discoveredType of discoveredOfficialChannelManifests.keys()) {
    types.add(discoveredType);
  }

  for (const discoveredType of discoveredInstalledOfficialChannelManifests.keys()) {
    types.add(discoveredType);
  }

  for (const discoveredType of discoveredChannelManifests.keys()) {
    types.add(discoveredType);
  }

  for (const configuredType of params.configuredTypes || []) {
    if (typeof configuredType === 'string' && configuredType.trim()) {
      types.add(configuredType.trim());
    }
  }

  return [...types]
    .sort((left, right) => left.localeCompare(right))
    .map((channelType) => {
      const officialManifest =
        discoveredOfficialChannelManifests.get(channelType)?.manifest ||
        discoveredInstalledOfficialChannelManifests.get(channelType)?.manifest ||
        null;
      const localManifest = discoveredChannelManifests.get(channelType)?.manifest || null;

      if (STATIC_CHANNEL_CATALOG[channelType]) {
        return enrichCatalogEntry(
          enrichCatalogEntry(STATIC_CHANNEL_CATALOG[channelType], officialManifest),
          localManifest
        );
      }

      const primaryManifest = localManifest || officialManifest;
      const secondaryManifest = primaryManifest === localManifest ? officialManifest : localManifest;
      return enrichCatalogEntry(buildFallbackEntry(channelType, primaryManifest || null), secondaryManifest);
    });
}

export function getChannelCatalogEntry(params: {
  openclawRoot: string;
  configuredTypes?: Iterable<string>;
  channelType: string;
}): ChannelCatalogEntry {
  const normalizedType = params.channelType.trim();
  return (
    buildChannelCatalog({
      openclawRoot: params.openclawRoot,
      configuredTypes: params.configuredTypes,
    }).find((entry) => entry.type === normalizedType) || buildFallbackEntry(normalizedType)
  );
}
