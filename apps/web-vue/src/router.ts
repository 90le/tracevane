import { createRouter, createWebHistory } from "vue-router";
import { getStudioAppBasePath } from "./shared/runtime-config";

function getRouterBase(): string {
  return getStudioAppBasePath();
}

const DashboardView = () => import("./views/DashboardView.vue");
const AgentsView = () => import("./views/AgentsView.vue");
const ChatView = () => import("./views/ChatView.vue");
const ChannelsView = () => import("./views/ChannelsView.vue");
const SkillsView = () => import("./views/SkillsView.vue");
const CronView = () => import("./views/CronView.vue");
const TerminalView = () => import("./views/TerminalView.vue");
const ConfigView = () => import("./views/ConfigView.vue");
const SystemView = () => import("./views/SystemView.vue");
const DreamingView = () => import("./views/DreamingView.vue");
const ChatShellPage = () => import("./features/chat-v2/ChatShellPage.vue");
const AgentsControlPage = () =>
  import("./features/agents/AgentsControlPage.vue");
const AgentDocsPage = () => import("./features/agents/AgentDocsPage.vue");
const AgentBindingsPage = () =>
  import("./features/agents/AgentBindingsPage.vue");
const AgentAdvancedPage = () =>
  import("./features/agents/AgentAdvancedPage.vue");
const AgentSessionsPage = () =>
  import("./features/agents/AgentSessionsPage.vue");
const ChannelsControlPage = () =>
  import("./features/channels/ChannelsControlPage.vue");
const ChannelProviderSettingsPage = () =>
  import("./features/channels/ChannelProviderSettingsPage.vue");
const ChannelAccountDetailPage = () =>
  import("./features/channels/ChannelAccountDetailPage.vue");
const ChannelAccessControlPage = () =>
  import("./features/channels/ChannelAccessControlPage.vue");
const ChannelPairingPage = () =>
  import("./features/channels/ChannelPairingPage.vue");
const ChannelBindingsPage = () =>
  import("./features/channels/ChannelBindingsPage.vue");

export const router = createRouter({
  history: createWebHistory(getRouterBase()),
  routes: [
    { path: "/", redirect: "/home" },
    { path: "/home", component: DashboardView, alias: ["/dashboard"] },
    {
      path: "/agents",
      component: AgentsView,
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
      children: [
        { path: "", component: ChatShellPage, props: { shellMode: "chat" } },
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
      ],
    },
    {
      path: "/channels",
      component: ChannelsView,
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
    { path: "/skills", component: SkillsView },
    { path: "/cron", component: CronView },
    { path: "/dreaming", component: DreamingView },
    { path: "/terminal", component: TerminalView },
    { path: "/config", component: ConfigView },
    { path: "/system", component: SystemView },
  ],
});
