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

function htmlFixture(marker) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Tracevane HTML smoke ${marker}</title>
  <style>body{font-family:system-ui;padding:24px} main{max-width:720px;margin:auto}</style>
  <script>window.__tracevaneUnsafeScriptRan = true;</script>
</head>
<body>
  <main>
    <h1 id="title">HTML original ${marker}</h1>
    <p id="body-copy">Original visible copy ${marker}</p>
  </main>
</body>
</html>`;
}

async function createSmokeHtml() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `tracevane-html-editor-smoke-${marker}.html`;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: filePath, content: htmlFixture(marker), overwrite: true }),
  });
  return { rootId, filePath, marker };
}

async function cleanup(rootId, filePath) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [filePath], permanent: true }),
  }).catch(() => undefined);
}

async function readFile(rootId, filePath) {
  return (await api(`/api/files/read?${new URLSearchParams({ rootId, path: filePath }).toString()}`)).content;
}

async function openFile(page, filePath) {
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-file-manager-list]', { timeout: 30_000 });
  const row = page.locator(`[data-file-manager-entry-path="${filePath}"]`).first();
  await row.waitFor({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await row.click({ force: true });
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-preview-editor-shell]', { timeout: 30_000 });
  await page.waitForFunction(
    (path) => document.querySelector('[data-file-preview-editor-shell]')?.getAttribute('data-file-preview-path') === path,
    filePath,
    { timeout: 30_000 },
  );
}

async function selectMode(page, modeName) {
  const mobileSelect = page.getByLabel('选择文件视图模式');
  if ((await mobileSelect.count()) && (await mobileSelect.first().isVisible())) {
    await mobileSelect.selectOption(modeName === 'visual' ? 'visual' : modeName === 'split' ? 'split' : modeName === 'source' ? 'source' : 'preview');
  } else {
    const label = modeName === 'visual' ? '预览时编辑' : modeName === 'split' ? '边写边预览' : modeName === 'source' ? '源码/编辑' : '预览';
    await page.locator('[data-document-workbench-desktop-mode-segments]').getByRole('button', { name: label, exact: true }).click();
  }
}

async function assertHtmlPreview(page, marker) {
  await selectMode(page, 'preview');
  await page.waitForSelector('[data-document-preview-kind="html"] iframe', { timeout: 30_000 });
  const frame = await page.locator('[data-document-preview-kind="html"] iframe').elementHandle();
  const frameWindow = await frame.contentFrame();
  if (!frameWindow) throw new Error('HTML preview iframe has no content frame');
  await frameWindow.waitForSelector(`#title`, { timeout: 30_000 });
  const text = await frameWindow.locator('body').innerText();
  if (!text.includes(`HTML original ${marker}`)) throw new Error(`HTML preview did not render expected text: ${text}`);
  const scriptRan = await frameWindow.evaluate(() => window.__tracevaneUnsafeScriptRan === true).catch(() => false);
  if (scriptRan) throw new Error('Sandboxed HTML preview executed author script unexpectedly');
}

async function editSplitSource(page) {
  await selectMode(page, 'split');
  await page.waitForSelector('[data-split-source-editor] textarea', { timeout: 30_000 });
  const textarea = page.locator('[data-split-source-editor] textarea').first();
  const content = await textarea.inputValue();
  await textarea.fill(content.replace('Original visible copy', 'Split edited copy'));
  await page.waitForSelector('[data-document-preview-kind="html"] iframe', { timeout: 30_000 });
}

async function editVisualHtml(page) {
  await selectMode(page, 'visual');
  await page.waitForSelector('[data-html-visual-editor-shell] [data-html-visual-frame]', { timeout: 30_000 });
  const frame = await page.locator('[data-html-visual-frame]').elementHandle();
  const frameWindow = await frame.contentFrame();
  if (!frameWindow) throw new Error('HTML visual editor iframe has no content frame');
  await frameWindow.waitForSelector('#title', { timeout: 30_000 });
  await frameWindow.locator('#title').click();
  await frameWindow.locator('#title').evaluate((node) => {
    node.textContent = 'HTML visually edited title';
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: node.textContent }));
  });
  await page.locator('[data-html-visual-sync]').click();
  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('[data-html-visual-editor-shell]')?.getBoundingClientRect();
    const frame = document.querySelector('[data-html-visual-frame]')?.getBoundingClientRect();
    return {
      shell: shell ? { width: shell.width, height: shell.height } : null,
      frame: frame ? { width: frame.width, height: frame.height } : null,
      errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').length,
    };
  });
  if (!metrics.shell || metrics.shell.height < 260 || !metrics.frame || metrics.frame.height < 180) {
    throw new Error(`HTML visual editor collapsed: ${JSON.stringify(metrics)}`);
  }
  if (metrics.errorCount > 0) throw new Error('HTML visual editor rendered through an error boundary');
}

async function saveAndAssert(page, rootId, filePath) {
  await page.getByTitle(/保存当前文件/).last().click();
  await page.waitForSelector('[data-file-save-review-dialog]', { timeout: 30_000 });
  await page.getByRole('button', { name: '确认保存' }).click();
  await page.waitForFunction(() => document.body.innerText.includes('✓ 已保存'), null, { timeout: 30_000 });
  const saved = await readFile(rootId, filePath);
  const expected = ['Split edited copy', 'HTML visually edited title'];
  const missing = expected.filter((snippet) => !saved.includes(snippet));
  if (missing.length) throw new Error(`Saved HTML is missing edits ${JSON.stringify(missing)}. Saved content:\n${saved}`);
}

async function run() {
  const { rootId, filePath, marker } = await createSmokeHtml();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await openFile(page, filePath);
    await assertHtmlPreview(page, marker);
    await editSplitSource(page);
    await editVisualHtml(page);
    await saveAndAssert(page, rootId, filePath);
    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during HTML editor smoke:\n${logs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, filePath);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
