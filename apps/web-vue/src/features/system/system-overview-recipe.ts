import type {
  SystemDiagnosticsPayload,
  SystemHealthPayload,
  SystemStudioReleasePayload,
} from "../../../../../types/system";

type SystemText = (zh: string, en: string) => string;

export interface SystemOverviewCard {
  group: "health" | "runtime";
  label: string;
  value: string;
}

export interface SystemQuickAction {
  to: "/terminal" | "/cron";
  label: string;
}

export interface SystemEventSummaryItem {
  label: string;
  value: string;
}

export function buildSystemOverviewCards(params: {
  health: SystemHealthPayload | null;
  diagnostics: SystemDiagnosticsPayload | null;
  text: SystemText;
  formatUptime: (seconds: number) => string;
  formatLoad: (load: number[]) => string;
}) {
  const { health, diagnostics, text, formatUptime, formatLoad } = params;

  return {
    healthCards: [
      {
        group: "health" as const,
        label: text("Gateway", "Gateway"),
        value: health?.gatewayConnected
          ? text("在线", "Online")
          : text("离线", "Offline"),
      },
      {
        group: "health" as const,
        label: "systemd",
        value: `${health?.serviceState || text("未知", "Unknown")} / ${health?.serviceSubState || text("未知", "Unknown")}`,
      },
      {
        group: "health" as const,
        label: text("主机", "Host"),
        value: health?.hostname || text("未知", "Unknown"),
      },
      {
        group: "health" as const,
        label: text("Uptime", "Uptime"),
        value: formatUptime(health?.uptime || 0),
      },
      {
        group: "health" as const,
        label: text("CPU", "CPU"),
        value: `${health?.cpus || 0} cores`,
      },
      {
        group: "health" as const,
        label: text("Load", "Load"),
        value: formatLoad(health?.loadavg || []),
      },
    ],
    runtimeCards: [
      {
        group: "runtime" as const,
        label: text("默认 Agent", "Default Agent"),
        value: diagnostics?.status.agentsDefaultId || text("未知", "Unknown"),
      },
      {
        group: "runtime" as const,
        label: text("Agent 数量", "Agent Count"),
        value: String(diagnostics?.status.agentCount || 0),
      },
      {
        group: "runtime" as const,
        label: text("会话数", "Sessions"),
        value: String(diagnostics?.status.sessionCount || 0),
      },
      {
        group: "runtime" as const,
        label: text("Bootstrap 待处理", "Bootstrap Pending"),
        value: String(diagnostics?.status.bootstrapPendingCount || 0),
      },
      {
        group: "runtime" as const,
        label: text("安全审计", "Security Audit"),
        value: `${diagnostics?.status.securityCritical || 0} / ${diagnostics?.status.securityWarn || 0} / ${diagnostics?.status.securityInfo || 0}`,
      },
      {
        group: "runtime" as const,
        label: text("更新通道", "Updates"),
        value:
          diagnostics?.status.updateLatestVersion || text("未知", "Unknown"),
      },
    ],
  };
}

export function buildSystemQuickActions(text: SystemText): SystemQuickAction[] {
  return [
    {
      to: "/terminal",
      label: text("去终端", "Open Terminal"),
    },
    {
      to: "/cron",
      label: text("去定时任务", "Open Cron"),
    },
  ];
}

export function buildSystemEventSummaryItems(params: {
  diagnostics: SystemDiagnosticsPayload | null;
  studioRelease: SystemStudioReleasePayload | null;
  text: SystemText;
}): SystemEventSummaryItem[] {
  const { diagnostics, studioRelease, text } = params;

  return [
    {
      label: text("安全审计", "Security Audit"),
      value: `${diagnostics?.status.securityCritical || 0} critical / ${diagnostics?.status.securityWarn || 0} warn`,
    },
    {
      label: text("Agent / 会话", "Agents / Sessions"),
      value: `${diagnostics?.status.agentCount || 0} / ${diagnostics?.status.sessionCount || 0}`,
    },
    {
      label: text("更新版本", "Latest Version"),
      value:
        studioRelease?.latestVersion ||
        diagnostics?.status.updateLatestVersion ||
        text("未知", "Unknown"),
    },
  ];
}
