<template>
  <section class="page-shell system-page system-control-surface">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">System</p>
        <h2 class="page-title">{{ text('系统状态', 'System Status') }}</h2>
      </div>

      <div class="page-actions">
        <button type="button" class="secondary-button" :disabled="loading" @click="refreshOverview">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新状态', 'Refresh status') }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="loading && !loaded" class="status-banner">
      {{ text('正在加载轻量系统状态...', 'Loading lightweight system status...') }}
    </div>

    <section class="system-control-grid">
      <aside class="system-health-strip system-control-tower-rail">
        <article class="system-sidebar-panel">
          <div class="system-sidebar-head">
            <div>
              <p class="eyebrow">{{ text('POSTURE', 'POSTURE') }}</p>
              <h3 class="system-sidebar-title">{{ text('当前状态', 'Current Status') }}</h3>
            </div>
          </div>

          <div class="system-status-stack">
            <div class="system-status-row">
              <StatusPill
                :label="health.gatewayConnected ? text('Gateway 在线', 'Gateway Online') : text('Gateway 离线', 'Gateway Offline')"
                :tone="health.gatewayConnected ? 'sage' : 'accent'"
              />
              <span class="system-chip">{{ recovery.status }}</span>
            </div>
            <div class="system-status-row">
              <span class="system-chip">Node {{ health.nodeVersion }}</span>
              <span class="system-chip">{{ health.platform }} / {{ health.arch }}</span>
            </div>
            <div class="system-status-row">
              <span class="system-chip">{{ health.hostname }}</span>
              <span class="system-chip">{{ text('连接', 'SSE') }} {{ health.sseConnections }}</span>
            </div>
          </div>

          <div class="system-sidebar-summary">
            <div class="system-summary-item">
              <span>{{ text('恢复状态', 'Recovery Status') }}</span>
              <strong>{{ recovery.status }}</strong>
            </div>
            <div class="system-summary-item">
              <span>{{ text('失败时长', 'Failure Duration') }}</span>
              <strong>{{ formatDuration(recovery.probe.failureDurationMs) }}</strong>
            </div>
            <div class="system-summary-item">
              <span>{{ text('升级状态', 'Upgrade Status') }}</span>
              <strong>{{ studioUpgrade.status }}</strong>
            </div>
          </div>

          <nav class="system-action-list" :aria-label="text('系统工作入口', 'System workspace entries')">
            <button type="button" class="system-action-row" @click="router.push('/system/recovery')">
              <span class="system-action-row__index">01</span>
              <span class="system-action-row__copy">
                <strong>{{ text('自愈守护进程', 'Recovery Daemon') }}</strong>
                <span>{{ text('管理自动恢复、备份和显式修复', 'Manage automatic recovery, backups, and explicit repairs') }}</span>
              </span>
              <span class="system-action-row__verb">{{ text('打开', 'Open') }}</span>
            </button>
            <button type="button" class="system-action-row" @click="router.push('/terminal')">
              <span class="system-action-row__index">02</span>
              <span class="system-action-row__copy">
                <strong>{{ text('维护终端', 'Terminal') }}</strong>
                <span>{{ text('进入命令执行和恢复会话', 'Open command execution and recovery sessions') }}</span>
              </span>
              <span class="system-action-row__verb">{{ text('打开', 'Open') }}</span>
            </button>
            <button type="button" class="system-action-row" @click="router.push('/config')">
              <span class="system-action-row__index">03</span>
              <span class="system-action-row__copy">
                <strong>{{ text('系统配置', 'System Config') }}</strong>
                <span>{{ text('查看本地配置和 Studio 传输模式', 'Review local config and Studio transport mode') }}</span>
              </span>
              <span class="system-action-row__verb">{{ text('打开', 'Open') }}</span>
            </button>
          </nav>
        </article>
      </aside>

      <section class="system-main-stage">
        <article class="system-topic-rail">
          <div class="system-stage-head">
            <div>
              <p class="eyebrow">{{ text('LIGHTWEIGHT', 'LIGHTWEIGHT') }}</p>
              <h3 class="system-stage-title">{{ text('默认只读概览', 'Default read-only overview') }}</h3>
              <p>{{ text('本页只读取轻量接口；需要修复时进入自愈页。', 'This page reads only lightweight endpoints; use Recovery for repairs.') }}</p>
            </div>

            <div class="system-stage-facts">
              <div class="system-stage-fact">
                <span>PID</span>
                <strong>{{ health.pid || '-' }}</strong>
              </div>
              <div class="system-stage-fact">
                <span>{{ text('Gateway 端口', 'Gateway Port') }}</span>
                <strong>{{ health.gatewayPort || '-' }}</strong>
              </div>
              <div class="system-stage-fact">
                <span>{{ text('自愈服务', 'Recovery Service') }}</span>
                <strong>{{ recovery.service.installed ? text('已安装', 'Installed') : text('未安装', 'Not installed') }}</strong>
              </div>
            </div>
          </div>
        </article>

        <article class="system-stage-panel">
          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('运行信号', 'Runtime Signals') }}</h3>
                <p>{{ text('来自基础健康检查和恢复状态文件。', 'Sourced from basic health checks and the recovery state file.') }}</p>
              </div>
            </div>

            <div class="system-overview-grid">
              <div class="system-overview-item">
                <span>Gateway</span>
                <strong>{{ health.gatewayConnected ? text('在线', 'Online') : text('离线', 'Offline') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>systemd</span>
                <strong>{{ health.serviceState }} / {{ health.serviceSubState }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('自愈状态', 'Recovery Status') }}</span>
                <strong>{{ recovery.status }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Gateway 探测', 'Gateway Probe') }}</span>
                <strong>{{ gatewayProbeLabel }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('上次探测', 'Last Probe') }}</span>
                <strong>{{ formatDate(recovery.probe.checkedAt) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('下次探测', 'Next Probe') }}</span>
                <strong>{{ formatDate(recovery.probe.nextCheckAt) }}</strong>
              </div>
            </div>
          </section>

          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('服务与升级', 'Service and Upgrade') }}</h3>
                <p>{{ text('这里只展示状态，不从概览页触发修复。', 'This panel shows state only and does not trigger repairs from the overview.') }}</p>
              </div>
            </div>

            <div class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('自愈服务状态', 'Recovery Service State') }}</span>
                <strong>{{ recovery.service.activeState }} / {{ recovery.service.enabledState }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Supervisor', 'Supervisor') }}</span>
                <strong>{{ recovery.service.supervisor }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('最近心跳', 'Heartbeat') }}</span>
                <strong>{{ formatDate(recovery.daemon.heartbeatAt) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('升级状态', 'Upgrade Status') }}</span>
                <strong>{{ studioUpgrade.status }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('目标版本', 'Target Version') }}</span>
                <strong>{{ studioUpgrade.targetVersion || '-' }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('任务日志', 'Upgrade Log') }}</span>
                <strong>{{ studioUpgrade.logFile || '-' }}</strong>
              </div>
            </div>
          </section>
        </article>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onActivated, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { OpenClawRecoveryStatusPayload } from '../../../../../types/openclaw-recovery';
