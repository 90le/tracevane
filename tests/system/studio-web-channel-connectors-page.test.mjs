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
  assert.doesNotMatch(gatewayPage, /ChannelConnectors|CC Bridge daemon/);
});

test("Channel Connectors page calls only channel connector APIs", () => {
  const page = fs.readFileSync(pagePath, "utf8");
  const api = fs.readFileSync(apiPath, "utf8");

  for (const endpoint of [
    "/api/channel-connectors/status",
    "/api/channel-connectors/cc-bridge/config",
    "/api/channel-connectors/cc-bridge/service",
    "/api/channel-connectors/cc-bridge/logs",
  ]) {
    assert.match(api, new RegExp(endpoint.replace(/\//g, "\\/")));
  }

  assert.match(page, /Runtime/);
  assert.match(page, /Projects/);
  assert.match(page, /Platforms/);
  assert.match(page, /Sessions/);
  assert.match(page, /wechatPersonal|Personal WeChat/);
  assert.doesNotMatch(page, /\/api\/model-gateway/);
});
