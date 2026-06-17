<!-- features/terminal/components/SearchPanel.vue
     全局搜索 —— 按文件名/内容搜索 project-root。
     点击结果预览文件。材质：thin。 -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSearchStore } from '../search-store';
import { useFilesStore } from '../files-store';
import type { FileSearchResult } from '../../../../../types/files';

const search = useSearchStore();
const files = useFilesStore();
const input = ref('');
let debounce: ReturnType<typeof setTimeout> | null = null;

// 防抖搜索
watch(input, (val) => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => search.search(val), 250);
});

async function openResult(r: FileSearchResult) {
  if (r.kind !== 'file') return;
  await files.readFile('project-root', r.path);
}
</script>

<template>
  <div class="search">
    <div class="search__head">
      <span class="search__title">搜索</span>
    </div>
    <div class="search__input-wrap">
      <input
        v-model="input"
        class="search__input"
        placeholder="按文件名搜索…"
        autofocus
      />
    </div>

    <div v-if="search.errorMessage" class="search__msg search__msg--error">{{ search.errorMessage }}</div>
    <div v-else-if="search.searching" class="search__msg">搜索中…</div>
    <div v-else-if="input && search.results.length === 0" class="search__msg">无匹配结果</div>

    <div class="search__list">
      <div
        v-for="r in search.results"
        :key="r.path"
        class="search__row"
        :class="{ 'search__row--active': files.currentFile?.path === r.path }"
        :title="r.path"
        @click="openResult(r)"
      >
        <span class="search__icon">{{ r.kind === 'directory' ? '📁' : '📄' }}</span>
        <span class="search__body">
          <span class="search__name">{{ r.name }}</span>
          <span class="search__path">{{ r.directoryPath }}</span>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 12.5px;
}
.search__head {
  padding: 12px 14px 8px;
}
.search__title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-tertiary);
}
.search__input-wrap {
  padding: 0 10px 8px;
}
.search__input {
  width: 100%;
  background: var(--fill);
  border: 0.5px solid transparent;
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: var(--radius-control);
  font: inherit;
  font-size: 12px;
}
.search__input:focus {
  outline: none;
  background: var(--material-floating);
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.search__input::placeholder {
  color: var(--text-tertiary);
}
.search__msg {
  padding: 10px 14px;
  color: var(--text-tertiary);
  font-size: 12px;
}
.search__msg--error {
  color: var(--sys-red);
}
.search__list {
  flex: 1;
  overflow-y: auto;
  padding: 0 6px 10px;
}
.search__row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  cursor: pointer;
}
.search__row:hover {
  background: var(--fill);
}
.search__row--active {
  background: var(--fill-strong);
}
.search__icon {
  font-size: 12px;
  flex-shrink: 0;
}
.search__body {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.search__name {
  font-size: 12.5px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.search__path {
  font-size: 10px;
  color: var(--text-quaternary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
