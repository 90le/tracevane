<template>
  <section
    class="terminal-file-preview"
    :class="{ 'terminal-file-preview--files-surface': isFilesSurface }"
    data-testid="terminal-file-preview"
    aria-live="polite"
    @click="closePreviewOverlays"
    @keydown="handlePreviewKeydown"
    @keydown.esc="closePreviewOverlays"
  >
    <header class="terminal-file-preview__head">
      <div class="terminal-file-preview__tabbar">
        <details
          ref="previewSwitcherRef"
          class="terminal-file-preview__switcher"
          :open="previewSwitcherOpen"
          @toggle="syncPreviewSwitcherState"
          @keydown.esc.stop.prevent="closePreviewSwitcher"
        >
          <summary
            class="terminal-file-preview__switcher-summary"
            :title="activePreviewTitle"
            :aria-expanded="previewSwitcherOpen"
            @click.prevent.stop="togglePreviewSwitcher"
          >
            <Files class="terminal-file-preview__icon" aria-hidden="true" />
            <span class="sr-only">{{ text('打开的文件', 'Open files') }}</span>
            <small>{{ tabs.length }}</small>
          </summary>
          <div class="terminal-file-preview__switcher-panel" role="menu" @click.stop>
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              role="menuitem"
              class="terminal-file-preview__switcher-item"
              :class="{ active: tab.id === activeTabId }"
              :title="filePreviewTabTitle(tab)"
              @click="selectPreviewTab(tab.id)"
            >
              <component
                :is="resolvePreviewFileIcon(tab)"
                class="terminal-file-preview__icon"
                :class="resolvePreviewFileIconClass(tab)"
                aria-hidden="true"
              />
              <span>{{ tab.name }}</span>
              <span
                v-if="isTabDirty(tab.id)"
                class="terminal-file-preview__dirty-dot"
                :title="text('未保存', 'Unsaved')"
                :aria-label="text('未保存', 'Unsaved')"
              ></span>
            </button>
          </div>
        </details>
        <div class="terminal-file-preview__tabs" :class="previewTabbarClasses" role="tablist">
          <button
            v-if="hiddenPreviewBeforeCount"
            type="button"
            class="terminal-file-preview__tab-overflow terminal-file-preview__tab-overflow--before"
            :title="text(`${hiddenPreviewBeforeCount} 个左侧文件`, `${hiddenPreviewBeforeCount} hidden file(s) to the left`)"
            :aria-label="text(`${hiddenPreviewBeforeCount} 个左侧文件`, `${hiddenPreviewBeforeCount} hidden file(s) to the left`)"
            @click.stop="selectHiddenPreviewTab(-1)"
          >
            <ChevronLeft class="terminal-file-preview__icon" aria-hidden="true" />
            <span>{{ hiddenPreviewBeforeCount }}</span>
          </button>
          <button
            v-for="tab in visiblePreviewTabs"
            :key="tab.id"
            type="button"
            class="terminal-file-preview__tab"
            :class="{
              'terminal-file-preview__tab--active': tab.id === activeTabId,
              'terminal-file-preview__tab--dirty': isTabDirty(tab.id),
              'terminal-file-preview__tab--dragging': draggedPreviewTabId === tab.id,
              'terminal-file-preview__tab--drop-before': dropTarget?.tabId === tab.id && dropTarget.position === 'before',
              'terminal-file-preview__tab--drop-after': dropTarget?.tabId === tab.id && dropTarget.position === 'after',
            }"
            draggable="true"
            role="tab"
            :aria-selected="tab.id === activeTabId"
            :title="filePreviewTabTitle(tab)"
            :data-preview-tab-id="tab.id"
            @click="emit('select', tab.id)"
            @keydown="handlePreviewTabKeydown($event, tab)"
            @auxclick.prevent="handlePreviewTabAuxClick($event, tab)"
            @contextmenu.prevent="openPreviewTabContextMenu($event, tab)"
            @dragstart="startPreviewTabDrag($event, tab)"
            @dragover.prevent="handlePreviewTabDragOver($event, tab)"
            @drop.prevent="dropPreviewTab($event, tab)"
            @dragend="endPreviewTabDrag"
          >
            <component
              :is="resolvePreviewFileIcon(tab)"
              class="terminal-file-preview__icon"
              :class="resolvePreviewFileIconClass(tab)"
              aria-hidden="true"
            />
            <span>{{ tab.name }}</span>
            <span class="terminal-file-preview__tab-state">
              <span
                v-if="isTabDirty(tab.id)"
                class="terminal-file-preview__dirty-dot"
                :title="text('未保存', 'Unsaved')"
                :aria-label="text('未保存', 'Unsaved')"
              ></span>
              <span
                role="button"
                tabindex="0"
                class="terminal-file-preview__close"
                :aria-label="text('关闭文件', 'Close file')"
                @click.stop="requestCloseTab(tab.id)"
                @keydown.enter.stop.prevent="requestCloseTab(tab.id)"
                @keydown.space.stop.prevent="requestCloseTab(tab.id)"
              >
                <X class="terminal-file-preview__icon" aria-hidden="true" />
              </span>
            </span>
          </button>
          <button
            v-if="hiddenPreviewAfterCount"
            type="button"
            class="terminal-file-preview__tab-overflow terminal-file-preview__tab-overflow--after"
            :title="text(`${hiddenPreviewAfterCount} 个右侧文件`, `${hiddenPreviewAfterCount} hidden file(s) to the right`)"
            :aria-label="text(`${hiddenPreviewAfterCount} 个右侧文件`, `${hiddenPreviewAfterCount} hidden file(s) to the right`)"
            @click.stop="selectHiddenPreviewTab(1)"
          >
            <span>{{ hiddenPreviewAfterCount }}</span>
            <ChevronRight class="terminal-file-preview__icon" aria-hidden="true" />
          </button>
          <span v-if="hiddenPreviewTabCount" class="sr-only">
            {{ text(`${hiddenPreviewTabCount} 个文件标签收在文件列表中`, `${hiddenPreviewTabCount} file tab(s) are in the file list`) }}
          </span>
        </div>
      </div>
      <div class="terminal-file-preview__actions" role="toolbar" :aria-label="text('文件操作', 'File actions')">
        <button
          v-if="activeSupportsRichPreview"
          type="button"
          class="secondary-button compact-button terminal-file-preview__button terminal-file-preview__button--preview-mode"
          :class="{ active: activePreviewMode !== 'edit' }"
          :title="previewModeButtonLabel"
          :aria-label="previewModeButtonLabel"
          :aria-pressed="activePreviewMode !== 'edit'"
          @click.stop="toggleActivePreviewMode"
        >
          <Code2 v-if="activePreviewMode === 'visual'" class="terminal-file-preview__icon" aria-hidden="true" />
          <PencilLine v-else-if="activePreviewMode === 'preview'" class="terminal-file-preview__icon" aria-hidden="true" />
          <Eye v-else class="terminal-file-preview__icon" aria-hidden="true" />
          <span class="sr-only">{{ previewModeButtonLabel }}</span>
        </button>
        <button
          type="button"
          class="secondary-button compact-button terminal-file-preview__button terminal-file-preview__button--primary"
          :class="{ 'terminal-file-preview__button--dirty': activeDirty }"
          :title="saveButtonLabel"
          :aria-label="saveButtonLabel"
          :disabled="!activeDirty || !activeCanEdit || activeState?.saving"
          @click="saveActiveFile"
        >
          <Save class="terminal-file-preview__icon" aria-hidden="true" />
          <span class="sr-only">{{ saveButtonLabel }}</span>
        </button>
        <details
          ref="previewActionMenuRef"
          class="terminal-file-preview__more"
          :open="previewActionMenuOpen"
          @toggle="syncPreviewActionMenuState"
          @keydown.esc.stop.prevent="closePreviewActionMenu"
        >
          <summary
            class="secondary-button compact-button terminal-file-preview__button terminal-file-preview__more-summary"
            :aria-label="text('更多文件操作', 'More file actions')"
            :title="text('更多文件操作', 'More file actions')"
            :aria-expanded="previewActionMenuOpen"
            @click.prevent.stop="togglePreviewActionMenu"
          >
            <MoreHorizontal class="terminal-file-preview__icon" aria-hidden="true" />
          </summary>
          <div class="terminal-file-preview__more-panel" role="menu" @click.stop>
            <button
              type="button"
              class="terminal-file-preview__menu-item terminal-file-preview__menu-item--revert"
              role="menuitem"
              :disabled="!activeDirty || activeState?.saving"
              @click="resetActiveDraftFromMenu"
            >
              <RotateCcw class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('还原更改', 'Revert changes') }}</span>
            </button>
            <button
              type="button"
              class="terminal-file-preview__menu-item terminal-file-preview__menu-item--save-all"
              role="menuitem"
              :disabled="!dirtyTabIds.length"
              @click="saveDirtyFilesFromMenu"
            >
              <Save class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('保存全部', 'Save All') }}</span>
            </button>
            <button
              type="button"
              class="terminal-file-preview__menu-item terminal-file-preview__menu-item--find"
              role="menuitem"
              :disabled="activePayload?.content == null"
              @click="requestEditorSearchFromMenu"
            >
              <Search class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('查找', 'Find') }}</span>
            </button>
            <button
              type="button"
              class="terminal-file-preview__menu-item terminal-file-preview__menu-item--reveal"
              role="menuitem"
              v-if="!isFilesSurface"
              :disabled="!activeTab"
              @click="revealActiveFileFromMenu"
            >
              <FolderOpen class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('在资源管理器中定位', 'Reveal in Explorer') }}</span>
            </button>
            <a
              v-if="downloadUrl"
              class="terminal-file-preview__menu-item"
              role="menuitem"
              :href="downloadUrl"
              :download="activeTab?.name || undefined"
              @click="closePreviewActionMenu"
            >
              <Download class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('下载文件', 'Download file') }}</span>
            </a>
            <button v-else type="button" class="terminal-file-preview__menu-item" role="menuitem" disabled>
              <Download class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('下载文件', 'Download file') }}</span>
            </button>
            <span class="terminal-file-preview__menu-divider" aria-hidden="true"></span>
            <button
              type="button"
              class="terminal-file-preview__menu-item"
              role="menuitem"
              :disabled="!savedTabIds.length"
              @click="closeSavedFilesFromMenu"
            >
              <Files class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('关闭已保存文件', 'Close saved files') }}</span>
            </button>
            <button
              type="button"
              class="terminal-file-preview__menu-item"
              role="menuitem"
              :disabled="props.tabs.length <= 1"
              @click="closeOtherFilesFromMenu"
            >
              <Files class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('关闭其他文件', 'Close other files') }}</span>
            </button>
            <button
              type="button"
              class="terminal-file-preview__menu-item terminal-file-preview__menu-item--danger"
              role="menuitem"
              :disabled="!props.tabs.length"
              @click="closeAllFilesFromMenu"
            >
              <X class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('关闭所有文件', 'Close all files') }}</span>
            </button>
            <span v-if="!isFilesSurface" class="terminal-file-preview__menu-divider" aria-hidden="true"></span>
            <div v-if="!isFilesSurface" class="terminal-file-preview__menu-section" role="group" :aria-label="text('预览布局', 'Preview layout')">
              <span>{{ text('布局', 'Layout') }}</span>
              <div class="terminal-file-preview__layout-switch">
                <button
                  v-for="option in placementOptions"
                  :key="option.value"
                  type="button"
                  class="terminal-file-preview__layout-button"
                  :class="{ active: option.value === props.placement }"
                  :title="option.label"
                  :aria-pressed="option.value === props.placement"
                  @click="setPreviewPlacement(option.value)"
                >
                  <component :is="option.icon" class="terminal-file-preview__icon" aria-hidden="true" />
                </button>
              </div>
            </div>
            <button v-if="!isFilesSurface" type="button" class="terminal-file-preview__menu-item" role="menuitem" @click="toggleTerminalFromMenu">
              <TerminalSquare class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ props.terminalCollapsed ? text('显示终端', 'Show Terminal') : text('收起终端', 'Hide Terminal') }}</span>
            </button>
            <button v-if="!isFilesSurface" type="button" class="terminal-file-preview__menu-item" role="menuitem" @click="toggleWorkspaceFullscreenFromMenu">
              <Minimize2 v-if="props.workspaceFullscreen" class="terminal-file-preview__icon" aria-hidden="true" />
              <Maximize2 v-else class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ props.workspaceFullscreen ? text('退出全屏', 'Exit Fullscreen') : text('全屏IDE', 'IDE Fullscreen') }}</span>
            </button>
            <button type="button" class="terminal-file-preview__menu-item terminal-file-preview__menu-item--danger" role="menuitem" @click="closeActiveFileFromMenu">
              <X class="terminal-file-preview__icon" aria-hidden="true" />
              <span>{{ text('关闭文件', 'Close file') }}</span>
            </button>
          </div>
        </details>
      </div>
    </header>

    <div
      v-if="previewTabContextMenu"
      ref="previewTabContextMenuRef"
      class="terminal-file-preview__context-menu"
      role="menu"
      :style="previewTabContextMenuStyle"
      @click.stop
      @contextmenu.prevent
    >
      <button type="button" role="menuitem" @click="copyContextTabPath">
        <Copy class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('复制路径', 'Copy path') }}</span>
      </button>
      <button type="button" role="menuitem" @click="copyContextTabRelativePath">
        <Copy class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('复制相对路径', 'Copy relative path') }}</span>
      </button>
      <button v-if="!isFilesSurface" type="button" role="menuitem" @click="insertContextTabPathInTerminal">
        <TerminalSquare class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('插入路径到终端', 'Insert path in terminal') }}</span>
      </button>
      <button v-if="!isFilesSurface" type="button" role="menuitem" @click="revealContextTabInExplorer">
        <FolderOpen class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('在资源管理器中定位', 'Reveal in Explorer') }}</span>
      </button>
      <a
        v-if="contextMenuTabDownloadUrl"
        class="terminal-file-preview__context-menu-item"
        role="menuitem"
        :href="contextMenuTabDownloadUrl"
        :download="contextMenuTab?.name || undefined"
        @click="closePreviewTabContextMenu"
      >
        <Download class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('下载文件', 'Download file') }}</span>
      </a>
      <span class="terminal-file-preview__menu-divider" aria-hidden="true"></span>
      <button type="button" role="menuitem" @click="closeContextTab">
        <X class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('关闭文件', 'Close file') }}</span>
      </button>
      <button type="button" role="menuitem" :disabled="props.tabs.length <= 1" @click="closeOtherContextTabs">
        <Files class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('关闭其他文件', 'Close other files') }}</span>
      </button>
      <button type="button" role="menuitem" :disabled="contextMenuTabIndex >= props.tabs.length - 1" @click="closeContextTabsToRight">
        <Files class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('关闭右侧文件', 'Close files to the right') }}</span>
      </button>
      <button type="button" role="menuitem" :disabled="!savedTabIds.length" @click="closeSavedContextTabs">
        <Files class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('关闭已保存文件', 'Close saved files') }}</span>
      </button>
      <button type="button" role="menuitem" class="terminal-file-preview__context-menu-danger" @click="closeAllContextTabs">
        <X class="terminal-file-preview__icon" aria-hidden="true" />
        <span>{{ text('关闭所有文件', 'Close all files') }}</span>
      </button>
    </div>

    <div class="terminal-file-preview__body">
      <div v-if="loading" class="terminal-file-preview__state">
        {{ text('正在读取文件…', 'Loading file...') }}
      </div>
      <div v-else-if="errorMessage" class="terminal-file-preview__state terminal-file-preview__state--error">
        {{ errorMessage }}
      </div>
      <figure v-else-if="activePayload?.imageLike && downloadUrl" class="terminal-file-preview__image">
        <div
          class="terminal-file-preview__image-toolbar"
          role="toolbar"
          :aria-label="text('图片预览缩放', 'Image preview zoom')"
          @click.stop
        >
          <button
            type="button"
            class="terminal-file-preview__image-tool"
            :title="text('缩小', 'Zoom out')"
            :aria-label="text('缩小', 'Zoom out')"
            :disabled="activeImageZoom <= IMAGE_ZOOM_MIN"
            @click="zoomActiveImage(-IMAGE_ZOOM_STEP)"
          >
            <ZoomOut class="terminal-file-preview__icon" aria-hidden="true" />
          </button>
          <span class="terminal-file-preview__image-zoom">{{ activeImageZoomPercent }}</span>
          <button
            type="button"
            class="terminal-file-preview__image-tool"
            :title="text('放大', 'Zoom in')"
            :aria-label="text('放大', 'Zoom in')"
            :disabled="activeImageZoom >= IMAGE_ZOOM_MAX"
            @click="zoomActiveImage(IMAGE_ZOOM_STEP)"
          >
            <ZoomIn class="terminal-file-preview__icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="terminal-file-preview__image-tool terminal-file-preview__image-tool--fit"
            :class="{ active: activeImageFit }"
            :title="text('适配窗口', 'Fit to view')"
            :aria-label="text('适配窗口', 'Fit to view')"
            :aria-pressed="activeImageFit"
            @click="fitActiveImage"
          >
            <Maximize2 class="terminal-file-preview__icon" aria-hidden="true" />
            <span>{{ text('适配', 'Fit') }}</span>
          </button>
          <button
            type="button"
            class="terminal-file-preview__image-tool"
            :title="text('重置为 100%', 'Reset to 100%')"
            :aria-label="text('重置为 100%', 'Reset to 100%')"
            @click="resetActiveImageZoom"
          >
            <RotateCcw class="terminal-file-preview__icon" aria-hidden="true" />
          </button>
        </div>
        <div
          class="terminal-file-preview__image-stage"
          :class="{
            'terminal-file-preview__image-stage--pannable': activeImagePannable,
            'terminal-file-preview__image-stage--dragging': imagePanDragging,
          }"
          @pointerdown="startImagePan"
          @pointermove="moveImagePan"
          @pointerup="endImagePan"
          @pointercancel="endImagePan"
          @pointerleave="endImagePan"
          @dblclick="resetActiveImageZoom"
          @wheel.ctrl.prevent="zoomActiveImageFromWheel"
        >
          <div class="terminal-file-preview__image-canvas">
            <img
              class="terminal-file-preview__image-img"
              :class="{ 'terminal-file-preview__image-img--fit': activeImageFit }"
              :style="activeImageStyle"
              :src="downloadUrl"
              :alt="activePayload.name"
              draggable="false"
            />
          </div>
        </div>
      </figure>
      <section
        v-else-if="activeInlineMediaKind === 'video' && downloadUrl"
        class="terminal-file-preview__media terminal-file-preview__media--video"
        :aria-label="text('视频预览', 'Video preview')"
      >
        <div class="terminal-file-preview__media-stage">
          <video
            class="terminal-file-preview__video"
            :src="downloadUrl"
            controls
            preload="metadata"
            playsinline
          ></video>
        </div>
        <footer class="terminal-file-preview__media-footer">
          <component
            :is="activePreviewFileIcon"
            class="terminal-file-preview__icon"
            :class="activePreviewFileIconClass"
            aria-hidden="true"
          />
          <span>{{ activeFileKindLabel }}</span>
          <small>{{ activeMediaMetaLabel }}</small>
          <a :href="downloadAttachmentUrl" :download="activePayload.name">{{ text('下载', 'Download') }}</a>
        </footer>
      </section>
      <section
        v-else-if="activeInlineMediaKind === 'audio' && downloadUrl"
        class="terminal-file-preview__media terminal-file-preview__media--audio"
        :aria-label="text('音频预览', 'Audio preview')"
      >
        <div class="terminal-file-preview__audio-card">
          <FileAudio class="terminal-file-preview__audio-art" aria-hidden="true" />
          <strong>{{ activePayload.name }}</strong>
          <span>{{ activeMediaMetaLabel }}</span>
          <audio
            class="terminal-file-preview__audio"
            :src="downloadUrl"
            controls
            preload="metadata"
          ></audio>
        </div>
      </section>
      <section
        v-else-if="activeInlineMediaKind === 'pdf' && downloadUrl"
        class="terminal-file-preview__media terminal-file-preview__media--pdf"
        :aria-label="text('PDF 文件', 'PDF file')"
      >
        <div class="terminal-file-preview__pdf-card">
          <FileBadge class="terminal-file-preview__pdf-icon" aria-hidden="true" />
          <strong>{{ activePayload.name }}</strong>
          <span>{{ activeFileKindLabel }}</span>
          <small>{{ activeMediaMetaLabel }}</small>
          <div class="terminal-file-preview__binary-actions">
            <a :href="downloadUrl" target="_blank" rel="noopener noreferrer">{{ text('打开预览', 'Open preview') }}</a>
            <a :href="downloadAttachmentUrl" :download="activePayload.name">{{ text('下载', 'Download') }}</a>
          </div>
        </div>
      </section>
      <section
        v-else-if="activeInlineMediaKind === 'font' && downloadUrl"
        class="terminal-file-preview__embed terminal-file-preview__embed--font"
        :aria-label="text('字体预览', 'Font preview')"
      >
        <iframe
          class="terminal-file-preview__embed-frame"
          :title="text(`${activePayload.name} 字体预览`, `${activePayload.name} font preview`)"
          :srcdoc="fontPreviewSrcdoc"
          sandbox=""
          referrerpolicy="no-referrer"
        ></iframe>
      </section>
      <section
        v-else-if="activeBinaryPreviewVisible && downloadUrl"
        class="terminal-file-preview__media terminal-file-preview__media--binary"
        :aria-label="text('文件信息', 'File information')"
      >
        <div class="terminal-file-preview__binary-card">
          <component
            :is="activePreviewFileIcon"
            class="terminal-file-preview__binary-icon"
            :class="activePreviewFileIconClass"
            aria-hidden="true"
          />
          <strong>{{ activePayload.name }}</strong>
          <span>{{ activeFileKindLabel }}</span>
          <small>{{ activeMediaMetaLabel }}</small>
          <div class="terminal-file-preview__binary-actions">
            <a :href="downloadUrl" target="_blank" rel="noopener noreferrer">{{ text('打开', 'Open') }}</a>
            <a :href="downloadAttachmentUrl" :download="activePayload.name">{{ text('下载', 'Download') }}</a>
          </div>
        </div>
      </section>
      <section
        v-else-if="activePayload?.content != null && activePreviewMode === 'preview' && activeRichPreviewKind === 'markdown'"
        class="terminal-file-preview__rendered terminal-file-preview__rendered--markdown"
        :aria-label="text('Markdown 富文本预览', 'Markdown rich preview')"
      >
        <AsyncTerminalMarkdownPreview
          class="terminal-file-preview__markdown"
          :source="activeDraft"
          :title="activePayload.name"
          :dark="resolvedTheme === 'dark'"
          :editable="false"
          :read-only="true"
          :asset-root-id="activeTab?.rootId || ''"
          :asset-file-path="activePayload.path || activeTab?.path || ''"
        />
      </section>
      <section
        v-else-if="activePayload?.content != null && activePreviewMode === 'visual' && activeRichPreviewKind === 'markdown'"
        class="terminal-file-preview__rendered terminal-file-preview__rendered--markdown terminal-file-preview__rendered--markdown-editable"
        :aria-label="text('Markdown 所见即所得编辑', 'Markdown visual editor')"
      >
        <AsyncTerminalMarkdownPreview
          class="terminal-file-preview__markdown"
          v-model:source="activeDraft"
          :title="activePayload.name"
          :dark="resolvedTheme === 'dark'"
          :editable="activeCanEdit"
          :read-only="!activeCanEdit || activeState?.saving"
          :asset-root-id="activeTab?.rootId || ''"
          :asset-file-path="activePayload.path || activeTab?.path || ''"
          @save="saveActiveFile"
        />
      </section>
      <section
        v-else-if="activePayload?.content != null && activePreviewMode === 'preview' && activeRichPreviewKind === 'html'"
        class="terminal-file-preview__rendered terminal-file-preview__rendered--html"
        :aria-label="text('HTML 浏览器预览', 'HTML browser preview')"
      >
        <iframe
          class="terminal-file-preview__html-frame"
          :title="text(`${activePayload.name} HTML 预览`, `${activePayload.name} HTML preview`)"
          :srcdoc="htmlPreviewSrcdoc"
          sandbox="allow-forms allow-modals allow-popups allow-scripts"
          referrerpolicy="no-referrer"
        ></iframe>
      </section>
      <AsyncCodeFileEditor
        v-else-if="activePayload?.content != null"
        class="terminal-file-preview__editor"
        v-model="activeDraft"
        :path="activePayload.path"
        :read-only="!activeCanEdit || activeState?.saving"
        :dark="resolvedTheme === 'dark'"
        :search-request="searchRequest"
        :text="text"
        @save="saveActiveFile"
      />
      <div v-else class="terminal-file-preview__state">
        {{ text('此文件无法直接预览，可下载或复制路径后在终端处理。', 'This file cannot be previewed directly. Download it or copy the path for terminal use.') }}
      </div>
    </div>

    <div
      v-if="pendingCloseTab"
      class="terminal-file-preview__dirty-confirm"
      role="dialog"
      aria-modal="true"
      :aria-label="text('关闭未保存文件', 'Close unsaved file')"
      @click.stop
    >
      <div class="terminal-file-preview__dirty-confirm-panel">
        <TriangleAlert class="terminal-file-preview__dirty-confirm-icon" aria-hidden="true" />
        <div class="terminal-file-preview__dirty-confirm-copy">
          <strong>{{ text('关闭未保存文件', 'Close unsaved file') }}</strong>
          <span>{{ pendingCloseMessage }}</span>
        </div>
        <div class="terminal-file-preview__dirty-confirm-actions">
          <button type="button" class="secondary-button compact-button" @click="cancelPendingClose">
            {{ text('取消', 'Cancel') }}
          </button>
          <button
            type="button"
            class="secondary-button compact-button terminal-file-preview__dirty-confirm-save"
            :disabled="pendingCloseSaving"
            @click="savePendingClose"
          >
            {{ pendingCloseSaving ? text('保存中', 'Saving') : text('保存并关闭', 'Save and close') }}
          </button>
          <button
            type="button"
            class="secondary-button compact-button terminal-file-preview__dirty-confirm-danger"
            :disabled="pendingCloseSaving"
            @click="confirmPendingClose"
          >
            {{ text('放弃修改', 'Discard') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {
  ChevronLeft,
  ChevronRight,
  Code2,
  Columns,
  Copy,
  Database,
  Download,
  Eye,
  FileArchive,
  FileAudio,
  FileBadge,
  FileBox,
  FileChartColumn,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileKey2,
  FileLock2,
  FileQuestion,
  FileScan,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  Files,
  FolderOpen,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PencilLine,
  RotateCcw,
  Save,
  Rows,
  Search,
  TerminalSquare,
  TriangleAlert,
  X,
  ZoomIn,
  ZoomOut,
} from '@lucide/vue';
import type { FilesReadPayload } from '../../../../../types/files';
import { copyTextToClipboard } from '../../shared/clipboard';
import { useLocalePreference } from '../../shared/locale';
import { useThemePreference } from '../../shared/theme';
import { buildFileDownloadUrl, readFileContent, saveFileContent } from '../files/api';
import type {
  TerminalFilePreviewTab,
  TerminalPreviewPlacement,
} from './terminal-file-preview';
import {
  resolveNextTerminalFilePreviewTabId,
  resolveTerminalFilePreviewTabWindow,
} from './terminal-file-preview';
import {
  TERMINAL_RESOURCE_DRAG_MIME,
  serializeTerminalResourceTransfer,
  type TerminalResourceTransferPayload,
} from './terminal-resource-transfer';
import {
  isTerminalFileKindEmbeddable,
  resolveTerminalFileKind,
  type TerminalFileKind,
} from './terminal-file-kind';

const AsyncCodeFileEditor = defineAsyncComponent(() => import('../files/CodeFileEditor.vue'));
const AsyncTerminalMarkdownPreview = defineAsyncComponent(() => import('./TerminalMarkdownPreview.vue'));

type TerminalFilePreviewMode = 'edit' | 'preview' | 'visual';
type TerminalRichPreviewKind = 'markdown' | 'html';
type TerminalFilePreviewModePreference = Record<TerminalRichPreviewKind, TerminalFilePreviewMode>;

const props = defineProps<{
  tabs: TerminalFilePreviewTab[];
  activeTabId: string;
  placement: TerminalPreviewPlacement;
  maximized: boolean;
  terminalCollapsed: boolean;
  workspaceFullscreen: boolean;
  surface?: 'terminal' | 'files';
}>();

const emit = defineEmits<{
  (e: 'select', tabId: string): void;
  (e: 'close', tabId?: string): void;
  (e: 'setPlacement', placement: TerminalPreviewPlacement): void;
  (e: 'reorder', payload: { tabId: string; targetIndex: number }): void;
  (e: 'toggleMaximize'): void;
  (e: 'toggleWorkspaceFullscreen'): void;
  (e: 'toggleTerminal'): void;
  (e: 'insertTerminalPaths', paths: string[]): void;
  (e: 'revealResource', payload: TerminalResourceTransferPayload): void;
}>();

const { text } = useLocalePreference();
const { resolvedTheme } = useThemePreference();
const searchRequest = ref(0);
const previewSwitcherRef = ref<HTMLDetailsElement | null>(null);
const previewActionMenuRef = ref<HTMLDetailsElement | null>(null);
const previewTabContextMenuRef = ref<HTMLElement | null>(null);
const previewSwitcherOpen = ref(false);
const previewActionMenuOpen = ref(false);
const draggedPreviewTabId = ref('');
const pendingCloseTabIds = ref<string[]>([]);
const pendingCloseSaving = ref(false);
const previewTabContextMenu = ref<{
  tabId: string;
  left: number;
  top: number;
} | null>(null);
const dropTarget = ref<{
  tabId: string;
  position: 'before' | 'after';
} | null>(null);
const TERMINAL_FILE_PREVIEW_DRAG_MIME = 'application/x-openclaw-terminal-file-preview-tab';
const PREVIEW_DIRECT_TAB_LIMIT = 7;
const FILE_PREVIEW_CONTEXT_MENU_WIDTH = 248;
const FILE_PREVIEW_CONTEXT_MENU_HEIGHT = 360;
const IMAGE_ZOOM_MIN = 0.2;
const IMAGE_ZOOM_MAX = 4;
const IMAGE_ZOOM_STEP = 0.2;
const FILE_PREVIEW_MODE_PREFERENCE_STORAGE_KEY = 'openclaw.terminal.filePreviewModePreference.v1';
const isFilesSurface = computed(() => props.surface === 'files');
const previewModePreference = reactive<TerminalFilePreviewModePreference>(
  readFilePreviewModePreference(),
);

interface TerminalFilePreviewState {
  loading: boolean;
  saving: boolean;
  loaded: boolean;
  errorMessage: string;
  payload: FilesReadPayload | null;
  draft: string;
  savedContent: string;
  previewMode: TerminalFilePreviewMode;
}

const previewStates = reactive<Record<string, TerminalFilePreviewState>>({});
const imageZoomByTab = reactive<Record<string, number>>({});
const imageFitByTab = reactive<Record<string, boolean>>({});
const imagePanByTab = reactive<Record<string, { x: number; y: number }>>({});
const imagePanDragging = ref(false);
let imagePanState: {
  pointerId: number;
  startX: number;
  startY: number;
  startPanX: number;
  startPanY: number;
} | null = null;

const placementOptions = computed(() => [
  { value: 'top' as const, label: text('预览在上方', 'Preview above'), icon: Rows },
  { value: 'right' as const, label: text('预览在右侧', 'Preview right'), icon: Columns },
  { value: 'bottom' as const, label: text('预览在下方', 'Preview below'), icon: Rows },
]);
const activeTab = computed(() =>
  props.tabs.find((tab) => tab.id === props.activeTabId) || null,
);
const activeState = computed(() =>
  activeTab.value ? previewStates[activeTab.value.id] || null : null,
);
const activePayload = computed(() => activeState.value?.payload || null);
const loading = computed(() => Boolean(activeState.value?.loading));
const errorMessage = computed(() => activeState.value?.errorMessage || '');
const activeCanEdit = computed(() =>
  Boolean(
    activePayload.value?.editable &&
    activePayload.value?.content != null &&
    !activePayload.value.imageLike &&
    !activePayload.value.truncated,
  ),
);
const activeRichPreviewKind = computed<TerminalRichPreviewKind | null>(() => {
  const payload = activePayload.value;
  if (payload && payload.content == null) return null;
  return resolveRichPreviewKind(payload || activeTab.value);
});
const activeSupportsRichPreview = computed(() =>
  Boolean(activePayload.value?.content != null && activeRichPreviewKind.value),
);
const activePreviewMode = computed<TerminalFilePreviewMode>(() => {
  if (!activeSupportsRichPreview.value) return 'edit';
  const mode = activeState.value?.previewMode || 'edit';
  if (mode === 'visual' && activeRichPreviewKind.value !== 'markdown') return 'preview';
  if (mode === 'visual' && !activeCanEdit.value) return 'preview';
  return mode;
});
const activeDirty = computed(() => {
  const state = activeState.value;
  return Boolean(state && state.draft !== state.savedContent);
});
const activeDraft = computed({
  get: () => activeState.value?.draft || '',
  set: (value: string) => {
    const state = activeState.value;
    if (!state) return;
    state.draft = value;
    state.errorMessage = '';
  },
});
const downloadUrl = computed(() => {
  const tab = activeTab.value;
  return tab ? buildFileDownloadUrl(tab.rootId, tab.path) : '';
});
const downloadAttachmentUrl = computed(() => {
  const tab = activeTab.value;
  return tab ? buildFileDownloadUrl(tab.rootId, tab.path, { download: true }) : '';
});
const activeFileKind = computed<TerminalFileKind | null>(() => {
  const payload = activePayload.value;
  if (payload) return resolveTerminalFileKind(payload);
  const tab = activeTab.value;
  return tab ? resolveTerminalFileKind(tab) : null;
});
const activeInlineMediaKind = computed<TerminalFileKind | null>(() =>
  isTerminalFileKindEmbeddable(activeFileKind.value) ? activeFileKind.value : null,
);
const activeBinaryPreviewVisible = computed(() =>
  Boolean(
    activePayload.value &&
    activePayload.value.content == null &&
    !activePayload.value.imageLike &&
    !activeInlineMediaKind.value,
  ),
);
const activePreviewFileIcon = computed(() =>
  activeTab.value ? resolvePreviewFileIcon(activeTab.value) : FileText,
);
const activePreviewFileIconClass = computed(() =>
  activeFileKind.value ? `terminal-file-preview__icon--${activeFileKind.value}` : '',
);
const activeFileKindLabel = computed(() =>
  fileKindLabel(activeFileKind.value),
);
const activeMediaMetaLabel = computed(() => {
  const payload = activePayload.value;
  if (!payload) return '';
  return [
    payload.mimeType || fileKindLabel(activeFileKind.value),
    formatFileSize(payload.size),
    payload.modifiedAt ? formatModifiedTime(payload.modifiedAt) : '',
  ].filter(Boolean).join(' · ');
});
const fontPreviewSrcdoc = computed(() =>
  buildFontPreviewSrcdoc(
    downloadUrl.value,
    activePayload.value?.name || activeTab.value?.name || 'font',
    resolvedTheme.value === 'dark',
  ),
);
const previewMetaLabel = computed(() => {
  const payload = activePayload.value;
  if (!payload) return text('文件预览', 'File preview');
  const parts = [
    payload.ext || text('文件', 'File'),
    formatFileSize(payload.size),
    payload.truncated ? text('已截断', 'Truncated') : '',
    activeStatusLabel.value,
  ].filter(Boolean);
  return parts.join(' · ');
});
const activeStatusLabel = computed(() => {
  const state = activeState.value;
  if (state?.saving) return text('保存中', 'Saving');
  if (activeDirty.value) return text('未保存', 'Unsaved');
  if (activeCanEdit.value) return text('可编辑', 'Editable');
  if (activePayload.value?.editable) return text('只读', 'Read only');
  return activePayload.value?.textLike ? text('文本', 'Text') : text('只读', 'Read only');
});
const saveButtonLabel = computed(() => {
  if (activeState.value?.saving) return text('保存中', 'Saving');
  if (activeDirty.value) return text('保存文件', 'Save file');
  return text('已保存', 'Saved');
});
const previewModeButtonLabel = computed(() =>
  activePreviewMode.value === 'preview'
    ? text('开启所见即所得编辑', 'Enable visual editing')
    : activePreviewMode.value === 'visual'
      ? text('切回源码编辑', 'Back to source editing')
      : text('预览渲染结果', 'Preview rendered output'),
);
const htmlPreviewSrcdoc = computed(() => {
  const tab = activeTab.value;
  return buildHtmlPreviewSrcdoc(
    activeDraft.value,
    activePayload.value?.name || tab?.name || 'preview.html',
    tab,
  );
});
const activeImageTabId = computed(() =>
  activePayload.value?.imageLike ? activeTab.value?.id || '' : '',
);
const activeImageFit = computed(() => {
  const tabId = activeImageTabId.value;
  return tabId ? imageFitByTab[tabId] !== false : true;
});
const activeImageZoom = computed(() => {
  const tabId = activeImageTabId.value;
  return clampImageZoom(tabId ? imageZoomByTab[tabId] : 1);
});
const activeImageZoomPercent = computed(() =>
  `${Math.round(activeImageZoom.value * 100)}%`,
);
const activeImagePan = computed(() => {
  const tabId = activeImageTabId.value;
  return tabId ? imagePanByTab[tabId] || { x: 0, y: 0 } : { x: 0, y: 0 };
});
const activeImageStyle = computed(() => ({
  transform: `translate3d(${activeImagePan.value.x}px, ${activeImagePan.value.y}px, 0) scale(${activeImageZoom.value})`,
  transformOrigin: 'center center',
}));
const activeImagePannable = computed(() =>
  Boolean(activeImageTabId.value && !activeImageFit.value),
);
const activePreviewTitle = computed(() =>
  filePreviewTabTitle(activeTab.value),
);
const visiblePreviewWindow = computed(() =>
  resolveTerminalFilePreviewTabWindow(props.tabs, props.activeTabId, PREVIEW_DIRECT_TAB_LIMIT),
);
const visiblePreviewTabs = computed(() => visiblePreviewWindow.value.visibleTabs);
const hiddenPreviewBeforeCount = computed(() => visiblePreviewWindow.value.hiddenBeforeCount);
const hiddenPreviewAfterCount = computed(() => visiblePreviewWindow.value.hiddenAfterCount);
const hiddenPreviewTabCount = computed(() =>
  visiblePreviewWindow.value.hiddenCount,
);
const previewTabbarClasses = computed(() => ({
  'terminal-file-preview__tabs--dense': props.tabs.length >= 6,
  'terminal-file-preview__tabs--crowded': props.tabs.length >= 10,
  'terminal-file-preview__tabs--windowed': hiddenPreviewTabCount.value > 0,
}));
const savedTabIds = computed(() =>
  props.tabs.filter((tab) => !isTabDirty(tab.id)).map((tab) => tab.id),
);
const dirtyTabIds = computed(() =>
  props.tabs
    .filter((tab) => canSaveTabState(tab, previewStates[tab.id]))
    .map((tab) => tab.id),
);
const pendingCloseTabs = computed(() =>
  pendingCloseTabIds.value
    .map((tabId) => props.tabs.find((tab) => tab.id === tabId) || null)
    .filter((tab): tab is TerminalFilePreviewTab => Boolean(tab)),
);
const pendingCloseTab = computed(() =>
  pendingCloseTabs.value[0] || null,
);
const pendingCloseFileName = computed(() =>
  pendingCloseTab.value?.name || text('当前文件', 'the current file'),
);
const pendingCloseDirtyCount = computed(() =>
  pendingCloseTabIds.value.filter((tabId) => isTabDirty(tabId)).length,
);
const pendingCloseMessage = computed(() => {
  const total = pendingCloseTabIds.value.length;
  const dirtyCount = pendingCloseDirtyCount.value;
  if (total <= 1) {
    return text(
      `关闭 ${pendingCloseFileName.value} 会丢失未保存的修改。`,
      `Closing ${pendingCloseFileName.value} will discard unsaved changes.`,
    );
  }
  return text(
    `关闭 ${total} 个文件会丢失 ${dirtyCount} 个未保存修改。`,
    `Closing ${total} files will discard ${dirtyCount} unsaved change(s).`,
  );
});
const contextMenuTab = computed(() =>
  previewTabContextMenu.value
    ? props.tabs.find((tab) => tab.id === previewTabContextMenu.value?.tabId) || null
    : null,
);
const contextMenuTabIndex = computed(() =>
  contextMenuTab.value ? previewTabIndex(contextMenuTab.value.id) : -1,
);
const contextMenuTabDownloadUrl = computed(() =>
  contextMenuTab.value ? buildFileDownloadUrl(contextMenuTab.value.rootId, contextMenuTab.value.path) : '',
);
const previewTabContextMenuStyle = computed(() => {
  if (!previewTabContextMenu.value) return {};
  return {
    left: `${previewTabContextMenu.value.left}px`,
    top: `${previewTabContextMenu.value.top}px`,
  };
});

watch(
  () => activeTab.value?.id || '',
  () => {
    void loadActivePreview();
  },
  { immediate: true },
);

watch(
  () => props.tabs.map((tab) => tab.id).join('\n'),
  () => {
    const activeIds = new Set(props.tabs.map((tab) => tab.id));
    for (const tabId of Object.keys(previewStates)) {
      if (!activeIds.has(tabId)) {
        delete previewStates[tabId];
        delete imageZoomByTab[tabId];
        delete imageFitByTab[tabId];
        delete imagePanByTab[tabId];
      }
    }
    if (pendingCloseTabIds.value.length) {
      pendingCloseTabIds.value = pendingCloseTabIds.value.filter((tabId) => activeIds.has(tabId));
    }
  },
);

function readFilePreviewModePreference(): TerminalFilePreviewModePreference {
  const fallback: TerminalFilePreviewModePreference = {
    markdown: 'edit',
    html: 'edit',
  };
  if (typeof window === 'undefined') return fallback;
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(FILE_PREVIEW_MODE_PREFERENCE_STORAGE_KEY) || '{}') as Partial<TerminalFilePreviewModePreference>;
    return {
      markdown: normalizePreviewModeForKind(parsed.markdown, 'markdown'),
      html: normalizePreviewModeForKind(parsed.html, 'html'),
    };
  } catch {
    return fallback;
  }
}

