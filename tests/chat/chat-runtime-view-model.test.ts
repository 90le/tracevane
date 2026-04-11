import test from 'node:test';
import assert from 'node:assert/strict';
import { ref } from 'vue';

import { useChatRuntimeViewModel } from '../../apps/web-vue/src/features/chat-v2/chat-runtime-view-model';

function text(chinese: string): string {
  return chinese;
}

function createRuntime(overrides: Record<string, unknown> = {}) {
  return {
    gatewayConnected: true,
    sessionWritable: true,
    activeRunId: null,
    state: 'idle',
    lastEventAt: null,
    lastAckAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    ...overrides,
  };
}

test('activeRuntime prefers the live selected-session runtime over stale history runtime', () => {
  const selectedRuntime = createRuntime({
    activeRunId: 'run-live-2',
    state: 'running',
    lastEventAt: '2026-04-09T16:00:10.000Z',
    lastAckAt: '2026-04-09T16:00:09.000Z',
  });
  const staleHistoryRuntime = createRuntime({
    activeRunId: null,
    state: 'completed',
    lastEventAt: '2026-04-09T16:00:05.000Z',
    lastAckAt: '2026-04-09T16:00:05.000Z',
  });

  const sessionRows = ref([{
    key: 'agent:main:webchat:direct:studio-test',
    agentId: 'main',
    sessionId: 'session-1',
    kind: 'studio_managed',
    label: 'Studio chat · main',
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: '2026-04-09T16:00:10.000Z',
    runtime: selectedRuntime,
    source: {
      type: 'studio',
      path: null,
      mtimeMs: null,
    },
    deliveryContext: {
      mode: 'direct',
      address: null,
      peerLabel: null,
      channel: null,
      accountId: null,
    },
    permissions: {
      visibleInFrontend: true,
      writable: true,
      canSend: true,
      canAbort: true,
      canReset: true,
      canDelete: true,
      canArchive: true,
      canRename: true,
    },
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
  }]);
  const historyPayload = ref({
    checkedAt: '2026-04-09T16:00:10.000Z',
    session: sessionRows.value[0],
    messages: [],
    overlays: [],
    runtime: staleHistoryRuntime,
    diagnostics: null,
    observability: null,
    pageInfo: {
      hasMoreBefore: false,
      beforeCursor: null,
      hasMoreAfter: false,
      afterCursor: null,
    },
    day: null,
  });

  const view = useChatRuntimeViewModel({
    shellMode: ref('chat'),
    sessionRows,
    selectedSessionKey: ref('agent:main:webchat:direct:studio-test'),
    historyPayload,
    renderMessages: ref([]),
    renderOverlays: ref([]),
    routeSessionKey: ref('agent:main:webchat:direct:studio-test'),
    agentRows: ref([]),
    chatHealth: ref(null),
    wsConnected: ref(true),
    text,
  });

  assert.equal(view.activeRuntime.value?.activeRunId, 'run-live-2');
  assert.equal(view.activeRuntime.value?.state, 'running');
});
