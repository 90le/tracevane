import { createHash, createHmac } from "node:crypto";
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
const DEFAULT_OCTO_DIRECT_UPLOAD_MIN_BYTES = 8 * 1024 * 1024;

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
  return {
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
}

export function emptyOctoTransportResult(action: ChannelConnectorOctoTransportResult["action"] = "none"): ChannelConnectorOctoTransportResult {
  return transportResult({ action });
}

async function postOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
  payload: unknown,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.botToken}`,
      },
      body: JSON.stringify(payload),
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

async function getOctoJson(
  config: ChannelConnectorOctoTransportConfig,
  path: string,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}${path}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${config.botToken}`,
      },
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
        body = JSON.parse(raw) as Record<string, unknown>;
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
): Promise<ChannelConnectorOctoTransportResult> {
  let requestCount = 0;
  try {
    let lastStatusCode: number | null = null;
    for (const payload of replyPlan.payloads) {
      requestCount += 1;
      const response = await postOctoJson(config, "/v1/bot/sendMessage", {
        channel_id: payload.channel_id,
        channel_type: payload.channel_type,
        payload: {
          type: OCTO_TEXT_MESSAGE_TYPE,
          content: payload.payload.content,
          ...(payload.payload.mention ? { mention: payload.payload.mention } : {}),
        },
      });
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
