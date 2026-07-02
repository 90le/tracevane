import { chromium } from '@playwright/test';

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

function nodeSelector(path) {
  return `[data-ide-explorer-node-path="${cssAttr(path)}"]`;
}

function tabSelector(path) {
  return `[data-ide-editor-tab-path="${cssAttr(path)}"]`;
}

async function createFile(rootId, path, content = '') {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name, content }),
  });
}

async function createDirectory(rootId, path) {
  const directoryPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const name = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath, name }),
  });
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
  const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`).catch(() => null);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => paths.some((path) => item.originalPath === path || String(item.originalPath || '').startsWith(`${path}/`)))
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, trashPaths }),
    }).catch(() => undefined);
  }
}

async function waitForNode(page, path) {
  await page.locator(nodeSelector(path)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expandDirectory(page, path) {
  await waitForNode(page, path);
  const row = page.locator(nodeSelector(path)).first();
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    nodeSelector(path),
    { timeout: 30_000 },
  );
}

async function revealPath(page, path) {
  const parts = String(path).split('/').filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    await expandDirectory(page, parts.slice(0, index).join('/'));
  }
  await waitForNode(page, path);
}

async function openFileFromExplorer(page, path) {
  await revealPath(page, path);
  await page.locator(nodeSelector(path)).first().click();
  await page.locator(tabSelector(path)).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[data-ide-editor-panel-path]`, { hasText: `path: ${path}` }).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function openContextMenu(page, path) {
  await revealPath(page, path);
  await page.locator(nodeSelector(path)).first().evaluate((node) => {
    const rect = node.getBoundingClientRect();
    node.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: Math.max(12, rect.left + 12),
      clientY: Math.max(12, rect.top + 12),
    }));
  });
  await page.getByRole('menu').waitFor({ state: 'visible', timeout: 10_000 });
}

async function renameViaExplorer(page, path, nextName, nextPath) {
  await openContextMenu(page, path);
  await page.getByRole('menuitem', { name: '重命名' }).click();
  const dialog = page.getByRole('dialog', { name: '重命名' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.locator('[data-ide-explorer-name-input]').fill(nextName);
  await dialog.getByRole('button', { name: '重命名' }).click();
  await page.locator(tabSelector(nextPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
  await waitForNode(page, nextPath);
}

async function moveViaExplorer(page, path, destinationDirectoryPath, nextName, nextPath) {
  await openContextMenu(page, path);
  await page.getByRole('menuitem', { name: '移动到…' }).click();
  const dialog = page.getByRole('dialog', { name: '移动到…' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.locator('[data-ide-explorer-transfer-destination]').fill(destinationDirectoryPath);
  await dialog.locator('[data-ide-explorer-transfer-name]').fill(nextName);
  await dialog.getByRole('button', { name: '移动' }).click();
  await page.locator(tabSelector(nextPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function deleteViaExplorer(page, path) {
  await openContextMenu(page, path);
  await page.getByRole('menuitem', { name: '删除…' }).click();
  const dialog = page.getByRole('dialog', { name: '删除项目' });
  await dialog.waitFor({ state: 'visible', timeout: 10_000 });
  await dialog.locator('[data-ide-explorer-delete-confirm-input]').fill('DELETE');
  await dialog.getByRole('button', { name: '移入回收站' }).click();
  await page.waitForFunction(
    (targetPath) => [...document.querySelectorAll('[data-ide-editor-panel-path]')].some((node) => {
      const card = node.closest('[data-ide-editor-panel]');
      return (node.textContent || '').includes(`path: ${targetPath}`) && (card?.textContent || '').includes('deleted');
    }),
    path,
    { timeout: 30_000 },
  );
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file root is available for IDE smoke');

  const prefix = `tracevane-ide-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const firstPath = `tmp/${prefix}-a.txt`;
  const renamedPath = `tmp/${prefix}-a-renamed.txt`;
  const secondPath = `tmp/${prefix}-b.txt`;
  const moveDir = `tmp/${prefix}-target`;
  const movedPath = `${moveDir}/${prefix}-b-moved.txt`;
  const cleanupPaths = [firstPath, renamedPath, secondPath, moveDir];

  await cleanup(rootId, cleanupPaths);
  await createFile(rootId, firstPath, 'ide smoke first\n');
  await createFile(rootId, secondPath, 'ide smoke second\n');
  await createDirectory(rootId, moveDir);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-activity-bar]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-sidebar]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-bar]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-sidebar-resize-handle]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel-resize-handle]').waitFor({ state: 'visible', timeout: 30_000 });

    const explorerActivity = page.locator('[data-ide-activity-bar]').getByRole('button', { name: 'Explorer' });
    await explorerActivity.click();
    await page.locator('[data-ide-sidebar-hidden]').waitFor({ state: 'attached', timeout: 30_000 });
    await explorerActivity.click();
    await page.locator('[data-ide-sidebar]').waitFor({ state: 'visible', timeout: 30_000 });

    await openFileFromExplorer(page, firstPath);
    await renameViaExplorer(page, firstPath, `${prefix}-a-renamed.txt`, renamedPath);

    await openFileFromExplorer(page, secondPath);
    await moveViaExplorer(page, secondPath, moveDir, `${prefix}-b-moved.txt`, movedPath);
    await deleteViaExplorer(page, movedPath);

    await page.locator('[data-ide-editor-split-right]').click();
    await page.locator('[data-ide-editor-panel-title]', { hasText: 'Split Right' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-split-down]').click();
    await page.locator('[data-ide-editor-panel-title]', { hasText: 'Split Down' }).waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByRole('button', { name: '重置布局' }).click();
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-dock]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-editor-watermark]').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      workbench: Boolean(document.querySelector('[data-ide-workbench]')),
      sidebarText: document.querySelector('[data-ide-sidebar]')?.textContent?.slice(0, 600),
      editorText: document.querySelector('[data-ide-editor-dock]')?.textContent?.slice(0, 600),
      panelText: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 600),
      body: document.body.innerText.slice(0, 1600),
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}\nlogs=${logs.slice(-80).join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, cleanupPaths);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
