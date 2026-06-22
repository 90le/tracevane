import { apiRequest } from "./client";
import type { ConfigSummaryPayload } from "../../../../../types/config";
import type { SkillsSummaryPayload } from "../../../../../types/skills";
import type { SystemDiagnosticsPayload } from "../../../../../types/system";

/**
 * Typed transport bindings for the read-only source APIs the External
 * Connections console AGGREGATES. These are the sources the old page consumed
 * that are NOT already wrapped by another feature's data layer
 * (model-gateway app-connections + channel-connectors status are reused from
 * their own modules — they are intentionally NOT re-bound here).
 *
 * Routes:
 *  - GET /api/config            → OpenClaw config summary (commands + mcp.servers)
 *  - GET /api/skills            → managed skills / local tool capability summary
 *  - GET /api/system/diagnostics → Tracevane local HTTP bridge facts
 *
 * All three are read-only GETs. The console never writes through these.
 */

/** GET /api/config — OpenClaw config summary (MCP servers, command toggles). */
export function getOpenClawConfigSummary(
  signal?: AbortSignal,
): Promise<ConfigSummaryPayload> {
  return apiRequest<ConfigSummaryPayload>("/api/config", { signal });
}

/** GET /api/skills — managed skills + local tool capability summary. */
export function getSkillsSummary(signal?: AbortSignal): Promise<SkillsSummaryPayload> {
  return apiRequest<SkillsSummaryPayload>("/api/skills", { signal });
}

/** GET /api/system/diagnostics — Tracevane local HTTP bridge diagnostics. */
export function getSystemDiagnostics(
  signal?: AbortSignal,
): Promise<SystemDiagnosticsPayload> {
  return apiRequest<SystemDiagnosticsPayload>("/api/system/diagnostics", { signal });
}