function persistPreviewModePreference(kind: TerminalRichPreviewKind, mode: TerminalFilePreviewMode): void {
  const normalizedMode = normalizePreviewModeForKind(mode, kind);
  previewModePreference[kind] = normalizedMode;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(
      FILE_PREVIEW_MODE_PREFERENCE_STORAGE_KEY,
      JSON.stringify({
        markdown: previewModePreference.markdown,
        html: previewModePreference.html,
      }),
    );
  } catch {
    // Preference persistence is optional; preview switching must still work.
  }
}

function resolveDefaultPreviewMode(input: Partial<FilesReadPayload & TerminalFilePreviewTab> | null): TerminalFilePreviewMode {
  const kind = resolveRichPreviewKind(input);
  return normalizePreviewModeForKind(kind ? previewModePreference[kind] : 'edit', kind);
}

function normalizePreviewModeForKind(
  mode: unknown,
  kind: TerminalRichPreviewKind | null,
): TerminalFilePreviewMode {
  const normalizedMode = mode === 'preview' || mode === 'visual' || mode === 'edit' ? mode : 'edit';
  if (!kind) return 'edit';
  if (kind === 'html' && normalizedMode === 'visual') return 'preview';
  return normalizedMode;
}

function resolveRichPreviewKind(
  input: Partial<FilesReadPayload & TerminalFilePreviewTab> | null,
): TerminalRichPreviewKind | null {
  if (!input) return null;
  const extension = String((input as Partial<FilesReadPayload>).ext || readFileExtension(input.name || input.path || '')).toLowerCase();
  const name = String(input.name || input.path || '').toLowerCase();
  if (extension === '.md' || extension === '.markdown' || extension === '.mdx' || name.endsWith('.md')) {
    return 'markdown';
  }
  if (extension === '.html' || extension === '.htm' || extension === '.xhtml') {
    return 'html';
  }
  return null;
}

