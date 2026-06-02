<template>
  <section
    ref="explorerRef"
    class="terminal-resource-explorer"
    data-testid="terminal-resource-explorer"
    tabindex="0"
    @paste="handleClipboardPaste"
    @click="handleExplorerClick"
    @keydown="handleExplorerKeydown"
    @keydown.esc="closeResourceOverlays"
    @dragover.prevent="handleUploadDragOver"
    @drop.prevent="handleUploadDrop"
  >
    <header class="terminal-resource-explorer__head">
      <div class="terminal-resource-explorer__identity">
        <strong>{{ text('资源管理器', 'Explorer') }}</strong>
      </div>
      <div class="terminal-resource-head-actions" role="toolbar" :aria-label="text('资源操作', 'Resource actions')">
        <button
          type="button"
          class="terminal-resource-icon-button terminal-resource-head-action--new-file"
          :title="text('新建文件', 'New File')"
          :aria-label="text('新建文件', 'New File')"
          :disabled="!selectedTerminalPayload"
          @click.stop="startCreateFromSelection('file')"
        >
          <FilePlus class="terminal-resource-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="terminal-resource-icon-button terminal-resource-head-action--new-folder"
          :title="text('新建文件夹', 'New Folder')"
          :aria-label="text('新建文件夹', 'New Folder')"
          :disabled="!selectedTerminalPayload"
          @click.stop="startCreateFromSelection('directory')"
        >
          <FolderPlus class="terminal-resource-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="terminal-resource-icon-button terminal-resource-head-action--filter"
          :title="text('快速过滤 (Ctrl F)', 'Quick Filter (Ctrl F)')"
          :aria-label="text('快速过滤', 'Quick Filter')"
          @click.stop="openResourceFilter()"
        >
          <Search class="terminal-resource-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="terminal-resource-icon-button"
          :title="text('刷新资源', 'Refresh resources')"
          :aria-label="text('刷新资源', 'Refresh resources')"
          :disabled="loading"
          @click="refreshTree"
        >
          <RefreshCw class="terminal-resource-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="terminal-resource-icon-button terminal-resource-head-action--collapse-all"
          :title="text('折叠所有文件夹', 'Collapse all folders')"
          :aria-label="text('折叠所有文件夹', 'Collapse all folders')"
          :disabled="!hasExpandedDirectories"
          @click.stop="collapseAllDirectories"
        >
          <ListCollapse class="terminal-resource-icon" aria-hidden="true" />
        </button>
        <details
          ref="resourceHeadMoreRef"
          class="terminal-resource-head-more"
          :open="resourceHeadMoreOpen"
          @toggle="syncResourceHeadMoreState"
          @keydown.esc.stop.prevent="closeResourceHeadMore"
        >
          <summary
            class="terminal-resource-icon-button terminal-resource-head-more__summary"
            :aria-label="text('更多资源操作', 'More resource actions')"
            :aria-expanded="resourceHeadMoreOpen"
            @click.prevent.stop="toggleResourceHeadMore"
          >
            <MoreHorizontal class="terminal-resource-icon" aria-hidden="true" />
          </summary>
          <div class="terminal-resource-head-more__panel" role="menu" @click.stop>
            <label class="terminal-resource-head-more__section terminal-resource-root-switcher" role="none">
              <span>{{ text('根目录', 'Root') }}</span>
              <select v-model="rootId" :disabled="loading || roots.length <= 1">
                <option v-for="root in roots" :key="root.id" :value="root.id">
                  {{ text(root.labelZh, root.labelEn) }}
                </option>
              </select>
            </label>
            <button
              type="button"
              role="menuitem"
              :disabled="!selectedTerminalPayload"
              @click="openSelectedInTerminalFromMenu"
            >
              <Terminal class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('在终端中打开', 'Open in terminal') }}
              <kbd class="terminal-resource-context-menu__shortcut">Ctrl Enter</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="uploading || !rootId"
              @click="uploadFilesFromMenu"
            >
              <Upload class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('上传文件', 'Upload Files') }}
              <kbd class="terminal-resource-context-menu__shortcut">Ctrl Alt U</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="uploading || !rootId"
              @click="uploadDirectoryFromMenu"
            >
              <Upload class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('上传文件夹', 'Upload Folder') }}
              <kbd class="terminal-resource-context-menu__shortcut">Ctrl Alt Shift U</kbd>
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="!selectedAbsolutePaths.length"
              @click="insertSelectedPathsFromMenu"
            >
              <Terminal class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('插入路径到终端', 'Insert path in terminal') }}
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="!selectedTerminalPayload || isDefaultDirectoryPayload(selectedTerminalPayload)"
              @click="saveDefaultDirectoryFromMenu"
            >
              <FolderOpen class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{
                selectedTerminalPayload && isDefaultDirectoryPayload(selectedTerminalPayload)
                  ? isMainWorkspaceScope
                    ? text('已是主默认目录', 'Main default directory')
                    : text('已是本组默认目录', 'Group default directory')
                  : isMainWorkspaceScope
                    ? text('设为主默认目录', 'Set as main default directory')
                    : text('设为本组默认目录', 'Set as group default directory')
              }}
            </button>
            <button
              v-if="!isMainWorkspaceScope"
              type="button"
              role="menuitem"
              :disabled="!hasScopedDefaultDirectory"
              @click="followMainDefaultDirectoryFromMenu"
            >
              <Link2 class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('跟随主目录', 'Follow main directory') }}
            </button>
            <button
              type="button"
              role="menuitem"
              :disabled="!selectedAbsolutePaths.length"
              @click="copySelectedPathFromMenu"
            >
              <Copy class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ copied ? text('已复制路径', 'Copied path') : text('复制路径', 'Copy path') }}
              <kbd class="terminal-resource-context-menu__shortcut">Shift Alt C</kbd>
            </button>
            <label class="terminal-resource-head-more__item" role="menuitemcheckbox" :aria-checked="showHidden">
              <input v-model="showHidden" class="sr-only" type="checkbox" />
              <Eye v-if="showHidden" class="terminal-resource-context-menu__icon" aria-hidden="true" />
              <EyeOff v-else class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('显示隐藏项', 'Show hidden files') }}
            </label>
            <button
              type="button"
              role="menuitem"
              class="terminal-resource-head-more__item--collapse-sidebar"
              @click="collapseResourceExplorerFromMenu"
            >
              <PanelLeftClose class="terminal-resource-context-menu__icon" aria-hidden="true" />
              {{ text('收起资源管理器', 'Collapse explorer') }}
            </button>
          </div>
        </details>
      </div>
    </header>
    <span class="sr-only" aria-live="polite">{{ uploadFeedback }}</span>

    <div
      v-if="resourceFilterOpen"
      class="terminal-resource-filter"
      role="search"
      @click.stop
    >
      <Search class="terminal-resource-filter__icon" aria-hidden="true" />
      <input
        ref="resourceFilterInput"
        v-model="resourceFilterQuery"
        type="search"
        :placeholder="text('搜索文件和文件夹', 'Search files and folders')"
        :aria-label="text('搜索资源树', 'Search resource tree')"
        @keydown="handleResourceFilterKeydown"
      />
      <button
        type="button"
        class="terminal-resource-filter__clear"
        :aria-label="text('关闭过滤', 'Close filter')"
        @click="closeResourceFilter"
      >
        <X class="terminal-resource-filter__clear-icon" aria-hidden="true" />
      </button>
    </div>

    <input
      ref="uploadInput"
      class="sr-only"
      type="file"
      multiple
      @change="handleUploadInput"
    />
    <input
      ref="uploadDirectoryInput"
      class="sr-only"
      type="file"
      multiple
      webkitdirectory
      directory
      @change="handleUploadInput"
    />

    <div v-if="loading" class="terminal-resource-state">
      {{ text('正在读取目录…', 'Loading directory...') }}
    </div>
    <div v-else-if="errorMessage" class="terminal-resource-state terminal-resource-state--error">
      {{ errorMessage }}
    </div>
    <div ref="treeRef" v-else class="terminal-resource-tree" role="tree" :aria-label="text('文件树', 'File tree')">
      <div
        class="terminal-resource-tree-root"
        :class="{
          'terminal-resource-row--selected': isWorkspaceRootSelected,
          'terminal-resource-row--default': isDefaultDirectoryPath(workspaceRootPath),
        }"
        role="treeitem"
        aria-expanded="true"
        :aria-current="isDefaultDirectoryPath(workspaceRootPath) ? 'location' : undefined"
        :data-resource-path="workspaceRootPath"
        draggable="true"
        @click="selectRootFromPointer"
        @contextmenu.prevent="openRootContextMenu"
        @pointerdown="startResourceLongPress($event, workspaceRootPath)"
        @dragover.prevent="handleResourceDragOver"
        @dragstart="handleRootDragStart"
        @drop.stop.prevent="handleResourceDrop($event, null)"
      >
        <ChevronDown class="terminal-resource-chevron" aria-hidden="true" />
        <FolderOpen class="terminal-resource-row__icon" aria-hidden="true" />
        <span class="terminal-resource-row__copy" :title="rootDirectory?.absolutePath || activeRoot?.absolutePath || activeRootLabel">
          <span class="terminal-resource-row__name">{{ activeRootPathLabel }}</span>
          <span v-if="isDefaultDirectoryPath(workspaceRootPath)" class="terminal-resource-row__default-marker">
            {{ text('默认', 'Default') }}
          </span>
        </span>
      </div>

      <div v-if="!visibleRows.length" class="terminal-resource-state terminal-resource-state--compact">
        {{
          resourceSearchBusy
            ? text('正在搜索…', 'Searching...')
            : resourceSearchError || (resourceFilterActive ? text('没有匹配项', 'No matching files') : text('目录为空', 'Directory is empty'))
        }}
      </div>

      <div
        v-for="row in visibleRows"
        :key="row.entry.path"
        class="terminal-resource-row"
        :class="{
          'terminal-resource-row--selected': isPathSelected(row.entry.path),
          'terminal-resource-row--default': isDefaultDirectoryPath(row.entry.path),
        }"
        :style="{ '--terminal-resource-level': String(row.level) }"
        :data-resource-path="row.entry.path"
        role="treeitem"
        :aria-expanded="row.entry.kind === 'directory' ? row.expanded : undefined"
        :aria-current="isDefaultDirectoryPath(row.entry.path) ? 'location' : undefined"
        draggable="true"
        @click="selectEntryFromPointer($event, row.entry)"
        @dblclick="openResourceEntry(row.entry)"
        @contextmenu.prevent="openEntryContextMenu($event, row.entry)"
        @pointerdown="startResourceLongPress($event, row.entry.path)"
        @dragover.prevent="handleResourceDragOver"
        @dragstart="handleEntryDragStart($event, row.entry)"
        @drop.stop.prevent="handleResourceDrop($event, row.entry)"
      >
        <button
          type="button"
          class="terminal-resource-row__toggle"
          :disabled="row.entry.kind !== 'directory'"
          :aria-label="row.expanded ? text('折叠文件夹', 'Collapse folder') : text('展开文件夹', 'Expand folder')"
          @click.stop="toggleDirectory(row.entry)"
        >
          <ChevronDown v-if="row.entry.kind === 'directory' && row.expanded" class="terminal-resource-chevron" aria-hidden="true" />
          <ChevronRight v-else-if="row.entry.kind === 'directory'" class="terminal-resource-chevron" aria-hidden="true" />
          <span v-else class="terminal-resource-spacer" aria-hidden="true"></span>
        </button>
        <FolderOpen v-if="row.entry.kind === 'directory' && row.expanded" class="terminal-resource-row__icon terminal-resource-row__icon--folder-open" aria-hidden="true" />
        <Folder v-else-if="row.entry.kind === 'directory'" class="terminal-resource-row__icon terminal-resource-row__icon--folder" aria-hidden="true" />
        <component
          :is="resolveResourceFileIcon(row.entry)"
          v-else
          class="terminal-resource-row__icon"
          :class="resolveResourceFileIconClass(row.entry)"
          aria-hidden="true"
        />
        <span class="terminal-resource-row__copy" :title="resolveAbsolutePath(row.entry.path)">
          <input
            v-if="isInlineRenaming(row.entry)"
            :ref="setOperationInputRef"
            v-model="operationName"
            class="terminal-resource-rename-input"
            type="text"
            autocomplete="off"
            :aria-label="text('重命名', 'Rename')"
            :disabled="operationBusy"
            @click.stop
            @dblclick.stop
            @blur="commitInlineRename"
            @keydown.enter.prevent="commitInlineRename"
            @keydown.escape.stop.prevent="cancelResourceOperation"
          />
          <span v-else class="terminal-resource-row__name">{{ row.entry.name }}</span>
          <span v-if="isDefaultDirectoryPath(row.entry.path)" class="terminal-resource-row__default-marker">
            {{ text('默认', 'Default') }}
          </span>
          <span v-if="resourceFilterActive && parentPathOf(row.entry.path)" class="terminal-resource-row__path">
            {{ parentPathOf(row.entry.path) }}
          </span>
          <span v-if="isInlineRenaming(row.entry) && operationError" class="terminal-resource-row__status terminal-resource-row__status--error" :title="operationError">
            {{ operationError }}
          </span>
          <span v-else-if="row.loading" class="terminal-resource-row__status">
            {{ text('读取中', 'Loading') }}
          </span>
        </span>
      </div>
    </div>

    <div
      v-if="contextMenu"
      class="terminal-resource-context-menu"
      role="menu"
      :style="contextMenuStyle"
      @click.stop
      @contextmenu.prevent
    >
      <form
        v-if="pendingOperation && pendingOperation.kind !== 'rename'"
        class="terminal-resource-context-menu__form"
        @submit.prevent="commitResourceOperation"
      >
        <strong>{{ pendingOperationTitle }}</strong>
        <span v-if="pendingOperation.kind === 'delete'">
          {{ deleteOperationLabel }}
        </span>
        <label v-else>
          <span>{{ text('名称', 'Name') }}</span>
          <input
            :ref="setOperationInputRef"
            v-model="operationName"
            type="text"
            autocomplete="off"
            :disabled="operationBusy"
            @keydown.escape.prevent="cancelResourceOperation"
          />
        </label>
        <p v-if="operationError">{{ operationError }}</p>
        <div class="terminal-resource-context-menu__form-actions">
          <button type="submit" :disabled="operationBusy || (pendingOperation.kind !== 'delete' && !operationName.trim())">
            <Check class="terminal-resource-context-menu__icon" aria-hidden="true" />
            {{ operationBusy ? text('处理中', 'Working') : text('确认', 'Confirm') }}
          </button>
          <button type="button" :disabled="operationBusy" @click="cancelResourceOperation">
            <X class="terminal-resource-context-menu__icon" aria-hidden="true" />
            {{ text('取消', 'Cancel') }}
          </button>
        </div>
      </form>
      <template v-else>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload" @click="openContextInTerminal">
          <Terminal class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('在终端中打开', 'Open in Terminal') }}
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuPathPayloads.length" @click="insertContextPathsInTerminal">
          <Terminal class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('插入路径到终端', 'Insert Path in Terminal') }}
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuFilePayload" @click="previewContextFile">
          <FileText class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('预览文件', 'Preview File') }}
        </button>
        <a
          v-if="contextMenuDownloadUrl"
          class="terminal-resource-context-menu__item"
          role="menuitem"
          :href="contextMenuDownloadUrl"
          :download="contextMenuDownloadName"
          @click="closeContextMenu"
        >
          <Download class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('下载', 'Download') }}
        </a>
        <span class="terminal-resource-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload" @click="startContextCreate('file')">
          <FilePlus class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('新建文件', 'New File') }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl Alt N</kbd>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload" @click="startContextCreate('directory')">
          <FolderPlus class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('新建文件夹', 'New Folder') }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl Alt Shift N</kbd>
        </button>
        <button type="button" role="menuitem" :disabled="contextMenuSelectionPayloads.length !== 1" @click="startContextRename">
          <Pencil class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('重命名', 'Rename') }}
          <kbd class="terminal-resource-context-menu__shortcut">F2</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          class="terminal-resource-context-menu__danger"
          :disabled="!contextMenuSelectionPayloads.length"
          @click="startContextDelete"
        >
          <Trash2 class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('删除', 'Delete') }}
          <kbd class="terminal-resource-context-menu__shortcut">Del</kbd>
        </button>
        <span class="terminal-resource-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" :disabled="!contextMenuSelectionPayloads.length" @click="copyContextResource">
          <Copy class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ copyContextResourceLabel }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl C</kbd>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuSelectionPayloads.length" @click="cutContextResource">
          <Scissors class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ cutContextResourceLabel }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl X</kbd>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload || !resourceClipboard" @click="pasteContextResource">
          <ClipboardPaste class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ resourceClipboardLabel }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl V</kbd>
        </button>
        <span class="terminal-resource-context-menu__divider" aria-hidden="true"></span>
        <button type="button" role="menuitem" :disabled="!contextMenuPayload" @click="copyContextPath">
          <Copy class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('复制路径', 'Copy Path') }}
          <kbd class="terminal-resource-context-menu__shortcut">Shift Alt C</kbd>
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuPayload" @click="copyContextRelativePath">
          <Copy class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('复制相对路径', 'Copy Relative Path') }}
          <kbd class="terminal-resource-context-menu__shortcut">Ctrl Shift C</kbd>
        </button>
        <button
          type="button"
          role="menuitem"
          :disabled="!contextMenuTerminalPayload || isDefaultDirectoryPayload(contextMenuTerminalPayload)"
          @click="setContextDefaultDirectory"
        >
          <FolderOpen class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{
            contextMenuTerminalPayload && isDefaultDirectoryPayload(contextMenuTerminalPayload)
              ? isMainWorkspaceScope
                ? text('已是主默认目录', 'Main default directory')
                : text('已是本组默认目录', 'Group default directory')
              : isMainWorkspaceScope
                ? text('设为主默认目录', 'Set as Main Default')
                : text('设为本组默认目录', 'Set as Group Default')
          }}
        </button>
        <button
          v-if="!isMainWorkspaceScope"
          type="button"
          role="menuitem"
          :disabled="!hasScopedDefaultDirectory"
          @click="followMainDefaultDirectoryFromContext"
        >
          <Link2 class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('跟随主目录', 'Follow Main Directory') }}
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload || uploading" @click="uploadToContextDirectory">
          <Upload class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('上传到此处', 'Upload Here') }}
        </button>
        <button type="button" role="menuitem" :disabled="!contextMenuTerminalPayload || uploading" @click="uploadDirectoryToContextDirectory">
          <Upload class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('上传文件夹到此处', 'Upload Folder Here') }}
        </button>
        <button type="button" role="menuitem" @click="refreshTreeFromContext">
          <RefreshCw class="terminal-resource-context-menu__icon" aria-hidden="true" />
          {{ text('刷新', 'Refresh') }}
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Database,
  Download,
  Eye,
  EyeOff,
  FileArchive,
  FileAudio,
  FileBadge,
  FileBox,
  FileChartColumn,
  FileCode2,
  FileCog,
  FileKey2,
  FileLock2,
  FileQuestion,
  FileScan,
  FileSpreadsheet,
  FileType2,
  FileImage,
  FileJson,
  FilePlus,
  FileTerminal,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  Link2,
  ListCollapse,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  RefreshCw,
  Scissors,
  Search,
  Terminal,
  Trash2,
  Upload,
  X,
} from '@lucide/vue';
import type {
  FileEntrySummary,
  FileRootSummary,
  FileSearchResult,
  FilesDirectoryPayload,
  FilesUploadItemPayload,
} from '../../../../../types/files';
import { copyTextToClipboard } from '../../shared/clipboard';
import { useLocalePreference } from '../../shared/locale';
import {
  buildArchiveDownloadUrl,
  buildFileDownloadUrl,
  browseDirectory,
  copyPath,
  createDirectory,
  createFile,
  deletePaths,
  fetchFilesSummary,
  movePath,
  renamePath,
  searchFiles,
  uploadFiles,
} from '../files/api';
import {
  TERMINAL_RESOURCE_DRAG_MIME,
  getTerminalResourceDirectoryAbsolutePath,
  getTerminalResourceDirectoryPath,
  parseTerminalResourceTransfer,
  serializeTerminalResourceTransfer,
  type TerminalResourceTransferPayload,
} from './terminal-resource-transfer';
import {
  RESOURCE_EXPLORER_DEFAULT_STORAGE_KEY,
  TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
  clearTerminalResourceDefaultDirectory,
  hasTerminalResourceDefaultDirectory,
  readTerminalResourceDefaultDirectory,
  writeTerminalResourceDefaultDirectory,
  type TerminalResourceDefaultDirectory,
} from './terminal-resource-default-directory';
import {
  parseTerminalResourceExplorerSnapshot,
  serializeTerminalResourceExplorerSnapshot,
  type TerminalResourceExplorerSnapshot,
} from './terminal-resource-explorer-state';
import {
  resolveTerminalFileKind,
  type TerminalFileKind,
} from './terminal-file-kind';

