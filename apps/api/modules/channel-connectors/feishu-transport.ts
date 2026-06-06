import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";
import { splitChannelConnectorTextChunks } from "./text-chunks.js";

const DEFAULT_FEISHU_API_URL = "https://open.feishu.cn";
const DEFAULT_TIMEOUT_MS = 30_000;
const FEISHU_TEXT_CHUNK_RUNES = 3800;
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000;

interface FeishuTokenCacheRecord {
  tenantAccessToken: string;
  expiresAt: string;
}

interface FeishuTenantTokenResult {
  token: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeApiUrl(value: unknown): string {
  return normalizeString(value).replace(/\/+$/, "") || DEFAULT_FEISHU_API_URL;
}

function metadataString(metadata: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(metadata[key]);
    if (value) return value;
  }
  return "";
}

export function feishuTransportFromMetadata(
  metadataValue: unknown,
  accountId?: string | null,
): ChannelConnectorFeishuTransportConfig | null {
  const metadata = recordFrom(metadataValue);
  const appId = metadataString(metadata, ["appId", "app_id", "feishuAppId", "feishu_app_id"]) || normalizeString(accountId);
  const appSecret = metadataString(metadata, ["appSecret", "app_secret", "feishuAppSecret", "feishu_app_secret"]);
  if (!appId || !appSecret) return null;
  return {
    apiUrl: normalizeApiUrl(metadata.apiUrl || metadata.api_url || metadata.domain || metadata.baseUrl || metadata.base_url),
    appId,
    appSecret,
  };
}

export function feishuTransportFromBinding(binding: ChannelConnectorPlatformBinding): ChannelConnectorFeishuTransportConfig | null {
  return feishuTransportFromMetadata(binding.metadata, binding.accountId);
}

function transportResult(
  input: Partial<ChannelConnectorFeishuTransportResult> & Pick<ChannelConnectorFeishuTransportResult, "action">,
): ChannelConnectorFeishuTransportResult {
  return {
    attempted: input.attempted ?? false,
    ok: input.ok ?? null,
    action: input.action,
    apiUrl: input.apiUrl ?? null,
    statusCode: input.statusCode ?? null,
    error: input.error ?? null,
    requestCount: input.requestCount ?? 0,
    tokenCache: input.tokenCache ?? null,
    messageId: input.messageId ?? null,
    messageIds: input.messageIds ?? null,
    chunkCount: input.chunkCount ?? null,
    reactionId: input.reactionId ?? null,
  };
}

export function emptyFeishuTransportResult(
  action: ChannelConnectorFeishuTransportResult["action"] = "none",
): ChannelConnectorFeishuTransportResult {
  return transportResult({ action });
}

function readCache(cachePath: string | null | undefined): Record<string, FeishuTokenCacheRecord> {
  if (!cachePath) return {};
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    return recordFrom(parsed) as Record<string, FeishuTokenCacheRecord>;
  } catch {
    return {};
  }
}

