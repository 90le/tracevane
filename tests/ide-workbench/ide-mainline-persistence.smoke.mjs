import { chromium } from '@playwright/test';
import path from 'node:path';

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

async function apiOrNull(pathname, options = {}) {
  try { return await api(pathname, options); } catch { return null; }
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeSelector(targetPath) {
  return `[data-ide-explorer-node-path="${cssAttr(targetPath)}"]`;
}

function tabSelector(targetPath) {
  return `[data-ide-editor-tab-path="${cssAttr(targetPath)}"]`;
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom',
      visible: true,
      collapsed: false,
      size: 220,
      bottomSize: 220,
      rightWidth: 420,
      maximized: false,
      activePanelId: 'terminal',
    },
    viewPlacements: [
      { viewId: 'explorer', placement: 'primary-sidebar', order: 0, visible: true },
      { viewId: 'terminal', placement: 'panel', order: 0, visible: true },
      { viewId: 'problems', placement: 'panel', order: 1, visible: true },
      { viewId: 'output', placement: 'panel', order: 2, visible: true },
      { viewId: 'debugConsole', placement: 'panel', order: 3, visible: true },
    ],
    editorGroups: [{ id: 'main', activeTabId: null, tabs: [] }],
    activeEditorGroupId: 'main',
    dockviewLayout: null,
  };
}

async function createDirectory(rootId, targetPath) {
  const directoryPath = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
  const name = targetPath.includes('/') ? targetPath.slice(targetPath.lastIndexOf('/') + 1) : targetPath;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function ensureDirectory(rootId, targetPath) {
  const normalized = normalizePortablePath(targetPath);
  if (!normalized) return;
  const exists = await apiOrNull(`/api/files/browse?${new URLSearchParams({ rootId, path: normalized, hidden: 'true' }).toString()}`);
  if (exists) return;
  const parent = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
  await ensureDirectory(rootId, parent);
  await createDirectory(rootId, normalized).catch((error) => {
    if (String(error?.message || error).toLowerCase().includes('exists')) return;
    throw error;
  });
}

async function createFile(rootId, targetPath, content = '') {
  const directoryPath = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
  const name = targetPath.includes('/') ? targetPath.slice(targetPath.lastIndexOf('/') + 1) : targetPath;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content, overwrite: true }),
  });
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
  const trash = await apiOrNull(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => paths.some((itemPath) => item.originalPath === itemPath || String(item.originalPath || '').startsWith(`${itemPath}/`)))
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, trashPaths }),
    }).catch(() => undefined);
  }
}

async function resetTerminalSessions() {
  const data = await apiOrNull('/api/terminal/sessions');
  await Promise.allSettled((data?.sessions ?? []).map((session) => api('/api/terminal/session/end', {
    method: 'POST',
    body: JSON.stringify({ sid: session.sessionId }),
  })));
}

async function waitForNode(page, targetPath) {
  await page.locator(nodeSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expandDirectory(page, targetPath) {
  await waitForNode(page, targetPath);
  const row = page.locator(nodeSelector(targetPath)).first();
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    nodeSelector(targetPath),
    { timeout: 30_000 },
  );
}

async function revealPath(page, targetPath, basePath = '') {
  const parts = normalizePortablePath(targetPath).split('/').filter(Boolean);
  const baseParts = normalizePortablePath(basePath).split('/').filter(Boolean);
  const baseMatches = baseParts.length > 0 && baseParts.every((part, index) => parts[index] === part);
  const startIndex = baseMatches ? baseParts.length + 1 : 1;
  for (let index = startIndex; index < parts.length; index += 1) {
    await expandDirectory(page, parts.slice(0, index).join('/'));
  }
  await waitForNode(page, targetPath);
}

async function openContextMenu(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.max(12, rect.left + 12),
      clientY: Math.max(12, rect.top + 12),
    }));
  });
  await page.getByRole('menu').waitFor({ state: 'visible', timeout: 10_000 });
}

