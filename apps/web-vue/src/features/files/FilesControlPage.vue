<template>
  <section
    class="file-manager-page"
    tabindex="0"
    @keydown="handleFileManagerKeydown"
  >
    <div
      v-if="noticeMessage"
      class="file-manager-notice"
      :class="`file-manager-notice--${noticeMessage.kind}`"
    >
      {{ noticeMessage.text }}
    </div>

    <div v-if="loading && !driver" class="file-manager-loading">
      {{ text("正在加载文件管理器…", "Loading file manager...") }}
    </div>

    <VueFinder
      v-else-if="driver"
      :key="viewerKey"
      :id="viewerId"
      class="studio-file-explorer"
      :driver="driver"
      :locale="vueFinderLocale"
      :features="explorerFeatures"
      :config="explorerConfig"
      :context-menu-items="explorerContextMenuItems"
      @error="handleExplorerError"
      @notify="handleNotify"
      @select="handleExplorerSelect"
      @path-change="handleExplorerPathChange"
      @file-dclick="handleFileDclick"
    >
      <template #icon="{ item, view }">
        <span
          class="studio-file-icon"
          :class="[
            `studio-file-icon--${explorerItemIconKind(item)}`,
            { 'studio-file-icon--grid': view === 'grid' },
          ]"
          :title="explorerItemIconLabel(item)"
          :aria-label="explorerItemIconLabel(item)"
        >
          <span class="studio-file-icon__shape" aria-hidden="true">
            <span class="studio-file-icon__fold"></span>
            <span
              v-if="item.type === 'dir'"
              class="studio-file-icon__folder-tab"
            ></span>
            <span
              v-else
              class="studio-file-icon__extension"
            >
              {{ explorerItemIconText(item) }}
            </span>
          </span>
        </span>
      </template>

      <template #status-bar>
        <div class="file-manager-statusbar">
          <span>{{ text(`已选 ${selectedItems.length} 项`, `${selectedItems.length} selected`) }}</span>
          <button
            type="button"
            class="file-manager-statusbar__button"
            @click="refreshExplorer"
          >
            {{ text("刷新", "Refresh") }}
          </button>
          <button
            type="button"
            class="file-manager-statusbar__button"
            @click="quickCreateDirectory"
          >
            {{ text("新建文件夹", "New folder") }}
          </button>
          <button
            type="button"
            class="file-manager-statusbar__button"
            @click="quickCreateFile"
          >
            {{ text("新建文件", "New file") }}
          </button>
          <button
            v-if="selectedItems.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="putSelectedItemsOnClipboard('copy')"
          >
            {{ text("复制", "Copy") }}
          </button>
          <button
            v-if="selectedItems.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="putSelectedItemsOnClipboard('move')"
          >
            {{ text("剪切", "Cut") }}
          </button>
          <button
            v-if="selectedItems.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="copySelectedPathsToClipboard"
          >
            {{ text("复制路径", "Copy path") }}
          </button>
          <button
            v-if="selectedItems.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="duplicateSelectedItems"
          >
            {{ selectedItems.length > 1 ? text(`创建副本 ${selectedItems.length}`, `Duplicate ${selectedItems.length}`) : text("创建副本", "Duplicate") }}
          </button>
          <button
            v-if="selectedSingleItem"
            type="button"
            class="file-manager-statusbar__button"
            @click="openDetailsForSelection"
          >
            {{ text("详情", "Details") }}
          </button>
          <button
            v-if="fileClipboard"
            type="button"
            class="file-manager-statusbar__button file-manager-statusbar__button--primary"
            @click="pasteFileClipboardIntoCurrentDirectory"
          >
            {{ fileClipboardLabel }}
          </button>
          <button
            v-if="fileClipboard"
            type="button"
            class="file-manager-statusbar__button"
            @click="clearFileClipboard"
          >
            {{ text("清空剪贴板", "Clear clipboard") }}
          </button>
          <button
            v-if="selectedCodeFiles.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="openEditorForItems(selectedCodeFiles)"
          >
            {{ selectedCodeFiles.length > 1 ? text(`编辑 ${selectedCodeFiles.length}`, `Edit ${selectedCodeFiles.length}`) : text("编辑", "Edit") }}
          </button>
          <button
            v-if="selectedArchiveTarget"
            type="button"
            class="file-manager-statusbar__button"
            @click="downloadArchiveForItems(selectedItems)"
          >
            {{ text("打包下载", "Zip") }}
          </button>
          <button
            v-if="selectedZipFiles.length"
            type="button"
            class="file-manager-statusbar__button"
            @click="unarchiveItems(selectedZipFiles)"
          >
            {{ selectedZipFiles.length > 1 ? text(`解压 ${selectedZipFiles.length}`, `Extract ${selectedZipFiles.length}`) : text("解压", "Extract") }}
          </button>
          <span class="file-manager-statusbar__spacer"></span>
          <div class="file-manager-view-controls" :aria-label="text('显示选项', 'View options')">
            <span class="file-manager-view-controls__label">{{ text("显示", "View") }}</span>
            <button
              type="button"
              class="file-manager-view-controls__button"
              :class="{ active: explorerUiPrefs.menuBar }"
              @click="toggleExplorerUi('menuBar')"
            >
              {{ text("菜单", "Menu") }}
            </button>
            <button
              type="button"
              class="file-manager-view-controls__button"
              :class="{ active: explorerUiPrefs.toolbar }"
              @click="toggleExplorerUi('toolbar')"
            >
              {{ text("工具栏", "Toolbar") }}
            </button>
            <button
              type="button"
              class="file-manager-view-controls__button"
              :class="{ active: explorerUiPrefs.treeView }"
              @click="toggleExplorerUi('treeView')"
            >
              {{ text("目录树", "Tree") }}
            </button>
            <button
              type="button"
              class="file-manager-view-controls__button"
              :class="{ active: explorerUiPrefs.thumbnails }"
              @click="toggleExplorerUi('thumbnails')"
            >
              {{ text("缩略图", "Thumbs") }}
            </button>
            <button
              type="button"
              class="file-manager-view-controls__button file-manager-view-controls__button--wide"
              @click="cycleExplorerDensity"
            >
              {{ text("图标", "Icons") }} · {{ explorerDensityLabel }}
            </button>
          </div>
        </div>
      </template>
    </VueFinder>

    <div v-else class="file-manager-loading file-manager-loading--error">
      {{ text("文件管理器不可用", "File manager unavailable") }}
    </div>

    <section
      v-if="detailsItem"
      class="file-manager-details"
      aria-live="polite"
      @click.self="closeDetails"
    >
      <article class="file-manager-details__panel">
        <header class="file-manager-details__head">
          <span
            class="studio-file-icon studio-file-icon--grid"
            :class="`studio-file-icon--${explorerItemIconKind(detailsItem)}`"
            aria-hidden="true"
          >
            <span class="studio-file-icon__shape">
              <span class="studio-file-icon__fold"></span>
              <span
                v-if="detailsItem.type === 'dir'"
                class="studio-file-icon__folder-tab"
              ></span>
              <span v-else class="studio-file-icon__extension">
                {{ explorerItemIconText(detailsItem) }}
              </span>
            </span>
          </span>
          <div>
            <strong>{{ detailsItem.basename }}</strong>
            <span>{{ detailsItem.path }}</span>
          </div>
          <button type="button" class="file-manager-details__close" @click="closeDetails">
            ×
          </button>
        </header>

        <dl class="file-manager-details__grid">
          <div>
            <dt>{{ text("类型", "Type") }}</dt>
            <dd>{{ detailsTypeLabel }}</dd>
          </div>
          <div>
            <dt>{{ text("大小", "Size") }}</dt>
            <dd>{{ formatFileSize(detailsItem.file_size) }}</dd>
          </div>
          <div>
            <dt>{{ text("修改时间", "Modified") }}</dt>
            <dd>{{ formatUnixTimestamp(detailsItem.last_modified) }}</dd>
          </div>
          <div>
            <dt>{{ text("存储", "Storage") }}</dt>
            <dd>{{ detailsItem.storage }}</dd>
          </div>
          <div>
            <dt>{{ text("扩展名", "Extension") }}</dt>
            <dd>{{ detailsItem.extension || "-" }}</dd>
          </div>
          <div>
            <dt>MIME</dt>
            <dd>{{ detailsItem.mime_type || "-" }}</dd>
          </div>
        </dl>

        <div class="file-manager-details__actions">
          <button type="button" class="file-manager-statusbar__button" @click="copyPathsToClipboard([detailsItem])">
            {{ text("复制路径", "Copy path") }}
          </button>
          <button
            v-if="isCodeEditableItem(detailsItem)"
            type="button"
            class="file-manager-statusbar__button"
            @click="openDetailsItemInEditor"
          >
            {{ text("编辑", "Edit") }}
          </button>
          <button type="button" class="file-manager-statusbar__button" @click="duplicateItems([detailsItem])">
            {{ text("创建副本", "Duplicate") }}
          </button>
          <button
            v-if="detailsItem.type === 'file'"
            type="button"
            class="file-manager-statusbar__button"
            @click="downloadDetailItem"
          >
            {{ text("下载", "Download") }}
          </button>
        </div>
      </article>
    </section>

    <section
      v-if="editorTabs.length"
      class="file-manager-editor-drawer"
      :class="{ 'file-manager-editor-drawer--maximized': editorMaximized }"
      aria-live="polite"
    >
      <div class="file-manager-editor-drawer__head">
        <div class="file-manager-editor-drawer__title">
          <div class="file-manager-editor-drawer__tabs" role="tablist">
            <button
              v-for="tab in editorTabs"
              :key="tab.id"
              type="button"
              class="file-manager-editor-drawer__tab"
              :class="{ active: tab.id === activeEditorId, dirty: tab.draft !== tab.content, error: Boolean(tab.error) }"
              role="tab"
              :aria-selected="tab.id === activeEditorId"
              @click="setActiveEditor(tab.id)"
            >
              <span class="file-manager-editor-drawer__tab-icon">{{ editorFileIconForName(tab.name) }}</span>
              <strong>{{ tab.name || text("未命名", "Untitled") }}</strong>
              <span v-if="tab.draft !== tab.content" class="file-manager-editor-drawer__dirty" aria-hidden="true"></span>
              <span
                role="button"
                tabindex="0"
                class="file-manager-editor-drawer__tab-close"
                :aria-label="text('关闭文件', 'Close file')"
                @click.stop="closeEditor(tab.id)"
                @keydown.enter.stop.prevent="closeEditor(tab.id)"
                @keydown.space.stop.prevent="closeEditor(tab.id)"
              >
                ×
              </span>
            </button>
          </div>
          <span class="file-manager-editor-drawer__path" :title="editorState.path">{{ editorState.path }}</span>
        </div>

        <div class="file-manager-editor-drawer__actions">
          <span v-if="editorState.readOnly" class="file-manager-editor-drawer__badge">
            {{ text("只读", "Read only") }}
          </span>
          <button
            type="button"
            class="file-manager-editor-drawer__button"
            :disabled="editorState.content == null"
            @click="requestEditorSearch"
          >
            {{ text("搜索/替换", "Search/replace") }}
          </button>
          <button
            type="button"
            class="file-manager-editor-drawer__button"
            :disabled="!editorDownloadUrl"
            @click="downloadEditorFile"
          >
            {{ text("下载", "Download") }}
          </button>
          <button
            type="button"
            class="file-manager-editor-drawer__button"
            :disabled="editorLoading || !editorDirty"
            @click="resetEditor"
          >
            {{ text("回退", "Revert") }}
          </button>
          <button
            type="button"
            class="file-manager-editor-drawer__button file-manager-editor-drawer__button--primary"
            :disabled="editorLoading || editorSaving || editorState.readOnly || !editorDirty"
            @click="saveEditor"
          >
            {{ editorSaving ? text("保存中…", "Saving...") : text("保存", "Save") }}
          </button>
          <button
            type="button"
            class="file-manager-editor-drawer__button"
            @click="editorMaximized = !editorMaximized"
          >
            {{ editorMaximized ? text("还原", "Restore") : text("最大化", "Maximize") }}
          </button>
          <button
            type="button"
            class="file-manager-editor-drawer__button"
            @click="closeEditor()"
          >
            {{ text("关闭", "Close") }}
          </button>
        </div>
      </div>

      <div class="file-manager-editor-drawer__body">
        <aside class="file-manager-editor-sidebar">
          <div class="file-manager-editor-sidebar__brand">
            <strong>{{ text("编辑器", "Editor") }}</strong>
            <span>{{ text("当前目录与打开文件", "Folder and open files") }}</span>
          </div>

          <div class="file-manager-editor-sidebar__section">
            <div class="file-manager-editor-sidebar__label">
              <span>{{ text("打开文件", "Open files") }}</span>
              <strong>{{ editorTabs.length }}</strong>
            </div>
            <button
              v-for="tab in editorTabs"
              :key="`side-${tab.id}`"
              type="button"
              class="file-manager-editor-sidebar__file"
              :class="{ active: tab.id === activeEditorId, dirty: tab.draft !== tab.content }"
              @click="setActiveEditor(tab.id)"
            >
              <span>{{ editorFileIconForName(tab.name) }}</span>
              <strong>{{ tab.name }}</strong>
            </button>
          </div>

          <div class="file-manager-editor-sidebar__section">
            <div class="file-manager-editor-sidebar__label">
              <span>{{ text("当前目录", "Current folder") }}</span>
              <strong>{{ editorDirectoryEntries.length }}</strong>
            </div>
            <p class="file-manager-editor-sidebar__path">{{ editorDirectoryPath || "/" }}</p>
            <button
              v-for="entry in editorDirectoryEntries"
              :key="`dir-${entry.path}`"
              type="button"
              class="file-manager-editor-sidebar__file"
              :class="{ active: entry.path === editorState.apiPath }"
              :disabled="!isCodeEditableEntry(entry)"
              @click="openEditorForEntry(entry)"
            >
              <span>{{ editorFileIconForName(entry.name) }}</span>
              <strong>{{ entry.name }}</strong>
            </button>
            <p v-if="editorDirectoryLoading" class="file-manager-editor-sidebar__hint">
              {{ text("正在加载目录…", "Loading folder...") }}
            </p>
            <p v-else-if="!editorDirectoryEntries.length" class="file-manager-editor-sidebar__hint">
              {{ text("当前目录没有可编辑文件。", "No editable files in this folder.") }}
            </p>
          </div>
        </aside>

        <div
          v-if="editorLoading"
          class="file-manager-editor-drawer__empty"
        >
          {{ text("正在加载文件内容…", "Loading file content...") }}
        </div>
        <div
          v-else-if="editorState.error"
          class="file-manager-editor-drawer__empty file-manager-editor-drawer__empty--error"
        >
          {{ editorState.error }}
        </div>
        <div v-else-if="editorState.content == null" class="file-manager-editor-drawer__empty">
          {{ text("当前文件没有可编辑内容。", "This file has no editable content.") }}
        </div>
        <AsyncCodeFileEditor
          v-else
          v-model="editorDraft"
          class="file-manager-editor-drawer__editor"
          :path="editorState.path"
          :read-only="editorState.readOnly"
          :dark="resolvedTheme === 'dark'"
          :search-request="editorSearchRequest"
          @save="saveEditor"
        />
      </div>

      <footer class="file-manager-editor-drawer__statusbar">
        <span>{{ editorLanguageLabel }}</span>
        <span>{{ text(`${editorLineCount} 行`, `${editorLineCount} lines`) }}</span>
        <span>{{ text(`${editorCharacterCount} 字符`, `${editorCharacterCount} chars`) }}</span>
        <span>UTF-8</span>
        <span>LF</span>
        <span v-if="editorState.truncated">
          {{ text("已截断", "Truncated") }}
        </span>
      </footer>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { VueFinder, contextMenuItems as builtInContextMenuItems } from "vuefinder";
