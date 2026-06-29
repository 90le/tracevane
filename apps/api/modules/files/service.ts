import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  FilesArchivePayload,
  FilesArchiveDryRunResponse,
  FilesArchiveDownloadPayload,
  FilesChmodPayload,
  FilesChmodDryRunResponse,
  FilesContentIndexActionResponse,
  FilesContentIndexRecordPreview,
  FilesContentIndexRecordsParams,
  FilesContentIndexRecordsPayload,
  FilesContentIndexRebuildResponse,
  FilesContentIndexStatsPayload,
  FileEntryKind,
  FileEntrySummary,
  FileRootSummary,
  FilesCreateDirectoryPayload,
  FilesCreateFilePayload,
  FilesDeletePayload,
  FilesDirectoryPayload,
  FilesMutationResponse,
  FilesReadPayload,
  FilesRenamePayload,
  FilesSearchPayload,
  FilesSummaryPayload,
  FilesTransferPayload,
  FilesTransferConflictPolicy,
  FilesVersionDeletePayload,
  FilesVersionItem,
  FilesVersionReadPayload,
  FilesVersionRestorePayload,
  FilesVersionsPayload,
  FilesTrashItem,
  FilesTrashPayload,
  FilesTrashPurgePayload,
  FilesTrashRestorePayload,
  FilesTransferDryRunPayload,
  FilesTransferDryRunResponse,
  FilesUploadCancelPayload,
  FilesUploadCompletePayload,
  FilesUploadConflictPolicy,
  FilesUploadInitPayload,
  FilesUploadInitResponse,
  FileTreeNodePayload,
  FilesTreePayload,
  FilesUnarchivePayload,
  FilesUnarchiveDryRunResponse,
  FilesUploadItemPayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../types/files.js";

const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_SEARCH_TEXT_BYTES = 256 * 1024;
const FILE_NAME_COLLATOR = new Intl.Collator(undefined, { numeric: true });
const UPLOAD_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_INSTANT_HASH_SCAN_ENTRIES = 20_000;
const MAX_CONTENT_INDEX_REBUILD_ENTRIES = 50_000;
const MAX_CONTENT_INDEX_HASH_BYTES = 512 * 1024 * 1024;
const RECYCLE_BIN_DIR_NAME = ".tracevane-trash";
const GLOBAL_RECYCLE_BIN_DIR_NAME = "trash";
const GLOBAL_RECYCLE_BIN_RELATIVE_PATH = `.tracevane/${GLOBAL_RECYCLE_BIN_DIR_NAME}`;
const CONTENT_INDEX_REBUILD_SKIP_DIRS = new Set([".git", "node_modules", ".tracevane", RECYCLE_BIN_DIR_NAME]);
const DEFAULT_SEARCH_LIMIT = 250;
const MAX_SEARCH_LIMIT = 500;
const MAX_CHMOD_DRY_RUN_ENTRIES = 5000;
const FILE_VERSION_DIR_NAME = "file-versions";
const MAX_FILE_VERSION_BYTES = 1024 * 1024;
const MAX_FILE_VERSIONS_PER_FILE = 20;

type FileRootContext = FileRootSummary & {
  absolutePath: string;
  realPath: string;
};

type ResolvedPath = {
  root: FileRootContext;
  relativePath: string;
  absolutePath: string;
};

export type FilesResolvedPath = ResolvedPath;

type ArchiveFormat = "zip" | "tar" | "gztar" | "bztar" | "xztar";
type DirectorySortKey = "name" | "size" | "modifiedAt";
type DirectorySortDirection = "asc" | "desc";

interface DirectoryListOptions {
  page?: number;
  pageSize?: number;
  sortKey?: DirectorySortKey;
  sortDirection?: DirectorySortDirection;
}

interface FileSearchOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  limit?: number;
}

const TEXT_FILE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".jsonl",
  ".yaml",
  ".yml",
  ".toml",
  ".ini",
  ".env",
  ".js",
  ".ts",
  ".tsx",
  ".jsx",
  ".mjs",
  ".cjs",
  ".vue",
  ".css",
  ".scss",
  ".less",
  ".html",
  ".xml",
  ".svg",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".ps1",
  ".sql",
  ".log",
  ".csv",
  ".gitignore",
  ".npmrc",
  ".editorconfig",
]);

const IMAGE_FILE_EXTENSIONS = new Set([
  ".apng",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
  ".heic",
  ".heif",
  ".svg",
  ".tif",
  ".tiff",
]);

