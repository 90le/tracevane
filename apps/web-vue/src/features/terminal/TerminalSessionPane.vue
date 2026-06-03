<template>
  <section
    class="terminal-session-pane"
    :class="{ 'terminal-session-pane--with-preview': Boolean(activePreviewTab) }"
    data-testid="terminal-session-pane"
  >
    <div
      ref="sessionBodyRef"
      class="terminal-session-body"
      :class="sessionBodyClasses"
      :style="sessionBodyStyle"
    >
      <TerminalFilePreviewPane
        v-if="activePreviewTab"
        :tabs="props.previewTabs"
        :active-tab-id="props.activePreviewId"
        :placement="previewPlacement"
        :maximized="previewMaximized"
        :terminal-collapsed="effectiveTerminalCollapsed"
        :workspace-fullscreen="Boolean(props.workspaceFullscreen)"
        @select="emit('selectPreview', $event)"
        @close="emit('closePreview', $event)"
        @reorder="emit('reorderPreview', $event)"
        @set-placement="setPreviewPlacement"
        @toggle-maximize="togglePreviewMaximize"
        @toggle-workspace-fullscreen="emit('toggleWorkspaceFullscreen')"
        @toggle-terminal="toggleTerminalCollapsed"
        @insert-terminal-paths="insertTerminalPaths($event)"
        @reveal-resource="emit('revealResource', $event)"
      />

      <div
        v-if="activePreviewTab && !previewMaximized && !effectiveTerminalCollapsed"
        class="terminal-layout-resizer"
        :data-placement="previewPlacement"
        role="separator"
        tabindex="0"
        :aria-label="text('调整预览与终端大小', 'Resize preview and terminal')"
        :aria-orientation="previewPlacement === 'right' ? 'vertical' : 'horizontal'"
        @pointerdown="startPreviewResize"
        @keydown="resizePreviewFromKeyboard"
      ></div>

      <button
        v-if="activePreviewTab && effectiveTerminalCollapsed"
        type="button"
        class="terminal-session-terminal-restore"
        :title="text('显示终端', 'Show terminal')"
        :aria-label="text('显示终端', 'Show terminal')"
        @click="restoreTerminalPanel"
      >
        <PanelBottomOpen class="terminal-session-terminal-restore__icon" aria-hidden="true" />
        <span>{{ text('显示终端', 'Show terminal') }}</span>
      </button>

      <div v-if="!effectiveTerminalCollapsed" class="terminal-session-main">
        <header class="terminal-stage-header">
          <div class="terminal-stage-header-main">
            <div
              v-if="shouldShowWorkspaceGroups"
              ref="workspaceGroupRailRef"
              class="terminal-workspace-groups"
              role="tablist"
              :aria-label="text('工作区组', 'Workspace groups')"
            >
              <button
                v-for="group in workspaceGroups"
                :key="group.id"
                type="button"
                class="terminal-workspace-group"
                :class="{ active: group.id === effectiveWorkspaceGroupId }"
                role="tab"
                :aria-selected="group.id === effectiveWorkspaceGroupId"
                :title="workspaceGroupTitle(group)"
                @click="selectWorkspaceGroup(group)"
                @keydown="handleWorkspaceGroupKeydown($event, group)"
              >
                <span>{{ workspaceGroupLabel(group) }}</span>
                <small>{{ group.count }}</small>
              </button>
            </div>
            <TerminalTabRail
              :tabs="visibleWorkspaceTabs"
              :active-session-id="props.activeSessionId"
              @select="emit('selectSession', $event)"
              @close="emit('closeSession', $event)"
              @rename="emit('renameSession', $event)"
              @pin="emit('pinSession', $event)"
              @move="emit('moveSession', $event)"
              @reorder="reorderSessionFromWorkspaceGroup"
              @split="emit('splitSession', $event)"
              @close-others="emit('closeOtherSessions', $event)"
              @close-to-right="emit('closeSessionsToRight', $event)"
              @end="emit('endSession', $event)"
              @delete="emit('deleteSession', $event)"
              @create="createSessionInWorkspaceGroup"
            >
              <template #actions>
                <button
                  v-if="activePreviewTab"
                  type="button"
                  class="secondary-button compact-button terminal-stage-action terminal-stage-action--terminal-toggle"
                  :title="text('收起终端面板', 'Collapse terminal panel')"
                  :aria-label="text('收起终端面板', 'Collapse terminal panel')"
                  @click="collapseTerminalPanel"
                >
                  <PanelBottomClose class="terminal-stage-action__icon" aria-hidden="true" />
                  <span class="sr-only">{{ text('收起终端面板', 'Collapse terminal panel') }}</span>
                </button>
                <details
                  ref="stageMenuRef"
                  class="terminal-shortcut-menu terminal-stage-menu"
                  :open="stageMenuOpen"
                  @toggle="syncStageMenuState"
                  @keydown.esc.stop.prevent="closeStageMenu"
                >
                  <summary
                    class="secondary-button compact-button terminal-stage-action terminal-stage-action--menu"
                    :title="text('终端菜单', 'Terminal menu')"
                    :aria-label="text('终端菜单', 'Terminal menu')"
                    :aria-expanded="stageMenuOpen"
                    @click.prevent.stop="toggleStageMenu"
                  >
                    <MoreHorizontal class="terminal-stage-action__icon" aria-hidden="true" />
                    <span class="sr-only">{{ text('终端菜单', 'Terminal menu') }}</span>
                  </summary>
                  <div class="terminal-shortcut-menu__panel terminal-stage-menu__panel">
                    <button type="button" class="terminal-stage-menu__item" :disabled="!resolvedActiveSession?.sessionId" @click="pasteClipboardFromMenu">
                      <ClipboardPaste class="terminal-stage-menu__icon" aria-hidden="true" />
                      {{ text('粘贴', 'Paste') }}
                    </button>
                    <span class="terminal-stage-menu__divider" aria-hidden="true"></span>
                    <button
                      v-if="props.showResourceTrigger"
                      type="button"
                      class="terminal-stage-menu__item terminal-stage-action--resource"
                      @click="openResourceExplorerFromMenu"
                    >
                      <PanelLeftOpen class="terminal-stage-menu__icon" aria-hidden="true" />
                      <span>{{ text('文件', 'Files') }}</span>
                    </button>
                    <button
                      v-if="props.showInspectorTrigger"
                      type="button"
                      class="terminal-stage-menu__item terminal-stage-action--inspector"
                      @click="openInspectorFromMenu"
                    >
                      <PanelRightOpen class="terminal-stage-menu__icon" aria-hidden="true" />
                      <span>{{ text('工具', 'Tools') }}</span>
                    </button>
                    <template v-if="hasMultiplePaneSessions">
                      <span class="terminal-stage-menu__divider" aria-hidden="true"></span>
                      <div class="terminal-stage-menu__section" role="group" :aria-label="text('窗格布局', 'Pane layout')">
                        <span class="terminal-stage-menu__section-label">{{ text('窗格布局', 'Pane layout') }}</span>
                        <button
                          type="button"
                          class="terminal-stage-menu__item"
                          :class="{ active: effectivePaneLayout === 'columns' }"
                          :aria-pressed="effectivePaneLayout === 'columns'"
                          @click="setPaneLayoutFromMenu('columns')"
                        >
                          <Columns2 class="terminal-stage-menu__icon" aria-hidden="true" />
                          {{ text('左右布局', 'Columns') }}
                        </button>
                        <button
                          type="button"
                          class="terminal-stage-menu__item"
                          :class="{ active: effectivePaneLayout === 'rows' }"
                          :aria-pressed="effectivePaneLayout === 'rows'"
                          @click="setPaneLayoutFromMenu('rows')"
                        >
                          <Rows2 class="terminal-stage-menu__icon" aria-hidden="true" />
                          {{ text('上下布局', 'Rows') }}
                        </button>
                        <button
                          type="button"
                          class="terminal-stage-menu__item"
                          :class="{ active: effectivePaneLayout === 'grid' }"
                          :aria-pressed="effectivePaneLayout === 'grid'"
                          @click="setPaneLayoutFromMenu('grid')"
                        >
                          <LayoutDashboard class="terminal-stage-menu__icon" aria-hidden="true" />
                          {{ text('网格布局', 'Grid') }}
                        </button>
                      </div>
                    </template>
                    <span class="terminal-stage-menu__divider" aria-hidden="true"></span>
                    <div class="terminal-stage-menu__section" role="group" :aria-label="text('终端主题', 'Terminal theme')">
                      <span class="terminal-stage-menu__section-label">{{ text('终端主题', 'Terminal theme') }}</span>
                      <button
                        v-for="theme in terminalThemeOptions"
                        :key="theme.id"
                        type="button"
                        class="terminal-stage-menu__item"
                        :class="{ active: props.terminalTheme === theme.id }"
                        :aria-pressed="props.terminalTheme === theme.id"
                        @click="setTerminalThemeFromMenu(theme.id)"
                      >
                        <Palette class="terminal-stage-menu__icon" aria-hidden="true" />
                        {{ text(theme.labelZh, theme.labelEn) }}
                      </button>
                    </div>
                    <span class="terminal-stage-menu__divider" aria-hidden="true"></span>
                    <button
                      type="button"
                      class="terminal-stage-menu__item terminal-stage-action--clear"
                      :disabled="!resolvedActiveSession?.sessionId"
                      @click="clearTerminalFromMenu"
                    >
                      <Eraser class="terminal-stage-menu__icon" aria-hidden="true" />
                      {{ text('清屏', 'Clear') }}
                    </button>
                    <button
                      type="button"
                      class="terminal-stage-menu__item terminal-stage-action--danger"
                      :disabled="!resolvedActiveSession?.sessionId"
                      @click="endActiveSessionFromMenu"
                    >
                      <Square class="terminal-stage-menu__icon" aria-hidden="true" />
                      {{ text('强制结束', 'Force End') }}
                    </button>
                  </div>
                </details>
              </template>
            </TerminalTabRail>
          </div>
        </header>

        <div
          ref="splitWorkbenchRef"
          class="terminal-split-workbench"
          :data-layout="effectivePaneLayout"
          :data-pane-count="visiblePaneSessions.length"
          :data-resizable="isSplitResizable ? 'true' : 'false'"
          :style="splitWorkbenchStyle"
          data-testid="terminal-split-workbench"
        >
          <template v-for="(pane, index) in visiblePaneSessions" :key="pane.sessionId">
            <section
              class="terminal-split-pane"
              :class="{
                'terminal-split-pane--active': pane.sessionId === props.activeSessionId,
                'terminal-split-pane--resource-drop': resourceDropSessionId === pane.sessionId,
              }"
              data-testid="terminal-split-pane"
              @dragover="handlePaneDragOver($event, pane.sessionId)"
              @dragleave="handlePaneDragLeave($event, pane.sessionId)"
              @drop="handlePaneDrop($event, pane.sessionId)"
            >
              <header v-if="visiblePaneSessions.length > 1" class="terminal-split-pane__bar">
                <button
                  type="button"
                  class="terminal-split-pane__title"
                  :title="paneTooltipLabel(pane)"
                  :aria-label="paneTooltipLabel(pane)"
                  @click="emit('selectSession', pane.sessionId)"
                >
                  <strong>{{ paneTitleLabel(pane) }}</strong>
                </button>
                <button
                  type="button"
                  class="terminal-split-pane__close"
                  :aria-label="text('关闭拆分窗格', 'Close split pane')"
                  @click="emit('closePane', pane.sessionId)"
                >
                  <X class="terminal-split-pane__close-icon" aria-hidden="true" />
                </button>
              </header>
              <TerminalConsolePage
                :ref="(component) => setConsolePageRef(pane.sessionId, component)"
                :session-id="pane.sessionId"
                :session-descriptor="pane"
                :queued-command="props.queuedCommand"
                :embedded="true"
                :restore-transcript="pane.sessionId === resolvedActiveSession?.sessionId ? shouldRestoreTranscript : shouldRestoreTranscriptFor(pane)"
                :terminal-theme="props.terminalTheme"
                @consume-queued-command="emit('consumeQueuedCommand', pane.sessionId)"
                @session-attached="emit('sessionAttached', $event)"
              />
            </section>
            <div
              v-if="shouldShowPaneResizer(index)"
              class="terminal-split-pane-resizer"
              :data-orientation="splitPaneResizerOrientation"
              role="separator"
              tabindex="0"
              :aria-label="text('调整终端窗格大小', 'Resize terminal panes')"
              :aria-orientation="splitPaneResizerOrientation"
              :aria-valuemin="TERMINAL_SPLIT_RATIO_MIN"
              :aria-valuemax="TERMINAL_SPLIT_RATIO_MAX"
              :aria-valuenow="splitPaneRatio"
              @pointerdown="startSplitPaneResize"
              @keydown="resizeSplitPaneFromKeyboard"
            ></div>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ClipboardPaste,
  Columns2,
  Eraser,
  LayoutDashboard,
  MoreHorizontal,
  Palette,
  PanelBottomClose,
  PanelBottomOpen,
  PanelLeftOpen,
  PanelRightOpen,
  Rows2,
  Square,
  X,
} from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import TerminalConsolePage from './TerminalConsolePage.vue';
import TerminalFilePreviewPane from './TerminalFilePreviewPane.vue';
import TerminalTabRail from './TerminalTabRail.vue';
import { fetchPersistedTerminalSessionDescriptor } from './api';
import type {
  TerminalFilePreviewTab,
  TerminalPreviewPlacement,
} from './terminal-file-preview';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import {
  buildTerminalSessionDisplayTitle,
  buildTerminalSessionStatusSummary,
} from './terminal-session-selectors';
import {
  TERMINAL_WORKSPACE_ALL_GROUP_ID,
  buildTerminalWorkspaceGroups,
  filterTerminalSessionsByWorkspaceGroup,
  resolveTerminalSessionWorkspaceGroupId,
  type TerminalWorkspaceGroup,
} from './terminal-workspace-groups';
import {
  TERMINAL_RESOURCE_DRAG_MIME,
  canAcceptTerminalResourceDropTypes,
  collectTerminalResourceDropPaths,
  parseTerminalResourceTransfer,
  shellQuoteTerminalPath,
  type TerminalResourceTransferPayload,
} from './terminal-resource-transfer';
import type { TerminalPaneLayout, TerminalQueuedCommand } from './terminal-workspace-state';

