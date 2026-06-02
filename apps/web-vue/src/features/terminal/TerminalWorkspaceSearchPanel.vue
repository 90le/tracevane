<template>
  <section class="terminal-workspace-search" data-testid="terminal-workspace-search">
    <header class="terminal-workspace-sidebar-head">
      <div>
        <strong>{{ text('搜索', 'Search') }}</strong>
        <span>{{ activeScopeLabel }}</span>
      </div>
      <button
        type="button"
        class="terminal-resource-icon-button"
        :title="text('刷新搜索', 'Refresh search')"
        :aria-label="text('刷新搜索', 'Refresh search')"
        :disabled="searchBusy || !query.trim()"
        @click="runSearch"
      >
        <RefreshCw class="terminal-resource-icon" aria-hidden="true" />
      </button>
    </header>

    <form class="terminal-workspace-search__form" role="search" @submit.prevent="runSearch">
      <label class="terminal-workspace-search__field">
        <span>{{ text('查找', 'Find') }}</span>
        <input
          ref="queryInput"
          v-model="query"
          type="search"
          autocomplete="off"
          :placeholder="text('搜索工作区文件', 'Search workspace files')"
          @input="scheduleSearch"
        />
      </label>
      <label class="terminal-workspace-search__field">
        <span>{{ text('替换', 'Replace') }}</span>
        <input
          v-model="replaceValue"
          type="text"
          autocomplete="off"
          :placeholder="text('替换为', 'Replace with')"
        />
      </label>
      <div class="terminal-workspace-search__options" role="group" :aria-label="text('搜索选项', 'Search options')">
        <button type="button" :class="{ active: caseSensitive }" :aria-pressed="caseSensitive" @click="caseSensitive = !caseSensitive; scheduleSearch()">
          Aa
        </button>
        <button type="button" :class="{ active: wholeWord }" :aria-pressed="wholeWord" @click="wholeWord = !wholeWord; scheduleSearch()">
          ab
        </button>
        <button type="button" :class="{ active: regexp }" :aria-pressed="regexp" @click="regexp = !regexp; scheduleSearch()">
          .*
        </button>
      </div>
      <label class="terminal-workspace-search__field">
        <span>{{ text('包含', 'Include') }}</span>
        <input
          v-model="includePattern"
          type="text"
          autocomplete="off"
          :placeholder="text('例如 src,*.vue', 'e.g. src,*.vue')"
          @input="emitResultCount"
        />
      </label>
      <label class="terminal-workspace-search__field">
        <span>{{ text('排除', 'Exclude') }}</span>
        <input
          v-model="excludePattern"
          type="text"
          autocomplete="off"
          placeholder="node_modules,.git,dist"
          @input="emitResultCount"
        />
      </label>
      <div class="terminal-workspace-search__actions">
        <button type="submit" class="secondary-button compact-button" :disabled="searchBusy || !query.trim()">
          <Search class="terminal-resource-icon" aria-hidden="true" />
          {{ searchBusy ? text('搜索中', 'Searching') : text('搜索', 'Search') }}
        </button>
        <button
          v-if="searchBusy"
          type="button"
          class="secondary-button compact-button terminal-workspace-search__stop"
          @click="cancelSearch"
        >
          {{ text('停止', 'Stop') }}
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-workspace-search__replace"
          :disabled="replaceBusy || !replaceableResults.length || !query.trim()"
          @click="replaceAllResults"
        >
          <ReplaceAll class="terminal-resource-icon" aria-hidden="true" />
          {{ replaceBusy ? text('替换中', 'Replacing') : text('全部替换', 'Replace All') }}
        </button>
      </div>
    </form>

    <p v-if="feedback" class="terminal-workspace-search__feedback" :class="`terminal-workspace-search__feedback--${feedbackKind}`">
      {{ feedback }}
    </p>

    <div class="terminal-workspace-search__summary">
      <span>{{ resultSummary }}</span>
      <span v-if="searchPayload?.checkedAt">{{ formatTime(searchPayload.checkedAt) }}</span>
    </div>

    <div class="terminal-workspace-search__results" role="list">
      <button
        v-for="result in visibleResults"
        :key="result.path"
        type="button"
        class="terminal-workspace-search__result"
        role="listitem"
        :title="result.path"
        @click="previewResult(result)"
      >
        <FileText class="terminal-resource-icon" aria-hidden="true" />
        <span class="terminal-workspace-search__result-copy">
          <strong>{{ result.name }}</strong>
          <small>{{ result.path }}</small>
          <em v-if="result.snippet">{{ result.snippet }}</em>
        </span>
        <span class="terminal-workspace-search__result-kind">{{ result.matchKind || 'name' }}</span>
      </button>
      <button
        v-if="hiddenResultsCount > 0"
        type="button"
        class="terminal-workspace-search__load-more"
        @click="showMoreResults"
      >
        {{ text(`显示更多 ${nextResultBatchCount} 项`, `Show ${nextResultBatchCount} more`) }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { FileText, RefreshCw, ReplaceAll, Search } from '@lucide/vue';
import type {
  FileRootSummary,
  FileSearchResult,
  FilesSearchPayload,
} from '../../../../../types/files';
import { useLocalePreference } from '../../shared/locale';
import {
  fetchFilesSummary,
  readFileContent,
  saveFileContent,
  searchFiles,
} from '../files/api';
import type { TerminalResourceTransferPayload } from './terminal-resource-transfer';

const props = defineProps<{
  workspaceScopeId: string;
  workspaceFallbackCwd: string | null;
}>();

const emit = defineEmits<{
  (event: 'previewFile', payload: TerminalResourceTransferPayload): void;
  (event: 'resultCountChange', count: number): void;
}>();

const { text } = useLocalePreference();
const roots = ref<FileRootSummary[]>([]);
const rootId = ref('');
const directoryPath = ref('');
const query = ref('');
const replaceValue = ref('');
const includePattern = ref('');
const excludePattern = ref('node_modules,.git,dist');
const caseSensitive = ref(false);
const wholeWord = ref(false);
const regexp = ref(false);
const searchBusy = ref(false);
const replaceBusy = ref(false);
const feedback = ref('');
const feedbackKind = ref<'info' | 'success' | 'error'>('info');
const searchPayload = ref<FilesSearchPayload | null>(null);
const queryInput = ref<HTMLInputElement | null>(null);
const SEARCH_DEBOUNCE_MS = 360;
const SEARCH_RESULT_BATCH_SIZE = 80;
const visibleResultLimit = ref(SEARCH_RESULT_BATCH_SIZE);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchRequestSeq = 0;

const activeRoot = computed(() =>
  roots.value.find((root) => root.id === rootId.value) || null,
);
const activeScopeLabel = computed(() => {
  const root = activeRoot.value;
  if (!root) return text('工作区', 'Workspace');
  return directoryPath.value
    ? `${text(root.labelZh, root.labelEn)} / ${directoryPath.value}`
    : text(root.labelZh, root.labelEn);
});
const filteredResults = computed(() =>
  (searchPayload.value?.results || []).filter(matchesClientPatterns),
);
const visibleResults = computed(() =>
  filteredResults.value.slice(0, visibleResultLimit.value),
);
const replaceableResults = computed(() =>
  filteredResults.value.filter((result) => result.kind === 'file' && result.textLike),
);
const hiddenResultsCount = computed(() =>
  Math.max(0, filteredResults.value.length - visibleResults.value.length),
);
const nextResultBatchCount = computed(() =>
  Math.min(SEARCH_RESULT_BATCH_SIZE, hiddenResultsCount.value),
);
const resultSummary = computed(() => {
  if (searchBusy.value) return text('正在搜索…', 'Searching...');
  if (!query.value.trim()) return text('输入关键词搜索当前工作区', 'Type to search the current workspace');
  const count = filteredResults.value.length;
  if (hiddenResultsCount.value > 0) {
    return text(
      `显示 ${visibleResults.value.length} / ${count} 个结果`,
      `Showing ${visibleResults.value.length} / ${count} result(s)`,
    );
  }
  return text(`${count} 个结果`, `${count} result(s)`);
});

watch(
  () => [props.workspaceScopeId, props.workspaceFallbackCwd] as const,
  () => {
    syncScopeFromWorkspace();
    scheduleSearch();
  },
);

watch(filteredResults, () => emitResultCount());

onMounted(async () => {
  await loadRoots();
  syncScopeFromWorkspace();
  await nextTick();
  queryInput.value?.focus();
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  searchRequestSeq += 1;
});

async function loadRoots(): Promise<void> {
  const summary = await fetchFilesSummary();
  roots.value = summary.roots || [];
  rootId.value = summary.defaultRootId || roots.value[0]?.id || '';
}

function syncScopeFromWorkspace(): void {
  if (!roots.value.length) return;
  const fallbackCwd = String(props.workspaceFallbackCwd || '').trim();
  const matchedRoot = fallbackCwd ? resolveRootForAbsolutePath(fallbackCwd) : null;
  if (matchedRoot) {
    rootId.value = matchedRoot.root.id;
    directoryPath.value = matchedRoot.relativePath;
    return;
  }
  const requestedRoot = roots.value.find((root) => root.id === props.workspaceScopeId) || null;
  rootId.value = requestedRoot?.id || rootId.value || roots.value[0]?.id || '';
  directoryPath.value = '';
}

function resolveRootForAbsolutePath(absolutePath: string): { root: FileRootSummary; relativePath: string } | null {
  const normalized = normalizePath(absolutePath);
  const candidates = roots.value
    .map((root) => ({
      root,
      absolutePath: normalizePath(root.absolutePath),
    }))
    .filter((item) =>
      normalized === item.absolutePath ||
      normalized.startsWith(`${item.absolutePath}/`),
    )
    .sort((left, right) => right.absolutePath.length - left.absolutePath.length);
  const match = candidates[0] || null;
  if (!match) return null;
  return {
    root: match.root,
    relativePath: normalized === match.absolutePath
      ? ''
      : normalized.slice(match.absolutePath.length + 1),
  };
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
}

function scheduleSearch(): void {
  feedback.value = '';
  if (searchTimer) clearTimeout(searchTimer);
  searchRequestSeq += 1;
  if (!query.value.trim()) {
    searchPayload.value = null;
    searchBusy.value = false;
    visibleResultLimit.value = SEARCH_RESULT_BATCH_SIZE;
    emitResultCount();
    return;
  }
  searchTimer = setTimeout(() => {
    void runSearch();
  }, SEARCH_DEBOUNCE_MS);
}

async function runSearch(): Promise<void> {
  const needle = query.value.trim();
  if (!needle || !rootId.value) return;
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  const requestSeq = ++searchRequestSeq;
  searchBusy.value = true;
  feedback.value = '';
  visibleResultLimit.value = SEARCH_RESULT_BATCH_SIZE;
  try {
    const payload = await searchFiles(rootId.value, needle, directoryPath.value, true, true);
    if (!isCurrentSearchRequest(requestSeq)) return;
    searchPayload.value = payload;
  } catch (error) {
    if (!isCurrentSearchRequest(requestSeq)) return;
    feedbackKind.value = 'error';
    feedback.value = error instanceof Error ? error.message : text('搜索失败', 'Search failed');
  } finally {
    if (isCurrentSearchRequest(requestSeq)) {
      searchBusy.value = false;
      emitResultCount();
    }
  }
}

function cancelSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
  if (!searchBusy.value) return;
  searchRequestSeq += 1;
  searchBusy.value = false;
  feedbackKind.value = 'info';
  feedback.value = text('搜索已停止，旧结果已保留。', 'Search stopped; existing results were kept.');
  emitResultCount();
}

