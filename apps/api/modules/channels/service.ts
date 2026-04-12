import path from 'node:path';
import { execFile } from 'node:child_process';
import type {
  ChannelAccessUpdatePayload,
  ChannelAccountAccessPayload,
  ChannelAccountCredentialsPayload,
  ChannelFieldDescriptor,
  ChannelAccountInput,
  ChannelAccountSummary,
  ChannelAgentOption,
  ChannelBindingInput,
  ChannelBindingSummary,
  ChannelCatalogEntry,
  ChannelPairingApprovePayload,
  ChannelPairingApproveResponse,
  ChannelPairingPayload,
  ChannelPairingRequestSummary,
  ChannelSettingsInput,
  ChannelsMutationResponse,
  ChannelsSummaryPayload,
  ChannelSummary,
  ChannelThreadBindingSummary,
} from '../../../../types/channels.js';
import type { StudioServerConfig } from '../../../../types/api.js';
import { ensureDir, readJsonFile, readOpenClawConfig, writeJsonFile } from '../../core/state.js';
import { buildChannelCatalog, getChannelCatalogEntry } from './catalog.js';

const RESERVED_CHANNEL_KEYS = new Set(['defaults', 'modelByChannel']);
const PAIRING_TIMEOUT_MS = 10_000;

class ChannelServiceError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ChannelServiceError';
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeGroupPolicy(value: unknown): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  if (normalized === 'allowall' || normalized === 'all') return 'open';
  return normalized;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const output: string[] = [];
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || output.includes(normalized)) continue;
    output.push(normalized);
  }
  return output;
}

function normalizeNumber(value: unknown, fallback: number, min = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function normalizeDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return null;
}

function normalizeStreaming(value: unknown): string | null {
  if (value === false) return 'off';
  if (value === true) return 'partial';
  const normalized = normalizeOptionalString(value);
  if (!normalized) return null;
  if (normalized === 'full' || normalized === 'on') return 'partial';
  return normalized;
}

function normalizeOptionalBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function cloneJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

function buildBindingId(rawBinding: Record<string, any>): string {
  return Buffer.from(JSON.stringify({
    type: rawBinding.type || 'agent',
    agentId: rawBinding.agentId || '',
    match: rawBinding.match || {},
    comment: rawBinding.comment || '',
    acp: rawBinding.acp || {},
  })).toString('base64url');
}

function isChannelProviderKey(key: string): boolean {
  return Boolean(key) && !RESERVED_CHANNEL_KEYS.has(key);
}

function getConfiguredChannelTypes(openclawConfig: Record<string, any>): string[] {
  if (!openclawConfig.channels || typeof openclawConfig.channels !== 'object') return [];
  return Object.keys(openclawConfig.channels).filter((channelType) => isChannelProviderKey(channelType));
}

function readCatalog(config: StudioServerConfig, openclawConfig: Record<string, any>): ChannelCatalogEntry[] {
  return buildChannelCatalog({
    openclawRoot: config.openclawRoot,
    configuredTypes: getConfiguredChannelTypes(openclawConfig),
  });
}

function getCatalogEntry(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  channelType: string
): ChannelCatalogEntry {
  return getChannelCatalogEntry({
    openclawRoot: config.openclawRoot,
    configuredTypes: getConfiguredChannelTypes(openclawConfig),
    channelType,
  });
}

function normalizeFieldText(value: unknown, preserveWhitespace = false): string | null {
  if (typeof value !== 'string') return null;
  if (preserveWhitespace) {
    return value.trim().length > 0 ? value : null;
  }
  return normalizeOptionalString(value);
}

function normalizeFieldNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeFieldStringList(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = normalizeStringList(value);
    return normalized.length ? normalized : null;
  }

  if (typeof value !== 'string') return null;
  const entries = value
    .split(/\r?\n|,/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length ? normalizeStringList(entries) : null;
}

function splitFieldPath(fieldKey: string): string[] {
  return fieldKey
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function readNestedFieldValue(target: Record<string, any>, fieldKey: string): unknown {
  const parts = splitFieldPath(fieldKey);
  if (parts.length === 0) return undefined;

  let current: unknown = target;
  for (const part of parts) {
    if (!isRecordObject(current)) return undefined;
    current = current[part];
    if (current === undefined) return undefined;
  }
  return current;
}

function deleteNestedFieldValue(target: Record<string, any>, fieldKey: string): void {
  const parts = splitFieldPath(fieldKey);
  if (parts.length === 0) return;

  const ancestors: Array<{ parent: Record<string, any>; key: string }> = [];
  let current: Record<string, any> = target;

  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = current[part];
    if (!isRecordObject(next)) return;
    ancestors.push({ parent: current, key: part });
    current = next;
  }

  delete current[parts[parts.length - 1]];

  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const { parent, key } = ancestors[index];
    const candidate = parent[key];
    if (!isRecordObject(candidate) || Object.keys(candidate).length > 0) {
      break;
    }
    delete parent[key];
  }
}

function setNestedFieldValue(target: Record<string, any>, fieldKey: string, value: unknown): void {
  const parts = splitFieldPath(fieldKey);
  if (parts.length === 0) return;

  let current: Record<string, any> = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    if (!isRecordObject(current[part])) {
      current[part] = {};
    }
    current = current[part] as Record<string, any>;
  }

  current[parts[parts.length - 1]] = value;
}

function normalizeSelectFieldValue(field: ChannelFieldDescriptor, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  const normalized = normalizeFieldText(value);
  if (!normalized) return null;

  if (field.key === 'allowBots') {
    if (normalized === 'enabled') return 'true';
    if (normalized === 'disabled' || normalized === 'off') return 'false';
    if (normalized === 'true' || normalized === 'false' || normalized === 'mentions') return normalized;
  }

  return normalized;
}

