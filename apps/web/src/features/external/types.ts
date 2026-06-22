/**
 * External Connections feature types.
 *
 * `/external` has NO dedicated backend. It is a read-only AGGREGATION console
 * that synthesizes third-party connection state from several existing source
 * APIs and links OUT to the owning domain for any write. This file:
 *  - re-exports the wire contracts the console reads (so views import from
 *    `@/features/external/types` instead of reaching across the workspace), and
 *  - defines the derived view-model types the aggregation produces.
 */

export type { ConfigSummaryPayload } from "../../../../../types/config";
export type { SkillsSummaryPayload, SkillSummary } from "../../../../../types/skills";
export type { SystemDiagnosticsPayload } from "../../../../../types/system";
export type {
  ModelGatewayAppConnection,
  ModelGatewayAppConnectionsResponse,
} from "../../../../../types/model-gateway";
export type { ChannelConnectorsStatusResponse } from "../../../../../types/channel-connectors";

// ---------------------------------------------------------------------------
// Derived view-model
// ---------------------------------------------------------------------------

/** Health tone for a connection, derived from its source status text/flags. */
export type ExternalConnectionTone = "ok" | "warn" | "bad" | "info";

/** Which source domain owns the actual write flow for a connection. */
export type ExternalConnectionKind =
  | "mcp"
  | "tools"
  | "app-connection"
  | "messaging"
  | "http";

/** A deep-link OUT to the owning domain that performs writes for a connection. */
export interface ExternalConnectionLink {
  label: string;
  /** Hash-router path (e.g. `/model-gateway?tab=connections&app=codex`). */
  to: string;
}

/** A single key/value evidence line shown in the connection inspector. */
export interface ExternalEvidence {
  label: string;
  value: string;
}

/** A capability/tool the connection exposes (MCP server, skill, etc.). */
export interface ExternalCapability {
  name: string;
  detail: string;
  tone: ExternalConnectionTone;
}

/**
 * One aggregated external connection row. Built purely from real source-API
 * fields — no fabricated data. When a source is empty the row reflects that.
 */
export interface ExternalConnection {
  id: string;
  title: string;
  /** Where the row's facts come from (source API / path). */
  source: string;
  kind: ExternalConnectionKind;
  /** Short kind label for the type column (MCP / Tools / App Connection / …). */
  kindLabel: string;
  /** Raw status text from the source. */
  status: string;
  tone: ExternalConnectionTone;
  /** Capability/identity summary for the count column (e.g. "3 servers"). */
  summary: string;
  /** Transport / protocol descriptor (stdio, http, OAuth, json/toml, …). */
  transport: string;
  /** Redacted credential reference — never plaintext. */
  credentialRef: string;
  detail: string;
  evidence: ExternalEvidence[];
  capabilities: ExternalCapability[];
  /** Deep-link OUT to the owning domain for writes; null when local-only. */
  writeLink: ExternalConnectionLink | null;
}