const NON_TEXT_FILE_EXTENSIONS = new Set([
  ...IMAGE_FILE_EXTENSIONS,
  ".3g2",
  ".3gp",
  ".7z",
  ".aac",
  ".aif",
  ".aiff",
  ".avi",
  ".bz2",
  ".db",
  ".doc",
  ".docx",
  ".eot",
  ".flac",
  ".gz",
  ".gzip",
  ".bzip2",
  ".lzma",
  ".m4a",
  ".m4v",
  ".mid",
  ".midi",
  ".mkv",
  ".mov",
  ".mp3",
  ".mp4",
  ".odp",
  ".ods",
  ".oga",
  ".ogg",
  ".ogv",
  ".opus",
  ".otf",
  ".pdf",
  ".ppt",
  ".pptx",
  ".rar",
  ".sqlite",
  ".sqlite3",
  ".tar",
  ".tb2",
  ".tbz",
  ".tbz2",
  ".tgz",
  ".tlz",
  ".ttf",
  ".txz",
  ".wav",
  ".weba",
  ".webm",
  ".woff",
  ".woff2",
  ".xls",
  ".xlsx",
  ".xz",
  ".zip",
  ".zst",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".7z": "application/x-7z-compressed",
  ".aac": "audio/aac",
  ".apng": "image/apng",
  ".avif": "image/avif",
  ".avi": "video/x-msvideo",
  ".bmp": "image/bmp",
  ".bz2": "application/x-bzip2",
  ".bzip2": "application/x-bzip2",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".eot": "application/vnd.ms-fontobject",
  ".flac": "audio/flac",
  ".gif": "image/gif",
  ".gz": "application/gzip",
  ".gzip": "application/gzip",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".lzma": "application/x-xz",
  ".m4a": "audio/mp4",
  ".m4v": "video/mp4",
  ".md": "text/markdown; charset=utf-8",
  ".midi": "audio/midi",
  ".mid": "audio/midi",
  ".mkv": "video/x-matroska",
  ".mjs": "application/javascript; charset=utf-8",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".ogv": "video/ogg",
  ".opus": "audio/opus",
  ".otf": "font/otf",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".rar": "application/vnd.rar",
  ".sqlite": "application/vnd.sqlite3",
  ".sqlite3": "application/vnd.sqlite3",
  ".svg": "image/svg+xml",
  ".tar": "application/x-tar",
  ".tb2": "application/x-bzip2",
  ".tbz": "application/x-bzip2",
  ".tbz2": "application/x-bzip2",
  ".tgz": "application/gzip",
  ".tlz": "application/x-xz",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".ttf": "font/ttf",
  ".txz": "application/x-xz",
  ".ts": "application/typescript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".vue": "text/plain; charset=utf-8",
  ".wav": "audio/wav",
  ".weba": "audio/webm",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xml": "application/xml; charset=utf-8",
  ".xz": "application/x-xz",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".zip": "application/zip",
  ".zst": "application/zstd",
};

const CONTENT_INDEX_PREVIEW_LIMIT = 200;
const CONTENT_INDEX_RECORDS_DEFAULT_LIMIT = 100;
const CONTENT_INDEX_RECORDS_MAX_LIMIT = 500;

const SUPPORTED_ARCHIVE_FORMATS: Array<{ suffix: string; format: ArchiveFormat }> = [
  { suffix: ".tar.gz", format: "gztar" },
  { suffix: ".tar.gzip", format: "gztar" },
  { suffix: ".tgz", format: "gztar" },
  { suffix: ".tar.bz2", format: "bztar" },
  { suffix: ".tar.bzip2", format: "bztar" },
  { suffix: ".tbz", format: "bztar" },
  { suffix: ".tbz2", format: "bztar" },
  { suffix: ".tb2", format: "bztar" },
  { suffix: ".tar.xz", format: "xztar" },
  { suffix: ".tar.lzma", format: "xztar" },
  { suffix: ".txz", format: "xztar" },
  { suffix: ".tlz", format: "xztar" },
  { suffix: ".zip", format: "zip" },
  { suffix: ".tar", format: "tar" },
];

export interface FilesService {
  getSummary(): FilesSummaryPayload;
  listDirectory(rootId: string, directoryPath?: string, showHidden?: boolean, options?: DirectoryListOptions): FilesDirectoryPayload;
  listTree(rootId: string, directoryPath?: string, showHidden?: boolean): FilesTreePayload;
  readFile(rootId: string, filePath: string, options?: { offset?: number; limit?: number }): FilesReadPayload;
  search(rootId: string, directoryPath: string | undefined, query: string, recursive?: boolean, showHidden?: boolean, options?: FileSearchOptions): FilesSearchPayload;
  createDirectory(payload: FilesCreateDirectoryPayload): FilesMutationResponse;
  createFile(payload: FilesCreateFilePayload): FilesMutationResponse;
  writeFile(payload: FilesWritePayload): FilesMutationResponse;
  listVersions(rootId: string, filePath: string): FilesVersionsPayload;
  readVersion(rootId: string, filePath: string, versionId: string): FilesVersionReadPayload;
  restoreVersion(payload: FilesVersionRestorePayload): FilesMutationResponse;
  deleteVersion(payload: FilesVersionDeletePayload): FilesMutationResponse;
  renamePath(payload: FilesRenamePayload): FilesMutationResponse;
  dryRunChmod(payload: FilesChmodPayload): FilesChmodDryRunResponse;
  chmodPaths(payload: FilesChmodPayload): FilesMutationResponse;
  dryRunTransfer(payload: FilesTransferDryRunPayload): FilesTransferDryRunResponse;
  transferPaths(payload: FilesTransferDryRunPayload): FilesMutationResponse;
  copyPath(payload: FilesTransferPayload): FilesMutationResponse;
  movePath(payload: FilesTransferPayload): FilesMutationResponse;
  deletePaths(payload: FilesDeletePayload): FilesMutationResponse;
  listTrash(rootId: string): FilesTrashPayload;
  restoreTrash(payload: FilesTrashRestorePayload): FilesMutationResponse;
  purgeTrash(payload: FilesTrashPurgePayload): FilesMutationResponse;
  uploadFiles(payload: FilesUploadPayload): FilesMutationResponse;
  initUpload(payload: FilesUploadInitPayload): FilesUploadInitResponse;
  getUpload(uploadId: string): FilesUploadInitResponse;
  writeUploadChunk(uploadId: string, chunkIndex: number, data: Buffer): FilesUploadInitResponse;
  completeUpload(payload: FilesUploadCompletePayload): FilesMutationResponse;
  cancelUpload(payload: FilesUploadCancelPayload): FilesMutationResponse;
  dryRunArchive(payload: FilesArchivePayload): FilesArchiveDryRunResponse;
  archivePaths(payload: FilesArchivePayload): FilesMutationResponse;
  dryRunUnarchive(payload: FilesUnarchivePayload): FilesUnarchiveDryRunResponse;
  unarchiveFile(payload: FilesUnarchivePayload): FilesMutationResponse;
  getContentIndexStats(rootId: string): FilesContentIndexStatsPayload;
  getContentIndexRecords(params: FilesContentIndexRecordsParams): FilesContentIndexRecordsPayload;
  scanContentIndex(rootId: string): FilesContentIndexStatsPayload;
  cleanContentIndex(rootId: string): FilesContentIndexActionResponse;
  rebuildContentIndex(rootId: string): FilesContentIndexRebuildResponse;
  prepareArchiveDownload(payload: FilesArchiveDownloadPayload): {
    archivePath: string;
    fileName: string;
    mimeType: string;
    cleanupDir: string;
  };
  getDownloadFile(rootId: string, filePath: string): { absolutePath: string; fileName: string; mimeType: string };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function realPathOf(targetPath: string): string {
  return fs.realpathSync.native?.(targetPath) || fs.realpathSync(targetPath);
}

function samePath(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

function isWithinRoot(rootPath: string, targetPath: string): boolean {
  if (samePath(rootPath, targetPath)) return true;
  const relative = path.relative(rootPath, targetPath);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function normalizeRelativePath(value: unknown): string {
  const raw = normalizeString(value).replace(/\\/g, "/");
  if (!raw || raw === "/" || raw === ".") return "";
  const normalized = path.posix.normalize(raw.replace(/^\/+/g, ""));
  if (!normalized || normalized === ".") return "";
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Path escapes the selected root");
  }
  return normalized;
}

function toPortableRelativePath(value: string): string {
  return value.split(path.sep).join("/");
}

function ensureSafeName(value: unknown): string {
  const name = normalizeString(value);
  if (!name || name === "." || name === "..") {
    throw new Error("A valid file or directory name is required");
  }
  if (name.includes("/") || name.includes("\\")) {
    throw new Error("Names cannot include path separators");
  }
  return name;
}

function ensureSafeUploadRelativePath(value: unknown, fallbackName: unknown): string {
  const raw = normalizeString(value) || normalizeString(fallbackName);
  if (!raw) {
    throw new Error("A valid uploaded file path is required");
  }
  const portable = raw.replace(/\\/g, "/");
  const segments = portable
    .split("/")
    .filter(Boolean)
    .map((segment) => ensureSafeName(segment));
  if (!segments.length) {
    throw new Error("A valid uploaded file path is required");
  }
  return segments.join("/");
}

function ensureArchiveName(value: unknown): string {
  const baseName = ensureSafeName(value);
  return inferArchiveFormat(baseName) ? baseName : `${baseName}.zip`;
}

function inferArchiveFormat(fileName: string): ArchiveFormat | null {
  const normalized = String(fileName || "").trim().toLowerCase();
  return SUPPORTED_ARCHIVE_FORMATS.find((entry) => normalized.endsWith(entry.suffix))?.format || null;
}

function supportedArchiveFormatLabel(): string {
  return ".zip, .tar, .tar.gz, .tgz, .tar.bz2, .tbz2, .tar.xz, .txz";
}

function findNearestExistingAncestor(targetPath: string): string {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (samePath(parent, current)) {
      throw new Error("Target path is outside accessible roots");
    }
    current = parent;
  }
  return current;
}

function createRootDescriptors(config: TracevaneServerConfig): FileRootSummary[] {
  const candidates: FileRootSummary[] = [
    {
      id: "openclaw-root",
      labelZh: "OpenClaw 根目录",
      labelEn: "OpenClaw root",
      descriptionZh: "宿主 .openclaw 工作根目录。",
      descriptionEn: "The host .openclaw working root.",
      absolutePath: path.resolve(config.openclawRoot),
      preferred: true,
    },
    {
      id: "home-root",
      labelZh: "用户目录",
      labelEn: "Home",
      descriptionZh: "当前用户主目录。",
      descriptionEn: "Current user home directory.",
      absolutePath: path.resolve(process.env.HOME || os.homedir()),
    },
    {
      id: "system-root",
      labelZh: "系统根目录",
      labelEn: "System",
      descriptionZh: "系统文件树根目录。",
      descriptionEn: "Filesystem root.",
      absolutePath: path.resolve(path.parse(config.openclawRoot).root || "/"),
    },
    {
      id: "project-root",
      labelZh: "Tracevane 项目",
      labelEn: "Tracevane project",
      descriptionZh: "当前 Tracevane 扩展项目目录。",
      descriptionEn: "The current Tracevane extension project.",
      absolutePath: path.resolve(config.projectRoot),
    },
  ];

  const seen = new Set<string>();
  return candidates.filter((root) => {
    if (!fs.existsSync(root.absolutePath)) return false;
    const key = path.resolve(root.absolutePath);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildRootContexts(config: TracevaneServerConfig): FileRootContext[] {
  return createRootDescriptors(config).map((root) => ({
    ...root,
    absolutePath: path.resolve(root.absolutePath),
    realPath: realPathOf(root.absolutePath),
  }));
}

function resolveRoot(config: TracevaneServerConfig, rootId: string | undefined): FileRootContext {
  const roots = buildRootContexts(config);
  if (!roots.length) {
    throw new Error("No accessible file roots were discovered");
  }
  const preferred = roots.find((root) => root.preferred) || roots[0];
  if (!rootId) return preferred;
  return roots.find((root) => root.id === rootId) || preferred;
}

function resolveExistingPath(
  config: TracevaneServerConfig,
  rootId: string | undefined,
  targetPath: string | undefined,
  options: { allowRoot?: boolean; kind?: FileEntryKind } = {},
): ResolvedPath {
  const root = resolveRoot(config, rootId);
  const relativePath = normalizeRelativePath(targetPath);
  const absolutePath = path.resolve(root.absolutePath, relativePath || ".");
  if (!fs.existsSync(absolutePath)) {
    throw new Error("Requested path was not found");
  }
  const realPath = realPathOf(absolutePath);
  if (!isWithinRoot(root.realPath, realPath)) {
    throw new Error("Requested path escapes the selected root");
  }
  if (options.allowRoot === false && samePath(realPath, root.realPath)) {
    throw new Error("The selected root cannot be modified directly");
  }
  if (options.kind) {
    const stat = fs.statSync(absolutePath);
    const actualKind: FileEntryKind = stat.isDirectory() ? "directory" : "file";
    if (actualKind !== options.kind) {
      throw new Error(
        options.kind === "directory"
          ? "A directory is required for this action"
          : "A file is required for this action",
      );
    }
  }
  return {
    root,
    relativePath,
    absolutePath,
  };
}

export function resolveFilesServiceExistingFilePath(
  config: TracevaneServerConfig,
  rootId: string | undefined,
  targetPath: string | undefined,
): FilesResolvedPath {
  return resolveExistingPath(config, rootId, targetPath, { allowRoot: false, kind: "file" });
}

function resolveTargetPath(
  config: TracevaneServerConfig,
  rootId: string | undefined,
  targetPath: string | undefined,
  options: { allowRoot?: boolean } = {},
): ResolvedPath {
  const root = resolveRoot(config, rootId);
  const relativePath = normalizeRelativePath(targetPath);
  const absolutePath = path.resolve(root.absolutePath, relativePath || ".");
  const existingAncestor = findNearestExistingAncestor(absolutePath);
  const ancestorRealPath = realPathOf(existingAncestor);
  if (!isWithinRoot(root.realPath, ancestorRealPath)) {
    throw new Error("Target path escapes the selected root");
  }
  if (options.allowRoot === false && samePath(absolutePath, root.absolutePath)) {
    throw new Error("The selected root cannot be modified directly");
  }
  return {
    root,
    relativePath,
    absolutePath,
  };
}

function toIsoTime(stat: fs.Stats): string | null {
  return Number.isFinite(stat.mtimeMs) ? new Date(stat.mtimeMs).toISOString() : null;
}

function fileModeOctal(stat: fs.Stats): string {
  return (stat.mode & 0o7777).toString(8).padStart(4, "0");
}

function filePermissionsSymbolic(stat: fs.Stats, kind: FileEntryKind): string {
  const typePrefix = kind === "directory" ? "d" : "-";
  const bits: Array<[number, string]> = [
    [0o400, "r"], [0o200, "w"], [0o100, "x"],
    [0o040, "r"], [0o020, "w"], [0o010, "x"],
    [0o004, "r"], [0o002, "w"], [0o001, "x"],
  ];
  return `${typePrefix}${bits.map(([bit, label]) => ((stat.mode & bit) ? label : "-")).join("")}`;
}

function statNumericOwner(stat: fs.Stats, key: "uid" | "gid"): number | null {
  const value = stat[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function guessMimeType(entryPath: string): string {
  const ext = path.extname(entryPath).toLowerCase();
  return MIME_BY_EXTENSION[ext] || "application/octet-stream";
}

function isImageLike(entryPath: string): boolean {
  return IMAGE_FILE_EXTENSIONS.has(path.extname(entryPath).toLowerCase());
}

function isProbablyTextBuffer(buffer: Buffer): boolean {
  if (!buffer.length) return true;
  let suspicious = 0;
  const sampleLength = Math.min(buffer.length, 512);
  for (let index = 0; index < sampleLength; index += 1) {
    const value = buffer[index];
    if (value === 0) return false;
    const isControl = value < 9 || (value > 13 && value < 32);
    if (isControl) suspicious += 1;
  }
  return suspicious / sampleLength < 0.1;
}

function isTextLike(entryPath: string, sample: Buffer | null = null): boolean {
  const ext = path.extname(entryPath).toLowerCase();
  if (NON_TEXT_FILE_EXTENSIONS.has(ext)) return false;
  if (TEXT_FILE_EXTENSIONS.has(ext)) return true;
  if (!sample) return false;
  return isProbablyTextBuffer(sample);
}

function findContentSearchSnippet(
  filePath: string,
  query: string,
  options: Required<FileSearchOptions>,
): string | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_SEARCH_TEXT_BYTES) return null;
  let sample: Buffer;
  try {
    sample = readBufferSlice(filePath, Math.min(stat.size, MAX_SEARCH_TEXT_BYTES));
  } catch {
    return null;
  }
  if (!isTextLike(filePath, sample)) return null;
  const content = sample.toString("utf8");
  const match = findSearchMatch(content, query, options);
  const matchIndex = match?.index ?? -1;
  if (matchIndex === -1) return null;
  const start = Math.max(0, matchIndex - 48);
  const end = Math.min(content.length, matchIndex + Math.max(1, match?.length ?? query.length) + 72);
  return content.slice(start, end).replace(/\s+/g, " ").trim();
}

function findSearchMatch(
  value: string,
  query: string,
  options: Required<FileSearchOptions>,
): { index: number; length: number } | null {
  if (!query) return null;
  if (options.regex) {
    try {
      const matcher = new RegExp(query, options.caseSensitive ? "" : "i");
      const match = matcher.exec(value);
      if (!match) return null;
      return { index: match.index, length: Math.max(1, match[0]?.length ?? 0) };
    } catch {
      return null;
    }
  }
  const haystack = options.caseSensitive ? value : value.toLowerCase();
  const needle = options.caseSensitive ? query : query.toLowerCase();
  const index = haystack.indexOf(needle);
  return index >= 0 ? { index, length: needle.length } : null;
}

function matchesSearch(value: string, query: string, options: Required<FileSearchOptions>): boolean {
  return findSearchMatch(value, query, options) !== null;
}

function validateSearchQuery(query: string, options: Required<FileSearchOptions>): string | null {
  if (!options.regex || !query) return null;
  try {
    new RegExp(query, options.caseSensitive ? "" : "i");
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Invalid regular expression";
  }
}

function hasHiddenPathSegment(relativePath: string): boolean {
  return relativePath.split(/[\\/]+/).some((segment) => segment.startsWith("."));
}

function isPathInSearchScope(relativePath: string, directoryPath: string, recursive: boolean): boolean {
  const normalizedPath = normalizeRelativePath(relativePath);
  const normalizedDirectory = normalizeRelativePath(directoryPath);
  if (!normalizedDirectory) {
    if (recursive) return true;
    return path.posix.dirname(normalizedPath) === ".";
  }
  if (recursive) return normalizedPath === normalizedDirectory || normalizedPath.startsWith(`${normalizedDirectory}/`);
  return path.posix.dirname(normalizedPath) === normalizedDirectory;
}

function readBufferSlice(filePath: string, maxBytes: number, offset = 0): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, offset);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function summarizeEntry(
  directoryPath: string,
  directoryRelativePath: string,
  dirent: fs.Dirent,
  _showHidden: boolean,
  options: { sampleText?: boolean } = {},
): FileEntrySummary | null {
  const absolutePath = path.join(directoryPath, dirent.name);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    return null;
  }
  const kind: FileEntryKind = stat.isDirectory() ? "directory" : "file";
  const relativePath = toPortableRelativePath(
    path.join(directoryRelativePath || "", dirent.name),
  );
  const ext = kind === "file" ? path.extname(dirent.name).toLowerCase() || null : null;
  const sample =
    kind === "file" && options.sampleText === true
      ? (() => {
          try {
            return readBufferSlice(absolutePath, 512);
          } catch {
            return null;
          }
        })()
      : null;
  const hidden = dirent.name.startsWith(".");
  return {
    path: relativePath,
    name: dirent.name,
    kind,
    ext,
    size: kind === "file" ? stat.size : null,
    modifiedAt: toIsoTime(stat),
    hidden,
    textLike: kind === "file" ? isTextLike(dirent.name, sample) : false,
    imageLike: kind === "file" ? isImageLike(dirent.name) : false,
    mode: fileModeOctal(stat),
    permissions: filePermissionsSymbolic(stat, kind),
    uid: statNumericOwner(stat, "uid"),
    gid: statNumericOwner(stat, "gid"),
  };
}

function normalizeDirectorySortKey(value: unknown): DirectorySortKey {
  return value === "size" || value === "modifiedAt" ? value : "name";
}

function normalizeDirectorySortDirection(value: unknown): DirectorySortDirection {
  return value === "desc" ? "desc" : "asc";
}

function normalizeDirectoryPage(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 1;
  return Math.max(1, Math.floor(numberValue));
}

function normalizeDirectoryPageSize(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return 100;
  return Math.min(500, Math.max(1, Math.floor(numberValue)));
}

function sortEntries<T extends FileEntrySummary>(
  entries: T[],
  sortKey: DirectorySortKey = "name",
  sortDirection: DirectorySortDirection = "asc",
): T[] {
  const direction = sortDirection === "desc" ? -1 : 1;
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    if (sortKey === "size") {
      const sizeDelta = ((left.size ?? -1) - (right.size ?? -1)) * direction;
      if (sizeDelta !== 0) return sizeDelta;
    } else if (sortKey === "modifiedAt") {
      const leftTime = left.modifiedAt ? Date.parse(left.modifiedAt) : 0;
      const rightTime = right.modifiedAt ? Date.parse(right.modifiedAt) : 0;
      const timeDelta = (leftTime - rightTime) * direction;
      if (timeDelta !== 0) return timeDelta;
    }
    return FILE_NAME_COLLATOR.compare(left.name, right.name) * direction;
  });
}

function buildBreadcrumbs(relativePath: string, root: FileRootSummary) {
  const crumbs = [
    {
      path: "",
      label: root.labelZh,
    },
  ];
  if (!relativePath) return crumbs;
  const segments = relativePath.split("/").filter(Boolean);
  let current = "";
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    crumbs.push({
      path: current,
      label: segment,
    });
  }
  return crumbs;
}


interface UploadManifest {
  uploadId: string;
  rootId: string;
  targetRelativePath: string;
  fileName: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  overwrite: boolean;
  conflictPolicy: FilesUploadConflictPolicy;
  sha256?: string;
  createdAt: string;
}

interface ContentIndexRecord {
  rootId: string;
  path: string;
  size: number;
  sha256: string;
  mtimeMs: number;
  indexedAt: string;
}

type ContentIndexShard = Record<string, ContentIndexRecord[]>;

type ContentIndexScopeRoot = Pick<FileRootContext, "id" | "absolutePath" | "realPath">;

const GLOBAL_CONTENT_INDEX_ROOT_ID = "global";
const CONTENT_INDEX_FAST_STATS_PREVIEW_LIMIT = 20;

interface ContentIndexShardSource {
  root: ContentIndexScopeRoot;
  shardPath: string;
}

interface ContentIndexListMatch {
  record: FilesContentIndexRecordPreview;
  sortKey: string;
}

interface ContentIndexListCounts {
  all: number;
  valid: number;
  stale: number;
}

function uploadBaseDir(): string {
  return path.join(os.tmpdir(), "tracevane-files-uploads");
}

function sweepStaleUploads(now = Date.now()): void {
  const baseDir = uploadBaseDir();
  if (!fs.existsSync(baseDir)) return;
  for (const dirent of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(baseDir, dirent.name);
    const manifestPath = path.join(dirPath, "manifest.json");
    try {
      const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Partial<UploadManifest>;
      const createdAt = Date.parse(String(raw.createdAt || ""));
      if (!Number.isFinite(createdAt) || now - createdAt > UPLOAD_SESSION_TTL_MS) {
        fs.rmSync(dirPath, { recursive: true, force: true });
      }
    } catch {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }
}

function safeUploadId(value: unknown): string {
  const id = normalizeString(value);
  if (!/^[a-zA-Z0-9_-]{12,80}$/.test(id)) throw new Error("Invalid upload id");
  return id;
}

function uploadDir(uploadId: string): string {
  return path.join(uploadBaseDir(), safeUploadId(uploadId));
}

function uploadManifestPath(uploadId: string): string {
  return path.join(uploadDir(uploadId), "manifest.json");
}

function readUploadManifest(uploadId: string): UploadManifest {
  const raw = JSON.parse(fs.readFileSync(uploadManifestPath(uploadId), "utf8")) as UploadManifest;
  if (!raw || raw.uploadId !== safeUploadId(uploadId)) throw new Error("Invalid upload manifest");
  return raw;
}

function writeUploadManifest(manifest: UploadManifest): void {
  fs.mkdirSync(uploadDir(manifest.uploadId), { recursive: true });
  fs.writeFileSync(uploadManifestPath(manifest.uploadId), JSON.stringify(manifest, null, 2), "utf8");
}

function chunkPath(uploadId: string, chunkIndex: number): string {
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) throw new Error("Invalid chunk index");
  return path.join(uploadDir(uploadId), `chunk-${chunkIndex}`);
}

function uploadedChunksFor(uploadId: string, chunkCount: number): number[] {
  const out: number[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    if (fs.existsSync(chunkPath(uploadId, index))) out.push(index);
  }
  return out;
}

function uploadInitResponse(manifest: UploadManifest): FilesUploadInitResponse {
  return {
    uploadId: manifest.uploadId,
    chunkSize: manifest.chunkSize,
    chunkCount: manifest.chunkCount,
    uploadedChunks: uploadedChunksFor(manifest.uploadId, manifest.chunkCount),
    targetPath: manifest.targetRelativePath,
    conflictPolicy: manifest.conflictPolicy,
  };
}