function normalizeDynamicFieldValue(
  field: ChannelFieldDescriptor,
  value: unknown
): string | number | boolean | string[] | null {
  if (field.key === 'retry.jitter') {
    if (value === null || value === undefined || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  switch (field.input) {
    case 'boolean':
      return normalizeOptionalBoolean(value);
    case 'number':
      return normalizeFieldNumber(value);
    case 'stringList':
      return normalizeFieldStringList(value);
    case 'select':
      return normalizeSelectFieldValue(field, value);
    case 'textarea':
      return normalizeFieldText(value, true);
    case 'text':
    default:
      return normalizeFieldText(value);
  }
}

function getFieldKeys(field: ChannelFieldDescriptor): string[] {
  return [...new Set([field.key, ...(field.legacyKeys || [])].filter((key) => Boolean(key && key.trim())))];
}

function readFieldValue(field: ChannelFieldDescriptor, target: Record<string, any>): unknown {
  for (const key of getFieldKeys(field)) {
    const value = readNestedFieldValue(target, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function deleteFieldKeys(target: Record<string, any>, field: ChannelFieldDescriptor): void {
  for (const key of getFieldKeys(field)) {
    deleteNestedFieldValue(target, key);
  }
}

function mapAccountFieldValues(
  catalog: ChannelCatalogEntry,
  accountConfig: Record<string, any>
): Record<string, unknown> {
  return Object.fromEntries(
    catalog.accountFields
      .map((field) => [field.key, normalizeDynamicFieldValue(field, readFieldValue(field, accountConfig))] as const)
      .filter(([, value]) => value !== null)
  );
}

function isCredentialConfigured(field: ChannelFieldDescriptor, value: unknown): boolean {
  const normalized = normalizeDynamicFieldValue(field, value);
  if (Array.isArray(normalized)) return normalized.length > 0;
  if (typeof normalized === 'string') return normalized.trim().length > 0;
  if (typeof normalized === 'number') return Number.isFinite(normalized);
  if (typeof normalized === 'boolean') return true;
  if (value && typeof value === 'object') return true;
  return normalized !== null;
}

function readCredentialValue(field: ChannelFieldDescriptor, value: unknown): string {
  const normalized = normalizeDynamicFieldValue(field, value);
  if (Array.isArray(normalized)) return normalized.join('\n');
  if (typeof normalized === 'string') return normalized;
  if (typeof normalized === 'number' || typeof normalized === 'boolean') return String(normalized);
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }
  return '';
}

function readInputFieldValue(input: ChannelAccountInput, fieldKey: string): unknown {
  if (input.fieldValues && Object.prototype.hasOwnProperty.call(input.fieldValues, fieldKey)) {
    return input.fieldValues[fieldKey];
  }
  return input[fieldKey as keyof ChannelAccountInput];
}

function readAllowFromPath(config: StudioServerConfig, channelType: string, accountId: string): string {
  const credentialsDir = path.join(config.openclawRoot, 'credentials');
  if (!accountId || accountId === 'default') return path.join(credentialsDir, `${channelType}-allowFrom.json`);
  return path.join(credentialsDir, `${channelType}-${accountId}-allowFrom.json`);
}

function readPairingPath(config: StudioServerConfig, channelType: string): string {
  return path.join(config.openclawRoot, 'credentials', `${channelType}-pairing.json`);
}

function readAllowFrom(config: StudioServerConfig, channelType: string, accountId: string): string[] {
  const payload = readJsonFile<Record<string, unknown>>(readAllowFromPath(config, channelType, accountId), { allowFrom: [] });
  return normalizeStringList(payload.allowFrom);
}

function writeAllowFrom(config: StudioServerConfig, channelType: string, accountId: string, allowFrom: string[]): void {
  const filePath = readAllowFromPath(config, channelType, accountId);
  ensureDir(path.dirname(filePath));
  writeJsonFile(filePath, {
    version: 1,
    allowFrom: normalizeStringList(allowFrom),
  });
}

function readRawPairingRequests(config: StudioServerConfig, channelType: string): Array<Record<string, unknown>> {
  const payload = readJsonFile<Record<string, unknown>>(readPairingPath(config, channelType), { requests: [] });
  return Array.isArray(payload.requests) ? payload.requests.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object') : [];
}

function mapPairingRequests(rawRequests: Array<Record<string, unknown>>, accountId: string | null = null): ChannelPairingRequestSummary[] {
  return rawRequests
    .filter((request) => {
      if (!accountId || accountId === 'default') return true;
      const scopedAccountId = normalizeString(request.accountId || request.account || request.accountName);
      return !scopedAccountId || scopedAccountId === accountId;
    })
    .map((request) => ({
      code: normalizeString(request.code || request.id || request.pairingCode || request.token),
      requester: normalizeOptionalString(
        request.requester || request.sender || request.user || request.subject || request.displayName || request.from
      ),
      peerId: normalizeOptionalString(
        request.peerId || request.senderId || request.userId || request.fromId || (request.peer as Record<string, unknown> | undefined)?.id
      ),
      accountId: normalizeOptionalString(request.accountId || request.account || request.accountName),
      createdAt: normalizeDate(request.createdAt || request.createdAtMs || request.createdAtUnixMs),
      expiresAt: normalizeDate(request.expiresAt || request.expiresAtMs || request.expiresAtUnixMs),
      note: normalizeOptionalString(request.note || request.message || request.reason),
    }))
    .filter((request) => request.code || request.requester || request.peerId)
    .sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));
}

function getAccountRaw(channelConfig: Record<string, any>, accountId: string): Record<string, any> | null {
  const accounts = channelConfig.accounts || {};
  const account = accounts[accountId];
  return account && typeof account === 'object' ? account as Record<string, any> : null;
}

function getAccountsRaw(channelConfig: Record<string, any>): Record<string, any> {
  return channelConfig.accounts && typeof channelConfig.accounts === 'object'
    ? channelConfig.accounts as Record<string, any>
    : {};
}

function ensureAccountsRaw(channelConfig: Record<string, any>): Record<string, any> {
  if (!channelConfig.accounts || typeof channelConfig.accounts !== 'object') {
    channelConfig.accounts = {};
  }
  return channelConfig.accounts as Record<string, any>;
}

function isRecordObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeAccountConfigView(
  channelConfig: Record<string, any>,
  accountConfig: Record<string, any> | null
): Record<string, any> {
  const merged: Record<string, any> = {
    ...channelConfig,
    ...(accountConfig || {}),
  };

  for (const key of ['healthMonitor', 'dm', 'groups', 'guilds', 'execApprovals']) {
    const channelValue = channelConfig[key];
    const accountValue = accountConfig?.[key];
    if (isRecordObject(channelValue) && isRecordObject(accountValue)) {
      merged[key] = {
        ...channelValue,
        ...accountValue,
      };
      continue;
    }
    if (accountValue !== undefined) {
      merged[key] = accountValue;
      continue;
    }
    if (channelValue !== undefined) {
      merged[key] = channelValue;
    }
  }

  return merged;
}

function getAccountConfigScope(
  catalog: ChannelCatalogEntry,
  accountId: string
): 'channel' | 'account' {
  if (accountId === 'default') {
    return catalog.defaultAccountConfigScope;
  }
  return 'account';
}

function getAccountViewConfig(
  catalog: ChannelCatalogEntry,
  channelConfig: Record<string, any>,
  accountId: string
): Record<string, any> {
  if (getAccountConfigScope(catalog, accountId) === 'channel') {
    return mergeAccountConfigView(channelConfig, getAccountRaw(channelConfig, 'default'));
  }
  return getAccountRaw(channelConfig, accountId) || {};
}

function hasAccountProfile(
  catalog: ChannelCatalogEntry,
  channelConfig: Record<string, any>,
  accountId: string
): boolean {
  if (accountId === 'default') return catalog.supportsDefaultAccount;
  return Boolean(getAccountRaw(channelConfig, accountId));
}

function ensureAccountProfile(
  catalog: ChannelCatalogEntry,
  channelConfig: Record<string, any>,
  channelType: string,
  accountId: string
): void {
  if (hasAccountProfile(catalog, channelConfig, accountId)) return;
  throw new ChannelServiceError(404, 'account_not_found', `Account '${channelType}/${accountId}' not found`);
}

function ensureWritableAccountConfig(
  catalog: ChannelCatalogEntry,
  channelConfig: Record<string, any>,
  channelType: string,
  accountId: string,
  options: { createIfMissing?: boolean } = {}
): Record<string, any> {
  const scope = getAccountConfigScope(catalog, accountId);
  if (scope === 'channel') {
    return channelConfig;
  }

  const accounts = ensureAccountsRaw(channelConfig);
  const existing = accounts[accountId];
  if (existing && typeof existing === 'object') {
    return existing as Record<string, any>;
  }
  if (!options.createIfMissing) {
    throw new ChannelServiceError(404, 'account_not_found', `Account '${channelType}/${accountId}' not found`);
  }
  const nextAccount: Record<string, any> = {};
  accounts[accountId] = nextAccount;
  return nextAccount;
}

function isEmptyRecord(value: Record<string, any> | null): boolean {
  return !value || Object.keys(value).length === 0;
}

function pruneDefaultAccountOverride(
  channelConfig: Record<string, any>,
  catalog: ChannelCatalogEntry,
  extraKeys: string[] = []
): void {
  if (catalog.defaultAccountConfigScope !== 'channel') return;
  const accounts = getAccountsRaw(channelConfig);
  const defaultOverride = getAccountRaw(channelConfig, 'default');
  if (!defaultOverride) return;

  delete defaultOverride.enabled;
  delete defaultOverride.dm;
  delete defaultOverride.groups;
  delete defaultOverride.guilds;
  delete defaultOverride.execApprovals;
  for (const key of catalog.accountSettings) {
    delete defaultOverride[key];
  }
  for (const field of catalog.accountFields) {
    deleteFieldKeys(defaultOverride, field);
  }
  for (const field of catalog.credentialFields) {
    deleteFieldKeys(defaultOverride, field);
  }
  for (const key of extraKeys) {
    delete defaultOverride[key];
  }

  if (isEmptyRecord(defaultOverride)) {
    delete accounts.default;
  }
  if (Object.keys(accounts).length === 0) {
    delete channelConfig.accounts;
  }
}

function resolveEffectiveSetting(
  channelConfig: Record<string, any>,
  accountConfig: Record<string, any> | null,
  accountId: string,
  key: string
): unknown {
  const directValue = accountConfig?.[key];
  if (directValue !== undefined && directValue !== '') return directValue;

  const channelValue = channelConfig[key];
  if (channelValue !== undefined && channelValue !== '') return channelValue;

  if (accountId !== 'default') {
    const defaultAccount = getAccountRaw(channelConfig, 'default');
    const defaultValue = defaultAccount?.[key];
    if (defaultValue !== undefined && defaultValue !== '') return defaultValue;
  }

  return null;
}

function resolveEffectiveHealthMonitor(
  channelConfig: Record<string, any>,
  accountConfig: Record<string, any> | null,
  accountId: string
): boolean | null {
  const accountValue = normalizeOptionalBoolean(accountConfig?.healthMonitor?.enabled);
  if (accountValue !== null) return accountValue;

  const channelValue = normalizeOptionalBoolean(channelConfig.healthMonitor?.enabled);
  if (channelValue !== null) return channelValue;

  if (accountId !== 'default') {
    const defaultAccount = getAccountRaw(channelConfig, 'default');
    const defaultValue = normalizeOptionalBoolean(defaultAccount?.healthMonitor?.enabled);
    if (defaultValue !== null) return defaultValue;
  }

  return null;
}

function hasEffectiveSettingValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function mapCredentialStates(catalog: ChannelCatalogEntry, accountConfig: Record<string, any>): ChannelAccountSummary['credentialStates'] {
  return catalog.credentialFields.map((field) => ({
    key: field.key,
    configured: isCredentialConfigured(field, readFieldValue(field, accountConfig)),
  }));
}

function mapAccountSummary(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  channelType: string,
  channelConfig: Record<string, any>,
  accountId: string,
  accountConfig: Record<string, any>
): ChannelAccountSummary {
  const catalog = getCatalogEntry(config, openclawConfig, channelType);
  const allowFrom = readAllowFrom(config, channelType, accountId);
  const effectiveGroupAllowFrom = Array.isArray(accountConfig.groupAllowFrom)
    ? normalizeStringList(accountConfig.groupAllowFrom)
    : normalizeStringList(channelConfig.groupAllowFrom);
  const pairingRequests = mapPairingRequests(readRawPairingRequests(config, channelType), accountId);
  const effectiveValues = {
    dmPolicy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'dmPolicy')),
    groupPolicy: normalizeGroupPolicy(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'groupPolicy')),
    contextVisibility: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'contextVisibility')),
    streaming: normalizeStreaming(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'streaming')),
    proxy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'proxy')),
    connectionMode: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'connectionMode')),
    renderMode: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'renderMode')),
    domain: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'domain')),
    responsePrefix: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'responsePrefix')),
    configWrites: normalizeOptionalBoolean(resolveEffectiveSetting(channelConfig, accountConfig, accountId, 'configWrites')),
    healthMonitor: resolveEffectiveHealthMonitor(channelConfig, accountConfig, accountId),
  };

  return {
    id: accountId,
    kind: accountId === 'default' ? 'default' : 'named',
    enabled: accountConfig.enabled !== false,
    credentialStates: mapCredentialStates(catalog, accountConfig),
    fieldValues: mapAccountFieldValues(catalog, accountConfig),
    dmPolicy: effectiveValues.dmPolicy,
    groupPolicy: effectiveValues.groupPolicy,
    contextVisibility: effectiveValues.contextVisibility,
    streaming: effectiveValues.streaming,
    proxy: effectiveValues.proxy,
    connectionMode: effectiveValues.connectionMode,
    renderMode: effectiveValues.renderMode,
    domain: effectiveValues.domain,
    responsePrefix: effectiveValues.responsePrefix,
    configWrites: effectiveValues.configWrites,
    healthMonitor: effectiveValues.healthMonitor,
    dmConfig: cloneJsonObject(accountConfig.dm),
    groupsConfig: cloneJsonObject(accountConfig.groups),
    guildsConfig: cloneJsonObject(accountConfig.guilds),
    execApprovalsConfig: cloneJsonObject(accountConfig.execApprovals),
    allowFromCount: allowFrom.length,
    groupAllowFromCount: effectiveGroupAllowFrom.length,
    pairingPendingCount: pairingRequests.length,
    settings: catalog.accountSettings.filter((key) => {
      if (key === 'enabled') return false;
      const settingValue = (effectiveValues as Record<string, unknown>)[key];
      if (hasEffectiveSettingValue(settingValue)) return true;
      if (key === 'healthMonitor') return hasEffectiveSettingValue(accountConfig.healthMonitor?.enabled);
      return hasEffectiveSettingValue(accountConfig[key]);
    }),
  };
}

