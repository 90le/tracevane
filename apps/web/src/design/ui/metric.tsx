import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Metric display primitives for dense status / overview pages. `MetricRail`
 * lays `MetricTile`s out in a responsive grid; each tile shows a label, a
 * prominent value, and an optional hint, with the value tinted by `tone`
 * using the semantic success / warning / danger tokens.
 */

export type MetricTone = "default" | "ok" | "warn" | "bad";

const toneValueClass: Record<MetricTone, string> = {
  default: "text-ink-strong",
  ok: "text-success",
  warn: "text-warning",
  bad: "text-danger",
};

export interface MetricTileProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: MetricTone;
  icon?: React.ReactNode;
}

/** A single metric card (label + value + optional hint/icon). */
function MetricTile({
  label,
  value,
  hint,
  tone = "default",
  icon,
  className,
  ...props
}: MetricTileProps) {
  return (
    <div
      className={cn("rounded-md border border-line bg-panel p-4 shadow-sm", className)}
      {...props}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-subtle">{label}</span>
        {icon ? (
          <span className="text-subtle [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <div
        className={cn(
          "mt-1.5 text-xl font-semibold tabular-nums",
          toneValueClass[tone],
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
    </div>
  );
}

/** Responsive grid that hosts a row of `MetricTile`s. */
function MetricRail({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { MetricRail, MetricTile };
