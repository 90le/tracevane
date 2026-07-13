# Tracevane Open-Source Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Tracevane as `90le/tracevane` with an MIT-licensed public repository, deterministic GitHub Releases, a verified Linux/macOS Bash installer, Agent installation prompts, and a raw-HTML GitHub Pages site.

**Architecture:** GitHub is the single source of truth for code, tags, release assets, checksums, and issues. `pack.sh` creates immutable versioned assets; the Bash installer consumes the `releases/latest/download` metadata contract; a small Node script assembles the existing raw HTML and assets for GitHub Pages at `/tracevane/`.

**Tech Stack:** Node.js 22, npm workspaces, TypeScript, React/Vite, Bash, Node's built-in test runner, GitHub Actions, GitHub CLI, GitHub Pages.

## Global Constraints

- Public repository: `90le/tracevane`; default branch: `main`; license: MIT.
- Public site: `https://90le.github.io/tracevane/`; do not add `CNAME` or bind a custom domain.
- Bash support: Linux and macOS; WSL is treated as Linux; Git Bash/Cygwin/MSYS must exit with a WSL/PowerShell guidance message.
- Keep root `package.json` private; this release does not publish an npm package.
- GitHub Release is the only default download source; Pages may host a review copy of the installer but must link installs to Release assets.
- Online installation requires a valid SHA-256; never disable TLS verification or continue without a checksum.
- Preserve `standalone` and `gateway` modes, with port `3760` retained as the standalone/fallback port.
- Minimum OpenClaw version remains `2026.5.28` unless official compatibility evidence changes it in a separately reviewed change.
- Default uninstall preserves user data and reports the retained data path.
- Public copy says “feature complete / maintenance mode,” not “closed beta,” “actively expanding,” or “SLA-backed.”
- Do not expose Gateway tokens, API keys, OAuth credentials, full sensitive config, the current phone number, or machine-specific absolute paths.
- Preserve unrelated dirty-worktree changes. At execution start, inventory the current dirty tree, use `superpowers:using-git-worktrees`, create `codex/open-source-release` from the latest approved commit, and import only the current completion changes explicitly confirmed as part of the public release. Never silently omit, commit, overwrite, or publish unrelated user changes.

## File Responsibility Map

- `scripts/tracevane-release-installer-utils.mjs`: parse/rewrite release metadata shared by tests and packaging.
- `pack.sh`: deterministic build, archive, GitHub URLs, release JSON, and `SHA256SUMS` generation.
- `install-tracevane.sh`: platform gate, metadata resolution, checksum enforcement, install/update/uninstall, rollback, health checks, JSON result.
- `tests/system/install-script-release-metadata.test.mjs`: static metadata, packaging, installer, Prompt, and version contracts.
- `tests/installer/install-tracevane-cli.test.mjs`: Bash CLI integration tests using a local HTTP fixture and fake OpenClaw environment.
- `tests/system/open-source-surfaces.test.mjs`: repository documentation, license, public URLs, maintenance copy, and PII contract.
- `scripts/build-pages.mjs`: assemble `dist/pages` without a site framework.
- `tests/system/pages-build.test.mjs`: verify Pages files, subpath-safe links, and metadata.
- `index.html`: raw-HTML product site and four Agent Prompt variants.
- `README.md`, `README_EN.md`: public project landing documentation.
- `docs/installation.md`, `docs/agent-installation.md`, `docs/architecture.md`, `docs/troubleshooting.md`: user and maintainer documentation.
- `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`: open-source governance surfaces.
- `.github/workflows/ci.yml`: pull-request and main-branch verification.
- `.github/workflows/release.yml`: tag validation, deterministic packaging, and GitHub Release creation.
- `.github/workflows/pages.yml`: raw static-site build and Pages deployment.
- `docs/releases/v0.1.72.md`: curated first public Release Notes.

---

### Task 1: Add the public repository and governance contract

**Files:**
- Create: `tests/system/open-source-surfaces.test.mjs`
- Create: `LICENSE`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/install-problem.yml`
- Create: `.github/ISSUE_TEMPLATE/config.yml`
- Create: `.github/pull_request_template.md`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: repository identity `90le/tracevane`, Pages URL, existing npm scripts.
- Produces: `package.json.repository`, `package.json.homepage`, `package.json.bugs`; governance files used by README and GitHub publication.

- [ ] **Step 1: Write the failing public-surface test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('public repository surfaces are complete and point at GitHub', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.private, true);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.repository.url, 'git+https://github.com/90le/tracevane.git');
  assert.equal(pkg.homepage, 'https://90le.github.io/tracevane/');
  assert.equal(pkg.bugs.url, 'https://github.com/90le/tracevane/issues');
  for (const path of ['LICENSE', 'CONTRIBUTING.md', 'SECURITY.md']) {
    assert.ok(read(path).trim().length > 100, `${path} must contain public guidance`);
  }
});

```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/system/open-source-surfaces.test.mjs`

Expected: FAIL because `package.json.repository`, `LICENSE`, `CONTRIBUTING.md`, and `SECURITY.md` do not exist yet.

- [ ] **Step 3: Add exact package metadata and ignore rules**

Add these keys to the root `package.json` without removing `"private": true`:

```json
{
  "repository": {
    "type": "git",
    "url": "git+https://github.com/90le/tracevane.git"
  },
  "homepage": "https://90le.github.io/tracevane/",
  "bugs": {
    "url": "https://github.com/90le/tracevane/issues"
  },
  "license": "MIT"
}
```

Append to `.gitignore`:

```gitignore
# GitHub Pages assembly output
dist/pages/
```

- [ ] **Step 4: Create the governance files**

Use the standard MIT text in `LICENSE` with `Copyright (c) 2026 qiubinbin`. `SECURITY.md` must direct sensitive reports to GitHub's private vulnerability reporting page and use `767759678@qq.com` only as the fallback security address; it must explicitly say not to include secrets in public Issues. `CONTRIBUTING.md` must require `npm ci`, the focused test, both typechecks, both builds, and a clear PR scope.

Create Issue forms with these stable labels:

```yaml
# bug-report.yml
name: Bug report
description: Report a reproducible Tracevane defect
title: "[Bug] "
labels: ["bug"]
body:
  - type: textarea
    id: description
    attributes:
      label: What happened?
    validations:
      required: true
  - type: textarea
    id: reproduction
    attributes:
      label: Reproduction steps
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Tracevane and OpenClaw versions
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: OS, architecture, Node.js, and install mode
    validations:
      required: true
