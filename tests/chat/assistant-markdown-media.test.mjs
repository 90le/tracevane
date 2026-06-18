import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createStudioChatMediaBridge } from '../../dist/apps/api/modules/chat/media-bridge.js';
import { parseStudioMarkdownMediaRef, stripStudioMarkdownMediaMeta } from '../../dist/lib/studio-markdown-media.js';

function createTempStudioConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openclaw-studio-assistant-markdown-'));
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
      pluginId: 'studio',
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

function createBridge(studio) {
  return createStudioChatMediaBridge(studio.config);
}

function expectCompiledHref(markdown, label) {
  const match = markdown.match(new RegExp(`\\[${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\]\\(([^\\s)]+)`));
  assert.ok(match?.[1], `expected compiled href for ${label}`);
  return stripStudioMarkdownMediaMeta(match[1]);
}

test('parseStudioMarkdownMediaRef recognizes workspace, uploads, and studio-file refs', () => {
  assert.deepEqual(parseStudioMarkdownMediaRef('workspace:graph.png'), {
    kind: 'workspace',
    path: 'graph.png',
  });
  assert.deepEqual(parseStudioMarkdownMediaRef('uploads:demo.mp4'), {
    kind: 'uploads',
    path: 'demo.mp4',
  });
  assert.deepEqual(parseStudioMarkdownMediaRef('studio-file:/tmp/report.pdf'), {
    kind: 'studio-file',
    path: '/tmp/report.pdf',
  });
  assert.equal(parseStudioMarkdownMediaRef('workspace:/graph.png'), null);
  assert.equal(parseStudioMarkdownMediaRef('ftp:graph.png'), null);
});

