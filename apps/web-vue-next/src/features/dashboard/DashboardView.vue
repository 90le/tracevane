<!-- features/dashboard/DashboardView.vue
     仪表盘 —— 材质派，消费真实 DashboardSummaryPayload。
     层次：主对象(系统健康 hero) → 关联层(指标卡 + 系统快照)。
     数据来源：useDashboardStore（fetch + SSE 实时流）。 -->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, computed } from 'vue';
import { useDashboardStore } from './dashboard-store';
import type { DashboardSummaryPayload } from '../../../../../types/dashboard';

const store = useDashboardStore();

onMounted(() => store.start('zh'));
onBeforeUnmount(() => store.stop());

const s = computed<DashboardSummaryPayload | null>(() => store.summary);

// 主对象层：系统健康（gateway 在线 + 无严重故障 = 正常）
const healthOk = computed(() => s.value?.gateway.connected ?? false);
const bootstrapErrors = computed(() => s.value?.bootstrap.errors ?? 0);
const healthLabel = computed(() => {
  if (store.loading && !s.value) return '正在加载…';
  if (!s.value) return '等待数据';
  if (!healthOk.value) return '网关离线';
  if (bootstrapErrors.value > 0) return `${bootstrapErrors.value} 项需处理`;
  return '所有系统正常';
});
const healthNote = computed(() => {
  const p = s.value;
  if (!p) return '';
  const counts = [`${p.counts.agents} Agent`, `${p.counts.channels} 频道`, `${p.counts.enabledSkills} 技能`].join(' · ');
  return `${counts} · 服务端 v${p.server.version}`;
});

// 关联层：核心指标卡
const metrics = computed(() => {
  const p = s.value;
  const dash = (v: number | undefined) => (v === undefined ? '--' : String(v));
  return [
    { label: '已注册 Agent', value: dash(p?.counts.agents), sub: 'registered' },
    { label: '已启用频道', value: dash(p?.counts.channels), sub: `${p?.counts.bindings ?? '--'} bindings` },
    { label: '已启用技能', value: dash(p?.counts.enabledSkills), sub: `共 ${p?.counts.skills ?? '--'}` },
    { label: '定时任务', value: dash(p?.counts.cronJobs), sub: 'cron jobs' },
  ];
});

// 关联层：系统快照（运行时 + bootstrap + 事件）
const snapshot = computed(() => {
  const p = s.value;
  if (!p) return [];
  return [
    { label: '入口', value: p.transport.entryUrl || '--' },
    { label: '健康检查', value: p.transport.healthUrl || '--' },
    { label: '当前版本', value: `v${p.release.currentVersion}` },
    { label: 'CLI 覆盖', value: `${p.runtime.installedCliCount}/${p.runtime.expectedCliCount}` },
    { label: 'Bootstrap', value: p.bootstrap.ready ? '就绪' : `${p.bootstrap.fixable} 可修复` },
    { label: '近期事件失败', value: String(p.events.recentFailures) },
  ];
});

const entry = computed(() => s.value?.transport.mode === 'gateway'
  ? `单口 ${s.value?.transport.basePath}`
  : `独立端口 ${s.value?.transport.standalonePort}`);
</script>

<template>
  <div class="dashboard">
    <!-- 错误/加载态 -->
    <div v-if="store.errorMessage && !store.hasSummary" class="dashboard__banner dashboard__banner--error">
      {{ store.errorMessage }}
    </div>
    <div v-else-if="store.loading && !store.hasSummary" class="dashboard__banner">
      正在加载控制面数据…
    </div>

    <!-- 主对象层：系统健康 -->
    <section class="hero">
      <div class="hero__glow" :class="{ 'hero__glow--ok': healthOk }">
        <span class="hero__dot" :class="{ 'hero__dot--ok': healthOk }"></span>
      </div>
      <div class="hero__text">
        <h1 class="hero__title">{{ healthLabel }}</h1>
        <p class="hero__note">{{ healthNote }}</p>
      </div>
      <div class="hero__meta">
        <span class="pill" :class="healthOk ? 'pill--ok' : 'pill--down'">
          {{ healthOk ? '健康' : '异常' }}
        </span>
        <span v-if="s" class="pill pill--plain">{{ store.streamConnected ? '实时' : '轮询' }} · {{ entry }}</span>
      </div>
    </section>

    <!-- 关联层：核心指标 -->
    <section class="metric-grid">
      <article v-for="m in metrics" :key="m.label" class="metric-card">
        <span class="metric-card__label">{{ m.label }}</span>
        <strong class="metric-card__value">{{ m.value }}</strong>
        <span class="metric-card__sub">{{ m.sub }}</span>
      </article>
    </section>

    <!-- 关联层：系统快照 -->
    <section class="snapshot">
      <div class="snapshot__head">
        <span class="snapshot__title">系统快照</span>
        <span v-if="s" class="snapshot__time">检查于 {{ new Date(s.checkedAt).toLocaleTimeString() }}</span>
      </div>
      <div class="snapshot__grid">
        <div v-for="item in snapshot" :key="item.label" class="snapshot__row">
          <span class="snapshot__key">{{ item.label }}</span>
          <span class="snapshot__val">{{ item.value }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  height: 100%;
}
.dashboard__banner {
  padding: 12px 16px;
  border-radius: var(--radius-card);
  background: var(--fill);
  color: var(--text-secondary);
  font-size: 13px;
}
.dashboard__banner--error {
  background: color-mix(in srgb, var(--sys-red) 14%, transparent);
  color: var(--sys-red);
}

/* hero —— 主对象，thick material */
.hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 22px 26px;
  background: var(--material-thick);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
}
.hero__glow {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle, color-mix(in srgb, var(--sys-red) 40%, transparent), transparent);
  flex-shrink: 0;
}
.hero__glow--ok {
  background: radial-gradient(circle, color-mix(in srgb, var(--sys-green) 40%, transparent), transparent);
}
.hero__dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--sys-red);
}
.hero__dot--ok {
  background: var(--sys-green);
  box-shadow: 0 0 14px var(--sys-green);
}
.hero__text {
  flex: 1;
  min-width: 0;
}
.hero__title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary);
}
.hero__note {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--text-secondary);
}
.hero__meta {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.pill {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
}
.pill--ok {
  color: var(--sys-green);
  background: color-mix(in srgb, var(--sys-green) 18%, transparent);
}
.pill--down {
  color: var(--sys-red);
  background: color-mix(in srgb, var(--sys-red) 18%, transparent);
}
.pill--plain {
  color: var(--text-secondary);
  background: var(--fill);
}

/* 指标卡 —— thin material */
.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 14px;
}
.metric-card {
  padding: 16px 18px;
  background: var(--material-thin);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
}
.metric-card__label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
}
.metric-card__value {
  display: block;
  margin-top: 6px;
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.metric-card__sub {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-tertiary);
}

/* 系统快照 —— thin material */
.snapshot {
  padding: 18px 20px;
  background: var(--material-thin);
  backdrop-filter: var(--blur-thin);
  -webkit-backdrop-filter: var(--blur-thin);
  border: 0.5px solid var(--hairline);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-1);
}
.snapshot__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 12px;
}
.snapshot__title {
  font-size: 13px;
  font-weight: 700;
}
.snapshot__time {
  font-size: 11px;
  color: var(--text-tertiary);
}
.snapshot__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}
.snapshot__row {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 0.5px solid var(--hairline);
  font-size: 13px;
}
.snapshot__row:last-child {
  border-bottom: none;
}
.snapshot__key {
  color: var(--text-tertiary);
}
.snapshot__val {
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
