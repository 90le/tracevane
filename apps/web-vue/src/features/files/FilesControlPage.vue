<template>
  <section
    class="file-manager-page studio-file-workbench"
    :class="{ 'studio-file-workbench--grid': viewMode === 'grid' }"
    @click="closeTransientSurfaces"
    @keydown="handleWorkbenchKeydown"
    @paste="handleWorkbenchPaste"
  >
    <div
      v-if="noticeMessage"
      class="file-manager-notice"
      :class="`file-manager-notice--${noticeMessage.kind}`"
    >
      {{ noticeMessage.text }}
    </div>

    <div v-if="loading && !summary" class="file-manager-loading">
      {{ text("正在加载文件管理器...", "Loading file manager...") }}
    </div>

    <template v-else-if="summary">
      <input
        ref="uploadInput"
        class="studio-file-hidden-input"
        type="file"
        multiple
        @change="handleUploadInputChange"
      />
      <input
        ref="uploadDirectoryInput"
        class="studio-file-hidden-input"
        type="file"
        multiple
        webkitdirectory
        @change="handleUploadDirectoryInputChange"
      />

      <header class="studio-file-tabs" aria-label="Open directories">
        <button
          v-for="tab in directoryTabs"
          :key="tab.id"
          type="button"
          class="studio-file-tab"
          :class="{ active: tab.id === activeDirectoryTabId }"
          :title="tab.absolutePath"
          @click.stop="activateDirectoryTab(tab.id)"
        >
          <span class="studio-file-tab__icon" aria-hidden="true"></span>
          <span>{{ tab.label }}</span>
          <small>{{ tab.rootLabel }}</small>
          <span
            v-if="directoryTabs.length > 1"
            role="button"
            tabindex="0"
            class="studio-file-tab__close"
            :aria-label="text('关闭目录标签', 'Close directory tab')"
            @click.stop="closeDirectoryTab(tab.id)"
            @keydown.enter.stop.prevent="closeDirectoryTab(tab.id)"
            @keydown.space.stop.prevent="closeDirectoryTab(tab.id)"
          >
            <X class="studio-file-icon-button__icon" aria-hidden="true" />
          </span>
        </button>
        <button
          type="button"
          class="studio-file-tab studio-file-tab--new"
          :title="text('复制当前目录为新标签', 'Open current directory as a new tab')"
          @click.stop="openCurrentDirectoryInNewTab"
        >
          <Plus class="studio-file-icon-button__icon" aria-hidden="true" />
        </button>
      </header>

      <section class="studio-file-pathbar">
        <div class="studio-file-pathbar__nav" aria-label="Directory history">
          <button type="button" :disabled="!canGoBack" @click.stop="goBack">
            <ChevronLeft class="studio-file-icon-button__icon" aria-hidden="true" />
          </button>
          <button type="button" :disabled="!canGoForward" @click.stop="goForward">
            <ChevronRight class="studio-file-icon-button__icon" aria-hidden="true" />
          </button>
        </div>

        <select
          class="studio-file-root-select"
          :value="activeRootId"
          :aria-label="text('选择根目录', 'Select root')"
          @change="handleRootSelect"
          @click.stop
        >
          <option
            v-for="root in visibleRoots"
            :key="root.id"
            :value="root.id"
          >
            {{ rootLabel(root) }}
          </option>
        </select>

        <nav class="studio-file-breadcrumbs" aria-label="Breadcrumb">
          <button
            v-for="crumb in breadcrumbs"
            :key="crumb.path || '__root__'"
            type="button"
            class="studio-file-breadcrumb"
            :class="{ active: crumb.path === activeDirectoryPath }"
            @click.stop="navigateToDirectory(crumb.path)"
          >
            {{ crumb.label }}
          </button>
        </nav>

        <button
          type="button"
          class="studio-file-icon-button"
          :title="text('刷新', 'Refresh')"
          @click.stop="refreshCurrentDirectory"
        >
          <RefreshCw class="studio-file-icon-button__icon" aria-hidden="true" />
        </button>

        <form class="studio-file-search" @submit.prevent.stop="runSearch">
          <Search class="studio-file-search__icon" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            :placeholder="text('搜索文件/目录', 'Search files or directories')"
            @click.stop
          />
          <label class="studio-file-search__recursive">
            <input v-model="recursiveSearch" type="checkbox" />
            <span>{{ text("包含子目录", "Recursive") }}</span>
          </label>
        </form>
      </section>

      <section class="studio-file-toolbar" aria-label="File operations">
        <div class="studio-file-toolbar__group">
          <button type="button" @click.stop="uploadInput?.click()">
            <Upload class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("上传文件", "Upload") }}</span>
          </button>
          <button type="button" @click.stop="uploadDirectoryInput?.click()">
            <FolderUp class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("上传目录", "Upload folder") }}</span>
          </button>
          <button type="button" @click.stop="openOperationDialog('new-file')">
            <FilePlus class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("新建文件", "New file") }}</span>
          </button>
          <button type="button" @click.stop="openOperationDialog('new-folder')">
            <FolderPlus class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("新建目录", "New folder") }}</span>
          </button>
        </div>

        <div class="studio-file-toolbar__group">
          <button type="button" @click.stop="runSearch">
            <Search class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("内容搜索", "Content search") }}</span>
          </button>
          <button type="button" @click.stop="copySelectedPathsToClipboard" :disabled="!selectedItems.length">
            <Copy class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("复制路径", "Copy path") }}</span>
          </button>
          <button type="button" @click.stop="openTerminalHere">
            <Terminal class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("终端", "Terminal") }}</span>
          </button>
        </div>

        <div class="studio-file-toolbar__group">
          <button type="button" :disabled="!selectedItems.length" @click.stop="downloadArchiveForItems(selectedItems)">
            <Download class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("打包下载", "Download zip") }}</span>
          </button>
          <button type="button" :disabled="!selectedItems.length" @click.stop="openOperationDialog('archive')">
            <Archive class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("创建压缩", "Create archive") }}</span>
          </button>
          <button type="button" :disabled="!selectedZipItems.length" @click.stop="unarchiveItems(selectedZipItems)">
            <PackageOpen class="studio-file-toolbar__icon" aria-hidden="true" />
            <span>{{ text("解压", "Extract") }}</span>
          </button>
        </div>

        <div class="studio-file-toolbar__spacer"></div>
        <div class="studio-file-view-toggle" aria-label="View mode">
          <button
            type="button"
            :class="{ active: viewMode === 'list' }"
            :title="text('列表视图', 'List view')"
            @click.stop="viewMode = 'list'"
          >
            <List class="studio-file-icon-button__icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            :class="{ active: viewMode === 'grid' }"
            :title="text('网格视图', 'Grid view')"
            @click.stop="viewMode = 'grid'"
          >
            <Grid2X2 class="studio-file-icon-button__icon" aria-hidden="true" />
          </button>
        </div>
      </section>

      <div class="studio-file-body">
        <aside class="studio-file-sidebar">
          <section class="studio-file-sidebar__section">
            <header>{{ text("根目录", "Roots") }}</header>
            <button
              v-for="root in visibleRoots"
              :key="root.id"
              type="button"
              class="studio-file-sidebar__item"
              :class="{ active: root.id === activeRootId && !activeDirectoryPath }"
              :title="root.absolutePath"
              @click.stop="navigateToRoot(root.id)"
            >
              <FolderOpen class="studio-file-sidebar__icon" aria-hidden="true" />
              <span>{{ rootLabel(root) }}</span>
            </button>
          </section>

          <section class="studio-file-sidebar__section">
            <header>{{ text("当前目录", "Current directory") }}</header>
            <button
              v-if="parentPath !== null"
              type="button"
              class="studio-file-sidebar__item"
              @click.stop="navigateToDirectory(parentPath || '')"
            >
              <FolderOpen class="studio-file-sidebar__icon" aria-hidden="true" />
              <span>..</span>
            </button>
            <button
              v-for="node in childDirectoryNodes"
              :key="node.path"
              type="button"
              class="studio-file-sidebar__item"
              :title="node.path"
              @click.stop="navigateToDirectory(node.path)"
            >
              <FolderOpen class="studio-file-sidebar__icon" aria-hidden="true" />
              <span>{{ node.name }}</span>
            </button>
          </section>
        </aside>

        <main class="studio-file-main" @dragover.prevent @drop.prevent="handleDropUpload">
          <div v-if="directoryLoading" class="studio-file-main__empty">
            {{ text("正在读取目录...", "Loading directory...") }}
          </div>
          <div v-else-if="directoryError" class="studio-file-main__empty studio-file-main__empty--error">
            {{ directoryError }}
          </div>
          <div v-else-if="!displayEntries.length" class="studio-file-main__empty">
            {{ searchActive ? text("没有匹配的文件。", "No matching files.") : text("当前目录为空。", "This directory is empty.") }}
          </div>

          <div v-else-if="viewMode === 'grid'" class="studio-file-grid" role="list">
            <button
              v-for="item in displayEntries"
              :key="item.id"
              type="button"
              class="studio-file-grid-item"
              :class="{ selected: selectedItemIds.has(item.id) }"
              draggable="true"
              @click.stop="toggleSelection(item, $event)"
              @dblclick.stop="openItem(item)"
              @contextmenu.prevent.stop="openContextMenu($event, item)"
              @dragstart="handleItemDragStart($event, item)"
            >
              <span
                class="studio-file-kind-icon studio-file-kind-icon--grid"
                :class="`studio-file-kind-icon--${fileIconKind(item)}`"
                aria-hidden="true"
              >
                {{ fileIconText(item) }}
              </span>
              <strong>{{ item.name }}</strong>
              <small>{{ formatFileSize(item.size) }}</small>
            </button>
          </div>

          <div v-else class="studio-file-table-wrap">
            <table class="studio-file-table">
              <thead>
                <tr>
                  <th class="studio-file-table__check">
                    <input
                      type="checkbox"
                      :checked="allVisibleSelected"
                      :aria-label="text('选择所有可见文件', 'Select all visible files')"
                      @change="toggleAllVisible"
                      @click.stop
                    />
                  </th>
                  <th>
                    <button type="button" class="studio-file-sort" @click.stop="setSort('name')">
                      {{ text("文件名称", "Name") }}
                      <span>{{ sortGlyph("name") }}</span>
                    </button>
                  </th>
                  <th>{{ text("状态", "Status") }}</th>
                  <th>{{ text("权限/所有者", "Perm / Owner") }}</th>
                  <th>
                    <button type="button" class="studio-file-sort" @click.stop="setSort('size')">
                      {{ text("大小", "Size") }}
                      <span>{{ sortGlyph("size") }}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" class="studio-file-sort" @click.stop="setSort('modifiedAt')">
                      {{ text("修改时间", "Modified") }}
                      <span>{{ sortGlyph("modifiedAt") }}</span>
                    </button>
                  </th>
                  <th>{{ text("备注", "Remarks") }}</th>
                  <th>{{ text("操作", "Actions") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="item in displayEntries"
                  :key="item.id"
                  :class="{ selected: selectedItemIds.has(item.id) }"
                  draggable="true"
                  @click.stop="toggleSelection(item, $event)"
                  @dblclick.stop="openItem(item)"
                  @contextmenu.prevent.stop="openContextMenu($event, item)"
                  @dragstart="handleItemDragStart($event, item)"
                >
                  <td class="studio-file-table__check">
                    <input
                      type="checkbox"
                      :checked="selectedItemIds.has(item.id)"
                      :aria-label="text(`选择 ${item.name}`, `Select ${item.name}`)"
                      @change.stop="toggleSelection(item)"
                      @click.stop
                    />
                  </td>
                  <td class="studio-file-table__name">
                    <span
                      class="studio-file-kind-icon"
                      :class="`studio-file-kind-icon--${fileIconKind(item)}`"
                      aria-hidden="true"
                    >
                      {{ fileIconText(item) }}
                    </span>
                    <div>
                      <strong>{{ item.name }}</strong>
                      <small v-if="searchActive">{{ item.path }}</small>
                    </div>
                  </td>
                  <td>
                    <span class="studio-file-status" :class="{ 'studio-file-status--hidden': item.hidden }">
                      {{ item.hidden ? text("隐藏", "Hidden") : text("未保护", "Normal") }}
                    </span>
                  </td>
                  <td>{{ filePermissionLabel(item) }}</td>
                  <td>{{ formatFileSize(item.size) }}</td>
                  <td>{{ formatIsoTimestamp(item.modifiedAt) }}</td>
                  <td class="studio-file-table__remarks">{{ fileRemark(item) }}</td>
                  <td class="studio-file-table__actions">
                    <button type="button" @click.stop="openItem(item)">
                      {{ item.kind === "directory" ? text("打开", "Open") : text("预览", "Preview") }}
                    </button>
                    <button type="button" @click.stop="openContextMenu($event, item)">
                      {{ text("更多", "More") }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </main>

        <aside v-if="detailsItem" class="studio-file-details" aria-label="File details">
          <header class="studio-file-details__head">
            <span
              class="studio-file-kind-icon studio-file-kind-icon--large"
              :class="`studio-file-kind-icon--${fileIconKind(detailsItem)}`"
              aria-hidden="true"
            >
              {{ fileIconText(detailsItem) }}
            </span>
            <div>
              <strong>{{ detailsItem.name }}</strong>
              <span>{{ detailsItem.path || rootLabel(activeRoot) }}</span>
            </div>
            <button type="button" @click.stop="detailsItem = null">
              <X class="studio-file-icon-button__icon" aria-hidden="true" />
            </button>
          </header>

          <section v-if="detailsPreviewUrl && detailsItem.kind === 'file'" class="studio-file-preview">
            <img
              v-if="detailsItem.fileKind === 'image'"
              :src="detailsPreviewUrl"
              :alt="detailsItem.name"
            />
            <video
              v-else-if="detailsItem.fileKind === 'video'"
              :src="detailsPreviewUrl"
              controls
              preload="metadata"
            ></video>
            <audio
              v-else-if="detailsItem.fileKind === 'audio'"
              :src="detailsPreviewUrl"
              controls
              preload="metadata"
            ></audio>
            <div v-else-if="detailsItem.fileKind === 'pdf'" class="studio-file-preview__card">
              <strong>{{ detailsItem.name }}</strong>
              <span>PDF</span>
              <a :href="detailsPreviewUrl" target="_blank" rel="noopener noreferrer">{{ text("打开预览", "Open preview") }}</a>
            </div>
            <div v-else class="studio-file-preview__card">
              <strong>{{ fileKindLabel(detailsItem) }}</strong>
              <span>{{ text("可在编辑器或浏览器中打开", "Open with the editor or browser") }}</span>
            </div>
          </section>

          <dl class="studio-file-details__grid">
            <div>
              <dt>{{ text("类型", "Type") }}</dt>
              <dd>{{ itemTypeLabel(detailsItem) }}</dd>
            </div>
            <div>
              <dt>{{ text("大小", "Size") }}</dt>
              <dd>{{ formatFileSize(detailsItem.size) }}</dd>
            </div>
            <div>
              <dt>{{ text("修改时间", "Modified") }}</dt>
              <dd>{{ formatIsoTimestamp(detailsItem.modifiedAt) }}</dd>
            </div>
            <div>
              <dt>{{ text("权限/所有者", "Perm / Owner") }}</dt>
              <dd>{{ filePermissionLabel(detailsItem) }}</dd>
            </div>
            <div>
              <dt>{{ text("根目录", "Root") }}</dt>
              <dd>{{ rootLabel(rootForId(detailsItem.rootId)) }}</dd>
            </div>
            <div>
              <dt>{{ text("绝对路径", "Absolute path") }}</dt>
              <dd :title="detailsItem.absolutePath">{{ detailsItem.absolutePath }}</dd>
            </div>
          </dl>

          <div class="studio-file-details__actions">
            <button type="button" @click.stop="copyPathsToClipboard([detailsItem])">{{ text("复制路径", "Copy path") }}</button>
            <button v-if="isCodeEditableItem(detailsItem)" type="button" @click.stop="openEditorForItem(detailsItem)">{{ text("编辑", "Edit") }}</button>
            <button type="button" @click.stop="openTerminalHere(detailsItem)">{{ text("终端", "Terminal") }}</button>
            <button v-if="detailsItem.kind === 'file'" type="button" @click.stop="downloadItem(detailsItem)">{{ text("下载", "Download") }}</button>
          </div>
        </aside>
      </div>

      <footer class="studio-file-statusbar">
        <span>{{ text(`共 ${directoryCounts.directories} 个目录，${directoryCounts.files} 个文件`, `${directoryCounts.directories} directories, ${directoryCounts.files} files`) }}</span>
        <span>{{ text(`已选 ${selectedItems.length} 项`, `${selectedItems.length} selected`) }}</span>
        <span>{{ currentAbsolutePath }}</span>
        <span class="studio-file-statusbar__spacer"></span>
        <span v-if="searchActive">{{ text(`搜索结果 ${displayEntries.length} 项`, `${displayEntries.length} search results`) }}</span>
      </footer>

      <section
        v-if="contextMenu.open"
        class="studio-file-context-menu"
        role="menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @click.stop
        @keydown.esc.stop.prevent="closeContextMenu"
      >
        <button type="button" role="menuitem" @click="openContextItem">
          <FolderOpen class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ contextMenu.item?.kind === "directory" ? text("打开", "Open") : text("预览", "Preview") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenu.item || !isCodeEditableItem(contextMenu.item)" @click="editContextItem">
          <Pencil class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("编辑", "Edit") }}</span>
        </button>
        <button type="button" role="menuitem" @click="openTerminalHere(contextMenu.item || undefined)">
          <Terminal class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("在终端打开", "Open in terminal") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenu.item || contextMenu.item.kind !== 'file'" @click="downloadContextItem">
          <Download class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("下载", "Download") }}</span>
        </button>
        <span class="studio-file-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" @click="copyContextPath">
          <Copy class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("复制路径", "Copy path") }}</span>
        </button>
        <button type="button" role="menuitem" @click="copyContextRelativePath">
          <Copy class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("复制相对路径", "Copy relative path") }}</span>
        </button>
        <button type="button" role="menuitem" @click="copyContextStudioRef">
          <Link2 class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("复制 Studio 引用", "Copy Studio ref") }}</span>
        </button>
        <span class="studio-file-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" @click="copyContextItems">
          <Copy class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("复制", "Copy") }}</span>
        </button>
        <button type="button" role="menuitem" @click="cutContextItems">
          <Scissors class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("剪切", "Cut") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!clipboardItems.length" @click="pasteClipboardItems">
          <ClipboardPaste class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("粘贴", "Paste") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenu.item" @click="openOperationDialog('rename', contextMenu.item || undefined)">
          <Pencil class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("重命名", "Rename") }}</span>
        </button>
        <span class="studio-file-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" @click="openOperationDialog('archive', contextMenu.item || undefined)">
          <Archive class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("创建压缩", "Create archive") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenu.item || !isZipArchiveItem(contextMenu.item)" @click="unarchiveItems(contextMenu.item ? [contextMenu.item] : [])">
          <PackageOpen class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("解压到当前目录", "Extract here") }}</span>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenu.item" @click="showContextDetails">
          <Info class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("属性", "Properties") }}</span>
        </button>
        <button type="button" role="menuitem" class="studio-file-context-menu__danger" :disabled="!contextMenu.item" @click="openOperationDialog('delete', contextMenu.item || undefined)">
          <Trash2 class="studio-file-context-menu__icon" aria-hidden="true" />
          <span>{{ text("删除", "Delete") }}</span>
        </button>
      </section>

      <section
        v-if="operationDialog"
        class="studio-file-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="operationDialogTitle"
        @click.self="closeOperationDialog"
      >
        <form class="studio-file-dialog__panel" @submit.prevent="submitOperationDialog">
          <header>
            <strong>{{ operationDialogTitle }}</strong>
            <button type="button" @click="closeOperationDialog">
              <X class="studio-file-icon-button__icon" aria-hidden="true" />
            </button>
          </header>
          <p>{{ operationDialogDescription }}</p>
          <label v-if="operationDialogNeedsInput">
            <span>{{ operationDialogInputLabel }}</span>
            <input v-model="operationDialog.value" type="text" required autofocus />
          </label>
          <div class="studio-file-dialog__actions">
            <button type="button" @click="closeOperationDialog">{{ text("取消", "Cancel") }}</button>
            <button type="submit" class="studio-file-dialog__primary">{{ operationDialogConfirmLabel }}</button>
          </div>
        </form>
      </section>

      <FileEditorWorkspace
        v-if="editorTabs.length"
        v-model="editorDraft"
        :tabs="editorTabs"
        :active-tab-id="activeEditorId"
        :maximized="editorMaximized"
        :state="editorState"
        :loading="editorLoading"
        :saving="editorSaving"
        :dirty="editorDirty"
        :download-url="editorDownloadUrl"
        :recent-files="recentEditorFiles"
        :line-count="editorLineCount"
        :character-count="editorCharacterCount"
        :language-label="editorLanguageLabel"
        :search-request="editorSearchRequest"
        :theme="resolvedTheme"
        :text="text"
        @set-active="setActiveEditor"
        @close="closeEditor"
        @search="requestEditorSearch"
        @download="downloadEditorFile"
        @reset="resetEditor"
        @save="saveEditor"
        @open-recent="openRecentEditorFile"
        @update:maximized="editorMaximized = $event"
      />
    </template>

    <div v-else class="file-manager-loading file-manager-loading--error">
      {{ text("文件管理器不可用", "File manager unavailable") }}
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  FilePlus,
  FolderOpen,
  FolderPlus,
  FolderUp,
  Grid2X2,
  Info,
  Link2,
  List,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Scissors,
  Terminal,
  Trash2,
  Upload,
  X,
} from "@lucide/vue";
import type {
  FileEntryKind,
  FileEntrySummary,
  FileRootSummary,
  FilesDirectoryPayload,
  FilesReadPayload,
  FilesSearchPayload,
  FilesSummaryPayload,
  FileTreeNodePayload,
} from "../../../../../types/files";
import { useLocalePreference } from "../../shared/locale";
import { useThemePreference } from "../../shared/theme";
import {
  archivePaths,
  browseDirectory,
  buildArchiveDownloadUrl,
  buildFileDownloadUrl,
  copyPath,
  createDirectory,
  createFile,
  deletePaths,
  fetchDirectoryTree,
  fetchFilesSummary,
  movePath,
  readFileContent,
  renamePath,
  saveFileContent,
  searchFiles,
  unarchiveFile,
  uploadFiles,
} from "./api";
import FileEditorWorkspace from "./FileEditorWorkspace.vue";
import {
  resolveTerminalFileKind,
  type TerminalFileKind,
} from "../terminal/terminal-file-kind";
import {
  TERMINAL_RESOURCE_DRAG_MIME,
  serializeTerminalResourceTransfer,
  shellQuoteTerminalPath,
  type TerminalResourceTransferPayload,
} from "../terminal/terminal-resource-transfer";
import "./files-workspace.css";