type TerminalMultiPaneLayout = Exclude<TerminalPaneLayout, 'single'>;

const props = defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
  activeSession: TerminalSessionDescriptor | null;
  paneSessions: TerminalSessionDescriptor[];
  paneLayout: TerminalPaneLayout;
  previewTabs: TerminalFilePreviewTab[];
  activePreviewId: string;
  workspaceFullscreen?: boolean;
  terminalTheme?: string;
  queuedCommand: TerminalQueuedCommand | null;
  showResourceTrigger?: boolean;
  showInspectorTrigger?: boolean;
}>();

const emit = defineEmits<{
  (e: 'selectSession', sessionId: string): void;
  (e: 'closeSession', sessionId: string): void;
  (e: 'createSession', payload?: { cwd?: string | null; workspaceGroupId?: string | null }): void;
  (e: 'renameSession', payload: { sessionId: string; title: string }): void;
  (e: 'pinSession', payload: { sessionId: string; pinned: boolean }): void;
  (e: 'moveSession', payload: { sessionId: string; direction: 'left' | 'right' }): void;
  (e: 'reorderSession', payload: { sessionId: string; targetIndex: number }): void;
  (e: 'splitSession', payload: { sessionId: string; direction: 'right' | 'down' }): void;
  (e: 'setPaneLayout', layout: TerminalMultiPaneLayout): void;
  (e: 'closeOtherSessions', sessionId: string): void;
  (e: 'closeSessionsToRight', sessionId: string): void;
  (e: 'closePane', sessionId: string): void;
  (e: 'selectPreview', tabId: string): void;
  (e: 'closePreview', tabId?: string): void;
  (e: 'reorderPreview', payload: { tabId: string; targetIndex: number }): void;
  (e: 'toggleWorkspaceFullscreen'): void;
  (e: 'setTerminalTheme', theme: string): void;
  (e: 'revealResource', payload: TerminalResourceTransferPayload): void;
  (e: 'openResourceExplorer'): void;
  (e: 'openInspector'): void;
  (e: 'workspaceGroupChange', payload: { id: string; cwd: string | null }): void;
  (e: 'endSession', sessionId: string): void;
  (e: 'deleteSession', sessionId: string): void;
  (e: 'consumeQueuedCommand', sessionId: string): void;
  (e: 'sessionAttached', session: TerminalSessionDescriptor): void;
}>();
const { text } = useLocalePreference();
const TERMINAL_STAGE_LAYOUT_STORAGE_KEY = 'openclaw-studio.terminal.stageLayout';
const TERMINAL_PREVIEW_SIZE_STORAGE_KEY = 'openclaw-studio.terminal.previewSize';
const TERMINAL_PREVIEW_TERMINAL_COLLAPSED_STORAGE_KEY = 'openclaw-studio.terminal.previewTerminalCollapsed';
const TERMINAL_SPLIT_RATIO_STORAGE_KEY = 'openclaw-studio.terminal.splitPaneRatio';
const TERMINAL_WORKSPACE_GROUP_STORAGE_KEY = 'openclaw-studio.terminal.workspaceGroup';
const TERMINAL_SPLIT_RATIO_MIN = 24;
const TERMINAL_SPLIT_RATIO_MAX = 76;
const TERMINAL_PATH_INSERT_RETRY_LIMIT = 20;
const TERMINAL_PATH_INSERT_RETRY_MS = 80;
const terminalThemeOptions = [
  { id: 'default', labelZh: '默认', labelEn: 'Default' },
  { id: 'matrix', labelZh: '矩阵绿', labelEn: 'Matrix' },
  { id: 'amber', labelZh: '琥珀', labelEn: 'Amber' },
  { id: 'midnight', labelZh: '午夜蓝', labelEn: 'Midnight' },
] as const;

