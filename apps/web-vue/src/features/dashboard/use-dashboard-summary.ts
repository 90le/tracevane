import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { DashboardSummaryPayload } from "../../../../../types/dashboard";
import { useLocalePreference, type Locale } from "../../shared/locale";
import { fetchDashboardSummary, subscribeDashboardSummary } from "./api";

const summary = ref<DashboardSummaryPayload | null>(null);
const loading = ref(false);
const errorMessage = ref("");
const streamConnected = ref(false);
const hasSummary = computed(
  () => summary.value !== null && summary.value.summaryReady !== false,
);

let refreshTimer: number | null = null;
let disconnectSummaryStream: (() => void) | null = null;
let consumerCount = 0;
let started = false;
let fallbackErrorMessage = () => "Failed to load home control surface.";

function applyDashboardSummary(
  payload: DashboardSummaryPayload,
  connected = false,
): void {
  summary.value = payload;
  errorMessage.value = "";
  loading.value = payload.summaryReady === false;
  streamConnected.value = connected;
}

function clearRefreshTimer(): void {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

async function loadDashboardSummary(
  silent = false,
  locale: Locale,
): Promise<void> {
  if (!silent) {
    loading.value = true;
  }
  try {
    applyDashboardSummary(await fetchDashboardSummary(locale), false);
  } catch (error) {
    streamConnected.value = false;
    if (!silent || !summary.value) {
      errorMessage.value =
        error instanceof Error ? error.message : fallbackErrorMessage();
    }
  } finally {
    if (!silent && summary.value?.summaryReady !== false) {
      loading.value = false;
    }
  }
}

function ensurePollingFallback(locale: Locale): void {
  streamConnected.value = false;
  if (typeof window === "undefined" || refreshTimer !== null) {
    return;
  }
  refreshTimer = window.setInterval(() => {
    void loadDashboardSummary(true, locale);
  }, 10_000);
}

function connectDashboardStream(locale: Locale): void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    ensurePollingFallback(locale);
    return;
  }
  disconnectSummaryStream?.();
  disconnectSummaryStream = subscribeDashboardSummary(
    (payload) => {
      clearRefreshTimer();
      applyDashboardSummary(payload, true);
    },
    () => {
      ensurePollingFallback(locale);
    },
    locale,
  );
}

function startDashboardSummary(locale: Locale): void {
  if (started) {
    return;
  }
  started = true;
  void loadDashboardSummary(false, locale);
  connectDashboardStream(locale);
}

function stopDashboardSummary(): void {
  if (consumerCount > 0) {
    return;
  }
  disconnectSummaryStream?.();
  disconnectSummaryStream = null;
  clearRefreshTimer();
  streamConnected.value = false;
  started = false;
}

export function useDashboardSummary(autoStart = true) {
  const { locale, text } = useLocalePreference();
  const currentLocale = computed(() => locale.value);
  fallbackErrorMessage = () =>
    text("读取首页控制面失败。", "Failed to load home control surface.");

  watch(currentLocale, () => {
    if (!started || !autoStart || consumerCount <= 0) {
      return;
    }
    disconnectSummaryStream?.();
    disconnectSummaryStream = null;
    clearRefreshTimer();
    void loadDashboardSummary(false, currentLocale.value);
    connectDashboardStream(currentLocale.value);
  });

  onMounted(() => {
    consumerCount += 1;
    if (autoStart && consumerCount === 1) {
      startDashboardSummary(currentLocale.value);
    }
  });

  onBeforeUnmount(() => {
    consumerCount = Math.max(0, consumerCount - 1);
    if (consumerCount === 0) {
      stopDashboardSummary();
    }
  });

  return {
    summary,
    loading,
    errorMessage,
    streamConnected,
    hasSummary,
    loadDashboardSummary: (silent = false) =>
      loadDashboardSummary(silent, currentLocale.value),
  };
}
