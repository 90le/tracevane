import type {
  TerminalActionCatalogResponse,
  TerminalActionGroup,
} from "../../../../types/terminal.js";

const TERMINAL_ACTION_CATALOG: TerminalActionGroup[] = [
  {
    key: "builtin",
    titleZh: "内置动作",
    titleEn: "Built-in Actions",
    items: [
      {
        key: "health-check",
        labelZh: "健康检查",
        labelEn: "Health Check",
        command: "studio health-check",
      },
      {
        key: "collect-diagnostics",
        labelZh: "收集诊断",
        labelEn: "Collect Diagnostics",
        command: "studio diagnostics collect",
      },
    ],
  },
  {
    key: "scripts",
    titleZh: "脚本与模板",
    titleEn: "Scripts & Templates",
    items: [
      {
        key: "gateway-logs",
        labelZh: "查看 Gateway 日志",
        labelEn: "Gateway Logs",
        command: "npm run dev:api",
      },
      {
        key: "env-check",
        labelZh: "环境检查",
        labelEn: "Environment Check",
        command: "node scripts/start-standalone-api.mjs --help",
      },
    ],
  },
];

export function buildTerminalActionCatalog(): TerminalActionCatalogResponse {
  return {
    groups: TERMINAL_ACTION_CATALOG.map((group) => ({
      ...group,
      items: group.items.map((item) => ({ ...item })),
    })),
  };
}
