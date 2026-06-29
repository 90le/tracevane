import * as React from "react";

import { WorkspaceSeasonOnePreviewPage } from "./season-one";

export function WorkspacePage() {
  React.useEffect(() => {
    document.title = "Workspace Season One · Tracevane";
  }, []);

  return <WorkspaceSeasonOnePreviewPage />;
}

export default WorkspacePage;
