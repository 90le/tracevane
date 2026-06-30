import * as React from "react";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";
import { readFile } from "@/lib/api/files";
import type { FilesReadPayload } from "../../../../../../types/files";

const TEXT_SLICE_LIMIT = 256 * 1024;
const MAX_RENDERED_LINES = 2_000;

export interface TextSlicePreviewProps {
  rootId?: string;
  path: string;
  initialRead: Pick<FilesReadPayload, "content" | "contentOffset" | "contentBytes" | "readLimitBytes" | "size" | "truncated">;
  className?: string;
  "data-document-preview-kind"?: string;
}

export function TextSlicePreview({ rootId, path, initialRead, className, "data-document-preview-kind": previewKindDataAttribute }: TextSlicePreviewProps) {
  const [slice, setSlice] = React.useState(initialRead);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSlice(initialRead);
    setError(null);
  }, [initialRead, path]);

  const loadSlice = React.useCallback(async (offset: number) => {
    if (!rootId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await readFile({ rootId, path, offset, limit: TEXT_SLICE_LIMIT });
      setSlice(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [path, rootId]);

  const content = slice.content ?? "";
  const lines = React.useMemo(() => content.split("\n"), [content]);
  const visibleLines = lines.slice(0, MAX_RENDERED_LINES);
  const clippedLineCount = Math.max(0, lines.length - visibleLines.length);
  const nextOffset = Math.min(slice.size, slice.contentOffset + slice.contentBytes);
  const previousOffset = Math.max(0, slice.contentOffset - TEXT_SLICE_LIMIT);
  const tailOffset = Math.max(0, slice.size - TEXT_SLICE_LIMIT);
  const canPage = Boolean(rootId && slice.size > slice.contentBytes);

  return (
    <section
      data-document-preview-kind={previewKindDataAttribute}
      className={cn("grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded border border-line bg-panel", className)}
    >
      <header className="border-b border-line bg-panel-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-ink-strong">大文本/日志切片检查</div>
            <div className="truncate text-xs text-muted">
              {formatBytes(slice.contentOffset)} - {formatBytes(nextOffset)} / {formatBytes(slice.size)} · 仅渲染前 {MAX_RENDERED_LINES} 行避免 DOM 卡顿
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" className="h-7" disabled={!canPage || loading || slice.contentOffset === 0} onClick={() => void loadSlice(previousOffset)}>
              <ChevronLeft className="size-3.5" />
              上一段
            </Button>
            <Button variant="outline" size="sm" className="h-7" disabled={!canPage || loading || nextOffset >= slice.size} onClick={() => void loadSlice(nextOffset)}>
              下一段
              <ChevronRight className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7" disabled={!canPage || loading || tailOffset === slice.contentOffset} onClick={() => void loadSlice(tailOffset)}>
              尾部
            </Button>
          </div>
        </div>
        {slice.truncated ? (
          <div className="mt-2 rounded border border-amber/30 bg-amber/10 px-2 py-1 text-xs text-amber">
            文件较大，当前展示的是服务端切片；源码编辑保持只读，完整文件请下载或按切片导航查看。
          </div>
        ) : null}
        {error ? <div className="mt-2 rounded border border-danger/30 bg-danger/5 px-2 py-1 text-xs text-danger">{error}</div> : null}
      </header>
      <pre className="min-h-0 overflow-auto bg-canvas p-3 font-mono text-xs leading-relaxed text-ink">
        {visibleLines.map((line, index) => (
          <div key={`${slice.contentOffset}:${index}`} className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 border-b border-line/40 last:border-b-0">
            <span className="select-none text-right text-subtle">{index + 1}</span>
            <code className="min-w-0 whitespace-pre-wrap break-words">{line || " "}</code>
          </div>
        ))}
        {clippedLineCount ? `\n… 已隐藏本切片剩余 ${clippedLineCount} 行，请缩小切片或使用下载/终端工具处理。` : ""}
      </pre>
    </section>
  );
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