import type {
  SystemHealthPayload,
  SystemStudioUpgradeStatusPayload,
} from '../../../../../types/system';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchOpenClawRecoveryStatus,
  fetchStudioUpgradeStatus,
  fetchSystemHealth,
} from './api';
import './system-workspace.css';

const router = useRouter();
const route = useRoute();
const { text } = useLocalePreference();
const isSystemRouteActive = computed(() => route.path === '/system');

const health = ref<SystemHealthPayload>(normalizeHealth({}));
const studioUpgrade = ref<SystemStudioUpgradeStatusPayload>(normalizeStudioUpgradeStatus({}));
const recovery = ref<OpenClawRecoveryStatusPayload>(normalizeRecoveryStatus({}));
const loading = ref(false);
const loaded = ref(false);
const errorMessage = ref('');
let systemPageBootstrapped = false;

const gatewayProbeLabel = computed(() => {
  if (recovery.value.probe.gatewayReachable === null) {
    return text('未知', 'Unknown');
  }
  return recovery.value.probe.gatewayReachable
    ? text('正常', 'OK')
    : text('失败', 'Failed');
});

function normalizeHealth(payload: Record<string, any>): SystemHealthPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    gateway: payload.gatewayConnected === true || payload.gateway === 'online' ? 'online' : 'offline',
    gatewayConnected: payload.gatewayConnected === true || payload.gateway === 'online',
    pid: Number(payload.pid || 0),
    version: String(payload.version || 'unknown'),
    nodeVersion: String(payload.nodeVersion || payload.node || 'unknown'),
    platform: String(payload.platform || 'unknown'),
    arch: String(payload.arch || 'unknown'),
    hostname: String(payload.hostname || 'localhost'),
    uptime: Number(payload.uptime || 0),
    port: Number(payload.port || 0),
    gatewayPort: Number(payload.gatewayPort || 0),
    sseConnections: Number(payload.sseConnections || 0),
    serviceState: String(payload.serviceState || 'unknown'),
    serviceSubState: String(payload.serviceSubState || 'unknown'),
    cpus: Number(payload.cpus || 0),
    loadavg: Array.isArray(payload.loadavg) ? payload.loadavg.map(Number) : [],
    totalMemoryBytes: Number(payload.totalMemoryBytes || 0),
    freeMemoryBytes: Number(payload.freeMemoryBytes || 0),
  };
}

