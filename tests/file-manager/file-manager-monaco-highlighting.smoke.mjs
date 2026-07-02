import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

const LANGUAGE_SAMPLES = [
  {
    path: 'sample.ts',
    language: 'typescript',
    content: 'const answer: number = 42;\nexport function greet(name: string) {\n  return `hello ${name}`;\n}\n',
  },
  {
    path: 'sample.html',
    language: 'html',
    content: '<!doctype html>\n<html><body><h1 class="title">Hello</h1></body></html>\n',
  },
  {
    path: 'sample.css',
    language: 'css',
    content: ':root { --accent: #67e8f9; }\n.button:hover { color: var(--accent); }\n',
  },
  {
    path: 'sample.json',
    language: 'json',
    content: '{\n  "name": "tracevane",\n  "enabled": true,\n  "count": 3\n}\n',
  },
  {
    path: 'unknown-json.payload',
    language: 'json',
    content: '{\n  "autoDetected": true,\n  "reason": "content heuristic"\n}\n',
  },
  {
    path: 'openclaw.json.last-good',
    language: 'json',
    content: '{\n  "schema": "openclaw",\n  "lastGood": true\n}\n',
  },
  {
    path: 'openclaw.json.bak.2',
    language: 'json',
    content: '{\n  "schema": "openclaw",\n  "backup": 2\n}\n',
  },
  {
    path: 'openclaw.json.pre-update',
    language: 'json',
    content: '{\n  "schema": "openclaw",\n  "preUpdate": true\n}\n',
  },
  {
    path: 'openclaw.json.clobbered.2026-05-07T04-40-40-752Z',
    language: 'json',
    content: '{\n  "schema": "openclaw",\n  "clobbered": true\n}\n',
  },
  {
    path: '123',
    language: 'json',
    content: JSON.stringify({
      schema: 'extensionless',
      json: true,
      items: Array.from({ length: 900 }, (_, index) => ({ index, value: `entry-${index}`, enabled: index % 2 === 0 })),
    }, null, 2) + '\n',
  },
  {
    path: 'component.snapshot',
    language: 'javascript',
    content: 'const answer = 42;\nfunction greet(name) { return `hello ${name}`; }\n',
  },
  {
    path: 'native-source.unknown',
    language: 'c',
    content: '#include <stdio.h>\nint main(void) { printf("tracevane\\n"); return 0; }\n',
  },
  {
    path: 'script-without-known-extension.runme',
    language: 'python',
    content: '#!/usr/bin/env python3\nprint("auto language detection")\n',
  },
  {
    path: 'query-without-known-extension.data',
    language: 'sql',
    content: 'SELECT id, name FROM files WHERE enabled = TRUE ORDER BY name;\n',
  },
  {
    path: 'project.csproj',
    language: 'xml',
    content: '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup></PropertyGroup>\n</Project>\n',
  },
  {
    path: 'sample.md',
    language: 'markdown',
    content: '# Monaco smoke\n\n- lazy language loading\n- **markdown** tokens\n',
  },
  {
    path: 'sample.py',
    language: 'python',
    content: 'def greet(name: str) -> str:\n    return f"hello {name}"\n',
  },
  {
    path: 'sample.yaml',
    language: 'yaml',
    content: 'name: tracevane\nfeatures:\n  - editor\n  - preview\n',
  },
  {
    path: 'sample.sh',
    language: 'shell',
    content: '#!/usr/bin/env bash\nset -euo pipefail\necho "tracevane"\n',
  },
  {
    path: 'sample.sql',
    language: 'sql',
    content: 'SELECT id, name FROM files WHERE text_like = TRUE ORDER BY name;\n',
  },
];

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
}

async function createDirectory(rootId, path) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function createTextFile(rootId, path, content) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content }),
  });
}

