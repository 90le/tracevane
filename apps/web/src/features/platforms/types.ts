/**
 * Platform Integrations feature types.
 *
 * `/platforms` has NO dedicated backend. It is a LIGHTWEIGHT, read-only
 * platform-integration boundary that synthesizes platform/runtime identity,
 * health and version evidence from existing source APIs (system health,
 * self-heal recovery status, model gateway status, channel-connector runtime,
 * system diagnostics) and links OUT to the owning product domain — or, for
 * OpenClaw, to the official OpenClaw Control / Web UI — for any management.
 *
 * It does NOT replicate OpenClaw CRUD (config/agents/channels/skills/service).
 * That depth is delegated to the official OpenClaw UI.
 */

// Re-export the wire contracts the overview reads so views import from
// `@/features/platforms/types` instead of reaching across the workspace.
export type { SystemHealthPayload, SystemDiagnosticsPayload } from "../../../../../types/system";
export type { OpenClawRecoveryStatusPayload } from "../../../../../types/openclaw-recovery";
export type { ModelGatewayStatusResponse } from "../../../../../types/model-gateway";
export type { ChannelConnectorsStatusResponse } from "../../../../../types/channel-connectors";

// ---------------------------------------------------------------------------
// View routing
// ---------------------------------------------------------------------------

/** The two surfaces this page renders, resolved from the route. */
export type PlatformView = "overview" | "openclaw";

// ---------------------------------------------------------------------------
// Derived view-model
// ---------------------------------------------------------------------------

/** Health tone for a platform row, derived from its source status/flags. */
export type PlatformTone = "ok" | "warn" | "bad" | "info";

/** A deep-link target for a platform row — either a hash route or an http URL. */
export interface PlatformLink {
  label: string;
  /** Hash-router path (e.g. `/model-gateway`) or the platform child. */
  to: string;
  /** When true, `to` is an absolute http(s) URL opened in a new tab. */
  external?: boolean;
}

/**
 * One integrated platform / runtime row on the overview. Built purely from
 * real source-API fields — no fabricated data. When a source is empty / failed
 * the row reflects that honestly.
 */
export interface PlatformCard {
  id: string;
  title: string;
  /** Short category descriptor (runtime / model vendors / IM / MCP …). */
  category: string;
  /** Short identity / version / health summary derived from the source. */
  summary: string;
  /** Raw status text for the badge. */
  status: string;
  tone: PlatformTone;
  /** Boundary statement — what this row does NOT own. */
  boundary: string;
  /** Primary deep-link OUT to the owning domain or the platform child. */
  primary: PlatformLink;
  /** Optional secondary deep-link (e.g. recovery / external evidence). */
  secondary?: PlatformLink;
}

/** A labelled key/value evidence line in the OpenClaw summary. */
export interface PlatformEvidence {
  label: string;
  value: string;
}
