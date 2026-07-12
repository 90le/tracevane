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
  assert.match(panel, /const manager = data\?\.serviceManager/);
  assert.match(panel, /\{ action, mode, apply: true \}/);
  assert.doesNotMatch(panel, /runCommands/);
  assert.match(panel, /激活/);
  assert.match(panel, /开机自启/);
  assert.match(panel, /IM 接收与回复会暂时不可用/);
});

test("Channel Connectors page exposes only the v3 object model", () => {
  const page = read(`${FEATURE_DIR}/ChannelConnectorsPage.tsx`);
  const types = read(`${VIEWS_DIR}/types.ts`);
  for (const view of ["overview", "workspaces", "accounts", "sessions", "runtime"]) {
    assert.match(types, new RegExp(`"${view}"`));
  }
  assert.match(page, /Agent 工作区/);
  assert.match(page, /渠道账号/);
  assert.match(page, /运行中心/);
  assert.match(page, /import\("\.\/views\/V3OverviewView"\)/);
  assert.match(page, /import\("\.\/views\/WorkspacesView"\)/);
  assert.match(page, /import\("\.\/views\/V3AccountsView"\)/);
  assert.match(page, /import\("\.\/views\/V3RuntimeView"\)/);
  assert.doesNotMatch(page, /value === "routes"/);
  assert.doesNotMatch(page, /value === "deliveries"/);
  assert.doesNotMatch(page, /value === "diagnostics"/);
  assert.doesNotMatch(types, /"routes",/);
  assert.doesNotMatch(types, /"deliveries",/);
  assert.doesNotMatch(types, /"diagnostics",/);
  assert.match(page, /React\.lazy/);
  assert.match(page, /React\.Suspense/);
});

test("Channel Connectors browser data layer uses v3 plan and apply APIs", () => {
  const api = read("apps/web/src/lib/api/channel-connectors.ts");
  const query = read("apps/web/src/lib/query/channel-connectors.ts");
  assert.match(api, /config\/v3\/plan/);
  assert.match(api, /config\/v3\/apply/);
  assert.match(api, /config\/v3\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/secrets/);
  assert.match(api, /config\/v3\/routing-preview/);
  assert.match(api, /X-Tracevane-Secret-Reveal/);
  assert.match(query, /useChannelConnectorsV3ConfigQuery/);
  assert.match(query, /usePlanChannelConnectorsV3ConfigMutation/);
  assert.match(query, /useApplyChannelConnectorsV3ConfigMutation/);
  assert.match(query, /useChannelConnectorAccountSecretsQuery/);
  assert.match(query, /usePreviewChannelConnectorV3RoutingMutation/);
  const applyMutation = query.slice(
    query.indexOf("export function useApplyChannelConnectorsV3ConfigMutation"),
    query.indexOf("export function usePreviewChannelConnectorV3RoutingMutation"),
  );
  assert.match(applyMutation, /channelConnectorsKeys\.agentSessions\(\)/);
});

