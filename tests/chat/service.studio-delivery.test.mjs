import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  createStandaloneStudioConfig,
  createStudioContext,
} from '../../dist/apps/api/index.js';
import { resolveStudioDeliveryTool } from '../../dist/lib/studio-delivery-tool.js';

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
}

test('chat upload returns canonical resource ref and signed preview resource', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-upload-resource-'));
  const workspace = path.join(root, 'workspace');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-22T00:00:00.000Z',
      },
    }, null, 2));
    fs.writeFileSync(sessionFile, '');

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const payload = await context.services.chat.uploadFile(sessionKey, {
      fileName: 'city map.png',
      content: Buffer.from('image').toString('base64'),
      mimeType: 'image/png',
    });

    assert.equal(payload.ok, true);
    assert.match(payload.relativePath, /^uploads\//);
    assert.equal(payload.resourceRef, `uploads:${payload.relativePath.slice('uploads/'.length)}`);
    assert.equal(payload.resource.relativePath, payload.relativePath);
    assert.equal(payload.resource.source, 'user_upload');
    assert.equal(payload.resource.status, 'ready');
    assert.match(payload.resource.url, /^\/api\/chat\/sessions\//);
    assert.match(payload.resource.downloadUrl, /download=1/);
    assert.equal(payload.kind, 'image');
    assert.equal(payload.mimeType, 'image/png');

    const binaryContent = Buffer.from([0, 1, 2, 3, 254, 255]);
    const binaryPayload = await context.services.chat.uploadFileBytes(sessionKey, {
      fileName: 'raw.bin',
      content: binaryContent,
      mimeType: 'application/octet-stream',
    });
    assert.equal(binaryPayload.ok, true);
    assert.equal(binaryPayload.resourceRef, `uploads:${binaryPayload.relativePath.slice('uploads/'.length)}`);
    assert.equal(Buffer.compare(fs.readFileSync(binaryPayload.absolutePath), binaryContent), 0);
    assert.equal(binaryPayload.size, binaryContent.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chat resource resolver resolves workspace and upload refs without exposing raw paths', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-resource-resolver-'));
  const workspace = path.join(root, 'workspace');
  const uploadsDir = path.join(workspace, 'uploads');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'graph.png'), 'png');
    fs.writeFileSync(path.join(uploadsDir, 'report.pdf'), 'pdf');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-22T00:00:00.000Z',
      },
    }, null, 2));
    fs.writeFileSync(sessionFile, '');

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const payload = await context.services.chat.resolveResourceRefs(sessionKey, {
      refs: [
        'workspace:graph.png',
        'uploads:report.pdf',
        'uploads:missing.pdf',
        'uploads:../report.pdf',
        'https://example.test/file.png',
      ],
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.sessionKey, sessionKey);
    assert.equal(payload.resources.length, 5);

    assert.equal(payload.resources[0]?.resourceRef, 'workspace:graph.png');
    assert.equal(payload.resources[0]?.aiReadable, true);
    assert.equal(payload.resources[0]?.resource?.status, 'ready');
    assert.equal(payload.resources[0]?.resource?.source, 'studio_resource');
    assert.equal(payload.resources[0]?.resource?.relativePath, 'graph.png');
    assert.match(payload.resources[0]?.resource?.url || '', /^\/api\/chat\/sessions\//);

    assert.equal(payload.resources[1]?.resourceRef, 'uploads:report.pdf');
    assert.equal(payload.resources[1]?.aiReadable, true);
    assert.equal(payload.resources[1]?.resource?.status, 'ready');
    assert.equal(payload.resources[1]?.resource?.relativePath, 'uploads/report.pdf');

    assert.equal(payload.resources[2]?.resourceRef, 'uploads:missing.pdf');
    assert.equal(payload.resources[2]?.aiReadable, false);
    assert.equal(payload.resources[2]?.resource?.status, 'missing');
    assert.equal(payload.resources[2]?.resource?.relativePath, 'uploads/missing.pdf');

    assert.equal(payload.resources[3]?.resourceRef, null);
    assert.equal(payload.resources[3]?.aiReadable, false);
    assert.equal(payload.resources[3]?.resource, null);

    assert.equal(payload.resources[4]?.resourceRef, null);
    assert.equal(payload.resources[4]?.aiReadable, false);
    assert.equal(payload.resources[4]?.resource, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chat service restores user shadow blocks with inline refs and keeps only unreferenced attachments as cards', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-user-shadow-'));
  const workspace = path.join(root, 'workspace');
  const uploadsDir = path.join(workspace, 'uploads');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
  const shadowFile = path.join(root, 'studio', 'chat-message-shadows.json');
  const imageRelativePath = 'uploads/123-diagram.png';
  const fileRelativePath = 'uploads/456-report.pdf';
  const transportText = '@uploads/123-diagram.png @uploads/456-report.pdf\n---\n请参考 [@diagram.png](uploads:123-diagram.png "studio:inline-image")。';

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.mkdirSync(path.dirname(shadowFile), { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, '123-diagram.png'), 'image');
    fs.writeFileSync(path.join(uploadsDir, '456-report.pdf'), 'pdf');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-22T00:00:00.000Z',
      },
    }, null, 2));
    fs.writeFileSync(sessionFile, `${JSON.stringify({
      type: 'message',
      id: 'user-1',
      runId: 'run-1',
      timestamp: '2026-03-22T00:00:00.000Z',
      message: {
        role: 'user',
        runId: 'run-1',
        text: transportText,
      },
    })}\n`);
    fs.writeFileSync(shadowFile, `${JSON.stringify({
      sessions: {
        [sessionKey]: [
          {
            sessionKey,
            requestId: 'req-1',
            runId: 'run-1',
            transportText,
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
            fileRefs: [
              {
                id: 'img-1',
                relativePath: imageRelativePath,
                fileName: 'diagram.png',
                kind: 'image',
                mimeType: 'image/png',
              },
              {
                id: 'file-1',
                relativePath: fileRelativePath,
                fileName: 'report.pdf',
                kind: 'file',
                mimeType: 'application/pdf',
              },
            ],
            createdAt: '2026-03-22T00:00:00.000Z',
          },
        ],
      },
    }, null, 2)}\n`);

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const history = await context.services.chat.getHistory(sessionKey);
    assert.equal(history.messages.length, 1);
    const message = history.messages[0];
    assert.equal(message.role, 'user');
    assert.equal(message.text, '请参考 [@diagram.png](uploads:123-diagram.png "studio:inline-image")。');
    assert.deepEqual(message.blocks, [
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
    ]);
    assert.deepEqual(
      message.resources?.map((item) => item.id).sort(),
      ['file-1', 'img-1'],
    );
    assert.equal(message.resources?.every((item) => item.source === 'user_upload'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chat service maps transcript studio_delivery tool results into assistant blocks/resources', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-delivery-'));
  const workspace = path.join(root, 'workspace');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
  const filePath = path.join(workspace, 'notes.txt');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(filePath, 'hello');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    }, null, 2));
    fs.writeFileSync(sessionFile, `${JSON.stringify({
      type: 'message',
      id: 'message-1',
      timestamp: '2026-03-21T00:00:00.000Z',
      message: {
        role: 'toolResult',
        runId: 'run-1',
        toolCallId: 'tool-call-1',
        toolName: 'studio_delivery',
        details: {
          type: 'studio_delivery',
          version: 1,
          blocks: [
            { type: 'text', text: '第一段' },
            { type: 'resource', resourceId: 'file-1' },
            { type: 'text', text: '第二段' },
          ],
          resources: [
            {
              id: 'file-1',
              kind: 'file',
              fileName: 'notes.txt',
              filePath,
              mimeType: 'text/plain',
            },
          ],
        },
      },
    })}\n`);

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const history = await context.services.chat.getHistory(sessionKey);
    assert.equal(history.messages.length, 1);
    const message = history.messages[0];
    assert.equal(message.role, 'assistant');
    assert.equal(message.text, '第一段\n第二段');
    assert.deepEqual(message.blocks, [
      { type: 'text', text: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
      { type: 'text', text: '第二段' },
    ]);
    assert.equal(message.resources?.length, 1);
    assert.equal(message.resources?.[0]?.source, 'studio_delivery');
    assert.match(message.resources?.[0]?.url || '', /\/api\/chat\/sessions\//);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('chat service compiles assistant markdown studio links into enhanced markdown plus assistant_markdown resources', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-markdown-'));
  const workspace = path.join(root, 'workspace');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
  const imagePath = path.join(workspace, 'diagram.png');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    }, null, 2));
    fs.writeFileSync(sessionFile, `${JSON.stringify({
      type: 'message',
      id: 'assistant-1',
      timestamp: '2026-03-21T00:00:00.000Z',
      message: {
        role: 'assistant',
        text: '这是结构图：\n\n[结构图](workspace:diagram.png "studio:break-image")',
      },
    })}\n`);

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const history = await context.services.chat.getHistory(sessionKey);
    assert.equal(history.messages.length, 1);
    const message = history.messages[0];
    assert.equal(message.role, 'assistant');
    assert.equal(message.text, '这是结构图：\n\n[结构图](workspace:diagram.png "studio:break-image")');
    assert.equal(message.blocks?.length, 1);
    assert.equal(message.blocks?.[0]?.type, 'text');
    assert.match(message.blocks?.[0]?.text || '', /\/api\/chat\/sessions\//);
    assert.equal(message.resources?.length, 1);
    assert.equal(message.resources?.[0]?.source, 'assistant_markdown');
    assert.equal(message.resources?.[0]?.fileName, 'diagram.png');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('real transcript shape keeps only the compiled studio_delivery assistant message', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-delivery-roundtrip-'));
  const workspace = path.join(root, 'workspace');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
  const imagePath = path.join(workspace, 'diagram.png');
  const filePath = path.join(workspace, 'report.txt');
  const videoPath = path.join(workspace, 'demo.mp4');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(filePath, 'hello');
    fs.writeFileSync(videoPath, 'video');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    }, null, 2));

    const tool = resolveStudioDeliveryTool({
      sessionKey,
      messageChannel: 'webchat',
    });
    assert.ok(tool);

    const result = await tool.execute('tool-call-2', {
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
          fileName: 'diagram.png',
          filePath: imagePath,
        },
        {
          id: 'file-1',
          kind: 'file',
          fileName: 'report.txt',
          filePath,
        },
        {
          id: 'video-1',
          kind: 'video',
          fileName: 'demo.mp4',
          filePath: videoPath,
        },
      ],
    });

    fs.writeFileSync(sessionFile, [
      JSON.stringify({
        type: 'message',
        id: 'assistant-envelope',
        timestamp: '2026-03-21T00:00:00.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '' },
            {
              type: 'toolCall',
              id: 'tool-call-2',
              name: 'studio_delivery',
              arguments: {
                version: 2,
                blocks: result.details.blocks,
                resources: result.details.resources,
              },
            },
          ],
          stopReason: 'toolUse',
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'message-2',
        timestamp: '2026-03-21T00:00:00.000Z',
        message: {
          role: 'toolResult',
          toolCallId: 'tool-call-2',
          toolName: 'studio_delivery',
          details: result.details,
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'assistant-no-reply',
        timestamp: '2026-03-21T00:00:01.000Z',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'NO_REPLY' },
          ],
          stopReason: 'stop',
        },
      }),
    ].join('\n') + '\n');

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const history = await context.services.chat.getHistory(sessionKey);
    assert.equal(history.messages.length, 1);
    const message = history.messages[0];
    assert.equal(message.id, 'message-2');
    assert.equal(message.text, '结构图 diagram.png，源文件 report.txt。\n演示视频 demo.mp4 在这里。');
    assert.deepEqual(message.blocks, [
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
    ]);
    assert.equal(message.resources?.length, 3);
    assert.equal(message.resources?.every((item) => item.source === 'studio_delivery'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('gateway history shape with payload serialized in toolResult text still compiles into assistant delivery', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-service-delivery-gateway-shape-'));
  const workspace = path.join(root, 'workspace');
  const sessionKey = 'agent:main:webchat:direct:studio-test';
  const sessionFile = path.join(root, 'agents', 'main', 'sessions', 'studio-test.jsonl');
  const sessionStoreFile = path.join(root, 'agents', 'main', 'sessions', 'sessions.json');
  const imagePath = path.join(workspace, 'diagram.png');
  const filePath = path.join(workspace, 'report.txt');

  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(filePath, 'hello');
    fs.writeFileSync(path.join(root, 'openclaw.json'), JSON.stringify({
      agents: {
        defaults: { workspace },
        list: [{ id: 'main', workspace, default: true }],
      },
    }, null, 2));
    fs.writeFileSync(sessionStoreFile, JSON.stringify({
      [sessionKey]: {
        sessionId: 'session-1',
        sessionFile,
        label: 'Studio chat · main',
        updatedAt: '2026-03-21T00:00:00.000Z',
      },
    }, null, 2));

    fs.writeFileSync(sessionFile, [
      JSON.stringify({
        type: 'message',
        id: 'assistant-envelope',
        timestamp: '2026-03-21T00:00:00.000Z',
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
                      { type: 'text', text: '应该被跳过 ' },
                      { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
                    ],
                  },
                ],
                resources: [
                  {
                    id: 'img-1',
                    kind: 'image',
                    fileName: 'diagram.png',
                    filePath: imagePath,
                  },
                ],
              },
            },
          ],
          stopReason: 'toolUse',
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'gateway-toolresult',
        timestamp: '2026-03-21T00:00:01.000Z',
        message: {
          role: 'toolResult',
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                type: 'studio_delivery',
                version: 2,
                blocks: [
                  {
                    type: 'paragraph',
                    segments: [
                      { type: 'text', text: '结构图 ' },
                      { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
                      { type: 'text', text: '，附件 ' },
                      { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
                    ],
                  },
                ],
                resources: [
                  {
                    id: 'img-1',
                    kind: 'image',
                    fileName: 'diagram.png',
                    filePath: imagePath,
                  },
                  {
                    id: 'file-1',
                    kind: 'file',
                    fileName: 'report.txt',
                    filePath,
                  },
                ],
              }),
            },
          ],
          stopReason: 'toolUse',
        },
      }),
      JSON.stringify({
        type: 'message',
        id: 'assistant-no-reply',
        timestamp: '2026-03-21T00:00:02.000Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'NO_REPLY' }],
          stopReason: 'stop',
        },
      }),
    ].join('\n') + '\n');

    const config = createStandaloneStudioConfig({
      openclawRoot: root,
      gatewayPort: 0,
      gatewayWsUrl: 'ws://127.0.0.1:0',
    });
    const context = createStudioContext({
      config,
      logger: createLogger(),
    });

    const history = await context.services.chat.getHistory(sessionKey);
    assert.equal(history.messages.length, 1);
    const message = history.messages[0];
    assert.equal(message.id, 'gateway-toolresult');
    assert.equal(message.role, 'assistant');
    assert.deepEqual(message.blocks, [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '结构图 ' },
          { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
          { type: 'text', text: '，附件 ' },
          { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
        ],
      },
    ]);
    assert.equal(message.resources?.length, 2);
    assert.equal(message.resources?.every((item) => item.source === 'studio_delivery'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
