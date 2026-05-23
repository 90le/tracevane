import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '../..');
const packageJson = fs.readFileSync(path.join(rootDir, 'apps/web-vue/package.json'), 'utf8');
const appVue = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/App.vue'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');
const sidebarRailPath = path.join(rootDir, 'apps/web-vue/src/components/StudioSidebarRail.vue');

test('web workspace installs reka-ui as the shell interaction primitive layer', () => {
  assert.match(packageJson, /"reka-ui"\s*:/);
});

test('app shell uses reka dialog primitives for the mobile sidebar instead of a hand-rolled mask div', () => {
  assert.match(appVue, /from 'reka-ui'/);
  assert.match(appVue, /DialogRoot/);
  assert.match(appVue, /DialogPortal/);
  assert.match(appVue, /DialogOverlay/);
  assert.match(appVue, /DialogContent/);
  assert.match(appVue, /TooltipProvider/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(appVue, /<DialogRoot[^>]*v-if="isMobile"[^>]*v-model:open="mobileSidebarOpen"/);
  assert.match(appVue, /<DialogOverlay class="mobile-sidebar-mask"\s*\/>/);
  assert.match(appVue, /<DialogContent as-child[\s\S]*?>/);
  assert.doesNotMatch(appVue, /DialogTrigger/);
  assert.doesNotMatch(appVue, /v-if="isMobile && mobileSidebarOpen"\s+class="mobile-sidebar-mask"/);
});

test('sidebar rail component uses reka tooltip primitives for collapsed tool affordances', () => {
  assert.equal(fs.existsSync(sidebarRailPath), true);
  const sidebarRail = fs.readFileSync(sidebarRailPath, 'utf8');
  assert.match(sidebarRail, /from 'reka-ui'/);
  assert.match(sidebarRail, /TooltipRoot/);
  assert.match(sidebarRail, /TooltipTrigger/);
  assert.match(sidebarRail, /TooltipPortal/);
  assert.match(sidebarRail, /TooltipContent/);
  assert.match(sidebarRail, /showRailTooltips/);
  assert.match(sidebarRail, /class="sidebar-rail-tooltip"/);
});

test('sidebar rail no longer duplicates topbar theme and locale controls', () => {
  const sidebarRail = fs.readFileSync(sidebarRailPath, 'utf8');
  assert.doesNotMatch(sidebarRail, /sidebar-utility-cluster/);
  assert.doesNotMatch(sidebarRail, /themeSwitchLabel/);
  assert.doesNotMatch(sidebarRail, /localeSwitchLabel/);
  assert.doesNotMatch(sidebarRail, /set-theme-mode/);
  assert.doesNotMatch(sidebarRail, /set-locale/);
  assert.doesNotMatch(styleCss, /sidebar-utility-cluster/);
  assert.match(appVue, /<StudioShellTopbar[\s\S]*:theme-switch-label/);
  assert.match(appVue, /<StudioShellTopbar[\s\S]*:locale-switch-label/);
});

test('sidebar rail owns the single primary navigation without duplicating theme controls', () => {
  const sidebarRail = fs.readFileSync(sidebarRailPath, 'utf8');
  assert.match(appVue, /text\('展开工具栏', 'Expand tools'\)/);
  assert.match(appVue, /text\('收起工具栏', 'Collapse tools'\)/);
  assert.match(sidebarRail, /class="sidebar-navigation"/);
  assert.match(sidebarRail, /v-for="group in navGroups"/);
  assert.match(sidebarRail, /v-for="item in group\.items"/);
  assert.match(sidebarRail, /isActiveRoute\(item\.to\)/);
  assert.doesNotMatch(appVue, /展开侧边栏|折叠侧边栏|Expand sidebar|Collapse sidebar/);
  assert.doesNotMatch(sidebarRail, /themeSwitchLabel|localeSwitchLabel|set-theme-mode|set-locale/);
});

test('shell styles define a dedicated tooltip surface for the collapsed sidebar rail', () => {
  assert.match(styleCss, /\.sidebar-rail-tooltip\s*\{/);
});