defineProps<{
  pageEyebrow: string;
}>();

type ViewMode = "list" | "grid";
type SortKey = "name" | "size" | "modifiedAt";
type SortDirection = "asc" | "desc";
type ClipboardMode = "copy" | "cut";
type OperationDialogKind = "new-file" | "new-folder" | "rename" | "archive" | "delete";

interface NativeFileItem extends FileEntrySummary {
  id: string;
  rootId: string;
  directoryPath: string;
  absolutePath: string;
  fileKind: TerminalFileKind;
  mimeType?: string | null;
}

interface DirectoryTab {
  id: string;
  rootId: string;
  directoryPath: string;
  label: string;
  rootLabel: string;
  absolutePath: string;
}

interface DirectoryHistoryEntry {
  rootId: string;
  directoryPath: string;
}

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

interface OperationDialogState {
  kind: OperationDialogKind;
  item: NativeFileItem | null;
  items: NativeFileItem[];
  value: string;
}

interface UploadFileCandidate {
  file: File;
  relativePath?: string;
}

interface BrowserFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
}

interface BrowserFileSystemFileEntry extends BrowserFileSystemEntry {
  file(success: (file: File) => void, error?: (error: unknown) => void): void;
}

interface BrowserFileSystemDirectoryEntry extends BrowserFileSystemEntry {
  createReader(): BrowserFileSystemDirectoryReader;
}

