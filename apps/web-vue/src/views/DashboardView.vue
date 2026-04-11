<template>
  <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
  <div v-else-if="loading && !summary" class="status-banner">{{ text('正在加载实时数据…', 'Loading live dashboard data...') }}</div>

  <motion.section class="dashboard-workbench" v-bind="pageSurfaceReveal">
    <motion.header class="dashboard-hero-stage" v-bind="pageMastheadReveal">
      <div class="dashboard-hero-copy">
        <p class="eyebrow">Dashboard</p>
        <h2 class="page-title">{{ text('管理控制台恢复总览', 'Management Console Recovery Overview') }}</h2>
        <p class="dashboard-page-copy">
          {{ text('把恢复状态、配置入口和关键工作流收束到一个更像 Studio 的控制面。', 'Bring recovery status, configuration entry points, and key workstreams into a dashboard that feels like a Studio surface.') }}
        </p>
      </div>

      <div class="dashboard-meter-ribbon">
        <article v-for="metric in dashboardMetrics" :key="metric.eyebrow" class="dashboard-meter">
          <span class="dashboard-meter__eyebrow">{{ metric.eyebrow }}</span>
          <strong class="dashboard-meter__value">{{ metric.value }}</strong>
          <p class="dashboard-meter__label">{{ metric.label }}</p>
          <span class="dashboard-meter__note">{{ metric.note }}</span>
        </article>
      </div>
    </motion.header>

    <motion.section class="dashboard-action-belt" v-bind="pageSurfaceReveal">
      <div class="dashboard-action-belt__copy">
        <p class="dashboard-kicker">{{ text('CONTROL SURFACE', 'CONTROL SURFACE') }}</p>
        <h3>{{ text('先判断系统是否稳，再从入口带进入具体配置域。', 'Read system stability first, then move into the right configuration domain from the action belt.') }}</h3>
      </div>

      <div class="dashboard-status-strip">
        <article
          v-for="chip in dashboardStatusChips"
          :key="chip.label"
          class="dashboard-status-chip"
          :class="`tone-${chip.tone}`"
        >
          <span class="dashboard-status-chip__label">{{ chip.label }}</span>
          <strong>{{ chip.value }}</strong>
        </article>
      </div>

      <div class="dashboard-command-actions">
        <RouterLink
          v-for="action in dashboardQuickActions"
          :key="action.to"
          :to="action.to"
          class="dashboard-command-link"
        >
          <div class="dashboard-command-link__copy">
            <span class="dashboard-command-link__eyebrow">{{ action.eyebrow }}</span>
            <strong>{{ action.label }}</strong>
          </div>
          <span class="dashboard-command-link__note">{{ action.copy }}</span>
        </RouterLink>
      </div>
    </motion.section>

    <section class="dashboard-overview-river">
      <div class="dashboard-section-heading dashboard-section-heading-row">
        <div>
          <p class="eyebrow">{{ text('Domain Snapshot', 'Domain Snapshot') }}</p>
          <h3>{{ text('模块状态河流', 'Domain River') }}</h3>
        </div>
        <p class="dashboard-section-copy">
          {{ text('用连续的流式行块呈现模块状态，而不是再做一面双栏卡片墙。', 'Use continuous surfaced rows for domain state instead of another split card wall.') }}
        </p>
      </div>

      <div class="dashboard-domain-stream__list">
        <RouterLink
          v-for="domain in dashboardDomainCards"
          :key="domain.key"
          :to="domain.to"
          class="dashboard-domain-row"
          :class="`tone-${domain.tone}`"
        >
          <div class="dashboard-domain-row__lead">
            <span class="dashboard-domain-row__eyebrow">{{ domain.kicker }}</span>
            <h4>{{ domain.label }}</h4>
          </div>
          <strong class="dashboard-domain-row__value">{{ domain.value }}</strong>
          <p class="dashboard-domain-row__note">{{ domain.note }}</p>
          <span class="dashboard-domain-row__state">{{ domain.state }}</span>
        </RouterLink>
      </div>
    </section>

    <section class="dashboard-signal-runway">
      <div class="dashboard-runway-grid">
        <section class="dashboard-runtime-band">
          <div class="dashboard-section-heading">
            <div>
              <p class="eyebrow">{{ text('Runtime Transport', 'Runtime Transport') }}</p>
              <h3>{{ transportModeLabel }}</h3>
            </div>
          </div>

          <div class="dashboard-fact-tape">
            <div class="dashboard-fact">
              <span>{{ text('入口', 'Entry') }}</span>
              <strong>{{ summary?.transport.entryUrl || '--' }}</strong>
            </div>
            <div class="dashboard-fact">
              <span>{{ text('健康检查', 'Health') }}</span>
              <strong>{{ summary?.transport.healthUrl || '--' }}</strong>
            </div>
            <div class="dashboard-fact">
              <span>Gateway</span>
              <strong>{{ summary?.gateway.url || '--' }}</strong>
            </div>
            <div class="dashboard-fact">
              <span>{{ text('端口映射', 'Port map') }}</span>
              <strong>{{ summary ? `${summary.transport.gatewayPort} / ${summary.transport.standalonePort}` : '--' }}</strong>
            </div>
          </div>
        </section>

        <section class="dashboard-release-band">
          <div class="dashboard-section-heading">
            <div>
              <p class="eyebrow">{{ text('Release Pulse', 'Release Pulse') }}</p>
              <h3>{{ text('版本与系统脉冲', 'Release and System Pulse') }}</h3>
            </div>
          </div>

          <div class="dashboard-release-band__summary">
            <div class="dashboard-release-value">
              <span>{{ text('当前版本', 'Current version') }}</span>
              <strong>v{{ summary?.release.currentVersion || '--' }}</strong>
            </div>
            <div class="dashboard-release-copy">
              <p>{{ text('最新版本', 'Latest version') }}: {{ summary?.release.latestVersion ? `v${summary.release.latestVersion}` : '--' }}</p>
              <p>{{ text('升级状态', 'Upgrade state') }}: {{ releaseStatusLabel }}</p>
              <p v-if="summary?.release.targetVersion">{{ text('目标版本', 'Target') }}: v{{ summary.release.targetVersion }}</p>
              <p v-if="summary?.release.source">{{ text('版本源', 'Source') }}: {{ summary.release.source }}</p>
            </div>
          </div>

          <div class="dashboard-signal-ribbon">
            <article v-for="signal in dashboardSystemSignals" :key="signal.label" class="dashboard-signal">
              <span>{{ signal.label }}</span>
              <strong>{{ signal.value }}</strong>
              <p>{{ signal.detail }}</p>
            </article>
          </div>
        </section>
      </div>

      <section class="dashboard-track-strip">
        <div class="dashboard-section-heading dashboard-section-heading-row">
          <div>
            <p class="eyebrow">{{ text('Parallel Workstreams', 'Parallel Workstreams') }}</p>
            <h3>{{ text('恢复轨道', 'Recovery Tracks') }}</h3>
          </div>
          <p class="dashboard-section-copy">
            {{ text('把恢复任务压成一条清晰的工作轨道，而不是再堆一组小卡片。', 'Compress recovery work into a clear runway instead of another row of small cards.') }}
          </p>
        </div>

        <div class="dashboard-track-list">
          <article
            v-for="track in parallelTracks"
            :key="track.name"
            class="dashboard-track-item"
            :class="`tone-${track.tone}`"
          >
            <div class="dashboard-track-item__body">
              <strong>{{ track.name }}</strong>
              <p>{{ track.summary }}</p>
            </div>
            <span>{{ track.state }}</span>
          </article>
        </div>
      </section>
    </section>
  </motion.section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { motion } from 'motion-v';
