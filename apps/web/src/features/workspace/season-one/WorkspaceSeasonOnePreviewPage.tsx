import * as React from "react";

import { WorkspaceSeasonOneFramePreview } from "../shared";

import { useWorkspaceSeasonOneLiveModel } from "./useWorkspaceSeasonOneLiveModel";

export function WorkspaceSeasonOnePreviewPage() {
  const { model, source } = useWorkspaceSeasonOneLiveModel();

  React.useEffect(() => {
    document.title = "Workspace Season One Live · Tracevane";
  }, []);

  return (
    <div
      className="h-dvh min-h-0 min-w-0 overflow-hidden"
      data-workspace-season-one-live-page
      data-workspace-season-one-live-source={source}
      data-workspace-season-one-preview-page
    >
      <WorkspaceSeasonOneFramePreview model={model} />
    </div>
  );
}
