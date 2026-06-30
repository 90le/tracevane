import type {
  ChannelConnectorsStatusResponse,
  ChannelConnectorAgentSessionDriverStatusResponse,
} from "@/features/channel-connectors/types";
import type { ModelGatewayStatusResponse } from "@/features/model-gateway/types";

import type {
  ActiveWorkItem,
  AttentionItem,
  AttentionSeverity,
  DashboardSummaryPayload,
  OpenClawRecoveryStatusPayload,
  ReadinessPillar,
  ReadinessSummary,
  ReadinessTone,
  RecentActivityItem,
  SystemHealthPayload,
  TerminalStatusPayload,
} from "../types";

/** Owning-domain routes the cockpit deep-links to (it never writes). */
export const ROUTES = {
  modelGateway: "/model-gateway",
  imChannels: "/im-channels",
  recovery: "/platforms/openclaw/guard",
  platforms: "/platforms",
  cliAgents: "/cli-agents",
} as const;

/** Inputs the synthesis functions consume — every field may be undefined. */
export interface DashboardSources {
  summary: DashboardSummaryPayload | undefined;
  health: SystemHealthPayload | undefined;
  gateway: ModelGatewayStatusResponse | undefined;
  channelStatus: ChannelConnectorsStatusResponse | undefined;
  channelSessions: ChannelConnectorAgentSessionDriverStatusResponse | undefined;
  terminal: TerminalStatusPayload | undefined;
  recovery: OpenClawRecoveryStatusPayload | undefined;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const TONE_RANK: Record<ReadinessTone, number> = {
  bad: 0,
  warn: 1,
  mute: 2,
  info: 3,
  ok: 4,
};

/** Pick the worst (most severe) of two tones. */
function worseTone(a: ReadinessTone, b: ReadinessTone): ReadinessTone {
  return TONE_RANK[a] <= TONE_RANK[b] ? a : b;
}

// ---------------------------------------------------------------------------
// Attention queue — the task-first core. Built ONLY from live state.
// ---------------------------------------------------------------------------

/**
 * Synthesize the "needs attention / next step" queue from the aggregated live
 * sources. Each item deep-links to the owning domain. Nothing is fabricated:
 * an item appears only when its source reports a concrete problem. Sorted by
 * severity (high first).
 */
export function buildAttentionItems(
  sources: DashboardSources,
): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. Gateway degraded / circuit-open providers → /model-gateway.
  const health = sources.gateway?.healthSummary;
  if (health) {
    const degraded = health.degradedProviders + health.openCircuits;
    if (degraded > 0) {
      items.push({
        id: "gateway-degraded",
        title: "模型网关存在降级 Provider",
        detail: `${health.degradedProviders} 个降级 · ${health.openCircuits} 个熔断 · ${health.okProviders} 个健康`,
        severity: health.openCircuits > 0 ? "high" : "medium",
        icon: "gateway",
        to: ROUTES.modelGateway,
        actionLabel: "查看网关",
      });
    }
  }

  // 2. Channel daemon unreachable → /im-channels.
  const channelRuntime = sources.channelStatus?.runtime;
  if (channelRuntime && channelRuntime.reachable === false) {
    items.push({
      id: "channel-unreachable",
      title: "渠道守护进程不可达",
      detail: channelRuntime.error
        ? `daemon 未响应：${channelRuntime.error}`
        : "native channel daemon 未响应，IM 消息可能无法投递。",
      severity: "high",
      icon: "channel",
      to: ROUTES.imChannels,
      actionLabel: "查看渠道",
    });
  }

  // 3. Pending (queued) channel agent runs → /im-channels.
  const pending = channelRuntime?.pendingAgentRuns;
  if (pending && pending.count > 0) {
    items.push({
      id: "channel-pending-runs",
      title: `${pending.count} 个渠道 Agent 运行待处理`,
      detail: pending.oldestQueuedAt
        ? `最早排队于 ${formatTime(pending.oldestQueuedAt)}`
        : "存在排队中的 Agent 运行。",
      severity: "medium",
      icon: "channel",
      to: ROUTES.imChannels,
      actionLabel: "查看渠道",
    });
  }

