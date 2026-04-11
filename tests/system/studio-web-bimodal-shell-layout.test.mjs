import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const appVue = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/App.vue'), 'utf8');
const styleCss = fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/style.css'), 'utf8');
const dashboardView = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/views/DashboardView.vue'),
  'utf8',
);

test('app shell now uses a lighter rail-plus-route layout instead of a boxed top-dock shell', () => {
  assert.match(appVue, /class="sidebar sidebar-rail"/);
  assert.match(appVue, /class="mobile-nav-trigger"/);
  assert.match(appVue, /StudioSidebarRail/);
  assert.match(appVue, /class="shell-route-stage"/);
  assert.doesNotMatch(appVue, /class="shell-command-dock"/);
  assert.doesNotMatch(appVue, /class="shell-stage-surface"/);
  assert.doesNotMatch(appVue, /class="shell-canvas"/);
});

test('style foundation defines mirrored light theme shell surfaces', () => {
  assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--shell-bg-start:\s*#f6f8fb;/);
  assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--shell-bg-end:\s*#dde6f0;/);
  assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--shell-stage-fill:\s*linear-gradient\(180deg,\s*rgba\(255,\s*255,\s*255,\s*0\.9\),\s*rgba\(243,\s*247,\s*251,\s*0\.82\)\);/);
  assert.match(styleCss, /html\[data-theme="light"\]\s*\{[\s\S]*--shell-rail-fill:\s*linear-gradient\(180deg,\s*rgba\(252,\s*253,\s*255,\s*0\.96\),\s*rgba\(239,\s*244,\s*249,\s*0\.88\)\);/);
  assert.match(styleCss, /\.app-container\s*\{[\s\S]*gap:\s*0;/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{[\s\S]*width:\s*34px;/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{[\s\S]*height:\s*34px;/);
  assert.match(styleCss, /\.mobile-nav-trigger\s*\{[\s\S]*border-radius:\s*8px;/);
  assert.match(styleCss, /@media\s*\(max-width:\s*920px\)\s*\{[\s\S]*\.sidebar\s*\{[\s\S]*border-radius:\s*0;/);
  assert.match(styleCss, /\.shell-route-stage\s*\{[\s\S]*width:\s*100%;/);
  assert.doesNotMatch(styleCss, /\.shell-command-dock\s*\{/);
  assert.doesNotMatch(styleCss, /\.shell-stage-surface\s*\{/);
});

test('dashboard adopts the new hero and river vocabulary', () => {
  assert.match(dashboardView, /class="dashboard-hero-stage"/);
  assert.match(dashboardView, /class="dashboard-action-belt"/);
  assert.match(dashboardView, /class="dashboard-overview-river"/);
  assert.match(dashboardView, /class="dashboard-signal-runway"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-promenade"/);
});
