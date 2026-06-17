import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useDashboardStore } from '@/features/dashboard/dashboard-store';

// mock api-client，避免单测打真实网络
vi.mock('@/lib/api-client', () => ({
  joinApiPath: (p: string) => p,
  requestJson: vi.fn(),
}));

import { requestJson } from '@/lib/api-client';

describe('useDashboardStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('初始状态：无 summary，未加载', () => {
    const store = useDashboardStore();
    expect(store.summary).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.hasSummary).toBe(false);
  });

  it('load 成功后填充 summary 且 hasSummary 为 true', async () => {
    const mockPayload = {
      summaryReady: true,
      checkedAt: '2026-06-17T10:00:00Z',
      server: { name: 'studio', version: '0.1.70', port: 3760, pid: 1, nodeVersion: '20', uptime: 100 },
      gateway: { port: 3760, url: '', connected: true },
      counts: { agents: 5, channels: 3, bindings: 2, cronJobs: 4, skills: 10, enabledSkills: 7 },
      transport: { mode: 'standalone', standalonePort: 3760, gatewayPort: 0, basePath: '', entryUrl: 'http://x', healthUrl: 'http://x/h' },
      release: { currentVersion: '0.1.70', latestVersion: null, updateAvailable: false, upgradeRunning: false, upgradeStatus: 'idle', targetVersion: null, source: null },
      bootstrap: { ready: true, errors: 0, warnings: 0, fixable: 0 },
      deviceTrust: { helperConfigured: false, helperPaired: false, pendingRequests: 0, autoApproveLocalHelper: false },
      runtime: { installedCliCount: 3, expectedCliCount: 3 },
      events: { recentFailures: 0, pendingAuditItems: 0, recentRecoveries: 0, latestFailureTitle: null, latestAuditTitle: null, latestRecoveryTitle: null },
      terminalWorkspace: { totalSessions: 0, recoverableSessions: 0, detachedSessions: 0, runningSessions: 0, latestSessionId: null, latestSessionTitle: null, latestSessionUpdatedAt: null, latestCommandHint: null, latestError: null },
      recovery: { total: 0, items: [] },
      domains: [],
    };
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue(mockPayload);

    const store = useDashboardStore();
    await store.load('zh');
    expect(store.summary).not.toBeNull();
    expect(store.hasSummary).toBe(true);
    expect(store.errorMessage).toBe('');
    expect(store.summary?.counts.agents).toBe(5);
  });

  it('load 失败时设置 errorMessage', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));
    const store = useDashboardStore();
    await store.load('zh');
    expect(store.summary).toBeNull();
    expect(store.errorMessage).toBe('network down');
    expect(store.hasSummary).toBe(false);
  });
});
