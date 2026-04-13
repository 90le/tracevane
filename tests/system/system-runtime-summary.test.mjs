import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");
const runtimeViewModelPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-runtime-view-model.ts",
);
const eventSummaryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-event-summary.ts",
);
const systemPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/SystemControlPage.vue",
);

test("system runtime seams export required builders", () => {
  const runtimeViewModelSource = fs.readFileSync(runtimeViewModelPath, "utf8");
  const eventSummarySource = fs.readFileSync(eventSummaryPath, "utf8");

  assert.match(
    runtimeViewModelSource,
    /export function buildSystemRuntimeViewModel\(/,
  );
  assert.match(eventSummarySource, /export function buildSystemEventSummary\(/);
});

test("SystemControlPage consumes runtime view model and event summary seams", () => {
  const pageSource = fs.readFileSync(systemPagePath, "utf8");

  assert.match(pageSource, /from '\.\/system-runtime-view-model'/);
  assert.match(pageSource, /from '\.\/system-event-summary'/);
  assert.match(pageSource, /buildSystemRuntimeViewModel\(/);
  assert.match(pageSource, /buildSystemEventSummary\(/);
  assert.match(pageSource, /runtimeViewModel\.value\.studioUpgradeStatusLabel/);
  assert.match(pageSource, /runtimeViewModel\.value\.studioUpgradeActionLabel/);
});
