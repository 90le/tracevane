<template>
  <section
    class="terminal-workspace-shell"
    :class="{
      'terminal-workspace-shell--fullscreen': workspaceFullscreen,
      'terminal-workspace-shell--mobile-rail': compactInspectorMode,
    }"
    :data-terminal-theme="terminalTheme"
    data-testid="terminal-workspace-shell"
  >
    <div
      class="terminal-workspace-body"
      :class="{
        'terminal-workspace-body--resource-collapsed': compactInspectorMode || !resourceExplorerOpen,
      }"
      :style="resourceWorkspaceStyle"
    >
      <TerminalWorkspaceActivityBar
        v-if="!compactInspectorMode"
        :active-panel="activeSidebarPanel"
        :sidebar-open="resourceExplorerOpen"
        :search-count="searchResultCount"
        :git-count="gitChangeCount"
        @select="selectSidebarPanel"
      />
      <aside
        v-if="!compactInspectorMode && resourceExplorerOpen"
        class="terminal-resource-sidebar"
        :class="`terminal-resource-sidebar--${activeSidebarPanel}`"
        data-testid="terminal-resource-sidebar"
      >
        <TerminalResourceExplorer
          v-if="activeSidebarPanel === 'files'"
          ref="desktopResourceExplorerRef"
          :workspace-scope-id="activeWorkspaceDirectoryScopeId"
          :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
          @open-terminal="handleResourceOpenTerminal"
          @preview-file="handleResourcePreviewFile"
          @insert-terminal-paths="handleResourceInsertTerminalPaths"
          @collapse="setResourceExplorerOpen(false)"
        />
        <TerminalWorkspaceSearchPanel
          v-else-if="activeSidebarPanel === 'search'"
          :workspace-scope-id="activeWorkspaceDirectoryScopeId"
          :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
          @preview-file="handleResourcePreviewFile"
          @result-count-change="searchResultCount = $event"
        />
        <TerminalGitPanel
          v-else
          :workspace-scope-id="activeWorkspaceDirectoryScopeId"
          :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
          @preview-file="handleResourcePreviewFile"
          @change-count-change="gitChangeCount = $event"
        />
      </aside>
      <div
        v-if="!compactInspectorMode && resourceExplorerOpen"
        class="terminal-resource-sidebar-resizer"
        data-testid="terminal-resource-sidebar-resizer"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        :aria-label="text('调整资源管理器宽度', 'Resize explorer')"
        :aria-valuemin="RESOURCE_EXPLORER_MIN_WIDTH"
        :aria-valuemax="RESOURCE_EXPLORER_MAX_WIDTH"
        :aria-valuenow="resourceExplorerWidth"
        @pointerdown="startResourceExplorerResize"
        @keydown="resizeResourceExplorerFromKeyboard"
      ></div>
      <section class="terminal-workspace-stage">
        <TerminalSessionPane
          v-if="workspaceHydrated"
          ref="sessionPaneRef"
          :tabs="workspace.tabs.value"
          :active-session-id="workspace.activeSessionId.value"
          :active-session="workspace.sessions.value[workspace.activeSessionId.value || ''] || null"
          :pane-sessions="paneSessions"
          :pane-layout="workspace.paneLayout.value"
          :preview-tabs="filePreviewTabs"
          :active-preview-id="activeFilePreviewId"
          :workspace-fullscreen="workspaceFullscreen"
          :terminal-theme="terminalTheme"
          :queued-command="workspace.queuedCommand.value"
          :show-resource-trigger="compactInspectorMode || !resourceExplorerOpen"
          :show-inspector-trigger="true"
          @consume-queued-command="workspace.consumeQueuedCommand($event)"
          @select-session="handleSessionSelect"
          @close-session="handleSessionClose"
          @create-session="createSession"
          @rename-session="renameSession"
          @pin-session="pinSession"
          @move-session="moveSession"
          @reorder-session="reorderSession"
          @split-session="handleSplitSession"
          @set-pane-layout="handlePaneLayoutChange"
          @close-other-sessions="handleCloseOtherSessions"
          @close-sessions-to-right="handleCloseSessionsToRight"
          @close-pane="handleClosePane"
          @select-preview="activeFilePreviewId = $event"
          @close-preview="handleFilePreviewClose"
          @reorder-preview="handleFilePreviewReorder"
          @toggle-workspace-fullscreen="toggleWorkspaceFullscreen"
          @set-terminal-theme="setTerminalTheme"
          @reveal-resource="handlePreviewRevealResource"
          @open-resource-explorer="openResourceExplorerPanel"
          @open-inspector="openInspectorPanel"
          @workspace-group-change="handleWorkspaceGroupChange"
          @end-session="endSession"
          @delete-session="deleteSession"
          @session-attached="handleSessionAttached"
        />
        <div v-else class="terminal-workspace-stage-loading terminal-empty-state">
          {{ text('正在恢复终端会话…', 'Restoring terminal session...') }}
        </div>
      </section>

      <div
        v-if="!compactInspectorMode && desktopInspectorOpen"
        class="terminal-inspector-backdrop"
        aria-hidden="true"
        @click="setDesktopInspectorOpen(false)"
      ></div>
      <TerminalInspectorDrawer v-if="!compactInspectorMode && desktopInspectorOpen" class="terminal-inspector-drawer terminal-inspector-drawer--overlay" :open="true">
        <button
          type="button"
          class="terminal-inspector-drawer-close"
          :aria-label="text('收起终端面板', 'Collapse terminal panel')"
          @click="setDesktopInspectorOpen(false)"
        >
          <X class="terminal-inspector-drawer-close__icon" aria-hidden="true" />
        </button>
        <div class="terminal-inspector-rail-scroll">
          <TerminalInspectorContent
            :inspector-busy="inspectorBusy"
            :terminal-profiles="terminalProfiles"
            :active-profile-id="workspace.activeProfileId.value"
            :visible-binaries="visibleBinaries"
            :openable-binary-ids="openableBinaryIds"
            :installable-binary-ids="installableBinaryIds"
            :missing-dependency-rows="missingDependencyRows"
            :install-feedback="installFeedback"
            :action-layers="actionLayers"
            @refresh="refreshInspectorStatus"
            @launch-profile="handleLaunchProfile"
            @open-binary="handleOpenBinary"
            @install-binary="handleInstallBinary"
            @trigger-action="handleInspectorActionTrigger"
          />
        </div>
      </TerminalInspectorDrawer>
    </div>

    <nav
      v-if="compactInspectorMode"
      class="terminal-mobile-ide-rail"
      :aria-label="text('终端工作台导航', 'Terminal workspace navigation')"
    >
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="false"
        :aria-label="text('打开导航', 'Open navigation')"
        :title="text('打开导航', 'Open navigation')"
        @click="requestShellNavigation"
      >
        <Menu class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('导航', 'Nav') }}</span>
      </button>
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="mobileResourceExplorerOpen && activeSidebarPanel === 'files'"
        :aria-label="text('打开文件', 'Open files')"
        :title="text('打开文件', 'Open files')"
        @click="openResourceExplorerPanel"
      >
        <PanelLeftOpen class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('文件', 'Files') }}</span>
      </button>
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="mobileResourceExplorerOpen && activeSidebarPanel === 'search'"
        :aria-label="text('打开搜索', 'Open search')"
        :title="text('打开搜索', 'Open search')"
        @click="openSearchPanel"
      >
        <Search class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('搜索', 'Search') }}</span>
      </button>
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="mobileResourceExplorerOpen && activeSidebarPanel === 'git'"
        :aria-label="text('打开 Git', 'Open Git')"
        :title="text('打开 Git', 'Open Git')"
        @click="openGitPanel"
      >
        <GitBranch class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('Git', 'Git') }}</span>
      </button>
      <button
        v-if="hasActiveFilePreview"
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="mobileEditorMode && !mobileResourceExplorerOpen && !mobileInspectorOpen"
        :aria-label="text('显示编辑器', 'Show editor')"
        :title="text('显示编辑器', 'Show editor')"
        @click="showMobileEditor"
      >
        <FileText class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('编辑', 'Editor') }}</span>
      </button>
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="!mobileEditorMode && !mobileResourceExplorerOpen && !mobileInspectorOpen"
        :aria-label="text('显示终端', 'Show terminal')"
        :title="text('显示终端', 'Show terminal')"
        @click="focusMobileTerminal"
      >
        <Terminal class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('终端', 'Terminal') }}</span>
      </button>
      <button
        type="button"
        class="terminal-mobile-ide-rail__button"
        :aria-pressed="mobileInspectorOpen"
        :aria-label="text('打开工具', 'Open tools')"
        :title="text('打开工具', 'Open tools')"
        @click="openInspectorPanel"
      >
        <PanelRightOpen class="terminal-mobile-ide-rail__icon" aria-hidden="true" />
        <span>{{ text('工具', 'Tools') }}</span>
      </button>
    </nav>

    <DialogRoot v-if="compactInspectorMode" v-model:open="mobileInspectorOpen" :modal="false">
      <DialogPortal>
        <DialogOverlay class="terminal-mobile-sheet-mask" />
        <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
          <section v-if="mobileInspectorOpen" class="terminal-mobile-sheet">
            <header class="terminal-mobile-sheet__head">
              <div class="terminal-mobile-sheet__copy">
                <DialogTitle as-child>
                  <strong>{{ text('终端面板', 'Terminal Panel') }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span class="sr-only">{{ text('终端工具、命令和会话面板。', 'Terminal tools, commands, and sessions panel.') }}</span>
                </DialogDescription>
              </div>
              <button
                type="button"
                class="terminal-mobile-sheet__close"
                :aria-label="text('关闭终端面板', 'Close terminal panel')"
                @click="mobileInspectorOpen = false"
              >
                <X class="terminal-mobile-sheet__close-icon" aria-hidden="true" />
              </button>
            </header>

            <div class="terminal-mobile-sheet__body">
              <TerminalInspectorContent
                :inspector-busy="inspectorBusy"
                :terminal-profiles="terminalProfiles"
                :active-profile-id="workspace.activeProfileId.value"
                :visible-binaries="visibleBinaries"
                :openable-binary-ids="openableBinaryIds"
                :installable-binary-ids="installableBinaryIds"
                :missing-dependency-rows="missingDependencyRows"
                :install-feedback="installFeedback"
                :action-layers="actionLayers"
                @refresh="refreshInspectorStatus"
                @launch-profile="handleLaunchProfile"
                @open-binary="handleOpenBinary"
                @install-binary="handleInstallBinary"
                @trigger-action="handleInspectorActionTrigger"
              />
            </div>
          </section>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>

    <DialogRoot v-if="compactInspectorMode" v-model:open="mobileResourceExplorerOpen" :modal="false">
      <DialogPortal>
        <DialogOverlay class="terminal-mobile-sheet-mask" />
        <DialogContent as-child @open-auto-focus.prevent @close-auto-focus.prevent>
          <section v-if="mobileResourceExplorerOpen" class="terminal-mobile-sheet terminal-mobile-sheet--resource">
            <header class="terminal-mobile-sheet__head">
              <div class="terminal-mobile-sheet__copy">
                <DialogTitle as-child>
                  <strong>{{ mobileSidebarTitle }}</strong>
                </DialogTitle>
                <DialogDescription as-child>
                  <span class="sr-only">{{ text('移动端 IDE 侧边栏面板。', 'Mobile IDE sidebar panel.') }}</span>
                </DialogDescription>
              </div>
              <button
                type="button"
                class="terminal-mobile-sheet__close"
                :aria-label="text('关闭资源管理器', 'Close explorer')"
                @click="mobileResourceExplorerOpen = false"
              >
                <X class="terminal-mobile-sheet__close-icon" aria-hidden="true" />
              </button>
            </header>

            <div class="terminal-mobile-sheet__body">
              <TerminalResourceExplorer
                v-if="activeSidebarPanel === 'files'"
                ref="mobileResourceExplorerRef"
                :workspace-scope-id="activeWorkspaceDirectoryScopeId"
                :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
                @open-terminal="handleResourceOpenTerminal"
                @preview-file="handleResourcePreviewFile"
                @insert-terminal-paths="handleResourceInsertTerminalPaths"
                @collapse="mobileResourceExplorerOpen = false"
              />
              <TerminalWorkspaceSearchPanel
                v-else-if="activeSidebarPanel === 'search'"
                :workspace-scope-id="activeWorkspaceDirectoryScopeId"
                :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
                @preview-file="handleResourcePreviewFile"
                @result-count-change="searchResultCount = $event"
              />
              <TerminalGitPanel
                v-else
                :workspace-scope-id="activeWorkspaceDirectoryScopeId"
                :workspace-fallback-cwd="activeWorkspaceDirectoryFallbackCwd"
                @preview-file="handleResourcePreviewFile"
                @change-count-change="gitChangeCount = $event"
              />
            </div>
          </section>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { FileText, GitBranch, Menu, PanelLeftOpen, PanelRightOpen, Search, Terminal, X } from '@lucide/vue';
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui';
import { useRoute, useRouter } from 'vue-router';
import type {
  TerminalBinaryId,
  TerminalLaunchCli,
  TerminalProfileDescriptor,
} from '../../../../../types/terminal';
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import type { TerminalActionItem, TerminalActionLayer } from './terminal-action-catalog';
import TerminalInspectorContent from './TerminalInspectorContent.vue';
import TerminalInspectorDrawer from './TerminalInspectorDrawer.vue';
import TerminalGitPanel from './TerminalGitPanel.vue';
import TerminalResourceExplorer from './TerminalResourceExplorer.vue';
import TerminalSessionPane from './TerminalSessionPane.vue';
import TerminalWorkspaceActivityBar, { type TerminalSidebarPanel } from './TerminalWorkspaceActivityBar.vue';
import TerminalWorkspaceSearchPanel from './TerminalWorkspaceSearchPanel.vue';
import { buildTerminalSessionDisplayTitle } from './terminal-session-selectors';
import {
  deleteTerminalSession,
  endTerminalSession,
  fetchPersistedTerminalSessions,
  fetchPersistedTerminalSessionDescriptor,
  fetchTerminalActions,
  fetchTerminalLaunch,
  fetchTerminalProfiles,
  fetchTerminalStatus,
  renameTerminalSession,
} from './api';
import { buildTerminalActionLayers } from './terminal-action-catalog';
import { bindTerminalRouteSync } from './terminal-route-sync';
import {
  createTerminalFilePreviewTab,
  parseTerminalFilePreviewSnapshot,
  serializeTerminalFilePreviewSnapshot,
  type TerminalFilePreviewTab,
} from './terminal-file-preview';
import {
  getTerminalResourceDirectoryAbsolutePath,
  type TerminalResourceTransferPayload,
} from './terminal-resource-transfer';
import {
  TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID,
  readTerminalResourceDefaultDirectory,
} from './terminal-resource-default-directory';
import { TERMINAL_WORKSPACE_ALL_GROUP_ID } from './terminal-workspace-groups';
import {
  buildFallbackTerminalProfiles,
  normalizeTerminalProfileCatalog,
  resolveProfileLaunchCli,
  resolveTerminalProfileTitle,
} from './terminal-profiles';
import {
  readPendingTerminalLaunchMetadata,
  writePendingTerminalLaunchMetadata,
} from './terminal-launch-metadata';
import { createTerminalWorkspaceState, type TerminalPaneLayout } from './terminal-workspace-state';
import './terminal-workspace.css';

type TerminalSplitDirection = 'right' | 'down';

const route = useRoute();
const router = useRouter();
const { text } = useLocalePreference();
const emit = defineEmits<{
  (event: 'requestShellNavigation'): void;
}>();

const TERMINAL_SESSION_STORAGE_KEY = 'openclaw-studio.terminal.sid';
const TERMINAL_DESKTOP_INSPECTOR_STORAGE_KEY = 'openclaw-studio.terminal.desktopInspectorOpen';
const TERMINAL_RESOURCE_EXPLORER_STORAGE_KEY = 'openclaw-studio.terminal.resourceExplorerOpen';
const TERMINAL_RESOURCE_EXPLORER_WIDTH_STORAGE_KEY = 'openclaw-studio.terminal.resourceExplorerWidth';
const TERMINAL_FILE_PREVIEW_STORAGE_KEY = 'openclaw-studio.terminal.filePreviewTabs';
const TERMINAL_THEME_STORAGE_KEY = 'openclaw-studio.terminal.theme';
const RESOURCE_EXPLORER_MIN_WIDTH = 220;
const RESOURCE_EXPLORER_MAX_WIDTH = 460;
const RESOURCE_EXPLORER_DEFAULT_WIDTH = 286;
const RESOURCE_EXPLORER_RESIZE_STEP = 24;
const TERMINAL_MAX_SPLIT_PANES = 4;

const workspace = createTerminalWorkspaceState();
const routeLockedSessionDrafts = new Map<string, TerminalSessionDescriptor>();
const localActionLayers = buildTerminalActionLayers();
const actionLayers = ref<TerminalActionLayer[]>(localActionLayers);
const terminalStatus = ref<Awaited<ReturnType<typeof fetchTerminalStatus>> | null>(null);
const terminalProfiles = ref<TerminalProfileDescriptor[]>([]);
const inspectorBusy = ref(false);
const compactInspectorMode = ref(false);
const desktopInspectorOpen = ref(false);
const resourceExplorerOpen = ref(true);
const activeSidebarPanel = ref<TerminalSidebarPanel>('files');
const mobileInspectorOpen = ref(false);
const mobileResourceExplorerOpen = ref(false);
const mobileEditorMode = ref(false);
const workspaceHydrated = ref(false);
const workspaceFullscreen = ref(false);
const terminalTheme = ref('default');
const filePreviewTabs = ref<TerminalFilePreviewTab[]>([]);
const activeFilePreviewId = ref('');
const resourceExplorerWidth = ref(RESOURCE_EXPLORER_DEFAULT_WIDTH);
const resourceResizeStartX = ref(0);
const resourceResizeStartWidth = ref(RESOURCE_EXPLORER_DEFAULT_WIDTH);
const resourceExplorerResizing = ref(false);
let pendingResourceResizeClientX: number | null = null;
let resourceResizeFrame: number | null = null;
let compactInspectorModeFrame: number | null = null;
const activeWorkspaceDirectoryScopeId = ref(TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID);
const activeWorkspaceDirectoryFallbackCwd = ref<string | null>(null);
const searchResultCount = ref(0);
const gitChangeCount = ref(0);
const sessionPaneRef = ref<InstanceType<typeof TerminalSessionPane> | null>(null);
const desktopResourceExplorerRef = ref<InstanceType<typeof TerminalResourceExplorer> | null>(null);
const mobileResourceExplorerRef = ref<InstanceType<typeof TerminalResourceExplorer> | null>(null);
const installFeedback = ref<{
  kind: 'info' | 'success' | 'error';
  message: string;
  logs: string[];
}>({
  kind: 'info',
  message: '',
  logs: [],
});
let resolveWorkspaceReady: (() => void) | null = null;
const workspaceReady = new Promise<void>((resolve) => {
  resolveWorkspaceReady = resolve;
});

const paneSessions = computed(() =>
  workspace.paneSessionIds.value
    .map((sessionId) => workspace.sessions.value[sessionId])
    .filter((session): session is TerminalSessionDescriptor => Boolean(session)),
);
const hasActiveFilePreview = computed(() =>
  Boolean(activeFilePreviewId.value && filePreviewTabs.value.some((tab) => tab.id === activeFilePreviewId.value)),
);
const visibleBinaries = computed(() =>
  (terminalStatus.value?.binaries || []).filter((binary) => binary.id !== 'bash'),
);
const missingDependencyRows = computed(() => {
  const binaries = terminalStatus.value?.binaries || [];
  return (terminalStatus.value?.skills?.missingBinaries || []).map((item) => {
    const matchedBinary = binaries.find((binary) => binary.binary === item.binary || binary.id === item.binary);
    const binaryId = matchedBinary?.id || null;
    return {
      binary: item.binary,
      label: matchedBinary?.label || item.binary,
      binaryId,
      skills: [...item.skills].sort((left, right) => left.localeCompare(right)),
    };
  });
});
const openableBinaryIds = computed<TerminalBinaryId[]>(() =>
  (visibleBinaries.value || [])
    .filter((binary) => canQueueBinaryCommand(binary.id))
    .map((binary) => binary.id),
);
const installableBinaryIds = computed<TerminalBinaryId[]>(() =>
  (visibleBinaries.value || [])
    .filter((binary) => shouldShowInstall(binary.id))
    .map((binary) => binary.id),
);
const resourceWorkspaceStyle = computed<Record<string, string>>(() => {
  if (compactInspectorMode.value || !resourceExplorerOpen.value) return {};
  return {
    '--terminal-resource-width': `${resourceExplorerWidth.value}px`,
  };
});
const mobileSidebarTitle = computed(() => {
  if (activeSidebarPanel.value === 'search') return text('搜索', 'Search');
  if (activeSidebarPanel.value === 'git') return text('源代码管理', 'Source Control');
  return text('资源管理器', 'Explorer');
});

function applyCompactInspectorMode(): void {
  compactInspectorModeFrame = null;
  const nextCompactMode =
    typeof window !== 'undefined' && window.innerWidth <= 720;
  if (compactInspectorMode.value !== nextCompactMode) {
    compactInspectorMode.value = nextCompactMode;
  }
  if (!nextCompactMode && (mobileInspectorOpen.value || mobileResourceExplorerOpen.value)) {
    mobileInspectorOpen.value = false;
    mobileResourceExplorerOpen.value = false;
  }
}

function syncCompactInspectorMode(): void {
  if (compactInspectorModeFrame !== null) return;
  compactInspectorModeFrame = window.requestAnimationFrame(applyCompactInspectorMode);
}

function cancelCompactInspectorModeSync(): void {
  if (compactInspectorModeFrame === null) return;
  window.cancelAnimationFrame(compactInspectorModeFrame);
  compactInspectorModeFrame = null;
}

function restoreDesktopInspectorPreference(): void {
  try {
    const raw = globalThis.localStorage?.getItem(TERMINAL_DESKTOP_INSPECTOR_STORAGE_KEY);
    if (raw === '0') {
      desktopInspectorOpen.value = false;
    } else if (raw === '1') {
      desktopInspectorOpen.value = true;
    }
  } catch {
    // ignore unavailable storage
  }
}

function restoreResourceExplorerPreference(): void {
  try {
    const raw = globalThis.localStorage?.getItem(TERMINAL_RESOURCE_EXPLORER_STORAGE_KEY);
    if (raw === '0') {
      resourceExplorerOpen.value = false;
    } else if (raw === '1') {
      resourceExplorerOpen.value = true;
    }
  } catch {
    // ignore unavailable storage
  }
}

function clampResourceExplorerWidth(width: number): number {
  if (!Number.isFinite(width)) return RESOURCE_EXPLORER_DEFAULT_WIDTH;
  return Math.max(
    RESOURCE_EXPLORER_MIN_WIDTH,
    Math.min(RESOURCE_EXPLORER_MAX_WIDTH, Math.round(width)),
  );
}

function restoreResourceExplorerWidthPreference(): void {
  try {
    const raw = Number(globalThis.localStorage?.getItem(TERMINAL_RESOURCE_EXPLORER_WIDTH_STORAGE_KEY));
    if (Number.isFinite(raw) && raw > 0) {
      resourceExplorerWidth.value = clampResourceExplorerWidth(raw);
    }
  } catch {
    // ignore unavailable storage
  }
}

function persistResourceExplorerWidth(): void {
  try {
    globalThis.localStorage?.setItem(
      TERMINAL_RESOURCE_EXPLORER_WIDTH_STORAGE_KEY,
      String(resourceExplorerWidth.value),
    );
  } catch {
    // ignore unavailable storage
  }
}

function restoreFilePreviewTabs(): void {
  try {
    const snapshot = parseTerminalFilePreviewSnapshot(
      globalThis.localStorage?.getItem(TERMINAL_FILE_PREVIEW_STORAGE_KEY),
    );
    if (!snapshot) return;
    filePreviewTabs.value = snapshot.tabs;
    activeFilePreviewId.value = snapshot.activeTabId;
  } catch {
    // ignore unavailable storage
  }
}

function restoreTerminalThemePreference(): void {
  try {
    const raw = String(globalThis.localStorage?.getItem(TERMINAL_THEME_STORAGE_KEY) || '').trim();
    if (isTerminalTheme(raw)) {
      terminalTheme.value = raw;
    }
  } catch {
    // ignore unavailable storage
  }
}

function isTerminalTheme(value: string): boolean {
  return ['default', 'matrix', 'amber', 'midnight'].includes(value);
}

function persistFilePreviewTabs(): void {
  try {
    const serialized = serializeTerminalFilePreviewSnapshot(
      filePreviewTabs.value,
      activeFilePreviewId.value,
    );
    if (serialized) {
      globalThis.localStorage?.setItem(TERMINAL_FILE_PREVIEW_STORAGE_KEY, serialized);
    } else {
      globalThis.localStorage?.removeItem(TERMINAL_FILE_PREVIEW_STORAGE_KEY);
    }
  } catch {
    // ignore unavailable storage
  }
}

function setDesktopInspectorOpen(open: boolean): void {
  desktopInspectorOpen.value = open;
  try {
    globalThis.localStorage?.setItem(TERMINAL_DESKTOP_INSPECTOR_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // ignore unavailable storage
  }
}

function setResourceExplorerOpen(open: boolean): void {
  resourceExplorerOpen.value = open;
  try {
    globalThis.localStorage?.setItem(TERMINAL_RESOURCE_EXPLORER_STORAGE_KEY, open ? '1' : '0');
  } catch {
    // ignore unavailable storage
  }
}

function setTerminalTheme(theme: string): void {
  const normalized = String(theme || '').trim();
  terminalTheme.value = isTerminalTheme(normalized) ? normalized : 'default';
  try {
    globalThis.localStorage?.setItem(TERMINAL_THEME_STORAGE_KEY, terminalTheme.value);
  } catch {
    // ignore unavailable storage
  }
}

function selectSidebarPanel(panel: TerminalSidebarPanel): void {
  activeSidebarPanel.value = panel;
  if (compactInspectorMode.value) {
    mobileInspectorOpen.value = false;
    mobileResourceExplorerOpen.value = true;
    return;
  }
  setResourceExplorerOpen(true);
}

function openResourceExplorerPanel(): void {
  selectSidebarPanel('files');
}

function openSearchPanel(): void {
  selectSidebarPanel('search');
}

function openGitPanel(): void {
  selectSidebarPanel('git');
}

function startResourceExplorerResize(event: PointerEvent): void {
  if (event.button !== 0) return;
  event.preventDefault();
  resourceExplorerResizing.value = true;
  resourceResizeStartX.value = event.clientX;
  resourceResizeStartWidth.value = resourceExplorerWidth.value;
  document.body.classList.add('terminal-resource-sidebar-resizing');
  window.addEventListener('pointermove', handleResourceExplorerResizeMove);
  window.addEventListener('pointerup', stopResourceExplorerResize, { once: true });
}

function handleResourceExplorerResizeMove(event: PointerEvent): void {
  if (!resourceExplorerResizing.value) return;
  pendingResourceResizeClientX = event.clientX;
  if (resourceResizeFrame !== null) return;
  resourceResizeFrame = window.requestAnimationFrame(flushResourceExplorerResize);
}

function flushResourceExplorerResize(): void {
  resourceResizeFrame = null;
  if (!resourceExplorerResizing.value || pendingResourceResizeClientX === null) return;
  const delta = pendingResourceResizeClientX - resourceResizeStartX.value;
  resourceExplorerWidth.value = clampResourceExplorerWidth(
    resourceResizeStartWidth.value + delta,
  );
  pendingResourceResizeClientX = null;
}

function stopResourceExplorerResize(): void {
  if (!resourceExplorerResizing.value) return;
  if (resourceResizeFrame !== null) {
    window.cancelAnimationFrame(resourceResizeFrame);
    resourceResizeFrame = null;
  }
  flushResourceExplorerResize();
  resourceExplorerResizing.value = false;
  pendingResourceResizeClientX = null;
  document.body.classList.remove('terminal-resource-sidebar-resizing');
  window.removeEventListener('pointermove', handleResourceExplorerResizeMove);
  persistResourceExplorerWidth();
}

function resizeResourceExplorerFromKeyboard(event: KeyboardEvent): void {
  let nextWidth = resourceExplorerWidth.value;
  if (event.key === 'ArrowLeft') {
    nextWidth -= RESOURCE_EXPLORER_RESIZE_STEP;
  } else if (event.key === 'ArrowRight') {
    nextWidth += RESOURCE_EXPLORER_RESIZE_STEP;
  } else if (event.key === 'Home') {
    nextWidth = RESOURCE_EXPLORER_MIN_WIDTH;
  } else if (event.key === 'End') {
    nextWidth = RESOURCE_EXPLORER_MAX_WIDTH;
  } else {
    return;
  }
  event.preventDefault();
  resourceExplorerWidth.value = clampResourceExplorerWidth(nextWidth);
  persistResourceExplorerWidth();
}

function openInspectorPanel(): void {
  if (compactInspectorMode.value) {
    mobileResourceExplorerOpen.value = false;
    mobileInspectorOpen.value = true;
    return;
  }
  setDesktopInspectorOpen(true);
}

function focusMobileTerminal(): void {
  mobileEditorMode.value = false;
  mobileInspectorOpen.value = false;
  mobileResourceExplorerOpen.value = false;
  void nextTick(() => {
    sessionPaneRef.value?.showTerminal();
  });
}

function showMobileEditor(): void {
  if (!hasActiveFilePreview.value) {
    focusMobileTerminal();
    return;
  }
  mobileEditorMode.value = true;
  mobileInspectorOpen.value = false;
  mobileResourceExplorerOpen.value = false;
  void nextTick(() => {
    sessionPaneRef.value?.showEditor();
  });
}

function requestShellNavigation(): void {
  mobileInspectorOpen.value = false;
  mobileResourceExplorerOpen.value = false;
  emit('requestShellNavigation');
}

function toggleWorkspaceFullscreen(): void {
  workspaceFullscreen.value = !workspaceFullscreen.value;
}

function handleWorkspaceKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || !workspaceFullscreen.value) return;
  workspaceFullscreen.value = false;
}

