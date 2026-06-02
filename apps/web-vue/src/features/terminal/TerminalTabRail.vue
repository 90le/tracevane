<template>
  <nav
    ref="tabRailRef"
    class="terminal-tab-rail"
    :class="{ 'terminal-tab-rail--compact': compactMode }"
    aria-label="Terminal sessions"
    role="tablist"
  >
    <div class="terminal-tab-scroll">
      <div
        v-for="tab in visibleTabs"
        :key="tab.sessionId"
        class="terminal-tab"
        :class="{
          active: tab.sessionId === activeSessionId,
          'terminal-tab--pinned': tab.pinned,
          'terminal-tab--dragging': draggedSessionId === tab.sessionId,
          'terminal-tab--drop-before': dropTarget?.sessionId === tab.sessionId && dropTarget.position === 'before',
          'terminal-tab--drop-after': dropTarget?.sessionId === tab.sessionId && dropTarget.position === 'after',
        }"
        :draggable="editingSessionId !== tab.sessionId"
        role="presentation"
        @auxclick.prevent="handleTabAuxClick($event, tab)"
        @contextmenu.prevent="openContextMenu($event, tab)"
        @dragstart="startTabDrag($event, tab)"
        @dragover.prevent="handleTabDragOver($event, tab)"
        @drop.prevent="dropTab($event, tab)"
        @dragend="endTabDrag"
      >
        <template v-if="editingSessionId === tab.sessionId">
          <input
            ref="renameInputRef"
            v-model="renameDraft"
            class="terminal-tab-rename-input"
            type="text"
            @keydown.enter.prevent="saveRename(tab.sessionId)"
            @keydown.esc.prevent="cancelRename"
          />
          <button
            type="button"
            class="terminal-tab-rename-save"
            :title="text('保存名称', 'Save name')"
            :aria-label="text('保存名称', 'Save name')"
            @click="saveRename(tab.sessionId)"
          >
            <Check class="terminal-tab-action-icon" aria-hidden="true" />
            <span class="sr-only">{{ text('保存', 'Save') }}</span>
          </button>
          <button
            type="button"
            class="terminal-tab-rename-cancel"
            :title="text('取消重命名', 'Cancel rename')"
            :aria-label="text('取消重命名', 'Cancel rename')"
            @click="cancelRename"
          >
            <X class="terminal-tab-action-icon" aria-hidden="true" />
            <span class="sr-only">{{ text('取消', 'Cancel') }}</span>
          </button>
        </template>

        <template v-else>
          <button
            type="button"
            class="terminal-tab-select"
            role="tab"
            :aria-selected="tab.sessionId === activeSessionId"
            :title="tabTooltip(tab)"
            :data-terminal-tab-id="tab.sessionId"
            @click="$emit('select', tab.sessionId)"
            @dblclick="startRename(tab)"
            @keydown="handleTabButtonKeydown($event, tab)"
          >
            <span class="terminal-tab-title-row">
              <span class="terminal-tab-dot" :data-tone="getStatusSummary(tab).tone"></span>
              <span v-if="tab.pinned" class="terminal-tab-pin" aria-hidden="true">★</span>
              <span class="terminal-tab-title">{{ text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn) }}</span>
            </span>
          </button>
          <div class="terminal-tab-actions">
            <button
              type="button"
              class="terminal-tab-close"
              :aria-label="text('关闭标签', 'Close tab')"
              @click="$emit('close', tab.sessionId)"
            >
              <X class="terminal-tab-action-icon" aria-hidden="true" />
            </button>
            <div class="terminal-tab-menu">
              <button
                type="button"
                class="terminal-tab-menu__trigger"
                :aria-label="text('标签操作', 'Tab actions')"
                :aria-expanded="contextMenuTab?.sessionId === tab.sessionId"
                @click.stop="openInlineContextMenu($event, tab)"
              >
                <MoreHorizontal class="terminal-tab-action-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="terminal-tab-rail-actions">
      <slot name="actions"></slot>

      <details v-if="hiddenTabs.length" ref="overflowMenuRef" class="terminal-tab-overflow">
        <summary
          class="terminal-tab-overflow__trigger"
          :title="text('隐藏的终端标签', 'Hidden terminal tabs')"
          :aria-label="text('隐藏的终端标签', 'Hidden terminal tabs')"
        >
          <ChevronDown class="terminal-tab-overflow__icon" aria-hidden="true" />
          <span class="terminal-tab-overflow__count">{{ hiddenTabs.length }}</span>
          <span class="sr-only">{{ text('隐藏的终端标签', 'Hidden terminal tabs') }}</span>
        </summary>
        <div class="terminal-tab-overflow__menu" role="menu" :aria-label="text('隐藏的终端标签', 'Hidden terminal tabs')">
          <div
            v-for="tab in hiddenTabs"
            :key="tab.sessionId"
            class="terminal-tab-overflow__row"
            :class="{
              'terminal-tab-overflow__row--active': tab.sessionId === activeSessionId,
              'terminal-tab-overflow__row--pinned': tab.pinned,
            }"
            role="none"
          >
            <button
              type="button"
              class="terminal-tab-overflow__item"
              role="menuitem"
              :title="tabTooltip(tab)"
              :aria-current="tab.sessionId === activeSessionId ? 'page' : undefined"
              @click="selectOverflowTab(tab)"
            >
              <span class="terminal-tab-overflow__titleline">
                <span class="terminal-tab-dot" :data-tone="getStatusSummary(tab).tone"></span>
                <strong>{{ text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn) }}</strong>
                <span v-if="tab.pinned" class="terminal-tab-pin" aria-hidden="true">★</span>
              </span>
              <span class="terminal-tab-overflow__meta">{{ overflowTabMeta(tab) }}</span>
            </button>
            <div class="terminal-tab-overflow__actions" role="none">
              <button
                type="button"
                class="terminal-tab-overflow__close"
                role="menuitem"
                :aria-label="text('关闭隐藏标签', 'Close hidden tab')"
                @click.stop="closeOverflowTab(tab)"
              >
                <X class="terminal-tab-action-icon" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="terminal-tab-overflow__menu-trigger"
                role="menuitem"
                :aria-label="text('隐藏标签操作', 'Hidden tab actions')"
                :aria-expanded="contextMenuTab?.sessionId === tab.sessionId"
                @click.stop="openOverflowContextMenu($event, tab)"
              >
                <MoreHorizontal class="terminal-tab-action-icon" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </details>

      <button
        type="button"
        class="terminal-tab-add"
        :title="text('新建终端标签', 'New terminal tab')"
        :aria-label="text('新建终端标签', 'New terminal tab')"
        @click="$emit('create')"
      >
        <Plus class="terminal-tab-add__icon" aria-hidden="true" />
      </button>
    </div>

    <div
      v-if="contextMenuTab"
      class="terminal-tab-menu__panel terminal-tab-context-menu"
      role="menu"
      :style="contextMenuStyle"
      @click.stop
      @contextmenu.prevent
    >
      <button type="button" role="menuitem" @click="togglePin(contextMenuTab)">
        <PinOff v-if="contextMenuTab.pinned" class="terminal-tab-menu__icon" aria-hidden="true" />
        <Pin v-else class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ contextMenuTab.pinned ? text('取消固定', 'Unpin') : text('固定标签', 'Pin Tab') }}
      </button>
      <button type="button" role="menuitem" :disabled="tabIndex(contextMenuTab.sessionId) <= 0" @click="moveTab(contextMenuTab, 'left')">
        <ArrowLeft class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('左移', 'Move Left') }}
      </button>
      <button type="button" role="menuitem" :disabled="tabIndex(contextMenuTab.sessionId) >= props.tabs.length - 1" @click="moveTab(contextMenuTab, 'right')">
        <ArrowRight class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('右移', 'Move Right') }}
      </button>
      <button type="button" role="menuitem" @click="splitTab(contextMenuTab, 'right')">
        <ArrowRight class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('向右拆分', 'Split Right') }}
      </button>
      <button type="button" role="menuitem" @click="splitTab(contextMenuTab, 'down')">
        <ArrowDown class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('向下拆分', 'Split Down') }}
      </button>
      <button type="button" role="menuitem" @click="startRename(contextMenuTab)">
        <Pencil class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('重命名', 'Rename') }}
      </button>
      <button type="button" role="menuitem" @click="closeTab(contextMenuTab)">
        <X class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('关闭标签', 'Close Tab') }}
      </button>
      <button type="button" role="menuitem" :disabled="props.tabs.length <= 1" @click="closeOtherTabs(contextMenuTab)">
        <X class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('关闭其他标签', 'Close Others') }}
      </button>
      <button type="button" role="menuitem" :disabled="tabIndex(contextMenuTab.sessionId) >= props.tabs.length - 1" @click="closeTabsToRight(contextMenuTab)">
        <X class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('关闭右侧标签', 'Close Tabs to Right') }}
      </button>
      <button
        v-if="contextMenuTab.status === 'running' || contextMenuTab.status === 'detached'"
        type="button"
        role="menuitem"
        @click="endTab(contextMenuTab)"
      >
        <Square class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('结束会话', 'End Session') }}
      </button>
      <button
        v-if="contextMenuTab.status === 'completed' || contextMenuTab.status === 'failed' || contextMenuTab.status === 'lost'"
        type="button"
        class="danger"
        role="menuitem"
        @click="deleteTab(contextMenuTab)"
      >
        <Trash2 class="terminal-tab-menu__icon" aria-hidden="true" />
        {{ text('删除会话', 'Delete Session') }}
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Square,
  Trash2,
  X,
} from '@lucide/vue';
import { useLocalePreference } from '../../shared/locale';
import type { TerminalSessionDescriptor } from './terminal-session-registry';
import {
  buildTerminalSessionDisplayTitle,
  buildTerminalSessionSourceSummary,
  buildTerminalSessionStatusSummary,
  resolveNextTerminalSessionTabId,
} from './terminal-session-selectors';
const { text } = useLocalePreference();