interface BrowserFileSystemDirectoryReader {
  readEntries(
    success: (entries: BrowserFileSystemEntry[]) => void,
    error?: (error: unknown) => void,
  ): void;
}

const FILE_MANAGER_UI_STORAGE_KEY = "openclaw-studio.files.native.ui";
const RECENT_EDITOR_FILES_STORAGE_KEY = "openclaw-studio.files.recent-editor";
const TERMINAL_DESCRIPTORS_STORAGE_KEY = "openclaw-studio.terminal.descriptors";
const TERMINAL_WORKSPACE_STORAGE_KEY = `${TERMINAL_DESCRIPTORS_STORAGE_KEY}.workspace`;
const TERMINAL_PENDING_LAUNCH_STORAGE_KEY = "openclaw-studio.terminal.pendingLaunchMetadata";
const MAX_UPLOAD_FILE_BYTES = 24 * 1024 * 1024;
const MAX_UPLOAD_BATCH_BYTES = 96 * 1024 * 1024;

const router = useRouter();
const { locale, text } = useLocalePreference();
const { resolvedTheme } = useThemePreference();

const summary = ref<FilesSummaryPayload | null>(null);
const loading = ref(false);
const directoryLoading = ref(false);
const directoryError = ref("");
const noticeMessage = ref<{ kind: "success" | "error" | "info" | "warning"; text: string } | null>(null);
const activeRootId = ref("");
const activeDirectoryPath = ref("");
const activeDirectoryTabId = ref("");
const directoryTabs = ref<DirectoryTab[]>([]);
const directoryPayload = ref<FilesDirectoryPayload | null>(null);
const directoryEntries = ref<NativeFileItem[]>([]);
const childDirectoryNodes = ref<FileTreeNodePayload[]>([]);
const directoryHistory = ref<DirectoryHistoryEntry[]>([]);
const directoryHistoryIndex = ref(-1);
const selectedItemIds = ref<Set<string>>(new Set());
const clipboardMode = ref<ClipboardMode | null>(null);
const clipboardItems = ref<NativeFileItem[]>([]);
const viewMode = ref<ViewMode>(readStoredViewMode());
const sortKey = ref<SortKey>("name");
const sortDirection = ref<SortDirection>("asc");
const searchQuery = ref("");
const recursiveSearch = ref(false);
const searchResults = ref<NativeFileItem[] | null>(null);
const detailsItem = ref<NativeFileItem | null>(null);
const operationDialog = ref<OperationDialogState | null>(null);
const contextMenu = ref<{
  open: boolean;
  x: number;
  y: number;
  item: NativeFileItem | null;
}>({
  open: false,
  x: 0,
  y: 0,
  item: null,
});
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadDirectoryInput = ref<HTMLInputElement | null>(null);

