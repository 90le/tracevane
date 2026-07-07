import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE_URL = process.env.TRACEVANE_WEB_SMOKE_URL || `http://127.0.0.1:${process.env.TRACEVANE_WEB_PORT || '5176'}`;

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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
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

function workspaceEditFor(uri) {
  return {
    changes: {
      [uri]: [
        { range: { start: { line: 0, character: 6 }, end: { line: 0, character: 11 } }, newText: 'beta' },
        { range: { start: { line: 1, character: 12 }, end: { line: 1, character: 17 } }, newText: 'beta' },
      ],
      'untitled://tracevane/outside': [
        { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, newText: 'x' },
      ],
    },
    documentChanges: [
      { kind: 'rename', oldUri: uri, newUri: `${uri}.renamed` },
    ],
  };
}

async function run() {
  const summary = await api('/api/files/summary');
  const roots = summary.roots ?? [];
  const root = roots.find((item) => item.absolutePath && item.absolutePath !== '/' && process.cwd().startsWith(item.absolutePath))
    ?? roots.find((item) => item.id === summary.defaultRootId && item.absolutePath && item.absolutePath !== '/')
    ?? roots.find((item) => item.absolutePath && item.absolutePath !== '/')
    ?? roots[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for LSP WorkspaceEdit smoke');

  const prefix = `tracevane-ide-lsp-workspace-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const smokeParent = repoParentRelativePath ? `${repoParentRelativePath}/tmp` : 'tmp';
  const smokeDir = `${smokeParent}/.${prefix}`;
  const targetPath = `${smokeDir}/workspace-edit.ts`;
  const targetAbsolutePath = path.join(root.absolutePath, targetPath);
  const targetUri = pathToFileURL(targetAbsolutePath).toString();

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, targetPath, 'const alpha = 1;\nconsole.log(alpha);\n');

  try {
    const preview = await api('/api/lsp/workspace-edit/preview', {
      method: 'POST',
      body: JSON.stringify({
        rootId,
        source: 'rename',
        workspaceEdit: workspaceEditFor(targetUri),
        openDocuments: [{ path: targetPath, dirty: true }],
      }),
    });
    if (preview.type !== 'workspaceEditPreview') throw new Error(`Unexpected preview type: ${preview.type}`);
    if (preview.items.length !== 2) throw new Error(`Expected 2 preview edits, got ${preview.items.length}`);
    if (preview.summary.openDirtyFiles !== 1) throw new Error(`Expected dirty open file classification: ${JSON.stringify(preview.summary)}`);
    if (preview.rejected.length < 2) throw new Error(`Expected rejected unsupported-uri/resource entries: ${JSON.stringify(preview.rejected)}`);

    const dirtyApply = await api('/api/lsp/workspace-edit/apply', {
      method: 'POST',
      body: JSON.stringify({
        rootId,
        source: 'rename',
        workspaceEdit: workspaceEditFor(targetUri),
        openDocuments: [{ path: targetPath, dirty: true }],
      }),
    });
    if (dirtyApply.applied.length !== 0 || !dirtyApply.skipped.some((item) => item.path === targetPath && /Dirty/.test(item.reason))) {
      throw new Error(`Dirty open file should be skipped, got ${JSON.stringify(dirtyApply)}`);
    }

    const apply = await api('/api/lsp/workspace-edit/apply', {
      method: 'POST',
      body: JSON.stringify({
        rootId,
        source: 'rename',
        workspaceEdit: workspaceEditFor(targetUri),
      }),
    });
    if (apply.type !== 'workspaceEditApply') throw new Error(`Unexpected apply type: ${apply.type}`);
    if (apply.applied.length !== 1 || apply.applied[0].path !== targetPath) {
      throw new Error(`Expected one applied file, got ${JSON.stringify(apply.applied)}`);
    }

    const read = await api(`/api/files/read?${new URLSearchParams({ rootId, path: targetPath }).toString()}`);
    if (read.content !== 'const beta = 1;\nconsole.log(beta);\n') {
      throw new Error(`WorkspaceEdit apply content mismatch: ${JSON.stringify(read.content)}`);
    }
  } finally {
    await cleanup(rootId, [smokeDir]);
  }

  console.log('ide-lsp-workspace-edit-foundation smoke passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
