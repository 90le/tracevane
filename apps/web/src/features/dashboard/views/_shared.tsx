import * as React from "react";

import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { ReadinessTone } from "../types";

const TONE_BADGE: Record<ReadinessTone, BadgeProps["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
  mute: "mute",
};

/** Status badge driven by an aggregated readiness tone. */
export function ToneBadge({
  tone,
  children,
}: {
  tone: ReadinessTone;
  children: React.ReactNode;
}) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** Tailwind classes for a soft icon-chip per tone (semantic color tokens). */
export function toneIconClass(tone: ReadinessTone): string {
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