const editorMaximized = ref(false);
const editorTabs = ref<EditorFileTab[]>([]);
const activeEditorId = ref("");
const recentEditorFiles = ref<RecentEditorFile[]>(readRecentEditorFiles());
const editorSearchRequest = ref(0);

const visibleRoots = computed(() =>
  (summary.value?.roots || []).filter((root) => root.id !== "project-root"),
);
const activeRoot = computed(() => rootForId(activeRootId.value));
const parentPath = computed(() => directoryPayload.value?.parentPath ?? null);
const breadcrumbs = computed(() => directoryPayload.value?.breadcrumbs || []);
const currentAbsolutePath = computed(() =>
  buildAbsolutePath(activeRoot.value, activeDirectoryPath.value),
);
const directoryCounts = computed(() =>
  directoryPayload.value?.counts || {
    directories: directoryEntries.value.filter((entry) => entry.kind === "directory").length,
    files: directoryEntries.value.filter((entry) => entry.kind === "file").length,
    hidden: directoryEntries.value.filter((entry) => entry.hidden).length,
    total: directoryEntries.value.length,
  },
);
const searchActive = computed(() => Boolean(searchResults.value));
const displayEntries = computed(() => {
  const source = searchResults.value || directoryEntries.value;
  const query = searchResults.value ? "" : searchQuery.value.trim().toLowerCase();
  const filtered = query
    ? source.filter((entry) =>
        entry.name.toLowerCase().includes(query) ||
        entry.path.toLowerCase().includes(query),
      )
    : source;
  return sortNativeFileItems([...filtered], sortKey.value, sortDirection.value);
});
const selectedItems = computed(() =>
  displayEntries.value.filter((entry) => selectedItemIds.value.has(entry.id)),
);
const selectedZipItems = computed(() => selectedItems.value.filter((item) => isZipArchiveItem(item)));
const allVisibleSelected = computed(() =>
  Boolean(displayEntries.value.length && displayEntries.value.every((entry) => selectedItemIds.value.has(entry.id))),
);
const canGoBack = computed(() => directoryHistoryIndex.value > 0);
const canGoForward = computed(() =>
  directoryHistoryIndex.value >= 0 && directoryHistoryIndex.value < directoryHistory.value.length - 1,
);
const detailsPreviewUrl = computed(() => {
  const item = detailsItem.value;
  if (!item || item.kind !== "file") return "";
  return buildFileDownloadUrl(item.rootId, item.path);
});
const activeEditorTab = computed(
  () =>
    editorTabs.value.find((tab) => tab.id === activeEditorId.value)
    || editorTabs.value[0]
    || null,
);
const editorState = computed<EditorStateSnapshot>(() => {
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
const dirtyEditorTabs = computed(() => editorTabs.value.filter(isEditorTabDirty));
const editorDirty = computed(
  () => Boolean(activeEditorTab.value && isEditorTabDirty(activeEditorTab.value)),
);
const editorDownloadUrl = computed(() => {
  if (!editorState.value.rootId || !editorState.value.apiPath) return "";
  return buildFileDownloadUrl(editorState.value.rootId, editorState.value.apiPath, { download: true });
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
const operationDialogTitle = computed(() => {
  const dialog = operationDialog.value;
  if (!dialog) return "";
  if (dialog.kind === "new-file") return text("新建文件", "New file");
  if (dialog.kind === "new-folder") return text("新建目录", "New folder");
  if (dialog.kind === "rename") return text("重命名", "Rename");
  if (dialog.kind === "archive") return text("创建压缩包", "Create archive");
  return text("删除文件", "Delete files");
});
const operationDialogDescription = computed(() => {
  const dialog = operationDialog.value;
  if (!dialog) return "";
  if (dialog.kind === "delete") {
    return text(
      `将删除 ${dialog.items.length || 1} 项。该操作不可撤销。`,
      `Delete ${dialog.items.length || 1} item(s). This cannot be undone.`,
    );
  }
  if (dialog.kind === "archive") {
    return text("压缩包会创建在当前目录。", "The archive will be created in the current directory.");
  }
  return text("请输入名称。", "Enter a name.");
});
const operationDialogInputLabel = computed(() => {
  const dialog = operationDialog.value;
  if (!dialog) return "";
  if (dialog.kind === "archive") return text("压缩包名称", "Archive name");
  return text("名称", "Name");
});
const operationDialogNeedsInput = computed(() => operationDialog.value?.kind !== "delete");
const operationDialogConfirmLabel = computed(() => {
  const kind = operationDialog.value?.kind;
  if (kind === "delete") return text("确认删除", "Delete");
  if (kind === "archive") return text("创建", "Create");
  return text("确认", "Confirm");
});

function readStoredViewMode(): ViewMode {
  try {
    const raw = globalThis.localStorage?.getItem(FILE_MANAGER_UI_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as { viewMode?: unknown } : {};
    return parsed.viewMode === "grid" ? "grid" : "list";
  } catch {
    return "list";
  }
}

function persistViewMode(): void {
  try {
    globalThis.localStorage?.setItem(FILE_MANAGER_UI_STORAGE_KEY, JSON.stringify({ viewMode: viewMode.value }));
  } catch {
    // UI persistence is optional.
  }
}

function readRecentEditorFiles(): RecentEditorFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_EDITOR_FILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as RecentEditorFile[] : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item?.rootId && item.apiPath && item.name)
          .slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function persistRecentEditorFiles(items: RecentEditorFile[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_EDITOR_FILES_STORAGE_KEY, JSON.stringify(items.slice(0, 12)));
  } catch {
    // Recent files are best-effort.
  }
}

function rootLabel(root: FileRootSummary | null | undefined): string {
  if (!root) return text("根目录", "Root");
  return locale.value === "zh" ? root.labelZh : root.labelEn;
}

function rootForId(rootId: string): FileRootSummary | null {
  return visibleRoots.value.find((root) => root.id === rootId) || visibleRoots.value[0] || null;
}

function normalizePortableFilePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function joinPortableFilePath(basePath: string, relativePath: string): string {
  const base = normalizePortableFilePath(basePath).replace(/\/+$/g, "");
  const relative = normalizePortableFilePath(relativePath).replace(/^\/+/g, "");
  if (!relative) return base || "/";
  return base === "/" ? `/${relative}` : `${base}/${relative}`;
}

function buildAbsolutePath(root: FileRootSummary | null | undefined, relativePath: string): string {
  return root ? joinPortableFilePath(root.absolutePath, relativePath) : relativePath;
}

function createDirectoryTab(rootId: string, directoryPath: string): DirectoryTab {
  const root = rootForId(rootId);
  const normalizedPath = normalizePortableFilePath(directoryPath).replace(/^\/+|\/+$/g, "");
  const label = normalizedPath.split("/").filter(Boolean).pop() || rootLabel(root);
  return {
    id: `${rootId}:${normalizedPath || "__root__"}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 6)}`,
    rootId,
    directoryPath: normalizedPath,
    label,
    rootLabel: rootLabel(root),
    absolutePath: buildAbsolutePath(root, normalizedPath),
  };
}

function updateActiveDirectoryTab(rootId: string, directoryPath: string): void {
  const tab = directoryTabs.value.find((item) => item.id === activeDirectoryTabId.value);
  if (!tab) return;
  const next = createDirectoryTab(rootId, directoryPath);
  tab.rootId = next.rootId;
  tab.directoryPath = next.directoryPath;
  tab.label = next.label;
  tab.rootLabel = next.rootLabel;
  tab.absolutePath = next.absolutePath;
}

function toNativeFileItem(entry: FileEntrySummary, rootId: string, directoryPath: string): NativeFileItem {
  const root = rootForId(rootId);
  const fileKind = entry.kind === "directory"
    ? "text"
    : resolveTerminalFileKind(entry);
  return {
    ...entry,
    id: `${rootId}:${entry.path}`,
    rootId,
    directoryPath,
    absolutePath: buildAbsolutePath(root, entry.path),
    fileKind,
  };
}

function sortNativeFileItems(items: NativeFileItem[], key: SortKey, direction: SortDirection): NativeFileItem[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return items.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
    if (key === "size") {
      return ((left.size || 0) - (right.size || 0)) * multiplier;
    }
    if (key === "modifiedAt") {
      return (Date.parse(left.modifiedAt || "") - Date.parse(right.modifiedAt || "")) * multiplier;
    }
    return left.name.localeCompare(right.name, undefined, { numeric: true }) * multiplier;
  });
}

async function reloadSummary(): Promise<void> {
  loading.value = true;
  try {
    summary.value = await fetchFilesSummary();
    const defaultRootId = summary.value.defaultRootId || visibleRoots.value[0]?.id || "";
    if (!activeRootId.value) {
      activeRootId.value = defaultRootId;
    }
    if (!directoryTabs.value.length && activeRootId.value) {
      const tab = createDirectoryTab(activeRootId.value, "");
      directoryTabs.value = [tab];
      activeDirectoryTabId.value = tab.id;
      await loadDirectory(activeRootId.value, "", { pushHistory: true });
    }
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

async function loadDirectory(
  rootId: string,
  directoryPath = "",
  options: { pushHistory?: boolean; preserveSearch?: boolean } = {},
): Promise<void> {
  const normalizedPath = normalizePortableFilePath(directoryPath).replace(/^\/+|\/+$/g, "");
  directoryLoading.value = true;
  directoryError.value = "";
  try {
    const payload = await browseDirectory(rootId, normalizedPath, true);
    directoryPayload.value = payload;
    activeRootId.value = payload.rootId;
    activeDirectoryPath.value = payload.directoryPath;
    directoryEntries.value = payload.entries.map((entry) =>
      toNativeFileItem(entry, payload.rootId, payload.directoryPath),
    );
    selectedItemIds.value = new Set();
    detailsItem.value = null;
    updateActiveDirectoryTab(payload.rootId, payload.directoryPath);
    if (!options.preserveSearch) {
      searchResults.value = null;
    }
    if (options.pushHistory !== false) {
      pushDirectoryHistory(payload.rootId, payload.directoryPath);
    }
    await refreshTreeNodes(payload.rootId, payload.directoryPath);
  } catch (error) {
    directoryError.value = error instanceof Error ? error.message : text("目录读取失败", "Failed to read directory");
  } finally {
    directoryLoading.value = false;
  }
}

async function refreshTreeNodes(rootId = activeRootId.value, directoryPath = activeDirectoryPath.value): Promise<void> {
  try {
    const tree = await fetchDirectoryTree(rootId, directoryPath, true);
    childDirectoryNodes.value = tree.children || [];
  } catch {
    childDirectoryNodes.value = directoryEntries.value
      .filter((entry) => entry.kind === "directory")
      .map((entry) => ({ path: entry.path, name: entry.name }));
  }
}

function pushDirectoryHistory(rootId: string, directoryPath: string): void {
  const current = directoryHistory.value[directoryHistoryIndex.value];
  if (current?.rootId === rootId && current.directoryPath === directoryPath) return;
  const nextHistory = directoryHistory.value.slice(0, directoryHistoryIndex.value + 1);
  nextHistory.push({ rootId, directoryPath });
  directoryHistory.value = nextHistory.slice(-80);
  directoryHistoryIndex.value = directoryHistory.value.length - 1;
}

function navigateToDirectory(pathValue: string): void {
  void loadDirectory(activeRootId.value, pathValue, { pushHistory: true });
}

function navigateToRoot(rootId: string): void {
  void loadDirectory(rootId, "", { pushHistory: true });
}

function handleRootSelect(event: Event): void {
  const rootId = (event.target as HTMLSelectElement).value;
  if (!rootId) return;
  navigateToRoot(rootId);
}

function goBack(): void {
  if (!canGoBack.value) return;
  directoryHistoryIndex.value -= 1;
  const entry = directoryHistory.value[directoryHistoryIndex.value];
  if (entry) void loadDirectory(entry.rootId, entry.directoryPath, { pushHistory: false });
}

function goForward(): void {
  if (!canGoForward.value) return;
  directoryHistoryIndex.value += 1;
  const entry = directoryHistory.value[directoryHistoryIndex.value];
  if (entry) void loadDirectory(entry.rootId, entry.directoryPath, { pushHistory: false });
}

function refreshCurrentDirectory(): void {
  void loadDirectory(activeRootId.value, activeDirectoryPath.value, {
    pushHistory: false,
    preserveSearch: true,
  });
}

async function runSearch(): Promise<void> {
  const query = searchQuery.value.trim();
  if (!query) {
    searchResults.value = null;
    return;
  }
  directoryLoading.value = true;
  try {
    const payload: FilesSearchPayload = await searchFiles(
      activeRootId.value,
      query,
      activeDirectoryPath.value,
      recursiveSearch.value,
      true,
    );
    searchResults.value = payload.results.map((entry) =>
      toNativeFileItem(entry, payload.rootId, entry.directoryPath),
    );
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("搜索失败", "Search failed"));
  } finally {
    directoryLoading.value = false;
  }
}

function activateDirectoryTab(tabId: string): void {
  const tab = directoryTabs.value.find((item) => item.id === tabId);
  if (!tab) return;
  activeDirectoryTabId.value = tab.id;
  void loadDirectory(tab.rootId, tab.directoryPath, { pushHistory: true });
}

function openCurrentDirectoryInNewTab(): void {
  const tab = createDirectoryTab(activeRootId.value, activeDirectoryPath.value);
  directoryTabs.value = [...directoryTabs.value, tab].slice(-12);
  activeDirectoryTabId.value = tab.id;
}

function closeDirectoryTab(tabId: string): void {
  if (directoryTabs.value.length <= 1) return;
  const index = directoryTabs.value.findIndex((tab) => tab.id === tabId);
  if (index < 0) return;
  const wasActive = activeDirectoryTabId.value === tabId;
  directoryTabs.value.splice(index, 1);
  if (wasActive) {
    const next = directoryTabs.value[index] || directoryTabs.value[index - 1] || directoryTabs.value[0];
    if (next) {
      activeDirectoryTabId.value = next.id;
      void loadDirectory(next.rootId, next.directoryPath, { pushHistory: true });
    }
  }
}

function setSort(key: SortKey): void {
  if (sortKey.value === key) {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
    return;
  }
  sortKey.value = key;
  sortDirection.value = "asc";
}

function sortGlyph(key: SortKey): string {
  if (sortKey.value !== key) return "↕";
  return sortDirection.value === "asc" ? "↑" : "↓";
}

function toggleSelection(item: NativeFileItem, event?: MouseEvent): void {
  const next = new Set(event?.shiftKey || event?.ctrlKey || event?.metaKey ? selectedItemIds.value : []);
  if (next.has(item.id)) {
    next.delete(item.id);
  } else {
    next.add(item.id);
  }
  selectedItemIds.value = next;
  detailsItem.value = item;
}

function toggleAllVisible(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  selectedItemIds.value = checked
    ? new Set(displayEntries.value.map((entry) => entry.id))
    : new Set();
}

function selectedOrSingle(item: NativeFileItem | null | undefined): NativeFileItem[] {
  if (!item) return selectedItems.value;
  if (selectedItemIds.value.has(item.id)) return selectedItems.value;
  return [item];
}

function openItem(item: NativeFileItem): void {
  closeContextMenu();
  if (item.kind === "directory") {
    void loadDirectory(item.rootId, item.path, { pushHistory: true });
    return;
  }
  detailsItem.value = item;
  if (isCodeEditableItem(item)) {
    void openEditorForItem(item);
  }
}

function openContextMenu(event: MouseEvent, item: NativeFileItem): void {
  if (!selectedItemIds.value.has(item.id)) {
    selectedItemIds.value = new Set([item.id]);
  }
  detailsItem.value = item;
  contextMenu.value = {
    open: true,
    x: Math.min(event.clientX, window.innerWidth - 260),
    y: Math.min(event.clientY, window.innerHeight - 420),
    item,
  };
}

function closeContextMenu(): void {
  contextMenu.value.open = false;
}

function closeTransientSurfaces(): void {
  closeContextMenu();
}

function setNotice(kind: "success" | "error" | "info" | "warning", message: string): void {
  noticeMessage.value = { kind, text: message };
  window.setTimeout(() => {
    if (noticeMessage.value?.text === message) {
      noticeMessage.value = null;
    }
  }, 2600);
}

function openContextItem(): void {
  const item = contextMenu.value.item;
  if (item) openItem(item);
}

function editContextItem(): void {
  const item = contextMenu.value.item;
  if (item && isCodeEditableItem(item)) void openEditorForItem(item);
  closeContextMenu();
}

function downloadContextItem(): void {
  const item = contextMenu.value.item;
  if (item) downloadItem(item);
  closeContextMenu();
}

function copyContextPath(): void {
  const item = contextMenu.value.item;
  if (item) void copyPathsToClipboard([item]);
  closeContextMenu();
}

function copyContextRelativePath(): void {
  const item = contextMenu.value.item;
  if (item) void writeTextToSystemClipboard(item.path);
  closeContextMenu();
}

function copyContextStudioRef(): void {
  const item = contextMenu.value.item;
  if (item) void writeTextToSystemClipboard(studioRefForItem(item));
  closeContextMenu();
}

function copyContextItems(): void {
  clipboardMode.value = "copy";
  clipboardItems.value = selectedOrSingle(contextMenu.value.item);
  setNotice("success", text("已复制到文件剪贴板", "Copied to file clipboard"));
  closeContextMenu();
}

function cutContextItems(): void {
  clipboardMode.value = "cut";
  clipboardItems.value = selectedOrSingle(contextMenu.value.item);
  setNotice("success", text("已剪切到文件剪贴板", "Cut to file clipboard"));
  closeContextMenu();
}

function showContextDetails(): void {
  if (contextMenu.value.item) detailsItem.value = contextMenu.value.item;
  closeContextMenu();
}

function openOperationDialog(kind: OperationDialogKind, item: NativeFileItem | null = null): void {
  const items = kind === "delete" || kind === "archive"
    ? selectedOrSingle(item)
    : item
      ? [item]
      : selectedItems.value;
  const defaultName =
    kind === "rename" && item
      ? item.name
      : kind === "archive"
        ? buildDefaultArchiveName(items)
        : "";
  operationDialog.value = {
    kind,
    item,
    items,
    value: defaultName,
  };
  closeContextMenu();
}

function closeOperationDialog(): void {
  operationDialog.value = null;
}

async function submitOperationDialog(): Promise<void> {
  const dialog = operationDialog.value;
  if (!dialog) return;
  try {
    if (dialog.kind === "new-file") {
      await createFile({
        rootId: activeRootId.value,
        directoryPath: activeDirectoryPath.value,
        name: dialog.value,
        content: "",
      });
      setNotice("success", text("文件已创建", "File created"));
    } else if (dialog.kind === "new-folder") {
      await createDirectory({
        rootId: activeRootId.value,
        directoryPath: activeDirectoryPath.value,
        name: dialog.value,
      });
      setNotice("success", text("目录已创建", "Directory created"));
    } else if (dialog.kind === "rename" && dialog.item) {
      await renamePath({
        rootId: dialog.item.rootId,
        path: dialog.item.path,
        nextName: dialog.value,
      });
      setNotice("success", text("已重命名", "Renamed"));
    } else if (dialog.kind === "archive") {
      const items = dialog.items.length ? dialog.items : selectedItems.value;
      await createArchiveForItems(items, dialog.value);
    } else if (dialog.kind === "delete") {
      await deleteItems(dialog.items.length ? dialog.items : selectedItems.value);
    }
    closeOperationDialog();
    refreshCurrentDirectory();
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("文件操作失败", "File operation failed"));
  }
}

function buildDefaultArchiveName(items: NativeFileItem[]): string {
  const base = items.length === 1 ? items[0].name.replace(/\.[^.]+$/, "") : "selected-items";
  return `${base || "archive"}.zip`;
}

async function createArchiveForItems(items: NativeFileItem[], archiveName: string): Promise<void> {
  if (!items.length) return;
  const rootId = items[0].rootId;
  if (items.some((item) => item.rootId !== rootId)) {
    throw new Error(text("只能压缩同一根目录下的文件", "Only items from the same root can be archived"));
  }
  await archivePaths({
    rootId,
    directoryPath: activeDirectoryPath.value,
    paths: items.map((item) => item.path).filter(Boolean),
    name: archiveName,
  });
  setNotice("success", text("压缩包已创建", "Archive created"));
}

async function deleteItems(items: NativeFileItem[]): Promise<void> {
  if (!items.length) return;
  const byRoot = new Map<string, string[]>();
  for (const item of items) {
    const paths = byRoot.get(item.rootId) || [];
    paths.push(item.path);
    byRoot.set(item.rootId, paths);
  }
  for (const [rootId, paths] of byRoot.entries()) {
    await deletePaths({ rootId, paths });
  }
  selectedItemIds.value = new Set();
  detailsItem.value = null;
  setNotice("success", text("文件已删除", "Deleted"));
}

async function pasteClipboardItems(): Promise<void> {
  const mode = clipboardMode.value;
  const items = clipboardItems.value;
  if (!mode || !items.length) return;
  try {
    for (const item of items) {
      const payload = {
        sourceRootId: item.rootId,
        sourcePath: item.path,
        destinationRootId: activeRootId.value,
        destinationDirectoryPath: activeDirectoryPath.value,
      };
      if (mode === "copy") {
        await copyPath(payload);
      } else {
        await movePath(payload);
      }
    }
    if (mode === "cut") {
      clipboardItems.value = [];
      clipboardMode.value = null;
    }
    setNotice("success", mode === "copy" ? text("已复制", "Copied") : text("已移动", "Moved"));
    refreshCurrentDirectory();
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("粘贴失败", "Paste failed"));
  } finally {
    closeContextMenu();
  }
}

