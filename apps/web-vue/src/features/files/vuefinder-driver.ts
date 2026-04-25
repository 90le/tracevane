import { BaseAdapter, type DeleteResult, type DirEntry, type Driver, type FileContentResult, type FileOperationResult } from "vuefinder";
import type { DeleteParams, RenameParams, SaveParams, SearchParams, TransferParams, UploaderContext } from "vuefinder";
import type {
  FileEntrySummary,
  FilesDirectoryPayload,
  FilesSearchPayload,
} from "../../../../../types/files";
import {
  archivePaths,
  browseDirectory,
  buildFileDownloadUrl,
  copyPath,
  createDirectory,
  createFile,
  deletePaths,
  movePath,
  readFileContent,
  renamePath,
  saveFileContent,
  searchFiles,
  unarchiveFile,
  uploadFiles,
} from "./api";

export interface StudioFileStorageRoot {
  id: string;
  storage: string;
}

interface ResolvedPath {
  root: StudioFileStorageRoot;
  relativePath: string;
}

function normalizePathValue(value?: string): string {
  return typeof value === "string" ? value.replace(/^\/+|\/+$/g, "") : "";
}

function directoryNameForEntry(entry: FileEntrySummary, fallbackDir = ""): string {
  if (fallbackDir) return fallbackDir;
  const lastSlash = entry.path.lastIndexOf("/");
  return lastSlash === -1 ? "" : entry.path.slice(0, lastSlash);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read upload file"));
    reader.readAsDataURL(blob);
  });
}

function mimeTypeForEntry(entry: FileEntrySummary): string | null {
  const ext = entry.ext?.replace(/^\./, "").toLowerCase() || "";
  if (ext === "zip") return "application/zip";
  if (entry.imageLike) return "image/*";
  if (entry.textLike) return "text/plain";
  return entry.ext || null;
}

export class StudioFilesVueFinderDriver extends BaseAdapter implements Driver {
  private readonly roots: StudioFileStorageRoot[];
  private readonly rootByStorage: Map<string, StudioFileStorageRoot>;
  private readonly defaultRoot: StudioFileStorageRoot;
  private readonly storages: string[];

  constructor(
    roots: StudioFileStorageRoot[],
    defaultRootId = "",
    private readonly showHidden = true,
  ) {
    super();
    const uniqueRoots = roots.filter(
      (root, index, all) =>
        root.id
        && root.storage
        && !root.storage.includes("://")
        && all.findIndex((candidate) => candidate.storage === root.storage) === index,
    );
    this.roots = uniqueRoots.length
      ? uniqueRoots
      : [{ id: defaultRootId || "openclaw-root", storage: "OpenClaw" }];
    this.defaultRoot =
      this.roots.find((root) => root.id === defaultRootId)
      || this.roots.find((root) => root.id === "openclaw-root")
      || this.roots[0];
    this.storages = this.roots.map((root) => root.storage);
    this.rootByStorage = new Map(this.roots.map((root) => [root.storage, root]));
  }

  private toVueFinderPath(root: StudioFileStorageRoot, relativePath = ""): string {
    const normalized = normalizePathValue(relativePath);
    return normalized ? `${root.storage}://${normalized}` : `${root.storage}://`;
  }

  private resolvePath(inputPath?: string, fallbackStorage?: string): ResolvedPath {
    const parsed = this.parsePath(inputPath || "");
    const storage = parsed.storage && this.rootByStorage.has(parsed.storage)
      ? parsed.storage
      : fallbackStorage && this.rootByStorage.has(fallbackStorage)
        ? fallbackStorage
        : this.defaultRoot.storage;
    const root = this.rootByStorage.get(storage) || this.defaultRoot;
    return {
      root,
      relativePath: normalizePathValue(parsed.path || ""),
    };
  }

