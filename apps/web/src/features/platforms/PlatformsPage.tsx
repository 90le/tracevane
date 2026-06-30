import * as React from "react";
import { useParams } from "react-router-dom";

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
  return (
    <div className="grid min-h-[220px] place-items-center rounded-md border border-line bg-panel p-6 text-sm text-muted">
      <div className="grid justify-items-center gap-3">
        <span className="size-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span>正在打开平台视图…</span>
      </div>
    </div>
  );
}
