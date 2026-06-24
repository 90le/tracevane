import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const FEATURE_DIR = "apps/web/src/features/model-gateway";
const VIEWS_DIR = `${FEATURE_DIR}/views`;

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath));
}

// The 7 views that make up the Model Gateway feature slice.
const VIEW_FILES = [
  "OverviewView.tsx",
  "ProvidersView.tsx",
  "ProviderConfigView.tsx",
  "ModelsView.tsx",
  "AccountPoolView.tsx",
  "AppConnectionsView.tsx",
  "UsageView.tsx",
];

// The exact `data-view` set the page state machine drives over.
const DATA_VIEWS = [
  "overview",
  "providers",
  "providercfg",
  "models",
  "accounts",
  "apps",
  "usage",
];

test("model-gateway views/ contains the 7 view files", () => {
  for (const file of VIEW_FILES) {
    assert.equal(
      exists(`${VIEWS_DIR}/${file}`),
      true,
      `${VIEWS_DIR}/${file} should exist`,
    );
  }
});

test("ModelGatewayPage references the exact data-view set", () => {
  const page = read(`${FEATURE_DIR}/ModelGatewayPage.tsx`);
  // Every view key must be present in the VIEW_COMPONENTS / parent maps.
  for (const view of DATA_VIEWS) {
    assert.match(
      page,
      new RegExp(`\\b${view}\\b`),
      `ModelGatewayPage should reference the "${view}" view`,
    );
  }
  // And it must not reference any view key outside the contract set.
  const componentKeys = [...page.matchAll(/^\s{2}(\w+):\s*\w+View,?$/gm)].map(
    (m) => m[1],
  );
  for (const key of componentKeys) {
    assert.ok(
      DATA_VIEWS.includes(key),
      `unexpected view key "${key}" in ModelGatewayPage VIEW_COMPONENTS`,
    );
  }
});

test("every view consumes the real query hooks via @/lib/query/model-gateway", () => {
  for (const file of VIEW_FILES) {
    const source = read(`${VIEWS_DIR}/${file}`);
    assert.match(
      source,
      /@\/lib\/query\/model-gateway/,
      `${file} should import from @/lib/query/model-gateway`,
    );
  }
});

test("Usage view derives rows from live usage/status queries (no fabricated placeholders)", () => {
  const usage = read(`${VIEWS_DIR}/UsageView.tsx`);
  assert.match(usage, /useModelGatewayUsageQuery/);
  assert.match(usage, /useModelGatewayStatusQuery/);
  // Rows come from the API payload, not a hard-coded array.
  assert.match(usage, /usage(Query)?\.data/);
  assert.match(usage, /\.models\b/);
  assert.match(usage, /\.providers\b/);
  assert.match(usage, /\.appScopes\b/);
  assert.match(usage, /providerRows/);
  assert.match(usage, /appScopeRows/);
  assert.match(usage, /按 Agent scope/);
  assert.match(usage, /按 Provider/);
  assert.match(usage, /BreakdownPanel/);
  assert.match(usage, /meteredCoverage/);
  assert.match(usage, /meteredRequestCount/);
  assert.match(usage, /readWindow/);
  assert.match(usage, /cacheReadTokens/);
  assert.match(usage, /cacheCreationTokens/);
  assert.match(usage, /cacheEvidenceTokens/);
  assert.match(usage, /cacheReadToInput/);
  assert.match(usage, /cacheFieldsAvailable/);
  assert.match(usage, /cacheReadRequestCount/);
  assert.match(usage, /cacheCreationRequestCount/);
  assert.match(usage, /runtimeCacheReadTokens/);
  assert.match(usage, /当前 \/usage 响应未暴露缓存账本字段/);
  assert.match(usage, /当前账本窗口没有正向缓存证据/);
  assert.match(usage, /缓存证据口径/);
  assert.match(usage, /不做账单折扣、成本或命中率估算/);
  assert.match(usage, /requestRows/);
  assert.match(usage, /tokenRows/);
  assert.match(usage, /最近 runtime 窗口/);
  assert.match(usage, /未返回 usage 的请求只计入请求数，不猜 token/);
});

test("Overview view derives content from live status/providers/connections queries", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useModelGatewayStatusQuery/);
  assert.match(overview, /useModelGatewayProvidersQuery/);
  assert.match(overview, /useModelGatewayAppConnectionsQuery/);
  // Attention/health lists are filtered from live provider data.
  assert.match(overview, /providersQuery\.data|providerList/);
});

