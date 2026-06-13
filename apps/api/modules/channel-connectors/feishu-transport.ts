import fs from "node:fs";
import { isIP } from "node:net";
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
const FEISHU_DOCX_UPLOAD_ALL_MAX_BYTES = 20 * 1024 * 1024;
const FEISHU_DOCX_CONVERT_MAX_DEPTH = 8;
const FEISHU_DOCX_DESCENDANT_BATCH_SIZE = 900;

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

type FeishuDocxBlockRecord = Record<string, unknown>;
type FeishuJsonMethod = "GET" | "POST" | "PATCH" | "DELETE" | "PUT";
type FeishuActionCall = (
  method: FeishuJsonMethod,
  pathValue: string,
  payload?: unknown,
) => Promise<Record<string, unknown>>;
type FeishuActionMultipart = (input: {
  path: string;
  fieldName: string;
  fileName: string;
  data: Uint8Array;
  mimeType: string;
  fields?: Record<string, string>;
}) => Promise<Record<string, unknown>>;

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

export interface ChannelConnectorFeishuActionOptions {
  allowMutation?: boolean;
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
    method: FeishuJsonMethod;
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

function requireParamNumber(params: Record<string, unknown>, keys: string[], label: string): number {
  for (const key of keys) {
    const raw = params[key];
    const value = typeof raw === "number" ? raw : Number(normalizeString(raw));
    if (Number.isFinite(value)) return value;
  }
  throw new Error(`${label} is required.`);
}

function optionalParamNumber(params: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const raw = params[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(normalizeString(raw));
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function optionalParamBoolean(params: Record<string, unknown>, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const raw = params[key];
    if (typeof raw === "boolean") return raw;
    if (typeof raw === "number") return raw !== 0;
    const normalized = normalizeString(raw).toLowerCase();
    if (["true", "yes", "1", "on", "enabled"].includes(normalized)) return true;
    if (["false", "no", "0", "off", "disabled"].includes(normalized)) return false;
  }
  return undefined;
}

function optionalParamNumberArray(params: Record<string, unknown>, keys: string[]): number[] | undefined {
  for (const key of keys) {
    const raw = params[key];
    if (!Array.isArray(raw)) continue;
    const values = raw.map((item) => Number(item)).filter((item) => Number.isFinite(item));
    if (values.length > 0) return values;
  }
  return undefined;
}

function optionalPositiveInteger(params: Record<string, unknown>, keys: string[], fallback: number, max: number): number {
  const value = optionalParamNumber(params, keys);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value as number)));
}

function normalizeFeishuTargetPrefix(value: string): string {
  const normalized = normalizeString(value);
  const withoutProvider = normalized.replace(/^(feishu|lark):/i, "");
  return withoutProvider.replace(/^(chat|group|channel|open_id|user_id|dm|user):/i, "");
}

function feishuReceiveTargetFromParams(params: Record<string, unknown>): {
  receiveId: string;
  receiveIdType: FeishuReceiveIdType;
} {
  const explicitReceiveId = paramString(params, ["receive_id", "receiveId"]);
  const explicitReceiveIdType = paramString(params, ["receive_id_type", "receiveIdType"]);
  if (explicitReceiveId) {
    const receiveIdType = explicitReceiveIdType === "open_id" || explicitReceiveIdType === "user_id" ? explicitReceiveIdType : "chat_id";
    return { receiveId: explicitReceiveId, receiveIdType };
  }

  const raw = paramString(params, ["to", "target", "chat_id", "chatId", "channel_id", "channelId", "open_id", "openId", "user_id", "userId"]);
  if (!raw) throw new Error("Feishu channel target is required.");
  const lower = raw.toLowerCase();
  if (lower.startsWith("open_id:")) return { receiveId: normalizeFeishuTargetPrefix(raw), receiveIdType: "open_id" };
  if (lower.startsWith("user_id:") || lower.startsWith("user:")) return { receiveId: normalizeFeishuTargetPrefix(raw), receiveIdType: "user_id" };
  if (lower.startsWith("dm:")) {
    const receiveId = normalizeFeishuTargetPrefix(raw);
    return { receiveId, receiveIdType: receiveId.startsWith("u_") ? "user_id" : "open_id" };
  }
  if (params.open_id || params.openId) return { receiveId: normalizeFeishuTargetPrefix(raw), receiveIdType: "open_id" };
  if (params.user_id || params.userId) return { receiveId: normalizeFeishuTargetPrefix(raw), receiveIdType: "user_id" };
  return { receiveId: normalizeFeishuTargetPrefix(raw), receiveIdType: "chat_id" };
}

function feishuChatIdFromParams(params: Record<string, unknown>): string {
  const raw = paramString(params, ["chat_id", "chatId", "channel_id", "channelId", "to", "target"]);
  if (!raw) throw new Error("chat_id is required.");
  if (/^(dm|user|open_id|user_id):/i.test(raw)) throw new Error("Feishu chat action requires a chat/group target.");
  return normalizeFeishuTargetPrefix(raw);
}

function feishuMessageIdFromParams(params: Record<string, unknown>): string {
  return requireParamString(params, ["message_id", "messageId", "reply_to", "replyTo"], "message_id");
}

function feishuMemberIdTypeFromParams(params: Record<string, unknown>): "open_id" | "user_id" | "union_id" {
  const explicit = paramString(params, ["member_id_type", "memberIdType", "user_id_type", "userIdType"]);
  if (explicit === "user_id" || explicit === "union_id") return explicit;
  if (paramString(params, ["user_id", "userId"]) && !paramString(params, ["open_id", "openId", "union_id", "unionId"])) return "user_id";
  if (paramString(params, ["union_id", "unionId"]) && !paramString(params, ["open_id", "openId"])) return "union_id";
  return "open_id";
}

function feishuMemberIdFromParams(params: Record<string, unknown>): string {
  return paramString(params, [
    "member_id",
    "memberId",
    "open_id",
    "openId",
    "user_id",
    "userId",
    "union_id",
    "unionId",
  ]);
}

function normalizedFeishuChannelAction(value: string): string {
  return normalizedAction(value).replace(/_/g, "-");
}

function feishuMessagePayload(params: Record<string, unknown>): {
  msg_type: "text" | "post" | "interactive";
  content: string;
} {
  const card = recordFrom(params.card);
  if (Object.keys(card).length) {
    return {
      msg_type: "interactive",
      content: JSON.stringify(card),
    };
  }
  const text = requireParamString(params, ["text", "message", "content"], "text");
  const format = paramString(params, ["format", "message_format", "messageFormat", "msg_type", "msgType"]).toLowerCase();
  if (["markdown", "md", "post", "rich", "rich_text", "rich-text"].includes(format)) {
    return {
      msg_type: "post",
      content: JSON.stringify({ zh_cn: { content: [[{ tag: "md", text }]] } }),
    };
  }
  return {
    msg_type: "text",
    content: JSON.stringify({ text }),
  };
}

function filterRecordsByQuery(items: unknown[], query: string, limit: number): Record<string, unknown>[] {
  const q = query.trim().toLowerCase();
  const output: Record<string, unknown>[] = [];
  for (const item of items) {
    const record = recordFrom(item);
    const haystack = JSON.stringify(record).toLowerCase();
    if (!q || haystack.includes(q)) output.push(record);
    if (output.length >= limit) break;
  }
  return output;
}

function normalizeFeishuReaction(value: unknown): Record<string, unknown> {
  const record = recordFrom(value);
  const reactionType = recordFrom(record.reaction_type);
  const operator = recordFrom(record.operator);
  const operatorId = recordFrom(record.operator_id);
  return {
    reaction_id: normalizeString(record.reaction_id) || null,
    emoji_type: normalizeString(reactionType.emoji_type) || normalizeString(record.reaction_type) || null,
    operator_type: normalizeString(operator.operator_type) || normalizeString(record.operator_type) || null,
    operator_id: normalizeString(operatorId.open_id) || normalizeString(operatorId.user_id) || normalizeString(operatorId.union_id) || normalizeString(record.operator_id) || null,
  };
}

function requireParamStringMatrix(params: Record<string, unknown>, keys: string[], label: string): string[][] {
  for (const key of keys) {
    const raw = params[key];
    if (!Array.isArray(raw)) continue;
    const rows = raw
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) => row.map((cell) => normalizeString(cell)));
    if (rows.length > 0 && rows.some((row) => row.length > 0)) return rows;
  }
  throw new Error(`${label} must be a non-empty 2D array.`);
}

const FEISHU_TEXT_COLOR: Record<string, number> = {
  red: 1,
  orange: 2,
  yellow: 3,
  green: 4,
  blue: 5,
  purple: 6,
  grey: 7,
  gray: 7,
};

const FEISHU_BACKGROUND_COLOR: Record<string, number> = {
  red: 1,
  orange: 2,
  yellow: 3,
  green: 4,
  blue: 5,
  purple: 6,
  grey: 7,
  gray: 7,
};

interface FeishuColorTextSegment {
  text: string;
  textColor?: number;
  bgColor?: number;
  bold?: boolean;
}

function parseFeishuColorMarkup(content: string): FeishuColorTextSegment[] {
  const segments: FeishuColorTextSegment[] = [];
  const known = "(?:bg:[a-z]+|bold|red|orange|yellow|green|blue|purple|gr[ae]y)";
  const pattern = new RegExp(`\\[(${known}(?:\\s+${known})*)\\](.*?)\\[\\/(?:[^\\]]+)\\]|([^[]+|\\[)`, "gis");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    if (match[3] !== undefined) {
      if (match[3]) segments.push({ text: match[3] });
      continue;
    }
    const text = match[2] || "";
    if (!text) continue;
    const segment: FeishuColorTextSegment = { text };
    const tags = normalizeString(match[1]).toLowerCase().split(/\s+/).filter(Boolean);
    for (const tag of tags) {
      if (tag === "bold") {
        segment.bold = true;
        continue;
      }
      if (tag.startsWith("bg:")) {
        const color = FEISHU_BACKGROUND_COLOR[tag.slice(3)];
        if (color) segment.bgColor = color;
        continue;
      }
      const color = FEISHU_TEXT_COLOR[tag];
      if (color) segment.textColor = color;
    }
    segments.push(segment);
  }
  return segments;
}

function feishuDriveFileType(params: Record<string, unknown>, fallback = "docx"): string {
  return paramString(params, ["file_type", "fileType", "type"]) || fallback;
}

function feishuDriveCommentPageSearch(params: Record<string, unknown>, fileType: string): URLSearchParams {
  const search = new URLSearchParams({ file_type: fileType, user_id_type: "open_id" });
  const pageSize = optionalParamNumber(params, ["page_size", "pageSize"]);
  const pageToken = optionalParamString(params, ["page_token", "pageToken"]);
  if (pageSize !== undefined) search.set("page_size", String(Math.max(1, Math.min(100, Math.floor(pageSize)))));
  if (pageToken) search.set("page_token", pageToken);
  return search;
}

