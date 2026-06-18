<template>
  <div v-if="errorMessage && !hasSummary" class="status-banner status-banner-error">{{ errorMessage }}</div>
  <div v-else-if="loading && !hasSummary" class="status-banner">{{ text('正在加载首页控制面数据…', 'Loading home control surface data...') }}</div>

  <motion.section class="home-control-surface home-stage-rhythm" v-bind="pageSurfaceReveal">
    <motion.header class="home-situation-band" data-home-zone="situation" v-bind="pageMastheadReveal">
      <div class="home-situation-copy">
        <p class="eyebrow">Home</p>
        <h2 class="page-title">{{ text('Tracevane 总控首页', 'Tracevane Home Control Surface') }}</h2>
        <p class="home-page-copy">
          {{ text('把运行态、安装修复和系统入口收束在同一主舞台，先看状态再进入对应工作区。', 'Bring runtime state, setup repair, and system entry points into one primary stage so users can read status first, then navigate to the right workspace.') }}
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

    <section class="home-workspace-strip" data-home-zone="entry">
      <div class="home-workspace-copy home-section-marker">
        <p class="eyebrow">{{ text('Start Here', 'Start Here') }}</p>
        <h3>{{ text('常用工作入口', 'Common workspace entries') }}</h3>
        <p class="home-section-copy">
          {{ text('先处理安装修复，再进入会话、Agent 或系统检查。首页只保留最常用动作，不再堆叠说明卡片。', 'Start with setup repair, then move into chat, agents, or system checks. Home keeps only frequent actions instead of stacked explanatory cards.') }}
        </p>
      </div>

      <nav class="home-action-list" :aria-label="text('常用工作入口', 'Common workspace entries')">
        <RouterLink
          v-for="(action, index) in dashboardWorkspaceActions"
          :key="action.to"
          :to="action.to"
          class="home-action-row"
        >
          <span class="home-action-row__index">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="home-action-row__copy">
            <span class="home-action-row__eyebrow">{{ action.eyebrow }}</span>
            <strong>{{ action.label }}</strong>
            <span class="home-action-row__note">{{ action.copy }}</span>
          </span>
          <span class="home-action-row__verb">{{ text('打开', 'Open') }}</span>
        </RouterLink>
      </nav>
    </section>

    <section class="home-system-snapshot" data-home-zone="snapshot">
      <div class="home-section-heading home-section-heading-row home-section-marker">
        <div>
          <p class="eyebrow">{{ text('System Snapshot', 'System Snapshot') }}</p>
          <h3>{{ text('紧凑系统快照', 'Compact system snapshot') }}</h3>
        </div>
        <p class="home-section-copy">
          {{ text('保留入口、版本与关键系统信号，减少重复区块。', 'Keep entry, release state, and key system signals with less visual noise.') }}
        </p>
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
          <span>{{ text('当前版本', 'Current version') }}</span>
          <strong>v{{ summary?.release.currentVersion || '--' }}</strong>
        </div>
        <div class="home-fact">
          <span>{{ text('升级状态', 'Upgrade state') }}</span>
          <strong>{{ releaseStatusLabel }}</strong>
        </div>
      </div>

      <div class="home-readiness-list" :aria-label="text('首页运行信号', 'Home readiness signals')">
        <div
          v-for="signal in dashboardReadinessSignals"
          :key="signal.key"
          class="home-readiness-row"
          :class="`tone-${signal.tone}`"
        >
          <span>{{ signal.label }}</span>
          <strong>{{ signal.value }}</strong>
          <p>{{ signal.note }}</p>
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
  </motion.section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { motion } from 'motion-v';
import { useLocalePreference } from '../shared/locale';
import { useDashboardSummary } from '../features/dashboard/use-dashboard-summary';
import { pageMastheadReveal, pageSurfaceReveal } from '../shared/motion';
import '../features/dashboard/dashboard-workspace.css';
import {
  buildDashboardOverviewSignals,
} from '../features/dashboard/overview-recipe';


const { text } = useLocalePreference();
const { summary, hasSummary, loading, errorMessage } = useDashboardSummary();

const releaseStatusLabel = computed(() => {
  if (!summary.value) return '--';
  if (summary.value.release.upgradeRunning) return text('升级中', 'Upgrading');
  if (summary.value.release.upgradeStatus === 'failed') return text('升级失败', 'Upgrade failed');
  if (summary.value.release.upgradeStatus === 'succeeded') return text('已完成', 'Completed');
  if (summary.value.release.updateAvailable) return text('有新版本', 'Update available');
  return text('已最新', 'Up to date');
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
      value: payload.gateway.connected ? text('在线', 'Online') : text('离线', 'Offline'),
      label: text('实时链路', 'Realtime link'),
      note: payload.transport.mode === 'gateway'
        ? text(`单口 ${payload.transport.basePath}`, `Single-port ${payload.transport.basePath}`)
        : text(`独立端口 ${payload.transport.standalonePort}`, `Standalone ${payload.transport.standalonePort}`),
    },
  ];
});

