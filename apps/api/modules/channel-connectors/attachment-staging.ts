import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  ChannelConnectorInboundAttachment,
} from "../../../../types/channel-connectors.js";

export const DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_URL_TIMEOUT_MS = 30_000;

export interface ChannelConnectorAttachmentStagingTarget {
  localPath: string;
  tempPath: string;
  mimeType: string | null;
}

export interface ChannelConnectorAttachmentUrlStagingResult {
  attempted: boolean;
  ok: boolean;
  statusCode: number | null;
  attachment: ChannelConnectorInboundAttachment;
  localPath: string | null;
  size: number | null;
  mimeType: string | null;
  error: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Attachment URL staging failed.";
}

export function parseChannelConnectorByteSize(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value <= 0 ? Number.POSITIVE_INFINITY : value;
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return fallback;
  if (["0", "none", "unlimited", "off", "false"].includes(raw)) return Number.POSITIVE_INFINITY;
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/);
  if (!match) return fallback;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return fallback;
  const unit = match[2] || "b";
  const multiplier = unit === "gb" || unit === "gib"
    ? 1024 * 1024 * 1024
    : unit === "mb" || unit === "mib"
      ? 1024 * 1024
      : unit === "kb" || unit === "kib"
        ? 1024
        : 1;
  const bytes = Math.floor(amount * multiplier);
  return bytes <= 0 ? Number.POSITIVE_INFINITY : bytes;
}

function safeSegment(value: string, fallback: string): string {
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
    .slice(0, 120);
  return safe || fallback;
}

function safeAttachmentFileNameSegment(value: string, fallback: string): string {
  const normalized = normalizeString(value)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    || fallback;
  const safe = normalized
    .replace(/^\.+/, "")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/[<>:"|?*\\/]+/g, "_")
    .slice(0, 180)
    .trim();
  return safe || fallback;
}

function extensionFor(input: {
  fileName: string;
  mimeType: string | null;
  kind: ChannelConnectorInboundAttachment["kind"];
}): string {
  if (path.extname(input.fileName)) return "";
  const mime = normalizeString(input.mimeType).toLowerCase();
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "application/pdf") return ".pdf";
  if (mime === "text/plain") return ".txt";
  if (mime === "audio/opus" || mime === "audio/ogg") return ".opus";
  if (mime === "audio/mpeg") return ".mp3";
  if (mime === "video/mp4") return ".mp4";
  if (input.kind === "image") return ".bin";
  return "";
}

function isPrivateIpAddress(hostname: string): boolean {
  const version = net.isIP(hostname);
  if (version === 4) {
    const parts = hostname.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
    const [first, second] = parts;
    return first === 10
      || first === 127
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 168);
  }
  if (version === 6) {
    const lower = hostname.toLowerCase();
    return lower === "::1"
      || lower.startsWith("fc")
      || lower.startsWith("fd")
      || lower.startsWith("fe80:");
  }
  return false;
}

function validateAttachmentHttpUrl(inputUrl: string, allowPrivateNetwork = false): URL {
  const raw = normalizeString(inputUrl);
  if (!raw) throw new Error("Attachment URL is required.");
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Attachment URL is invalid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Attachment URL must use http or https.");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!allowPrivateNetwork && (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIpAddress(hostname))) {
    throw new Error("Attachment URL points to a private network host.");
  }
  return parsed;
}

function defaultAttachmentFileName(attachment: ChannelConnectorInboundAttachment, index: number): string {
  const explicit = normalizeString(attachment.fileName);
  if (explicit) return explicit;
  const suffix = normalizeString(attachment.key || attachment.imageKey || attachment.fileKey);
  return suffix ? `${attachment.kind}-${suffix}` : `${attachment.kind}-${index + 1}`;
}

export function prepareChannelConnectorAttachmentStagingTarget(input: {
  attachment: ChannelConnectorInboundAttachment;
  rootDir: string;
  messageId: string;
  index: number;
  mimeType?: string | null;
}): ChannelConnectorAttachmentStagingTarget {
  const mimeType = normalizeString(input.mimeType) || normalizeString(input.attachment.mimeType) || null;
  const safeMessageId = safeSegment(input.messageId, "message");
  const baseName = safeAttachmentFileNameSegment(
    defaultAttachmentFileName(input.attachment, input.index),
    `${input.attachment.kind}-${input.index + 1}`,
  );
  const fileName = `${input.index + 1}-${baseName}${extensionFor({
    fileName: baseName,
    mimeType,
    kind: input.attachment.kind,
  })}`;
  const directory = path.join(input.rootDir, "attachments", safeMessageId);
  fs.mkdirSync(directory, { recursive: true });
  const localPath = path.join(directory, fileName);
  const tempPath = `${localPath}.tmp-${process.pid}-${Date.now()}`;
  return {
    localPath,
    tempPath,
    mimeType,
  };
}