interface ResourceTreeRow {
  entry: FileEntrySummary;
  level: number;
  expanded: boolean;
  loading: boolean;
}

interface ResourceNavigationItem {
  path: string;
  entry: FileEntrySummary | null;
}

type ResourceOperationKind = 'create-file' | 'create-directory' | 'rename' | 'delete';
type ResourceFileIconKind = TerminalFileKind;

interface ResourceOperationState {
  kind: ResourceOperationKind;
  directoryPath: string;
  directoryPaths?: string[];
  targetPath: string;
  targetPaths?: string[];
  targetName: string;
}

interface ResourceClipboardState {
  mode: 'copy' | 'cut';
  payloads: TerminalResourceTransferPayload[];
}

interface WorkspaceDirectoryTarget {
  rootId: string;
  path: string;
  kind?: TerminalResourceTransferPayload['kind'];
}

interface UploadFileCandidate {
  file: File;
  relativePath: string;
}

interface ResourceLongPressState {
  pointerId: number;
  path: string;
  startX: number;
  startY: number;
  clientX: number;
  clientY: number;
  timer: ReturnType<typeof setTimeout>;
}

interface ResourceContextMenuPoint {
  clientX: number;
  clientY: number;
}

interface WebkitFileSystemEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
}

interface WebkitFileSystemFileEntry extends WebkitFileSystemEntry {
  isFile: true;
  file(
    successCallback: (file: File) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface WebkitFileSystemDirectoryReader {
  readEntries(
    successCallback: (entries: WebkitFileSystemEntry[]) => void,
    errorCallback?: (error: DOMException) => void,
  ): void;
}

interface WebkitFileSystemDirectoryEntry extends WebkitFileSystemEntry {
  isDirectory: true;
  createReader(): WebkitFileSystemDirectoryReader;
}

type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => WebkitFileSystemEntry | null;
};

const props = withDefaults(defineProps<{
  workspaceScopeId?: string;
  workspaceFallbackCwd?: string | null;
}>(), {
  workspaceScopeId: TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
  workspaceFallbackCwd: null,
});

const emit = defineEmits<{
  (e: 'openTerminal', payload: TerminalResourceTransferPayload): void;
  (e: 'previewFile', payload: TerminalResourceTransferPayload): void;
  (e: 'insertTerminalPaths', paths: string[]): void;
  (e: 'collapse'): void;
}>();

const RESOURCE_EXPLORER_STATE_STORAGE_KEY =
  'openclaw-studio.terminal.resourceExplorer.state';

const { text } = useLocalePreference();
const roots = ref<FileRootSummary[]>([]);
const rootId = ref('');
const rootDirectory = ref<FilesDirectoryPayload | null>(null);
const workspaceRootPath = ref('');
const childrenByPath = ref<Record<string, FileEntrySummary[]>>({});
const expandedPaths = ref<Record<string, boolean>>({ '': true });
const loadingPaths = ref<Record<string, boolean>>({});
const defaultDirectory = ref<TerminalResourceDefaultDirectory | null>(null);
const defaultDirectoryRevision = ref(0);
const selectedPath = ref<string>('');
const selectedPaths = ref<string[]>([]);
const loading = ref(false);
const uploading = ref(false);
const errorMessage = ref('');
const showHidden = ref(true);
const copied = ref(false);
const explorerRef = ref<HTMLElement | null>(null);
const treeRef = ref<HTMLElement | null>(null);
const uploadInput = ref<HTMLInputElement | null>(null);
const uploadDirectoryInput = ref<HTMLInputElement | null>(null);
const resourceHeadMoreRef = ref<HTMLDetailsElement | null>(null);
const resourceHeadMoreOpen = ref(false);
const resourceFilterInput = ref<HTMLInputElement | null>(null);
const resourceFilterOpen = ref(false);
const resourceFilterQuery = ref('');
const resourceSearchResults = ref<FileSearchResult[]>([]);
const resourceSearchBusy = ref(false);
const resourceSearchError = ref('');
const operationInput = ref<HTMLInputElement | null>(null);
const uploadFeedback = ref('');
const focusedResourcePayload = ref<TerminalResourceTransferPayload | null>(null);
const resourceTreeDataRevision = ref(0);
const resourceTreeExpansionRevision = ref(0);
const resourceTreeLoadingRevision = ref(0);
const contextMenu = ref<{
  path: string;
  left: number;
  top: number;
} | null>(null);
const RESOURCE_CONTEXT_MENU_WIDTH = 272;
const RESOURCE_CONTEXT_MENU_HEIGHT = 460;
const RESOURCE_LONG_PRESS_DELAY_MS = 520;
const RESOURCE_LONG_PRESS_MOVE_TOLERANCE = 12;
const pendingOperation = ref<ResourceOperationState | null>(null);
const operationName = ref('');
const operationBusy = ref(false);
const operationError = ref('');
const resourceClipboard = ref<ResourceClipboardState | null>(null);
const transferBusy = ref(false);
let rootLoadSeq = 0;
let suppressRootWatcher = false;
let copiedTimer: ReturnType<typeof setTimeout> | null = null;
let resourceSearchTimer: ReturnType<typeof setTimeout> | null = null;
let resourceSearchSeq = 0;
let workspaceDirectorySyncSeq = 0;
let resourceLongPress: ResourceLongPressState | null = null;
let suppressNextResourceClick = false;
let visibleRowsCacheKey = '';
let visibleRowsCache: ResourceTreeRow[] = [];

const activeRoot = computed(() =>
  roots.value.find((root) => root.id === rootId.value) || null,
);
const workspaceDefaultScopeId = computed(() => normalizeWorkspaceScopeId(props.workspaceScopeId));
const workspaceFallbackCwd = computed(() => String(props.workspaceFallbackCwd || '').trim());
const isMainWorkspaceScope = computed(() =>
  workspaceDefaultScopeId.value === TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
);
const hasScopedDefaultDirectory = computed(() => {
  defaultDirectoryRevision.value;
  return (
    !isMainWorkspaceScope.value &&
    hasTerminalResourceDefaultDirectory(globalThis.localStorage, workspaceDefaultScopeId.value)
  );
});
const activeRootLabel = computed(() => {
  const root = activeRoot.value;
  return root ? text(root.labelZh, root.labelEn) : text('未连接', 'Not connected');
});
const activeRootPathLabel = computed(() =>
  rootDirectory.value?.absolutePath.split(/[\\/]/).filter(Boolean).pop() ||
  activeRoot.value?.absolutePath.split(/[\\/]/).filter(Boolean).pop() ||
  activeRootLabel.value,
);
const resourceFilterNeedle = computed(() => normalizeResourceFilter(resourceFilterQuery.value));
const resourceFilterActive = computed(() => Boolean(resourceFilterNeedle.value));
const resourceSearchRows = computed<ResourceTreeRow[]>(() =>
  resourceSearchResults.value.map((entry) => ({
    entry,
    level: Math.min(3, Math.max(0, relativeWorkspacePath(entry.path).split('/').filter(Boolean).length - 1)),
    expanded: entry.kind === 'directory',
    loading: Boolean(loadingPaths.value[entry.path]),
  })),
);
const visibleRows = computed<ResourceTreeRow[]>(() => resolveVisibleRows());
const isWorkspaceRootSelected = computed(() =>
  normalizePath(selectedPath.value) === workspaceRootPath.value && selectedPaths.value.length === 0,
);
const hasExpandedDirectories = computed(() =>
  Object.entries(expandedPaths.value).some(([path, expanded]) => Boolean(path && !isWorkspaceRootPath(path) && expanded)),
);
const primarySelectedPath = computed(() => {
  const focusedPath = normalizePath(selectedPath.value);
  if (focusedPath && selectedPaths.value.includes(focusedPath)) {
    return focusedPath;
  }
  return selectedPaths.value[selectedPaths.value.length - 1] || focusedPath;
});
const selectedEntry = computed(() => {
  const path = primarySelectedPath.value;
  if (!path) return null;
  return findEntryByPath(path);
});
const selectedEntries = computed(() =>
  selectedPaths.value.map((path) => findEntryByPath(path)).filter((entry): entry is FileEntrySummary => Boolean(entry)),
);
const selectedResourcePayloads = computed(() =>
  selectedEntries.value.map((entry) => buildEntryPayload(entry)),
);
const selectedPayload = computed<TerminalResourceTransferPayload | null>(() => {
  const path = primarySelectedPath.value;
  if (!path) {
    return buildRootPayload();
  }
  if (selectedEntry.value) {
    return buildEntryPayload(selectedEntry.value);
  }
  return getFocusedPayloadForPath(path) || buildDirectoryPayloadFromPath(path);
});
const selectedTerminalPayload = computed<TerminalResourceTransferPayload | null>(() => {
  const payload = selectedPayload.value;
  return payload ? toTerminalDirectoryPayload(payload) : null;
});
const selectedAbsolutePaths = computed(() => {
  if (selectedResourcePayloads.value.length) {
    return selectedResourcePayloads.value.map((payload) => payload.absolutePath).filter(Boolean);
  }
  return selectedPayload.value?.absolutePath ? [selectedPayload.value.absolutePath] : [];
});
const selectedRelativePaths = computed(() => {
  if (selectedResourcePayloads.value.length) {
    return selectedResourcePayloads.value.map((payload) => payload.path).filter((path) => path !== '');
  }
  const selectedPathValue = selectedPayload.value?.path ?? '';
  return selectedPathValue ? [selectedPathValue] : [];
});
const uploadDirectoryPath = computed(() => selectedTerminalPayload.value?.path || '');
const contextMenuPayload = computed<TerminalResourceTransferPayload | null>(() => {
  if (!contextMenu.value) return null;
  if (!contextMenu.value.path || isWorkspaceRootPath(contextMenu.value.path)) {
    return buildRootPayload();
  }
  const entry = findEntryByPath(contextMenu.value.path);
  if (entry) return buildEntryPayload(entry);
  return getFocusedPayloadForPath(contextMenu.value.path) || buildDirectoryPayloadFromPath(contextMenu.value.path);
});
const contextMenuTerminalPayload = computed<TerminalResourceTransferPayload | null>(() => {
  const payload = contextMenuPayload.value;
  return payload ? toTerminalDirectoryPayload(payload) : null;
});
const contextMenuFilePayload = computed<TerminalResourceTransferPayload | null>(() => {
  const payload = contextMenuPayload.value;
  return payload?.kind === 'file' ? payload : null;
});
const contextMenuEditablePayload = computed<TerminalResourceTransferPayload | null>(() => {
  return contextMenuSelectionPayloads.value.length === 1
    ? contextMenuSelectionPayloads.value[0] || null
    : null;
});
const contextMenuSelectionPayloads = computed<TerminalResourceTransferPayload[]>(() => {
  const menuPath = contextMenu.value?.path || '';
  if (!menuPath || isWorkspaceRootPath(menuPath)) return [];
  if (isPathSelected(menuPath)) {
    return selectedResourcePayloads.value;
  }
  const payload = contextMenuPayload.value;
  return payload ? [payload] : [];
});
const contextMenuPathPayloads = computed<TerminalResourceTransferPayload[]>(() => {
  if (contextMenuSelectionPayloads.value.length) {
    return contextMenuSelectionPayloads.value;
  }
  const payload = contextMenuPayload.value;
  return payload ? [payload] : [];
});
const contextMenuDownloadPayloads = computed<TerminalResourceTransferPayload[]>(() =>
  contextMenuPathPayloads.value.filter((payload) => Boolean(payload.path)),
);
const contextMenuDownloadName = computed(() => {
  const payloads = contextMenuDownloadPayloads.value;
  if (!payloads.length) return '';
  if (payloads.length === 1 && payloads[0]?.kind === 'file') return payloads[0].name;
  const baseName = payloads.length === 1
    ? payloads[0]?.name || 'resources'
    : 'resources-download';
  return baseName.toLowerCase().endsWith('.zip') ? baseName : `${baseName}.zip`;
});
const contextMenuDownloadUrl = computed(() => {
  if (!rootId.value) return '';
  const payloads = contextMenuDownloadPayloads.value;
  if (!payloads.length) return '';
  if (payloads.length === 1 && payloads[0]?.kind === 'file') {
    return buildFileDownloadUrl(rootId.value, payloads[0].path, { download: true });
  }
  return buildArchiveDownloadUrl(
    rootId.value,
    payloads.map((payload) => payload.path),
    contextMenuDownloadName.value,
  );
});
const contextMenuStyle = computed(() => {
  if (!contextMenu.value) return {};
  return {
    left: `${contextMenu.value.left}px`,
    top: `${contextMenu.value.top}px`,
  };
});
const pendingOperationTitle = computed(() => {
  const operation = pendingOperation.value;
  if (!operation) return '';
  if (operation.kind === 'create-file') return text('新建文件', 'New File');
  if (operation.kind === 'create-directory') return text('新建文件夹', 'New Folder');
  if (operation.kind === 'rename') return text('重命名', 'Rename');
  return text('删除', 'Delete');
});
const deleteOperationLabel = computed(() => {
  const operation = pendingOperation.value;
  if (!operation || operation.kind !== 'delete') return '';
  const count = operation.targetPaths?.length || 1;
  if (count > 1) return text(`删除 ${count} 个项目？`, `Delete ${count} items?`);
  return text(`删除 ${operation.targetName}？`, `Delete ${operation.targetName}?`);
});
const copyContextResourceLabel = computed(() =>
  contextMenuSelectionPayloads.value.length > 1
    ? text(`复制 ${contextMenuSelectionPayloads.value.length} 个项目`, `Copy ${contextMenuSelectionPayloads.value.length} items`)
    : text('复制文件', 'Copy File'),
);
const cutContextResourceLabel = computed(() =>
  contextMenuSelectionPayloads.value.length > 1
    ? text(`剪切 ${contextMenuSelectionPayloads.value.length} 个项目`, `Cut ${contextMenuSelectionPayloads.value.length} items`)
    : text('剪切文件', 'Cut File'),
);
const resourceClipboardLabel = computed(() => {
  const clipboard = resourceClipboard.value;
  if (!clipboard) return text('粘贴', 'Paste');
  if (clipboard.payloads.length > 1) {
    return clipboard.mode === 'cut'
      ? text(`移动 ${clipboard.payloads.length} 个项目`, `Move ${clipboard.payloads.length} items`)
      : text(`粘贴 ${clipboard.payloads.length} 个项目`, `Paste ${clipboard.payloads.length} items`);
  }
  const payload = clipboard.payloads[0];
  if (!payload) return text('粘贴', 'Paste');
  return clipboard.mode === 'cut'
    ? text(`移动 ${payload.name}`, `Move ${payload.name}`)
    : text(`粘贴 ${payload.name}`, `Paste ${payload.name}`);
});

onMounted(() => {
  void loadRoots();
  document.addEventListener('pointerdown', closeResourceHeadMoreFromOutside, true);
  window.addEventListener('resize', closeResourceHeadMore);
});

onBeforeUnmount(() => {
  clearResourceSearch();
  cancelResourceLongPress();
  document.removeEventListener('pointerdown', closeResourceHeadMoreFromOutside, true);
  window.removeEventListener('resize', closeResourceHeadMore);
});

watch(rootId, (nextRootId, previousRootId) => {
  if (suppressRootWatcher) return;
  if (!nextRootId || !previousRootId || nextRootId === previousRootId) return;
  resetTree('');
  void loadDirectory('', { root: true });
});

watch(showHidden, () => {
  if (!rootId.value) return;
  void refreshTree();
});

watch(
  () => ({
    rootId: rootId.value,
    expandedPaths: expandedPaths.value,
    selectedPath: selectedPath.value,
    showHidden: showHidden.value,
  }),
  persistResourceExplorerSnapshot,
  { deep: true },
);

watch(resourceFilterNeedle, () => {
  scheduleResourceSearch();
});

watch(visibleRows, (rows) => {
  if (!resourceFilterActive.value || !rows.length) return;
  if (rows.some((row) => row.entry.path === selectedPath.value)) return;
  focusEntry(rows[0].entry);
});

watch(
  () => [workspaceDefaultScopeId.value, workspaceFallbackCwd.value] as const,
  () => {
    void syncWorkspaceDirectoryContext();
  },
);

async function loadRoots(): Promise<void> {
  loading.value = true;
  errorMessage.value = '';
  try {
    const summary = await fetchFilesSummary();
    roots.value = summary.roots || [];
    defaultDirectory.value = readDefaultDirectory();
    const savedState = readResourceExplorerSnapshot();
    if (savedState) {
      showHidden.value = savedState.showHidden;
    }
    const workspaceTarget = resolveWorkspaceDefaultTarget();
    const preferredRoot =
      roots.value.find((root) => root.id === workspaceTarget?.rootId) ||
      roots.value.find((root) => root.id === savedState?.rootId) ||
      roots.value.find((root) => root.preferred) ||
      roots.value.find((root) => root.id === summary.defaultRootId) ||
      roots.value[0] ||
      null;
    rootId.value = preferredRoot?.id || '';
    if (rootId.value) {
      resetTree(workspaceTarget?.rootId === rootId.value ? workspaceTarget.path : '');
      await loadDirectory(workspaceRootPath.value, { root: true });
      if (workspaceTarget?.rootId === rootId.value) {
        selectRoot();
      } else if (savedState?.rootId === rootId.value) {
        await restoreResourceExplorerSnapshot(savedState);
      }
    }
  } catch {
    errorMessage.value = text('无法读取文件资源。', 'Unable to read file resources.');
  } finally {
    loading.value = false;
  }
}

async function loadDirectory(
  path: string,
  options: { root?: boolean } = {},
): Promise<void> {
  const nextRootId = rootId.value;
  const normalizedPath = normalizePath(path);
  if (!nextRootId) return;
  const requestSeq = options.root ? ++rootLoadSeq : 0;
  if (options.root) {
    loading.value = true;
  } else {
    setPathLoading(normalizedPath, true);
  }
  errorMessage.value = '';
  try {
    const payload = await browseDirectory(nextRootId, normalizedPath, showHidden.value);
    if (options.root && requestSeq !== rootLoadSeq) return;
    if (options.root) {
      rootDirectory.value = payload;
    }
    childrenByPath.value = {
      ...childrenByPath.value,
      [normalizedPath]: sortEntries(payload.entries || []),
    };
    bumpResourceTreeDataRevision();
    expandedPaths.value = {
      ...expandedPaths.value,
      [normalizedPath]: true,
    };
    bumpResourceTreeExpansionRevision();
  } catch {
    if (options.root && requestSeq !== rootLoadSeq) return;
    if (options.root) {
      errorMessage.value = text('目录读取失败。', 'Directory read failed.');
    }
  } finally {
    if (!options.root || requestSeq === rootLoadSeq) {
      if (options.root) {
        loading.value = false;
      } else {
        setPathLoading(normalizedPath, false);
      }
    }
  }
}

async function syncWorkspaceDirectoryContext(): Promise<void> {
  const requestSeq = ++workspaceDirectorySyncSeq;
  if (!roots.value.length) {
    await loadRoots();
    return;
  }
  defaultDirectory.value = readDefaultDirectory();
  const target = resolveWorkspaceDefaultTarget();
  if (!target) return;
  if (requestSeq !== workspaceDirectorySyncSeq) return;
  await revealWorkspaceTarget(target);
}

async function revealWorkspaceTarget(
  target: WorkspaceDirectoryTarget,
): Promise<void> {
  const targetRootId = String(target.rootId || '').trim();
  if (!targetRootId) return;
  const targetPath = normalizePath(target.path);
  if (!roots.value.some((root) => root.id === targetRootId)) return;
  suppressRootWatcher = true;
  try {
    rootId.value = targetRootId;
    resetTree(targetPath);
    await loadDirectory(targetPath, { root: true });
    selectRoot();
  } finally {
    suppressRootWatcher = false;
  }
}

function resolveWorkspaceDefaultTarget(): WorkspaceDirectoryTarget | null {
  const savedDirectory = defaultDirectory.value;
  if (savedDirectory) {
    return {
      rootId: savedDirectory.rootId,
      path: savedDirectory.path,
      kind: 'directory',
    };
  }
  return buildDirectoryPayloadForAbsolutePath(workspaceFallbackCwd.value);
}

function refreshTree(): void {
  const currentWorkspaceRootPath = workspaceRootPath.value;
  resetTree(currentWorkspaceRootPath);
  void loadDirectory(currentWorkspaceRootPath, { root: true }).then(async () => {
    defaultDirectory.value = readDefaultDirectory();
    const target = resolveWorkspaceDefaultTarget();
    if (target?.rootId === rootId.value && normalizePath(target.path) !== currentWorkspaceRootPath) {
      await revealWorkspaceTarget(target);
    } else {
      selectRoot();
    }
  });
}

function resetTree(nextWorkspaceRootPath = workspaceRootPath.value): void {
  workspaceRootPath.value = normalizePath(nextWorkspaceRootPath);
  rootDirectory.value = null;
  childrenByPath.value = {};
  expandedPaths.value = { [workspaceRootPath.value]: true };
  loadingPaths.value = {};
  bumpResourceTreeDataRevision();
  bumpResourceTreeExpansionRevision();
  bumpResourceTreeLoadingRevision();
  selectedPath.value = workspaceRootPath.value;
  selectedPaths.value = [];
  closeResourceFilter();
  closeContextMenu();
}

function collapseAllDirectories(): void {
  expandedPaths.value = { [workspaceRootPath.value]: true };
  loadingPaths.value = {};
  bumpResourceTreeExpansionRevision();
  bumpResourceTreeLoadingRevision();
}

function readResourceExplorerSnapshot(): TerminalResourceExplorerSnapshot | null {
  try {
    return parseTerminalResourceExplorerSnapshot(
      globalThis.localStorage?.getItem(RESOURCE_EXPLORER_STATE_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

function persistResourceExplorerSnapshot(): void {
  try {
    const serialized = serializeTerminalResourceExplorerSnapshot({
      rootId: rootId.value,
      expandedPaths: Object.entries(expandedPaths.value)
        .filter(([path, expanded]) => Boolean(path && expanded))
        .map(([path]) => path),
      selectedPath: selectedPath.value,
      showHidden: showHidden.value,
    });
    if (serialized) {
      globalThis.localStorage?.setItem(RESOURCE_EXPLORER_STATE_STORAGE_KEY, serialized);
    } else {
      globalThis.localStorage?.removeItem(RESOURCE_EXPLORER_STATE_STORAGE_KEY);
    }
  } catch {
    // Resource explorer view state is best-effort.
  }
}

async function restoreResourceExplorerSnapshot(
  snapshot: TerminalResourceExplorerSnapshot,
): Promise<void> {
  const directories = snapshot.expandedPaths
    .map((path) => normalizePath(path))
    .filter(Boolean)
    .sort((left, right) => left.split('/').length - right.split('/').length);

  for (const directoryPath of directories) {
    await loadDirectory(directoryPath);
  }

  if (snapshot.selectedPath) {
    await revealResourcePath(snapshot.selectedPath);
  }
}

function collapseResourceExplorerFromMenu(): void {
  closeResourceHeadMore();
  emit('collapse');
}

function flattenTree(path: string, level: number): ResourceTreeRow[] {
  const entries = childrenByPath.value[path] || [];
  const rows: ResourceTreeRow[] = [];
  for (const entry of entries) {
    const expanded = Boolean(expandedPaths.value[entry.path]);
    rows.push({
      entry,
      level,
      expanded,
      loading: Boolean(loadingPaths.value[entry.path]),
    });
    if (entry.kind === 'directory' && expanded) {
      rows.push(...flattenTree(entry.path, level + 1));
    }
  }
  return rows;
}

function resolveVisibleRows(): ResourceTreeRow[] {
  const searchResultKey = resourceFilterActive.value && resourceSearchRows.value.length
    ? resourceSearchRows.value.map((row) => row.entry.path).join('\u0000')
    : '';
  const cacheKey = [
    workspaceRootPath.value,
    resourceFilterActive.value ? 'filter' : 'tree',
    resourceFilterNeedle.value,
    resourceTreeDataRevision.value,
    resourceTreeExpansionRevision.value,
    resourceTreeLoadingRevision.value,
    searchResultKey,
  ].join('\u0001');
  if (visibleRowsCacheKey === cacheKey) return visibleRowsCache;

  const rows = resourceFilterActive.value
    ? resourceSearchRows.value.length
      ? resourceSearchRows.value
      : flattenFilteredTree(workspaceRootPath.value, 0, resourceFilterNeedle.value)
    : flattenTree(workspaceRootPath.value, 0);
  visibleRowsCacheKey = cacheKey;
  visibleRowsCache = rows;
  return rows;
}

function bumpResourceTreeDataRevision(): void {
  resourceTreeDataRevision.value += 1;
}

function bumpResourceTreeExpansionRevision(): void {
  resourceTreeExpansionRevision.value += 1;
}

function bumpResourceTreeLoadingRevision(): void {
  resourceTreeLoadingRevision.value += 1;
}

function flattenFilteredTree(path: string, level: number, needle: string): ResourceTreeRow[] {
  const entries = childrenByPath.value[path] || [];
  const rows: ResourceTreeRow[] = [];
  for (const entry of entries) {
    const childRows = entry.kind === 'directory'
      ? flattenFilteredTree(entry.path, level + 1, needle)
      : [];
    if (!resourceEntryMatchesFilter(entry, needle) && !childRows.length) {
      continue;
    }
    rows.push({
      entry,
      level,
      expanded: true,
      loading: Boolean(loadingPaths.value[entry.path]),
    });
    rows.push(...childRows);
  }
  return rows;
}

function resourceEntryMatchesFilter(entry: FileEntrySummary, needle: string): boolean {
  if (!needle) return true;
  return normalizeResourceFilter(`${entry.name} ${entry.path} ${entry.ext || ''}`).includes(needle);
}

function normalizeResourceFilter(value: string): string {
  return String(value || '').trim().toLocaleLowerCase();
}

function resolveResourceFileIcon(entry: FileEntrySummary) {
  const kind = resolveResourceFileIconKind(entry);
  if (kind === 'archive') return FileArchive;
  if (kind === 'audio') return FileAudio;
  if (kind === 'binary') return FileQuestion;
  if (kind === 'code') return FileCode2;
  if (kind === 'config') return FileCog;
  if (kind === 'data') return FileJson;
  if (kind === 'database') return Database;
  if (kind === 'document') return FileText;
  if (kind === 'font') return FileType2;
  if (kind === 'image') return FileImage;
  if (kind === 'key') return FileKey2;
  if (kind === 'lock') return FileLock2;
  if (kind === 'log') return FileScan;
  if (kind === 'markdown') return FileText;
  if (kind === 'package') return FileBox;
  if (kind === 'pdf') return FileBadge;
  if (kind === 'presentation') return FileChartColumn;
  if (kind === 'script') return FileTerminal;
  if (kind === 'spreadsheet') return FileSpreadsheet;
  if (kind === 'style') return FileCog;
  if (kind === 'test') return FileScan;
  if (kind === 'video') return FileVideo;
  return FileText;
}

function resolveResourceFileIconClass(entry: FileEntrySummary): string {
  return `terminal-resource-row__icon--${resolveResourceFileIconKind(entry)}`;
}

function resolveResourceFileIconKind(entry: FileEntrySummary): ResourceFileIconKind {
  return resolveTerminalFileKind(entry);
}

function sortEntries(entries: FileEntrySummary[]): FileEntrySummary[] {
  return [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === 'directory' ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
}

function selectRoot(): void {
  selectedPath.value = workspaceRootPath.value;
  selectedPaths.value = [];
  focusedResourcePayload.value = buildRootPayload();
}

function selectRootFromPointer(event: MouseEvent): void {
  if (consumeSuppressedResourceClick(event)) return;
  selectRoot();
}

function selectEntry(entry: FileEntrySummary): void {
  focusEntry(entry);
}

function focusEntry(entry: FileEntrySummary): void {
  selectedPath.value = entry.path;
  selectedPaths.value = [entry.path];
  focusedResourcePayload.value = buildEntryPayload(entry);
}

function selectEntryFromPointer(event: MouseEvent, entry: FileEntrySummary): void {
  if (consumeSuppressedResourceClick(event)) return;
  const currentPath = entry.path;
  if (event.shiftKey && selectedPath.value) {
    selectPathRange(selectedPath.value, currentPath);
    selectedPath.value = currentPath;
    return;
  }

  if (event.metaKey || event.ctrlKey) {
    const nextPaths = new Set(selectedPaths.value);
    if (nextPaths.has(currentPath)) {
      nextPaths.delete(currentPath);
    } else {
      nextPaths.add(currentPath);
    }
    selectedPaths.value = Array.from(nextPaths);
    selectedPath.value = currentPath;
    return;
  }

  selectEntry(entry);
  if (shouldPreviewEntryFromPointer(event, entry)) {
    previewEntryFromPointer(entry);
  }
}

function selectPathRange(fromPath: string, toPath: string): void {
  const paths = visibleRows.value.map((row) => row.entry.path);
  const fromIndex = paths.indexOf(fromPath);
  const toIndex = paths.indexOf(toPath);
  if (fromIndex === -1 || toIndex === -1) {
    selectedPaths.value = [toPath];
    return;
  }
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  selectedPaths.value = paths.slice(start, end + 1);
}

function shouldPreviewEntryFromPointer(event: MouseEvent, entry: FileEntrySummary): boolean {
  return entry.kind === 'file'
    && event.button === 0
    && !event.shiftKey
    && !event.metaKey
    && !event.ctrlKey
    && !event.altKey
    && !isInlineRenaming(entry);
}

function previewEntryFromPointer(entry: FileEntrySummary): void {
  if (!resourceFilterActive.value) {
    previewEntryFile(entry);
    return;
  }
  const targetPath = entry.path;
  const targetKind = entry.kind;
  closeResourceFilter();
  void revealResourcePath(targetPath, targetKind).then(() => {
    previewEntryFile(entry);
  });
}

function openResourceFilter(initialQuery = ''): void {
  resourceFilterOpen.value = true;
  if (initialQuery) {
    resourceFilterQuery.value = initialQuery;
  }
  scheduleResourceSearch();
  void nextTick(() => {
    resourceFilterInput.value?.focus();
    resourceFilterInput.value?.select();
  });
}

function closeResourceFilter(): void {
  resourceFilterQuery.value = '';
  resourceFilterOpen.value = false;
  clearResourceSearch();
}

async function commitResourceFilterSelection(): Promise<void> {
  const selectedEntryValue = selectedEntry.value || visibleRows.value[0]?.entry || null;
  if (!selectedEntryValue) {
    closeResourceFilter();
    void nextTick(() => explorerRef.value?.focus());
    return;
  }
  const targetPath = selectedEntryValue.path;
  const targetKind = selectedEntryValue.kind;
  closeResourceFilter();
  await revealResourcePath(targetPath, targetKind);
  if (targetKind === 'file') {
    previewEntryFile(selectedEntryValue);
  }
  void nextTick(() => explorerRef.value?.focus());
}

function handleResourceFilterKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeResourceFilter();
    void nextTick(() => explorerRef.value?.focus());
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    void commitResourceFilterSelection();
  }
}

function scheduleResourceSearch(): void {
  if (resourceSearchTimer) {
    clearTimeout(resourceSearchTimer);
    resourceSearchTimer = null;
  }
  const query = resourceFilterNeedle.value;
  resourceSearchResults.value = [];
  resourceSearchError.value = '';
  resourceSearchSeq += 1;
  if (!resourceFilterOpen.value || !rootId.value || query.length < 2) {
    resourceSearchBusy.value = false;
    return;
  }
  resourceSearchBusy.value = true;
  const seq = resourceSearchSeq;
  const searchRootId = rootId.value;
  const searchDirectoryPath = workspaceRootPath.value;
  const showHiddenFiles = showHidden.value;
  resourceSearchTimer = setTimeout(() => {
    resourceSearchTimer = null;
    void runResourceSearch(seq, searchRootId, searchDirectoryPath, query, showHiddenFiles);
  }, 180);
}

async function runResourceSearch(
  seq: number,
  searchRootId: string,
  searchDirectoryPath: string,
  query: string,
  showHiddenFiles: boolean,
): Promise<void> {
  try {
    const payload = await searchFiles(searchRootId, query, searchDirectoryPath, true, showHiddenFiles);
    if (seq !== resourceSearchSeq || query !== resourceFilterNeedle.value) return;
    resourceSearchResults.value = payload.results || [];
  } catch {
    if (seq !== resourceSearchSeq) return;
    resourceSearchError.value = text('搜索失败', 'Search failed');
  } finally {
    if (seq === resourceSearchSeq) {
      resourceSearchBusy.value = false;
    }
  }
}

function clearResourceSearch(): void {
  if (resourceSearchTimer) {
    clearTimeout(resourceSearchTimer);
    resourceSearchTimer = null;
  }
  resourceSearchSeq += 1;
  resourceSearchResults.value = [];
  resourceSearchBusy.value = false;
  resourceSearchError.value = '';
}

function isPathSelected(path: string): boolean {
  return selectedPaths.value.includes(path);
}

function toggleDirectory(entry: FileEntrySummary): void {
  focusEntry(entry);
  if (entry.kind !== 'directory') return;
  const expanded = Boolean(expandedPaths.value[entry.path]);
  expandedPaths.value = {
    ...expandedPaths.value,
    [entry.path]: !expanded,
  };
  bumpResourceTreeExpansionRevision();
  if (!expanded && !childrenByPath.value[entry.path]) {
    void loadDirectory(entry.path);
  }
}

function openResourceEntry(entry: FileEntrySummary): void {
  if (resourceFilterActive.value) {
    closeResourceFilter();
    void revealResourcePath(entry.path, entry.kind).then(() => {
      if (entry.kind === 'file') {
        previewEntryFile(entry);
      }
    });
    return;
  }
  if (entry.kind === 'directory') {
    toggleDirectory(entry);
    return;
  }
  focusEntry(entry);
  previewEntryFile(entry);
}

function getResourceNavigationItems(): ResourceNavigationItem[] {
  return [
    { path: workspaceRootPath.value, entry: null },
    ...visibleRows.value.map((row) => ({
      path: row.entry.path,
      entry: row.entry,
    })),
  ];
}

function selectNavigationItem(item: ResourceNavigationItem | null | undefined): void {
  if (!item) return;
  if (!item.entry) {
    selectRoot();
    return;
  }
  focusEntry(item.entry);
}

function moveResourceSelection(delta: number): void {
  const items = getResourceNavigationItems();
  if (!items.length) return;
  const currentPath = normalizePath(selectedPath.value);
  const currentIndex = Math.max(0, items.findIndex((item) => item.path === currentPath));
  const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
  selectNavigationItem(items[nextIndex]);
}

function moveResourceSelectionToEdge(edge: 'first' | 'last'): void {
  const items = getResourceNavigationItems();
  if (!items.length) return;
  selectNavigationItem(edge === 'first' ? items[0] : items[items.length - 1]);
}

function expandSelectedDirectory(): void {
  const entry = selectedEntry.value;
  if (!entry || entry.kind !== 'directory') return;
  const expanded = Boolean(expandedPaths.value[entry.path]);
  if (!expanded) {
    toggleDirectory(entry);
    return;
  }
  const firstChild = visibleRows.value.find((row) => parentPathOf(row.entry.path) === entry.path)?.entry || null;
  if (firstChild) {
    focusEntry(firstChild);
  }
}

function collapseSelectedDirectoryOrSelectParent(): void {
  const entry = selectedEntry.value;
  if (!entry) {
    selectRoot();
    return;
  }
  if (entry.kind === 'directory' && expandedPaths.value[entry.path]) {
    toggleDirectory(entry);
    return;
  }
  const parentPath = parentPathOf(entry.path);
  if (!parentPath || isWorkspaceRootPath(parentPath)) {
    selectRoot();
    return;
  }
  const parentEntry = findEntryByPath(parentPath);
  if (parentEntry) {
    focusEntry(parentEntry);
  }
}

function previewEntryFile(entry: FileEntrySummary): void {
  if (entry.kind !== 'file') return;
  emit('previewFile', buildEntryPayload(entry));
}

async function revealDirectory(path: string): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || isWorkspaceRootPath(normalized)) {
    selectRoot();
    return;
  }
  for (const current of buildDirectoryLoadChain(normalized)) {
    if (!childrenByPath.value[current]) {
      await loadDirectory(current);
    } else {
      expandedPaths.value = {
        ...expandedPaths.value,
        [current]: true,
      };
      bumpResourceTreeExpansionRevision();
    }
  }
  selectedPath.value = normalized;
}

async function revealResourcePath(
  path: string,
  kind: FileEntrySummary['kind'] | '' = '',
): Promise<void> {
  const normalized = normalizePath(path);
  if (!normalized || isWorkspaceRootPath(normalized)) {
    selectRoot();
    return;
  }
  const directoryPath = kind === 'directory' ? normalized : parentPathOf(normalized);
  for (const current of buildDirectoryLoadChain(directoryPath)) {
    if (!childrenByPath.value[current]) {
      await loadDirectory(current);
    } else {
      expandedPaths.value = {
        ...expandedPaths.value,
        [current]: true,
      };
      bumpResourceTreeExpansionRevision();
    }
  }
  selectedPath.value = normalized;
  selectedPaths.value = [normalized];
  const revealedEntry = findEntryByPath(normalized);
  focusedResourcePayload.value = revealedEntry
    ? buildEntryPayload(revealedEntry)
    : buildDirectoryPayloadFromPath(normalized);
  await nextTick();
  findResourceRowElement(normalized)?.scrollIntoView({ block: 'nearest' });
}

async function revealTerminalResource(payload: TerminalResourceTransferPayload): Promise<void> {
  const targetPath = normalizePath(payload?.path);
  const targetRootId = String(payload?.rootId || rootId.value || '').trim();
  if (!targetPath && payload?.kind !== 'directory') return;
  if (!roots.value.length) {
    await loadRoots();
  }
  if (targetRootId && targetRootId !== rootId.value) {
    await switchResourceRoot(targetRootId);
  }
  await revealResourcePath(targetPath, payload?.kind || 'file');
}

async function switchResourceRoot(nextRootId: string): Promise<void> {
  const normalizedRootId = String(nextRootId || '').trim();
  if (!normalizedRootId || normalizedRootId === rootId.value) return;
  if (!roots.value.some((root) => root.id === normalizedRootId)) return;
  suppressRootWatcher = true;
  try {
    rootId.value = normalizedRootId;
    resetTree('');
    await loadDirectory('', { root: true });
  } finally {
    suppressRootWatcher = false;
  }
}

function openSelectedInTerminal(): void {
  const payload = selectedTerminalPayload.value;
  if (!payload) return;
  emit('openTerminal', payload);
}

function openSelectedInTerminalFromMenu(): void {
  openSelectedInTerminal();
  closeResourceHeadMore();
}

function openContextInTerminal(): void {
  const payload = contextMenuTerminalPayload.value;
  if (!payload) return;
  emit('openTerminal', payload);
  closeContextMenu();
}

function previewContextFile(): void {
  const payload = contextMenuFilePayload.value;
  if (!payload) return;
  emit('previewFile', payload);
  closeContextMenu();
}

function saveDefaultDirectory(): void {
  const payload = selectedTerminalPayload.value;
  saveDefaultDirectoryPayload(payload);
}

function saveDefaultDirectoryFromMenu(): void {
  saveDefaultDirectory();
  closeResourceHeadMore();
}

function setContextDefaultDirectory(): void {
  saveDefaultDirectoryPayload(contextMenuTerminalPayload.value);
  closeContextMenu();
}

function followMainDefaultDirectoryFromMenu(): void {
  followMainDefaultDirectory();
  closeResourceHeadMore();
}

function followMainDefaultDirectoryFromContext(): void {
  followMainDefaultDirectory();
  closeContextMenu();
}

function followMainDefaultDirectory(): void {
  if (isMainWorkspaceScope.value) return;
  const cleared = clearTerminalResourceDefaultDirectory(
    globalThis.localStorage,
    workspaceDefaultScopeId.value,
  );
  defaultDirectory.value = readDefaultDirectory();
  defaultDirectoryRevision.value += 1;
  uploadFeedback.value = cleared
    ? text('已跟随主目录', 'Following main directory')
    : text('无法更新默认目录', 'Unable to update default directory');
  void syncWorkspaceDirectoryContext();
}

function saveDefaultDirectoryPayload(payload: TerminalResourceTransferPayload | null): void {
  if (!payload) return;
  const savedDirectory = writeTerminalResourceDefaultDirectory(globalThis.localStorage, {
    rootId: rootId.value,
    path: payload.path,
    absolutePath: payload.absolutePath,
  }, workspaceDefaultScopeId.value);
  if (savedDirectory) {
    defaultDirectory.value = savedDirectory;
    defaultDirectoryRevision.value += 1;
    uploadFeedback.value = isMainWorkspaceScope.value
      ? text('已设为主默认目录', 'Main default directory saved')
      : text('已设为本组默认目录', 'Workspace group directory saved');
  } else {
    uploadFeedback.value = text('无法保存默认目录', 'Unable to save default directory');
  }
}

function isDefaultDirectoryPath(path: string | null | undefined): boolean {
  const savedDirectory = defaultDirectory.value;
  if (!savedDirectory || savedDirectory.rootId !== rootId.value) return false;
  return normalizePath(savedDirectory.path) === normalizePath(path || '');
}

function isDefaultDirectoryPayload(payload: TerminalResourceTransferPayload | null | undefined): boolean {
  return Boolean(payload && payload.rootId === rootId.value && isDefaultDirectoryPath(payload.path));
}

async function copySelectedPath(): Promise<void> {
  const values = selectedAbsolutePaths.value;
  if (!values.length) return;
  await copyPathValues(values);
}

async function copySelectedRelativePath(): Promise<void> {
  const values = selectedRelativePaths.value;
  if (!values.length) return;
  await copyPathValues(values);
}

async function copyPathValues(values: string[]): Promise<void> {
  const normalizedValues = Array.from(new Set(
    values.map((value) => String(value || '').trim()).filter(Boolean),
  ));
  if (!normalizedValues.length) return;
  copied.value = await copyTextToClipboard(normalizedValues.join('\n'));
  if (copiedTimer) {
    clearTimeout(copiedTimer);
  }
  copiedTimer = setTimeout(() => {
    copied.value = false;
    copiedTimer = null;
  }, 1500);
}

async function copySelectedPathFromMenu(): Promise<void> {
  await copySelectedPath();
  closeResourceHeadMore();
}

function insertSelectedPathsFromMenu(): void {
  insertTerminalPaths(selectedAbsolutePaths.value);
  closeResourceHeadMore();
}

function uploadFilesFromMenu(): void {
  uploadInput.value?.click();
  closeResourceHeadMore();
}

function uploadDirectoryFromMenu(): void {
  uploadDirectoryInput.value?.click();
  closeResourceHeadMore();
}

function toggleResourceHeadMore(): void {
  resourceHeadMoreOpen.value = !resourceHeadMoreOpen.value;
}

function syncResourceHeadMoreState(): void {
  resourceHeadMoreOpen.value = Boolean(resourceHeadMoreRef.value?.open);
}

function closeResourceHeadMore(): void {
  resourceHeadMoreOpen.value = false;
  resourceHeadMoreRef.value?.removeAttribute('open');
}

function closeResourceHeadMoreFromOutside(event: PointerEvent): void {
  if (!resourceHeadMoreOpen.value) return;
  const target = event.target;
  if (target instanceof Node && resourceHeadMoreRef.value?.contains(target)) return;
  closeResourceHeadMore();
}

function closeResourceOverlays(): void {
  closeContextMenu();
  closeResourceHeadMore();
}

async function copyContextPath(): Promise<void> {
  const payload = contextMenuPayload.value;
  if (!payload) return;
  copied.value = await copyTextToClipboard(payload.absolutePath);
  closeContextMenu();
}

async function copyContextRelativePath(): Promise<void> {
  const payload = contextMenuPayload.value;
  if (!payload) return;
  copied.value = await copyTextToClipboard(payload.path);
  closeContextMenu();
}

function insertContextPathsInTerminal(): void {
  insertTerminalPaths(contextMenuPathPayloads.value.map((payload) => payload.absolutePath));
  closeContextMenu();
}

function insertTerminalPaths(paths: string[]): void {
  const normalizedPaths = Array.from(new Set(
    paths.map((path) => String(path || '').trim()).filter(Boolean),
  ));
  if (!normalizedPaths.length) return;
  emit('insertTerminalPaths', normalizedPaths);
  uploadFeedback.value = normalizedPaths.length > 1
    ? text(`已插入 ${normalizedPaths.length} 个路径`, `Inserted ${normalizedPaths.length} paths`)
    : text('已插入路径到终端', 'Inserted path in terminal');
}

function uploadToContextDirectory(): void {
  const payload = contextMenuTerminalPayload.value;
  if (payload) {
    selectedPath.value = payload.path;
  }
  uploadInput.value?.click();
  closeContextMenu();
}

function uploadDirectoryToContextDirectory(): void {
  const payload = contextMenuTerminalPayload.value;
  if (payload) {
    selectedPath.value = payload.path;
  }
  uploadDirectoryInput.value?.click();
  closeContextMenu();
}

function refreshTreeFromContext(): void {
  refreshTree();
  closeContextMenu();
}

function copyContextResource(): void {
  const payloads = contextMenuSelectionPayloads.value;
  if (!payloads.length) return;
  resourceClipboard.value = { mode: 'copy', payloads };
  uploadFeedback.value = payloads.length > 1
    ? text(`已复制 ${payloads.length} 个项目`, `Copied ${payloads.length} items`)
    : text(`已复制 ${payloads[0]?.name || ''}`, `Copied ${payloads[0]?.name || ''}`);
  closeContextMenu();
}

function cutContextResource(): void {
  const payloads = contextMenuSelectionPayloads.value;
  if (!payloads.length) return;
  resourceClipboard.value = { mode: 'cut', payloads };
  uploadFeedback.value = payloads.length > 1
    ? text(`已剪切 ${payloads.length} 个项目`, `Cut ${payloads.length} items`)
    : text(`已剪切 ${payloads[0]?.name || ''}`, `Cut ${payloads[0]?.name || ''}`);
  closeContextMenu();
}

async function pasteContextResource(): Promise<void> {
  const targetDirectory = contextMenuTerminalPayload.value;
  if (!targetDirectory) return;
  await pasteResourcesIntoDirectory(targetDirectory.path);
}

function startContextCreate(kind: 'file' | 'directory'): void {
  const targetDirectory = contextMenuTerminalPayload.value;
  if (!targetDirectory) return;
  startCreateOperation(kind, targetDirectory);
}

function startCreateFromSelection(kind: 'file' | 'directory'): void {
  const targetDirectory = selectedTerminalPayload.value;
  if (!targetDirectory) return;
  openContextMenuAtPath(targetDirectory.path);
  startCreateOperation(kind, targetDirectory);
}

function startCreateOperation(
  kind: 'file' | 'directory',
  targetDirectory: TerminalResourceTransferPayload,
): void {
  pendingOperation.value = {
    kind: kind === 'file' ? 'create-file' : 'create-directory',
    directoryPath: targetDirectory.path,
    targetPath: '',
    targetName: targetDirectory.name,
  };
  operationName.value = kind === 'file' ? 'untitled.txt' : text('新建文件夹', 'New Folder');
  operationError.value = '';
  focusOperationInput();
}

function startContextRename(): void {
  const payload = contextMenuEditablePayload.value;
  if (!payload) return;
  startRenameOperation(payload);
}

function startRenameFromSelection(): void {
  const payloads = selectedResourcePayloads.value;
  if (payloads.length !== 1 || !payloads[0]) return;
  startRenameOperation(payloads[0]);
}

function startRenameOperation(payload: TerminalResourceTransferPayload): void {
  selectedPath.value = payload.path;
  selectedPaths.value = [payload.path];
  contextMenu.value = null;
  pendingOperation.value = {
    kind: 'rename',
    directoryPath: parentPathOf(payload.path),
    targetPath: payload.path,
    targetName: payload.name,
  };
  operationName.value = payload.name;
  operationError.value = '';
  focusOperationInput();
}

function startContextDelete(): void {
  const payloads = contextMenuSelectionPayloads.value;
  if (!payloads.length) return;
  startDeleteOperation(payloads);
}

function startDeleteFromSelection(): void {
  const payloads = selectedResourcePayloads.value;
  if (!payloads.length) return;
  openContextMenuAtPath(payloads[0]?.path || selectedPath.value);
  startDeleteOperation(payloads);
}

function startDeleteOperation(payloads: TerminalResourceTransferPayload[]): void {
  const directoryPaths = Array.from(new Set(payloads.map((payload) => parentPathOf(payload.path))));
  const firstPayload = payloads[0];
  pendingOperation.value = {
    kind: 'delete',
    directoryPath: directoryPaths[0] || '',
    directoryPaths,
    targetPath: firstPayload?.path || '',
    targetPaths: payloads.map((payload) => payload.path),
    targetName: payloads.length > 1 ? `${payloads.length} items` : firstPayload?.name || '',
  };
  operationName.value = firstPayload?.name || '';
  operationError.value = '';
  focusOperationInput();
}

function cancelResourceOperation(): void {
  if (operationBusy.value) return;
  pendingOperation.value = null;
  operationName.value = '';
  operationError.value = '';
}

function setOperationInputRef(input: HTMLInputElement | null): void {
  operationInput.value = input;
}

function focusOperationInput(): void {
  void nextTick(() => {
    operationInput.value?.focus();
    operationInput.value?.select();
  });
}

function isInlineRenaming(entry: FileEntrySummary): boolean {
  const operation = pendingOperation.value;
  return operation?.kind === 'rename' && operation.targetPath === entry.path;
}

function commitInlineRename(): void {
  const operation = pendingOperation.value;
  if (!operation || operation.kind !== 'rename' || operationBusy.value) return;
  const nextName = operationName.value.trim();
  if (!nextName || nextName === operation.targetName) {
    cancelResourceOperation();
    return;
  }
  void commitResourceOperation();
}

async function commitResourceOperation(): Promise<void> {
  const operation = pendingOperation.value;
  if (!operation || operationBusy.value || !rootId.value) return;
  const nextName = operationName.value.trim();
  if (operation.kind !== 'delete' && !nextName) {
    operationError.value = text('请输入名称', 'Enter a name');
    return;
  }

  operationBusy.value = true;
  operationError.value = '';
  try {
    let nextSelectedPath = operation.targetPath;
    if (operation.kind === 'create-file') {
      await createFile({
        rootId: rootId.value,
        directoryPath: operation.directoryPath,
        name: nextName,
        content: '',
      });
      nextSelectedPath = joinRelativePath(operation.directoryPath, nextName);
      uploadFeedback.value = text(`已创建 ${nextName}`, `Created ${nextName}`);
    } else if (operation.kind === 'create-directory') {
      await createDirectory({
        rootId: rootId.value,
        directoryPath: operation.directoryPath,
        name: nextName,
      });
      nextSelectedPath = joinRelativePath(operation.directoryPath, nextName);
      uploadFeedback.value = text(`已创建 ${nextName}`, `Created ${nextName}`);
    } else if (operation.kind === 'rename') {
      await renamePath({
        rootId: rootId.value,
        path: operation.targetPath,
        nextName,
      });
      nextSelectedPath = joinRelativePath(operation.directoryPath, nextName);
      uploadFeedback.value = text(`已重命名为 ${nextName}`, `Renamed to ${nextName}`);
    } else {
      await deletePaths({
        rootId: rootId.value,
        paths: operation.targetPaths?.length ? operation.targetPaths : [operation.targetPath],
      });
      nextSelectedPath = operation.directoryPath;
      uploadFeedback.value = text(`已删除 ${operation.targetName}`, `Deleted ${operation.targetName}`);
    }

    for (const directoryPath of operation.directoryPaths?.length ? operation.directoryPaths : [operation.directoryPath]) {
      await loadDirectory(directoryPath, {
        root: directoryPath === '',
      });
    }
    selectedPath.value = nextSelectedPath;
    selectedPaths.value = nextSelectedPath ? [nextSelectedPath] : [];
    pendingOperation.value = null;
    operationName.value = '';
    operationError.value = '';
    contextMenu.value = null;
  } catch (error) {
    operationError.value = error instanceof Error
      ? error.message
      : text('操作失败', 'Operation failed');
  } finally {
    operationBusy.value = false;
  }
}

async function handleUploadInput(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const files = Array.from(input?.files || []);
  await uploadFileList(files);
  if (input) {
    input.value = '';
  }
}

function handleUploadDragOver(event: DragEvent): void {
  if (!event.dataTransfer) return;
  if (!Array.from(event.dataTransfer.types || []).includes('Files')) return;
  event.dataTransfer.dropEffect = 'copy';
}

async function handleUploadDrop(event: DragEvent): Promise<void> {
  if (parseDragResourcePayload(event)) return;
  const candidates = await collectUploadCandidatesFromDrop(event);
  await uploadFileCandidates(candidates, uploadDirectoryPath.value);
}

async function handleClipboardPaste(event: ClipboardEvent): Promise<void> {
  const files = Array.from(event.clipboardData?.files || []);
  if (!files.length) return;
  event.preventDefault();
  await uploadFileList(files);
}

async function uploadFileList(files: File[]): Promise<void> {
  await uploadFileCandidates(files.map((file) => buildUploadFileCandidate(file)), uploadDirectoryPath.value);
}

async function uploadFileCandidates(
  candidates: UploadFileCandidate[],
  destinationDirectoryPath = uploadDirectoryPath.value,
): Promise<void> {
  const targetDirectory = normalizePath(destinationDirectoryPath);
  const uploadCandidates = candidates
    .map((candidate) => ({
      file: candidate.file,
      relativePath: normalizeUploadRelativePath(candidate.relativePath || candidate.file.name),
    }))
    .filter((candidate) => candidate.file && candidate.relativePath);
  if (!uploadCandidates.length || !rootId.value) return;
  uploading.value = true;
  uploadFeedback.value = text('正在上传…', 'Uploading...');
  try {
    const payloadFiles: FilesUploadItemPayload[] = await Promise.all(
      uploadCandidates.map(async (candidate) => ({
        fileName: candidate.file.name,
        relativePath: candidate.relativePath,
        dataBase64: await readFileAsBase64(candidate.file),
        overwrite: true,
      })),
    );
    await uploadFiles({
      rootId: rootId.value,
      directoryPath: targetDirectory,
      files: payloadFiles,
    });
    await refreshDirectoriesAfterUpload(uploadCandidates, targetDirectory);
    uploadFeedback.value = text(`已上传 ${uploadCandidates.length} 个项目`, `Uploaded ${uploadCandidates.length} item(s)`);
  } catch {
    uploadFeedback.value = text('上传失败', 'Upload failed');
  } finally {
    uploading.value = false;
  }
}

async function collectUploadCandidatesFromDrop(event: DragEvent): Promise<UploadFileCandidate[]> {
  const items = Array.from(event.dataTransfer?.items || []) as WebkitDataTransferItem[];
  const entries = items
    .map((item) => item.webkitGetAsEntry?.() || null)
    .filter((entry): entry is WebkitFileSystemEntry => Boolean(entry));
  if (!entries.length) {
    return Array.from(event.dataTransfer?.files || []).map((file) => buildUploadFileCandidate(file));
  }
  const nestedCandidates = (await Promise.all(entries.map((entry) => collectUploadCandidatesFromEntry(entry, '')))).flat();
  if (nestedCandidates.length) return nestedCandidates;
  return Array.from(event.dataTransfer?.files || []).map((file) => buildUploadFileCandidate(file));
}

function collectUploadCandidatesFromEntry(
  entry: WebkitFileSystemEntry,
  parentPath: string,
): Promise<UploadFileCandidate[]> {
  const entryRelativePath = normalizeUploadRelativePath(joinRelativePath(parentPath, entry.name));
  if (entry.isFile) {
    const fileEntry = entry as WebkitFileSystemFileEntry;
    return new Promise((resolve) => {
      fileEntry.file(
        (file) => resolve([buildUploadFileCandidate(file, entryRelativePath || file.name)]),
        () => resolve([]),
      );
    });
  }
  if (!entry.isDirectory) return Promise.resolve([]);
  const directoryEntry = entry as WebkitFileSystemDirectoryEntry;
  const reader = directoryEntry.createReader();
  const children: UploadFileCandidate[] = [];

  return new Promise((resolve) => {
    const readBatch = (): void => {
      reader.readEntries(
        (entries) => {
          if (!entries.length) {
            resolve(children);
            return;
          }
          void Promise.all(entries.map((child) => collectUploadCandidatesFromEntry(child, entryRelativePath)))
            .then((nested) => {
              children.push(...nested.flat());
              readBatch();
            });
        },
        () => resolve(children),
      );
    };
    readBatch();
  });
}

function buildUploadFileCandidate(file: File, relativePath = ''): UploadFileCandidate {
  const webkitRelativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
  return {
    file,
    relativePath: normalizeUploadRelativePath(
      relativePath || webkitRelativePath || file.name,
    ),
  };
}

async function refreshDirectoriesAfterUpload(
  candidates: UploadFileCandidate[],
  destinationDirectoryPath = uploadDirectoryPath.value,
): Promise<void> {
  const targetDirectory = normalizePath(destinationDirectoryPath);
  const directories = new Set<string>([targetDirectory]);
  for (const candidate of candidates) {
    const uploadedPath = joinRelativePath(targetDirectory, candidate.relativePath);
    directories.add(parentPathOf(uploadedPath));
  }
  await refreshDirectoriesAfterTransfer(Array.from(directories));
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',').pop() || '' : result);
    };
    reader.onerror = () => reject(reader.error || new Error('file_read_failed'));
    reader.readAsDataURL(file);
  });
}

