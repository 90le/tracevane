import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  injectInstallerDefaultVersion,
  injectLandingPageVersion,
  parseReleaseMetadata,
} from '../../scripts/tracevane-release-installer-utils.mjs';

test('parseReleaseMetadata extracts version, package URL, and min host version from site metadata', () => {
  const metadata = parseReleaseMetadata(`
    {
      "version": "0.1.21",
      "packageUrl": "https://tracevane.90le.cn/tracevane-0.1.21.tar.gz",
      "minOpenClawVersion": "2026.4.8"
    }
  `);

  assert.deepEqual(metadata, {
    version: '0.1.21',
    packageUrl: 'https://tracevane.90le.cn/tracevane-0.1.21.tar.gz',
    minVersion: '2026.4.8',
  });
});

test('parseReleaseMetadata accepts alternate min host version shapes', () => {
  assert.deepEqual(parseReleaseMetadata(`
    {
      "latestVersion": "0.1.22",
      "packageUrl": "/tracevane-0.1.22.tar.gz",
      "openclaw": {
        "minHostVersion": "2026.4.9"
      }
    }
  `), {
    version: '0.1.22',
    packageUrl: '/tracevane-0.1.22.tar.gz',
    minVersion: '2026.4.9',
  });
});

test('injectInstallerDefaultVersion updates installer fallback version to current release', () => {
  const installer = `
TRACEVANE_DEFAULT_VERSION="\${TRACEVANE_DEFAULT_VERSION:-0.1.20}"
OPENCLAW_MIN_VERSION="\${OPENCLAW_MIN_VERSION:-2026.4.8}"
TRACEVANE_VERSION="\${TRACEVANE_VERSION:-}"
`;

  const rewritten = injectInstallerDefaultVersion(installer, '0.1.21', '2026.4.9');

  assert.match(rewritten, /TRACEVANE_DEFAULT_VERSION="\$\{TRACEVANE_DEFAULT_VERSION:-0\.1\.21\}"/);
  assert.match(rewritten, /OPENCLAW_MIN_VERSION="\$\{OPENCLAW_MIN_VERSION:-2026\.4\.9\}"/);
  assert.doesNotMatch(rewritten, /0\.1\.20/);
});

test('injectLandingPageVersion rewrites the landing page fallback constants', () => {
  const html = `
const TRACEVANE_VERSION = "0.1.20";
const OPENCLAW_MIN_VERSION = "2026.4.8";
`;

  const rewritten = injectLandingPageVersion(html, '0.1.21', '2026.4.9');

  assert.match(rewritten, /const TRACEVANE_VERSION = "0\.1\.21";/);
  assert.match(rewritten, /const OPENCLAW_MIN_VERSION = "2026\.4\.9";/);
});

test('installer remains self-contained for remote metadata and gateway keeps 3760 enabled', () => {
  const installer = fs.readFileSync(new URL('../../install-tracevane.sh', import.meta.url), 'utf8');

  assert.doesNotMatch(installer, /scripts\/tracevane-release-installer-utils\.mjs/);
  assert.match(installer, /tracevaneConfig\.transport\.preferredMode = mode;/);
  assert.match(installer, /tracevaneConfig\.transport\.standalone = \{\s*enabled: true,\s*port: apiPort,\s*\};/);
  assert.match(installer, /STANDALONE_HEALTH_URL="http:\/\/127\.0\.0\.1:\$\{TRACEVANE_API_PORT\}\/api\/system\/health"/);
});

test('pack script syncs landing page versions and includes the current App.vue source snapshot', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');

  assert.match(packScript, /同步 package\/workspace 版本/);
  assert.match(packScript, /apps\/api\/package\.json/);
  assert.match(packScript, /apps\/web-vue\/package\.json/);
  assert.match(packScript, /package-lock\.json/);
  assert.match(packScript, /TRACEVANE_VERSION_FALLBACK/);
  assert.match(packScript, /TRACEVANE_PACKAGE_VERSION_FALLBACK/);
  assert.match(packScript, /install-tracevane\.sh/);
  assert.match(packScript, /rewrite-landing-version/);
  assert.match(packScript, /cp "\$\{LANDING_PAGE_PATH\}" "\$\{ROOT_LANDING_PATH\}"/);
  assert.match(packScript, /cp "\$\{APP_VUE_SOURCE_PATH\}" "\$\{PACKAGE_DIR\}\/apps\/web-vue\/src\/App\.vue"/);
  assert.match(packScript, /release-build\.json/);
});

test('pack script provides a non-mutating test mode for release smoke checks', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');
  const viteConfig = fs.readFileSync(new URL('../../apps/web-vue/vite.config.ts', import.meta.url), 'utf8');

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

test('local source fallback versions stay aligned with package.json for dev debugging', () => {
  const rootPackage = JSON.parse(fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const version = rootPackage.version;
  const apiConfig = fs.readFileSync(new URL('../../apps/api/config.ts', import.meta.url), 'utf8');
  const viteConfig = fs.readFileSync(new URL('../../apps/web-vue/vite.config.ts', import.meta.url), 'utf8');

  assert.match(apiConfig, new RegExp(`const TRACEVANE_VERSION_FALLBACK = '${version.replace(/\./g, '\\.')}'`));
  assert.match(viteConfig, new RegExp(`const TRACEVANE_PACKAGE_VERSION_FALLBACK = '${version.replace(/\./g, '\\.')}'`));
});
