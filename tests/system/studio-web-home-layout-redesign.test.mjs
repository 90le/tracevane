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
  const requiredClasses = [
    "home-control-surface",
    "home-stage-rhythm",
    "home-situation-band",
    "home-risk-stage",
    "home-risk-stage__main",
    "home-risk-stage__side",
    "home-risk-chip-strip",
    "home-risk-stream",
    "home-resource-grid",
    "home-resource-panel",
    "home-recent-stream",
    "home-track-list",
    "home-section-marker",
  ];

  for (const className of requiredClasses) {
    assert.match(dashboardView, new RegExp(className));
  }

  assert.match(
    dashboardView,
    /<motion\.header class="home-situation-band"[\s\S]*data-home-zone="situation"/,
  );
  assert.match(
    dashboardView,
    /<section class="home-risk-stage"[\s\S]*data-home-zone="risk"[\s\S]*<div class="home-risk-stage__main">[\s\S]*<aside class="home-risk-stage__side">/,
  );
  assert.match(
    dashboardView,
    /<section class="home-resource-grid"[\s\S]*data-home-zone="resource"[\s\S]*<section class="home-resource-panel">[\s\S]*<section class="home-resource-panel">/,
  );
  assert.match(
    dashboardView,
    /<section class="home-recent-stream"[\s\S]*data-home-zone="recent"/,
  );
  assert.match(
    dashboardView,
    /<RouterLink[\s\S]*v-for="domain in dashboardDomainCards"[\s\S]*:to="domain.to"/,
  );
});
