import type { DashboardSummaryPayload } from "../../../../../types/dashboard";
import { shellNavGroups } from '../shell/route-manifest';

type DashboardText = (zh: string, en: string) => string;

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