import type { ConfigDefaults, DirEntry, FeaturesConfig, Item as VueFinderContextItem } from "vuefinder";
import type { FileEntrySummary, FilesReadPayload, FilesSummaryPayload, FileRootSummary } from "../../../../../types/files";
import { useLocalePreference } from "../../shared/locale";
import { useThemePreference } from "../../shared/theme";
import { browseDirectory, buildArchiveDownloadUrl, buildFileDownloadUrl, copyPath, createDirectory, createFile, fetchFilesSummary, movePath, readFileContent, saveFileContent, unarchiveFile } from "./api";
import { StudioFilesVueFinderDriver, type StudioFileStorageRoot } from "./vuefinder-driver";

const AsyncCodeFileEditor = defineAsyncComponent(() => import("./CodeFileEditor.vue"));

defineProps<{
  pageEyebrow: string;
}>();

const { locale, text } = useLocalePreference();
const { resolvedTheme } = useThemePreference();

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

interface FileClipboardItem {
  rootId: string;
  path: string;
  name: string;
}

interface FileClipboardState {
  mode: "copy" | "move";
  items: FileClipboardItem[];
}

interface FileExplorerTarget {
  rootId: string;
  directoryPath: string;
}

type ExplorerDensity = "compact" | "comfortable" | "visual";

interface ExplorerUiPrefs {
  menuBar: boolean;
  toolbar: boolean;
  treeView: boolean;
  thumbnails: boolean;
  density: ExplorerDensity;
}

type ExplorerUiToggleKey = Exclude<keyof ExplorerUiPrefs, "density">;

const FILE_MANAGER_UI_STORAGE_KEY = "openclaw-studio.files.ui";
const DEFAULT_EXPLORER_UI_PREFS: ExplorerUiPrefs = {
  menuBar: true,
  toolbar: true,
  treeView: true,
  thumbnails: true,
  density: "comfortable",
};
const EXPLORER_DENSITY_ORDER: ExplorerDensity[] = ["compact", "comfortable", "visual"];

function readExplorerUiPrefs(): ExplorerUiPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_EXPLORER_UI_PREFS };
  try {
    const raw = window.localStorage.getItem(FILE_MANAGER_UI_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Partial<ExplorerUiPrefs> : {};
    const density = EXPLORER_DENSITY_ORDER.includes(parsed.density as ExplorerDensity)
      ? parsed.density as ExplorerDensity
      : DEFAULT_EXPLORER_UI_PREFS.density;
    return {
      menuBar: typeof parsed.menuBar === "boolean" ? parsed.menuBar : DEFAULT_EXPLORER_UI_PREFS.menuBar,
      toolbar: typeof parsed.toolbar === "boolean" ? parsed.toolbar : DEFAULT_EXPLORER_UI_PREFS.toolbar,
      treeView: typeof parsed.treeView === "boolean" ? parsed.treeView : DEFAULT_EXPLORER_UI_PREFS.treeView,
      thumbnails: typeof parsed.thumbnails === "boolean" ? parsed.thumbnails : DEFAULT_EXPLORER_UI_PREFS.thumbnails,
      density,
    };
  } catch {
    return { ...DEFAULT_EXPLORER_UI_PREFS };
  }
}

