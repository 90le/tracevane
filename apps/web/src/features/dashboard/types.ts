/**
 * Dashboard cockpit feature types.
 *
 * The wire contracts live in the repo-level `types/*.ts` (the same files the
 * backend imports). We re-export the pieces the dashboard data layer + views
 * need, plus the derived view-model types the cockpit synthesizes from the
 * aggregated live sources.
 *
 * Reused contracts from other feature modules (NOT re-exported here):
 *  - Model Gateway status   → `@/features/model-gateway/types`
 *  - Channel Connectors     → `@/features/channel-connectors/types`
 */
export type { DashboardSummaryPayload } from "../../../../../types/dashboard";
export type { SystemHealthPayload } from "../../../../../types/system";
export type {
  ChatBootstrapPayload,
  ChatSessionRow,
  ChatRunState,
} from "../../../../../types/chat";
export type {
  TerminalStatusPayload,
  TerminalBinaryStatus,
} from "../../../../../types/terminal";
export type {
  OpenClawRecoveryStatusPayload,
  OpenClawRecoveryStateKind,
} from "../../../../../types/openclaw-recovery";

import type { ChannelConnectorAgentSessionRuntimeStatus } from "@/features/channel-connectors/types";

/** Severity ordering for the attention queue (high first). */
export type AttentionSeverity = "high" | "medium" | "low";

/** Tone used for the hero readiness chip + per-source badges. */
export type ReadinessTone = "ok" | "warn" | "bad" | "mute" | "info";

/**
 * A single synthesized "needs attention / next step" item. Built ONLY from
 * live aggregated state — never fabricated. Each item deep-links to the owning
 * domain so the operator acts there (the cockpit never writes).
 */
export interface AttentionItem {
  id: string;
  title: string;
  detail: string;
  severity: AttentionSeverity;
  /** lucide icon key, resolved in the view. */
  icon: AttentionIconKey;
  /** in-app route the item deep-links to (the owning domain). */
  to: string;
  /** human-facing label for the deep-link action. */
  actionLabel: string;
}

export type AttentionIconKey =
  | "gateway"
  | "channel"
  | "recovery"
  | "system"
  | "session"
  | "bootstrap";

/** Overall "can the operator work right now?" readiness rollup. */
export interface ReadinessSummary {
  tone: ReadinessTone;
  /** short headline state token, e.g. "就绪" / "降级" / "离线". */
  label: string;
  /** count of attention items folded into the rollup. */
  attentionCount: number;
}

/** A readiness pillar shown in the hero (gateway / channel / recovery / system). */
export interface ReadinessPillar {
  id: "gateway" | "channel" | "recovery" | "system";
  label: string;
  tone: ReadinessTone;
  value: string;
  detail: string;
  to: string;
}

/** A normalized "in progress" work item (active agent / chat session). */
export interface ActiveWorkItem {
  id: string;
  title: string;
  detail: string;
  source: "channel-agent" | "chat";
  to: string;
}

/** A normalized recent-activity entry surfaced from the aggregated sources. */
export interface RecentActivityItem {
  id: string;
  title: string;
  detail: string;
  occurredAt: string | null;
  tone: ReadinessTone;
}

/** A quick-launch entry that navigates to a key domain. */
export interface QuickLaunchEntry {
  id: string;
  label: string;
  detail: string;
  icon: AttentionIconKey | "chat" | "ide" | "external";
  to: string;
}

export type { ChannelConnectorAgentSessionRuntimeStatus };
