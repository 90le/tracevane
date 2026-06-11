import { createHash, createHmac, randomUUID } from "node:crypto";
import type {
  ChannelConnectorOctoReplyPlan,
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";
import { parseChannelConnectorByteSize } from "./attachment-staging.js";
import { inferChannelConnectorMimeType, safeChannelConnectorFileName } from "./outbound-files.js";

const OCTO_TEXT_MESSAGE_TYPE = 1;
const OCTO_IMAGE_MESSAGE_TYPE = 2;
const OCTO_FILE_MESSAGE_TYPE = 8;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_OCTO_DIRECT_UPLOAD_MIN_BYTES = 0;
const OCTO_LEGACY_MULTIPART_GONE_STATUS_CODES = new Set([404, 405, 410]);

interface OctoUploadCredentials {
  bucket: string;
  region: string;
  key: string;
  tmpSecretId: string;
  tmpSecretKey: string;
  sessionToken: string;
  startTime: number | null;
  expiredTime: number;
  cdnBaseUrl: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseOctoJson(raw: string): unknown {
  const safe = raw.replace(/"message_id"\s*:\s*(\d{16,})/g, '"message_id":"$1"');
  return JSON.parse(safe) as unknown;
}

function parseOctoDirectUploadMinBytes(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return DEFAULT_OCTO_DIRECT_UPLOAD_MIN_BYTES;
  if (raw === "0") return 0;
  if (["off", "false", "none", "never", "unlimited"].includes(raw)) return Number.POSITIVE_INFINITY;
  return parseChannelConnectorByteSize(value, DEFAULT_OCTO_DIRECT_UPLOAD_MIN_BYTES);
}

export function octoTransportFromMetadata(metadataValue: unknown): ChannelConnectorOctoTransportConfig | null {
  const metadata = recordFrom(metadataValue);
  const apiUrl = normalizeString(metadata.apiUrl || metadata.api_url);
  const botToken = normalizeString(metadata.botToken || metadata.bot_token || metadata.token);
  if (!apiUrl || !botToken) return null;
  const wsUrl = normalizeString(metadata.wsUrl || metadata.ws_url);
  const cosUploadBaseUrl = normalizeString(metadata.cosUploadBaseUrl || metadata.cos_upload_base_url);
  const rawStrategy = normalizeString(
    metadata.octoUploadStrategy
      || metadata.octo_upload_strategy
      || metadata.uploadStrategy
      || metadata.upload_strategy,
  ).toLowerCase();
  const uploadStrategy = rawStrategy === "direct" || rawStrategy === "multipart" ? rawStrategy : "auto";
  const directUploadMinBytes = parseOctoDirectUploadMinBytes(
    metadata.octoDirectUploadMinBytes
      ?? metadata.octo_direct_upload_min_bytes
      ?? metadata.directUploadMinBytes
      ?? metadata.direct_upload_min_bytes,
  );
  return {
    apiUrl,
    botToken,
    wsUrl: wsUrl || null,
    cosUploadBaseUrl: cosUploadBaseUrl || null,
    uploadStrategy,
    directUploadMinBytes,
  };
}

export function octoTransportFromBinding(binding: ChannelConnectorPlatformBinding): ChannelConnectorOctoTransportConfig | null {
  return octoTransportFromMetadata(binding.metadata);
}

function transportResult(
  input: Partial<ChannelConnectorOctoTransportResult> & Pick<ChannelConnectorOctoTransportResult, "action">,
): ChannelConnectorOctoTransportResult {
  const result: ChannelConnectorOctoTransportResult = {
    attempted: input.attempted ?? false,
    ok: input.ok ?? null,
    action: input.action,
    apiUrl: input.apiUrl ?? null,
    statusCode: input.statusCode ?? null,
    error: input.error ?? null,
    requestCount: input.requestCount ?? 0,
    robotId: input.robotId ?? null,
    imToken: input.imToken ?? null,
    wsUrl: input.wsUrl ?? null,
    mediaUrl: input.mediaUrl ?? null,
    fileName: input.fileName ?? null,
    mimeType: input.mimeType ?? null,
    size: input.size ?? null,
    uploadBucket: input.uploadBucket ?? null,
    uploadRegion: input.uploadRegion ?? null,
    uploadKey: input.uploadKey ?? null,
    uploadCdnBaseUrl: input.uploadCdnBaseUrl ?? null,
    uploadExpiredTime: input.uploadExpiredTime ?? null,
    uploadCredentialKeys: input.uploadCredentialKeys ?? null,
  };
  if ("data" in input) result.data = input.data ?? null;
  if ("itemCount" in input) result.itemCount = input.itemCount ?? null;
  return result;
}

export function emptyOctoTransportResult(action: ChannelConnectorOctoTransportResult["action"] = "none"): ChannelConnectorOctoTransportResult {
  return transportResult({ action });
}

async function requestOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  payload?: unknown,
  options: { timeoutMs?: number | null } = {},
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeoutMs = typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
    ? Math.floor(options.timeoutMs)
    : DEFAULT_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      authorization: `Bearer ${config.botToken}`,
    };
    if (payload !== undefined) headers["content-type"] = "application/json";
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = parseOctoJson(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Octo API ${method} ${path} failed with HTTP ${response.status}`), {
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

async function postOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
  payload: unknown,
  options?: { timeoutMs?: number | null },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return requestOctoJson(config, "POST", path, payload, options);
}

async function getOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return requestOctoJson(config, "GET", path);
}

async function putOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
  payload: unknown,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return requestOctoJson(config, "PUT", path, payload);
}

async function deleteOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return requestOctoJson(config, "DELETE", path);
}

async function getOctoRedirect(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
): Promise<{ statusCode: number; location: string | null; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.botToken}`,
      },
      redirect: "manual",
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = parseOctoJson(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
    }
    const location = response.headers.get("location");
    if (!response.ok && !location) {
      throw Object.assign(new Error(`Octo API GET ${path} failed with HTTP ${response.status}`), {
        statusCode: response.status,
        body,
      });
    }
    return {
      statusCode: response.status,
      location,
      body,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Octo transport request failed.";
}

function errorStatusCode(error: unknown): number | null {
  if (typeof error === "object" && error !== null && "statusCode" in error) {
    const value = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function mediaUrlFromResponse(body: Record<string, unknown>): string {
  const data = recordFrom(body.data);
  return normalizeString(body.url)
    || normalizeString(body.file_url)
    || normalizeString(body.fileUrl)
    || normalizeString(body.download_url)
    || normalizeString(data.url)
    || normalizeString(data.file_url)
    || normalizeString(data.fileUrl)
    || normalizeString(data.download_url);
}

function normalizeNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function itemCountFromOctoData(value: unknown): number | null {
  if (Array.isArray(value)) return value.length;
  const record = recordFrom(value);
  for (const key of ["data", "groups", "members", "messages", "threads", "items"]) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate.length;
  }
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(normalizeString).filter(Boolean))];
}

