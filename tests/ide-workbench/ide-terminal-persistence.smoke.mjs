import { spawnSync } from 'node:child_process';
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

async function resetTerminalSessions() {
  let sessions = [];
  try {
    const data = await api('/api/terminal/sessions');
    sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  } catch {
    return;
  }
  await Promise.allSettled(sessions.map((session) => api('/api/terminal/end', {
    method: 'POST',
    body: JSON.stringify({ sid: session.sessionId }),
  })));
}

async function apiOrNull(pathname, options = {}) {
  try {
    return await api(pathname, options);
  } catch {
    return null;
  }
}


function hasTmux() {
  return process.platform !== 'win32' && spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0;
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function nodeSelector(path) {
  return `[data-ide-explorer-node-path="${cssAttr(path)}"]`;
}

async function createDirectory(rootId, path) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
  const trash = await apiOrNull(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => paths.some((path) => item.originalPath === path || String(item.originalPath || '').startsWith(`${path}/`)))
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, trashPaths }),
    }).catch(() => undefined);
  }
}


function createDefaultWorkbenchLayout() {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath: '' },
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

async function endSession(sessionId) {
  await api('/api/terminal/session/end', {
    method: 'POST',
    body: JSON.stringify({ sid: sessionId }),
  }).catch(() => undefined);
}

async function waitForRunnablePane(page, index = 0) {
  const pane = page.locator('[data-ide-terminal-pane]').nth(index);
  await pane.waitFor({ state: 'visible', timeout: 45_000 });
  await page.waitForFunction(
    (paneIndex) => {
      const text = document.querySelectorAll('[data-ide-terminal-pane]')[paneIndex]?.textContent || '';
      return text.includes('running') || text.includes('error') || text.includes('终端不可用');
    },
    index,
    { timeout: 45_000 },
  );
  const text = await pane.innerText();
  if (text.includes('error') || text.includes('终端不可用')) throw new Error(`Terminal pane ${index} failed: ${text}`);
}

async function waitForCounts(page, { tabs, panes }) {
  await page.waitForFunction(
    ({ expectedTabs, expectedPanes }) => {
      const layout = document.querySelector('[data-ide-terminal-layout]');
      return Number(layout?.getAttribute('data-terminal-tab-count') || '0') === expectedTabs
        && Number(layout?.getAttribute('data-terminal-pane-count') || '0') === expectedPanes;
    },
    { expectedTabs: tabs, expectedPanes: panes },
    { timeout: 45_000 },
  );
}