function normalizeFeishuDriveCommentReply(reply: unknown): Record<string, unknown> {
  const record = recordFrom(reply);
  return {
    reply_id: normalizeString(record.reply_id) || normalizeString(record.replyId) || null,
    user_id: normalizeString(record.user_id) || normalizeString(record.userId) || null,
    create_time: record.create_time ?? null,
    update_time: record.update_time ?? null,
    content: record.content ?? null,
  };
}

function normalizeFeishuDriveComment(comment: unknown): Record<string, unknown> {
  const record = recordFrom(comment);
  const replyList = recordFrom(record.reply_list);
  return {
    comment_id: normalizeString(record.comment_id) || normalizeString(record.commentId) || null,
    user_id: normalizeString(record.user_id) || normalizeString(record.userId) || null,
    create_time: record.create_time ?? null,
    update_time: record.update_time ?? null,
    is_solved: record.is_solved ?? null,
    is_whole: record.is_whole ?? null,
    quote: record.quote ?? null,
    has_more_replies: record.has_more ?? null,
    replies_page_token: record.page_token ?? null,
    replies: arrayFrom(replyList.replies).map(normalizeFeishuDriveCommentReply),
  };
}

const FEISHU_BITABLE_FIELD_TYPE_NAMES: Record<number, string> = {
  1: "Text",
  2: "Number",
  3: "SingleSelect",
  4: "MultiSelect",
  5: "DateTime",
  7: "Checkbox",
  11: "User",
  13: "Phone",
  15: "URL",
  17: "Attachment",
  18: "SingleLink",
  19: "Lookup",
  20: "Formula",
  21: "DuplexLink",
  22: "Location",
  23: "GroupChat",
  1001: "CreatedTime",
  1002: "ModifiedTime",
  1003: "CreatedUser",
  1004: "ModifiedUser",
  1005: "AutoNumber",
};

const FEISHU_BITABLE_DEFAULT_CLEANUP_FIELD_TYPES = new Set([3, 5, 17]);

function normalizedFeishuBitableAction(value: string): string {
  return normalizedAction(value).replace(/-/g, "_");
}

function normalizeFeishuAppScope(value: unknown): Record<string, unknown> {
  const scope = recordFrom(value);
  return {
    name: normalizeString(scope.scope_name) || normalizeString(scope.name) || null,
    type: normalizeString(scope.scope_type) || normalizeString(scope.type) || null,
  };
}

function parseFeishuBitableUrl(value: string): { token: string; tableId: string | null; isWiki: boolean } | null {
  try {
    const parsed = new URL(value);
    const tableId = normalizeString(parsed.searchParams.get("table")) || null;
    const wikiMatch = parsed.pathname.match(/\/wiki\/([A-Za-z0-9]+)/);
    if (wikiMatch) return { token: wikiMatch[1], tableId, isWiki: true };
    const baseMatch = parsed.pathname.match(/\/base\/([A-Za-z0-9]+)/);
    if (baseMatch) return { token: baseMatch[1], tableId, isWiki: false };
    return null;
  } catch {
    return null;
  }
}

function bitableAppTokenFromParams(params: Record<string, unknown>): string {
  return paramString(params, ["app_token", "appToken", "base_token", "baseToken", "token"]);
}

function bitableTableIdFromParams(params: Record<string, unknown>): string {
  return paramString(params, ["table_id", "tableId"]);
}

async function resolveFeishuBitableIdentity(
  call: FeishuActionCall,
  params: Record<string, unknown>,
): Promise<{ appToken: string; tableId: string | null; urlType: "wiki" | "base" | "token" }> {
  const directAppToken = bitableAppTokenFromParams(params);
  if (directAppToken) {
    return {
      appToken: directAppToken,
      tableId: bitableTableIdFromParams(params) || null,
      urlType: "token",
    };
  }

  const url = requireParamString(params, ["url", "link"], "url or app_token");
  const parsed = parseFeishuBitableUrl(url);
  if (!parsed) throw new Error("Invalid Feishu Bitable URL. Expected /base/<token> or /wiki/<token>.");
  if (!parsed.isWiki) {
    return {
      appToken: parsed.token,
      tableId: parsed.tableId,
      urlType: "base",
    };
  }

  const search = new URLSearchParams({ token: parsed.token });
  const body = await call("GET", `/open-apis/wiki/v2/spaces/get_node?${search.toString()}`);
  const node = recordFrom(recordFrom(body.data).node);
  const objType = normalizeString(node.obj_type);
  if (objType && objType !== "bitable") {
    throw new Error(`Feishu wiki node is not a bitable (type: ${objType}).`);
  }
  const appToken = normalizeString(node.obj_token);
  if (!appToken) throw new Error("Feishu wiki bitable node did not return obj_token.");
  return {
    appToken,
    tableId: parsed.tableId,
    urlType: "wiki",
  };
}

function normalizeFeishuBitableFields(fields: unknown): Record<string, unknown> {
  const record = recordFrom(fields);
  if (!Object.keys(record).length) throw new Error("fields must be a non-empty object.");
  return record;
}

function normalizeFeishuBitableField(value: unknown): Record<string, unknown> {
  const field = recordFrom(value);
  const type = Number(field.type);
  return {
    field_id: normalizeString(field.field_id) || null,
    field_name: normalizeString(field.field_name) || null,
    type: Number.isFinite(type) ? type : field.type ?? null,
    type_name: Number.isFinite(type) ? FEISHU_BITABLE_FIELD_TYPE_NAMES[type] || `type_${type}` : null,
    is_primary: field.is_primary ?? null,
    ...(Object.prototype.hasOwnProperty.call(field, "property") ? { property: field.property } : {}),
  };
}

function isDefaultEmptyFeishuBitableFieldValue(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  if (Array.isArray(value)) return value.every(isDefaultEmptyFeishuBitableFieldValue);
  if (typeof value === "object") {
    const record = recordFrom(value);
    const keys = Object.keys(record);
    if (keys.length === 0) return true;
    if ("text" in record && keys.every((key) => key === "text" || key === "type")) {
      return record.text === undefined || record.text === null || record.text === "";
    }
    return Object.values(record).every(isDefaultEmptyFeishuBitableFieldValue);
  }
  return false;
}

function isPlaceholderFeishuBitableRecord(fields: unknown): boolean {
  const record = recordFrom(fields);
  const values = Object.values(record);
  return values.length === 0 || values.every(isDefaultEmptyFeishuBitableFieldValue);
}

async function cleanupCreatedFeishuBitable(
  call: FeishuActionCall,
  appToken: string,
  tableId: string,
  tableName: string,
): Promise<{ cleanedRows: number; cleanedFields: number }> {
  let cleanedRows = 0;
  let cleanedFields = 0;
  const fieldsBody = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields`);
  const fields = arrayFrom(recordFrom(fieldsBody.data).items);
  const primaryField = fields.map(recordFrom).find((field) => field.is_primary === true);
  const primaryFieldId = normalizeString(primaryField?.field_id);
  if (primaryFieldId) {
    try {
      await call("PUT", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(primaryFieldId)}`, {
        field_name: tableName.length <= 20 ? tableName : "Name",
        type: 1,
      });
      cleanedFields += 1;
    } catch {
      // Cleanup is best effort; the new bitable is still usable if Feishu rejects default-field edits.
    }
  }

  for (const fieldValue of fields) {
    const field = recordFrom(fieldValue);
    const fieldId = normalizeString(field.field_id);
    const type = Number(field.type);
    if (!fieldId || field.is_primary === true || !FEISHU_BITABLE_DEFAULT_CLEANUP_FIELD_TYPES.has(type)) continue;
    try {
      await call("DELETE", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/fields/${encodeURIComponent(fieldId)}`);
      cleanedFields += 1;
    } catch {
      // Keep cleanup non-critical.
    }
  }

  const recordsBody = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records?page_size=100`);
  const recordIds = arrayFrom(recordFrom(recordsBody.data).items)
    .map(recordFrom)
    .filter((record) => isPlaceholderFeishuBitableRecord(record.fields))
    .map((record) => normalizeString(record.record_id))
    .filter(Boolean);
  if (!recordIds.length) return { cleanedRows, cleanedFields };

  try {
    await call("POST", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/batch_delete`, {
      records: recordIds,
    });
    cleanedRows = recordIds.length;
  } catch {
    for (const recordId of recordIds) {
      try {
        await call("DELETE", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`);
        cleanedRows += 1;
      } catch {
        // Keep cleanup non-critical.
      }
    }
  }
  return { cleanedRows, cleanedFields };
}

function requireParamUploadIndex(params: Record<string, unknown>): number {
  const raw = params.index ?? params.block_index ?? params.blockIndex;
  if (raw === undefined || raw === null || raw === "") return -1;
  const value = typeof raw === "number" ? raw : Number(normalizeString(raw));
  if (!Number.isFinite(value)) throw new Error("index must be a number.");
  return Math.trunc(value);
}

export function feishuChannelActionIsReadOnly(tool: ChannelConnectorFeishuActionTool, action: string): boolean {
  const normalized = normalizedAction(action);
  if (tool === "feishu_channel") {
    return ["read", "list-pins", "channel-info", "member-info", "channel-list", "reactions"].includes(
      normalizedFeishuChannelAction(normalized),
    );
  }
  if (tool === "feishu_app_scopes") return ["list", "scopes"].includes(normalized);
  if (tool === "feishu_doc") return ["read", "list_blocks", "get_block"].includes(normalized);
  if (tool === "feishu_drive") return ["list", "info", "list_comments", "list_comment_replies"].includes(normalized);
  if (tool === "feishu_perm") return normalized === "list";
  if (tool === "feishu_wiki") return ["spaces", "nodes", "get", "search"].includes(normalized);
  if (tool === "feishu_bitable") {
    return ["meta", "get_meta", "list_fields", "list_records", "get_record"].includes(normalizedFeishuBitableAction(normalized));
  }
  return false;
}