import { useLocalePreference } from '../shared/locale';
import { fetchDashboardSummary, subscribeDashboardSummary } from '../features/dashboard/api';
import type { DashboardDomainSummary, DashboardSummaryPayload } from '../../../../types/dashboard';
import { pageMastheadReveal, pageSurfaceReveal } from '../shared/motion';

type DashboardChipTone = 'ready' | 'accent' | 'danger' | 'neutral';
type DashboardDomainTone = 'ready' | 'partial' | 'planned';

const dashboardRouteMap: Record<DashboardDomainSummary['key'], string> = {
  agents: '/agents',
  channels: '/channels',
  config: '/config',
  cron: '/cron',
  skills: '/skills',
  system: '/system',
  terminal: '/terminal',
};

const { locale, text } = useLocalePreference();

const summary = ref<DashboardSummaryPayload | null>(null);
const loading = ref(false);
const errorMessage = ref('');
let refreshTimer: number | null = null;
let disconnectSummaryStream: (() => void) | null = null;

const gatewayStatusLabel = computed(() => {
  if (!summary.value) return '--';
  return summary.value.gateway.connected ? text('在线', 'Online') : text('离线', 'Offline');
});

const transportModeLabel = computed(() => {
  if (!summary.value) return '--';
  return summary.value.transport.mode === 'gateway'
    ? text('单口 Gateway /studio', 'Single-port Gateway /studio')
    : text('独立端口 Standalone', 'Standalone transport');
});