type ConsolePageHandle = {
  clearTerminal: () => void;
  focusTerminal: () => void;
  insertTerminalText: (value: string) => boolean;
  pasteClipboard: () => Promise<boolean>;
  refreshTerminalLayout: () => void;
};

type ResizePointerSnapshot = {
  pointerId: number;
  clientX: number;
  clientY: number;
};

const consolePages = ref<Record<string, ConsolePageHandle | null>>({});
const sessionBodyRef = ref<HTMLElement | null>(null);
const splitWorkbenchRef = ref<HTMLElement | null>(null);
const stageMenuRef = ref<HTMLDetailsElement | null>(null);
const stageMenuOpen = ref(false);
const workspaceGroupRailRef = ref<HTMLElement | null>(null);
const resourceDropSessionId = ref('');
const selectedWorkspaceGroupId = ref('');

const activeSession = ref<TerminalSessionDescriptor | null>(null);
const resolvedActiveSession = computed(() => props.activeSession ?? activeSession.value);
const workspaceGroups = computed(() => buildTerminalWorkspaceGroups(props.tabs));
const activeSessionWorkspaceGroupId = computed(() => {
  const activeSessionId = String(props.activeSessionId || '').trim();
  const activeTab = props.tabs.find((session) => session.sessionId === activeSessionId)
    || resolvedActiveSession.value;
  return resolveTerminalSessionWorkspaceGroupId(activeTab);
});
const effectiveWorkspaceGroupId = computed(() => {
  const selectedGroupId = String(selectedWorkspaceGroupId.value || '').trim();
  if (selectedGroupId && workspaceGroups.value.some((group) => group.id === selectedGroupId)) {
    return selectedGroupId;
  }
  const activeGroupId = activeSessionWorkspaceGroupId.value;
  if (workspaceGroups.value.some((group) => group.id === activeGroupId)) {
    return activeGroupId;
  }
  return TERMINAL_WORKSPACE_ALL_GROUP_ID;
});
const effectiveWorkspaceGroup = computed<TerminalWorkspaceGroup | null>(() =>
  workspaceGroups.value.find((group) => group.id === effectiveWorkspaceGroupId.value) ||
  workspaceGroups.value.find((group) => group.id === TERMINAL_WORKSPACE_ALL_GROUP_ID) ||
  null,
);
const visibleWorkspaceTabs = computed(() => {
  const filteredTabs = filterTerminalSessionsByWorkspaceGroup(
    props.tabs,
    effectiveWorkspaceGroupId.value,
  );
  return filteredTabs.length ? filteredTabs : props.tabs;
});
const shouldShowWorkspaceGroups = computed(() => workspaceGroups.value.length > 2);
const visiblePaneSessions = computed(() => {
  const candidates = props.paneSessions.length
    ? props.paneSessions
    : resolvedActiveSession.value
      ? [resolvedActiveSession.value]
      : [];
  const seen = new Set<string>();
  const sessions: TerminalSessionDescriptor[] = [];
  for (const session of candidates) {
    const sessionId = String(session?.sessionId || '').trim();
    if (!sessionId || seen.has(sessionId)) continue;
    seen.add(sessionId);
    sessions.push(session);
  }
  return sessions;
});
const effectivePaneLayout = computed<TerminalPaneLayout>(() => {
  if (visiblePaneSessions.value.length <= 1) return 'single';
  return props.paneLayout === 'single' ? 'columns' : props.paneLayout;
});
const hasMultiplePaneSessions = computed(() => visiblePaneSessions.value.length > 1);
const activePreviewTab = computed(() =>
  props.previewTabs.find((tab) => tab.id === props.activePreviewId) || null,
);
const previewPlacement = ref<TerminalPreviewPlacement>('top');
const previewSize = ref(42);
const splitPaneRatio = ref(50);
const previewMaximized = ref(false);
const terminalCollapsed = ref(false);
const effectiveTerminalCollapsed = computed(() => Boolean(activePreviewTab.value && terminalCollapsed.value));
const sessionBodyClasses = computed(() => ({
  'terminal-session-body--with-preview': Boolean(activePreviewTab.value),
  [`terminal-session-body--preview-${previewPlacement.value}`]: Boolean(activePreviewTab.value),
  'terminal-session-body--preview-maximized': Boolean(activePreviewTab.value && previewMaximized.value),
  'terminal-session-body--terminal-collapsed': effectiveTerminalCollapsed.value,
}));
const sessionBodyStyle = computed(() => ({
  '--terminal-preview-size': `${previewSize.value}%`,
}));
const splitWorkbenchStyle = computed(() => ({
  '--terminal-split-primary-size': `${splitPaneRatio.value}%`,
}));
const isSplitResizable = computed(() =>
  visiblePaneSessions.value.length === 2
  && (effectivePaneLayout.value === 'columns' || effectivePaneLayout.value === 'rows'),
);
const splitPaneResizerOrientation = computed(() =>
  effectivePaneLayout.value === 'rows' ? 'horizontal' : 'vertical',
);
const shouldRestoreTranscript = computed(() => {
  const session = resolvedActiveSession.value;
  if (!session) return false;
  return shouldRestoreTranscriptFor(session);
});
let descriptorRequestSeq = 0;
let activeResizePointerId: number | null = null;
let activeSplitResizePointerId: number | null = null;
let pendingPreviewResizePointer: ResizePointerSnapshot | null = null;
let previewResizeFrame: number | null = null;
let pendingSplitResizePointer: ResizePointerSnapshot | null = null;
let splitResizeFrame: number | null = null;
const terminalPathInsertRetryTimers = new Set<ReturnType<typeof setTimeout>>();

