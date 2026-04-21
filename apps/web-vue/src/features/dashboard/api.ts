import { joinApiPath, requestJson } from "../../shared/api";
import type { DashboardSummaryPayload } from "../../../../../types/dashboard";

function normalizeDashboardSummary(
  input: DashboardSummaryPayload | null | undefined,
): DashboardSummaryPayload {
  const payload = input || ({} as DashboardSummaryPayload);

  return {
    ...payload,
    summaryReady: payload.summaryReady !== false,
    recovery: {
      ...payload.recovery,
      items: Array.isArray(payload.recovery?.items)
        ? payload.recovery.items
        : [],
    },
    trends: {
      ...payload.trends,
      points: Array.isArray(payload.trends?.points)
        ? payload.trends.points
        : [],
      panels: Array.isArray(payload.trends?.panels)
        ? payload.trends.panels
        : [],
    },
    domains: Array.isArray(payload.domains) ? payload.domains : [],
  } as DashboardSummaryPayload;
}

export async function fetchDashboardSummary(
  locale: "zh" | "en",
): Promise<DashboardSummaryPayload> {
  return normalizeDashboardSummary(
    await requestJson<DashboardSummaryPayload>(
      `/api/dashboard/summary?locale=${locale}`,
    ),
  );
}

export function subscribeDashboardSummary(
  onSummary: (payload: DashboardSummaryPayload) => void,
  onError: ((error: Error) => void) | undefined,
  locale: "zh" | "en",
): () => void {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }

  const source = new EventSource(
    joinApiPath(`/api/stream/dashboard?locale=${locale}`),
    {
      withCredentials: true,
    },
  );

  source.addEventListener("summary", (event) => {
    try {
      const payload = normalizeDashboardSummary(
        JSON.parse(
          String((event as MessageEvent).data || ""),
        ) as DashboardSummaryPayload,
      );
      onSummary(payload);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error("Failed to parse dashboard summary stream event."),
      );
    }
  });

  source.onerror = () => {
    onError?.(new Error("Dashboard stream disconnected."));
  };

  return () => {
    try {
      source.close();
    } catch {
      // ignore close failure
    }
  };
}
