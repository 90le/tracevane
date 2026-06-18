import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createTracevaneChatMediaBridge } from '../../dist/apps/api/modules/chat/media-bridge.js';
import { parseTracevaneMarkdownMediaRef, stripTracevaneMarkdownMediaMeta } from '../../dist/lib/tracevane-markdown-media.js';

function createTempTracevaneConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-assistant-markdown-'));
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

function createBridge(tracevane) {
  return createTracevaneChatMediaBridge(tracevane.config);
}

function expectCompiledHref(markdown, label) {
  const match = markdown.match(new RegExp(`\\[${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]\\(([^\\s)]+)`));
  assert.ok(match?.[1], `expected compiled href for ${label}`);
  return stripTracevaneMarkdownMediaMeta(match[1]);
}

test('parseTracevaneMarkdownMediaRef recognizes workspace, uploads, and tracevane-file refs', () => {
  assert.deepEqual(parseTracevaneMarkdownMediaRef('workspace:graph.png'), {
    kind: 'workspace',
    path: 'graph.png',
  });
  assert.deepEqual(parseTracevaneMarkdownMediaRef('uploads:demo.mp4'), {
    kind: 'uploads',
    path: 'demo.mp4',
  });
  assert.deepEqual(parseTracevaneMarkdownMediaRef('tracevane-file:/tmp/report.pdf'), {
    kind: 'tracevane-file',
    path: '/tmp/report.pdf',
  });
  assert.equal(parseTracevaneMarkdownMediaRef('workspace:/graph.png'), null);
  assert.equal(parseTracevaneMarkdownMediaRef('ftp:graph.png'), null);
});

