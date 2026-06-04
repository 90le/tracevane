import type { RouteRecordRaw } from "vue-router";

const DashboardView = () => import("../../views/DashboardView.vue");
const AgentsView = () => import("../../views/AgentsView.vue");
const ChatView = () => import("../../views/ChatView.vue");
const ChannelsView = () => import("../../views/ChannelsView.vue");
const SkillsView = () => import("../../views/SkillsView.vue");
const FilesView = () => import("../../views/FilesView.vue");
const PluginsView = () => import("../../views/PluginsView.vue");
const CronView = () => import("../../views/CronView.vue");
const TerminalView = () => import("../../views/TerminalView.vue");
const ConfigView = () => import("../../views/ConfigView.vue");
const SystemView = () => import("../../views/SystemView.vue");
const DreamingView = () => import("../../views/DreamingView.vue");
const ChatShellPage = () => import("../chat/ChatShellPage.vue");
const AgentsControlPage = () => import("../agents/AgentsControlPage.vue");
import { encodeChatSessionRef, isChatSessionRef } from "../chat/session-ref";
const AgentDocsPage = () => import("../agents/AgentDocsPage.vue");
const AgentBindingsPage = () => import("../agents/AgentBindingsPage.vue");
const AgentAdvancedPage = () => import("../agents/AgentAdvancedPage.vue");
const AgentSessionsPage = () => import("../agents/AgentSessionsPage.vue");
const ChannelsControlPage = () => import("../channels/ChannelsControlPage.vue");
const ChannelProviderSettingsPage = () =>
  import("../channels/ChannelProviderSettingsPage.vue");
const ChannelAccountDetailPage = () =>
  import("../channels/ChannelAccountDetailPage.vue");
const ChannelAccessControlPage = () =>
  import("../channels/ChannelAccessControlPage.vue");
const ChannelPairingPage = () => import("../channels/ChannelPairingPage.vue");
const ChannelBindingsPage = () => import("../channels/ChannelBindingsPage.vue");
const SystemEventCenterPage = () =>
  import("../system/SystemEventCenterPage.vue");

export type ShellRouteMeta = {
  keepAlive?: boolean;
};

type RouteChunkLoader = () => Promise<unknown>;
type RoutePreloadProfile = "core" | "extended";

export type ShellNavItem = {
  key: string;
  to: string;
  icon:
    | "dashboard"
    | "agents"
    | "dreaming"
    | "chat"
    | "channels"
    | "cron"
    | "skills"
    | "files"
    | "plugins"
    | "terminal"
    | "config"
    | "system";
  labelZh: string;
  labelEn: string;
  future?: boolean;
};

export type ShellNavGroup = {
  key: "overview" | "operations" | "management" | "system";
  titleZh: string;
  titleEn: string;
  items: ShellNavItem[];
};

export const shellNavGroups: ShellNavGroup[] = [
  {
    key: "overview",
    titleZh: "总览",
    titleEn: "Overview",
    items: [
      {
        key: "dashboard",
        to: "/dashboard",
        icon: "dashboard",
        labelZh: "仪表盘",
        labelEn: "Dashboard",
      },
      {
        key: "chat",
        to: "/chat",
        icon: "chat",
        labelZh: "会话工作台",
        labelEn: "Chat",
      },
      {
        key: "room",
        to: "/room",
        icon: "chat",
        labelZh: "协作空间",
        labelEn: "Room",
        future: true,
      },
      {
        key: "workflow",
        to: "/workflow",
        icon: "chat",
        labelZh: "工作流",
        labelEn: "Workflow",
        future: true,
      },
    ],
  },
  {
    key: "operations",
    titleZh: "运维",
    titleEn: "Operations",
    items: [
      {
        key: "skills",
        to: "/skills",
        icon: "skills",
        labelZh: "技能管理",
        labelEn: "Skills",
      },
      {
        key: "files",
        to: "/files",
        icon: "files",
        labelZh: "文件管理",
        labelEn: "Files",
      },
      {
        key: "terminal",
        to: "/terminal",
        icon: "terminal",
        labelZh: "维护终端",
        labelEn: "Terminal",
      },
      {
        key: "system",
        to: "/system",
        icon: "system",
        labelZh: "系统诊断",
        labelEn: "System",
      },
    ],
  },
  {
    key: "management",
    titleZh: "管理",
    titleEn: "Management",
    items: [
      {
        key: "agents",
        to: "/agents",
        icon: "agents",
        labelZh: "Agent 管理",
        labelEn: "Agents",
      },
      {
        key: "channels",
        to: "/channels",
        icon: "channels",
        labelZh: "频道管理",
        labelEn: "Channels",
      },
      {
        key: "cron",
        to: "/cron",
        icon: "cron",
        labelZh: "定时任务",
        labelEn: "Cron",
      },
      {
        key: "config",
        to: "/config",
        icon: "config",
        labelZh: "系统配置",
        labelEn: "Config",
      },
      {
        key: "plugins",
        to: "/plugins",
        icon: "plugins",
        labelZh: "插件管理",
        labelEn: "Plugins",
      },
    ],
  },
  {
    key: "system",
    titleZh: "系统",
    titleEn: "System",
    items: [
      {
        key: "dreaming",
        to: "/dreaming",
        icon: "dreaming",
        labelZh: "梦境记忆",
        labelEn: "Dreaming",
      },
    ],
  },
];