export function buildChannelWorkspaceSummary(channel: ChannelSummary): {
  enabled: boolean;
  accountCount: number;
  bindingCount: number;
  defaultAccount: string | null;
} {
  return {
    enabled: channel.enabled,
    accountCount: channel.accountCount,
    bindingCount: channel.bindingCount,
    defaultAccount: channel.defaultAccount,
  };
}

export function buildChannelAccountWorkspaceSummary(account: ChannelAccountSummary): {
  id: string;
  kind: ChannelAccountSummary['kind'];
  enabled: boolean;
} {
  return {
    id: account.id,
    kind: account.kind,
    enabled: account.enabled,
  };
}

function mapBinding(rawBinding: Record<string, any>): ChannelBindingSummary | null {
  const match = rawBinding.match && typeof rawBinding.match === 'object' ? rawBinding.match as Record<string, any> : {};
  const channel = normalizeString(match.channel);
  const agentId = normalizeString(rawBinding.agentId);
  if (!channel || !agentId) return null;

  const accountId = normalizeOptionalString(match.accountId);
  const peer = match.peer && typeof match.peer === 'object' ? match.peer as Record<string, any> : null;
  const roles = normalizeStringList(match.roles);
  const type = rawBinding.type === 'acp' ? 'acp' : 'agent';

  return {
    id: buildBindingId(rawBinding),
    ref: [channel, accountId, agentId, normalizeOptionalString(peer?.kind), normalizeOptionalString(peer?.id)].filter(Boolean).join(':'),
    type,
    channel,
    accountId,
    agentId,
    comment: normalizeOptionalString(rawBinding.comment),
    match: {
      channel,
      accountId,
      peerKind: normalizeOptionalString(peer?.kind),
      peerId: normalizeOptionalString(peer?.id),
      guildId: normalizeOptionalString(match.guildId),
      teamId: normalizeOptionalString(match.teamId),
      roles,
    },
    acp: type === 'acp'
      ? {
        mode: normalizeOptionalString(rawBinding.acp?.mode),
        label: normalizeOptionalString(rawBinding.acp?.label),
        cwd: normalizeOptionalString(rawBinding.acp?.cwd),
        backend: normalizeOptionalString(rawBinding.acp?.backend),
      }
      : null,
  };
}