function normalizeOctoMentionEntities(value: unknown): ChannelConnectorOctoReplyPlan["mentionEntities"] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = recordFrom(item);
      const uid = normalizeString(record.uid);
      const offset = Number(record.offset);
      const length = Number(record.length);
      return uid && Number.isFinite(offset) && Number.isFinite(length) && offset >= 0 && length > 0
        ? { uid, offset: Math.floor(offset), length: Math.floor(length) }
        : null;
    })
    .filter((item): item is ChannelConnectorOctoReplyPlan["mentionEntities"][number] => item !== null);
}

function octoMentionToken(uid: string): string {
  return `@${uid}`;
}

function visibleMentionEntityForUid(content: string, uid: string): ChannelConnectorOctoReplyPlan["mentionEntities"][number] | null {
  const token = octoMentionToken(uid);
  const offset = content.indexOf(token);
  return offset >= 0 ? { uid, offset, length: token.length } : null;
}

function normalizeOctoVisibleMentionPayload(input: {
  content: string;
  mention?: ChannelConnectorOctoReplyPlan["payloads"][number]["payload"]["mention"] | null;
}): {
  content: string;
  mention?: ChannelConnectorOctoReplyPlan["payloads"][number]["payload"]["mention"];
} {
  const mention = input.mention || null;
  if (!mention) return { content: input.content };
  const uids = uniqueStrings(Array.isArray(mention.uids) ? mention.uids : []);
  const originalEntities = normalizeOctoMentionEntities(mention.entities);
  const covered = new Set(originalEntities.map((entity) => normalizeString(entity.uid)));
  let content = input.content;
  const generatedEntities: ChannelConnectorOctoReplyPlan["mentionEntities"] = [];
  const missingUids = uids.filter((uid) => !covered.has(uid));
  const prefixUids: string[] = [];

  for (const uid of missingUids) {
    const visible = visibleMentionEntityForUid(content, uid);
    if (visible) {
      generatedEntities.push(visible);
      covered.add(uid);
    } else {
      prefixUids.push(uid);
    }
  }

  if (prefixUids.length) {
    const tokens = prefixUids.map(octoMentionToken);
    const prefix = tokens.join(" ");
    const shift = prefix.length + (content ? 1 : 0);
    let offset = 0;
    for (let index = 0; index < prefixUids.length; index += 1) {
      const token = tokens[index];
      generatedEntities.push({
        uid: prefixUids[index],
        offset,
        length: token.length,
      });
      offset += token.length + 1;
    }
    content = `${prefix}${content ? ` ${content}` : ""}`;
    for (const entity of originalEntities) {
      entity.offset += shift;
    }
  }

  const entities = [...generatedEntities, ...originalEntities].sort((a, b) => a.offset - b.offset);
  return {
    content,
    mention: {
      ...(uids.length ? { uids } : {}),
      ...(entities.length ? { entities } : {}),
      ...(mention.all ? { all: mention.all } : {}),
    },
  };
}

