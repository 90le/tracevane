// routes/nav-manifest.ts
// 导航与命令面板的单一数据源。新增页面只改这里。
export type NavGroupKey = 'overview' | 'operations' | 'management' | 'system';

export interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: string; // lucide 图标名，后续迁移期可用首字母占位
  badge?: number;
  future?: boolean; // 未上线页面
}

export interface NavGroup {
  key: NavGroupKey;
  title: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: 'overview',
    title: '总览',
    items: [{ key: 'dashboard', to: '/dashboard', label: '仪表盘', icon: 'LayoutDashboard' }],
  },
  {
    key: 'operations',
    title: '运维',
    items: [
      { key: 'chat', to: '/chat', label: '会话工作台', icon: 'MessagesSquare' },
      { key: 'room', to: '/room', label: '协作空间', icon: 'Users', future: true },
      { key: 'workflow', to: '/workflow', label: '工作流', icon: 'Workflow', future: true },
      { key: 'skills', to: '/skills', label: '技能管理', icon: 'Sparkles' },
      { key: 'files', to: '/files', label: '文件管理', icon: 'FolderClosed' },
      { key: 'terminal', to: '/terminal', label: '维护终端', icon: 'SquareTerminal' },
    ],
  },
  {
    key: 'management',
    title: '管理',
    items: [
      { key: 'agents', to: '/agents', label: 'Agent 管理', icon: 'Bot' },
      { key: 'channels', to: '/channels', label: '频道管理', icon: 'Radio' },
      { key: 'connectors', to: '/channel-connectors', label: '渠道连接', icon: 'Cable' },
      { key: 'gateway', to: '/model-gateway', label: '模型网关', icon: 'Globe' },
      { key: 'cron', to: '/cron', label: '定时任务', icon: 'Clock' },
      { key: 'config', to: '/config', label: '系统配置', icon: 'Settings' },
      { key: 'plugins', to: '/plugins', label: '插件管理', icon: 'Puzzle' },
    ],
  },
  {
    key: 'system',
    title: '系统',
    items: [
      { key: 'system', to: '/system', label: '系统', icon: 'ShieldCheck' },
      { key: 'dreaming', to: '/dreaming', label: '梦境记忆', icon: 'Moon' },
    ],
  },
];

export const allNavItems: NavItem[] = navGroups.flatMap((g) => g.items);
