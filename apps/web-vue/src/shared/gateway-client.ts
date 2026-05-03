import { clearDeviceAuthToken, loadDeviceAuthToken, storeDeviceAuthToken } from './gateway-device-auth';
import { loadOrCreateDeviceIdentity, signDevicePayload } from './gateway-device-identity';
import {
  DEFAULT_GATEWAY_BROWSER_CLIENT_ID,
  resolveGatewayBrowserClientId,
} from '../../../../lib/gateway-client-info';
import { createUuid } from './uuid';

export type GatewayEventFrame = {
  type: 'event';
  event: string;
  payload?: unknown;
  seq?: number;
  stateVersion?: { presence: number; health: number };
};

export type GatewayResponseFrame = {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string; details?: unknown };
};

export type GatewayErrorInfo = {
  code: string;
  message: string;
  details?: unknown;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
};

type SelectedConnectAuth = {
  authToken?: string;
  authDeviceToken?: string;
  authPassword?: string;
  resolvedDeviceToken?: string;
  storedToken?: string;
  canFallbackToShared: boolean;
};

type GatewayDeviceAuthPayloadVersion = 'v2' | 'v3';

type ConnectPlan = {
  role: string;
  scopes: string[];
  client: GatewayConnectClientInfo;
  explicitGatewayToken?: string;
  selectedAuth: SelectedConnectAuth;
  auth?: GatewayConnectAuth;
  deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null;
  device?: GatewayConnectDevice;
};

type DeviceTokenRetryDecision = {
  deviceTokenRetryBudgetUsed: boolean;
  authDeviceToken?: string;
  explicitGatewayToken?: string;
  deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null;
  storedToken?: string;
  canRetryWithDeviceTokenHint: boolean;
  url: string;
};

export type GatewayHelloOk = {
  type: 'hello-ok';
  protocol: number;
  server?: {
    version?: string;
    connId?: string;
  };
  features?: { methods?: string[]; events?: string[] };
  snapshot?: unknown;
  auth?: {
    deviceToken?: string;
    role?: string;
    scopes?: string[];
    issuedAtMs?: number;
  };
  policy?: { tickIntervalMs?: number };
};

export type GatewayConnectAuth = {
  token?: string;
  deviceToken?: string;
  password?: string;
};

export type GatewayConnectDevice = {
  id: string;
  publicKey: string;
  signature: string;
  signedAt: number;
  nonce: string;
};

export type GatewayConnectClientInfo = {
  id: string;
  version: string;
  platform: string;
  mode: string;
  instanceId?: string;
};

export type GatewayConnectParams = {
  minProtocol: 3;
  maxProtocol: 3;
  client: GatewayConnectClientInfo;
  role: string;
  scopes: string[];
  device?: GatewayConnectDevice;
  caps: string[];
  auth?: GatewayConnectAuth;
  userAgent: string;
  locale: string;
};

export type GatewayBrowserClientOptions = {
  url: string;
  token?: string;
  password?: string;
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  mode?: string;
  instanceId?: string;
  connectDelayMs?: number;
  onHello?: (hello: GatewayHelloOk) => void;
  onEvent?: (evt: GatewayEventFrame) => void;
  onClose?: (info: { code: number; reason: string; error?: GatewayErrorInfo }) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

const CONNECT_FAILED_CLOSE_CODE = 4008;
const CONTROL_UI_OPERATOR_ROLE = 'operator';
const CONTROL_UI_OPERATOR_SCOPES = [
  'operator.admin',
  'operator.read',
  'operator.write',
  'operator.approvals',
  'operator.pairing',
] as const;

const ConnectErrorDetailCodes = {
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_MISMATCH: 'AUTH_TOKEN_MISMATCH',
  AUTH_PASSWORD_MISSING: 'AUTH_PASSWORD_MISSING',
  AUTH_PASSWORD_MISMATCH: 'AUTH_PASSWORD_MISMATCH',
  AUTH_BOOTSTRAP_TOKEN_INVALID: 'AUTH_BOOTSTRAP_TOKEN_INVALID',
  AUTH_DEVICE_TOKEN_MISMATCH: 'AUTH_DEVICE_TOKEN_MISMATCH',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',
  PAIRING_REQUIRED: 'PAIRING_REQUIRED',
  CONTROL_UI_DEVICE_IDENTITY_REQUIRED: 'CONTROL_UI_DEVICE_IDENTITY_REQUIRED',
  DEVICE_IDENTITY_REQUIRED: 'DEVICE_IDENTITY_REQUIRED',
  DEVICE_AUTH_SIGNATURE_INVALID: 'DEVICE_AUTH_SIGNATURE_INVALID',
} as const;

function normalizeDeviceMetadataForAuth(value?: string | null): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/[A-Z]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 32));
}

