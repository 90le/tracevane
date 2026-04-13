import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");
const recipePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-overview-recipe.ts",
);

const recipeSource = fs.readFileSync(recipePath, "utf8");

test("system overview recipe exports required builders", () => {
  assert.match(recipeSource, /export function buildSystemOverviewCards\(/);
  assert.match(recipeSource, /export function buildSystemQuickActions\(/);
  assert.doesNotMatch(
    recipeSource,
    /export function buildSystemEventSummaryItems\(/,
  );
});

test("system overview recipe defines overview card and quick action seams", () => {
  assert.match(recipeSource, /export interface SystemOverviewCard/);
  assert.match(recipeSource, /export interface SystemQuickAction/);
  assert.match(recipeSource, /group:\s*["']health["']\s*\|\s*["']runtime["']/);
  assert.match(recipeSource, /to:\s*["']\/terminal["']/);
  assert.match(recipeSource, /to:\s*["']\/cron["']/);
});