function readFileExtension(value: string | undefined): string {
  const normalized = String(value || '').toLowerCase();
  const basename = normalized.split('/').pop() || normalized;
  const dotIndex = basename.lastIndexOf('.');
  return dotIndex > 0 ? basename.slice(dotIndex) : '';
}

function ensurePreviewState(tab: TerminalFilePreviewTab): TerminalFilePreviewState {
  if (!previewStates[tab.id]) {
    previewStates[tab.id] = {
      loading: false,
      saving: false,
      loaded: false,
      errorMessage: '',
      payload: null,
      draft: '',
      savedContent: '',
      previewMode: resolveDefaultPreviewMode(tab),
    };
  }
  return previewStates[tab.id];
}

async function loadActivePreview(): Promise<void> {
  const tab = activeTab.value;
  if (!tab) {
    return;
  }
  const state = ensurePreviewState(tab);
  if (state.loaded || state.loading) return;
  state.errorMessage = '';
  state.loading = true;
  try {
    const payload = await readFileContent(tab.rootId, tab.path);
    state.payload = payload;
    state.savedContent = payload.content || '';
    state.draft = payload.content || '';
    state.previewMode = normalizePreviewModeForKind(
      state.previewMode || resolveDefaultPreviewMode(payload || tab),
      resolveRichPreviewKind(payload || tab),
    );
    state.loaded = true;
  } catch (error) {
    state.errorMessage = error instanceof Error
      ? error.message
      : text('文件读取失败', 'Failed to read file');
  } finally {
    state.loading = false;
  }
}

