import * as React from "react";

import { cn } from "@/design/lib/utils";

export interface StatusConsoleLayoutProps
  extends React.HTMLAttributes<HTMLDivElement> {
  /** Scrolling log/console body. */
  children: React.ReactNode;
  /** Bottom status bar items (rendered in a horizontal strip). */
  status?: React.ReactNode;
  /** Optional header strip above the body. */
  header?: React.ReactNode;
}

/**
 * Status console: a scrolling monospace log body with a sticky status bar.
 * Fills the available height; place inside a full-bleed page region.
 */
const StatusConsoleLayout = React.forwardRef<
  HTMLDivElement,
  StatusConsoleLayoutProps
>(({ children, status, header, className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("tv-console", header && "grid-rows-[auto_minmax(0,1fr)_auto]", className)}
    {...props}
  >
    {header}
    <div className="tv-console-body">{children}</div>
    {status != null && <div className="tv-console-status">{status}</div>}
  </div>
));
StatusConsoleLayout.displayName = "StatusConsoleLayout";

export { StatusConsoleLayout };
