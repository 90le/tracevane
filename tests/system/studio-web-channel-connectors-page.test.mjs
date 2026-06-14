import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..", "..");

const manifestPath = path.join(rootDir, "apps/web-vue/src/features/shell/route-manifest.ts");
const pagePath = path.join(rootDir, "apps/web-vue/src/features/channel-connectors/ChannelConnectorsControlPage.vue");
const apiPath = path.join(rootDir, "apps/web-vue/src/features/channel-connectors/api.ts");
const viewPath = path.join(rootDir, "apps/web-vue/src/views/ChannelConnectorsView.vue");
const gatewayViewPath = path.join(rootDir, "apps/web-vue/src/views/ModelGatewayView.vue");
const gatewayPagePath = path.join(rootDir, "apps/web-vue/src/features/model-gateway/ModelGatewayControlPage.vue");

test("Channel Connectors has a standalone shell route and nav item", () => {
  const manifest = fs.readFileSync(manifestPath, "utf8");
  assert.match(manifest, /ChannelConnectorsView/);
  assert.match(manifest, /key:\s*"channel-connectors"/);
  assert.match(manifest, /to:\s*"\/channel-connectors"/);
  assert.match(manifest, /path:\s*"\/channel-connectors"/);
  assert.match(manifest, /labelEn:\s*"Channel Connectors"/);
  assert.match(manifest, /icon:\s*"channel-connectors"/);
});

test("Channel Connectors page is not mounted through Model Gateway", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");
  const view = fs.readFileSync(viewPath, "utf8");
  const gatewayView = fs.readFileSync(gatewayViewPath, "utf8");
  const gatewayPage = fs.readFileSync(gatewayPagePath, "utf8");

  assert.match(view, /ChannelConnectorsControlPage/);
  assert.doesNotMatch(page, /model-gateway|ModelGateway/i);
  assert.doesNotMatch(api, /model-gateway|ModelGateway/i);
  assert.doesNotMatch(gatewayView, /ChannelConnectors/);
  assert.doesNotMatch(gatewayPage, /ChannelConnectors|Channel daemon/);
});

test("Channel Connectors page calls only channel connector APIs", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");

  for (const endpoint of [
    "/api/channel-connectors/status",
    "/api/channel-connectors/config",
    "/api/channel-connectors/commands/surface",
    "/api/channel-connectors/commands/action",
    "/api/channel-connectors/adapters/feishu/transport-smoke",
    "/api/channel-connectors/adapters/octo/transport-smoke",
    "/api/channel-connectors/daemon/config",
    "/api/channel-connectors/daemon/service",
    "/api/channel-connectors/daemon/logs",
    "/api/channel-connectors/agent-sessions",
  ]) {
    assert.match(api, new RegExp(endpoint.replace(/\//g, "\\/")));
  }

  assert.match(page, /Overview/);
  assert.match(page, /Bindings/);
  assert.match(page, /Runtime/);
  assert.match(page, /Sessions/);
  assert.match(page, /\/channel-connectors\/profiles/);
  assert.match(page, /profileWorkspaceRoute/);
  assert.match(page, /query:\s*profileId \? \{ profileId \} : \{\}/);
  assert.match(page, /useRoute/);
  assert.match(page, /routeProfileId/);
  assert.match(page, /routeBindingId/);
  assert.match(page, /binding\.id === routeBindingId\.value/);
  assert.match(page, /binding\.agentProfileId === routeProfileId\.value/);
  assert.match(page, /activeTab\.value = 'bindings'/);
  assert.match(page, /Channel operations|渠道运营概览/);
  assert.match(page, /Profile workspace|Profile 工作台/);
  assert.match(page, /Agent Profile/);
  assert.match(page, /metadataFromBindingDraft/);
  assert.match(page, /metadataBotToken/);
  assert.match(page, /metadataAppSecret/);
  assert.match(page, /metadataVerificationToken/);
  assert.match(page, /metadataChatIdsText/);
  assert.match(page, /metadataFeishuProgressCardEntryLimit/);
  assert.match(page, /feishuProgressCardEntryLimit/);
  assert.match(page, /setMetadataInteger\(metadata,\s*'feishuProgressCardEntryLimit'/);
  assert.match(page, /min="1"/);
  assert.match(page, /max="30"/);
  assert.match(page, /runOctoTransportSmoke/);
  assert.match(page, /runFeishuTransportSmoke/);
  assert.match(page, /fetchChannelConnectorAgentSessions/);
  assert.match(page, /manageChannelConnectorAgentSessions/);
  assert.match(page, /killAgentSession/);
  assert.match(page, /reapAgentSessions/);
  assert.match(page, /recentAgentSessionEvents/);
  assert.match(page, /turn\.fallback/);
  assert.match(page, /autoCompactRecords/);
  assert.match(page, /latestAutoCompact/);
  assert.match(page, /Auto compact/);
  assert.match(page, /Effective used|有效使用/);
  assert.match(page, /Retry window|重试窗口/);
  assert.match(page, /autoCompactBudgetLine/);
  assert.match(page, /Test|测试连接/);
  assert.match(page, /Reap idle|清理空闲/);
  assert.match(page, /Save binding|保存绑定/);
  assert.doesNotMatch(page, /CLI Profile 快改|CLI profile quick edit/);
  assert.doesNotMatch(page, /Save profile|保存 Profile/);
  assert.doesNotMatch(page, /渠道 Skills|Channel skills/);
  assert.match(page, /wechat/);
  assert.doesNotMatch(page, /\/api\/model-gateway/);
  assert.doesNotMatch(page, /cc-connect|CC Bridge/);
});