test("Overview view can smoke each visible active route by scope", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useSmokeModelGatewayActiveRouteMutation/);
  assert.match(overview, /smokeActiveRoute\(route\)/);
  assert.match(overview, /scope: route\.scope/);
  assert.match(overview, /model: route\.resolvedModel \?\? undefined/);
  assert.match(overview, /smokeAllActiveRoutes/);
  assert.match(overview, /for \(const route of checkableRoutes\)/);
  assert.match(overview, /routeSmokeResults/);
  assert.match(overview, /最近通过|最近失败/);
  assert.match(overview, /routeBudgetLabel\(route, providerList\)/);
  assert.match(overview, /formatModelBudgetPair/);
  assert.match(overview, /disabled=\{!route\.resolvedProviderId \|\| smokeMutation\.isPending\}/);
  assert.doesNotMatch(
    overview,
    /smokeMutation\.mutate\(undefined/,
    "overview active-route smoke must never fall back to the default codex route implicitly",
  );
});

test("Overview view exposes an Agent cockpit for route and client readiness", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /Agent Cockpit/);
  assert.match(overview, /MODEL_GATEWAY_APP_SCOPES\.map/);
  assert.match(overview, /APP_SCOPE_LABEL/);
  assert.match(overview, /connectionForScope\(scope, appConnections\)/);
  assert.match(overview, /routeForScope\(scope, activeRoutes\)/);
  assert.match(overview, /实际路由/);
  assert.match(overview, /客户端配置/);
  assert.match(overview, /客户端接入风险/);
  assert.match(overview, /运行时 readiness 看 Agent Cockpit/);
  assert.match(overview, /appConnectionIssues/);
  assert.match(overview, /配置写入 \/ 回滚/);
  assert.match(overview, /检查全部 Agent/);
  assert.match(overview, /检查路由/);
  assert.match(overview, /routeBudgetLabel\(route, providerList\)/);
  assert.match(overview, /路由详情（可展开）/);
  assert.match(overview, /providerAttentionSummary/);
});


test("Providers view aggregates endpoint risk and smokes every active scope for that provider", () => {
  const providers = read(`${VIEWS_DIR}/ProvidersView.tsx`);
  assert.match(providers, /activeRouteScopesForProvider/);
  assert.match(providers, /route\.resolvedProviderId === provider\.id/);
  assert.match(providers, /smokeMutation\.mutate\(\{ scope \}/);
  assert.match(providers, /endpointProfileRisk/);
  assert.match(providers, /部分熔断/);
  assert.match(providers, /部分异常/);
  assert.match(providers, /activeScopes\.map/);
  assert.match(providers, /检查 \$\{scope\} 活跃路由/);
  assert.doesNotMatch(
    providers,
    /smokeMutation\.mutate\(undefined/,
    "row-level active-route smoke must not silently test the default codex route",
  );
});

test("Provider config view explains provider smoke versus active-route smoke", () => {
  const config = read(`${VIEWS_DIR}/ProviderConfigView.tsx`);
  assert.match(config, /路由与诊断/);
  assert.match(config, /Provider smoke/);
  assert.match(config, /Active-route smoke/);
  assert.match(config, /activeRoutesForProvider/);
  assert.match(config, /Claude Code 默认走 streaming smoke/);
  assert.match(config, /gpt-5\.5 上下文低于 1M/);
});

test("Models view surfaces declared model context and output budgets", () => {
  const models = read(`${VIEWS_DIR}/ModelsView.tsx`);
  assert.match(models, /contextWindow/);
  assert.match(models, /maxOutputTokens/);
  assert.match(models, /上下文 \/ 输出/);
  assert.match(models, /ctx \{contextBudget\}/);
  assert.match(models, /formatModelTokenBudget/);
  assert.match(models, /out \{outputBudget\}/);
  assert.match(models, /未声明/);
});

test("App Connections view links client config rows to active route diagnostics", () => {
  const apps = read(`${VIEWS_DIR}/AppConnectionsView.tsx`);
  assert.match(apps, /useModelGatewayAppConnectionsQuery/);
  assert.match(apps, /useModelGatewayProvidersQuery/);
  assert.match(apps, /activeRouteForConnection/);
  assert.match(apps, /route\.scope === connection\.appScope/);
  assert.match(apps, /connection\.appScope/);
  assert.match(apps, /connection\.protocol/);
  assert.match(apps, /connection\.endpoint/);
  assert.match(apps, /实际路由/);
  assert.match(apps, /formatModelBudgetPair/);
});
