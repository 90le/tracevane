import type { FileEntryKind } from "../../../../../types/files";

export const TERMINAL_RESOURCE_DRAG_MIME =
  "application/x-openclaw-terminal-resource";
export const TERMINAL_TAB_DRAG_MIME = "application/x-openclaw-terminal-tab";
export const TERMINAL_FILE_PREVIEW_DRAG_MIME =
  "application/x-openclaw-terminal-file-preview-tab";

export interface TerminalResourceTransferPayload {
  rootId: string;
  path: string;
  absolutePath: string;
  kind: FileEntryKind;
  name: string;
  items?: TerminalResourceTransferPayload[];
}

export function serializeTerminalResourceTransfer(
  payload: TerminalResourceTransferPayload,
): string {
  const items = Array.isArray(payload.items)
    ? payload.items.map(normalizeTerminalResourceTransferItem).filter(isTerminalResourceTransferPayload)
    : [];
  return JSON.stringify({
    rootId: String(payload.rootId || ""),
    path: String(payload.path || ""),
    absolutePath: String(payload.absolutePath || ""),
    kind: payload.kind,
    name: String(payload.name || ""),
    ...(items.length > 1 ? { items } : {}),
  });
}

export function parseTerminalResourceTransfer(
  raw: string | null | undefined,
): TerminalResourceTransferPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TerminalResourceTransferPayload>;
    const items = Array.isArray(parsed.items)
      ? parsed.items.map(normalizeTerminalResourceTransferItem).filter(isTerminalResourceTransferPayload)
      : [];
    const primary = normalizeTerminalResourceTransferItem(parsed) || items[0] || null;
    if (!primary) return null;
    return {
      ...primary,
      ...(items.length > 1 ? { items } : {}),
    };
  } catch {
    return null;
  }
}

export function collectTerminalResourceDropPaths(input: {
  payload?: TerminalResourceTransferPayload | null;
  text?: string | null;
  uriList?: string | null;
}): string[] {
  const payloadItems = input.payload?.items?.length
    ? input.payload.items
    : input.payload
      ? [input.payload]
      : [];
  const payloadPaths = payloadItems
    .map((item) => normalizeTerminalDropPath(item.absolutePath))
    .filter(Boolean);
  if (payloadPaths.length) return dedupeTerminalDropPaths(payloadPaths);

  const uriPaths = splitTerminalDropPathList(input.uriList);
  if (uriPaths.length) return dedupeTerminalDropPaths(uriPaths);

  return dedupeTerminalDropPaths(
    splitTerminalDropPathList(input.text).filter(isLikelyTerminalDropPath),
  );
}

export function splitTerminalDropPathList(raw: string | null | undefined): string[] {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map(normalizeTerminalDropPath)
    .filter(Boolean);
}

export function normalizeTerminalDropPath(value: string): string {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (!/^file:\/\//i.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "file:") return trimmed;
    const decodedPath = decodeURIComponent(url.pathname || "");
    return url.host ? `//${url.host}${decodedPath}` : decodedPath;
  } catch {
    return trimmed;
  }
}

export function canAcceptTerminalResourceDropTypes(
  rawTypes: Iterable<string> | null | undefined,
): boolean {
  const types = Array.from(rawTypes || []);
  if (types.includes(TERMINAL_RESOURCE_DRAG_MIME)) return true;
  if (types.includes("text/uri-list")) return true;
  if (
    types.includes(TERMINAL_TAB_DRAG_MIME) ||
    types.includes(TERMINAL_FILE_PREVIEW_DRAG_MIME)
  ) {
    return false;
  }
  return types.includes("text/plain");
}

export function isLikelyTerminalDropPath(value: string): boolean {
  const normalized = normalizeTerminalDropPath(value);
  if (!normalized) return false;
  if (/^~(?:\/|$)/.test(normalized)) return true;
  if (/^(?:\.{1,2}\/|\/|[A-Za-z]:[\\/]|\\\\)/.test(normalized)) return true;
  return /^[^#\s]+\/[^#]+$/.test(normalized);
}

export function getTerminalResourceDirectoryPath(
  payload: TerminalResourceTransferPayload,
): string {
  return payload.kind === "file"
    ? parentTerminalResourcePath(payload.path)
    : normalizeTerminalResourcePath(payload.path);
}

export function getTerminalResourceDirectoryAbsolutePath(
  payload: TerminalResourceTransferPayload,
): string {
  const absolutePath = String(payload?.absolutePath || "").trim();
  if (!absolutePath) return "";
  return payload.kind === "file"
    ? parentTerminalResourceAbsolutePath(absolutePath)
    : absolutePath;
}

function isTerminalResourceTransferPayload(
  payload: TerminalResourceTransferPayload | null,
): payload is TerminalResourceTransferPayload {
  return Boolean(payload);
}

function dedupeTerminalDropPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    result.push(path);
  }
  return result;
}

function normalizeTerminalResourceTransferItem(
  payload: Partial<TerminalResourceTransferPayload> | null | undefined,
): TerminalResourceTransferPayload | null {
  if (!payload) return null;
  const absolutePath = String(payload.absolutePath || "").trim();
  if (!absolutePath) return null;
  return {
    rootId: String(payload.rootId || ""),
    path: String(payload.path || ""),
    absolutePath,
    kind: payload.kind === "directory" ? "directory" : "file",
    name: String(payload.name || ""),
  };
}

function normalizeTerminalResourcePath(path: string | null | undefined): string {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
}

function parentTerminalResourcePath(path: string | null | undefined): string {
  const parts = normalizeTerminalResourcePath(path).split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

function parentTerminalResourceAbsolutePath(path: string): string {
  const normalized = String(path || "").trim().replace(/[\\/]+$/g, "");
  if (!normalized) return "";
  const separatorIndex = Math.max(
    normalized.lastIndexOf("/"),
    normalized.lastIndexOf("\\"),
  );
  if (separatorIndex < 0) return "";
  if (separatorIndex === 0 && normalized.startsWith("/")) return "/";
  const parent = normalized.slice(0, separatorIndex);
  if (/^[A-Za-z]:$/.test(parent)) return `${parent}\\`;
  return parent;
}

export function shellQuoteTerminalPath(path: string): string {
  const normalized = String(path || "").trim();
  if (!normalized) return "";
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(normalized)) {
    return normalized;
  }
  return `'${normalized.replace(/'/g, "'\\''")}'`;
}
