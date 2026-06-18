import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

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
const baselineFile = path.join(
  rootDir,
  "docs",
  "superpowers",
  "inventories",
  "tracevane-system-event-coverage.json",
);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
);

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

async function runCoverageScript() {
  const manifestModuleSource = fs.readFileSync(manifestFile, "utf8");
  const transpiledManifest = ts.transpileModule(manifestModuleSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: manifestFile,
  });
  const manifestModuleUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(transpiledManifest.outputText)}`;
  const manifestModule = await import(manifestModuleUrl);
  const coverageSeed = manifestModule.SYSTEM_EVENT_COVERAGE_SEED;

  assert.ok(Array.isArray(coverageSeed));
  return {
    sections: coverageSeed.map((entry) => entry.sectionKey),
    eventSurfaces: uniqueSorted(coverageSeed.map((entry) => entry.eventSurface)),
    frontendFiles: uniqueSorted(coverageSeed.map((entry) => entry.frontendFile)),
    backendFiles: uniqueSorted(coverageSeed.map((entry) => entry.backendFile)),
    tests: coverageSeed.map((entry) => ({
      sectionKey: entry.sectionKey,
      testFile: entry.testFile,
    })),
  };
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

test("package scripts include tracevane system event coverage command", () => {
  assert.equal(
    packageJson.scripts?.["tracevane:system-event-coverage"],
    "node scripts/tracevane-system-event-coverage.mjs",
  );
});

test("system event coverage baseline matches generated inventory", async () => {
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
  const payload = await runCoverageScript();

  assert.deepEqual(payload, baseline);
  assert.ok(payload.sections.includes("summary"));
  assert.ok(payload.sections.includes("filters"));
  assert.ok(payload.sections.includes("timeline"));
  assert.ok(payload.sections.includes("detail"));
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemEventSummaryBar.vue",
    ),
  );
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemEventTimeline.vue",
    ),
  );
  assert.ok(
    payload.frontendFiles.includes(
      "apps/web-vue/src/features/system/SystemEventDetailPanel.vue",
    ),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/system/event-summary.ts"),
  );
  assert.ok(
    payload.backendFiles.includes("apps/api/modules/system/service.ts"),
  );

  const summaryTests = payload.tests.find(
    (entry) => entry.sectionKey === "summary",
  );
  assert.ok(summaryTests);
  assert.equal(
    summaryTests.testFile,
    "tests/system/system-event-center-recipe.test.mjs",
  );

  const timelineTests = payload.tests.find(
    (entry) => entry.sectionKey === "timeline",
  );
  assert.ok(timelineTests);
  assert.equal(
    timelineTests.testFile,
    "tests/system/system-event-timeline.test.mjs",
  );
});
