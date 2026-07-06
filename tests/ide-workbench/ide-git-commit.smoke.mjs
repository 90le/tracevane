import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
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

function gitApiRootId(rootId) {
  return rootId === 'openclaw-root' ? 'system-root' : rootId;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'sourceControl',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 340 },
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

function ensureNoStagedChanges() {
  try {
    execFileSync('git', ['diff', '--cached', '--quiet'], { cwd: process.cwd(), stdio: 'ignore' });
  } catch {
    throw new Error('Refusing to run commit smoke while pre-existing staged changes are present');
  }
}

function resetSmokeCommitIfNeeded(subject) {
  try {
    const latestSubject = execFileSync('git', ['log', '-1', '--pretty=%s'], { cwd: process.cwd(), encoding: 'utf8' }).trim();
    if (latestSubject === subject) {
      execFileSync('git', ['reset', '--mixed', 'HEAD~1'], { cwd: process.cwd(), stdio: 'ignore' });
    }
  } catch (error) {
    console.error(`Unable to reset smoke commit: ${error?.message || error}`);
    throw error;
  }
}

async function run() {
  ensureNoStagedChanges();
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git commit smoke');

  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, process.cwd());
  if (!repoParentRelativePath && path.resolve(root.absolutePath) !== path.resolve(process.cwd())) {
    throw new Error(`Smoke repo is outside selected root: ${root.absolutePath} vs ${process.cwd()}`);
  }
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const gitFilePath = normalizePortablePath(`${repoParentRelativePath}/tests/ide-workbench/git-commit-smoke-${suffix}.txt`);
  const expectedRepoPath = normalizePortablePath(path.relative(process.cwd(), path.resolve(root.absolutePath, gitFilePath)));
  const commitSubject = `tracevane git commit smoke ${suffix}`;

  await cleanup(rootId, [gitFilePath]);
  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(repoParentRelativePath), terminalLayouts: {} }),
  });
  await createFile(rootId, gitFilePath, `${commitSubject}\n`);

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
    const row = page.locator(`[data-ide-source-control-change-path="${cssAttr(gitFilePath)}"]`).first();
    await row.waitFor({ state: 'visible', timeout: 30_000 });

    const commitButton = page.locator('[data-ide-source-control-commit]').first();
    if (!(await commitButton.isDisabled())) throw new Error('Commit button should be disabled before staging/message');

    await row.locator('[data-ide-source-control-stage]').click();
    await page.waitForFunction(
      (selector) => document.querySelector(selector)?.getAttribute('data-ide-source-control-change-staged') === 'true',
      `[data-ide-source-control-change-path="${cssAttr(gitFilePath)}"]`,
      { timeout: 30_000 },
    );
    if (!(await commitButton.isDisabled())) throw new Error('Commit button should stay disabled until message is provided');

    await page.locator('[data-ide-source-control-commit-message]').fill(commitSubject);
    if (await commitButton.isDisabled()) throw new Error('Commit button should be enabled with staged changes and a message');
    await commitButton.click();

    await page.waitForFunction(
      (selector) => !document.querySelector(selector),
      `[data-ide-source-control-change-path="${cssAttr(gitFilePath)}"]`,
      { timeout: 30_000 },
    );

    const status = await api(`/api/git/status?${new URLSearchParams({ rootId: gitApiRootId(rootId), path: repoParentRelativePath }).toString()}`);
    if (status.changes?.some((change) => change.path === expectedRepoPath)) {
      throw new Error(`Committed file still appears in Git status: ${JSON.stringify(status.changes?.slice(0, 20))}`);
    }
    if (status.commits?.[0]?.subject !== commitSubject) {
      throw new Error(`Latest commit subject mismatch: ${JSON.stringify(status.commits?.[0])}`);
    }
  } catch (error) {
    console.error(logs.join('\n'));
    throw error;
  } finally {
    await browser.close();
    resetSmokeCommitIfNeeded(commitSubject);
    await cleanup(rootId, [gitFilePath]);
    ensureNoStagedChanges();
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