function octoTransportData(
  config: ChannelConnectorOctoTransportConfig,
  action: ChannelConnectorOctoTransportResult["action"],
  response: { statusCode: number; body: unknown },
  data: unknown = response.body,
): ChannelConnectorOctoTransportResult {
  return transportResult({
    attempted: true,
    ok: true,
    action,
    apiUrl: config.apiUrl,
    statusCode: response.statusCode,
    requestCount: 1,
    data,
    itemCount: itemCountFromOctoData(data),
  });
}

function octoTransportError(
  config: ChannelConnectorOctoTransportConfig,
  action: ChannelConnectorOctoTransportResult["action"],
  error: unknown,
): ChannelConnectorOctoTransportResult {
  return transportResult({
    attempted: true,
    ok: false,
    action,
    apiUrl: config.apiUrl,
    statusCode: errorStatusCode(error),
    error: errorMessage(error),
    requestCount: 1,
  });
}

function octoPathSegment(value: string): string {
  return encodeURIComponent(value);
}

function octoQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const raw = query.toString();
  return raw ? `?${raw}` : "";
}

function normalizeOctoMessagePayload(value: unknown): unknown {
  if (typeof value !== "string" || !value) return value;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf8");
    return parseOctoJson(decoded);
  } catch {
    return value;
  }
}

function normalizeOctoMessagesSyncData(body: unknown): unknown {
  const record = recordFrom(body);
  const messages = Array.isArray(record.messages) ? record.messages : [];
  return {
    ...record,
    messages: messages.map((entry) => {
      const message = recordFrom(entry);
      return {
        ...message,
        payload: normalizeOctoMessagePayload(message.payload),
      };
    }),
  };
}

function normalizeUploadCredentialString(source: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = normalizeString(source[key]);
    if (value) return value;
  }
  return "";
}

function cosUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function cosObjectPath(key: string): string {
  return `/${key.split("/").filter(Boolean).map(cosUrlEncode).join("/")}`;
}

function cosEndpoint(config: ChannelConnectorOctoTransportConfig, credentials: OctoUploadCredentials): string {
  const baseUrl = normalizeString(config.cosUploadBaseUrl)
    || `https://${credentials.bucket}.cos.${credentials.region}.myqcloud.com`;
  return baseUrl.replace(/\/+$/, "");
}

function cosObjectUrl(config: ChannelConnectorOctoTransportConfig, credentials: OctoUploadCredentials): string {
  const baseUrl = credentials.cdnBaseUrl || cosEndpoint(config, credentials);
  return `${baseUrl.replace(/\/+$/, "")}${cosObjectPath(credentials.key)}`;
}

