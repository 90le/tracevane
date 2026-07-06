import { chromium } from '@playwright/test';
import path from 'node:path';

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

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function tabSelector(pathValue) {
  return `[data-ide-editor-tab-path="${cssAttr(pathValue)}"]`;
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 260,
      bottomSize: 260, rightWidth: 420, maximized: false, activePanelId: 'problems',
    },
    viewPlacements: [
      { viewId: 'explorer', placement: 'primary-sidebar', order: 0, visible: true },
      { viewId: 'terminal', placement: 'panel', order: 0, visible: true },
      { viewId: 'problems', placement: 'panel', order: 1, visible: true },
      { viewId: 'output', placement: 'panel', order: 2, visible: true },
      { viewId: 'debugConsole', placement: 'panel', order: 3, visible: true },
    ],
    editorGroups: [{ id: 'main', activeTabId: null, tabs: [] }],
    activeEditorGroupId: 'main',
    dockviewLayout: null,
  };
}

async function createDirectory(rootId, targetPath) {
  const directoryPath = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
  const name = targetPath.includes('/') ? targetPath.slice(targetPath.lastIndexOf('/') + 1) : targetPath;
  await api('/api/files/directories', { method: 'POST', body: JSON.stringify({ rootId, directoryPath, name }) });
}

async function ensureDirectory(rootId, targetPath) {
  const normalized = normalizePortablePath(targetPath);
  if (!normalized) return;
  await api(`/api/files/browse?${new URLSearchParams({ rootId, path: normalized, hidden: 'true' }).toString()}`).catch(async () => {
    const parent = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';
    await ensureDirectory(rootId, parent);
    await createDirectory(rootId, normalized).catch((error) => {
      if (String(error?.message || error).toLowerCase().includes('exists')) return;
      throw error;
    });
  });
}

async function createFile(rootId, targetPath, content = '') {
  const directoryPath = targetPath.includes('/') ? targetPath.slice(0, targetPath.lastIndexOf('/')) : '';
  const name = targetPath.includes('/') ? targetPath.slice(targetPath.lastIndexOf('/') + 1) : targetPath;
  await api('/api/files/files', { method: 'POST', body: JSON.stringify({ rootId, directoryPath, name, content, overwrite: true }) });
}

async function cleanup(rootId, paths) {
  await api('/api/files', { method: 'DELETE', body: JSON.stringify({ rootId, paths, permanent: true }) }).catch(() => undefined);
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE problems/output smoke');

  const prefix = `tracevane-ide-problems-output-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const filePath = `${smokeDir}/problem.ts`;

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, filePath, 'const answer = 42;\nconsole.log(answer);\n');

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-problems-panel]').waitFor({ state: 'visible', timeout: 30_000 });

    await page.evaluate(({ rootId, filePath }) => {
      window.dispatchEvent(new CustomEvent('tracevane:ide-problem', {
        detail: {
          id: 'smoke-problem-1',
          rootId,
          path: filePath,
          severity: 'error',
          source: 'custom',
          message: 'Smoke structured problem',
          startLine: 2,
          startColumn: 1,
          code: 'SMOKE001',
        },
      }));
      window.dispatchEvent(new CustomEvent('tracevane:ide-output', {
        detail: {
          channel: { id: 'smoke', label: 'Smoke Output', kind: 'custom' },
          level: 'info',
          text: 'Smoke output line',
        },
      }));
    }, { rootId, filePath });

    await page.locator('[data-ide-problems-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-problem-row][data-ide-problem-path="' + cssAttr(filePath) + '"]').waitFor({ state: 'visible', timeout: 30_000 });
    const problemText = await page.locator('[data-ide-problem-row]').first().innerText();
    if (!problemText.includes('Smoke structured problem') || !problemText.includes('SMOKE001')) throw new Error(`problem row mismatch: ${problemText}`);
    await page.locator('[data-ide-problem-row]').first().click();
    await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(filePath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });

    await page.getByRole('button', { name: 'Output', exact: true }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-output-channel-select]').selectOption('smoke');
    await page.locator('[data-ide-output-event]').waitFor({ state: 'visible', timeout: 30_000 });
    const outputText = await page.locator('[data-ide-output-events]').innerText();
    if (!outputText.includes('Smoke output line')) throw new Error(`output line missing: ${outputText}`);
    await page.locator('[data-ide-output-clear]').click();
    await page.locator('[data-ide-output-empty]').waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      panelText: document.querySelector('[data-ide-panel]')?.textContent?.slice(0, 1600),
      body: document.body.innerText.slice(0, 1800),
    })).catch(() => null);
    throw new Error(`${error instanceof Error ? error.stack || error.message : String(error)}\nState: ${JSON.stringify(state, null, 2)}\nConsole logs:\n${logs.join('\n')}`);
  } finally {
    await browser.close().catch(() => undefined);
    await cleanup(rootId, [smokeDir]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
