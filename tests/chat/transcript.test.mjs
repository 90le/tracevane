import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isAssistantNoReplyMessage,
  isAssistantStudioDeliveryToolUseEnvelope,
  mapTranscriptMessage,
  mapMessagesFromParsedEntries,
  extractMessageText,
} from '../../dist/apps/api/modules/chat/transcript.js';

test('assistant studio_delivery tool-use envelope is detected from real transcript shape', () => {
  const raw = {
    type: 'message',
    id: 'assistant-envelope',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '' },
        {
          type: 'toolCall',
          id: 'tool-call-1',
          name: 'studio_delivery',
          arguments: {
            version: 2,
            blocks: [
              {
                type: 'paragraph',
                segments: [
                  { type: 'text', text: '正文 ' },
                  { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
                ],
              },
            ],
            resources: [
              {
                id: 'img-1',
                kind: 'image',
                fileName: 'diagram.png',
                filePath: '/tmp/diagram.png',
              },
            ],
          },
        },
      ],
      stopReason: 'toolUse',
    },
  };

  assert.equal(isAssistantStudioDeliveryToolUseEnvelope(raw), true);
});

test('skip override prevents assistant studio_delivery envelope from collecting structured resources', () => {
  const raw = {
    type: 'message',
    id: 'assistant-envelope',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '' },
        {
          type: 'toolCall',
          id: 'tool-call-1',
          name: 'studio_delivery',
          arguments: {
            version: 2,
            resources: [
              {
                id: 'img-1',
                kind: 'image',
                fileName: 'diagram.png',
                filePath: '/tmp/diagram.png',
              },
            ],
          },
        },
      ],
      stopReason: 'toolUse',
    },
  };

  const mapped = mapTranscriptMessage(raw, 0, {
    sessionKey: 'agent:main:webchat:direct:studio-test',
    collectMessageResources() {
      throw new Error('collectMessageResources should not run for skipped assistant envelopes');
    },
    overrideMessage(_sessionKey, candidate) {
      return isAssistantStudioDeliveryToolUseEnvelope(candidate)
        ? { kind: 'skip' }
        : null;
    },
  });

  assert.equal(mapped, null);
});

test('assistant NO_REPLY messages can be explicitly skipped', () => {
  const raw = {
    type: 'message',
    id: 'assistant-no-reply',
    message: {
      role: 'assistant',
      content: [
        { type: 'text', text: 'NO_REPLY' },
      ],
      stopReason: 'stop',
    },
  };

  assert.equal(isAssistantNoReplyMessage(raw), true);

  const mapped = mapTranscriptMessage(raw, 0, {
    sessionKey: 'agent:main:webchat:direct:studio-test',
    overrideMessage(_sessionKey, candidate) {
      return isAssistantNoReplyMessage(candidate)
        ? { kind: 'skip' }
        : null;
    },
  });

  assert.equal(mapped, null);
});

test('Pi session header and model metadata lines are skipped for chat history', () => {
  assert.equal(mapTranscriptMessage({ type: 'session', version: 3, id: 's1', cwd: '/tmp' }, 0), null);
  assert.equal(mapTranscriptMessage({ type: 'model_change', id: 'm1', provider: 'gmn', modelId: 'gpt-5' }, 0), null);
  assert.equal(mapTranscriptMessage({ type: 'thinking_level_change', id: 't1', thinkingLevel: 'high' }, 0), null);
  assert.equal(
    mapTranscriptMessage({ type: 'custom', customType: 'model-snapshot', data: { modelId: 'x' } }, 0),
    null,
  );
});

test('assistant tool-only content does not stringify to JSON as visible message text', () => {
  const raw = {
    type: 'message',
    id: 'assistant-tool-only',
    message: {
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'tool-1', name: 'browser', arguments: { url: 'https://a.com' } },
      ],
    },
  };
  assert.equal(extractMessageText(raw), '');
});

test('assistant transcript keeps thinking as explicit process blocks without leaking it into visible text', () => {
  const raw = {
    type: 'message',
    id: 'assistant-thinking',
    message: {
      role: 'assistant',
      content: [
        { type: 'thinking', id: 'think-1', text: 'internal chain of thought' },
        { type: 'text', text: 'Visible answer only.' },
      ],
    },
  };

  assert.equal(extractMessageText(raw), 'Visible answer only.');

  const mapped = mapTranscriptMessage(raw, 0);
  assert.equal(mapped?.text, 'Visible answer only.');
  assert.equal(mapped?.processBlocks?.length, 1);
  assert.equal(mapped?.processBlocks?.[0]?.id, 'think-1');
  assert.equal(mapped?.processBlocks?.[0]?.kind, 'thinking');
  assert.match(mapped?.processBlocks?.[0]?.text || '', /internal chain of thought/i);
});

