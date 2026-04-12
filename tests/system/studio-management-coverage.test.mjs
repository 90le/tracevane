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

test("studio management coverage baseline keeps skills visible even without matched system tests", () => {
  const parsed = runCoverageScript();
  const skills = parsed.tests.find((entry) => entry.domainId === "skills");

  assert.deepEqual(skills, {
    domainId: "skills",
    testPattern: "studio-web-*-skills*.test.mjs",
    matchedFiles: [],
  });
});