onMounted(() => {
  const saved = readStageLayoutPreference();
  if (saved) {
    previewPlacement.value = saved;
  }
  const savedSize = readPreviewSizePreference();
  if (savedSize !== null) {
    previewSize.value = savedSize;
  }
  terminalCollapsed.value = readPreviewTerminalCollapsedPreference();
  const savedSplitRatio = readSplitPaneRatioPreference();
  if (savedSplitRatio !== null) {
    splitPaneRatio.value = savedSplitRatio;
  }
  const savedWorkspaceGroupId = readWorkspaceGroupPreference();
  if (savedWorkspaceGroupId) {
    selectedWorkspaceGroupId.value = savedWorkspaceGroupId;
  }
  document.addEventListener('pointerdown', closeStageMenuFromOutside, true);
  window.addEventListener('resize', closeStageMenu);
});

onBeforeUnmount(() => {
  stopPreviewResize();
  stopSplitPaneResize();
  clearTerminalPathInsertRetryTimers();
  document.removeEventListener('pointerdown', closeStageMenuFromOutside, true);
  window.removeEventListener('resize', closeStageMenu);
});

watch(previewPlacement, (placement) => {
  writeStageLayoutPreference(placement);
});

watch(previewSize, (size) => {
  writePreviewSizePreference(size);
});

watch(terminalCollapsed, (collapsed) => {
  writePreviewTerminalCollapsedPreference(collapsed);
});

watch(splitPaneRatio, (ratio) => {
  writeSplitPaneRatioPreference(ratio);
});

