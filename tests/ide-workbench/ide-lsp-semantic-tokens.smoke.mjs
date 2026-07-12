import { chromium } from '@playwright/test';
import path from 'node:path';
import { WebSocket } from 'ws';

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
        error.data = data;
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

function wsUrl(pathname) {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname;
  url.search = '';
  return url.toString();
}

async function requestGatewayEvent(payload) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl('/ws/lsp'));
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error('LSP WebSocket semantic tokens timeout'));
    }, 10_000);
    socket.on('error', reject);
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      if (event.type === 'ready') {
        socket.send(JSON.stringify(payload));
        return;
      }
      if (event.type === 'semanticTokens') {
        clearTimeout(timeout);
        socket.close();
        resolve(event);
        return;
      }
      if (event.type === 'error') {
        clearTimeout(timeout);
        socket.close();
        reject(new Error(event.message || 'LSP WebSocket error'));
      }
    });
  });
}

function cssAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
      placement: 'bottom', visible: true, collapsed: false, size: 280,
      bottomSize: 280, rightWidth: 420, maximized: false, activePanelId: 'output',
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

function assertSemanticTokens(response, label) {
  if (response.type !== 'semanticTokens' || response.provider !== 'typescript') {
    throw new Error(`${label} semantic tokens response type/provider mismatch: ${JSON.stringify(response)}`);
  }
  if (!response.legend?.tokenTypes?.includes('class') || !response.legend?.tokenTypes?.includes('variable')) {
    throw new Error(`${label} semantic token legend missing expected token types: ${JSON.stringify(response.legend)}`);
  }
  if (!Array.isArray(response.data) || response.data.length === 0 || response.data.length % 5 !== 0) {
    throw new Error(`${label} semantic token data is not valid full-token encoding: ${JSON.stringify(response)}`);
  }
  if (response.tokenCount !== response.data.length / 5 || response.tokenCount > 20_000) {
    throw new Error(`${label} semantic token count mismatch or unbounded: ${JSON.stringify(response)}`);
  }
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE LSP semantic tokens smoke');

  const status = await api('/api/lsp/status');
  if (!status.features?.includes('semanticTokens')) {
    throw new Error(`LSP status does not advertise semanticTokens: ${JSON.stringify(status)}`);
  }

  const prefix = `tracevane-ide-lsp-semantic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const explorerDirectoryPath = repoParentRelativePath;
  const smokeDir = explorerDirectoryPath ? `${explorerDirectoryPath}/.${prefix}` : `.${prefix}`;
  const tsPath = `${smokeDir}/semantic.ts`;

  await cleanup(rootId, [smokeDir]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(explorerDirectoryPath), terminalLayouts: {} }),
  });
  await ensureDirectory(rootId, smokeDir);
  const tsContent = [
    'interface TracevaneMessage { value: string }',
    'class TracevaneSemanticSmoke {',
    '  readonly answer: number = 42;',
    '  format(message: TracevaneMessage): string {',
    '    const suffix = "semantic";',
    '    return `${message.value}-${suffix}-${this.answer}`;',
    '  }',
    '}',
    'export const semanticSmoke = new TracevaneSemanticSmoke();',
    '',
  ].join('\n');
  await createFile(rootId, tsPath, tsContent);

  const payload = { type: 'semanticTokens', rootId, path: tsPath, language: 'typescript', content: tsContent, version: 1 };
  const direct = await api('/api/lsp/semantic-tokens', { method: 'POST', body: JSON.stringify(payload) });
  assertSemanticTokens(direct, 'direct');

  const gateway = await requestGatewayEvent(payload);
  assertSemanticTokens(gateway, 'gateway');

  let unsupportedFailed = false;
  try {
    await api('/api/lsp/semantic-tokens', {
      method: 'POST',
      body: JSON.stringify({ ...payload, language: 'json' }),
    });
  } catch (error) {
    unsupportedFailed = error.status === 400 && String(error.data?.message || error.message).includes('TypeScript/JavaScript');
  }
  if (!unsupportedFailed) throw new Error('Unsupported semantic token language did not fail with a bounded 400 response');

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
    await page.getByRole('button', { name: 'Output', exact: true }).click();
    await page.locator('[data-ide-output-panel]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-output-channel-select]').selectOption('lsp');
    await page.locator('[data-ide-output-event]', { hasText: 'semantic tokens' }).waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    const state = await page.evaluate(() => ({
      url: location.href,
      body: document.body.innerText.slice(0, 2200),
      output: document.querySelector('[data-ide-output-panel]')?.textContent?.slice(0, 1600),
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