function handleRootDragStart(event: DragEvent): void {
  const payload = buildRootPayload();
  if (!payload) return;
  setDragPayload(event, payload);
}

function handleResourceDragOver(event: DragEvent): void {
  if (!event.dataTransfer) return;
  const types = Array.from(event.dataTransfer.types || []);
  if (types.includes(TERMINAL_RESOURCE_DRAG_MIME)) {
    event.dataTransfer.dropEffect = event.altKey || event.ctrlKey || event.metaKey ? 'copy' : 'move';
    return;
  }
  if (types.includes('Files')) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

async function handleResourceDrop(event: DragEvent, entry: FileEntrySummary | null): Promise<void> {
  const destinationDirectoryPath = entry
    ? entry.kind === 'directory'
      ? entry.path
      : parentPathOf(entry.path)
    : workspaceRootPath.value;
  const payload = parseDragResourcePayload(event);
  if (!payload) {
    const candidates = await collectUploadCandidatesFromDrop(event);
    await uploadFileCandidates(candidates, destinationDirectoryPath);
    return;
  }
  const mode = event.altKey || event.ctrlKey || event.metaKey ? 'copy' : 'cut';
  await transferResources(payload.items?.length ? payload.items : [payload], destinationDirectoryPath, mode);
}

function openRootContextMenu(event: MouseEvent): void {
  selectContextPath(workspaceRootPath.value);
  openContextMenuAt(event, workspaceRootPath.value);
}

function openEntryContextMenu(event: MouseEvent, entry: FileEntrySummary): void {
  selectContextPath(entry.path);
  openContextMenuAt(event, entry.path);
}

function openSelectedContextMenuFromKeyboard(): void {
  const entry = selectedEntry.value;
  const targetPath = entry?.path || selectedPath.value || workspaceRootPath.value;
  selectContextPath(targetPath);
  openContextMenuAtPath(targetPath);
}

function selectContextPath(path: string): void {
  const normalized = normalizePath(path);
  selectedPath.value = normalized;
  const entry = normalized ? findEntryByPath(normalized) : null;
  focusedResourcePayload.value = entry
    ? buildEntryPayload(entry)
    : normalized
      ? getFocusedPayloadForPath(normalized) || buildDirectoryPayloadFromPath(normalized)
      : buildRootPayload();
  if (!normalized || isWorkspaceRootPath(normalized)) {
    selectedPaths.value = [];
    return;
  }
  if (!selectedPaths.value.includes(normalized)) {
    selectedPaths.value = [normalized];
  }
}

function openContextMenuAt(event: MouseEvent, path: string): void {
  openContextMenuAtPoint(event, path);
}

function openContextMenuAtPoint(point: ResourceContextMenuPoint, path: string): void {
  const viewportWidth = typeof window === 'undefined' ? point.clientX + RESOURCE_CONTEXT_MENU_WIDTH : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? point.clientY + RESOURCE_CONTEXT_MENU_HEIGHT : window.innerHeight;
  contextMenu.value = {
    path: normalizePath(path),
    left: clampNumber(point.clientX, 8, Math.max(8, viewportWidth - RESOURCE_CONTEXT_MENU_WIDTH - 8)),
    top: clampNumber(point.clientY, 8, Math.max(8, viewportHeight - RESOURCE_CONTEXT_MENU_HEIGHT - 8)),
  };
  cancelResourceOperation();
}

function startResourceLongPress(event: PointerEvent, path: string): void {
  if (event.pointerType === 'mouse' || event.button !== 0) return;
  cancelResourceLongPress();
  const normalizedPath = normalizePath(path);
  resourceLongPress = {
    pointerId: event.pointerId,
    path: normalizedPath,
    startX: event.clientX,
    startY: event.clientY,
    clientX: event.clientX,
    clientY: event.clientY,
    timer: window.setTimeout(() => {
      const pending = resourceLongPress;
      if (!pending) return;
      selectContextPath(pending.path);
      openContextMenuAtPoint(pending, pending.path);
      suppressNextResourceClick = true;
      cancelResourceLongPress();
    }, RESOURCE_LONG_PRESS_DELAY_MS),
  };
  window.addEventListener('pointermove', trackResourceLongPress, { passive: true });
  window.addEventListener('pointerup', cancelResourceLongPress, { once: true });
  window.addEventListener('pointercancel', cancelResourceLongPress, { once: true });
}

function trackResourceLongPress(event: PointerEvent): void {
  const pending = resourceLongPress;
  if (!pending || event.pointerId !== pending.pointerId) return;
  pending.clientX = event.clientX;
  pending.clientY = event.clientY;
  const deltaX = Math.abs(event.clientX - pending.startX);
  const deltaY = Math.abs(event.clientY - pending.startY);
  if (deltaX > RESOURCE_LONG_PRESS_MOVE_TOLERANCE || deltaY > RESOURCE_LONG_PRESS_MOVE_TOLERANCE) {
    cancelResourceLongPress();
  }
}

function cancelResourceLongPress(): void {
  if (!resourceLongPress) return;
  window.clearTimeout(resourceLongPress.timer);
  resourceLongPress = null;
  window.removeEventListener('pointermove', trackResourceLongPress);
  window.removeEventListener('pointerup', cancelResourceLongPress);
  window.removeEventListener('pointercancel', cancelResourceLongPress);
}

function consumeSuppressedResourceClick(event: MouseEvent): boolean {
  if (!suppressNextResourceClick) return false;
  suppressNextResourceClick = false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function handleExplorerClick(event: MouseEvent): void {
  if (consumeSuppressedResourceClick(event)) return;
  closeResourceOverlays();
}

function openContextMenuAtPath(path: string): void {
  const normalized = normalizePath(path);
  const row = findResourceRowElement(normalized);
  const rowRect = row?.getBoundingClientRect();
  const explorerRect = explorerRef.value?.getBoundingClientRect();
  const viewportWidth = typeof window === 'undefined' ? 1024 : window.innerWidth;
  const viewportHeight = typeof window === 'undefined' ? 768 : window.innerHeight;
  const rawLeft = (rowRect?.left ?? explorerRect?.left ?? 16) + 24;
  const rawTop = (rowRect?.bottom ?? explorerRect?.top ?? 80) + 2;
  contextMenu.value = {
    path: normalized,
    left: clampNumber(rawLeft, 8, Math.max(8, viewportWidth - RESOURCE_CONTEXT_MENU_WIDTH - 8)),
    top: clampNumber(rawTop, 8, Math.max(8, viewportHeight - RESOURCE_CONTEXT_MENU_HEIGHT - 8)),
  };
  cancelResourceOperation();
}

function findResourceRowElement(path: string): HTMLElement | null {
  const normalized = normalizePath(path);
  const rows = Array.from(treeRef.value?.querySelectorAll<HTMLElement>('[data-resource-path]') || []);
  return rows.find((row) => (row.dataset.resourcePath || '') === normalized) || null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function closeContextMenu(): void {
  contextMenu.value = null;
  if (!operationBusy.value) {
    cancelResourceOperation();
  }
}

function handleEntryDragStart(event: DragEvent, entry: FileEntrySummary): void {
  selectedPath.value = entry.path;
  const payloads = isPathSelected(entry.path) && selectedResourcePayloads.value.length > 1
    ? selectedResourcePayloads.value
    : [buildEntryPayload(entry)];
  selectedPaths.value = payloads.map((payload) => payload.path);
  setDragPayload(event, payloads[0], payloads);
}

function parseDragResourcePayload(event: DragEvent): TerminalResourceTransferPayload | null {
  const rawPayload = event.dataTransfer?.getData(TERMINAL_RESOURCE_DRAG_MIME) || '';
  if (!rawPayload) return null;
  return parseTerminalResourceTransfer(rawPayload);
}

function setDragPayload(
  event: DragEvent,
  payload: TerminalResourceTransferPayload,
  items: TerminalResourceTransferPayload[] = [payload],
): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData(
    TERMINAL_RESOURCE_DRAG_MIME,
    serializeTerminalResourceTransfer({
      ...payload,
      items,
    }),
  );
  event.dataTransfer.setData('text/plain', items.map((item) => item.absolutePath).join('\n'));
}

async function pasteResourcesIntoDirectory(destinationDirectoryPath: string): Promise<void> {
  const clipboard = resourceClipboard.value;
  if (!clipboard) return;
  await transferResources(clipboard.payloads, destinationDirectoryPath, clipboard.mode);
}

async function transferResources(
  payloads: TerminalResourceTransferPayload[],
  destinationDirectoryPath: string,
  mode: 'copy' | 'cut',
): Promise<void> {
  if (transferBusy.value || !payloads.length || !rootId.value) return;
  const normalizedDestination = normalizePath(destinationDirectoryPath);
  transferBusy.value = true;
  try {
    const refreshedDirectories = new Set<string>([normalizedDestination]);
    const selectedAfter: string[] = [];
    const usedDestinationNames = new Set(
      (childrenByPath.value[normalizedDestination] || []).map((entry) => entry.name),
    );

    for (const payload of payloads) {
      if (!payload?.path) continue;
      const sourceParentPath = parentPathOf(payload.path);
      if (mode === 'cut' && normalizePath(payload.path) === normalizedDestination) continue;
      if (mode === 'cut' && isSameOrChildPath(normalizedDestination, payload.path)) {
        uploadFeedback.value = text('不能移动到自身目录内', 'Cannot move into itself');
        continue;
      }
      if (mode === 'cut' && sourceParentPath === normalizedDestination) {
        uploadFeedback.value = text('已在目标目录', 'Already in target directory');
        continue;
      }
      const nextName = mode === 'copy'
        ? buildCopyName(payload.name, normalizedDestination, usedDestinationNames)
        : payload.name;
      usedDestinationNames.add(nextName);
      const request = {
        sourceRootId: payload.rootId || rootId.value,
        sourcePath: payload.path,
        destinationRootId: rootId.value,
        destinationDirectoryPath: normalizedDestination,
        nextName,
      };
      if (mode === 'copy') {
        await copyPath(request);
      } else {
        await movePath(request);
        refreshedDirectories.add(sourceParentPath);
      }
      selectedAfter.push(joinRelativePath(normalizedDestination, nextName));
    }

    if (!selectedAfter.length) return;
    uploadFeedback.value = mode === 'copy'
      ? text(`已复制 ${selectedAfter.length} 个项目`, `Copied ${selectedAfter.length} item(s)`)
      : text(`已移动 ${selectedAfter.length} 个项目`, `Moved ${selectedAfter.length} item(s)`);
    if (mode === 'cut') {
      resourceClipboard.value = null;
    }
    await refreshDirectoriesAfterTransfer(Array.from(refreshedDirectories));
    selectedPaths.value = selectedAfter;
    selectedPath.value = selectedAfter[selectedAfter.length - 1] || normalizedDestination;
    contextMenu.value = null;
  } catch (error) {
    uploadFeedback.value = error instanceof Error
      ? error.message
      : text('移动或复制失败', 'Transfer failed');
  } finally {
    transferBusy.value = false;
  }
}

async function refreshDirectoriesAfterTransfer(directoryPaths: string[]): Promise<void> {
  for (const directoryPath of Array.from(new Set(directoryPaths.map((value) => normalizePath(value))))) {
    await loadDirectory(directoryPath, { root: isWorkspaceRootPath(directoryPath) });
  }
}

function buildCopyName(
  name: string,
  destinationDirectoryPath: string,
  usedNames = new Set((childrenByPath.value[normalizePath(destinationDirectoryPath)] || []).map((entry) => entry.name)),
): string {
  const normalizedName = String(name || 'copy').trim() || 'copy';
  if (!usedNames.has(normalizedName)) return normalizedName;

  const dotIndex = normalizedName.lastIndexOf('.');
  const hasExtension = dotIndex > 0;
  const base = hasExtension ? normalizedName.slice(0, dotIndex) : normalizedName;
  const extension = hasExtension ? normalizedName.slice(dotIndex) : '';
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base} copy${index === 1 ? '' : ` ${index}`}${extension}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  return `${base} copy ${Date.now()}${extension}`;
}

function handleExplorerKeydown(event: KeyboardEvent): void {
  if (isResourceInteractiveKeyTarget(event.target)) return;
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    openSelectedContextMenuFromKeyboard();
    return;
  }
  if (!event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.key === 'F2') {
      if (selectedResourcePayloads.value.length !== 1) return;
      event.preventDefault();
      startRenameFromSelection();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selectedResourcePayloads.value.length) return;
      event.preventDefault();
      startDeleteFromSelection();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveResourceSelection(1);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveResourceSelection(-1);
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveResourceSelectionToEdge('first');
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveResourceSelectionToEdge('last');
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      expandSelectedDirectory();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      collapseSelectedDirectoryOrSelectParent();
      return;
    }
  }

  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey) {
    const entry = selectedEntry.value;
    if (!entry) return;
    event.preventDefault();
    openResourceEntry(entry);
    return;
  }

  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'f') {
    event.preventDefault();
    openResourceFilter();
    return;
  }

  if (
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    event.key.length === 1 &&
    !event.shiftKey
  ) {
    event.preventDefault();
    openResourceFilter(event.key);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.altKey && key === 'n') {
    if (!selectedTerminalPayload.value) return;
    event.preventDefault();
    startCreateFromSelection(event.shiftKey ? 'directory' : 'file');
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.altKey && key === 'u') {
    if (uploading.value || !rootId.value) return;
    event.preventDefault();
    if (event.shiftKey) {
      uploadDirectoryInput.value?.click();
    } else {
      uploadInput.value?.click();
    }
    return;
  }

  if (event.shiftKey && event.altKey && key === 'c') {
    if (!selectedAbsolutePaths.value.length) return;
    event.preventDefault();
    void copySelectedPath();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && key === 'enter') {
    if (!selectedTerminalPayload.value) return;
    event.preventDefault();
    openSelectedInTerminal();
    return;
  }

  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.shiftKey && key === 'c') {
    if (!selectedRelativePaths.value.length) return;
    event.preventDefault();
    void copySelectedRelativePath();
    return;
  }
  if (key === 'c') {
    const payloads = selectedResourcePayloads.value;
    const pathValues = payloads.length
      ? payloads.map((payload) => payload.absolutePath)
      : selectedAbsolutePaths.value;
    if (!pathValues.length) return;
    event.preventDefault();
    if (payloads.length) {
      resourceClipboard.value = { mode: 'copy', payloads };
    }
    void copyPathValues(pathValues);
    uploadFeedback.value = payloads.length
      ? payloads.length > 1
        ? text(`已复制 ${payloads.length} 个项目`, `Copied ${payloads.length} items`)
        : text(`已复制 ${payloads[0]?.name || ''}`, `Copied ${payloads[0]?.name || ''}`)
      : text('已复制路径', 'Copied path');
    return;
  }
  if (key === 'x') {
    const payloads = selectedResourcePayloads.value;
    if (!payloads.length) return;
    event.preventDefault();
    resourceClipboard.value = { mode: 'cut', payloads };
    uploadFeedback.value = payloads.length > 1
      ? text(`已剪切 ${payloads.length} 个项目`, `Cut ${payloads.length} items`)
      : text(`已剪切 ${payloads[0]?.name || ''}`, `Cut ${payloads[0]?.name || ''}`);
    return;
  }
  if (key === 'v') {
    const destinationPath = selectedTerminalPayload.value?.path ?? '';
    if (!resourceClipboard.value) return;
    event.preventDefault();
    void pasteResourcesIntoDirectory(destinationPath);
  }
}

function isResourceInteractiveKeyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input, textarea, select, button, [contenteditable="true"]'));
}

function readDefaultDirectory(): TerminalResourceDefaultDirectory | null {
  return readTerminalResourceDefaultDirectory(
    globalThis.localStorage,
    workspaceDefaultScopeId.value,
    { fallbackToMain: true },
  );
}

function buildDirectoryPayloadForAbsolutePath(
  absolutePath: string | null | undefined,
): TerminalResourceTransferPayload | null {
  const normalizedAbsolutePath = normalizeAbsolutePath(absolutePath);
  if (!normalizedAbsolutePath) return null;
  const candidateRoots = [...roots.value]
    .filter((root) => normalizeAbsolutePath(root.absolutePath))
    .sort((left, right) =>
      normalizeAbsolutePath(right.absolutePath).length - normalizeAbsolutePath(left.absolutePath).length,
    );
  for (const root of candidateRoots) {
    const rootAbsolutePath = normalizeAbsolutePath(root.absolutePath);
    if (
      normalizedAbsolutePath !== rootAbsolutePath &&
      !normalizedAbsolutePath.startsWith(`${rootAbsolutePath}/`)
    ) {
      continue;
    }
    const path =
      normalizedAbsolutePath === rootAbsolutePath
        ? ''
        : normalizedAbsolutePath.slice(rootAbsolutePath.length + 1);
    return {
      rootId: root.id,
      path,
      absolutePath: normalizedAbsolutePath,
      kind: 'directory',
      name: basenameOfPath(path) || text(root.labelZh, root.labelEn),
    };
  }
  return null;
}