bindTerminalRouteSync({
  activeSessionId: workspace.activeSessionId,
  setActiveSession: workspace.setActiveSession,
  registerSession: workspace.registerSession,
  route,
  router,
});

async function refreshInspectorStatus(): Promise<void> {
  inspectorBusy.value = true;
  try {
    terminalStatus.value = await fetchTerminalStatus();
    terminalProfiles.value = normalizeTerminalProfileCatalog(
      terminalProfiles.value,
      terminalStatus.value,
    );
  } catch {
    terminalStatus.value = null;
    terminalProfiles.value = normalizeTerminalProfileCatalog([], null);
  } finally {
    inspectorBusy.value = false;
  }
}

function refreshStatusLater(delayMs = 1800): void {
  globalThis.setTimeout(() => {
    void refreshInspectorStatus();
  }, delayMs);
}

function closeMobileInspectorIfCompact(): void {
  if (compactInspectorMode.value) {
    mobileInspectorOpen.value = false;
  }
}

function closeMobileResourceExplorerIfCompact(): void {
  if (compactInspectorMode.value) {
    mobileResourceExplorerOpen.value = false;
  }
}

function clearStoredTerminalSessionId(sessionId: string | null | undefined): void {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;
  try {
    if (globalThis.sessionStorage?.getItem(TERMINAL_SESSION_STORAGE_KEY) === normalizedSessionId) {
      globalThis.sessionStorage.removeItem(TERMINAL_SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore unavailable storage
  }
}

function isOpenTerminalDescriptor(session: TerminalSessionDescriptor | null | undefined): boolean {
  return Boolean(
    session &&
    (session.status === 'running' || session.status === 'detached'),
  );
}

function buildTerminalRoutePath(sessionId: string | null | undefined): string {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) {
    return '/terminal';
  }
  return `/terminal/${encodeURIComponent(normalizedSessionId)}`;
}

async function navigateToSession(sessionId: string | null | undefined): Promise<void> {
  const targetPath = buildTerminalRoutePath(sessionId);
  if (router.currentRoute.value.path === targetPath) {
    return;
  }
  try {
    await router.push({ path: targetPath });
  } catch {
    // ignore navigation duplication or transient route failures
  }
}

async function syncRouteToWorkspaceActiveSession(): Promise<void> {
  await navigateToSession(workspace.activeSessionId.value);
}

async function syncRouteLockedSession(sessionId: string | null | undefined): Promise<void> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId || !workspaceHydrated.value) return;

  const pendingMetadata = readPendingTerminalLaunchMetadata(
    globalThis.sessionStorage,
    normalizedSessionId,
  );
  const fallbackSession =
    workspace.sessions.value[normalizedSessionId] ||
    routeLockedSessionDrafts.get(normalizedSessionId) ||
    null;
  let descriptor = fallbackSession;
  if (!descriptor || descriptor.title === normalizedSessionId) {
    try {
      descriptor = await fetchPersistedTerminalSessionDescriptor(normalizedSessionId);
    } catch {
      descriptor = fallbackSession;
    }
  }
  if (!descriptor && pendingMetadata) {
    descriptor = {
      sessionId: normalizedSessionId,
      title: fallbackSession?.title || normalizedSessionId,
      status: 'running',
      source: 'manual',
      profileId: pendingMetadata.profileId || fallbackSession?.profileId || null,
      targetKind: pendingMetadata.targetKind || fallbackSession?.targetKind || 'local',
      cwd: pendingMetadata.cwd || fallbackSession?.cwd || null,
      pinned: typeof pendingMetadata.pinned === 'boolean'
        ? pendingMetadata.pinned
        : Boolean(fallbackSession?.pinned),
      canResume: true,
      controlState: 'controller',
      updatedAt: fallbackSession?.updatedAt || new Date().toISOString(),
      handoffContext: fallbackSession?.handoffContext || null,
      recentOutputSummary: fallbackSession?.recentOutputSummary || null,
    };
  }

  if (descriptor && !isOpenTerminalDescriptor(descriptor) && !pendingMetadata) {
    workspace.deleteSession(normalizedSessionId);
    await syncRouteToWorkspaceActiveSession();
    return;
  }

  if (descriptor) {
    workspace.registerSession({
      ...descriptor,
      sessionId: normalizedSessionId,
      profileId: pendingMetadata?.profileId || descriptor.profileId || null,
      targetKind: pendingMetadata?.targetKind || descriptor.targetKind || 'local',
      cwd: pendingMetadata?.cwd || descriptor.cwd || null,
    });
  }
  workspace.setActiveSession(normalizedSessionId);
}

