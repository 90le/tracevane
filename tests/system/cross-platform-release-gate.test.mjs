import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_CATEGORIES,
  releaseGateForPlatform,
} from "../../scripts/cross-platform-release-gate.mjs";

test("quick release gate covers every shipped capability category on all supported platforms", () => {
  for (const platform of ["win32", "darwin", "linux"]) {
    const gate = releaseGateForPlatform(platform, { full: false });
    assert.deepEqual(new Set(gate.map((entry) => entry.category)), new Set(RELEASE_CATEGORIES));
    assert.ok(gate.every((entry) => entry.script && !entry.script.includes(".sh")));
  }
});

test("release gate rejects unsupported platforms instead of silently skipping verification", () => {
  assert.throws(() => releaseGateForPlatform("aix"), /Unsupported release platform: aix/);
});

test("full release gate includes native supervisor and IDE execution", () => {
  const expectedSupervisor = {
    win32: "smoke:supervisor:windows",
    darwin: "smoke:supervisor:macos",
    linux: "smoke:supervisor:linux",
  };
  for (const platform of Object.keys(expectedSupervisor)) {
    const gate = releaseGateForPlatform(platform, { full: true });
    const scripts = gate.map((entry) => entry.script);
    assert.ok(scripts.includes(expectedSupervisor[platform]));
    assert.ok(scripts.includes("ide:rc:full"));
    assert.ok(!scripts.includes("ide:rc:quick"));
    const nativeEntry = gate.find((entry) => entry.script === expectedSupervisor[platform]);
    assert.deepEqual(Object.values(nativeEntry?.env || {}), ["1"]);
  }
});
