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
  "system-event-domain-manifest.ts",
);
const coverageScriptFile = path.join(
  rootDir,
  "scripts",
  "studio-system-event-coverage.mjs",
);
const baselineFile = path.join(
  rootDir,
  "docs",
  "superpowers",
  "inventories",
  "studio-system-event-coverage.json",
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

test("system event manifest covers required sections", () => {
  const source = fs.readFileSync(manifestFile, "utf8");

  assert.match(source, /"summary"/);
  assert.match(source, /"filters"/);
  assert.match(source, /"timeline"/);
  assert.match(source, /"detail"/);
  assert.match(source, /routePath:\s*"\/system\/events"/);
  assert.match(source, /eventSurface/);
  assert.match(source, /SYSTEM_EVENT_COVERAGE_SEED/);
});

test("package scripts include studio system event coverage command", () => {
  assert.equal(
    packageJson.scripts?.["studio:system-event-coverage"],
    "node scripts/studio-system-event-coverage.mjs",
  );
});

test("system event coverage baseline matches generated inventory", () => {
  const payload = runCoverageScript();
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes("summary"));
  assert.ok(payload.sections.includes("filters"));
  assert.ok(payload.sections.includes("timeline"));
  assert.ok(payload.sections.includes("detail"));
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemControlPage.vue",
    ),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/system/service.ts"),
  );

  const timelineTests = payload.tests.find(
    (entry) => entry.sectionKey === "timeline",
  );
  assert.ok(timelineTests);
  assert.equal(
    timelineTests.testFile,
    "tests/system/system-event-domain-manifest.test.mjs",
  );
});
