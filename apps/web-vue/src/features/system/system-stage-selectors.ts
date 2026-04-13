import type { SystemHealthPayload } from "../../../../../types/system";

type SystemText = (zh: string, en: string) => string;

export interface SystemStageFact {
  label: string;
  value: string;
}

export interface SystemStageHeader {
  eyebrow: string;
  title: string;
  copy: string;
  facts: SystemStageFact[];
}

export interface SystemHealthSummary {
  statusLabel: string;
  statusTone: "sage" | "accent";
  serviceLabel: string;
  nodeLabel: string;
  platformLabel: string;
  hostLabel: string;
  sseLabel: string;
}

export interface SystemControlActionSummary {
  refreshLabel: string;
  refreshing: boolean;
}

export function buildSystemStageHeader(params: {
  pluginId: string;
  health: SystemHealthPayload | null;
  text: SystemText;
  formatBytes: (bytes: number) => string;
}): SystemStageHeader {
  const { pluginId, health, text, formatBytes } = params;

  return {
    eyebrow: pluginId || "studio",
    title: text("系统工作区", "System Workspace"),
    copy: text(
      "右侧不再是文案占位，而是直接查看运行态、Gateway 和 doctor 输出。",
      "The right side is no longer placeholder copy; it now shows live runtime, Gateway, and doctor output directly.",
    ),
    facts: [
      { label: "PID", value: String(health?.pid || 0) },
      {
        label: text("Gateway 端口", "Gateway Port"),
        value: String(health?.gatewayPort || 0),
      },
      {
        label: text("内存占用", "Memory Free"),
        value: formatBytes(health?.freeMemoryBytes || 0),
      },
    ],
  };
}

export function buildSystemHealthSummary(params: {
  health: SystemHealthPayload | null;
  text: SystemText;
}): SystemHealthSummary {
  const { health, text } = params;

  return {
    statusLabel: health?.gatewayConnected
      ? text("Gateway 在线", "Gateway Online")
      : text("Gateway 离线", "Gateway Offline"),
    statusTone: health?.gatewayConnected ? "sage" : "accent",
    serviceLabel: `${health?.serviceState || text("未知", "Unknown")} / ${health?.serviceSubState || text("未知", "Unknown")}`,
    nodeLabel: `Node ${health?.nodeVersion || "unknown"}`,
    platformLabel: `${health?.platform || "unknown"} / ${health?.arch || "unknown"}`,
    hostLabel: health?.hostname || text("未知", "Unknown"),
    sseLabel: `${text("连接", "SSE")} ${health?.sseConnections || 0}`,
  };
}

export function buildSystemControlActionSummary(params: {
  loading: boolean;
  diagnosticsLoading: boolean;
  text: SystemText;
}): SystemControlActionSummary {
  const refreshing = params.loading || params.diagnosticsLoading;

  return {
    refreshing,
    refreshLabel: refreshing
      ? params.text("刷新中...", "Refreshing...")
      : params.text("刷新诊断", "Refresh Diagnostics"),
  };
}
