import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const appVue = read("apps/web-vue/src/App.vue");
const routerSource = read("apps/web-vue/src/router.ts");

test("shell redesign uses on-demand context panel and manifest-driven router", () => {
  assert.match(appVue, /StudioShellTopbar/);
  assert.match(appVue, /StudioContextPanel/);
  assert.doesNotMatch(appVue, /StudioShellContextRail/);
  assert.match(appVue, /shell-layout/);
  assert.match(appVue, /shell-main-stage/);
  assert.match(appVue, /shell-context-panel/);
  assert.match(appVue, /<ConfirmDialog\b/);
  assert.match(
    appVue,
    /const \{ themeMode, setThemeMode \} = useThemePreference\(\);/,
  );
  assert.match(appVue, /class="shell-route-stage"/);
  assert.match(appVue, /:theme-mode="themeMode"/);
  assert.match(appVue, /from '\.\/features\/shell\/use-shell-navigation'/);
  assert.doesNotMatch(appVue, /useUiContent/);

  assert.match(
    routerSource,
    /from "\.\/features\/shell\/route-manifest"|from '\.\/features\/shell\/route-manifest'/,
  );
  assert.match(routerSource, /routes:\s*shellRoutes/);
});

const dashboardSummarySource = read(
  "apps/web-vue/src/features/dashboard/use-dashboard-summary.ts",
);

test("shell app reuses shared dashboard summary for topbar counts", () => {
  assert.match(appVue, /riskSummaryValue/);
  assert.match(appVue, /pendingSummaryValue/);
  assert.match(dashboardSummarySource, /subscribeDashboardSummary/);
  assert.match(dashboardSummarySource, /consumerCount/);
  assert.match(dashboardSummarySource, /startDashboardSummary/);
});

const shellNavigationSource = read(
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);

test("shell context panel keeps live summary lightweight", () => {
  assert.match(shellNavigationSource, /buildDashboardPriorityAction/);
  assert.match(
    shellNavigationSource,
    /const liveNextStep = computed\([\s\S]*?buildDashboardPriorityAction/,
  );
  assert.match(
    shellNavigationSource,
    /activeContext\.value\.actions[\s\S]*?\.slice\(0, 2\)/,
  );
  assert.doesNotMatch(
    shellNavigationSource,
    /const livePendingItems = computed\(\(\) => \{/,
  );
});

test("app locale-dependent shell labels stay reactive", () => {
  assert.match(
    appVue,
    /const themeOptions = computed<Array<\{ value: ThemeMode; icon: string; label: string; shortLabel: string \}>>\(\(\) => \[/,
  );
  assert.match(appVue, /const contextToggleLabel = computed\(\(\) => \(/);
  assert.match(appVue, /contextPanelTitle/);
  assert.match(appVue, /contextPanelDescription/);
});
