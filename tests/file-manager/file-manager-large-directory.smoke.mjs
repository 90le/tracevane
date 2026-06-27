import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';
const FILE_COUNT = 240;

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

async function cleanup(rootId, smokeDir) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [smokeDir], permanent: true }),
  }).catch(() => undefined);
}

async function createSmokeDirectory(rootId, smokeDir) {
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: smokeDir }),
  });
  const batches = [];
  for (let index = 0; index < FILE_COUNT; index += 12) {
    batches.push(Array.from({ length: Math.min(12, FILE_COUNT - index) }, (_, offset) => index + offset));
  }
  for (const batch of batches) {
    await Promise.all(batch.map((index) => api('/api/files/files', {
      method: 'POST',
      body: JSON.stringify({
        rootId,
        directoryPath: smokeDir,
        name: `virtual-row-${String(index).padStart(3, '0')}.txt`,
        content: `Tracevane virtual list smoke row ${index}\n`,
        overwrite: true,
      }),
    })));
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = `tracevane-large-dir-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await cleanup(rootId, smokeDir);
  await createSmokeDirectory(rootId, smokeDir);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-file-manager-root-select], [data-file-manager-mobile-root-select]', { timeout: 30_000 });
    const rootSelector = page.locator('[data-file-manager-root-select], [data-file-manager-mobile-root-select]').first();
    await rootSelector.selectOption(rootId);
    const pathInput = page.getByLabel('编辑文件夹路径，按 Enter 跳转');
    await pathInput.fill(smokeDir);
    await pathInput.press('Enter');
    try {
      await page.waitForFunction(
        (count) => Number(document.querySelector('[data-file-manager-list]')?.getAttribute('data-file-manager-total-count') || 0) >= count,
        FILE_COUNT,
        { timeout: 60_000 },
      );
    } catch (error) {
      const debug = await page.evaluate(() => ({
        rootSelect: document.querySelector('[data-file-manager-root-select], [data-file-manager-mobile-root-select]')?.value ?? null,
        pathInput: document.querySelector('[data-file-manager-path-input]')?.value ?? null,
        listTotal: document.querySelector('[data-file-manager-list]')?.getAttribute('data-file-manager-total-count') ?? null,
        rows: Array.from(document.querySelectorAll('[data-file-manager-entry-path]')).slice(0, 20).map((node) => node.getAttribute('data-file-manager-entry-path')),
        bodyText: document.body.innerText.slice(0, 1600),
      }));
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nLarge directory debug: ${JSON.stringify(debug, null, 2)}`);
    }
    const initial = await page.evaluate(() => {
      const list = document.querySelector('[data-file-manager-list]');
      const scrollport = document.querySelector('[data-file-manager-list-scrollport]');
      return {
        total: Number(list?.getAttribute('data-file-manager-total-count') || 0),
        rendered: Number(list?.getAttribute('data-file-manager-rendered-count') || 0),
        virtual: list?.getAttribute('data-file-manager-virtual-window'),
        rows: document.querySelectorAll('[data-file-manager-entry-path]').length,
        scrollHeight: scrollport?.scrollHeight ?? 0,
        clientHeight: scrollport?.clientHeight ?? 0,
        firstPath: document.querySelector('[data-file-manager-entry-path]')?.getAttribute('data-file-manager-entry-path') ?? '',
      };
    });
    if (initial.virtual !== 'true') throw new Error(`Large directory did not enable virtual window: ${JSON.stringify(initial)}`);
    if (initial.total < FILE_COUNT) throw new Error(`Large directory total count is too low: ${JSON.stringify(initial)}`);
    if (initial.rendered >= initial.total || initial.rows >= initial.total) {
      throw new Error(`Large directory rendered too many DOM rows: ${JSON.stringify(initial)}`);
    }
    if (initial.scrollHeight <= initial.clientHeight * 2) throw new Error(`Virtual list is not scrollable: ${JSON.stringify(initial)}`);

    await page.locator('[data-file-manager-list-scrollport]').evaluate((node) => { node.scrollTop = node.scrollHeight; node.dispatchEvent(new Event('scroll', { bubbles: true })); });
    await page.waitForTimeout(250);
    const afterScroll = await page.evaluate(() => {
      const list = document.querySelector('[data-file-manager-list]');
      const rows = [...document.querySelectorAll('[data-file-manager-entry-path]')];
      return {
        rendered: Number(list?.getAttribute('data-file-manager-rendered-count') || 0),
        rows: rows.length,
        firstPath: rows[0]?.getAttribute('data-file-manager-entry-path') ?? '',
        lastPath: rows.at(-1)?.getAttribute('data-file-manager-entry-path') ?? '',
      };
    });
    if (afterScroll.firstPath === initial.firstPath) {
      throw new Error(`Virtual list window did not move after scroll: ${JSON.stringify({ initial, afterScroll })}`);
    }
    if (!afterScroll.lastPath.includes('virtual-row-')) {
      throw new Error(`Virtual list did not render smoke rows after scroll: ${JSON.stringify(afterScroll)}`);
    }

    await page.locator('[data-file-manager-list]').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    const selectedCount = await page.locator('[data-file-manager-list]').getAttribute('data-file-manager-selection-count');
    if (Number(selectedCount) !== initial.total) {
      throw new Error(`Ctrl+A should select all filtered rows, not only rendered DOM rows: selected=${selectedCount}, initial=${JSON.stringify(initial)}`);
    }

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null'))) {
      throw new Error(`Large directory smoke emitted fatal logs:\n${logs.join('\n')}`);
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
