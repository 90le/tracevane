import * as React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { ComingSoonPage } from "@/app/ComingSoonPage";
import { NAV_ITEMS } from "@/app/navigation";
const FileManagerPage = React.lazy(() =>
  import("@/features/file-manager/FileManagerPage").then((module) => ({
    default: module.FileManagerPage,
  })),
);
const DashboardPage = React.lazy(() =>
  import("@/features/dashboard/DashboardPage").then((module) => ({
    default: module.DashboardPage,
  })),
);
const ModelGatewayPage = React.lazy(() =>
  import("@/features/model-gateway/ModelGatewayPage").then((module) => ({
    default: module.ModelGatewayPage,
  })),
);
const ChannelConnectorsPage = React.lazy(() =>
  import("@/features/channel-connectors/ChannelConnectorsPage").then(
    (module) => ({ default: module.ChannelConnectorsPage }),
  ),
);
const CliAgentsPage = React.lazy(() =>
  import("@/features/cli-agents/CliAgentsPage").then((module) => ({
    default: module.CliAgentsPage,
  })),
);
const PlatformsPage = React.lazy(() =>
  import("@/features/platforms/PlatformsPage").then((module) => ({
    default: module.PlatformsPage,
  })),
);

/**
 * App routing. HashRouter is required because the backend serves the SPA
 * without a server-side route fallback. `/` redirects to the landing route
 * (`/dashboard`); every other nav path renders either a built feature or a
 * coming-soon placeholder.
 */
export function AppRouter() {
  redirectLegacyPathBeforeHashRouter();

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <LazyPage>
                <DashboardPage />
              </LazyPage>
            }
          />
          <Route
            path="/file-manager"
            element={
              <LazyPage>
                <FileManagerPage />
              </LazyPage>
            }
          />
          <Route
            path="/model-gateway"
            element={
              <LazyPage>
                <ModelGatewayPage />
              </LazyPage>
            }
          />
          <Route
            path="/im-channels"
            element={
              <LazyPage>
                <ChannelConnectorsPage />
              </LazyPage>
            }
          />
          <Route
            path="/external"
            element={<Navigate to="/platforms" replace />}
          />
          <Route
            path="/cli-agents"
            element={
              <LazyPage>
                <CliAgentsPage />
              </LazyPage>
            }
          />
          <Route
            path="/recovery"
            element={<Navigate to="/platforms/openclaw/guard" replace />}
          />
          <Route
            path="/platforms"
            element={
              <LazyPage>
                <PlatformsPage />
              </LazyPage>
            }
          />
          {/* `:platform` selects the platform child (currently `openclaw`); the
              optional `:section` is reserved for future deep sections and is
              read inside the page. */}
          <Route
            path="/platforms/:platform"
            element={
              <LazyPage>
                <PlatformsPage />
              </LazyPage>
            }
          />
          <Route
            path="/platforms/:platform/:section"
            element={
              <LazyPage>
                <PlatformsPage />
              </LazyPage>
            }
          />
          <Route
            path="/platforms/:platform/:section/:entityId"
            element={
              <LazyPage>
                <PlatformsPage />
              </LazyPage>
            }
          />
          <Route
            path="/platforms/:platform/:section/:entityId/:subsection"
            element={
              <LazyPage>
                <PlatformsPage />
              </LazyPage>
            }
          />
          {/* Legacy alias: the old app exposed /runtime-admin which routed to
              the recovery / system-guard surface. Redirect for old links. The
              old per-section deep link (/runtime-admin/:section) was the
              OpenClaw runtime admin surface — send it to the platform child. */}
          <Route
            path="/runtime-admin"
            element={<Navigate to="/platforms/openclaw/guard" replace />}
          />
          <Route
            path="/runtime-admin/:section"
            element={<Navigate to="/platforms/openclaw/guard" replace />}
          />
          {NAV_ITEMS.filter((item) => item.status === "coming-soon").map(
            (item) => (
              <Route
                key={item.path}
                path={item.path}
                element={<ComingSoonPage />}
              />
            ),
          )}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

function redirectLegacyPathBeforeHashRouter() {
  if (typeof window === "undefined") return;
  if (window.location.hash) return;

  const { pathname, search } = window.location;
  const normalizedPath = pathname.replace(/\/+$/g, "") || "/";
  let nextHash: string | null = null;

  if (
    normalizedPath === "/chat" ||
    normalizedPath === "/chat/workbench" ||
    normalizedPath.startsWith("/chat/s/")
  ) {
    nextHash = `/im-channels${search || ""}`;
  }

  if (!nextHash) {
    const directSpaPaths = [
      "/dashboard",
      "/file-manager",
      "/model-gateway",
      "/im-channels",
      "/platforms",
      "/cli-agents",
    ];
    if (
      directSpaPaths.includes(normalizedPath) ||
      normalizedPath.startsWith("/platforms/")
    ) {
      nextHash = `${normalizedPath}${search || ""}`;
    }
  }

  if (!nextHash) return;
  window.history.replaceState(null, document.title, `/#${nextHash}`);
}

function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <React.Suspense fallback={<RouteLoadingState />}>{children}</React.Suspense>
  );
}

function RouteLoadingState() {
  return (
    <div className="grid min-h-[240px] place-items-center p-6 text-sm text-muted">
      <div className="grid justify-items-center gap-3">
        <span className="size-7 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span>正在加载功能模块…</span>
      </div>
    </div>
  );
}
