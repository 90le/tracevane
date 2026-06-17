// features/terminal/search-store.ts
// 全局文件搜索。复用 /api/files/search 契约。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { requestJson } from '@/lib/api-client';
import type { FileSearchResult, FilesSearchPayload } from '../../../../../types/files';

const ROOT_ID = 'project-root';

export const useSearchStore = defineStore('search', () => {
  const query = ref('');
  const results = ref<FileSearchResult[]>([]);
  const searching = ref(false);
  const errorMessage = ref('');

  async function search(q: string) {
    query.value = q;
    if (!q.trim()) {
      results.value = [];
      return;
    }
    searching.value = true;
    try {
      const params = new URLSearchParams({ rootId: ROOT_ID, path: '', q, recursive: '1' });
      const payload = await requestJson<FilesSearchPayload>(`/api/files/search?${params}`);
      results.value = payload.results || [];
      errorMessage.value = '';
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Search failed.';
    } finally {
      searching.value = false;
    }
  }

  function clear() {
    query.value = '';
    results.value = [];
    errorMessage.value = '';
  }

  return { query, results, searching, errorMessage, search, clear };
});
