import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  injectInstallerDefaultVersion,
  injectLandingPageVersion,
  parseReleaseMetadata,
} from '../../scripts/tracevane-release-installer-utils.mjs';

test('parseReleaseMetadata extracts version, package URL, min host version, and checksum from release metadata', () => {
  const metadata = parseReleaseMetadata(`{
    "version": "0.1.72",
    "packageUrl": "https://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz",
    "minOpenClawVersion": "2026.5.28",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }`);

  assert.deepEqual(metadata, {
    version: '0.1.72',
    packageUrl: 'https://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz',
    minVersion: '2026.5.28',
    sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });
});

test('parseReleaseMetadata accepts alternate min host version shapes', () => {
  assert.deepEqual(parseReleaseMetadata(`
    {
      "latestVersion": "0.1.22",
      "packageUrl": "/tracevane-0.1.22.tar.gz",
      "openclaw": {
        "minHostVersion": "2026.5.29"
      }
    }
  `), {
    version: '0.1.22',
    packageUrl: '/tracevane-0.1.22.tar.gz',
    minVersion: '2026.5.29',
    sha256: '',
  });
});

test('parseReleaseMetadata normalizes alternate checksum shapes', () => {
  assert.equal(parseReleaseMetadata(`{
    "version": "0.1.23",
    "packageSha256": " BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB "
  }`).sha256, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');

  assert.equal(parseReleaseMetadata(`{
    "version": "0.1.24",
    "checksum": {
      "sha256": " CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC "
    }
  }`).sha256, 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc');
});

test('parse-metadata CLI emits four tab-separated fields', () => {
  const result = childProcess.spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../scripts/tracevane-release-installer-utils.mjs', import.meta.url)), 'parse-metadata'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TRACEVANE_RELEASE_METADATA: JSON.stringify({
          version: '0.1.72',
          packageUrl: 'https://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz',
          minOpenClawVersion: '2026.5.28',
          sha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        }),
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, [
    '0.1.72',
    'https://github.com/90le/tracevane/releases/download/v0.1.72/tracevane-0.1.72.tar.gz',
    '2026.5.28',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ].join('\t'));
});

test('injectInstallerDefaultVersion updates installer fallback version to current release', () => {
  const installer = `
TRACEVANE_DEFAULT_VERSION="\${TRACEVANE_DEFAULT_VERSION:-0.1.20}"
OPENCLAW_MIN_VERSION="\${OPENCLAW_MIN_VERSION:-2026.5.28}"
TRACEVANE_VERSION="\${TRACEVANE_VERSION:-}"
`;

  const rewritten = injectInstallerDefaultVersion(installer, '0.1.21', '2026.5.29');

  assert.match(rewritten, /TRACEVANE_DEFAULT_VERSION="\$\{TRACEVANE_DEFAULT_VERSION:-0\.1\.21\}"/);
  assert.match(rewritten, /OPENCLAW_MIN_VERSION="\$\{OPENCLAW_MIN_VERSION:-2026\.5\.29\}"/);
  assert.doesNotMatch(rewritten, /0\.1\.20/);
});

test('injectLandingPageVersion rewrites the landing page fallback constants', () => {
  const html = `
const TRACEVANE_VERSION = "0.1.20";
const OPENCLAW_MIN_VERSION = "2026.5.28";
`;

  const rewritten = injectLandingPageVersion(html, '0.1.21', '2026.5.29');

  assert.match(rewritten, /const TRACEVANE_VERSION = "0\.1\.21";/);
  assert.match(rewritten, /const OPENCLAW_MIN_VERSION = "2026\.5\.29";/);
});

