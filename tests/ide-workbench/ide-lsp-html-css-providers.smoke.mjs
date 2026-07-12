import path from 'node:path';
import { WebSocket } from 'ws';

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

function wsUrl(pathname) {
  const url = new URL(BASE_URL);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = pathname;
  url.search = '';
  return url.toString();
}

async function requestGateway(payload, expectedType) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl('/ws/lsp'));
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error(`LSP WebSocket ${expectedType} timeout`));
    }, 10_000);
    socket.on('error', reject);
    socket.on('message', (data) => {
      const event = JSON.parse(String(data));
      if (event.type === 'ready') {
        socket.send(JSON.stringify(payload));
        return;
      }
      if (event.type === expectedType) {
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

function normalizePortablePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function relativePathFromRoot(rootAbsolutePath, targetAbsolutePath) {
  const relative = normalizePortablePath(path.relative(rootAbsolutePath, targetAbsolutePath));
  return relative && !relative.startsWith('..') ? relative : '';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  const summary = await api('/api/files/summary');
  const root = summary.roots?.find((item) => item.id === summary.defaultRootId) ?? summary.roots?.[0];
  const rootId = root?.id;
  if (!rootId || !root.absolutePath) throw new Error('No file root is available for HTML/CSS LSP provider smoke');

  const prefix = `tracevane-ide-lsp-html-css-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const repoParentRelativePath = relativePathFromRoot(root.absolutePath, path.dirname(process.cwd()));
  const smokeDir = repoParentRelativePath ? `${repoParentRelativePath}/.${prefix}` : `.${prefix}`;
  const htmlPath = `${smokeDir}/index.html`;
  const cssPath = `${smokeDir}/styles.css`;
  const scssPath = `${smokeDir}/theme.scss`;

  await cleanup(rootId, [smokeDir]);
  await ensureDirectory(rootId, smokeDir);
  await createFile(rootId, htmlPath, '<!doctype html><html><body><main class="app"></main></body></html>');
  await createFile(rootId, cssPath, 'body { color: ; }\n.app { color: red; }\n');
  await createFile(rootId, scssPath, '$brand: red;\n.app { color: $brand; }\n');

  try {
    const status = await api('/api/lsp/status');
    const providerIds = new Set((status.providers ?? []).map((provider) => provider.id));
    assert(providerIds.has('html'), `status missing html provider: ${JSON.stringify(status.providers)}`);
    assert(providerIds.has('css'), `status missing css provider: ${JSON.stringify(status.providers)}`);
    assert(status.supportedLanguages?.includes('html'), 'status missing html language');
    assert(status.supportedLanguages?.includes('css'), 'status missing css language');
    assert(status.supportedLanguages?.includes('scss'), 'status missing scss language');
    assert(status.supportedLanguages?.includes('less'), 'status missing less language');

    const htmlContent = '<!doctype html>\n<html>\n<body>\n<div clas></div>\n</body>\n</html>\n';
    const htmlCompletion = await api('/api/lsp/completion', {
      method: 'POST',
      body: JSON.stringify({ type: 'completion', rootId, path: htmlPath, language: 'html', content: htmlContent, line: 4, column: 6 }),
    });
    assert(htmlCompletion.provider === 'html', `html completion provider mismatch: ${JSON.stringify(htmlCompletion)}`);
    assert(htmlCompletion.items?.some((item) => item.label === 'class'), `html completion missing class attribute: ${JSON.stringify(htmlCompletion.items?.slice(0, 20))}`);

    const htmlFormatting = await api('/api/lsp/formatting', {
      method: 'POST',
      body: JSON.stringify({ type: 'formatting', rootId, path: htmlPath, language: 'html', content: '<html><body><div>Hi</div></body></html>', tabSize: 2, insertSpaces: true }),
    });
    assert(htmlFormatting.provider === 'html', `html formatting provider mismatch: ${JSON.stringify(htmlFormatting)}`);
    assert(htmlFormatting.textEdits?.length > 0, `html formatting returned no edits: ${JSON.stringify(htmlFormatting)}`);

    const cssContent = 'body { color: ; }\n.app { color: red; }\n';
    const cssDiagnostics = await api('/api/lsp/diagnostics', {
      method: 'POST',
      body: JSON.stringify({ type: 'diagnose', rootId, path: cssPath, language: 'css', content: cssContent }),
    });
    assert(cssDiagnostics.provider === 'css', `css diagnostics provider mismatch: ${JSON.stringify(cssDiagnostics)}`);
    assert(cssDiagnostics.diagnostics?.some((diagnostic) => diagnostic.source === 'vscode-css-languageservice'), `css diagnostics missing official source: ${JSON.stringify(cssDiagnostics)}`);

    const cssCompletion = await api('/api/lsp/completion', {
      method: 'POST',
      body: JSON.stringify({ type: 'completion', rootId, path: cssPath, language: 'css', content: 'body { col }', line: 1, column: 11 }),
    });
    assert(cssCompletion.provider === 'css', `css completion provider mismatch: ${JSON.stringify(cssCompletion)}`);
    assert(cssCompletion.items?.some((item) => item.label === 'color'), `css completion missing color: ${JSON.stringify(cssCompletion.items?.slice(0, 40))}`);

    const cssHover = await api('/api/lsp/hover', {
      method: 'POST',
      body: JSON.stringify({ type: 'hover', rootId, path: cssPath, language: 'css', content: '.app { color: red; }', line: 1, column: 9 }),
    });
    assert(cssHover.provider === 'css', `css hover provider mismatch: ${JSON.stringify(cssHover)}`);
    assert(cssHover.contents?.length > 0, `css hover returned no contents: ${JSON.stringify(cssHover)}`);

    const scssFormatting = await api('/api/lsp/formatting', {
      method: 'POST',
      body: JSON.stringify({ type: 'formatting', rootId, path: scssPath, language: 'scss', content: '$brand:red;.app{color:$brand;}', tabSize: 2, insertSpaces: true }),
    });
    assert(scssFormatting.provider === 'css', `scss formatting provider mismatch: ${JSON.stringify(scssFormatting)}`);
    assert(scssFormatting.textEdits?.length > 0, `scss formatting returned no edits: ${JSON.stringify(scssFormatting)}`);

    const gateway = await requestGateway({ type: 'completion', rootId, path: cssPath, language: 'css', content: 'body { col }', line: 1, column: 11 }, 'completion');
    assert(gateway.provider === 'css', `gateway css completion provider mismatch: ${JSON.stringify(gateway)}`);
    assert(gateway.items?.some((item) => item.label === 'color'), `gateway css completion missing color: ${JSON.stringify(gateway.items?.slice(0, 40))}`);
  } finally {
    await cleanup(rootId, [smokeDir]);
  }
}

run().then(() => {
  console.log('IDE LSP HTML/CSS provider smoke passed');
}).catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