function readAgentOptions(openclawConfig: Record<string, any>): ChannelAgentOption[] {
  const defaults = openclawConfig.agents?.defaults || {};
  const fallbackModel = normalizeString(defaults.model?.primary);
  const rawAgents = Array.isArray(openclawConfig.agents?.list) ? openclawConfig.agents.list : [];
  const mapped = rawAgents
    .map((agent: Record<string, any>) => ({
      id: normalizeString(agent.id),
      name: normalizeString(agent.name || agent.id),
      model: normalizeString(agent.model || fallbackModel),
      enabled: agent.enabled !== false,
    }))
    .filter((agent: ChannelAgentOption) => Boolean(agent.id));
  if (mapped.length === 0) {
    mapped.push({
      id: 'main',
      name: normalizeString(defaults.identity?.name) || 'main',
      model: fallbackModel,
      enabled: true,
    });
  }
  return mapped.sort((left: ChannelAgentOption, right: ChannelAgentOption) => left.id.localeCompare(right.id));
}

function buildSummary(config: StudioServerConfig, openclawConfig: Record<string, any>): ChannelsSummaryPayload {
  const rawChannels = openclawConfig.channels && typeof openclawConfig.channels === 'object'
    ? openclawConfig.channels as Record<string, any>
    : {};
  const channelEntries = Object.entries(rawChannels)
    .filter(([channelType, channelConfig]) => isChannelProviderKey(channelType) && channelConfig && typeof channelConfig === 'object');
  const rawBindings = Array.isArray(openclawConfig.bindings)
    ? openclawConfig.bindings.filter((binding): binding is Record<string, any> => Boolean(binding) && typeof binding === 'object')
    : [];
  const bindings = rawBindings
    .map((binding) => mapBinding(binding))
    .filter((binding): binding is ChannelBindingSummary => binding !== null)
    .sort((left, right) => left.ref.localeCompare(right.ref));
  const agents = readAgentOptions(openclawConfig);
  const catalog = readCatalog(config, openclawConfig);
  const catalogByType = new Map(catalog.map((entry) => [entry.type, entry] as const));

  const channels = channelEntries
    .map(([channelType, channelConfig]) => {
      const channelCatalog = catalogByType.get(channelType) || getCatalogEntry(config, openclawConfig, channelType);
      const rawAccounts = getAccountsRaw(channelConfig);
      const namedAccountIds = Object.keys(rawAccounts)
        .filter((accountId) => accountId !== 'default')
        .sort((left, right) => {
          if (left === 'default') return -1;
          if (right === 'default') return 1;
          return left.localeCompare(right);
        });
      const accounts: ChannelAccountSummary[] = [];
      if (channelCatalog.supportsDefaultAccount) {
        accounts.push(
          mapAccountSummary(
            config,
            openclawConfig,
            channelType,
            channelConfig,
            'default',
            getAccountViewConfig(channelCatalog, channelConfig, 'default')
          )
        );
      }
      for (const accountId of namedAccountIds) {
        accounts.push(
          mapAccountSummary(
            config,
            openclawConfig,
            channelType,
            channelConfig,
            accountId,
            rawAccounts[accountId] as Record<string, any>
          )
        );
      }
      const namedAccountCount = namedAccountIds.length;
      return {
        type: channelType,
        enabled: channelConfig.enabled !== false,
        accountCount: namedAccountCount,
        profileCount: accounts.length,
        bindingCount: bindings.filter((binding) => binding.channel === channelType).length,
        defaultAccount: normalizeOptionalString(channelConfig.defaultAccount),
        dmPolicy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'dmPolicy')),
        groupPolicy: normalizeGroupPolicy(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'groupPolicy')),
        contextVisibility: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'contextVisibility')),
        streaming: normalizeStreaming(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'streaming')),
        proxy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'proxy')),
        connectionMode: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'connectionMode')),
        renderMode: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'renderMode')),
        domain: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'domain')),
        responsePrefix: normalizeOptionalString(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'responsePrefix')),
        configWrites: normalizeOptionalBoolean(resolveEffectiveSetting(channelConfig, getAccountRaw(channelConfig, 'default'), 'default', 'configWrites')),
        healthMonitor: resolveEffectiveHealthMonitor(channelConfig, getAccountRaw(channelConfig, 'default'), 'default'),
        dmConfig: cloneJsonObject(channelConfig.dm),
        groupsConfig: cloneJsonObject(channelConfig.groups),
        guildsConfig: cloneJsonObject(channelConfig.guilds),
        execApprovalsConfig: cloneJsonObject(channelConfig.execApprovals),
        threadBindings: channelConfig.threadBindings && typeof channelConfig.threadBindings === 'object'
          ? {
            enabled: channelConfig.threadBindings.enabled === true,
            idleHours: normalizeNumber(channelConfig.threadBindings.idleHours, 24, 1),
            maxAgeHours: normalizeNumber(channelConfig.threadBindings.maxAgeHours, 0, 0),
            spawnSubagentSessions: channelConfig.threadBindings.spawnSubagentSessions === true,
            spawnAcpSessions: channelConfig.threadBindings.spawnAcpSessions === true,
          }
          : null,
        accounts,
      } satisfies ChannelSummary;
    })
    .sort((left, right) => left.type.localeCompare(right.type));

  const counts = {
    channels: channels.length,
    accounts: channels.reduce((total, channel) => total + channel.accountCount, 0),
    profiles: channels.reduce((total, channel) => total + channel.profileCount, 0),
    bindings: bindings.length,
    pairingPending: channelEntries.reduce(
      (total, [channelType]) => total + mapPairingRequests(readRawPairingRequests(config, channelType)).length,
      0
    ),
  };

  return {
    checkedAt: new Date().toISOString(),
    counts,
    catalog,
    agents,
    channels,
    bindings,
  };
}

