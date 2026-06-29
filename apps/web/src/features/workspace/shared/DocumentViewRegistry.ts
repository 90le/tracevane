/**
 * Legacy Workspace document-view registry.
 *
 * Current Workspace work is IDE-first: files, code editor, terminal, Git,
 * search, evidence, and review. Rich Markdown/HTML rendering and visual
 * editing belong to the future `/document-engine` boundary, so labels here
 * must not present preview/editing as the active Workspace mainline.
 */
export type DocumentPreviewKind = "markdown" | "html" | "json" | "csv" | "image" | "video" | "audio" | "pdf" | "archive" | "text" | "binary";
export type DocumentVisualEditorKind = "markdown" | "html";

export interface DocumentMatchContext {
  textLike?: boolean;
  imageLike?: boolean;
}

export interface DocumentViewerDescriptor {
  id: DocumentPreviewKind;
  label: string;
  extensions: readonly string[];
  requiresText?: boolean;
  requiresDownloadUrl?: boolean;
  match: (path: string, context?: DocumentMatchContext) => boolean;
}

export interface DocumentVisualEditorDescriptor {
  id: DocumentVisualEditorKind;
  label: string;
  extensions: readonly string[];
  requiresText: true;
  match: (path: string, context?: DocumentMatchContext) => boolean;
}

const markdownExtensions = ["md", "markdown", "mdx"] as const;
const htmlExtensions = ["html", "htm", "xhtml"] as const;
const jsonExtensions = ["json", "jsonc", "geojson", "webmanifest"] as const;
const csvExtensions = ["csv", "tsv"] as const;
const imageExtensions = ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico"] as const;
const videoExtensions = ["mp4", "webm", "ogg", "ogv", "mov", "m4v"] as const;
const audioExtensions = ["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "weba"] as const;
const pdfExtensions = ["pdf"] as const;
const archiveSuffixes = [
  ".tar.gz",
  ".tar.gzip",
  ".tgz",
  ".tar.bz2",
  ".tar.bzip2",
  ".tbz",
  ".tbz2",
  ".tb2",
  ".tar.xz",
  ".tar.lzma",
  ".txz",
  ".tlz",
  ".zip",
  ".tar",
] as const;

export const DOCUMENT_VIEWERS: readonly DocumentViewerDescriptor[] = [
  {
    id: "markdown",
    label: "Markdown legacy adapter",
    extensions: markdownExtensions,
    requiresText: true,
    match: (path) => hasDocumentExtension(path, markdownExtensions),
  },
  {
    id: "html",
    label: "HTML legacy adapter",
    extensions: htmlExtensions,
    requiresText: true,
    match: (path) => hasDocumentExtension(path, htmlExtensions),
  },
  {
    id: "json",
    label: "JSON 结构检查",
    extensions: jsonExtensions,
    requiresText: true,
    match: (path) => hasDocumentExtension(path, jsonExtensions),
  },
  {
    id: "csv",
    label: "CSV/TSV 表格检查",
    extensions: csvExtensions,
    requiresText: true,
    match: (path) => hasDocumentExtension(path, csvExtensions),
  },
  {
    id: "image",
    label: "图片只读检查",
    extensions: imageExtensions,
    requiresDownloadUrl: true,
    match: (path, context) => Boolean(context?.imageLike) || hasDocumentExtension(path, imageExtensions),
  },
  {
    id: "video",
    label: "视频只读检查",
    extensions: videoExtensions,
    requiresDownloadUrl: true,
    match: (path) => hasDocumentExtension(path, videoExtensions),
  },
  {
    id: "audio",
    label: "音频只读检查",
    extensions: audioExtensions,
    requiresDownloadUrl: true,
    match: (path) => hasDocumentExtension(path, audioExtensions),
  },
  {
    id: "pdf",
    label: "PDF 只读检查",
    extensions: pdfExtensions,
    requiresDownloadUrl: true,
    match: (path) => hasDocumentExtension(path, pdfExtensions),
  },
  {
    id: "archive",
    label: "压缩包清单检查",
    extensions: archiveSuffixes,
    match: (path) => isArchiveDocument(path),
  },
  {
    id: "text",
    label: "文本源码检查",
    extensions: [],
    requiresText: true,
    match: (_path, context) => Boolean(context?.textLike),
  },
  {
    id: "binary",
    label: "二进制/未知文件占位检查",
    extensions: [],
    requiresDownloadUrl: true,
    match: (_path, context) => context?.textLike === false,
  },
];

export const DOCUMENT_VISUAL_EDITORS: readonly DocumentVisualEditorDescriptor[] = [
  {
    id: "markdown",
    label: "Markdown future document-engine adapter",
    extensions: markdownExtensions,
    requiresText: true,
    match: (path, context) => Boolean(context?.textLike) && hasDocumentExtension(path, markdownExtensions),
  },
  {
    id: "html",
    label: "HTML future document-engine adapter",
    extensions: htmlExtensions,
    requiresText: true,
    match: (path, context) => Boolean(context?.textLike) && hasDocumentExtension(path, htmlExtensions),
  },
];

export function getDocumentViewer(
  path: string,
  context: DocumentMatchContext = {},
): DocumentViewerDescriptor | null {
  return DOCUMENT_VIEWERS.find((viewer) => viewer.match(path, context)) ?? null;
}

export function getDocumentVisualEditor(
  path: string,
  context: DocumentMatchContext = {},
): DocumentVisualEditorDescriptor | null {
  return DOCUMENT_VISUAL_EDITORS.find((editor) => editor.match(path, context)) ?? null;
}

export function canRenderRegisteredDocumentPreview(path: string, context: DocumentMatchContext = {}): boolean {
  const viewer = getDocumentViewer(path, context);
  return Boolean(viewer && viewer.id !== "text");
}

export function canEditRegisteredDocumentVisually(path: string, textLike = true): boolean {
  return Boolean(getDocumentVisualEditor(path, { textLike }));
}

export function isMarkdownDocument(path: string): boolean {
  return hasDocumentExtension(path, markdownExtensions);
}

export function isHtmlDocument(path: string): boolean {
  return hasDocumentExtension(path, htmlExtensions);
}

export function isJsonDocument(path: string): boolean {
  return hasDocumentExtension(path, jsonExtensions);
}

export function isCsvDocument(path: string): boolean {
  return hasDocumentExtension(path, csvExtensions);
}

export function isVideoDocument(path: string): boolean {
  return hasDocumentExtension(path, videoExtensions);
}

export function isAudioDocument(path: string): boolean {
  return hasDocumentExtension(path, audioExtensions);
}

export function isPdfDocument(path: string): boolean {
  return hasDocumentExtension(path, pdfExtensions);
}

export function isArchiveDocument(path: string): boolean {
  const normalized = path.toLowerCase().trim();
  return archiveSuffixes.some((suffix) => normalized.endsWith(suffix));
}

export function documentExtension(path: string): string {
  const name = path.toLowerCase().split("/").pop() ?? path.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1) : "";
}

function hasDocumentExtension(path: string, extensions: readonly string[]): boolean {
  return extensions.includes(documentExtension(path));
}
