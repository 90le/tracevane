import type { ChatUsageSummary } from '../../../../../types/chat';

type LocalizedText = {
  zh: string;
  en: string;
};

type ExecTarget = 'auto' | 'sandbox' | 'gateway' | 'node';
type ExecSecurity = 'deny' | 'allowlist' | 'full';
type ExecAsk = 'off' | 'on-miss' | 'always';

type GatewaySessionRow = {
  key?: string;
  label?: string | null;
  status?: string | null;
  endedAt?: string | null;
  spawnedBy?: string | null;
  model?: string | null;
  modelProvider?: string | null;
  thinkingLevel?: string | null;
  verboseLevel?: string | null;
  reasoningLevel?: string | null;
  elevatedLevel?: string | null;
  responseUsage?: string | null;
  sendPolicy?: string | null;
  groupActivation?: string | null;
  fastMode?: boolean | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  contextTokens?: number | null;
};

type GatewaySessionsListResult = {
  sessions?: GatewaySessionRow[];
  defaults?: {
    model?: string | null;
  };
};

type GatewayModelListResult = {
  models?: Array<{
    id?: string;
    name?: string | null;
    provider?: string | null;
    contextWindow?: number | null;
    reasoning?: boolean | null;
  }>;
};

type GatewayAgentsListResult = {
  agents?: Array<{
    id?: string;
    name?: string | null;
    identity?: {
      name?: string | null;
    } | null;
  }>;
  defaultId?: string | null;
};

type GatewayToolsEffectiveResult = {
  agentId?: string | null;
  groups?: Array<{
    id?: string | null;
    label?: string | null;
    tools?: Array<{
      id?: string | null;
      label?: string | null;
      description?: string | null;
    }>;
  }>;
};

type GatewaySkillsStatusResult = {
  skills?: Array<{
    name?: string | null;
    description?: string | null;
    bundled?: boolean | null;
    disabled?: boolean | null;
    blockedByAllowlist?: boolean | null;
    eligible?: boolean | null;
    install?: Array<{
      id?: string | null;
      kind?: string | null;
      label?: string | null;
    }> | null;
  }>;
};

type GatewayTtsStatusResult = {
  enabled?: boolean | null;
  auto?: string | null;
  provider?: string | null;
  fallbackProvider?: string | null;
  fallbackProviders?: string[] | null;
  prefsPath?: string | null;
  providerStates?: Array<{
    id?: string | null;
    label?: string | null;
    configured?: boolean | null;
  }> | null;
};

type GatewayTtsProvidersResult = {
  active?: string | null;
  providers?: Array<{
    id?: string | null;
    name?: string | null;
    configured?: boolean | null;
    models?: string[] | null;
    voices?: string[] | null;
  }> | null;
};

type GatewayExecApprovalListItem = {
  id?: string | null;
  request?: {
    command?: string | null;
    commandPreview?: string | null;
    host?: string | null;
    nodeId?: string | null;
    agentId?: string | null;
  } | null;
};

type GatewayPluginApprovalListItem = {
  id?: string | null;
  request?: {
    title?: string | null;
    pluginId?: string | null;
    severity?: string | null;
    toolName?: string | null;
  } | null;
};

type GatewayExecApprovalsAllowlistEntry = {
  pattern?: string | null;
  lastUsedAt?: number | null;
};

type GatewayExecApprovalsAgent = {
  security?: string | null;
  ask?: string | null;
  askFallback?: string | null;
  autoAllowSkills?: boolean | null;
  allowlist?: GatewayExecApprovalsAllowlistEntry[] | null;
};

type GatewayExecApprovalsFile = {
  version?: number | null;
  defaults?: Record<string, unknown> | null;
  agents?: Record<string, GatewayExecApprovalsAgent> | null;
  socket?: Record<string, unknown> | null;
};

type GatewayExecApprovalsSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  hash?: string | null;
  file?: GatewayExecApprovalsFile | null;
};

type GatewayConfigSnapshot = {
  path?: string | null;
  exists?: boolean | null;
  hash?: string | null;
  valid?: boolean | null;
  config?: Record<string, unknown> | null;
  issues?: Array<{
    path?: string | null;
    message?: string | null;
  }> | null;
};

type GatewayConfigSchemaLookupResult = {
  path?: string | null;
  hintPath?: string | null;
  children?: Array<{
    key?: string | null;
    path?: string | null;
  }> | null;
};

export interface StudioSlashLocalGatewayClient {
  request<T>(method: string, params: unknown): Promise<T>;
}

export interface StudioSlashLocalExecutionContext {
  usage?: ChatUsageSummary | null;
  modelCandidates?: string[];
  activeRunId?: string | null;
  messageCount?: number | null;
  queueLength?: number | null;
  realtimeReady?: boolean | null;
  transportMode?: string | null;
  exposureKind?: string | null;
}

export interface StudioSlashLocalExecutionResult {
  phase: 'accepted' | 'completed' | 'error';
  detail: LocalizedText;
  runId?: string | null;
  refresh?: 'sessions' | 'conversation';
}

const DEFAULT_AGENT_ID = 'main';
const DEFAULT_MAIN_KEY = 'main';
const EXEC_OPTIONS_HINT_ZH = 'host=auto|sandbox|gateway|node，security=deny|allowlist|full，ask=off|on-miss|always，node=<id>';
const EXEC_OPTIONS_HINT_EN = 'host=auto|sandbox|gateway|node, security=deny|allowlist|full, ask=off|on-miss|always, node=<id>';
const APPROVE_USAGE_HINT_ZH = '用法：/approve <id> <allow|always|deny>';
const APPROVE_USAGE_HINT_EN = 'Usage: /approve <id> <allow|always|deny>';
const ALLOWLIST_USAGE_HINT_ZH = '用法：/allowlist [list] [agent=<id>] [node=<id>|gateway]；/allowlist add|remove <pattern> [agent=<id>] [node=<id>|gateway]';
const ALLOWLIST_USAGE_HINT_EN = 'Usage: /allowlist [list] [agent=<id>] [node=<id>|gateway]; /allowlist add|remove <pattern> [agent=<id>] [node=<id>|gateway]';

type ParsedAllowlistArgs =
  | {
    kind: 'help';
  }
  | {
    kind: 'fallback';
  }
  | {
    kind: 'list' | 'add' | 'remove';
    agentKey: string | null;
    nodeId: string | null;
    pattern: string | null;
  }
  | {
    kind: 'error';
    detail: LocalizedText;
  };

const APPROVE_DECISION_ALIASES: Record<string, 'allow-once' | 'allow-always' | 'deny'> = {
  allow: 'allow-once',
  once: 'allow-once',
  'allow-once': 'allow-once',
  allowonce: 'allow-once',
  always: 'allow-always',
  'allow-always': 'allow-always',
  allowalways: 'allow-always',
  deny: 'deny',
  reject: 'deny',
  block: 'deny',
};

const TASK_STATUS_LABELS: Record<string, LocalizedText> = {
  queued: pair('排队', 'queued'),
  running: pair('运行中', 'running'),
  completed: pair('已完成', 'completed'),
  succeeded: pair('已成功', 'succeeded'),
  failed: pair('失败', 'failed'),
  cancelled: pair('已取消', 'cancelled'),
  aborted: pair('已中止', 'aborted'),
  error: pair('错误', 'error'),
};

