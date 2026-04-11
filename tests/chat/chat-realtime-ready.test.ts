import assert from 'node:assert/strict';
import test from 'node:test';

import { isSelectedChatSessionRealtimeReady } from '../../lib/chat-realtime-ready';

test('selected session realtime is ready only when the active realtime binding matches the selected session', () => {
  assert.equal(isSelectedChatSessionRealtimeReady({
    selectedSessionKey: 'session-a',
    connected: true,
    activeRealtimeSessionKey: 'session-a',
  }), true);

  assert.equal(isSelectedChatSessionRealtimeReady({
    selectedSessionKey: 'session-a',
    connected: true,
    activeRealtimeSessionKey: 'session-b',
  }), false);

  assert.equal(isSelectedChatSessionRealtimeReady({
    selectedSessionKey: 'session-a',
    connected: false,
    activeRealtimeSessionKey: 'session-a',
  }), false);

  assert.equal(isSelectedChatSessionRealtimeReady({
    selectedSessionKey: '',
    connected: true,
    activeRealtimeSessionKey: 'session-a',
  }), false);
});