const props = defineProps<{
  tabs: TerminalSessionDescriptor[];
  activeSessionId: string | null;
}>();

const emit = defineEmits<{
  (e: 'select', sessionId: string): void;
  (e: 'close', sessionId: string): void;
  (e: 'rename', payload: { sessionId: string; title: string }): void;
  (e: 'pin', payload: { sessionId: string; pinned: boolean }): void;
  (e: 'move', payload: { sessionId: string; direction: 'left' | 'right' }): void;
  (e: 'reorder', payload: { sessionId: string; targetIndex: number }): void;
  (e: 'split', payload: { sessionId: string; direction: 'right' | 'down' }): void;
  (e: 'end', sessionId: string): void;
  (e: 'delete', sessionId: string): void;
  (e: 'closeOthers', sessionId: string): void;
  (e: 'closeToRight', sessionId: string): void;
  (e: 'create'): void;
}>();

const editingSessionId = ref<string | null>(null);
const renameDraft = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);
const tabRailRef = ref<HTMLElement | null>(null);
const overflowMenuRef = ref<HTMLDetailsElement | null>(null);
const compactMode = ref(false);
const contextMenu = ref<{
  sessionId: string;
  left: number;
  top: number;
} | null>(null);
const draggedSessionId = ref('');
const dropTarget = ref<{
  sessionId: string;
  position: 'before' | 'after';
} | null>(null);
const TERMINAL_TAB_DRAG_MIME = 'application/x-openclaw-terminal-tab';
const TERMINAL_TAB_COMPACT_WIDTH = 560;
const TERMINAL_TAB_COMPACT_VISIBLE_LIMIT = 4;
const TERMINAL_TAB_CONTEXT_MENU_WIDTH = 230;
const TERMINAL_TAB_CONTEXT_MENU_HEIGHT = 360;
let tabRailResizeObserver: ResizeObserver | null = null;

