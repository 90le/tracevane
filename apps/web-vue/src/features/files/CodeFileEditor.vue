<template>
  <div class="code-file-editor" :class="{ 'is-readonly': readOnly, 'has-search': searchVisible }">
    <form
      v-if="searchVisible"
      class="code-file-editor__searchbar"
      @submit.prevent="runFindNext"
    >
      <label class="code-file-editor__search-field">
        <span>{{ t("查找", "Find") }}</span>
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="search"
          autocomplete="off"
          :placeholder="t('输入关键字', 'Search text')"
          @input="syncSearchQuery"
          @keydown.escape.prevent="hideSearch"
        />
      </label>
      <label class="code-file-editor__search-field">
        <span>{{ t("替换", "Replace") }}</span>
        <input
          v-model="replaceQuery"
          type="text"
          autocomplete="off"
          :disabled="readOnly"
          :placeholder="readOnly ? t('只读文件', 'Read only') : t('替换为', 'Replace with')"
          @input="syncSearchQuery"
          @keydown.escape.prevent="hideSearch"
        />
      </label>
      <div class="code-file-editor__search-actions">
        <button type="button" :disabled="!searchQuery" @click="runFindPrevious">
          {{ t("上一个", "Prev") }}
        </button>
        <button type="submit" :disabled="!searchQuery">
          {{ t("下一个", "Next") }}
        </button>
        <button type="button" :disabled="readOnly || !searchQuery" @click="runReplaceNext">
          {{ t("替换", "Replace") }}
        </button>
        <button type="button" :disabled="readOnly || !searchQuery" @click="runReplaceAll">
          {{ t("全部", "All") }}
        </button>
        <button
          type="button"
          class="code-file-editor__toggle"
          :class="{ active: searchCaseSensitive }"
          :title="t('区分大小写', 'Case sensitive')"
          @click="toggleSearchOption('case')"
        >
          Aa
        </button>
        <button
          type="button"
          class="code-file-editor__toggle"
          :class="{ active: searchWholeWord }"
          :title="t('全词匹配', 'Whole word')"
          @click="toggleSearchOption('word')"
        >
          W
        </button>
        <button
          type="button"
          class="code-file-editor__toggle"
          :class="{ active: searchRegexp }"
          :title="t('正则表达式', 'Regular expression')"
          @click="toggleSearchOption('regexp')"
        >
          .*
        </button>
        <button
          type="button"
          class="code-file-editor__close-search"
          :aria-label="t('关闭查找', 'Close search')"
          @click="hideSearch"
        >
          <X class="drawer-close-icon" aria-hidden="true" />
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
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { X } from "@lucide/vue";

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
const searchVisible = ref(false);
const searchQuery = ref("");
const replaceQuery = ref("");
const searchCaseSensitive = ref(false);
const searchWholeWord = ref(false);
const searchRegexp = ref(false);
const searchError = ref("");
let view: EditorView | null = null;
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
let syncingFromOutside = false;
let languageLoadToken = 0;

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
      backgroundColor: "color-mix(in srgb, #f5c542 42%, transparent)",
      outline: "1px solid color-mix(in srgb, #f5c542 70%, transparent)",
    },
    ".cm-matchingBracket, .cm-nonmatchingBracket": {
      outline: "1px solid color-mix(in srgb, var(--acc) 70%, transparent)",
      backgroundColor: "color-mix(in srgb, var(--acc) 12%, transparent)",
    },
  });
  const lightTheme = EditorView.theme({
    "&": {
      backgroundColor: "#fbfdff",
      color: "#1f2937",
    },
    ".cm-scroller": {
      backgroundColor: "#fbfdff",
    },
    ".cm-gutters": {
      backgroundColor: "#f3f6fa",
      color: "#7c8798",
    },
    ".cm-cursor": {
      borderLeftColor: "#1f6feb",
    },
  });
  const darkTheme = EditorView.theme({
    "&": {
      backgroundColor: "#0d1117",
      color: "#dbe7f3",
    },
    ".cm-scroller": {
      backgroundColor: "#0d1117",
    },
    ".cm-gutters": {
      backgroundColor: "#0a0f16",
      color: "#6b7c92",
      borderRight: "1px solid rgba(148, 163, 184, 0.18)",
    },
    ".cm-cursor": {
      borderLeftColor: "#7dd3fc",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(59, 130, 246, 0.12)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "rgba(59, 130, 246, 0.14)",
      color: "#dbe7f3",
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
  return query;
}

async function focusSearchInput(): Promise<void> {
  await nextTick();
  searchInputRef.value?.focus();
  searchInputRef.value?.select();
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
  searchVisible.value = true;
  syncSearchQuery(targetView);
  void focusSearchInput();
}

function hideSearch(): void {
  searchVisible.value = false;
  searchError.value = "";
  view?.focus();
}

function runFindNextCommand(targetView = view): boolean {
  if (!targetView) return false;
  searchVisible.value = true;
  const query = syncSearchQuery(targetView);
  if (!query?.valid || !query.search) {
    void focusSearchInput();
    return true;
  }
  findNext(targetView);
  targetView.focus();
  return true;
}

function runFindPreviousCommand(targetView = view): boolean {
  if (!targetView) return false;
  searchVisible.value = true;
  const query = syncSearchQuery(targetView);
  if (!query?.valid || !query.search) {
    void focusSearchInput();
    return true;
  }
  findPrevious(targetView);
  targetView.focus();
  return true;
}

function runFindNext(): void {
  runFindNextCommand();
}

function runFindPrevious(): void {
  runFindPreviousCommand();
}

function runReplaceNext(): void {
  if (!view || props.readOnly) return;
  const query = syncSearchQuery(view);
  if (!query?.valid || !query.search) return;
  replaceNext(view);
  view.focus();
}

function runReplaceAll(): void {
  if (!view || props.readOnly) return;
  const query = syncSearchQuery(view);
  if (!query?.valid || !query.search) return;
  replaceAll(view);
  view.focus();
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

<style scoped>
.code-file-editor {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
}

.code-file-editor.has-search {
  grid-template-rows: auto minmax(0, 1fr);
}

:global(html[data-theme="dark"] .code-file-editor) {
  background: #0d1117;
}

.code-file-editor__searchbar {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(140px, 1fr) minmax(320px, auto);
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 7px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 86%, transparent);
  background: color-mix(in srgb, var(--file-manager-panel-strong, var(--surface)) 94%, var(--file-manager-bg, var(--surface)));
  box-shadow: 0 1px 0 color-mix(in srgb, #ffffff 40%, transparent) inset;
}

:global(html[data-theme="dark"] .code-file-editor__searchbar) {
  background: #101a2b;
  box-shadow: none;
}

.code-file-editor__search-field {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--muted);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.code-file-editor__search-field input {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  min-height: 27px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text);
  font: inherit;
  font-size: 12px;
}

.code-file-editor__search-field input:focus {
  border-color: color-mix(in srgb, var(--acc) 58%, var(--line));
  outline: none;
}

.code-file-editor__search-actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  padding-bottom: 1px;
  scrollbar-width: thin;
}

.code-file-editor__search-actions button {
  min-height: 27px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
}

.code-file-editor__search-actions button:hover {
  border-color: color-mix(in srgb, var(--acc) 38%, var(--line));
  background: color-mix(in srgb, var(--button-secondary-bg) 82%, var(--acc) 10%);
  color: var(--text);
}

.code-file-editor__search-actions button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.code-file-editor__search-actions .code-file-editor__toggle {
  width: 31px;
  padding: 0;
  color: var(--muted);
}

.code-file-editor__search-actions .code-file-editor__toggle.active {
  border-color: color-mix(in srgb, var(--acc) 58%, var(--line));
  background: color-mix(in srgb, var(--acc) 16%, var(--button-secondary-bg));
  color: color-mix(in srgb, var(--acc) 76%, var(--text));
}

.code-file-editor__search-actions .code-file-editor__close-search {
  width: 28px;
  padding: 0;
  color: var(--muted);
}

.code-file-editor__search-error {
  grid-column: 1 / -1;
  margin: -1px 0 0;
  color: var(--danger);
  font-size: 11px;
}

.code-file-editor__host {
  height: 100%;
  min-height: 0;
}

.code-file-editor.is-readonly {
  opacity: 0.94;
}

:deep(.cm-editor) {
  height: 100%;
  min-height: 0;
  outline: none;
}

:deep(.cm-editor.cm-focused) {
  outline: none;
}

:deep(.cm-scroller) {
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--muted) 42%, transparent) transparent;
}

