import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const outputPath = path.join(
  rootDir,
  "docs/superpowers/inventories/tracevane-domain-inventory.json",
);

function runInventoryScript() {
  return spawnSync("node", ["scripts/tracevane-domain-inventory.mjs"], {
    cwd: rootDir,
    encoding: "utf8",
  });
}

test("tracevane inventory script writes a machine-readable baseline for routes, api modules, and test surfaces", () => {
  const result = runInventoryScript();

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(outputPath), true);

  const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.equal(typeof payload.generatedAt, "string");
  assert.ok(Array.isArray(payload.webRoutes));
  assert.ok(Array.isArray(payload.apiModules));
  assert.ok(Array.isArray(payload.webSurfaces?.routes));
  assert.ok(Array.isArray(payload.webSurfaces?.sourceDirs));
  assert.ok(Array.isArray(payload.testSuites));
  assert.ok(payload.webRoutes.includes("/dashboard"));
  assert.ok(payload.webRoutes.includes("/model-gateway"));
  assert.ok(payload.apiModules.includes("config"));
  assert.ok(payload.webSurfaces.sourceDirs.includes("app"));
  assert.ok(payload.webSurfaces.routes.some((route) => route.path === "/chat"));
  assert.ok(
    payload.testSuites.includes("tests/system/config-service.test.mjs"),
  );
});

test("tracevane inventory script keeps the baseline file stable when structure does not change", () => {
  const firstResult = runInventoryScript();
  assert.equal(firstResult.status, 0, firstResult.stderr);

  const before = fs.readFileSync(outputPath, "utf8");
  const firstPayload = JSON.parse(before);

  const secondResult = runInventoryScript();
  assert.equal(secondResult.status, 0, secondResult.stderr);

  const after = fs.readFileSync(outputPath, "utf8");
  const secondPayload = JSON.parse(after);

  assert.equal(after, before);
  assert.equal(secondPayload.generatedAt, firstPayload.generatedAt);
});

test("tracevane inventory script reads the Aurora route manifest instead of the retired Vue router", () => {
  const scriptSource = fs.readFileSync(
    path.join(rootDir, "scripts/tracevane-domain-inventory.mjs"),
    "utf8",
  );

  assert.match(scriptSource, /apps\/web-vue\/src\/app\/route-manifest\.ts/);
  assert.match(scriptSource, /function\s+extractAuroraRoutes/);
  assert.doesNotMatch(scriptSource, /apps\/web-vue\/src\/router\.ts/);
  assert.doesNotMatch(scriptSource, /apps\/web-vue\/src\/features/);
});