```

`install-problem.yml` uses the same environment/version fields plus installer command, redacted output, and health-check result. `config.yml` sets `blank_issues_enabled: false` and links security reports to `https://github.com/90le/tracevane/security/advisories/new`.

- [ ] **Step 5: Run the focused test**

Run: `node --test tests/system/open-source-surfaces.test.mjs`

Expected: PASS. Public copy and image assertions are introduced separately in Task 6 so this commit remains green.

- [ ] **Step 6: Commit the independently reviewable governance surface**

```bash
git add .gitignore package.json LICENSE CONTRIBUTING.md SECURITY.md .github/ISSUE_TEMPLATE .github/pull_request_template.md tests/system/open-source-surfaces.test.mjs
git commit -m "docs: add public repository governance"
```

### Task 2: Make release metadata deterministic and GitHub-native

**Files:**
- Modify: `tests/system/install-script-release-metadata.test.mjs`
- Modify: `scripts/tracevane-release-installer-utils.mjs`
- Modify: `pack.sh`

**Interfaces:**
- Consumes: explicit version string and repository `90le/tracevane`.
- Produces: `parseReleaseMetadata(raw) -> { version, packageUrl, minVersion, sha256 }`; release JSON and `SHA256SUMS` in the selected output directory.

- [ ] **Step 1: Extend the metadata tests first**

Change the first metadata fixture to:

```js
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
```

Add this packaging contract test:

```js
test('pack script emits GitHub release URLs and SHA256SUMS', () => {
  const packScript = fs.readFileSync(new URL('../../pack.sh', import.meta.url), 'utf8');
  assert.match(packScript, /GITHUB_REPOSITORY="\$\{TRACEVANE_GITHUB_REPOSITORY:-90le\/tracevane\}"/);
  assert.match(packScript, /releases\/download\/v\$\{version\}\/tracevane-\$\{version\}\.tar\.gz/);
  assert.match(packScript, /SHA256SUMS/);
  assert.doesNotMatch(packScript, /https:\/\/tracevane\.90le\.cn\/tracevane-/);
});
```

- [ ] **Step 2: Run the test and confirm the new assertions fail**

Run: `node --test tests/system/install-script-release-metadata.test.mjs`

Expected: FAIL because `sha256`, GitHub release URLs, and `SHA256SUMS` are not implemented.

- [ ] **Step 3: Extend `parseReleaseMetadata`**

Return the normalized checksum using the same accepted shapes as the installer:

```js
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

return { version, packageUrl, minVersion, sha256 };
```

Update CLI `parse-metadata` output to join four fields in this order: version, package URL, minimum OpenClaw version, SHA-256.

Update the existing alternate-shape test expectation to include `sha256: ''`, keeping the return type consistent for every valid metadata shape.

- [ ] **Step 4: Make `pack.sh` emit GitHub-native metadata and checksums**

Define after `SCRIPT_DIR`:

```bash
GITHUB_REPOSITORY="${TRACEVANE_GITHUB_REPOSITORY:-90le/tracevane}"
```

In the metadata Node block, pass `GITHUB_REPOSITORY` as the fifth argument and build:

```js
const repository = process.argv[5];
const packageUrl = `https://github.com/${repository}/releases/download/v${version}/tracevane-${version}.tar.gz`;
```

After the three JSON files are written, generate `SHA256SUMS` with Node so the behavior is identical on Linux and macOS:

```bash
node - "${OUTPUT_DIR}" "${PACKAGE_NAME}.tar.gz" "install-tracevane.sh" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const [outputDir, ...names] = process.argv.slice(2);
const lines = names.map((name) => {
  const digest = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(outputDir, name)))
    .digest('hex');
  return `${digest}  ${name}`;
});
fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
NODE
```

- [ ] **Step 5: Run focused tests and a non-mutating package smoke**

```bash
node --test tests/system/install-script-release-metadata.test.mjs
bash pack.sh --no-source-sync --output-dir .tmp/release-plan-smoke 0.1.72
node -e "const m=require('./.tmp/release-plan-smoke/tracevane-latest.json'); if(!m.packageUrl.includes('github.com/90le/tracevane/releases/download/v0.1.72/')) process.exit(1)"
node -e "const fs=require('node:fs'); const s=fs.readFileSync('.tmp/release-plan-smoke/SHA256SUMS','utf8'); if(!s.includes('tracevane-0.1.72.tar.gz')||!s.includes('install-tracevane.sh')) process.exit(1)"
```

Expected: tests PASS; package smoke builds `tracevane-0.1.72.tar.gz` and both checksum entries.

- [ ] **Step 6: Commit**

```bash
git add pack.sh scripts/tracevane-release-installer-utils.mjs tests/system/install-script-release-metadata.test.mjs
git commit -m "build: make release assets GitHub-native"
```

### Task 3: Harden the Bash installer source, platform gate, and checksum contract

**Files:**
- Modify: `install-tracevane.sh`
- Modify: `tests/system/install-script-release-metadata.test.mjs`
- Create: `tests/installer/install-tracevane-cli.test.mjs`

**Interfaces:**
- Consumes: `--release-base`, `--package-url`, `--package-sha256`, `--version`, `--check-release`.
- Produces: a supported platform identity and a release selection that always has a 64-hex SHA-256 before install.

- [ ] **Step 1: Add failing static and CLI tests**

Add static assertions:

```js
assert.match(installer, /TRACEVANE_RELEASE_BASE="\$\{TRACEVANE_RELEASE_BASE:-https:\/\/github\.com\/90le\/tracevane\/releases\/latest\/download\}"/);
assert.match(installer, /--release-base/);
assert.match(installer, /Linux\|Darwin/);
assert.match(installer, /MINGW\*\|MSYS\*\|CYGWIN\*/);
assert.match(installer, /缺少有效的安装包 SHA-256/);
assert.doesNotMatch(installer, /跳过完整性校验/);
```

Create `tests/installer/install-tracevane-cli.test.mjs` with a local server and a Bash availability guard:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const bash = process.env.BASH_PATH || 'bash';
const bashAvailable = process.platform !== 'win32'
  && childProcess.spawnSync(bash, ['--version']).status === 0;
const root = fileURLToPath(new URL('../..', import.meta.url));
const installer = path.join(root, 'install-tracevane.sh');

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
```

- [ ] **Step 2: Run both tests and confirm failure**

```bash
node --test tests/system/install-script-release-metadata.test.mjs
node --test tests/installer/install-tracevane-cli.test.mjs
```

Expected: static test FAIL; CLI test FAIL because `--release-base` is unknown or checksum omission only warns.

- [ ] **Step 3: Replace the default source and add platform detection**

