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

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file root is available for terminal manager smoke');
  const sid = `terminal-manager-smoke-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const otherRootId = summary.roots?.find((root) => root?.id && root.id !== rootId)?.id ?? rootId;
  const hasOtherRoot = otherRootId !== rootId;
  const otherWorkspaceId = otherRootId;
  const otherSidA = `${sid}-other-a`;
  const otherSidB = `${sid}-other-b`;

  await resetTerminalSessions();
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(), terminalLayouts: {} }),
  });
  await api('/api/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({
      sid,
      rootId,
      workspaceId: rootId,
      cwd: '',
      profileId: 'local-shell',
      shell: 'bash',
      targetKind: 'local',
      pinned: true,
    }),
  });
  for (const otherSid of hasOtherRoot ? [otherSidA, otherSidB] : []) {
    await api('/api/terminal/sessions', {
      method: 'POST',
      body: JSON.stringify({
        sid: otherSid,
        rootId: otherRootId,
        workspaceId: otherWorkspaceId,
        cwd: '',
        profileId: 'local-shell',
        shell: 'bash',
        targetKind: 'local',
        pinned: true,
      }),
    });
  }
  const sessionsBefore = await api('/api/terminal/sessions');
  const descriptor = sessionsBefore.sessions?.find((session) => session.sessionId === sid);
  if (!descriptor) throw new Error('Created terminal session was not listed by /api/terminal/sessions');
  if (descriptor.rootId !== rootId || descriptor.workspaceId !== rootId) {
    throw new Error(`Terminal descriptor did not preserve workspace metadata: ${JSON.stringify(descriptor)}`);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('tracevane.ide-workbench.')) localStorage.removeItem(key);
    }
  });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-xterm]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => Number(document.querySelector('[data-ide-terminal-layout]')?.getAttribute('data-terminal-tab-count') || '0') >= 1, { timeout: 30_000 });
    await page.locator('[data-ide-terminal-manager-open]').click({ timeout: 30_000 });
    await page.locator('[data-ide-terminal-manager-dialog]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-terminal-manager-session="${sid}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-terminal-manager-attach="${sid}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-terminal-manager-refresh]').click();
    await page.locator(`[data-ide-terminal-manager-session="${sid}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    if (hasOtherRoot) {
      await page.locator(`[data-ide-terminal-manager-session="${otherSidA}"]`).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator(`[data-ide-terminal-manager-session="${otherSidB}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    }

    await page.locator('[data-ide-terminal-manager-close-all]').click();
    await page.waitForFunction(
      (sessionIds) => sessionIds.every((sessionId) => !document.querySelector(`[data-ide-terminal-manager-session="${sessionId}"]`)),
      [sid, ...(hasOtherRoot ? [otherSidA, otherSidB] : [])],
      { timeout: 45_000 },
    );
    await page.waitForTimeout(1_500);
    await page.locator('[data-ide-terminal-manager-refresh]').click();
    await page.waitForTimeout(500);
    const bouncedClosedSessions = await page
      .locator(`[data-ide-terminal-manager-session="${sid}"]${hasOtherRoot ? `, [data-ide-terminal-manager-session="${otherSidA}"], [data-ide-terminal-manager-session="${otherSidB}"]` : ''}`)
      .count();
    if (bouncedClosedSessions !== 0) {
      throw new Error(`Closed sessions bounced back into Terminal Manager after close-all: ${bouncedClosedSessions}`);
    }
    await page.locator('[data-ide-terminal-empty]').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      dialog: document.querySelector('[data-ide-terminal-manager-dialog]')?.textContent?.slice(0, 2000),
      body: document.body.innerText.slice(0, 2200),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-120).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await Promise.allSettled([sid, otherSidA, otherSidB].map((sessionId) => (
      api('/api/terminal/end', { method: 'POST', body: JSON.stringify({ sid: sessionId }) })
    )));
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
