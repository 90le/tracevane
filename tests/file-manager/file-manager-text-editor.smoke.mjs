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

async function cleanup(rootId, path) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [path], permanent: true }),
  }).catch(() => undefined);
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
    (path) => [...document.querySelectorAll('[data-file-manager-display-path]')].some((node) => (node.getAttribute('data-file-manager-display-path') || '').endsWith(path ? `/${path}` : '/')),
    directoryPath,
    { timeout: 30_000 },
  );
}

async function waitForCodeEditorModuleReady() {
  const deadline = Date.now() + 60_000;
  let lastStatus = 0;
  let lastText = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/src/features/file-manager/code-editor/index.ts?t=${Date.now()}`, {
        headers: { Accept: 'application/javascript' },
      });
      lastStatus = response.status;
      lastText = await response.text().catch(() => '');
      if (response.ok && !lastText.includes('Outdated Optimize Dep')) return;
    } catch (error) {
      lastText = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Code editor module did not become ready: status=${lastStatus}; body=${lastText.slice(0, 300)}`);
}

async function openTextEditor(page, textPath) {
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  await jumpToPath(page, 'tmp');
  await page.waitForSelector(`[data-file-manager-entry-path="${cssAttr(textPath)}"]`, { timeout: 60_000 });
  const textRow = page.locator(`[data-file-manager-entry-path="${cssAttr(textPath)}"]`).first();
  await textRow.scrollIntoViewIfNeeded();
  await textRow.dblclick({ force: true });
  await page.waitForSelector('[data-file-online-editor-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-online-editor-tabs]', { timeout: 30_000 });
}

async function readEditorState(page) {
  return page.evaluate(() => ({
    editor: document.querySelector('[data-code-editor="monaco-direct"]')?.getBoundingClientRect()?.toJSON?.() ?? null,
    monacoEditor: document.querySelector('.monaco-editor')?.getBoundingClientRect()?.toJSON?.() ?? null,
    viewport: document.querySelector('[data-file-online-editor-panel]')?.getBoundingClientRect()?.toJSON?.() ?? null,
    errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary]').length,
    bodyText: document.body.innerText.slice(0, 1000),
  }));
}

function hasFatalLog(logs) {
  return logs.some(
    (line) =>
      line.includes('Invalid hook call') ||
      line.includes("Cannot read properties of null (reading 'useState')") ||
      line.includes('[pageerror]'),
  );
}

async function verifyTextEditor(textPath) {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await openTextEditor(page, textPath);
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.waitForSelector('.monaco-editor', { timeout: 30_000 });
    await page.waitForSelector('[data-file-online-editor-statusbar]', { timeout: 30_000 });
    const metrics = await readEditorState(page);
    if (!metrics.editor || metrics.editor.height < 180 || metrics.editor.width < 300) {
      throw new Error(`Code editor has invalid size: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.monacoEditor || metrics.monacoEditor.height < 180 || metrics.monacoEditor.width < 300) {
      throw new Error(`Monaco editor did not render: ${JSON.stringify(metrics)}`);
    }
    if (metrics.errorCount > 0) throw new Error(`Text editor rendered through an error boundary: ${JSON.stringify(metrics)}`);
    if (hasFatalLog(logs)) throw new Error(`Text editor emitted fatal browser logs:\n${logs.join('\n')}`);
  } catch (error) {
    const state = await readEditorState(page).catch(() => null);
    console.error(JSON.stringify({ logs, state }, null, 2));
    throw error;
  } finally {
    await browser.close().catch(() => undefined);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  await waitForCodeEditorModuleReady();
  const textPath = `tmp/tracevane-text-editor-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  await cleanup(rootId, textPath);
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: 'tmp', name: textPath.slice('tmp/'.length), content: 'Tracevane text editor smoke\n' }),
  });

  try {
    await verifyTextEditor(textPath);
  } finally {
    await cleanup(rootId, textPath);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