function persistExplorerUiPrefs(prefs: ExplorerUiPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILE_MANAGER_UI_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or privacy mode failures; the current session still updates.
  }
}

const summary = ref<FilesSummaryPayload | null>(null);
const loading = ref(false);
const noticeMessage = ref<{ kind: "success" | "error" | "info" | "warning"; text: string } | null>(null);
const selectedItems = ref<DirEntry[]>([]);
const currentExplorerPath = ref("");
const fileClipboard = ref<FileClipboardState | null>(null);
const detailsItem = ref<DirEntry | null>(null);
const explorerUiPrefs = ref<ExplorerUiPrefs>(readExplorerUiPrefs());
const editorMaximized = ref(false);
const editorTabs = ref<EditorFileTab[]>([]);
const activeEditorId = ref("");
const editorSearchRequest = ref(0);
const editorDirectoryLoading = ref(false);
const editorDirectoryRootId = ref("");
const editorDirectoryPath = ref("");
const editorDirectoryEntries = ref<FileEntrySummary[]>([]);
const viewerRefreshNonce = ref(0);

const viewerId = "studio-files-viewer";
const roots = computed(() => summary.value?.roots || []);
const visibleRoots = computed(() =>
  roots.value.filter((root) => root.id !== "project-root"),
);
const storageRoots = computed<StudioFileStorageRoot[]>(() =>
  visibleRoots.value.map((root) => ({
    id: root.id,
    storage: storageNameForRoot(root),
  })),
);
const vueFinderLocale = computed(() => (locale.value === "zh" ? "zhCN" : "en"));
const viewerKey = computed(
  () => `${viewerId}:${storageRoots.value.map((root) => `${root.id}:${root.storage}`).join("|")}:${vueFinderLocale.value}:${resolvedTheme.value}:${viewerRefreshNonce.value}:${JSON.stringify(explorerUiPrefs.value)}`,
);
const driver = computed(() => {
  if (!storageRoots.value.length) return null;
  return new StudioFilesVueFinderDriver(
    storageRoots.value,
    summary.value?.defaultRootId || "openclaw-root",
    true,
  );
});
const activeEditorTab = computed(
  () =>
    editorTabs.value.find((tab) => tab.id === activeEditorId.value)
    || editorTabs.value[0]
    || null,
);
const editorState = computed(() => {
  const tab = activeEditorTab.value;
  if (!tab) {
    return {
      visible: false,
      rootId: "",
      apiPath: "",
      path: "",
      name: "",
      readOnly: false,
      truncated: false,
      content: null,
      error: null,
    };
  }
  return {
    visible: true,
    rootId: tab.rootId,
    apiPath: tab.apiPath,
    path: tab.path,
    name: tab.name,
    readOnly: tab.readOnly,
    truncated: tab.truncated,
    content: tab.content,
    error: tab.error,
  };
});
const editorDraft = computed({
  get: () => activeEditorTab.value?.draft || "",
  set: (value: string) => {
    const tab = activeEditorTab.value;
    if (tab) tab.draft = value;
  },
});
const editorLoading = computed(() => activeEditorTab.value?.loading || false);
const editorSaving = computed(() => activeEditorTab.value?.saving || false);
const editorDirty = computed(
  () =>
    Boolean(activeEditorTab.value)
    && activeEditorTab.value?.content !== null
    && activeEditorTab.value?.draft !== activeEditorTab.value?.content,
);
const editorDownloadUrl = computed(() => {
  if (!editorState.value.rootId || !editorState.value.apiPath) return "";
  return buildFileDownloadUrl(editorState.value.rootId, editorState.value.apiPath);
});
const selectedArchiveTarget = computed(() => {
  if (!selectedItems.value.length) return null;
  const firstRootId = rootIdForStorage(selectedItems.value[0].storage);
  if (!firstRootId) return null;
  const paths = selectedItems.value.map((item) => ({
    rootId: rootIdForStorage(item.storage),
    path: relativePathFromVueFinderPath(item.path),
  }));
  if (paths.some((item) => !item.path || item.rootId !== firstRootId)) return null;
  return {
    rootId: firstRootId,
    paths: paths.map((item) => item.path),
  };
});
const selectedCodeFiles = computed(
  () => selectedItems.value.filter((item) => isCodeEditableItem(item)),
);
const selectedZipFiles = computed(
  () => selectedItems.value.filter((item) => isZipArchiveItem(item)),
);
const selectedSingleItem = computed(() => selectedItems.value.length === 1 ? selectedItems.value[0] : null);
const currentExplorerTarget = computed<FileExplorerTarget | null>(() => {
  const parsed = parseVueFinderPath(currentExplorerPath.value);
  const rootId =
    rootIdForStorage(parsed.storage)
    || summary.value?.defaultRootId
    || storageRoots.value[0]?.id
    || "";
  if (!rootId) return null;
  return {
    rootId,
    directoryPath: parsed.relativePath,
  };
});
const fileClipboardLabel = computed(() => {
  const clipboard = fileClipboard.value;
  if (!clipboard) return "";
  const count = clipboard.items.length;
  const action = clipboard.mode === "copy" ? text("粘贴复制", "Paste copy") : text("粘贴移动", "Paste move");
  return count > 1 ? text(`${action} ${count}`, `${action} ${count}`) : action;
});
const detailsTypeLabel = computed(() => {
  const item = detailsItem.value;
  if (!item) return "";
  if (item.type === "dir") return text("文件夹", "Folder");
  return item.extension
    ? text(`${item.extension.toUpperCase()} 文件`, `${item.extension.toUpperCase()} file`)
    : text("文件", "File");
});
const explorerDensityLabel = computed(() => {
  if (explorerUiPrefs.value.density === "compact") return text("紧凑", "Compact");
  if (explorerUiPrefs.value.density === "visual") return text("大图标", "Large");
  return text("舒适", "Comfort");
});
const editorLineCount = computed(() => {
  if (!editorDraft.value) return 1;
  return editorDraft.value.split(/\r\n|\r|\n/).length;
});
const editorCharacterCount = computed(() => editorDraft.value.length);
const editorExtension = computed(() => {
  const match = editorState.value.name.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] || "";
});
const editorLanguageLabel = computed(() => {
  const ext = editorExtension.value;
  const labels: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TSX",
    js: "JavaScript",
    jsx: "JSX",
    mjs: "JavaScript",
    cjs: "JavaScript",
    json: "JSON",
    jsonl: "JSONL",
    md: "Markdown",
    markdown: "Markdown",
    html: "HTML",
    htm: "HTML",
    vue: "Vue",
    css: "CSS",
    scss: "SCSS",
    less: "Less",
    py: "Python",
    yaml: "YAML",
    yml: "YAML",
    sql: "SQL",
    sh: "Shell",
    env: "ENV",
    toml: "TOML",
    ini: "INI",
  };
  return labels[ext] || text("纯文本", "Plain text");
});
const explorerContextMenuItems = computed<VueFinderContextItem[]>(() => [
  ...builtInContextMenuItems,
  {
    id: "studio_show_details",
    title: () => text("查看详情", "Show details"),
    action: (_app, items) => {
      const item = items[0] || selectedItems.value[0];
      if (item) openDetailsForItem(item);
    },
    show: (_app, ctx) => Boolean(ctx.target || ctx.items?.length),
    order: 51,
  },
  {
    id: "studio_open_in_editor",
    title: () => text("在代码编辑器中打开", "Open in code editor"),
    action: (_app, items) => {
      const codeItems = items.filter((entry) => isCodeEditableItem(entry));
      const fallbackItems = selectedItems.value.filter((entry) => isCodeEditableItem(entry));
      void openEditorForItems(codeItems.length ? codeItems : fallbackItems);
    },
    show: (_app, ctx) => {
      const candidates = [
        ctx.target,
        ...(ctx.items || []),
        ...selectedItems.value,
      ].filter(Boolean) as DirEntry[];
      return candidates.some((item) => isCodeEditableItem(item));
    },
    order: 52,
  },
  {
    id: "studio_unarchive_current_directory",
    title: () => text("解压到当前目录", "Extract here"),
    action: (_app, items) => {
      const zipItems = items.filter((entry) => isZipArchiveItem(entry));
      const fallbackItems = selectedItems.value.filter((entry) => isZipArchiveItem(entry));
      void unarchiveItems(zipItems.length ? zipItems : fallbackItems);
    },
    show: (_app, ctx) => {
      const items = ctx.items?.length ? ctx.items : ctx.target ? [ctx.target] : [];
      return items.length === 1 && isZipArchiveItem(items[0]);
    },
    order: 92,
  },
  {
    id: "studio_duplicate",
    title: () => text("创建副本", "Duplicate"),
    action: (_app, items) => {
      void duplicateItems(items.length ? items : selectedItems.value);
    },
    show: (_app, ctx) => Boolean(ctx.target || ctx.items?.length),
    order: 115,
  },
  {
    id: "studio_quick_copy",
    title: () => text("复制到 Studio 剪贴板", "Copy to Studio clipboard"),
    action: (_app, items) => {
      putItemsOnClipboard("copy", items);
    },
    show: (_app, ctx) => Boolean(ctx.target || ctx.items?.length),
    order: 116,
  },
  {
    id: "studio_quick_cut",
    title: () => text("剪切到 Studio 剪贴板", "Cut to Studio clipboard"),
    action: (_app, items) => {
      putItemsOnClipboard("move", items);
    },
    show: (_app, ctx) => Boolean(ctx.target || ctx.items?.length),
    order: 117,
  },
  {
    id: "studio_quick_paste",
    title: () => text("粘贴到此处", "Paste here"),
    action: (_app, items) => {
      const target = items.length === 1 && items[0].type === "dir"
        ? targetDirectoryFromItem(items[0])
        : currentExplorerTarget.value;
      void pasteFileClipboard(target);
    },
    show: (_app, ctx) => {
      if (!fileClipboard.value?.items.length) return false;
      if (!ctx.target) return true;
      return ctx.target.type === "dir";
    },
    order: 118,
  },
  {
    id: "studio_copy_path",
    title: () => text("复制路径", "Copy path"),
    action: (_app, items) => {
      void copyPathsToClipboard(items);
    },
    show: (_app, ctx) => Boolean(ctx.target || ctx.items?.length),
    order: 119,
  },
  {
    id: "studio_download_archive",
    title: () => text("下载为压缩包", "Download as zip"),
    action: (_app, items) => {
      if (!items.length) return;
      downloadArchiveForItems(items);
    },
    show: (_app, ctx) => {
      const items = ctx.items?.length ? ctx.items : ctx.target ? [ctx.target] : [];
      if (!items.length) return false;
      const firstRootId = rootIdForStorage(items[0].storage);
      return Boolean(
        firstRootId
        && (items.length > 1 || items[0].type === "dir")
        && items.every((item) => rootIdForStorage(item.storage) === firstRootId),
      );
    },
    order: 91,
  },
]);

