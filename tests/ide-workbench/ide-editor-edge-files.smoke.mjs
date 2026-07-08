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
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 304 },
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

async function openFromExplorer(page, targetPath, basePath = '', { pinned = false } = {}) {
  await revealPath(page, targetPath, basePath);
  const row = page.locator(nodeSelector(targetPath)).first();
  if (pinned) await row.dblclick();
  else await row.click();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expectMonacoFile(page, filePath, { readonly }) {
  await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(filePath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-readonly="${readonly ? 'true' : 'false'}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function deleteFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: /删除/ }).click();
  await page.locator('[data-ide-explorer-delete-dialog]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-ide-explorer-open-tab-delete-warning]').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('[data-ide-explorer-delete-confirm-input]').fill('DELETE');
  const permanent = page.locator('[data-ide-explorer-delete-permanent]');
  if (!(await permanent.isChecked())) await permanent.check();
  await page.getByRole('button', { name: '永久删除' }).click();
  await page.locator('[data-ide-explorer-delete-dialog]').waitFor({ state: 'hidden', timeout: 30_000 });
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE editor edge-files smoke');

  const prefix = `tracevane-ide-editor-edge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const textPath = `${smokeDir}/normal.ts`;
  const readonlyPath = `${smokeDir}/readonly.json`;
  const largePath = `${smokeDir}/large.log`;
  const imagePath = `${smokeDir}/pixel.png`;
  const binaryPath = `${smokeDir}/payload.bin`;
  const deletedPath = `${smokeDir}/deleted.ts`;

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, textPath, 'export const edge = "text";\n');
  await createFile(rootId, readonlyPath, '{"readonly":true}\n');
  await createFile(rootId, deletedPath, 'export const gone = true;\n');
  await fs.chmod(path.join(root.absolutePath, readonlyPath), 0o444);
  await fs.writeFile(path.join(root.absolutePath, largePath), `${'large edge file line\n'.repeat(70_000)}`);
  await fs.writeFile(path.join(root.absolutePath, imagePath), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'));
  const binaryFixture = Buffer.alloc(96 * 1024);
  for (let index = 0; index < binaryFixture.length; index += 1) binaryFixture[index] = index % 256;
  await fs.writeFile(path.join(root.absolutePath, binaryPath), binaryFixture);
  // Chmod and large-file fixture writes can be observed by the dev server file watcher.
  // Let the smoke server settle before opening the browser so the acceptance does not
  // race a Vite reload and lose transient editor tabs.
  await new Promise((resolve) => setTimeout(resolve, 2500));

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

    await openFromExplorer(page, textPath, explorerDirectoryPath, { pinned: true });
    await expectMonacoFile(page, textPath, { readonly: false });
    await page.locator('.view-line', { hasText: 'edge = "text"' }).first().waitFor({ state: 'visible', timeout: 30_000 });
    const normalModelUri = await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(textPath)}"]`).first().getAttribute('data-ide-editor-model-uri');
    if (!normalModelUri || !normalModelUri.startsWith('file:///workspace/')) throw new Error(`unexpected Monaco model uri: ${normalModelUri}`);

    await openFromExplorer(page, readonlyPath, explorerDirectoryPath, { pinned: true });
    await expectMonacoFile(page, readonlyPath, { readonly: true });
    await page.locator('[data-ide-status-active-file-path]', { hasText: readonlyPath }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-active-file]', { hasText: /readonly|只读/i }).waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, largePath, explorerDirectoryPath, { pinned: true });
    await page.locator('[data-ide-editor-panel-state="unsupported"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-panel-title]', { hasText: '此文件不能作为文本编辑' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-panel-path]', { hasText: largePath }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('text=读取结果已被截断').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, imagePath, explorerDirectoryPath, { pinned: true });
    await page.locator(`[data-ide-editor-panel-kind="preview"][data-ide-editor-file-path="${cssAttr(imagePath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-panel][data-file-surface-kind="image"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-image-viewer]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-image-zoom-in]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, binaryPath, explorerDirectoryPath, { pinned: true });
    await page.locator(`[data-ide-editor-panel-kind="preview"][data-ide-editor-file-path="${cssAttr(binaryPath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-panel][data-file-surface-kind="binary"]').waitFor({ state: 'visible', timeout: 30_000 });
    const hexEditor = page.locator('[data-file-surface-hex-editor][data-file-surface-hex-readonly="true"]').first();
    await hexEditor.waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-file-surface-hex-row]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(() => {
      const loaded = Number(document.querySelector('[data-file-surface-hex-editor]')?.getAttribute('data-file-surface-hex-loaded-bytes') || 0);
      return loaded > 0 && loaded <= 32 * 1024;
    }, null, { timeout: 30_000 });
    const initialHexBytes = Number(await hexEditor.getAttribute('data-file-surface-hex-loaded-bytes'));
    await page.locator('[data-file-surface-hex-load-more]').click();
    await page.waitForFunction((initial) => {
      const loaded = Number(document.querySelector('[data-file-surface-hex-editor]')?.getAttribute('data-file-surface-hex-loaded-bytes') || 0);
      return loaded > initial && loaded <= 64 * 1024;
    }, initialHexBytes, { timeout: 30_000 });

    await openFromExplorer(page, deletedPath, explorerDirectoryPath, { pinned: true });
    await expectMonacoFile(page, deletedPath, { readonly: false });
    await deleteFromExplorer(page, deletedPath, explorerDirectoryPath);
    await page.locator('[data-ide-editor-panel-state="warning"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-panel-title]', { hasText: '文件已删除' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-save-state]', { hasText: 'deleted' }).waitFor({ state: 'visible', timeout: 30_000 });

    const visibleTabs = await page.locator('[data-ide-editor-tab-path]').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('data-ide-editor-tab-path')));
    for (const expected of [textPath, readonlyPath, largePath, imagePath, binaryPath, deletedPath]) {
      if (!visibleTabs.includes(expected)) throw new Error(`expected tab for ${expected}; got ${visibleTabs.join(', ')}`);
    }
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      workbench: Boolean(document.querySelector('[data-ide-workbench]')),
      sidebarText: document.querySelector('[data-ide-sidebar]')?.textContent?.slice(0, 800),
      editorText: document.querySelector('[data-ide-editor-dock]')?.textContent?.slice(0, 1600),
      body: document.body.innerText.slice(0, 2200),
    })).catch(() => null);
    throw new Error(`${error instanceof Error ? error.stack || error.message : String(error)}\nState: ${JSON.stringify(state, null, 2)}\nConsole logs:\n${logs.join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await fs.chmod(path.join(root.absolutePath, readonlyPath), 0o644).catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
