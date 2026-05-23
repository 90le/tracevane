<template>
  <section
    class="file-manager-editor-drawer"
    :class="{ 'file-manager-editor-drawer--maximized': maximized }"
    aria-live="polite"
  >
    <header class="file-manager-editor-drawer__head">
      <div class="file-manager-editor-drawer__tabs" role="tablist">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          type="button"
          class="file-manager-editor-drawer__tab"
          :class="{ active: tab.id === activeTabId, dirty: tab.draft !== tab.content, error: Boolean(tab.error) }"
          role="tab"
          :aria-selected="tab.id === activeTabId"
          :title="tab.path"
          @click="emit('setActive', tab.id)"
        >
          <span class="file-manager-editor-drawer__tab-icon">{{ editorFileIconForName(tab.name) }}</span>
          <strong>{{ tab.name || text("未命名", "Untitled") }}</strong>
          <span v-if="tab.draft !== tab.content" class="file-manager-editor-drawer__dirty" aria-hidden="true"></span>
          <span
            role="button"
            tabindex="0"
            class="file-manager-editor-drawer__tab-close"
            :aria-label="text('关闭文件', 'Close file')"
            @click.stop="emit('close', tab.id)"
            @keydown.enter.stop.prevent="emit('close', tab.id)"
            @keydown.space.stop.prevent="emit('close', tab.id)"
          >
            <X class="drawer-close-icon" aria-hidden="true" />
          </span>
        </button>
      </div>

      <div class="file-manager-editor-drawer__actions">
        <span v-if="state.readOnly" class="file-manager-editor-drawer__badge">
          {{ text("只读", "Read only") }}
        </span>
        <button
          type="button"
          class="file-manager-editor-drawer__button"
          :title="text('搜索/替换', 'Search/replace')"
          :disabled="state.content == null"
          @click="emit('search')"
        >
          {{ text("查找", "Find") }}
        </button>
        <button
          type="button"
          class="file-manager-editor-drawer__button"
          :disabled="!downloadUrl"
          @click="emit('download')"
        >
          {{ text("下载", "Download") }}
        </button>
        <button
          type="button"
          class="file-manager-editor-drawer__button"
          :disabled="loading || !dirty"
          @click="emit('reset')"
        >
          {{ text("回退", "Revert") }}
        </button>
        <button
          type="button"
          class="file-manager-editor-drawer__button file-manager-editor-drawer__button--primary"
          :disabled="loading || saving || state.readOnly || !dirty"
          @click="emit('save')"
        >
          {{ saving ? text("保存中…", "Saving...") : text("保存", "Save") }}
        </button>
        <button
          type="button"
          class="file-manager-editor-drawer__button"
          @click="emit('update:maximized', !maximized)"
        >
          {{ maximized ? text("还原", "Restore") : text("最大化", "Maximize") }}
        </button>
        <button
          type="button"
          class="file-manager-editor-drawer__button file-manager-editor-drawer__button--ghost"
          @click="emit('close')"
        >
          {{ text("关闭", "Close") }}
        </button>
      </div>
    </header>

    <div class="file-manager-editor-drawer__body">
      <aside class="file-manager-editor-sidebar">
        <section class="file-manager-editor-sidebar__section">
          <div class="file-manager-editor-sidebar__label">
            <span>{{ text("打开文件", "Open files") }}</span>
            <strong>{{ tabs.length }}</strong>
          </div>
          <button
            v-for="tab in tabs"
            :key="`side-${tab.id}`"
            type="button"
            class="file-manager-editor-sidebar__file"
            :class="{ active: tab.id === activeTabId, dirty: tab.draft !== tab.content }"
            :title="tab.path"
            @click="emit('setActive', tab.id)"
          >
            <span>{{ editorFileIconForName(tab.name) }}</span>
            <strong>{{ tab.name }}</strong>
          </button>
        </section>

        <section v-if="recentFiles.length" class="file-manager-editor-sidebar__section">
          <div class="file-manager-editor-sidebar__label">
            <span>{{ text("最近打开", "Recent") }}</span>
            <strong>{{ recentFiles.length }}</strong>
          </div>
          <button
            v-for="item in recentFiles"
            :key="`recent-${item.id}`"
            type="button"
            class="file-manager-editor-sidebar__file"
            :class="{ active: item.id === activeTabId }"
            :title="item.path"
            @click="emit('openRecent', item)"
          >
            <span>{{ editorFileIconForName(item.name) }}</span>
            <strong>{{ item.name }}</strong>
          </button>
        </section>

        <section v-else class="file-manager-editor-sidebar__section file-manager-editor-sidebar__section--empty">
          <p class="file-manager-editor-sidebar__hint">
            {{ text("最近打开的文件会显示在这里。", "Recently opened files will appear here.") }}
          </p>
        </section>
      </aside>

      <main class="file-manager-editor-drawer__main">
        <div
          v-if="loading"
          class="file-manager-editor-drawer__empty"
        >
          {{ text("正在加载文件内容…", "Loading file content...") }}
        </div>
        <div
          v-else-if="state.error"
          class="file-manager-editor-drawer__empty file-manager-editor-drawer__empty--error"
        >
          {{ state.error }}
        </div>
        <div v-else-if="state.content == null" class="file-manager-editor-drawer__empty">
          {{ text("当前文件没有可编辑内容。", "This file has no editable content.") }}
        </div>
        <AsyncCodeFileEditor
          v-else
          :model-value="modelValue"
          class="file-manager-editor-drawer__editor"
          :path="state.path"
          :read-only="state.readOnly"
          :dark="theme === 'dark'"
          :search-request="searchRequest"
          :text="text"
          @update:model-value="emit('update:modelValue', $event)"
          @save="emit('save')"
        />
      </main>
    </div>

    <footer class="file-manager-editor-drawer__statusbar">
      <span class="file-manager-editor-drawer__statusbar-path" :title="state.path">{{ state.path }}</span>
      <span>{{ languageLabel }}</span>
      <span>{{ text(`${lineCount} 行`, `${lineCount} lines`) }}</span>
      <span>{{ text(`${characterCount} 字符`, `${characterCount} chars`) }}</span>
      <span>UTF-8</span>
      <span>LF</span>
      <span v-if="state.truncated">
        {{ text("已截断", "Truncated") }}
      </span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import { X } from "@lucide/vue";