function writeCache(cachePath: string | null | undefined, cache: Record<string, FeishuTokenCacheRecord>): void {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const tempPath = `${cachePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, cachePath);
}

function tokenCacheKey(config: ChannelConnectorFeishuTransportConfig): string {
  return `${config.apiUrl}|${config.appId}`.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

function cachedToken(cachePath: string | null | undefined, config: ChannelConnectorFeishuTransportConfig): string | null {
  if (!cachePath) return null;
  const record = readCache(cachePath)[tokenCacheKey(config)];
  if (!record?.tenantAccessToken || !record.expiresAt) return null;
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_EXPIRY_SKEW_MS) return null;
  return record.tenantAccessToken;
}

async function feishuJsonRequest(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    method: "POST" | "PATCH" | "DELETE";
    path: string;
    payload: unknown;
    token?: string | null;
  },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (input.token) headers.authorization = `Bearer ${input.token}`;
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${input.path}`, {
      method: input.method,
      headers,
      body: JSON.stringify(input.payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
    }
    const code = Number(body.code);
    if (!response.ok || (Number.isFinite(code) && code !== 0)) {
      const message = normalizeString(body.msg) || normalizeString(body.message) || `Feishu API ${input.path} failed`;
      throw Object.assign(new Error(message), {
        statusCode: response.status,
        body,
      });
    }
    return {
      statusCode: response.status,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Feishu transport request failed.";
}

function errorStatusCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

async function getFeishuTenantToken(
  config: ChannelConnectorFeishuTransportConfig,
  cachePath?: string | null,
  forceRefresh = false,
): Promise<FeishuTenantTokenResult> {
  if (!forceRefresh) {
    const token = cachedToken(cachePath, config);
    if (token) {
      return {
        token,
        statusCode: null,
        requestCount: 0,
        tokenCache: "hit",
      };
    }
  }
  const response = await feishuJsonRequest(config, {
    method: "POST",
    path: "/open-apis/auth/v3/tenant_access_token/internal",
    payload: {
      app_id: config.appId,
      app_secret: config.appSecret,
    },
  });
  const token = normalizeString(response.body.tenant_access_token);
  if (!token) throw new Error("Feishu tenant token response did not include tenant_access_token.");
  if (cachePath) {
    const expiresIn = Number(response.body.expire);
    const cache = readCache(cachePath);
    cache[tokenCacheKey(config)] = {
      tenantAccessToken: token,
      expiresAt: new Date(Date.now() + (Number.isFinite(expiresIn) ? expiresIn * 1000 : 3600_000)).toISOString(),
    };
    writeCache(cachePath, cache);
  }
  return {
    token,
    statusCode: response.statusCode,
    requestCount: 1,
    tokenCache: forceRefresh ? "refresh" : cachePath ? "miss" : "disabled",
  };
}

export async function smokeFeishuTenantToken(
  config: ChannelConnectorFeishuTransportConfig,
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    return transportResult({
      attempted: true,
      ok: true,
      action: "tenant-token",
      apiUrl: config.apiUrl,
      statusCode: token.statusCode,
      requestCount: token.requestCount,
      tokenCache: token.tokenCache,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "tenant-token",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
      tokenCache: cachePath ? "miss" : "disabled",
    });
  }
}

export async function sendFeishuTextMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    if (!normalizeString(input.chatId)) throw new Error("Feishu chatId is required.");
    if (!normalizeString(input.content)) throw new Error("Feishu message content is required.");
    const chunks = splitChannelConnectorTextChunks(input.content, FEISHU_TEXT_CHUNK_RUNES)
      .filter((chunk) => normalizeString(chunk));
    if (!chunks.length) throw new Error("Feishu message content is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const messageIds: string[] = [];
    let statusCode: number | null = null;
    for (const chunk of chunks) {
      const response = await feishuJsonRequest(config, {
        method: "POST",
        path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
        token: token.token,
        payload: {
          receive_id: input.chatId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk }),
        },
      });
      requestCount += 1;
      statusCode = response.statusCode;
      const data = recordFrom(response.body.data);
      const messageId = normalizeString(data.message_id);
      if (messageId) messageIds.push(messageId);
    }
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode,
      requestCount,
      tokenCache,
      messageId: messageIds[0] || null,
      messageIds,
      chunkCount: chunks.length,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
    });
  }
}

export async function sendFeishuCardMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    card: ChannelConnectorFeishuInteractiveCard | Record<string, unknown>;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    if (!normalizeString(input.chatId)) throw new Error("Feishu chatId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "POST",
      path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
      token: token.token,
      payload: {
        receive_id: input.chatId,
        msg_type: "interactive",
        content: JSON.stringify(input.card),
      },
    });
    requestCount += 1;
    const data = recordFrom(response.body.data);
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-card",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId: normalizeString(data.message_id) || null,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-card",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
    });
  }
}

export async function patchFeishuCardMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
    card: ChannelConnectorFeishuInteractiveCard | Record<string, unknown>;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const messageId = normalizeString(input.messageId);
    if (!messageId) throw new Error("Feishu messageId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "PATCH",
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`,
      token: token.token,
      payload: {
        content: JSON.stringify(input.card),
      },
    });
    requestCount += 1;
    return transportResult({
      attempted: true,
      ok: true,
      action: "patch-card",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "patch-card",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
    });
  }
}

export async function addFeishuMessageReaction(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
    emojiType: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const messageId = normalizeString(input.messageId);
  try {
    const emojiType = normalizeString(input.emojiType);
    if (!messageId) throw new Error("Feishu messageId is required.");
    if (!emojiType) throw new Error("Feishu reaction emojiType is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "POST",
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions`,
      token: token.token,
      payload: {
        reaction_type: {
          emoji_type: emojiType,
        },
      },
    });
    requestCount += 1;
    const data = recordFrom(response.body.data);
    return transportResult({
      attempted: true,
      ok: true,
      action: "add-reaction",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
      reactionId: normalizeString(data.reaction_id) || null,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "add-reaction",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
      messageId: messageId || null,
    });
  }
}

export async function removeFeishuMessageReaction(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
    reactionId: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const messageId = normalizeString(input.messageId);
  const reactionId = normalizeString(input.reactionId);
  try {
    if (!messageId) throw new Error("Feishu messageId is required.");
    if (!reactionId) throw new Error("Feishu reactionId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "DELETE",
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(reactionId)}`,
      token: token.token,
      payload: {},
    });
    requestCount += 1;
    return transportResult({
      attempted: true,
      ok: true,
      action: "remove-reaction",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
      reactionId,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "remove-reaction",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
      messageId: messageId || null,
      reactionId: reactionId || null,
    });
  }
}
