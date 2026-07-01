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

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const workspacePath = `tmp/monaco-nls-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const samplePath = `${workspacePath}/sample.ts`;
  await cleanup(rootId, [workspacePath]);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, samplePath, 'const localized = "monaco";\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await openFileInOnlineEditor(page, samplePath);

    await page.waitForSelector('[data-file-online-editor-panel]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-action-menu-trigger]').click();
    await page.waitForSelector('[data-file-online-editor-action-menu]', { timeout: 10_000 });
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-find]').click();
    await page.locator('.monaco-editor .find-widget').first().waitFor({ state: 'visible', timeout: 30_000 });
    const nls = await page.evaluate(() => {
      const findWidget = document.querySelector('.monaco-editor .find-widget');
      const labels = [...(findWidget?.querySelectorAll('[title], [aria-label]') ?? [])]
        .map((node) => `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''}`.trim())
        .filter(Boolean);
      return {
        language: globalThis._VSCODE_NLS_LANGUAGE,
        messages: globalThis._VSCODE_NLS_MESSAGES?.slice(0, 12) ?? [],
        labels,
      };
    });

    if (nls.language !== 'zh-cn') {
      throw new Error(`Expected Monaco NLS language zh-cn, got ${JSON.stringify(nls)}`);
    }
    if (!nls.messages.includes('区分大小写') || !nls.messages.includes('全字匹配')) {
      throw new Error(`Expected zh-CN Monaco messages to be loaded, got ${JSON.stringify(nls)}`);
    }
    const labelText = nls.labels.join('\n');
    if (!/区分大小写|全字匹配|使用正则表达式|关闭/.test(labelText)) {
      throw new Error(`Expected visible Monaco find widget labels to use zh-CN, got ${JSON.stringify(nls.labels)}`);
    }

    const fatalLogs = logs.filter((line) => line.includes('[pageerror]') || line.includes('Maximum update depth') || line.includes('Invalid hook call'));
    if (fatalLogs.length > 0) {
      throw new Error(`Monaco NLS smoke emitted fatal logs:\n${fatalLogs.join('\n')}`);
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
