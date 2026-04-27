import type { StudioServerConfig } from "../../../../types/api.js";
import type {
  DashboardRecoveryItem,
  DashboardSummaryPayload,
} from "../../../../types/dashboard.js";
import type { AgentsService } from "../agents/service.js";
import type { ChannelsService } from "../channels/service.js";
import type { CronService } from "../cron/service.js";
import type { SkillsService } from "../skills/service.js";
import type { SystemService } from "../system/service.js";
import type { TerminalService } from "../terminal/service.js";

const dashboardText = {
  repairBootstrapTitle: (checkId: string) => ({
    zh: `修复 bootstrap: ${checkId}`,
    en: `Repair bootstrap: ${checkId}`,
  }),
  bootstrapErrorNote: {
    zh: "存在阻断错误，建议立即修复。",
    en: "Blocking errors detected. Repair immediately.",
  },
  bootstrapWarningNote: {
    zh: "存在警告项，建议尽快处理。",
    en: "Warnings detected. Address them soon.",
  },
  recentFailureNote: {
    zh: "最近失败事件，需要排查与恢复。",
    en: "Recent failure needs investigation and recovery.",
  },
  pendingAuditNote: {
    zh: "待处理审计项，需要确认并清理积压。",
    en: "Pending audit item needs review and cleanup.",
  },
  terminalRecentError: (message: string) => ({
    zh: `最近错误：${message}`,
    en: `Recent error: ${message}`,
  }),
  recoverableTerminalNote: {
    zh: "存在可恢复终端会话，建议继续处理。",
    en: "Recoverable terminal session available for follow-up.",
  },
  bootstrapFixableNote: {
    zh: "当前 bootstrap 可修复项",
    en: "Current fixable bootstrap items",
  },
  pendingPairingNote: {
    zh: "待审批设备配对请求",
    en: "Device pairing requests awaiting approval",
  },
  recoverableSessionsNote: {
    zh: "可恢复终端会话数量",
    en: "Recoverable terminal session count",
  },
  eventFailuresNote: {
    zh: "最近失败事件数量",
    en: "Recent failure count",
  },
  trendBootstrapFixableLabel: {
    zh: "可修复 bootstrap",
    en: "Bootstrap fixable",
  },
  trendPendingPairingLabel: {
    zh: "待审批配对",
    en: "Pending pairing",
  },
  trendRecoverableSessionsLabel: {
    zh: "可恢复会话",
    en: "Recoverable sessions",
  },
  trendEventFailuresLabel: {
    zh: "失败事件",
    en: "Event failures",
  },
  trendRiskPanelTitle: {
    zh: "风险观察",
    en: "Risk watch",
  },
  trendRecoveryPanelTitle: {
    zh: "恢复脉冲",
    en: "Recovery pulse",
  },
  trendSystemPanelTitle: {
    zh: "系统趋势",
    en: "System trend",
  },
  recoveryPrimaryHint: (count: number) => ({
    zh: `${count} 项恢复与处理项待跟进`,
    en: `${count} recovery and follow-up items need attention`,
  }),
  latestRecoveryHint: (title: string) => ({
    zh: `最近恢复：${title}`,
    en: `Latest recovery: ${title}`,
  }),
  noRecoveryHint: {
    zh: "暂无新的恢复事件",
    en: "No recent recoveries",
  },
  domainConfigLabel: {
    zh: "系统配置",
    en: "System config",
  },
  domainConfigReadyNote: {
    zh: "当前设备的基础配置已通过 Studio 自检。",
    en: "Studio checks passed for the current device baseline.",
  },
  domainConfigPendingNote: (errors: number, warnings: number) => ({
    zh: `仍有 ${errors} 个错误和 ${warnings} 个警告需要处理。`,
    en: `${errors} errors and ${warnings} warnings still need attention.`,
  }),
  domainSkillsLabel: {
    zh: "技能管理",
    en: "Skills",
  },
  domainSkillsNote: {
    zh: "技能启停与配置摘要已接入，后续继续补市场与深层字段。",
    en: "Skill enablement and config summary are connected; marketplace and deeper fields come next.",
  },
  domainTerminalLabel: {
    zh: "维护终端",
    en: "Terminal",
  },
  domainTerminalValue: (count: number) => ({
    zh: `${count} 个可恢复`,
    en: `${count} recoverable`,
  }),
  domainTerminalErrorNote: (message: string) => ({
    zh: `最近终端错误：${message}`,
    en: `Latest terminal error: ${message}`,
  }),
  domainTerminalCommandNote: (command: string) => ({
    zh: `最近命令：${command}`,
    en: `Latest command: ${command}`,
  }),
  domainTerminalSummaryNote: {
    zh: "终端恢复摘要已接入，可直接从首页跳回继续处理最近会话。",
    en: "Terminal recovery summary is wired in so you can jump back into the latest session from home.",
  },
  domainChannelsLabel: {
    zh: "频道管理",
    en: "Channels",
  },
  domainChannelsNote: {
    zh: "频道数量与 bindings 已进入统一实时摘要。",
    en: "Channel and binding counts are now part of the unified live summary.",
  },
  domainCronLabel: {
    zh: "定时任务",
    en: "Cron",
  },
  domainCronNote: {
    zh: "任务总数已接入，可用于核对升级后的 schedule 恢复情况。",
    en: "Cron totals are connected so post-upgrade schedule recovery can be checked quickly.",
  },
  domainAgentsLabel: {
    zh: "Agent 管理",
    en: "Agents",
  },
  domainAgentsNote: {
    zh: "Agent 数量与 chat/config 页共享同一来源，便于核对升级后字段恢复情况。",
    en: "Agent counts share the same source as chat/config views, making post-upgrade field recovery easier to verify.",
  },
  domainSystemLabel: {
    zh: "系统概览",
    en: "System overview",
  },
  domainSystemEventNote: (title: string) => ({
    zh: `最新系统事件：${title}`,
    en: `Latest system event: ${title}`,
  }),
  domainSystemUpgradeNote: (latestVersion: string, status: string) => ({
    zh: `检测到 Studio ${latestVersion} 可升级，当前升级状态 ${status}。`,
    en: `Studio ${latestVersion} is available; current upgrade status is ${status}.`,
  }),
  domainSystemSummaryNote: {
    zh: "健康、升级、设备信任与系统事件摘要均已并入系统首页。",
    en: "Health, upgrade, device trust, and system event summaries are all merged into the system home view.",
  },
};