function normalizeSha256(value: unknown): string | undefined {
  const normalized = normalizeString(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}

function sha256File(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function findSameHashFileInRoot(
  config: TracevaneServerConfig,
  rootId: string,
  size: number,
  sha256: string | undefined,
  excludePath: string,
): string | null {
  if (!sha256 || size <= 0 || size > 512 * 1024 * 1024) return null;
  const root = resolveRoot(config, rootId);
  const queue = [root.absolutePath];
  let scanned = 0;
  while (queue.length && scanned < MAX_INSTANT_HASH_SCAN_ENTRIES) {
    const directory = queue.shift();
    if (!directory) break;
    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      scanned += 1;
      if (scanned > MAX_INSTANT_HASH_SCAN_ENTRIES) break;
      const absolutePath = path.join(directory, dirent.name);
      if (samePath(absolutePath, excludePath)) continue;
      if (dirent.isDirectory()) {
        if (dirent.name === "node_modules" || dirent.name === ".git") continue;
        queue.push(absolutePath);
        continue;
      }
      if (!dirent.isFile()) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        continue;
      }
      if (stat.size !== size) continue;
      try {
        if (sha256File(absolutePath) === sha256) return absolutePath;
      } catch {
        continue;
      }
    }
  }
  return null;
}

function safeIndexName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 80) || "root";
}

function contentIndexShardPath(config: TracevaneServerConfig, rootId: string, sha256: string): string {
  return path.join(
    config.openclawRoot,
    ".tracevane",
    "file-content-index",
    safeIndexName(rootId),
    `${sha256.slice(0, 2)}.json`,
  );
}

function readContentIndexShard(config: TracevaneServerConfig, rootId: string, sha256: string): ContentIndexShard {
  const shardPath = contentIndexShardPath(config, rootId, sha256);
  try {
    if (!fs.existsSync(shardPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(shardPath, "utf8")) as ContentIndexShard;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeContentIndexShard(config: TracevaneServerConfig, rootId: string, sha256: string, shard: ContentIndexShard): void {
  const shardPath = contentIndexShardPath(config, rootId, sha256);
  fs.mkdirSync(path.dirname(shardPath), { recursive: true });
  fs.writeFileSync(shardPath, JSON.stringify(shard), "utf8");
}

function contentIndexRootDir(config: TracevaneServerConfig, rootId: string): string {
  return path.join(config.openclawRoot, ".tracevane", "file-content-index", safeIndexName(rootId));
}

function listContentIndexShardFiles(config: TracevaneServerConfig, rootId: string): string[] {
  const dir = contentIndexRootDir(config, rootId);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => /^[a-f0-9]{2}\.json$/i.test(name))
    .sort((left, right) => left.localeCompare(right))
    .map((name) => path.join(dir, name));
}

function isGlobalContentIndexRoot(rootId: string | undefined): boolean {
  const normalized = String(rootId || "").trim().toLowerCase();
  return !normalized || normalized === GLOBAL_CONTENT_INDEX_ROOT_ID || normalized === "all" || normalized === "system";
}

function contentIndexScopeRoots(config: TracevaneServerConfig, rootId: string | undefined): ContentIndexScopeRoot[] {
  if (isGlobalContentIndexRoot(rootId)) return buildRootContexts(config);
  return [resolveRoot(config, rootId)];
}

function contentIndexPayloadRootId(rootId: string | undefined): string {
  return isGlobalContentIndexRoot(rootId) ? GLOBAL_CONTENT_INDEX_ROOT_ID : String(rootId || "");
}

function contentIndexPayloadStorageDirectory(config: TracevaneServerConfig, rootId: string | undefined): string {
  if (isGlobalContentIndexRoot(rootId)) return path.join(config.openclawRoot, ".tracevane", "file-content-index");
  return contentIndexRootDir(config, rootId || "");
}

function listContentIndexShardSources(config: TracevaneServerConfig, rootId: string | undefined): ContentIndexShardSource[] {
  return contentIndexScopeRoots(config, rootId).flatMap((root) =>
    listContentIndexShardFiles(config, root.id).map((shardPath) => ({ root, shardPath })),
  );
}

function readContentIndexShardFile(filePath: string): ContentIndexShard {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as ContentIndexShard;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function summarizeIndexedFile(
  config: TracevaneServerConfig,
  rootId: string,
  record: ContentIndexRecord,
): FileEntrySummary | null {
  let target: ResolvedPath;
  let stat: fs.Stats;
  try {
    target = resolveTargetPath(config, rootId, record.path, { allowRoot: false });
    stat = fs.statSync(target.absolutePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size !== record.size || stat.mtimeMs !== record.mtimeMs) return null;
  const name = path.basename(target.relativePath);
  const ext = path.extname(name).toLowerCase() || null;
  let sample: Buffer | null = null;
  try {
    sample = readBufferSlice(target.absolutePath, Math.min(512, stat.size));
  } catch {
    sample = null;
  }
  return {
    path: target.relativePath,
    name,
    kind: "file",
    ext,
    size: stat.size,
    modifiedAt: toIsoTime(stat),
    hidden: hasHiddenPathSegment(target.relativePath),
    textLike: isTextLike(target.absolutePath, sample),
    imageLike: isImageLike(target.absolutePath),
    mode: fileModeOctal(stat),
    permissions: filePermissionsSymbolic(stat, "file"),
    uid: statNumericOwner(stat, "uid"),
    gid: statNumericOwner(stat, "gid"),
  };
}


function clampSearchLimit(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(MAX_SEARCH_LIMIT, Math.floor(numeric)));
}

function searchContentIndex(
  config: TracevaneServerConfig,
  rootId: string,
  directoryPath: string,
  query: string,
  options: Required<FileSearchOptions>,
  recursive: boolean,
  showHidden: boolean,
  seenPaths: Set<string>,
  limit: number,
): { candidateCount: number; results: FilesSearchPayload["results"] } {
  const results: FilesSearchPayload["results"] = [];
  let candidateCount = 0;
  for (const shardPath of listContentIndexShardFiles(config, rootId)) {
    const shard = readContentIndexShardFile(shardPath);
    for (const records of Object.values(shard)) {
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (results.length >= limit) break;
        if (!record?.path || seenPaths.has(record.path)) continue;
        if (!showHidden && hasHiddenPathSegment(record.path)) continue;
        if (!isPathInSearchScope(record.path, directoryPath, recursive)) continue;
        candidateCount += 1;
        const summary = summarizeIndexedFile(config, rootId, record);
        if (!summary) continue;
        const target = resolveTargetPath(config, rootId, summary.path, { allowRoot: false });
        const nameMatches = matchesSearch(summary.name, query, options);
        const contentSnippet =
          !nameMatches && summary.textLike
            ? findContentSearchSnippet(target.absolutePath, query, options)
            : null;
        if (!nameMatches && !contentSnippet) continue;
        seenPaths.add(summary.path);
        results.push({
          ...summary,
          directoryPath: path.posix.dirname(summary.path) === "." ? "" : path.posix.dirname(summary.path),
          matchKind: nameMatches ? "name" : "content",
          snippet: contentSnippet,
        });
      }
      if (results.length >= limit) break;
    }
    if (results.length >= limit) break;
  }
  return { candidateCount, results };
}

function inspectContentIndexRecord(
  config: TracevaneServerConfig,
  rootId: string,
  record: ContentIndexRecord,
): { valid: boolean; size: number; indexedAt: string | null } {
  try {
    const target = resolveTargetPath(config, rootId, record.path, { allowRoot: false });
    const stat = fs.statSync(target.absolutePath);
    const valid = stat.isFile() && stat.size === record.size && stat.mtimeMs === record.mtimeMs;
    return { valid, size: Number(record.size) || 0, indexedAt: record.indexedAt || null };
  } catch {
    return { valid: false, size: Number(record.size) || 0, indexedAt: record.indexedAt || null };
  }
}

function computeContentIndexStats(
  config: TracevaneServerConfig,
  rootId: string,
  options: { cleanStale?: boolean; validateRecords?: boolean } = {},
): FilesContentIndexActionResponse {
  const scopeRoots = contentIndexScopeRoots(config, rootId);
  const shardSources = listContentIndexShardSources(config, rootId);
  let hashCount = 0;
  let recordCount = 0;
  let validRecordCount = 0;
  let staleRecordCount = 0;
  let cleanedRecordCount = 0;
  let indexedBytes = 0;
  let staleBytes = 0;
  let newestIndexedAt: string | null = null;
  const recordsPreview: FilesContentIndexRecordPreview[] = [];
  const validateRecords = Boolean(options.cleanStale || options.validateRecords);

  for (const { root, shardPath } of shardSources) {
    const shard = readContentIndexShardFile(shardPath);
    const nextShard: ContentIndexShard = {};
    for (const [sha256, records] of Object.entries(shard)) {
      if (!/^[a-f0-9]{64}$/.test(sha256) || !Array.isArray(records)) continue;
      hashCount += 1;
      const survivors: ContentIndexRecord[] = [];
      for (const record of records) {
        recordCount += 1;
        const inspected = validateRecords
          ? inspectContentIndexRecord(config, root.id, record)
          : { valid: true, size: Number(record.size) || 0, indexedAt: record.indexedAt || null };
        if (inspected.indexedAt && (!newestIndexedAt || inspected.indexedAt > newestIndexedAt)) newestIndexedAt = inspected.indexedAt;
        if (recordsPreview.length < CONTENT_INDEX_FAST_STATS_PREVIEW_LIMIT) {
          recordsPreview.push({
            rootId: root.id,
            path: record.path,
            sha256,
            size: inspected.size,
            indexedAt: inspected.indexedAt,
            status: inspected.valid ? "valid" : "stale",
          });
        }
        if (inspected.valid) {
          validRecordCount += 1;
          indexedBytes += inspected.size;
          survivors.push(record);
        } else {
          staleRecordCount += 1;
          staleBytes += inspected.size;
          cleanedRecordCount += 1;
        }
      }
      if (survivors.length) nextShard[sha256] = survivors;
    }
    if (options.cleanStale) {
      const keys = Object.keys(nextShard);
      if (keys.length) fs.writeFileSync(shardPath, JSON.stringify(nextShard), "utf8");
      else fs.rmSync(shardPath, { force: true });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    rootId: contentIndexPayloadRootId(rootId),
    scope: isGlobalContentIndexRoot(rootId) ? "global" : "root",
    rootCount: scopeRoots.length,
    shardCount: options.cleanStale ? listContentIndexShardSources(config, rootId).length : shardSources.length,
    hashCount,
    recordCount,
    validRecordCount,
    staleRecordCount: validateRecords && !options.cleanStale ? staleRecordCount : 0,
    indexedBytes,
    staleBytes: validateRecords && !options.cleanStale ? staleBytes : 0,
    newestIndexedAt,
    storageDirectory: contentIndexPayloadStorageDirectory(config, rootId),
    previewLimit: CONTENT_INDEX_FAST_STATS_PREVIEW_LIMIT,
    recordsPreview: options.cleanStale ? recordsPreview.filter((record) => record.status === "valid") : recordsPreview,
    fastStats: !validateRecords,
    ...(options.cleanStale ? { cleanedRecordCount } : {}),
  };
}

function normalizeContentIndexStatusFilter(value: unknown): "all" | "valid" | "stale" {
  return value === "valid" || value === "stale" ? value : "all";
}

function clampContentIndexRecordsOffset(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function clampContentIndexRecordsLimit(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return CONTENT_INDEX_RECORDS_DEFAULT_LIMIT;
  return Math.max(1, Math.min(CONTENT_INDEX_RECORDS_MAX_LIMIT, Math.floor(parsed)));
}

function compareContentIndexListMatches(left: ContentIndexListMatch, right: ContentIndexListMatch): number {
  return left.sortKey.localeCompare(right.sortKey, undefined, { numeric: true, sensitivity: "base" });
}

function listContentIndexRecords(
  config: TracevaneServerConfig,
  params: FilesContentIndexRecordsParams,
): FilesContentIndexRecordsPayload {
  const status = normalizeContentIndexStatusFilter(params.status);
  const query = (params.query || "").trim().toLowerCase();
  const offset = clampContentIndexRecordsOffset(params.offset);
  const limit = clampContentIndexRecordsLimit(params.limit);
  const matches: ContentIndexListMatch[] = [];
  const scopeRoots = contentIndexScopeRoots(config, params.rootId);
  const validateRecords = status === "stale";
  const counts: ContentIndexListCounts = { all: 0, valid: 0, stale: 0 };
  let visitedAfterMatches = 0;
  let hasMore = false;

  for (const { root, shardPath } of listContentIndexShardSources(config, params.rootId)) {
    const shard = readContentIndexShardFile(shardPath);
    for (const [sha256, shardRecords] of Object.entries(shard)) {
      if (!/^[a-f0-9]{64}$/.test(sha256) || !Array.isArray(shardRecords)) continue;
      for (const record of shardRecords) {
        if (!record?.path) continue;
        if (query && !record.path.toLowerCase().includes(query) && !sha256.toLowerCase().includes(query) && !root.id.toLowerCase().includes(query)) continue;
        const inspected = validateRecords
          ? inspectContentIndexRecord(config, root.id, record)
          : { valid: true, size: Number(record.size) || 0, indexedAt: record.indexedAt || null };
        const recordStatus = inspected.valid ? "valid" : "stale";
        counts.all += 1;
        counts[recordStatus] += 1;
        if (status !== "all" && recordStatus !== status) continue;
        visitedAfterMatches += 1;
        hasMore = visitedAfterMatches > offset + limit;
        const candidate: ContentIndexListMatch = {
          record: { rootId: root.id, path: record.path, sha256, size: inspected.size, indexedAt: inspected.indexedAt, status: recordStatus },
          sortKey: `${root.id}|||${record.path}|||${sha256}`.toLowerCase(),
        };
        if (matches.length < offset + limit) {
          matches.push(candidate);
          continue;
        }
        let largestIndex = 0;
        for (let index = 1; index < matches.length; index += 1) {
          if (compareContentIndexListMatches(matches[index], matches[largestIndex]) > 0) largestIndex = index;
        }
        if (compareContentIndexListMatches(candidate, matches[largestIndex]) < 0) matches[largestIndex] = candidate;
      }
    }
  }

  matches.sort(compareContentIndexListMatches);
  const totalRecordCount = validateRecords || query || status === "all" ? visitedAfterMatches : counts[status];
  const records = matches.slice(offset, offset + limit).map((match) => match.record);

  return {
    checkedAt: new Date().toISOString(),
    rootId: contentIndexPayloadRootId(params.rootId),
    scope: isGlobalContentIndexRoot(params.rootId) ? "global" : "root",
    rootCount: scopeRoots.length,
    status,
    query,
    offset,
    limit,
    totalRecordCount,
    returnedRecordCount: records.length,
    hasMore,
    records,
  };
}


function shouldSkipContentIndexRebuildDirectory(relativePath: string, dirName: string): boolean {
  if (CONTENT_INDEX_REBUILD_SKIP_DIRS.has(dirName)) return true;
  const normalized = normalizeRelativePath(path.join(relativePath, dirName));
  return normalized === ".openclaw/.tracevane/file-content-index" || normalized.startsWith(".openclaw/.tracevane/file-content-index/");
}

function rebuildContentIndexForRoot(
  config: TracevaneServerConfig,
  rootId: string,
): FilesContentIndexRebuildResponse {
  const root = resolveRoot(config, rootId);
  fs.rmSync(contentIndexRootDir(config, root.id), { recursive: true, force: true });

  const queue: Array<{ absolutePath: string; relativePath: string }> = [{ absolutePath: root.absolutePath, relativePath: "" }];
  const visitedDirectories = new Set<string>();
  let scannedFileCount = 0;
  let rebuiltRecordCount = 0;
  let skippedFileCount = 0;
  let truncated = false;

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    let realDirectory: string;
    try {
      realDirectory = realPathOf(current.absolutePath);
    } catch {
      skippedFileCount += 1;
      continue;
    }
    if (visitedDirectories.has(realDirectory)) continue;
    visitedDirectories.add(realDirectory);

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(current.absolutePath, { withFileTypes: true });
    } catch {
      skippedFileCount += 1;
      continue;
    }

    for (const dirent of dirents) {
      if (scannedFileCount + skippedFileCount >= MAX_CONTENT_INDEX_REBUILD_ENTRIES) {
        truncated = true;
        break;
      }
      const absolutePath = path.join(current.absolutePath, dirent.name);
      const relativePath = normalizeRelativePath(path.join(current.relativePath, dirent.name));
      if (dirent.isDirectory()) {
        if (shouldSkipContentIndexRebuildDirectory(current.relativePath, dirent.name)) {
          skippedFileCount += 1;
          continue;
        }
        queue.push({ absolutePath, relativePath });
        continue;
      }
      if (!dirent.isFile()) {
        skippedFileCount += 1;
        continue;
      }

      scannedFileCount += 1;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        skippedFileCount += 1;
        continue;
      }
      if (!stat.isFile() || stat.size > MAX_CONTENT_INDEX_HASH_BYTES) {
        skippedFileCount += 1;
        continue;
      }
      try {
        recordContentIndex(config, root.id, relativePath, stat.size, sha256File(absolutePath));
        rebuiltRecordCount += 1;
      } catch {
        skippedFileCount += 1;
      }
    }
    if (truncated) break;
  }

  return {
    ...computeContentIndexStats(config, root.id),
    scannedFileCount,
    rebuiltRecordCount,
    skippedFileCount,
    truncated,
  };
}


function clampReadOffset(value: unknown, fileSize: number): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return 0;
  return Math.min(Math.floor(next), Math.max(0, fileSize));
}

