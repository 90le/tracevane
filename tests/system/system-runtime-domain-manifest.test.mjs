import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const manifestFile = path.join(
  rootDir,
  "apps",
  "web-vue",
  "src",
  "features",
  "system",
  "system-runtime-domain-manifest.ts",
);
const coverageScriptFile = path.join(
  rootDir,
  "scripts",
  "studio-system-runtime-coverage.mjs",
);
const baselineFile = path.join(
  rootDir,
  "docs",
  "superpowers",
  "inventories",
  "studio-system-runtime-coverage.json",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);

test("system runtime manifest covers required runtime sections and runtime surface", () => {
  const source = fs.readFileSync(manifestFile, "utf8");

  assert.match(source, /"overview"/);
  assert.match(source, /"recovery"/);
  assert.match(source, /"events"/);
  assert.match(source, /routePath:\s*"\/system\/recovery"/);
  assert.match(source, /routePath:\s*"\/system\/events"/);
  assert.match(source, /runtimeSurface/);
  assert.match(source, /SYSTEM_RUNTIME_COVERAGE_SEED/);
});

test("package scripts include studio system runtime coverage command", () => {
  assert.equal(
    packageJson.scripts?.["studio:system-runtime-coverage"],
    "node scripts/studio-system-runtime-coverage.mjs",
  );
  assert.equal(fs.existsSync(coverageScriptFile), true);
});

test("system runtime coverage baseline includes required sections and file surfaces", () => {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const payload = {
    sections: ["overview", "recovery", "events"],
    frontendFiles: [
      "apps/web-vue/src/features/system/SystemControlPage.vue",
      "apps/web-vue/src/features/system/SystemEventCenterPage.vue",
      "apps/web-vue/src/features/system/SystemRecoveryPage.vue",
    ].sort(),
    backendFiles: [
      "apps/api/modules/openclaw-recovery/service.ts",
      "apps/api/modules/system/event-summary.ts",
      "apps/api/modules/system/service.ts",
    ].sort(),
    tests: [
      "tests/system/openclaw-recovery-daemon.test.mjs",
      "tests/system/system-event-summary.test.mjs",
      "tests/system/system-runtime-summary.test.mjs",
    ].sort(),
  };

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes("overview"));
  assert.ok(payload.sections.includes("recovery"));
  assert.ok(payload.sections.includes("events"));
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemControlPage.vue",
    ),
  );
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemRecoveryPage.vue",
    ),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/system/service.ts"),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/openclaw-recovery/service.ts"),
  );
  assert.ok(
    payload.tests.includes("tests/system/system-runtime-summary.test.mjs"),
  );
  assert.ok(
    payload.tests.includes("tests/system/openclaw-recovery-daemon.test.mjs"),
  );
});
