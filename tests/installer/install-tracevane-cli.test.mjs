import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bash = process.env.BASH_PATH || 'bash';
const bashAvailable = process.platform !== 'win32'
  && childProcess.spawnSync(bash, ['--version']).status === 0;
const root = fileURLToPath(new URL('../..', import.meta.url));
const installer = path.join(root, 'install-tracevane.sh');
const resolverBash = process.env.BASH_PATH || (process.platform === 'win32'
  ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe')
  : bash);
const resolverBashAvailable = childProcess.spawnSync(resolverBash, ['--version']).status === 0;
const latestSha256 = 'a'.repeat(64);
const requestedSha256 = 'b'.repeat(64);

function extractBashFunction(source, name, nextName) {
  const normalized = source.replace(/\r\n/g, '\n');
  const start = normalized.indexOf(`${name}() {`);
  assert.notEqual(start, -1, `${name} not found`);
  const end = normalized.indexOf(`\n}\n\n${nextName}() {`, start);
  assert.notEqual(end, -1, `${name} terminator not found`);
  return normalized.slice(start, end + 2);
}

function runReleaseResolver(metadataFunction, overrides = {}) {
  const source = fs.readFileSync(installer, 'utf8');
  const resolver = extractBashFunction(source, 'resolve_requested_release', 'http_get');
  const script = [
    'set -euo pipefail',
    'die() { printf "ERROR: %s\\n" "$*" >&2; exit 1; }',
    metadataFunction,
    resolver,
    'resolve_requested_release',
    'printf "%s\\t%s\\t%s\\t%s\\n" "$TRACEVANE_VERSION" "$TRACEVANE_PACKAGE_URL" "$OPENCLAW_MIN_VERSION" "$TRACEVANE_PACKAGE_SHA256"',
  ].join('\n');
  const result = childProcess.spawnSync(resolverBash, ['-s'], {
    cwd: root,
    input: script,
    encoding: 'utf8',
    env: {
      ...process.env,
      TRACEVANE_VERSION: '',
      TRACEVANE_DEFAULT_VERSION: '0.1.70',
      VERSION_EXPLICIT: '0',
      PACKAGE_URL_EXPLICIT: '0',
      TRACEVANE_RELEASE_BASE: 'https://github.com/90le/tracevane/releases/latest/download',
      TRACEVANE_PACKAGE_URL: '',
      TRACEVANE_PACKAGE_SHA256: '',
      MIN_VERSION_EXPLICIT: '0',
      OPENCLAW_MIN_VERSION: '2026.5.28',
      ...overrides,
    },
  });
  const [version, packageUrl, minVersion, sha256] = result.stdout.replace(/\r?\n$/, '').split('\t');
  return { result, selection: { version, packageUrl, minVersion, sha256 } };
}

function runBash(args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(bash, [installer, ...args], { cwd: root });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('check-release rejects metadata without sha256', { skip: !bashAvailable }, async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/tracevane-latest.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        version: '0.1.72',
        packageUrl: `http://127.0.0.1:${server.address().port}/tracevane-0.1.72.tar.gz`,
        minOpenClawVersion: '2026.5.28',
      }));
      return;
    }
    res.end('fixture');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runBash([
      '--release-base', `http://127.0.0.1:${server.address().port}`,
      '--check-release',
    ]);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /缺少有效的安装包 SHA-256/);
  } finally {
    server.close();
  }
});

