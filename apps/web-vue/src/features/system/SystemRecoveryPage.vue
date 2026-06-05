<template>
  <section class="page-shell system-page system-control-surface">
    <header class="page-header-row">
      <div>
        <p class="eyebrow">Recovery</p>
        <h2 class="page-title">{{ text('OpenClaw 自愈', 'OpenClaw Recovery') }}</h2>
        <p class="page-copy">
          {{ text('守护进程独立于单口入口运行；Studio 健康时只负责管理和查看。', 'The daemon runs outside the single-port entry; Studio only manages and inspects it while healthy.') }}
        </p>
      </div>
      <div class="page-actions">
        <button type="button" class="secondary-button" @click="router.push('/system')">
          {{ text('返回概览', 'Back to overview') }}
        </button>
        <button type="button" class="secondary-button" :disabled="loading" @click="refreshAll">
          {{ loading ? text('刷新中...', 'Refreshing...') : text('刷新', 'Refresh') }}
        </button>
      </div>
    </header>

    <div v-if="errorMessage" class="status-banner status-banner-error">{{ errorMessage }}</div>
    <div v-else-if="notice" class="status-banner" :class="{ 'status-banner-error': notice.kind === 'error' }">{{ notice.text }}</div>

    <section class="system-control-grid">
      <aside class="system-health-strip system-control-tower-rail">
        <article class="system-sidebar-panel">
          <div class="system-sidebar-head">
            <div>
              <p class="eyebrow">{{ text('DAEMON', 'DAEMON') }}</p>
              <h3 class="system-sidebar-title">{{ recovery.status }}</h3>
            </div>
          </div>

          <div class="system-status-stack">
            <div class="system-status-row">
              <StatusPill :label="recoveryLabel" :tone="recoveryTone" />
              <span class="system-chip">{{ recovery.service.supervisor }}</span>
            </div>
            <div class="system-status-row">
              <span class="system-chip">PID {{ recovery.daemon.pid || '-' }}</span>
              <span class="system-chip">{{ recovery.service.activeState }} / {{ recovery.service.enabledState }}</span>
            </div>
          </div>

          <div class="system-sidebar-summary">
            <div class="system-summary-item">
              <span>{{ text('失败开始', 'Failure Since') }}</span>
              <strong>{{ formatDate(recovery.probe.failureStartedAt) }}</strong>
            </div>
            <div class="system-summary-item">
              <span>{{ text('失败时长', 'Failure Duration') }}</span>
              <strong>{{ formatDuration(recovery.probe.failureDurationMs) }}</strong>
            </div>
            <div class="system-summary-item">
              <span>{{ text('最近修复', 'Last Repair') }}</span>
              <strong>{{ recovery.lastRepair?.ok ? text('成功', 'Succeeded') : recovery.lastRepair ? text('失败', 'Failed') : text('暂无', 'None') }}</strong>
            </div>
          </div>

          <nav class="system-action-list" :aria-label="text('恢复动作', 'Recovery actions')">
            <button type="button" class="system-action-row" :disabled="actionBusy" @click="runManualProbe">
              <span class="system-action-row__index">01</span>
              <span class="system-action-row__copy">
                <strong>{{ text('运行轻量探测', 'Run light probe') }}</strong>
                <span>{{ text('只检查 loopback Gateway，不进入修复管线。', 'Checks loopback Gateway without entering the repair pipeline.') }}</span>
              </span>
              <span class="system-action-row__verb">{{ text('运行', 'Run') }}</span>
            </button>
            <button type="button" class="system-action-row" :disabled="actionBusy" @click="runManualRecovery">
              <span class="system-action-row__index">02</span>
              <span class="system-action-row__copy">
                <strong>{{ text('运行恢复修复', 'Run recovery repair') }}</strong>
                <span>{{ text('先备份配置，再执行保守恢复管线。', 'Backs up config before the conservative repair pipeline.') }}</span>
              </span>
              <span class="system-action-row__verb">{{ text('运行', 'Run') }}</span>
            </button>
          </nav>
        </article>
      </aside>

      <section class="system-main-stage">
        <article class="system-topic-rail">
          <div class="system-stage-head">
            <div>
              <p class="eyebrow">{{ text('AUTONOMOUS', 'AUTONOMOUS') }}</p>
              <h3 class="system-stage-title">{{ text('单口恢复控制面', 'Single-port recovery control') }}</h3>
              <p>{{ text('健康循环只做轻量探测；持续失败越过阈值后，守护进程才自动执行修复。', 'Healthy loops only run lightweight probes; sustained failures cross the threshold before repair starts.') }}</p>
            </div>
          </div>
        </article>

        <article class="system-stage-panel">
          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('守护进程服务', 'Daemon Service') }}</h3>
                <p>{{ text('Studio 负责安装和启停，恢复循环由独立用户服务持有。', 'Studio installs and controls it; the independent user service owns the recovery loop.') }}</p>
              </div>
              <div class="system-inline-actions">
                <button type="button" class="secondary-button compact-button" :disabled="serviceBusy" @click="applyServiceAction(servicePrimaryAction)">
                  {{ servicePrimaryLabel }}
                </button>
                <button v-if="recovery.service.installed" type="button" class="secondary-button compact-button" :disabled="serviceBusy" @click="applyServiceAction('install')">
                  {{ text('更新模板', 'Update template') }}
                </button>
                <button v-if="serviceRunning" type="button" class="secondary-button compact-button" :disabled="serviceBusy" @click="applyServiceAction('stop')">
                  {{ text('停止', 'Stop') }}
                </button>
              </div>
            </div>

            <div class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('服务名', 'Service Name') }}</span>
                <strong>{{ recovery.service.serviceName }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('已安装', 'Installed') }}</span>
                <strong>{{ recovery.service.installed ? text('是', 'Yes') : text('否', 'No') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Supervisor', 'Supervisor') }}</span>
                <strong>{{ recovery.service.supervisor }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('最近心跳', 'Heartbeat') }}</span>
                <strong>{{ formatDate(recovery.daemon.heartbeatAt) }}</strong>
              </div>
            </div>

            <div class="system-detail-list">
              <div class="system-detail-row">
                <span>{{ text('服务文件', 'Service File') }}</span>
                <strong>{{ recovery.service.configPath || '-' }}</strong>
              </div>
              <div class="system-detail-row">
                <span>{{ text('Active / Enabled', 'Active / Enabled') }}</span>
                <strong>{{ recovery.service.activeState }} / {{ recovery.service.enabledState }}</strong>
              </div>
            </div>
          </section>

          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('恢复策略', 'Recovery Policy') }}</h3>
                <p>{{ text('阈值、冷却和危险动作开关。', 'Thresholds, cooldowns, and risky-action switches.') }}</p>
              </div>
            </div>
            <div class="system-overview-grid">
              <div class="system-overview-item">
                <span>{{ text('自动修复', 'Auto Repair') }}</span>
                <strong>{{ recovery.policy.enabled ? text('开启', 'Enabled') : text('关闭', 'Disabled') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('探测间隔', 'Check Interval') }}</span>
                <strong>{{ formatDuration(recovery.policy.checkIntervalMs) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('失败阈值', 'Failure Threshold') }}</span>
                <strong>{{ formatDuration(recovery.policy.failureThresholdMs) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('修复冷却', 'Repair Cooldown') }}</span>
                <strong>{{ formatDuration(recovery.policy.repairCooldownMs) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('探测超时', 'Probe Timeout') }}</span>
                <strong>{{ formatDuration(recovery.policy.probeTimeoutMs) }}</strong>
              </div>
              <div class="system-overview-item">
                <span>doctor --fix</span>
                <strong>{{ recovery.policy.runDoctorFix ? text('允许', 'Allowed') : text('禁用', 'Disabled') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('CLI 自动修复', 'CLI Auto Repair') }}</span>
                <strong>{{ recovery.policy.allowCliReinstall ? text('允许', 'Allowed') : text('禁用', 'Disabled') }}</strong>
              </div>
              <div class="system-overview-item">
                <span>{{ text('Gateway 进程接管', 'Gateway Takeover') }}</span>
                <strong>{{ recovery.policy.allowGatewayProcessTakeover ? text('允许', 'Allowed') : text('禁用', 'Disabled') }}</strong>
              </div>
            </div>
          </section>

          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('修复历史', 'Repair History') }}</h3>
                <p>{{ text('仅读取恢复守护进程持久化事件。', 'Reads only persisted recovery daemon events.') }}</p>
              </div>
            </div>
            <div v-if="events.length" class="system-recovery-timeline">
              <article v-for="event in events" :key="event.id" class="system-recovery-event">
                <div>
                  <strong>{{ event.title }}</strong>
                  <p>{{ event.summary }}</p>
                  <span>{{ formatDate(event.occurredAt) }} · {{ event.status }}</span>
                </div>
                <StatusPill :label="event.severity" :tone="eventTone(event.severity)" />
              </article>
            </div>
            <div v-else class="system-callout">
              <strong>{{ text('暂无修复事件', 'No recovery events yet') }}</strong>
            </div>
            <nav v-if="eventsPagination.totalEntries > eventsPagination.pageSize" class="system-pagination" :aria-label="text('修复历史分页', 'Repair history pagination')">
              <button type="button" class="secondary-button compact-button" :disabled="loading || !eventsPagination.hasPreviousPage" @click="changeEventsPage(eventsPagination.page - 1)">
                {{ text('上一页', 'Previous') }}
              </button>
              <span>{{ paginationRangeLabel(eventsPagination) }}</span>
              <button type="button" class="secondary-button compact-button" :disabled="loading || !eventsPagination.hasNextPage" @click="changeEventsPage(eventsPagination.page + 1)">
                {{ text('下一页', 'Next') }}
              </button>
            </nav>
          </section>

          <section class="system-section">
            <div class="system-section-head">
              <div>
                <h3>{{ text('配置备份', 'Config Backups') }}</h3>
                <p>{{ text('恢复管线在改动配置前会创建备份。', 'The recovery pipeline creates a backup before config changes.') }}</p>
              </div>
            </div>
            <div v-if="backups.length" class="system-recovery-timeline">
              <article v-for="backup in backups" :key="backup.id" class="system-recovery-event">
                <div>
                  <strong>{{ backup.fileName }}</strong>
                  <p>{{ backup.path }}</p>
                  <span>{{ formatDate(backup.createdAt) }} · {{ formatBytes(backup.sizeBytes) }}</span>
                </div>
                <button type="button" class="secondary-button compact-button" :disabled="restoreBusy === backup.id" @click="restoreBackup(backup.id)">
                  {{ restoreBusy === backup.id ? text('恢复中...', 'Restoring...') : text('恢复', 'Restore') }}
                </button>
              </article>
            </div>
            <div v-else class="system-callout">
              <strong>{{ text('暂无备份', 'No backups yet') }}</strong>
            </div>
            <nav v-if="backupsPagination.totalEntries > backupsPagination.pageSize" class="system-pagination" :aria-label="text('配置备份分页', 'Config backup pagination')">
              <button type="button" class="secondary-button compact-button" :disabled="loading || !backupsPagination.hasPreviousPage" @click="changeBackupsPage(backupsPagination.page - 1)">
                {{ text('上一页', 'Previous') }}
              </button>
              <span>{{ paginationRangeLabel(backupsPagination) }}</span>
              <button type="button" class="secondary-button compact-button" :disabled="loading || !backupsPagination.hasNextPage" @click="changeBackupsPage(backupsPagination.page + 1)">
                {{ text('下一页', 'Next') }}
              </button>
            </nav>
          </section>
        </article>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import type {
  OpenClawRecoveryBackupRecord,
  OpenClawRecoveryDaemonServiceAction,
  OpenClawRecoveryEventRecord,
  OpenClawRecoveryEventSeverity,
  OpenClawRecoveryPagination,
  OpenClawRecoveryStatusPayload,
} from '../../../../../types/openclaw-recovery';
import StatusPill from '../../components/StatusPill.vue';
import { useLocalePreference } from '../../shared/locale';
import {
  applyOpenClawRecoveryDaemonServiceAction,
  fetchOpenClawRecoveryBackupsPage,
  fetchOpenClawRecoveryEventsPage,
  fetchOpenClawRecoveryStatus,
  restoreOpenClawRecoveryBackup,
  runOpenClawRecovery,
} from './api';
import './system-workspace.css';

