import { Copy, Download, File, FileText, ImageIcon, Music, RefreshCw, RotateCcw, Search, Video, ZoomIn, ZoomOut } from "lucide-react";
import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import type { FileEntrySummary, FilesReadPayload } from "../../../../../types/files";

export type FileSurfacePreviewKind = "image" | "video" | "audio" | "pdf" | "binary";

type FileSurfaceEntry = Pick<
  FileEntrySummary,
  "path" | "name" | "ext" | "size" | "modifiedAt" | "permissions" | "imageLike"
>;

type FileSurfaceRead = Pick<
  FilesReadPayload,
  "ext" | "imageLike" | "mimeType" | "modifiedAt" | "permissions" | "size"
>;

export interface FileSurfacePreviewPanelProps {
  rootId: string;
  entry: FileSurfaceEntry;
  read?: FileSurfaceRead;
  loading?: boolean;
  error?: string;
  onReload?: () => void;
  statusNote?: string;
  chrome?: "full" | "embedded";
  className?: string;
}

const IMAGE_FILE_EXTENSIONS = new Set([".apng", ".avif", ".bmp", ".gif", ".ico", ".jpeg", ".jpg", ".png", ".svg", ".webp"]);
const VIDEO_FILE_EXTENSIONS = new Set([".m4v", ".mov", ".mp4", ".ogg", ".ogv", ".webm"]);
const AUDIO_FILE_EXTENSIONS = new Set([".aac", ".flac", ".m4a", ".mp3", ".oga", ".ogg", ".opus", ".wav", ".weba"]);

export function classifyFileSurfacePreview(
  read: FileSurfaceRead | undefined,
  entry: FileSurfaceEntry,
): FileSurfacePreviewKind {
  const mimeType = (read?.mimeType ?? "").toLowerCase();
  const ext = (read?.ext ?? entry.ext ?? "").toLowerCase();
  if (read?.imageLike || entry.imageLike || mimeType.startsWith("image/") || IMAGE_FILE_EXTENSIONS.has(ext)) return "image";
  if (mimeType.startsWith("video/") || VIDEO_FILE_EXTENSIONS.has(ext)) return "video";
  if (mimeType.startsWith("audio/") || AUDIO_FILE_EXTENSIONS.has(ext)) return "audio";
  if (mimeType === "application/pdf" || ext === ".pdf") return "pdf";
  return "binary";
}