const dashboardWorkspaceActions = computed(() => [
  {
    to: '/chat',
    eyebrow: 'Chat',
    label: text('会话工作台', 'Chat workspace'),
    copy: text('新建、继续会话并检索历史记录', 'Start, continue, and search conversation records'),
  },
  {
    to: '/agents',
    eyebrow: 'Agents',
    label: text('Agents', 'Agents'),
    copy: text('查看 Agent 状态概览', 'View agent status overview'),
  },
  {
    to: '/system',
    eyebrow: 'System',
    label: text('System', 'System'),
    copy: text('查看系统运行概览', 'View system overview'),
  },
]);

const dashboardSystemSignals = computed(() => buildDashboardOverviewSignals({
  payload: summary.value,
  text,
  formatUptime,
}));

type DashboardReadinessSignal = {
  key: string;
  label: string;
  value: string;
  note: string;
  tone: 'low' | 'medium' | 'high';
};

const dashboardReadinessSignals = computed((): DashboardReadinessSignal[] => {
  const payload = summary.value;

  if (!payload) {
    return [
      {
        key: 'cli',
        label: text('CLI 覆盖率', 'CLI coverage'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        tone: 'medium',
      },
      {
        key: 'bootstrap',
        label: text('Bootstrap 可修复压力', 'Bootstrap fix pressure'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        tone: 'medium',
      },
      {
        key: 'pairing',
        label: text('设备配对待处理', 'Pending pairing queue'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        tone: 'medium',
      },
      {
        key: 'events',
        label: text('事件失败占比', 'Event failure share'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        tone: 'medium',
      },
    ];
  }

  const cliExpected = Math.max(payload.runtime.expectedCliCount, 1);
  const cliPercent = clampPercent((payload.runtime.installedCliCount / cliExpected) * 100);

  const bootstrapBase = payload.bootstrap.errors + payload.bootstrap.warnings + payload.bootstrap.fixable;
  const bootstrapPercent = clampPercent((payload.bootstrap.fixable / Math.max(bootstrapBase, 1)) * 100);

  const pairingQueueBase = payload.deviceTrust.pendingRequests + (payload.deviceTrust.helperPaired ? 1 : 0);
  const pairingPercent = clampPercent((payload.deviceTrust.pendingRequests / Math.max(pairingQueueBase, 1)) * 100);

  const eventTotal = payload.events.recentFailures + payload.events.pendingAuditItems;
  const eventPercent = clampPercent((payload.events.recentFailures / Math.max(eventTotal, 1)) * 100);

  return [
    {
      key: 'cli',
      label: text('CLI 覆盖率', 'CLI coverage'),
      value: `${payload.runtime.installedCliCount}/${payload.runtime.expectedCliCount}`,
      note: text('安装数量 / 期望数量', 'Installed / expected'),
      tone: toneForPositiveMetric(cliPercent),
    },
    {
      key: 'bootstrap',
      label: text('Bootstrap 可修复压力', 'Bootstrap fix pressure'),
      value: String(payload.bootstrap.fixable),
      note: text('可自动修复项占当前 bootstrap 总量', 'Fixable share of current bootstrap total'),
      tone: toneForInverseMetric(bootstrapPercent),
    },
    {
      key: 'pairing',
      label: text('设备配对待处理', 'Pending pairing queue'),
      value: String(payload.deviceTrust.pendingRequests),
      note: text('待处理占设备信任总量', 'Pending share of device trust total'),
      tone: toneForInverseMetric(pairingPercent),
    },
    {
      key: 'events',
      label: text('事件失败占比', 'Event failure share'),
      value: String(payload.events.recentFailures),
      note: text('失败事件占近期事件总量', 'Failure share of recent event load'),
      tone: toneForInverseMetric(eventPercent),
    },
  ];
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

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneForPositiveMetric(percent: number): DashboardReadinessSignal['tone'] {
  if (percent >= 70) return 'low';
  if (percent >= 40) return 'medium';
  return 'high';
}

function toneForInverseMetric(percent: number): DashboardReadinessSignal['tone'] {
  if (percent >= 70) return 'high';
  if (percent >= 40) return 'medium';
  return 'low';
}

</script>
