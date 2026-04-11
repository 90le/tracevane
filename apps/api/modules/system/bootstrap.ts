import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import type { StudioServerConfig } from '../../../../types/api.js';
import type {
  SystemBootstrapCheck,
  SystemBootstrapPayload,
  SystemBootstrapRepairResponse,
} from '../../../../types/system.js';
import { readOpenClawConfig, writeJsonFile } from '../../core/state.js';
import {
  applySafeDreamingBootstrapRepair,
  inspectDreamingConfig,
} from './dreaming-shared.js';

const SUPPORTED_BINDS = new Set(['auto', 'loopback', 'lan', 'tailnet', 'custom']);
const NON_DOCKER_SANDBOX_BACKENDS = new Set(['ssh', 'openshell']);

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const entry of value) {
    const normalized = normalizeString(entry);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    items.push(normalized);
  }
  return items;
}

function hasDockerCommand(): boolean {
  const result = spawnSync('docker', ['--version'], { stdio: 'ignore' });
  return !result.error && result.status === 0;
}

function normalizeSandboxBackend(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function sandboxNeedsDocker(
  sandboxConfig: Record<string, unknown> | null | undefined,
  inheritedBackend: unknown = '',
): boolean {
  const mode = normalizeString(sandboxConfig?.mode).toLowerCase();
  if (!mode || mode === 'off') return false;
  const backend = normalizeSandboxBackend((sandboxConfig as Record<string, unknown> | undefined)?.backend || inheritedBackend);
  return !NON_DOCKER_SANDBOX_BACKENDS.has(backend);
}

function buildExpectedLocalOrigins(port: number): string[] {
  return [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ];
}

function buildBootstrapChecks(config: StudioServerConfig, openclawConfig: Record<string, any>): SystemBootstrapCheck[] {
  const pluginEntries = openclawConfig.plugins?.entries && typeof openclawConfig.plugins.entries === 'object'
    ? openclawConfig.plugins.entries as Record<string, Record<string, unknown>>
    : {};
  const pluginAllow = normalizeStringList(openclawConfig.plugins?.allow);
  const pluginLoadPaths = normalizeStringList(openclawConfig.plugins?.load?.paths);
  const gateway = openclawConfig.gateway && typeof openclawConfig.gateway === 'object'
    ? openclawConfig.gateway as Record<string, any>
    : {};
  const gatewayAuth = gateway.auth && typeof gateway.auth === 'object'
    ? gateway.auth as Record<string, unknown>
    : {};
  const gatewayControlUi = gateway.controlUi && typeof gateway.controlUi === 'object'
    ? gateway.controlUi as Record<string, unknown>
    : {};

  const authMode = normalizeString(gatewayAuth.mode) || 'token';
  const bindMode = normalizeString(gateway.bind);
  const allowedOrigins = normalizeStringList(gatewayControlUi.allowedOrigins);
  const expectedOrigins = buildExpectedLocalOrigins(Number(gateway.port) || config.gatewayPort);
  const missingOrigins = expectedOrigins.filter((origin) => !allowedOrigins.includes(origin));
  const hasGatewayToken = authMode !== 'token' || Boolean(normalizeString(gatewayAuth.token));
  const pluginEntryEnabled = pluginEntries.studio?.enabled !== false;
  const allowlistSatisfied = pluginAllow.length === 0 || pluginAllow.includes('studio');
  const loadPathSatisfied = pluginLoadPaths.includes(config.projectRoot);
  const bindSupported = !bindMode || SUPPORTED_BINDS.has(bindMode);
  const dockerAvailable = hasDockerCommand();
  const defaultSandbox = openclawConfig.agents?.defaults?.sandbox && typeof openclawConfig.agents.defaults.sandbox === 'object'
    ? openclawConfig.agents.defaults.sandbox as Record<string, unknown>
    : null;
  const rawAgentList: unknown[] = Array.isArray(openclawConfig.agents?.list)
    ? openclawConfig.agents.list as unknown[]
    : [];
  const agentList = rawAgentList
    .filter((agent: unknown): agent is Record<string, unknown> => Boolean(agent) && typeof agent === 'object');
  const dockerBlockedAgents = !dockerAvailable
    ? agentList
      .filter((agent: Record<string, unknown>) => sandboxNeedsDocker(agent.sandbox as Record<string, unknown> | undefined, defaultSandbox?.backend))
      .map((agent: Record<string, unknown>) => normalizeString(agent.id))
      .filter(Boolean)
    : [];
  const defaultSandboxNeedsDocker = !dockerAvailable && sandboxNeedsDocker(defaultSandbox);
  const dreaming = inspectDreamingConfig(openclawConfig);

  return [
    {
      id: 'plugin-entry',
      label: 'Studio plugin',
      level: pluginEntryEnabled && allowlistSatisfied ? 'ok' : 'error',
      summary: pluginEntryEnabled && allowlistSatisfied
        ? 'Studio plugin 已启用'
        : 'Studio plugin 未加入 allowlist 或被禁用',
      detail: pluginEntryEnabled && allowlistSatisfied
        ? 'plugins.entries.studio 与 plugins.allow 当前允许 Studio 在宿主中稳定加载。'
        : '需要确保 plugins.entries.studio.enabled=true，且当 plugins.allow 存在时包含 studio。',
      detected: true,
      fixable: true,
    },
    {
      id: 'plugin-load-path',
      label: 'Plugin load path',
      level: loadPathSatisfied ? 'ok' : 'warn',
      summary: loadPathSatisfied
        ? 'Studio 扩展目录已写入 plugins.load.paths'
        : 'plugins.load.paths 缺少当前 Studio 目录',
      detail: loadPathSatisfied
        ? config.projectRoot
        : `建议加入 ${config.projectRoot}，避免新环境重启后无法重新加载 Studio。`,
      detected: true,
      fixable: true,
    },
    {
      id: 'gateway-auth-token',
      label: 'Gateway auth',
      level: hasGatewayToken ? 'ok' : 'error',
      summary: hasGatewayToken
        ? `gateway.auth.mode=${authMode}`
        : 'gateway.auth.mode=token 但未配置 token',
      detail: hasGatewayToken
        ? 'Studio backend bridge 需要宿主当前的网关鉴权信息来完成本地桥接。'
        : '如果是新环境，Studio 可以补一个随机 token，避免 chat/system bridge 因缺少 token 直接不可用。',
      detected: true,
      fixable: true,
    },
    {
      id: 'gateway-allowed-origins',
      label: 'Control UI origins',
      level: missingOrigins.length === 0 ? 'ok' : 'warn',
      summary: missingOrigins.length === 0
        ? '本机 local origins 已齐全'
        : `缺少 ${missingOrigins.length} 个推荐 origin`,
      detail: missingOrigins.length === 0
        ? expectedOrigins.join(', ')
        : `建议至少包含 ${missingOrigins.join(', ')}，避免新设备/浏览器首次访问 /studio 时被 controlUi origin 策略挡住。`,
      detected: true,
      fixable: true,
    },
    {
      id: 'gateway-bind',
      label: 'Gateway bind',
      level: bindSupported ? 'ok' : 'warn',
      summary: bindSupported
        ? (bindMode || '未显式设置，将使用宿主默认值')
        : `发现不受支持的 bind 值：${bindMode}`,
      detail: bindSupported
        ? 'Studio 单口模式只要求外网入口单一；宿主本机 loopback 仍可保留。'
        : 'Studio 会把旧值修正成 loopback，避免新版本 gateway restart 因遗留别名失败。',
      detected: true,
      fixable: true,
    },
    {
      id: 'dreaming-memory-slot',
      label: 'Dreaming memory slot',
      level: dreaming.issues.length === 0 ? 'ok' : dreaming.bootstrapRepairable ? 'error' : 'warn',
      summary: dreaming.issues.length === 0
        ? 'Dreaming / memory slot configuration is internally consistent'
        : dreaming.issues[0] || 'Dreaming configuration needs attention',
      detail: dreaming.issues.length === 0
        ? (
          dreaming.slotDisabled
            ? 'Dreaming is currently disabled or not pinned to an active memory slot.'
            : `Active memory slot: ${dreaming.slotValue}.`
        )
        : dreaming.notes.join(' '),
      detected: true,
      fixable: dreaming.bootstrapRepairable,
    },
    {
      id: 'sandbox-runtime',
      label: 'Sandbox runtime',
      level: (!dockerAvailable && (defaultSandboxNeedsDocker || dockerBlockedAgents.length > 0)) ? 'warn' : 'ok',
      summary: (!dockerAvailable && (defaultSandboxNeedsDocker || dockerBlockedAgents.length > 0))
        ? '当前环境未安装 Docker，已检测到会触发 Docker 沙盒的配置'
        : 'Sandbox 运行时依赖检查通过',
      detail: (!dockerAvailable && (defaultSandboxNeedsDocker || dockerBlockedAgents.length > 0))
        ? [
          defaultSandboxNeedsDocker ? 'agents.defaults.sandbox.mode 将自动收敛到 off。' : '',
          dockerBlockedAgents.length > 0 ? `以下 Agent 也会被自动切到 off：${dockerBlockedAgents.join(', ')}` : '',
        ].filter(Boolean).join(' ')
        : '若未来改用 ssh / openshell sandbox backend，这个检查不会强制关闭对应配置。',
      detected: true,
      fixable: !dockerAvailable,
    },
  ];
}

function applyBootstrapFixes(config: StudioServerConfig): { changed: boolean; changedKeys: string[] } {
  const openclawConfig = readOpenClawConfig(config);
  const changedKeys: string[] = [];

  openclawConfig.plugins = openclawConfig.plugins && typeof openclawConfig.plugins === 'object'
    ? openclawConfig.plugins
    : {};
  openclawConfig.plugins.entries = openclawConfig.plugins.entries && typeof openclawConfig.plugins.entries === 'object'
    ? openclawConfig.plugins.entries
    : {};
  openclawConfig.plugins.entries.studio = openclawConfig.plugins.entries.studio && typeof openclawConfig.plugins.entries.studio === 'object'
    ? openclawConfig.plugins.entries.studio
    : {};
  if (openclawConfig.plugins.entries.studio.enabled !== true) {
    openclawConfig.plugins.entries.studio.enabled = true;
    changedKeys.push('plugins.entries.studio.enabled');
  }

  if (Array.isArray(openclawConfig.plugins.allow)) {
    const allow = normalizeStringList(openclawConfig.plugins.allow);
    if (!allow.includes('studio')) {
      allow.push('studio');
      openclawConfig.plugins.allow = allow;
      changedKeys.push('plugins.allow');
    }
  }

  openclawConfig.plugins.load = openclawConfig.plugins.load && typeof openclawConfig.plugins.load === 'object'
    ? openclawConfig.plugins.load
    : {};
  const loadPaths = normalizeStringList(openclawConfig.plugins.load.paths);
  if (!loadPaths.includes(config.projectRoot)) {
    loadPaths.push(config.projectRoot);
    openclawConfig.plugins.load.paths = loadPaths;
    changedKeys.push('plugins.load.paths');
  }

  openclawConfig.gateway = openclawConfig.gateway && typeof openclawConfig.gateway === 'object'
    ? openclawConfig.gateway
    : {};
  if (!SUPPORTED_BINDS.has(normalizeString(openclawConfig.gateway.bind))) {
    openclawConfig.gateway.bind = 'loopback';
    changedKeys.push('gateway.bind');
  }

  openclawConfig.gateway.port = Number(openclawConfig.gateway.port) > 0
    ? openclawConfig.gateway.port
    : config.gatewayPort;

  openclawConfig.gateway.controlUi = openclawConfig.gateway.controlUi && typeof openclawConfig.gateway.controlUi === 'object'
    ? openclawConfig.gateway.controlUi
    : {};
  const expectedOrigins = buildExpectedLocalOrigins(Number(openclawConfig.gateway.port) || config.gatewayPort);
  const allowedOrigins = normalizeStringList(openclawConfig.gateway.controlUi.allowedOrigins);
  let allowedOriginsChanged = false;
  for (const origin of expectedOrigins) {
    if (!allowedOrigins.includes(origin)) {
      allowedOrigins.push(origin);
      allowedOriginsChanged = true;
    }
  }
  if (allowedOriginsChanged) {
    openclawConfig.gateway.controlUi.allowedOrigins = allowedOrigins;
    changedKeys.push('gateway.controlUi.allowedOrigins');
  }

  openclawConfig.gateway.auth = openclawConfig.gateway.auth && typeof openclawConfig.gateway.auth === 'object'
    ? openclawConfig.gateway.auth
    : {};
  const authMode = normalizeString(openclawConfig.gateway.auth.mode) || 'token';
  if (!normalizeString(openclawConfig.gateway.auth.mode)) {
    openclawConfig.gateway.auth.mode = authMode;
    changedKeys.push('gateway.auth.mode');
  }
  if (authMode === 'token' && !normalizeString(openclawConfig.gateway.auth.token)) {
    openclawConfig.gateway.auth.token = crypto.randomBytes(24).toString('base64url');
    changedKeys.push('gateway.auth.token');
  }

  if (!hasDockerCommand()) {
    openclawConfig.agents = openclawConfig.agents && typeof openclawConfig.agents === 'object'
      ? openclawConfig.agents
      : {};
    openclawConfig.agents.defaults = openclawConfig.agents.defaults && typeof openclawConfig.agents.defaults === 'object'
      ? openclawConfig.agents.defaults
      : {};
    openclawConfig.agents.defaults.sandbox = openclawConfig.agents.defaults.sandbox && typeof openclawConfig.agents.defaults.sandbox === 'object'
      ? openclawConfig.agents.defaults.sandbox
      : {};
    const defaultSandbox = openclawConfig.agents.defaults.sandbox as Record<string, unknown>;
    if (sandboxNeedsDocker(defaultSandbox)) {
      (defaultSandbox as Record<string, any>).mode = 'off';
      changedKeys.push('agents.defaults.sandbox.mode');
    }
    if (Array.isArray(openclawConfig.agents.list)) {
      const inheritedBackend = (defaultSandbox as Record<string, unknown>).backend;
      for (const rawAgent of openclawConfig.agents.list) {
        if (!rawAgent || typeof rawAgent !== 'object') continue;
        const agentId = normalizeString((rawAgent as Record<string, unknown>).id);
        const sandbox = (rawAgent as Record<string, any>).sandbox && typeof (rawAgent as Record<string, any>).sandbox === 'object'
          ? (rawAgent as Record<string, any>).sandbox as Record<string, unknown>
          : null;
        if (!sandboxNeedsDocker(sandbox, inheritedBackend)) continue;
        (rawAgent as Record<string, any>).sandbox = (rawAgent as Record<string, any>).sandbox || {};
        (rawAgent as Record<string, any>).sandbox.mode = 'off';
        changedKeys.push(`agents.list.${agentId || '<unknown>'}.sandbox.mode`);
      }
    }
  }

  const dreamingRepair = applySafeDreamingBootstrapRepair(openclawConfig);
  if (dreamingRepair.changed) {
    changedKeys.push(...dreamingRepair.changedKeys);
  }

  if (changedKeys.length > 0) {
    writeJsonFile(config.openclawConfigFile, openclawConfig);
  }

  return {
    changed: changedKeys.length > 0,
    changedKeys,
  };
}

export function getSystemBootstrapSnapshot(
  config: StudioServerConfig,
  autoApplied = false,
): SystemBootstrapPayload {
  const openclawConfig = readOpenClawConfig(config);
  const checks = buildBootstrapChecks(config, openclawConfig);
  const notes: string[] = [];
  if (checks.some((check) => check.level === 'error')) {
    notes.push('存在会直接影响 Studio 启动或单口桥接的配置缺口，建议先执行一次“应用推荐初始化”。');
  }
  if (checks.some((check) => check.id === 'gateway-allowed-origins' && check.level !== 'ok')) {
    notes.push('allowedOrigins 缺失时，新设备首次打开 /studio 可能表现为页面可见但鉴权/控制台桥接异常。');
  }
  return {
    checkedAt: new Date().toISOString(),
    ready: checks.every((check) => check.level === 'ok'),
    autoApplied,
    configPath: config.openclawConfigFile,
    stateDir: config.openclawRoot,
    checks,
    notes,
  };
}

export function applySafeStudioBootstrapDefaults(config: StudioServerConfig): boolean {
  return applyBootstrapFixes(config).changed;
}

export function repairSystemBootstrap(config: StudioServerConfig): SystemBootstrapRepairResponse {
  const result = applyBootstrapFixes(config);
  return {
    ok: true,
    changed: result.changed,
    changedKeys: result.changedKeys,
    snapshot: getSystemBootstrapSnapshot(config, result.changed),
  };
}
