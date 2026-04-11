import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const dashboardView = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/views/DashboardView.vue'),
  'utf8',
);

test('dashboard view exposes the new recipe building blocks', () => {
  assert.match(dashboardView, /class="dashboard-workbench"/);
  assert.match(dashboardView, /class="dashboard-hero-stage"/);
  assert.match(dashboardView, /class="dashboard-action-belt"/);
  assert.match(dashboardView, /class="dashboard-overview-river"/);
  assert.match(dashboardView, /class="dashboard-signal-runway"/);
});

test('dashboard view derives layout data from dedicated computed collections', () => {
  assert.match(dashboardView, /const dashboardStatusChips = computed\(/);
  assert.match(dashboardView, /const dashboardQuickActions = computed\(/);
  assert.match(dashboardView, /const dashboardDomainCards = computed\(/);
  assert.match(dashboardView, /const dashboardSystemSignals = computed\(/);
});

test('dashboard view owns scoped page styling for the migrated recipe', () => {
  assert.match(dashboardView, /<style scoped>/);
  assert.match(dashboardView, /\.dashboard-workbench\s*\{/);
  assert.match(dashboardView, /\.dashboard-hero-stage\s*\{/);
  assert.match(dashboardView, /\.dashboard-action-belt\s*\{/);
  assert.match(dashboardView, /\.dashboard-overview-river\s*\{/);
  assert.match(dashboardView, /\.dashboard-signal-runway\s*\{/);
});

test('dashboard recipe removes the old split workboard and grid wall', () => {
  assert.doesNotMatch(dashboardView, /class="panel-card dashboard-hero-card"/);
  assert.doesNotMatch(dashboardView, /class="panel-card dashboard-side-card"/);
  assert.doesNotMatch(dashboardView, /class="panel-card dashboard-track-panel"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-workboard"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-side-module"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-promenade"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-command-deck"/);
  assert.doesNotMatch(dashboardView, /class="dashboard-track-rail"/);
  assert.doesNotMatch(dashboardView, /\.dashboard-domain-grid\s*\{/);
  assert.doesNotMatch(dashboardView, /\.dashboard-stat-card:nth-child\(4n \+ 1\)/);
  assert.doesNotMatch(dashboardView, /\.dashboard-stat-card:nth-child\(4n \+ 2\)/);
  assert.doesNotMatch(dashboardView, /\.dashboard-stat-card:nth-child\(4n \+ 3\)/);
  assert.doesNotMatch(dashboardView, /\.dashboard-stat-card:nth-child\(4n \+ 4\)/);
  assert.doesNotMatch(dashboardView, /\.dashboard-release-block\s*\{[\s\S]*255,\s*190,\s*122/);
});