Replace `TRACEVANE_SITE_BASE` with:

```bash
TRACEVANE_RELEASE_BASE="${TRACEVANE_RELEASE_BASE:-https://github.com/90le/tracevane/releases/latest/download}"
TRACEVANE_PLATFORM=""
TRACEVANE_ARCH=""
```

Add:

```bash
detect_platform() {
  local kernel
  kernel="$(uname -s 2>/dev/null || true)"
  case "${kernel}" in
    Linux|Darwin) TRACEVANE_PLATFORM="${kernel}" ;;
    MINGW*|MSYS*|CYGWIN*) die "Git Bash/Cygwin/MSYS 暂不受支持；请使用 WSL，或等待 PowerShell 安装器。" ;;
    *) die "不受支持的 Bash 平台: ${kernel:-unknown}" ;;
  esac
  TRACEVANE_ARCH="$(uname -m 2>/dev/null || printf unknown)"
}
```

Call `detect_platform` after argument parsing and before metadata resolution. Update usage with `--release-base <url>`; accept `--site-base` as a deprecated alias that assigns `TRACEVANE_RELEASE_BASE` and emits a warning.

- [ ] **Step 4: Resolve metadata only from the release base and require checksum**

Use these candidates:

```bash
for manifest_url in \
  "${TRACEVANE_RELEASE_BASE}/tracevane-latest.json" \
  "${TRACEVANE_RELEASE_BASE}/tracevane-version.json" \
  "${TRACEVANE_RELEASE_BASE}/version.json"
```

After `resolve_requested_release`, require:

```bash
if [[ ! "${TRACEVANE_PACKAGE_SHA256}" =~ ^[0-9A-Fa-f]{64}$ ]]; then
  die "缺少有效的安装包 SHA-256；请使用官方 Release metadata，或同时传入 --package-sha256。"
fi
TRACEVANE_PACKAGE_SHA256="$(printf '%s' "${TRACEVANE_PACKAGE_SHA256}" | tr '[:upper:]' '[:lower:]')"
```

Delete both branches that say checksum is optional or skip verification. Always call `verify_package_checksum` after download.

- [ ] **Step 5: Run the tests and shell syntax check**

```bash
bash -n install-tracevane.sh
node --test tests/system/install-script-release-metadata.test.mjs tests/installer/install-tracevane-cli.test.mjs
```

Expected: PASS on Linux/macOS; on Windows the CLI integration test is explicitly skipped while static tests still pass.

- [ ] **Step 6: Commit**

```bash
git add install-tracevane.sh tests/system/install-script-release-metadata.test.mjs tests/installer/install-tracevane-cli.test.mjs
git commit -m "feat(installer): require verified GitHub releases"
```

### Task 4: Add machine-readable results and safe uninstall

**Files:**
- Modify: `install-tracevane.sh`
- Modify: `tests/installer/install-tracevane-cli.test.mjs`
- Modify: `tests/system/install-script-release-metadata.test.mjs`

**Interfaces:**
- Consumes: `--json`, `--uninstall`, existing config/install paths.
- Produces: one final JSON object with `status`, `version`, `mode`, `platform`, `installDir`, `configPath`, `accessUrls`, `healthChecks`, `backupPath`, `warnings`, `degradedFeatures`; safe uninstall preserves `~/.openclaw/tracevane`.

- [ ] **Step 1: Add failing tests for CLI flags and JSON shape**

Add static assertions for `--json`, `--uninstall`, `emit_result_json`, `uninstall_tracevane`, and `degradedFeatures`. Extend the CLI fixture with a checksum-bearing metadata response and assert:

```js
const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
assert.equal(payload.status, 'ok');
assert.equal(payload.version, '0.1.72');
assert.equal(payload.mode, 'standalone');
assert.ok(['Linux', 'Darwin'].includes(payload.platform));
assert.ok(Array.isArray(payload.accessUrls));
assert.ok(Array.isArray(payload.healthChecks));
assert.ok(Array.isArray(payload.warnings));
assert.ok(Array.isArray(payload.degradedFeatures));
```

Add an uninstall fixture whose config contains a `tracevane` entry and load path; assert the entry/path and extension directory are removed while `${OPENCLAW_HOME_DIR}/tracevane/user-data.json` remains.

- [ ] **Step 2: Run tests and confirm flags/functions are missing**

Run: `node --test tests/installer/install-tracevane-cli.test.mjs tests/system/install-script-release-metadata.test.mjs`

Expected: FAIL on the new assertions.

- [ ] **Step 3: Add result state and JSON emission**

Define arrays and flags near the existing globals:

```bash
JSON_OUTPUT=0
UNINSTALL=0
RESULT_WARNINGS=()
DEGRADED_FEATURES=()
RESULT_ACCESS_URLS=()
RESULT_HEALTH_CHECKS=()
```

Accept `--json` and `--uninstall`. Implement JSON emission via Node and environment variables so shell escaping cannot corrupt JSON:

```bash
emit_result_json() {
  TRACEVANE_RESULT_STATUS="$1" \
  TRACEVANE_RESULT_VERSION="${TRACEVANE_VERSION:-}" \
  TRACEVANE_RESULT_MODE="${TRACEVANE_MODE:-}" \
  TRACEVANE_RESULT_PLATFORM="${TRACEVANE_PLATFORM:-}" \
  TRACEVANE_RESULT_INSTALL_DIR="${INSTALL_DIR}" \
  TRACEVANE_RESULT_CONFIG_PATH="${OPENCLAW_CONFIG_FILE}" \
  TRACEVANE_RESULT_BACKUP_PATH="${ACTIVE_BACKUP_DIR:-${CONFIG_BACKUP:-}}" \
  TRACEVANE_RESULT_ACCESS_URLS="$(printf '%s\n' "${RESULT_ACCESS_URLS[@]:-}")" \
  TRACEVANE_RESULT_HEALTH_CHECKS="$(printf '%s\n' "${RESULT_HEALTH_CHECKS[@]:-}")" \
  TRACEVANE_RESULT_WARNINGS="$(printf '%s\n' "${RESULT_WARNINGS[@]:-}")" \
  TRACEVANE_RESULT_DEGRADED="$(printf '%s\n' "${DEGRADED_FEATURES[@]:-}")" \
  node - <<'NODE'
const lines = (name) => (process.env[name] || '').split('\n').filter(Boolean);
process.stdout.write(`${JSON.stringify({
  status: process.env.TRACEVANE_RESULT_STATUS,
  version: process.env.TRACEVANE_RESULT_VERSION,
  mode: process.env.TRACEVANE_RESULT_MODE,
  platform: process.env.TRACEVANE_RESULT_PLATFORM,
  installDir: process.env.TRACEVANE_RESULT_INSTALL_DIR,
  configPath: process.env.TRACEVANE_RESULT_CONFIG_PATH,
  accessUrls: lines('TRACEVANE_RESULT_ACCESS_URLS'),
  healthChecks: lines('TRACEVANE_RESULT_HEALTH_CHECKS'),
  backupPath: process.env.TRACEVANE_RESULT_BACKUP_PATH,
  warnings: lines('TRACEVANE_RESULT_WARNINGS'),
  degradedFeatures: lines('TRACEVANE_RESULT_DEGRADED'),
})}\n`);
NODE
}
```