const releaseStatusLabel = computed(() => {
  if (!summary.value) return '--';
  if (summary.value.release.upgradeRunning) return text('升级中', 'Upgrading');
  if (summary.value.release.upgradeStatus === 'failed') return text('升级失败', 'Upgrade failed');
  if (summary.value.release.upgradeStatus === 'succeeded') return text('已完成', 'Completed');
  if (summary.value.release.updateAvailable) return text('有新版本', 'Update available');
  return text('已最新', 'Up to date');
});

const bootstrapLabel = computed(() => {
  if (!summary.value) return '--';
  if (summary.value.bootstrap.ready) return text('已就绪', 'Ready');
  return text(
    `${summary.value.bootstrap.errors} 错误 / ${summary.value.bootstrap.warnings} 警告`,
    `${summary.value.bootstrap.errors} errors / ${summary.value.bootstrap.warnings} warnings`,
  );
});

const helperStatusLabel = computed(() => {
  if (!summary.value) return '--';
  if (!summary.value.deviceTrust.helperConfigured) return text('未初始化', 'Not initialized');
  return summary.value.deviceTrust.helperPaired
    ? text('已配对', 'Paired')
    : text('待配对', 'Pending');
});

function domainStateLabel(status: DashboardDomainSummary['status']): string {
  if (status === 'ready') return text('就绪', 'Ready');
  if (status === 'partial') return text('进行中', 'In Progress');
  return text('规划中', 'Planned');
}

function fallbackDomainLabel(key: DashboardDomainSummary['key']): string {
  switch (key) {
    case 'agents':
      return text('Agent', 'Agents');
    case 'channels':
      return text('频道', 'Channels');
    case 'config':
      return text('配置', 'Config');
    case 'cron':
      return text('定时任务', 'Cron');
    case 'skills':
      return text('技能', 'Skills');
    case 'system':
      return text('系统', 'System');
    case 'terminal':
      return text('终端', 'Terminal');
    default:
      return key;
  }
}

function formatDateTime(value: string): string {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  const formatter = new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return formatter.format(date);
}

const checkedAtLabel = computed(() => formatDateTime(summary.value?.checkedAt ?? ''));

