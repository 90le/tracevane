import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';
const FAVORITES_KEY = 'tracevane:file-manager:favorite-paths';

const favoriteSeed = [
  {
    id: 'bookmark:alpha',
    type: 'bookmark',
    title: 'Alpha',
    location: { rootId: 'openclaw-root', directoryPath: 'alpha', label: '/alpha' },
  },
  {
    id: 'bookmark:beta',
    type: 'bookmark',
    title: 'Beta',
    location: { rootId: 'openclaw-root', directoryPath: 'beta', label: '/beta' },
  },
  {
    id: 'bookmark:folder',
    type: 'folder',
    title: 'Folder',
    children: [
      {
        id: 'bookmark:nested',
        type: 'bookmark',
        title: 'Nested',
        location: { rootId: 'openclaw-root', directoryPath: 'nested', label: '/nested' },
      },
    ],
  },
];

function failOnFatalLogs(logs, scope) {
  const fatal = logs.filter(
    (line) =>
      line.includes('[pageerror]') ||
      line.includes('Invalid hook call') ||
      line.includes('Cannot read properties of null') ||
      line.includes('Cannot read properties of undefined'),
  );
  if (fatal.length) throw new Error(`${scope} emitted fatal browser logs:\n${fatal.join('\n')}`);
}

async function favoriteTitles(page) {
  return page.evaluate((key) => {
    const tree = JSON.parse(window.localStorage.getItem(key) || '[]');
    return tree.map((item) => ({
      id: item.id,
      title: item.title,
      children: Array.isArray(item.children) ? item.children.map((child) => child.title) : [],
    }));
  }, FAVORITES_KEY);
}

async function openFavorites(page) {
  const isOpen = await page.locator('[data-file-manager-favorites-manage]').evaluate((element) => element.open);
  if (!isOpen) await page.locator('[data-file-manager-favorites-manage] summary').click();
  await page.locator('[data-file-manager-bookmark-manager-tree]').waitFor({ timeout: 10_000 });
}

async function assertWithinViewport(page, selector, label) {
  const result = await page.locator(selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const width = window.innerWidth;
    const height = window.innerHeight;
    return {
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      width,
      height,
      ok:
        rect.left >= -1 &&
        rect.top >= -1 &&
        rect.right <= width + 1 &&
        rect.bottom <= height + 1,
    };
  });
  if (!result.ok) throw new Error(`${label} overflows viewport: ${JSON.stringify(result)}`);
}

