import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "@/app/AppShell";
import { ComingSoonPage } from "@/app/ComingSoonPage";
import { NAV_ITEMS } from "@/app/navigation";
import { ModelGatewayPage } from "@/features/model-gateway/ModelGatewayPage";
import { ChannelConnectorsPage } from "@/features/channel-connectors/ChannelConnectorsPage";

/**
 * App routing. HashRouter is required because the backend serves the SPA
 * without a server-side route fallback. `/` redirects to the only real route
 * (`/model-gateway`); every other nav path renders a coming-soon placeholder.
 */
export function AppRouter() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/model-gateway" replace />} />
          <Route path="/model-gateway" element={<ModelGatewayPage />} />
          <Route path="/im-channels" element={<ChannelConnectorsPage />} />
          {NAV_ITEMS.filter((item) => item.status === "coming-soon").map((item) => (
            <Route key={item.path} path={item.path} element={<ComingSoonPage />} />
          ))}
          <Route path="*" element={<Navigate to="/model-gateway" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
