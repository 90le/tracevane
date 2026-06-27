import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';
const VIEW_PREFS_KEY = 'tracevane:file-manager:view-preferences';
const SESSION_KEY = 'tracevane:file-manager:session-state:v1';

function failOnFatalLogs(logs, scope) {
  const fatal = logs.filter(
    (line) =>
      line.includes('[pageerror]') ||
      line.includes('Invalid hook call') ||
      line.includes("Cannot read properties of null") ||
      line.includes('Cannot read properties of undefined'),
  );
  if (fatal.length) throw new Error(`${scope} emitted fatal browser logs:\n${fatal.join('\n')}`);
}

async function resetViewPreferences(page) {
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ viewPrefsKey, sessionKey }) => {
    window.localStorage.removeItem(viewPrefsKey);
    window.localStorage.removeItem(sessionKey);
  }, { viewPrefsKey: VIEW_PREFS_KEY, sessionKey: SESSION_KEY });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function run() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await resetViewPreferences(page);
    const rows = page.locator('[data-file-manager-entry-path]');
    await rows.first().waitFor({ timeout: 60_000 });
    await page.locator('[data-file-manager-column="type"]').first().waitFor({ timeout: 30_000 });

    const hiddenToggle = page.locator('[data-file-manager-hidden-toggle]').first();
    await hiddenToggle.waitFor({ timeout: 10_000 });
    if (!(await hiddenToggle.isVisible())) throw new Error('Hidden-file toggle should be visible on desktop without opening filter details');
    await hiddenToggle.click();
    await page.waitForFunction(() => document.querySelector('[data-file-manager-hidden-toggle]')?.getAttribute('aria-pressed') === 'true');
    await page.waitForFunction(() => document.body.innerText.includes('隐藏隐藏文件'));
    await hiddenToggle.click();
    await page.waitForFunction(() => document.querySelector('[data-file-manager-hidden-toggle]')?.getAttribute('aria-pressed') === 'false');

    await page.getByLabel('配置列表列').click();
    await page.locator('[data-file-manager-column-menu]').waitFor({ timeout: 10_000 });
    const typeToggle = page.locator('[data-file-manager-column-menu]').getByLabel('显示类型列');
    if (!(await typeToggle.isChecked())) throw new Error('Type column checkbox should start checked');
    await typeToggle.uncheck();
    await page.waitForFunction(() => document.querySelectorAll('[data-file-manager-column="type"]').length === 0);
    const storedWithoutType = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), VIEW_PREFS_KEY);
    if (storedWithoutType.columns?.includes('type')) {
      throw new Error(`Type column was still persisted after hiding: ${JSON.stringify(storedWithoutType)}`);
    }

    await page.locator('[data-file-manager-column-menu] [data-file-manager-reset-columns]').click();
    await page.locator('[data-file-manager-column="type"]').first().waitFor({ timeout: 10_000 });
    const storedReset = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || '{}'), VIEW_PREFS_KEY);
    if (!storedReset.columns?.includes('type')) {
      throw new Error(`Reset did not restore default columns: ${JSON.stringify(storedReset)}`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await resetViewPreferences(page);
    await page.locator('[data-file-manager-header-title]').waitFor({ timeout: 30_000 });
    await page.locator('[data-file-manager-list]').waitFor({ timeout: 30_000 });

    const mobileHiddenToggle = page.locator('[data-file-manager-hidden-toggle]').first();
    await mobileHiddenToggle.waitFor({ timeout: 10_000 });
    if (!(await mobileHiddenToggle.isVisible())) throw new Error('Hidden-file toggle should be visible on mobile without opening filter details');
    await page.locator('[data-file-manager-mobile-list-settings] summary').click();
    await page.locator('[data-file-manager-mobile-column-settings]').waitFor({ timeout: 10_000 });
    await page.locator('[data-file-manager-mobile-column-settings]').getByLabel('显示权限列').check();
    await page.locator('[data-file-manager-mobile-column-settings] [data-file-manager-reset-columns]').click();

    const mobileMetrics = await page.evaluate(() => {
      const settings = document.querySelector('[data-file-manager-mobile-column-settings]')?.getBoundingClientRect();
      return {
        innerWidth: window.innerWidth,
        scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        settings: settings ? { width: settings.width, height: settings.height, right: settings.right } : null,
      };
    });
    if (!mobileMetrics.settings) throw new Error(`Mobile list column settings missing: ${JSON.stringify(mobileMetrics)}`);
    if (mobileMetrics.settings.width < 260 || mobileMetrics.settings.right > mobileMetrics.innerWidth + 16) {
      throw new Error(`Mobile list settings layout is invalid: ${JSON.stringify(mobileMetrics)}`);
    }
    if (mobileMetrics.scrollWidth > mobileMetrics.innerWidth + 24) {
      throw new Error(`Mobile list preferences caused horizontal overflow: ${JSON.stringify(mobileMetrics)}`);
    }
    failOnFatalLogs(logs, 'File manager list preferences smoke');
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
