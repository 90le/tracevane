import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const {
  buildChatRoute,
  hasBrokenChatRouteSessionRef,
  shouldNormalizeChatSessionQueryRoute,
  resolveChatRouteSessionKey,
  resolveFallbackSessionKey,
  resolveRequestedOrFallbackSessionKey,
  saveChatRuntimeSnapshot,
  readChatRuntimeSnapshot,
} = await import('../../apps/web-vue/src/features/chat-v2/chat-runtime-recovery.ts');

function createSession(key, overrides = {}) {
  return {
    key,
    agentId: 'agent-main',
    sessionId: `${key}-id`,
    kind: 'studio_managed',
    label: key,
    derivedTitle: null,
    lastMessagePreview: null,
    updatedAt: '2026-04-14T12:00:00.000Z',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
    },
    permissions: {
      writable: true,
      inspectable: true,
      visibleInFrontend: true,
    },
    runtime: null,
    ...overrides,
  };
}

test('resolveChatRouteSessionKey prefers route param, then query ref, then legacy query', () => {
  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: 'r1_YWJj',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: 'legacy',
  }), 'abc');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: '',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: 'legacy',
  }), 'def');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: 'not-a-session-ref',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: 'legacy',
  }), 'def');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: 'not-a-session-ref',
    routeQuerySessionRef: 'not-a-session-ref',
    legacyQuerySession: 'legacy',
  }), 'legacy');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: '',
    routeQuerySessionRef: 'not-a-session-ref',
    legacyQuerySession: 'legacy',
  }), 'legacy');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: 'legacy',
  }), 'legacy');

  assert.equal(resolveChatRouteSessionKey({
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: '   ',
  }), null);
});

test('hasBrokenChatRouteSessionRef only turns true for undecodable path params', () => {
  assert.equal(hasBrokenChatRouteSessionRef({ routeParamSessionRef: 'r1_YWJj' }), false);
  assert.equal(hasBrokenChatRouteSessionRef({ routeParamSessionRef: 'not-a-session-ref' }), true);
  assert.equal(hasBrokenChatRouteSessionRef({ routeParamSessionRef: '' }), false);
});

test('shouldNormalizeChatSessionQueryRoute only normalizes true legacy query routes', () => {
  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat/s/r1_YWJj',
    shellMode: 'chat',
    routeParamSessionRef: 'r1_YWJj',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: 'legacy',
  }), false);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat/s/not-a-session-ref',
    shellMode: 'chat',
    routeParamSessionRef: 'not-a-session-ref',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: '',
  }), true);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat',
    shellMode: 'chat',
    routeParamSessionRef: '',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: '',
  }), true);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat/workbench',
    shellMode: 'inspect',
    routeParamSessionRef: '',
    routeQuerySessionRef: 'r1_ZGVm',
    legacyQuerySession: '',
  }), false);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat/workbench',
    shellMode: 'inspect',
    routeParamSessionRef: '',
    routeQuerySessionRef: 'not-a-session-ref',
    legacyQuerySession: '',
  }), true);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat',
    shellMode: 'chat',
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: 'legacy',
  }), true);

  assert.equal(shouldNormalizeChatSessionQueryRoute({
    currentPath: '/chat',
    shellMode: 'chat',
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: '   ',
  }), false);
});

test('buildChatRoute keeps inspect mode on /chat/workbench with sessionRef query', () => {
  assert.deepEqual(buildChatRoute({
    currentPath: '/chat/workbench',
    shellMode: 'inspect',
    sessionKey: 'agent:main:session-1',
  }), {
    path: '/chat/workbench',
    query: {
      sessionRef: 'r1_YWdlbnQ6bWFpbjpzZXNzaW9uLTE',
    },
  });
});

test('buildChatRoute preserves /chat as the unified home entry and deep-links from session routes', () => {
  assert.deepEqual(buildChatRoute({
    currentPath: '/chat',
    shellMode: 'chat',
    sessionKey: 'agent:main:session-1',
  }), {
    path: '/chat',
  });

  assert.deepEqual(buildChatRoute({
    currentPath: '/chat/s/r1_YWdlbnQ6bWFpbjpzZXNzaW9uLTE',
    shellMode: 'chat',
    sessionKey: 'agent:main:session-1',
  }), {
    path: '/chat/s/r1_YWdlbnQ6bWFpbjpzZXNzaW9uLTE',
  });
});

