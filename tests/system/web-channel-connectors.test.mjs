import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FEATURE_DIR = "apps/web/src/features/channel-connectors";
const VIEWS_DIR = `${FEATURE_DIR}/views`;

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Channel Connectors daemon panel refreshes real supervisor status", () => {
  const panel = read(`${VIEWS_DIR}/DaemonServicePanel.tsx`);
  assert.match(panel, /runCommands: true/);
  assert.doesNotMatch(panel, /runCommands: action !== "status"/);
  assert.match(panel, /激活/);
  assert.match(panel, /开机自启/);
});

test("Channel Connectors page uses the Aurora IM Channels view contract", () => {
  const page = read(`${FEATURE_DIR}/ChannelConnectorsPage.tsx`);
  assert.match(page, /overview/);
  assert.match(page, /accounts/);
  assert.match(page, /routes/);
  assert.match(page, /deliveries/);
  assert.match(page, /diagnostics/);
  assert.doesNotMatch(page, /bindings/);
  assert.doesNotMatch(page, /logs/);
});

test("Channel Connectors overview derives daemon readiness and links to layered views", () => {
  const overview = read(`${VIEWS_DIR}/OverviewView.tsx`);
  assert.match(overview, /useChannelConnectorsStatusQuery/);
  assert.match(overview, /runtime\?\.reachable === true/);
  assert.match(overview, /manager\?\.active === true/);
  assert.match(overview, /DaemonServicePanel/);
  assert.match(overview, /goToView\("accounts"/);
  assert.match(overview, /goToView\("deliveries"/);
});

test("Channel Connectors accounts view supports account CRUD and verified smoke actions", () => {
  const accounts = read(`${VIEWS_DIR}/AccountsView.tsx`);
  assert.match(accounts, /新建平台账号/);
  assert.match(accounts, /账号身份/);
  assert.match(accounts, /groupAccounts/);
  assert.match(accounts, /确认删除/);
  assert.match(accounts, /useRunFeishuTransportSmokeMutation/);
  assert.match(accounts, /useRunOctoTransportSmokeMutation/);
  assert.match(accounts, /tenant-token/);
  assert.match(accounts, /register/);
});

test("Channel Connectors route view keeps routing separate from platform credentials", () => {
  const routes = read(`${VIEWS_DIR}/RoutesView.tsx`);
  assert.match(routes, /绑定路由/);
  assert.match(routes, /一个平台账号可以复制出多条路由/);
  assert.match(routes, /复制路由/);
  assert.match(routes, /已复制为停用路由/);
  assert.match(routes, /setEditing\(created \?\? nextBinding\)/);
  assert.match(routes, /删除副本路由/);
  assert.match(routes, /默认路由·保护/);
  assert.match(routes, /默认路由受保护/);
  assert.match(routes, /isCopiedRoute/);
  assert.match(routes, /实际 Agent \/ 模型/);
  assert.match(routes, /独立覆盖/);
  assert.doesNotMatch(routes, /appSecret/);
  assert.doesNotMatch(routes, /botToken/);
});

test("Channel Connectors account and route editors use wide Sheets with platform templates", () => {
  const editor = read(`${VIEWS_DIR}/BindingEditor.tsx`);
  assert.match(editor, /SheetContent/);
  assert.match(editor, /860px/);
  assert.match(editor, /App Secret/);
  assert.match(editor, /Bot Token/);
  assert.match(editor, /EncodingAESKey/);
  assert.match(editor, /高级 metadata JSON/);
  assert.match(editor, /\[redacted\]/);
  assert.match(editor, /编辑绑定路由/);
  assert.match(editor, /已同步 .* 条绑定路由/);
  assert.match(editor, /来源类型/);
  assert.match(editor, /allowlist/);
  assert.match(editor, /useModelGatewayModelsQuery/);
  assert.match(editor, /默认启动目录/);
  assert.match(editor, /路由 Agent/);
  assert.match(editor, /routeModel/);
  assert.match(editor, /手动模型 ID/);
  assert.match(editor, /模型列表加载失败，可在下方手动填写/);
});

test("Channel Connectors diagnostics demotes generated daemon bindings to evidence", () => {
  const diagnostics = read(`${VIEWS_DIR}/DiagnosticsView.tsx`);
  assert.match(diagnostics, /生成配置证据/);
  assert.match(diagnostics, /不再作为第二套用户编辑列表/);
  assert.match(diagnostics, /DaemonServicePanel/);
  assert.match(diagnostics, /日志摘要/);
  assert.match(diagnostics, /问题行优先/);
  assert.match(diagnostics, /break-all/);
  assert.match(diagnostics, /max-w-full/);
  assert.match(diagnostics, /overflow-x-auto/);
  assert.match(diagnostics, /flex-wrap/);
});

test("Channel Connectors session events prioritize human-readable incident summaries", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  assert.match(sessions, /需要关注的会话事件/);
  assert.match(sessions, /Agent 执行失败/);
  assert.match(sessions, /已触发 fallback/);
  assert.match(sessions, /原始事件类型保留为小标签/);
  assert.match(sessions, /parseImSessionIdentity/);
  assert.match(sessions, /sessionKey: event\.sessionKey/);
  assert.match(sessions, /peerKind: null/);
  assert.doesNotMatch(sessions, /detail: event\.sessionId \|\| "为该 IM 来源创建持久会话"/);
});

test("Channel Connectors deliveries compares route defaults with session overrides", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  const types = read("types/channel-connectors.ts");
  const daemon = read("apps/api/modules/channel-connectors/daemon.ts");
  assert.match(sessions, /routeDefaultsForSession/);
  assert.match(sessions, /默认路由/);
  assert.match(sessions, /当前会话/);
  assert.match(sessions, /会话覆盖/);
  assert.match(sessions, /跟随路由/);
  assert.match(sessions, /最后命令/);
  assert.match(sessions, /sessionControl\.lastCommand/);
  assert.match(sessions, /重置为默认/);
  assert.match(sessions, /reset-conversation/);
  assert.match(sessions, /确认重置为默认路由/);
  assert.match(sessions, /sessionDisplayTitle/);
  assert.match(sessions, /parseImSessionIdentity/);
  assert.match(sessions, /peerKindLabel/);
  assert.match(sessions, /飞书 · \$\{kind\}/);
  assert.match(sessions, /私聊会话/);
  assert.match(sessions, /群聊会话/);
  assert.match(sessions, /触发人/);
  assert.match(sessions, /技术标识/);
  assert.match(sessions, /routeSummary/);
  assert.match(sessions, /currentSessionSummary/);
  assert.match(sessions, /默认目录/);
  assert.doesNotMatch(sessions, /session\.sessionId\}\s*<\/strong>/);
  assert.equal((sessions.match(/useSaveChannelConnectorsConfigMutation/g) || []).length, 2);
  assert.match(types, /ChannelConnectorAgentSessionControlStatus/);
  assert.match(types, /lastCommand: string \| null/);
  assert.match(types, /permissionMode: ChannelConnectorPermissionMode \| null/);
  assert.match(types, /workDir: string/);
  assert.match(types, /peerKind: string \| null/);
  assert.match(types, /peerId: string \| null/);
  assert.match(daemon, /permissionMode: project.permissionMode/);
  assert.match(daemon, /workDir: project.workDir/);
  assert.match(daemon, /peerKind: normalizeString\(binding\.metadata\?\.peerKind\) \|\| null/);
  assert.match(daemon, /peerId: normalizeString\(binding\.metadata\?\.peerId\) \|\| null/);
  assert.match(daemon, /readChannelConnectorSessionControls/);
  assert.match(daemon, /sessionControl: control \?/);
  assert.match(daemon, /action === "reset-conversation"/);
  assert.match(daemon, /clearChannelConnectorSessionControl/);
  assert.match(daemon, /clearChannelConnectorAgentSessionsForConversation/);
  assert.match(daemon, /clearChannelConnectorConversationHistory/);
});