function updateCompactMode(): void {
  const viewportCompact = typeof window !== 'undefined' && window.innerWidth <= 720;
  const railWidth = resolveTabRailWidth();
  compactMode.value = viewportCompact || railWidth <= TERMINAL_TAB_COMPACT_WIDTH;
}

function resolveTabRailWidth(): number {
  const measuredWidth = tabRailRef.value?.getBoundingClientRect().width || 0;
  if (measuredWidth > 0) return measuredWidth;
  return typeof window !== 'undefined' ? window.innerWidth : 1024;
}

const visibleTabs = computed(() => {
  if (!compactMode.value || props.tabs.length <= TERMINAL_TAB_COMPACT_VISIBLE_LIMIT) {
    return props.tabs;
  }

  const keep = new Set<string>();
  props.tabs
    .filter((tab) => tab.pinned)
    .forEach((tab) => keep.add(tab.sessionId));

  if (props.activeSessionId) {
    keep.add(props.activeSessionId);
  }

  for (let index = props.tabs.length - 1; index >= 0 && keep.size < TERMINAL_TAB_COMPACT_VISIBLE_LIMIT; index -= 1) {
    keep.add(props.tabs[index].sessionId);
  }

  return props.tabs.filter((tab) => keep.has(tab.sessionId));
});

const hiddenTabs = computed(() => {
  const visibleIds = new Set(visibleTabs.value.map((tab) => tab.sessionId));
  return props.tabs.filter((tab) => !visibleIds.has(tab.sessionId));
});