watch(selectedWorkspaceGroupId, (groupId) => {
  writeWorkspaceGroupPreference(groupId);
});

watch(
  () => [
    effectiveWorkspaceGroup.value?.id || TERMINAL_WORKSPACE_ALL_GROUP_ID,
    effectiveWorkspaceGroup.value?.cwd || '',
  ] as const,
  ([id, cwd]) => {
    emit('workspaceGroupChange', {
      id,
      cwd: cwd || null,
    });
  },
  { immediate: true },
);

watch(activePreviewTab, (tab) => {
  if (!tab) {
    previewMaximized.value = false;
  }
});

watch(
  () => [props.activeSessionId, props.activeSession?.sessionId || ''] as const,
  ([sessionId, providedSessionId]) => {
    const normalized = String(sessionId || '').trim();
    const requestSeq = ++descriptorRequestSeq;
    if (!normalized) {
      activeSession.value = null;
      return;
    }
    if (providedSessionId === normalized) {
      activeSession.value = null;
      return;
    }

    void fetchPersistedTerminalSessionDescriptor(normalized)
      .then((descriptor) => {
        if (requestSeq !== descriptorRequestSeq) {
          return;
        }
        activeSession.value = descriptor || null;
      })
      .catch(() => {
        if (requestSeq !== descriptorRequestSeq) {
          return;
        }
        activeSession.value = null;
      });
  },
  { immediate: true },
);

watch(
  () => [
    props.activeSessionId,
    props.tabs.map((session) => `${session.sessionId}:${session.cwd || ''}`).join('\n'),
  ] as const,
  () => {
    const selectedGroupId = String(selectedWorkspaceGroupId.value || '').trim();
    if (!selectedGroupId) return;
    if (selectedGroupId === TERMINAL_WORKSPACE_ALL_GROUP_ID) return;
    if (!workspaceGroups.value.some((group) => group.id === selectedGroupId)) {
      selectedWorkspaceGroupId.value = '';
      return;
    }
    const activeSessionId = String(props.activeSessionId || '').trim();
    if (visibleWorkspaceTabs.value.some((session) => session.sessionId === activeSessionId)) {
      return;
    }
    selectedWorkspaceGroupId.value = activeSessionWorkspaceGroupId.value;
  },
);

function setConsolePageRef(sessionId: string, component: unknown): void {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return;
  if (!component) {
    delete consolePages.value[normalizedSessionId];
    return;
  }
  consolePages.value[normalizedSessionId] = component as ConsolePageHandle;
}

function getActiveConsolePage(): ConsolePageHandle | null {
  const activeId = resolveTargetSessionId();
  if (activeId && consolePages.value[activeId]) {
    return consolePages.value[activeId];
  }
  const fallbackId = visiblePaneSessions.value[0]?.sessionId || '';
  return fallbackId ? consolePages.value[fallbackId] || null : null;
}

function resolveTargetSessionId(sessionId = ''): string {
  const requestedId = String(sessionId || '').trim();
  if (requestedId) return requestedId;
  return String(resolvedActiveSession.value?.sessionId || props.activeSessionId || visiblePaneSessions.value[0]?.sessionId || '').trim();
}

function getConsolePageForSession(sessionId = ''): ConsolePageHandle | null {
  const targetId = resolveTargetSessionId(sessionId);
  if (targetId) {
    return consolePages.value[targetId] || null;
  }
  return getActiveConsolePage();
}

function focusActiveTerminal(): void {
  terminalCollapsed.value = false;
  previewMaximized.value = false;
  void nextTick(() => {
    const consolePage = getActiveConsolePage();
    consolePage?.refreshTerminalLayout();
    consolePage?.focusTerminal();
  });
}

function showTerminal(): void {
  focusActiveTerminal();
}

function collapseTerminalPanel(): void {
  if (!activePreviewTab.value) return;
  terminalCollapsed.value = true;
  previewMaximized.value = false;
  closeStageMenu();
}

function restoreTerminalPanel(): void {
  focusActiveTerminal();
}

function showEditor(): boolean {
  if (!activePreviewTab.value) return false;
  terminalCollapsed.value = true;
  previewMaximized.value = false;
  return true;
}

function clearTerminal(): void {
  getActiveConsolePage()?.clearTerminal();
}

function clearTerminalFromMenu(): void {
  clearTerminal();
  closeStageMenu();
}

function pasteClipboard(): void {
  void getActiveConsolePage()?.pasteClipboard();
}

function pasteClipboardFromMenu(): void {
  pasteClipboard();
  closeStageMenu();
}

function openResourceExplorerFromMenu(): void {
  emit('openResourceExplorer');
  closeStageMenu();
}

function openInspectorFromMenu(): void {
  emit('openInspector');
  closeStageMenu();
}

function closeStageMenu(): void {
  stageMenuOpen.value = false;
  stageMenuRef.value?.removeAttribute('open');
}

function toggleStageMenu(): void {
  stageMenuOpen.value = !stageMenuOpen.value;
}

function syncStageMenuState(): void {
  stageMenuOpen.value = Boolean(stageMenuRef.value?.open);
}

function closeStageMenuFromOutside(event: PointerEvent): void {
  if (!stageMenuOpen.value) return;
  const target = event.target;
  if (target instanceof Node && stageMenuRef.value?.contains(target)) return;
  closeStageMenu();
}

function selectWorkspaceGroup(group: TerminalWorkspaceGroup): void {
  selectedWorkspaceGroupId.value = group.id;
  if (group.id === TERMINAL_WORKSPACE_ALL_GROUP_ID) return;
  const activeSessionId = String(props.activeSessionId || '').trim();
  if (activeSessionId && group.sessionIds.includes(activeSessionId)) return;
  const nextSessionId = group.sessionIds[0] || '';
  if (nextSessionId) {
    emit('selectSession', nextSessionId);
  }
}

function handleWorkspaceGroupKeydown(event: KeyboardEvent, group: TerminalWorkspaceGroup): void {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    event.stopPropagation();
    selectRelativeWorkspaceGroup(group, -1);
    return;
  }
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    event.stopPropagation();
    selectRelativeWorkspaceGroup(group, 1);
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    event.stopPropagation();
    selectWorkspaceGroupAtIndex(0);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    event.stopPropagation();
    selectWorkspaceGroupAtIndex(workspaceGroups.value.length - 1);
  }
}

