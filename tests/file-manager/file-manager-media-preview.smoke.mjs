import { chromium } from '@playwright/test';
import fs from 'node:fs';
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
  if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function cleanup(rootId, paths) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths, permanent: true }),
  }).catch(() => undefined);
}

function writeFixture(rootAbsolutePath, relativePath, bytes) {
  const target = path.join(rootAbsolutePath, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(bytes));
}

async function jumpToPath(page, directoryPath) {
  const visiblePathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])');
  if (!(await visiblePathInput.count())) {
    await page.locator('[data-file-manager-path-enter-edit]').first().click();
  }
  const pathInput = page.locator('[data-file-manager-path-input]:not([data-file-manager-mobile-path-input-proxy])').first();
  await pathInput.waitFor({ state: 'visible', timeout: 30_000 });
  await pathInput.fill(directoryPath);
  await pathInput.press('Enter');
  await page.waitForFunction(
    (targetPath) => [...document.querySelectorAll('[data-file-manager-display-path]')].some((node) => (node.getAttribute('data-file-manager-display-path') || '').endsWith(`/${targetPath}`)),
    directoryPath,
    { timeout: 30_000 },
  );
}

async function refreshFileList(page) {
  await page.getByRole('button', { name: '刷新文件列表' }).click();
}

async function openFile(page, filePath) {
  await page.waitForFunction(
    (targetPath) => [...document.querySelectorAll('[data-file-manager-entry-path]')].some((node) => node.getAttribute('data-file-manager-entry-path') === targetPath),
    filePath,
    { timeout: 60_000 },
  );
  const row = page.locator(`[data-file-manager-entry-path="${cssAttr(filePath)}"]`).first();
  await row.evaluate((node) => {
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
    node.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  });
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
}

async function closeAll(page) {
  await page.getByRole('button', { name: '关闭在线编辑器' }).click();
  await page.waitForSelector('[data-file-online-editor-dialog]', { state: 'detached', timeout: 30_000 });
}

async function assertPreviewKind(page, expectedKind, selector) {
  await page.waitForSelector(`[data-file-surface-panel][data-file-surface-kind="${expectedKind}"]`, { timeout: 30_000 });
  await page.waitForSelector(selector, { timeout: 30_000 });
  if (await page.locator('[data-file-preview-dialog]').count()) {
    throw new Error(`Legacy preview dialog should not open for ${expectedKind}`);
  }
}

async function assertImageCanvasInteractions(page) {
  await page.waitForSelector('[data-file-surface-image-viewer]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-surface-image-canvas]', { timeout: 30_000 });
  const image = page.locator('[data-file-surface-image]').first();
  const before = await image.evaluate((node) => getComputedStyle(node).transform);
  await page.locator('[data-file-surface-image-zoom-in]').click();
  await page.waitForFunction(
    (previous) => getComputedStyle(document.querySelector('[data-file-surface-image]')).transform !== previous,
    before,
    { timeout: 10_000 },
  );
  const afterButtonZoom = await image.evaluate((node) => getComputedStyle(node).transform);
  const canvas = page.locator('[data-file-surface-image-canvas]').first();
  await canvas.hover();
  await page.mouse.wheel(0, -360);
  await page.waitForFunction(
    (previous) => getComputedStyle(document.querySelector('[data-file-surface-image]')).transform !== previous,
    afterButtonZoom,
    { timeout: 10_000 },
  );
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Image canvas is not visible');
  const afterWheelZoom = await image.evaluate((node) => getComputedStyle(node).transform);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40);
  await page.mouse.up();
  await page.waitForFunction(
    (previous) => getComputedStyle(document.querySelector('[data-file-surface-image]')).transform !== previous,
    afterWheelZoom,
    { timeout: 10_000 },
  );
  await page.locator('[data-file-surface-image-reset]').click();
  await page.waitForFunction(
    () => (document.querySelector('[data-file-surface-image-zoom-label]')?.textContent || '').includes('100%'),
    null,
    { timeout: 10_000 },
  );
}

async function assertMediaControls(page, kind) {
  await page.waitForSelector(`[data-file-surface-${kind}-viewer]`, { timeout: 30_000 });
  await page.waitForSelector(`[data-file-surface-${kind}-backward]`, { timeout: 30_000 });
  await page.waitForSelector(`[data-file-surface-${kind}-forward]`, { timeout: 30_000 });
  await page.waitForSelector(`[data-file-surface-${kind}-speed]`, { timeout: 30_000 });
}

function fixtureBytes() {
  return {
    png: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'),
    pdf: Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n', 'utf8'),
    wav: Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=', 'base64'),
    mp4: Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32]),
    bin: Buffer.from([0, 159, 146, 150, 0, 1, 2, 3, 4, 5]),
  };
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  const root = summary.roots?.find((item) => item.id === rootId) ?? summary.roots?.[0];
  if (!rootId || !root?.absolutePath) throw new Error('No file-manager root is available');

  const workspacePath = `tmp/media-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const paths = {
    image: `${workspacePath}/pixel.png`,
    video: `${workspacePath}/sample.mp4`,
    audio: `${workspacePath}/sample.wav`,
    pdf: `${workspacePath}/sample.pdf`,
    binary: `${workspacePath}/sample.bin`,
  };
  await cleanup(rootId, [workspacePath]);
  const bytes = fixtureBytes();
  writeFixture(root.absolutePath, paths.image, bytes.png);
  writeFixture(root.absolutePath, paths.video, bytes.mp4);
  writeFixture(root.absolutePath, paths.audio, bytes.wav);
  writeFixture(root.absolutePath, paths.pdf, bytes.pdf);
  writeFixture(root.absolutePath, paths.binary, bytes.bin);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await jumpToPath(page, workspacePath);
    await refreshFileList(page);

    await openFile(page, paths.image);
    await assertPreviewKind(page, 'image', '[data-file-surface-image]');
    await assertImageCanvasInteractions(page);
    await closeAll(page);

    await openFile(page, paths.video);
    await assertPreviewKind(page, 'video', '[data-file-surface-video]');
    await assertMediaControls(page, 'video');
    await closeAll(page);

    await openFile(page, paths.audio);
    await assertPreviewKind(page, 'audio', '[data-file-surface-audio]');
    await assertMediaControls(page, 'audio');
    await closeAll(page);

    await openFile(page, paths.pdf);
    await assertPreviewKind(page, 'pdf', '[data-file-surface-pdf]');
    await page.waitForSelector('[data-file-surface-pdf-viewer]', { timeout: 30_000 });
    await closeAll(page);

    await openFile(page, paths.binary);
    await assertPreviewKind(page, 'binary', '[data-file-surface-binary]');
    await closeAll(page);

    const fatalLogs = logs.filter((line) => line.includes('[pageerror]') || line.includes('Maximum update depth') || line.includes('Invalid hook call'));
    if (fatalLogs.length > 0) {
      throw new Error(`Media preview smoke emitted fatal logs:\n${fatalLogs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [workspacePath]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
