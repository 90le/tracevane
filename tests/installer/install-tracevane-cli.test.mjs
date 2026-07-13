import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
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

function runExtractedBash(functions, body, env = {}) {
  const source = fs.readFileSync(installer, 'utf8');
  const script = [
    'set -euo pipefail',
    ...functions.map(([name, nextName]) => extractBashFunction(source, name, nextName)),
    body,
  ].join('\n');
  return childProcess.spawnSync(resolverBash, ['-s'], {
    cwd: root,
    input: script,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

function createUninstallFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-uninstall-'));
  const openclawHome = path.join(fixtureRoot, '.openclaw');
  const extensionsDir = path.join(openclawHome, 'extensions');
  const installDir = path.join(extensionsDir, 'tracevane');
  const retainedDataDir = path.join(openclawHome, 'tracevane');
  const configPath = path.join(openclawHome, 'openclaw.json');
  const otherExtension = path.join(extensionsDir, 'other');
  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(retainedDataDir, { recursive: true });
  fs.writeFileSync(path.join(installDir, 'package.json'), '{"name":"tracevane"}\n');
  fs.writeFileSync(path.join(retainedDataDir, 'user-data.json'), '{"keep":true}\n');
  const config = {
    plugins: {
      entries: {
        tracevane: { enabled: true },
        other: { enabled: true },
      },
      load: {
        paths: [installDir, otherExtension],
      },
    },
    gateway: { port: 31879 },
  };
  const originalConfig = `${JSON.stringify(config, null, 2)}\n`;
  fs.mkdirSync(openclawHome, { recursive: true });
  fs.writeFileSync(configPath, originalConfig);
  return {
    fixtureRoot,
    openclawHome,
    extensionsDir,
    installDir,
    retainedDataDir,
    configPath,
    otherExtension,
    originalConfig,
  };
}

function runUninstallFixture(fixture, validateStatus = 0) {
  return runExtractedBash(
    [['uninstall_tracevane', 'parse_args']],
    [
      'log() { printf "LOG: %s\\n" "$*" >&2; }',
      'warn() { printf "WARN: %s\\n" "$*" >&2; }',
      'append_result_warning() { RESULT_WARNINGS+=("$1"); }',
      'record_warning() { RESULT_WARNINGS+=("$1"); warn "$1"; }',
      'die() { printf "ERROR: %s\\n" "$*" >&2; exit 1; }',
      `openclaw() { if [[ "\${1:-} \${2:-}" == "config validate" ]]; then return ${validateStatus}; fi; return 0; }`,
      'restart_gateway_after_change() { RESULT_HEALTH_CHECKS+=("gateway-restart:ok"); }',
      'JSON_OUTPUT=0',
      'DRY_RUN=0',
      'RESULT_WARNINGS=()',
      'RESULT_ACCESS_URLS=()',
      'RESULT_HEALTH_CHECKS=()',
      'DEGRADED_FEATURES=()',
      `OPENCLAW_HOME_DIR=${JSON.stringify(fixture.openclawHome.replace(/\\/g, '/'))}`,
      `OPENCLAW_CONFIG_FILE=${JSON.stringify(fixture.configPath.replace(/\\/g, '/'))}`,
      `INSTALL_DIR=${JSON.stringify(fixture.installDir.replace(/\\/g, '/'))}`,
      `BACKUP_ROOT=${JSON.stringify(path.join(fixture.openclawHome, 'backups', 'tracevane').replace(/\\/g, '/'))}`,
      'ACTIVE_BACKUP_DIR=""',
      'CONFIG_BACKUP=""',
      'TRACEVANE_VERSION=""',
      'TRACEVANE_MODE=standalone',
      'TRACEVANE_PLATFORM=Linux',
      'uninstall_tracevane',
    ].join('\n'),
  );
}

test('emit_result_json emits the stable result schema and redacts token-bearing URLs', { skip: !resolverBashAvailable }, () => {
  const result = runExtractedBash(
    [
      ['emit_result_json', 'append_result_warning'],
      ['append_result_warning', 'record_warning'],
      ['record_warning', 'append_degraded_feature'],
      ['append_degraded_feature', 'record_access_url'],
      ['record_access_url', 'die'],
    ],
    [
      'TRACEVANE_VERSION=0.1.72',
      'TRACEVANE_MODE=standalone',
      'TRACEVANE_PLATFORM=Linux',
      'INSTALL_DIR=/tmp/extensions/tracevane',
      'OPENCLAW_CONFIG_FILE=/tmp/openclaw.json',
      'ACTIVE_BACKUP_DIR=""',
      'CONFIG_BACKUP=""',
      'RESULT_OUTPUT_FD=1',
      'RESULT_ACCESS_URLS=()',
      'RESULT_HEALTH_CHECKS=("release-metadata:ok")',
      'RESULT_WARNINGS=()',
      'DEGRADED_FEATURES=()',
      'record_access_url "https://downloads.example/tracevane-0.1.72.tar.gz?token=do-not-print" || true',
      'record_access_url "https://downloads.example/tracevane-0.1.72.tar.gz"',
      'append_result_warning "fallback active"',
      'append_result_warning "fallback active"',
      'append_degraded_feature terminal',
      'append_degraded_feature terminal',
      'emit_result_json ok',
    ].join('\n'),
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.doesNotMatch(result.stdout, /do-not-print|token=/);
  const payload = JSON.parse(result.stdout.trim());
  assert.match(payload.installDir.replace(/\\/g, '/'), /\/extensions\/tracevane$/);
  assert.match(payload.configPath.replace(/\\/g, '/'), /\/openclaw\.json$/);
  const { installDir: _installDir, configPath: _configPath, ...stablePayload } = payload;
  assert.deepEqual(stablePayload, {
    status: 'ok',
    version: '0.1.72',
    mode: 'standalone',
    platform: 'Linux',
    accessUrls: ['https://downloads.example/tracevane-0.1.72.tar.gz'],
    healthChecks: ['release-metadata:ok'],
    backupPath: '',
    warnings: ['fallback active'],
    degradedFeatures: ['terminal'],
  });
});

test('uninstall removes only Tracevane config and install files while preserving user data', { skip: !resolverBashAvailable }, () => {
  const fixture = createUninstallFixture();
  const result = runUninstallFixture(fixture);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const config = JSON.parse(fs.readFileSync(fixture.configPath, 'utf8'));
  assert.equal(config.plugins.entries.tracevane, undefined);
  assert.deepEqual(config.plugins.entries.other, { enabled: true });
  assert.deepEqual(config.plugins.load.paths, [fixture.otherExtension]);
  assert.equal(fs.existsSync(fixture.installDir), false);
  assert.equal(fs.readFileSync(path.join(fixture.retainedDataDir, 'user-data.json'), 'utf8'), '{"keep":true}\n');
  const backups = fs.readdirSync(path.join(fixture.openclawHome, 'backups', 'tracevane'));
  assert.equal(backups.length, 1);
  const backupDir = path.join(fixture.openclawHome, 'backups', 'tracevane', backups[0]);
  assert.equal(fs.existsSync(path.join(backupDir, 'openclaw.json')), true);
  assert.equal(fs.existsSync(path.join(backupDir, 'tracevane', 'package.json')), true);
});

test('uninstall restores config and leaves the extension installed when validation fails', { skip: !resolverBashAvailable }, () => {
  const fixture = createUninstallFixture();
  const result = runUninstallFixture(fixture, 1);

  assert.notEqual(result.status, 0);
  assert.equal(fs.readFileSync(fixture.configPath, 'utf8'), fixture.originalConfig);
  assert.equal(fs.existsSync(path.join(fixture.installDir, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(fixture.retainedDataDir, 'user-data.json')), true);
});

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

test('check-release --json emits exactly one machine-readable result object', { skip: !bashAvailable }, async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/tracevane-latest.json') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        version: '0.1.72',
        packageUrl: `http://127.0.0.1:${server.address().port}/tracevane-0.1.72.tar.gz`,
        minOpenClawVersion: '2026.5.28',
        sha256: latestSha256,
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
      '--json',
    ]);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const stdout = result.stdout.trim();
    assert.equal(stdout.split(/\r?\n/).length, 1);
    const payload = JSON.parse(stdout.split(/\r?\n/).at(-1));
    assert.equal(payload.status, 'ok');
    assert.equal(payload.version, '0.1.72');
    assert.equal(payload.mode, 'standalone');
    assert.ok(['Linux', 'Darwin'].includes(payload.platform));
    assert.equal(payload.installDir, '');
    assert.equal(payload.configPath, '');
    assert.equal(payload.accessUrls.length, 1);
    assert.ok(Array.isArray(payload.healthChecks));
    assert.ok(payload.healthChecks.includes('release-metadata:ok'));
    assert.ok(Array.isArray(payload.warnings));
    assert.ok(Array.isArray(payload.degradedFeatures));
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
