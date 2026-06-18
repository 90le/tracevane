export interface TerminalActionItem {
  key: string;
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  command: string;
  recommendedTitle: string;
  runMode: 'new-session' | 'active-session';
}

export interface TerminalActionLayer {
  key: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  items: TerminalActionItem[];
}

export function buildTerminalActionLayers(): TerminalActionLayer[] {
  return [
    {
      key: "builtin",
      titleZh: "内置动作",
      titleEn: "Built-in Actions",
      descriptionZh: "常用的健康检查和诊断入口，适合快速起一个独立终端做排障。",
      descriptionEn: "Common health and diagnostic entries for fast troubleshooting sessions.",
      items: [
        {
          key: "health-check",
          labelZh: "健康检查",
          labelEn: "Health Check",
          descriptionZh: "检查 Tracevane 运行状态与关键依赖。",
          descriptionEn: "Inspect Tracevane runtime health and key dependencies.",
          command: "tracevane health-check",
          recommendedTitle: "健康检查",
          runMode: "new-session",
        },
        {
          key: "collect-diagnostics",
          labelZh: "收集诊断",
          labelEn: "Collect Diagnostics",
          descriptionZh: "收集当前环境的诊断信息，便于后续排查。",
          descriptionEn: "Collect diagnostics for later investigation.",
          command: "tracevane diagnostics collect",
          recommendedTitle: "收集诊断",
          runMode: "new-session",
        },
        {
          key: "terminal-coverage",
          labelZh: "终端工作区覆盖",
          labelEn: "Terminal Coverage",
          descriptionZh: "输出终端工作区覆盖与运行面清单。",
          descriptionEn: "Inspect terminal workspace coverage and runtime surfaces.",
          command: "npm run tracevane:terminal-workspace-coverage",
          recommendedTitle: "终端覆盖",
          runMode: "new-session",
        },
      ],
    },
    {
      key: "development",
      titleZh: "开发脚本",
      titleEn: "Development Scripts",
      descriptionZh: "直接进入常见的开发和重启流程。",
      descriptionEn: "Jump into common dev and restart workflows.",
      items: [
        {
          key: "dev-api",
          labelZh: "启动 API 开发服务",
          labelEn: "Start API Dev",
          descriptionZh: "编译并启动独立 API 开发服务。",
          descriptionEn: "Build and start the standalone API dev server.",
          command: "npm run dev:api",
          recommendedTitle: "API 开发服务",
          runMode: "new-session",
        },
        {
          key: "dev-web",
          labelZh: "启动 Web 开发服务",
          labelEn: "Start Web Dev",
          descriptionZh: "启动 Vite Web 控制台开发服务。",
          descriptionEn: "Start the Vite web console dev server.",
          command: "npm run dev:web",
          recommendedTitle: "Web 开发服务",
          runMode: "new-session",
        },
        {
          key: "dev-restart",
          labelZh: "重启开发环境",
          labelEn: "Restart Dev",
          descriptionZh: "执行仓库内置重启脚本，适合快速回到干净态。",
          descriptionEn: "Run the built-in restart script to return to a clean dev state.",
          command: "npm run dev:restart",
          recommendedTitle: "重启开发环境",
          runMode: "new-session",
        },
      ],
    },
    {
      key: "workspace",
      titleZh: "工作区工具",
      titleEn: "Workspace Toolkit",
      descriptionZh: "辅助查看工作区清单、类型检查和环境信息。",
      descriptionEn: "Helpers for inventory, typecheck, and environment inspection.",
      items: [
        {
          key: "workspace-inventory",
          labelZh: "工作区盘点",
          labelEn: "Workspace Inventory",
          descriptionZh: "列出当前管理域与运行面清单。",
          descriptionEn: "List the current management domain and runtime inventory.",
          command: "npm run tracevane:inventory",
          recommendedTitle: "工作区盘点",
          runMode: "new-session",
        },
        {
          key: "typecheck-web",
          labelZh: "Web 类型检查",
          labelEn: "Typecheck Web",
          descriptionZh: "执行前端 TypeScript 检查。",
          descriptionEn: "Run frontend TypeScript checks.",
          command: "npm run typecheck:web",
          recommendedTitle: "Web 类型检查",
          runMode: "new-session",
        },
        {
          key: "env-check",
          labelZh: "环境检查",
          labelEn: "Environment Check",
          descriptionZh: "查看独立 API 启动参数和环境入口。",
          descriptionEn: "Inspect standalone API startup help and environment entry points.",
          command: "node scripts/start-standalone-api.mjs --help",
          recommendedTitle: "环境检查",
          runMode: "new-session",
        },
      ],
    },
  ];
}
