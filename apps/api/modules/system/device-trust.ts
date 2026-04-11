import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  SystemDeviceTrustApproveRequest,
  SystemDeviceTrustApproveResponse,
  SystemDeviceTrustHelperStatus,
  SystemDeviceTrustPayload,
  SystemDeviceTrustPendingRequest,
  SystemDeviceTrustRepairResponse,
  SystemDeviceTrustSettings,
  SystemDeviceTrustSettingsPatchRequest,
  SystemDeviceTrustSettingsPatchResponse,
} from '../../../../types/system.js';
import type { StudioServerConfig } from '../../../../types/api.js';
import { readJsonFile } from '../../core/state.js';

const execFileAsync = promisify(execFile);
const DEVICE_TRUST_SETTINGS_FILE = path.join('studio', 'device-trust.json');
const DEFAULT_DEVICE_TRUST_SETTINGS: SystemDeviceTrustSettings = {
  autoApproveLocalHelper: true,
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readSettingsPath(config: StudioServerConfig): string {
  return path.join(config.openclawRoot, DEVICE_TRUST_SETTINGS_FILE);
}

function writeJsonFile(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // best-effort
  }
}

export function readDeviceTrustSettings(config: StudioServerConfig): SystemDeviceTrustSettings {
  const raw = readJsonFile<Record<string, unknown>>(readSettingsPath(config), {});
  return {
    autoApproveLocalHelper: raw.autoApproveLocalHelper !== false,
  };
}

export function patchDeviceTrustSettings(
  config: StudioServerConfig,
  payload: SystemDeviceTrustSettingsPatchRequest,
): SystemDeviceTrustSettingsPatchResponse {
  const current = readDeviceTrustSettings(config);
  const next: SystemDeviceTrustSettings = {
    autoApproveLocalHelper: typeof payload.autoApproveLocalHelper === 'boolean'
      ? payload.autoApproveLocalHelper
      : current.autoApproveLocalHelper,
  };
  writeJsonFile(readSettingsPath(config), next);
  return {
    ok: true,
    settings: next,
  };
}

function readPendingRequests(config: StudioServerConfig): SystemDeviceTrustPendingRequest[] {
  const payload = readJsonFile<Record<string, Record<string, unknown>>>(
    path.join(config.openclawRoot, 'devices', 'pending.json'),
    {},
  );
  return Object.values(payload || {})
    .map((item) => ({
      requestId: normalizeString(item.requestId),
      deviceId: normalizeString(item.deviceId),
      publicKey: normalizeString(item.publicKey),
      platform: normalizeString(item.platform),
      deviceFamily: normalizeString(item.deviceFamily),
      clientId: normalizeString(item.clientId),
      clientMode: normalizeString(item.clientMode),
      role: normalizeString(item.role),
      scopes: Array.isArray(item.scopes) ? item.scopes.map((value) => String(value).trim()).filter(Boolean) : [],
      isRepair: item.isRepair === true,
      silent: item.silent === true,
      requestedAt: typeof item.ts === 'number' ? new Date(item.ts).toISOString() : null,
    }))
    .filter((item) => Boolean(item.requestId));
}

