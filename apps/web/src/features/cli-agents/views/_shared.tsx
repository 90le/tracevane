import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { WorkbenchTone } from "../types";

/** Panel shell matching the Aurora `.panel` block. */
export function Panel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0 overflow-hidden rounded-md border border-line bg-panel shadow-sm", className)}>
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
    <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-line px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-md font-semibold text-ink-strong">{title}</h3>
        {sub && <span className="block truncate text-sm text-subtle">{sub}</span>}
      </div>
      {action && <div className="ml-auto shrink-0 max-sm:ml-0">{action}</div>}
    </div>
  );
}

const TONE_BADGE: Record<WorkbenchTone, BadgeProps["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
  mute: "mute",
};

export function ToneBadge({
  tone,
  children,
}: {
  tone: WorkbenchTone;
  children: React.ReactNode;
}) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** Tailwind classes for a soft icon-chip per tone (semantic color tokens). */
export function toneIconClass(tone: WorkbenchTone): string {
  switch (tone) {
    case "ok":
      return "bg-success/12 text-success";
    case "warn":
      return "bg-warning-soft text-warning";
    case "bad":
      return "bg-danger-soft text-danger";
    case "info":
      return "bg-primary-soft text-primary";
    default:
      return "bg-panel-3 text-muted";
  }
}

/** Two-column fact cell (plain spans — the parent strip is not a `<dl>`). */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-0.5 px-4 py-3">
      <span className="text-xs text-subtle">{label}</span>
      <span className="truncate text-sm text-ink-strong">{children}</span>
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
