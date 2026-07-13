import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseReleaseMetadata(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw ?? ''));
  } catch {
    return null;
  }

  const version =
    typeof parsed.version === 'string'
      ? parsed.version.trim()
      : typeof parsed.latestVersion === 'string'
        ? parsed.latestVersion.trim()
        : '';
  if (!version) {
    return null;
  }

  const checksum = parsed.checksum && typeof parsed.checksum === 'object'
    ? parsed.checksum
    : {};
  const sha256 = typeof parsed.sha256 === 'string'
    ? parsed.sha256.trim().toLowerCase()
    : typeof parsed.packageSha256 === 'string'
      ? parsed.packageSha256.trim().toLowerCase()
      : typeof checksum.sha256 === 'string'
        ? checksum.sha256.trim().toLowerCase()
        : '';

  return {
    version,
    packageUrl: typeof parsed.packageUrl === 'string' ? parsed.packageUrl.trim() : '',
    minVersion: typeof parsed.minOpenClawVersion === 'string'
      ? parsed.minOpenClawVersion.trim()
      : typeof parsed.minHostVersion === 'string'
        ? parsed.minHostVersion.trim()
        : parsed.openclaw && typeof parsed.openclaw.minHostVersion === 'string'
          ? parsed.openclaw.minHostVersion.trim()
          : '',
    sha256,
  };
}

export function injectInstallerDefaultVersion(source, version, minVersion = '') {
  const normalizedVersion = String(version ?? '').trim();
  if (!normalizedVersion) {
    throw new Error('version is required');
  }

  const versionPattern = /TRACEVANE_DEFAULT_VERSION="\$\{TRACEVANE_DEFAULT_VERSION:-[^}]+\}"/;
  if (!versionPattern.test(source)) {
    throw new Error('installer fallback version marker not found');
  }

  let rewritten = source.replace(
    versionPattern,
    `TRACEVANE_DEFAULT_VERSION="\${TRACEVANE_DEFAULT_VERSION:-${normalizedVersion}}"`,
  );

  const normalizedMinVersion = String(minVersion ?? '').trim();
  if (normalizedMinVersion) {
    const minPattern = /OPENCLAW_MIN_VERSION="\$\{OPENCLAW_MIN_VERSION:-[^}]+\}"/;
    if (!minPattern.test(rewritten)) {
      throw new Error('installer fallback min version marker not found');
    }
    rewritten = rewritten.replace(
      minPattern,
      `OPENCLAW_MIN_VERSION="\${OPENCLAW_MIN_VERSION:-${normalizedMinVersion}}"`,
    );
  }

  return rewritten;
}

export function injectLandingPageVersion(source, version, minVersion) {
  const normalizedVersion = String(version ?? '').trim();
  const normalizedMinVersion = String(minVersion ?? '').trim();
  if (!normalizedVersion || !normalizedMinVersion) {
    throw new Error('version and minVersion are required');
  }

  const versionPattern = /const\s+TRACEVANE_VERSION\s*=\s*["'][^"']+["'];/;
  const minVersionPattern = /const\s+OPENCLAW_MIN_VERSION\s*=\s*["'][^"']+["'];/;
  if (!versionPattern.test(source) || !minVersionPattern.test(source)) {
    throw new Error('landing page version markers not found');
  }

  let rewritten = source.replace(
    versionPattern,
    `const TRACEVANE_VERSION = "${normalizedVersion}";`,
  );
  rewritten = rewritten.replace(
    minVersionPattern,
    `const OPENCLAW_MIN_VERSION = "${normalizedMinVersion}";`,
  );
  return rewritten;
}

function runCli(argv) {
  const [command, ...args] = argv;

  if (command === 'parse-metadata') {
    const parsed = parseReleaseMetadata(process.env.TRACEVANE_RELEASE_METADATA ?? '');
    if (!parsed) {
      process.exit(1);
    }
    process.stdout.write([parsed.version, parsed.packageUrl, parsed.minVersion, parsed.sha256].join('\t'));
    return;
  }

  if (command === 'rewrite-installer-version') {
    const [version, maybeMinVersionOrFile, ...restArgs] = args;
    const maybeLooksLikeFile = typeof maybeMinVersionOrFile === 'string'
      && maybeMinVersionOrFile.includes(path.sep);
    const minVersion = maybeLooksLikeFile ? '' : (maybeMinVersionOrFile || '');
    const filePaths = maybeLooksLikeFile
      ? [maybeMinVersionOrFile, ...restArgs]
      : restArgs;
    if (!version || filePaths.length === 0) {
      throw new Error('usage: rewrite-installer-version <version> [minVersion] <file> [file...]');
    }

    for (const filePath of filePaths) {
      const absolutePath = path.resolve(filePath);
      const source = fs.readFileSync(absolutePath, 'utf8');
      const rewritten = injectInstallerDefaultVersion(source, version, minVersion);
      fs.writeFileSync(absolutePath, rewritten, 'utf8');
    }
    return;
  }

  if (command === 'rewrite-landing-version') {
    const [version, minVersion, ...filePaths] = args;
    if (!version || !minVersion || filePaths.length === 0) {
      throw new Error('usage: rewrite-landing-version <version> <minVersion> <file> [file...]');
    }

    for (const filePath of filePaths) {
      const absolutePath = path.resolve(filePath);
      const source = fs.readFileSync(absolutePath, 'utf8');
      const rewritten = injectLandingPageVersion(source, version, minVersion);
      fs.writeFileSync(absolutePath, rewritten, 'utf8');
    }
    return;
  }

  throw new Error(`unknown command: ${command || '(empty)'}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2));
}
