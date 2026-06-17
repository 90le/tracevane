// features/terminal/git-store.ts
// Git 状态 + stage/unstage。复用旧壳 /api/git 契约。
// rootId 用 project-root（指向 git 仓库根）。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { requestJson } from '@/lib/api-client';
import type { GitStatusPayload } from '../../../../../types/git';

const ROOT_ID = 'project-root';

export const useGitStore = defineStore('git', () => {
  const status = ref<GitStatusPayload | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');

  async function loadStatus(path = '') {
    loading.value = true;
    try {
      const query = new URLSearchParams({ rootId: ROOT_ID, path });
      status.value = await requestJson<GitStatusPayload>(`/api/git/status?${query}`);
      errorMessage.value = '';
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load git status.';
    } finally {
      loading.value = false;
    }
  }

  async function stagePath(filePath: string) {
    await requestJson<GitStatusPayload>('/api/git/stage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootId: ROOT_ID, path: '', paths: [filePath] }),
    });
    await loadStatus();
  }

  async function unstagePath(filePath: string) {
    await requestJson<GitStatusPayload>('/api/git/unstage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootId: ROOT_ID, path: '', paths: [filePath] }),
    });
    await loadStatus();
  }

  return { status, loading, errorMessage, loadStatus, stagePath, unstagePath };
});