function pair(zh: string, en: string): LocalizedText {
  return { zh, en };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function buildAllowlistUsageDetail(): LocalizedText {
  return pair(ALLOWLIST_USAGE_HINT_ZH, ALLOWLIST_USAGE_HINT_EN);
}

function isHostChannelAllowlistToken(token: string): boolean {
  const normalized = normalizeLower(token);
  if (!normalized) {
    return false;
  }
  if (
    normalized === 'dm'
    || normalized === 'group'
    || normalized === 'all'
    || normalized === 'resolve'
    || normalized === '--resolve'
    || normalized === 'config'
    || normalized === '--config'
    || normalized === 'store'
    || normalized === '--store'
    || normalized === '--channel'
    || normalized === '--account'
  ) {
    return true;
  }
  return normalized.startsWith('scope=')
    || normalized.startsWith('channel=')
    || normalized.startsWith('account=');
}

function normalizeExecApprovalsFile(file: GatewayExecApprovalsFile | null | undefined): GatewayExecApprovalsFile {
  const normalized: GatewayExecApprovalsFile = {
    version: 1,
    agents: {},
  };
  if (file?.defaults && typeof file.defaults === 'object') {
    normalized.defaults = { ...file.defaults };
  }
  if (file?.socket && typeof file.socket === 'object') {
    normalized.socket = { ...file.socket };
  }
  if (file?.agents && typeof file.agents === 'object') {
    for (const [key, value] of Object.entries(file.agents)) {
      const normalizedKey = normalizeString(key);
      if (!normalizedKey) {
        continue;
      }
      const agent: GatewayExecApprovalsAgent = {};
      const security = normalizeString(value?.security);
      const ask = normalizeString(value?.ask);
      const askFallback = normalizeString(value?.askFallback);
      if (security) {
        agent.security = security;
      }
      if (ask) {
        agent.ask = ask;
      }
      if (askFallback) {
        agent.askFallback = askFallback;
      }
      if (typeof value?.autoAllowSkills === 'boolean') {
        agent.autoAllowSkills = value.autoAllowSkills;
      }
      if (Array.isArray(value?.allowlist)) {
        const allowlist = value.allowlist
          .map((entry) => {
            const pattern = normalizeString(entry?.pattern);
            if (!pattern) {
              return null;
            }
            const cleaned: GatewayExecApprovalsAllowlistEntry = { pattern };
            if (typeof entry?.lastUsedAt === 'number' && Number.isFinite(entry.lastUsedAt)) {
              cleaned.lastUsedAt = entry.lastUsedAt;
            }
            return cleaned;
          })
          .filter((entry): entry is GatewayExecApprovalsAllowlistEntry => Boolean(entry));
        if (allowlist.length) {
          agent.allowlist = allowlist;
        }
      }
      normalized.agents![normalizedKey] = agent;
    }
  }
  return normalized;
}

function isExecApprovalsAgentEmpty(agent: GatewayExecApprovalsAgent | null | undefined): boolean {
  const allowlistCount = Array.isArray(agent?.allowlist)
    ? agent.allowlist.filter((entry) => normalizeString(entry?.pattern)).length
    : 0;
  return !normalizeString(agent?.security)
    && !normalizeString(agent?.ask)
    && !normalizeString(agent?.askFallback)
    && agent?.autoAllowSkills == null
    && allowlistCount === 0;
}

function parseAllowlistArgs(args: string): ParsedAllowlistArgs {
  const trimmed = normalizeString(args);
  if (!trimmed) {
    return { kind: 'list', agentKey: null, nodeId: null, pattern: null };
  }
  const normalizedWhole = normalizeLower(trimmed);
  if (normalizedWhole === 'help' || normalizedWhole === '--help' || normalizedWhole === '?') {
    return { kind: 'help' };
  }

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let index = 0;
  let action: 'list' | 'add' | 'remove' = 'list';
  const maybeAction = normalizeLower(tokens[index]);
  if (maybeAction === 'list' || maybeAction === 'add' || maybeAction === 'remove') {
    action = maybeAction;
    index += 1;
  }

  if (isHostChannelAllowlistToken(tokens[index] || '')) {
    return { kind: 'fallback' };
  }

  let agentKey: string | null = null;
  let nodeId: string | null = null;
  const patternTokens: string[] = [];

  while (index < tokens.length) {
    const token = tokens[index] || '';
    const normalized = normalizeLower(token);
    if (!normalized) {
      index += 1;
      continue;
    }
    if (isHostChannelAllowlistToken(token)) {
      return { kind: 'fallback' };
    }
    if (normalized === 'gateway' || normalized === '--gateway') {
      if (nodeId) {
        return {
          kind: 'error',
          detail: pair('allowlist 不能同时指定 gateway 和 node。', 'Allowlist cannot target both gateway and node at the same time.'),
        };
      }
      index += 1;
      continue;
    }
    if (normalized === '--agent') {
      const nextValue = normalizeString(tokens[index + 1]);
      if (!nextValue) {
        return { kind: 'error', detail: buildAllowlistUsageDetail() };
      }
      agentKey = nextValue;
      index += 2;
      continue;
    }
    if (normalized.startsWith('agent=')) {
      const value = normalizeString(token.slice(token.indexOf('=') + 1));
      if (!value) {
        return { kind: 'error', detail: buildAllowlistUsageDetail() };
      }
      agentKey = value;
      index += 1;
      continue;
    }
    if (normalized === '--node') {
      const nextValue = normalizeString(tokens[index + 1]);
      if (!nextValue) {
        return { kind: 'error', detail: buildAllowlistUsageDetail() };
      }
      nodeId = nextValue;
      index += 2;
      continue;
    }
    if (normalized.startsWith('node=')) {
      const value = normalizeString(token.slice(token.indexOf('=') + 1));
      if (!value) {
        return { kind: 'error', detail: buildAllowlistUsageDetail() };
      }
      nodeId = value;
      index += 1;
      continue;
    }
    if (normalized.startsWith('--')) {
      return { kind: 'error', detail: buildAllowlistUsageDetail() };
    }
    patternTokens.push(token);
    index += 1;
  }

  if (action === 'list') {
    if (patternTokens.length > 0) {
      return { kind: 'error', detail: buildAllowlistUsageDetail() };
    }
    return {
      kind: 'list',
      agentKey,
      nodeId,
      pattern: null,
    };
  }

  const pattern = patternTokens.join(' ').trim();
  if (!pattern) {
    return { kind: 'error', detail: buildAllowlistUsageDetail() };
  }
  return {
    kind: action,
    agentKey,
    nodeId,
    pattern,
  };
}

function normalizeExecTarget(value: unknown): ExecTarget | undefined {
  const normalized = normalizeLower(value);
  if (
    normalized === 'auto'
    || normalized === 'sandbox'
    || normalized === 'gateway'
    || normalized === 'node'
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeExecSecurity(value: unknown): ExecSecurity | undefined {
  const normalized = normalizeLower(value);
  if (normalized === 'deny' || normalized === 'allowlist' || normalized === 'full') {
    return normalized;
  }
  return undefined;
}

function normalizeExecAsk(value: unknown): ExecAsk | undefined {
  const normalized = normalizeLower(value);
  if (normalized === 'off' || normalized === 'on-miss' || normalized === 'always') {
    return normalized;
  }
  return undefined;
}

function deriveAgentIdFromSessionKey(sessionKey: string): string {
  const match = normalizeString(sessionKey).match(/^agent:([^:]+):/);
  return normalizeString(match?.[1]) || DEFAULT_AGENT_ID;
}

function skipDirectiveArgPrefix(raw: string): number {
  let i = 0;
  while (i < raw.length && /\s/u.test(raw[i] || '')) {
    i += 1;
  }
  if (raw[i] === ':') {
    i += 1;
    while (i < raw.length && /\s/u.test(raw[i] || '')) {
      i += 1;
    }
  }
  return i;
}

function takeDirectiveToken(raw: string, startIndex: number): { token: string | null; nextIndex: number } {
  let i = startIndex;
  while (i < raw.length && /\s/u.test(raw[i] || '')) {
    i += 1;
  }
  if (i >= raw.length) {
    return { token: null, nextIndex: i };
  }
  const start = i;
  while (i < raw.length && !/\s/u.test(raw[i] || '')) {
    i += 1;
  }
  const token = raw.slice(start, i);
  while (i < raw.length && /\s/u.test(raw[i] || '')) {
    i += 1;
  }
  return { token: token || null, nextIndex: i };
}

function splitExecDirectiveToken(token: string): { key: string; value: string } | null {
  const eq = token.indexOf('=');
  const colon = token.indexOf(':');
  const idx = eq === -1 ? colon : colon === -1 ? eq : Math.min(eq, colon);
  if (idx === -1) {
    return null;
  }
  const key = normalizeLower(token.slice(0, idx));
  const value = token.slice(idx + 1).trim();
  if (!key) {
    return null;
  }
  return { key, value };
}

function buildExecFormatError(): LocalizedText {
  return pair(
    `当前 /exec 仅支持 key=value 形式。可直接使用：${EXEC_OPTIONS_HINT_ZH}。`,
    `This /exec implementation currently accepts key=value pairs only. Use: ${EXEC_OPTIONS_HINT_EN}.`,
  );
}

function parseExecDirectiveArgs(args: string): {
  hasExecOptions: boolean;
  patch: {
    execHost?: ExecTarget;
    execSecurity?: ExecSecurity;
    execAsk?: ExecAsk;
    execNode?: string;
  };
  error?: LocalizedText;
} {
  let i = skipDirectiveArgPrefix(args);
  const patch: {
    execHost?: ExecTarget;
    execSecurity?: ExecSecurity;
    execAsk?: ExecAsk;
    execNode?: string;
  } = {};
  let hasExecOptions = false;

  while (i < args.length) {
    const { token, nextIndex } = takeDirectiveToken(args, i);
    i = nextIndex;
    if (!token) {
      break;
    }
    const parsed = splitExecDirectiveToken(token);
    if (!parsed) {
      return {
        hasExecOptions,
        patch,
        error: buildExecFormatError(),
      };
    }
    const { key, value } = parsed;
    if (key === 'host') {
      const normalized = normalizeExecTarget(value);
      if (!normalized) {
        return {
          hasExecOptions: true,
          patch,
          error: pair(
            `无法识别的 exec host：${value || '(empty)'}。可选项：auto、sandbox、gateway、node。`,
            `Unrecognized exec host "${value || ''}". Valid hosts: auto, sandbox, gateway, node.`,
          ),
        };
      }
      patch.execHost = normalized;
      hasExecOptions = true;
      continue;
    }
    if (key === 'security') {
      const normalized = normalizeExecSecurity(value);
      if (!normalized) {
        return {
          hasExecOptions: true,
          patch,
          error: pair(
            `无法识别的 exec security：${value || '(empty)'}。可选项：deny、allowlist、full。`,
            `Unrecognized exec security "${value || ''}". Valid: deny, allowlist, full.`,
          ),
        };
      }
      patch.execSecurity = normalized;
      hasExecOptions = true;
      continue;
    }
    if (key === 'ask') {
      const normalized = normalizeExecAsk(value);
      if (!normalized) {
        return {
          hasExecOptions: true,
          patch,
          error: pair(
            `无法识别的 exec ask：${value || '(empty)'}。可选项：off、on-miss、always。`,
            `Unrecognized exec ask "${value || ''}". Valid: off, on-miss, always.`,
          ),
        };
      }
      patch.execAsk = normalized;
      hasExecOptions = true;
      continue;
    }
    if (key === 'node') {
      const normalized = normalizeString(value);
      if (!normalized) {
        return {
          hasExecOptions: true,
          patch,
          error: pair('exec node 需要非空值。', 'Exec node requires a value.'),
        };
      }
      patch.execNode = normalized;
      hasExecOptions = true;
      continue;
    }
    return {
      hasExecOptions: true,
      patch,
      error: buildExecFormatError(),
    };
  }

  return { hasExecOptions, patch };
}

function formatTokenCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(value);
}

function formatTtsStatusSummary(result: GatewayTtsStatusResult): LocalizedText {
  const enabled = result.enabled === true;
  const enabledZh = enabled ? '已开启' : '已关闭';
  const enabledEn = enabled ? 'enabled' : 'disabled';
  const provider = normalizeString(result.provider) || 'default';
  const auto = normalizeString(result.auto) || 'default';
  const fallback = normalizeString(result.fallbackProvider)
    || (Array.isArray(result.fallbackProviders) ? normalizeString(result.fallbackProviders[0]) : '')
    || 'none';
  const providers = (result.providerStates || [])
    .map((item) => ({
      id: normalizeString(item.id),
      label: normalizeString(item.label) || normalizeString(item.id),
      configured: item.configured === true,
    }))
    .filter((item) => item.id || item.label);
  const providerPreviewZh = providers.slice(0, 4).map((item) => (
    `${item.label || item.id}${item.configured ? '（已配置）' : '（未配置）'}`
  ));
  const providerPreviewEn = providers.slice(0, 4).map((item) => (
    `${item.label || item.id}${item.configured ? ' (configured)' : ' (not configured)'}`
  ));
  const providerTailZh = providers.length > 4 ? ` 等 ${providers.length} 个` : '';
  const providerTailEn = providers.length > 4 ? ` and ${providers.length - 4} more` : '';

  return pair(
    providerPreviewZh.length
      ? `当前 TTS ${enabledZh}；provider=${provider}；auto=${auto}；fallback=${fallback}；提供方：${providerPreviewZh.join('、')}${providerTailZh}。`
      : `当前 TTS ${enabledZh}；provider=${provider}；auto=${auto}；fallback=${fallback}。`,
    providerPreviewEn.length
      ? `TTS is currently ${enabledEn}; provider=${provider}; auto=${auto}; fallback=${fallback}; providers: ${providerPreviewEn.join(', ')}${providerTailEn}.`
      : `TTS is currently ${enabledEn}; provider=${provider}; auto=${auto}; fallback=${fallback}.`,
  );
}

function formatTtsProvidersSummary(result: GatewayTtsProvidersResult): LocalizedText {
  const active = normalizeString(result.active) || 'default';
  const providers = (result.providers || [])
    .map((item) => ({
      id: normalizeString(item.id),
      name: normalizeString(item.name) || normalizeString(item.id),
      configured: item.configured === true,
      models: Array.isArray(item.models) ? item.models.filter((model) => normalizeString(model)).length : 0,
      voices: Array.isArray(item.voices) ? item.voices.filter((voice) => normalizeString(voice)).length : 0,
    }))
    .filter((item) => item.id || item.name);

  if (!providers.length) {
    return pair(
      `当前活跃 TTS provider 是 ${active}，但宿主未返回可用 provider 列表。`,
      `The active TTS provider is ${active}, but the host returned no provider catalog.`,
    );
  }

  const previewZh = providers.slice(0, 4).map((item) => (
    `${item.name}${item.id && item.id !== item.name ? `(${item.id})` : ''}${item.configured ? ' 已配置' : ' 未配置'}${item.models || item.voices ? `，模型 ${item.models}，音色 ${item.voices}` : ''}`
  ));
  const previewEn = providers.slice(0, 4).map((item) => (
    `${item.name}${item.id && item.id !== item.name ? ` (${item.id})` : ''}${item.configured ? ' configured' : ' not configured'}${item.models || item.voices ? `, ${item.models} model${item.models === 1 ? '' : 's'}, ${item.voices} voice${item.voices === 1 ? '' : 's'}` : ''}`
  ));

  return pair(
    `当前活跃 TTS provider 是 ${active}；可用 provider：${previewZh.join('；')}${providers.length > 4 ? `；等 ${providers.length} 个` : ''}。`,
    `Active TTS provider is ${active}; available providers: ${previewEn.join('; ')}${providers.length > 4 ? `; and ${providers.length - 4} more` : ''}.`,
  );
}

function generateClientRequestId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `studio-slash-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function executeForwardSlashCommand(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  commandName: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const suffix = normalizeString(args);
  const message = suffix ? `/${commandName} ${suffix}` : `/${commandName}`;
  const response = await client.request<{ runId?: string | null }>('chat.send', {
    sessionKey,
    message,
    deliver: true,
    idempotencyKey: generateClientRequestId(),
  });
  const runId = normalizeString(response?.runId);
  return {
    phase: runId ? 'accepted' : 'completed',
    runId: runId || null,
    detail: pair(
      `已提交 ${message}，等待宿主处理。`,
      `Submitted ${message}; waiting for the host to handle it.`,
    ),
  };
}

function isApprovalNotFoundErrorMessage(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /unknown or expired approval id/i.test(message);
}

function parseApproveArgs(args: string): {
  id: string;
  decision: 'allow-once' | 'allow-always' | 'deny';
} | LocalizedText | null {
  const trimmed = normalizeString(args);
  if (!trimmed) {
    return null;
  }
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return pair(APPROVE_USAGE_HINT_ZH, APPROVE_USAGE_HINT_EN);
  }

  const first = normalizeLower(tokens[0]);
  const second = normalizeLower(tokens[1]);

  if (APPROVE_DECISION_ALIASES[first]) {
    return {
      decision: APPROVE_DECISION_ALIASES[first],
      id: tokens.slice(1).join(' ').trim(),
    };
  }
  if (APPROVE_DECISION_ALIASES[second]) {
    return {
      decision: APPROVE_DECISION_ALIASES[second],
      id: tokens[0],
    };
  }
  return pair(APPROVE_USAGE_HINT_ZH, APPROVE_USAGE_HINT_EN);
}

function parseAgentSessionKey(
  sessionKey: string | undefined | null,
): { agentId: string; rest: string } | null {
  const raw = normalizeLower(sessionKey);
  if (!raw) {
    return null;
  }
  const parts = raw.split(':').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'agent') {
    return null;
  }
  const agentId = normalizeString(parts[1]);
  const rest = parts.slice(2).join(':');
  if (!agentId || !rest) {
    return null;
  }
  return { agentId, rest };
}

function isSubagentSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeLower(sessionKey);
  if (!raw) {
    return false;
  }
  if (raw.startsWith('subagent:')) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return normalizeLower(parsed?.rest).startsWith('subagent:');
}

function isAcpSessionKey(sessionKey: string | undefined | null): boolean {
  const raw = normalizeLower(sessionKey);
  if (!raw) {
    return false;
  }
  if (raw.startsWith('acp:')) {
    return true;
  }
  const parsed = parseAgentSessionKey(raw);
  return normalizeLower(parsed?.rest).startsWith('acp:');
}

function resolveEquivalentSessionKeys(
  currentSessionKey: string,
  currentAgentId: string | undefined,
): Set<string> {
  const keys = new Set<string>([currentSessionKey]);
  if (currentAgentId === DEFAULT_AGENT_ID) {
    const canonicalDefaultMain = `agent:${DEFAULT_AGENT_ID}:main`;
    if (currentSessionKey === DEFAULT_MAIN_KEY) {
      keys.add(canonicalDefaultMain);
    } else if (currentSessionKey === canonicalDefaultMain) {
      keys.add(DEFAULT_MAIN_KEY);
    }
  }
  return keys;
}

function buildSessionIndex(sessions: GatewaySessionRow[]): Map<string, GatewaySessionRow> {
  const index = new Map<string, GatewaySessionRow>();
  for (const session of sessions) {
    const key = normalizeLower(session?.key);
    if (!key) {
      continue;
    }
    index.set(key, session);
  }
  return index;
}

function isWithinCurrentSessionSubtree(
  candidateSessionKey: string,
  currentSessionKey: string,
  sessionIndex: Map<string, GatewaySessionRow>,
  currentAgentId: string | undefined,
  candidateAgentId: string | undefined,
): boolean {
  if (!currentAgentId || candidateAgentId !== currentAgentId) {
    return false;
  }

  const currentAliases = resolveEquivalentSessionKeys(currentSessionKey, currentAgentId);
  const seen = new Set<string>();
  let parentSessionKey = normalizeLower(sessionIndex.get(candidateSessionKey)?.spawnedBy);
  while (parentSessionKey && !seen.has(parentSessionKey)) {
    if (currentAliases.has(parentSessionKey)) {
      return true;
    }
    seen.add(parentSessionKey);
    parentSessionKey = normalizeLower(sessionIndex.get(parentSessionKey)?.spawnedBy);
  }

  return isSubagentSessionKey(currentSessionKey)
    ? candidateSessionKey.startsWith(`${currentSessionKey}:subagent:`)
    : false;
}

function resolveCurrentSession(
  sessions: GatewaySessionsListResult | undefined,
  sessionKey: string,
): GatewaySessionRow | undefined {
  const normalizedSessionKey = normalizeLower(sessionKey);
  const currentAgentId =
    parseAgentSessionKey(normalizedSessionKey)?.agentId
    || (normalizedSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const aliases = normalizedSessionKey
    ? resolveEquivalentSessionKeys(normalizedSessionKey, currentAgentId)
    : new Set<string>();
  return sessions?.sessions?.find((session) => aliases.has(normalizeLower(session.key)));
}

function resolveKillTargets(
  sessions: GatewaySessionRow[],
  currentSessionKey: string,
  target: string,
): string[] {
  const normalizedTarget = normalizeLower(target);
  if (!normalizedTarget) {
    return [];
  }

  const keys = new Set<string>();
  const normalizedCurrentSessionKey = normalizeLower(currentSessionKey);
  const currentParsed = parseAgentSessionKey(normalizedCurrentSessionKey);
  const currentAgentId =
    currentParsed?.agentId
    || (normalizedCurrentSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const sessionIndex = buildSessionIndex(sessions);

  for (const session of sessions) {
    const key = normalizeString(session?.key);
    if (!key || !isSubagentSessionKey(key)) {
      continue;
    }
    const normalizedKey = normalizeLower(key);
    const parsed = parseAgentSessionKey(normalizedKey);
    const belongsToCurrentSession = isWithinCurrentSessionSubtree(
      normalizedKey,
      normalizedCurrentSessionKey,
      sessionIndex,
      currentAgentId,
      parsed?.agentId,
    );
    const isMatch =
      (normalizedTarget === 'all' && belongsToCurrentSession)
      || (belongsToCurrentSession && normalizedKey === normalizedTarget)
      || (belongsToCurrentSession
        && (normalizedKey.endsWith(`:subagent:${normalizedTarget}`) || normalizedKey === `subagent:${normalizedTarget}`));
    if (isMatch) {
      keys.add(key);
    }
  }
  return [...keys];
}

function resolveSteerSubagent(
  sessions: GatewaySessionRow[],
  currentSessionKey: string,
  target: string,
): string[] {
  const normalizedTarget = normalizeLower(target);
  if (!normalizedTarget) {
    return [];
  }

  const normalizedCurrentSessionKey = normalizeLower(currentSessionKey);
  const currentParsed = parseAgentSessionKey(normalizedCurrentSessionKey);
  const currentAgentId =
    currentParsed?.agentId
    || (normalizedCurrentSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const sessionIndex = buildSessionIndex(sessions);
  const keys = new Set<string>();

  for (const session of sessions) {
    const key = normalizeString(session?.key);
    if (!key || !isSubagentSessionKey(key)) {
      continue;
    }
    const normalizedKey = normalizeLower(key);
    const parsed = parseAgentSessionKey(normalizedKey);
    const belongsToCurrentSession = isWithinCurrentSessionSubtree(
      normalizedKey,
      normalizedCurrentSessionKey,
      sessionIndex,
      currentAgentId,
      parsed?.agentId,
    );
    if (!belongsToCurrentSession) {
      continue;
    }
    const isMatch =
      normalizedKey === normalizedTarget
      || normalizedKey.endsWith(`:subagent:${normalizedTarget}`)
      || normalizedKey === `subagent:${normalizedTarget}`
      || normalizeLower(session.label) === normalizedTarget;
    if (isMatch) {
      keys.add(key);
    }
  }

  return [...keys];
}

function isActiveSteerSession(session: GatewaySessionRow | undefined): boolean {
  return normalizeLower(session?.status) === 'running' && !normalizeString(session?.endedAt);
}

function formatTaskStatus(status: string, locale: 'zh' | 'en'): string {
  const normalized = normalizeLower(status);
  const mapped = TASK_STATUS_LABELS[normalized];
  if (mapped) {
    return locale === 'zh' ? mapped.zh : mapped.en;
  }
  return normalized || (locale === 'zh' ? '未知' : 'unknown');
}

function buildTaskStatusBreakdown(subagents: GatewaySessionRow[], locale: 'zh' | 'en'): string {
  const counts = new Map<string, number>();
  for (const session of subagents) {
    const status = normalizeLower(session.status) || 'unknown';
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const ordered = ['running', 'queued', 'failed', 'completed', 'cancelled', 'aborted'];
  const parts = ordered
    .filter((status) => counts.has(status))
    .map((status) => (
      locale === 'zh'
        ? `${formatTaskStatus(status, locale)} ${counts.get(status)}`
        : `${counts.get(status)} ${formatTaskStatus(status, locale)}`
    ));
  return parts.join(locale === 'zh' ? '，' : ', ');
}

function normalizeOptionalCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function formatUsageSummaryText(
  usage: ChatUsageSummary | null | undefined,
  locale: 'zh' | 'en',
): string | null {
  if (!usage) return null;
  const parts: string[] = [];
  if (typeof usage.inputTokens === 'number' && Number.isFinite(usage.inputTokens)) {
    parts.push(locale === 'zh' ? `输入 ${formatTokenCount(usage.inputTokens)}` : `input ${formatTokenCount(usage.inputTokens)}`);
  }
  if (typeof usage.outputTokens === 'number' && Number.isFinite(usage.outputTokens)) {
    parts.push(locale === 'zh' ? `输出 ${formatTokenCount(usage.outputTokens)}` : `output ${formatTokenCount(usage.outputTokens)}`);
  }
  if (typeof usage.totalTokens === 'number' && Number.isFinite(usage.totalTokens)) {
    parts.push(locale === 'zh' ? `总计 ${formatTokenCount(usage.totalTokens)}` : `total ${formatTokenCount(usage.totalTokens)}`);
  }
  if (typeof usage.cacheReadTokens === 'number' && Number.isFinite(usage.cacheReadTokens) && usage.cacheReadTokens > 0) {
    parts.push(locale === 'zh' ? `缓存读 ${formatTokenCount(usage.cacheReadTokens)}` : `cache read ${formatTokenCount(usage.cacheReadTokens)}`);
  }
  if (typeof usage.cacheWriteTokens === 'number' && Number.isFinite(usage.cacheWriteTokens) && usage.cacheWriteTokens > 0) {
    parts.push(locale === 'zh' ? `缓存写 ${formatTokenCount(usage.cacheWriteTokens)}` : `cache write ${formatTokenCount(usage.cacheWriteTokens)}`);
  }
  if (typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd)) {
    parts.push(locale === 'zh' ? `成本 $${usage.costUsd.toFixed(4)}` : `cost $${usage.costUsd.toFixed(4)}`);
  }
  return parts.length ? parts.join(locale === 'zh' ? '，' : ', ') : null;
}

function listCurrentSessionSubagents(
  sessions: GatewaySessionRow[],
  currentSessionKey: string,
): GatewaySessionRow[] {
  const normalizedCurrentSessionKey = normalizeLower(currentSessionKey);
  const currentParsed = parseAgentSessionKey(normalizedCurrentSessionKey);
  const currentAgentId =
    currentParsed?.agentId
    || (normalizedCurrentSessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : undefined);
  const sessionIndex = buildSessionIndex(sessions);

  return sessions.filter((session) => {
    const key = normalizeLower(session?.key);
    if (!key || !isSubagentSessionKey(key)) {
      return false;
    }
    const parsed = parseAgentSessionKey(key);
    return isWithinCurrentSessionSubtree(
      key,
      normalizedCurrentSessionKey,
      sessionIndex,
      currentAgentId,
      parsed?.agentId,
    );
  });
}

async function executeContext(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args || 'list') || 'list';
  if (mode === 'help') {
    return {
      phase: 'completed',
      detail: pair(
        [
          'Studio Chat /context 会显示当前 surface 上能确定的上下文摘要。',
          '支持：/context、/context list、/context detail、/context json。',
          '这里展示的是当前会话、消息数量、待发送队列、活跃 run、子代理与 usage 概览，不伪造宿主内部精确 prompt 预算。',
        ].join('\n'),
        [
          'Studio Chat /context shows the context that this surface can determine locally.',
          'Supported: /context, /context list, /context detail, /context json.',
          'It covers the current session, visible messages, queued sends, active run, subagents, and usage summary without faking the host-only prompt budget report.',
        ].join('\n'),
      ),
    };
  }
  if (mode !== 'list' && mode !== 'show' && mode !== 'detail' && mode !== 'deep' && mode !== 'json') {
    return {
      phase: 'error',
      detail: pair(
        '用法：/context [list|detail|json|help]',
        'Usage: /context [list|detail|json|help]',
      ),
    };
  }

  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const current = resolveCurrentSession(sessions, sessionKey);
  const subagents = listCurrentSessionSubagents(sessions?.sessions || [], sessionKey);
  const parsedSession = parseAgentSessionKey(sessionKey);
  const agentId = parsedSession?.agentId || (sessionKey === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : 'unknown');
  const label = normalizeString(current?.label) || sessionKey;
  const status = formatTaskStatus(normalizeString(current?.status), 'en');
  const messageCount = normalizeOptionalCount(context.messageCount);
  const queueLength = normalizeOptionalCount(context.queueLength);
  const activeRunId = normalizeString(context.activeRunId) || null;
  const usageZh = formatUsageSummaryText(context.usage, 'zh');
  const usageEn = formatUsageSummaryText(context.usage, 'en');
  const snapshot = {
    kind: 'studio-local-context',
    sessionKey,
    label,
    agentId,
    status: normalizeLower(current?.status) || null,
    activeRunId,
    messageCount,
    queueLength,
    subagentCount: subagents.length,
    subagents: subagents.slice(0, 6).map((session) => ({
      key: normalizeString(session.key),
      label: normalizeString(session.label) || normalizeString(session.key),
      status: normalizeLower(session.status) || 'unknown',
    })),
    model: normalizeString(current?.model) || null,
    modelProvider: normalizeString(current?.modelProvider) || null,
    thinkingLevel: normalizeString(current?.thinkingLevel) || null,
    verboseLevel: normalizeString(current?.verboseLevel) || null,
    reasoningLevel: normalizeString(current?.reasoningLevel) || null,
    elevatedLevel: normalizeString(current?.elevatedLevel) || null,
    responseUsage: normalizeString(current?.responseUsage) || null,
    sendPolicy: normalizeString(current?.sendPolicy) || null,
    groupActivation: normalizeString(current?.groupActivation) || null,
    fastMode: current?.fastMode === true,
    usage: context.usage || null,
  };

  if (mode === 'json') {
    const raw = JSON.stringify(snapshot, null, 2);
    return {
      phase: 'completed',
      detail: pair(raw, raw),
    };
  }

  const previewZh = subagents.slice(0, 4).map((session) => (
    `${normalizeString(session.label) || normalizeString(session.key)}（${formatTaskStatus(normalizeString(session.status), 'zh')}）`
  ));
  const previewEn = subagents.slice(0, 4).map((session) => (
    `${normalizeString(session.label) || normalizeString(session.key)} (${formatTaskStatus(normalizeString(session.status), 'en')})`
  ));

  if (mode === 'detail' || mode === 'deep') {
    return {
      phase: 'completed',
      detail: pair(
        [
          'Studio 上下文（本地摘要）',
          `会话：${label} (${sessionKey})`,
          `Agent：${agentId}`,
          `状态：${formatTaskStatus(normalizeString(current?.status), 'zh')}`,
          messageCount != null ? `可见消息 ${messageCount} 条` : '',
          queueLength != null ? `待发送队列 ${queueLength} 条` : '',
          activeRunId ? `活跃 run=${activeRunId}` : '',
          normalizeString(current?.model)
            ? `模型：${normalizeString(current?.model)}${normalizeString(current?.modelProvider) ? ` @ ${normalizeString(current?.modelProvider)}` : ''}`
            : '',
          [
            normalizeString(current?.thinkingLevel) ? `think=${normalizeString(current?.thinkingLevel)}` : '',
            normalizeString(current?.verboseLevel) ? `verbose=${normalizeString(current?.verboseLevel)}` : '',
            normalizeString(current?.reasoningLevel) ? `reasoning=${normalizeString(current?.reasoningLevel)}` : '',
            normalizeString(current?.elevatedLevel) ? `elevated=${normalizeString(current?.elevatedLevel)}` : '',
            current?.fastMode === true ? 'fast=on' : '',
          ].filter(Boolean).join('；'),
          [
            normalizeString(current?.sendPolicy) ? `send=${normalizeString(current?.sendPolicy)}` : '',
            normalizeString(current?.groupActivation) ? `activation=${normalizeString(current?.groupActivation)}` : '',
            normalizeString(current?.responseUsage) ? `usage=${normalizeString(current?.responseUsage)}` : '',
          ].filter(Boolean).join('；'),
          usageZh ? `Token：${usageZh}` : '',
          subagents.length
            ? `子代理 ${subagents.length} 个：${previewZh.join('、')}${subagents.length > previewZh.length ? ` 等 ${subagents.length} 个` : ''}`
            : '子代理：无',
          '说明：这是 Studio 当前 surface 可见上下文摘要，不是宿主内部精确 prompt 预算报告。',
        ].filter(Boolean).join('\n'),
        [
          'Studio context (local summary)',
          `Session: ${label} (${sessionKey})`,
          `Agent: ${agentId}`,
          `Status: ${status}`,
          messageCount != null ? `Visible messages: ${messageCount}` : '',
          queueLength != null ? `Queued sends: ${queueLength}` : '',
          activeRunId ? `Active run=${activeRunId}` : '',
          normalizeString(current?.model)
            ? `Model: ${normalizeString(current?.model)}${normalizeString(current?.modelProvider) ? ` @ ${normalizeString(current?.modelProvider)}` : ''}`
            : '',
          [
            normalizeString(current?.thinkingLevel) ? `think=${normalizeString(current?.thinkingLevel)}` : '',
            normalizeString(current?.verboseLevel) ? `verbose=${normalizeString(current?.verboseLevel)}` : '',
            normalizeString(current?.reasoningLevel) ? `reasoning=${normalizeString(current?.reasoningLevel)}` : '',
            normalizeString(current?.elevatedLevel) ? `elevated=${normalizeString(current?.elevatedLevel)}` : '',
            current?.fastMode === true ? 'fast=on' : '',
          ].filter(Boolean).join('; '),
          [
            normalizeString(current?.sendPolicy) ? `send=${normalizeString(current?.sendPolicy)}` : '',
            normalizeString(current?.groupActivation) ? `activation=${normalizeString(current?.groupActivation)}` : '',
            normalizeString(current?.responseUsage) ? `usage=${normalizeString(current?.responseUsage)}` : '',
          ].filter(Boolean).join('; '),
          usageEn ? `Tokens: ${usageEn}` : '',
          subagents.length
            ? `Subagents (${subagents.length}): ${previewEn.join(', ')}${subagents.length > previewEn.length ? ` and ${subagents.length - previewEn.length} more` : ''}`
            : 'Subagents: none',
          'Note: this is the Studio surface context summary, not the host-only exact prompt budget report.',
        ].filter(Boolean).join('\n'),
      ),
    };
  }

  return {
    phase: 'completed',
    detail: pair(
      `Studio 上下文：会话 ${label}；${messageCount != null ? `可见消息 ${messageCount} 条；` : ''}${queueLength != null ? `待发送 ${queueLength} 条；` : ''}${activeRunId ? `活跃 run=${activeRunId}；` : ''}${subagents.length ? `子代理 ${subagents.length} 个；` : ''}${usageZh ? `Token ${usageZh}。` : '可用详细信息见 /context detail。'}`,
      `Studio context: session ${label}; ${messageCount != null ? `${messageCount} visible messages; ` : ''}${queueLength != null ? `${queueLength} queued sends; ` : ''}${activeRunId ? `active run=${activeRunId}; ` : ''}${subagents.length ? `${subagents.length} subagents; ` : ''}${usageEn ? `tokens ${usageEn}.` : 'Use /context detail for more.'}`,
    ),
  };
}

async function executeTasks(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const allSessions = sessions?.sessions || [];
  const current = resolveCurrentSession(sessions, sessionKey);
  const activeRunId = normalizeString(context.activeRunId);
  const subagents = listCurrentSessionSubagents(allSessions, sessionKey);
  const currentStatus = normalizeLower(current?.status);
  const currentLabel = normalizeString(current?.label) || normalizeString(current?.key) || 'current-session';

  const hasVisibleTasks =
    Boolean(activeRunId)
    || currentStatus === 'running'
    || currentStatus === 'queued'
    || subagents.length > 0;

  if (!hasVisibleTasks) {
    return {
      phase: 'completed',
      detail: pair(
        '当前没有可见的后台任务。',
        'There are no visible background tasks for this session right now.',
      ),
    };
  }

  const previewZh = subagents.slice(0, 4).map((session) => (
    `${normalizeString(session.label) || normalizeString(session.key) || 'subagent'}（${formatTaskStatus(normalizeString(session.status), 'zh')}）`
  ));
  const previewEn = subagents.slice(0, 4).map((session) => (
    `${normalizeString(session.label) || normalizeString(session.key) || 'subagent'} (${formatTaskStatus(normalizeString(session.status), 'en')})`
  ));
  const breakdownZh = buildTaskStatusBreakdown(subagents, 'zh');
  const breakdownEn = buildTaskStatusBreakdown(subagents, 'en');

  const zhParts = [
    currentStatus ? `主会话 ${currentLabel}：${formatTaskStatus(currentStatus, 'zh')}` : '',
    activeRunId ? `活跃 run=${activeRunId}` : '',
    subagents.length
      ? `子代理 ${subagents.length} 个${breakdownZh ? `（${breakdownZh}）` : ''}`
      : '',
  ].filter(Boolean);
  const enParts = [
    currentStatus ? `main session ${currentLabel}: ${formatTaskStatus(currentStatus, 'en')}` : '',
    activeRunId ? `active run=${activeRunId}` : '',
    subagents.length
      ? `${subagents.length} subagent task${subagents.length === 1 ? '' : 's'}${breakdownEn ? ` (${breakdownEn})` : ''}`
      : '',
  ].filter(Boolean);

  return {
    phase: 'completed',
    detail: pair(
      `${zhParts.join('；')}。${previewZh.length ? ` 最近任务：${previewZh.join('、')}${subagents.length > previewZh.length ? ` 等 ${subagents.length} 个` : ''}。` : ''}`,
      `${enParts.join('; ')}.${previewEn.length ? ` Recent tasks: ${previewEn.join(', ')}${subagents.length > previewEn.length ? ` and ${subagents.length - previewEn.length} more` : ''}.` : ''}`,
    ),
  };
}

async function resolveSteerTarget(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<
  | { key: string; message: string; label?: string; sessions?: GatewaySessionsListResult }
  | { error: string }
> {
  const trimmed = normalizeString(args);
  if (!trimmed) {
    return { error: 'empty' };
  }
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx > 0) {
    const maybeTarget = trimmed.slice(0, spaceIdx);
    const rest = trimmed.slice(spaceIdx + 1).trim();
    if (rest && normalizeLower(maybeTarget) !== 'all') {
      const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
      const matched = resolveSteerSubagent(sessions?.sessions || [], sessionKey, maybeTarget);
      if (matched.length === 1) {
        return { key: matched[0], message: rest, label: maybeTarget, sessions };
      }
      if (matched.length > 1) {
        return { error: 'multiple' };
      }
      return { key: sessionKey, message: trimmed, sessions };
    }
  }
  return { key: sessionKey, message: trimmed };
}

function formatOptionList(options: string[]): string {
  return options.map((item) => `\`${item}\``).join(', ');
}

