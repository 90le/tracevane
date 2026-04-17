<template>
  <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
  <div v-else-if="loading && !summary" class="status-banner">{{ text('正在加载首页控制面数据…', 'Loading home control surface data...') }}</div>

  <motion.section class="home-control-surface home-stage-rhythm" v-bind="pageSurfaceReveal">
    <motion.header class="home-situation-band" data-home-zone="situation" v-bind="pageMastheadReveal">
      <div class="home-situation-copy">
        <p class="eyebrow">Home</p>
        <h2 class="page-title">{{ text('Studio 总控首页', 'Studio Home Control Surface') }}</h2>
        <p class="home-page-copy">
          {{ text('把运行态、风险与待处理事项收束在同一主舞台，先看态势再进入对应域。', 'Bring runtime posture, risk, and pending work into one primary stage so operators can read the situation first, then act by domain.') }}
        </p>
      </div>

      <div class="home-situation-meters">
        <article v-for="metric in homeSituationMetrics" :key="metric.eyebrow" class="home-situation-meter">
          <span class="home-situation-meter__eyebrow">{{ metric.eyebrow }}</span>
          <strong class="home-situation-meter__value">{{ metric.value }}</strong>
          <p class="home-situation-meter__label">{{ metric.label }}</p>
          <span class="home-situation-meter__note">{{ metric.note }}</span>
        </article>
      </div>
    </motion.header>

    <section class="home-risk-stage" data-home-zone="risk">
      <div class="home-risk-stage__main">
        <div class="home-section-heading home-section-heading-row home-section-marker">
          <div>
            <p class="eyebrow">{{ text('Control Focus', 'Control Focus') }}</p>
            <h3>{{ text('风险与待处理', 'Risks and pending') }}</h3>
          </div>
          <p class="home-section-copy">
            {{ text('把 Gateway、Bootstrap、Release 与本地配对状态作为总控首页主舞台。', 'Use gateway, bootstrap, release, and local trust pairing as the central risk stage for Home.') }}
          </p>
        </div>

        <div class="home-risk-chip-strip">
          <article
            v-for="chip in dashboardStatusChips"
            :key="chip.label"
            class="home-risk-chip"
            :class="`tone-${chip.tone}`"
          >
            <span class="home-risk-chip__label">{{ chip.label }}</span>
            <strong>{{ chip.value }}</strong>
          </article>
        </div>

        <div class="home-risk-stream">
          <RouterLink
            v-for="domain in dashboardDomainCards"
            :key="domain.key"
            :to="domain.to"
            class="home-risk-row"
            :class="`tone-${domain.tone}`"
          >
            <div class="home-risk-row__lead">
              <span class="home-risk-row__eyebrow">{{ domain.kicker }}</span>
              <h4>{{ domain.label }}</h4>
            </div>
            <strong class="home-risk-row__value">{{ domain.value }}</strong>
            <p class="home-risk-row__note">{{ domain.note }}</p>
            <span class="home-risk-row__state">{{ domain.state }}</span>
          </RouterLink>
        </div>
      </div>

      <aside class="home-risk-stage__side">
        <h4>{{ text('快速动作', 'Quick actions') }}</h4>
        <RouterLink
          v-for="action in homeQuickActions"
          :key="action.to"
          :to="action.to"
          class="home-quick-action"
        >
          <div class="home-quick-action__copy">
            <span class="home-quick-action__eyebrow">{{ action.eyebrow }}</span>
            <strong>{{ action.label }}</strong>
          </div>
          <span class="home-quick-action__note">{{ action.copy }}</span>
        </RouterLink>
      </aside>
    </section>

    <section class="home-resource-grid" data-home-zone="resource">
      <section class="home-resource-panel">
        <div class="home-section-heading">
          <div>
            <p class="eyebrow">{{ text('Runtime Summary', 'Runtime Summary') }}</p>
            <h3>{{ transportModeLabel }}</h3>
          </div>
        </div>

        <div class="home-fact-tape">
          <div class="home-fact">
            <span>{{ text('入口', 'Entry') }}</span>
            <strong>{{ summary?.transport.entryUrl || '--' }}</strong>
          </div>
          <div class="home-fact">
            <span>{{ text('健康检查', 'Health') }}</span>
            <strong>{{ summary?.transport.healthUrl || '--' }}</strong>
          </div>
          <div class="home-fact">
            <span>Gateway</span>
            <strong>{{ summary?.gateway.url || '--' }}</strong>
          </div>
          <div class="home-fact">
            <span>{{ text('端口映射', 'Port map') }}</span>
            <strong>{{ summary ? `${summary.transport.gatewayPort} / ${summary.transport.standalonePort}` : '--' }}</strong>
          </div>
        </div>
      </section>

      <section class="home-resource-panel">
        <div class="home-section-heading">
          <div>
            <p class="eyebrow">{{ text('Release Summary', 'Release Summary') }}</p>
            <h3>{{ text('资源摘要与系统脉冲', 'Resource summary and pulse') }}</h3>
          </div>
        </div>

        <div class="home-release-summary">
          <div class="home-release-value">
            <span>{{ text('当前版本', 'Current version') }}</span>
            <strong>v{{ summary?.release.currentVersion || '--' }}</strong>
          </div>
          <div class="home-release-copy">
            <p>{{ text('最新版本', 'Latest version') }}: {{ summary?.release.latestVersion ? `v${summary.release.latestVersion}` : '--' }}</p>
            <p>{{ text('升级状态', 'Upgrade state') }}: {{ releaseStatusLabel }}</p>
            <p v-if="summary?.release.targetVersion">{{ text('目标版本', 'Target') }}: v{{ summary.release.targetVersion }}</p>
            <p v-if="summary?.release.source">{{ text('版本源', 'Source') }}: {{ summary.release.source }}</p>
          </div>
        </div>

        <div class="home-resource-signals">
          <article v-for="signal in dashboardSystemSignals" :key="signal.label" class="home-resource-signal">
            <span>{{ signal.label }}</span>
            <strong>{{ signal.value }}</strong>
            <p>{{ signal.detail }}</p>
          </article>
        </div>
      </section>
    </section>

    <section class="home-recent-stream" data-home-zone="recent">
      <div class="home-section-heading home-section-heading-row home-section-marker">
        <div>
          <p class="eyebrow">{{ text('Recent Changes', 'Recent Changes') }}</p>
          <h3>{{ text('最近变化流', 'Recent stream') }}</h3>
        </div>
        <p class="home-section-copy">
          {{ text('保留最近域状态变化作为首页收尾，支持继续追踪。', 'Keep a short stream of recent domain state shifts as the home tail signal.') }}
        </p>
      </div>

      <div class="home-track-list">
        <article
          v-for="track in homeRecentTracks"
          :key="track.name"
          class="home-track-item"
          :class="`tone-${track.tone}`"
        >
          <div class="home-track-item__body">
            <strong>{{ track.name }}</strong>
            <p>{{ track.summary }}</p>
          </div>
          <span>{{ track.state }}</span>
        </article>
      </div>
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

