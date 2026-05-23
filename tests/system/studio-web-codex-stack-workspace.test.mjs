import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const controlPage = read("apps/web-vue/src/features/codex-stack/CodexStackControlPage.vue");
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const codexStackDashboardCss = read("apps/web-vue/src/features/codex-stack/codex-stack-dashboard.css");
const ccConnectCommandBar = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectCommandBar.vue");
const ccConnectProviderPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectProviderPanel.vue");
const ccConnectProjectPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectProjectPanel.vue");
const ccConnectRawPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectRawPanel.vue");
const ccConnectRail = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectRail.vue");
const ccConnectSetupPanel = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectSetupPanel.vue");
const ccConnectStage = read("apps/web-vue/src/features/codex-stack/CodexStackCcConnectStage.vue");
const logConsole = read("apps/web-vue/src/features/codex-stack/CodexStackLogConsole.vue");
const dashboardCommandCenter = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardCommandCenter.vue");
const recommendationCard = read("apps/web-vue/src/features/codex-stack/CodexStackRecommendationCard.vue");
const dashboardInsights = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardInsights.vue");
const diagnosticsPanel = read("apps/web-vue/src/features/codex-stack/CodexStackDiagnosticsPanel.vue");
const checkOutputDialog = read("apps/web-vue/src/features/codex-stack/CodexStackCheckOutputDialog.vue");
const environmentReferenceCard = read("apps/web-vue/src/features/codex-stack/CodexStackEnvironmentReferenceCard.vue");
const installConfigPanel = read("apps/web-vue/src/features/codex-stack/CodexStackInstallConfigPanel.vue");
const installPlanCard = read("apps/web-vue/src/features/codex-stack/CodexStackInstallPlanCard.vue");
const installShell = read("apps/web-vue/src/features/codex-stack/CodexStackInstallShell.vue");
const installStrategyPanel = read("apps/web-vue/src/features/codex-stack/CodexStackInstallStrategyPanel.vue");
const jobBanner = read("apps/web-vue/src/features/codex-stack/CodexStackJobBanner.vue");
const jobProgressPanel = read("apps/web-vue/src/features/codex-stack/CodexStackJobProgressPanel.vue");
const loadingCard = read("apps/web-vue/src/features/codex-stack/CodexStackLoadingCard.vue");
const managementLockCard = read("apps/web-vue/src/features/codex-stack/CodexStackManagementLockCard.vue");
const modelCatalogCard = read("apps/web-vue/src/features/codex-stack/CodexStackModelCatalogCard.vue");
const modelRibbon = read("apps/web-vue/src/features/codex-stack/CodexStackModelRibbon.vue");
const pageHeader = read("apps/web-vue/src/features/codex-stack/CodexStackPageHeader.vue");
const repairBoard = read("apps/web-vue/src/features/codex-stack/CodexStackRepairBoard.vue");
const responsiveGrid = read("apps/web-vue/src/features/codex-stack/CodexStackResponsiveGrid.vue");
const runtimeConfigCard = read("apps/web-vue/src/features/codex-stack/CodexStackRuntimeConfigCard.vue");
const upstreamMap = read("apps/web-vue/src/features/codex-stack/CodexStackUpstreamMap.vue");
const chainMap = read("apps/web-vue/src/features/codex-stack/CodexStackChainMap.vue");
const runReadinessPanel = read("apps/web-vue/src/features/codex-stack/CodexStackRunReadinessPanel.vue");
const sectionIntro = read("apps/web-vue/src/features/codex-stack/CodexStackSectionIntro.vue");
const sectionNav = read("apps/web-vue/src/features/codex-stack/CodexStackSectionNav.vue");
const sectionStack = read("apps/web-vue/src/features/codex-stack/CodexStackSectionStack.vue");
const serviceGrid = read("apps/web-vue/src/features/codex-stack/CodexStackServiceGrid.vue");
const workspaceShell = read("apps/web-vue/src/features/codex-stack/CodexStackWorkspaceShell.vue");
const viewModel = read("apps/web-vue/src/features/codex-stack/codex-stack-view-model.ts");
const readinessAction = read("apps/web-vue/src/features/codex-stack/readiness-action.ts");
const codexStackService = read("apps/api/modules/codex-stack/service.ts");
const codexStackTypes = read("types/codex-stack.ts");