function normalizeAuthScopes(scopes: unknown): string[] {
  if (!Array.isArray(scopes)) {
    return [];
  }
  return scopes
    .map((scope) => (typeof scope === 'string' ? scope.trim() : ''))
    .filter(Boolean);
}

function buildDeviceAuthPayloadV2(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
}): string {
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    normalizeAuthScopes(params.scopes).join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
  ].join('|');
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token?: string | null;
  nonce: string;
  platform?: string | null;
  deviceFamily?: string | null;
}): string {
  return [
    'v3',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    normalizeAuthScopes(params.scopes).join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
    normalizeDeviceMetadataForAuth(params.platform),
    normalizeDeviceMetadataForAuth(params.deviceFamily),
  ].join('|');
}

function buildDeviceAuthPayload(
  version: GatewayDeviceAuthPayloadVersion,
  params: {
    deviceId: string;
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    signedAtMs: number;
    token?: string | null;
    nonce: string;
    platform?: string | null;
    deviceFamily?: string | null;
  },
): string {
  if (version === 'v3') {
    return buildDeviceAuthPayloadV3(params);
  }
  return buildDeviceAuthPayloadV2(params);
}

function readConnectErrorDetailCode(details: unknown): string | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return null;
  }
  const code = (details as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code : null;
}

function readConnectErrorRecoveryAdvice(details: unknown): {
  canRetryWithDeviceToken?: boolean;
  recommendedNextStep?: string;
} {
  if (!details || typeof details !== 'object' || Array.isArray(details)) {
    return {};
  }
  const raw = details as {
    canRetryWithDeviceToken?: unknown;
    recommendedNextStep?: unknown;
  };
  return {
    canRetryWithDeviceToken:
      typeof raw.canRetryWithDeviceToken === 'boolean' ? raw.canRetryWithDeviceToken : undefined,
    recommendedNextStep:
      typeof raw.recommendedNextStep === 'string' ? raw.recommendedNextStep.trim() : undefined,
  };
}

function resolveGatewayErrorDetailCode(
  error: { details?: unknown } | null | undefined,
): string | null {
  return readConnectErrorDetailCode(error?.details);
}

function isNonRecoverableAuthError(error: GatewayErrorInfo | undefined): boolean {
  if (!error) {
    return false;
  }
  const code = resolveGatewayErrorDetailCode(error);
  return (
    code === ConnectErrorDetailCodes.AUTH_TOKEN_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_BOOTSTRAP_TOKEN_INVALID ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISSING ||
    code === ConnectErrorDetailCodes.AUTH_PASSWORD_MISMATCH ||
    code === ConnectErrorDetailCodes.AUTH_RATE_LIMITED ||
    code === ConnectErrorDetailCodes.PAIRING_REQUIRED ||
    code === ConnectErrorDetailCodes.CONTROL_UI_DEVICE_IDENTITY_REQUIRED ||
    code === ConnectErrorDetailCodes.DEVICE_IDENTITY_REQUIRED
  );
}

function isTrustedRetryEndpoint(url: string): boolean {
  try {
    const gatewayUrl = new URL(url, window.location.href);
    const host = gatewayUrl.hostname.trim().toLowerCase();
    const isLoopbackHost =
      host === 'localhost' || host === '::1' || host === '[::1]' || host === '127.0.0.1';
    const isLoopbackIPv4 = host.startsWith('127.');
    if (isLoopbackHost || isLoopbackIPv4) {
      return true;
    }
    const pageUrl = new URL(window.location.href);
    return gatewayUrl.host === pageUrl.host;
  } catch {
    return false;
  }
}

function shouldRetryWithDeviceToken(params: DeviceTokenRetryDecision): boolean {
  return (
    !params.deviceTokenRetryBudgetUsed &&
    !params.authDeviceToken &&
    Boolean(params.explicitGatewayToken) &&
    Boolean(params.deviceIdentity) &&
    Boolean(params.storedToken) &&
    params.canRetryWithDeviceTokenHint &&
    isTrustedRetryEndpoint(params.url)
  );
}

function buildGatewayConnectAuth(selectedAuth: SelectedConnectAuth): GatewayConnectAuth | undefined {
  const authToken = selectedAuth.authToken;
  if (!(authToken || selectedAuth.authPassword)) {
    return undefined;
  }
  return {
    token: authToken,
    deviceToken: selectedAuth.authDeviceToken ?? selectedAuth.resolvedDeviceToken,
    password: selectedAuth.authPassword,
  };
}

