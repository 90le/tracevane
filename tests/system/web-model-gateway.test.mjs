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
  assert.match(page, /React\.lazy/);
  assert.match(page, /<React\.Suspense fallback=\{<ModelGatewayViewFallback \/>\}>/);
  assert.match(page, /import\("\.\/views\/OverviewView"\)/);
  assert.match(page, /import\("\.\/views\/ProvidersView"\)/);
  assert.match(page, /import\("\.\/views\/ModelsView"\)/);
  assert.match(page, /import\("\.\/views\/UsageView"\)/);
  assert.match(page, /from "\.\/views\/types"/);
  assert.doesNotMatch(
    page,
    /import\s*\{[\s\S]*(OverviewView|ProvidersView|ModelsView|UsageView)[\s\S]*\}\s*from "\.\/views"/,
    "ModelGatewayPage must not statically import view components through the views barrel",
  );
  const componentKeys = [...page.matchAll(/^\s{2}(\w+):\s*React\.lazy/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(componentKeys.sort(), DATA_VIEWS.toSorted());
});

test("model-gateway views barrel exports only route metadata and types", () => {
  const barrel = read(`${VIEWS_DIR}/index.ts`);
  assert.match(barrel, /MODEL_GATEWAY_VIEWS/);
  for (const file of VIEW_FILES) {
    const componentName = file.replace(/\.tsx$/, "");
    assert.doesNotMatch(
      barrel,
      new RegExp(`\\b${componentName}\\b`),
      `${componentName} should stay out of the barrel so React.lazy can split it`,
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

test("Usage view shows charted usage with request/token sort controls", () => {
  const usage = read(`${VIEWS_DIR}/UsageView.tsx`);
  const gatewayUi = read(`${VIEWS_DIR}/GatewayUi.tsx`);
  assert.match(usage, /useModelGatewayUsageQuery/);
  // Rows come from the API payload, not a hard-coded array.
  assert.match(usage, /usage(Query)?\.data/);
  assert.match(usage, /\.models\b/);
  assert.match(usage, /UsageSortKey/);
  assert.match(usage, /SORT_OPTIONS/);
  assert.match(usage, /RANGE_OPTIONS/);
  assert.match(usage, /usageRange/);
  assert.match(usage, /range: usageRange/);
  assert.match(usage, /comparisonWindow/);
  assert.match(usage, /previousUsageQuery/);
  assert.match(usage, /compareUsage/);
  assert.match(usage, /较前一周/);
  assert.match(usage, /最近一周/);
  assert.match(usage, /全部/);
  assert.match(usage, /指定日期/);
  assert.match(usage, /aria-label="日期范围"/);
  assert.match(usage, /aria-label="模型用量图表"/);
  assert.match(usage, /aria-label="每日用量图表"/);
  assert.match(usage, /type="date"/);
  assert.match(usage, /usageRange === "custom"/);
  assert.match(usage, /setUsageRange/);
  assert.match(usage, /请求次数/);
  assert.match(usage, /次数/);
  assert.match(usage, /总 token/);
  assert.match(usage, /输入消耗/);
  assert.match(usage, /输出消耗/);
  assert.match(usage, /model\.inputTokens \+ model\.outputTokens/);
  assert.match(usage, /setSortKey/);
  assert.match(usage, /aria-pressed/);
  assert.match(usage, /优先采信 provider usage/);
  assert.match(usage, /本地估算兜底已启用/);
  assert.match(usage, /ModelRankingPanel/);
  assert.match(usage, /DailyTrendPanel/);
  assert.match(usage, /MeteringPanel/);
  assert.match(usage, /模型排行/);
  assert.match(usage, /每日趋势/);
  assert.match(usage, /统计口径/);
  assert.match(usage, /Provider usage 优先入账/);
  assert.match(usage, /GatewayMetricCard/);
  assert.match(usage, /ModelLogo/);
  assert.match(usage, /ProviderPill/);
  assert.match(gatewayUi, /modelIdentity/);
  assert.match(gatewayUi, /GatewayMark/);
  assert.match(gatewayUi, /GatewayPill/);
  assert.match(gatewayUi, /ComparisonBadge/);
  assert.match(gatewayUi, /GatewayMetricCard/);
  assert.match(usage, /min-\[520px\]:grid-cols-2/);
  assert.match(usage, /xl:grid-cols-4/);
  assert.doesNotMatch(usage, /<Table/);
  assert.doesNotMatch(usage, /useModelGatewayStatusQuery/);
  assert.doesNotMatch(usage, /\.providers\b/);
  assert.doesNotMatch(usage, /\.appScopes\b/);
  assert.doesNotMatch(usage, /metered/i);
  assert.doesNotMatch(usage, /cache/i);
  assert.doesNotMatch(usage, /缓存/);
  assert.doesNotMatch(usage, /延迟/);
  assert.doesNotMatch(usage, /providerRows/);
  assert.doesNotMatch(usage, /appScopeRows/);
  assert.doesNotMatch(usage, /readWindow/);
  assert.doesNotMatch(usage, /移动端 Token 消耗排行/);
});

test("Overview view derives content from live status/providers/connections queries", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useModelGatewayStatusQuery/);
  assert.match(overview, /useModelGatewayProvidersQuery/);
  assert.match(overview, /useModelGatewayAppConnectionsQuery/);
  // Attention/health lists are filtered from live provider data.
  assert.match(overview, /providersQuery\.data|providerList/);
  assert.match(overview, /providers\?\.summary/);
  assert.match(overview, /providerSummary/);
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
  assert.match(overview, /ROUTE_SMOKE_STORAGE_KEY/);
  assert.match(overview, /readStoredRouteSmokeResults/);
  assert.match(overview, /writeStoredRouteSmokeResults/);
  assert.match(overview, /routeSmokeKey\(route\)/);
  assert.match(overview, /checkedAt/);
  assert.match(overview, /已验 \$\{lastSmoke\.latencyMs/);
  assert.match(overview, /routeBudgetLabel\(route, providerList\)/);
  assert.match(overview, /formatModelBudgetPair/);
  assert.match(overview, /disabled=\{!canSmoke \|\| smokeMutation\.isPending\}/);
  assert.doesNotMatch(
    overview,
    /smokeMutation\.mutate\(undefined/,
    "overview active-route smoke must never fall back to the default codex route implicitly",
  );
});

test("Overview view exposes a route cockpit for route and client readiness", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /模型路由总览/);
  assert.match(overview, /MODEL_GATEWAY_APP_SCOPES\.map/);
  assert.match(overview, /APP_SCOPE_LABEL/);
  assert.match(overview, /connectionForScope\(scope, appConnections\)/);
  assert.match(overview, /routeForScope\(scope, activeRoutes\)/);
  assert.match(overview, /实际路由/);
  assert.match(overview, /本地配置/);
  assert.match(overview, /客户端接入风险/);
  assert.match(overview, /运行中状态看\s*CLI Agents/);
  assert.match(overview, /appConnectionIssues/);
  assert.match(overview, /配置写入 \/ 回滚/);
  assert.match(overview, /检查全部/);
  assert.match(overview, /检查路由/);
  assert.match(overview, /routeBudgetLabel\(route, providerList\)/);
  assert.doesNotMatch(overview, /路由详情（可展开）/);
  assert.match(overview, /providerAttentionSummary/);
  assert.doesNotMatch(overview, /SkeletonRow|<Skeleton/);
  assert.match(overview, /RuntimeDiagnosticsPanel[\s\S]*enabled=\{diagnosticsEnabled\}/);
  assert.match(overview, /DaemonServicePanel[\s\S]*enabled=\{serviceEnabled\}/);
  assert.match(overview, /<Table className="table-fixed">/);
  assert.match(overview, /<colgroup>/);
  assert.match(overview, /break-words text-sm/);
  assert.match(overview, /break-all text-xs/);
  assert.doesNotMatch(overview, /min-w-\[260px\]/);
  assert.doesNotMatch(overview, /min-w-\[180px\]/);
});


test("Daemon service panel refreshes real supervisor status", () => {
  const panel = read(`${VIEWS_DIR}/DaemonServicePanel.tsx`);
  assert.match(panel, /runCommands: true/);
  assert.doesNotMatch(panel, /runCommands: action !== "status"/);
  assert.match(panel, /激活/);
  assert.match(panel, /开机自启/);
});

test("Providers view runs Codex login as a tracked dialog flow", () => {
  const providers = read(`${VIEWS_DIR}/ProvidersView.tsx`);
  assert.match(providers, /Codex 账户登录/);
  assert.match(providers, /usePollCodexAccountLoginMutation/);
  assert.match(providers, /setCodexLoginDialogOpen\(true\)/);
  assert.match(providers, /Tracevane 会自动轮询并创建 Provider/);
  assert.match(providers, /我已完成授权，立即检查/);
  assert.doesNotMatch(providers, /打开 \$\{result\.verificationUrl\} 并输入 \$\{result\.userCode\}/);
});

test("Providers view aggregates endpoint risk and smokes every active scope for that provider", () => {
  const providers = read(`${VIEWS_DIR}/ProvidersView.tsx`);
  assert.match(providers, /providersQuery\.data\?\.summary/);
  assert.match(providers, /GatewayMetricCard/);
  assert.match(providers, /GatewayMark/);
  assert.match(providers, /providerIdentityFromText/);
  assert.match(providers, /providerRows/);
  assert.match(providers, /providerStatusRank/);
  assert.match(providers, /activeRoutesForProvider/);
  assert.match(providers, /route\.resolvedProviderId === provider\.id/);
  assert.match(providers, /smokeMutation\.mutate\(\{ scope, model: route\.resolvedModel \?\? undefined \}/);
  assert.match(providers, /endpointProfileRisk/);
  assert.match(providers, /部分熔断/);
  assert.match(providers, /部分异常/);
  assert.match(providers, /providerActiveRoutes\.map/);
  assert.match(providers, /检查 \$\{scope\} 活跃路由/);
  assert.match(providers, /选定模型：/);
  assert.doesNotMatch(
    providers,
    /smokeMutation\.mutate\(undefined/,
    "row-level active-route smoke must not silently test the default codex route",
  );
});



test("Provider config create mode starts with user-facing add methods", () => {
  const config = read(`${VIEWS_DIR}/ProviderConfigView.tsx`);
  const chooser = read(`${VIEWS_DIR}/ProviderOnboardingChooser.tsx`);
  assert.match(config, /type Section = "guide" \| "basic" \| "endpoint" \| "models" \| "advanced"/);
  assert.match(config, /添加 Provider/);
  assert.match(config, /Configuration Studio/);
  assert.match(config, /返回添加方式/);
  assert.match(config, /ProviderOnboardingChooser/);
  assert.match(config, /GatewayMetricCard/);
  assert.match(config, /GatewayMark/);
  assert.match(config, /providerIdentityFromText/);
  assert.match(chooser, /快速连接 API Provider/);
  assert.match(chooser, /从供应商目录添加/);
  assert.match(chooser, /连接本地 \/ 自托管服务/);
  assert.match(chooser, /账号型 Provider/);
  assert.match(chooser, /高级手动配置/);
  assert.match(chooser, /CLOUD_PROVIDER_SEEDS/);
  assert.match(chooser, /LOCAL_PROVIDER_SEEDS/);
  assert.match(chooser, /ADVANCED_PROTOCOL_SEEDS/);
  assert.match(chooser, /OpenRouter/);
  assert.match(chooser, /Ollama/);
  assert.match(config, /连接向导/);
  assert.match(config, /测试连接并自动识别/);
  assert.match(config, /导入推荐/);
  assert.match(config, /全部导入/);
  assert.match(config, /专家编辑完整配置/);
  assert.match(config, /保存后下一步/);
  assert.match(config, /setHydratedKey/);
  assert.match(config, /Provider 已创建，但密钥保存失败/);
  assert.match(config, /setSecretMutation\.mutate/);
  assert.match(config, /goToView\("apps", \{ app: "codex" \}\)/);
  assert.match(config, /goToView\("apps", \{ app: "claude-code" \}\)/);
  assert.match(config, /goToView\("apps", \{ app: "opencode" \}\)/);
  assert.match(config, /应用 CLI 配置会继续使用安全上下文预算/);
  assert.match(config, /网关模型目录保留供应商真实上下文/);
});

test("Provider config view explains provider smoke versus active-route smoke", () => {
  const config = read(`${VIEWS_DIR}/ProviderConfigView.tsx`);
  assert.match(config, /路由与诊断/);
  assert.match(config, /Provider smoke/);
  assert.match(config, /Active-route smoke/);
  assert.match(config, /activeRoutesForProvider/);
  assert.match(config, /Claude Code 默认走 streaming smoke/);
  assert.match(config, /Codex Account 当前服务端模型目录将 gpt-5\.5 的可输入窗口限制在约 272K/);
  assert.match(config, /272K input \+ 128K output\/reserved/);
  assert.match(config, /provider 模型目录未按 OpenAI API 能力更新/);
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
