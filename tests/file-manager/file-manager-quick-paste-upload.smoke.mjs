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
  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
  }
  return data;
}

async function waitForRead(rootId, path, expectedContent) {
  const search = new URLSearchParams({ rootId, path });
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const read = await api(`/api/files/read?${search.toString()}`);
      if (read.content === expectedContent) return read;
      lastError = new Error(`content mismatch: ${JSON.stringify(read.content)}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError ?? new Error(`Timed out waiting for ${path}`);
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `tracevane-quick-paste-${stamp}.txt`;
  const content = `Tracevane quick paste upload smoke ${stamp}\n`;
  const renamedPath = `tracevane-quick-paste-${stamp} (1).txt`;

  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [fileName, renamedPath], permanent: true }),
  }).catch(() => undefined);

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-file-manager-shell="true"]', { timeout: 30_000 });
    await page.locator('[data-file-manager-shell="true"]').focus();

    const dispatchResult = await page.evaluate(({ fileName, content }) => {
      const shell = document.querySelector('[data-file-manager-shell="true"]');
      if (!shell) return { ok: false, reason: 'missing shell' };
      const dispatchPaste = () => {
        const file = new File([content], fileName, { type: 'text/plain', lastModified: 1700000000000 });
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(file);
        let event;
        try {
          event = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dataTransfer });
        } catch {
          event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
          Object.defineProperty(event, 'clipboardData', { value: dataTransfer });
        }
        return shell.dispatchEvent(event);
      };
      const first = dispatchPaste();
      const second = dispatchPaste();
      return { ok: true, first, second };
    }, { fileName, content });
    if (!dispatchResult.ok) throw new Error(`Unable to dispatch paste event: ${JSON.stringify(dispatchResult)}`);

    await waitForRead(rootId, fileName, content);

    let duplicateExists = false;
    try {
      await api(`/api/files/read?${new URLSearchParams({ rootId, path: renamedPath }).toString()}`);
      duplicateExists = true;
    } catch {
      duplicateExists = false;
    }
    if (duplicateExists) {
      throw new Error('Duplicate quick paste created a renamed second file instead of being de-duplicated');
    }

    const dialogVisible = await page.getByRole('dialog').filter({ hasText: /上传文件到/ }).count();
    if (dialogVisible > 0) {
      throw new Error('Quick paste opened the upload dialog; it should upload directly while resource manager is focused');
    }

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during quick paste upload smoke:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await api('/api/files', {
      method: 'DELETE',
      body: JSON.stringify({ rootId, paths: [fileName, renamedPath], permanent: true }),
    }).catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