function buildEntryPayload(entry: FileEntrySummary): TerminalResourceTransferPayload {
  return {
    rootId: rootId.value,
    path: entry.path,
    absolutePath: resolveAbsolutePath(entry.path),
    kind: entry.kind,
    name: entry.name,
  };
}

function buildRootPayload(): TerminalResourceTransferPayload | null {
  const absolutePath = rootDirectory.value?.absolutePath || activeRoot.value?.absolutePath || '';
  if (!absolutePath) return null;
  return {
    rootId: rootId.value,
    path: workspaceRootPath.value,
    absolutePath,
    kind: 'directory',
    name: basenameOfPath(workspaceRootPath.value) || activeRootLabel.value,
  };
}

function buildDirectoryPayloadFromPath(path: string): TerminalResourceTransferPayload | null {
  const normalized = normalizePath(path);
  if (!normalized) return buildRootPayload();
  const absolutePath = resolveAbsolutePath(normalized);
  if (!absolutePath) return null;
  return {
    rootId: rootId.value,
    path: normalized,
    absolutePath,
    kind: 'directory',
    name: basenameOfPath(normalized),
  };
}

function getFocusedPayloadForPath(path: string): TerminalResourceTransferPayload | null {
  const normalized = normalizePath(path);
  const payload = focusedResourcePayload.value;
  if (!payload || normalizePath(payload.path) !== normalized) return null;
  return payload;
}