async function jumpToPath(page, directoryPath) {
  const visiblePathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])');
  if (!(await visiblePathInput.count())) {
    await page.locator('[data-file-manager-path-enter-edit]').first().click();
  }
  const pathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])').first();
  await pathInput.waitFor({ state: 'visible', timeout: 30_000 });
  await pathInput.fill(directoryPath);
  await pathInput.press('Enter');
  await page.waitForFunction(
    (path) => [...document.querySelectorAll('[data-file-manager-display-path]')].some((node) => (node.getAttribute('data-file-manager-display-path') || '').endsWith(path ? `/${path}` : '/')),
    directoryPath,
    { timeout: 30_000 },
  );
}

async function refreshFileList(page) {
  await page.getByRole('button', { name: '刷新文件列表' }).click();
}

async function openFileInOnlineEditor(page, path) {
  await refreshFileList(page);
  await page.waitForFunction(
    (targetPath) => [...document.querySelectorAll('[data-file-manager-entry-path]')].some((node) => node.getAttribute('data-file-manager-entry-path') === targetPath),
    path,
    { timeout: 60_000 },
  );
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"]`).first();
  await row.evaluate((node) => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
}

async function minimizeEditor(page) {
  await page.getByRole('button', { name: '最小化在线编辑器' }).click();
  await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
}

async function collectTokenClasses(page) {
  await page.waitForTimeout(2_500);
  return page.evaluate(() => {
    const editor = document.querySelector('[data-code-editor="monaco-direct"]');
    return {
      dataLanguage: editor?.getAttribute('data-editor-language'),
      actionCount: Number(editor?.getAttribute('data-code-editor-supported-action-count') || 0),
      supportedActions: editor?.getAttribute('data-code-editor-supported-actions') || '',
      classes: [...new Set([...document.querySelectorAll('.monaco-editor .view-line span[class]')].map((node) => node.className))],
      lines: [...document.querySelectorAll('.monaco-editor .view-line')].slice(0, 6).map((node) => node.innerHTML),
    };
  });
}

function assertHighlighted(language, result) {
  if (result.dataLanguage !== language) {
    throw new Error(`Expected editor language ${language}, got ${result.dataLanguage}: ${JSON.stringify(result.lines)}`);
  }
  const syntaxClasses = result.classes.filter((className) => /\bmtk\d+\b/.test(className) && !/^mtk1(\s|$)/.test(className));
  if (syntaxClasses.length === 0) {
    throw new Error(`Expected ${language} to render non-plaintext Monaco token classes, got ${JSON.stringify(result.classes)} lines=${JSON.stringify(result.lines)}`);
  }
}

function assertMonacoActions(result) {
  const requiredActions = ['actions.find', 'editor.action.startFindReplaceAction', 'editor.action.quickCommand'];
  if (result.actionCount < 20) {
    throw new Error(`Expected Monaco to expose many built-in actions, got ${result.actionCount}`);
  }
  for (const actionId of requiredActions) {
    if (!result.supportedActions.split(',').includes(actionId)) {
      throw new Error(`Expected Monaco supported actions to include ${actionId}, got ${result.supportedActions}`);
    }
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const workspacePath = `tmp/highlight-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const files = LANGUAGE_SAMPLES.map((sample) => ({
    ...sample,
    fullPath: `${workspacePath}/${sample.path}`,
  }));

  await cleanup(rootId, [workspacePath]);
  await createDirectory(rootId, workspacePath);
  for (const file of files) {
    await createTextFile(rootId, file.fullPath, file.content);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      await openFileInOnlineEditor(page, file.fullPath);
      const result = await collectTokenClasses(page);
      assertHighlighted(file.language, result);
      assertMonacoActions(result);
      if (index < files.length - 1) await minimizeEditor(page);
    }

    const fatalLogs = logs.filter((line) => line.includes('[pageerror]') || line.includes('Maximum update depth'));
    if (fatalLogs.length > 0) {
      throw new Error(`Monaco highlighting smoke emitted fatal logs:\n${fatalLogs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [workspacePath]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
