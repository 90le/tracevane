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
  "apps/web-vue/src/components/TracevaneContextPanel.vue",
);
const railPath = path.join(
  rootDir,
  "apps/web-vue/src/components/TracevaneShellContextRail.vue",
);
const stylePath = path.join(rootDir, "apps/web-vue/src/style.css");
const componentsPath = path.join(rootDir, "apps/web-vue/components.d.ts");
const navigationPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);

test("app shell extracts shell layout and release state into dedicated composables", () => {
  assert.equal(fs.existsSync(chromePath), true);
  assert.equal(fs.existsSync(releasePath), true);
  assert.equal(fs.existsSync(panelPath), false);
  assert.equal(fs.existsSync(railPath), false);
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(app, /from '\.\/features\/shell\/use-shell-chrome'/);
  assert.match(app, /from '\.\/features\/shell\/use-shell-release'/);
  assert.match(app, /TracevaneSidebarRail/);
  assert.match(app, /TracevaneShellTopbar/);
  assert.match(app, /shell-layout/);
  assert.match(app, /shell-main-stage/);
  assert.doesNotMatch(app, /TracevaneContextPanel|TracevaneShellContextRail/);
  assert.doesNotMatch(app, /shell-context-panel|contextPanel|show-context-toggle/);
  assert.doesNotMatch(app, /async function refreshTracevaneReleaseState\(/);
  assert.doesNotMatch(app, /async function refreshTracevaneUpgradeState\(/);
  assert.doesNotMatch(app, /async function handleTracevaneUpgradeAction\(/);
  assert.doesNotMatch(app, /let releaseRefreshTimer/);
  assert.doesNotMatch(app, /let upgradePollTimer/);
  assert.doesNotMatch(app, /function updateViewportState\(/);
  assert.doesNotMatch(app, /function toggleSidebar\(/);
});

test("generated component declarations do not retain removed context panels", () => {
  const components = fs.readFileSync(componentsPath, "utf8");
  assert.match(components, /TracevaneCommandPalette/);
  assert.match(components, /TracevaneShellTopbar/);
  assert.match(components, /TracevaneSidebarRail/);
  assert.doesNotMatch(components, /TracevaneContextPanel|TracevaneShellContextRail/);
});

test("release composable uses confirm dialog helper instead of window.confirm", () => {
  const release = fs.readFileSync(releasePath, "utf8");
  assert.match(release, /useConfirmDialog/);
  assert.match(release, /const\s*\{\s*confirm\s*\}\s*=\s*useConfirmDialog\(\)/);
  assert.match(release, /await\s+confirm\(/);
  assert.doesNotMatch(release, /window\.confirm\(/);
});

test("shell chrome only owns viewport and tool rail state", () => {
  const chrome = fs.readFileSync(chromePath, "utf8");
  const app = fs.readFileSync(appPath, "utf8");

  assert.match(chrome, /const sidebarCollapsed = ref\(true\)/);
  assert.match(chrome, /const mobileSidebarOpen = ref\(false\)/);
  assert.match(chrome, /const toggleSidebar = \(\) => \{/);
  assert.match(chrome, /const handleSidebarNavigate = \(\) => \{/);
  assert.match(app, /@toggle-sidebar="toggleSidebar"/);
  assert.match(app, /@open-command-palette="openCommandPalette"/);

  assert.doesNotMatch(chrome, /contextPanel/);
  assert.doesNotMatch(app, /contextPanel|show-context-toggle|closeContextPanel/);
});

test("shell navigation stays route-label only", () => {
  const navigation = fs.readFileSync(navigationPath, "utf8");

  assert.match(navigation, /shellNavGroups\.map/);
  assert.match(navigation, /label:\s*text\(item\.labelZh, item\.labelEn\)/);
  assert.doesNotMatch(navigation, /useDashboardSummary/);
  assert.doesNotMatch(navigation, /from ['"]\.\.\/dashboard\/overview-recipe['"]/);
  assert.doesNotMatch(navigation, /buildDashboardPriorityAction/);
  assert.doesNotMatch(navigation, /liveNextStep|activeContext|routeContextConfigs/);
  assert.doesNotMatch(navigation, /riskSummaryValue|pendingSummaryValue/);
});

test("shell styles define two-region layout without context panel surface", () => {
  const css = fs.readFileSync(stylePath, "utf8");
  const app = fs.readFileSync(appPath, "utf8");
  assert.match(css, /\.shell-layout\s*\{/);
  assert.match(css, /\.shell-main-stage\s*\{/);
  assert.match(css, /\.tracevane-shell-topbar\s*\{/);
  assert.match(css, /\.tracevane-shell-topbar__route-label\s*\{/);
  assert.match(css, /\.tracevane-shell-topbar__path-label\s*\{/);
  assert.doesNotMatch(css, /\.tracevane-shell-topbar__identity strong|\.tracevane-shell-topbar__group-label/);
  assert.match(app, /:current-title=/);
  assert.doesNotMatch(css, /\.shell-context-panel\s*\{/);
  assert.doesNotMatch(css, /\.tracevane-shell-context-rail\s*\{/);
  assert.doesNotMatch(css, /\.tracevane-context-panel\s*\{/);
});
