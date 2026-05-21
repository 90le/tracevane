import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const controlPage = read("apps/web-vue/src/features/codex-stack/CodexStackControlPage.vue");
const ccConnectCommandBar = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectCommandBar.vue");
const ccConnectProviderPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectProviderPanel.vue");
const ccConnectProjectPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectProjectPanel.vue");
const ccConnectRawPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectRawPanel.vue");
const ccConnectRail = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectRail.vue");
const ccConnectSetupPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectSetupPanel.vue");
const ccConnectStage = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectStage.vue");
const logConsole = read("apps/web-vue/src/features/codex-stack/CodexStackLogConsole.vue");
const actionOverview = read("apps/web-vue/src/features/codex-stack/CodexStackActionOverview.vue");
const dashboardHeroCard = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardHeroCard.vue");
const dashboardInsights = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardInsights.vue");
const diagnosticsPanel = read("apps/web-vue/src/features/codex-stack/CodexStackDiagnosticsPanel.vue");
const environmentReferenceCard = read("apps/web-vue/src/features/codex-stack/CodexStackEnvironmentReferenceCard.vue");
const installConfigPanel = read("apps/web-vue/src/features/codex-stack/CodexStackInstallConfigPanel.vue");
const installPlanCard = read("apps/web-vue/src/features/codex-stack/CodexStackInstallPlanCard.vue");
const installStrategyPanel = read("apps/web-vue/src/features/codex-stack/CodexStackInstallStrategyPanel.vue");
const jobBanner = read("apps/web-vue/src/features/codex-stack/CodexStackJobBanner.vue");
const jobOutputCard = read("apps/web-vue/src/features/codex-stack/CodexStackJobOutputCard.vue");
const jobProgressPanel = read("apps/web-vue/src/features/codex-stack/CodexStackJobProgressPanel.vue");
const modelCatalogCard = read("apps/web-vue/src/features/codex-stack/CodexStackModelCatalogCard.vue");
const modelRibbon = read("apps/web-vue/src/features/codex-stack/CodexStackModelRibbon.vue");
const repairBoard = read("apps/web-vue/src/features/codex-stack/CodexStackRepairBoard.vue");
const runtimeConfigCard = read("apps/web-vue/src/features/codex-stack/CodexStackRuntimeConfigCard.vue");
const upstreamMap = read("apps/web-vue/src/features/codex-stack/CodexStackUpstreamMap.vue");
const chainMap = read("apps/web-vue/src/features/codex-stack/CodexStackChainMap.vue");
const runReadinessPanel = read("apps/web-vue/src/features/codex-stack/CodexStackRunReadinessPanel.vue");
const sectionIntro = read("apps/web-vue/src/features/codex-stack/CodexStackSectionIntro.vue");
const viewModel = read("apps/web-vue/src/features/codex-stack/codex-stack-view-model.ts");
const readinessAction = read("apps/web-vue/src/features/codex-stack/readiness-action.ts");
const codexStackService = read("apps/api/modules/codex-stack/service.ts");

