import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    const imageRow = page.locator([
      '[data-file-manager-entry-path$=".png"]',
      '[data-file-manager-entry-path$=".jpg"]',
      '[data-file-manager-entry-path$=".jpeg"]',
      '[data-file-manager-entry-path$=".webp"]',
    ].join(', ')).first();
    await imageRow.waitFor({ timeout: 30_000 });
    await imageRow.scrollIntoViewIfNeeded();
    await imageRow.dblclick();
    await page.waitForSelector('[data-media-preview-stage][data-document-preview-kind="image"]', { timeout: 30_000 });
    await page.waitForSelector('[data-media-preview-image]', { timeout: 30_000 });

    const scrollport = page.locator('[data-media-preview-scrollport]').first();
    const box = await scrollport.boundingBox();
    if (!box || box.width < 240 || box.height < 180) {
      throw new Error(`Image preview scrollport has invalid size: ${JSON.stringify(box)}`);
    }
    await scrollport.hover();
    const beforeZoom = await page.locator('[data-media-preview-zoom-label]').innerText();
    await page.mouse.wheel(0, -900);
    await page.waitForTimeout(250);
    const afterZoom = await page.locator('[data-media-preview-zoom-label]').innerText();
    if (beforeZoom === afterZoom || !/^1[1-9]0%|1[1-9][0-9]%|200%|[2-4][0-9]{2}%$/.test(afterZoom.trim())) {
      throw new Error(`Wheel zoom did not update zoom label: ${beforeZoom} -> ${afterZoom}`);
    }

    const transformNode = page.locator('[data-media-preview-free-transform]');
    const transformBefore = await transformNode.evaluate((node) => getComputedStyle(node).transform);
    const panBefore = await readPan(transformNode);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 96, box.y + box.height / 2 + 72, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const transformAfter = await transformNode.evaluate((node) => getComputedStyle(node).transform);
    const panAfter = await readPan(transformNode);
    if (transformBefore === transformAfter || transformAfter === 'none') {
      throw new Error(`Drag pan did not update transform: ${transformBefore} -> ${transformAfter}`);
    }
    if (Math.abs(panAfter.x - panBefore.x) < 48 || Math.abs(panAfter.y - panBefore.y) < 36) {
      throw new Error(`Drag pan should move freely on both axes, got ${JSON.stringify({ panBefore, panAfter })}`);
    }

    await page.getByRole('button', { name: '适应' }).first().click();
    await page.waitForTimeout(150);
    const afterResetZoom = await readZoom(transformNode);
    const afterResetPan = await readPan(transformNode);
    if (Math.abs(afterResetZoom - 1) > 0.01 || Math.abs(afterResetPan.x) > 0.01 || Math.abs(afterResetPan.y) > 0.01) {
      throw new Error(`Fit/reset should restore 100% and centered pan, got ${JSON.stringify({ afterResetZoom, afterResetPan })}`);
    }

    await scrollport.dblclick();
    await page.waitForTimeout(150);
    const afterDoubleClickZoom = await readZoom(transformNode);
    if (afterDoubleClickZoom < 1.9) {
      throw new Error(`Double-click zoom should toggle from 100% to close to 200%, got ${afterDoubleClickZoom}`);
    }

    await page.getByRole('button', { name: '适应' }).first().click();
    await page.waitForTimeout(150);
    const afterFinalResetZoom = await readZoom(transformNode);
    const afterFinalResetPan = await readPan(transformNode);
    if (Math.abs(afterFinalResetZoom - 1) > 0.01 || Math.abs(afterFinalResetPan.x) > 0.01 || Math.abs(afterFinalResetPan.y) > 0.01) {
      throw new Error(`Final fit/reset should restore 100% and centered pan, got ${JSON.stringify({ afterFinalResetZoom, afterFinalResetPan })}`);
    }
    const errorCount = await page.locator('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').count();
    if (errorCount > 0) throw new Error('Media preview rendered through an error boundary');
    if (logs.some((line) => line.includes('[pageerror]'))) {
      throw new Error(`Browser page error during media preview smoke:\n${logs.join('\n')}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    const mobileMetrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    if (mobileMetrics.scrollWidth > mobileMetrics.innerWidth + 4) {
      throw new Error(`Mobile media preview should not cause horizontal document overflow: ${JSON.stringify(mobileMetrics)}`);
    }
    const mobileScrollportBox = await scrollport.boundingBox();
    if (!mobileScrollportBox || mobileScrollportBox.width > mobileMetrics.innerWidth || mobileScrollportBox.height < 240) {
      throw new Error(`Mobile media scrollport should stay usable within viewport: ${JSON.stringify({ mobileScrollportBox, mobileMetrics })}`);
    }
    const mobileMore = page.locator('[data-media-preview-mobile-more]').first();
    await mobileMore.waitFor({ timeout: 10_000 });
    await mobileMore.click();
    await page.waitForSelector('[data-media-preview-mobile-tools]', { timeout: 10_000 });
    const mobileToolsBox = await page.locator('[data-media-preview-mobile-tools]').first().boundingBox();
    if (!mobileToolsBox || mobileToolsBox.width > mobileMetrics.innerWidth) {
      throw new Error(`Mobile media tools should collapse into viewport-width panel: ${JSON.stringify({ mobileToolsBox, mobileMetrics })}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function readPan(locator) {
  return locator.evaluate((node) => ({
    x: Number(node.getAttribute('data-media-preview-pan-x')),
    y: Number(node.getAttribute('data-media-preview-pan-y')),
  }));
}

async function readZoom(locator) {
  return locator.evaluate((node) => Number(node.getAttribute('data-media-preview-zoom')));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
