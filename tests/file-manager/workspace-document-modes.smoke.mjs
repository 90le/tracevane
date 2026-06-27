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
  return [
    `# Workspace modes ${marker}`,
    '',
    'This Markdown file verifies Workspace same-tab document modes.',
    '',
    '- [ ] task one',
    '- [x] task two',
    '',
    '| column | value |',
    '| --- | --- |',
    `| marker | ${marker} |`,
    '',
    '```mermaid',
    'flowchart TD',
    '  A[Workspace] --> B[Same tab preview]',
    '```',
    '',
    `<div><strong>HTML marker ${marker}</strong></div>`,
  ].join('\n');
}

async function createWorkspaceMarkdown() {
  const summary = await api('/api/files/summary');
  const roots = summary.roots ?? [];
  const rootId = roots.find((root) => root.id === 'project-root')?.id
    ?? roots.find((root) => root.preferred)?.id
    ?? roots.find((root) => root.id === summary.defaultRootId)?.id
    ?? roots[0]?.id;
  if (!rootId) throw new Error('No Workspace root is available');
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filePath = `tracevane-workspace-modes-${marker}.md`;
  await api('/api/files/files', {
    method: 'POST',
    body: JSON.stringify({ rootId, directoryPath: '', name: filePath, content: markdownFixture(marker), overwrite: true }),
  });
  return { rootId, filePath, marker };
}

async function cleanup(rootId, filePath) {
  await api('/api/files', {
    method: 'DELETE',
    body: JSON.stringify({ rootId, paths: [filePath], permanent: true }),
  }).catch(() => undefined);
}

async function assertWorkbenchHealthy(page, filePath, mode) {
  const metrics = await page.evaluate(({ path, mode }) => {
    const doc = document.documentElement;
    const body = document.body;
    const tab = document.querySelector(`[data-workspace-editor-tab="${CSS.escape(path)}"]`)?.getBoundingClientRect();
    const viewport = document.querySelector('[data-document-workbench-viewport]')?.getBoundingClientRect();
    const workbench = document.querySelector('[data-document-workbench-body]')?.getBoundingClientRect();
    const modal = document.querySelector('[data-file-preview-dialog]');
    const editor = document.querySelector('[data-code-editor="monaco-direct"]')?.getBoundingClientRect();
    const monaco = document.querySelector('.monaco-editor')?.getBoundingClientRect();
    const splitSource = document.querySelector('[data-split-source-editor="true"]')?.getBoundingClientRect();
    const previewKinds = Array.from(document.querySelectorAll('[data-document-preview-kind]')).map((node) => node.getAttribute('data-document-preview-kind'));
    return {
      mode,
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      scrollWidth: Math.max(doc.scrollWidth, body.scrollWidth),
      tab: tab ? { width: tab.width, height: tab.height } : null,
      viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
      workbench: workbench ? { width: workbench.width, height: workbench.height } : null,
      editor: editor ? { width: editor.width, height: editor.height } : null,
      monaco: monaco ? { width: monaco.width, height: monaco.height } : null,
      splitSource: splitSource ? { width: splitSource.width, height: splitSource.height } : null,
      previewKinds,
      modalCount: modal ? 1 : 0,
      errorCount: document.querySelectorAll('[data-file-manager-modal-error-boundary], [data-file-preview-error-boundary]').length,
      bodyText: body.innerText.slice(0, 1600),
    };
  }, { path: filePath, mode });
  if (!metrics.tab) throw new Error(`Workspace active tab missing: ${JSON.stringify(metrics)}`);
  if (!metrics.viewport || metrics.viewport.height < 180 || metrics.viewport.width < 300) {
    throw new Error(`Workspace workbench viewport invalid: ${JSON.stringify(metrics)}`);
  }
  if (!metrics.workbench || metrics.workbench.height < 180) {
    throw new Error(`Workspace workbench body collapsed: ${JSON.stringify(metrics)}`);
  }
  if (metrics.modalCount) {
    throw new Error(`Workspace mode switch opened FileManager preview dialog instead of same-tab view: ${JSON.stringify(metrics)}`);
  }
  if (metrics.errorCount) throw new Error(`Workspace rendered error boundary: ${JSON.stringify(metrics)}`);
  if (mode === 'source') {
    if (!metrics.editor || metrics.editor.height < 160 || !metrics.monaco || metrics.monaco.height < 160) {
      throw new Error(`Workspace Monaco source editor invalid in ${mode}: ${JSON.stringify(metrics)}`);
    }
  }
  if (mode === 'split') {
    if (!metrics.splitSource || metrics.splitSource.height < 160 || metrics.splitSource.width < 260) {
      throw new Error(`Workspace split source editor invalid in ${mode}: ${JSON.stringify(metrics)}`);
    }
  }
  if (mode === 'preview' || mode === 'split') {
    if (!metrics.previewKinds.includes('markdown')) {
      throw new Error(`Workspace markdown preview missing in ${mode}: ${JSON.stringify(metrics)}`);
    }
  }
  if (mode === 'visual') {
    if (!metrics.bodyText.includes('Workspace modes') || !metrics.bodyText.includes('HTML marker')) {
      throw new Error(`Workspace visual editor did not render editable markdown/html content: ${JSON.stringify(metrics)}`);
    }
  }
}

async function run() {
  const { rootId, filePath } = await createWorkspaceMarkdown();
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
  try {
    await page.goto(`${BASE_URL}/#/workspace`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(`[data-tree-kind="file"][data-tree-path="${filePath}"]`, { timeout: 60_000 });
    const row = page.locator(`[data-tree-kind="file"][data-tree-path="${filePath}"]`).first();
    await row.scrollIntoViewIfNeeded();
    await row.dblclick({ force: true });

    await page.waitForSelector(`[data-workspace-editor-tab="${filePath}"]`, { timeout: 30_000 });
    await page.waitForSelector('[data-document-workbench-viewport]', { timeout: 30_000 });
    await page.waitForSelector('[data-code-editor="monaco-direct"]', { timeout: 30_000 });
    await page.waitForSelector('.monaco-editor', { timeout: 30_000 });
    await assertWorkbenchHealthy(page, filePath, 'source');

    await page.locator('[data-workspace-editor-mode="preview"]').click();
    await page.waitForSelector('[data-document-preview-kind="markdown"]', { timeout: 30_000 });
    await assertWorkbenchHealthy(page, filePath, 'preview');

    await page.locator('[data-workspace-editor-mode="split"]').click();
    await page.waitForSelector('[data-split-source-editor="true"]', { timeout: 30_000 });
    await page.waitForSelector('[data-document-preview-kind="markdown"]', { timeout: 30_000 });
    await assertWorkbenchHealthy(page, filePath, 'split');

    await page.locator('[data-workspace-editor-mode="visual"]').click();
    await page.waitForSelector('[data-visual-document-editor-shell]', { timeout: 30_000 });
    await page.waitForSelector('[data-markdown-visual-scrollport]', { timeout: 30_000 });
    await assertWorkbenchHealthy(page, filePath, 'visual');

    const fatalLogs = logs.filter((line) =>
      line.includes('Invalid hook call') ||
      line.includes("Cannot read properties of null (reading 'useState')") ||
      line.includes('[pageerror]')
    );
    if (fatalLogs.length > 0) {
      throw new Error(`Workspace document modes emitted fatal browser logs:\n${fatalLogs.join('\n')}`);
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
