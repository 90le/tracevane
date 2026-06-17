// features/terminal/files-store.ts
// 文件树 + 读文件数据层。复用旧壳 /api/files 契约。
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { requestJson } from '@/lib/api-client';
import type {
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSummaryPayload,
} from '../../../../../types/files';

export const useFilesStore = defineStore('files', () => {
  const summary = ref<FilesSummaryPayload | null>(null);
  const directory = ref<FilesDirectoryPayload | null>(null);
  const currentFile = ref<FilesReadPayload | null>(null);
  const loading = ref(false);
  const errorMessage = ref('');

  async function loadSummary() {
    try {
      summary.value = await requestJson<FilesSummaryPayload>('/api/files/summary');
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to load files summary.';
    }
  }

  async function browse(rootId: string, path: string) {
    loading.value = true;
    try {
      const query = new URLSearchParams({ rootId, path });
      directory.value = await requestJson<FilesDirectoryPayload>(`/api/files/browse?${query}`);
      errorMessage.value = '';
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to browse directory.';
    } finally {
      loading.value = false;
    }
  }

  async function readFile(rootId: string, path: string) {
    loading.value = true;
    try {
      const query = new URLSearchParams({ rootId, path });
      currentFile.value = await requestJson<FilesReadPayload>(`/api/files/read?${query}`);
      errorMessage.value = '';
    } catch (e) {
      errorMessage.value = e instanceof Error ? e.message : 'Failed to read file.';
    } finally {
      loading.value = false;
    }
  }

  return { summary, directory, currentFile, loading, errorMessage, loadSummary, browse, readFile };
});