  // 4. OpenClaw substrate guard unhealthy / repairing / failed → Platform guard.
  const recovery = sources.recovery;
  if (recovery && recovery.status !== "healthy") {
    const note = recovery.notes?.[0];
    const probeNote =
      recovery.probe.gatewayReachable === false ? "网关探测失败" : note;
    items.push({
      id: "recovery-unhealthy",
      title: `平台守护：${recovery.status}`,
      detail: probeNote ?? `平台守护状态为 ${recovery.status}，建议检查。`,
      severity:
        recovery.status === "failed"
          ? "high"
          : recovery.status === "degraded"
            ? "medium"
            : "low",
      icon: "recovery",
      to: ROUTES.recovery,
      actionLabel: "查看平台守护",
    });
  } else if (
    recovery &&
    recovery.lastRepair &&
    recovery.lastRepair.ok === false
  ) {
    items.push({
      id: "recovery-last-repair-failed",
      title: "上次平台守护修复失败",
      detail: recovery.lastRepair.error || "最近一次修复未成功，建议复核。",
      severity: "medium",
      icon: "recovery",
      to: ROUTES.recovery,
      actionLabel: "查看平台守护",
    });
  }

  // 5. Bootstrap errors / fixable issues → /platforms (system surface).
  const bootstrap = sources.summary?.bootstrap;
  if (
    bootstrap &&
    (bootstrap.errors > 0 || (!bootstrap.ready && bootstrap.fixable > 0))
  ) {
    items.push({
      id: "bootstrap-issues",
      title:
        bootstrap.errors > 0 ? "Bootstrap 存在阻断错误" : "Bootstrap 未就绪",
      detail: `${bootstrap.errors} 个错误 · ${bootstrap.warnings} 个警告 · ${bootstrap.fixable} 个可修复`,
      severity: bootstrap.errors > 0 ? "high" : "medium",
      icon: "bootstrap",
      to: ROUTES.platforms,
      actionLabel: "查看平台",
    });
  }

  // 6. Recent failure events from the server-derived summary → /platforms.
  const events = sources.summary?.events;
  if (events && events.recentFailures > 0) {
    items.push({
      id: "recent-failures",
      title: `${events.recentFailures} 个近期失败事件`,
      detail: events.latestFailureTitle ?? "存在需要排查的失败事件。",
      severity: "medium",
      icon: "system",
      to: ROUTES.platforms,
      actionLabel: "查看平台",
    });
  }

  // 7. Pending device-trust / audit items → /platforms.
  if (events && events.pendingAuditItems > 0) {
    items.push({
      id: "pending-audit",
      title: `${events.pendingAuditItems} 个待处理审计项`,
      detail: events.latestAuditTitle ?? "存在待确认的审计积压。",
      severity: "low",
      icon: "system",
      to: ROUTES.platforms,
      actionLabel: "查看平台",
    });
  }

