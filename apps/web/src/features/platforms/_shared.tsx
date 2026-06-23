import * as React from "react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { PlatformTone } from "./types";

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

const TONE_BADGE: Record<PlatformTone, BadgeProps["variant"]> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  info: "info",
};

/** Status badge driven by a derived platform tone. */
export function ToneBadge({
  tone,
  children,
}: {
  tone: PlatformTone;
  children: React.ReactNode;
}) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** Small labelled stat / evidence tile (prototype `.external-tile`). */
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
      <div className="mt-1 truncate text-xl font-semibold text-ink-strong">{value}</div>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

/** A single key/value evidence row inside a panel. */
export function EvidenceRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-sm text-ink-strong">{value}</span>
    </div>
  );
}
