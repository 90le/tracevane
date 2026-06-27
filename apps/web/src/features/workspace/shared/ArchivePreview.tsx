import * as React from "react";
import { AlertTriangle, Archive, CheckCircle2, File, Folder, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { dryRunUnarchiveFile } from "@/lib/api/files";
import type { FilesUnarchiveDryRunResponse } from "../../../../../../types/files";

export interface ArchivePreviewProps {
  rootId?: string;
  path: string;
  className?: string;
  "data-document-preview-kind"?: string;
}

export function ArchivePreview({ rootId, path, className, "data-document-preview-kind": previewKindDataAttribute }: ArchivePreviewProps) {
  const [preview, setPreview] = React.useState<FilesUnarchiveDryRunResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const destinationDirectoryPath = React.useMemo(() => parentDirectory(path), [path]);

  const loadPreview = React.useCallback(async () => {
    if (!rootId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await dryRunUnarchiveFile({
        rootId,
        archivePath: path,
        destinationDirectoryPath,
        conflictPolicy: "fail",
      });
      setPreview(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [destinationDirectoryPath, path, rootId]);

  React.useEffect(() => {
    void loadPreview();
  }, [loadPreview]);

  if (!rootId) {
    return (
      <div
        data-document-preview-kind={previewKindDataAttribute}
        className={cn("grid place-items-center rounded border border-line bg-panel p-6 text-center text-sm text-muted", className)}
      >
        <div>
          <Archive className="mx-auto mb-2 size-8 text-subtle" />
          压缩包预览需要 rootId 才能读取安全清单。
        </div>
      </div>
    );
  }

  const items = preview?.items ?? [];
  const visibleItems = items.slice(0, 100);
  const riskCount = (preview?.counts.conflicts ?? 0) + (preview?.counts.errors ?? 0);

  return (
    <section
      data-document-preview-kind={previewKindDataAttribute}
      className={cn("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel", className)}
    >
      <header className="border-b border-line bg-panel-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Archive className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">压缩包清单预览</div>
            <div className="truncate text-xs text-muted" title={path}>目标预检目录：/{destinationDirectoryPath || "根目录"}</div>
          </div>
          <Button variant="outline" size="sm" className="h-7" onClick={() => void loadPreview()} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            刷新
          </Button>
        </div>
        {preview ? (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <Badge tone="neutral">条目 {preview.counts.total}</Badge>
            <Badge tone="success">可解压 {preview.counts.ready}</Badge>
            <Badge tone={riskCount ? "danger" : "neutral"}>风险 {riskCount}</Badge>
            <Badge tone="neutral">覆盖 {preview.counts.overwrite}</Badge>
            <Badge tone="neutral">跳过 {preview.counts.skip}</Badge>
            <Badge tone="neutral">重命名 {preview.counts.rename}</Badge>
          </div>
        ) : null}
      </header>

      <div className="min-h-0 overflow-auto p-3">
        {loading && !preview ? (
          <div className="rounded border border-line bg-panel-2 p-4 text-sm text-muted">正在读取压缩包清单并执行安全预检...</div>
        ) : error ? (
          <div
            className="rounded border border-danger/30 bg-danger/5 p-4 text-sm text-danger"
            data-archive-preview-error
          >
            <AlertTriangle className="mb-2 size-5" />
            {error}
          </div>
        ) : preview ? (
          <div className="grid gap-2" data-archive-preview-items>
            {riskCount ? (
              <div className="rounded border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
                发现冲突或不安全条目。这里只是预览；实际解压仍需在文件操作弹窗中选择目标路径和冲突策略。
              </div>
            ) : (
              <div className="rounded border border-success/30 bg-success/5 p-3 text-xs text-success">
                <CheckCircle2 className="mr-1 inline size-3.5" />
                当前目标目录下未发现阻塞冲突或不安全条目。
              </div>
            )}
            <div className="overflow-hidden rounded border border-line">
              <div className="grid grid-cols-[minmax(0,1fr)_140px_110px] border-b border-line bg-panel-2 px-3 py-2 text-xs font-medium text-subtle">
                <span>归档条目</span>
                <span>状态</span>
                <span>类型</span>
              </div>
              {visibleItems.map((item) => (
                <div key={`${item.entryPath}:${item.destinationPath ?? ""}`} className="grid grid-cols-[minmax(0,1fr)_140px_110px] items-center border-b border-line/70 px-3 py-2 text-xs last:border-b-0">
                  <span className="min-w-0 truncate text-ink" title={item.entryPath}>{item.entryPath}</span>
                  <span className={cn("truncate", item.status === "error" || item.status === "conflict" ? "text-danger" : "text-muted")} title={item.message}>{archiveStatusLabel(item.status)}</span>
                  <span className="inline-flex items-center gap-1 text-muted">
                    {item.kind === "directory" ? <Folder className="size-3.5 text-primary" /> : <File className="size-3.5" />}
                    {item.kind === "directory" ? "目录" : "文件"}
                  </span>
                </div>
              ))}
            </div>
            {items.length > visibleItems.length ? (
              <div className="text-center text-xs text-subtle">仅预览前 {visibleItems.length} 条，完整执行前请使用解压预检弹窗。</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Badge({ tone, children }: { tone: "neutral" | "success" | "danger"; children: React.ReactNode }) {
  return (
    <span className={cn(
      "rounded-full px-2 py-0.5",
      tone === "success" && "bg-success/10 text-success",
      tone === "danger" && "bg-danger/10 text-danger",
      tone === "neutral" && "bg-panel text-muted",
    )}>
      {children}
    </span>
  );
}

function archiveStatusLabel(status: FilesUnarchiveDryRunResponse["items"][number]["status"]): string {
  switch (status) {
    case "ready": return "可解压";
    case "conflict": return "冲突";
    case "overwrite": return "覆盖";
    case "skip": return "跳过";
    case "rename": return "重命名";
    case "error": return "错误";
    default: return status;
  }
}

function parentDirectory(filePath: string): string {
  const normalized = filePath.split("/").filter(Boolean);
  normalized.pop();
  return normalized.join("/");
}