function sha1Hex(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function hmacSha1Hex(key: string, value: string): string {
  return createHmac("sha1", key).update(value).digest("hex");
}

export function shouldDirectUploadOctoMedia(config: ChannelConnectorOctoTransportConfig, size: number): boolean {
  if (config.uploadStrategy === "direct") return true;
  if (config.uploadStrategy === "multipart") return false;
  const minBytes = typeof config.directUploadMinBytes === "number" && Number.isFinite(config.directUploadMinBytes)
    ? config.directUploadMinBytes
    : DEFAULT_OCTO_DIRECT_UPLOAD_MIN_BYTES;
  return size >= minBytes;
}

function shouldFallbackToOctoDirectUpload(
  config: ChannelConnectorOctoTransportConfig,
  result: ChannelConnectorOctoTransportResult,
): boolean {
  return (config.uploadStrategy || "auto") === "auto"
    && result.action === "upload-file"
    && result.ok === false
    && typeof result.statusCode === "number"
    && OCTO_LEGACY_MULTIPART_GONE_STATUS_CODES.has(result.statusCode);
}

function canonicalCosValues(values: Record<string, string>): { list: string; text: string } {
  const entries = Object.entries(values)
    .map(([key, value]) => [cosUrlEncode(key.toLowerCase()), cosUrlEncode(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    list: entries.map(([key]) => key).join(";"),
    text: entries.map(([key, value]) => `${key}=${value}`).join("&"),
  };
}

function cosAuthorizationHeader(input: {
  method: string;
  path: string;
  headers: Record<string, string>;
  credentials: OctoUploadCredentials;
}): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const startTime = input.credentials.startTime !== null
    ? Math.max(input.credentials.startTime, Math.min(nowSeconds, input.credentials.expiredTime - 1))
    : Math.min(nowSeconds, input.credentials.expiredTime - 1);
  const keyTime = `${startTime};${input.credentials.expiredTime}`;
  const headerValues = canonicalCosValues(input.headers);
  const urlValues = canonicalCosValues({});
  const signKey = hmacSha1Hex(input.credentials.tmpSecretKey, keyTime);
  const httpString = `${input.method.toLowerCase()}\n${input.path}\n${urlValues.text}\n${headerValues.text}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    "q-sign-algorithm=sha1",
    `q-ak=${input.credentials.tmpSecretId}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerValues.list}`,
    `q-url-param-list=${urlValues.list}`,
    `q-signature=${signature}`,
  ].join("&");
}

async function fetchOctoUploadCredentials(
  config: ChannelConnectorOctoTransportConfig,
  fileName: string,
): Promise<{ statusCode: number; credentials: OctoUploadCredentials; credentialKeys: string[] }> {
  const response = await getOctoJson(
    config,
    `/v1/bot/upload/credentials?filename=${encodeURIComponent(fileName)}`,
  );
  const credentialBody = recordFrom(response.body.credentials);
  const credentials: OctoUploadCredentials = {
    bucket: normalizeString(response.body.bucket),
    region: normalizeString(response.body.region),
    key: normalizeString(response.body.key),
    tmpSecretId: normalizeUploadCredentialString(credentialBody, "tmpSecretId", "tmp_secret_id", "TmpSecretId"),
    tmpSecretKey: normalizeUploadCredentialString(credentialBody, "tmpSecretKey", "tmp_secret_key", "TmpSecretKey"),
    sessionToken: normalizeUploadCredentialString(credentialBody, "sessionToken", "session_token", "Token"),
    startTime: normalizeNumber(response.body.startTime),
    expiredTime: normalizeNumber(response.body.expiredTime) || 0,
    cdnBaseUrl: normalizeString(response.body.cdnBaseUrl || response.body.cdn_base_url) || null,
  };
  const credentialKeys = [
    credentials.tmpSecretId ? "tmpSecretId" : "",
    credentials.tmpSecretKey ? "tmpSecretKey" : "",
    credentials.sessionToken ? "sessionToken" : "",
  ].filter(Boolean);
  if (!credentials.bucket || !credentials.region || !credentials.key) {
    throw Object.assign(new Error("Octo upload credentials response did not include bucket, region, or key."), {
      statusCode: response.statusCode,
      body: response.body,
    });
  }
  if (credentialKeys.length !== 3 || !credentials.expiredTime) {
    throw Object.assign(new Error("Octo upload credentials response did not include complete temporary credentials."), {
      statusCode: response.statusCode,
      body: response.body,
    });
  }
  return {
    statusCode: response.statusCode,
    credentials,
    credentialKeys,
  };
}

async function putOctoCosObject(
  config: ChannelConnectorOctoTransportConfig,
  credentials: OctoUploadCredentials,
  input: {
    data: Uint8Array;
    mimeType: string;
  },
): Promise<{ statusCode: number; mediaUrl: string }> {
  const endpoint = cosEndpoint(config, credentials);
  const path = cosObjectPath(credentials.key);
  const url = new URL(`${endpoint}${path}`);
  const headersForSigning = {
    host: url.host,
    "content-type": input.mimeType,
    "x-cos-security-token": credentials.sessionToken,
  };
  const authorization = cosAuthorizationHeader({
    method: "PUT",
    path,
    headers: headersForSigning,
    credentials,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const arrayBuffer = new ArrayBuffer(input.data.byteLength);
    new Uint8Array(arrayBuffer).set(input.data);
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        authorization,
        ...headersForSigning,
      },
      body: new Blob([arrayBuffer], { type: input.mimeType }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw Object.assign(new Error(`Octo COS upload failed with HTTP ${response.status}${raw ? `: ${raw}` : ""}`), {
        statusCode: response.status,
      });
    }
    return {
      statusCode: response.status,
      mediaUrl: cosObjectUrl(config, credentials),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function postOctoMultipart(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
  input: {
    fieldName: string;
    fileName: string;
    data: Uint8Array;
    mimeType: string;
  },
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const form = new FormData();
    const arrayBuffer = new ArrayBuffer(input.data.byteLength);
    new Uint8Array(arrayBuffer).set(input.data);
    form.append(input.fieldName, new Blob([arrayBuffer], { type: input.mimeType }), input.fileName);
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.botToken}`,
      },
      body: form,
      signal: controller.signal,
    });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        body = parseOctoJson(raw) as Record<string, unknown>;
      } catch {
        body = { raw };
      }
    }
    if (!response.ok) {
      throw Object.assign(new Error(`Octo API ${path} failed with HTTP ${response.status}`), {
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

export async function registerOctoBot(
  config: ChannelConnectorOctoTransportConfig,
  forceRefresh = false,
): Promise<ChannelConnectorOctoTransportResult> {
  const path = forceRefresh ? "/v1/bot/register?force_refresh=true" : "/v1/bot/register";
  try {
    const response = await postOctoJson(config, path, {});
    return transportResult({
      attempted: true,
      ok: true,
      action: "register",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      robotId: normalizeString(response.body.robot_id),
      imToken: normalizeString(response.body.im_token),
      wsUrl: normalizeString(response.body.ws_url) || config.wsUrl || null,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "register",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
    });
  }
}

export async function sendOctoTyping(
  config: ChannelConnectorOctoTransportConfig,
  channelId: string,
  channelType: number,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, "/v1/bot/typing", {
      channel_id: channelId,
      channel_type: channelType,
    });
    return transportResult({
      attempted: true,
      ok: true,
      action: "typing",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "typing",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
    });
  }
}

export async function sendOctoHeartbeat(
  config: ChannelConnectorOctoTransportConfig,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, "/v1/bot/heartbeat", {});
    return transportResult({
      attempted: true,
      ok: true,
      action: "heartbeat",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "heartbeat",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
    });
  }
}

