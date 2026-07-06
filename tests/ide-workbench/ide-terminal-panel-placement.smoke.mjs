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

async function waitForPlacement(page, placement) {
  await page.locator(`[data-ide-panel][data-ide-panel-placement="${placement}"]`).waitFor({ state: 'visible', timeout: 45_000 });
  await page.locator(`[data-ide-editor-panel-stack][data-ide-panel-stack-placement="${placement}"]`).waitFor({ state: 'visible', timeout: 45_000 });
}


async function waitForTabCount(page, minCount) {
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') >= expected,
    minCount,
    { timeout: 45_000 },
  );
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

async function waitForPaneCount(page, minCount) {
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-pane-count') || '0') >= expected,
    minCount,
    { timeout: 45_000 },
  );
}

async function echoInActivePane(page, token) {
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
  if (!rootId) throw new Error('No file root is available for IDE terminal panel placement smoke');
  await resetTerminalSessions();
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: null, terminalLayouts: {} }),
  });
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout() }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.layout.') || key.startsWith('tracevane.ide-workbench.terminal')) {
        localStorage.removeItem(key);
      }
    }
  });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForPlacement(page, 'bottom');
    await page.locator('[data-ide-terminal-panel][data-ide-terminal-placement="bottom"]').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 0);
    await echoInActivePane(page, `TRACEVANE_M5XB_BOTTOM_${Date.now()}`);

    await page.getByRole('button', { name: 'Move Panel Right' }).click();
    await waitForPlacement(page, 'right');
    await page.locator('[data-ide-terminal-panel][data-ide-terminal-placement="right"]').waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 0);
    await echoInActivePane(page, `TRACEVANE_M5XB_RIGHT_${Date.now()}`);

    await page.locator('[data-ide-terminal-new]').click();
    await waitForTabCount(page, 2);
    await waitForPaneCount(page, 1);
    await waitForRunnablePane(page, 0);
    await splitActiveTerminalTab(page, 'right');
    await waitForPaneCount(page, 2);
    await page.locator('[data-terminal-orientation="horizontal"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await splitActiveTerminalTab(page, 'down');
    await waitForPaneCount(page, 3);
    await page.locator('[data-terminal-orientation="vertical"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 2);
    await echoInActivePane(page, `TRACEVANE_M5XB_SPLIT_${Date.now()}`);

    await page.getByRole('button', { name: 'Output' }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Debug Console' }).click();
    await page.locator('[data-ide-debug-console-placeholder]').waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByRole('button', { name: 'Move Panel Bottom' }).click();
    await waitForPlacement(page, 'bottom');
    await page.getByRole('button', { name: '重置布局' }).click();
    await waitForPlacement(page, 'bottom');
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      panelPlacement: document.querySelector('[data-ide-panel]')?.getAttribute('data-ide-panel-placement'),
      stackPlacement: document.querySelector('[data-ide-editor-panel-stack]')?.getAttribute('data-ide-panel-stack-placement'),
      terminalPlacement: document.querySelector('[data-ide-terminal-panel]')?.getAttribute('data-ide-terminal-placement'),
      panel: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 1800),
      terminal: document.querySelector('[data-ide-terminal-panel]')?.textContent?.slice(0, 1800),
      body: document.body.innerText.slice(0, 2200),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-120).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