function selectRelativeWorkspaceGroup(group: TerminalWorkspaceGroup, direction: -1 | 1): void {
  const groups = workspaceGroups.value;
  const currentIndex = groups.findIndex((item) => item.id === group.id);
  const fallbackIndex = groups.findIndex((item) => item.id === effectiveWorkspaceGroupId.value);
  const index = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
  selectWorkspaceGroupAtIndex(index + direction);
}

function selectWorkspaceGroupAtIndex(index: number): void {
  const groups = workspaceGroups.value;
  if (!groups.length) return;
  const targetIndex = ((index % groups.length) + groups.length) % groups.length;
  const targetGroup = groups[targetIndex];
  if (!targetGroup) return;
  selectWorkspaceGroup(targetGroup);
  focusWorkspaceGroupAtIndex(targetIndex);
}

function focusWorkspaceGroupAtIndex(index: number): void {
  void nextTick(() => {
    const buttons = Array.from(
      workspaceGroupRailRef.value?.querySelectorAll<HTMLButtonElement>('.terminal-workspace-group') || [],
    );
    buttons[index]?.focus();
  });
}

function createSessionInWorkspaceGroup(): void {
  const group = workspaceGroups.value.find((item) => item.id === effectiveWorkspaceGroupId.value) || null;
  emit('createSession', {
    workspaceGroupId: group?.id || TERMINAL_WORKSPACE_ALL_GROUP_ID,
    cwd: group?.id === TERMINAL_WORKSPACE_ALL_GROUP_ID ? null : group?.cwd || null,
  });
}

function reorderSessionFromWorkspaceGroup(payload: { sessionId: string; targetIndex: number }): void {
  const normalizedSessionId = String(payload?.sessionId || '').trim();
  if (!normalizedSessionId) return;
  if (effectiveWorkspaceGroupId.value === TERMINAL_WORKSPACE_ALL_GROUP_ID) {
    emit('reorderSession', { sessionId: normalizedSessionId, targetIndex: payload.targetIndex });
    return;
  }

  const visibleIds = visibleWorkspaceTabs.value.map((session) => session.sessionId);
  const currentVisibleIndex = visibleIds.indexOf(normalizedSessionId);
  if (currentVisibleIndex < 0) {
    emit('reorderSession', { sessionId: normalizedSessionId, targetIndex: payload.targetIndex });
    return;
  }

  visibleIds.splice(currentVisibleIndex, 1);
  const targetVisibleIndex = Math.max(
    0,
    Math.min(visibleIds.length, Number.isFinite(payload.targetIndex) ? Math.floor(payload.targetIndex) : 0),
  );
  const beforeSessionId = visibleIds[targetVisibleIndex] || '';
  const afterSessionId = visibleIds[targetVisibleIndex - 1] || '';
  const sourceIndex = props.tabs.findIndex((session) => session.sessionId === normalizedSessionId);
  let targetIndex = payload.targetIndex;

  if (beforeSessionId) {
    const beforeIndex = props.tabs.findIndex((session) => session.sessionId === beforeSessionId);
    targetIndex = sourceIndex >= 0 && sourceIndex < beforeIndex
      ? Math.max(0, beforeIndex - 1)
      : beforeIndex;
  } else if (afterSessionId) {
    const afterIndex = props.tabs.findIndex((session) => session.sessionId === afterSessionId);
    targetIndex = sourceIndex >= 0 && sourceIndex < afterIndex
      ? afterIndex
      : afterIndex + 1;
  }

  emit('reorderSession', { sessionId: normalizedSessionId, targetIndex });
}

function workspaceGroupLabel(group: TerminalWorkspaceGroup): string {
  if (group.id === TERMINAL_WORKSPACE_ALL_GROUP_ID) return text('全部', 'All');
  if (!group.cwd) return text('默认', 'Default');
  return group.label;
}

function workspaceGroupTitle(group: TerminalWorkspaceGroup): string {
  const countLabel = text(`${group.count} 个标签`, `${group.count} tabs`);
  if (group.id === TERMINAL_WORKSPACE_ALL_GROUP_ID) return text(`全部工作区 · ${countLabel}`, `All workspaces · ${countLabel}`);
  return `${group.cwd || text('默认目录', 'Default directory')} · ${countLabel}`;
}

function insertTerminalPaths(paths: string[], sessionId = ''): boolean {
  const quotedPaths = paths
    .map((rawPath) => shellQuoteTerminalPath(rawPath))
    .filter(Boolean);
  if (!quotedPaths.length) return false;
  const targetId = resolveTargetSessionId(sessionId);
  if (!targetId) return false;

  terminalCollapsed.value = false;
  previewMaximized.value = false;

  const textToInsert = `${quotedPaths.join(' ')} `;
  if (tryInsertTerminalText(targetId, textToInsert)) return true;

  scheduleDeferredTerminalPathInsert(targetId, textToInsert);
  return true;
}

function tryInsertTerminalText(targetId: string, textToInsert: string): boolean {
  const targetConsole = getConsolePageForSession(targetId);
  const inserted = Boolean(targetConsole?.insertTerminalText(textToInsert));
  if (inserted) {
    targetConsole?.focusTerminal();
  }
  return inserted;
}

function scheduleDeferredTerminalPathInsert(
  targetId: string,
  textToInsert: string,
  attempt = 0,
): void {
  void nextTick(() => {
    if (tryInsertTerminalText(targetId, textToInsert)) return;
    if (attempt >= TERMINAL_PATH_INSERT_RETRY_LIMIT) return;
    const timer = setTimeout(() => {
      terminalPathInsertRetryTimers.delete(timer);
      scheduleDeferredTerminalPathInsert(targetId, textToInsert, attempt + 1);
    }, TERMINAL_PATH_INSERT_RETRY_MS);
    terminalPathInsertRetryTimers.add(timer);
  });
}

function clearTerminalPathInsertRetryTimers(): void {
  for (const timer of terminalPathInsertRetryTimers) {
    clearTimeout(timer);
  }
  terminalPathInsertRetryTimers.clear();
}

function startPreviewResize(event: PointerEvent): void {
  if (!activePreviewTab.value || !sessionBodyRef.value) return;
  activeResizePointerId = event.pointerId;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  updatePreviewSizeFromPointer(event);
  window.addEventListener('pointermove', updatePreviewSizeFromPointer);
  window.addEventListener('pointerup', stopPreviewResize);
  window.addEventListener('pointercancel', stopPreviewResize);
}