const dashboardStatusChips = computed(() => {
  const payload = summary.value;
  if (!payload) {
    return [
      { label: 'Gateway', value: text('等待同步', 'Waiting'), tone: 'neutral' as DashboardChipTone },
      { label: text('Bootstrap', 'Bootstrap'), value: text('等待同步', 'Waiting'), tone: 'neutral' as DashboardChipTone },
      { label: text('Release', 'Release'), value: text('等待同步', 'Waiting'), tone: 'neutral' as DashboardChipTone },
      { label: text('Local helper', 'Local helper'), value: text('等待同步', 'Waiting'), tone: 'neutral' as DashboardChipTone },
      { label: text('Checked', 'Checked'), value: '--', tone: 'neutral' as DashboardChipTone },
    ];
  }

  const releaseTone: DashboardChipTone = payload.release.upgradeStatus === 'failed'
    ? 'danger'
    : payload.release.upgradeRunning || payload.release.updateAvailable
      ? 'accent'
      : 'neutral';

  const helperTone: DashboardChipTone = payload.deviceTrust.helperPaired
    ? 'ready'
    : payload.deviceTrust.helperConfigured
      ? 'accent'
      : 'neutral';

  const bootstrapTone: DashboardChipTone = payload.bootstrap.ready
    ? 'ready'
    : payload.bootstrap.errors > 0
      ? 'danger'
      : 'accent';

  return [
    { label: 'Gateway', value: gatewayStatusLabel.value, tone: payload.gateway.connected ? 'ready' : 'danger' as DashboardChipTone },
    { label: text('Bootstrap', 'Bootstrap'), value: bootstrapLabel.value, tone: bootstrapTone },
    { label: text('Release', 'Release'), value: releaseStatusLabel.value, tone: releaseTone },
    { label: text('Local helper', 'Local helper'), value: helperStatusLabel.value, tone: helperTone },
    { label: text('Checked', 'Checked'), value: checkedAtLabel.value, tone: 'neutral' as DashboardChipTone },
  ];
});

const dashboardMetrics = computed(() => {
  const payload = summary.value;
  if (!payload) {
    return [
      { eyebrow: text('Agent', 'Agents'), value: '--', label: text('已注册 Agent', 'Registered agents'), note: text('等待数据', 'Waiting for data') },
      { eyebrow: text('Channel', 'Channels'), value: '--', label: text('已启用频道', 'Configured channels'), note: text('等待数据', 'Waiting for data') },
      { eyebrow: text('Skill', 'Skills'), value: '--', label: text('已启用技能', 'Enabled skills'), note: text('等待数据', 'Waiting for data') },
      { eyebrow: 'Gateway', value: '--', label: text('实时链路', 'Realtime link'), note: text('等待数据', 'Waiting for data') },
    ];
  }
  return [
    {
      eyebrow: text('Agent', 'Agents'),
      value: String(payload.counts.agents),
      label: text('已注册 Agent', 'Registered agents'),
      note: text(`服务端 v${payload.server.version}`, `Server v${payload.server.version}`),
    },
    {
      eyebrow: text('Channel', 'Channels'),
      value: String(payload.counts.channels),
      label: text('已启用频道', 'Configured channels'),
      note: text(`Bindings ${payload.counts.bindings}`, `Bindings ${payload.counts.bindings}`),
    },
    {
      eyebrow: text('Skill', 'Skills'),
      value: String(payload.counts.enabledSkills),
      label: text('已启用技能', 'Enabled skills'),
      note: text(`总计 ${payload.counts.skills}`, `Total ${payload.counts.skills}`),
    },
    {
      eyebrow: 'Gateway',
      value: gatewayStatusLabel.value,
      label: text('实时链路', 'Realtime link'),
      note: payload.transport.mode === 'gateway'
        ? text(`单口 ${payload.transport.basePath}`, `Single-port ${payload.transport.basePath}`)
        : text(`独立端口 ${payload.transport.standalonePort}`, `Standalone ${payload.transport.standalonePort}`),
    },
  ];
});