onMounted(async () => {
  restoreDesktopInspectorPreference();
  restoreResourceExplorerPreference();
  restoreResourceExplorerWidthPreference();
  restoreFilePreviewTabs();
  restoreTerminalThemePreference();
  applyCompactInspectorMode();
  window.addEventListener('resize', syncCompactInspectorMode);
  window.addEventListener('keydown', handleWorkspaceKeydown);

  const normalizedSessionId = String(route.params.sessionId || '').trim();
  if (normalizedSessionId && typeof globalThis.sessionStorage?.setItem === 'function') {
    globalThis.sessionStorage.setItem(TERMINAL_SESSION_STORAGE_KEY, normalizedSessionId);
    const draft = workspace.sessions.value[normalizedSessionId] || null;
    if (draft) {
      routeLockedSessionDrafts.set(normalizedSessionId, { ...draft });
    }
  }

  try {
    const summary = await fetchPersistedTerminalSessions();
    workspace.hydrateSessions(summary.sessions || []);
    if (normalizedSessionId) {
      await syncRouteLockedSession(normalizedSessionId);
    }
  } catch {
    // keep route/local workspace as-is when persisted descriptors are unavailable
  } finally {
    workspaceHydrated.value = true;
    resolveWorkspaceReady?.();
    resolveWorkspaceReady = null;
  }

  await refreshInspectorStatus();

  try {
    const profiles = await fetchTerminalProfiles();
    terminalProfiles.value = normalizeTerminalProfileCatalog(
      profiles.profiles || [],
      terminalStatus.value,
    );
  } catch {
    terminalProfiles.value = buildFallbackTerminalProfiles(terminalStatus.value);
  }

  try {
    const summary = await fetchTerminalActions();
    if (Array.isArray(summary.groups) && summary.groups.length) {
      actionLayers.value = summary.groups.map((group) => ({
        key: group.key,
        titleZh: group.titleZh,
        titleEn: group.titleEn,
        descriptionZh: group.descriptionZh,
        descriptionEn: group.descriptionEn,
        items: group.items.map((item) => ({
          key: item.key,
          labelZh: item.labelZh,
          labelEn: item.labelEn,
          descriptionZh: item.descriptionZh,
          descriptionEn: item.descriptionEn,
          command: item.command,
          recommendedTitle: item.recommendedTitle,
          runMode: item.runMode,
        })),
      }));
    }
  } catch {
    actionLayers.value = localActionLayers;
  }
});

