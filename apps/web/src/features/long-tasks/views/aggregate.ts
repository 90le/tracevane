import type {
  LongTaskEvidence,
  LongTaskFilter,
  LongTaskIconKey,
  LongTaskRow,
  LongTaskSources,
  LongTaskStatus,
  LongTaskTone,
} from "../types";

/** Owning-domain routes the console deep-links to. */
export const ROUTES = {
  chat: "/chat",
  imChannels: "/im-channels",
  cliAgents: "/cli-agents",
  recovery: "/recovery",
} as const;

const STATUS_TONE: Record<LongTaskStatus, LongTaskTone> = {
  running: "ok",
  streaming: "ok",
  waiting: "warn",
  degraded: "warn",
  failed: "bad",
  completed: "mute",
};

const STATUS_RANK: Record<LongTaskStatus, number> = {
  failed: 0,
  degraded: 1,
  streaming: 2,
  running: 3,
  waiting: 4,
  completed: 5,
};

export const STATUS_LABEL: Record<LongTaskStatus, string> = {
  running: "运行中",
  streaming: "流式输出",
  waiting: "等待中",
  degraded: "降级",
  failed: "失败",
  completed: "已完成",
};

const ICON_TONE: Record<LongTaskIconKey, LongTaskTone> = {
  overlay: "info",
  session: "info",
  queue: "warn",
  channel: "info",
  event: "info",
  terminal: "info",
  recovery: "info",
};

/**
 * Classify a raw source status token into an honest supervision status.
 *
 * Ported from the old page's `statusBucket` / `stateTone` logic, but explicit
 * about the supervision rule: queued / pending / idle / detached are WAITING,
 * not failure; only an explicit error/failure/lost token becomes `failed`.
 * Silence is NEVER classified here (the caller does not synthesize a row from
 * the absence of output).
 */
export function classifyStatus(raw: string): LongTaskStatus {
  const t = raw.toLowerCase().trim();
  if (/(failed|error|lost|aborted|crashed|blocked)/.test(t)) return "failed";
  if (/(degraded|repairing|stale|fallback)/.test(t)) return "degraded";
  if (/(streaming)/.test(t)) return "streaming";
  if (/(running|active|detached|busy)/.test(t)) return "running";
  if (/(queued|pending|planned|scheduled|waiting|idle)/.test(t)) return "waiting";
  if (/(completed|succeeded|finished|done|ok|healthy|ready)/.test(t)) return "completed";
  // Unknown / silent → waiting, never failure (honest supervision).
  return "waiting";
}

/** Map an honest status into the coarse filter bucket. */
export function statusBucket(status: LongTaskStatus): Exclude<LongTaskFilter, "all"> {
  switch (status) {
    case "running":
    case "streaming":
      return "active";
    case "waiting":
      return "waiting";
    case "failed":
    case "degraded":
      return "attention";
    case "completed":
      return "done";
  }
}

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
// Synthesis — merge the four sources into typed, honestly-classified rows.
// ---------------------------------------------------------------------------

/**
 * Build the supervised long-task roster from the aggregated live sources.
 * Pure: no fetching, no fabrication. A row only appears when a source reports
 * concrete state. Rows are de-duplicated by id and sorted by status severity
 * (attention first) then recency.
 */
