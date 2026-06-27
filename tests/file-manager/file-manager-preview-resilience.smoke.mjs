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

function markdownFixture(marker) {
  const rows = Array.from({ length: 80 }, (_, index) => `| ${index + 1} | ${marker} row ${index + 1} | ${'cell '.repeat(8)} |`).join('\n');
  return [
    `# Tracevane preview smoke ${marker}`,
    '',
    'This file validates file-preview dialog sizing, mobile mode switching, and scrollable Markdown rendering.',
    '',
    '```mermaid',
    'flowchart TD',
    '  A[Open file] --> B[Preview dialog]',
    '  B --> C[Scrollable workbench]',
    '```',
    '',
    '| # | name | note |',
    '| --- | --- | --- |',
    rows,
    '',
    '## Tail marker',
    '',
    `End of ${marker}`,
  ].join('\n');
}

async function createSmokeMarkdown() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const smokeDir = '';
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `tracevane-preview-smoke-${marker}.md`;
  const filePath = fileName;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: fileName, content: markdownFixture(marker), overwrite: true }),
  });
  return { rootId, smokeDir, filePath, marker };
}

async function cleanup(rootId, filePath) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [filePath], permanent: true }),
  }).catch(() => undefined);
}

async function openSmokeFile(page, smokeDir, filePath) {
  await page.goto(`${BASE_URL}/#/file-manager`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-file-manager-list]', { timeout: 30_000 });
  const row = page.locator(`[data-file-manager-entry-path="${filePath}"]`).first();
  await row.waitFor({ timeout: 30_000 });
  await row.scrollIntoViewIfNeeded();
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-preview-editor-shell]', { timeout: 30_000 });
  await page.waitForSelector('[data-document-workbench-viewport]', { timeout: 30_000 });
}