  // 8. Channel agent sessions with a last error → /im-channels.
  const erroredSessions = (
    sources.channelSessions?.activeSessions ?? []
  ).filter((s) => Boolean(s.lastError));
  if (erroredSessions.length > 0) {
    items.push({
      id: "channel-session-errors",
      title: `${erroredSessions.length} 个渠道 Agent 会话报错`,
      detail: erroredSessions[0].lastError ?? "存在报错的渠道 Agent 会话。",
      severity: "medium",
      icon: "channel",
      to: ROUTES.imChannels,
      actionLabel: "查看渠道",
    });
  }

  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

// ---------------------------------------------------------------------------
// Hero readiness pillars + rollup.
// ---------------------------------------------------------------------------

/** The four "can I work right now?" pillars, each derived from live data. */
export function buildPillars(sources: DashboardSources): ReadinessPillar[] {
  const pillars: ReadinessPillar[] = [];

  // Gateway pillar.
  const gateway = sources.gateway;
  const health = gateway?.healthSummary;
  if (gateway) {
    const degraded =
      (health?.degradedProviders ?? 0) + (health?.openCircuits ?? 0);
    const listener = gateway.listener;
    pillars.push({
      id: "gateway",
      label: "模型路由",
      tone: degraded > 0 ? "warn" : "ok",
      value: degraded > 0 ? "降级" : "在线",
      detail: listener
        ? `${listener.host}:${listener.port} · ${health?.okProviders ?? 0} 健康`
        : `${health?.okProviders ?? 0} Provider 健康`,
      to: ROUTES.modelGateway,
    });
  } else {
    pillars.push({
      id: "gateway",
      label: "模型路由",
      tone: "mute",
      value: "未知",
      detail: "首屏后补齐",
      to: ROUTES.modelGateway,
    });
  }

  // Channel daemon pillar.
  const channelRuntime = sources.channelStatus?.runtime;
  if (channelRuntime) {
    const reachable = channelRuntime.reachable === true;
    const conns =
      (channelRuntime.feishuConnections ?? 0) +
      (channelRuntime.octoConnections ?? 0);
    pillars.push({
      id: "channel",
      label: "消息接入",
      tone: reachable ? "ok" : "bad",
      value: reachable ? "可达" : "离线",
      detail: reachable
        ? `${conns} 个连接 · ${channelRuntime.activeRuns ?? 0} 活跃运行`
        : channelRuntime.error || "channel daemon 未响应",
      to: ROUTES.imChannels,
    });
  } else {
    pillars.push({
      id: "channel",
      label: "消息接入",
      tone: "mute",
      value: "未知",
      detail: "首屏后补齐",
      to: ROUTES.imChannels,
    });
  }

  // Recovery pillar.
  const recovery = sources.recovery;
  if (recovery) {
    const tone: ReadinessTone =
      recovery.status === "healthy"
        ? "ok"
        : recovery.status === "failed"
          ? "bad"
          : recovery.status === "unknown"
            ? "mute"
            : "warn";
    pillars.push({
      id: "recovery",
      label: "平台守护",
      tone,
      value: recovery.status,
      detail:
        recovery.probe.gatewayReachable === false
          ? "网关探测失败"
          : recovery.daemon.pid
            ? `daemon pid ${recovery.daemon.pid}`
            : `service ${recovery.service.activeState || "未知"}`,
      to: ROUTES.recovery,
    });
  } else {
    pillars.push({
      id: "recovery",
      label: "平台守护",
      tone: "mute",
      value: "未知",
      detail: "首屏后补齐",
      to: ROUTES.recovery,
    });
  }

  // System runtime pillar.
  const healthSnap = sources.health;
  if (healthSnap) {
    const ok =
      healthSnap.gateway === "online" && healthSnap.serviceState === "active";
    pillars.push({
      id: "system",
      label: "系统运行时",
      tone: ok ? "ok" : healthSnap.gateway === "offline" ? "warn" : "mute",
      value: `v${healthSnap.version}`,
      detail: `${healthSnap.serviceState || "未知"} · ${healthSnap.platform}/${healthSnap.arch}`,
      to: ROUTES.platforms,
    });
  } else {
    pillars.push({
      id: "system",
      label: "系统运行时",
      tone: "mute",
      value: "未知",
      detail: "读取摘要中",
      to: ROUTES.platforms,
    });
  }

  return pillars;
}

/** Roll the pillars + attention queue into a single hero readiness verdict. */
export function buildReadiness(
  pillars: ReadinessPillar[],
  attention: AttentionItem[],
): ReadinessSummary {
  if (pillars.length === 0) {
    return { tone: "mute", label: "加载中", attentionCount: attention.length };
  }
  const tone = pillars.reduce<ReadinessTone>(
    (acc, p) => worseTone(acc, p.tone),
    "ok",
  );
  const hasHigh = attention.some((a) => a.severity === "high");
  const label =
    tone === "bad" || hasHigh
      ? "需要处理"
      : tone === "warn"
        ? "可工作（有降级）"
        : tone === "mute"
          ? "状态未知"
          : "一切就绪";
  return {
    tone: hasHigh ? worseTone(tone, "bad") : tone,
    label,
    attentionCount: attention.length,
  };
}

// ---------------------------------------------------------------------------
// In-progress work (read-only) + recent activity.
// ---------------------------------------------------------------------------

/** Active long-running work: channel agent sessions + running chat sessions. */
export function buildActiveWork(sources: DashboardSources): ActiveWorkItem[] {
  const items: ActiveWorkItem[] = [];

  for (const session of sources.channelSessions?.activeSessions ?? []) {
    items.push({
      id: `channel-${session.poolKey}`,
      title: `${session.agent} · ${session.bindingId}`,
      detail: session.lastError
        ? `报错：${session.lastError}`
        : `${session.running} 运行中 · ${session.turnCount} 轮 · ${formatRelative(session.lastUsedAt)}`,
      source: "channel-agent",
      to: ROUTES.imChannels,
    });
  }

  return items;
}

/**
 * Recent activity stream synthesized from the recovery event log + the
 * server-derived event summary. Newest first; capped by the caller's view.
 */
export function buildRecentActivity(
  sources: DashboardSources,
): RecentActivityItem[] {
  const items: RecentActivityItem[] = [];

  const lastRepair = sources.recovery?.lastRepair;
  if (lastRepair) {
    items.push({
      id: "recovery-last-repair",
      title: lastRepair.ok ? "自愈修复成功" : "自愈修复失败",
      detail: lastRepair.error
        ? lastRepair.error
        : `${lastRepair.trigger} 触发 · ${lastRepair.changedKeys.length} 项变更`,
      occurredAt: lastRepair.finishedAt || lastRepair.startedAt || null,
      tone: lastRepair.ok ? "ok" : "bad",
    });
  }

  const events = sources.summary?.events;
  if (events) {
    if (events.latestRecoveryTitle) {
      items.push({
        id: "summary-recovery",
        title: "近期恢复",
        detail: events.latestRecoveryTitle,
        occurredAt: null,
        tone: "ok",
      });
    }
    if (events.latestFailureTitle) {
      items.push({
        id: "summary-failure",
        title: "近期失败",
        detail: events.latestFailureTitle,
        occurredAt: null,
        tone: "bad",
      });
    }
    if (events.latestAuditTitle) {
      items.push({
        id: "summary-audit",
        title: "待处理审计",
        detail: events.latestAuditTitle,
        occurredAt: null,
        tone: "warn",
      });
    }
  }

  // Recent channel-driver runtime events (turn lifecycle).
  for (const event of (sources.channelSessions?.recentEvents ?? []).slice(
    0,
    4,
  )) {
    items.push({
      id: `channel-event-${event.checkedAt}-${event.type}-${event.sessionId ?? event.bindingId}`,
      title: `渠道：${event.type}`,
      detail: event.error ? event.error : `${event.agent} · ${event.bindingId}`,
      occurredAt: event.checkedAt,
      tone: event.error || event.type === "turn.failed" ? "bad" : "info",
    });
  }

  return items
    .sort((a, b) => {
      const at = a.occurredAt ? Date.parse(a.occurredAt) : 0;
      const bt = b.occurredAt ? Date.parse(b.occurredAt) : 0;
      return bt - at;
    })
    .slice(0, 8);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRelative(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const deltaMs = Date.now() - date.getTime();
  if (deltaMs < 0) return date.toLocaleTimeString();
  const mins = Math.floor(deltaMs / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  return date.toLocaleDateString();
}
