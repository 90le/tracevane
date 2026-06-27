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

function markdownVisualFixture(marker) {
  return [
    `# Visual editor smoke ${marker}`,
    '',
    `Original paragraph ${marker}`,
    '',
    '- [ ] task original',
    '- regular original',
    '',
    '| Name | Value |',
    '| --- | --- |',
    `| alpha | ${marker} |`,
    '',
    '```js',
    'console.log("original fence");',
    '```',
    '',
    '<section><strong>HTML original</strong><p>visible original</p></section>',
  ].join('\n');
}

async function createSmokeMarkdown() {
  const summary = await api('/api/files/summary');
  const rootId = summary.defaultRootId ?? summary.roots?.[0]?.id;
  if (!rootId) throw new Error('No file-manager root is available');
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `tracevane-visual-editor-smoke-${marker}.md`;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: filePath, content: markdownVisualFixture(marker), overwrite: true }),
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
  const rowPath = await row.getAttribute('data-file-manager-entry-path');
  if (rowPath !== filePath) throw new Error(`Expected to open ${filePath}, row resolved to ${rowPath}`);
  await row.click({ force: true });
  await row.focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('[data-file-preview-dialog]', { timeout: 30_000 });
  await page.waitForSelector('[data-file-preview-editor-shell]', { timeout: 30_000 });
  try {
    await page.waitForFunction(
      (path) => document.querySelector('[data-file-preview-editor-shell]')?.getAttribute('data-file-preview-path') === path,
      filePath,
      { timeout: 30_000 },
    );
  } catch (error) {
    const debug = await page.evaluate((expectedPath) => ({
      expectedPath,
      currentPreviewPath: document.querySelector('[data-file-preview-editor-shell]')?.getAttribute('data-file-preview-path') ?? null,
      dialogText: document.querySelector('[data-file-preview-dialog]')?.textContent?.slice(0, 1200) ?? null,
      selectedRows: Array.from(document.querySelectorAll('[data-file-manager-entry-selected=\"true\"]')).map((node) => node.getAttribute('data-file-manager-entry-path')),
    }), filePath);
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nOpen file debug: ${JSON.stringify(debug, null, 2)}`);
  }
  await page.waitForSelector('[data-document-workbench-viewport]', { timeout: 30_000 });
}

async function selectVisualMode(page) {
  const mobileSelect = page.getByLabel('选择文件视图模式');
  if ((await mobileSelect.count()) && (await mobileSelect.first().isVisible())) {
    await mobileSelect.selectOption('visual');
  } else {
    const segments = page.locator('[data-document-workbench-desktop-mode-segments]');
    await segments.waitFor({ timeout: 30_000 });
    await segments.getByRole('button', { name: '预览时编辑' }).click();
  }
  try {
    await page.waitForSelector('[data-visual-document-editor-shell]', { timeout: 30_000 });
  } catch (error) {
    const debug = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 1800),
      modeButtons: Array.from(document.querySelectorAll('[data-document-workbench-desktop-mode-segments] button')).map((node) => ({
        text: node.textContent,
        className: node.getAttribute('class'),
      })),
      modeSelect: document.querySelector('[aria-label="选择文件视图模式"]')?.outerHTML ?? null,
      viewport: document.querySelector('[data-document-workbench-viewport]')?.outerHTML.slice(0, 1600) ?? null,
      previewKinds: Array.from(document.querySelectorAll('[data-document-preview-kind]')).map((node) => node.getAttribute('data-document-preview-kind')),
      errors: Array.from(document.querySelectorAll('[data-file-preview-error-boundary], [data-file-manager-modal-error-boundary]')).map((node) => node.textContent),
    }));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nVisual mode debug: ${JSON.stringify(debug, null, 2)}`);
  }
}

async function editInlinePlaintext(locator, nextText) {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await locator.evaluate((node, value) => {
    node.textContent = value;
    node.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  }, nextText);
  await locator.blur();
}

async function run() {
  const { rootId, filePath } = await createSmokeMarkdown();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await openFile(page, filePath);
    await selectVisualMode(page);

    const paragraph = page.locator('[data-markdown-visual-block="paragraph"] [data-markdown-inline-editable]').first();
    await editInlinePlaintext(paragraph, 'Edited paragraph from visual smoke');

    const taskBlock = page.locator('[data-markdown-task-list-inline-editor]').first();
    await taskBlock.scrollIntoViewIfNeeded();
    await taskBlock.locator('[data-markdown-task-checkbox]').first().check();
    const taskInput = taskBlock.locator('[data-markdown-list-text-input]').first();
    await taskInput.fill('task edited visually');
    await taskInput.blur();
    await taskBlock.locator('[data-markdown-list-apply]').click();

    const tableBlock = page.locator('[data-markdown-table-inline-editor]').first();
    await tableBlock.scrollIntoViewIfNeeded();
    const valueCell = tableBlock.locator('[data-markdown-table-cell-input]').nth(3);
    await valueCell.fill('table edited visually');
    await valueCell.blur();
    await tableBlock.locator('[data-markdown-table-apply]').click();

    const fenceBlock = page.locator('[data-markdown-fence-inline-editor]').first();
    await fenceBlock.scrollIntoViewIfNeeded();
    await fenceBlock.getByLabel('直接编辑代码块内容').fill('console.log("edited fence visually");');
    await fenceBlock.locator('[data-markdown-fence-apply]').click();

    const htmlBlock = page.locator('[data-markdown-html-inline-editor]').first();
    await htmlBlock.scrollIntoViewIfNeeded();
    await htmlBlock.locator('[data-markdown-html-visible-editor]').waitFor({ timeout: 30_000 });
    const firstHtmlText = htmlBlock.locator('[data-markdown-html-text-node]').first();
    await editInlinePlaintext(firstHtmlText, 'HTML edited visually');
    await htmlBlock.locator('[data-markdown-html-apply]').click();

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('[data-visual-document-editor-shell]')?.getBoundingClientRect();
      const scrollport = document.querySelector('[data-markdown-visual-scrollport]')?.getBoundingClientRect();
      return {
        shell: shell ? { width: shell.width, height: shell.height } : null,
        scrollport: scrollport ? { width: scrollport.width, height: scrollport.height } : null,
        errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').length,
      };
    });
    if (!metrics.shell || metrics.shell.height < 260 || !metrics.scrollport || metrics.scrollport.height < 180) {
      throw new Error(`Markdown visual editor collapsed: ${JSON.stringify(metrics)}`);
    }
    if (metrics.errorCount > 0) throw new Error('Markdown visual editor rendered through an error boundary');

    await page.getByTitle(/保存当前文件/).last().click();
    await page.waitForSelector('[data-file-save-review-dialog]', { timeout: 30_000 });
    await page.getByRole('button', { name: '确认保存' }).click();
    await page.waitForFunction(() => document.body.innerText.includes('✓ 已保存'), null, { timeout: 30_000 });

    const saved = await readFile(rootId, filePath);
    const expectedSnippets = [
      'Edited paragraph from visual smoke',
      '- [x] task edited visually',
      '| alpha | table edited visually |',
      'console.log("edited fence visually");',
      'HTML edited visually',
    ];
    const missing = expectedSnippets.filter((snippet) => !saved.includes(snippet));
    if (missing.length) {
      throw new Error(`Saved Markdown is missing visual edits ${JSON.stringify(missing)}. Saved content:\n${saved}`);
    }
    if (logs.some((line) => line.includes('[pageerror]') || line.includes('Cannot read properties of null') || line.includes('Invalid hook call'))) {
      throw new Error(`Browser page error during Markdown visual editor smoke:\n${logs.join('\n')}`);
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