The normal human summary remains unchanged when `--json` is absent. When `--json` is present, suppress sensitive/human final summary fields and emit exactly one final JSON line; token-bearing URLs must never enter `RESULT_ACCESS_URLS`.

The `--check-release --json` branch must populate the same schema with empty install/config paths, one package URL in `accessUrls`, and a successful metadata check in `healthChecks`; it must not print human log lines to stdout before the JSON object.

- [ ] **Step 4: Implement safe uninstall before release resolution**

`uninstall_tracevane` must:

1. Back up `openclaw.json` to `${BACKUP_ROOT}/uninstall-${timestamp}/openclaw.json`.
2. Use embedded Node to delete `config.plugins.entries.tracevane`, filter the exact install directory from `config.plugins.load.paths`, and write via temporary file plus rename.
3. Run `openclaw config validate`; restore the backup on failure.
4. Move the extension directory into the uninstall backup instead of immediately deleting it.
5. Leave `${OPENCLAW_HOME_DIR}/tracevane` untouched.
6. Restart the Gateway using the existing service/fallback logic.
7. Emit a human or JSON result naming the retained data directory.

Use this exact embedded config mutation inside `uninstall_tracevane`:

```bash
node - "${OPENCLAW_CONFIG_FILE}" "${INSTALL_DIR}" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const configPath = process.argv[2];
const installDir = path.resolve(process.argv[3]);
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const plugins = config.plugins && typeof config.plugins === 'object' ? config.plugins : {};
if (plugins.entries && typeof plugins.entries === 'object') {
  delete plugins.entries.tracevane;
}
if (plugins.load && Array.isArray(plugins.load.paths)) {
  plugins.load.paths = plugins.load.paths.filter((entry) => {
    if (typeof entry !== 'string') return true;
    return path.resolve(entry) !== installDir;
  });
}
config.plugins = plugins;
const temporaryPath = `${configPath}.tracevane-uninstall.tmp`;
fs.writeFileSync(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
fs.renameSync(temporaryPath, configPath);
NODE
```

Invoke it immediately after platform detection when `UNINSTALL=1`; do not fetch release metadata during uninstall.

- [ ] **Step 5: Record degraded terminal support without exposing secrets**

When `node-pty` cannot load, append `terminal` to `DEGRADED_FEATURES` and a platform-specific warning to `RESULT_WARNINGS`. Replace direct warning calls for service fallback and failed secondary health checks with a helper that both logs and records the warning. Never store `GATEWAY_TOKEN` or a token-bearing URL in result arrays.

- [ ] **Step 6: Run installer tests**

```bash
bash -n install-tracevane.sh
node --test tests/installer/install-tracevane-cli.test.mjs tests/system/install-script-release-metadata.test.mjs
```

Expected: checksum, JSON, uninstall, data-preservation, and secret-redaction cases PASS.

- [ ] **Step 7: Commit**

```bash
git add install-tracevane.sh tests/installer/install-tracevane-cli.test.mjs tests/system/install-script-release-metadata.test.mjs
git commit -m "feat(installer): add JSON results and safe uninstall"
```

### Task 5: Publish user installation docs and four Agent Prompts

**Files:**
- Create: `docs/installation.md`
- Create: `docs/agent-installation.md`
- Create: `docs/troubleshooting.md`
- Modify: `DEPLOY.md`
- Modify: `index.html`
- Modify: `tests/system/install-script-release-metadata.test.mjs`

**Interfaces:**
- Consumes: latest installer URL and flags from Tasks 3–4.
- Produces: user commands and Prompt IDs `promptStandaloneShort`, `promptGatewayShort`, `promptStandaloneAudit`, `promptGatewayAudit`.

- [ ] **Step 1: Add failing documentation and Prompt contract assertions**

