import { apiRequest } from "./client";
import type { ConfigPatchPayload, ConfigSaveResponse, ConfigSummaryPayload } from "../../../../../types/config";
import type { SkillsSummaryPayload } from "../../../../../types/skills";
import type { SystemDiagnosticsPayload } from "../../../../../types/system";

/**
 * Typed transport bindings for shared Platform/OpenClaw read sources. These
 * routes were originally consumed by the deleted `/external` aggregation page
 * and are now reused directly by Platform/OpenClaw sections
 * (model-gateway app-connections + channel-connectors status are reused from
 * their own modules — they are intentionally NOT re-bound here).
 *
 * Routes:
 *  - GET /api/config            → OpenClaw config summary (commands + mcp.servers)
 *  - GET /api/skills            → managed skills / local tool capability summary
 *  - GET /api/system/diagnostics → Tracevane local HTTP bridge facts
 *
 * All three are read-only GETs. Platform sections never write through these.
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


/** PATCH /api/config — guarded OpenClaw config partial update through the existing config service merge path. */
export function patchOpenClawConfig(
  payload: ConfigPatchPayload,
  signal?: AbortSignal,
): Promise<ConfigSaveResponse> {
  return apiRequest<ConfigSaveResponse>("/api/config", {
    method: "PATCH",
    body: JSON.stringify(payload),
    signal,
  });
}
