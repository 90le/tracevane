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
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'ide-git-remote-foundation-'));
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

  runGit(fixtureRoot, ['clone', remoteDir, remoteCloneDir]);
  runGit(remoteCloneDir, ['config', 'user.name', 'Tracevane Smoke']);
  runGit(remoteCloneDir, ['config', 'user.email', 'tracevane-smoke@example.com']);
  fs.writeFileSync(path.join(remoteCloneDir, 'remote.txt'), 'remote behind\n');
  runGit(remoteCloneDir, ['add', 'remote.txt']);
  runGit(remoteCloneDir, ['commit', '-m', 'remote behind']);
  runGit(remoteCloneDir, ['push', 'origin', 'main']);

  fs.writeFileSync(path.join(repoDir, 'local.txt'), 'local ahead\n');
  runGit(repoDir, ['add', 'local.txt']);
  runGit(repoDir, ['commit', '-m', 'local ahead']);

  return { fixtureRoot, repoDir };
}

async function run() {
  const runnerTempDir = process.env.TRACEVANE_SMOKE_TEMP_DIR;
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git remote smoke');

  const { fixtureRoot, repoDir } = setupGitFixture(runnerTempDir || path.join(process.cwd(), '.tmp'));
  const repoRelativePath = relativePathFromRoot(root.absolutePath, repoDir);
  if (!repoRelativePath) throw new Error(`Fixture repo is outside selected root: ${repoDir}`);
  const apiRootId = gitApiRootId(rootId);
  const search = new URLSearchParams({ rootId: apiRootId, path: repoRelativePath });

  try {
    const initialStatus = await api(`/api/git/status?${search.toString()}`);
    if (!initialStatus.available) throw new Error(`Git status unavailable: ${initialStatus.message}`);
    if (initialStatus.branch !== 'main') throw new Error(`Expected main branch, got ${initialStatus.branch}`);
    if (initialStatus.upstream !== 'origin/main') throw new Error(`Expected origin/main upstream, got ${initialStatus.upstream}`);
    if (initialStatus.ahead !== 1) throw new Error(`Expected local ahead 1 before fetch, got ${initialStatus.ahead}`);

    const fetchedStatus = await api('/api/git/fetch', {
      method: 'POST',
      body: JSON.stringify({ rootId: apiRootId, path: repoRelativePath, remote: 'origin' }),
    });
    if (fetchedStatus.ahead !== 1 || fetchedStatus.behind !== 1) {
      throw new Error(`Expected fetch to reveal ahead/behind 1/1, got ${fetchedStatus.ahead}/${fetchedStatus.behind}`);
    }

    await api(`/api/ide-workbench/layouts/${encodeURIComponent(rootId)}`, {
      method: 'PUT',
      body: JSON.stringify({ layout: createDefaultWorkbenchLayout(repoRelativePath), terminalLayouts: {} }),
    });

    const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
      const branchSection = page.locator('[data-ide-source-control-section="branches"]');
      if (await branchSection.getAttribute('data-ide-source-control-section-open') !== 'true') {
        await page.locator('[data-ide-source-control-section-toggle="branches"]').click();
        await page.waitForFunction(() => document.querySelector('[data-ide-source-control-section="branches"]')?.getAttribute('data-ide-source-control-section-open') === 'true');
      }
      await page.locator('[data-ide-source-control-branch]').filter({ hasText: 'main' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-upstream]').filter({ hasText: 'origin/main' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-ahead-behind]').filter({ hasText: '↑1 ↓1' }).waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-fetch]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-pull]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-push]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-sync]').waitFor({ state: 'visible', timeout: 30_000 });
      await page.locator('[data-ide-source-control-fetch]').click();
      await page.locator('[data-ide-source-control-fetch] svg.animate-spin').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    } catch (error) {
      console.error(logs.join('\n'));
      throw error;
    } finally {
      await browser.close();
    }
  } finally {
    if (!runnerTempDir) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