export function buildLongTasks(sources: LongTaskSources): LongTaskRow[] {
  const rows: LongTaskRow[] = [];

  // --- Chat run overlays (in-flight agent runs from selected history) -------
  const overlays = sources.chat?.history?.overlays ?? [];
  for (const overlay of overlays) {
    const status = classifyStatus(overlay.lifecycle);
    const tools = overlay.toolCalls ?? [];
    rows.push({
      id: `chat-overlay:${overlay.runId}`,
      title: overlay.previewText?.trim() || `Agent run ${overlay.runId}`,
      sourceLabel: "Chat 运行 overlay",
      source: "chat-overlay",
      rawStatus: overlay.lifecycle,
      status,
      tone: STATUS_TONE[status],
      icon: "overlay",
      summary: `${tools.length} 个工具调用 · run ${overlay.runId}`,
      updatedAt: newest(overlay.updatedAt, overlay.startedAt),
      to: ROUTES.chat,
      toLabel: "在对话中查看",
      evidence: [
        { label: "Run ID", value: overlay.runId },
        { label: "Lifecycle", value: overlay.lifecycle },
        { label: "开始于", value: overlay.startedAt || "—" },
        { label: "首个助手响应", value: overlay.firstAssistantSeenAt || "尚未产生（仍在运行，非失败）" },
        { label: "首个工具调用", value: overlay.firstToolStartedAt || "尚未产生" },
        ...tools.slice(0, 6).map<LongTaskEvidence>((tool, i) => ({
          label: `工具 ${i + 1}`,
          value: `${tool.name ?? "tool"} · ${tool.status ?? "unknown"}`,
        })),
      ],
      control: null,
    });
  }

  // --- Chat sessions in a non-terminal runtime state ------------------------
  for (const session of sources.chat?.sessions ?? []) {
    const rawState = session.runtime.state;
    // Skip terminal / idle sessions that carry no error — they are not
    // "supervised long tasks". An errored session is always surfaced.
    const errored = Boolean(session.runtime.lastErrorMessage);
    const active =
      rawState === "running" || rawState === "streaming";
    if (!active && !errored) continue;
    const status = errored ? "failed" : classifyStatus(rawState);
    rows.push({
      id: `chat-session:${session.key}`,
      title: session.derivedTitle || session.label || session.sessionId || session.key,
      sourceLabel: `Chat 会话 · ${session.agentId}`,
      source: "chat-session",
      rawStatus: rawState,
      status,
      tone: STATUS_TONE[status],
      icon: "session",
      summary: session.lastMessagePreview?.trim() || `runtime ${rawState}`,
      updatedAt: newest(session.runtime.lastEventAt, session.updatedAt),
      to: ROUTES.chat,
      toLabel: "在对话中查看",
      evidence: [
        { label: "会话", value: session.sessionId || session.key },
        { label: "Agent", value: session.agentId },
        { label: "运行状态", value: rawState },
        { label: "网关连接", value: session.runtime.gatewayConnected ? "已连接" : "未连接" },
        { label: "可写", value: session.runtime.sessionWritable ? "是" : "否" },
        { label: "活跃 Run", value: session.runtime.activeRunId || "—" },
        ...(session.runtime.lastErrorMessage
          ? [{ label: "最近错误", value: session.runtime.lastErrorMessage }]
          : []),
      ],
      control: null,
    });
  }

  // --- Chat queue (waiting on a writable / idle session) --------------------
  for (const item of sources.chat?.queue?.items ?? []) {
    // queued | blocked — both are honest waiting states, not failure.
    const status: LongTaskStatus = "waiting";
    rows.push({
      id: `chat-queue:${item.id}`,
      title: item.previewText?.trim() || item.text?.trim() || `排队消息 ${item.id}`,
      sourceLabel: "Chat 队列",
      source: "chat-queue",
      rawStatus: item.status,
      status,
      tone: item.status === "blocked" ? "warn" : STATUS_TONE[status],
      icon: "queue",
      summary:
        item.status === "blocked"
          ? `已阻塞：${item.blockedReason ?? "等待会话恢复可写"}`
          : "等待会话空闲后投递",
      updatedAt: newest(item.updatedAt, item.createdAt),
      to: ROUTES.chat,
      toLabel: "在对话中处理",
      evidence: [
        { label: "队列项", value: item.id },
        { label: "状态", value: item.status },
        { label: "会话", value: item.sessionKey },
        { label: "投递请求", value: item.deliveryRequestId },
        ...(item.blockedReason ? [{ label: "阻塞原因", value: item.blockedReason }] : []),
      ],
      control: null,
    });
  }

  // --- Channel agent sessions (persistent CLI Agent runs) -------------------
  for (const session of sources.channelSessions?.activeSessions ?? []) {
    const errored = Boolean(session.lastError);
    const status: LongTaskStatus = errored
      ? "failed"
      : session.running > 0
        ? "running"
        : "waiting"; // idle persistent session is WAITING, not completed/dead.
    rows.push({
      id: `channel-agent:${session.poolKey}`,
      title: session.sessionId || session.poolKey,
      sourceLabel: `渠道 Agent · ${session.agent}`,
      source: "channel-agent",
      rawStatus: errored ? "error" : session.running > 0 ? "running" : "idle",
      status,
      tone: STATUS_TONE[status],
      icon: "channel",
      summary: errored
        ? `报错：${session.lastError}`
        : `${session.running} 个运行 · ${session.turnCount} 轮 · binding ${session.bindingId}`,
      updatedAt: newest(session.lastUsedAt, session.createdAt),
      to: ROUTES.imChannels,
      toLabel: "在 IM 渠道查看",
      evidence: [
        { label: "Session ID", value: session.sessionId },
        { label: "Pool Key", value: session.poolKey },
        { label: "Binding", value: session.bindingId },
        { label: "Agent / 模型", value: `${session.agent} · ${session.model ?? "—"}` },
        { label: "运行中 / 轮次", value: `${session.running} / ${session.turnCount}` },
        { label: "空闲", value: `${session.idleMs}ms` },
        { label: "工作目录", value: session.workDir },
        ...(session.lastError ? [{ label: "最近错误", value: session.lastError }] : []),
      ],
      // Authoritative control: stop (kill) this persistent session.
      control: { kind: "channel-kill", poolKey: session.poolKey, sessionId: session.sessionId },
    });
  }

  // --- Channel driver events (turn lifecycle) — only attention-worthy ones --
  for (const event of (sources.channelSessions?.recentEvents ?? []).slice(0, 12)) {
    // Only surface failure / fallback events as supervised rows; success
    // lifecycle events are routine and would just be noise here.
    const isFailure = Boolean(event.error) || event.type === "turn.failed";
    const isFallback = event.type === "turn.fallback";
    if (!isFailure && !isFallback) continue;
    const status: LongTaskStatus = isFailure ? "failed" : "degraded";
    rows.push({
      id: `channel-event:${event.checkedAt}:${event.type}:${event.sessionId ?? event.poolKey}`,
      title: event.type,
      sourceLabel: `渠道事件 · ${event.bindingId}`,
      source: "channel-event",
      rawStatus: event.type,
      status,
      tone: STATUS_TONE[status],
      icon: "event",
      summary: event.error || event.reason || event.type,
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
      control: null,
    });
  }

  // --- Terminal sessions ----------------------------------------------------
  for (const session of sources.terminalSessions?.sessions ?? []) {
    const status = classifyStatus(session.status);
    const live = session.status === "running" || session.status === "detached";
    const tail = session.recentOutputSummary?.tailText?.trim();
    rows.push({
      id: `terminal:${session.sessionId}`,
      title: session.title || session.sessionId,
      sourceLabel: `终端 · ${session.sourceModule}`,
      source: "terminal",
      rawStatus: session.status,
      status,
      tone: STATUS_TONE[status],
      icon: "terminal",
      summary: session.cwd || session.sourceAction || session.sessionId,
      updatedAt: newest(session.lastActiveAt, session.updatedAt),
      to: ROUTES.cliAgents,
      toLabel: "在 CLI 代理查看",
      evidence: [
        { label: "Session ID", value: session.sessionId },
        { label: "状态", value: session.status },
        { label: "来源", value: `${session.source} · ${session.sourceModule}/${session.sourceAction}` },
        { label: "工作目录", value: session.cwd ?? "—" },
        { label: "可恢复", value: session.canResume ? "是" : "否" },
        ...(session.recentOutputSummary?.lastError
          ? [{ label: "最近错误", value: session.recentOutputSummary.lastError }]
          : []),
        ...(tail ? [{ label: "最近输出", value: tail.slice(0, 400) }] : []),
      ],
      // Authoritative control: end a live PTY session.
      control: live ? { kind: "terminal-end", session } : null,
    });
  }

  // --- Recovery daemon monitor ----------------------------------------------
  const recovery = sources.recovery;
  if (recovery) {
    const status = classifyStatus(recovery.status);
    rows.push({
      id: "recovery:monitor",
      title: "自愈守护监控",
      sourceLabel: "Recovery 守护",
      source: "recovery",
      rawStatus: recovery.status,
      status,
      tone: STATUS_TONE[status],
      icon: "recovery",
      summary:
        recovery.probe.gatewayReachable === false
          ? "网关探测失败，守护可能正在修复"
          : `守护状态 ${recovery.status}`,
      updatedAt: newest(recovery.checkedAt, recovery.probe.checkedAt),
      to: ROUTES.recovery,
      toLabel: "在恢复页查看",
      evidence: [
        { label: "状态", value: recovery.status },
        {
          label: "网关可达",
          value:
            recovery.probe.gatewayReachable === null
              ? "未知"
              : recovery.probe.gatewayReachable
                ? "是"
                : "否",
        },
        { label: "失败时长", value: `${recovery.probe.failureDurationMs}ms` },
        { label: "下次检查", value: recovery.probe.nextCheckAt || "—" },
        { label: "Daemon PID", value: recovery.daemon.pid ? String(recovery.daemon.pid) : "—" },
        ...(recovery.lastRepair
          ? [
              {
                label: "上次修复",
                value: recovery.lastRepair.ok
                  ? `成功 · ${recovery.lastRepair.trigger}`
                  : `失败 · ${recovery.lastRepair.error ?? recovery.lastRepair.trigger}`,
              },
            ]
          : []),
        ...(recovery.notes?.[0] ? [{ label: "备注", value: recovery.notes[0] }] : []),
      ],
      control: null,
    });
  }

  // De-dup by id; sort by status severity then recency.
  const seen = new Set<string>();
  const deduped = rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
  return deduped.sort((a, b) => {
    const rank = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (rank !== 0) return rank;
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return (Number.isFinite(bt) ? bt : 0) - (Number.isFinite(at) ? at : 0);
  });
}

/** Count rows per coarse filter bucket (plus `all`). */
export function bucketCounts(rows: LongTaskRow[]): Record<LongTaskFilter, number> {
  const counts: Record<LongTaskFilter, number> = {
    all: rows.length,
    active: 0,
    waiting: 0,
    attention: 0,
    done: 0,
  };
  for (const r of rows) counts[statusBucket(r.status)] += 1;
  return counts;
}

/** Filter rows by the coarse bucket. */
export function filterRows(rows: LongTaskRow[], filter: LongTaskFilter): LongTaskRow[] {
  if (filter === "all") return rows;
  return rows.filter((r) => statusBucket(r.status) === filter);
}