function feishuActionMutationRequiresApproval(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
): ChannelConnectorFeishuActionResult {
  return actionResult({
    tool: request.tool,
    action: normalizedAction(request.action),
    readOnly: false,
    config,
    ok: false,
    error: `${request.tool}.${request.action} is a Feishu mutation action and requires Studio IM approval before execution.`,
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

function isPrivateDocxUploadHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost")) return true;
  const version = isIP(lower);
  if (version === 4) {
    const parts = lower.split(".").map((part) => Number(part));
    const [first, second] = parts;
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  if (version === 6) return lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:");
  return false;
}

function docxUploadParamSource(params: Record<string, unknown>, keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = normalizeString(params[key]);
    if (value) return { key, value };
  }
  return null;
}

function isLikelyDocxUploadPath(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || value.startsWith("~/")
    || /^[A-Za-z]:[\\/]/.test(value);
}

function readDocxUploadLocalFile(input: {
  filePath: string;
  requestedFileName?: string | null;
  fallbackFileName: string;
  fallbackMimeType?: string | null;
  maxBytes: number;
}): { data: Uint8Array; fileName: string; mimeType: string } {
  const expanded = input.filePath.startsWith("~")
    ? path.join(process.env.HOME || "", input.filePath.slice(1))
    : input.filePath;
  const absolutePath = path.resolve(expanded);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    throw new Error(`Upload file does not exist: ${input.filePath}`);
  }
  if (!stat.isFile()) throw new Error(`Upload path is not a regular file: ${input.filePath}`);
  if (stat.size > input.maxBytes) {
    throw new Error(`Upload file exceeds Feishu docx upload_all limit: ${stat.size} > ${input.maxBytes}.`);
  }
  const resolvedFileName = safeChannelConnectorFileName(input.requestedFileName || path.basename(absolutePath), input.fallbackFileName);
  return {
    data: fs.readFileSync(absolutePath),
    fileName: resolvedFileName,
    mimeType: inferChannelConnectorMimeType(resolvedFileName, input.fallbackMimeType),
  };
}

function decodeDocxUploadData(input: {
  value: string;
  fallbackFileName: string;
  fallbackMimeType?: string | null;
  maxBytes: number;
}): { data: Uint8Array; fileName: string; mimeType: string } {
  if (input.value.startsWith("data:")) {
    const commaIndex = input.value.indexOf(",");
    if (commaIndex < 0) throw new Error("Invalid data URI: missing comma separator.");
    const header = input.value.slice(0, commaIndex);
    const payload = input.value.slice(commaIndex + 1).trim();
    if (!header.includes(";base64")) throw new Error("Invalid data URI: only base64 data URIs are supported.");
    if (!payload || !/^[A-Za-z0-9+/]+=*$/.test(payload)) throw new Error("Invalid data URI: base64 payload is malformed.");
    const estimatedBytes = Math.ceil((payload.length * 3) / 4);
    if (estimatedBytes > input.maxBytes) throw new Error(`Upload data exceeds Feishu docx upload_all limit: ${estimatedBytes} > ${input.maxBytes}.`);
    const mimeType = normalizeString(header.match(/^data:([^;]+)/)?.[1]) || input.fallbackMimeType || "application/octet-stream";
    const extension = mimeType === "image/jpeg"
      ? ".jpg"
      : mimeType === "image/png"
        ? ".png"
        : mimeType === "image/gif"
          ? ".gif"
          : mimeType === "image/webp"
            ? ".webp"
            : "";
    const fileName = safeChannelConnectorFileName(input.fallbackFileName, `studio-docx-upload${extension || ".bin"}`);
    const data = Buffer.from(payload, "base64");
    return { data, fileName, mimeType: inferChannelConnectorMimeType(fileName, mimeType) };
  }
  const payload = input.value.trim();
  if (!payload || !/^[A-Za-z0-9+/]+=*$/.test(payload)) {
    throw new Error("Invalid base64 upload data. Use a data URI, base64 payload, url, or file_path.");
  }
  const estimatedBytes = Math.ceil((payload.length * 3) / 4);
  if (estimatedBytes > input.maxBytes) throw new Error(`Upload data exceeds Feishu docx upload_all limit: ${estimatedBytes} > ${input.maxBytes}.`);
  const fileName = safeChannelConnectorFileName(input.fallbackFileName, "studio-docx-upload.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.fallbackMimeType);
  return { data: Buffer.from(payload, "base64"), fileName, mimeType };
}

async function fetchDocxUploadUrl(input: {
  url: string;
  fallbackFileName: string;
  fallbackMimeType?: string | null;
  maxBytes: number;
}): Promise<{ data: Uint8Array; fileName: string; mimeType: string }> {
  let parsed: URL;
  try {
    parsed = new URL(input.url);
  } catch {
    throw new Error("upload url is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("upload url must use http or https.");
  if (isPrivateDocxUploadHost(parsed.hostname)) throw new Error("upload url points to a private network host.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, { signal: controller.signal });
    if (!response.ok) throw new Error(`upload url fetch failed with HTTP ${response.status}.`);
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > input.maxBytes) {
      throw new Error(`Upload URL exceeds Feishu docx upload_all limit: ${contentLength} > ${input.maxBytes}.`);
    }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.byteLength > input.maxBytes) throw new Error(`Upload URL exceeds Feishu docx upload_all limit: ${data.byteLength} > ${input.maxBytes}.`);
    const urlName = decodeURIComponent(parsed.pathname.split("/").filter(Boolean).pop() || "");
    const fileName = safeChannelConnectorFileName(input.fallbackFileName || urlName, "studio-docx-upload.bin");
    const mimeType = inferChannelConnectorMimeType(fileName, response.headers.get("content-type") || input.fallbackMimeType);
    return { data, fileName, mimeType };
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDocxUploadInput(
  params: Record<string, unknown>,
  options: { dataKeys: string[]; defaultFileName: string; defaultMimeType?: string | null },
): Promise<{ data: Uint8Array; fileName: string; mimeType: string }> {
  const requestedFileName = paramString(params, ["filename", "file_name", "fileName", "name"]);
  const fileName = safeChannelConnectorFileName(requestedFileName, options.defaultFileName);
  const mimeType = optionalParamString(params, ["mime_type", "mimeType", "content_type", "contentType"]) || options.defaultMimeType || null;
  const url = optionalParamString(params, ["url", "download_url", "downloadUrl"]);
  const filePath = optionalParamString(params, ["file_path", "filePath", "path", "local_path", "localPath"]);
  const dataSource = docxUploadParamSource(params, options.dataKeys);
  const dataValue = dataSource?.value || "";
  const provided = [url ? "url" : "", filePath ? "file_path" : "", dataValue ? dataSource!.key : ""].filter(Boolean);
  if (provided.length !== 1) throw new Error(`Provide exactly one upload source: url, file_path, or data/base64; got ${provided.join(", ") || "none"}.`);
  if (url) return fetchDocxUploadUrl({ url, fallbackFileName: requestedFileName, fallbackMimeType: mimeType, maxBytes: FEISHU_DOCX_UPLOAD_ALL_MAX_BYTES });
  if (dataValue) {
    try {
      return decodeDocxUploadData({ value: dataValue, fallbackFileName: requestedFileName || fileName, fallbackMimeType: mimeType, maxBytes: FEISHU_DOCX_UPLOAD_ALL_MAX_BYTES });
    } catch (error) {
      if (!isLikelyDocxUploadPath(dataValue)) throw error;
      return readDocxUploadLocalFile({
        filePath: dataValue,
        requestedFileName,
        fallbackFileName: options.defaultFileName,
        fallbackMimeType: mimeType,
        maxBytes: FEISHU_DOCX_UPLOAD_ALL_MAX_BYTES,
      });
    }
  }
  return readDocxUploadLocalFile({
    filePath: filePath!,
    requestedFileName,
    fallbackFileName: options.defaultFileName,
    fallbackMimeType: mimeType,
    maxBytes: FEISHU_DOCX_UPLOAD_ALL_MAX_BYTES,
  });
}

async function uploadFeishuDocxMedia(
  multipart: FeishuActionMultipart,
  input: {
    parentType: "docx_image" | "docx_file";
    parentNode: string;
    data: Uint8Array;
    fileName: string;
    mimeType: string;
    routeDocToken?: string | null;
  },
): Promise<string> {
  const body = await multipart({
    path: "/open-apis/drive/v1/medias/upload_all",
    fieldName: "file",
    fileName: input.fileName,
    data: input.data,
    mimeType: input.mimeType,
    fields: {
      file_name: input.fileName,
      parent_type: input.parentType,
      parent_node: input.parentNode,
      size: String(input.data.byteLength),
      ...(input.routeDocToken ? { extra: JSON.stringify({ drive_route_token: input.routeDocToken }) } : {}),
    },
  });
  const fileToken = normalizeString(recordFrom(body.data).file_token) || normalizeString(body.file_token);
  if (!fileToken) throw new Error("Feishu docx media upload response did not include file_token.");
  return fileToken;
}

function normalizeDocxBlockId(block: unknown): string {
  return normalizeString(recordFrom(block).block_id);
}

function normalizeDocxBlockChildren(children: unknown): string[] {
  if (Array.isArray(children)) return children.map((child) => normalizeString(child)).filter(Boolean);
  const child = normalizeString(children);
  return child ? [child] : [];
}

function splitDocxMarkdownByHeadings(markdown: string): string[] {
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    if (!inFence && /^#{1,2}\s/.test(line) && current.length > 0) {
      chunks.push(current.join("\n"));
      current = [];
    }
    current.push(line);
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  return chunks.filter((chunk) => normalizeString(chunk));
}

function splitDocxMarkdownBySize(markdown: string, maxChars: number): string[] {
  if (markdown.length <= maxChars) return [markdown];
  const lines = markdown.split("\n");
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;
  let inFence = false;
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) inFence = !inFence;
    const lineLength = line.length + 1;
    if (current.length > 0 && currentLength + lineLength > maxChars && !inFence) {
      chunks.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += lineLength;
  }
  if (current.length > 0) chunks.push(current.join("\n"));
  if (chunks.length > 1) return chunks.filter((chunk) => normalizeString(chunk));
  const midpoint = Math.floor(lines.length / 2);
  if (midpoint <= 0 || midpoint >= lines.length) return [markdown];
  return [lines.slice(0, midpoint).join("\n"), lines.slice(midpoint).join("\n")]
    .filter((chunk) => normalizeString(chunk));
}

async function convertDocxMarkdown(
  call: FeishuActionCall,
  markdown: string,
  depth = 0,
): Promise<{ blocks: FeishuDocxBlockRecord[]; firstLevelBlockIds: string[] }> {
  try {
    const body = await call("POST", "/open-apis/docx/v1/documents/blocks/convert", {
      content_type: "markdown",
      content: markdown,
    });
    const data = recordFrom(body.data);
    return {
      blocks: arrayFrom(data.blocks).map(recordFrom),
      firstLevelBlockIds: arrayFrom(data.first_level_block_ids).map((id) => normalizeString(id)).filter(Boolean),
    };
  } catch (error) {
    if (depth >= FEISHU_DOCX_CONVERT_MAX_DEPTH || markdown.length < 2) throw error;
    const splitTarget = Math.max(256, Math.floor(markdown.length / 2));
    const chunks = splitDocxMarkdownBySize(markdown, splitTarget);
    if (chunks.length <= 1) throw error;
    const blocks: FeishuDocxBlockRecord[] = [];
    const firstLevelBlockIds: string[] = [];
    for (const chunk of chunks) {
      const converted = await convertDocxMarkdown(call, chunk, depth + 1);
      blocks.push(...converted.blocks);
      firstLevelBlockIds.push(...converted.firstLevelBlockIds);
    }
    return { blocks, firstLevelBlockIds };
  }
}

async function convertDocxMarkdownChunks(
  call: FeishuActionCall,
  markdown: string,
): Promise<{ blocks: FeishuDocxBlockRecord[]; firstLevelBlockIds: string[] }> {
  const blocks: FeishuDocxBlockRecord[] = [];
  const firstLevelBlockIds: string[] = [];
  for (const chunk of splitDocxMarkdownByHeadings(markdown)) {
    const converted = await convertDocxMarkdown(call, chunk);
    const normalized = normalizeConvertedDocxBlockTree(converted.blocks, converted.firstLevelBlockIds);
    blocks.push(...normalized.orderedBlocks);
    firstLevelBlockIds.push(...normalized.rootIds);
  }
  return { blocks, firstLevelBlockIds };
}

function normalizeConvertedDocxBlockTree(
  blocks: FeishuDocxBlockRecord[],
  firstLevelBlockIds: string[],
): { orderedBlocks: FeishuDocxBlockRecord[]; rootIds: string[] } {
  if (blocks.length <= 1) {
    const onlyId = blocks.length === 1 ? normalizeDocxBlockId(blocks[0]) : "";
    return { orderedBlocks: blocks, rootIds: firstLevelBlockIds.length ? firstLevelBlockIds : (onlyId ? [onlyId] : []) };
  }

  const byId = new Map<string, FeishuDocxBlockRecord>();
  const originalOrder = new Map<string, number>();
  for (const [index, block] of blocks.entries()) {
    const blockId = normalizeDocxBlockId(block);
    if (blockId) {
      byId.set(blockId, block);
      originalOrder.set(blockId, index);
    }
  }

  const childIds = new Set<string>();
  for (const block of blocks) {
    for (const childId of normalizeDocxBlockChildren(block.children)) childIds.add(childId);
  }

  const inferredTopLevelIds = blocks
    .filter((block) => {
      const blockId = normalizeDocxBlockId(block);
      if (!blockId) return false;
      const parentId = normalizeString(block.parent_id);
      return !childIds.has(blockId) && (!parentId || !byId.has(parentId));
    })
    .sort((a, b) => (originalOrder.get(normalizeDocxBlockId(a)) ?? 0) - (originalOrder.get(normalizeDocxBlockId(b)) ?? 0))
    .map(normalizeDocxBlockId)
    .filter(Boolean);

  const rootIds = Array.from(new Set((firstLevelBlockIds.length ? firstLevelBlockIds : inferredTopLevelIds).filter((id) => byId.has(id))));
  const visited = new Set<string>();
  const orderedBlocks: FeishuDocxBlockRecord[] = [];
  const visit = (blockId: string) => {
    if (visited.has(blockId) || !byId.has(blockId)) return;
    visited.add(blockId);
    const block = byId.get(blockId);
    if (!block) return;
    orderedBlocks.push(block);
    for (const childId of normalizeDocxBlockChildren(block.children)) visit(childId);
  };
  for (const rootId of rootIds) visit(rootId);
  for (const block of blocks) {
    const blockId = normalizeDocxBlockId(block);
    if (blockId) visit(blockId);
    else orderedBlocks.push(block);
  }
  return { orderedBlocks, rootIds };
}

function cleanedDocxDescendantBlocks(blocks: FeishuDocxBlockRecord[]): FeishuDocxBlockRecord[] {
  return blocks.map((block) => {
    const cleanBlock: FeishuDocxBlockRecord = { ...block };
    delete cleanBlock.parent_id;
    const children = normalizeDocxBlockChildren(cleanBlock.children);
    if (children.length > 0) cleanBlock.children = children;
    else delete cleanBlock.children;
    const table = recordFrom(cleanBlock.table);
    if (Number(cleanBlock.block_type) === 31 && Object.keys(table).length > 0) {
      const property = recordFrom(table.property);
      cleanBlock.table = {
        property: {
          ...(Number.isFinite(Number(property.row_size)) ? { row_size: Number(property.row_size) } : {}),
          ...(Number.isFinite(Number(property.column_size)) ? { column_size: Number(property.column_size) } : {}),
          ...(Array.isArray(property.column_width) ? { column_width: property.column_width } : {}),
        },
      };
    }
    return cleanBlock;
  });
}

function collectDocxDescendants(blockMap: Map<string, FeishuDocxBlockRecord>, rootId: string): FeishuDocxBlockRecord[] {
  const result: FeishuDocxBlockRecord[] = [];
  const visited = new Set<string>();
  const collect = (blockId: string) => {
    if (visited.has(blockId)) return;
    visited.add(blockId);
    const block = blockMap.get(blockId);
    if (!block) return;
    result.push(block);
    for (const childId of normalizeDocxBlockChildren(block.children)) collect(childId);
  };
  collect(rootId);
  return result;
}

async function insertDocxBlocks(
  call: FeishuActionCall,
  docToken: string,
  blocks: FeishuDocxBlockRecord[],
  firstLevelBlockIds: string[],
  options: { parentBlockId?: string; index?: number } = {},
): Promise<FeishuDocxBlockRecord[]> {
  const normalized = normalizeConvertedDocxBlockTree(blocks, firstLevelBlockIds);
  const blockMap = new Map<string, FeishuDocxBlockRecord>();
  for (const block of normalized.orderedBlocks) {
    const blockId = normalizeDocxBlockId(block);
    if (blockId) blockMap.set(blockId, block);
  }

  const inserted: FeishuDocxBlockRecord[] = [];
  let batchRootIds: string[] = [];
  let batchBlocks: FeishuDocxBlockRecord[] = [];
  let batchIndex = options.index ?? -1;
  const flush = async () => {
    if (batchRootIds.length === 0) return;
    const body = await call(
      "POST",
      `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(options.parentBlockId || docToken)}/descendant`,
      {
        children_id: batchRootIds,
        descendants: cleanedDocxDescendantBlocks(batchBlocks),
        index: batchIndex,
      },
    );
    inserted.push(...arrayFrom(recordFrom(body.data).children).map(recordFrom));
    if (batchIndex >= 0) batchIndex += batchRootIds.length;
    batchRootIds = [];
    batchBlocks = [];
  };

  for (const rootId of normalized.rootIds) {
    const rootBlocks = collectDocxDescendants(blockMap, rootId);
    if (rootBlocks.length === 0) continue;
    if (batchBlocks.length > 0 && batchBlocks.length + rootBlocks.length > FEISHU_DOCX_DESCENDANT_BATCH_SIZE) {
      await flush();
    }
    batchRootIds.push(rootId);
    batchBlocks.push(...rootBlocks);
  }
  await flush();
  return inserted;
}

async function listDocxChildBlocks(call: FeishuActionCall, docToken: string, parentBlockId: string): Promise<FeishuDocxBlockRecord[]> {
  const items: FeishuDocxBlockRecord[] = [];
  let pageToken = "";
  do {
    const search = new URLSearchParams();
    if (pageToken) search.set("page_token", pageToken);
    const body = await call(
      "GET",
      `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(parentBlockId)}/children${search.size ? `?${search.toString()}` : ""}`,
    );
    const data = recordFrom(body.data);
    items.push(...arrayFrom(data.items).map(recordFrom));
    pageToken = normalizeString(data.page_token) || normalizeString(data.next_page_token);
  } while (pageToken);
  return items;
}

async function clearDocxDocument(call: FeishuActionCall, docToken: string): Promise<number> {
  const children = await listDocxChildBlocks(call, docToken, docToken);
  const deletableCount = children.filter((block) => Number(block.block_type) !== 1).length;
  if (deletableCount <= 0) return 0;
  await call(
    "DELETE",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(docToken)}/children/batch_delete`,
    { start_index: 0, end_index: deletableCount },
  );
  return deletableCount;
}

async function writeDocxMarkdown(call: FeishuActionCall, docToken: string, markdown: string) {
  const deleted = await clearDocxDocument(call, docToken);
  const converted = await convertDocxMarkdownChunks(call, markdown);
  if (converted.blocks.length === 0) return { success: true, blocks_deleted: deleted, blocks_added: 0 };
  const inserted = await insertDocxBlocks(call, docToken, converted.blocks, converted.firstLevelBlockIds);
  return { success: true, blocks_deleted: deleted, blocks_added: converted.blocks.length, block_ids: inserted.map(normalizeDocxBlockId).filter(Boolean) };
}

async function appendDocxMarkdown(call: FeishuActionCall, docToken: string, markdown: string) {
  const converted = await convertDocxMarkdownChunks(call, markdown);
  if (converted.blocks.length === 0) throw new Error("content is empty.");
  const inserted = await insertDocxBlocks(call, docToken, converted.blocks, converted.firstLevelBlockIds);
  return { success: true, blocks_added: converted.blocks.length, block_ids: inserted.map(normalizeDocxBlockId).filter(Boolean) };
}

async function insertDocxMarkdownAfter(call: FeishuActionCall, docToken: string, markdown: string, afterBlockId: string) {
  const blockBody = await call(
    "GET",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(afterBlockId)}`,
  );
  const block = recordFrom(recordFrom(blockBody.data).block);
  const parentBlockId = normalizeString(block.parent_id) || docToken;
  const siblings = await listDocxChildBlocks(call, docToken, parentBlockId);
  const index = siblings.findIndex((item) => normalizeDocxBlockId(item) === afterBlockId);
  if (index < 0) throw new Error(`after_block_id "${afterBlockId}" was not found under parent block "${parentBlockId}".`);
  const converted = await convertDocxMarkdownChunks(call, markdown);
  if (converted.blocks.length === 0) throw new Error("content is empty.");
  const inserted = await insertDocxBlocks(call, docToken, converted.blocks, converted.firstLevelBlockIds, {
    parentBlockId,
    index: index + 1,
  });
  return { success: true, blocks_added: converted.blocks.length, block_ids: inserted.map(normalizeDocxBlockId).filter(Boolean) };
}

async function updateDocxBlockText(call: FeishuActionCall, docToken: string, blockId: string, content: string) {
  await call("GET", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(blockId)}`);
  await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(blockId)}`, {
    update_text_elements: {
      elements: [{ text_run: { content } }],
    },
  });
  return { success: true, block_id: blockId };
}

async function deleteDocxBlock(call: FeishuActionCall, docToken: string, blockId: string) {
  const blockBody = await call(
    "GET",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(blockId)}`,
  );
  const block = recordFrom(recordFrom(blockBody.data).block);
  const parentBlockId = normalizeString(block.parent_id) || docToken;
  const siblings = await listDocxChildBlocks(call, docToken, parentBlockId);
  const index = siblings.findIndex((item) => normalizeDocxBlockId(item) === blockId);
  if (index < 0) throw new Error(`block_id "${blockId}" was not found under parent block "${parentBlockId}".`);
  await call(
    "DELETE",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(parentBlockId)}/children/batch_delete`,
    { start_index: index, end_index: index + 1 },
  );
  return { success: true, deleted_block_id: blockId };
}

