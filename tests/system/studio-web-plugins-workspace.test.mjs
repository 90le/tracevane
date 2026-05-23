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
const pluginsApi = read("apps/web-vue/src/features/plugins/api.ts");
const routeManifest = read("apps/web-vue/src/features/shell/route-manifest.ts");
const skillsControlPage = read("apps/web-vue/src/features/skills/SkillsControlPage.vue");
const studioPluginManifest = JSON.parse(read("openclaw.plugin.json"));

test("plugins route and view are wired as a dedicated management surface", () => {
  assert.match(routeManifest, /const PluginsView = \(\) => import\("\.\.\/\.\.\/views\/PluginsView\.vue"\)/);
  assert.match(routeManifest, /path:\s*"\/plugins"/);
  assert.match(routeManifest, /key:\s*"plugins"/);
  assert.match(pluginsView, /PluginsControlPage/);
  assert.match(pluginsView, /getManagementDomainEntry\('plugins'\)/);
});

test("plugins page owns plugin policy, slots, entries, installs, and diagnostics", () => {
  assert.match(pluginsControlPage, /Plugin Control Center|插件控制中心/);
  assert.match(pluginsControlPage, /pageTabs/);
  assert.match(pluginsControlPage, /Capability index|能力索引/);
  assert.match(pluginsControlPage, /plugins-overview-command/);
  assert.match(pluginsControlPage, /plugins-summary-list/);
  assert.match(pluginsControlPage, /plugins-critical-row/);
  assert.doesNotMatch(pluginsControlPage, /class="plugins-posture-strip plugins-stage-card--wide"/);
  assert.doesNotMatch(pluginsControlPage, /class="plugins-side-pane plugins-stage-card"/);
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
  assert.match(pluginsControlPage, /plugins-preflight-card/);
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