function localizeText(
  acceptLanguage: string | undefined,
  value: { zh: string; en: string },
): string {
  return String(acceptLanguage || "")
    .toLowerCase()
    .startsWith("en")
    ? value.en
    : value.zh;
}

function normalizeDashboardLanguageKey(
  acceptLanguage: string | undefined,
): "zh" | "en" {
  return String(acceptLanguage || "")
    .toLowerCase()
    .startsWith("en")
    ? "en"
    : "zh";
}

export interface DashboardService {
  getSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload>;
  refreshSummary(acceptLanguage?: string): Promise<DashboardSummaryPayload>;
}

interface DashboardServiceOptions {
  config: StudioServerConfig;
  agents: AgentsService;
  channels: ChannelsService;
  cron: CronService;
  skills: SkillsService;
  system: SystemService;
  terminal: TerminalService;
}

export function createDashboardService(
  options: DashboardServiceOptions,
): DashboardService {
  const snapshots = new Map<
    "zh" | "en",
    {
      lastSummary: DashboardSummaryPayload | null;
      lastUpdatedAt: number | null;
      refreshInFlight: Promise<DashboardSummaryPayload> | null;
    }
  >();
  const SNAPSHOT_TTL_MS = 5_000;

  function getSnapshot(languageKey: "zh" | "en") {
    const existing = snapshots.get(languageKey);
    if (existing) {
      return existing;
    }
    const created = {
      lastSummary: null,
      lastUpdatedAt: null,
      refreshInFlight: null,
    };
    snapshots.set(languageKey, created);
    return created;
  }

  function isSnapshotFresh(lastUpdatedAt: number | null): boolean {
    return (
      lastUpdatedAt !== null && Date.now() - lastUpdatedAt < SNAPSHOT_TTL_MS
    );
  }

  async function buildSummary(
    acceptLanguage?: string,
  ): Promise<DashboardSummaryPayload> {
    const [
      agentSummary,
      channelSummary,
      cronSummary,
      skillsSummary,
      systemHealth,
      terminalStatus,
      bootstrap,
      deviceTrust,
      release,
      upgradeStatus,
      eventSummary,
      persistedTerminalSessions,
    ] = await Promise.all([
      Promise.resolve(options.agents.getSummary()),
      Promise.resolve(options.channels.getSummary()),
      Promise.resolve(options.cron.getSummary()),
      Promise.resolve(options.skills.getSummary()),
      options.system.getHealth(),
      Promise.resolve(options.terminal.getStatus()),
      options.system.getBootstrap(),
      options.system.getDeviceTrust(),
      options.system.getStudioRelease(),
      options.system.getStudioUpgradeStatus(),
      options.system.getEventSummary(),
      options.terminal.listPersistedSessions(),
    ]);
    const installedCliCount = terminalStatus.binaries.filter(
      (binary) => binary.installed,
    ).length;
    const legacyDeviceTrust = deviceTrust as unknown as {
      pending?: unknown[];
      pendingRequests?: unknown[];
    };
    const pendingDeviceTrustRequests = Array.isArray(legacyDeviceTrust.pending)
      ? legacyDeviceTrust.pending.length
      : Array.isArray(legacyDeviceTrust.pendingRequests)
        ? legacyDeviceTrust.pendingRequests.length
        : 0;
    const transportMode: "standalone" | "gateway" =
      options.config.transport.preferredMode === "gateway" &&
      options.config.transport.gateway.enabled
        ? "gateway"
        : options.config.transport.gateway.enabled &&
            !options.config.transport.standalone.enabled
          ? "gateway"
          : "standalone";
    const bootstrapErrors = bootstrap.checks.filter(
      (check) => check.level === "error",
    ).length;
    const bootstrapWarnings = bootstrap.checks.filter(
      (check) => check.level === "warn",
    ).length;
    const bootstrapFixable = bootstrap.checks.filter(
      (check) => check.fixable && check.level !== "ok",
    ).length;
    const entryUrl =
      transportMode === "gateway"
        ? options.config.transport.gateway.basePath || "/studio"
        : `http://127.0.0.1:${options.config.transport.standalone.port}/`;
    const healthUrl =
      transportMode === "gateway"
        ? `${options.config.transport.gateway.basePath || "/studio"}/api/system/health`
        : `http://127.0.0.1:${options.config.transport.standalone.port}/api/system/health`;
    const persistedSessions = persistedTerminalSessions.sessions || [];
    const latestTerminalSession =
      [...persistedSessions].sort(
        (left, right) =>
          Date.parse(right.updatedAt || "") - Date.parse(left.updatedAt || ""),
      )[0] || null;
    const t = (value: { zh: string; en: string }) =>
      localizeText(acceptLanguage, value);

    const recoveryItems: DashboardRecoveryItem[] = [
      ...bootstrap.checks
        .filter((check) => check.level !== "ok" && check.fixable)
        .map((check) => ({
          id: `bootstrap:${check.id}`,
          title: t(dashboardText.repairBootstrapTitle(check.id)),
          note:
            check.level === "error"
              ? t(dashboardText.bootstrapErrorNote)
              : t(dashboardText.bootstrapWarningNote),
          severity:
            check.level === "error" ? ("high" as const) : ("medium" as const),
          to: "/system",
        })),
      ...eventSummary.recentFailures.items.map((item, index) => ({
        id: `event:failure:${index}`,
        title: item.title || `Failure ${index + 1}`,
        note: t(dashboardText.recentFailureNote),
        severity: "high" as const,
        to: "/system/events",
      })),
      ...eventSummary.pendingAuditItems.items.map((item, index) => ({
        id: `event:audit:${index}`,
        title: item.title || `Audit ${index + 1}`,
        note: t(dashboardText.pendingAuditNote),
        severity: "medium" as const,
        to: "/system",
      })),
      ...persistedSessions
        .filter(
          (session) =>
            session.status === "detached" ||
            session.recentOutputSummary?.lastError,
        )
        .map((session) => ({
          id: `terminal:${session.sessionId}`,
          title: session.title || `Terminal ${session.sessionId}`,
          note: session.recentOutputSummary?.lastError
            ? t(
                dashboardText.terminalRecentError(
                  session.recentOutputSummary.lastError,
                ),
              )
            : t(dashboardText.recoverableTerminalNote),
          severity: session.recentOutputSummary?.lastError
            ? ("high" as const)
            : ("low" as const),
          to: "/terminal",
        })),
    ];
    const recoveryTotal = recoveryItems.length;
    const trendPoints = [
      {
        key: "bootstrapFixable",
        label: t(dashboardText.trendBootstrapFixableLabel),
        value: bootstrapFixable,
        note: t(dashboardText.bootstrapFixableNote),
      },
      {
        key: "pendingPairing",
        label: t(dashboardText.trendPendingPairingLabel),
        value: pendingDeviceTrustRequests,
        note: t(dashboardText.pendingPairingNote),
      },
      {
        key: "recoverableSessions",
        label: t(dashboardText.trendRecoverableSessionsLabel),
        value: persistedSessions.filter((session) => session.canResume).length,
        note: t(dashboardText.recoverableSessionsNote),
      },
      {
        key: "eventFailures",
        label: t(dashboardText.trendEventFailuresLabel),
        value: eventSummary.recentFailures.count,
        note: t(dashboardText.eventFailuresNote),
      },
    ];
    const riskStage: "low" | "medium" | "high" =
      recoveryTotal >= 4 || eventSummary.recentFailures.count > 0
        ? "high"
        : recoveryTotal > 0 || eventSummary.pendingAuditItems.count > 0
          ? "medium"
          : "low";

    return {
      checkedAt: new Date().toISOString(),
      summaryReady: true,
      server: {
        name: options.config.pluginName,
        version: options.config.version,
        port: options.config.port,
        pid: process.pid,
        nodeVersion: process.version,
        uptime: process.uptime(),
      },
      gateway: {
        port: options.config.gatewayPort,
        url: options.config.gatewayWsUrl,
        connected: systemHealth.gatewayConnected,
      },
      counts: {
        agents: agentSummary.count,
        channels: channelSummary.counts.channels,
        bindings: channelSummary.counts.bindings,
        cronJobs: cronSummary.count,
        skills: skillsSummary.counts.total,
        enabledSkills: skillsSummary.counts.enabled,
      },
      transport: {
        mode: transportMode,
        standalonePort: options.config.transport.standalone.port,
        gatewayPort: options.config.gatewayPort,
        basePath: options.config.transport.gateway.basePath || "/studio",
        entryUrl,
        healthUrl,
      },
      release: {
        currentVersion: release.currentVersion,
        latestVersion: release.latestVersion,
        updateAvailable: release.updateAvailable,
        upgradeRunning: upgradeStatus.running,
        upgradeStatus: upgradeStatus.status,
        targetVersion: upgradeStatus.targetVersion,
        source: release.source,
      },
      bootstrap: {
        ready: bootstrap.ready,
        errors: bootstrapErrors,
        warnings: bootstrapWarnings,
        fixable: bootstrapFixable,
      },
      deviceTrust: {
        helperConfigured: Boolean(
          deviceTrust.helper?.deviceId ||
          deviceTrust.helper?.clientId ||
          (deviceTrust.helper as { configured?: boolean } | undefined)
            ?.configured,
        ),
        helperPaired: deviceTrust.helper?.paired === true,
        pendingRequests: pendingDeviceTrustRequests,
        autoApproveLocalHelper:
          deviceTrust.settings?.autoApproveLocalHelper === true,
      },
      runtime: {
        installedCliCount,
        expectedCliCount: terminalStatus.binaries.length,
      },
      events: {
        recentFailures: eventSummary.recentFailures.count,
        pendingAuditItems: eventSummary.pendingAuditItems.count,
        recentRecoveries: eventSummary.recentRecoveries.count,
        latestFailureTitle: eventSummary.recentFailures.items[0]?.title || null,
        latestAuditTitle:
          eventSummary.pendingAuditItems.items[0]?.title || null,
        latestRecoveryTitle:
          eventSummary.recentRecoveries.items[0]?.title || null,
      },
      terminalWorkspace: {
        totalSessions: persistedSessions.length,
        recoverableSessions: persistedSessions.filter(
          (session) => session.canResume,
        ).length,
        detachedSessions: persistedSessions.filter(
          (session) => session.status === "detached",
        ).length,
        runningSessions: persistedSessions.filter(
          (session) => session.status === "running",
        ).length,
        latestSessionId: latestTerminalSession?.sessionId || null,
        latestSessionTitle: latestTerminalSession?.title || null,
        latestSessionUpdatedAt: latestTerminalSession?.updatedAt || null,
        latestCommandHint:
          latestTerminalSession?.recentOutputSummary?.lastCommandHint || null,
        latestError:
          latestTerminalSession?.recentOutputSummary?.lastError || null,
      },
      recovery: {
        total: recoveryTotal,
        items: recoveryItems,
      },
      trends: {
        points: trendPoints,
        panels: [
          {
            key: "risk",
            title: t(dashboardText.trendRiskPanelTitle),
            stage: "risk",
            points: trendPoints.filter(
              (point) =>
                point.key === "eventFailures" ||
                point.key === "bootstrapFixable",
            ),
          },
          {
            key: "recovery",
            title: t(dashboardText.trendRecoveryPanelTitle),
            stage: "recovery",
            points: trendPoints.filter(
              (point) =>
                point.key === "recoverableSessions" ||
                point.key === "pendingPairing",
            ),
          },
          {
            key: "trend",
            title: t(dashboardText.trendSystemPanelTitle),
            stage: "trend",
            points: trendPoints,
          },
        ],
      },
      contextSummary: {
        riskStage,
        primaryHint: t(dashboardText.recoveryPrimaryHint(recoveryTotal)),
        secondaryHint: eventSummary.recentRecoveries.items[0]?.title
          ? t(
              dashboardText.latestRecoveryHint(
                eventSummary.recentRecoveries.items[0].title,
              ),
            )
          : t(dashboardText.noRecoveryHint),
      },
      domains: [
        {
          key: "config",
          label: t(dashboardText.domainConfigLabel),
          status: bootstrap.ready ? "ready" : "partial",
          value: bootstrap.ready ? "ready" : `${bootstrapFixable} pending`,
          note: bootstrap.ready
            ? t(dashboardText.domainConfigReadyNote)
            : t(
                dashboardText.domainConfigPendingNote(
                  bootstrapErrors,
                  bootstrapWarnings,
                ),
              ),
        },
        {
          key: "skills",
          label: t(dashboardText.domainSkillsLabel),
          status: skillsSummary.counts.enabled > 0 ? "ready" : "partial",
          value: `${skillsSummary.counts.enabled}/${skillsSummary.counts.total}`,
          note: t(dashboardText.domainSkillsNote),
        },
        {
          key: "terminal",
          label: t(dashboardText.domainTerminalLabel),
          status:
            persistedSessions.some(
              (session) => session.status === "detached",
            ) ||
            persistedSessions.some(
              (session) => session.recentOutputSummary?.lastError,
            ) ||
            installedCliCount < Math.max(1, terminalStatus.binaries.length - 1)
              ? "partial"
              : "ready",
          value: t(
            dashboardText.domainTerminalValue(
              persistedSessions.filter((session) => session.canResume).length,
            ),
          ),
          note: latestTerminalSession?.recentOutputSummary?.lastError
            ? t(
                dashboardText.domainTerminalErrorNote(
                  latestTerminalSession.recentOutputSummary.lastError,
                ),
              )
            : latestTerminalSession?.recentOutputSummary?.lastCommandHint
              ? t(
                  dashboardText.domainTerminalCommandNote(
                    latestTerminalSession.recentOutputSummary.lastCommandHint,
                  ),
                )
              : t(dashboardText.domainTerminalSummaryNote),
        },
        {
          key: "channels",
          label: t(dashboardText.domainChannelsLabel),
          status: channelSummary.counts.channels > 0 ? "ready" : "partial",
          value: `${channelSummary.counts.channels} / ${channelSummary.counts.bindings}`,
          note: t(dashboardText.domainChannelsNote),
        },
        {
          key: "cron",
          label: t(dashboardText.domainCronLabel),
          status: cronSummary.count > 0 ? "ready" : "partial",
          value: String(cronSummary.count),
          note: t(dashboardText.domainCronNote),
        },
        {
          key: "agents",
          label: t(dashboardText.domainAgentsLabel),
          status: agentSummary.count > 0 ? "ready" : "partial",
          value: String(agentSummary.count),
          note: t(dashboardText.domainAgentsNote),
        },
        {
          key: "system",
          label: t(dashboardText.domainSystemLabel),
          status:
            eventSummary.recentFailures.count > 0 ||
            eventSummary.pendingAuditItems.count > 0 ||
            !systemHealth.gatewayConnected ||
            !deviceTrust.helper?.paired
              ? "partial"
              : "ready",
          value: `${eventSummary.recentFailures.count} / ${eventSummary.pendingAuditItems.count}`,
          note: eventSummary.recentFailures.items[0]?.title
            ? t(
                dashboardText.domainSystemEventNote(
                  eventSummary.recentFailures.items[0].title,
                ),
              )
            : release.updateAvailable && release.latestVersion
              ? t(
                  dashboardText.domainSystemUpgradeNote(
                    release.latestVersion,
                    upgradeStatus.status,
                  ),
                )
              : t(dashboardText.domainSystemSummaryNote),
        },
      ],
    };
  }

  function createPlaceholderSummary(
    acceptLanguage?: string,
  ): DashboardSummaryPayload {
    const now = new Date().toISOString();
    const t = (value: { zh: string; en: string }) =>
      localizeText(acceptLanguage, value);
    const transportMode: "standalone" | "gateway" =
      options.config.transport.gateway.enabled &&
      !options.config.transport.standalone.enabled
        ? "gateway"
        : "standalone";
    const entryUrl =
      transportMode === "gateway"
        ? options.config.transport.gateway.basePath || "/studio"
        : `http://127.0.0.1:${options.config.transport.standalone.port}/`;
    const healthUrl =
      transportMode === "gateway"
        ? `${options.config.transport.gateway.basePath || "/studio"}/api/system/health`
        : `http://127.0.0.1:${options.config.transport.standalone.port}/api/system/health`;

    return {
      checkedAt: now,
      summaryReady: false,
      server: {
        name: options.config.pluginName,
        version: options.config.version,
        port: options.config.port,
        pid: process.pid,
        nodeVersion: process.version,
        uptime: process.uptime(),
      },
      gateway: {
        port: options.config.gatewayPort,
        url: options.config.gatewayWsUrl,
        connected: false,
      },
      counts: {
        agents: 0,
        channels: 0,
        bindings: 0,
        cronJobs: 0,
        skills: 0,
        enabledSkills: 0,
      },
      transport: {
        mode: transportMode,
        standalonePort: options.config.transport.standalone.port,
        gatewayPort: options.config.gatewayPort,
        basePath: options.config.transport.gateway.basePath || "/studio",
        entryUrl,
        healthUrl,
      },
      release: {
        currentVersion: options.config.version,
        latestVersion: null,
        updateAvailable: false,
        upgradeRunning: false,
        upgradeStatus: "idle",
        targetVersion: null,
        source: null,
      },
      bootstrap: {
        ready: false,
        errors: 0,
        warnings: 0,
        fixable: 0,
      },
      deviceTrust: {
        helperConfigured: false,
        helperPaired: false,
        pendingRequests: 0,
        autoApproveLocalHelper: false,
      },
      runtime: {
        installedCliCount: 0,
        expectedCliCount: 0,
      },
      events: {
        recentFailures: 0,
        pendingAuditItems: 0,
        recentRecoveries: 0,
        latestFailureTitle: null,
        latestAuditTitle: null,
        latestRecoveryTitle: null,
      },
      terminalWorkspace: {
        totalSessions: 0,
        recoverableSessions: 0,
        detachedSessions: 0,
        runningSessions: 0,
        latestSessionId: null,
        latestSessionTitle: null,
        latestSessionUpdatedAt: null,
        latestCommandHint: null,
        latestError: null,
      },
      recovery: {
        total: 0,
        items: [],
      },
      trends: {
        points: [],
        panels: [],
      },
      contextSummary: {
        riskStage: "low",
        primaryHint: t(dashboardText.noRecoveryHint),
        secondaryHint: t(dashboardText.noRecoveryHint),
      },
      domains: [],
    };
  }

  async function refreshSummary(
    acceptLanguage?: string,
  ): Promise<DashboardSummaryPayload> {
    const languageKey = normalizeDashboardLanguageKey(acceptLanguage);
    const snapshot = getSnapshot(languageKey);
    if (snapshot.refreshInFlight) {
      return snapshot.refreshInFlight;
    }
    snapshot.refreshInFlight = buildSummary(acceptLanguage)
      .then((summary) => {
        snapshot.lastSummary = summary;
        snapshot.lastUpdatedAt = Date.now();
        return summary;
      })
      .finally(() => {
        snapshot.refreshInFlight = null;
      });
    return snapshot.refreshInFlight;
  }

  return {
    async getSummary(
      acceptLanguage?: string,
    ): Promise<DashboardSummaryPayload> {
      const languageKey = normalizeDashboardLanguageKey(acceptLanguage);
      const snapshot = getSnapshot(languageKey);
      if (snapshot.lastSummary) {
        if (!isSnapshotFresh(snapshot.lastUpdatedAt)) {
          void refreshSummary(acceptLanguage).catch(() => undefined);
        }
        return snapshot.lastSummary;
      }
      snapshot.lastSummary = createPlaceholderSummary(acceptLanguage);
      snapshot.lastUpdatedAt = Date.now();
      void refreshSummary(acceptLanguage).catch(() => undefined);
      return snapshot.lastSummary;
    },
    async refreshSummary(
      acceptLanguage?: string,
    ): Promise<DashboardSummaryPayload> {
      return refreshSummary(acceptLanguage);
    },
  };
}