const explorerFeatures = computed<FeaturesConfig>(() => ({
  archive: true,
  unarchive: true,
  language: false,
  theme: false,
  search: true,
  rename: true,
  upload: true,
  delete: true,
  preview: true,
  edit: false,
  newfile: true,
  newfolder: true,
  download: true,
  move: true,
  copy: true,
  fullscreen: true,
  history: true,
  pinned: true,
}));

const explorerConfig = computed<ConfigDefaults>(() => ({
  view: explorerUiPrefs.value.density === "visual" ? "grid" : "list",
  showTreeView: explorerUiPrefs.value.treeView,
  showMenuBar: explorerUiPrefs.value.menuBar,
  showToolbar: explorerUiPrefs.value.toolbar,
  showHiddenFiles: true,
  expandTreeByDefault: false,
  showThumbnails: explorerUiPrefs.value.thumbnails,
  persist: true,
  theme: resolvedTheme.value === "light" ? "silver" : "midnight",
  loadingIndicator: "linear",
  listItemHeight: explorerUiPrefs.value.density === "compact" ? 30 : 36,
  listItemGap: explorerUiPrefs.value.density === "compact" ? 0 : 1,
  listIconSize: explorerUiPrefs.value.density === "compact" ? 16 : 20,
  gridItemWidth: explorerUiPrefs.value.density === "visual" ? 150 : 126,
  gridItemHeight: explorerUiPrefs.value.density === "visual" ? 128 : 106,
  gridItemGap: explorerUiPrefs.value.density === "visual" ? 10 : 8,
  gridIconSize: explorerUiPrefs.value.density === "visual" ? 54 : 42,
  notificationPosition: "top-right",
  notificationDuration: 2400,
  notificationVisibleToasts: 4,
}));

function updateExplorerUiPrefs(patch: Partial<ExplorerUiPrefs>): void {
  explorerUiPrefs.value = {
    ...explorerUiPrefs.value,
    ...patch,
  };
  persistExplorerUiPrefs(explorerUiPrefs.value);
}

function toggleExplorerUi(key: ExplorerUiToggleKey): void {
  updateExplorerUiPrefs({ [key]: !explorerUiPrefs.value[key] });
}

function cycleExplorerDensity(): void {
  const currentIndex = EXPLORER_DENSITY_ORDER.indexOf(explorerUiPrefs.value.density);
  const nextDensity = EXPLORER_DENSITY_ORDER[(currentIndex + 1) % EXPLORER_DENSITY_ORDER.length];
  updateExplorerUiPrefs({ density: nextDensity });
}

function explorerItemIconKind(item: DirEntry): string {
  if (item.type === "dir") return "folder";
  const ext = item.extension?.toLowerCase() || "";
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "xz", "bz2"].includes(ext)) return "archive";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";
  if (["mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "flac"].includes(ext)) return "media";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "vue", "css", "scss", "less", "html", "json", "jsonl", "py", "sh", "sql", "yml", "yaml", "toml", "ini", "env"].includes(ext)) return "code";
  if (["md", "txt", "log", "csv"].includes(ext)) return "text";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)) return "document";
  return "file";
}

function explorerItemIconText(item: DirEntry): string {
  const ext = item.extension?.replace(/^\./, "").toUpperCase() || "";
  if (!ext) return "FILE";
  return ext.length > 4 ? ext.slice(0, 4) : ext;
}

function explorerItemIconLabel(item: DirEntry): string {
  if (item.type === "dir") return text("文件夹", "Folder");
  const ext = item.extension ? `.${item.extension.replace(/^\./, "")}` : "";
  return ext ? text(`${ext} 文件`, `${ext} file`) : text("文件", "File");
}

function storageNameForRoot(root: FileRootSummary): string {
  if (root.id === "openclaw-root") return text("OpenClaw 根目录", "OpenClaw");
  if (root.id === "home-root") return text("用户目录", "Home");
  if (root.id === "system-root") return text("系统根目录", "System");
  return root.id.replace(/[^a-z0-9_-]/gi, "-") || "Storage";
}

function rootIdForStorage(storage: string): string {
  return storageRoots.value.find((root) => root.storage === storage)?.id || "";
}

function parseVueFinderPath(pathValue: string): { storage: string; relativePath: string } {
  const marker = "://";
  const markerIndex = pathValue.indexOf(marker);
  if (markerIndex === -1) {
    return {
      storage: storageRoots.value[0]?.storage || "",
      relativePath: pathValue.replace(/^\/+|\/+$/g, ""),
    };
  }
  return {
    storage: pathValue.slice(0, markerIndex),
    relativePath: pathValue.slice(markerIndex + marker.length).replace(/^\/+|\/+$/g, ""),
  };
}

function relativePathFromVueFinderPath(pathValue: string): string {
  return parseVueFinderPath(pathValue).relativePath;
}

function directoryPathForFile(filePath: string): string {
  const normalized = filePath.replace(/^\/+|\/+$/g, "");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? "" : normalized.slice(0, slashIndex);
}

function createEditorTabId(rootId: string, apiPath: string): string {
  return `${rootId}:${apiPath}`;
}

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

function storageForRootId(rootId: string): string {
  return storageRoots.value.find((root) => root.id === rootId)?.storage || "";
}

function setActiveEditor(tabId: string): void {
  if (editorTabs.value.some((tab) => tab.id === tabId)) {
    activeEditorId.value = tabId;
  }
}

function updateEditorTab(tabId: string, patch: Partial<EditorFileTab>): void {
  const tab = editorTabs.value.find((candidate) => candidate.id === tabId);
  if (!tab) return;
  Object.assign(tab, patch);
}

function requestEditorSearch(): void {
  editorSearchRequest.value += 1;
}

async function refreshEditorDirectory(rootId: string, directoryPath: string): Promise<void> {
  if (!rootId) return;
  editorDirectoryLoading.value = true;
  editorDirectoryRootId.value = rootId;
  editorDirectoryPath.value = directoryPath;
  try {
    const payload = await browseDirectory(rootId, directoryPath, true);
    editorDirectoryEntries.value = payload.entries.filter((entry) => entry.kind === "file" && isCodeEditableEntry(entry));
  } catch {
    editorDirectoryEntries.value = [];
  } finally {
    editorDirectoryLoading.value = false;
  }
}

function setNotice(kind: "success" | "error" | "info" | "warning", message: string): void {
  noticeMessage.value = { kind, text: message };
}

function shouldIgnoreShortcut(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || target.isContentEditable;
}

function handleFileManagerKeydown(event: KeyboardEvent): void {
  if (shouldIgnoreShortcut(event)) return;
  const meta = event.ctrlKey || event.metaKey;
  if (meta && event.key.toLowerCase() === "r") {
    event.preventDefault();
    refreshExplorer();
    return;
  }
  if (meta && event.shiftKey && event.key.toLowerCase() === "n") {
    event.preventDefault();
    quickCreateDirectory();
    return;
  }
  if (meta && event.key.toLowerCase() === "n") {
    event.preventDefault();
    quickCreateFile();
    return;
  }
  if (meta && event.key.toLowerCase() === "c" && selectedItems.value.length) {
    event.preventDefault();
    putSelectedItemsOnClipboard("copy");
    return;
  }
  if (meta && event.key.toLowerCase() === "x" && selectedItems.value.length) {
    event.preventDefault();
    putSelectedItemsOnClipboard("move");
    return;
  }
  if (meta && event.key.toLowerCase() === "v" && fileClipboard.value) {
    event.preventDefault();
    pasteFileClipboardIntoCurrentDirectory();
    return;
  }
  if (meta && event.key.toLowerCase() === "d" && selectedItems.value.length) {
    event.preventDefault();
    duplicateSelectedItems();
    return;
  }
  if (meta && event.key.toLowerCase() === "i" && selectedSingleItem.value) {
    event.preventDefault();
    openDetailsForSelection();
    return;
  }
  if (event.key === "Escape") {
    detailsItem.value = null;
  }
}

