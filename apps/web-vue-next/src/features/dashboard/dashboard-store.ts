// features/dashboard/dashboard-store.ts
// Dashboard 数据层 —— Pinia store。封装 fetch + SSE 实时流。
// 复用旧壳 API 契约（/api/dashboard/summary + /api/stream/dashboard）。
// 替代旧壳 use-dashboard-summary.ts 的散落 ref + consumerCount 逻辑，用 store 统一。
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { joinApiPath, requestJson } from '@/lib/api-client';
import type { DashboardSummaryPayload } from '../../../../../types/dashboard';

const SUMMARY_PATH = '/api/dashboard/summary';
const STREAM_PATH = '/api/stream/dashboard';
const POLL_INTERVAL_MS = 10_000;

function normalize(input: DashboardSummaryPayload | null | undefined): DashboardSummaryPayload {
  const payload = input || ({} as DashboardSummaryPayload);
  return {
    ...payload,
    summaryReady: payload.summaryReady !== false,
    recovery: { ...payload.recovery, items: Array.isArray(payload.recovery?.items) ? payload.recovery.items : [] },
    domains: Array.isArray(payload.domains) ? payload.domains : [],
  } as DashboardSummaryPayload;
}

export const useDashboardStore = defineStore('dashboard', () => {
  const summary = ref<DashboardSummaryPayload | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');
  const streamConnected = ref(false);

  const hasSummary = computed(() => summary.value !== null && summary.value.summaryReady !== false);

  let eventSource: EventSource | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function load(locale: 'zh' | 'en' = 'zh', silent = false) {
    if (!silent) loading.value = true;
    try {
      summary.value = normalize(await requestJson<DashboardSummaryPayload>(`${SUMMARY_PATH}?locale=${locale}`));
      errorMessage.value = '';
      if (!silent) loading.value = false;
    } catch (e) {
      streamConnected.value = false;
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load dashboard.';
      if (!silent) loading.value = false;
    }
  }

  function connectStream(locale: 'zh' | 'en' = 'zh') {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
      ensurePoll(locale);
      return;
    }
    disconnectStream();
    eventSource = new EventSource(joinApiPath(`${STREAM_PATH}?locale=${locale}`), { withCredentials: true });
    eventSource.addEventListener('summary', (event) => {
      try {
        summary.value = normalize(JSON.parse(String((event as MessageEvent).data || '')) as DashboardSummaryPayload);
        errorMessage.value = '';
        streamConnected.value = true;
        clearPoll();
      } catch {
        /* ignore parse error */
      }
    });
    eventSource.onerror = () => {
      streamConnected.value = false;
      ensurePoll(locale);
    };
  }

  function disconnectStream() {
    try {
      eventSource?.close();
    } catch {
      /* ignore */
    }
    eventSource = null;
  }

  function clearPoll() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function ensurePoll(locale: 'zh' | 'en' = 'zh') {
    if (typeof window === 'undefined' || pollTimer) return;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      await load(locale, true);
      if (!streamConnected.value) ensurePoll(locale);
    }, POLL_INTERVAL_MS);
  }

  function start(locale: 'zh' | 'en' = 'zh') {
    void load(locale);
    connectStream(locale);
  }

  function stop() {
    disconnectStream();
    clearPoll();
    streamConnected.value = false;
  }

  return { summary, loading, errorMessage, streamConnected, hasSummary, load, start, stop };
});