const contextMenuTab = computed(() => {
  const sessionId = contextMenu.value?.sessionId || '';
  return props.tabs.find((tab) => tab.sessionId === sessionId) || null;
});
const contextMenuStyle = computed(() => {
  if (!contextMenu.value) return {};
  return {
    left: `${contextMenu.value.left}px`,
    top: `${contextMenu.value.top}px`,
  };
});

onMounted(() => {
  updateCompactMode();
  if (typeof ResizeObserver !== 'undefined' && tabRailRef.value) {
    tabRailResizeObserver = new ResizeObserver(updateCompactMode);
    tabRailResizeObserver.observe(tabRailRef.value);
  }
  void nextTick(updateCompactMode);
  document.addEventListener('pointerdown', closeContextMenuFromOutside, true);
  document.addEventListener('focusin', closeContextMenuFromOutside, true);
  window.addEventListener('resize', updateCompactMode);
  window.addEventListener('resize', closeMenus);
  window.addEventListener('click', closeMenus);
  window.addEventListener('keydown', handleWindowKeydown);
});

onBeforeUnmount(() => {
  tabRailResizeObserver?.disconnect();
  tabRailResizeObserver = null;
  document.removeEventListener('pointerdown', closeContextMenuFromOutside, true);
  document.removeEventListener('focusin', closeContextMenuFromOutside, true);
  window.removeEventListener('resize', updateCompactMode);
  window.removeEventListener('resize', closeMenus);
  window.removeEventListener('click', closeMenus);
  window.removeEventListener('keydown', handleWindowKeydown);
});

function startRename(tab: TerminalSessionDescriptor): void {
  closeMenus();
  editingSessionId.value = tab.sessionId;
  renameDraft.value = tab.title || tab.sessionId;
  void nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
}

function cancelRename(): void {
  editingSessionId.value = null;
  renameDraft.value = '';
}

function saveRename(sessionId: string): void {
  const normalizedTitle = String(renameDraft.value || '').trim();
  if (!normalizedTitle) {
    cancelRename();
    return;
  }
  emit('rename', { sessionId, title: normalizedTitle });
  cancelRename();
}

function closeMenus(): void {
  contextMenu.value = null;
}

function closeContextMenuFromOutside(event: Event): void {
  if (!contextMenu.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest('.terminal-tab-context-menu')) return;
  closeMenus();
}

function closeOverflowMenu(): void {
  overflowMenuRef.value?.removeAttribute('open');
}

function selectRelativeTab(direction: -1 | 1): boolean {
  const nextSessionId = resolveNextTerminalSessionTabId(
    props.tabs,
    props.activeSessionId,
    direction,
  );
  if (!nextSessionId || nextSessionId === props.activeSessionId) return false;
  emit('select', nextSessionId);
  closeMenus();
  closeOverflowMenu();
  return true;
}

function selectTabByIndex(index: number): boolean {
  const tab = props.tabs[index] || null;
  if (!tab || tab.sessionId === props.activeSessionId) return false;
  emit('select', tab.sessionId);
  closeMenus();
  closeOverflowMenu();
  void nextTick(() => focusTabButton(tab.sessionId));
  return true;
}

function focusTabButton(sessionId: string): void {
  const normalized = cssEscapeValue(sessionId);
  const button = tabRailRef.value?.querySelector<HTMLButtonElement>(
    `[data-terminal-tab-id="${normalized}"]`,
  );
  button?.focus();
}

function cssEscapeValue(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
}

