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

async function apiRaw(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    data: text ? JSON.parse(text) : null,
    text,
  };
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

async function createDirectory(rootId, path) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function writeTextFile(rootId, path, content, extra = {}) {
  return api('/api/files/content', {
    method: 'PUT',
    body: JSON.stringify({ rootId, path, content, ...extra }),
  });
}

async function assertStaleWriteRejected(rootId, path) {
  await createTextFile(rootId, path, 'api conflict original\n');
  const initial = await readFile(rootId, path);
  await writeTextFile(rootId, path, 'api conflict external update\n');
  const staleWrite = await apiRaw('/api/files/content', {
    method: 'PUT',
    body: JSON.stringify({
      rootId,
      path,
      content: 'api conflict stale local draft\n',
      expectedModifiedAt: initial.modifiedAt,
      expectedSize: initial.size,
    }),
  });
  if (staleWrite.status !== 409 || staleWrite.data?.code !== 'file_write_conflict') {
    throw new Error(`Expected stale write to return file_write_conflict 409, got ${staleWrite.status}: ${staleWrite.text}`);
  }
  const disk = await readFile(rootId, path);
  if (disk.content !== 'api conflict external update\n') {
    throw new Error(`Stale write changed disk content unexpectedly: ${JSON.stringify(disk.content)}`);
  }
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
  const filterInput = page.locator('input[placeholder="搜索当前目录"]:visible').first();
  if (await filterInput.count()) {
    await filterInput.fill(titleForPath(path));
  }
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"]`).first();
  await page.waitForFunction(
    (targetPath) =>
      [...document.querySelectorAll("[data-file-manager-entry-path]")].some(
        (node) => node.getAttribute("data-file-manager-entry-path") === targetPath,
      ),
    path,
    { timeout: 60_000 },
  );
  await row.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
  if (expectEditor) {
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
  }
}

async function openFileFromContextMenu(page, path) {
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(path)}"]`).first();
  await page.waitForFunction(
    (targetPath) =>
      [...document.querySelectorAll("[data-file-manager-entry-path]")].some(
        (node) => node.getAttribute("data-file-manager-entry-path") === targetPath,
      ),
    path,
    { timeout: 60_000 },
  );
  await row.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 320, clientY: 220 }));
  });
  await page.getByRole('menuitem', { name: '编辑' }).click();
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
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

async function openEditorActionMenu(page) {
  if (await page.locator('[data-file-online-editor-action-menu]').isVisible().catch(() => false)) return;
  await page.waitForSelector('[data-file-online-editor-panel], [data-file-surface-panel]', { timeout: 30_000 });
  await page.locator('[data-file-online-editor-action-menu-trigger]').click();
  await page.waitForSelector('[data-file-online-editor-action-menu]', { timeout: 10_000 });
}

