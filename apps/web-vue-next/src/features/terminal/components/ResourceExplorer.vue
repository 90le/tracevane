<!-- features/terminal/components/ResourceExplorer.vue
     文件树 —— IDE 左侧资源管理器。browse API + 目录展开/折叠。
     点击文件触发预览（emit open-file）。材质：thin，密集。 -->
<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { useFilesStore } from '../files-store';
import type { FileEntrySummary } from '../../../../../../types/files';

const emit = defineEmits<{ 'open-file': [entry: FileEntrySummary] }>();
const files = useFilesStore();

// 展开目录栈：记录当前展开的目录路径（MVP 单根目录树，按层级展开）
const expandedPaths = ref<Set<string>>(new Set());
const rootId = ref('');

onMounted(async () => {
  await files.loadSummary();
  rootId.value = files.summary?.defaultRootId || '';
  if (rootId.value) {
    await files.browse(rootId.value, '');
    expandedPaths.value.add('');
  }
});

async function toggle(entry: FileEntrySummary) {
  if (entry.kind !== 'directory') {
    emit('open-file', entry);
    return;
  }
  const path = entry.path;
  if (expandedPaths.value.has(path)) {
    expandedPaths.value.delete(path);
  } else {
    expandedPaths.value.add(path);
    await files.browse(rootId.value, path);
  }
}

const entries = files.directory?.entries ?? [];
</script>

<template>
  <div class="explorer">
    <div class="explorer__head">
      <span class="explorer__title">资源管理器</span>
    </div>
    <div class="explorer__tree">
      <div v-if="files.errorMessage" class="explorer__error">{{ files.errorMessage }}</div>
      <div v-else-if="entries.length === 0" class="explorer__empty">无文件</div>
      <div
        v-for="entry in entries"
        :key="entry.path"
        class="explorer__row"
        :class="{ 'explorer__row--active': files.currentFile?.path === entry.path }"
        @click="toggle(entry)"
      >
        <span class="explorer__chev">{{ entry.kind === 'directory' ? (expandedPaths.has(entry.path) ? '▾' : '▸') : ' ' }}</span>
        <span class="explorer__icon" :class="entry.kind === 'directory' ? 'explorer__icon--dir' : 'explorer__icon--file'">
          {{ entry.kind === 'directory' ? '📁' : '📄' }}
        </span>
        <span class="explorer__name">{{ entry.name }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.explorer__head {
  padding: 12px 14px 8px;
}
.explorer__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}
.explorer__tree {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 10px;
  font-size: 12.5px;
}
.explorer__row {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 24px;
  padding: 0 8px;
  border-radius: var(--radius-control);
  cursor: pointer;
  color: var(--text-secondary);
  white-space: nowrap;
  transition: background 0.1s;
}
.explorer__row:hover {
  background: var(--fill);
  color: var(--text-primary);
}
.explorer__row--active {
  background: var(--fill-strong);
  color: var(--text-primary);
}
.explorer__chev {
  width: 12px;
  color: var(--text-quaternary);
  font-size: 9px;
  text-align: center;
}
.explorer__icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
}
.explorer__name {
  overflow: hidden;
  text-overflow: ellipsis;
}
.explorer__error,
.explorer__empty {
  padding: 12px;
  color: var(--text-tertiary);
  font-size: 12px;
}
</style>
