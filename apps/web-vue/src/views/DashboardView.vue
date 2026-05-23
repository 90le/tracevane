<template>
  <div v-if="errorMessage && !hasSummary" class="status-banner status-banner-error">{{ errorMessage }}</div>
  <div v-else-if="loading && !hasSummary" class="status-banner">{{ text('正在加载首页控制面数据…', 'Loading home control surface data...') }}</div>

  <motion.section class="home-control-surface home-stage-rhythm" v-bind="pageSurfaceReveal">
    <motion.header class="home-situation-band" data-home-zone="situation" v-bind="pageMastheadReveal">
      <div class="home-situation-copy">
        <p class="eyebrow">Home</p>
        <h2 class="page-title">{{ text('Studio 总控首页', 'Studio Home Control Surface') }}</h2>
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

    <section class="home-workspace-entry" data-home-zone="entry">
      <div class="home-section-heading home-section-heading-row home-section-marker">
        <div>
          <p class="eyebrow">{{ text('Start Here', 'Start Here') }}</p>
          <h3>{{ text('常用工作入口', 'Common workspace entries') }}</h3>
        </div>
        <p class="home-section-copy">
          {{ text('把安装修复、会话和系统检查放在同一行动区，减少首页上的空占位和重复提示。', 'Keep setup, chat, and system checks in one action area with fewer empty placeholders and repeated prompts.') }}
        </p>
      </div>

      <div class="home-entry-grid">
        <RouterLink
          v-for="action in dashboardWorkspaceActions"
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
      </div>
    </section>

    <section class="home-compact-visual-strip" data-home-zone="visual">
      <div class="home-section-heading home-section-heading-row home-section-marker">
        <div>
          <p class="eyebrow">{{ text('Signal Mini Chart', 'Signal Mini Chart') }}</p>
          <h3>{{ text('轻量信号图', 'Compact signal chart') }}</h3>
        </div>
        <p class="home-section-copy">
          {{ text('用简洁条形刻度呈现覆盖率与压力面，保持首页以态势阅读为主。', 'Use compact bars to show coverage and pressure while keeping the home view overview-first.') }}
        </p>
      </div>

      <div class="home-mini-chart-grid">
        <article
          v-for="bar in dashboardCoverageBars"
          :key="bar.key"
          class="home-mini-chart"
        >
          <div class="home-mini-chart__head">
            <span>{{ bar.label }}</span>
            <strong>{{ bar.value }}</strong>
          </div>
          <div class="home-mini-chart__rail" :class="`tone-${bar.tone}`">
            <span class="home-mini-chart__fill" :style="{ width: `${bar.percent}%` }" />
          </div>
          <p class="home-mini-chart__note">{{ bar.note }}</p>
        </article>
      </div>
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
    to: '/codex-stack',
    eyebrow: 'Setup',
    label: text('安装 / 修复', 'Install / Repair'),
    copy: text('配置 Codex Stack、CPA 与健康检查', 'Configure Codex Stack, CPA, and health checks'),
  },
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

type DashboardCoverageBar = {
  key: string;
  label: string;
  value: string;
  note: string;
  percent: number;
  tone: 'low' | 'medium' | 'high';
};

const dashboardCoverageBars = computed((): DashboardCoverageBar[] => {
  const payload = summary.value;

  if (!payload) {
    return [
      {
        key: 'cli',
        label: text('CLI 覆盖率', 'CLI coverage'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        percent: 0,
        tone: 'medium',
      },
      {
        key: 'bootstrap',
        label: text('Bootstrap 可修复压力', 'Bootstrap fix pressure'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        percent: 0,
        tone: 'medium',
      },
      {
        key: 'pairing',
        label: text('设备配对待处理', 'Pending pairing queue'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        percent: 0,
        tone: 'medium',
      },
      {
        key: 'events',
        label: text('事件失败占比', 'Event failure share'),
        value: '--',
        note: text('等待数据', 'Waiting for data'),
        percent: 0,
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
      percent: cliPercent,
      tone: toneForPositiveMetric(cliPercent),
    },
    {
      key: 'bootstrap',
      label: text('Bootstrap 可修复压力', 'Bootstrap fix pressure'),
      value: String(payload.bootstrap.fixable),
      note: text('可自动修复项占当前 bootstrap 总量', 'Fixable share of current bootstrap total'),
      percent: bootstrapPercent,
      tone: toneForInverseMetric(bootstrapPercent),
    },
    {
      key: 'pairing',
      label: text('设备配对待处理', 'Pending pairing queue'),
      value: String(payload.deviceTrust.pendingRequests),
      note: text('待处理占设备信任总量', 'Pending share of device trust total'),
      percent: pairingPercent,
      tone: toneForInverseMetric(pairingPercent),
    },
    {
      key: 'events',
      label: text('事件失败占比', 'Event failure share'),
      value: String(payload.events.recentFailures),
      note: text('失败事件占近期事件总量', 'Failure share of recent event load'),
      percent: eventPercent,
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

function toneForPositiveMetric(percent: number): DashboardCoverageBar['tone'] {
  if (percent >= 70) return 'low';
  if (percent >= 40) return 'medium';
  return 'high';
}

function toneForInverseMetric(percent: number): DashboardCoverageBar['tone'] {
  if (percent >= 70) return 'high';
  if (percent >= 40) return 'medium';
  return 'low';
}

</script>

<style scoped>
.home-control-surface {
  display: grid;
  min-width: 0;
}

.home-stage-rhythm {
  gap: 20px;
}

.home-stage-rhythm > [data-home-zone] {
  position: relative;
}

.home-stage-rhythm > [data-home-zone]::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--sky) 32%, transparent), transparent 72%);
  opacity: 0.68;
  pointer-events: none;
}

.home-stage-rhythm > [data-home-zone='situation']::before {
  background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 44%, transparent), transparent 74%);
  opacity: 0.86;
}

.home-stage-rhythm > [data-home-zone='entry']::before {
  background: linear-gradient(90deg, color-mix(in srgb, var(--mint) 32%, transparent), transparent 74%);
}

.home-section-marker {
  position: relative;
  padding-top: 3px;
}

.home-section-marker::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 48px;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--acc), color-mix(in srgb, var(--sky) 44%, transparent));
  opacity: 0.8;
}