function refreshExplorer(): void {
  viewerRefreshNonce.value += 1;
  selectedItems.value = [];
}

function promptForName(title: string, placeholder: string): string {
  if (typeof window === "undefined") return "";
  return (window.prompt(title, placeholder) || "").trim();
}

async function quickCreateDirectory(): Promise<void> {
  const target = currentExplorerTarget.value;
  if (!target) return;
  const name = promptForName(text("输入新文件夹名称", "Enter new folder name"), "untitled-folder");
  if (!name) return;
  try {
    await createDirectory({
      rootId: target.rootId,
      directoryPath: target.directoryPath,
      name,
    });
    refreshExplorer();
    setNotice("success", text("文件夹已创建", "Folder created"));
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("创建文件夹失败", "Failed to create folder"));
  }
}

async function quickCreateFile(): Promise<void> {
  const target = currentExplorerTarget.value;
  if (!target) return;
  const name = promptForName(text("输入新文件名称", "Enter new file name"), "untitled.txt");
  if (!name) return;
  try {
    await createFile({
      rootId: target.rootId,
      directoryPath: target.directoryPath,
      name,
      content: "",
    });
    refreshExplorer();
    setNotice("success", text("文件已创建", "File created"));
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("创建文件失败", "Failed to create file"));
  }
}

function targetDirectoryFromItem(item: DirEntry): FileExplorerTarget | null {
  if (item.type !== "dir") return null;
  const rootId = rootIdForStorage(item.storage);
  if (!rootId) return null;
  return {
    rootId,
    directoryPath: relativePathFromVueFinderPath(item.path),
  };
}

function fileClipboardItemsFor(items: DirEntry[]): FileClipboardItem[] {
  const candidates = items.length ? items : selectedItems.value;
  return candidates
    .map((item) => {
      const rootId = rootIdForStorage(item.storage);
      const itemPath = relativePathFromVueFinderPath(item.path);
      if (!rootId || !itemPath) return null;
      return {
        rootId,
        path: itemPath,
        name: item.basename,
      };
    })
    .filter((item): item is FileClipboardItem => Boolean(item));
}

function putItemsOnClipboard(mode: FileClipboardState["mode"], items: DirEntry[]): void {
  const clipboardItems = fileClipboardItemsFor(items);
  if (!clipboardItems.length) {
    setNotice("warning", text("请选择要复制或剪切的文件", "Select files or folders to copy or cut"));
    return;
  }
  fileClipboard.value = {
    mode,
    items: clipboardItems,
  };
  setNotice(
    "info",
    mode === "copy"
      ? text(`已复制 ${clipboardItems.length} 项到剪贴板`, `Copied ${clipboardItems.length} item(s) to clipboard`)
      : text(`已剪切 ${clipboardItems.length} 项到剪贴板`, `Cut ${clipboardItems.length} item(s) to clipboard`),
  );
}

function putSelectedItemsOnClipboard(mode: FileClipboardState["mode"]): void {
  putItemsOnClipboard(mode, selectedItems.value);
}

function clearFileClipboard(): void {
  fileClipboard.value = null;
  setNotice("info", text("剪贴板已清空", "Clipboard cleared"));
}

async function writeTextToSystemClipboard(content: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(content);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = content;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard API is unavailable");
}

async function copyPathsToClipboard(items: DirEntry[]): Promise<void> {
  const paths = (items.length ? items : selectedItems.value)
    .map((item) => item.path)
    .filter(Boolean);
  if (!paths.length) return;
  try {
    await writeTextToSystemClipboard(paths.join("\n"));
    setNotice(
      "success",
      paths.length > 1 ? text(`已复制 ${paths.length} 个路径`, `Copied ${paths.length} paths`) : text("路径已复制", "Path copied"),
    );
  } catch (error) {
    setNotice(
      "error",
      error instanceof Error ? error.message : text("复制路径失败", "Failed to copy path"),
    );
  }
}

function copySelectedPathsToClipboard(): void {
  void copyPathsToClipboard(selectedItems.value);
}

function buildDuplicateName(name: string, index: number, total: number): string {
  const dotIndex = name.lastIndexOf(".");
  const copyId = Date.now().toString(36).slice(-4);
  const suffix = total > 1 ? `-copy-${index + 1}-${copyId}` : `-copy-${copyId}`;
  if (dotIndex > 0) {
    return `${name.slice(0, dotIndex)}${suffix}${name.slice(dotIndex)}`;
  }
  return `${name}${suffix}`;
}

async function duplicateItems(items: DirEntry[]): Promise<void> {
  const targets = (items.length ? items : selectedItems.value).filter(Boolean);
  if (!targets.length) return;
  try {
    for (const [index, item] of targets.entries()) {
      const sourceRootId = rootIdForStorage(item.storage);
      const sourcePath = relativePathFromVueFinderPath(item.path);
      const destinationDirectoryPath = relativePathFromVueFinderPath(item.dir);
      if (!sourceRootId || !sourcePath) continue;
      await copyPath({
        sourceRootId,
        sourcePath,
        destinationRootId: sourceRootId,
        destinationDirectoryPath,
        nextName: buildDuplicateName(item.basename, index, targets.length),
      });
    }
    refreshExplorer();
    setNotice(
      "success",
      targets.length > 1 ? text(`已创建 ${targets.length} 个副本`, `Created ${targets.length} duplicates`) : text("副本已创建", "Duplicate created"),
    );
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("创建副本失败", "Failed to duplicate item"));
  }
}

function duplicateSelectedItems(): void {
  void duplicateItems(selectedItems.value);
}

async function pasteFileClipboard(target: FileExplorerTarget | null = currentExplorerTarget.value): Promise<void> {
  const clipboard = fileClipboard.value;
  if (!clipboard?.items.length) {
    setNotice("warning", text("剪贴板为空", "Clipboard is empty"));
    return;
  }
  if (!target?.rootId) {
    setNotice("error", text("无法确定当前目录", "Could not determine the current folder"));
    return;
  }

  try {
    for (const item of clipboard.items) {
      const payload = {
        sourceRootId: item.rootId,
        sourcePath: item.path,
        destinationRootId: target.rootId,
        destinationDirectoryPath: target.directoryPath,
      };
      if (clipboard.mode === "copy") {
        await copyPath(payload);
      } else {
        await movePath(payload);
      }
    }
    if (clipboard.mode === "move") {
      fileClipboard.value = null;
    }
    refreshExplorer();
    setNotice(
      "success",
      clipboard.mode === "copy"
        ? text(`已粘贴复制 ${clipboard.items.length} 项`, `Pasted ${clipboard.items.length} copied item(s)`)
        : text(`已移动 ${clipboard.items.length} 项`, `Moved ${clipboard.items.length} item(s)`),
    );
  } catch (error) {
    setNotice(
      "error",
      error instanceof Error ? error.message : text("粘贴失败", "Paste failed"),
    );
  }
}

function pasteFileClipboardIntoCurrentDirectory(): void {
  void pasteFileClipboard(currentExplorerTarget.value);
}

function formatFileSize(size: number | null | undefined): string {
  if (size == null) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = size;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${unitIndex === 0 ? value : value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatUnixTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "-";
  try {
    return new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(timestamp * 1000));
  } catch {
    return new Date(timestamp * 1000).toLocaleString();
  }
}

function openDetailsForItem(item: DirEntry): void {
  detailsItem.value = item;
}

function openDetailsForSelection(): void {
  const item = selectedItems.value.length === 1 ? selectedItems.value[0] : null;
  if (item) openDetailsForItem(item);
}

function closeDetails(): void {
  detailsItem.value = null;
}

function openDetailsItemInEditor(): void {
  const item = detailsItem.value;
  if (!item || !isCodeEditableItem(item)) return;
  void openEditorForItem(item);
  detailsItem.value = null;
}

function downloadDetailItem(): void {
  const item = detailsItem.value;
  if (!item || item.type !== "file") return;
  const rootId = rootIdForStorage(item.storage);
  const apiPath = relativePathFromVueFinderPath(item.path);
  if (!rootId || !apiPath) return;
  triggerBrowserDownload(buildFileDownloadUrl(rootId, apiPath), item.basename);
}

function isCodeEditableItem(item: DirEntry): boolean {
  if (item.type !== "file") return false;
  const mime = String(item.mime_type || "").toLowerCase();
  if (mime.startsWith("text/")) return true;
  const ext = String(item.extension || "").toLowerCase();
  return [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "jsonl",
    "md",
    "markdown",
    "html",
    "htm",
    "vue",
    "css",
    "scss",
    "less",
    "py",
    "yaml",
    "yml",
    "sql",
    "sh",
    "env",
    "toml",
    "ini",
  ].includes(ext);
}

