import * as React from "react";
import { useEffect, useRef } from "react";
import type { RouteDef } from "./route-manifest";
import { useShell } from "./shell-context";
import { mountAuroraPage } from "./page-mounts";

export function PrototypePage({ route }: { route: RouteDef }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const shell = useShell();

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.setAttribute("aria-busy", "true");
    const cleanup = mountAuroraPage(route.path, stage, shell);
    stage.setAttribute("aria-busy", "false");
    shell.refreshIcons();
    return cleanup;
  }, [route.path, shell]);

  return (
    <div
      id="stage"
      ref={stageRef}
      className="page-stage"
      role="main"
      aria-live="polite"
      aria-busy="false"
      tabIndex={-1}
      dangerouslySetInnerHTML={{ __html: route.html || "" }}
    />
  );
}
