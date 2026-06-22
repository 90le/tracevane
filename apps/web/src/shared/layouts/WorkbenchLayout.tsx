import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface WorkbenchLayoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Narrow icon rail on the far left. */
  activity?: React.ReactNode;
  /** File/nav tree column (hidden ≤1080px). */
  tree?: React.ReactNode;
  /** Main editor area. */
  editor: React.ReactNode;
  /** Bottom panel (terminal/output). */
  panel?: React.ReactNode;
}

/**
 * Aurora Workbench: activity rail + tree + editor + bottom panel.
 * Collapses to editor+panel ≤1080px and a vertical stack ≤680px.
 * Fill the available height; place inside a full-bleed page region.
 */
const WorkbenchLayout = React.forwardRef<HTMLDivElement, WorkbenchLayoutProps>(
  ({ activity, tree, editor, panel, className, ...props }, ref) => (
    <div ref={ref} className={cn("tv-workbench", className)} {...props}>
      {activity != null && <div className="tv-wb-activity">{activity}</div>}
      {tree != null && <div className="tv-wb-tree">{tree}</div>}
      <div className="tv-wb-editor">{editor}</div>
      {panel != null && <div className="tv-wb-panel">{panel}</div>}
    </div>
  )
);
WorkbenchLayout.displayName = "WorkbenchLayout";

export { WorkbenchLayout };
