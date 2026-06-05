import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testDir, '../..');

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

const systemControlPage = read('apps/web-vue/src/features/system/SystemControlPage.vue');
const systemRecoveryPage = read('apps/web-vue/src/features/system/SystemRecoveryPage.vue');
const systemActionHandoffPanel = read('apps/web-vue/src/features/system/SystemActionHandoffPanel.vue');
const systemWorkspaceCss = read('apps/web-vue/src/features/system/system-workspace.css');
const routeManifest = read('apps/web-vue/src/features/shell/route-manifest.ts');
const systemApi = read('apps/web-vue/src/features/system/api.ts');

test('system overview stays lightweight and routes recovery work elsewhere', () => {
  assert.match(systemControlPage, /class="system-control-grid"/);
  assert.match(systemControlPage, /class="system-health-strip system-control-tower-rail"/);
  assert.match(systemControlPage, /class="system-action-list"/);
  assert.match(systemControlPage, /router\.push\('\/system\/recovery'\)/);
  assert.match(systemControlPage, /router\.push\('\/terminal'\)/);
  assert.match(systemControlPage, /router\.push\('\/config'\)/);
  assert.doesNotMatch(systemControlPage, /router\.push\('\/system\/events'\)/);
  assert.match(systemControlPage, /fetchSystemHealth/);
  assert.match(systemControlPage, /fetchOpenClawRecoveryStatus/);
  assert.doesNotMatch(systemControlPage, /fetchStudioRelease/);
  assert.match(systemControlPage, /fetchStudioUpgradeStatus/);
  assert.doesNotMatch(systemControlPage, /fetchSystemDiagnostics|normalizeDiagnostics|diagnosticCommandItems/);
  assert.doesNotMatch(systemControlPage, /openclaw doctor|openclaw status --json|openclaw gateway status --json/);
  assert.doesNotMatch(systemControlPage, /SystemTaskId|taskNavItems|activeTaskId|diagnosticOutputOpen/);
});

test('recovery page owns daemon controls, events, and backups', () => {
  assert.match(systemRecoveryPage, /OpenClaw 自愈/);
  assert.match(systemRecoveryPage, /applyOpenClawRecoveryDaemonServiceAction/);
  assert.match(systemRecoveryPage, /fetchOpenClawRecoveryStatus/);
  assert.match(systemRecoveryPage, /fetchOpenClawRecoveryEventsPage/);
  assert.match(systemRecoveryPage, /fetchOpenClawRecoveryBackupsPage/);
  assert.match(systemRecoveryPage, /eventsPagination/);
  assert.match(systemRecoveryPage, /backupsPagination/);
  assert.match(systemRecoveryPage, /changeEventsPage/);
  assert.match(systemRecoveryPage, /changeBackupsPage/);
  assert.match(systemRecoveryPage, /runOpenClawRecovery/);
  assert.match(systemRecoveryPage, /restoreOpenClawRecoveryBackup/);
  assert.match(systemRecoveryPage, /servicePrimaryAction/);
  assert.match(systemRecoveryPage, /servicePrimaryLabel/);
  assert.match(systemRecoveryPage, /return 'install'/);
  assert.match(systemRecoveryPage, /return 'start'/);
  assert.match(systemRecoveryPage, /return 'restart'/);
  assert.match(systemRecoveryPage, /applyServiceAction\('stop'\)/);
  assert.match(systemRecoveryPage, /await refreshAll\(\);\s*recovery\.value = normalizeRecovery\(\{\s*\.\.\.recovery\.value,\s*service: response\.service,/);
  assert.match(systemRecoveryPage, /CLI 自动修复/);
  assert.match(systemRecoveryPage, /allowCliReinstall/);
  assert.match(systemRecoveryPage, /Repair History/);
  assert.match(systemRecoveryPage, /Config Backups/);
  assert.match(systemRecoveryPage, /runManualProbe/);
  assert.match(systemRecoveryPage, /runManualRecovery/);
  assert.doesNotMatch(systemRecoveryPage, /fetchSystemDiagnostics|loadDeepDiagnostics/);
});

test('system feature CSS keeps the shared workbench styling local', () => {
  assert.match(systemControlPage, /import '\.\/system-workspace\.css';/);
  assert.match(systemRecoveryPage, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemControlPage, /<style scoped>/);
  assert.doesNotMatch(systemRecoveryPage, /<style scoped>/);
  assert.match(systemWorkspaceCss, /\.system-action-list\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-action-row\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-control-grid\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(systemWorkspaceCss, /\.system-sidebar-panel\s*\{[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.match(systemWorkspaceCss, /\.system-overview-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit, minmax\(220px, 1fr\)\);/);
  assert.match(systemWorkspaceCss, /\.system-pagination\s*\{/);
  assert.doesNotMatch(systemWorkspaceCss, /system-control-tower-surface::before|radial-gradient|linear-gradient|backdrop-filter:\s*blur/);
  assert.doesNotMatch(systemWorkspaceCss, /system-command-list|system-command-row|system-overview-command-panel/);
});

test('system routes and api expose overview, recovery, and event history separately', () => {
  assert.match(routeManifest, /import\("\.\.\/system\/SystemRecoveryPage\.vue"\)/);
  assert.match(routeManifest, /path:\s*"\/system\/recovery"/);
  assert.match(routeManifest, /path:\s*"\/system\/events"/);
  assert.match(routeManifest, /path:\s*"\/system"/);
  assert.match(systemApi, /fetchOpenClawRecoveryStatus/);
  assert.match(systemApi, /fetchOpenClawRecoveryEvents/);
  assert.match(systemApi, /fetchOpenClawRecoveryBackups/);
  assert.match(systemApi, /fetchOpenClawRecoveryEventsPage/);
  assert.match(systemApi, /fetchOpenClawRecoveryBackupsPage/);
  assert.match(systemApi, /applyOpenClawRecoveryDaemonServiceAction/);
  assert.doesNotMatch(systemApi, /fetchSystemRecoveryStatus/);
});

test('system action handoff panel keeps styles in the system feature stylesheet', () => {
  assert.match(systemActionHandoffPanel, /import '\.\/system-workspace\.css';/);
  assert.doesNotMatch(systemActionHandoffPanel, /<style scoped>/);
  assert.match(systemWorkspaceCss, /\.system-handoff-panel\s*\{/);
  assert.match(systemWorkspaceCss, /\.system-handoff-route\s*\{/);
});

test('system shell does not retain disconnected helper components', () => {
  assert.equal(fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/SystemOverviewPanel.vue')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/SystemSectionRail.vue')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/system-stage-selectors.ts')), false);
  assert.equal(fs.existsSync(path.join(rootDir, 'apps/web-vue/src/features/system/system-overview-recipe.ts')), false);
});