async function enterExplorerDirectory(page, targetPath, basePath = '') {
  await openContextMenu(page, targetPath, basePath);
  await page.getByRole('menuitem', { name: '进入目录' }).click();
  await page.waitForFunction(
    (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
    targetPath,
    { timeout: 30_000 },
  );
}

async function openFileFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().click();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(targetPath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function focusMonaco(page, targetPath) {
  const panel = page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(targetPath)}"]`).first();
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  const viewLines = panel.locator('.monaco-editor .view-lines').first();
  await viewLines.waitFor({ state: 'visible', timeout: 30_000 });
  await viewLines.click({ position: { x: 24, y: 12 } });
}

async function replaceEditorContent(page, targetPath, content) {
  await focusMonaco(page, targetPath);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
}

async function waitForTabDirty(page, targetPath, dirty) {
  await page.waitForFunction(
    ({ selector, dirty }) => document.querySelector(selector)?.getAttribute('data-ide-editor-tab-dirty') === (dirty ? 'true' : 'false'),
    { selector: tabSelector(targetPath), dirty },
    { timeout: 30_000 },
  );
}

async function waitForTerminalCounts(page, { tabs, panes }) {
  await page.waitForFunction(
    ({ tabs, panes }) => {
      const layout = document.querySelector('[data-ide-terminal-layout]');
      return Number(layout?.getAttribute('data-terminal-tab-count') || '0') === tabs
        && Number(layout?.getAttribute('data-terminal-pane-count') || '0') === panes;
    },
    { tabs, panes },
    { timeout: 45_000 },
  );
}

async function waitForRunnablePane(page) {
  await page.locator('[data-ide-terminal-pane]').first().waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction(() => {
    const text = document.querySelector('[data-ide-terminal-pane]')?.textContent || '';
    return text.includes('running') || text.includes('error') || text.includes('终端不可用');
  }, null, { timeout: 45_000 });
  const text = await page.locator('[data-ide-terminal-pane]').first().innerText();
  if (text.includes('error') || text.includes('终端不可用')) throw new Error(`Terminal pane failed: ${text}`);
}

async function waitForServerLayout(rootId, predicate, label) {
  const deadline = Date.now() + 15_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await apiOrNull(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`);
    if (last && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for server layout ${label}; last=${JSON.stringify(last)?.slice(0, 2400)}`);
}

function hasEditorTab(record, targetPath, { dirty } = {}) {
  const tabs = record?.layout?.editorGroups?.flatMap?.((group) => group.tabs || []) ?? [];
  return tabs.some((tab) => tab?.ref?.path === targetPath && (dirty == null || Boolean(tab.dirty) === dirty));
}

function terminalLayoutHasOnePane(record, key) {
  const layout = record?.terminalLayouts?.[key];
  const activeTab = layout?.tabs?.find?.((tab) => tab.tabId === layout.activeTabId) ?? layout?.tabs?.[0];
  return Array.isArray(layout?.tabs) && layout.tabs.length === 1 && activeTab && Object.keys(activeTab.panes || {}).length === 1;
}

async function newCleanPage(browser, logs, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.layout.') || key.startsWith('tracevane.ide-workbench.terminal')) {
        localStorage.removeItem(key);
      }
    }
  });
  const page = await context.newPage();
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  return { context, page };
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE mainline persistence smoke');

  const explorerDirectoryPath = '';
  const prefix = `tracevane-ide-mainline-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const filePath = `${smokeDir}/persisted-open-tab.ts`;
  const dirtyContent = `export const persistedDirty = "${prefix}";\n`;
  const cleanupPaths = [smokeDir];
  const terminalLayoutKey = `${rootId}:${smokeDir}`;

  await resetTerminalSessions();
  await cleanup(rootId, cleanupPaths);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, filePath, 'export const initial = 1;\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const logs = [];
  let context;
  let page;
  let terminalId = null;

  try {
    ({ context, page } = await newCleanPage(browser, logs));
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await enterExplorerDirectory(page, smokeDir, explorerDirectoryPath);
    await openFileFromExplorer(page, filePath, smokeDir);
    await replaceEditorContent(page, filePath, dirtyContent);
    await waitForTabDirty(page, filePath, true);

    if ((await page.locator('[data-ide-panel-placement="right"]').count()) === 0) {
      await page.getByRole('button', { name: 'Move Panel Right' }).click();
    }
    await page.locator('[data-ide-panel][data-ide-panel-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-new]').click();
    await waitForTerminalCounts(page, { tabs: 1, panes: 1 });
    await waitForRunnablePane(page);
    terminalId = await page.locator('[data-active-terminal-pane="true"]').getAttribute('data-terminal-id');
    if (!terminalId) throw new Error('Missing active terminal id before reload');

    await waitForServerLayout(
      rootId,
      (record) => record.layout?.panel?.placement === 'right'
        && record.layout?.explorer?.directoryPath === smokeDir
        && hasEditorTab(record, filePath, { dirty: true })
        && terminalLayoutHasOnePane(record, terminalLayoutKey),
      'right placement + explorer directory + dirty editor tab + terminal descriptor',
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel][data-ide-panel-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForTabDirty(page, filePath, true);
    await waitForTerminalCounts(page, { tabs: 1, panes: 1 });
    await page.waitForFunction(
      (expectedTerminalId) => document.querySelector('[data-active-terminal-pane="true"]')?.getAttribute('data-terminal-id') === expectedTerminalId,
      terminalId,
      { timeout: 45_000 },
    );

    await page.getByRole('button', { name: '重置布局' }).click();
    await page.locator('[data-ide-panel][data-ide-panel-placement="bottom"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForTabDirty(page, filePath, true);
    await waitForTerminalCounts(page, { tabs: 1, panes: 1 });
    await page.waitForFunction(
      (expectedTerminalId) => document.querySelector('[data-active-terminal-pane="true"]')?.getAttribute('data-terminal-id') === expectedTerminalId,
      terminalId,
      { timeout: 45_000 },
    );

    await context.close();
    ({ context, page } = await newCleanPage(browser, logs));
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForTabDirty(page, filePath, true);
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await waitForTerminalCounts(page, { tabs: 1, panes: 1 });
  } catch (error) {
    const state = page ? await page.evaluate(() => ({
      url: location.href,
      explorerPath: document.querySelector('[data-ide-explorer-path]')?.textContent,
      tabs: [...document.querySelectorAll('[data-ide-editor-tab-path]')].map((node) => ({
        path: node.getAttribute('data-ide-editor-tab-path'),
        dirty: node.getAttribute('data-ide-editor-tab-dirty'),
        text: node.textContent,
      })),
      panel: document.querySelector('[data-ide-panel]')?.outerHTML?.slice(0, 1000),
      terminal: document.querySelector('[data-ide-terminal-layout]')?.outerHTML?.slice(0, 1400),
      body: document.body.innerText.slice(0, 2200),
    })).catch(() => ({})) : {};
    throw new Error(`${error instanceof Error ? error.stack || error.message : String(error)}\nState: ${JSON.stringify(state, null, 2)}\nLogs:\n${logs.slice(-160).join('\n')}`);
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    if (terminalId) {
      await api('/api/terminal/session/end', {
        method: 'POST',
        body: JSON.stringify({ sid: terminalId }),
      }).catch(() => undefined);
    }
    await cleanup(rootId, cleanupPaths);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
