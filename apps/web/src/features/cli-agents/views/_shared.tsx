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
        {sub && <span className="block truncate text-sm text-subtle">{sub}</span>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
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

/** Tailwind classes for a soft icon-chip per tone. */
export function toneIconClass(tone: WorkbenchTone): string {
  switch (tone) {
    case "ok":
      return "bg-green-soft text-green";
    case "warn":
      return "bg-amber-soft text-amber";
    case "bad":
      return "bg-red-soft text-red";
    case "info":
      return "bg-primary-soft text-primary";
    default:
      return "bg-panel-3 text-muted";
  }
}

/** A single icon + two-line copy + trailing slot row (Aurora `.route-row`). */
export function Row({
  icon,
  iconClass,
  title,
  subtitle,
  trailing,
  onClick,
}: {
  icon: React.ReactNode;
  iconClass?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
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
      {trailing && <span className="ml-auto flex shrink-0 items-center gap-2">{trailing}</span>}
    </>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors",
          "hover:bg-panel-2 focus-visible:shadow-[var(--ring)]",
        )}
      >
        {body}
      </button>
    );
  }
  return <div className="flex items-center gap-3 px-4 py-2.5">{body}</div>;
}

/** Compact metric tile for hero / roll-up rows. */
export function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 rounded-md border border-line bg-panel-2 p-3">
      <span className="flex items-center gap-1.5 text-xs text-subtle [&_svg]:size-3.5">
        {icon}
        {label}
      </span>
      <span className="text-xl font-semibold text-ink-strong">{value}</span>
      {sub && <span className="truncate text-xs text-muted">{sub}</span>}
    </div>
  );
}

/** Two-column fact list cell. */
export function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-xs text-subtle">{label}</dt>
      <dd className="truncate text-sm text-ink-strong">{children}</dd>
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

/** Compact number (1.2k / 3.4M). */
export function formatCompact(value: number | null | undefined): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Relative idle duration from milliseconds. */
export function formatIdle(ms: number | null | undefined): string {
  const n = typeof ms === "number" && Number.isFinite(ms) ? ms : 0;
  if (n < 1000) return "刚刚";
  const sec = Math.floor(n / 1000);
  if (sec < 60) return `${sec}s 空闲`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m 空闲`;
  const hr = Math.floor(min / 60);
  return `${hr}h 空闲`;
}

/** Map a terminal session status to a tone + Chinese label. */
export function terminalStatusTone(status: string): {
  tone: WorkbenchTone;
  label: string;
} {
  switch (status) {
    case "running":
      return { tone: "ok", label: "运行中" };
    case "detached":
      return { tone: "warn", label: "已分离" };
    case "completed":
      return { tone: "mute", label: "已完成" };
    case "failed":
      return { tone: "bad", label: "失败" };
    case "lost":
      return { tone: "bad", label: "丢失" };
    default:
      return { tone: "info", label: status || "未知" };
  }
}