async function saveActiveFile(): Promise<void> {
  const tab = activeTab.value;
  if (!tab) return;
  await savePreviewTab(tab);
}

async function savePreviewTab(tab: TerminalFilePreviewTab): Promise<boolean> {
  const state = previewStates[tab.id];
  if (!canSaveTabState(tab, state)) return false;
  const payload = state.payload;
  if (!payload) return false;
  state.saving = true;
  state.errorMessage = '';
  try {
    await saveFileContent({
      rootId: tab.rootId,
      path: payload.path || tab.path,
      content: state.draft,
    });
    state.savedContent = state.draft;
    state.payload = {
      ...payload,
      content: state.draft,
      size: new TextEncoder().encode(state.draft).length,
      checkedAt: new Date().toISOString(),
      truncated: false,
    };
    if (pendingCloseTabIds.value.includes(tab.id)) {
      pendingCloseTabIds.value = pendingCloseTabIds.value.filter((tabId) => tabId !== tab.id);
    }
    return true;
  } catch (error) {
    state.errorMessage = error instanceof Error
      ? error.message
      : text('保存文件失败', 'Failed to save file');
    return false;
  } finally {
    state.saving = false;
  }
}

async function saveDirtyFiles(): Promise<void> {
  for (const tab of props.tabs) {
    await savePreviewTab(tab);
  }
}

