import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface RowsInspectorLayoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  rows: React.ReactNode;
  inspector?: React.ReactNode;
  /** On ≤1080px the inspector slides in as a right drawer; controls its open state. */
  inspectorOpen?: boolean;
}

/**
 * Rows + inspector: a primary rows column and a narrower inspector aside.
 * At ≤1080px the inspector collapses into a right drawer toggled by
 * `inspectorOpen`. Used for config/detail pages with a summary rail.
 */
const RowsInspectorLayout = React.forwardRef<
  HTMLDivElement,
  RowsInspectorLayoutProps
>(({ rows, inspector, inspectorOpen, className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("tv-rows-inspector", className)}
    data-inspector-open={inspectorOpen ? "true" : "false"}
    {...props}
  >
    <div className="min-w-0">{rows}</div>
    {inspector != null && <aside className="tv-inspector">{inspector}</aside>}
  </div>
));
RowsInspectorLayout.displayName = "RowsInspectorLayout";

export { RowsInspectorLayout };