const AsyncCodeFileEditor = defineAsyncComponent(() => import("./CodeFileEditor.vue"));

interface EditorFileTab {
  id: string;
  rootId: string;
  apiPath: string;
  path: string;
  name: string;
  readOnly: boolean;
  truncated: boolean;
  content: string | null;
  draft: string;
  error: string | null;
  loading: boolean;
  saving: boolean;
}

interface RecentEditorFile {
  id: string;
  rootId: string;
  apiPath: string;
  path: string;
  name: string;
  openedAt: string;
}

interface EditorStateSnapshot {
  visible: boolean;
  rootId: string;
  apiPath: string;
  path: string;
  name: string;
  readOnly: boolean;
  truncated: boolean;
  content: string | null;
  error: string | null;
}

defineProps<{
  modelValue: string;
  tabs: EditorFileTab[];
  activeTabId: string;
  maximized: boolean;
  state: EditorStateSnapshot;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  downloadUrl: string;
  recentFiles: RecentEditorFile[];
  lineCount: number;
  characterCount: number;
  languageLabel: string;
  searchRequest: number;
  theme: string;
  text: (zh: string, en: string) => string;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
  "update:maximized": [value: boolean];
  setActive: [tabId: string];
  close: [tabId?: string];
  search: [];
  download: [];
  reset: [];
  save: [];
  openRecent: [item: RecentEditorFile];
}>();

function editorFileIconForName(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  const ext = match?.[1] || "";
  if (["json", "jsonl"].includes(ext)) return "{}";
  if (["md", "markdown"].includes(ext)) return "MD";
  if (["css", "scss", "less"].includes(ext)) return "#";
  if (["html", "htm", "vue"].includes(ext)) return "<>";
  if (["yaml", "yml", "toml", "ini", "env"].includes(ext)) return "::";
  if (["sh"].includes(ext)) return "$";
  return "fx";
}
</script>

