import type {
  DashboardContextSummary,
  DashboardRecoveryItem,
  DashboardSummaryPayload,
  DashboardTrendPanel,
  DashboardTrendPoint,
} from "../../../../../types/dashboard";
import { shellNavGroups } from "../shell/route-manifest";

export type DashboardPriorityAction = {
  id: string;
  to: string;
  title: string;
  detail: string;
};

type DashboardText = (zh: string, en: string) => string;

function pickFirstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

type DashboardQuickActionKey =
  | "chat"
  | "agents"
  | "config"
  | "cron"
  | "dreaming"
  | "system";

type DashboardQuickActionRecipe = {
  labelZh: string;
  labelEn: string;
  copyZh: string;
  copyEn: string;
};

type DashboardQuickActionManifest = {
  key: string;
  to: string;
  labelEn: string;
};

const dashboardQuickActionOrder: DashboardQuickActionKey[] = [
  "chat",
  "agents",
  "config",
  "cron",
  "dreaming",
  "system",
];

const dashboardQuickActionRecipes: Record<
  DashboardQuickActionKey,
  DashboardQuickActionRecipe
> = {
  chat: {
    labelZh: "进入私聊入口",
    labelEn: "Open chat entry",
    copyZh: "继续最近会话或打开新的 operator 私聊。",
    copyEn: "Resume recent sessions or open a new operator chat.",
  },
  agents: {
    labelZh: "查看 Agent roster",
    labelEn: "Inspect agent roster",
    copyZh: "检查 Agent 配置、工作区和运行态。",
    copyEn: "Review agent configuration, workspaces, and live state.",
  },
  config: {
    labelZh: "调整系统默认值",
    labelEn: "Adjust system defaults",
    copyZh: "编辑模型、sandbox 和工具默认配置。",
    copyEn: "Edit model, sandbox, and tool defaults.",
  },
  cron: {
    labelZh: "检查自动化任务",
    labelEn: "Review cron jobs",
    copyZh: "查看 schedule、delivery target 和执行入口。",
    copyEn: "Check schedules, delivery targets, and execution entry points.",
  },
  dreaming: {
    labelZh: "打开梦境工作台",
    labelEn: "Open dreaming workbench",
    copyZh: "检查 memory slot、Dreaming 开关和 Dream Diary。",
    copyEn:
      "Inspect memory slot selection, the dreaming toggle, and the Dream Diary.",
  },
  system: {
    labelZh: "打开系统诊断",
    labelEn: "Open diagnostics",
    copyZh: "查看健康状态、bootstrap 和设备信任。",
    copyEn: "Inspect health, bootstrap state, and device trust.",
  },
};

function buildManifestItemMap(): Map<string, DashboardQuickActionManifest> {
  const map = new Map<string, DashboardQuickActionManifest>();
  for (const group of shellNavGroups) {
    for (const item of group.items) {
      if (item.future) continue;
      map.set(item.key, {
        key: item.key,
        to: item.to,
        labelEn: item.labelEn,
      });
    }
  }
  return map;
}

export function buildDashboardQuickActions(text: DashboardText) {
  const itemMap = buildManifestItemMap();

  return dashboardQuickActionOrder.flatMap((key) => {
    const item = itemMap.get(key);
    if (!item) return [];

    const recipe = dashboardQuickActionRecipes[key];
    return [
      {
        to: item.to,
        eyebrow: item.labelEn,
        label: text(recipe.labelZh, recipe.labelEn),
        copy: text(recipe.copyZh, recipe.copyEn),
      },
    ];
  });
}

