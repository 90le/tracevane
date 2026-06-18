import fs from "node:fs";
import path from "node:path";

export const STUDIO_CHANNEL_FILES_BLOCK = "tracevane-channel-files";
export const DEFAULT_CHANNEL_CONNECTOR_OUTBOUND_FILE_MAX_BYTES = 128 * 1024 * 1024;

export interface ChannelConnectorOutboundFileRequest {
  path: string;
  name?: string | null;
  fileName?: string | null;
  caption?: string | null;
  mimeType?: string | null;
}

export interface ChannelConnectorExtractedOutboundFiles {
  replyText: string;
  files: ChannelConnectorOutboundFileRequest[];
  errors: string[];
}

export interface ChannelConnectorResolvedOutboundFile {
  localPath: string;
  fileName: string;
  mimeType: string;
  size: number;
  caption: string | null;
}

export interface ChannelConnectorResolvedOutboundFiles {
  files: ChannelConnectorResolvedOutboundFile[];
  errors: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function recordFrom(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayFromManifest(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = recordFrom(value);
  return Array.isArray(record.files) ? record.files : [];
}

function outboundFileFromValue(value: unknown): ChannelConnectorOutboundFileRequest | null {
  const record = recordFrom(value);
  const filePath = normalizeString(record.path || record.localPath || record.local_path);
  if (!filePath) return null;
  return {
    path: filePath,
    name: normalizeString(record.name) || null,
    fileName: normalizeString(record.fileName || record.file_name) || null,
    caption: normalizeString(record.caption) || null,
    mimeType: normalizeString(record.mimeType || record.mime_type) || null,
  };
}

export function extractChannelConnectorOutboundFiles(replyText: string | null | undefined): ChannelConnectorExtractedOutboundFiles {
  const source = normalizeString(replyText);
  if (!source) return { replyText: "", files: [], errors: [] };
  const files: ChannelConnectorOutboundFileRequest[] = [];
  const errors: string[] = [];
  const pattern = new RegExp(
    "```[ \\t]*" + STUDIO_CHANNEL_FILES_BLOCK + "[^\\r\\n]*\\r?\\n([\\s\\S]*?)```",
    "gi",
  );
  const stripped = source.replace(pattern, (_match, rawJson: string) => {
    try {
      const parsed = JSON.parse(rawJson.trim()) as unknown;
      const parsedFiles = arrayFromManifest(parsed)
        .map(outboundFileFromValue)
        .filter((item): item is ChannelConnectorOutboundFileRequest => item !== null);
      if (!parsedFiles.length) {
        errors.push("tracevane-channel-files block did not include any valid file entries.");
      } else {
        files.push(...parsedFiles);
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "tracevane-channel-files block is not valid JSON.");
    }
    return "";
  }).trim();
  return {
    replyText: stripped,
    files,
    errors,
  };
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

export function safeChannelConnectorFileName(value: unknown, fallback = "studio-file.bin"): string {
  const normalized = normalizeString(value)
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop()
    || fallback;
  const safe = normalized
    .replace(/^\.+/, "")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/[\\/]+/g, "_")
    .slice(0, 180)
    .trim();
  return safe || fallback;
}

export function inferChannelConnectorMimeType(fileName: string, fallback?: string | null): string {
  const explicit = normalizeString(fallback);
  if (explicit) return explicit;
  const lower = normalizeString(fileName).toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".bmp")) return "image/bmp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".log")) return "text/plain";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".tar")) return "application/x-tar";
  if (lower.endsWith(".gz") || lower.endsWith(".tgz")) return "application/gzip";
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".mp4")) return "video/mp4";
  return "application/octet-stream";
}

export function resolveChannelConnectorOutboundFiles(input: {
  files: ChannelConnectorOutboundFileRequest[];
  workDir: string;
  allowedRootDirs?: string[];
  allowAnyPath?: boolean;
  maxBytes?: number | null;
}): ChannelConnectorResolvedOutboundFiles {
  const files: ChannelConnectorResolvedOutboundFile[] = [];
  const errors: string[] = [];
  const root = path.resolve(input.workDir || process.cwd());
  const allowedRootPaths = [root, ...(input.allowedRootDirs || []).map((item) => normalizeString(item)).filter(Boolean)]
    .map((item) => path.resolve(item));
  const allowedRootRealPaths = allowedRootPaths.map((item) => {
    try {
      return fs.realpathSync(item);
    } catch {
      // The workDir is created elsewhere in the runner path; keep the resolved path for diagnostics here.
      return item;
    }
  });
  const maxBytes = typeof input.maxBytes === "number" && Number.isFinite(input.maxBytes) && input.maxBytes >= 0
    ? input.maxBytes
    : null;

  for (const item of input.files) {
    const requestedPath = normalizeString(item.path);
    if (!requestedPath) {
      errors.push("Outbound file entry is missing path.");
      continue;
    }
    const absolutePath = path.isAbsolute(requestedPath)
      ? path.resolve(requestedPath)
      : path.resolve(root, requestedPath);
    let realPath = "";
    try {
      realPath = fs.realpathSync(absolutePath);
    } catch {
      errors.push(`Outbound file does not exist: ${requestedPath}`);
      continue;
    }
    if (!input.allowAnyPath && !allowedRootRealPaths.some((allowedRoot) => isPathInside(allowedRoot, realPath))) {
      errors.push(`Outbound file is outside the allowed Agent file roots: ${requestedPath}`);
      continue;
    }
    let stat: fs.Stats;
    try {
      stat = fs.statSync(realPath);
    } catch {
      errors.push(`Outbound file is not readable: ${requestedPath}`);
      continue;
    }
    if (!stat.isFile()) {
      errors.push(`Outbound path is not a regular file: ${requestedPath}`);
      continue;
    }
    if (maxBytes !== null && stat.size > maxBytes) {
      errors.push(`Outbound file exceeds size limit: ${safeChannelConnectorFileName(item.fileName || item.name || realPath)} (${stat.size} > ${maxBytes})`);
      continue;
    }
    const fileName = safeChannelConnectorFileName(item.fileName || item.name || path.basename(realPath));
    files.push({
      localPath: realPath,
      fileName,
      mimeType: inferChannelConnectorMimeType(fileName, item.mimeType),
      size: stat.size,
      caption: normalizeString(item.caption) || null,
    });
  }
  return { files, errors };
}