test('installer remains self-contained for remote metadata and gateway keeps 3760 enabled', () => {
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');

  assert.doesNotMatch(installer, /scripts\/tracevane-release-installer-utils\.mjs/);
  assert.match(installer, /TRACEVANE_RELEASE_BASE="\$\{TRACEVANE_RELEASE_BASE:-https:\/\/github\.com\/90le\/tracevane\/releases\/latest\/download\}"/);
  assert.match(installer, /--release-base/);
  assert.match(installer, /Linux\|Darwin/);
  assert.match(installer, /MINGW\*\|MSYS\*\|CYGWIN\*/);
  assert.match(installer, /缺少有效的安装包 SHA-256/);
  assert.doesNotMatch(installer, /跳过完整性校验/);
  assert.match(installer, /tracevaneConfig\.transport\.preferredMode = mode;/);
  assert.match(installer, /tracevaneConfig\.transport\.standalone = \{\s*enabled: true,\s*port: apiPort,\s*\};/);
  assert.match(installer, /STANDALONE_HEALTH_URL="http:\/\/127\.0\.0\.1:\$\{TRACEVANE_API_PORT\}\/api\/system\/health"/);
  assert.match(installer, /--json/);
  assert.match(installer, /--uninstall/);
  assert.match(installer, /emit_result_json\(\)/);
  assert.match(installer, /uninstall_tracevane\(\)/);
  assert.match(installer, /degradedFeatures/);
});

test('installer locates the extracted package without GNU-only find depth flags', () => {
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');

  assert.doesNotMatch(installer, /\bfind\b[^\n]*(?:-maxdepth|-mindepth)/);
  assert.match(
    installer,
    /for package_candidate in "\$\{TMP_DIR\}"\/tracevane-\*; do\s+\[\[ -d "\$\{package_candidate\}" \]\] \|\| continue\s+PACKAGE_DIR="\$\{package_candidate\}"\s+break\s+done/,
  );
});

test('installer result and human output paths do not expose credential-bearing URLs', () => {
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');

  assert.doesNotMatch(installer, /log "下载安装包: \$\{TRACEVANE_PACKAGE_URL\}"/);
  assert.doesNotMatch(installer, /ACCESS_URL="\$\{ACCESS_URL\}\?token=/);
  assert.match(installer, /log "下载安装包: \$\{PACKAGE_URL_DISPLAY\}"/);
  assert.match(installer, /HEALTH_REQUEST_URL="\$\{HEALTH_URL\}\?token=\$\{GATEWAY_TOKEN\}"/);
});

test('pack script syncs landing page versions and includes the current React app source snapshot', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');

  assert.match(packScript, /VERSION_AUTO=1/);
  assert.match(packScript, /Number\(patch\) \+ 1/);
  assert.match(packScript, /同步 package\/workspace 版本/);
  assert.match(packScript, /apps\/api\/package\.json/);
  assert.match(packScript, /apps\/web\/package\.json/);
  assert.match(packScript, /openclaw\.plugin\.json/);
  assert.match(packScript, /package-lock\.json/);
  assert.match(packScript, /TRACEVANE_VERSION_FALLBACK/);
  assert.match(packScript, /TRACEVANE_PACKAGE_VERSION_FALLBACK/);
  assert.match(packScript, /install-tracevane\.sh/);
  assert.match(packScript, /rewrite-landing-version/);
  assert.match(packScript, /clean-build-output\.mjs" all/);
  assert.match(packScript, /cp "\$\{LANDING_PAGE_PATH\}" "\$\{ROOT_LANDING_PATH\}"/);
  assert.match(packScript, /cp "\$\{APP_REACT_SOURCE_PATH\}" "\$\{PACKAGE_DIR\}\/apps\/web\/src\/app\/App\.tsx"/);
  assert.match(packScript, /release-build\.json/);
});

test('pack script provides a non-mutating test mode for release smoke checks', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');
  const viteConfig = fs.readFileSync(new URL('../../apps/web/vite.config.ts', import.meta.url), 'utf8');

  assert.match(packScript, /--no-source-sync/);
  assert.match(packScript, /--output-dir/);
  assert.match(packScript, /SOURCE_SYNC=0/);
  assert.match(packScript, /跳过本地 package\/workspace 版本同步/);
  assert.match(packScript, /跳过本地 installer 版本同步/);
  assert.match(packScript, /跳过本地站点安装页版本同步/);
  assert.match(packScript, /TRACEVANE_BUILD_VERSION="\$\{VERSION\}" npm run build:web/);
  assert.match(packScript, /rewrite-landing-version[\s\S]*"\$\{ROOT_LANDING_PATH\}"/);
  assert.match(viteConfig, /TRACEVANE_BUILD_VERSION/);
  assert.match(viteConfig, /if \(tracevanePackageVersionOverride\) return tracevanePackageVersionOverride;/);
});

