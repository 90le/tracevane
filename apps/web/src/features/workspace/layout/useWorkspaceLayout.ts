import * as React from "react";

export type WorkspaceLayoutMode = "mobile" | "tablet" | "desktop" | "wide";

function modeForWidth(width: number): WorkspaceLayoutMode {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  if (width < 1440) return "desktop";
  return "wide";
}

/**
 * Viewport-driven Workspace layout mode.
 *
 * The Workspace uses separate layout shells for mobile/tablet/desktop instead
 * of squeezing the desktop IDE grid into a phone viewport. This hook is small
 * and dependency-free so it can be replaced later by a container-query driven
 * version without changing the workspace feature API.
 */
export function useWorkspaceLayout(): WorkspaceLayoutMode {
  const [mode, setMode] = React.useState<WorkspaceLayoutMode>(() => {
    if (typeof window === "undefined") return "desktop";
    return modeForWidth(window.innerWidth);
  });

  React.useEffect(() => {
    const update = () => setMode(modeForWidth(window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  return mode;
}