<style scoped>
.file-manager-editor-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 1180;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(1040px, calc(100vw - var(--sidebar-width, 280px)));
  max-height: 100%;
  border-left: 1px solid var(--file-manager-border);
  background: var(--file-manager-bg);
  box-shadow: -10px 0 28px rgba(15, 23, 42, 0.14);
  overflow: hidden;
}

.file-manager-editor-drawer--maximized {
  inset: 0 0 0 var(--sidebar-width, 280px);
  width: auto;
  border-left: 0;
}

.file-manager-editor-drawer__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  height: 44px;
  min-height: 44px;
  padding: 0 8px;
  border-bottom: 1px solid var(--file-manager-border);
  background: var(--file-manager-panel-strong);
  overflow: hidden;
}

.file-manager-editor-drawer__tabs {
  display: flex;
  align-items: stretch;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.file-manager-editor-drawer__tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 clamp(120px, 14vw, 178px);
  min-width: 0;
  gap: 6px;
  max-width: 190px;
  margin-top: 5px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-bottom: 0;
  border-radius: 6px 6px 0 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.file-manager-editor-drawer__tab.active {
  border-color: var(--file-manager-border);
  background: var(--file-manager-panel);
}

.file-manager-editor-drawer__tab.active::before {
  content: "";
  position: absolute;
  inset: 0 0 auto;
  height: 2px;
  background: var(--acc);
}

.file-manager-editor-drawer__tab.error {
  color: var(--danger);
}

.file-manager-editor-drawer__tab strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-drawer__tab-icon,
.file-manager-editor-sidebar__file span {
  display: inline-grid;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 4px;
  color: color-mix(in srgb, var(--acc) 80%, var(--text));
  font-weight: 900;
  line-height: 1;
}

.file-manager-editor-drawer__tab-icon {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  font-size: 10px;
}

.file-manager-editor-drawer__dirty {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning, #f59e0b) 78%, #f59e0b);
}

.file-manager-editor-drawer__tab-close {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 19px;
  height: 19px;
  border-radius: 4px;
  color: var(--muted);
  font-weight: 900;
}

.file-manager-editor-drawer__tab-close:hover {
  background: var(--file-manager-hover);
  color: var(--text);
}

.file-manager-editor-drawer__actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-end;
  align-items: center;
  gap: 5px;
  min-width: 0;
  max-width: min(520px, 42vw);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.file-manager-editor-drawer__badge,
.file-manager-editor-drawer__button {
  display: inline-grid;
  align-items: center;
  min-height: 25px;
  border: 1px solid var(--line);
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.file-manager-editor-drawer__badge {
  padding: 0 8px;
  color: var(--muted);
  font-weight: 700;
}

.file-manager-editor-drawer__button {
  flex: 0 0 auto;
  padding: 0 8px;
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.file-manager-editor-drawer__button:hover {
  border-color: color-mix(in srgb, var(--acc) 36%, var(--line));
  background: color-mix(in srgb, var(--button-secondary-bg) 82%, var(--acc) 10%);
  color: var(--text);
}

.file-manager-editor-drawer__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-manager-editor-drawer__button--primary {
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.file-manager-editor-drawer__button--ghost {
  color: var(--muted);
}

.file-manager-editor-drawer__body {
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  background: var(--file-manager-panel);
}

.file-manager-editor-sidebar {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--file-manager-border);
  background: var(--file-manager-panel-strong);
  overflow: hidden;
}

.file-manager-editor-sidebar__section {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  align-content: start;
  min-width: 0;
  min-height: 72px;
  max-height: 50%;
  padding: 7px;
  border-bottom: 1px solid var(--file-manager-border);
  overflow-y: auto;
  scrollbar-width: thin;
}

.file-manager-editor-sidebar__section--empty {
  flex: 1 1 auto;
  max-height: none;
  border-bottom: 0;
}

.file-manager-editor-sidebar__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 2px 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.file-manager-editor-sidebar__label strong {
  display: inline-grid;
  min-width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid var(--file-manager-border);
  border-radius: 999px;
  color: var(--text);
  font-size: 11px;
  letter-spacing: 0;
}

.file-manager-editor-sidebar__hint {
  margin: 0;
  padding: 0 2px 6px;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-sidebar__file {
  display: grid;
  grid-template-columns: 23px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 29px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.file-manager-editor-sidebar__file span {
  width: 19px;
  height: 19px;
  font-size: 9px;
}

.file-manager-editor-sidebar__file strong {
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-sidebar__file:hover {
  background: var(--file-manager-hover);
  color: var(--text);
}

.file-manager-editor-sidebar__file.active {
  border-color: var(--file-manager-border);
  background: var(--file-manager-active);
  color: var(--text);
}

.file-manager-editor-drawer__main {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.file-manager-editor-drawer__empty {
  display: grid;
  place-items: center;
  min-height: 320px;
  height: 100%;
  padding: 24px;
  color: var(--muted);
  text-align: center;
}

.file-manager-editor-drawer__empty--error {
  color: var(--danger);
}

.file-manager-editor-drawer__editor {
  min-width: 0;
  min-height: 0;
}

.file-manager-editor-drawer__statusbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 23px;
  padding: 0 9px;
  border-top: 1px solid var(--line);
  background: var(--file-manager-panel-strong);
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: thin;
}

.file-manager-editor-drawer__statusbar-path {
  flex: 1 1 auto;
  min-width: 160px;
  overflow: hidden;
  color: color-mix(in srgb, var(--muted) 82%, var(--text));
  text-overflow: ellipsis;
}

:deep(.code-file-editor),
:deep(.code-file-editor__host),
:deep(.cm-editor),
:deep(.cm-scroller) {
  height: 100%;
  min-height: 0;
}

@media (max-width: 920px) {
  .file-manager-editor-drawer {
    inset: 46px 0 0;
    z-index: 1080;
    width: 100%;
    border-left: 0;
  }

  .file-manager-editor-drawer--maximized {
    inset: 46px 0 0;
  }

  .file-manager-editor-drawer__head {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 30px 28px;
    align-items: stretch;
    gap: 5px;
    height: 68px;
    min-height: 68px;
    padding: 5px 8px;
  }

  .file-manager-editor-drawer__tab {
    flex-basis: 124px;
    max-width: 152px;
    margin-top: 0;
    padding: 0 6px;
  }

  .file-manager-editor-drawer__actions {
    justify-content: start;
    width: 100%;
    max-width: 100%;
    padding-bottom: 2px;
  }

  .file-manager-editor-drawer__button,
  .file-manager-editor-drawer__badge {
    min-height: 24px;
    font-size: 11px;
  }

  .file-manager-editor-drawer__body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .file-manager-editor-sidebar {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    min-height: 48px;
    max-height: 48px;
    padding: 6px 8px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--file-manager-border);
    scrollbar-width: thin;
  }

  .file-manager-editor-sidebar__section,
  .file-manager-editor-sidebar__section--empty {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 0;
    max-height: none;
    padding: 0;
    border-bottom: 0;
    overflow: visible;
  }

  .file-manager-editor-sidebar__section:not(:first-child) {
    display: none;
  }

  .file-manager-editor-sidebar__label {
    display: none;
  }

  .file-manager-editor-sidebar__file {
    flex: 0 0 118px;
    grid-template-columns: 20px minmax(0, 1fr);
    min-height: 34px;
    max-width: 150px;
    border-color: var(--file-manager-border);
    background: color-mix(in srgb, var(--file-manager-panel) 78%, transparent);
  }

  .file-manager-editor-sidebar__file span {
    width: 18px;
    height: 18px;
  }

  .file-manager-editor-sidebar__file strong {
    font-size: 11px;
  }

  .file-manager-editor-drawer__statusbar {
    gap: 8px;
    min-height: 21px;
    padding: 0 7px;
    font-size: 10px;
  }

  .file-manager-editor-drawer__statusbar span:nth-child(5),
  .file-manager-editor-drawer__statusbar span:nth-child(6) {
    display: none;
  }
}
</style>