function updatePreviewSizeFromPointer(event: PointerEvent): void {
  pendingPreviewResizePointer = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  if (previewResizeFrame !== null) return;
  previewResizeFrame = window.requestAnimationFrame(flushPreviewResizeFromPointer);
}

function flushPreviewResizeFromPointer(): void {
  previewResizeFrame = null;
  const event = pendingPreviewResizePointer;
  pendingPreviewResizePointer = null;
  if (!event) return;
  const body = sessionBodyRef.value;
  if (!body) return;
  if (activeResizePointerId !== null && event.pointerId !== activeResizePointerId) return;
  const rect = body.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  let nextSize = previewSize.value;
  if (previewPlacement.value === 'right') {
    nextSize = ((rect.right - event.clientX) / rect.width) * 100;
  } else if (previewPlacement.value === 'bottom') {
    nextSize = ((rect.bottom - event.clientY) / rect.height) * 100;
  } else {
    nextSize = ((event.clientY - rect.top) / rect.height) * 100;
  }
  previewSize.value = clampPreviewSize(nextSize);
}

function stopPreviewResize(): void {
  activeResizePointerId = null;
  pendingPreviewResizePointer = null;
  if (previewResizeFrame !== null) {
    window.cancelAnimationFrame(previewResizeFrame);
    previewResizeFrame = null;
  }
  window.removeEventListener('pointermove', updatePreviewSizeFromPointer);
  window.removeEventListener('pointerup', stopPreviewResize);
  window.removeEventListener('pointercancel', stopPreviewResize);
}

function startSplitPaneResize(event: PointerEvent): void {
  if (!isSplitResizable.value || !splitWorkbenchRef.value) return;
  activeSplitResizePointerId = event.pointerId;
  (event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
  updateSplitPaneRatioFromPointer(event);
  window.addEventListener('pointermove', updateSplitPaneRatioFromPointer);
  window.addEventListener('pointerup', stopSplitPaneResize);
  window.addEventListener('pointercancel', stopSplitPaneResize);
}

function updateSplitPaneRatioFromPointer(event: PointerEvent): void {
  pendingSplitResizePointer = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
  };
  if (splitResizeFrame !== null) return;
  splitResizeFrame = window.requestAnimationFrame(flushSplitPaneRatioFromPointer);
}

function flushSplitPaneRatioFromPointer(): void {
  splitResizeFrame = null;
  const event = pendingSplitResizePointer;
  pendingSplitResizePointer = null;
  if (!event) return;
  const workbench = splitWorkbenchRef.value;
  if (!workbench || !isSplitResizable.value) return;
  if (activeSplitResizePointerId !== null && event.pointerId !== activeSplitResizePointerId) return;
  const rect = workbench.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const nextRatio = effectivePaneLayout.value === 'rows'
    ? ((event.clientY - rect.top) / rect.height) * 100
    : ((event.clientX - rect.left) / rect.width) * 100;
  splitPaneRatio.value = clampSplitPaneRatio(nextRatio);
}

function stopSplitPaneResize(): void {
  activeSplitResizePointerId = null;
  pendingSplitResizePointer = null;
  if (splitResizeFrame !== null) {
    window.cancelAnimationFrame(splitResizeFrame);
    splitResizeFrame = null;
  }
  window.removeEventListener('pointermove', updateSplitPaneRatioFromPointer);
  window.removeEventListener('pointerup', stopSplitPaneResize);
  window.removeEventListener('pointercancel', stopSplitPaneResize);
}

function resizeSplitPaneFromKeyboard(event: KeyboardEvent): void {
  if (!isSplitResizable.value) return;
  const step = event.shiftKey ? 10 : 4;
  let delta = 0;
  if (effectivePaneLayout.value === 'rows') {
    if (event.key === 'ArrowUp') delta = -step;
    if (event.key === 'ArrowDown') delta = step;
  } else {
    if (event.key === 'ArrowLeft') delta = -step;
    if (event.key === 'ArrowRight') delta = step;
  }
  if (!delta) return;
  event.preventDefault();
  splitPaneRatio.value = clampSplitPaneRatio(splitPaneRatio.value + delta);
}

function resizePreviewFromKeyboard(event: KeyboardEvent): void {
  const step = event.shiftKey ? 10 : 4;
  let delta = 0;
  if (previewPlacement.value === 'right') {
    if (event.key === 'ArrowLeft') delta = step;
    if (event.key === 'ArrowRight') delta = -step;
  } else if (previewPlacement.value === 'bottom') {
    if (event.key === 'ArrowUp') delta = step;
    if (event.key === 'ArrowDown') delta = -step;
  } else {
    if (event.key === 'ArrowDown') delta = step;
    if (event.key === 'ArrowUp') delta = -step;
  }
  if (!delta) return;
  event.preventDefault();
  previewSize.value = clampPreviewSize(previewSize.value + delta);
}

function clampPreviewSize(size: number): number {
  if (!Number.isFinite(size)) return 42;
  return Math.min(76, Math.max(18, Math.round(size)));
}

function clampSplitPaneRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 50;
  return Math.min(
    TERMINAL_SPLIT_RATIO_MAX,
    Math.max(TERMINAL_SPLIT_RATIO_MIN, Math.round(ratio)),
  );
}

function setPreviewPlacement(placement: TerminalPreviewPlacement): void {
  previewPlacement.value = placement;
  previewMaximized.value = false;
}

function togglePreviewMaximize(): void {
  if (!activePreviewTab.value) return;
  previewMaximized.value = !previewMaximized.value;
}

function toggleTerminalCollapsed(): void {
  if (!activePreviewTab.value) return;
  if (terminalCollapsed.value) {
    restoreTerminalPanel();
    return;
  }
  collapseTerminalPanel();
}

function readStageLayoutPreference(): TerminalPreviewPlacement | null {
  try {
    const raw = globalThis.localStorage?.getItem(TERMINAL_STAGE_LAYOUT_STORAGE_KEY);
    if (raw === 'top' || raw === 'right' || raw === 'bottom') {
      return raw;
    }
  } catch {
    // Layout preference is non-critical.
  }
  return null;
}

function writeStageLayoutPreference(placement: TerminalPreviewPlacement): void {
  try {
    globalThis.localStorage?.setItem(TERMINAL_STAGE_LAYOUT_STORAGE_KEY, placement);
  } catch {
    // Layout preference is non-critical.
  }
}

