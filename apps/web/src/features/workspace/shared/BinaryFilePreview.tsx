import * as React from "react";
import { Download, ExternalLink, FileQuestion, ShieldCheck } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";

export interface BinaryFilePreviewProps {
  rootId?: string;
  path: string;
  name?: string;
  mimeType?: string | null;
  size?: number;
  downloadUrl?: string | null;
  className?: string;
  "data-document-preview-kind"?: string;
}

export function BinaryFilePreview({
  rootId,
  path,
  name,
  mimeType,
  size,
  downloadUrl,
  className,
  "data-document-preview-kind": previewKindDataAttribute,
}: BinaryFilePreviewProps) {
  const label = name || path.split("/").pop() || path;
  const inlineUrl = downloadUrl ?? (rootId ? buildFileDownloadUrl(rootId, path, false) : null);
  const attachmentUrl = rootId ? buildFileDownloadUrl(rootId, path, true) : inlineUrl;
  const kind = describeBinaryKind(path, mimeType);

  return (
    <section
      data-document-preview-kind={previewKindDataAttribute}
      className={cn("grid h-full min-h-0 place-items-center overflow-auto rounded border border-line bg-panel p-3 sm:p-6", className)}
      data-binary-preview-stage
    >
      <div className="w-full max-w-2xl rounded-xl border border-line bg-canvas p-4 shadow-sm sm:p-5" data-binary-preview-card>
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary sm:size-12">
            <FileQuestion className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-[.12em] text-subtle">{kind}</div>
            <h3 className="mt-1 truncate text-lg font-semibold text-ink-strong" title={label}>{label}</h3>
            <p className="mt-2 text-sm leading-6 text-muted">
              该文件没有安全的内联编辑器。Tracevane 不会尝试在浏览器中执行或解析未知二进制内容；请下载或用本机应用打开。
            </p>
          </div>
        </div>

        <dl className="mt-5 grid gap-2 rounded-lg border border-line bg-panel-2 p-3 text-xs sm:grid-cols-[120px_minmax(0,1fr)]">
          <dt className="text-subtle">路径</dt>
          <dd className="min-w-0 truncate text-ink" title={path}>{path}</dd>
          <dt className="text-subtle">MIME</dt>
          <dd className="text-muted">{mimeType || "application/octet-stream / unknown"}</dd>
          <dt className="text-subtle">大小</dt>
          <dd className="text-muted">{typeof size === "number" ? formatBytes(size) : "—"}</dd>
        </dl>

        <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center" data-binary-preview-actions>
          {attachmentUrl ? (
            <Button variant="primary" size="sm" onClick={() => window.open(attachmentUrl, "_blank", "noopener,noreferrer")}>
              <Download className="size-4" />
              下载文件
            </Button>
          ) : null}
          {inlineUrl ? (
            <Button variant="outline" size="sm" onClick={() => window.open(inlineUrl, "_blank", "noopener,noreferrer")}>
              <ExternalLink className="size-4" />
              尝试浏览器打开
            </Button>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-panel-2 px-2 py-1 text-xs text-subtle">
            <ShieldCheck className="size-3.5" />
            安全占位预览
          </span>
        </div>
      </div>
    </section>
  );
}

export function describeBinaryKind(path: string, mimeType?: string | null): string {
  const lower = path.toLowerCase();
  if (/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/.test(lower)) return "Office / 文档文件";
  if (/\.(exe|dll|so|dylib|bin|dat|iso|img|dmg|msi|deb|rpm|apk)$/.test(lower)) return "二进制 / 安装包";
  if (/\.(ttf|otf|woff|woff2)$/.test(lower)) return "字体文件";
  if (mimeType?.startsWith("application/")) return "应用程序数据";
  return "未知文件";
}

function buildFileDownloadUrl(rootId: string, path: string, attachment = false): string {
  const params = new URLSearchParams({ rootId, path });
  if (attachment) params.set("download", "true");
  return `/api/files/download?${params.toString()}`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
