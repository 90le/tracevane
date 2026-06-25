import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTracevaneChatMediaBridge } from '../../dist/apps/api/modules/chat/media-bridge.js';

function createTempTracevaneConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-media-bridge-'));
  const workspace = path.join(root, 'workspace');
  const openclawConfigFile = path.join(root, 'openclaw.json');

  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(openclawConfigFile, JSON.stringify({
    agents: {
      defaults: { workspace },
      list: [{ id: 'main', workspace, default: true }],
    },
  }, null, 2));

  return {
    root,
    workspace,
    config: {
      pluginId: 'tracevane',
      pluginName: 'Tracevane',
      version: '0.1.0-test',
      port: 0,
      autoStart: false,
      openclawRoot: root,
      openclawConfigFile,
      projectRoot: root,
      webDistDir: path.join(root, 'web'),
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0/ws',
    },
  };
}

test('collectMessageResources ignores plain text MEDIA and path examples', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'image.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const items = bridge.collectMessageResources(
      'agent:main:webchat:direct:tracevane-test',
      {
        role: 'assistant',
        text: '看看 `./image.png` 和 MEDIA:./missing.pdf，还有 @uploads/image.png',
      },
    );

    assert.deepEqual(items, []);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});


test('resolves send file refs from the Tracevane project root for Chat workspace picker files', () => {
  const tracevane = createTempTracevaneConfig();
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-media-project-'));
  try {
    tracevane.config.projectRoot = projectRoot;
    fs.writeFileSync(path.join(projectRoot, 'package.json'), '{"name":"tracevane-test"}');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const resources = bridge.buildSendResources(
      'agent:main:webchat:direct:tracevane-test',
      [{
        id: 'workspace:package.json',
        relativePath: 'package.json',
        resourceRef: 'workspace:package.json',
        fileName: 'package.json',
        kind: 'file',
        mimeType: 'application/json',
      }],
      undefined,
    );

    assert.equal(resources.length, 1);
    assert.equal(resources[0].status, 'ready');
    assert.equal(resources[0].relativePath, 'package.json');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('buildAssistantMessageFromTracevaneDelivery preserves block order', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'image.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const message = bridge.buildAssistantMessageFromTracevaneDelivery(
      'agent:main:webchat:direct:tracevane-test',
      {
        type: 'tracevane_delivery',
        version: 1,
        blocks: [
          { type: 'text', text: '第一段' },
          { type: 'resource', resourceId: 'res-1' },
          { type: 'text', text: '第二段' },
        ],
        resources: [
          {
            id: 'res-1',
            kind: 'image',
            fileName: 'image.png',
            filePath: './image.png',
            contentType: 'image/png',
          },
        ],
      },
      {
        id: 'delivery-1',
        createdAt: '2026-03-21T00:00:00.000Z',
        source: 'stream',
        runId: 'run-1',
      },
    );

    assert.ok(message);
    assert.equal(message.role, 'assistant');
    assert.equal(message.text, '第一段\n第二段');
    assert.equal(message.blocks?.length, 3);
    assert.deepEqual(message.blocks?.map((block) => block.type), ['text', 'resource', 'text']);
    assert.equal(message.resources?.length, 1);
    assert.equal(message.resources?.[0]?.source, 'tracevane_delivery');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('buildAssistantMessageFromTracevaneDelivery preserves mixed text/resource/text order from alias-normalized payload', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'a.txt'), 'a');
    fs.writeFileSync(path.join(tracevane.workspace, 'b.txt'), 'b');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const message = bridge.buildAssistantMessageFromTracevaneDelivery(
      'agent:main:webchat:direct:tracevane-test',
      {
        type: 'tracevane_delivery',
        version: 1,
        blocks: [
          { type: 'text', text: '前文' },
          { type: 'resource', resourceId: 'res-1' },
          { type: 'text', text: '中段' },
          { type: 'resource', resourceId: 'res-2' },
          { type: 'text', text: '后文' },
        ],
        resources: [
          {
            id: 'res-1',
            kind: 'file',
            fileName: 'a.txt',
            filePath: './a.txt',
          },
          {
            id: 'res-2',
            kind: 'file',
            fileName: 'b.txt',
            filePath: './b.txt',
          },
        ],
      },
      {
        id: 'delivery-2',
        createdAt: '2026-03-21T00:00:00.000Z',
        source: 'stream',
        runId: 'run-2',
      },
    );

    assert.ok(message);
    assert.deepEqual(message.blocks?.map((block) => block.type), [
      'text',
      'resource',
      'text',
      'resource',
      'text',
    ]);
    assert.equal(message.text, '前文\n中段\n后文');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('buildAssistantMessageFromTracevaneDelivery preserves paragraph, inline segments, and card order for v2 payloads', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    fs.writeFileSync(path.join(tracevane.workspace, 'demo.mp4'), 'video');
    fs.writeFileSync(path.join(tracevane.workspace, 'report.pdf'), 'pdf');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const message = bridge.buildAssistantMessageFromTracevaneDelivery(
      'agent:main:webchat:direct:tracevane-test',
      {
        type: 'tracevane_delivery',
        version: 2,
        blocks: [
          {
            type: 'paragraph',
            segments: [
              { type: 'text', text: '结构图 ' },
              { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
              { type: 'text', text: '，源文件 ' },
              { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
              { type: 'text', text: '。' },
            ],
          },
          { type: 'resource', resourceId: 'video-1', display: 'card' },
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
            id: 'img-1',
            kind: 'image',
            fileName: 'graph.png',
            filePath: './graph.png',
            contentType: 'image/png',
          },
          {
            id: 'video-1',
            kind: 'video',
            fileName: 'demo.mp4',
            filePath: './demo.mp4',
            contentType: 'video/mp4',
          },
          {
            id: 'file-1',
            kind: 'file',
            fileName: 'report.pdf',
            filePath: './report.pdf',
            contentType: 'application/pdf',
          },
        ],
      },
      {
        id: 'delivery-v2',
        createdAt: '2026-03-21T00:00:00.000Z',
        source: 'stream',
        runId: 'run-v2',
      },
    );

    assert.ok(message);
    assert.deepEqual(message.blocks?.map((block) => block.type), [
      'paragraph',
      'resource',
      'paragraph',
    ]);
    assert.equal(message.blocks?.[0]?.type, 'paragraph');
    assert.deepEqual(message.blocks?.[0]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
      '结构图 ',
      'inline-image',
      '，源文件 ',
      'inline-chip',
      '。',
    ]);
    assert.equal(message.blocks?.[1]?.type, 'resource');
    assert.equal(message.blocks?.[1]?.display, 'card');
    assert.equal(message.blocks?.[2]?.type, 'paragraph');
    assert.deepEqual(message.blocks?.[2]?.segments.map((segment) => segment.type === 'text' ? segment.text : segment.display), [
      '演示视频 ',
      'inline-video',
      ' 在这里。',
    ]);
    assert.equal(message.text, '结构图 graph.png，源文件 report.pdf。\n演示视频 demo.mp4 在这里。');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('collectToolArtifacts only keeps explicit structured artifact fields', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'image.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const items = bridge.collectToolArtifacts(
      'agent:main:webchat:direct:tracevane-test',
      {
        args: {
          path: './ignored.png',
        },
        artifacts: [
          {
            id: 'artifact-1',
            kind: 'image',
            fileName: 'image.png',
            filePath: './image.png',
          },
        ],
      },
      'tool-1',
    );

    assert.equal(items.length, 1);
    assert.equal(items[0]?.fileName, 'image.png');
    assert.equal(items[0]?.source, 'tool_artifact');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown stream preview compiles complete explicit markdown token into a message with resources', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'diagram.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    assert.equal(
      bridge.shouldAttemptAssistantMarkdownStreamPreview('前文\n\n[结构图](workspace:diagram.png "tracevane:break-image")'),
      true,
    );

    const message = bridge.buildAssistantMarkdownMessage(
      'agent:main:webchat:direct:tracevane-test',
      '前文\n\n[结构图](workspace:diagram.png "tracevane:break-image")',
      {
        id: 'stream-run-1',
        createdAt: '2026-03-22T00:00:00.000Z',
        source: 'stream',
        runId: 'run-1',
      },
    );

    assert.ok(message);
    assert.equal(message.source, 'stream');
    assert.equal(message.text, '前文\n\n[结构图](workspace:diagram.png "tracevane:break-image")');
    assert.equal(message.blocks?.length, 1);
    assert.equal(message.blocks?.[0]?.type, 'text');
    assert.match(message.blocks?.[0]?.text || '', /\/api\/chat\/sessions\//);
    assert.equal(message.resources?.length, 1);
    assert.equal(message.resources?.[0]?.source, 'assistant_markdown');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown stream preview ignores incomplete token and stays plain text until token closes', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'diagram.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    assert.equal(
      bridge.shouldAttemptAssistantMarkdownStreamPreview('前文\n\n[结构图](workspace:diagram.png "tracevane:break-image"'),
      true,
    );

    const message = bridge.buildAssistantMarkdownMessage(
      'agent:main:webchat:direct:tracevane-test',
      '前文\n\n[结构图](workspace:diagram.png "tracevane:break-image"',
      {
        id: 'stream-run-2',
        createdAt: '2026-03-22T00:00:00.000Z',
        source: 'stream',
        runId: 'run-2',
      },
    );

    assert.equal(message, null);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown stream preview and final compilation stay structurally consistent', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'diagram.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const source = '前文\n\n[结构图](workspace:diagram.png "tracevane:break-image")';
    const streamMessage = bridge.buildAssistantMarkdownMessage(
      'agent:main:webchat:direct:tracevane-test',
      source,
      {
        id: 'stream-run-3',
        createdAt: '2026-03-22T00:00:00.000Z',
        source: 'stream',
        runId: 'run-3',
      },
    );
    const finalMessage = bridge.buildAssistantMarkdownMessage(
      'agent:main:webchat:direct:tracevane-test',
      source,
      {
        id: 'final-run-3',
        createdAt: '2026-03-22T00:00:01.000Z',
        source: 'history',
        runId: 'run-3',
      },
    );

    assert.ok(streamMessage);
    assert.ok(finalMessage);
    assert.equal(streamMessage.text, finalMessage.text);
    assert.deepEqual(streamMessage.blocks, finalMessage.blocks);
    assert.deepEqual(streamMessage.resources, finalMessage.resources);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown stream preview detects raw html media refs and compiles them into resources', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'diagram.png'), 'png');

    const bridge = createTracevaneChatMediaBridge(tracevane.config);
    const source = '<img src="workspace:diagram.png" title="tracevane:break-image" alt="结构图">';
    assert.equal(
      bridge.shouldAttemptAssistantMarkdownStreamPreview(source),
      true,
    );

    const streamMessage = bridge.buildAssistantMarkdownMessage(
      'agent:main:webchat:direct:tracevane-test',
      source,
      {
        id: 'stream-html-1',
        createdAt: '2026-03-29T00:00:00.000Z',
        source: 'stream',
        runId: 'run-html-1',
      },
    );

    assert.ok(streamMessage);
    assert.equal(streamMessage.resources?.length, 1);
    assert.equal(streamMessage.resources?.[0]?.kind, 'image');
    assert.match(streamMessage.blocks?.[0]?.text || '', /<img[^>]+src="\/api\/chat\/sessions\//);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});
