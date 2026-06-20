/* 页面注册表 + 导航分组 + 全局命令。
 * 每页通过 AuroraDefinePage 注册；内容来自 pages/<name>.html 片段。
 */
(function () {
  window.AURORA_NAV = [
    { label: "总览", items: [
      { path: "dashboard", label: "仪表盘", icon: "layout-dashboard" },
    ]},
    { label: "运行", items: [
      { path: "chat", label: "会话任务", icon: "messages-square", count: 6 },
      { path: "ide", label: "工作区 IDE", icon: "square-terminal" },
      { path: "long-tasks", label: "长任务", icon: "timer", count: 2 },
      { path: "cli-agents", label: "CLI Agents", icon: "bot" },
    ]},
    { label: "连接", items: [
      { path: "model-gateway", label: "模型网关", icon: "route" },
      { path: "im-channels", label: "IM 渠道", icon: "radio-tower", count: 2, alert: true },
      { path: "external", label: "外部连接", icon: "plug-zap" },
    ]},
    { label: "证据", items: [
      { path: "files", label: "文件证据", icon: "folder-check" },
      { path: "approvals", label: "审批", icon: "shield-check", count: 3 },
    ]},
    { label: "系统", items: [
      { path: "recovery", label: "自愈守护", icon: "heart-pulse" },
    ]},
  ];

  window.AURORA_COMMANDS = [
    { g: "动作", label: "新建会话", icon: "plus", kbd: "⌘N", act: () => (location.hash = "#/chat") },
    { g: "动作", label: "运行模型连通检查", icon: "activity", act: () => (location.hash = "#/model-gateway") },
    { g: "视图", label: "切换深浅主题", icon: "sun-moon", act: () => document.getElementById("themeBtn").click() },
  ];

  // 注册各页（fragment 加载 + 可选 mount）

  // 页面级命令：打开命令面板时合并当前页的动作
  window.AURORA_PAGE_COMMANDS = {
    "model-gateway": [
      { g: "本页动作", label: "新增 Provider", icon: "plus", act: () => window.AuroraStates && AuroraStates.toast("新增 Provider（演示）", "info") },
      { g: "本页动作", label: "全部连通检查", icon: "activity", act: () => window.AuroraStates && AuroraStates.toast("全部路由连通检查通过", "ok") },
      { g: "本页动作", label: "探测 Provider", icon: "scan-search", act: () => window.AuroraStates && AuroraStates.toast("正在探测本地 Provider", "info") },
    ],
    "chat": [
      { g: "本页动作", label: "新建会话", icon: "plus", kbd: "⌘N", act: () => window.AuroraStates && AuroraStates.toast("新建会话（演示）", "info") },
    ],
    "approvals": [
      { g: "本页动作", label: "批准全部", icon: "check", act: () => window.AuroraStates && AuroraStates.toast("已批准全部待审批", "ok") },
    ],
    "recovery": [
      { g: "本页动作", label: "重新巡检", icon: "scan-search", act: () => window.AuroraStates && AuroraStates.toast("巡检完成 · 2 项可修复", "info") },
    ],
  };

  const defs = [
    { path: "dashboard", label: "仪表盘", group: "总览", fragment: "dashboard", shape: "console" },
    { path: "model-gateway", label: "模型网关", group: "连接", fragment: "model-gateway", shape: "list" },
    { path: "ide", label: "工作区 IDE", group: "运行", fragment: "ide", shape: "list" },
    { path: "chat", label: "会话任务", group: "运行", fragment: "chat", shape: "list" },
    { path: "cli-agents", label: "CLI Agents", group: "运行", fragment: "cli-agents", shape: "list" },
    { path: "im-channels", label: "IM 渠道", group: "连接", fragment: "im-channels", shape: "list" },
    { path: "external", label: "外部连接", group: "连接", fragment: "external", shape: "list" },
    { path: "files", label: "文件证据", group: "证据", fragment: "files", shape: "list" },
    { path: "approvals", label: "审批", group: "证据", fragment: "approvals", shape: "list" },
    { path: "recovery", label: "自愈守护", group: "系统", fragment: "recovery", shape: "console" },
    { path: "long-tasks", label: "长任务", group: "运行", fragment: "long-tasks", shape: "list" },
  ];
  defs.forEach(d => window.AuroraDefinePage(d));
})();