function writeChannelStringField(target: Record<string, any>, key: keyof ChannelSettingsInput, value: unknown): void {
  if (value === undefined) return;
  if (key === 'streaming') {
    const normalized = normalizeStreaming(value);
    if (!normalized) {
      deleteNestedFieldValue(target, String(key));
      return;
    }
    setNestedFieldValue(target, String(key), normalized);
    return;
  }

  if (key === 'groupPolicy') {
    const normalized = normalizeGroupPolicy(value);
    if (normalized) {
      setNestedFieldValue(target, String(key), normalized);
    } else {
      deleteNestedFieldValue(target, String(key));
    }
    return;
  }

  const normalized = normalizeOptionalString(value);
  if (normalized) {
    setNestedFieldValue(target, String(key), normalized);
  } else {
    deleteNestedFieldValue(target, String(key));
  }
}

function writeThreadBindings(target: Record<string, any>, value: ChannelThreadBindingSummary | null | undefined): void {
  if (value === undefined) return;
  if (!value) {
    delete target.threadBindings;
    return;
  }

  target.threadBindings = {
    enabled: value.enabled === true,
    idleHours: normalizeNumber(value.idleHours, 24, 1),
    maxAgeHours: normalizeNumber(value.maxAgeHours, 0, 0),
    spawnSubagentSessions: value.spawnSubagentSessions === true,
    spawnAcpSessions: value.spawnAcpSessions === true,
  };
}

function writeChannelObjectField(target: Record<string, any>, key: 'dm' | 'groups' | 'guilds' | 'execApprovals', value: unknown): void {
  if (value === undefined) return;
  const normalized = cloneJsonObject(value);
  if (normalized) {
    target[key] = normalized;
  } else {
    delete target[key];
  }
}

function writeChannelBooleanField(target: Record<string, any>, key: 'configWrites', value: unknown): void {
  if (value === undefined) return;
  const normalized = normalizeOptionalBoolean(value);
  if (normalized === null) {
    delete target[key];
    return;
  }
  target[key] = normalized;
}

function writeHealthMonitorField(target: Record<string, any>, value: unknown): void {
  if (value === undefined) return;
  const normalized = normalizeOptionalBoolean(value);
  if (normalized === null) {
    delete target.healthMonitor;
    return;
  }
  const next = target.healthMonitor && typeof target.healthMonitor === 'object' && !Array.isArray(target.healthMonitor)
    ? { ...target.healthMonitor }
    : {};
  next.enabled = normalized;
  target.healthMonitor = next;
}

function writeAccountField(target: Record<string, any>, field: ChannelFieldDescriptor, value: unknown): void {
  const normalized = normalizeDynamicFieldValue(field, value);
  if (normalized === null || (Array.isArray(normalized) && normalized.length === 0)) {
    deleteFieldKeys(target, field);
    return;
  }
  deleteFieldKeys(target, field);
  if (field.key === 'allowBots' && typeof normalized === 'string') {
    if (normalized === 'true') {
      setNestedFieldValue(target, field.key, true);
      return;
    }
    if (normalized === 'false') {
      setNestedFieldValue(target, field.key, false);
      return;
    }
  }
  setNestedFieldValue(target, field.key, normalized);
}

function writeCredentialField(target: Record<string, any>, field: ChannelFieldDescriptor, value: unknown): void {
  const normalized = normalizeDynamicFieldValue(field, value);
  if (normalized === null || (Array.isArray(normalized) && normalized.length === 0)) {
    return;
  }
  deleteFieldKeys(target, field);
  setNestedFieldValue(target, field.key, normalized);
}

function applyChannelSettings(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  channelConfig: Record<string, any>,
  channelType: string,
  input: ChannelSettingsInput
): void {
  const catalog = getCatalogEntry(config, openclawConfig, channelType);
  channelConfig.enabled = input.enabled !== false;

  for (const key of catalog.channelSettings) {
    if (key === 'threadBindings') {
      writeThreadBindings(channelConfig, input.threadBindings);
      continue;
    }
    if (key === 'configWrites') {
      writeChannelBooleanField(channelConfig, 'configWrites', input.configWrites);
      continue;
    }
    if (key === 'healthMonitor') {
      writeHealthMonitorField(channelConfig, input.healthMonitor);
      continue;
    }
    writeChannelStringField(channelConfig, key as keyof ChannelSettingsInput, input[key as keyof ChannelSettingsInput]);
  }

  writeChannelObjectField(channelConfig, 'dm', input.dm);
  writeChannelObjectField(channelConfig, 'groups', input.groups);
  writeChannelObjectField(channelConfig, 'guilds', input.guilds);
  writeChannelObjectField(channelConfig, 'execApprovals', input.execApprovals);
}

function applyAccountSettings(
  config: StudioServerConfig,
  openclawConfig: Record<string, any>,
  accountConfig: Record<string, any>,
  channelType: string,
  input: ChannelAccountInput
): void {
  const catalog = getCatalogEntry(config, openclawConfig, channelType);
  if (input.enabled !== undefined) accountConfig.enabled = input.enabled !== false;

  for (const key of catalog.accountSettings) {
    if (key === 'enabled') continue;
    if (key === 'configWrites') {
      writeChannelBooleanField(accountConfig, 'configWrites', input.configWrites);
      continue;
    }
    if (key === 'healthMonitor') {
      writeHealthMonitorField(accountConfig, input.healthMonitor);
      continue;
    }
    writeChannelStringField(accountConfig, key as keyof ChannelSettingsInput, input[key as keyof ChannelSettingsInput]);
  }

  writeChannelObjectField(accountConfig, 'dm', input.dm);
  writeChannelObjectField(accountConfig, 'groups', input.groups);
  writeChannelObjectField(accountConfig, 'guilds', input.guilds);
  writeChannelObjectField(accountConfig, 'execApprovals', input.execApprovals);

  for (const field of catalog.accountFields) {
    writeAccountField(accountConfig, field, readInputFieldValue(input, field.key));
  }

  for (const field of catalog.credentialFields) {
    writeCredentialField(accountConfig, field, readInputFieldValue(input, field.key));
  }
}

