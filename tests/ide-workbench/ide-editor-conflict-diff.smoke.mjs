import { chromium } from '@playwright/test';
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 220,
      bottomSize: 220, rightWidth: 420, maximized: false, activePanelId: 'terminal',
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

async function writeFile(rootId, targetPath, content, force = true) {
  await api('/api/files/content', { method: 'PUT', body: JSON.stringify({ rootId, path: targetPath, content, force }) });
}

async function readFileContent(rootId, targetPath) {
  const data = await api(`/api/files/read?${new URLSearchParams({ rootId, path: targetPath }).toString()}`);
  return data.content ?? '';
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

async function revealPath(page, targetPath, basePath = '') {
  const parts = normalizePortablePath(targetPath).split('/').filter(Boolean);
  const baseParts = normalizePortablePath(basePath).split('/').filter(Boolean);
  const baseMatches = baseParts.length > 0 && baseParts.every((part, index) => parts[index] === part);
  const startIndex = baseMatches ? baseParts.length + 1 : 1;
  for (let index = startIndex; index < parts.length; index += 1) await expandDirectory(page, parts.slice(0, index).join('/'));
  await waitForNode(page, targetPath);
}

async function openFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().click();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function focusMonaco(page, targetPath) {
  const panel = page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(targetPath)}"]`).first();
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  const viewLines = panel.locator('.monaco-editor .view-lines').first();
  await viewLines.waitFor({ state: 'visible', timeout: 30_000 });
  await viewLines.click({ position: { x: 24, y: 12 } });
}

async function replaceEditorContent(page, targetPath, content) {
  await focusMonaco(page, targetPath);
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(content);
}

async function waitForTabDirty(page, targetPath, dirty) {
  await page.waitForFunction(
    ({ selector, dirty }) => document.querySelector(selector)?.getAttribute('data-ide-editor-tab-dirty') === (dirty ? 'true' : 'false'),
    { selector: tabSelector(targetPath), dirty },
    { timeout: 30_000 },
  );
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE conflict smoke');

  const prefix = `tracevane-ide-editor-conflict-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeDir = explorerDirectoryPath ? `${explorerDirectoryPath}/.${prefix}` : `.${prefix}`;
  const filePath = `${smokeDir}/conflict.ts`;
  const initialContent = 'export const value = "initial";\n';
  const externalContent = 'export const value = "external disk";\n';
  const editorContent = 'export const value = "local editor";\n';

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, filePath, initialContent);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, filePath, explorerDirectoryPath);
    await replaceEditorContent(page, filePath, editorContent);
    await waitForTabDirty(page, filePath, true);

    await writeFile(rootId, filePath, externalContent, true);
    await page.keyboard.press('Control+S');

    await page.locator('[data-ide-editor-conflict-dialog]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-conflict-diff] [data-monaco-diff-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    const labels = await page.locator('[data-monaco-diff-panel]').first().innerText();
    if (!labels.includes('磁盘当前版本') || !labels.includes('当前编辑器内容')) throw new Error(`Diff labels missing: ${labels}`);

    const afterBlockedSave = await readFileContent(rootId, filePath);
    if (afterBlockedSave !== externalContent) throw new Error(`conflict save should not overwrite disk: ${JSON.stringify(afterBlockedSave)}`);

    await page.locator('[data-ide-editor-conflict-overwrite]').click();
    await page.locator('[data-ide-editor-conflict-dialog]').waitFor({ state: 'detached', timeout: 30_000 });
    await waitForTabDirty(page, filePath, false);
    const afterOverwrite = await readFileContent(rootId, filePath);
    if (afterOverwrite !== editorContent) throw new Error(`overwrite content mismatch: ${JSON.stringify(afterOverwrite)}`);
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      workbench: Boolean(document.querySelector('[data-ide-workbench]')),
      editorText: document.querySelector('[data-ide-editor-dock]')?.textContent?.slice(0, 1400),
      conflictText: document.querySelector('[data-ide-editor-conflict-dialog]')?.textContent?.slice(0, 1400),
      body: document.body.innerText.slice(0, 1800),
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
