import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const baselineFile = path.join(
  root,
  "docs",
  "superpowers",
  "inventories",
  "studio-management-coverage.json",
);
const coverageScriptFile = path.join(
  root,
  "scripts",
  "studio-management-coverage.mjs",
);
const coverageScriptSource = fs.readFileSync(coverageScriptFile, "utf8");

function runCoverageScript() {
  const stdout = execFileSync(
    process.execPath,
    [path.join(root, "scripts", "studio-management-coverage.mjs")],
    {
      cwd: root,
      encoding: "utf8",
    },
  );

  return JSON.parse(stdout);
}

test("studio management coverage script matches the committed baseline inventory", () => {
  const parsed = runCoverageScript();
  const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));

  assert.deepEqual(parsed, baseline);
});

test("studio management coverage script loads manifest exports instead of scanning ts source text", () => {
  assert.match(coverageScriptSource, /MANAGEMENT_DOMAIN_COVERAGE_SEED/);
  assert.match(coverageScriptSource, /transpileModule/);
  assert.doesNotMatch(coverageScriptSource, /manifestSource\.includes\(/);
  assert.doesNotMatch(coverageScriptSource, /source\.includes\(/);
  assert.doesNotMatch(coverageScriptSource, /manifestSource\.matchAll\(/);
  assert.doesNotMatch(coverageScriptSource, /source\.matchAll\(/);
  assert.doesNotMatch(
    coverageScriptSource,
    /match\(\s*\/export const MANAGEMENT_DOMAIN_COVERAGE_SEED/,
  );
});

test("studio management coverage baseline includes the skills workspace recipe regression", () => {
  const parsed = runCoverageScript();
  const skills = parsed.tests.find((entry) => entry.domainId === "skills");

  assert.deepEqual(skills, {
    domainId: "skills",
    testPattern: "studio-web-skills-*.test.mjs",
    matchedFiles: [
      "tests/system/studio-web-skills-lifecycle-contract.test.mjs",
      "tests/system/studio-web-skills-workspace-recipe.test.mjs",
    ],
  });
});
