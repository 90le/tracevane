import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorFeishuTransportConfig,
  ChannelConnectorFeishuTransportResult,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";
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
    chatId: string;
    content: string;
  },
  cachePath?: string | null,
): Promise<ChannelConnectorFeishuTransportResult> {
  let requestCount = 0;
  let tokenCache: ChannelConnectorFeishuTransportResult["tokenCache"] = cachePath ? "miss" : "disabled";
  try {
    if (!normalizeString(input.chatId)) throw new Error("Feishu chatId is required.");
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
        path: "/open-apis/im/v1/messages?receive_id_type=chat_id",
        token: token.token,
        payload: {
          receive_id: input.chatId,
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