function splitConfigPath(path: string): Array<string | number> {
  return normalizeString(path)
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? Number(segment) : segment));
}

function readValueAtPath(root: unknown, path: string): unknown {
  const tokens = splitConfigPath(path);
  let current: unknown = root;
  for (const token of tokens) {
    if (typeof token === 'number') {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return undefined;
      }
      current = current[token];
      continue;
    }
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    if (!Object.prototype.hasOwnProperty.call(current, token)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function stringifyConfigValue(value: unknown): string {
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (
    typeof value === 'number'
    || typeof value === 'boolean'
    || value === null
  ) {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  try {
    const json = JSON.stringify(value);
    if (!json) {
      return 'undefined';
    }
    return json.length > 220 ? `${json.slice(0, 217)}...` : json;
  } catch {
    return '[unserializable]';
  }
}

function summarizeObjectKeys(value: unknown, limit = 4): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [];
  }
  return Object.keys(value).filter(Boolean).slice(0, limit);
}

function countObjectKeys(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return 0;
  }
  return Object.keys(value).length;
}

function formatBooleanState(value: boolean): { zh: string; en: string } {
  return value
    ? { zh: '已启用', en: 'enabled' }
    : { zh: '已关闭', en: 'disabled' };
}

function formatDisplayUrl(value: unknown): string {
  const raw = normalizeString(value);
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    const port = parsed.port ? `:${parsed.port}` : '';
    const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return `${parsed.protocol}//${parsed.hostname}${port}${pathname}`;
  } catch {
    return raw.length > 120 ? `${raw.slice(0, 117)}...` : raw;
  }
}

