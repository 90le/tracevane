import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");
const pagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/model-gateway/ModelGatewayControlPage.vue",
);
const apiPath = path.join(
  rootDir,
  "apps/web-vue/src/features/model-gateway/api.ts",
);
const cssPath = path.join(
  rootDir,
  "apps/web-vue/src/features/model-gateway/model-gateway-workspace.css",
);
const routeManifestPath = path.join(
  rootDir,
  "apps/web-vue/src/features/shell/route-manifest.ts",
);

test("Tracevane Gateway page is mounted as a first-class shell route", () => {
  const manifest = fs.readFileSync(routeManifestPath, "utf8");

  assert.match(manifest, /key:\s*"model-gateway"/);
  assert.match(manifest, /to:\s*"\/model-gateway"/);
  assert.match(manifest, /icon:\s*"gateway"/);
  assert.match(manifest, /labelZh:\s*"模型网关"/);
  assert.match(manifest, /path:\s*"\/model-gateway"/);
});

test("Tracevane Gateway page uses the new model-gateway API contract", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");
  const source = `${page}\n${api}`;

  for (const requiredPath of [
    "/api/model-gateway/status",
    "/api/model-gateway/runtime",
    "/api/model-gateway/usage",
    "/api/model-gateway/client-auth",
    "/api/model-gateway/app-connections",
    "/api/model-gateway/app-connections/profile",
    "/api/model-gateway/app-connections/apply",
    "/api/model-gateway/daemon-service",
    "/api/model-gateway/detect-provider",
    "/api/model-gateway/providers",
  ]) {
    assert.match(source, new RegExp(requiredPath.replace(/\//g, "\\/")));
  }

  for (const removedPath of [
    "/api/model-gateway/active-provider",
    "/api/model-gateway/active-route-smoke",
  ]) {
    assert.doesNotMatch(source, new RegExp(removedPath.replace(/\//g, "\\/")));
  }

  assert.match(source, /providers\/\$?\{?encodeURIComponent\(providerId\)\}?\/test/);
  assert.match(source, /Base URL/);
  assert.match(source, /Gateway will not append \/v1 automatically/);
});

test("Tracevane Gateway page keeps provider configuration user-owned", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const css = fs.readFileSync(cssPath, "utf8");
  const legacyInitialism = ["C", "P", "A"].join("");
  const legacyProxyName = ["Compact", "Proxy"].join(" ");
  const legacyApiPath = `/api/${["codex", "stack"].join("-")}`;
  const legacyComponentPrefix = ["Codex", "Stack"].join("");
  const vendorA = [["Big", "Model"].join(""), "Chat"].join(" ");
  const vendorB = [["Big", "Model"].join(""), "Anthropic"].join(" ");
  const vendorC = ["GMN", "Responses"].join(" ");
  const vendorHostA = `https://${["open", "bigmodel", "cn"].join(".")}/api/coding/paas/v4`;
  const vendorHostB = `https://${["open", "bigmodel", "cn"].join(".")}/api/anthropic`;
  const vendorHostC = `https://${["gmn", "chuangzuoli", "com"].join(".")}/v1`;

  for (const expected of [
    "OpenAI Chat Completions",
    "Anthropic Messages",
    "OpenAI Responses",
    "Provider Center",
    "Providers",
    "服务商中心",
    "新建服务商",
    "选择创建类型",
    "API Key 接入",
    "账户登录",
    "中继服务",
    "providerCreateKind",
    "providerCreateKindOptions",
    "providerEditorOpen",
    "providerEditorTitle",
    "providerSearch",
    "providerFilter",
    "filteredProviders",
    "selectedProviderIsAccount",
    "openProviderCreateDialog",
    "selectProviderCreateKind",
    "closeProviderEditor",
    "providerHealthSummary",
    "runProviderSmokeFromDraft",
    "mgw-provider-kind-panel",
    "mgw-provider-kind-options",
    "mgw-provider-kind-option",
    "mgw-provider-list-toolbar",
    "mgw-provider-editor-overlay",
    "mgw-provider-editor-shell",
    "mgw-provider-editor-head",
    "role=\"dialog\"",
    "mgw-provider-health-row",
    "mgw-provider-advanced",
    "Checks & Logs",
    "Vision smoke",
    "runVisionSmoke",
    "visionSmokeResult",
    "kind: 'vision'",
    "Vision verified",
    "Ensure running",
    "More actions",
    "Gateway key",
    "编辑 Gateway key",
    "Edit Gateway key",
    "clientAuthEditorOpen",
    "openClientAuthEditor",
    "closeClientAuthEditor",
    "请求 / Tokens",
    "runtimeUsageSummary",
    "runtimeUsageLabel",
    "mgw-overview-panel",
    "mgw-overview-summary",
    "mgw-overview-metrics",
    "mgw-overview-nav",
    "mgw-overview-nav-row",
    "mgw-overview-dialog-shell",
    "mgw-overview-dialog-body",
    "App Connections",
    "Client connections",
    "Connection profile",
    "Save profile",
    "Apply all",
    "Default model",
    "App model",
    "Context window",
    "Compact limit",
    "Max output",
    "appConnectionModelOptions",
    "appConnectionModelOptionLabel",
    "appConnectionBudgetSummary",
    "appConnectionBudgetLabel",
    "applyAppConnectionModelBudget",
    "contextWindow",
    "maxOutputTokens",
    "有效预算",
    "应用模型预算",
    "Codex advanced",
    "Request compression",
    "模型消耗",
    "Model usage",
    "fetchModelGatewayUsageLedger",
    "usageLedger",
    "usageTotals",
    "usageModelRows",
    "modelTokenBarWidth",
    "请求次数",
    "Token 消耗",
    "mgw-usage-overview",
    "mgw-usage-total-card",
    "mgw-model-usage-chart",
    "mgw-model-usage-bar",
    "mgw-model-usage-table",
    "modelRowPricing",
    "modelPricingSummary",
    "pricingCurrency",
    "inputPricePer1M",
    "价格未配置",
    "mgw-model-pricing",
    "mgw-model-pricing__grid",
    "检查与日志",
    "workspaceTabs",
    "activeWorkspaceTab",
    "mgw-workspace-tabs",
    "mgw-workspace-panel",
    "useRoute",
    "routeWorkspaceTab",
    "routeAppConnectionId",
    "applyRouteWorkspaceSelection",
    "mgw-app-${connection.id}",
    "Profile 工作台",
    "Profile workspace",
    "appConnectionProfileEditorOpen",
    "appConnectionDetailOpen",
    "selectedAppConnectionId",
    "selectedAppConnection",
    "configuredAppConnectionCount",
    "blockedAppConnectionCount",
    "appConnectionDisplayModel",
    "openAppConnectionProfileEditor",
    "closeAppConnectionProfileEditor",
    "openAppConnectionDetail",
    "closeAppConnectionDetail",
    "Apply config",
    "Preview config",
    "appConnections",
    "applyModelGatewayAppConnection",
    "applyAllModelGatewayAppConnections",
    "rollbackModelGatewayAppConnection",
    "updateModelGatewayAppConnectionProfile",
    "fetchModelGatewayAppConnections",
    "refreshAppConnections",
    "applyAppConnectionConfig",
    "rollbackAppConnectionConfig",
    "mgw-connection-summary",
    "mgw-connection-summary__metrics",
    "mgw-connection-summary__actions",
    "mgw-app-list",
    "mgw-app-row",
    "mgw-app-row__model",
    "mgw-app-row__budget",
    "mgw-connection-dialog-shell",
    "mgw-connection-dialog-body",
    "mgw-app-detail-facts",
    "mgw-app-preview",
    "mgw-profile-grid",
    "Client auth",
    "Save key",
    "Generate key",
    "Disable auth",
    "clientAuthReveal",
    "updateModelGatewayClientAuth",
    "fetchModelGatewayClientAuth",
    "Reinstall / enable autostart",
    "Restart supervised service",
    "Stop supervised service",
    "Connection check",
    "Detect config",
    "Detect protocol and models",
    "detectProviderConfig",
    "detectOverlayOpen",
    "detectSteps",
    "mgw-runtime-more",
    "mgw-detect-popover",
    "mgw-detect-card",
    "applyDetectedProtocol",
    "gateway-model-capability-list",
    "modelCapabilityOptions",
    "modelRowsToModels",
    "addDraftModelRow",
    "removeDraftModelRow",
    "createProviderModelRow",
    "模型名称",
    "别名",
    "上下文",
    "输出",
    "文字",
    "图片",
    "推理",
    "同一服务商内模型名称和别名不能重复",
    "服务商名称",
    "Routing priority",
    "Lower numbers win",
    "Clear cooldown",
    "Account proxy",
    "Save proxy",
    "Direct",
    "账号池策略",
    "Account strategy",
    "Per-account concurrency",
    "accountRoutingStrategy",
    "accountSessionAffinity",
    "accountMaxConcurrentPerAccount",
    "accountRoutingSummary",
    "runtimeLogFilterOptions",
    "runtimeLogEntryMatchesFilter",
    "accountRoutingDetailRows",
    "mgw-log-filters",
    "mgw-log-routing-detail",
    "mgw-log-row__toggle",
    "冷却重试",
    "selectedWasCooldownRetry",
    "冷却后重试",
    "sticky 命中",
    "池状态",
    "readyCount",
    "capacityAvailableCount",
    "busyCount",
    "cooldownCount",
    "needsLoginCount",
    "mgw-log-row__account",
    "modelListText",
    "modelRows",
    "normalizedDraftModels",
    "formatModelLine",
    "refreshModelCatalogFromProvider",
    "mergeDetectedModels",
    "刷新目录",
    "Refresh catalog",
    "媒体模型状态",
    "Media model status",
    "mediaCatalogBuckets",
    "mediaCatalogBucket",
    "mgw-media-status",
    "Bulk import / capabilities",
    "批量导入 / 能力预算",
    "modelBulk",
    "applyModelTextToRows",
    "copyModelRowsToBatchText",
    "fillMissingModelMetadata",
    "applyModelBulkBudget",
    "applyModelBulkCapabilities",
    "应用预算到全部",
    "应用能力到全部",
    "补齐空白预算/能力",
    "inferProviderModelCapabilities",
    "daemonActionResult",
    "Endpoint profiles",
    "gateway-endpoint-profile-editor",
    "endpointRows",
    "endpointRowsToInputs",
    "addEndpointProfileRow",
    "removeEndpointProfileRow",
    "mergeDetectedEndpointProfiles",
    "smokeEndpointProfile",
    "endpointProfileId",
    "Sync endpoint profiles",
    "Endpoint smoke passed",
    "mgw-endpoint-profile-list",
    "mgw-endpoint-profile-actions",
    "mgw-endpoint-smoke-result",
    "mgw-provider-form-sections",
    "mgw-config-section",
    "基础配置",
    "常用配置只保留名称、上游地址、密钥和协议。",
    "服务商 ID",
    "模型",
    "使用范围与检查",
    "多端点 / 多协议",
    "高级连接",
    "账号池高级",
    "端点路由",
    "高级覆盖",
  ]) {
    assert.match(page, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const forbidden of [
    vendorA,
    vendorB,
    vendorC,
    vendorHostA,
    vendorHostB,
    vendorHostC,
  ]) {
    assert.doesNotMatch(page, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(page, new RegExp(legacyComponentPrefix));
  assert.doesNotMatch(page, new RegExp(legacyApiPath.replace(/\//g, "\\/")));
  assert.doesNotMatch(page, new RegExp(`\\b${legacyInitialism}\\b`));
  assert.doesNotMatch(page, new RegExp(legacyProxyName));
  assert.doesNotMatch(page, /运行矩阵与组件明细/);
  assert.doesNotMatch(page, /安装修复/);
  assert.doesNotMatch(page, /label:\s*'Custom'/);
  assert.doesNotMatch(page, /显示名/);
  assert.doesNotMatch(page, /Display name/);
  for (const removedUsageSurface of [
    "账本归档窗口",
    "Ledger archive window",
    "usageTimeRange",
    "usageSourceFilter",
    "usageProviderFilter",
    "usageModelFilter",
    "usageAccountFilter",
    "usagePageSize",
    "usagePageOffset",
    "usageFilteredEntries",
    "usageSummaryCards",
    "archiveIndex",
    "usageArchiveIndex",
    "usageArchiveBuckets",
    "usageArchiveWindowLabel",
    "usageArchiveBucketMeta",
    "usagePageLabel",
    "canPageUsageForward",
    "canPageUsageBackward",
    "pageUsageLedger",
    "latencySummaryMeta",
    "formatLatencyMs",
    "TTFT p95",
    "usageProviderBuckets",
    "usageModelBuckets",
    "usageAccountBuckets",
    "usageRecentEntries",
    "usageLedgerWindowLabel",
    "usageEntryAccountLabel",
    "usageMediaLabel",
    "downloadGatewayUsageCsv",
    "usageCsvRows",
    "usageCostEstimate",
    "estimateUsageCost",
    "usageCostBreakdownLabel",
    "formatUsageCostEstimate",
    "usageBucketCostEstimate",
    "pricingForUsageEntry",
    "estimated_cost",
    "估算成本",
    "延迟",
    "上一页",
    "下一页",
    "导出 CSV",
    "时间范围",
    "来源",
    "全部 Provider",
    "mgw-usage-summary-grid",
    "mgw-usage-controls",
    "mgw-usage-section-grid",
    "mgw-usage-entry-list",
  ]) {
    assert.doesNotMatch(page, new RegExp(removedUsageSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const removedRoutingSurface of [
    "Active routing",
    "activeRouteStatuses",
    "activeRouteAlerts",
    "runActiveRouteSmoke",
    "smokeModelGatewayActiveRoute",
    "Route smoke passed",
    "Route smoke failed",
    "startProviderCreate",
    "mgw-create-type-grid",
    "mgw-create-type-card",
    "API Key Provider",
    "Account Provider",
    "Compatible Relay",
    "Protocol smoke",
    "Provider configuration",
    "Smoke / Logs",
    "Provider 是谁",
    "怎么连接",
    "有哪些模型",
    "给谁用",
    "h4>{{ text('是否可用'",
    "基础连接",
    "密钥与识别",
    "模型目录",
    "mgw-route-row",
    "mgw-route-list",
    "mgw-route-alerts",
  ]) {
    assert.doesNotMatch(page, new RegExp(removedRoutingSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const removedConnectionSurface of [
    "mgw-app-card",
    "mgw-app-grid",
    "mgw-app-facts",
    "mgw-app-actions",
    "mgw-connection-profile",
    "mgw-connection-profile__head",
    "mgw-connection-profile__actions",
  ]) {
    assert.doesNotMatch(page, new RegExp(removedConnectionSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(css, new RegExp(removedConnectionSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const removedOverviewSurface of [
    "mgw-runtime-actions",
    "mgw-client-key-form",
    "mgw-client-key-actions",
  ]) {
    assert.doesNotMatch(page, new RegExp(removedOverviewSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(css, new RegExp(removedOverviewSurface.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  for (const removedRoutingCss of [
    "mgw-route-row",
    "mgw-route-list",
    "mgw-route-alerts",
    "mgw-create-type-grid",
    "mgw-create-type-card",
    "grid-template-columns: minmax(280px, 360px) minmax(0, 1fr)",
    "grid-template-columns: minmax(240px, 320px) minmax(0, 1fr)",
  ]) {
    assert.doesNotMatch(css, new RegExp(removedRoutingCss.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(css, /\.mgw-detect-card\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.mgw-detect-card__main strong,\s*\.mgw-detect-card__main small\s*\{[^}]*overflow-wrap:\s*break-word/s);
  assert.match(css, /\.mgw-detect-card__main strong,\s*\.mgw-detect-card__main small\s*\{[^}]*word-break:\s*normal/s);
  assert.match(css, /\.mgw-secret-output code\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-layout\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.mgw-overview-stack\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.mgw-overview-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(220px,\s*auto\)/s);
  assert.match(css, /\.mgw-overview-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-overview-nav-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/s);
  assert.match(css, /\.mgw-overview-dialog-body\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.mgw-provider-kind-options\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-provider-kind-option\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.mgw-provider-account-create\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.mgw-provider-editor-overlay\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.mgw-provider-editor-overlay\s*\{[^}]*place-items:\s*center/s);
  assert.match(css, /\.mgw-provider-editor-shell\s*\{[^}]*max-height:\s*calc\(100vh - 48px\)/s);
  assert.match(css, /\.mgw-provider-editor-shell \.mgw-provider-form\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.mgw-provider-editor-shell \.mgw-form-actions\s*\{[^}]*position:\s*static/s);
  assert.match(css, /\.mgw-workspace-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-workspace-tab\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-panel-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.mgw-connection-summary\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.2fr\)\s+minmax\(280px,\s*0\.9fr\)\s+auto/s);
  assert.match(css, /\.mgw-connection-summary__metrics\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-app-row\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.15fr\)\s+minmax\(140px,\s*0\.8fr\)\s+minmax\(150px,\s*0\.8fr\)\s+auto/s);
  assert.match(css, /\.mgw-app-row:hover,\s*\.mgw-app-row\.active\s*\{/);
  assert.match(css, /\.mgw-connection-dialog-body\s*\{[^}]*overflow:\s*auto/s);
  assert.match(css, /\.mgw-app-detail-facts\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-provider-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.mgw-provider-list-toolbar\s*\{[^}]*grid-template-columns:\s*minmax\(180px,\s*1fr\)\s+minmax\(140px,\s*220px\)/s);
  assert.match(css, /\.mgw-usage-overview\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-model-usage-bar\s*\{[^}]*grid-template-columns:\s*minmax\(160px,\s*0\.6fr\)\s+minmax\(0,\s*1\.4fr\)\s+minmax\(72px,\s*auto\)/s);
  assert.match(css, /\.mgw-model-usage-bar__track span\s*\{[^}]*background:\s*var\(--accent\)/s);
  assert.match(css, /\.mgw-model-usage-table table\s*\{[^}]*min-width:\s*520px/s);
  assert.match(css, /\.mgw-app-preview pre\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-profile-budget-bar\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.mgw-profile-budget-bar span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.mgw-overview-summary,\s*\.mgw-overview-metrics,\s*\.mgw-overview-nav-row[\s\S]*grid-template-columns:\s*1fr/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.mgw-connection-summary,\s*\.mgw-connection-summary__metrics,\s*\.mgw-app-row,\s*\.mgw-app-detail-facts[\s\S]*grid-template-columns:\s*1fr/s);
  assert.match(css, /\.mgw-provider-form-sections\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.mgw-provider-id-details\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.mgw-provider-final-grid\s*\{[^}]*grid-template-columns:\s*minmax\(220px,\s*0\.7fr\)\s+minmax\(0,\s*1\.3fr\)/s);
  assert.match(css, /\.mgw-provider-advanced > summary,\s*\.mgw-account-row__advanced > summary\s*\{[^}]*cursor:\s*pointer/s);
  assert.match(css, /\.mgw-provider-health-row\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.mgw-config-section\s*\{[^}]*border:\s*1px solid var\(--mono-line\)/s);
  assert.match(css, /\.mgw-config-section__head span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-model-table__head,\s*\.mgw-model-row\s*\{[^}]*grid-template-columns:[^}]*minmax\(170px,\s*1\.15fr\)[^}]*minmax\(150px,\s*0\.9fr\)[^}]*minmax\(96px,\s*0\.5fr\)[^}]*minmax\(88px,\s*0\.5fr\)/s);
  assert.match(css, /\.mgw-model-pricing\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.mgw-model-pricing__grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-model-cell \.form-input\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.mgw-model-cell__label\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*\.mgw-model-cell__label\s*\{[^}]*display:\s*block/s);
  assert.match(css, /\.mgw-model-capabilities\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.mgw-model-capability\s*\{[^}]*white-space:\s*nowrap/s);
  assert.match(css, /\.mgw-model-batch\s*\{[^}]*border:\s*1px solid var\(--mono-line\)/s);
  assert.match(css, /\.mgw-model-batch__body\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.mgw-model-batch__actions,\s*\.mgw-model-batch__bulk,\s*\.mgw-model-batch__capabilities\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.mgw-endpoint-profile\s*\{[^}]*grid-template-columns:\s*minmax\(90px,\s*0\.42fr\)\s+repeat\(4,\s*minmax\(120px,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-endpoint-profile \.form-field-wide\s*\{[^}]*grid-column:\s*span 2/s);
  assert.match(css, /\.mgw-endpoint-smoke-result span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});
