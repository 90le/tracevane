import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type {
  LspWorkspaceEditApplyRequest,
  LspWorkspaceEditApplyResponse,
  LspWorkspaceEditOpenDocument,
  LspWorkspaceEditOpenState,
  LspWorkspaceEditPreviewItem,
  LspWorkspaceEditPreviewRequest,
  LspWorkspaceEditPreviewResponse,
  LspWorkspaceEditRange,
  LspWorkspaceEditRejectedItem,
  LspWorkspaceResourceOperation,
  LspWorkspaceTextDocumentEdit,
  LspWorkspaceTextEdit,
} from "../../../../types/lsp.js";
import type { FilesService } from "../files/service.js";
import {
  resolveFilesServiceDirectoryPath,
  resolveFilesServiceExistingFilePath,
} from "../files/service.js";
import type { TracevaneServerConfig } from "../../../../types/api.js";

interface NormalizedEdit {
  uri: string;
  path: string;
  edit: LspWorkspaceTextEdit;
  openState: LspWorkspaceEditOpenState;
}

interface RootContext {
  id: string;
  absolutePath: string;
}

export function previewWorkspaceEdit(
  config: TracevaneServerConfig,
  request: LspWorkspaceEditPreviewRequest,
): LspWorkspaceEditPreviewResponse {
  const root = resolveWorkspaceEditRoot(config, request.rootId);
  const rejected: LspWorkspaceEditRejectedItem[] = [];
  const openDocuments = normalizeOpenDocuments(config, root, request.openDocuments ?? [], rejected);
  const edits = collectWorkspaceTextEdits(request, rejected);
  const items: LspWorkspaceEditPreviewItem[] = [];

  for (const entry of edits) {
    const resolved = resolveWorkspaceEditUri(config, root, entry.uri);
    if (!resolved.ok) {
      rejected.push({ kind: "text", uri: entry.uri, reason: resolved.reason });
      continue;
    }
    const normalized = normalizeTextEdit(entry.edit);
    if (!normalized.ok) {
      rejected.push({ kind: "text", uri: entry.uri, path: resolved.path, reason: normalized.reason });
      continue;
    }
    const openState = openDocuments.get(resolved.path) ?? "closed";
    items.push({
      kind: "text",
      rootId: root.id,
      path: resolved.path,
      uri: pathToFileURL(resolved.absolutePath).toString(),
      range: normalized.range,
      newText: normalized.newText,
      openState,
      supported: true,
    });
  }

  return buildPreviewResponse(request, root.id, items, rejected, "workspaceEditPreview");
}

export function applyWorkspaceEdit(
  config: TracevaneServerConfig,
  files: FilesService,
  request: LspWorkspaceEditApplyRequest,
): LspWorkspaceEditApplyResponse {
  const preview = previewWorkspaceEdit(config, request);
  const skipped: LspWorkspaceEditRejectedItem[] = [...preview.rejected];
  const applied: LspWorkspaceEditApplyResponse["applied"] = [];
  const grouped = new Map<string, LspWorkspaceEditPreviewItem[]>();

  for (const item of preview.items) {
    if (item.openState === "open-dirty") {
      skipped.push({
        kind: "text",
        uri: item.uri,
        path: item.path,
        reason: "Dirty open documents are not applied by the M7.z-F WorkspaceEdit foundation",
      });
      continue;
    }
    if (item.openState === "open-clean" && !request.allowOpenClean) {
      skipped.push({
        kind: "text",
        uri: item.uri,
        path: item.path,
        reason: "Open clean documents require frontend Monaco model coordination before apply",
      });
      continue;
    }
    const list = grouped.get(item.path) ?? [];
    list.push(item);
    grouped.set(item.path, list);
  }

  for (const [filePath, items] of grouped) {
    const read = files.readFile(preview.rootId, filePath);
    if (!read.textLike || read.truncated || typeof read.content !== "string") {
      skipped.push({ kind: "text", path: filePath, reason: "WorkspaceEdit apply supports complete text files only" });
      continue;
    }
    const editResult = applyTextEditsToContent(read.content, items);
    if (!editResult.ok) {
      skipped.push({ kind: "text", path: filePath, reason: editResult.reason });
      continue;
    }
    const write = files.writeFile({
      rootId: preview.rootId,
      path: filePath,
      content: editResult.content,
      expectedModifiedAt: read.modifiedAt,
      expectedSize: read.size,
      force: Boolean(request.force),
    });
    applied.push({ path: filePath, editCount: items.length, modifiedAt: write.modifiedAt ?? null, size: write.size ?? null });
  }

  return {
    ...buildPreviewResponse(request, preview.rootId, preview.items, preview.rejected, "workspaceEditApply"),
    applied,
    skipped,
  };
}

