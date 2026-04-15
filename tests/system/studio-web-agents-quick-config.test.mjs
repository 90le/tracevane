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
    /更完整的文档、绑定和高级设置都可以从当前工作区直接打开。/,
  );
  assert.match(quickConfigDialogContent, /打开文档/);
  assert.match(quickConfigDialogContent, /打开绑定/);
  assert.match(quickConfigDialogContent, /打开高级配置/);
});

test("agents polish keeps mobile action groups stacked for thumb reach", () => {
  assert.match(
    styleContent,
    /@media \(max-width: 720px\)[\s\S]*\.agents-stage-tabs\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styleContent,
    /@media \(max-width: 720px\)[\s\S]*\.agent-rail-list\s*\{[\s\S]*max-height:/,
  );
  assert.match(
    styleContent,
    /@media \(max-width: 960px\)[\s\S]*\.agents-workspace-shell[\s\S]*grid-template-columns:\s*1fr/,
  );
  assert.match(
    styleContent,
    /\.agents-stage-header__actions\s*\{[\s\S]*justify-content:\s*flex-end;/,
  );
  assert.match(styleContent, /\.agents-stage-tabs/);
  assert.match(styleContent, /\.agent-rail-item/);
});
