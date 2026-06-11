import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  ChannelConnectorInboundAttachment,
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorFeishuActionRequest,
  ChannelConnectorFeishuActionTool,
} from "./feishu-actions.js";
import { extractFeishuMessageContent } from "./feishu-adapter.js";
import { inferChannelConnectorMimeType, safeChannelConnectorFileName } from "./outbound-files.js";
import { splitChannelConnectorTextChunks } from "./text-chunks.js";

const DEFAULT_FEISHU_API_URL = "https://open.feishu.cn";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FEISHU_TRANSIENT_RETRIES = 3;
const FEISHU_TRANSIENT_RETRY_INITIAL_MS = 500;
const FEISHU_TRANSIENT_RETRY_MAX_MS = 5_000;
const FEISHU_TEXT_CHUNK_RUNES = 3800;
const TOKEN_EXPIRY_SKEW_MS = 5 * 60 * 1000;
const DEFAULT_FEISHU_RESOURCE_MAX_BYTES = 128 * 1024 * 1024;
const FEISHU_IMAGE_MESSAGE_MAX_BYTES = 10 * 1024 * 1024;

const tokenMemoryCache = new Map<string, { token: string; expiresAt: number }>();

type FeishuReceiveIdType = "chat_id" | "open_id" | "user_id";

function normalizeFeishuReceiveTarget(input: {
  chatId?: string | null;
  receiveId?: string | null;
  receiveIdType?: FeishuReceiveIdType | null;
}): { receiveId: string; receiveIdType: FeishuReceiveIdType } {
  const receiveId = normalizeString(input.receiveId || input.chatId);
  const receiveIdType = input.receiveIdType || "chat_id";
  if (!receiveId) throw new Error("Feishu receiveId is required.");
  return { receiveId, receiveIdType };
}

function cachedTokenFromMemory(cacheKey: string): string | null {
  const cached = tokenMemoryCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt - TOKEN_EXPIRY_SKEW_MS) {
    tokenMemoryCache.delete(cacheKey);
    return null;
  }
  return cached.token;
}

function setTokenToMemory(cacheKey: string, token: string, expiresAt: number): void {
  tokenMemoryCache.set(cacheKey, { token, expiresAt });
}

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

export interface ChannelConnectorFeishuResourceDownloadResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  messageId: string | null;
  fileKey: string | null;
  resourceType: "image" | "file";
  data: Buffer | null;
  mimeType: string | null;
  error: string | null;
}

export interface ChannelConnectorFeishuResourceFileDownloadResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  messageId: string | null;
  fileKey: string | null;
  resourceType: "image" | "file";
  localPath: string | null;
  size: number | null;
  mimeType: string | null;
  error: string | null;
}

export interface ChannelConnectorFeishuChatMembersResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  chatId: string | null;
  members: ChannelConnectorOctoGroupMember[];
  pageCount: number;
  hasMore: boolean;
  error: string | null;
}

export interface ChannelConnectorFeishuBotInfoResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  botOpenId: string | null;
  botName: string | null;
  error: string | null;
}

export interface ChannelConnectorFeishuMessageInfo {
  messageId: string;
  senderId?: string;
  senderType?: string;
  content: string;
  contentType: string;
  createTime?: number;
  threadId?: string;
  attachments?: ChannelConnectorInboundAttachment[];
}

export interface ChannelConnectorFeishuMessageGetResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  messageId: string | null;
  message: ChannelConnectorFeishuMessageInfo | null;
  error: string | null;
}

export interface ChannelConnectorFeishuThreadMessagesResult {
  attempted: boolean;
  ok: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  threadId: string | null;
  messages: ChannelConnectorFeishuMessageInfo[];
  error: string | null;
}

