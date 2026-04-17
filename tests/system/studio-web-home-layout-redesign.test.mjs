import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const dashboardView = read("apps/web-vue/src/views/DashboardView.vue");

test("home page redesign keeps primary-stage class contracts", () => {
  assert.match(dashboardView, /home-control-surface/);
  assert.match(dashboardView, /home-risk-stage/);
  assert.match(dashboardView, /home-recent-stream/);
});