test('resolveFallbackSessionKey prefers stored session when still available', () => {
  const availableSessions = [createSession('session-a'), createSession('session-b')];
  assert.equal(resolveFallbackSessionKey({
    availableSessions,
    storedSessionKey: 'session-b',
  }), 'session-b');

  assert.equal(resolveFallbackSessionKey({
    availableSessions,
    storedSessionKey: 'session-missing',
  }), 'session-a');
});

test('resolveRequestedOrFallbackSessionKey falls back when route points at missing session', () => {
  const availableSessions = [createSession('session-a'), createSession('session-b')];

  assert.equal(resolveRequestedOrFallbackSessionKey({
    requestedSessionKey: 'session-b',
    availableSessions,
    storedSessionKey: 'session-a',
  }), 'session-b');

  assert.equal(resolveRequestedOrFallbackSessionKey({
    requestedSessionKey: 'session-missing',
    availableSessions,
    storedSessionKey: 'session-b',
  }), 'session-b');

  assert.equal(resolveRequestedOrFallbackSessionKey({
    requestedSessionKey: 'session-missing',
    availableSessions,
    storedSessionKey: 'session-gone',
  }), 'session-a');
});

test('runtime snapshots trim oversized ledgers to the recent window before restore', () => {
  const storage = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem(key) {
        return storage.has(key) ? storage.get(key) : null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      },
    },
  };

  const sessionKey = 'agent:main:oversized';
  const messages = Array.from({ length: 260 }, (_, index) => ({
    id: `msg-${index + 1}`,
    role: 'assistant',
    text: `message ${index + 1}`,
    createdAt: `2026-04-24T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    source: 'history',
    runId: index >= 255 ? 'run-live' : `run-${index + 1}`,
    truncated: false,
    omitted: false,
    aborted: false,
    stopReason: null,
  }));
  const payload = {
    checkedAt: '2026-04-24T12:00:00.000Z',
    session: createSession(sessionKey),
    messages: messages.slice(-24),
    overlays: [
      {
        runId: 'run-live',
        startedAt: '2026-04-24T12:55:00.000Z',
        updatedAt: '2026-04-24T12:56:00.000Z',
        lifecycle: 'running',
        previewText: '',
        toolCalls: [],
        finalMessageId: null,
        finalCreatedAt: null,
        firstAssistantSeenAt: null,
        firstToolStartedAt: null,
        sequence: 1,
      },
    ],
    runtime: null,
    diagnostics: null,
    observability: { toolCards: [], timeline: [] },
    pageInfo: { hasMoreBefore: true, beforeCursor: 'before', hasMoreAfter: false, afterCursor: null },
    day: null,
  };
  const runtimeMachineState = {
    sessionKey,
    canonicalVersion: null,
    canonicalMessageLedger: messages,
    transientRunState: {
      'run-live': {
        runId: 'run-live',
        phases: [],
        activePhaseId: null,
        activePhaseKind: null,
        lastAccumulatedAssistantText: '',
        nextPhaseIndex: 0,
      },
    },
    processLedger: {
      'run-live': payload.overlays[0],
    },
  };

  saveChatRuntimeSnapshot(
    sessionKey,
    payload,
    runtimeMachineState.canonicalMessageLedger,
    payload.overlays,
    runtimeMachineState,
  );
  const snapshot = readChatRuntimeSnapshot(sessionKey);

  assert.ok(snapshot);
  assert.equal(snapshot.messages.length, 120);
  assert.equal(snapshot.messages[0].id, 'msg-141');
  assert.equal(snapshot.messages.at(-1).id, 'msg-260');
  assert.equal(snapshot.runtimeMachineState.canonicalMessageLedger.length, 120);
  assert.deepEqual(Object.keys(snapshot.runtimeMachineState.transientRunState), ['run-live']);
  assert.deepEqual(Object.keys(snapshot.runtimeMachineState.processLedger), ['run-live']);

  delete globalThis.window;
});