export interface ChannelConnectorFeishuActionResult {
  attempted: boolean;
  ok: boolean;
  tool: ChannelConnectorFeishuActionTool;
  action: string;
  readOnly: boolean;
  apiUrl: string;
  statusCode: number | null;
  requestCount: number;
  tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"];
  data: unknown | null;
  error: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFrom(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function nestedString(value: unknown, keys: string[]): string {
  let current: unknown = value;
  for (const key of keys) {
    current = recordFrom(current)[key];
  }
  return normalizeString(current);
}

function normalizeFeishuTimestampMs(value: unknown): number | undefined {
  const raw = normalizeString(value);
  if (!raw) return undefined;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 10_000_000_000 ? Math.floor(numeric * 1000) : Math.floor(numeric);
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
    imageKey: input.imageKey ?? null,
    fileKey: input.fileKey ?? null,
    fileName: input.fileName ?? null,
    mimeType: input.mimeType ?? null,
    size: input.size ?? null,
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
  const key = tokenCacheKey(config);
  const memToken = cachedTokenFromMemory(key);
  if (memToken) return memToken;
  const record = readCache(cachePath)[key];
  if (!record?.tenantAccessToken || !record.expiresAt) return null;
  const expiresAt = Date.parse(record.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_EXPIRY_SKEW_MS) return null;
  setTokenToMemory(key, record.tenantAccessToken, expiresAt);
  return record.tenantAccessToken;
}

async function feishuJsonRequest(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    method: "GET" | "POST" | "PATCH" | "DELETE";
    path: string;
    payload?: unknown;
    token?: string | null;
  },
): Promise<{ statusCode: number; body: Record<string, unknown>; requestCount: number }> {
  let requestCount = 0;
  let delayMs = FEISHU_TRANSIENT_RETRY_INITIAL_MS;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_FEISHU_TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      requestCount += 1;
      const headers: Record<string, string> = {
        "content-type": "application/json",
      };
      if (input.token) headers.authorization = `Bearer ${input.token}`;
      const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${input.path}`, {
        method: input.method,
        headers,
        body: input.method === "GET" ? undefined : JSON.stringify(input.payload ?? {}),
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
        requestCount,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_FEISHU_TRANSIENT_RETRIES || !isFeishuTransientError(error)) {
        attachFeishuRequestCount(error, requestCount);
        throw error;
      }
      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(delayMs / 4)));
      await sleep(delayMs + jitterMs);
      delayMs = Math.min(delayMs * 2, FEISHU_TRANSIENT_RETRY_MAX_MS);
    } finally {
      clearTimeout(timeout);
    }
  }
  const error = lastError instanceof Error ? lastError : new Error("Feishu transport request failed.");
  attachFeishuRequestCount(error, requestCount);
  throw error;
}

async function feishuBinaryRequest(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    path: string;
    token: string;
    maxBytes?: number;
  },
): Promise<{ statusCode: number; data: Buffer; mimeType: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${input.path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      signal: controller.signal,
    });
    const contentLength = Number(response.headers.get("content-length"));
    const maxBytes = input.maxBytes ?? DEFAULT_FEISHU_RESOURCE_MAX_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw Object.assign(new Error(`Feishu resource exceeds size limit: ${contentLength} > ${maxBytes}`), {
        statusCode: response.status,
      });
    }
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw || `Feishu API ${input.path} failed`;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        message = normalizeString(parsed.msg) || normalizeString(parsed.message) || message;
      } catch {
        // Keep raw response as the diagnostic when Feishu returns non-JSON.
      }
      throw Object.assign(new Error(message), {
        statusCode: response.status,
      });
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > maxBytes) {
      throw Object.assign(new Error(`Feishu resource exceeds size limit: ${data.length} > ${maxBytes}`), {
        statusCode: response.status,
      });
    }
    return {
      statusCode: response.status,
      data,
      mimeType: normalizeString(response.headers.get("content-type")) || null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function feishuBinaryToFileRequest(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    path: string;
    token: string;
    maxBytes?: number;
    target: (mimeType: string | null) => { localPath: string; tempPath: string };
  },
): Promise<{ statusCode: number; localPath: string; size: number; mimeType: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let tempPath: string | null = null;
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${input.path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${input.token}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      let message = raw || `Feishu API ${input.path} failed`;
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        message = normalizeString(parsed.msg) || normalizeString(parsed.message) || message;
      } catch {
        // Keep raw response as the diagnostic when Feishu returns non-JSON.
      }
      throw Object.assign(new Error(message), {
        statusCode: response.status,
      });
    }

    const contentLength = Number(response.headers.get("content-length"));
    const maxBytes = input.maxBytes ?? DEFAULT_FEISHU_RESOURCE_MAX_BYTES;
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw Object.assign(new Error(`Feishu resource exceeds size limit: ${contentLength} > ${maxBytes}`), {
        statusCode: response.status,
      });
    }
    if (!response.body) {
      throw Object.assign(new Error("Feishu resource response did not include a body."), {
        statusCode: response.status,
      });
    }

    const mimeType = normalizeString(response.headers.get("content-type")) || null;
    const target = input.target(mimeType);
    tempPath = target.tempPath;
    fs.mkdirSync(path.dirname(target.localPath), { recursive: true });
    let size = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (Number.isFinite(maxBytes) && size > maxBytes) {
          callback(Object.assign(new Error(`Feishu resource exceeds size limit: ${size} > ${maxBytes}`), {
            statusCode: response.status,
          }));
          return;
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      limiter,
      fs.createWriteStream(target.tempPath, { mode: 0o600 }),
    );
    fs.renameSync(target.tempPath, target.localPath);
    tempPath = null;
    return {
      statusCode: response.status,
      localPath: target.localPath,
      size,
      mimeType,
    };
  } catch (error) {
    if (tempPath) fs.rmSync(tempPath, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function feishuMultipartRequest(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    path: string;
    token: string;
    fieldName: string;
    fileName: string;
    data: Uint8Array;
    mimeType: string;
    fields?: Record<string, string>;
  },
): Promise<{ statusCode: number; body: Record<string, unknown>; requestCount: number }> {
  let requestCount = 0;
  let delayMs = FEISHU_TRANSIENT_RETRY_INITIAL_MS;
  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_FEISHU_TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      requestCount += 1;
      const form = new FormData();
      for (const [key, value] of Object.entries(input.fields || {})) {
        form.append(key, value);
      }
      const arrayBuffer = new ArrayBuffer(input.data.byteLength);
      new Uint8Array(arrayBuffer).set(input.data);
      form.append(input.fieldName, new Blob([arrayBuffer], { type: input.mimeType }), input.fileName);
      const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${input.path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.token}`,
        },
        body: form,
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
        requestCount,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= MAX_FEISHU_TRANSIENT_RETRIES || !isFeishuTransientError(error)) {
        attachFeishuRequestCount(error, requestCount);
        throw error;
      }
      const jitterMs = Math.floor(Math.random() * Math.max(1, Math.floor(delayMs / 4)));
      await sleep(delayMs + jitterMs);
      delayMs = Math.min(delayMs * 2, FEISHU_TRANSIENT_RETRY_MAX_MS);
    } finally {
      clearTimeout(timeout);
    }
  }
  const error = lastError instanceof Error ? lastError : new Error("Feishu multipart request failed.");
  attachFeishuRequestCount(error, requestCount);
  throw error;
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