export async function sendOctoReadReceipt(
  config: ChannelConnectorOctoTransportConfig,
  input: { channelId: string; channelType: number; messageIds?: Array<string | number> | null },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const messageIds = Array.isArray(input.messageIds)
      ? input.messageIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const response = await postOctoJson(config, "/v1/bot/readReceipt", {
      channel_id: input.channelId,
      channel_type: input.channelType,
      ...(messageIds.length > 0 ? { message_ids: messageIds } : {}),
    });
    return octoTransportData(config, "read-receipt", response);
  } catch (error) {
    return octoTransportError(config, "read-receipt", error);
  }
}

export async function ackOctoEvent(
  config: ChannelConnectorOctoTransportConfig,
  eventId: string | number,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/events/${octoPathSegment(String(eventId))}/ack`, {});
    return octoTransportData(config, "event-ack", response);
  } catch (error) {
    return octoTransportError(config, "event-ack", error);
  }
}

export async function listOctoGroups(config: ChannelConnectorOctoTransportConfig): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, "/v1/bot/groups");
    return octoTransportData(config, "list-groups", response);
  } catch (error) {
    return octoTransportError(config, "list-groups", error);
  }
}

export async function getOctoGroupInfo(
  config: ChannelConnectorOctoTransportConfig,
  groupNo: string,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(groupNo)}`);
    return octoTransportData(config, "group-info", response);
  } catch (error) {
    return octoTransportError(config, "group-info", error);
  }
}

export async function readOctoGroupMd(
  config: ChannelConnectorOctoTransportConfig,
  groupNo: string,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(groupNo)}/md`);
    return octoTransportData(config, "group-md-read", response);
  } catch (error) {
    return octoTransportError(config, "group-md-read", error);
  }
}

export async function updateOctoGroupMd(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; content: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await putOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/md`, {
      content: input.content,
    });
    return octoTransportData(config, "group-md-update", response);
  } catch (error) {
    return octoTransportError(config, "group-md-update", error);
  }
}

export async function readOctoVoiceContext(
  config: ChannelConnectorOctoTransportConfig,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, "/v1/bot/voice/context");
    return octoTransportData(config, "voice-context-read", response);
  } catch (error) {
    return octoTransportError(config, "voice-context-read", error);
  }
}

export async function updateOctoVoiceContext(
  config: ChannelConnectorOctoTransportConfig,
  input: { content: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await putOctoJson(config, "/v1/bot/voice/context", {
      context: input.content,
    });
    return octoTransportData(config, "voice-context-update", response);
  } catch (error) {
    return octoTransportError(config, "voice-context-update", error);
  }
}

export async function deleteOctoVoiceContext(
  config: ChannelConnectorOctoTransportConfig,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await deleteOctoJson(config, "/v1/bot/voice/context");
    return octoTransportData(config, "voice-context-delete", response);
  } catch (error) {
    return octoTransportError(config, "voice-context-delete", error);
  }
}

