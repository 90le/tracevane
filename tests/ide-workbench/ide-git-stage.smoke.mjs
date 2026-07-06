import { chromium } from '@playwright/test';
import path from 'node:path';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

function gitApiRootId(rootId) {
  return rootId === 'openclaw-root' ? 'system-root' : rootId;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'explorer',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 320 },
    secondarySideBar: { placement: 'right', visible: false, collapsed: true, width: 280 },
    explorer: { directoryPath },
    panel: {
      placement: 'bottom', visible: true, collapsed: false, size: 240,
      bottomSize: 240, rightWidth: 420, maximized: false, activePanelId: 'output',
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

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git smoke');

  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, process.cwd());
  if (!repoParentRelativePath && path.resolve(root.absolutePath) !== path.resolve(process.cwd())) {
    throw new Error(`Smoke repo is outside selected root: ${root.absolutePath} vs ${process.cwd()}`);
  }
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const gitFilePath = normalizePortablePath(`${repoParentRelativePath}/tests/ide-workbench/git-stage-smoke-${suffix}.txt`);

  await cleanup(rootId, [gitFilePath]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(repoParentRelativePath), terminalLayouts: {} }),
  });
  await createFile(rootId, gitFilePath, `tracevane git stage smoke ${suffix}\n`);

  const status = await api(`/api/git/status?${new URLSearchParams({ rootId: gitApiRootId(rootId), path: repoParentRelativePath }).toString()}`);
  const expectedRepoPath = normalizePortablePath(path.relative(process.cwd(), path.resolve(root.absolutePath, gitFilePath)));
  if (!status.available) throw new Error(`Git status unavailable: ${status.message}`);
  if (!status.changes?.some((change) => change.path === expectedRepoPath && change.kind === 'untracked')) {
    throw new Error(`Git status did not include diff smoke file ${expectedRepoPath}: ${JSON.stringify(status.changes?.slice(0, 20))}`);
  }

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(repoParentRelativePath) });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 45_000 });

    await page.locator('[data-ide-activity-bar]').getByRole('button', { name: 'Source Control' }).click();
    await page.locator('[data-ide-source-control-view]').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator(`[data-ide-source-control-change-path="${cssAttr(gitFilePath)}"]`).waitFor({ state: 'visible', timeout: 30_000 });

    const diffPayload = await api(`/api/git/diff?${new URLSearchParams({ rootId: gitApiRootId(rootId), path: repoParentRelativePath, file: expectedRepoPath, untracked: 'true' }).toString()}`);
    const expectedContent = `tracevane git stage smoke ${suffix}\n`;
    const hasContentPayload = 'originalContent' in diffPayload || 'modifiedContent' in diffPayload;
    if (hasContentPayload) {
      if (diffPayload.originalContent !== '' || diffPayload.modifiedContent !== expectedContent) {
        throw new Error(`Unexpected API diff content payload: ${JSON.stringify({
          originalContent: diffPayload.originalContent,
          modifiedContent: diffPayload.modifiedContent,
          binary: diffPayload.binary,
          contentTruncated: diffPayload.contentTruncated,
          originalPath: diffPayload.originalPath,
          modifiedPath: diffPayload.modifiedPath,
        }, null, 2)}`);
      }
    } else if (!String(diffPayload.diff || '').includes(expectedContent.trim())) {
      throw new Error(`Unexpected API unified diff payload: ${JSON.stringify(diffPayload).slice(0, 500)}`);
    }

    await page.locator(`[data-ide-source-control-change-path="${cssAttr(gitFilePath)}"]`).first().click();
    await page.locator(tabSelector(gitFilePath)).first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-git-diff-panel]').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-monaco-diff-panel], [data-ide-git-diff-unified]').first().waitFor({ state: 'visible', timeout: 30_000 });
    const repoPathText = await page.locator('[data-ide-git-diff-repo-path]').first().textContent();
    if (!repoPathText?.includes(expectedRepoPath)) throw new Error(`Diff panel repo path mismatch: ${repoPathText}`);

    await page.locator('[data-ide-activity-bar]').getByRole('button', { name: 'Explorer' }).click();
    await revealPath(page, gitFilePath, repoParentRelativePath);
    const gitBadge = page.locator(`${nodeSelector(gitFilePath)} [data-ide-explorer-git-decoration]`).first();
    await gitBadge.waitFor({ state: 'visible', timeout: 30_000 });
    const kind = await gitBadge.getAttribute('data-ide-explorer-git-kind');
    if (kind !== 'untracked') throw new Error(`Explorer git decoration kind mismatch: ${kind}`);
  } catch (error) {
    console.error(logs.join('\n'));
    throw error;
  } finally {
    await browser.close();
    await cleanup(rootId, [gitFilePath]);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
