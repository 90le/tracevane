import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

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
  await page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"] [data-file-manager-row-edit]`).first().click({ force: true });
  await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
}

async function collectTokenClasses(page) {
  await page.waitForTimeout(2_500);
  return page.evaluate(() => {
    const editor = document.querySelector('[data-code-editor="monaco-direct"]');
    return {
      dataLanguage: editor?.getAttribute('data-editor-language'),
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

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const workspacePath = `tmp/highlight-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tsPath = `${workspacePath}/sample.ts`;
  const htmlPath = `${workspacePath}/sample.html`;
  await cleanup(rootId, [workspacePath]);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, tsPath, 'const answer: number = 42;\nexport function greet(name: string) {\n  return `hello ${name}`;\n}\n');
  await createTextFile(rootId, htmlPath, '<!doctype html>\n<html><body><h1 class="title">Hello</h1></body></html>\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);

    await openFileInOnlineEditor(page, tsPath);
    assertHighlighted('typescript', await collectTokenClasses(page));

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await openFileInOnlineEditor(page, htmlPath);
    assertHighlighted('html', await collectTokenClasses(page));

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