function downloadItem(item: NativeFileItem): void {
  if (item.kind !== "file") return;
  triggerBrowserDownload(buildFileDownloadUrl(item.rootId, item.path, { download: true }), item.name);
}

function downloadArchiveForItems(items: NativeFileItem[]): void {
  if (!items.length) return;
  const rootId = items[0].rootId;
  if (!rootId || items.some((item) => item.rootId !== rootId)) return;
  const archiveName = items.length === 1 ? `${items[0].name}-archive` : "selected-items";
  triggerBrowserDownload(buildArchiveDownloadUrl(rootId, items.map((item) => item.path), archiveName));
}

async function unarchiveItems(items: NativeFileItem[]): Promise<void> {
  const zipItems = items.filter((item) => isZipArchiveItem(item));
  if (!zipItems.length) return;
  try {
    for (const item of zipItems) {
      await unarchiveFile({
        rootId: item.rootId,
        archivePath: item.path,
        directoryPath: item.directoryPath || activeDirectoryPath.value,
      });
    }
    setNotice(
      "success",
      zipItems.length > 1
        ? text(`已解压 ${zipItems.length} 个压缩包`, `Extracted ${zipItems.length} archives`)
        : text("压缩包已解压", "Archive extracted"),
    );
    refreshCurrentDirectory();
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("解压失败", "Failed to extract archive"));
  } finally {
    closeContextMenu();
  }
}