async function savePendingClose(): Promise<void> {
  if (pendingCloseSaving.value) return;
  const tabIds = [...pendingCloseTabIds.value];
  if (!tabIds.length) return;

  pendingCloseSaving.value = true;
  const failedTabIds: string[] = [];
  try {
    for (const tabId of tabIds) {
      const tab = props.tabs.find((candidate) => candidate.id === tabId) || null;
      if (!tab) continue;
      if (!isTabDirty(tab.id)) continue;
      const saved = await savePreviewTab(tab);
      if (!saved && isTabDirty(tab.id)) {
        failedTabIds.push(tab.id);
      }
    }
  } finally {
    pendingCloseSaving.value = false;
  }

  if (failedTabIds.length) {
    pendingCloseTabIds.value = failedTabIds;
    return;
  }

  pendingCloseTabIds.value = [];
  closePreviewTabs(tabIds);
}

function saveDirtyFilesFromMenu(): void {
  void saveDirtyFiles();
  closePreviewActionMenu();
}

function resetActiveDraft(): void {
  const state = activeState.value;
  if (!state || state.saving) return;
  state.draft = state.savedContent;
  state.errorMessage = '';
}

function resetActiveDraftFromMenu(): void {
  resetActiveDraft();
  closePreviewActionMenu();
}

function requestEditorSearch(): void {
  if (activePayload.value?.content == null) return;
  searchRequest.value += 1;
}

function requestEditorSearchFromMenu(): void {
  requestEditorSearch();
  closePreviewActionMenu();
}

function toggleActivePreviewMode(): void {
  const state = activeState.value;
  if (!state || !activeSupportsRichPreview.value) return;
  const kind = activeRichPreviewKind.value;
  if (!kind) return;
  if (state.previewMode === 'edit') {
    state.previewMode = 'preview';
  } else if (state.previewMode === 'preview' && activeRichPreviewKind.value === 'markdown' && activeCanEdit.value) {
    state.previewMode = 'visual';
  } else {
    state.previewMode = 'edit';
  }
  persistPreviewModePreference(kind, state.previewMode);
  closePreviewOverlays();
}

function setActiveImageZoom(nextZoom: number, fit: boolean): void {
  const tabId = activeImageTabId.value;
  if (!tabId) return;
  imageZoomByTab[tabId] = clampImageZoom(nextZoom);
  imageFitByTab[tabId] = fit;
  if (fit) setImagePan(tabId, 0, 0);
}

function zoomActiveImage(delta: number): void {
  const tabId = activeImageTabId.value;
  if (!tabId) return;
  const previousZoom = activeImageZoom.value;
  const nextZoom = clampImageZoom(previousZoom + delta);
  const scaleRatio = nextZoom / previousZoom;
  const pan = activeImagePan.value;
  setActiveImageZoom(nextZoom, false);
  setImagePan(tabId, pan.x * scaleRatio, pan.y * scaleRatio);
}

function fitActiveImage(): void {
  setActiveImageZoom(1, true);
}

function resetActiveImageZoom(): void {
  setActiveImageZoom(1, false);
  const tabId = activeImageTabId.value;
  if (tabId) setImagePan(tabId, 0, 0);
}