function errorRequestCount(error: unknown): number {
  if (typeof error === "object" && error !== null && "requestCount" in error) {
    const value = Number((error as { requestCount?: unknown }).requestCount);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
  return 0;
}

function attachFeishuRequestCount(error: unknown, requestCount: number): void {
  if (typeof error === "object" && error !== null) {
    Object.assign(error, { requestCount });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFeishuTransientError(error: unknown): boolean {
  const statusCode = errorStatusCode(error);
  if (statusCode !== null && (
    statusCode === 408
    || statusCode === 425
    || statusCode === 429
    || (statusCode >= 500 && statusCode <= 504)
  )) {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return [
    "connection reset",
    "broken pipe",
    "i/o timeout",
    "tls handshake timeout",
    "connection refused",
    "econnreset",
    "econnrefused",
    "socket hang up",
    "fetch failed",
    "networkerror",
    "unexpected eof",
  ].some((part) => message.includes(part));
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
    if (Number.isFinite(expiresIn)) {
      setTokenToMemory(tokenCacheKey(config), token, Date.now() + expiresIn * 1000);
    }
  }
  return {
    token,
    statusCode: response.statusCode,
    requestCount: response.requestCount,
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
      requestCount: Math.max(errorRequestCount(error), 1),
      tokenCache: cachePath ? "miss" : "disabled",
    });
  }
}

export async function getFeishuBotInfo(
  config: ChannelConnectorFeishuTransportConfig,
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuBotInfoResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "GET",
      token: token.token,
      path: "/open-apis/bot/v3/info",
    });
    requestCount += response.requestCount;
    const bot = recordFrom(response.body.bot || recordFrom(response.body.data).bot);
    const botOpenId = normalizeString(bot.open_id) || normalizeString(bot.openId);
    const botName = normalizeString(bot.app_name)
      || normalizeString(bot.name)
      || normalizeString(bot.bot_name)
      || normalizeString(bot.botName);
    if (!botOpenId) throw new Error("Feishu bot info response did not include bot.open_id.");
    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      botOpenId,
      botName: botName || null,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      botOpenId: null,
      botName: null,
      error: errorMessage(error),
    };
  }
}