async function dragRow(page, sourceId, targetId, targetRatioY) {
  const sourceHandle = page.locator(`[data-file-manager-bookmark-id="${sourceId}"] [data-file-manager-bookmark-drag-handle]`);
  const targetRow = page.locator(`[data-file-manager-bookmark-id="${targetId}"]`);
  await sourceHandle.waitFor({ timeout: 10_000 });
  await targetRow.waitFor({ timeout: 10_000 });
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetRow.boundingBox();
  if (!sourceBox || !targetBox) throw new Error(`Missing drag geometry for ${sourceId} -> ${targetId}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 8, sourceBox.y + sourceBox.height / 2 + 8, { steps: 3 });
  await page.mouse.move(targetBox.x + Math.min(96, Math.max(16, targetBox.width / 2)), targetBox.y + targetBox.height * targetRatioY, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(150);
}

async function abandonDrag(page, sourceId) {
  const sourceHandle = page.locator(`[data-file-manager-bookmark-id="${sourceId}"] [data-file-manager-bookmark-drag-handle]`);
  await sourceHandle.waitFor({ timeout: 10_000 });
  const sourceBox = await sourceHandle.boundingBox();
  if (!sourceBox) throw new Error(`Missing drag geometry for ${sourceId}`);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 16, sourceBox.y + sourceBox.height / 2 + 16, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  const previewCount = await page.locator('[data-file-manager-bookmark-drag-preview]').count();
  if (previewCount !== 0) throw new Error('Drag preview remained after abandoning favorite drag');
}

async function moveFromContextDialog(page, sourceId, targetName) {
  await page.locator(`[data-file-manager-bookmark-id="${sourceId}"] [data-file-manager-bookmark-more]`).click();
  const menu = page.locator('[data-file-manager-bookmark-context-menu]');
  await menu.getByText('移动到…').click();
  const dialog = page.locator('[data-file-manager-bookmark-move-dialog]');
  await dialog.waitFor({ timeout: 10_000 });
  await dialog.getByText(targetName, { exact: true }).click();
  await dialog.waitFor({ state: 'detached', timeout: 10_000 });
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  const dialogs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  page.on('dialog', async (dialog) => {
    dialogs.push(`${dialog.type()}: ${dialog.message()}`);
    await dialog.dismiss().catch(() => undefined);
  });

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ key, seed }) => {
      window.localStorage.setItem(key, JSON.stringify(seed));
    }, { key: FAVORITES_KEY, seed: favoriteSeed });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-file-manager-shell]').waitFor({ timeout: 30_000 });
    await openFavorites(page);

    await abandonDrag(page, 'bookmark:alpha');

    await dragRow(page, 'bookmark:alpha', 'bookmark:beta', 0.9);
    let titles = await favoriteTitles(page);
    if (titles.map((item) => item.title).join(',') !== 'Beta,Alpha,Folder') {
      throw new Error(`Dragging Alpha after Beta did not persist order: ${JSON.stringify(titles)}`);
    }

    await dragRow(page, 'bookmark:alpha', 'bookmark:folder', 0.5);
    titles = await favoriteTitles(page);
    const folder = titles.find((item) => item.id === 'bookmark:folder');
    if (!folder?.children.includes('Alpha')) {
      throw new Error(`Dragging Alpha into Folder did not persist nesting: ${JSON.stringify(titles)}`);
    }

    await moveFromContextDialog(page, 'bookmark:alpha', '根层级');
    titles = await favoriteTitles(page);
    if (titles.at(-1)?.title !== 'Alpha' || titles.find((item) => item.id === 'bookmark:folder')?.children.includes('Alpha')) {
      throw new Error(`Move out to root failed: ${JSON.stringify(titles)}`);
    }

    await moveFromContextDialog(page, 'bookmark:alpha', 'Folder');
    titles = await favoriteTitles(page);
    if (!titles.find((item) => item.id === 'bookmark:folder')?.children.includes('Alpha')) {
      throw new Error(`Move-to folder target failed: ${JSON.stringify(titles)}`);
    }

    await moveFromContextDialog(page, 'bookmark:alpha', '根层级');
    titles = await favoriteTitles(page);
    if (titles.at(-1)?.title !== 'Alpha' || titles.find((item) => item.id === 'bookmark:folder')?.children.includes('Alpha')) {
      throw new Error(`Move-to root target failed: ${JSON.stringify(titles)}`);
    }

    await page.locator('[data-file-manager-bookmark-id="bookmark:alpha"] [data-file-manager-bookmark-more]').click();
    await page.locator('[data-file-manager-bookmark-context-menu]').getByText('上移').click();
    titles = await favoriteTitles(page);
    if (titles.map((item) => item.title).join(',') !== 'Beta,Alpha,Folder') {
      throw new Error(`Context menu up move failed: ${JSON.stringify(titles)}`);
    }

    await page.locator('[data-file-manager-bookmark-id="bookmark:alpha"]').click({ button: 'right' });
    await page.locator('[data-file-manager-bookmark-context-menu]').getByText('重命名').click();
    const input = page.locator('[data-file-manager-bookmark-title-input]');
    await input.fill('Alpha Renamed');
    await page.locator('[data-file-manager-bookmark-editor-dialog]').getByText('保存').click();
    titles = await favoriteTitles(page);
    if (!titles.some((item) => item.title === 'Alpha Renamed')) {
      throw new Error(`Rename from context menu failed: ${JSON.stringify(titles)}`);
    }

    await page.locator('[data-file-manager-bookmark-id="bookmark:folder"] [data-file-manager-bookmark-more]').click();
    await page.locator('[data-file-manager-bookmark-context-menu]').getByText('删除').click();
    const deleteDialog = page.locator('[data-file-manager-bookmark-delete-dialog]');
    await deleteDialog.waitFor({ timeout: 10_000 });
    const deleteText = await deleteDialog.textContent();
    if (!deleteText?.includes('不会删除真实文件或目录')) {
      throw new Error(`Unified delete dialog copy missing safety note: ${deleteText}`);
    }
    await deleteDialog.getByText('取消').click();
    await deleteDialog.waitFor({ state: 'detached', timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await openFavorites(page);
    await page.locator('[data-file-manager-bookmark-id="bookmark:alpha"]').waitFor({ timeout: 10_000 });
    const persistedText = await page.locator('[data-file-manager-bookmark-manager-tree]').textContent();
    if (!persistedText?.includes('Alpha Renamed')) throw new Error(`Renamed favorite did not survive reload: ${persistedText}`);

    await page.locator('[data-file-manager-bookmark-id="bookmark:folder"]').click({ position: { x: 260, y: 12 } });
    await page.locator('[data-file-manager-bookmark-id="bookmark:nested"]').waitFor({ state: 'detached', timeout: 10_000 });
    await page.locator('[data-file-manager-bookmark-id="bookmark:folder"]').click({ position: { x: 260, y: 12 } });
    await page.locator('[data-file-manager-bookmark-id="bookmark:nested"]').waitFor({ timeout: 10_000 });

    await page.locator('[data-file-manager-bookmark-id="bookmark:alpha"]').click({ position: { x: 260, y: 12 } });
    const activeTabText = await page.locator('[data-file-manager-directory-tab="active"]').textContent();
    if (!activeTabText?.toLowerCase().includes('alpha')) {
      throw new Error(`Single-clicking a bookmark did not open it as an active directory tab: ${activeTabText}`);
    }

    for (const viewport of [
      { name: 'small-mobile', width: 320, height: 568 },
      { name: 'mobile', width: 390, height: 760 },
      { name: 'small-tablet', width: 640, height: 700 },
      { name: 'tablet', width: 820, height: 900 },
      { name: 'laptop', width: 1024, height: 700 },
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'wide-desktop', width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openFavorites(page);
      await assertWithinViewport(page, '[data-file-manager-favorites-manage] > div', `${viewport.name} favorites manager`);
      await page.locator('[data-file-manager-bookmark-id="bookmark:alpha"] [data-file-manager-bookmark-more]').click();
      await assertWithinViewport(page, '[data-file-manager-bookmark-context-menu]', `${viewport.name} bookmark context menu`);
      await page.locator('[data-file-manager-bookmark-context-menu]').getByText('移动到…').click();
      await page.locator('[data-file-manager-bookmark-move-dialog]').waitFor({ timeout: 10_000 });
      await assertWithinViewport(page, '[data-file-manager-bookmark-move-dialog]', `${viewport.name} move dialog`);
      await page.locator('[data-file-manager-bookmark-move-dialog]').getByText('取消').click();
    }

    if (dialogs.length) throw new Error(`Favorites manager used native browser dialogs:\n${dialogs.join('\n')}`);

    failOnFatalLogs(logs, 'File manager favorites smoke');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
