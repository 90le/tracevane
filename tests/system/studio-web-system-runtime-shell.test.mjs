import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '../..');

const systemControlPagePath = path.join(
  rootDir,
  'apps/web-vue/src/features/system/SystemControlPage.vue',
);
const overviewPanelPath = path.join(
  rootDir,
  'apps/web-vue/src/features/system/SystemOverviewPanel.vue',
);
const sectionRailPath = path.join(
  rootDir,
  'apps/web-vue/src/features/system/SystemSectionRail.vue',
);

const systemControlPage = fs.readFileSync(systemControlPagePath, 'utf8');
const overviewPanel = fs.readFileSync(overviewPanelPath, 'utf8');
const sectionRail = fs.readFileSync(sectionRailPath, 'utf8');

test('system control page keeps a diagnostics summary rail and focused workspace stage', () => {
  assert.match(systemControlPage, /class="system-control-grid"/);
  assert.match(systemControlPage, /class="system-health-strip system-control-tower-rail"/);
  assert.match(systemControlPage, /class="panel-card system-sidebar-panel"/);
  assert.match(systemControlPage, /class="system-quick-links"/);
  assert.match(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(systemControlPage, /router\.push\('\/terminal'\)/);
  assert.match(systemControlPage, /router\.push\('\/cron'\)/);
  assert.match(systemControlPage, /class="system-main-stage"/);
  assert.match(systemControlPage, /class="panel-card system-topic-rail"/);
});

test('system control page exposes five explicit system seams centered on diagnostics work', () => {
  assert.match(
    systemControlPage,
    /type SystemTab = 'overview' \| 'bootstrap' \| 'release' \| 'gateway' \| 'diagnostics'/,
  );
  assert.match(systemControlPage, /\{ id: 'bootstrap' as const, icon: '⚑', label: text\('引导', 'Bootstrap'\) \}/);
  assert.match(systemControlPage, /\{ id: 'overview' as const, icon: '◉', label: text\('概览', 'Overview'\) \}/);
  assert.match(systemControlPage, /\{ id: 'release' as const, icon: '⭮', label: text\('升级', 'Release'\) \}/);
  assert.match(systemControlPage, /\{ id: 'gateway' as const, icon: '⛭', label: text\('Gateway', 'Gateway'\) \}/);
  assert.match(systemControlPage, /\{ id: 'diagnostics' as const, icon: '⌘', label: text\('诊断输出', 'Diagnostics'\) \}/);
  assert.match(systemControlPage, /v-if="activeTab === 'overview'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'release'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'gateway'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'bootstrap'"/);
  assert.match(systemControlPage, /text\('原始诊断输出', 'Raw Diagnostic Output'\)/);
  assert.doesNotMatch(systemControlPage, /'environment'/);
});

test('system control page keeps raw diagnostic output snapshots for gateway status, status, and doctor', () => {
  assert.match(systemControlPage, /openclaw gateway status --json/);
  assert.match(systemControlPage, /openclaw status --json/);
  assert.match(systemControlPage, /openclaw doctor/);
  assert.match(systemControlPage, /class="system-code-block"/);
});

test('new system shell helper components keep dedicated template seams', () => {
  assert.match(overviewPanel, /<section class="system-section">/);
  assert.match(overviewPanel, /v-for="card in healthCards"/);
  assert.match(overviewPanel, /v-for="card in runtimeCards"/);

  assert.match(sectionRail, /<article class="panel-card system-sidebar-panel">/);
  assert.match(sectionRail, /<StatusPill/);
  assert.match(sectionRail, /v-for="action in quickActions"/);
});