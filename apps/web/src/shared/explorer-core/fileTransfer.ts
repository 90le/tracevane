import { explorerDirname, joinExplorerPath, normalizeExplorerPath } from "./path";
import type { ExplorerCommands, ExplorerRootId } from "./types";

const EXPLORER_RESOURCE_DRAG_MIME = "application/x-tracevane-explorer-resource";
const LEGACY_IDE_RESOURCE_DRAG_MIME = "application/x-tracevane-ide-resource";
const LEGACY_FILE_MANAGER_ENTRY_DRAG_MIME = "application/x-tracevane-file-manager-paths";

export type ExplorerTransferOperation = "copy" | "move";

export interface ExplorerTransferItem {
  path: string;
  absolutePath?: string;
  kind?: "file" | "directory";
  name?: string;
}

export interface ExplorerTransferPayload {
  rootId: string;
  paths: string[];
  items: ExplorerTransferItem[];
}

export interface ExplorerTransferEntryLike {
  path: string;
  kind?: "file" | "directory";
  name?: string;
}

export interface ExplorerClipboardState {
  operation: ExplorerTransferOperation;
  paths: string[];
  items: ExplorerTransferItem[];
}

export interface ExplorerTransferCommandInput {
  commands: Pick<ExplorerCommands, "copy" | "move">;
  rootId: ExplorerRootId;
  entry: ExplorerTransferEntryLike;
  operation: ExplorerTransferOperation;
  destinationDirectoryPath: string;
  destinationRootId?: ExplorerRootId;
  nextName?: string;
  overwrite?: boolean;
}

export interface ExplorerTransferCommandResult {
  result: Awaited<ReturnType<ExplorerCommands["copy"]>>;
  newPath: string | null;
  pathEvent: {
    type: "moved";
    rootId: ExplorerRootId;
    oldPath: string;
    newPath: string;
    targetKind?: ExplorerTransferItem["kind"];
  } | null;
}

export function createExplorerTransferPayload(input: {
  rootId: string;
  items: ExplorerTransferItem[];
}): ExplorerTransferPayload {
  const items = input.items
    .map((item) => ({
      ...item,
      path: normalizeExplorerPath(item.path),
      absolutePath: item.absolutePath?.trim() || undefined,
      name: item.name?.trim() || item.path.split("/").pop() || item.path,
    }))
    .filter((item) => item.path.length > 0);
  return {
    rootId: input.rootId,
    paths: items.map((item) => item.absolutePath || item.path),
    items,
  };
}

function explorerTransferItemFromEntry(entry: ExplorerTransferEntryLike): ExplorerTransferItem {
  const path = normalizeExplorerPath(entry.path);
  return {
    path,
    kind: entry.kind,
    name: entry.name?.trim() || path.split("/").pop() || path,
  };
}

export function createExplorerClipboardFromEntries(
  operation: ExplorerTransferOperation,
  entries: ExplorerTransferEntryLike[],
): ExplorerClipboardState {
  return createExplorerClipboardState({
    operation,
    items: entries.map(explorerTransferItemFromEntry),
  });
}

export function explorerPasteDestinationForEntry(
  entry: ExplorerTransferEntryLike | null | undefined,
  currentDirectoryPath: string,
): string {
  if (!entry) return normalizeExplorerPath(currentDirectoryPath);
  return normalizeExplorerPath(entry.kind === "directory" ? entry.path : dirnameFromPath(entry.path));
}

function dirnameFromPath(path: string): string {
  return explorerDirname(path);
}

function createExplorerClipboardState(input: {
  operation: ExplorerTransferOperation;
  items: ExplorerTransferItem[];
}): ExplorerClipboardState {
  const payload = createExplorerTransferPayload({ rootId: "clipboard", items: input.items });
  return {
    operation: input.operation,
    paths: payload.items.map((item) => item.path),
    items: payload.items,
  };
}

function findBlockedSelfOrDescendantDrop(
  items: ExplorerTransferItem[],
  destinationDirectoryPath: string,
): ExplorerTransferItem | null {
  return items.find((item) => item.kind === "directory" && isSelfOrDescendantDrop(item.path, destinationDirectoryPath)) ?? null;
}

export function filterSelfOrDescendantDrops(items: ExplorerTransferItem[], destinationDirectoryPath: string): ExplorerTransferItem[] {
  return items.filter((item) => item.kind !== "directory" || !isSelfOrDescendantDrop(item.path, destinationDirectoryPath));
}

export function assertExplorerTransferAllowed(
  items: ExplorerTransferEntryLike[],
  destinationDirectoryPath: string,
): { ok: true; destination: string; items: ExplorerTransferItem[] } | { ok: false; destination: string; blocked: ExplorerTransferItem } {
  const destination = normalizeExplorerPath(destinationDirectoryPath);
  const transferItems = items.map(explorerTransferItemFromEntry);
  const blocked = findBlockedSelfOrDescendantDrop(transferItems, destination);
  if (blocked) return { ok: false, destination, blocked };
  return { ok: true, destination, items: transferItems };
}

