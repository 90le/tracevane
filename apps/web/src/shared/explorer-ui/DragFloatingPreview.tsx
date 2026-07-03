import { createPortal } from "react-dom";
import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface DragFloatingPreviewProps {
  x: number;
  y: number;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string | number;
  width?: number;
  tone?: "default" | "terminal";
  className?: string;
  dataAttributes?: Record<string, string | boolean | undefined>;
  "data-testid"?: string;
}

export function DragFloatingPreview({
  x,
  y,
  icon,
  title,
  subtitle,
  badge,
  width = 210,
  tone = "default",
  className,
  dataAttributes,
  "data-testid": dataTestId,
}: DragFloatingPreviewProps) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed z-[10000] origin-top-left select-none rounded-xl border px-2.5 py-1.5 text-xs text-ink-strong shadow-[0_14px_34px_rgba(0,0,0,0.30)] backdrop-blur-md",
        "ring-2 ring-primary/12 before:absolute before:inset-0 before:-z-10 before:rounded-xl before:bg-gradient-to-br before:from-primary/10 before:via-transparent before:to-transparent",
        "after:absolute after:inset-0 after:-z-20 after:translate-x-1 after:translate-y-1 after:rounded-xl after:border after:border-primary-line/45 after:bg-panel/55 after:shadow-md",
        tone === "terminal"
          ? "border-primary-line bg-panel/97"
          : "border-primary-line bg-panel/98",
        className,
      )}
      style={{
        left: x + 18,
        top: y,
        width: Math.min(Math.max(width, 170), 280),
        transform: "translate3d(0, -50%, 0) rotate(0.5deg)",
      }}
      data-testid={dataTestId}
      data-explorer-drag-floating-preview
      aria-hidden="true"
      {...dataAttributes}
    >
      <div className="absolute -left-1.5 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-b border-l border-primary-line bg-panel/98" />
      <div className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            "grid size-7 shrink-0 place-items-center rounded-lg border border-primary-line bg-primary-soft text-primary shadow-sm",
            tone === "terminal" && "bg-panel-2 text-primary",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold leading-4">{title}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-[10px] text-muted">{subtitle}</span> : null}
        </span>
        {badge != null ? (
          <span className="shrink-0 rounded-full border border-primary-line bg-primary-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold text-primary">
            {badge}
          </span>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
