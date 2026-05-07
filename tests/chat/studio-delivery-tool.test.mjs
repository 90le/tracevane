import test from 'node:test';
import assert from 'node:assert/strict';

import studioPlugin, { plugin as namedStudioPlugin } from '../../dist/index.js';
import { normalizeStudioDeliveryInputDetailed } from '../../dist/lib/studio-delivery.js';
import { resolveStudioDeliveryTool } from '../../dist/lib/studio-delivery-tool.js';

test('studio plugin exposes default and named exports for host compatibility', () => {
  assert.equal(namedStudioPlugin, studioPlugin);
});

test('studio plugin registers studio_delivery tool', () => {
  const registeredTools = [];
  const registeredServices = [];
  const registeredHooks = [];

  studioPlugin.register({
    registerTool(tool, opts) {
      registeredTools.push({ tool, opts });
    },
    registerService(service) {
      registeredServices.push(service);
    },
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    on(name, handler, opts) {
      registeredHooks.push({ name, handler, opts });
    },
  });

  assert.equal(registeredServices.length, 1);
  assert.equal(registeredTools.length, 1);
  assert.equal(registeredTools[0]?.opts?.name, 'studio_delivery');
  assert.deepEqual(registeredHooks.map((entry) => entry.name), [
    'before_prompt_build',
    'before_tool_call',
    'reply_dispatch',
  ]);
  assert.equal(registeredHooks[0]?.opts?.priority, 100);
  assert.equal(registeredHooks[1]?.opts?.priority, 100);
  assert.equal(registeredHooks[2]?.opts?.priority, 100);
});

test('studio_delivery only appears in Studio-managed webchat sessions', () => {
  assert.ok(resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageChannel: 'webchat',
  }));

  assert.equal(resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:user-123',
    messageChannel: 'webchat',
  }), null);

  assert.equal(resolveStudioDeliveryTool({
    sessionKey: 'agent:main:discord:direct:studio-test',
    messageChannel: 'discord',
  }), null);
});

test('studio_delivery execute returns normalized structured payload', async () => {
  const tool = resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageChannel: 'webchat',
  });

  assert.ok(tool);

  const result = await tool.execute('tool-call-1', {
    blocks: [
      { type: 'text', text: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        fileName: 'notes.txt',
        filePath: '/tmp/notes.txt',
      },
    ],
  });

  assert.deepEqual(result.details, {
    type: 'studio_delivery',
    version: 1,
    blocks: [
      { type: 'text', text: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        fileName: 'notes.txt',
        mimeType: null,
        filePath: '/tmp/notes.txt',
        contentType: null,
      },
    ],
  });
  assert.match(result.content[0]?.text || '', /"type": "studio_delivery"/);

  await assert.rejects(
    () => tool.execute('tool-call-2', {
      blocks: [
        { type: 'resource', resourceId: 'missing' },
      ],
      resources: [],
    }),
    /requires every resource reference to point to an existing resources\[\]\.id/i,
  );
});

test('studio_delivery normalize keeps v1 legacy blocks compatible', () => {
  const normalized = normalizeStudioDeliveryInputDetailed({
    blocks: [
      { type: 'text', content: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
      { type: 'markdown', message: '第二段' },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        fileName: 'notes.txt',
        filePath: '/tmp/notes.txt',
      },
    ],
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.payload?.version, 1);
  assert.deepEqual(normalized.payload?.blocks, [
    { type: 'text', text: '第一段' },
    { type: 'resource', resourceId: 'file-1' },
    { type: 'text', text: '第二段' },
  ]);
});

test('studio_delivery normalize produces v2 paragraphs, inline segments, and cards', () => {
  const normalized = normalizeStudioDeliveryInputDetailed({
    version: 2,
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '图 ' },
          { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
          { type: 'text', text: '，视频 ' },
          { type: 'resource', resourceId: 'video-1', display: 'inline-video' },
          { type: 'text', text: '，文件 ' },
          { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
        ],
      },
      { type: 'resource', resourceId: 'file-1', display: 'card' },
    ],
    resources: [
      { id: 'img-1', kind: 'image', fileName: 'diagram.png', filePath: '/tmp/diagram.png' },
      { id: 'video-1', kind: 'video', fileName: 'demo.mp4', filePath: '/tmp/demo.mp4' },
      { id: 'file-1', kind: 'file', fileName: 'report.pdf', filePath: '/tmp/report.pdf' },
    ],
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.payload?.version, 2);
  assert.deepEqual(normalized.payload?.blocks, [
    {
      type: 'paragraph',
      segments: [
        { type: 'text', text: '图 ' },
        { type: 'resource', resourceId: 'img-1', display: 'inline-image' },
        { type: 'text', text: '，视频 ' },
        { type: 'resource', resourceId: 'video-1', display: 'inline-video' },
        { type: 'text', text: '，文件 ' },
        { type: 'resource', resourceId: 'file-1', display: 'inline-chip' },
      ],
    },
    { type: 'resource', resourceId: 'file-1', display: 'card' },
  ]);
});

