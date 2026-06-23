import type { ComponentType } from "react";
import {
  Bot,
  Boxes,
  FolderOpen,
  Globe,
  LayoutDashboard,
  LifeBuoy,
  MessageSquare,
  Network,
  Plug,
  ShieldCheck,
  Terminal,
  Workflow,
} from "lucide-react";

export type NavGroup = "总览" | "运行" | "连接" | "证据" | "系统";
export type NavStatus = "ready" | "coming-soon";

export interface NavItem {
  path: string;
  label: string;
  group: NavGroup;
  icon?: ComponentType<{ className?: string }>;
  status: NavStatus;
}

export const NAV_GROUP_ORDER: NavGroup[] = ["总览", "运行", "连接", "证据", "系统"];

export const NAV_ITEMS: NavItem[] = [
  // 总览
  { path: "/dashboard", label: "总览", group: "总览", icon: LayoutDashboard, status: "ready" },

  // 运行
  { path: "/chat", label: "对话", group: "运行", icon: MessageSquare, status: "ready" },
  { path: "/ide", label: "IDE", group: "运行", icon: Boxes, status: "ready" },
  { path: "/long-tasks", label: "长任务", group: "运行", icon: Workflow, status: "ready" },
  { path: "/cli-agents", label: "CLI 代理", group: "运行", icon: Terminal, status: "ready" },

  // 连接
  { path: "/model-gateway", label: "模型网关", group: "连接", icon: Plug, status: "ready" },
  { path: "/im-channels", label: "IM 渠道", group: "连接", icon: Network, status: "ready" },
  { path: "/external", label: "外部接入", group: "连接", icon: Globe, status: "ready" },

  // 证据
  { path: "/files", label: "文件", group: "证据", icon: FolderOpen, status: "ready" },
  { path: "/approvals", label: "审批", group: "证据", icon: ShieldCheck, status: "ready" },

  // 系统
  { path: "/recovery", label: "恢复", group: "系统", icon: LifeBuoy, status: "ready" },
  { path: "/platforms", label: "平台", group: "系统", icon: Bot, status: "ready" },
];

export function navItemsByGroup(): Array<{ group: NavGroup; items: NavItem[] }> {
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: NAV_ITEMS.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}

export function findNavItem(path: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.path === path);
}
