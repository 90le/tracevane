import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTerminalStore } from '@/features/terminal/terminal-store';
import { useFilesStore } from '@/features/terminal/files-store';

vi.mock('@/lib/api-client', () => ({
  getApiBase: () => 'http://localhost:3760',
  joinApiPath: (p: string) => p,
  requestJson: vi.fn(),
}));

import { requestJson } from '@/lib/api-client';

describe('useTerminalStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('初始状态无会话', () => {
    const t = useTerminalStore();
    expect(t.sessions).toEqual([]);
    expect(t.activeSessionId).toBeNull();
    expect(t.streamConnected).toBe(false);
  });

  it('loadSessions 填充会话列表', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue({
      sessions: [{ sessionId: 's1', title: 'main', status: 'running' }],
    });
    const t = useTerminalStore();
    await t.loadSessions();
    expect(t.sessions).toHaveLength(1);
    expect(t.sessions[0].sessionId).toBe('s1');
  });

  it('loadSessions 失败设置 errorMessage', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    const t = useTerminalStore();
    await t.loadSessions();
    expect(t.errorMessage).toBe('boom');
    expect(t.sessions).toEqual([]);
  });
});

describe('useFilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('browse 填充 directory', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue({
      entries: [{ path: '/a', name: 'a', kind: 'directory' }],
    });
    const f = useFilesStore();
    await f.browse('root', '');
    expect(f.directory?.entries).toHaveLength(1);
    expect(f.loading).toBe(false);
  });

  it('readFile 填充 currentFile', async () => {
    (requestJson as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'daemon.ts',
      content: 'export {}',
      textLike: true,
    });
    const f = useFilesStore();
    await f.readFile('root', '/daemon.ts');
    expect(f.currentFile?.name).toBe('daemon.ts');
    expect(f.currentFile?.content).toBe('export {}');
  });
});
