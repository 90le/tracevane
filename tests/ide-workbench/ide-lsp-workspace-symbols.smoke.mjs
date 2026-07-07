import { chromium } from '@playwright/test';
import path from 'node:path';
import { WebSocket } from 'ws';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
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
      if (!response.ok) {
        const error = new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500) throw error;
      await sleep(250);
    }
  }
  throw lastError;
}

function wsUrl(pathname) {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname;
  url.search = '';
  return url.toString();
}

async function requestGatewayEvent(payload) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl('/ws/lsp'));
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('LSP WebSocket workspace symbols timeout'));
    }, 10_000);
    socket.on('error', reject);
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      if (event.type === 'ready') {
        socket.send(JSON.stringify(payload));
        return;
      }
      if (event.type === 'workspaceSymbols') {
        clearTimeout(timeout);
        socket.close();
        resolve(event);
        return;
      }
      if (event.type === 'error') {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(event.message || 'LSP WebSocket error'));
      }
    });
  });
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tabSelector(pathValue) {
  return `[data-ide-editor-tab-path="${cssAttr(pathValue)}"]`;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'search',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 340 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 220,
      bottomSize: 220, rightWidth: 420, maximized: false, activePanelId: 'output',
    },
    viewPlacements: [
      { viewId: 'explorer', placement: 'primary-sidebar', order: 0, visible: true },
      { viewId: 'search', placement: 'primary-sidebar', order: 1, visible: true },
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
  await api('/api/files/directories', { method: 'POST', body: JSON.stringify({ rootId, directoryPath, name }) });
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
  await api('/api/files/files', { method: 'POST', body: JSON.stringify({ rootId, directoryPath, name, content, overwrite: true }) });
}