function toTerminalDirectoryPayload(
  payload: TerminalResourceTransferPayload,
): TerminalResourceTransferPayload | null {
  const absolutePath = getTerminalResourceDirectoryAbsolutePath(payload);
  if (!absolutePath) return null;
  if (payload.kind === 'directory') {
    return {
      ...payload,
      absolutePath,
      kind: 'directory',
      name: payload.name || basenameOfPath(payload.path) || activeRootLabel.value,
    };
  }
  const directoryPath = getTerminalResourceDirectoryPath(payload);
  return {
    ...payload,
    path: directoryPath,
    absolutePath,
    kind: 'directory',
    name: basenameOfPath(directoryPath) || activeRootLabel.value,
  };
}

function findEntryByPath(path: string): FileEntrySummary | null {
  const normalized = normalizePath(path);
  for (const entries of Object.values(childrenByPath.value)) {
    const match = entries.find((entry) => entry.path === normalized);
    if (match) return match;
  }
  const searchMatch = resourceSearchResults.value.find((entry) => entry.path === normalized);
  if (searchMatch) return searchMatch;
  return null;
}

function setPathLoading(path: string, value: boolean): void {
  loadingPaths.value = {
    ...loadingPaths.value,
    [path]: value,
  };
  bumpResourceTreeLoadingRevision();
}