test("v3 overview separates saved, connected, and real-ingress readiness", () => {
  const overview = read(`${VIEWS_DIR}/V3OverviewView.tsx`);
  assert.match(overview, /useChannelConnectorsV3ConfigQuery/);
  assert.match(overview, /接入已验证/);
  assert.match(overview, /等待首条消息/);
  assert.match(overview, /长连接正常；需从飞书发送真实消息/);
  assert.match(overview, /Agent 工作区/);
  assert.match(overview, /入站队列/);
  assert.match(overview, /重复已拦截/);
  assert.match(overview, /goToView\("accounts"/);
  assert.match(overview, /goToView\("sessions"/);
  assert.match(overview, /goToView\("runtime"/);
  assert.match(overview, /会话运行态暂不可用/);
});

test("Agent workspaces are reusable targets with explicit execution boundaries", () => {
  const workspaces = read(`${VIEWS_DIR}/WorkspacesView.tsx`);
  assert.match(workspaces, /Agent 工作区/);
  assert.match(workspaces, /一个工作区是一套可复用的 Agent 执行环境/);
  assert.match(workspaces, /启动目录/);
  assert.match(workspaces, /Gateway API 地址/);
  assert.match(workspaces, /workspaceConcurrency: 1/);
  assert.match(workspaces, /targetUsage/);
  assert.match(workspaces, /工作区仍被渠道账号引用/);
  assert.match(workspaces, /usePlanChannelConnectorsV3ConfigMutation/);
  assert.match(workspaces, /useApplyChannelConnectorsV3ConfigMutation/);
  assert.doesNotMatch(workspaces, /appSecret|botToken|verificationToken/);
});

test("channel account editor owns credentials, default target, exceptions, and advanced extensions", () => {
  const accounts = read(`${VIEWS_DIR}/V3AccountsView.tsx`);
  const fields = read(`${VIEWS_DIR}/V3Fields.tsx`);
  assert.match(accounts, /每个账号只有一个默认 Agent 工作区/);
  assert.match(accounts, /默认投递/);
  assert.match(accounts, /来源例外/);
  assert.match(accounts, /全部消息使用默认工作区/);
  assert.match(accounts, /RuleEditor/);
  assert.match(accounts, /分发预览/);
  assert.match(accounts, /useChannelConnectorAccountSecretsQuery/);
  assert.match(accounts, /正在读取已保存密钥以支持明文回显/);
  assert.match(fields, /type=\{visible \? "text" : "password"\}/);
  assert.match(fields, /显示\$\{label\}/);
  assert.doesNotMatch(fields, /替换/);
  assert.match(accounts, /App Secret/);
  assert.match(accounts, /Verification Token/);
  assert.match(accounts, /Bot Token/);
  assert.match(accounts, /allowPrivateAttachmentUrls/);
  assert.match(accounts, /默认拒绝内网地址以防 SSRF/);
  assert.match(accounts, /高级平台 JSON/);
  assert.match(accounts, /未界面化扩展字段/);
});

test("channel account plan opens only after planning succeeds", () => {
  const accounts = read(`${VIEWS_DIR}/V3AccountsView.tsx`);
  assert.doesNotMatch(accounts, /setPlanOpen\(true\);\s*planMutation\.mutate/);
  assert.match(accounts, /onSuccess: \(nextPlan\) => \{\s*setPlan\(nextPlan\);\s*setPlanOpen\(true\);\s*\}/);
  assert.match(accounts, /onError: \(error\) => \{\s*setPendingCandidate\(null\);/);
});

test("channel account plan guards editor and delete interactions while pending", () => {
  const accounts = read(`${VIEWS_DIR}/V3AccountsView.tsx`);
  const editor = accounts.slice(
    accounts.indexOf("function AccountEditor"),
    accounts.indexOf("export function V3AccountsView"),
  );
  const deleteDialog = accounts.slice(
    accounts.indexOf("<Dialog open={deleteAccount != null}"),
    accounts.indexOf("<V3PlanDialog"),
  );

  assert.match(editor, /if \(planning && !nextOpen\) return;\s*onOpenChange\(nextOpen\);/);
  assert.match(editor, /<Dialog open=\{open\} onOpenChange=\{handleOpenChange\}>/);
  assert.match(editor, /<DialogContent[^>]*showClose=\{!planning\}/);
  assert.match(editor, /<Button variant="ghost" disabled=\{planning\} onClick=\{\(\) => handleOpenChange\(false\)\}>取消<\/Button>/);

  assert.match(accounts, /const requestPlan = \(candidate: ChannelConnectorsV3Config\) => \{\s*if \(planMutation\.isPending\) return;/);
  assert.match(accounts, /if \(open \|\| planMutation\.isPending\) return;\s*setDeleteAccount\(null\);/);
  assert.match(deleteDialog, /<DialogContent showClose=\{!planMutation\.isPending\}>/);
  assert.match(deleteDialog, /variant="ghost" disabled=\{planMutation\.isPending\}/);
  assert.match(deleteDialog, /variant="danger" disabled=\{planMutation\.isPending\}/);
  assert.match(deleteDialog, /planMutation\.isPending \? <Loader2 className="animate-spin" \/> : <Trash2 \/>/);
  assert.match(deleteDialog, /planMutation\.isPending \? "正在检查…" : "检查并删除"/);
});

test("Feishu account creation renders a real local QR code and keeps manual fields editable", () => {
  const accounts = read(`${VIEWS_DIR}/V3AccountsView.tsx`);
  assert.match(accounts, /QRCodeSVG/);
  assert.match(accounts, /生成扫码授权/);
  assert.match(accounts, /使用手机飞书\/Lark 扫码/);
  assert.match(accounts, /二维码由本机根据授权链接生成/);
  assert.match(accounts, /打开链接/);
  assert.match(accounts, /App ID 与 App Secret 已回填/);
  assert.match(accounts, /扫码授权或手动配置/);
  assert.match(accounts, /所有字段仍可查看和自由修改/);
});

test("v3 mutations show semantic impact before apply", () => {
  const plan = read(`${VIEWS_DIR}/V3PlanDialog.tsx`);
  assert.match(plan, /确认配置影响/);
  assert.match(plan, /账号重连/);
  assert.match(plan, /分发更新/);
  assert.match(plan, /进行中回合保持原快照/);
  assert.match(plan, /工作区变更/);
  assert.match(plan, /已有会话/);
  assert.match(plan, /existingSessionsAffected/);
  assert.match(plan, /默认保留，不静默清空/);
  assert.match(plan, /应用变更/);
  assert.match(plan, /validationIssues/);
});

test("runtime center presents one connection per account plus queue and reload evidence", () => {
  const runtime = read(`${VIEWS_DIR}/V3RuntimeView.tsx`);
  assert.match(runtime, /按渠道账号观察连接/);
  assert.match(runtime, /一账号一连接/);
  assert.match(runtime, /等待首条消息/);
  assert.match(runtime, /入站与去重/);
  assert.match(runtime, /重复事件/);
  assert.match(runtime, /回复 Outbox/);
  assert.match(runtime, /回复死信/);
  assert.match(runtime, /不包含回复正文和凭据/);
  assert.match(runtime, /配置热重载/);
  assert.match(runtime, /规则与工作区更新不会重启平台连接或中断当前回合/);
  assert.match(runtime, /运行期映射由渠道账号、分发策略与 Agent 工作区生成/);
  assert.match(runtime, /DaemonServicePanel/);
  assert.match(runtime, /守护日志/);
});

test("legacy binding-oriented Channel Connector pages are removed", () => {
  for (const fileName of [
    "AccountsView.tsx",
    "RoutesView.tsx",
    "BindingEditor.tsx",
    "OverviewView.tsx",
    "DiagnosticsView.tsx",
    "LogsView.tsx",
    "account-runtime.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(rootDir, VIEWS_DIR, fileName)), false, fileName);
  }
});

test("sessions save global policy through v3 plan/apply and retain guarded controls", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  assert.match(sessions, /全局并发 \/ 队列策略/);
  assert.match(sessions, /useChannelConnectorsV3ConfigQuery/);
  assert.match(sessions, /usePlanChannelConnectorsV3ConfigMutation/);
  assert.match(sessions, /useApplyChannelConnectorsV3ConfigMutation/);
  assert.match(sessions, /rollbackOnFailure: true/);
  assert.match(sessions, /reset-conversation/);
  assert.match(sessions, /需要关注的会话事件/);
  assert.match(sessions, /parseImSessionIdentity/);
  assert.match(sessions, /守护离线，会话运行态暂不可用/);
  assert.match(sessions, /disabled=\{pending \|\| !runtimeReachable\}/);
  assert.doesNotMatch(sessions, /useApplyChannelConnectorsConfigMutation/);
});

test("Channel Connectors dense evidence stays inside responsive bounds", () => {
  const runtime = read(`${VIEWS_DIR}/V3RuntimeView.tsx`);
  const accounts = read(`${VIEWS_DIR}/V3AccountsView.tsx`);
  const table = read("apps/web/src/design/ui/table.tsx");
  assert.match(table, /tv-table-wrap w-full min-w-0 max-w-full overflow-hidden/);
  assert.match(table, /sm:overflow-x-auto/);
  assert.match(runtime, /overflow-x-auto/);
  assert.match(runtime, /whitespace-pre-wrap/);
  assert.match(accounts, /w-\[min\(980px,97vw\)\]/);
  assert.match(accounts, /overflow-y-auto/);
});

test("Channel Connectors sessions keep hooks before loading guards", () => {
  const sessions = read(`${VIEWS_DIR}/SessionsView.tsx`);
  assert.ok(
    sessions.indexOf("React.useMemo") < sessions.indexOf("sessionsQuery.isLoading"),
    "policy hooks must run before loading/error returns",
  );
});
