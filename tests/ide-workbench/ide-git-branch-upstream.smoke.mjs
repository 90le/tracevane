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

function createDefaultWorkbenchLayout(directoryPath = '') {
  return {
    layoutVersion: 1,
    activeActivityId: 'git',
    sideBar: { placement: 'left', visible: true, collapsed: false, width: 360 },
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

function setupGitFixture(tmpParent) {
  fs.mkdirSync(tmpParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'ide-git-branch-upstream-'));
  const repoDir = path.join(fixtureRoot, 'repo');
  const remoteDir = path.join(fixtureRoot, 'remote.git');
  const remoteCloneDir = path.join(fixtureRoot, 'remote-work');
  fs.mkdirSync(repoDir, { recursive: true });

  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.name', 'Tracevane Smoke']);
  runGit(repoDir, ['config', 'user.email', 'tracevane-smoke@example.com']);
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n');
  runGit(repoDir, ['add', 'README.md']);
  runGit(repoDir, ['commit', '-m', 'base']);
  runGit(repoDir, ['branch', '-M', 'main']);
  runGit(fixtureRoot, ['init', '--bare', remoteDir]);
  runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
  runGit(repoDir, ['push', '-u', 'origin', 'main']);
  runGit(remoteDir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);

  fs.appendFileSync(path.join(repoDir, 'README.md'), 'local ahead\n');
  runGit(repoDir, ['commit', '-am', 'local ahead']);

  runGit(fixtureRoot, ['clone', remoteDir, remoteCloneDir]);
  runGit(remoteCloneDir, ['config', 'user.name', 'Tracevane Smoke']);
  runGit(remoteCloneDir, ['config', 'user.email', 'tracevane-smoke@example.com']);
  fs.writeFileSync(path.join(remoteCloneDir, 'remote.txt'), 'remote behind\n');
  runGit(remoteCloneDir, ['add', 'remote.txt']);
  runGit(remoteCloneDir, ['commit', '-m', 'remote behind']);
  runGit(remoteCloneDir, ['push', 'origin', 'main']);
  runGit(repoDir, ['fetch', 'origin']);

  fs.writeFileSync(path.join(repoDir, 'staged.txt'), 'staged\n');
  runGit(repoDir, ['add', 'staged.txt']);
  fs.writeFileSync(path.join(repoDir, 'untracked.txt'), 'untracked\n');
  fs.appendFileSync(path.join(repoDir, 'README.md'), 'unstaged\n');

  return { fixtureRoot, repoDir };
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git branch smoke');

  const runnerTempDir = process.env.TRACEVANE_SMOKE_TEMP_DIR;
  const tmpParent = runnerTempDir || path.join(process.cwd(), '.tmp');
  const { fixtureRoot, repoDir } = setupGitFixture(tmpParent);
  const repoRelativePath = relativePathFromRoot(root.absolutePath, repoDir);
  if (!repoRelativePath) throw new Error(`Fixture repo is outside selected root: ${repoDir}`);

  const search = new URLSearchParams({ rootId: gitApiRootId(rootId), path: repoRelativePath });
  const status = await api(`/api/git/status?${search.toString()}`);
  if (!status.available) throw new Error(`Git status unavailable: ${status.message}`);
  if (status.branch !== 'main') throw new Error(`Expected main branch, got ${status.branch}`);
  if (status.upstream !== 'origin/main') throw new Error(`Expected origin/main upstream, got ${status.upstream}`);
  if (status.ahead !== 1 || status.behind !== 1) throw new Error(`Expected ahead/behind 1/1, got ${status.ahead}/${status.behind}`);
  if (!status.changes?.some((change) => change.path === 'staged.txt' && change.staged)) throw new Error(`Missing staged change: ${JSON.stringify(status.changes)}`);
  if (!status.changes?.some((change) => change.path === 'README.md' && change.unstaged)) throw new Error(`Missing unstaged change: ${JSON.stringify(status.changes)}`);
  if (!status.changes?.some((change) => change.path === 'untracked.txt' && change.kind === 'untracked')) throw new Error(`Missing untracked change: ${JSON.stringify(status.changes)}`);

  await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
    method: 'PUT',
    body: JSON.stringify({ layout: createDefaultWorkbenchLayout(repoRelativePath), terminalLayouts: {} }),
  });

  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(({ key, layout }) => {
    try { window.localStorage.setItem(key, JSON.stringify(layout)); } catch { /* ignore */ }
  }, { key: `tracevane.ide-workbench.layout.${rootId || 'pending-root'}`, layout: createDefaultWorkbenchLayout(repoRelativePath) });
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (error) => logs.push(`[pageerror] ${error.stack || error.message}`));

  try {
    await page.goto(`${BASE_URL}/ide/${encodeURIComponent(rootId)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-ide-workbench]').waitFor({ state: 'visible', timeout: 45_000 });
    await page.locator('[data-ide-activity-bar]').getByRole('button', { name: 'Source Control' }).click();
    await page.locator('[data-ide-source-control-view]').waitFor({ state: 'visible', timeout: 30_000 });
    const branchSection = page.locator('[data-ide-source-control-section="branches"]');
    if (await branchSection.getAttribute('data-ide-source-control-section-open') !== 'true') {
      await page.locator('[data-ide-source-control-section-toggle="branches"]').click();
      await branchSection.waitFor({ state: 'visible', timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('[data-ide-source-control-section="branches"]')?.getAttribute('data-ide-source-control-section-open') === 'true');
    }

    await page.locator('[data-ide-source-control-branch]').filter({ hasText: 'main' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-source-control-upstream]').filter({ hasText: 'origin/main' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-source-control-ahead-behind]').filter({ hasText: '↑1 ↓1' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-source-control-change-group="已暂存"]').filter({ hasText: '1' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-source-control-change-group="更改"]').filter({ hasText: '1' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-source-control-change-group="未跟踪"]').filter({ hasText: '1' }).waitFor({ state: 'visible', timeout: 30_000 });

    await page.locator('[data-ide-status-git-branch]').filter({ hasText: 'main' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-git-upstream]').filter({ hasText: 'origin/main' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-git-ahead-behind]').filter({ hasText: '↑1 ↓1' }).waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('[data-ide-status-git-change-count]').filter({ hasText: '3' }).waitFor({ state: 'visible', timeout: 30_000 });
  } catch (error) {
    console.error(logs.join('\n'));
    const state = await page.evaluate(() => ({
      sourceControlText: document.querySelector('[data-ide-source-control-view]')?.textContent?.slice(0, 1200) ?? null,
      branchText: document.querySelector('[data-ide-source-control-branch]')?.textContent ?? null,
      workbenchText: document.querySelector('[data-ide-workbench]')?.textContent?.slice(0, 1600) ?? null,
      url: location.href,
    })).catch(() => ({}));
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nstate=${JSON.stringify(state)}`);
  } finally {
    await browser.close();
    if (!runnerTempDir) {
      fs.rmSync(fixtureRoot, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
    }
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
