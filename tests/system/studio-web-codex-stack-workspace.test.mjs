import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const controlPage = read("apps/web-vue/src/features/codex-stack/CodexStackControlPage.vue");
const logConsole = read("apps/web-vue/src/features/codex-stack/CodexStackLogConsole.vue");
const actionOverview = read("apps/web-vue/src/features/codex-stack/CodexStackActionOverview.vue");
const dashboardInsights = read("apps/web-vue/src/features/codex-stack/CodexStackDashboardInsights.vue");
const diagnosticsPanel = read("apps/web-vue/src/features/codex-stack/CodexStackDiagnosticsPanel.vue");
const installPlanCard = read("apps/web-vue/src/features/codex-stack/CodexStackInstallPlanCard.vue");
const jobProgressPanel = read("apps/web-vue/src/features/codex-stack/CodexStackJobProgressPanel.vue");
const repairBoard = read("apps/web-vue/src/features/codex-stack/CodexStackRepairBoard.vue");
const chainMap = read("apps/web-vue/src/features/codex-stack/CodexStackChainMap.vue");
const runReadinessPanel = read("apps/web-vue/src/features/codex-stack/CodexStackRunReadinessPanel.vue");
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
  assert.match(diagnosticsPanel, /class="cs-diagnostics-grid"/);
  assert.match(diagnosticsPanel, /\.cs-warning-list\s*\{/);
  assert.match(diagnosticsPanel, /@media \(max-width: 960px\)/);
  assert.match(installPlanCard, /class="panel-card cs-install-plan-card"/);
  assert.match(installPlanCard, /\.cs-install-plan-list\s*\{/);
  assert.match(installPlanCard, /@media \(max-width: 960px\)/);
  assert.match(jobProgressPanel, /class="cs-install-overlay"/);
  assert.match(jobProgressPanel, /\.cs-job-progress-track\s*\{/);
  assert.match(jobProgressPanel, /@media \(max-width: 960px\)/);
  assert.match(repairBoard, /class="panel-card cs-repair-board"/);
  assert.match(repairBoard, /\.cs-repair-grid\s*\{/);
  assert.match(repairBoard, /@media \(max-width: 960px\)/);
  assert.match(dashboardInsights, /\.cs-section-kicker\s*\{/);
  assert.match(dashboardInsights, /\.cs-status-pill\.tone-sage\s*\{/);
  assert.match(chainMap, /export interface CodexStackChainNode/);
  assert.match(chainMap, /\.cs-chain-line\s*\{/);
  assert.match(chainMap, /\.cs-chain-gates\s*\{/);
  assert.match(chainMap, /\.cs-chain-warning-strip\s*\{/);
  assert.match(runReadinessPanel, /class="panel-card cs-run-readiness-card"/);
  assert.match(runReadinessPanel, /\.cs-run-check-grid\s*\{/);
  assert.match(runReadinessPanel, /@media \(max-width: 960px\)/);
  assert.match(logConsole, /\.cs-section-kicker\s*\{/);
  assert.match(logConsole, /\.cs-info-chip,\s*\n\.cs-status-pill\s*\{/);
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

test("codex stack install page delegates preflight plan without losing actions", () => {
  assert.match(controlPage, /import CodexStackInstallPlanCard from "\.\/CodexStackInstallPlanCard\.vue";/);
  assert.match(controlPage, /<CodexStackInstallPlanCard[\s\S]*:highlights="installPlanHighlights"[\s\S]*@install-full="installFullStack"[\s\S]*@install-base="installBaseOnly"[\s\S]*@repair="repairRecommended"/);
  assert.doesNotMatch(controlPage, /class="panel-card cs-install-plan-card"/);
  assert.match(installPlanCard, /执行前确认/);
  assert.match(installPlanCard, /@click="\$emit\('install-full'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('install-base'\)"/);
  assert.match(installPlanCard, /@click="\$emit\('repair'\)"/);
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
  assert.match(controlPage, /:disabled="!canRunMutation \|\| !hasConfigPatchChanges"/);
  assert.match(controlPage, /const payload = configPatchPayload\.value;[\s\S]*if \(!Object\.keys\(payload\)\.length\)/);
  assert.doesNotMatch(controlPage, /const payload: CodexStackConfigPatchRequest = \{\s*defaultModel: configForm\.defaultModel,/);
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
