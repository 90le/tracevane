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
const styleSource = read("apps/web-vue/src/style.css");
const dashboardSummarySource = read(
  "apps/web-vue/src/features/dashboard/use-dashboard-summary.ts",
);
const shellNavigationSource = read(
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);

test("home page redesign keeps zone order and overview builder contracts", () => {
  const requiredClasses = [
    "home-control-surface",
    "home-stage-rhythm",
    "home-situation-band",
    "home-workspace-entry",
    "home-entry-grid",
    "home-compact-visual-strip",
    "home-system-snapshot",
    "home-quick-action",
    "home-section-marker",
  ];

  for (const className of requiredClasses) {
    assert.match(dashboardView, new RegExp(className));
  }

  const zoneOrder = [
    'data-home-zone="situation"',
    'data-home-zone="entry"',
    'data-home-zone="visual"',
    'data-home-zone="snapshot"',
  ];

  let previousIndex = -1;
  for (const zoneMarker of zoneOrder) {
    const nextIndex = dashboardView.indexOf(zoneMarker);
    assert.notEqual(nextIndex, -1, `missing zone marker: ${zoneMarker}`);
    assert.ok(
      nextIndex > previousIndex,
      `${zoneMarker} should appear after previous home zone`,
    );
    previousIndex = nextIndex;
  }

  assert.doesNotMatch(dashboardView, /\bbuildDashboardRiskStage\b/);
  assert.doesNotMatch(dashboardView, /\bbuildDashboardContextSummary\b/);
  assert.doesNotMatch(dashboardView, /const\s+dashboardRiskStageCards\s*=\s*computed\s*\(/);
  assert.doesNotMatch(
    dashboardView,
    /const\s+dashboardRecoveryItems\s*=\s*computed\s*\(/,
  );
  assert.doesNotMatch(
    dashboardView,
    /const\s+dashboardTrendPanels\s*=\s*computed\s*\(/,
  );
  assert.doesNotMatch(
    dashboardView,
    /const\s+dashboardTrendPoints\s*=\s*computed\s*\(/,
  );
  assert.doesNotMatch(dashboardView, /const\s+dashboardContextSummary\s*=\s*computed\s*\(/);
  assert.match(dashboardView, /const\s+dashboardWorkspaceActions\s*=\s*computed\s*\(/);
  assert.match(
    dashboardView,
    /const\s+dashboardCoverageBars\s*=\s*computed\s*\(/,
  );
  assert.doesNotMatch(dashboardView, /home-risk-row\.tone-high/);
  assert.doesNotMatch(dashboardView, /home-risk-row\.tone-medium/);
  assert.doesNotMatch(dashboardView, /home-risk-row\.tone-low/);
  assert.doesNotMatch(dashboardView, /home-risk-stage|home-risk-row/);
  assert.doesNotMatch(dashboardView, /等待风险汇总|Waiting for risk summary/);
  assert.doesNotMatch(dashboardView, /\bhome-risk-chip-strip\b/);
  assert.match(dashboardView, /\bhome-quick-action\b/);
  assert.doesNotMatch(dashboardView, /\bhome-track-list\b/);
  assert.match(dashboardView, /v-if="errorMessage && !hasSummary"/);
  assert.match(
    dashboardView,
    /const \{ summary, hasSummary, loading, errorMessage \} = useDashboardSummary\(\)/,
  );
  for (const selector of [
    ".home-situation-band",
    ".home-workspace-entry",
    ".home-system-snapshot",
  ]) {
    assert.ok(
      styleSource.includes(selector),
      `missing global home selector: ${selector}`,
    );
  }
  assert.ok(styleSource.includes("border: 1px solid var(--border-subtle);"));
  assert.ok(styleSource.includes("background: var(--surface-base);"));
  assert.match(styleSource, /\.home-stage-rhythm\s*\{[\s\S]*?gap:\s*20px;/);
  assert.doesNotMatch(dashboardView, /\.home-control-surface\s*\{[^}]*gap\s*:/);
  assert.match(styleSource, /\.home-situation-band\s*\{/);
  assert.ok(styleSource.includes("var(--accent-soft) 70%"));
  assert.ok(styleSource.includes("var(--surface-raised)"));
  assert.ok(
    styleSource.includes(
      "border-color: color-mix(in srgb, var(--accent-primary) 30%, var(--border-subtle));",
    ),
  );
  assert.match(
    dashboardSummarySource,
    /const hasSummary = computed\([\s\S]*summary\.value !== null && summary\.value\.summaryReady !== false,[\s\S]*\)/,
  );
  assert.match(
    dashboardSummarySource,
    /if \(!silent\) \{[\s\S]*loading\.value = true;/,
  );
  assert.match(
    dashboardSummarySource,
    /if \(!silent \|\| !summary\.value\) \{[\s\S]*errorMessage\.value =/,
  );
  assert.doesNotMatch(
    shellNavigationSource,
    /const \{ summary, streamConnected \} = useDashboardSummary\(\)/,
  );
  assert.match(
    dashboardSummarySource,
    /let refreshTimer: number \| null = null;/,
  );
  assert.doesNotMatch(dashboardView, /dashboardRecoveryItems\.length === 0/);
  assert.doesNotMatch(dashboardView, /dashboardTrendPanels\.length === 0/);
  assert.doesNotMatch(dashboardView, /localizedRiskStageLabel/);
  assert.doesNotMatch(dashboardView, /localizedSeverityLabel/);
  assert.doesNotMatch(
    dashboardView,
    /<span class="home-risk-row__state">\{\{ dashboardContextSummary\.riskStage \}\}<\/span>/,
  );
  assert.doesNotMatch(
    dashboardView,
    /<span class="home-risk-row__state">\{\{ item\.severity \}\}<\/span>/,
  );
  assert.match(dashboardSummarySource, /subscribeDashboardSummary/);
});

test("dashboard summary source preserves previous data during silent refreshes", () => {
  assert.match(dashboardSummarySource, /const currentLocale = computed\(/);
  assert.match(dashboardSummarySource, /watch\(currentLocale,/);
  assert.match(
    dashboardSummarySource,
    /loadDashboardSummary\(false, currentLocale\.value\)/,
  );
  assert.match(
    dashboardSummarySource,
    /connectDashboardStream\(currentLocale\.value\)/,
  );
  assert.match(
    dashboardSummarySource,
    /async function loadDashboardSummary\([\s\S]*silent = false,[\s\S]*locale: Locale,[\s\S]*Promise<void> \{[\s\S]*if \(!silent\) \{[\s\S]*loading\.value = true;[\s\S]*applyDashboardSummary\(await fetchDashboardSummary\(locale\), false\);[\s\S]*if \(!silent \|\| !summary\.value\) \{[\s\S]*errorMessage\.value =/,
  );
  assert.doesNotMatch(
    dashboardSummarySource,
    /if \(silent\) \{[\s\S]*summary\.value = null/,
  );
});