function resolvePluginConfigPath(pathArg: string): string {
  const normalized = normalizeString(pathArg);
  const lower = normalizeLower(normalized);
  if (!normalized) {
    return '';
  }
  if (lower.startsWith('plugins.')) {
    return normalized;
  }
  if (
    lower === 'enabled'
    || lower === 'allow'
    || lower === 'deny'
    || lower === 'slots'
    || lower === 'load'
    || lower.startsWith('entries.')
    || lower.startsWith('installs.')
    || lower.startsWith('slots.')
    || lower.startsWith('load.')
  ) {
    return `plugins.${normalized}`;
  }
  return `plugins.entries.${normalized}`;
}

function resolveMcpConfigPath(pathArg: string): string {
  const normalized = normalizeString(pathArg);
  const lower = normalizeLower(normalized);
  if (!normalized) {
    return '';
  }
  if (lower.startsWith('mcp.')) {
    return normalized;
  }
  if (lower.startsWith('servers.')) {
    return `mcp.${normalized}`;
  }
  return `mcp.servers.${normalized}`;
}

function summarizePluginList(snapshot: GatewayConfigSnapshot): StudioSlashLocalExecutionResult {
  const plugins = snapshot.config?.plugins && typeof snapshot.config.plugins === 'object'
    ? snapshot.config.plugins as Record<string, unknown>
    : {};
  const entries = plugins.entries && typeof plugins.entries === 'object'
    ? Object.entries(plugins.entries as Record<string, unknown>)
      .map(([id, entry]) => {
        const state = formatBooleanState((entry as Record<string, unknown>)?.enabled !== false);
        return `${id}(${state.zh})`;
      })
      .sort((left, right) => left.localeCompare(right))
    : [];
  const installs = plugins.installs && typeof plugins.installs === 'object'
    ? Object.keys(plugins.installs as Record<string, unknown>).length
    : 0;
  const loadPaths = Array.isArray((plugins.load as Record<string, unknown> | undefined)?.paths)
    ? ((plugins.load as Record<string, unknown>).paths as unknown[]).map((item) => normalizeString(item)).filter(Boolean)
    : [];
  const preview = entries.slice(0, 4).join('、') || '无';
  return {
    phase: 'completed',
    detail: pair(
      `当前插件条目 ${entries.length} 个，已登记安装 ${installs} 个，加载路径 ${loadPaths.length} 个。预览：${preview}${entries.length > 4 ? ` 等 ${entries.length} 个` : ''}。`,
      `${entries.length} plugin entr${entries.length === 1 ? 'y' : 'ies'}, ${installs} installed record${installs === 1 ? '' : 's'}, ${loadPaths.length} load path${loadPaths.length === 1 ? '' : 's'}. Preview: ${entries.slice(0, 4).join(', ') || 'none'}${entries.length > 4 ? ` and ${entries.length - 4} more` : ''}.`,
    ),
  };
}

function summarizePluginEntry(
  pluginId: string,
  entry: Record<string, unknown> | null | undefined,
  install: Record<string, unknown> | null | undefined,
): LocalizedText {
  const state = formatBooleanState((entry?.enabled as boolean | undefined) !== false);
  const configKeys = summarizeObjectKeys(entry?.config).join('、') || '无';
  const configCount = countObjectKeys(entry?.config);
  const source = normalizeString(install?.source);
  const version = normalizeString(install?.version || install?.resolvedVersion);
  const installPath = normalizeString(install?.installPath);
  return pair(
    `插件 ${pluginId}：${state.zh}；配置键 ${configCount} 个${configCount ? `（${configKeys}）` : ''}；安装源 ${source || '未知'}；版本 ${version || '未知'}；路径 ${installPath || '未记录'}。`,
    `Plugin ${pluginId}: ${state.en}; ${configCount} config key${configCount === 1 ? '' : 's'}${configCount ? ` (${summarizeObjectKeys(entry?.config).join(', ')})` : ''}; source ${source || 'unknown'}; version ${version || 'unknown'}; path ${installPath || 'not recorded'}.`,
  );
}

function summarizePluginInstall(pluginId: string, install: Record<string, unknown> | null | undefined): LocalizedText {
  const source = normalizeString(install?.source);
  const spec = normalizeString(install?.spec || install?.resolvedSpec);
  const version = normalizeString(install?.version || install?.resolvedVersion);
  const installPath = normalizeString(install?.installPath);
  return pair(
    `插件安装 ${pluginId}：来源 ${source || '未知'}；规格 ${spec || '未知'}；版本 ${version || '未知'}；路径 ${installPath || '未记录'}。`,
    `Plugin install ${pluginId}: source ${source || 'unknown'}; spec ${spec || 'unknown'}; version ${version || 'unknown'}; path ${installPath || 'not recorded'}.`,
  );
}

function summarizeMcpList(snapshot: GatewayConfigSnapshot): StudioSlashLocalExecutionResult {
  const servers = snapshot.config?.mcp
    && typeof snapshot.config.mcp === 'object'
    && (snapshot.config.mcp as Record<string, unknown>).servers
    && typeof (snapshot.config.mcp as Record<string, unknown>).servers === 'object'
    ? (snapshot.config.mcp as Record<string, unknown>).servers as Record<string, unknown>
    : {};
  const names = Object.keys(servers).sort((left, right) => left.localeCompare(right));
  const preview = names.slice(0, 4).map((name) => {
    const server = servers[name] as Record<string, unknown>;
    if (normalizeString(server?.url)) {
      return `${name}(url)`;
    }
    if (normalizeString(server?.command)) {
      return `${name}(command)`;
    }
    return `${name}(config)`;
  });
  return {
    phase: 'completed',
    detail: pair(
      `当前配置了 ${names.length} 个 MCP server：${preview.join('、') || '无'}${names.length > 4 ? ` 等 ${names.length} 个` : ''}。`,
      `${names.length} MCP server${names.length === 1 ? '' : 's'} configured: ${preview.join(', ') || 'none'}${names.length > 4 ? ` and ${names.length - 4} more` : ''}.`,
    ),
  };
}

function summarizeMcpServer(serverId: string, server: Record<string, unknown> | null | undefined): LocalizedText {
  const command = normalizeString(server?.command);
  const url = formatDisplayUrl(server?.url);
  const argsCount = Array.isArray(server?.args) ? server.args.length : 0;
  const headerCount = countObjectKeys(server?.headers);
  const envCount = countObjectKeys(server?.env);
  if (url) {
    return pair(
      `MCP server ${serverId}：远程 URL ${url}；headers ${headerCount} 项；env ${envCount} 项。`,
      `MCP server ${serverId}: remote URL ${url}; ${headerCount} header${headerCount === 1 ? '' : 's'}; ${envCount} env value${envCount === 1 ? '' : 's'}.`,
    );
  }
  return pair(
    `MCP server ${serverId}：命令 ${command || '未配置'}；args ${argsCount} 项；env ${envCount} 项。`,
    `MCP server ${serverId}: command ${command || 'not configured'}; ${argsCount} arg${argsCount === 1 ? '' : 's'}; ${envCount} env value${envCount === 1 ? '' : 's'}.`,
  );
}