test("codex stack logs panel is isolated from the main control page", () => {
  assert.match(controlPage, /import CodexStackLogConsole from "\.\/CodexStackLogConsole\.vue";/);
  assert.match(controlPage, /<CodexStackLogConsole[\s\S]*v-model:selected-service="selectedLogService"[\s\S]*:refreshing-disabled-help="logRefreshingDisabledHelp"[\s\S]*@load="loadLogs"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-log-console"/);

  assert.match(logConsole, /export interface CodexStackLogServiceOption/);
  assert.match(logConsole, /class="cs-log-guide-panel"/);
  assert.match(logConsole, /class="cs-log-guide"/);
  assert.match(logConsole, /class="cs-log-workbench"/);
  assert.match(logConsole, /guideLabel: string;/);
  assert.match(logConsole, /guideService: string;/);
  assert.match(controlPage, /guideService: text\("选服务", "Pick Service"\)/);
  assert.match(controlPage, /guideScope: text\("定范围", "Choose Scope"\)/);
  assert.match(controlPage, /guideRead: text\("读输出", "Read Output"\)/);
  assert.match(logConsole, /refreshingDisabledHelp: string;/);
  assert.match(logConsole, /v-if="refreshing && refreshingDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
  assert.match(pageHeader, /class="page-header-row cs-page-header"/);
  assert.match(pageHeader, /class="cs-page-subtitle"/);
  assert.match(managementLockCard, /class="[^\"]*cs-management-lock-card"/);
  assert.match(managementLockCard, /\.cs-management-lock-card\s*\{/);
  assert.match(managementLockCard, /@media \(max-width: 960px\)/);
  assert.match(sectionStack, /class="cs-section-stack"/);
  assert.match(sectionStack, /\.cs-section-stack\s*\{/);
  assert.match(responsiveGrid, /class="cs-responsive-grid"/);
  assert.match(responsiveGrid, /\.cs-responsive-grid\s*\{/);
  assert.match(responsiveGrid, /@media \(max-width: 960px\)/);
  assert.match(dashboardCommandCenter, /class="cs-command-center"/);
  assert.match(dashboardCommandCenter, /import "\.\/codex-stack-dashboard\.css";/);
  assert.doesNotMatch(dashboardCommandCenter, /<style scoped>/);
  assert.match(codexStackDashboardCss, /\.cs-readiness-bar\s*\{/);
  assert.match(codexStackDashboardCss, /@media \(max-width: 1180px\)/);
  assert.match(dashboardCommandCenter, /class="cs-command-center"/);
  assert.match(codexStackDashboardCss, /\.cs-command-status-row\s*\{/);
  assert.match(codexStackDashboardCss, /\.cs-command-actions\s*\{/);
  assert.match(codexStackDashboardCss, /\.cs-command-center \.cs-status-pill/);
  assert.match(diagnosticsPanel, /class="[^\"]*cs-diagnostics-panel"/);
  assert.match(diagnosticsPanel, /\.cs-warning-list\s*\{/);
  assert.match(checkOutputDialog, /class="cs-check-dialog-backdrop"/);
  assert.match(checkOutputDialog, /role="dialog"/);
  assert.match(checkOutputDialog, /function stripAnsi\(value: string\): string/);
  assert.match(environmentReferenceCard, /class="[^\"]*cs-environment-reference-card"/);
  assert.match(environmentReferenceCard, /\.cs-kv-list\s*\{/);
  assert.match(environmentReferenceCard, /\.cs-warning-list\s*\{/);
  assert.match(environmentReferenceCard, /@media \(max-width: 960px\)/);
  assert.match(installConfigPanel, /class="cs-install-config-panel"/);
  assert.match(installConfigPanel, /\.cs-install-grid\s*\{/);
  assert.match(installConfigPanel, /@media \(max-width: 960px\)/);
  assert.match(installPlanCard, /class="[^\"]*cs-install-plan-card"/);
  assert.match(installPlanCard, /\.cs-install-plan-list\s*\{/);
  assert.match(installPlanCard, /@media \(max-width: 960px\)/);
  assert.match(installShell, /class="cs-install-shell"/);
  assert.match(installShell, /class="cs-install-guide"/);
  assert.match(installShell, /class="cs-install-workflow"/);
  assert.match(installShell, /执行日志会在右下角浮层展示/);
  assert.match(installStrategyPanel, /class="cs-install-strategy-panel"/);
  assert.match(installStrategyPanel, /\.cs-component-mode-list\s*\{/);
  assert.match(installStrategyPanel, /\.cs-install-cta-card\s*\{/);
  assert.match(installStrategyPanel, /@media \(max-width: 960px\)/);
  assert.match(jobBanner, /class="[^\"]*cs-job-banner"/);
  assert.match(jobBanner, /\.cs-job-banner-live\s*\{/);
  assert.match(jobBanner, /@media \(max-width: 960px\)/);
  assert.match(jobProgressPanel, /cs-progress-log-shell/);
  assert.match(jobProgressPanel, /\.cs-progress-log\s*\{/);
  assert.match(jobProgressPanel, /@media \(max-width: 960px\)/);
  assert.doesNotMatch(jobProgressPanel, /cs-install-overlay/);
  assert.match(jobProgressPanel, /cs-job-progress-dock/);
  assert.match(jobProgressPanel, /\.cs-job-progress-track\s*\{/);
  assert.match(jobProgressPanel, /@media \(max-width: 960px\)/);
  assert.match(loadingCard, /class="[^\"]*cs-loading-card"/);
  assert.match(loadingCard, /\.cs-loading-card\s*\{/);
  assert.match(modelCatalogCard, /class="[^\"]*cs-model-catalog-card"/);
  assert.match(modelCatalogCard, /\.cs-field-hint\s*\{/);
  assert.match(modelCatalogCard, /\.cs-model-list\s*\{/);
  assert.match(modelCatalogCard, /\.cs-model-current\s*\{/);
  assert.match(modelCatalogCard, /@media \(max-width: 960px\)/);
  assert.match(modelRibbon, /class="[^\"]*cs-model-ribbon"/);
  assert.match(modelRibbon, /\.cs-model-ribbon-side\s*\{/);
  assert.match(modelRibbon, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(modelRibbon, /@media \(max-width: 960px\)/);
  assert.match(repairBoard, /class="[^\"]*cs-repair-board"/);
  assert.match(repairBoard, /\.cs-repair-grid\s*\{/);
  assert.match(repairBoard, /@media \(max-width: 960px\)/);
  assert.match(runtimeConfigCard, /class="[^\"]*cs-runtime-config-card"/);
  assert.match(runtimeConfigCard, /\.cs-form-grid\s*\{/);
  assert.match(runtimeConfigCard, /@media \(max-width: 960px\)/);
  assert.match(upstreamMap, /class="[^\"]*cs-upstream-map"/);
  assert.match(upstreamMap, /\.cs-upstream-grid\s*\{/);
  assert.match(upstreamMap, /@media \(max-width: 960px\)/);
  assert.match(dashboardInsights, /class="cs-dashboard-insights"/);
  assert.match(dashboardInsights, /class="cs-dashboard-runtime"/);
  assert.match(dashboardInsights, /class="cs-component-row"/);
  assert.match(dashboardInsights, /import "\.\/codex-stack-dashboard\.css";/);
  assert.doesNotMatch(dashboardInsights, /<style scoped>/);
  assert.doesNotMatch(dashboardInsights, /cs-dashboard-grid|cs-card-header|cs-component-card/);
  assert.match(codexStackDashboardCss, /\.cs-dashboard-insights\s*\{/);
  assert.match(codexStackDashboardCss, /\.cs-runtime-ledger\s*\{/);
  assert.match(codexStackDashboardCss, /\.cs-component-row\s*\{/);
  assert.match(codexStackDashboardCss, /\.cs-dashboard-insights \.cs-status-pill\.tone-sage\s*\{/);
  assert.match(chainMap, /export interface CodexStackChainNode/);
  assert.match(chainMap, /\.cs-chain-line\s*\{/);
  assert.match(chainMap, /\.cs-chain-gates\s*\{/);
  assert.match(chainMap, /\.cs-chain-warning-strip\s*\{/);
  assert.match(runReadinessPanel, /class="[^\"]*cs-run-readiness-card"/);
  assert.match(runReadinessPanel, /\.cs-run-focus\s*\{/);
  assert.match(runReadinessPanel, /\.cs-run-mode-strip\s*\{/);
  assert.match(runReadinessPanel, /\.cs-run-check-details\s*\{/);
  assert.match(runReadinessPanel, /\.cs-run-check-grid\s*\{/);
  assert.match(runReadinessPanel, /@media \(max-width: 960px\)/);
  assert.match(sectionIntro, /class="[^\"]*cs-section-intro"/);
  assert.match(sectionIntro, /\.cs-section-copy\s*\{/);
  assert.match(sectionIntro, /\.cs-chip-row\s*\{/);
  assert.match(sectionIntro, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(sectionIntro, /@media \(max-width: 960px\)/);
  assert.match(sectionNav, /class="cs-section-tabs"/);
  assert.match(sectionNav, /class="cs-tab-button"/);
  assert.match(sectionNav, /\.cs-tab-button-active\s*\{/);
  assert.match(sectionNav, /@media \(max-width: 960px\)/);
  assert.match(workspaceShell, /class="cs-workspace"/);
  assert.match(controlPage, /import "\.\/codex-stack-workspace\.css";/);
  assert.doesNotMatch(controlPage, /<style scoped>/);
  assert.match(codexStackWorkspaceCss, /\.codex-stack-page\s*\{/);
  assert.match(codexStackWorkspaceCss, /\.cs-dashboard-details-panel\s*,\s*\n\.cs-install-options-panel|\.cs-install-options-panel,\s*\n\.cs-dashboard-details-panel/);
  assert.match(codexStackWorkspaceCss, /\.cs-dashboard-details-body\s*\{/);
  assert.match(codexStackWorkspaceCss, /@media \(max-width: 760px\)/);
  assert.match(workspaceShell, /class="cs-content"/);
  assert.doesNotMatch(workspaceShell, /@media \(max-width: 960px\)/);
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
  assert.match(ccConnectRail, /class="[^\"]*cs-agent-rail"/);
  assert.match(ccConnectRail, /\.cs-agent-pane-switch\s*\{/);
  assert.match(ccConnectRail, /\.cs-agent-project-pill\s*\{/);
  assert.match(ccConnectRail, /@media \(max-width: 960px\)/);
  assert.match(ccConnectSetupPanel, /class="cs-cc-setup-panel"/);
  assert.match(ccConnectSetupPanel, /\.cs-code\s*\{/);
  assert.match(ccConnectSetupPanel, /@media \(max-width: 960px\)/);
  assert.match(ccConnectStage, /class="cs-agent-workbench"/);
  assert.match(ccConnectStage, /class="[^\"]*cs-agent-stage"/);
  assert.match(ccConnectStage, /@media \(max-width: 960px\)/);
  assert.match(logConsole, /\.cs-section-kicker\s*\{/);
  assert.match(logConsole, /\.cs-info-chip,\s*\n\.cs-status-pill\s*\{/);
});

test("codex stack page chrome delegates refresh and management enable without moving actions", () => {
  assert.match(controlPage, /import CodexStackPageHeader from "\.\/CodexStackPageHeader\.vue";/);
  assert.match(controlPage, /import CodexStackManagementLockCard from "\.\/CodexStackManagementLockCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackPageHeader[\s\S]*:refresh-label="loading \? text\('刷新中\.\.\.', 'Refreshing\.\.\.'\) : text\('刷新状态', 'Refresh'\)"[\s\S]*:refresh-disabled="loading \|\| ccConnectLoading"[\s\S]*:refresh-disabled-help="refreshDisabledHelp"[\s\S]*@refresh="loadAll"/,
  );
  assert.match(
    controlPage,
    /<CodexStackManagementLockCard[\s\S]*v-if="summary && !summary\.management\.enabled"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="managementBusyDisabledHelp"[\s\S]*@enable="enableManagement"/,
  );
  assert.doesNotMatch(controlPage, /class="cs-page-subtitle"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-lock-card"/);
  assert.match(controlPage, /async function loadAll/);
  assert.match(controlPage, /async function enableManagement/);
  assert.match(pageHeader, /refreshDisabledHelp: string;/);
  assert.match(pageHeader, /v-if="refreshDisabled && refreshDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(managementLockCard, /busyDisabledHelp: string;/);
  assert.match(managementLockCard, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(pageHeader, /defineEmits<\{[\s\S]*refresh: \[\];[\s\S]*\}>/);
  assert.match(pageHeader, /@click="\$emit\('refresh'\)"/);
  assert.doesNotMatch(pageHeader, /loadAll|summary|fetchCodexStackSummary|enableManagement|serviceAction|patchCodexStackConfig/);
  assert.match(managementLockCard, /defineEmits<\{[\s\S]*enable: \[\];[\s\S]*\}>/);
  assert.match(managementLockCard, /@click="\$emit\('enable'\)"/);
  assert.doesNotMatch(managementLockCard, /loadAll|summary|fetchCodexStackSummary|enableManagement|serviceAction|patchCodexStackConfig/);
});

test("codex stack section layout wrappers own repeated layout without moving actions", () => {
  assert.match(controlPage, /import CodexStackSectionStack from "\.\/CodexStackSectionStack\.vue";/);
  assert.match(controlPage, /import CodexStackResponsiveGrid from "\.\/CodexStackResponsiveGrid\.vue";/);
  assert.equal((controlPage.match(/<CodexStackSectionStack>/g) || []).length, 5);
  assert.equal((controlPage.match(/<CodexStackResponsiveGrid>/g) || []).length, 1);
  assert.match(
    controlPage,
    /<CodexStackResponsiveGrid>[\s\S]*<CodexStackRuntimeConfigCard[\s\S]*<CodexStackEnvironmentReferenceCard[\s\S]*<\/CodexStackResponsiveGrid>/,
  );
  assert.doesNotMatch(controlPage, /class="cs-section-stack"/);
  assert.doesNotMatch(controlPage, /class="cs-dashboard-grid"/);
  assert.doesNotMatch(controlPage, /\.cs-section-stack|\.cs-dashboard-grid|\.cs-card-header|\.cs-form-grid|\.cs-chip|\.cs-actions/);
  assert.match(sectionStack, /<slot \/>/);
  assert.match(responsiveGrid, /<slot \/>/);
  assert.doesNotMatch(sectionStack, /activeSection|loadAll|fetchCodexStackSummary|patchCodexStackConfig|serviceAction|enableManagement/);
  assert.doesNotMatch(responsiveGrid, /activeSection|loadAll|fetchCodexStackSummary|patchCodexStackConfig|serviceAction|enableManagement/);
  assert.match(controlPage, /async function loadAll/);
  assert.match(controlPage, /async function enableManagement/);
  assert.match(controlPage, /async function serviceAction/);
});

test("codex stack loading and install shell wrappers preserve display-only boundaries", () => {
  assert.match(controlPage, /import CodexStackLoadingCard from "\.\/CodexStackLoadingCard\.vue";/);
  assert.match(controlPage, /import CodexStackInstallShell from "\.\/CodexStackInstallShell\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackLoadingCard[\s\S]*v-if="!summary"[\s\S]*:message="text\('正在读取 Codex 栈状态\.\.\.', 'Loading Codex Stack status\.\.\.'\)"/,
  );
  assert.match(
    controlPage,
    /<CodexStackInstallShell :busy="Boolean\(activeJob && isCodexStackJobRunning\(activeJob\)\)">[\s\S]*<CodexStackRepairBoard[\s\S]*<\/CodexStackInstallShell>/,
  );
  assert.doesNotMatch(controlPage, /surface="overlay"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-empty"/);
  assert.doesNotMatch(controlPage, /class="cs-install-shell"/);
  assert.doesNotMatch(controlPage, /\.cs-empty|\.cs-install-shell/);
  assert.match(loadingCard, /defineProps<\{[\s\S]*message: string;[\s\S]*\}>/);
  assert.match(installShell, /defineProps<\{[\s\S]*busy: boolean;[\s\S]*\}>/);
  assert.match(installShell, /<slot \/>/);
  assert.doesNotMatch(loadingCard, /summary|activeJob|loadAll|fetchCodexStackSummary|patchCodexStackConfig|serviceAction|enableManagement/);
  assert.doesNotMatch(installShell, /activeJob|isCodexStackJobRunning|loadAll|fetchCodexStackSummary|patchCodexStackConfig|serviceAction|enableManagement/);
  assert.match(controlPage, /async function loadAll/);
  assert.match(controlPage, /async function serviceAction/);
});

test("codex stack section nav delegates tab switching without moving content routing", () => {
  assert.match(controlPage, /import type \{ CodexStackSectionId, CodexStackSectionNavItem \} from "\.\/CodexStackSectionNav\.vue";/);
  assert.match(controlPage, /import CodexStackWorkspaceShell from "\.\/CodexStackWorkspaceShell\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackWorkspaceShell[\s\S]*:sections="navSections"[\s\S]*:active-section="activeSection"[\s\S]*:focus-hint="workspaceFocusHint"[\s\S]*@select="selectWorkspaceSection"/,
  );
  assert.match(controlPage, /type SectionId = CodexStackSectionId;/);
  assert.match(controlPage, /const activeSection = ref<SectionId>\("dashboard"\);/);
  assert.match(controlPage, /const workspaceFocusHint = ref<CodexStackWorkspaceFocusHint \| null>\(null\);/);
  assert.match(controlPage, /function setWorkspaceSection\(section: SectionId, focusHint: CodexStackWorkspaceFocusHint \| null = null\): void/);
  assert.match(controlPage, /function selectWorkspaceSection\(section: SectionId\): void/);
  assert.match(controlPage, /function focusHintForAction\(/);
  assert.match(controlPage, /const navSections = computed<CodexStackSectionNavItem\[\]>\(\(\) => \{/);
  assert.match(controlPage, /const recommendedSection = activeRecommendation\.value\?\.section \|\| "dashboard";/);
  assert.match(controlPage, /const componentIssues = current\?\.components\.filter\(\(component\) => component\.status !== "ok"\)\.length \|\| 0;/);
  assert.match(controlPage, /const settingsNeedsReview = Boolean\(current && \(/);
  assert.match(controlPage, /const targetModel = current\?\.profile\.defaultModel \|\| current\?\.models\.current \|\| current\?\.models\.defaultModel \|\| "";/);
  assert.match(controlPage, /!isSmokeMatrixFreshAndComplete\(matrix, targetModel\)/);
  assert.match(controlPage, /recommended: recommendedSection === "settings"/);
  assert.match(controlPage, /runReadinessLevelShortLabel/);
  assert.match(controlPage, /<template v-if="activeSection === 'dashboard'">/);
  assert.match(controlPage, /<template v-else-if="activeSection === 'install'">/);
  assert.match(controlPage, /<template v-else-if="activeSection === 'cc-connect'">/);
  assert.match(controlPage, /<template v-else-if="activeSection === 'settings'">/);
  assert.match(controlPage, /<template v-else-if="activeSection === 'logs'">/);
  assert.doesNotMatch(controlPage, /class="cs-workspace"/);
  assert.doesNotMatch(controlPage, /class="cs-content"/);
  assert.doesNotMatch(controlPage, /class="cs-sidebar"/);
  assert.doesNotMatch(controlPage, /class="cs-nav-button"/);
  assert.match(workspaceShell, /import CodexStackSectionNav from "\.\/CodexStackSectionNav\.vue";/);
  assert.match(workspaceShell, /<CodexStackSectionNav[\s\S]*:sections="sections"[\s\S]*:active-section="activeSection"[\s\S]*@select="\$emit\('select', \$event\)"/);
  assert.match(workspaceShell, /export interface CodexStackWorkspaceFocusHint/);
  assert.match(workspaceShell, /focusHint\?: CodexStackWorkspaceFocusHint \| null;/);
  assert.match(workspaceShell, /v-if="focusHint"/);
  assert.match(workspaceShell, /class="cs-workspace-focus"/);
  assert.match(workspaceShell, /<slot \/>/);
  assert.match(workspaceShell, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(workspaceShell, /defineEmits<\{[\s\S]*select: \[sectionId: CodexStackSectionId\];[\s\S]*\}>/);
  assert.doesNotMatch(workspaceShell, /activeSection\.value|nextActionPrimary|runReadinessCheckAction|loadSummary|fetchCodexStackSummary|patchCodexStackConfig|serviceAction/);
  assert.match(sectionNav, /<nav class="cs-section-tabs" aria-label="Codex Stack sections">/);
  assert.match(sectionNav, /export type CodexStackSectionId = "dashboard" \| "install" \| "cc-connect" \| "settings" \| "logs";/);
  assert.match(sectionNav, /export interface CodexStackSectionNavItem/);
  assert.match(sectionNav, /meta: string;/);
  assert.match(sectionNav, /badge: string;/);
  assert.match(sectionNav, /recommended: boolean;/);
  assert.match(sectionNav, /recommendedLabel: string;/);
  assert.match(sectionNav, /section\.recommended/);
  assert.match(sectionNav, /section\.meta/);
  assert.match(sectionNav, /section\.badge/);
  assert.match(sectionNav, /cs-section-tabs/);
  assert.match(sectionNav, /cs-tab-button/);
  assert.match(sectionNav, /cs-nav-recommended/);
  assert.match(sectionNav, /cs-nav-badge/);
  assert.match(sectionNav, /defineEmits<\{[\s\S]*select: \[sectionId: CodexStackSectionId\];[\s\S]*\}>/);
  assert.match(sectionNav, /@click="\$emit\('select', section\.id\)"/);
  assert.doesNotMatch(sectionNav, /cs-sidebar|cs-nav-button/);
  assert.doesNotMatch(sectionNav, /activeSection\.value|nextActionPrimary|runReadinessCheckAction|loadSummary|fetchCodexStackSummary|patchCodexStackConfig|serviceAction/);
});

test("codex stack section intros delegate repeated page copy without moving derived chips", () => {
  assert.match(controlPage, /import CodexStackSectionIntro from "\.\/CodexStackSectionIntro\.vue";/);
  assert.match(controlPage, /import type \{ CodexStackSectionIntroChip \} from "\.\/CodexStackSectionIntro\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('安装', 'Install'\)"[\s\S]*:title="text\('安装\/修复指挥台', 'Install\/Repair Command Center'\)"[\s\S]*:copy="text\('第一次使用先走新手入口/ ,
  );
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('模型与上游', 'Models and Upstreams'\)"[\s\S]*:title="text\('统一模型、端口与上游配置', 'Unified Model, Port, and Upstream Config'\)"[\s\S]*:chips="settingsSectionIntroChips"/,
  );
  assert.match(
    controlPage,
    /<CodexStackSectionIntro[\s\S]*:kicker="text\('日志', 'Logs'\)"[\s\S]*:title="text\('控制台与日志诊断', 'Console and Log Diagnostics'\)"[\s\S]*:copy="text\('按“选服务/ ,
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
    /<CodexStackModelRibbon[\s\S]*:current-model="summary\.models\.current \|\| summary\.profile\.defaultModel \|\| '--'"[\s\S]*:source-help="modelSourceHelp"[\s\S]*:source-tone="modelSourceTone"[\s\S]*:source-label="modelSourceLabel"[\s\S]*:model-count="modelOptions\.length"[\s\S]*:context-tokens-display="contextTokensDisplay"[\s\S]*:loading="loading"[\s\S]*:loading-disabled-help="summaryRefreshDisabledHelp"[\s\S]*@reload="loadSummary"/,
  );
  assert.match(controlPage, /const modelOptions = computed\(\(\) => Array\.from\(new Set\(\[/);
  assert.match(controlPage, /const modelSourceTone = computed<CodexStackTone>\(\(\) => \{/);
  assert.match(controlPage, /async function loadSummary\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-model-ribbon"/);
  assert.doesNotMatch(controlPage, /class="cs-model-ribbon-side"/);
  assert.match(modelRibbon, /defineProps<\{[\s\S]*currentModel: string;[\s\S]*sourceHelp: string;[\s\S]*sourceTone: CodexStackTone;[\s\S]*modelCount: number;[\s\S]*loading: boolean;[\s\S]*loadingDisabledHelp: string;[\s\S]*\}>/);
  assert.match(modelRibbon, /v-if="loading && loadingDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(modelRibbon, /defineEmits<\{[\s\S]*reload: \[\];[\s\S]*\}>/);
  assert.match(modelRibbon, /@click="\$emit\('reload'\)"/);
  assert.doesNotMatch(modelRibbon, /fetchCodexStackSummary|loadSummary|summary\.models|modelOptions|modelSourceTone|modelSourceLabel/);
});

test("codex stack dashboard delegates hero actions without moving service commands", () => {
  assert.match(controlPage, /import CodexStackDashboardCommandCenter from "\.\/CodexStackDashboardCommandCenter\.vue";/);
  assert.match(controlPage, /<CodexStackDashboardCommandCenter/);
  assert.match(controlPage, /:status-label="statusLabel"/);
  assert.match(controlPage, /:status-tone="statusTone"/);
  assert.match(controlPage, /:active-service-count="activeServiceCount"/);
  assert.match(controlPage, /:service-count="serviceCount"/);
  assert.match(controlPage, /:current-model="summary\.models\.current"/);
  assert.match(controlPage, /:codex-route-label="codexRouteLabel"/);
  assert.match(controlPage, /:context-tokens-display="contextTokensDisplay"/);
  assert.match(controlPage, /:channel-label="channelLabel\(summary\.installer\.channel\)"/);
  assert.match(controlPage, /:checked-at-label="formatTimestamp\(summary\.checkedAt\)"/);
  assert.match(controlPage, /:busy="actionBusy"/);
  assert.match(controlPage, /:busy-disabled-help="actionBusyDisabledHelp"/);
  assert.match(controlPage, /:can-run-mutation="canRunMutation"/);
  assert.match(controlPage, /:mutation-disabled-help="mutationDisabledHelp"/);
  assert.match(controlPage, /:sync-disabled="loading \|\| ccConnectLoading"/);
  assert.match(controlPage, /:sync-disabled-help="refreshDisabledHelp"/);
  assert.match(controlPage, /@run-check="runCheck"/);
  assert.match(controlPage, /@repair="repairRecommended"/);
  assert.match(controlPage, /@sync="loadAll"/);
  assert.match(controlPage, /const primaryServiceIds: CodexStackServiceId\[\] = \[[\s\S]*"cli-proxy-api\.service"[\s\S]*"cpa-compact-proxy\.service"[\s\S]*"cc-connect\.service"[\s\S]*\];/);
  assert.match(controlPage, /const activeServiceCount = computed\(\(\) => countActiveServices\(primaryServices\.value\)\);/);
  assert.match(controlPage, /const serviceCount = computed\(\(\) => primaryServices\.value\.length\);/);
  assert.match(controlPage, /const codexProviderCheck = computed\(\(\) => \(/);
  assert.match(controlPage, /if \(status === "pass"\) return text\("CPA 已接入", "CPA attached"\);/);
  assert.match(controlPage, /async function runCheck\(\): Promise<void>/);
  assert.match(controlPage, /async function repairRecommended\(\): Promise<void>/);
  assert.match(controlPage, /async function loadAll\(silent = false, ccConnectOptions: CcConnectLoadOptions = \{\}\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-hero-card"/);
  assert.doesNotMatch(controlPage, /class="cs-hero-actions"/);
  assert.match(dashboardCommandCenter, /路径/);
  assert.match(dashboardCommandCenter, /服务/);
  assert.match(dashboardCommandCenter, /健康检查/);
  assert.match(dashboardCommandCenter, /defineProps<\{[\s\S]*statusLabel: string;[\s\S]*statusTone: CodexStackTone;[\s\S]*activeServiceCount: number;[\s\S]*codexRouteLabel: string;[\s\S]*busyDisabledHelp: string;[\s\S]*mutationDisabledHelp: string;[\s\S]*syncDisabled: boolean;[\s\S]*syncDisabledHelp: string;[\s\S]*\}>/);
  assert.match(dashboardCommandCenter, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-command-footer-help"/);
  assert.match(dashboardCommandCenter, /v-else-if="syncDisabled && syncDisabledHelp"[\s\S]*class="cs-command-footer-help"/);
  assert.match(dashboardCommandCenter, /v-else-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-command-footer-help"/);
  assert.match(dashboardCommandCenter, /defineEmits<\{[\s\S]*"run-check": \[\];[\s\S]*repair: \[\];[\s\S]*sync: \[\];[\s\S]*\}>/);
  assert.match(dashboardCommandCenter, /@click="\$emit\('run-check'\)"/);
  assert.match(dashboardCommandCenter, /@click="\$emit\('repair'\)"/);
  assert.match(dashboardCommandCenter, /@click="\$emit\('sync'\)"/);
  assert.doesNotMatch(dashboardCommandCenter, /runCodexStackCheck|startCodexStackRepair|fetchCodexStackSummary|fetchCcConnectConfig|loadAll|repairRecommended|runCheck/);
});

test("codex stack service grid explains global mutation locks without moving service actions", () => {
  assert.match(controlPage, /<CodexStackServiceGrid[\s\S]*:services="serviceCards"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*:labels="serviceGridLabels"[\s\S]*@service-action="serviceAction"/);
  assert.match(controlPage, /return primaryServices\.value\.map\(\(service\) => \{/);
  assert.doesNotMatch(controlPage, /return summary\.value\.services\.map\(\(service\) => \{/);
  assert.match(serviceGrid, /mutationDisabledHelp: string;/);
  assert.match(serviceGrid, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(serviceGrid, /:disabled="!canRunMutation \|\| service\.active"/);
  assert.match(serviceGrid, /:disabled="!canRunMutation \|\| !service\.active"/);
  assert.match(serviceGrid, /:disabled="!canRunMutation"/);
  assert.doesNotMatch(serviceGrid, /serviceAction\(|restartCodexStackService|fetchCodexStackSummary|repairRecommended|resumeStack/);
});

test("codex stack dashboard delegates command center without losing actions", () => {
  assert.match(controlPage, /import CodexStackDashboardCommandCenter from "\.\/CodexStackDashboardCommandCenter\.vue";/);
  assert.match(controlPage, /<CodexStackDashboardCommandCenter/);
  assert.match(controlPage, /:busy="actionBusy"/);
  assert.match(controlPage, /:ready-component-count="readyComponentCount"/);
  assert.match(controlPage, /:next-action-title="nextActionTitle"/);
  assert.match(controlPage, /:next-action-disabled-help="nextActionDisabledHelp"/);
  assert.match(controlPage, /@primary="nextActionPrimary"/);
  assert.match(controlPage, /@open-section="setWorkspaceSection\(nextActionSection, focusHintForAction\(nextActionTitle, nextActionCopy\)\)"/);
  assert.doesNotMatch(controlPage, /class="cs-command-grid"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-readiness-card"/);
  assert.match(dashboardCommandCenter, /cs-next-action-pane/);
  assert.match(dashboardCommandCenter, /nextActionDisabledHelp/);
  assert.match(dashboardCommandCenter, /props\.nextActionRequiresMutation \? !props\.canRunMutation : props\.busy/);
  assert.match(dashboardCommandCenter, /modelCatalogPreview/);
  assert.match(recommendationCard, /v-if="primaryDisabled && disabledHelp"/);
  assert.match(recommendationCard, /class="cs-disabled-help"/);
});

test("codex stack dashboard delegates diagnostics without losing run check", () => {
  assert.match(controlPage, /import CodexStackDiagnosticsPanel from "\.\/CodexStackDiagnosticsPanel\.vue";/);
  assert.match(controlPage, /import CodexStackCheckOutputDialog from "\.\/CodexStackCheckOutputDialog\.vue";/);
  assert.match(controlPage, /<CodexStackCheckOutputDialog[\s\S]*v-if="checkDialogOpen"[\s\S]*:output="checkOutput"[\s\S]*:running="healthCheckRunning"[\s\S]*@rerun="runCheck"[\s\S]*@close="checkDialogOpen = false"/);
  assert.match(controlPage, /<CodexStackDiagnosticsPanel[\s\S]*:warnings="summary\.warnings"[\s\S]*:busy="actionBusy"[\s\S]*:busy-disabled-help="actionBusyDisabledHelp"[\s\S]*@run-check="runCheck"/);
  assert.doesNotMatch(controlPage, /<CodexStackDiagnosticsPanel[\s\S]*:output="checkOutput"/);
  assert.match(controlPage, /const checkDialogOpen = ref\(false\);/);
  assert.match(controlPage, /const healthCheckRunning = ref\(false\);/);
  assert.match(controlPage, /checkDialogOpen\.value = true;[\s\S]*healthCheckRunning\.value = true;/);
  assert.match(controlPage, /healthCheckRunning\.value = false;/);
  assert.match(diagnosticsPanel, /busyDisabledHelp: string;/);
  assert.match(diagnosticsPanel, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.doesNotMatch(controlPage, /尚未运行健康检查。/);
  assert.doesNotMatch(controlPage, /class="cs-diagnostics-grid"/);
  assert.doesNotMatch(diagnosticsPanel, /<pre/);
  assert.match(diagnosticsPanel, /检查结果会以悬浮窗口展示/);
  assert.match(checkOutputDialog, /<pre class="cs-check-output">/);
  assert.match(diagnosticsPanel, /健康检查/);
  assert.match(diagnosticsPanel, /@click="\$emit\('run-check'\)"/);
  assert.match(diagnosticsPanel, /warnings\.length/);
});

test("codex stack delegates global job banner without losing navigation and dismiss actions", () => {
  assert.match(controlPage, /import CodexStackJobBanner from "\.\/CodexStackJobBanner\.vue";/);
  assert.match(controlPage, /<CodexStackJobBanner[\s\S]*v-if="activeJob"[\s\S]*:command-label="activeJob\.commandLabel"[\s\S]*:status="activeJob\.status"/);
  assert.match(controlPage, /@open-logs="setWorkspaceSection\('logs', focusHintForAction\([\s\S]*查看后台任务输出[\s\S]*@dismiss="activeJob = null"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-job-banner"/);
  assert.doesNotMatch(controlPage, /function jobStateClass/);
  assert.match(jobBanner, /const jobStateClass = computed/);
  assert.match(jobBanner, /props\.status === "succeeded"/);
  assert.match(jobBanner, /@click="\$emit\('open-logs'\)"/);
  assert.match(jobBanner, /v-if="!running"[\s\S]*@click="\$emit\('dismiss'\)"/);
});

test("codex stack install page delegates preflight plan without losing actions", () => {
  assert.match(controlPage, /import CodexStackInstallPlanCard from "\.\/CodexStackInstallPlanCard\.vue";/);
  assert.match(controlPage, /<CodexStackInstallPlanCard[\s\S]*:highlights="installPlanHighlights"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*@install-full="installFullStack"[\s\S]*@install-base="installBaseOnly"[\s\S]*@reinstall-full="reinstallFullStack"[\s\S]*@repair="repairRecommended"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-plan-card"/);
  assert.match(installPlanCard, /新手入口/);
  assert.match(installPlanCard, /不用先理解所有组件/);
  assert.match(installPlanCard, /class="cs-entry-action"/);
  assert.match(installPlanCard, /第一次使用/);
  assert.match(installPlanCard, /已经安装/);
  assert.match(controlPage, /class="cs-install-options-panel"/);
  assert.match(controlPage, /安装参数和高级安装策略/);
  assert.match(controlPage, /一般不用改；需要换模型、端口、上游或强制重装时再打开/);
  assert.match(installPlanCard, /mutationDisabledHelp: string;/);
  assert.match(installPlanCard, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(installPlanCard, /@click="\$emit\('install-full'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('install-base'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('reinstall-full'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('repair'\)"/);
});

test("codex stack install page delegates install config without moving install payload ownership", () => {
  assert.match(controlPage, /import CodexStackInstallConfigPanel from "\.\/CodexStackInstallConfigPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackInstallConfigPanel[\s\S]*:form="installForm"[\s\S]*:model-options="modelOptions"[\s\S]*:model-source-label="modelSourceLabel"[\s\S]*:context-tokens-disabled="installContextTokensDisabled"[\s\S]*:context-tokens-disabled-help="installContextTokensDisabledHelp"[\s\S]*@update-field="updateInstallFormField"/,
  );
  assert.match(controlPage, /function contextTokensDisabledHelp\(mode: ContextMode\): string/);
  assert.match(controlPage, /默认上下文不会写 model_context_window；选择自定义 token 后可编辑/);
  assert.match(controlPage, /function updateInstallFormField\(field: CodexStackInstallConfigField, value: string \| number \| boolean\): void/);
  assert.match(controlPage, /function buildInstallPayload\([\s\S]*skipCcConnect = installForm\.skipCcConnect/);
  assert.match(controlPage, /async function installFullStack\(\): Promise<void>/);
  assert.match(controlPage, /async function installBaseOnly\(\): Promise<void>/);
  assert.match(controlPage, /async function reinstallFullStack\(\): Promise<void>/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(false\)\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(true\)\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(false, \{[\s\S]*forceReinstall: true,[\s\S]*skipExisting: false/);
  assert.doesNotMatch(controlPage, /v-model(?:\.number)?="installForm\.(channel|model|cpaPort|compactPort|cpaKey|contextMode|contextWindowTokens|skipNpm|skipCcConnect|noStart|skipExisting|forceReinstall|upstreamBaseUrl|upstreamApiKey|providerProxyUrl|noProxy)"/);
  assert.match(installConfigPanel, /export interface CodexStackInstallConfigDraft/);
  assert.match(installConfigPanel, /contextTokensDisabledHelp: string;/);
  assert.match(installConfigPanel, /v-if="contextTokensDisabled && contextTokensDisabledHelp"[\s\S]*class="form-help"/);
  assert.match(installConfigPanel, /defineEmits<[\s\S]*updateField: \[field: CodexStackInstallConfigField, value: string \| number \| boolean\]/);
  assert.doesNotMatch(installConfigPanel, /startCodexStackInstall|buildInstallPayload|installFullStack|installBaseOnly/);
});

test("codex stack install page delegates component strategy and CTA without moving actions", () => {
  assert.match(controlPage, /import CodexStackInstallStrategyPanel from "\.\/CodexStackInstallStrategyPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackInstallStrategyPanel[\s\S]*:components="installComponentStrategies"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*@set-component-mode="setComponentMode"[\s\S]*@install-full="installFullStack"[\s\S]*@install-base="installBaseOnly"[\s\S]*@reinstall-full="reinstallFullStack"[\s\S]*@repair="repairRecommended"/,
  );
  assert.match(controlPage, /const installComponentStrategies = computed<CodexStackInstallComponentStrategy\[\]>/);
  assert.match(controlPage, /function setComponentMode\(componentId: CodexStackComponentId, mode: ComponentInstallMode\): void/);
  assert.match(controlPage, /async function installFullStack\(\): Promise<void>/);
  assert.match(controlPage, /async function installBaseOnly\(\): Promise<void>/);
  assert.match(controlPage, /async function reinstallFullStack\(\): Promise<void>/);
  assert.match(controlPage, /async function repairRecommended\(\): Promise<void>/);
  assert.match(controlPage, /function buildInstallPayload\([\s\S]*skipCcConnect = installForm\.skipCcConnect/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(false\)\)/);
  assert.match(controlPage, /startCodexStackInstall\(buildInstallPayload\(true\)\)/);
  assert.doesNotMatch(controlPage, /class="cs-component-mode-list"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-cta-card"/);
  assert.match(installStrategyPanel, /mutationDisabledHelp: string;/);
  assert.match(installStrategyPanel, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(installStrategyPanel, /defineEmits<[\s\S]*"set-component-mode": \[componentId: CodexStackComponentId, mode: CodexStackComponentInstallMode\]/);
  assert.match(installStrategyPanel, /@click="\$emit\('install-full'\)"/);
  assert.match(installStrategyPanel, /@click="\$emit\('install-base'\)"/);
  assert.match(installStrategyPanel, /@click="\$emit\('reinstall-full'\)"/);
  assert.match(installStrategyPanel, /@click="\$emit\('repair'\)"/);
  assert.doesNotMatch(installStrategyPanel, /startCodexStackInstall|buildInstallPayload|installFullStack|installBaseOnly|repairRecommended\(\)/);
});

test("codex stack install page delegates long job progress without losing polling ownership", () => {
  assert.match(controlPage, /import CodexStackJobProgressPanel from "\.\/CodexStackJobProgressPanel\.vue";/);
  assert.match(controlPage, /<CodexStackJobProgressPanel[\s\S]*v-if="activeJob"[\s\S]*surface="panel"[\s\S]*:job="activeJob"/);
  assert.match(controlPage, /<CodexStackJobProgressPanel[\s\S]*v-if="activeJob"[\s\S]*:job="activeJob"[\s\S]*:steps="jobProgressSteps"[\s\S]*:progress-percent="jobProgressPercent"/);
  assert.match(controlPage, /:running="isCodexStackJobRunning\(activeJob\)"[\s\S]*@dismiss="activeJob = null"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-progress"/);
  assert.doesNotMatch(controlPage, /class="cs-install-overlay"/);
  assert.doesNotMatch(controlPage, /activeSection !== 'install'/);
  assert.match(controlPage, /function startPollingJob\(job: CodexStackJob\): void/);
  assert.match(controlPage, /fetchCodexStackJob\(activeJob\.value\.id\)[\s\S]*activeJob\.value = response\.job/);
  assert.match(jobProgressPanel, /surface\?: "panel";/);
  assert.doesNotMatch(jobProgressPanel, /surface === 'overlay'/);
  assert.match(jobProgressPanel, /\.cs-job-progress-dock/);
  assert.match(jobProgressPanel, /安装或修复脚本正在后台执行，日志会持续刷新。/);
  assert.match(jobProgressPanel, /job\.logTail \|\| emptyLog/);
  assert.match(jobProgressPanel, /@click="\$emit\('dismiss'\)"/);
});

test("codex stack logs page delegates job output preview without losing polling ownership", () => {
  assert.match(controlPage, /import CodexStackJobProgressPanel from "\.\/CodexStackJobProgressPanel\.vue";/);
  assert.match(controlPage, /<CodexStackJobProgressPanel[\s\S]*v-if="activeJob"[\s\S]*:job="activeJob"[\s\S]*:steps="jobProgressSteps"[\s\S]*:progress-percent="jobProgressPercent"/);
  assert.match(controlPage, /:empty-log="text\('等待输出\.\.\.', 'Waiting for output\.\.\.'\)"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-job-output-card"/);
  assert.match(controlPage, /function startPollingJob\(job: CodexStackJob\): void/);
  assert.match(controlPage, /fetchCodexStackJob\(activeJob\.value\.id\)[\s\S]*activeJob\.value = response\.job/);
  assert.match(jobProgressPanel, /安装或修复脚本正在后台执行/);
  assert.match(jobProgressPanel, /cs-job-step-list/);
  assert.match(jobProgressPanel, /job\.logTail \|\| emptyLog/);
  assert.match(jobProgressPanel, /job\.status === "succeeded"/);
});

test("codex stack install page delegates repair board without weakening CPA attach gate", () => {
  assert.match(controlPage, /import CodexStackRepairBoard from "\.\/CodexStackRepairBoard\.vue";/);
  assert.match(controlPage, /<CodexStackRepairBoard[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*:can-attach-codex-cpa="canAttachCodexCpa"[\s\S]*:attach-codex-cpa-help="attachCodexCpaHelp"[\s\S]*:attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"[\s\S]*:attach-preflight-items="attachPreflightItems"/);
  assert.match(controlPage, /@repair-recommended="repairRecommended"[\s\S]*@repair-conflicts="repairConflictingUnits"[\s\S]*@repair-config-only="repairConfigOnly"/);
  assert.match(controlPage, /@pause-stack="pauseStack"[\s\S]*@resume-stack="resumeStack"[\s\S]*@run-smoke-matrix="runSmokeMatrix"[\s\S]*@attach-codex-cpa="applyCodexCpaAfterSmoke"[\s\S]*@restore-official-chatgpt="restoreOfficialChatGpt"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-repair-board"/);
  assert.match(repairBoard, /运行模型矩阵/);
  assert.match(repairBoard, /先修复，再验证，最后切换/);
  assert.match(repairBoard, /大多数情况下只需要按下面 3 步走/);
  assert.match(repairBoard, /class="cs-repair-guide-layout"/);
  assert.match(repairBoard, /class="cs-repair-flow"/);
  assert.match(repairBoard, /class="cs-step-number"/);
  assert.match(repairBoard, /class="cs-attach-summary"/);
  assert.match(repairBoard, /class="cs-advanced-repair"/);
  assert.match(repairBoard, /高级操作：冲突、重写配置、暂停\/恢复/);
  assert.match(repairBoard, /当前默认 CPA 模型必须通过普通、非流式、流式和压缩上下文/);
  assert.match(repairBoard, /用户可选择官方 GPT 登录路径，也可选择 GPT 或国内兼容模型走 CPA/);
  assert.match(repairBoard, /官方 ChatGPT 路径会使用 GPT 官方模型；CPA 路径可使用 GPT 或国内兼容模型/);
  assert.match(repairBoard, /@click="\$emit\('restore-official-chatgpt'\)"/);
  assert.match(repairBoard, /export interface CodexStackAttachPreflightItem/);
  assert.match(repairBoard, /mutationDisabledHelp: string;/);
  assert.match(repairBoard, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(repairBoard, /attachPreflightItems: CodexStackAttachPreflightItem\[\];/);
  assert.match(repairBoard, /attachCodexCpaDisabledHelp: string;/);
  assert.match(repairBoard, /v-for="item in attachPreflightItems"/);
  assert.match(repairBoard, /class="cs-attach-preflight-list"/);
  assert.match(repairBoard, /:disabled="!canAttachCodexCpa"[\s\S]*@click="\$emit\('attach-codex-cpa'\)"/);
  assert.match(repairBoard, /v-if="!canAttachCodexCpa && attachCodexCpaDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(controlPage, /async function restoreOfficialChatGpt\(\): Promise<void>/);
  assert.match(controlPage, /\["restore-official-chatgpt"\]/);
  assert.match(controlPage, /\["force-apply-codex-cpa"\]/);
});

test("codex stack cc-connect page delegates command bar without moving config writes", () => {
  assert.match(controlPage, /import CodexStackCcConnectCommandBar from "\.\/CodexStackCcConnectCommandBar\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectCommandBar[\s\S]*:installed="summary\.ccConnect\.installed"[\s\S]*:configured="summary\.ccConnect\.configured"[\s\S]*:binding-present="summary\.ccConnect\.bindingPresent"[\s\S]*:finalizer-available="summary\.ccConnect\.finalizerAvailable"[\s\S]*:project-name="primaryCcConnectProjectName"[\s\S]*:provider-count="ccConnectProviderDraftCount"[\s\S]*:project-count="ccConnectProjectDraftCount"[\s\S]*:has-structured-changes="hasCcConnectStructuredChanges"[\s\S]*:has-raw-changes="hasCcConnectRawChanges"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*@save-structured="saveCcConnectStructured"[\s\S]*@save-raw="saveCcConnectRaw"/,
  );
  assert.doesNotMatch(controlPage, /class="panel-card cs-config-action-strip cs-agent-savebar"/);
  assert.match(controlPage, /async function saveCcConnectStructured\(\): Promise<void>/);
  assert.match(controlPage, /async function saveCcConnectRaw\(\): Promise<void>/);
  assert.match(controlPage, /patchCcConnectConfig\(\{[\s\S]*providers: normalizeProviderDrafts\(\),[\s\S]*projects: normalizeProjectDrafts\(\)/);
  assert.match(controlPage, /patchCcConnectConfig\(\{ raw: ccConnectRawDraft\.value \}\)/);
  assert.match(ccConnectCommandBar, /mutationDisabledHelp: string;/);
  assert.match(ccConnectCommandBar, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(ccConnectCommandBar, /const saveDisabledHelp = computed\(\(\) => \{/);
  assert.match(ccConnectCommandBar, /可视化配置和 TOML 均已同步；修改后才能保存/);
  assert.match(ccConnectCommandBar, /v-else-if="saveDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(ccConnectCommandBar, /defineEmits<[\s\S]*"save-structured": \[\];[\s\S]*"save-raw": \[\]/);
  assert.match(ccConnectCommandBar, /@click="\$emit\('save-structured'\)"/);
  assert.match(ccConnectCommandBar, /@click="\$emit\('save-raw'\)"/);
  assert.doesNotMatch(ccConnectCommandBar, /patchCcConnectConfig|saveCcConnectStructured|saveCcConnectRaw|normalizeProviderDrafts|normalizeProjectDrafts/);
});

test("codex stack cc-connect page delegates provider editor without moving provider drafts", () => {
  assert.match(controlPage, /import CodexStackCcConnectProviderPanel from "\.\/CodexStackCcConnectProviderPanel\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectProviderPanel[\s\S]*:language="ccConnectLanguageDraft"[\s\S]*:providers="ccConnectProviderDrafts"[\s\S]*:compact-proxy-base-url="compactProxyBaseUrl"[\s\S]*:loading="ccConnectLoading && !ccConnectConfig"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="busyDisabledHelp"[\s\S]*@update-language="updateCcConnectLanguage"[\s\S]*@update-provider-field="updateCcConnectProviderField"[\s\S]*@ensure-cpa-provider="ensureCpaProviderDraft"[\s\S]*@add-provider="addCcConnectProvider"[\s\S]*@remove-provider="removeCcConnectProvider"/,
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
  assert.match(ccConnectProviderPanel, /busyDisabledHelp: string;/);
  assert.match(ccConnectProviderPanel, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
    /<CodexStackCcConnectProjectPanel[\s\S]*:project="selectedProjectDraft"[\s\S]*:project-summary="selectedProjectSummary"[\s\S]*:presets="projectPresetCards"[\s\S]*:platform-templates="platformTemplates"[\s\S]*:model-options="modelOptions"[\s\S]*:loading="ccConnectLoading && !ccConnectConfig"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="busyDisabledHelp"[\s\S]*@sync-default-model="applyDefaultModelToCcConnectProjects"[\s\S]*@remove-project="removeCcConnectProject"[\s\S]*@add-preset="addCcConnectProjectPreset"[\s\S]*@add-project="addCcConnectProject"[\s\S]*@update-project-field="updateCcConnectProjectField"[\s\S]*@update-agent-option="updateCcConnectAgentOption"[\s\S]*@add-platform="addPlatformToSelectedProject"[\s\S]*@remove-platform="removePlatformFromSelectedProject"[\s\S]*@update-platform-type="updateCcConnectPlatformType"[\s\S]*@update-platform-option="updateCcConnectPlatformOption"[\s\S]*@add-platform-option="addCcConnectPlatformOptionById"[\s\S]*@remove-platform-option="removeCcConnectPlatformOptionById"/,
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
  assert.match(ccConnectProjectPanel, /busyDisabledHelp: string;/);
  assert.match(ccConnectProjectPanel, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
    /<CodexStackCcConnectRawPanel[\s\S]*:raw-draft="ccConnectRawDraft"[\s\S]*:has-raw-changes="hasCcConnectRawChanges"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*@update-raw="updateCcConnectRawDraft"[\s\S]*@save-raw="saveCcConnectRaw"/,
  );
  assert.match(controlPage, /function updateCcConnectRawDraft\(raw: string\): void/);
  assert.match(controlPage, /async function saveCcConnectRaw\(\): Promise<void>/);
  assert.match(controlPage, /patchCcConnectConfig\(\{ raw: ccConnectRawDraft\.value \}\)/);
  assert.doesNotMatch(controlPage, /v-model="ccConnectRawDraft"/);
  assert.doesNotMatch(controlPage, /class="cs-raw-editor"/);
  assert.match(ccConnectRawPanel, /defineProps<\{[\s\S]*rawDraft: string;[\s\S]*hasRawChanges: boolean;[\s\S]*canRunMutation: boolean;[\s\S]*mutationDisabledHelp: string;[\s\S]*\}>/);
  assert.match(ccConnectRawPanel, /v-if="!canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(ccConnectRawPanel, /const saveDisabledHelp = computed\(\(\) => \(/);
  assert.match(ccConnectRawPanel, /TOML 已同步；修改原始配置后才能保存/);
  assert.match(ccConnectRawPanel, /v-else-if="saveDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(ccConnectRawPanel, /defineEmits<\{[\s\S]*"update-raw": \[raw: string\];[\s\S]*"save-raw": \[\];[\s\S]*\}>/);
  assert.match(ccConnectRawPanel, /@input="\$emit\('update-raw', textareaValue\(\$event\)\)"/);
  assert.match(ccConnectRawPanel, /@click="\$emit\('save-raw'\)"/);
  assert.doesNotMatch(ccConnectRawPanel, /ccConnectRawDraft|patchCcConnectConfig|saveCcConnectRaw|saveCcConnectStructured|normalizeProviderDrafts|normalizeProjectDrafts/);
});

test("codex stack cc-connect page delegates rail navigation without moving drafts", () => {
  assert.match(controlPage, /import CodexStackCcConnectStage from "\.\/CodexStackCcConnectStage\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackCcConnectStage[\s\S]*:panes="agentPanes"[\s\S]*:active-pane="activeAgentPane"[\s\S]*:projects="ccConnectProjectRailItems"[\s\S]*:selected-project-id="selectedProjectDraft\?\.id \|\| ''"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="busyDisabledHelp"[\s\S]*@set-active-pane="setActiveAgentPane"[\s\S]*@select-project="selectCcConnectProject"[\s\S]*@add-project="addCcConnectProject"/,
  );
  assert.match(ccConnectStage, /import CodexStackCcConnectRail from "\.\/CodexStackCcConnectRail\.vue";/);
  assert.match(ccConnectStage, /<CodexStackCcConnectRail[\s\S]*:panes="panes"[\s\S]*:active-pane="activePane"[\s\S]*:projects="projects"[\s\S]*:selected-project-id="selectedProjectId"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="busyDisabledHelp"/);
  assert.match(ccConnectStage, /busyDisabledHelp: string;/);
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
  assert.match(ccConnectRail, /busyDisabledHelp: string;/);
  assert.match(ccConnectRail, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
    /<CodexStackCcConnectSetupPanel[\s\S]*:commands="ccConnectSetupCommands"[\s\S]*:busy="busy"[\s\S]*:busy-disabled-help="busyDisabledHelp"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*:can-finalize="summary\.ccConnect\.canFinalize"[\s\S]*@copy-setup="copySetupCommand"[\s\S]*@finalize="finalizeCcConnect"/,
  );
  assert.match(controlPage, /async function copySetupCommand\(platform: CodexStackCcConnectSetupPlatform\): Promise<void>/);
  assert.match(controlPage, /async function finalizeCcConnect\(\): Promise<void>/);
  assert.match(controlPage, /finalizeCodexStackCcConnect\(\{ project: summary\.value\?\.ccConnect\.project \|\| "main" \}\)/);
  assert.match(controlPage, /const busyDisabledHelp = computed\(\(\) => \(/);
  assert.match(controlPage, /当前操作仍在进行中，完成后再编辑 Agent 配置/);
  assert.match(ccConnectSetupPanel, /busyDisabledHelp: string;/);
  assert.match(ccConnectSetupPanel, /v-if="busy && busyDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(ccConnectSetupPanel, /mutationDisabledHelp: string;/);
  assert.match(ccConnectSetupPanel, /v-if="canFinalize && !canRunMutation && mutationDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
  assert.match(controlPage, /<details class="cs-dashboard-details-panel">[\s\S]*高级状态详情/);
  assert.match(controlPage, /技术链路、服务单元、组件健康和健康检查入口默认收起/);
  assert.match(controlPage, /<CodexStackChainMap[\s\S]*:nodes="chainNodes"[\s\S]*:gates="chainGates"[\s\S]*:warnings="chainWarnings"/);
  assert.match(controlPage, /const chainNodes = computed<CodexStackChainNode\[\]>/);
  assert.match(controlPage, /const chainWarnings = computed\(\(\) => summary\.value\?\.warnings\.slice\(0, 3\) \|\| \[\]\);/);
  assert.match(controlPage, /function normalizeCodexStackSummary\(next: CodexStackSummaryPayload\): CodexStackSummaryPayload/);
  assert.match(controlPage, /proxyPolicy: normalizeProxyPolicy\(next\.proxyPolicy\)/);
  assert.match(controlPage, /const normalized = normalizeCodexStackSummary\(next\);/);
  assert.match(controlPage, /function isSmokeMatrixStale\(matrix: CodexStackSmokeMatrixResult \| null \| undefined\): boolean/);
  assert.match(controlPage, /const matrixFresh = isSmokeMatrixFreshAndComplete\(matrix, targetModel\);/);
  assert.match(controlPage, /matrixFresh \? text\("可切 Codex", "Attach ready"\)/);
  assert.match(controlPage, /id: "job-lock"/);
  assert.match(controlPage, /id: "smoke"/);
  assert.match(controlPage, /id: "watchdog"[\s\S]*label: text\("后台守护", "Background Watchdog"\)/);
  assert.doesNotMatch(controlPage, /label: "Watchdog"[\s\S]*暂停链路时应先停 watchdog/);
  assert.match(controlPage, /NO_PROXY 缺少/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*!policy\.noProxyLoopbackReady[\s\S]*\? "danger"/);
  assert.doesNotMatch(controlPage, /current\.proxyPolicy\.noProxyLoopbackReady/);
  assert.match(chainMap, /aria-label="Codex Stack request chain"/);
  assert.match(chainMap, /v-if="warnings\.length"/);
});

test("codex stack proxy policy displays tolerate legacy summaries without proxyPolicy", () => {
  assert.match(controlPage, /import \{[\s\S]*DEFAULT_NO_PROXY[\s\S]*normalizeProxyPolicy[\s\S]*\} from "\.\/codex-stack-view-model";/);
  assert.match(viewModel, /export const DEFAULT_NO_PROXY = "localhost,127\.0\.0\.1,::1";/);
  assert.match(viewModel, /export function findMissingNoProxyLoopback\(noProxy: string\): string\[\]/);
  assert.match(viewModel, /export function normalizeProxyPolicy\([\s\S]*policy: Partial<CodexStackSummaryPayload\["proxyPolicy"\]> \| undefined/);
  assert.match(viewModel, /noProxyLoopbackReady: typeof policy\?\.noProxyLoopbackReady === "boolean"[\s\S]*\? policy\.noProxyLoopbackReady[\s\S]*: missing\.length === 0/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*const directWithSystemProxy = policy\.providerMode === "direct"/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*if \(installForm\.upstreamBaseUrl\.trim\(\) !== \(policy\.upstreamBaseUrl \|\| ""\)\) return true;/);
  assert.match(controlPage, /const policy = normalizeProxyPolicy\(current\.proxyPolicy\);[\s\S]*if \(nextNoProxy !== \(policy\.noProxy \|\| DEFAULT_NO_PROXY\)\)/);
  assert.doesNotMatch(controlPage, /function normalizeProxyPolicy|function findMissingNoProxyLoopback|const DEFAULT_NO_PROXY =/);
  assert.doesNotMatch(controlPage, /current\.proxyPolicy\.(providerMode|providerProxyUrl|upstreamBaseUrl|noProxy)/);
  assert.doesNotMatch(controlPage, /(?:summary|current|next)\.proxyPolicy\.noProxyLoopbackReady/);
});

test("codex stack dashboard exposes explicit network mode diagnostics", () => {
  assert.match(controlPage, /:network-policy="networkPolicyCard"/);
  assert.match(controlPage, /const networkPolicyCard = computed<CodexStackNetworkPolicyCard \| null>/);
  assert.match(controlPage, /国内网关直连/);
  assert.match(controlPage, /国内直连 \+ 系统代理提示/);
  assert.match(controlPage, /网卡\/TUN 模式或系统代理可能截获 CPA\/Compact 的本机请求/);
  assert.match(controlPage, /activeRecommendation\.value\?\.reasonCodes\.includes\("no-proxy-loopback-missing"\)/);
  assert.match(controlPage, /先补齐 NO_PROXY 的 localhost、127\.0\.0\.1 和 ::1/);
  assert.match(controlPage, /OpenAI 官方 Codex 访问仍由 Codex\/系统代理路径处理/);
  assert.match(controlPage, /activeRecommendation\.value\?\.reasonCodes\.includes\("smoke-matrix-stale"\)/);
  assert.match(controlPage, /上次目标模型矩阵已超过 24 小时/);
  assert.match(controlPage, /上次目标模型矩阵失败/);
  assert.match(controlPage, /const failedChecks = model\.checks\.filter\(\(check\) => check\.status === "failed"\)/);
  assert.match(controlPage, /durationLabel: text\(`耗时 \$\{formatDurationMs\(model\.durationMs\)\}`/);
  assert.match(controlPage, /slowestCheck: slowestCheck/);
  assert.match(controlPage, /最慢：\$\{slowestCheck\.label \|\| slowestCheck\.id\}/);
  assert.match(controlPage, /function formatDurationMs\(value: number \| null \| undefined\): string/);
  assert.match(controlPage, /耗时未记录/);
  assert.match(controlPage, /durationLabel: text\("矩阵耗时", "Matrix Duration"\)/);
  assert.match(controlPage, /失败检查/);
  assert.match(controlPage, /const targetModel = currentCpaTargetModel\.value;/);
  assert.match(controlPage, /const smokeFresh = isSmokeMatrixFreshAndComplete\(matrix, targetModel\);/);
  assert.match(controlPage, /const smokeStale = isSmokeMatrixStale\(matrix\);/);
  assert.match(controlPage, /checkedAt: formatTimestamp\(matrix\.checkedAt\)/);
  assert.match(controlPage, /24 小时内完整通过/);
  assert.match(dashboardInsights, /export interface CodexStackNetworkPolicyCard/);
  assert.match(dashboardInsights, /class="cs-network-policy-strip"/);
  assert.match(dashboardInsights, /networkPolicy\.loopbackValue/);
  assert.match(dashboardInsights, /networkPolicy\.upstreamValue/);
  assert.match(dashboardInsights, /model\.failedChecks/);
  assert.match(dashboardInsights, /model\.durationLabel/);
  assert.match(dashboardInsights, /model\.slowestCheck/);
  assert.match(dashboardInsights, /class="cs-smoke-slowest-check"/);
  assert.match(dashboardInsights, /smokeMatrix\.duration/);
  assert.match(dashboardInsights, /class="cs-smoke-failed-checks"/);
  assert.match(dashboardInsights, /smokeMatrix\.checkedAt/);
  assert.match(dashboardInsights, /smokeMatrix\.freshness/);
  assert.match(dashboardInsights, /tone-\$\{smokeMatrix\.freshnessTone\}/);
});

test("codex stack dashboard exposes codex run readiness as a first-screen contract", () => {
  assert.match(controlPage, /import CodexStackRunReadinessPanel from "\.\/CodexStackRunReadinessPanel\.vue";/);
  assert.match(controlPage, /<CodexStackRunReadinessPanel[\s\S]*:readiness="summary\.runReadiness"[\s\S]*:actions-disabled="runReadinessActionsDisabled"[\s\S]*:disabled-label="runReadinessDisabledLabel"[\s\S]*@check-action="runReadinessCheckAction"[\s\S]*@mode-action="runReadinessModeAction"/);
  assert.match(controlPage, /const actionBusy = computed\(\(\) => busy\.value \|\| jobRunning\.value\);/);
  assert.match(controlPage, /const actionBusyDisabledHelp = computed\(\(\) => \{/);
  assert.match(controlPage, /const summaryRefreshDisabledHelp = computed\(\(\) => \(/);
  assert.match(controlPage, /const refreshDisabledHelp = computed\(\(\) => \{/);
  assert.match(controlPage, /const mutationDisabledHelp = computed\(\(\) => \{/);
  assert.match(controlPage, /const nextActionDisabledHelp = computed\(\(\) => \{/);
  assert.match(controlPage, /if \(nextActionRequiresMutation\.value\) \{[\s\S]*return mutationDisabledHelp\.value;/);
  assert.match(controlPage, /先启用管理动作，才能执行安装、修复或配置写入/);
  assert.match(controlPage, /已有后台任务执行中，先查看日志并等待完成/);
  assert.match(controlPage, /状态正在刷新中，请等待本轮读取完成/);
  assert.match(controlPage, /Agent 配置正在同步，请等待完成后再刷新/);
  assert.match(controlPage, /<CodexStackDashboardCommandCenter[\s\S]*:busy="actionBusy"/);
  assert.match(controlPage, /<CodexStackDiagnosticsPanel[\s\S]*:busy="actionBusy"/);
  assert.match(controlPage, /const runReadinessActionsDisabled = computed\(\(\) => busy\.value \|\| jobRunning\.value\);/);
  assert.match(controlPage, /任务执行中，先看日志/);
  assert.match(controlPage, /已有后台任务正在执行，请等待完成后再运行健康检查/);
  assert.match(controlPage, /async function runCheck\(\): Promise<void> \{[\s\S]*if \(jobRunning\.value\)/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-run-readiness-card"/);
  assert.match(runReadinessPanel, /readiness\.title/);
  assert.match(runReadinessPanel, /readiness\.modes/);
  assert.match(runReadinessPanel, /readiness\.checks/);
  assert.match(runReadinessPanel, /actionsDisabled: boolean;/);
  assert.match(runReadinessPanel, /disabledLabel: string;/);
  assert.match(runReadinessPanel, /text\("当前结论", "Current Result"\)/);
  assert.match(runReadinessPanel, /text\("下一步", "Next Step"\)/);
  assert.match(runReadinessPanel, /text\("技术检查", "Technical Checks"\)/);
  assert.match(runReadinessPanel, /const blockingChecks = computed/);
  assert.match(runReadinessPanel, /const primaryActionTarget = computed/);
  assert.match(runReadinessPanel, /function runPrimaryAction\(\): void/);
  assert.match(runReadinessPanel, /:disabled="isActionDisabled\(mode\.actionHint\)"/);
  assert.match(runReadinessPanel, /:disabled="isActionDisabled\(check\.actionHint\)"/);
  assert.match(runReadinessPanel, /actionHint\.kind !== "open-section"/);
  assert.match(runReadinessPanel, /props\.actionsDisabled/);
  assert.match(runReadinessPanel, /runReadinessLevelLabel\(readiness\.level\)/);
  assert.match(runReadinessPanel, /runReadinessModeTone\(mode\.ready, readiness\.level\)/);
  assert.match(runReadinessPanel, /runReadinessModeLabel\(mode\.ready, readiness\.level\)/);
  assert.match(runReadinessPanel, /@click="\$emit\('mode-action', mode\)"/);
  assert.match(runReadinessPanel, /mode\.actionHint\.label/);
  assert.match(runReadinessPanel, /runReadinessCheckTone\(check\.status\)/);
  assert.match(runReadinessPanel, /@click="\$emit\('check-action', check\)"/);
  assert.match(runReadinessPanel, /check\.actionHint\.label/);
  assert.match(controlPage, /normalizeCodexStackRunReadinessCheck/);
  assert.match(controlPage, /normalizeCodexStackRunReadinessMode/);
  assert.match(controlPage, /resolveCodexStackRunReadinessAction/);
  assert.match(controlPage, /resolveCodexStackRunReadinessModeAction/);
  assert.match(controlPage, /function runReadinessCheckAction\(check: CodexStackRunReadinessCheck\): void/);
  assert.match(controlPage, /function runReadinessModeAction\(mode: CodexStackRunReadinessMode\): void/);
  assert.match(controlPage, /setWorkspaceSection\(command\.section, focusHintForAction\([\s\S]*检查项：\$\{check\.label\}/);
  assert.match(controlPage, /setWorkspaceSection\(command\.section, focusHintForAction\([\s\S]*运行模式：\$\{mode\.label\}/);
  assert.match(controlPage, /runReadinessCheckTone\(check\.status\)/);
  assert.match(controlPage, /command\.type === "repair"[\s\S]*startRepairWithActions\(command\.actions/);
  assert.match(readinessAction, /export function normalizeCodexStackRunReadinessCheck/);
  assert.match(readinessAction, /export function normalizeCodexStackRunReadinessMode/);
  assert.match(readinessAction, /if \(check\.actionHint\) return check;/);
  assert.match(readinessAction, /if \(mode\.actionHint\) return mode;/);
  assert.match(readinessAction, /export function resolveCodexStackRunReadinessAction/);
  assert.match(readinessAction, /export function resolveCodexStackRunReadinessModeAction/);
  assert.match(readinessAction, /action\.kind === "repair" && action\.repairActions\?\.length/);
  assert.match(codexStackTypes, /actionHint\?: CodexStackRunReadinessActionHint;/);
  assert.match(codexStackTypes, /export interface CodexStackRunReadinessModeDependency/);
  assert.match(codexStackTypes, /dependencies\?: CodexStackRunReadinessModeDependency\[\];/);
  assert.match(runReadinessPanel, /Codex 运行就绪/);
  assert.match(codexStackService, /const baseModeDependencies = \[/);
  assert.match(codexStackService, /dependencies: dependenciesFor\(\[\.\.\.baseModeDependencies, "context-window", "job-lock"\]\)/);
  assert.match(codexStackService, /dependencies: dependenciesFor\(\[\.\.\.baseModeDependencies, "cc-agent-route"\]\)/);
  assert.match(codexStackService, /id: "cc-agent-task"/);
  assert.match(codexStackService, /label: "CC\/IM Agent 任务"/);
  assert.match(codexStackService, /label: "修复 NO_PROXY", repairActions: \["repair-no-proxy-loopback"\]/);
  assert.match(codexStackService, /label: "运行 smoke matrix", repairActions: \["run-smoke-matrix"\]/);
});

test("codex stack attach action requires a fresh passing smoke matrix in the UI", () => {
  assert.match(controlPage, /const isSmokeMatrixAttachReady = computed\(\(\) => \{/);
  assert.match(controlPage, /const currentCpaTargetModel = computed\(\(\) => summary\.value\?\.profile\.defaultModel \|\| summary\.value\?\.models\.current \|\| summary\.value\?\.models\.defaultModel \|\| ""\);/);
  assert.match(controlPage, /return isSmokeMatrixFreshAndComplete\(matrix, currentCpaTargetModel\.value\);/);
  assert.doesNotMatch(codexStackTypes, /CODEX_STACK_REQUIRED_CPA_SMOKE_MODELS/);
  assert.match(codexStackTypes, /export const CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS = \[[\s\S]*"compact-non-stream"[\s\S]*"compact-stream"[\s\S]*"compact-compact"[\s\S]*\] as const satisfies readonly CodexStackSmokeCheckId\[\];/);
  assert.doesNotMatch(controlPage, /CODEX_STACK_REQUIRED_CPA_SMOKE_MODELS|REQUIRED_CPA_SMOKE_MODELS/);
  assert.match(controlPage, /CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS/);
  assert.doesNotMatch(codexStackService, /CODEX_STACK_REQUIRED_CPA_SMOKE_MODELS|REQUIRED_CPA_SMOKE_MODELS/);
  assert.match(codexStackService, /CODEX_STACK_REQUIRED_CPA_SMOKE_CHECKS/);
  assert.match(codexStackTypes, /"restore-official-chatgpt"/);
  assert.match(codexStackTypes, /"force-apply-codex-cpa"/);
  assert.match(codexStackService, /"restore-official-chatgpt"/);
  assert.match(codexStackService, /"force-apply-codex-cpa"/);
  assert.match(controlPage, /function smokeMatrixCoversTarget\(matrix: CodexStackSmokeMatrixResult \| null \| undefined, targetModel = ""\): boolean/);
  assert.match(controlPage, /function isSmokeMatrixComplete\(matrix: CodexStackSmokeMatrixResult \| null \| undefined, targetModel = ""\): boolean/);
  assert.match(controlPage, /matrix\.attachEligible && !smokeMatrixCoversTarget\(matrix, currentCpaTargetModel\.value\)/);
  assert.match(controlPage, /matrix\.attachEligible && !isSmokeMatrixComplete\(matrix, currentCpaTargetModel\.value\)/);
  assert.match(controlPage, /const canAttachCodexCpa = computed\(\(\) => canRunMutation\.value && isSmokeMatrixAttachReady\.value\);/);
  assert.match(controlPage, /<CodexStackRepairBoard[\s\S]*:can-attach-codex-cpa="canAttachCodexCpa"[\s\S]*:attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"[\s\S]*:attach-preflight-items="attachPreflightItems"[\s\S]*@attach-codex-cpa="applyCodexCpaAfterSmoke"/);
  assert.match(controlPage, /const attachPreflightItems = computed<CodexStackAttachPreflightItem\[\]>/);
  assert.match(controlPage, /const attachCodexCpaDisabledHelp = computed\(\(\) => \{/);
  assert.match(controlPage, /const targetModel = currentCpaTargetModel\.value \|\| "--";/);
  assert.match(controlPage, /const requiredModels = matrix\?\.requiredModels\.length \? matrix\.requiredModels\.join\(", "\) : targetModel;/);
  assert.match(controlPage, /const requiredChecks = REQUIRED_CPA_SMOKE_CHECKS\.join\(", "\);/);
  assert.match(controlPage, /id: "last-matrix"/);
  assert.match(controlPage, /id: "attach-action"/);
  assert.match(controlPage, /仍会重新烟测，全部通过才写 Codex/);
  assert.match(repairBoard, /:disabled="!canAttachCodexCpa"[\s\S]*@click="\$emit\('attach-codex-cpa'\)"/);
  assert.match(controlPage, /先运行“只验证”/);
  assert.match(controlPage, /上次矩阵未覆盖当前目标模型/);
  assert.match(controlPage, /未覆盖当前目标模型，需复验/);
  assert.match(controlPage, /上次矩阵记录不完整/);
  assert.match(controlPage, /已有新鲜通过矩阵；点击后仍会重新烟测/);
  assert.match(controlPage, /只有普通请求、非流式、流式和压缩上下文全部通过，才会把 Codex 切到 CPA/);
  assert.match(controlPage, /失败时保持当前路径不变/);
  assert.match(controlPage, /不等待 smoke 通过，直接把 Codex 切到 CPA/);
});

test("codex stack recommended repair resumes a deliberately paused stack in order", () => {
  assert.match(viewModel, /const services = new Map\(summary\.services\.map\(\(service\) => \[service\.id, service\]\)\);/);
  assert.match(viewModel, /const legacyHealthcheck = services\.get\("cli-proxy-api-healthcheck\.timer"\);/);
  assert.match(viewModel, /const shouldDisableLegacyHealthcheck = legacyHealthcheck\?\.active === true \|\| legacyHealthcheck\?\.enabled === true;/);
  assert.match(viewModel, /const stackInstalled = cpa\?\.installed === true && compact\?\.installed === true && watchdog\?\.installed === true;/);
  assert.match(viewModel, /if \(stackInstalled && !cpaActive && !compactActive && !watchdogActive\) \{[\s\S]*\["disable-legacy-healthcheck", "resume-stack"\][\s\S]*\["resume-stack"\];[\s\S]*\}/);
  assert.match(viewModel, /const codexAuthCheck = summary\.runReadiness\?\.checks\.find\(\(check\) => check\.id === "codex-auth"\);/);
  assert.match(viewModel, /codexAuthCheck\.status === "fail"/);
  assert.match(viewModel, /actions\.push\("disable-legacy-healthcheck"\);/);
  assert.match(viewModel, /actions\.push\("repair-no-proxy-loopback"\);/);
  assert.match(viewModel, /actions\.push\("repair-codex-transport"\);/);
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
  assert.match(controlPage, /const currentModel = current\.profile\.defaultModel \|\| current\.models\.current \|\| current\.models\.defaultModel \|\| "";/);
  assert.match(controlPage, /configForm\.defaultModel = normalized\.profile\.defaultModel \|\| normalized\.models\.current \|\| normalized\.models\.defaultModel \|\| "kimi-k2\.6";/);
  assert.match(controlPage, /installForm\.model = normalized\.profile\.defaultModel \|\| normalized\.models\.current \|\| normalized\.models\.defaultModel \|\| "kimi-k2\.6";/);
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
  assert.match(viewModel, /export function normalizeProxyPolicy\([\s\S]*noProxyLoopbackReady: typeof policy\?\.noProxyLoopbackReady === "boolean"/);
  assert.match(upstreamMap, /写入 ~\/\.codex\/config\.toml/);
  assert.match(upstreamMap, /本地 OpenAI 兼容入口/);
  assert.match(upstreamMap, /OPENAI_API_KEY \/ base_url/);
});

test("codex stack settings page delegates model catalog without moving summary refresh", () => {
  assert.match(controlPage, /import CodexStackModelCatalogCard from "\.\/CodexStackModelCatalogCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackModelCatalogCard[\s\S]*:models="modelOptions"[\s\S]*:current-model="summary\.models\.current"[\s\S]*:source-help="modelSourceHelp"[\s\S]*:loading="loading"[\s\S]*:loading-disabled-help="summaryRefreshDisabledHelp"[\s\S]*@reload="loadSummary"/,
  );
  assert.match(controlPage, /const modelOptions = computed\(\(\) => Array\.from\(new Set\(\[/);
  assert.match(controlPage, /async function loadSummary\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-model-catalog-card"/);
  assert.doesNotMatch(controlPage, /class="cs-model-list"/);
  assert.match(modelCatalogCard, /defineProps<\{[\s\S]*models: string\[\];[\s\S]*currentModel: string;[\s\S]*sourceHelp: string;[\s\S]*loading: boolean;[\s\S]*loadingDisabledHelp: string;[\s\S]*\}>/);
  assert.match(modelCatalogCard, /v-if="loading && loadingDisabledHelp"[\s\S]*class="cs-disabled-help"/);
  assert.match(modelCatalogCard, /defineEmits<\{[\s\S]*reload: \[\];[\s\S]*\}>/);
  assert.match(modelCatalogCard, /@click="\$emit\('reload'\)"/);
  assert.doesNotMatch(modelCatalogCard, /fetchCodexStackSummary|loadSummary|summary\.models|modelOptions/);
});

test("codex stack settings page delegates runtime config form without moving patch ownership", () => {
  assert.match(controlPage, /import CodexStackRuntimeConfigCard from "\.\/CodexStackRuntimeConfigCard\.vue";/);
  assert.match(
    controlPage,
    /<CodexStackRuntimeConfigCard[\s\S]*:form="configForm"[\s\S]*:model-options="modelOptions"[\s\S]*:context-tokens-disabled="configContextTokensDisabled"[\s\S]*:context-tokens-disabled-help="configContextTokensDisabledHelp"[\s\S]*:restart-required-units="restartRequiredUnits"[\s\S]*:codex-route-active="summary\.codexRoute\.active"[\s\S]*:can-attach-codex-cpa="canAttachCodexCpa"[\s\S]*:attach-codex-cpa-disabled-help="attachCodexCpaDisabledHelp"[\s\S]*:can-run-mutation="canRunMutation"[\s\S]*:has-changes="hasConfigPatchChanges"[\s\S]*:mutation-disabled-help="mutationDisabledHelp"[\s\S]*@update-field="updateConfigFormField"[\s\S]*@save="saveConfigPatch"[\s\S]*@save-and-attach-cpa="saveConfigThenAttachCpa"[\s\S]*@save-and-force-cpa="saveConfigThenForceCpa"[\s\S]*@save-and-use-official="saveConfigThenUseOfficial"/,
  );
  assert.match(controlPage, /:impact-items="configImpactItems"/);
  assert.match(controlPage, /function updateConfigFormField\(field: CodexStackRuntimeConfigField, value: string \| number\): void/);
  assert.match(controlPage, /const configPatchPayload = computed<CodexStackConfigPatchRequest>/);
  assert.match(controlPage, /const configImpactItems = computed<CodexStackRuntimeConfigImpactItem\[\]>/);
  assert.match(controlPage, /Smoke recheck required after save/);
  assert.match(controlPage, /official GPT route still switches to CPA only through the explicit smoke gate/);
  assert.match(controlPage, /NO_PROXY must keep localhost,127\.0\.0\.1,::1/);
  assert.match(controlPage, /async function saveConfigPatch\(\): Promise<void>/);
  assert.doesNotMatch(controlPage, /v-model(?:\.number)?="configForm\.(defaultModel|contextMode|contextWindowTokens|cpaPort|compactPort|ccConnectProject|cpaProxyKey|upstreamBaseUrl|upstreamApiKey|providerProxyUrl|noProxy)"/);
  assert.match(runtimeConfigCard, /export interface CodexStackRuntimeConfigDraft/);
  assert.match(runtimeConfigCard, /export interface CodexStackRuntimeConfigImpactItem/);
  assert.match(runtimeConfigCard, /contextTokensDisabledHelp: string;/);
  assert.match(runtimeConfigCard, /v-if="contextTokensDisabled && contextTokensDisabledHelp"[\s\S]*class="form-help"/);
  assert.match(runtimeConfigCard, /Codex 使用路径/);
  assert.match(runtimeConfigCard, /这是 CPA 目标模型；保存配置不会自动把 Codex 切到 CPA/);
  assert.match(runtimeConfigCard, /用官方 ChatGPT/);
  assert.match(runtimeConfigCard, /保存并用官方 ChatGPT/);
  assert.match(runtimeConfigCard, /验证后用 CPA/);
  assert.match(runtimeConfigCard, /保存并验证 CPA/);
  assert.match(runtimeConfigCard, /强制用 CPA/);
  assert.match(runtimeConfigCard, /保存并强制 CPA/);
  assert.match(runtimeConfigCard, /仍可强制 CPA，但 Codex 普通请求、流式、长任务或压缩上下文可能失败/);
  assert.match(runtimeConfigCard, /@click="\$emit\('save-and-attach-cpa'\)"/);
  assert.match(runtimeConfigCard, /@click="\$emit\('save-and-force-cpa'\)"/);
  assert.match(runtimeConfigCard, /@click="\$emit\('save-and-use-official'\)"/);
  assert.match(controlPage, /async function saveConfigThenAttachCpa\(\): Promise<void>/);
  assert.match(controlPage, /async function saveConfigThenForceCpa\(\): Promise<void>/);
  assert.match(controlPage, /async function saveConfigThenUseOfficial\(\): Promise<void>/);
  assert.match(controlPage, /async function confirmRouteChange\(kind: "official" \| "cpa" \| "force-cpa"\): Promise<boolean>/);
  assert.match(runtimeConfigCard, /v-if="impactItems\.length"/);
  assert.match(runtimeConfigCard, /item\.detail/);
  assert.match(runtimeConfigCard, /mutationDisabledHelp: string;/);
  assert.match(runtimeConfigCard, /const saveDisabledHelp = computed\(\(\) => \{/);
  assert.match(runtimeConfigCard, /当前运行配置没有变化；修改后才能保存/);
  assert.match(runtimeConfigCard, /v-if="saveDisabledHelp"[\s\S]*class="cs-disabled-help"/);
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
