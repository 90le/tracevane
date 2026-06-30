import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const read = (relativePath) =>
  fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("dashboard hydrates expensive owner-domain sources after first paint", () => {
  const aggregate = read("apps/web/src/features/dashboard/views/useDashboardAggregate.ts");

  assert.match(aggregate, /function useAfterFirstPaint/);
  assert.match(aggregate, /requestAnimationFrame/);
  assert.match(aggregate, /SECONDARY_SOURCE_DELAY_MS = 250/);
  assert.match(aggregate, /const secondarySourcesEnabled = useAfterFirstPaint\(\)/);
  assert.match(aggregate, /useDashboardSummaryQuery\(\{[\s\S]*staleTime: CRITICAL_STALE_MS/);
  assert.match(aggregate, /useSystemHealthQuery\(\{[\s\S]*staleTime: CRITICAL_STALE_MS/);
  assert.match(aggregate, /useModelGatewayStatusQuery\(\{[\s\S]*enabled: secondarySourcesEnabled/);
  assert.match(aggregate, /useChannelConnectorsStatusQuery\(\{[\s\S]*enabled: secondarySourcesEnabled/);
  assert.match(aggregate, /useChannelConnectorsAgentSessionsQuery\(\{[\s\S]*enabled: secondarySourcesEnabled/);
  assert.match(aggregate, /useTerminalStatusQuery\(\{[\s\S]*enabled: secondarySourcesEnabled/);
  assert.match(aggregate, /useOpenClawRecoveryStatusQuery\(\{[\s\S]*enabled: secondarySourcesEnabled/);
  assert.match(aggregate, /if \(!secondarySourcesEnabled\) return;/);
});

test("dashboard keeps the static cockpit visible during bootstrap", () => {
  const page = read("apps/web/src/features/dashboard/DashboardPage.tsx");

  assert.doesNotMatch(page, /SkeletonRow|<Skeleton/);
  assert.doesNotMatch(page, /if \(isLoading\)/);
  assert.match(page, /isBootstrapping/);
  assert.match(page, /首屏先展示导航、关键入口和静态驾驶舱/);
  assert.match(page, /首屏已就绪，后台检测排队中/);
  assert.match(page, /正在补齐后台检测/);
  assert.match(page, /快速启动/);
});

test("dashboard navigation naming matches the optimized app shell IA", () => {
  const page = read("apps/web/src/features/dashboard/DashboardPage.tsx");
  const aggregate = read("apps/web/src/features/dashboard/views/aggregate.ts");

  assert.match(page, /label: "模型路由"/);
  assert.match(page, /label: "消息接入"/);
  assert.match(page, /label: "Agent CLI"/);
  assert.match(aggregate, /label: "模型路由"/);
  assert.match(aggregate, /label: "消息接入"/);
  assert.doesNotMatch(page, /label: "模型网关"|label: "IM 渠道"|label: "CLI 代理"/);
});
