import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);

test('config editor exposes the workbench recipe framing blocks', () => {
  assert.match(configEditorPage, /class="page-shell config-page-shell"/);
  assert.match(configEditorPage, /class="config-overview-ribbon"/);
  assert.match(configEditorPage, /class="config-sidebar-callout"/);
  assert.match(configEditorPage, /class="config-active-tab-facts"/);
  assert.match(configEditorPage, /Image generation model/);
  assert.match(configEditorPage, /Model registry JSON/);
  assert.match(configEditorPage, /LLM idle timeout seconds/);
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
  assert.match(configEditorPage, /setActiveTab\(tab\.id\)/);
  assert.match(configEditorPage, /function setActiveTab\(nextTab: ConfigTabId\)/);
});

test('config workbench aligns tabs with official OpenClaw config references', () => {
  assert.match(configEditorPage, /class="config-official-reference"/);
  assert.match(configEditorPage, /OpenClaw v2026\.4\.24/);
  assert.match(configEditorPage, /const officialConfigReference = computed<OfficialConfigReference>/);
  assert.match(configEditorPage, /agents\.defaults\.\*/);
  assert.match(configEditorPage, /browser\.\*/);
});

test('config workbench tracks unsaved domains and protects refresh', () => {
  assert.match(configEditorPage, /class="config-save-dock"/);
  assert.match(configEditorPage, /const dirtyDomains = computed<ConfigDirtyDomain\[\]>/);
  assert.match(configEditorPage, /function captureConfigBaseline\(\): void/);
  assert.match(configEditorPage, /function normalizeLoggingDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /function normalizeBrowserDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /async function refreshConfigWithDirtyCheck\(\): Promise<void>/);
  assert.match(configEditorPage, /window\.confirm\(text\(/);
  assert.match(configEditorPage, /aria-live="polite"/);
});
