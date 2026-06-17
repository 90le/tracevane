import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchStore } from '@/features/terminal/search-store';

vi.mock('@/lib/api-client', () => ({
  joinApiPath: (p: string) => p,
  requestJson: vi.fn(),
}));

import { requestJson } from '@/lib/api-client';

describe('useSearchStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('空查询清空结果', async () => {
    const s = useSearchStore();
    await s.search('');
    expect(s.results).toEqual([]);
  });

  it('有查询填充结果', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue({
      results: [{ path: '/a.ts', name: 'a.ts', kind: 'file', directoryPath: '/' }],
    });
    const s = useSearchStore();
    await s.search('a');
    expect(s.results).toHaveLength(1);
    expect(s.query).toBe('a');
  });

  it('失败设置 errorMessage', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('search down'));
    const s = useSearchStore();
    await s.search('x');
    expect(s.errorMessage).toBe('search down');
  });
});
