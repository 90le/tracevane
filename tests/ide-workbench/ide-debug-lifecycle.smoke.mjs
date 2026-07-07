import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const EXTERNAL_BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL;
const SMOKE_PORT = Number(process.env.TRACEVANE_WEB_PORT || 5189);
const BASE_URL = EXTERNAL_BASE_URL || `http://127.0.0.1:${SMOKE_PORT}`;
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';


async function startDevServerIfNeeded() {
  if (EXTERNAL_BASE_URL) return null;
  for (const pid of await pidsForPort(SMOKE_PORT)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* ignore stale smoke server */ }
  }
  const child = spawn('bash', ['scripts/dev-web-smoke.sh'], {
    cwd: process.cwd(),
    env: { ...process.env, TRACEVANE_WEB_PORT: String(SMOKE_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logs = [];
  child.stdout.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr.on('data', (chunk) => logs.push(String(chunk)));
  const deadline = Date.now() + 60_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`dev server exited ${child.exitCode}: ${logs.join('').slice(-4000)}`);
    }
    try {
      const response = await fetch(`${BASE_URL}/api/debug/status`);
      if (response.ok) return { child, logs };
      lastError = new Error(`status ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  try { child.kill('SIGTERM'); } catch { /* ignore */ }
  throw new Error(`Timed out waiting for dev server debug API: ${lastError instanceof Error ? lastError.message : String(lastError)}\nlogs=${logs.join('').slice(-4000)}`);
}

async function pidsForPort(port) {
  try {
    const { execFileSync } = await import('node:child_process');
    const output = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' });
    return output.split(/\s+/).filter(Boolean).map((value) => Number(value)).filter(Number.isFinite);
  } catch {
    return [];
  }
}

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
  const devServer = await startDevServerIfNeeded();
  const summary = await waitForApi('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE debug smoke');
  const explorerDirectoryPath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));

  const status = await waitForApi('/api/debug/status');
  if (status.provider !== 'mock' || status.websocketPath !== '/ws/debug') {
    throw new Error(`Unexpected debug status: ${JSON.stringify(status)}`);
  }
  for (const feature of ['lifecycle-events', 'session-state-machine']) {
    if (!status.features?.includes(feature)) throw new Error(`Debug status missing ${feature}: ${JSON.stringify(status.features)}`);
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

  const lifecyclePayload = await api('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({ rootId, cwd: explorerDirectoryPath, profileId: 'mock-node', name: 'Lifecycle API Smoke' }),
  });
  if (lifecyclePayload.session?.state !== 'stopped' || lifecyclePayload.session?.lifecycleEvent !== 'stopped') {
    throw new Error(`Debug lifecycle API did not return stopped lifecycle: ${JSON.stringify(lifecyclePayload)}`);
  }
  const stoppedId = lifecyclePayload.session.id;
  const stoppedPayload = await api('/api/debug/sessions/stop', {
    method: 'POST',
    body: JSON.stringify({ sessionId: stoppedId }),
  });
  if (stoppedPayload.session?.state !== 'terminated' || stoppedPayload.session?.lifecycleEvent !== 'terminated' || stoppedPayload.session?.terminationReason !== 'terminated') {
    throw new Error(`Debug lifecycle API did not return terminated lifecycle: ${JSON.stringify(stoppedPayload)}`);
  }

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
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle initialized' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle configured' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle running' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle stopped' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-session-lifecycle]', { hasText: 'lifecycle: stopped' }).first().waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-ide-debug-stop]').click();
    await page.locator('[data-ide-debug-session][data-ide-debug-session-state="terminated"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle terminating' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Debug lifecycle terminated' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-session-lifecycle]', { hasText: 'lifecycle: terminated' }).first().waitFor({ state: 'visible', timeout: 30_000 });
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
    if (devServer) {
      try { devServer.child.kill('SIGTERM'); } catch { /* ignore */ }
      setTimeout(() => { try { devServer.child.kill('SIGKILL'); } catch { /* ignore */ } }, 1500).unref?.();
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
