import type { StudioServerConfig } from '../../../../types/api.js';
import type { DashboardSummaryPayload } from '../../../../types/dashboard.js';
import type { AgentsService } from '../agents/service.js';
import type { ChannelsService } from '../channels/service.js';
import type { CronService } from '../cron/service.js';
import type { SkillsService } from '../skills/service.js';
import type { SystemService } from '../system/service.js';
import type { TerminalService } from '../terminal/service.js';

export interface DashboardService {
  getSummary(): Promise<DashboardSummaryPayload>;
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

export function createDashboardService(options: DashboardServiceOptions): DashboardService {
  return {
    async getSummary(): Promise<DashboardSummaryPayload> {
      const [agentSummary, channelSummary, cronSummary, skillsSummary, systemHealth, terminalStatus, bootstrap, deviceTrust, release, upgradeStatus] = await Promise.all([
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
      ]);
      const installedCliCount = terminalStatus.binaries.filter((binary) => binary.installed).length;
      const legacyDeviceTrust = deviceTrust as unknown as { pending?: unknown[]; pendingRequests?: unknown[] };
      const pendingDeviceTrustRequests = Array.isArray(legacyDeviceTrust.pending)
        ? legacyDeviceTrust.pending.length
        : Array.isArray(legacyDeviceTrust.pendingRequests)
          ? legacyDeviceTrust.pendingRequests.length
          : 0;
      const transportMode: 'standalone' | 'gateway' = options.config.transport.gateway.enabled && !options.config.transport.standalone.enabled
        ? 'gateway'
        : 'standalone';
      const bootstrapErrors = bootstrap.checks.filter((check) => check.level === 'error').length;
      const bootstrapWarnings = bootstrap.checks.filter((check) => check.level === 'warn').length;
      const bootstrapFixable = bootstrap.checks.filter((check) => check.fixable && check.level !== 'ok').length;
      const entryUrl = transportMode === 'gateway'
        ? options.config.transport.gateway.basePath || '/studio'
        : `http://127.0.0.1:${options.config.transport.standalone.port}/`;
      const healthUrl = transportMode === 'gateway'
        ? `${options.config.transport.gateway.basePath || '/studio'}/api/system/health`
        : `http://127.0.0.1:${options.config.transport.standalone.port}/api/system/health`;

      return {
        checkedAt: new Date().toISOString(),
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
          basePath: options.config.transport.gateway.basePath || '/studio',
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
            deviceTrust.helper?.deviceId
            || deviceTrust.helper?.clientId
            || (deviceTrust.helper as { configured?: boolean } | undefined)?.configured,
          ),
          helperPaired: deviceTrust.helper?.paired === true,
          pendingRequests: pendingDeviceTrustRequests,
          autoApproveLocalHelper: deviceTrust.settings?.autoApproveLocalHelper === true,
        },
        runtime: {
          installedCliCount,
          expectedCliCount: terminalStatus.binaries.length,
        },
        domains: [
          {
            key: 'config',
            label: '系统配置',
            status: bootstrap.ready ? 'ready' : 'partial',
            value: bootstrap.ready ? 'ready' : `${bootstrapFixable} pending`,
            note: bootstrap.ready ? '当前设备的基础配置已通过 Studio 自检。' : `仍有 ${bootstrapErrors} 个错误和 ${bootstrapWarnings} 个警告需要处理。`,
          },
          {
            key: 'skills',
            label: '技能管理',
            status: skillsSummary.counts.enabled > 0 ? 'ready' : 'partial',
            value: `${skillsSummary.counts.enabled}/${skillsSummary.counts.total}`,
            note: '技能启停与配置摘要已接入，后续继续补市场与深层字段。',
          },
          {
            key: 'terminal',
            label: '维护终端',
            status: installedCliCount >= Math.max(1, terminalStatus.binaries.length - 1) ? 'ready' : 'partial',
            value: `${installedCliCount}/${terminalStatus.binaries.length}`,
            note: '终端环境会显示 CLI 安装完备度，可用于判断沙盒与运维链路是否可用。',
          },
          {
            key: 'channels',
            label: '频道管理',
            status: channelSummary.counts.channels > 0 ? 'ready' : 'partial',
            value: `${channelSummary.counts.channels} / ${channelSummary.counts.bindings}`,
            note: '频道数量与 bindings 已进入统一实时摘要。',
          },
          {
            key: 'cron',
            label: '定时任务',
            status: cronSummary.count > 0 ? 'ready' : 'partial',
            value: String(cronSummary.count),
            note: '任务总数已接入，可用于核对升级后的 schedule 恢复情况。',
          },
          {
            key: 'agents',
            label: 'Agent 管理',
            status: agentSummary.count > 0 ? 'ready' : 'partial',
            value: String(agentSummary.count),
            note: 'Agent 数量与 chat/config 页共享同一来源，便于核对升级后字段恢复情况。',
          },
          {
            key: 'system',
            label: '系统概览',
            status: systemHealth.gatewayConnected && deviceTrust.helper?.paired ? 'ready' : 'partial',
            value: systemHealth.gateway,
            note: release.updateAvailable
              ? `检测到 Studio ${release.latestVersion} 可升级，当前升级状态 ${upgradeStatus.status}。`
              : '健康、升级与设备信任状态均已并入系统摘要。',
          },
        ],
      };
    },
  };
}
