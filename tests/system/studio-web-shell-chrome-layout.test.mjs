import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(currentDir, "..", "..");
const appPath = path.join(rootDir, "apps/web-vue/src/App.vue");
const chromePath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-chrome.ts",
);
const releasePath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-release.ts",
);
const panelPath = path.join(
  rootDir,
  "apps/web-vue/src/components/StudioContextPanel.vue",
);
const stylePath = path.join(rootDir, "apps/web-vue/src/style.css");

test("app shell extracts shell layout and release state into dedicated composables", () => {
  assert.equal(fs.existsSync(chromePath), true);
  assert.equal(fs.existsSync(releasePath), true);
  assert.equal(fs.existsSync(panelPath), true);
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(app, /from '\.\/features\/shell\/use-shell-chrome'/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-release'/);
  assert.match(app, /StudioContextPanel/);
  assert.doesNotMatch(app, /StudioShellContextRail/);
  assert.match(app, /shell-layout/);
  assert.match(app, /shell-main-stage/);
  assert.match(app, /shell-context-panel/);
  assert.doesNotMatch(app, /async function refreshStudioReleaseState\(/);
  assert.doesNotMatch(app, /async function refreshStudioUpgradeState\(/);
  assert.doesNotMatch(app, /async function handleStudioUpgradeAction\(/);
  assert.doesNotMatch(app, /let releaseRefreshTimer/);
  assert.doesNotMatch(app, /let upgradePollTimer/);
  assert.doesNotMatch(app, /function updateViewportState\(/);
  assert.doesNotMatch(app, /function toggleSidebar\(/);
});

test("release composable uses confirm dialog helper instead of window.confirm", () => {
  const release = fs.readFileSync(releasePath, "utf8");
  assert.match(release, /useConfirmDialog/);
  assert.match(release, /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\(\)/);
  assert.match(release, /await\s+confirm\(/);
  assert.doesNotMatch(release, /window\.confirm\(/);
});

test("context panel scaffold localizes copy through locale preference helper", () => {
  const panel = fs.readFileSync(panelPath, "utf8");
  assert.match(panel, /useLocalePreference/);
  assert.match(panel, /RouterLink/);
  assert.match(panel, /description\?: string/);
  assert.match(panel, /to: string/);
  assert.match(panel, /'neutral' \| 'accent' \| 'sage' \| 'danger'/);
  assert.match(
    panel,
    /const panelLabel = computed\(\(\) => text\('上下文面板', 'Studio context panel'\)\)/,
  );
  assert.match(
    panel,
    /const panelEyebrow = computed\(\(\) => text\('上下文', 'Context'\)\)/,
  );
  assert.match(
    panel,
    /const panelTitle = computed\(\(\) => text\('工作台上下文', 'Studio Context'\)\)/,
  );
});

test("shell chrome allows mobile context panel on eligible routes and resets by policy", () => {
  const chrome = fs.readFileSync(chromePath, "utf8");
  const app = fs.readFileSync(appPath, "utf8");

  assert.match(
    chrome,
    /const canOpenContextPanel = computed\(\(\) => contextPanelEnabled\.value\)/,
  );
  assert.doesNotMatch(chrome, /!isMobile\.value/);
  assert.doesNotMatch(chrome, /if \(mobile\) contextPanelOpen\.value = false;/);
  assert.match(chrome, /watch\(contextPanelEnabled, \(enabled\) => \{/);
  assert.match(chrome, /if \(!enabled\) \{\s*contextPanelOpen\.value = false;/);

  assert.match(
    app,
    /const contextPanelEnabled = computed\(\(\) => contextPanelMode\.value === 'default'\)/,
  );
  assert.match(
    app,
    /const contextPanelMode = computed<'default' \| 'chat-inspector' \| 'disabled'>/,
  );
  assert.match(app, /:show-context-toggle="canOpenContextPanel"/);
  assert.match(
    app,
    /watch\(\(\) => route\.fullPath, \(\) => \{\s*closeContextPanel\(\);\s*\}\);/,
  );
});

const navigationPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);
const dashboardSummaryPath = path.join(
  rootDir,
  "apps/web-vue/src/features/dashboard/use-dashboard-summary.ts",
);

test("shell navigation consumes shared dashboard summary for live context", () => {
  const navigation = fs.readFileSync(navigationPath, "utf8");
  const dashboardSummary = fs.readFileSync(dashboardSummaryPath, "utf8");

  assert.match(navigation, /useDashboardSummary/);
  assert.match(navigation, /from ['"]\.\.\/dashboard\/overview-recipe['"]/);
  assert.match(navigation, /buildDashboardPriorityAction/);
  assert.match(navigation, /contextSummary\.primaryHint/);
  assert.match(navigation, /const liveNextStep = computed\(/);
  assert.match(
    navigation,
    /activeContext\.value\.actions[\s\S]*?\.slice\(0, 2\)/,
  );
  assert.doesNotMatch(
    navigation,
    /const livePendingItems = computed\(\(\) => \{/,
  );
  assert.match(navigation, /riskSummaryValue/);
  assert.match(navigation, /pendingSummaryValue/);
  assert.match(dashboardSummary, /consumerCount/);
  assert.match(dashboardSummary, /subscribeDashboardSummary/);
});

test("shell styles define a three-region layout and context panel surface", () => {
  const css = fs.readFileSync(stylePath, "utf8");
  assert.match(css, /\.shell-layout\s*\{/);
  assert.match(css, /\.shell-context-panel\s*\{/);
  assert.match(css, /\.shell-main-stage\s*\{/);
  assert.doesNotMatch(css, /\.studio-shell-context-rail\s*\{/);
});