const dashboardQuickActions = computed(() => ([
  {
    to: '/chat',
    eyebrow: 'Chat',
    label: text('进入私聊入口', 'Open chat entry'),
    copy: text('继续最近会话或打开新的 operator 私聊。', 'Resume recent sessions or open a new operator chat.'),
  },
  {
    to: '/agents',
    eyebrow: 'Agents',
    label: text('查看 Agent roster', 'Inspect agent roster'),
    copy: text('检查 Agent 配置、工作区和运行态。', 'Review agent configuration, workspaces, and live state.'),
  },
  {
    to: '/config',
    eyebrow: 'Config',
    label: text('调整系统默认值', 'Adjust system defaults'),
    copy: text('编辑模型、sandbox 和工具默认配置。', 'Edit model, sandbox, and tool defaults.'),
  },
  {
    to: '/cron',
    eyebrow: 'Cron',
    label: text('检查自动化任务', 'Review cron jobs'),
    copy: text('查看 schedule、delivery target 和执行入口。', 'Check schedules, delivery targets, and execution entry points.'),
  },
  {
    to: '/dreaming',
    eyebrow: 'Dreaming',
    label: text('打开梦境工作台', 'Open dreaming workbench'),
    copy: text('检查 memory slot、Dreaming 开关和 Dream Diary。', 'Inspect memory slot selection, the dreaming toggle, and the Dream Diary.'),
  },
  {
    to: '/system',
    eyebrow: 'System',
    label: text('打开系统诊断', 'Open diagnostics'),
    copy: text('查看健康状态、bootstrap 和设备信任。', 'Inspect health, bootstrap state, and device trust.'),
  },
]));

const dashboardDomainCards = computed(() => {
  const payload = summary.value;
  if (!payload) {
    return (Object.entries(dashboardRouteMap) as Array<[DashboardDomainSummary['key'], string]>).map(([key, to]) => ({
      key,
      to,
      kicker: key.toUpperCase(),
      label: fallbackDomainLabel(key),
      state: text('等待数据', 'Waiting'),
      tone: 'planned' as DashboardDomainTone,
      value: '--',
      note: text('等待 dashboard summary。', 'Waiting for dashboard summary.'),
    }));
  }
  return payload.domains.map((domain) => ({
    key: domain.key,
    to: dashboardRouteMap[domain.key],
    kicker: domain.key.toUpperCase(),
    label: domain.label,
    state: domainStateLabel(domain.status),
    tone: domain.status as DashboardDomainTone,
    value: domain.value,
    note: domain.note,
  }));
});

const dashboardSystemSignals = computed(() => {
  const payload = summary.value;
  if (!payload) {
    return [
      { label: text('CLI coverage', 'CLI coverage'), value: '--', detail: text('等待数据', 'Waiting for data') },
      { label: text('Server uptime', 'Server uptime'), value: '--', detail: text('等待数据', 'Waiting for data') },
      { label: text('Pending fixes', 'Pending fixes'), value: '--', detail: text('等待数据', 'Waiting for data') },
      { label: text('Pending pairing', 'Pending pairing'), value: '--', detail: text('等待数据', 'Waiting for data') },
    ];
  }
  return [
    {
      label: text('CLI coverage', 'CLI coverage'),
      value: `${payload.runtime.installedCliCount}/${payload.runtime.expectedCliCount}`,
      detail: text('运行时 CLI 已安装 / 预期数量', 'Installed / expected runtime CLIs'),
    },
    {
      label: text('Server uptime', 'Server uptime'),
      value: formatUptime(payload.server.uptime),
      detail: `Node ${payload.server.nodeVersion}`,
    },
    {
      label: text('Pending fixes', 'Pending fixes'),
      value: String(payload.bootstrap.fixable),
      detail: text('bootstrap 阶段可自动修复的问题数量', 'Fixable issues reported by bootstrap'),
    },
    {
      label: text('Pending pairing', 'Pending pairing'),
      value: String(payload.deviceTrust.pendingRequests),
      detail: text('等待审批的本地设备配对请求', 'Device trust requests awaiting approval'),
    },
  ];
});

const parallelTracks = computed(() => {
  const payload = summary.value;
  if (!payload) {
    return [
      {
        name: text('数据汇总', 'Summary Pipeline'),
        summary: text('等待后端返回 dashboard summary。', 'Waiting for dashboard summary payload.'),
        state: text('加载中', 'Loading'),
        tone: 'planned' as DashboardDomainTone,
      },
    ];
  }
  return payload.domains.map((domain) => ({
    name: domain.label,
    summary: domain.note,
    state: domainStateLabel(domain.status),
    tone: domain.status as DashboardDomainTone,
  }));
});

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m';
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function applyDashboardSummary(payload: DashboardSummaryPayload): void {
  summary.value = payload;
  errorMessage.value = '';
  loading.value = false;
}

