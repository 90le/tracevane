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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    workbenchWidth: document.querySelector('[data-ide-workbench]')?.scrollWidth ?? 0,
  }));
  const overflow = Math.max(metrics.documentWidth, metrics.bodyWidth, metrics.workbenchWidth) - metrics.viewport;
  if (overflow > 8) throw new Error(`${label} has horizontal overflow ${overflow}px: ${JSON.stringify(metrics)}`);
}

async function assertWithinViewport(page, selector, label) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${label} is not visible`);
  const viewport = page.viewportSize();
  if (!viewport) return;
  if (box.x < -1 || box.y < -1 || box.x + box.width > viewport.width + 1 || box.y + box.height > viewport.height + 1) {
    throw new Error(`${label} exceeds viewport: ${JSON.stringify({ box, viewport })}`);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE responsive smoke');

  const prefix = `tracevane-ide-responsive-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const smokeParent = repoParentRelativePath ? `${repoParentRelativePath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const filePath = `${smokeDir}/responsive-mainline.ts`;
  const needle = `responsive_mainline_${Date.now()}`;
  const layout = createDefaultWorkbenchLayout(smokeDir);

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, filePath, `export const marker = "${needle}";\n`);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout, terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await page.addInitScript(({ key, layout }) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(layout));
      window.localStorage.removeItem('tracevane:ide-workbench:editor-preferences:v1');
    } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-workbench-narrow="true"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-sidebar-shell][data-ide-sidebar-overlay="true"]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-explorer]').waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'initial mobile workbench');
    await assertWithinViewport(page, '[data-ide-sidebar-shell]', 'mobile sidebar overlay');

    await page.locator(nodeSelector(filePath)).first().click();
    await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(filePath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile editor after explorer open');

    await page.getByRole('button', { name: 'Explorer' }).click();
    await page.waitForFunction(() => document.querySelector('[data-ide-sidebar-shell]')?.getAttribute('data-ide-sidebar-overlay') === 'false', null, { timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile editor with sidebar collapsed');

    await page.getByRole('button', { name: 'Search' }).click();
    await page.locator('[data-ide-search-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-search-input]').fill(needle);
    await page.locator('[data-ide-search-submit]').click();
    await page.locator(`[data-ide-search-result-path="${cssAttr(filePath)}"]`).first().waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile search view');

    await page.getByRole('button', { name: 'Source Control' }).click();
    await page.locator('[data-ide-source-control-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile source control view');

    await page.getByRole('button', { name: 'Run and Debug' }).click();
    await page.locator('[data-ide-debug-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile run/debug view');

    await page.mouse.click(370, 120);
    await page.waitForFunction(() => document.querySelector('[data-ide-sidebar-shell]')?.getAttribute('data-ide-sidebar-overlay') === 'false', null, { timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel] button', { hasText: 'Problems' }).click();
    await page.locator('[data-ide-problems-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel] button', { hasText: 'Output' }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel] button', { hasText: 'Terminal' }).click();
    await page.locator('[data-ide-terminal-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await assertNoHorizontalOverflow(page, 'mobile panel tabs');
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