interface Notice {
  kind: 'success' | 'error';
  text: string;
}

type StatusPillTone = 'neutral' | 'accent' | 'sage' | 'danger';

const RECOVERY_PAGE_SIZE = 8;
const router = useRouter();
const { text } = useLocalePreference();
const loading = ref(false);
const serviceBusy = ref(false);
const actionBusy = ref(false);
const restoreBusy = ref('');
const errorMessage = ref('');
const notice = ref<Notice | null>(null);
const recovery = ref<OpenClawRecoveryStatusPayload>(normalizeRecovery({}));
const events = ref<OpenClawRecoveryEventRecord[]>([]);
const backups = ref<OpenClawRecoveryBackupRecord[]>([]);
const eventsPage = ref(1);
const backupsPage = ref(1);
const eventsPagination = ref<OpenClawRecoveryPagination>(defaultPagination());
const backupsPagination = ref<OpenClawRecoveryPagination>(defaultPagination());

const recoveryLabel = computed(() => {
  if (recovery.value.status === 'healthy') return text('Recovery 正常', 'Recovery Healthy');
  if (recovery.value.status === 'repairing') return text('Recovery 修复中', 'Recovery Repairing');
  if (recovery.value.status === 'failed') return text('Recovery 故障', 'Recovery Failed');
  return text('Recovery 未知', 'Recovery Unknown');
});

