import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSlashSessionExportDocument } from '../../apps/web-vue/src/features/chat/slash-export-session';
import type { ChatMessageItem, ChatSessionRow } from '../../types/chat';

function createSession(): ChatSessionRow {
  return {
    key: 'agent:main:main',
    agentId: 'main',
    sessionId: 'session-1',
    kind: 'agent',
    label: 'Slash Export Demo',
    derivedTitle: null,
    lastMessagePreview: 'hello',
    updatedAt: '2026-04-10T12:00:00.000Z',
    presentation: {
      title: 'Slash Export Demo',
      subtitle: null,
      avatarUrl: null,
      emoji: null,
      initial: 'S',
    },
    source: 'gateway',
    deliveryContext: {
      channelId: null,
      deliveryMode: 'direct',
      pairingState: null,
      exposure: null,
    },
    permissions: {
      canSend: true,
      canAbort: true,
      canReset: true,
      writable: true,
      canManage: true,
    },
    runtime: {
      activeRunId: null,
      status: 'idle',
      transport: 'studio_bff',
      lastError: null,
      lastEventAt: null,
      lastAckAt: null,
      lastFinalAt: null,
      pendingRequestIds: [],
    },
  };
}

function createMessages(): ChatMessageItem[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      text: 'hello <world>',
      createdAt: '2026-04-10T12:00:00.000Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      text: 'here is the file summary',
      createdAt: '2026-04-10T12:00:05.000Z',
      source: 'history',
      runId: 'run-1',
      truncated: false,
      omitted: false,
      aborted: false,
      stopReason: null,
      resources: [
        {
          id: 'resource-1',
          kind: 'file',
          url: '/download/report.pdf',
          downloadUrl: '/download/report.pdf',
          fileName: 'report.pdf',
          mimeType: 'application/pdf',
          source: 'tool',
          status: 'ready',
          placement: 'attachment',
        },
      ],
    },
  ];
}

test('buildSlashSessionExportDocument emits a safe localized html export', () => {
  const session = createSession();
  const { filename, html } = buildSlashSessionExportDocument({
    locale: 'zh',
    session,
    messages: createMessages(),
    exportedAt: '2026-04-10T12:30:00.000Z',
  });

  assert.equal(filename, 'slash-export-demo.html');
  assert.match(html, /Studio 会话导出/);
  assert.match(html, /Slash Export Demo/);
  assert.match(html, /hello &lt;world&gt;/);
  assert.match(html, /report\.pdf/);
  assert.match(html, /当前可见消息 2 条/);
  assert.doesNotMatch(html, /<script>/i);
});
