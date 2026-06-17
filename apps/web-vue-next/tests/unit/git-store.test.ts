import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useGitStore } from '@/features/terminal/git-store';

vi.mock('@/lib/api-client', () => ({
  joinApiPath: (p: string) => p,
  requestJson: vi.fn(),
}));

import { requestJson } from '@/lib/api-client';

describe('useGitStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('初始状态无 status', () => {
    const g = useGitStore();
    expect(g.status).toBeNull();
  });

  it('loadStatus 填充 status（available + branch）', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue({
      available: true,
      branch: 'main',
      changes: [{ path: 'a.ts', kind: 'modified', staged: false, unstaged: true, status: 'M', previousPath: null }],
    });
    const g = useGitStore();
    await g.loadStatus();
    expect(g.status?.available).toBe(true);
    expect(g.status?.branch).toBe('main');
    expect(g.status?.changes).toHaveLength(1);
  });

  it('loadStatus 失败设置 errorMessage', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('git error'));
    const g = useGitStore();
    await g.loadStatus();
    expect(g.errorMessage).toBe('git error');
  });

  it('stagePath 调用 stage 端点并刷新', async () => {
    (requestJson as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({}) // stage 响应
      .mockResolvedValueOnce({ available: true, branch: 'main', changes: [] }); // 刷新
    const g = useGitStore();
    await g.stagePath('a.ts');
    expect(requestJson).toHaveBeenCalledTimes(2);
  });
});