export async function downloadFeishuMessageResource(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
    fileKey: string;
    resourceType: "image" | "file";
    maxBytes?: number;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuResourceDownloadResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const messageId = normalizeString(input.messageId);
  const fileKey = normalizeString(input.fileKey);
  try {
    if (!messageId) throw new Error("Feishu messageId is required.");
    if (!fileKey) throw new Error("Feishu fileKey is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuBinaryRequest(config, {
      token: token.token,
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${encodeURIComponent(input.resourceType)}`,
      maxBytes: input.maxBytes,
    });
    requestCount += 1;
    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
      fileKey,
      resourceType: input.resourceType,
      data: response.data,
      mimeType: response.mimeType,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
      messageId: messageId || null,
      fileKey: fileKey || null,
      resourceType: input.resourceType,
      data: null,
      mimeType: null,
      error: errorMessage(error),
    };
  }
}

function feishuMemberFromValue(value: unknown): ChannelConnectorOctoGroupMember | null {
  const record = recordFrom(value);
  const uid = normalizeString(record.member_id)
    || normalizeString(record.open_id)
    || normalizeString(record.user_id)
    || normalizeString(record.union_id)
    || normalizeString(record.id);
  if (!uid) return null;
  const name = normalizeString(record.name)
    || normalizeString(record.en_name)
    || normalizeString(record.nickname)
    || uid;
  return { uid, name };
}

export async function listFeishuChatMembers(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    pageSize?: number;
    maxPages?: number;
    memberIdType?: "open_id" | "user_id" | "union_id";
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuChatMembersResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const chatId = normalizeString(input.chatId);
  const pageSize = Math.max(1, Math.min(100, Math.floor(Number(input.pageSize || 100))));
  const maxPages = Math.max(1, Math.min(100, Math.floor(Number(input.maxPages || 10))));
  const memberIdType = input.memberIdType || "open_id";
  const members: ChannelConnectorOctoGroupMember[] = [];
  let statusCode: number | null = null;
  let pageToken = "";
  let pageCount = 0;
  let hasMore = false;
  try {
    if (!chatId) throw new Error("Feishu chatId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;

    do {
      const search = new URLSearchParams({
        member_id_type: memberIdType,
        page_size: String(pageSize),
      });
      if (pageToken) search.set("page_token", pageToken);
      const response = await feishuJsonRequest(config, {
        method: "GET",
        token: token.token,
        path: `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?${search.toString()}`,
      });
      requestCount += response.requestCount;
      statusCode = response.statusCode;
      pageCount += 1;
      const data = recordFrom(response.body.data);
      const items = Array.isArray(data.items) ? data.items : [];
      for (const item of items) {
        const member = feishuMemberFromValue(item);
        if (member && !members.some((candidate) => candidate.uid === member.uid)) members.push(member);
      }
      hasMore = data.has_more === true;
      pageToken = normalizeString(data.page_token);
    } while (hasMore && pageToken && pageCount < maxPages);

    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode,
      requestCount,
      tokenCache,
      chatId,
      members,
      pageCount,
      hasMore,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(1, requestCount + errorRequestCount(error)),
      tokenCache,
      chatId: chatId || null,
      members: [],
      pageCount,
      hasMore,
      error: errorMessage(error),
    };
  }
}

export async function downloadFeishuMessageResourceToFile(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
    fileKey: string;
    resourceType: "image" | "file";
    target: (mimeType: string | null) => { localPath: string; tempPath: string };
    maxBytes?: number;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuResourceFileDownloadResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const messageId = normalizeString(input.messageId);
  const fileKey = normalizeString(input.fileKey);
  try {
    if (!messageId) throw new Error("Feishu messageId is required.");
    if (!fileKey) throw new Error("Feishu fileKey is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    requestCount += 1;
    const response = await feishuBinaryToFileRequest(config, {
      token: token.token,
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/resources/${encodeURIComponent(fileKey)}?type=${encodeURIComponent(input.resourceType)}`,
      maxBytes: input.maxBytes,
      target: input.target,
    });
    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
      fileKey,
      resourceType: input.resourceType,
      localPath: response.localPath,
      size: response.size,
      mimeType: response.mimeType,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount, 1),
      tokenCache,
      messageId: messageId || null,
      fileKey: fileKey || null,
      resourceType: input.resourceType,
      localPath: null,
      size: null,
      mimeType: null,
      error: errorMessage(error),
    };
  }
}

function parseFeishuMessageItem(value: unknown, fallbackMessageId = ""): ChannelConnectorFeishuMessageInfo | null {
  const item = recordFrom(value);
  const body = recordFrom(item.body);
  const messageId = normalizeString(item.message_id) || normalizeString(item.messageId) || normalizeString(fallbackMessageId);
  if (!messageId && !Object.keys(item).length) return null;
  const contentType = normalizeString(item.msg_type)
    || normalizeString(item.message_type)
    || normalizeString(body.msg_type)
    || normalizeString(body.message_type)
    || "text";
  const rawContent = body.content !== undefined ? body.content : item.content;
  const extracted = extractFeishuMessageContent(contentType, rawContent);
  const senderId = nestedString(item, ["sender", "sender_id", "open_id"])
    || nestedString(item, ["sender", "sender_id", "user_id"])
    || nestedString(item, ["sender", "sender_id", "union_id"])
    || nestedString(item, ["sender", "id"])
    || normalizeString(item.sender_id)
    || normalizeString(item.senderId)
    || normalizeString(item.open_id)
    || normalizeString(item.user_id);
  const senderType = nestedString(item, ["sender", "sender_type"])
    || normalizeString(item.sender_type)
    || normalizeString(item.senderType);
  return {
    messageId,
    senderId: senderId || undefined,
    senderType: senderType || undefined,
    content: extracted.text || "",
    contentType,
    createTime: normalizeFeishuTimestampMs(item.create_time) || normalizeFeishuTimestampMs(item.createTime),
    threadId: normalizeString(item.thread_id) || normalizeString(item.threadId) || undefined,
    attachments: extracted.attachments,
  };
}

