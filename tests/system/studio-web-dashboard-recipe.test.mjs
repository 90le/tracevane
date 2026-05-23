import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, "../..");
const dashboardView = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/views/DashboardView.vue"),
  "utf8",
);
const dashboardApi = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/dashboard/api.ts"),
  "utf8",
);
const dashboardRecipe = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/dashboard/overview-recipe.ts"),
  "utf8",
);

test("dashboard view exposes a simplified home recipe with clear focus order", () => {
  const requiredClasses = [
    "home-control-surface",
    "home-stage-rhythm",
    "home-situation-band",
    "home-workspace-entry",
    "home-entry-grid",
    "home-compact-visual-strip",
    "home-system-snapshot",
  ];

  for (const className of requiredClasses) {
    assert.match(dashboardView, new RegExp(className));
  }

  const zones = [
    'data-home-zone="situation"',
    'data-home-zone="entry"',
    'data-home-zone="visual"',
    'data-home-zone="snapshot"',
  ];

  for (const zone of zones) {
    assert.match(dashboardView, new RegExp(zone));
  }

  assert.doesNotMatch(dashboardView, /data-home-zone="trend"/);
  assert.doesNotMatch(dashboardView, /data-home-zone="recent"/);
  assert.doesNotMatch(dashboardView, /data-home-zone="risk"/);
  assert.doesNotMatch(dashboardView, /home-risk-chip-strip/);
  assert.doesNotMatch(dashboardView, /home-risk-stage|home-risk-row/);
  assert.doesNotMatch(dashboardView, /等待风险汇总|Waiting for risk summary/);
  assert.doesNotMatch(dashboardView, /home-recent-stream/);
});

test("dashboard view derives compact layout data from dedicated computed collections", () => {
  assert.match(dashboardView, /const homeSituationMetrics = computed\(/);
  assert.match(dashboardView, /const dashboardWorkspaceActions = computed\(/);
  assert.match(dashboardView, /label: text\('会话工作台', 'Chat workspace'\)/);
  assert.match(dashboardView, /copy: text\('新建、继续会话并检索历史记录', 'Start, continue, and search conversation records'\)/);
  assert.doesNotMatch(dashboardView, /查看私聊上下文|View private chat context/);
  assert.doesNotMatch(dashboardView, /const dashboardRiskStageCards = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardContextSummary = computed\(/);
  assert.match(dashboardView, /const dashboardSystemSignals = computed\(/);
  assert.match(dashboardView, /const dashboardCoverageBars = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardStatusChips = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardTrendPanels = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardTrendPoints = computed\(/);
});

test("dashboard view owns scoped page styling for the simplified home control surface", () => {
  assert.match(dashboardView, /<style scoped>/);
  assert.match(dashboardView, /\.home-control-surface\s*\{/);
  assert.match(dashboardView, /\.home-entry-grid\s*\{/);
  assert.match(dashboardView, /\.home-workspace-entry[,\\s]/);
  assert.match(dashboardView, /\.home-compact-visual-strip\s*\{/);
  assert.match(dashboardView, /\.home-system-snapshot\s*\{/);
  assert.match(dashboardView, /\.home-system-snapshot\s*\{/);
  assert.doesNotMatch(dashboardView, /\.home-recent-stream\s*\{/);
  assert.doesNotMatch(dashboardView, /\.home-risk-stage\s*\{/);
});

test("dashboard recipe removes the old split workboard and hero vocabulary", () => {
  assert.doesNotMatch(dashboardView, /class="dashboard-workbench"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-hero-stage"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-action-belt"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-overview-river"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-signal-runway"/);
  assert.doesNotMatch(dashboardView, /const dashboardDomainCards = computed\(/);
  assert.doesNotMatch(dashboardView, /class="dashboard-workboard"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-side-module"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-promenade"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-command-deck"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-track-rail"/);
});

test("dashboard api normalizes collection fields and threads locale for summary + stream", () => {
  assert.match(dashboardApi, /function normalizeDashboardSummary\(/);
  assert.match(
    dashboardApi,
    /recovery:\s*\{[\s\S]*items:\s*Array\.isArray\(payload\.recovery\?\.items\)\s*\?\s*payload\.recovery\.items\s*:\s*\[\]/,
  );
  assert.doesNotMatch(dashboardApi, /trends:/);
  assert.doesNotMatch(dashboardApi, /contextSummary/);
  assert.match(
    dashboardApi,
    /domains:\s*Array\.isArray\(payload\.domains\)\s*\?\s*payload\.domains\s*:\s*\[\]/,
  );
  assert.match(
    dashboardApi,
    /fetchDashboardSummary\([\s\S]*locale:\s*"zh"\s*\|\s*"en"/,
  );
  assert.match(dashboardApi, /\?locale=\$\{locale\}/);
  assert.match(
    dashboardApi,
    /subscribeDashboardSummary\([\s\S]*locale: "zh" \| "en"/,
  );
  assert.match(
    dashboardApi,
    /joinApiPath\(`\/api\/stream\/dashboard\?locale=\$\{locale\}`\)/,
  );
});

test("dashboard recipe no longer exports removed home risk and trend helpers", () => {
  assert.match(dashboardRecipe, /export function buildDashboardOverviewSignals/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardQuickActions/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardPriorityAction/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardRiskStage/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardContextSummary/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardTrendPanels/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardTrendPoints/);
  assert.doesNotMatch(dashboardRecipe, /buildDashboardRecoveryItems/);
  assert.doesNotMatch(dashboardRecipe, /route-manifest/);
});
