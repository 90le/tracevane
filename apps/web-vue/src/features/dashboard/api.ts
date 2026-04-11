import { joinApiPath, requestJson } from '../../shared/api';
import type { DashboardSummaryPayload } from '../../../../../types/dashboard';

export function fetchDashboardSummary(): Promise<DashboardSummaryPayload> {
  return requestJson<DashboardSummaryPayload>('/api/dashboard/summary');
}

export function subscribeDashboardSummary(
  onSummary: (payload: DashboardSummaryPayload) => void,
  onError?: (error: Error) => void,
): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  const source = new EventSource(joinApiPath('/api/stream/dashboard'), {
    withCredentials: true,
  });

  source.addEventListener('summary', (event) => {
    try {
      const payload = JSON.parse(String((event as MessageEvent).data || '')) as DashboardSummaryPayload;
      onSummary(payload);
    } catch (error) {
      onError?.(
        error instanceof Error
          ? error
          : new Error('Failed to parse dashboard summary stream event.'),
      );
    }
  });

  source.onerror = () => {
    onError?.(new Error('Dashboard stream disconnected.'));
  };

  return () => {
    try {
      source.close();
    } catch {
      // ignore close failure
    }
  };
}