function isCurrentSearchRequest(requestSeq: number): boolean {
  return requestSeq === searchRequestSeq;
}

function showMoreResults(): void {
  visibleResultLimit.value += SEARCH_RESULT_BATCH_SIZE;
}

async function replaceAllResults(): Promise<void> {
  const expression = buildSearchExpression();
  if (!expression || !replaceableResults.value.length) return;
  replaceBusy.value = true;
  feedback.value = '';
  let changedFiles = 0;
  let changedMatches = 0;
  try {
    for (const result of replaceableResults.value) {
      const payload = await readFileContent(rootId.value, result.path);
      if (payload.content == null || payload.truncated || !payload.editable) continue;
      const regex = new RegExp(expression.source, expression.flags);
      const matches = payload.content.match(regex)?.length || 0;
      if (!matches) continue;
      const nextContent = payload.content.replace(regex, () => replaceValue.value);
      await saveFileContent({ rootId: rootId.value, path: result.path, content: nextContent });
      changedFiles += 1;
      changedMatches += matches;
    }
    feedbackKind.value = 'success';
    feedback.value = text(
      `已替换 ${changedFiles} 个文件中的 ${changedMatches} 处匹配。`,
      `Replaced ${changedMatches} match(es) in ${changedFiles} file(s).`,
    );
    await runSearch();
  } catch (error) {
    feedbackKind.value = 'error';
    feedback.value = error instanceof Error ? error.message : text('替换失败', 'Replace failed');
  } finally {
    replaceBusy.value = false;
  }
}