function buildGenericPathResult(resolvedPath: string, value: unknown): StudioSlashLocalExecutionResult {
  const childCount = countObjectKeys(value);
  return {
    phase: 'completed',
    detail: pair(
      childCount > 0
        ? `${resolvedPath} 下有 ${childCount} 个子项。`
        : `${resolvedPath} = ${stringifyConfigValue(value)}`,
      childCount > 0
        ? `${resolvedPath} has ${childCount} child entries.`
        : `${resolvedPath} = ${stringifyConfigValue(value)}`,
    ),
  };
}

function groupModelsByProvider(models: NonNullable<GatewayModelListResult['models']>) {
  const groups = new Map<string, string[]>();
  for (const model of models) {
    const provider = normalizeString(model.provider) || 'default';
    const modelId = normalizeString(model.id) || normalizeString(model.name);
    if (!modelId) {
      continue;
    }
    const current = groups.get(provider) || [];
    if (!current.includes(modelId)) {
      current.push(modelId);
    }
    groups.set(provider, current);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function formatCompactResult(result: Record<string, unknown>): LocalizedText {
  const compacted = result.compacted === true;
  const reason = normalizeString(result.reason);
  const summary = typeof result.result === 'object' && result.result
    ? result.result as Record<string, unknown>
    : null;
  const before = typeof summary?.tokensBefore === 'number' ? summary.tokensBefore : null;
  const after = typeof summary?.tokensAfter === 'number' ? summary.tokensAfter : null;

  if (compacted) {
    if (before != null && after != null) {
      return pair(
        `上下文压缩已完成，Token 从 ${before} 降到 ${after}。`,
        `Context compaction completed, reducing tokens from ${before} to ${after}.`,
      );
    }
    return pair('上下文压缩已完成。', 'Context compaction completed.');
  }

  if (reason) {
    return pair(`上下文压缩已跳过：${reason}。`, `Context compaction was skipped: ${reason}.`);
  }

  return pair('上下文压缩已跳过。', 'Context compaction was skipped.');
}

async function executeCompact(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
): Promise<StudioSlashLocalExecutionResult> {
  const result = await client.request<Record<string, unknown>>('sessions.compact', { key: sessionKey });
  return {
    phase: 'completed',
    detail: formatCompactResult(result),
    refresh: 'conversation',
  };
}

async function executeModel(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const nextModel = normalizeString(args);
  if (!nextModel) {
    const [sessions, catalog] = await Promise.all([
      client.request<GatewaySessionsListResult>('sessions.list', {}),
      client.request<GatewayModelListResult>('models.list', {}).catch(() => ({ models: [] })),
    ]);
    const currentSession = resolveCurrentSession(sessions, sessionKey);
    const currentModel = normalizeString(currentSession?.model) || normalizeString(sessions?.defaults?.model) || 'default';
    const candidateList = [
      ...((catalog.models || []).map((item) => normalizeString(item.id)).filter(Boolean)),
      ...((context.modelCandidates || []).map((item) => normalizeString(item)).filter(Boolean)),
    ];
    const unique = [...new Set(candidateList)];
    const preview = unique.slice(0, 6);
    return {
      phase: 'completed',
      detail: pair(
        preview.length
          ? `当前模型是 ${currentModel}。可用候选：${preview.join('、')}${unique.length > preview.length ? ` 等 ${unique.length} 个` : ''}。`
          : `当前模型是 ${currentModel}。`,
        preview.length
          ? `Current model is ${currentModel}. Candidates: ${preview.join(', ')}${unique.length > preview.length ? ` and ${unique.length - preview.length} more` : ''}.`
          : `Current model is ${currentModel}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    model: nextModel,
  });
  return {
    phase: 'completed',
    detail: pair(`当前会话模型已切换为 ${nextModel}。`, `Session model was set to ${nextModel}.`),
  };
}

async function executeThink(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const level = normalizeLower(args);
  const allowed = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

  if (!level) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.thinkingLevel) || 'off';
    return {
      phase: 'completed',
      detail: pair(
        `当前 thinking level 是 ${current}。可选项：${allowed.join('、')}。`,
        `Current thinking level is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(level)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 thinking level：${level}。可选项：${allowed.join('、')}。`,
        `Unrecognized thinking level: ${level}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    thinkingLevel: level,
  });
  return {
    phase: 'completed',
    detail: pair(`thinking level 已设置为 ${level}。`, `Thinking level was set to ${level}.`),
  };
}

async function executeVerbose(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const level = normalizeLower(args);
  const allowed = ['off', 'on', 'full'];

  if (!level) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.verboseLevel) || 'off';
    return {
      phase: 'completed',
      detail: pair(
        `当前 verbose mode 是 ${current}。可选项：${allowed.join('、')}。`,
        `Current verbose mode is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(level)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 verbose mode：${level}。可选项：${allowed.join('、')}。`,
        `Unrecognized verbose mode: ${level}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    verboseLevel: level,
  });
  return {
    phase: 'completed',
    detail: pair(`verbose mode 已设置为 ${level}。`, `Verbose mode was set to ${level}.`),
  };
}

async function executeFast(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args);

  if (!mode || mode === 'status') {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = resolveCurrentSession(sessions, sessionKey)?.fastMode === true ? 'on' : 'off';
    return {
      phase: 'completed',
      detail: pair(
        `当前 fast mode 是 ${current}。可选项：status、on、off。`,
        `Current fast mode is ${current}. Options: status, on, off.`,
      ),
    };
  }

  if (mode !== 'on' && mode !== 'off') {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 fast mode：${mode}。可选项：status、on、off。`,
        `Unrecognized fast mode: ${mode}. Options: status, on, off.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    fastMode: mode === 'on',
  });
  return {
    phase: 'completed',
    detail: pair(
      `fast mode 已${mode === 'on' ? '开启' : '关闭'}。`,
      `Fast mode was ${mode === 'on' ? 'enabled' : 'disabled'}.`,
    ),
  };
}

function normalizeUsageMode(value: unknown): 'off' | 'tokens' | 'full' {
  const normalized = normalizeLower(value);
  if (normalized === 'tokens' || normalized === 'full') {
    return normalized;
  }
  return 'off';
}

async function executeReasoning(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const level = normalizeLower(args);
  const allowed = ['off', 'on', 'stream'];

  if (!level) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.reasoningLevel) || 'off';
    return {
      phase: 'completed',
      detail: pair(
        `当前 reasoning 可见性是 ${current}。可选项：${allowed.join('、')}。`,
        `Current reasoning visibility is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(level)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 reasoning mode：${level}。可选项：${allowed.join('、')}。`,
        `Unrecognized reasoning mode: ${level}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    reasoningLevel: level,
  });
  return {
    phase: 'completed',
    detail: pair(`reasoning 可见性已设置为 ${level}。`, `Reasoning visibility was set to ${level}.`),
  };
}

function buildUsageSummaryDetail(usage: ChatUsageSummary): LocalizedText {
  const input = formatTokenCount(usage.inputTokens);
  const output = formatTokenCount(usage.outputTokens);
  const total = formatTokenCount(usage.totalTokens);
  const cost = usage.costUsd == null ? null : usage.costUsd.toFixed(4);
  return pair(
    `当前会话 Token 使用：输入 ${input}，输出 ${output}，总计 ${total}${cost ? `，成本约 $${cost}` : ''}。`,
    `Session usage: ${input} input, ${output} output, ${total} total${cost ? `, about $${cost}` : ''}.`,
  );
}

async function executeUsage(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args);
  const allowed = ['off', 'tokens', 'full', 'cost'];

  if (mode && !allowed.includes(mode)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 usage mode：${mode}。可选项：${allowed.join('、')}。`,
        `Unrecognized usage mode: ${mode}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (mode === 'off' || mode === 'tokens' || mode === 'full') {
    await client.request('sessions.patch', {
      key: sessionKey,
      responseUsage: mode === 'off' ? null : mode,
    });
    return {
      phase: 'completed',
      detail: pair(
        `usage footer 已设置为 ${mode}。`,
        `Usage footer was set to ${mode}.`,
      ),
    };
  }

  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const current = resolveCurrentSession(sessions, sessionKey);
  const currentMode = normalizeUsageMode(current?.responseUsage);

  if (mode === 'cost') {
    if (context.usage?.costUsd != null) {
      return {
        phase: 'completed',
        detail: pair(
          `当前成本约为 $${context.usage.costUsd.toFixed(4)}。usage footer 模式：${currentMode}。`,
          `Current estimated cost is about $${context.usage.costUsd.toFixed(4)}. Usage footer mode: ${currentMode}.`,
        ),
      };
    }
    return {
      phase: 'completed',
      detail: pair(
        `当前没有可用成本数据。usage footer 模式：${currentMode}。`,
        `No cost data is currently available. Usage footer mode: ${currentMode}.`,
      ),
    };
  }

  if (context.usage) {
    return {
      phase: 'completed',
      detail: pair(
        `当前 usage footer 模式是 ${currentMode}。${buildUsageSummaryDetail(context.usage).zh}`,
        `Current usage footer mode is ${currentMode}. ${buildUsageSummaryDetail(context.usage).en}`,
      ),
    };
  }

  const inputTokens = Number(current?.inputTokens || 0);
  const outputTokens = Number(current?.outputTokens || 0);
  const totalTokens = Number(current?.totalTokens || inputTokens + outputTokens);
  const summary = buildUsageSummaryDetail({
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: null,
  });
  return {
    phase: 'completed',
    detail: pair(
      `当前 usage footer 模式是 ${currentMode}。${summary.zh}`,
      `Current usage footer mode is ${currentMode}. ${summary.en}`,
    ),
  };
}

async function executeElevated(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const level = normalizeLower(args);
  const allowed = ['off', 'on', 'ask', 'full'];

  if (!level) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.elevatedLevel) || 'off';
    return {
      phase: 'completed',
      detail: pair(
        `当前 elevated mode 是 ${current}。可选项：${allowed.join('、')}。`,
        `Current elevated mode is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(level)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 elevated mode：${level}。可选项：${allowed.join('、')}。`,
        `Unrecognized elevated mode: ${level}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    elevatedLevel: level,
  });
  return {
    phase: 'completed',
    detail: pair(`elevated mode 已设置为 ${level}。`, `Elevated mode was set to ${level}.`),
  };
}

async function executeExec(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const parsed = parseExecDirectiveArgs(args);
  if (parsed.error) {
    return {
      phase: 'error',
      detail: parsed.error,
    };
  }

  if (!parsed.hasExecOptions) {
    return {
      phase: 'completed',
      detail: pair(
        `当前暂无法直接查询 exec 默认项。可直接设置：${EXEC_OPTIONS_HINT_ZH}。`,
        `Studio cannot currently read the live exec defaults here. Set them directly with ${EXEC_OPTIONS_HINT_EN}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    ...parsed.patch,
  });

  const applied: string[] = [];
  if (parsed.patch.execHost) {
    applied.push(`host=${parsed.patch.execHost}`);
  }
  if (parsed.patch.execSecurity) {
    applied.push(`security=${parsed.patch.execSecurity}`);
  }
  if (parsed.patch.execAsk) {
    applied.push(`ask=${parsed.patch.execAsk}`);
  }
  if (parsed.patch.execNode) {
    applied.push(`node=${parsed.patch.execNode}`);
  }

  return {
    phase: 'completed',
    detail: pair(
      `exec 默认项已更新：${applied.join('，')}。`,
      `Exec defaults were updated: ${applied.join(', ')}.`,
    ),
  };
}

async function executeActivation(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args);
  const allowed = ['mention', 'always'];

  if (!mode) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const current = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.groupActivation) || 'mention';
    return {
      phase: 'completed',
      detail: pair(
        `当前 activation mode 是 ${current}。可选项：${allowed.join('、')}。`,
        `Current activation mode is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(mode)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 activation mode：${mode}。可选项：${allowed.join('、')}。`,
        `Unrecognized activation mode: ${mode}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    groupActivation: mode,
  });
  return {
    phase: 'completed',
    detail: pair(`activation mode 已设置为 ${mode}。`, `Activation mode was set to ${mode}.`),
  };
}

async function executeSendPolicy(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args);
  const allowed = ['on', 'off', 'inherit'];

  if (!mode) {
    const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
    const currentRaw = normalizeLower(resolveCurrentSession(sessions, sessionKey)?.sendPolicy);
    const current = currentRaw === 'allow' ? 'on' : currentRaw === 'deny' ? 'off' : 'inherit';
    return {
      phase: 'completed',
      detail: pair(
        `当前 send policy 是 ${current}。可选项：${allowed.join('、')}。`,
        `Current send policy is ${current}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  if (!allowed.includes(mode)) {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 send mode：${mode}。可选项：${allowed.join('、')}。`,
        `Unrecognized send mode: ${mode}. Options: ${allowed.join(', ')}.`,
      ),
    };
  }

  await client.request('sessions.patch', {
    key: sessionKey,
    sendPolicy: mode === 'inherit' ? null : mode === 'on' ? 'allow' : 'deny',
  });
  return {
    phase: 'completed',
    detail: pair(`send policy 已设置为 ${mode}。`, `Send policy was set to ${mode}.`),
  };
}

async function executeModels(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const providerFilter = normalizeLower(args);
  const result = await client.request<GatewayModelListResult>('models.list', {});
  const catalog = (result.models || []).filter((model) => normalizeString(model.id) || normalizeString(model.name));
  if (!catalog.length) {
    return {
      phase: 'completed',
      detail: pair('当前没有可用模型。', 'No models are currently available.'),
    };
  }

  const grouped = groupModelsByProvider(catalog);
  const filtered = providerFilter
    ? grouped.filter(([provider]) => normalizeLower(provider) === providerFilter)
    : grouped;

  if (!filtered.length) {
    return {
      phase: 'error',
      detail: pair(
        `没有找到 provider 为 ${providerFilter} 的模型。`,
        `No models were found for provider ${providerFilter}.`,
      ),
    };
  }

  const preview = filtered.slice(0, 4).map(([provider, models]) => (
    `${provider}: ${models.slice(0, 4).join(', ')}${models.length > 4 ? ` (+${models.length - 4})` : ''}`
  ));
  return {
    phase: 'completed',
    detail: pair(
      `当前共有 ${filtered.length} 个 provider：${preview.join('；')}。`,
      `${filtered.length} provider${filtered.length === 1 ? '' : 's'} available: ${preview.join('; ')}.`,
    ),
  };
}

async function executeTools(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const mode = normalizeLower(args || 'compact') || 'compact';
  if (mode !== 'compact' && mode !== 'verbose') {
    return {
      phase: 'error',
      detail: pair(
        `无法识别的 tools mode：${mode}。可选项：compact、verbose。`,
        `Unrecognized tools mode: ${mode}. Options: compact, verbose.`,
      ),
    };
  }

  const result = await client.request<GatewayToolsEffectiveResult>('tools.effective', { sessionKey });
  const groups = (result.groups || [])
    .map((group) => ({
      label: normalizeString(group.label) || normalizeString(group.id) || 'tools',
      tools: (group.tools || [])
        .map((tool) => ({
          id: normalizeString(tool.id),
          label: normalizeString(tool.label),
          description: normalizeString(tool.description),
        }))
        .filter((tool) => tool.id || tool.label),
    }))
    .filter((group) => group.tools.length);

  if (!groups.length) {
    return {
      phase: 'completed',
      detail: pair('当前会话没有可用运行时工具。', 'No runtime tools are currently available for this session.'),
    };
  }

  const preview = groups.slice(0, 4).map((group) => {
    if (mode === 'verbose') {
      const tools = group.tools.slice(0, 3).map((tool) => (
        `${tool.label || tool.id}${tool.description ? ` (${tool.description})` : ''}`
      ));
      return `${group.label}: ${tools.join(', ')}${group.tools.length > 3 ? ` (+${group.tools.length - 3})` : ''}`;
    }
    return `${group.label}: ${group.tools.slice(0, 5).map((tool) => tool.id || tool.label).join(', ')}${group.tools.length > 5 ? ` (+${group.tools.length - 5})` : ''}`;
  });

  return {
    phase: 'completed',
    detail: pair(
      `当前会话可用工具分组：${preview.join('；')}。`,
      `Runtime tools available for this session: ${preview.join('; ')}.`,
    ),
  };
}

async function executeTts(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction) || 'status';
  const value = rest.join(' ').trim();

  if (action === 'audio' || action === 'limit' || action === 'summary') {
    return null;
  }

  if (action === 'help') {
    return {
      phase: 'completed',
      detail: pair(
        'TTS 本地支持：/tts status、/tts on、/tts off、/tts provider [id]。/tts audio、/tts limit、/tts summary 会继续回退到宿主 slash。',
        'Local TTS support covers /tts status, /tts on, /tts off, and /tts provider [id]. /tts audio, /tts limit, and /tts summary still fall back to the host slash command.',
      ),
    };
  }

  if (action === 'status') {
    const result = await client.request<GatewayTtsStatusResult>('tts.status', {});
    return {
      phase: 'completed',
      detail: formatTtsStatusSummary(result),
    };
  }

  if (action === 'on') {
    await client.request('tts.enable', {});
    return {
      phase: 'completed',
      detail: pair('TTS 已开启。', 'TTS is now enabled.'),
    };
  }

  if (action === 'off') {
    await client.request('tts.disable', {});
    return {
      phase: 'completed',
      detail: pair('TTS 已关闭。', 'TTS is now disabled.'),
    };
  }

  if (action === 'provider') {
    if (!value) {
      const result = await client.request<GatewayTtsProvidersResult>('tts.providers', {});
      return {
        phase: 'completed',
        detail: formatTtsProvidersSummary(result),
      };
    }
    const nextProvider = normalizeString(value);
    await client.request('tts.setProvider', { provider: nextProvider });
    return {
      phase: 'completed',
      detail: pair(
        `TTS provider 已切换为 ${nextProvider}。`,
        `The TTS provider was set to ${nextProvider}.`,
      ),
    };
  }

  return null;
}

async function executeQueue(
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const mode = normalizeLower(trimmed);

  if (trimmed && mode !== 'help' && mode !== 'status') {
    return null;
  }

  const queueCount = typeof context.queueLength === 'number' && Number.isFinite(context.queueLength)
    ? Math.max(0, context.queueLength)
    : null;

  return {
    phase: 'completed',
    detail: pair(
      [
        queueCount != null ? `当前待发送队列 ${queueCount} 条。` : '当前未暴露实时队列长度。',
        'Studio 当前只在这里提供队列摘要与提示。',
        '如果你需要真正修改宿主 queue mode / debounce / cap / drop，请继续发送完整 /queue 参数给宿主处理。',
      ].join(' '),
      [
        queueCount != null ? `Current queued sends: ${queueCount}.` : 'The live queue length is not exposed here right now.',
        'Studio currently provides a local queue summary only.',
        'If you need to change the host queue mode, debounce, cap, or drop policy, keep sending the full /queue arguments to the host.',
      ].join(' '),
    ),
  };
}

async function executeSkill(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  if (trimmed) {
    return null;
  }

  const report = await client.request<GatewaySkillsStatusResult>('skills.status', {
    agentId: deriveAgentIdFromSessionKey(sessionKey),
  });
  const skills = (report.skills || [])
    .map((skill) => ({
      name: normalizeString(skill.name),
      disabled: skill.disabled === true,
      blockedByAllowlist: skill.blockedByAllowlist === true,
      eligible: skill.eligible === true,
      installCount: Array.isArray(skill.install) ? skill.install.length : 0,
    }))
    .filter((skill) => skill.name);

  if (!skills.length) {
    return {
      phase: 'completed',
      detail: pair(
        '当前工作区没有可见技能。若要执行具体技能，请继续使用 `/skill <name> [input]` 交给宿主处理。',
        'No visible skills were found for this workspace. To run a specific skill, keep using `/skill <name> [input]` and let the host handle it.',
      ),
    };
  }

  const formatState = (skill: { disabled: boolean; blockedByAllowlist: boolean; eligible: boolean; installCount: number }, locale: 'zh' | 'en') => {
    if (skill.disabled) return locale === 'zh' ? '已禁用' : 'disabled';
    if (skill.blockedByAllowlist) return locale === 'zh' ? '被 allowlist 阻止' : 'blocked by allowlist';
    if (skill.eligible) return locale === 'zh' ? '可用' : 'ready';
    if (skill.installCount > 0) return locale === 'zh' ? '可安装' : 'installable';
    return locale === 'zh' ? '缺少依赖' : 'missing requirements';
  };

  const previewZh = skills.slice(0, 6).map((skill) => `${skill.name}（${formatState(skill, 'zh')}）`);
  const previewEn = skills.slice(0, 6).map((skill) => `${skill.name} (${formatState(skill, 'en')})`);
  const readyCount = skills.filter((skill) => skill.eligible).length;

  return {
    phase: 'completed',
    detail: pair(
      `当前工作区技能 ${skills.length} 个，可用 ${readyCount} 个：${previewZh.join('、')}${skills.length > previewZh.length ? ` 等 ${skills.length} 个` : ''}。要真正运行技能，请继续输入 \`/skill <name> [input]\`。`,
      `${skills.length} skills in the current workspace, ${readyCount} ready: ${previewEn.join(', ')}${skills.length > previewEn.length ? ` and ${skills.length - previewEn.length} more` : ''}. To run one, keep using \`/skill <name> [input]\`.`,
    ),
  };
}

