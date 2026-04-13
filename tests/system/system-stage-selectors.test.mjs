import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");
const selectorsPath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-stage-selectors.ts",
);

const selectorsSource = fs.readFileSync(selectorsPath, "utf8");

test("system stage selectors export required selectors", () => {
  assert.match(selectorsSource, /export function buildSystemStageHeader\(/);
  assert.match(selectorsSource, /export function buildSystemHealthSummary\(/);
  assert.match(
    selectorsSource,
    /export function buildSystemControlActionSummary\(/,
  );
});

test("system stage selectors expose clear summary contracts", () => {
  assert.match(selectorsSource, /export interface SystemStageHeader/);
  assert.match(selectorsSource, /export interface SystemHealthSummary/);
  assert.match(selectorsSource, /export interface SystemControlActionSummary/);
  assert.match(
    selectorsSource,
    /statusTone:\s*["']sage["']\s*\|\s*["']accent["']/,
  );
});
