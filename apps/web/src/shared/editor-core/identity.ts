import type { EditorDocumentId, EditorFileRef } from "./types";

function normalizeEditorPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%2F/gi, "/");
}

export function editorDocumentId(ref: EditorFileRef): EditorDocumentId {
  return `${ref.rootId}:${normalizeEditorPath(ref.path)}`;
}

export function editorModelUriPath(ref: EditorFileRef): string {
  const root = encodeURIComponent(ref.rootId || "root");
  const path = normalizeEditorPath(ref.path)
    .split("/")
    .filter(Boolean)
    .map(encodePathSegment)
    .join("/");
  return `/workspace/${root}${path ? `/${path}` : ""}`;
}

export function editorModelUriString(ref: EditorFileRef): string {
  return `file://${editorModelUriPath(ref)}`;
}

export function editorTitleForPath(path: string): string {
  const normalized = normalizeEditorPath(path);
  return normalized.split("/").filter(Boolean).pop() || normalized || "Untitled";
}
