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

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 288 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 260,
      bottomSize: 260, rightWidth: 420, maximized: false, activePanelId: 'output',
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

async function waitForNode(page, targetPath) {
  await page.locator(nodeSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function expandDirectory(page, targetPath) {
  await waitForNode(page, targetPath);
  const row = page.locator(nodeSelector(targetPath)).first();
  const expanded = await row.getAttribute('aria-expanded');
  if (expanded === 'true') return;
  await row.dblclick();
  await page.waitForFunction(
    (selector) => document.querySelector(selector)?.getAttribute('aria-expanded') === 'true',
    nodeSelector(targetPath),
    { timeout: 30_000 },
  );
}

async function revealPath(page, targetPath, basePath = '') {
  const parts = normalizePortablePath(targetPath).split('/').filter(Boolean);
  const baseParts = normalizePortablePath(basePath).split('/').filter(Boolean);
  const baseMatches = baseParts.length > 0 && baseParts.every((part, index) => parts[index] === part);
  const startIndex = baseMatches ? baseParts.length + 1 : 1;
  for (let index = startIndex; index < parts.length; index += 1) {
    await expandDirectory(page, parts.slice(0, index).join('/'));
  }
  await waitForNode(page, targetPath);
}

async function openFromExplorer(page, targetPath, basePath = '') {
  await revealPath(page, targetPath, basePath);
  await page.locator(nodeSelector(targetPath)).first().dblclick();
  await page.locator(tabSelector(targetPath)).first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function run() {
  const summary = await api('/api/files/summary');
  const roots = summary.roots ?? [];
  const root = roots.find((item) => item.absolutePath && item.absolutePath !== '/' && process.cwd().startsWith(item.absolutePath))
    ?? roots.find((item) => item.id === summary.defaultRootId && item.absolutePath && item.absolutePath !== '/')
    ?? roots.find((item) => item.absolutePath && item.absolutePath !== '/')
    ?? roots[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE LSP rename/format/code-action smoke');

  const prefix = `tracevane-ide-lsp-rename-format-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeDir = explorerDirectoryPath ? `${explorerDirectoryPath}/.${prefix}` : `.${prefix}`;
  const tsPath = `${smokeDir}/rename-format.ts`;
  const tsContent = 'function tracevaneAlpha(value:number){return value+1}\nconst result=tracevaneAlpha(1)\nexport { result }\n';

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, tsPath, tsContent);

  try {
    const rename = await api('/api/lsp/rename', {
      method: 'POST',
      body: JSON.stringify({
        type: 'rename', rootId, path: tsPath, language: 'typescript', content: tsContent,
        line: 1, column: 10, newName: 'tracevaneBeta',
      }),
    });
    const renameEdits = Object.values(rename.workspaceEdit?.changes ?? {}).flat();
    if (rename.provider !== 'typescript' || renameEdits.length < 2 || !renameEdits.every((edit) => edit.newText === 'tracevaneBeta')) {
      throw new Error(`TypeScript rename response mismatch: ${JSON.stringify(rename)}`);
    }

    const formatting = await api('/api/lsp/formatting', {
      method: 'POST',
      body: JSON.stringify({ type: 'formatting', rootId, path: tsPath, language: 'typescript', content: tsContent, tabSize: 2, insertSpaces: true }),
    });
    if (formatting.provider !== 'typescript' || !Array.isArray(formatting.textEdits) || formatting.textEdits.length === 0) {
      throw new Error(`TypeScript formatting response mismatch: ${JSON.stringify(formatting)}`);
    }

    const actions = await api('/api/lsp/code-actions', {
      method: 'POST',
      body: JSON.stringify({ type: 'codeAction', rootId, path: tsPath, language: 'typescript', content: tsContent }),
    });
    if (actions.provider !== 'typescript' || !actions.actions?.some((action) => action.title.includes('Format document') && action.workspaceEdit?.changes)) {
      throw new Error(`TypeScript code action response mismatch: ${JSON.stringify(actions)}`);
    }

    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const logs = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));
    try {
      await page.goto(`${BASE_URL}/#/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 30_000 });
      await openFromExplorer(page, tsPath, explorerDirectoryPath);
      await page.locator(`[data-ide-monaco-editor-panel][data-ide-editor-file-path="${cssAttr(tsPath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-editor-action-menu-trigger]').click();
      await page.locator('[data-ide-editor-action-menu]').waitFor({ state: 'visible', timeout: 10_000 });
      for (const action of ['action-lsp-rename', 'action-lsp-format', 'action-lsp-code-action']) {
        await page.locator(`[data-ide-editor-tab-menu-item="${action}"]`).waitFor({ state: 'visible', timeout: 10_000 });
      }
    } finally {
      await browser.close();
    }
    if (logs.some((line) => /pageerror|Unhandled|TypeError|ReferenceError/.test(line))) {
      throw new Error(`Unexpected browser errors:\n${logs.join('\n')}`);
    }
  } finally {
    await cleanup(rootId, [smokeDir]);
  }

  console.log('ide-lsp-rename-format-code-actions smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
