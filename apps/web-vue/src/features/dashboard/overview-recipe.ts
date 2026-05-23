import type { DashboardSummaryPayload } from "../../../../../types/dashboard";

type DashboardText = (zh: string, en: string) => string;

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
