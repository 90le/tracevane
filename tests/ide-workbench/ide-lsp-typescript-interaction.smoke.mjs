import { chromium } from '@playwright/test';
import path from 'node:path';
import { WebSocket } from 'ws';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;
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
      reject(new Error('LSP WebSocket interaction timeout'));
    }, 10_000);
    socket.on('error', reject);
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      if (event.type === 'ready') {
        socket.send(JSON.stringify(payload));
        return;
      }
      if (event.type === 'diagnostics' || event.type === 'hover' || event.type === 'definition') {
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

function nodeSelector(pathValue) {
  return `[data-ide-explorer-node-path="${cssAttr(pathValue)}"]`;
}

function tabSelector(pathValue) {
  return `[data-ide-editor-tab-path="${cssAttr(pathValue)}"]`;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 280,
      bottomSize: 280, rightWidth: 420, maximized: false, activePanelId: 'problems',
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

async function openFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().dblclick();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE LSP smoke');

  const prefix = `tracevane-ide-lsp-ts-interaction-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const tsPath = `${smokeDir}/interaction.ts`;

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  const tsContent = 'function tracevaneAnswer(value: number): number {\n  return value + 1;\n}\nconst result = tracevaneAnswer(41);\nexport { result };\n';
  await createFile(rootId, tsPath, tsContent);

  const hoverPayload = { type: 'hover', rootId, path: tsPath, language: 'typescript', content: tsContent, line: 1, column: 10 };
  const hover = await api('/api/lsp/hover', {
    method: 'POST',
    body: JSON.stringify(hoverPayload),
  });
  if (hover.provider !== 'typescript' || !hover.contents?.join(' ').includes('tracevaneAnswer')) throw new Error(`direct TypeScript hover mismatch: ${JSON.stringify(hover)}`);

  const definitionPayload = { type: 'definition', rootId, path: tsPath, language: 'typescript', content: tsContent, line: 4, column: 17 };
  const definition = await api('/api/lsp/definition', {
    method: 'POST',
    body: JSON.stringify(definitionPayload),
  });
  if (definition.provider !== 'typescript' || !definition.locations?.some((location) => location.path === tsPath && location.startLine === 1)) throw new Error(`direct TypeScript definition mismatch: ${JSON.stringify(definition)}`);

  const gatewayHover = await requestGatewayEvent(hoverPayload);
  if (gatewayHover.provider !== 'typescript' || !gatewayHover.contents?.join(' ').includes('tracevaneAnswer')) throw new Error(`LSP WebSocket TypeScript hover mismatch: ${JSON.stringify(gatewayHover)}`);

  const gatewayDefinition = await requestGatewayEvent(definitionPayload);
  if (!gatewayDefinition.locations?.some((location) => location.path === tsPath && location.startLine === 1)) throw new Error(`LSP WebSocket TypeScript definition mismatch: ${JSON.stringify(gatewayDefinition)}`);


  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-problems-panel]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, tsPath, explorerDirectoryPath);
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(tsPath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.getByRole('button', { name: 'Output', exact: true }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-output-channel-select]').selectOption('lsp');
    await page.locator('[data-ide-output-event]', { hasText: 'TypeScript/JavaScript hover/definition' }).waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.slice(0, 2200),
      problems: document.querySelector('[data-ide-problems-panel]')?.textContent?.slice(0, 1600),
      output: document.querySelector('[data-ide-output-panel]')?.textContent?.slice(0, 1600),
    })).catch(() => null);
    throw new Error(`${error instanceof Error ? error.stack || error.message : String(error)}\nState: ${JSON.stringify(state, null, 2)}\nConsole logs:\n${logs.join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
