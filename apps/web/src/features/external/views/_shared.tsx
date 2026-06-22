import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { ExternalConnectionTone } from "../types";

/** Panel shell matching the prototype `.panel` block. */
export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-md border border-line bg-panel shadow-sm", className)}>
      {children}
    </section>
  );
}

export function PanelHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-md font-semibold text-ink-strong">{title}</h3>
        {sub && <span className="text-sm text-subtle">{sub}</span>}
      </div>
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

const TONE_BADGE: Record<ExternalConnectionTone, BadgeProps["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
};

/** Status badge driven by an aggregated connection tone. */
export function ToneBadge({
  tone,
  children,
}: {
  tone: ExternalConnectionTone;
  children: React.ReactNode;
}) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** A single icon + two-line copy + trailing slot row (prototype `.route-row`). */
export function Row({
  icon,
  iconClass,
  title,
  subtitle,
  trailing,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-[9px] bg-panel-3 text-muted [&_svg]:size-4",
          iconClass,
        )}
      >
        {icon}
      </span>
      <span className="grid min-w-0 flex-1">
        <strong className="truncate text-base text-ink-strong">{title}</strong>
        {subtitle && <span className="truncate text-sm text-muted">{subtitle}</span>}
      </span>
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors",
          "hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
          active && "bg-primary-soft",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>;
}

/** Small labelled stat tile (prototype `.external-tile`). */
export function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-sm border border-line bg-panel p-3">
      <span className="text-xs text-subtle">{label}</span>
      <div className="mt-1 text-xl font-semibold text-ink-strong">{value}</div>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

/** Format an ISO timestamp for display, falling back to the raw value. */
export function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
