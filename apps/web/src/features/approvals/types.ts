/**
 * Approvals (审批) feature types.
 *
 * `/approvals` owns NO data contract of its own. There is deliberately no
 * dedicated approvals backend API: in Tracevane, approvals happen IN-CONTEXT —
 *
 *  - Chat tool-approval / host-management-exec gating lives inside a chat
 *    session's controls + run overlays (`@/lib/query/dashboard` bootstrap).
 *  - IM permission-pending flows are handled entirely inside the channel
 *    daemon, which replies the permission prompt back into the IM thread for
 *    the operator to approve there. No queryable "pending approval" record is
 *    exposed by the agent-sessions API — only lifecycle / turn events
 *    (`@/lib/query/channel-connectors`).
 *
 * So this page is an HONEST AGGREGATION of the real approval-adjacent signals
 * that DO exist, plus deep-links to act in-context. It never fabricates an
 * approval queue, and it never renders a fake approve button: the ONLY in-page
 * resolve action wired here is the chat per-session host-management-exec policy
 * toggle, which has a real backend contract (`usePatchChatControlsMutation`).
 * Every other item deep-links to the surface that actually owns the decision.
 */

import type { ChatSessionRow } from "@/features/dashboard/types";

/** Where a synthesized approval item originated. */
export type ApprovalSource =
  | "chat-policy" // per-session host-management-exec gate (real toggle)
  | "chat-run" // an active run with tool calls — approvals happen in its toolbar
  | "channel-session" // a persistent IM agent session with a permission posture
  | "channel-event"; // a recent channel turn failure/fallback — may need a decision in-thread

/** How urgent / risky the item is. Drives grouping + badge tone. */
export type ApprovalRisk = "action-required" | "review" | "info";

/** Tone for badges / icon chips (shared Aurora tones). */
export type ApprovalTone = "ok" | "warn" | "bad" | "mute" | "info";

/** lucide icon key resolved in the view. */
export type ApprovalIconKey = "policy" | "run" | "channel" | "event";

/**
 * The authoritative in-page resolve action an item supports, if any.
 *
 * `chat-host-exec-toggle` is the ONLY real one: it patches the chat session's
 * `allowHostManagementExec` policy via the existing controls mutation. Setting
 * it to `true` is the "approve" direction (let the agent run host-management
 * exec without prompting); `false` re-arms prompting. There is intentionally
 * no other resolve action because no other source exposes a resolve endpoint.
 */
export type ApprovalAction = {
  kind: "chat-host-exec-toggle";
  sessionKey: string;
  /** Current policy value (true = host-exec auto-approved). */
  current: boolean;
  /** Whether the global toggle gates this (read-only context for the operator). */
  globalEnabled: boolean;
};

/** A labelled piece of read-only evidence shown in the inspector. */
export interface ApprovalEvidence {
  label: string;
  value: string;
}

/**
 * A single synthesized approval item. Built ONLY from live source state — never
 * fabricated. `to` deep-links to the surface that owns the decision so the
 * operator can act in-context when there is no authoritative in-page action.
 */
export interface ApprovalItem {
  id: string;
  title: string;
  /** Human-facing origin label, e.g. "Chat 策略" / "渠道 Agent 会话". */
  sourceLabel: string;
  source: ApprovalSource;
  risk: ApprovalRisk;
  tone: ApprovalTone;
  icon: ApprovalIconKey;
  /** Short one-line summary for the row + inspector header. */
  summary: string;
  /** ISO timestamp of the last observed activity, or null. */
  updatedAt: string | null;
  /** Surface that owns the decision (deep-link, always present). */
  to: string;
  /** Human label for the deep-link action. */
  toLabel: string;
  /** Structured read-only evidence (context / trace / posture). */
  evidence: ApprovalEvidence[];
  /** Authoritative in-page resolve action, if the backend supports one. */
  action: ApprovalAction | null;
}

/** Coarse filter bucket over the risk classes. */
export type ApprovalFilter = "all" | "action-required" | "review" | "info";

/** Inputs the synthesis consumes — every source may be undefined. */
export interface ApprovalSources {
  chat: import("@/features/dashboard/types").ChatBootstrapPayload | undefined;
  channelSessions:
    | import("@/features/channel-connectors/types").ChannelConnectorAgentSessionDriverStatusResponse
    | undefined;
}

export type { ChatSessionRow };