function normalizeStudioUpgradeStatus(payload: Record<string, any>): SystemStudioUpgradeStatusPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    status: payload.status === 'running' || payload.status === 'succeeded' || payload.status === 'failed'
      ? payload.status
      : 'idle',
    running: payload.running === true,
    pid: Number.isFinite(Number(payload.pid)) ? Number(payload.pid) : null,
    mode: payload.mode === 'standalone' || payload.mode === 'gateway' ? payload.mode : null,
    targetVersion: payload.targetVersion ? String(payload.targetVersion) : null,
    startedAt: payload.startedAt ? String(payload.startedAt) : null,
    finishedAt: payload.finishedAt ? String(payload.finishedAt) : null,
    logFile: String(payload.logFile || ''),
    lastError: String(payload.lastError || ''),
  };
}

function normalizeRecoveryStatus(payload: Record<string, any>): OpenClawRecoveryStatusPayload {
  return {
    checkedAt: String(payload.checkedAt || new Date().toISOString()),
    status: payload.status === 'healthy' || payload.status === 'degraded' || payload.status === 'repairing' || payload.status === 'failed'
      ? payload.status
      : 'unknown',
    daemon: {
      pid: Number.isFinite(Number(payload.daemon?.pid)) ? Number(payload.daemon.pid) : null,
      startedAt: payload.daemon?.startedAt ? String(payload.daemon.startedAt) : null,
      heartbeatAt: payload.daemon?.heartbeatAt ? String(payload.daemon.heartbeatAt) : null,
      version: String(payload.daemon?.version || ''),
    },
    probe: {
      gatewayReachable: typeof payload.probe?.gatewayReachable === 'boolean' ? payload.probe.gatewayReachable : null,
      checkedAt: payload.probe?.checkedAt ? String(payload.probe.checkedAt) : null,
      failureStartedAt: payload.probe?.failureStartedAt ? String(payload.probe.failureStartedAt) : null,
      failureDurationMs: Number(payload.probe?.failureDurationMs || 0),
      nextCheckAt: payload.probe?.nextCheckAt ? String(payload.probe.nextCheckAt) : null,
    },
    policy: {
      enabled: payload.policy?.enabled !== false,
      checkIntervalMs: Number(payload.policy?.checkIntervalMs || 30000),
      probeTimeoutMs: Number(payload.policy?.probeTimeoutMs || 500),
      failureThresholdMs: Number(payload.policy?.failureThresholdMs || 180000),
      repairCooldownMs: Number(payload.policy?.repairCooldownMs || 300000),
      runDoctorFix: payload.policy?.runDoctorFix === true,
      maxBackups: Number(payload.policy?.maxBackups || 20),
    },
    lastRepair: payload.lastRepair || null,
    service: {
      supervisor: payload.service?.supervisor || 'unknown',
      serviceName: String(payload.service?.serviceName || 'openclaw-recovery-daemon'),
      configPath: String(payload.service?.configPath || ''),
      installed: payload.service?.installed === true,
      activeState: String(payload.service?.activeState || 'unknown'),
      enabledState: String(payload.service?.enabledState || 'unknown'),
      lastCheckedAt: payload.service?.lastCheckedAt ? String(payload.service.lastCheckedAt) : null,
      template: payload.service?.template,
    },
    notes: Array.isArray(payload.notes) ? payload.notes.map(String) : [],
  };
}

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None yet');
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0s';
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

async function refreshOverview(): Promise<void> {
  if (!isSystemRouteActive.value || loading.value) return;
  loading.value = true;
  errorMessage.value = '';
  try {
    const [nextHealth, nextUpgrade, nextRecovery] = await Promise.all([
      fetchSystemHealth(),
      fetchStudioUpgradeStatus(),
      fetchOpenClawRecoveryStatus(),
    ]);
    if (!isSystemRouteActive.value) return;
    health.value = normalizeHealth(nextHealth as unknown as Record<string, any>);
    studioUpgrade.value = normalizeStudioUpgradeStatus(nextUpgrade as unknown as Record<string, any>);
    recovery.value = normalizeRecoveryStatus(nextRecovery as unknown as Record<string, any>);
    loaded.value = true;
  } catch (error) {
    if (!isSystemRouteActive.value) return;
    errorMessage.value = error instanceof Error ? error.message : text('加载系统状态失败。', 'Failed to load system status.');
  } finally {
    loading.value = false;
  }
}

function activateSystemPage(): void {
  if (!isSystemRouteActive.value) return;
  if (systemPageBootstrapped) {
    void refreshOverview();
    return;
  }
  systemPageBootstrapped = true;
  void refreshOverview();
}

onMounted(activateSystemPage);
onActivated(activateSystemPage);
</script>
