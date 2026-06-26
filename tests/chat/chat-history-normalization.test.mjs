import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeChatHistoryText,
  stripInboundMetadata,
} from '../../dist/lib/chat-history-normalization.js';

test('normalizeChatHistoryText strips official timestamp prefix and inbound metadata blocks', () => {
  const raw = [
    '[Tue 2026-03-24 17:17 GMT+8] Conversation info (untrusted metadata):',
    '```json',
    '{"channel":"wechat"}',
    '```',
    '',
    'Sender (untrusted metadata):',
    '```json',
    '{"displayName":"Alice"}',
    '```',
    '',
    'Hello from transcript',
  ].join('\n');

  assert.equal(normalizeChatHistoryText(raw, 'user'), 'Hello from transcript');
});

test('normalizeChatHistoryText also removes envelope headers and message id hints', () => {
  const raw = [
    '[WebChat 2026-03-24 17:18] [message_id: abc-123]',
    'Visible payload',
  ].join('\n');

  assert.equal(normalizeChatHistoryText(raw, 'user'), 'Visible payload');
});

test('normalizeChatHistoryText removes new Agent Chat envelope headers', () => {
  const raw = [
    '[Agent Chat 2026-06-26 12:30] [message_id: chat-123]',
    'Visible Agent Chat payload',
  ].join('\n');

  assert.equal(normalizeChatHistoryText(raw, 'user'), 'Visible Agent Chat payload');

  const tracevaneRaw = [
    '[Tracevane Chat 2026-06-26T12:31Z] [message_id: tracevane-123]',
    'Visible Tracevane Chat payload',
  ].join('\n');

  assert.equal(normalizeChatHistoryText(tracevaneRaw, 'user'), 'Visible Tracevane Chat payload');
});

test('normalizeChatHistoryText strips a timestamp that becomes leading after sender metadata is removed', () => {
  const raw = [
    'Sender (untrusted metadata):',
    '```json',
    '{"label":"cli"}',
    '```',
    '',
    '[Wed 2026-03-25 21:03 GMT+8] Visible payload',
  ].join('\n');

  assert.equal(normalizeChatHistoryText(raw, 'user'), 'Visible payload');
});

test('stripInboundMetadata keeps ordinary user-authored text untouched when no sentinel is present', () => {
  const raw = '[Tue is my own prefix] keep me';
  assert.equal(stripInboundMetadata(raw), raw);
  assert.equal(normalizeChatHistoryText(raw, 'assistant'), raw);
});
