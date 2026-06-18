import test from 'node:test';
import assert from 'node:assert/strict';
import { computed, ref } from 'vue';
import { useSessionListWindows } from '../../apps/web-vue/src/features/chat/session-list-view-model.ts';
import {
  CHAT_SESSION_SEARCH_VISIBLE_LIMIT,
  CHAT_SESSION_VISIBLE_LIMITS,
} from '../../lib/chat-session-catalog.ts';
import type { ChatSessionRow } from '../../types/chat.ts';

function createSession(key: string): ChatSessionRow {
  return {
    key,
    agentId: 'main',
    sessionId: key,
    kind: 'studio_managed',
    label: key,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: '2026-04-26T10:00:00.000Z',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
    source: {
      source: 'studio',
      channel: 'webchat',
      surface: 'studio-chat',
      originLabel: 'Tracevane',
    },
    deliveryContext: {
      channel: 'webchat',
      accountId: null,
      to: null,
      threadId: null,
    },
    permissions: {
      writable: true,
      canSend: true,
      canAbort: true,
      canReset: true,
      canDelete: true,
      canInject: false,
      visibleInFrontend: true,
      visibleInMvpRail: true,
    },
    runtime: {
      gatewayConnected: true,
      sessionWritable: true,
      activeRunId: null,
      state: 'idle',
      lastEventAt: null,
      lastAckAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  };
}

test('session list windows ignore observed rows until the observed section is visible', () => {
  const activeSessions = ref(Array.from({ length: 25 }, (_, index) => createSession(`active-${index}`)));
  const observedSessions = ref(Array.from({ length: 25 }, (_, index) => createSession(`observed-${index}`)));
  const showObserved = ref(false);

  const windows = useSessionListWindows({
    filteredActiveSessions: activeSessions,
    filteredArchivedSessions: ref([]),
    filteredObservedSessions: observedSessions,
    visibleFolderEntries: ref([]),
    visibleChildFolders: ref([]),
    currentFolder: ref(null),
    archiveViewOpen: ref(false),
    showObserved,
    searchActive: ref(false),
    loading: ref(false),
    text: (chinese, english) => `${chinese}|${english}`,
  });

  assert.equal(windows.visibleActiveSessions.value.length, 20);
  assert.equal(windows.visibleObservedSessions.value.length, 0);
  assert.equal(windows.observedHiddenCount.value, 0);
  assert.equal(windows.hasHiddenRows.value, true);

  windows.showMoreVisibleSections();
  assert.equal(windows.visibleActiveSessions.value.length, 25);
  assert.equal(windows.visibleObservedSessions.value.length, 0);

  showObserved.value = true;
  assert.equal(windows.visibleObservedSessions.value.length, 20);
  assert.equal(windows.observedHiddenCount.value, 5);

  windows.showMoreVisibleSections();
  assert.equal(windows.visibleObservedSessions.value.length, 25);
  assert.equal(windows.hasHiddenRows.value, false);

  activeSessions.value = [];
  observedSessions.value = [];
  assert.equal(windows.hasVisibleContent.value, false);
  assert.equal(windows.showInitialLoading.value, false);
  assert.equal(computed(() => windows.currentViewSummary.value).value, '');
});

test('session list windows keep search results capped and reset after scope changes', () => {
  const activeSessions = ref(Array.from({ length: CHAT_SESSION_SEARCH_VISIBLE_LIMIT + 12 }, (_, index) => createSession(`search-${index}`)));
  const searchActive = ref(true);

  const windows = useSessionListWindows({
    filteredActiveSessions: activeSessions,
    filteredArchivedSessions: ref([]),
    filteredObservedSessions: ref([]),
    visibleFolderEntries: ref([]),
    visibleChildFolders: ref([]),
    currentFolder: ref(null),
    archiveViewOpen: ref(false),
    showObserved: ref(false),
    searchActive,
    loading: ref(false),
    text: (chinese, english) => `${chinese}|${english}`,
  });

  assert.equal(windows.visibleActiveSessions.value.length, CHAT_SESSION_SEARCH_VISIBLE_LIMIT);
  assert.equal(windows.activeHiddenCount.value, 12);

  windows.showMoreVisibleSections();
  assert.equal(windows.visibleActiveSessions.value.length, activeSessions.value.length);
  assert.equal(windows.activeHiddenCount.value, 0);

  searchActive.value = false;
  windows.resetVisibleCounts();
  assert.equal(windows.visibleActiveSessions.value.length, CHAT_SESSION_VISIBLE_LIMITS.active);
  assert.equal(windows.activeHiddenCount.value, activeSessions.value.length - CHAT_SESSION_VISIBLE_LIMITS.active);
});
