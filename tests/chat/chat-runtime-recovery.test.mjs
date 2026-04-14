import test from 'node:test';
import assert from 'node:assert/strict';
import 'tsx/esm';

const {
  buildChatRoute,
  shouldNormalizeChatSessionQueryRoute,
  resolveChatRouteSessionKey,
  resolveFallbackSessionKey,
  resolveRequestedOrFallbackSessionKey,
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
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: 'legacy',
  }), 'legacy');
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
    currentPath: '/chat',
    shellMode: 'chat',
    routeParamSessionRef: '',
    routeQuerySessionRef: '',
    legacyQuerySession: 'legacy',
  }), true);
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