function zoomActiveImageFromWheel(event: WheelEvent): void {
  const tabId = activeImageTabId.value;
  if (!tabId) return;
  const previousZoom = activeImageZoom.value;
  const nextZoom = clampImageZoom(previousZoom + (event.deltaY > 0 ? -IMAGE_ZOOM_STEP : IMAGE_ZOOM_STEP));
  const stage = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!stage || nextZoom === previousZoom) {
    setActiveImageZoom(nextZoom, false);
    return;
  }
  const canvas = stage.querySelector('.terminal-file-preview__image-canvas');
  const rect = (canvas instanceof HTMLElement ? canvas : stage).getBoundingClientRect();
  const pointX = event.clientX - rect.left - rect.width / 2;
  const pointY = event.clientY - rect.top - rect.height / 2;
  const pan = activeImagePan.value;
  const scaleRatio = nextZoom / previousZoom;
  setActiveImageZoom(nextZoom, false);
  setImagePan(
    tabId,
    pointX - (pointX - pan.x) * scaleRatio,
    pointY - (pointY - pan.y) * scaleRatio,
  );
}

function startImagePan(event: PointerEvent): void {
  if (!activeImagePannable.value || event.button !== 0) return;
  const stage = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!stage || event.target instanceof HTMLElement && event.target.closest('.terminal-file-preview__image-toolbar')) return;
  const pan = activeImagePan.value;
  imagePanState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    startPanX: pan.x,
    startPanY: pan.y,
  };
  imagePanDragging.value = true;
  stage.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function moveImagePan(event: PointerEvent): void {
  const state = imagePanState;
  const stage = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!state || !stage || state.pointerId !== event.pointerId) return;
  const tabId = activeImageTabId.value;
  if (!tabId) return;
  setImagePan(
    tabId,
    state.startPanX + event.clientX - state.startX,
    state.startPanY + event.clientY - state.startY,
  );
  event.preventDefault();
}

function endImagePan(event: PointerEvent): void {
  const state = imagePanState;
  const stage = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!state || state.pointerId !== event.pointerId) return;
  stage?.releasePointerCapture?.(event.pointerId);
  imagePanState = null;
  imagePanDragging.value = false;
}

function setImagePan(tabId: string, x: number, y: number): void {
  imagePanByTab[tabId] = {
    x: normalizeImagePanOffset(x),
    y: normalizeImagePanOffset(y),
  };
}

function selectPreviewTab(tabId: string): void {
  emit('select', tabId);
  closePreviewSwitcher();
}

function selectHiddenPreviewTab(direction: -1 | 1): void {
  const window = visiblePreviewWindow.value;
  const targetIndex = direction < 0
    ? Math.max(0, window.startIndex - 1)
    : Math.min(props.tabs.length - 1, window.endIndex);
  const targetTab = props.tabs[targetIndex] || null;
  if (!targetTab) return;
  emit('select', targetTab.id);
  closePreviewOverlays();
}

function selectRelativePreviewTab(direction: -1 | 1): boolean {
  const nextTabId = resolveNextTerminalFilePreviewTabId(
    props.tabs,
    props.activeTabId,
    direction,
  );
  if (!nextTabId || nextTabId === props.activeTabId) return false;
  emit('select', nextTabId);
  closePreviewOverlays();
  return true;
}

function selectPreviewTabByIndex(index: number): boolean {
  const tab = props.tabs[index] || null;
  if (!tab || tab.id === props.activeTabId) return false;
  emit('select', tab.id);
  closePreviewOverlays();
  void nextTick(() => focusPreviewTabButton(tab.id));
  return true;
}

function focusPreviewTabButton(tabId: string): void {
  const button = document.querySelector<HTMLButtonElement>(
    `[data-preview-tab-id="${cssEscapePreviewValue(tabId)}"]`,
  );
  button?.focus();
}

function cssEscapePreviewValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function startPreviewTabDrag(event: DragEvent, tab: TerminalFilePreviewTab): void {
  closePreviewOverlays();
  draggedPreviewTabId.value = tab.id;
  dropTarget.value = null;
  event.dataTransfer?.setData(TERMINAL_FILE_PREVIEW_DRAG_MIME, tab.id);
  const resourcePayload = buildPreviewTabResourcePayload(tab);
  if (resourcePayload) {
    event.dataTransfer?.setData(
      TERMINAL_RESOURCE_DRAG_MIME,
      serializeTerminalResourceTransfer(resourcePayload),
    );
    event.dataTransfer?.setData('text/plain', resourcePayload.absolutePath);
  } else {
    event.dataTransfer?.setData('text/plain', tab.id);
  }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove';
  }
}

function handlePreviewTabDragOver(event: DragEvent, tab: TerminalFilePreviewTab): void {
  const sourceId = readDraggedPreviewTabId(event);
  if (!sourceId || sourceId === tab.id) {
    dropTarget.value = null;
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dropTarget.value = {
    tabId: tab.id,
    position: resolvePreviewTabDropPosition(event),
  };
}

function dropPreviewTab(event: DragEvent, tab: TerminalFilePreviewTab): void {
  const sourceId = readDraggedPreviewTabId(event);
  const position = dropTarget.value?.tabId === tab.id
    ? dropTarget.value.position
    : resolvePreviewTabDropPosition(event);
  endPreviewTabDrag();
  reorderPreviewTab(sourceId, tab.id, position);
}

function endPreviewTabDrag(): void {
  draggedPreviewTabId.value = '';
  dropTarget.value = null;
}

function handlePreviewTabAuxClick(event: MouseEvent, tab: TerminalFilePreviewTab): void {
  if (event.button !== 1) return;
  requestCloseTab(tab.id);
}

function handlePreviewTabKeydown(event: KeyboardEvent, tab: TerminalFilePreviewTab): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('select', tab.id);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    selectPreviewTabByIndex(Math.max(0, previewTabIndex(tab.id) - 1));
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    selectPreviewTabByIndex(Math.min(props.tabs.length - 1, previewTabIndex(tab.id) + 1));
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    selectPreviewTabByIndex(0);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    selectPreviewTabByIndex(props.tabs.length - 1);
    return;
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    openPreviewTabContextMenuFromKeyboard(event, tab);
  }
}

function readDraggedPreviewTabId(event: DragEvent): string {
  const fromEvent = event.dataTransfer?.getData(TERMINAL_FILE_PREVIEW_DRAG_MIME)
    || event.dataTransfer?.getData('text/plain')
    || '';
  return String(fromEvent || draggedPreviewTabId.value || '').trim();
}

function resolvePreviewTabDropPosition(event: DragEvent): 'before' | 'after' {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!target) return 'after';
  const rect = target.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function reorderPreviewTab(sourceId: string, targetId: string, position: 'before' | 'after'): void {
  const normalizedSourceId = String(sourceId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedSourceId || !normalizedTargetId || normalizedSourceId === normalizedTargetId) return;

  const orderedIds = props.tabs.map((tab) => tab.id);
  const sourceIndex = orderedIds.indexOf(normalizedSourceId);
  const targetIndex = orderedIds.indexOf(normalizedTargetId);
  if (sourceIndex < 0 || targetIndex < 0) return;

  let insertionIndex = targetIndex + (position === 'after' ? 1 : 0);
  if (sourceIndex < insertionIndex) {
    insertionIndex -= 1;
  }
  const maxIndex = Math.max(0, orderedIds.length - 1);
  const boundedIndex = Math.max(0, Math.min(maxIndex, insertionIndex));
  if (boundedIndex === sourceIndex) return;

  emit('reorder', {
    tabId: normalizedSourceId,
    targetIndex: boundedIndex,
  });
}

function setPreviewPlacement(placement: TerminalPreviewPlacement): void {
  emit('setPlacement', placement);
  closePreviewActionMenu();
}

function toggleTerminalFromMenu(): void {
  emit('toggleTerminal');
  closePreviewActionMenu();
}

function toggleWorkspaceFullscreenFromMenu(): void {
  emit('toggleWorkspaceFullscreen');
  closePreviewActionMenu();
}

function closeActiveFileFromMenu(): void {
  closePreviewActionMenu();
  requestCloseTab();
}

function closeSavedFilesFromMenu(): void {
  closePreviewActionMenu();
  requestCloseTabs(savedTabIds.value);
}

function closeOtherFilesFromMenu(): void {
  const activeId = activeTab.value?.id || '';
  const tabIds = props.tabs
    .map((tab) => tab.id)
    .filter((tabId) => tabId !== activeId);
  closePreviewActionMenu();
  requestCloseTabs(tabIds);
}

function closeAllFilesFromMenu(): void {
  closePreviewActionMenu();
  requestCloseTabs(props.tabs.map((tab) => tab.id));
}

function openPreviewTabContextMenu(event: MouseEvent, tab: TerminalFilePreviewTab): void {
  closePreviewSwitcher();
  closePreviewActionMenu();
  emit('select', tab.id);
  previewTabContextMenu.value = {
    tabId: tab.id,
    ...resolvePreviewTabContextMenuPosition(event.clientX, event.clientY),
  };
}

function openPreviewTabContextMenuFromKeyboard(event: KeyboardEvent, tab: TerminalFilePreviewTab): void {
  closePreviewSwitcher();
  closePreviewActionMenu();
  emit('select', tab.id);
  const target = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : document.querySelector<HTMLElement>(`[data-preview-tab-id="${cssEscapePreviewValue(tab.id)}"]`) || null;
  const rect = target?.getBoundingClientRect();
  previewTabContextMenu.value = {
    tabId: tab.id,
    ...resolvePreviewTabContextMenuPosition(
      rect?.left ?? 16,
      (rect?.bottom ?? 64) + 6,
    ),
  };
}

function resolvePreviewTabContextMenuPosition(
  rawLeft: number,
  rawTop: number,
): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined'
    ? rawLeft + FILE_PREVIEW_CONTEXT_MENU_WIDTH
    : window.innerWidth;
  const viewportHeight = typeof window === 'undefined'
    ? rawTop + FILE_PREVIEW_CONTEXT_MENU_HEIGHT
    : window.innerHeight;
  return {
    left: clampNumber(rawLeft, 8, Math.max(8, viewportWidth - FILE_PREVIEW_CONTEXT_MENU_WIDTH - 8)),
    top: clampNumber(rawTop, 8, Math.max(8, viewportHeight - FILE_PREVIEW_CONTEXT_MENU_HEIGHT - 8)),
  };
}

