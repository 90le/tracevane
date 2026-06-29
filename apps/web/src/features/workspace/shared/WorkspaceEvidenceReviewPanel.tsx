import * as React from "react";
import {
  ClipboardCheck,
  FileText,
  Layers3,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Badge } from "@/design/ui/badge";
import { Button } from "@/design/ui/button";

import type { WorkspaceEvidenceRecord } from "./WorkspaceEvidenceBasket";
import {
  buildWorkspaceEvidenceHandoffPacket,
  formatWorkspaceEvidenceHandoffForAi,
  WORKSPACE_EVIDENCE_HANDOFF_RECORD_LIMIT,
} from "./WorkspaceEvidenceHandoff";

export type WorkspaceEvidenceReviewDensity = "comfortable" | "compact";

export interface WorkspaceEvidenceReviewPanelProps {
  records: WorkspaceEvidenceRecord[];
  objective?: string;
  className?: string;
  density?: WorkspaceEvidenceReviewDensity;
  onCopyHandoff?: (handoff: string) => void;
  onClearEvidence?: () => void;
}

export function WorkspaceEvidenceReviewPanel({
  records,
  objective,
  className,
  density = "comfortable",
  onCopyHandoff,
  onClearEvidence,
}: WorkspaceEvidenceReviewPanelProps) {
  const packet = React.useMemo(
    () => buildWorkspaceEvidenceHandoffPacket({ records, objective }),
    [objective, records],
  );
  const handoff = React.useMemo(
    () => formatWorkspaceEvidenceHandoffForAi(packet),
    [packet],
  );
  const grouped = React.useMemo(() => groupEvidenceBySource(packet.records), [packet.records]);

  const handleCopy = React.useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(handoff);
    }
    onCopyHandoff?.(handoff);
  }, [handoff, onCopyHandoff]);

  return (
    <section
      aria-label="Workspace evidence review"
      className={cn(
        "relative overflow-hidden border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] text-slate-100 shadow-2xl shadow-black/30",
        density === "compact" ? "rounded-2xl p-3" : "rounded-3xl p-4 sm:p-5",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div
        className={cn(
          "grid gap-4",
          density === "compact" ? "grid-cols-1" : "lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]",
        )}
      >
        <header
          className={cn(
            "space-y-4 rounded-2xl border border-white/10 bg-white/[0.045] backdrop-blur-xl",
            density === "compact" ? "p-3" : "p-4",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge variant="outline" className="border-cyan-300/30 bg-cyan-300/10 text-cyan-100">
                <Sparkles aria-hidden="true" />
                AI review cockpit
              </Badge>
              <div>
                <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">
                  Evidence handoff
                </h2>
                <p
                  className={cn(
                    "mt-1 max-w-prose text-sm leading-6 text-slate-300",
                    density === "compact" && "line-clamp-2",
                  )}
                >
                  Package selected context, diffs, commands, and verification records into a bounded read-only packet before AI coding or writing work proceeds.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onClearEvidence ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={onClearEvidence}
                  disabled={!packet.records.length}
                  aria-label="Clear workspace evidence records"
                >
                  <Trash2 aria-hidden="true" />
                  Clear
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={handleCopy}
                aria-label="Copy evidence handoff for AI review"
              >
                <ClipboardCheck aria-hidden="true" />
                Copy handoff
              </Button>
            </div>
          </div>

          <dl
            className={cn(
              "grid gap-2 text-sm",
              density === "compact" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-3",
            )}
          >
            <EvidenceMetric label="Records" value={packet.records.length} />
            <EvidenceMetric label="Limit" value={WORKSPACE_EVIDENCE_HANDOFF_RECORD_LIMIT} />
            <EvidenceMetric label="Schema" value={`v${packet.schemaVersion}`} />
          </dl>

          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm leading-6 text-emerald-50">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Review guardrail
            </div>
            {packet.guardrail}
          </div>
        </header>

        <div
          className={cn(
            "grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-3",
            density === "compact" ? "max-h-[min(56dvh,520px)] overflow-y-auto" : "min-h-[18rem] sm:grid-cols-2",
          )}
        >
          {packet.records.length ? (
            packet.records.map((record) => (
              <article
                key={record.id}
                className={cn(
                  "group flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.055] p-3 transition hover:-translate-y-0.5 hover:border-cyan-300/30 hover:bg-white/[0.075]",
                  density === "compact" ? "min-h-28" : "min-h-36",
                )}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant="mute" className="bg-slate-800/80 text-slate-200">
                      {record.source} · {record.kind}
                    </Badge>
                    <FileText className="mt-0.5 size-4 text-cyan-200/80" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-white">
                      {record.title}
                    </h3>
                    <p
                      className={cn(
                        "mt-2 text-xs leading-5 text-slate-300",
                        density === "compact" ? "line-clamp-2" : "line-clamp-3",
                      )}
                    >
                      {record.summary}
                    </p>
                  </div>
                </div>
                <code className="mt-4 truncate rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-slate-400">
                  {record.id}
                </code>
              </article>
            ))
          ) : (
            <div
              className={cn(
                "col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.035] text-center",
                density === "compact" ? "min-h-44 p-5" : "min-h-64 p-8",
              )}
            >
              <Layers3 className="mb-3 size-8 text-cyan-200/80" aria-hidden="true" />
              <h3 className="text-base font-semibold text-white">No evidence selected</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                Add document context, diffs, commands, or verification records to prepare a trustworthy AI writing and coding handoff.
              </p>
            </div>
          )}
        </div>
      </div>

      <footer className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        {grouped.map(([source, count]) => (
          <span key={source} className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
            {source}: {count}
          </span>
        ))}
      </footer>
    </section>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <dt className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold text-white">{value}</dd>
    </div>
  );
}

function groupEvidenceBySource(records: WorkspaceEvidenceRecord[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.source, (counts.get(record.source) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
}