const recoveryTone = computed<StatusPillTone>(() =>
  recovery.value.status === 'healthy' ? 'sage' : recovery.value.status === 'unknown' ? 'neutral' : 'accent',
);

const serviceRunning = computed(() =>
  ['active', 'running'].includes(recovery.value.service.activeState),
);

const servicePrimaryAction = computed<OpenClawRecoveryDaemonServiceAction>(() => {
  if (!recovery.value.service.installed) return 'install';
  if (serviceRunning.value) return 'restart';
  return 'start';
});

const servicePrimaryLabel = computed(() => {
  if (!recovery.value.service.installed) return text('安装', 'Install');
  if (serviceRunning.value) return text('重启', 'Restart');
  return text('启动', 'Start');
});

function normalizeRecovery(payload: Record<string, any>): OpenClawRecoveryStatusPayload {
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
      allowCliReinstall: payload.policy?.allowCliReinstall !== false,
      cliReinstallTimeoutMs: Number(payload.policy?.cliReinstallTimeoutMs || 300000),
      allowGatewayProcessTakeover: payload.policy?.allowGatewayProcessTakeover !== false,
      gatewayProcessTakeoverTimeoutMs: Number(payload.policy?.gatewayProcessTakeoverTimeoutMs || 5000),
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

function eventTone(severity: OpenClawRecoveryEventSeverity): StatusPillTone {
  if (severity === 'success') return 'sage';
  if (severity === 'error') return 'accent';
  return 'neutral';
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

function defaultPagination(page = 1): OpenClawRecoveryPagination {
  return {
    page,
    pageSize: RECOVERY_PAGE_SIZE,
    totalEntries: 0,
    totalPages: 1,
    startIndex: 0,
    endIndex: 0,
    hasPreviousPage: false,
    hasNextPage: false,
  };
}

function paginationRangeLabel(pagination: OpenClawRecoveryPagination): string {
  if (!pagination.totalEntries) return '0 / 0';
  return `${pagination.startIndex + 1}-${pagination.endIndex} / ${pagination.totalEntries}`;
}

async function refreshAll(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const [nextRecovery, nextEvents, nextBackups] = await Promise.all([
      fetchOpenClawRecoveryStatus(),
      fetchOpenClawRecoveryEventsPage(eventsPage.value, RECOVERY_PAGE_SIZE),
      fetchOpenClawRecoveryBackupsPage(backupsPage.value, RECOVERY_PAGE_SIZE),
    ]);
    recovery.value = normalizeRecovery(nextRecovery as unknown as Record<string, any>);
    events.value = Array.isArray(nextEvents.events) ? nextEvents.events : [];
    backups.value = Array.isArray(nextBackups.backups) ? nextBackups.backups : [];
    eventsPagination.value = nextEvents.pagination || defaultPagination(eventsPage.value);
    backupsPagination.value = nextBackups.pagination || defaultPagination(backupsPage.value);
    eventsPage.value = eventsPagination.value.page;
    backupsPage.value = backupsPagination.value.page;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('无法读取恢复状态。', 'Failed to load recovery status.');
  } finally {
    loading.value = false;
  }
}

async function changeEventsPage(page: number): Promise<void> {
  eventsPage.value = Math.max(1, page);
  await refreshAll();
}

async function changeBackupsPage(page: number): Promise<void> {
  backupsPage.value = Math.max(1, page);
  await refreshAll();
}

async function applyServiceAction(action: OpenClawRecoveryDaemonServiceAction): Promise<void> {
  serviceBusy.value = true;
  notice.value = null;
  try {
    const response = await applyOpenClawRecoveryDaemonServiceAction(action);
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      text: response.ok ? text('服务动作已执行。', 'Service action completed.') : response.error || text('服务动作失败。', 'Service action failed.'),
    };
    await refreshAll();
    recovery.value = normalizeRecovery({
      ...recovery.value,
      service: response.service,
    });
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('服务动作失败。', 'Service action failed.'),
    };
  } finally {
    serviceBusy.value = false;
  }
}

