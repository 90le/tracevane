import { computed } from "vue";
import { useRoute } from "vue-router";
import { useLocalePreference } from "../../shared/locale";
import { shellNavGroups } from "./route-manifest";

type StatusTone = "neutral" | "accent" | "sage" | "danger";

type ShellContextAction = {
  id: string;
  to: string;
  titleZh: string;
  titleEn: string;
  detailZh: string;
  detailEn: string;
};

type ShellContextConfig = {
  match: (path: string) => boolean;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  focusZh: string;
  focusEn: string;
  actions: ShellContextAction[];
};

const routeContextConfigs: ShellContextConfig[] = [
  {
    match: (path) => path.startsWith("/system/events"),
    titleZh: "事件中心上下文",
    titleEn: "Event center context",
    descriptionZh:
      "这里聚焦最近失败、恢复和待审计事项，适合从事件流切到诊断与恢复操作。",
    descriptionEn:
      "This panel focuses on recent failures, recoveries, and audit backlog so you can jump from event flow into diagnostics and recovery work.",
    focusZh: "事件与恢复优先",
    focusEn: "Events and recovery first",
    actions: [
      {
        id: "event-center-system",
        to: "/system",
        titleZh: "回到系统诊断",
        titleEn: "Return to diagnostics",
        detailZh: "切回系统工作区查看健康、bootstrap 与升级状态。",
        detailEn:
          "Return to the system workspace to inspect health, bootstrap, and release status.",
      },
      {
        id: "event-center-terminal",
        to: "/terminal",
        titleZh: "打开维护终端",
        titleEn: "Open terminal",
        detailZh: "继续处理事件背后的 CLI、日志或恢复命令。",
        detailEn:
          "Continue with CLI, logs, or recovery commands behind the event stream.",
      },
      {
        id: "event-center-cron",
        to: "/cron",
        titleZh: "检查定时任务",
        titleEn: "Inspect cron",
        detailZh: "确认失败事件是否与 schedule 或补偿任务相关。",
        detailEn:
          "Check whether the failure stream is related to schedule or compensating jobs.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/system"),
    titleZh: "系统诊断上下文",
    titleEn: "System diagnostics context",
    descriptionZh:
      "系统页更适合串联健康、事件、终端和 cron 入口，而不是长期占用右侧舞台。",
    descriptionEn:
      "The system page works best as a hub across health, events, terminal, and cron instead of a permanently occupied right rail.",
    focusZh: "诊断中枢",
    focusEn: "Diagnostics hub",
    actions: [
      {
        id: "system-events",
        to: "/system/events",
        titleZh: "进入事件中心",
        titleEn: "Open event center",
        detailZh: "查看最近失败、恢复和待处理审计项。",
        detailEn:
          "Review recent failures, recoveries, and pending audit items.",
      },
      {
        id: "system-terminal",
        to: "/terminal",
        titleZh: "切到维护终端",
        titleEn: "Jump to terminal",
        detailZh: "直接继续命令、日志和恢复会话。",
        detailEn:
          "Continue with commands, logs, and recovery sessions directly.",
      },
      {
        id: "system-cron",
        to: "/cron",
        titleZh: "核对定时任务",
        titleEn: "Check cron jobs",
        detailZh: "从系统诊断延伸到调度和补偿任务视角。",
        detailEn:
          "Extend system diagnostics into scheduling and compensating task review.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/agents"),
    titleZh: "Agent 管理上下文",
    titleEn: "Agent management context",
    descriptionZh:
      "这里更适合快速串联 Agent、绑定和系统诊断，而不是放一条固定右栏。",
    descriptionEn:
      "This panel is better used to connect agents, bindings, and diagnostics on demand instead of keeping a permanent side rail.",
    focusZh: "Roster 与绑定",
    focusEn: "Roster and bindings",
    actions: [
      {
        id: "agents-home",
        to: "/agents",
        titleZh: "回到 Agent 总览",
        titleEn: "Return to agents overview",
        detailZh: "重新聚焦 roster、配置和高级字段。",
        detailEn: "Refocus on the roster, configuration, and advanced fields.",
      },
      {
        id: "agents-channels",
        to: "/channels",
        titleZh: "检查频道绑定",
        titleEn: "Inspect channel bindings",
        detailZh: "从 Agent 配置切到频道与 bindings 的实际接线。",
        detailEn:
          "Move from agent configuration into real channel and binding wiring.",
      },
      {
        id: "agents-system",
        to: "/system",
        titleZh: "回到系统诊断",
        titleEn: "Open diagnostics",
        detailZh: "在改完 Agent 后继续检查系统侧运行态。",
        detailEn:
          "After agent changes, continue by checking system-side runtime health.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/channels"),
    titleZh: "频道管理上下文",
    titleEn: "Channel management context",
    descriptionZh:
      "频道页适合把 provider、account、binding 与 Agent 配置串起来看。",
    descriptionEn:
      "Channels work best when provider, account, binding, and agent configuration can be connected on demand.",
    focusZh: "Provider 与 bindings",
    focusEn: "Providers and bindings",
    actions: [
      {
        id: "channels-home",
        to: "/channels",
        titleZh: "回到频道工作区",
        titleEn: "Return to channels workspace",
        detailZh: "继续处理 provider、account 和 access/pairing。",
        detailEn: "Continue with provider, account, and access/pairing work.",
      },
      {
        id: "channels-agents",
        to: "/agents",
        titleZh: "核对 Agent",
        titleEn: "Check agents",
        detailZh: "确认当前频道 wiring 对应的 Agent 角色与来源。",
        detailEn:
          "Verify the agent roles and sources behind current channel wiring.",
      },
      {
        id: "channels-system",
        to: "/system",
        titleZh: "查看系统诊断",
        titleEn: "Open diagnostics",
        detailZh: "如果接线异常，可直接切去系统诊断排查。",
        detailEn: "If wiring looks wrong, jump into diagnostics immediately.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/skills"),
    titleZh: "技能工作区上下文",
    titleEn: "Skills workspace context",
    descriptionZh: "技能页需要频繁在技能配置、系统默认值和终端验证之间往返。",
    descriptionEn:
      "Skills often require quick movement between skill configuration, system defaults, and terminal verification.",
    focusZh: "技能配置与验证",
    focusEn: "Skills config and verification",
    actions: [
      {
        id: "skills-home",
        to: "/skills",
        titleZh: "回到技能工作区",
        titleEn: "Return to skills workspace",
        detailZh: "继续处理启停、配置与来源。",
        detailEn: "Continue with enablement, configuration, and sources.",
      },
      {
        id: "skills-config",
        to: "/config",
        titleZh: "检查系统默认值",
        titleEn: "Inspect config defaults",
        detailZh: "交叉确认技能和全局配置之间的默认行为。",
        detailEn:
          "Cross-check default behavior between skills and global config.",
      },
      {
        id: "skills-terminal",
        to: "/terminal",
        titleZh: "终端验证",
        titleEn: "Validate in terminal",
        detailZh: "需要命令或日志时直接切到维护终端。",
        detailEn: "Jump into the terminal when you need commands or logs.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/cron"),
    titleZh: "定时任务上下文",
    titleEn: "Cron context",
    descriptionZh:
      "定时任务更适合配合系统事件和终端恢复一起查看，而不是长期驻留在右侧。",
    descriptionEn:
      "Cron becomes more useful when paired with events and terminal recovery instead of living as a permanent right rail.",
    focusZh: "调度与补偿",
    focusEn: "Scheduling and recovery",
    actions: [
      {
        id: "cron-home",
        to: "/cron",
        titleZh: "回到定时任务",
        titleEn: "Return to cron",
        detailZh: "继续核对计划、目标和执行入口。",
        detailEn:
          "Continue checking schedules, targets, and execution entry points.",
      },
      {
        id: "cron-events",
        to: "/system/events",
        titleZh: "查看系统事件",
        titleEn: "Inspect events",
        detailZh: "用事件流确认 cron 失败或补偿是否已经落地。",
        detailEn:
          "Use the event stream to confirm cron failures or recoveries.",
      },
      {
        id: "cron-terminal",
        to: "/terminal",
        titleZh: "切到维护终端",
        titleEn: "Open terminal",
        detailZh: "直接执行手工补偿或日志排查。",
        detailEn: "Run manual recovery or inspect logs directly.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/config"),
    titleZh: "系统配置上下文",
    titleEn: "Config context",
    descriptionZh: "配置页更需要与技能、Agent 和系统诊断形成跳转闭环。",
    descriptionEn:
      "Config is most useful when it can close the loop with skills, agents, and system diagnostics.",
    focusZh: "默认值与系统边界",
    focusEn: "Defaults and system boundaries",
    actions: [
      {
        id: "config-home",
        to: "/config",
        titleZh: "回到系统配置",
        titleEn: "Return to config",
        detailZh: "继续处理模型、sandbox 与默认工具设置。",
        detailEn: "Continue with model, sandbox, and default tool settings.",
      },
      {
        id: "config-skills",
        to: "/skills",
        titleZh: "检查技能映射",
        titleEn: "Inspect skills mapping",
        detailZh: "从默认值延伸到技能层的实际使用面。",
        detailEn:
          "Extend default configuration checks into actual skill usage.",
      },
      {
        id: "config-system",
        to: "/system",
        titleZh: "回到系统诊断",
        titleEn: "Open diagnostics",
        detailZh: "配置变更后直接检查系统运行态是否一致。",
        detailEn: "After config changes, verify runtime health in diagnostics.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/dreaming"),
    titleZh: "梦境记忆上下文",
    titleEn: "Dreaming context",
    descriptionZh: "梦境页适合作为记忆与会话、系统之间的过渡面板。",
    descriptionEn:
      "Dreaming works well as a transition panel between memory, chat, and system views.",
    focusZh: "记忆与续做",
    focusEn: "Memory and continuation",
    actions: [
      {
        id: "dreaming-home",
        to: "/dreaming",
        titleZh: "回到梦境工作区",
        titleEn: "Return to dreaming",
        detailZh: "继续检查 memory slot、Dream Diary 与开关。",
        detailEn: "Continue inspecting memory slots, Dream Diary, and toggles.",
      },
      {
        id: "dreaming-chat",
        to: "/chat",
        titleZh: "回到会话工作台",
        titleEn: "Open chat",
        detailZh: "从记忆整理切回实际私聊工作流。",
        detailEn: "Move from memory review back into practical chat workflows.",
      },
      {
        id: "dreaming-system",
        to: "/system",
        titleZh: "查看系统诊断",
        titleEn: "Open diagnostics",
        detailZh: "遇到状态异常时快速切换到系统页。",
        detailEn: "Jump into diagnostics quickly when the state looks off.",
      },
    ],
  },
  {
    match: (path) => path.startsWith("/dashboard"),
    titleZh: "首页上下文",
    titleEn: "Home context",
    descriptionZh:
      "首页面板应该帮助你快速跳去风险、恢复和资源核对，而不是长期压缩主舞台。",
    descriptionEn:
      "The home panel should help you jump into risk, recovery, and resource checks without compressing the main stage all the time.",
    focusZh: "风险与续做优先",
    focusEn: "Risk and recovery first",
    actions: [
      {
        id: "dashboard-events",
        to: "/system/events",
        titleZh: "查看系统事件",
        titleEn: "Inspect system events",
        detailZh: "先看失败、恢复和审计积压，再决定下一步。",
        detailEn:
          "Review failures, recoveries, and audit backlog before deciding the next move.",
      },
      {
        id: "dashboard-terminal",
        to: "/terminal",
        titleZh: "恢复终端工作",
        titleEn: "Resume terminal work",
        detailZh: "回到命令、日志和恢复会话的真实执行面。",
        detailEn: "Jump back into commands, logs, and recoverable sessions.",
      },
      {
        id: "dashboard-chat",
        to: "/chat",
        titleZh: "进入会话工作台",
        titleEn: "Open chat workspace",
        detailZh: "从总览切回当前最需要继续的会话。",
        detailEn:
          "Move from overview back into the conversation that needs attention.",
      },
    ],
  },
];

function matchesNavItem(path: string, to: string): boolean {
  return path === to || path.startsWith(`${to}/`);
}

export function useShellNavigation() {
  const route = useRoute();
  const { text } = useLocalePreference();

  const navGroups = computed(() =>
    shellNavGroups.map((group) => ({
      title: text(group.titleZh, group.titleEn),
      items: group.items
        .filter((item) => !item.future)
        .map((item) => ({
          to: item.to,
          icon: item.icon,
          label: text(item.labelZh, item.labelEn),
        })),
    })),
  );

  const currentNavItem = computed(() => {
    for (const group of shellNavGroups) {
      const match = group.items.find(
        (item) => !item.future && matchesNavItem(route.path, item.to),
      );
      if (match) return match;
    }
    return null;
  });

  const activeContext = computed(
    () =>
      routeContextConfigs.find((config) => config.match(route.path)) ||
      routeContextConfigs[routeContextConfigs.length - 1],
  );

  const localizedRiskStage = computed(() => text("等待", "Waiting"));

  const riskTone = computed<StatusTone>(() => "neutral");

  const contextPanelTitle = computed(() =>
    text(activeContext.value.titleZh, activeContext.value.titleEn),
  );

  const contextPanelDescription = computed(() =>
    text(activeContext.value.descriptionZh, activeContext.value.descriptionEn),
  );

  const riskSummaryValue = computed(() => localizedRiskStage.value);

  const pendingSummaryValue = computed(() => text("等待", "Waiting"));

  const liveNextStep = computed(() => null);

  const topStatus = computed(() => [
    {
      label: currentNavItem.value
        ? text(
            `当前：${currentNavItem.value.labelZh}`,
            `Current: ${currentNavItem.value.labelEn}`,
          )
        : text("当前：工作台", "Current: Studio"),
      tone: "accent" as StatusTone,
    },
    {
      label: text(activeContext.value.focusZh, activeContext.value.focusEn),
      tone: riskTone.value,
    },
    {
      label: text("按需上下文", "On-demand context"),
      tone: "neutral" as StatusTone,
    },
  ]);

  const contextPendingItems = computed(() => {
    const routeActions = activeContext.value.actions
      .slice(0, 2)
      .map((action) => ({
        id: action.id,
        to: action.to,
        title: text(action.titleZh, action.titleEn),
        detail: text(action.detailZh, action.detailEn),
      }));

    const seenTargets = new Set<string>();
    return [liveNextStep.value, ...routeActions].filter((item) => {
      if (!item || seenTargets.has(item.to)) {
        return false;
      }
      seenTargets.add(item.to);
      return true;
    });
  });

  return {
    navGroups,
    contextPanelTitle,
    contextPanelDescription,
    topStatus,
    contextPendingItems,
    riskSummaryValue,
    pendingSummaryValue,
  };
}
