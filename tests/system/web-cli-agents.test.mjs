import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, "../..");
const read = (relative) => readFileSync(path.join(rootDir, relative), "utf8");

test("CLI Agents page keeps a focused workbench view set", () => {
  const page = read("apps/web/src/features/cli-agents/CliAgentsPage.tsx");
  const types = read("apps/web/src/features/cli-agents/types.ts");

  assert.match(types, /"overview",\s*\n\s*"runs",\s*\n\s*"cli",\s*\n\s*"evidence"/);
  assert.match(page, /label: "运行台"/);
  assert.match(page, /label: "启动台"/);
  assert.match(page, /label: "证据索引"/);
  assert.doesNotMatch(page, /Persona|OpenClaw generic|通用频道 CRUD/);
});

test("Runs view is table-first and only exposes proven terminal controls", () => {
  const source = read("apps/web/src/features/cli-agents/views/RunsView.tsx");

  assert.match(source, /TableHeader/);
  assert.match(source, /FILTERS/);
  assert.match(source, /run\.canStop/);
  assert.match(source, /run\.canDelete/);
  assert.match(source, /DialogTitle>停止 Agent 终端会话/);
  assert.match(source, /DialogTitle>删除终端会话记录/);
  assert.match(source, /useEndTerminalSessionMutation/);
  assert.match(source, /useDeleteTerminalSessionMutation/);
  assert.doesNotMatch(source, /grid-cols-3.*card/i);
});

test("CLI Runtime view owns launch handoff but not provider or IM editing", () => {
  const source = read("apps/web/src/features/cli-agents/views/CliRuntimeView.tsx");

  assert.match(source, /Agent CLI 启动台/);
  assert.match(source, /useLaunchTerminalMutation/);
  assert.match(source, /解析启动命令/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /window\.location\.hash = "#\/ide"/);
  assert.match(source, /window\.location\.hash = "#\/model-gateway"/);
  assert.match(source, /不自动写 shell/);
  assert.doesNotMatch(source, /apiKey|secret|botId|绑定路由/);
});

test("Overview describes boundaries instead of duplicating Gateway or IM management", () => {
  const source = read("apps/web/src/features/cli-agents/views/OverviewView.tsx");

  assert.match(source, /核心只做三件事/);
  assert.match(source, /职责边界/);
  assert.match(source, /Model Gateway/);
  assert.match(source, /IM Channels/);
  assert.doesNotMatch(source, /删除平台账号|Provider 新建|保存并重启/);
});