async function cleanup(rootId, paths) {
  await api('/api/files', { method: 'DELETE', body: JSON.stringify({ rootId, paths, permanent: true }) }).catch(() => undefined);
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function assertWorkspaceSymbols(response, label, expectedPath) {
  if (response.type !== 'workspaceSymbols' || response.provider !== 'typescript') {
    throw new Error(`${label} workspace symbols response type/provider mismatch: ${JSON.stringify(response)}`);
  }
  if (!Array.isArray(response.items) || !response.items.length) {
    throw new Error(`${label} workspace symbols response had no items: ${JSON.stringify(response)}`);
  }
  if (!response.items.some((item) => item.name === 'TracevaneWorkspaceSymbolAlpha' && item.kind === 'class' && item.path === expectedPath)) {
    throw new Error(`${label} workspace symbols response missing expected class item: ${JSON.stringify(response.items)}`);
  }
  if (response.items.length > 20 || response.scannedFiles < 1) {
    throw new Error(`${label} workspace symbols response was not bounded/scanned enough: ${JSON.stringify(response)}`);
  }
}

function assertSymbolIndex(response, label, expectedStatus) {
  if (!response.index || response.index.providerVersion !== 'typescript-navigate-v1') {
    throw new Error(`${label} workspace symbols missing symbol index metadata: ${JSON.stringify(response)}`);
  }
  if (expectedStatus && response.index.status !== expectedStatus) {
    throw new Error(`${label} workspace symbols index status expected ${expectedStatus}, got ${response.index.status}: ${JSON.stringify(response.index)}`);
  }
  if (response.index.indexedFiles < 0 || response.index.indexedSymbols < 0 || response.index.staleFiles < 0) {
    throw new Error(`${label} workspace symbols index metadata has invalid counts: ${JSON.stringify(response.index)}`);
  }
}

function assertMissingPath(response, label, missingPath) {
  if (response.items.some((item) => item.path === missingPath)) {
    throw new Error(`${label} returned deleted path ${missingPath}: ${JSON.stringify(response.items)}`);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE LSP workspace symbols smoke');

  const status = await api('/api/lsp/status');
  if (!status.features?.includes('workspaceSymbols')) {
    throw new Error(`LSP status does not advertise workspaceSymbols: ${JSON.stringify(status)}`);
  }

  const prefix = `tracevane-ide-lsp-symbols-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/${prefix}`;
  const alphaPath = `${smokeDir}/symbols-alpha.ts`;
  const betaPath = `${smokeDir}/symbols-beta.js`;
  const alphaContent = [
    'export class TracevaneWorkspaceSymbolAlpha {',
    '  run(): number { return 1; }',
    '}',
    'export function tracevaneWorkspaceSymbolHelper() {',
    '  return new TracevaneWorkspaceSymbolAlpha().run();',
    '}',
    '',
  ].join('\n');
  const betaContent = 'export const tracevaneWorkspaceSymbolValue = 42;\n';

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, alphaPath, alphaContent);
  await createFile(rootId, betaPath, betaContent);

  const payload = { type: 'workspaceSymbols', rootId, path: smokeDir, query: 'TracevaneWorkspaceSymbol', limit: 20, includeHidden: true };
  const direct = await api('/api/lsp/workspace-symbols', { method: 'POST', body: JSON.stringify(payload) });
  assertWorkspaceSymbols(direct, 'direct', alphaPath);
  assertSymbolIndex(direct, 'direct', 'rebuilt');

  const cached = await api('/api/lsp/workspace-symbols', { method: 'POST', body: JSON.stringify(payload) });
  assertWorkspaceSymbols(cached, 'cached', alphaPath);
  assertSymbolIndex(cached, 'cached', 'fresh');

  await createFile(rootId, alphaPath, `${alphaContent}export class TracevaneWorkspaceSymbolGamma {}\n`);
  const changed = await api('/api/lsp/workspace-symbols', {
    method: 'POST',
    body: JSON.stringify({ ...payload, query: 'TracevaneWorkspaceSymbolGamma' }),
  });
  if (!changed.items.some((item) => item.name === 'TracevaneWorkspaceSymbolGamma' && item.path === alphaPath)) {
    throw new Error(`Changed symbol query did not rebuild stale index: ${JSON.stringify(changed)}`);
  }
  assertSymbolIndex(changed, 'changed', 'rebuilt');

  await cleanup(rootId, [betaPath]);
  const deleted = await api('/api/lsp/workspace-symbols', {
    method: 'POST',
    body: JSON.stringify({ ...payload, query: 'tracevaneWorkspaceSymbolValue' }),
  });
  assertSymbolIndex(deleted, 'deleted', 'rebuilt');
  assertMissingPath(deleted, 'deleted', betaPath);

  const gateway = await requestGatewayEvent(payload);
  assertWorkspaceSymbols(gateway, 'gateway', alphaPath);
  assertSymbolIndex(gateway, 'gateway', 'fresh');

  const empty = await api('/api/lsp/workspace-symbols', { method: 'POST', body: JSON.stringify({ ...payload, query: 'DefinitelyMissingTracevaneSymbol' }) });
  if (empty.items.length !== 0) throw new Error(`Missing symbol query should return empty items: ${JSON.stringify(empty)}`);
  assertSymbolIndex(empty, 'empty', 'fresh');

  let longQueryFailed = false;
  try {
    await api('/api/lsp/workspace-symbols', { method: 'POST', body: JSON.stringify({ ...payload, query: 'x'.repeat(120) }) });
  } catch (error) {
    longQueryFailed = error.status === 400 && String(error.data?.message || error.message).includes('80');
  }
  if (!longQueryFailed) throw new Error('Long workspace symbols query did not fail with a bounded 400 response');

  const layout = createDefaultWorkbenchLayout(smokeDir);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 840 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-activity-bar] button[aria-label="Search"]').click();
    await page.locator('[data-ide-search-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-search-mode="symbols"]').click();
    await page.locator('[data-ide-search-input]').fill('TracevaneWorkspaceSymbolAlpha');
    await page.locator('[data-ide-search-scope]').fill(smokeDir);
    await page.locator('[data-ide-search-submit]').click();
    await page.locator(`[data-ide-symbol-result-path="${cssAttr(alphaPath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-symbol-result-path="${cssAttr(alphaPath)}"]`).first().click();
    await page.locator(tabSelector(alphaPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(alphaPath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
    const severe = logs.filter((line) => line.includes('[pageerror]'));
    if (severe.length) console.warn(severe.join('\n'));
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
