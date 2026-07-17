import type { FileEntrySummary } from "../../../../../types/files";
import type { ExplorerFileType } from "./types";

const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac"]);
const ARCHIVE_EXTENSIONS = new Set(["zip", "tar", "gz", "tgz", "bz2", "xz", "7z", "rar"]);
const DOCUMENT_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv"]);
const CODE_EXTENSIONS = new Set([
  "c",
  "cc",
  "cpp",
  "cs",
  "css",
  "go",
  "html",
  "java",
  "js",
  "jsx",
  "json",
  "mjs",
  "py",
  "rs",
  "sh",
  "sql",
  "ts",
  "tsx",
  "vue",
  "xml",
  "yaml",
  "yml",
]);
const TEXT_EXTENSIONS = new Set(["conf", "env", "ini", "log", "md", "txt"]);

export function explorerFileType(entry: Pick<FileEntrySummary, "kind" | "ext" | "textLike" | "imageLike">): ExplorerFileType {
  if (entry.kind === "directory") return "directory";
  const ext = (entry.ext ?? "").replace(/^\./, "").toLowerCase();

  if (entry.imageLike) return "image";
  if (ext === "pdf") return "pdf";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (ARCHIVE_EXTENSIONS.has(ext)) return "archive";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  if (entry.textLike || TEXT_EXTENSIONS.has(ext)) return "text";
  if (DOCUMENT_EXTENSIONS.has(ext)) return "document";
  return "binary";
}
