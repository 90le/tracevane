import * as React from "react";
import { Check, RefreshCw } from "lucide-react";

import { cn } from "@/design/lib/utils";
import { Button } from "@/design/ui/button";

import {
  clearWorkspaceEvidenceBasket,
  readWorkspaceEvidenceBasket,
  subscribeWorkspaceEvidenceBasket,
  type WorkspaceEvidenceRecord,
} from "./WorkspaceEvidenceBasket";
import { WorkspaceEvidenceReviewPanel } from "./WorkspaceEvidenceReviewPanel";

export interface WorkspaceEvidenceReviewSurfaceProps {
  objective?: string;
  className?: string;
  initialRecords?: WorkspaceEvidenceRecord[];
  onCopyHandoff?: (handoff: string) => void;
  onRecordsChange?: (records: WorkspaceEvidenceRecord[]) => void;
}

export function WorkspaceEvidenceReviewSurface({
  objective,
  className,
  initialRecords,
  onCopyHandoff,
  onRecordsChange,
}: WorkspaceEvidenceReviewSurfaceProps) {
  const [records, setRecords] = React.useState<WorkspaceEvidenceRecord[]>(
    () => initialRecords ?? readWorkspaceEvidenceBasket(),
  );
  const [copiedAt, setCopiedAt] = React.useState<string | null>(null);

  const syncRecords = React.useCallback((nextRecords: WorkspaceEvidenceRecord[]) => {
    setRecords(nextRecords);
    onRecordsChange?.(nextRecords);
  }, [onRecordsChange]);

  React.useEffect(() => {
    if (initialRecords) {
      syncRecords(initialRecords);
      return undefined;
    }
    syncRecords(readWorkspaceEvidenceBasket());
    return subscribeWorkspaceEvidenceBasket((detail) => {
      syncRecords(detail.records);
    });
  }, [initialRecords, syncRecords]);

  const handleRefresh = React.useCallback(() => {
    syncRecords(readWorkspaceEvidenceBasket());
  }, [syncRecords]);

  const handleClear = React.useCallback(() => {
    const detail = clearWorkspaceEvidenceBasket();
    if (detail) syncRecords(detail.records);
  }, [syncRecords]);

  const handleCopy = React.useCallback((handoff: string) => {
    setCopiedAt(new Date().toLocaleTimeString());
    onCopyHandoff?.(handoff);
  }, [onCopyHandoff]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_16px_rgba(110,231,183,0.8)]" aria-hidden="true" />
          Live evidence basket · {records.length} records
          {copiedAt ? (
            <span className="inline-flex items-center gap-1 text-emerald-200">
              <Check className="size-3" aria-hidden="true" />
              copied {copiedAt}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          aria-label="Refresh workspace evidence records"
        >
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <WorkspaceEvidenceReviewPanel
        records={records}
        objective={objective}
        onCopyHandoff={handleCopy}
        onClearEvidence={handleClear}
      />
    </div>
  );
}
