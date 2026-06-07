import type {
  ChannelConnectorOctoReplyPlan,
  ChannelConnectorOctoTransportConfig,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorPlatformBinding,
} from "../../../../types/channel-connectors.js";

const OCTO_TEXT_MESSAGE_TYPE = 1;
const OCTO_IMAGE_MESSAGE_TYPE = 2;
const OCTO_FILE_MESSAGE_TYPE = 8;
const DEFAULT_TIMEOUT_MS = 30_000;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function octoTransportFromMetadata(metadataValue: unknown): ChannelConnectorOctoTransportConfig | null {
  const metadata = recordFrom(metadataValue);
  const apiUrl = normalizeString(metadata.apiUrl || metadata.api_url);
  const botToken = normalizeString(metadata.botToken || metadata.bot_token || metadata.token);
  if (!apiUrl || !botToken) return null;
  const wsUrl = normalizeString(metadata.wsUrl || metadata.ws_url);
  return {
    apiUrl,
    botToken,
    wsUrl: wsUrl || null,
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

function inferOctoMimeType(fileName: string, fallback?: string | null): string {
  const explicit = normalizeString(fallback);
  if (explicit) return explicit;
  const lower = normalizeString(fileName).toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".log")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
}

function safeOctoUploadFileName(value: unknown, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    || fallback;
  const safe = normalized
    .replace(/^\.+/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 160);
  return safe || fallback;
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
  const fileName = safeOctoUploadFileName(input.fileName, "studio-upload.bin");
  const mimeType = inferOctoMimeType(fileName, input.mimeType);
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
  const fileName = safeOctoUploadFileName(input.fileName, "studio-upload.bin");
  const mimeType = inferOctoMimeType(fileName, input.mimeType);
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
