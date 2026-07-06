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


async function waitForTabCount(page, minCount) {
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') >= expected,
    minCount,
    { timeout: 45_000 },
  );
  const count = await page.locator('[data-ide-terminal-tab]').count();
  if (count < minCount) throw new Error(`Expected at least ${minCount} terminal tabs, got ${count}`);
}

async function waitForPaneCount(page, minCount) {
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-pane-count') || '0') >= expected,
    minCount,
    { timeout: 45_000 },
  );
  const count = await page.locator('[data-ide-terminal-pane]').count();
  if (count < minCount) throw new Error(`Expected at least ${minCount} terminal panes, got ${count}`);
}

async function waitForPaneCountExactly(page, expectedCount) {
  await page.waitForFunction(
    (expected) => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-pane-count') || '0') === expected,
    expectedCount,
    { timeout: 45_000 },
  );
  const count = await page.locator('[data-ide-terminal-pane]').count();
  if (count !== expectedCount) throw new Error(`Expected exactly ${expectedCount} terminal panes, got ${count}`);
}

async function waitForRunnablePane(page, index) {
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

async function echoInPane(page, index, token) {
  const pane = page.locator('[data-ide-terminal-pane]').nth(index);
  await pane.locator('[data-ide-terminal-xterm]').click({ timeout: 30_000 });
  await page.waitForTimeout(250);
  await page.keyboard.press('Control+U');
  await page.keyboard.type(`echo ${token}`);
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    ({ paneIndex, expectedToken }) => {
      const text = document.querySelectorAll('[data-ide-terminal-pane]')[paneIndex]?.textContent || '';
      return text.includes(expectedToken);
    },
    { paneIndex: index, expectedToken: token },
    { timeout: 45_000 },
  );
}

async function resizePanel(page) {
  const handle = page.locator('[data-ide-panel-resize-handle]').first();
  await handle.waitFor({ state: 'visible', timeout: 30_000 });
  const box = await handle.boundingBox();
  if (!box) return;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, Math.max(80, box.y - 80));
  await page.mouse.up();
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
  if (!rootId) throw new Error('No file root is available for IDE terminal split smoke');
  await resetTerminalSessions();
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: null, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.terminal-layout.')) localStorage.removeItem(key);
    }
  });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-xterm]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 0);
    await echoInPane(page, 0, `TRACEVANE_M5XA_DEFAULT_${Date.now()}`);

    await page.locator('[data-ide-terminal-new]').click();
    await waitForTabCount(page, 2);
    await waitForPaneCountExactly(page, 1);
    await waitForRunnablePane(page, 0);
    await echoInPane(page, 0, `TRACEVANE_M5XA_NEW_TAB_${Date.now()}`);

    await splitActiveTerminalTab(page, 'right');
    await waitForPaneCount(page, 2);
    await page.locator('[data-terminal-orientation="horizontal"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 1);

    await splitActiveTerminalTab(page, 'down');
    await waitForPaneCount(page, 3);
    await page.locator('[data-terminal-orientation="vertical"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await waitForRunnablePane(page, 2);

    const splitHandle = page.locator('[data-ide-terminal-split-resize-handle]').first();
    await splitHandle.waitFor({ state: 'visible', timeout: 30_000 });
    const handleBox = await splitHandle.boundingBox();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2 + 60, handleBox.y + handleBox.height / 2);
      await page.mouse.up();
    }

    await resizePanel(page);
    await waitForPaneCount(page, 3);

    const beforeClose = await page.locator('[data-ide-terminal-pane]').count();
    await page.locator('[data-ide-terminal-pane]').nth(0).getByRole('button', { name: '关闭终端 Pane' }).click();
    await waitForPaneCountExactly(page, Math.max(1, beforeClose - 1));

    await page.getByRole('button', { name: 'Output' }).click();
    await page.getByText('Output 占位').waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Debug Console' }).click();
    await page.getByText('Debug Console 占位').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      panel: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 1600),
      terminal: document.querySelector('[data-ide-terminal-panel]')?.textContent?.slice(0, 1600),
      paneCount: document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-pane-count'),
      body: document.body.innerText.slice(0, 1800),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-100).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
