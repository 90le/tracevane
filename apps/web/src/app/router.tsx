import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { ComingSoonPage } from "@/app/ComingSoonPage";
import { NAV_ITEMS } from "@/app/navigation";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ModelGatewayPage } from "@/features/model-gateway/ModelGatewayPage";
import { ChannelConnectorsPage } from "@/features/channel-connectors/ChannelConnectorsPage";
import { ExternalConnectionsPage } from "@/features/external/ExternalConnectionsPage";

/**
 * App routing. HashRouter is required because the backend serves the SPA
 * without a server-side route fallback. `/` redirects to the landing route
 * (`/dashboard`); every other nav path renders either a built feature or a
 * coming-soon placeholder.
 */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/model-gateway" element={<ModelGatewayPage />} />
          <Route path="/im-channels" element={<ChannelConnectorsPage />} />
          <Route path="/external" element={<ExternalConnectionsPage />} />
          {NAV_ITEMS.filter((item) => item.status === "coming-soon").map((item) => (
            <Route key={item.path} path={item.path} element={<ComingSoonPage />} />
          ))}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
