import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;

async function sleep(ms) { await new Promise((resolve) => setTimeout(resolve, ms)); }

async function api(pathname, options = {}) {
  const deadline = Date.now() + 10_000;
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
      if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} failed ${response.status}: ${text}`);
      return data;
    } catch (error) {
      lastError = error;
      if (String(error?.message || error).includes(`${options.method ?? 'GET'} ${pathname} failed `)) throw error;
      await sleep(250);
    }
  }
  throw lastError;
}

async function expectApiError(pathname, options = {}, expected) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (response.ok) throw new Error(`${options.method ?? 'GET'} ${pathname} unexpectedly succeeded: ${text}`);
  if (expected && !text.includes(expected)) throw new Error(`Expected error containing ${expected}, got: ${text}`);
  return text;
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

function normalizePortablePath(value) { return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''); }
function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}
function gitApiRootId(rootId) { return rootId === 'openclaw-root' ? 'system-root' : rootId; }

function setupGitFixture() {
  const tmpParent = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(tmpParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'ide-git-branch-management-'));
  const repoDir = path.join(fixtureRoot, 'repo');
  const remoteDir = path.join(fixtureRoot, 'remote.git');
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
  runGit(repoDir, ['branch', 'smoke/delete-me']);
  runGit(repoDir, ['branch', 'smoke/rename-me']);
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
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for IDE Git branch management smoke');

  const { fixtureRoot, repoDir } = setupGitFixture();
  const repoRelativePath = relativePathFromRoot(root.absolutePath, repoDir);
  if (!repoRelativePath) throw new Error(`Fixture repo is outside selected root: ${repoDir}`);
  const apiRootId = gitApiRootId(rootId);
  const search = new URLSearchParams({ rootId: apiRootId, path: repoRelativePath });
  const body = (payload) => JSON.stringify({ rootId: apiRootId, path: repoRelativePath, ...payload });

  try {
    const initial = await api(`/api/git/status?${search.toString()}`);
    if (!initial.available || initial.branch !== 'main' || initial.upstream !== 'origin/main') throw new Error(`Unexpected initial status: ${JSON.stringify(initial)}`);

    await expectApiError('/api/git/branches/delete', { method: 'POST', body: body({ name: 'main' }) }, 'Cannot delete the current Git branch');
    await expectApiError('/api/git/branches/delete', { method: 'POST', body: body({ name: 'smoke/delete-me', force: true }) }, 'Force deleting');

    const deleted = await api('/api/git/branches/delete', { method: 'POST', body: body({ name: 'smoke/delete-me' }) });
    if (deleted.branches.some((branch) => branch.name === 'smoke/delete-me')) throw new Error('Deleted branch still present');

    const renamed = await api('/api/git/branches/rename', { method: 'POST', body: body({ oldName: 'smoke/rename-me', newName: 'smoke/renamed' }) });
    if (!renamed.branches.some((branch) => branch.name === 'smoke/renamed')) throw new Error('Renamed branch missing');
    if (renamed.branches.some((branch) => branch.name === 'smoke/rename-me')) throw new Error('Old branch still present after rename');

    await expectApiError('/api/git/branches/upstream', { method: 'POST', body: body({ branch: 'smoke/renamed', upstream: 'origin/missing' }) }, 'does not exist');
    const upstreamSet = await api('/api/git/branches/upstream', { method: 'POST', body: body({ branch: 'smoke/renamed', upstream: 'origin/main' }) });
    if (!upstreamSet.branches.some((branch) => branch.name === 'smoke/renamed' && branch.upstream === 'origin/main')) throw new Error('Upstream not set');
    const upstreamUnset = await api('/api/git/branches/upstream', { method: 'POST', body: body({ branch: 'smoke/renamed', unset: true }) });
    if (!upstreamUnset.branches.some((branch) => branch.name === 'smoke/renamed' && !branch.upstream)) throw new Error('Upstream not unset');
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }

  console.log('ide-git-branch-management smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