test('assistant markdown compile upgrades workspace: break-image links into signed media urls', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '前文。\n\n[结构图](workspace:graph.png "studio:break-image")\n',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].source, 'assistant_markdown');
    assert.equal(result.resources[0].kind, 'image');
    assert.match(result.markdown, /studio:break-image/);
    const compiled = expectCompiledHref(result.markdown, '结构图');
    assert.match(compiled.url, /\/api\/chat\/sessions\//);
    assert.equal(compiled.kind, 'image');
    assert.equal(compiled.fileName, 'graph.png');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades workspace: inline-image image syntax', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '![结构图](workspace:graph.png "studio:inline-image")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'image');
    assert.match(result.markdown, /^!\[结构图\]\(\/api\/chat\/sessions\//);
    assert.match(result.markdown, /studio:inline-image/);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades workspace: break-video links', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'demo.mp4'), 'video');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[演示视频](workspace:demo.mp4 "studio:break-video")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'video');
    const compiled = expectCompiledHref(result.markdown, '演示视频');
    assert.equal(compiled.kind, 'video');
    assert.equal(compiled.fileName, 'demo.mp4');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades uploads: break-chip links', () => {
  const studio = createTempStudioConfig();

  try {
    fs.mkdirSync(path.join(studio.workspace, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(studio.workspace, 'uploads', 'report.pdf'), 'pdf');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[安装包](uploads:report.pdf "studio:break-chip")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
    assert.equal(compiled.fileName, 'report.pdf');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades studio-file: absolute path card links', () => {
  const studio = createTempStudioConfig();

  try {
    const reportPath = path.join(studio.workspace, 'report.pdf');
    fs.writeFileSync(reportPath, 'pdf');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      `[安装包](studio-file:${reportPath} "studio:card")`,
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    assert.match(result.markdown, /studio:card/);
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades studio-file: image syntax under state media root', () => {
  const studio = createTempStudioConfig();

  try {
    const mediaDir = path.join(studio.root, 'media', 'tool-image-generation');
    fs.mkdirSync(mediaDir, { recursive: true });
    const imagePath = path.join(mediaDir, 'cyberpunk-city.png');
    fs.writeFileSync(imagePath, 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      `![赛博朋克未来城市夜景](studio-file:${imagePath} "studio:break-image")`,
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'ready');
    assert.equal(result.resources[0].originalPath, `studio-file:${imagePath}`);
    assert.match(result.markdown, /^!\[赛博朋克未来城市夜景\]\(\/api\/chat\/sessions\//);
    assert.doesNotMatch(result.markdown, /studio-file:/);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades studio-file: relative path inline-chip links', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'report.pdf'), 'pdf');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[安装包](studio-file:./report.pdf "studio:inline-chip")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'file');
    assert.match(result.markdown, /studio:inline-chip/);
    const compiled = expectCompiledHref(result.markdown, '安装包');
    assert.equal(compiled.kind, 'file');
    assert.equal(compiled.fileName, 'report.pdf');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores ordinary links and images without studio title', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[结构图](./graph.png)\n\n![结构图](./graph.png)',
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores unknown schemes', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[结构图](asset:graph.png "studio:break-image")',
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile ignores code fences and inline code studio hints', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      [
        '```md',
        '[结构图](workspace:graph.png "studio:break-image")',
        '```',
        '',
        '正文里还有 `[结构图](workspace:graph.png "studio:inline-image")`。',
      ].join('\n'),
    );

    assert.equal(result, null);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile records missing explicit local refs', () => {
  const studio = createTempStudioConfig();

  try {
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[结构图](workspace:missing.png "studio:break-image")',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'missing');
    assert.equal(result.resources[0].relativePath, 'missing.png');
    assert.equal(result.resources[0].originalPath, 'workspace:missing.png');
    assert.match(result.markdown, /workspace:missing\.png/);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile records missing studio-file image refs without dropping the resource', () => {
  const studio = createTempStudioConfig();

  try {
    const missingPath = path.join(studio.root, 'media', 'tool-image-generation', 'missing-city.png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      `![赛博朋克未来城市夜景](studio-file:${missingPath} "studio:break-image")`,
    );

    assert.ok(result);
    assert.equal(result.resources.length, 1);
    assert.equal(result.resources[0].kind, 'image');
    assert.equal(result.resources[0].status, 'missing');
    assert.equal(result.resources[0].fileName, 'missing-city.png');
    assert.equal(result.resources[0].originalPath, `studio-file:${missingPath}`);
    assert.match(result.markdown, new RegExp(`studio-file:${missingPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile keeps legacy bare relative path fallback', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '[结构图](./graph.png "studio:break-image")',
    );

    assert.ok(result);
    assert.equal(result.resources[0].kind, 'image');
    const compiled = expectCompiledHref(result.markdown, '结构图');
    assert.equal(compiled.kind, 'image');
    assert.equal(compiled.fileName, 'graph.png');
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades raw html img/video/a refs into signed media urls', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'graph.png'), 'png');
    fs.mkdirSync(path.join(studio.workspace, 'uploads'), { recursive: true });
    fs.writeFileSync(path.join(studio.workspace, 'uploads', 'demo.mp4'), 'video');
    fs.writeFileSync(path.join(studio.workspace, 'report.pdf'), 'pdf');

    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      [
        '<div>',
        '  <img src="workspace:graph.png" title="studio:break-image" alt="结构图">',
        '  <video src="uploads:demo.mp4" title="studio:break-video"></video>',
        '  <a href="studio-file:./report.pdf" title="studio:card">安装包</a>',
        '</div>',
      ].join('\n'),
    );

    assert.ok(result);
    assert.equal(result.resources.length, 3);
    assert.match(result.markdown, /<img[^>]+src="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /<video[^>]+src="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /<a[^>]+href="\/api\/chat\/sessions\//);
    assert.match(result.markdown, /title="studio:break-image"/);
    assert.match(result.markdown, /title="studio:break-video"/);
    assert.match(result.markdown, /title="studio:card"/);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});

test('assistant markdown compile upgrades raw html srcset candidates that use local refs', () => {
  const studio = createTempStudioConfig();

  try {
    fs.writeFileSync(path.join(studio.workspace, 'small.png'), 'png');
    fs.writeFileSync(path.join(studio.workspace, 'large.png'), 'png');

    const result = createBridge(studio).compileAssistantMarkdown(
      'agent:main:webchat:direct:studio-test',
      '<img src="workspace:small.png" srcset="workspace:small.png 1x, workspace:large.png 2x" title="studio:inline-image" alt="结构图">',
    );

    assert.ok(result);
    assert.equal(result.resources.length, 2);
    assert.match(result.markdown, /srcset="\/api\/chat\/sessions\/[^"]+ 1x, \/api\/chat\/sessions\/[^"]+ 2x"/);
  } finally {
    fs.rmSync(studio.root, { recursive: true, force: true });
  }
});
