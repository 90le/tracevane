import * as React from "react";

import {
  createWorkspaceSeasonOneLiveModel,
  WorkspaceSeasonOneFramePreview,
} from "../shared";

const seasonOneLiveDemoModel = createWorkspaceSeasonOneLiveModel({
  rootLabel: "project-root",
  activePath: "docs/DESIGN.md",
  openFiles: [
    "docs/DESIGN.md",
    "apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter.ts",
    "tests/workspace/workspace-season-one-responsive.smoke.mjs",
  ],
  gitChanges: 4,
  evidenceItems: 3,
  terminalState: "passed",
  agentState: "waiting-review",
  lastRunLabel: "Season One browser smoke",
  viewportCoverage: "desktop · tablet · phone live",
});

export function WorkspaceSeasonOnePreviewPage() {
  React.useEffect(() => {
    document.title = "Workspace Season One Live · Tracevane";
  }, []);

  return (
    <div
      className="h-dvh min-h-0 min-w-0 overflow-hidden"
      data-workspace-season-one-live-page
      data-workspace-season-one-preview-page
    >
      <WorkspaceSeasonOneFramePreview model={seasonOneLiveDemoModel} />
    </div>
  );
}