function feishuGetMessageItem(body: Record<string, unknown>): unknown | null {
  const data = recordFrom(body.data);
  const items = arrayFrom(data.items);
  if (items.length) return items[0];
  if (data.body !== undefined || data.message_id !== undefined || data.messageId !== undefined) return data;
  return null;
}

export async function getFeishuMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    messageId: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuMessageGetResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const messageId = normalizeString(input.messageId);
  try {
    if (!messageId) throw new Error("Feishu messageId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "GET",
      token: token.token,
      path: `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`,
    });
    requestCount += response.requestCount;
    const item = feishuGetMessageItem(response.body);
    const message = item ? parseFeishuMessageItem(item, messageId) : null;
    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId,
      message,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      messageId: messageId || null,
      message: null,
      error: errorMessage(error),
    };
  }
}

export async function listFeishuThreadMessages(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    threadId: string;
    currentMessageId?: string | null;
    rootMessageId?: string | null;
    limit?: number | null;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuThreadMessagesResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const threadId = normalizeString(input.threadId);
  const currentMessageId = normalizeString(input.currentMessageId);
  const rootMessageId = normalizeString(input.rootMessageId);
  const limit = Math.max(1, Math.min(50, Math.floor(Number(input.limit || 20))));
  try {
    if (!threadId) throw new Error("Feishu threadId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const search = new URLSearchParams({
      container_id_type: "thread",
      container_id: threadId,
      sort_type: "ByCreateTimeDesc",
      page_size: String(Math.min(limit + 2, 50)),
    });
    const response = await feishuJsonRequest(config, {
      method: "GET",
      token: token.token,
      path: `/open-apis/im/v1/messages?${search.toString()}`,
    });
    requestCount += response.requestCount;
    const data = recordFrom(response.body.data);
    const messages: ChannelConnectorFeishuMessageInfo[] = [];
    for (const item of arrayFrom(data.items)) {
      const parsed = parseFeishuMessageItem(item);
      if (!parsed) continue;
      if (currentMessageId && parsed.messageId === currentMessageId) continue;
      if (rootMessageId && parsed.messageId === rootMessageId) continue;
      messages.push(parsed);
      if (messages.length >= limit) break;
    }
    messages.reverse();
    return {
      attempted: true,
      ok: true,
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      threadId,
      messages,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      threadId: threadId || null,
      messages: [],
      error: errorMessage(error),
    };
  }
}

const FEISHU_DOCX_STRUCTURED_BLOCK_TYPES = new Set([14, 18, 21, 23, 27, 30, 31, 32]);
const FEISHU_DOCX_BLOCK_TYPE_NAMES: Record<number, string> = {
  1: "Page",
  2: "Text",
  3: "Heading1",
  4: "Heading2",
  5: "Heading3",
  12: "Bullet",
  13: "Ordered",
  14: "Code",
  15: "Quote",
  17: "Todo",
  18: "Bitable",
  21: "Diagram",
  22: "Divider",
  23: "File",
  27: "Image",
  30: "Sheet",
  31: "Table",
  32: "TableCell",
};

function actionResult(input: {
  tool: ChannelConnectorFeishuActionTool;
  action: string;
  readOnly: boolean;
  config: ChannelConnectorFeishuTransportConfig;
  ok?: boolean;
  statusCode?: number | null;
  requestCount?: number;
  tokenCache?: ChannelConnectorFeishuTransportResult["tokenCache"];
  data?: unknown | null;
  error?: string | null;
}): ChannelConnectorFeishuActionResult {
  return {
    attempted: true,
    ok: input.ok === true,
    tool: input.tool,
    action: input.action,
    readOnly: input.readOnly,
    apiUrl: input.config.apiUrl,
    statusCode: input.statusCode ?? null,
    requestCount: input.requestCount ?? 0,
    tokenCache: input.tokenCache ?? null,
    data: input.data ?? null,
    error: input.error ?? null,
  };
}

function normalizedAction(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function paramString(params: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(params[key]);
    if (value) return value;
  }
  return "";
}

function requireParamString(params: Record<string, unknown>, keys: string[], label: string): string {
  const value = paramString(params, keys);
  if (!value) throw new Error(`${label} is required.`);
  return value;
}

function optionalParamString(params: Record<string, unknown>, keys: string[]): string | undefined {
  return paramString(params, keys) || undefined;
}