function readPreviewSizePreference(): number | null {
  try {
    const raw = Number(globalThis.localStorage?.getItem(TERMINAL_PREVIEW_SIZE_STORAGE_KEY));
    if (Number.isFinite(raw)) {
      return clampPreviewSize(raw);
    }
  } catch {
    // Layout preference is non-critical.
  }
  return null;
}

function writePreviewSizePreference(size: number): void {
  try {
    globalThis.localStorage?.setItem(TERMINAL_PREVIEW_SIZE_STORAGE_KEY, String(size));
  } catch {
    // Layout preference is non-critical.
  }
}

function readPreviewTerminalCollapsedPreference(): boolean {
  try {
    return globalThis.localStorage?.getItem(TERMINAL_PREVIEW_TERMINAL_COLLAPSED_STORAGE_KEY) === 'true';
  } catch {
    // Terminal collapse preference is non-critical.
  }
  return false;
}

function writePreviewTerminalCollapsedPreference(collapsed: boolean): void {
  try {
    globalThis.localStorage?.setItem(
      TERMINAL_PREVIEW_TERMINAL_COLLAPSED_STORAGE_KEY,
      collapsed ? 'true' : 'false',
    );
  } catch {
    // Terminal collapse preference is non-critical.
  }
}

function readSplitPaneRatioPreference(): number | null {
  try {
    const raw = Number(globalThis.localStorage?.getItem(TERMINAL_SPLIT_RATIO_STORAGE_KEY));
    if (Number.isFinite(raw)) {
      return clampSplitPaneRatio(raw);
    }
  } catch {
    // Layout preference is non-critical.
  }
  return null;
}

function writeSplitPaneRatioPreference(ratio: number): void {
  try {
    globalThis.localStorage?.setItem(TERMINAL_SPLIT_RATIO_STORAGE_KEY, String(clampSplitPaneRatio(ratio)));
  } catch {
    // Layout preference is non-critical.
  }
}

function readWorkspaceGroupPreference(): string {
  try {
    return String(globalThis.localStorage?.getItem(TERMINAL_WORKSPACE_GROUP_STORAGE_KEY) || '').trim();
  } catch {
    // Workspace group preference is non-critical.
  }
  return '';
}

function writeWorkspaceGroupPreference(groupId: string): void {
  try {
    const normalizedGroupId = String(groupId || '').trim();
    if (normalizedGroupId) {
      globalThis.localStorage?.setItem(TERMINAL_WORKSPACE_GROUP_STORAGE_KEY, normalizedGroupId);
    } else {
      globalThis.localStorage?.removeItem(TERMINAL_WORKSPACE_GROUP_STORAGE_KEY);
    }
  } catch {
    // Workspace group preference is non-critical.
  }
}

function shouldShowPaneResizer(index: number): boolean {
  return isSplitResizable.value && index === 0;
}

function handlePaneDragOver(event: DragEvent, sessionId: string): void {
  if (!canAcceptTerminalResourceDrop(event.dataTransfer)) return;
  event.preventDefault();
  resourceDropSessionId.value = sessionId;
  if (!event.dataTransfer) return;
  event.dataTransfer.dropEffect = 'copy';
}

function handlePaneDragLeave(event: DragEvent, sessionId: string): void {
  const nextTarget = event.relatedTarget as Node | null;
  const currentTarget = event.currentTarget as Node | null;
  if (currentTarget?.contains(nextTarget)) return;
  if (resourceDropSessionId.value === sessionId) {
    resourceDropSessionId.value = '';
  }
}

function handlePaneDrop(event: DragEvent, sessionId: string): void {
  if (!canAcceptTerminalResourceDrop(event.dataTransfer)) return;
  event.preventDefault();
  resourceDropSessionId.value = '';
  const rawPayload = event.dataTransfer?.getData(TERMINAL_RESOURCE_DRAG_MIME) || '';
  const payload = parseTerminalResourceTransfer(rawPayload);
  const rawPaths = collectTerminalResourceDropPaths({
    payload,
    text: event.dataTransfer?.getData('text/plain') || '',
    uriList: event.dataTransfer?.getData('text/uri-list') || '',
  });
  if (!rawPaths.length) return;

  emit('selectSession', sessionId);
  insertTerminalPaths(rawPaths, sessionId);
}

function canAcceptTerminalResourceDrop(dataTransfer: DataTransfer | null): boolean {
  return canAcceptTerminalResourceDropTypes(dataTransfer?.types);
}

function endActiveSession(): void {
  const sessionId = String(resolvedActiveSession.value?.sessionId || '').trim();
  if (!sessionId) return;
  emit('endSession', sessionId);
}

function endActiveSessionFromMenu(): void {
  endActiveSession();
  closeStageMenu();
}

function setPaneLayoutFromMenu(layout: TerminalMultiPaneLayout): void {
  emit('setPaneLayout', layout);
  closeStageMenu();
}

function setTerminalThemeFromMenu(theme: string): void {
  emit('setTerminalTheme', theme);
  closeStageMenu();
}

function shouldRestoreTranscriptFor(session: TerminalSessionDescriptor): boolean {
  return session.status !== 'running' || Boolean(session.recentOutputSummary?.tailText);
}

function paneTitleLabel(session: TerminalSessionDescriptor): string {
  const title = buildTerminalSessionDisplayTitle({
    title: session.title,
    sessionId: session.sessionId,
  });
  return text(title.labelZh, title.labelEn);
}

function paneStatusLabel(session: TerminalSessionDescriptor): string {
  const summary = buildTerminalSessionStatusSummary({
    status: session.status,
    controlState: session.controlState,
    canResume: session.canResume,
  });
  return text(summary.labelZh, summary.labelEn);
}

function paneTooltipLabel(session: TerminalSessionDescriptor): string {
  return [
    paneTitleLabel(session),
    paneStatusLabel(session),
    formatTargetLabel(session.targetKind),
  ].filter(Boolean).join(' · ');
}

function formatTargetLabel(targetKind: string | null | undefined): string {
  if (targetKind === 'ssh') return 'SSH';
  if (targetKind === 'container') return 'Container';
  if (targetKind === 'kubernetes') return 'Kubernetes';
  return text('本地', 'Local');
}

defineExpose({
  focusActiveTerminal,
  showTerminal,
  showEditor,
  insertTerminalPaths,
});

</script>