function clampReadLimit(value: unknown): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return MAX_TEXT_FILE_BYTES;
  return Math.max(1, Math.min(Math.floor(next), MAX_TEXT_FILE_BYTES));
}

function recordContentIndex(
  config: TracevaneServerConfig,
  rootId: string,
  relativePath: string,
  size: number,
  sha256: string | undefined,
): void {
  if (!sha256) return;
  const target = resolveTargetPath(config, rootId, relativePath, { allowRoot: false });
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target.absolutePath);
  } catch {
    return;
  }
  if (!stat.isFile() || stat.size !== size) return;
  const shard = readContentIndexShard(config, rootId, sha256);
  const records = (shard[sha256] ?? []).filter((record) => record.path !== target.relativePath);
  records.unshift({
    rootId,
    path: target.relativePath,
    size,
    sha256,
    mtimeMs: stat.mtimeMs,
    indexedAt: new Date().toISOString(),
  });
  shard[sha256] = records.slice(0, 200);
  writeContentIndexShard(config, rootId, sha256, shard);
}

function lookupContentIndex(
  config: TracevaneServerConfig,
  rootId: string,
  size: number,
  sha256: string | undefined,
  excludePath: string,
): string | null {
  if (!sha256) return null;
  const shard = readContentIndexShard(config, rootId, sha256);
  const records = shard[sha256] ?? [];
  const survivors: ContentIndexRecord[] = [];
  let found: string | null = null;
  for (const record of records) {
    try {
      const target = resolveTargetPath(config, rootId, record.path, { allowRoot: false });
      if (samePath(target.absolutePath, excludePath)) continue;
      const stat = fs.statSync(target.absolutePath);
      if (!stat.isFile() || stat.size !== size || stat.mtimeMs !== record.mtimeMs) continue;
      survivors.push(record);
      if (!found) found = target.absolutePath;
    } catch {
      continue;
    }
  }
  if (survivors.length !== records.length) {
    shard[sha256] = survivors;
    writeContentIndexShard(config, rootId, sha256, shard);
  }
  return found;
}