function normalizePath(path: string): string {
  return String(path || '').replace(/^[/\\]+|[/\\]+$/g, '');
}

function isWorkspaceRootPath(path: string | null | undefined): boolean {
  return normalizePath(path || '') === workspaceRootPath.value;
}

function relativeWorkspacePath(path: string): string {
  const normalized = normalizePath(path);
  const rootPath = workspaceRootPath.value;
  if (!rootPath) return normalized;
  if (normalized === rootPath) return '';
  return normalized.startsWith(`${rootPath}/`)
    ? normalized.slice(rootPath.length + 1)
    : normalized;
}

function buildDirectoryLoadChain(directoryPath: string): string[] {
  const normalized = normalizePath(directoryPath);
  if (!normalized || isWorkspaceRootPath(normalized)) return [];
  const rootPath = workspaceRootPath.value;
  const relativePath = relativeWorkspacePath(normalized);
  const parts = relativePath.split('/').filter(Boolean);
  let current = rootPath;
  return parts.map((part) => {
    current = current ? `${current}/${part}` : part;
    return current;
  });
}

function normalizeAbsolutePath(path: unknown): string {
  const normalized = String(path || '').trim().replace(/\\/g, '/');
  if (!normalized) return '';
  if (normalized === '/') return '/';
  return normalized.replace(/\/+$/g, '') || '/';
}

function normalizeWorkspaceScopeId(scopeId: unknown): string {
  return String(scopeId || '').trim() || TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID;
}

function normalizeUploadRelativePath(path: string): string {
  return String(path || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function isSameOrChildPath(path: string, parentPath: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedParent = normalizePath(parentPath);
  return normalizedPath === normalizedParent || normalizedPath.startsWith(`${normalizedParent}/`);
}

function joinRelativePath(directoryPath: string, name: string): string {
  return [normalizePath(directoryPath), normalizePath(name)]
    .filter(Boolean)
    .join('/');
}

function resolveAbsolutePath(entryPath: string): string {
  const rootPath = activeRoot.value?.absolutePath || rootDirectory.value?.absolutePath || '';
  const normalizedEntryPath = normalizePath(entryPath);
  if (!normalizedEntryPath) {
    return rootDirectory.value?.absolutePath || rootPath;
  }
  return `${rootPath.replace(/[/\\]+$/, '')}/${normalizedEntryPath}`;
}

function basenameOfPath(path: string): string {
  return normalizePath(path).split('/').filter(Boolean).pop() || '';
}

function parentPathOf(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

defineExpose({
  revealTerminalResource,
});

</script>
