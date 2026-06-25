import * as React from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { ComingSoonPage } from "@/app/ComingSoonPage";
import { NAV_ITEMS } from "@/app/navigation";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ModelGatewayPage } from "@/features/model-gateway/ModelGatewayPage";
import { ChannelConnectorsPage } from "@/features/channel-connectors/ChannelConnectorsPage";
import { CliAgentsPage } from "@/features/cli-agents/CliAgentsPage";
import { ChatWorkbenchPage } from "@/features/chat/ChatWorkbenchPage";
import { WorkspacePage } from "@/features/workspace/WorkspacePage";
import { PlatformsPage } from "@/features/platforms/PlatformsPage";

/**
 * App routing. HashRouter is required because the backend serves the SPA
 * without a server-side route fallback. `/` redirects to the landing route
 * (`/dashboard`); every other nav path renders either a built feature or a
 * coming-soon placeholder.
 */
export function AppRouter() {
  useLegacyPathRedirect();

  return (
    <HashRouter>
      <Routes>
        {/* Full-bleed Workspace shell — renders OUTSIDE AppShell so the local
            project workbench can use the whole viewport. */}
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/chat" element={<ChatWorkbenchPage />} />
          <Route path="/model-gateway" element={<ModelGatewayPage />} />
          <Route path="/im-channels" element={<ChannelConnectorsPage />} />
          <Route path="/external" element={<Navigate to="/platforms" replace />} />
          <Route path="/cli-agents" element={<CliAgentsPage />} />
          <Route path="/long-tasks" element={<Navigate to="/cli-agents" replace />} />
          <Route path="/recovery" element={<Navigate to="/platforms/openclaw/guard" replace />} />
          <Route path="/platforms" element={<PlatformsPage />} />
          {/* `:platform` selects the platform child (currently `openclaw`); the
              optional `:section` is reserved for future deep sections and is
              read inside the page. */}
          <Route path="/platforms/:platform" element={<PlatformsPage />} />
          <Route path="/platforms/:platform/:section" element={<PlatformsPage />} />
          <Route path="/platforms/:platform/:section/:entityId" element={<PlatformsPage />} />
          <Route
            path="/platforms/:platform/:section/:entityId/:subsection"
            element={<PlatformsPage />}
          />
          {/* Legacy alias: the old app exposed /runtime-admin which routed to
              the recovery / system-guard surface. Redirect for old links. The
              old per-section deep link (/runtime-admin/:section) was the
              OpenClaw runtime admin surface — send it to the platform child. */}
          <Route path="/runtime-admin" element={<Navigate to="/platforms/openclaw/guard" replace />} />
          <Route path="/runtime-admin/:section" element={<Navigate to="/platforms/openclaw/guard" replace />} />
          {NAV_ITEMS.filter((item) => item.status === "coming-soon").map((item) => (
            <Route key={item.path} path={item.path} element={<ComingSoonPage />} />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}


function useLegacyPathRedirect() {
  React.useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash) return;

    const { pathname, search } = window.location;
    const normalizedPath = pathname.replace(/\/+$/g, "") || "/";
    let nextHash: string | null = null;

    if (normalizedPath === "/chat" || normalizedPath === "/chat/workbench") {
      nextHash = `/chat${search || ""}`;
    } else if (normalizedPath.startsWith("/chat/s/")) {
      const sessionRef = normalizedPath.split("/").filter(Boolean).pop() || "";
      const query = new URLSearchParams(search);
      if (sessionRef) query.set("sessionRef", sessionRef);
      nextHash = `/chat${query.toString() ? `?${query.toString()}` : ""}`;
    }

    if (!nextHash) return;
    window.history.replaceState(null, document.title, `/#${nextHash}`);
  }, []);
}
