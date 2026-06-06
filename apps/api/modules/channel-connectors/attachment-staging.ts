import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorInboundAttachment,
} from "../../../../types/channel-connectors.js";

export const DEFAULT_CHANNEL_CONNECTOR_ATTACHMENT_MAX_BYTES = 128 * 1024 * 1024;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function defaultAttachmentFileName(attachment: ChannelConnectorInboundAttachment, index: number): string {
  const explicit = normalizeString(attachment.fileName);
  if (explicit) return explicit;
  const suffix = normalizeString(attachment.key || attachment.imageKey || attachment.fileKey);
  return suffix ? `${attachment.kind}-${suffix}` : `${attachment.kind}-${index + 1}`;
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
  const mimeType = normalizeString(input.mimeType) || normalizeString(input.attachment.mimeType) || null;
  const safeMessageId = safeSegment(input.messageId, "message");
  const baseName = safeSegment(defaultAttachmentFileName(input.attachment, input.index), `${input.attachment.kind}-${input.index + 1}`);
  const fileName = `${input.index + 1}-${baseName}${extensionFor({
    fileName: baseName,
    mimeType,
    kind: input.attachment.kind,
  })}`;
  const directory = path.join(input.rootDir, "attachments", safeMessageId);
  fs.mkdirSync(directory, { recursive: true });
  const localPath = path.join(directory, fileName);
  const tempPath = `${localPath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, input.data, { mode: 0o600 });
  fs.renameSync(tempPath, localPath);
  return {
    ...input.attachment,
    mimeType,
    size: input.data.length,
    localPath,
    stagedAt: (input.now || new Date()).toISOString(),
    stagingError: null,
  };
}
