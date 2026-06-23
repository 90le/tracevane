import type {
  ApprovalEvidence,
  ApprovalFilter,
  ApprovalItem,
  ApprovalRisk,
  ApprovalSources,
  ApprovalTone,
} from "../types";

/** Surfaces that own an approval decision (deep-link targets). */
export const ROUTES = {
  chat: "/chat",
  imChannels: "/im-channels",
} as const;

const RISK_TONE: Record<ApprovalRisk, ApprovalTone> = {
  "action-required": "warn",
  review: "info",
  info: "mute",
};

const RISK_RANK: Record<ApprovalRisk, number> = {
  "action-required": 0,
  review: 1,
  info: 2,
};

export const RISK_LABEL: Record<ApprovalRisk, string> = {
  "action-required": "待处理",
  review: "建议复核",
  info: "提示",
};

function tsString(value: string | null | undefined): string | null {
  return value && value.trim() ? value : null;
}

function newest(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const ms = Date.parse(v);
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      best = v;
    } else if (best === null) {
      best = v;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Synthesis — merge the real approval-adjacent signals into typed items.
// ---------------------------------------------------------------------------

/**
 * Build the approval roster from live sources. Pure: no fetching, no
 * fabrication. An item only appears when a source reports concrete state that
 * is genuinely an approval / permission decision. Sorted by risk then recency.
 *
 * Honest framing:
 *  - The chat per-session host-management-exec gate IS a real, queryable
 *    approval policy with a real resolve endpoint — surfaced WITH an in-page
 *    toggle action.
 *  - Active chat runs with tool calls are where tool-approval prompts appear in
 *    the chat toolbar — surfaced as a deep-link (no queryable pending flag, no
 *    fake button).
 *  - IM permission-pending is handled by the daemon in the IM thread; we cannot
 *    see a pending record, so we only surface channel sessions' permission
 *    posture + recent turn failures as in-context deep-links.
 */
export function buildApprovals(sources: ApprovalSources): ApprovalItem[] {
  const items: ApprovalItem[] = [];

  const chat = sources.chat;

  // --- Chat per-session host-management-exec policy (REAL resolve action) ----
  // The selected session's controls are the one approval gate with a backend
  // contract. When auto-approve is OFF, the agent must prompt for each
  // host-management exec (an in-context approval); we surface it as
  // action-required so the operator can decide the standing policy here.
  const controls = chat?.controls ?? null;
  if (controls) {
    const session = controls.session;
    const allowed = controls.controls.allowHostManagementExec;
    const globalEnabled = controls.globalHostManagementExecEnabled;
    const risk: ApprovalRisk = allowed ? "info" : "action-required";
    items.push({
      id: `chat-policy:${session.key}`,
      title: `主机管理执行策略 · ${session.derivedTitle || session.label || session.sessionId || session.key}`,
      sourceLabel: `Chat 策略 · ${session.agentId}`,
      source: "chat-policy",
      risk,
      tone: RISK_TONE[risk],
      icon: "policy",
      summary: allowed
        ? "已允许主机管理执行：该会话内的相关工具调用不再逐次提示。"
        : globalEnabled
          ? "未允许主机管理执行：相关工具调用会在对话中逐次请求批准。"
          : "全局已禁用主机管理执行：即使开启会话策略也不会生效。",
      updatedAt: newest(controls.controls.updatedAt, controls.checkedAt),
      to: ROUTES.chat,
      toLabel: "在对话中查看",
      evidence: [
        { label: "会话", value: session.sessionId || session.key },
        { label: "Agent", value: session.agentId },
        { label: "会话策略", value: allowed ? "允许（自动批准）" : "需逐次批准" },
        { label: "全局开关", value: globalEnabled ? "已启用" : "已禁用" },
        { label: "更新于", value: controls.controls.updatedAt || "—" },
      ],
      // The ONLY authoritative in-page resolve action in this feature.
      action: {
        kind: "chat-host-exec-toggle",
        sessionKey: session.key,
        current: allowed,
        globalEnabled,
      },
    });
  }

  // --- Active chat runs — tool-approval prompts surface in the chat toolbar --
  // No queryable "awaiting approval" flag exists on overlays, so we do NOT
  // fabricate one. We only surface RUNNING runs that have tool calls, where an
  // approval prompt may be live, and deep-link to act in-context.
  const overlays = chat?.history?.overlays ?? [];
  for (const overlay of overlays) {
    if (overlay.lifecycle !== "running") continue;
    const tools = overlay.toolCalls ?? [];
    if (tools.length === 0) continue;
    items.push({
      id: `chat-run:${overlay.runId}`,
      title: overlay.previewText?.trim() || `进行中的 Agent 运行 ${overlay.runId}`,
      sourceLabel: "Chat 进行中运行",
      source: "chat-run",
      risk: "review",
      tone: RISK_TONE.review,
      icon: "run",
      summary: `${tools.length} 个工具调用进行中；如有工具批准请求，请在对话工具栏就地处理。`,
      updatedAt: newest(overlay.updatedAt, overlay.startedAt),
      to: ROUTES.chat,
      toLabel: "在对话中处理",
      evidence: [
        { label: "Run ID", value: overlay.runId },
        { label: "生命周期", value: overlay.lifecycle },
        { label: "工具调用数", value: String(tools.length) },
        { label: "首个工具", value: overlay.firstToolStartedAt || "—" },
        ...tools.slice(0, 6).map<ApprovalEvidence>((tool, i) => ({
          label: `工具 ${i + 1}`,
          value: `${tool.name ?? "tool"} · ${tool.status ?? "unknown"}`,
        })),
      ],
      action: null,
    });
  }

  // --- Channel agent sessions — permission posture (in-context, deep-link) ---
  // IM permission-pending lives in the IM thread (daemon replies the prompt),
  // not in a queryable record. We surface each persistent session's permission
  // posture so the operator knows where approvals are happening, and deep-link.
  for (const session of sources.channelSessions?.activeSessions ?? []) {
    const mode = session.permissionMode;
    // Only modes that imply the agent must surface a decision for approval are
    // approval-relevant. Per the ChannelConnectorPermissionMode enum, `suggest`
    // and `plan` gate on operator approval (in the IM thread); `read-only`,
    // `auto-edit`, `full-auto` and `yolo` do not prompt. We never invent a mode.
    const prompts = mode != null && /(suggest|plan)/i.test(mode);
    const risk: ApprovalRisk = prompts ? "review" : "info";
    items.push({
      id: `channel-session:${session.poolKey}`,
      title: session.sessionId || session.poolKey,
      sourceLabel: `渠道 Agent 会话 · ${session.agent}`,
      source: "channel-session",
      risk,
      tone: RISK_TONE[risk],
      icon: "channel",
      summary: prompts
        ? `权限模式 ${mode}：该会话的权限请求会在 IM 会话线程内就地审批。`
        : `权限模式 ${mode ?? "未知"}：审批在 IM 会话线程内处理（无需页内操作）。`,
      updatedAt: newest(session.lastUsedAt, session.createdAt),
      to: ROUTES.imChannels,
      toLabel: "在 IM 渠道处理",
      evidence: [
        { label: "Session ID", value: session.sessionId },
        { label: "Pool Key", value: session.poolKey },
        { label: "Binding", value: session.bindingId },
        { label: "Agent / 模型", value: `${session.agent} · ${session.model ?? "—"}` },
        { label: "权限模式", value: mode ?? "未知" },
        { label: "运行中 / 轮次", value: `${session.running} / ${session.turnCount}` },
        ...(session.lastError ? [{ label: "最近错误", value: session.lastError }] : []),
      ],
      action: null,
    });
  }

  // --- Channel turn failures — a stalled turn may await an in-thread decision -
  for (const event of (sources.channelSessions?.recentEvents ?? []).slice(0, 12)) {
    const isFailure = Boolean(event.error) || event.type === "turn.failed";
    const isFallback = event.type === "turn.fallback";
    if (!isFailure && !isFallback) continue;
    const risk: ApprovalRisk = "review";
    items.push({
      id: `channel-event:${event.checkedAt}:${event.type}:${event.sessionId ?? event.poolKey}`,
      title: event.type,
      sourceLabel: `渠道事件 · ${event.bindingId}`,
      source: "channel-event",
      risk,
      tone: RISK_TONE[risk],
      icon: "event",
      summary:
        event.error || event.reason || "渠道回合需关注；如涉及权限请在 IM 会话线程内处理。",
      updatedAt: tsString(event.checkedAt),
      to: ROUTES.imChannels,
      toLabel: "在 IM 渠道查看",
      evidence: [
        { label: "事件类型", value: event.type },
        { label: "Agent", value: event.agent },
        { label: "Binding", value: event.bindingId },
        { label: "模型", value: event.model ?? "—" },
        { label: "时间", value: event.checkedAt },
        ...(event.reason ? [{ label: "原因", value: event.reason }] : []),
        ...(event.error ? [{ label: "错误", value: event.error }] : []),
      ],
      action: null,
    });
  }

  // De-dup by id; sort by risk then recency.
  const seen = new Set<string>();
  const deduped = items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return deduped.sort((a, b) => {
    const rank = RISK_RANK[a.risk] - RISK_RANK[b.risk];
    if (rank !== 0) return rank;
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
  });
}

/** Count items per filter bucket (plus `all`). */
export function bucketCounts(items: ApprovalItem[]): Record<ApprovalFilter, number> {
  const counts: Record<ApprovalFilter, number> = {
    all: items.length,
    "action-required": 0,
    review: 0,
    info: 0,
  };
  for (const item of items) counts[item.risk] += 1;
  return counts;
}

/** Filter items by risk bucket. */
export function filterItems(items: ApprovalItem[], filter: ApprovalFilter): ApprovalItem[] {
  if (filter === "all") return items;
  return items.filter((item) => item.risk === filter);
}
