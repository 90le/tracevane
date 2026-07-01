import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

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

async function waitForEntry(page, path) {
  await page.waitForFunction(
    (targetPath) => [...document.querySelectorAll('[data-file-manager-entry-path]')].some((node) => node.getAttribute('data-file-manager-entry-path') === targetPath),
    path,
    { timeout: 60_000 },
  );
}

async function contextMenuAction(page, path, name) {
  await waitForEntry(page, path);
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"]`).first();
  await row.evaluate((node) => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 360, clientY: 260 }));
  });
  await page.getByRole('menuitem', { name }).click();
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const workspacePath = `tmp/file-surface-routing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const textPath = `${workspacePath}/route-check.ts`;
  const binaryPath = `${workspacePath}/route-check.bin`;
  await cleanup(rootId, [workspacePath]);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, textPath, 'export const routeCheck = true;\n');
  await createTextFile(rootId, binaryPath, 'not-textlike-by-extension\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);

    await contextMenuAction(page, textPath, '检查文件（弹窗）');
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    if (await page.locator('[data-file-preview-dialog]').count()) {
      throw new Error('Text/code context-menu inspect should route to the Monaco online editor, not the legacy preview dialog');
    }
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });

    const row = page.locator(`[data-file-manager-entry-path="${cssAttr(textPath)}"]`).first();
    await row.click({ force: true });
    await page.keyboard.press(`${MOD}+Enter`);
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });

    await contextMenuAction(page, binaryPath, '检查文件（弹窗）');
    await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
    if (await page.locator('[data-code-editor="monaco-direct"]').count()) {
      throw new Error('Non-text fallback should not mount Monaco before media/binary File Surface panels are implemented');
    }

    const fatalLogs = logs.filter((line) => line.includes('[pageerror]') || line.includes('Maximum update depth') || line.includes('Invalid hook call'));
    if (fatalLogs.length > 0) {
      throw new Error(`File Surface routing smoke emitted fatal logs:\n${fatalLogs.join('\n')}`);
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