.home-situation-band,
.home-workspace-entry,
.home-compact-visual-strip,
.home-system-snapshot {
  position: relative;
  display: grid;
  gap: 16px;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
  background: var(--surface-base);
  box-shadow:
    inset 0 1px 0 color-mix(in srgb, var(--shell-highlight) 12%, transparent),
    0 12px 30px rgba(8, 18, 29, 0.08);
  overflow: hidden;
}

.home-situation-band {
  grid-template-columns: minmax(0, 0.9fr) minmax(460px, 1.1fr);
  align-items: end;
  gap: 28px;
  background:
    radial-gradient(620px 260px at 12% 0%, color-mix(in srgb, var(--accent-soft) 58%, transparent), transparent 58%),
    linear-gradient(135deg, color-mix(in srgb, var(--surface-raised) 84%, transparent), color-mix(in srgb, var(--code-bg) 12%, transparent)),
    var(--surface-raised);
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
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--shell-panel-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--shell-panel-border) 80%, transparent);
}

.home-situation-meter {
  display: grid;
  gap: 6px;
  min-width: 0;
  padding: 14px 15px 16px;
  border-radius: 0;
  border: 0;
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
}

.home-situation-meter__eyebrow,
.home-fact span,
.home-resource-signal span {
  color: var(--muted-soft);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.home-situation-meter__value {
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
.home-resource-signal p {
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
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

.home-quick-action strong,
.home-resource-signal strong,
.home-mini-chart__head strong {
  color: var(--text);
}

.home-fact-tape,
.home-entry-grid,
.home-mini-chart-grid {
  display: grid;
  gap: 10px;
}

.home-entry-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--shell-panel-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--shell-panel-border) 80%, transparent);
}

.home-quick-action {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px 16px;
  border: 0;
  border-right: 1px solid color-mix(in srgb, var(--shell-panel-border) 78%, transparent);
  border-radius: 0;
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
  color: var(--text);
  text-align: left;
  text-decoration: none;
  box-shadow: none;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.home-quick-action:last-child {
  border-right: 0;
}

.home-quick-action:hover {
  transform: translateX(2px);
  border-color: color-mix(in srgb, var(--accent-primary) 30%, var(--border-subtle));
  background: color-mix(in srgb, var(--surface-raised) 44%, transparent);
}

.home-quick-action__copy {
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

.home-compact-visual-strip {
  display: grid;
  gap: 12px;
}

.home-mini-chart-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--shell-panel-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--shell-panel-border) 80%, transparent);
}

.home-mini-chart {
  display: grid;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 0;
  border: 0;
  background: color-mix(in srgb, var(--surface-base) 88%, transparent);
}

.home-mini-chart__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.home-mini-chart__head span {
  color: var(--muted-soft);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.home-mini-chart__head strong {
  font-size: 14px;
}

.home-mini-chart__rail {
  position: relative;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--shell-panel-border) 70%, transparent);
  overflow: hidden;
}

.home-mini-chart__fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--mint);
}

.home-mini-chart__rail.tone-high .home-mini-chart__fill {
  background: #ff9a9a;
}

.home-mini-chart__rail.tone-medium .home-mini-chart__fill {
  background: #ffd6a5;
}

.home-mini-chart__rail.tone-low .home-mini-chart__fill {
  background: var(--mint);
}

.home-mini-chart__note {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.55;
}

.home-system-snapshot {
  display: grid;
  gap: 12px;
}

.home-fact,
.home-resource-signal {
  border-radius: 0;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--shell-panel-border) 78%, transparent);
  background: transparent;
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

.home-resource-signals {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px 18px;
}

.home-resource-signal {
  display: grid;
  gap: 4px;
  padding: 13px 14px;
}

@media (max-width: 1180px) {
  .home-situation-meters,
  .home-entry-grid,
  .home-fact-tape,
  .home-mini-chart-grid {
    grid-template-columns: 1fr;
  }

  .home-situation-band {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 920px) {
  .home-stage-rhythm {
    gap: 16px;
  }

  .home-situation-band,
  .home-workspace-entry,
  .home-system-snapshot {
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
}

@media (max-width: 720px) {
  .home-resource-signals {
    grid-template-columns: 1fr;
  }
}
</style>
