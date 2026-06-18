import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = '/home/binbin/.openclaw/extensions/openclaw-studio';
const configEditorPage = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/ConfigEditorPage.vue'),
  'utf8',
);
const configWorkspaceCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/config-workspace.css'),
  'utf8',
);
const configWorkspaceSections = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/features/config/config-workspace-sections.ts'),
  'utf8',
);
const globalStyleCss = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/style.css'),
  'utf8',
);
const configComponentFiles = [
  'AcpConfigTab.vue',
  'BrowserConfigTab.vue',
  'ChannelsConfigTab.vue',
  'CommandsHooksConfigTab.vue',
  'ConfigDomainAdvancedSheet.vue',
  'GatewayConfigTab.vue',
  'LoggingConfigTab.vue',
  'PluginsConfigTab.vue',
  'SessionConfigTab.vue',
];
const configComponentSources = new Map(configComponentFiles.map((file) => [
  file,
  fs.readFileSync(path.join(rootDir, 'apps/web-vue/src/features/config', file), 'utf8'),
]));
const heartbeatConfig = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/src/shared/heartbeat-config.ts'),
  'utf8',
);
const viteConfig = fs.readFileSync(
  path.join(rootDir, 'apps/web-vue/vite.config.ts'),
  'utf8',
);

function cssRuleBlock(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\n\\}`))?.[0] || '';
}

function cssRuleBlocks(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...source.matchAll(new RegExp(`${escapedSelector}\\s*\\{[\\s\\S]*?\\n\\}`, 'g'))].map((match) => match[0]);
}

test('config editor exposes the workbench recipe framing blocks', () => {
  assert.match(configEditorPage, /class="page-shell config-page-shell"/);
  assert.match(configEditorPage, /class="config-workspace-strip"/);
  assert.match(configEditorPage, /class="config-signal-strip"/);
  assert.match(configEditorPage, /class="config-signal-row"/);
  assert.match(configEditorPage, /class="config-rail config-rail-grouped"/);
  assert.match(configEditorPage, /class="config-tab-stage config-section-grid/);
  assert.match(configEditorPage, /class="config-active-tab-matrix"/);
  assert.match(configEditorPage, /class="config-active-tab-row"/);
  assert.match(configEditorPage, /Image generation model/);
  assert.match(configEditorPage, /Model registry JSON/);
  assert.doesNotMatch(configEditorPage, /LLM idle timeout seconds/);
  assert.match(configEditorPage, /Embedded OpenClaw project settings policy/);
  assert.doesNotMatch(configEditorPage, /class="config-overview-cell"/);
  assert.doesNotMatch(configEditorPage, /class="config-sidebar-callout"/);
  assert.doesNotMatch(configEditorPage, /page-shell config-section-grid|class="config-tabs|class="config-tab-group"|class="config-tab"/);
});

test('config editor derives overview and active-tab fact collections in computed state', () => {
  assert.match(configEditorPage, /const configOverviewSignals = computed\(/);
  assert.match(configEditorPage, /const configSidebarSummary = computed\(/);
  assert.match(configEditorPage, /const activeTabFacts = computed\(/);
});

test('config editor owns feature CSS for workbench framing', () => {
  assert.match(configEditorPage, /import '\.\/config-workspace\.css';/);
  assert.doesNotMatch(configEditorPage, /<style scoped>/);
  assert.match(configWorkspaceCss, /Migrated Config workspace rules from global style\.css/);
  assert.match(configWorkspaceCss, /Migrated Config workbench internals from global style\.css/);
  assert.match(configWorkspaceCss, /\.config-workspace-strip\s*\{/);
  assert.match(configWorkspaceCss, /\.config-signal-strip\s*\{/);
  assert.match(configWorkspaceCss, /\.config-rail\s*\{/);
  assert.match(configWorkspaceCss, /\.config-rail-item\s*\{/);
  assert.match(configWorkspaceCss, /\.config-tab-stage\s*\{/);
  assert.match(configWorkspaceCss, /\.config-active-tab-matrix\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.provider-index-item\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.provider-model-row\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.fallback-row\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.browser-profile-entry\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.provider-entry\s*\{/);
  assert.doesNotMatch(
    configWorkspaceCss,
    /provider-card|browser-profile-card|config-overview-card|config-overview-cell|config-hero-card|config-hero-panel|config-spotlight-toggle-card|config-hero-grid|config-tabs-grouped|\.config-tabs|\.config-tab(?:\s|\{|:|\.|,)|--shell-(?:panel|stage|highlight)|var\(--surface\)|linear-gradient|radial-gradient|var\(--sky\)|--atlas|--glass|rgba\(77,\s*129,\s*247|rgba\(37,\s*99,\s*235/,
  );
  assert.doesNotMatch(globalStyleCss, /\.config[a-zA-Z0-9_-]*/);
  assert.doesNotMatch(globalStyleCss, /\.(?:provider-index|provider-model|provider-entry|provider-stack|fallback-|browser-profile|allowlist-preview|mini-stat|micro-badge|hero-copy)[a-zA-Z0-9_-]*/);
});

test('config tabs and sheets keep CSS ownership centralized', () => {
  for (const [file, source] of configComponentSources) {
    assert.match(source, /import '\.\/config-workspace\.css';/, `${file} imports shared config CSS`);
    assert.doesNotMatch(source, /<style scoped>/, `${file} does not keep local scoped CSS`);
    assert.doesNotMatch(source, /<[^>]*\sstyle\s*=/, `${file} does not keep inline layout styles`);
    if (file.endsWith('ConfigTab.vue')) {
      assert.match(source, /class="config-tab-stage config-section-grid/, `${file} uses the active-stage primitive`);
      assert.doesNotMatch(source, /page-shell config-section-grid/, `${file} does not nest a page shell inside Config stage`);
    }
  }
  assert.doesNotMatch(configWorkspaceCss, /:deep|:global/);
  assert.match(configWorkspaceCss, /\.acpx-actions\s*\{/);
  assert.match(configWorkspaceCss, /\.config-hook-no-extra\s*\{/);
  assert.match(configWorkspaceCss, /\.config-domain-advanced-sheet-mask\s*\{/);
  assert.match(configWorkspaceCss, /\.token-input-wrapper\s*\{/);
  assert.match(configWorkspaceCss, /\.config-reset-type-table\s*\{/);
  assert.match(configWorkspaceCss, /\.config-inline-form-grid\s*\{/);
  assert.match(
    configWorkspaceCss,
    /\.config-inline-form-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto;/,
  );
  assert.match(
    configWorkspaceCss,
    /\.config-inline-form-grid\s*\{[\s\S]*min-width:\s*0;/,
  );
  assert.match(configWorkspaceCss, /\.config-collapsible-title-row\s*\{/);
  assert.match(configWorkspaceCss, /\.config-secret-field-row\s*\{/);
  assert.match(configWorkspaceCss, /\.config-account-section\s*\{/);
});

test('config workbench uses restrained neutral framing instead of accent-heavy gradients', () => {
  assert.doesNotMatch(configWorkspaceCss, /\.config-workspace-strip\s*\{[\s\S]*255,\s*190,\s*122/);
  assert.doesNotMatch(configWorkspaceCss, /\.config-page-shell \.config-sheet\s*\{[\s\S]*111,\s*211,\s*255/);
  assert.doesNotMatch(
    configWorkspaceCss,
    /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient/,
    'config workspace surfaces must use shared tokens instead of raw color literals',
  );
  assert.match(configWorkspaceCss, /\.config-workspace-strip\s*\{[\s\S]*background:\s*var\(--line\);/);
  assert.doesNotMatch(configEditorPage, /config-command-panel|config-command-copy/);
  assert.doesNotMatch(configWorkspaceCss, /config-command-panel|config-command-copy/);
  assert.match(
    configWorkspaceCss,
    /\.config-page-shell \.config-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(260px, 300px\) minmax\(0, 1fr\);/,
  );
  assert.match(configWorkspaceCss, /--config-row-bg:\s*color-mix\(in srgb, var\(--surface-raised\) 76%, var\(--surface-base\)\);/);
  assert.match(configWorkspaceCss, /--config-accent-border:\s*color-mix\(in srgb, var\(--acc\) 34%, var\(--border-subtle\)\);/);
  assert.match(configWorkspaceCss, /\.config-sidebar\s*\{[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.match(configWorkspaceCss, /\.config-active-tab-panel\s*\{[\s\S]*backdrop-filter:\s*none;/);
  assert.match(configWorkspaceCss, /\.config-active-tab-matrix\s*\{[\s\S]*gap:\s*1px;[\s\S]*background:\s*var\(--line\);/);
  assert.match(configWorkspaceCss, /\.config-active-tab-row\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.config-sheet\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
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
  assert.match(configEditorPage, /class="config-rail config-rail-grouped"/);
  assert.match(configEditorPage, /Skills management for install, remove, migration, and sync workflows/);
  assert.doesNotMatch(configEditorPage, /activeTab === 'appearance'/);
  assert.doesNotMatch(configEditorPage, /界面主题/);
  assert.doesNotMatch(configWorkspaceCss, /config-preference-|config-section-grid-appearance/);
  assert.doesNotMatch(configWorkspaceCss, /fallback-section|fallback-header/);
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

test('config workbench exposes current command and exec gates', () => {
  const commandsHooksTab = configComponentSources.get('CommandsHooksConfigTab.vue') || '';
  assert.match(commandsHooksTab, /commands\.bash/);
  assert.match(commandsHooksTab, /enables `!` and `\/bash`/);
  assert.match(configEditorPage, /const execHostOptions = computed<ChoiceOption\[\]>\(\(\) => \[/);
  assert.match(configEditorPage, /\{ value: 'auto', label: text\('自动', 'Auto'\) \}/);
  assert.match(configEditorPage, /const execModeOptions = computed<ChoiceOption\[\]>/);
  assert.match(configEditorPage, /form\.tools\.execMode/);
  assert.match(configEditorPage, /function enableTemporaryBashBypass\(\)/);
  assert.match(configEditorPage, /commandsFormData\.value = \{[\s\S]*text: true,[\s\S]*bash: true,/);
  assert.match(configEditorPage, /form\.tools\.execMode = 'full'/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.config-high-risk-box\s*\{/);
  assert.match(configWorkspaceCss, /\.config-page-shell \.danger-button\s*\{/);
});

test('config workbench exposes schema-backed OpenClaw top-level domains', () => {
  assert.match(configWorkspaceSections, /"openclaw-domains"/);
  assert.match(configWorkspaceSections, /OpenClaw Domains/);
  assert.match(configWorkspaceSections, /Low-frequency schema domains not modeled by dedicated Tracevane tabs/);
  assert.match(configWorkspaceSections, /未单独建模的低频 schema 顶层域/);
  assert.match(configEditorPage, /ids: \['logging', 'openclaw-domains'\]/);
  assert.match(configEditorPage, /case 'openclaw-domains'/);
  assert.match(configEditorPage, /OpenClaw Top-Level Domains/);
  assert.match(configEditorPage, /OpenClaw Domains JSON/);
  assert.match(configEditorPage, /form\.openclaw\.extraDomainsJson/);
  assert.match(configEditorPage, /summary\.openclaw\?\.extraDomains/);
  assert.match(configEditorPage, /parseOptionalJsonObject\('OpenClaw Domains JSON', form\.openclaw\.extraDomainsJson\)/);
  assert.match(configEditorPage, /openclaw:\s*\{\s*extraDomains: openclawExtraDomains/);
  assert.match(configEditorPage, /loadedSummary\?\.openclaw\?\.extraDomainKeys \|\| \[\]/);
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
  const saveDockBlocks = cssRuleBlocks(configWorkspaceCss, '.config-save-dock');
  assert.match(configEditorPage, /class="config-save-dock"/);
  assert.match(configWorkspaceCss, /width: min\(780px, calc\(100% - 8px\)\)/);
  assert.match(configWorkspaceCss, /grid-template-areas:\s*"status actions"\s*"changes actions"/);
  assert.match(configWorkspaceCss, /\.config-save-dock\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(cssRuleBlock(configWorkspaceCss, '.config-save-dock'), /border-radius:\s*var\(--studio-workspace-radius,\s*12px\);/);
  assert.ok(saveDockBlocks.length >= 2, 'config save dock has base and responsive rule blocks');
  for (const block of saveDockBlocks) {
    assert.doesNotMatch(block, /border-radius:\s*(?:15px|18px);/, 'save dock blocks keep the shared product radius');
  }
  assert.match(configWorkspaceCss, /\.config-save-dock\s*\{[\s\S]*box-shadow:\s*var\(--mono-shadow-md\);/);
  assert.match(configWorkspaceCss, /\.config-save-dock\.is-dirty\s*\{[\s\S]*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.match(configWorkspaceCss, /\.config-save-dock\.is-saved\s*\{[\s\S]*inset 0 1px 0 var\(--icon-highlight-strong\);/);
  assert.doesNotMatch(
    configWorkspaceCss,
    /var\(--mono-shadow-md,\s*0|color-mix\(in srgb,\s*(?:black|white)\b/,
    'config floating save chrome should use shared shadow/highlight tokens, not raw black/white fallbacks',
  );
  assert.match(configEditorPage, /const dirtyDomains = computed<ConfigDirtyDomain\[\]>/);
  assert.match(configEditorPage, /function captureConfigBaseline\(\): void/);
  assert.match(configEditorPage, /function normalizeLoggingDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /function normalizeBrowserDraft\(summary: ConfigSummaryPayload \| null\)/);
  assert.match(configEditorPage, /async function refreshConfigWithDirtyCheck\(\): Promise<void>/);
  assert.match(configEditorPage, /window\.confirm\(text\(/);
  assert.match(configEditorPage, /aria-live="polite"/);
});