function startTabDrag(event: DragEvent, tab: TerminalSessionDescriptor): void {
  if (editingSessionId.value === tab.sessionId) return;
  closeMenus();
  draggedSessionId.value = tab.sessionId;
  dropTarget.value = null;
  event.dataTransfer?.setData(TERMINAL_TAB_DRAG_MIME, tab.sessionId);
  event.dataTransfer?.setData('text/plain', tab.sessionId);
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleTabDragOver(event: DragEvent, tab: TerminalSessionDescriptor): void {
  const sourceId = readDraggedSessionId(event);
  if (!sourceId || sourceId === tab.sessionId) {
    dropTarget.value = null;
    return;
  }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  dropTarget.value = {
    sessionId: tab.sessionId,
    position: resolveDropPosition(event),
  };
}

function dropTab(event: DragEvent, tab: TerminalSessionDescriptor): void {
  const sourceId = readDraggedSessionId(event);
  const position = dropTarget.value?.sessionId === tab.sessionId
    ? dropTarget.value.position
    : resolveDropPosition(event);
  endTabDrag();
  reorderTab(sourceId, tab.sessionId, position);
}

function endTabDrag(): void {
  draggedSessionId.value = '';
  dropTarget.value = null;
}

function handleTabAuxClick(event: MouseEvent, tab: TerminalSessionDescriptor): void {
  if (event.button !== 1 || editingSessionId.value === tab.sessionId) return;
  emit('close', tab.sessionId);
}

function handleTabButtonKeydown(event: KeyboardEvent, tab: TerminalSessionDescriptor): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    emit('select', tab.sessionId);
    return;
  }
  if (event.key === 'F2') {
    event.preventDefault();
    startRename(tab);
    return;
  }
  if (event.key === 'Delete') {
    event.preventDefault();
    emit('close', tab.sessionId);
    return;
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    selectTabByIndex(Math.max(0, tabIndex(tab.sessionId) - 1));
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    selectTabByIndex(Math.min(props.tabs.length - 1, tabIndex(tab.sessionId) + 1));
    return;
  }
  if (event.key === 'Home') {
    event.preventDefault();
    selectTabByIndex(0);
    return;
  }
  if (event.key === 'End') {
    event.preventDefault();
    selectTabByIndex(props.tabs.length - 1);
    return;
  }
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    openTabContextMenuFromKeyboard(event, tab);
  }
}

function readDraggedSessionId(event: DragEvent): string {
  const fromEvent = event.dataTransfer?.getData(TERMINAL_TAB_DRAG_MIME)
    || event.dataTransfer?.getData('text/plain')
    || '';
  return String(fromEvent || draggedSessionId.value || '').trim();
}

function resolveDropPosition(event: DragEvent): 'before' | 'after' {
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!target) return 'after';
  const rect = target.getBoundingClientRect();
  return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

function reorderTab(sourceId: string, targetId: string, position: 'before' | 'after'): void {
  const normalizedSourceId = String(sourceId || '').trim();
  const normalizedTargetId = String(targetId || '').trim();
  if (!normalizedSourceId || !normalizedTargetId || normalizedSourceId === normalizedTargetId) return;

  const orderedIds = props.tabs.map((tab) => tab.sessionId);
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
    sessionId: normalizedSourceId,
    targetIndex: boundedIndex,
  });
}

function handleWindowKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    closeMenus();
    cancelRename();
    endTabDrag();
    return;
  }

  const key = event.key.toLowerCase();
  if (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && !event.shiftKey
    && (key === 'pageup' || key === 'pagedown')
    && !isTerminalTabNavigationEditableTarget(event.target)
    && selectRelativeTab(key === 'pageup' ? -1 : 1)
  ) {
    event.preventDefault();
    return;
  }

  if (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && key === 'tab'
    && !isTerminalTabNavigationEditableTarget(event.target)
    && selectRelativeTab(event.shiftKey ? -1 : 1)
  ) {
    event.preventDefault();
  }
}

function isTerminalTabNavigationEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName.toLowerCase();
  return target.isContentEditable
    || tagName === 'input'
    || tagName === 'textarea'
    || tagName === 'select';
}

function openContextMenu(event: MouseEvent, tab: TerminalSessionDescriptor): void {
  emit('select', tab.sessionId);
  contextMenu.value = {
    sessionId: tab.sessionId,
    ...resolveContextMenuPosition(event.clientX, event.clientY),
  };
}

function openInlineContextMenu(event: MouseEvent, tab: TerminalSessionDescriptor): void {
  emit('select', tab.sessionId);
  const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  if (!target) {
    openContextMenu(event, tab);
    return;
  }
  const rect = target.getBoundingClientRect();
  contextMenu.value = {
    sessionId: tab.sessionId,
    ...resolveContextMenuPosition(
      rect.right - TERMINAL_TAB_CONTEXT_MENU_WIDTH,
      rect.bottom + 6,
    ),
  };
}

function openTabContextMenuFromKeyboard(event: KeyboardEvent, tab: TerminalSessionDescriptor): void {
  emit('select', tab.sessionId);
  closeOverflowMenu();
  const target = event.currentTarget instanceof HTMLElement
    ? event.currentTarget
    : tabRailRef.value?.querySelector<HTMLElement>(`[data-terminal-tab-id="${cssEscapeValue(tab.sessionId)}"]`) || null;
  const rect = target?.getBoundingClientRect();
  contextMenu.value = {
    sessionId: tab.sessionId,
    ...resolveContextMenuPosition(
      rect?.left ?? 16,
      (rect?.bottom ?? 64) + 6,
    ),
  };
}

