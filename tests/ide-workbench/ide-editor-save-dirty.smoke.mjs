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

async function readFileContent(rootId, targetPath) {
  const data = await api(`/api/files/read?${new URLSearchParams({ rootId, path: targetPath }).toString()}`);
  return data.content ?? '';
}

async function waitForTabDirty(page, targetPath, dirty) {
  await page.waitForFunction(
    ({ selector, dirty }) => document.querySelector(selector)?.getAttribute('data-ide-editor-tab-dirty') === (dirty ? 'true' : 'false'),
    { selector: tabSelector(targetPath), dirty },
    { timeout: 30_000 },
  );
}

async function focusMonaco(page, targetPath) {
  const panel = page.locator('[data-ide-monaco-editor-panel][data-ide-editor-file-path="' + cssAttr(targetPath) + '"]').first();
  await panel.waitFor({ state: 'visible', timeout: 30_000 });
  const viewLines = panel.locator('.monaco-editor .view-lines').first();
  await viewLines.waitFor({ state: 'visible', timeout: 30_000 });
  await viewLines.click({ position: { x: 24, y: 12 } });
}



async function waitPanelVisible(page, targetPath) {
  await page.locator('[data-ide-monaco-editor-panel][data-ide-editor-file-path="' + cssAttr(targetPath) + '"]').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function replaceEditorContent(page, targetPath, content) {
  await focusMonaco(page, targetPath);
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(content);
}

async function openTabMenu(page, targetPath) {
  const tab = page.locator(tabSelector(targetPath)).first();
  await tab.waitFor({ state: 'visible', timeout: 30_000 });
  await tab.click({ button: 'right' });
  await page.locator('[data-ide-editor-tab-context-menu]').waitFor({ state: 'visible', timeout: 10_000 });
}

async function clickTabMenuItem(page, item) {
  await page.locator(`[data-ide-editor-tab-menu-item="${item}"]`).click();
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE editor smoke');

  const prefix = `tracevane-ide-editor-dirty-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeDir = explorerDirectoryPath ? `${explorerDirectoryPath}/.${prefix}` : `.${prefix}`;
  const firstPath = `${smokeDir}/first.ts`;
  const secondPath = `${smokeDir}/second.ts`;
  const thirdPath = `${smokeDir}/third.ts`;
  const savedContent = 'export const saved = "from ide dirty smoke";\n';
  const unsavedContent = 'export const unsaved = "discard me";\n';

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, firstPath, 'export const initial = 1;\n');
  await createFile(rootId, secondPath, 'export const second = 2;\n');
  await createFile(rootId, thirdPath, 'export const third = 3;\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(explorerDirectoryPath) });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, firstPath, explorerDirectoryPath);
    await page.locator(`${tabSelector(firstPath)} [data-ide-editor-tab-preview-icon]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`${tabSelector(firstPath)} [data-ide-editor-tab-close]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-action-menu-trigger]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-action-menu-trigger]').first().click();
    await page.locator('[data-ide-editor-action-menu]').first().waitFor({ state: 'visible', timeout: 10_000 });
    for (const item of ['action-save-current', 'action-close-saved', 'action-close-current', 'action-close-others', 'action-close-all', 'action-split-right', 'action-split-down']) {
      await page.locator(`[data-ide-editor-tab-menu-item="${item}"]`).waitFor({ state: 'attached', timeout: 10_000 });
    }
    await page.locator('[data-ide-editor-action-menu-trigger]').first().click();
    await page.locator('[data-ide-editor-action-menu]').first().waitFor({ state: 'detached', timeout: 10_000 });
    const firstTabInitialText = await page.locator(tabSelector(firstPath)).first().innerText();
    if (/\b(pinned|preview)\b/i.test(firstTabInitialText)) throw new Error(`tab should not render mode text: ${firstTabInitialText}`);
    await replaceEditorContent(page, firstPath, savedContent);
    await waitForTabDirty(page, firstPath, true);
    await page.keyboard.press('Control+S');
    await waitForTabDirty(page, firstPath, false);
    const persisted = await readFileContent(rootId, firstPath);
    if (persisted !== savedContent) throw new Error(`saved content mismatch: ${JSON.stringify(persisted)}`);

    await replaceEditorContent(page, firstPath, unsavedContent);
    await waitForTabDirty(page, firstPath, true);

    await openFromExplorer(page, secondPath, explorerDirectoryPath);
    await page.locator(tabSelector(firstPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(secondPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(firstPath)).first().dblclick();

    await openFromExplorer(page, thirdPath, explorerDirectoryPath);
    await page.locator(tabSelector(firstPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(secondPath)).first().waitFor({ state: 'detached', timeout: 30_000 });
    await page.locator(tabSelector(thirdPath)).first().waitFor({ state: 'visible', timeout: 30_000 });

    await openFromExplorer(page, secondPath, explorerDirectoryPath);
    await page.locator(tabSelector(firstPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(secondPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(tabSelector(firstPath)).first().click();
    await waitPanelVisible(page, firstPath);
    await page.locator(tabSelector(secondPath)).first().click();
    await waitPanelVisible(page, secondPath);

    await openTabMenu(page, firstPath);
    for (const item of ['save', 'close', 'close-others', 'close-right', 'close-saved', 'close-all', 'copy-path', 'copy-relative-path', 'pin', 'split-right', 'split-down']) {
      await page.locator(`[data-ide-editor-tab-menu-item="${item}"]`).waitFor({ state: 'attached', timeout: 10_000 });
    }
    await clickTabMenuItem(page, 'close');
    await page.locator('[data-ide-editor-close-confirm]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-editor-close-cancel]').click();
    await page.locator(tabSelector(firstPath)).first().waitFor({ state: 'visible', timeout: 30_000 });

    await openTabMenu(page, firstPath);
    await clickTabMenuItem(page, 'close');
    await page.locator('[data-ide-editor-close-confirm]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.locator('[data-ide-editor-close-discard]').click();
    await page.locator(tabSelector(firstPath)).first().waitFor({ state: 'detached', timeout: 30_000 });
    await page.locator(tabSelector(secondPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    const secondTabText = await page.locator(tabSelector(secondPath)).first().innerText();
    if (/\b(pinned|preview)\b/i.test(secondTabText)) throw new Error(`tab should not render mode text: ${secondTabText}`);
    await page.locator(`${tabSelector(secondPath)} [data-ide-editor-tab-close]`).first().click();
    await page.locator(tabSelector(secondPath)).first().waitFor({ state: 'detached', timeout: 30_000 });
    const afterDiscard = await readFileContent(rootId, firstPath);
    if (afterDiscard !== savedContent) throw new Error(`discard unexpectedly wrote dirty content: ${JSON.stringify(afterDiscard)}`);
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
