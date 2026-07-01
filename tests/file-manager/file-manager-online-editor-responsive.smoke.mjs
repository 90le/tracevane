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

async function cleanup(rootId, path) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [path], permanent: true }),
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

async function createTextFile(rootId, filePath, content) {
  const directoryPath = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
  const name = filePath.includes('/') ? filePath.slice(filePath.lastIndexOf('/') + 1) : filePath;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content }),
  });
}

async function openEditor(page, rootId, directoryPath, filePath) {
  await page.addInitScript(({ initialRootId, initialDirectoryPath }) => {
    window.localStorage.setItem('tracevane:file-manager:session-state:v1', JSON.stringify({
      rootId: initialRootId,
      directoryPath: initialDirectoryPath,
      activeDirectoryTabId: `${initialRootId}:${initialDirectoryPath}`,
      viewMode: 'files',
      showHidden: false,
    }));
    window.localStorage.setItem('tracevane:file-manager:directory-tabs:v2', JSON.stringify([{
      id: `${initialRootId}:${initialDirectoryPath}`,
      rootId: initialRootId,
      directoryPath: initialDirectoryPath,
      label: initialDirectoryPath.split('/').pop() || initialDirectoryPath,
    }]));
  }, { initialRootId: rootId, initialDirectoryPath: directoryPath });
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(filePath)}"]`).first();
  await page.waitForFunction(
    (targetPath) =>
      [...document.querySelectorAll("[data-file-manager-entry-path]")].some(
        (node) => node.getAttribute("data-file-manager-entry-path") === targetPath,
      ),
    filePath,
    { timeout: 60_000 },
  );
  await row.evaluate((node) => {
    node.scrollIntoView({ block: "center", inline: "nearest" });
    node.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-online-editor-action-menu-trigger]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-online-editor-statusbar]', { timeout: 30_000 });
}

async function verifyEditorSurface(page, filePath, expectedTheme) {
  await page.locator('[data-file-online-editor-action-menu-trigger]').click();
  await page.waitForSelector('[data-file-online-editor-action-menu]', { timeout: 30_000 });
  const state = await page.evaluate(() => {
    const dialog = document.querySelector('[data-file-online-editor-dialog]')?.getBoundingClientRect();
    const editor = document.querySelector('[data-code-editor="monaco-direct"]')?.getBoundingClientRect();
    const statusbar = document.querySelector('[data-file-online-editor-statusbar]')?.textContent || '';
    const themeEntry = document.querySelector('[data-file-online-editor-action-menu] [data-file-online-editor-theme-mode-select]')?.textContent || '';
    const monaco = document.querySelector('.monaco-editor');
    return {
      dialog: dialog ? { width: dialog.width, height: dialog.height } : null,
      editor: editor ? { width: editor.width, height: editor.height } : null,
      statusbar,
      themeEntry,
      monacoClass: monaco?.className || '',
      body: document.body.innerText.slice(0, 1200),
    };
  });
  if (!state.dialog || state.dialog.width < 300 || state.dialog.height < 400) {
    throw new Error(`Online editor dialog has invalid ${expectedTheme} dimensions: ${JSON.stringify(state)}`);
  }
  if (!state.editor || state.editor.width < 260 || state.editor.height < 180) {
    throw new Error(`Online editor Monaco has invalid ${expectedTheme} dimensions: ${JSON.stringify(state)}`);
  }
  if (!state.statusbar.includes(filePath)) throw new Error(`Status bar missing file path in ${expectedTheme}: ${JSON.stringify(state)}`);
  if (!state.themeEntry.includes('跟随系统')) throw new Error(`Theme selector missing in ${expectedTheme}: ${JSON.stringify(state)}`);
  await page.mouse.click(8, 8);
  await page.waitForSelector('[data-file-online-editor-action-menu]', { state: 'detached', timeout: 10_000 });
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const workspacePath = `tmp/tracevane-online-editor-responsive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `${workspacePath}/responsive.txt`;
  await cleanup(rootId, workspacePath);
  await createDirectory(rootId, workspacePath);
  await createTextFile(rootId, filePath, 'responsive online editor smoke\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const logs = [];
  try {
    const light = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
    light.on('console', (msg) => logs.push(`[light:${msg.type()}] ${msg.text()}`));
    light.on('pageerror', (error) => logs.push(`[light:pageerror] ${error.stack || error.message}`));
    await openEditor(light, rootId, workspacePath, filePath);
    await verifyEditorSurface(light, filePath, 'light/mobile');
    await light.close();

    const dark = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
    dark.on('console', (msg) => logs.push(`[dark:${msg.type()}] ${msg.text()}`));
    dark.on('pageerror', (error) => logs.push(`[dark:pageerror] ${error.stack || error.message}`));
    await openEditor(dark, rootId, workspacePath, filePath);
    await verifyEditorSurface(dark, filePath, 'dark/desktop');
    await dark.close();

    if (logs.some((line) => line.includes('[light:pageerror]') || line.includes('[dark:pageerror]') || line.includes('Invalid hook call'))) {
      throw new Error(`Responsive online editor smoke emitted fatal logs:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, workspacePath);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