function resolveContextMenuPosition(
  rawLeft: number,
  rawTop: number,
): { left: number; top: number } {
  const viewportWidth = typeof window === 'undefined'
    ? rawLeft + TERMINAL_TAB_CONTEXT_MENU_WIDTH
    : window.innerWidth;
  const viewportHeight = typeof window === 'undefined'
    ? rawTop + TERMINAL_TAB_CONTEXT_MENU_HEIGHT
    : window.innerHeight;
  return {
    left: Math.max(8, Math.min(rawLeft, viewportWidth - TERMINAL_TAB_CONTEXT_MENU_WIDTH - 8)),
    top: Math.max(8, Math.min(rawTop, viewportHeight - TERMINAL_TAB_CONTEXT_MENU_HEIGHT - 8)),
  };
}

function selectOverflowTab(tab: TerminalSessionDescriptor): void {
  emit('select', tab.sessionId);
  closeOverflowMenu();
}

function closeOverflowTab(tab: TerminalSessionDescriptor): void {
  emit('close', tab.sessionId);
  closeOverflowMenu();
}

function openOverflowContextMenu(event: MouseEvent, tab: TerminalSessionDescriptor): void {
  closeOverflowMenu();
  openInlineContextMenu(event, tab);
}

function togglePin(tab: TerminalSessionDescriptor): void {
  emit('pin', { sessionId: tab.sessionId, pinned: !tab.pinned });
  closeMenus();
}

function moveTab(tab: TerminalSessionDescriptor, direction: 'left' | 'right'): void {
  emit('move', { sessionId: tab.sessionId, direction });
  closeMenus();
}

function splitTab(tab: TerminalSessionDescriptor, direction: 'right' | 'down'): void {
  emit('split', { sessionId: tab.sessionId, direction });
  closeMenus();
}

function closeTab(tab: TerminalSessionDescriptor): void {
  emit('close', tab.sessionId);
  closeMenus();
}

function closeOtherTabs(tab: TerminalSessionDescriptor): void {
  emit('closeOthers', tab.sessionId);
  closeMenus();
}

function closeTabsToRight(tab: TerminalSessionDescriptor): void {
  emit('closeToRight', tab.sessionId);
  closeMenus();
}

function endTab(tab: TerminalSessionDescriptor): void {
  emit('end', tab.sessionId);
  closeMenus();
}

function deleteTab(tab: TerminalSessionDescriptor): void {
  emit('delete', tab.sessionId);
  closeMenus();
}

function getStatusSummary(tab: TerminalSessionDescriptor) {
  return buildTerminalSessionStatusSummary({
    status: tab.status,
    controlState: tab.controlState,
    canResume: tab.canResume,
  });
}

function tabIndex(sessionId: string): number {
  return props.tabs.findIndex((tab) => tab.sessionId === sessionId);
}

function buildDisplayTitle(tab: TerminalSessionDescriptor) {
  return buildTerminalSessionDisplayTitle({
    title: tab.title,
    sessionId: tab.sessionId,
  });
}

function tabTooltip(tab: TerminalSessionDescriptor): string {
  const title = text(buildDisplayTitle(tab).labelZh, buildDisplayTitle(tab).labelEn);
  const source = text(buildTerminalSessionSourceSummary(tab.source).labelZh, buildTerminalSessionSourceSummary(tab.source).labelEn);
  const status = text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn);
  const profile = String(tab.profileId || '').trim();
  return [title, source, status, profile ? `${text('配置', 'Profile')}: ${profile}` : '', tab.sessionId]
    .filter(Boolean)
    .join(' · ');
}

function overflowTabMeta(tab: TerminalSessionDescriptor): string {
  const source = text(buildTerminalSessionSourceSummary(tab.source).labelZh, buildTerminalSessionSourceSummary(tab.source).labelEn);
  const status = text(getStatusSummary(tab).labelZh, getStatusSummary(tab).labelEn);
  const cwd = formatCompactPath(tab.cwd);
  const profile = String(tab.profileId || '').trim();
  return [
    status,
    source,
    cwd || (profile ? `${text('配置', 'Profile')}: ${profile}` : ''),
  ].filter(Boolean).join(' · ');
}

function formatCompactPath(path: string | null | undefined): string {
  const normalized = String(path || '').trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length) return normalized;
  return parts.slice(-2).join('/');
}
</script>