function instantCopyResponse(
  config: TracevaneServerConfig,
  rootId: string,
  sourcePath: string,
  destination: ResolvedPath,
  conflictPolicy: FilesUploadConflictPolicy,
  size: number,
  sha256: string | undefined,
): FilesUploadInitResponse {
  fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true });
  if (!samePath(sourcePath, destination.absolutePath)) {
    fs.copyFileSync(sourcePath, destination.absolutePath);
  }
  recordContentIndex(config, rootId, destination.relativePath, size, sha256);
  return {
    uploadId: `instant-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    chunkSize: 0,
    chunkCount: 0,
    uploadedChunks: [],
    targetPath: destination.relativePath,
    instant: true,
    conflictPolicy,
  };
}

function decodeUploadFile(input: FilesUploadItemPayload): Buffer {
  const fileName = ensureSafeName(input.fileName);
  const rawBase64 = normalizeString(input.dataBase64).replace(/^data:[^,]+,/, "");
  if (!rawBase64) return Buffer.alloc(0);
  const buffer = Buffer.from(rawBase64, "base64");
  return buffer;
}

function ensureNotExists(targetPath: string): void {
  if (fs.existsSync(targetPath)) {
    throw new Error("Target path already exists");
  }
}

function normalizeUploadConflictPolicy(payload: { overwrite?: boolean; conflictPolicy?: FilesUploadConflictPolicy }): FilesUploadConflictPolicy {
  if (payload.overwrite === true) return "overwrite";
  const value = payload.conflictPolicy;
  return value === "overwrite" || value === "skip" || value === "rename" ? value : "fail";
}

function normalizeTransferConflictPolicy(value: unknown): FilesTransferConflictPolicy {
  return value === "overwrite" || value === "skip" || value === "rename" ? value : "fail";
}

function appendRenameSuffix(relativePath: string, index: number): string {
  const directory = path.posix.dirname(relativePath);
  const basename = path.posix.basename(relativePath);
  const ext = path.posix.extname(basename);
  const stem = ext ? basename.slice(0, -ext.length) : basename;
  const nextName = `${stem} (${index})${ext}`;
  return directory === "." ? nextName : path.posix.join(directory, nextName);
}

function findAvailableUploadTarget(
  config: TracevaneServerConfig,
  rootId: string,
  initialRelativePath: string,
): ResolvedPath {
  for (let index = 1; index < 10000; index += 1) {
    const candidateRelativePath = index === 1
      ? initialRelativePath
      : appendRenameSuffix(initialRelativePath, index - 1);
    const candidate = resolveTargetPath(config, rootId, candidateRelativePath, {
      allowRoot: false,
    });
    if (!fs.existsSync(candidate.absolutePath)) return candidate;
  }
  throw new Error("Unable to find a non-conflicting upload target");
}

function findAvailableTransferName(name: string, reservedNames: Set<string>): string {
  for (let index = 1; index < 10000; index += 1) {
    const candidate = index === 1 ? name : path.posix.basename(appendRenameSuffix(name, index - 1));
    if (!reservedNames.has(candidate)) return candidate;
  }
  throw new Error("Unable to find a non-conflicting destination name");
}

function createArchiveDryRun(
  config: TracevaneServerConfig,
  payload: FilesArchivePayload,
): FilesArchiveDryRunResponse {
  const normalizedPaths = Array.from(
    new Set(
      (Array.isArray(payload.paths) ? payload.paths : [])
        .map((entry) => normalizeRelativePath(entry))
        .filter(Boolean),
    ),
  );
  if (!normalizedPaths.length) {
    throw new Error("At least one path is required to archive");
  }
  const workingDirectory = resolveExistingPath(
    config,
    payload.rootId,
    payload.directoryPath,
    { allowRoot: true, kind: "directory" },
  );
  const archiveName = ensureArchiveName(payload.name);
  const archiveFormat = inferArchiveFormat(archiveName);
  if (!archiveFormat) {
    throw new Error(`Unsupported archive format. Supported formats: ${supportedArchiveFormatLabel()}`);
  }
  const destination = resolveTargetPath(
    config,
    payload.rootId,
    path.join(workingDirectory.relativePath || "", archiveName),
    { allowRoot: false },
  );
  const items: FilesArchiveDryRunResponse["items"] = normalizedPaths.map((sourcePath) => {
    try {
      const source = resolveExistingPath(config, payload.rootId, sourcePath, { allowRoot: false });
      const sourceStat = fs.statSync(source.absolutePath);
      return {
        sourcePath: source.relativePath,
        sourceKind: sourceStat.isDirectory() ? "directory" : "file",
        status: "ready",
      };
    } catch (error) {
      return {
        sourcePath,
        sourceKind: null,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  });
  return {
    checkedAt: new Date().toISOString(),
    rootId: payload.rootId,
    directoryPath: workingDirectory.relativePath,
    archiveName,
    archivePath: destination.relativePath,
    archiveFormat,
    destinationExists: fs.existsSync(destination.absolutePath),
    counts: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      errors: items.filter((item) => item.status === "error").length,
    },
    items,
  };
}

function createTransferDryRun(
  config: TracevaneServerConfig,
  payload: FilesTransferDryRunPayload,
): FilesTransferDryRunResponse {
  const sourcePaths = Array.from(new Set((Array.isArray(payload.sourcePaths) ? payload.sourcePaths : []).map((entry) => normalizeRelativePath(entry)).filter(Boolean)));
  const conflictPolicy = normalizeTransferConflictPolicy(payload.conflictPolicy);
  const operation = payload.operation === "move" ? "move" : "copy";
  const explicitNextName =
    typeof payload.nextName === "string" && payload.nextName.trim()
      ? ensureSafeName(payload.nextName)
      : null;
  if (explicitNextName && sourcePaths.length !== 1) {
    throw new Error("nextName can only be used when transferring a single source path");
  }
  const destinationDirectory = resolveExistingPath(
    config,
    payload.destinationRootId,
    payload.destinationDirectoryPath,
    { allowRoot: true, kind: "directory" },
  );
  const reservedNames = new Set<string>();
  try {
    for (const dirent of fs.readdirSync(destinationDirectory.absolutePath, { withFileTypes: true })) {
      reservedNames.add(dirent.name);
    }
  } catch {
    // resolveExistingPath already verified the destination; keep dry-run resilient.
  }

  const items: FilesTransferDryRunResponse["items"] = [];
  for (const sourcePath of sourcePaths) {
    try {
      const source = resolveExistingPath(config, payload.sourceRootId, sourcePath, { allowRoot: false });
      const sourceStat = fs.statSync(source.absolutePath);
      const sourceKind: FileEntryKind = sourceStat.isDirectory() ? "directory" : "file";
      const sourceName = path.basename(source.absolutePath);
      let nextName = explicitNextName ?? sourceName;
      const directDestination = resolveTargetPath(
        config,
        payload.destinationRootId,
        path.join(destinationDirectory.relativePath || "", nextName),
        { allowRoot: false },
      );
      if (operation === "move" && samePath(source.absolutePath, directDestination.absolutePath)) {
        items.push({
          sourcePath: source.relativePath,
          destinationPath: directDestination.relativePath,
          sourceKind,
          status: "skip",
          message: "源路径与目标路径相同，将跳过。",
        });
        continue;
      }
      if (operation === "move" && sourceStat.isDirectory() && isWithinRoot(source.absolutePath, directDestination.absolutePath)) {
        items.push({
          sourcePath: source.relativePath,
          destinationPath: directDestination.relativePath,
          sourceKind,
          status: "error",
          message: "不能将目录移动到它自身或子目录中。",
        });
        continue;
      }
      if (!reservedNames.has(nextName)) {
        reservedNames.add(nextName);
        items.push({
          sourcePath: source.relativePath,
          destinationPath: directDestination.relativePath,
          sourceKind,
          status: "ready",
        });
        continue;
      }
      if (conflictPolicy === "overwrite") {
        items.push({
          sourcePath: source.relativePath,
          destinationPath: directDestination.relativePath,
          sourceKind,
          status: "overwrite",
          message: "目标已存在，将覆盖。",
        });
        continue;
      }
      if (conflictPolicy === "skip") {
        items.push({
          sourcePath: source.relativePath,
          destinationPath: directDestination.relativePath,
          sourceKind,
          status: "skip",
          message: "目标已存在，将跳过。",
        });
        continue;
      }
      if (conflictPolicy === "rename") {
        nextName = findAvailableTransferName(nextName, reservedNames);
        reservedNames.add(nextName);
        const renamedDestination = resolveTargetPath(
          config,
          payload.destinationRootId,
          path.join(destinationDirectory.relativePath || "", nextName),
          { allowRoot: false },
        );
        items.push({
          sourcePath: source.relativePath,
          destinationPath: renamedDestination.relativePath,
          sourceKind,
          status: "rename",
          message: `目标已存在，将保留两者为 ${nextName}。`,
        });
        continue;
      }
      items.push({
        sourcePath: source.relativePath,
        destinationPath: directDestination.relativePath,
        sourceKind,
        status: "conflict",
        message: "目标已存在，需要修改冲突策略。",
      });
    } catch (error) {
      items.push({
        sourcePath,
        destinationPath: null,
        sourceKind: null,
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const counts = {
    total: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    conflicts: items.filter((item) => item.status === "conflict").length,
    overwrite: items.filter((item) => item.status === "overwrite").length,
    skip: items.filter((item) => item.status === "skip").length,
    rename: items.filter((item) => item.status === "rename").length,
    errors: items.filter((item) => item.status === "error").length,
  };
  return {
    checkedAt: new Date().toISOString(),
    operation,
    sourceRootId: payload.sourceRootId,
    destinationRootId: payload.destinationRootId,
    destinationDirectoryPath: destinationDirectory.relativePath,
    conflictPolicy,
    counts,
    items,
  };
}


function executeTransfer(config: TracevaneServerConfig, payload: FilesTransferDryRunPayload): FilesMutationResponse {
  const preview = createTransferDryRun(config, payload);
  if (preview.counts.conflicts || preview.counts.errors) {
    throw new Error("Transfer has blocking conflicts or invalid sources; run dry-run and choose a conflict policy before executing");
  }
  const affectedPaths: string[] = [];
  let changedCount = 0;
  let skippedCount = 0;
  for (const item of preview.items) {
    if (item.status === "skip") {
      skippedCount += 1;
      if (item.destinationPath) affectedPaths.push(`${item.destinationPath} (skipped)`);
      continue;
    }
    if (!item.destinationPath) continue;
    const source = resolveExistingPath(config, preview.sourceRootId, item.sourcePath, { allowRoot: false });
    const destination = resolveTargetPath(config, preview.destinationRootId, item.destinationPath, { allowRoot: false });
    if (preview.operation === "copy") copyEntry(source.absolutePath, destination.absolutePath, item.status === "overwrite");
    else moveEntry(source.absolutePath, destination.absolutePath, item.status === "overwrite");
    affectedPaths.push(source.relativePath, destination.relativePath);
    changedCount += 1;
  }
  return {
    success: true,
    action: "transfer",
    message: `${preview.operation === "copy" ? "Copied" : "Moved"} ${changedCount} item(s)${skippedCount ? `, skipped ${skippedCount}` : ""}`,
    affectedPaths,
  };
}

function copyEntry(sourcePath: string, targetPath: string, overwrite = false): void {
  if (!overwrite) ensureNotExists(targetPath);
  const stat = fs.statSync(sourcePath);
  if (stat.isDirectory()) {
    fs.cpSync(sourcePath, targetPath, {
      recursive: true,
      force: overwrite,
      errorOnExist: !overwrite,
    });
    return;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}


function normalizePermissionMode(value: unknown): number {
  const raw = normalizeString(value);
  if (!/^[0-7]{3,4}$/.test(raw)) {
    throw new Error("Permission mode must be an octal value such as 0644 or 0755");
  }
  return Number.parseInt(raw, 8) & 0o7777;
}

function formatPermissionMode(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(4, "0");
}

function collectChmodTargets(target: ResolvedPath, recursive: boolean, limit = Number.POSITIVE_INFINITY): Array<{ relativePath: string; absolutePath: string; kind: FileEntryKind; stat: fs.Stats }> {
  const items: Array<{ relativePath: string; absolutePath: string; kind: FileEntryKind; stat: fs.Stats }> = [];
  const visit = (absolutePath: string, relativePath: string) => {
    if (items.length >= limit) return;
    const stat = fs.statSync(absolutePath);
    const kind: FileEntryKind = stat.isDirectory() ? "directory" : "file";
    items.push({ relativePath, absolutePath, kind, stat });
    if (!recursive || kind !== "directory") return;
    const children = fs.readdirSync(absolutePath, { withFileTypes: true });
    for (const child of children) {
      if (items.length >= limit) return;
      const childAbsolutePath = path.join(absolutePath, child.name);
      const childRelativePath = toPortableRelativePath(path.join(relativePath, child.name));
      visit(childAbsolutePath, childRelativePath);
    }
  };
  visit(target.absolutePath, target.relativePath);
  return items;
}

function createChmodDryRun(config: TracevaneServerConfig, payload: FilesChmodPayload): FilesChmodDryRunResponse {
  const root = resolveRoot(config, payload.rootId);
  const paths = Array.from(new Set((Array.isArray(payload.paths) ? payload.paths : []).map((entry) => normalizeRelativePath(entry)).filter(Boolean)));
  if (!paths.length) throw new Error("At least one path is required");
  const nextModeNumber = normalizePermissionMode(payload.mode);
  const nextMode = formatPermissionMode(nextModeNumber);
  const recursive = payload.recursive === true;
  const items: FilesChmodDryRunResponse["items"] = [];
  let truncated = false;
  for (const entryPath of paths) {
    const target = resolveExistingPath(config, root.id, entryPath, { allowRoot: false });
    const remaining = MAX_CHMOD_DRY_RUN_ENTRIES - items.length;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const targets = collectChmodTargets(target, recursive, remaining);
    if (targets.length >= remaining) truncated = true;
    for (const item of targets) {
      items.push({
        path: item.relativePath,
        kind: item.kind,
        currentMode: fileModeOctal(item.stat),
        nextMode,
      });
    }
  }
  return {
    checkedAt: new Date().toISOString(),
    rootId: root.id,
    mode: nextMode,
    recursive,
    truncated,
    counts: {
      total: items.length,
      files: items.filter((item) => item.kind === "file").length,
      directories: items.filter((item) => item.kind === "directory").length,
    },
    items,
  };
}

function recycleBinDir(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, ".tracevane", GLOBAL_RECYCLE_BIN_DIR_NAME);
}

function recycleMetadataPath(entryDir: string): string {
  return path.join(entryDir, "metadata.json");
}

function recycleDisplayPath(config: TracevaneServerConfig, absolutePath: string): string {
  return toPortableRelativePath(path.relative(recycleBinDir(config), absolutePath));
}

function uniqueRecycleEntryDir(config: TracevaneServerConfig, originalRootId: string, originalRelativePath: string): string {
  const baseName = path.basename(originalRelativePath) || "root";
  const safeRootId = originalRootId.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 40) || "root";
  const safeName = baseName.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "item";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : `-${index}`;
    const candidate = path.join(recycleBinDir(config), `${stamp}-${safeRootId}-${safeName}${suffix}`);
    if (!fs.existsSync(candidate)) return candidate;
    index += 1;
  }
}

function moveEntryToRecycleBin(config: TracevaneServerConfig, target: ResolvedPath): string {
  const trashEntryDir = uniqueRecycleEntryDir(config, target.root.id, target.relativePath);
  fs.mkdirSync(trashEntryDir, { recursive: true });
  const targetTrashPath = path.join(trashEntryDir, path.basename(target.relativePath));
  const stat = fs.statSync(target.absolutePath);
  const metadata = {
    rootId: target.root.id,
    rootAbsolutePath: target.root.absolutePath,
    originalPath: target.relativePath,
    trashPath: recycleDisplayPath(config, targetTrashPath),
    name: path.basename(target.relativePath),
    kind: stat.isDirectory() ? "directory" : "file",
    size: stat.isFile() ? stat.size : null,
    deletedAt: new Date().toISOString(),
  };
  fs.writeFileSync(recycleMetadataPath(trashEntryDir), JSON.stringify(metadata, null, 2), "utf8");
  try {
    moveEntry(target.absolutePath, targetTrashPath, true);
  } catch (error) {
    try {
      fs.rmSync(trashEntryDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for an incomplete recycle-bin entry.
    }
    throw error;
  }
  return metadata.trashPath;
}

function readTrashMetadata(config: TracevaneServerConfig, entryDirName: string): FilesTrashItem | null {
  const entryDir = path.join(recycleBinDir(config), entryDirName);
  const metadataPath = recycleMetadataPath(entryDir);
  try {
    const parsed = JSON.parse(fs.readFileSync(metadataPath, "utf8")) as Partial<FilesTrashItem> & { rootAbsolutePath?: unknown };
    const trashPath = normalizeRelativePath(parsed.trashPath || "");
    if (!trashPath) return null;
    const target = path.resolve(recycleBinDir(config), trashPath);
    if (!isWithinRoot(realPathOf(recycleBinDir(config)), realPathOf(path.dirname(target)))) return null;
    if (!fs.existsSync(target)) return null;
    const stat = fs.statSync(target);
    const root = resolveRoot(config, parsed.rootId);
    return {
      id: entryDirName,
      rootId: root.id,
      originalPath: normalizeRelativePath(parsed.originalPath || ""),
      trashPath,
      name: typeof parsed.name === "string" && parsed.name ? parsed.name : path.basename(trashPath),
      kind: stat.isDirectory() ? "directory" : "file",
      size: stat.isFile() ? stat.size : null,
      deletedAt: typeof parsed.deletedAt === "string" && parsed.deletedAt ? parsed.deletedAt : new Date(stat.mtimeMs).toISOString(),
      metadataPath: recycleDisplayPath(config, metadataPath),
    };
  } catch {
    return null;
  }
}

function listTrashItems(config: TracevaneServerConfig): FilesTrashItem[] {
  const trashDir = recycleBinDir(config);
  if (!fs.existsSync(trashDir)) return [];
  return fs
    .readdirSync(trashDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readTrashMetadata(config, entry.name))
    .filter((entry): entry is FilesTrashItem => Boolean(entry))
    .sort((left, right) => Date.parse(right.deletedAt) - Date.parse(left.deletedAt));
}

function resolveTrashItem(config: TracevaneServerConfig, trashPath: string | undefined): ResolvedPath {
  const normalized = normalizeRelativePath(trashPath);
  if (!normalized) {
    throw new Error("A valid recycle-bin item path is required");
  }
  const trashRoot: FileRootContext = {
    id: "global-trash",
    labelZh: "全局回收站",
    labelEn: "Global trash",
    descriptionZh: "Tracevane 全局回收站。",
    descriptionEn: "Tracevane global recycle bin.",
    absolutePath: recycleBinDir(config),
    realPath: fs.existsSync(recycleBinDir(config)) ? realPathOf(recycleBinDir(config)) : path.resolve(recycleBinDir(config)),
  };
  const absolutePath = path.resolve(trashRoot.absolutePath, normalized);
  if (!fs.existsSync(absolutePath)) {
    throw new Error("Recycle-bin item was not found");
  }
  const realPath = realPathOf(absolutePath);
  if (!isWithinRoot(trashRoot.realPath, realPath)) {
    throw new Error("Recycle-bin item escapes the global recycle bin");
  }
  return { root: trashRoot, relativePath: normalized, absolutePath };
}

function restoreTrashItem(config: TracevaneServerConfig, payload: FilesTrashRestorePayload): FilesMutationResponse {
  const source = resolveTrashItem(config, payload.trashPath);
  const metadata = readTrashMetadata(config, path.basename(path.dirname(source.absolutePath)));
  if (!metadata || metadata.trashPath !== source.relativePath) {
    throw new Error("Recycle-bin metadata was not found for this item");
  }
  const conflictPolicy = normalizeTransferConflictPolicy(payload.conflictPolicy);
  let destination = resolveTargetPath(config, metadata.rootId, metadata.originalPath, { allowRoot: false });
  if (fs.existsSync(destination.absolutePath)) {
    if (conflictPolicy === "skip") {
      return {
        success: true,
        action: "restore-trash",
        message: `Skipped restore for ${metadata.originalPath}`,
        affectedPaths: [source.relativePath],
      };
    }
    if (conflictPolicy === "overwrite") {
      removeEntry(destination.absolutePath);
    } else if (conflictPolicy === "rename") {
      destination = findAvailableUploadTarget(config, metadata.rootId, metadata.originalPath);
    } else {
      throw new Error("Target path already exists");
    }
  }
  fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true });
  moveEntry(source.absolutePath, destination.absolutePath, true);
  const trashEntryDir = path.dirname(source.absolutePath);
  try {
    fs.rmSync(trashEntryDir, { recursive: true, force: true });
  } catch {
    // Metadata cleanup is best-effort after a successful restore.
  }
  return {
    success: true,
    action: "restore-trash",
    message: `Restored ${metadata.name}`,
    affectedPaths: [source.relativePath, destination.relativePath],
  };
}

function removeEntry(targetPath: string): void {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: false });
    return;
  }
  fs.rmSync(targetPath, { force: false });
}

function isPathInsideGlobalRecycleBin(config: TracevaneServerConfig, absolutePath: string): boolean {
  const trashDir = recycleBinDir(config);
  if (!fs.existsSync(trashDir)) return false;
  try {
    return isWithinRoot(realPathOf(trashDir), realPathOf(absolutePath));
  } catch {
    return false;
  }
}

function moveEntry(sourcePath: string, targetPath: string, overwrite = false): void {
  if (!overwrite) ensureNotExists(targetPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.renameSync(sourcePath, targetPath);
  } catch {
    copyEntry(sourcePath, targetPath, overwrite);
    removeEntry(sourcePath);
  }
}

function runPythonZipArchive(
  archivePath: string,
  baseDir: string,
  sourcePaths: string[],
): void {
  execFileSync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import zipfile

archive = pathlib.Path(sys.argv[1])
base_dir = pathlib.Path(sys.argv[2]).resolve()
sources = [pathlib.Path(value).resolve() for value in sys.argv[3:]]

archive.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
    for source in sources:
        try:
            relative = source.relative_to(base_dir)
        except ValueError:
            relative = pathlib.Path(source.name)
        if source.is_dir():
            for nested in source.rglob("*"):
                if not nested.is_file():
                    continue
                try:
                    nested_relative = nested.relative_to(base_dir)
                except ValueError:
                    nested_relative = relative / nested.relative_to(source)
                zf.write(nested, nested_relative.as_posix())
        elif source.is_file():
            zf.write(source, relative.as_posix())
`,
      archivePath,
      baseDir,
      ...sourcePaths,
    ],
    {
      stdio: "ignore",
    },
  );
}

function runPythonTarArchive(
  archivePath: string,
  baseDir: string,
  sourcePaths: string[],
  format: Exclude<ArchiveFormat, "zip">,
): void {
  execFileSync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import tarfile

archive = pathlib.Path(sys.argv[1])
base_dir = pathlib.Path(sys.argv[2]).resolve()
archive_format = sys.argv[3]
sources = [pathlib.Path(value).resolve() for value in sys.argv[4:]]
mode_by_format = {
    "tar": "w",
    "gztar": "w:gz",
    "bztar": "w:bz2",
    "xztar": "w:xz",
}
mode = mode_by_format[archive_format]

archive.parent.mkdir(parents=True, exist_ok=True)
with tarfile.open(archive, mode) as tf:
    for source in sources:
        try:
            relative = source.relative_to(base_dir)
        except ValueError:
            relative = pathlib.Path(source.name)
        tf.add(source, arcname=relative.as_posix(), recursive=True)
`,
      archivePath,
      baseDir,
      format,
      ...sourcePaths,
    ],
    {
      stdio: "ignore",
    },
  );
}

function runArchiveCreate(
  archivePath: string,
  baseDir: string,
  sourcePaths: string[],
  format: ArchiveFormat,
): void {
  if (format === "zip") {
    runPythonZipArchive(archivePath, baseDir, sourcePaths);
    return;
  }
  runPythonTarArchive(archivePath, baseDir, sourcePaths, format);
}

type ExtractConflictPolicy = "fail" | "overwrite" | "skip" | "rename";

function normalizeExtractConflictPolicy(value: unknown): ExtractConflictPolicy {
  return value === "overwrite" || value === "skip" || value === "rename" ? value : "fail";
}

function runPythonZipExtract(archivePath: string, destinationDir: string, conflictPolicy: ExtractConflictPolicy): void {
  execFileSync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import zipfile

archive = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
conflict_policy = sys.argv[3]
destination.mkdir(parents=True, exist_ok=True)

def resolve_conflict(target: pathlib.Path) -> pathlib.Path | None:
    if not target.exists():
        return target
    if conflict_policy == "overwrite":
        return target
    if conflict_policy == "skip":
        return None
    if conflict_policy == "rename":
        parent = target.parent
        stem = target.stem
        suffix = target.suffix
        for index in range(1, 10000):
            candidate = parent / f"{stem} ({index}){suffix}"
            if not candidate.exists():
                return candidate
    raise RuntimeError(f"target already exists: {target.relative_to(destination).as_posix()}")

with zipfile.ZipFile(archive, "r") as zf:
    for member in zf.infolist():
        target = (destination / member.filename).resolve()
        try:
            target.relative_to(destination)
        except ValueError:
            raise RuntimeError(f"unsafe archive entry: {member.filename}")
    for member in zf.infolist():
        target = (destination / member.filename).resolve()
        final_target = resolve_conflict(target)
        if final_target is None:
            continue
        if member.is_dir():
            final_target.mkdir(parents=True, exist_ok=True)
            continue
        final_target.parent.mkdir(parents=True, exist_ok=True)
        with zf.open(member, "r") as source, open(final_target, "wb") as output:
            output.write(source.read())
`,
      archivePath,
      destinationDir,
      conflictPolicy,
    ],
    {
      stdio: "ignore",
    },
  );
}

