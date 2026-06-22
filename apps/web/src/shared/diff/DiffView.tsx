import * as React from "react";

import { cn } from "@/design/lib/utils";

import { diffStats, lineDiff, type LineDiffSegment } from "./lineDiff";

/**
 * Lightweight, dependency-free code + diff rendering for the Model Gateway app
 * connection views. Uses Aurora tokens only; no syntax highlighting, no diff
 * libraries. Two exports:
 *
 *  - `CodeBlock`     — monospace, scrollable single-content viewer.
 *  - `DiffView`      — line-based add/del/same rendering of base → proposed.
 */

export interface CodeBlockProps {
  content: string;
  /** Drives a small format tag (`JSON` / `TOML`) shown in the header strip. */
  format?: "json" | "toml" | null;
  /** Shows a "敏感字段已脱敏" note when the source content is redacted. */
  redacted?: boolean;
  /** Optional caption (e.g. the target path) rendered above the block. */
  label?: React.ReactNode;
  className?: string;
  /** Tailwind max-height utility for the scroll area. */
  maxHeightClassName?: string;
}

/** Single-content monospace viewer with a light panel tint. */
export function CodeBlock({
  content,
  format,
  redacted,
  label,
  className,
  maxHeightClassName = "max-h-[52vh]",
}: CodeBlockProps) {
  return (
    <div className={cn("grid gap-1", className)}>
      {(label || format || redacted) && (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs uppercase tracking-wide text-subtle">
            {label}
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-subtle">
            {format && <span className="font-mono">{format.toUpperCase()}</span>}
            {redacted && <span>敏感字段已脱敏</span>}
          </span>
        </div>
      )}
      <pre
        className={cn(
          "overflow-auto rounded-md border border-line bg-panel-3 p-3 font-mono text-xs leading-relaxed text-ink",
          maxHeightClassName,
        )}
      >
        {content === "" ? (
          <span className="text-muted">（空内容）</span>
        ) : (
          content
        )}
      </pre>
    </div>
  );
}

const SIGN: Record<LineDiffSegment["type"], string> = {
  add: "+",
  del: "-",
  same: " ",
};

export interface DiffViewProps {
  /** Left / original content (e.g. on-disk `currentContent`). */
  base: string;
  /** Right / proposed content (e.g. `preview.content` or a backup version). */
  proposed: string;
  format?: "json" | "toml" | null;
  redacted?: boolean;
  label?: React.ReactNode;
  className?: string;
  maxHeightClassName?: string;
}

/**
 * Renders a line-based diff in a monospace block. Added lines are green-tinted
 * (`+`), removed lines red-tinted (`-`), unchanged lines neutral. A small
 * summary strip shows the add/remove counts.
 */
export function DiffView({
  base,
  proposed,
  format,
  redacted,
  label,
  className,
  maxHeightClassName = "max-h-[52vh]",
}: DiffViewProps) {
  const segments = React.useMemo(() => lineDiff(base, proposed), [base, proposed]);
  const stats = React.useMemo(() => diffStats(segments), [segments]);
  const unchanged = stats.added === 0 && stats.removed === 0;

  return (
    <div className={cn("grid gap-1", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs uppercase tracking-wide text-subtle">
          {label}
        </span>
        <span className="flex shrink-0 items-center gap-2 text-xs">
          {format && <span className="font-mono text-subtle">{format.toUpperCase()}</span>}
          {redacted && <span className="text-subtle">敏感字段已脱敏</span>}
          {unchanged ? (
            <span className="text-subtle">无改动</span>
          ) : (
            <>
              <span className="font-mono text-green">+{stats.added}</span>
              <span className="font-mono text-red">-{stats.removed}</span>
            </>
          )}
        </span>
      </div>
      <pre
        className={cn(
          "overflow-auto rounded-md border border-line bg-panel-3 font-mono text-xs leading-relaxed text-ink",
          maxHeightClassName,
        )}
      >
        {unchanged ? (
          <div className="p-3 text-muted">两侧内容一致，无差异。</div>
        ) : (
          segments.map((seg, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 px-3",
                seg.type === "add" && "bg-green-soft text-green",
                seg.type === "del" && "bg-red-soft text-red",
              )}
            >
              <span aria-hidden className="select-none opacity-60">
                {SIGN[seg.type]}
              </span>
              <span className="whitespace-pre-wrap break-all">{seg.text || " "}</span>
            </div>
          ))
        )}
      </pre>
    </div>
  );
}
