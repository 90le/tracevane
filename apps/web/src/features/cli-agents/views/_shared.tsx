import * as React from "react";

import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { WorkbenchTone } from "../types";

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
      return "bg-success-soft text-success";
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
      <span className="text-2xs uppercase tracking-wider text-subtle">{label}</span>
      <span className="truncate text-sm text-ink-strong">{children}</span>
    </div>
  );
}