export function finalizeChannelConnectorAttachmentStaging(input: {
  attachment: ChannelConnectorInboundAttachment;
  localPath: string;
  size: number;
  mimeType?: string | null;
  now?: Date;
}): ChannelConnectorInboundAttachment {
  const mimeType = normalizeString(input.mimeType) || normalizeString(input.attachment.mimeType) || null;
  return {
    ...input.attachment,
    mimeType,
    size: input.size,
    localPath: input.localPath,
    stagedAt: (input.now || new Date()).toISOString(),
    stagingError: null,
  };
}

export function stageChannelConnectorAttachmentData(input: {
  attachment: ChannelConnectorInboundAttachment;
  data: Buffer;
  rootDir: string;
  messageId: string;
  index: number;
  mimeType?: string | null;
  maxBytes?: number;
  now?: Date;
}): ChannelConnectorInboundAttachment {
  const maxBytes = input.maxBytes ?? DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES;
  if (input.data.length > maxBytes) {
    throw new Error(`Attachment exceeds size limit: ${input.data.length} > ${maxBytes}`);
  }
  const target = prepareChannelConnectorAttachmentStagingTarget({
    attachment: input.attachment,
    rootDir: input.rootDir,
    messageId: input.messageId,
    index: input.index,
    mimeType: input.mimeType,
  });
  fs.writeFileSync(target.tempPath, input.data, { mode: 0o600 });
  fs.renameSync(target.tempPath, target.localPath);
  return finalizeChannelConnectorAttachmentStaging({
    attachment: input.attachment,
    localPath: target.localPath,
    size: input.data.length,
    mimeType: target.mimeType,
    now: input.now,
  });
}

export async function stageChannelConnectorAttachmentUrl(input: {
  attachment: ChannelConnectorInboundAttachment;
  url: string;
  rootDir: string;
  messageId: string;
  index: number;
  mimeType?: string | null;
  maxBytes?: number;
  timeoutMs?: number;
  allowPrivateNetwork?: boolean;
  now?: Date;
}): Promise<ChannelConnectorAttachmentUrlStagingResult> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_URL_TIMEOUT_MS,
  );
  let tempPath: string | null = null;
  try {
    const parsedUrl = validateAttachmentHttpUrl(input.url, input.allowPrivateNetwork === true);
    const response = await fetch(parsedUrl, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) {
      const raw = await response.text().catch(() => "");
      throw Object.assign(new Error(raw || `Attachment URL request failed with HTTP ${response.status}`), {
        statusCode: response.status,
      });
    }
    if (!response.body) {
      throw Object.assign(new Error("Attachment URL response did not include a body."), {
        statusCode: response.status,
      });
    }

    const maxBytes = input.maxBytes ?? DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES;
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(maxBytes) && Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw Object.assign(new Error(`Attachment exceeds size limit: ${contentLength} > ${maxBytes}`), {
        statusCode: response.status,
      });
    }
    const responseMimeType = normalizeString(response.headers.get("content-type")).split(";")[0].trim() || null;
    const target = prepareChannelConnectorAttachmentStagingTarget({
      attachment: input.attachment,
      rootDir: input.rootDir,
      messageId: input.messageId,
      index: input.index,
      mimeType: input.mimeType || responseMimeType,
    });
    tempPath = target.tempPath;
    let size = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (Number.isFinite(maxBytes) && size > maxBytes) {
          callback(Object.assign(new Error(`Attachment exceeds size limit: ${size} > ${maxBytes}`), {
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
    const staged = finalizeChannelConnectorAttachmentStaging({
      attachment: input.attachment,
      localPath: target.localPath,
      size,
      mimeType: target.mimeType,
      now: input.now,
    });
    return {
      attempted: true,
      ok: true,
      statusCode: response.status,
      attachment: staged,
      localPath: staged.localPath || null,
      size,
      mimeType: staged.mimeType || null,
      error: null,
    };
  } catch (error) {
    if (tempPath) fs.rmSync(tempPath, { force: true });
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : NaN;
    return {
      attempted: true,
      ok: false,
      statusCode: Number.isFinite(statusCode) ? statusCode : null,
      attachment: {
        ...input.attachment,
        stagingError: errorMessage(error),
      },
      localPath: null,
      size: null,
      mimeType: normalizeString(input.mimeType) || normalizeString(input.attachment.mimeType) || null,
      error: errorMessage(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}
