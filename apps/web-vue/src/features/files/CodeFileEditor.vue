<template>
  <div class="code-file-editor" :class="{ 'is-readonly': readOnly, 'has-search': searchVisible }">
    <form
      v-if="searchVisible"
      class="code-file-editor__searchbar"
      role="search"
      :aria-label="t('查找和替换', 'Find and replace')"
      @submit.prevent.stop="runFindNext"
    >
      <div class="code-file-editor__search-stack">
        <label class="code-file-editor__search-field code-file-editor__search-field--find">
          <span>{{ t("查找", "Find") }}</span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            type="search"
            autocomplete="off"
            :placeholder="t('输入关键字', 'Search text')"
            @focus="activeSearchField = 'search'"
            @input="syncSearchQuery()"
            @keydown.enter.exact.prevent.stop="runFindNext"
            @keydown.enter.shift.prevent.stop="runFindPrevious"
            @keydown.escape.prevent.stop="hideSearch"
          />
          <output class="code-file-editor__search-status" aria-live="polite">
            {{ searchStatusLabel }}
          </output>
        </label>
        <label class="code-file-editor__search-field code-file-editor__search-field--replace">
          <span>{{ t("替换", "Replace") }}</span>
          <input
            ref="replaceInputRef"
            v-model="replaceQuery"
            type="text"
            autocomplete="off"
            :disabled="readOnly"
            :placeholder="readOnly ? t('只读文件', 'Read only') : t('替换为', 'Replace with')"
            @focus="activeSearchField = 'replace'"
            @input="syncSearchQuery()"
            @keydown.enter.exact.prevent.stop="runFindNext"
            @keydown.enter.shift.prevent.stop="runFindPrevious"
            @keydown.escape.prevent.stop="hideSearch"
          />
        </label>
      </div>
      <div class="code-file-editor__search-actions">
        <button
          type="button"
          class="code-file-editor__icon-button"
          :disabled="!searchQuery"
          :title="t('上一个结果 Shift+Enter', 'Previous result Shift+Enter')"
          :aria-label="t('上一个结果', 'Previous result')"
          @mousedown.prevent
          @click="runFindPrevious"
        >
          <ChevronUp class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="code-file-editor__icon-button"
          :disabled="!searchQuery"
          :title="t('下一个结果 Enter', 'Next result Enter')"
          :aria-label="t('下一个结果', 'Next result')"
          @mousedown.prevent
          @click="runFindNext"
        >
          <ChevronDown class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <span class="code-file-editor__search-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="code-file-editor__icon-button"
          :disabled="readOnly || !searchQuery"
          :title="t('替换当前结果', 'Replace current match')"
          :aria-label="t('替换当前结果', 'Replace current match')"
          @mousedown.prevent
          @click="runReplaceNext"
        >
          <Replace class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="code-file-editor__icon-button"
          :disabled="readOnly || !searchQuery"
          :title="t('全部替换', 'Replace all')"
          :aria-label="t('全部替换', 'Replace all')"
          @mousedown.prevent
          @click="runReplaceAll"
        >
          <ReplaceAll class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <span class="code-file-editor__search-divider" aria-hidden="true"></span>
        <button
          type="button"
          class="code-file-editor__toggle code-file-editor__icon-button"
          :class="{ active: searchCaseSensitive }"
          :title="t('区分大小写', 'Case sensitive')"
          :aria-label="t('区分大小写', 'Case sensitive')"
          :aria-pressed="searchCaseSensitive"
          @mousedown.prevent
          @click="toggleSearchOption('case')"
        >
          <CaseSensitive class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="code-file-editor__toggle code-file-editor__icon-button"
          :class="{ active: searchWholeWord }"
          :title="t('全词匹配', 'Whole word')"
          :aria-label="t('全词匹配', 'Whole word')"
          :aria-pressed="searchWholeWord"
          @mousedown.prevent
          @click="toggleSearchOption('word')"
        >
          <WholeWord class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="code-file-editor__toggle code-file-editor__icon-button"
          :class="{ active: searchRegexp }"
          :title="t('正则表达式', 'Regular expression')"
          :aria-label="t('正则表达式', 'Regular expression')"
          :aria-pressed="searchRegexp"
          @mousedown.prevent
          @click="toggleSearchOption('regexp')"
        >
          <Regex class="code-file-editor__icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="code-file-editor__close-search code-file-editor__icon-button"
          :aria-label="t('关闭查找', 'Close search')"
          :title="t('关闭查找', 'Close search')"
          @mousedown.prevent
          @click="hideSearch"
        >
          <X class="code-file-editor__icon" aria-hidden="true" />
        </button>
      </div>
      <p v-if="searchError" class="code-file-editor__search-error">{{ searchError }}</p>
    </form>
    <div ref="hostRef" class="code-file-editor__host"></div>
  </div>