function feishuActionIsReadOnly(tool: ChannelConnectorFeishuActionTool, action: string): boolean {
  const normalized = normalizedAction(action);
  if (tool === "feishu_doc") return ["read", "list_blocks", "get_block"].includes(normalized);
  if (tool === "feishu_drive") return ["list", "info"].includes(normalized);
  if (tool === "feishu_perm") return normalized === "list";
  if (tool === "feishu_wiki") return ["spaces", "nodes", "get", "search"].includes(normalized);
  return false;
}

function feishuActionUnsupportedMutation(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
): ChannelConnectorFeishuActionResult {
  return actionResult({
    tool: request.tool,
    action: normalizedAction(request.action),
    readOnly: false,
    config,
    ok: false,
    error: `${request.tool}.${request.action} is a Feishu mutation action. Studio has not enabled native mutation execution for this action yet; use studio-channel-files or studio-channel-messages as a safe fallback, or wait for the explicit approval-backed executor.`,
  });
}

function normalizeDocxBlocks(body: Record<string, unknown>): unknown[] {
  const data = recordFrom(body.data);
  const items = arrayFrom(data.items);
  return items;
}

function docxReadSummary(input: {
  rawContentBody: Record<string, unknown>;
  documentBody: Record<string, unknown>;
  blocksBody: Record<string, unknown>;
}): Record<string, unknown> {
  const rawData = recordFrom(input.rawContentBody.data);
  const document = recordFrom(recordFrom(input.documentBody.data).document);
  const blocks = normalizeDocxBlocks(input.blocksBody);
  const blockCounts: Record<string, number> = {};
  const structuredTypes: string[] = [];
  for (const block of blocks) {
    const type = Number(recordFrom(block).block_type);
    const name = FEISHU_DOCX_BLOCK_TYPE_NAMES[type] || `type_${Number.isFinite(type) ? type : 0}`;
    blockCounts[name] = (blockCounts[name] || 0) + 1;
    if (FEISHU_DOCX_STRUCTURED_BLOCK_TYPES.has(type) && !structuredTypes.includes(name)) structuredTypes.push(name);
  }
  return {
    title: normalizeString(document.title) || null,
    content: normalizeString(rawData.content),
    revision_id: normalizeString(document.revision_id) || null,
    block_count: blocks.length,
    block_types: blockCounts,
    ...(structuredTypes.length
      ? { hint: `This document contains ${structuredTypes.join(", ")} which are not included in plain text. Use feishu_doc action list_blocks for structured content.` }
      : {}),
  };
}

