import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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

function runCoverageScript() {
  const stdout = execFileSync(process.execPath, [coverageScriptFile], {
    cwd: rootDir,
    encoding: "utf8",
  });
  return JSON.parse(stdout);
}

test("system runtime manifest covers required runtime sections and runtime surface", () => {
  const source = fs.readFileSync(manifestFile, "utf8");

  assert.match(source, /"overview"/);
  assert.match(source, /"release"/);
  assert.match(source, /"gateway"/);
  assert.match(source, /"bootstrap"/);
  assert.match(source, /"diagnostics"/);
  assert.match(source, /"environment"/);
  assert.match(source, /runtimeSurface/);
  assert.match(source, /SYSTEM_RUNTIME_COVERAGE_SEED/);
});

test("package scripts include studio system runtime coverage command", () => {
  assert.equal(
    packageJson.scripts?.["studio:system-runtime-coverage"],
    "node scripts/studio-system-runtime-coverage.mjs",
  );
});

test("system runtime coverage baseline includes required sections and file surfaces", () => {
  const payload = runCoverageScript();
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes("overview"));
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemControlPage.vue",
    ),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/system/service.ts"),
  );
  assert.ok(
    payload.tests.includes("tests/system/system-runtime-summary.test.mjs"),
  );
});