function isZipArchiveItem(item: DirEntry): boolean {
  if (item.type !== "file") return false;
  const mime = String(item.mime_type || "").toLowerCase();
  const extension = String(item.extension || "").replace(/^\./, "").toLowerCase();
  return mime === "application/zip" || extension === "zip" || item.basename.toLowerCase().endsWith(".zip");
}

function isCodeEditableEntry(entry: FileEntrySummary): boolean {
  if (entry.kind !== "file") return false;
  if (entry.textLike) return true;
  const ext = String(entry.ext || "").replace(/^\./, "").toLowerCase();
  return [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "jsonl",
    "md",
    "markdown",
    "html",
    "htm",
    "vue",
    "css",
    "scss",
    "less",
    "py",
    "yaml",
    "yml",
    "sql",
    "sh",
    "env",
    "toml",
    "ini",
  ].includes(ext);
}

async function reloadSummary(): Promise<void> {
  loading.value = true;
  try {
    summary.value = await fetchFilesSummary();
  } catch (error) {
    setNotice(
      "error",
      error instanceof Error
        ? error.message
        : text("文件资源管理器初始化失败", "Failed to initialize file explorer"),
    );
  } finally {
    loading.value = false;
  }
}

function handleExplorerError(error: unknown): void {
  setNotice(
    "error",
    error instanceof Error ? error.message : text("文件操作失败", "File operation failed"),
  );
}

function handleNotify(payload: { type: string; message: string }): void {
  setNotice(payload.type === "error" ? "error" : "success", payload.message);
}

function handleExplorerSelect(items: DirEntry[]): void {
  selectedItems.value = Array.isArray(items) ? items : [];
}

function handleExplorerPathChange(pathValue: string): void {
  currentExplorerPath.value = pathValue || "";
  selectedItems.value = [];
}

async function openEditorForItem(item: DirEntry): Promise<void> {
  const rootId = rootIdForStorage(item.storage);
  const apiPath = relativePathFromVueFinderPath(item.path);
  if (!rootId || !apiPath) return;
  await openEditorForPath(rootId, apiPath, item.path, item.basename);
}

async function openEditorForEntry(entry: FileEntrySummary): Promise<void> {
  if (!editorDirectoryRootId.value || !isCodeEditableEntry(entry)) return;
  const storage = storageForRootId(editorDirectoryRootId.value);
  const vuePath = storage ? `${storage}://${entry.path}` : entry.path;
  await openEditorForPath(editorDirectoryRootId.value, entry.path, vuePath, entry.name);
}

async function openEditorForPath(rootId: string, apiPath: string, vuePath: string, fallbackName: string): Promise<void> {
  const tabId = createEditorTabId(rootId, apiPath);
  void refreshEditorDirectory(rootId, directoryPathForFile(apiPath));
  const existingTab = editorTabs.value.find((tab) => tab.id === tabId);
  if (existingTab) {
    activeEditorId.value = existingTab.id;
    return;
  }

  editorTabs.value.push({
    id: tabId,
    rootId,
    apiPath,
    path: vuePath,
    name: fallbackName,
    readOnly: false,
    truncated: false,
    content: null,
    draft: "",
    error: null,
    loading: true,
    saving: false,
  });
  activeEditorId.value = tabId;

  try {
    const payload: FilesReadPayload = await readFileContent(rootId, apiPath);
    updateEditorTab(tabId, {
      rootId,
      apiPath: payload.path,
      path: vuePath,
      name: payload.name,
      readOnly: !payload.editable,
      truncated: payload.truncated,
      content: payload.content || "",
      draft: payload.content || "",
      error: null,
      loading: false,
    });
  } catch (error) {
    updateEditorTab(tabId, {
      error: error instanceof Error ? error.message : text("加载文件失败", "Failed to load file"),
      loading: false,
    });
  }
}

async function openEditorForItems(items: DirEntry[]): Promise<void> {
  const codeItems = items.filter((item) => isCodeEditableItem(item));
  for (const item of codeItems) {
    await openEditorForItem(item);
  }
}

function handleFileDclick(event: { item: DirEntry; preventDefault: () => void }): void {
  if (!event?.item || !isCodeEditableItem(event.item)) return;
  event.preventDefault();
  void openEditorForItem(event.item);
}

function closeEditor(tabId = activeEditorId.value): void {
  const index = editorTabs.value.findIndex((tab) => tab.id === tabId);
  if (index === -1) return;
  const wasActive = activeEditorId.value === tabId;
  editorTabs.value.splice(index, 1);
  if (wasActive) {
    const nextTab = editorTabs.value[index] || editorTabs.value[index - 1] || null;
    activeEditorId.value = nextTab?.id || "";
  }
  if (!editorTabs.value.length) {
    editorMaximized.value = false;
  }
}

function resetEditor(): void {
  const tab = activeEditorTab.value;
  if (!tab) return;
  tab.draft = tab.content || "";
}

async function saveEditor(): Promise<void> {
  const tab = activeEditorTab.value;
  if (!tab || !tab.rootId || !tab.apiPath || tab.readOnly) return;
  updateEditorTab(tab.id, { saving: true });
  try {
    await saveFileContent({
      rootId: tab.rootId,
      path: tab.apiPath,
      content: tab.draft,
    });
    updateEditorTab(tab.id, {
      content: tab.draft,
      error: null,
    });
    setNotice("success", text("文件已保存", "File saved"));
  } catch (error) {
    setNotice(
      "error",
      error instanceof Error ? error.message : text("保存文件失败", "Failed to save file"),
    );
  } finally {
    updateEditorTab(tab.id, { saving: false });
  }
}

function triggerBrowserDownload(url: string, fileName?: string): void {
  if (!url) return;
  const anchor = document.createElement("a");
  anchor.href = url;
  if (fileName) anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function downloadEditorFile(): void {
  if (!editorDownloadUrl.value || !editorState.value.name) return;
  triggerBrowserDownload(editorDownloadUrl.value, editorState.value.name);
}

function downloadArchiveForItems(items: DirEntry[]): void {
  if (!items.length) return;
  const firstRootId = rootIdForStorage(items[0].storage);
  if (!firstRootId || items.some((item) => rootIdForStorage(item.storage) !== firstRootId)) return;
  const paths = items.map((item) => relativePathFromVueFinderPath(item.path)).filter(Boolean);
  if (!paths.length) return;
  const archiveName = items.length === 1 ? `${items[0].basename}-archive` : "selected-items";
  triggerBrowserDownload(buildArchiveDownloadUrl(firstRootId, paths, archiveName));
}

async function unarchiveItems(items: DirEntry[]): Promise<void> {
  const zipItems = items.filter((item) => isZipArchiveItem(item));
  if (!zipItems.length) return;
  try {
    for (const item of zipItems) {
      const rootId = rootIdForStorage(item.storage);
      const archivePath = relativePathFromVueFinderPath(item.path);
      const directoryPath = relativePathFromVueFinderPath(item.dir);
      if (!rootId || !archivePath) continue;
      await unarchiveFile({
        rootId,
        archivePath,
        directoryPath,
      });
    }
    viewerRefreshNonce.value += 1;
    selectedItems.value = [];
    setNotice(
      "success",
      zipItems.length > 1
        ? text(`已解压 ${zipItems.length} 个压缩包`, `Extracted ${zipItems.length} archives`)
        : text("压缩包已解压", "Archive extracted"),
    );
  } catch (error) {
    setNotice(
      "error",
      error instanceof Error ? error.message : text("解压失败", "Failed to extract archive"),
    );
  }
}

onMounted(() => {
  void reloadSummary();
});
</script>

<style scoped>
.file-manager-page {
  --file-manager-bg: #f8fafc;
  --file-manager-panel: #ffffff;
  --file-manager-panel-strong: #eef3f8;
  --file-manager-hover: color-mix(in srgb, var(--acc) 8%, var(--file-manager-panel));
  --file-manager-active: color-mix(in srgb, var(--acc) 15%, var(--file-manager-panel));
  --file-manager-border: color-mix(in srgb, var(--line) 88%, transparent);
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--file-manager-bg);
  color: var(--text);
  isolation: isolate;
}

:global(html[data-theme="dark"] .file-manager-page) {
  --file-manager-bg: #07111c;
  --file-manager-panel: #0b1220;
  --file-manager-panel-strong: #101a2b;
  --file-manager-hover: #132238;
  --file-manager-active: #173154;
  --file-manager-border: rgba(148, 163, 184, 0.22);
}

.file-manager-notice {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 80;
  max-width: min(520px, calc(100vw - 32px));
  padding: 9px 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.14);
  font-size: 13px;
}

.file-manager-notice--error {
  border-color: color-mix(in srgb, var(--danger) 42%, var(--line));
  color: var(--danger);
}

.file-manager-notice--success {
  border-color: color-mix(in srgb, var(--success) 42%, var(--line));
}

.file-manager-loading {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--muted);
  font-size: 13px;
}

.file-manager-loading--error {
  color: var(--danger);
}

.studio-file-explorer {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
}

.file-manager-statusbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 36px;
  padding: 4px 8px;
  border-top: 1px solid var(--file-manager-border);
  background: color-mix(in srgb, var(--file-manager-panel) 94%, var(--file-manager-bg));
  color: var(--muted);
  font-size: 12px;
}