async function echoToken(page, token) {
  await page.locator('[data-active-terminal-pane="true"] [data-ide-terminal-xterm]').click({ timeout: 30_000 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+U');
  await page.keyboard.type(`echo ${token}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (expectedToken) => (document.querySelector('[data-active-terminal-pane="true"]')?.textContent || '').includes(expectedToken),
    token,
    { timeout: 45_000 },
  );
}

async function activeTerminalId(page) {
  const id = await page.locator('[data-active-terminal-pane="true"]').getAttribute('data-terminal-id');
  if (!id) throw new Error('Missing active terminal id');
  return id;
}

async function waitForNode(page, path) {
  await page.locator(nodeSelector(path)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expandDirectory(page, path) {
  await waitForNode(page, path);
  const row = page.locator(nodeSelector(path)).first();
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    nodeSelector(path),
    { timeout: 30_000 },
  );
}

async function revealPath(page, path) {
  const parts = String(path).split('/').filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    await expandDirectory(page, parts.slice(0, index).join('/'));
  }
  await waitForNode(page, path);
}

async function openContextMenu(page, path) {
  await revealPath(page, path);
  await page.locator(nodeSelector(path)).first().evaluate((node) => {
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

async function enterExplorerDirectory(page, path) {
  await openContextMenu(page, path);
  await page.getByRole('menuitem', { name: '进入目录' }).click();
  await page.waitForFunction(
    (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
    path,
    { timeout: 30_000 },
  );
}

async function waitForServerLayout(rootId, predicate, label) {
  const deadline = Date.now() + 15_000;
  let last = null;
  while (Date.now() < deadline) {
    last = await apiOrNull(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`);
    if (last && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for server workbench layout: ${label}; last=${JSON.stringify(last)?.slice(0, 2200)}`);
}

function terminalLayoutHas(record, key, { tabs, panes }) {
  const layout = record?.terminalLayouts?.[key];
  const activeTab = layout?.tabs?.find?.((tab) => tab.tabId === layout.activeTabId) ?? layout?.tabs?.[0];
  return Array.isArray(layout?.tabs)
    && layout.tabs.length === tabs
    && activeTab
    && Object.keys(activeTab.panes || {}).length === panes;
}

async function newCleanPage(browser, logs, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.layout.') || key.startsWith('tracevane.ide-workbench.terminal-layout.')) {
        localStorage.removeItem(key);
      }
    }
  });
  const page = await context.newPage();
  page.on('console', (msg) => logs.push(`[clean:${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[clean:pageerror] ${error.stack || error.message}`));
  return { context, page };
}

async function splitActiveTerminalTab(page, direction) {
  const tabId = await page.locator('[data-ide-terminal-layout]').getAttribute('data-terminal-active-tab-id');
  if (!tabId) throw new Error('No active terminal tab id');
  const menu = page.locator(`[data-ide-terminal-tab-menu][data-terminal-tab-id="${tabId}"]`);
  await menu.waitFor({ state: 'visible', timeout: 30_000 });
  await menu.click();
  await page.locator('[data-ide-terminal-tab-context-menu]').waitFor({ state: 'visible', timeout: 30_000 });
  const item = direction === 'right'
    ? page.locator('[data-ide-terminal-tab-menu-item="split-right"]')
    : page.locator('[data-ide-terminal-tab-menu-item="split-down"]');
  await item.waitFor({ state: 'visible', timeout: 30_000 });
  await item.click({ force: true });
}


async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file root is available for IDE terminal persistence smoke');
  await resetTerminalSessions();
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: null, terminalLayouts: {} }),
  });

  const prefix = `tracevane-ide-terminal-persist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const smokeDir = `tmp/.${prefix}`;
  const cleanupPaths = [smokeDir];
  await cleanup(rootId, cleanupPaths);
  await createDirectory(rootId, smokeDir);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout() }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const logs = [];
  const terminalIds = new Set();
  const expectDurableTmux = hasTmux();
  let context;
  let page;

  try {
    ({ context, page } = await newCleanPage(browser, logs));
    page.on('console', (msg) => logs.push(`[first:${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => logs.push(`[first:pageerror] ${error.stack || error.message}`));

    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await enterExplorerDirectory(page, smokeDir);
    if ((await page.locator('[data-ide-panel-placement="right"]').count()) === 0) {
      await page.getByRole('button', { name: 'Move Panel Right' }).click();
    }
    await page.locator('[data-ide-panel-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });

    await waitForCounts(page, { tabs: 1, panes: 1 });
    await waitForRunnablePane(page, 0);
    const firstToken = `TRACEVANE_M5X_PERSIST_FIRST_${Date.now()}`;
    await echoToken(page, firstToken);
    terminalIds.add(await activeTerminalId(page));

    await page.locator('[data-ide-terminal-new]').click();
    await waitForCounts(page, { tabs: 2, panes: 1 });
    await waitForRunnablePane(page, 0);
    const secondToken = `TRACEVANE_M5X_PERSIST_SECOND_${Date.now()}`;
    await echoToken(page, secondToken);
    terminalIds.add(await activeTerminalId(page));

    await splitActiveTerminalTab(page, 'right');
    await waitForCounts(page, { tabs: 2, panes: 2 });
    await waitForRunnablePane(page, 1);
    const splitToken = `TRACEVANE_M5X_PERSIST_SPLIT_${Date.now()}`;
    await echoToken(page, splitToken);
    const activeBeforeReload = await activeTerminalId(page);
    terminalIds.add(activeBeforeReload);

    const splitHandle = page.locator('[data-ide-terminal-split-resize-handle]').first();
    const beforeHandleBox = await splitHandle.boundingBox();
    if (beforeHandleBox) {
      await page.mouse.move(beforeHandleBox.x + beforeHandleBox.width / 2, beforeHandleBox.y + beforeHandleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(beforeHandleBox.x + beforeHandleBox.width / 2 + 80, beforeHandleBox.y + beforeHandleBox.height / 2);
      await page.mouse.up();
    }

    const terminalLayoutKey = `${rootId}:${smokeDir}`;
    await waitForServerLayout(
      rootId,
      (record) => record.layout?.panel?.placement === 'right'
        && record.layout?.explorer?.directoryPath === smokeDir
        && terminalLayoutHas(record, terminalLayoutKey, { tabs: 2, panes: 2 }),
      'right panel + explorer directory + terminal tab/split metadata',
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await waitForCounts(page, { tabs: 2, panes: 2 });
    await waitForRunnablePane(page, 1);
    await page.waitForFunction(
      (expectedTerminalId) => document.querySelector('[data-active-terminal-pane="true"]')?.getAttribute('data-terminal-id') === expectedTerminalId,
      activeBeforeReload,
      { timeout: 45_000 },
    );

    const sessions = await api('/api/terminal/sessions');
    const mountedTerminalIds = await page.locator('[data-ide-terminal-pane]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-terminal-id')).filter(Boolean),
    );
    for (const terminalId of mountedTerminalIds) {
      const descriptor = (sessions.sessions || []).find((item) => item.sessionId === terminalId);
      if (!descriptor) throw new Error(`Persisted descriptor missing for mounted pane ${terminalId}`);
      if (!descriptor.pinned || descriptor.canResume !== true) {
        throw new Error(`Expected pinned resumable descriptor for ${terminalId}, got ${JSON.stringify(descriptor)}`);
      }
      if (expectDurableTmux && descriptor.durableBackend !== 'tmux') {
        throw new Error(`Expected tmux-backed durable descriptor for ${terminalId}, got ${JSON.stringify(descriptor)}`);
      }
      terminalIds.add(terminalId);
    }

    await context.close();
    ({ context, page } = await newCleanPage(browser, logs));
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await waitForCounts(page, { tabs: 2, panes: 2 });
    await waitForRunnablePane(page, 1);
    await page.waitForFunction(
      (expectedTerminalId) => document.querySelector('[data-active-terminal-pane="true"]')?.getAttribute('data-terminal-id') === expectedTerminalId,
      activeBeforeReload,
      { timeout: 45_000 },
    );
  } catch (error) {
    const state = page ? await page.evaluate(() => ({
      url: location.href,
      explorerPath: document.querySelector('[data-ide-explorer-path]')?.textContent,
      panel: document.querySelector('[data-ide-panel]')?.outerHTML?.slice(0, 1000),
      terminal: document.querySelector('[data-ide-terminal-panel]')?.textContent?.slice(0, 2200),
      layout: document.querySelector('[data-ide-terminal-layout]')?.outerHTML?.slice(0, 1200),
      pane: document.querySelector('[data-active-terminal-pane="true"]')?.outerHTML?.slice(0, 1000),
      body: document.body.innerText.slice(0, 2600),
    })).catch(() => ({})) : {};
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-180).join('\n')}`);
  } finally {
    await context?.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    for (const terminalId of terminalIds) await endSession(terminalId);
    await cleanup(rootId, cleanupPaths);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