function clearRefreshTimer(): void {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

function ensurePollingFallback(): void {
  if (typeof window === 'undefined' || refreshTimer !== null) {
    return;
  }
  refreshTimer = window.setInterval(() => {
    void loadDashboardSummary(true);
  }, 10_000);
}

function connectDashboardStream(): void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    ensurePollingFallback();
    return;
  }
  disconnectSummaryStream?.();
  disconnectSummaryStream = subscribeDashboardSummary(
    (payload) => {
      clearRefreshTimer();
      applyDashboardSummary(payload);
    },
    () => {
      ensurePollingFallback();
    },
  );
}

async function loadDashboardSummary(silent = false): Promise<void> {
  if (!silent) {
    loading.value = true;
  }
  try {
    applyDashboardSummary(await fetchDashboardSummary());
  } catch (error) {
    errorMessage.value = error instanceof Error
      ? error.message
      : text('读取 Dashboard 失败。', 'Failed to load dashboard.');
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void loadDashboardSummary();
  connectDashboardStream();
  ensurePollingFallback();
});

onBeforeUnmount(() => {
  disconnectSummaryStream?.();
  disconnectSummaryStream = null;
  clearRefreshTimer();
});
</script>

<style scoped>
.dashboard-workbench {
  display: grid;
  gap: 18px;
}

.dashboard-hero-stage,
.dashboard-action-belt,
.dashboard-overview-river,
.dashboard-signal-runway {
  position: relative;
  display: grid;
  gap: 16px;
  border-radius: 12px;
  border: 1px solid var(--shell-panel-border);
  background:
    radial-gradient(520px 220px at 14% 0%, rgba(255, 255, 255, 0.13), transparent 60%),
    var(--shell-panel-fill);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}

.dashboard-hero-stage,
.dashboard-action-belt,
.dashboard-overview-river,
.dashboard-signal-runway {
  padding: 22px;
}

.dashboard-hero-stage {
  gap: 18px;
  background:
    radial-gradient(560px 240px at 12% 0%, rgba(255, 255, 255, 0.15), transparent 58%),
    linear-gradient(135deg, rgba(92, 168, 255, 0.08), transparent 36%),
    var(--shell-stage-fill-strong);
}

.dashboard-hero-copy {
  display: grid;
  gap: 12px;
  max-width: 860px;
}

.dashboard-page-copy {
  margin: 0;
  max-width: 720px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.72;
}

