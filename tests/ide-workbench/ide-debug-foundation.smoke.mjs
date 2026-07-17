import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL;
if (!BASE_URL) {
  throw new Error('TRACEVANE_WEB_SMOKE_URL is required; run `npm run smoke:ide:debug-foundation`.');
}
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


async function waitForApi(pathname, options = {}, { timeout = 30_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      return await api(pathname, options);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  throw lastError ?? new Error(`Timed out waiting for ${pathname}`);
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
  return { status: response.status, ok: response.ok, data: text ? JSON.parse(text) : null, text };
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'run',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 320 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom',
      visible: true,
      collapsed: false,
      size: 260,
      bottomSize: 260,
      rightWidth: 420,
      maximized: false,
      activePanelId: 'debugConsole',
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

async function run() {
  const summary = await waitForApi('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE debug smoke');
  const explorerDirectoryPath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));

  const status = await waitForApi('/api/debug/status');
  if (status.provider !== 'mock' || status.websocketPath !== '/ws/debug') {
    throw new Error(`Unexpected debug status: ${JSON.stringify(status)}`);
  }

  const badCwd = await apiRaw('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({ rootId, cwd: '../../', profileId: 'mock-node' }),
  });
  if (badCwd.ok) throw new Error('Debug create accepted cwd outside root');

  const badProfile = await apiRaw('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({ rootId, cwd: explorerDirectoryPath, profileId: 'unknown-profile' }),
  });
  if (badProfile.ok) throw new Error('Debug create accepted non-allowlisted profile');

  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(explorerDirectoryPath) });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Run and Debug' }).click();
    await page.locator('[data-ide-debug-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-status]', { hasText: /Debug Gateway/ }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-panel]').waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-ide-debug-start]').click();
    await page.locator('[data-ide-debug-session][data-ide-debug-session-state="stopped"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'initialized' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'stopped' }).first().waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-ide-debug-stop]').click();
    await page.locator('[data-ide-debug-session][data-ide-debug-session-state="terminated"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'terminated' }).first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      workbench: Boolean(document.querySelector('[data-ide-workbench]')),
      debugText: document.querySelector('[data-ide-debug-view]')?.textContent?.slice(0, 800),
      consoleText: document.querySelector('[data-ide-debug-console-panel]')?.textContent?.slice(0, 800),
      body: document.body.innerText.slice(0, 1600),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-80).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