function ensureChannel(config: Record<string, any>, channelType: string): Record<string, any> {
  if (!config.channels || typeof config.channels !== 'object' || !config.channels[channelType] || typeof config.channels[channelType] !== 'object') {
    throw new ChannelServiceError(404, 'channel_not_found', `Channel '${channelType}' not found`);
  }
  return config.channels[channelType] as Record<string, any>;
}

function ensureNamedAccountSupported(catalog: ChannelCatalogEntry, channelType: string): void {
  if (catalog.supportsNamedAccounts) return;
  throw new ChannelServiceError(
    400,
    'named_accounts_unsupported',
    `Channel '${channelType}' does not support named accounts`
  );
}

function validateChannelType(channelType: string): string {
  const normalized = normalizeString(channelType);
  if (!normalized) {
    throw new ChannelServiceError(400, 'invalid_channel_type', 'Channel type is required');
  }
  if (RESERVED_CHANNEL_KEYS.has(normalized)) {
    throw new ChannelServiceError(400, 'unsupported_channel_type', `Channel '${normalized}' is reserved by Studio`);
  }
  return normalized;
}

function validateAccountId(accountId: string): string {
  const normalized = normalizeString(accountId);
  if (!normalized) {
    throw new ChannelServiceError(400, 'invalid_account_id', 'Account id is required');
  }
  return normalized;
}

function validateAgentId(openclawConfig: Record<string, any>, agentId: string): string {
  const normalized = normalizeString(agentId);
  const exists = readAgentOptions(openclawConfig).some((agent) => agent.id === normalized);
  if (!normalized || !exists) {
    throw new ChannelServiceError(400, 'invalid_agent_id', `Agent '${agentId}' not found`);
  }
  return normalized;
}

function buildBindingRaw(input: ChannelBindingInput): Record<string, any> {
  const channel = normalizeString(input.channel);
  const agentId = normalizeString(input.agentId);
  if (!channel || !agentId) {
    throw new ChannelServiceError(400, 'invalid_binding', 'Binding channel and agent are required');
  }

  const accountId = normalizeOptionalString(input.accountId);
  const peerKind = normalizeOptionalString(input.peerKind);
  const peerId = normalizeOptionalString(input.peerId);
  const guildId = normalizeOptionalString(input.guildId);
  const teamId = normalizeOptionalString(input.teamId);
  const roles = normalizeStringList(input.roles);

  const binding: Record<string, any> = {
    agentId,
    match: {
      channel,
      ...(accountId ? { accountId } : {}),
      ...(peerKind && peerId ? { peer: { kind: peerKind, id: peerId } } : {}),
      ...(guildId ? { guildId } : {}),
      ...(teamId ? { teamId } : {}),
      ...(roles.length ? { roles } : {}),
    },
  };

  const comment = normalizeOptionalString(input.comment);
  if (comment) binding.comment = comment;

  if (input.type === 'acp') {
    binding.type = 'acp';
    binding.acp = {
      ...(normalizeOptionalString(input.acpMode) ? { mode: normalizeOptionalString(input.acpMode) } : {}),
      ...(normalizeOptionalString(input.acpLabel) ? { label: normalizeOptionalString(input.acpLabel) } : {}),
      ...(normalizeOptionalString(input.acpCwd) ? { cwd: normalizeOptionalString(input.acpCwd) } : {}),
      ...(normalizeOptionalString(input.acpBackend) ? { backend: normalizeOptionalString(input.acpBackend) } : {}),
    };
  }

  return binding;
}