const coreRouteChunkLoaders: RouteChunkLoader[] = [
  DashboardView,
  AgentsView,
  AgentsControlPage,
  AgentDocsPage,
  AgentBindingsPage,
  AgentAdvancedPage,
  AgentSessionsPage,
  ChannelsView,
  ChannelsControlPage,
  ChannelProviderSettingsPage,
  ChannelAccountDetailPage,
  ChannelAccessControlPage,
  ChannelPairingPage,
  ChannelBindingsPage,
  SkillsView,
  PluginsView,
  CronView,
  ConfigView,
  SystemView,
  SystemEventCenterPage,
  DreamingView,
];

const extendedRouteChunkLoaders: RouteChunkLoader[] = [
  TerminalView,
];

const routeChunkPreloadPromises = new Map<RoutePreloadProfile, Promise<PromiseSettledResult<unknown>[]>>();

function routeChunkLoadersForProfile(profile: RoutePreloadProfile): RouteChunkLoader[] {
  return profile === "extended"
    ? [...coreRouteChunkLoaders, ...extendedRouteChunkLoaders]
    : coreRouteChunkLoaders;
}

export function preloadNonChatShellRouteChunks(
  profile: RoutePreloadProfile = "core",
): Promise<PromiseSettledResult<unknown>[]> {
  const currentPromise = routeChunkPreloadPromises.get(profile);
  if (currentPromise) return currentPromise;

  const preloadPromise = (async () => {
    const uniqueLoaders = Array.from(new Set(routeChunkLoadersForProfile(profile)));
    return Promise.allSettled(
      uniqueLoaders.map((loadRouteChunk) => loadRouteChunk()),
    );
  })();
  routeChunkPreloadPromises.set(profile, preloadPromise);
  return preloadPromise;
}

export const shellRoutes: RouteRecordRaw[] = [
  { path: "/", redirect: "/dashboard" },
  {
    path: "/dashboard",
    component: DashboardView,
  },
  {
    path: "/agents",
    component: AgentsView,
    meta: { keepAlive: false },
    children: [
      { path: "", component: AgentsControlPage },
      { path: ":agentId", component: AgentsControlPage },
      { path: ":agentId/docs", component: AgentDocsPage },
      { path: ":agentId/bindings", component: AgentBindingsPage },
      { path: ":agentId/sessions", component: AgentSessionsPage },
      { path: ":agentId/advanced", component: AgentAdvancedPage },
    ],
  },
  {
    path: "/chat",
    component: ChatView,
    meta: { keepAlive: false } satisfies ShellRouteMeta,
    children: [
      { path: "", component: ChatShellPage, props: { shellMode: "chat" } },
      { path: "new", redirect: "/chat" },
      {
        path: "workbench",
        component: ChatShellPage,
        props: { shellMode: "inspect" },
      },
      {
        path: "s/:sessionRef",
        component: ChatShellPage,
        props: { shellMode: "chat" },
      },
      {
        path: ":sessionRef",
        redirect: (to) => {
          const sessionRef = String(to.params.sessionRef || "");
          return `/chat/s/${
            isChatSessionRef(sessionRef)
              ? sessionRef
              : encodeChatSessionRef(sessionRef)
          }`;
        },
      },
    ],
  },
  {
    path: "/channels",
    component: ChannelsView,
    meta: { keepAlive: false },
    children: [
      { path: "", component: ChannelsControlPage },
      { path: ":type", component: ChannelsControlPage },
      { path: ":type/settings", component: ChannelProviderSettingsPage },
      {
        path: ":type/accounts/:accountId",
        component: ChannelAccountDetailPage,
      },
      {
        path: ":type/accounts/:accountId/access",
        component: ChannelAccessControlPage,
      },
      {
        path: ":type/accounts/:accountId/pairing",
        component: ChannelPairingPage,
      },
      { path: ":type/bindings", component: ChannelBindingsPage },
    ],
  },
  {
    path: "/skills",
    component: SkillsView,
  },
  {
    path: "/files",
    component: FilesView,
  },
  {
    path: "/plugins",
    component: PluginsView,
  },
  {
    path: "/cron",
    component: CronView,
  },
  {
    path: "/dreaming",
    component: DreamingView,
  },
  {
    path: "/terminal",
    component: TerminalView,
  },
  {
    path: "/terminal/:sessionId",
    component: TerminalView,
  },
  {
    path: "/config",
    component: ConfigView,
  },
  {
    path: "/system/events",
    component: SystemEventCenterPage,
  },
  {
    path: "/system",
    component: SystemView,
  },
];