async function executeAllowlist(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const parsed = parseAllowlistArgs(args);
  if (parsed.kind === 'fallback') {
    return null;
  }
  if (parsed.kind === 'help') {
    return {
      phase: 'completed',
      detail: pair(
        [
          'Studio Chat /allowlist 默认管理当前 Agent 的 exec allowlist。',
          `支持：${ALLOWLIST_USAGE_HINT_ZH}。`,
          '如果你要使用 dm/group/channel/account/config/store 这类频道 allowlist 语义，会继续回退宿主 /allowlist。',
        ].join('\n'),
        [
          'Studio Chat /allowlist manages the current agent exec allowlist by default.',
          `Supported locally: ${ALLOWLIST_USAGE_HINT_EN}.`,
          'If you need dm/group/channel/account/config/store channel allowlist semantics, Studio will fall back to the host /allowlist command.',
        ].join('\n'),
      ),
    };
  }
  if (parsed.kind === 'error') {
    return {
      phase: 'error',
      detail: parsed.detail,
    };
  }

  const agentKey = normalizeString(parsed.agentKey) || deriveAgentIdFromSessionKey(sessionKey) || DEFAULT_AGENT_ID;
  const targetLabel = parsed.nodeId
    ? pair(`节点 ${parsed.nodeId}`, `node ${parsed.nodeId}`)
    : pair('网关主机', 'gateway host');
  const getMethod = parsed.nodeId ? 'exec.approvals.node.get' : 'exec.approvals.get';
  const setMethod = parsed.nodeId ? 'exec.approvals.node.set' : 'exec.approvals.set';
  const targetParams = parsed.nodeId ? { nodeId: parsed.nodeId } : {};
  const snapshot = await client.request<GatewayExecApprovalsSnapshot>(getMethod, targetParams);
  const file = normalizeExecApprovalsFile(snapshot.file);
  const agent = file.agents?.[agentKey] || {};
  const allowlist = Array.isArray(agent.allowlist)
    ? agent.allowlist
      .map((entry) => {
        const patternValue = normalizeString(entry?.pattern);
        if (!patternValue) {
          return null;
        }
        const cleaned: GatewayExecApprovalsAllowlistEntry = { pattern: patternValue };
        if (typeof entry?.lastUsedAt === 'number' && Number.isFinite(entry.lastUsedAt)) {
          cleaned.lastUsedAt = entry.lastUsedAt;
        }
        return cleaned;
      })
      .filter((entry): entry is GatewayExecApprovalsAllowlistEntry => Boolean(entry))
    : [];

  if (parsed.kind === 'list') {
    if (!allowlist.length) {
      return {
        phase: 'completed',
        detail: pair(
          `${targetLabel.zh}上当前 Agent ${agentKey} 还没有 exec allowlist 条目。`,
          `There are no exec allowlist entries for agent ${agentKey} on the ${targetLabel.en}.`,
        ),
      };
    }
    const previewZh = allowlist.slice(0, 6).map((entry) => entry.pattern);
    const previewEn = allowlist.slice(0, 6).map((entry) => entry.pattern);
    return {
      phase: 'completed',
      detail: pair(
        `${targetLabel.zh}上当前 Agent ${agentKey} 有 ${allowlist.length} 条 exec allowlist：${previewZh.join('、')}${allowlist.length > previewZh.length ? ` 等 ${allowlist.length} 条` : ''}。`,
        `Agent ${agentKey} has ${allowlist.length} exec allowlist entr${allowlist.length === 1 ? 'y' : 'ies'} on the ${targetLabel.en}: ${previewEn.join(', ')}${allowlist.length > previewEn.length ? ` and ${allowlist.length - previewEn.length} more` : ''}.`,
      ),
    };
  }

  const pattern = normalizeString(parsed.pattern);
  const exists = allowlist.some((entry) => entry.pattern === pattern);

  if (parsed.kind === 'add' && exists) {
    return {
      phase: 'completed',
      detail: pair(
        `${targetLabel.zh}上当前 Agent ${agentKey} 已包含 allowlist：${pattern}。`,
        `Agent ${agentKey} already has the allowlist entry ${pattern} on the ${targetLabel.en}.`,
      ),
    };
  }

  if (parsed.kind === 'remove' && !exists) {
    return {
      phase: 'completed',
      detail: pair(
        `${targetLabel.zh}上当前 Agent ${agentKey} 中未找到 allowlist：${pattern}。`,
        `The allowlist entry ${pattern} was not found for agent ${agentKey} on the ${targetLabel.en}.`,
      ),
    };
  }

  const baseHash = normalizeString(snapshot.hash);
  if (!baseHash) {
    return {
      phase: 'error',
      detail: pair(
        '当前无法获取 exec approvals base hash，请稍后重试。',
        'The exec approvals base hash is unavailable right now. Retry the command.',
      ),
    };
  }

  const nextAgent: GatewayExecApprovalsAgent = {
    ...agent,
    allowlist: parsed.kind === 'add'
      ? [...allowlist, { pattern }]
      : allowlist.filter((entry) => entry.pattern !== pattern),
  };
  const nextFile: GatewayExecApprovalsFile = {
    ...file,
    agents: {
      ...(file.agents || {}),
    },
  };

  if (isExecApprovalsAgentEmpty(nextAgent)) {
    delete nextFile.agents?.[agentKey];
  } else {
    nextFile.agents![agentKey] = nextAgent;
  }

  await client.request(setMethod, {
    ...targetParams,
    baseHash,
    file: nextFile,
  });

  return {
    phase: 'completed',
    detail: parsed.kind === 'add'
      ? pair(
        `已在${targetLabel.zh}上为当前 Agent ${agentKey} 添加 allowlist：${pattern}。`,
        `Added allowlist entry ${pattern} for agent ${agentKey} on the ${targetLabel.en}.`,
      )
      : pair(
        `已在${targetLabel.zh}上为当前 Agent ${agentKey} 移除 allowlist：${pattern}。`,
        `Removed allowlist entry ${pattern} for agent ${agentKey} on the ${targetLabel.en}.`,
      ),
  };
}