export function FileSurfacePreviewPanel({
  rootId,
  entry,
  read,
  loading = false,
  error,
  onReload,
  statusNote = "共享 File Surface · 非文本只读预览",
  chrome = "full",
  className,
}: FileSurfacePreviewPanelProps) {
  const previewKind = classifyFileSurfacePreview(read, entry);
  const downloadUrl = buildFileDownloadUrl(rootId, entry.path, false);
  const attachmentUrl = buildFileDownloadUrl(rootId, entry.path, true);
  const size = formatFileSize(read?.size ?? entry.size);
  const modified = formatModifiedAt(read?.modifiedAt ?? entry.modifiedAt);
  const mimeType = read?.mimeType || "application/octet-stream";
  const PreviewIcon = previewKind === "image"
    ? ImageIcon
    : previewKind === "video"
      ? Video
      : previewKind === "audio"
        ? Music
        : previewKind === "pdf"
          ? FileText
          : File;
  const embedded = chrome === "embedded";

  return (
    <div
      className={cn(
        "grid min-h-0 flex-1 bg-panel",
        embedded ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)_auto]",
        className,
      )}
      data-file-surface-panel
      data-file-surface-kind={previewKind}
      data-file-surface-chrome={chrome}
    >
      {!embedded ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-1 font-medium text-ink-strong">
            <PreviewIcon className="size-3.5" />
            {previewKindLabel(previewKind)}
          </span>
          <span className="min-w-0 flex-1 truncate text-muted">{entry.path}</span>
          {error ? <span className="text-danger" data-file-surface-read-error>{error}</span> : null}
          {onReload ? (
            <Button variant="ghost" size="sm" onClick={onReload} disabled={loading} data-file-surface-reload>
              <RefreshCw className="size-3.5" />
              {loading ? "读取中…" : "刷新"}
            </Button>
          ) : null}
          <Button asChild variant="outline" size="sm" data-file-surface-open-inline>
            <a href={downloadUrl} target="_blank" rel="noreferrer">打开</a>
          </Button>
          <Button asChild variant="primary" size="sm" data-file-surface-download>
            <a href={attachmentUrl} download>
              <Download className="size-3.5" />
              下载
            </a>
          </Button>
        </div>
      ) : null}
      <div
        className={cn(
          "min-h-0",
          embedded ? "p-2" : "p-4",
          previewKind === "image" || previewKind === "video" || previewKind === "pdf" ? "overflow-hidden" : "overflow-auto",
        )}
        data-file-surface-preview
      >
        {previewKind === "image" ? (
          <ImagePreviewCanvas src={downloadUrl} alt={entry.name} />
        ) : previewKind === "video" ? (
          <VideoPreviewPlayer src={downloadUrl} name={entry.name} />
        ) : previewKind === "audio" ? (
          <AudioPreviewPlayer src={downloadUrl} name={entry.name} />
        ) : previewKind === "pdf" ? (
          <PdfPreviewFrame src={downloadUrl} title={entry.name} />
        ) : (
          <HexPreviewEditor
            src={downloadUrl}
            attachmentUrl={attachmentUrl}
            name={entry.name}
            size={read?.size ?? entry.size ?? 0}
            embedded={embedded}
          />
        )}
      </div>
      {!embedded ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line bg-panel px-3 py-2 text-xs text-muted" data-file-surface-statusbar>
          <span>{mimeType}</span>
          <span>{size}</span>
          <span>{read?.permissions ?? entry.permissions ?? "权限未知"}</span>
          <span>{modified}</span>
          <span className="ml-auto">{statusNote}</span>
        </div>
      ) : null}
    </div>
  );
}

interface Point {
  x: number;
  y: number;
}

const HEX_PREVIEW_INITIAL_BYTES = 32 * 1024;
const HEX_PREVIEW_MAX_BYTES = 512 * 1024;
const HEX_BYTES_PER_ROW = 16;