test("codex stack logs panel is isolated from the main control page", () => {
  assert.match(controlPage, /import CodexStackLogConsole from "\.\/CodexStackLogConsole\.vue";/);
  assert.match(controlPage, /<CodexStackLogConsole[\s\S]*v-model:selected-service="selectedLogService"[\s\S]*@load="loadLogs"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-log-console"/);

  assert.match(logConsole, /export interface CodexStackLogServiceOption/);
  assert.match(logConsole, /\.cs-log-service-button\s*\{/);
  assert.match(logConsole, /\.cs-log\s*\{/);
});

test("codex stack log reads avoid overlapping auto-refresh requests", () => {
  assert.match(controlPage, /let logRequestInFlight = false;/);
  assert.match(controlPage, /let queuedLogRequest: \{ serviceId: CodexStackServiceId; silent: boolean \} \| null = null;/);
  assert.match(
    controlPage,
    /if \(logRequestInFlight\) \{[\s\S]*queuedLogRequest = \{ serviceId, silent \};[\s\S]*return;[\s\S]*\}/,
  );
  assert.match(controlPage, /const nextRequest = queuedLogRequest;[\s\S]*queuedLogRequest = null;/);
  assert.match(controlPage, /void loadLogs\(nextRequest\.serviceId, nextRequest\.silent\);/);
});

test("codex stack extracted panels own their scoped display styles", () => {
  assert.match(actionOverview, /class="cs-action-overview-grid"/);
  assert.match(actionOverview, /\.cs-readiness-bar\s*\{/);
  assert.match(actionOverview, /@media \(max-width: 1200px\)/);
  assert.match(dashboardHeroCard, /class="panel-card cs-dashboard-hero-card"/);
  assert.match(dashboardHeroCard, /\.cs-hero-title-row\s*\{/);
  assert.match(dashboardHeroCard, /\.cs-hero-actions\s*\{/);
  assert.match(dashboardHeroCard, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(dashboardHeroCard, /@media \(max-width: 960px\)/);
  assert.match(diagnosticsPanel, /class="cs-diagnostics-grid"/);
  assert.match(diagnosticsPanel, /\.cs-warning-list\s*\{/);
  assert.match(diagnosticsPanel, /@media \(max-width: 960px\)/);
  assert.match(environmentReferenceCard, /class="panel-card cs-environment-reference-card"/);
  assert.match(environmentReferenceCard, /\.cs-kv-list\s*\{/);
  assert.match(environmentReferenceCard, /\.cs-warning-list\s*\{/);
  assert.match(environmentReferenceCard, /@media \(max-width: 960px\)/);
  assert.match(installConfigPanel, /class="cs-install-config-panel"/);
  assert.match(installConfigPanel, /\.cs-install-grid\s*\{/);
  assert.match(installConfigPanel, /@media \(max-width: 960px\)/);
  assert.match(installPlanCard, /class="panel-card cs-install-plan-card"/);
  assert.match(installPlanCard, /\.cs-install-plan-list\s*\{/);
  assert.match(installPlanCard, /@media \(max-width: 960px\)/);
  assert.match(installStrategyPanel, /class="cs-install-strategy-panel"/);
  assert.match(installStrategyPanel, /\.cs-component-mode-list\s*\{/);
  assert.match(installStrategyPanel, /\.cs-install-cta-card\s*\{/);
  assert.match(installStrategyPanel, /@media \(max-width: 960px\)/);
  assert.match(jobBanner, /class="panel-card cs-job-banner"/);
  assert.match(jobBanner, /\.cs-job-banner-live\s*\{/);
  assert.match(jobBanner, /@media \(max-width: 960px\)/);
  assert.match(jobOutputCard, /class="panel-card cs-job-output-card"/);
  assert.match(jobOutputCard, /\.cs-log\s*\{/);
  assert.match(jobOutputCard, /@media \(max-width: 960px\)/);
  assert.match(jobProgressPanel, /class="cs-install-overlay"/);
  assert.match(jobProgressPanel, /\.cs-job-progress-track\s*\{/);
  assert.match(jobProgressPanel, /@media \(max-width: 960px\)/);
  assert.match(modelCatalogCard, /class="panel-card cs-model-catalog-card"/);
  assert.match(modelCatalogCard, /\.cs-field-hint\s*\{/);
  assert.match(modelCatalogCard, /\.cs-model-list\s*\{/);
  assert.match(modelCatalogCard, /\.cs-model-current\s*\{/);
  assert.match(modelCatalogCard, /@media \(max-width: 960px\)/);
  assert.match(modelRibbon, /class="panel-card cs-model-ribbon"/);
  assert.match(modelRibbon, /\.cs-model-ribbon-side\s*\{/);
  assert.match(modelRibbon, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(modelRibbon, /@media \(max-width: 960px\)/);
  assert.match(repairBoard, /class="panel-card cs-repair-board"/);
  assert.match(repairBoard, /\.cs-repair-grid\s*\{/);
  assert.match(repairBoard, /@media \(max-width: 960px\)/);
  assert.match(runtimeConfigCard, /class="panel-card cs-runtime-config-card"/);
  assert.match(runtimeConfigCard, /\.cs-form-grid\s*\{/);
  assert.match(runtimeConfigCard, /@media \(max-width: 960px\)/);
  assert.match(upstreamMap, /class="panel-card cs-upstream-map"/);
  assert.match(upstreamMap, /\.cs-upstream-grid\s*\{/);
  assert.match(upstreamMap, /@media \(max-width: 960px\)/);
  assert.match(dashboardInsights, /\.cs-section-kicker\s*\{/);
  assert.match(dashboardInsights, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(chainMap, /export interface CodexStackChainNode/);
  assert.match(chainMap, /\.cs-chain-line\s*\{/);
  assert.match(chainMap, /\.cs-chain-gates\s*\{/);
  assert.match(chainMap, /\.cs-chain-warning-strip\s*\{/);
  assert.match(runReadinessPanel, /class="panel-card cs-run-readiness-card"/);
  assert.match(runReadinessPanel, /\.cs-run-check-grid\s*\{/);
  assert.match(runReadinessPanel, /@media \(max-width: 960px\)/);
  assert.match(sectionIntro, /class="panel-card cs-section-intro"/);
  assert.match(sectionIntro, /\.cs-section-copy\s*\{/);
  assert.match(sectionIntro, /\.cs-chip-row\s*\{/);
  assert.match(sectionIntro, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(sectionIntro, /@media \(max-width: 960px\)/);
  assert.match(ccConnectCommandBar, /class="cs-cc-command-bar"/);
  assert.match(ccConnectCommandBar, /\.cs-config-action-strip\s*\{/);
  assert.match(ccConnectCommandBar, /\.cs-agent-savebar\s*\{/);
  assert.match(ccConnectCommandBar, /@media \(max-width: 960px\)/);
  assert.match(ccConnectProviderPanel, /class="cs-cc-provider-panel"/);
  assert.match(ccConnectProviderPanel, /\.cs-provider-grid\s*\{/);
  assert.match(ccConnectProviderPanel, /\.cs-language-field\s*\{/);
  assert.match(ccConnectProviderPanel, /@media \(max-width: 960px\)/);
  assert.match(ccConnectProjectPanel, /class="cs-cc-project-panel"/);
  assert.match(ccConnectProjectPanel, /\.cs-agent-template-row\s*\{/);
  assert.match(ccConnectProjectPanel, /\.cs-platform-grid\s*\{/);
  assert.match(ccConnectProjectPanel, /@media \(max-width: 960px\)/);
  assert.match(ccConnectRawPanel, /class="cs-cc-raw-panel"/);
  assert.match(ccConnectRawPanel, /\.cs-raw-editor\s*\{/);
  assert.match(ccConnectRawPanel, /\.cs-status-pill\.tone-accent\s*\{/);
  assert.match(ccConnectRawPanel, /@media \(max-width: 960px\)/);
  assert.match(ccConnectRail, /class="panel-card cs-agent-rail"/);
  assert.match(ccConnectRail, /\.cs-agent-pane-switch\s*\{/);
  assert.match(ccConnectRail, /\.cs-agent-project-pill\s*\{/);
  assert.match(ccConnectRail, /@media \(max-width: 960px\)/);
  assert.match(ccConnectSetupPanel, /class="cs-cc-setup-panel"/);
  assert.match(ccConnectSetupPanel, /\.cs-code\s*\{/);
  assert.match(ccConnectSetupPanel, /@media \(max-width: 960px\)/);
  assert.match(ccConnectStage, /class="cs-agent-workbench"/);
  assert.match(ccConnectStage, /class="panel-card cs-agent-stage"/);
  assert.match(ccConnectStage, /@media \(max-width: 960px\)/);
  assert.match(logConsole, /\.cs-section-kicker\s*\{/);
  assert.match(logConsole, /\.cs-info-chip,\s*\n\.cs-status-pill\s*\{/);
});

test("codex stack section intros delegate repeated page copy without moving derived chips", () => {
  assert.match(controlPage, /import CodexStackSectionIntro from "\.\/CodexStackSectionIntro\.vue";/);
  assert.match(controlPage, /import type \{ CodexStackSectionIntroChip \} from "\.\/CodexStackSectionIntro\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('安装', 'Install'\)"[\s\S]*:title="text\('安装\/修复指挥台', 'Install\/Repair Command Center'\)"[\s\S]*:copy="text\('安装页按/ ,
  );
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('模型与上游', 'Models and Upstreams'\)"[\s\S]*:title="text\('统一模型、端口与上游配置', 'Unified Model, Port, and Upstream Config'\)"[\s\S]*:chips="settingsSectionIntroChips"/,
  );
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('日志', 'Logs'\)"[\s\S]*:title="text\('服务日志与任务输出预览', 'Service Logs and Job Output Preview'\)"[\s\S]*:copy="text\('日志读取默认轻量预览/ ,
  );
  assert.match(controlPage, /const settingsSectionIntroChips = computed<CodexStackSectionIntroChip\[\]>\(\(\) => \[/);
  assert.match(controlPage, /\{ label: modelSourceLabel\.value, variant: "status", tone: modelSourceTone\.value \}/);
  assert.match(controlPage, /\{ label: summary\.value\?\.models\.endpoint \|\| "--", variant: "info" \}/);
  assert.match(controlPage, /const modelSourceTone = computed<CodexStackTone>\(\(\) => \{/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-section-intro"/);
  assert.doesNotMatch(controlPage, /class="cs-section-copy"/);
  assert.doesNotMatch(controlPage, /class="cs-chip-row"/);
  assert.match(sectionIntro, /export interface CodexStackSectionIntroChip/);
  assert.match(sectionIntro, /variant: "info" \| "status";/);
  assert.match(sectionIntro, /withDefaults\(defineProps<\{/);
  assert.match(sectionIntro, /chips: \(\) => \[\]/);
  assert.doesNotMatch(sectionIntro, /summary\.|modelSourceLabel|modelSourceTone|modelOptions|loadSummary|patchCodexStackConfig|fetchCodexStackSummary/);
});

test("codex stack model ribbon delegates catalog refresh without moving model ownership", () => {
  assert.match(controlPage, /import CodexStackModelRibbon from "\.\/CodexStackModelRibbon\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackModelRibbon[\s\S]*:current-model="summary\.models\.current \|\| summary\.profile\.defaultModel \|\| '--'"[\s\S]*:source-help="modelSourceHelp"[\s\S]*:source-tone="modelSourceTone"[\s\S]*:source-label="modelSourceLabel"[\s\S]*:model-count="modelOptions\.length"[\s\S]*:context-tokens-display="contextTokensDisplay"[\s\S]*:loading="loading"[\s\S]*@reload="loadSummary"/,
  );
  assert.match(controlPage, /const modelOptions = computed\(\(\) => Array\.from\(new Set\(\[/);
  assert.match(controlPage, /const modelSourceTone = computed<CodexStackTone>\(\(\) => \{/);
  assert.match(controlPage, /async function loadSummary\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-model-ribbon"/);
  assert.doesNotMatch(controlPage, /class="cs-model-ribbon-side"/);
  assert.match(modelRibbon, /defineProps<\{[\s\S]*currentModel: string;[\s\S]*sourceHelp: string;[\s\S]*sourceTone: CodexStackTone;[\s\S]*modelCount: number;[\s\S]*loading: boolean;[\s\S]*\}>/);
  assert.match(modelRibbon, /defineEmits<\{[\s\S]*reload: \[\];[\s\S]*\}>/);
  assert.match(modelRibbon, /@click="\$emit\('reload'\)"/);
  assert.doesNotMatch(modelRibbon, /fetchCodexStackSummary|loadSummary|summary\.models|modelOptions|modelSourceTone|modelSourceLabel/);
});

test("codex stack dashboard delegates hero actions without moving service commands", () => {
  assert.match(controlPage, /import CodexStackDashboardHeroCard from "\.\/CodexStackDashboardHeroCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackDashboardHeroCard[\s\S]*:status-label="statusLabel"[\s\S]*:status-tone="statusTone"[\s\S]*:active-service-count="activeServiceCount"[\s\S]*:service-count="summary\.services\.length"[\s\S]*:current-model="summary\.models\.current"[\s\S]*:context-tokens-display="contextTokensDisplay"[\s\S]*:channel-label="channelLabel\(summary\.installer\.channel\)"[\s\S]*:checked-at-label="formatTimestamp\(summary\.checkedAt\)"[\s\S]*:busy="busy"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:sync-disabled="loading \|\| ccConnectLoading"[\s\S]*@run-check="runCheck"[\s\S]*@repair="repairRecommended"[\s\S]*@sync="loadAll"/,
  );
  assert.match(controlPage, /async function runCheck\(\): Promise<void>/);
  assert.match(controlPage, /async function repairRecommended\(\): Promise<void>/);
  assert.match(controlPage, /async function loadAll\(silent = false, ccConnectOptions: CcConnectLoadOptions = \{\}\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-hero-card"/);
  assert.doesNotMatch(controlPage, /class="cs-hero-actions"/);
  assert.match(dashboardHeroCard, /defineProps<\{[\s\S]*statusLabel: string;[\s\S]*statusTone: CodexStackTone;[\s\S]*activeServiceCount: number;[\s\S]*syncDisabled: boolean;[\s\S]*\}>/);
  assert.match(dashboardHeroCard, /defineEmits<\{[\s\S]*"run-check": \[\];[\s\S]*repair: \[\];[\s\S]*sync: \[\];[\s\S]*\}>/);
  assert.match(dashboardHeroCard, /@click="\$emit\('run-check'\)"/);
  assert.match(dashboardHeroCard, /@click="\$emit\('repair'\)"/);
  assert.match(dashboardHeroCard, /@click="\$emit\('sync'\)"/);
  assert.doesNotMatch(dashboardHeroCard, /runCodexStackCheck|startCodexStackRepair|fetchCodexStackSummary|fetchCcConnectConfig|loadAll|repairRecommended|runCheck/);
});

test("codex stack dashboard delegates action overview without losing actions", () => {
  assert.match(controlPage, /import CodexStackActionOverview from "\.\/CodexStackActionOverview\.vue";/);
  assert.match(controlPage, /<CodexStackActionOverview[\s\S]*:ready-component-count="readyComponentCount"[\s\S]*:next-action-title="nextActionTitle"[\s\S]*@primary="nextActionPrimary"[\s\S]*@open-section="activeSection = nextActionSection"/);
  assert.doesNotMatch(controlPage, /class="cs-command-grid"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-readiness-card"/);
  assert.match(actionOverview, /<CodexStackRecommendationCard/);
  assert.match(actionOverview, /nextActionRequiresMutation \? !props\.canRunMutation : props\.busy/);
  assert.match(actionOverview, /modelCatalogPreview/);
});

test("codex stack dashboard delegates diagnostics without losing run check", () => {
  assert.match(controlPage, /import CodexStackDiagnosticsPanel from "\.\/CodexStackDiagnosticsPanel\.vue";/);
  assert.match(controlPage, /<CodexStackDiagnosticsPanel[\s\S]*:output="checkOutput"[\s\S]*:warnings="summary\.warnings"[\s\S]*@run-check="runCheck"/);
  assert.doesNotMatch(controlPage, /尚未运行健康检查。/);
  assert.doesNotMatch(controlPage, /class="cs-diagnostics-grid"/);
  assert.match(diagnosticsPanel, /健康检查/);
  assert.match(diagnosticsPanel, /@click="\$emit\('run-check'\)"/);
  assert.match(diagnosticsPanel, /warnings\.length/);
});

test("codex stack delegates global job banner without losing navigation and dismiss actions", () => {
  assert.match(controlPage, /import CodexStackJobBanner from "\.\/CodexStackJobBanner\.vue";/);
  assert.match(controlPage, /<CodexStackJobBanner[\s\S]*v-if="activeJob"[\s\S]*:command-label="activeJob\.commandLabel"[\s\S]*:status="activeJob\.status"/);
  assert.match(controlPage, /@open-logs="activeSection = 'logs'"[\s\S]*@dismiss="activeJob = null"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-job-banner"/);
  assert.doesNotMatch(controlPage, /function jobStateClass/);
  assert.match(jobBanner, /const jobStateClass = computed/);
  assert.match(jobBanner, /props\.status === "succeeded"/);
  assert.match(jobBanner, /@click="\$emit\('open-logs'\)"/);
  assert.match(jobBanner, /v-if="!running"[\s\S]*@click="\$emit\('dismiss'\)"/);
});

test("codex stack install page delegates preflight plan without losing actions", () => {
  assert.match(controlPage, /import CodexStackInstallPlanCard from "\.\/CodexStackInstallPlanCard\.vue";/);
  assert.match(controlPage, /<CodexStackInstallPlanCard[\s\S]*:highlights="installPlanHighlights"[\s\S]*@install-full="installFullStack"[\s\S]*@install-base="installBaseOnly"[\s\S]*@repair="repairRecommended"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-plan-card"/);
  assert.match(installPlanCard, /执行前确认/);
  assert.match(installPlanCard, /@click="\$emit\('install-full'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('install-base'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('repair'\)"/);
});

test("codex stack install page delegates install config without moving install payload ownership", () => {
  assert.match(controlPage, /import CodexStackInstallConfigPanel from "\.\/CodexStackInstallConfigPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackInstallConfigPanel[\s\S]*:form="installForm"[\s\S]*:model-options="modelOptions"[\s\S]*:model-source-label="modelSourceLabel"[\s\S]*:context-tokens-disabled="installContextTokensDisabled"[\s\S]*@update-field="updateInstallFormField"/,
  );
  assert.match(controlPage, /function updateInstallFormField\(field: CodexStackInstallConfigField, value: string \| number \| boolean\): void/);
  assert.match(controlPage, /function buildInstallPayload\(skipCcConnect = installForm\.skipCcConnect\)/);
  assert.match(controlPage, /async function installFullStack\(\): Promise<void>/);
  assert.match(controlPage, /async function installBaseOnly\(\): Promise<void>/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(false\)\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(true\)\)/);
  assert.doesNotMatch(controlPage, /v-model(?:\.number)?="installForm\.(channel|model|cpaPort|compactPort|cpaKey|contextMode|contextWindowTokens|skipNpm|skipCcConnect|noStart|skipExisting|forceReinstall|upstreamBaseUrl|upstreamApiKey|providerProxyUrl|noProxy)"/);
  assert.match(installConfigPanel, /export interface CodexStackInstallConfigDraft/);
  assert.match(installConfigPanel, /defineEmits<[\s\S]*updateField: \[field: CodexStackInstallConfigField, value: string \| number \| boolean\]/);
  assert.doesNotMatch(installConfigPanel, /startCodexStackInstall|buildInstallPayload|installFullStack|installBaseOnly/);
});

test("codex stack install page delegates component strategy and CTA without moving actions", () => {
  assert.match(controlPage, /import CodexStackInstallStrategyPanel from "\.\/CodexStackInstallStrategyPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackInstallStrategyPanel[\s\S]*:components="installComponentStrategies"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*@set-component-mode="setComponentMode"[\s\S]*@install-full="installFullStack"[\s\S]*@install-base="installBaseOnly"[\s\S]*@repair="repairRecommended"/,
  );
  assert.match(controlPage, /const installComponentStrategies = computed<CodexStackInstallComponentStrategy\[\]>/);
  assert.match(controlPage, /function setComponentMode\(componentId: CodexStackComponentId, mode: ComponentInstallMode\): void/);
  assert.match(controlPage, /async function installFullStack\(\): Promise<void>/);
  assert.match(controlPage, /async function installBaseOnly\(\): Promise<void>/);
  assert.match(controlPage, /async function repairRecommended\(\): Promise<void>/);
  assert.match(controlPage, /function buildInstallPayload\(skipCcConnect = installForm\.skipCcConnect\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(false\)\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(true\)\)/);
  assert.doesNotMatch(controlPage, /class="cs-component-mode-list"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-cta-card"/);
  assert.match(installStrategyPanel, /defineEmits<[\s\S]*"set-component-mode": \[componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode\]/);
  assert.match(installStrategyPanel, /@click="\$emit\('install-full'\)"/);
  assert.match(installStrategyPanel, /@click="\$emit\('install-base'\)"/);
  assert.match(installStrategyPanel, /@click="\$emit\('repair'\)"/);
  assert.doesNotMatch(installStrategyPanel, /startCodexStackInstall|buildInstallPayload|installFullStack|installBaseOnly|repairRecommended\(\)/);
});

test("codex stack install page delegates long job progress without losing polling ownership", () => {
  assert.match(controlPage, /import CodexStackJobProgressPanel from "\.\/CodexStackJobProgressPanel\.vue";/);
  assert.match(controlPage, /<CodexStackJobProgressPanel[\s\S]*v-if="activeJob"[\s\S]*:job="activeJob"[\s\S]*:steps="jobProgressSteps"[\s\S]*:progress-percent="jobProgressPercent"/);
  assert.match(controlPage, /:running="isCodexStackJobRunning\(activeJob\)"[\s\S]*@dismiss="activeJob = null"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-progress"/);
  assert.doesNotMatch(controlPage, /class="cs-install-overlay"/);
  assert.match(controlPage, /function startPollingJob\(job: CodexStackJob\): void/);
  assert.match(controlPage, /fetchCodexStackJob\(activeJob\.value\.id\)[\s\S]*activeJob\.value = response\.job/);
  assert.match(jobProgressPanel, /安装或修复脚本正在后台执行，日志会持续刷新。/);
  assert.match(jobProgressPanel, /job\.logTail \|\| emptyLog/);
  assert.match(jobProgressPanel, /@click="\$emit\('dismiss'\)"/);
});

test("codex stack logs page delegates job output preview without losing polling ownership", () => {
  assert.match(controlPage, /import CodexStackJobOutputCard from "\.\/CodexStackJobOutputCard\.vue";/);
  assert.match(controlPage, /<CodexStackJobOutputCard[\s\S]*v-if="activeJob"[\s\S]*:job="activeJob"[\s\S]*:steps="jobProgressSteps"[\s\S]*:progress-percent="jobProgressPercent"/);
  assert.match(controlPage, /:empty-log="text\('等待输出\.\.\.', 'Waiting for output\.\.\.'\)"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-job-output-card"/);
  assert.match(controlPage, /function startPollingJob\(job: CodexStackJob\): void/);
  assert.match(controlPage, /fetchCodexStackJob\(activeJob\.value\.id\)[\s\S]*activeJob\.value = response\.job/);
  assert.match(jobOutputCard, /任务输出/);
  assert.match(jobOutputCard, /job\.logTail \|\| emptyLog/);
  assert.match(jobOutputCard, /props\.job\.status === "succeeded"/);
});

test("codex stack install page delegates repair board without weakening CPA attach gate", () => {
  assert.match(controlPage, /import CodexStackRepairBoard from "\.\/CodexStackRepairBoard\.vue";/);
  assert.match(controlPage, /<CodexStackRepairBoard[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:can-attach-codex-cpa="canAttachCodexCpa"[\s\S]*:attach-codex-cpa-help="attachCodexCpaHelp"/);
  assert.match(controlPage, /@repair-recommended="repairRecommended"[\s\S]*@repair-conflicts="repairConflictingUnits"[\s\S]*@repair-config-only="repairConfigOnly"/);
  assert.match(controlPage, /@pause-stack="pauseStack"[\s\S]*@resume-stack="resumeStack"[\s\S]*@run-smoke-matrix="runSmokeMatrix"[\s\S]*@attach-codex-cpa="applyCodexCpaAfterSmoke"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-repair-board"/);
  assert.match(repairBoard, /运行模型矩阵/);
  assert.match(repairBoard, /glm-5\.1 与 kimi-k2\.6 都要通过普通、非流式、流式和压缩上下文/);
  assert.match(repairBoard, /:disabled="!canAttachCodexCpa"[\s\S]*@click="\$emit\('attach-codex-cpa'\)"/);
  assert.match(controlPage, /if \(!canAttachCodexCpa\.value\) \{[\s\S]*请先运行“只验证”/);
});

test("codex stack cc-connect page delegates command bar without moving config writes", () => {
  assert.match(controlPage, /import CodexStackCcConnectCommandBar from "\.\/CodexStackCcConnectCommandBar\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectCommandBar[\s\S]*:installed="summary\.ccConnect\.installed"[\s\S]*:configured="summary\.ccConnect\.configured"[\s\S]*:binding-present="summary\.ccConnect\.bindingPresent"[\s\S]*:finalizer-available="summary\.ccConnect\.finalizerAvailable"[\s\S]*:project-name="primaryCcConnectProjectName"[\s\S]*:provider-count="ccConnectProviderDraftCount"[\s\S]*:project-count="ccConnectProjectDraftCount"[\s\S]*:has-structured-changes="hasCcConnectStructuredChanges"[\s\S]*:has-raw-changes="hasCcConnectRawChanges"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*@save-structured="saveCcConnectStructured"[\s\S]*@save-raw="saveCcConnectRaw"/,
  );
  assert.doesNotMatch(controlPage, /class="panel-card cs-config-action-strip cs-agent-savebar"/);
  assert.match(controlPage, /async function saveCcConnectStructured\(\): Promise<void>/);
  assert.match(controlPage, /async function saveCcConnectRaw\(\): Promise<void>/);
  assert.match(controlPage, /patchCcConnectConfig\(\{[\s\S]*providers: normalizeProviderDrafts\(\),[\s\S]*projects: normalizeProjectDrafts\(\)/);
  assert.match(controlPage, /patchCcConnectConfig\(\{ raw: ccConnectRawDraft\.value \}\)/);
  assert.match(ccConnectCommandBar, /defineEmits<[\s\S]*"save-structured": \[\];[\s\S]*"save-raw": \[\]/);
  assert.match(ccConnectCommandBar, /@click="\$emit\('save-structured'\)"/);
  assert.match(ccConnectCommandBar, /@click="\$emit\('save-raw'\)"/);
  assert.doesNotMatch(ccConnectCommandBar, /patchCcConnectConfig|saveCcConnectStructured|saveCcConnectRaw|normalizeProviderDrafts|normalizeProjectDrafts/);
});

test("codex stack cc-connect page delegates provider editor without moving provider drafts", () => {
  assert.match(controlPage, /import CodexStackCcConnectProviderPanel from "\.\/CodexStackCcConnectProviderPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectProviderPanel[\s\S]*:language="ccConnectLanguageDraft"[\s\S]*:providers="ccConnectProviderDrafts"[\s\S]*:compact-proxy-base-url="compactProxyBaseUrl"[\s\S]*:loading="ccConnectLoading && !ccConnectConfig"[\s\S]*:busy="busy"[\s\S]*@update-language="updateCcConnectLanguage"[\s\S]*@update-provider-field="updateCcConnectProviderField"[\s\S]*@ensure-cpa-provider="ensureCpaProviderDraft"[\s\S]*@add-provider="addCcConnectProvider"[\s\S]*@remove-provider="removeCcConnectProvider"/,
  );
  assert.match(controlPage, /function updateCcConnectLanguage\(language: string\): void/);
  assert.match(controlPage, /function updateCcConnectProviderField\(providerId: string, field: CodexStackCcConnectProviderField, value: string\): void/);
  assert.match(controlPage, /function ensureCpaProviderDraft\(\): void/);
  assert.match(controlPage, /function addCcConnectProvider\(\): void/);
  assert.match(controlPage, /function removeCcConnectProvider\(providerId: string\): void/);
  assert.match(controlPage, /function normalizeProviderDrafts\(\): CcConnectProvider\[\]/);
  assert.doesNotMatch(controlPage, /v-model="provider\.(name|codexEnvKey|baseUrl|apiKey)"/);
  assert.doesNotMatch(controlPage, /class="cs-provider-grid cs-provider-grid-roomy"/);
  assert.match(ccConnectProviderPanel, /export type CodexStackCcConnectProviderField = "name" \| "codexEnvKey" \| "baseUrl" \| "apiKey";/);
  assert.match(ccConnectProviderPanel, /export interface CodexStackCcConnectProviderDraft/);
  assert.match(ccConnectProviderPanel, /defineEmits<[\s\S]*"update-language": \[language: string\][\s\S]*"update-provider-field": \[providerId: string, field: CodexStackCcConnectProviderField, value: string\][\s\S]*"ensure-cpa-provider": \[\][\s\S]*"add-provider": \[\][\s\S]*"remove-provider": \[providerId: string\]/);
  assert.match(ccConnectProviderPanel, /@input="\$emit\('update-provider-field', provider\.id, 'baseUrl', inputValue\(\$event\)\)"/);
  assert.match(ccConnectProviderPanel, /@click="\$emit\('ensure-cpa-provider'\)"/);
  assert.match(ccConnectProviderPanel, /@click="\$emit\('remove-provider', provider\.id\)"/);
  assert.doesNotMatch(ccConnectProviderPanel, /ccConnectProviderDrafts|normalizeProviderDrafts|patchCcConnectConfig|saveCcConnectStructured|saveCcConnectRaw/);
});

test("codex stack cc-connect page delegates project editor without moving project drafts", () => {
  assert.match(controlPage, /import CodexStackCcConnectProjectPanel from "\.\/CodexStackCcConnectProjectPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectProjectPanel[\s\S]*:project="selectedProjectDraft"[\s\S]*:project-summary="selectedProjectSummary"[\s\S]*:presets="projectPresetCards"[\s\S]*:platform-templates="platformTemplates"[\s\S]*:model-options="modelOptions"[\s\S]*:loading="ccConnectLoading && !ccConnectConfig"[\s\S]*:busy="busy"[\s\S]*@sync-default-model="applyDefaultModelToCcConnectProjects"[\s\S]*@remove-project="removeCcConnectProject"[\s\S]*@add-preset="addCcConnectProjectPreset"[\s\S]*@add-project="addCcConnectProject"[\s\S]*@update-project-field="updateCcConnectProjectField"[\s\S]*@update-agent-option="updateCcConnectAgentOption"[\s\S]*@add-platform="addPlatformToSelectedProject"[\s\S]*@remove-platform="removePlatformFromSelectedProject"[\s\S]*@update-platform-type="updateCcConnectPlatformType"[\s\S]*@update-platform-option="updateCcConnectPlatformOption"[\s\S]*@add-platform-option="addCcConnectPlatformOptionById"[\s\S]*@remove-platform-option="removeCcConnectPlatformOptionById"/,
  );
  assert.match(controlPage, /const platformTemplates = computed<CodexStackCcConnectPlatformTemplate\[\]>/);
  assert.match(controlPage, /const projectPresetCards = computed<CodexStackCcConnectProjectPresetCard\[\]>/);
  assert.match(controlPage, /function updateCcConnectProjectField\([\s\S]*field: CodexStackCcConnectProjectField[\s\S]*\): void/);
  assert.match(controlPage, /function updateCcConnectAgentOption\([\s\S]*field: CodexStackCcConnectAgentOptionField[\s\S]*\): void/);
  assert.match(controlPage, /function updateCcConnectPlatformType\(platformId: string, value: string\): void/);
  assert.match(controlPage, /function updateCcConnectPlatformOption\([\s\S]*field: CodexStackCcConnectPlatformOptionField[\s\S]*\): void/);
  assert.match(controlPage, /function normalizeProjectDrafts\(\): CcConnectProject\[\]/);
  assert.doesNotMatch(controlPage, /v-model="selectedProjectDraft\.(name|adminFrom|agentType|agentOptions)/);
  assert.doesNotMatch(controlPage, /v-model="platform\.(type|optionRows)/);
  assert.doesNotMatch(controlPage, /class="cs-agent-template-row"/);
  assert.doesNotMatch(controlPage, /class="cs-platform-grid cs-platform-grid-roomy"/);
  assert.match(ccConnectProjectPanel, /export interface CodexStackCcConnectProjectDraft/);
  assert.match(ccConnectProjectPanel, /export type CodexStackCcConnectProjectField = "name" \| "adminFrom" \| "agentType";/);
  assert.match(ccConnectProjectPanel, /export type CodexStackCcConnectAgentOptionField = "workDir" \| "mode" \| "model";/);
  assert.match(ccConnectProjectPanel, /defineEmits<[\s\S]*"update-project-field": \[projectId: string, field: CodexStackCcConnectProjectField, value: string\][\s\S]*"update-agent-option": \[projectId: string, field: CodexStackCcConnectAgentOptionField, value: string\][\s\S]*"add-platform": \[type: CodexStackCcConnectPlatformTemplateId\][\s\S]*"update-platform-option": \[platformId: string, optionId: string, field: CodexStackCcConnectPlatformOptionField, value: string\]/);
  assert.match(ccConnectProjectPanel, /@input="\$emit\('update-project-field', project\.id, 'name', inputValue\(\$event\)\)"/);
  assert.match(ccConnectProjectPanel, /@change="\$emit\('update-agent-option', project\.id, 'model', inputValue\(\$event\)\)"/);
  assert.match(ccConnectProjectPanel, /@click="\$emit\('add-platform', template\.id\)"/);
  assert.match(ccConnectProjectPanel, /@input="\$emit\('update-platform-option', platform\.id, row\.id, 'value', inputValue\(\$event\)\)"/);
  assert.doesNotMatch(ccConnectProjectPanel, /ccConnectProjectDrafts|selectedProjectDraftId|normalizeProjectDrafts|patchCcConnectConfig|saveCcConnectStructured|saveCcConnectRaw/);
});

test("codex stack cc-connect page delegates raw TOML editor without moving raw save", () => {
  assert.match(controlPage, /import CodexStackCcConnectRawPanel from "\.\/CodexStackCcConnectRawPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectRawPanel[\s\S]*:raw-draft="ccConnectRawDraft"[\s\S]*:has-raw-changes="hasCcConnectRawChanges"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*@update-raw="updateCcConnectRawDraft"[\s\S]*@save-raw="saveCcConnectRaw"/,
  );
  assert.match(controlPage, /function updateCcConnectRawDraft\(raw: string\): void/);
  assert.match(controlPage, /async function saveCcConnectRaw\(\): Promise<void>/);
  assert.match(controlPage, /patchCcConnectConfig\(\{ raw: ccConnectRawDraft\.value \}\)/);
  assert.doesNotMatch(controlPage, /v-model="ccConnectRawDraft"/);
  assert.doesNotMatch(controlPage, /class="cs-raw-editor"/);
  assert.match(ccConnectRawPanel, /defineProps<\{[\s\S]*rawDraft: string;[\s\S]*hasRawChanges: boolean;[\s\S]*canRunMutation: boolean;[\s\S]*\}>/);
  assert.match(ccConnectRawPanel, /defineEmits<\{[\s\S]*"update-raw": \[raw: string\];[\s\S]*"save-raw": \[\];[\s\S]*\}>/);
  assert.match(ccConnectRawPanel, /@input="\$emit\('update-raw', textareaValue\(\$event\)\)"/);
  assert.match(ccConnectRawPanel, /@click="\$emit\('save-raw'\)"/);
  assert.doesNotMatch(ccConnectRawPanel, /ccConnectRawDraft|patchCcConnectConfig|saveCcConnectRaw|saveCcConnectStructured|normalizeProviderDrafts|normalizeProjectDrafts/);
});

test("codex stack cc-connect page delegates rail navigation without moving drafts", () => {
  assert.match(controlPage, /import CodexStackCcConnectStage from "\.\/CodexStackCcConnectStage\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectStage[\s\S]*:panes="agentPanes"[\s\S]*:active-pane="activeAgentPane"[\s\S]*:projects="ccConnectProjectRailItems"[\s\S]*:selected-project-id="selectedProjectDraft\?\.id \|\| ''"[\s\S]*:busy="busy"[\s\S]*@set-active-pane="setActiveAgentPane"[\s\S]*@select-project="selectCcConnectProject"[\s\S]*@add-project="addCcConnectProject"/,
  );
  assert.match(ccConnectStage, /import CodexStackCcConnectRail from "\.\/CodexStackCcConnectRail\.vue";/);
  assert.match(ccConnectStage, /<CodexStackCcConnectRail[\s\S]*:panes="panes"[\s\S]*:active-pane="activePane"[\s\S]*:projects="projects"[\s\S]*:selected-project-id="selectedProjectId"[\s\S]*:busy="busy"/);
  assert.match(ccConnectStage, /<slot \/>/);
  assert.match(ccConnectStage, /defineEmits<[\s\S]*"set-active-pane": \[paneId: CodexStackCcConnectPaneId\][\s\S]*"select-project": \[projectId: string\][\s\S]*"add-project": \[\]/);
  assert.match(controlPage, /const ccConnectProjectRailItems = computed<CodexStackCcConnectProjectRailItem\[\]>/);
  assert.match(controlPage, /const agentPanes = computed<CodexStackCcConnectPaneOption\[\]>/);
  assert.match(controlPage, /function setActiveAgentPane\(paneId: AgentPaneId\): void/);
  assert.match(controlPage, /function selectCcConnectProject\(projectId: string\): void/);
  assert.match(controlPage, /function addCcConnectProject\(\): void/);
  assert.doesNotMatch(controlPage, /class="cs-agent-workbench"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-agent-stage"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-agent-rail"/);
  assert.match(ccConnectRail, /export type CodexStackCcConnectPaneId = "projects" \| "providers" \| "setup" \| "raw";/);
  assert.match(ccConnectRail, /export interface CodexStackCcConnectProjectRailItem/);
  assert.match(ccConnectRail, /defineEmits<[\s\S]*"set-active-pane": \[paneId: CodexStackCcConnectPaneId\][\s\S]*"select-project": \[projectId: string\][\s\S]*"add-project": \[\]/);
  assert.match(ccConnectRail, /@click="\$emit\('set-active-pane', pane\.id\)"/);
  assert.match(ccConnectRail, /@click="\$emit\('select-project', project\.id\)"/);
  assert.match(ccConnectRail, /@click="\$emit\('add-project'\)"/);
  assert.doesNotMatch(ccConnectRail, /ccConnectProjectDrafts|selectedProjectDraft|addCcConnectProject|selectCcConnectProject|patchCcConnectConfig|saveCcConnect/);
  assert.doesNotMatch(ccConnectStage, /ccConnectProjectDrafts|selectedProjectDraft|addCcConnectProject\(|selectCcConnectProject|patchCcConnectConfig|saveCcConnect|activeAgentPane/);
});

test("codex stack cc-connect page delegates setup actions without moving finalizer", () => {
  assert.match(controlPage, /import CodexStackCcConnectSetupPanel from "\.\/CodexStackCcConnectSetupPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectSetupPanel[\s\S]*:commands="ccConnectSetupCommands"[\s\S]*:busy="busy"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:can-finalize="summary\.ccConnect\.canFinalize"[\s\S]*@copy-setup="copySetupCommand"[\s\S]*@finalize="finalizeCcConnect"/,
  );
  assert.match(controlPage, /async function copySetupCommand\(platform: CodexStackCcConnectSetupPlatform\): Promise<void>/);
  assert.match(controlPage, /async function finalizeCcConnect\(\): Promise<void>/);
  assert.match(controlPage, /finalizeCodexStackCcConnect\(\{ project: summary\.value\?\.ccConnect\.project \|\| "main" \}\)/);
  assert.doesNotMatch(controlPage, /复制 Feishu Setup/);
  assert.doesNotMatch(controlPage, /class="cs-actions cs-actions-wrap"[\s\S]*copySetupCommand\('feishu'\)/);
  assert.match(ccConnectSetupPanel, /export type CodexStackCcConnectSetupPlatform = "feishu" \| "weixin";/);
  assert.match(ccConnectSetupPanel, /defineEmits<[\s\S]*"copy-setup": \[platform: CodexStackCcConnectSetupPlatform\][\s\S]*finalize: \[\]/);
  assert.match(ccConnectSetupPanel, /@click="\$emit\('copy-setup', 'feishu'\)"/);
  assert.match(ccConnectSetupPanel, /@click="\$emit\('copy-setup', 'weixin'\)"/);
  assert.match(ccConnectSetupPanel, /@click="\$emit\('finalize'\)"/);
  assert.doesNotMatch(ccConnectSetupPanel, /copySetupCommand|finalizeCcConnect|finalizeCodexStackCcConnect|patchCcConnectConfig|saveCcConnect/);
});

test("codex stack dashboard exposes a request chain safety map", () => {
  assert.match(controlPage, /import CodexStackChainMap from "\.\/CodexStackChainMap\.vue";/);
  assert.match(controlPage, /<CodexStackChainMap[\s\S]*:nodes="chainNodes"[\s\S]*:gates="chainGates"[\s\S]*:warnings="chainWarnings"/);
  assert.match(controlPage, /const chainNodes = computed<CodexStackChainNode\[\]>/);
  assert.match(controlPage, /const chainWarnings = computed\(\(\) => summary\.value\?\.warnings\.slice\(0, 3\) \|\| \[\]\);/);
  assert.match(controlPage, /function normalizeCodexStackSummary\(next: CodexStackSummaryPayload\): CodexStackSummaryPayload/);
  assert.match(controlPage, /proxyPolicy: normalizeProxyPolicy\(next\.proxyPolicy\)/);
  assert.match(controlPage, /const normalized = normalizeCodexStackSummary\(next\);/);
  assert.match(controlPage, /function isSmokeMatrixStale\(matrix: CodexStackSmokeMatrixResult \| null \| undefined\): boolean/);
  assert.match(controlPage, /isSmokeMatrixStale\(matrix\) \? text\("需复验", "Recheck"\)/);
  assert.match(controlPage, /id: "job-lock"/);
  assert.match(controlPage, /id: "smoke"/);
  assert.match(controlPage, /id: "watchdog"/);
  assert.match(controlPage, /NO_PROXY 缺少/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*!policy\.noProxyLoopbackReady[\s\S]*\? "danger"/);
  assert.doesNotMatch(controlPage, /current\.proxyPolicy\.noProxyLoopbackReady/);
  assert.match(chainMap, /aria-label="Codex Stack request chain"/);
  assert.match(chainMap, /v-if="warnings\.length"/);
});

test("codex stack proxy policy displays tolerate legacy summaries without proxyPolicy", () => {
  assert.match(controlPage, /function normalizeProxyPolicy\([\s\S]*policy: Partial<CodexStackSummaryPayload\["proxyPolicy"\]> \| undefined/);
  assert.match(controlPage, /noProxyLoopbackReady: typeof policy\?\.noProxyLoopbackReady === "boolean"[\s\S]*\? policy\.noProxyLoopbackReady[\s\S]*: missing\.length === 0/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*const directWithSystemProxy = policy\.providerMode === "direct"/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*if \(installForm\.upstreamBaseUrl\.trim\(\) !== \(policy\.upstreamBaseUrl \|\| ""\)\) return true;/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*if \(nextNoProxy !== \(policy\.noProxy \|\| "localhost,127\.0\.0\.1,::1"\)\)/);
  assert.doesNotMatch(controlPage, /current\.proxyPolicy\.(providerMode|providerProxyUrl|upstreamBaseUrl|noProxy)/);
  assert.doesNotMatch(controlPage, /(?:summary|current|next)\.proxyPolicy\.noProxyLoopbackReady/);
});

test("codex stack dashboard exposes explicit network mode diagnostics", () => {
  assert.match(controlPage, /:network-policy="networkPolicyCard"/);
  assert.match(controlPage, /const networkPolicyCard = computed<CodexStackNetworkPolicyCard \| null>/);
  assert.match(controlPage, /国内网关直连/);
  assert.match(controlPage, /国内直连 \+ 系统代理提示/);
  assert.match(controlPage, /网卡\/TUN 模式或系统代理可能截获 CPA\/Compact 的本机请求/);
  assert.match(controlPage, /OpenAI 官方 Codex 访问仍由 Codex\/系统代理路径处理/);
  assert.match(dashboardInsights, /export interface CodexStackNetworkPolicyCard/);
  assert.match(dashboardInsights, /class="cs-network-policy-strip"/);
  assert.match(dashboardInsights, /networkPolicy\.loopbackValue/);
  assert.match(dashboardInsights, /networkPolicy\.upstreamValue/);
});

test("codex stack dashboard exposes codex run readiness as a first-screen contract", () => {
  assert.match(controlPage, /import CodexStackRunReadinessPanel from "\.\/CodexStackRunReadinessPanel\.vue";/);
  assert.match(controlPage, /<CodexStackRunReadinessPanel[\s\S]*:readiness="summary\.runReadiness"[\s\S]*@check-action="runReadinessCheckAction"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-run-readiness-card"/);
  assert.match(runReadinessPanel, /readiness\.title/);
  assert.match(runReadinessPanel, /readiness\.modes/);
  assert.match(runReadinessPanel, /readiness\.checks/);
  assert.match(runReadinessPanel, /runReadinessLevelLabel\(readiness\.level\)/);
  assert.match(runReadinessPanel, /runReadinessCheckTone\(check\.status\)/);
  assert.match(runReadinessPanel, /@click="\$emit\('check-action', check\)"/);
  assert.match(runReadinessPanel, /check\.actionHint\.label/);
  assert.match(controlPage, /normalizeCodexStackRunReadinessCheck/);
  assert.match(controlPage, /resolveCodexStackRunReadinessAction/);
  assert.match(controlPage, /function runReadinessCheckAction\(check: CodexStackRunReadinessCheck\): void/);
  assert.match(controlPage, /command\.type === "repair"[\s\S]*startRepairWithActions\(command\.actions/);
  assert.match(readinessAction, /export function normalizeCodexStackRunReadinessCheck/);
  assert.match(readinessAction, /if \(check\.actionHint\) return check;/);
  assert.match(readinessAction, /export function resolveCodexStackRunReadinessAction/);
  assert.match(readinessAction, /action\.kind === "repair" && action\.repairActions\?\.length/);
  assert.match(runReadinessPanel, /Codex 运行就绪/);
  assert.match(codexStackService, /id: "cc-agent-task"/);
  assert.match(codexStackService, /label: "CC\/IM Agent 任务"/);
  assert.match(codexStackService, /label: "运行 smoke matrix", repairActions: \["run-smoke-matrix"\]/);
});

test("codex stack attach action requires a fresh passing smoke matrix in the UI", () => {
  assert.match(controlPage, /const isSmokeMatrixAttachReady = computed\(\(\) => \{/);
  assert.match(controlPage, /matrix\?\.attachEligible && !isSmokeMatrixStale\(matrix\)/);
  assert.match(controlPage, /const canAttachCodexCpa = computed\(\(\) => canRunMutation\.value && isSmokeMatrixAttachReady\.value\);/);
  assert.match(controlPage, /<CodexStackRepairBoard[\s\S]*:can-attach-codex-cpa="canAttachCodexCpa"[\s\S]*@attach-codex-cpa="applyCodexCpaAfterSmoke"/);
  assert.match(repairBoard, /:disabled="!canAttachCodexCpa"[\s\S]*@click="\$emit\('attach-codex-cpa'\)"/);
  assert.match(controlPage, /先运行“只验证”/);
  assert.match(controlPage, /已有新鲜通过矩阵；点击后仍会重新烟测/);
  assert.match(controlPage, /if \(!canAttachCodexCpa\.value\) \{[\s\S]*glm-5\.1 \/ kimi-k2\.6 矩阵在 24 小时内全部通过/);
});

test("codex stack recommended repair resumes a deliberately paused stack in order", () => {
  assert.match(viewModel, /const services = new Map\(summary\.services\.map\(\(service\) => \[service\.id, service\]\)\);/);
  assert.match(viewModel, /const stackInstalled = cpa\?\.installed === true && compact\?\.installed === true && watchdog\?\.installed === true;/);
  assert.match(viewModel, /if \(stackInstalled && !cpaActive && !compactActive && !watchdogActive\) \{[\s\S]*return \["resume-stack"\];[\s\S]*\}/);
  assert.doesNotMatch(viewModel, /if \(!serviceActive\.get\("cli-proxy-api\.service"\)\) actions\.push\("restart-cpa"\);/);
});

test("codex stack service grid routes unsafe starts through ordered resume", () => {
  assert.match(controlPage, /function isSummaryServiceActive\(serviceId: CodexStackServiceId\): boolean/);
  assert.match(controlPage, /serviceId === "cpa-compact-proxy\.service" && !isSummaryServiceActive\("cli-proxy-api\.service"\)[\s\S]*await resumeStack\(\);/);
  assert.match(controlPage, /serviceId === "codex-stack-watchdog\.timer"[\s\S]*!isSummaryServiceActive\("cli-proxy-api\.service"\) \|\| !isSummaryServiceActive\("cpa-compact-proxy\.service"\)[\s\S]*await resumeStack\(\);/);
});

test("codex stack background jobs resync cc-connect drafts after completion", () => {
  assert.match(controlPage, /async function loadAll\(silent = false, ccConnectOptions: CcConnectLoadOptions = \{\}\): Promise<void>/);
  assert.match(controlPage, /if \(!isCodexStackJobRunning\(response\.job\)\) \{[\s\S]*await loadAll\(true\);/);
  assert.doesNotMatch(controlPage, /if \(!isCodexStackJobRunning\(response\.job\)\) \{[\s\S]*await loadSummary\(\);[\s\S]*if \(finishedJob\.kind === "install"/);
});

test("codex stack runtime config save sends only changed fields", () => {
  assert.match(controlPage, /const configPatchPayload = computed<CodexStackConfigPatchRequest>\(\(\) => \{/);
  assert.match(controlPage, /const hasConfigPatchChanges = computed\(\(\) => Object\.keys\(configPatchPayload\.value\)\.length > 0\);/);
  assert.match(controlPage, /:has-changes="hasConfigPatchChanges"/);
  assert.match(runtimeConfigCard, /:disabled="!canRunMutation \|\| !hasChanges"/);
  assert.match(controlPage, /const payload = configPatchPayload\.value;[\s\S]*if \(!Object\.keys\(payload\)\.length\)/);
  assert.doesNotMatch(controlPage, /const payload: CodexStackConfigPatchRequest = \{\s*defaultModel: configForm\.defaultModel,/);
});

test("codex stack settings page delegates upstream map without moving config writes", () => {
  assert.match(controlPage, /import CodexStackUpstreamMap from "\.\/CodexStackUpstreamMap\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackUpstreamMap[\s\S]*:default-model="configForm\.defaultModel \|\| summary\.models\.current \|\| '--'"[\s\S]*:compact-proxy-base-url="compactProxyBaseUrl"[\s\S]*:provider-name="canonicalCcConnectProvider\.name"[\s\S]*:provider-base-url="canonicalCcConnectProvider\.baseUrl"[\s\S]*:provider-model="canonicalCcConnectProvider\.model"/,
  );
  assert.doesNotMatch(controlPage, /class="panel-card cs-upstream-map"/);
  assert.match(controlPage, /const configPatchPayload = computed<CodexStackConfigPatchRequest>/);
  assert.match(controlPage, /async function saveConfigPatch\(\): Promise<void>/);
  assert.match(controlPage, /function normalizeProxyPolicy\([\s\S]*noProxyLoopbackReady: typeof policy\?\.noProxyLoopbackReady === "boolean"/);
  assert.match(upstreamMap, /写入 ~\/\.codex\/config\.toml/);
  assert.match(upstreamMap, /本地 OpenAI 兼容入口/);
  assert.match(upstreamMap, /OPENAI_API_KEY \/ base_url/);
});

test("codex stack settings page delegates model catalog without moving summary refresh", () => {
  assert.match(controlPage, /import CodexStackModelCatalogCard from "\.\/CodexStackModelCatalogCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackModelCatalogCard[\s\S]*:models="modelOptions"[\s\S]*:current-model="summary\.models\.current"[\s\S]*:source-help="modelSourceHelp"[\s\S]*:loading="loading"[\s\S]*@reload="loadSummary"/,
  );
  assert.match(controlPage, /const modelOptions = computed\(\(\) => Array\.from\(new Set\(\[/);
  assert.match(controlPage, /async function loadSummary\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-model-catalog-card"/);
  assert.doesNotMatch(controlPage, /class="cs-model-list"/);
  assert.match(modelCatalogCard, /defineProps<\{[\s\S]*models: string\[\];[\s\S]*currentModel: string;[\s\S]*sourceHelp: string;[\s\S]*loading: boolean;[\s\S]*\}>/);
  assert.match(modelCatalogCard, /defineEmits<\{[\s\S]*reload: \[\];[\s\S]*\}>/);
  assert.match(modelCatalogCard, /@click="\$emit\('reload'\)"/);
  assert.doesNotMatch(modelCatalogCard, /fetchCodexStackSummary|loadSummary|summary\.models|modelOptions/);
});

test("codex stack settings page delegates runtime config form without moving patch ownership", () => {
  assert.match(controlPage, /import CodexStackRuntimeConfigCard from "\.\/CodexStackRuntimeConfigCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackRuntimeConfigCard[\s\S]*:form="configForm"[\s\S]*:model-options="modelOptions"[\s\S]*:context-tokens-disabled="configContextTokensDisabled"[\s\S]*:restart-required-units="restartRequiredUnits"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:has-changes="hasConfigPatchChanges"[\s\S]*@update-field="updateConfigFormField"[\s\S]*@save="saveConfigPatch"/,
  );
  assert.match(controlPage, /function updateConfigFormField\(field: CodexStackRuntimeConfigField, value: string \| number\): void/);
  assert.match(controlPage, /const configPatchPayload = computed<CodexStackConfigPatchRequest>/);
  assert.match(controlPage, /async function saveConfigPatch\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /v-model(?:\.number)?="configForm\.(defaultModel|contextMode|contextWindowTokens|cpaPort|compactPort|ccConnectProject|cpaProxyKey|upstreamBaseUrl|upstreamApiKey|providerProxyUrl|noProxy)"/);
  assert.match(runtimeConfigCard, /export interface CodexStackRuntimeConfigDraft/);
  assert.match(runtimeConfigCard, /defineEmits<[\s\S]*updateField: \[field: CodexStackRuntimeConfigField, value: string \| number\]/);
  assert.match(runtimeConfigCard, /@click="\$emit\('save'\)"/);
  assert.doesNotMatch(runtimeConfigCard, /patchCodexStackConfig|configPatchPayload|saveConfigPatch/);
});

test("codex stack settings page delegates environment reference without moving summary ownership", () => {
  assert.match(controlPage, /import CodexStackEnvironmentReferenceCard from "\.\/CodexStackEnvironmentReferenceCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackEnvironmentReferenceCard[\s\S]*:home-dir="summary\.homeDir"[\s\S]*:profile-path="summary\.profilePath"[\s\S]*:installer-root="summary\.installer\.root"[\s\S]*:installer-kind="summary\.installer\.kind"[\s\S]*:auto-setup-script="summary\.installer\.scripts\.autoSetup"[\s\S]*:health-check-script="summary\.installer\.scripts\.healthCheck"[\s\S]*:finalizer-script="summary\.installer\.scripts\.ccConnectFinalizer"[\s\S]*:proxy-key-masked="summary\.secrets\.cpaProxyKey\.masked"[\s\S]*:codex-auth-status="codexAuthStatus"[\s\S]*:context-mode="summary\.context\.mode"[\s\S]*:context-tokens-display="contextTokensDisplay"[\s\S]*:cpa-dashboard-enabled="summary\.cpaManagement\.controlPanelEnabled"[\s\S]*:cpa-dashboard-url="summary\.cpaManagement\.dashboardUrl"[\s\S]*:missing-files="summary\.installer\.missingFiles"/,
  );
  assert.match(controlPage, /const codexAuthStatus = computed\(\(\) => \{/);
  assert.match(controlPage, /const contextTokensDisplay = computed\(\(\) => \{/);
  assert.doesNotMatch(controlPage, /class="cs-kv-list"/);
  assert.doesNotMatch(controlPage, /class="cs-warning-row"/);
  assert.match(environmentReferenceCard, /defineProps<\{[\s\S]*homeDir: string;[\s\S]*profilePath: string;[\s\S]*installerRoot: string;[\s\S]*codexAuthStatus: string;[\s\S]*missingFiles: string\[\];[\s\S]*\}>/);
  assert.match(environmentReferenceCard, /Home 目录/);
  assert.match(environmentReferenceCard, /Codex auth\.json/);
  assert.doesNotMatch(environmentReferenceCard, /summary\.|fetchCodexStackSummary|loadSummary|patchCodexStackConfig|saveConfigPatch/);
});

test("codex stack summary refresh preserves dirty runtime config drafts", () => {
  assert.match(controlPage, /type ApplySummaryOptions = \{[\s\S]*preserveDirtyConfigDraft\?: boolean;[\s\S]*\};/);
  assert.match(controlPage, /const keepConfigDraft = \(options\.preserveDirtyConfigDraft \?\? true\)[\s\S]*&& hasConfigPatchChanges\.value;/);
  assert.match(controlPage, /if \(!keepConfigDraft\) hydrateConfigFormFromSummary\(normalized\);/);
  assert.match(controlPage, /async function saveConfigPatch\(\): Promise<void> \{[\s\S]*if \(response\.summary\) applySummary\(response\.summary, \{ preserveDirtyConfigDraft: false \}\);/);
});

test("codex stack summary refresh preserves dirty install drafts", () => {
  assert.match(controlPage, /preserveDirtyInstallDraft\?: boolean;/);
  assert.match(controlPage, /const hasInstallDraftChanges = computed\(\(\) => \{/);
  assert.match(controlPage, /function hydrateInstallFormFromSummary\(normalized: CodexStackSummaryPayload\): void \{/);
  assert.match(controlPage, /installForm\.upstreamBaseUrl = normalized\.proxyPolicy\.upstreamBaseUrl \|\| "";/);
  assert.match(controlPage, /const keepInstallDraft = \(options\.preserveDirtyInstallDraft \?\? true\)[\s\S]*&& hasInstallDraftChanges\.value;/);
  assert.match(controlPage, /if \(!keepInstallDraft\) hydrateInstallFormFromSummary\(normalized\);/);
  assert.match(controlPage, /finishedJob\.kind === "install" && finishedJob\.status === "succeeded"[\s\S]*hydrateInstallFormFromSummary\(summary\.value\);/);
});

test("codex stack install channel changes sync channel defaults conservatively", () => {
  assert.match(controlPage, /function installChannelDefaultModel\(channel: CodexStackChannel\): string \{/);
  assert.match(controlPage, /return channel === "official" \? "glm-5\.1" : "kimi-k2\.6";/);
  assert.match(controlPage, /function installChannelDefaultCpaPort\(channel: CodexStackChannel\): number \{/);
  assert.match(controlPage, /return channel === "official" \? 8317 : 18795;/);
  assert.match(controlPage, /function syncInstallChannelDefaults\(nextChannel: CodexStackChannel, previousChannel: CodexStackChannel\): void \{/);
  assert.match(controlPage, /installForm\.model === previousDefaultModel[\s\S]*installForm\.model = installChannelDefaultModel\(nextChannel\);/);
  assert.match(controlPage, /Number\(installForm\.cpaPort\) === previousDefaultPort[\s\S]*installForm\.cpaPort = installChannelDefaultCpaPort\(nextChannel\);/);
  assert.match(controlPage, /watch\(\(\) => installForm\.channel, \(nextChannel, previousChannel\) => \{[\s\S]*syncInstallChannelDefaults\(nextChannel, previousChannel\);/);
  assert.match(controlPage, /const modelOptions = computed\(\(\) => Array\.from\(new Set\(\[[\s\S]*"kimi-k2\.6"[\s\S]*"glm-5\.1"[\s\S]*"gpt-5\.5"/);
});

test("codex stack cc-connect refresh preserves dirty config drafts", () => {
  assert.match(controlPage, /type CcConnectLoadOptions = \{[\s\S]*preserveDirtyDrafts\?: boolean;[\s\S]*\};/);
  assert.match(controlPage, /async function loadCcConnectConfig\(silent = false, options: CcConnectLoadOptions = \{\}\): Promise<void> \{/);
  assert.match(controlPage, /const keepRawDraft = preserveDirtyDrafts[\s\S]*&& hasCcConnectRawChanges\.value;/);
  assert.match(controlPage, /const keepStructuredDraft = preserveDirtyDrafts[\s\S]*&& hasCcConnectStructuredChanges\.value;/);
  assert.match(controlPage, /if \(!keepRawDraft\) ccConnectRawDraft\.value = config\.raw;/);
  assert.match(controlPage, /if \(!keepStructuredDraft\) hydrateCcConnectStructuredDraft\(config\);/);
  assert.match(controlPage, /await loadCcConnectConfig\(true, \{ preserveDirtyDrafts: false \}\);/);
});
