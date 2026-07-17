import type { ComponentType } from "react";
import {
  Bot,
  FolderCog,
  LayoutDashboard,
  Network,
  Plug,
  Terminal,
  PanelLeft,
} from "lucide-react";

export type NavGroup = "首页" | "工作流" | "接入" | "底座";
export type NavStatus = "ready" | "coming-soon";

export interface NavItem {
  path: string;
  label: string;
  title: string;
  subtitle: string;
  group: NavGroup;
  icon?: ComponentType<{ className?: string }>;
  status: NavStatus;
  aliases?: string[];
}

export interface PageMeta {
  label: string;
  title: string;
  subtitle: string;
  group: NavGroup;
  browserTitle: string;
  breadcrumbs: Array<{ label: string; path?: string }>;
}

export const NAV_GROUP_ORDER: NavGroup[] = ["首页", "工作流", "接入", "底座"];

export const NAV_ITEMS: NavItem[] = [
  {
    path: "/dashboard",
    label: "首页",
    title: "首页",
    subtitle: "全局健康、关键入口与下一步动作。",
    group: "首页",
    icon: LayoutDashboard,
    status: "ready",
  },

  {
    path: "/file-manager",
    label: "文件库",
    title: "文件库",
    subtitle: "浏览、上传、归档、索引与批量文件操作。",
    group: "工作流",
    icon: FolderCog,
    status: "ready",
  },

  {
    path: "/ide",
    label: "IDE 工作台",
    title: "IDE 工作台",
    subtitle: "项目级开发工作台：多 Tab 编辑器、拆分编辑组与面板布局。",
    group: "工作流",
    icon: PanelLeft,
    status: "ready",
  },

  {
    path: "/cli-agents",
    label: "Agent CLI",
    title: "Agent CLI",
    subtitle: "安装、配置、重装与修复 Codex、Claude Code、OpenCode。",
    group: "工作流",
    icon: Terminal,
    status: "ready",
  },

  {
    path: "/model-gateway",
    label: "模型路由",
    title: "模型路由",
    subtitle: "Provider、模型、协议、路由与客户端接入。",
    group: "接入",
    icon: Plug,
    status: "ready",
  },
  {
    path: "/im-channels",
    label: "消息接入",
    title: "消息接入",
    subtitle: "连接飞书、企微、Telegram 等消息平台，让会话进入 Agent。",
    group: "接入",
    icon: Network,
    status: "ready",
  },

  {
    path: "/platforms",
    label: "平台管理",
    title: "平台管理",
    subtitle: "第三方平台与 OpenClaw 底座能力。",
    group: "底座",
    icon: Bot,
    status: "ready",
    aliases: ["/recovery", "/runtime-admin"],
  },
];

const OPENCLAW_SECTION_LABELS: Record<string, string> = {
  guard: "守护",
  recovery: "守护",
  config: "配置",
  agents: "原生 Agent",
  channels: "原生渠道",
  bindings: "原生绑定",
  skills: "Skills",
  services: "服务",
  logs: "日志",
  diagnostics: "诊断",
};

export function navItemsByGroup(): Array<{
  group: NavGroup;
  items: NavItem[];
}> {
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: NAV_ITEMS.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}

export function normalizePath(pathname: string, search = ""): string {
  return `${pathname}${search || ""}`;
}

export function isNavItemActive(
  item: NavItem,
  pathname: string,
  search = "",
): boolean {
  const current = normalizePath(pathname, search);
  if (item.path.includes("?")) return current === item.path;
  if (pathname === item.path) return true;
  if (item.path === "/platforms" && pathname.startsWith("/platforms/"))
    return true;
  return (
    item.aliases?.some(
      (alias) => pathname === alias || pathname.startsWith(`${alias}/`),
    ) ?? false
  );
}

export function findNavItem(
  pathname: string,
  search = "",
): NavItem | undefined {
  return NAV_ITEMS.find((item) => isNavItemActive(item, pathname, search));
}

export function resolvePageMeta(pathname: string, search = ""): PageMeta {
  const item = findNavItem(pathname, search) ?? NAV_ITEMS[0];
  const breadcrumbs: PageMeta["breadcrumbs"] = [{ label: item.group }];
  let title = item.title;
  let label = item.label;
  let subtitle = item.subtitle;

  if (pathname.startsWith("/ide")) {
    breadcrumbs[0] = { label: "工作流" };
    breadcrumbs.push({ label: "IDE 工作台" });
    label = "IDE 工作台";
    title = "IDE 工作台";
    subtitle = "项目级开发工作台：多 Tab 编辑器、拆分编辑组与面板布局。";
  } else if (pathname.startsWith("/platforms/openclaw")) {
    const section = pathname.split("/")[3] || "overview";
    const sectionLabel = OPENCLAW_SECTION_LABELS[section] ?? "总览";
    label = section === "overview" ? "OpenClaw" : sectionLabel;
    title = section === "overview" ? "OpenClaw" : `OpenClaw / ${sectionLabel}`;
    subtitle =
      section === "overview"
        ? item.subtitle
        : `OpenClaw 平台子页面：${sectionLabel}。模型网关、IM、CLI、Workspace 的写入口仍留在各自 owner 域。`;
    breadcrumbs[0] = { label: "底座", path: "/platforms" };
    breadcrumbs.push({ label: "OpenClaw", path: "/platforms/openclaw" });
    if (section !== "overview") breadcrumbs.push({ label: sectionLabel });
  } else if (pathname === "/platforms") {
    breadcrumbs[0] = { label: "底座" };
    label = "平台管理";
    title = "平台管理";
  } else if (item.group !== "首页") {
    breadcrumbs.push({ label: item.label });
  } else {
    breadcrumbs[0] = { label: item.label };
  }

  return {
    label,
    title,
    subtitle,
    group: item.group,
    browserTitle: `${title} · Tracevane`,
    breadcrumbs,
  };
}