export async function runExplorerTransferCommand({
  commands,
  rootId,
  entry,
  operation,
  destinationDirectoryPath,
  destinationRootId = rootId,
  nextName,
  overwrite = false,
}: ExplorerTransferCommandInput): Promise<ExplorerTransferCommandResult> {
  const source = explorerTransferItemFromEntry(entry);
  const target = {
    destinationRootId,
    destinationDirectoryPath: normalizeExplorerPath(destinationDirectoryPath),
    nextName: nextName?.trim() || undefined,
    overwrite,
  };
  const result = operation === "copy"
    ? await commands.copy({ rootId, path: source.path }, target)
    : await commands.move({ rootId, path: source.path }, target);

  if (operation !== "move") {
    return { result, newPath: null, pathEvent: null };
  }

  const fallback = joinExplorerPath(target.destinationDirectoryPath, target.nextName ?? source.name ?? source.path.split("/").pop());
  const newPath = normalizeExplorerPath(result.affectedPaths[1] ?? fallback);
  return {
    result,
    newPath,
    pathEvent: {
      type: "moved",
      rootId,
      oldPath: source.path,
      newPath,
      targetKind: source.kind,
    },
  };
}

export function writeExplorerTransferPayload(dataTransfer: DataTransfer, payload: ExplorerTransferPayload, textPath?: string): void {
  const raw = JSON.stringify(payload);
  dataTransfer.setData(EXPLORER_RESOURCE_DRAG_MIME, raw);
  // Keep legacy MIME aliases during migration so Terminal / File Manager / IDE Explorer interoperate.
  dataTransfer.setData(LEGACY_IDE_RESOURCE_DRAG_MIME, raw);
  dataTransfer.setData(LEGACY_FILE_MANAGER_ENTRY_DRAG_MIME, JSON.stringify({ rootId: payload.rootId, paths: payload.items.map((item) => item.path) }));
  dataTransfer.setData("text/plain", textPath ?? payload.paths[0] ?? payload.items[0]?.path ?? "");
  dataTransfer.effectAllowed = "copyMove";
}

export function readExplorerTransferPayload(dataTransfer: DataTransfer): ExplorerTransferPayload | null {
  for (const type of [EXPLORER_RESOURCE_DRAG_MIME, LEGACY_IDE_RESOURCE_DRAG_MIME]) {
    const payload = parseExplorerTransferPayload(dataTransfer.getData(type));
    if (payload) return payload;
  }
  const legacy = parseLegacyFileManagerPayload(dataTransfer.getData(LEGACY_FILE_MANAGER_ENTRY_DRAG_MIME));
  return legacy;
}

export function hasExplorerTransferPayload(dataTransfer: DataTransfer): boolean {
  return [EXPLORER_RESOURCE_DRAG_MIME, LEGACY_IDE_RESOURCE_DRAG_MIME, LEGACY_FILE_MANAGER_ENTRY_DRAG_MIME].some((type) =>
    dataTransfer.types.includes(type),
  );
}

function parseExplorerTransferPayload(raw: string): ExplorerTransferPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExplorerTransferPayload>;
    if (!parsed.rootId) return null;
    const items = Array.isArray(parsed.items)
      ? parsed.items
          .map((item): ExplorerTransferItem => ({
            path: normalizeExplorerPath(String(item.path || "")),
            absolutePath: typeof item.absolutePath === "string" ? item.absolutePath : undefined,
            kind: item.kind === "directory" ? "directory" : item.kind === "file" ? "file" : undefined,
            name: typeof item.name === "string" ? item.name : undefined,
          }))
          .filter((item) => item.path.length > 0)
      : [];
    const paths = Array.isArray(parsed.paths) ? parsed.paths.map(String).filter(Boolean) : items.map((item) => item.absolutePath || item.path);
    if (!items.length && !paths.length) return null;
    return {
      rootId: String(parsed.rootId),
      paths,
      items: items.length ? items : paths.map((path) => ({ path: normalizeExplorerPath(path), absolutePath: path })),
    };
  } catch {
    return null;
  }
}

function parseLegacyFileManagerPayload(raw: string): ExplorerTransferPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { rootId?: unknown; paths?: unknown };
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.filter((path): path is string => typeof path === "string" && path.length > 0)
      : [];
    if (!paths.length) return null;
    return {
      rootId: typeof parsed.rootId === "string" ? parsed.rootId : "",
      paths,
      items: paths.map((path) => ({ path: normalizeExplorerPath(path), name: path.split("/").pop() || path })),
    };
  } catch {
    return null;
  }
}

function isSelfOrDescendantDrop(sourcePath: string, destinationDirectoryPath: string): boolean {
  const source = normalizeExplorerPath(sourcePath);
  const destination = normalizeExplorerPath(destinationDirectoryPath);
  return destination === source || destination.startsWith(`${source}/`);
}
