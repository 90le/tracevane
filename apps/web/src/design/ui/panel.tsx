import * as React from "react";

import { cn } from "@/design/lib/utils";

/**
 * Canonical panel primitives shared by feature views (dashboard, cli-agents,
 * recovery, platforms). Consolidated from the per-feature `_shared` copies —
 * do not fork these back into feature folders. The Panel / PanelHead class
 * strings below are pinned by tests/system/web-responsive-layout.test.mjs;
 * update that test together with any change here.
 */

/** Panel shell: hairline border + low elevation over the page canvas. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "min-w-0 overflow-hidden rounded-md border border-line bg-panel shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Panel header: title + optional truncated subtitle + right-aligned action slot. */
export function PanelHead({
  title,
  sub,
  chip,
  action,
}: {
  title: string;
  sub?: string;
  chip?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3
          className={cn(
            "text-md font-semibold text-ink-strong",
            chip !== undefined && "flex items-center gap-2",
          )}
        >
          {chip !== undefined ? <span className="truncate">{title}</span> : title}
          {chip}
        </h3>
        {sub && <span className="block truncate text-sm text-subtle">{sub}</span>}
      </div>
      {action && <div className="ml-auto shrink-0 max-sm:ml-0">{action}</div>}
    </div>
  );
}

/** A single icon + two-line copy + trailing slot row (prototype `.route-row`). */
export function Row({
  icon,
  iconClass,
  title,
  subtitle,
  subtitleClassName,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  subtitleClassName?: string;
  trailing?: React.ReactNode;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-sm bg-panel-3 text-muted [&_svg]:size-4",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <strong className="truncate text-base text-ink-strong">{title}</strong>
        {subtitle && (
          <span className={cn("truncate text-sm text-muted", subtitleClassName)}>
            {subtitle}
          </span>
        )}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors",
          "duration-[var(--dur-1)] ease-[var(--ease-standard)] hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>;
}

/** Format an ISO timestamp for display, falling back to the raw value. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