async function execPairingList(channelType: string, accountId: string | null): Promise<ChannelPairingPayload> {
  const args = ['pairing', 'list'];
  if (accountId && accountId !== 'default') {
    args.push('--channel', channelType, '--account', accountId, '--json');
  } else {
    args.push(channelType, '--json');
  }

  return new Promise((resolve) => {
    execFile('openclaw', args, { timeout: PAIRING_TIMEOUT_MS }, (error, stdout) => {
      if (error) {
        resolve({
          checkedAt: new Date().toISOString(),
          channelType,
          accountId,
          supported: true,
          source: 'file',
          requests: [],
          error: error.message,
        });
        return;
      }

      try {
        const parsed = JSON.parse(extractJsonObject(stdout || '')) as Record<string, unknown>;
        const requests = Array.isArray(parsed.requests)
          ? mapPairingRequests(parsed.requests.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object'), accountId)
          : [];
        resolve({
          checkedAt: new Date().toISOString(),
          channelType,
          accountId,
          supported: true,
          source: 'cli',
          requests,
          error: null,
        });
      } catch (parseError) {
        resolve({
          checkedAt: new Date().toISOString(),
          channelType,
          accountId,
          supported: true,
          source: 'file',
          requests: [],
          error: parseError instanceof Error ? parseError.message : 'pairing_parse_failed',
        });
      }
    });
  });
}

async function execPairingApprove(channelType: string, accountId: string | null, code: string, notify: boolean): Promise<void> {
  const args = ['pairing', 'approve'];
  if (accountId && accountId !== 'default') {
    args.push('--channel', channelType, '--account', accountId, code);
  } else {
    args.push(channelType, code);
  }
  if (notify) args.push('--notify');

  await new Promise<void>((resolve, reject) => {
    execFile('openclaw', args, { timeout: PAIRING_TIMEOUT_MS }, (error, _stdout, stderr) => {
      if (error) {
        reject(new ChannelServiceError(400, 'pairing_approve_failed', (stderr || error.message || 'approve failed').trim()));
        return;
      }
      resolve();
    });
  });
}

export interface ChannelsService {
  getSummary(): ChannelsSummaryPayload;
  createChannel(channelType: string, enabled: boolean): ChannelsMutationResponse;
  updateChannel(channelType: string, input: ChannelSettingsInput): ChannelsMutationResponse;
  deleteChannel(channelType: string): ChannelsMutationResponse;
  createAccount(channelType: string, input: ChannelAccountInput): ChannelsMutationResponse;
  updateAccount(channelType: string, accountId: string, input: ChannelAccountInput): ChannelsMutationResponse;
  deleteAccount(channelType: string, accountId: string): ChannelsMutationResponse;
  getAccountCredentials(channelType: string, accountId: string): ChannelAccountCredentialsPayload;
  getAccountAccess(channelType: string, accountId: string): Promise<ChannelAccountAccessPayload>;
  updateAccountAccess(channelType: string, accountId: string, payload: ChannelAccessUpdatePayload): Promise<{
    success: boolean;
    message: string;
    access: ChannelAccountAccessPayload;
  }>;
  getPairing(channelType: string, accountId?: string | null): Promise<ChannelPairingPayload>;
  approvePairing(channelType: string, payload: ChannelPairingApprovePayload): Promise<ChannelPairingApproveResponse>;
  createBinding(input: ChannelBindingInput): ChannelsMutationResponse;
  updateBinding(bindingId: string, input: ChannelBindingInput): ChannelsMutationResponse;
  deleteBinding(bindingId: string): ChannelsMutationResponse;
}

export function isChannelServiceError(error: unknown): error is ChannelServiceError {
  return error instanceof ChannelServiceError;
}

export function createChannelsService(config: StudioServerConfig): ChannelsService {
  const saveAndBuild = (openclawConfig: Record<string, any>, message: string): ChannelsMutationResponse => {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
    return {
      success: true,
      message,
      summary: buildSummary(config, openclawConfig),
    };
  };

  return {
    getSummary(): ChannelsSummaryPayload {
      return buildSummary(config, readOpenClawConfig(config));
    },

    createChannel(channelType: string, enabled: boolean): ChannelsMutationResponse {
      const openclawConfig = readOpenClawConfig(config);
      const normalizedType = validateChannelType(channelType);
      openclawConfig.channels = openclawConfig.channels || {};

      if (openclawConfig.channels[normalizedType]) {
        throw new ChannelServiceError(409, 'channel_exists', `Channel '${normalizedType}' already exists`);
      }

      openclawConfig.channels[normalizedType] = {
        enabled,
        accounts: {},
      };

      return saveAndBuild(openclawConfig, `Channel '${normalizedType}' created`);
    },

    updateChannel(channelType: string, input: ChannelSettingsInput): ChannelsMutationResponse {
      const normalizedType = normalizeString(channelType);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      applyChannelSettings(config, openclawConfig, channelConfig, normalizedType, input);
      return saveAndBuild(openclawConfig, `Channel '${normalizedType}' updated`);
    },

    deleteChannel(channelType: string): ChannelsMutationResponse {
      const normalizedType = normalizeString(channelType);
      const openclawConfig = readOpenClawConfig(config);
      ensureChannel(openclawConfig, normalizedType);

      if (Array.isArray(openclawConfig.bindings)) {
        openclawConfig.bindings = openclawConfig.bindings.filter((binding: Record<string, any>) => binding.match?.channel !== normalizedType);
      }
      delete openclawConfig.channels[normalizedType];
      return saveAndBuild(openclawConfig, `Channel '${normalizedType}' deleted`);
    },

    createAccount(channelType: string, input: ChannelAccountInput): ChannelsMutationResponse {
      const normalizedType = normalizeString(channelType);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      const accountId = validateAccountId(input.id);

      if (accountId !== 'default' && !catalog.supportsNamedAccounts) {
        ensureNamedAccountSupported(catalog, normalizedType);
      }
      if (accountId === 'default' && hasAccountProfile(catalog, channelConfig, accountId)) {
        throw new ChannelServiceError(409, 'account_exists', `Account '${normalizedType}/${accountId}' already exists`);
      }
      if (accountId !== 'default' && hasAccountProfile(catalog, channelConfig, accountId)) {
        throw new ChannelServiceError(409, 'account_exists', `Account '${normalizedType}/${accountId}' already exists`);
      }

      const accountConfig = ensureWritableAccountConfig(catalog, channelConfig, normalizedType, accountId, {
        createIfMissing: true,
      });
      accountConfig.enabled = input.enabled !== false;
      applyAccountSettings(config, openclawConfig, accountConfig, normalizedType, input);

      return saveAndBuild(openclawConfig, `Account '${normalizedType}/${accountId}' created`);
    },

    updateAccount(channelType: string, accountId: string, input: ChannelAccountInput): ChannelsMutationResponse {
      const normalizedType = normalizeString(channelType);
      const normalizedAccountId = validateAccountId(accountId);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      ensureAccountProfile(catalog, channelConfig, normalizedType, normalizedAccountId);
      const accountConfig = ensureWritableAccountConfig(catalog, channelConfig, normalizedType, normalizedAccountId, {
        createIfMissing: normalizedAccountId === 'default',
      });

      applyAccountSettings(config, openclawConfig, accountConfig, normalizedType, input);
      if (normalizedAccountId === 'default') {
        pruneDefaultAccountOverride(channelConfig, catalog);
      }
      return saveAndBuild(openclawConfig, `Account '${normalizedType}/${normalizedAccountId}' updated`);
    },

    deleteAccount(channelType: string, accountId: string): ChannelsMutationResponse {
      const normalizedType = normalizeString(channelType);
      const normalizedAccountId = validateAccountId(accountId);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      ensureAccountProfile(catalog, channelConfig, normalizedType, normalizedAccountId);

      if (normalizedAccountId === 'default') {
        throw new ChannelServiceError(400, 'default_account_delete_unsupported', `Channel '${normalizedType}' keeps its default account profile`);
      }

      if (Array.isArray(openclawConfig.bindings)) {
        openclawConfig.bindings = openclawConfig.bindings.filter((binding: Record<string, any>) =>
          !(binding.match?.channel === normalizedType && normalizeString(binding.match?.accountId) === normalizedAccountId)
        );
      }
      if (normalizeString(channelConfig.defaultAccount) === normalizedAccountId) {
        delete channelConfig.defaultAccount;
      }
      const accounts = getAccountsRaw(channelConfig);
      delete accounts[normalizedAccountId];
      if (Object.keys(accounts).length === 0) {
        delete channelConfig.accounts;
      }

      return saveAndBuild(openclawConfig, `Account '${normalizedType}/${normalizedAccountId}' deleted`);
    },

    getAccountCredentials(channelType: string, accountId: string): ChannelAccountCredentialsPayload {
      const normalizedType = normalizeString(channelType);
      const normalizedAccountId = validateAccountId(accountId);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      ensureAccountProfile(catalog, channelConfig, normalizedType, normalizedAccountId);
      const accountConfig = getAccountViewConfig(catalog, channelConfig, normalizedAccountId);

      const values = Object.fromEntries(
        catalog.credentialFields.map((field) => [field.key, readCredentialValue(field, readFieldValue(field, accountConfig))])
      );

      return {
        checkedAt: new Date().toISOString(),
        channelType: normalizedType,
        accountId: normalizedAccountId,
        values,
      };
    },

    async getAccountAccess(channelType: string, accountId: string): Promise<ChannelAccountAccessPayload> {
      const normalizedType = normalizeString(channelType);
      const normalizedAccountId = validateAccountId(accountId);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      ensureAccountProfile(catalog, channelConfig, normalizedType, normalizedAccountId);
      const accountConfig = getAccountViewConfig(catalog, channelConfig, normalizedAccountId);
      const pairing = await this.getPairing(normalizedType, normalizedAccountId);
      const defaultOverride = getAccountRaw(channelConfig, 'default');
      const groupAllowFrom = normalizedAccountId === 'default' && catalog.defaultAccountConfigScope === 'channel'
        ? Array.isArray(defaultOverride?.groupAllowFrom)
          ? normalizeStringList(defaultOverride.groupAllowFrom)
          : normalizeStringList(channelConfig.groupAllowFrom)
        : Array.isArray(accountConfig.groupAllowFrom)
          ? normalizeStringList(accountConfig.groupAllowFrom)
          : normalizeStringList(channelConfig.groupAllowFrom);

      return {
        checkedAt: new Date().toISOString(),
        channelType: normalizedType,
        accountId: normalizedAccountId,
        dmPolicy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, normalizedAccountId, 'dmPolicy')),
        groupPolicy: normalizeOptionalString(resolveEffectiveSetting(channelConfig, accountConfig, normalizedAccountId, 'groupPolicy')),
        allowFrom: readAllowFrom(config, normalizedType, normalizedAccountId),
        groupAllowFrom,
        pairing,
      };
    },

    async updateAccountAccess(channelType: string, accountId: string, payload: ChannelAccessUpdatePayload): Promise<{
      success: boolean;
      message: string;
      access: ChannelAccountAccessPayload;
    }> {
      const normalizedType = normalizeString(channelType);
      const normalizedAccountId = validateAccountId(accountId);
      const openclawConfig = readOpenClawConfig(config);
      const channelConfig = ensureChannel(openclawConfig, normalizedType);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      ensureAccountProfile(catalog, channelConfig, normalizedType, normalizedAccountId);
      const accountConfig = ensureWritableAccountConfig(catalog, channelConfig, normalizedType, normalizedAccountId, {
        createIfMissing: normalizedAccountId === 'default',
      });

      writeAllowFrom(config, normalizedType, normalizedAccountId, payload.allowFrom);

      const groupAllowFrom = normalizeStringList(payload.groupAllowFrom);
      if (normalizedAccountId === 'default' && catalog.defaultAccountConfigScope === 'channel') {
        if (groupAllowFrom.length) {
          channelConfig.groupAllowFrom = groupAllowFrom;
        } else {
          delete channelConfig.groupAllowFrom;
        }
        pruneDefaultAccountOverride(channelConfig, catalog, ['groupAllowFrom']);
      } else {
        if (groupAllowFrom.length) {
          accountConfig.groupAllowFrom = groupAllowFrom;
        } else {
          delete accountConfig.groupAllowFrom;
        }
      }

      writeJsonFile(config.openclawConfigFile, openclawConfig);

      return {
        success: true,
        message: `Access rules for '${normalizedType}/${normalizedAccountId}' updated`,
        access: await this.getAccountAccess(normalizedType, normalizedAccountId),
      };
    },

    async getPairing(channelType: string, accountId: string | null = null): Promise<ChannelPairingPayload> {
      const normalizedType = normalizeString(channelType);
      const openclawConfig = readOpenClawConfig(config);
      const catalog = getCatalogEntry(config, openclawConfig, normalizedType);
      if (!catalog.pairingSupported) {
        return {
          checkedAt: new Date().toISOString(),
          channelType: normalizedType,
          accountId,
          supported: false,
          source: 'file',
          requests: [],
          error: null,
        };
      }

      const viaCli = await execPairingList(normalizedType, accountId);
      if (viaCli.source === 'cli' && !viaCli.error) return viaCli;

      return {
        checkedAt: new Date().toISOString(),
        channelType: normalizedType,
        accountId,
        supported: true,
        source: 'file',
        requests: mapPairingRequests(readRawPairingRequests(config, normalizedType), accountId),
        error: viaCli.error,
      };
    },

    async approvePairing(channelType: string, payload: ChannelPairingApprovePayload): Promise<ChannelPairingApproveResponse> {
      const normalizedType = normalizeString(channelType);
      const accountId = normalizeOptionalString(payload.accountId);
      const code = normalizeString(payload.code).toUpperCase();
      if (!code) {
        throw new ChannelServiceError(400, 'missing_code', 'Pairing code is required');
      }

      await execPairingApprove(normalizedType, accountId, code, payload.notify === true);

      return {
        success: true,
        message: `Pairing code '${code}' approved`,
        pairing: await this.getPairing(normalizedType, accountId),
      };
    },

    createBinding(input: ChannelBindingInput): ChannelsMutationResponse {
      const openclawConfig = readOpenClawConfig(config);
      const binding = buildBindingRaw(input);
      validateAgentId(openclawConfig, binding.agentId);
      const channelConfig = ensureChannel(openclawConfig, binding.match.channel);
      if (binding.match.accountId) {
        const catalog = getCatalogEntry(config, openclawConfig, binding.match.channel);
        ensureAccountProfile(catalog, channelConfig, binding.match.channel, binding.match.accountId);
      }

      openclawConfig.bindings = Array.isArray(openclawConfig.bindings) ? openclawConfig.bindings : [];
      const nextId = buildBindingId(binding);
      const exists = openclawConfig.bindings.some((candidate: Record<string, any>) => buildBindingId(candidate) === nextId);
      if (exists) {
        throw new ChannelServiceError(409, 'binding_exists', 'Binding already exists');
      }

      openclawConfig.bindings.push(binding);
      return saveAndBuild(openclawConfig, 'Binding created');
    },

    updateBinding(bindingId: string, input: ChannelBindingInput): ChannelsMutationResponse {
      const normalizedBindingId = normalizeString(bindingId);
      const openclawConfig = readOpenClawConfig(config);
      openclawConfig.bindings = Array.isArray(openclawConfig.bindings) ? openclawConfig.bindings : [];

      const currentIndex = openclawConfig.bindings.findIndex((binding: Record<string, any>) => buildBindingId(binding) === normalizedBindingId);
      if (currentIndex < 0) {
        throw new ChannelServiceError(404, 'binding_not_found', 'Binding not found');
      }

      const binding = buildBindingRaw(input);
      validateAgentId(openclawConfig, binding.agentId);
      const channelConfig = ensureChannel(openclawConfig, binding.match.channel);
      if (binding.match.accountId) {
        const catalog = getCatalogEntry(config, openclawConfig, binding.match.channel);
        ensureAccountProfile(catalog, channelConfig, binding.match.channel, binding.match.accountId);
      }

      const nextId = buildBindingId(binding);
      const exists = openclawConfig.bindings.some((candidate: Record<string, any>, index: number) =>
        index !== currentIndex && buildBindingId(candidate) === nextId
      );
      if (exists) {
        throw new ChannelServiceError(409, 'binding_exists', 'Binding already exists');
      }

      openclawConfig.bindings[currentIndex] = binding;
      return saveAndBuild(openclawConfig, 'Binding updated');
    },

    deleteBinding(bindingId: string): ChannelsMutationResponse {
      const normalizedBindingId = normalizeString(bindingId);
      const openclawConfig = readOpenClawConfig(config);
      openclawConfig.bindings = Array.isArray(openclawConfig.bindings) ? openclawConfig.bindings : [];
      const before = openclawConfig.bindings.length;
      openclawConfig.bindings = openclawConfig.bindings.filter((binding: Record<string, any>) => buildBindingId(binding) !== normalizedBindingId);

      if (openclawConfig.bindings.length === before) {
        throw new ChannelServiceError(404, 'binding_not_found', 'Binding not found');
      }

      return saveAndBuild(openclawConfig, 'Binding deleted');
    },
  };
}
