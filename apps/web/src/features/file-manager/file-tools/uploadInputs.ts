export interface WebkitFileSystemEntry {
  name: string;
  fullPath: string;
  isFile: boolean;
  isDirectory: boolean;
}

export interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  file: (success: (file: File) => void, error?: (error: DOMException) => void) => void;
}

export interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  createReader: () => {
    readEntries: (success: (entries: WebkitFileSystemEntry[]) => void, error?: (error: DOMException) => void) => void;
  };
}

export interface CollectUploadFilesOptions {
  includeDirectoryEntries?: boolean;
}

export function hasFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

export function hasUploadFilesInDataTransfer(dataTransfer: Pick<DataTransfer, "files" | "items"> | null | undefined): boolean {
  if (!dataTransfer) return false;
  if (dataTransfer.files?.length) return true;
  return Array.from(dataTransfer.items ?? []).some((item) => item.kind === "file");
}

export async function collectUploadFilesFromDataTransfer(
  dataTransfer: Pick<DataTransfer, "files" | "items">,
  options: CollectUploadFilesOptions = {},
): Promise<File[]> {
  const entries = options.includeDirectoryEntries
    ? Array.from(dataTransfer.items ?? [])
        .map((item) => getDataTransferItemEntry(item))
        .filter((entry): entry is WebkitFileSystemEntry => isWebkitFileSystemEntry(entry))
    : [];
  const files = entries.length
    ? (await Promise.all(entries.map((entry) => collectFilesFromEntry(entry)))).flat()
    : collectFlatDataTransferFiles(dataTransfer);
  return dedupeUploadFiles(files);
}

export function mergeUploadFiles(existing: File[], incoming: File[]): File[] {
  return dedupeUploadFiles([...existing, ...incoming]);
}

export function uploadFileIdentity(file: File): string {
  const relativePath = normalizeUploadRelativePath(file) || file.name;
  return [relativePath, file.size, file.lastModified || 0, file.type || ""].join("\u0000");
}

export function uploadFileClipboardIdentity(file: File): string {
  const relativePath = normalizeUploadRelativePath(file) || file.name;
  return [relativePath, file.size, file.type || ""].join("\u0000");
}

export function uploadFilesClipboardFingerprint(files: File[]): string {
  return files.map(uploadFileClipboardIdentity).sort().join("\u0001");
}

export function normalizeUploadRelativePath(file: File): string | undefined {
  const maybeRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return maybeRelative?.split("/").filter(Boolean).join("/");
}

function collectFlatDataTransferFiles(dataTransfer: Pick<DataTransfer, "files" | "items">): File[] {
  const files = Array.from(dataTransfer.files ?? []);
  if (files.length) return files;
  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));
}

function dedupeUploadFiles(files: File[]): File[] {
  const seen = new Set<string>();
  const out: File[] = [];
  for (const file of files) {
    const key = uploadFileIdentity(file);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(file);
  }
  return out;
}

function getDataTransferItemEntry(item: DataTransferItem): unknown {
  const maybeGetEntry = item as DataTransferItem & {
    getAsEntry?: () => unknown;
    webkitGetAsEntry?: () => unknown;
  };
  if (typeof maybeGetEntry.getAsEntry === "function") return maybeGetEntry.getAsEntry();
  if (typeof maybeGetEntry.webkitGetAsEntry === "function") return maybeGetEntry.webkitGetAsEntry();
  return null;
}

function isWebkitFileSystemEntry(value: unknown): value is WebkitFileSystemEntry {
  return Boolean(value && typeof value === "object" && "isFile" in value && "isDirectory" in value && "fullPath" in value);
}

async function collectFilesFromEntry(entry: WebkitFileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as WebkitFileSystemFileEntry);
    return [withUploadRelativePath(file, entry.fullPath.replace(/^\/+/, ""))];
  }
  if (!entry.isDirectory) return [];
  const children = await readDirectoryEntry(entry as WebkitFileSystemDirectoryEntry);
  const files = await Promise.all(children.map((child) => collectFilesFromEntry(child)));
  return files.flat();
}

function readFileEntry(entry: WebkitFileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readDirectoryEntry(entry: WebkitFileSystemDirectoryEntry): Promise<WebkitFileSystemEntry[]> {
  const reader = entry.createReader();
  const all: WebkitFileSystemEntry[] = [];
  while (true) {
    const batch = await new Promise<WebkitFileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    all.push(...batch);
  }
  return all;
}

function withUploadRelativePath(file: File, relativePath: string): File {
  if (!relativePath || relativePath === file.name) return file;
  try {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath, configurable: true });
  } catch {
    // Some browsers expose File objects as non-extensible; fallback to flat upload.
  }
  return file;
}