function buildSearchExpression(): RegExp | null {
  const raw = query.value.trim();
  if (!raw) return null;
  const source = regexp.value ? raw : escapeRegExp(raw);
  const wrapped = wholeWord.value ? `\\b(?:${source})\\b` : source;
  try {
    return new RegExp(wrapped, caseSensitive.value ? 'g' : 'gi');
  } catch {
    feedbackKind.value = 'error';
    feedback.value = text('正则表达式无效', 'Invalid regular expression');
    return null;
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesClientPatterns(result: FileSearchResult): boolean {
  const resultPath = result.path.toLowerCase();
  const includeTokens = splitPattern(includePattern.value);
  const excludeTokens = splitPattern(excludePattern.value);
  if (includeTokens.length && !includeTokens.some((token) => patternMatches(resultPath, token))) {
    return false;
  }
  if (excludeTokens.some((token) => patternMatches(resultPath, token))) {
    return false;
  }
  return true;
}

function splitPattern(value: string): string[] {
  return value
    .split(/[,\s]+/g)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);
}

function patternMatches(value: string, pattern: string): boolean {
  if (pattern.includes('*')) {
    const escaped = escapeRegExp(pattern).replace(/\\\*/g, '.*');
    return new RegExp(`(^|/)${escaped}($|/)`).test(value) || new RegExp(escaped).test(value);
  }
  return value.includes(pattern);
}

function previewResult(result: FileSearchResult): void {
  if (result.kind !== 'file') return;
  emit('previewFile', {
    rootId: rootId.value,
    path: result.path,
    absolutePath: activeRoot.value
      ? joinPortablePath(activeRoot.value.absolutePath, result.path)
      : result.path,
    kind: 'file',
    name: result.name,
  });
}

function joinPortablePath(basePath: string, relativePath: string): string {
  const base = normalizePath(basePath);
  const relative = normalizePath(relativePath).replace(/^\/+/g, '');
  return relative ? `${base}/${relative}` : base;
}

function emitResultCount(): void {
  emit('resultCountChange', filteredResults.value.length);
}

function formatTime(value: string): string {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return '';
  }
}
</script>