</template>

<script setup lang="ts">
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  crosshairCursor,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
  scrollPastEnd,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { SearchQuery, findNext, findPrevious, highlightSelectionMatches, replaceAll, replaceNext, search, setSearchQuery } from "@codemirror/search";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  CaseSensitive,
  ChevronDown,
  ChevronUp,
  Regex,
  Replace,
  ReplaceAll,
  WholeWord,
  X,
} from "@lucide/vue";
import "./files-workspace.css";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    path?: string;
    readOnly?: boolean;
    dark?: boolean;
    searchRequest?: number;
    text?: (zh: string, en: string) => string;
  }>(),
  {
    path: "",
    readOnly: false,
    dark: false,
    searchRequest: 0,
  },
);

const emit = defineEmits<{
  "update:modelValue": [value: string];
  save: [];
}>();

const hostRef = ref<HTMLDivElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);
const activeSearchField = ref<"search" | "replace">("search");
const searchVisible = ref(false);
const searchQuery = ref("");
const replaceQuery = ref("");
const searchCaseSensitive = ref(false);
const searchWholeWord = ref(false);
const searchRegexp = ref(false);
const searchError = ref("");
const searchMatchCount = ref(0);
const searchCurrentIndex = ref(0);
const searchMatchOverflow = ref(false);
let view: EditorView | null = null;
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
let syncingFromOutside = false;
let languageLoadToken = 0;
const SEARCH_MATCH_COUNT_LIMIT = 5000;

const searchStatusLabel = computed(() => {
  if (!searchVisible.value) return "";
  if (searchError.value) return searchError.value;
  if (!searchQuery.value) return t("输入内容开始查找", "Type to search");
  if (!searchMatchCount.value) return t("无结果", "No results");
  const total = searchMatchOverflow.value ? `${SEARCH_MATCH_COUNT_LIMIT}+` : String(searchMatchCount.value);
  return `${searchCurrentIndex.value || 1} / ${total}`;
});

function t(zh: string, en: string): string {
  return props.text ? props.text(zh, en) : zh;
}

async function loadLanguageExtension(filePath: string): Promise<Extension> {
  const normalized = filePath.toLowerCase();
  if (normalized.endsWith(".ts")) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ typescript: true });
  }
  if (normalized.endsWith(".tsx")) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ typescript: true, jsx: true });
  }
  if (normalized.endsWith(".js") || normalized.endsWith(".mjs") || normalized.endsWith(".cjs")) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript();
  }
  if (normalized.endsWith(".jsx")) {
    const { javascript } = await import("@codemirror/lang-javascript");
    return javascript({ jsx: true });
  }
  if (normalized.endsWith(".json") || normalized.endsWith(".jsonl")) {
    const { json } = await import("@codemirror/lang-json");
    return json();
  }
  if (normalized.endsWith(".md") || normalized.endsWith(".markdown")) {
    const { markdown } = await import("@codemirror/lang-markdown");
    return markdown();
  }
  if (normalized.endsWith(".html") || normalized.endsWith(".htm") || normalized.endsWith(".vue")) {
    const { html } = await import("@codemirror/lang-html");
    return html();
  }
  if (normalized.endsWith(".css") || normalized.endsWith(".scss") || normalized.endsWith(".less")) {
    const { css } = await import("@codemirror/lang-css");
    return css();
  }
  if (normalized.endsWith(".py")) {
    const { python } = await import("@codemirror/lang-python");
    return python();
  }
  if (normalized.endsWith(".yaml") || normalized.endsWith(".yml")) {
    const { yaml } = await import("@codemirror/lang-yaml");
    return yaml();
  }
  if (normalized.endsWith(".sql")) {
    const { sql } = await import("@codemirror/lang-sql");
    return sql();
  }
  return [];
}

function editableExtension(readOnly: boolean) {
  return EditorState.readOnly.of(readOnly);
}

