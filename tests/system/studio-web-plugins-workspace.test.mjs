import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const pluginsView = read("apps/web-vue/src/views/PluginsView.vue");
const pluginsControlPage = read("apps/web-vue/src/features/plugins/PluginsControlPage.vue");
const pluginsWorkspaceCss = read("apps/web-vue/src/features/plugins/plugins-workspace.css");
const globalStyleCss = read("apps/web-vue/src/style.css");
const pluginsApi = read("apps/web-vue/src/features/plugins/api.ts");
const routeManifest = read("apps/web-vue/src/features/shell/route-manifest.ts");
const skillsControlPage = read("apps/web-vue/src/features/skills/SkillsControlPage.vue");
const studioPluginManifest = JSON.parse(read("openclaw.plugin.json"));

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = pluginsWorkspaceCss.match(new RegExp(`${escaped}\\s*\\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `Missing CSS block: ${selector}`);
  return match[0];
}

test("plugins route and view are wired as a dedicated management surface", () => {
  assert.match(routeManifest, /const PluginsView = \(\) => import\("\.\.\/\.\.\/views\/PluginsView\.vue"\)/);
  assert.match(routeManifest, /path:\s*"\/plugins"/);
  assert.match(routeManifest, /key:\s*"plugins"/);
  assert.match(pluginsView, /PluginsControlPage/);
  assert.match(pluginsView, /getManagementDomainEntry\('plugins'\)/);
});

test("plugins page owns plugin policy, slots, entries, installs, and diagnostics", () => {
  assert.match(pluginsControlPage, /Plugin Control Center|插件控制中心/);
  assert.match(pluginsControlPage, /import '\.\/plugins-workspace\.css';/);
  assert.doesNotMatch(pluginsControlPage, /<style scoped>/);
  assert.match(pluginsWorkspaceCss, /Migrated Plugins workspace rules from global style\.css/);
  assert.doesNotMatch(globalStyleCss, /\.plugins[a-zA-Z0-9_-]*/);
  assert.match(pluginsControlPage, /pageTabs/);
  assert.match(pluginsControlPage, /Capability index|能力索引/);
  assert.match(pluginsControlPage, /plugins-workspace-strip/);
  assert.match(pluginsControlPage, /plugins-overview-command/);
  assert.match(pluginsControlPage, /plugins-summary-list/);
  assert.match(pluginsControlPage, /plugins-critical-row/);
  assert.match(pluginsControlPage, /import StatusPill from '..\/..\/components\/StatusPill\.vue';/);
  assert.match(pluginsControlPage, /pluginStatusTone/);
  assert.doesNotMatch(pluginsControlPage, /plugins-status-pill/);
  assert.doesNotMatch(pluginsWorkspaceCss, /plugins-status-pill/);
  assert.doesNotMatch(pluginsControlPage, /class="plugins-posture-strip plugins-stage-card--wide"/);
  assert.doesNotMatch(pluginsControlPage, /class="plugins-side-pane plugins-stage-card"/);
  assert.doesNotMatch(pluginsControlPage, /plugins-stage-card|plugins-hero-metrics|plugins-summary-card|plugins-preflight-card/);
  assert.doesNotMatch(pluginsControlPage, /class="plugins-critical-card"/);
  assert.match(pluginsControlPage, /Plugin controls|插件控制/);
  assert.match(pluginsControlPage, /Quick activate|快速接管/);
  assert.match(pluginsControlPage, /adoptDiscoveredPlugin/);
  assert.match(pluginsControlPage, /applyPluginToggle/);
  assert.match(pluginsControlPage, /基础表单|Guided form/);
  assert.match(pluginsControlPage, /高级 JSON|Advanced JSON/);
  assert.match(pluginsControlPage, /显示高级字段|Show advanced/);
  assert.match(pluginsControlPage, /selectedPluginSchemaFields/);
  assert.match(pluginsControlPage, /selectedPluginSchemaGroupsForDisplay/);
  assert.match(pluginsControlPage, /plugins-guided-summary/);
  assert.match(pluginsControlPage, /plugins-array-editor/);
  assert.match(pluginsControlPage, /placeholder/);
  assert.match(pluginsControlPage, /groupLabel|groupOrder/);
  assert.match(pluginsControlPage, /toggleGuidedGroup/);
  assert.match(pluginsControlPage, /restoreGuidedGroupDefaults/);
  assert.match(pluginsControlPage, /revertGuidedGroupEdits/);
  assert.match(pluginsControlPage, /applyGuidedFieldDefault/);
  assert.match(pluginsControlPage, /clearGuidedField/);
  assert.match(pluginsControlPage, /revertGuidedField/);
  assert.match(pluginsControlPage, /pluginStatusFilter/);
  assert.match(pluginsControlPage, /pluginSortMode/);
  assert.match(pluginsControlPage, /pluginCapabilityFilter/);
  assert.match(pluginsControlPage, /pluginSourceFilter/);
  assert.match(pluginsControlPage, /pluginCriticalFilter/);
  assert.match(pluginsControlPage, /installSearch/);
  assert.match(pluginsControlPage, /installSourceFilter/);
  assert.match(pluginsControlPage, /uploadDataBase64/);
  assert.match(pluginsControlPage, /preflightUploadedArchive/);
  assert.match(pluginsControlPage, /installUploadedArchiveFile/);
  assert.match(pluginsControlPage, /persistPluginsUiState/);
  assert.match(pluginsControlPage, /PLUGINS_UI_STATE_STORAGE_KEY/);
  assert.match(pluginsControlPage, /runBulkPluginToggle/);
  assert.match(pluginsControlPage, /runBulkInstallRecordAction/);
  assert.match(pluginsControlPage, /bulkSelectedPluginIds/);
  assert.match(pluginsControlPage, /selectedInstallIds/);
  assert.match(pluginsControlPage, /pluginPolicyDirty/);
  assert.match(pluginsControlPage, /plugins-guided-toolbar/);
  assert.match(pluginsControlPage, /plugins-filter-grid/);
  assert.match(pluginsControlPage, /plugins-bulk-toolbar/);
  assert.match(pluginsControlPage, /plugins-install-row/);
  assert.match(pluginsControlPage, /立即禁用|Disable now/);
  assert.match(pluginsControlPage, /plugins-impact-list/);
  assert.match(pluginsControlPage, /运行时加载策略|Runtime load policy/);
  assert.match(pluginsControlPage, /独占插槽|Exclusive slots/);
  assert.match(pluginsControlPage, /selectedPluginId/);
  assert.match(pluginsControlPage, /diagnostics/);
  assert.match(pluginsControlPage, /安装记录|Install records/);
  assert.match(pluginsControlPage, /criticalPluginIds/);
  assert.match(pluginsControlPage, /预检结论|Preflight verdict/);
  assert.match(pluginsControlPage, /installBlockedByPreflight/);
  assert.match(pluginsWorkspaceCss, /\.plugins-overview-command/);
  assert.match(pluginsWorkspaceCss, /\.plugins-summary-list/);
  assert.match(pluginsWorkspaceCss, /\.plugins-critical-row/);
  assert.doesNotMatch(
    pluginsControlPage,
    /toggle-card|criticalPluginCards|policySnapshotCards/,
  );
  assert.doesNotMatch(
    pluginsWorkspaceCss,
    /toggle-card|var\(--surface\)|var\(--sky\)|var\(--atlas-|var\(--atlas|--glass|linear-gradient|radial-gradient|rgba\(79,\s*132,\s*248|rgba\(77,\s*129,\s*247|rgba\(37,\s*99,\s*235/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-workspace-strip\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*none;/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-workspace-copy\s*\{[\s\S]*border-left:\s*3px solid var\(--acc\);/,
  );
  assert.doesNotMatch(pluginsControlPage, /plugins-command-center|plugins-runtime-matrix/);
  assert.doesNotMatch(pluginsWorkspaceCss, /\.plugins-command-center|\.plugins-runtime-matrix/);
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-layout\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-rail\s*\{[\s\S]*background:\s*var\(--surface-raised\);/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-tab\s*\{[\s\S]*background:\s*var\(--button-secondary-bg\);/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-diagnostic\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--modal-row-bg\);/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-preflight-panel\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--modal-row-bg\);/,
  );
  assert.match(pluginsWorkspaceCss, /\.plugins-install-entry\s*\{[\s\S]*border:\s*1px solid var\(--control-border\);[\s\S]*background:\s*var\(--control-bg\);/);
  assert.match(pluginsWorkspaceCss, /\.plugins-diagnostic\.is-danger\s*\{[\s\S]*border-color:\s*var\(--status-pill-danger-border\);/);
  assert.match(pluginsWorkspaceCss, /\.plugins-diagnostic\.is-warn\s*\{[\s\S]*border-color:\s*var\(--status-pill-accent-border\);/);
  assert.match(pluginsWorkspaceCss, /\.plugins-preflight-panel\.is-danger\s*\{[\s\S]*border-color:\s*var\(--status-pill-danger-border\);/);
  assert.match(pluginsWorkspaceCss, /\.plugins-preflight-panel\.is-warn\s*\{[\s\S]*border-color:\s*var\(--status-pill-accent-border\);/);
  [
    ".plugins-diagnostic",
    ".plugins-diagnostic p",
    ".plugins-diagnostic.is-danger",
    ".plugins-diagnostic.is-warn",
    ".plugins-install-entry",
    ".plugins-install-entry.active",
    ".plugins-preflight-panel",
    ".plugins-preflight-panel p",
    ".plugins-preflight-panel.is-danger",
    ".plugins-preflight-panel.is-warn",
  ].forEach((selector) => {
    assert.doesNotMatch(cssBlock(selector), /var\(--(?:surface(?:-[a-z-]+)?|line(?:-[a-z-]+)?|peach|danger|muted)\b/);
  });
  assert.match(pluginsControlPage, /plugins-runtime-strip/);
  assert.match(pluginsControlPage, /plugins-policy-matrix/);
  assert.match(pluginsControlPage, /plugins-preflight-panel/);
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-policy-matrix,\s*\n\.plugins-facts-grid,\s*\n\.plugins-capability-grid\s*\{[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    pluginsWorkspaceCss,
    /\.plugins-policy-cell,\s*\n\.plugins-fact,\s*\n\.plugins-summary-cell,\s*\n\.plugins-capability-grid span\s*\{[\s\S]*border:\s*0;[\s\S]*border-radius:\s*0;[\s\S]*background:\s*transparent;[\s\S]*inset -1px 0 0/,
  );
  assert.match(pluginsApi, /fetchPluginsSummary/);
  assert.match(pluginsApi, /\/api\/plugins\/summary/);
  assert.match(pluginsApi, /togglePluginEntry/);
  assert.match(pluginsApi, /bulkTogglePluginEntries/);
  assert.match(pluginsApi, /\/api\/plugins\/bulk-toggle/);
  assert.match(pluginsApi, /preflightPlugin/);
  assert.match(pluginsApi, /preflightUploadedPluginArchive/);
  assert.match(pluginsApi, /\/api\/plugins\/upload\/preflight/);
  assert.match(pluginsApi, /installPlugin/);
  assert.match(pluginsApi, /installUploadedPluginArchive/);
  assert.match(pluginsApi, /\/api\/plugins\/upload\/install/);
  assert.match(pluginsApi, /updatePlugins/);
  assert.match(pluginsApi, /bulkUpdatePluginInstalls/);
  assert.match(pluginsApi, /\/api\/plugins\/bulk-update/);
  assert.match(pluginsApi, /uninstallPlugin/);
  assert.match(pluginsApi, /bulkUninstallPluginInstalls/);
  assert.match(pluginsApi, /\/api\/plugins\/bulk-uninstall/);
  assert.match(pluginsApi, /savePluginsConfig/);
  assert.match(pluginsControlPage, /Run preflight|安装前预检/);
});

test("studio plugin manifest exposes uiHints for grouped plugin config rendering", () => {
  assert.equal(studioPluginManifest.id, "studio");
  assert.equal(studioPluginManifest.configSchema.properties.chat.properties.allowHostManagementExecInStudioChat.type, "boolean");
  assert.equal(studioPluginManifest.uiHints.apiPort.label, "API 端口");
  assert.equal(studioPluginManifest.configSchema.properties.transport.properties.preferredMode.default, "standalone");
  assert.equal(studioPluginManifest.uiHints["transport.preferredMode"].placeholder, "standalone");
  assert.equal(studioPluginManifest.uiHints["transport.gateway.basePath"].placeholder, "/studio");
  assert.equal(studioPluginManifest.uiHints["chat.allowHostManagementExecInStudioChat"].advanced, true);
  assert.equal(studioPluginManifest.uiHints["transport.gateway.enabled"].groupLabel, "Gateway");
});

test("skills page no longer exposes plugin management as a top-level mode", () => {
  assert.doesNotMatch(skillsControlPage, /mode === 'plugins'/);
  assert.doesNotMatch(skillsControlPage, /pluginForm/);
  assert.doesNotMatch(skillsControlPage, /插件管理', 'Plugin Settings'/);
});