async function clickEditorAction(page, selector) {
  await openEditorActionMenu(page);
  await page.locator(`[data-file-online-editor-action-menu] ${selector}`).click();
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const prefix = `tracevane-online-editor-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const workspacePath = `tmp/${prefix}`;
  const firstPath = `${workspacePath}/a.txt`;
  const secondPath = `${workspacePath}/b.txt`;
  const largePath = `${workspacePath}/large.txt`;
  const missingPath = `${workspacePath}/missing.txt`;
  const saveFailPath = `${workspacePath}/save-fail.txt`;
  const conflictPath = `${workspacePath}/conflict.txt`;
  const apiConflictPath = `${workspacePath}/api-conflict.txt`;
  const capacityPaths = Array.from({ length: 16 }, (_, index) => `${workspacePath}/capacity-${index + 1}.txt`);
  const cleanupPaths = [workspacePath];
  await cleanup(rootId, cleanupPaths);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, firstPath, 'first online editor smoke\n');
  await createTextFile(rootId, secondPath, 'second online editor smoke\n');
  await assertStaleWriteRejected(rootId, apiConflictPath);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);
    await page.locator(`[data-file-manager-entry-path="${cssAttr(firstPath)}"] [data-file-manager-row-edit]`).click({ force: true });
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await openFileFromContextMenu(page, secondPath);

    const tabs = page.locator('[data-file-online-editor-tabs] [data-file-online-editor-tab]');
    await tabs.nth(1).waitFor({ timeout: 30_000 });
    const tabCount = await tabs.count();
    if (tabCount !== 2) throw new Error(`Expected two online editor tabs, found ${tabCount}`);
    await page.locator('[data-file-online-editor-action-menu-trigger]').click();
    await page.waitForSelector('[data-file-online-editor-action-menu]', { timeout: 10_000 });
    await page.locator('[data-file-online-editor-action-menu-trigger]').click();
    await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
    await tabs.nth(1).click({ button: 'right' });
    await page.waitForSelector('[data-file-online-editor-tab-menu]', { timeout: 10_000 });
    await page.waitForSelector('[data-file-online-editor-tab-menu] [data-file-online-editor-copy-path]', { timeout: 10_000 });
    await page.waitForSelector('[data-file-online-editor-tab-menu] [data-file-online-editor-copy-relative-path]', { timeout: 10_000 });
    await page.mouse.click(8, 8);
    await page.waitForSelector('[data-file-online-editor-tab-menu]', { state: 'detached', timeout: 10_000 });

    await page.locator('[data-file-online-editor-toggle-maximize]').click();
    await page.waitForSelector('[data-file-online-editor-dialog][data-file-online-editor-window-mode="maximized"]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-toggle-maximize]').click();
    await page.waitForSelector('[data-file-online-editor-dialog][data-file-online-editor-window-mode="normal"]', { timeout: 30_000 });

    await clickEditorAction(page, '[data-file-online-editor-close-others]');
    await page.waitForFunction(() => document.querySelectorAll('[data-file-online-editor-tabs] [data-file-online-editor-tab]').length === 1, null, { timeout: 30_000 });

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await openFile(page, firstPath);
    const tabCountAfterReopen = await tabs.count();
    if (tabCountAfterReopen !== 2) {
      throw new Error(`Reopening a closed tab should add it back, found ${tabCountAfterReopen}`);
    }

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
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

    await clickEditorAction(page, '[data-file-online-editor-find]');
    await page.locator('.monaco-editor .find-widget').first().waitFor({ state: 'visible', timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-replace]');
    await page.locator('.monaco-editor .find-widget .replace-part').first().waitFor({ state: 'visible', timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-command-palette]');
    await page.locator('.quick-input-widget').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.keyboard.press('Escape');
    await openEditorActionMenu(page);
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-goto-input]').fill('1:2');
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-goto]').click();
    await page.waitForFunction(() => document.querySelector('[data-file-online-editor-cursor-position]')?.textContent?.includes('Ln 1'), null, { timeout: 30_000 });
    await openEditorActionMenu(page);
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-font-size]').fill('15');
    const fontSizeValue = await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-font-size]').inputValue();
    if (fontSizeValue !== '15') throw new Error(`Font size control did not update: ${fontSizeValue}`);
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-theme-mode-select]').selectOption('dark');
    const themeModeValue = await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-theme-mode-select]').inputValue();
    if (themeModeValue !== 'dark') throw new Error(`Theme mode control did not update: ${themeModeValue}`);
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-word-wrap-select]').selectOption('off');
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-minimap-enabled]').check();
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-sticky-scroll-enabled]').uncheck();
    await page.mouse.click(8, 8);
    await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
    await page.waitForSelector('[data-code-editor-word-wrap="off"]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor-minimap="enabled"]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor-sticky-scroll="disabled"]', { timeout: 30_000 });
    const editorPreferences = await page.evaluate(() => window.localStorage.getItem('tracevane:file-manager:online-editor-preferences:v1'));
    if (
      !editorPreferences?.includes('"fontSize":15') ||
      !editorPreferences.includes('"themeMode":"dark"') ||
      !editorPreferences.includes('"wordWrap":"off"') ||
      !editorPreferences.includes('"minimapEnabled":true') ||
      !editorPreferences.includes('"stickyScrollEnabled":false')
    ) {
      throw new Error(`Editor preferences were not persisted: ${editorPreferences}`);
    }
    await openEditorActionMenu(page);
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-theme-mode-select]').selectOption('auto');
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-word-wrap-select]').selectOption('on');
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-minimap-enabled]').uncheck();
    await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-sticky-scroll-enabled]').check();
    await page.mouse.click(8, 8);
    await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
    const lineEndingText = await page.locator('[data-file-online-editor-status-line-ending]').textContent();
    if (lineEndingText !== 'LF') throw new Error(`Line ending metadata mismatch: ${lineEndingText}`);
    const indentationText = await page.locator('[data-file-online-editor-status-indentation]').textContent();
    if (!indentationText?.includes('Indent')) throw new Error(`Indentation metadata missing: ${indentationText}`);
    const encodingText = await page.locator('[data-file-online-editor-status-encoding]').textContent();
    if (encodingText !== 'UTF-8') throw new Error(`Encoding metadata mismatch: ${encodingText}`);
    const sizeText = await page.locator('[data-file-online-editor-status-size]').textContent();
    if (!sizeText?.includes('B')) throw new Error(`File size metadata missing: ${sizeText}`);
    const permissionsText = await page.locator('[data-file-online-editor-status-permissions]').textContent();
    if (!permissionsText?.includes('·')) throw new Error(`Permissions metadata missing: ${permissionsText}`);
    const modifiedText = await page.locator('[data-file-online-editor-status-modified]').textContent();
    if (!modifiedText || modifiedText.includes('—')) throw new Error(`Modified-time metadata missing: ${modifiedText}`);
    const readOnlyReasonText = await page.locator('[data-file-online-editor-status-readonly-reason]').textContent();
    if (readOnlyReasonText !== '可编辑') throw new Error(`Read-only reason mismatch: ${readOnlyReasonText}`);

    await replaceActiveEditorContentAndWaitDirty(page, 'second online editor smoke saved\n');

    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });

    await clickEditorAction(page, '[data-file-online-editor-save-current]');
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });
    const saved = await readFile(rootId, secondPath);
    if (saved.content !== 'second online editor smoke saved\n') {
      throw new Error(`Saved content mismatch: ${JSON.stringify(saved.content)}`);
    }

    await page.locator(`[data-file-online-editor-tab="${cssAttr(`${rootId}:${firstPath}`)}"]`).click();
    await page.waitForFunction((path) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(path), firstPath, { timeout: 30_000 });
    await replaceActiveEditorContentAndWaitDirty(page, 'first dirty reload check\n');
    await clickEditorAction(page, '[data-file-online-editor-reload-current]');
    await page.waitForSelector('[data-file-online-editor-reload-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-reload-confirm-cancel]').click();
    await page.waitForSelector('[data-file-online-editor-reload-confirm]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-reload-current]');
    await page.waitForSelector('[data-file-online-editor-reload-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-reload-confirm-discard]').click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });

    await replaceActiveEditorContentAndWaitDirty(page, 'first dirty close check\n');
    await page.getByLabel(`关闭 ${titleForPath(firstPath)}`).click();
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-close-confirm-cancel]').click();
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { state: 'detached', timeout: 30_000 });
    if ((await tabs.count()) !== 2) throw new Error('Dirty tab close cancellation should keep both tabs');
    await page.getByLabel(`关闭 ${titleForPath(firstPath)}`).click();
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-close-confirm-discard]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-file-online-editor-tabs] [data-file-online-editor-tab]').length === 1, null, { timeout: 30_000 });
    await page.waitForFunction((path) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(path), secondPath, { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });

    await replaceActiveEditorContentAndWaitDirty(page, 'second save all check\n');
    await clickEditorAction(page, '[data-file-online-editor-save-all]');
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });
    const saveAllResult = await readFile(rootId, secondPath);
    if (saveAllResult.content !== 'second save all check\n') {
      throw new Error(`Save all content mismatch: ${JSON.stringify(saveAllResult.content)}`);
    }

    await replaceActiveEditorContentAndWaitDirty(page, 'second close all dirty check\n');
    await clickEditorAction(page, '[data-file-online-editor-close-all]');
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-close-confirm-cancel]').click();
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { state: 'detached', timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-close-all]');
    await page.waitForSelector('[data-file-online-editor-close-confirm]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-close-confirm-save]').click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
    const closeAllSaveResult = await readFile(rootId, secondPath);
    if (closeAllSaveResult.content !== 'second close all dirty check\n') {
      throw new Error(`Close-all save content mismatch: ${JSON.stringify(closeAllSaveResult.content)}`);
    }

    await page.locator(`[data-file-manager-entry-path="${cssAttr(firstPath)}"] input[type="checkbox"]`).click({ force: true });
    await page.locator('[data-file-manager-bulk-primary-action="edit"]').click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-close-all]');
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });

    await page.locator(`[data-file-manager-entry-path="${cssAttr(secondPath)}"]`).click({ force: true });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await clickEditorAction(page, '[data-file-online-editor-close-all]');
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });

    await createTextFile(rootId, largePath, 'x'.repeat(1024 * 1024 + 32));
    await refreshFileList(page);
    await openFile(page, largePath);
    await page.waitForSelector('[data-file-online-editor-readonly-state]', { timeout: 30_000 });
    const readOnlyText = await page.locator('[data-file-online-editor-readonly-state]').textContent();
    if (!readOnlyText?.includes('截断')) throw new Error(`Large file did not show truncated readonly state: ${readOnlyText}`);
    await page.waitForSelector('[data-file-online-editor-truncated-state]', { timeout: 30_000 });
    await openEditorActionMenu(page);
    if (await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-save-current]').isEnabled()) {
      throw new Error('Save should be disabled for large/truncated readonly file');
    }
    if (await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-replace]').isEnabled()) {
      throw new Error('Replace should be disabled for readonly file');
    }
    await page.mouse.click(8, 8);
    await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
    await page.waitForSelector('[data-code-editor-minimap="disabled"]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor-sticky-scroll="disabled"]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor-word-wrap="off"]', { timeout: 30_000 });
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

    await createTextFile(rootId, conflictPath, 'conflict original\n');
    await refreshFileList(page);
    await openFile(page, conflictPath);
    await page.waitForFunction((path) => document.querySelector('[data-file-online-editor-statusbar]')?.textContent?.includes(path), conflictPath, { timeout: 30_000 });
    await replaceActiveEditorContentAndWaitDirty(page, 'local conflict draft\n');
    await writeTextFile(rootId, conflictPath, 'external conflict update\n');
    await clickEditorAction(page, '[data-file-online-editor-save-current]');
    await page.waitForSelector('[data-file-online-editor-conflict-panel]', { timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-dirty-state="dirty"]', { timeout: 30_000 });
    await page.locator('[data-file-online-editor-conflict-compare]').click();
    await page.waitForSelector('[data-file-online-editor-conflict-compare-panel]', { timeout: 30_000 });
    const localConflictContent = await page.locator('[data-file-online-editor-conflict-local-content]').textContent();
    const diskConflictContent = await page.locator('[data-file-online-editor-conflict-disk-content]').textContent();
    if (!localConflictContent?.includes('local conflict draft') || !diskConflictContent?.includes('external conflict update')) {
      throw new Error(`Conflict compare content mismatch: local=${JSON.stringify(localConflictContent)} disk=${JSON.stringify(diskConflictContent)}`);
    }
    await page.locator('[data-file-online-editor-conflict-overwrite]').click();
    await page.waitForSelector('[data-file-online-editor-dirty-state="clean"]', { timeout: 30_000 });
    const conflictOverwriteResult = await readFile(rootId, conflictPath);
    if (conflictOverwriteResult.content !== 'local conflict draft\n') {
      throw new Error(`Conflict overwrite content mismatch: ${JSON.stringify(conflictOverwriteResult.content)}`);
    }
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
    await clickEditorAction(page, '[data-file-online-editor-save-current]');
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
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);
    for (let index = 0; index < capacityPaths.length; index += 1) {
      await openFile(page, capacityPaths[index]);
      await page.getByRole('button', { name: '最小化在线编辑器' }).click();
      await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    }
    const capacityDockText = await page.locator('[data-file-online-editor-minimized-dock]').textContent();
    if (!capacityDockText?.includes(`${capacityPaths.length} 个标签`)) {
      throw new Error(`Online editor should keep all opened tabs in the minimized dock: ${capacityDockText}`);
    }
    await page.getByRole('button', { name: '恢复', exact: true }).click();
    await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
    const capacityTabCount = await page.locator('[data-file-online-editor-tabs] [data-file-online-editor-tab]').count();
    if (capacityTabCount !== capacityPaths.length) throw new Error(`Expected ${capacityPaths.length} scrollable tabs, found ${capacityTabCount}`);
    const tabStripMetrics = await page.locator('[data-file-online-editor-tabs]').evaluate((node) => ({
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }));
    if (tabStripMetrics.scrollWidth <= tabStripMetrics.clientWidth) {
      throw new Error(`Tab strip should overflow horizontally after many tabs: ${JSON.stringify(tabStripMetrics)}`);
    }
    await page.getByRole('button', { name: '最小化在线编辑器' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { timeout: 30_000 });
    await page.getByRole('button', { name: '关闭全部' }).click();
    await page.waitForSelector('[data-file-online-editor-minimized-dock]', { state: 'detached', timeout: 30_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);
    await openFile(page, firstPath);
    await openEditorActionMenu(page);
    if ((await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-theme-mode-select]').inputValue()) !== 'auto') {
      throw new Error('Theme preference did not survive page reload');
    }
    if ((await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-word-wrap-select]').inputValue()) !== 'on') {
      throw new Error('Word-wrap preference did not survive page reload');
    }
    if (await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-minimap-enabled]').isChecked()) {
      throw new Error('Minimap preference did not survive page reload');
    }
    if (!(await page.locator('[data-file-online-editor-action-menu] [data-file-online-editor-sticky-scroll-enabled]').isChecked())) {
      throw new Error('Sticky-scroll preference did not survive page reload');
    }
    await page.mouse.click(8, 8);
    await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
    await clickEditorAction(page, '[data-file-online-editor-close-all]');
    await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });

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