.file-manager-statusbar__button,
.file-manager-editor-drawer__button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.file-manager-statusbar__button:hover,
.file-manager-editor-drawer__button:hover {
  border-color: color-mix(in srgb, var(--acc) 36%, var(--line));
  background: color-mix(in srgb, var(--button-secondary-bg) 82%, var(--acc) 10%);
  color: var(--text);
}

.file-manager-statusbar__button--primary {
  border-color: color-mix(in srgb, var(--acc) 58%, var(--line));
  background: color-mix(in srgb, var(--acc) 18%, var(--button-secondary-bg));
  color: color-mix(in srgb, var(--acc) 72%, var(--text));
}

.file-manager-statusbar__button:disabled,
.file-manager-editor-drawer__button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.file-manager-statusbar__spacer {
  flex: 1 1 auto;
  min-width: 16px;
}

.file-manager-view-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 5px;
  max-width: 100%;
}

.file-manager-view-controls__label {
  margin-right: 2px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.file-manager-view-controls__button {
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid var(--file-manager-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--file-manager-panel-strong) 88%, transparent);
  color: var(--muted);
  font: inherit;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  cursor: pointer;
}

.file-manager-view-controls__button:hover {
  border-color: color-mix(in srgb, var(--acc) 42%, var(--file-manager-border));
  color: var(--text);
}

.file-manager-view-controls__button.active {
  border-color: color-mix(in srgb, var(--acc) 52%, var(--file-manager-border));
  background: color-mix(in srgb, var(--acc) 16%, var(--file-manager-panel-strong));
  color: color-mix(in srgb, var(--acc) 72%, var(--text));
}

.file-manager-view-controls__button--wide {
  min-width: 104px;
}