test('studio_delivery normalize accepts break displays for line-break rich replies', () => {
  const normalized = normalizeStudioDeliveryInputDetailed({
    version: 2,
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '正文。' },
          { type: 'resource', resourceId: 'img-1', display: 'break-image' },
          { type: 'text', text: '继续。' },
          { type: 'resource', resourceId: 'video-1', display: 'break-video' },
          { type: 'text', text: '再继续。' },
          { type: 'resource', resourceId: 'file-1', display: 'break-chip' },
        ],
      },
    ],
    resources: [
      { id: 'img-1', kind: 'image', fileName: 'diagram.png', filePath: '/tmp/diagram.png' },
      { id: 'video-1', kind: 'video', fileName: 'demo.mp4', filePath: '/tmp/demo.mp4' },
      { id: 'file-1', kind: 'file', fileName: 'report.pdf', filePath: '/tmp/report.pdf' },
    ],
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.payload?.version, 2);
  assert.deepEqual(normalized.payload?.blocks, [
    {
      type: 'paragraph',
      segments: [
        { type: 'text', text: '正文。' },
        { type: 'resource', resourceId: 'img-1', display: 'break-image' },
        { type: 'text', text: '继续。' },
        { type: 'resource', resourceId: 'video-1', display: 'break-video' },
        { type: 'text', text: '再继续。' },
        { type: 'resource', resourceId: 'file-1', display: 'break-chip' },
      ],
    },
  ]);
});

test('studio_delivery normalize rejects invalid inline kind bindings and empty paragraphs', () => {
  const wrongKind = normalizeStudioDeliveryInputDetailed({
    version: 2,
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '图 ' },
          { type: 'resource', resourceId: 'file-1', display: 'inline-image' },
        ],
      },
    ],
    resources: [
      { id: 'file-1', kind: 'file', fileName: 'report.pdf', filePath: '/tmp/report.pdf' },
    ],
  });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.error || '', /inline-image can only reference kind=image/i);

  const wrongBreakKind = normalizeStudioDeliveryInputDetailed({
    version: 2,
    blocks: [
      {
        type: 'paragraph',
        segments: [
          { type: 'text', text: '视频 ' },
          { type: 'resource', resourceId: 'img-1', display: 'break-video' },
        ],
      },
    ],
    resources: [
      { id: 'img-1', kind: 'image', fileName: 'diagram.png', filePath: '/tmp/diagram.png' },
    ],
  });
  assert.equal(wrongBreakKind.ok, false);
  assert.match(wrongBreakKind.error || '', /break-video can only reference kind=video/i);

  const emptyParagraph = normalizeStudioDeliveryInputDetailed({
    version: 2,
    blocks: [
      {
        type: 'paragraph',
        segments: [],
      },
    ],
    resources: [],
  });
  assert.equal(emptyParagraph.ok, false);
  assert.match(emptyParagraph.error || '', /paragraph\.segments/i);
});

test('studio_delivery execute accepts text block aliases and preserves mixed block order', async () => {
  const tool = resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageChannel: 'webchat',
  });

  assert.ok(tool);

  const result = await tool.execute('tool-call-3', {
    blocks: [
      { type: 'text', content: '第一段' },
      { type: 'resource', resourceId: 'file-1' },
      { type: 'markdown', message: '第二段' },
    ],
    resources: [
      {
        id: 'file-1',
        kind: 'file',
        fileName: 'notes.txt',
        filePath: '/tmp/notes.txt',
      },
    ],
  });

  assert.deepEqual(result.details.blocks, [
    { type: 'text', text: '第一段' },
    { type: 'resource', resourceId: 'file-1' },
    { type: 'text', text: '第二段' },
  ]);
});