test("Model Gateway browser model list uses namespaced API path", () => {
  const api = read("apps/web/src/lib/api/model-gateway.ts");
  const routes = read("apps/api/modules/model-gateway/routes.ts");
  assert.match(api, /\$\{BASE\}\/models/);
  assert.doesNotMatch(api, /apiRequest<ModelGatewayModelListResponse>\(`\/v1\/models/);
  assert.match(routes, /\/api\/model-gateway\/models/);
});

test("Channel Connectors route and log views keep dense evidence within responsive bounds", () => {
  const routes = read(`${VIEWS_DIR}/RoutesView.tsx`);
  const diagnostics = read(`${VIEWS_DIR}/DiagnosticsView.tsx`);
  const table = read("apps/web/src/design/ui/table.tsx");
  assert.match(table, /tv-table-wrap max-w-full overflow-hidden/);
  assert.match(table, /sm:overflow-x-auto/);
  assert.match(routes, /min-w-full/);
  assert.match(routes, /hidden md:table-cell/);
  assert.match(routes, /hidden lg:table-cell/);
  assert.match(routes, /md:hidden/);
  assert.doesNotMatch(routes, /移动端绑定路由卡片/);
  assert.match(routes, /break-all/);
  assert.match(routes, /flex-wrap justify-end/);
  assert.match(diagnostics, /overflow-x-auto/);
  assert.match(diagnostics, /whitespace-pre-wrap/);
});


test("Channel Connectors deliveries expose global concurrency and queue policy", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  assert.match(sessions, /全局并发 \/ 队列策略/);
  assert.match(sessions, /maxConcurrentTurns/);
  assert.match(sessions, /queueMaxRecords/);
  assert.match(sessions, /不同会话竞争这个全局槽位/);
  assert.match(sessions, /保存并重启/);
  assert.match(sessions, /action: "restart", apply: true, runCommands: true/);
  assert.match(sessions, /useManageChannelConnectorsDaemonServiceMutation/);
  assert.match(sessions, /运行中已同步/);
  assert.match(sessions, /已保存，需重启/);
  assert.match(sessions, /policyNotice/);
  assert.match(sessions, /已保存并重启 IM 守护；新的并发\/队列策略已写入 daemon 配置/);
});

test("Channel Connectors deliveries keeps hooks before loading guards", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  assert.ok(
    sessions.indexOf("React.useMemo") < sessions.indexOf("sessionsQuery.isLoading"),
    "policy hooks must run before loading/error returns to avoid blank screens after query state changes",
  );
});