async function copyContextTabPath(): Promise<void> {
  const absolutePath = contextMenuTab.value?.absolutePath || '';
  if (!absolutePath) return;
  await copyTextToClipboard(absolutePath);
  closePreviewTabContextMenu();
}

async function copyContextTabRelativePath(): Promise<void> {
  const relativePath = contextMenuTab.value?.path || '';
  if (!relativePath) return;
  await copyTextToClipboard(relativePath);
  closePreviewTabContextMenu();
}

function insertContextTabPathInTerminal(): void {
  const absolutePath = contextMenuTab.value?.absolutePath || '';
  if (!absolutePath) return;
  emit('insertTerminalPaths', [absolutePath]);
  closePreviewTabContextMenu();
}

function insertActiveTabPathInTerminal(): boolean {
  const absolutePath = activeTab.value?.absolutePath || '';
  if (!absolutePath) return false;
  emit('insertTerminalPaths', [absolutePath]);
  closePreviewOverlays();
  return true;
}

function copyActiveTabRelativePath(): boolean {
  const relativePath = activeTab.value?.path || '';
  if (!relativePath) return false;
  void copyTextToClipboard(relativePath);
  closePreviewOverlays();
  return true;
}

function revealActiveFileFromMenu(): void {
  const payload = buildPreviewTabResourcePayload(activeTab.value);
  if (!payload) return;
  emit('revealResource', payload);
  closePreviewActionMenu();
}

function revealContextTabInExplorer(): void {
  const payload = buildPreviewTabResourcePayload(contextMenuTab.value);
  if (!payload) return;
  emit('revealResource', payload);
  closePreviewTabContextMenu();
}

function buildPreviewTabResourcePayload(
  tab: TerminalFilePreviewTab | null,
): TerminalResourceTransferPayload | null {
  if (!tab?.rootId || !tab.path) return null;
  return {
    rootId: tab.rootId,
    path: tab.path,
    absolutePath: tab.absolutePath,
    kind: 'file',
    name: tab.name,
  };
}

function closeContextTab(): void {
  const tabId = contextMenuTab.value?.id || '';
  closePreviewTabContextMenu();
  requestCloseTab(tabId);
}

function closeOtherContextTabs(): void {
  const tabId = contextMenuTab.value?.id || '';
  closePreviewTabContextMenu();
  requestCloseTabs(props.tabs.map((tab) => tab.id).filter((candidateId) => candidateId !== tabId));
}

function closeContextTabsToRight(): void {
  const tabId = contextMenuTab.value?.id || '';
  closePreviewTabContextMenu();
  closeTabsToRight(tabId);
}

function closeSavedContextTabs(): void {
  closePreviewTabContextMenu();
  requestCloseTabs(savedTabIds.value);
}

function closeAllContextTabs(): void {
  closePreviewTabContextMenu();
  requestCloseTabs(props.tabs.map((tab) => tab.id));
}

function closePreviewSwitcher(): void {
  previewSwitcherOpen.value = false;
  previewSwitcherRef.value?.removeAttribute('open');
}

function togglePreviewSwitcher(): void {
  previewSwitcherOpen.value = !previewSwitcherOpen.value;
  if (previewSwitcherOpen.value) {
    closePreviewActionMenu();
    closePreviewTabContextMenu();
  }
}

function syncPreviewSwitcherState(): void {
  previewSwitcherOpen.value = Boolean(previewSwitcherRef.value?.open);
}

function closePreviewActionMenu(): void {
  previewActionMenuOpen.value = false;
  previewActionMenuRef.value?.removeAttribute('open');
}

function togglePreviewActionMenu(): void {
  previewActionMenuOpen.value = !previewActionMenuOpen.value;
  if (previewActionMenuOpen.value) {
    closePreviewSwitcher();
    closePreviewTabContextMenu();
  }
}

function syncPreviewActionMenuState(): void {
  previewActionMenuOpen.value = Boolean(previewActionMenuRef.value?.open);
}

function closePreviewOverlays(): void {
  closePreviewSwitcher();
  closePreviewActionMenu();
  closePreviewTabContextMenu();
}

function closePreviewOverlaysFromOutside(event: Event): void {
  const target = event.target;
  if (
    target instanceof Node &&
    (
      previewSwitcherRef.value?.contains(target) ||
      previewActionMenuRef.value?.contains(target) ||
      previewTabContextMenuRef.value?.contains(target)
    )
  ) {
    return;
  }
  closePreviewOverlays();
}

function closePreviewTabContextMenu(): void {
  previewTabContextMenu.value = null;
}

function requestCloseTab(tabId = activeTab.value?.id || ''): void {
  requestCloseTabs([tabId]);
}

function closeTabsToRight(tabId: string): void {
  const index = previewTabIndex(tabId);
  if (index < 0 || index >= props.tabs.length - 1) return;
  requestCloseTabs(props.tabs.slice(index + 1).map((tab) => tab.id));
}

function requestCloseTabs(tabIds: string[]): void {
  const existingIds = new Set(props.tabs.map((tab) => tab.id));
  const normalizedTabIds = Array.from(new Set(
    tabIds
      .map((tabId) => String(tabId || '').trim())
      .filter((tabId) => tabId && existingIds.has(tabId)),
  ));
  if (!normalizedTabIds.length) return;
  if (normalizedTabIds.some((tabId) => isTabDirty(tabId))) {
    closePreviewOverlays();
    pendingCloseTabIds.value = normalizedTabIds;
    return;
  }
  closePreviewTabs(normalizedTabIds);
}

function closePreviewTabs(tabIds: string[]): void {
  for (const tabId of tabIds) {
    emit('close', tabId);
  }
}

function confirmPendingClose(): void {
  if (pendingCloseSaving.value) return;
  const tabIds = pendingCloseTabIds.value;
  pendingCloseTabIds.value = [];
  closePreviewTabs(tabIds);
}

function cancelPendingClose(): void {
  if (pendingCloseSaving.value) return;
  pendingCloseTabIds.value = [];
}

function handlePreviewKeydown(event: KeyboardEvent): void {
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (pendingCloseTabIds.value.length) {
      event.preventDefault();
      cancelPendingClose();
    }
    endPreviewTabDrag();
    closePreviewOverlays();
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (key === 'pageup' || key === 'pagedown') {
    if (selectRelativePreviewTab(key === 'pageup' ? -1 : 1)) {
      event.preventDefault();
    }
    return;
  }
  if (key === 'tab') {
    if (selectRelativePreviewTab(event.shiftKey ? -1 : 1)) {
      event.preventDefault();
    }
    return;
  }
  if (key === 'enter' && !event.shiftKey) {
    if (insertActiveTabPathInTerminal()) {
      event.preventDefault();
    }
    return;
  }
  if (key === 'c' && event.shiftKey) {
    if (copyActiveTabRelativePath()) {
      event.preventDefault();
    }
    return;
  }
  if (key === 's') {
    event.preventDefault();
    if (event.shiftKey) {
      void saveDirtyFiles();
    } else {
      void saveActiveFile();
    }
    return;
  }
  if (key === 'f') {
    if (activePayload.value?.content == null) return;
    event.preventDefault();
    requestEditorSearch();
    closePreviewOverlays();
    return;
  }
  if (key === 'w') {
    event.preventDefault();
    requestCloseTab();
  }
}

function handlePreviewBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirtyTabIds.value.length) return;
  event.preventDefault();
  event.returnValue = '';
}

onMounted(() => {
  document.addEventListener('pointerdown', closePreviewOverlaysFromOutside, true);
  document.addEventListener('focusin', closePreviewOverlaysFromOutside, true);
  window.addEventListener('resize', closePreviewOverlays);
  window.addEventListener('beforeunload', handlePreviewBeforeUnload);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closePreviewOverlaysFromOutside, true);
  document.removeEventListener('focusin', closePreviewOverlaysFromOutside, true);
  window.removeEventListener('resize', closePreviewOverlays);
  window.removeEventListener('beforeunload', handlePreviewBeforeUnload);
});

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampImageZoom(value: number): number {
  const normalizedZoom = Number.isFinite(value) ? value : 1;
  return Math.round(clampNumber(normalizedZoom, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX) * 100) / 100;
}

function normalizeImagePanOffset(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0;
}

function isTabDirty(tabId: string): boolean {
  const state = previewStates[tabId];
  return Boolean(state && state.draft !== state.savedContent);
}

function canSaveTabState(tab: TerminalFilePreviewTab, state: TerminalFilePreviewState | undefined): state is TerminalFilePreviewState {
  const payload = state?.payload;
  return Boolean(
    tab &&
    state &&
    payload &&
    payload.editable &&
    payload.content != null &&
    !payload.imageLike &&
    !payload.truncated &&
    !state.saving &&
    state.draft !== state.savedContent,
  );
}

function previewTabIndex(tabId: string): number {
  return props.tabs.findIndex((tab) => tab.id === tabId);
}

function resolvePreviewFileIcon(tab: TerminalFilePreviewTab) {
  const kind = resolvePreviewFileKind(tab);
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
  if (kind === 'script') return TerminalSquare;
  if (kind === 'spreadsheet') return FileSpreadsheet;
  if (kind === 'style') return FileCog;
  if (kind === 'test') return FileScan;
  if (kind === 'video') return FileVideo;
  return FileText;
}

function resolvePreviewFileIconClass(tab: TerminalFilePreviewTab): string {
  return `terminal-file-preview__icon--${resolvePreviewFileKind(tab)}`;
}

function resolvePreviewFileKind(tab: TerminalFilePreviewTab): TerminalFileKind {
  const state = previewStates[tab.id];
  if (state?.payload) return resolveTerminalFileKind(state.payload);
  return resolveTerminalFileKind(tab);
}