export function buildDashboardPriorityAction(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardPriorityAction | null {
  const { payload, text } = options;

  if (!payload) {
    return null;
  }

  if (payload.events.recentFailures > 0) {
    return {
      id: "summary-recent-failures",
      to: "/system/events",
      title: text("排查最近失败", "Investigate recent failures"),
      detail:
        pickFirstNonEmpty(payload.events.latestFailureTitle) ||
        text(
          "存在最近失败事件，建议优先排查。",
          "Recent failures need investigation.",
        ),
    };
  }

  const recoveryItem = payload.recovery.items[0];
  if (recoveryItem) {
    return {
      id: `recovery-${recoveryItem.id}`,
      to: recoveryItem.to,
      title: recoveryItem.title,
      detail: recoveryItem.note,
    };
  }

  if (payload.terminalWorkspace.recoverableSessions > 0) {
    return {
      id: "summary-recoverable-sessions",
      to: "/terminal",
      title: text("恢复终端工作", "Resume terminal work"),
      detail:
        pickFirstNonEmpty(
          payload.terminalWorkspace.latestSessionTitle,
          payload.terminalWorkspace.latestCommandHint,
        ) ||
        text(
          "存在可恢复终端会话，建议继续处理。",
          "Recoverable terminal sessions are available.",
        ),
    };
  }

  if (payload.events.pendingAuditItems > 0) {
    return {
      id: "summary-pending-audit",
      to: "/system/events",
      title: text("检查待审计事项", "Review pending audit items"),
      detail:
        pickFirstNonEmpty(payload.events.latestAuditTitle) ||
        text(
          "存在待审计事项，建议尽快处理。",
          "Pending audit items require review.",
        ),
    };
  }

  return null;
}

export function buildDashboardRiskStage(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}) {
  const { payload, text } = options;

  if (!payload) {
    return [];
  }

  return [
    {
      key: "recovery",
      title: text("恢复待处理", "Recovery backlog"),
      value: String(payload.recovery.total),
      summary: payload.contextSummary.primaryHint,
      to: "/system",
    },
    {
      key: "risk",
      title: text("当前风险等级", "Risk stage"),
      value: payload.contextSummary.riskStage,
      summary: payload.contextSummary.secondaryHint,
      to: "/system/events",
    },
  ];
}

export function buildDashboardRecoveryItems(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardRecoveryItem[] {
  return Array.isArray(options.payload?.recovery?.items)
    ? options.payload.recovery.items
    : [];
}

export function buildDashboardTrendPanels(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardTrendPanel[] {
  const { payload } = options;
  return Array.isArray(payload?.trends?.panels) ? payload.trends.panels : [];
}

export function buildDashboardTrendPoints(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardTrendPoint[] {
  const { payload } = options;
  return Array.isArray(payload?.trends?.points) ? payload.trends.points : [];
}

export function buildDashboardContextSummary(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
}): DashboardContextSummary {
  const { payload, text } = options;

  if (!payload) {
    return {
      riskStage: "low",
      primaryHint: text(
        "等待 context summary。",
        "Waiting for context summary.",
      ),
      secondaryHint: text("等待恢复总览。", "Waiting for recovery summary."),
    };
  }

  return payload.contextSummary;
}

export function buildDashboardOverviewSignals(options: {
  payload: DashboardSummaryPayload | null;
  text: DashboardText;
  formatUptime: (seconds: number) => string;
}) {
  const { payload, text, formatUptime } = options;

  if (!payload) {
    return [
      {
        label: text("CLI coverage", "CLI coverage"),
        value: "--",
        detail: text("等待数据", "Waiting for data"),
      },
      {
        label: text("Server uptime", "Server uptime"),
        value: "--",
        detail: text("等待数据", "Waiting for data"),
      },
      {
        label: text("Pending fixes", "Pending fixes"),
        value: "--",
        detail: text("等待数据", "Waiting for data"),
      },
      {
        label: text("Pending pairing", "Pending pairing"),
        value: "--",
        detail: text("等待数据", "Waiting for data"),
      },
    ];
  }

  return [
    {
      label: text("CLI coverage", "CLI coverage"),
      value: `${payload.runtime.installedCliCount}/${payload.runtime.expectedCliCount}`,
      detail: text(
        "运行时 CLI 已安装 / 预期数量",
        "Installed / expected runtime CLIs",
      ),
    },
    {
      label: text("Server uptime", "Server uptime"),
      value: formatUptime(payload.server.uptime),
      detail: `Node ${payload.server.nodeVersion}`,
    },
    {
      label: text("Pending fixes", "Pending fixes"),
      value: String(payload.bootstrap.fixable),
      detail: text(
        "bootstrap 阶段可自动修复的问题数量",
        "Fixable issues reported by bootstrap",
      ),
    },
    {
      label: text("Pending pairing", "Pending pairing"),
      value: String(payload.deviceTrust.pendingRequests),
      detail: text(
        "等待审批的本地设备配对请求",
        "Device trust requests awaiting approval",
      ),
    },
  ];
}
