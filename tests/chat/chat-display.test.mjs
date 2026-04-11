import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveChatDisplayMessage } from '../../dist/lib/chat-display.js';

test('deriveChatDisplayMessage preserves explicit text/resource block order', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      { type: 'text', text: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
      { type: 'text', text: '第二段' },
      { type: 'resource', resourceId: 'file-2' },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        url: '/a',
        downloadUrl: '/a?download=1',
        fileName: 'a.txt',
        mimeType: 'text/plain',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
      {
        id: 'file-2',
        kind: 'image',
        url: '/b',
        downloadUrl: '/b?download=1',
        fileName: 'b.png',
        mimeType: 'image/png',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.deepEqual(display.blocks.map((block) => block.type), [
    'markdown',
    'resource',
    'markdown',
    'resource',
  ]);
  assert.equal(display.blocks[0]?.type, 'markdown');
  assert.equal(display.blocks[0]?.markdownSource, '第一段');
  assert.equal(display.blocks[2]?.type, 'markdown');
  assert.equal(display.blocks[2]?.markdownSource, '第二段');
});

test('deriveChatDisplayMessage keeps original assistant markdown as copy source for compiled studio media blocks', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: '这是结构图：\n\n[结构图](workspace:diagram.png "studio:break-image")',
    blocks: [
      {
        type: 'text',
        text: '这是结构图：\n\n[结构图](/api/chat/sessions/agent%3Amain/media/token#oc-studio-kind=image&oc-studio-name=diagram.png "studio:break-image")',
      },
    ],
    resources: [
      {
        id: 'img-1',
        kind: 'image',
        url: '/api/chat/sessions/agent%3Amain/media/token',
        downloadUrl: '/api/chat/sessions/agent%3Amain/media/token?download=1',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        source: 'assistant_markdown',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'markdown');
  assert.match(display.blocks[0]?.markdownSource || '', /\/api\/chat\/sessions\//);
  assert.equal(display.copySource, '这是结构图：\n\n[结构图](workspace:diagram.png "studio:break-image")');
  assert.equal(display.plainTextFallback, '这是结构图：\n\n结构图');
});

test('deriveChatDisplayMessage renders paragraph text with inline image segments in order', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '这是结构图 ' },
          { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
          { type: 'text', text: '，请查看。' },
        ],
      },
    ],
    resources: [
      {
        id: 'img-1',
        kind: 'image',
        url: '/img-1',
        downloadUrl: '/img-1?download=1',
        fileName: 'graph.png',
        mimeType: 'image/png',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
    '这是结构图 ',
    'inline-image',
    '，请查看。',
  ]);
  assert.deepEqual(display.blocks[0]?.runs.map((run) => run.type), ['inline-run']);
});

test('deriveChatDisplayMessage renders paragraph text with inline video segments in order', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '演示视频 ' },
          { type: 'resource', resourceId: 'video-1', display: 'inline-video' },
          { type: 'text', text: ' 在这里。' },
        ],
      },
    ],
    resources: [
      {
        id: 'video-1',
        kind: 'video',
        url: '/video-1',
        downloadUrl: '/video-1?download=1',
        fileName: 'demo.mp4',
        mimeType: 'video/mp4',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
    '演示视频 ',
    'inline-video',
    ' 在这里。',
  ]);
});

test('deriveChatDisplayMessage renders paragraph text with inline file chip segments in order', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '请下载 ' },
          { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
          { type: 'text', text: ' 后继续。' },
        ],
      },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        url: '/file-1',
        downloadUrl: '/file-1?download=1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
    '请下载 ',
    'inline-chip',
    ' 后继续。',
  ]);
});

test('deriveChatDisplayMessage keeps user inline references inline and leaves only unreferenced uploads as cards', () => {
  const display = deriveChatDisplayMessage({
    role: 'user',
    text: '请参考 [@diagram.png](uploads:123-diagram.png "studio:inline-image")。',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '请参考 ' },
          { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
          { type: 'text', text: '。' },
        ],
      },
      {
        type: 'resource',
        resourceId: 'file-1',
        display: 'card',
      },
    ],
    resources: [
      {
        id: 'img-1',
        kind: 'image',
        url: '/img-1',
        downloadUrl: '/img-1?download=1',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        source: 'user_upload',
        status: 'ready',
        placement: 'append',
      },
      {
        id: 'file-1',
        kind: 'file',
        url: '/file-1',
        downloadUrl: '/file-1?download=1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'user_upload',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.deepEqual(display.blocks.map((block) => block.type), ['paragraph', 'resource']);
  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.equal(display.blocks[1]?.type, 'resource');
  assert.deepEqual(display.blocks[0]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
    '请参考 ',
    'inline-image',
    '。',
  ]);
});