async function buildGatewayConnectDevice(params: {
  deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null;
  client: GatewayConnectClientInfo;
  role: string;
  scopes: string[];
  authToken?: string;
  connectNonce: string | null;
  payloadVersion: GatewayDeviceAuthPayloadVersion;
}): Promise<GatewayConnectDevice | undefined> {
  const { deviceIdentity } = params;
  if (!deviceIdentity) {
    return undefined;
  }
  const nonce = params.connectNonce ?? '';
  const signedAtMs = Date.now();
  const payload = buildDeviceAuthPayload(params.payloadVersion, {
    deviceId: deviceIdentity.deviceId,
    clientId: params.client.id,
    clientMode: params.client.mode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs,
    token: params.authToken,
    nonce,
    platform: params.client.platform,
    deviceFamily: 'browser',
  });
  const signature = await signDevicePayload(deviceIdentity.privateKey, payload);
  return {
    id: deviceIdentity.deviceId,
    publicKey: deviceIdentity.publicKey,
    signature,
    signedAt: signedAtMs,
    nonce,
  };
}

export class GatewayRequestError extends Error {
  readonly gatewayCode: string;
  readonly details?: unknown;

  constructor(error: GatewayErrorInfo) {
    super(error.message);
    this.name = 'GatewayRequestError';
    this.gatewayCode = error.code;
    this.details = error.details;
  }
}

export class GatewayBrowserClient {
  private ws: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private closed = false;
  private lastSeq: number | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: number | null = null;
  private backoffMs = 800;
  private pendingConnectError: GatewayErrorInfo | undefined;
  private pendingDeviceTokenRetry = false;
  private deviceTokenRetryBudgetUsed = false;
  private deviceAuthPayloadVersion: GatewayDeviceAuthPayloadVersion = 'v2';
  private pendingDeviceAuthPayloadRetry = false;
  private deviceAuthPayloadRetryBudgetUsed = false;

  constructor(private readonly opts: GatewayBrowserClientOptions) {}

  start(): void {
    this.closed = false;
    this.connect();
  }

