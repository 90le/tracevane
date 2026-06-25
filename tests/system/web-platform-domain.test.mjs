import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("OpenClaw platform workspace has one registry for all target sections", () => {
  const sections = read("apps/web/src/features/platforms/sections.ts");
  const workspace = read("apps/web/src/features/platforms/views/OpenClawWorkspace.tsx");
  for (const id of ["overview", "guard", "config", "agents", "skills", "channels", "bindings", "services", "logs", "diagnostics"]) {
    assert.match(sections, new RegExp(`id: "${id}"`));
    assert.match(workspace, new RegExp(`case "${id}"`));
  }
  assert.match(sections, /path: "\/platforms\/openclaw\/guard"/);
  assert.match(workspace, /OPENCLAW_SECTIONS\.map/);
  assert.match(workspace, /aria-label="OpenClaw 平台导航"/);
  assert.match(workspace, /id="openclaw-section-select"/);
});

test("Platform breadcrumb is accessible and marks the current page", () => {
  const shared = read("apps/web/src/features/platforms/_shared.tsx");
  const workspace = read("apps/web/src/features/platforms/views/OpenClawWorkspace.tsx");
  assert.match(shared, /export function PlatformBreadcrumb/);
  assert.match(shared, /aria-label="面包屑"/);
  assert.match(shared, /aria-current=\{isLast \? "page" : undefined\}/);
  assert.match(workspace, /<PlatformBreadcrumb/);
  assert.match(workspace, /label: "平台", to: "\/platforms"/);
});

test("OpenClaw read surfaces bind to real backend APIs instead of fake CRUD", () => {
  const views = read("apps/web/src/features/platforms/views/OpenClawSections.tsx");
  const channelsApi = read("apps/web/src/lib/api/channels.ts");
  const channelsQuery = read("apps/web/src/lib/query/channels.ts");
  for (const hook of ["useOpenClawConfigSummaryQuery", "useAgentsSummaryQuery", "useSkillsSummaryQuery", "useChannelsSummaryQuery", "useRecoveryDaemonServiceQuery", "useRecoveryEventsQuery", "useRecoveryStatusQuery", "useSystemDiagnosticsQuery", "useSystemHealthQuery"]) {
    assert.match(views, new RegExp(hook));
  }
  assert.match(channelsApi, /"\/api\/channels"/);
  assert.match(channelsQuery, /useChannelsSummaryQuery/);
  assert.match(views, /未接入前不提供假写入/);
  assert.match(views, /Tracevane IM 投递、队列、会话和 Bot 密钥仍在 IM 渠道域管理/);
  assert.match(views, /CLI 会话控制仍在 CLI 代理 \/ IDE 所属页面/);
});


test("Platform overview is a pure platform directory without owner handoff or legacy panels", () => {
  const overview = read("apps/web/src/features/platforms/views/OverviewView.tsx");
  const aggregate = read("apps/web/src/features/platforms/usePlatformsAggregate.ts");

  assert.match(overview, /Platform directory\. This page is a pure platform index/);
  assert.match(overview, /title="平台目录"/);
  assert.match(overview, /只列出真实第三方平台/);
  assert.doesNotMatch(overview, /title="关联 Tracevane 域"/);
  assert.doesNotMatch(overview, /title="兼容入口"/);
  assert.doesNotMatch(overview, /RelatedDomainRow/);
  assert.doesNotMatch(overview, /legacy \/external/);
  assert.doesNotMatch(overview, /legacy \/long-tasks/);
  assert.doesNotMatch(aggregate, /id: "external-mcp"/);
  assert.doesNotMatch(aggregate, /title: "模型网关"/);
  assert.doesNotMatch(aggregate, /title: "IM 渠道连接器"/);
  assert.doesNotMatch(aggregate, /useModelGatewayStatusQuery/);
  assert.doesNotMatch(aggregate, /useChannelConnectorsStatusQuery/);
});


test("legacy aggregation feature folders are deleted after redirect migration", () => {
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/features/external")), false);
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/features/long-tasks")), false);
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/lib/api/external.ts")), false);
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/lib/query/external.ts")), false);
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/lib/api/platform-read.ts")), true);
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/lib/query/platform-read.ts")), true);
});
