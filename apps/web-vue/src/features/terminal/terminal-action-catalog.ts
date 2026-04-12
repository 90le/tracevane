export interface TerminalActionItem {
  key: string;
  labelZh: string;
  labelEn: string;
}

export interface TerminalActionLayer {
  key: "builtin" | "scripts";
  titleZh: string;
  titleEn: string;
  items: TerminalActionItem[];
}

export function buildTerminalActionLayers(): TerminalActionLayer[] {
  return [
    {
      key: "builtin",
      titleZh: "内置动作",
      titleEn: "Built-in Actions",
      items: [
        {
          key: "health-check",
          labelZh: "健康检查",
          labelEn: "Health Check",
        },
        {
          key: "collect-diagnostics",
          labelZh: "收集诊断",
          labelEn: "Collect Diagnostics",
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
        },
        {
          key: "env-check",
          labelZh: "环境检查",
          labelEn: "Environment Check",
        },
      ],
    },
  ];
}