function domainStateLabel(status: DashboardDomainSummary['status'] | string): string {
  if (status === 'ready') return text('就绪', 'Ready');
  if (status === 'partial') return text('进行中', 'In Progress');
  return text('规划中', 'Planned');
}

function normalizeDomainTone(status: DashboardDomainSummary['status'] | string): DashboardDomainTone {
  if (status === 'ready' || status === 'partial' || status === 'planned') {
    return status;
  }
  return 'planned';
}

function fallbackDomainLabel(key: string): string {
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

function resolveDomainRoute(key: string): string {
  return dashboardRouteMap[key as DashboardDomainSummary['key']] ?? '/system';
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

const homeSituationMetrics = computed(() => {
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

const homeQuickActions = computed(() => ([
  {
    to: '/chat',
    eyebrow: 'Chat',
    label: text('继续指挥会话', 'Continue operator chat'),
    copy: text('回到最近私聊，或直接开启新的指挥会话。', 'Return to recent private sessions or start a new operator thread.'),
  },
  {
    to: '/agents',
    eyebrow: 'Agents',
    label: text('查看执行单元', 'Inspect agents'),
    copy: text('核对 Agent 配置、工作区和当前状态。', 'Validate agent configuration, workspace assignment, and current state.'),
  },
  {
    to: '/config',
    eyebrow: 'Config',
    label: text('收口默认策略', 'Tune defaults'),
    copy: text('统一模型、sandbox 与工具默认设置。', 'Align model, sandbox, and tooling defaults from one control path.'),
  },
  {
    to: '/cron',
    eyebrow: 'Cron',
    label: text('处理待运行任务', 'Review scheduled work'),
    copy: text('检查定时策略、投递目标和手动运行入口。', 'Check schedules, delivery targets, and run-now controls.'),
  },
  {
    to: '/dreaming',
    eyebrow: 'Dreaming',
    label: text('查看记忆态势', 'Open memory lab'),
    copy: text('检查 memory slot、Dreaming 开关与 Dream Diary。', 'Inspect memory slot selection, dreaming toggle, and Dream Diary.'),
  },
  {
    to: '/system',
    eyebrow: 'System',
    label: text('进入系统诊断', 'Open diagnostics'),
    copy: text('追踪健康状态、bootstrap 与设备信任。', 'Track health, bootstrap state, and local device trust.'),
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
    to: resolveDomainRoute(domain.key),
    kicker: domain.key.toUpperCase(),
    label: domain.label || fallbackDomainLabel(domain.key),
    state: domainStateLabel(domain.status),
    tone: normalizeDomainTone(domain.status),
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

const homeRecentTracks = computed(() => {
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
      : text('读取首页控制面失败。', 'Failed to load home control surface.');
  } finally {
    if (!silent) {
      loading.value = false;
    }
  }
}

onMounted(() => {
  void loadDashboardSummary();
  connectDashboardStream();
});

onBeforeUnmount(() => {
  disconnectSummaryStream?.();
  disconnectSummaryStream = null;
  clearRefreshTimer();
});
</script>

<style scoped>
.home-control-surface {
  display: grid;
  gap: 18px;
}

.home-situation-band,
.home-risk-stage,
.home-resource-panel,
.home-recent-stream {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 22px;
  border-radius: 12px;
  border: 1px solid var(--shell-panel-border);
  background:
    radial-gradient(520px 220px at 14% 0%, rgba(255, 255, 255, 0.13), transparent 60%),
    var(--shell-panel-fill);
  box-shadow: var(--shadow-soft);
  overflow: hidden;
}

.home-situation-band {
  gap: 18px;
  background:
    radial-gradient(560px 240px at 12% 0%, rgba(255, 255, 255, 0.15), transparent 58%),
    linear-gradient(135deg, rgba(92, 168, 255, 0.08), transparent 36%),
    var(--shell-stage-fill-strong);
}

.home-situation-copy {
  display: grid;
  gap: 12px;
  max-width: 860px;
}

.home-page-copy {
  margin: 0;
  max-width: 760px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.72;
}

.home-situation-meters {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.home-situation-meter {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 15px 16px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.home-situation-meter__eyebrow,
.home-risk-chip__label,
.home-risk-row__eyebrow,
.home-fact span,
.home-release-value span,
.home-resource-signal span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.home-situation-meter__value,
.home-risk-row__value {
  color: var(--text);
  font-size: 28px;
  line-height: 1;
  letter-spacing: -0.04em;
}

.home-situation-meter__label {
  margin: 0;
  color: var(--text);
  font-size: 13px;
  font-weight: 700;
}

.home-situation-meter__note,
.home-quick-action__note,
.home-risk-row__note,
.home-release-copy p,
.home-resource-signal p,
.home-track-item__body p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.home-risk-stage {
  grid-template-columns: minmax(0, 1.1fr) minmax(280px, 0.9fr);
  align-items: start;
}

.home-risk-stage__main,
.home-risk-stage__side {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.home-risk-stage__side h4 {
  margin: 0;
  font-size: 16px;
  color: var(--text);
}

.home-section-heading {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 12px;
}

.home-section-heading h3 {
  margin: 0;
  color: var(--text);
  font-size: 18px;
}

.home-section-heading-row {
  align-items: end;
}

.home-section-copy {
  margin: 0;
  max-width: 48ch;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.65;
  text-align: right;
}

.home-risk-chip-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.home-risk-chip {
  display: grid;
  gap: 6px;
  min-width: 148px;
  padding: 12px 14px;
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.home-risk-chip strong,
.home-risk-row h4,
.home-quick-action strong,
.home-track-item__body strong,
.home-resource-signal strong {
  color: var(--text);
}

.home-risk-chip strong {
  font-size: 15px;
}

.home-risk-chip.tone-ready {
  border-color: rgba(127, 255, 212, 0.2);
}

.home-risk-chip.tone-accent {
  border-color: rgba(255, 214, 165, 0.2);
}

.home-risk-chip.tone-danger {
  border-color: rgba(255, 154, 154, 0.22);
}

.home-risk-stream,
.home-fact-tape,
.home-track-list,
.home-risk-stage__side {
  display: grid;
  gap: 10px;
}

.home-risk-row {
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

.home-quick-action {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 15px 16px;
  border: 1px solid var(--shell-panel-border);
  border-radius: 10px;
  background: var(--shell-panel-fill);
  color: var(--text);
  text-align: left;
  text-decoration: none;
  box-shadow: var(--shadow-soft);
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.home-quick-action:hover,
.home-risk-row:hover {
  transform: translateY(-1px);
  border-color: rgba(127, 255, 212, 0.2);
  background: var(--shell-panel-fill-strong);
}

.home-quick-action__copy,
.home-risk-row__lead,
.home-track-item__body,
.home-release-value,
.home-release-copy {
  display: grid;
  gap: 6px;
}

.home-quick-action__eyebrow {
  color: var(--acc);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.home-risk-row__state,
.home-track-item span {
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

.home-risk-row.tone-ready .home-risk-row__state,
.home-track-item.tone-ready span {
  background: rgba(127, 255, 212, 0.12);
  color: var(--mint);
}

.home-resource-grid {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  gap: 12px;
}

.home-fact,
.home-resource-signal,
.home-track-item,
.home-release-summary {
  border-radius: 10px;
  border: 1px solid var(--shell-panel-border);
  background: var(--shell-panel-fill);
}

.home-fact {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
}

.home-fact strong {
  color: var(--text);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}

.home-resource-panel {
  display: grid;
  gap: 14px;
}

.home-release-summary {
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr);
  gap: 18px;
  align-items: start;
  padding: 14px 16px;
}

.home-release-value strong {
  color: var(--text);
  font-size: 24px;
  letter-spacing: -0.04em;
}

.home-resource-signals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.home-resource-signal {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
}

.home-track-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.home-track-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  padding: 14px 16px;
}

@media (max-width: 1180px) {
  .home-situation-meters,
  .home-resource-grid,
  .home-track-list,
  .home-release-summary {
    grid-template-columns: 1fr;
  }

  .home-risk-stage {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 920px) {
  .home-situation-band,
  .home-risk-stage,
  .home-resource-panel,
  .home-recent-stream {
    padding: 18px;
  }

  .home-section-heading-row {
    align-items: start;
    flex-direction: column;
  }

  .home-section-copy {
    max-width: none;
    text-align: left;
  }

  .home-risk-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .home-resource-signals {
    grid-template-columns: 1fr;
  }

  .home-track-item {
    align-items: start;
    flex-direction: column;
  }

  .home-track-item span,
  .home-risk-row__state {
    white-space: normal;
  }
}
</style>