test('assistant transcript toolCall content maps onto message.toolCalls', () => {
  const raw = {
    type: 'message',
    id: 'assistant-tool-call',
    timestamp: '2026-03-23T00:00:00.000Z',
    message: {
      role: 'assistant',
      runId: 'run-1',
      content: [
        {
          type: 'toolCall',
          id: 'tool-1',
          name: 'browser',
          arguments: {
            url: 'https://example.com',
          },
        },
      ],
    },
  };

  const mapped = mapTranscriptMessage(raw, 0);
  assert.equal(mapped?.role, 'assistant');
  assert.equal(mapped?.runId, 'run-1');
  assert.equal(mapped?.toolCalls?.length, 1);
  assert.equal(mapped?.toolCalls?.[0]?.toolCallId, 'tool-1');
  assert.equal(mapped?.toolCalls?.[0]?.name, 'browser');
  assert.equal(mapped?.toolCalls?.[0]?.status, 'running');
  assert.match(mapped?.toolCalls?.[0]?.argsPreview || '', /example\.com/);
});

test('toolresult transcript role is normalized to tool so main chat does not render it as assistant bubble', () => {
  const raw = {
    id: 'toolresult-1',
    role: 'toolresult',
    text: '{"status":"ok"}',
    timestamp: '2026-03-24T00:00:00.000Z',
  };

  const mapped = mapTranscriptMessage(raw, 0);
  assert.equal(mapped?.role, 'tool');
});

test('transcript replay dedupes official duplicate rows with new outer ids', () => {
  const userText = '[Sun 2026-04-26 17:40 GMT+8] 我设置了，你重新试试图片生成';
  const finalText = '成功了 ✅\n\n`image_generate` 已经可以通过 `openai/gpt-image-2` 正常生成。';
  const entries = [
    {
      type: 'message',
      id: 'user-original',
      parentId: 'prev',
      timestamp: '2026-04-26T09:40:47.535Z',
      message: {
        role: 'user',
        timestamp: 1777196447501,
        content: [{
          type: 'text',
          text: [
            'Sender (untrusted metadata):',
            '```json',
            '{"label":"cli","id":"cli"}',
            '```',
            '',
            userText,
          ].join('\n'),
        }],
      },
    },
    {
      type: 'message',
      id: 'assistant-tool-original',
      parentId: 'user-original',
      timestamp: '2026-04-26T09:40:54.327Z',
      message: {
        role: 'assistant',
        timestamp: 1777196447570,
        responseId: 'resp-image',
        stopReason: 'toolUse',
        content: [{
          type: 'toolCall',
          id: 'call-image|fc-image',
          name: 'image_generate',
          arguments: { prompt: 'city', model: 'openai/gpt-image-2' },
        }],
      },
    },
    {
      type: 'message',
      id: 'tool-original',
      parentId: 'assistant-tool-original',
      timestamp: '2026-04-26T09:41:47.855Z',
      message: {
        role: 'toolResult',
        timestamp: 1777196507855,
        toolCallId: 'call-image|fc-image',
        toolName: 'image_generate',
        content: [{ type: 'text', text: 'Generated 1 image with openai/gpt-image-2.' }],
        isError: false,
      },
    },
    {
      type: 'message',
      id: 'assistant-final-original',
      parentId: 'tool-original',
      timestamp: '2026-04-26T09:41:55.298Z',
      message: {
        role: 'assistant',
        timestamp: 1777196507866,
        responseId: 'resp-final',
        stopReason: 'stop',
        content: [{ type: 'text', text: finalText }],
      },
    },
    {
      type: 'message',
      id: 'user-replay',
      parentId: 'prev',
      timestamp: '2026-04-26T09:41:55.396Z',
      message: {
        role: 'user',
        timestamp: 1777196447501,
        content: [{ type: 'text', text: userText }],
      },
    },
    {
      type: 'message',
      id: 'assistant-tool-replay',
      parentId: 'user-replay',
      timestamp: '2026-04-26T09:41:55.396Z',
      message: {
        role: 'assistant',
        timestamp: 1777196447570,
        responseId: 'resp-image',
        stopReason: 'toolUse',
        content: [{
          type: 'toolCall',
          id: 'call-image|fc-image',
          name: 'image_generate',
          arguments: { prompt: 'city', model: 'openai/gpt-image-2' },
        }],
      },
    },
    {
      type: 'message',
      id: 'tool-replay',
      parentId: 'assistant-tool-replay',
      timestamp: '2026-04-26T09:41:55.397Z',
      message: {
        role: 'toolResult',
        timestamp: 1777196507855,
        toolCallId: 'call-image|fc-image',
        toolName: 'image_generate',
        content: [{ type: 'text', text: 'Generated 1 image with openai/gpt-image-2.' }],
        isError: false,
      },
    },
    {
      type: 'message',
      id: 'assistant-final-replay',
      parentId: 'tool-replay',
      timestamp: '2026-04-26T09:41:55.397Z',
      message: {
        role: 'assistant',
        timestamp: 1777196507866,
        responseId: 'resp-final',
        stopReason: 'stop',
        content: [{ type: 'text', text: finalText }],
      },
    },
  ];

  const messages = mapMessagesFromParsedEntries(entries);

  assert.deepEqual(messages.map((message) => message.id), [
    'user-original',
    'assistant-tool-original',
    'tool-original',
    'assistant-final-original',
  ]);
  assert.deepEqual(messages.map((message) => message.role), ['user', 'assistant', 'tool', 'assistant']);
  assert.equal(messages[0]?.text, '我设置了，你重新试试图片生成');
  assert.equal(messages[1]?.toolCalls?.[0]?.toolCallId, 'call-image|fc-image');
});