function resolveWorkspaceEditRoot(config: TracevaneServerConfig, rootId: string): RootContext {
  const resolved = resolveFilesServiceDirectoryPath(config, rootId, "");
  return { id: resolved.root.id, absolutePath: resolved.absolutePath };
}

function normalizeOpenDocuments(
  config: TracevaneServerConfig,
  root: RootContext,
  openDocuments: LspWorkspaceEditOpenDocument[],
  rejected: LspWorkspaceEditRejectedItem[],
): Map<string, LspWorkspaceEditOpenState> {
  const map = new Map<string, LspWorkspaceEditOpenState>();
  for (const doc of openDocuments) {
    let docPath = normalizePortablePath(doc.path ?? "");
    if (!docPath && doc.uri) {
      const resolved = resolveWorkspaceEditUri(config, root, doc.uri);
      if (!resolved.ok) {
        rejected.push({ kind: "text", uri: doc.uri, reason: `Open document ignored: ${resolved.reason}` });
        continue;
      }
      docPath = resolved.path;
    }
    if (!docPath) continue;
    map.set(docPath, doc.dirty ? "open-dirty" : "open-clean");
  }
  return map;
}

function collectWorkspaceTextEdits(
  request: LspWorkspaceEditPreviewRequest,
  rejected: LspWorkspaceEditRejectedItem[],
): Array<{ uri: string; edit: LspWorkspaceTextEdit }> {
  const edits: Array<{ uri: string; edit: LspWorkspaceTextEdit }> = [];
  if (request.textDocumentUri && Array.isArray(request.textEdits)) {
    for (const edit of request.textEdits) edits.push({ uri: request.textDocumentUri, edit });
  }
  const workspaceEdit = request.workspaceEdit;
  if (!workspaceEdit || typeof workspaceEdit !== "object") return edits;

  if (workspaceEdit.changes && typeof workspaceEdit.changes === "object") {
    for (const [uri, uriEdits] of Object.entries(workspaceEdit.changes)) {
      if (!Array.isArray(uriEdits)) {
        rejected.push({ kind: "text", uri, reason: "WorkspaceEdit changes entry is not a TextEdit array" });
        continue;
      }
      for (const edit of uriEdits) edits.push({ uri, edit });
    }
  }

  if (Array.isArray(workspaceEdit.documentChanges)) {
    for (const change of workspaceEdit.documentChanges) {
      if (isTextDocumentEdit(change)) {
        for (const edit of change.edits) edits.push({ uri: change.textDocument.uri, edit });
        continue;
      }
      const operation = resourceOperationName(change);
      rejected.push({
        kind: "resource",
        uri: change.uri ?? change.oldUri ?? change.newUri ?? null,
        operation,
        reason: "Workspace resource operations are deferred beyond M7.z-F",
      });
    }
  }

  return edits;
}

