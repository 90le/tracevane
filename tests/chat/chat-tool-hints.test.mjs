import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeToolHintsWithToolCards,
  parseStructuredChatText,
} from '../../dist/lib/chat-tool-hints.js';

test('assistant toolCall JSON becomes toolHints with id/name/args extracted', () => {
  const parsed = parseStructuredChatText(JSON.stringify({
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'toolu_01_image',
        name: 'image',
        arguments: {
          prompt: 'draw a red fox',
        },
      },
    ],
  }));

  assert.ok(parsed?.structured);
  assert.equal(parsed?.text, '');
  assert.equal(parsed?.toolHints.length, 1);
  assert.equal(parsed?.toolHints[0]?.id, 'toolu_01_image');
  assert.equal(parsed?.toolHints[0]?.name, 'image');
  assert.equal(parsed?.toolHints[0]?.status, 'running');
  assert.match(parsed?.toolHints[0]?.argsPreview || '', /red fox/);
});

test('assistant thinking + toolUse JSON hides thinking text while keeping toolCall', () => {
  const parsed = parseStructuredChatText(JSON.stringify({
    role: 'assistant',
    content: [
      {
        type: 'thinking',
        text: 'internal chain of thought',
      },
      {
        type: 'toolCall',
        toolCallId: 'toolu_02_browser',
        name: 'browser',
        arguments: {
          url: 'https://example.com',
        },
      },
    ],
    stopReason: 'toolUse',
  }));

  assert.ok(parsed?.structured);
  assert.equal(parsed?.text, '');
  assert.equal(parsed?.toolHints.length, 1);
  assert.equal(parsed?.processBlocks.length, 1);
  assert.equal(parsed?.processBlocks[0]?.kind, 'thinking');
  assert.match(parsed?.processBlocks[0]?.text || '', /internal chain of thought/i);
  assert.equal(parsed?.toolHints[0]?.id, 'toolu_02_browser');
  assert.equal(parsed?.toolHints[0]?.name, 'browser');
  assert.equal(parsed?.toolHints[0]?.status, 'running');
  assert.doesNotMatch(parsed?.text || '', /chain of thought/i);
});

test('assistant error JSON becomes compressed error tool summary', () => {
  const parsed = parseStructuredChatText(JSON.stringify({
    role: 'assistant',
    content: [
      {
        type: 'toolCall',
        id: 'tool-2',
        name: 'browser',
        arguments: {
          url: 'https://example.com',
        },
      },
    ],
    errorMessage: 'API error: rate limit exceeded while calling browser',
  }));

  assert.ok(parsed?.structured);
  assert.equal(parsed?.toolHints.length, 1);
  assert.equal(parsed?.toolHints[0]?.name, 'browser');
  assert.equal(parsed?.toolHints[0]?.status, 'error');
  assert.match(parsed?.toolHints[0]?.summary || '', /rate limit exceeded/i);
  assert.match(parsed?.toolHints[0]?.resultPreview || '', /rate limit exceeded/i);
  assert.match(parsed?.toolHints[0]?.argsPreview || '', /example\.com/);
});

test('single tool result JSON becomes completed tool hint with result preview', () => {
  const parsed = parseStructuredChatText(JSON.stringify({
    tool: 'edit',
    toolCallId: 'toolu_03_edit',
    status: 'completed',
    result: {
      summary: 'patched two lines',
    },
  }));

  assert.ok(parsed?.structured);
  assert.equal(parsed?.toolHints.length, 1);
  assert.equal(parsed?.toolHints[0]?.id, 'toolu_03_edit');
  assert.equal(parsed?.toolHints[0]?.name, 'edit');
  assert.equal(parsed?.toolHints[0]?.status, 'completed');
  assert.match(parsed?.toolHints[0]?.resultPreview || '', /patched two lines/i);
});

test('concatenated tool error JSON blobs become multiple tool hints', () => {
  const parsed = parseStructuredChatText(
    '{"status":"error","tool":"sessions_list","error":"gateway closed (1006 abnormal closure)"}'
    + '{"status":"error","tool":"cron","error":"gateway closed (1008): pairing required"}'
  );

  assert.ok(parsed?.structured);
  assert.equal(parsed?.text, '');
  assert.equal(parsed?.toolHints.length, 2);
  assert.equal(parsed?.toolHints[0]?.name, 'sessions_list');
  assert.equal(parsed?.toolHints[0]?.status, 'error');
  assert.match(parsed?.toolHints[0]?.resultPreview || '', /abnormal closure/i);
  assert.equal(parsed?.toolHints[1]?.name, 'cron');
  assert.equal(parsed?.toolHints[1]?.status, 'error');
  assert.match(parsed?.toolHints[1]?.resultPreview || '', /pairing required/i);
});

test('tool hint merge lets runtime tool cards override status and result preview', () => {
  const merged = mergeToolHintsWithToolCards({
    parsedHints: [
      {
        id: 'toolu_04_patch',
        name: 'edit',
        status: 'running',
        summary: null,
        argsPreview: '{"path":"README.md"}',
        resultPreview: null,
      },
    ],
    toolCards: [
      {
        toolCallId: 'call_toolu_04_patch',
        runId: 'run-1',
        name: 'edit',
        status: 'completed',
        startedAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:01.000Z',
        argsPreview: '{"path":"README.md"}',
        resultPreview: '{}',
        isError: false,
      },
    ],
    toolDetailByCallId: {
      call_toolu_04_patch: '{"summary":"patched README successfully"}',
    },
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.status, 'completed');
  assert.equal(merged[0]?.id, 'call_toolu_04_patch');
  assert.match(merged[0]?.resultPreview || '', /patched README successfully/i);
});

test('tool hint merge falls back to same-name order when ids differ but does not cross-merge names', () => {
  const merged = mergeToolHintsWithToolCards({
    parsedHints: [
      {
        id: 'assistant-call-1',
        name: 'browser',
        status: 'running',
        summary: null,
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: null,
      },
      {
        id: 'assistant-call-2',
        name: 'edit',
        status: 'running',
        summary: null,
        argsPreview: '{"path":"notes.md"}',
        resultPreview: null,
      },
    ],
    toolCards: [
      {
        toolCallId: 'runtime-browser-1',
        runId: 'run-2',
        name: 'browser',
        status: 'error',
        startedAt: '2026-03-21T00:00:00.000Z',
        updatedAt: '2026-03-21T00:00:01.000Z',
        argsPreview: '{"url":"https://example.com"}',
        resultPreview: '{"error":"navigation failed"}',
        isError: true,
      },
      {
        toolCallId: 'runtime-image-1',
        runId: 'run-2',
        name: 'image',
        status: 'completed',
        startedAt: '2026-03-21T00:00:02.000Z',
        updatedAt: '2026-03-21T00:00:03.000Z',
        argsPreview: '{"prompt":"cat"}',
        resultPreview: '{"ok":true}',
        isError: false,
      },
    ],
  });

  assert.equal(merged.length, 3);
  const browser = merged.find((item) => item.name === 'browser');
  const edit = merged.find((item) => item.name === 'edit');
  const image = merged.find((item) => item.name === 'image');
  assert.equal(browser?.status, 'error');
  assert.match(browser?.resultPreview || '', /navigation failed/i);
  assert.equal(edit?.status, 'running');
  assert.equal(image?.status, 'completed');
});
