import * as React from "react";
import { useParams } from "react-router-dom";

import { RecoveryPage } from "@/features/recovery/RecoveryPage";

import { OverviewView, OpenClawView } from "./views";

/**
 * Platform Integrations page. Renders BOTH:
 *  - `/platforms` — a read-only overview of integrated platforms / runtimes
 *    (OpenClaw runtime + the connection domains as cross-links).
 *  - `/platforms/openclaw` — a LIGHTWEIGHT OpenClaw platform summary
 *    (identity / health / version / diagnostics) that links OUT to the
 *    official OpenClaw Control / Web UI for all generic management.
 *  - `/platforms/openclaw/recovery` — the OpenClaw substrate guard and repair
 *    console, merged under Platform. `/recovery` remains a redirect only.
 *
 * `/platforms` is a low-frequency platform-integration boundary, so the surface
 * is intentionally shallow: it does NOT replicate OpenClaw CRUD. Which surface
 * renders is decided purely from the route param (`platform`), so both are
 * deep-linkable and browser back/forward work.
 */
export function PlatformsPage() {
  const { platform, section } = useParams<{ platform?: string; section?: string }>();

  if (platform === "openclaw" && section === "recovery") {
    return <RecoveryPage />;
  }

  if (platform === "openclaw") {
    return <OpenClawView />;
  }

  return <OverviewView />;
}
