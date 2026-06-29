import crypto from "node:crypto";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import { readJsonFile, readOpenClawConfig } from "../../core/state.js";
import { resolveSecretInputString } from "../../core/secret-ref.js";
import {
  OpenClawGatewayServiceError,
  buildOpenClawGatewayError,
} from "./openclaw-gateway-error.js";
import { normalizeString } from "./openclaw-gateway-shared.js";

export interface GatewayAuthContext {
  gatewayToken: string;
  deviceId: string;
  publicKey: string;
  privateKeyPem: string;
  scopes: string[];
}

export const TRACEVANE_GATEWAY_CAPS = ["tool-events"] as const;
const DEFAULT_OPERATOR_SCOPES = [
  "operator.admin",
  "operator.approvals",
  "operator.pairing",
  "operator.read",
  "operator.write",
] as const;

export type GatewaySignatureVersion = "v2" | "v3";

export function buildGatewaySignaturePayloadV2(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
}): string {
  return [
    "v2",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
  ].join("|");
}

export function buildGatewaySignaturePayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string | null;
  nonce: string;
  platform: string;
  deviceFamily: string;
}): string {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
    params.platform,
    params.deviceFamily,
  ].join("|");
}

export function buildGatewaySignaturePayload(
  version: GatewaySignatureVersion,
  params: {
    deviceId: string;
    clientId: string;
    clientMode: string;
    role: string;
    scopes: string[];
    signedAtMs: number;
    token: string | null;
    nonce: string;
    platform: string;
    deviceFamily: string;
  },
): string {
  if (version === "v3") {
    return buildGatewaySignaturePayloadV3(params);
  }
  return buildGatewaySignaturePayloadV2(params);
}

export function loadGatewayAuthContext(
  config: TracevaneServerConfig,
): GatewayAuthContext {
  const openclawConfig = readOpenClawConfig(config);
  const gatewayToken = resolveSecretInputString(
    openclawConfig,
    openclawConfig.gateway?.auth?.token,
    { envFilePath: path.join(config.openclawRoot, ".env") },
  );
  if (!gatewayToken) {
    throw new OpenClawGatewayServiceError(
      503,
      buildOpenClawGatewayError(
        "auth_failure",
        "Gateway token is not configured for Tracevane backend adapter.",
      ),
    );
  }

  const deviceAuth = readJsonFile<Record<string, any>>(
    path.join(config.openclawRoot, "identity", "device-auth.json"),
    {},
  );
  const deviceState = readJsonFile<Record<string, any>>(
    path.join(config.openclawRoot, "identity", "device.json"),
    {},
  );
  const paired = readJsonFile<Record<string, any>>(
    path.join(config.openclawRoot, "devices", "paired.json"),
    {},
  );

  const deviceId = normalizeString(deviceAuth.deviceId);
  const privateKeyPem = normalizeString(deviceState.privateKeyPem);
  const publicKey = normalizeString(paired[deviceId]?.publicKey);
  const persistedScopes = Array.isArray(deviceAuth.tokens?.operator?.scopes)
    ? deviceAuth.tokens.operator.scopes
        .map((value: unknown) => String(value).trim())
        .filter(Boolean)
    : [];
  const scopes = Array.from(
    new Set([...DEFAULT_OPERATOR_SCOPES, ...persistedScopes]),
  );

  if (!deviceId || !privateKeyPem || !publicKey) {
    throw new OpenClawGatewayServiceError(
      503,
      buildOpenClawGatewayError(
        "auth_failure",
        "Tracevane backend device identity is not fully configured.",
      ),
    );
  }

  return {
    gatewayToken,
    deviceId,
    publicKey,
    privateKeyPem,
    scopes,
  };
}

export function buildGatewayConnectRequest(params: {
  auth: GatewayAuthContext;
  connectRequestId: string;
  nonce: string;
  role: string;
  scopes: string[];
  signatureVersion?: GatewaySignatureVersion;
}): Record<string, unknown> {
  const signedAtMs = Date.now();
  const signaturePayload = buildGatewaySignaturePayload(
    params.signatureVersion || "v2",
    {
      deviceId: params.auth.deviceId,
      clientId: "cli",
      clientMode: "backend",
      role: params.role,
      scopes: params.scopes,
      signedAtMs,
      token: params.auth.gatewayToken,
      nonce: params.nonce,
      platform: process.platform,
      deviceFamily: "server",
    },
  );
  const signature = crypto
    .sign(null, Buffer.from(signaturePayload), params.auth.privateKeyPem)
    .toString("base64url");

  return {
    type: "req",
    id: params.connectRequestId,
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 5,
      client: {
        id: "cli",
        version: "tracevane",
        platform: process.platform,
        deviceFamily: "server",
        mode: "backend",
      },
      caps: [...TRACEVANE_GATEWAY_CAPS],
      role: params.role,
      scopes: params.scopes,
      auth: {
        token: params.auth.gatewayToken,
      },
      device: {
        id: params.auth.deviceId,
        publicKey: params.auth.publicKey,
        signature,
        signedAt: signedAtMs,
        nonce: params.nonce,
      },
      locale: "zh-CN",
      userAgent: "tracevane",
    },
  };
}
