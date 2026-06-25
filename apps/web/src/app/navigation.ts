import type { ComponentType } from "react";
import {
  Bot,
  Boxes,
  FolderOpen,
  LayoutDashboard,
  MessageSquare,
  Network,
  Plug,
  ShieldCheck,
  Terminal,
} from "lucide-react";

export type NavGroup = "总览" | "工作" | "连接" | "平台" | "证据";
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

export const NAV_GROUP_ORDER: NavGroup[] = ["总览", "工作", "连接", "平台", "证据"];

export const NAV_ITEMS: NavItem[] = [
  { path: "/dashboard", label: "总览", title: "总览", subtitle: "全局状态、关键入口与下一步动作。", group: "总览", icon: LayoutDashboard, status: "ready" },

  { path: "/workspace", label: "工作区", title: "工作区", subtitle: "文件、编辑器、终端、Git、预览和 Agent handoff 的主工作面。", group: "工作", icon: Boxes, status: "ready" },
  { path: "/chat", label: "对话", title: "本地对话", subtitle: "面向当前工作上下文的本地 Agent 对话。", group: "工作", icon: MessageSquare, status: "ready" },
  { path: "/cli-agents", label: "CLI 代理", title: "CLI 代理", subtitle: "Codex、Claude Code、OpenCode 等本地 Agent runtime 的安装、检测与运行。", group: "工作", icon: Terminal, status: "ready", aliases: ["/long-tasks"] },

  { path: "/model-gateway", label: "模型网关", title: "模型网关", subtitle: "Provider、模型、协议、路由和客户端接入。", group: "连接", icon: Plug, status: "ready" },
  { path: "/im-channels", label: "IM 渠道", title: "IM 渠道", subtitle: "连接飞书、企微、Telegram 等第三方 IM，让消息进入 Agent。", group: "连接", icon: Network, status: "ready" },

  { path: "/platforms", label: "OpenClaw", title: "平台 / OpenClaw", subtitle: "OpenClaw 原生配置、Agent、Channel、Binding、Skills、服务与诊断。", group: "平台", icon: Bot, status: "ready", aliases: ["/recovery", "/runtime-admin"] },

  { path: "/workspace?mode=files", label: "工作区文件", title: "工作区文件", subtitle: "Workspace 文件与产物入口；完整编辑在工作区完成。", group: "证据", icon: FolderOpen, status: "ready" },
  { path: "/approvals", label: "审批", title: "审批", subtitle: "命令、文件、凭据和修复动作的确认与证据。", group: "证据", icon: ShieldCheck, status: "ready" },
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

export function navItemsByGroup(): Array<{ group: NavGroup; items: NavItem[] }> {
  return NAV_GROUP_ORDER.map((group) => ({
    group,
    items: NAV_ITEMS.filter((item) => item.group === group),
  })).filter((entry) => entry.items.length > 0);
}

export function normalizePath(pathname: string, search = ""): string {
  return `${pathname}${search || ""}`;
}

export function isNavItemActive(item: NavItem, pathname: string, search = ""): boolean {
  const current = normalizePath(pathname, search);
  if (item.path.includes("?")) return current === item.path;
  if (pathname === item.path) return true;
  if (item.path === "/platforms" && pathname.startsWith("/platforms/")) return true;
  return item.aliases?.some((alias) => pathname === alias || pathname.startsWith(`${alias}/`)) ?? false;
}

export function findNavItem(pathname: string, search = ""): NavItem | undefined {
  return NAV_ITEMS.find((item) => isNavItemActive(item, pathname, search));
}

export function resolvePageMeta(pathname: string, search = ""): PageMeta {
  const item = findNavItem(pathname, search) ?? NAV_ITEMS[0];
  const breadcrumbs: PageMeta["breadcrumbs"] = [{ label: item.group }];
  let title = item.title;
  let label = item.label;
  let subtitle = item.subtitle;

  if (pathname.startsWith("/platforms/openclaw")) {
    const section = pathname.split("/")[3] || "overview";
    const sectionLabel = OPENCLAW_SECTION_LABELS[section] ?? "总览";
    label = section === "overview" ? "OpenClaw" : sectionLabel;
    title = section === "overview" ? "平台 / OpenClaw" : `OpenClaw / ${sectionLabel}`;
    subtitle = section === "overview"
      ? item.subtitle
      : `OpenClaw 平台子页面：${sectionLabel}。模型网关、IM、CLI、Workspace 的写入口仍留在各自 owner 域。`;
    breadcrumbs[0] = { label: "平台", path: "/platforms" };
    breadcrumbs.push({ label: "OpenClaw", path: "/platforms/openclaw" });
    if (section !== "overview") breadcrumbs.push({ label: sectionLabel });
  } else if (pathname === "/platforms") {
    breadcrumbs[0] = { label: "平台" };
    label = "平台目录";
    title = "平台目录";
  } else if (item.group !== "总览") {
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
