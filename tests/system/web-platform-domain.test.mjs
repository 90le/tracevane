import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), "utf8");

test("OpenClaw platform workspace has one registry for all target sections", () => {
  const sections = read("apps/web/src/features/platforms/sections.ts");
  const workspace = read("apps/web/src/features/platforms/openclaw/OpenClawWorkspace.tsx");
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
  const workspace = read("apps/web/src/features/platforms/openclaw/OpenClawWorkspace.tsx");
  assert.match(shared, /export function PlatformBreadcrumb/);
  assert.match(shared, /aria-label="面包屑"/);
  assert.match(shared, /aria-current=\{isLast \? "page" : undefined\}/);
  assert.match(workspace, /<PlatformBreadcrumb/);
  assert.match(workspace, /label: "平台", to: "\/platforms"/);
});

test("OpenClaw read surfaces are split into workbench pages instead of one aggregate file", () => {
  assert.equal(fs.existsSync(path.join(rootDir, "apps/web/src/features/platforms/views/OpenClawSections.tsx")), false);
  const workspace = read("apps/web/src/features/platforms/openclaw/OpenClawWorkspace.tsx");
  const components = read("apps/web/src/features/platforms/openclaw/components.tsx");
  const pages = [
    ["ConfigPage", "useOpenClawConfigSummaryQuery"],
    ["AgentsPage", "useAgentsSummaryQuery"],
    ["SkillsPage", "useSkillsSummaryQuery"],
    ["ChannelsPage", "useChannelsSummaryQuery"],
    ["BindingsPage", "useChannelsSummaryQuery"],
    ["ServicesPage", "useRecoveryDaemonServiceQuery"],
    ["LogsPage", "useRecoveryEventsQuery"],
    ["DiagnosticsPage", "useSystemDiagnosticsQuery"],
  ];
  for (const [page, hook] of pages) {
    const source = read(`apps/web/src/features/platforms/openclaw/sections/${page}.tsx`);
    assert.match(source, new RegExp(hook));
    assert.match(workspace, new RegExp(`<${page} />`));
  }
  assert.match(components, /ResponsiveTable/);
  assert.match(components, /DetailRail/);
  assert.match(components, /ReadOnlyStrip/);
});

test("OpenClaw workbench pages keep owner boundaries and avoid fake CRUD", () => {
  const config = read("apps/web/src/features/platforms/openclaw/sections/ConfigPage.tsx");
  const agents = read("apps/web/src/features/platforms/openclaw/sections/AgentsPage.tsx");
  const channels = read("apps/web/src/features/platforms/openclaw/sections/ChannelsPage.tsx");
  const bindings = read("apps/web/src/features/platforms/openclaw/sections/BindingsPage.tsx");
  assert.match(config, /不提供无契约保存按钮/);
  assert.match(agents, /CLI 会话、运行控制和 Agent Runs 仍在 CLI 代理 \/ IDE/);
  assert.match(channels, /Tracevane IM 投递、队列、会话和 Bot 密钥仍在 IM 渠道域管理/);
  assert.match(bindings, /IM 会话级动态路由与投递队列仍在 IM 渠道域/);
  for (const source of [config, agents, channels, bindings]) {
    assert.doesNotMatch(source, /新增|删除|安装|保存密钥/);
  }
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
