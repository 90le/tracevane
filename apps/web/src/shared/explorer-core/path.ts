import { editorDocumentId, editorTitleForPath } from "@/shared/editor-core";
import type {
  ExplorerEntry,
  ExplorerLocation,
  ExplorerNodeKey,
  ExplorerPath,
  ExplorerRootId,
} from "./types";
import type { FileEntrySummary } from "../../../../../types/files";

export function normalizeExplorerPath(path?: string | null): ExplorerPath {
  if (!path) return "";
  const parts = path
    .replace(/\\/g, "/")
    .split("/")
    .filter((part) => part && part !== ".");
  return parts.join("/");
}

export function explorerBasename(path?: string | null): string {
  const normalized = normalizeExplorerPath(path);
  return normalized.split("/").filter(Boolean).pop() ?? "";
}

export function explorerDirname(path?: string | null): ExplorerPath {
  const normalized = normalizeExplorerPath(path);
  const parts = normalized.split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function explorerParentPath(path?: string | null): ExplorerPath | null {
  const normalized = normalizeExplorerPath(path);
  if (!normalized) return null;
  return explorerDirname(normalized);
}

export function joinExplorerPath(...segments: Array<string | null | undefined>): ExplorerPath {
  return normalizeExplorerPath(segments.filter(Boolean).join("/"));
}

export function explorerPathDepth(path?: string | null): number {
  const normalized = normalizeExplorerPath(path);
  return normalized ? normalized.split("/").filter(Boolean).length : 0;
}

export function explorerPathSegments(path?: string | null): string[] {
  const normalized = normalizeExplorerPath(path);
  return normalized ? normalized.split("/").filter(Boolean) : [];
}

export function explorerNodeKey(
  location: ExplorerLocation | { rootId: ExplorerRootId; path: ExplorerPath },
): ExplorerNodeKey {
  const path = "directoryPath" in location ? location.directoryPath : location.path;
  return editorDocumentId({ rootId: location.rootId, path: normalizeExplorerPath(path) });
}

export function explorerAncestorDirectoryKeys(location: ExplorerLocation): ExplorerNodeKey[] {
  const segments = explorerPathSegments(location.directoryPath);
  const keys: ExplorerNodeKey[] = [explorerNodeKey({ rootId: location.rootId, directoryPath: "" })];
  for (let index = 1; index <= segments.length; index += 1) {
    keys.push(
      explorerNodeKey({
        rootId: location.rootId,
        directoryPath: segments.slice(0, index).join("/"),
      }),
    );
  }
  return keys;
}

export function isExplorerPathInside(parentPath: string, candidatePath: string): boolean {
  const parent = normalizeExplorerPath(parentPath);
  const candidate = normalizeExplorerPath(candidatePath);
  if (!parent) return Boolean(candidate);
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

export function toExplorerEntry(
  entry: FileEntrySummary,
  location: ExplorerLocation,
): ExplorerEntry {
  const path = normalizeExplorerPath(entry.path);
  return {
    ...entry,
    path,
    name: entry.name || editorTitleForPath(path),
    rootId: location.rootId,
    parentPath: normalizeExplorerPath(location.directoryPath),
    id: explorerNodeKey({ rootId: location.rootId, path }),
    documentId: editorDocumentId({ rootId: location.rootId, path }),
  };
}
