<template>
  <section v-if="detail && agentId" class="agents-stage-view">
    <div class="agents-stage-task-head">
      <div>
        <p class="eyebrow">{{ agentId }}</p>
        <h3>{{ text('会话管理', 'Session Management') }}</h3>
        <p>{{ text('当前页面只处理会话监控、查看和清理。', 'This page only handles session monitoring, inspection, and cleanup.') }}</p>
      </div>

      <div class="page-actions">
        <button type="button" class="danger-link" :disabled="sessionBusy || !detail.recentSessions.length" @click="clearAllSessions">
          {{ sessionBusy ? text('处理中...', 'Working...') : text('清空全部会话', 'Clear all sessions') }}
        </button>
      </div>
    </div>

    <article v-if="noticeMessage" class="panel-card">{{ noticeMessage }}</article>
    <article v-if="errorMessage" class="panel-card">{{ errorMessage }}</article>

    <article class="panel-card agents-stage-panel">
      <div class="agents-section-head">
        <div>
          <h3>{{ text('最近会话', 'Recent Sessions') }}</h3>
          <p>{{ text('这里集中查看、打开和清理当前 Agent 的会话记录。', 'Inspect, open, and clean up sessions for the current agent here.') }}</p>
        </div>
      </div>

      <div class="agents-summary-strip agents-session-summary-strip">
        <span class="agents-summary-pill">{{ text(`会话 ${detail.sessions.count}`, `${detail.sessions.count} sessions`) }}</span>
        <span class="agents-summary-pill">{{ text(`输入 ${detail.sessions.inputTokens}`, `Input ${detail.sessions.inputTokens}`) }}</span>
        <span class="agents-summary-pill">{{ text(`输出 ${detail.sessions.outputTokens}`, `Output ${detail.sessions.outputTokens}`) }}</span>
        <span class="agents-summary-pill">{{ text('最后路由', 'Last route') }} · {{ detail.sessions.lastRoute || text('暂无', 'None yet') }}</span>
      </div>

      <div v-if="detail.recentSessions.length" class="agents-session-table">
        <div class="agents-session-body agents-session-card-list">
          <article v-for="session in detail.recentSessions" :key="session.id" class="agents-session-row agents-session-card">
            <div class="agents-session-primary">
              <strong>{{ session.sessionId || session.routeKey }}</strong>
              <p>{{ session.chatType || text('未标记类型', 'No chat type') }}</p>
              <p class="agents-session-path">{{ session.sessionFile || text('未记录文件', 'No file recorded') }}</p>
            </div>
            <div class="agents-session-stack agents-session-route">
              <strong>{{ session.lastRoute || text('暂无路由', 'No route yet') }}</strong>
              <p>{{ session.routeKey || text('未记录 route key', 'Route key unknown') }}</p>
            </div>
            <div class="agents-session-stack agents-session-usage">
              <strong>{{ session.model || text('未记录模型', 'Model unknown') }}</strong>
              <p>{{ text(`总 ${session.totalTokens} / 入 ${session.inputTokens} / 出 ${session.outputTokens}`, `Total ${session.totalTokens} / In ${session.inputTokens} / Out ${session.outputTokens}`) }}</p>
              <p>{{ text(`缓存 ${session.cacheRead} / ${session.cacheWrite}`, `Cache ${session.cacheRead} / ${session.cacheWrite}`) }}</p>
            </div>
            <div class="agents-session-actions">
              <span class="agents-session-subtle">{{ formatDate(session.updatedAt) }}</span>
              <button type="button" class="secondary-button compact-button" @click="openChatSession(session)">
                {{ text('打开会话', 'Open Chat') }}
              </button>
              <button type="button" class="danger-link compact-button" :disabled="sessionBusy" @click="removeSession(session.id)">
                {{ text('删除', 'Delete') }}
              </button>
            </div>
          </article>
        </div>
      </div>
      <div v-else class="empty-inline">
        {{ text('当前没有最近会话记录。', 'No recent sessions found for this agent.') }}
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AgentDetailPayload, AgentSessionSummary } from '../../../../../types/agents';
import { useLocalePreference } from '../../shared/locale';
import { encodeChatSessionRef } from '../chat/session-ref';
import { clearAgentSessions, deleteAgentSession, fetchAgentDetail } from './api';

defineOptions({ name: 'AgentSessionsPage' });

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();

const agentId = computed(() => String(route.params.agentId || ''));
const detail = ref<AgentDetailPayload | null>(null);
const sessionBusy = ref(false);
const errorMessage = ref('');
const noticeMessage = ref('');

function formatDate(value: string | null): string {
  if (!value) return text('暂无', 'None yet');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function openChatSession(session: AgentSessionSummary): void {
  const sessionRef = session.sessionId || session.routeKey;
  if (!sessionRef) return;
  void router.push(`/chat/s/${encodeChatSessionRef(sessionRef)}`);
}

async function loadDetail(): Promise<void> {
  if (!agentId.value) return;
  errorMessage.value = '';
  noticeMessage.value = '';
  detail.value = await fetchAgentDetail(agentId.value);
}

async function clearAllSessions(): Promise<void> {
  if (!agentId.value) return;
  const ok = window.confirm(
    text(
      `确定清空 Agent "${agentId.value}" 的全部会话吗？这会删除当前会话索引和会话日志文件。`,
      `Clear all sessions for "${agentId.value}"? This removes the session index and session log files.`
    )
  );
  if (!ok) return;

  sessionBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const response = await clearAgentSessions(agentId.value);
    if (response.detail) {
      detail.value = response.detail;
    }
    noticeMessage.value = response.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('清空全部会话失败。', 'Failed to clear all sessions.');
  } finally {
    sessionBusy.value = false;
  }
}

async function removeSession(sessionId: string): Promise<void> {
  if (!agentId.value || !sessionId) return;
  const ok = window.confirm(
    text(
      '确定删除这条会话吗？该操作不可恢复。',
      'Delete this session? This action cannot be undone.'
    )
  );
  if (!ok) return;

  sessionBusy.value = true;
  errorMessage.value = '';
  noticeMessage.value = '';
  try {
    const response = await deleteAgentSession(agentId.value, sessionId);
    if (response.detail) {
      detail.value = response.detail;
    }
    noticeMessage.value = response.message;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : text('删除会话失败。', 'Failed to delete session.');
  } finally {
    sessionBusy.value = false;
  }
}

watch(
  () => route.params.agentId,
  async () => {
    detail.value = null;
    if (!agentId.value) return;
    try {
      await loadDetail();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : text('读取 Agent 会话失败。', 'Failed to load agent sessions.');
    }
  },
  { immediate: true },
);
</script>