function fileKindLabel(kind: TerminalFileKind | null): string {
  if (kind === 'archive') return text('压缩包', 'Archive');
  if (kind === 'audio') return text('音频', 'Audio');
  if (kind === 'binary') return text('二进制文件', 'Binary file');
  if (kind === 'code') return text('代码', 'Code');
  if (kind === 'config') return text('配置', 'Configuration');
  if (kind === 'data') return text('数据', 'Data');
  if (kind === 'database') return text('数据库', 'Database');
  if (kind === 'document') return text('文档', 'Document');
  if (kind === 'font') return text('字体', 'Font');
  if (kind === 'image') return text('图片', 'Image');
  if (kind === 'key') return text('证书/密钥', 'Certificate/key');
  if (kind === 'lock') return text('锁定文件', 'Lock file');
  if (kind === 'log') return text('日志', 'Log');
  if (kind === 'markdown') return text('Markdown', 'Markdown');
  if (kind === 'package') return text('包配置', 'Package metadata');
  if (kind === 'pdf') return text('PDF', 'PDF');
  if (kind === 'presentation') return text('演示文稿', 'Presentation');
  if (kind === 'script') return text('脚本', 'Script');
  if (kind === 'spreadsheet') return text('表格', 'Spreadsheet');
  if (kind === 'style') return text('样式表', 'Stylesheet');
  if (kind === 'test') return text('测试文件', 'Test file');
  if (kind === 'text') return text('文本', 'Text');
  if (kind === 'video') return text('视频', 'Video');
  return text('文件', 'File');
}

function formatModifiedTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function buildHtmlPreviewSrcdoc(
  source: string,
  title: string,
  tab: TerminalFilePreviewTab | null,
): string {
  const normalizedSource = String(source || '');
  const trimmedSource = normalizedSource.trim();
  const viewportStyle = buildHtmlPreviewViewportStyle();
  if (!trimmedSource) {
    return rewriteHtmlPreviewResourceUrls([
      '<!doctype html>',
      '<html>',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${escapeHtmlText(title)}</title>`,
      viewportStyle,
      '</head>',
      '<body></body>',
      '</html>',
    ].join(''), tab);
  }
  if (/(?:<!doctype\s+html|<html[\s>])/i.test(trimmedSource)) {
    return rewriteHtmlPreviewResourceUrls(injectHtmlPreviewHead(trimmedSource), tab);
  }
  if (/<(?:head|body)(?:\s|>)/i.test(trimmedSource)) {
    return rewriteHtmlPreviewResourceUrls(injectHtmlPreviewHead([
      '<!doctype html>',
      '<html>',
      normalizedSource,
      '</html>',
    ].join('')), tab);
  }
  return rewriteHtmlPreviewResourceUrls([
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<base target="_blank">',
    `<title>${escapeHtmlText(title)}</title>`,
    viewportStyle,
    '</head>',
    '<body>',
    normalizedSource,
    '</body>',
    '</html>',
  ].join(''), tab);
}

function injectHtmlPreviewHead(source: string): string {
  const previewHeadMarkup = [
    /<base\b/i.test(source) ? '' : '<base target="_blank">',
    /data-openclaw-ide-preview-viewport/i.test(source) ? '' : buildHtmlPreviewViewportStyle(),
  ].join('');
  if (!previewHeadMarkup) return source;
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${previewHeadMarkup}`);
  }
  return source.replace(/<html([^>]*)>/i, `<html$1><head>${previewHeadMarkup}</head>`);
}

function rewriteHtmlPreviewResourceUrls(source: string, tab: TerminalFilePreviewTab | null): string {
  if (!tab || typeof DOMParser === 'undefined') return source;
  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(source, 'text/html');
    const rewriteAttribute = (selector: string, attribute: string) => {
      document.querySelectorAll<HTMLElement>(selector).forEach((node) => {
        const nextUrl = resolveHtmlPreviewResourceUrl(node.getAttribute(attribute) || '', tab);
        if (nextUrl) node.setAttribute(attribute, nextUrl);
      });
    };
    rewriteAttribute('[src]', 'src');
    rewriteAttribute('[href]', 'href');
    rewriteAttribute('[poster]', 'poster');
    document.querySelectorAll<HTMLElement>('[srcset]').forEach((node) => {
      const srcset = rewriteHtmlPreviewSrcset(node.getAttribute('srcset') || '', tab);
      if (srcset) node.setAttribute('srcset', srcset);
    });
    document.querySelectorAll<HTMLElement>('[style]').forEach((node) => {
      const style = rewriteHtmlPreviewCssUrls(node.getAttribute('style') || '', tab);
      if (style) node.setAttribute('style', style);
    });
    document.querySelectorAll<HTMLStyleElement>('style').forEach((node) => {
      node.textContent = rewriteHtmlPreviewCssUrls(node.textContent || '', tab);
    });
    return `<!doctype html>\n${document.documentElement.outerHTML}`;
  } catch {
    return source;
  }
}

function rewriteHtmlPreviewSrcset(value: string, tab: TerminalFilePreviewTab): string {
  return value
    .split(',')
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return '';
      const [url = '', ...descriptor] = trimmed.split(/\s+/);
      const nextUrl = resolveHtmlPreviewResourceUrl(url, tab) || url;
      return [nextUrl, ...descriptor].join(' ');
    })
    .filter(Boolean)
    .join(', ');
}

function rewriteHtmlPreviewCssUrls(value: string, tab: TerminalFilePreviewTab): string {
  return value.replace(/url\((['"]?)([^'")]+)\1\)/gi, (match, quote: string, rawUrl: string) => {
    const nextUrl = resolveHtmlPreviewResourceUrl(rawUrl, tab);
    if (!nextUrl) return match;
    const safeQuote = quote || '"';
    return `url(${safeQuote}${nextUrl}${safeQuote})`;
  });
}

function resolveHtmlPreviewResourceUrl(rawUrl: string, tab: TerminalFilePreviewTab): string {
  const normalizedUrl = String(rawUrl || '').trim();
  if (!normalizedUrl || isExternalHtmlPreviewUrl(normalizedUrl)) return '';
  const [resourcePath] = normalizedUrl.split(/[?#]/);
  const normalizedPath = normalizeHtmlPreviewResourcePath(resourcePath, tab.path);
  return normalizedPath ? buildFileDownloadUrl(tab.rootId, normalizedPath) : '';
}

function isExternalHtmlPreviewUrl(value: string): boolean {
  return (
    value.startsWith('#') ||
    value.startsWith('//') ||
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

function normalizeHtmlPreviewResourcePath(resourcePath: string, filePath: string): string {
  const normalizedResourcePath = String(resourcePath || '').replace(/\\/g, '/').trim();
  if (!normalizedResourcePath) return '';
  const baseSegments = normalizedResourcePath.startsWith('/')
    ? []
    : String(filePath || '').replace(/\\/g, '/').split('/').slice(0, -1);
  const output: string[] = [];
  for (const segment of [...baseSegments, ...normalizedResourcePath.split('/')]) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      output.pop();
      continue;
    }
    output.push(segment);
  }
  return output.join('/');
}

function buildHtmlPreviewViewportStyle(): string {
  return [
    '<style data-openclaw-ide-preview-viewport="1">',
    '*{box-sizing:border-box;}',
    'html{width:100%;height:100%;min-width:0;}',
    'body{width:100%;min-width:0;min-height:100%;margin:0;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55;color:CanvasText;background:Canvas;}',
    'img,svg,video,canvas,iframe{max-width:100%;}',
    'pre,code{max-width:100%;overflow:auto;}',
    'table{max-width:100%;}',
    '</style>',
  ].join('');
}

function buildFontPreviewSrcdoc(fontUrl: string, title: string, dark: boolean): string {
  const paper = dark ? '#0d141d' : '#f7fbff';
  const ink = dark ? '#e5eef9' : '#122033';
  const muted = dark ? '#8ea0b8' : '#5d6b7c';
  const line = dark ? '#263545' : '#d7e3ee';
  const brand = dark ? '#38b8b0' : '#087d76';
  const family = 'OpenClawPreviewFont';
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtmlText(title)}</title>`,
    '<style>',
    `@font-face{font-family:"${family}";src:url("${escapeCssString(fontUrl)}");font-display:swap;}`,
    '*{box-sizing:border-box;}',
    `body{margin:0;min-height:100vh;background:${paper};color:${ink};font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}`,
    '.wrap{display:grid;gap:22px;min-height:100vh;padding:34px;}',
    `.meta{display:flex;gap:10px;align-items:center;color:${muted};font-size:12px;}`,
    `.badge{border:1px solid ${line};border-radius:999px;padding:4px 10px;color:${brand};}`,
    `.sample{font-family:"${family}",serif;border:1px solid ${line};border-radius:10px;padding:28px;background:rgba(255,255,255,.04);}`,
    '.sample h1{margin:0 0 18px;font-size:48px;line-height:1.05;font-weight:700;}',
    '.sample p{margin:0 0 14px;font-size:24px;line-height:1.45;}',
    '.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;}',
    `.cell{font-family:"${family}",serif;border:1px solid ${line};border-radius:8px;padding:14px;font-size:26px;}`,
    '</style>',
    '</head>',
    '<body>',
    '<main class="wrap">',
    `<div class="meta"><span class="badge">${escapeHtmlText(text('字体预览', 'Font preview'))}</span><strong>${escapeHtmlText(title)}</strong></div>`,
    '<section class="sample">',
    '<h1>Tracevane</h1>',
    '<p>快速预览字体：Aa Bb Cc 0123456789</p>',
    '<p>中文字体样张：资源管理器、终端、工作区、代码预览。</p>',
    '<div class="grid">',
    '<div class="cell">Regular 400</div>',
    '<div class="cell" style="font-weight:700">Bold 700</div>',
    '<div class="cell" style="font-style:italic">Italic</div>',
    '<div class="cell">符号 !@#$%^&*</div>',
    '</div>',
    '</section>',
    '</main>',
    '</body>',
    '</html>',
  ].join('');
}

function escapeCssString(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\n\r\f]/g, ' ');
}

function escapeHtmlText(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function filePreviewTabTitle(tab: TerminalFilePreviewTab | null): string {
  if (!tab) return text('打开的文件', 'Open files');
  const parts = [tab.absolutePath];
  if (tab.id === activeTab.value?.id && activePayload.value) {
    parts.push(previewMetaLabel.value);
  } else if (isTabDirty(tab.id)) {
    parts.push(text('未保存', 'Unsaved'));
  }
  return parts.filter(Boolean).join(' · ');
}

function formatFileSize(size: number): string {
  if (!Number.isFinite(size) || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
</script>