test('assistant markdown compile upgrades workspace: break-image links into signed media urls', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '前文。\n\n[结构图](workspace:graph.png "tracevane:break-image")\n',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].source, 'assistant_markdown');
    assert.equal(result.resources[0].kind, 'image');
    assert.match(result.markdown, /tracevane:break-image/);
    const compiled = expectCompiledHref(result.markdown, '结构图');
    assert.match(compiled.url, /\/api\/chat\/sessions\//);
    assert.equal(compiled.kind, 'image');
    assert.equal(compiled.fileName, 'graph.png');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades workspace: inline-image image syntax', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '![结构图](workspace:graph.png "tracevane:inline-image")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'image');
    assert.match(result.markdown, /^!\[结构图\]\(\/api\/chat\/sessions\//);
    assert.match(result.markdown, /tracevane:inline-image/);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades workspace: break-video links', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'demo.mp4'), 'video');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[演示视频](workspace:demo.mp4 "tracevane:break-video")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'video');
    const compiled = expectCompiledHref(result.markdown, '演示视频');
    assert.equal(compiled.kind, 'video');
    assert.equal(compiled.fileName, 'demo.mp4');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades uploads: break-chip links', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.mkdirSync(path.join(tracevane.workspace, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(tracevane.workspace, 'uploads', 'report.pdf'), 'pdf');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[安装包](uploads:report.pdf "tracevane:break-chip")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
    assert.equal(compiled.fileName, 'report.pdf');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades tracevane-file: absolute path card links', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    const reportPath = path.join(tracevane.workspace, 'report.pdf');
    fs.writeFileSync(reportPath, 'pdf');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      `[安装包](tracevane-file:${reportPath} "tracevane:card")`,
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    assert.match(result.markdown, /tracevane:card/);
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades tracevane-file: image syntax under state media root', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    const mediaDir = path.join(tracevane.root, 'media', 'tool-image-generation');
    fs.mkdirSync(mediaDir, { recursive: true });
    const imagePath = path.join(mediaDir, 'cyberpunk-city.png');
    fs.writeFileSync(imagePath, 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      `![赛博朋克未来城市夜景](tracevane-file:${imagePath} "tracevane:break-image")`,
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'ready');
    assert.equal(result.resources[0].originalPath, `tracevane-file:${imagePath}`);
    assert.match(result.markdown, /^!\[赛博朋克未来城市夜景\]\(\/api\/chat\/sessions\//);
    assert.doesNotMatch(result.markdown, /tracevane-file:/);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades tracevane-file: relative path inline-chip links', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'report.pdf'), 'pdf');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[安装包](tracevane-file:./report.pdf "tracevane:inline-chip")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    assert.match(result.markdown, /tracevane:inline-chip/);
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
    assert.equal(compiled.fileName, 'report.pdf');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores ordinary links and images without tracevane title', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[结构图](./graph.png)\n\n![结构图](./graph.png)',
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores unknown schemes', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[结构图](asset:graph.png "tracevane:break-image")',
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores code fences and inline code tracevane hints', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      [
        '```md',
        '[结构图](workspace:graph.png "tracevane:break-image")',
        '```',
        '',
        '正文里还有 `[结构图](workspace:graph.png "tracevane:inline-image")`。',
      ].join('\n'),
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile records missing explicit local refs', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[结构图](workspace:missing.png "tracevane:break-image")',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'missing');
    assert.equal(result.resources[0].relativePath, 'missing.png');
    assert.equal(result.resources[0].originalPath, 'workspace:missing.png');
    assert.match(result.markdown, /workspace:missing\.png/);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile records missing tracevane-file image refs without dropping the resource', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    const missingPath = path.join(tracevane.root, 'media', 'tool-image-generation', 'missing-city.png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      `![赛博朋克未来城市夜景](tracevane-file:${missingPath} "tracevane:break-image")`,
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'missing');
    assert.equal(result.resources[0].fileName, 'missing-city.png');
    assert.equal(result.resources[0].originalPath, `tracevane-file:${missingPath}`);
    assert.match(result.markdown, new RegExp(`tracevane-file:${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile keeps legacy bare relative path fallback', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '[结构图](./graph.png "tracevane:break-image")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'image');
    const compiled = expectCompiledHref(result.markdown, '结构图');
    assert.equal(compiled.kind, 'image');
    assert.equal(compiled.fileName, 'graph.png');
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades raw html img/video/a refs into signed media urls', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'graph.png'), 'png');
    fs.mkdirSync(path.join(tracevane.workspace, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(tracevane.workspace, 'uploads', 'demo.mp4'), 'video');
    fs.writeFileSync(path.join(tracevane.workspace, 'report.pdf'), 'pdf');

    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      [
        '<div>',
        '  <img src="workspace:graph.png" title="tracevane:break-image" alt="结构图">',
        '  <video src="uploads:demo.mp4" title="tracevane:break-video"></video>',
        '  <a href="tracevane-file:./report.pdf" title="tracevane:card">安装包</a>',
        '</div>',
      ].join('\n'),
    );

    assert.ok(result);
    assert.equal(result.resources.length, 3);
    assert.match(result.markdown, /<img[^>]+src="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /<video[^>]+src="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /<a[^>]+href="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /title="tracevane:break-image"/);
    assert.match(result.markdown, /title="tracevane:break-video"/);
    assert.match(result.markdown, /title="tracevane:card"/);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades raw html srcset candidates that use local refs', () => {
  const tracevane = createTempTracevaneConfig();

  try {
    fs.writeFileSync(path.join(tracevane.workspace, 'small.png'), 'png');
    fs.writeFileSync(path.join(tracevane.workspace, 'large.png'), 'png');

    const result = createBridge(tracevane).compileAssistantMarkdown(
      'agent:main:webchat:direct:tracevane-test',
      '<img src="workspace:small.png" srcset="workspace:small.png 1x, workspace:large.png 2x" title="tracevane:inline-image" alt="结构图">',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 2);
    assert.match(result.markdown, /srcset="\/api\/chat\/sessions\/[^"]+ 1x, \/api\/chat\/sessions\/[^"]+ 2x"/);
  } finally {
    fs.rmSync(tracevane.root, { recursive: true, force: true });
  }
});
