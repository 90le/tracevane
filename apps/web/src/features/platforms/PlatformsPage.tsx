import * as React from "react";
import { useParams } from "react-router-dom";

import { OverviewView, OpenClawWorkspace } from "./views";

/** Platform directory and third-party platform workspace router. */
export function PlatformsPage() {
  const { platform, section } = useParams<{ platform?: string; section?: string }>();

  if (platform === "openclaw") {
    return <OpenClawWorkspace section={section} />;
  }

  return <OverviewView />;
}