async function executeApprove(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const parsed = parseApproveArgs(args);
  if (parsed && 'zh' in parsed) {
    return {
      phase: 'error',
      detail: parsed,
    };
  }

  if (!parsed) {
    const [execPending, pluginPending] = await Promise.all([
      client.request<GatewayExecApprovalListItem[]>('exec.approval.list', {}),
      client.request<GatewayPluginApprovalListItem[]>('plugin.approval.list', {}),
    ]);
    const execItems = Array.isArray(execPending) ? execPending : [];
    const pluginItems = Array.isArray(pluginPending) ? pluginPending : [];
    if (!execItems.length && !pluginItems.length) {
      return {
        phase: 'completed',
        detail: pair('当前没有待处理的审批请求。', 'There are no pending approval requests right now.'),
      };
    }
    const execPreviewZh = execItems.slice(0, 3).map((item) => {
      const id = normalizeString(item.id) || 'unknown';
      const command = normalizeString(item.request?.commandPreview)
        || normalizeString(item.request?.command)
        || 'exec';
      return `${id}(${command})`;
    });
    const execPreviewEn = execItems.slice(0, 3).map((item) => {
      const id = normalizeString(item.id) || 'unknown';
      const command = normalizeString(item.request?.commandPreview)
        || normalizeString(item.request?.command)
        || 'exec';
      return `${id} (${command})`;
    });
    const pluginPreviewZh = pluginItems.slice(0, 3).map((item) => {
      const id = normalizeString(item.id) || 'unknown';
      const title = normalizeString(item.request?.title) || normalizeString(item.request?.pluginId) || 'plugin';
      return `${id}(${title})`;
    });
    const pluginPreviewEn = pluginItems.slice(0, 3).map((item) => {
      const id = normalizeString(item.id) || 'unknown';
      const title = normalizeString(item.request?.title) || normalizeString(item.request?.pluginId) || 'plugin';
      return `${id} (${title})`;
    });
    return {
      phase: 'completed',
      detail: pair(
        `待处理审批：${execPreviewZh.length ? `exec ${execPreviewZh.join('、')}` : ''}${execPreviewZh.length && pluginPreviewZh.length ? '；' : ''}${pluginPreviewZh.length ? `plugin ${pluginPreviewZh.join('、')}` : ''}。`,
        `Pending approvals: ${execPreviewEn.length ? `exec ${execPreviewEn.join(', ')}` : ''}${execPreviewEn.length && pluginPreviewEn.length ? '; ' : ''}${pluginPreviewEn.length ? `plugin ${pluginPreviewEn.join(', ')}` : ''}.`,
      ),
    };
  }

  const payload = {
    id: parsed.id,
    decision: parsed.decision,
  };

  if (parsed.id.startsWith('plugin:')) {
    await client.request('plugin.approval.resolve', payload);
  } else {
    try {
      await client.request('exec.approval.resolve', payload);
    } catch (error) {
      if (!isApprovalNotFoundErrorMessage(error)) {
        throw error;
      }
      await client.request('plugin.approval.resolve', payload);
    }
  }

  return {
    phase: 'completed',
    detail: pair(
      `审批决定已提交：${parsed.id} -> ${parsed.decision}。`,
      `Approval decision submitted: ${parsed.id} -> ${parsed.decision}.`,
    ),
  };
}

function buildStudioSessionSummary(
  sessionKey: string,
  row: GatewaySessionRow | undefined,
  context: StudioSlashLocalExecutionContext,
): LocalizedText {
  const provider = normalizeString(row?.modelProvider);
  const model = normalizeString(row?.model) || 'default';
  const thinking = normalizeString(row?.thinkingLevel) || 'adaptive';
  const verbose = normalizeString(row?.verboseLevel) || 'off';
  const reasoning = normalizeString(row?.reasoningLevel) || 'off';
  const usage = normalizeString(row?.responseUsage) || 'off';
  const elevated = normalizeString(row?.elevatedLevel) || 'off';
  const sendPolicy = normalizeString(row?.sendPolicy) || 'allow';
  const activation = normalizeString(row?.groupActivation) || 'mention';
  const status = normalizeString(row?.status) || 'idle';
  const fastMode = row?.fastMode === true ? 'on' : 'off';
  const queueLength = normalizeOptionalCount(context.queueLength);
  const messageCount = normalizeOptionalCount(context.messageCount);
  const transportMode = normalizeString(context.transportMode) || 'unknown';
  const exposureKind = normalizeString(context.exposureKind) || 'studio';
  const realtimeReady = context.realtimeReady === true
    ? pair('已连接', 'connected')
    : context.realtimeReady === false
      ? pair('未连接', 'not connected')
      : pair('未知', 'unknown');

  return pair(
    [
      `当前会话 ${sessionKey}：状态 ${status}。`,
      `model=${provider ? `${provider}/` : ''}${model}，thinking=${thinking}，verbose=${verbose}，reasoning=${reasoning}，usage=${usage}，elevated=${elevated}。`,
      `send=${sendPolicy}，activation=${activation}，fast=${fastMode}。`,
      `transport=${transportMode}，surface=${exposureKind}，实时链路${realtimeReady.zh}。`,
      messageCount != null ? `当前消息 ${messageCount} 条。` : '当前消息数未知。',
      queueLength != null ? `待发送队列 ${queueLength} 条。` : '待发送队列长度未知。',
      context.activeRunId ? `活动 run：${context.activeRunId}。` : '当前没有活动 run。',
    ].join(' '),
    [
      `Current session ${sessionKey}: status ${status}.`,
      `model=${provider ? `${provider}/` : ''}${model}, thinking=${thinking}, verbose=${verbose}, reasoning=${reasoning}, usage=${usage}, elevated=${elevated}.`,
      `send=${sendPolicy}, activation=${activation}, fast=${fastMode}.`,
      `transport=${transportMode}, surface=${exposureKind}, realtime ${realtimeReady.en}.`,
      messageCount != null ? `${messageCount} visible message${messageCount === 1 ? '' : 's'}.` : 'Visible message count unknown.',
      queueLength != null ? `${queueLength} queued send${queueLength === 1 ? '' : 's'}.` : 'Queue length unknown.',
      context.activeRunId ? `Active run: ${context.activeRunId}.` : 'No active run right now.',
    ].join(' '),
  );
}

async function executeWhoami(
  sessionKey: string,
): Promise<StudioSlashLocalExecutionResult> {
  const parsed = parseAgentSessionKey(sessionKey);
  const agentId = parsed?.agentId || (normalizeLower(sessionKey) === DEFAULT_MAIN_KEY ? DEFAULT_AGENT_ID : '');
  return {
    phase: 'completed',
    detail: pair(
      `Studio Chat 当前不暴露真实频道 sender id。当前仅能确认会话 key=${sessionKey}${agentId ? `，agent=${agentId}` : ''}。如果你需要真实 sender id，请在对应频道 surface 中使用 /whoami。`,
      `Studio Chat does not expose a real channel sender id here. The available local identity is session key=${sessionKey}${agentId ? `, agent=${agentId}` : ''}. If you need the real sender id, run /whoami on the actual channel surface.`,
    ),
  };
}

async function executeSessionCommand(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const action = normalizeLower(args.split(/\s+/)[0] || '') || 'status';
  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const current = resolveCurrentSession(sessions, sessionKey);
  const summary = buildStudioSessionSummary(sessionKey, current, context);

  if (!args.trim() || action === 'status' || action === 'show') {
    return {
      phase: 'completed',
      detail: summary,
    };
  }

  return {
    phase: 'completed',
    detail: pair(
      [
        summary.zh,
        'Studio Chat 直连会话不使用线程绑定的 /session idle|max-age 语义。',
        '请改用 /new、/reset，或使用专用命令 /model /think /verbose /reasoning /usage /elevated /send /activation。',
      ].join(' '),
      [
        summary.en,
        'Studio Chat direct sessions do not use the thread-binding /session idle|max-age semantics.',
        'Use /new, /reset, or the dedicated commands /model /think /verbose /reasoning /usage /elevated /send /activation instead.',
      ].join(' '),
    ),
  };
}

async function executeAcp(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = ''] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction) || 'status';

  if (action === 'help') {
    return {
      phase: 'completed',
      detail: pair(
        'Studio 当前本地支持 /acp status 和 /acp sessions 摘要。其它 ACP 动作仍会回退给宿主处理。',
        'Studio currently supports local summaries for /acp status and /acp sessions. Other ACP actions still fall back to the host.',
      ),
    };
  }
  if (action !== 'status' && action !== 'sessions') {
    return null;
  }

  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const acpSessions = (sessions.sessions || []).filter((row) => isAcpSessionKey(row.key));
  if (!acpSessions.length) {
    return {
      phase: 'completed',
      detail: pair(
        `当前 Studio 视角下没有可见的 ACP 会话。当前普通会话摘要：${buildStudioSessionSummary(sessionKey, resolveCurrentSession(sessions, sessionKey), context).zh}`,
        `No visible ACP sessions were found from the current Studio view. Current direct-session summary: ${buildStudioSessionSummary(sessionKey, resolveCurrentSession(sessions, sessionKey), context).en}`,
      ),
    };
  }

  const previewZh = acpSessions.slice(0, 4).map((row) => (
    `${normalizeString(row.label) || normalizeString(row.key) || 'acp'}（${formatTaskStatus(normalizeString(row.status) || 'unknown', 'zh')}）`
  ));
  const previewEn = acpSessions.slice(0, 4).map((row) => (
    `${normalizeString(row.label) || normalizeString(row.key) || 'acp'} (${formatTaskStatus(normalizeString(row.status) || 'unknown', 'en')})`
  ));

  return {
    phase: 'completed',
    detail: pair(
      `当前可见 ACP 会话 ${acpSessions.length} 个：${previewZh.join('、')}${acpSessions.length > previewZh.length ? ` 等 ${acpSessions.length} 个` : ''}。`,
      `${acpSessions.length} ACP session${acpSessions.length === 1 ? '' : 's'} visible: ${previewEn.join(', ')}${acpSessions.length > previewEn.length ? ` and ${acpSessions.length - previewEn.length} more` : ''}.`,
    ),
  };
}

async function executeDebug(
  client: StudioSlashLocalGatewayClient,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction) || 'show';
  const pathArg = rest.join(' ').trim();

  if (action !== 'show' && action !== 'get') {
    return null;
  }

  const snapshot = await client.request<GatewayConfigSnapshot>('config.get', {});
  const resolvedPath = pathArg
    ? (pathArg.startsWith('debug') ? pathArg : `debug.${pathArg}`)
    : 'debug';
  const value = readValueAtPath(snapshot.config || {}, resolvedPath);

  if (pathArg) {
    return buildGenericPathResult(resolvedPath, value);
  }

  const debugKeys = value && typeof value === 'object' && !Array.isArray(value)
    ? Object.keys(value as Record<string, unknown>).slice(0, 6)
    : [];
  const transportMode = normalizeString(context.transportMode) || 'unknown';
  const exposureKind = normalizeString(context.exposureKind) || 'studio';
  const realtime = context.realtimeReady === true
    ? pair('已连接', 'connected')
    : context.realtimeReady === false
      ? pair('未连接', 'not connected')
      : pair('未知', 'unknown');

  return {
    phase: 'completed',
    detail: pair(
      `当前 Studio 调试摘要：transport=${transportMode}，surface=${exposureKind}，实时链路${realtime.zh}；可见 debug 键：${debugKeys.join('、') || '无'}。若要执行 /debug set|unset|reset，仍会回退宿主处理。`,
      `Current Studio debug summary: transport=${transportMode}, surface=${exposureKind}, realtime ${realtime.en}; visible debug keys: ${debugKeys.join(', ') || 'none'}. /debug set|unset|reset still falls back to the host.`,
    ),
  };
}

async function executeFocusCommand(
  sessionKey: string,
): Promise<StudioSlashLocalExecutionResult> {
  return {
    phase: 'completed',
    detail: pair(
      `Studio Chat 不通过 /focus 做线程绑定；当前已经直接停留在会话 ${sessionKey}。如需切换目标，请直接在左侧会话列表中选择。`,
      `Studio Chat does not use /focus for thread binding; you are already working directly in session ${sessionKey}. Switch targets from the left session list instead.`,
    ),
  };
}

async function executeUnfocusCommand(
  sessionKey: string,
): Promise<StudioSlashLocalExecutionResult> {
  return {
    phase: 'completed',
    detail: pair(
      `Studio Chat 没有可清除的线程绑定；当前会话仍是 ${sessionKey}。如需离开当前上下文，请切换会话或直接 /new。`,
      `Studio Chat does not keep a thread binding to clear here; the current session is still ${sessionKey}. Switch sessions or use /new to leave this context.`,
    ),
  };
}

async function executeConfig(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction);
  const pathArg = rest.join(' ').trim();

  if (action && action !== 'show' && action !== 'get') {
    return null;
  }

  const snapshot = await client.request<GatewayConfigSnapshot>('config.get', {});
  if (!pathArg) {
    const topLevelKeys = Object.keys(snapshot.config || {}).slice(0, 8);
    const status = snapshot.valid === true ? 'valid' : snapshot.valid === false ? 'invalid' : 'unknown';
    return {
      phase: 'completed',
      detail: pair(
        `当前配置文件：${normalizeString(snapshot.path) || '~/.openclaw/openclaw.json'}；状态：${status}；顶层键：${topLevelKeys.join('、') || '无'}。`,
        `Current config file: ${normalizeString(snapshot.path) || '~/.openclaw/openclaw.json'}; status: ${status}; top-level keys: ${topLevelKeys.join(', ') || 'none'}.`,
      ),
    };
  }

  const lookup = await client.request<GatewayConfigSchemaLookupResult>('config.schema.lookup', { path: pathArg });
  const value = readValueAtPath(snapshot.config || {}, pathArg);
  const resolvedPath = normalizeString(lookup.path) || pathArg;
  const renderedValue = stringifyConfigValue(value);
  const childCount = Array.isArray(lookup.children) ? lookup.children.length : 0;

  return {
    phase: 'completed',
    detail: pair(
      childCount > 0 && typeof value === 'undefined'
        ? `${resolvedPath} 下有 ${childCount} 个子项。`
        : `${resolvedPath} = ${renderedValue}`,
      childCount > 0 && typeof value === 'undefined'
        ? `${resolvedPath} has ${childCount} child entries.`
        : `${resolvedPath} = ${renderedValue}`,
    ),
  };
}