async function runManualProbe(): Promise<void> {
  actionBusy.value = true;
  notice.value = null;
  try {
    const response = await runOpenClawRecovery({ action: 'probe', trigger: 'manual' });
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      text: response.ok ? text('轻量探测已完成。', 'Light probe completed.') : text('轻量探测完成，Gateway 仍不可达。', 'Light probe completed; Gateway is still unreachable.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('轻量探测失败。', 'Light probe failed.'),
    };
  } finally {
    actionBusy.value = false;
  }
}

async function runManualRecovery(): Promise<void> {
  actionBusy.value = true;
  notice.value = null;
  try {
    const response = await runOpenClawRecovery({ action: 'repair', trigger: 'manual' });
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      text: response.ok ? text('手动修复已完成。', 'Manual repair completed.') : response.repair?.error || text('手动修复失败。', 'Manual repair failed.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('手动修复失败。', 'Manual repair failed.'),
    };
  } finally {
    actionBusy.value = false;
  }
}

async function restoreBackup(backupId: string): Promise<void> {
  restoreBusy.value = backupId;
  notice.value = null;
  try {
    const response = await restoreOpenClawRecoveryBackup(backupId);
    notice.value = {
      kind: response.ok ? 'success' : 'error',
      text: response.ok ? text('备份已恢复。', 'Backup restored.') : response.error || text('恢复备份失败。', 'Failed to restore backup.'),
    };
    await refreshAll();
  } catch (error) {
    notice.value = {
      kind: 'error',
      text: error instanceof Error ? error.message : text('恢复备份失败。', 'Failed to restore backup.'),
    };
  } finally {
    restoreBusy.value = '';
  }
}

onMounted(() => {
  void refreshAll();
});
</script>
