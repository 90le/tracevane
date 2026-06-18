import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyDerivedAutoLabelToSessionRow,
  deriveAutoSessionLabelFromMessages,
  resolveSessionEditableLabel,
} from '../../dist/lib/chat-session-auto-title.js';
import { deriveChatSessionTitle } from '../../dist/lib/chat-display.js';

function createMessage(role, text) {
  return { role, text };
}

function createStudioSession(overrides = {}) {
  return {
    key: 'agent:frontend:webchat:direct:studio-test',
    agentId: 'frontend',
    sessionId: 'sess-1',
    kind: 'studio_managed',
    label: 'Tracevane chat · frontend',
    derivedTitle: 'Sender (untrusted metadata): ```json {"label":"cli"} ```',
    lastMessagePreview: null,
    updatedAt: '2026-03-27T08:00:00.000Z',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
      autoLabel: null,
    },
    source: {
      source: 'studio',
      channel: 'webchat',
      surface: 'direct',
      originLabel: 'Tracevane managed',
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
      canInject: true,
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
    ...overrides,
  };
}

test('deriveAutoSessionLabelFromMessages waits for at least one assistant reply', () => {
  const label = deriveAutoSessionLabelFromMessages([
    createMessage('user', '帮我修复聊天标题自动生成问题'),
  ]);

  assert.equal(label, null);
});

test('deriveAutoSessionLabelFromMessages strips inbound metadata and request prefixes', () => {
  const label = deriveAutoSessionLabelFromMessages([
    createMessage('user', [
      'Sender (untrusted metadata):',
      '```json',
      '{"label":"cli","id":"cli"}',
      '```',
      '',
      '[Fri 2026-03-27 15:30 GMT+8] 帮我修复聊天标题自动生成问题，并避免 metadata 泄漏',
    ].join('\n')),
    createMessage('assistant', '我先排查标题更新链路。'),
  ]);

  assert.equal(label, '修复聊天标题自动生成问题');
});

test('deriveAutoSessionLabelFromMessages skips weak greetings and uses the first substantive turn', () => {
  const label = deriveAutoSessionLabelFromMessages([
    createMessage('user', 'hi'),
    createMessage('assistant', 'hi~'),
    createMessage('user', '请帮我分析 Tracevane chat 标题更新机制，并评估可行性'),
    createMessage('assistant', '我先看 Tracevane chat 私聊链路。'),
  ]);

  assert.equal(label, 'Tracevane chat 标题更新机制');
});

test('applyDerivedAutoLabelToSessionRow stores autoLabel for studio-managed sessions only', () => {
  const session = createStudioSession();
  const next = applyDerivedAutoLabelToSessionRow(session, [
    createMessage('user', '帮我修复聊天标题自动生成问题'),
    createMessage('assistant', '收到，我先排查。'),
  ]);

  assert.notEqual(next, session);
  assert.equal(next.presentation.autoLabel, '修复聊天标题自动生成问题');
});

test('deriveChatSessionTitle keeps the default studio label before autoLabel exists', () => {
  const title = deriveChatSessionTitle(createStudioSession(), 'frontend');
  assert.equal(title, 'Tracevane chat · frontend');
});

test('deriveChatSessionTitle prefers autoLabel, and manual rename stays highest priority', () => {
  const autoTitled = createStudioSession({
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: null,
      autoLabel: '修复聊天标题自动生成问题',
    },
  });
  assert.equal(deriveChatSessionTitle(autoTitled, 'frontend'), '修复聊天标题自动生成问题');
  assert.equal(resolveSessionEditableLabel(autoTitled), '修复聊天标题自动生成问题');

  const manuallyRenamed = createStudioSession({
    label: '手动标题',
    presentation: {
      archived: false,
      archivedAt: null,
      customLabel: '手动标题',
      autoLabel: '修复聊天标题自动生成问题',
    },
  });
  assert.equal(deriveChatSessionTitle(manuallyRenamed, 'frontend'), '手动标题');
  assert.equal(resolveSessionEditableLabel(manuallyRenamed), '手动标题');
});