async function executePlugins(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction);
  const pathArg = rest.join(' ').trim();

  if (action && action !== 'list' && action !== 'show' && action !== 'get') {
    return null;
  }

  const snapshot = await client.request<GatewayConfigSnapshot>('config.get', {});
  if (!pathArg) {
    return summarizePluginList(snapshot);
  }

  const resolvedPath = resolvePluginConfigPath(pathArg);
  const value = readValueAtPath(snapshot.config || {}, resolvedPath);
  const tokens = splitConfigPath(resolvedPath);
  if (tokens[0] === 'plugins' && tokens[1] === 'entries' && typeof tokens[2] === 'string' && tokens.length === 3) {
    const pluginId = tokens[2];
    const install = readValueAtPath(snapshot.config || {}, `plugins.installs.${pluginId}`) as Record<string, unknown> | undefined;
    return {
      phase: 'completed',
      detail: summarizePluginEntry(pluginId, value as Record<string, unknown> | undefined, install),
    };
  }
  if (tokens[0] === 'plugins' && tokens[1] === 'installs' && typeof tokens[2] === 'string' && tokens.length === 3) {
    return {
      phase: 'completed',
      detail: summarizePluginInstall(tokens[2], value as Record<string, unknown> | undefined),
    };
  }
  return buildGenericPathResult(resolvedPath, value);
}

async function executeMcp(
  client: StudioSlashLocalGatewayClient,
  args: string,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction);
  const pathArg = rest.join(' ').trim();

  if (action && action !== 'show' && action !== 'get') {
    return null;
  }

  const snapshot = await client.request<GatewayConfigSnapshot>('config.get', {});
  if (!pathArg) {
    return summarizeMcpList(snapshot);
  }

  const resolvedPath = resolveMcpConfigPath(pathArg);
  const value = readValueAtPath(snapshot.config || {}, resolvedPath);
  const tokens = splitConfigPath(resolvedPath);
  if (tokens[0] === 'mcp' && tokens[1] === 'servers' && typeof tokens[2] === 'string' && tokens.length === 3) {
    return {
      phase: 'completed',
      detail: summarizeMcpServer(tokens[2], value as Record<string, unknown> | undefined),
    };
  }

  if (
    tokens[0] === 'mcp'
    && tokens[1] === 'servers'
    && typeof tokens[2] === 'string'
    && tokens[3] === 'url'
  ) {
    return {
      phase: 'completed',
      detail: pair(
        `${resolvedPath} = ${formatDisplayUrl(value) || '未配置'}`,
        `${resolvedPath} = ${formatDisplayUrl(value) || 'not configured'}`,
      ),
    };
  }

  return buildGenericPathResult(resolvedPath, value);
}

async function executeAgents(
  client: StudioSlashLocalGatewayClient,
): Promise<StudioSlashLocalExecutionResult> {
  const result = await client.request<GatewayAgentsListResult>('agents.list', {});
  const agents = (result.agents || [])
    .map((agent) => ({
      id: normalizeString(agent.id),
      label: normalizeString(agent.identity?.name) || normalizeString(agent.name) || normalizeString(agent.id),
    }))
    .filter((agent) => agent.id);

  if (!agents.length) {
    return {
      phase: 'completed',
      detail: pair('当前没有可用的 Agent。', 'No agents are currently available.'),
    };
  }

  const preview = agents.slice(0, 4).map((agent) => (
    agent.id === normalizeString(result.defaultId) ? `${agent.label}（默认）` : agent.label
  ));
  return {
    phase: 'completed',
    detail: pair(
      `当前共有 ${agents.length} 个 Agent：${preview.join('、')}${agents.length > preview.length ? ` 等 ${agents.length} 个` : ''}。`,
      `${agents.length} agent${agents.length === 1 ? '' : 's'} available: ${preview.join(', ')}${agents.length > preview.length ? ` and ${agents.length - preview.length} more` : ''}.`,
    ),
  };
}

async function executeSubagents(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult | null> {
  const trimmed = normalizeString(args);
  const [rawAction = '', ...rest] = trimmed ? trimmed.split(/\s+/) : [];
  const action = normalizeLower(rawAction) || 'list';
  const remainder = rest.join(' ').trim();

  if (action === 'spawn' || action === 'log') {
    return null;
  }
  if (action === 'kill') {
    return executeKill(client, sessionKey, remainder);
  }
  if (action === 'send' || action === 'steer') {
    return executeSteer(client, sessionKey, remainder, context);
  }
  if (action !== 'list' && action !== 'info') {
    return null;
  }

  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const subagents = listCurrentSessionSubagents(sessions?.sessions || [], sessionKey);
  if (!subagents.length) {
    return {
      phase: 'completed',
      detail: pair(
        '当前会话没有可见的子代理运行。',
        'No visible subagent runs were found for this session.',
      ),
    };
  }

  if (action === 'list') {
    const preview = subagents.slice(0, 6).map((session) => {
      const key = normalizeString(session.key);
      const shortId = key.split(':').slice(-1)[0] || key;
      const label = normalizeString(session.label) || shortId;
      const status = normalizeLower(session.status) || 'unknown';
      return `${label}(${status})`;
    });
    return {
      phase: 'completed',
      detail: pair(
        `当前会话共有 ${subagents.length} 个子代理：${preview.join('、')}${subagents.length > 6 ? ` 等 ${subagents.length} 个` : ''}。`,
        `${subagents.length} subagent run${subagents.length === 1 ? '' : 's'} for this session: ${preview.join(', ')}${subagents.length > 6 ? ` and ${subagents.length - 6} more` : ''}.`,
      ),
    };
  }

  const matched = resolveSteerSubagent(sessions?.sessions || [], sessionKey, remainder);
  if (!matched.length) {
    return {
      phase: 'error',
      detail: pair(
        `没有找到匹配 ${remainder || '目标'} 的子代理会话。`,
        `No matching subagent session was found for ${remainder || 'the requested target'}.`,
      ),
    };
  }
  if (matched.length > 1) {
    return {
      phase: 'error',
      detail: pair('匹配到多个子代理，请给出更具体的目标。', 'Multiple subagents matched; use a more specific target.'),
    };
  }

  const target = sessions.sessions?.find((session) => normalizeLower(session.key) === normalizeLower(matched[0]));
  const key = normalizeString(target?.key);
  const shortId = key.split(':').slice(-1)[0] || key;
  const label = normalizeString(target?.label) || shortId;
  const status = normalizeLower(target?.status) || 'unknown';
  const model = normalizeString(target?.model) || 'default';
  const endedAt = normalizeString(target?.endedAt);
  const parent = normalizeString(target?.spawnedBy) || 'unknown';

  return {
    phase: 'completed',
    detail: pair(
      `子代理 ${label}：状态 ${status}；模型 ${model}；父会话 ${parent}${endedAt ? `；结束于 ${endedAt}` : ''}。`,
      `Subagent ${label}: status ${status}; model ${model}; parent ${parent}${endedAt ? `; ended at ${endedAt}` : ''}.`,
    ),
  };
}

async function executeKill(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const target = normalizeString(args);
  if (!target) {
    return {
      phase: 'error',
      detail: pair('用法：/kill <id|all>', 'Usage: /kill <id|all>'),
    };
  }

  const sessions = await client.request<GatewaySessionsListResult>('sessions.list', {});
  const matched = resolveKillTargets(sessions?.sessions || [], sessionKey, target);
  if (!matched.length) {
    return {
      phase: 'error',
      detail: pair(
        target.toLowerCase() === 'all'
          ? '当前没有可停止的子代理会话。'
          : `没有找到匹配 ${target} 的子代理会话。`,
        target.toLowerCase() === 'all'
          ? 'No active subagent sessions were found.'
          : `No matching subagent sessions were found for ${target}.`,
      ),
    };
  }

  const results = await Promise.allSettled(
    matched.map((key) => client.request<{ aborted?: boolean }>('chat.abort', { sessionKey: key })),
  );
  const successCount = results.filter((entry) => (
    entry.status === 'fulfilled' && entry.value?.aborted !== false
  )).length;
  if (!successCount) {
    return {
      phase: 'error',
      detail: pair('子代理停止失败。', 'Failed to abort the target subagent runs.'),
    };
  }

  return {
    phase: 'completed',
    detail: pair(
      `已停止 ${successCount} 个子代理会话。`,
      `Aborted ${successCount} subagent session${successCount === 1 ? '' : 's'}.`,
    ),
    refresh: 'sessions',
  };
}

async function executeSteer(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
  context: StudioSlashLocalExecutionContext,
): Promise<StudioSlashLocalExecutionResult> {
  const resolved = await resolveSteerTarget(client, sessionKey, args);
  if ('error' in resolved) {
    return {
      phase: 'error',
      detail: pair(
        resolved.error === 'empty'
          ? '用法：/steer [id] <message>'
          : '匹配到多个子代理，请给出更具体的目标。',
        resolved.error === 'empty'
          ? 'Usage: /steer [id] <message>'
          : 'Multiple subagents matched; use a more specific target.',
      ),
    };
  }

  const sessions = resolved.sessions || await client.request<GatewaySessionsListResult>('sessions.list', {});
  const targetSession = resolveCurrentSession(sessions, resolved.key);
  if (!isActiveSteerSession(targetSession)) {
    return {
      phase: 'error',
      detail: pair(
        resolved.label
          ? `没有匹配 ${resolved.label} 的活动运行，可改用 /redirect。`
          : '当前没有活动运行，可改用 /redirect。',
        resolved.label
          ? `No active run matched ${resolved.label}; try /redirect instead.`
          : 'There is no active run; try /redirect instead.',
      ),
    };
  }

  await client.request('chat.send', {
    sessionKey: resolved.key,
    message: resolved.message,
    deliver: false,
    idempotencyKey: generateClientRequestId(),
  });

  const shouldTrackCurrentRun = resolved.key === sessionKey && normalizeString(context.activeRunId);
  return {
    phase: shouldTrackCurrentRun ? 'accepted' : 'completed',
    runId: shouldTrackCurrentRun ? normalizeString(context.activeRunId) : null,
    detail: pair(
      resolved.label
        ? `已向 ${resolved.label} 注入一条引导消息。`
        : (shouldTrackCurrentRun
            ? '已向当前运行注入一条引导消息，等待宿主继续执行。'
            : '已向当前运行注入一条引导消息。'),
      resolved.label
        ? `Steered ${resolved.label}.`
        : (shouldTrackCurrentRun
            ? 'Steered the current run and waiting for the host to continue.'
            : 'Steered the current run.'),
    ),
  };
}

async function executeRedirect(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  args: string,
): Promise<StudioSlashLocalExecutionResult> {
  const resolved = await resolveSteerTarget(client, sessionKey, args);
  if ('error' in resolved) {
    return {
      phase: 'error',
      detail: pair(
        resolved.error === 'empty'
          ? '用法：/redirect [id] <message>'
          : '匹配到多个子代理，请给出更具体的目标。',
        resolved.error === 'empty'
          ? 'Usage: /redirect [id] <message>'
          : 'Multiple subagents matched; use a more specific target.',
      ),
    };
  }

  const response = await client.request<{ runId?: string | null }>('sessions.steer', {
    key: resolved.key,
    message: resolved.message,
  });
  const runId = normalizeString(response?.runId);
  const shouldTrackCurrentRun = resolved.key === sessionKey && runId;
  return {
    phase: shouldTrackCurrentRun ? 'accepted' : 'completed',
    runId: shouldTrackCurrentRun ? runId : null,
    detail: pair(
      resolved.label
        ? `已重定向 ${resolved.label}。`
        : (shouldTrackCurrentRun
            ? '已重定向当前运行，等待宿主开始新的执行。'
            : '已重定向当前运行。'),
      resolved.label
        ? `Redirected ${resolved.label}.`
        : (shouldTrackCurrentRun
            ? 'Redirected the current run and waiting for the host to restart it.'
            : 'Redirected the current run.'),
    ),
  };
}

export async function executeStudioSlashLocalGatewayCommand(
  client: StudioSlashLocalGatewayClient,
  sessionKey: string,
  commandName: string,
  args: string,
  context: StudioSlashLocalExecutionContext = {},
): Promise<StudioSlashLocalExecutionResult | null> {
  switch (commandName) {
    case 'compact':
      return executeCompact(client, sessionKey);
    case 'skill':
      return executeSkill(client, sessionKey, args);
    case 'allowlist':
      return executeAllowlist(client, sessionKey, args);
    case 'tasks':
      return executeTasks(client, sessionKey, context);
    case 'queue':
      return executeQueue(args, context);
    case 'context':
      return executeContext(client, sessionKey, args, context);
    case 'tools':
      return executeTools(client, sessionKey, args);
    case 'tts':
      return executeTts(client, args);
    case 'approve':
      return executeApprove(client, args);
    case 'whoami':
      return executeWhoami(sessionKey);
    case 'session':
      return executeSessionCommand(client, sessionKey, args, context);
    case 'acp':
      return executeAcp(client, sessionKey, args, context);
    case 'debug':
      return executeDebug(client, args, context);
    case 'focus':
      return executeFocusCommand(sessionKey);
    case 'unfocus':
      return executeUnfocusCommand(sessionKey);
    case 'config':
      return executeConfig(client, args);
    case 'plugins':
      return executePlugins(client, args);
    case 'mcp':
      return executeMcp(client, args);
    case 'model':
      return executeModel(client, sessionKey, args, context);
    case 'think':
      return executeThink(client, sessionKey, args);
    case 'reasoning':
      return executeReasoning(client, sessionKey, args);
    case 'verbose':
      return executeVerbose(client, sessionKey, args);
    case 'fast':
      return executeFast(client, sessionKey, args);
    case 'usage':
      return executeUsage(client, sessionKey, args, context);
    case 'elevated':
      return executeElevated(client, sessionKey, args);
    case 'exec':
      return executeExec(client, sessionKey, args);
    case 'activation':
      return executeActivation(client, sessionKey, args);
    case 'send':
      return executeSendPolicy(client, sessionKey, args);
    case 'models':
      return executeModels(client, args);
    case 'agents':
      return executeAgents(client);
    case 'subagents':
      return executeSubagents(client, sessionKey, args, context);
    case 'kill':
      return executeKill(client, sessionKey, args);
    case 'btw':
      return executeForwardSlashCommand(client, sessionKey, commandName, args);
    case 'steer':
      return executeSteer(client, sessionKey, args, context);
    case 'redirect':
      return executeRedirect(client, sessionKey, args);
    default:
      return null;
  }
}