.dashboard-meter-ribbon {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-meter {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 15px 16px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.dashboard-meter__eyebrow,
.dashboard-status-chip__label,
.dashboard-domain-row__eyebrow,
.dashboard-fact span,
.dashboard-release-value span,
.dashboard-signal span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.dashboard-meter__value,
.dashboard-domain-row__value {
  color: var(--text);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.dashboard-meter__label {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.dashboard-meter__note,
.dashboard-command-link__note,
.dashboard-domain-row__note,
.dashboard-release-copy p,
.dashboard-signal p,
.dashboard-track-item__body p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.dashboard-action-belt {
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: start;
}

.dashboard-action-belt__copy {
  display: grid;
  gap: 10px;
  max-width: 520px;
}

.dashboard-kicker {
  margin: 0;
  color: var(--acc);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.dashboard-action-belt__copy h3 {
  margin: 0;
  color: var(--text);
  font-size: clamp(30px, 3.9vw, 42px);
  line-height: 1.08;
  letter-spacing: -0.04em;
  max-width: 14ch;
}

.dashboard-status-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.dashboard-status-chip {
  display: grid;
  gap: 6px;
  min-width: 148px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.dashboard-status-chip strong,
.dashboard-domain-row h4,
.dashboard-command-link strong,
.dashboard-track-item__body strong,
.dashboard-signal strong {
  color: var(--text);
}

.dashboard-status-chip strong {
  font-size: 15px;
}

.dashboard-status-chip.tone-ready {
  border-color: rgba(127, 255, 212, 0.2);
}

.dashboard-status-chip.tone-accent {
  border-color: rgba(255, 214, 165, 0.2);
}

.dashboard-status-chip.tone-danger {
  border-color: rgba(255, 154, 154, 0.22);
}

.dashboard-command-actions {
  display: grid;
  gap: 10px;
  grid-column: 1 / -1;
}

.dashboard-command-link {
  display: grid;
  grid-template-columns: minmax(0, 240px) minmax(0, 1fr);
  gap: 18px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
  color: var(--text);
  text-decoration: none;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.dashboard-command-link:hover,
.dashboard-domain-row:hover {
  transform: translateY(-1px);
  border-color: rgba(127, 255, 212, 0.2);
  background: var(--shell-panel-fill-strong);
}

.dashboard-command-link__copy,
.dashboard-domain-row__lead,
.dashboard-track-item__body,
.dashboard-release-value,
.dashboard-release-copy {
  display: grid;
  gap: 6px;
}

.dashboard-command-link__eyebrow {
  color: var(--acc);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.dashboard-overview-river,
.dashboard-signal-runway,
.dashboard-track-strip,
.dashboard-runtime-band,
.dashboard-release-band {
  display: grid;
  gap: 14px;
}

.dashboard-overview-river {
  display: grid;
  gap: 14px;
}

.dashboard-signal-runway {
  display: grid;
  gap: 14px;
}

.dashboard-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.dashboard-section-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
}

.dashboard-section-heading-row {
  align-items: end;
}

.dashboard-section-copy {
  margin: 0;
  max-width: 48ch;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
  text-align: right;
}

.dashboard-domain-stream__list,
.dashboard-fact-tape,
.dashboard-track-list {
  display: grid;
  gap: 10px;
}

.dashboard-domain-row {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) auto minmax(0, 0.9fr) auto;
  gap: 16px;
  align-items: center;
  padding: 16px 18px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
  color: var(--text);
  text-decoration: none;
  transition: transform 0.2s ease, border-color 0.2s ease, background 0.2s ease;
}

.dashboard-domain-row__state,
.dashboard-track-item span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.dashboard-domain-row.tone-ready .dashboard-domain-row__state,
.dashboard-track-item.tone-ready span {
  background: rgba(127, 255, 212, 0.12);
  color: var(--mint);
}

.dashboard-fact,
.dashboard-signal,
.dashboard-track-item,
.dashboard-release-band__summary {
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.dashboard-fact {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
}

.dashboard-fact strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.dashboard-runway-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
}

.dashboard-runtime-band,
.dashboard-release-band,
.dashboard-track-strip {
  padding: 18px;
  border-radius: 12px;
  border: 1px solid var(--shell-panel-border);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.025), transparent 32%),
    var(--shell-panel-fill);
}

.dashboard-release-band__summary {
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding: 14px 16px;
}

.dashboard-release-value strong {
  color: var(--text);
  font-size: 24px;
  letter-spacing: -0.04em;
}

.dashboard-signal-ribbon {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.dashboard-signal {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
}

.dashboard-track-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.dashboard-track-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
}

@media (max-width: 1180px) {
  .dashboard-meter-ribbon,
  .dashboard-runway-grid,
  .dashboard-track-list,
  .dashboard-release-band__summary {
    grid-template-columns: 1fr;
  }

  .dashboard-action-belt {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 920px) {
  .dashboard-hero-stage,
  .dashboard-action-belt,
  .dashboard-overview-river,
  .dashboard-signal-runway {
    padding: 18px;
  }

  .dashboard-section-heading-row {
    align-items: start;
    flex-direction: column;
  }

  .dashboard-section-copy {
    max-width: none;
    text-align: left;
  }

  .dashboard-domain-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .dashboard-command-link {
    grid-template-columns: 1fr;
  }

  .dashboard-signal-ribbon {
    grid-template-columns: 1fr;
  }

  .dashboard-track-item {
    align-items: start;
    flex-direction: column;
  }

  .dashboard-track-item span,
  .dashboard-domain-row__state {
    white-space: normal;
  }
}
</style>
