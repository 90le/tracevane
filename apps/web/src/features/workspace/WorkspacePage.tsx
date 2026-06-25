import * as React from "react";

import { WorkspaceShell } from "./shell/WorkspaceShell";

export function WorkspacePage() {
  React.useEffect(() => {
    document.title = "工作区 · Tracevane";
  }, []);

  return <WorkspaceShell />;
}

export default WorkspacePage;
