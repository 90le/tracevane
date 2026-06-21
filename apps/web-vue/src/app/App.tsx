import * as React from "react";
import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { AuroraShell } from "./AuroraShell";
import { routeDefs } from "./route-manifest";
import { PrototypePage } from "./PrototypePage";
import { ModelGatewayPage } from "./ModelGatewayPage";
import { OpenClawPlatformPage } from "./OpenClawPlatformPage";
import { PlatformIntegrationsPage } from "./PlatformIntegrationsPage";

function LegacyRuntimeRedirect() {
  const params = useParams();
  return <Navigate to={params.section ? `/platforms/openclaw/${params.section}` : "/platforms/openclaw"} replace />;
}

function routeElement(route: (typeof routeDefs)[number]) {
  if (route.path === "model-gateway") return <ModelGatewayPage />;
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
