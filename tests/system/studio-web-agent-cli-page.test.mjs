import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

test("Agent CLI page is wired as a first-class Agents task route", () => {
  const routeManifest = read("apps/web-vue/src/features/shell/route-manifest.ts");
  const layout = read("apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue");
  const index = read("apps/web-vue/src/features/agents/index.ts");

  assert.match(routeManifest, /const AgentCliPage = \(\) => import\("\.\.\/agents\/AgentCliPage\.vue"\)/);
  assert.match(routeManifest, /AgentCliPage,/);
  assert.match(routeManifest, /path:\s*":agentId\/cli",\s*component:\s*AgentCliPage/);
  assert.match(layout, /type AgentTaskSection = 'overview' \| 'cli'/);
  assert.match(layout, /label:\s*'CLI'/);
  assert.match(layout, /return `\/agents\/\$\{encoded\}\/cli`/);
  assert.match(index, /AgentCliPage/);
});

test("Agent CLI page edits Channel Connector profiles using Gateway model catalog", () => {
  const page = read("apps/web-vue/src/features/agents/AgentCliPage.vue");
  const styles = read("apps/web-vue/src/features/agents/agents-workspace.css");

  assert.match(page, /fetchModelGatewayAppConnections/);
  assert.match(page, /fetchModelGatewayProviders/);
  assert.match(page, /appConnections\.availableModels/);
  assert.match(page, /collectGatewayProviderModelNames/);
  assert.match(page, /model\.aliases/);
  assert.match(page, /fetchChannelConnectorsNativeConfig/);
  assert.match(page, /saveChannelConnectorsNativeConfig/);
  assert.match(page, /fetchChannelConnectorAgentSessions/);
  assert.match(page, /manageChannelConnectorAgentSessions/);
  assert.match(page, /CLI Profiles/);
  assert.match(page, /Gateway Endpoint/);
  assert.match(page, /IM Bindings/);
  assert.match(page, /Sessions and records/);
  assert.match(page, /agents-cli-rail/);
  assert.match(page, /agents-cli-main/);
  assert.match(page, /agents-cli-activity/);
  assert.match(page, /agents-cli-config-section/);
  assert.match(page, /Model and context/);
  assert.match(page, /Budget source/);
  assert.match(page, /Context window/);
  assert.match(page, /Auto compact/);
  assert.match(page, /appConnectionProfile/);
  assert.match(page, /gatewayModelBudgetIndex/);
  assert.match(page, /deriveAutoCompactTokenLimit/);
  assert.match(styles, /\.agents-cli-layout/);
  assert.match(styles, /\.agents-cli-rail/);
  assert.match(styles, /\.agents-cli-main/);
  assert.match(styles, /\.agents-cli-activity/);
  assert.match(styles, /\.agents-cli-config-section/);
  assert.match(styles, /\.agents-cli-budget-strip/);
  assert.match(styles, /\.agents-cli-select-row/);
});
