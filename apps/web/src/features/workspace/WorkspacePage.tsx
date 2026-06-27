import * as React from "react";

import { WorkspaceWorkbench } from "./workbench";

export function WorkspacePage() {
  React.useEffect(() => {
    document.title = "工作区 · Tracevane";
  }, []);

  return <WorkspaceWorkbench />;
}

export default WorkspacePage;
