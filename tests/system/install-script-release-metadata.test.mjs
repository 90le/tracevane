import test from 'node:test';
import assert from 'node:assert/strict';

import {
  injectInstallerDefaultVersion,
  injectLandingPageVersion,
  parseReleaseMetadata,
} from '../../scripts/studio-release-installer-utils.mjs';

test('parseReleaseMetadata extracts version, package URL, and min host version from site metadata', () => {
  const metadata = parseReleaseMetadata(`
    {
      "version": "0.1.21",
      "packageUrl": "https://studio.90le.cn/openclaw-studio-0.1.21.tar.gz",
      "minOpenClawVersion": "2026.4.8"
    }
  `);

  assert.deepEqual(metadata, {
    version: '0.1.21',
    packageUrl: 'https://studio.90le.cn/openclaw-studio-0.1.21.tar.gz',
    minVersion: '2026.4.8',
  });
});

test('injectInstallerDefaultVersion updates installer fallback version to current release', () => {
  const installer = `
STUDIO_DEFAULT_VERSION="\${STUDIO_DEFAULT_VERSION:-0.1.20}"
OPENCLAW_MIN_VERSION="\${OPENCLAW_MIN_VERSION:-2026.4.8}"
STUDIO_VERSION="\${STUDIO_VERSION:-}"
`;

  const rewritten = injectInstallerDefaultVersion(installer, '0.1.21', '2026.4.9');

  assert.match(rewritten, /STUDIO_DEFAULT_VERSION="\$\{STUDIO_DEFAULT_VERSION:-0\.1\.21\}"/);
  assert.match(rewritten, /OPENCLAW_MIN_VERSION="\$\{OPENCLAW_MIN_VERSION:-2026\.4\.9\}"/);
  assert.doesNotMatch(rewritten, /0\.1\.20/);
});

test('injectLandingPageVersion rewrites the landing page fallback constants', () => {
  const html = `
const STUDIO_VERSION = "0.1.20";
const OPENCLAW_MIN_VERSION = "2026.4.8";
`;

  const rewritten = injectLandingPageVersion(html, '0.1.21', '2026.4.9');

  assert.match(rewritten, /const STUDIO_VERSION = "0\.1\.21";/);
  assert.match(rewritten, /const OPENCLAW_MIN_VERSION = "2026\.4\.9";/);
});