async function executeFeishuReadOnlyAction(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
  token: string,
): Promise<{ data: unknown; statusCode: number | null; requestCount: number }> {
  let requestCount = 0;
  let statusCode: number | null = null;
  const params = request.params || {};
  const action = normalizedAction(request.action);
  const call = async (method: "GET" | "POST" | "PATCH" | "DELETE", pathValue: string, payload?: unknown) => {
    const response = await feishuJsonRequest(config, {
      method,
      path: pathValue,
      payload,
      token,
    });
    requestCount += response.requestCount;
    statusCode = response.statusCode;
    return response.body;
  };

  if (request.tool === "feishu_doc") {
    const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
    if (action === "read") {
      const rawContentBody = await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/raw_content`);
      const documentBody = await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}`);
      const blocksBody = await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks`);
      return { data: docxReadSummary({ rawContentBody, documentBody, blocksBody }), statusCode, requestCount };
    }
    if (action === "list_blocks") {
      const body = await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks`);
      return { data: { blocks: normalizeDocxBlocks(body) }, statusCode, requestCount };
    }
    if (action === "get_block") {
      const blockId = requireParamString(params, ["block_id", "blockId"], "block_id");
      const body = await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(blockId)}`);
      return { data: { block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
  }

  if (request.tool === "feishu_drive") {
    if (action === "list") {
      const search = new URLSearchParams();
      const folderToken = optionalParamString(params, ["folder_token", "folderToken"]);
      if (folderToken && folderToken !== "0") search.set("folder_token", folderToken);
      const body = await call("GET", `/open-apis/drive/v1/files${search.size ? `?${search.toString()}` : ""}`);
      const data = recordFrom(body.data);
      return {
        data: {
          files: arrayFrom(data.files),
          next_page_token: normalizeString(data.next_page_token) || null,
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "info") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const search = new URLSearchParams();
      const folderToken = optionalParamString(params, ["folder_token", "folderToken"]);
      if (folderToken && folderToken !== "0") search.set("folder_token", folderToken);
      const body = await call("GET", `/open-apis/drive/v1/files${search.size ? `?${search.toString()}` : ""}`);
      const files = arrayFrom(recordFrom(body.data).files);
      const file = files.find((item) => normalizeString(recordFrom(item).token) === fileToken) || null;
      if (!file) throw new Error(`File not found: ${fileToken}`);
      return { data: file, statusCode, requestCount };
    }
  }

  if (request.tool === "feishu_perm") {
    if (action === "list") {
      const tokenValue = requireParamString(params, ["token", "file_token", "doc_token"], "token");
      const type = paramString(params, ["type", "file_type", "fileType"]) || "docx";
      const search = new URLSearchParams({ type });
      const body = await call("GET", `/open-apis/drive/v1/permissions/${encodeURIComponent(tokenValue)}/members?${search.toString()}`);
      return { data: { members: arrayFrom(recordFrom(body.data).items) }, statusCode, requestCount };
    }
  }

  if (request.tool === "feishu_wiki") {
    if (action === "spaces") {
      const body = await call("GET", "/open-apis/wiki/v2/spaces");
      return { data: { spaces: arrayFrom(recordFrom(body.data).items) }, statusCode, requestCount };
    }
    if (action === "nodes") {
      const spaceId = requireParamString(params, ["space_id", "spaceId"], "space_id");
      const search = new URLSearchParams();
      const parentToken = optionalParamString(params, ["parent_node_token", "parentNodeToken"]);
      if (parentToken) search.set("parent_node_token", parentToken);
      const body = await call("GET", `/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes${search.size ? `?${search.toString()}` : ""}`);
      return { data: { nodes: arrayFrom(recordFrom(body.data).items) }, statusCode, requestCount };
    }
    if (action === "get") {
      const tokenValue = requireParamString(params, ["token", "node_token", "nodeToken"], "token");
      const search = new URLSearchParams({ token: tokenValue });
      const body = await call("GET", `/open-apis/wiki/v2/spaces/get_node?${search.toString()}`);
      return { data: { node: recordFrom(recordFrom(body.data).node) }, statusCode, requestCount };
    }
    if (action === "search") {
      return {
        data: {
          error: "Search is not available. Use feishu_wiki action nodes to browse or action get to lookup by token.",
        },
        statusCode,
        requestCount,
      };
    }
  }

  throw new Error(`Unsupported Feishu action: ${request.tool}.${request.action}`);
}

export async function executeFeishuChannelAction(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuActionResult> {
  const action = normalizedAction(request.action);
  const readOnly = feishuActionIsReadOnly(request.tool, action);
  if (!readOnly) return feishuActionUnsupportedMutation(config, request);

  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const executed = await executeFeishuReadOnlyAction(config, { ...request, action }, token.token);
    requestCount += executed.requestCount;
    return actionResult({
      tool: request.tool,
      action,
      readOnly,
      config,
      ok: true,
      statusCode: executed.statusCode,
      requestCount,
      tokenCache,
      data: executed.data,
    });
  } catch (error) {
    return actionResult({
      tool: request.tool,
      action,
      readOnly,
      config,
      ok: false,
      statusCode: errorStatusCode(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      error: errorMessage(error),
    });
  }
}

function dataSize(input: Uint8Array): number {
  return input.byteLength;
}

function shouldSendAsFeishuImage(fileName: string, mimeType: string, size: number): boolean {
  if (size > FEISHU_IMAGE_MESSAGE_MAX_BYTES) return false;
  if (mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName);
}

export async function uploadFeishuImage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-image.png");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  const size = dataSize(input.data);
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuMultipartRequest(config, {
      path: "/open-apis/im/v1/images",
      token: token.token,
      fieldName: "image",
      fileName,
      data: input.data,
      mimeType,
      fields: {
        image_type: "message",
      },
    });
    requestCount += response.requestCount ?? 1;
    const data = recordFrom(response.body.data);
    const imageKey = normalizeString(data.image_key);
    if (!imageKey) throw new Error("Feishu image upload response did not include image_key.");
    return transportResult({
      attempted: true,
      ok: true,
      action: "upload-image",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      imageKey,
      fileName,
      mimeType,
      size,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "upload-image",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      fileName,
      mimeType,
      size,
    });
  }
}

export async function uploadFeishuFile(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-file.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  const size = dataSize(input.data);
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuMultipartRequest(config, {
      path: "/open-apis/im/v1/files",
      token: token.token,
      fieldName: "file",
      fileName,
      data: input.data,
      mimeType,
      fields: {
        file_type: "stream",
        file_name: fileName,
      },
    });
    requestCount += response.requestCount ?? 1;
    const data = recordFrom(response.body.data);
    const fileKey = normalizeString(data.file_key);
    if (!fileKey) throw new Error("Feishu file upload response did not include file_key.");
    return transportResult({
      attempted: true,
      ok: true,
      action: "upload-file",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      fileKey,
      fileName,
      mimeType,
      size,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "upload-file",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      fileName,
      mimeType,
      size,
    });
  }
}

export async function sendFeishuImageMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    imageKey: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const imageKey = normalizeString(input.imageKey);
  try {
    if (!normalizeString(input.chatId)) throw new Error("Feishu chatId is required.");
    if (!imageKey) throw new Error("Feishu imageKey is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "POST",
      path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
      token: token.token,
      payload: {
        receive_id: input.chatId,
        msg_type: "image",
        content: JSON.stringify({ image_key: imageKey }),
      },
    });
    requestCount += response.requestCount;
    const data = recordFrom(response.body.data);
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-image",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId: normalizeString(data.message_id) || null,
      imageKey,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-image",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      imageKey,
    });
  }
}

export async function sendFeishuFileMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    fileKey: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  const fileKey = normalizeString(input.fileKey);
  try {
    if (!normalizeString(input.chatId)) throw new Error("Feishu chatId is required.");
    if (!fileKey) throw new Error("Feishu fileKey is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "POST",
      path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
      token: token.token,
      payload: {
        receive_id: input.chatId,
        msg_type: "file",
        content: JSON.stringify({ file_key: fileKey }),
      },
    });
    requestCount += response.requestCount;
    const data = recordFrom(response.body.data);
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-file",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      tokenCache,
      messageId: normalizeString(data.message_id) || null,
      fileKey,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-file",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      fileKey,
    });
  }
}

export async function uploadAndSendFeishuMedia(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId: string;
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-file.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  const size = dataSize(input.data);
  const upload = shouldSendAsFeishuImage(fileName, mimeType, size)
    ? await uploadFeishuImage(config, { data: input.data, fileName, mimeType }, cachePath)
    : await uploadFeishuFile(config, { data: input.data, fileName, mimeType }, cachePath);
  if (upload.ok !== true) return upload;
  const sent = upload.imageKey
    ? await sendFeishuImageMessage(config, {
      chatId: input.chatId,
      imageKey: upload.imageKey,
    }, cachePath)
    : await sendFeishuFileMessage(config, {
      chatId: input.chatId,
      fileKey: upload.fileKey || "",
    }, cachePath);
  return transportResult({
    attempted: true,
    ok: sent.ok,
    action: "upload-and-send-media",
    apiUrl: config.apiUrl,
    statusCode: sent.statusCode,
    error: sent.error,
    requestCount: upload.requestCount + sent.requestCount,
    tokenCache: sent.tokenCache || upload.tokenCache,
    messageId: sent.messageId || null,
    imageKey: upload.imageKey || sent.imageKey || null,
    fileKey: upload.fileKey || sent.fileKey || null,
    fileName,
    mimeType,
    size,
  });
}

export async function sendFeishuTextMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId?: string | null;
    receiveId?: string | null;
    receiveIdType?: FeishuReceiveIdType | null;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const target = normalizeFeishuReceiveTarget(input);
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
        path: `/open-apis/im/v1/messages?receive_id_type=${target.receiveIdType}`,
        token: token.token,
        payload: {
          receive_id: target.receiveId,
          msg_type: "text",
          content: JSON.stringify({ text: chunk }),
        },
      });
      requestCount += response.requestCount;
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
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
    });
  }
}

export async function sendFeishuPostMessage(
  config: ChannelConnectorFeishuTransportConfig,
  input: {
    chatId?: string | null;
    receiveId?: string | null;
    receiveIdType?: FeishuReceiveIdType | null;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const target = normalizeFeishuReceiveTarget(input);
    if (!normalizeString(input.content)) throw new Error("Feishu post content is required.");
    const chunks = splitChannelConnectorTextChunks(input.content, FEISHU_TEXT_CHUNK_RUNES)
      .filter((chunk) => normalizeString(chunk));
    if (!chunks.length) throw new Error("Feishu post content is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const messageIds: string[] = [];
    let statusCode: number | null = null;
    for (const chunk of chunks) {
      const response = await feishuJsonRequest(config, {
        method: "POST",
        path: `/open-apis/im/v1/messages?receive_id_type=${target.receiveIdType}`,
        token: token.token,
        payload: {
          receive_id: target.receiveId,
          msg_type: "post",
          content: JSON.stringify({
            zh_cn: {
              content: [[{ tag: "md", text: chunk }]],
            },
          }),
        },
      });
      requestCount += response.requestCount;
      statusCode = response.statusCode;
      const data = recordFrom(response.body.data);
      const messageId = normalizeString(data.message_id);
      if (messageId) messageIds.push(messageId);
    }
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-post",
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
      action: "send-post",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
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
    requestCount += response.requestCount;
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
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
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
    requestCount += response.requestCount;
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
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
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
    requestCount += response.requestCount;
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
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
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
    requestCount += response.requestCount;
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
      requestCount: Math.max(requestCount + errorRequestCount(error), 1),
      tokenCache,
      messageId: messageId || null,
      reactionId: reactionId || null,
    });
  }
}