  stop(): void {
    this.closed = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.pendingConnectError = undefined;
    this.pendingDeviceTokenRetry = false;
    this.deviceTokenRetryBudgetUsed = false;
    this.deviceAuthPayloadVersion = 'v2';
    this.pendingDeviceAuthPayloadRetry = false;
    this.deviceAuthPayloadRetryBudgetUsed = false;
    this.flushPending(new Error('gateway client stopped'));
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'));
    }
    const id = createUuid('gateway');
    const frame = { type: 'req', id, method, params };
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
    this.ws.send(JSON.stringify(frame));
    return promise;
  }

  private connect(): void {
    if (this.closed) {
      return;
    }
    this.ws = new WebSocket(this.opts.url);
    this.ws.addEventListener('open', () => this.queueConnect());
    this.ws.addEventListener('message', (event) => this.handleMessage(String(event.data ?? '')));
    this.ws.addEventListener('close', (event) => {
      const reason = String(event.reason ?? '');
      const connectError = this.pendingConnectError;
      this.pendingConnectError = undefined;
      this.ws = null;
      this.flushPending(new Error(`gateway closed (${event.code}): ${reason}`));
      this.opts.onClose?.({ code: event.code, reason, error: connectError });
      const connectErrorCode = resolveGatewayErrorDetailCode(connectError);
      if (
        connectErrorCode === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH &&
        this.deviceTokenRetryBudgetUsed &&
        !this.pendingDeviceTokenRetry
      ) {
        return;
      }
      if (
        connectErrorCode === ConnectErrorDetailCodes.DEVICE_AUTH_SIGNATURE_INVALID &&
        this.deviceAuthPayloadRetryBudgetUsed &&
        !this.pendingDeviceAuthPayloadRetry
      ) {
        return;
      }
      if (!isNonRecoverableAuthError(connectError)) {
        this.scheduleReconnect();
      }
    });
    this.ws.addEventListener('error', () => {
      // close handler will run
    });
  }

  private scheduleReconnect(): void {
    if (this.closed) {
      return;
    }
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 1.7, 15_000);
    window.setTimeout(() => this.connect(), delay);
  }

  private flushPending(error: Error): void {
    for (const [, pending] of this.pending) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private buildConnectClient(): GatewayConnectClientInfo {
    return {
      id: resolveGatewayBrowserClientId(this.opts.clientName ?? DEFAULT_GATEWAY_BROWSER_CLIENT_ID),
      version: this.opts.clientVersion ?? 'openclaw-studio',
      platform: this.opts.platform ?? navigator.platform ?? 'web',
      mode: this.opts.mode ?? 'webchat',
      instanceId: this.opts.instanceId,
    };
  }

  private buildConnectParams(plan: ConnectPlan): GatewayConnectParams {
    return {
      minProtocol: 3,
      maxProtocol: 3,
      client: plan.client,
      role: plan.role,
      scopes: plan.scopes,
      device: plan.device,
      caps: ['tool-events'],
      auth: plan.auth,
      userAgent: navigator.userAgent || 'openclaw-studio',
      locale: navigator.language || 'en',
    };
  }

  private selectConnectAuth(params: { role: string; deviceId: string }): SelectedConnectAuth {
    const explicitGatewayToken = this.opts.token?.trim() || undefined;
    const authPassword = this.opts.password?.trim() || undefined;
    const storedEntry = loadDeviceAuthToken({
      deviceId: params.deviceId,
      role: params.role,
    });
    const storedScopes = storedEntry?.scopes ?? [];
    const storedTokenCanRead =
      params.role !== CONTROL_UI_OPERATOR_ROLE ||
      storedScopes.includes('operator.read') ||
      storedScopes.includes('operator.write') ||
      storedScopes.includes('operator.admin');
    const storedToken = storedTokenCanRead ? storedEntry?.token : undefined;
    const shouldSendStoredDeviceToken = Boolean(storedToken) && isTrustedRetryEndpoint(this.opts.url);
    const shouldUseDeviceRetryToken =
      this.pendingDeviceTokenRetry &&
      Boolean(explicitGatewayToken) &&
      Boolean(storedToken) &&
      isTrustedRetryEndpoint(this.opts.url);
    const resolvedDeviceToken = !(explicitGatewayToken || authPassword)
      ? (storedToken ?? undefined)
      : undefined;
    const authToken = explicitGatewayToken ?? resolvedDeviceToken;
    return {
      authToken,
      authDeviceToken: shouldUseDeviceRetryToken
        ? (storedToken ?? undefined)
        : shouldSendStoredDeviceToken
          ? (storedToken ?? undefined)
          : undefined,
      authPassword,
      resolvedDeviceToken,
      storedToken: storedToken ?? undefined,
      canFallbackToShared: Boolean(storedToken && explicitGatewayToken),
    };
  }

  private async buildConnectPlan(): Promise<ConnectPlan> {
    const role = CONTROL_UI_OPERATOR_ROLE;
    const scopes = [...CONTROL_UI_OPERATOR_SCOPES];
    const client = this.buildConnectClient();
    const explicitGatewayToken = this.opts.token?.trim() || undefined;
    const isSecureContext = typeof crypto !== 'undefined' && Boolean(crypto.subtle);
    let deviceIdentity: Awaited<ReturnType<typeof loadOrCreateDeviceIdentity>> | null = null;
    let selectedAuth: SelectedConnectAuth = {
      authToken: explicitGatewayToken,
      authPassword: this.opts.password?.trim() || undefined,
      canFallbackToShared: false,
    };

    if (isSecureContext) {
      deviceIdentity = await loadOrCreateDeviceIdentity();
      selectedAuth = this.selectConnectAuth({
        role,
        deviceId: deviceIdentity.deviceId,
      });
      if (this.pendingDeviceTokenRetry && selectedAuth.authDeviceToken) {
        this.pendingDeviceTokenRetry = false;
      }
    }

    return {
      role,
      scopes,
      client,
      explicitGatewayToken,
      selectedAuth,
      auth: buildGatewayConnectAuth(selectedAuth),
      deviceIdentity,
      device: await buildGatewayConnectDevice({
        deviceIdentity,
        client,
        role,
        scopes,
        authToken: selectedAuth.authToken,
        connectNonce: this.connectNonce,
        payloadVersion: this.deviceAuthPayloadVersion,
      }),
    };
  }

  private handleConnectHello(hello: GatewayHelloOk, plan: ConnectPlan): void {
    this.pendingDeviceTokenRetry = false;
    this.deviceTokenRetryBudgetUsed = false;
    this.pendingDeviceAuthPayloadRetry = false;
    this.deviceAuthPayloadRetryBudgetUsed = false;
    if (hello?.auth?.deviceToken && plan.deviceIdentity) {
      storeDeviceAuthToken({
        deviceId: plan.deviceIdentity.deviceId,
        role: hello.auth.role ?? plan.role,
        token: hello.auth.deviceToken,
        scopes: hello.auth.scopes ?? [],
      });
    }
    this.backoffMs = 800;
    this.opts.onHello?.(hello);
  }

  private handleConnectFailure(error: unknown, plan: ConnectPlan): void {
    const connectErrorCode =
      error instanceof GatewayRequestError ? resolveGatewayErrorDetailCode(error) : null;
    const recoveryAdvice =
      error instanceof GatewayRequestError ? readConnectErrorRecoveryAdvice(error.details) : {};
    const retryWithDeviceTokenRecommended =
      recoveryAdvice.recommendedNextStep === 'retry_with_device_token';
    const canRetryWithDeviceTokenHint =
      recoveryAdvice.canRetryWithDeviceToken === true ||
      retryWithDeviceTokenRecommended ||
      connectErrorCode === ConnectErrorDetailCodes.AUTH_TOKEN_MISMATCH;
    const canRetryWithAlternatePayloadVersion =
      connectErrorCode === ConnectErrorDetailCodes.DEVICE_AUTH_SIGNATURE_INVALID &&
      !this.deviceAuthPayloadRetryBudgetUsed;

    this.pendingDeviceAuthPayloadRetry = false;
    if (canRetryWithAlternatePayloadVersion) {
      this.deviceAuthPayloadVersion = this.deviceAuthPayloadVersion === 'v2' ? 'v3' : 'v2';
      this.pendingDeviceAuthPayloadRetry = true;
      this.deviceAuthPayloadRetryBudgetUsed = true;
    }

    if (shouldRetryWithDeviceToken({
      deviceTokenRetryBudgetUsed: this.deviceTokenRetryBudgetUsed,
      authDeviceToken: plan.selectedAuth.authDeviceToken,
      explicitGatewayToken: plan.explicitGatewayToken,
      deviceIdentity: plan.deviceIdentity,
      storedToken: plan.selectedAuth.storedToken,
      canRetryWithDeviceTokenHint,
      url: this.opts.url,
    })) {
      this.pendingDeviceTokenRetry = true;
      this.deviceTokenRetryBudgetUsed = true;
    }

    if (error instanceof GatewayRequestError) {
      this.pendingConnectError = {
        code: error.gatewayCode,
        message: error.message,
        details: error.details,
      };
    } else {
      this.pendingConnectError = undefined;
    }

    if (
      plan.selectedAuth.canFallbackToShared &&
      plan.deviceIdentity &&
      connectErrorCode === ConnectErrorDetailCodes.AUTH_DEVICE_TOKEN_MISMATCH
    ) {
      clearDeviceAuthToken({ deviceId: plan.deviceIdentity.deviceId, role: plan.role });
    }

    this.ws?.close(CONNECT_FAILED_CLOSE_CODE, 'connect failed');
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent) {
      return;
    }
    this.connectSent = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const plan = await this.buildConnectPlan();
    void this.request<GatewayHelloOk>('connect', this.buildConnectParams(plan))
      .then((hello) => this.handleConnectHello(hello, plan))
      .catch((error: unknown) => this.handleConnectFailure(error, plan));
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const frame = parsed as { type?: unknown };
    if (frame.type === 'event') {
      const event = parsed as GatewayEventFrame;
      if (event.event === 'connect.challenge') {
        const payload = event.payload as { nonce?: unknown } | undefined;
        const nonce = payload && typeof payload.nonce === 'string' ? payload.nonce : null;
        if (nonce) {
          this.connectNonce = nonce;
          void this.sendConnect();
        }
        return;
      }

      const seq = typeof event.seq === 'number' ? event.seq : null;
      if (seq !== null) {
        if (this.lastSeq !== null && seq > this.lastSeq + 1) {
          this.opts.onGap?.({ expected: this.lastSeq + 1, received: seq });
        }
        this.lastSeq = seq;
      }
      this.opts.onEvent?.(event);
      return;
    }

    if (frame.type === 'res') {
      const response = parsed as GatewayResponseFrame;
      const pending = this.pending.get(response.id);
      if (!pending) {
        return;
      }
      this.pending.delete(response.id);
      if (response.ok) {
        pending.resolve(response.payload);
      } else {
        pending.reject(new GatewayRequestError({
          code: response.error?.code ?? 'UNAVAILABLE',
          message: response.error?.message ?? 'request failed',
          details: response.error?.details,
        }));
      }
    }
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
    }
    this.connectTimer = window.setTimeout(() => {
      void this.sendConnect();
    }, this.resolveConnectDelayMs());
  }

  private resolveConnectDelayMs(): number {
    const delayMs = Number(this.opts.connectDelayMs);
    if (!Number.isFinite(delayMs)) {
      return 750;
    }
    return Math.max(0, Math.min(750, Math.floor(delayMs)));
  }
}
