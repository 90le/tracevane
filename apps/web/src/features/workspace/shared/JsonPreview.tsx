import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface JsonPreviewProps {
  content: string;
  className?: string;
  "data-document-preview-kind"?: string;
}

const MAX_JSON_PREVIEW_BYTES = 512 * 1024;

export function JsonPreview({ content, className, "data-document-preview-kind": previewKindDataAttribute }: JsonPreviewProps) {
  const parsed = React.useMemo(() => parseJsonPreview(content), [content]);
  if (parsed.kind === "too-large") {
    return (
      <div
        data-document-preview-kind={previewKindDataAttribute}
        className={cn("grid place-items-center bg-panel p-6 text-center text-sm text-muted", className)}
      >
        <div>
          <div className="font-medium text-ink-strong">JSON 文件过大</div>
          <p className="mt-1 text-xs">结构检查限制为 {formatBytes(MAX_JSON_PREVIEW_BYTES)}，请切换“源码”用 Monaco 查看和搜索。</p>
        </div>
      </div>
    );
  }
  if (parsed.kind === "error") {
    return (
      <div
        data-document-preview-kind={previewKindDataAttribute}
        className={cn("grid gap-3 overflow-auto bg-panel p-4", className)}
      >
        <div className="rounded border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          JSON 解析失败：{parsed.message}
        </div>
        <pre className="overflow-auto rounded border border-line bg-panel-2 p-3 font-mono text-xs text-ink">{content}</pre>
      </div>
    );
  }
  const rootSummary = summarizeJsonValue(parsed.value);
  return (
    <div
      data-document-preview-kind={previewKindDataAttribute}
      className={cn("grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-panel", className)}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel-2 px-3 py-2 text-xs text-muted">
        <span className="font-medium text-ink-strong">JSON 结构检查</span>
        <span>{rootSummary}</span>
        <span className="ml-auto">源码模式可编辑和批量查找</span>
      </div>
      <div className="min-h-0 overflow-auto p-3 font-mono text-xs leading-relaxed">
        <JsonNode name="root" value={parsed.value} depth={0} />
      </div>
    </div>
  );
}

function JsonNode({ name, value, depth }: { name: string; value: unknown; depth: number }) {
  const [open, setOpen] = React.useState(depth < 2);
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === "object" && !isArray;
  const entries = isArray
    ? value.map((item, index) => [String(index), item] as const)
    : isObject
      ? Object.entries(value as Record<string, unknown>)
      : [];
  if (!isObject && !isArray) {
    return (
      <div className="grid grid-cols-[minmax(80px,220px)_minmax(0,1fr)] gap-3 border-b border-line/60 py-1">
        <span className="truncate text-subtle">{name}</span>
        <JsonScalar value={value} />
      </div>
    );
  }
  return (
    <div className="py-1">
      <button
        type="button"
        className="flex max-w-full items-center gap-2 rounded px-1 text-left hover:bg-panel-2"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="w-4 text-center text-subtle">{open ? "▾" : "▸"}</span>
        <span className="truncate text-primary">{name}</span>
        <span className="text-subtle">{isArray ? `Array(${entries.length})` : `Object(${entries.length})`}</span>
      </button>
      {open ? (
        <div className="ml-5 border-l border-line pl-3">
          {entries.slice(0, 400).map(([key, child]) => (
            <JsonNode key={key} name={key} value={child} depth={depth + 1} />
          ))}
          {entries.length > 400 ? <div className="py-1 text-subtle">仅展示前 400 项，请切换源码查看完整内容。</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function JsonScalar({ value }: { value: unknown }) {
  const type = value === null ? "null" : typeof value;
  const display = typeof value === "string" ? `"${value}"` : String(value);
  return (
    <span className={cn(
      "min-w-0 break-words",
      type === "string" && "text-primary",
      type === "number" && "text-warning",
      type === "boolean" && "text-danger",
      type === "null" && "text-subtle",
    )}>
      {display}
    </span>
  );
}

function parseJsonPreview(content: string): { kind: "ok"; value: unknown } | { kind: "error"; message: string } | { kind: "too-large" } {
  if (new Blob([content]).size > MAX_JSON_PREVIEW_BYTES) return { kind: "too-large" };
  try {
    return { kind: "ok", value: JSON.parse(stripJsonComments(content)) };
  } catch (error) {
    return { kind: "error", message: error instanceof Error ? error.message : String(error) };
  }
}

function stripJsonComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function summarizeJsonValue(value: unknown): string {
  if (Array.isArray(value)) return `Array · ${value.length} 项`;
  if (value && typeof value === "object") return `Object · ${Object.keys(value as Record<string, unknown>).length} 个键`;
  return value === null ? "null" : typeof value;
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
