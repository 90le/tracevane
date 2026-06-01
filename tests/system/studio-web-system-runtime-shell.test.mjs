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
const styleCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/style.css'),
  'utf8',
);

test('system control page keeps a diagnostics summary rail and focused workspace stage', () => {
  assert.match(systemControlPage, /class="system-control-grid"/);
  assert.match(systemControlPage, /class="system-health-strip system-control-tower-rail"/);
  assert.match(systemControlPage, /class="system-sidebar-panel"/);
  assert.match(systemControlPage, /class="system-action-list"/);
  assert.match(systemControlPage, /class="system-action-row"/);
  assert.doesNotMatch(systemControlPage, /system-command-list|system-command-row|system-overview-command-panel/);
  assert.doesNotMatch(systemControlPage, /class="system-quick-links"/);
  assert.match(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(systemControlPage, /router\.push\('\/terminal'\)/);
  assert.match(systemControlPage, /router\.push\('\/cron'\)/);
  assert.match(systemControlPage, /class="system-main-stage"/);
  assert.match(systemControlPage, /class="system-topic-rail"/);
  assert.match(systemControlPage, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemControlPage, /<style scoped>/);
  assert.match(systemWorkspaceCss, /\.system-action-list\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-action-row\s*\{/);
  assert.doesNotMatch(systemWorkspaceCss, /system-command-list|system-command-row|system-overview-command-panel/);
  assert.match(systemWorkspaceCss, /\.system-control-grid\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(systemWorkspaceCss, /\.system-sidebar-panel\s*\{[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.doesNotMatch(systemWorkspaceCss, /system-control-tower-surface::before|radial-gradient|linear-gradient|backdrop-filter:\s*blur/);
  assert.match(
    systemWorkspaceCss,
    /\.system-chip\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--surface-raised\) 86%, var\(--accent-primary\) 6%\);/,
  );
  assert.match(systemWorkspaceCss, /\.system-overview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(220px, 1fr\)\);[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(systemWorkspaceCss, /\.system-overview-grid \.system-overview-item\s*\{[\s\S]*background:\s*transparent;[\s\S]*box-shadow:[\s\S]*inset -1px 0 0 var\(--line\),[\s\S]*inset 0 -1px 0 var\(--line\);/);
  assert.match(systemWorkspaceCss, /html\[data-theme="light"\] \.system-overview-grid\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(systemWorkspaceCss, /html\[data-theme="light"\] \.system-action-row:hover\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--accent-primary\) 9%, var\(--surface-raised\)\);/);
  assert.match(systemWorkspaceCss, /html\[data-theme="light"\] \.system-stage-nav-button\.active\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--accent-primary\) 16%, var\(--surface-raised\)\);/);
  assert.doesNotMatch(systemWorkspaceCss, /system-stage-tab|system-stage-tabs|mobile-stage-tabs/);
  assert.doesNotMatch(systemWorkspaceCss, /#f2fbf8|#dffbf5|#ffffff|#f9fafb|#e5e7eb|#e3fbf4/);
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
    /type SystemTaskId = 'overview' \| 'bootstrap' \| 'release' \| 'gateway' \| 'diagnostics'/,
  );
  assert.match(systemControlPage, /\{ id: 'bootstrap' as const, icon: Flag, label: text\('引导', 'Bootstrap'\) \}/);
  assert.match(systemControlPage, /\{ id: 'overview' as const, icon: Gauge, label: text\('概览', 'Overview'\) \}/);
  assert.match(systemControlPage, /\{ id: 'release' as const, icon: RefreshCw, label: text\('升级', 'Release'\) \}/);
  assert.match(systemControlPage, /\{ id: 'gateway' as const, icon: Network, label: text\('Gateway', 'Gateway'\) \}/);
  assert.match(systemControlPage, /\{ id: 'diagnostics' as const, icon: ClipboardList, label: text\('诊断输出', 'Diagnostics'\) \}/);
  assert.match(systemControlPage, /v-if="activeTaskId === 'overview'"/);
  assert.match(systemControlPage, /v-else-if="activeTaskId === 'release'"/);
  assert.match(systemControlPage, /v-else-if="activeTaskId === 'gateway'"/);
  assert.match(systemControlPage, /v-else-if="activeTaskId === 'bootstrap'"/);
  assert.match(systemControlPage, /taskNavItems/);
  assert.match(systemControlPage, /class="system-stage-nav mobile-task-nav"/);
  assert.doesNotMatch(systemControlPage, /SystemTab|activeTab|const tabs|tab\./);
  assert.doesNotMatch(systemControlPage, /system-stage-tabs|mobile-stage-tabs|诊断指挥台|Diagnostics Command|指挥台/);
  assert.match(systemControlPage, /text\('原始诊断输出', 'Raw Diagnostic Output'\)/);
  assert.doesNotMatch(systemControlPage, /'environment'/);
});

test('system control page opens raw diagnostic output in a floating sheet', () => {
  assert.match(systemControlPage, /openclaw gateway status --json/);
  assert.match(systemControlPage, /openclaw status --json/);
  assert.match(systemControlPage, /openclaw doctor/);
  assert.match(systemControlPage, /class="system-diagnostic-command-list"/);
  assert.match(systemControlPage, /<Teleport v-if="diagnosticOutputOpen" to="body">/);
  assert.match(systemControlPage, /class="floating-output-dock system-output-sheet-dock"/);
  assert.match(systemControlPage, /class="floating-output-sheet system-output-sheet"/);
  assert.match(systemControlPage, /class="floating-output-sheet__head system-output-sheet-head"/);
  assert.match(systemControlPage, /class="floating-output-sheet__actions system-output-sheet-actions"/);
  assert.match(systemControlPage, /class="floating-output-sheet__log system-output-sheet-log"/);
  assert.match(systemControlPage, /function openDiagnosticOutput\(commandId: SystemDiagnosticCommandId\): void/);
  assert.match(systemControlPage, /copyTextToClipboard\(activeDiagnosticOutput\.value\)/);
  assert.doesNotMatch(systemControlPage, /class="system-code-block"/);
  assert.match(systemWorkspaceCss, /\.system-diagnostic-command-list\s*\{/);
  assert.match(styleCss, /\.floating-output-dock\s*\{[\s\S]*position:\s*fixed;[\s\S]*width:\s*min\(var\(--floating-output-width, 860px\), calc\(100vw - 32px\)\);/);
  assert.match(styleCss, /\.floating-output-sheet\s*\{[\s\S]*background:\s*var\(--modal-panel-bg\);[\s\S]*box-shadow:\s*var\(--modal-shadow\);[\s\S]*backdrop-filter:\s*none;/);
  assert.match(styleCss, /\.floating-output-sheet__log\s*\{[\s\S]*background:\s*var\(--code-bg\);/);
  assert.match(systemWorkspaceCss, /\.system-output-sheet-dock\s*\{[\s\S]*--floating-output-width:\s*860px;/);
  assert.match(systemWorkspaceCss, /\.system-output-sheet-log\s*\{[\s\S]*--floating-output-log-min-height:\s*280px;/);
  assert.doesNotMatch(systemWorkspaceCss, /\.system-code-block\s*\{/);
  assert.doesNotMatch(systemWorkspaceCss, /\.system-output-sheet\s*\{[\s\S]*background:/);
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
