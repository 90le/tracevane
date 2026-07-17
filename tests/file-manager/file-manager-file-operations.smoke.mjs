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

function entrySelector(path) {
  return `[data-file-manager-entry-path="${cssAttr(path)}"]`;
}

function trashItemSelector(trashPath) {
  return `[data-file-manager-trash-item="${cssAttr(trashPath)}"]`;
}

async function cleanup(rootId, smokeDir) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [smokeDir], permanent: true }),
  }).catch(() => undefined);
  const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`).catch(() => null);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => String(item.originalPath || '').startsWith(`${smokeDir}/`) || item.originalPath === smokeDir)
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, trashPaths }),
    }).catch(() => undefined);
  }
}

async function ensureSmokeDir(rootId, smokeDir) {
  await cleanup(rootId, smokeDir);
  const parentPath = smokeDir.includes('/') ? smokeDir.slice(0, smokeDir.lastIndexOf('/')) : '';
  const name = smokeDir.includes('/') ? smokeDir.slice(smokeDir.lastIndexOf('/') + 1) : smokeDir;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: parentPath, name }),
  });
}

async function waitForEntry(page, path) {
  await page.waitForSelector(entrySelector(path), { timeout: 30_000 }).catch(async (error) => {
    const state = await page.evaluate(() => ({
      displayPaths: [...document.querySelectorAll('[data-file-manager-display-path]')].map((node) => node.getAttribute('data-file-manager-display-path')),
      listSelectionCount: document.querySelector('[data-file-manager-list]')?.getAttribute('data-file-manager-selection-count'),
      entries: [...document.querySelectorAll('[data-file-manager-entry-path]')].slice(0, 20).map((node) => node.getAttribute('data-file-manager-entry-path')),
      trashVisible: Boolean(document.querySelector('[data-file-manager-trash-manager]')),
      trashItems: [...document.querySelectorAll('[data-file-manager-trash-item]')].slice(0, 10).map((node) => node.getAttribute('data-file-manager-trash-item')),
      body: document.body.innerText.slice(0, 1200),
    }));
    throw new Error(`Entry ${path} was not visible: ${error.message}; state=${JSON.stringify(state)}`);
  });
}

async function waitForEntryApi(rootId, directoryPath, path) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const data = await api(`/api/files/browse?${new URLSearchParams({ rootId, path: directoryPath }).toString()}`);
    if ((data.entries ?? []).some((entry) => entry.path === path)) return;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`API browse did not expose ${path} under ${directoryPath}`);
}

async function waitForEntryApiPath(rootId, path) {
  const parentPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  await waitForEntryApi(rootId, parentPath, path);
}

async function waitForNoEntry(page, path) {
  await page.waitForFunction(
    (selector) => !document.querySelector(selector),
    entrySelector(path),
    { timeout: 30_000 },
  );
}

async function jumpToPath(page, directoryPath) {
  const visiblePathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])');
  if (!(await visiblePathInput.count())) {
    await page.locator('[data-file-manager-path-enter-edit]').first().click();
  }
  const pathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])').first();
  await pathInput.waitFor({ state: 'visible', timeout: 10_000 });
  await pathInput.fill(directoryPath);
  await pathInput.press('Enter');
  await page.waitForFunction(
    (path) => [...document.querySelectorAll('[data-file-manager-display-path]')].some((node) => (node.getAttribute('data-file-manager-display-path') || '').endsWith(path ? `/${path}` : '/')),
    directoryPath,
    { timeout: 30_000 },
  ).catch(async (error) => {
    const state = await page.evaluate(() => ({
      input: document.querySelector('input[aria-label=\"编辑文件夹路径，按 Enter 跳转\"]')?.value,
      displayPaths: [...document.querySelectorAll('[data-file-manager-display-path]')].map((node) => node.getAttribute('data-file-manager-display-path')),
      error: document.querySelector('[data-file-manager-path-error-recovery]')?.textContent,
      entries: [...document.querySelectorAll('[data-file-manager-entry-path]')].slice(0, 8).map((node) => node.getAttribute('data-file-manager-entry-path')),
      body: document.body.textContent?.slice(0, 800),
    }));
    throw new Error(`jumpToPath(${directoryPath}) failed: ${error.message}; state=${JSON.stringify(state)}`);
  });
}

async function assertContextMenuStaysInViewport(page, path) {
  await waitForEntry(page, path);
  await page.locator(entrySelector(path)).first().evaluate((node) => {
    node.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 120,
        clientY: window.innerHeight - 4,
      }),
    );
  });
  const menu = page.locator('[data-file-manager-actions-context-menu]').first();
  await menu.waitFor({ state: 'visible', timeout: 10_000 });
  const metrics = await menu.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    node.scrollTop = node.scrollHeight;
    const deleteItem = [...node.querySelectorAll('[role="menuitem"]')].find((item) =>
      (item.textContent || '').includes('删除'),
    );
    const deleteRect = deleteItem?.getBoundingClientRect();
    return {
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        height: rect.height,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      scrollHeight: node.scrollHeight,
      deleteBottom: deleteRect?.bottom ?? null,
    };
  });
  if (
    metrics.rect.bottom > metrics.viewport.height + 1 ||
    metrics.rect.top < -1 ||
    metrics.rect.left < -1 ||
    metrics.rect.right > metrics.viewport.width + 1
  ) {
    throw new Error(`Context menu escaped viewport near bottom edge: ${JSON.stringify(metrics)}`);
  }
  if (
    metrics.scrollHeight > metrics.rect.height + 1 &&
    !['auto', 'scroll'].includes(metrics.overflowY)
  ) {
    throw new Error(`Overflowing context menu is not scrollable: ${JSON.stringify(metrics)}`);
  }
  if (metrics.deleteBottom !== null && metrics.deleteBottom > metrics.viewport.height + 1) {
    throw new Error(`Context menu delete action remains clipped after scrolling: ${JSON.stringify(metrics)}`);
  }
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached', timeout: 10_000 });
}

async function clickFileManagerAction(page, label) {
  await page.locator('[data-file-manager-actions-menu]').first().evaluate((node) => {
    node.open = true;
    node.dispatchEvent(new ToggleEvent('toggle'));
  });
  const menu = page.locator('[data-file-manager-actions-popover]').first();
  await menu.getByRole('button', { name: label }).click({ force: true });
}

async function fillDialogInput(page, title, value) {
  const dialog = page.getByRole('dialog', { name: title });
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.locator('input').first().fill(value);
  return dialog;
}

async function createFileViaUi(page, name) {
  await clickFileManagerAction(page, '新建文件');
  const dialog = await fillDialogInput(page, '新建文件', name);
  await dialog.getByRole('button', { name: '创建' }).click();
}

async function createDirectoryViaUi(page, name) {
  await clickFileManagerAction(page, '新建目录');
  const dialog = await fillDialogInput(page, '新建目录', name);
  await dialog.getByRole('button', { name: '创建' }).click();
}

async function selectEntry(page, path) {
  await waitForEntry(page, path);
  await page.locator(`${entrySelector(path)} input[type="checkbox"]`).first().check({ force: true });
  await page.waitForFunction(
    () => Number(document.querySelector('[data-file-manager-list]')?.getAttribute('data-file-manager-selection-count') || 0) > 0,
    { timeout: 10_000 },
  );
}

async function clickBulkAction(page, selector) {
  await page.locator('[data-file-manager-bulk-desktop]').waitFor({ state: 'visible', timeout: 10_000 });
  const button = page.locator(`[data-file-manager-bulk-desktop] ${selector}`).first();
  await button.waitFor({ state: 'visible', timeout: 10_000 });
  await button.evaluate((node) => node.click());
}

async function renameSelectedViaUi(page, nextName) {
  await clickBulkAction(page, '[data-file-manager-bulk-primary-action="rename"]');
  const dialog = await fillDialogInput(page, '重命名项目', nextName);
  await dialog.getByRole('button', { name: '确认重命名' }).click();
}

async function transferSelectedViaUi(page, action, destinationPath) {
  await clickBulkAction(page, `[data-file-manager-bulk-primary-action="${action}"]`);
  const title = action === 'copy' ? '复制所选项目' : '移动所选项目';
  const button = action === 'copy' ? '开始复制' : '开始移动';
  const dialog = await fillDialogInput(page, title, destinationPath);
  await dialog.getByText('服务端预检').waitFor({ timeout: 15_000 });
  await dialog.getByText('就绪').first().waitFor({ timeout: 15_000 });
  await dialog.getByRole('button', { name: button }).click();
}

async function deleteSelectedViaUi(page) {
  await clickBulkAction(page, '[data-file-manager-bulk-danger-action="delete"]');
  const dialog = page.getByRole('dialog', { name: '删除所选项目' });
  await dialog.waitFor({ timeout: 15_000 });
  await dialog.getByPlaceholder('DELETE').fill('DELETE');
  await dialog.getByRole('button', { name: '移入回收站' }).click();
}

async function findTrashItem(rootId, originalPath) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`);
    const item = (trash.items ?? []).find((candidate) => candidate.originalPath === originalPath);
    if (item) return item;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Trash item not found for ${originalPath}`);
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = `tmp/tracevane-file-ops-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceName = 'ops-source.txt';
  const renamedName = 'ops-renamed.txt';
  const copyTargetName = 'ops-copy-target';
  const moveTargetName = 'ops-move-target';
  const sourcePath = `${smokeDir}/${sourceName}`;
  const renamedPath = `${smokeDir}/${renamedName}`;
  const copiedPath = `${smokeDir}/${copyTargetName}/${renamedName}`;
  const movedPath = `${smokeDir}/${moveTargetName}/${renamedName}`;

  await ensureSmokeDir(rootId, smokeDir);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-file-manager-shell]').waitFor({ timeout: 30_000 });
    await jumpToPath(page, smokeDir);

    await createFileViaUi(page, sourceName);
    await waitForEntry(page, sourcePath);
    await assertContextMenuStaysInViewport(page, sourcePath);

    await createDirectoryViaUi(page, copyTargetName);
    await waitForEntry(page, `${smokeDir}/${copyTargetName}`);
    await createDirectoryViaUi(page, moveTargetName);
    await waitForEntry(page, `${smokeDir}/${moveTargetName}`);

    await selectEntry(page, sourcePath);
    await renameSelectedViaUi(page, renamedName);
    await waitForEntry(page, renamedPath);
    await waitForNoEntry(page, sourcePath);

    await selectEntry(page, renamedPath);
    await transferSelectedViaUi(page, 'copy', `${smokeDir}/${copyTargetName}`);
    await jumpToPath(page, `${smokeDir}/${copyTargetName}`);
    await waitForEntry(page, copiedPath);

    await waitForEntryApi(rootId, smokeDir, renamedPath);
    await jumpToPath(page, smokeDir);
    await waitForEntry(page, renamedPath);
    await selectEntry(page, renamedPath);
    await transferSelectedViaUi(page, 'move', `${smokeDir}/${moveTargetName}`);
    await waitForNoEntry(page, renamedPath);
    await jumpToPath(page, `${smokeDir}/${moveTargetName}`);
    await waitForEntry(page, movedPath);

    await selectEntry(page, movedPath);
    await deleteSelectedViaUi(page);
    await waitForNoEntry(page, movedPath);
    const trashItem = await findTrashItem(rootId, movedPath);

    await page.getByRole('button', { name: /回收站/ }).first().click();
    await page.locator('[data-file-manager-trash-manager]').waitFor({ timeout: 30_000 });
    await page.locator(trashItemSelector(trashItem.trashPath)).waitFor({ timeout: 30_000 });
    await page.locator(`${trashItemSelector(trashItem.trashPath)} [data-file-manager-trash-restore]`).click();
    await waitForEntryApiPath(rootId, movedPath);

    await page.locator('[data-file-manager-view-switcher]').getByRole('tab', { name: '文件' }).click();
    await jumpToPath(page, `${smokeDir}/${moveTargetName}`);
    await page.getByRole('button', { name: '刷新文件列表' }).click();
    await waitForEntry(page, movedPath);

    const finalFiles = await api(`/api/files/browse?${new URLSearchParams({ rootId, path: `${smokeDir}/${moveTargetName}` }).toString()}`);
    if (!(finalFiles.entries ?? []).some((entry) => entry.path === movedPath)) {
      throw new Error(`Restored moved file not found in API browse result for ${movedPath}`);
    }
    const copyFiles = await api(`/api/files/browse?${new URLSearchParams({ rootId, path: `${smokeDir}/${copyTargetName}` }).toString()}`);
    if (!(copyFiles.entries ?? []).some((entry) => entry.path === copiedPath)) {
      throw new Error(`Copied file not found in API browse result for ${copiedPath}`);
    }

    const operationText = await page.locator('[data-file-manager-operation-history-desktop]').textContent().catch(() => '');
    for (const expected of ['新建文件', '新建目录', '重命名项目', '复制所选项目', '移动所选项目', '删除所选项目']) {
      if (!operationText.includes(expected)) throw new Error(`Operation history is missing ${expected}: ${operationText}`);
    }
    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`File operations smoke emitted fatal logs:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, smokeDir);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