function runPythonTarExtract(
  archivePath: string,
  destinationDir: string,
  format: Exclude<ArchiveFormat, "zip">,
  conflictPolicy: ExtractConflictPolicy,
): void {
  execFileSync(
    "python3",
    [
      "-c",
      `
import pathlib
import sys
import tarfile

archive = pathlib.Path(sys.argv[1]).resolve()
destination = pathlib.Path(sys.argv[2]).resolve()
archive_format = sys.argv[3]
conflict_policy = sys.argv[4]
mode_by_format = {
    "tar": "r:",
    "gztar": "r:gz",
    "bztar": "r:bz2",
    "xztar": "r:xz",
}
mode = mode_by_format[archive_format]
destination.mkdir(parents=True, exist_ok=True)

def resolve_conflict(target: pathlib.Path) -> pathlib.Path | None:
    if not target.exists():
        return target
    if conflict_policy == "overwrite":
        return target
    if conflict_policy == "skip":
        return None
    if conflict_policy == "rename":
        parent = target.parent
        stem = target.stem
        suffix = target.suffix
        for index in range(1, 10000):
            candidate = parent / f"{stem} ({index}){suffix}"
            if not candidate.exists():
                return candidate
    raise RuntimeError(f"target already exists: {target.relative_to(destination).as_posix()}")

with tarfile.open(archive, mode) as tf:
    members = tf.getmembers()
    for member in members:
        target = (destination / member.name).resolve()
        try:
            target.relative_to(destination)
        except ValueError:
            raise RuntimeError(f"unsafe archive entry: {member.name}")
        if member.issym() or member.islnk() or member.isdev():
            raise RuntimeError(f"unsupported archive entry: {member.name}")
    for member in members:
        target = (destination / member.name).resolve()
        final_target = resolve_conflict(target)
        if final_target is None:
            continue
        if member.isdir():
            final_target.mkdir(parents=True, exist_ok=True)
            continue
        source = tf.extractfile(member)
        if source is None:
            continue
        final_target.parent.mkdir(parents=True, exist_ok=True)
        with source, open(final_target, "wb") as output:
            output.write(source.read())
`,
      archivePath,
      destinationDir,
      format,
      conflictPolicy,
    ],
    {
      stdio: "ignore",
    },
  );
}

function runArchiveExtract(
  archivePath: string,
  destinationDir: string,
  format: ArchiveFormat,
  conflictPolicy: ExtractConflictPolicy,
): void {
  if (format === "zip") {
    runPythonZipExtract(archivePath, destinationDir, conflictPolicy);
    return;
  }
  runPythonTarExtract(archivePath, destinationDir, format, conflictPolicy);
}

interface ArchiveEntryPlan {
  name: string;
  isDirectory: boolean;
  unsupported?: boolean;
}

function listArchiveEntries(archivePath: string, format: ArchiveFormat): ArchiveEntryPlan[] {
  const args = [
      "-c",
      `
import json
import sys
import tarfile
import zipfile

archive = sys.argv[1]
archive_format = sys.argv[2]
if archive_format == "zip":
    with zipfile.ZipFile(archive, "r") as zf:
        entries = [{"name": member.filename, "isDirectory": member.is_dir(), "unsupported": False} for member in zf.infolist()]
else:
    mode_by_format = {
        "tar": "r:",
        "gztar": "r:gz",
        "bztar": "r:bz2",
        "xztar": "r:xz",
    }
    with tarfile.open(archive, mode_by_format[archive_format]) as tf:
        entries = [
            {
                "name": member.name,
                "isDirectory": member.isdir(),
                "unsupported": member.issym() or member.islnk() or member.isdev(),
            }
            for member in tf.getmembers()
        ]
print(json.dumps(entries))
`,
      archivePath,
      format,
    ];
  let output = "";
  try {
    output = execFileSync("python3", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  } catch (error) {
    const maybeOutput = typeof (error as { stdout?: unknown }).stdout === "string"
      ? (error as { stdout: string }).stdout
      : Buffer.isBuffer((error as { stdout?: unknown }).stdout)
        ? ((error as { stdout: Buffer }).stdout).toString("utf8")
        : "";
    if (!maybeOutput) throw error;
    output = maybeOutput;
  }
  const parsed = JSON.parse(output) as ArchiveEntryPlan[];
  return Array.isArray(parsed) ? parsed : [];
}

function createUnarchiveDryRun(
  config: TracevaneServerConfig,
  payload: FilesUnarchivePayload,
): FilesUnarchiveDryRunResponse {
  const archive = resolveExistingPath(config, payload.rootId, payload.archivePath, {
    allowRoot: false,
    kind: "file",
  });
  const archiveFormat = inferArchiveFormat(archive.absolutePath);
  if (!archiveFormat) {
    throw new Error(`Unsupported archive format. Supported formats: ${supportedArchiveFormatLabel()}`);
  }
  const destinationDirectory = resolveExistingPath(
    config,
    payload.rootId,
    payload.destinationDirectoryPath || payload.directoryPath,
    { allowRoot: true, kind: "directory" },
  );
  const conflictPolicy = normalizeExtractConflictPolicy(payload.conflictPolicy);
  const reserved = new Set<string>();
  const items: FilesUnarchiveDryRunResponse["items"] = [];
  const entries = listArchiveEntries(archive.absolutePath, archiveFormat);
  for (const entry of entries) {
    let normalizedEntryPath = "";
    try {
      normalizedEntryPath = normalizeRelativePath(entry.name);
    } catch (error) {
      items.push({
        entryPath: String(entry.name || ""),
        destinationPath: null,
        kind: entry.isDirectory ? "directory" : "file",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
    if (!normalizedEntryPath) continue;
    const destinationAbsolutePath = path.resolve(destinationDirectory.absolutePath, normalizedEntryPath);
    const destinationRelativePath = normalizeRelativePath(path.join(destinationDirectory.relativePath || "", normalizedEntryPath));
    const kind: FileEntryKind = entry.isDirectory ? "directory" : "file";
    if (entry.unsupported) {
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: destinationRelativePath,
        kind,
        status: "error",
        message: "归档条目类型不受支持。",
      });
      continue;
    }
    if (!isWithinRoot(destinationDirectory.absolutePath, destinationAbsolutePath) && !samePath(destinationDirectory.absolutePath, destinationAbsolutePath)) {
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: null,
        kind,
        status: "error",
        message: "归档条目会逃逸目标目录。",
      });
      continue;
    }
    if (!fs.existsSync(destinationAbsolutePath) && !reserved.has(destinationRelativePath)) {
      reserved.add(destinationRelativePath);
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: destinationRelativePath,
        kind,
        status: "ready",
      });
      continue;
    }
    if (conflictPolicy === "overwrite") {
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: destinationRelativePath,
        kind,
        status: "overwrite",
        message: "目标已存在，将覆盖。",
      });
      continue;
    }
    if (conflictPolicy === "skip") {
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: destinationRelativePath,
        kind,
        status: "skip",
        message: "目标已存在，将跳过。",
      });
      continue;
    }
    if (conflictPolicy === "rename") {
      const renamed = findAvailableTransferName(path.posix.basename(normalizedEntryPath), new Set([...reserved, ...Array.from(new Set(fs.existsSync(path.dirname(destinationAbsolutePath)) ? fs.readdirSync(path.dirname(destinationAbsolutePath)) : []))]));
      const renamedRelative = normalizeRelativePath(path.join(path.posix.dirname(destinationRelativePath), renamed));
      reserved.add(renamedRelative);
      items.push({
        entryPath: normalizedEntryPath,
        destinationPath: renamedRelative,
        kind,
        status: "rename",
        message: `目标已存在，将保留两者为 ${renamed}。`,
      });
      continue;
    }
    items.push({
      entryPath: normalizedEntryPath,
      destinationPath: destinationRelativePath,
      kind,
      status: "conflict",
      message: "目标已存在，需要修改冲突策略。",
    });
  }
  const counts = {
    total: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    conflicts: items.filter((item) => item.status === "conflict").length,
    overwrite: items.filter((item) => item.status === "overwrite").length,
    skip: items.filter((item) => item.status === "skip").length,
    rename: items.filter((item) => item.status === "rename").length,
    errors: items.filter((item) => item.status === "error").length,
  };
  return {
    checkedAt: new Date().toISOString(),
    rootId: archive.root.id,
    archivePath: archive.relativePath,
    destinationDirectoryPath: destinationDirectory.relativePath,
    conflictPolicy,
    counts,
    items,
  };
}


interface StoredFileVersionMeta {
  id: string;
  rootId: string;
  path: string;
  name: string;
  size: number;
  createdAt: string;
  sourceModifiedAt: string | null;
  contentFile: string;
}

function versionsRootDir(config: TracevaneServerConfig): string {
  return path.join(config.openclawRoot, ".tracevane", FILE_VERSION_DIR_NAME);
}

function versionFileKey(rootId: string, relativePath: string): string {
  return createHash("sha256").update(`${rootId}\n${relativePath}`).digest("hex");
}

function versionDirectory(config: TracevaneServerConfig, rootId: string, relativePath: string): string {
  return path.join(versionsRootDir(config), safeIndexName(rootId), versionFileKey(rootId, relativePath));
}

function safeVersionId(value: unknown): string {
  const id = normalizeString(value);
  if (!/^[a-zA-Z0-9_.:-]{8,120}$/.test(id)) throw new Error("Invalid file version id");
  return id;
}

function versionMetaPath(config: TracevaneServerConfig, rootId: string, relativePath: string, versionId: string): string {
  return path.join(versionDirectory(config, rootId, relativePath), safeVersionId(versionId), "metadata.json");
}

function readStoredVersionMeta(metaPath: string): StoredFileVersionMeta | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, "utf8")) as StoredFileVersionMeta;
    if (!parsed?.id || !parsed.contentFile) return null;
    return parsed;
  } catch {
    return null;
  }
}

function metaToVersionItem(meta: StoredFileVersionMeta): FilesVersionItem {
  return {
    id: meta.id,
    rootId: meta.rootId,
    path: meta.path,
    name: meta.name,
    size: meta.size,
    createdAt: meta.createdAt,
    sourceModifiedAt: meta.sourceModifiedAt,
  };
}

function listFileVersionMetas(config: TracevaneServerConfig, rootId: string, relativePath: string): StoredFileVersionMeta[] {
  const dir = versionDirectory(config, rootId, relativePath);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => readStoredVersionMeta(path.join(dir, dirent.name, "metadata.json")))
    .filter((meta): meta is StoredFileVersionMeta => Boolean(meta))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function pruneFileVersions(config: TracevaneServerConfig, rootId: string, relativePath: string): void {
  const metas = listFileVersionMetas(config, rootId, relativePath);
  for (const meta of metas.slice(MAX_FILE_VERSIONS_PER_FILE)) {
    fs.rmSync(path.dirname(versionMetaPath(config, rootId, relativePath, meta.id)), { recursive: true, force: true });
  }
}

function createFileVersion(config: TracevaneServerConfig, target: ResolvedPath): FilesVersionItem | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target.absolutePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_FILE_VERSION_BYTES) return null;
  const sample = readBufferSlice(target.absolutePath, Math.min(1024, stat.size));
  if (!isTextLike(target.absolutePath, sample)) return null;
  const id = `${Date.now()}-${createHash("sha1").update(`${target.root.id}:${target.relativePath}:${stat.mtimeMs}`).digest("hex").slice(0, 12)}`;
  const dir = path.join(versionDirectory(config, target.root.id, target.relativePath), id);
  const contentFile = "content.txt";
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(target.absolutePath, path.join(dir, contentFile));
  const meta: StoredFileVersionMeta = {
    id,
    rootId: target.root.id,
    path: target.relativePath,
    name: path.basename(target.absolutePath),
    size: stat.size,
    createdAt: new Date().toISOString(),
    sourceModifiedAt: toIsoTime(stat),
    contentFile,
  };
  fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify(meta, null, 2), "utf8");
  pruneFileVersions(config, target.root.id, target.relativePath);
  return metaToVersionItem(meta);
}

function readFileVersionMeta(config: TracevaneServerConfig, rootId: string, relativePath: string, versionId: string): StoredFileVersionMeta {
  const meta = readStoredVersionMeta(versionMetaPath(config, rootId, relativePath, versionId));
  if (!meta || meta.rootId !== rootId || meta.path !== relativePath) throw new Error("Requested file version was not found");
  return meta;
}

function readFileVersionContent(config: TracevaneServerConfig, meta: StoredFileVersionMeta): string {
  const contentPath = path.join(versionDirectory(config, meta.rootId, meta.path), meta.id, meta.contentFile);
  const real = realPathOf(contentPath);
  const dirReal = realPathOf(versionDirectory(config, meta.rootId, meta.path));
  if (!isWithinRoot(dirReal, real)) throw new Error("Stored file version escapes version storage");
  return fs.readFileSync(contentPath, "utf8");
}


