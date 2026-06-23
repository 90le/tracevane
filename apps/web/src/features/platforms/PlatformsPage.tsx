import * as React from "react";
import { useParams } from "react-router-dom";

import { OverviewView, OpenClawView } from "./views";

/**
 * Platform Integrations page. Renders BOTH:
 *  - `/platforms` — a read-only overview of integrated platforms / runtimes
 *    (OpenClaw runtime + the connection domains as cross-links).
 *  - `/platforms/openclaw` (+ optional `/platforms/openclaw/:section`) — a
 *    LIGHTWEIGHT OpenClaw platform summary (identity / health / version /
 *    diagnostics) that links OUT to the official OpenClaw Control / Web UI for
 *    all generic management.
 *
 * `/platforms` is a low-frequency platform-integration boundary, so the surface
 * is intentionally shallow: it does NOT replicate OpenClaw CRUD. Which surface
 * renders is decided purely from the route param (`platform`), so both are
 * deep-linkable and browser back/forward work.
 */
export function PlatformsPage() {
  const { platform } = useParams<{ platform?: string; section?: string }>();

  if (platform === "openclaw") {
    return <OpenClawView />;
  }

  return <OverviewView />;
}