async function waitForMarkdownPreview(page) {
  try {
    await page.locator('[data-document-preview-kind=\"markdown\"]').waitFor({ timeout: 30_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      text: document.body.innerText.slice(0, 1600),
      html: document.body.innerHTML.slice(0, 3000),
      previewKinds: Array.from(document.querySelectorAll('[data-document-preview-kind]')).map((node) => node.getAttribute('data-document-preview-kind')),
      workbench: document.querySelector('[data-document-workbench-viewport]')?.outerHTML.slice(0, 1200) ?? null,
      errors: Array.from(document.querySelectorAll('[data-file-preview-error-boundary], [data-file-manager-modal-error-boundary]')).map((node) => node.textContent),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nPreview debug: ${JSON.stringify(debug, null, 2)}`);
  }
}

async function assertPreviewMetrics(page, { mobile = false } = {}) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const dialog = document.querySelector('[data-file-preview-dialog]')?.getBoundingClientRect();
    const shell = document.querySelector('[data-file-preview-editor-shell]')?.getBoundingClientRect();
    const toolbar = document.querySelector('[data-file-preview-editor-toolbar]')?.getBoundingClientRect();
    const region = document.querySelector('[data-file-preview-workbench-region]')?.getBoundingClientRect();
    const workbenchToolbar = document.querySelector('[data-document-workbench-toolbar]')?.getBoundingClientRect();
    const viewport = document.querySelector('[data-document-workbench-viewport]')?.getBoundingClientRect();
    const preview = document.querySelector('[data-document-preview-kind="markdown"]')?.getBoundingClientRect();
    const article = document.querySelector('.md-preview__article');
    const articleRect = article?.getBoundingClientRect();
    const mobileModeSelect = document.querySelector('[data-document-workbench-mobile-mode-select]');
    const desktopSegments = document.querySelector('[data-document-workbench-desktop-mode-segments]');
    const desktopTools = document.querySelector('[data-file-preview-desktop-tools]');
    const mobileMore = document.querySelector('[data-file-preview-mobile-tools]');
    const oversized = Array.from(document.querySelectorAll('body *'))
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { tag: node.tagName, width: rect.width, left: rect.left, right: rect.right };
      })
      .filter((item) => item.width > window.innerWidth + 24 && item.right > window.innerWidth + 24)
      .slice(0, 8);
    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      bodyText: body.innerText.slice(0, 1200),
      bodyHtmlLength: body.innerHTML.length,
      dialog: dialog ? { width: dialog.width, height: dialog.height } : null,
      shell: shell ? { width: shell.width, height: shell.height } : null,
      toolbar: toolbar ? { width: toolbar.width, height: toolbar.height } : null,
      region: region ? { width: region.width, height: region.height } : null,
      workbenchToolbar: workbenchToolbar ? { width: workbenchToolbar.width, height: workbenchToolbar.height } : null,
      viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
      preview: preview ? { width: preview.width, height: preview.height } : null,
      article: articleRect ? { width: articleRect.width, height: articleRect.height, scrollHeight: article?.scrollHeight ?? 0, scrollTop: article?.scrollTop ?? 0 } : null,
      articleCanScroll: article ? article.scrollHeight > article.clientHeight + 40 : false,
      errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').length,
      mobileModeDisplay: mobileModeSelect ? getComputedStyle(mobileModeSelect).display : null,
      desktopSegmentsDisplay: desktopSegments ? getComputedStyle(desktopSegments).display : null,
      desktopToolsDisplay: desktopTools ? getComputedStyle(desktopTools).display : null,
      mobileToolsDisplay: mobileMore ? getComputedStyle(mobileMore).display : null,
      oversized,
    };
  });
  if (!metrics.dialog || metrics.dialog.width < 320 || metrics.dialog.height < 320) {
    throw new Error(`Preview dialog has invalid size: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.viewport || metrics.viewport.width < 240 || metrics.viewport.height < 180) {
    throw new Error(`Preview viewport has invalid size: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.region || metrics.region.height < 180) {
    throw new Error(`Preview workbench region collapsed: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.article || !metrics.articleCanScroll) {
    throw new Error(`Markdown preview is not a scrollable article: ${JSON.stringify(metrics)}`);
  }
  if (metrics.errorCount > 0) throw new Error('Preview rendered through an error boundary');
  if (metrics.bodyHtmlLength < 1000 || !metrics.bodyText.includes('文件管理器')) {
    throw new Error(`File manager shell looks blank: ${JSON.stringify(metrics)}`);
  }
  if (mobile) {
    if (metrics.dialog.width > metrics.innerWidth + 2 || metrics.dialog.height > metrics.innerHeight + 2) {
      throw new Error(`Mobile preview dialog exceeds visual viewport: ${JSON.stringify(metrics)}`);
    }
    if (metrics.scrollWidth > metrics.innerWidth + 24) {
      throw new Error(`Mobile preview has horizontal page overflow: ${JSON.stringify(metrics)}`);
    }
    if (metrics.toolbar && metrics.toolbar.height > 116) {
      throw new Error(`Mobile preview toolbar is stacked too tall: ${JSON.stringify(metrics)}`);
    }
    if (metrics.workbenchToolbar && metrics.workbenchToolbar.height > 56) {
      throw new Error(`Mobile workbench toolbar is stacked too tall: ${JSON.stringify(metrics)}`);
    }
    if (metrics.mobileModeDisplay === 'none' || metrics.desktopSegmentsDisplay !== 'none' || metrics.desktopToolsDisplay !== 'none') {
      throw new Error(`Mobile preview shows desktop controls or hides mobile selector: ${JSON.stringify(metrics)}`);
    }
    if (metrics.oversized.length) {
      throw new Error(`Mobile preview has oversized elements: ${JSON.stringify(metrics)}`);
    }
  }
}

async function run() {
  const { rootId, smokeDir, filePath } = await createSmokeMarkdown();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await openSmokeFile(page, smokeDir, filePath);
    const desktopModes = page.locator('[data-document-workbench-desktop-mode-segments]');
    await desktopModes.getByRole('button', { name: '预览', exact: true }).click({ timeout: 30_000 });
    await waitForMarkdownPreview(page);
    await assertPreviewMetrics(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForSelector('[data-document-workbench-mobile-mode-select]', { timeout: 30_000 });
    await assertPreviewMetrics(page, { mobile: true });

    await page.getByLabel('选择文件视图模式').selectOption('split');
    await page.waitForSelector('[data-split-source-editor="true"]', { timeout: 30_000 });
    await page.waitForSelector('[data-document-preview-kind="markdown"]', { timeout: 30_000 });
    await assertPreviewMetrics(page, { mobile: true });

    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during preview smoke:\n${logs.join('\n')}`);
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
