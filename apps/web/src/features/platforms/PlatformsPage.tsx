import * as React from "react";
import { useParams } from "react-router-dom";

import { LoadingState } from "@/shared/states/LoadingState";

const OverviewView = React.lazy(() =>
  import("./views/OverviewView").then((module) => ({
    default: module.OverviewView,
  })),
);
const OpenClawWorkspace = React.lazy(() =>
  import("./openclaw/OpenClawWorkspace").then((module) => ({
    default: module.OpenClawWorkspace,
  })),
);

/** Platform directory and third-party platform workspace router. */
export function PlatformsPage() {
  const { platform, section } = useParams<{ platform?: string; section?: string }>();

  return (
    <React.Suspense fallback={<PlatformsViewFallback />}>
      {platform === "openclaw" ? (
        <OpenClawWorkspace section={section} />
      ) : (
        <OverviewView />
      )}
    </React.Suspense>
  );
}


function PlatformsViewFallback() {
  return <LoadingState title="正在打开平台视图…" />;
}
