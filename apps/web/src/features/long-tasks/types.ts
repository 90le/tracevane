/**
 * Long-task supervision console feature types.
 *
 * `/long-tasks` does NOT own any data contract. It synthesizes supervised
 * long-running work from four existing read sources (each owned by another
 * feature's data layer) into a single honest view-model:
 *
 *  - Chat bootstrap (sessions / run overlays / queue) → `@/lib/query/dashboard`
 *  - Channel-connector agent sessions + driver events  → `@/lib/query/channel-connectors`
 *  - Terminal session roster                           → `@/lib/query/terminal`
 *  - Self-heal recovery status                         → `@/lib/query/dashboard`
 *
 * CRITICAL supervision rule: TUI silence and child-agent fan-out are NOT
 * failure. We classify honestly (running / waiting / streaming / degraded /
 * failed / completed) and never fabricate completion or failure. The only
 * authoritative controls are channel agent-session stop/reap and terminal
 * session end — everything else is a deep-link to the owning domain.
 */

import type { ChannelConnectorAgentSessionRuntimeStatus } from "@/features/channel-connectors/types";
import type { TerminalSessionDescriptor } from "@/features/cli-agents/types";

/** Where a synthesized long-task row originated. */
export type LongTaskSource =
  | "chat-overlay"
  | "chat-session"
  | "chat-queue"
  | "channel-agent"
  | "channel-event"
  | "terminal"
  | "recovery";

/**
 * Honest supervision status. `running` / `streaming` mean active work;
 * `waiting` means queued/idle/pending (NOT failure); `degraded` means a
 * source reports a soft problem but the task is not dead; `failed` is only
 * used when the source explicitly reports an error/failure; `completed` only
 * when the source explicitly reports a terminal-success state.
 */
export type LongTaskStatus =
  | "running"
  | "streaming"
  | "waiting"
  | "degraded"
  | "failed"
  | "completed";

/** Coarse filter bucket over the honest statuses. */
export type LongTaskFilter = "all" | "active" | "waiting" | "attention" | "done";

/** Tone for badges / icon chips. */
export type LongTaskTone = "ok" | "warn" | "bad" | "mute" | "info";

/** lucide icon key resolved in the view. */
export type LongTaskIconKey =
  | "overlay"
  | "session"
  | "queue"
  | "channel"
  | "event"
  | "terminal"
  | "recovery";

/** The authoritative control a row supports, if any. */
export type LongTaskControl =
  | { kind: "channel-kill"; poolKey: string; sessionId: string }
  | { kind: "channel-reap" }
  | { kind: "terminal-end"; session: TerminalSessionDescriptor };

/** A labelled piece of read-only evidence shown in the inspector. */
export interface LongTaskEvidence {
  label: string;
  value: string;
}

/**
 * A single synthesized supervised long-task row. Built ONLY from live source
 * state — never fabricated. `to` deep-links to the owning domain so the
 * operator can act there when there is no authoritative in-page control.
 */
export interface LongTaskRow {
  id: string;
  title: string;
  /** Human-facing origin label, e.g. "Chat 运行" / "渠道 Agent". */
  sourceLabel: string;
  source: LongTaskSource;
  /** Raw status token from the source (kept for evidence honesty). */
  rawStatus: string;
  status: LongTaskStatus;
  tone: LongTaskTone;
  icon: LongTaskIconKey;
  /** Short one-line summary for the row + inspector header. */
  summary: string;
  /** ISO timestamp of the last observed activity, or null. */
  updatedAt: string | null;
  /** Owning-domain route for the deep-link (always present). */
  to: string;
  /** Human label for the deep-link action. */
  toLabel: string;
  /** Structured read-only evidence (trace / timing / source). */
  evidence: LongTaskEvidence[];
  /** Authoritative control, if the backend supports one for this row. */
  control: LongTaskControl | null;
}

/** Inputs the synthesis consumes — every source may be undefined. */
export interface LongTaskSources {
  chat: import("@/features/dashboard/types").ChatBootstrapPayload | undefined;
  channelSessions:
    | import("@/features/channel-connectors/types").ChannelConnectorAgentSessionDriverStatusResponse
    | undefined;
  terminalSessions:
    | import("@/features/cli-agents/types").TerminalSessionSummaryResponse
    | undefined;
  recovery:
    | import("@/features/dashboard/types").OpenClawRecoveryStatusPayload
    | undefined;
}

export type { ChannelConnectorAgentSessionRuntimeStatus, TerminalSessionDescriptor };