```js
test('public install docs and landing prompts use GitHub release assets', () => {
  const files = ['../../README.md', '../../DEPLOY.md', '../../docs/installation.md', '../../docs/agent-installation.md', '../../index.html'];
  const text = files.map((file) => fs.readFileSync(new URL(file, import.meta.url), 'utf8')).join('\n');
  assert.match(text, /github\.com\/90le\/tracevane\/releases\/latest\/download\/install-tracevane\.sh/);
  assert.doesNotMatch(text, /tracevane\.90le\.cn\/install-tracevane\.sh/);
  for (const id of ['promptStandaloneShort', 'promptGatewayShort', 'promptStandaloneAudit', 'promptGatewayAudit']) {
    assert.match(text, new RegExp(`id=["']${id}["']`));
  }
  assert.match(text, /--check-release/);
  assert.match(text, /--dry-run/);
  assert.match(text, /--json/);
  assert.match(text, /healthChecks/);
});
```

- [ ] **Step 2: Run the test and confirm missing docs/IDs fail**

Run: `node --test tests/system/install-script-release-metadata.test.mjs`

Expected: FAIL because docs and four Prompt IDs do not exist.

- [ ] **Step 3: Write the installation documentation**

`docs/installation.md` must contain these exact safe download steps for both modes:

```bash
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o /tmp/install-tracevane.sh
sed -n '1,220p' /tmp/install-tracevane.sh
chmod +x /tmp/install-tracevane.sh
/tmp/install-tracevane.sh --check-release
/tmp/install-tracevane.sh --mode standalone
```

Gateway changes only the final mode to `gateway`. Document `--json`, `--uninstall`, offline `--version` + `--package-url` + `--package-sha256`, WSL behavior, retained user data, and SHA-256 verification. Update `DEPLOY.md` to use GitHub Release URLs and maintainer-only release commands.

- [ ] **Step 4: Write Agent Prompts and update the raw HTML site**

The short standalone Prompt must say:

```text
请从 Tracevane 官方 GitHub Release 下载 Bash 安装器并以 standalone 模式安装。先保存脚本到本地，运行 --check-release；确认来源、版本和 SHA-256 后，执行 --mode standalone --json。不要使用 curl | bash，不要绕过 checksum、TLS、OpenClaw 配置校验或健康检查。最后原样返回安装器 JSON，并总结 version、installDir、configPath、accessUrls、healthChecks、warnings 和 degradedFeatures。
```

The short gateway Prompt uses `--mode gateway --json` and also requires the 3760 fallback health result. The two audit Prompts additionally require platform validation, local script review, `--dry-run`, changed-path disclosure, rollback evidence on failure, and redaction of tokens/credentials.

Replace the two existing `<pre>` elements with four `<pre>` elements using the stable IDs. Keep the current copy button behavior by passing the new ID to `copyPrompt`.

- [ ] **Step 5: Write troubleshooting guidance**

Cover checksum mismatch, unsupported Bash environment, OpenClaw version, `node-pty` degraded state, service-manager fallback, standalone/gateway health URLs, WSL access, offline install, uninstall rollback, and how to open a redacted GitHub Issue.

- [ ] **Step 6: Run documentation contracts**

Run: `node --test tests/system/install-script-release-metadata.test.mjs tests/system/open-source-surfaces.test.mjs`

Expected: Prompt/URL and repository-governance tests PASS.

- [ ] **Step 7: Commit**

```bash
git add DEPLOY.md index.html docs/installation.md docs/agent-installation.md docs/troubleshooting.md tests/system/install-script-release-metadata.test.mjs
git commit -m "docs: publish Bash and Agent install guides"
```

### Task 6: Create the public README, architecture guide, screenshots, and maintenance-mode site

**Files:**
- Modify: `README.md`
- Create: `README_EN.md`
- Create: `CHANGELOG.md`
- Create: `docs/architecture.md`
- Create: `assets/screenshots/dashboard.png`
- Create: `assets/screenshots/workspace.png`
- Create: `assets/screenshots/model-gateway.png`
- Modify: `index.html`
- Modify: `tests/system/open-source-surfaces.test.mjs`

**Interfaces:**
- Consumes: public URLs, install docs, existing brand assets and local app routes.
- Produces: public product narrative and three truthful screenshots used by README and Pages.

- [ ] **Step 1: Extend the failing public-content test**

```js
test('README and site describe the public maintenance release truthfully', () => {
  const zh = read('README.md');
  const en = read('README_EN.md');
  const site = read('index.html');
  for (const text of [zh, en, site]) {
    assert.match(text, /90le\/tracevane/);
    assert.match(text, /releases\/latest/);
  }
  assert.match(zh, /维护模式/);
  assert.match(en, /maintenance mode/i);
  assert.doesNotMatch(site, /Closed Beta/);
  const retiredPhone = ['176', '0660', '0435'].join('');
  assert.equal(site.includes(retiredPhone), false);
  for (const image of ['dashboard.png', 'workspace.png', 'model-gateway.png']) {
    assert.ok(fs.existsSync(new URL(`../../assets/screenshots/${image}`, import.meta.url)));
  }
});
```

- [ ] **Step 2: Run the test and confirm missing English README/screenshots fail**

Run: `node --test tests/system/open-source-surfaces.test.mjs`

Expected: FAIL on `README_EN.md`, screenshot files, maintenance copy, and retired phone copy.

- [ ] **Step 3: Write the Chinese and English READMEs**

Both READMEs must include, in this order: language switch, logo, maintenance status, one-sentence product definition, three screenshots, product boundary table, system requirements, quick Bash install, standalone/gateway explanation, Agent Prompt link, documentation index, development commands, build commands, Release link, security/contribution links, MIT license, and third-party trademark disclaimer. Do not describe unverified Windows support or future features as available.

Use relative screenshot links:

```markdown
![Tracevane dashboard](assets/screenshots/dashboard.png)
![Tracevane workspace](assets/screenshots/workspace.png)
![Tracevane model gateway](assets/screenshots/model-gateway.png)
```

- [ ] **Step 4: Capture three real screenshots**

At execution time, invoke `build-web-apps:frontend-testing-debugging` because this step depends on rendered frontend state. Start the existing app, use the local browser at 1440×960, and capture:

- `/dashboard` route to `assets/screenshots/dashboard.png`
- `/file-manager` route to `assets/screenshots/workspace.png`
- `/model-gateway` route to `assets/screenshots/model-gateway.png`

Each image must show real rendered Tracevane UI with no credentials, local usernames, private file names, phone numbers, tokens, or fabricated data claims. Verify the three files visually before continuing.

- [ ] **Step 5: Update site copy and write architecture/changelog**

Change the footer from `Closed Beta` to `Open Source · Maintenance Mode`, replace phone support with GitHub Issues, and add GitHub, Releases, Documentation, and License links. Add a screenshot section using relative `assets/screenshots/...` sources. `docs/architecture.md` documents Workspace, IDE, Model Gateway, Channels, CLI Agents, System Guard, standalone/gateway data flow, local state, and security boundaries. `CHANGELOG.md` starts with:

```markdown
# Changelog

All notable user-visible changes are documented here. This project follows Semantic Versioning.

## [0.1.72] - 2026-07-13

### Added
- Public MIT repository metadata, contribution and security guidance.
- GitHub Release, GitHub Pages, Bash installer, and Agent installation surfaces.

### Changed
- The default release source is GitHub Releases.
- Public project status is maintenance mode.

### Security
- Online installation now requires SHA-256 verification.
```

- [ ] **Step 6: Run tests and inspect images/site**

```bash
node --test tests/system/open-source-surfaces.test.mjs tests/system/install-script-release-metadata.test.mjs
```

Expected: PASS. Open `index.html` locally and confirm all screenshot sources and GitHub links render.

- [ ] **Step 7: Commit**

```bash
git add README.md README_EN.md CHANGELOG.md docs/architecture.md assets/screenshots index.html tests/system/open-source-surfaces.test.mjs
git commit -m "docs: publish Tracevane project introduction"
```

### Task 7: Build a deterministic raw-HTML Pages artifact

**Files:**
- Create: `scripts/build-pages.mjs`
- Create: `tests/system/pages-build.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `index.html`, `install-tracevane.sh`, `assets/**`, root version and minimum OpenClaw version.
- Produces: `dist/pages/{index.html,404.html,.nojekyll,version.json,install-tracevane.sh,assets/**}`.

- [ ] **Step 1: Write the failing Pages build test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