  private toDirEntry(
    root: StudioFileStorageRoot,
    entry: FileEntrySummary,
    currentDir = "",
  ): DirEntry {
    const relativePath = normalizePathValue(entry.path);
    const relativeDir = normalizePathValue(directoryNameForEntry(entry, currentDir));
    const modifiedAt = entry.modifiedAt ? new Date(entry.modifiedAt).getTime() : null;
    return {
      storage: root.storage,
      dir: this.toVueFinderPath(root, relativeDir),
      basename: entry.name,
      extension: entry.ext?.replace(/^\./, "") || "",
      path: this.toVueFinderPath(root, relativePath),
      type: entry.kind === "directory" ? "dir" : "file",
      file_size: entry.size,
      last_modified: modifiedAt ? Math.floor(modifiedAt / 1000) : null,
      mime_type: mimeTypeForEntry(entry),
      visibility: entry.hidden ? "private" : "public",
      previewUrl: entry.imageLike ? buildFileDownloadUrl(root.id, relativePath) : undefined,
    };
  }

  private async listAt(resolved: ResolvedPath): Promise<FilesDirectoryPayload> {
    return browseDirectory(resolved.root.id, resolved.relativePath, this.showHidden);
  }

  private async buildOperationResult(pathValue = ""): Promise<FileOperationResult> {
    const resolved = this.resolvePath(pathValue);
    const listing = await this.listAt(resolved);
    return {
      dirname: this.toVueFinderPath(resolved.root, listing.directoryPath),
      files: listing.entries.map((entry) => this.toDirEntry(resolved.root, entry, listing.directoryPath)),
      storages: this.storages as any,
      read_only: false,
    };
  }

  async list(params?: { path?: string }): Promise<{ storages: string[]; dirname: string; files: DirEntry[]; read_only?: boolean; }> {
    const resolved = this.resolvePath(params?.path);
    const listing = await this.listAt(resolved);
    return {
      dirname: this.toVueFinderPath(resolved.root, listing.directoryPath),
      files: listing.entries.map((entry) => this.toDirEntry(resolved.root, entry, listing.directoryPath)),
      storages: this.storages as any,
      read_only: false,
    };
  }

  async delete(params: DeleteParams): Promise<DeleteResult> {
    const base = this.resolvePath(params.path);
    const items = Array.isArray(params.items) ? params.items : [];
    const pathsByRoot = new Map<string, string[]>();
    for (const item of items) {
      const resolved = this.resolvePath(item.path, base.root.storage);
      const paths = pathsByRoot.get(resolved.root.id) || [];
      if (resolved.relativePath) paths.push(resolved.relativePath);
      pathsByRoot.set(resolved.root.id, paths);
    }
    for (const [rootId, paths] of pathsByRoot.entries()) {
      if (!paths.length) continue;
      await deletePaths({ rootId, paths });
    }
    const refreshed = await this.buildOperationResult(params.path);
    return {
      ...refreshed,
      deleted: items.map((item) => {
        const resolved = this.resolvePath(item.path, base.root.storage);
        return {
          storage: resolved.root.storage,
          dir: this.toVueFinderPath(resolved.root, normalizePathValue(params.path)),
          basename: resolved.relativePath.split("/").pop() || "",
          extension: "",
          path: this.toVueFinderPath(resolved.root, resolved.relativePath),
          type: item.type === "dir" ? "dir" : "file",
          file_size: null,
          last_modified: null,
          mime_type: null,
          visibility: "public",
        };
      }),
    };
  }

  async rename(params: RenameParams): Promise<FileOperationResult> {
    const base = this.resolvePath(params.path);
    const target = this.resolvePath(params.item, base.root.storage);
    await renamePath({
      rootId: target.root.id,
      path: target.relativePath,
      nextName: params.name,
    });
    return this.buildOperationResult(params.path);
  }

  async copy(params: TransferParams): Promise<FileOperationResult> {
    const base = this.resolvePath(params.path || params.destination);
    const destination = this.resolvePath(params.destination, base.root.storage);
    const sources = Array.isArray(params.sources) ? params.sources : [];
    for (const source of sources) {
      const resolvedSource = this.resolvePath(source, base.root.storage);
      await copyPath({
        sourceRootId: resolvedSource.root.id,
        sourcePath: resolvedSource.relativePath,
        destinationRootId: destination.root.id,
        destinationDirectoryPath: destination.relativePath,
      });
    }
    return this.buildOperationResult(params.path || params.destination);
  }

  async move(params: TransferParams): Promise<FileOperationResult> {
    const base = this.resolvePath(params.path || params.destination);
    const destination = this.resolvePath(params.destination, base.root.storage);
    const sources = Array.isArray(params.sources) ? params.sources : [];
    for (const source of sources) {
      const resolvedSource = this.resolvePath(source, base.root.storage);
      await movePath({
        sourceRootId: resolvedSource.root.id,
        sourcePath: resolvedSource.relativePath,
        destinationRootId: destination.root.id,
        destinationDirectoryPath: destination.relativePath,
      });
    }
    return this.buildOperationResult(params.path || params.destination);
  }

