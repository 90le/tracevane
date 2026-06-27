import { chromium } from '@playwright/test';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || 'http://127.0.0.1:5176';
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

const tinyPdfBase64 = 'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE5MwolJUVPRgo=';

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
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  }
  return data;
}

async function uploadBase64(rootId, directoryPath, fileName, dataBase64) {
  return api('/api/files/upload', {
    method: 'POST',
    body: JSON.stringify({
      rootId,
      directoryPath,
      files: [{ fileName, dataBase64, overwrite: true }],
    }),
  });
}

async function createFixtureSet() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dir = `tracevane-fallback-preview-${marker}`;
  await api('/api/files/directories', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: dir }),
  });

  const sourceName = `archive-source-${marker}.txt`;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: dir, name: sourceName, content: `archive fixture ${marker}`, overwrite: true }),
  });
  const archiveName = `fallback-${marker}.zip`;
  await api('/api/files/archive', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: dir, paths: [`${dir}/${sourceName}`], name: archiveName }),
  });
  const pdfName = `fallback-${marker}.pdf`;
  await uploadBase64(rootId, dir, pdfName, tinyPdfBase64);
  const binaryName = `fallback-${marker}.bin`;
  await uploadBase64(rootId, dir, binaryName, Buffer.from([0, 255, 17, 31, 128, 64, 10, 0, 91, 33, 7, 200]).toString('base64'));
  return {
    rootId,
    dir,
    paths: {
      pdf: `${dir}/${pdfName}`,
      archive: `${dir}/${archiveName}`,
      binary: `${dir}/${binaryName}`,
    },
  };
}

async function cleanup(rootId, dir) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [dir], permanent: true }),
  }).catch(() => undefined);
}

async function openPath(page, filePath) {
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-file-manager-list]', { timeout: 30_000 });
  const dirPath = filePath.split('/').slice(0, -1).join('/');
  if (dirPath) {
    await page.locator('[data-file-manager-path-input]').fill(dirPath);
    await page.keyboard.press('Enter');
  }
  const row = page.locator(`[data-file-manager-entry-path="${filePath}"]`).first();
  await row.waitFor({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
}

async function assertNoLayoutBreak(page, selector, { mobile = false } = {}) {
  const metrics = await page.evaluate((targetSelector) => {
    const doc = document.documentElement;
    const body = document.body;
    const dialog = document.querySelector('[data-file-preview-dialog]')?.getBoundingClientRect();
    const target = document.querySelector(targetSelector)?.getBoundingClientRect();
    const toolbar = document.querySelector('[data-file-preview-editor-toolbar]')?.getBoundingClientRect();
    const region = document.querySelector('[data-file-preview-workbench-region]')?.getBoundingClientRect();
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      dialog: dialog ? { width: dialog.width, height: dialog.height } : null,
      target: target ? { width: target.width, height: target.height } : null,
      toolbar: toolbar ? { width: toolbar.width, height: toolbar.height } : null,
      region: region ? { width: region.width, height: region.height } : null,
      errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').length,
      text: body.innerText.slice(0, 1600),
    };
  }, selector);
  if (!metrics.dialog || metrics.dialog.width < 320 || metrics.dialog.height < 320) {
    throw new Error(`Preview dialog collapsed: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.target || metrics.target.width < 240 || metrics.target.height < 180) {
    throw new Error(`Fallback preview target has invalid size: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.region || metrics.region.height < 180) {
    throw new Error(`Workbench region collapsed: ${JSON.stringify(metrics)}`);
  }
  if (metrics.errorCount) throw new Error(`Preview rendered error boundary: ${JSON.stringify(metrics)}`);
  if (mobile) {
    if (metrics.dialog.width > metrics.innerWidth + 2 || metrics.dialog.height > metrics.innerHeight + 2) {
      throw new Error(`Mobile dialog exceeds viewport: ${JSON.stringify(metrics)}`);
    }
    if (metrics.scrollWidth > metrics.innerWidth + 24) {
      throw new Error(`Mobile fallback preview has page overflow: ${JSON.stringify(metrics)}`);
    }
    if (metrics.toolbar && metrics.toolbar.height > 126) {
      throw new Error(`Mobile toolbar is stacked too tall: ${JSON.stringify(metrics)}`);
    }
  }
}

async function closePreview(page) {
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-file-preview-dialog]', { state: 'detached', timeout: 10_000 }).catch(async () => {
    await page.getByRole('button', { name: '关闭' }).first().click({ timeout: 10_000 });
    await page.waitForSelector('[data-file-preview-dialog]', { state: 'detached', timeout: 10_000 });
  });
}

async function run() {
  const fixture = await createFixtureSet();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await openPath(page, fixture.paths.pdf);
    await page.waitForSelector('[data-document-preview-kind="pdf"][data-pdf-preview-stage]', { timeout: 30_000 });
    await page.waitForSelector('[data-pdf-preview-frame], [data-pdf-preview-fallback]', { timeout: 30_000 });
    await assertNoLayoutBreak(page, '[data-document-preview-kind="pdf"]');
    await closePreview(page);

    await openPath(page, fixture.paths.archive);
    await page.waitForSelector('[data-document-preview-kind="archive"]', { timeout: 30_000 });
    await page.waitForSelector('[data-archive-preview-items], [data-archive-preview-error]', { timeout: 30_000 });
    await assertNoLayoutBreak(page, '[data-document-preview-kind="archive"]');
    await closePreview(page);

    await openPath(page, fixture.paths.binary);
    await page.waitForSelector('[data-document-preview-kind="binary"][data-binary-preview-stage]', { timeout: 30_000 });
    await page.waitForSelector('[data-binary-preview-actions]', { timeout: 30_000 });
    const binaryText = await page.locator('[data-document-preview-kind="binary"]').innerText();
    if (!binaryText.includes('安全占位预览') || !binaryText.includes('下载')) {
      throw new Error(`Binary fallback text/actions missing: ${binaryText}`);
    }
    await assertNoLayoutBreak(page, '[data-document-preview-kind="binary"]');

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    await assertNoLayoutBreak(page, '[data-document-preview-kind="binary"]', { mobile: true });
    await closePreview(page);

    await openPath(page, fixture.paths.pdf);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForSelector('[data-document-preview-kind="pdf"]', { timeout: 30_000 });
    await assertNoLayoutBreak(page, '[data-document-preview-kind="pdf"]', { mobile: true });

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during fallback preview smoke:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(fixture.rootId, fixture.dir);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