function themeExtension(dark: boolean) {
  const sharedTheme = EditorView.theme({
    "&": {
      height: "100%",
      minHeight: "0",
      fontSize: "13px",
    },
    ".cm-scroller": {
      height: "100%",
      minHeight: "0",
      overflow: "auto",
      fontFamily: "\"JetBrains Mono\", \"IBM Plex Mono\", \"SFMono-Regular\", \"Cascadia Code\", \"Fira Code\", monospace",
      lineHeight: "1.56",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "8px 0 72px",
    },
    ".cm-line": {
      padding: "0 20px 0 10px",
    },
    ".cm-gutters": {
      borderRight: "1px solid var(--line)",
      minHeight: "100%",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 12px",
      minWidth: "3.4em",
    },
    ".cm-foldGutter .cm-gutterElement": {
      padding: "0 6px",
    },
    ".cm-activeLine": {
      backgroundColor: "color-mix(in srgb, var(--acc) 11%, transparent)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "color-mix(in srgb, var(--acc) 13%, transparent)",
      color: "var(--text)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in srgb, var(--acc) 28%, transparent)",
    },
    ".cm-searchMatch": {
      backgroundColor: "var(--code-editor-search-highlight)",
      outline: "1px solid var(--code-editor-search-outline)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      outline: "1px solid color-mix(in srgb, var(--acc) 70%, transparent)",
      backgroundColor: "color-mix(in srgb, var(--acc) 12%, transparent)",
    },
  });
  const lightTheme = EditorView.theme({
    "&": {
      backgroundColor: "var(--code-editor-bg)",
      color: "var(--code-editor-fg)",
    },
    ".cm-scroller": {
      backgroundColor: "var(--code-editor-bg)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--code-editor-gutter-bg)",
      color: "var(--code-editor-gutter-fg)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--code-editor-cursor)",
    },
  });
  const darkTheme = EditorView.theme({
    "&": {
      backgroundColor: "var(--code-editor-bg)",
      color: "var(--code-editor-fg)",
    },
    ".cm-scroller": {
      backgroundColor: "var(--code-editor-bg)",
    },
    ".cm-gutters": {
      backgroundColor: "var(--code-editor-gutter-bg)",
      color: "var(--code-editor-gutter-fg)",
      borderRight: "1px solid var(--code-editor-border)",
    },
    ".cm-cursor": {
      borderLeftColor: "var(--code-editor-cursor)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--code-editor-active-line)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "var(--code-editor-active-gutter)",
      color: "var(--code-editor-fg)",
    },
  });
  return dark ? [oneDark, darkTheme, sharedTheme] : [lightTheme, sharedTheme];
}

function createEditor(): void {
  if (!hostRef.value) return;
  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        highlightSpecialChars(),
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        foldGutter(),
        dropCursor(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        indentOnInput(),
        indentUnit.of("  "),
        bracketMatching(),
        highlightActiveLine(),
        scrollPastEnd(),
        search({ top: true }),
        highlightSelectionMatches(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              emit("save");
              return true;
            },
          },
          {
            key: "Mod-f",
            preventDefault: true,
            run: (targetView) => {
              showSearch(targetView);
              return true;
            },
          },
          {
            key: "Escape",
            run: () => {
              if (!searchVisible.value) return false;
              hideSearch();
              return true;
            },
          },
          {
            key: "F3",
            run: (targetView) => runFindNextCommand(targetView),
          },
          {
            key: "Shift-F3",
            run: (targetView) => runFindPreviousCommand(targetView),
          },
          {
            key: "Mod-g",
            run: (targetView) => runFindNextCommand(targetView),
          },
          {
            key: "Shift-Mod-g",
            run: (targetView) => runFindPreviousCommand(targetView),
          },
          indentWithTab,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        editableCompartment.of(editableExtension(props.readOnly)),
        languageCompartment.of([]),
        themeCompartment.of(themeExtension(props.dark)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || syncingFromOutside) return;
          emit("update:modelValue", update.state.doc.toString());
          if (searchVisible.value) updateSearchStats(buildSearchQuery(), update.view);
        }),
      ],
    }),
    parent: hostRef.value,
  });
}

function buildSearchQuery(): SearchQuery {
  return new SearchQuery({
    search: searchQuery.value,
    replace: replaceQuery.value,
    caseSensitive: searchCaseSensitive.value,
    regexp: searchRegexp.value,
    wholeWord: searchWholeWord.value,
  });
}

function syncSearchQuery(targetView = view): SearchQuery | null {
  if (!targetView) return null;
  const query = buildSearchQuery();
  searchError.value = searchQuery.value && !query.valid
    ? t("正则表达式无效", "Invalid regular expression")
    : "";
  targetView.dispatch({
    effects: setSearchQuery.of(query),
  });
  updateSearchStats(query, targetView);
  return query;
}

function updateSearchStats(query = buildSearchQuery(), targetView = view): void {
  if (!targetView || !query.search || !query.valid) {
    searchMatchCount.value = 0;
    searchCurrentIndex.value = 0;
    searchMatchOverflow.value = false;
    return;
  }
  const selection = targetView.state.selection.main;
  let count = 0;
  let currentIndex = 0;
  let firstAfterCursor = 0;
  const cursor = query.getCursor(targetView.state);
  for (let next = cursor.next(); !next.done; next = cursor.next()) {
    count += 1;
    const match = next.value;
    if (selection.from === match.from && selection.to === match.to) {
      currentIndex = count;
    } else if (!firstAfterCursor && match.from >= selection.head) {
      firstAfterCursor = count;
    }
    if (count >= SEARCH_MATCH_COUNT_LIMIT) {
      searchMatchOverflow.value = !cursor.next().done;
      break;
    }
  }
  searchMatchCount.value = count;
  searchCurrentIndex.value = currentIndex || firstAfterCursor || (count ? 1 : 0);
  if (count < SEARCH_MATCH_COUNT_LIMIT) {
    searchMatchOverflow.value = false;
  }
}