async function createDocxTable(
  call: FeishuActionCall,
  docToken: string,
  rowSize: number,
  columnSize: number,
  options: { parentBlockId?: string; columnWidth?: number[] } = {},
) {
  if (rowSize <= 0 || columnSize <= 0) throw new Error("row_size and column_size must be positive.");
  if (options.columnWidth && options.columnWidth.length !== columnSize) {
    throw new Error("column_width length must equal column_size.");
  }
  const body = await call(
    "POST",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(options.parentBlockId || docToken)}/children`,
    {
      children: [
        {
          block_type: 31,
          table: {
            property: {
              row_size: rowSize,
              column_size: columnSize,
              ...(options.columnWidth ? { column_width: options.columnWidth } : {}),
            },
          },
        },
      ],
    },
  );
  const children = arrayFrom(recordFrom(body.data).children).map(recordFrom);
  const tableBlock = children.find((block) => Number(block.block_type) === 31) || children[0] || {};
  return {
    success: true,
    table_block_id: normalizeDocxBlockId(tableBlock) || null,
    row_size: rowSize,
    column_size: columnSize,
    table_cell_block_ids: normalizeDocxBlockChildren(tableBlock.children),
    raw_children_count: children.length,
  };
}

async function writeDocxTableCells(
  call: FeishuActionCall,
  docToken: string,
  tableBlockId: string,
  values: string[][],
) {
  const tableBody = await call(
    "GET",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`,
  );
  const tableBlock = recordFrom(recordFrom(tableBody.data).block);
  if (Number(tableBlock.block_type) !== 31) throw new Error("table_block_id is not a table block.");
  const table = recordFrom(tableBlock.table);
  const property = recordFrom(table.property);
  const rows = Number(property.row_size);
  const cols = Number(property.column_size);
  const cellIds = arrayFrom(table.cells).map((item) => normalizeString(item)).filter(Boolean);
  if (!Number.isFinite(rows) || rows <= 0 || !Number.isFinite(cols) || cols <= 0 || cellIds.length === 0) {
    throw new Error("Table cell IDs unavailable from table block. Use list_blocks/get_block and pass an editable table block.");
  }

  const writeRows = Math.min(values.length, rows);
  let written = 0;
  for (let rowIndex = 0; rowIndex < writeRows; rowIndex += 1) {
    const row = values[rowIndex] || [];
    const writeCols = Math.min(row.length, cols);
    for (let columnIndex = 0; columnIndex < writeCols; columnIndex += 1) {
      const cellId = cellIds[rowIndex * cols + columnIndex];
      if (!cellId) continue;
      const existingChildren = await listDocxChildBlocks(call, docToken, cellId);
      if (existingChildren.length > 0) {
        await call(
          "DELETE",
          `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(cellId)}/children/batch_delete`,
          { start_index: 0, end_index: existingChildren.length },
        );
      }
      const text = row[columnIndex] || "";
      const converted = await convertDocxMarkdownChunks(call, text);
      if (converted.blocks.length > 0) {
        await insertDocxBlocks(call, docToken, converted.blocks, converted.firstLevelBlockIds, { parentBlockId: cellId });
      }
      written += 1;
    }
  }
  return {
    success: true,
    table_block_id: tableBlockId,
    cells_written: written,
    table_size: { rows, cols },
  };
}