test('build-pages assembles a subpath-safe raw site', () => {
  const result = childProcess.spawnSync(process.execPath, ['scripts/build-pages.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const out = path.join(root, 'dist', 'pages');
  for (const name of ['index.html', '404.html', '.nojekyll', 'version.json', 'install-tracevane.sh']) {
    assert.ok(fs.existsSync(path.join(out, name)), `${name} must exist`);
  }
  assert.ok(fs.existsSync(path.join(out, 'assets', 'brand', 'tracevane-mark.svg')));
  assert.ok(fs.existsSync(path.join(out, 'assets', 'screenshots', 'dashboard.png')));
  const metadata = JSON.parse(fs.readFileSync(path.join(out, 'version.json'), 'utf8'));
  assert.match(metadata.packageUrl, /github\.com\/90le\/tracevane\/releases\/download\/v/);
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /(?:src|href)=["']\//);
});
```

- [ ] **Step 2: Run the test and confirm the builder is missing**

Run: `node --test tests/system/pages-build.test.mjs`

Expected: FAIL because `scripts/build-pages.mjs` does not exist.

- [ ] **Step 3: Implement the complete Pages assembler**

```js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'pages');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const minMatch = String(pkg.openclaw?.install?.minHostVersion || '').match(/[0-9]+(?:\.[0-9A-Za-z-]+)+/g);
const minOpenClawVersion = minMatch?.at(-1) || '2026.5.28';
const version = pkg.version;
const packageUrl = `https://github.com/90le/tracevane/releases/download/v${version}/tracevane-${version}.tar.gz`;

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, 'index.html'));
fs.copyFileSync(path.join(root, 'index.html'), path.join(out, '404.html'));
fs.copyFileSync(path.join(root, 'install-tracevane.sh'), path.join(out, 'install-tracevane.sh'));
fs.cpSync(path.join(root, 'assets'), path.join(out, 'assets'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '', 'utf8');
fs.writeFileSync(path.join(out, 'version.json'), `${JSON.stringify({
  version,
  latestVersion: version,
  packageUrl,
  minOpenClawVersion,
  releaseUrl: 'https://github.com/90le/tracevane/releases/latest',
}, null, 2)}\n`, 'utf8');
process.stdout.write(`${out}\n`);
```

Add `"build:pages": "node scripts/build-pages.mjs"` and `"test:release": "node --test tests/system/install-script-release-metadata.test.mjs tests/system/open-source-surfaces.test.mjs tests/system/pages-build.test.mjs tests/installer/install-tracevane-cli.test.mjs"` to root scripts.

- [ ] **Step 4: Run the Pages and release-contract tests**

```bash
npm run build:pages
npm run test:release
```

Expected: PASS; output path ends with `dist/pages`.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/build-pages.mjs tests/system/pages-build.test.mjs
git commit -m "build: assemble raw GitHub Pages site"
```

### Task 8: Add pull-request and main-branch CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `tests/system/open-source-surfaces.test.mjs`

**Interfaces:**
- Consumes: npm scripts and installer tests from prior tasks.
- Produces: blocking `verify` and `installer-contract` jobs.

- [ ] **Step 1: Add a failing workflow contract test**

```js
test('CI verifies code, release contracts, and both Bash platforms', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run test:release/);
  assert.match(workflow, /npm run typecheck:api/);
  assert.match(workflow, /npm run typecheck:web/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /shellcheck install-tracevane\.sh pack\.sh/);
  assert.match(workflow, /ubuntu-latest/);
  assert.match(workflow, /macos-latest/);
});
```

- [ ] **Step 2: Run the test and confirm the workflow is missing**

Run: `node --test tests/system/open-source-surfaces.test.mjs`

Expected: FAIL because `.github/workflows/ci.yml` does not exist.

- [ ] **Step 3: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: sudo apt-get update && sudo apt-get install -y shellcheck
      - run: bash -n install-tracevane.sh && bash -n pack.sh
      - run: shellcheck install-tracevane.sh pack.sh
      - run: npm run test:release
      - run: npm run typecheck:api
      - run: npm run typecheck:web
      - run: npm run build

  installer-contract:
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: node --test tests/installer/install-tracevane-cli.test.mjs
```

- [ ] **Step 4: Run the contract test and validate YAML whitespace**

```bash
node --test tests/system/open-source-surfaces.test.mjs
git diff --check
```

Expected: PASS and no whitespace errors.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml tests/system/open-source-surfaces.test.mjs
git commit -m "ci: verify public release contracts"
```

### Task 9: Add the tag-driven GitHub Release workflow and first Release Notes

**Files:**
- Create: `.github/workflows/release.yml`
- Create: `docs/releases/v0.1.72.md`
- Modify: `tests/system/open-source-surfaces.test.mjs`

**Interfaces:**
- Consumes: tag `vX.Y.Z`, matching package version, `pack.sh`, `test:release`.
- Produces: a non-draft GitHub Release with six required assets.

- [ ] **Step 1: Add a failing Release workflow contract test**

```js
test('release workflow validates tag and uploads every required asset', () => {
  const workflow = read('.github/workflows/release.yml');
  assert.match(workflow, /tags:\s*\[?['"]v\*['"]\]?/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /pack\.sh --no-source-sync/);
  for (const asset of ['tracevane-${VERSION}.tar.gz', 'install-tracevane.sh', 'tracevane-latest.json', 'tracevane-version.json', 'version.json', 'SHA256SUMS']) {
    assert.ok(workflow.includes(asset), `${asset} missing from workflow`);
  }
  assert.match(workflow, /gh release create/);
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `node --test tests/system/open-source-surfaces.test.mjs`

Expected: FAIL because the Release workflow is absent.

- [ ] **Step 3: Write the first public Release Notes**

`docs/releases/v0.1.72.md` must contain the product summary, maintenance-mode status, Linux/macOS/WSL support, both install commands, upgrade/uninstall behavior, SHA-256 verification, OpenClaw `>=2026.5.28`, known Git Bash/Windows limitation, GitHub Pages link, documentation links, and security reporting link.

- [ ] **Step 4: Create `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - name: Validate tag and package version
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          PACKAGE_VERSION="$(node -p "require('./package.json').version")"
          test "${VERSION}" = "${PACKAGE_VERSION}"
          test -f "docs/releases/v${VERSION}.md"
      - run: sudo apt-get update && sudo apt-get install -y shellcheck
      - run: bash -n install-tracevane.sh && bash -n pack.sh
      - run: shellcheck install-tracevane.sh pack.sh
      - run: npm run test:release
      - run: npm run typecheck:api
      - run: npm run typecheck:web
      - name: Build release assets
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          bash pack.sh --no-source-sync --output-dir release "${VERSION}"
          test -f "release/tracevane-${VERSION}.tar.gz"
          test -f release/install-tracevane.sh
          test -f release/tracevane-latest.json
          test -f release/tracevane-version.json
          test -f release/version.json
          test -f release/SHA256SUMS
      - name: Publish GitHub Release
        env:
          GH_TOKEN: ${{ github.token }}
        shell: bash
        run: |
          VERSION="${GITHUB_REF_NAME#v}"
          gh release create "${GITHUB_REF_NAME}" \
            "release/tracevane-${VERSION}.tar.gz" \
            "release/install-tracevane.sh" \
            "release/tracevane-latest.json" \
            "release/tracevane-version.json" \
            "release/version.json" \
            "release/SHA256SUMS" \
            --title "Tracevane ${GITHUB_REF_NAME}" \
            --notes-file "docs/releases/v${VERSION}.md" \
            --verify-tag
```

- [ ] **Step 5: Run contracts and a local tag/version simulation**

```bash
node --test tests/system/open-source-surfaces.test.mjs
VERSION=0.1.72
test "${VERSION}" = "$(node -p "require('./package.json').version")" || echo "expected to pass after Task 11 version sync"
```

Expected: workflow contract PASS; version simulation documents the expected pre-release failure until Task 11.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/release.yml docs/releases/v0.1.72.md tests/system/open-source-surfaces.test.mjs
git commit -m "ci: publish verified GitHub releases"
```

### Task 10: Add GitHub Pages deployment

**Files:**
- Create: `.github/workflows/pages.yml`
- Modify: `tests/system/pages-build.test.mjs`

**Interfaces:**
- Consumes: `npm run build:pages`, `dist/pages`.
- Produces: Pages deployment to the repository `github-pages` environment without a `CNAME`.

- [ ] **Step 1: Add the failing Pages workflow test**

```js
test('Pages workflow deploys the assembled raw site without CNAME', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(workflow, /npm run build:pages/);
  assert.match(workflow, /actions\/configure-pages@v5/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
  assert.match(workflow, /path: dist\/pages/);
  assert.equal(fs.existsSync(new URL('../../CNAME', import.meta.url)), false);
});
```

- [ ] **Step 2: Run the test and confirm the workflow is missing**

Run: `node --test tests/system/pages-build.test.mjs`

Expected: FAIL because `.github/workflows/pages.yml` does not exist.

- [ ] **Step 3: Create `.github/workflows/pages.yml`**

```yaml
name: Pages

on:
  push:
    branches: [main]
    paths:
      - 'index.html'
      - 'install-tracevane.sh'
      - 'package.json'
      - 'assets/**'
      - 'scripts/build-pages.mjs'
      - '.github/workflows/pages.yml'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build:pages
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: dist/pages

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 4: Run Pages tests and local build**

```bash
npm run build:pages
node --test tests/system/pages-build.test.mjs
test ! -e CNAME
```

Expected: PASS; `dist/pages` exists and no `CNAME` exists.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml tests/system/pages-build.test.mjs
git commit -m "ci: deploy raw HTML to GitHub Pages"
```

### Task 11: Synchronize version `0.1.72` and complete the public-release audit

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `openclaw.plugin.json`
- Modify: `apps/api/config.ts`
- Modify: `apps/web/vite.config.ts`
- Modify: `install-tracevane.sh`
- Modify: `index.html`
- Create: `docs/releases/public-release-audit-2026-07-13.md`

**Interfaces:**
- Consumes: source version synchronization built into `pack.sh` and all public files.
- Produces: exact `0.1.72` version consistency and a recorded audit decision permitting public push.

- [ ] **Step 1: Run the source version synchronizer**

```bash
bash pack.sh --source-sync --output-dir .tmp/release-version-sync 0.1.72
```

Expected: all package/workspace/fallback/installer/site version markers become `0.1.72`; the command also proves a complete build.

- [ ] **Step 2: Verify every version surface**

```bash
node --test tests/system/install-script-release-metadata.test.mjs
node -e "for (const p of ['./package.json','./apps/api/package.json','./apps/web/package.json','./openclaw.plugin.json']) { const v=require(p).version; if(v!=='0.1.72') throw new Error(p+': '+v) }"
rg -n "0\.1\.71|tracevane\.90le\.cn|1760[0-9]{6}|Closed Beta" README.md README_EN.md DEPLOY.md index.html install-tracevane.sh package.json package-lock.json apps/api/package.json apps/web/package.json openclaw.plugin.json apps/api/config.ts apps/web/vite.config.ts
```

Expected: tests PASS; version command succeeds; `rg` prints no matches.

- [ ] **Step 3: Scan the worktree and history for public-release blockers**

Run these exact checks from the isolated worktree:

```bash
git diff --check
git ls-files -z | xargs -0 rg -n -I "BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}" || true
git log -p HEAD -- . ':!package-lock.json' | rg -n "BEGIN (RSA|OPENSSH|EC|DSA) PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}" || true
git log -p HEAD -- . ':!package-lock.json' | rg -n "1760[0-9]{6}|/home/binbin|C:\\Users\\Administrator" || true
git fsck --connectivity-only --no-reflogs HEAD
```

Expected: no real secret matches; path/phone history matches are reviewed and either removed from the `HEAD` ancestry to be published or documented as non-secret historical metadata. `git fsck` must report no missing/corrupt objects reachable from `HEAD`. The stale local `refs/codex/turn-diffs/...` checkpoint is recorded as a Codex tooling artifact and is never pushed; do not delete branches, commits, or user refs merely to silence background maintenance.

- [ ] **Step 4: Record the audit decision**

`docs/releases/public-release-audit-2026-07-13.md` records the audited commit SHA, commands above, whether full history or a clean snapshot will be published, every reviewed match, third-party asset/license review, absence of `.env`/database/log/release output, and the final `go` or `no-go` decision. Only `go` permits Task 13.

- [ ] **Step 5: Run full local verification**

```bash
npm run test:release
npm run typecheck:api
npm run typecheck:web
npm run build
bash -n install-tracevane.sh
bash -n pack.sh
bash pack.sh --no-source-sync --output-dir .tmp/release-final 0.1.72
```

Expected: every command exits 0 and `.tmp/release-final` contains all six required assets.

- [ ] **Step 6: Commit the release candidate**

```bash
git add package.json package-lock.json apps/api/package.json apps/web/package.json openclaw.plugin.json apps/api/config.ts apps/web/vite.config.ts install-tracevane.sh index.html docs/releases/public-release-audit-2026-07-13.md
git commit -m "chore: prepare Tracevane 0.1.72 release"
```

### Task 12: Review the complete implementation before publication

**Files:**
- Review: all files changed by Tasks 1–11

**Interfaces:**
- Consumes: complete release candidate and audit record.
- Produces: approval to create external GitHub state.

- [ ] **Step 1: Invoke completion verification skill**

Use `superpowers:verification-before-completion` and rerun the exact Task 11 verification commands from a clean worktree state.

- [ ] **Step 2: Request code review**

Use `superpowers:requesting-code-review`. Review must specifically check installer rollback/uninstall, checksum enforcement, token redaction, release asset URLs, workflow permissions, Pages subpath behavior, public PII, and maintenance-mode claims.

- [ ] **Step 3: Resolve every P0/P1/P2 review finding**

For each accepted finding, add a failing regression test, implement the minimal fix, rerun the focused test, and commit with a scoped message. Do not publish with unresolved security, data-loss, release-integrity, or broken-install findings.

- [ ] **Step 4: Confirm clean release state**

```bash
git status --short
git log --oneline --decorate -12
git diff --check
```

Expected: no uncommitted changes in the isolated worktree; recent history shows scoped commits for every task.

### Task 13: Create the public repository, publish Pages, and issue `v0.1.72`

**Files:**
- External state: GitHub repository `90le/tracevane`
- External state: GitHub Pages configuration
- External state: tag and Release `v0.1.72`

**Interfaces:**
- Consumes: audited clean release candidate, GitHub account `90le`.
- Produces: public repository, Pages site, latest Release, and verified installation URLs.

- [ ] **Step 1: Authenticate GitHub CLI without exposing tokens**

```bash
gh auth status || gh auth login --web --git-protocol https
gh auth status
```

Expected: authenticated to `github.com` as `90le`. If browser login requires the owner, pause only for that interactive authorization.

- [ ] **Step 2: Create the public repository and remote**

```bash
gh repo create 90le/tracevane \
  --public \
  --description "Local-first AI Agent control workbench for OpenClaw" \
  --homepage "https://90le.github.io/tracevane/" \
  --source . \
  --remote origin
git remote -v
```

Expected: `origin` points to `https://github.com/90le/tracevane.git`. If the repository already exists, verify ownership/visibility and add the remote rather than recreating it.

- [ ] **Step 3: Push the audited release candidate as `main`**

```bash
git push -u origin HEAD:main
gh repo edit 90le/tracevane --enable-issues --homepage "https://90le.github.io/tracevane/"
gh api -X PUT repos/90le/tracevane/private-vulnerability-reporting
```

Expected: public default branch contains the audited candidate; Issues and private vulnerability reporting are enabled.

- [ ] **Step 4: Enable and verify Pages Actions deployment**

```bash
gh api -X POST repos/90le/tracevane/pages -f build_type=workflow || gh api repos/90le/tracevane/pages
PAGES_RUN_ID="$(gh run list --repo 90le/tracevane --workflow Pages --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "${PAGES_RUN_ID}" --repo 90le/tracevane --exit-status
curl -fL https://90le.github.io/tracevane/ -o .tmp/tracevane-pages.html
rg -n "Tracevane|github.com/90le/tracevane" .tmp/tracevane-pages.html
```

Expected: Pages workflow succeeds; the raw HTML site responds and includes the repository link. No custom-domain or `CNAME` configuration exists.

- [ ] **Step 5: Create and push the annotated release tag**

```bash
git tag -a v0.1.72 -m "Tracevane v0.1.72"
git push origin v0.1.72
RELEASE_RUN_ID="$(gh run list --repo 90le/tracevane --workflow Release --limit 1 --json databaseId --jq '.[0].databaseId')"
gh run watch "${RELEASE_RUN_ID}" --repo 90le/tracevane --exit-status
```

Expected: Release workflow succeeds and creates a non-draft `v0.1.72` Release.

- [ ] **Step 6: Verify release assets and checksums from the public URLs**

```bash
mkdir -p .tmp/public-release-check
curl -fL https://github.com/90le/tracevane/releases/latest/download/tracevane-latest.json -o .tmp/public-release-check/tracevane-latest.json
curl -fL https://github.com/90le/tracevane/releases/latest/download/tracevane-0.1.72.tar.gz -o .tmp/public-release-check/tracevane-0.1.72.tar.gz
curl -fL https://github.com/90le/tracevane/releases/latest/download/install-tracevane.sh -o .tmp/public-release-check/install-tracevane.sh
curl -fL https://github.com/90le/tracevane/releases/latest/download/SHA256SUMS -o .tmp/public-release-check/SHA256SUMS
node - <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve('.tmp/public-release-check');
for (const line of fs.readFileSync(path.join(root, 'SHA256SUMS'), 'utf8').trim().split(/\r?\n/)) {
  const [expected, name] = line.trim().split(/\s+/, 2);
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) throw new Error(`checksum mismatch: ${name}`);
  console.log(`${name}: OK`);
}
NODE
```

Expected: both `tracevane-0.1.72.tar.gz` and `install-tracevane.sh` report `OK`.

- [ ] **Step 7: Run public installer preflight and final GitHub verification**

```bash
bash .tmp/public-release-check/install-tracevane.sh --check-release --json
gh release view v0.1.72 --repo 90le/tracevane --json isDraft,isPrerelease,url,assets
gh repo view 90le/tracevane --json visibility,defaultBranchRef,homepageUrl,url
```

Expected: installer preflight returns JSON `status: ok`, version `0.1.72`, accessible package URL, and valid checksum; Release is neither draft nor prerelease; repository visibility is `PUBLIC`, default branch is `main`, and homepage is the GitHub Pages URL.

---

## Final Verification Matrix

| Surface | Required evidence |
|---|---|
| Source | Public `90le/tracevane`, MIT `LICENSE`, main default branch |
| Build | API/Web typechecks and builds exit 0 |
| Installer | Bash syntax, ShellCheck, fixture tests, Linux/macOS CI |
| Integrity | Metadata SHA-256 plus downloaded `SHA256SUMS` both verify |
| Modes | Standalone and gateway fixture tests; gateway retains 3760 fallback |
| Agent | Four Prompt IDs and JSON result contract tests |
| Uninstall | Config/load path removed; user data preserved; rollback tested |
| Docs | Chinese/English README, install/agent/architecture/troubleshooting, changelog |
| Images | Three visually inspected real product screenshots without private data |
| Pages | `https://90le.github.io/tracevane/` serves raw HTML under `/tracevane/`; no `CNAME` |
| Release | `v0.1.72` non-draft Release with six required assets |
| Security | Worktree/history audit recorded as `go`; private vulnerability reporting enabled |