export async function listOctoGroupMembers(
  config: ChannelConnectorOctoTransportConfig,
  groupNo: string,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(groupNo)}/members`);
    const data = Array.isArray(response.body)
      ? response.body
      : Array.isArray(response.body.members)
        ? response.body.members
        : response.body;
    return octoTransportData(config, "group-members", response, data);
  } catch (error) {
    return octoTransportError(config, "group-members", error);
  }
}

export async function searchOctoSpaceMembers(
  config: ChannelConnectorOctoTransportConfig,
  input: { keyword?: string | null; limit?: number | null; spaceId?: string | null },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/space/members${octoQuery({
      keyword: input.keyword || null,
      limit: input.limit || null,
      space_id: input.spaceId || null,
    })}`);
    return octoTransportData(config, "space-members", response);
  } catch (error) {
    return octoTransportError(config, "space-members", error);
  }
}

export async function createOctoGroup(
  config: ChannelConnectorOctoTransportConfig,
  input: { name?: string | null; members: string[]; creator: string; spaceId?: string | null },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, "/v1/bot/createGroup", {
      ...(input.name ? { name: input.name } : {}),
      members: input.members,
      creator: input.creator,
      ...(input.spaceId ? { space_id: input.spaceId } : {}),
    });
    return octoTransportData(config, "create-group", response);
  } catch (error) {
    return octoTransportError(config, "create-group", error);
  }
}

export async function updateOctoGroupInfo(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; name?: string | null; notice?: string | null },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await putOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/info`, {
      ...(input.name ? { name: input.name } : {}),
      ...(input.notice ? { notice: input.notice } : {}),
    });
    return octoTransportData(config, "update-group", response);
  } catch (error) {
    return octoTransportError(config, "update-group", error);
  }
}

export async function addOctoGroupMembers(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; members: string[] },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/members/add`, {
      members: input.members,
    });
    return octoTransportData(config, "add-group-members", response);
  } catch (error) {
    return octoTransportError(config, "add-group-members", error);
  }
}

export async function removeOctoGroupMembers(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; members: string[] },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/members/remove`, {
      members: input.members,
    });
    return octoTransportData(config, "remove-group-members", response);
  } catch (error) {
    return octoTransportError(config, "remove-group-members", error);
  }
}

export async function listOctoThreads(
  config: ChannelConnectorOctoTransportConfig,
  groupNo: string,
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(groupNo)}/threads`);
    return octoTransportData(config, "list-threads", response);
  } catch (error) {
    return octoTransportError(config, "list-threads", error);
  }
}

export async function getOctoThreadInfo(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}`);
    return octoTransportData(config, "thread-info", response);
  } catch (error) {
    return octoTransportError(config, "thread-info", error);
  }
}

export async function listOctoThreadMembers(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}/members`);
    return octoTransportData(config, "thread-members", response);
  } catch (error) {
    return octoTransportError(config, "thread-members", error);
  }
}

export async function createOctoThread(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; name: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads`, {
      name: input.name,
    });
    return octoTransportData(config, "create-thread", response);
  } catch (error) {
    return octoTransportError(config, "create-thread", error);
  }
}

export async function deleteOctoThread(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await deleteOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}`);
    return octoTransportData(config, "delete-thread", response);
  } catch (error) {
    return octoTransportError(config, "delete-thread", error);
  }
}

export async function joinOctoThread(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}/join`, {});
    return octoTransportData(config, "join-thread", response);
  } catch (error) {
    return octoTransportError(config, "join-thread", error);
  }
}

export async function leaveOctoThread(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}/leave`, {});
    return octoTransportData(config, "leave-thread", response);
  } catch (error) {
    return octoTransportError(config, "leave-thread", error);
  }
}

