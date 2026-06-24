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
  assert.match(accounts, /确认删除/);
  assert.match(accounts, /useRunFeishuTransportSmokeMutation/);
  assert.match(accounts, /useRunOctoTransportSmokeMutation/);
  assert.match(accounts, /tenant-token/);
  assert.match(accounts, /register/);
});

test("Channel Connectors route view keeps routing separate from platform credentials", () => {
  const routes = read(`${VIEWS_DIR}/RoutesView.tsx`);
  assert.match(routes, /绑定路由/);
  assert.match(routes, /平台凭据在/);
  assert.match(routes, /Agent Profile/);
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
  assert.match(editor, /来源类型/);
  assert.match(editor, /allowlist/);
});

test("Channel Connectors diagnostics demotes generated daemon bindings to evidence", () => {
  const diagnostics = read(`${VIEWS_DIR}/DiagnosticsView.tsx`);
  assert.match(diagnostics, /生成配置证据/);
  assert.match(diagnostics, /不再作为第二套用户编辑列表/);
  assert.match(diagnostics, /DaemonServicePanel/);
  assert.match(diagnostics, /最近日志/);
});
