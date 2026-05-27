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

const systemControlPage = fs.readFileSync(systemControlPagePath, 'utf8');
const systemActionHandoffPanel = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/system/SystemActionHandoffPanel.vue'),
  'utf8',
);
const systemWorkspaceCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/system/system-workspace.css'),
  'utf8',
);

test('system control page keeps a diagnostics summary rail and focused workspace stage', () => {
  assert.match(systemControlPage, /class="system-control-grid"/);
  assert.match(systemControlPage, /class="system-health-strip system-control-tower-rail"/);
  assert.match(systemControlPage, /class="system-sidebar-panel"/);
  assert.match(systemControlPage, /class="system-command-list"/);
  assert.match(systemControlPage, /class="system-command-row"/);
  assert.doesNotMatch(systemControlPage, /class="system-quick-links"/);
  assert.match(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(systemControlPage, /router\.push\('\/terminal'\)/);
  assert.match(systemControlPage, /router\.push\('\/cron'\)/);
  assert.match(systemControlPage, /class="system-main-stage"/);
  assert.match(systemControlPage, /class="system-topic-rail"/);
  assert.match(systemControlPage, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemControlPage, /<style scoped>/);
  assert.match(systemWorkspaceCss, /\.system-command-list\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-command-row\s*\{/);
});

test('system action handoff panel keeps styles in the system feature stylesheet', () => {
  assert.match(systemActionHandoffPanel, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemActionHandoffPanel, /<style scoped>/);
  assert.match(systemWorkspaceCss, /\.system-handoff-panel\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-handoff-route\s*\{/);
});

test('system control page exposes five explicit system seams centered on diagnostics work', () => {
  assert.match(
    systemControlPage,
    /type SystemTab = 'overview' \| 'bootstrap' \| 'release' \| 'gateway' \| 'diagnostics'/,
  );
  assert.match(systemControlPage, /\{ id: 'bootstrap' as const, icon: Flag, label: text\('引导', 'Bootstrap'\) \}/);
  assert.match(systemControlPage, /\{ id: 'overview' as const, icon: Gauge, label: text\('概览', 'Overview'\) \}/);
  assert.match(systemControlPage, /\{ id: 'release' as const, icon: RefreshCw, label: text\('升级', 'Release'\) \}/);
  assert.match(systemControlPage, /\{ id: 'gateway' as const, icon: Network, label: text\('Gateway', 'Gateway'\) \}/);
  assert.match(systemControlPage, /\{ id: 'diagnostics' as const, icon: ClipboardList, label: text\('诊断输出', 'Diagnostics'\) \}/);
  assert.match(systemControlPage, /v-if="activeTab === 'overview'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'release'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'gateway'"/);
  assert.match(systemControlPage, /v-else-if="activeTab === 'bootstrap'"/);
  assert.match(systemControlPage, /text\('原始诊断输出', 'Raw Diagnostic Output'\)/);
  assert.doesNotMatch(systemControlPage, /'environment'/);
});

test('system control page opens raw diagnostic output in a floating sheet', () => {
  assert.match(systemControlPage, /openclaw gateway status --json/);
  assert.match(systemControlPage, /openclaw status --json/);
  assert.match(systemControlPage, /openclaw doctor/);
  assert.match(systemControlPage, /class="system-diagnostic-command-list"/);
  assert.match(systemControlPage, /<Teleport v-if="diagnosticOutputOpen" to="body">/);
  assert.match(systemControlPage, /class="system-output-sheet-dock"/);
  assert.match(systemControlPage, /class="system-output-sheet"/);
  assert.match(systemControlPage, /function openDiagnosticOutput\(commandId: SystemDiagnosticCommandId\): void/);
  assert.match(systemControlPage, /copyTextToClipboard\(activeDiagnosticOutput\.value\)/);
  assert.doesNotMatch(systemControlPage, /class="system-code-block"/);
  assert.match(systemWorkspaceCss, /\.system-diagnostic-command-list\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-output-sheet-dock\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-output-sheet-log\s*\{/);
  assert.doesNotMatch(systemWorkspaceCss, /\.system-code-block\s*\{/);
});

test('system shell does not retain disconnected helper components', () => {
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/SystemOverviewPanel.vue')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/SystemSectionRail.vue')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/system-stage-selectors.ts')),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/system-overview-recipe.ts')),
    false,
  );
});