export function createFilesService(config: TracevaneServerConfig): FilesService {
  return {
    getSummary(): FilesSummaryPayload {
      const roots = buildRootContexts(config);
      if (!roots.length) {
        throw new Error("No file roots are available");
      }
      const defaultRoot = roots.find((root) => root.preferred) || roots[0];
      return {
        checkedAt: new Date().toISOString(),
        roots: roots.map(({ realPath, ...root }) => root),
        defaultRootId: defaultRoot.id,
      };
    },

    listDirectory(
      rootId: string,
      directoryPath = "",
      showHidden = true,
      options: DirectoryListOptions = {},
    ): FilesDirectoryPayload {
      const resolved = resolveExistingPath(config, rootId, directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const sortKey = normalizeDirectorySortKey(options.sortKey);
      const sortDirection = normalizeDirectorySortDirection(options.sortDirection);
      const pageSize = normalizeDirectoryPageSize(options.pageSize);
      const entries: FileEntrySummary[] = [];
      let hiddenCount = 0;
      for (const dirent of fs.readdirSync(resolved.absolutePath, { withFileTypes: true })) {
        const hidden = dirent.name.startsWith(".");
        if (hidden) hiddenCount += 1;
        if (hidden && !showHidden) continue;
        const summary = summarizeEntry(resolved.absolutePath, resolved.relativePath, dirent, showHidden);
        if (summary) entries.push(summary);
      }
      const sorted = sortEntries(entries, sortKey, sortDirection);
      const totalEntries = sorted.length;
      let directoryCount = 0;
      let fileCount = 0;
      for (const entry of sorted) {
        if (entry.kind === "directory") directoryCount += 1;
        else fileCount += 1;
      }
      const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));
      const page = Math.min(normalizeDirectoryPage(options.page), totalPages);
      const startIndex = Math.min(totalEntries, (page - 1) * pageSize);
      const endIndex = Math.min(totalEntries, startIndex + pageSize);
      const pagedEntries = sorted.slice(startIndex, endIndex);
      return {
        checkedAt: new Date().toISOString(),
        rootId: resolved.root.id,
        root: {
          id: resolved.root.id,
          labelZh: resolved.root.labelZh,
          labelEn: resolved.root.labelEn,
          descriptionZh: resolved.root.descriptionZh,
          descriptionEn: resolved.root.descriptionEn,
          absolutePath: resolved.root.absolutePath,
          preferred: resolved.root.preferred,
        },
        directoryPath: resolved.relativePath,
        absolutePath: resolved.absolutePath,
        parentPath: resolved.relativePath
          ? toPortableRelativePath(path.dirname(resolved.relativePath))
          : null,
        breadcrumbs: buildBreadcrumbs(resolved.relativePath, resolved.root),
        counts: {
          directories: directoryCount,
          files: fileCount,
          hidden: hiddenCount,
          total: totalEntries,
        },
        pagination: {
          page,
          pageSize,
          totalPages,
          totalEntries,
          startIndex,
          endIndex,
        },
        entries: pagedEntries,
      };
    },

    listTree(rootId: string, directoryPath = "", showHidden = true): FilesTreePayload {
      const resolved = resolveExistingPath(config, rootId, directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const entries: FileEntrySummary[] = [];
      for (const dirent of fs.readdirSync(resolved.absolutePath, { withFileTypes: true })) {
        if (!showHidden && dirent.name.startsWith(".")) continue;
        const summary = summarizeEntry(resolved.absolutePath, resolved.relativePath, dirent, showHidden);
        if (summary) entries.push(summary);
      }
      const children: FileTreeNodePayload[] = sortEntries(entries)
        .filter((entry) => entry.kind === "directory")
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
        }));
      return {
        checkedAt: new Date().toISOString(),
        rootId: resolved.root.id,
        directoryPath: resolved.relativePath,
        children,
      };
    },

    readFile(rootId: string, filePath: string, options: { offset?: number; limit?: number } = {}): FilesReadPayload {
      const resolved = resolveExistingPath(config, rootId, filePath, {
        allowRoot: false,
        kind: "file",
      });
      const stat = fs.statSync(resolved.absolutePath);
      const initialSample = readBufferSlice(resolved.absolutePath, 1024);
      const textLike = isTextLike(resolved.absolutePath, initialSample);
      const offset = textLike ? clampReadOffset(options.offset, stat.size) : 0;
      const readLimitBytes = clampReadLimit(options.limit);
      const editable = textLike && offset === 0 && stat.size <= MAX_TEXT_FILE_BYTES;
      const maxBytes = textLike ? Math.min(readLimitBytes, Math.max(0, stat.size - offset)) : 0;
      const content =
        textLike
          ? readBufferSlice(resolved.absolutePath, maxBytes, offset).toString("utf8")
          : null;
      return {
        checkedAt: new Date().toISOString(),
        rootId: resolved.root.id,
        path: resolved.relativePath,
        absolutePath: resolved.absolutePath,
        name: path.basename(resolved.absolutePath),
        ext: path.extname(resolved.absolutePath).toLowerCase() || null,
        size: stat.size,
        modifiedAt: toIsoTime(stat),
        mimeType: guessMimeType(resolved.absolutePath),
        textLike,
        imageLike: isImageLike(resolved.absolutePath),
        editable,
        truncated: textLike && (offset > 0 || offset + maxBytes < stat.size),
        contentOffset: offset,
        contentBytes: maxBytes,
        readLimitBytes,
        content,
        mode: fileModeOctal(stat),
        permissions: filePermissionsSymbolic(stat, "file"),
        uid: statNumericOwner(stat, "uid"),
        gid: statNumericOwner(stat, "gid"),
      };
    },

    search(
      rootId: string,
      directoryPath = "",
      query: string,
      recursive = true,
      showHidden = true,
      options: FileSearchOptions = {},
    ): FilesSearchPayload {
      const resolved = resolveExistingPath(config, rootId, directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const normalizedQuery = normalizeString(query);
      const searchOptions: Required<FileSearchOptions> = {
        caseSensitive: Boolean(options.caseSensitive),
        regex: Boolean(options.regex),
        limit: clampSearchLimit(options.limit),
      };
      const searchLimit = searchOptions.limit;
      if (!normalizedQuery) {
        return {
          checkedAt: new Date().toISOString(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          query: "",
          recursive,
          caseSensitive: searchOptions.caseSensitive,
          regex: searchOptions.regex,
          index: { used: false, candidateCount: 0, resultCount: 0 },
          limit: searchLimit,
          truncated: false,
          results: [],
        };
      }
      const queryError = validateSearchQuery(normalizedQuery, searchOptions);
      if (queryError) {
        return {
          checkedAt: new Date().toISOString(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          query: normalizedQuery,
          recursive,
          caseSensitive: searchOptions.caseSensitive,
          regex: searchOptions.regex,
          error: queryError,
          index: { used: false, candidateCount: 0, resultCount: 0 },
          limit: searchLimit,
          truncated: false,
          results: [],
        };
      }

      const queue: Array<{ absolutePath: string; relativePath: string }> = [
        {
          absolutePath: resolved.absolutePath,
          relativePath: resolved.relativePath,
        },
      ];
      const visited = new Set<string>();
      const seenPaths = new Set<string>();
      const results: FilesSearchPayload["results"] = [];
      const indexed = searchOptions.regex
        ? { candidateCount: 0, results: [] }
        : searchContentIndex(
            config,
            resolved.root.id,
            resolved.relativePath,
            normalizedQuery,
            searchOptions,
            recursive,
            showHidden,
            seenPaths,
            searchLimit,
          );
      results.push(...indexed.results);

      while (queue.length && results.length < searchLimit) {
        const current = queue.shift();
        if (!current) break;
        let currentRealPath = "";
        try {
          currentRealPath = realPathOf(current.absolutePath);
        } catch {
          continue;
        }
        if (visited.has(currentRealPath)) continue;
        visited.add(currentRealPath);
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(current.absolutePath, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const dirent of entries) {
          if (!showHidden && dirent.name.startsWith(".")) continue;
          const summary = summarizeEntry(
            current.absolutePath,
            current.relativePath,
            dirent,
            showHidden,
          );
          if (!summary) continue;
          const nameMatches = matchesSearch(summary.name, normalizedQuery, searchOptions);
          const contentSnippet =
            !nameMatches && summary.kind === "file"
              ? findContentSearchSnippet(path.join(current.absolutePath, dirent.name), normalizedQuery, searchOptions)
              : null;
          if (nameMatches || contentSnippet) {
            if (seenPaths.has(summary.path)) {
              if (recursive && summary.kind === "directory") {
                queue.push({
                  absolutePath: path.join(current.absolutePath, dirent.name),
                  relativePath: summary.path,
                });
              }
              continue;
            }
            seenPaths.add(summary.path);
            results.push({
              ...summary,
              directoryPath: current.relativePath,
              matchKind: nameMatches ? "name" : "content",
              snippet: contentSnippet,
            });
            if (results.length >= searchLimit) break;
          }
          if (recursive && summary.kind === "directory") {
            queue.push({
              absolutePath: path.join(current.absolutePath, dirent.name),
              relativePath: summary.path,
            });
          }
        }
        if (!recursive) break;
      }

      return {
        checkedAt: new Date().toISOString(),
        rootId: resolved.root.id,
        directoryPath: resolved.relativePath,
        query: normalizedQuery,
        recursive,
        caseSensitive: searchOptions.caseSensitive,
        regex: searchOptions.regex,
        index: {
          used: indexed.candidateCount > 0,
          candidateCount: indexed.candidateCount,
          resultCount: indexed.results.length,
        },
        limit: searchLimit,
        truncated: results.length >= searchLimit,
        results: sortEntries(results),
      };
    },

    createDirectory(payload: FilesCreateDirectoryPayload): FilesMutationResponse {
      const parent = resolveExistingPath(config, payload.rootId, payload.directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const name = ensureSafeName(payload.name);
      const target = resolveTargetPath(
        config,
        payload.rootId,
        path.join(parent.relativePath || "", name),
        { allowRoot: false },
      );
      ensureNotExists(target.absolutePath);
      fs.mkdirSync(target.absolutePath, { recursive: false });
      return {
        success: true,
        action: "create-directory",
        message: `Created directory ${name}`,
        affectedPaths: [target.relativePath],
      };
    },

    createFile(payload: FilesCreateFilePayload): FilesMutationResponse {
      const parent = resolveExistingPath(config, payload.rootId, payload.directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const name = ensureSafeName(payload.name);
      const target = resolveTargetPath(
        config,
        payload.rootId,
        path.join(parent.relativePath || "", name),
        { allowRoot: false },
      );
      if (!payload.overwrite) ensureNotExists(target.absolutePath);
      fs.writeFileSync(target.absolutePath, payload.content || "", "utf8");
      return {
        success: true,
        action: "create-file",
        message: `Created file ${name}`,
        affectedPaths: [target.relativePath],
      };
    },

    writeFile(payload: FilesWritePayload): FilesMutationResponse {
      const target = resolveExistingPath(config, payload.rootId, payload.path, {
        allowRoot: false,
        kind: "file",
      });
      try {
        createFileVersion(config, target);
      } catch {
        // Version history must never block the primary save path.
      }
      fs.writeFileSync(target.absolutePath, payload.content || "", "utf8");
      return {
        success: true,
        action: "write",
        message: `Saved ${path.basename(target.absolutePath)}`,
        affectedPaths: [target.relativePath],
      };
    },

    listVersions(rootId: string, filePath: string): FilesVersionsPayload {
      const target = resolveExistingPath(config, rootId, filePath, { allowRoot: false, kind: "file" });
      return {
        checkedAt: new Date().toISOString(),
        rootId: target.root.id,
        path: target.relativePath,
        versions: listFileVersionMetas(config, target.root.id, target.relativePath).map(metaToVersionItem),
      };
    },

    readVersion(rootId: string, filePath: string, versionId: string): FilesVersionReadPayload {
      const target = resolveExistingPath(config, rootId, filePath, { allowRoot: false, kind: "file" });
      const meta = readFileVersionMeta(config, target.root.id, target.relativePath, versionId);
      return {
        ...metaToVersionItem(meta),
        content: readFileVersionContent(config, meta),
      };
    },

    restoreVersion(payload: FilesVersionRestorePayload): FilesMutationResponse {
      const target = resolveExistingPath(config, payload.rootId, payload.path, { allowRoot: false, kind: "file" });
      const meta = readFileVersionMeta(config, target.root.id, target.relativePath, payload.versionId);
      try {
        createFileVersion(config, target);
      } catch {
        // Restoring a chosen version is more important than capturing the current file snapshot.
      }
      fs.writeFileSync(target.absolutePath, readFileVersionContent(config, meta), "utf8");
      return {
        success: true,
        action: "restore-version",
        message: `Restored ${path.basename(target.absolutePath)} from version ${meta.id}`,
        affectedPaths: [target.relativePath],
      };
    },

    deleteVersion(payload: FilesVersionDeletePayload): FilesMutationResponse {
      const target = resolveExistingPath(config, payload.rootId, payload.path, { allowRoot: false, kind: "file" });
      const versionId = safeVersionId(payload.versionId);
      const meta = readFileVersionMeta(config, target.root.id, target.relativePath, versionId);
      fs.rmSync(path.dirname(versionMetaPath(config, target.root.id, target.relativePath, meta.id)), { recursive: true, force: true });
      return {
        success: true,
        action: "delete-version",
        message: `Deleted version ${meta.id}`,
        affectedPaths: [target.relativePath],
      };
    },

    renamePath(payload: FilesRenamePayload): FilesMutationResponse {
      const source = resolveExistingPath(config, payload.rootId, payload.path, {
        allowRoot: false,
      });
      const nextName = ensureSafeName(payload.nextName);
      const nextRelativePath = toPortableRelativePath(
        path.join(path.dirname(source.relativePath || "."), nextName),
      ).replace(/^\.\//, "");
      const destination = resolveTargetPath(config, payload.rootId, nextRelativePath, {
        allowRoot: false,
      });
      if (samePath(source.absolutePath, destination.absolutePath)) {
        return {
          success: true,
          action: "rename",
          message: "Nothing changed",
          affectedPaths: [source.relativePath],
        };
      }
      ensureNotExists(destination.absolutePath);
      fs.renameSync(source.absolutePath, destination.absolutePath);
      return {
        success: true,
        action: "rename",
        message: `Renamed to ${nextName}`,
        affectedPaths: [source.relativePath, destination.relativePath],
      };
    },

    dryRunChmod(payload: FilesChmodPayload): FilesChmodDryRunResponse {
      return createChmodDryRun(config, payload);
    },

    chmodPaths(payload: FilesChmodPayload): FilesMutationResponse {
      const preview = createChmodDryRun(config, payload);
      const nextMode = normalizePermissionMode(payload.mode);
      for (const item of preview.items) {
        const target = resolveExistingPath(config, preview.rootId, item.path, { allowRoot: false });
        fs.chmodSync(target.absolutePath, nextMode);
      }
      return {
        success: true,
        action: "chmod",
        message: `Changed permissions for ${preview.counts.total} item(s) to ${preview.mode}`,
        affectedPaths: preview.items.map((item) => item.path),
      };
    },

    dryRunTransfer(payload: FilesTransferDryRunPayload): FilesTransferDryRunResponse {
      return createTransferDryRun(config, payload);
    },

    transferPaths(payload: FilesTransferDryRunPayload): FilesMutationResponse {
      return executeTransfer(config, payload);
    },

    copyPath(payload: FilesTransferPayload): FilesMutationResponse {
      const source = resolveExistingPath(config, payload.sourceRootId, payload.sourcePath, {
        allowRoot: false,
      });
      const sourceName = path.basename(source.absolutePath);
      const destinationDirectory = resolveExistingPath(
        config,
        payload.destinationRootId,
        payload.destinationDirectoryPath,
        { allowRoot: true, kind: "directory" },
      );
      const nextName = payload.nextName ? ensureSafeName(payload.nextName) : sourceName;
      const destination = resolveTargetPath(
        config,
        payload.destinationRootId,
        path.join(destinationDirectory.relativePath || "", nextName),
        { allowRoot: false },
      );
      copyEntry(source.absolutePath, destination.absolutePath, payload.overwrite === true);
      return {
        success: true,
        action: "copy",
        message: `Copied ${sourceName}`,
        affectedPaths: [source.relativePath, destination.relativePath],
      };
    },

    movePath(payload: FilesTransferPayload): FilesMutationResponse {
      const source = resolveExistingPath(config, payload.sourceRootId, payload.sourcePath, {
        allowRoot: false,
      });
      const sourceName = path.basename(source.absolutePath);
      const destinationDirectory = resolveExistingPath(
        config,
        payload.destinationRootId,
        payload.destinationDirectoryPath,
        { allowRoot: true, kind: "directory" },
      );
      const nextName = payload.nextName ? ensureSafeName(payload.nextName) : sourceName;
      const destination = resolveTargetPath(
        config,
        payload.destinationRootId,
        path.join(destinationDirectory.relativePath || "", nextName),
        { allowRoot: false },
      );
      moveEntry(source.absolutePath, destination.absolutePath, payload.overwrite === true);
      return {
        success: true,
        action: "move",
        message: `Moved ${sourceName}`,
        affectedPaths: [source.relativePath, destination.relativePath],
      };
    },

    deletePaths(payload: FilesDeletePayload): FilesMutationResponse {
      const normalizedPaths = Array.from(
        new Set((Array.isArray(payload.paths) ? payload.paths : []).map((entry) => normalizeRelativePath(entry)).filter(Boolean)),
      );
      if (!normalizedPaths.length) {
        throw new Error("At least one path is required");
      }
      const affectedPaths: string[] = [];
      const permanent = payload.permanent === true;
      for (const entryPath of normalizedPaths) {
        const target = resolveExistingPath(config, payload.rootId, entryPath, {
          allowRoot: false,
        });
        if (permanent || isPathInsideGlobalRecycleBin(config, target.absolutePath)) {
          removeEntry(target.absolutePath);
          affectedPaths.push(target.relativePath);
        } else {
          affectedPaths.push(target.relativePath, moveEntryToRecycleBin(config, target));
        }
      }
      return {
        success: true,
        action: "delete",
        message: permanent ? `Permanently deleted ${normalizedPaths.length} item(s)` : `Moved ${normalizedPaths.length} item(s) to recycle bin`,
        affectedPaths,
      };
    },



    listTrash(_rootId: string): FilesTrashPayload {
      return {
        checkedAt: new Date().toISOString(),
        rootId: GLOBAL_CONTENT_INDEX_ROOT_ID,
        scope: "global",
        trashDirectoryPath: GLOBAL_RECYCLE_BIN_RELATIVE_PATH,
        items: listTrashItems(config),
      };
    },

    restoreTrash(payload: FilesTrashRestorePayload): FilesMutationResponse {
      return restoreTrashItem(config, payload);
    },

    purgeTrash(payload: FilesTrashPurgePayload): FilesMutationResponse {
      if (payload.rootId && !isGlobalContentIndexRoot(payload.rootId)) resolveRoot(config, payload.rootId);
      const requested = Array.isArray(payload.trashPaths) ? payload.trashPaths.map((entry) => normalizeRelativePath(entry)).filter(Boolean) : [];
      const trashPaths = requested.length ? requested : listTrashItems(config).map((item) => item.trashPath);
      if (!trashPaths.length) {
        return { success: true, action: "purge-trash", message: "Recycle bin is already empty", affectedPaths: [] };
      }
      const affectedPaths: string[] = [];
      for (const trashPath of trashPaths) {
        const target = resolveTrashItem(config, trashPath);
        const trashEntryDir = path.dirname(target.absolutePath);
        fs.rmSync(trashEntryDir, { recursive: true, force: true });
        affectedPaths.push(target.relativePath);
      }
      return {
        success: true,
        action: "purge-trash",
        message: `Permanently removed ${affectedPaths.length} recycle-bin item(s)`,
        affectedPaths,
      };
    },

    uploadFiles(payload: FilesUploadPayload): FilesMutationResponse {
      const targetDirectory = resolveExistingPath(config, payload.rootId, payload.directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (!files.length) {
        throw new Error("At least one file is required for upload");
      }
      const affectedPaths: string[] = [];
      for (const item of files) {
        const uploadRelativePath = ensureSafeUploadRelativePath(item.relativePath, item.fileName);
        const buffer = decodeUploadFile(item);
        const destination = resolveTargetPath(
          config,
          payload.rootId,
          path.join(targetDirectory.relativePath || "", uploadRelativePath),
          { allowRoot: false },
        );
        if (!item.overwrite) ensureNotExists(destination.absolutePath);
        fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true });
        fs.writeFileSync(destination.absolutePath, buffer);
        affectedPaths.push(destination.relativePath);
      }
      return {
        success: true,
        action: "upload",
        message: `Uploaded ${affectedPaths.length} file(s)`,
        affectedPaths,
      };
    },

    initUpload(payload: FilesUploadInitPayload): FilesUploadInitResponse {
      sweepStaleUploads();
      const targetDirectory = resolveExistingPath(config, payload.rootId, payload.directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const uploadRelativePath = ensureSafeUploadRelativePath(payload.relativePath, payload.fileName);
      const initialRelativePath = toPortableRelativePath(path.join(targetDirectory.relativePath || "", uploadRelativePath));
      const initialDestination = resolveTargetPath(
        config,
        payload.rootId,
        initialRelativePath,
        { allowRoot: false },
      );
      const conflictPolicy = normalizeUploadConflictPolicy(payload);
      const size = Math.max(0, Math.floor(Number(payload.size) || 0));
      const sha256 = normalizeSha256(payload.sha256);
      let destination = initialDestination;
      if (fs.existsSync(initialDestination.absolutePath)) {
        const stat = fs.statSync(initialDestination.absolutePath);
        const sameContent = Boolean(sha256 && stat.isFile() && stat.size === size && sha256File(initialDestination.absolutePath) === sha256);
        if (conflictPolicy === "fail") ensureNotExists(initialDestination.absolutePath);
        if (sameContent && conflictPolicy === "overwrite") {
          return instantCopyResponse(config, payload.rootId, initialDestination.absolutePath, initialDestination, conflictPolicy, size, sha256);
        }
        if (conflictPolicy === "skip") {
          return {
            uploadId: `skipped-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
            chunkSize: 0,
            chunkCount: 0,
            uploadedChunks: [],
            targetPath: initialDestination.relativePath,
            skipped: true,
            conflictPolicy,
          };
        }
        if (conflictPolicy === "rename") {
          destination = findAvailableUploadTarget(config, payload.rootId, initialRelativePath);
          if (sameContent) {
            return instantCopyResponse(config, payload.rootId, initialDestination.absolutePath, destination, conflictPolicy, size, sha256);
          }
        }
      }
      const indexedSource = lookupContentIndex(config, payload.rootId, size, sha256, destination.absolutePath);
      if (indexedSource) return instantCopyResponse(config, payload.rootId, indexedSource, destination, conflictPolicy, size, sha256);
      const reusableSource = findSameHashFileInRoot(config, payload.rootId, size, sha256, destination.absolutePath);
      if (reusableSource) return instantCopyResponse(config, payload.rootId, reusableSource, destination, conflictPolicy, size, sha256);
      const chunkSize = Math.min(16 * 1024 * 1024, Math.max(256 * 1024, Math.floor(Number(payload.chunkSize) || 2 * 1024 * 1024)));
      const chunkCount = Math.ceil(size / chunkSize);
      const uploadId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
      const manifest: UploadManifest = {
        uploadId,
        rootId: payload.rootId,
        targetRelativePath: destination.relativePath,
        fileName: ensureSafeName(payload.fileName),
        size,
        chunkSize,
        chunkCount,
        overwrite: conflictPolicy === "overwrite",
        conflictPolicy,
        sha256,
        createdAt: new Date().toISOString(),
      };
      writeUploadManifest(manifest);
      return uploadInitResponse(manifest);
    },

    getUpload(uploadId: string): FilesUploadInitResponse {
      sweepStaleUploads();
      return uploadInitResponse(readUploadManifest(uploadId));
    },

    writeUploadChunk(uploadId: string, chunkIndex: number, data: Buffer): FilesUploadInitResponse {
      sweepStaleUploads();
      const manifest = readUploadManifest(uploadId);
      if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= manifest.chunkCount) {
        throw new Error("Invalid chunk index");
      }
      const expectedSize = chunkIndex === manifest.chunkCount - 1
        ? manifest.size - (manifest.chunkSize * chunkIndex)
        : manifest.chunkSize;
      if (manifest.size > 0 && data.byteLength !== expectedSize) {
        throw new Error("Unexpected chunk size");
      }
      fs.mkdirSync(uploadDir(uploadId), { recursive: true });
      fs.writeFileSync(chunkPath(uploadId, chunkIndex), data);
      return uploadInitResponse(manifest);
    },

    completeUpload(payload: FilesUploadCompletePayload): FilesMutationResponse {
      const manifest = readUploadManifest(payload.uploadId);
      const destination = resolveTargetPath(config, manifest.rootId, manifest.targetRelativePath, {
        allowRoot: false,
      });
      if (!manifest.overwrite) ensureNotExists(destination.absolutePath);
      const uploaded = uploadedChunksFor(manifest.uploadId, manifest.chunkCount);
      if (uploaded.length !== manifest.chunkCount) throw new Error("Upload is missing chunks");
      fs.mkdirSync(path.dirname(destination.absolutePath), { recursive: true });
      const tempPath = `${destination.absolutePath}.uploading-${manifest.uploadId}`;
      const out = fs.openSync(tempPath, "w");
      try {
        for (let index = 0; index < manifest.chunkCount; index += 1) {
          const data = fs.readFileSync(chunkPath(manifest.uploadId, index));
          fs.writeSync(out, data);
        }
      } finally {
        fs.closeSync(out);
      }
      if (fs.statSync(tempPath).size !== manifest.size) {
        fs.rmSync(tempPath, { force: true });
        throw new Error("Completed upload size mismatch");
      }
      fs.renameSync(tempPath, destination.absolutePath);
      recordContentIndex(config, manifest.rootId, destination.relativePath, manifest.size, manifest.sha256);
      fs.rmSync(uploadDir(manifest.uploadId), { recursive: true, force: true });
      return {
        success: true,
        action: "upload",
        message: `Uploaded ${manifest.fileName}`,
        affectedPaths: [destination.relativePath],
      };
    },

    cancelUpload(payload: FilesUploadCancelPayload): FilesMutationResponse {
      const uploadId = safeUploadId(payload.uploadId);
      fs.rmSync(uploadDir(uploadId), { recursive: true, force: true });
      return {
        success: true,
        action: "upload",
        message: "Upload canceled",
        affectedPaths: [],
      };
    },

    dryRunArchive(payload: FilesArchivePayload): FilesArchiveDryRunResponse {
      return createArchiveDryRun(config, payload);
    },

    archivePaths(payload: FilesArchivePayload): FilesMutationResponse {
      const preview = createArchiveDryRun(config, payload);
      if (preview.destinationExists || preview.counts.errors) {
        throw new Error("Archive target already exists or sources are invalid; run dry-run and choose a different archive name before executing");
      }
      const normalizedPaths = Array.from(
        new Set(
          (Array.isArray(payload.paths) ? payload.paths : [])
            .map((entry) => normalizeRelativePath(entry))
            .filter(Boolean),
        ),
      );
      if (!normalizedPaths.length) {
        throw new Error("At least one path is required to archive");
      }
      const workingDirectory = resolveExistingPath(
        config,
        payload.rootId,
        payload.directoryPath,
        { allowRoot: true, kind: "directory" },
      );
      const sources = normalizedPaths.map((entryPath) =>
        resolveExistingPath(config, payload.rootId, entryPath, {
          allowRoot: false,
        }),
      );
      const archiveName = ensureArchiveName(payload.name);
      const archiveFormat = inferArchiveFormat(archiveName);
      if (!archiveFormat) {
        throw new Error(`Unsupported archive format. Supported formats: ${supportedArchiveFormatLabel()}`);
      }
      const destination = resolveTargetPath(
        config,
        payload.rootId,
        path.join(workingDirectory.relativePath || "", archiveName),
        { allowRoot: false },
      );
      ensureNotExists(destination.absolutePath);
      runArchiveCreate(
        destination.absolutePath,
        workingDirectory.absolutePath,
        sources.map((entry) => entry.absolutePath),
        archiveFormat,
      );
      return {
        success: true,
        action: "archive",
        message: `Archived ${normalizedPaths.length} item(s)`,
        affectedPaths: [...normalizedPaths, destination.relativePath],
      };
    },

    dryRunUnarchive(payload: FilesUnarchivePayload): FilesUnarchiveDryRunResponse {
      return createUnarchiveDryRun(config, payload);
    },

    unarchiveFile(payload: FilesUnarchivePayload): FilesMutationResponse {
      const preview = createUnarchiveDryRun(config, payload);
      if (preview.counts.conflicts || preview.counts.errors) {
        throw new Error("Archive extraction has unresolved conflicts or unsafe entries; run dry-run and choose a safe conflict policy before executing");
      }
      if (preview.counts.overwrite && payload.overwriteConfirm !== "OVERWRITE") {
        throw new Error("Archive extraction overwrite requires explicit OVERWRITE confirmation");
      }
      const archive = resolveExistingPath(config, payload.rootId, payload.archivePath, {
        allowRoot: false,
        kind: "file",
      });
      const archiveFormat = inferArchiveFormat(archive.absolutePath);
      if (!archiveFormat) {
        throw new Error(`Unsupported archive format. Supported formats: ${supportedArchiveFormatLabel()}`);
      }
      const destinationDirectory = resolveExistingPath(
        config,
        payload.rootId,
        payload.destinationDirectoryPath || payload.directoryPath,
        { allowRoot: true, kind: "directory" },
      );
      const conflictPolicy = normalizeExtractConflictPolicy(payload.conflictPolicy);
      runArchiveExtract(archive.absolutePath, destinationDirectory.absolutePath, archiveFormat, conflictPolicy);
      return {
        success: true,
        action: "unarchive",
        message: `Extracted ${path.basename(archive.absolutePath)}`,
        affectedPaths: [archive.relativePath, destinationDirectory.relativePath],
      };
    },

    getContentIndexStats(rootId: string): FilesContentIndexStatsPayload {
      return computeContentIndexStats(config, rootId);
    },

    getContentIndexRecords(params: FilesContentIndexRecordsParams): FilesContentIndexRecordsPayload {
      return listContentIndexRecords(config, params);
    },

    scanContentIndex(rootId: string): FilesContentIndexStatsPayload {
      return computeContentIndexStats(config, rootId, { validateRecords: true });
    },

    cleanContentIndex(rootId: string): FilesContentIndexActionResponse {
      return computeContentIndexStats(config, rootId, { cleanStale: true });
    },

    rebuildContentIndex(rootId: string): FilesContentIndexRebuildResponse {
      if (isGlobalContentIndexRoot(rootId)) {
        throw new Error("Global content-index rebuild is intentionally disabled; rebuild one root at a time to avoid scanning every configured filesystem root.");
      }
      return rebuildContentIndexForRoot(config, rootId);
    },

    prepareArchiveDownload(payload: FilesArchiveDownloadPayload) {
      const normalizedPaths = Array.from(
        new Set(
          (Array.isArray(payload.paths) ? payload.paths : [])
            .map((entry) => normalizeRelativePath(entry))
            .filter(Boolean),
        ),
      );
      if (!normalizedPaths.length) {
        throw new Error("At least one path is required to prepare archive download");
      }
      const root = resolveRoot(config, payload.rootId);
      const sources = normalizedPaths.map((entryPath) =>
        resolveExistingPath(config, payload.rootId, entryPath, {
          allowRoot: false,
        }),
      );
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-files-download-"));
      const firstName = path.basename(sources[0].absolutePath);
      const archiveName = ensureArchiveName(payload.name || `${firstName}-download`);
      const archiveFormat = inferArchiveFormat(archiveName) || "zip";
      const archivePath = path.join(tempDir, archiveName);
      runArchiveCreate(
        archivePath,
        root.absolutePath,
        sources.map((entry) => entry.absolutePath),
        archiveFormat,
      );
      return {
        archivePath,
        fileName: archiveName,
        mimeType: guessMimeType(archivePath),
        cleanupDir: tempDir,
      };
    },

    getDownloadFile(rootId: string, filePath: string) {
      const target = resolveExistingPath(config, rootId, filePath, {
        allowRoot: false,
        kind: "file",
      });
      return {
        absolutePath: target.absolutePath,
        fileName: path.basename(target.absolutePath),
        mimeType: guessMimeType(target.absolutePath),
      };
    },
  };
}
