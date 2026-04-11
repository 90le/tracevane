import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
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
  assert.match(appVue, /DialogTrigger/);
  assert.match(appVue, /DialogPortal/);
  assert.match(appVue, /DialogOverlay/);
  assert.match(appVue, /DialogContent/);
  assert.match(appVue, /TooltipProvider/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(appVue, /<DialogRoot[^>]*v-if="isMobile"[^>]*v-model:open="mobileSidebarOpen"/);
  assert.match(appVue, /<DialogTrigger as-child>/);
  assert.match(appVue, /<DialogOverlay class="mobile-sidebar-mask"\s*\/>/);
  assert.match(appVue, /<DialogContent as-child[\s\S]*?>/);
  assert.doesNotMatch(appVue, /v-if="isMobile && mobileSidebarOpen"\s+class="mobile-sidebar-mask"/);
});

test('sidebar rail component uses reka tooltip primitives for collapsed navigation affordances', () => {
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

test('shell styles define a dedicated tooltip surface for the collapsed sidebar rail', () => {
  assert.match(styleCss, /\.sidebar-rail-tooltip\s*\{/);
});
