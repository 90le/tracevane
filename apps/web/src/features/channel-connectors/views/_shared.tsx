import * as React from "react";

import { cn } from "@/design/lib/utils";

/** Shared severity tone used by dots, chips and tinted rows. */
export type StatusTone = "ok" | "warn" | "bad" | "info" | "mute";

const statusDotToneClass: Record<StatusTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  info: "bg-primary",
  mute: "bg-subtle",
};

/**
 * Compact online-status indicator (Linear-style dot). `pulse` animates the
 * dot for live/healthy signals; reduced-motion users get a static dot via
 * the global prefers-reduced-motion reset.
 */
export function StatusDot({
  tone,
  pulse = false,
  className,
}: {
  tone: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        statusDotToneClass[tone],
        pulse && "animate-pulse",
        className,
      )}
    />
  );
}

const countChipToneClass: Record<StatusTone, string> = {
  ok: "bg-success-soft text-success",
  warn: "bg-warning-soft text-warning",
  bad: "bg-danger-soft text-danger",
  info: "bg-primary-soft text-primary",
  mute: "bg-panel-3 text-muted",
};

/** Small numeric chip for panel headers (queue depth, outbox size, …). */
export function CountChip({
  tone = "mute",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-px text-2xs font-semibold tabular-nums",
        countChipToneClass[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
