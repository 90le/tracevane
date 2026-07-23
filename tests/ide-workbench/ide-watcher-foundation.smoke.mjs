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
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 320 },
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function absolutePathFromRoot(rootAbsolutePath, targetRelativePath) {
  return path.resolve(rootAbsolutePath, targetRelativePath || '.');
}

async function openFile(page, targetPath) {
  await page.locator(nodeSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
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

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE watcher smoke');

  const prefix = `tracevane-ide-watcher-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const smokeDir = repoParentRelativePath ? `${repoParentRelativePath}/.${prefix}` : `.${prefix}`;
  const cleanPath = `${smokeDir}/clean.ts`;
  const dirtyPath = `${smokeDir}/dirty.ts`;
  const cleanAbsolutePath = absolutePathFromRoot(root.absolutePath, cleanPath);
  const dirtyAbsolutePath = absolutePathFromRoot(root.absolutePath, dirtyPath);

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, cleanPath, 'export const clean = 1;\n');
  await createFile(rootId, dirtyPath, 'export const dirty = 1;\n');

  const layout = createDefaultWorkbenchLayout(smokeDir);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1360, height: 840 } });
  await page.addInitScript(({ key, layout }) => {
    window.__TRACEVANE_IDE_WATCH_POLL_MS = 200;
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForResponse((response) => response.url().includes('/api/files/watch/snapshot') && response.ok(), { timeout: 30_000 });

    await openFile(page, cleanPath);
    await fs.writeFile(cleanAbsolutePath, 'export const clean = 2;\n', 'utf8');
    await page.locator(`${tabSelector(cleanPath)}[data-ide-editor-tab-external-state="changed"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-external-banner][data-ide-editor-external-state="changed"]').first().waitFor({ state: 'visible', timeout: 30_000 });

    await openFile(page, dirtyPath);
    await replaceEditorContent(page, dirtyPath, 'export const dirty = "unsaved watcher text";\n');
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute('data-ide-editor-tab-dirty') === 'true',
      tabSelector(dirtyPath),
      { timeout: 30_000 },
    );
    await fs.unlink(dirtyAbsolutePath);
    await page.locator(`${tabSelector(dirtyPath)}[data-ide-editor-tab-external-state="deleted"][data-ide-editor-tab-dirty="true"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-external-banner][data-ide-editor-external-state="deleted"]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(dirtyPath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
    const severe = logs.filter((line) => line.includes('[pageerror]'));
    if (severe.length) {
      console.warn(severe.join('\n'));
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