test('explicit version resolves official metadata from the matching GitHub tag', { skip: !resolverBashAvailable }, () => {
  const metadataFunction = `
resolve_remote_release_metadata() {
  case "\${1:-}" in
    'https://github.com/90le/tracevane/releases/download/v0.1.71')
      printf '0.1.71\\thttps://github.com/90le/tracevane/releases/download/v0.1.71/tracevane-0.1.71.tar.gz\\t2026.5.28\\t${requestedSha256}\\n'
      ;;
    *)
      printf '0.1.72\\thttps://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz\\t2026.5.29\\t${latestSha256}\\n'
      ;;
  esac
}`;
  const { result, selection } = runReleaseResolver(metadataFunction, {
    TRACEVANE_VERSION: '0.1.71',
    VERSION_EXPLICIT: '1',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(selection, {
    version: '0.1.71',
    packageUrl: 'https://github.com/90le/tracevane/releases/download/v0.1.71/tracevane-0.1.71.tar.gz',
    minVersion: '2026.5.28',
    sha256: requestedSha256,
  });
});

test('explicit version never adopts mismatched custom-base metadata URL or checksum', { skip: !resolverBashAvailable }, () => {
  const metadataFunction = `
resolve_remote_release_metadata() {
  printf '0.1.72\\thttps://mirror.example/tracevane-0.1.72.tar.gz\\t2026.5.29\\t${latestSha256}\\n'
}`;
  const { result, selection } = runReleaseResolver(metadataFunction, {
    TRACEVANE_VERSION: '0.1.71',
    VERSION_EXPLICIT: '1',
    TRACEVANE_RELEASE_BASE: 'https://mirror.example/releases',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(selection.version, '0.1.71');
  assert.equal(selection.packageUrl, 'https://mirror.example/releases/tracevane-0.1.71.tar.gz');
  assert.equal(selection.sha256, '');
});

test('explicit version rejects metadata whose package URL names another version', { skip: !resolverBashAvailable }, () => {
  const metadataFunction = `
resolve_remote_release_metadata() {
  printf '0.1.71\\thttps://mirror.example/tracevane-0.1.72.tar.gz\\t2026.5.29\\t${latestSha256}\\n'
}`;
  const { result, selection } = runReleaseResolver(metadataFunction, {
    TRACEVANE_VERSION: '0.1.71',
    VERSION_EXPLICIT: '1',
    TRACEVANE_RELEASE_BASE: 'https://mirror.example/releases',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(selection.packageUrl, 'https://mirror.example/releases/tracevane-0.1.71.tar.gz');
  assert.equal(selection.sha256, '');
});

test('latest release continues to consume latest metadata', { skip: !resolverBashAvailable }, () => {
  const metadataFunction = `
resolve_remote_release_metadata() {
  printf '0.1.72\\thttps://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz\\t2026.5.29\\t${latestSha256}\\n'
}`;
  const { result, selection } = runReleaseResolver(metadataFunction);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(selection, {
    version: '0.1.72',
    packageUrl: 'https://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz',
    minVersion: '2026.5.29',
    sha256: latestSha256,
  });
});

test('explicit package URL and checksum remain authoritative', { skip: !resolverBashAvailable }, () => {
  const metadataFunction = 'resolve_remote_release_metadata() { return 1; }';
  const { result, selection } = runReleaseResolver(metadataFunction, {
    TRACEVANE_VERSION: '0.1.71',
    VERSION_EXPLICIT: '1',
    PACKAGE_URL_EXPLICIT: '1',
    TRACEVANE_PACKAGE_URL: 'https://packages.example/tracevane-0.1.71.tar.gz',
    TRACEVANE_PACKAGE_SHA256: requestedSha256,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(selection.version, '0.1.71');
  assert.equal(selection.packageUrl, 'https://packages.example/tracevane-0.1.71.tar.gz');
  assert.equal(selection.sha256, requestedSha256);
});

test('check-release probes the requested version asset on a custom release base', { skip: !bashAvailable }, async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/tracevane-latest.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        version: '0.1.72',
        packageUrl: `http://127.0.0.1:${server.address().port}/tracevane-0.1.72.tar.gz`,
        minOpenClawVersion: '2026.5.29',
        sha256: latestSha256,
      }));
      return;
    }
    res.end('fixture');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const releaseBase = `http://127.0.0.1:${server.address().port}`;
    const result = await runBash([
      '--release-base', releaseBase,
      '--version', '0.1.71',
      '--package-sha256', requestedSha256,
      '--check-release',
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /版本: 0\.1\.71/);
    assert.match(result.stdout, new RegExp(`安装包: ${releaseBase}/tracevane-0\\.1\\.71\\.tar\\.gz`));
    assert.ok(requests.includes('/tracevane-0.1.71.tar.gz'));
    assert.ok(!requests.includes('/tracevane-0.1.72.tar.gz'));
  } finally {
    server.close();
  }
});