  async archive(params: { items: { path: string; type: string }[]; path: string; name: string }): Promise<FileOperationResult> {
    const directory = this.resolvePath(params.path);
    const items = Array.isArray(params.items) ? params.items : [];
    const paths = items
      .map((item) => this.resolvePath(item.path, directory.root.storage))
      .filter((item) => item.root.id === directory.root.id)
      .map((item) => item.relativePath)
      .filter(Boolean);
    await archivePaths({
      rootId: directory.root.id,
      directoryPath: directory.relativePath,
      paths,
      name: params.name,
    });
    return this.buildOperationResult(params.path);
  }

  async unarchive(params: { item: string; path: string }): Promise<FileOperationResult> {
    const directory = this.resolvePath(params.path);
    const archive = this.resolvePath(params.item, directory.root.storage);
    await unarchiveFile({
      rootId: archive.root.id,
      archivePath: archive.relativePath,
      directoryPath: directory.relativePath,
    });
    return this.buildOperationResult(params.path);
  }

  async createFile(params: { path: string; name: string }): Promise<FileOperationResult> {
    const directory = this.resolvePath(params.path);
    await createFile({
      rootId: directory.root.id,
      directoryPath: directory.relativePath,
      name: params.name,
      content: "",
    });
    return this.buildOperationResult(params.path);
  }

  async createFolder(params: { path: string; name: string }): Promise<FileOperationResult> {
    const directory = this.resolvePath(params.path);
    await createDirectory({
      rootId: directory.root.id,
      directoryPath: directory.relativePath,
      name: params.name,
    });
    return this.buildOperationResult(params.path);
  }

  async getContent(params: { path: string }): Promise<FileContentResult> {
    const target = this.resolvePath(params.path);
    const file = await readFileContent(target.root.id, target.relativePath);
    return {
      content: file.content || "",
      mimeType: file.mimeType,
    };
  }

  getPreviewUrl(params: { path: string }): string {
    const target = this.resolvePath(params.path);
    return buildFileDownloadUrl(target.root.id, target.relativePath);
  }

  getDownloadUrl(params: { path: string }): string {
    const target = this.resolvePath(params.path);
    return buildFileDownloadUrl(target.root.id, target.relativePath);
  }

  async search(params: SearchParams): Promise<DirEntry[]> {
    const target = this.resolvePath(params.path);
    const payload: FilesSearchPayload = await searchFiles(
      target.root.id,
      params.filter || "",
      target.relativePath,
      params.deep !== false,
      this.showHidden,
    );
    return payload.results.map((entry) => this.toDirEntry(target.root, entry, entry.directoryPath));
  }

  async save(params: SaveParams): Promise<string> {
    const target = this.resolvePath(params.path);
    await saveFileContent({
      rootId: target.root.id,
      path: target.relativePath,
      content: params.content,
    });
    return this.toVueFinderPath(target.root, target.relativePath);
  }

  configureUploader(uppy: any, context: UploaderContext): void {
    uppy.addUploader(async (fileIds: string[]) => {
      const target = this.resolvePath(context.getTargetPath());
      const files = fileIds
        .map((fileId) => uppy.getFile(fileId))
        .filter(Boolean);
      if (!files.length) return;

      const uploadPayload = [];
      for (const file of files) {
        const data = file.data as Blob | undefined;
        if (!data) continue;
        uploadPayload.push({
          fileName: file.name || "file",
          dataBase64: await blobToDataUrl(data),
        });
      }
      if (!uploadPayload.length) return;

      await uploadFiles({
        rootId: target.root.id,
        directoryPath: target.relativePath,
        files: uploadPayload,
      });

      for (const file of files) {
        uppy.emit("upload-success", file, {
          status: 200,
          body: {},
          uploadURL: buildFileDownloadUrl(
            target.root.id,
            [target.relativePath, file.name || "file"].filter(Boolean).join("/"),
          ),
        });
      }
      uppy.emit("complete", {
        successful: files,
        failed: [],
      });
    });
  }
}
