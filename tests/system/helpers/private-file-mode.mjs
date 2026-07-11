import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function assertPrivateFileSecurity(filePath, options = {}) {
  const platform = options.platform ?? process.platform;
  const stat = options.statMode == null
    ? fs.statSync(filePath)
    : { mode: options.statMode, isFile: () => options.isFile === true };
  assert.equal(stat.isFile(), true, `${filePath} must be a regular file`);
  if (platform !== "win32") {
    assert.equal(stat.mode & 0o777, 0o600, `${filePath} expected mode 0600`);
  }
}

function supportsPrivateFileSecurity(parentDir, platform) {
  const probeDir = fs.mkdtempSync(path.join(parentDir, "tracevane-mode-check-"));
  const probeFile = path.join(probeDir, "secret.json");
  try {
    fs.writeFileSync(probeFile, "{}", { mode: 0o600 });
    if (platform !== "win32") {
      fs.chmodSync(probeFile, 0o600);
    }
    assertPrivateFileSecurity(probeFile, { platform });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

export function resolvePrivateModeTempRoot(options = {}) {
  const platform = options.platform ?? process.platform;
  const candidates = options.candidates ?? [
    process.env.TRACEVANE_TEST_TMPDIR,
    process.env.TEST_TMPDIR,
    platform === "win32" ? "" : "/tmp",
    os.tmpdir(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      if (supportsPrivateFileSecurity(candidate, platform)) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  const requirement = platform === "win32"
    ? "a writable temp directory"
    : "a temp directory that preserves chmod(0600)";
  throw new Error(`Model Gateway system tests require ${requirement}; set TRACEVANE_TEST_TMPDIR.`);
}