function readHelperStatus(
  config: StudioServerConfig,
  pendingRequests: SystemDeviceTrustPendingRequest[],
): SystemDeviceTrustHelperStatus {
  const deviceAuth = readJsonFile<Record<string, unknown>>(path.join(config.openclawRoot, 'identity', 'device-auth.json'), {});
  const paired = readJsonFile<Record<string, Record<string, unknown>>>(path.join(config.openclawRoot, 'devices', 'paired.json'), {});
  const helperDeviceId = normalizeString(deviceAuth.deviceId);
  const pairedRecord = helperDeviceId ? paired[helperDeviceId] : undefined;
  const pairedToken = pairedRecord?.tokens && typeof pairedRecord.tokens === 'object'
    ? (pairedRecord.tokens as Record<string, Record<string, unknown>>).operator
    : undefined;
  const storedToken = (deviceAuth as any)?.tokens?.operator;
  const storedTokenValue = normalizeString(storedToken?.token);
  const pairedTokenValue = normalizeString(pairedToken?.token);
  const helperPending = pendingRequests
    .filter((entry) => entry.deviceId === helperDeviceId && entry.role === 'operator')
    .sort((left, right) => {
      const leftTs = left.requestedAt ? Date.parse(left.requestedAt) : 0;
      const rightTs = right.requestedAt ? Date.parse(right.requestedAt) : 0;
      return rightTs - leftTs;
    })[0] || null;
  const pairedPlatform = normalizeString(pairedRecord?.platform);
  const pairedDeviceFamily = normalizeString(pairedRecord?.deviceFamily);
  const pendingDeviceFamily = normalizeString(helperPending?.deviceFamily);
  return {
    deviceId: helperDeviceId,
    clientId: normalizeString(pairedRecord?.clientId || 'cli'),
    clientMode: normalizeString(pairedRecord?.clientMode || 'backend'),
    paired: Boolean(pairedRecord),
    approvedScopes: Array.isArray(pairedRecord?.approvedScopes)
      ? pairedRecord!.approvedScopes.map((value) => String(value).trim()).filter(Boolean)
      : [],
    storedScopes: Array.isArray((deviceAuth as any)?.tokens?.operator?.scopes)
      ? (deviceAuth as any).tokens.operator.scopes.map((value: unknown) => String(value).trim()).filter(Boolean)
      : [],
    pendingRequestId: helperPending?.requestId || null,
    pendingRepair: helperPending?.isRepair === true,
    approvedAt: typeof pairedRecord?.approvedAtMs === 'number'
      ? new Date(Number(pairedRecord.approvedAtMs)).toISOString()
      : null,
    tokenInSync: Boolean(storedTokenValue && pairedTokenValue && storedTokenValue === pairedTokenValue),
    canSyncLocalToken: Boolean(helperDeviceId && pairedTokenValue),
    storedTokenUpdatedAt: typeof storedToken?.updatedAtMs === 'number'
      ? new Date(Number(storedToken.updatedAtMs)).toISOString()
      : null,
    pairedTokenUpdatedAt: typeof pairedToken?.rotatedAtMs === 'number'
      ? new Date(Number(pairedToken.rotatedAtMs)).toISOString()
      : typeof pairedToken?.createdAtMs === 'number'
        ? new Date(Number(pairedToken.createdAtMs)).toISOString()
        : null,
    pairedPlatform,
    pairedDeviceFamily,
    pendingPlatform: helperPending?.platform || null,
    pendingDeviceFamily: pendingDeviceFamily || null,
    pendingClientMode: helperPending?.clientMode || null,
    metadataRepairPending: Boolean(
      helperPending?.isRepair
      && pairedDeviceFamily
      && pendingDeviceFamily !== pairedDeviceFamily
    ),
  };
}

export function getDeviceTrustSnapshot(config: StudioServerConfig): SystemDeviceTrustPayload {
  const settings = readDeviceTrustSettings(config);
  const pending = readPendingRequests(config);
  const helper = readHelperStatus(config, pending);
  const notes: string[] = [];
  if (helper.pendingRepair) {
    notes.push('Studio helper 正在请求更高 operator 权限，已可由 Studio 本地自动或手动批准。');
  }
  if (!helper.paired) {
    notes.push('Studio helper 当前还没有稳定的 paired 记录，Chat/Terminal 后端桥可能退化。');
  }
  if (helper.storedScopes.length > 0 && helper.approvedScopes.length > 0) {
    const missing = helper.approvedScopes.filter((scope) => !helper.storedScopes.includes(scope));
    if (missing.length > 0) {
      notes.push(`device-auth.json 中缓存 scopes 落后于 paired 合同：${missing.join(', ')}`);
    }
  }
  if (helper.canSyncLocalToken && !helper.tokenInSync) {
    notes.push('本机 Studio helper 的 device-auth token 与 paired.json 中最新 operator token 不一致，部分本地工具可能会触发 pairing required 或异常断开。');
  }
  if (helper.metadataRepairPending) {
    notes.push(`本机 helper 当前存在 metadata repair pending：paired deviceFamily=${helper.pairedDeviceFamily || '<none>'}，当前 repair 请求 deviceFamily=${helper.pendingDeviceFamily || '<none>'}。这通常说明宿主内建 CLI / gateway-client 分支仍未携带完整 device metadata。`);
  }
  return {
    checkedAt: new Date().toISOString(),
    settings,
    helper,
    pending,
    pairedDeviceCount: Object.keys(readJsonFile<Record<string, unknown>>(path.join(config.openclawRoot, 'devices', 'paired.json'), {})).length,
    notes,
  };
}

