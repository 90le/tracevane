import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

function runGit(cwd, args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Tracevane Smoke',
      GIT_AUTHOR_EMAIL: 'tracevane-smoke@example.com',
      GIT_COMMITTER_NAME: 'Tracevane Smoke',
      GIT_COMMITTER_EMAIL: 'tracevane-smoke@example.com',
    },
  });
}

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function gitApiRootId(rootId) {
  return rootId === 'openclaw-root' ? 'system-root' : rootId;
}

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'git',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 420 },
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

function setupGitFixture() {
  const tmpParent = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'ide-git-branch-stash-'));
  const repoDir = path.join(fixtureRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.name', 'Tracevane Smoke']);
  runGit(repoDir, ['config', 'user.email', 'tracevane-smoke@example.com']);
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n');
  runGit(repoDir, ['add', 'README.md']);
  runGit(repoDir, ['commit', '-m', 'base']);
  runGit(repoDir, ['branch', '-M', 'main']);
  fs.appendFileSync(path.join(repoDir, 'README.md'), 'worktree change\n');
  fs.writeFileSync(path.join(repoDir, 'scratch.txt'), 'untracked\n');

  return { fixtureRoot, repoDir };
}

async function run() {
  const summary = await api('/api/files/summary');
  const roots = summary.roots ?? [];
  const root = roots.find((item) => item.absolutePath && item.absolutePath !== '/' && process.cwd().startsWith(item.absolutePath))
    ?? roots.find((item) => item.id === summary.defaultRootId && item.absolutePath && item.absolutePath !== '/')
    ?? roots.find((item) => item.absolutePath && item.absolutePath !== '/')
    ?? roots[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git branch/stash smoke');

  const { fixtureRoot, repoDir } = setupGitFixture();
  const repoRelativePath = relativePathFromRoot(root.absolutePath, repoDir);
  if (!repoRelativePath) throw new Error(`Fixture repo is outside selected root: ${repoDir}`);
  const apiRootId = gitApiRootId(rootId);
  const search = new URLSearchParams({ rootId: apiRootId, path: repoRelativePath });

  try {
    const initialStatus = await api(`/api/git/status?${search.toString()}`);
    if (!initialStatus.available || initialStatus.branch !== 'main') throw new Error(`Unexpected initial status: ${JSON.stringify(initialStatus)}`);
    if (!initialStatus.changes?.some((change) => change.path === 'README.md' && change.unstaged)) throw new Error(`Missing unstaged change: ${JSON.stringify(initialStatus.changes)}`);
    if (!initialStatus.changes?.some((change) => change.path === 'scratch.txt' && change.kind === 'untracked')) throw new Error(`Missing untracked change: ${JSON.stringify(initialStatus.changes)}`);

    const branchStatus = await api('/api/git/branches', {
      method: 'POST',
      body: JSON.stringify({ rootId: apiRootId, path: repoRelativePath, name: 'smoke/branch-ui', checkout: false }),
    });
    if (!branchStatus.branches?.some((branch) => branch.name === 'smoke/branch-ui' && !branch.current)) {
      throw new Error(`Created branch missing from API status: ${JSON.stringify(branchStatus.branches)}`);
    }

    await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
      method: 'PUT',
      body: JSON.stringify({ layout: createDefaultWorkbenchLayout(repoRelativePath), terminalLayouts: {} }),
    });

    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
    const logs = [];
    page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

    try {
      await page.addInitScript(({ key, layout }) => {
        try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
      }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(repoRelativePath) });
      await page.goto(`${BASE_URL}/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
      await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 45_000 });
      await page.locator('[data-ide-activity-bar]').getByRole('button', { name: 'Source Control' }).click();
      await page.locator('[data-ide-source-control-view]').waitFor({ state: 'visible', timeout: 30_000 });

      await page.locator('[data-ide-source-control-branches]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-branch-row][data-ide-source-control-branch-name-value="main"][data-ide-source-control-branch-current="true"]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-branch-row][data-ide-source-control-branch-name-value="smoke/branch-ui"]').waitFor({ state: 'visible', timeout: 30_000 });

      await page.locator('[data-ide-source-control-branch-name]').fill('smoke/ui-created');
      await page.locator('[data-ide-source-control-create-branch]').click();
      await page.locator('[data-ide-source-control-branch-row][data-ide-source-control-branch-name-value="smoke/ui-created"]').waitFor({ state: 'visible', timeout: 30_000 });

      await page.locator('[data-ide-source-control-stashes]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-stash-message]').fill('smoke stash from ui');
      await page.locator('[data-ide-source-control-save-stash]').click();
      await page.locator('[data-ide-source-control-stash-row]').filter({ hasText: 'smoke stash from ui' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-change-count]').filter({ hasText: '0 变更' }).waitFor({ state: 'visible', timeout: 30_000 });
    } catch (error) {
      console.error(logs.join('\n'));
      throw error;
    } finally {
      await browser.close();
    }
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log('ide-git-branch-stash-foundation smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
