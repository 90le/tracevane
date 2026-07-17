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
  assert.ok(
    sections.indexOf('id: "channels"') < sections.indexOf('id: "bindings"') &&
      sections.indexOf('id: "bindings"') < sections.indexOf('id: "skills"'),
    "OpenClaw navigation keeps Channel / Binding together before Skills",
  );
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





test("OpenClaw guard service status uses the canonical manager snapshot", () => {
  const service = read("apps/api/modules/openclaw-recovery/service.ts");
  assert.match(service, /daemonServiceManager\.manage/);
  assert.match(service, /service: serviceSnapshot\(managed\.manager\)/);
  assert.match(service, /activeState: legacyActiveState\(manager\)/);
  assert.doesNotMatch(service, /function preferKnownState/);
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
  assert.match(page, /modelOptionsFromConfig/);
  assert.match(page, /ModelListField/);
  assert.match(page, /<SelectField label="默认模型"/);
  assert.match(page, /<SelectField label="子代理模型"/);
  assert.match(page, /<SelectField label="图片模型"/);
  assert.match(page, /<SelectField label="PDF 模型"/);
  assert.match(page, /<SelectField label="压缩模型"/);
  assert.doesNotMatch(page, /<TextField label="默认模型"/);
  assert.doesNotMatch(page, /DetailRail/);
  assert.doesNotMatch(page, /高级证据/);
  assert.doesNotMatch(page, /parseJsonField/);
  assert.doesNotMatch(page, /xl:grid-cols-\[minmax\(0,1fr\)_380px\]/);
  assert.doesNotMatch(page, /config\.isLoading \|\| diagnostics\.isLoading/);
});

test("OpenClaw service log diagnostic pages stay light and defensive", () => {
  const overview = read("apps/web/src/features/platforms/openclaw/OpenClawView.tsx");
  const services = read("apps/web/src/features/platforms/openclaw/sections/ServicesPage.tsx");
  const logs = read("apps/web/src/features/platforms/openclaw/sections/LogsPage.tsx");
  const diagnostics = read("apps/web/src/features/platforms/openclaw/sections/DiagnosticsPage.tsx");
  const skills = read("apps/web/src/features/platforms/openclaw/sections/SkillsPage.tsx");
  const platformApi = read("apps/web/src/lib/api/platform-read.ts");
  const platformQuery = read("apps/web/src/lib/query/platform-read.ts");
  const systemRoutes = read("apps/api/modules/system/routes.ts");
  const systemService = read("apps/api/modules/system/service.ts");
  const skillRoutes = read("apps/api/modules/skills/routes.ts");
  const skillService = read("apps/api/modules/skills/service.ts");
  assert.match(overview, /includeDiagnostics: false/);
  assert.match(overview, /不触发 doctor、命令探测或完整诊断/);
  assert.match(overview, /primarySections/);
  assert.doesNotMatch(overview, /deriveControlUiUrl/);
  assert.match(services, /服务状态/);
  assert.match(services, /状态详情/);
  assert.match(services, /进入“守护”页执行诊断\/修复/);
  assert.match(logs, /useRecoveryEventsQuery\(1, 40\)/);
  assert.doesNotMatch(logs, /useAgentRuntimeRunsQuery/);
  assert.match(logs, /severityLabel/);
  assert.match(diagnostics, /data\?\.bootstrap\?\.checks \?\? \[\]/);
  assert.match(diagnostics, /data\?\.deviceTrust\?\.helper\?\.paired/);
  assert.match(diagnostics, /!data && \(diagnostics\.isLoading \|\| diagnostics\.isPending \|\| diagnostics\.isFetching\)/);
  assert.match(diagnostics, /includeCommands/);
  assert.match(diagnostics, /加载命令证据/);
  assert.match(diagnostics, /慢命令证据不会阻塞首屏/);
  assert.match(diagnostics, /无法加载诊断摘要/);
  assert.match(diagnostics, /页面无内容，刷新会重新拉取诊断数据/);
  assert.match(skills, /fast: !fullScan/);
  assert.match(skills, /完整扫描/);
  assert.match(skills, /正在加载快速 Skills 摘要/);
  assert.match(platformApi, /commands=0/);
  assert.match(platformApi, /fast.*1/);
  assert.match(platformQuery, /diagnostics\(mode/);
  assert.match(platformQuery, /skills\(mode/);
  assert.match(systemRoutes, /searchParams\.get\("commands"\) !== "0"/);
  assert.match(systemService, /skipped for fast diagnostics/);
  assert.match(skillRoutes, /searchParams\.get\('fast'\) === '1'/);
  assert.match(skillService, /buildFastSummary/);
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
  assert.match(agents, /modelOptions/);
  assert.match(agents, /继承默认模型（不单独配置）/);
  assert.match(agents, /留空可继承默认模型/);
  assert.doesNotMatch(agents, /必须从可用模型列表选择模型/);
  assert.match(agents, /<SelectInput label="模型"/);
  assert.doesNotMatch(agents, /<TextInput label="模型"/);
  assert.match(agents, /BatchAgentDraft/);
  assert.match(agents, /batchFields/);
  assert.match(agents, /buildBatchPayload/);
  assert.match(agents, /payload\.model = batchDraft\.model\.trim\(\)/);
  assert.match(agents, /payload\.workspace = batchDraft\.workspace\.trim\(\)/);
  assert.match(agents, /payload\.enabled = batchDraft\.enabled/);
  assert.match(agents, /批量编辑/);
  assert.match(agents, /只修改勾选字段/);
  assert.match(agents, /未勾选字段保持每个 Agent 原有配置/);
  assert.match(agents, /for \(const agent of batchTargets\) await updateAgent\.mutateAsync/);
  assert.doesNotMatch(agents, /Promise\.all\(batchTargets/);
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
  assert.match(bindings, /formatAgentOptionLabel/);
  assert.match(bindings, /\$\{name\}（\$\{agent\.id\}）/);
  assert.match(bindings, /agentSelectOptions/);
  assert.ok(
    bindings.indexOf("const [draft, setDraft]") < bindings.indexOf("accountOptionsForDraft"),
    "binding account options must be derived after draft state is initialized",
  );
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
  assert.match(overview, /usePlatformsAggregate\(\{ includeDiagnostics: false \}\)/);
  assert.match(aggregate, /includeDiagnostics \?\? false/);
  assert.match(aggregate, /enabled: includeDiagnostics/);
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
