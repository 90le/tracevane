import { chromium } from '@playwright/test';
import { resolveWritableSmokeDirectory } from './file-manager-smoke-paths.mjs';

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

function fileName(value) {
  const text = String(value);
  return text.includes('/') ? text.slice(text.lastIndexOf('/') + 1) : text;
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

async function closeCopyDialogIfOpen(page) {
  const copyDialog = page.getByRole('dialog', { name: '复制所选项目' });
  if (await copyDialog.count()) {
    await copyDialog.getByRole('button', { name: '取消' }).click();
    await copyDialog.waitFor({ state: 'detached', timeout: 10_000 });
  }
}

async function assertNoCopyDialog(page, context) {
  await page.waitForTimeout(500);
  if (await page.getByRole('dialog', { name: '复制所选项目' }).count()) {
    throw new Error(`File-manager copy dialog opened inside protected shortcut scope: ${context}`);
  }
}

async function assertNoFileClipboardToast(page, context) {
  await page.waitForTimeout(300);
  if (await page.getByText('已复制到文件剪贴板').count()) {
    throw new Error(`File-manager clipboard toast appeared while copying text: ${context}`);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const uniqueName = `monaco-clipboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { rootId, directoryPath: workspacePath } = resolveWritableSmokeDirectory(summary, uniqueName);
  const clipboardSourcePath = `${workspacePath}/clipboard-source.txt`;
  const editorPath = `${workspacePath}/sample.ts`;
  await cleanup(rootId, [workspacePath]);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, clipboardSourcePath, 'file-list clipboard source\n');
  await createTextFile(rootId, editorPath, 'const value = "alpha";\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);

    const sourceRow = page.locator(`[data-file-manager-entry-path="${cssAttr(clipboardSourcePath)}"]`).first();
    await waitForEntry(page, clipboardSourcePath);
    await sourceRow.click({ force: true });
    const selectedText = await page.evaluate(() => {
      const node = document.querySelector('[data-file-manager-display-path]');
      if (!node) throw new Error('Display path text not found');
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return selection?.toString() || '';
    });
    if (!selectedText.trim()) throw new Error('Unable to create display path text selection for clipboard regression');
    await page.keyboard.press(`${MOD}+C`);
    await assertNoFileClipboardToast(page, 'file row text selection');
    await page.keyboard.press(`${MOD}+V`);
    await assertNoCopyDialog(page, 'file row text selection');
    await page.evaluate(() => window.getSelection()?.removeAllRanges());

    await sourceRow.click({ force: true });
    await page.keyboard.press(`${MOD}+C`);
    await page.keyboard.press(`${MOD}+V`);
    await page.getByRole('dialog', { name: '复制所选项目' }).waitFor({ timeout: 10_000 });
    await closeCopyDialogIfOpen(page);

    await sourceRow.click({ force: true });
    await page.keyboard.press(`${MOD}+C`);

    const editorRow = page.locator(`[data-file-manager-entry-path="${cssAttr(editorPath)}"]`).first();
    await waitForEntry(page, editorPath);
    await editorRow.evaluate((node) => {
      node.scrollIntoView({ block: 'center', inline: 'nearest' });
      node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.waitForFunction(
      (name) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(name),
      fileName(editorPath),
      { timeout: 30_000 },
    );

    await page.locator('[data-code-editor="monaco-direct"]').click({ position: { x: 160, y: 80 }, force: true });
    await page.locator('.monaco-editor textarea').first().waitFor({ state: 'attached', timeout: 30_000 });
    await page.keyboard.press(`${MOD}+A`);
    await page.keyboard.press(`${MOD}+C`);
    await page.keyboard.press(`${MOD}+V`);
    await assertNoCopyDialog(page, 'real Monaco keyboard event');

    await page.evaluate(() => {
      const root = document.querySelector('[data-code-editor="monaco-direct"]');
      if (!root) throw new Error('Monaco editor root not found');
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await assertNoCopyDialog(page, 'editor-root bubbling shortcut event');

    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 10_000 });
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 10_000 });
    const fatalLogs = logs.filter((line) => line.includes('[pageerror]') || line.includes('Maximum update depth') || line.includes('Invalid hook call'));
    if (fatalLogs.length > 0) {
      throw new Error(`Monaco clipboard smoke emitted fatal logs:\n${fatalLogs.join('\n')}`);
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
