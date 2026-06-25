/**
 * Platform feature types.
 *
 * `/platforms` is the third-party platform domain. It owns platform identity,
 * platform health, platform-native capabilities and cross-domain evidence. It
 * may show links into Gateway / IM / CLI / Workspace, but those domains keep their
 * own write responsibility.
 */

export type { SystemHealthPayload, SystemDiagnosticsPayload } from "../../../../../types/system";
export type { OpenClawRecoveryStatusPayload } from "../../../../../types/openclaw-recovery";
export type { ModelGatewayStatusResponse } from "../../../../../types/model-gateway";
export type { ChannelConnectorsStatusResponse } from "../../../../../types/channel-connectors";

export type PlatformView = "overview" | "openclaw";

export type PlatformSectionId =
  | "overview"
  | "guard"
  | "config"
  | "agents"
  | "skills"
  | "channels"
  | "bindings"
  | "services"
  | "logs"
  | "diagnostics";

export interface OpenClawSection {
  id: PlatformSectionId;
  label: string;
  description: string;
  path: string;
}

export type PlatformTone = "ok" | "warn" | "bad" | "info";

export interface PlatformLink {
  label: string;
  to: string;
  external?: boolean;
}

export interface PlatformCard {
  id: string;
  title: string;
  category: string;
  summary: string;
  status: string;
  tone: PlatformTone;
  boundary: string;
  primary: PlatformLink;
  secondary?: PlatformLink;
}

export interface PlatformEvidence {
  label: string;
  value: string;
}
