import * as React from "react";

import { WorkspaceSeasonOneFramePreview } from "../shared/WorkspaceSeasonOneFramePreview";

export function WorkspaceSeasonOnePreviewPage() {
  React.useEffect(() => {
    document.title = "Workspace Season One Preview · Tracevane";
  }, []);

  return (
    <div className="h-dvh min-h-0 min-w-0 overflow-hidden" data-workspace-season-one-preview-page>
      <WorkspaceSeasonOneFramePreview />
    </div>
  );
}
