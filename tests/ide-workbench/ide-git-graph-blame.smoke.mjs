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
      const response = await fetch(`${BASE_URL}${pathname}`, { ...options, headers: { Accept: 'application/json', ...(options.headers ?? {}) } });
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

function setupGitFixture(tmpParent) {
  fs.mkdirSync(tmpParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(tmpParent, 'ide-git-graph-blame-'));
  const repoDir = path.join(fixtureRoot, 'repo');
  fs.mkdirSync(repoDir, { recursive: true });
  runGit(repoDir, ['init']);
  runGit(repoDir, ['config', 'user.name', 'Tracevane Smoke']);
  runGit(repoDir, ['config', 'user.email', 'tracevane-smoke@example.com']);
  fs.writeFileSync(path.join(repoDir, 'README.md'), 'base line\n');
  runGit(repoDir, ['add', 'README.md']);
  runGit(repoDir, ['commit', '-m', 'base graph blame']);
  runGit(repoDir, ['branch', '-M', 'main']);
  fs.appendFileSync(path.join(repoDir, 'README.md'), 'second line\n');
  runGit(repoDir, ['add', 'README.md']);
  runGit(repoDir, ['commit', '-m', 'second graph blame']);
  runGit(repoDir, ['checkout', '-b', 'smoke/side']);
  fs.writeFileSync(path.join(repoDir, 'side.txt'), 'side\n');
  runGit(repoDir, ['add', 'side.txt']);
  runGit(repoDir, ['commit', '-m', 'side graph branch']);
  runGit(repoDir, ['checkout', 'main']);
  return { fixtureRoot, repoDir };
}

async function run() {
  const runnerTempDir = process.env.TRACEVANE_SMOKE_TEMP_DIR;
  const summary = await api('/api/files/summary');
  const roots = summary.roots ?? [];
  const root = roots.find((item) => item.absolutePath && item.absolutePath !== '/' && process.cwd().startsWith(item.absolutePath))
    ?? roots.find((item) => item.id === summary.defaultRootId && item.absolutePath && item.absolutePath !== '/')
    ?? roots.find((item) => item.absolutePath && item.absolutePath !== '/')
    ?? roots[0];
  if (!root?.id || !root.absolutePath) throw new Error('No file root is available for IDE Git graph/blame smoke');
  const { fixtureRoot, repoDir } = setupGitFixture(runnerTempDir || path.join(process.cwd(), '.tmp'));
  const repoRelativePath = relativePathFromRoot(root.absolutePath, repoDir);
  if (!repoRelativePath) throw new Error(`Fixture repo is outside selected root: ${repoDir}`);
  const apiRootId = gitApiRootId(root.id);
  const base = new URLSearchParams({ rootId: apiRootId, path: repoRelativePath });
  try {
    const graphParams = new URLSearchParams(base);
    graphParams.set('all', 'true');
    graphParams.set('limit', '10');
    const graph = await api(`/api/git/graph?${graphParams.toString()}`);
    if (!graph.available || graph.commits.length < 3) throw new Error(`Expected graph commits: ${JSON.stringify(graph)}`);
    if (!graph.commits.some((commit) => commit.subject === 'side graph branch')) throw new Error(`--all graph did not include side branch: ${JSON.stringify(graph.commits)}`);
    if (!graph.commits.every((commit) => Array.isArray(commit.parents))) throw new Error('Graph commits must include parent arrays');

    const fileGraphParams = new URLSearchParams(base);
    fileGraphParams.set('file', 'README.md');
    const fileGraph = await api(`/api/git/graph?${fileGraphParams.toString()}`);
    if (!fileGraph.available || fileGraph.commits.some((commit) => commit.subject === 'side graph branch')) throw new Error(`File graph should be README-only: ${JSON.stringify(fileGraph.commits)}`);

    const blameParams = new URLSearchParams(base);
    blameParams.set('file', 'README.md');
    const blame = await api(`/api/git/blame?${blameParams.toString()}`);
    if (!blame.available || blame.path !== 'README.md' || blame.lines.length < 2) throw new Error(`Expected blame lines: ${JSON.stringify(blame)}`);
    if (!blame.lines.every((line) => line.hash && line.shortHash && line.lineNumber > 0)) throw new Error(`Blame line metadata missing: ${JSON.stringify(blame.lines)}`);
  } finally {
    if (!runnerTempDir) fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  console.log('ide-git-graph-blame smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
