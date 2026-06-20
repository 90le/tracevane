import * as React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuroraShell } from "./AuroraShell";
import { routeDefs } from "./route-manifest";
import { PrototypePage } from "./PrototypePage";
import { RuntimeAdminPage } from "./RuntimeAdminPage";

export function App() {
  return (
    <AuroraShell>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {routeDefs.map((route) => (
          <Route
            key={route.path}
            path={`/${route.path}`}
            element={route.surface === "react" ? <RuntimeAdminPage /> : <PrototypePage route={route} />}
          />
        ))}
        <Route path="/runtime-admin/:section" element={<RuntimeAdminPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuroraShell>
  );
}
