import * as React from "react";

import { cn } from "@/design/lib/utils";

import type { WorkspaceEvidenceRecord } from "./WorkspaceEvidenceBasket";
import { WorkspaceEvidenceMobileSheet } from "./WorkspaceEvidenceMobileSheet";
import { WorkspaceEvidenceReviewSurface } from "./WorkspaceEvidenceReviewSurface";

export interface WorkspaceEvidenceResponsiveLauncherProps {
  objective?: string;
  className?: string;
  initialRecords?: WorkspaceEvidenceRecord[];
  triggerLabel?: string;
  onCopyHandoff?: (handoff: string) => void;
  onRecordsChange?: (records: WorkspaceEvidenceRecord[]) => void;
}

export function WorkspaceEvidenceResponsiveLauncher({
  objective,
  className,
  initialRecords,
  triggerLabel = "Evidence",
  onCopyHandoff,
  onRecordsChange,
}: WorkspaceEvidenceResponsiveLauncherProps) {
  return (
    <div
      className={cn("min-w-0", className)}
      data-workspace-evidence-responsive-launcher
    >
      <div className="md:hidden" data-workspace-evidence-mobile-entry>
        <WorkspaceEvidenceMobileSheet
          objective={objective}
          triggerLabel={triggerLabel}
          initialRecords={initialRecords}
          onCopyHandoff={onCopyHandoff}
          onRecordsChange={onRecordsChange}
        />
      </div>
      <aside
        aria-label="Workspace evidence rail"
        className="hidden min-w-0 md:block"
        data-workspace-evidence-rail-entry
      >
        <WorkspaceEvidenceReviewSurface
          objective={objective}
          density="compact"
          initialRecords={initialRecords}
          onCopyHandoff={onCopyHandoff}
          onRecordsChange={onRecordsChange}
        />
      </aside>
    </div>
  );
}