test('studio_delivery execute fails explicitly when text intent is dropped during normalization', async () => {
  const tool = resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageChannel: 'webchat',
  });

  assert.ok(tool);

  await assert.rejects(
    () => tool.execute('tool-call-4', {
      blocks: [
        { type: 'markdown', content: '   ' },
        { type: 'resource', resourceId: 'file-1' },
      ],
      resources: [
        {
          id: 'file-1',
          kind: 'file',
          fileName: 'notes.txt',
          filePath: '/tmp/notes.txt',
        },
      ],
    }),
    /dropped all text-like blocks during normalization/i,
  );
});

test('studio_delivery description explicitly forbids message and path output for Studio returns', () => {
  const tool = resolveStudioDeliveryTool({
    sessionKey: 'agent:main:webchat:direct:studio-test',
    messageChannel: 'webchat',
  });

  assert.ok(tool);
  assert.match(tool.description, /fallback studio-only final delivery tool/i);
  assert.match(tool.description, /prefer assistant markdown rich replies first/i);
  assert.match(tool.description, /use studio_delivery only when assistant markdown cannot express/i);
  assert.match(tool.description, /do not use message/i);
  assert.match(tool.description, /do not output file paths/i);
  assert.match(tool.description, /primary markdown examples/i);
  assert.match(tool.description, /fallback worked example/i);
  assert.match(tool.description, /worked example/i);
  assert.match(tool.description, /break-image/i);
  assert.match(tool.description, /break-video/i);
  assert.match(tool.description, /break-chip/i);
  assert.match(tool.description, /inline-image/i);
  assert.match(tool.description, /inline-video/i);
  assert.match(tool.description, /inline-chip/i);
});

test('studio plugin injects Studio delivery guidance and blocks current-session message misuse', () => {
  const registeredHooks = [];

  studioPlugin.register({
    registerTool() {},
    registerService() {},
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    on(name, handler, opts) {
      registeredHooks.push({ name, handler, opts });
    },
  });

  const beforePromptBuild = registeredHooks.find((entry) => entry.name === 'before_prompt_build');
  const beforeToolCall = registeredHooks.find((entry) => entry.name === 'before_tool_call');

  assert.ok(beforePromptBuild);
  assert.ok(beforeToolCall);

  const guidance = beforePromptBuild.handler(
    { prompt: 'send it back', messages: [] },
    { sessionKey: 'agent:main:webchat:direct:studio-test', channelId: 'webchat' },
  );
  assert.match(guidance?.appendSystemContext || '', /assistant markdown rich replies are the primary path/i);
  assert.match(guidance?.appendSystemContext || '', /prefer assistant markdown with explicit studio resource refs/i);
  assert.match(guidance?.appendSystemContext || '', /use studio_delivery only as a fallback/i);
  assert.match(guidance?.appendSystemContext || '', /do not use message/i);
  assert.match(guidance?.appendSystemContext || '', /do not call gateway, cron, sessions_list, sessions_history, sessions_send, sessions_spawn, or session_status/i);
  assert.match(guidance?.appendSystemContext || '', /workspace:/i);
  assert.match(guidance?.appendSystemContext || '', /uploads:/i);
  assert.match(guidance?.appendSystemContext || '', /studio-file:/i);
  assert.match(guidance?.appendSystemContext || '', /break-image/i);
  assert.match(guidance?.appendSystemContext || '', /inline-image/i);

  const blocked = beforeToolCall.handler(
    {
      toolName: 'message',
      params: {
        action: 'sendAttachment',
        channel: 'webchat',
      },
    },
    { sessionKey: 'agent:main:webchat:direct:studio-test', channelId: 'webchat' },
  );
  assert.equal(blocked?.block, true);
  assert.match(blocked?.blockReason || '', /studio_delivery/i);

  for (const toolName of ['gateway', 'cron', 'sessions_list', 'sessions_history', 'sessions_send', 'sessions_spawn', 'session_status']) {
    const blockedManagementTool = beforeToolCall.handler(
      {
        toolName,
        params: {
          action: 'status',
        },
      },
      { sessionKey: 'agent:main:webchat:direct:studio-test', channelId: 'webchat' },
    );
    assert.equal(blockedManagementTool?.block, true, `${toolName} should be blocked in Studio webchat`);
    assert.match(blockedManagementTool?.blockReason || '', /studio webchat private chat/i);
  }

  const allowedExternalTarget = beforeToolCall.handler(
    {
      toolName: 'message',
      params: {
        action: 'sendAttachment',
        channel: 'telegram',
        target: 'user-123',
      },
    },
    { sessionKey: 'agent:main:webchat:direct:studio-test', channelId: 'webchat' },
  );
  assert.equal(allowedExternalTarget, undefined);
});