export async function readOctoThreadMd(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await getOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}/md`);
    return octoTransportData(config, "thread-md-read", response);
  } catch (error) {
    return octoTransportError(config, "thread-md-read", error);
  }
}

export async function updateOctoThreadMd(
  config: ChannelConnectorOctoTransportConfig,
  input: { groupNo: string; shortId: string; content: string },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await putOctoJson(config, `/v1/bot/groups/${octoPathSegment(input.groupNo)}/threads/${octoPathSegment(input.shortId)}/md`, {
      content: input.content,
    });
    return octoTransportData(config, "thread-md-update", response);
  } catch (error) {
    return octoTransportError(config, "thread-md-update", error);
  }
}

export async function syncOctoMessages(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    channelId: string;
    channelType: number;
    limit?: number | null;
    startMessageSeq?: number | null;
    endMessageSeq?: number | null;
    pullMode?: 0 | 1 | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  try {
    const response = await postOctoJson(config, "/v1/bot/messages/sync", {
      channel_id: input.channelId,
      channel_type: input.channelType,
      limit: input.limit || 50,
      start_message_seq: input.startMessageSeq || 0,
      end_message_seq: input.endMessageSeq || 0,
      pull_mode: input.pullMode ?? 1,
    });
    return octoTransportData(config, "sync-messages", response, normalizeOctoMessagesSyncData(response.body));
  } catch (error) {
    return octoTransportError(config, "sync-messages", error);
  }
}

export async function getOctoFileDownloadUrl(
  config: ChannelConnectorOctoTransportConfig,
  input: { filePath: string; fileName?: string | null },
): Promise<ChannelConnectorOctoTransportResult> {
  const cleanPath = input.filePath.split("/").filter(Boolean).map(octoPathSegment).join("/");
  try {
    const response = await getOctoRedirect(config, `/v1/bot/file/download/${cleanPath}${octoQuery({
      filename: input.fileName || null,
    })}`);
    return transportResult({
      attempted: true,
      ok: true,
      action: "file-download-url",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      mediaUrl: response.location,
      data: {
        location: response.location,
        body: response.body,
      },
    });
  } catch (error) {
    return octoTransportError(config, "file-download-url", error);
  }
}

export async function getOctoUploadCredentials(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    fileName: string;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-upload.bin");
  try {
    const response = await fetchOctoUploadCredentials(config, fileName);
    return transportResult({
      attempted: true,
      ok: true,
      action: "upload-credentials",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      fileName,
      uploadBucket: response.credentials.bucket,
      uploadRegion: response.credentials.region,
      uploadKey: response.credentials.key,
      uploadCdnBaseUrl: response.credentials.cdnBaseUrl,
      uploadExpiredTime: response.credentials.expiredTime,
      uploadCredentialKeys: response.credentialKeys,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "upload-credentials",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
      fileName,
    });
  }
}

export async function sendOctoTextReply(
  config: ChannelConnectorOctoTransportConfig,
  replyPlan: ChannelConnectorOctoReplyPlan,
  options: { timeoutMs?: number | null } = {},
): Promise<ChannelConnectorOctoTransportResult> {
  let requestCount = 0;
  try {
    let lastStatusCode: number | null = null;
    for (const payload of replyPlan.payloads) {
      requestCount += 1;
      const textPayload = normalizeOctoVisibleMentionPayload({
        content: payload.payload.content,
        mention: payload.payload.mention,
      });
      const response = await postOctoJson(config, "/v1/bot/sendMessage", {
        channel_id: payload.channel_id,
        channel_type: payload.channel_type,
        payload: {
          type: OCTO_TEXT_MESSAGE_TYPE,
          content: textPayload.content,
          ...(textPayload.mention ? { mention: textPayload.mention } : {}),
        },
        client_msg_no: randomUUID(),
        ...(replyPlan.onBehalfOf ? { on_behalf_of: replyPlan.onBehalfOf } : {}),
      }, options);
      lastStatusCode = response.statusCode;
    }
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode: lastStatusCode,
      requestCount,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-message",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount,
    });
  }
}

export async function uploadOctoFile(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-upload.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  try {
    const response = await postOctoMultipart(config, "/v1/bot/file/upload", {
      fieldName: "file",
      fileName,
      data: input.data,
      mimeType,
    });
    const mediaUrl = mediaUrlFromResponse(response.body);
    if (!mediaUrl) {
      throw Object.assign(new Error("Octo upload response did not include a file URL."), {
        statusCode: response.statusCode,
        body: response.body,
      });
    }
    return transportResult({
      attempted: true,
      ok: true,
      action: "upload-file",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      mediaUrl,
      fileName,
      mimeType,
      size: input.data.length,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "upload-file",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
      fileName,
      mimeType,
      size: input.data.length,
    });
  }
}

export async function directUploadOctoFile(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-upload.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  let requestCount = 1;
  try {
    const upload = await fetchOctoUploadCredentials(config, fileName);
    requestCount = 2;
    const response = await putOctoCosObject(config, upload.credentials, {
      data: input.data,
      mimeType,
    });
    return transportResult({
      attempted: true,
      ok: true,
      action: "direct-upload-file",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount,
      mediaUrl: response.mediaUrl,
      fileName,
      mimeType,
      size: input.data.length,
      uploadBucket: upload.credentials.bucket,
      uploadRegion: upload.credentials.region,
      uploadKey: upload.credentials.key,
      uploadCdnBaseUrl: upload.credentials.cdnBaseUrl,
      uploadExpiredTime: upload.credentials.expiredTime,
      uploadCredentialKeys: upload.credentialKeys,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "direct-upload-file",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount,
      fileName,
      mimeType,
      size: input.data.length,
    });
  }
}

export async function sendOctoMediaMessage(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    channelId: string;
    channelType: number;
    mediaUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    size?: number | null;
    width?: number | null;
    height?: number | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  const fileName = safeChannelConnectorFileName(input.fileName, "studio-upload.bin");
  const mimeType = inferChannelConnectorMimeType(fileName, input.mimeType);
  const mediaType = mimeType.startsWith("image/") ? OCTO_IMAGE_MESSAGE_TYPE : OCTO_FILE_MESSAGE_TYPE;
  const payload: Record<string, unknown> = {
    type: mediaType,
    url: input.mediaUrl,
    name: fileName,
  };
  if (typeof input.size === "number" && Number.isFinite(input.size) && input.size > 0) payload.size = input.size;
  if (mediaType === OCTO_IMAGE_MESSAGE_TYPE) {
    if (typeof input.width === "number" && Number.isFinite(input.width) && input.width > 0) payload.width = input.width;
    if (typeof input.height === "number" && Number.isFinite(input.height) && input.height > 0) payload.height = input.height;
  }
  try {
    const response = await postOctoJson(config, "/v1/bot/sendMessage", {
      channel_id: input.channelId,
      channel_type: input.channelType,
      payload,
    });
    return transportResult({
      attempted: true,
      ok: true,
      action: "send-media",
      apiUrl: config.apiUrl,
      statusCode: response.statusCode,
      requestCount: 1,
      mediaUrl: input.mediaUrl,
      fileName,
      mimeType,
      size: typeof input.size === "number" && Number.isFinite(input.size) ? input.size : null,
    });
  } catch (error) {
    return transportResult({
      attempted: true,
      ok: false,
      action: "send-media",
      apiUrl: config.apiUrl,
      statusCode: errorStatusCode(error),
      error: errorMessage(error),
      requestCount: 1,
      mediaUrl: input.mediaUrl,
      fileName,
      mimeType,
      size: typeof input.size === "number" && Number.isFinite(input.size) ? input.size : null,
    });
  }
}

export async function directUploadAndSendOctoMedia(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    channelId: string;
    channelType: number;
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  const upload = await directUploadOctoFile(config, input);
  if (upload.ok !== true || !upload.mediaUrl) return upload;
  const sent = await sendOctoMediaMessage(config, {
    channelId: input.channelId,
    channelType: input.channelType,
    mediaUrl: upload.mediaUrl,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.size,
  });
  return transportResult({
    attempted: true,
    ok: sent.ok,
    action: "direct-upload-and-send-media",
    apiUrl: config.apiUrl,
    statusCode: sent.statusCode,
    error: sent.error,
    requestCount: upload.requestCount + sent.requestCount,
    mediaUrl: upload.mediaUrl,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.size,
    uploadBucket: upload.uploadBucket,
    uploadRegion: upload.uploadRegion,
    uploadKey: upload.uploadKey,
    uploadCdnBaseUrl: upload.uploadCdnBaseUrl,
    uploadExpiredTime: upload.uploadExpiredTime,
    uploadCredentialKeys: upload.uploadCredentialKeys,
  });
}

export async function uploadAndSendOctoMedia(
  config: ChannelConnectorOctoTransportConfig,
  input: {
    channelId: string;
    channelType: number;
    data: Uint8Array;
    fileName: string;
    mimeType?: string | null;
  },
): Promise<ChannelConnectorOctoTransportResult> {
  if (shouldDirectUploadOctoMedia(config, input.data.length)) {
    return directUploadAndSendOctoMedia(config, input);
  }
  const upload = await uploadOctoFile(config, input);
  if (upload.ok !== true || !upload.mediaUrl) {
    if (shouldFallbackToOctoDirectUpload(config, upload)) {
      const fallback = await directUploadAndSendOctoMedia(config, input);
      return transportResult({
        ...fallback,
        requestCount: upload.requestCount + fallback.requestCount,
      });
    }
    return upload;
  }
  const sent = await sendOctoMediaMessage(config, {
    channelId: input.channelId,
    channelType: input.channelType,
    mediaUrl: upload.mediaUrl,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.size,
  });
  return transportResult({
    attempted: true,
    ok: sent.ok,
    action: "upload-and-send-media",
    apiUrl: config.apiUrl,
    statusCode: sent.statusCode,
    error: sent.error,
    requestCount: upload.requestCount + sent.requestCount,
    mediaUrl: upload.mediaUrl,
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    size: upload.size,
  });
}
