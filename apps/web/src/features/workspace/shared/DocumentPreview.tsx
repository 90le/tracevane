import * as React from "react";
import {
  Download,
  ExternalLink,
  FileAudio,
  FileText,
  MoreHorizontal,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { ArchivePreview } from "./ArchivePreview";
import { BinaryFilePreview } from "./BinaryFilePreview";
import { CsvPreview } from "./CsvPreview";
import { JsonPreview } from "./JsonPreview";
import { TextSlicePreview } from "./TextSlicePreview";
import {
  canRenderRegisteredDocumentPreview,
  getDocumentViewer,
  isAudioDocument,
  isCsvDocument,
  isHtmlDocument,
  isJsonDocument,
  isMarkdownDocument,
  isPdfDocument,
  isVideoDocument,
  isArchiveDocument,
} from "./DocumentViewRegistry";

import { MarkdownPreview } from "@/features/workspace/preview/MarkdownPreview";

export interface DocumentPreviewProps {
  path: string;
  content: string;
  rootId?: string;
  name?: string;
  imageLike?: boolean;
  textLike?: boolean;
  mimeType?: string | null;
  downloadUrl?: string | null;
  size?: number;
  truncated?: boolean;
  contentOffset?: number;
  contentBytes?: number;
  readLimitBytes?: number;
  className?: string;
  surface?: "workspace" | "card";
}

export function DocumentPreview({
  path,
  content,
  rootId,
  name,
  imageLike = false,
  textLike = true,
  mimeType,
  downloadUrl,
  size,
  truncated = false,
  contentOffset = 0,
  contentBytes = content.length,
  readLimitBytes = content.length,
  className,
  surface = "workspace",
}: DocumentPreviewProps) {
  const label = name || path.split("/").pop() || path;
  const resolvedDownloadUrl =
    downloadUrl ?? (rootId ? buildFileDownloadUrl(rootId, path, false) : null);

  const viewer = getDocumentViewer(path, { textLike, imageLike });
  const [mediaZoom, setMediaZoom] = React.useState(1);

  React.useEffect(() => {
    setMediaZoom(1);
  }, [path]);

  if (viewer?.id === "markdown") {
    return (
      <div
        className={cn(
          surfaceClass(surface),
          "overflow-hidden bg-panel",
          className,
        )}
        data-document-preview-kind="markdown"
      >
        <MarkdownPreview path={path} rootId={rootId} content={content} />
      </div>
    );
  }

  if (viewer?.id === "html") {
    return (
      <div
        className={cn(
          surfaceClass(surface),
          "overflow-hidden bg-panel-2 p-0",
          className,
        )}
        data-document-preview-kind="html"
      >
        <iframe
          title={`HTML preview ${label}`}
          sandbox=""
          srcDoc={content}
          className="h-full min-h-0 w-full bg-white"
        />
      </div>
    );
  }

  if (viewer?.id === "json") {
    return (
      <JsonPreview
        content={content}
        className={cn(surfaceClass(surface), className)}
        data-document-preview-kind="json"
      />
    );
  }

  if (viewer?.id === "csv") {
    return (
      <CsvPreview
        path={path}
        content={content}
        className={cn(surfaceClass(surface), className)}
        data-document-preview-kind="csv"
      />
    );
  }

  if (viewer?.id === "image" && resolvedDownloadUrl) {
    return (
      <MediaPreviewStage
        surface={surface}
        className={className}
        label={label}
        zoom={mediaZoom}
        onZoomChange={setMediaZoom}
        downloadUrl={resolvedDownloadUrl}
        attachmentUrl={
          rootId
            ? buildFileDownloadUrl(rootId, path, true)
            : resolvedDownloadUrl
        }
        previewKind="image"
      >
        <img
          src={resolvedDownloadUrl}
          alt={label}
          draggable={false}
          className="block rounded-lg object-contain shadow-lg shadow-black/10 transition-[width,max-height,transform]"
          data-media-preview-image
          style={mediaFitStyle(mediaZoom)}
        />
      </MediaPreviewStage>
    );
  }

  if (viewer?.id === "video" && resolvedDownloadUrl) {
    return (
      <MediaPreviewStage
        surface={surface}
        className={className}
        label={label}
        zoom={mediaZoom}
        onZoomChange={setMediaZoom}
        downloadUrl={resolvedDownloadUrl}
        attachmentUrl={
          rootId
            ? buildFileDownloadUrl(rootId, path, true)
            : resolvedDownloadUrl
        }
        dark
        previewKind="video"
      >
        <video
          src={resolvedDownloadUrl}
          controls
          playsInline
          preload="metadata"
          className="block rounded-lg bg-black shadow-lg shadow-black/20 transition-[width,max-height,transform]"
          data-media-preview-video
          style={mediaFitStyle(mediaZoom)}
        />
      </MediaPreviewStage>
    );
  }

  if (viewer?.id === "audio" && resolvedDownloadUrl) {
    return (
      <AudioPreviewStage
        surface={surface}
        className={className}
        label={label}
        path={path}
        downloadUrl={resolvedDownloadUrl}
        attachmentUrl={
          rootId
            ? buildFileDownloadUrl(rootId, path, true)
            : resolvedDownloadUrl
        }
      />
    );
  }

  if (viewer?.id === "pdf" && resolvedDownloadUrl) {
    return (
      <PdfPreviewStage
        surface={surface}
        className={className}
        label={label}
        downloadUrl={resolvedDownloadUrl}
        attachmentUrl={
          rootId
            ? buildFileDownloadUrl(rootId, path, true)
            : resolvedDownloadUrl
        }
      />
    );
  }

  if (viewer?.id === "archive") {
    return (
      <ArchivePreview
        rootId={rootId}
        path={path}
        className={cn(surfaceClass(surface), className)}
        data-document-preview-kind="archive"
      />
    );
  }

  if (viewer?.id === "text" && (truncated || (size ?? 0) > contentBytes)) {
    return (
      <TextSlicePreview
        rootId={rootId}
        path={path}
        initialRead={{
          content,
          contentOffset,
          contentBytes,
          readLimitBytes,
          size: size ?? contentBytes,
          truncated,
        }}
        className={cn(surfaceClass(surface), className)}
        data-document-preview-kind="text"
      />
    );
  }

  if (viewer?.id === "binary") {
    return (
      <BinaryFilePreview
        rootId={rootId}
        path={path}
        name={name}
        mimeType={mimeType}
        size={size}
        downloadUrl={resolvedDownloadUrl}
        className={cn(surfaceClass(surface), className)}
        data-document-preview-kind="binary"
      />
    );
  }

  return (
    <pre
      className={cn(
        surfaceClass(surface),
        "overflow-auto whitespace-pre-wrap bg-panel font-mono text-xs leading-relaxed text-ink",
        className,
      )}
      data-document-preview-kind="text-fallback"
    >
      {content}
    </pre>
  );
}

export function buildFileDownloadUrl(
  rootId: string,
  path: string,
  attachment = false,
): string {
  const params = new URLSearchParams({ rootId, path });
  if (attachment) params.set("download", "true");
  return `/api/files/download?${params.toString()}`;
}

export function canRenderDocumentPreview(
  path: string,
  imageLike = false,
  textLike?: boolean,
): boolean {
  return canRenderRegisteredDocumentPreview(path, { imageLike, textLike });
}

export {
  isArchiveDocument,
  isAudioDocument,
  isCsvDocument,
  isHtmlDocument,
  isJsonDocument,
  isMarkdownDocument,
  isPdfDocument,
  isVideoDocument,
};

function AudioPreviewStage({
  surface,
  className,
  label,
  path,
  downloadUrl,
  attachmentUrl,
}: {
  surface: DocumentPreviewProps["surface"];
  className?: string;
  label: string;
  path: string;
  downloadUrl: string;
  attachmentUrl: string;
}) {
  return (
    <section
      className={cn(
        surfaceClass(surface),
        "grid min-h-0 place-items-center overflow-auto bg-panel p-3 sm:p-6",
        className,
      )}
      data-document-preview-kind="audio"
      data-audio-preview-stage
    >
      <div className="grid w-full max-w-3xl gap-4 rounded-xl border border-line bg-canvas p-4 shadow-sm sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
            <FileAudio className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-2xs font-semibold uppercase tracking-[.12em] text-subtle">
              Audio preview
            </div>
            <h3
              className="mt-1 truncate text-base font-semibold text-ink-strong"
              title={label}
            >
              {label}
            </h3>
            <p
              className="mt-1 truncate font-mono text-2xs text-muted"
              title={path}
            >
              {path}
            </p>
          </div>
        </div>
        <audio
          src={downloadUrl}
          controls
          preload="metadata"
          className="block w-full"
          data-audio-preview-player
        />
        <div
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          data-audio-preview-actions
        >
          <a
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-primary-line hover:text-ink-strong"
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-4" />
            打开
          </a>
          <a
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-primary-line hover:text-ink-strong"
            href={attachmentUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="size-4" />
            下载
          </a>
        </div>
      </div>
    </section>
  );
}

function PdfPreviewStage({
  surface,
  className,
  label,
  downloadUrl,
  attachmentUrl,
}: {
  surface: DocumentPreviewProps["surface"];
  className?: string;
  label: string;
  downloadUrl: string;
  attachmentUrl: string;
}) {
  const nativePdfViewerEnabled = isNativePdfViewerProbablyEnabled();

  return (
    <section
      className={cn(
        surfaceClass(surface),
        "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-panel-2 p-0",
        className,
      )}
      data-document-preview-kind="pdf"
      data-pdf-preview-stage
    >
      <div
        className="grid min-w-0 gap-1 border-b border-line bg-panel px-2 py-1.5 text-xs text-muted sm:flex sm:items-center sm:gap-2 sm:px-3 sm:py-2"
        data-pdf-preview-toolbar
      >
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 shrink-0 text-primary" />
          <span
            className="min-w-0 flex-1 truncate font-medium text-ink-strong"
            title={label}
          >
            {label}
          </span>
        </div>
        <div
          className="grid grid-cols-2 gap-1 sm:ml-auto sm:flex sm:shrink-0"
          data-pdf-preview-actions
        >
          <a
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" />
            打开
          </a>
          <a
            className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
            href={attachmentUrl}
            target="_blank"
            rel="noreferrer"
          >
            <Download className="size-3.5" />
            下载
          </a>
        </div>
      </div>
      {!nativePdfViewerEnabled ? (
        <div
          className="border-b border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
          data-pdf-preview-fallback
        >
          当前浏览器可能不支持内嵌 PDF 预览；仍可直接打开或下载文件。
        </div>
      ) : null}
      <object
        aria-label={`PDF preview ${label}`}
        data={downloadUrl}
        type="application/pdf"
        className="h-full min-h-0 w-full bg-white"
        data-pdf-preview-frame
      >
        <div
          className="grid h-full min-h-72 place-items-center bg-panel p-6 text-center"
          data-pdf-preview-fallback
        >
          <div className="max-w-md rounded-xl border border-line bg-canvas p-5 shadow-sm">
            <FileText className="mx-auto mb-3 size-10 text-primary" />
            <h3 className="text-base font-semibold text-ink-strong">
              PDF 内嵌预览不可用
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              浏览器或安全策略阻止了 PDF
              内嵌渲染。请用新标签打开，或下载后使用本机阅读器查看。
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <a
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-primary-line bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary-soft/80"
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink className="size-4" />
                打开 PDF
              </a>
              <a
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded border border-line bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-primary-line hover:text-ink-strong"
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="size-4" />
                下载
              </a>
            </div>
          </div>
        </div>
      </object>
    </section>
  );
}

function isNativePdfViewerProbablyEnabled(): boolean {
  if (typeof navigator === "undefined") return true;
  const maybeNavigator = navigator as Navigator & {
    pdfViewerEnabled?: boolean;
  };
  return maybeNavigator.pdfViewerEnabled !== false;
}

function ImagePreviewButton({
  onClick,
  children,
  className,
}: {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong",
        className,
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function surfaceClass(surface: DocumentPreviewProps["surface"]): string {
  return surface === "card"
    ? "h-full min-h-72 min-w-0 rounded border border-line p-3"
    : "h-full min-h-0";
}

function MediaPreviewStage({
  surface,
  className,
  label,
  zoom,
  onZoomChange,
  downloadUrl,
  attachmentUrl,
  dark = false,
  previewKind,
  children,
}: {
  surface: DocumentPreviewProps["surface"];
  className?: string;
  label: string;
  zoom: number;
  onZoomChange: (updater: number | ((value: number) => number)) => void;
  downloadUrl: string;
  attachmentUrl?: string | null;
  dark?: boolean;
  previewKind: "image" | "video";
  children: React.ReactNode;
}) {
  const [mobileToolsOpen, setMobileToolsOpen] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [mediaPan, setMediaPan] = React.useState({ x: 0, y: 0 });
  const scrollportRef = React.useRef<HTMLDivElement | null>(null);
  const activePointersRef = React.useRef(
    new Map<number, { x: number; y: number }>(),
  );
  const pinchStateRef = React.useRef<{
    startDistance: number;
    startZoom: number;
  } | null>(null);
  const panStateRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  const resetGestureState = React.useCallback(() => {
    activePointersRef.current.clear();
    pinchStateRef.current = null;
    panStateRef.current = null;
    setDragging(false);
  }, []);
  React.useEffect(() => resetGestureState, [resetGestureState, label]);
  const updatePinchState = React.useCallback(() => {
    if (previewKind !== "image") return;
    const pointers = Array.from(activePointersRef.current.values());
    if (pointers.length < 2) {
      pinchStateRef.current = null;
      return;
    }
    const [first, second] = pointers;
    const distance = Math.hypot(second.x - first.x, second.y - first.y);
    if (!Number.isFinite(distance) || distance < 8) return;
    pinchStateRef.current = {
      startDistance: distance,
      startZoom: zoom,
    };
  }, [previewKind, zoom]);
  const setZoom = React.useCallback(
    (next: number | ((value: number) => number)) => {
      onZoomChange((value) => {
        const resolved = typeof next === "function" ? next(value) : next;
        return clampMediaZoom(resolved);
      });
    },
    [onZoomChange],
  );
  const zoomAtPoint = React.useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const node = scrollportRef.current;
      const clampedZoom = clampMediaZoom(nextZoom);
      if (!node || clampedZoom === zoom) {
        setZoom(clampedZoom);
        return;
      }
      const rect = node.getBoundingClientRect();
      const viewportX = clientX - rect.left;
      const viewportY = clientY - rect.top;
      const ratio = clampedZoom / zoom;
      setZoom(clampedZoom);
      setMediaPan((pan) => {
        if (previewKind !== "image") return pan;
        return {
          x: viewportX - (viewportX - pan.x) * ratio,
          y: viewportY - (viewportY - pan.y) * ratio,
        };
      });
    },
    [previewKind, setZoom, zoom],
  );
  const panBy = React.useCallback((deltaX: number, deltaY: number) => {
    setMediaPan((pan) => ({
      x: pan.x + deltaX,
      y: pan.y + deltaY,
    }));
  }, []);
  const zoomOut = React.useCallback(
    () => setZoom((value) => value - 0.25),
    [setZoom],
  );
  const zoomIn = React.useCallback(
    () => setZoom((value) => value + 0.25),
    [setZoom],
  );
  const resetZoom = React.useCallback(() => {
    setZoom(1);
    setMediaPan({ x: 0, y: 0 });
  }, [setZoom]);
  const handleMediaKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        zoomIn();
      } else if (event.key === "-") {
        event.preventDefault();
        zoomOut();
      } else if (event.key === "0") {
        event.preventDefault();
        resetZoom();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        panBy(-80, 0);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        panBy(80, 0);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        panBy(0, -80);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        panBy(0, 80);
      }
    },
    [panBy, resetZoom, zoomIn, zoomOut],
  );
  const handleMediaWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (previewKind !== "image" && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomAtPoint(
        zoom + (event.deltaY < 0 ? 0.1 : -0.1),
        event.clientX,
        event.clientY,
      );
    },
    [previewKind, zoom, zoomAtPoint],
  );
  const handleMediaDoubleClick = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (previewKind !== "image") return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("a,button,video,audio,input,select,textarea")
      )
        return;
      event.preventDefault();
      zoomAtPoint(zoom === 1 ? 2 : 1, event.clientX, event.clientY);
    },
    [previewKind, zoom, zoomAtPoint],
  );
  const startPan = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("a,button,video,audio,input,select,textarea")
      )
        return;
      const node = scrollportRef.current;
      if (!node) return;
      if (previewKind === "image") {
        activePointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
      }
      panStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: mediaPan.x,
        panY: mediaPan.y,
      };
      if (activePointersRef.current.size >= 2) {
        panStateRef.current = null;
        updatePinchState();
      } else {
        setDragging(true);
      }
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [mediaPan.x, mediaPan.y, previewKind, updatePinchState],
  );
  const pan = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (
        previewKind === "image" &&
        activePointersRef.current.has(event.pointerId)
      ) {
        activePointersRef.current.set(event.pointerId, {
          x: event.clientX,
          y: event.clientY,
        });
        const pointers = Array.from(activePointersRef.current.values());
        const pinch = pinchStateRef.current;
        if (pointers.length >= 2 && pinch) {
          event.preventDefault();
          const [first, second] = pointers;
          const distance = Math.hypot(second.x - first.x, second.y - first.y);
          const centerX = (first.x + second.x) / 2;
          const centerY = (first.y + second.y) / 2;
          zoomAtPoint(
            pinch.startZoom * (distance / pinch.startDistance),
            centerX,
            centerY,
          );
          return;
        }
      }
      const state = panStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      setMediaPan({
        x: state.panX + event.clientX - state.startX,
        y: state.panY + event.clientY - state.startY,
      });
    },
    [previewKind, zoomAtPoint],
  );
  const stopPan = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (previewKind === "image") {
        activePointersRef.current.delete(event.pointerId);
        if (activePointersRef.current.size >= 2) updatePinchState();
        else pinchStateRef.current = null;
      }
      if (panStateRef.current?.pointerId === event.pointerId) {
        panStateRef.current = null;
        setDragging(false);
      }
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [previewKind, updatePinchState],
  );

  return (
    <div
      className={cn(
        surfaceClass(surface),
        "grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden p-0",
        dark ? "bg-[#05070d]" : "bg-panel-2",
        className,
      )}
      data-media-preview-stage
      data-document-preview-kind={previewKind}
    >
      <div
        className="grid min-w-0 gap-1 border-b border-line bg-panel px-2 py-1.5 text-xs text-muted sm:flex sm:flex-nowrap sm:items-center sm:gap-2 sm:px-3 sm:py-2"
        data-media-preview-toolbar
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-ink-strong sm:min-w-[8rem]">
            {label}
          </span>
          <span
            className="shrink-0 rounded-full bg-panel-2 px-2 py-0.5 font-mono text-2xs"
            data-media-preview-zoom-label
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-line bg-panel-2 text-subtle sm:hidden"
            onClick={() => setMobileToolsOpen((value) => !value)}
            aria-expanded={mobileToolsOpen}
            aria-label="展开媒体预览工具"
            data-media-preview-mobile-more
          >
            <MoreHorizontal className="size-4" />
          </button>
        </div>
        <div
          className="hidden shrink-0 items-center gap-2 sm:flex"
          data-media-preview-desktop-tools
        >
          <ImagePreviewButton onClick={zoomOut}>缩小</ImagePreviewButton>
          <ImagePreviewButton onClick={zoomIn}>放大</ImagePreviewButton>
          <ImagePreviewButton onClick={resetZoom}>适应</ImagePreviewButton>
          <a
            className="rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
            href={downloadUrl}
            target="_blank"
            rel="noreferrer"
          >
            打开
          </a>
          {attachmentUrl ? (
            <a
              className="rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
              href={attachmentUrl}
              target="_blank"
              rel="noreferrer"
            >
              下载
            </a>
          ) : null}
        </div>
        {mobileToolsOpen ? (
          <div
            className="grid grid-cols-2 gap-1 min-[420px]:grid-cols-5 sm:hidden"
            data-media-preview-mobile-tools
          >
            <ImagePreviewButton onClick={zoomOut} className="min-h-8">
              缩小
            </ImagePreviewButton>
            <ImagePreviewButton onClick={zoomIn} className="min-h-8">
              放大
            </ImagePreviewButton>
            <ImagePreviewButton onClick={resetZoom} className="min-h-8">
              适应
            </ImagePreviewButton>
            <a
              className="inline-flex min-h-8 items-center justify-center rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
              href={downloadUrl}
              target="_blank"
              rel="noreferrer"
            >
              打开
            </a>
            {attachmentUrl ? (
              <a
                className="inline-flex min-h-8 items-center justify-center rounded border border-line bg-panel-2 px-2 py-1 text-2xs text-muted transition hover:border-primary-line hover:text-ink-strong"
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
              >
                下载
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
      <div
        ref={scrollportRef}
        className={cn(
          "min-h-0 overflow-hidden overscroll-contain p-2 outline-none sm:p-4",
          previewKind === "image" && "touch-none [user-select:none]",
          previewKind !== "image" && "touch-pan-x touch-pan-y",
          previewKind === "image" &&
            (dragging ? "cursor-grabbing select-none" : "cursor-grab"),
        )}
        data-media-preview-scrollport
        data-media-preview-pan="free-canvas"
        data-media-preview-shortcuts="wheel,pinch,+,-,0,arrows,double-click,drag"
        tabIndex={0}
        aria-label={`${label} 媒体预览；滚轮或双指缩放，拖拽可像无限画布一样自由移动，双击切换 100%/200%，按 + / - 快捷缩放，按 0 适应，方向键平移`}
        onKeyDown={handleMediaKeyDown}
        onWheel={handleMediaWheel}
        onDoubleClick={handleMediaDoubleClick}
        onPointerDown={startPan}
        onPointerMove={pan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
      >
        <div
          className="grid min-h-full min-w-full place-items-center p-2"
          data-media-preview-canvas
        >
          <div
            className="will-change-transform"
            data-media-preview-free-transform
            data-media-preview-zoom={zoom}
            data-media-preview-pan-x={mediaPan.x}
            data-media-preview-pan-y={mediaPan.y}
            style={
              previewKind === "image"
                ? {
                    transform: `translate(${mediaPan.x}px, ${mediaPan.y}px) scale(${zoom})`,
                    transformOrigin: "center center",
                  }
                : undefined
            }
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function mediaFitStyle(_zoom: number): React.CSSProperties {
  return {
    maxWidth: "100%",
    maxHeight: "100%",
    objectFit: "contain",
    width: "auto",
    height: "auto",
  };
}

function clampMediaZoom(zoom: number): number {
  return Math.min(4, Math.max(0.25, Number(zoom.toFixed(2))));
}

export default DocumentPreview;

function PreviewLoading({ label }: { label: string }) {
  return (
    <div className="grid h-full min-h-40 place-items-center text-xs text-muted">
      <div className="grid justify-items-center gap-2">
        <span className="size-5 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
        <span>{label}</span>
      </div>
    </div>
  );
}
