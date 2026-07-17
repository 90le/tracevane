import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
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
  const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`).catch(() => null);
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
  await page.locator(nodeSelector(targetPath)).first().click();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function openPinnedFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().dblclick();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE editor smoke');

  const prefix = `tracevane-ide-editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeDir = explorerDirectoryPath ? `${explorerDirectoryPath}/.${prefix}` : `.${prefix}`;
  const textPath = `${smokeDir}/hello.ts`;
  const binaryPath = `${smokeDir}/image.bin`;
  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, textPath, 'export const message = "ide editor foundation";\n');
  await fs.writeFile(path.join(root.absolutePath, binaryPath), Buffer.from([0, 159, 146, 150, 0, 255, 12, 8]));

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ key, layout }) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(layout));
      window.localStorage.removeItem('tracevane:ide-workbench:editor-preferences:v1');
    } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(explorerDirectoryPath) });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, textPath, explorerDirectoryPath);
    await page.locator('[data-ide-monaco-editor-panel][data-ide-editor-file-path="' + cssAttr(textPath) + '"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.view-line', { hasText: 'ide editor foundation' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-code-editor-minimap="disabled"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-action-menu-trigger]').click();
    await page.locator('[data-ide-editor-action-minimap]').click();
    await page.locator('[data-code-editor-minimap="enabled"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    const modelUri = await page.locator('[data-ide-monaco-editor-panel]').first().getAttribute('data-ide-editor-model-uri');
    if (!modelUri || !modelUri.startsWith('file:///workspace/')) throw new Error(`unexpected Monaco model uri: ${modelUri}`);

    await openPinnedFromExplorer(page, binaryPath, explorerDirectoryPath);
    await page.locator(tabSelector(textPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(binaryPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-panel-kind="preview"][data-ide-editor-file-path="' + cssAttr(binaryPath) + '"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-panel][data-file-surface-kind="binary"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-binary]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-hex-editor][data-file-surface-hex-readonly="true"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-hex-row]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-active-file-path]', { hasText: binaryPath }).waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      workbench: Boolean(document.querySelector('[data-ide-workbench]')),
      sidebarText: document.querySelector('[data-ide-sidebar]')?.textContent?.slice(0, 600),
      editorText: document.querySelector('[data-ide-editor-dock]')?.textContent?.slice(0, 1000),
      body: document.body.innerText.slice(0, 1600),
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