:deep(.cm-panels) {
  border-color: color-mix(in srgb, var(--line) 88%, transparent);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg-app) 8%);
  color: var(--text);
  font-family: inherit;
  box-shadow: 0 6px 16px rgba(2, 6, 23, 0.1);
}

:global(html[data-theme="dark"] .code-file-editor .cm-panels) {
  background: #101a2b;
  color: #dbe7f3;
}

:deep(.cm-panels-top) {
  max-height: 86px;
  overflow: auto;
  z-index: 6;
}

:deep(.cm-search) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 6px 8px;
}

:deep(.cm-search input) {
  min-height: 25px;
  width: clamp(136px, 18vw, 220px);
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text);
}

:deep(.cm-search button) {
  min-height: 25px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  white-space: nowrap;
}

:deep(.cm-scroller::-webkit-scrollbar) {
  width: 12px;
  height: 12px;
}

:deep(.cm-scroller::-webkit-scrollbar-track) {
  background: transparent;
}

:deep(.cm-scroller::-webkit-scrollbar-thumb) {
  border: 3px solid transparent;
  border-radius: 999px;
  background: color-mix(in srgb, var(--muted) 42%, transparent);
  background-clip: padding-box;
}

:deep(.cm-scroller::-webkit-scrollbar-thumb:hover) {
  background: color-mix(in srgb, var(--muted) 64%, transparent);
  background-clip: padding-box;
}

@media (max-width: 780px) {
  .code-file-editor__searchbar {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: stretch;
    gap: 5px;
    padding: 5px 7px;
  }

  .code-file-editor__search-actions {
    grid-column: 1 / -1;
    justify-content: flex-start;
    padding-bottom: 1px;
  }

  .code-file-editor__search-field {
    gap: 0;
  }

  .code-file-editor__search-field span {
    display: none;
  }

  .code-file-editor__search-field input {
    min-height: 25px;
    padding: 0 7px;
    font-size: 12px;
  }

  .code-file-editor__search-actions button {
    min-height: 25px;
    padding: 0 7px;
    font-size: 11px;
  }

  .code-file-editor__search-actions .code-file-editor__toggle {
    width: 28px;
  }

  .code-file-editor__search-actions .code-file-editor__close-search {
    width: 26px;
  }
}
</style>