function resolveWorkspaceEditUri(
  config: TracevaneServerConfig,
  root: RootContext,
  uri: string,
): { ok: true; path: string; absolutePath: string } | { ok: false; reason: string } {
  if (typeof uri !== "string" || !uri) return { ok: false, reason: "Missing file URI" };
  let absolutePath = "";
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "file:") return { ok: false, reason: "Only file:// WorkspaceEdit URIs are supported" };
    absolutePath = fileURLToPath(parsed);
  } catch {
    return { ok: false, reason: "Invalid WorkspaceEdit URI" };
  }
  const relative = normalizePortablePath(path.relative(root.absolutePath, absolutePath));
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    return { ok: false, reason: "WorkspaceEdit target escapes the selected root" };
  }
  try {
    const resolved = resolveFilesServiceExistingFilePath(config, root.id, relative);
    return { ok: true, path: resolved.relativePath, absolutePath: resolved.absolutePath };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function isTextDocumentEdit(value: LspWorkspaceTextDocumentEdit | LspWorkspaceResourceOperation): value is LspWorkspaceTextDocumentEdit {
  const candidate = value as Partial<LspWorkspaceTextDocumentEdit>;
  return Boolean(candidate.textDocument && typeof candidate.textDocument.uri === "string" && Array.isArray(candidate.edits));
}

function resourceOperationName(value: LspWorkspaceResourceOperation): string | null {
  if (typeof value?.kind === "string") return value.kind;
  if (value?.oldUri && value?.newUri) return "rename";
  if (value?.uri) return "create/delete";
  return null;
}

function normalizeTextEdit(edit: LspWorkspaceTextEdit):
  | { ok: true; range: LspWorkspaceEditRange; newText: string }
  | { ok: false; reason: string } {
  if (!edit || typeof edit.newText !== "string") return { ok: false, reason: "TextEdit.newText must be a string" };
  const range = edit.range;
  if (!isPosition(range?.start) || !isPosition(range?.end)) return { ok: false, reason: "TextEdit.range is invalid" };
  if (comparePosition(range.start, range.end) > 0) return { ok: false, reason: "TextEdit range start is after end" };
  return { ok: true, range: { start: range.start, end: range.end }, newText: edit.newText };
}

function isPosition(value: unknown): value is { line: number; character: number } {
  const candidate = value as { line?: unknown; character?: unknown } | null;
  return Boolean(
    candidate &&
      Number.isInteger(candidate.line) &&
      Number.isInteger(candidate.character) &&
      Number(candidate.line) >= 0 &&
      Number(candidate.character) >= 0,
  );
}

function comparePosition(a: { line: number; character: number }, b: { line: number; character: number }): number {
  return a.line === b.line ? a.character - b.character : a.line - b.line;
}

function applyTextEditsToContent(
  content: string,
  items: LspWorkspaceEditPreviewItem[],
): { ok: true; content: string } | { ok: false; reason: string } {
  const spans = items.map((item) => {
    const start = offsetAt(content, item.range.start);
    const end = offsetAt(content, item.range.end);
    if (start == null || end == null) return { item, start: -1, end: -1, valid: false };
    return { item, start, end, valid: start <= end };
  });
  if (spans.some((span) => !span.valid)) return { ok: false, reason: "WorkspaceEdit contains a range outside the file content" };

  const ascending = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let index = 1; index < ascending.length; index += 1) {
    if (ascending[index].start < ascending[index - 1].end) {
      return { ok: false, reason: "WorkspaceEdit contains overlapping text edits" };
    }
  }

  let next = content;
  for (const span of [...spans].sort((a, b) => b.start - a.start || b.end - a.end)) {
    next = next.slice(0, span.start) + span.item.newText + next.slice(span.end);
  }
  return { ok: true, content: next };
}

function offsetAt(content: string, position: { line: number; character: number }): number | null {
  let line = 0;
  let lineStart = 0;
  for (let index = 0; index < content.length && line < position.line; index += 1) {
    if (content.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }
  if (line !== position.line) return null;
  const lineEnd = content.indexOf("\n", lineStart);
  const end = lineEnd === -1 ? content.length : lineEnd;
  const offset = lineStart + position.character;
  return offset <= end ? offset : null;
}

function buildPreviewResponse<T extends "workspaceEditPreview" | "workspaceEditApply">(
  request: LspWorkspaceEditPreviewRequest,
  rootId: string,
  items: LspWorkspaceEditPreviewItem[],
  rejected: LspWorkspaceEditRejectedItem[],
  type: T,
): T extends "workspaceEditApply" ? LspWorkspaceEditApplyResponse : LspWorkspaceEditPreviewResponse {
  const affected = new Set(items.map((item) => item.path));
  const openClean = new Set(items.filter((item) => item.openState === "open-clean").map((item) => item.path));
  const openDirty = new Set(items.filter((item) => item.openState === "open-dirty").map((item) => item.path));
  const closed = new Set(items.filter((item) => item.openState === "closed").map((item) => item.path));
  return {
    type,
    rootId,
    source: request.source || "manual",
    checkedAt: new Date().toISOString(),
    items,
    rejected,
    summary: {
      totalTextEdits: items.length,
      affectedFiles: affected.size,
      openCleanFiles: openClean.size,
      openDirtyFiles: openDirty.size,
      closedFiles: closed.size,
      rejected: rejected.length,
      applySupported: items.length > 0 && openDirty.size === 0 && rejected.length === 0,
    },
  } as T extends "workspaceEditApply" ? LspWorkspaceEditApplyResponse : LspWorkspaceEditPreviewResponse;
}

function normalizePortablePath(value: string): string {
  return String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}
