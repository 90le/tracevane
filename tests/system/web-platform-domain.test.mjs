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
  assert.match(sections, /label: "原生 Agent"/);
  assert.match(sections, /label: "原生渠道"/);
  assert.match(sections, /label: "原生绑定"/);
  assert.match(sections, /不是 Tracevane CLI Agents/);
  assert.match(sections, /不是 Tracevane IM 渠道/);
  assert.match(sections, /不是 Tracevane IM 路由绑定/);
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





test("OpenClaw guard service status probes live manager state instead of preserving unknown", () => {
  const service = read("apps/api/modules/openclaw-recovery/service.ts");
  assert.match(service, /function preferKnownState/);
  assert.match(service, /live && live !== "unknown"/);
  assert.match(service, /probe: true/);
  assert.doesNotMatch(service, /activeState: stored\.activeState \|\| snapshot\.activeState/);
});

test("OpenClaw workbench pages keep selection hooks before loading returns to avoid blank screens", () => {
  for (const pageName of ["AgentsPage", "SkillsPage", "ChannelsPage", "BindingsPage", "ServicesPage", "LogsPage", "DiagnosticsPage"]) {
    const page = read(`apps/web/src/features/platforms/openclaw/sections/${pageName}.tsx`);
    const loadingIndex = page.indexOf("isLoading");
    if (loadingIndex < 0) continue;
    assert.ok(page.indexOf("useSelectedKey") > -1, `${pageName} should use selectable detail state`);
    assert.ok(page.indexOf("useSelectedKey") < loadingIndex, `${pageName} selection hook must run before loading/error early returns`);
  }
});

test("OpenClaw config page saves first-stage safe fields through typed PATCH", () => {
  const api = read("apps/web/src/lib/api/platform-read.ts");
  const query = read("apps/web/src/lib/query/platform-read.ts");
  const page = read("apps/web/src/features/platforms/openclaw/sections/ConfigPage.tsx");
  assert.match(api, /patchOpenClawConfig/);
  assert.match(api, /method: "PATCH"/);
  assert.match(query, /usePatchOpenClawConfigMutation/);
  assert.match(page, /ConfigDraft/);
  assert.match(page, /dirty/);
  assert.match(page, /保存当前配置/);
  assert.match(page, /重置/);
  assert.match(page, /draftToPatch/);
  assert.match(page, /contextTokens/);
  assert.match(page, /reserveTokensFloor/);
  assert.match(page, /CONFIG_SECTIONS/);
  assert.match(page, /useSearchParams/);
  assert.match(page, /OpenClaw 配置子页面/);
  assert.match(page, /title: "模型"/);
  assert.match(page, /title: "安全"/);
  assert.match(page, /title: "网关"/);
  assert.match(page, /title: "扩展"/);
  assert.match(page, /title: "浏览日志"/);
  assert.match(page, /原生命令/);
  assert.match(page, /启用 Browser/);
  assert.match(page, /常用项使用下拉、开关和数字控件/);
  assert.doesNotMatch(page, /DetailRail/);
  assert.doesNotMatch(page, /高级证据/);
  assert.doesNotMatch(page, /parseJsonField/);
  assert.doesNotMatch(page, /xl:grid-cols-\[minmax\(0,1fr\)_380px\]/);
  assert.doesNotMatch(page, /config\.isLoading \|\| diagnostics\.isLoading/);
});

test("OpenClaw workbench pages support refreshable selectable detail workflows", () => {
  const components = read("apps/web/src/features/platforms/openclaw/components.tsx");
  assert.match(components, /export function SelectableRow/);
  assert.match(components, /aria-selected=\{selected\}/);
  assert.match(components, /event\.key === "Enter" \|\| event\.key === " "/);
  assert.match(components, /export function RefreshButton/);
  assert.match(components, /export function useSelectedKey/);

  for (const page of ["AgentsPage", "SkillsPage", "ChannelsPage", "BindingsPage", "ServicesPage", "LogsPage", "DiagnosticsPage"]) {
    const source = read(`apps/web/src/features/platforms/openclaw/sections/${page}.tsx`);
    assert.match(source, /RefreshButton/);
    assert.match(source, /refetch\(\)/);
    assert.match(source, /useSelectedKey/);
    assert.match(source, /SelectableRow/);
  }
  for (const page of ["SkillsPage", "ServicesPage", "LogsPage", "DiagnosticsPage"]) {
    const source = read(`apps/web/src/features/platforms/openclaw/sections/${page}.tsx`);
    assert.match(source, /DetailRail/);
  }
  const configPage = read("apps/web/src/features/platforms/openclaw/sections/ConfigPage.tsx");
  assert.match(configPage, /RefreshButton/);
  assert.match(configPage, /refetch\(\)/);
  assert.match(configPage, /SectionNav/);
  assert.doesNotMatch(configPage, /DetailRail/);
});

test("OpenClaw native pages expose owner CRUD without Tracevane runtime handoff", () => {
  const config = read("apps/web/src/features/platforms/openclaw/sections/ConfigPage.tsx");
  const agents = read("apps/web/src/features/platforms/openclaw/sections/AgentsPage.tsx");
  const channels = read("apps/web/src/features/platforms/openclaw/sections/ChannelsPage.tsx");
  const bindings = read("apps/web/src/features/platforms/openclaw/sections/BindingsPage.tsx");
  assert.match(config, /配置页按 Settings 子页面分层/);
  assert.match(config, /常用项使用下拉、开关和数字控件/);
  assert.doesNotMatch(config, /高级证据/);
  assert.match(agents, /useCreateAgentMutation/);
  assert.match(agents, /useUpdateAgentMutation/);
  assert.match(agents, /useDeleteAgentMutation/);
  assert.match(agents, /新增 Agent/);
  assert.match(agents, /保存/);
  assert.match(agents, /删除/);
  assert.doesNotMatch(agents, /useAgentRuntimeRunsQuery/);
  assert.match(channels, /useCreateChannelMutation/);
  assert.match(channels, /useUpdateChannelMutation/);
  assert.match(channels, /useDeleteChannelMutation/);
  assert.match(channels, /useCreateChannelAccountMutation/);
  assert.match(channels, /useUpdateChannelAccountMutation/);
  assert.match(channels, /useDeleteChannelAccountMutation/);
  assert.match(channels, /新增 Channel/);
  assert.match(channels, /新增 Bot/);
  assert.match(channels, /字段来自 OpenClaw channel catalog/);
  assert.match(channels, /FieldGroups/);
  assert.match(bindings, /useCreateChannelBindingMutation/);
  assert.match(bindings, /useUpdateChannelBindingMutation/);
  assert.match(bindings, /useDeleteChannelBindingMutation/);
  assert.match(bindings, /新增绑定/);
  assert.match(bindings, /Bot \/ Account 到 Agent 或 ACP/);
  for (const source of [agents, channels, bindings]) {
    assert.doesNotMatch(source, /OwnerHandoff/);
    assert.doesNotMatch(source, /打开绑定路由|打开 CLI Agents|打开 IM 渠道/);
    assert.match(source, /SheetContent/);
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