function isZipArchiveItem(item: NativeFileItem): boolean {
  if (item.kind !== "file") return false;
  const extension = String(item.ext || "").replace(/^\./, "").toLowerCase();
  return extension === "zip" || item.name.toLowerCase().endsWith(".zip");
}

function isCodeEditableItem(item: NativeFileItem): boolean {
  if (item.kind !== "file") return false;
  return Boolean(item.textLike || [
    "code",
    "config",
    "data",
    "log",
    "markdown",
    "package",
    "script",
    "style",
    "test",
    "text",
  ].includes(item.fileKind));
}

function itemTypeLabel(item: NativeFileItem): string {
  if (item.kind === "directory") return text("文件夹", "Folder");
  return fileKindLabel(item);
}

function fileKindLabel(item: NativeFileItem): string {
  const labels: Record<TerminalFileKind, string> = {
    archive: text("压缩包", "Archive"),
    audio: text("音频", "Audio"),
    binary: text("二进制文件", "Binary"),
    code: text("代码", "Code"),
    config: text("配置文件", "Config"),
    data: text("数据文件", "Data"),
    database: text("数据库", "Database"),
    document: text("文档", "Document"),
    font: text("字体", "Font"),
    image: text("图片", "Image"),
    key: text("密钥/证书", "Key"),
    lock: text("锁文件", "Lock"),
    log: text("日志", "Log"),
    markdown: "Markdown",
    package: text("包管理文件", "Package"),
    pdf: "PDF",
    presentation: text("演示文稿", "Presentation"),
    script: text("脚本", "Script"),
    spreadsheet: text("表格", "Spreadsheet"),
    style: text("样式文件", "Style"),
    test: text("测试文件", "Test"),
    text: text("文本", "Text"),
    video: text("视频", "Video"),
  };
  return labels[item.fileKind] || text("文件", "File");
}

