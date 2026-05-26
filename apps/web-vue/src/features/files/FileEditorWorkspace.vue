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
import "./files-workspace.css";

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
