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
const dashboardWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/dashboard/dashboard-workspace.css"),
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

function cssRuleBlock(selector) {
  const start = dashboardWorkspaceCss.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `Missing CSS rule for ${selector}`);
  const end = dashboardWorkspaceCss.indexOf("\n}", start);
  assert.notEqual(end, -1, `Missing CSS rule end for ${selector}`);
  return dashboardWorkspaceCss.slice(start, end + 2);
}

test("dashboard view exposes a simplified home recipe with clear focus order", () => {
  const requiredClasses = [
    "home-control-surface",
    "home-stage-rhythm",
    "home-situation-band",
    "home-workspace-strip",
    "home-action-list",
    "home-action-row",
    "home-system-snapshot",
    "home-readiness-list",
    "home-readiness-row",
  ];

  for (const className of requiredClasses) {
    assert.match(dashboardView, new RegExp(className));
  }

  const zones = [
    'data-home-zone="situation"',
    'data-home-zone="entry"',
    'data-home-zone="snapshot"',
  ];

  for (const zone of zones) {
    assert.match(dashboardView, new RegExp(zone));
  }

  assert.doesNotMatch(dashboardView, /data-home-zone="trend"/);
  assert.doesNotMatch(dashboardView, /data-home-zone="recent"/);
  assert.doesNotMatch(dashboardView, /data-home-zone="risk"/);
  assert.doesNotMatch(dashboardView, /data-home-zone="visual"/);
  assert.doesNotMatch(dashboardView, /Signal Mini Chart|Compact signal chart|轻量信号图/);
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
  assert.match(dashboardView, /const dashboardReadinessSignals = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardCoverageBars = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardStatusChips = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardTrendPanels = computed\(/);
  assert.doesNotMatch(dashboardView, /const dashboardTrendPoints = computed\(/);
});

test("dashboard view owns feature CSS for the simplified home control surface", () => {
  assert.match(dashboardView, /import '\.\.\/features\/dashboard\/dashboard-workspace\.css';/);
  assert.doesNotMatch(dashboardView, /<style scoped>/);
  assert.match(dashboardWorkspaceCss, /\.home-control-surface\s*\{/);
  assert.match(dashboardWorkspaceCss, /\.home-workspace-strip\s*\{/);
  assert.match(dashboardWorkspaceCss, /\.home-action-list\s*\{/);
  assert.doesNotMatch(dashboardView, /home-command-panel|home-command-list|home-command-row|home-command-copy/);
  assert.doesNotMatch(dashboardWorkspaceCss, /home-command-panel|home-command-list|home-command-row|home-command-copy/);
  assert.match(dashboardWorkspaceCss, /\.home-system-snapshot\s*\{/);
  assert.match(dashboardWorkspaceCss, /\.home-readiness-list\s*\{/);
  assert.match(dashboardWorkspaceCss, /\.home-readiness-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(120px,\s*0\.72fr\) minmax\(72px,\s*auto\) minmax\(0,\s*1\.28fr\);/);
  assert.match(dashboardWorkspaceCss, /\.home-situation-meters\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(180px, 1fr\)\);[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(dashboardWorkspaceCss, /\.home-situation-meter\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:[\s\S]*inset -1px 0 0 var\(--border-subtle\),[\s\S]*inset 0 -1px 0 var\(--border-subtle\);/);
  assert.doesNotMatch(dashboardWorkspaceCss, /home-compact-visual-strip|home-mini-chart/);
  assert.match(dashboardWorkspaceCss, /\.home-resource-signals\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(210px, 1fr\)\);[\s\S]*background:\s*var\(--surface-base\);/);
  assert.doesNotMatch(
    dashboardWorkspaceCss,
    /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass/,
  );
  assert.doesNotMatch(dashboardWorkspaceCss, /--shell-(?:panel|stage|highlight)|var\(--surface\)/);
  assert.match(
    dashboardWorkspaceCss,
    /\.home-readiness-row\.tone-high\s*\{[\s\S]*inset 3px 0 0 var\(--danger\),/,
  );
  assert.match(
    dashboardWorkspaceCss,
    /\.home-readiness-row\.tone-medium\s*\{[\s\S]*inset 3px 0 0 var\(--warning\),/,
  );
  assert.doesNotMatch(dashboardWorkspaceCss, /\.home-recent-stream\s*\{/);
  assert.doesNotMatch(dashboardWorkspaceCss, /\.home-risk-stage\s*\{/);
  assert.doesNotMatch(cssRuleBlock(".home-situation-meters"), /gap:\s*1px/);
  assert.doesNotMatch(cssRuleBlock(".home-readiness-list"), /background:\s*var\(--shell-panel-border\)/);
  assert.doesNotMatch(dashboardView, /home-entry-grid|home-quick-action|home-workspace-entry/);
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