test('deriveChatDisplayMessage preserves paragraph card paragraph order for v2 messages', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '先看图。' },
        ],
      },
      { type: 'resource', resourceId: 'file-1', display: 'card' },
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '再下载文件。' },
        ],
      },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        url: '/file-1',
        downloadUrl: '/file-1?download=1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.deepEqual(display.blocks.map((block) => block.type), [
    'paragraph',
    'resource',
    'paragraph',
  ]);
  assert.equal(display.blocks[1]?.type, 'resource');
  assert.equal(display.blocks[1]?.item.fileName, 'report.pdf');
});

test('deriveChatDisplayMessage renders break-image as its own paragraph run', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '正文。' },
          { type: 'resource', resourceId: 'img-1', display: 'break-image' },
          { type: 'text', text: '图片后正文。' },
        ],
      },
    ],
    resources: [
      {
        id: 'img-1',
        kind: 'image',
        url: '/img-1',
        downloadUrl: '/img-1?download=1',
        fileName: 'graph.png',
        mimeType: 'image/png',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.runs.map((run) => run.type), ['inline-run', 'break-run', 'inline-run']);
  assert.equal(display.copySource, '正文。\n[Image: graph.png]\n图片后正文。');
  assert.equal(display.plainTextFallback, '正文。\n[Image: graph.png]\n图片后正文。');
});

test('deriveChatDisplayMessage renders break-video as its own paragraph run', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '先看说明。' },
          { type: 'resource', resourceId: 'video-1', display: 'break-video' },
          { type: 'text', text: '然后继续。' },
        ],
      },
    ],
    resources: [
      {
        id: 'video-1',
        kind: 'video',
        url: '/video-1',
        downloadUrl: '/video-1?download=1',
        fileName: 'demo.mp4',
        mimeType: 'video/mp4',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.runs.map((run) => run.type), ['inline-run', 'break-run', 'inline-run']);
  assert.equal(display.copySource, '先看说明。\n[Video: demo.mp4]\n然后继续。');
});

test('deriveChatDisplayMessage renders break-chip as its own paragraph run', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '请下载：' },
          { type: 'resource', resourceId: 'file-1', display: 'break-chip' },
          { type: 'text', text: '下载后继续。' },
        ],
      },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        url: '/file-1',
        downloadUrl: '/file-1?download=1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.runs.map((run) => run.type), ['inline-run', 'break-run', 'inline-run']);
  assert.equal(display.copySource, '请下载：\nreport.pdf\n下载后继续。');
});

test('deriveChatDisplayMessage preserves mixed break-image and break-chip run order', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'ignored fallback',
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '开头。' },
          { type: 'resource', resourceId: 'img-1', display: 'break-image' },
          { type: 'text', text: '中段。' },
          { type: 'resource', resourceId: 'file-1', display: 'break-chip' },
          { type: 'text', text: '结尾。' },
        ],
      },
      { type: 'resource', resourceId: 'file-2', display: 'card' },
    ],
    resources: [
      {
        id: 'img-1',
        kind: 'image',
        url: '/img-1',
        downloadUrl: '/img-1?download=1',
        fileName: 'graph.png',
        mimeType: 'image/png',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
      {
        id: 'file-1',
        kind: 'file',
        url: '/file-1',
        downloadUrl: '/file-1?download=1',
        fileName: 'report.pdf',
        mimeType: 'application/pdf',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
      {
        id: 'file-2',
        kind: 'file',
        url: '/file-2',
        downloadUrl: '/file-2?download=1',
        fileName: 'card.pdf',
        mimeType: 'application/pdf',
        source: 'studio_delivery',
        status: 'ready',
        placement: 'append',
      },
    ],
  });

  assert.deepEqual(display.blocks.map((block) => block.type), ['paragraph', 'resource']);
  assert.equal(display.blocks[0]?.type, 'paragraph');
  assert.deepEqual(display.blocks[0]?.runs.map((run) => run.type), [
    'inline-run',
    'break-run',
    'inline-run',
    'break-run',
    'inline-run',
  ]);
  assert.equal(display.copySource, '开头。\n[Image: graph.png]\n中段。\nreport.pdf\n结尾。\n\ncard.pdf');
  assert.equal(display.plainTextFallback, '开头。\n[Image: graph.png]\n中段。\nreport.pdf\n结尾。\n\ncard.pdf');
});

test('deriveChatDisplayMessage strips OpenClaw reply and audio directive tags from assistant text', () => {
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text: 'Hello [[reply_to_current]] [[audio_as_voice]] world',
    resources: undefined,
    blocks: undefined,
  });
  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'markdown');
  assert.equal(display.blocks[0]?.markdownSource, 'Hello   world');
});

test('deriveChatDisplayMessage does not treat MEDIA or @path-like text as resources', () => {
  const text = '@foo/bar\n---\n只是普通文本\nMEDIA:/tmp/example.png\n`./docs/tree.txt`';
  const display = deriveChatDisplayMessage({
    role: 'assistant',
    text,
    resources: undefined,
    blocks: undefined,
  });

  assert.equal(display.resourceItems.length, 0);
  assert.equal(display.blocks.length, 1);
  assert.equal(display.blocks[0]?.type, 'markdown');
  assert.equal(display.blocks[0]?.markdownSource, text);
});
