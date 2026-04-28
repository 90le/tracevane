import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const releaseStatePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/studio-release-state.ts",
);
const releaseStateModuleUrl = `${pathToFileURL(releaseStatePath).href}?t=${Date.now()}`;

function createRelease(overrides = {}) {
  return {
    checkedAt: "2026-04-27T00:00:00.000Z",
    currentVersion: "0.1.25",
    latestVersion: "0.1.25",
    updateAvailable: false,
    source: "manifest",
    packageUrl: null,
    minOpenClawVersion: "2026.4.8",
    notes: [],
    ...overrides,
  };
}

function createUpgrade(overrides = {}) {
  return {
    checkedAt: "2026-04-27T00:00:00.000Z",
    status: "failed",
    running: false,
    pid: null,
    mode: "gateway",
    targetVersion: "0.1.25",
    startedAt: "2026-04-27T00:00:00.000Z",
    finishedAt: "2026-04-27T00:01:00.000Z",
    logFile: "/tmp/upgrade.log",
    lastError: "installer log marker missing",
    ...overrides,
  };
}

test("studio release state ignores stale failed upgrades after the installed version reaches the target", async () => {
  const { compareStudioVersions, isStudioUpgradeEffectivelyFailed } =
    await import(releaseStateModuleUrl);

  assert.equal(compareStudioVersions("0.1.25", "0.1.23"), 1);
  assert.equal(compareStudioVersions("v0.1.25", "0.1.25"), 0);
  assert.equal(
    isStudioUpgradeEffectivelyFailed({
      studioRelease: createRelease(),
      studioUpgrade: createUpgrade(),
      buildVersion: "0.1.25",
    }),
    false,
  );
  assert.equal(
    isStudioUpgradeEffectivelyFailed({
      studioRelease: createRelease({ currentVersion: "0.1.25" }),
      studioUpgrade: createUpgrade({ targetVersion: "0.1.26" }),
      buildVersion: "0.1.25",
    }),
    true,
  );
});
