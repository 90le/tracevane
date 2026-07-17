import * as React from "react";
import { Link } from "react-router-dom";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import type { BadgeProps } from "@/design/ui/badge";

import type { PlatformTone } from "./types";

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-md border border-line bg-panel shadow-sm", className)}>{children}</section>;
}

export function PanelHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
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

const TONE_BADGE: Record<PlatformTone, BadgeProps["variant"]> = { ok: "ok", warn: "warn", bad: "bad", info: "info" };

export function ToneBadge({ tone, children }: { tone: PlatformTone; children: React.ReactNode }) {
  return <Badge variant={TONE_BADGE[tone]}>{children}</Badge>;
}

/** Map a platform tone onto a MetricTile tone ("info" has no metric tint). */
export function metricTone(tone: PlatformTone): "default" | "ok" | "warn" | "bad" {
  return tone === "info" ? "default" : tone;
}

export function EvidenceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="min-w-0 flex-1 truncate text-sm text-muted">{label}</span>
      <span className="ml-auto min-w-0 truncate text-right text-sm text-ink-strong">{value}</span>
    </div>
  );
}

export function PlatformBreadcrumb({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="面包屑" className="text-sm text-muted">
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && <span className="text-subtle">/</span>}
              {item.to && !isLast ? (
                <Link className="truncate text-muted hover:text-ink-strong" to={item.to}>{item.label}</Link>
              ) : (
                <span className="truncate text-ink-strong" aria-current={isLast ? "page" : undefined}>{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SectionNotice({ tone = "info", children }: { tone?: PlatformTone; children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
      <ToneBadge tone={tone}>{tone === "warn" ? "边界" : "说明"}</ToneBadge>
      <span className="ml-2">{children}</span>
    </div>
  );
}
