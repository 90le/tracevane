import path from 'node:path';
import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL;
if (!BASE_URL) {
  throw new Error('TRACEVANE_WEB_SMOKE_URL is required; run `npm run smoke:ide:debug-node-inspector`.');
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
  return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null, text };
}

async function waitForApi(pathname, options = {}, { timeout = 30_000, interval = 500 } = {}) {
  const deadline = Date.now() + timeout;
  let lastError = null;
  while (Date.now() < deadline) {
    try { return await api(pathname, options); } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  throw lastError ?? new Error(`Timed out waiting for ${pathname}`);
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function editorDocumentId(rootId, filePath) {
  return `${rootId}:${normalizePortablePath(filePath)}`;
}

function editorTitleForPath(filePath) {
  const normalized = normalizePortablePath(filePath);
  return normalized.split('/').filter(Boolean).pop() || normalized || 'Untitled';
}

function createWorkbenchLayout(rootId, directoryPath, filePath) {
  const tabId = editorDocumentId(rootId, filePath);
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
    editorGroups: [{
      id: 'main',
      activeTabId: tabId,
      tabs: [{
        id: tabId,
        ref: { rootId, path: filePath },
        title: editorTitleForPath(filePath),
        preview: false,
        pinned: true,
        dirty: false,
        reveal: { lineNumber: 1, column: 1 },
      }],
    }],
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
  await api(`/api/files/browse?${new URLSearchParams({ rootId, path: normalized, hidden: 'true' }).toString()}`).catch(async () => {
    const parent = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    await ensureDirectory(rootId, parent);
    await createDirectory(rootId, normalized).catch((error) => {
      if (String(error?.message || error).toLowerCase().includes('exists')) return;
      throw error;
    });
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
}

async function run() {
  const summary = await waitForApi('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE debug node inspector smoke');
  const smokeDir = normalizePortablePath(path.join(relativePathFromRoot(root.absolutePath, process.cwd()), '.tmp', `ide-debug-node-inspector-${Date.now().toString(36)}`));
  const filePath = `${smokeDir}/node-inspector-target.js`;
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, filePath, ['const smoke = process.argv.slice(2);', 'debugger;', 'console.log(smoke.join(","));', ''].join('\n'));

  const status = await waitForApi('/api/debug/status');
  for (const feature of ['launch-profiles', 'launch-config-validation', 'launch-args-env-guard']) {
    if (!status.features?.includes(feature)) throw new Error(`Debug status missing ${feature}: ${JSON.stringify(status.features)}`);
  }
  const nodeInspector = status.supportedProfiles?.find((profile) => profile.id === 'node-inspector-lite');
  if (!nodeInspector?.requiresProgram || !nodeInspector.allowArgs || !nodeInspector.allowEnv || !nodeInspector.programExtensions?.includes('.js')) {
    throw new Error(`Node inspector launch profile metadata is incomplete: ${JSON.stringify(nodeInspector)}`);
  }
  for (const feature of ['node-inspector-lite-profile', 'node-inspector-launch-proof']) {
    if (!status.features?.includes(feature)) throw new Error(`Debug status missing ${feature}: ${JSON.stringify(status.features)}`);
  }

  const mockArgs = await apiRaw('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({ rootId, cwd: smokeDir, profileId: 'mock-node', args: ['--not-allowed'] }),
  });
  if (mockArgs.ok || !mockArgs.text.includes('does not allow launch args')) {
    throw new Error(`Mock launch unexpectedly accepted args: ${mockArgs.text}`);
  }

  const badEnv = await apiRaw('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({ rootId, cwd: smokeDir, profileId: 'node-inspector-lite', program: filePath, env: { 'BAD-KEY': '1' } }),
  });
  if (badEnv.ok || !badEnv.text.includes('Invalid debug launch env key')) {
    throw new Error(`Node inspector launch unexpectedly accepted invalid env: ${badEnv.text}`);
  }

  const apiPayload = await api('/api/debug/sessions', {
    method: 'POST',
    body: JSON.stringify({
      rootId,
      cwd: smokeDir,
      launch: {
        profileId: 'node-inspector-lite',
        program: filePath,
        args: ['--trace', 'smoke'],
        env: { TRACEVANE_SMOKE: '1' },
      },
      breakpoints: [{ rootId, path: filePath, lineNumber: 2, column: 1, enabled: true }],
    }),
  });
  if (apiPayload.session?.profileId !== 'node-inspector-lite' || apiPayload.session?.launchArgs?.length !== 2 || apiPayload.session?.launchEnvKeys?.[0] !== 'TRACEVANE_SMOKE') {
    throw new Error(`Debug node inspector API did not preserve sanitized config: ${JSON.stringify(apiPayload)}`);
  }
  await api('/api/debug/sessions/stop', {
    method: 'POST',
    body: JSON.stringify({ sessionId: apiPayload.session.id }),
  });

  const layout = createWorkbenchLayout(rootId, smokeDir, filePath);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 820 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${filePath}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-profile-select]').selectOption('node-inspector-lite');
    await page.locator('[data-ide-debug-launch-args]').fill('--ui smoke');
    await page.locator('[data-ide-debug-launch-env]').fill('TRACEVANE_SMOKE=ui');
    await page.locator('[data-ide-debug-launch-start]').click();
    await page.locator('[data-ide-debug-session][data-ide-debug-session-state="stopped"][data-ide-debug-session-profile="node-inspector-lite"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-session-args]', { hasText: 'args: 2' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-session-env]', { hasText: 'TRACEVANE_SMOKE' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-variable][data-ide-debug-variable-name="adapter"]', { hasText: 'node-inspector-lite' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-stack-frame]', { hasText: 'node-inspector-target.js' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-variable][data-ide-debug-variable-name="inspector"]', { hasText: 'connected' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-debug-console-event]', { hasText: 'Node Inspector Lite' }).first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      debugText: document.querySelector('[data-ide-debug-view]')?.textContent?.slice(0, 1600),
      consoleText: document.querySelector('[data-ide-debug-console-panel]')?.textContent?.slice(0, 1200),
      body: document.body.innerText.slice(0, 2400),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-100).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]).catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
