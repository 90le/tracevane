import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);
const heartbeatConfig = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/shared/heartbeat-config.ts'),
  'utf8',
);
const viteConfig = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/vite.config.ts'),
  'utf8',
);

test('config editor exposes the workbench recipe framing blocks', () => {
  assert.match(configEditorPage, /class="page-shell config-page-shell"/);
  assert.match(configEditorPage, /class="config-overview-ribbon"/);
  assert.match(configEditorPage, /class="config-sidebar-callout"/);
  assert.match(configEditorPage, /class="config-active-tab-facts"/);
  assert.match(configEditorPage, /Image generation model/);
  assert.match(configEditorPage, /Model registry JSON/);
  assert.doesNotMatch(configEditorPage, /LLM idle timeout seconds/);
  assert.match(configEditorPage, /Embedded Pi project settings policy/);
});

test('config editor derives overview and active-tab fact collections in computed state', () => {
  assert.match(configEditorPage, /const configOverviewSignals = computed\(/);
  assert.match(configEditorPage, /const configSidebarSummary = computed\(/);
  assert.match(configEditorPage, /const activeTabFacts = computed\(/);
});

test('config editor owns scoped page styling for workbench framing', () => {
  assert.match(configEditorPage, /<style scoped>/);
  assert.match(configEditorPage, /\.config-overview-ribbon\s*\{/);
  assert.match(configEditorPage, /\.config-sidebar-callout\s*\{/);
  assert.match(configEditorPage, /\.config-active-tab-facts\s*\{/);
});

test('config workbench uses restrained neutral framing instead of accent-heavy gradients', () => {
  assert.doesNotMatch(configEditorPage, /\.config-sidebar-callout\s*\{[\s\S]*255,\s*190,\s*122/);
  assert.doesNotMatch(configEditorPage, /\.config-page-shell :deep\(\.config-sheet\)\s*\{[\s\S]*111,\s*211,\s*255/);
});

test('config workbench exposes the advanced sheet entrypoint instead of keeping it inline', () => {
  assert.match(configEditorPage, /class="config-advanced-entry"/);
  assert.match(configEditorPage, /@click="openAdvancedSheet"/);
  assert.match(configEditorPage, /@click="openGlobalConfig"/);
  assert.match(configEditorPage, /setActiveTab\(tab\.id\)/);
  assert.match(configEditorPage, /function setActiveTab\(nextTab: ConfigTabId\)/);
});

test('config workbench makes global configuration discoverable', () => {
  assert.match(configEditorPage, /id="global-config"/);
  assert.match(configEditorPage, /全局配置与 Agent 默认值|Global Config & Agent Defaults/);
  assert.match(configEditorPage, /全局运行默认值|Global runtime defaults/);
  assert.match(configEditorPage, /agents\.defaults/);
  assert.match(configEditorPage, /function openGlobalConfig\(\): void/);
});

test('config workbench keeps preferences out of system config navigation', () => {
  assert.match(configEditorPage, /const groupedTabs = computed<ConfigTabGroup\[\]>/);
  assert.match(configEditorPage, /class="config-tabs config-tabs-grouped"/);
  assert.match(configEditorPage, /Skills management for install, remove, migration, and sync workflows/);
  assert.doesNotMatch(configEditorPage, /activeTab === 'appearance'/);
  assert.doesNotMatch(configEditorPage, /界面主题/);
});

test('config workbench persists active tab across save and reload', () => {
  assert.match(configEditorPage, /CONFIG_ACTIVE_TAB_STORAGE_KEY/);
  assert.match(configEditorPage, /function resolveInitialConfigTab\(\): ConfigTabId/);
  assert.match(configEditorPage, /void router\.replace\(\{ path: route\.path, query \}\)/);
  assert.match(configEditorPage, /const tabBeforeSave = activeTab\.value/);
  assert.match(configEditorPage, /const scrollBeforeSave = getRouteScrollTop\(\)/);
  assert.match(configEditorPage, /setRouteScrollTop\(scrollBeforeSave\)/);
});

test('config save is ajax-style and does not rehydrate the visible draft', () => {
  const saveChangesBlock = configEditorPage.match(/async function saveChanges\(\)[\s\S]*?\n}\n\nfunction addFallback/)?.[0] || '';
  assert.match(configEditorPage, /function mergeConfigSummaryInPlace\(nextSummary: ConfigSummaryPayload\): void/);
  assert.match(configEditorPage, /function acceptSavedConfigSummary\(nextSummary: ConfigSummaryPayload\): void/);
  assert.match(saveChangesBlock, /const response = await saveConfig\(payload\)/);
  assert.match(saveChangesBlock, /acceptSavedConfigSummary\(response\.config\)/);
  assert.doesNotMatch(saveChangesBlock, /hydrateForm\(response\.config\)/);
  assert.doesNotMatch(saveChangesBlock, /loadedSummary\.value = response\.config/);
  assert.doesNotMatch(saveChangesBlock, /gatewayFormData\.value = null/);
});

test('dev config watcher does not force a full page reload after ajax saves', () => {
  assert.match(viteConfig, /syncStudioDevConfig\('openclaw\.json changed'\)/);
  assert.doesNotMatch(viteConfig, /full-reload/);
});

test('config workbench exposes current MCP and skills config fields', () => {
  assert.match(configEditorPage, /activeTab === 'mcp-skills'/);
  assert.match(configEditorPage, /MCP Servers JSON/);
  assert.match(configEditorPage, /Skill Entries JSON/);
  assert.match(configEditorPage, /mcpSessionIdleTtlMs/);
  assert.match(configEditorPage, /skillsMaxPromptChars/);
  assert.match(configEditorPage, /skillsAllowBundledText/);
  assert.match(configEditorPage, /skillsWatchDebounceMs/);
});

test('config workbench exposes persistent global HEARTBEAT controls', () => {
  assert.match(configEditorPage, /Built-in HEARTBEAT/);
  assert.match(configEditorPage, /agents\.defaults\.heartbeat\.every/);
  assert.match(configEditorPage, /form\.defaults\.heartbeatMode/);
  assert.match(configEditorPage, /buildHeartbeatConfig\(heartbeatRaw, form\.defaults\.heartbeatMode, form\.defaults\.heartbeatEvery\)/);
  assert.match(configEditorPage, /every: "0m"/);
  assert.match(heartbeatConfig, /next\.every = '0m'/);
  assert.doesNotMatch(heartbeatConfig, /next\.every = ''/);
});

test('config workbench tracks unsaved domains and protects refresh', () => {
  assert.match(configEditorPage, /class="config-save-dock"/);
  assert.match(configEditorPage, /width: min\(780px, calc\(100% - 8px\)\)/);
  assert.match(configEditorPage, /grid-template-areas:\s*"status actions"\s*"changes actions"/);
  assert.match(configEditorPage, /var\(--modal-panel-bg\)/);
  assert.match(configEditorPage, /const dirtyDomains = computed<ConfigDirtyDomain\[\]>/);
  assert.match(configEditorPage, /function captureConfigBaseline\(\): void/);
  assert.match(configEditorPage, /function normalizeLoggingDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /function normalizeBrowserDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /async function refreshConfigWithDirtyCheck\(\): Promise<void>/);
  assert.match(configEditorPage, /window\.confirm\(text\(/);
  assert.match(configEditorPage, /aria-live="polite"/);
});
