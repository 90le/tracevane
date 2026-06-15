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

test("Studio Gateway page is mounted as a first-class shell route", () => {
  const manifest = fs.readFileSync(routeManifestPath, "utf8");

  assert.match(manifest, /key:\s*"model-gateway"/);
  assert.match(manifest, /to:\s*"\/model-gateway"/);
  assert.match(manifest, /icon:\s*"gateway"/);
  assert.match(manifest, /labelZh:\s*"模型网关"/);
  assert.match(manifest, /path:\s*"\/model-gateway"/);
});

test("Studio Gateway page uses the new model-gateway API contract", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");
  const source = `${page}\n${api}`;

  for (const requiredPath of [
    "/api/model-gateway/status",
    "/api/model-gateway/runtime",
    "/api/model-gateway/client-auth",
    "/api/model-gateway/app-connections",
    "/api/model-gateway/app-connections/profile",
    "/api/model-gateway/app-connections/apply",
    "/api/model-gateway/daemon-service",
    "/api/model-gateway/detect-provider",
    "/api/model-gateway/providers",
    "/api/model-gateway/active-provider",
    "/api/model-gateway/active-route-smoke",
  ]) {
    assert.match(source, new RegExp(requiredPath.replace(/\//g, "\\/")));
  }

  assert.match(source, /providers\/\$?\{?encodeURIComponent\(providerId\)\}?\/test/);
  assert.match(source, /Base URL/);
  assert.match(source, /Gateway will not append \/v1 automatically/);
});

test("Studio Gateway page keeps provider configuration user-owned", () => {
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
    "Active routing",
    "activeRouteStatuses",
    "activeRouteAlerts",
    "runActiveRouteSmoke",
    "smokeModelGatewayActiveRoute",
    "Route smoke passed",
    "Route smoke failed",
    "Protocol smoke",
    "Vision smoke",
    "runVisionSmoke",
    "visionSmokeResult",
    "kind: 'vision'",
    "Vision verified",
    "Ensure running",
    "More actions",
    "Gateway key",
    "请求 / Tokens",
    "runtimeUsageSummary",
    "runtimeUsageLabel",
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
    "Provider configuration",
    "Smoke / Logs",
    "workspaceTabs",
    "activeWorkspaceTab",
    "mgw-workspace-tabs",
    "mgw-workspace-panel",
    "useRoute",
    "routeWorkspaceTab",
    "routeAppConnectionId",
    "applyRouteWorkspaceSelection",
    "mgw-app-${connection.id}",
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
    "mgw-app-card",
    "mgw-app-preview",
    "mgw-connection-profile",
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
    "同一 Provider 内模型名称和别名不能重复",
    "Provider status",
    "Routing priority",
    "Lower numbers win",
    "Clear cooldown",
    "Account proxy",
    "Save proxy",
    "Direct",
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
    "mgw-log-row__account",
    "modelListText",
    "modelRows",
    "normalizedDraftModels",
    "formatModelLine",
    "refreshModelCatalogFromProvider",
    "mergeDetectedModels",
    "刷新目录",
    "Refresh catalog",
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
    "基础连接",
    "端点路由",
    "密钥与识别",
    "模型目录",
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

  assert.match(css, /\.mgw-detect-card\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  assert.match(css, /\.mgw-detect-card__main strong,\s*\.mgw-detect-card__main small\s*\{[^}]*overflow-wrap:\s*break-word/s);
  assert.match(css, /\.mgw-detect-card__main strong,\s*\.mgw-detect-card__main small\s*\{[^}]*word-break:\s*normal/s);
  assert.match(css, /\.mgw-secret-output code\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-workspace-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-workspace-tab\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-app-card\.active\s*\{/);
  assert.match(css, /\.mgw-panel-actions\s*\{[^}]*flex-wrap:\s*wrap/s);
  assert.match(css, /\.mgw-app-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.mgw-app-preview pre\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-profile-budget-bar\s*\{[^}]*display:\s*flex/s);
  assert.match(css, /\.mgw-profile-budget-bar span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-provider-form-sections\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /\.mgw-config-section\s*\{[^}]*border:\s*1px solid var\(--mono-line\)/s);
  assert.match(css, /\.mgw-config-section__head span\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(css, /\.mgw-model-table__head,\s*\.mgw-model-row\s*\{[^}]*grid-template-columns:[^}]*minmax\(170px,\s*1\.15fr\)[^}]*minmax\(150px,\s*0\.9fr\)[^}]*minmax\(96px,\s*0\.5fr\)[^}]*minmax\(88px,\s*0\.5fr\)/s);
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