function HexPreviewEditor({
  src,
  attachmentUrl,
  name,
  size,
  embedded,
}: {
  src: string;
  attachmentUrl: string;
  name: string;
  size: number;
  embedded: boolean;
}) {
  const [bytes, setBytes] = React.useState<Uint8Array | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [mode, setMode] = React.useState<"text" | "hex">("hex");
  const [matchOffset, setMatchOffset] = React.useState<number | null>(null);
  const [readLimit, setReadLimit] = React.useState(() => Math.min(HEX_PREVIEW_INITIAL_BYTES, Math.max(0, size || 0) || HEX_PREVIEW_INITIAL_BYTES));
  const rows = React.useMemo(() => bytesToHexRows(bytes), [bytes]);
  const loadedBytes = bytes?.length ?? 0;
  const boundedSize = Number.isFinite(size) && size > 0 ? size : HEX_PREVIEW_MAX_BYTES;
  const canLoadMore = loadedBytes > 0 && loadedBytes < Math.min(boundedSize, HEX_PREVIEW_MAX_BYTES);
  const truncated = Number.isFinite(size) && size > loadedBytes;

  React.useEffect(() => {
    setReadLimit(Math.min(HEX_PREVIEW_INITIAL_BYTES, Math.max(0, size || 0) || HEX_PREVIEW_INITIAL_BYTES));
  }, [src, size]);

  React.useEffect(() => {
    const controller = new AbortController();
    const nextLimit = Math.max(1, Math.min(readLimit, HEX_PREVIEW_MAX_BYTES));
    setLoading(true);
    setError(null);
    setBytes(null);
    fetch(src, {
      signal: controller.signal,
      headers: { Range: `bytes=0-${nextLimit - 1}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        setBytes(new Uint8Array(buffer).slice(0, nextLimit));
      })
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [readLimit, src]);

  React.useEffect(() => {
    if (!bytes || !query.trim()) {
      setMatchOffset(null);
      return;
    }
    setMatchOffset(findByteSequence(bytes, query.trim(), mode));
  }, [bytes, mode, query]);

  const copyHex = React.useCallback(async () => {
    if (!bytes) return;
    const text = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
    await navigator.clipboard?.writeText(text);
  }, [bytes]);

  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden rounded-md border border-line bg-panel-2",
        embedded ? "grid-rows-[auto_minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]",
      )}
      data-file-surface-binary
      data-file-surface-hex-editor
      data-file-surface-hex-readonly="true"
      data-file-surface-hex-loaded-bytes={loadedBytes}
      data-file-surface-hex-read-limit={readLimit}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        <span className="inline-flex min-w-0 items-center gap-1 font-medium text-ink-strong">
          <File className="size-3.5 shrink-0" />
          <span className="truncate">Hex Editor</span>
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-subtle">{name}</span>
        <span className="rounded border border-amber-line bg-amber-soft px-1.5 py-0.5 text-amber">只读基础</span>
        <Button variant="ghost" size="sm" onClick={copyHex} disabled={!bytes || loading} data-file-surface-hex-copy>
          <Copy className="size-3.5" />
          复制 Hex
        </Button>
        <Button asChild variant="outline" size="sm" data-file-surface-download>
          <a href={attachmentUrl} download>
            <Download className="size-3.5" />
            下载
          </a>
        </Button>
      </div>
      <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-line bg-canvas px-3 py-2 text-xs text-muted">
          <Search className="size-3.5 shrink-0" />
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value === "text" ? "text" : "hex")}
            className="h-7 rounded border border-line bg-panel px-2 text-xs text-ink outline-none focus-visible:shadow-[var(--ring)]"
            data-file-surface-hex-search-mode
          >
            <option value="hex">Hex</option>
            <option value="text">Text</option>
          </select>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={mode === "hex" ? "搜索：00 ff 7a" : "搜索 ASCII 文本"}
            className="h-7 min-w-0 flex-1 rounded border border-line bg-panel px-2 font-mono text-xs text-ink outline-none focus-visible:shadow-[var(--ring)]"
            data-file-surface-hex-search
          />
          {query.trim() ? (
            <span data-file-surface-hex-search-result>
              {matchOffset == null ? "未找到" : `offset 0x${matchOffset.toString(16).padStart(8, "0")}`}
            </span>
          ) : null}
          <span className="ml-auto">
            {bytes ? `${formatFileSize(bytes.length)} loaded` : "未加载"}
            {truncated ? ` / ${formatFileSize(size)} total` : ""}
          </span>
          {canLoadMore ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReadLimit((value) => Math.min(value * 2, HEX_PREVIEW_MAX_BYTES, boundedSize))}
              disabled={loading}
              data-file-surface-hex-load-more
            >
              加载更多
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 overflow-auto bg-canvas p-3 font-mono text-xs leading-5 text-ink" data-file-surface-hex-viewport>
          {loading ? (
            <div className="rounded border border-line bg-panel px-3 py-2 text-muted">正在读取二进制内容…</div>
          ) : error ? (
            <div className="rounded border border-danger-line bg-danger-soft px-3 py-2 text-danger">Hex 读取失败：{error}</div>
          ) : rows.length ? (
            <div className="grid gap-0.5">
              {rows.map((row) => (
                <div
                  key={row.offset}
                  className={cn(
                    "grid grid-cols-[5.5rem_minmax(15rem,1fr)_8rem] gap-3 rounded px-2 py-0.5",
                    matchOffset != null && matchOffset >= row.offset && matchOffset < row.offset + row.bytes.length
                      ? "bg-primary-soft"
                      : "hover:bg-panel",
                  )}
                  data-file-surface-hex-row
                >
                  <span className="select-none text-subtle">0x{row.offset.toString(16).padStart(8, "0")}</span>
                  <span className="break-all text-ink-strong">{row.hex}</span>
                  <span className="truncate text-muted">{row.ascii}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded border border-line bg-panel px-3 py-2 text-muted">空文件。</div>
          )}
        </div>
      </div>
    </div>
  );
}

function bytesToHexRows(bytes: Uint8Array | null) {
  if (!bytes) return [];
  const rows: Array<{ offset: number; bytes: Uint8Array; hex: string; ascii: string }> = [];
  for (let offset = 0; offset < bytes.length; offset += HEX_BYTES_PER_ROW) {
    const rowBytes = bytes.slice(offset, offset + HEX_BYTES_PER_ROW);
    const hex = Array.from(rowBytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const ascii = Array.from(rowBytes, (byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : ".")).join("");
    rows.push({ offset, bytes: rowBytes, hex, ascii });
  }
  return rows;
}

function findByteSequence(bytes: Uint8Array, query: string, mode: "text" | "hex"): number | null {
  const needle = mode === "text" ? new TextEncoder().encode(query) : parseHexQuery(query);
  if (!needle.length || needle.length > bytes.length) return null;
  outer:
  for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer;
    }
    return index;
  }
  return null;
}

function parseHexQuery(query: string): Uint8Array {
  const normalized = query.replace(/0x/gi, "").replace(/[^0-9a-f]/gi, "");
  if (!normalized || normalized.length % 2 !== 0) return new Uint8Array();
  const output = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    output[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return output;
}

const IMAGE_PREVIEW_MIN_ZOOM = 0.1;
const IMAGE_PREVIEW_MAX_ZOOM = 12;
const IMAGE_PREVIEW_ZOOM_STEP = 1.2;

function ImagePreviewCanvas({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = React.useState(1);
  const [pan, setPan] = React.useState<Point>({ x: 0, y: 0 });
  const [rotation, setRotation] = React.useState(0);
  const dragStartRef = React.useRef<{ pointerId: number; pointer: Point; pan: Point } | null>(null);

  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const resetView = React.useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  }, []);
  const updateZoom = React.useCallback((nextZoom: number) => {
    setZoom(clampNumber(nextZoom, IMAGE_PREVIEW_MIN_ZOOM, IMAGE_PREVIEW_MAX_ZOOM));
  }, []);

  return (
    <div className="grid min-h-full grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-line bg-panel-2" data-file-surface-image-viewer>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        <Button variant="ghost" size="sm" onClick={() => updateZoom(zoom / IMAGE_PREVIEW_ZOOM_STEP)} data-file-surface-image-zoom-out>
          <ZoomOut className="size-3.5" />
          缩小
        </Button>
        <span className="min-w-14 text-center font-mono text-muted" data-file-surface-image-zoom-label>{zoomLabel}</span>
        <Button variant="ghost" size="sm" onClick={() => updateZoom(zoom * IMAGE_PREVIEW_ZOOM_STEP)} data-file-surface-image-zoom-in>
          <ZoomIn className="size-3.5" />
          放大
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRotation((value) => (value + 90) % 360)} data-file-surface-image-rotate>
          <RotateCcw className="size-3.5" />
          旋转
        </Button>
        <Button variant="outline" size="sm" onClick={resetView} data-file-surface-image-reset>
          适应窗口
        </Button>
        <span className="ml-auto text-muted">滚轮缩放 · 拖动画布 · 双击复位</span>
      </div>
      <div
        className="relative min-h-0 cursor-grab touch-none select-none overflow-hidden bg-[radial-gradient(circle_at_center,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:18px_18px] active:cursor-grabbing"
        data-file-surface-image-canvas
        onDoubleClick={resetView}
        onWheel={(event) => {
          event.preventDefault();
          const direction = event.deltaY < 0 ? 1 : -1;
          const factor = direction > 0 ? IMAGE_PREVIEW_ZOOM_STEP : 1 / IMAGE_PREVIEW_ZOOM_STEP;
          updateZoom(zoom * factor);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragStartRef.current = {
            pointerId: event.pointerId,
            pointer: { x: event.clientX, y: event.clientY },
            pan,
          };
        }}
        onPointerMove={(event) => {
          const dragStart = dragStartRef.current;
          if (!dragStart || dragStart.pointerId !== event.pointerId) return;
          setPan({
            x: dragStart.pan.x + event.clientX - dragStart.pointer.x,
            y: dragStart.pan.y + event.clientY - dragStart.pointer.y,
          });
        }}
        onPointerUp={(event) => {
          if (dragStartRef.current?.pointerId === event.pointerId) dragStartRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (dragStartRef.current?.pointerId === event.pointerId) dragStartRef.current = null;
        }}
      >
        <div className="absolute inset-0 grid place-items-center p-6">
          <img
            src={src}
            alt={alt}
            draggable={false}
            className="max-h-full max-w-full rounded border border-line bg-panel object-contain shadow-lg will-change-transform"
            data-file-surface-image
            style={{
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>
    </div>
  );
}

function VideoPreviewPlayer({ src, name }: { src: string; name: string }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-md border border-line bg-panel-2" data-file-surface-video-viewer>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{name}</span>
        <Button variant="ghost" size="sm" onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); }} data-file-surface-video-backward>后退 10s</Button>
        <Button variant="ghost" size="sm" onClick={() => { if (videoRef.current) videoRef.current.currentTime += 10; }} data-file-surface-video-forward>前进 10s</Button>
        <label className="flex items-center gap-1 text-muted">
          速度
          <select
            className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
            defaultValue="1"
            onChange={(event) => { if (videoRef.current) videoRef.current.playbackRate = Number(event.target.value); }}
            data-file-surface-video-speed
          >
            <option value="0.5">0.5x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </label>
      </div>
      <div className="grid h-full min-h-0 place-items-center overflow-hidden bg-black p-3">
        <video ref={videoRef} src={src} controls playsInline preload="metadata" className="h-full min-h-0 max-h-full w-full max-w-full rounded border border-line bg-black object-contain" data-file-surface-video>
          当前浏览器无法播放该视频。
        </video>
      </div>
    </div>
  );
}

function AudioPreviewPlayer({ src, name }: { src: string; name: string }) {
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  return (
    <div className="grid min-h-full place-items-center rounded-md border border-line bg-panel-2 p-6" data-file-surface-audio-viewer>
      <div className="w-full max-w-2xl rounded-md border border-line bg-panel p-4 text-center shadow-sm">
        <Music className="mx-auto mb-3 size-10 text-primary" />
        <div className="mb-3 text-sm font-medium text-ink-strong">{name}</div>
        <audio ref={audioRef} src={src} controls preload="metadata" className="w-full" data-file-surface-audio>
          当前浏览器无法播放该音频。
        </audio>
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <Button variant="ghost" size="sm" onClick={() => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 10); }} data-file-surface-audio-backward>后退 10s</Button>
          <Button variant="ghost" size="sm" onClick={() => { if (audioRef.current) audioRef.current.currentTime += 10; }} data-file-surface-audio-forward>前进 10s</Button>
          <label className="flex items-center gap-1 text-muted">
            速度
            <select
              className="h-8 rounded border border-line bg-panel px-2 text-xs text-ink outline-none"
              defaultValue="1"
              onChange={(event) => { if (audioRef.current) audioRef.current.playbackRate = Number(event.target.value); }}
              data-file-surface-audio-speed
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

function PdfPreviewFrame({ src, title }: { src: string; title: string }) {
  return (
    <div className="grid h-full min-h-[520px] overflow-hidden rounded-md border border-line bg-panel-2" data-file-surface-pdf-viewer>
      <object data={src} type="application/pdf" className="h-full min-h-[520px] w-full" data-file-surface-pdf>
        <iframe title={title} src={src} className="h-full min-h-[520px] w-full" />
      </object>
    </div>
  );
}

function buildFileDownloadUrl(rootId: string, path: string, attachment = false): string {
  const search = new URLSearchParams({ rootId, path });
  if (attachment) search.set("download", "1");
  return `/api/files/download?${search.toString()}`;
}

function previewKindLabel(kind: FileSurfacePreviewKind): string {
  switch (kind) {
    case "image":
      return "图片预览";
    case "video":
      return "视频预览";
    case "audio":
      return "音频预览";
    case "pdf":
      return "PDF 预览";
    case "binary":
      return "二进制检查";
  }
}

function formatFileSize(size: number | null | undefined): string {
  if (typeof size !== "number" || !Number.isFinite(size)) return "Size —";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const precision = value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatModifiedAt(value: string | null | undefined): string {
  if (!value) return "mtime —";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