export async function approveDeviceTrustRequest(
  config: StudioServerConfig,
  payload: SystemDeviceTrustApproveRequest,
): Promise<SystemDeviceTrustApproveResponse> {
  const requestId = normalizeString(payload.requestId);
  if (!requestId) {
    throw new Error('requestId is required');
  }
  await execFileAsync('openclaw', ['devices', 'approve', requestId], {
    timeout: 12_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return {
    ok: true,
    requestId,
    snapshot: getDeviceTrustSnapshot(config),
  };
}

function syncLocalHelperDeviceAuthToken(config: StudioServerConfig): boolean {
  const deviceAuthPath = path.join(config.openclawRoot, 'identity', 'device-auth.json');
  const deviceAuth = readJsonFile<Record<string, unknown>>(deviceAuthPath, {});
  const deviceId = normalizeString(deviceAuth.deviceId);
  if (!deviceId) {
    return false;
  }

  const paired = readJsonFile<Record<string, Record<string, unknown>>>(path.join(config.openclawRoot, 'devices', 'paired.json'), {});
  const pairedRecord = paired[deviceId];
  const pairedToken = pairedRecord?.tokens && typeof pairedRecord.tokens === 'object'
    ? (pairedRecord.tokens as Record<string, Record<string, unknown>>).operator
    : undefined;
  const nextToken = normalizeString(pairedToken?.token);
  if (!nextToken) {
    return false;
  }

  const storedToken = (deviceAuth as any)?.tokens?.operator;
  const currentToken = normalizeString(storedToken?.token);
  const nextScopes = Array.isArray(pairedToken?.scopes)
    ? pairedToken!.scopes.map((value) => String(value).trim()).filter(Boolean)
    : Array.isArray(pairedRecord?.approvedScopes)
      ? pairedRecord!.approvedScopes.map((value) => String(value).trim()).filter(Boolean)
      : [];
  const currentScopes = Array.isArray(storedToken?.scopes)
    ? storedToken.scopes.map((value: unknown) => String(value).trim()).filter(Boolean)
    : [];

  if (
    currentToken === nextToken
    && currentScopes.length === nextScopes.length
    && currentScopes.every((scope: string, index: number) => scope === nextScopes[index])
  ) {
    return false;
  }

  const nextStore = {
    version: 1,
    deviceId,
    tokens: {
      ...(((deviceAuth as any)?.tokens && typeof (deviceAuth as any).tokens === 'object') ? (deviceAuth as any).tokens : {}),
      operator: {
        token: nextToken,
        role: 'operator',
        scopes: nextScopes,
        updatedAtMs: Date.now(),
      },
    },
  };
  writeJsonFile(deviceAuthPath, nextStore);
  return true;
}

export async function maybeAutoApproveStudioHelperPairing(config: StudioServerConfig): Promise<boolean> {
  const snapshot = getDeviceTrustSnapshot(config);
  if (!snapshot.settings.autoApproveLocalHelper) {
    return false;
  }
  const requestId = snapshot.helper.pendingRequestId;
  if (!requestId) {
    return false;
  }
  await execFileAsync('openclaw', ['devices', 'approve', requestId], {
    timeout: 12_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return true;
}

export async function repairStudioHelperDeviceTrust(config: StudioServerConfig): Promise<SystemDeviceTrustRepairResponse> {
  const before = getDeviceTrustSnapshot(config);
  let approvedRequestId: string | null = null;
  let synchronizedToken = false;

  if (before.helper.pendingRequestId) {
    await execFileAsync('openclaw', ['devices', 'approve', before.helper.pendingRequestId], {
      timeout: 12_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    approvedRequestId = before.helper.pendingRequestId;
  }

  synchronizedToken = syncLocalHelperDeviceAuthToken(config);

  return {
    ok: true,
    approvedRequestId,
    synchronizedToken,
    snapshot: getDeviceTrustSnapshot(config),
  };
}

export function syncStudioHelperTokenCacheIfNeeded(config: StudioServerConfig): boolean {
  return syncLocalHelperDeviceAuthToken(config);
}

export function ensureDefaultDeviceTrustSettings(config: StudioServerConfig): void {
  const file = readSettingsPath(config);
  if (fs.existsSync(file)) {
    return;
  }
  writeJsonFile(file, DEFAULT_DEVICE_TRUST_SETTINGS);
}