watch(
  () => [workspaceHydrated.value, route.params.sessionId] as const,
  ([hydrated, sessionId]) => {
    if (!hydrated) return;
    void syncRouteLockedSession(String(sessionId || ''));
  },
  { immediate: true },
);

watch(
  () => ({
    activeTabId: activeFilePreviewId.value,
    tabs: filePreviewTabs.value.map((tab) => ({ ...tab })),
  }),
  persistFilePreviewTabs,
);

onBeforeUnmount(() => {
  stopResourceExplorerResize();
  cancelCompactInspectorModeSync();
  window.removeEventListener('resize', syncCompactInspectorMode);
  window.removeEventListener('keydown', handleWorkspaceKeydown);
});

function buildSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `term-${Date.now().toString(36)}`;
}

function buildUntitledSessionTitle(): string {
  const baseTitle = text('终端', 'Shell');
  const nextIndex = workspace.tabs.value.filter((session) => session.title.startsWith(baseTitle)).length + 1;
  if (nextIndex <= 1) {
    return baseTitle;
  }
  return `${baseTitle} ${nextIndex}`;
}

async function ensureWorkspaceReady(): Promise<void> {
  if (workspaceHydrated.value) return;
  await workspaceReady;
}

function ensureCommandLineBreak(command: string): string {
  const normalized = String(command || '');
  if (!normalized) return '';
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function resolveResourceTerminalCwd(
  payload: TerminalResourceTransferPayload,
): string {
  return getTerminalResourceDirectoryAbsolutePath(payload);
}

function normalizeWorkspaceDirectoryScopeId(scopeId: string | null | undefined): string {
  const normalized = String(scopeId || '').trim();
  if (!normalized || normalized === TERMINAL_WORKSPACE_ALL_GROUP_ID) {
    return TERMINAL_RESOURCE_DEFAULT_MAIN_SCOPE_ID;
  }
  return normalized;
}

function resolveDefaultResourceTerminalCwd(scopeId = activeWorkspaceDirectoryScopeId.value): string | null {
  try {
    return readTerminalResourceDefaultDirectory(
      globalThis.localStorage,
      normalizeWorkspaceDirectoryScopeId(scopeId),
      { fallbackToMain: true },
    )?.absolutePath || null;
  } catch {
    return null;
  }
}

function resolveTerminalLaunchCwd(
  cwd: string | null | undefined,
  targetKind: TerminalSessionDescriptor['targetKind'],
  workspaceGroupId: string | null | undefined = activeWorkspaceDirectoryScopeId.value,
  fallbackCwd: string | null | undefined = null,
): string | null {
  const explicitCwd = String(cwd || '').trim();
  if (explicitCwd) return explicitCwd;
  if (targetKind && targetKind !== 'local') return null;
  return (
    resolveDefaultResourceTerminalCwd(workspaceGroupId) ||
    String(fallbackCwd || '').trim() ||
    null
  );
}

async function openCommandSession(options: {
  title: string;
  command?: string;
  source?: TerminalSessionDescriptor['source'];
  profileId?: string | null;
  targetKind?: TerminalSessionDescriptor['targetKind'];
  cwd?: string | null;
  fallbackCwd?: string | null;
  workspaceGroupId?: string | null;
}): Promise<string> {
  await ensureWorkspaceReady();
  const sessionId = buildSessionId();
  const profileId = options.profileId || workspace.activeProfileId.value || null;
  const targetKind = options.targetKind || 'local';
  const cwd = resolveTerminalLaunchCwd(
    options.cwd,
    targetKind,
    options.workspaceGroupId,
    options.fallbackCwd,
  );
  workspace.registerSession({
    sessionId,
    title: String(options.title || text('终端', 'Shell')).trim() || text('终端', 'Shell'),
    status: 'running',
    source: options.source || 'manual',
    profileId,
    targetKind,
    cwd,
    canResume: true,
    controlState: 'controller',
    updatedAt: new Date().toISOString(),
  });
  writePendingTerminalLaunchMetadata(globalThis.sessionStorage, sessionId, {
    profileId,
    targetKind,
    cwd,
  });
  workspace.setActiveSession(sessionId);
  await navigateToSession(sessionId);
  if (options.command) {
    workspace.setQueuedCommand(sessionId, ensureCommandLineBreak(options.command));
  }
  return sessionId;
}

async function createSession(options: { cwd?: string | null; workspaceGroupId?: string | null } = {}): Promise<string> {
  return openCommandSession({
    title: buildUntitledSessionTitle(),
    source: 'manual',
    workspaceGroupId: options.workspaceGroupId || activeWorkspaceDirectoryScopeId.value,
    fallbackCwd: options.cwd || activeWorkspaceDirectoryFallbackCwd.value,
  });
}

function buildSplitSessionTitle(session: TerminalSessionDescriptor): string {
  const displayTitle = buildTerminalSessionDisplayTitle({
    title: session.title,
    sessionId: session.sessionId,
  });
  const title = text(displayTitle.labelZh, displayTitle.labelEn);
  return `${title} · ${text('拆分', 'Split')}`;
}

function buildNextSplitPaneSessionIds(
  currentPaneIds: string[],
  sourceId: string,
  splitSessionId: string,
): string[] {
  const normalizedSourceId = String(sourceId || '').trim();
  const normalizedSplitSessionId = String(splitSessionId || '').trim();
  if (!normalizedSourceId || !normalizedSplitSessionId) return [];

  const seen = new Set<string>();
  const currentIds = currentPaneIds
    .map((sessionId) => String(sessionId || '').trim())
    .filter((sessionId) => {
      if (!sessionId || sessionId === normalizedSplitSessionId || seen.has(sessionId)) return false;
      seen.add(sessionId);
      return true;
    });
  const sourceIndex = currentIds.indexOf(normalizedSourceId);
  const baseIds = sourceIndex >= 0 ? currentIds : [normalizedSourceId, ...currentIds];
  const insertionIndex = Math.max(0, baseIds.indexOf(normalizedSourceId)) + 1;
  return [
    ...baseIds.slice(0, insertionIndex),
    normalizedSplitSessionId,
    ...baseIds.slice(insertionIndex),
  ].slice(0, TERMINAL_MAX_SPLIT_PANES);
}

function resolveSplitPaneLayout(
  requestedLayout: Exclude<TerminalPaneLayout, 'single'>,
  paneCount: number,
): Exclude<TerminalPaneLayout, 'single'> {
  return paneCount > 2 ? 'grid' : requestedLayout;
}

async function handleSplitSession(payload: { sessionId: string; direction: TerminalSplitDirection }): Promise<void> {
  const sourceId = String(payload?.sessionId || workspace.activeSessionId.value || '').trim();
  const source = workspace.sessions.value[sourceId] || null;
  if (!source) return;

  const currentPaneIds = [...workspace.paneSessionIds.value];
  const layout = payload.direction === 'down' ? 'rows' : 'columns';
  const splitSessionId = await openCommandSession({
    title: buildSplitSessionTitle(source),
    profileId: source.profileId || workspace.activeProfileId.value || null,
    targetKind: source.targetKind || 'local',
    cwd: source.cwd || null,
    source: 'manual',
  });
  const nextPaneIds = buildNextSplitPaneSessionIds(currentPaneIds, sourceId, splitSessionId);
  workspace.setPaneSessions(nextPaneIds);
  workspace.setPaneLayout(resolveSplitPaneLayout(layout, nextPaneIds.length));
}

function handlePaneLayoutChange(layout: Exclude<TerminalPaneLayout, 'single'>): void {
  workspace.setPaneLayout(layout);
}

function handleWorkspaceGroupChange(payload: { id: string; cwd: string | null }): void {
  activeWorkspaceDirectoryScopeId.value = normalizeWorkspaceDirectoryScopeId(payload?.id);
  activeWorkspaceDirectoryFallbackCwd.value = String(payload?.cwd || '').trim() || null;
}

function handleClosePane(sessionId: string): void {
  const wasActive = workspace.activeSessionId.value === String(sessionId || '').trim();
  workspace.closePane(sessionId);
  if (wasActive) {
    void syncRouteToWorkspaceActiveSession();
  }
}

async function handleResourceOpenTerminal(payload: TerminalResourceTransferPayload): Promise<void> {
  const cwd = await resolveResourceTerminalCwd(payload);
  if (!cwd) return;
  const label = String(payload?.name || '').trim() || text('资源终端', 'Resource Shell');
  await openCommandSession({
    title: `${label} · ${text('终端', 'Shell')}`,
    cwd,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
  closeMobileResourceExplorerIfCompact();
}

function handleResourcePreviewFile(payload: TerminalResourceTransferPayload): void {
  const tab = createTerminalFilePreviewTab(payload);
  if (!tab) return;
  const existingIndex = filePreviewTabs.value.findIndex((item) => item.id === tab.id);
  if (existingIndex >= 0) {
    filePreviewTabs.value.splice(existingIndex, 1, tab);
  } else {
    filePreviewTabs.value.push(tab);
  }
  activeFilePreviewId.value = tab.id;
  if (compactInspectorMode.value) {
    mobileEditorMode.value = true;
    void nextTick(() => {
      sessionPaneRef.value?.showEditor();
    });
  }
  closeMobileResourceExplorerIfCompact();
}

async function handlePreviewRevealResource(payload: TerminalResourceTransferPayload): Promise<void> {
  const targetPath = String(payload?.path || '').trim();
  if (!targetPath) return;
  activeSidebarPanel.value = 'files';
  if (compactInspectorMode.value) {
    mobileResourceExplorerOpen.value = true;
    await nextTick();
    await nextTick();
    await mobileResourceExplorerRef.value?.revealTerminalResource(payload);
    return;
  }
  setResourceExplorerOpen(true);
  await nextTick();
  await desktopResourceExplorerRef.value?.revealTerminalResource(payload);
}

function handleResourceInsertTerminalPaths(paths: string[]): void {
  const normalizedPaths = Array.from(new Set(
    paths.map((path) => String(path || '').trim()).filter(Boolean),
  ));
  if (!normalizedPaths.length) return;
  if (sessionPaneRef.value?.insertTerminalPaths(normalizedPaths)) {
    closeMobileResourceExplorerIfCompact();
  }
}

function handleFilePreviewClose(tabId = activeFilePreviewId.value): void {
  const normalizedTabId = String(tabId || '').trim();
  if (!normalizedTabId) return;
  const index = filePreviewTabs.value.findIndex((tab) => tab.id === normalizedTabId);
  if (index === -1) return;
  const wasActive = activeFilePreviewId.value === normalizedTabId;
  filePreviewTabs.value.splice(index, 1);
  if (wasActive) {
    activeFilePreviewId.value =
      filePreviewTabs.value[index]?.id ||
      filePreviewTabs.value[index - 1]?.id ||
      '';
  }
  if (!activeFilePreviewId.value) {
    mobileEditorMode.value = false;
  }
}

function handleFilePreviewReorder(payload: { tabId: string; targetIndex: number }): void {
  const normalizedTabId = String(payload?.tabId || '').trim();
  if (!normalizedTabId) return;
  const currentIndex = filePreviewTabs.value.findIndex((tab) => tab.id === normalizedTabId);
  if (currentIndex === -1) return;

  const [tab] = filePreviewTabs.value.splice(currentIndex, 1);
  const targetIndex = Number.isFinite(payload.targetIndex)
    ? Math.floor(payload.targetIndex)
    : 0;
  const boundedIndex = Math.max(0, Math.min(filePreviewTabs.value.length, targetIndex));
  filePreviewTabs.value.splice(boundedIndex, 0, tab);
  activeFilePreviewId.value = normalizedTabId;
}

function handleSessionAttached(session: TerminalSessionDescriptor): void {
  const sessionId = String(session?.sessionId || '').trim();
  if (!sessionId) return;
  const lockedRouteSessionId = String(route.params.sessionId || '').trim();
  if (lockedRouteSessionId && lockedRouteSessionId !== sessionId) {
    return;
  }
  const preserveRouteLockedActiveSession =
    Boolean(lockedRouteSessionId) &&
    lockedRouteSessionId !== sessionId;

  const existing = workspace.sessions.value[sessionId] || null;
  const preservedTitle =
    existing?.title && existing.title !== sessionId
      ? existing.title
      : session.title;

  workspace.registerSession({
    ...session,
    title: preservedTitle || session.title,
  });
  if (!preserveRouteLockedActiveSession) {
    workspace.setActiveSession(session.sessionId);
  }

  if (
    preservedTitle &&
    preservedTitle !== session.title &&
    preservedTitle !== sessionId
  ) {
    void renameTerminalSession(sessionId, preservedTitle).catch(() => {
      // ignore descriptor sync failures
    });
  }
}

function findActionItem(actionKey: string): TerminalActionItem | null {
  const normalizedKey = String(actionKey || '').trim();
  if (!normalizedKey) return null;

  for (const layer of actionLayers.value) {
    const item = layer.items.find((candidate) => candidate.key === normalizedKey);
    if (item) return item;
  }

  return null;
}

function resolveBinaryLabel(binaryId: TerminalBinaryId): string {
  if (binaryId === 'bash') {
    return text('终端', 'Shell');
  }
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  return binary?.label || binaryId;
}

async function handleActionTrigger(actionKey: string): Promise<void> {
  const item = findActionItem(actionKey);
  if (!item?.command) return;

  await openCommandSession({
    title: text(item.recommendedTitle || item.labelZh, item.labelEn),
    command: item.command,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}

function canLaunch(cli: TerminalLaunchCli): boolean {
  if (cli === 'bash') return true;
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === cli);
  return Boolean(binary?.installed);
}

async function launchProfile(profileId: string): Promise<void> {
  const profile = terminalProfiles.value.find((item) => item.id === profileId) || null;
  if (!profile?.launchable) return;

  workspace.setActiveProfile(profile.id);
  const launchCli = resolveProfileLaunchCli(profile);
  if (launchCli && canLaunch(launchCli)) {
    try {
      const result = await fetchTerminalLaunch({
        cli: launchCli,
        profileId: profile.id,
      });
      await openCommandSession({
        title: resolveTerminalProfileTitle(profile, result.label),
        command: result.command,
        profileId: profile.id,
        targetKind: profile.targetKind,
        cwd: profile.cwd,
        source: 'manual',
      });
      closeMobileInspectorIfCompact();
      return;
    } catch {
      // Fall through to the static profile command when the backend launch helper is unavailable.
    }
  }

  await openCommandSession({
    title: resolveTerminalProfileTitle(profile, text('终端', 'Shell')),
    command: profile.command,
    profileId: profile.id,
    targetKind: profile.targetKind,
    cwd: profile.cwd,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}

const BINARY_COMMANDS: Partial<Record<TerminalBinaryId, string>> = {
  claude: 'claude',
  codex: 'codex',
  opencode: 'opencode',
  clawhub: 'clawhub',
  skillhub: 'skillhub',
};

function canQueueBinaryCommand(binaryId: TerminalBinaryId): boolean {
  const command = BINARY_COMMANDS[binaryId];
  if (!command) return false;
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  return Boolean(binary?.installed);
}

async function queueBinaryCommand(binaryId: TerminalBinaryId): Promise<void> {
  const command = BINARY_COMMANDS[binaryId];
  if (!command || !canQueueBinaryCommand(binaryId)) {
    return;
  }
  await openCommandSession({
    title: resolveBinaryLabel(binaryId),
    command,
    source: 'manual',
  });
  closeMobileInspectorIfCompact();
}

function shouldShowInstall(binaryId: TerminalBinaryId): boolean {
  const binary = terminalStatus.value?.binaries?.find((item) => item.id === binaryId);
  if (!binary || binary.installed || !binary.installSupported) {
    return false;
  }
  return Boolean(terminalStatus.value?.installTargets?.some((target) => target.id === binaryId));
}

function canInstall(binaryId: TerminalBinaryId): boolean {
  return !inspectorBusy.value && Boolean(getInstallCommand(binaryId));
}

function getInstallCommand(binaryId: TerminalBinaryId): string {
  const installTarget = terminalStatus.value?.installTargets?.find((target) => target.id === binaryId);
  return String(installTarget?.installHint || '').trim();
}

async function queueInstallCommand(binaryId: TerminalBinaryId): Promise<void> {
  if (!canInstall(binaryId)) return;
  const installCommand = getInstallCommand(binaryId);
  if (!installCommand) return;

  const label = resolveBinaryLabel(binaryId);
  await openCommandSession({
    title: `${text('安装', 'Install')} ${label}`,
    command: installCommand,
    source: 'manual',
  });
  installFeedback.value = {
    kind: 'info',
    message: text(`已在新标签注入 ${label} 的安装命令。`, `Injected the ${label} install command into a new tab.`),
    logs: [installCommand],
  };
  refreshStatusLater();
  closeMobileInspectorIfCompact();
}

async function renameSession(payload: { sessionId: string; title: string }): Promise<void> {
  const normalized = String(payload?.sessionId || '').trim();
  const normalizedTitle = String(payload?.title || '').trim();
  if (!normalized || !normalizedTitle) return;

  try {
    await renameTerminalSession(normalized, normalizedTitle);
  } catch {
    return;
  }

  workspace.renameSession(normalized, normalizedTitle);
}

function pinSession(payload: { sessionId: string; pinned: boolean }): void {
  const normalized = String(payload?.sessionId || '').trim();
  if (!normalized) return;
  workspace.pinSession(normalized, payload.pinned);
}

function moveSession(payload: { sessionId: string; direction: 'left' | 'right' }): void {
  const normalized = String(payload?.sessionId || '').trim();
  if (!normalized) return;
  const currentIndex = workspace.tabOrder.value.indexOf(normalized);
  if (currentIndex < 0) return;
  const delta = payload.direction === 'left' ? -1 : 1;
  workspace.moveTab(normalized, currentIndex + delta);
}

function reorderSession(payload: { sessionId: string; targetIndex: number }): void {
  const normalized = String(payload?.sessionId || '').trim();
  if (!normalized) return;
  workspace.moveTab(normalized, payload.targetIndex);
}

async function endSession(sessionId: string): Promise<void> {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const wasActive = workspace.activeSessionId.value === normalized;

  try {
    await endTerminalSession({ sid: normalized });
  } catch {
    return;
  }

  workspace.endSession(normalized);
  routeLockedSessionDrafts.delete(normalized);
  clearStoredTerminalSessionId(normalized);
  if (wasActive) {
    await syncRouteToWorkspaceActiveSession();
  }
}

async function deleteSession(sessionId: string): Promise<void> {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const wasActive = workspace.activeSessionId.value === normalized;

  try {
    await deleteTerminalSession(normalized);
  } catch {
    try {
      await endTerminalSession({ sid: normalized });
      await deleteTerminalSession(normalized);
    } catch {
      // The server may already have dropped the pty or descriptor; keep the local UI authoritative.
    }
  }

  workspace.deleteSession(normalized);
  routeLockedSessionDrafts.delete(normalized);
  clearStoredTerminalSessionId(normalized);
  if (wasActive) {
    await syncRouteToWorkspaceActiveSession();
  }
}

async function handleLaunchProfile(profileId: string): Promise<void> {
  await launchProfile(profileId);
}

async function handleOpenBinary(binaryId: TerminalBinaryId): Promise<void> {
  await queueBinaryCommand(binaryId);
}

async function handleInstallBinary(binaryId: TerminalBinaryId): Promise<void> {
  await queueInstallCommand(binaryId);
}

async function handleInspectorActionTrigger(actionKey: string): Promise<void> {
  await handleActionTrigger(actionKey);
}

async function handleSessionSelect(sessionId: string): Promise<void> {
  workspace.openTab(sessionId);
  await navigateToSession(sessionId);
}

function handleSessionClose(sessionId: string): void {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  void endSession(normalized);
}

function handleCloseOtherSessions(sessionId: string): void {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const sessionIds = workspace.tabs.value.map((session) => session.sessionId);
  if (!sessionIds.includes(normalized)) return;
  for (const candidateId of sessionIds) {
    if (candidateId !== normalized) {
      void endSession(candidateId);
    }
  }
  workspace.openTab(normalized);
  void navigateToSession(normalized);
}

function handleCloseSessionsToRight(sessionId: string): void {
  const normalized = String(sessionId || '').trim();
  if (!normalized) return;
  const sessionIds = workspace.tabs.value.map((session) => session.sessionId);
  const sourceIndex = sessionIds.indexOf(normalized);
  if (sourceIndex < 0) return;
  for (const candidateId of sessionIds.slice(sourceIndex + 1)) {
    void endSession(candidateId);
  }
  const activeSessionStillOpen = workspace.tabs.value.some(
    (session) => session.sessionId === workspace.activeSessionId.value,
  );
  if (workspace.activeSessionId.value && !activeSessionStillOpen) {
    workspace.openTab(normalized);
  }
  void syncRouteToWorkspaceActiveSession();
}

</script>