async function createDocxTableWithValues(
  call: FeishuActionCall,
  docToken: string,
  rowSize: number,
  columnSize: number,
  values: string[][],
  options: { parentBlockId?: string; columnWidth?: number[] } = {},
) {
  const created = await createDocxTable(call, docToken, rowSize, columnSize, options);
  const tableBlockId = normalizeString(created.table_block_id);
  if (!tableBlockId) throw new Error("create_table succeeded but table_block_id is missing.");
  const written = await writeDocxTableCells(call, docToken, tableBlockId, values);
  return {
    success: true,
    table_block_id: tableBlockId,
    row_size: rowSize,
    column_size: columnSize,
    cells_written: written.cells_written,
  };
}

async function uploadDocxImageBlock(
  call: FeishuActionCall,
  multipart: FeishuActionMultipart,
  docToken: string,
  params: Record<string, unknown>,
) {
  const upload = await resolveDocxUploadInput(params, {
    dataKeys: ["image", "data", "base64"],
    defaultFileName: "studio-docx-image.png",
    defaultMimeType: "image/png",
  });
  const parentBlockId = optionalParamString(params, ["parent_block_id", "parentBlockId"]) || docToken;
  const created = await call(
    "POST",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(parentBlockId)}/children?document_revision_id=-1`,
    {
      children: [{ block_type: 27, image: {} }],
      index: requireParamUploadIndex(params),
    },
  );
  const imageBlock = arrayFrom(recordFrom(created.data).children)
    .map(recordFrom)
    .find((block) => Number(block.block_type) === 27);
  const imageBlockId = normalizeDocxBlockId(imageBlock);
  if (!imageBlockId) throw new Error("Failed to create Feishu docx image block.");
  const fileToken = await uploadFeishuDocxMedia(multipart, {
    parentType: "docx_image",
    parentNode: imageBlockId,
    data: upload.data,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    routeDocToken: docToken,
  });
  await call(
    "PATCH",
    `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(imageBlockId)}`,
    { replace_image: { token: fileToken } },
  );
  return {
    success: true,
    block_id: imageBlockId,
    file_token: fileToken,
    file_name: upload.fileName,
    mime_type: upload.mimeType,
    size: upload.data.byteLength,
  };
}

async function uploadDocxFile(
  multipart: FeishuActionMultipart,
  docToken: string,
  params: Record<string, unknown>,
) {
  const upload = await resolveDocxUploadInput(params, {
    dataKeys: ["file", "data", "base64"],
    defaultFileName: "studio-docx-file.bin",
  });
  const fileToken = await uploadFeishuDocxMedia(multipart, {
    parentType: "docx_file",
    parentNode: docToken,
    data: upload.data,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
  });
  return {
    success: true,
    file_token: fileToken,
    file_name: upload.fileName,
    mime_type: upload.mimeType,
    size: upload.data.byteLength,
    note: "File uploaded to the Feishu docx media store. Feishu does not support direct file block creation through this action; use the returned file_token if a later workflow needs to reference it.",
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
  const call = async (method: FeishuJsonMethod, pathValue: string, payload?: unknown) => {
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
  if (request.tool === "feishu_app_scopes") {
    if (action === "list" || action === "scopes") {
      const body = await call("GET", "/open-apis/application/v6/scopes");
      const scopes = arrayFrom(recordFrom(body.data).scopes);
      const granted = scopes.filter((scope) => Number(recordFrom(scope).grant_status) === 1).map(normalizeFeishuAppScope);
      const pending = scopes.filter((scope) => Number(recordFrom(scope).grant_status) !== 1).map(normalizeFeishuAppScope);
      return {
        data: {
          granted,
          pending,
          summary: `${granted.length} granted, ${pending.length} pending`,
        },
        statusCode,
        requestCount,
      };
    }
  }
  if (request.tool === "feishu_channel") {
    const channelAction = normalizedFeishuChannelAction(action);
    if (channelAction === "read") {
      const messageId = feishuMessageIdFromParams(params);
      const body = await call("GET", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`);
      const item = feishuGetMessageItem(body);
      return {
        data: {
          message_id: messageId,
          message: item ? parseFeishuMessageItem(item, messageId) : null,
          raw: recordFrom(recordFrom(body.data).message),
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "channel-info") {
      const chatId = feishuChatIdFromParams(params);
      const body = await call("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}`);
      const chat = recordFrom(body.data);
      const includeMembers = optionalParamBoolean(params, ["include_members", "includeMembers", "members"]) === true;
      if (!includeMembers) return { data: { chat_id: chatId, channel: chat }, statusCode, requestCount };
      const pageSize = optionalPositiveInteger(params, ["page_size", "pageSize"], 50, 100);
      const pageToken = optionalParamString(params, ["page_token", "pageToken"]);
      const memberIdType = feishuMemberIdTypeFromParams(params);
      const search = new URLSearchParams({
        member_id_type: memberIdType,
        page_size: String(pageSize),
      });
      if (pageToken) search.set("page_token", pageToken);
      const membersBody = await call("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?${search.toString()}`);
      const membersData = recordFrom(membersBody.data);
      return {
        data: {
          chat_id: chatId,
          channel: chat,
          members: arrayFrom(membersData.items),
          has_more: membersData.has_more === true,
          page_token: normalizeString(membersData.page_token) || null,
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "member-info") {
      const memberId = feishuMemberIdFromParams(params);
      const memberIdType = feishuMemberIdTypeFromParams(params);
      if (memberId) {
        const search = new URLSearchParams({
          user_id_type: memberIdType,
          department_id_type: "open_department_id",
        });
        const body = await call("GET", `/open-apis/contact/v3/users/${encodeURIComponent(memberId)}?${search.toString()}`);
        return {
          data: {
            member_id: memberId,
            member_id_type: memberIdType,
            member: recordFrom(recordFrom(body.data).user),
          },
          statusCode,
          requestCount,
        };
      }
      const chatId = feishuChatIdFromParams(params);
      const pageSize = optionalPositiveInteger(params, ["page_size", "pageSize"], 50, 100);
      const pageToken = optionalParamString(params, ["page_token", "pageToken"]);
      const search = new URLSearchParams({
        member_id_type: memberIdType,
        page_size: String(pageSize),
      });
      if (pageToken) search.set("page_token", pageToken);
      const body = await call("GET", `/open-apis/im/v1/chats/${encodeURIComponent(chatId)}/members?${search.toString()}`);
      const data = recordFrom(body.data);
      return {
        data: {
          chat_id: chatId,
          members: arrayFrom(data.items),
          has_more: data.has_more === true,
          page_token: normalizeString(data.page_token) || null,
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "channel-list") {
      const scope = (optionalParamString(params, ["scope", "kind"]) || "all").toLowerCase();
      const query = optionalParamString(params, ["query", "q"]) || "";
      const limit = optionalPositiveInteger(params, ["limit", "page_size", "pageSize"], 50, 100);
      const output: Record<string, unknown> = {};
      if (["all", "groups", "group", "channels", "channel"].includes(scope)) {
        const body = await call("GET", `/open-apis/im/v1/chats?page_size=${Math.min(limit, 100)}`);
        output.groups = filterRecordsByQuery(arrayFrom(recordFrom(body.data).items), query, limit);
      }
      if (["all", "peers", "peer", "members", "member", "users", "user"].includes(scope)) {
        const body = await call("GET", `/open-apis/contact/v3/users?page_size=${Math.min(limit, 50)}&user_id_type=open_id`);
        output.peers = filterRecordsByQuery(arrayFrom(recordFrom(body.data).items), query, limit);
      }
      return { data: output, statusCode, requestCount };
    }
    if (channelAction === "list-pins") {
      const chatId = feishuChatIdFromParams(params);
      const search = new URLSearchParams({ chat_id: chatId });
      const startTime = optionalParamString(params, ["start_time", "startTime"]);
      const endTime = optionalParamString(params, ["end_time", "endTime"]);
      const pageToken = optionalParamString(params, ["page_token", "pageToken"]);
      const pageSize = optionalParamNumber(params, ["page_size", "pageSize"]);
      if (startTime) search.set("start_time", startTime);
      if (endTime) search.set("end_time", endTime);
      if (pageToken) search.set("page_token", pageToken);
      if (Number.isFinite(pageSize)) search.set("page_size", String(Math.max(1, Math.min(100, Math.floor(pageSize as number)))));
      const body = await call("GET", `/open-apis/im/v1/pins?${search.toString()}`);
      const data = recordFrom(body.data);
      return {
        data: {
          chat_id: chatId,
          pins: arrayFrom(data.items),
          has_more: data.has_more === true,
          page_token: normalizeString(data.page_token) || null,
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "reactions") {
      const messageId = feishuMessageIdFromParams(params);
      const search = new URLSearchParams();
      const emoji = optionalParamString(params, ["emoji", "emoji_type", "emojiType", "reaction_type", "reactionType"]);
      if (emoji) search.set("reaction_type", emoji);
      const body = await call("GET", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions${search.size ? `?${search.toString()}` : ""}`);
      const data = recordFrom(body.data);
      return {
        data: {
          message_id: messageId,
          reactions: arrayFrom(data.items).map(normalizeFeishuReaction),
        },
        statusCode,
        requestCount,
      };
    }
  }
  if (request.tool === "feishu_bitable") {
    const bitableAction = normalizedFeishuBitableAction(action);
    if (bitableAction === "meta" || bitableAction === "get_meta") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const appBody = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}`);
      const app = recordFrom(recordFrom(appBody.data).app);
      let tables: unknown[] = [];
      if (!identity.tableId || optionalParamBoolean(params, ["include_tables", "includeTables", "tables"]) === true) {
        const tablesBody = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables`);
        tables = arrayFrom(recordFrom(tablesBody.data).items).map((item) => {
          const table = recordFrom(item);
          return {
            table_id: normalizeString(table.table_id) || null,
            name: normalizeString(table.name) || null,
          };
        });
      }
      return {
        data: {
          app_token: identity.appToken,
          table_id: identity.tableId,
          name: normalizeString(app.name) || null,
          url_type: identity.urlType,
          ...(tables.length ? { tables } : {}),
          hint: identity.tableId
            ? `Use app_token="${identity.appToken}" and table_id="${identity.tableId}" for other bitable actions.`
            : `Use app_token="${identity.appToken}" for other bitable actions. Select a table_id from the tables list.`,
        },
        statusCode,
        requestCount,
      };
    }
    if (bitableAction === "list_fields") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const body = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/fields`);
      const fields = arrayFrom(recordFrom(body.data).items).map(normalizeFeishuBitableField);
      return { data: { app_token: identity.appToken, table_id: tableId, fields, total: fields.length }, statusCode, requestCount };
    }
    if (bitableAction === "list_records") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const pageSize = optionalPositiveInteger(params, ["page_size", "pageSize"], 100, 500);
      const pageToken = optionalParamString(params, ["page_token", "pageToken"]);
      const search = new URLSearchParams({ page_size: String(pageSize) });
      if (pageToken) search.set("page_token", pageToken);
      const body = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/records?${search.toString()}`);
      const data = recordFrom(body.data);
      return {
        data: {
          app_token: identity.appToken,
          table_id: tableId,
          records: arrayFrom(data.items),
          has_more: data.has_more === true,
          page_token: normalizeString(data.page_token) || null,
          total: data.total ?? null,
        },
        statusCode,
        requestCount,
      };
    }
    if (bitableAction === "get_record") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const recordId = requireParamString(params, ["record_id", "recordId"], "record_id");
      const body = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`);
      return {
        data: {
          app_token: identity.appToken,
          table_id: tableId,
          record_id: recordId,
          record: recordFrom(recordFrom(body.data).record),
        },
        statusCode,
        requestCount,
      };
    }
  }
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
    if (action === "list_comments") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const fileType = feishuDriveFileType(params);
      const search = feishuDriveCommentPageSearch(params, fileType);
      const body = await call("GET", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}/comments?${search.toString()}`);
      const data = recordFrom(body.data);
      return {
        data: {
          has_more: data.has_more ?? false,
          page_token: normalizeString(data.page_token) || null,
          comments: arrayFrom(data.items).map(normalizeFeishuDriveComment),
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "list_comment_replies") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const commentId = requireParamString(params, ["comment_id", "commentId"], "comment_id");
      const fileType = feishuDriveFileType(params);
      const search = feishuDriveCommentPageSearch(params, fileType);
      const body = await call("GET", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}/comments/${encodeURIComponent(commentId)}/replies?${search.toString()}`);
      const data = recordFrom(body.data);
      return {
        data: {
          has_more: data.has_more ?? false,
          page_token: normalizeString(data.page_token) || null,
          replies: arrayFrom(data.items).map(normalizeFeishuDriveCommentReply),
        },
        statusCode,
        requestCount,
      };
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

async function executeFeishuMutationAction(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
  token: string,
): Promise<{ data: unknown; statusCode: number | null; requestCount: number }> {
  let requestCount = 0;
  let statusCode: number | null = null;
  const params = request.params || {};
  const action = normalizedAction(request.action);
  const call = async (method: FeishuJsonMethod, pathValue: string, payload?: unknown) => {
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
  const multipart: FeishuActionMultipart = async (input) => {
    const response = await feishuMultipartRequest(config, {
      path: input.path,
      token,
      fieldName: input.fieldName,
      fileName: input.fileName,
      data: input.data,
      mimeType: input.mimeType,
      fields: input.fields,
    });
    requestCount += response.requestCount;
    statusCode = response.statusCode;
    return response.body;
  };

  if (request.tool === "feishu_channel") {
    const channelAction = normalizedFeishuChannelAction(action);
    if (channelAction === "send" || channelAction === "thread-reply") {
      const payload = feishuMessagePayload(params);
      const isThreadReply = channelAction === "thread-reply";
      const replyToMessageId = isThreadReply ? feishuMessageIdFromParams(params) : optionalParamString(params, ["message_id", "messageId", "reply_to", "replyTo"]);
      const body = replyToMessageId
        ? await call("POST", `/open-apis/im/v1/messages/${encodeURIComponent(replyToMessageId)}/reply`, {
          ...payload,
          ...(isThreadReply || optionalParamBoolean(params, ["reply_in_thread", "replyInThread"]) === true
            ? { reply_in_thread: true }
            : {}),
        })
        : await (async () => {
          const target = feishuReceiveTargetFromParams(params);
          return call("POST", `/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(target.receiveIdType)}`, {
            receive_id: target.receiveId,
            ...payload,
          });
        })();
      const data = recordFrom(body.data);
      return {
        data: {
          success: true,
          message_id: normalizeString(data.message_id) || null,
          chat_id: normalizeString(data.chat_id) || null,
          raw: data,
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "edit") {
      const messageId = feishuMessageIdFromParams(params);
      const payload = feishuMessagePayload(params);
      const body = await call("PUT", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, payload);
      return {
        data: {
          success: true,
          message_id: messageId,
          raw: recordFrom(body.data),
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "pin") {
      const messageId = feishuMessageIdFromParams(params);
      const body = await call("POST", "/open-apis/im/v1/pins", { message_id: messageId });
      return {
        data: {
          success: true,
          message_id: messageId,
          pin: recordFrom(recordFrom(body.data).pin),
        },
        statusCode,
        requestCount,
      };
    }
    if (channelAction === "unpin") {
      const messageId = feishuMessageIdFromParams(params);
      await call("DELETE", `/open-apis/im/v1/pins/${encodeURIComponent(messageId)}`);
      return { data: { success: true, message_id: messageId }, statusCode, requestCount };
    }
    if (channelAction === "react") {
      const messageId = feishuMessageIdFromParams(params);
      const emoji = optionalParamString(params, ["emoji", "emoji_type", "emojiType", "reaction_type", "reactionType"]);
      const remove = optionalParamBoolean(params, ["remove", "delete"]) === true;
      const clearAll = optionalParamBoolean(params, ["clear_all", "clearAll"]) === true;
      const explicitReactionId = optionalParamString(params, ["reaction_id", "reactionId"]);
      if (remove || clearAll) {
        if (explicitReactionId) {
          await call("DELETE", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(explicitReactionId)}`);
          return {
            data: { success: true, message_id: messageId, removed: [explicitReactionId] },
            statusCode,
            requestCount,
          };
        }
        if (!emoji && !clearAll) throw new Error("emoji is required when removing a Feishu reaction without reaction_id.");
        const search = new URLSearchParams();
        if (emoji) search.set("reaction_type", emoji);
        const listBody = await call("GET", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions${search.size ? `?${search.toString()}` : ""}`);
        const reactions = arrayFrom(recordFrom(listBody.data).items).map(normalizeFeishuReaction);
        const ownReactionIds = reactions
          .filter((item) => normalizeString(item.operator_type) === "app")
          .map((item) => normalizeString(item.reaction_id))
          .filter(Boolean);
        for (const reactionId of ownReactionIds) {
          await call("DELETE", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions/${encodeURIComponent(reactionId)}`);
        }
        return {
          data: { success: true, message_id: messageId, removed: ownReactionIds },
          statusCode,
          requestCount,
        };
      }
      if (!emoji) throw new Error("emoji is required to add a Feishu reaction.");
      const body = await call("POST", `/open-apis/im/v1/messages/${encodeURIComponent(messageId)}/reactions`, {
        reaction_type: { emoji_type: emoji },
      });
      const data = recordFrom(body.data);
      return {
        data: {
          success: true,
          message_id: messageId,
          reaction_id: normalizeString(data.reaction_id) || null,
          emoji_type: emoji,
        },
        statusCode,
        requestCount,
      };
    }
  }

  if (request.tool === "feishu_bitable") {
    const bitableAction = normalizedFeishuBitableAction(action);
    if (bitableAction === "create_record") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const fields = normalizeFeishuBitableFields(params.fields);
      const body = await call("POST", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/records`, {
        fields,
      });
      return {
        data: {
          success: true,
          app_token: identity.appToken,
          table_id: tableId,
          record: recordFrom(recordFrom(body.data).record),
        },
        statusCode,
        requestCount,
      };
    }
    if (bitableAction === "update_record") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const recordId = requireParamString(params, ["record_id", "recordId"], "record_id");
      const fields = normalizeFeishuBitableFields(params.fields);
      const body = await call("PUT", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/records/${encodeURIComponent(recordId)}`, {
        fields,
      });
      return {
        data: {
          success: true,
          app_token: identity.appToken,
          table_id: tableId,
          record_id: recordId,
          record: recordFrom(recordFrom(body.data).record),
        },
        statusCode,
        requestCount,
      };
    }
    if (bitableAction === "create_app") {
      const name = requireParamString(params, ["name", "title"], "name");
      const folderToken = optionalParamString(params, ["folder_token", "folderToken"]);
      const body = await call("POST", "/open-apis/bitable/v1/apps", {
        name,
        ...(folderToken ? { folder_token: folderToken } : {}),
      });
      const app = recordFrom(recordFrom(body.data).app);
      const appToken = normalizeString(app.app_token);
      if (!appToken) throw new Error("Feishu Bitable create_app response did not include app_token.");
      let tableId: string | null = null;
      let cleanedRows = 0;
      let cleanedFields = 0;
      try {
        const tablesBody = await call("GET", `/open-apis/bitable/v1/apps/${encodeURIComponent(appToken)}/tables`);
        const firstTable = arrayFrom(recordFrom(tablesBody.data).items).map(recordFrom).find((item) => normalizeString(item.table_id));
        tableId = normalizeString(firstTable?.table_id) || null;
        if (tableId && optionalParamBoolean(params, ["cleanup", "cleanup_defaults", "cleanupDefaults"]) !== false) {
          const cleanup = await cleanupCreatedFeishuBitable(call, appToken, tableId, name);
          cleanedRows = cleanup.cleanedRows;
          cleanedFields = cleanup.cleanedFields;
        }
      } catch {
        // Creation succeeded; default table cleanup is intentionally non-critical.
      }
      return {
        data: {
          success: true,
          app_token: appToken,
          table_id: tableId,
          name: normalizeString(app.name) || name,
          url: normalizeString(app.url) || null,
          cleaned_placeholder_rows: cleanedRows,
          cleaned_default_fields: cleanedFields,
          hint: tableId
            ? `Table created. Use app_token="${appToken}" and table_id="${tableId}" for other bitable actions.`
            : "Table created. Use feishu_bitable get_meta to get table_id and field details.",
        },
        statusCode,
        requestCount,
      };
    }
    if (bitableAction === "create_field") {
      const identity = await resolveFeishuBitableIdentity(call, params);
      const tableId = identity.tableId || requireParamString(params, ["table_id", "tableId"], "table_id");
      const fieldName = requireParamString(params, ["field_name", "fieldName", "name"], "field_name");
      const fieldType = requireParamNumber(params, ["field_type", "fieldType", "type"], "field_type");
      const property = Object.keys(recordFrom(params.property)).length ? recordFrom(params.property) : undefined;
      const body = await call("POST", `/open-apis/bitable/v1/apps/${encodeURIComponent(identity.appToken)}/tables/${encodeURIComponent(tableId)}/fields`, {
        field_name: fieldName,
        type: fieldType,
        ...(property ? { property } : {}),
      });
      return {
        data: {
          success: true,
          app_token: identity.appToken,
          table_id: tableId,
          field: normalizeFeishuBitableField(recordFrom(recordFrom(body.data).field)),
        },
        statusCode,
        requestCount,
      };
    }
  }

  if (request.tool === "feishu_doc") {
    if (action === "write") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const content = requireParamString(params, ["content", "markdown", "text"], "content");
      const data = await writeDocxMarkdown(call, docToken, content);
      return { data, statusCode, requestCount };
    }
    if (action === "append") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const content = requireParamString(params, ["content", "markdown", "text"], "content");
      const data = await appendDocxMarkdown(call, docToken, content);
      return { data, statusCode, requestCount };
    }
    if (action === "insert") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const content = requireParamString(params, ["content", "markdown", "text"], "content");
      const afterBlockId = requireParamString(params, ["after_block_id", "afterBlockId", "block_id", "blockId"], "after_block_id");
      const data = await insertDocxMarkdownAfter(call, docToken, content, afterBlockId);
      return { data, statusCode, requestCount };
    }
    if (action === "update_block") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const blockId = requireParamString(params, ["block_id", "blockId"], "block_id");
      const content = requireParamString(params, ["content", "text"], "content");
      const data = await updateDocxBlockText(call, docToken, blockId, content);
      return { data, statusCode, requestCount };
    }
    if (action === "delete_block") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const blockId = requireParamString(params, ["block_id", "blockId"], "block_id");
      const data = await deleteDocxBlock(call, docToken, blockId);
      return { data, statusCode, requestCount };
    }
    if (action === "create_table") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const rowSize = requireParamNumber(params, ["row_size", "rowSize"], "row_size");
      const columnSize = requireParamNumber(params, ["column_size", "columnSize"], "column_size");
      const data = await createDocxTable(call, docToken, rowSize, columnSize, {
        parentBlockId: optionalParamString(params, ["parent_block_id", "parentBlockId"]),
        columnWidth: optionalParamNumberArray(params, ["column_width", "columnWidth"]),
      });
      return { data, statusCode, requestCount };
    }
    if (action === "write_table_cells") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const values = requireParamStringMatrix(params, ["values"], "values");
      const data = await writeDocxTableCells(call, docToken, tableBlockId, values);
      return { data, statusCode, requestCount };
    }
    if (action === "create_table_with_values") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const rowSize = requireParamNumber(params, ["row_size", "rowSize"], "row_size");
      const columnSize = requireParamNumber(params, ["column_size", "columnSize"], "column_size");
      const values = requireParamStringMatrix(params, ["values"], "values");
      const data = await createDocxTableWithValues(call, docToken, rowSize, columnSize, values, {
        parentBlockId: optionalParamString(params, ["parent_block_id", "parentBlockId"]),
        columnWidth: optionalParamNumberArray(params, ["column_width", "columnWidth"]),
      });
      return { data, statusCode, requestCount };
    }
    if (action === "insert_table_row") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const rowIndex = optionalParamNumber(params, ["row_index", "rowIndex", "index"]) ?? -1;
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`, {
        insert_table_row: { row_index: rowIndex },
      });
      return { data: { success: true, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "insert_table_column") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const columnIndex = optionalParamNumber(params, ["column_index", "columnIndex", "index"]) ?? -1;
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`, {
        insert_table_column: { column_index: columnIndex },
      });
      return { data: { success: true, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "delete_table_rows") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const rowStart = requireParamNumber(params, ["row_start", "rowStart", "row_start_index", "rowStartIndex"], "row_start");
      const rowCount = optionalParamNumber(params, ["row_count", "rowCount", "count"]) ?? 1;
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`, {
        delete_table_rows: {
          row_start_index: rowStart,
          row_end_index: rowStart + rowCount,
        },
      });
      return { data: { success: true, rows_deleted: rowCount, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "delete_table_columns") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const columnStart = requireParamNumber(params, ["column_start", "columnStart", "column_start_index", "columnStartIndex"], "column_start");
      const columnCount = optionalParamNumber(params, ["column_count", "columnCount", "count"]) ?? 1;
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`, {
        delete_table_columns: {
          column_start_index: columnStart,
          column_end_index: columnStart + columnCount,
        },
      });
      return { data: { success: true, columns_deleted: columnCount, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "merge_table_cells") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const tableBlockId = requireParamString(params, ["table_block_id", "tableBlockId", "block_id", "blockId"], "table_block_id");
      const rowStart = requireParamNumber(params, ["row_start", "rowStart", "row_start_index", "rowStartIndex"], "row_start");
      const rowEnd = requireParamNumber(params, ["row_end", "rowEnd", "row_end_index", "rowEndIndex"], "row_end");
      const columnStart = requireParamNumber(params, ["column_start", "columnStart", "column_start_index", "columnStartIndex"], "column_start");
      const columnEnd = requireParamNumber(params, ["column_end", "columnEnd", "column_end_index", "columnEndIndex"], "column_end");
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(tableBlockId)}`, {
        merge_table_cells: {
          row_start_index: rowStart,
          row_end_index: rowEnd,
          column_start_index: columnStart,
          column_end_index: columnEnd,
        },
      });
      return { data: { success: true, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "color_text") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const blockId = requireParamString(params, ["block_id", "blockId"], "block_id");
      const content = requireParamString(params, ["content", "text"], "content");
      const segments = parseFeishuColorMarkup(content);
      const elements = segments.map((segment) => ({
        text_run: {
          content: segment.text,
          text_element_style: {
            ...(segment.textColor ? { text_color: segment.textColor } : {}),
            ...(segment.bgColor ? { background_color: segment.bgColor } : {}),
            ...(segment.bold ? { bold: true } : {}),
          },
        },
      }));
      const body = await call("PATCH", `/open-apis/docx/v1/documents/${encodeURIComponent(docToken)}/blocks/${encodeURIComponent(blockId)}`, {
        update_text_elements: { elements },
      });
      return { data: { success: true, segments: segments.length, block: recordFrom(recordFrom(body.data).block) }, statusCode, requestCount };
    }
    if (action === "upload_image") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const data = await uploadDocxImageBlock(call, multipart, docToken, params);
      return { data, statusCode, requestCount };
    }
    if (action === "upload_file") {
      const docToken = requireParamString(params, ["doc_token", "document_id", "docToken", "token"], "doc_token");
      const data = await uploadDocxFile(multipart, docToken, params);
      return { data, statusCode, requestCount };
    }
    if (action === "create") {
      const title = requireParamString(params, ["title"], "title");
      const folderToken = optionalParamString(params, ["folder_token", "folderToken"]);
      const body = await call("POST", "/open-apis/docx/v1/documents", {
        title,
        ...(folderToken ? { folder_token: folderToken } : {}),
      });
      const document = recordFrom(recordFrom(body.data).document);
      const docToken = normalizeString(document.document_id) || normalizeString(document.token);
      return {
        data: {
          document_id: docToken || null,
          title: normalizeString(document.title) || title,
          url: docToken ? `https://feishu.cn/docx/${docToken}` : null,
          document,
        },
        statusCode,
        requestCount,
      };
    }
  }

  if (request.tool === "feishu_drive") {
    if (action === "create_folder") {
      const name = requireParamString(params, ["name"], "name");
      const folderToken = optionalParamString(params, ["folder_token", "folderToken"]);
      const body = await call("POST", "/open-apis/drive/v1/files/create_folder", {
        name,
        folder_token: folderToken && folderToken !== "0" ? folderToken : "0",
      });
      const data = recordFrom(body.data);
      return {
        data: {
          token: normalizeString(data.token) || null,
          url: normalizeString(data.url) || null,
          raw: data,
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "move") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const type = requireParamString(params, ["type", "file_type", "fileType"], "type");
      const folderToken = requireParamString(params, ["folder_token", "folderToken"], "folder_token");
      const body = await call("POST", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}/move`, {
        type,
        folder_token: folderToken,
      });
      const data = recordFrom(body.data);
      return {
        data: {
          success: true,
          task_id: normalizeString(data.task_id) || null,
          raw: data,
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "delete") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const type = requireParamString(params, ["type", "file_type", "fileType"], "type");
      const search = new URLSearchParams({ type });
      const body = await call("DELETE", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}?${search.toString()}`);
      return { data: { success: true, raw: recordFrom(body.data) }, statusCode, requestCount };
    }
    if (action === "add_comment") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const fileType = feishuDriveFileType(params);
      const content = requireParamString(params, ["content", "text", "message"], "content");
      const blockId = optionalParamString(params, ["block_id", "blockId"]);
      if (blockId && fileType !== "docx") throw new Error("block_id is only supported for docx comments.");
      const body = await call("POST", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}/new_comments`, {
        file_type: fileType,
        reply_elements: [{ type: "text", text: content }],
        ...(blockId ? { anchor: { block_id: blockId } } : {}),
      });
      return { data: { success: true, raw: recordFrom(body.data) }, statusCode, requestCount };
    }
    if (action === "reply_comment") {
      const fileToken = requireParamString(params, ["file_token", "fileToken", "token"], "file_token");
      const commentId = requireParamString(params, ["comment_id", "commentId"], "comment_id");
      const fileType = feishuDriveFileType(params);
      const content = requireParamString(params, ["content", "text", "message"], "content");
      const search = new URLSearchParams({ file_type: fileType });
      const body = await call("POST", `/open-apis/drive/v1/files/${encodeURIComponent(fileToken)}/comments/${encodeURIComponent(commentId)}/replies?${search.toString()}`, {
        content: {
          elements: [
            {
              type: "text_run",
              text_run: { text: content },
            },
          ],
        },
      });
      return { data: { success: true, raw: recordFrom(body.data) }, statusCode, requestCount };
    }
  }

  if (request.tool === "feishu_perm") {
    if (action === "add") {
      const tokenValue = requireParamString(params, ["token", "file_token", "doc_token"], "token");
      const type = paramString(params, ["type", "file_type", "fileType"]) || "docx";
      const memberType = requireParamString(params, ["member_type", "memberType"], "member_type");
      const memberId = requireParamString(params, ["member_id", "memberId"], "member_id");
      const perm = requireParamString(params, ["perm", "permission"], "perm");
      const search = new URLSearchParams({ type, need_notification: "false" });
      const body = await call("POST", `/open-apis/drive/v1/permissions/${encodeURIComponent(tokenValue)}/members?${search.toString()}`, {
        member_type: memberType,
        member_id: memberId,
        perm,
      });
      return { data: { success: true, member: recordFrom(recordFrom(body.data).member) }, statusCode, requestCount };
    }
    if (action === "remove") {
      const tokenValue = requireParamString(params, ["token", "file_token", "doc_token"], "token");
      const type = paramString(params, ["type", "file_type", "fileType"]) || "docx";
      const memberType = requireParamString(params, ["member_type", "memberType"], "member_type");
      const memberId = requireParamString(params, ["member_id", "memberId"], "member_id");
      const search = new URLSearchParams({ type, member_type: memberType });
      await call("DELETE", `/open-apis/drive/v1/permissions/${encodeURIComponent(tokenValue)}/members/${encodeURIComponent(memberId)}?${search.toString()}`);
      return { data: { success: true }, statusCode, requestCount };
    }
  }

  if (request.tool === "feishu_wiki") {
    if (action === "create") {
      const spaceId = requireParamString(params, ["space_id", "spaceId"], "space_id");
      const title = requireParamString(params, ["title"], "title");
      const objType = paramString(params, ["obj_type", "objType"]) || "docx";
      const parentNodeToken = optionalParamString(params, ["parent_node_token", "parentNodeToken"]);
      const body = await call("POST", `/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes`, {
        obj_type: objType,
        node_type: "origin",
        title,
        ...(parentNodeToken ? { parent_node_token: parentNodeToken } : {}),
      });
      const node = recordFrom(recordFrom(body.data).node);
      return {
        data: {
          node_token: normalizeString(node.node_token) || null,
          obj_token: normalizeString(node.obj_token) || null,
          obj_type: normalizeString(node.obj_type) || objType,
          title: normalizeString(node.title) || title,
          raw: node,
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "move") {
      const spaceId = requireParamString(params, ["space_id", "spaceId"], "space_id");
      const nodeToken = requireParamString(params, ["node_token", "nodeToken"], "node_token");
      const targetSpaceId = optionalParamString(params, ["target_space_id", "targetSpaceId"]) || spaceId;
      const targetParentToken = optionalParamString(params, ["target_parent_token", "targetParentToken"]);
      const body = await call("POST", `/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes/${encodeURIComponent(nodeToken)}/move`, {
        target_space_id: targetSpaceId,
        ...(targetParentToken ? { target_parent_token: targetParentToken } : {}),
      });
      const node = recordFrom(recordFrom(body.data).node);
      return {
        data: {
          success: true,
          node_token: normalizeString(node.node_token) || nodeToken,
          raw: node,
        },
        statusCode,
        requestCount,
      };
    }
    if (action === "rename") {
      const spaceId = requireParamString(params, ["space_id", "spaceId"], "space_id");
      const nodeToken = requireParamString(params, ["node_token", "nodeToken"], "node_token");
      const title = requireParamString(params, ["title"], "title");
      const body = await call("PATCH", `/open-apis/wiki/v2/spaces/${encodeURIComponent(spaceId)}/nodes/${encodeURIComponent(nodeToken)}/title`, {
        title,
      });
      return { data: { success: true, node_token: nodeToken, title, raw: recordFrom(body.data) }, statusCode, requestCount };
    }
  }

  throw new Error(`Unsupported Feishu mutation action: ${request.tool}.${request.action}`);
}

export async function executeFeishuChannelAction(
  config: ChannelConnectorFeishuTransportConfig,
  request: ChannelConnectorFeishuActionRequest,
  cachePath?: string | null,
  options: ChannelConnectorFeishuActionOptions = {},
): Promise<ChannelConnectorFeishuActionResult> {
  const action = normalizedAction(request.action);
  const readOnly = feishuChannelActionIsReadOnly(request.tool, action);
  if (!readOnly && options.allowMutation !== true) return feishuActionMutationRequiresApproval(config, request);

  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const executed = readOnly
      ? await executeFeishuReadOnlyAction(config, { ...request, action }, token.token)
      : await executeFeishuMutationAction(config, { ...request, action }, token.token);
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
    replyToMessageId?: string | null;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const replyToMessageId = normalizeString(input.replyToMessageId);
    const target = replyToMessageId ? null : normalizeFeishuReceiveTarget(input);
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
      const payload = {
        msg_type: "text",
        content: JSON.stringify({ text: chunk }),
      };
      const response = await feishuJsonRequest(config, {
        method: "POST",
        path: replyToMessageId
          ? `/open-apis/im/v1/messages/${encodeURIComponent(replyToMessageId)}/reply`
          : `/open-apis/im/v1/messages?receive_id_type=${target?.receiveIdType}`,
        token: token.token,
        payload: replyToMessageId ? payload : {
          receive_id: target?.receiveId,
          ...payload,
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
      action: replyToMessageId ? "reply-message" : "send-message",
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
      action: normalizeString(input.replyToMessageId) ? "reply-message" : "send-message",
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
    replyToMessageId?: string | null;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const replyToMessageId = normalizeString(input.replyToMessageId);
    const target = replyToMessageId ? null : normalizeFeishuReceiveTarget(input);
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
      const payload = {
        msg_type: "post",
        content: JSON.stringify({
          zh_cn: {
            content: [[{ tag: "md", text: chunk }]],
          },
        }),
      };
      const response = await feishuJsonRequest(config, {
        method: "POST",
        path: replyToMessageId
          ? `/open-apis/im/v1/messages/${encodeURIComponent(replyToMessageId)}/reply`
          : `/open-apis/im/v1/messages?receive_id_type=${target?.receiveIdType}`,
        token: token.token,
        payload: replyToMessageId ? payload : {
          receive_id: target?.receiveId,
          ...payload,
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
      action: replyToMessageId ? "reply-post" : "send-post",
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
      action: normalizeString(input.replyToMessageId) ? "reply-post" : "send-post",
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
    chatId?: string | null;
    replyToMessageId?: string | null;
    card: ChannelConnectorFeishuInteractiveCard | Record<string, unknown>;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    const replyToMessageId = normalizeString(input.replyToMessageId);
    const chatId = normalizeString(input.chatId);
    if (!replyToMessageId && !chatId) throw new Error("Feishu chatId is required.");
    const token = await getFeishuTenantToken(config, cachePath);
    requestCount += token.requestCount;
    tokenCache = token.tokenCache;
    const response = await feishuJsonRequest(config, {
      method: "POST",
      path: replyToMessageId
        ? `/open-apis/im/v1/messages/${encodeURIComponent(replyToMessageId)}/reply`
        : "/open-apis/im/v1/messages?receive_id_type=chat_id",
      token: token.token,
      payload: {
        ...(replyToMessageId ? {} : { receive_id: chatId }),
        msg_type: "interactive",
        content: JSON.stringify(input.card),
      },
    });
    requestCount += response.requestCount;
    const data = recordFrom(response.body.data);
    return transportResult({
      attempted: true,
      ok: true,
      action: replyToMessageId ? "reply-card" : "send-card",
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
      action: normalizeString(input.replyToMessageId) ? "reply-card" : "send-card",
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