test('pack script emits GitHub release URLs and SHA256SUMS', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');
  assert.match(packScript, /GITHUB_REPOSITORY="\$\{TRACEVANE_GITHUB_REPOSITORY:-90le\/tracevane\}"/);
  assert.match(packScript, /releases\/download\/v\$\{version\}\/tracevane-\$\{version\}\.tar\.gz/);
  assert.match(packScript, /SHA256SUMS/);
  assert.doesNotMatch(packScript, /https:\/\/tracevane\.90le\.cn\/tracevane-/);
});

test('build scripts clean generated output before compiling fresh artifacts', () => {
  const rootPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-clean-output-'));
  const apiStalePath = path.join(tmpRoot, 'dist', 'stale.js');
  const webStalePath = path.join(tmpRoot, 'apps', 'web', 'dist', 'stale.js');
  fs.mkdirSync(path.dirname(apiStalePath), { recursive: true });
  fs.mkdirSync(path.dirname(webStalePath), { recursive: true });
  fs.writeFileSync(apiStalePath, 'stale api output');
  fs.writeFileSync(webStalePath, 'stale web output');

  assert.match(rootPackage.scripts['build:api'], /clean-build-output\.mjs api/);
  assert.match(rootPackage.scripts['build:web'], /clean-build-output\.mjs web/);
  assert.match(rootPackage.scripts.build, /npm run build:api/);

  const result = childProcess.spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../../scripts/clean-build-output.mjs', import.meta.url)), 'all'],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        TRACEVANE_CLEAN_ROOT: tmpRoot,
      },
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(apiStalePath), false);
  assert.equal(fs.existsSync(webStalePath), false);
});

test('local source fallback versions stay aligned with package.json for dev debugging', () => {
  const rootPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const version = rootPackage.version;
  const apiConfig = fs.readFileSync(new URL('../../apps/api/config.ts', import.meta.url), 'utf8');
  const viteConfig = fs.readFileSync(new URL('../../apps/web/vite.config.ts', import.meta.url), 'utf8');

  assert.match(apiConfig, new RegExp(`const TRACEVANE_VERSION_FALLBACK = ["']${version.replace(/\./g, '\\.')}["']`));
  assert.match(viteConfig, new RegExp(`const TRACEVANE_PACKAGE_VERSION_FALLBACK = ["']${version.replace(/\./g, '\\.')}["']`));
});

test('release surfaces use the current OpenClaw minimum host version', () => {
  const rootPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');
  const landingPage = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const deployDoc = fs.readFileSync(new URL('../../DEPLOY.md', import.meta.url), 'utf8');
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');

  assert.equal(rootPackage.openclaw.install.minHostVersion, '>=2026.5.28');
  assert.match(installer, /OPENCLAW_MIN_VERSION="\$\{OPENCLAW_MIN_VERSION:-2026\.5\.28\}"/);
  assert.match(landingPage, /const OPENCLAW_MIN_VERSION = "2026\.5\.28";/);
  assert.match(deployDoc, /OpenClaw >= 2026\.5\.28/);
  assert.doesNotMatch(packScript, /2026\.4\.8/);
});

function extractConfigWriterScript(installerSource) {
  const normalizedInstallerSource = installerSource.replace(/\r\n/g, '\n');
  const marker = 'log "写入 OpenClaw 配置"';
  const markerIndex = normalizedInstallerSource.indexOf(marker);
  assert.notEqual(markerIndex, -1);

  const start = normalizedInstallerSource.indexOf("const fs = require('node:fs');", markerIndex);
  assert.notEqual(start, -1);

  const end = normalizedInstallerSource.indexOf('\nNODE\nfi\n\nif [[ "${DRY_RUN}" -eq 0 ]]; then\n  log "校验 OpenClaw 配置"', start);
  assert.notEqual(end, -1);
  return normalizedInstallerSource.slice(start, end);
}

