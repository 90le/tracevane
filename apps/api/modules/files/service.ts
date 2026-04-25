import fs from "node:fs";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  FilesArchivePayload,
  FilesArchiveDownloadPayload,
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
  FileTreeNodePayload,
  FilesTreePayload,
  FilesUnarchivePayload,
  FilesUploadItemPayload,
  FilesUploadPayload,
  FilesWritePayload,
} from "../../../../types/files.js";

const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_UPLOAD_FILE_BYTES = 24 * 1024 * 1024;
const SEARCH_LIMIT = 250;

type FileRootContext = FileRootSummary & {
  absolutePath: string;
  realPath: string;
};

type ResolvedPath = {
  root: FileRootContext;
  relativePath: string;
  absolutePath: string;
};

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
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".avif",
  ".svg",
]);

const MIME_BY_EXTENSION: Record<string, string> = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ts": "application/typescript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".vue": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
};

export interface FilesService {
  getSummary(): FilesSummaryPayload;
  listDirectory(rootId: string, directoryPath?: string, showHidden?: boolean): FilesDirectoryPayload;
  listTree(rootId: string, directoryPath?: string, showHidden?: boolean): FilesTreePayload;
  readFile(rootId: string, filePath: string): FilesReadPayload;
  search(rootId: string, directoryPath: string | undefined, query: string, recursive?: boolean, showHidden?: boolean): FilesSearchPayload;
  createDirectory(payload: FilesCreateDirectoryPayload): FilesMutationResponse;
  createFile(payload: FilesCreateFilePayload): FilesMutationResponse;
  writeFile(payload: FilesWritePayload): FilesMutationResponse;
  renamePath(payload: FilesRenamePayload): FilesMutationResponse;
  copyPath(payload: FilesTransferPayload): FilesMutationResponse;
  movePath(payload: FilesTransferPayload): FilesMutationResponse;
  deletePaths(payload: FilesDeletePayload): FilesMutationResponse;
  uploadFiles(payload: FilesUploadPayload): FilesMutationResponse;
  archivePaths(payload: FilesArchivePayload): FilesMutationResponse;
  unarchiveFile(payload: FilesUnarchivePayload): FilesMutationResponse;
  prepareArchiveDownload(payload: FilesArchiveDownloadPayload): {
    archivePath: string;
    fileName: string;
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

function ensureArchiveName(value: unknown): string {
  const baseName = ensureSafeName(value);
  return baseName.toLowerCase().endsWith(".zip") ? baseName : `${baseName}.zip`;
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

function createRootDescriptors(config: StudioServerConfig): FileRootSummary[] {
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
      labelZh: "Studio 项目",
      labelEn: "Studio project",
      descriptionZh: "当前 OpenClaw Studio 扩展项目目录。",
      descriptionEn: "The current OpenClaw Studio extension project.",
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

function buildRootContexts(config: StudioServerConfig): FileRootContext[] {
  return createRootDescriptors(config).map((root) => ({
    ...root,
    absolutePath: path.resolve(root.absolutePath),
    realPath: realPathOf(root.absolutePath),
  }));
}

function resolveRoot(config: StudioServerConfig, rootId: string | undefined): FileRootContext {
  const roots = buildRootContexts(config);
  if (!roots.length) {
    throw new Error("No accessible file roots were discovered");
  }
  const preferred = roots.find((root) => root.preferred) || roots[0];
  if (!rootId) return preferred;
  return roots.find((root) => root.id === rootId) || preferred;
}

function resolveExistingPath(
  config: StudioServerConfig,
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

function resolveTargetPath(
  config: StudioServerConfig,
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
  if (TEXT_FILE_EXTENSIONS.has(ext)) return true;
  if (!sample) return false;
  return isProbablyTextBuffer(sample);
}

function readBufferSlice(filePath: string, maxBytes: number): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.allocUnsafe(maxBytes);
    const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    fs.closeSync(fd);
  }
}

function countChildDirectories(directoryPath: string, showHidden: boolean): number {
  try {
    return fs
      .readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => {
        if (!showHidden && entry.name.startsWith(".")) return false;
        if (entry.isDirectory()) return true;
        if (!entry.isSymbolicLink()) return false;
        try {
          return fs.statSync(path.join(directoryPath, entry.name)).isDirectory();
        } catch {
          return false;
        }
      }).length;
  } catch {
    return 0;
  }
}

function summarizeEntry(
  directoryPath: string,
  directoryRelativePath: string,
  dirent: fs.Dirent,
  showHidden: boolean,
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
    kind === "file"
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
    childDirectoryCount:
      kind === "directory"
        ? countChildDirectories(absolutePath, showHidden)
        : null,
  };
}

function sortEntries<T extends FileEntrySummary>(entries: T[]): T[] {
  return entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    return left.name.localeCompare(right.name, undefined, { numeric: true });
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

function decodeUploadFile(input: FilesUploadItemPayload): Buffer {
  const fileName = ensureSafeName(input.fileName);
  const rawBase64 = normalizeString(input.dataBase64).replace(/^data:[^,]+,/, "");
  if (!rawBase64) {
    throw new Error(`Uploaded file ${fileName} is empty`);
  }
  const buffer = Buffer.from(rawBase64, "base64");
  if (!buffer.length) {
    throw new Error(`Uploaded file ${fileName} could not be decoded`);
  }
  if (buffer.length > MAX_UPLOAD_FILE_BYTES) {
    throw new Error(
      `Uploaded file ${fileName} is too large; limit is ${MAX_UPLOAD_FILE_BYTES / 1024 / 1024} MiB`,
    );
  }
  return buffer;
}

function ensureNotExists(targetPath: string): void {
  if (fs.existsSync(targetPath)) {
    throw new Error("Target path already exists");
  }
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

function removeEntry(targetPath: string): void {
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    fs.rmSync(targetPath, { recursive: true, force: false });
    return;
  }
  fs.rmSync(targetPath, { force: false });
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

function runPythonZipExtract(archivePath: string, destinationDir: string): void {
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
destination.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(archive, "r") as zf:
    for member in zf.infolist():
        target = (destination / member.filename).resolve()
        if not str(target).startswith(str(destination)):
            raise RuntimeError(f"unsafe archive entry: {member.filename}")
    zf.extractall(destination)
`,
      archivePath,
      destinationDir,
    ],
    {
      stdio: "ignore",
    },
  );
}

export function createFilesService(config: StudioServerConfig): FilesService {
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

    listDirectory(rootId: string, directoryPath = "", showHidden = true): FilesDirectoryPayload {
      const resolved = resolveExistingPath(config, rootId, directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const entries = fs
        .readdirSync(resolved.absolutePath, { withFileTypes: true })
        .map((dirent) => summarizeEntry(resolved.absolutePath, resolved.relativePath, dirent, showHidden))
        .filter((entry): entry is FileEntrySummary => Boolean(entry));
      const hiddenCount = entries.filter((entry) => entry.hidden).length;
      const visibleEntries = showHidden ? entries : entries.filter((entry) => !entry.hidden);
      const sorted = sortEntries(visibleEntries);
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
          directories: sorted.filter((entry) => entry.kind === "directory").length,
          files: sorted.filter((entry) => entry.kind === "file").length,
          hidden: hiddenCount,
          total: sorted.length,
        },
        entries: sorted,
      };
    },

    listTree(rootId: string, directoryPath = "", showHidden = true): FilesTreePayload {
      const directory = this.listDirectory(rootId, directoryPath, showHidden);
      const children: FileTreeNodePayload[] = directory.entries
        .filter((entry) => entry.kind === "directory")
        .map((entry) => ({
          path: entry.path,
          name: entry.name,
          childDirectoryCount: entry.childDirectoryCount || 0,
        }));
      return {
        checkedAt: new Date().toISOString(),
        rootId: directory.rootId,
        directoryPath: directory.directoryPath,
        children,
      };
    },

    readFile(rootId: string, filePath: string): FilesReadPayload {
      const resolved = resolveExistingPath(config, rootId, filePath, {
        allowRoot: false,
        kind: "file",
      });
      const stat = fs.statSync(resolved.absolutePath);
      const initialSample = readBufferSlice(resolved.absolutePath, 1024);
      const textLike = isTextLike(resolved.absolutePath, initialSample);
      const editable = textLike && stat.size <= MAX_TEXT_FILE_BYTES;
      const maxBytes = Math.min(stat.size, MAX_TEXT_FILE_BYTES);
      const content =
        textLike
          ? readBufferSlice(resolved.absolutePath, maxBytes).toString("utf8")
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
        truncated: textLike && stat.size > MAX_TEXT_FILE_BYTES,
        content,
      };
    },

    search(
      rootId: string,
      directoryPath = "",
      query: string,
      recursive = true,
      showHidden = true,
    ): FilesSearchPayload {
      const resolved = resolveExistingPath(config, rootId, directoryPath, {
        allowRoot: true,
        kind: "directory",
      });
      const normalizedQuery = normalizeString(query).toLowerCase();
      if (!normalizedQuery) {
        return {
          checkedAt: new Date().toISOString(),
          rootId: resolved.root.id,
          directoryPath: resolved.relativePath,
          query: "",
          recursive,
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
      const results: FilesSearchPayload["results"] = [];

      while (queue.length && results.length < SEARCH_LIMIT) {
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
          if (summary.name.toLowerCase().includes(normalizedQuery)) {
            results.push({
              ...summary,
              directoryPath: current.relativePath,
            });
            if (results.length >= SEARCH_LIMIT) break;
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
      fs.writeFileSync(target.absolutePath, payload.content || "", "utf8");
      return {
        success: true,
        action: "write",
        message: `Saved ${path.basename(target.absolutePath)}`,
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
      for (const entryPath of normalizedPaths) {
        const target = resolveExistingPath(config, payload.rootId, entryPath, {
          allowRoot: false,
        });
        removeEntry(target.absolutePath);
      }
      return {
        success: true,
        action: "delete",
        message: `Deleted ${normalizedPaths.length} item(s)`,
        affectedPaths: normalizedPaths,
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
        const fileName = ensureSafeName(item.fileName);
        const buffer = decodeUploadFile(item);
        const destination = resolveTargetPath(
          config,
          payload.rootId,
          path.join(targetDirectory.relativePath || "", fileName),
          { allowRoot: false },
        );
        if (!item.overwrite) ensureNotExists(destination.absolutePath);
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

    archivePaths(payload: FilesArchivePayload): FilesMutationResponse {
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
      const destination = resolveTargetPath(
        config,
        payload.rootId,
        path.join(workingDirectory.relativePath || "", archiveName),
        { allowRoot: false },
      );
      ensureNotExists(destination.absolutePath);
      runPythonZipArchive(
        destination.absolutePath,
        workingDirectory.absolutePath,
        sources.map((entry) => entry.absolutePath),
      );
      return {
        success: true,
        action: "archive",
        message: `Archived ${normalizedPaths.length} item(s)`,
        affectedPaths: [...normalizedPaths, destination.relativePath],
      };
    },

    unarchiveFile(payload: FilesUnarchivePayload): FilesMutationResponse {
      const archive = resolveExistingPath(config, payload.rootId, payload.archivePath, {
        allowRoot: false,
        kind: "file",
      });
      if (!archive.absolutePath.toLowerCase().endsWith(".zip")) {
        throw new Error("Only .zip archives are supported");
      }
      const destinationDirectory = resolveExistingPath(
        config,
        payload.rootId,
        payload.directoryPath,
        { allowRoot: true, kind: "directory" },
      );
      runPythonZipExtract(archive.absolutePath, destinationDirectory.absolutePath);
      return {
        success: true,
        action: "unarchive",
        message: `Extracted ${path.basename(archive.absolutePath)}`,
        affectedPaths: [archive.relativePath, destinationDirectory.relativePath],
      };
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
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-files-download-"));
      const firstName = path.basename(sources[0].absolutePath);
      const archiveName = ensureArchiveName(payload.name || `${firstName}-download`);
      const archivePath = path.join(tempDir, archiveName);
      runPythonZipArchive(
        archivePath,
        root.absolutePath,
        sources.map((entry) => entry.absolutePath),
      );
      return {
        archivePath,
        fileName: archiveName,
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
