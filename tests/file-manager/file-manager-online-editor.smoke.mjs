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
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  return data;
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function titleForPath(value) {
  const text = String(value);
  return text.includes('/') ? text.slice(text.lastIndexOf('/') + 1) : text;
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
}

async function readFile(rootId, path) {
  return api(`/api/files/read?${new URLSearchParams({ rootId, path }).toString()}`);
}

async function createTextFile(rootId, path, content) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content }),
  });
}

async function refreshFileList(page) {
  await page.getByRole('button', { name: '刷新文件列表' }).click();
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

async function openFile(page, path, { expectEditor = true } = {}) {
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"]`).first();
  await row.waitFor({ timeout: 60_000 });
  await row.scrollIntoViewIfNeeded();
  await row.dblclick({ force: true });
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
  if (expectEditor) {
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
  }
}

async function replaceActiveEditorContent(page, content) {
  const editor = page.locator('[data-code-editor="monaco-direct"]').first();
  await editor.waitFor({ timeout: 30_000 });
  await editor.click({ position: { x: 120, y: 80 }, force: true });
  const textarea = page.locator('.monaco-editor textarea').first();
  await textarea.waitFor({ state: 'attached', timeout: 30_000 });
  await textarea.click({ force: true });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.insertText(content);
}

async function replaceActiveEditorContentAndWaitDirty(page, content) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await replaceActiveEditorContent(page, content);
    try {
      await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 5_000 });
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Editor content replacement did not mark the tab dirty');
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const prefix = `tracevane-online-editor-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const firstPath = `tmp/${prefix}-a.txt`;
  const secondPath = `tmp/${prefix}-b.txt`;
  const largePath = `tmp/${prefix}-large.txt`;
  const missingPath = `tmp/${prefix}-missing.txt`;
  const saveFailPath = `tmp/${prefix}-save-fail.txt`;
  const capacityPaths = Array.from({ length: 9 }, (_, index) => `tmp/${prefix}-capacity-${index + 1}.txt`);
  const cleanupPaths = [firstPath, secondPath, largePath, missingPath, saveFailPath, ...capacityPaths];
  await cleanup(rootId, cleanupPaths);
  await createTextFile(rootId, firstPath, 'first online editor smoke\n');
  await createTextFile(rootId, secondPath, 'second online editor smoke\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, 'tmp');
    await openFile(page, firstPath);
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await openFile(page, secondPath);

    const tabs = page.locator('[data-file-online-editor-tabs] [data-file-online-editor-tab]');
    await tabs.nth(1).waitFor({ timeout: 30_000 });
    const tabCount = await tabs.count();
    if (tabCount !== 2) throw new Error(`Expected two online editor tabs, found ${tabCount}`);

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await openFile(page, firstPath);
    const tabCountAfterDuplicateOpen = await tabs.count();
    if (tabCountAfterDuplicateOpen !== 2) {
      throw new Error(`Duplicate open should activate existing tab, found ${tabCountAfterDuplicateOpen}`);
    }

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    const tabCountAfterRestore = await tabs.count();
    if (tabCountAfterRestore !== 2) {
      throw new Error(`Minimized editor should restore existing tabs, found ${tabCountAfterRestore}`);
    }

    await page.locator(`[data-file-online-editor-tab="${cssAttr(`${rootId}:${secondPath}`)}"]`).click();
    const statusText = await page.locator('[data-file-online-editor-statusbar]').textContent();
    if (!statusText?.includes(secondPath)) throw new Error(`Status bar did not switch to second file: ${statusText}`);

    await page.locator('[data-file-online-editor-find]').click();
    await page.locator('[data-file-online-editor-replace]').click();
    await page.locator('[data-file-online-editor-goto-input]').fill('1:2');
    await page.locator('[data-file-online-editor-goto]').click();
    await page.waitForFunction(() => document.querySelector('[data-file-online-editor-cursor-position]')?.textContent?.includes('Ln 1'), null, { timeout: 30_000 });
    await page.locator('[data-file-online-editor-font-size]').fill('15');
    const fontSizeValue = await page.locator('[data-file-online-editor-font-size]').inputValue();
    if (fontSizeValue !== '15') throw new Error(`Font size control did not update: ${fontSizeValue}`);
    const themeText = await page.locator('[data-file-online-editor-theme-entry]').textContent();
    if (!themeText?.includes('主题')) throw new Error(`Theme entry missing: ${themeText}`);

    await replaceActiveEditorContentAndWaitDirty(page, 'second online editor smoke saved\n');

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });

    await page.locator('[data-file-online-editor-save-current]').click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });
    const saved = await readFile(rootId, secondPath);
    if (saved.content !== 'second online editor smoke saved\n') {
      throw new Error(`Saved content mismatch: ${JSON.stringify(saved.content)}`);
    }

    await page.locator(`[data-file-online-editor-tab="${cssAttr(`${rootId}:${firstPath}`)}"]`).click();
    await page.waitForFunction((path) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(path), firstPath, { timeout: 30_000 });
    await replaceActiveEditorContentAndWaitDirty(page, 'first dirty close check\n');
    page.once('dialog', async (dialog) => {
      if (!dialog.message().includes('未保存')) throw new Error(`Unexpected discard dialog: ${dialog.message()}`);
      await dialog.dismiss();
    });
    await page.getByLabel(`关闭 ${titleForPath(firstPath)}`).click();
    if ((await tabs.count()) !== 2) throw new Error('Dirty tab close dismissal should keep both tabs');
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByLabel(`关闭 ${titleForPath(firstPath)}`).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-file-online-editor-tabs] [data-file-online-editor-tab]').length === 1, null, { timeout: 30_000 });

    await replaceActiveEditorContentAndWaitDirty(page, 'second save all check\n');
    await page.locator('[data-file-online-editor-save-all]').click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });
    const saveAllResult = await readFile(rootId, secondPath);
    if (saveAllResult.content !== 'second save all check\n') {
      throw new Error(`Save all content mismatch: ${JSON.stringify(saveAllResult.content)}`);
    }

    await replaceActiveEditorContentAndWaitDirty(page, 'second close all dirty check\n');
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    page.once('dialog', async (dialog) => {
      if (!dialog.message().includes('未保存')) throw new Error(`Unexpected close-all dialog: ${dialog.message()}`);
      await dialog.dismiss();
    });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    await createTextFile(rootId, largePath, 'x'.repeat(1024 * 1024 + 32));
    await refreshFileList(page);
    await openFile(page, largePath);
    await page.waitForSelector('[data-file-online-editor-readonly-state]', { timeout: 30_000 });
    const readOnlyText = await page.locator('[data-file-online-editor-readonly-state]').textContent();
    if (!readOnlyText?.includes('截断')) throw new Error(`Large file did not show truncated readonly state: ${readOnlyText}`);
    await page.waitForSelector('[data-file-online-editor-truncated-state]', { timeout: 30_000 });
    if (await page.locator('[data-file-online-editor-save-current]').isEnabled()) {
      throw new Error('Save should be disabled for large/truncated readonly file');
    }
    if (await page.locator('[data-file-online-editor-replace]').isEnabled()) {
      throw new Error('Replace should be disabled for readonly file');
    }
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    await createTextFile(rootId, missingPath, 'missing online editor smoke\n');
    await refreshFileList(page);
    await page.locator(`[data-file-manager-entry-path="${cssAttr(missingPath)}"]`).first().waitFor({ timeout: 60_000 });
    await cleanup(rootId, [missingPath]);
    await openFile(page, missingPath, { expectEditor: false });
    await page.waitForSelector('[data-file-online-editor-missing-state]', { timeout: 30_000 });
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    await createTextFile(rootId, saveFailPath, 'save failure original\n');
    await refreshFileList(page);
    await openFile(page, saveFailPath);
    await page.waitForFunction((path) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(path), saveFailPath, { timeout: 30_000 });
    await replaceActiveEditorContentAndWaitDirty(page, 'save failure dirty buffer\n');
    await cleanup(rootId, [saveFailPath]);
    await page.locator('[data-file-online-editor-save-current]').click();
    await page.waitForSelector('[data-file-online-editor-save-error]', { timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });
    page.once('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    for (let index = 0; index < capacityPaths.length; index += 1) {
      await createTextFile(rootId, capacityPaths[index], `capacity file ${index + 1}\n`);
    }
    await refreshFileList(page);
    for (let index = 0; index < 8; index += 1) {
      await openFile(page, capacityPaths[index]);
      await replaceActiveEditorContentAndWaitDirty(page, `capacity dirty ${index + 1}\n`);
      await page.getByRole('button', { name: '最小化在线编辑器' }).click();
      await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    }
    const blockedRow = page.locator(`[data-file-manager-entry-path="${cssAttr(capacityPaths[8])}"]`).first();
    await blockedRow.waitFor({ timeout: 60_000 });
    await blockedRow.scrollIntoViewIfNeeded();
    await blockedRow.dblclick({ force: true });
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    const blockedDialogCount = await page.locator('[data-file-online-editor-dialog]').count();
    if (blockedDialogCount !== 0) throw new Error('Dirty capacity guard should not open a ninth editor dialog');
    const capacityDockText = await page.locator('[data-file-online-editor-minimized-dock]').textContent();
    if (!capacityDockText?.includes('8 个标签')) {
      throw new Error(`Dirty capacity guard should keep the existing 8 tabs: ${capacityDockText}`);
    }
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    const capacityTabCount = await page.locator('[data-file-online-editor-tabs] [data-file-online-editor-tab]').count();
    if (capacityTabCount !== 8) throw new Error(`Expected 8 guarded dirty tabs, found ${capacityTabCount}`);
    page.once('dialog', async (dialog) => {
      if (!dialog.message().includes('未保存')) throw new Error(`Unexpected capacity close-all dialog: ${dialog.message()}`);
      await dialog.accept();
    });
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Invalid hook call'))) {
      throw new Error(`Online editor smoke emitted fatal logs:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, cleanupPaths);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