function fileIconKind(item: NativeFileItem): string {
  if (item.kind === "directory") return "folder";
  if (item.fileKind === "audio" || item.fileKind === "video") return "media";
  if (item.fileKind === "pdf" || item.fileKind === "document" || item.fileKind === "spreadsheet" || item.fileKind === "presentation") return "document";
  if (item.fileKind === "markdown" || item.fileKind === "text" || item.fileKind === "log") return "text";
  if (item.fileKind === "code" || item.fileKind === "config" || item.fileKind === "script" || item.fileKind === "style" || item.fileKind === "test") return "code";
  return item.fileKind;
}

function fileIconText(item: NativeFileItem): string {
  if (item.kind === "directory") return "";
  const ext = String(item.ext || "").replace(/^\./, "").toUpperCase();
  if (!ext) return item.fileKind.slice(0, 3).toUpperCase();
  return ext.length > 4 ? ext.slice(0, 4) : ext;
}

function filePermissionLabel(item: NativeFileItem): string {
  if (item.kind === "directory") return text("目录", "Directory");
  return fileKindLabel(item);
}

function fileRemark(item: NativeFileItem): string {
  if (item.kind === "directory") return text("目录", "Directory");
  if (item.hidden) return text("隐藏项", "Hidden");
  return fileKindLabel(item);
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

function formatIsoTimestamp(value: string | null | undefined): string {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat(locale.value === "zh" ? "zh-CN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
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

async function writeTextToSystemClipboard(content: string): Promise<void> {
  const normalized = String(content || "");
  if (!normalized) return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalized);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = normalized;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) throw new Error("Clipboard API is unavailable");
}

async function copyPathsToClipboard(items: NativeFileItem[]): Promise<void> {
  const paths = items.map((item) => item.absolutePath).filter(Boolean);
  if (!paths.length) return;
  try {
    await writeTextToSystemClipboard(paths.join("\n"));
    setNotice(
      "success",
      paths.length > 1 ? text(`已复制 ${paths.length} 个路径`, `Copied ${paths.length} paths`) : text("路径已复制", "Path copied"),
    );
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("复制失败", "Copy failed"));
  }
}

function copySelectedPathsToClipboard(): void {
  void copyPathsToClipboard(selectedItems.value);
}

function studioRefForItem(item: NativeFileItem): string {
  return `studio-file:${item.absolutePath}`;
}

function handleItemDragStart(event: DragEvent, item: NativeFileItem): void {
  const payload: TerminalResourceTransferPayload = {
    rootId: item.rootId,
    path: item.path,
    absolutePath: item.absolutePath,
    kind: item.kind,
    name: item.name,
  };
  event.dataTransfer?.setData(TERMINAL_RESOURCE_DRAG_MIME, serializeTerminalResourceTransfer(payload));
  event.dataTransfer?.setData("text/plain", shellQuoteTerminalPath(item.absolutePath));
  event.dataTransfer?.setData("text/uri-list", `file://${item.absolutePath}`);
}

async function handleDropUpload(event: DragEvent): Promise<void> {
  const candidates = await collectUploadCandidatesFromDataTransfer(event.dataTransfer);
  if (!candidates.length) return;
  await uploadFileCandidates(candidates);
}

async function handleUploadInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await uploadFileList(Array.from(input.files || []));
  input.value = "";
}

async function handleUploadDirectoryInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  await uploadFileList(Array.from(input.files || []), true);
  input.value = "";
}

async function handleWorkbenchPaste(event: ClipboardEvent): Promise<void> {
  if (isTextEditingEventTarget(event.target)) return;
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length) return;
  event.preventDefault();
  await uploadFileList(files);
}

async function uploadFileList(files: File[], preserveRelativePath = false): Promise<void> {
  if (!files.length) return;
  await uploadFileCandidates(files.map((file) => ({
    file,
    relativePath: preserveRelativePath
      ? ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
      : undefined,
  })));
}

async function uploadFileCandidates(candidates: UploadFileCandidate[]): Promise<void> {
  if (!candidates.length) return;
  const oversized = candidates.find((candidate) => candidate.file.size > MAX_UPLOAD_FILE_BYTES);
  if (oversized) {
    setNotice(
      "error",
      text(
        `${oversized.file.name} 超过 ${formatFileSize(MAX_UPLOAD_FILE_BYTES)}，请使用终端或分批上传。`,
        `${oversized.file.name} exceeds ${formatFileSize(MAX_UPLOAD_FILE_BYTES)}. Use terminal upload or split the batch.`,
      ),
    );
    return;
  }
  const batchSize = candidates.reduce((total, candidate) => total + candidate.file.size, 0);
  if (batchSize > MAX_UPLOAD_BATCH_BYTES) {
    setNotice(
      "error",
      text(
        `本次上传约 ${formatFileSize(batchSize)}，请分批上传。`,
        `This upload is about ${formatFileSize(batchSize)}. Split it into smaller batches.`,
      ),
    );
    return;
  }
  try {
    const payloadFiles = [];
    for (const candidate of candidates) {
      payloadFiles.push({
        fileName: candidate.file.name,
        relativePath: candidate.relativePath,
        dataBase64: await readFileAsDataUrl(candidate.file),
      });
    }
    await uploadFiles({
      rootId: activeRootId.value,
      directoryPath: activeDirectoryPath.value,
      files: payloadFiles,
    });
    setNotice(
      "success",
      candidates.length > 1 ? text(`已上传 ${candidates.length} 个文件`, `Uploaded ${candidates.length} files`) : text("文件已上传", "File uploaded"),
    );
    refreshCurrentDirectory();
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("上传失败", "Upload failed"));
  }
}

async function collectUploadCandidatesFromDataTransfer(
  dataTransfer: DataTransfer | null,
): Promise<UploadFileCandidate[]> {
  if (!dataTransfer) return [];
  const items = Array.from(dataTransfer.items || []);
  const candidates: UploadFileCandidate[] = [];
  for (const item of items) {
    if (item.kind !== "file") continue;
    const entry = (item as DataTransferItem & {
      webkitGetAsEntry?: () => BrowserFileSystemEntry | null;
    }).webkitGetAsEntry?.();
    if (entry) {
      candidates.push(...await collectUploadCandidatesFromEntry(entry));
      continue;
    }
    const file = item.getAsFile();
    if (file) candidates.push({ file });
  }
  if (candidates.length) return candidates;
  return Array.from(dataTransfer.files || []).map((file) => ({ file }));
}

async function collectUploadCandidatesFromEntry(
  entry: BrowserFileSystemEntry,
  basePath = "",
): Promise<UploadFileCandidate[]> {
  const safeName = normalizePortableFilePath(entry.name || "").replace(/^\/+|\/+$/g, "");
  const relativePath = [basePath, safeName].filter(Boolean).join("/");
  if (entry.isFile) {
    const file = await readBrowserFileEntry(entry as BrowserFileSystemFileEntry);
    return file ? [{ file, relativePath: relativePath || file.name }] : [];
  }
  if (!entry.isDirectory) return [];
  const children = await readBrowserDirectoryEntries(entry as BrowserFileSystemDirectoryEntry);
  const nested: UploadFileCandidate[] = [];
  for (const child of children) {
    nested.push(...await collectUploadCandidatesFromEntry(child, relativePath));
  }
  return nested;
}

