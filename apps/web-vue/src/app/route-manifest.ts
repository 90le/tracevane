import approvalsHtml from "../../../../docs/prototypes/pages/approvals.html?raw";

export type RouteGroup = "总览" | "运行" | "连接" | "证据" | "系统";
export type RouteSurface = "prototype" | "react";

export interface RouteDef {
  path: string;
  label: string;
  group: RouteGroup;
  icon: string;
  shape: "console" | "list" | "workbench" | "chat";
  surface: RouteSurface;
  html?: string;
  count?: number;
  alert?: boolean;
}

export interface OpenClawPlatformSection {
  path: "overview" | "config" | "extensions" | "agents-channels" | "services" | "recovery";
  label: string;
  icon: string;
}
// 平台/外部 runtime 二级分组：每个三方平台是一个可折叠子组，下面是三级配置页。
// 未来新增其它三方强集成（如 Dify/n8n）也加到这里，和主链路隔离。
export interface PlatformSubSection {
  path: string;
  label: string;
  icon: string;
}
export interface PlatformGroup {
  id: string;
  label: string;
  icon: string;
  basePath: string;       // 如 "platforms/openclaw"
  sections: PlatformSubSection[];
}

export const navGroups: Array<{ label: RouteGroup; items: RouteDef[] }> = [
  { label: "总览", items: [] },
  { label: "运行", items: [] },
  { label: "连接", items: [] },
  { label: "证据", items: [] },
  { label: "系统", items: [] },
];

export const routeDefs: RouteDef[] = [
  { path: "dashboard", label: "仪表盘", group: "总览", icon: "layout-dashboard", shape: "console", surface: "react" },
  { path: "chat", label: "会话任务", group: "运行", icon: "messages-square", shape: "chat", surface: "react", count: 6 },
  { path: "ide", label: "工作区 IDE", group: "运行", icon: "square-terminal", shape: "workbench", surface: "react" },
  { path: "long-tasks", label: "长任务", group: "运行", icon: "timer", shape: "list", surface: "react", count: 2 },
  { path: "cli-agents", label: "CLI Agents", group: "运行", icon: "bot", shape: "list", surface: "react" },
  { path: "model-gateway", label: "模型网关", group: "连接", icon: "route", shape: "list", surface: "react" },
  { path: "im-channels", label: "IM 渠道", group: "连接", icon: "radio-tower", shape: "list", surface: "react", count: 2, alert: true },
  { path: "external", label: "外部连接", group: "连接", icon: "plug-zap", shape: "list", surface: "react" },
  { path: "files", label: "文件证据", group: "证据", icon: "folder-check", shape: "list", surface: "react" },
  { path: "approvals", label: "审批", group: "证据", icon: "shield-check", shape: "list", surface: "prototype", html: approvalsHtml, count: 3 },
  { path: "recovery", label: "自愈守护", group: "系统", icon: "heart-pulse", shape: "console", surface: "react" },
];

export const openClawPlatformSections: OpenClawPlatformSection[] = [
  { path: "overview", label: "总览", icon: "layout-dashboard" },
  { path: "config", label: "配置", icon: "file-cog" },
  { path: "extensions", label: "扩展", icon: "sparkles" },
  { path: "agents-channels", label: "Agent / 渠道", icon: "radio-tower" },
  { path: "services", label: "服务", icon: "server" },
  { path: "recovery", label: "Doctor / 自愈", icon: "heart-pulse" },
];
export const platformGroups: PlatformGroup[] = [
  {
    id: "openclaw",
    label: "OpenClaw",
    icon: "server",
    basePath: "platforms/openclaw",
    sections: openClawPlatformSections.map((s) => ({ path: s.path, label: s.label, icon: s.icon })),
  },
  // 未来示例：{ id: "dify", label: "Dify", icon: "workflow", basePath: "platforms/dify", sections: [...] }
];

for (const group of navGroups) {
  group.items = routeDefs.filter((route) => route.group === group.label);
}

export function routeByPath(path: string): RouteDef {
  const normalizedPath = path.split("/")[0] || path;
  return routeDefs.find((route) => route.path === normalizedPath) ?? routeDefs[0];
}
