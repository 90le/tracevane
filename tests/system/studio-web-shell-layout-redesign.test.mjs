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
const shellNavigationSource = read(
  "apps/web-vue/src/features/shell/use-shell-navigation.ts",
);
const routeManifestSource = read(
  "apps/web-vue/src/features/shell/route-manifest.ts",
);
const legacyUiContentPath = path.join(
  rootDir,
  "apps/web-vue/src/data/mock.ts",
);

test("shell redesign keeps one sidebar navigation model and no global context panel", () => {
  assert.match(appVue, /StudioShellTopbar/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(appVue, /StudioCommandPalette/);
  assert.match(appVue, /:nav-groups="navGroups"/);
  assert.match(appVue, /:current-title="activeNavItem\?\.label/);
  assert.match(appVue, /:command-label="text\('打开命令面板', 'Open command palette'\)"/);
  assert.match(appVue, /shell-layout/);
  assert.match(appVue, /shell-main-stage/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.match(appVue, /:theme-mode="themeMode"/);
  assert.match(appVue, /from '\.\/features\/shell\/use-shell-navigation'/);
  assert.match(
    appVue,
    /<StudioCommandPalette\s+v-model:open="commandPaletteOpen"\s*\/>/,
  );

  assert.doesNotMatch(appVue, /StudioContextPanel|StudioShellContextRail/);
  assert.doesNotMatch(appVue, /shell-context-panel|contextPanel|contextToggle/);
  assert.doesNotMatch(appVue, /riskSummaryValue|pendingSummaryValue/);
  assert.doesNotMatch(appVue, /useUiContent/);
  assert.equal(fs.existsSync(legacyUiContentPath), false);
});

test("router consumes the shell route manifest without context-panel metadata", () => {
  assert.match(
    routerSource,
    /from "\.\/features\/shell\/route-manifest"|from '\.\/features\/shell\/route-manifest'/,
  );
  assert.match(routerSource, /routes:\s*shellRoutes/);
  assert.match(routeManifestSource, /export const shellRoutes/);
  assert.doesNotMatch(routeManifestSource, /contextPanel/);
});

test("shell navigation only builds grouped route labels for the sidebar", () => {
  assert.match(shellNavigationSource, /shellNavGroups\.map/);
  assert.match(shellNavigationSource, /items:\s*group\.items/);
  assert.match(shellNavigationSource, /\.filter\(\(item\) => !item\.future\)/);
  assert.doesNotMatch(shellNavigationSource, /routeContextConfigs/);
  assert.doesNotMatch(shellNavigationSource, /liveNextStep/);
  assert.doesNotMatch(shellNavigationSource, /activeContext/);
});

test("app locale-dependent shell labels stay reactive", () => {
  assert.match(
    appVue,
    /const themeOptions = computed<Array<\{ value: ThemeMode; label: string; shortLabel: string \}>>\(\(\) => \[/,
  );
  assert.match(appVue, /const localeOptions: Array<\{ value: Locale;/);
  assert.match(appVue, /:theme-switch-label="text\('主题模式', 'Theme mode'\)"/);
  assert.match(appVue, /:locale-switch-label="text\('语言模式', 'Language mode'\)"/);
  assert.doesNotMatch(appVue, /contextPanelTitle|contextPanelDescription/);
});