function readBrowserFileEntry(entry: BrowserFileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

function readBrowserDirectoryEntries(
  entry: BrowserFileSystemDirectoryEntry,
): Promise<BrowserFileSystemEntry[]> {
  const reader = entry.createReader();
  const entries: BrowserFileSystemEntry[] = [];
  return new Promise((resolve) => {
    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        () => resolve(entries),
      );
    };
    readBatch();
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error || new Error("Failed to read upload file"));
    reader.readAsDataURL(file);
  });
}

function createEditorTabId(rootId: string, apiPath: string): string {
  return `${rootId}:${apiPath}`;
}

function recordRecentEditorFile(input: Omit<RecentEditorFile, "id" | "openedAt">): void {
  const id = createEditorTabId(input.rootId, input.apiPath);
  const nextItem: RecentEditorFile = {
    ...input,
    id,
    openedAt: new Date().toISOString(),
  };
  recentEditorFiles.value = [
    nextItem,
    ...recentEditorFiles.value.filter((item) => item.id !== id),
  ].slice(0, 12);
  persistRecentEditorFiles(recentEditorFiles.value);
}

async function openRecentEditorFile(item: RecentEditorFile): Promise<void> {
  await openEditorForPath(item.rootId, item.apiPath, item.path, item.name);
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

async function openEditorForItem(item: NativeFileItem): Promise<void> {
  if (!isCodeEditableItem(item)) return;
  await openEditorForPath(item.rootId, item.path, item.absolutePath, item.name);
}

async function openEditorForPath(rootId: string, apiPath: string, displayPath: string, fallbackName: string): Promise<void> {
  const tabId = createEditorTabId(rootId, apiPath);
  const existingTab = editorTabs.value.find((tab) => tab.id === tabId);
  if (existingTab) {
    activeEditorId.value = existingTab.id;
    recordRecentEditorFile({
      rootId,
      apiPath,
      path: displayPath,
      name: existingTab.name || fallbackName,
    });
    return;
  }

  editorTabs.value.push({
    id: tabId,
    rootId,
    apiPath,
    path: displayPath,
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
      path: displayPath,
      name: payload.name,
      readOnly: !payload.editable,
      truncated: payload.truncated,
      content: payload.content || "",
      draft: payload.content || "",
      error: null,
      loading: false,
    });
    recordRecentEditorFile({
      rootId,
      apiPath: payload.path,
      path: displayPath,
      name: payload.name,
    });
  } catch (error) {
    updateEditorTab(tabId, {
      error: error instanceof Error ? error.message : text("加载文件失败", "Failed to load file"),
      loading: false,
    });
  }
}

function isEditorTabDirty(tab: EditorFileTab): boolean {
  return tab.content !== null && tab.draft !== tab.content;
}

function confirmDiscardEditorChanges(tabs: EditorFileTab[]): boolean {
  const dirtyCount = tabs.filter(isEditorTabDirty).length;
  if (!dirtyCount) return true;
  return window.confirm(
    text(
      `有 ${dirtyCount} 个文件存在未保存修改，关闭后会丢失这些修改。继续关闭？`,
      `${dirtyCount} file(s) have unsaved changes. Closing will discard them. Continue?`,
    ),
  );
}

function closeEditor(tabId?: string): void {
  const targetTabs = tabId
    ? editorTabs.value.filter((tab) => tab.id === tabId)
    : [...editorTabs.value];
  if (!targetTabs.length) return;
  if (!confirmDiscardEditorChanges(targetTabs)) return;
  for (const tab of targetTabs) {
    const index = editorTabs.value.findIndex((candidate) => candidate.id === tab.id);
    if (index === -1) continue;
    const wasActive = activeEditorId.value === tab.id;
    editorTabs.value.splice(index, 1);
    if (wasActive) {
      const nextTab = editorTabs.value[index] || editorTabs.value[index - 1] || null;
      activeEditorId.value = nextTab?.id || "";
    }
  }
  if (!editorTabs.value.length) {
    activeEditorId.value = "";
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
    refreshCurrentDirectory();
  } catch (error) {
    setNotice("error", error instanceof Error ? error.message : text("保存文件失败", "Failed to save file"));
  } finally {
    updateEditorTab(tab.id, { saving: false });
  }
}

function downloadEditorFile(): void {
  if (!editorDownloadUrl.value || !editorState.value.name) return;
  triggerBrowserDownload(editorDownloadUrl.value, editorState.value.name);
}

function openTerminalHere(item?: NativeFileItem | null): void {
  const cwd = item
    ? item.kind === "directory"
      ? item.absolutePath
      : buildAbsolutePath(rootForId(item.rootId), item.directoryPath)
    : currentAbsolutePath.value;
  if (!cwd) return;
  const sessionId = globalThis.crypto?.randomUUID?.() || `files-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  const title = `${item?.name || activeDirectoryPath.value.split("/").pop() || rootLabel(activeRoot.value)} · ${text("终端", "Shell")}`;
  const descriptor = {
    sessionId,
    title,
    profileId: null,
    targetKind: "local",
    cwd,
    pinned: false,
    status: "running",
    source: "manual",
    canResume: true,
    controlState: "controller",
    updatedAt: now,
    handoffContext: null,
    recentOutputSummary: null,
  };
  try {
    const raw = globalThis.localStorage?.getItem(TERMINAL_DESCRIPTORS_STORAGE_KEY);
    const descriptors = raw ? JSON.parse(raw) as unknown[] : [];
    const nextDescriptors = Array.isArray(descriptors)
      ? [descriptor, ...descriptors.filter((entry) => (entry as { sessionId?: unknown })?.sessionId !== sessionId)]
      : [descriptor];
    globalThis.localStorage?.setItem(TERMINAL_DESCRIPTORS_STORAGE_KEY, JSON.stringify(nextDescriptors));
    globalThis.localStorage?.setItem(TERMINAL_WORKSPACE_STORAGE_KEY, JSON.stringify({
      tabOrder: [sessionId, ...nextDescriptors.map((entry) => String((entry as { sessionId?: unknown }).sessionId || "")).filter((id) => id && id !== sessionId)].slice(0, 24),
      activeSessionId: sessionId,
      activeProfileId: null,
      paneSessionIds: [sessionId],
      paneLayout: "single",
    }));
    const pendingRaw = globalThis.sessionStorage?.getItem(TERMINAL_PENDING_LAUNCH_STORAGE_KEY);
    const pending = pendingRaw ? JSON.parse(pendingRaw) as Record<string, unknown> : {};
    pending[sessionId] = { profileId: null, targetKind: "local", cwd };
    globalThis.sessionStorage?.setItem(TERMINAL_PENDING_LAUNCH_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // Terminal storage bridge is best-effort; navigation still opens the terminal page.
  }
  void router.push({ path: `/terminal/${encodeURIComponent(sessionId)}` });
}

function handleWorkbenchKeydown(event: KeyboardEvent): void {
  if (isTextEditingEventTarget(event.target)) return;
  const key = event.key.toLowerCase();
  if (event.key === "F2" && selectedItems.value.length === 1) {
    event.preventDefault();
    openOperationDialog("rename", selectedItems.value[0]);
  } else if (event.key === "Delete" && selectedItems.value.length) {
    event.preventDefault();
    openOperationDialog("delete");
  } else if ((event.ctrlKey || event.metaKey) && key === "c" && selectedItems.value.length) {
    event.preventDefault();
    clipboardMode.value = "copy";
    clipboardItems.value = selectedItems.value;
  } else if ((event.ctrlKey || event.metaKey) && key === "x" && selectedItems.value.length) {
    event.preventDefault();
    clipboardMode.value = "cut";
    clipboardItems.value = selectedItems.value;
  } else if ((event.ctrlKey || event.metaKey) && key === "v" && clipboardItems.value.length) {
    event.preventDefault();
    void pasteClipboardItems();
  }
}

function isTextEditingEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest([
    "input",
    "textarea",
    "select",
    "[contenteditable='true']",
    "[contenteditable='']",
    ".cm-editor",
    ".cm-content",
    ".code-file-editor",
    ".studio-file-dialog",
  ].join(",")));
}

function handleGlobalClick(): void {
  closeContextMenu();
}

function handleEditorBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirtyEditorTabs.value.length) return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => {
  window.addEventListener("click", handleGlobalClick);
  window.addEventListener("beforeunload", handleEditorBeforeUnload);
  void reloadSummary();
});

onBeforeUnmount(() => {
  window.removeEventListener("click", handleGlobalClick);
  window.removeEventListener("beforeunload", handleEditorBeforeUnload);
  persistViewMode();
});
</script>