.studio-file-icon {
  --studio-file-icon-base: color-mix(in srgb, var(--text) 12%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: var(--acc);
  --studio-file-icon-text: var(--text);
  display: inline-grid;
  place-items: center;
  width: var(--vf-icon-size, 20px);
  height: var(--vf-icon-size, 20px);
  color: var(--studio-file-icon-text);
  line-height: 1;
}

.studio-file-icon__shape {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border: 1px solid color-mix(in srgb, var(--studio-file-icon-accent) 42%, transparent);
  border-radius: 18% 18% 22% 22%;
  background:
    linear-gradient(145deg, color-mix(in srgb, #ffffff 18%, transparent), transparent 42%),
    var(--studio-file-icon-base);
  box-shadow:
    inset 0 0 0 1px color-mix(in srgb, #ffffff 13%, transparent),
    0 1px 2px color-mix(in srgb, #000000 16%, transparent);
  overflow: hidden;
}

.studio-file-icon__fold {
  position: absolute;
  top: 0;
  right: 0;
  width: 36%;
  height: 36%;
  background: color-mix(in srgb, var(--studio-file-icon-accent) 42%, #ffffff);
  clip-path: polygon(100% 0, 0 0, 100% 100%);
  opacity: 0.86;
}

.studio-file-icon__folder-tab {
  position: absolute;
  top: 9%;
  left: 9%;
  width: 48%;
  height: 22%;
  border-radius: 999px 999px 30% 30%;
  background: color-mix(in srgb, var(--studio-file-icon-accent) 72%, #ffffff);
}

.studio-file-icon__extension {
  position: relative;
  z-index: 1;
  max-width: 88%;
  color: var(--studio-file-icon-text);
  font-size: max(5px, calc(var(--vf-icon-size, 20px) * 0.24));
  font-weight: 950;
  letter-spacing: -0.04em;
  text-align: center;
  text-transform: uppercase;
  transform: translateY(7%);
}

.studio-file-icon--grid .studio-file-icon__extension {
  font-size: max(8px, calc(var(--vf-icon-size, 48px) * 0.22));
  letter-spacing: 0;
}

.studio-file-icon--folder {
  --studio-file-icon-base: linear-gradient(145deg, #ffe7a3, #d9a341);
  --studio-file-icon-accent: #c7831c;
  --studio-file-icon-text: #5b3411;
}

.studio-file-icon--code {
  --studio-file-icon-base: color-mix(in srgb, #2dd4bf 18%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: #14b8a6;
  --studio-file-icon-text: color-mix(in srgb, #2dd4bf 72%, var(--text));
}

.studio-file-icon--image {
  --studio-file-icon-base: color-mix(in srgb, #60a5fa 20%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: #3b82f6;
  --studio-file-icon-text: color-mix(in srgb, #60a5fa 76%, var(--text));
}

.studio-file-icon--archive {
  --studio-file-icon-base: color-mix(in srgb, #f59e0b 18%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: #d97706;
  --studio-file-icon-text: color-mix(in srgb, #fbbf24 78%, var(--text));
}

.studio-file-icon--media {
  --studio-file-icon-base: color-mix(in srgb, #f472b6 18%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: #ec4899;
  --studio-file-icon-text: color-mix(in srgb, #f472b6 76%, var(--text));
}

.studio-file-icon--text,
.studio-file-icon--document {
  --studio-file-icon-base: color-mix(in srgb, #94a3b8 14%, var(--file-manager-panel-strong));
  --studio-file-icon-accent: #64748b;
  --studio-file-icon-text: color-mix(in srgb, #cbd5e1 70%, var(--text));
}

.studio-file-icon--file {
  --studio-file-icon-accent: color-mix(in srgb, var(--muted) 72%, var(--acc));
  --studio-file-icon-text: color-mix(in srgb, var(--muted) 78%, var(--text));
}

.file-manager-details {
  position: fixed;
  inset: 0;
  z-index: 1120;
  display: grid;
  place-items: center;
  padding: 24px;
  background: color-mix(in srgb, #020617 28%, transparent);
}

.file-manager-details__panel {
  display: grid;
  gap: 14px;
  width: min(560px, calc(100vw - 32px));
  max-height: min(680px, calc(100vh - 48px));
  padding: 14px;
  border: 1px solid var(--file-manager-border);
  border-radius: 12px;
  background: var(--file-manager-panel);
  color: var(--text);
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.24);
  overflow: auto;
}

.file-manager-details__head {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.file-manager-details__head .studio-file-icon {
  --vf-icon-size: 42px;
}

.file-manager-details__head div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.file-manager-details__head strong {
  overflow: hidden;
  font-size: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-details__head span:not(.studio-file-icon, .studio-file-icon__shape, .studio-file-icon__fold, .studio-file-icon__folder-tab, .studio-file-icon__extension) {
  overflow: hidden;
  color: var(--muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-details__close {
  display: inline-grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--file-manager-border);
  border-radius: 999px;
  background: var(--button-secondary-bg);
  color: var(--button-secondary-text);
  cursor: pointer;
}

.file-manager-details__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.file-manager-details__grid div {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 9px;
  border: 1px solid var(--file-manager-border);
  border-radius: 8px;
  background: var(--file-manager-panel-strong);
}

.file-manager-details__grid dt {
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.file-manager-details__grid dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-details__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.file-manager-editor-drawer {
  position: fixed;
  inset: 0 0 0 auto;
  z-index: 1180;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  width: min(920px, calc(100vw - var(--sidebar-width, 280px)));
  border: 0;
  border-left: 1px solid var(--file-manager-border);
  border-radius: 0;
  background: var(--file-manager-panel);
  box-shadow: -24px 0 42px rgba(15, 23, 42, 0.16);
  overflow: hidden;
  max-height: 100%;
}

.file-manager-editor-drawer--maximized {
  inset: 0 0 0 var(--sidebar-width, 280px);
  width: auto;
  border-left: 0;
}

.file-manager-editor-drawer__head {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 34px 30px;
  align-items: stretch;
  gap: 6px;
  height: 84px;
  min-height: 84px;
  max-height: 84px;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--file-manager-border);
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--file-manager-panel-strong) 86%, var(--acc) 5%), var(--file-manager-panel-strong));
  overflow: hidden;
}

.file-manager-editor-drawer__title {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.file-manager-editor-drawer__tabs {
  display: flex;
  align-items: end;
  min-width: 0;
  max-width: 100%;
  height: 34px;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}

.file-manager-editor-drawer__tab {
  display: inline-flex;
  align-items: center;
  flex: 0 0 clamp(136px, 18vw, 210px);
  min-width: 0;
  min-height: 32px;
  gap: 7px;
  max-width: 220px;
  padding: 3px 7px;
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

.file-manager-editor-drawer__tab.error {
  color: var(--danger);
}

.file-manager-editor-drawer__tab-close {
  display: inline-grid;
  place-items: center;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: var(--muted);
  font-weight: 900;
}

.file-manager-editor-drawer__tab-close:hover {
  background: var(--file-manager-hover);
  color: var(--text);
}

.file-manager-editor-drawer__title strong {
  color: var(--text);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-drawer__path {
  display: none;
}

.file-manager-editor-drawer__title span {
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-drawer__tab-icon {
  display: inline-grid;
  place-items: center;
  width: 23px;
  height: 23px;
  border: 1px solid color-mix(in srgb, var(--line) 82%, transparent);
  border-radius: 4px;
  color: color-mix(in srgb, var(--acc) 80%, var(--text));
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
}

.file-manager-editor-drawer__dirty {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--warning, #f59e0b) 78%, #f59e0b);
}

.file-manager-editor-drawer__actions {
  display: flex;
  flex-wrap: nowrap;
  justify-content: flex-start;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 0 2px;
  scrollbar-width: thin;
}

.file-manager-editor-drawer__badge {
  display: inline-grid;
  min-height: 28px;
  align-items: center;
  padding: 0 9px;
  border: 1px solid var(--line);
  border-radius: 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.file-manager-editor-drawer__button--primary {
  border-color: color-mix(in srgb, var(--acc) 44%, var(--line));
  background: var(--button-primary-bg);
  color: var(--button-primary-text);
}

.file-manager-editor-drawer__button {
  flex: 0 0 auto;
  white-space: nowrap;
}

.file-manager-editor-drawer__body {
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  min-height: 0;
  overflow: hidden;
  background: var(--file-manager-panel);
}

.file-manager-editor-sidebar {
  display: grid;
  grid-template-rows: auto minmax(84px, 0.42fr) minmax(0, 1fr);
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 0;
  padding: 10px;
  border-right: 1px solid var(--file-manager-border);
  background: var(--file-manager-panel-strong);
  overflow: hidden;
  scrollbar-width: thin;
}

.file-manager-editor-sidebar__brand {
  display: grid;
  gap: 2px;
  padding: 2px 4px 0;
}

.file-manager-editor-sidebar__brand strong {
  color: var(--text);
  font-size: 15px;
  line-height: 1.2;
}

.file-manager-editor-sidebar__brand span {
  color: var(--muted);
  font-size: 12px;
}

.file-manager-editor-sidebar__section {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}

.file-manager-editor-sidebar__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.file-manager-editor-sidebar__label strong {
  display: inline-grid;
  min-width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid var(--file-manager-border);
  border-radius: 999px;
  color: var(--text);
  font-size: 11px;
  letter-spacing: 0;
}

.file-manager-editor-sidebar__path,
.file-manager-editor-sidebar__hint {
  margin: 0;
  padding: 0 4px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-manager-editor-sidebar__file {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.file-manager-editor-sidebar__file span {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 1px solid var(--file-manager-border);
  border-radius: 4px;
  color: color-mix(in srgb, var(--acc) 78%, var(--text));
  font-size: 10px;
  font-weight: 900;
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

.file-manager-editor-sidebar__file:disabled {
  opacity: 0.44;
  cursor: not-allowed;
}

.file-manager-editor-sidebar__file.active {
  border-color: var(--file-manager-border);
  background: var(--file-manager-active);
  color: var(--text);
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
  min-height: 24px;
  margin: 0;
  padding: 0 9px;
  border-top: 1px solid var(--line);
  background: var(--file-manager-panel-strong);
  color: var(--muted);
  font-size: 11px;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: thin;
}

.file-manager-page :deep(.vuefinder),
.file-manager-page :deep(.silver),
.file-manager-page :deep(.midnight),
.file-manager-page :deep(.vuefinder__main__container),
.file-manager-page :deep(.vuefinder__main__relative),
.file-manager-page :deep(.vuefinder__main__content),
.file-manager-page :deep(.vuefinder__breadcrumb__container),
.file-manager-page :deep(.vuefinder__explorer__container),
.file-manager-page :deep(.vuefinder__treeview__container),
.file-manager-page :deep(.vuefinder__status-bar__wrapper),
.file-manager-page :deep(.vuefinder__modal),
.file-manager-page :deep(.vuefinder__modal-content) {
  background-color: var(--file-manager-bg) !important;
  color: var(--text);
}

.file-manager-page :deep(.vuefinder) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  border-radius: 0;
  background: var(--file-manager-bg);
}

.file-manager-page :deep(.vuefinder__main) {
  min-height: 0;
  height: 100%;
}

.file-manager-page :deep(.vuefinder__sidebar),
.file-manager-page :deep(.vuefinder__toolbar),
.file-manager-page :deep(.vuefinder__menubar),
.file-manager-page :deep(.vuefinder__breadcrumbs),
.file-manager-page :deep(.vuefinder__items),
.file-manager-page :deep(.vuefinder__statusbar),
.file-manager-page :deep(.vuefinder__context-menu),
.file-manager-page :deep(.vuefinder__context-menu__item) {
  background: var(--file-manager-panel) !important;
  color: var(--text);
}

.file-manager-page :deep(.vuefinder__toolbar),
.file-manager-page :deep(.vuefinder__menubar),
.file-manager-page :deep(.vuefinder__breadcrumbs),
.file-manager-page :deep(.vuefinder__statusbar),
.file-manager-page :deep(.vuefinder__sidebar),
.file-manager-page :deep(.vuefinder__breadcrumb__container),
.file-manager-page :deep(.vuefinder__status-bar__wrapper) {
  border-color: var(--file-manager-border) !important;
}

.file-manager-page :deep(.vuefinder__item),
.file-manager-page :deep(.vuefinder__tree-item),
.file-manager-page :deep(.vuefinder__toolbar-btn),
.file-manager-page :deep(.vuefinder__breadcrumbs-item),
.file-manager-page :deep(.vuefinder__menu-item) {
  font-family: inherit;
}

.file-manager-page :deep(.vuefinder__toolbar),
.file-manager-page :deep(.vuefinder__menubar) {
  min-height: 36px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--file-manager-panel-strong) 88%, transparent), var(--file-manager-panel)) !important;
}

.file-manager-page :deep(.vuefinder__toolbar-btn),
.file-manager-page :deep(.vuefinder__menu-item),
.file-manager-page :deep(.vuefinder__breadcrumbs-item) {
  border-radius: 5px;
}

.file-manager-page :deep(.vuefinder__toolbar-btn:hover),
.file-manager-page :deep(.vuefinder__menu-item:hover),
.file-manager-page :deep(.vuefinder__breadcrumbs-item:hover) {
  background: var(--file-manager-hover) !important;
  color: var(--text) !important;
}

.file-manager-page :deep(.vf-toolbar-icon),
.file-manager-page :deep(.vuefinder__breadcrumb__home-icon),
.file-manager-page :deep(.vuefinder__breadcrumb__refresh-icon),
.file-manager-page :deep(.vuefinder__breadcrumb__toggle-icon) {
  color: color-mix(in srgb, var(--muted) 72%, var(--acc)) !important;
}

.file-manager-page :deep(.vuefinder__context-menu) {
  border: 1px solid var(--file-manager-border);
  border-radius: 8px;
  background: var(--file-manager-panel) !important;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.18);
  overflow: hidden;
}

.file-manager-page :deep(.vuefinder__item-icon) {
  overflow: visible;
}

:deep(.vuefinder__items--list .vuefinder__item) {
  border-radius: 0;
}

:deep(.vuefinder__items--list .vuefinder__item:hover) {
  background: color-mix(in srgb, var(--surface) 72%, var(--acc) 7%);
}

:deep(.vuefinder__items--list .vuefinder__item--selected) {
  background: color-mix(in srgb, var(--surface) 64%, var(--acc) 14%);
}

:deep(.code-file-editor),
:deep(.code-file-editor__host),
:deep(.cm-editor),
:deep(.cm-scroller) {
  height: 100%;
  min-height: 0;
}

@media (max-width: 720px) {
  .file-manager-statusbar {
    align-items: flex-start;
    gap: 6px;
    padding: 6px 7px;
  }

  .file-manager-statusbar__spacer {
    display: none;
  }

  .file-manager-view-controls {
    flex: 1 1 100%;
    justify-content: flex-start;
  }

  .file-manager-view-controls__label {
    display: none;
  }

  .file-manager-view-controls__button {
    min-height: 26px;
    padding: 0 9px;
    font-size: 11px;
  }

  .file-manager-view-controls__button--wide {
    min-width: auto;
  }

  .file-manager-details {
    align-items: end;
    padding: 10px;
  }

  .file-manager-details__panel {
    width: 100%;
    max-height: min(620px, calc(100vh - 20px));
    border-radius: 12px 12px 8px 8px;
  }

  .file-manager-details__grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 920px) {
  .file-manager-editor-drawer {
    inset: 46px 0 0;
    z-index: 1080;
    width: 100%;
    border-left: 0;
    border-radius: 0;
  }

  .file-manager-editor-drawer--maximized {
    inset: 46px 0 0;
  }

  .file-manager-editor-drawer__head {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 32px 30px;
    align-items: stretch;
    gap: 6px;
    height: 78px;
    min-height: 78px;
    max-height: 78px;
    padding: 6px 10px;
  }

  .file-manager-editor-drawer__tab {
    flex-basis: 142px;
    max-width: 172px;
    min-height: 30px;
  }

  .file-manager-editor-drawer__tabs {
    height: 32px;
  }

  .file-manager-editor-drawer__actions {
    justify-content: start;
    width: 100%;
    max-width: 100%;
    padding: 0 0 3px;
  }

  .file-manager-editor-drawer__body {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .file-manager-editor-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(170px, 1fr));
    grid-template-rows: minmax(0, 1fr);
    align-items: stretch;
    gap: 8px;
    max-height: 118px;
    padding: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    border-right: 0;
    border-bottom: 1px solid var(--file-manager-border);
  }

  .file-manager-editor-sidebar__brand {
    display: none;
  }

  .file-manager-editor-sidebar__section {
    min-width: 0;
    max-height: 102px;
    padding: 0 4px 0 0;
    overflow-y: auto;
  }

  .file-manager-editor-sidebar__file {
    min-width: 0;
    min-height: 30px;
  }
}
</style>