test('installer config writer prunes retired product residue instead of preserving compatibility', () => {
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');
  const script = extractConfigWriterScript(installer);
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tracevane-installer-config-'));
  const configPath = path.join(tmpRoot, 'openclaw.json');
  const installDir = path.join(tmpRoot, 'extensions', 'tracevane');
  const retiredId = ['st', 'udio'].join('');
  const retiredPackageId = `openclaw-${retiredId}`;
  fs.mkdirSync(installDir, { recursive: true });

  fs.writeFileSync(configPath, `${JSON.stringify({
    plugins: {
      allow: ['alpha', retiredId, retiredPackageId, 'tracevane'],
      deny: [retiredId, 'tracevane', 'blocked'],
      slots: {
        ui: retiredPackageId,
        memory: 'memory-core',
      },
      entries: {
        [retiredId]: { enabled: true },
        [retiredPackageId]: { enabled: true },
        tracevane: {
          enabled: false,
          config: {
            keep: 'value',
          },
          stale: true,
        },
      },
      installs: {
        [retiredId]: { installPath: path.join(tmpRoot, 'extensions', retiredId) },
        [retiredPackageId]: { installPath: path.join(tmpRoot, 'extensions', retiredPackageId) },
        tracevane: { installPath: path.join(tmpRoot, 'extensions', 'tracevane.prev') },
        other: { installPath: path.join(tmpRoot, 'extensions', retiredPackageId, 'nested') },
        keep: { installPath: path.join(tmpRoot, 'extensions', 'keep') },
      },
      load: {
        paths: [
          path.join(tmpRoot, 'extensions', retiredId),
          path.join(tmpRoot, 'extensions', retiredPackageId),
          path.join(tmpRoot, 'extensions', 'tracevane.old'),
          path.join(tmpRoot, 'extensions', 'keep'),
        ],
      },
    },
    gateway: {
      bind: 'bad-bind',
      controlUi: {
        enabled: false,
        allowedOrigins: ['http://example.invalid'],
      },
    },
  }, null, 2)}\n`, 'utf8');

  const result = childProcess.spawnSync(
    process.execPath,
    [
      '-',
      configPath,
      installDir,
      'gateway',
      '3760',
      '/tracevane',
      '0',
      'lan',
      '0',
    ],
    {
      cwd: tmpRoot,
      input: script,
      encoding: 'utf8',
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const nextConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  assert.equal(nextConfig.plugins.entries[retiredId], undefined);
  assert.equal(nextConfig.plugins.entries[retiredPackageId], undefined);
  assert.equal(nextConfig.plugins.entries.tracevane.enabled, true);
  assert.equal(nextConfig.plugins.entries.tracevane.stale, undefined);
  assert.equal(nextConfig.plugins.entries.tracevane.config.keep, 'value');
  assert.deepEqual(nextConfig.plugins.allow, ['alpha', 'tracevane']);
  assert.deepEqual(nextConfig.plugins.deny, ['blocked']);
  assert.equal(nextConfig.plugins.slots.ui, undefined);
  assert.equal(nextConfig.plugins.installs[retiredId], undefined);
  assert.equal(nextConfig.plugins.installs[retiredPackageId], undefined);
  assert.equal(nextConfig.plugins.installs.tracevane, undefined);
  assert.equal(nextConfig.plugins.installs.other, undefined);
  assert.deepEqual(nextConfig.plugins.installs.keep, {
    installPath: path.join(tmpRoot, 'extensions', 'keep'),
  });
  assert.deepEqual(nextConfig.plugins.load.paths, [
    path.join(tmpRoot, 'extensions', 'keep'),
    installDir.replace(/\\/g, '/'),
  ]);
  assert.equal(nextConfig.gateway.bind, 'lan');
  assert.equal(nextConfig.gateway.controlUi.enabled, true);
  assert.ok(nextConfig.gateway.controlUi.allowedOrigins.includes('http://127.0.0.1:31879'));
  assert.ok(nextConfig.gateway.controlUi.allowedOrigins.includes('http://localhost:31879'));
});
