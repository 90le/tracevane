import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface CsvPreviewProps {
  path: string;
  content: string;
  className?: string;
  "data-document-preview-kind"?: string;
}

const MAX_CSV_ROWS = 250;
const MAX_CSV_COLUMNS = 80;
const MAX_CSV_PREVIEW_BYTES = 768 * 1024;

export function CsvPreview({ path, content, className, "data-document-preview-kind": previewKindDataAttribute }: CsvPreviewProps) {
  const parsed = React.useMemo(() => parseDelimitedPreview(content, delimiterForPath(path)), [content, path]);
  if (parsed.kind === "too-large") {
    return (
      <div
        data-document-preview-kind={previewKindDataAttribute}
        className={cn("grid place-items-center bg-panel p-6 text-center text-sm text-muted", className)}
      >
        <div>
          <div className="font-medium text-ink-strong">表格文件过大</div>
          <p className="mt-1 text-xs">结构化预览限制为 {formatBytes(MAX_CSV_PREVIEW_BYTES)}，请切换“源码”查看完整内容。</p>
        </div>
      </div>
    );
  }
  const [header, ...body] = parsed.rows;
  const columns = (header ?? []).slice(0, MAX_CSV_COLUMNS);
  const rows = body.slice(0, MAX_CSV_ROWS);
  return (
    <div
      data-document-preview-kind={previewKindDataAttribute}
      className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-panel", className)}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">{path.toLowerCase().endsWith(".tsv") ? "TSV" : "CSV"} 表格预览</span>
        <span>{parsed.rows.length} 行 · {columns.length} 列</span>
        {parsed.truncated ? <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">已截断</span> : null}
        <span className="ml-auto">源码模式可编辑和查找</span>
      </div>
      <div className="min-h-0 overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-10 bg-panel-2 text-subtle">
            <tr>
              <th className="border-b border-r border-line px-2 py-1 font-medium">#</th>
              {columns.map((column, index) => (
                <th key={`${column}:${index}`} className="max-w-[240px] truncate border-b border-r border-line px-2 py-1 font-medium" title={column || `列 ${index + 1}`}>
                  {column || `列 ${index + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="odd:bg-panel even:bg-panel-2/40">
                <td className="sticky left-0 border-b border-r border-line bg-inherit px-2 py-1 text-right text-subtle">{rowIndex + 1}</td>
                {columns.map((_column, columnIndex) => (
                  <td key={columnIndex} className="max-w-[260px] truncate border-b border-r border-line px-2 py-1 text-ink" title={row[columnIndex] ?? ""}>
                    {row[columnIndex] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? <div className="p-4 text-center text-muted">没有可展示的数据行。</div> : null}
      </div>
    </div>
  );
}

function parseDelimitedPreview(content: string, delimiter: string): { kind: "ok"; rows: string[][]; truncated: boolean } | { kind: "too-large" } {
  if (new Blob([content]).size > MAX_CSV_PREVIEW_BYTES) return { kind: "too-large" };
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let index = 0;
  while (index < content.length && rows.length <= MAX_CSV_ROWS + 1) {
    const char = content[index];
    const next = content[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 2;
        continue;
      }
      if (char === '"') {
        quoted = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") index += 1;
    } else {
      cell += char;
    }
    index += 1;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return { kind: "ok", rows, truncated: index < content.length };
}

function delimiterForPath(path: string): string {
  return path.toLowerCase().endsWith(".tsv") ? "\t" : ",";
}

function formatBytes(value: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let next = value;
  let unit = 0;
  while (next >= 1024 && unit < units.length - 1) {
    next /= 1024;
    unit += 1;
  }
  return `${next.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
