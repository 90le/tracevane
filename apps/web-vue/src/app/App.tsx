import * as React from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuroraShell } from "./AuroraShell";
import { ChatWorkbenchPage } from "./ChatWorkbenchPage";
import { CliAgentsPage } from "./CliAgentsPage";
import { DashboardPage } from "./DashboardPage";
import { routeDefs } from "./route-manifest";
import { ImChannelsPage } from "./ImChannelsPage";
import { LongTasksPage } from "./LongTasksPage";
import { PrototypePage } from "./PrototypePage";
import { ModelGatewayPage } from "./ModelGatewayPage";
import { OpenClawPlatformPage } from "./OpenClawPlatformPage";
import { PlatformIntegrationsPage } from "./PlatformIntegrationsPage";
import { RecoveryPage } from "./RecoveryPage";
import { WorkspaceIdePage } from "./WorkspaceIdePage";

function LegacyRuntimeRedirect() {
  const params = useParams();
  return <Navigate to={params.section ? `/platforms/openclaw/${params.section}` : "/platforms/openclaw"} replace />;
}

function routeElement(route: (typeof routeDefs)[number]) {
  if (route.path === "dashboard") return <DashboardPage />;
  if (route.path === "chat") return <ChatWorkbenchPage />;
  if (route.path === "ide") return <WorkspaceIdePage />;
  if (route.path === "long-tasks") return <LongTasksPage />;
  if (route.path === "cli-agents") return <CliAgentsPage />;
  if (route.path === "im-channels") return <ImChannelsPage />;
  if (route.path === "model-gateway") return <ModelGatewayPage />;
  if (route.path === "recovery") return <RecoveryPage />;
  if (route.path === "platforms") return <PlatformIntegrationsPage />;
  return <PrototypePage route={route} />;
}

export function App() {
  return (
    <AuroraShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {routeDefs.map((route) => (
          <Route
            key={route.path}
            path={`/${route.path}`}
            element={routeElement(route)}
          />
        ))}
        <Route path="/platforms/openclaw" element={<OpenClawPlatformPage />} />
        <Route path="/platforms/openclaw/:section" element={<OpenClawPlatformPage />} />
        <Route path="/runtime-admin" element={<LegacyRuntimeRedirect />} />
        <Route path="/runtime-admin/:section" element={<LegacyRuntimeRedirect />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuroraShell>
  );
}
