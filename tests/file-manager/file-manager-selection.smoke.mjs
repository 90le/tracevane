import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

async function selectionCount(page) {
  const raw = await page.locator('[data-file-manager-list]').getAttribute('data-file-manager-selection-count');
  return Number(raw || 0);
}

async function totalListCount(page) {
  const raw = await page.locator('[data-file-manager-list]').getAttribute('data-file-manager-total-count');
  return Number(raw || 0);
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    const rows = page.locator('[data-file-manager-entry-path]');
    await rows.nth(4).waitFor({ timeout: 60_000 });
    const visibleCount = await rows.count();
    if (visibleCount < 5) throw new Error(`Need at least 5 visible rows, got ${visibleCount}`);

    const list = page.locator('[data-file-manager-list]');
    await list.click();
    await page.keyboard.press('Escape');
    if (await selectionCount(page) !== 0) throw new Error('Escape did not clear initial selection');

    await rows.nth(0).click({ modifiers: ['Control'] });
    await rows.nth(1).click({ modifiers: ['Control'] });
    if (await selectionCount(page) !== 2) {
      throw new Error(`Ctrl multi-select expected 2, got ${await selectionCount(page)}`);
    }

    await rows.nth(4).click({ modifiers: ['Shift'] });
    const rangeCount = await selectionCount(page);
    if (rangeCount !== 4) {
      throw new Error(`Shift range expected 4 selected entries from anchor to target, got ${rangeCount}`);
    }

    await list.click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    const allCount = await selectionCount(page);
    const totalCount = await totalListCount(page);
    if (allCount !== totalCount) {
      throw new Error(`Ctrl+A expected ${totalCount} filtered entries selected, got ${allCount}; rendered rows=${visibleCount}`);
    }

    await page.keyboard.press('Escape');
    if (await selectionCount(page) !== 0) throw new Error('Escape did not clear Ctrl+A selection');
    await rows.nth(0).scrollIntoViewIfNeeded();

    const firstBox = await rows.nth(0).boundingBox();
    const thirdBox = await rows.nth(2).boundingBox();
    if (!firstBox || !thirdBox) throw new Error('Unable to measure rows for marquee selection');
    await page.mouse.move(firstBox.x + 80, firstBox.y + 8);
    await page.mouse.down();
    await page.mouse.move(thirdBox.x + thirdBox.width - 8, thirdBox.y + thirdBox.height - 8, { steps: 8 });
    await page.mouse.up();
    const marqueeCount = await selectionCount(page);
    if (marqueeCount < 2) {
      throw new Error(`Marquee selection expected at least 2 entries, got ${marqueeCount}`);
    }

    const checkboxAffordance = await page.locator('[data-file-manager-entry-checkbox-affordance]').first().evaluate((node) => getComputedStyle(node).opacity);
    if (!Number.isFinite(Number(checkboxAffordance))) throw new Error('Checkbox affordance opacity was not measurable');

    if (logs.some((line) => line.includes('[pageerror]'))) {
      throw new Error(`Selection smoke emitted page errors:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
