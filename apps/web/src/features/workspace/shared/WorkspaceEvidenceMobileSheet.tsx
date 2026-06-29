import * as React from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/design/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/design/ui/sheet";

import type { WorkspaceEvidenceRecord } from "./WorkspaceEvidenceBasket";
import { WorkspaceEvidenceReviewSurface } from "./WorkspaceEvidenceReviewSurface";

export interface WorkspaceEvidenceMobileSheetProps {
  objective?: string;
  triggerLabel?: string;
  initialRecords?: WorkspaceEvidenceRecord[];
  onCopyHandoff?: (handoff: string) => void;
  onRecordsChange?: (records: WorkspaceEvidenceRecord[]) => void;
}

export function WorkspaceEvidenceMobileSheet({
  objective,
  triggerLabel = "Evidence",
  initialRecords,
  onCopyHandoff,
  onRecordsChange,
}: WorkspaceEvidenceMobileSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="primary"
          size="sm"
          className="rounded-full shadow-[0_16px_40px_-18px_rgba(34,211,238,0.9)]"
          aria-label="Open workspace evidence review sheet"
        >
          <ShieldCheck aria-hidden="true" />
          {triggerLabel}
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[min(720px,96vw)] border-cyan-300/20 bg-slate-950 text-slate-100 sm:w-[min(760px,94vw)]"
      >
        <SheetHeader className="border-white/10 bg-slate-950/95 pr-14">
          <div>
            <SheetTitle className="text-white">Workspace evidence review</SheetTitle>
            <SheetDescription className="text-slate-400">
              Review, refresh, clear, and copy AI handoff evidence without leaving the current coding or writing flow.
            </SheetDescription>
          </div>
        </SheetHeader>
        <SheetBody className="bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.14),transparent_34%),#020617] p-3 sm:p-4">
          <WorkspaceEvidenceReviewSurface
            objective={objective}
            initialRecords={initialRecords}
            onCopyHandoff={onCopyHandoff}
            onRecordsChange={onRecordsChange}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
