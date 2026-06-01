import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const quickConfigDialogPath = path.join(
  rootDir,
  "apps/web-vue/src/features/agents/AgentQuickConfigDialog.vue",
);
const quickConfigDialogExists = fs.existsSync(quickConfigDialogPath);
const quickConfigDialogContent = quickConfigDialogExists
  ? fs.readFileSync(quickConfigDialogPath, "utf8")
  : "";

const agentsControlPagePath = path.join(
  rootDir,
  "apps/web-vue/src/features/agents/AgentsControlPage.vue",
);
const agentsControlPageContent = fs.existsSync(agentsControlPagePath)
  ? fs.readFileSync(agentsControlPagePath, "utf8")
  : "";
const stylePath = path.join(rootDir, "apps/web-vue/src/style.css");
const styleContent = fs.existsSync(stylePath)
  ? fs.readFileSync(stylePath, "utf8")
  : "";
const agentsStylePath = path.join(rootDir, "apps/web-vue/src/features/agents/agents-workspace.css");
const agentsStyleContent = fs.existsSync(agentsStylePath)
  ? fs.readFileSync(agentsStylePath, "utf8")
  : "";
const agentsWorkspaceLayoutPath = path.join(
  rootDir,
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
);
const agentsWorkspaceLayoutContent = fs.existsSync(agentsWorkspaceLayoutPath)
  ? fs.readFileSync(agentsWorkspaceLayoutPath, "utf8")
  : "";

test("agent quick config stays compact after the ledger rebuild", () => {
  assert.match(quickConfigDialogContent, /Display Name/);
  assert.match(quickConfigDialogContent, /Runtime Type/);
  assert.match(quickConfigDialogContent, /Workspace-only FS access/);
  assert.doesNotMatch(quickConfigDialogContent, /Memory Search JSON/);
  assert.doesNotMatch(quickConfigDialogContent, /Raw Config Snapshot/);
});

test("agents polish keeps newcomer guidance and deep-page escape hatches visible", () => {
  assert.match(
    agentsControlPageContent,
    /agents-overview-identity/,
  );
  assert.match(
    agentsControlPageContent,
    /高频快改|High-frequency quick edits/,
  );
  assert.match(
    quickConfigDialogContent,
    /更完整的人设、路由和运行配置都可以从当前工作区直接打开。/,
  );
  assert.match(quickConfigDialogContent, /打开人设/);
  assert.match(quickConfigDialogContent, /打开路由/);
  assert.match(quickConfigDialogContent, /打开运行/);
});

test("agents overview exposes fast per-agent HEARTBEAT controls without opening raw config", () => {
  assert.match(agentsControlPageContent, /Built-in HEARTBEAT/);
  assert.match(agentsControlPageContent, /quickEdit\.heartbeatMode/);
  assert.match(agentsControlPageContent, /resolveHeartbeatMode\(payload\.editor\.heartbeat\)/);
  assert.match(agentsControlPageContent, /buildAgentHeartbeatConfig\(detail\.value\.editor\.heartbeat, quickEdit\.heartbeatMode, quickEdit\.heartbeatEvery\)/);
  assert.match(agentsControlPageContent, /every: "0m"/);
});

test("agents polish keeps mobile action groups stacked for thumb reach", () => {
  assert.match(
    agentsStyleContent,
    /@media \(max-width: 720px\)[\s\S]*\.agent-rail-list\s*\{[\s\S]*max-height:/,
  );
  assert.match(
    agentsStyleContent,
    /@media \(max-width: 960px\)[\s\S]*\.agents-workspace-shell[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    agentsStyleContent,
    /\.agents-stage-header__actions\s*\{[\s\S]*justify-content:\s*flex-end;/,
  );
  assert.match(agentsWorkspaceLayoutContent, /class="agents-task-nav studio-workbench-task-nav"/);
  assert.match(agentsWorkspaceLayoutContent, /class="agents-task-nav-button studio-workbench-task-nav-button"/);
  assert.doesNotMatch(agentsStyleContent, /\.agents-task-nav-button\s*\{/);
  assert.doesNotMatch(agentsStyleContent, /\.agents-stage-tabs|\.agents-stage-tab/);
  assert.match(agentsStyleContent, /\.agent-rail-item/);
  assert.match(agentsStyleContent, /\.agent-filter-chip/);
});

test("agents workspace css is owned by the agents feature", () => {
  assert.match(agentsWorkspaceLayoutContent, /import ['"]\.\/agents-workspace\.css['"]/);
  assert.match(agentsStyleContent, /Agents workspace surfaces live with the Agents feature/);
  assert.doesNotMatch(styleContent, /\.(?:agents|agent-(?:rail|filter))[a-zA-Z0-9_-]*/);
});
