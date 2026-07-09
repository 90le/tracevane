import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;
const CHROME = process.env.PLAYWRIGHT_CHROME_EXECUTABLE || '/home/binbin/.local/bin/google-chrome';

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function api(pathname, options = {}) {
  const deadline = Date.now() + 30_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
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
        const error = new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
        error.status = response.status;
        throw error;
      }
      return data;
    } catch (error) {
      lastError = error;
      if (error?.status && error.status < 500) throw error;
      await sleep(250);
    }
  }
  throw lastError;
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function nodeSelector(pathValue) {
  return `[data-ide-explorer-node-path="${cssAttr(pathValue)}"]`;
}

function tabSelector(pathValue) {
  return `[data-ide-editor-tab-path="${cssAttr(pathValue)}"]`;
}

function editorSelector(pathValue) {
  return `[data-code-editor="monaco-direct"][data-path="${cssAttr(pathValue)}"]`;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 320 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom',
      visible: true,
      collapsed: false,
      size: 280,
      bottomSize: 280,
      rightWidth: 420,
      maximized: false,
      activePanelId: 'problems',
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
  const trash = await api(`/api/files/trash?${new URLSearchParams({ rootId }).toString()}`).catch(() => null);
  const trashPaths = (trash?.items ?? [])
    .filter((item) => paths.some((itemPath) => item.originalPath === itemPath || String(item.originalPath || '').startsWith(`${itemPath}/`)))
    .map((item) => item.trashPath);
  if (trashPaths.length) {
    await api('/api/files/trash', { method: 'DELETE', body: JSON.stringify({ rootId, trashPaths }) }).catch(() => undefined);
  }
}

async function openAndAssertLanguage(page, filePath, language) {
  await page.locator(nodeSelector(filePath)).first().dblclick();
  await page.locator(tabSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(filePath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator(editorSelector(filePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForFunction(
    ({ selector, language }) => document.querySelector(selector)?.getAttribute('data-editor-language') === language,
    { selector: editorSelector(filePath), language },
    { timeout: 30_000 },
  );
  const actions = await page.locator(editorSelector(filePath)).first().getAttribute('data-code-editor-supported-actions');
  for (const action of ['actions.find', 'editor.action.quickCommand', 'editor.action.triggerSuggest']) {
    if (!actions?.split(',').includes(action)) throw new Error(`${filePath} missing Monaco action ${action}; actions=${actions}`);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE web stack smoke');

  const prefix = `tracevane-ide-web-stack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const explorerDirectoryPath = relativePathFromRoot(root.absolutePath, process.cwd());
  const smokeParent = explorerDirectoryPath ? `${explorerDirectoryPath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const files = [
    { path: `${smokeDir}/dep.ts`, language: 'typescript', content: 'export const fromDep = 42;\n' },
    { path: `${smokeDir}/app.ts`, language: 'typescript', content: 'import { fromDep } from "./dep.js";\nconst answer: string = fromDep;\nexport { answer };\n' },
    { path: `${smokeDir}/widget.js`, language: 'javascript', content: 'export function widget(label) {\n  return `${label}-ok`;\n}\n' },
    { path: `${smokeDir}/config.json`, language: 'json', content: '{\n  "name": "tracevane",\n  "enabled": true\n}\n' },
    { path: `${smokeDir}/index.html`, language: 'html', content: '<!doctype html>\n<html><body><main id="app"></main></body></html>\n' },
    { path: `${smokeDir}/styles.css`, language: 'css', content: ':root { color-scheme: light dark; }\n.app { display: grid; }\n' },
  ];

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  for (const file of files) await createFile(rootId, file.path, file.content);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(smokeDir), terminalLayouts: {} }),
  });

  const appFile = files.find((file) => file.path.endsWith('/app.ts'));
  if (!appFile) throw new Error('Smoke fixture missing app.ts');

  const direct = await api('/api/lsp/diagnostics', {
    method: 'POST',
    body: JSON.stringify({ type: 'diagnose', rootId, path: appFile.path, language: 'typescript', content: appFile.content }),
  });
  if (!direct.diagnostics?.some((diagnostic) => diagnostic.code === 'TS2322')) {
    throw new Error(`direct TypeScript diagnostics missing TS2322: ${JSON.stringify(direct.diagnostics)}`);
  }
  if (direct.diagnostics?.some((diagnostic) => diagnostic.code === 'TS2792' || diagnostic.code === 'TS2307')) {
    throw new Error(`direct TypeScript diagnostics should resolve ./dep.js to dep.ts: ${JSON.stringify(direct.diagnostics)}`);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (expectedPath) => (document.querySelector('[data-ide-explorer-path]')?.textContent || '').trim() === expectedPath,
      smokeDir,
      { timeout: 30_000 },
    );
    await page.locator('[data-ide-problems-panel]').waitFor({ state: 'visible', timeout: 30_000 });

    for (const file of files) await openAndAssertLanguage(page, file.path, file.language);

    await page.locator(`[data-ide-problem-row][data-ide-problem-path="${cssAttr(appFile.path)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
    const problemText = await page.locator(`[data-ide-problem-row][data-ide-problem-path="${cssAttr(appFile.path)}"]`).first().innerText();
    if (!problemText.includes('TS2322') || !problemText.includes('lsp')) throw new Error(`TypeScript problem row mismatch: ${problemText}`);

    await page.getByRole('button', { name: 'Output', exact: true }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-output-channel-select]').selectOption('lsp');
    await page.locator('[data-ide-output-event]', { hasText: `TypeScript diagnostics active: ${appFile.path}` }).first().waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      explorerPath: document.querySelector('[data-ide-explorer-path]')?.textContent,
      tabs: [...document.querySelectorAll('[data-ide-editor-tab-path]')].map((node) => ({ path: node.getAttribute('data-ide-editor-tab-path'), text: node.textContent })),
      editors: [...document.querySelectorAll('[data-code-editor="monaco-direct"]')].map((node) => ({ path: node.getAttribute('data-path'), language: node.getAttribute('data-editor-language'), actions: node.getAttribute('data-code-editor-supported-actions') })),
      body: document.body.innerText.slice(0, 2400),
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