async function focusSearchInput(select = true): Promise<void> {
  await nextTick();
  searchInputRef.value?.focus();
  if (select) searchInputRef.value?.select();
}

async function focusActiveSearchField(): Promise<void> {
  await nextTick();
  const input = activeSearchField.value === "replace"
    ? replaceInputRef.value
    : searchInputRef.value;
  input?.focus();
}

function showSearch(targetView = view): void {
  if (targetView) {
    const selection = targetView.state.sliceDoc(
      targetView.state.selection.main.from,
      targetView.state.selection.main.to,
    );
    if (selection && !selection.includes("\n")) {
      searchQuery.value = selection;
    }
  }
  activeSearchField.value = "search";
  searchVisible.value = true;
  syncSearchQuery(targetView);
  void focusSearchInput();
}

function hideSearch(): void {
  searchVisible.value = false;
  searchError.value = "";
  view?.focus();
}

function runFindNextCommand(
  targetView = view,
  options: { focusTarget?: "editor" | "widget" } = {},
): boolean {
  if (!targetView) return false;
  searchVisible.value = true;
  const query = syncSearchQuery(targetView);
  if (!query?.valid || !query.search) {
    void focusSearchInput();
    return true;
  }
  findNext(targetView);
  updateSearchStats(query, targetView);
  if (options.focusTarget === "widget") {
    void focusActiveSearchField();
  } else {
    targetView.focus();
  }
  return true;
}

function runFindPreviousCommand(
  targetView = view,
  options: { focusTarget?: "editor" | "widget" } = {},
): boolean {
  if (!targetView) return false;
  searchVisible.value = true;
  const query = syncSearchQuery(targetView);
  if (!query?.valid || !query.search) {
    void focusSearchInput();
    return true;
  }
  findPrevious(targetView);
  updateSearchStats(query, targetView);
  if (options.focusTarget === "widget") {
    void focusActiveSearchField();
  } else {
    targetView.focus();
  }
  return true;
}

function runFindNext(): void {
  runFindNextCommand(view, { focusTarget: "widget" });
}

function runFindPrevious(): void {
  runFindPreviousCommand(view, { focusTarget: "widget" });
}

function runReplaceNext(): void {
  if (!view || props.readOnly) return;
  const query = syncSearchQuery(view);
  if (!query?.valid || !query.search) return;
  replaceNext(view);
  updateSearchStats(query, view);
  void focusActiveSearchField();
}

function runReplaceAll(): void {
  if (!view || props.readOnly) return;
  const query = syncSearchQuery(view);
  if (!query?.valid || !query.search) return;
  replaceAll(view);
  updateSearchStats(query, view);
  void focusActiveSearchField();
}

function toggleSearchOption(option: "case" | "word" | "regexp"): void {
  if (option === "case") searchCaseSensitive.value = !searchCaseSensitive.value;
  if (option === "word") searchWholeWord.value = !searchWholeWord.value;
  if (option === "regexp") searchRegexp.value = !searchRegexp.value;
  syncSearchQuery();
  void focusSearchInput();
}

async function applyLanguageExtension(filePath: string): Promise<void> {
  if (!view) return;
  const token = ++languageLoadToken;
  const extension = await loadLanguageExtension(filePath);
  if (!view || token !== languageLoadToken) return;
  view.dispatch({
    effects: languageCompartment.reconfigure(extension),
  });
}

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === nextValue) return;
    syncingFromOutside = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: nextValue,
      },
    });
    syncingFromOutside = false;
  },
);

watch(
  () => props.readOnly,
  (nextValue) => {
    if (!view) return;
    view.dispatch({
      effects: editableCompartment.reconfigure(editableExtension(nextValue)),
    });
  },
);

watch(
  () => props.path,
  (nextPath) => {
    void applyLanguageExtension(nextPath);
  },
);

watch(
  () => props.dark,
  (nextDark) => {
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.reconfigure(themeExtension(nextDark)),
    });
  },
);

watch(
  () => props.searchRequest,
  (nextValue, previousValue) => {
    if (!view || nextValue === previousValue) return;
    showSearch(view);
  },
);

onMounted(() => {
  createEditor();
  void applyLanguageExtension(props.path);
});

onBeforeUnmount(() => {
  view?.destroy();
  view = null;
});
</script>
