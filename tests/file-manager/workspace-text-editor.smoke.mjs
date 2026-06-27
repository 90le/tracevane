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
    await page.goto(`${BASE_URL}/#/workspace`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-tree-kind="file"][data-tree-path]').length > 0,
      null,
      { timeout: 60_000 },
    );

    const textPath = await page.evaluate(() => {
      const textExtensions = ['.md', '.mjs', '.js', '.ts', '.tsx', '.sh', '.json', '.html', '.css', '.txt', '.log', '.env'];
      const rows = [...document.querySelectorAll('[data-tree-kind="file"][data-tree-path]')];
      const row = rows.find((node) => {
        const path = node.getAttribute('data-tree-path')?.toLowerCase() ?? '';
        return textExtensions.some((extension) => path.endsWith(extension));
      });
      return row?.getAttribute('data-tree-path') ?? null;
    });
    if (!textPath) throw new Error('No text-like file row found in Workspace explorer root.');

    const escapedPath = textPath.replaceAll('"', '\\"');
    const textRow = page.locator(`[data-tree-kind="file"][data-tree-path="${escapedPath}"]`).first();
    await textRow.scrollIntoViewIfNeeded();
    await textRow.dblclick({ force: true });

    await page.waitForSelector('[data-document-workbench-viewport]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.waitForSelector('.monaco-editor', { timeout: 30_000 });

    const metrics = await page.evaluate(() => {
      const editor = document.querySelector('[data-code-editor="monaco-direct"]')?.getBoundingClientRect();
      const monacoEditor = document.querySelector('.monaco-editor')?.getBoundingClientRect();
      const viewport = document.querySelector('[data-document-workbench-viewport]')?.getBoundingClientRect();
      return {
        editor: editor ? { width: editor.width, height: editor.height } : null,
        monacoEditor: monacoEditor ? { width: monacoEditor.width, height: monacoEditor.height } : null,
        viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
        bodyText: document.body.innerText.slice(0, 1000),
      };
    });

    if (!metrics.editor || metrics.editor.height < 180 || metrics.editor.width < 300) {
      throw new Error(`Workspace code editor has invalid size: ${JSON.stringify(metrics)}`);
    }
    if (!metrics.monacoEditor || metrics.monacoEditor.height < 180 || metrics.monacoEditor.width < 300) {
      throw new Error(`Workspace Monaco editor did not render: ${JSON.stringify(metrics)}`);
    }
    const fatalLogs = logs.filter((line) =>
      line.includes('Invalid hook call') ||
      line.includes("Cannot read properties of null (reading 'useState')") ||
      line.includes('[pageerror]'));
    if (fatalLogs.length > 0) {
      throw new Error(`Workspace text editor emitted fatal browser logs:\n${fatalLogs.join('\n')}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
