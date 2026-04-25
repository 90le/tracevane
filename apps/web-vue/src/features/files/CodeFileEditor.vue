<template>
  <div class="code-file-editor" :class="{ 'is-readonly': readOnly }">
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
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { searchKeymap, highlightSelectionMatches, openSearchPanel } from "@codemirror/search";
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(
  defineProps<{
    modelValue: string;
    path?: string;
    readOnly?: boolean;
    dark?: boolean;
    searchRequest?: number;
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
let view: EditorView | null = null;
const editableCompartment = new Compartment();
const languageCompartment = new Compartment();
const themeCompartment = new Compartment();
let syncingFromOutside = false;
let languageLoadToken = 0;

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
      fontFamily: "\"IBM Plex Mono\", \"SFMono-Regular\", \"Cascadia Code\", \"Fira Code\", monospace",
      lineHeight: "1.58",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "10px 0 80px",
    },
    ".cm-line": {
      padding: "0 18px 0 8px",
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
      backgroundColor: "#ffffff",
      color: "#1f2937",
    },
    ".cm-gutters": {
      backgroundColor: "#f8fafc",
      color: "#7c8798",
    },
    ".cm-cursor": {
      borderLeftColor: "#1f6feb",
    },
  });
  const darkTheme = EditorView.theme({
    "&": {
      backgroundColor: "#0b1220",
      color: "#dbe7f3",
    },
    ".cm-scroller": {
      backgroundColor: "#0b1220",
    },
    ".cm-gutters": {
      backgroundColor: "#08111d",
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
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
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
    openSearchPanel(view);
    view.focus();
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
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  overflow: hidden;
  background: color-mix(in srgb, var(--surface) 96%, transparent);
}

:global(html[data-theme="dark"] .code-file-editor) {
  background: #0b1220;
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
  outline: 1px solid color-mix(in srgb, var(--acc) 32%, transparent);
  outline-offset: -1px;
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
  box-shadow: 0 10px 24px rgba(2, 6, 23, 0.12);
}

:global(html[data-theme="dark"] .code-file-editor .cm-panels) {
  background: #101a2b;
  color: #dbe7f3;
}

:deep(.cm-panels-top) {
  max-height: 92px;
  overflow: auto;
  z-index: 6;
}

:deep(.cm-search) {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  align-items: center;
  min-width: max-content;
  padding: 7px 8px;
}

:deep(.cm-search input) {
  min-height: 26px;
  min-width: 150px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--input-bg);
  color: var(--text);
}

:deep(.cm-search button) {
  min-height: 26px;
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
</style>
